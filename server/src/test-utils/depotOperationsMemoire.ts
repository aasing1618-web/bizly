import { randomUUID } from "node:crypto";
import type { CategorieDepense } from "@bizly/shared";
import type {
  DepotOperations,
  EntreeDepenseDb,
  EntreeVenteDb,
  FiltresDepot,
  LigneDepenseDb,
  LigneDetailDb,
  LigneVenteDb,
  PatchDepenseDb,
  PatchVenteDb,
} from "../modules/operations/depot.js";

/**
 * Dépôt ventes / dépenses en mémoire — **tests uniquement**.
 * Exclu du build (`tsconfig.build.json`).
 *
 * Il reproduit les invariants que la base impose et rien de plus : isolation
 * par entreprise, numérotation croissante, suppression douce, filtres et
 * pagination. Le SQL réel est vérifié à part, contre Supabase.
 */

const CATEGORIES_PAR_DEFAUT: CategorieDepense[] = [
  { id: "11111111-1111-4111-8111-111111111111", code: "loyer", libelle: "Loyer" },
  { id: "22222222-2222-4222-8222-222222222222", code: "salaires", libelle: "Salaires" },
];

type VenteMemoire = {
  entreprise_id: string;
  vente: LigneVenteDb;
  lignes: LigneDetailDb[];
  supprimee: boolean;
};

type DepenseMemoire = {
  entreprise_id: string;
  depense: LigneDepenseDb;
  supprimee: boolean;
};

export type DepotOperationsMemoire = DepotOperations & {
  /** Catégories connues, communes à toutes les entreprises de test. */
  categories: CategorieDepense[];
  /** Nombre de lignes réellement présentes, suppression douce comprise. */
  compterVentes(entrepriseId: string, inclureSupprimees?: boolean): number;
};

