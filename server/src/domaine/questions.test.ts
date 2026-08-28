import { describe, expect, it } from "vitest";
import { SEUIL_CLIENT_INACTIF_JOURS, type Question } from "@bizly/shared";
import { repondreAuxQuestions, vocabulaire, type EntreesQuestions } from "./questions.js";
import { construireComparaison, construirePeriode } from "./periodes.js";

/**
 * Les 14 questions, sur le CAS DE RÉFÉRENCE MÉTIER §7.
 *
 * Les chiffres attendus viennent de la spécification, vérifiés à la main côté
 * métier. Un échec ici veut dire que le moteur ne répond pas ce qu'un
 * commerçant attend — c'est bloquant.
 */

const DAKAR = "Africa/Dakar";
const EUR = { code: "EUR", decimales: 2 };
const MAINTENANT = new Date("2026-08-27T12:00:00Z");

const periode = construirePeriode(
  { cle: "personnalisee", du: "2026-08-01", au: "2026-08-15" },
  DAKAR,
  MAINTENANT,
);
const comparaison = construireComparaison(periode, MAINTENANT);

/** Le catalogue et les ventes du §7, déjà agrégés comme le ferait le SQL. */
function entrees(surcharge: Partial<EntreesQuestions> = {}): EntreesQuestions {
  return {
    periode,
    comparaison,
    devise: EUR,
    secteur: "commerce_detail",

    chiffreAffaires: 31500n,
    depenses: 37500n,
    nombreVentes: 10,
    chiffreAffairesPrecedent: 28000n,
    depensesPrecedentes: 26000n,
    nombreVentesPrecedent: 9,

    depensesParCategorie: new Map([
      ["loyer", { libelle: "Loyer", montant: 20000n }],
      ["fournitures", { libelle: "Fournitures", montant: 7000n }],
      ["marketing", { libelle: "Marketing", montant: 7500n }],
      ["transport", { libelle: "Transport", montant: 3000n }],
    ]),

    produits: [
      { produit_id: "p1", nom: "T-shirt", categorie: "Vêtements", prix_mineur: 2000n, cout_mineur: 800n, quantite_millièmes: 4000n, ca_mineur: 8000n },
      { produit_id: "p2", nom: "Casquette", categorie: "Accessoires", prix_mineur: 1500n, cout_mineur: 500n, quantite_millièmes: 5000n, ca_mineur: 7500n },
      { produit_id: "p3", nom: "Sac", categorie: "Accessoires", prix_mineur: 3500n, cout_mineur: 1500n, quantite_millièmes: 2000n, ca_mineur: 7000n },
      { produit_id: "p4", nom: "Pull", categorie: "Vêtements", prix_mineur: 4500n, cout_mineur: null, quantite_millièmes: 2000n, ca_mineur: 9000n },
    ],

    clients: [
      { client_id: "c1", nom: "Awa Diop", ca_mineur: 16500n, jours_depuis_dernier_achat: 14, nouveau: false },
      { client_id: "c2", nom: "Moussa Ndiaye", ca_mineur: 3500n, jours_depuis_dernier_achat: 17, nouveau: false },
      { client_id: "c3", nom: "Fatou Sarr", ca_mineur: 8000n, jours_depuis_dernier_achat: 15, nouveau: true },
      { client_id: "c4", nom: "Ibrahima Ba", ca_mineur: 0n, jours_depuis_dernier_achat: 118, nouveau: false },
    ],
    nombreClientsTotal: 4,
    caHorsCatalogue: 0n,
    ...surcharge,
  };
}

const resultat = repondreAuxQuestions(entrees());
const trouver = (id: string): Question => {
  const question = resultat.questions.find((q) => q.id === id);
  if (question === undefined) throw new Error(`question ${id} absente`);
  return question;
};

describe("catalogue de questions", () => {
  it("rend les 14 questions de la spécification §4", () => {
    expect(resultat.questions).toHaveLength(14);
  });

  it("porte le renvoi vers la formule de chaque question", () => {
    // Traçabilité : d'un chiffre affiché on remonte à la règle, sans lire le code.
    for (const question of resultat.questions) {
      expect(question.formule).toMatch(/^§/);
    }
  });
});

