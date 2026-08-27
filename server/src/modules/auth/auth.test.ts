import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { creerApp } from "../../app.js";
import type { EtatBase } from "../../db/sonde.js";
import { definirNiveauJournal } from "../../http/journal.js";
import { creerDepotMemoire, type DepotMemoire } from "../../test-utils/depotMemoire.js";
import { creerDepotOperationsMemoire } from "../../test-utils/depotOperationsMemoire.js";
import { creerServiceOperations } from "../../modules/operations/service.js";
import { creerServiceAuth } from "./service.js";
import { creerDepotKpiMemoire } from "../../test-utils/depotKpiMemoire.js";

/**
 * Tests de bout en bout de l'authentification, sans Postgres.
 *
 * Le dépôt en mémoire reproduit les invariants de la vraie base ; le schéma
 * lui-même est vérifié séparément contre Supabase. Ici on vérifie le
 * comportement HTTP : codes, corps, cookies, et surtout ce que l'API refuse
 * de révéler.
 */

const MOT_DE_PASSE = "correct-cheval-pile-agrafe";

function monter(depot: DepotMemoire) {
  return creerApp({
    sonderBase: async (): Promise<EtatBase> => ({ statut: "ok", latence_ms: 1 }),
    serviceAuth: creerServiceAuth({ depot }),
    serviceOperations: creerServiceOperations(creerDepotOperationsMemoire()),
    depotKpi: creerDepotKpiMemoire(),
    version: "0.1.0-test",
    demarreLe: Date.now(),
    production: false,
    racinePublic: null,
  });
}

function corpsInscription(surcharge: Record<string, unknown> = {}) {
  return {
    entreprise: { nom: "Boulangerie Martin", secteur: "commerce_detail" },
    utilisateur: { nom: "Awa Martin", email: "awa@exemple.fr", mot_de_passe: MOT_DE_PASSE },
    ...surcharge,
  };
}

/** Extrait le cookie de session d'une réponse, pour le rejouer. */
function cookieDe(reponse: { headers: Record<string, unknown> }): string {
  const entete = reponse.headers["set-cookie"];
  const premier = Array.isArray(entete) ? entete[0] : entete;
  return String(premier ?? "").split(";")[0] ?? "";
}

let depot: DepotMemoire;
let app: ReturnType<typeof monter>;

beforeAll(() => definirNiveauJournal("silence"));
afterAll(() => definirNiveauJournal("info"));

beforeEach(() => {
  depot = creerDepotMemoire();
  app = monter(depot);
});

