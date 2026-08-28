import { describe, expect, it } from "vitest";
import { formaterMontant, formaterPourcent, type Question } from "@bizly/shared";
import { formuler, nombresDuTexte } from "./formulation.js";
import { repondreAuxQuestions } from "./questions.js";
import { construireComparaison, construirePeriode } from "./periodes.js";

const EUR = { code: "EUR", decimales: 2 };
const DAKAR = "Africa/Dakar";
const MAINTENANT = new Date("2026-08-27T12:00:00Z");

const periode = construirePeriode(
  { cle: "personnalisee", du: "2026-08-01", au: "2026-08-15" },
  DAKAR,
  MAINTENANT,
);

/** Le cas de référence métier §7, agrégé comme le ferait le SQL. */
const resultat = repondreAuxQuestions({
  periode,
  comparaison: construireComparaison(periode, MAINTENANT),
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
});

const par = (id: string): Question => {
  const question = resultat.questions.find((q) => q.id === id);
  if (question === undefined) throw new Error(`question ${id} absente`);
  return question;
};

const phrase = (id: string): string => formuler(par(id), EUR);

/**
 * Ramène les espaces typographiques à une espace ordinaire.
 *
 * `Intl` en français insère une espace FINE insécable (U+202F) avant le symbole
 * monétaire et une insécable (U+00A0) entre les milliers. C'est la bonne
 * typographie : on la conserve à l'affichage, on la neutralise seulement pour
 * écrire des attentes de test lisibles.
 */
const normaliser = (texte: string): string => texte.replace(/[\u202f\u00a0]/g, " ");
const phraseNormalisee = (id: string): string => normaliser(phrase(id));

describe("formulation en français", () => {
  it("produit une phrase pour chacune des 14 questions", () => {
    for (const question of resultat.questions) {
      const texte = formuler(question, EUR);
      expect(texte.length).toBeGreaterThan(10);
      expect(texte).toMatch(/[.!?]$/);
    }
  });

  it("explique le chiffre d'affaires", () => {
    expect(phraseNormalisee("combien_ai_je_gagne")).toBe(
      "Vous avez encaissé 315,00 € sur la période, en hausse de 12,5 %.",
    );
  });

  it("dit qu'un bénéfice négatif est un déficit, avec l'écart en montant", () => {
    // Le signe est traversé : pas de pourcentage, l'écart en euros.
    expect(phraseNormalisee("benefice_estime")).toContain("Vous êtes en déficit sur cette période : -60,00 €");
    expect(phraseNormalisee("benefice_estime")).toContain("en baisse de 80,00 €");
    // Et le rappel qui évite la confusion avec la marge.
    expect(phraseNormalisee("benefice_estime")).toContain("ne tient pas compte du coût de revient");
  });

  it("répond « oui » quand les dépenses augmentent", () => {
    expect(phraseNormalisee("depenses_augmentent")).toBe(
      "Oui : 375,00 € de dépenses, en hausse de 44,2 %.",
    );
  });

  it("répond aux questions fermées par oui ou non, pas par un chiffre brut", () => {
    expect(phrase("ventes_progressent")).toMatch(/^Oui : 10 ventes contre 9/);
  });

  it("nomme le premier poste de dépense et sa part", () => {
    expect(phraseNormalisee("ou_je_depense_le_plus")).toContain("Loyer, avec 200,00 €, soit 53,3 % du total");
  });

  it("distingue « se vend le plus » de « rapporte le plus »", () => {
    expect(phrase("produit_le_plus_vendu")).toContain("Casquette");
    expect(phrase("produit_le_plus_vendu")).toContain("5 unités");
    expect(phraseNormalisee("produit_le_plus_de_ca")).toContain("Pull rapporte le plus, avec 90,00 €");
  });

  it("cite tous les ex æquo, jamais un seul", () => {
    expect(phrase("produits_les_moins_vendus")).toBe(
      "Pull et Sac se vendent le moins, avec 2 unités chacun.",
    );
  });

  it("annonce la marge globale et les produits exclus faute de coût", () => {
    const texte = phraseNormalisee("produit_le_plus_rentable");
    expect(texte).toContain("Casquette est le plus rentable, avec 66,7 % de marge");
    expect(texte).toContain("votre marge est de 138,00 €");
    expect(texte).toContain("1 produit est exclu de ce calcul, faute de coût de revient renseigné");
  });

  it("classe les clients sans jamais mentionner les ventes anonymes", () => {
    const texte = phraseNormalisee("meilleurs_clients");
    expect(texte).toContain("Votre meilleur client est Awa Diop, avec 165,00 €");
    expect(texte).not.toMatch(/anonyme/i);
  });

  it("compte les clients et les nouveaux", () => {
    expect(phraseNormalisee("combien_de_clients")).toBe(
      "Vous avez 4 clients enregistrés. Dont 1 nouveau sur la période.",
    );
  });

  it("nomme les clients inactifs et leur ancienneté", () => {
    expect(phraseNormalisee("clients_inactifs")).toBe(
      "1 client n'a pas acheté récemment : Ibrahima Ba (118 jours).",
    );
  });

  it("reprend la raison telle quelle quand la question est indisponible", () => {
    const indisponible: Question = {
      id: "produit_le_plus_rentable",
      question: "Quel produit est le plus rentable ?",
      formule: "§3.6",
      disponible: false,
      raison: "Aucun produit vendu n'a de coût de revient renseigné.",
      phrase: "",
    };
    expect(formuler(indisponible, EUR)).toBe(
      "Aucun produit vendu n'a de coût de revient renseigné.",
    );
  });
});

