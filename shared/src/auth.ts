import type { Devise } from "./montant.js";

/**
 * Formes d'authentification partagées entre le serveur et les clients.
 * Contrat : docs/API-CONTRACT.md §2.
 */

export type Role = "PROPRIETAIRE" | "EMPLOYE";
export type StatutCompte = "ACTIF" | "SUSPENDU";

/**
 * Utilisateur tel qu'il est exposé par l'API.
 *
 * `mot_de_passe_hash` n'apparaît nulle part, sous aucune forme, dans aucune
 * réponse. Ce type est la seule projection autorisée.
 */
export type UtilisateurPublic = {
  id: string;
  nom: string;
  email: string;
  role: Role;
};

/**
 * Entreprise telle qu'elle est exposée par l'API.
 *
 * La devise est **résolue** (code + décimales) : le client n'a pas à connaître
 * la table `devises` pour formater un montant, et ne peut pas se tromper de
 * nombre de décimales.
 */
export type EntreprisePublique = {
  id: string;
  nom: string;
  secteur: string;
  devise: Devise;
  fuseau: string;
  statut: StatutCompte;
};

/** Réponse de `POST /api/inscription`, `POST /api/connexion` et `GET /api/moi`. */
export type ReponseSession = {
  utilisateur: UtilisateurPublic;
  entreprise: EntreprisePublique;
};

export type CorpsInscription = {
  entreprise: {
    nom: string;
    secteur: string;
    devise?: string;
    fuseau?: string;
  };
  utilisateur: {
    nom: string;
    email: string;
    mot_de_passe: string;
  };
};

export type CorpsConnexion = {
  email: string;
  mot_de_passe: string;
};

/** Longueur minimale d'un mot de passe. Voir docs/API-CONTRACT.md §2. */
export const MOT_DE_PASSE_LONGUEUR_MIN = 10;
export const MOT_DE_PASSE_LONGUEUR_MAX = 200;
