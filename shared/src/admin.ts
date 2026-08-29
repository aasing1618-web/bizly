import type { Plan, StatutCompte } from "./auth.js";

/**
 * Console d'administration — docs/API-CONTRACT.md §9.
 *
 * Espace strictement séparé de l'application cliente : autre table de comptes
 * (`admins`), autre table de sessions, autre cookie. Un jeton client n'ouvre
 * aucune porte ici, et réciproquement.
 */

export type AdminPublic = {
  id: string;
  nom: string;
  email: string;
};

export type CorpsConnexionAdmin = {
  email: string;
  mot_de_passe: string;
};

/** Une entreprise vue depuis la console : ce qu'il faut pour décider. */
export type EntrepriseAdmin = {
  id: string;
  nom: string;
  secteur: string;
  pays: string | null;
  devise: string;
  plan: Plan;
  statut: StatutCompte;
  motif_suspension: string | null;
  cree_le: string;
  /** Propriétaire du compte — l'interlocuteur à contacter. */
  proprietaire: { id: string; nom: string; email: string } | null;
  nombre_utilisateurs: number;
  nombre_ventes: number;
  nombre_depenses: number;
  derniere_activite_le: string | null;
};

export type CorpsModificationEntrepriseAdmin = {
  plan?: Plan;
  statut?: StatutCompte;
  /** Requis quand `statut` passe à `SUSPENDU`, ignoré sinon. */
  motif_suspension?: string | null;
};

export type CorpsReinitialisationMotDePasse = {
  mot_de_passe: string;
};

/** Réponse de `GET /api/admin/statistiques`. */
export type StatistiquesAdmin = {
  entreprises: number;
  entreprises_actives: number;
  entreprises_suspendues: number;
  utilisateurs: number;
  /** Entreprises ayant enregistré au moins une vente — CLAUDE.md §14. */
  entreprises_avec_vente: number;
  par_plan: { plan: Plan; nombre: number }[];
  inscriptions_30_jours: number;
};
