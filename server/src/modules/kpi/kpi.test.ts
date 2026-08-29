import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { creerApp } from "../../app.js";
import { definirNiveauJournal } from "../../http/journal.js";
import { dependancesTest } from "../../test-utils/dependancesTest.js";
import { creerDepotMemoire, type DepotMemoire } from "../../test-utils/depotMemoire.js";
import { creerDepotKpiMemoire, type DepotKpiMemoire } from "../../test-utils/depotKpiMemoire.js";

/**
 * `GET /api/tableau-de-bord`, de bout en bout en HTTP.
 *
 * Le calcul lui-même est couvert par `domaine/kpi.test.ts` sur les cas de
 * référence du §8. Ici on vérifie le transport : lecture des paramètres,
 * bornes de période, forme de la réponse, et ce qui se passe quand il n'y a
 * rien à afficher.
 */

const MOT_DE_PASSE = "correct-cheval-pile-agrafe";

let depotAuth: DepotMemoire;
let depotKpi: DepotKpiMemoire;
let app: ReturnType<typeof creerApp>;
let cookie: string;

beforeAll(() => definirNiveauJournal("silence"));
afterAll(() => definirNiveauJournal("info"));

beforeEach(async () => {
  depotAuth = creerDepotMemoire();
  depotKpi = creerDepotKpiMemoire();
  app = creerApp(dependancesTest({ depotAuth, depotKpi }));

  const inscription = await request(app)
    .post("/api/inscription")
    .send({
      entreprise: { nom: "Boulangerie Martin", secteur: "commerce_detail" },
      utilisateur: { nom: "Awa", email: "awa@exemple.fr", mot_de_passe: MOT_DE_PASSE },
    });

  const entete = inscription.headers["set-cookie"];
  const premier = Array.isArray(entete) ? entete[0] : entete;
  cookie = String(premier ?? "").split(";")[0] ?? "";
});

function vente(date: string, montant: number, moyen: string | null = null) {
  return {
    effectuee_le: new Date(date),
    montant_total_mineur: BigInt(montant),
    moyen_paiement: moyen as never,
  };
}

const tableau = (requete = "") =>
  request(app).get(`/api/tableau-de-bord${requete}`).set("Cookie", cookie);

describe("accès", () => {
  it("exige une session", async () => {
    const reponse = await request(app).get("/api/tableau-de-bord");
    expect(reponse.status).toBe(401);
    expect(reponse.body.erreur.code).toBe("NON_AUTHENTIFIE");
  });
});

describe("tableau de bord vide", () => {
  it("répond 200 — un compte neuf n'est pas une erreur", async () => {
    const reponse = await tableau();

    expect(reponse.status).toBe(200);
    expect(reponse.body.kpi.chiffre_affaires.valeur).toBe(0);
    // Non calculable, pas zéro : afficher « 0 € » ferait croire à des ventes
    // à zéro euro.
    expect(reponse.body.kpi.panier_moyen.valeur).toBeNull();
    expect(reponse.body.kpi.marge_pourcent.valeur).toBeNull();
    expect(reponse.body.meilleur_jour_semaine).toBeNull();
  });

  it("rend quand même la série complète du mois", async () => {
    const reponse = await tableau("?periode=mois&reference=2026-05-15");
    expect(reponse.body.serie_ca_par_jour).toHaveLength(31);
    expect(reponse.body.serie_ca_par_jour.every((p: { ca: number }) => p.ca === 0)).toBe(true);
  });
});

describe("période", () => {
  it("prend le mois en cours par défaut", async () => {
    const reponse = await tableau();
    expect(reponse.body.periode.cle).toBe("mois");
    expect(reponse.body.periode.en_cours).toBe(true);
  });

  it("cible la période qui CONTIENT la date de référence", async () => {
    const reponse = await tableau("?periode=mois&reference=2026-05-15");

    expect(reponse.body.periode.debut_local).toBe("2026-05-01");
    expect(reponse.body.periode.fin_local).toBe("2026-05-31");
    expect(reponse.body.periode.en_cours).toBe(false);
  });

  it("rend les bornes en UTC et en local", async () => {
    const reponse = await tableau("?periode=mois&reference=2026-05-15");

    expect(reponse.body.periode.debut).toBe("2026-04-30T22:00:00.000Z");
    expect(reponse.body.periode.fin).toBe("2026-05-31T22:00:00.000Z");
    expect(reponse.body.periode.fuseau).toBe("Europe/Paris");
  });

  it("accepte chaque période nommée", async () => {
    for (const cle of ["jour", "semaine", "mois", "trimestre", "annee"]) {
      const reponse = await tableau(`?periode=${cle}&reference=2026-05-15`);
      expect(reponse.status).toBe(200);
      expect(reponse.body.periode.cle).toBe(cle);
    }
  });

  it("accepte une période personnalisée, bornes incluses", async () => {
    const reponse = await tableau("?periode=personnalisee&du=2026-05-03&au=2026-05-09");

    expect(reponse.status).toBe(200);
    expect(reponse.body.periode.debut_local).toBe("2026-05-03");
    expect(reponse.body.periode.fin_local).toBe("2026-05-09");
    expect(reponse.body.serie_ca_par_jour).toHaveLength(7);
  });

  it("refuse une période personnalisée sans bornes", async () => {
    const reponse = await tableau("?periode=personnalisee");
    expect(reponse.status).toBe(400);
    expect(reponse.body.erreur.code).toBe("VALIDATION");
  });

  it("refuse une période inconnue ou une date illisible", async () => {
    expect((await tableau("?periode=decennie")).status).toBe(400);
    expect((await tableau("?reference=15/05/2026")).status).toBe(400);
    expect((await tableau("?periode=mois&reference=2026-02-31")).status).toBe(400);
  });

  it("refuse une période démesurée", async () => {
    const reponse = await tableau("?periode=personnalisee&du=2000-01-01&au=2026-01-01");
    expect(reponse.status).toBe(400);
  });
});