describe("POST /api/inscription", () => {
  it("crée l'entreprise et son propriétaire, et pose la session", async () => {
    const reponse = await request(app).post("/api/inscription").send(corpsInscription());

    expect(reponse.status).toBe(201);
    expect(reponse.body.utilisateur).toMatchObject({
      nom: "Awa Martin",
      email: "awa@exemple.fr",
      role: "PROPRIETAIRE",
    });
    expect(reponse.body.entreprise).toMatchObject({
      nom: "Boulangerie Martin",
      secteur: "commerce_detail",
      statut: "ACTIF",
      fuseau: "Europe/Paris",
    });
    expect(reponse.body.entreprise.devise).toEqual({ code: "EUR", decimales: 2 });
  });

  it("crée le compte en ACTIF — inscription ouverte, suspension manuelle a posteriori", async () => {
    const reponse = await request(app).post("/api/inscription").send(corpsInscription());
    expect(reponse.body.entreprise.statut).toBe("ACTIF");
  });

  it("pose un cookie HttpOnly, SameSite=Lax, sans Secure en développement", async () => {
    const reponse = await request(app).post("/api/inscription").send(corpsInscription());
    const cookie = String(reponse.headers["set-cookie"]?.[0] ?? "");

    expect(cookie).toMatch(/^bizly_session=/);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toContain("Path=/");
    // En HTTP local, `Secure` rendrait le cookie inutilisable.
    expect(cookie).not.toContain("Secure");
  });

  it("ne renvoie jamais le hachage du mot de passe", async () => {
    const reponse = await request(app).post("/api/inscription").send(corpsInscription());
    const corps = JSON.stringify(reponse.body);

    expect(corps).not.toContain("scrypt");
    expect(corps).not.toContain(MOT_DE_PASSE);
    expect(corps).not.toMatch(/mot_de_passe/);
  });

  it("normalise l'e-mail en minuscules", async () => {
    await request(app).post("/api/inscription").send(
      corpsInscription({
        utilisateur: { nom: "Awa", email: "AWA@Exemple.FR", mot_de_passe: MOT_DE_PASSE },
      }),
    );
    expect(depot.compte("awa@exemple.fr")).toBeDefined();
  });

  it("refuse un e-mail déjà pris, quelle que soit la casse", async () => {
    await request(app).post("/api/inscription").send(corpsInscription());

    const reponse = await request(app).post("/api/inscription").send(
      corpsInscription({
        utilisateur: { nom: "Autre", email: "AWA@EXEMPLE.FR", mot_de_passe: MOT_DE_PASSE },
      }),
    );

    expect(reponse.status).toBe(409);
    expect(reponse.body.erreur.code).toBe("CONFLIT");
  });

  it("refuse un mot de passe trop court", async () => {
    const reponse = await request(app).post("/api/inscription").send(
      corpsInscription({
        utilisateur: { nom: "Awa", email: "b@exemple.fr", mot_de_passe: "court" },
      }),
    );

    expect(reponse.status).toBe(400);
    expect(reponse.body.erreur.code).toBe("VALIDATION");
    expect(reponse.body.erreur.details.champs[0].champ).toBe("utilisateur.mot_de_passe");
  });

  it("refuse un mot de passe courant, même assez long", async () => {
    const reponse = await request(app).post("/api/inscription").send(
      corpsInscription({
        utilisateur: { nom: "Awa", email: "c@exemple.fr", mot_de_passe: "MotDePasse123" },
      }),
    );
    expect(reponse.status).toBe(400);
  });

  it("refuse une suite de clavier", async () => {
    const reponse = await request(app).post("/api/inscription").send(
      corpsInscription({
        utilisateur: { nom: "Awa", email: "d@exemple.fr", mot_de_passe: "azertyuiop" },
      }),
    );
    expect(reponse.status).toBe(400);
  });

  it("refuse un secteur inconnu", async () => {
    const reponse = await request(app).post("/api/inscription").send(
      corpsInscription({ entreprise: { nom: "X", secteur: "elevage_de_licornes" } }),
    );

    expect(reponse.status).toBe(400);
    expect(reponse.body.erreur.details.champs[0].champ).toBe("entreprise.secteur");
  });

  it("accepte une devise sans décimale et la renvoie résolue", async () => {
    const reponse = await request(app).post("/api/inscription").send(
      corpsInscription({
        entreprise: { nom: "Alimentation Diallo", secteur: "commerce_detail", devise: "XOF" },
      }),
    );

    // Le client reçoit decimales:0 et ne peut donc pas afficher « 2 916,67 XOF »
    // là où le montant vaut 291 667 XOF.
    expect(reponse.body.entreprise.devise).toEqual({ code: "XOF", decimales: 0 });
  });

  it("refuse une devise inconnue", async () => {
    const reponse = await request(app).post("/api/inscription").send(
      corpsInscription({ entreprise: { nom: "X", secteur: "autre", devise: "ZZZ" } }),
    );
    expect(reponse.status).toBe(400);
  });
});