describe("questions à valeur unique", () => {
  it("« Combien ai-je gagné » : 315,00 €, +12,5 %", () => {
    const q = trouver("combien_ai_je_gagne");
    expect(q.indicateur?.valeur).toBe(31500);
    expect(q.indicateur?.evolution_pourcent).toBe(125);
  });

  it("« Quel est mon bénéfice » : −60,00 €, écart de −80,00 € et AUCUN pourcentage", () => {
    // Le signe est traversé (+20 € → −60 €) : le pourcentage serait illisible.
    const q = trouver("benefice_estime");
    expect(q.indicateur?.valeur).toBe(-6000);
    expect(q.indicateur?.evolution_montant).toBe(-8000);
    expect(q.indicateur?.evolution_pourcent).toBeNull();
  });

  it("« Mes dépenses augmentent-elles » : +44,2 %", () => {
    expect(trouver("depenses_augmentent").indicateur?.evolution_pourcent).toBe(442);
  });

  it("« Mes ventes progressent-elles » : +12,5 %, et 10 ventes contre 9", () => {
    const q = trouver("ventes_progressent");
    expect(q.indicateur?.evolution_pourcent).toBe(125);
    expect(q.complements?.[0]).toEqual({ libelle: "nombre de ventes", valeur: 10, unite: "nombre" });
    expect(q.complements?.[1]?.valeur).toBe(9);
  });

  it("« Quel est mon panier moyen » : 31,50 €, +1,3 %", () => {
    // +1,25 % exact, demi vers le haut. Calculé sur les moyennes EXACTES.
    const q = trouver("panier_moyen");
    expect(q.indicateur?.valeur).toBe(3150);
    expect(q.indicateur?.evolution_pourcent).toBe(13);
  });

  it("« Combien de clients » : 4 au total, 1 nouveau", () => {
    const q = trouver("combien_de_clients");
    expect(q.complements?.[0]).toEqual({ libelle: "clients au total", valeur: 4, unite: "nombre" });
    expect(q.complements?.[1]?.valeur).toBe(1);
  });
});

describe("classements", () => {
  it("« Où je dépense le plus » : Loyer 200,00 € (53,3 %)", () => {
    const q = trouver("ou_je_depense_le_plus");
    expect(q.classement?.[0]).toMatchObject({
      libelle: "Loyer",
      valeur: 20000,
      part_dixiemes: 533,
    });
    // Marketing 20,0 %, Fournitures 18,7 %, Transport 8,0 %
    expect(q.classement?.map((e) => e.part_dixiemes)).toEqual([533, 200, 187, 80]);
  });

  it("« Quel produit se vend le plus » : Casquette, 5 unités", () => {
    const q = trouver("produit_le_plus_vendu");
    expect(q.classement?.[0]).toMatchObject({ libelle: "Casquette", valeur: 5, unite: "quantite" });
  });

  it("« Quel produit génère le plus de CA » : Pull, 90,00 €", () => {
    // Trois questions distinctes, trois réponses distinctes : la Casquette se
    // vend le plus, le Pull rapporte le plus, la Casquette est la plus rentable.
    const q = trouver("produit_le_plus_de_ca");
    expect(q.classement?.[0]).toMatchObject({ libelle: "Pull", valeur: 9000 });
  });

  it("« Quel produit est le plus rentable » : Casquette 66,7 %, Pull EXCLU", () => {
    const q = trouver("produit_le_plus_rentable");
    expect(q.classement?.[0]).toMatchObject({ libelle: "Casquette", valeur: 667, unite: "pourcent" });
    expect(q.classement?.map((e) => e.libelle)).toEqual(["Casquette", "T-shirt", "Sac"]);
    expect(q.classement?.some((e) => e.libelle === "Pull")).toBe(false);
  });

  it("annonce la marge globale de 138,00 € et le produit exclu", () => {
    const q = trouver("produit_le_plus_rentable");
    expect(q.complements?.[0]).toEqual({
      libelle: "marge globale sur la période",
      valeur: 13800,
      unite: "montant",
    });
    expect(q.complements?.[1]?.valeur).toBe(1);
  });

  it("« Quels produits se vendent le moins » : Pull ET Sac, les deux ex æquo", () => {
    // Question en LISTE : on n'en cache aucun. Départage alphabétique.
    const q = trouver("produits_les_moins_vendus");
    expect(q.classement?.map((e) => e.libelle)).toEqual(["Pull", "Sac"]);
    expect(q.classement?.every((e) => e.ex_aequo === true)).toBe(true);
    expect(q.classement?.every((e) => e.valeur === 2)).toBe(true);
  });

  it("« Quelle catégorie génère le plus de revenus » : Vêtements 170,00 € (54,0 %)", () => {
    const q = trouver("categorie_la_plus_rentable");
    expect(q.classement?.[0]).toMatchObject({
      libelle: "Vêtements",
      valeur: 17000,
      part_dixiemes: 540,
    });
    expect(q.classement?.[1]).toMatchObject({ libelle: "Accessoires", valeur: 14500, part_dixiemes: 460 });
  });

  it("« Qui sont mes meilleurs clients » : Awa Diop 165 €, Fatou Sarr 80 €, Moussa 35 €", () => {
    const q = trouver("meilleurs_clients");
    expect(q.classement?.map((e) => [e.libelle, e.valeur])).toEqual([
      ["Awa Diop", 16500],
      ["Fatou Sarr", 8000],
      ["Moussa Ndiaye", 3500],
    ]);
  });

  it("écarte du classement clients ceux qui n'ont rien acheté sur la période", () => {
    // Ibrahima Ba a 0 € sur la période : il n'a rien à faire dans un classement
    // des meilleurs clients.
    expect(trouver("meilleurs_clients").classement?.some((e) => e.libelle === "Ibrahima Ba")).toBe(false);
  });

  it("« Quels clients n'ont pas acheté récemment » : Ibrahima Ba, 118 jours", () => {
    const q = trouver("clients_inactifs");
    expect(q.classement).toHaveLength(1);
    expect(q.classement?.[0]).toMatchObject({ libelle: "Ibrahima Ba", valeur: 118, unite: "jours" });
    expect(q.question).toContain(String(SEUIL_CLIENT_INACTIF_JOURS));
  });
});

