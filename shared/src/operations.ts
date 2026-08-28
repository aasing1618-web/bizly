import type { MontantMineur } from "./montant.js";

/**
 * Ventes et dépenses — formes partagées serveur / client.
 * Contrat : docs/API-CONTRACT.md §3.
 */

export const MOYENS_PAIEMENT = [
  "ESPECES",
  "CARTE",
  "VIREMENT",
  "CHEQUE",
  "MOBILE",
  "AUTRE",
] as const;
export type MoyenPaiement = (typeof MOYENS_PAIEMENT)[number];

export const LIBELLES_MOYEN_PAIEMENT: Record<MoyenPaiement, string> = {
  ESPECES: "Espèces",
  CARTE: "Carte bancaire",
  VIREMENT: "Virement",
  CHEQUE: "Chèque",
  MOBILE: "Paiement mobile",
  AUTRE: "Autre",
};

export const STATUTS_OPERATION = ["BROUILLON", "VALIDEE", "ANNULEE"] as const;
export type StatutOperation = (typeof STATUTS_OPERATION)[number];

export const LIBELLES_STATUT: Record<StatutOperation, string> = {
  BROUILLON: "Brouillon",
  VALIDEE: "Validée",
  ANNULEE: "Annulée",
};

/**
 * Une opération porte **deux** représentations de sa date.
 *
 * `effectuee_le` est l'instant UTC réellement stocké ; `date_locale` est le jour
 * tel que l'utilisateur doit le voir, déjà calculé dans le fuseau de
 * l'entreprise. Le client n'a donc aucun calcul de fuseau à faire — et ne peut
 * pas se tromper de jour sur une vente de fin de soirée.
 */
type DatesOperation = {
  effectuee_le: string;
  /** `YYYY-MM-DD` dans le fuseau de l'entreprise. */
  date_locale: string;
};

export type LigneVente = {
  id: string;
  rang: number;
  /**
   * Produit du catalogue, quand la ligne en désigne un.
   *
   * Sert aux **regroupements** (quel produit se vend le plus) ; le `libelle`
   * ci-dessous sert à l'affichage. Une ligne sans `produit_id` compte dans le
   * chiffre d'affaires, jamais dans un classement par produit.
   */
  produit_id: string | null;
  /** Photographie du nom au moment de la vente — renommer le produit ne réécrit pas l'historique. */
  libelle: string;
  /** Chaîne décimale (`NUMERIC(14,3)`), jamais un flottant. */
  quantite: string;
  prix_unitaire_mineur: MontantMineur;
  montant_mineur: MontantMineur;
};

export type Vente = DatesOperation & {
  id: string;
  numero: number;
  montant_total_mineur: MontantMineur;
  moyen_paiement: MoyenPaiement | null;
  statut: StatutOperation;
  note: string | null;
  /** Client résolu, ou `null` pour une vente anonyme. */
  client: { id: string; nom: string } | null;
  nombre_lignes: number;
  cree_le: string;
};

/** Vente en détail : la même chose, plus ses lignes. */
export type VenteDetaillee = Vente & {
  lignes: LigneVente[];
};

export type CategorieDepense = {
  id: string;
  code: string;
  libelle: string;
};

export type Depense = DatesOperation & {
  id: string;
  montant_mineur: MontantMineur;
  /** Résolue, pas seulement son identifiant : une liste ne doit pas coûter deux appels. */
  categorie: CategorieDepense | null;
  fournisseur: string | null;
  moyen_paiement: MoyenPaiement | null;
  statut: StatutOperation;
  note: string | null;
  cree_le: string;
};

// ---------------------------------------------------------------------------
// Corps de requête
// ---------------------------------------------------------------------------

/**
 * Une ligne à créer.
 *
 * Il faut **au moins** un `produit_id` (le nom et le prix sont alors repris du
 * catalogue), ou bien un `libelle` et un `prix_unitaire_mineur` pour un article
 * hors catalogue. Voir docs/API-CONTRACT.md §5.4.
 */
export type EntreeLigneVente = {
  produit_id?: string | null;
  libelle?: string;
  /** Chaîne décimale, 3 décimales maximum. */
  quantite: string;
  /** Omis avec un `produit_id` : le prix du catalogue est recopié. */
  prix_unitaire_mineur?: MontantMineur;
};

export type CorpsCreationVente = {
  /** `YYYY-MM-DD` (00:00 heure locale de l'entreprise) ou instant ISO complet. */
  effectuee_le: string;
  /** Client de l'entreprise, ou `null` pour une vente anonyme. */
  client_id?: string | null;
  /** Ignoré si `lignes` est fourni : le total est alors recalculé. */
  montant_total_mineur?: MontantMineur;
  moyen_paiement?: MoyenPaiement | null;
  statut?: StatutOperation;
  note?: string | null;
  lignes?: EntreeLigneVente[];
};

export type CorpsModificationVente = Partial<CorpsCreationVente>;

export type CorpsCreationDepense = {
  effectuee_le: string;
  montant_mineur: MontantMineur;
  categorie_id?: string | null;
  fournisseur?: string | null;
  moyen_paiement?: MoyenPaiement | null;
  statut?: StatutOperation;
  note?: string | null;
};

export type CorpsModificationDepense = Partial<CorpsCreationDepense>;

/** Filtres de liste. `du` et `au` sont des dates locales, **bornes incluses**. */
export type FiltresListe = {
  limite?: number;
  decalage?: number;
  du?: string;
  au?: string;
  statut?: StatutOperation;
  moyen_paiement?: MoyenPaiement;
  categorie_id?: string;
  client_id?: string;
};

export const LIMITE_LISTE_DEFAUT = 50;
export const LIMITE_LISTE_MAX = 200;
/** Au-delà, ce n'est plus une vente mais un import de fichier. */
export const LIGNES_VENTE_MAX = 200;
