import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { creerApp } from "../../app.js";
import { definirNiveauJournal } from "../../http/journal.js";
import { assemblerTest, type PiecesTest } from "../../test-utils/dependancesTest.js";

/**
 * Paramètres de l'entreprise et du compte — docs/API-CONTRACT.md §8.
 *
 * Le test central de ce fichier est celui du **verrou de devise** : c'est la
 * seule règle de la vague qui protège des données déjà saisies.
 */

const MOT_DE_PASSE = "correct-cheval-pile-agrafe";

let app: ReturnType<typeof creerApp>;
let pieces: PiecesTest;
let cookie: string;
let entrepriseId: string;
let utilisateurId: string;

beforeAll(() => definirNiveauJournal("silence"));
afterAll(() => definirNiveauJournal("info"));

beforeEach(async () => {
  const assemblage = assemblerTest();
  app = creerApp(assemblage.dependances);
  pieces = assemblage.pieces;

  const inscription = await request(app)
    .post("/api/inscription")
    .send({
      entreprise: { nom: "Boutique Awa", secteur: "commerce_detail", pays: "SN" },
      utilisateur: { nom: "Awa", email: "awa@exemple.fr", mot_de_passe: MOT_DE_PASSE },
    });

  const entete = inscription.headers["set-cookie"];
  cookie = (Array.isArray(entete) ? entete : [entete ?? ""])[0] ?? "";
  entrepriseId = inscription.body.entreprise.id;
  utilisateurId = inscription.body.utilisateur.id;
});

describe("le pays choisit la devise et le fuseau", () => {
  it("un compte sénégalais naît en francs CFA, à l'heure de Dakar", async () => {
    const reponse = await request(app).get("/api/moi").set("Cookie", cookie);

    expect(reponse.body.entreprise.pays).toBe("SN");
    expect(reponse.body.entreprise.devise).toEqual({ code: "XOF", decimales: 0 });
    expect(reponse.body.entreprise.fuseau).toBe("Africa/Dakar");
  });

  it("une devise explicite l'emporte sur celle du pays", async () => {
    const reponse = await request(app)
      .post("/api/inscription")
      .send({
        entreprise: {
          nom: "Agence Dakar Export",
          secteur: "services_pro",
          pays: "SN",
          devise: "EUR",
        },
        utilisateur: { nom: "Moussa", email: "moussa@exemple.fr", mot_de_passe: MOT_DE_PASSE },
      });

    expect(reponse.status).toBe(201);
    expect(reponse.body.entreprise.devise.code).toBe("EUR");
    // Le fuseau, lui, reste celui du pays : rien ne l'a contredit.
    expect(reponse.body.entreprise.fuseau).toBe("Africa/Dakar");
  });

  it("sans pays, on retombe sur euro / Paris comme avant la Vague 5", async () => {
    const reponse = await request(app)
      .post("/api/inscription")
      .send({
        entreprise: { nom: "Sans Pays", secteur: "autre" },
        utilisateur: { nom: "Sans", email: "sans@exemple.fr", mot_de_passe: MOT_DE_PASSE },
      });

    expect(reponse.body.entreprise.pays).toBeNull();
    expect(reponse.body.entreprise.devise.code).toBe("EUR");
    expect(reponse.body.entreprise.fuseau).toBe("Europe/Paris");
  });

  it("refuse un pays inconnu plutôt que de l'ignorer", async () => {
    const reponse = await request(app)
      .post("/api/inscription")
      .send({
        entreprise: { nom: "Nulle Part", secteur: "autre", pays: "ZZ" },
        utilisateur: { nom: "Zoé", email: "zoe@exemple.fr", mot_de_passe: MOT_DE_PASSE },
      });

    // L'ignorer donnerait silencieusement une devise que personne n'a choisie.
    expect(reponse.status).toBe(400);
    expect(reponse.body.erreur.details.champs[0].champ).toBe("entreprise.pays");
  });

  it("naît toujours en plan free — le plan ne se choisit pas", async () => {
    const reponse = await request(app).get("/api/moi").set("Cookie", cookie);

    expect(reponse.body.entreprise.plan).toBe("free");
  });
});

