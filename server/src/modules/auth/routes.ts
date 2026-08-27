import { Router } from "express";
import type { Request } from "express";
import { effacerCookieSession, lireCookieSession, poserCookieSession } from "../../http/cookies.js";
import { erreurs } from "../../http/erreurs.js";
import { cleEmail, cleIp, creerLimiteur } from "../../http/limiteur.js";
import { contexteDe, exigerSession } from "../../http/session.js";
import type { MetaRequete, ServiceAuth } from "./service.js";
import {
  detailsValidation,
  premierMessage,
  schemaConnexion,
  schemaInscription,
} from "./validation.js";

/**
 * Routes d'authentification — docs/API-CONTRACT.md §2.
 *
 * Les routes restent minces : valider, appeler le service, poser le cookie.
 * Toute la logique est dans le service, où elle se teste sans HTTP.
 */

export type OptionsRouteurAuth = {
  service: ServiceAuth;
  production: boolean;
};

/** 10 tentatives / 15 min — par IP ET par e-mail. */
const LIMITE_CONNEXION = { maximum: 10, fenetreMs: 15 * 60 * 1000 };
/** 5 inscriptions / heure / IP. */
const LIMITE_INSCRIPTION = { maximum: 5, fenetreMs: 60 * 60 * 1000 };

function meta(requete: Request): MetaRequete {
  const agent = requete.get("user-agent");
  return {
    ip: requete.ip ?? null,
    // Tronqué : un en-tête `User-Agent` est fourni par le client et n'a aucune
    // limite de taille imposée par le protocole.
    user_agent: agent === undefined ? null : agent.slice(0, 500),
  };
}

export function creerRouteurAuth(options: OptionsRouteurAuth): Router {
  const { service, production } = options;
  const routeur = Router();

  const limiteInscription = creerLimiteur(LIMITE_INSCRIPTION);
  const limiteConnexion = creerLimiteur(LIMITE_CONNEXION);

  routeur.post("/inscription", async (requete, reponse) => {
    if (!limiteInscription.autoriser(cleIp(requete.ip))) throw erreurs.tropDeRequetes();

    const analyse = schemaInscription.safeParse(requete.body);
    if (!analyse.success) {
      throw erreurs.validation(premierMessage(analyse.error), detailsValidation(analyse.error));
    }

    const { session, jeton } = await service.inscrire(analyse.data, meta(requete));

    poserCookieSession(reponse, jeton, { production });
    reponse.status(201).json(session);
  });

  routeur.post("/connexion", async (requete, reponse) => {
    const analyse = schemaConnexion.safeParse(requete.body);
    if (!analyse.success) {
      throw erreurs.validation(premierMessage(analyse.error), detailsValidation(analyse.error));
    }

    // Deux compteurs : l'IP protège des attaques par balayage depuis une
    // machine, l'e-mail protège UN compte visé depuis plusieurs machines.
    // L'un sans l'autre laisse une porte ouverte.
    const passeIp = limiteConnexion.autoriser(cleIp(requete.ip));
    const passeEmail = limiteConnexion.autoriser(cleEmail(analyse.data.email));
    if (!passeIp || !passeEmail) throw erreurs.tropDeRequetes();

    const { session, jeton } = await service.connecter(analyse.data, meta(requete));

    // Connexion réussie : on efface le compteur de l'e-mail. Sinon un
    // utilisateur qui se trompe neuf fois puis réussit resterait à un doigt du
    // blocage pendant un quart d'heure.
    limiteConnexion.reinitialiser(cleEmail(analyse.data.email));

    poserCookieSession(reponse, jeton, { production });
    reponse.status(200).json(session);
  });

  routeur.post("/deconnexion", async (requete, reponse) => {
    // Idempotent : sans session valide, on répond 204 quand même. Le client
    // n'a rien à faire d'un échec de déconnexion.
    await service.deconnecter(lireCookieSession(requete));
    effacerCookieSession(reponse, { production });
    reponse.status(204).end();
  });

  routeur.get("/moi", exigerSession(service), (requete, reponse) => {
    const { utilisateur, entreprise } = contexteDe(requete);
    reponse.status(200).json({ utilisateur, entreprise });
  });

  return routeur;
}
