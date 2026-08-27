import { describe, expect, it } from "vitest";
import { calculerKpi, type DepenseAgregable, type VenteAgregable } from "./kpi.js";
import { construireComparaison, construirePeriode } from "./periodes.js";

/**
 * CAS DE RÉFÉRENCE MÉTIER — « Boutique Test », fourni par le propriétaire du
 * projet le 27 août 2026 (§7 de sa spécification).
 *
 * Ces chiffres ne viennent pas de moi : ils ont été posés et vérifiés à la main
 * côté métier, puis recalculés indépendamment avant d'être encodés ici. C'est la
 * seule partie de la spécification que le code ne peut pas produire tout seul.
 *
 * **Ce fichier ne couvre que ce que le modèle de données actuel permet de
 * répondre.** Les questions qui demandent un catalogue de produits (coût,
 * marge, catégorie) ou des clients rattachés aux ventes sont listées dans
 * `docs/ECARTS-SPEC.md` — elles ne sont pas silencieusement omises.
 */

// Sénégal : UTC+0 toute l'année. La spécification métier exclut toute
// conversion de fuseau ; ce choix rend le cas de référence insensible au sujet.
const DAKAR = "Africa/Dakar";
const EUR = { code: "EUR", decimales: 2 };

/** « Aujourd'hui » de la spécification. */
const MAINTENANT = new Date("2026-08-27T12:00:00Z");

/** Une vente de la spécification, ramenée au modèle Bizly. */
function vente(date: string, total: number): VenteAgregable {
  return {
    effectuee_le: new Date(`${date}T12:00:00Z`),
    montant_total_mineur: BigInt(total),
    moyen_paiement: null,
  };
}

function depense(date: string, montant: number, categorie: string): DepenseAgregable {
  return {
    effectuee_le: new Date(`${date}T12:00:00Z`),
    montant_mineur: BigInt(montant),
    categorie_id: categorie,
  };
}

// Les 10 ventes du §7, en centimes.
const VENTES = [
  vente("2026-08-02", 4000), // T-shirt ×2
  vente("2026-08-02", 1500), // Casquette ×1
  vente("2026-08-03", 3500), // Sac ×1
  vente("2026-08-05", 2000), // T-shirt ×1
  vente("2026-08-07", 4500), // Pull ×1
  vente("2026-08-09", 4500), // Casquette ×3
  vente("2026-08-10", 2000), // T-shirt ×1
  vente("2026-08-12", 3500), // Sac ×1
  vente("2026-08-13", 4500), // Pull ×1
  vente("2026-08-14", 1500), // Casquette ×1
];

const DEPENSES = [
  depense("2026-08-01", 20000, "loyer"),
  depense("2026-08-03", 4500, "fournitures"),
  depense("2026-08-06", 6000, "marketing"),
  depense("2026-08-09", 2500, "fournitures"),
  depense("2026-08-11", 3000, "transport"),
  depense("2026-08-14", 1500, "marketing"),
];

/**
 * Période précédente : la spécification n'en donne que les agrégats
 * (CA 280,00 €, 9 ventes, dépenses 260,00 €). On les reconstitue par des
 * lignes qui somment exactement à ces totaux — le moteur ne voit que la somme
 * et le compte.
 */
const VENTES_PRECEDENTES = [
  vente("2026-07-18", 4000),
  vente("2026-07-19", 3000),
  vente("2026-07-20", 3000),
  vente("2026-07-21", 3000),
  vente("2026-07-22", 3000),
  vente("2026-07-24", 3000),
  vente("2026-07-26", 3000),
  vente("2026-07-28", 3000),
  vente("2026-07-30", 3000),
];

const DEPENSES_PRECEDENTES = [
  depense("2026-07-18", 20000, "loyer"),
  depense("2026-07-25", 6000, "marketing"),
];

const LIBELLES = new Map([
  ["loyer", "Loyer"],
  ["fournitures", "Fournitures"],
  ["marketing", "Marketing"],
  ["transport", "Transport"],
]);

/**
 * Agrégat des lignes de vente, tel que la base le rendrait : regroupé par
 * libellé, trié par montant décroissant.
 */
const TOP_PRODUITS = [
  { libelle: "Pull", quantite: "2.000", montant: 9000n },
  { libelle: "T-shirt", quantite: "4.000", montant: 8000n },
  { libelle: "Casquette", quantite: "5.000", montant: 7500n },
  { libelle: "Sac", quantite: "2.000", montant: 7000n },
];

// La période du §7 : 15 jours, du 1er au 15 août inclus.
const periode = construirePeriode(
  { cle: "personnalisee", du: "2026-08-01", au: "2026-08-15" },
  DAKAR,
  MAINTENANT,
);
const comparaison = construireComparaison(periode, MAINTENANT);

const resultat = calculerKpi({
  ventes: VENTES,
  depenses: DEPENSES,
  ventesPrecedentes: VENTES_PRECEDENTES,
  depensesPrecedentes: DEPENSES_PRECEDENTES,
  periode,
  comparaison,
  devise: EUR,
  libellesCategories: LIBELLES,
  topProduits: TOP_PRODUITS,
});

