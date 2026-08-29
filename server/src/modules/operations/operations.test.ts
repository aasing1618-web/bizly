import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { creerApp } from "../../app.js";
import { definirNiveauJournal } from "../../http/journal.js";
import { dependancesTest } from "../../test-utils/dependancesTest.js";
import { creerDepotMemoire, type DepotMemoire } from "../../test-utils/depotMemoire.js";
import {
  creerDepotOperationsMemoire,
  type DepotOperationsMemoire,
} from "../../test-utils/depotOperationsMemoire.js";
import { creerServiceOperations } from "./service.js";
import { creerDepotCatalogueMemoire } from "../../test-utils/depotCatalogueMemoire.js";

/**
 * Ventes et dépenses, de bout en bout en HTTP, sans Postgres.
 *
 * L'accent est mis sur ce qui coûte cher si c'est faux : le rattachement d'une
 * opération à un jour, l'arrondi des lignes, et l'isolation entre entreprises.
 */

const MOT_DE_PASSE = "correct-cheval-pile-agrafe";
const CATEGORIE_LOYER = "11111111-1111-4111-8111-111111111111";

let depotAuth: DepotMemoire;
let depotOps: DepotOperationsMemoire;
let depotCatalogue: ReturnType<typeof creerDepotCatalogueMemoire>;
let app: ReturnType<typeof creerApp>;

beforeAll(() => definirNiveauJournal("silence"));
afterAll(() => definirNiveauJournal("info"));

beforeEach(() => {
  depotAuth = creerDepotMemoire();
  depotOps = creerDepotOperationsMemoire();
  depotCatalogue = creerDepotCatalogueMemoire();
  app = creerApp(
    dependancesTest({
      depotAuth,
      depotCatalogue,
      serviceOperations: creerServiceOperations(depotOps, depotCatalogue),
    }),
  );
});

/** Inscrit une entreprise et rend son cookie de session. */
async function inscrire(suffixe = "a", fuseau = "Europe/Paris"): Promise<string> {
  const reponse = await request(app)
    .post("/api/inscription")
    .send({
      entreprise: { nom: `Entreprise ${suffixe}`, secteur: "commerce_detail", fuseau },
      utilisateur: {
        nom: "Testeur",
        email: `${suffixe}@exemple.fr`,
        mot_de_passe: MOT_DE_PASSE,
      },
    });

  const entete = reponse.headers["set-cookie"];
  const premier = Array.isArray(entete) ? entete[0] : entete;
  return String(premier ?? "").split(";")[0] ?? "";
}

describe("accès", () => {
  it("refuse toutes les routes sans session", async () => {
    for (const [methode, chemin] of [
      ["get", "/api/ventes"],
      ["post", "/api/ventes"],
      ["get", "/api/depenses"],
      ["get", "/api/categories-depense"],
    ] as const) {
      const reponse = await request(app)[methode](chemin).send({});
      expect(reponse.status).toBe(401);
      expect(reponse.body.erreur.code).toBe("NON_AUTHENTIFIE");
    }
  });
});