describe("ventes anonymes", () => {
  it("comptent dans le chiffre d'affaires mais jamais dans le classement clients", () => {
    // Spécification §3.8. Le tableau du §7 liste « (anonyme) 35 € » dans le
    // classement clients : c'est la contradiction signalée dans
    // docs/ECARTS-SPEC.md §4. On applique la RÈGLE, pas le tableau.
    const ca = trouver("combien_ai_je_gagne").indicateur?.valeur;
    const totalClasse = trouver("meilleurs_clients").classement?.reduce((t, e) => t + e.valeur, 0);

    expect(ca).toBe(31500);
    expect(totalClasse).toBe(28000); // 31500 − 3500 d'anonymes
    expect(trouver("meilleurs_clients").classement?.some((e) => /anonyme/i.test(e.libelle))).toBe(false);
  });
});

describe("une question sans données répond « indisponible », jamais zéro", () => {
  const vide = repondreAuxQuestions(
    entrees({
      chiffreAffaires: 0n,
      depenses: 0n,
      nombreVentes: 0,
      depensesParCategorie: new Map(),
      produits: [],
      clients: [],
      nombreClientsTotal: 0,
    }),
  );

  const sans = (id: string) => vide.questions.find((q) => q.id === id);

  it("le panier moyen n'est pas 0 € mais « non calculable »", () => {
    expect(sans("panier_moyen")?.disponible).toBe(false);
    expect(sans("panier_moyen")?.raison).toMatch(/pas calculable/);
    expect(sans("panier_moyen")?.indicateur).toBeUndefined();
  });

  it("les classements produits expliquent ce qui manque", () => {
    for (const id of ["produit_le_plus_vendu", "produit_le_plus_de_ca", "produits_les_moins_vendus"]) {
      expect(sans(id)?.disponible).toBe(false);
      expect(sans(id)?.raison).toBe("Aucune vente sur cette période.");
    }
  });

  it("le chiffre d'affaires reste disponible et vaut 0", () => {
    // Une valeur nulle est une réponse, pas une absence de données.
    expect(sans("combien_ai_je_gagne")?.disponible).toBe(true);
    expect(sans("combien_ai_je_gagne")?.indicateur?.valeur).toBe(0);
  });
});

