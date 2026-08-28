import { randomUUID } from "node:crypto";
import {
  NomDejaPris,
  type DepotCatalogue,
  type EntreeClientDb,
  type EntreeProduitDb,
  type FiltresDepotCatalogue,
  type LigneClientDb,
  type LigneProduitDb,
  type PatchClientDb,
  type PatchProduitDb,
} from "../modules/catalogue/depot.js";

/**
 * Catalogue et fichier clients en mémoire — **tests uniquement**.
 * Exclu du build (`tsconfig.build.json`).
 *
 * Reproduit les invariants que la base impose : isolation par entreprise,
 * unicité du nom de produit insensible à la casse, suppression douce.
 */

type Entree<T> = { entreprise_id: string; ligne: T; supprime: boolean };

export type DepotCatalogueMemoire = DepotCatalogue & {
  /** Raccourci de test : crée un produit et rend son identifiant. */
  ajouterProduit(entrepriseId: string, entree: Partial<EntreeProduitDb> & { nom: string }): Promise<string>;
  ajouterClient(entrepriseId: string, nom: string): Promise<string>;
};

export function creerDepotCatalogueMemoire(): DepotCatalogueMemoire {
  const produits: Entree<LigneProduitDb>[] = [];
  const clients: Entree<LigneClientDb>[] = [];

  const vivantsProduits = (entrepriseId: string) =>
    produits.filter((p) => p.entreprise_id === entrepriseId && !p.supprime);
  const vivantsClients = (entrepriseId: string) =>
    clients.filter((c) => c.entreprise_id === entrepriseId && !c.supprime);

  function paginer<T>(elements: T[], filtres: FiltresDepotCatalogue) {
    return {
      elements: elements.slice(filtres.decalage, filtres.decalage + filtres.limite),
      total: elements.length,
    };
  }

  const memeNom = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

  return {
    async ajouterProduit(entrepriseId, entree) {
      const cree = await this.creerProduit(entrepriseId, {
        nom: entree.nom,
        categorie: entree.categorie ?? null,
        prix_mineur: entree.prix_mineur ?? 1000n,
        cout_mineur: entree.cout_mineur ?? null,
      });
      return cree.id;
    },

    async ajouterClient(entrepriseId, nom) {
      const cree = await this.creerClient(entrepriseId, {
        nom,
        email: null,
        telephone: null,
        note: null,
      });
      return cree.id;
    },

    async listerProduits(entrepriseId, filtres) {
      const retenus = vivantsProduits(entrepriseId)
        .map((p) => p.ligne)
        .filter((ligne) => {
          if (filtres.recherche !== null && !ligne.nom.toLowerCase().includes(filtres.recherche.toLowerCase())) {
            return false;
          }
          if (filtres.categorie !== null && ligne.categorie !== filtres.categorie) return false;
          return true;
        })
        .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));

      return paginer(retenus, filtres);
    },

    async trouverProduit(entrepriseId, id) {
      return vivantsProduits(entrepriseId).find((p) => p.ligne.id === id)?.ligne ?? null;
    },

    async creerProduit(entrepriseId, entree: EntreeProduitDb) {
      if (vivantsProduits(entrepriseId).some((p) => memeNom(p.ligne.nom, entree.nom))) {
        throw new NomDejaPris();
      }

      const ligne: LigneProduitDb = {
        id: randomUUID(),
        nom: entree.nom,
        categorie: entree.categorie,
        prix_mineur: entree.prix_mineur,
        cout_mineur: entree.cout_mineur,
        cree_le: new Date(),
      };
      produits.push({ entreprise_id: entrepriseId, ligne, supprime: false });
      return ligne;
    },

    async modifierProduit(entrepriseId, id, patch: PatchProduitDb) {
      const cible = vivantsProduits(entrepriseId).find((p) => p.ligne.id === id);
      if (cible === undefined) return null;

      if (patch.nom !== undefined) {
        const collision = vivantsProduits(entrepriseId).some(
          (p) => p.ligne.id !== id && memeNom(p.ligne.nom, patch.nom as string),
        );
        if (collision) throw new NomDejaPris();
        cible.ligne.nom = patch.nom;
      }
      if (patch.categorie !== undefined) cible.ligne.categorie = patch.categorie;
      if (patch.prix_mineur !== undefined) cible.ligne.prix_mineur = patch.prix_mineur;
      if (patch.cout_mineur !== undefined) cible.ligne.cout_mineur = patch.cout_mineur;

      return cible.ligne;
    },

    async supprimerProduit(entrepriseId, id) {
      const cible = vivantsProduits(entrepriseId).find((p) => p.ligne.id === id);
      if (cible === undefined) return false;
      cible.supprime = true;
      return true;
    },

    async chargerProduits(entrepriseId, ids) {
      return new Map(
        vivantsProduits(entrepriseId)
          .filter((p) => ids.includes(p.ligne.id))
          .map((p) => [p.ligne.id, p.ligne]),
      );
    },

    async listerClients(entrepriseId, filtres) {
      const retenus = vivantsClients(entrepriseId)
        .map((c) => c.ligne)
        .filter(
          (ligne) =>
            filtres.recherche === null ||
            ligne.nom.toLowerCase().includes(filtres.recherche.toLowerCase()),
        )
        .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));

      return paginer(retenus, filtres);
    },

    async trouverClient(entrepriseId, id) {
      return vivantsClients(entrepriseId).find((c) => c.ligne.id === id)?.ligne ?? null;
    },

    async creerClient(entrepriseId, entree: EntreeClientDb) {
      const ligne: LigneClientDb = {
        id: randomUUID(),
        nom: entree.nom,
        email: entree.email,
        telephone: entree.telephone,
        note: entree.note,
        cree_le: new Date(),
      };
      clients.push({ entreprise_id: entrepriseId, ligne, supprime: false });
      return ligne;
    },

    async modifierClient(entrepriseId, id, patch: PatchClientDb) {
      const cible = vivantsClients(entrepriseId).find((c) => c.ligne.id === id);
      if (cible === undefined) return null;

      if (patch.nom !== undefined) cible.ligne.nom = patch.nom;
      if (patch.email !== undefined) cible.ligne.email = patch.email;
      if (patch.telephone !== undefined) cible.ligne.telephone = patch.telephone;
      if (patch.note !== undefined) cible.ligne.note = patch.note;

      return cible.ligne;
    },

    async supprimerClient(entrepriseId, id) {
      const cible = vivantsClients(entrepriseId).find((c) => c.ligne.id === id);
      if (cible === undefined) return false;
      cible.supprime = true;
      return true;
    },

    async clientAppartient(entrepriseId, id) {
      return vivantsClients(entrepriseId).some((c) => c.ligne.id === id);
    },
  };
}
