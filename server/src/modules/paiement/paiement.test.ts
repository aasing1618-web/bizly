import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creerApp } from "../../app.js";
import { definirNiveauJournal } from "../../http/journal.js";
import { dependancesTest } from "../../test-utils/dependancesTest.js";

beforeAll(() => definirNiveauJournal("silence"));
afterAll(() => definirNiveauJournal("info"));

const MOT_DE_PASSE = "correct-cheval-pile-agrafe";

describe("Module de Paiement (Wave & Orange Money)", () => {
  const dependances = dependancesTest();
  const app = creerApp(dependances);

  async function inscrire(suffixe = "a"): Promise<string> {
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

    const entete = reponse.headers["set-cookie"];
    const premier = Array.isArray(entete) ? entete[0] : entete;
    return String(premier ?? "").split(";")[0] ?? "";
  }

  it("refuse l'initialisation sans session", async () => {
    const res = await request(app).post("/api/paiement/initialiser").send({
      plan: "pro",
      cycle: "mensuel",
      moyen_paiement: "wave",
    });
    expect(res.status).toBe(401);
  });

  it("initialise une transaction Wave pour le plan Pro Mensuel (2 500 FCFA)", async () => {
    const cookie = await inscrire("wave1");
    const res = await request(app)
      .post("/api/paiement/initialiser")
      .set("Cookie", cookie)
      .send({
        plan: "pro",
        cycle: "mensuel",
        moyen_paiement: "wave",
      });

    expect(res.status).toBe(201);
    expect(res.body.montant).toBe(2500);
    expect(res.body.plan).toBe("pro");
    expect(res.body.moyen_paiement).toBe("wave");
    expect(res.body.reference_transaction).toMatch(/^BIZ-PAY-/);
  });

  it("initialise une transaction Orange Money pour le plan Business Annuel (50 000 FCFA)", async () => {
    const cookie = await inscrire("om1");
    const res = await request(app)
      .post("/api/paiement/initialiser")
      .set("Cookie", cookie)
      .send({
        plan: "business",
        cycle: "annuel",
        moyen_paiement: "orange_money",
      });

    expect(res.status).toBe(201);
    expect(res.body.montant).toBe(50000);
    expect(res.body.plan).toBe("business");
    expect(res.body.moyen_paiement).toBe("orange_money");
  });

  it("valide la transaction via Webhook et active le plan Pro", async () => {
    const cookie = await inscrire("webhook1");
    const init = await request(app)
      .post("/api/paiement/initialiser")
      .set("Cookie", cookie)
      .send({
        plan: "pro",
        cycle: "mensuel",
        moyen_paiement: "wave",
      });

    const ref = init.body.reference_transaction;

    const webhookRes = await request(app).post("/api/paiement/webhook").send({
      reference_transaction: ref,
      statut: "valide",
    });

    expect(webhookRes.status).toBe(200);
    expect(webhookRes.body.succes).toBe(true);

    const statutRes = await request(app).get("/api/paiement/statut").set("Cookie", cookie);
    expect(statutRes.status).toBe(200);
    expect(statutRes.body.plan).toBe("pro");
    expect(statutRes.body.est_payant).toBe(true);
  });

  it("permets de simuler la confirmation en 1 clic pour les tests", async () => {
    const cookie = await inscrire("simul1");
    const init = await request(app)
      .post("/api/paiement/initialiser")
      .set("Cookie", cookie)
      .send({
        plan: "business",
        cycle: "annuel",
        moyen_paiement: "orange_money",
      });

    const ref = init.body.reference_transaction;

    const simRes = await request(app)
      .post("/api/paiement/simuler-confirmation")
      .set("Cookie", cookie)
      .send({ reference_transaction: ref });

    expect(simRes.status).toBe(200);
    expect(simRes.body.succes).toBe(true);

    const statutRes = await request(app).get("/api/paiement/statut").set("Cookie", cookie);
    expect(statutRes.body.plan).toBe("business");
  });
});
