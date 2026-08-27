import { describe, expect, it } from "vitest";
import { diagnostiquerConnexion, optionsTls } from "./options.js";

describe("optionsTls", () => {
  it("vérifie le certificat par défaut", () => {
    expect(optionsTls("require")).toEqual({ rejectUnauthorized: true });
  });

  it("permet de désactiver la vérification, explicitement", () => {
    expect(optionsTls("no-verify")).toEqual({ rejectUnauthorized: false });
  });

  it("permet de couper TLS, explicitement", () => {
    expect(optionsTls("disable")).toBe(false);
  });
});

describe("diagnostiquerConnexion", () => {
  const poolerValide =
    "postgresql://postgres.abcdefghijkl:motdepasse@aws-0-eu-west-3.pooler.supabase.com:6543/postgres";

  it("valide le pooler Supabase en 6543 sans rien signaler", () => {
    const diagnostic = diagnostiquerConnexion(poolerValide, "require");

    expect(diagnostic.estPoolerSupabase).toBe(true);
    expect(diagnostic.port).toBe(6543);
    expect(diagnostic.avertissements).toEqual([]);
  });

  it("n'expose jamais le mot de passe, même dans les avertissements", () => {
    const diagnostic = diagnostiquerConnexion(poolerValide, "no-verify");
    const tout = JSON.stringify(diagnostic);

    expect(tout).not.toContain("motdepasse");
  });

  it("signale une connexion directe en 5432", () => {
    // Décision d'architecture figée : le pooler, pas la connexion directe.
    // Le nombre de connexions directes est très limité chez Supabase.
    const diagnostic = diagnostiquerConnexion(
      "postgresql://postgres:x@db.abcdefghijkl.supabase.co:5432/postgres",
      "require",
    );

    expect(diagnostic.estPoolerSupabase).toBe(false);
    expect(diagnostic.avertissements.join(" ")).toMatch(/6543/);
  });

  it("signale une URL illisible plutôt que de planter", () => {
    const diagnostic = diagnostiquerConnexion("pas-une-url", "require");

    expect(diagnostic.hote).toBeNull();
    expect(diagnostic.avertissements.join(" ")).toMatch(/URL valide/);
  });

  it("signale un TLS coupé ou non vérifié", () => {
    expect(diagnostiquerConnexion(poolerValide, "disable").avertissements.join(" ")).toMatch(
      /n'est PAS chiffrée/,
    );
    expect(diagnostiquerConnexion(poolerValide, "no-verify").avertissements.join(" ")).toMatch(
      /n'est pas vérifié/,
    );
  });
});
