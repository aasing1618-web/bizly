import type { Pool } from "pg";
import type {
  CycleAbonnement,
  MoyenPaiementAbonnement,
  PlanPayant,
} from "@bizly/shared";

export type DonneesCreationAbonnement = {
  entrepriseId: string;
  plan: PlanPayant;
  cycle: CycleAbonnement;
  montant: number;
  devise: string;
  moyenPaiement: MoyenPaiementAbonnement;
  referenceTransaction: string;
};

export type LigneAbonnement = {
  id: string;
  entreprise_id: string;
  plan: PlanPayant;
  cycle: CycleAbonnement;
  montant: number;
  devise: string;
  moyen_paiement: MoyenPaiementAbonnement;
  reference_transaction: string;
  statut: "en_attente" | "valide" | "echoue";
  cree_le: string;
  expire_le: string | null;
};

export type DepotPaiement = {
  creerAbonnement(donnees: DonneesCreationAbonnement): Promise<LigneAbonnement>;
  trouverAbonnementParRef(referenceTransaction: string): Promise<LigneAbonnement | null>;
  validerAbonnementEtActiverPlan(
    referenceTransaction: string,
    dateExpiration: Date,
  ): Promise<LigneAbonnement | null>;
  marquerEchec(referenceTransaction: string): Promise<void>;
  lireAbonnementActif(entrepriseId: string): Promise<LigneAbonnement | null>;
};

export function creerDepotPaiement(pool: Pool): DepotPaiement {
  return {
    async creerAbonnement(d) {
      const res = await pool.query<LigneAbonnement>(
        `INSERT INTO abonnements (entreprise_id, plan, cycle, montant, devise, moyen_paiement, reference_transaction, statut)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'en_attente')
         RETURNING *`,
        [d.entrepriseId, d.plan, d.cycle, d.montant, d.devise, d.moyenPaiement, d.referenceTransaction],
      );
      return res.rows[0]!;
    },

    async trouverAbonnementParRef(ref) {
      const res = await pool.query<LigneAbonnement>(
        `SELECT * FROM abonnements WHERE reference_transaction = $1`,
        [ref],
      );
      return res.rows[0] ?? null;
    },

    async validerAbonnementEtActiverPlan(ref, dateExpiration) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const resAb = await client.query<LigneAbonnement>(
          `UPDATE abonnements
              SET statut = 'valide', expire_le = $2
            WHERE reference_transaction = $1
            RETURNING *`,
          [ref, dateExpiration],
        );

        const ab = resAb.rows[0];
        if (ab) {
          await client.query(
            `UPDATE entreprises
                SET plan = $2, date_expiration_plan = $3
              WHERE id = $1`,
            [ab.entreprise_id, ab.plan, dateExpiration],
          );
        }

        await client.query("COMMIT");
        return ab ?? null;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    },

    async marquerEchec(ref) {
      await pool.query(
        `UPDATE abonnements SET statut = 'echoue' WHERE reference_transaction = $1`,
        [ref],
      );
    },

    async lireAbonnementActif(entrepriseId) {
      const res = await pool.query<LigneAbonnement>(
        `SELECT * FROM abonnements
          WHERE entreprise_id = $1 AND statut = 'valide'
          ORDER BY cree_le DESC LIMIT 1`,
        [entrepriseId],
      );
      return res.rows[0] ?? null;
    },
  };
}