describe("POST /api/ventes", () => {
  let cookie: string;
  beforeEach(async () => {
    cookie = await inscrire();
  });

  it("crée une vente à montant direct", async () => {
    const reponse = await request(app)
      .post("/api/ventes")
      .set("Cookie", cookie)
      .send({ effectuee_le: "2026-05-15", montant_total_mineur: 345000, moyen_paiement: "CARTE" });

    expect(reponse.status).toBe(201);
    expect(reponse.body.montant_total_mineur).toBe(345000);
    expect(reponse.body.statut).toBe("VALIDEE");
    expect(reponse.body.numero).toBe(1);
    expect(reponse.body.lignes).toEqual([]);
  });

  it("interprète une date nue comme minuit dans le fuseau de l'entreprise", async () => {
    const reponse = await request(app)
      .post("/api/ventes")
      .set("Cookie", cookie)
      .send({ effectuee_le: "2026-05-15", montant_total_mineur: 1000 });

    // 15 mai 00:00 à Paris = 14 mai 22:00 UTC. Le jour affiché reste le 15.
    expect(reponse.body.effectuee_le).toBe("2026-05-14T22:00:00.000Z");
    expect(reponse.body.date_locale).toBe("2026-05-15");
  });

  it("rattache une vente de fin de soirée au bon jour local", async () => {
    const reponse = await request(app)
      .post("/api/ventes")
      .set("Cookie", cookie)
      .send({ effectuee_le: "2026-05-31T22:30:00.000Z", montant_total_mineur: 50000 });

    // 22h30 UTC le 31 mai, c'est 00h30 le 1er juin à Paris : cette vente
    // appartient à juin, et le client doit le voir sans calculer quoi que ce soit.
    expect(reponse.body.date_locale).toBe("2026-06-01");
  });

  it("respecte un fuseau différent pour une autre entreprise", async () => {
    const cookieAbidjan = await inscrire("b", "Africa/Abidjan");

    const reponse = await request(app)
      .post("/api/ventes")
      .set("Cookie", cookieAbidjan)
      .send({ effectuee_le: "2026-05-15", montant_total_mineur: 1000 });

    // Abidjan est à UTC : minuit local est minuit UTC.
    expect(reponse.body.effectuee_le).toBe("2026-05-15T00:00:00.000Z");
    expect(reponse.body.date_locale).toBe("2026-05-15");
  });

  it("numérote les ventes de façon croissante", async () => {
    for (const attendu of [1, 2, 3]) {
      const reponse = await request(app)
        .post("/api/ventes")
        .set("Cookie", cookie)
        .send({ effectuee_le: "2026-05-15", montant_total_mineur: 1000 });
      expect(reponse.body.numero).toBe(attendu);
    }
  });

  it("numérote indépendamment dans chaque entreprise", async () => {
    const autre = await inscrire("b");

    await request(app).post("/api/ventes").set("Cookie", cookie)
      .send({ effectuee_le: "2026-05-15", montant_total_mineur: 1000 });
    const premiereAutre = await request(app).post("/api/ventes").set("Cookie", autre)
      .send({ effectuee_le: "2026-05-15", montant_total_mineur: 1000 });

    expect(premiereAutre.body.numero).toBe(1);
  });

  describe("lignes", () => {
    it("calcule le montant de chaque ligne et le total", async () => {
      const reponse = await request(app)
        .post("/api/ventes")
        .set("Cookie", cookie)
        .send({
          effectuee_le: "2026-05-15",
          lignes: [
            { libelle: "Baguette", quantite: "12", prix_unitaire_mineur: 110 },
            { libelle: "Croissant", quantite: "3", prix_unitaire_mineur: 130 },
          ],
        });

      expect(reponse.status).toBe(201);
      expect(reponse.body.lignes[0].montant_mineur).toBe(1320); // 12 × 1,10 €
      expect(reponse.body.lignes[1].montant_mineur).toBe(390); //  3 × 1,30 €
      expect(reponse.body.montant_total_mineur).toBe(1710);
      expect(reponse.body.nombre_lignes).toBe(2);
    });

    it("arrondit selon la règle commerciale, pas l'arrondi bancaire", async () => {
      // 0,5 × 5,01 € = 2,505 € → 2,51 € en s'éloignant de zéro.
      // L'arrondi bancaire donnerait 2,50 €.
      const reponse = await request(app)
        .post("/api/ventes")
        .set("Cookie", cookie)
        .send({
          effectuee_le: "2026-05-15",
          lignes: [{ libelle: "Vrac", quantite: "0.5", prix_unitaire_mineur: 501 }],
        });

      expect(reponse.body.lignes[0].montant_mineur).toBe(251);
    });

    it("gère une quantité à trois décimales", async () => {
      // 1,234 kg à 9,99 €/kg = 12,32766 € → 12,33 €.
      const reponse = await request(app)
        .post("/api/ventes")
        .set("Cookie", cookie)
        .send({
          effectuee_le: "2026-05-15",
          lignes: [{ libelle: "Fromage", quantite: "1.234", prix_unitaire_mineur: 999 }],
        });

      expect(reponse.body.lignes[0].montant_mineur).toBe(1233);
      expect(reponse.body.lignes[0].quantite).toBe("1.234");
    });

    it("ignore le montant total envoyé quand des lignes sont fournies", async () => {
      // Une seule source de vérité : un total qui contredit son détail est un
      // bug qu'on ne veut pas pouvoir créer.
      const reponse = await request(app)
        .post("/api/ventes")
        .set("Cookie", cookie)
        .send({
          effectuee_le: "2026-05-15",
          montant_total_mineur: 999999,
          lignes: [{ libelle: "Baguette", quantite: "2", prix_unitaire_mineur: 110 }],
        });

      expect(reponse.body.montant_total_mineur).toBe(220);
    });

    it("refuse une quantité nulle, négative ou trop précise", async () => {
      for (const quantite of ["0", "-1", "1.2345", "abc", ""]) {
        const reponse = await request(app)
          .post("/api/ventes")
          .set("Cookie", cookie)
          .send({
            effectuee_le: "2026-05-15",
            lignes: [{ libelle: "X", quantite, prix_unitaire_mineur: 100 }],
          });
        expect(reponse.status).toBe(400);
      }
    });
  });

  describe("validation", () => {
    it("refuse un montant décimal — ce serait des euros pris pour des centimes", async () => {
      const reponse = await request(app)
        .post("/api/ventes")
        .set("Cookie", cookie)
        .send({ effectuee_le: "2026-05-15", montant_total_mineur: 3450.5 });

      expect(reponse.status).toBe(400);
      expect(reponse.body.erreur.code).toBe("VALIDATION");
    });

    it("refuse un montant négatif", async () => {
      const reponse = await request(app)
        .post("/api/ventes")
        .set("Cookie", cookie)
        .send({ effectuee_le: "2026-05-15", montant_total_mineur: -1 });
      expect(reponse.status).toBe(400);
    });

    it("refuse une date qui n'existe pas", async () => {
      const reponse = await request(app)
        .post("/api/ventes")
        .set("Cookie", cookie)
        .send({ effectuee_le: "2026-02-31", montant_total_mineur: 1000 });

      expect(reponse.status).toBe(400);
      expect(reponse.body.erreur.details.champs[0].champ).toBe("effectuee_le");
    });

    it("refuse un moyen de paiement inconnu", async () => {
      const reponse = await request(app)
        .post("/api/ventes")
        .set("Cookie", cookie)
        .send({ effectuee_le: "2026-05-15", montant_total_mineur: 1000, moyen_paiement: "BITCOIN" });
      expect(reponse.status).toBe(400);
    });

    it("exige un montant ou des lignes", async () => {
      const reponse = await request(app)
        .post("/api/ventes")
        .set("Cookie", cookie)
        .send({ effectuee_le: "2026-05-15" });
      expect(reponse.status).toBe(400);
    });
  });
});

