import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { margePourcent } from "@bizly/shared";
import { creerApp } from "../../app.js";
import type { EtatBase } from "../../db/sonde.js";
import { definirNiveauJournal } from "../../http/journal.js";
import { creerDepotCatalogueMemoire } from "../../test-utils/depotCatalogueMemoire.js";
import { creerDepotKpiMemoire } from "../../test-utils/depotKpiMemoire.js";
import { creerDepotMemoire, type DepotMemoire } from "../../test-utils/depotMemoire.js";
import { creerDepotOperationsMemoire } from "../../test-utils/depotOperationsMemoire.js";
import { creerServiceAuth } from "../auth/service.js";
import { creerServiceOperations } from "../operations/service.js";

/**
 * Catalogue de produits et fichier clients, de bout en bout en HTTP.
 *
 * L'accent est mis sur ce qui débloque le moteur de questions : un coût qui
 * peut légitimement manquer, et un rattachement produit / client qui ne doit
 * jamais franchir la frontière d'une entreprise.
 */

const MOT_DE_PASSE = "correct-cheval-pile-agrafe";

let app: ReturnType<typeof creerApp>;
let depotAuth: DepotMemoire;

beforeAll(() => definirNiveauJournal("silence"));
afterAll(() => definirNiveauJournal("info"));

beforeEach(() => {
  depotAuth = creerDepotMemoire();
  const depotCatalogue = creerDepotCatalogueMemoire();
  app = creerApp({
    sonderBase: async (): Promise<EtatBase> => ({ statut: "ok", latence_ms: 1 }),
    serviceAuth: creerServiceAuth({ depot: depotAuth }),
    serviceOperations: creerServiceOperations(creerDepotOperationsMemoire(), depotCatalogue),
    depotKpi: creerDepotKpiMemoire(),
    depotCatalogue,
    version: "0.1.0-test",
    demarreLe: Date.now(),
    production: false,
    racinePublic: null,
  });
});

async function inscrire(suffixe = "a"): Promise<string> {
  const reponse = await request(app)
    .post("/api/inscription")
    .send({
      entreprise: { nom: `Entreprise ${suffixe}`, secteur: "commerce_detail" },
      utilisateur: { nom: "Testeur", email: `${suffixe}@exemple.fr`, mot_de_passe: MOT_DE_PASSE },
    });

  const entete = reponse.headers["set-cookie"];
  const premier = Array.isArray(entete) ? entete[0] : entete;
  return String(premier ?? "").split(";")[0] ?? "";
}

describe("accès", () => {
  it("refuse produits et clients sans session", async () => {
    for (const chemin of ["/api/produits", "/api/clients"]) {
      expect((await request(app).get(chemin)).status).toBe(401);
    }
  });
});

