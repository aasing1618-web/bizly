-- ===========================================================================
-- Bizly — 0006_abonnements_paiements
--
-- Module d'abonnement et passerelle de paiement (Wave, Orange Money) :
--   1. `entreprises.date_expiration_plan` — Date limite d'expiration du plan actif
--   2. `abonnements` — Historique et statut des transactions d'abonnement
--
-- Idempotent : `ADD COLUMN IF NOT EXISTS` et `CREATE TABLE IF NOT EXISTS`.
-- ===========================================================================

ALTER TABLE entreprises
  ADD COLUMN IF NOT EXISTS date_expiration_plan TIMESTAMPTZ;

COMMENT ON COLUMN entreprises.date_expiration_plan IS
  'Date limite de validité du plan tarifaire actif (pro ou business). null pour plan free illimité.';

CREATE TABLE IF NOT EXISTS abonnements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
  plan TEXT NOT NULL CHECK (plan IN ('pro', 'business')),
  cycle TEXT NOT NULL CHECK (cycle IN ('mensuel', 'annuel')),
  montant INTEGER NOT NULL CHECK (montant > 0),
  devise TEXT NOT NULL DEFAULT 'XOF',
  moyen_paiement TEXT NOT NULL CHECK (moyen_paiement IN ('wave', 'orange_money', 'passerelle_mock', 'paytech', 'fedapay', 'cinetpay')),
  reference_transaction TEXT NOT NULL UNIQUE,
  statut TEXT NOT NULL CHECK (statut IN ('en_attente', 'valide', 'echoue')),
  cree_le TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expire_le TIMESTAMPTZ
);

COMMENT ON TABLE abonnements IS
  'Historique des abonnements et transactions avec passerelle Mobile Money (Wave, Orange Money).';

CREATE INDEX IF NOT EXISTS abonnements_entreprise_idx
  ON abonnements (entreprise_id, cree_le DESC);

CREATE INDEX IF NOT EXISTS abonnements_ref_idx
  ON abonnements (reference_transaction);
