import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creerApp } from "./app.js";
import type { EtatBase } from "./db/sonde.js";
import { definirNiveauJournal } from "./http/journal.js";
import { dependancesTest } from "./test-utils/dependancesTest.js";

/**
 * Tests du socle HTTP.
 *
 * Aucune base, aucun `.env` : `creerApp` reçoit toutes ses dépendances, dont la
 * sonde de base. C'est précisément ce que cette injection permet de vérifier —
 * y compris le comportement quand Postgres est mort, impossible à provoquer
 * autrement.
 */

function app(sonderBase: () => Promise<EtatBase>) {
  return creerApp(dependancesTest({ sonderBase, demarreLe: Date.now() - 5_000 }));
}

const baseEnForme = async (): Promise<EtatBase> => ({ statut: "ok", latence_ms: 12 });
const baseMorte = async (): Promise<EtatBase> => ({ statut: "erreur", latence_ms: null });

describe("GET /api/health", () => {
  it("répond 200 et statut « ok » quand la base répond", async () => {
    const reponse = await request(app(baseEnForme)).get("/api/health");

    expect(reponse.status).toBe(200);
    expect(reponse.body).toMatchObject({
      statut: "ok",
      version: "0.1.0-test",
      base: { statut: "ok", latence_ms: 12 },
    });
    expect(reponse.body.uptime_s).toBeGreaterThanOrEqual(4);
    expect(typeof reponse.body.horodatage).toBe("string");
  });

  it("répond 503 quand la base ne répond pas", async () => {
    // 503 et non 200 : sinon l'hébergeur route du trafic vers un processus
    // incapable de servir la moindre page utile.
    const reponse = await request(app(baseMorte)).get("/api/health");

    expect(reponse.status).toBe(503);
    expect(reponse.body).toMatchObject({
      statut: "degrade",
      base: { statut: "erreur", latence_ms: null },
    });
  });

  it("n'expose ni hôte, ni nom de base, ni message Postgres", async () => {
    const reponse = await request(app(baseMorte)).get("/api/health");
    const corps = JSON.stringify(reponse.body);

    expect(corps).not.toMatch(/supabase|postgres|password|@/i);
  });
});

describe("routes d'API inconnues", () => {
  it("répond 404 en JSON, jamais l'index.html du SPA", async () => {
    const reponse = await request(app(baseEnForme)).get("/api/nexiste-pas");

    expect(reponse.status).toBe(404);
    expect(reponse.type).toBe("application/json");
    expect(reponse.body.erreur.code).toBe("ROUTE_INTROUVABLE");
  });

  it("répond 404 sur une méthode non déclarée d'une route existante", async () => {
    const reponse = await request(app(baseEnForme)).post("/api/health");

    expect(reponse.status).toBe(404);
    expect(reponse.body.erreur.code).toBe("ROUTE_INTROUVABLE");
  });
});

describe("corps de requête invalide", () => {
  it("répond 400 JSON_INVALIDE sur du JSON malformé", async () => {
    const reponse = await request(app(baseEnForme))
      .post("/api/health")
      .set("Content-Type", "application/json")
      .send('{"incomplet":');

    expect(reponse.status).toBe(400);
    expect(reponse.body.erreur.code).toBe("JSON_INVALIDE");
  });
});

describe("erreur inattendue", () => {
  beforeAll(() => definirNiveauJournal("silence"));
  afterAll(() => definirNiveauJournal("info"));

  it("est convertie en 500 opaque, sans fuite de détail", async () => {
    const sondeQuiExplose = async (): Promise<EtatBase> => {
      throw new Error("mot de passe = hunter2, hôte = db.interne");
    };

    const reponse = await request(app(sondeQuiExplose)).get("/api/health");

    expect(reponse.status).toBe(500);
    expect(reponse.body.erreur.code).toBe("ERREUR_INTERNE");
    expect(JSON.stringify(reponse.body)).not.toMatch(/hunter2|db\.interne/);
  });
});

describe("en-têtes", () => {
  it("pose les en-têtes de sécurité et un identifiant de requête", async () => {
    const reponse = await request(app(baseEnForme)).get("/api/health");

    expect(reponse.headers["x-content-type-options"]).toBe("nosniff");
    expect(reponse.headers["x-frame-options"]).toBe("DENY");
    expect(reponse.headers["referrer-policy"]).toBe("no-referrer");
    expect(reponse.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(reponse.headers["x-powered-by"]).toBeUndefined();
  });

  it("donne un identifiant différent à chaque requête", async () => {
    const serveur = app(baseEnForme);
    const [a, b] = await Promise.all([
      request(serveur).get("/api/health"),
      request(serveur).get("/api/health"),
    ]);

    expect(a.headers["x-request-id"]).not.toBe(b.headers["x-request-id"]);
  });

  it("n'annonce pas HSTS hors production", async () => {
    // En développement le serveur est en HTTP : poser HSTS bloquerait
    // localhost dans le navigateur, parfois durablement.
    const reponse = await request(app(baseEnForme)).get("/api/health");
    expect(reponse.headers["strict-transport-security"]).toBeUndefined();
  });
});
