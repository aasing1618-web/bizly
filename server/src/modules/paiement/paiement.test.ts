import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NUMERO_WAVE, PRIX_PRO_MENSUEL_XOF } from "@bizly/shared";
import { creerApp } from "../../app.js";
import { definirNiveauJournal } from "../../http/journal.js";
import { assemblerTest } from "../../test-utils/dependancesTest.js";
import { hacherMotDePasse } from "../auth/motDePasse.js";

/**
 * Essai de deux mois, blocage, paiement Wave et validation par un
 * administrateur — le parcours complet, contre l'API réelle.
 *
 * Ce qui compte ici n'est pas qu'une route réponde 200 : c'est qu'une
 * entreprise dont l'essai est terminé **perde** l'accès, qu'elle puisse encore
 * payer, et qu'un clic d'administrateur le lui rende.
 */

beforeAll(() => definirNiveauJournal("silence"));
afterAll(() => definirNiveauJournal("info"));

const MOT_DE_PASSE = "correct-cheval-pile-agrafe";
const MOT_DE_PASSE_ADMIN = "console-securisee-2026";

function cookieDe(reponse: request.Response): string {
  const entete = reponse.headers["set-cookie"];
  const premier = Array.isArray(entete) ? entete[0] : entete;
  return String(premier ?? "").split(";")[0] ?? "";
}

/**
 * Une application neuve par test.
 *
 * Le limiteur de débit en mémoire est porté par les dépendances : le partager
 * entre les tests ferait échouer le sixième au motif que les cinq précédents
 * ont inscrit une entreprise. Chaque test repart donc d'un état propre — et
 * n'a plus aucun ordre d'exécution à respecter.
 */
function contexte() {
  const { dependances, pieces } = assemblerTest();
  const app = creerApp(dependances);

  async function inscrire(suffixe: string): Promise<{ cookie: string; entrepriseId: string }> {
    const reponse = await request(app)
      .post("/api/inscription")
      .send({
        entreprise: { nom: `Boutique ${suffixe}`, secteur: "commerce_detail", pays: "SN" },
        utilisateur: {
          nom: "Mamadou Traoré",
          email: `${suffixe}@traore.sn`,
          mot_de_passe: MOT_DE_PASSE,
        },
      });

    expect(reponse.status).toBe(201);
    return { cookie: cookieDe(reponse), entrepriseId: reponse.body.entreprise.id };
  }

  async function cookieAdmin(email: string): Promise<string> {
    await pieces.depotAdmin.creerAdmin({
      nom: "Administrateur",
      email,
      mot_de_passe_hash: await hacherMotDePasse(MOT_DE_PASSE_ADMIN),
    });

    const reponse = await request(app)
      .post("/api/admin/connexion")
      .send({ email, mot_de_passe: MOT_DE_PASSE_ADMIN });

    expect(reponse.status).toBe(200);
    return cookieDe(reponse);
  }

  return { app, pieces, inscrire, cookieAdmin };
}

