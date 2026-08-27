import type { Devise, MontantMineur } from "./montant.js";

/**
 * Tableau de bord — formes partagées serveur / client.
 * Contrat : `docs/API-CONTRACT.md` §4. Formules : `docs/MOTEUR-ANALYTICS.md` §5.
 */

export const CLES_PERIODE = [
  "jour",
  "semaine",
  "mois",
  "trimestre",
  "annee",
  "personnalisee",
] as const;
export type ClePeriode = (typeof CLES_PERIODE)[number];

export const LIBELLES_PERIODE: Record<ClePeriode, string> = {
  jour: "Aujourd'hui",
  semaine: "Cette semaine",
  mois: "Ce mois",
  trimestre: "Ce trimestre",
  annee: "Cette année",
  personnalisee: "Période choisie",
};

export type PeriodePublique = {
  cle: ClePeriode;
  debut: string;
  /** Exclue. */
  fin: string;
  debut_local: string;
  /** Dernier jour **inclus**. */
  fin_local: string;
  fuseau: string;
  en_cours: boolean;
};

export type ComparaisonPublique = {
  debut_local: string;
  fin_local: string;
  /** Vrai quand la fenêtre a été tronquée pour coller à une période en cours. */
  a_date: boolean;
};

/**
 * Un indicateur comparé à la période précédente.
 *
 * `valeur: null` signifie **non calculable**, jamais zéro : un panier moyen sans
 * vente n'est pas 0 € (`MOTEUR-ANALYTICS.md` §5.1).
 *
 * `base_nulle: true` signifie que la période précédente valait 0 : l'évolution
 * n'a pas de sens, l'interface affiche « nouveau » et non « +∞ % ».
 */
export type Indicateur = {
  valeur: number | null;
  /** Dixièmes de point. `122` = +12,2 %. */
  evolution_pourcent: number | null;
  base_nulle: boolean;
};

export type IndicateurSimple = {
  /** Dixièmes de point, ou `null` si non calculable. */
  valeur: number | null;
};

export type BlocKpi = {
  chiffre_affaires: Indicateur;
  depenses_totales: Indicateur;
  benefice: Indicateur;
  nombre_ventes: Indicateur;
  panier_moyen: Indicateur;
  nombre_depenses: Indicateur;
  depense_moyenne: Indicateur;
  marge_pourcent: IndicateurSimple;
};

export type PointSerie = {
  date_locale: string;
  ca: MontantMineur;
  nombre_ventes: number;
};

/** Une part de répartition. Les `part_dixiemes` somment exactement 1000. */
export type PartRepartition = {
  id: string;
  libelle: string;
  montant: MontantMineur;
  part_dixiemes: number;
};

export type ProduitVendu = {
  libelle: string;
  /** Chaîne décimale, comme en base. */
  quantite: string;
  montant: MontantMineur;
};

export type MeilleurJourSemaine = {
  /** 1 = lundi … 7 = dimanche (ISO 8601). */
  jour: number;
  libelle: string;
  /** CA **moyen** par occurrence de ce jour dans la période. */
  ca_moyen: MontantMineur;
} | null;

export type ReponseTableauDeBord = {
  periode: PeriodePublique;
  comparaison: ComparaisonPublique;
  devise: Devise;
  kpi: BlocKpi;
  serie_ca_par_jour: PointSerie[];
  repartition_depenses: PartRepartition[];
  ca_par_moyen_paiement: PartRepartition[];
  top_produits: ProduitVendu[];
  meilleur_jour_semaine: MeilleurJourSemaine;
};

export const LIBELLES_JOUR_SEMAINE: Record<number, string> = {
  1: "lundi",
  2: "mardi",
  3: "mercredi",
  4: "jeudi",
  5: "vendredi",
  6: "samedi",
  7: "dimanche",
};

/** Bucket des dépenses sans catégorie. Réel, pas une catégorie inventée. */
export const CATEGORIE_NON_CATEGORISE = "non_categorise";
/** Bucket des ventes sans moyen de paiement renseigné. */
export const PAIEMENT_NON_PRECISE = "NON_PRECISE";
