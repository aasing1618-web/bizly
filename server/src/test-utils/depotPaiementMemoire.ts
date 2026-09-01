import { randomUUID } from "node:crypto";
import type { PaiementAValider } from "@bizly/shared";
import type { DepotPaiement, LigneAbonnement } from "../modules/paiement/depot.js";
import type { DepotMemoire } from "./depotMemoire.js";

/**
 * Registre des paiements, en mémoire — **usage tests uniquement**.
 *
 * Partage le dépôt d'authentification quand on le lui donne : valider un
 * paiement doit ouvrir l'accès de l'entreprise **là-bas**, sinon le test le
 * plus important du module — « un paiement validé débloque le client » —
 * vérifierait deux copies indépendantes l'une de l'autre.
 */
export function creerDepotPaiementMemoire(auth?: DepotMemoire): DepotPaiement {
  const abonnements: LigneAbonnement[] = [];
  const echeances = new Map<string, Date>();

  return {
    async declarerPaiement(d) {
      const ligne: LigneAbonnement = {
        id: randomUUID(),
        entreprise_id: d.entrepriseId,
        plan: "pro",
        cycle: "mensuel",
        montant: d.montant,
        devise: d.devise,
        moyen_paiement: "wave",
        reference_transaction: d.referenceTransaction,
        reference_wave: d.referenceWave,
        statut: "en_attente",
        cree_le: new Date(),
        expire_le: null,
        valide_le: null,
        motif_refus: null,
      };
      abonnements.push(ligne);
      return ligne;
    },

    async declarationEnAttente(entrepriseId) {
      return (
        [...abonnements]
          .reverse()
          .find((a) => a.entreprise_id === entrepriseId && a.statut === "en_attente") ?? null
      );
    },

    async historique(entrepriseId, limite) {
      return [...abonnements]
        .filter((a) => a.entreprise_id === entrepriseId)
        .reverse()
        .slice(0, limite);
    },

    async echeanceEntreprise(entrepriseId) {
      return echeances.get(entrepriseId) ?? null;
    },

    async listerAValider(limite) {
      return abonnements
        .filter((a) => a.statut === "en_attente")
        .slice(0, limite)
        .map(
          (a): PaiementAValider => ({
            id: a.id,
            entreprise_id: a.entreprise_id,
            entreprise_nom: `Entreprise ${a.entreprise_id.slice(0, 6)}`,
            proprietaire_email: null,
            reference_transaction: a.reference_transaction,
            reference_wave: a.reference_wave,
            montant: a.montant,
            devise: a.devise,
            cree_le: a.cree_le.toISOString(),
          }),
        );
    },

    async trouverParId(id) {
      return abonnements.find((a) => a.id === id) ?? null;
    },

    async validerEtActiver({ paiementId, nouvelleEcheance }) {
      const ligne = abonnements.find((a) => a.id === paiementId);
      if (ligne === undefined || ligne.statut !== "en_attente") return null;

      ligne.statut = "valide";
      ligne.valide_le = new Date();
      ligne.expire_le = nouvelleEcheance;
      echeances.set(ligne.entreprise_id, nouvelleEcheance);

      // L'entreprise passe réellement au plan Pro dans le dépôt partagé : sans
      // cela, un test pourrait « valider » un paiement et voir le client
      // toujours bloqué, sans que rien ne le signale.
      auth?.definirAbonnement?.(ligne.entreprise_id, nouvelleEcheance);

      return ligne;
    },

    async refuser(paiementId, _adminId, motif) {
      const ligne = abonnements.find((a) => a.id === paiementId);
      if (ligne === undefined || ligne.statut !== "en_attente") return null;

      ligne.statut = "echoue";
      ligne.valide_le = new Date();
      ligne.motif_refus = motif;
      return ligne;
    },
  };
}
