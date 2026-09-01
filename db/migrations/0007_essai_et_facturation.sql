-- ===========================================================================
-- Bizly — 0007_essai_et_facturation
--
-- Essai gratuit de deux mois, puis abonnement Pro obligatoire (2 000 FCFA/mois,
-- payé par Wave, validé à la main depuis /admin/).
--
-- Trois ajouts :
--   1. `entreprises.essai_expire_le`    — fin de l'essai de deux mois
--   2. `entreprises.exempt_facturation` — comptes du propriétaire, jamais bloqués
--   3. `abonnements.reference_wave` + traçabilité de la validation admin
--
-- Idempotent : `ADD COLUMN IF NOT EXISTS` partout.
-- ===========================================================================

-- --------------------------------------------------------------- entreprises

ALTER TABLE entreprises
  ADD COLUMN IF NOT EXISTS essai_expire_le TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS exempt_facturation BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN entreprises.essai_expire_le IS
  'Fin de l''essai gratuit de deux mois. Passée cette date et sans abonnement '
  'valide, l''entreprise n''accède plus qu''à son écran de paiement.';

COMMENT ON COLUMN entreprises.exempt_facturation IS
  'true = jamais bloquée, quelle que soit la date. Réservé aux comptes du '
  'propriétaire de la plateforme. Se pose avec « npm run comptes -- exempter ».';

-- La valeur par défaut est posée par la BASE et non par le code applicatif :
-- une inscription qui oublierait de renseigner la colonne offrirait sinon un
-- accès illimité, silencieusement. Le défaut est le comportement sûr.
ALTER TABLE entreprises
  ALTER COLUMN essai_expire_le SET DEFAULT (now() + interval '2 months');

-- Comptes existants : deux mois à compter de leur création, pas de la
-- migration. Une entreprise inscrite il y a six semaines a déjà consommé six
-- semaines d'essai — lui en réoffrir deux mois récompenserait l'ancienneté.
UPDATE entreprises
   SET essai_expire_le = cree_le + interval '2 months'
 WHERE essai_expire_le IS NULL;

-- ---------------------------------------------------------------- abonnements

ALTER TABLE abonnements
  ADD COLUMN IF NOT EXISTS reference_wave TEXT,
  ADD COLUMN IF NOT EXISTS valide_par     UUID REFERENCES admins(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS valide_le      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS motif_refus    TEXT;

COMMENT ON COLUMN abonnements.reference_wave IS
  'Référence de transaction Wave saisie par le client après avoir payé. '
  'C''est la pièce que l''administrateur retrouve dans son historique Wave.';

COMMENT ON COLUMN abonnements.valide_par IS
  'Administrateur ayant validé le paiement. Le paiement est encaissé hors '
  'ligne : sans cette trace, une activation n''est imputable à personne.';

-- Sert l''écran « paiements en attente » de la console : la file est courte,
-- mais elle est consultée à chaque validation.
CREATE INDEX IF NOT EXISTS abonnements_en_attente_idx
  ON abonnements (statut, cree_le DESC)
  WHERE statut = 'en_attente';
