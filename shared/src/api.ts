/**
 * Formes de l'API Bizly partagées entre le serveur et les clients.
 *
 * Toute modification ici est un changement de contrat : mettre à jour
 * docs/API-CONTRACT.md dans le même mouvement.
 */

/** Codes d'erreur du socle. Stables : le code client s'appuie dessus. */
export const CODES_ERREUR = [
  "VALIDATION",
  "JSON_INVALIDE",
  "NON_AUTHENTIFIE",
  "IDENTIFIANTS_INVALIDES",
  "DROIT_INSUFFISANT",
  "COMPTE_SUSPENDU",
  "RESSOURCE_INTROUVABLE",
  "ROUTE_INTROUVABLE",
  "CONFLIT",
  "TROP_DE_REQUETES",
  "ERREUR_INTERNE",
] as const;

export type CodeErreur = (typeof CODES_ERREUR)[number];

/** Corps renvoyé par TOUTE réponse API de code >= 400. */
export type ReponseErreur = {
  erreur: {
    code: CodeErreur;
    message: string;
    details?: Record<string, unknown>;
  };
};

/** Enveloppe des collections paginées. */
export type Page<T> = {
  elements: T[];
  total: number;
  limite: number;
  decalage: number;
};

/** État renvoyé par `GET /api/health`. */
export type ReponseSante = {
  statut: "ok" | "degrade";
  version: string;
  horodatage: string;
  uptime_s: number;
  base: {
    statut: "ok" | "erreur";
    latence_ms: number | null;
  };
};

/** Vrai si le corps reçu est une erreur API bien formée. */
export function estReponseErreur(corps: unknown): corps is ReponseErreur {
  if (typeof corps !== "object" || corps === null) return false;
  const erreur = (corps as { erreur?: unknown }).erreur;
  if (typeof erreur !== "object" || erreur === null) return false;
  const { code, message } = erreur as { code?: unknown; message?: unknown };
  return typeof code === "string" && typeof message === "string";
}