describe("POST /api/connexion", () => {
  beforeEach(async () => {
    await request(app).post("/api/inscription").send(corpsInscription());
    await request(app).post("/api/deconnexion");
  });

  it("connecte avec les bons identifiants", async () => {
    const reponse = await request(app)
      .post("/api/connexion")
      .send({ email: "awa@exemple.fr", mot_de_passe: MOT_DE_PASSE });

    expect(reponse.status).toBe(200);
    expect(reponse.body.utilisateur.email).toBe("awa@exemple.fr");
    expect(cookieDe(reponse)).toMatch(/^bizly_session=.+/);
  });

  it("accepte l'e-mail dans n'importe quelle casse", async () => {
    const reponse = await request(app)
      .post("/api/connexion")
      .send({ email: "  AWA@Exemple.FR  ", mot_de_passe: MOT_DE_PASSE });
    expect(reponse.status).toBe(200);
  });

  it("répond exactement pareil pour un e-mail inconnu et un mot de passe faux", async () => {
    // C'est LE test qui empêche l'API de servir d'annuaire des clients.
    const inconnu = await request(app)
      .post("/api/connexion")
      .send({ email: "personne@exemple.fr", mot_de_passe: MOT_DE_PASSE });

    const mauvais = await request(app)
      .post("/api/connexion")
      .send({ email: "awa@exemple.fr", mot_de_passe: "un-autre-mot-de-passe" });

    expect(inconnu.status).toBe(401);
    expect(mauvais.status).toBe(401);
    expect(inconnu.body).toEqual(mauvais.body);
    expect(inconnu.body.erreur.code).toBe("IDENTIFIANTS_INVALIDES");
  });

  it("ne pose aucun cookie quand la connexion échoue", async () => {
    const reponse = await request(app)
      .post("/api/connexion")
      .send({ email: "awa@exemple.fr", mot_de_passe: "faux-mot-de-passe-ici" });

    expect(reponse.headers["set-cookie"]).toBeUndefined();
  });

  it("refuse une entreprise suspendue, en le disant clairement", async () => {
    const compte = depot.compte("awa@exemple.fr");
    depot.suspendreEntreprise(compte?.entreprise.id ?? "");

    const reponse = await request(app)
      .post("/api/connexion")
      .send({ email: "awa@exemple.fr", mot_de_passe: MOT_DE_PASSE });

    // Ici on PEUT être explicite : l'utilisateur a prouvé qui il est.
    expect(reponse.status).toBe(403);
    expect(reponse.body.erreur.code).toBe("COMPTE_SUSPENDU");
  });

  it("ne révèle pas la suspension avant d'avoir validé le mot de passe", async () => {
    const compte = depot.compte("awa@exemple.fr");
    depot.suspendreEntreprise(compte?.entreprise.id ?? "");

    const reponse = await request(app)
      .post("/api/connexion")
      .send({ email: "awa@exemple.fr", mot_de_passe: "mauvais-mot-de-passe" });

    // Sinon, tester un mot de passe quelconque révélerait l'existence du compte.
    expect(reponse.status).toBe(401);
    expect(reponse.body.erreur.code).toBe("IDENTIFIANTS_INVALIDES");
  });

  it("bloque après 10 tentatives sur le même e-mail", async () => {
    const tenter = () =>
      request(app).post("/api/connexion").send({ email: "awa@exemple.fr", mot_de_passe: "faux-mot-de-passe" });

    for (let i = 0; i < 10; i += 1) await tenter();
    const bloquee = await tenter();

    expect(bloquee.status).toBe(429);
    expect(bloquee.body.erreur.code).toBe("TROP_DE_REQUETES");
  });

  it("ne bloque pas un collègue derrière la même IP après 10 échecs d'un autre", async () => {
    // Un commerce partage une seule IP publique. Si la limite par IP valait 10
    // comme celle par e-mail, dix erreurs d'une personne verrouilleraient toute
    // l'équipe — y compris ceux qui tapent le bon mot de passe, puisque la
    // limitation s'applique AVANT l'authentification.
    await request(app).post("/api/inscription").send({
      entreprise: { nom: "Boulangerie Martin", secteur: "commerce_detail" },
      utilisateur: { nom: "Bob", email: "bob@exemple.fr", mot_de_passe: MOT_DE_PASSE },
    });

    for (let i = 0; i < 10; i += 1) {
      await request(app)
        .post("/api/connexion")
        .send({ email: "awa@exemple.fr", mot_de_passe: "faux-mot-de-passe" });
    }

    const collegue = await request(app)
      .post("/api/connexion")
      .send({ email: "bob@exemple.fr", mot_de_passe: MOT_DE_PASSE });

    expect(collegue.status).toBe(200);
  });

  it("finit tout de même par bloquer un balayage massif depuis une IP", async () => {
    // La limite par IP reste large, mais elle existe : 30 tentatives sur des
    // e-mails tous différents doivent finir par être arrêtées.
    let dernierStatut = 0;
    for (let i = 0; i < 31; i += 1) {
      const reponse = await request(app)
        .post("/api/connexion")
        .send({ email: `cible-${i}@exemple.fr`, mot_de_passe: "peu-importe-ici" });
      dernierStatut = reponse.status;
    }

    expect(dernierStatut).toBe(429);
  });
});

