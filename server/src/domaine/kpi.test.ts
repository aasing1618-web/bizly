import { describe, expect, it } from "vitest";
import { calculerKpi, type DepenseAgregable, type EntreesKpi, type VenteAgregable } from "./kpi.js";
import { construireComparaison, construirePeriode } from "./periodes.js";

/**
 * Cas de référence de `docs/MOTEUR-ANALYTICS.md` §8, rendus exécutables.
 *
 * Un échec ici signifie que le moteur ne calcule pas juste — c'est bloquant,
 * jamais « à corriger plus tard ».
 */

const PARIS = "Europe/Paris";
const EUR = { code: "EUR", decimales: 2 };
const XOF = { code: "XOF", decimales: 0 };

/** Mai 2026, période terminée (on se place en juin). */
const MAINTENANT = new Date("2026-06-10T10:00:00Z");

function vente(date: string, montant: number, moyen: VenteAgregable["moyen_paiement"] = null): VenteAgregable {
  return {
    effectuee_le: new Date(date),
    montant_total_mineur: BigInt(montant),
    moyen_paiement: moyen,
  };
}

function depense(date: string, montant: number, categorie: string | null = null): DepenseAgregable {
  return {
    effectuee_le: new Date(date),
    montant_mineur: BigInt(montant),
    categorie_id: categorie,
  };
}

function entrees(surcharge: Partial<EntreesKpi> = {}): EntreesKpi {
  const periode = construirePeriode({ cle: "mois", reference: "2026-05-15" }, PARIS, MAINTENANT);
  return {
    ventes: [],
    depenses: [],
    ventesPrecedentes: [],
    depensesPrecedentes: [],
    periode,
    comparaison: construireComparaison(periode, MAINTENANT),
    devise: EUR,
    libellesCategories: new Map(),
    topProduits: [],
    ...surcharge,
  };
}

describe("Cas A — le cas nominal (§8)", () => {
  // 12 ventes pour 3 450,00 €, 890,00 € de dépenses.
  const ventes = Array.from({ length: 12 }, () => vente("2026-05-15T10:00:00Z", 28750));

  const resultat = calculerKpi(
    entrees({ ventes, depenses: [depense("2026-05-20T10:00:00Z", 89000)] }),
  );

  it("chiffre d'affaires = 3 450,00 €", () => {
    expect(resultat.kpi.chiffre_affaires.valeur).toBe(345000);
  });

  it("dépenses = 890,00 €", () => {
    expect(resultat.kpi.depenses_totales.valeur).toBe(89000);
  });

  it("bénéfice = 2 560,00 €", () => {
    expect(resultat.kpi.benefice.valeur).toBe(256000);
  });

  it("panier moyen = 287,50 €", () => {
    expect(resultat.kpi.panier_moyen.valeur).toBe(28750);
  });

  it("marge = 74,2 %", () => {
    expect(resultat.kpi.marge_pourcent.valeur).toBe(742);
  });

  it("nombre de ventes = 12", () => {
    expect(resultat.kpi.nombre_ventes.valeur).toBe(12);
  });
});

describe("Cas B — arrondis (§8)", () => {
  it("3 ventes pour 100,00 € donnent un panier de 33,33 €", () => {
    const ventes = [
      vente("2026-05-02T10:00:00Z", 3400),
      vente("2026-05-03T10:00:00Z", 3300),
      vente("2026-05-04T10:00:00Z", 3300),
    ];
    expect(calculerKpi(entrees({ ventes })).kpi.panier_moyen.valeur).toBe(3333);
  });

  it("2 ventes pour 5,01 € donnent 2,51 € — arrondi commercial, pas bancaire", () => {
    const ventes = [vente("2026-05-02T10:00:00Z", 251), vente("2026-05-03T10:00:00Z", 250)];
    expect(calculerKpi(entrees({ ventes })).kpi.panier_moyen.valeur).toBe(251);
  });
});

describe("Cas C — dénominateurs nuls (§5.1)", () => {
  const resultat = calculerKpi(entrees({ depenses: [depense("2026-05-10T10:00:00Z", 45000)] }));

  it("rend null — jamais 0 — pour un panier moyen sans vente", () => {
    expect(resultat.kpi.panier_moyen.valeur).toBeNull();
  });

  it("rend null pour une marge sur un chiffre d'affaires nul", () => {
    expect(resultat.kpi.marge_pourcent.valeur).toBeNull();
  });

  it("accepte un bénéfice négatif", () => {
    expect(resultat.kpi.benefice.valeur).toBe(-45000);
  });

  it("rend un tableau complet malgré l'absence de ventes", () => {
    expect(resultat.kpi.chiffre_affaires.valeur).toBe(0);
    expect(resultat.serie_ca_par_jour).toHaveLength(31);
    expect(resultat.meilleur_jour_semaine).toBeNull();
  });
});

