import type { UtilisateurPublic, VolumesEnregistres } from "@bizly/shared";
import type { DepotEntreprise } from "../modules/entreprise/depot.js";
import type { DepotMemoire } from "./depotMemoire.js";

/**
 * Paramètres de l'entreprise, en mémoire — **usage tests uniquement**.
 *
 * Travaille sur les objets du `DepotMemoire` d'authentification, pas sur une
 * copie : une entreprise renommée ici doit apparaître renommée dans la session
 * résolue, exactement comme en base. Une copie ferait passer des tests que le
 * vrai code échouerait.
 */

const DECIMALES: Record<string, number> = {
  EUR: 2,
  XOF: 0,
  XAF: 0,
  TND: 3,
  USD: 2,
};

export type DepotEntrepriseMemoire = DepotEntreprise & {
  /** Simule des écritures déjà en base, pour tester le verrou de devise. */
  definirVolumes(entrepriseId: string, volumes: Partial<VolumesEnregistres>): void;
};

export function creerDepotEntrepriseMemoire(auth: DepotMemoire): DepotEntrepriseMemoire {
  const volumes = new Map<string, VolumesEnregistres>();

  const volumesDe = (entrepriseId: string): VolumesEnregistres =>
    volumes.get(entrepriseId) ?? { ventes: 0, depenses: 0, produits: 0 };

  return {
    async compterVolumes(entrepriseId) {
      return volumesDe(entrepriseId);
    },

    async modifierEntreprise(entrepriseId, patch) {
      const concernes = auth
        .tousLesComptes()
        .filter((compte) => compte.entreprise.id === entrepriseId);

      const premier = concernes[0];
      if (premier === undefined) return null;

      for (const compte of concernes) {
        const { entreprise } = compte;
        if (patch.nom !== undefined) entreprise.nom = patch.nom;
        if (patch.secteur !== undefined) entreprise.secteur = patch.secteur;
        if (patch.pays !== undefined) entreprise.pays = patch.pays;
        if (patch.fuseau !== undefined) entreprise.fuseau = patch.fuseau;
        if (patch.devise !== undefined) {
          entreprise.devise = {
            code: patch.devise,
            decimales: DECIMALES[patch.devise] ?? 2,
          };
        }
      }

      return premier.entreprise;
    },

    async modifierProfil(utilisateurId, nom) {
      const compte = auth
        .tousLesComptes()
        .find((candidat) => candidat.utilisateur.id === utilisateurId);
      if (compte === undefined) return null;

      compte.utilisateur.nom = nom;
      const projection: UtilisateurPublic = compte.utilisateur;
      return projection;
    },

    async lireEmpreinteMotDePasse(utilisateurId) {
      const compte = auth
        .tousLesComptes()
        .find((candidat) => candidat.utilisateur.id === utilisateurId);
      return compte?.mot_de_passe_hash ?? null;
    },

    async changerMotDePasse(utilisateurId, empreinteMotDePasse, sessionConservee) {
      auth.definirEmpreinteMotDePasse(utilisateurId, empreinteMotDePasse);
      auth.revoquerSessionsSauf(utilisateurId, sessionConservee.toString("hex"));
    },

    definirVolumes(entrepriseId, partiels) {
      volumes.set(entrepriseId, { ...volumesDe(entrepriseId), ...partiels });
    },
  };
}
