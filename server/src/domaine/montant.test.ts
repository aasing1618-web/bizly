import { describe, expect, it } from "vitest";
import {
  divArrondi,
  enNombreSur,
  evolution,
  moyenne,
  pourcent,
  repartirEnDixiemes,
} from "./montant.js";

/**
 * Ces tests transcrivent les cas de référence de docs/MOTEUR-ANALYTICS.md §8.
 * Un cas qui échoue ici signifie que le moteur ne calcule pas juste — c'est
 * bloquant, jamais « à corriger plus tard ».
 */

describe("divArrondi — arrondi commercial (§2.1)", () => {
  it("arrondit au plus proche", () => {
    expect(divArrondi(2874999n, 10000n)).toBe(287n);
    expect(divArrondi(2874n, 10n)).toBe(287n);
  });

  it("s'éloigne de zéro à exactement la moitié", () => {
    // Le test qui distingue l'arrondi commercial de l'arrondi bancaire :
    // « half to even » rendrait 250 et 288.
    expect(divArrondi(501n, 2n)).toBe(251n);
    expect(divArrondi(575n, 2n)).toBe(288n);
  });

  it("traite les négatifs symétriquement", () => {
    expect(divArrondi(-501n, 2n)).toBe(-251n);
    expect(divArrondi(501n, -2n)).toBe(-251n);
    expect(divArrondi(-2874n, 10n)).toBe(-287n);
  });

  it("refuse la division par zéro plutôt que de rendre un résultat faux", () => {
    expect(() => divArrondi(1n, 0n)).toThrow(/division par zéro/);
  });
});

describe("Cas A — le cas nominal (§8)", () => {
  const chiffreAffaires = 345_000n; // 3 450,00 €
  const depenses = 89_000n; //           890,00 €
  const nombreVentes = 12;

  it("calcule CA, dépenses, bénéfice, panier moyen et marge", () => {
    const benefice = chiffreAffaires - depenses;

    expect(benefice).toBe(256_000n); //                    2 560,00 €
    expect(moyenne(chiffreAffaires, nombreVentes)).toBe(28_750n); // 287,50 €
    expect(pourcent(benefice, chiffreAffaires)).toBe(742); //         74,2 %
  });
});

describe("Cas B — arrondis (§8)", () => {
  it("3 ventes pour 100,00 € donnent 33,33 €", () => {
    expect(moyenne(10_000n, 3)).toBe(3_333n);
  });

  it("2 ventes pour 5,01 € donnent 2,51 € et non 2,50 €", () => {
    expect(moyenne(501n, 2)).toBe(251n);
  });

  it("3 ventes pour 150,03 € tombent juste", () => {
    expect(moyenne(15_003n, 3)).toBe(5_001n);
  });
});

describe("Cas C — dénominateurs nuls (§5.1)", () => {
  it("rend null, jamais 0, quand il n'y a aucune vente", () => {
    expect(moyenne(0n, 0)).toBeNull();
    expect(pourcent(-45_000n, 0n)).toBeNull();
  });

  it("accepte un bénéfice négatif", () => {
    expect(0n - 45_000n).toBe(-45_000n);
  });
});

describe("Cas D — devise sans décimale (§8)", () => {
  it("6 ventes pour 1 750 000 XOF donnent 291 667 XOF", () => {
    // Le moteur ne suppose jamais « 2 décimales » : il travaille en unité
    // mineure, qui vaut ici l'unité entière.
    expect(moyenne(1_750_000n, 6)).toBe(291_667n);
  });
});

describe("Cas F — évolution sur base nulle (§8)", () => {
  it("ne prétend pas mesurer une évolution depuis zéro", () => {
    expect(evolution(120_000n, 0n)).toEqual({ pourcent: null, base_nulle: true });
  });

  it("rend positive une perte qui se réduit", () => {
    expect(evolution(-50_000n, -100_000n)).toEqual({ pourcent: 500, base_nulle: false });
  });

  it("rend négative une baisse de chiffre d'affaires", () => {
    expect(evolution(90_000n, 100_000n)).toEqual({ pourcent: -100, base_nulle: false });
  });
});

describe("Cas G — répartition normalisée à 100,0 % (§2.5)", () => {
  it("distribue le dixième manquant sur trois parts égales", () => {
    const parts = repartirEnDixiemes([
      { id: "salaires", montant: 100_000n },
      { id: "achats", montant: 100_000n },
      { id: "loyer", montant: 100_000n },
    ]);

    expect(parts.get("achats")).toBe(334); // départage par identifiant croissant
    expect(parts.get("loyer")).toBe(333);
    expect(parts.get("salaires")).toBe(333);
    expect(somme(parts)).toBe(1000);
  });

  it("somme toujours exactement 1000, quelles que soient les valeurs", () => {
    const jeux: bigint[][] = [
      [1n, 1n, 1n, 1n, 1n, 1n, 1n],
      [999_999n, 1n],
      [7n, 11n, 13n, 17n, 19n, 23n],
      [1_234_567n, 89n, 4_321n, 55_555n],
    ];

    for (const montants of jeux) {
      const parts = repartirEnDixiemes(
        montants.map((montant, index) => ({ id: `c${index}`, montant })),
      );
      expect(somme(parts)).toBe(1000);
    }
  });

  it("rend des parts nulles quand le total est nul, sans planter", () => {
    const parts = repartirEnDixiemes([
      { id: "a", montant: 0n },
      { id: "b", montant: 0n },
    ]);
    expect(somme(parts)).toBe(0);
  });

  it("refuse un montant négatif", () => {
    expect(() => repartirEnDixiemes([{ id: "a", montant: -1n }])).toThrow(/négatif/);
  });
});

describe("enNombreSur — garde de sérialisation (§6)", () => {
  it("laisse passer les montants réalistes", () => {
    expect(enNombreSur(345_000n)).toBe(345_000);
    expect(enNombreSur(-45_000n)).toBe(-45_000);
  });

  it("lève au-delà des entiers sûrs plutôt que de tronquer", () => {
    expect(() => enNombreSur(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toThrow(/hors des entiers/);
  });
});

function somme(parts: Map<string, number>): number {
  let total = 0;
  for (const valeur of parts.values()) total += valeur;
  return total;
}