describe("indicateurs", () => {
  beforeEach(() => {
    // 12 ventes de 287,50 € en mai, une dépense de 890,00 € : le cas A du §8.
    for (let i = 0; i < 12; i += 1) {
      depotKpi.ajouterVente(vente("2026-05-15T10:00:00Z", 28750, "CARTE"));
    }
    depotKpi.ajouterDepense({
      effectuee_le: new Date("2026-05-20T10:00:00Z"),
      montant_mineur: 89000n,
      categorie_id: null,
    });
  });

  it("rend le cas A du §8 au centime", async () => {
    const reponse = await tableau("?periode=mois&reference=2026-05-15");

    expect(reponse.body.kpi.chiffre_affaires.valeur).toBe(345000);
    expect(reponse.body.kpi.depenses_totales.valeur).toBe(89000);
    expect(reponse.body.kpi.benefice.valeur).toBe(256000);
    expect(reponse.body.kpi.panier_moyen.valeur).toBe(28750);
    expect(reponse.body.kpi.marge_pourcent.valeur).toBe(742);
    expect(reponse.body.kpi.nombre_ventes.valeur).toBe(12);
  });

  it("transporte la devise résolue avec le résultat", async () => {
    const reponse = await tableau();
    expect(reponse.body.devise).toEqual({ code: "EUR", decimales: 2 });
  });

  it("normalise les répartitions à exactement 100,0 %", async () => {
    const reponse = await tableau("?periode=mois&reference=2026-05-15");

    const sommePaiements = reponse.body.ca_par_moyen_paiement.reduce(
      (t: number, p: { part_dixiemes: number }) => t + p.part_dixiemes,
      0,
    );
    expect(sommePaiements).toBe(1000);
  });

  it("place les ventes au bon jour dans la série", async () => {
    const reponse = await tableau("?periode=mois&reference=2026-05-15");
    const jour = reponse.body.serie_ca_par_jour.find(
      (p: { date_locale: string }) => p.date_locale === "2026-05-15",
    );

    expect(jour.ca).toBe(345000);
    expect(jour.nombre_ventes).toBe(12);
  });
});

describe("comparaison", () => {
  it("compare un mois terminé au mois précédent entier", async () => {
    depotKpi.ajouterVente(vente("2026-05-10T10:00:00Z", 120000));
    depotKpi.ajouterVente(vente("2026-04-10T10:00:00Z", 100000));

    const reponse = await tableau("?periode=mois&reference=2026-05-15");

    expect(reponse.body.comparaison.debut_local).toBe("2026-04-01");
    expect(reponse.body.comparaison.fin_local).toBe("2026-04-30");
    expect(reponse.body.comparaison.a_date).toBe(false);
    expect(reponse.body.kpi.chiffre_affaires.evolution_pourcent).toBe(200); // +20,0 %
  });

  it("annonce « base nulle » plutôt qu'une évolution imaginaire", async () => {
    depotKpi.ajouterVente(vente("2026-05-10T10:00:00Z", 120000));

    const reponse = await tableau("?periode=mois&reference=2026-05-15");

    expect(reponse.body.kpi.chiffre_affaires.evolution_pourcent).toBeNull();
    expect(reponse.body.kpi.chiffre_affaires.base_nulle).toBe(true);
  });
});

describe("isolation", () => {
  it("ne calcule que sur l'entreprise de la session", async () => {
    // Le dépôt reçoit l'identifiant d'entreprise du contexte de session, jamais
    // un identifiant fourni par le client : aucun paramètre ne permet de viser
    // une autre entreprise.
    const reponse = await tableau("?periode=mois&entreprise_id=nimporte-quoi");
    expect(reponse.status).toBe(200);
  });
});