describe("PATCH /api/entreprise", () => {
  it("exige une session", async () => {
    const reponse = await request(app).patch("/api/entreprise").send({ nom: "Pirate" });

    expect(reponse.status).toBe(401);
  });

  it("renomme l'entreprise et rend la fiche à jour", async () => {
    const reponse = await request(app)
      .patch("/api/entreprise")
      .set("Cookie", cookie)
      .send({ nom: "Boutique Awa & Fils" });

    expect(reponse.status).toBe(200);
    expect(reponse.body.nom).toBe("Boutique Awa & Fils");

    const relu = await request(app).get("/api/moi").set("Cookie", cookie);
    expect(relu.body.entreprise.nom).toBe("Boutique Awa & Fils");
  });

  it("refuse un corps vide", async () => {
    const reponse = await request(app).patch("/api/entreprise").set("Cookie", cookie).send({});

    expect(reponse.status).toBe(400);
  });

  it("refuse de changer le plan par cette porte", async () => {
    const reponse = await request(app)
      .patch("/api/entreprise")
      .set("Cookie", cookie)
      .send({ plan: "business" });

    // Silence accepté, le client croirait avoir changé de plan.
    expect(reponse.status).toBe(400);

    const relu = await request(app).get("/api/moi").set("Cookie", cookie);
    expect(relu.body.entreprise.plan).toBe("free");
  });

  it("refuse un secteur, un pays ou un fuseau inconnus", async () => {
    for (const [corps, champ] of [
      [{ secteur: "elevage_de_licornes" }, "secteur"],
      [{ pays: "ZZ" }, "pays"],
      [{ fuseau: "Mars/Olympus_Mons" }, "fuseau"],
    ] as const) {
      const reponse = await request(app).patch("/api/entreprise").set("Cookie", cookie).send(corps);

      expect(reponse.status).toBe(400);
      expect(reponse.body.erreur.details.champs[0].champ).toBe(champ);
    }
  });
});

describe("le verrou de devise", () => {
  it("laisse changer la devise tant qu'aucun montant n'est enregistré", async () => {
    const reponse = await request(app)
      .patch("/api/entreprise")
      .set("Cookie", cookie)
      .send({ devise: "EUR" });

    expect(reponse.status).toBe(200);
    expect(reponse.body.devise).toEqual({ code: "EUR", decimales: 2 });
  });

  it("la refuse dès la première écriture, en disant laquelle", async () => {
    pieces.depotEntreprise.definirVolumes(entrepriseId, {
      ventes: 12,
      depenses: 5,
      produits: 4,
    });

    const reponse = await request(app)
      .patch("/api/entreprise")
      .set("Cookie", cookie)
      .send({ devise: "EUR" });

    expect(reponse.status).toBe(409);
    expect(reponse.body.erreur.code).toBe("CONFLIT");
    expect(reponse.body.erreur.message).toContain("12 ventes, 5 dépenses et 4 produits");
    expect(reponse.body.erreur.message).toContain("XOF");
    expect(reponse.body.erreur.details.volumes).toEqual({
      ventes: 12,
      depenses: 5,
      produits: 4,
    });
  });

  it("accorde le verbe et n'énumère que les catégories non vides", async () => {
    pieces.depotEntreprise.definirVolumes(entrepriseId, { ventes: 1 });

    const reponse = await request(app)
      .patch("/api/entreprise")
      .set("Cookie", cookie)
      .send({ devise: "EUR" });

    expect(reponse.body.erreur.message).toContain("1 vente est enregistré");
    expect(reponse.body.erreur.message).not.toContain("dépense");
    expect(reponse.body.erreur.message).not.toContain("produit");
  });

  it("laisse passer un renommage même quand des montants existent", async () => {
    pieces.depotEntreprise.definirVolumes(entrepriseId, { ventes: 40 });

    const reponse = await request(app)
      .patch("/api/entreprise")
      .set("Cookie", cookie)
      .send({ nom: "Boutique Awa", devise: "XOF" });

    // Renvoyer la MÊME devise n'est pas un changement : ne pas le refuser.
    expect(reponse.status).toBe(200);
  });
});

