-- ===========================================================================
-- Bizly — 0004_pays_plan_devises
--
-- Trois ajouts, tous exigés par CLAUDE.md :
--   1. `entreprises.pays`  — §4 du modèle de données (« country »)
--   2. `entreprises.plan`  — §4 et §12 : free | pro | business, changé À LA MAIN
--                            par l'admin (§7.4), aucun paiement en ligne au MVP
--   3. dix devises supplémentaires, pour que le choix de devise du §2
--      (« produit horizontal et international ») couvre réellement la cible
--
-- Idempotent : `ADD COLUMN IF NOT EXISTS` + `ON CONFLICT DO NOTHING`.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Pays de l'entreprise (ISO 3166-1 alpha-2)
--
-- NULL autorisé : les entreprises créées avant cette migration n'en ont pas, et
-- le pays ne conditionne aucun calcul. Il sert à pré-remplir devise et fuseau à
-- l'inscription, et à situer un compte dans la console d'administration.
-- ---------------------------------------------------------------------------
ALTER TABLE entreprises
  ADD COLUMN IF NOT EXISTS pays TEXT CHECK (pays ~ '^[A-Z]{2}$');

COMMENT ON COLUMN entreprises.pays IS
  'Code ISO 3166-1 alpha-2 en majuscules. Sert à pré-remplir la devise et le '
  'fuseau ; n''entre dans aucun calcul.';

-- ---------------------------------------------------------------------------
-- 2. Plan tarifaire
--
-- `NOT NULL DEFAULT 'free'` : toute entreprise existante bascule en free, ce
-- qui est exactement l'état de fait — personne ne paie, il n'y a pas de
-- paiement en ligne (CLAUDE.md §7.4).
-- ---------------------------------------------------------------------------
ALTER TABLE entreprises
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free', 'pro', 'business'));

COMMENT ON COLUMN entreprises.plan IS
  'Champ MANUEL au MVP : seul un administrateur le change (CLAUDE.md §7.4). '
  'Aucune logique de facturation ne s''y rattache.';

-- Liste d'administration : triée par date de création décroissante, filtrée
-- par statut ou par plan. Sans cet index, chaque ouverture de la console fait
-- un balayage complet de la table.
CREATE INDEX IF NOT EXISTS entreprises_admin_idx
  ON entreprises (cree_le DESC);

-- ---------------------------------------------------------------------------
-- 3. Devises supplémentaires
--
-- `decimales` reste LA donnée critique (cf. 0002) : le franc CFA, le franc
-- guinéen, le franc rwandais, le burundais, le djiboutien et le comorien n'ont
-- aucune subdivision. Une seule erreur ici décale tous les montants d'un
-- facteur 100.
-- ---------------------------------------------------------------------------
INSERT INTO devises (code, libelle, symbole, decimales) VALUES
  ('CDF', 'Franc congolais',   'FC',  2),
  ('GNF', 'Franc guinéen',     'FG',  0),
  ('RWF', 'Franc rwandais',    'FRw', 0),
  ('BIF', 'Franc burundais',   'FBu', 0),
  ('DJF', 'Franc djiboutien',  'Fdj', 0),
  ('KMF', 'Franc comorien',    'CF',  0),
  ('NGN', 'Naira nigérian',    '₦',   2),
  ('GHS', 'Cedi ghanéen',      '₵',   2),
  ('KES', 'Shilling kényan',   'KSh', 2),
  ('ZAR', 'Rand sud-africain', 'R',   2)
ON CONFLICT (code) DO NOTHING;