/**
 * LE garde-fou de `GEMINI.md` : « un test doit vérifier que le texte généré ne
 * contient pas de nombre absent du JSON d'entrée ».
 *
 * Ici il est appliqué à la couche déterministe. Elle le satisfait **par
 * construction** — aucun chiffre ne peut être inventé — mais le test reste
 * écrit : il vaudra tel quel le jour où une reformulation par IA viendra
 * s'ajouter, et c'est lui qui la surveillera.
 */
describe("aucun chiffre inventé", () => {
  /** Toutes les formes chiffrées légitimes issues du résultat calculé. */
  function nombresAutorises(question: Question): Set<string> {
    const autorises = new Set<string>();

    const ajouter = (valeur: number | null | undefined): void => {
      if (valeur === null || valeur === undefined) return;
      // Un même entier peut apparaître comme montant (31500 → « 315,00 »),
      // comme pourcentage (125 → « 12,5 ») ou tel quel (10 → « 10 »).
      for (const rendu of [
        formaterMontant(valeur, EUR),
        formaterMontant(Math.abs(valeur), EUR),
        formaterPourcent(valeur, { signe: false }),
        formaterPourcent(Math.abs(valeur), { signe: false }),
        String(valeur),
        new Intl.NumberFormat("fr-FR").format(valeur),
      ]) {
        for (const nombre of nombresDuTexte(rendu)) autorises.add(nombre);
      }
    };

    ajouter(question.indicateur?.valeur);
    ajouter(question.indicateur?.evolution_pourcent);
    ajouter(question.indicateur?.evolution_montant);
    for (const element of question.classement ?? []) {
      ajouter(element.valeur);
      ajouter(element.part_dixiemes);
    }
    for (const complement of question.complements ?? []) ajouter(complement.valeur);
    // Le nombre d'éléments d'un classement est lui aussi dérivé du résultat.
    ajouter(question.classement?.length);

    return autorises;
  }

  it("chaque nombre de chaque phrase existe dans le résultat calculé", () => {
    const fautifs: string[] = [];

    for (const question of resultat.questions) {
      const texte = formuler(question, EUR);
      const autorises = nombresAutorises(question);

      for (const nombre of nombresDuTexte(texte)) {
        if (!autorises.has(nombre)) {
          fautifs.push(`${question.id} : « ${nombre} » absent du résultat — « ${texte} »`);
        }
      }
    }

    expect(fautifs).toEqual([]);
  });

  it("détecte bien un chiffre inventé — le garde-fou n'est pas décoratif", () => {
    // Contre-épreuve : sans elle, un test qui passe ne prouverait rien.
    const autorises = nombresAutorises(par("combien_ai_je_gagne"));
    expect(autorises.has("315,00")).toBe(true);
    expect(autorises.has("999,99")).toBe(false);
  });
});

describe("extraction des nombres", () => {
  it("lit les montants, pourcentages et espaces insécables du français", () => {
    expect(nombresDuTexte("315,00 € en hausse de 12,5 %")).toEqual(["315,00", "12,5"]);
    expect(nombresDuTexte("1\u00a0750\u00a0000 F CFA")).toEqual(["1750000"]);
    expect(nombresDuTexte("aucun chiffre ici")).toEqual([]);
  });
});