describe("Abonnement, blocage et paiement Wave", () => {
  // ------------------------------------------------------------- essai --

  it("offre deux mois d'essai à toute nouvelle entreprise", async () => {
    const { app, inscrire } = contexte();
    const { cookie } = await inscrire("essai");

    const moi = await request(app).get("/api/moi").set("Cookie", cookie);
    expect(moi.status).toBe(200);
    expect(moi.body.entreprise.acces.bloque).toBe(false);
    expect(moi.body.entreprise.acces.motif).toBe("ESSAI");
    // Deux mois : entre 58 et 62 jours selon les mois traversés.
    expect(moi.body.entreprise.acces.jours_restants).toBeGreaterThan(57);
  });

  it("laisse travailler pendant l'essai", async () => {
    const { app, inscrire } = contexte();
    const { cookie } = await inscrire("travail");

    const vente = await request(app)
      .post("/api/ventes")
      .set("Cookie", cookie)
      .send({
        effectuee_le: "2026-09-01",
        lignes: [{ libelle: "Café", quantite: "2", prix_unitaire_mineur: 500 }],
      });

    expect(vente.status).toBe(201);
  });

  // ----------------------------------------------------------- blocage --

  it("ferme l'application dès que l'essai est terminé", async () => {
    const { app, pieces, inscrire } = contexte();
    const { cookie, entrepriseId } = await inscrire("expire");
    pieces.depotAuth.expirerEssai(entrepriseId);

    for (const chemin of ["/api/ventes", "/api/tableau-de-bord", "/api/produits", "/api/questions"]) {
      const reponse = await request(app).get(chemin).set("Cookie", cookie);
      expect(reponse.status, `${chemin} devrait être fermé`).toBe(402);
      expect(reponse.body.erreur.code).toBe("ABONNEMENT_EXPIRE");
    }

    const ecriture = await request(app)
      .post("/api/ventes")
      .set("Cookie", cookie)
      .send({ effectuee_le: "2026-09-01", montant_total_mineur: 1000 });
    expect(ecriture.status).toBe(402);
  });

  it("laisse malgré tout le client se reconnaître, payer et se déconnecter", async () => {
    const { app, pieces, inscrire } = contexte();
    const { cookie, entrepriseId } = await inscrire("issue");
    pieces.depotAuth.expirerEssai(entrepriseId);

    // Sans ces trois portes, un client bloqué n'aurait aucun moyen de sortir
    // du blocage : il faudrait nous écrire pour pouvoir payer.
    const moi = await request(app).get("/api/moi").set("Cookie", cookie);
    expect(moi.status).toBe(200);
    expect(moi.body.entreprise.acces.bloque).toBe(true);
    expect(moi.body.entreprise.acces.motif).toBe("ESSAI_EXPIRE");

    const statut = await request(app).get("/api/paiement/statut").set("Cookie", cookie);
    expect(statut.status).toBe(200);
    expect(statut.body.prix_mensuel).toBe(PRIX_PRO_MENSUEL_XOF);
    expect(statut.body.numero_wave).toBe(NUMERO_WAVE);

    const sortie = await request(app).post("/api/deconnexion").set("Cookie", cookie);
    expect(sortie.status).toBe(204);
  });

  it("n'oppose jamais de blocage à un compte exempté", async () => {
    const { app, pieces, inscrire } = contexte();
    const { cookie, entrepriseId } = await inscrire("exempt");
    pieces.depotAuth.expirerEssai(entrepriseId);
    pieces.depotAuth.exempter(entrepriseId);

    const reponse = await request(app).get("/api/tableau-de-bord").set("Cookie", cookie);
    expect(reponse.status).toBe(200);
  });

  // ---------------------------------------------------------- paiement --

  it("annonce le numéro Wave et le prix, sans inventer de lien de paiement", async () => {
    const { app, inscrire } = contexte();
    const { cookie } = await inscrire("numero");

    const statut = await request(app).get("/api/paiement/statut").set("Cookie", cookie);
    expect(statut.status).toBe(200);
    expect(statut.body.numero_wave).toBe("778608247");
    expect(statut.body.numero_wave_affiche).toBe("77 860 82 47");
    expect(statut.body.prix_mensuel).toBe(2000);
    expect(statut.body.devise).toBe("XOF");
    // Aucun lien Wave Business configuré : `null`, jamais une URL fabriquée.
    expect(statut.body.lien_wave).toBeNull();
  });

  it("enregistre une déclaration de paiement en attente", async () => {
    const { app, inscrire } = contexte();
    const { cookie } = await inscrire("declare");

    const declaration = await request(app)
      .post("/api/paiement/declarer")
      .set("Cookie", cookie)
      .send({ reference_wave: "TIRAJ7K2M9" });

    expect(declaration.status).toBe(201);
    expect(declaration.body.en_attente.statut).toBe("en_attente");
    expect(declaration.body.en_attente.reference_wave).toBe("TIRAJ7K2M9");
    expect(declaration.body.en_attente.montant).toBe(2000);
  });

  it("refuse une deuxième déclaration tant que la première n'est pas tranchée", async () => {
    const { app, inscrire } = contexte();
    const { cookie } = await inscrire("doublon");

    await request(app)
      .post("/api/paiement/declarer")
      .set("Cookie", cookie)
      .send({ reference_wave: "PREMIERE123" });

    const seconde = await request(app)
      .post("/api/paiement/declarer")
      .set("Cookie", cookie)
      .send({ reference_wave: "SECONDE456" });

    expect(seconde.status).toBe(409);
  });

  it("refuse une référence vide ou fantaisiste", async () => {
    const { app, inscrire } = contexte();
    const { cookie } = await inscrire("refvide");

    for (const reference of ["", "ab", "<script>alert(1)</script>"]) {
      const reponse = await request(app)
        .post("/api/paiement/declarer")
        .set("Cookie", cookie)
        .send({ reference_wave: reference });
      expect(reponse.status).toBe(400);
    }
  });

  it("exige une session pour déclarer un paiement", async () => {
    const { app } = contexte();
    const reponse = await request(app)
      .post("/api/paiement/declarer")
      .send({ reference_wave: "ANONYME123" });
    expect(reponse.status).toBe(401);
  });

  it("n'expose plus de route publique capable d'activer un abonnement", async () => {
    const { app } = contexte();
    // Ces deux routes existaient et ouvraient un plan payant à qui les
    // appelait. Leur disparition est une propriété du système, pas un détail
    // d'implémentation : ce test la garde.
    const webhook = await request(app)
      .post("/api/paiement/webhook")
      .send({ reference_transaction: "peu-importe", statut: "valide" });
    expect(webhook.status).toBe(404);

    const simulation = await request(app)
      .post("/api/paiement/simuler-confirmation")
      .send({ reference_transaction: "peu-importe" });
    expect(simulation.status).toBe(404);
  });

  // -------------------------------------------------------- validation --

  it("débloque le client dès qu'un administrateur valide son paiement", async () => {
    const { app, pieces, inscrire, cookieAdmin } = contexte();
    const { cookie, entrepriseId } = await inscrire("valide");
    pieces.depotAuth.expirerEssai(entrepriseId);

    await request(app)
      .post("/api/paiement/declarer")
      .set("Cookie", cookie)
      .send({ reference_wave: "WAVE99XYZ" });

    const admin = await cookieAdmin("valideur@bizly.app");

    const file = await request(app).get("/api/admin/paiements").set("Cookie", admin);
    expect(file.status).toBe(200);
    const attendu = file.body.elements.find(
      (p: { entreprise_id: string }) => p.entreprise_id === entrepriseId,
    );
    expect(attendu).toBeDefined();
    expect(attendu.reference_wave).toBe("WAVE99XYZ");

    const validation = await request(app)
      .post(`/api/admin/paiements/${attendu.id}/valider`)
      .set("Cookie", admin);
    expect(validation.status).toBe(200);
    expect(validation.body.plan).toBe("pro");

    // Le client retrouve l'accès sans se reconnecter.
    const apres = await request(app).get("/api/tableau-de-bord").set("Cookie", cookie);
    expect(apres.status).toBe(200);

    const moi = await request(app).get("/api/moi").set("Cookie", cookie);
    expect(moi.body.entreprise.acces.bloque).toBe(false);
    expect(moi.body.entreprise.acces.motif).toBe("ABONNE");
    expect(moi.body.entreprise.plan).toBe("pro");
  });

  it("refuse de valider deux fois le même paiement", async () => {
    const { app, inscrire, cookieAdmin } = contexte();
    const { cookie, entrepriseId } = await inscrire("deuxfois");
    await request(app)
      .post("/api/paiement/declarer")
      .set("Cookie", cookie)
      .send({ reference_wave: "DOUBLE777" });

    const admin = await cookieAdmin("double@bizly.app");
    const file = await request(app).get("/api/admin/paiements").set("Cookie", admin);
    const cible = file.body.elements.find(
      (p: { entreprise_id: string }) => p.entreprise_id === entrepriseId,
    );

    const premier = await request(app)
      .post(`/api/admin/paiements/${cible.id}/valider`)
      .set("Cookie", admin);
    expect(premier.status).toBe(200);

    const second = await request(app)
      .post(`/api/admin/paiements/${cible.id}/valider`)
      .set("Cookie", admin);
    expect(second.status).toBe(409);
  });

  it("refuse la file et la validation à qui n'est pas administrateur", async () => {
    const { app, inscrire } = contexte();
    const { cookie } = await inscrire("intrus");

    const file = await request(app).get("/api/admin/paiements").set("Cookie", cookie);
    expect(file.status).toBe(401);

    const validation = await request(app)
      .post("/api/admin/paiements/00000000-0000-4000-8000-000000000000/valider")
      .set("Cookie", cookie);
    expect(validation.status).toBe(401);
  });

  it("permet de refuser un paiement, avec un motif que le client lira", async () => {
    const { app, inscrire, cookieAdmin } = contexte();
    const { cookie, entrepriseId } = await inscrire("refus");
    await request(app)
      .post("/api/paiement/declarer")
      .set("Cookie", cookie)
      .send({ reference_wave: "INTROUVABLE1" });

    const admin = await cookieAdmin("refuseur@bizly.app");
    const file = await request(app).get("/api/admin/paiements").set("Cookie", admin);
    const cible = file.body.elements.find(
      (p: { entreprise_id: string }) => p.entreprise_id === entrepriseId,
    );

    const refus = await request(app)
      .post(`/api/admin/paiements/${cible.id}/refuser`)
      .set("Cookie", admin)
      .send({ motif: "Aucun versement retrouvé avec cette référence." });
    expect(refus.status).toBe(204);

    const statut = await request(app).get("/api/paiement/statut").set("Cookie", cookie);
    expect(statut.body.en_attente).toBeNull();
    expect(statut.body.historique[0].statut).toBe("echoue");
    expect(statut.body.historique[0].motif_refus).toContain("Aucun versement");
  });

  it("exige un motif pour refuser", async () => {
    const { app, cookieAdmin } = contexte();
    const admin = await cookieAdmin("sansmotif@bizly.app");
    const reponse = await request(app)
      .post("/api/admin/paiements/00000000-0000-4000-8000-000000000000/refuser")
      .set("Cookie", admin)
      .send({ motif: "" });
    expect(reponse.status).toBe(400);
  });
});
