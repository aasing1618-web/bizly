/**
 * Essai gratuit, abonnement Pro et paiement Wave — formes partagées.
 *
 * Le **calcul** de l'accès n'est pas ici : il vit dans
 * `server/src/domaine/abonnement.ts` et ne descend jamais dans le navigateur
 * (CLAUDE.md §7.2). Ce fichier ne porte que le vocabulaire commun et les
 * constantes d'affichage.
 */

/** Durée de l'essai offert à toute nouvelle entreprise. */
export const DUREE_ESSAI_MOIS = 2;

/** Prix du plan Pro, en francs CFA par mois. */
export const PRIX_PRO_MENSUEL_XOF = 2000;

/** Ce qu'un mois d'abonnement ajoute, en jours. */
export const DUREE_ABONNEMENT_JOURS = 30;

/**
 * Numéro Wave qui reçoit les paiements.
 *
 * Affiché tel quel au client : il n'existe pas d'URL publique construite à
 * partir d'un numéro Wave — un lien de paiement se génère depuis un compte
 * Wave Business. Fabriquer une adresse à partir du numéro produirait un lien
 * mort, ce qui est pire que pas de lien.
 */
export const NUMERO_WAVE = "778608247";

/** Le même numéro, groupé comme on le lit au Sénégal. */
export const NUMERO_WAVE_AFFICHE = "77 860 82 47";

/**
 * Lien de paiement Wave Business, s'il existe.
 *
 * Rempli par le serveur depuis `WAVE_LIEN_PAIEMENT`. `null` tant que le
 * propriétaire n'a pas de compte Wave Business : l'interface affiche alors le
 * numéro et la marche à suivre, sans bouton mort.
 */
export type LienPaiementWave = string | null;

/**
 * Pourquoi l'entreprise a — ou n'a pas — accès à l'application.
 *
 * Calculé par le serveur à chaque résolution de session et joint à
 * `GET /api/moi`, `POST /api/connexion` et `POST /api/inscription` : le client
 * n'a aucune date à interpréter lui-même, donc aucune façon de se tromper.
 */
export type MotifAcces =
  /** Essai en cours. */
  | "ESSAI"
  /** Abonnement payé et encore valide. */
  | "ABONNE"
  /** Compte du propriétaire de la plateforme : jamais bloqué. */
  | "EXEMPT"
  /** Essai terminé, aucun abonnement valide. */
  | "ESSAI_EXPIRE"
  /** Abonnement arrivé à échéance. */
  | "ABONNEMENT_EXPIRE";

export type EtatAcces = {
  /** `true` = l'application est fermée, seul l'écran de paiement répond. */
  bloque: boolean;
  motif: MotifAcces;
  /** Jours entiers restants avant blocage. `null` si aucune échéance. */
  jours_restants: number | null;
  /** Fin de l'essai, ISO 8601. */
  essai_expire_le: string | null;
  /** Fin de l'abonnement payé, ISO 8601. */
  abonnement_expire_le: string | null;
};

/** Vrai quand il reste peu de temps : l'interface prévient sans crier au loup. */
export const SEUIL_ALERTE_JOURS = 14;

// --------------------------------------------------------------- paiement --

export type StatutPaiement = "en_attente" | "valide" | "echoue";

/** Corps de `POST /api/paiement/declarer`. */
export type CorpsDeclarerPaiement = {
  /** Référence de la transaction Wave, telle que le client la lit dans Wave. */
  reference_wave: string;
};

/** Un paiement déclaré par le client, tel qu'il le voit. */
export type PaiementDeclare = {
  id: string;
  reference_transaction: string;
  reference_wave: string | null;
  montant: number;
  devise: string;
  statut: StatutPaiement;
  cree_le: string;
  valide_le: string | null;
  motif_refus: string | null;
};

/** Réponse de `GET /api/paiement/statut`. */
export type ReponseStatutAbonnement = {
  acces: EtatAcces;
  plan: string;
  prix_mensuel: number;
  devise: string;
  numero_wave: string;
  numero_wave_affiche: string;
  lien_wave: LienPaiementWave;
  /** Paiement déclaré et pas encore tranché, s'il y en a un. */
  en_attente: PaiementDeclare | null;
  /** Les derniers paiements de cette entreprise, du plus récent au plus ancien. */
  historique: PaiementDeclare[];
};

// ------------------------------------------------------ console admin --

/** Une déclaration de paiement, vue par l'administrateur. */
export type PaiementAValider = {
  id: string;
  entreprise_id: string;
  entreprise_nom: string;
  proprietaire_email: string | null;
  reference_transaction: string;
  reference_wave: string | null;
  montant: number;
  devise: string;
  cree_le: string;
};

/** Corps de `POST /api/admin/paiements/:id/refuser`. */
export type CorpsRefusPaiement = {
  motif: string;
};

/** Réponse de la validation : ce que l'administrateur doit pouvoir relire. */
export type ReponseValidationPaiement = {
  entreprise_id: string;
  plan: string;
  abonnement_expire_le: string;
};
