import { randomBytes } from "node:crypto";
import {
  DUREE_ABONNEMENT_JOURS,
  NUMERO_WAVE,
  NUMERO_WAVE_AFFICHE,
  PRIX_PRO_MENSUEL_XOF,
  type PaiementAValider,
  type ReponseStatutAbonnement,
  type ReponseValidationPaiement,
} from "@bizly/shared";
import { prolongerAbonnement } from "../../domaine/abonnement.js";
import { ErreurApi, erreurs } from "../../http/erreurs.js";
import type { ContexteSession } from "../auth/service.js";
import { versPaiementDeclare, type DepotPaiement } from "./depot.js";

/**
 * Abonnement et paiement Wave.
 *
 * Le paiement est **encaissé hors ligne** : le client envoie 2 000 FCFA sur le
 * numéro Wave du propriétaire, déclare la référence de sa transaction, et un
 * administrateur valide. Il n'y a donc aucune passerelle à appeler, et surtout
 * aucune route publique capable d'activer un abonnement — la seule façon
 * d'ouvrir un accès payant est un clic authentifié dans la console.
 *
 * C'est un choix de conception, pas une simplification : une passerelle
 * automatique demande une vérification de signature, un compte marchand et un
 * traitement des remboursements. Tant que le volume est faible, la validation
 * à la main est plus sûre qu'un webhook mal vérifié.
 */

export type ServicePaiement = {
  statut(contexte: ContexteSession): Promise<ReponseStatutAbonnement>;
  declarer(contexte: ContexteSession, referenceWave: string): Promise<ReponseStatutAbonnement>;
  listerAValider(): Promise<PaiementAValider[]>;
  valider(paiementId: string, adminId: string): Promise<ReponseValidationPaiement>;
  refuser(paiementId: string, adminId: string, motif: string): Promise<void>;
};

export type DependancesServicePaiement = {
  depot: DepotPaiement;
  /** Lien Wave Business, s'il existe. Sinon le client voit le numéro. */
  lienWave: string | null;
  horloge?: () => Date;
};

/** Limite haute de l'historique renvoyé au client. */
const HISTORIQUE_MAX = 10;
/** Limite haute de la file d'attente admin. */
const A_VALIDER_MAX = 100;

/** Référence interne, sans rapport avec celle de Wave. */
function referenceInterne(): string {
  return `BIZ-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export function creerServicePaiement(deps: DependancesServicePaiement): ServicePaiement {
  const { depot, lienWave, horloge = () => new Date() } = deps;

  async function etat(contexte: ContexteSession): Promise<ReponseStatutAbonnement> {
    const entrepriseId = contexte.entreprise.id;
    const [enAttente, historique] = await Promise.all([
      depot.declarationEnAttente(entrepriseId),
      depot.historique(entrepriseId, HISTORIQUE_MAX),
    ]);

    return {
      acces: contexte.entreprise.acces,
      plan: contexte.entreprise.plan,
      prix_mensuel: PRIX_PRO_MENSUEL_XOF,
      devise: "XOF",
      numero_wave: NUMERO_WAVE,
      numero_wave_affiche: NUMERO_WAVE_AFFICHE,
      lien_wave: lienWave,
      en_attente: enAttente === null ? null : versPaiementDeclare(enAttente),
      historique: historique.map(versPaiementDeclare),
    };
  }

  return {
    statut: etat,

    async declarer(contexte, referenceWave) {
      const entrepriseId = contexte.entreprise.id;

      // Une seule déclaration ouverte à la fois : sans cette règle, un client
      // impatient en empile dix et la file de validation devient illisible.
      const dejaEnAttente = await depot.declarationEnAttente(entrepriseId);
      if (dejaEnAttente !== null) {
        throw erreurs.conflit(
          "Vous avez déjà un paiement en attente de validation. Nous le traitons au plus vite.",
        );
      }

      await depot.declarerPaiement({
        entrepriseId,
        montant: PRIX_PRO_MENSUEL_XOF,
        devise: "XOF",
        referenceTransaction: referenceInterne(),
        referenceWave,
      });

      return etat(contexte);
    },

    async listerAValider() {
      return depot.listerAValider(A_VALIDER_MAX);
    },

    async valider(paiementId, adminId) {
      const paiement = await depot.trouverParId(paiementId);
      if (paiement === null) throw erreurs.introuvable("Paiement");
      if (paiement.statut !== "en_attente") {
        throw erreurs.conflit(
          paiement.statut === "valide"
            ? "Ce paiement a déjà été validé."
            : "Ce paiement a été refusé. Le client doit en déclarer un nouveau.",
        );
      }

      const maintenant = horloge();
      const echeanceActuelle = await depot.echeanceEntreprise(paiement.entreprise_id);
      const nouvelleEcheance = prolongerAbonnement(
        echeanceActuelle,
        maintenant,
        DUREE_ABONNEMENT_JOURS,
      );

      const valide = await depot.validerEtActiver({ paiementId, adminId, nouvelleEcheance });
      if (valide === null) {
        // Perdu la course contre un autre administrateur : ce n'est pas une
        // erreur du système, c'est une double validation évitée.
        throw erreurs.conflit("Ce paiement vient d'être traité par un autre administrateur.");
      }

      return {
        entreprise_id: valide.entreprise_id,
        plan: "pro",
        abonnement_expire_le: nouvelleEcheance.toISOString(),
      };
    },

    async refuser(paiementId, adminId, motif) {
      const refuse = await depot.refuser(paiementId, adminId, motif);
      if (refuse === null) {
        throw new ErreurApi(
          409,
          "CONFLIT",
          "Ce paiement n'est plus en attente : il a déjà été validé ou refusé.",
        );
      }
    },
  };
}