describe("GET /api/ventes", () => {
  let cookie: string;

  beforeEach(async () => {
    cookie = await inscrire();
    const jeu: [string, number][] = [
      ["2026-05-01", 10000],
      ["2026-05-15", 20000],
      ["2026-05-31", 30000],
      ["2026-06-02", 40000],
    ];
    for (const [date, montant] of jeu) {
      await request(app).post("/api/ventes").set("Cookie", cookie)
        .send({ effectuee_le: date, montant_total_mineur: montant });
    }
  });

  it("rend la plus récente en premier", async () => {
    const reponse = await request(app).get("/api/ventes").set("Cookie", cookie);

    expect(reponse.status).toBe(200);
    expect(reponse.body.total).toBe(4);
    expect(reponse.body.elements[0].date_locale).toBe("2026-06-02");
  });

  it("filtre sur un intervalle dont les DEUX bornes sont incluses", async () => {
    // « du 1er au 31 mai » comprend le 31 : c'est ce qu'attend l'utilisateur,
    // même si le moteur travaille en [début, fin[.
    const reponse = await request(app)
      .get("/api/ventes?du=2026-05-01&au=2026-05-31")
      .set("Cookie", cookie);

    expect(reponse.body.total).toBe(3);
    expect(reponse.body.elements.map((v: { date_locale: string }) => v.date_locale)).toEqual([
      "2026-05-31",
      "2026-05-15",
      "2026-05-01",
    ]);
  });

  it("pagine sans mentir sur le total", async () => {
    const reponse = await request(app).get("/api/ventes?limite=2&decalage=1").set("Cookie", cookie);

    expect(reponse.body.elements).toHaveLength(2);
    // Le total décrit l'ensemble filtré, pas la page rendue.
    expect(reponse.body.total).toBe(4);
    expect(reponse.body.limite).toBe(2);
    expect(reponse.body.decalage).toBe(1);
  });

  it("refuse une limite hors bornes plutôt que de la rogner en silence", async () => {
    for (const limite of ["0", "201", "abc"]) {
      const reponse = await request(app).get(`/api/ventes?limite=${limite}`).set("Cookie", cookie);
      expect(reponse.status).toBe(400);
    }
  });

  it("refuse une date de filtre malformée", async () => {
    const reponse = await request(app).get("/api/ventes?du=01/05/2026").set("Cookie", cookie);
    expect(reponse.status).toBe(400);
  });
});

