import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { creerApp } from "../../app.js";
import { definirNiveauJournal } from "../../http/journal.js";
import { assemblerTest, type PiecesTest } from "../../test-utils/dependancesTest.js";
import { hacherMotDePasse } from "../auth/motDePasse.js";

/**
 * Console d'administration — docs/API-CONTRACT.md §9.
 *
 * Deux choses comptent ici : la **séparation** des deux domaines
 * d'authentification, et le fait qu'une suspension prenne effet tout de suite.
 */

const MOT_DE_PASSE_CLIENT = "correct-cheval-pile-agrafe";
const MOT_DE_PASSE_ADMIN = "console-interne-bizly-2026";

let app: ReturnType<typeof creerApp>;
let pieces: PiecesTest;
let cookieAdmin: string;
let cookieClient: string;
let entrepriseId: string;
let utilisateurId: string;

beforeAll(() => definirNiveauJournal("silence"));
afterAll(() => definirNiveauJournal("info"));

function premierCookie(entete: string | string[] | undefined): string {
  return (Array.isArray(entete) ? entete : [entete ?? ""])[0] ?? "";
}

beforeEach(async () => {
  const assemblage = assemblerTest();
  app = creerApp(assemblage.dependances);
  pieces = assemblage.pieces;

  await pieces.depotAdmin.creerAdmin({
    nom: "Support Bizly",
    email: "support@bizly.app",
    mot_de_passe_hash: await hacherMotDePasse(MOT_DE_PASSE_ADMIN),
  });

  const connexionAdmin = await request(app)
    .post("/api/admin/connexion")
    .send({ email: "support@bizly.app", mot_de_passe: MOT_DE_PASSE_ADMIN });
  cookieAdmin = premierCookie(connexionAdmin.headers["set-cookie"]);

  const inscription = await request(app)
    .post("/api/inscription")
    .send({
      entreprise: { nom: "Boutique Awa", secteur: "commerce_detail", pays: "SN" },
      utilisateur: { nom: "Awa", email: "awa@exemple.fr", mot_de_passe: MOT_DE_PASSE_CLIENT },
    });
  cookieClient = premierCookie(inscription.headers["set-cookie"]);
  entrepriseId = inscription.body.entreprise.id;
  utilisateurId = inscription.body.utilisateur.id;
});

describe("séparation des deux domaines", () => {
  it("un cookie client n'ouvre pas la console", async () => {
    const reponse = await request(app).get("/api/admin/moi").set("Cookie", cookieClient);

    expect(reponse.status).toBe(401);
  });

  it("un cookie admin n'ouvre pas l'application cliente", async () => {
    const reponse = await request(app).get("/api/moi").set("Cookie", cookieAdmin);

    expect(reponse.status).toBe(401);
  });

  it("aucune route d'inscription admin n'est exposée", async () => {
    const reponse = await request(app)
      .post("/api/admin/inscription")
      .send({ email: "pirate@exemple.fr", mot_de_passe: MOT_DE_PASSE_ADMIN });

    expect(reponse.status).toBe(404);
    expect(reponse.body.erreur.code).toBe("ROUTE_INTROUVABLE");
  });
});

describe("POST /api/admin/connexion", () => {
  it("répond la même chose pour un e-mail inconnu et un mot de passe faux", async () => {
    const inconnu = await request(app)
      .post("/api/admin/connexion")
      .send({ email: "personne@bizly.app", mot_de_passe: MOT_DE_PASSE_ADMIN });
    const faux = await request(app)
      .post("/api/admin/connexion")
      .send({ email: "support@bizly.app", mot_de_passe: "pas-le-bon-du-tout" });

    expect(inconnu.status).toBe(401);
    expect(faux.status).toBe(401);
    expect(inconnu.body).toEqual(faux.body);
  });

  it("ouvre une session et rend l'administrateur", async () => {
    const reponse = await request(app).get("/api/admin/moi").set("Cookie", cookieAdmin);

    expect(reponse.status).toBe(200);
    expect(reponse.body.admin.email).toBe("support@bizly.app");
    expect(reponse.body.admin).not.toHaveProperty("mot_de_passe_hash");
  });

  it("la déconnexion révoque le jeton, pas seulement le cookie", async () => {
    await request(app).post("/api/admin/deconnexion").set("Cookie", cookieAdmin);

    const rejoue = await request(app).get("/api/admin/moi").set("Cookie", cookieAdmin);
    expect(rejoue.status).toBe(401);
  });
});

describe("GET /api/admin/entreprises", () => {
  it("liste les entreprises avec leur propriétaire", async () => {
    const reponse = await request(app).get("/api/admin/entreprises").set("Cookie", cookieAdmin);

    expect(reponse.status).toBe(200);
    expect(reponse.body.total).toBe(1);
    expect(reponse.body.elements[0].nom).toBe("Boutique Awa");
    expect(reponse.body.elements[0].proprietaire.email).toBe("awa@exemple.fr");
    expect(reponse.body.elements[0].devise).toBe("XOF");
  });

  it("cherche par nom d'entreprise ou par e-mail du propriétaire", async () => {
    const parEmail = await request(app)
      .get("/api/admin/entreprises?recherche=awa@exemple")
      .set("Cookie", cookieAdmin);
    const parNom = await request(app)
      .get("/api/admin/entreprises?recherche=Boutique")
      .set("Cookie", cookieAdmin);
    const rien = await request(app)
      .get("/api/admin/entreprises?recherche=introuvable")
      .set("Cookie", cookieAdmin);

    expect(parEmail.body.total).toBe(1);
    expect(parNom.body.total).toBe(1);
    expect(rien.body.total).toBe(0);
  });

  it("filtre par plan", async () => {
    const free = await request(app)
      .get("/api/admin/entreprises?plan=free")
      .set("Cookie", cookieAdmin);
    const pro = await request(app).get("/api/admin/entreprises?plan=pro").set("Cookie", cookieAdmin);

    expect(free.body.total).toBe(1);
    expect(pro.body.total).toBe(0);
  });

  it("refuse un identifiant mal formé par un 404, comme un inexistant", async () => {
    const reponse = await request(app)
      .get("/api/admin/entreprises/pas-un-uuid")
      .set("Cookie", cookieAdmin);

    expect(reponse.status).toBe(404);
  });
});

