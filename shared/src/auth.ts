import type { Devise } from "./montant.js";

/**
 * Formes d'authentification partagées entre le serveur et les clients.
 * Contrat : docs/API-CONTRACT.md §2.
 */

export type Role = "PROPRIETAIRE" | "EMPLOYE";
export type StatutCompte = "ACTIF" | "SUSPENDU";

/**
 * Plan tarifaire — CLAUDE.md §12.
 *
 * Champ **manuel** au MVP : seul un administrateur le change (§7.4). Aucune
 * logique de facturation ne s'y rattache, et le client ne peut pas le modifier
 * lui-même — `PATCH /api/entreprise` le refuse.
 */
export const PLANS = ["free", "pro", "business"] as const;
export type Plan = (typeof PLANS)[number];

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
  /** ISO 3166-1 alpha-2, ou `null` pour un compte créé avant la migration 0004. */
  pays: string | null;
  devise: Devise;
  fuseau: string;
  plan: Plan;
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
    /** ISO 3166-1 alpha-2. Détermine la devise et le fuseau par défaut. */
    pays?: string;
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

/**
 * Corps de `PATCH /api/entreprise` — docs/API-CONTRACT.md §8.
 *
 * `plan` et `statut` en sont volontairement absents : ils relèvent de
 * l'administration (CLAUDE.md §7.4), jamais du client.
 */
export type CorpsModificationEntreprise = {
  nom?: string;
  secteur?: string;
  pays?: string | null;
  devise?: string;
  fuseau?: string;
};

/** Corps de `PATCH /api/moi`. L'e-mail ne change pas sans vérification. */
export type CorpsModificationProfil = {
  nom: string;
};

/** Corps de `POST /api/mot-de-passe`. */
export type CorpsChangementMotDePasse = {
  ancien: string;
  nouveau: string;
};

/**
 * Détail joint au `409 CONFLIT` d'un changement de devise refusé.
 *
 * Les montants sont stockés en unité mineure : changer la devise les
 * réinterpréterait sans les convertir — 31 500 centimes deviendraient
 * 31 500 francs. On annonce donc **combien** d'écritures bloquent, pour que le
 * message soit vérifiable par l'utilisateur au lieu d'être un refus opaque.
 */
export type VolumesEnregistres = {
  ventes: number;
  depenses: number;
  produits: number;
};

/** Longueur minimale d'un mot de passe. Voir docs/API-CONTRACT.md §2. */
export const MOT_DE_PASSE_LONGUEUR_MIN = 10;
export const MOT_DE_PASSE_LONGUEUR_MAX = 200;