describe("PATCH /api/moi", () => {
  it("change le nom de l'utilisateur", async () => {
    const reponse = await request(app)
      .patch("/api/moi")
      .set("Cookie", cookie)
      .send({ nom: "Awa Diop" });

    expect(reponse.status).toBe(200);
    expect(reponse.body.nom).toBe("Awa Diop");
    expect(reponse.body.email).toBe("awa@exemple.fr");
  });

  it("ne touche pas à l'e-mail, même si on l'envoie", async () => {
    await request(app)
      .patch("/api/moi")
      .set("Cookie", cookie)
      .send({ nom: "Awa", email: "autre@exemple.fr" });

    const relu = await request(app).get("/api/moi").set("Cookie", cookie);
    expect(relu.body.utilisateur.email).toBe("awa@exemple.fr");
  });
});

describe("POST /api/mot-de-passe", () => {
  const NOUVEAU = "phrase-de-passe-toute-neuve";

  it("refuse un ancien mot de passe faux, sans rien révéler de plus", async () => {
    const reponse = await request(app)
      .post("/api/mot-de-passe")
      .set("Cookie", cookie)
      .send({ ancien: "pas-le-bon-du-tout", nouveau: NOUVEAU });

    expect(reponse.status).toBe(401);
    expect(reponse.body.erreur.code).toBe("IDENTIFIANTS_INVALIDES");
  });

  it("refuse un nouveau mot de passe trop faible", async () => {
    const reponse = await request(app)
      .post("/api/mot-de-passe")
      .set("Cookie", cookie)
      .send({ ancien: MOT_DE_PASSE, nouveau: "motdepasse" });

    expect(reponse.status).toBe(400);
  });

  it("refuse de reposer le même mot de passe", async () => {
    const reponse = await request(app)
      .post("/api/mot-de-passe")
      .set("Cookie", cookie)
      .send({ ancien: MOT_DE_PASSE, nouveau: MOT_DE_PASSE });

    expect(reponse.status).toBe(400);
  });

  it("change le mot de passe, garde la session en cours et coupe les autres", async () => {
    // Une seconde session, comme un téléphone laissé connecté.
    const autre = await request(app)
      .post("/api/connexion")
      .send({ email: "awa@exemple.fr", mot_de_passe: MOT_DE_PASSE });
    const enteteAutre = autre.headers["set-cookie"];
    const cookieAutre = (Array.isArray(enteteAutre) ? enteteAutre : [enteteAutre ?? ""])[0] ?? "";

    expect(pieces.depotAuth.nombreSessionsActives(utilisateurId)).toBe(2);

    const reponse = await request(app)
      .post("/api/mot-de-passe")
      .set("Cookie", cookie)
      .send({ ancien: MOT_DE_PASSE, nouveau: NOUVEAU });

    expect(reponse.status).toBe(204);

    // La session qui a fait la demande survit…
    expect((await request(app).get("/api/moi").set("Cookie", cookie)).status).toBe(200);
    // …l'autre tombe : on change son mot de passe quand on se croit compromis.
    expect((await request(app).get("/api/moi").set("Cookie", cookieAutre)).status).toBe(401);

    // Et c'est bien le nouveau qui ouvre désormais.
    const connexion = await request(app)
      .post("/api/connexion")
      .send({ email: "awa@exemple.fr", mot_de_passe: NOUVEAU });
    expect(connexion.status).toBe(200);
  });
});
