import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { creerApp } from "../../app.js";
import type { EtatBase } from "../../db/sonde.js";
import { definirNiveauJournal } from "../../http/journal.js";
import { creerDepotCatalogueMemoire } from "../../test-utils/depotCatalogueMemoire.js";
import { creerDepotKpiMemoire } from "../../test-utils/depotKpiMemoire.js";
import { creerDepotMemoire, type DepotMemoire } from "../../test-utils/depotMemoire.js";
import { creerDepotOperationsMemoire } from "../../test-utils/depotOperationsMemoire.js";
import {
  clientAgrege,
  creerDepotQuestionsMemoire,
  produitAgrege,
  type DepotQuestionsMemoire,
} from "../../test-utils/depotQuestionsMemoire.js";
import { creerServiceAuth } from "../auth/service.js";
import { creerServiceOperations } from "../operations/service.js";

/**
 * `GET /api/questions`, de bout en bout en HTTP.
 *
 * Le calcul est couvert par `domaine/questions.test.ts` sur le cas de référence.
 * Ici : accès, lecture des paramètres de période, forme de la réponse.
 */

const MOT_DE_PASSE = "correct-cheval-pile-agrafe";

let depotQuestions: DepotQuestionsMemoire;
let app: ReturnType<typeof creerApp>;
let cookie: string;

beforeAll(() => definirNiveauJournal("silence"));
afterAll(() => definirNiveauJournal("info"));

async function monter(secteur = "commerce_detail"): Promise<void> {
  const depotAuth: DepotMemoire = creerDepotMemoire();
  const depotCatalogue = creerDepotCatalogueMemoire();
  depotQuestions = creerDepotQuestionsMemoire();

  app = creerApp({
    sonderBase: async (): Promise<EtatBase> => ({ statut: "ok", latence_ms: 1 }),
    serviceAuth: creerServiceAuth({ depot: depotAuth }),
    serviceOperations: creerServiceOperations(creerDepotOperationsMemoire(), depotCatalogue),
    depotKpi: creerDepotKpiMemoire(),
    depotCatalogue,
    depotQuestions,
    version: "0.1.0-test",
    demarreLe: Date.now(),
    production: false,
    racinePublic: null,
  });

  const inscription = await request(app)
    .post("/api/inscription")
    .send({
      entreprise: { nom: "Boutique Test", secteur },
      utilisateur: { nom: "Awa", email: "awa@exemple.fr", mot_de_passe: MOT_DE_PASSE },
    });

  const entete = inscription.headers["set-cookie"];
  const premier = Array.isArray(entete) ? entete[0] : entete;
  cookie = String(premier ?? "").split(";")[0] ?? "";
}

beforeEach(async () => {
  await monter();
});

const questions = (requete = "") =>
  request(app).get(`/api/questions${requete}`).set("Cookie", cookie);

describe("accès", () => {
  it("exige une session", async () => {
    expect((await request(app).get("/api/questions")).status).toBe(401);
  });
});

describe("réponse", () => {
  it("rend les 14 questions, même sur un compte neuf", async () => {
    const reponse = await questions();

    expect(reponse.status).toBe(200);
    expect(reponse.body.questions).toHaveLength(14);
    expect(reponse.body.devise).toEqual({ code: "EUR", decimales: 2 });
    expect(reponse.body.secteur).toBe("commerce_detail");
  });

  it("porte la période et sa comparaison, comme le tableau de bord", async () => {
    const reponse = await questions("?periode=personnalisee&du=2026-08-01&au=2026-08-15");

    expect(reponse.body.periode.debut_local).toBe("2026-08-01");
    expect(reponse.body.periode.fin_local).toBe("2026-08-15");
    expect(reponse.body.comparaison.debut_local).toBe("2026-07-17");
  });

  it("refuse une période invalide", async () => {
    expect((await questions("?periode=decennie")).status).toBe(400);
    expect((await questions("?periode=mois&reference=2026-02-31")).status).toBe(400);
  });
});

describe("avec des données", () => {
  beforeEach(() => {
    depotQuestions.definir({
      chiffreAffaires: 31500n,
      depenses: 37500n,
      nombreVentes: 10,
      chiffreAffairesPrecedent: 28000n,
      depensesPrecedentes: 26000n,
      nombreVentesPrecedent: 9,
      depensesParCategorie: new Map([["loyer", { libelle: "Loyer", montant: 20000n }]]),
      produits: [
        produitAgrege("Casquette", { prix: 1500n, cout: 500n, quantite: 5, ca: 7500n, categorie: "Accessoires" }),
        produitAgrege("Pull", { prix: 4500n, cout: null, quantite: 2, ca: 9000n, categorie: "Vêtements" }),
      ],
      clients: [
        clientAgrege("Awa Diop", { ca: 16500n, joursDepuisAchat: 14 }),
        clientAgrege("Ibrahima Ba", { ca: 0n, joursDepuisAchat: 118 }),
      ],
      nombreClientsTotal: 2,
    });
  });

  it("répond au cas de référence à travers HTTP", async () => {
    const reponse = await questions("?periode=personnalisee&du=2026-08-01&au=2026-08-15");
    const par = (id: string) => reponse.body.questions.find((q: { id: string }) => q.id === id);

    expect(par("combien_ai_je_gagne").indicateur.valeur).toBe(31500);
    expect(par("benefice_estime").indicateur.evolution_montant).toBe(-8000);
    expect(par("benefice_estime").indicateur.evolution_pourcent).toBeNull();
    expect(par("panier_moyen").indicateur.evolution_pourcent).toBe(13);
    expect(par("produit_le_plus_vendu").classement[0].libelle).toBe("Casquette");
    expect(par("produit_le_plus_de_ca").classement[0].libelle).toBe("Pull");
    expect(par("meilleurs_clients").classement[0].libelle).toBe("Awa Diop");
    expect(par("clients_inactifs").classement[0].valeur).toBe(118);
  });

  it("exclut le Pull du classement de rentabilité, faute de coût", async () => {
    const reponse = await questions();
    const q = reponse.body.questions.find((x: { id: string }) => x.id === "produit_le_plus_rentable");

    expect(q.classement.map((e: { libelle: string }) => e.libelle)).toEqual(["Casquette"]);
    expect(q.complements[1].valeur).toBe(1); // un produit exclu
  });
});

describe("vocabulaire sectoriel", () => {
  it("parle de plats pour un restaurant", async () => {
    await monter("restauration");
    const reponse = await questions();
    const q = reponse.body.questions.find((x: { id: string }) => x.id === "produit_le_plus_vendu");

    expect(q.question).toBe("Quel plat se vend le plus ?");
    expect(reponse.body.secteur).toBe("restauration");
  });

  it("parle de prestations pour un service professionnel", async () => {
    await monter("services_pro");
    const reponse = await questions();
    const q = reponse.body.questions.find((x: { id: string }) => x.id === "produit_le_plus_rentable");

    expect(q.question).toBe("Quelle prestation est la plus rentable ?");
  });
});
