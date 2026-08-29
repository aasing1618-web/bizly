import type { AdminPublic } from "@bizly/shared";
import { DUREE_SESSION_ADMIN_S } from "../../http/cookies.js";
import { ErreurApi, erreurs } from "../../http/erreurs.js";
import { creerJetonSession, empreinteJeton, ressembleAUnJeton } from "../auth/jetons.js";
import {
  consommerTempsCommeSiCompteExistait,
  verifierMotDePasse,
} from "../auth/motDePasse.js";
import type { MetaRequete } from "../auth/service.js";
import type { DepotAdmin } from "./depot.js";

/**
 * Authentification de la console d'administration — docs/API-CONTRACT.md §9.1.
 *
 * Même mécanique que côté client (jeton de 256 bits, seule l'empreinte SHA-256
 * est stockée, réponse et temps de réponse identiques pour « e-mail inconnu »
 * et « mot de passe faux »), sur une **table et un cookie séparés**. On
 * réutilise les briques (`jetons`, `motDePasse`), jamais les données : c'est ce
 * qui garantit qu'un jeton client ne puisse pas ouvrir la console.
 */

export type ContexteAdmin = {
  admin: AdminPublic;
};

export type ResultatConnexionAdmin = {
  admin: AdminPublic;
  /** Jeton en clair, à poser dans le cookie. Ne jamais journaliser. */
  jeton: string;
};

export type ServiceAdmin = {
  connecter(
    entree: { email: string; mot_de_passe: string },
    meta: MetaRequete,
  ): Promise<ResultatConnexionAdmin>;
  deconnecter(jetonClair: string | null): Promise<void>;
  resoudre(jetonClair: string | null): Promise<ContexteAdmin | null>;
};

export type DependancesServiceAdmin = {
  depot: DepotAdmin;
  horloge?: () => Date;
};

export function creerServiceAdmin(deps: DependancesServiceAdmin): ServiceAdmin {
  const { depot, horloge = () => new Date() } = deps;

  return {
    async connecter(entree, meta) {
      const compte = await depot.trouverAdminParEmail(entree.email);

      if (compte === null) {
        await consommerTempsCommeSiCompteExistait(entree.mot_de_passe);
        throw identifiantsInvalides();
      }

      if (!(await verifierMotDePasse(entree.mot_de_passe, compte.mot_de_passe_hash))) {
        throw identifiantsInvalides();
      }

      // Le statut n'est lu qu'après le mot de passe, comme au §2 : l'annoncer
      // avant ferait de la réponse un révélateur d'existence de compte.
      if (compte.statut === "SUSPENDU") throw erreurs.compteSuspendu();

      const jeton = creerJetonSession();
      await depot.creerSession({
        admin_id: compte.admin.id,
        empreinte: jeton.empreinte,
        expire_le: new Date(horloge().getTime() + DUREE_SESSION_ADMIN_S * 1000),
        ip: meta.ip,
        user_agent: meta.user_agent,
      });
      await depot.marquerConnexion(compte.admin.id);

      return { admin: compte.admin, jeton: jeton.clair };
    },

    async deconnecter(jetonClair) {
      if (jetonClair === null || !ressembleAUnJeton(jetonClair)) return;
      await depot.revoquerSession(empreinteJeton(jetonClair));
    },

    async resoudre(jetonClair) {
      if (jetonClair === null || !ressembleAUnJeton(jetonClair)) return null;

      const session = await depot.resoudreSession(empreinteJeton(jetonClair));
      if (session === null) return null;
      if (session.statut === "SUSPENDU") throw erreurs.compteSuspendu();

      // Pas de prolongation glissante : une session d'administration dure
      // 12 heures fermes, puis on se reconnecte. Un accès qui voit tous les
      // comptes ne doit pas pouvoir rester ouvert indéfiniment par simple
      // activité.
      return { admin: session.admin };
    },
  };
}

function identifiantsInvalides(): ErreurApi {
  return new ErreurApi(
    401,
    "IDENTIFIANTS_INVALIDES",
    "Adresse e-mail ou mot de passe incorrect.",
  );
}
