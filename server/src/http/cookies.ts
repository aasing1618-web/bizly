import { parse, serialize } from "cookie";
import type { Request, Response } from "express";

/**
 * Cookie de session.
 *
 * Express 5 n'analyse pas les cookies : on s'appuie sur `cookie`, la
 * bibliothèque qu'Express utilise déjà en interne pour les sérialiser — pas de
 * dépendance supplémentaire dans l'arbre, et un échappement correct.
 */

export const NOM_COOKIE_SESSION = "bizly_session";

/** 30 jours, en secondes. Voir docs/API-CONTRACT.md §2. */
export const DUREE_SESSION_S = 30 * 24 * 60 * 60;

export type OptionsCookie = {
  /** `Secure` n'est posé qu'en production : en HTTP local, il rendrait le cookie inutilisable. */
  production: boolean;
};

export function lireCookieSession(requete: Request): string | null {
  const entete = requete.headers.cookie;
  if (entete === undefined) return null;

  const valeur = parse(entete)[NOM_COOKIE_SESSION];
  return valeur === undefined || valeur === "" ? null : valeur;
}

export function poserCookieSession(
  reponse: Response,
  jeton: string,
  options: OptionsCookie,
): void {
  reponse.setHeader(
    "Set-Cookie",
    serialize(NOM_COOKIE_SESSION, jeton, {
      httpOnly: true, // invisible au JavaScript : un XSS ne peut pas voler la session
      sameSite: "lax", // bloque les POST inter-sites sans casser la navigation entrante
      secure: options.production,
      path: "/",
      maxAge: DUREE_SESSION_S,
    }),
  );
}

/**
 * Efface le cookie.
 *
 * Les attributs doivent être **identiques** à ceux de la pose (`path`, `sameSite`,
 * `secure`) : le navigateur identifie un cookie par ce triplet, et un attribut
 * différent créerait un second cookie au lieu d'effacer le premier.
 */
export function effacerCookieSession(reponse: Response, options: OptionsCookie): void {
  reponse.setHeader(
    "Set-Cookie",
    serialize(NOM_COOKIE_SESSION, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: options.production,
      path: "/",
      maxAge: 0,
      expires: new Date(0),
    }),
  );
}
