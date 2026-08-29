import {
  TARIFS_ABONNEMENT,
  type CorpsInitialiserPaiement,
  type CorpsWebhookPaiement,
  type ReponseInitialiserPaiement,
} from "@bizly/shared";
import type { DepotPaiement } from "./depot.js";
import { creerSessionPaiementWave } from "./wave.js";

export class ErreurPaiement extends Error {
  constructor(
    message: string,
    public readonly codeHttp: number = 400,
  ) {
    super(message);
    this.name = "ErreurPaiement";
  }
}

export type ServicePaiement = {
  initialiserPaiement(
    entrepriseId: string,
    corps: CorpsInitialiserPaiement,
  ): Promise<ReponseInitialiserPaiement>;
  traiterWebhook(corps: CorpsWebhookPaiement): Promise<{ succes: boolean; message: string }>;
  simulerConfirmation(
    entrepriseId: string,
    referenceTransaction: string,
  ): Promise<{ succes: boolean; message: string }>;
};

export function creerServicePaiement(depot: DepotPaiement): ServicePaiement {
  return {
    async initialiserPaiement(entrepriseId, corps) {
      const { plan, cycle, moyen_paiement } = corps;

      if (!["pro", "business"].includes(plan)) {
        throw new ErreurPaiement("Plan invalide. Choisissez 'pro' ou 'business'.", 400);
      }
      if (!["mensuel", "annuel"].includes(cycle)) {
        throw new ErreurPaiement("Cycle invalide. Choisissez 'mensuel' ou 'annuel'.", 400);
      }
      if (!["wave", "orange_money"].includes(moyen_paiement)) {
        throw new ErreurPaiement("Moyen de paiement non supporté. Choisissez Wave ou Orange Money.", 400);
      }

      const montant = TARIFS_ABONNEMENT[plan][cycle];
      const randStr = Math.random().toString(36).substring(2, 8).toUpperCase();
      const referenceTransaction = `BIZ-PAY-${Date.now()}-${randStr}`;

      const abo = await depot.creerAbonnement({
        entrepriseId,
        plan,
        cycle,
        montant,
        devise: "XOF",
        moyenPaiement: moyen_paiement,
        referenceTransaction,
      });

      let urlCheckout = `/checkout?ref=${abo.reference_transaction}&provider=${moyen_paiement}&amount=${montant}`;

      if (moyen_paiement === "wave" && process.env["WAVE_API_KEY"]) {
        try {
          const baseUrl = process.env["BIZLY_BASE_URL"] || "http://localhost:3000";
          const sessionWave = await creerSessionPaiementWave({
            montant,
            devise: "XOF",
            referenceTransaction: abo.reference_transaction,
            urlSucces: `${baseUrl}/app?paiement=succes&ref=${abo.reference_transaction}`,
            urlAnnulation: `${baseUrl}/app?paiement=annule&ref=${abo.reference_transaction}`,
          });
          urlCheckout = sessionWave.wave_launch_url;
        } catch (err) {
          console.warn("Wave API fallback:", err instanceof Error ? err.message : String(err));
        }
      }

      return {
        reference_transaction: abo.reference_transaction,
        montant: abo.montant,
        devise: abo.devise,
        plan: abo.plan,
        cycle: abo.cycle,
        moyen_paiement: abo.moyen_paiement,
        url_checkout: urlCheckout,
      };
    },

    async traiterWebhook(corps) {
      const { reference_transaction, statut } = corps;

      if (!reference_transaction) {
        throw new ErreurPaiement("Référence de transaction requise.", 400);
      }

      const abo = await depot.trouverAbonnementParRef(reference_transaction);
      if (!abo) {
        throw new ErreurPaiement("Transaction introuvable.", 404);
      }

      if (abo.statut === "valide") {
        return { succes: true, message: "Abonnement déjà validé." };
      }

      if (statut === "echoue") {
        await depot.marquerEchec(reference_transaction);
        return { succes: false, message: "Transaction marquée en échec." };
      }

      const jours = abo.cycle === "annuel" ? 365 : 30;
      const dateExpiration = new Date();
      dateExpiration.setDate(dateExpiration.getDate() + jours);

      await depot.validerAbonnementEtActiverPlan(reference_transaction, dateExpiration);

      return {
        succes: true,
        message: `Plan ${abo.plan.toUpperCase()} activé avec succès pour ${jours} jours.`,
      };
    },

    async simulerConfirmation(entrepriseId, referenceTransaction) {
      const abo = await depot.trouverAbonnementParRef(referenceTransaction);
      if (!abo) {
        throw new ErreurPaiement("Transaction introuvable.", 404);
      }
      if (abo.entreprise_id !== entrepriseId) {
        throw new ErreurPaiement("Transaction introuvable.", 404);
      }

      return this.traiterWebhook({
        reference_transaction: referenceTransaction,
        statut: "valide",
      });
    },
  };
}