describe("GET /api/moi", () => {
  it("renvoie 401 sans session — cas normal, pas une erreur", async () => {
    const reponse = await request(app).get("/api/moi");

    expect(reponse.status).toBe(401);
    expect(reponse.body.erreur.code).toBe("NON_AUTHENTIFIE");
  });

  it("renvoie l'utilisateur et l'entreprise avec une session valide", async () => {
    const inscription = await request(app).post("/api/inscription").send(corpsInscription());

    const reponse = await request(app).get("/api/moi").set("Cookie", cookieDe(inscription));

    expect(reponse.status).toBe(200);
    expect(reponse.body.utilisateur.email).toBe("awa@exemple.fr");
    expect(reponse.body.entreprise.nom).toBe("Boulangerie Martin");
  });

  it("refuse un cookie forgé sans jamais interroger la base", async () => {
    const reponse = await request(app)
      .get("/api/moi")
      .set("Cookie", "bizly_session=jetonInventeDeToutesPieces1234567890AB");

    expect(reponse.status).toBe(401);
  });

  it("refuse un cookie de forme aberrante", async () => {
    for (const valeur of ["", "x", "a".repeat(500), "avec des espaces", "avec/slash+plus="]) {
      const reponse = await request(app).get("/api/moi").set("Cookie", `bizly_session=${valeur}`);
      expect(reponse.status).toBe(401);
    }
  });

  it("refuse une session expirée", async () => {
    const inscription = await request(app).post("/api/inscription").send(corpsInscription());
    const compte = depot.compte("awa@exemple.fr");
    depot.expirerSessions(compte?.utilisateur.id ?? "");

    const reponse = await request(app).get("/api/moi").set("Cookie", cookieDe(inscription));
    expect(reponse.status).toBe(401);
  });

  it("coupe l'accès dès la suspension, sans attendre l'expiration du cookie", async () => {
    const inscription = await request(app).post("/api/inscription").send(corpsInscription());
    const compte = depot.compte("awa@exemple.fr");
    depot.suspendreEntreprise(compte?.entreprise.id ?? "");

    const reponse = await request(app).get("/api/moi").set("Cookie", cookieDe(inscription));

    expect(reponse.status).toBe(403);
    expect(reponse.body.erreur.code).toBe("COMPTE_SUSPENDU");
  });

  it("coupe aussi l'accès si c'est l'utilisateur qui est suspendu", async () => {
    const inscription = await request(app).post("/api/inscription").send(corpsInscription());
    const compte = depot.compte("awa@exemple.fr");
    depot.suspendreUtilisateur(compte?.utilisateur.id ?? "");

    const reponse = await request(app).get("/api/moi").set("Cookie", cookieDe(inscription));
    expect(reponse.status).toBe(403);
  });
});

describe("POST /api/deconnexion", () => {
  it("révoque la session en base, pas seulement le cookie", async () => {
    const inscription = await request(app).post("/api/inscription").send(corpsInscription());
    const cookie = cookieDe(inscription);

    await request(app).post("/api/deconnexion").set("Cookie", cookie);

    // Rejouer le même cookie ne doit plus rien donner : effacer le cookie
    // sans révoquer laisserait un jeton valide dans la nature.
    const apres = await request(app).get("/api/moi").set("Cookie", cookie);
    expect(apres.status).toBe(401);
  });

  it("efface le cookie avec les mêmes attributs qu'à la pose", async () => {
    const inscription = await request(app).post("/api/inscription").send(corpsInscription());
    const reponse = await request(app).post("/api/deconnexion").set("Cookie", cookieDe(inscription));

    const cookie = String(reponse.headers["set-cookie"]?.[0] ?? "");
    expect(cookie).toContain("bizly_session=;");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toMatch(/Max-Age=0/);
  });

  it("répond 204 même sans session — l'opération est idempotente", async () => {
    const reponse = await request(app).post("/api/deconnexion");
    expect(reponse.status).toBe(204);
  });
});

describe("isolation entre entreprises", () => {
  it("deux inscriptions produisent deux entreprises distinctes", async () => {
    const a = await request(app).post("/api/inscription").send(corpsInscription());
    const b = await request(app).post("/api/inscription").send(
      corpsInscription({
        entreprise: { nom: "Concurrent SARL", secteur: "restauration" },
        utilisateur: { nom: "Bob", email: "bob@exemple.fr", mot_de_passe: MOT_DE_PASSE },
      }),
    );

    expect(a.body.entreprise.id).not.toBe(b.body.entreprise.id);
  });

  it("la session de A ne donne jamais l'entreprise de B", async () => {
    const a = await request(app).post("/api/inscription").send(corpsInscription());
    await request(app).post("/api/inscription").send(
      corpsInscription({
        entreprise: { nom: "Concurrent SARL", secteur: "restauration" },
        utilisateur: { nom: "Bob", email: "bob@exemple.fr", mot_de_passe: MOT_DE_PASSE },
      }),
    );

    const moi = await request(app).get("/api/moi").set("Cookie", cookieDe(a));

    expect(moi.body.entreprise.id).toBe(a.body.entreprise.id);
    expect(moi.body.entreprise.nom).toBe("Boulangerie Martin");
  });
});