describe("modification et suppression", () => {
  let cookie: string;
  let venteId: string;

  beforeEach(async () => {
    cookie = await inscrire();
    const creee = await request(app).post("/api/ventes").set("Cookie", cookie)
      .send({ effectuee_le: "2026-05-15", montant_total_mineur: 10000, note: "à vérifier" });
    venteId = creee.body.id;
  });

  it("ne modifie que les champs envoyés", async () => {
    const reponse = await request(app)
      .patch(`/api/ventes/${venteId}`)
      .set("Cookie", cookie)
      .send({ montant_total_mineur: 12500 });

    expect(reponse.status).toBe(200);
    expect(reponse.body.montant_total_mineur).toBe(12500);
    expect(reponse.body.note).toBe("à vérifier");
    expect(reponse.body.date_locale).toBe("2026-05-15");
  });

  it("distingue « champ absent » de « champ à null »", async () => {
    const reponse = await request(app)
      .patch(`/api/ventes/${venteId}`)
      .set("Cookie", cookie)
      .send({ note: null });

    expect(reponse.body.note).toBeNull();
    expect(reponse.body.montant_total_mineur).toBe(10000);
  });

  it("remplace intégralement les lignes et recalcule le total", async () => {
    await request(app).patch(`/api/ventes/${venteId}`).set("Cookie", cookie).send({
      lignes: [
        { libelle: "A", quantite: "2", prix_unitaire_mineur: 500 },
        { libelle: "B", quantite: "1", prix_unitaire_mineur: 250 },
      ],
    });

    const remplacee = await request(app).patch(`/api/ventes/${venteId}`).set("Cookie", cookie).send({
      lignes: [{ libelle: "C", quantite: "1", prix_unitaire_mineur: 999 }],
    });

    expect(remplacee.body.lignes).toHaveLength(1);
    expect(remplacee.body.lignes[0].libelle).toBe("C");
    expect(remplacee.body.montant_total_mineur).toBe(999);
  });

  it("refuse un corps de modification vide", async () => {
    const reponse = await request(app).patch(`/api/ventes/${venteId}`).set("Cookie", cookie).send({});
    expect(reponse.status).toBe(400);
  });

  it("supprime, puis répond 404 à toute nouvelle demande", async () => {
    expect((await request(app).delete(`/api/ventes/${venteId}`).set("Cookie", cookie)).status).toBe(204);

    // Une ressource supprimée est invisible, y compris pour la supprimer encore.
    expect((await request(app).get(`/api/ventes/${venteId}`).set("Cookie", cookie)).status).toBe(404);
    expect((await request(app).delete(`/api/ventes/${venteId}`).set("Cookie", cookie)).status).toBe(404);
    expect((await request(app).patch(`/api/ventes/${venteId}`).set("Cookie", cookie).send({ note: "x" })).status).toBe(404);
  });

  it("fait disparaître la vente supprimée des listes", async () => {
    await request(app).delete(`/api/ventes/${venteId}`).set("Cookie", cookie);
    const liste = await request(app).get("/api/ventes").set("Cookie", cookie);
    expect(liste.body.total).toBe(0);
  });

  it("répond 404 — et non 400 — sur un identifiant qui n'est pas un UUID", async () => {
    // Sinon la différence de code révélerait qu'un UUID bien formé « existe
    // quelque part », même dans une autre entreprise.
    expect((await request(app).get("/api/ventes/abc").set("Cookie", cookie)).status).toBe(404);
  });
});