describe("produits", () => {
  let cookie: string;
  beforeEach(async () => {
    cookie = await inscrire();
  });

  it("crée un produit avec son coût", async () => {
    const reponse = await request(app)
      .post("/api/produits")
      .set("Cookie", cookie)
      .send({ nom: "T-shirt", categorie: "Vêtements", prix_mineur: 2000, cout_mineur: 800 });

    expect(reponse.status).toBe(201);
    expect(reponse.body).toMatchObject({
      nom: "T-shirt",
      categorie: "Vêtements",
      prix_mineur: 2000,
      cout_mineur: 800,
    });
  });

  it("accepte un produit SANS coût, et le rend explicitement null", async () => {
    // Le null est signifiant : le produit sera exclu des classements de
    // rentabilité, plutôt que de recevoir une marge inventée.
    const reponse = await request(app)
      .post("/api/produits")
      .set("Cookie", cookie)
      .send({ nom: "Pull", prix_mineur: 4500 });

    expect(reponse.status).toBe(201);
    expect(reponse.body.cout_mineur).toBeNull();
    expect(margePourcent(reponse.body)).toBeNull();
  });

  it("calcule les marges du cas de référence métier", () => {
    // §3.6 : la marge porte sur le prix du CATALOGUE.
    const base = { id: "x", categorie: null, cree_le: "" };
    expect(margePourcent({ ...base, nom: "T-shirt", prix_mineur: 2000, cout_mineur: 800 })).toBe(600);
    expect(margePourcent({ ...base, nom: "Casquette", prix_mineur: 1500, cout_mineur: 500 })).toBe(667);
    expect(margePourcent({ ...base, nom: "Sac", prix_mineur: 3500, cout_mineur: 1500 })).toBe(571);
    expect(margePourcent({ ...base, nom: "Pull", prix_mineur: 4500, cout_mineur: null })).toBeNull();
  });

  it("refuse un nom déjà pris, quelle que soit la casse", async () => {
    // Deux fiches « T-shirt » scinderaient les classements en deux.
    await request(app).post("/api/produits").set("Cookie", cookie)
      .send({ nom: "T-shirt", prix_mineur: 2000 });

    const doublon = await request(app).post("/api/produits").set("Cookie", cookie)
      .send({ nom: "  t-SHIRT ", prix_mineur: 2500 });

    expect(doublon.status).toBe(409);
    expect(doublon.body.erreur.code).toBe("CONFLIT");
  });

  it("laisse deux entreprises utiliser le même nom", async () => {
    const autre = await inscrire("b");

    await request(app).post("/api/produits").set("Cookie", cookie)
      .send({ nom: "T-shirt", prix_mineur: 2000 });
    const chezB = await request(app).post("/api/produits").set("Cookie", autre)
      .send({ nom: "T-shirt", prix_mineur: 2000 });

    expect(chezB.status).toBe(201);
  });

  it("refuse un prix ou un coût négatif, et un montant décimal", async () => {
    for (const corps of [
      { nom: "A", prix_mineur: -1 },
      { nom: "B", prix_mineur: 100, cout_mineur: -5 },
      { nom: "C", prix_mineur: 20.5 },
      { nom: "", prix_mineur: 100 },
    ]) {
      expect((await request(app).post("/api/produits").set("Cookie", cookie).send(corps)).status).toBe(400);
    }
  });

  it("modifie, et permet d'effacer un coût déjà renseigné", async () => {
    const cree = await request(app).post("/api/produits").set("Cookie", cookie)
      .send({ nom: "T-shirt", prix_mineur: 2000, cout_mineur: 800 });

    const efface = await request(app).patch(`/api/produits/${cree.body.id}`).set("Cookie", cookie)
      .send({ cout_mineur: null });

    expect(efface.body.cout_mineur).toBeNull();
    expect(efface.body.prix_mineur).toBe(2000);
  });

  it("supprime en douceur puis répond 404", async () => {
    const cree = await request(app).post("/api/produits").set("Cookie", cookie)
      .send({ nom: "T-shirt", prix_mineur: 2000 });

    expect((await request(app).delete(`/api/produits/${cree.body.id}`).set("Cookie", cookie)).status).toBe(204);
    expect((await request(app).get(`/api/produits/${cree.body.id}`).set("Cookie", cookie)).status).toBe(404);
  });

  it("libère le nom après suppression", async () => {
    const cree = await request(app).post("/api/produits").set("Cookie", cookie)
      .send({ nom: "T-shirt", prix_mineur: 2000 });
    await request(app).delete(`/api/produits/${cree.body.id}`).set("Cookie", cookie);

    const recree = await request(app).post("/api/produits").set("Cookie", cookie)
      .send({ nom: "T-shirt", prix_mineur: 2500 });
    expect(recree.status).toBe(201);
  });

  it("filtre par recherche et par catégorie", async () => {
    for (const [nom, categorie] of [["T-shirt", "Vêtements"], ["Casquette", "Accessoires"], ["Sac", "Accessoires"]]) {
      await request(app).post("/api/produits").set("Cookie", cookie)
        .send({ nom, categorie, prix_mineur: 1000 });
    }

    expect((await request(app).get("/api/produits?recherche=sac").set("Cookie", cookie)).body.total).toBe(1);
    expect((await request(app).get("/api/produits?categorie=Accessoires").set("Cookie", cookie)).body.total).toBe(2);
  });
});

