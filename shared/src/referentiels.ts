/**
 * Référentiels : devises, secteurs, pays.
 *
 * Les devises et les secteurs vivent en base (`devises`, `secteurs`) et sont
 * servis par `GET /api/referentiels`. Les **pays** vivent ici, en constante :
 * ce sont des données ISO figées (3166-1 alpha-2, 4217, IANA), pas des données
 * d'exploitation. Une table pour ça imposerait une migration à chaque pays
 * ajouté, sans rien apporter — et le serveur doit de toute façon valider un
 * pays reçu contre cette même liste, qu'il importe depuis ce module.
 *
 * Contrat : docs/API-CONTRACT.md §7.
 */

/** Devise telle qu'elle sort du référentiel, symbole et libellé compris. */
export type DeviseReferentiel = {
  code: string;
  libelle: string;
  symbole: string;
  decimales: number;
};

export type SecteurReferentiel = {
  code: string;
  libelle: string;
};

/**
 * Un pays proposé à l'inscription.
 *
 * `devise` et `fuseau` sont des **valeurs par défaut**, pas des contraintes :
 * une agence sénégalaise qui facture en euros choisit EUR, et rien ne l'en
 * empêche. Le pays ne fait que remplir le formulaire à sa place.
 */
export type Pays = {
  /** ISO 3166-1 alpha-2, en majuscules. */
  code: string;
  nom: string;
  /** Devise usuelle du pays — présente dans la table `devises`. */
  devise: string;
  /** Fuseau IANA principal. Modifiable ensuite dans Paramètres. */
  fuseau: string;
};

/**
 * Les trois devises mises en avant à l'inscription.
 *
 * Ce sont celles de la cible immédiate : franc CFA pour l'Afrique de l'Ouest,
 * euro pour l'Europe francophone, dollar pour l'international. Les autres
 * restent accessibles dans la liste complète, jamais loin.
 */
export const DEVISES_RAPIDES = ["XOF", "EUR", "USD"] as const;

/**
 * Pays proposés.
 *
 * **Invariant** : la devise de chaque pays existe dans la table `devises`
 * (migrations 0002 et 0004). Un test le vérifie — sans lui, choisir un pays
 * produirait une inscription refusée pour « devise inconnue ».
 */
