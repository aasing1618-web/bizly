import type { ErrorRequestHandler, RequestHandler } from "express";
import type { CodeErreur, ReponseErreur } from "@bizly/shared";
import { detaillerErreur, journal } from "./journal.js";

/**
 * Erreurs API.
 *
 * Toute réponse >= 400 sort avec le même corps `{ erreur: { code, message } }`
 * (docs/API-CONTRACT.md §0). Aucune stack, aucun message Postgres, aucun nom de
 * table ne franchit cette frontière : le détail part dans les logs, associé à
 * l'identifiant de requête que l'utilisateur peut nous communiquer.
 */
export class ErreurApi extends Error {
  readonly statut: number;
  readonly code: CodeErreur;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    statut: number,
    code: CodeErreur,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ErreurApi";
    this.statut = statut;
    this.code = code;
    this.details = details;
  }

  corps(): ReponseErreur {
    return {
      erreur: {
        code: this.code,
        message: this.message,
        ...(this.details === undefined ? {} : { details: this.details }),
      },
    };
  }
}

export const erreurs = {
  validation: (message: string, details?: Record<string, unknown>) =>
    new ErreurApi(400, "VALIDATION", message, details),

  nonAuthentifie: () =>
    new ErreurApi(401, "NON_AUTHENTIFIE", "Authentification requise."),

  droitInsuffisant: () =>
    new ErreurApi(403, "DROIT_INSUFFISANT", "Vous n'avez pas les droits nécessaires."),

  compteSuspendu: () =>
    new ErreurApi(
      403,
      "COMPTE_SUSPENDU",
      "Ce compte est suspendu. Contactez le support pour le réactiver.",
    ),

  /**
   * À utiliser AUSSI pour une ressource appartenant à une autre entreprise.
   * Répondre 403 dans ce cas révélerait son existence : voir CLAUDE.md §7.
   */
  introuvable: (quoi = "Ressource") =>
    new ErreurApi(404, "RESSOURCE_INTROUVABLE", `${quoi} introuvable.`),

  conflit: (message: string, details?: Record<string, unknown>) =>
    new ErreurApi(409, "CONFLIT", message, details),

  tropDeRequetes: () =>
    new ErreurApi(429, "TROP_DE_REQUETES", "Trop de tentatives. Réessayez dans quelques minutes."),
};

/** Attrape toute route `/api/*` non déclarée. Monté APRÈS les routeurs API. */
export const routeApiIntrouvable: RequestHandler = (_requete, _reponse, suivant) => {
  suivant(new ErreurApi(404, "ROUTE_INTROUVABLE", "Cette route d'API n'existe pas."));
};

type ErreurCorpsJson = { type?: string; status?: number };

/** Vrai si l'erreur vient du parseur JSON d'Express (corps illisible). */
function estErreurJsonMalforme(cause: unknown): boolean {
  if (typeof cause !== "object" || cause === null) return false;
  return (cause as ErreurCorpsJson).type === "entity.parse.failed";
}

/**
 * Gestionnaire d'erreurs final. Doit être monté en DERNIER et garder ses quatre
 * paramètres : Express identifie un gestionnaire d'erreurs à son arité.
 */
export const gestionnaireErreurs: ErrorRequestHandler = (cause, requete, reponse, suivant) => {
  if (reponse.headersSent) {
    suivant(cause);
    return;
  }

  const identifiantRequete = reponse.getHeader("X-Request-Id");

  if (cause instanceof ErreurApi) {
    if (cause.statut >= 500) {
      journal.erreur("erreur API", {
        requete_id: identifiantRequete,
        chemin: requete.originalUrl,
        ...detaillerErreur(cause),
      });
    }
    reponse.status(cause.statut).json(cause.corps());
    return;
  }

  if (estErreurJsonMalforme(cause)) {
    const erreur = new ErreurApi(400, "JSON_INVALIDE", "Le corps de la requête n'est pas du JSON valide.");
    reponse.status(erreur.statut).json(erreur.corps());
    return;
  }

  // Tout le reste est un bug de notre côté : détaillé dans les logs, opaque
  // pour le client.
  journal.erreur("exception non gérée", {
    requete_id: identifiantRequete,
    methode: requete.method,
    chemin: requete.originalUrl,
    ...detaillerErreur(cause),
  });

  const corps: ReponseErreur = {
    erreur: {
      code: "ERREUR_INTERNE",
      message: "Une erreur interne est survenue. Réessayez plus tard.",
    },
  };
  reponse.status(500).json(corps);
};