describe("PATCH /api/admin/entreprises/:id", () => {
  it("change le plan à la main — c'est la seule porte", async () => {
    const reponse = await request(app)
      .patch(`/api/admin/entreprises/${entrepriseId}`)
      .set("Cookie", cookieAdmin)
      .send({ plan: "pro" });

    expect(reponse.status).toBe(200);
    expect(reponse.body.plan).toBe("pro");

    const cote = await request(app).get("/api/moi").set("Cookie", cookieClient);
    expect(cote.body.entreprise.plan).toBe("pro");
  });

  it("exige un motif pour suspendre", async () => {
    const reponse = await request(app)
      .patch(`/api/admin/entreprises/${entrepriseId}`)
      .set("Cookie", cookieAdmin)
      .send({ statut: "SUSPENDU" });

    expect(reponse.status).toBe(400);
    expect(reponse.body.erreur.details.champs[0].champ).toBe("motif_suspension");
  });

  it("la suspension coupe la session en cours, sans attendre son expiration", async () => {
    expect((await request(app).get("/api/moi").set("Cookie", cookieClient)).status).toBe(200);

    const reponse = await request(app)
      .patch(`/api/admin/entreprises/${entrepriseId}`)
      .set("Cookie", cookieAdmin)
      .send({ statut: "SUSPENDU", motif_suspension: "Impayé" });

    expect(reponse.status).toBe(200);
    expect(reponse.body.statut).toBe("SUSPENDU");
    expect(reponse.body.motif_suspension).toBe("Impayé");
    expect(pieces.depotAdmin.nombreSessionsClient(utilisateurId)).toBe(0);

    const apres = await request(app).get("/api/moi").set("Cookie", cookieClient);
    expect(apres.status).toBe(401);
  });

  it("réactiver rouvre la connexion", async () => {
    await request(app)
      .patch(`/api/admin/entreprises/${entrepriseId}`)
      .set("Cookie", cookieAdmin)
      .send({ statut: "SUSPENDU", motif_suspension: "Impayé" });

    const bloque = await request(app)
      .post("/api/connexion")
      .send({ email: "awa@exemple.fr", mot_de_passe: MOT_DE_PASSE_CLIENT });
    expect(bloque.status).toBe(403);
    expect(bloque.body.erreur.code).toBe("COMPTE_SUSPENDU");

    await request(app)
      .patch(`/api/admin/entreprises/${entrepriseId}`)
      .set("Cookie", cookieAdmin)
      .send({ statut: "ACTIF" });

    const rouvert = await request(app)
      .post("/api/connexion")
      .send({ email: "awa@exemple.fr", mot_de_passe: MOT_DE_PASSE_CLIENT });
    expect(rouvert.status).toBe(200);
  });

  it("exige une session admin", async () => {
    const reponse = await request(app)
      .patch(`/api/admin/entreprises/${entrepriseId}`)
      .send({ plan: "business" });

    expect(reponse.status).toBe(401);
  });
});

describe("POST /api/admin/utilisateurs/:id/mot-de-passe", () => {
  const NOUVEAU = "reinitialise-par-le-support";

  it("réinitialise et révoque toutes les sessions du client", async () => {
    const reponse = await request(app)
      .post(`/api/admin/utilisateurs/${utilisateurId}/mot-de-passe`)
      .set("Cookie", cookieAdmin)
      .send({ mot_de_passe: NOUVEAU });

    expect(reponse.status).toBe(204);
    expect((await request(app).get("/api/moi").set("Cookie", cookieClient)).status).toBe(401);

    const connexion = await request(app)
      .post("/api/connexion")
      .send({ email: "awa@exemple.fr", mot_de_passe: NOUVEAU });
    expect(connexion.status).toBe(200);
  });

  it("applique les mêmes règles de robustesse qu'à l'inscription", async () => {
    const reponse = await request(app)
      .post(`/api/admin/utilisateurs/${utilisateurId}/mot-de-passe`)
      .set("Cookie", cookieAdmin)
      .send({ mot_de_passe: "motdepasse" });

    expect(reponse.status).toBe(400);
  });
});

describe("GET /api/admin/statistiques", () => {
  it("compte les entreprises, les comptes et ceux qui ont vendu", async () => {
    const reponse = await request(app).get("/api/admin/statistiques").set("Cookie", cookieAdmin);

    expect(reponse.status).toBe(200);
    expect(reponse.body.entreprises).toBe(1);
    expect(reponse.body.entreprises_actives).toBe(1);
    expect(reponse.body.utilisateurs).toBe(1);
    expect(reponse.body.entreprises_avec_vente).toBe(0);
    expect(reponse.body.par_plan).toEqual([{ plan: "free", nombre: 1 }]);
  });

  it("n'annonce ni rétention ni MRR — ils ne sont pas mesurés", async () => {
    const reponse = await request(app).get("/api/admin/statistiques").set("Cookie", cookieAdmin);

    // Les afficher à zéro les ferait passer pour mesurés (§9.5).
    expect(reponse.body).not.toHaveProperty("mrr");
    expect(reponse.body).not.toHaveProperty("retention");
  });
});
