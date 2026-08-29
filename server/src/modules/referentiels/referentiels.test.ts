import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEVISES_RAPIDES, PAYS, paysParCode } from "@bizly/shared";
import { creerApp } from "../../app.js";
import { fuseauValide } from "../../domaine/temps.js";
import { definirNiveauJournal } from "../../http/journal.js";
import { dependancesTest } from "../../test-utils/dependancesTest.js";
import { trouverRacineDepot } from "../../util/racine.js";

/**
 * `GET /api/referentiels` et la liste de pays — docs/API-CONTRACT.md §7.
 */

beforeAll(() => definirNiveauJournal("silence"));
afterAll(() => definirNiveauJournal("info"));

const app = creerApp(dependancesTest());

describe("GET /api/referentiels", () => {
  it("répond sans session — l'inscription en a besoin avant tout compte", async () => {
    const reponse = await request(app).get("/api/referentiels");

    expect(reponse.status).toBe(200);
    expect(reponse.body.devises.length).toBeGreaterThan(0);
    expect(reponse.body.secteurs.length).toBeGreaterThan(0);
  });

  it("met en avant le franc CFA, l'euro et le dollar", async () => {
    const reponse = await request(app).get("/api/referentiels");

    expect(reponse.body.devises_rapides).toEqual(["XOF", "EUR", "USD"]);
  });

  it("porte les décimales de chaque devise, jamais un 2 supposé", async () => {
    const reponse = await request(app).get("/api/referentiels");
    const parCode = new Map<string, number>(
      (reponse.body.devises as { code: string; decimales: number }[]).map((d) => [
        d.code,
        d.decimales,
      ]),
    );

    expect(parCode.get("EUR")).toBe(2);
    expect(parCode.get("XOF")).toBe(0);
    expect(parCode.get("TND")).toBe(3);
  });

  it("renvoie la liste des pays avec leur devise et leur fuseau", async () => {
    const reponse = await request(app).get("/api/referentiels");
    const senegal = (reponse.body.pays as { code: string; devise: string; fuseau: string }[]).find(
      (p) => p.code === "SN",
    );

    expect(senegal).toEqual({
      code: "SN",
      nom: "Sénégal",
      devise: "XOF",
      fuseau: "Africa/Dakar",
    });
  });

  it("se laisse mettre en cache — la liste bouge moins qu'une migration", async () => {
    const reponse = await request(app).get("/api/referentiels");

    expect(reponse.headers["cache-control"]).toBe("public, max-age=3600");
  });
});

describe("liste des pays", () => {
  it("n'a aucun code en double", () => {
    const codes = PAYS.map((pays) => pays.code);

    expect(new Set(codes).size).toBe(codes.length);
  });

  it("ne porte que des fuseaux IANA que le moteur sait interpréter", () => {
    const fautifs = PAYS.filter((pays) => !fuseauValide(pays.fuseau)).map((p) => p.code);

    expect(fautifs).toEqual([]);
  });

  /**
   * L'invariant qui compte.
   *
   * Un pays dont la devise n'existe pas en base produirait une inscription
   * refusée pour « devise inconnue » — sur un choix que l'écran a lui-même
   * proposé. On vérifie donc contre les migrations réelles, pas contre une
   * liste recopiée qui divergerait avec elles.
   */
  it("ne propose que des devises présentes dans les migrations", () => {
    const dossier = path.join(trouverRacineDepot(), "db", "migrations");
    const sql = readdirSync(dossier)
      .filter((nom) => nom.endsWith(".sql"))
      .map((nom) => readFileSync(path.join(dossier, nom), "utf8"))
      .join("\n");

    const bloc = sql.matchAll(/\(\s*'([A-Z]{3})'\s*,\s*'[^']*'\s*,\s*'[^']*'\s*,\s*\d\s*\)/g);
    const devisesEnBase = new Set([...bloc].map((occurrence) => occurrence[1]));

    expect(devisesEnBase.size).toBeGreaterThanOrEqual(20);

    const orphelins = PAYS.filter((pays) => !devisesEnBase.has(pays.devise)).map(
      (pays) => `${pays.code} → ${pays.devise}`,
    );
    expect(orphelins).toEqual([]);
  });

  it("comprend les trois devises mises en avant", () => {
    for (const code of DEVISES_RAPIDES) {
      expect(PAYS.some((pays) => pays.devise === code)).toBe(true);
    }
  });

  it("retrouve un pays sans se soucier de la casse ni des espaces", () => {
    expect(paysParCode(" sn ")?.nom).toBe("Sénégal");
    expect(paysParCode("XX")).toBeNull();
    expect(paysParCode(null)).toBeNull();
  });
});