describe("ISOLATION entre entreprises", () => {
  it("ne montre jamais les ventes d'une autre entreprise", async () => {
    const cookieA = await inscrire("a");
    const cookieB = await inscrire("b");

    await request(app).post("/api/ventes").set("Cookie", cookieA)
      .send({ effectuee_le: "2026-05-15", montant_total_mineur: 10000 });

    const listeB = await request(app).get("/api/ventes").set("Cookie", cookieB);
    expect(listeB.body.total).toBe(0);
  });

  it("répond 404 sur la vente d'une autre entreprise, jamais 403", async () => {
    const cookieA = await inscrire("a");
    const cookieB = await inscrire("b");

    const venteA = await request(app).post("/api/ventes").set("Cookie", cookieA)
      .send({ effectuee_le: "2026-05-15", montant_total_mineur: 10000 });

    // 403 révélerait l'existence de la ressource. 404 est indistinguable d'un
    // identifiant inventé.
    for (const [methode, corps] of [["get", undefined], ["patch", { note: "vol" }], ["delete", undefined]] as const) {
      const requeteB = request(app)[methode](`/api/ventes/${venteA.body.id}`).set("Cookie", cookieB);
      const reponse = corps === undefined ? await requeteB : await requeteB.send(corps);
      expect(reponse.status).toBe(404);
      expect(reponse.body.erreur?.code).not.toBe("DROIT_INSUFFISANT");
    }
  });

  it("laisse la vente de A intacte après une tentative de B", async () => {
    const cookieA = await inscrire("a");
    const cookieB = await inscrire("b");

    const venteA = await request(app).post("/api/ventes").set("Cookie", cookieA)
      .send({ effectuee_le: "2026-05-15", montant_total_mineur: 10000 });

    await request(app).delete(`/api/ventes/${venteA.body.id}`).set("Cookie", cookieB);

    const relue = await request(app).get(`/api/ventes/${venteA.body.id}`).set("Cookie", cookieA);
    expect(relue.status).toBe(200);
    expect(relue.body.montant_total_mineur).toBe(10000);
  });
});

describe("dépenses", () => {
  let cookie: string;
  beforeEach(async () => {
    cookie = await inscrire();
  });

  it("crée une dépense avec sa catégorie résolue", async () => {
    const reponse = await request(app)
      .post("/api/depenses")
      .set("Cookie", cookie)
      .send({
        effectuee_le: "2026-05-20",
        montant_mineur: 89000,
        categorie_id: CATEGORIE_LOYER,
        fournisseur: "SCI du Centre",
        moyen_paiement: "VIREMENT",
      });

    expect(reponse.status).toBe(201);
    expect(reponse.body.montant_mineur).toBe(89000);
    // Résolue, pas seulement son identifiant : afficher une liste ne doit pas
    // coûter un second appel.
    expect(reponse.body.categorie).toEqual({
      id: CATEGORIE_LOYER,
      code: "loyer",
      libelle: "Loyer",
    });
  });

  it("accepte une dépense sans catégorie", async () => {
    const reponse = await request(app)
      .post("/api/depenses")
      .set("Cookie", cookie)
      .send({ effectuee_le: "2026-05-20", montant_mineur: 1500 });

    expect(reponse.status).toBe(201);
    expect(reponse.body.categorie).toBeNull();
  });

  it("refuse une catégorie inconnue en 400 — c'est un champ invalide, pas une ressource", async () => {
    const reponse = await request(app)
      .post("/api/depenses")
      .set("Cookie", cookie)
      .send({
        effectuee_le: "2026-05-20",
        montant_mineur: 1500,
        categorie_id: "99999999-9999-4999-8999-999999999999",
      });

    expect(reponse.status).toBe(400);
    expect(reponse.body.erreur.details.champs[0].champ).toBe("categorie_id");
  });

  it("filtre par catégorie", async () => {
    await request(app).post("/api/depenses").set("Cookie", cookie)
      .send({ effectuee_le: "2026-05-20", montant_mineur: 1000, categorie_id: CATEGORIE_LOYER });
    await request(app).post("/api/depenses").set("Cookie", cookie)
      .send({ effectuee_le: "2026-05-21", montant_mineur: 2000 });

    const reponse = await request(app)
      .get(`/api/depenses?categorie_id=${CATEGORIE_LOYER}`)
      .set("Cookie", cookie);

    expect(reponse.body.total).toBe(1);
    expect(reponse.body.elements[0].montant_mineur).toBe(1000);
  });

  it("supprime en douceur", async () => {
    const creee = await request(app).post("/api/depenses").set("Cookie", cookie)
      .send({ effectuee_le: "2026-05-20", montant_mineur: 1500 });

    expect((await request(app).delete(`/api/depenses/${creee.body.id}`).set("Cookie", cookie)).status).toBe(204);
    expect((await request(app).get(`/api/depenses/${creee.body.id}`).set("Cookie", cookie)).status).toBe(404);
  });
});

describe("GET /api/categories-depense", () => {
  it("rend les catégories de l'entreprise", async () => {
    const cookie = await inscrire();
    const reponse = await request(app).get("/api/categories-depense").set("Cookie", cookie);

    expect(reponse.status).toBe(200);
    expect(reponse.body.elements.length).toBeGreaterThan(0);
    expect(reponse.body.elements[0]).toHaveProperty("libelle");
  });
});
