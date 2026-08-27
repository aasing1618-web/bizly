import type { Request, RequestHandler } from "express";
import type { ContexteSession, ServiceAuth } from "../modules/auth/service.js";
import { lireCookieSession } from "./cookies.js";
import { erreurs } from "./erreurs.js";
import type { Role } from "@bizly/shared";

/**
 * Contexte d'appel authentifié.
 *
 * **Toute** requête métier des vagues suivantes lit son entreprise ICI, jamais
 * dans le corps ni dans l'URL. C'est ce qui rend l'isolation structurelle : un
 * client ne peut pas désigner une autre entreprise, puisqu'il ne désigne rien.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      contexte?: ContexteSession;
    }
  }
}

/**
 * Lit le contexte d'une requête passée par `exigerSession`.
 *
 * Lève si le middleware n'a pas été monté : c'est une erreur de câblage, pas un
 * cas d'exécution — mieux vaut un 500 bruyant au développement qu'une requête
 * métier silencieusement dépourvue de filtre `entreprise_id`.
 */
export function contexteDe(requete: Request): ContexteSession {
  const contexte = requete.contexte;
  if (contexte === undefined) {
    throw new Error(
      "contexteDe() appelé sur une route non protégée : monter exigerSession en amont.",
    );
  }
  return contexte;
}

/**
 * Exige une session valide.
 *
 * - pas de cookie, cookie inconnu, session expirée ou révoquée → `401`
 * - compte ou entreprise suspendu → `403 COMPTE_SUSPENDU` (levé par le service)
 */
export function exigerSession(service: ServiceAuth): RequestHandler {
  return async (requete, _reponse, suivant) => {
    const contexte = await service.resoudre(lireCookieSession(requete));

    if (contexte === null) {
      suivant(erreurs.nonAuthentifie());
      return;
    }

    requete.contexte = contexte;
    suivant();
  };
}

/**
 * Exige un rôle, à composer APRÈS `exigerSession`.
 *
 * Renvoie `403` et non `404` : la ressource visée appartient bien à
 * l'entreprise de l'appelant, il n'y a donc rien à dissimuler — seulement un
 * droit qui manque.
 */
export function exigerRole(...rolesAutorises: Role[]): RequestHandler {
  return (requete, _reponse, suivant) => {
    const { utilisateur } = contexteDe(requete);

    if (!rolesAutorises.includes(utilisateur.role)) {
      suivant(erreurs.droitInsuffisant());
      return;
    }

    suivant();
  };
}
