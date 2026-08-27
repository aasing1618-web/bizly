import type { DepenseAgregable, ProduitAgrege, VenteAgregable } from "../domaine/kpi.js";
import type { DepotKpi, DonneesKpi, FenetreKpi } from "../modules/kpi/depot.js";

/**
 * Dépôt du tableau de bord en mémoire — **tests uniquement**.
 * Exclu du build (`tsconfig.build.json`).
 *
 * Il reproduit le seul comportement qui compte ici : le filtre `[debut, fin[`.
 * Le SQL réel est vérifié à part, contre Supabase.
 */

export type DepotKpiMemoire = DepotKpi & {
  ajouterVente(vente: VenteAgregable): void;
  ajouterDepense(depense: DepenseAgregable): void;
  definirCategories(libelles: Map<string, string>): void;
  definirTopProduits(produits: ProduitAgrege[]): void;
  vider(): void;
};

export function creerDepotKpiMemoire(): DepotKpiMemoire {
  let ventes: VenteAgregable[] = [];
  let depenses: DepenseAgregable[] = [];
  let libelles = new Map<string, string>();
  let produits: ProduitAgrege[] = [];

  const dans = <T extends { effectuee_le: Date }>(elements: T[], fenetre: FenetreKpi): T[] =>
    elements.filter(
      (element) =>
        element.effectuee_le >= fenetre.debut && element.effectuee_le < fenetre.fin,
    );

  return {
    ajouterVente: (vente) => ventes.push(vente),
    ajouterDepense: (depense) => depenses.push(depense),
    definirCategories: (valeur) => {
      libelles = valeur;
    },
    definirTopProduits: (valeur) => {
      produits = valeur;
    },
    vider: () => {
      ventes = [];
      depenses = [];
      libelles = new Map();
      produits = [];
    },

    async charger(_entrepriseId, periode, comparaison, limiteProduits): Promise<DonneesKpi> {
      return {
        ventes: dans(ventes, periode),
        depenses: dans(depenses, periode),
        ventesPrecedentes: dans(ventes, comparaison),
        depensesPrecedentes: dans(depenses, comparaison),
        libellesCategories: libelles,
        topProduits: produits.slice(0, limiteProduits),
      };
    },
  };
}
