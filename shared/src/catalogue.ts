import type { MontantMineur } from "./montant.js";

/**
 * Catalogue de produits et fichier clients.
 * Contrat : `docs/API-CONTRACT.md` §5.
 */

export type Produit = {
  id: string;
  nom: string;
  categorie: string | null;
  prix_mineur: MontantMineur;
  /**
   * `null` signifie **non renseigné**, et ce null est signifiant : le produit
   * est alors exclu de tout classement de rentabilité. Lui attribuer 0 ou le
   * prix de vente inventerait une marge de 100 % ou de 0 %.
   */
  cout_mineur: MontantMineur | null;
  cree_le: string;
};

export type CorpsCreationProduit = {
  nom: string;
  categorie?: string | null;
  prix_mineur: MontantMineur;
  cout_mineur?: MontantMineur | null;
};

export type CorpsModificationProduit = Partial<CorpsCreationProduit>;

export type Client = {
  id: string;
  nom: string;
  email: string | null;
  telephone: string | null;
  note: string | null;
  /** `created_at` de la spécification métier : sert à compter les nouveaux clients. */
  cree_le: string;
};

export type CorpsCreationClient = {
  nom: string;
  email?: string | null;
  telephone?: string | null;
  note?: string | null;
};

export type CorpsModificationClient = Partial<CorpsCreationClient>;

export type FiltresCatalogue = {
  limite?: number;
  decalage?: number;
  recherche?: string;
  categorie?: string;
};

/**
 * Marge d'un produit, en dixièmes de point.
 *
 * `null` dès que le coût n'est pas renseigné, ou que le prix est nul — pas de
 * marge inventée. Formule de la spécification métier §3.6 : elle porte sur le
 * prix du **catalogue**, pas sur le prix réellement pratiqué.
 */
export function margePourcent(produit: Produit): number | null {
  if (produit.cout_mineur === null || produit.prix_mineur <= 0) return null;

  const marge = produit.prix_mineur - produit.cout_mineur;
  // Dixièmes de point, arrondi au plus proche en s'éloignant de zéro.
  const brut = (marge * 1000) / produit.prix_mineur;
  return brut < 0 ? -Math.round(-brut) : Math.round(brut);
}