export function creerDepotOperationsMemoire(): DepotOperationsMemoire {
  const ventes: VenteMemoire[] = [];
  const depenses: DepenseMemoire[] = [];
  const compteurs = new Map<string, bigint>();

  const visiblesVentes = (entrepriseId: string) =>
    ventes.filter((v) => v.entreprise_id === entrepriseId && !v.supprimee);

  const visiblesDepenses = (entrepriseId: string) =>
    depenses.filter((d) => d.entreprise_id === entrepriseId && !d.supprimee);

  function filtrer<T extends { effectuee_le: Date; statut: string; moyen_paiement: string | null }>(
    elements: T[],
    filtres: FiltresDepot,
    categorieDe?: (element: T) => string | null,
  ): T[] {
    return elements.filter((element) => {
      if (filtres.debut !== null && element.effectuee_le < filtres.debut) return false;
      if (filtres.fin !== null && element.effectuee_le >= filtres.fin) return false;
      if (filtres.statut !== null && element.statut !== filtres.statut) return false;
      if (filtres.moyen_paiement !== null && element.moyen_paiement !== filtres.moyen_paiement) {
        return false;
      }
      if (filtres.categorie_id !== null && categorieDe !== undefined) {
        if (categorieDe(element) !== filtres.categorie_id) return false;
      }
      return true;
    });
  }

  return {
    categories: CATEGORIES_PAR_DEFAUT,

    compterVentes(entrepriseId, inclureSupprimees = false) {
      return ventes.filter(
        (v) => v.entreprise_id === entrepriseId && (inclureSupprimees || !v.supprimee),
      ).length;
    },

    async listerVentes(entrepriseId, filtres) {
      const retenues = filtrer(
        visiblesVentes(entrepriseId).map((v) => v.vente),
        filtres,
      ).sort((a, b) => {
        const ecart = b.effectuee_le.getTime() - a.effectuee_le.getTime();
        return ecart !== 0 ? ecart : Number(b.numero - a.numero);
      });

      return {
        elements: retenues.slice(filtres.decalage, filtres.decalage + filtres.limite),
        total: retenues.length,
      };
    },

    async trouverVente(entrepriseId, id) {
      const trouvee = visiblesVentes(entrepriseId).find((v) => v.vente.id === id);
      return trouvee === undefined ? null : { vente: trouvee.vente, lignes: trouvee.lignes };
    },

    async creerVente(entrepriseId, entree: EntreeVenteDb) {
      const numero = (compteurs.get(entrepriseId) ?? 0n) + 1n;
      compteurs.set(entrepriseId, numero);

      const lignes: LigneDetailDb[] = (entree.lignes ?? []).map((ligne, index) => ({
        id: randomUUID(),
        rang: index + 1,
        libelle: ligne.libelle,
        quantite: ligne.quantite,
        prix_unitaire_mineur: ligne.prix_unitaire_mineur,
        montant_mineur: ligne.montant_mineur,
      }));

      const vente: LigneVenteDb = {
        id: randomUUID(),
        numero,
        effectuee_le: entree.effectuee_le,
        montant_total_mineur: entree.montant_total_mineur,
        moyen_paiement: entree.moyen_paiement,
        statut: entree.statut,
        note: entree.note,
        cree_le: new Date(),
        nombre_lignes: BigInt(lignes.length),
      };

      ventes.push({ entreprise_id: entrepriseId, vente, lignes, supprimee: false });
      return { vente, lignes };
    },

    async modifierVente(entrepriseId, id, patch: PatchVenteDb) {
      const cible = visiblesVentes(entrepriseId).find((v) => v.vente.id === id);
      if (cible === undefined) return null;

      if (patch.effectuee_le !== undefined) cible.vente.effectuee_le = patch.effectuee_le;
      if (patch.montant_total_mineur !== undefined) {
        cible.vente.montant_total_mineur = patch.montant_total_mineur;
      }
      if (patch.moyen_paiement !== undefined) cible.vente.moyen_paiement = patch.moyen_paiement;
      if (patch.statut !== undefined) cible.vente.statut = patch.statut;
      if (patch.note !== undefined) cible.vente.note = patch.note;

      if (patch.lignes !== undefined) {
        cible.lignes = patch.lignes.map((ligne, index) => ({
          id: randomUUID(),
          rang: index + 1,
          libelle: ligne.libelle,
          quantite: ligne.quantite,
          prix_unitaire_mineur: ligne.prix_unitaire_mineur,
          montant_mineur: ligne.montant_mineur,
        }));
        cible.vente.nombre_lignes = BigInt(cible.lignes.length);
      }

      return { vente: cible.vente, lignes: cible.lignes };
    },

    async supprimerVente(entrepriseId, id) {
      const cible = visiblesVentes(entrepriseId).find((v) => v.vente.id === id);
      if (cible === undefined) return false;
      cible.supprimee = true;
      return true;
    },

    async listerDepenses(entrepriseId, filtres) {
      const retenues = filtrer(
        visiblesDepenses(entrepriseId).map((d) => d.depense),
        filtres,
        (depense) => depense.categorie_id,
      ).sort((a, b) => b.effectuee_le.getTime() - a.effectuee_le.getTime());

      return {
        elements: retenues.slice(filtres.decalage, filtres.decalage + filtres.limite),
        total: retenues.length,
      };
    },

    async trouverDepense(entrepriseId, id) {
      return visiblesDepenses(entrepriseId).find((d) => d.depense.id === id)?.depense ?? null;
    },

    async creerDepense(entrepriseId, entree: EntreeDepenseDb) {
      const categorie = CATEGORIES_PAR_DEFAUT.find((c) => c.id === entree.categorie_id) ?? null;

      const depense: LigneDepenseDb = {
        id: randomUUID(),
        effectuee_le: entree.effectuee_le,
        montant_mineur: entree.montant_mineur,
        categorie_id: categorie?.id ?? null,
        categorie_code: categorie?.code ?? null,
        categorie_libelle: categorie?.libelle ?? null,
        fournisseur: entree.fournisseur,
        moyen_paiement: entree.moyen_paiement,
        statut: entree.statut,
        note: entree.note,
        cree_le: new Date(),
      };

      depenses.push({ entreprise_id: entrepriseId, depense, supprimee: false });
      return depense;
    },

    async modifierDepense(entrepriseId, id, patch: PatchDepenseDb) {
      const cible = visiblesDepenses(entrepriseId).find((d) => d.depense.id === id);
      if (cible === undefined) return null;

      if (patch.effectuee_le !== undefined) cible.depense.effectuee_le = patch.effectuee_le;
      if (patch.montant_mineur !== undefined) cible.depense.montant_mineur = patch.montant_mineur;
      if (patch.fournisseur !== undefined) cible.depense.fournisseur = patch.fournisseur;
      if (patch.moyen_paiement !== undefined) cible.depense.moyen_paiement = patch.moyen_paiement;
      if (patch.statut !== undefined) cible.depense.statut = patch.statut;
      if (patch.note !== undefined) cible.depense.note = patch.note;

      if (patch.categorie_id !== undefined) {
        const categorie = CATEGORIES_PAR_DEFAUT.find((c) => c.id === patch.categorie_id) ?? null;
        cible.depense.categorie_id = categorie?.id ?? null;
        cible.depense.categorie_code = categorie?.code ?? null;
        cible.depense.categorie_libelle = categorie?.libelle ?? null;
      }

      return cible.depense;
    },

    async supprimerDepense(entrepriseId, id) {
      const cible = visiblesDepenses(entrepriseId).find((d) => d.depense.id === id);
      if (cible === undefined) return false;
      cible.supprimee = true;
      return true;
    },

    async listerCategories() {
      return CATEGORIES_PAR_DEFAUT;
    },

    async categorieAppartient(_entrepriseId, categorieId) {
      return CATEGORIES_PAR_DEFAUT.some((c) => c.id === categorieId);
    },
  };
}
