import { parse, serialize } from "cookie";
import type { Request, Response } from "express";

/**
 * Cookies de session.
 *
 * Express 5 n'analyse pas les cookies : on s'appuie sur `cookie`, la
 * bibliothèque qu'Express utilise déjà en interne pour les sérialiser — pas de
 * dépendance supplémentaire dans l'arbre, et un échappement correct.
 *
 * **Deux cookies distincts**, jamais un seul : `bizly_session` pour les clients,
 * `bizly_admin` pour la console d'administration. Un jeton client ne peut donc
 * pas être présenté comme un jeton admin, ni l'inverse — la séparation est dans
 * le transport, pas seulement dans la vérification.
 */

export const NOM_COOKIE_SESSION = "bizly_session";
export const NOM_COOKIE_ADMIN = "bizly_admin";

/** 30 jours, en secondes. Voir docs/API-CONTRACT.md §2. */
export const DUREE_SESSION_S = 30 * 24 * 60 * 60;

/**
 * 12 heures pour une session d'administration — docs/API-CONTRACT.md §9.1.
 *
 * Un accès qui voit tous les comptes ne reste pas ouvert un mois.
 */
export const DUREE_SESSION_ADMIN_S = 12 * 60 * 60;

export type OptionsCookie = {
  /** `Secure` n'est posé qu'en production : en HTTP local, il rendrait le cookie inutilisable. */
  production: boolean;
};

function lire(requete: Request, nom: string): string | null {
  const entete = requete.headers.cookie;
  if (entete === undefined) return null;

  const valeur = parse(entete)[nom];
  return valeur === undefined || valeur === "" ? null : valeur;
}

function poser(
  reponse: Response,
  nom: string,
  jeton: string,
  dureeS: number,
  options: OptionsCookie,
): void {
  reponse.setHeader(
    "Set-Cookie",
    serialize(nom, jeton, {
      httpOnly: true, // invisible au JavaScript : un XSS ne peut pas voler la session
      sameSite: "lax", // bloque les POST inter-sites sans casser la navigation entrante
      secure: options.production,
      path: "/",
      maxAge: dureeS,
    }),
  );
}

/**
 * Efface un cookie.
 *
 * Les attributs doivent être **identiques** à ceux de la pose (`path`, `sameSite`,
 * `secure`) : le navigateur identifie un cookie par ce triplet, et un attribut
 * différent créerait un second cookie au lieu d'effacer le premier.
 */
function effacer(reponse: Response, nom: string, options: OptionsCookie): void {
  reponse.setHeader(
    "Set-Cookie",
    serialize(nom, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: options.production,
      path: "/",
      maxAge: 0,
      expires: new Date(0),
    }),
  );
}

// --------------------------------------------------------------- client --

export function lireCookieSession(requete: Request): string | null {
  return lire(requete, NOM_COOKIE_SESSION);
}

export function poserCookieSession(
  reponse: Response,
  jeton: string,
  options: OptionsCookie,
): void {
  poser(reponse, NOM_COOKIE_SESSION, jeton, DUREE_SESSION_S, options);
}

export function effacerCookieSession(reponse: Response, options: OptionsCookie): void {
  effacer(reponse, NOM_COOKIE_SESSION, options);
}

// ---------------------------------------------------------------- admin --

export function lireCookieAdmin(requete: Request): string | null {
  return lire(requete, NOM_COOKIE_ADMIN);
}

export function poserCookieAdmin(
  reponse: Response,
  jeton: string,
  options: OptionsCookie,
): void {
  poser(reponse, NOM_COOKIE_ADMIN, jeton, DUREE_SESSION_ADMIN_S, options);
}

export function effacerCookieAdmin(reponse: Response, options: OptionsCookie): void {
  effacer(reponse, NOM_COOKIE_ADMIN, options);
}