describe("raisons d'indisponibilité, une par une", () => {
  it("distingue « aucune vente » de « aucune vente rattachée au catalogue »", () => {
    const horsCatalogue = repondreAuxQuestions(
      entrees({ produits: [], nombreVentes: 10, caHorsCatalogue: 31500n }),
    );
    const q = horsCatalogue.questions.find((x) => x.id === "produit_le_plus_vendu");

    expect(q?.disponible).toBe(false);
    expect(q?.raison).toBe("Aucune vente n'est rattachée à un produit du catalogue.");
  });

  it("dit qu'aucun coût n'est renseigné plutôt que d'inventer une marge", () => {
    const sansCout = repondreAuxQuestions(
      entrees({
        produits: entrees().produits.map((p) => ({ ...p, cout_mineur: null })),
      }),
    );
    const q = sansCout.questions.find((x) => x.id === "produit_le_plus_rentable");

    expect(q?.disponible).toBe(false);
    expect(q?.raison).toBe("Aucun produit vendu n'a de coût de revient renseigné.");
    expect(q?.classement).toBeUndefined();
  });

  it("dit qu'aucune vente n'a de client plutôt que de rendre une liste vide", () => {
    const anonyme = repondreAuxQuestions(
      entrees({ clients: entrees().clients.map((c) => ({ ...c, ca_mineur: 0n })) }),
    );
    const q = anonyme.questions.find((x) => x.id === "meilleurs_clients");

    expect(q?.disponible).toBe(false);
    expect(q?.raison).toMatch(/rattachée à un client/);
  });

  it("annonce le CA qui échappe aux classements produits", () => {
    const partiel = repondreAuxQuestions(entrees({ caHorsCatalogue: 5000n }));
    const q = partiel.questions.find((x) => x.id === "produit_le_plus_de_ca");

    // Sans cette mention, le total du classement serait inférieur au chiffre
    // d'affaires sans explication.
    expect(q?.complements?.[0]).toEqual({
      libelle: "chiffre d'affaires hors catalogue",
      valeur: 5000,
      unite: "montant",
    });
  });
});

describe("vocabulaire par secteur", () => {
  it("parle de « plat » en restauration et de « prestation » en services", () => {
    expect(vocabulaire("restauration").singulier).toBe("plat");
    expect(vocabulaire("services_pro").singulier).toBe("prestation");
    expect(vocabulaire("commerce_detail").singulier).toBe("produit");
    expect(vocabulaire("artisanat_btp").singulier).toBe("produit");
  });

  it("change les libellés SANS toucher aux chiffres", () => {
    const restaurant = repondreAuxQuestions(entrees({ secteur: "restauration" }));
    const commerce = repondreAuxQuestions(entrees({ secteur: "commerce_detail" }));

    const platQuestion = restaurant.questions.find((q) => q.id === "produit_le_plus_vendu");
    expect(platQuestion?.question).toBe("Quel plat se vend le plus ?");
    expect(commerce.questions.find((q) => q.id === "produit_le_plus_vendu")?.question).toBe(
      "Quel produit se vend le plus ?",
    );

    // Un moteur par secteur serait impossible à tester : seuls les mots changent.
    expect(platQuestion?.classement).toEqual(
      commerce.questions.find((q) => q.id === "produit_le_plus_vendu")?.classement,
    );
  });
});

describe("égalités", () => {
  it("départage par ordre alphabétique et signale l'ex æquo", () => {
    const egalite = repondreAuxQuestions(
      entrees({
        produits: [
          { produit_id: "x", nom: "Zèbre", categorie: null, prix_mineur: 1000n, cout_mineur: null, quantite_millièmes: 3000n, ca_mineur: 3000n },
          { produit_id: "y", nom: "Alpaga", categorie: null, prix_mineur: 1000n, cout_mineur: null, quantite_millièmes: 3000n, ca_mineur: 3000n },
        ],
      }),
    );
    const q = egalite.questions.find((x) => x.id === "produit_le_plus_vendu");

    expect(q?.classement?.[0]?.libelle).toBe("Alpaga");
    expect(q?.classement?.[0]?.ex_aequo).toBe(true);
    expect(q?.classement?.[1]?.ex_aequo).toBe(true);
  });
});
