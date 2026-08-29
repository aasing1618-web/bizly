import {
  paysParCode,
  type EntreprisePublique,
  type ReponseSession,
  type UtilisateurPublic,
} from "@bizly/shared";
import { ErreurApi, erreurs } from "../../http/erreurs.js";
import { DUREE_SESSION_S } from "../../http/cookies.js";
import { EmailDejaPris, type DepotAuth } from "./depot.js";
import { creerJetonSession, empreinteJeton, ressembleAUnJeton } from "./jetons.js";
import {
  consommerTempsCommeSiCompteExistait,
  hacherMotDePasse,
  verifierMotDePasse,
} from "./motDePasse.js";
import type { EntreeConnexionValidee, EntreeInscriptionValidee } from "./validation.js";

/**
 * Logique d'authentification.
 *
 * Le dépôt est injecté : toute cette logique se teste avec une implémentation
 * en mémoire, sans Postgres — y compris les cas qu'une vraie base rend
 * pénibles à provoquer (compte suspendu, session expirée, e-mail déjà pris).
 *
 * Ce service lève directement des `ErreurApi`. Choix assumé : l'API est son
 * unique consommateur, et faire transiter une taxonomie d'erreurs métier
 * jusqu'aux routes pour la retraduire ensuite n'ajouterait qu'une couche.
 */

export type MetaRequete = {
  ip: string | null;
  user_agent: string | null;
};

export type ContexteSession = {
  utilisateur: UtilisateurPublic;
  entreprise: EntreprisePublique;
};

export type ResultatConnexion = {
  session: ReponseSession;
  /** Jeton en clair, à poser dans le cookie. Ne jamais journaliser. */
  jeton: string;
};

export type ServiceAuth = {
  inscrire(entree: EntreeInscriptionValidee, meta: MetaRequete): Promise<ResultatConnexion>;
  connecter(entree: EntreeConnexionValidee, meta: MetaRequete): Promise<ResultatConnexion>;
  deconnecter(jetonClair: string | null): Promise<void>;
  resoudre(jetonClair: string | null): Promise<ContexteSession | null>;
};

export type DependancesServiceAuth = {
  depot: DepotAuth;
  /** Horloge injectable : les tests d'expiration ne doivent pas attendre 30 jours. */
  horloge?: () => Date;
};

const DEVISE_PAR_DEFAUT = "EUR";
const FUSEAU_PAR_DEFAUT = "Europe/Paris";

/**
 * Au-delà de ce délai depuis la dernière activité, la session est prolongée.
 *
 * Prolonger à *chaque* requête écrirait en base à chaque appel d'API, pour ne
 * gagner que quelques heures de durée de vie.
 */
const SEUIL_PROLONGATION_MS = 24 * 60 * 60 * 1000;