describe("Cas D — devise sans décimale (§8)", () => {
  it("6 ventes pour 1 750 000 XOF donnent 291 667 XOF", () => {
    const ventes = [
      vente("2026-05-02T10:00:00Z", 291667),
      vente("2026-05-03T10:00:00Z", 291667),
      vente("2026-05-04T10:00:00Z", 291666),
      vente("2026-05-05T10:00:00Z", 291667),
      vente("2026-05-06T10:00:00Z", 291667),
      vente("2026-05-07T10:00:00Z", 291666),
    ];
    const resultat = calculerKpi(entrees({ ventes, devise: XOF }));

    expect(resultat.kpi.chiffre_affaires.valeur).toBe(1750000);
    expect(resultat.kpi.panier_moyen.valeur).toBe(291667);
    // La devise voyage avec le résultat : le client ne peut pas supposer « 2 ».
    expect(resultat.devise).toEqual({ code: "XOF", decimales: 0 });
  });
});

describe("Cas E — fuseau et bornes de période (§8)", () => {
  // Les ventes hors période sont exclues par le SQL ; ici on vérifie que le
  // moteur range chaque vente au bon JOUR local, ce dont dépend la série.
  const ventes = [
    vente("2026-05-15T10:00:00Z", 10000),
    vente("2026-04-30T22:30:00Z", 20000), // = 1er mai 00 h 30 à Paris
  ];
  const resultat = calculerKpi(entrees({ ventes, depenses: [depense("2026-05-20T08:00:00Z", 5000)] }));

  it("chiffre d'affaires = 300,00 €", () => {
    expect(resultat.kpi.chiffre_affaires.valeur).toBe(30000);
  });

  it("bénéfice = 250,00 €", () => {
    expect(resultat.kpi.benefice.valeur).toBe(25000);
  });

  it("panier moyen = 150,00 €", () => {
    expect(resultat.kpi.panier_moyen.valeur).toBe(15000);
  });

  it("range la vente de 22 h 30 le 30 avril au 1er mai", () => {
    const premierMai = resultat.serie_ca_par_jour.find((p) => p.date_locale === "2026-05-01");
    expect(premierMai?.ca).toBe(20000);
  });
});

describe("Cas F — évolution sur base nulle (§8)", () => {
  it("ne prétend pas mesurer une évolution depuis zéro", () => {
    const resultat = calculerKpi(entrees({ ventes: [vente("2026-05-10T10:00:00Z", 120000)] }));

    expect(resultat.kpi.chiffre_affaires.evolution_pourcent).toBeNull();
    expect(resultat.kpi.chiffre_affaires.base_nulle).toBe(true);
  });

  it("rend POSITIVE une perte qui se réduit", () => {
    // Bénéfice précédent −1 000,00 €, courant −500,00 € : c'est +50 %
    // d'amélioration. Sans valeur absolue au dénominateur, on annoncerait une
    // dégradation à un client dont la situation s'améliore.
    const resultat = calculerKpi(
      entrees({
        depenses: [depense("2026-05-10T10:00:00Z", 50000)],
        depensesPrecedentes: [depense("2026-04-10T10:00:00Z", 100000)],
      }),
    );

    expect(resultat.kpi.benefice.valeur).toBe(-50000);
    expect(resultat.kpi.benefice.evolution_pourcent).toBe(500);
  });

  it("mesure une baisse de chiffre d'affaires", () => {
    const resultat = calculerKpi(
      entrees({
        ventes: [vente("2026-05-10T10:00:00Z", 90000)],
        ventesPrecedentes: [vente("2026-04-10T10:00:00Z", 100000)],
      }),
    );
    expect(resultat.kpi.chiffre_affaires.evolution_pourcent).toBe(-100); // −10,0 %
  });
});

describe("Cas G — répartition normalisée à 100,0 % (§2.5)", () => {
  it("distribue le dixième manquant sur trois catégories égales", () => {
    const resultat = calculerKpi(
      entrees({
        depenses: [
          depense("2026-05-02T10:00:00Z", 100000, "achats"),
          depense("2026-05-03T10:00:00Z", 100000, "loyer"),
          depense("2026-05-04T10:00:00Z", 100000, "salaires"),
        ],
        libellesCategories: new Map([
          ["achats", "Achats"],
          ["loyer", "Loyer"],
          ["salaires", "Salaires"],
        ]),
      }),
    );

    const somme = resultat.repartition_depenses.reduce((t, p) => t + p.part_dixiemes, 0);
    expect(somme).toBe(1000); // exactement 100,0 %

    const achats = resultat.repartition_depenses.find((p) => p.id === "achats");
    expect(achats?.part_dixiemes).toBe(334);
  });

  it("nomme explicitement les dépenses sans catégorie", () => {
    const resultat = calculerKpi(
      entrees({ depenses: [depense("2026-05-02T10:00:00Z", 5000, null)] }),
    );

    expect(resultat.repartition_depenses[0]?.id).toBe("non_categorise");
    expect(resultat.repartition_depenses[0]?.libelle).toBe("Non catégorisé");
  });

  it("répartit aussi le chiffre d'affaires par moyen de paiement", () => {
    const resultat = calculerKpi(
      entrees({
        ventes: [
          vente("2026-05-02T10:00:00Z", 60000, "CARTE"),
          vente("2026-05-03T10:00:00Z", 40000, "ESPECES"),
        ],
      }),
    );

    const somme = resultat.ca_par_moyen_paiement.reduce((t, p) => t + p.part_dixiemes, 0);
    expect(somme).toBe(1000);
    expect(resultat.ca_par_moyen_paiement[0]).toMatchObject({
      id: "CARTE",
      libelle: "Carte bancaire",
      part_dixiemes: 600,
    });
  });
});