describe("clients", () => {
  let cookie: string;
  beforeEach(async () => {
    cookie = await inscrire();
  });

  it("crée un client avec son seul nom", async () => {
    const reponse = await request(app).post("/api/clients").set("Cookie", cookie)
      .send({ nom: "Awa Diop" });

    expect(reponse.status).toBe(201);
    expect(reponse.body.nom).toBe("Awa Diop");
    // `cree_le` est le `created_at` de la spécification métier : il servira à
    // compter les nouveaux clients d'une période.
    expect(typeof reponse.body.cree_le).toBe("string");
  });

  it("accepte les coordonnées facultatives", async () => {
    const reponse = await request(app).post("/api/clients").set("Cookie", cookie)
      .send({ nom: "Fatou Sarr", email: "fatou@exemple.fr", telephone: "+221 77 000 00 00" });

    expect(reponse.body.email).toBe("fatou@exemple.fr");
    expect(reponse.body.telephone).toBe("+221 77 000 00 00");
  });

  it("refuse un nom vide", async () => {
    expect((await request(app).post("/api/clients").set("Cookie", cookie).send({ nom: "  " })).status).toBe(400);
  });

  it("autorise deux clients homonymes", async () => {
    // Deux « Awa Diop » différentes existent ; imposer l'unicité empêcherait
    // d'enregistrer la seconde.
    await request(app).post("/api/clients").set("Cookie", cookie).send({ nom: "Awa Diop" });
    const seconde = await request(app).post("/api/clients").set("Cookie", cookie).send({ nom: "Awa Diop" });
    expect(seconde.status).toBe(201);
  });

  it("supprime en douceur", async () => {
    const cree = await request(app).post("/api/clients").set("Cookie", cookie).send({ nom: "Awa Diop" });

    expect((await request(app).delete(`/api/clients/${cree.body.id}`).set("Cookie", cookie)).status).toBe(204);
    expect((await request(app).get(`/api/clients/${cree.body.id}`).set("Cookie", cookie)).status).toBe(404);
  });
});