export function creerServiceAuth(deps: DependancesServiceAuth): ServiceAuth {
  const { depot, horloge = () => new Date() } = deps;

  function finDeSession(): Date {
    return new Date(horloge().getTime() + DUREE_SESSION_S * 1000);
  }

  async function ouvrirSession(
    utilisateurId: string,
    meta: MetaRequete,
  ): Promise<string> {
    const jeton = creerJetonSession();
    await depot.creerSession({
      utilisateur_id: utilisateurId,
      empreinte: jeton.empreinte,
      expire_le: finDeSession(),
      ip: meta.ip,
      user_agent: meta.user_agent,
    });
    return jeton.clair;
  }

  return {
    async inscrire(entree, meta) {
      const secteur = entree.entreprise.secteur;
      if (!(await depot.secteurExiste(secteur))) {
        throw erreurs.validation("Ce secteur d'activité n'existe pas.", {
          champs: [{ champ: "entreprise.secteur", message: "Secteur inconnu." }],
        });
      }

      // Le pays ne contraint rien : il **remplit** la devise et le fuseau quand
      // l'utilisateur ne les précise pas. Un code inconnu est refusé plutôt
      // qu'ignoré — l'ignorer donnerait silencieusement une devise que
      // l'utilisateur n'a pas choisie (docs/API-CONTRACT.md §7.2).
      let pays = null;
      if (entree.entreprise.pays !== undefined) {
        pays = paysParCode(entree.entreprise.pays);
        if (pays === null) {
          throw erreurs.validation("Ce pays n'est pas pris en charge.", {
            champs: [{ champ: "entreprise.pays", message: "Pays inconnu." }],
          });
        }
      }

      const devise = entree.entreprise.devise ?? pays?.devise ?? DEVISE_PAR_DEFAUT;
      if (!(await depot.deviseExiste(devise))) {
        throw erreurs.validation("Cette devise n'est pas prise en charge.", {
          champs: [{ champ: "entreprise.devise", message: "Devise inconnue." }],
        });
      }

      const mot_de_passe_hash = await hacherMotDePasse(entree.utilisateur.mot_de_passe);

      let session: ReponseSession;
      try {
        session = await depot.creerCompte({
          entreprise: {
            nom: entree.entreprise.nom,
            secteur,
            pays: pays?.code ?? null,
            devise,
            fuseau: entree.entreprise.fuseau ?? pays?.fuseau ?? FUSEAU_PAR_DEFAUT,
          },
          utilisateur: {
            nom: entree.utilisateur.nom,
            email: entree.utilisateur.email,
            mot_de_passe_hash,
          },
        });
      } catch (cause) {
        if (cause instanceof EmailDejaPris) {
          throw erreurs.conflit("Un compte existe déjà avec cette adresse e-mail.", {
            champs: [{ champ: "utilisateur.email", message: "Adresse déjà utilisée." }],
          });
        }
        throw cause;
      }

      const jeton = await ouvrirSession(session.utilisateur.id, meta);
      return { session, jeton };
    },

    async connecter(entree, meta) {
      const compte = await depot.trouverCompteParEmail(entree.email);

      if (compte === null) {
        // Même coût en temps que pour un compte existant : sans cela, la
        // durée de la réponse révèle quels e-mails sont clients.
        await consommerTempsCommeSiCompteExistait(entree.mot_de_passe);
        throw identifiantsInvalides();
      }

      const motDePasseValide = await verifierMotDePasse(
        entree.mot_de_passe,
        compte.mot_de_passe_hash,
      );
      if (!motDePasseValide) throw identifiantsInvalides();

      // Le statut n'est vérifié qu'APRÈS le mot de passe : l'annoncer avant
      // ferait de la réponse un révélateur d'existence de compte.
      if (compte.entreprise.statut === "SUSPENDU" || compte.statut_utilisateur === "SUSPENDU") {
        throw erreurs.compteSuspendu();
      }

      const jeton = await ouvrirSession(compte.utilisateur.id, meta);
      await depot.marquerConnexion(compte.utilisateur.id);

      return {
        session: { utilisateur: compte.utilisateur, entreprise: compte.entreprise },
        jeton,
      };
    },

    async deconnecter(jetonClair) {
      if (jetonClair === null || !ressembleAUnJeton(jetonClair)) return;
      await depot.revoquerSession(empreinteJeton(jetonClair));
    },

    async resoudre(jetonClair) {
      if (jetonClair === null || !ressembleAUnJeton(jetonClair)) return null;

      const session = await depot.resoudreSession(empreinteJeton(jetonClair));
      if (session === null) return null;

      // Un compte suspendu pendant qu'une session est ouverte doit perdre
      // l'accès immédiatement, sans attendre l'expiration du cookie.
      if (session.entreprise.statut === "SUSPENDU" || session.statut_utilisateur === "SUSPENDU") {
        throw erreurs.compteSuspendu();
      }

      const maintenant = horloge().getTime();
      if (maintenant - session.derniere_activite_le.getTime() > SEUIL_PROLONGATION_MS) {
        await depot.prolongerSession(session.session_id, finDeSession());
      }

      return { utilisateur: session.utilisateur, entreprise: session.entreprise };
    },
  };
}

/**
 * Message unique pour « e-mail inconnu » et « mot de passe faux ».
 *
 * Distinguer les deux transformerait la route de connexion en oracle
 * d'énumération des clients (docs/API-CONTRACT.md §2).
 */
function identifiantsInvalides(): ErreurApi {
  return new ErreurApi(
    401,
    "IDENTIFIANTS_INVALIDES",
    "Adresse e-mail ou mot de passe incorrect.",
  );
}
