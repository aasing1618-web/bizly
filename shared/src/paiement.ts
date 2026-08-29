import type { Plan } from "./auth.js";

export type MoyenPaiementAbonnement = "wave" | "orange_money";
export type CycleAbonnement = "mensuel" | "annuel";
export type PlanPayant = "pro" | "business";

export type TarifsPaiement = {
  pro: {
    mensuel: number; // 2 500 FCFA
    annuel: number;  // 25 000 FCFA
  };
  business: {
    mensuel: number; // 5 000 FCFA
    annuel: number;  // 50 000 FCFA
  };
};

export const TARIFS_ABONNEMENT: TarifsPaiement = {
  pro: {
    mensuel: 2500,
    annuel: 25000,
  },
  business: {
    mensuel: 5000,
    annuel: 50000,
  },
};

export type CorpsInitialiserPaiement = {
  plan: PlanPayant;
  cycle: CycleAbonnement;
  moyen_paiement: MoyenPaiementAbonnement;
};

export type ReponseInitialiserPaiement = {
  reference_transaction: string;
  montant: number;
  devise: string;
  plan: PlanPayant;
  cycle: CycleAbonnement;
  moyen_paiement: MoyenPaiementAbonnement;
  url_checkout: string;
};

export type CorpsWebhookPaiement = {
  reference_transaction: string;
  statut: "valide" | "echoue";
  secret_signature?: string;
};

export type DetailAbonnementActif = {
  plan: Plan;
  statut_entreprise: string;
  date_expiration: string | null;
  est_expire: boolean;
  est_payant: boolean;
};
