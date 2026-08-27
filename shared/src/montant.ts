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

/**
 * Convertit ce que l'utilisateur a tapé en unité mineure. `null` si illisible.
 *
 * Accepte `3 450,50`, `3450.50`, `3450`, avec espaces fines ou insécables — ce
 * qu'un copier-coller depuis un tableur produit couramment.
 *
 * **Aucune multiplication flottante** : on assemble les chiffres en chaîne puis
 * on convertit une seule fois. `parseFloat("8.29") * 100` donne
 * `828.9999999999999`, et même corrigé par un arrondi, c'est une opération que
 * l'on ne veut pas dans le chemin de l'argent (docs/MOTEUR-ANALYTICS.md §1).
 *
 * @example analyserMontantSaisi("3 450,50", { code: "EUR", decimales: 2 }) // 345050
 * @example analyserMontantSaisi("1750000",  { code: "XOF", decimales: 0 }) // 1750000
 * @example analyserMontantSaisi("10,555",   { code: "EUR", decimales: 2 }) // null
 */
export function analyserMontantSaisi(saisie: string, devise: Devise): MontantMineur | null {
  const normalise = saisie
    .replace(/[\s   ]/g, "")
    .replace(",", ".")
    .trim();

  if (normalise === "") return null;
  if (!/^\d+(\.\d*)?$/.test(normalise)) return null;

  const [entier = "", fraction = ""] = normalise.split(".");
  if (fraction.length > devise.decimales) return null;

  const chiffres = entier + fraction.padEnd(devise.decimales, "0");
  const valeur = Number(chiffres);

  if (!Number.isSafeInteger(valeur)) return null;
  return valeur;
}

/**
 * Rend un montant sous une forme éditable, pour pré-remplir un champ de saisie.
 *
 * Différent de `formaterMontant` : ni symbole monétaire, ni séparateur de
 * milliers — sinon le champ ne serait plus relisible par `analyserMontantSaisi`.
 *
 * @example montantVersSaisie(345050, { code: "EUR", decimales: 2 }) // "3450,50"
 */
export function montantVersSaisie(mineur: MontantMineur, devise: Devise): string {
  const negatif = mineur < 0;
  const chiffres = String(Math.abs(mineur)).padStart(devise.decimales + 1, "0");
  const coupure = chiffres.length - devise.decimales;
  const entier = chiffres.slice(0, coupure);
  const fraction = chiffres.slice(coupure);

  const texte = devise.decimales === 0 ? entier : `${entier},${fraction}`;
  return negatif ? `-${texte}` : texte;
}
