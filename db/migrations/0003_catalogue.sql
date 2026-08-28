-- ===========================================================================
-- Bizly — 0003_catalogue
--
-- Catalogue de produits, et rattachement des lignes de vente à ce catalogue.
--
-- Ce que cette migration débloque (docs/ECARTS-SPEC.md §1) : la marge, le
-- produit le plus rentable, et le chiffre d'affaires par catégorie de produit.
-- Sans un coût en base, aucune de ces trois questions n'a de réponse possible.
--
-- La table `clients` existe déjà depuis 0001_init : rien à ajouter pour elle,
-- seulement des écrans et des routes.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS produits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
  nom           TEXT NOT NULL CHECK (length(btrim(nom)) BETWEEN 1 AND 160),
  categorie     TEXT CHECK (categorie IS NULL OR length(btrim(categorie)) BETWEEN 1 AND 80),
  prix_mineur   BIGINT NOT NULL CHECK (prix_mineur >= 0),
  cout_mineur   BIGINT CHECK (cout_mineur IS NULL OR cout_mineur >= 0),
  cree_le       TIMESTAMPTZ NOT NULL DEFAULT now(),
  modifie_le    TIMESTAMPTZ NOT NULL DEFAULT now(),
  supprime_le   TIMESTAMPTZ,

  -- Cible des clés étrangères composites : une ligne de vente ne pourra pas
  -- désigner le produit d'une AUTRE entreprise.
  CONSTRAINT produits_id_entreprise_unique UNIQUE (id, entreprise_id)
);

COMMENT ON COLUMN produits.cout_mineur IS
  'Coût de revient, en unité mineure. NULL signifie « non renseigné », et ce '
  'null est SIGNIFIANT : le produit est alors exclu de tout classement de '
  'rentabilité. Lui donner 0 par défaut inventerait une marge de 100 %.';

COMMENT ON COLUMN produits.prix_mineur IS
  'Prix de vente du catalogue. Le prix réellement pratiqué est figé sur la '
  'ligne de vente : une remise ne modifie pas le catalogue.';

-- Unicité du nom par entreprise, insensible à la casse, sur les produits
-- vivants. Sans elle, deux fiches « T-shirt » scinderaient les classements en
-- deux et fausseraient toutes les réponses par produit.
CREATE UNIQUE INDEX IF NOT EXISTS produits_nom_unique
  ON produits (entreprise_id, lower(btrim(nom)))
  WHERE supprime_le IS NULL;

CREATE INDEX IF NOT EXISTS produits_entreprise_idx
  ON produits (entreprise_id) WHERE supprime_le IS NULL;

CREATE INDEX IF NOT EXISTS produits_categorie_idx
  ON produits (entreprise_id, categorie) WHERE supprime_le IS NULL;

CREATE OR REPLACE TRIGGER trg_produits_modifie_le
  BEFORE UPDATE ON produits
  FOR EACH ROW EXECUTE FUNCTION bizly_touch_modifie_le();

-- ---------------------------------------------------------------------------
-- Rattachement des lignes de vente au catalogue
--
-- FACULTATIF : une ligne peut rester du texte libre (article hors catalogue,
-- prestation ponctuelle). Ces lignes comptent dans le chiffre d'affaires mais
-- jamais dans un classement par produit — voir docs/API-CONTRACT.md §5.1.
--
-- `libelle` est CONSERVÉ à côté de `produit_id` : c'est une photographie du nom
-- au moment de la vente. Renommer un produit ne doit pas réécrire l'historique.
-- ---------------------------------------------------------------------------

ALTER TABLE lignes_vente ADD COLUMN IF NOT EXISTS produit_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lignes_vente_produit_meme_entreprise'
  ) THEN
    ALTER TABLE lignes_vente
      ADD CONSTRAINT lignes_vente_produit_meme_entreprise
      FOREIGN KEY (produit_id, entreprise_id)
      REFERENCES produits (id, entreprise_id) ON DELETE NO ACTION;
  END IF;
END;
$$;

-- Index de travail des classements par produit : exactement le regroupement
-- que le moteur de KPI effectue.
CREATE INDEX IF NOT EXISTS lignes_vente_produit_idx
  ON lignes_vente (entreprise_id, produit_id) WHERE produit_id IS NOT NULL;

COMMENT ON COLUMN lignes_vente.produit_id IS
  'Facultatif. Sert aux REGROUPEMENTS (quel produit se vend le plus) ; le '
  'libelle sert à l''affichage de l''historique. Les deux sont nécessaires.';
