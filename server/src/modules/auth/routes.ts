import { Router } from "express";
import type { Request } from "express";
import { effacerCookieSession, lireCookieSession, poserCookieSession } from "../../http/cookies.js";
import { erreurs } from "../../http/erreurs.js";
import { cleEmail, cleIp, type FabriqueLimiteur } from "../../http/limiteur.js";
import { contexteDe, exigerSession } from "../../http/session.js";
import { detailsValidation, premierMessage } from "../../http/validation.js";
import type { MetaRequete, ServiceAuth } from "./service.js";
import { schemaConnexion, schemaInscription } from "./validation.js";

/**
 * Routes d'authentification — docs/API-CONTRACT.md §2.
 *
 * Les routes restent minces : valider, appeler le service, poser le cookie.
 * Toute la logique est dans le service, où elle se teste sans HTTP.
 */

export type OptionsRouteurAuth = {
  service: ServiceAuth;
  production: boolean;
  /**
   * Fabrique de limiteurs, injectée.
   *
   * En production elle est adossée à Postgres, pour que la limite tienne quand
   * l'application tourne en plusieurs exemplaires. Les tests en injectent une
   * version en mémoire, qui n'a besoin d'aucune base.
   */
  creerLimiteur: FabriqueLimiteur;
};

/**
 * Deux limites de connexion, aux rôles distincts — et aux seuils distincts.
 *
 * **Par e-mail (10 / 15 min)** : c'est elle qui protège UN compte contre la
 * force brute. Serrée, parce qu'un propriétaire légitime ne se trompe pas dix
 * fois de suite sur son propre mot de passe.
 *
 * **Par IP (30 / 15 min)** : elle ne protège aucun compte en particulier, elle
 * ralentit le balayage de plusieurs comptes depuis une même machine. Elle doit
 * rester LARGE, parce qu'un commerce ou un bureau partage une seule IP
 * publique : au même seuil que l'e-mail, dix erreurs cumulées par l'équipe
 * bloqueraient tout le monde — y compris ceux qui tapent le bon mot de passe,
 * puisque la limitation s'applique avant l'authentification.
 */
const LIMITE_CONNEXION_EMAIL = { maximum: 10, fenetreMs: 15 * 60 * 1000 };
const LIMITE_CONNEXION_IP = { maximum: 30, fenetreMs: 15 * 60 * 1000 };
/** 5 inscriptions / heure / IP : créer un compte est un geste rare. */
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
  const { service, production, creerLimiteur } = options;
  const routeur = Router();

  const limiteInscription = creerLimiteur("inscription", LIMITE_INSCRIPTION);
  const limiteConnexionEmail = creerLimiteur("connexion-email", LIMITE_CONNEXION_EMAIL);
  const limiteConnexionIp = creerLimiteur("connexion-ip", LIMITE_CONNEXION_IP);

  routeur.post("/inscription", async (requete, reponse) => {
    if (!(await limiteInscription.autoriser(cleIp(requete.ip)))) throw erreurs.tropDeRequetes();

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

    // Les deux compteurs sont consultés avant de conclure, pour qu'une
    // tentative compte dans chacun — sinon l'évaluation court-circuitée
    // laisserait l'un des deux à la traîne.
    const passeIp = await limiteConnexionIp.autoriser(cleIp(requete.ip));
    const passeEmail = await limiteConnexionEmail.autoriser(cleEmail(analyse.data.email));
    if (!passeIp || !passeEmail) throw erreurs.tropDeRequetes();

    const { session, jeton } = await service.connecter(analyse.data, meta(requete));

    // Connexion réussie : on efface le compteur de l'E-MAIL. Sinon un
    // utilisateur qui se trompe neuf fois puis réussit resterait à un doigt du
    // blocage pendant un quart d'heure.
    //
    // Le compteur d'IP n'est PAS remis à zéro : sinon un attaquant balayant des
    // comptes lui appartenant se donnerait un quota infini.
    await limiteConnexionEmail.reinitialiser(cleEmail(analyse.data.email));

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
