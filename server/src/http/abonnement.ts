import type { RequestHandler } from "express";
import type { ServiceAuth } from "../modules/auth/service.js";
import { ErreurApi } from "./erreurs.js";
import { contexteDe, exigerSession } from "./session.js";

/**
 * Ferme l'application à une entreprise dont l'essai ou l'abonnement a expiré.
 *
 * À composer **après** `exigerSession`, sur les routeurs métier uniquement.
 * Restent volontairement ouverts, et c'est ce qui rend le blocage utilisable
 * plutôt que définitif :
 *
 * - `GET /api/moi` et `POST /api/deconnexion` — l'application doit pouvoir
 *   savoir qui est là et le laisser partir ;
 * - `/api/paiement/*` — sans quoi le client bloqué ne pourrait pas payer, et le
 *   blocage n'aurait aucune issue ;
 * - `/api/referentiels` — la page de paiement affiche une devise.
 *
 * Le décompte n'est pas refait ici : `contexte.entreprise.acces` a été calculé
 * à la résolution de la session, au même instant pour toute la requête. Deux
 * calculs à deux moments différents dans une même requête, c'est la garantie
 * qu'un jour ils divergeront.
 */
export function exigerAbonnementActif(): RequestHandler {
  return (requete, _reponse, suivant) => {
    const { acces } = contexteDe(requete).entreprise;

    if (!acces.bloque) {
      suivant();
      return;
    }

    suivant(
      new ErreurApi(
        402,
        "ABONNEMENT_EXPIRE",
        acces.motif === "ABONNEMENT_EXPIRE"
          ? "Votre abonnement est arrivé à échéance. Renouvelez-le pour retrouver l'accès."
          : "Votre essai gratuit de deux mois est terminé. Passez au plan Pro pour continuer.",
        {
          motif: acces.motif,
          essai_expire_le: acces.essai_expire_le,
          abonnement_expire_le: acces.abonnement_expire_le,
        },
      ),
    );
  };
}

/**
 * Session valide **et** abonnement en cours, en un seul intergiciel.
 *
 * Composé ici plutôt que passé en tableau à chaque route : un tableau fait
 * perdre à Express l'inférence des types de `requete` et `reponse`, et
 * `--noImplicitAny` transforme alors chaque poignée de route en erreur. Un
 * intergiciel unique garde le typage **et** dit ce qu'il fait.
 */
export function exigerSessionActive(service: ServiceAuth): RequestHandler {
  const session = exigerSession(service);
  const abonnement = exigerAbonnementActif();

  return (requete, reponse, suivant) => {
    session(requete, reponse, (erreur?: unknown) => {
      if (erreur !== undefined) {
        suivant(erreur);
        return;
      }
      abonnement(requete, reponse, suivant);
    });
  };
}
