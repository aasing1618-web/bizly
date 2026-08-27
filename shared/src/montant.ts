/**
 * Convention monétaire Bizly — partagée serveur / client.
 *
 * Un montant est TOUJOURS un entier exprimé en unité mineure de la devise
 * (centimes pour EUR, unité entière pour XOF, millièmes pour TND).
 * Voir docs/MOTEUR-ANALYTICS.md §1.
 *
 * Ce module ne contient QUE la représentation et le formatage. Les formules de
 * calcul (KPI, arrondis de division) vivent côté serveur uniquement — décision
 * d'architecture figée : le moteur ne part jamais dans le navigateur.
 */

/** Devise telle qu'elle est transportée par l'API. */
export type Devise = {
  /** Code ISO 4217, ex. "EUR". */
  code: string;
  /** Exposant de l'unité mineure : 2 pour EUR, 0 pour XOF, 3 pour TND. */
  decimales: number;
};

/**
 * Un montant en unité mineure, tel qu'il transite en JSON.
 *
 * `number` et non `bigint` : JSON ne sait pas sérialiser `bigint`, et la limite
 * de `Number.MAX_SAFE_INTEGER` (9,007 x 10^15) représente 90 000 milliards
 * d'euros en centimes — hors de portée d'une petite entreprise. Le serveur
 * garde des `bigint` en interne et lève une erreur avant de dépasser cette
 * limite (voir docs/MOTEUR-ANALYTICS.md §6).
 */
export type MontantMineur = number;

/** Au-delà, un montant ne peut plus transiter en JSON sans perte de précision. */
export const MONTANT_MAX_SUR: MontantMineur = Number.MAX_SAFE_INTEGER;

/**
 * Formate un montant en unité mineure pour l'affichage.
 *
 * @example formaterMontant(345000, { code: "EUR", decimales: 2 })  // "3 450,00 €"
 * @example formaterMontant(1750000, { code: "XOF", decimales: 0 }) // "1 750 000 F CFA"
 */
export function formaterMontant(
  mineur: MontantMineur,
  devise: Devise,
  locale = "fr-FR",
): string {
  const valeur = mineur / 10 ** devise.decimales;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: devise.code,
    minimumFractionDigits: devise.decimales,
    maximumFractionDigits: devise.decimales,
  }).format(valeur);
}

/**
 * Formate un pourcentage transporté en dixièmes de point.
 *
 * @example formaterPourcent(742)  // "+74,2 %"  (avec signe)
 * @example formaterPourcent(-45, { signe: false }) // "4,5 %"
 */
export function formaterPourcent(
  dixiemes: number | null,
  options: { signe?: boolean; locale?: string } = {},
): string {
  if (dixiemes === null) return "—";
  const { signe = true, locale = "fr-FR" } = options;
  const texte = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: signe ? "exceptZero" : "never",
  }).format(dixiemes / 10);
  return `${texte} %`;
}

/**
 * Rendu d'une valeur non calculable.
 *
 * Un panier moyen sans vente vaut `null`, pas 0 : afficher « 0 € » ferait croire
 * à des ventes à zéro euro. Voir docs/MOTEUR-ANALYTICS.md §5.1.
 */
export const VALEUR_NON_CALCULABLE = "—";