describe("Cas H — meilleur jour de la semaine (§8)", () => {
  it("compare des jours à occurrences égales", () => {
    // Mai 2026 contient 4 lundis (4, 11, 18, 25) et 4 mardis (5, 12, 19, 26).
    // À occurrences égales, le plus gros total gagne.
    const ventes = [
      vente("2026-05-04T10:00:00Z", 10000),
      vente("2026-05-11T10:00:00Z", 10000),
      vente("2026-05-18T10:00:00Z", 10000),
      vente("2026-05-25T10:00:00Z", 10000),
      vente("2026-05-05T10:00:00Z", 11000),
    ];
    const resultat = calculerKpi(entrees({ ventes }));

    // Lundi : 40 000 / 4 = 10 000. Mardi : 11 000 / 4 = 2 750.
    expect(resultat.meilleur_jour_semaine?.libelle).toBe("lundi");
    expect(resultat.meilleur_jour_semaine?.ca_moyen).toBe(10000);
  });

  it("divise par le nombre RÉEL d'occurrences, pas par le nombre de jours vendus", () => {
    // Mars 2026 commence un dimanche : il contient 5 dimanches (1, 8, 15, 22,
    // 29) mais seulement 4 mercredis (4, 11, 18, 25).
    //
    //   dimanche : 5 ventes de 100 € = 500 € / 5 occurrences = 100 €
    //   mercredi : 4 ventes de 110 € = 440 € / 4 occurrences = 110 €
    //
    // Le mercredi doit gagner alors que son total est INFÉRIEUR. Sommer sans
    // diviser désignerait le dimanche — et enverrait le commerçant ouvrir le
    // mauvais jour.
    const periode = construirePeriode({ cle: "mois", reference: "2026-03-15" }, PARIS, MAINTENANT);
    const ventes = [
      ...["2026-03-01", "2026-03-08", "2026-03-15", "2026-03-22", "2026-03-29"].map((j) =>
        vente(`${j}T12:00:00Z`, 10000),
      ),
      ...["2026-03-04", "2026-03-11", "2026-03-18", "2026-03-25"].map((j) =>
        vente(`${j}T12:00:00Z`, 11000),
      ),
    ];

    const resultat = calculerKpi(
      entrees({ ventes, periode, comparaison: construireComparaison(periode, MAINTENANT) }),
    );

    expect(resultat.meilleur_jour_semaine?.libelle).toBe("mercredi");
    expect(resultat.meilleur_jour_semaine?.ca_moyen).toBe(11000);
  });
});

describe("série journalière", () => {
  it("pose un point par jour, y compris les jours sans vente", () => {
    // Un graphe à trous ment sur la régularité de l'activité.
    const resultat = calculerKpi(entrees({ ventes: [vente("2026-05-15T10:00:00Z", 10000)] }));

    expect(resultat.serie_ca_par_jour).toHaveLength(31);
    expect(resultat.serie_ca_par_jour[0]).toEqual({
      date_locale: "2026-05-01",
      ca: 0,
      nombre_ventes: 0,
    });
    expect(resultat.serie_ca_par_jour.find((p) => p.date_locale === "2026-05-15")).toEqual({
      date_locale: "2026-05-15",
      ca: 10000,
      nombre_ventes: 1,
    });
  });

  it("somme le total de la série au chiffre d'affaires", () => {
    const ventes = [
      vente("2026-05-02T10:00:00Z", 1234),
      vente("2026-05-02T14:00:00Z", 5678),
      vente("2026-05-20T10:00:00Z", 9012),
    ];
    const resultat = calculerKpi(entrees({ ventes }));

    const totalSerie = resultat.serie_ca_par_jour.reduce((t, p) => t + p.ca, 0);
    expect(totalSerie).toBe(resultat.kpi.chiffre_affaires.valeur);
  });
});

describe("comparaison à date", () => {
  it("signale une comparaison tronquée sur une période en cours", () => {
    const maintenant = new Date("2026-05-08T10:00:00Z");
    const periode = construirePeriode({ cle: "mois" }, PARIS, maintenant);
    const resultat = calculerKpi(
      entrees({ periode, comparaison: construireComparaison(periode, maintenant) }),
    );

    expect(resultat.periode.en_cours).toBe(true);
    expect(resultat.comparaison.a_date).toBe(true);
    expect(resultat.comparaison.fin_local).toBe("2026-04-08");
  });
});
