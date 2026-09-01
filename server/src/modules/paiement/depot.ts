import type { Pool } from "pg";
import type { PaiementAValider, PaiementDeclare, StatutPaiement } from "@bizly/shared";
import { dansTransaction } from "../../db/transaction.js";

/**
 * Accès aux données d'abonnement et de paiement.
 *
 * Le paiement est encaissé **hors ligne**, sur Wave : cette table n'est pas une
 * passerelle, c'est un registre. Elle enregistre ce que le client déclare avoir
 * payé et ce que l'administrateur a validé — deux gestes distincts, deux traces
 * distinctes.
 */

export type LigneAbonnement = {
  id: string;
  entreprise_id: string;
  plan: "pro" | "business";
  cycle: "mensuel" | "annuel";
  montant: number;
  devise: string;
  moyen_paiement: string;
  reference_transaction: string;
  reference_wave: string | null;
  statut: StatutPaiement;
  cree_le: Date;
  expire_le: Date | null;
  valide_le: Date | null;
  motif_refus: string | null;
};

export type DepotPaiement = {
  /** Déclaration d'un paiement Wave par le client. Statut `en_attente`. */
  declarerPaiement(entree: {
    entrepriseId: string;
    montant: number;
    devise: string;
    referenceTransaction: string;
    referenceWave: string;
  }): Promise<LigneAbonnement>;

  /** La déclaration encore en attente de cette entreprise, s'il y en a une. */
  declarationEnAttente(entrepriseId: string): Promise<LigneAbonnement | null>;

  historique(entrepriseId: string, limite: number): Promise<LigneAbonnement[]>;

  /** Fin d'abonnement actuellement enregistrée sur l'entreprise. */
  echeanceEntreprise(entrepriseId: string): Promise<Date | null>;

  /** Toutes les déclarations en attente, toutes entreprises confondues. */
  listerAValider(limite: number): Promise<PaiementAValider[]>;

  trouverParId(id: string): Promise<LigneAbonnement | null>;

  /**
   * Valide un paiement ET ouvre l'accès, en une transaction.
   *
   * Les deux écritures sont indissociables : un paiement validé sans plan
   * activé laisse un client bloqué qui a payé — le pire des deux mondes.
   */
  validerEtActiver(entree: {
    paiementId: string;
    adminId: string;
    nouvelleEcheance: Date;
  }): Promise<LigneAbonnement | null>;

  refuser(paiementId: string, adminId: string, motif: string): Promise<LigneAbonnement | null>;
};

const COLONNES = `
  id, entreprise_id, plan, cycle, montant, devise, moyen_paiement,
  reference_transaction, reference_wave, statut, cree_le, expire_le,
  valide_le, motif_refus
`;

