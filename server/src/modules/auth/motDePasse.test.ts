import { describe, expect, it } from "vitest";
import { hacherMotDePasse, verifierMotDePasse } from "./motDePasse.js";
import { creerJetonSession, empreinteJeton, ressembleAUnJeton } from "./jetons.js";

describe("hachage des mots de passe", () => {
  it("vérifie le bon mot de passe et rejette les autres", async () => {
    const empreinte = await hacherMotDePasse("correct-cheval-pile-agrafe");

    expect(await verifierMotDePasse("correct-cheval-pile-agrafe", empreinte)).toBe(true);
    expect(await verifierMotDePasse("correct-cheval-pile-agrafa", empreinte)).toBe(false);
    expect(await verifierMotDePasse("", empreinte)).toBe(false);
  });

  it("produit une empreinte différente à chaque appel, sur le même mot de passe", async () => {
    const a = await hacherMotDePasse("correct-cheval-pile-agrafe");
    const b = await hacherMotDePasse("correct-cheval-pile-agrafe");

    // Sel aléatoire : deux comptes avec le même mot de passe ne se repèrent pas
    // en comparant les empreintes.
    expect(a).not.toBe(b);
    expect(await verifierMotDePasse("correct-cheval-pile-agrafe", b)).toBe(true);
  });

  it("transporte ses paramètres avec l'empreinte", async () => {
    const empreinte = await hacherMotDePasse("correct-cheval-pile-agrafe");
    const [algorithme, N, r, p] = empreinte.split("$");

    // Sans eux, durcir les paramètres rendrait tous les mots de passe existants
    // invérifiables d'un coup.
    expect(algorithme).toBe("scrypt");
    expect(Number(N)).toBe(32768);
    expect(Number(r)).toBe(8);
    expect(Number(p)).toBe(1);
  });

  it("accepte les caractères non ASCII et les normalise", async () => {
    const empreinte = await hacherMotDePasse("mot-de-passe-éàü-2026");
    expect(await verifierMotDePasse("mot-de-passe-éàü-2026", empreinte)).toBe(true);
  });

  it("rend false — jamais une exception — sur une empreinte corrompue", async () => {
    // Une ligne abîmée en base ne doit pas produire un 500 qui distinguerait
    // un compte existant d'un compte inconnu.
    for (const corrompue of ["", "n'importe quoi", "scrypt$x$y$z$a$b", "bcrypt$1$2$3$c2Vs$aGFzaA==", "$$$$$"]) {
      await expect(verifierMotDePasse("peu importe", corrompue)).resolves.toBe(false);
    }
  });
});

describe("jetons de session", () => {
  it("produit un jeton distinct à chaque appel", () => {
    const jetons = new Set(Array.from({ length: 50 }, () => creerJetonSession().clair));
    expect(jetons.size).toBe(50);
  });

  it("stocke un SHA-256 de 32 octets — la contrainte que la table impose", () => {
    const jeton = creerJetonSession();
    expect(jeton.empreinte).toHaveLength(32);
    expect(empreinteJeton(jeton.clair).equals(jeton.empreinte)).toBe(true);
  });

  it("ne permet pas de remonter au jeton depuis l'empreinte", () => {
    const jeton = creerJetonSession();
    // Le clair ne doit apparaître nulle part dans ce qui est stocké.
    expect(jeton.empreinte.toString("hex")).not.toContain(jeton.clair);
    expect(jeton.clair).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("écarte d'emblée ce qui ne peut pas être un jeton", () => {
    expect(ressembleAUnJeton(creerJetonSession().clair)).toBe(true);

    for (const mauvais of ["", "court", "a".repeat(200), "avec espace", "slash/plus+egal="]) {
      expect(ressembleAUnJeton(mauvais)).toBe(false);
    }
  });
});