export const PAYS: readonly Pays[] = [
  // Afrique de l'Ouest — franc CFA BCEAO
  { code: "BJ", nom: "Bénin", devise: "XOF", fuseau: "Africa/Porto-Novo" },
  { code: "BF", nom: "Burkina Faso", devise: "XOF", fuseau: "Africa/Ouagadougou" },
  { code: "CI", nom: "Côte d'Ivoire", devise: "XOF", fuseau: "Africa/Abidjan" },
  { code: "GW", nom: "Guinée-Bissau", devise: "XOF", fuseau: "Africa/Bissau" },
  { code: "ML", nom: "Mali", devise: "XOF", fuseau: "Africa/Bamako" },
  { code: "NE", nom: "Niger", devise: "XOF", fuseau: "Africa/Niamey" },
  { code: "SN", nom: "Sénégal", devise: "XOF", fuseau: "Africa/Dakar" },
  { code: "TG", nom: "Togo", devise: "XOF", fuseau: "Africa/Lome" },

  // Afrique centrale — franc CFA BEAC
  { code: "CM", nom: "Cameroun", devise: "XAF", fuseau: "Africa/Douala" },
  { code: "CF", nom: "Centrafrique", devise: "XAF", fuseau: "Africa/Bangui" },
  { code: "CG", nom: "Congo-Brazzaville", devise: "XAF", fuseau: "Africa/Brazzaville" },
  { code: "GA", nom: "Gabon", devise: "XAF", fuseau: "Africa/Libreville" },
  { code: "GQ", nom: "Guinée équatoriale", devise: "XAF", fuseau: "Africa/Malabo" },
  { code: "TD", nom: "Tchad", devise: "XAF", fuseau: "Africa/Ndjamena" },

  // Reste de l'Afrique
  { code: "CD", nom: "République démocratique du Congo", devise: "CDF", fuseau: "Africa/Kinshasa" },
  { code: "GN", nom: "Guinée", devise: "GNF", fuseau: "Africa/Conakry" },
  { code: "MA", nom: "Maroc", devise: "MAD", fuseau: "Africa/Casablanca" },
  { code: "DZ", nom: "Algérie", devise: "DZD", fuseau: "Africa/Algiers" },
  { code: "TN", nom: "Tunisie", devise: "TND", fuseau: "Africa/Tunis" },
  { code: "NG", nom: "Nigeria", devise: "NGN", fuseau: "Africa/Lagos" },
  { code: "GH", nom: "Ghana", devise: "GHS", fuseau: "Africa/Accra" },
  { code: "KE", nom: "Kenya", devise: "KES", fuseau: "Africa/Nairobi" },
  { code: "RW", nom: "Rwanda", devise: "RWF", fuseau: "Africa/Kigali" },
  { code: "BI", nom: "Burundi", devise: "BIF", fuseau: "Africa/Bujumbura" },
  { code: "DJ", nom: "Djibouti", devise: "DJF", fuseau: "Africa/Djibouti" },
  { code: "KM", nom: "Comores", devise: "KMF", fuseau: "Indian/Comoro" },
  { code: "ZA", nom: "Afrique du Sud", devise: "ZAR", fuseau: "Africa/Johannesburg" },

  // Europe
  { code: "FR", nom: "France", devise: "EUR", fuseau: "Europe/Paris" },
  { code: "BE", nom: "Belgique", devise: "EUR", fuseau: "Europe/Brussels" },
  { code: "LU", nom: "Luxembourg", devise: "EUR", fuseau: "Europe/Luxembourg" },
  { code: "ES", nom: "Espagne", devise: "EUR", fuseau: "Europe/Madrid" },
  { code: "PT", nom: "Portugal", devise: "EUR", fuseau: "Europe/Lisbon" },
  { code: "IT", nom: "Italie", devise: "EUR", fuseau: "Europe/Rome" },
  { code: "DE", nom: "Allemagne", devise: "EUR", fuseau: "Europe/Berlin" },
  { code: "NL", nom: "Pays-Bas", devise: "EUR", fuseau: "Europe/Amsterdam" },
  { code: "IE", nom: "Irlande", devise: "EUR", fuseau: "Europe/Dublin" },
  { code: "GR", nom: "Grèce", devise: "EUR", fuseau: "Europe/Athens" },
  { code: "AT", nom: "Autriche", devise: "EUR", fuseau: "Europe/Vienna" },
  { code: "FI", nom: "Finlande", devise: "EUR", fuseau: "Europe/Helsinki" },
  { code: "CH", nom: "Suisse", devise: "CHF", fuseau: "Europe/Zurich" },
  { code: "GB", nom: "Royaume-Uni", devise: "GBP", fuseau: "Europe/London" },

  // Amérique du Nord
  { code: "US", nom: "États-Unis", devise: "USD", fuseau: "America/New_York" },
  { code: "CA", nom: "Canada", devise: "CAD", fuseau: "America/Toronto" },
];

/** Le pays correspondant à un code ISO, ou `null`. */
export function paysParCode(code: string | null | undefined): Pays | null {
  if (code === null || code === undefined) return null;
  const recherche = code.trim().toUpperCase();
  return PAYS.find((pays) => pays.code === recherche) ?? null;
}

/** Réponse de `GET /api/referentiels`. */
export type ReponseReferentiels = {
  devises: DeviseReferentiel[];
  secteurs: SecteurReferentiel[];
  pays: Pays[];
  /** Codes des devises mises en avant, dans l'ordre d'affichage. */
  devises_rapides: string[];
};