export function creerDepotPaiement(pool: Pool): DepotPaiement {
  return {
    async declarerPaiement(entree) {
      const res = await pool.query<LigneAbonnement>(
        `INSERT INTO abonnements
           (entreprise_id, plan, cycle, montant, devise, moyen_paiement,
            reference_transaction, reference_wave, statut)
         VALUES ($1, 'pro', 'mensuel', $2, $3, 'wave', $4, $5, 'en_attente')
         RETURNING ${COLONNES}`,
        [
          entree.entrepriseId,
          entree.montant,
          entree.devise,
          entree.referenceTransaction,
          entree.referenceWave,
        ],
      );
      return res.rows[0]!;
    },

    async declarationEnAttente(entrepriseId) {
      const res = await pool.query<LigneAbonnement>(
        `SELECT ${COLONNES} FROM abonnements
          WHERE entreprise_id = $1 AND statut = 'en_attente'
          ORDER BY cree_le DESC LIMIT 1`,
        [entrepriseId],
      );
      return res.rows[0] ?? null;
    },

    async historique(entrepriseId, limite) {
      const res = await pool.query<LigneAbonnement>(
        `SELECT ${COLONNES} FROM abonnements
          WHERE entreprise_id = $1
          ORDER BY cree_le DESC LIMIT $2`,
        [entrepriseId, limite],
      );
      return res.rows;
    },

    async echeanceEntreprise(entrepriseId) {
      const res = await pool.query<{ date_expiration_plan: Date | null }>(
        `SELECT date_expiration_plan FROM entreprises WHERE id = $1`,
        [entrepriseId],
      );
      return res.rows[0]?.date_expiration_plan ?? null;
    },

    async listerAValider(limite) {
      const res = await pool.query<{
        id: string;
        entreprise_id: string;
        entreprise_nom: string;
        proprietaire_email: string | null;
        reference_transaction: string;
        reference_wave: string | null;
        montant: number;
        devise: string;
        cree_le: Date;
      }>(
        `SELECT a.id, a.entreprise_id, e.nom AS entreprise_nom,
                p.email AS proprietaire_email,
                a.reference_transaction, a.reference_wave,
                a.montant, a.devise, a.cree_le
           FROM abonnements a
           JOIN entreprises e ON e.id = a.entreprise_id
           LEFT JOIN LATERAL (
             SELECT u.email FROM utilisateurs u
              WHERE u.entreprise_id = e.id AND u.role = 'PROPRIETAIRE'
              ORDER BY u.cree_le LIMIT 1
           ) p ON true
          WHERE a.statut = 'en_attente'
          ORDER BY a.cree_le
          LIMIT $1`,
        [limite],
      );

      return res.rows.map((l) => ({
        id: l.id,
        entreprise_id: l.entreprise_id,
        entreprise_nom: l.entreprise_nom,
        proprietaire_email: l.proprietaire_email,
        reference_transaction: l.reference_transaction,
        reference_wave: l.reference_wave,
        montant: l.montant,
        devise: l.devise,
        cree_le: l.cree_le.toISOString(),
      }));
    },

    async trouverParId(id) {
      const res = await pool.query<LigneAbonnement>(
        `SELECT ${COLONNES} FROM abonnements WHERE id = $1`,
        [id],
      );
      return res.rows[0] ?? null;
    },

    async validerEtActiver({ paiementId, adminId, nouvelleEcheance }) {
      return dansTransaction(pool, async (client) => {
        // `statut = 'en_attente'` dans le WHERE : deux administrateurs qui
        // cliquent en même temps ne créditent pas deux mois.
        const res = await client.query<LigneAbonnement>(
          `UPDATE abonnements
              SET statut = 'valide', valide_le = now(), valide_par = $2, expire_le = $3
            WHERE id = $1 AND statut = 'en_attente'
            RETURNING ${COLONNES}`,
          [paiementId, adminId, nouvelleEcheance],
        );

        const ligne = res.rows[0];
        if (ligne === undefined) return null;

        await client.query(
          `UPDATE entreprises
              SET plan = 'pro', date_expiration_plan = $2
            WHERE id = $1`,
          [ligne.entreprise_id, nouvelleEcheance],
        );

        return ligne;
      });
    },

    async refuser(paiementId, adminId, motif) {
      const res = await pool.query<LigneAbonnement>(
        `UPDATE abonnements
            SET statut = 'echoue', valide_le = now(), valide_par = $2, motif_refus = $3
          WHERE id = $1 AND statut = 'en_attente'
          RETURNING ${COLONNES}`,
        [paiementId, adminId, motif],
      );
      return res.rows[0] ?? null;
    },
  };
}

/** Projection vers la forme exposée au client. Aucune trace d'administrateur. */
export function versPaiementDeclare(ligne: LigneAbonnement): PaiementDeclare {
  return {
    id: ligne.id,
    reference_transaction: ligne.reference_transaction,
    reference_wave: ligne.reference_wave,
    montant: ligne.montant,
    devise: ligne.devise,
    statut: ligne.statut,
    cree_le: ligne.cree_le.toISOString(),
    valide_le: ligne.valide_le === null ? null : ligne.valide_le.toISOString(),
    motif_refus: ligne.motif_refus,
  };
}
