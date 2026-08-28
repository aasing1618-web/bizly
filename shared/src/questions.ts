import type { ComparaisonPublique, Indicateur, PeriodePublique } from "./kpi.js";
import type { Devise, MontantMineur } from "./montant.js";

/**
 * Moteur de questions intelligentes.
 * Contrat : `docs/API-CONTRACT.md` §6. Formules : `docs/MOTEUR-ANALYTICS.md`.
 */

export const IDS_QUESTION = [
  "combien_ai_je_gagne",
  "benefice_estime",
  "ou_je_depense_le_plus",
  "depenses_augmentent",
  "produit_le_plus_vendu",
  "produit_le_plus_de_ca",
  "ventes_progressent",
  "panier_moyen",
  "meilleurs_clients",
  "combien_de_clients",
  "clients_inactifs",
  "produit_le_plus_rentable",
  "produits_les_moins_vendus",
  "categorie_la_plus_rentable",
] as const;

export type IdQuestion = (typeof IDS_QUESTION)[number];

/** Unité de la valeur portée par un élément de classement. */
export type UniteClassement = "montant" | "quantite" | "pourcent" | "jours";

export type ElementClassement = {
  id: string;
  libelle: string;
  valeur: number;
  unite: UniteClassement;
  /** Part de l'ensemble, en dixièmes de point. Absent quand cela n'a pas de sens. */
  part_dixiemes?: number;
  /** Vrai si à égalité stricte avec le premier du classement. */
  ex_aequo?: boolean;
};

/**
 * Une question et sa réponse.
 *
 * `disponible: false` n'est **jamais** un échec technique : c'est l'absence de
 * données pour répondre, accompagnée d'une `raison` en français destinée à
 * l'utilisateur. Un indicateur faux coûte plus cher qu'un indicateur absent.
 */
export type Question = {
  id: IdQuestion;
  question: string;
  /** Renvoi vers le paragraphe de `MOTEUR-ANALYTICS.md` qui définit la formule. */
  formule: string;
  disponible: boolean;
  raison?: string;
  /** Réponse à valeur unique, avec son évolution. */
  indicateur?: Indicateur;
  /** Réponse en classement, du plus grand au plus petit. */
  classement?: ElementClassement[];
  /** Compléments chiffrés : nombre de ventes, nouveaux clients… */
  complements?: { libelle: string; valeur: number; unite: UniteClassement | "nombre" }[];
  /**
   * La réponse formulée en français, prête à afficher.
   *
   * Produite **côté serveur, sans IA** : tout chiffre qui y figure vient du
   * résultat calculé, par construction. Voir `server/src/domaine/formulation.ts`.
   */
  phrase: string;
};

export type ReponseQuestions = {
  periode: PeriodePublique;
  comparaison: ComparaisonPublique;
  devise: Devise;
  secteur: string;
  questions: Question[];
};

/** Marge globale de la période, distincte du bénéfice (`MOTEUR-ANALYTICS.md` §3.6). */
export type MargeGlobale = {
  /** Somme des marges des produits dont le coût est renseigné. */
  montant: MontantMineur;
  /** Nombre de produits vendus exclus faute de coût. */
  produits_sans_cout: number;
};

/** Seuil d'inactivité d'un client, en jours. §8 de la spécification : à confirmer. */
export const SEUIL_CLIENT_INACTIF_JOURS = 60;

/** Nombre d'éléments rendus dans un classement, ex æquo du dernier rang en plus. */
export const TAILLE_CLASSEMENT = 5;