describe("cas de référence métier — période", () => {
  it("couvre bien le 1er au 15 août, 15 jours", () => {
    expect(resultat.periode.debut_local).toBe("2026-08-01");
    expect(resultat.periode.fin_local).toBe("2026-08-15");
    expect(resultat.serie_ca_par_jour).toHaveLength(15);
  });

  it("compare aux 15 jours qui précèdent, du 17 au 31 juillet", () => {
    // La règle du métier — « même nombre de jours, se terminant la veille » —
    // coïncide avec celle déjà implémentée pour une période personnalisée.
    expect(resultat.comparaison.debut_local).toBe("2026-07-17");
    expect(resultat.comparaison.fin_local).toBe("2026-07-31");
    expect(resultat.comparaison.a_date).toBe(false);
  });
});

describe("cas de référence métier — agrégats", () => {
  it("CA = 315,00 €", () => {
    expect(resultat.kpi.chiffre_affaires.valeur).toBe(31500);
  });

  it("nombre de ventes = 10", () => {
    expect(resultat.kpi.nombre_ventes.valeur).toBe(10);
  });

  it("dépenses = 375,00 €", () => {
    expect(resultat.kpi.depenses_totales.valeur).toBe(37500);
  });

  it("bénéfice = −60,00 €, jamais tronqué à zéro", () => {
    expect(resultat.kpi.benefice.valeur).toBe(-6000);
  });

  it("panier moyen = 31,50 €", () => {
    expect(resultat.kpi.panier_moyen.valeur).toBe(3150);
  });
});

describe("cas de référence métier — évolutions", () => {
  it("CA : +12,5 % (280,00 € → 315,00 €)", () => {
    expect(resultat.kpi.chiffre_affaires.evolution_pourcent).toBe(125);
  });

  it("dépenses : +44,2 % (260,00 € → 375,00 €)", () => {
    expect(resultat.kpi.depenses_totales.evolution_pourcent).toBe(442);
  });

  it("nombre de ventes : +11,1 % (9 → 10)", () => {
    expect(resultat.kpi.nombre_ventes.evolution_pourcent).toBe(111);
  });

  it("panier moyen : +1,3 % (31,11 € → 31,50 €)", () => {
    // Le cas qui teste la convention d'arrondi : la valeur exacte est
    // +1,25 %, et le demi se résout vers le haut.
    expect(resultat.kpi.panier_moyen.evolution_pourcent).toBe(13);
  });
});

describe("cas de référence métier — répartition des dépenses", () => {
  it("Loyer 200,00 € (53,3 %), Marketing 75,00 € (20,0 %), Fournitures 70,00 € (18,7 %), Transport 30,00 € (8,0 %)", () => {
    expect(resultat.repartition_depenses).toEqual([
      { id: "loyer", libelle: "Loyer", montant: 20000, part_dixiemes: 533 },
      { id: "marketing", libelle: "Marketing", montant: 7500, part_dixiemes: 200 },
      { id: "fournitures", libelle: "Fournitures", montant: 7000, part_dixiemes: 187 },
      { id: "transport", libelle: "Transport", montant: 3000, part_dixiemes: 80 },
    ]);
  });

  it("désigne le Loyer comme poste le plus important", () => {
    expect(resultat.repartition_depenses[0]?.libelle).toBe("Loyer");
  });
});

describe("cas de référence métier — produits", () => {
  it("le Pull génère le plus de chiffre d'affaires : 90,00 €", () => {
    expect(resultat.top_produits[0]).toEqual({
      libelle: "Pull",
      quantite: "2.000",
      montant: 9000,
    });
  });

  it("rend le chiffre d'affaires de chaque produit", () => {
    const parLibelle = Object.fromEntries(
      resultat.top_produits.map((produit) => [produit.libelle, produit.montant]),
    );
    expect(parLibelle).toEqual({ Pull: 9000, "T-shirt": 8000, Casquette: 7500, Sac: 7000 });
  });

  it("la somme des produits égale le chiffre d'affaires", () => {
    const total = resultat.top_produits.reduce((somme, produit) => somme + produit.montant, 0);
    expect(total).toBe(resultat.kpi.chiffre_affaires.valeur);
  });
});

describe("cas de référence métier — cohérence interne", () => {
  it("la série journalière somme au chiffre d'affaires", () => {
    const total = resultat.serie_ca_par_jour.reduce((somme, point) => somme + point.ca, 0);
    expect(total).toBe(31500);
  });

  it("place chaque vente au bon jour", () => {
    const deuxAout = resultat.serie_ca_par_jour.find((p) => p.date_locale === "2026-08-02");
    expect(deuxAout).toEqual({ date_locale: "2026-08-02", ca: 5500, nombre_ventes: 2 });
  });

  it("laisse à zéro les jours sans vente, sans les omettre", () => {
    const premierAout = resultat.serie_ca_par_jour.find((p) => p.date_locale === "2026-08-01");
    expect(premierAout).toEqual({ date_locale: "2026-08-01", ca: 0, nombre_ventes: 0 });
  });
});

describe("cas de référence métier — bénéfice, signe traversé", () => {
  it("rend l'écart en montant : −80,00 €", () => {
    // Bénéfice précédent : 280 − 260 = +20,00 €. Bénéfice actuel : −60,00 €.
    expect(resultat.kpi.benefice.evolution_montant).toBe(-8000);
  });

  it("ne rend AUCUN pourcentage quand le signe est traversé", () => {
    // −400,0 % serait techniquement exact et parfaitement illisible.
    expect(resultat.kpi.benefice.evolution_pourcent).toBeNull();
  });

  it("rend bien un pourcentage quand le signe ne change pas", () => {
    expect(resultat.kpi.chiffre_affaires.evolution_pourcent).toBe(125);
    expect(resultat.kpi.chiffre_affaires.evolution_montant).toBe(3500);
  });
});