describe("ventes rattachées au catalogue", () => {
  let cookie: string;
  let produitId: string;
  let clientId: string;

  beforeEach(async () => {
    cookie = await inscrire();
    produitId = (
      await request(app).post("/api/produits").set("Cookie", cookie)
        .send({ nom: "T-shirt", categorie: "Vêtements", prix_mineur: 2000, cout_mineur: 800 })
    ).body.id;
    clientId = (
      await request(app).post("/api/clients").set("Cookie", cookie).send({ nom: "Awa Diop" })
    ).body.id;
  });

  it("recopie nom et prix du catalogue quand seul le produit est donné", async () => {
    const reponse = await request(app).post("/api/ventes").set("Cookie", cookie).send({
      effectuee_le: "2026-08-02",
      lignes: [{ produit_id: produitId, quantite: "2" }],
    });

    expect(reponse.status).toBe(201);
    expect(reponse.body.lignes[0]).toMatchObject({
      produit_id: produitId,
      libelle: "T-shirt",
      prix_unitaire_mineur: 2000,
      montant_mineur: 4000,
    });
    expect(reponse.body.montant_total_mineur).toBe(4000);
  });

  it("laisse forcer un prix — une remise ne modifie pas le catalogue", async () => {
    const reponse = await request(app).post("/api/ventes").set("Cookie", cookie).send({
      effectuee_le: "2026-08-02",
      lignes: [{ produit_id: produitId, quantite: "1", prix_unitaire_mineur: 1200 }],
    });

    expect(reponse.body.lignes[0].prix_unitaire_mineur).toBe(1200);

    const catalogue = await request(app).get(`/api/produits/${produitId}`).set("Cookie", cookie);
    expect(catalogue.body.prix_mineur).toBe(2000);
  });

  it("le libellé est une PHOTOGRAPHIE : renommer le produit ne réécrit pas l'historique", async () => {
    const vente = await request(app).post("/api/ventes").set("Cookie", cookie).send({
      effectuee_le: "2026-08-02",
      lignes: [{ produit_id: produitId, quantite: "1" }],
    });

    await request(app).patch(`/api/produits/${produitId}`).set("Cookie", cookie)
      .send({ nom: "T-shirt coton bio", prix_mineur: 2500 });

    const relue = await request(app).get(`/api/ventes/${vente.body.id}`).set("Cookie", cookie);
    expect(relue.body.lignes[0].libelle).toBe("T-shirt");
    expect(relue.body.lignes[0].prix_unitaire_mineur).toBe(2000);
    // Le lien vers le produit demeure : les regroupements restent justes.
    expect(relue.body.lignes[0].produit_id).toBe(produitId);
  });

  it("accepte une ligne hors catalogue, sans produit", async () => {
    const reponse = await request(app).post("/api/ventes").set("Cookie", cookie).send({
      effectuee_le: "2026-08-02",
      lignes: [{ libelle: "Retouche", quantite: "1", prix_unitaire_mineur: 500 }],
    });

    expect(reponse.status).toBe(201);
    expect(reponse.body.lignes[0].produit_id).toBeNull();
    expect(reponse.body.lignes[0].libelle).toBe("Retouche");
  });

  it("refuse une ligne sans produit ni libellé", async () => {
    const reponse = await request(app).post("/api/ventes").set("Cookie", cookie).send({
      effectuee_le: "2026-08-02",
      lignes: [{ quantite: "1", prix_unitaire_mineur: 500 }],
    });
    expect(reponse.status).toBe(400);
  });

  it("rattache un client et le rend résolu", async () => {
    const reponse = await request(app).post("/api/ventes").set("Cookie", cookie).send({
      effectuee_le: "2026-08-02",
      client_id: clientId,
      montant_total_mineur: 4000,
    });

    expect(reponse.status).toBe(201);
    expect(reponse.body.client).toEqual({ id: clientId, nom: "Client de test" });
  });

  it("accepte une vente anonyme", async () => {
    const reponse = await request(app).post("/api/ventes").set("Cookie", cookie)
      .send({ effectuee_le: "2026-08-02", montant_total_mineur: 2000 });

    expect(reponse.body.client).toBeNull();
  });

  it("ISOLATION : refuse le produit d'une autre entreprise en 400", async () => {
    const autre = await inscrire("b");
    const produitB = (
      await request(app).post("/api/produits").set("Cookie", autre)
        .send({ nom: "Article de B", prix_mineur: 900 })
    ).body.id;

    const vol = await request(app).post("/api/ventes").set("Cookie", cookie).send({
      effectuee_le: "2026-08-02",
      lignes: [{ produit_id: produitB, quantite: "1" }],
    });

    // 400 et non 404 : c'est un champ du corps qui est invalide, l'appelant a
    // fourni la valeur lui-même.
    expect(vol.status).toBe(400);
    expect(vol.body.erreur.details.champs[0].champ).toBe("lignes.produit_id");
  });

  it("ISOLATION : refuse le client d'une autre entreprise en 400", async () => {
    const autre = await inscrire("b");
    const clientB = (
      await request(app).post("/api/clients").set("Cookie", autre).send({ nom: "Client de B" })
    ).body.id;

    const vol = await request(app).post("/api/ventes").set("Cookie", cookie)
      .send({ effectuee_le: "2026-08-02", client_id: clientB, montant_total_mineur: 1000 });

    expect(vol.status).toBe(400);
    expect(vol.body.erreur.details.champs[0].champ).toBe("client_id");
  });

  it("ISOLATION : une entreprise ne voit pas le catalogue d'une autre", async () => {
    const autre = await inscrire("b");
    const liste = await request(app).get("/api/produits").set("Cookie", autre);
    expect(liste.body.total).toBe(0);
  });

  it("filtre les ventes par client", async () => {
    await request(app).post("/api/ventes").set("Cookie", cookie)
      .send({ effectuee_le: "2026-08-02", client_id: clientId, montant_total_mineur: 4000 });
    await request(app).post("/api/ventes").set("Cookie", cookie)
      .send({ effectuee_le: "2026-08-03", montant_total_mineur: 2000 });

    const filtrees = await request(app).get(`/api/ventes?client_id=${clientId}`).set("Cookie", cookie);
    expect(filtrees.body.total).toBe(1);
    expect(filtrees.body.elements[0].montant_total_mineur).toBe(4000);
  });
});
