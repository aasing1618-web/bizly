-- ===========================================================================
-- Bizly — 0001_init
-- Schéma de base : référentiels, tenants, comptes, sessions, ventes, dépenses.
--
-- Conventions (voir CLAUDE.md §4 et docs/MOTEUR-ANALYTICS.md) :
--   * identifiants           : uuid généré par la base
--   * argent                 : BIGINT en UNITÉ MINEURE — suffixe `_mineur`
--   * temps                  : timestamptz, UTC ; le fuseau vit sur l'entreprise
--   * énumérations           : TEXT + CHECK (et non type ENUM) — voir note ci-dessous
--   * suppression            : soft delete via `supprime_le`
--   * isolation multi-tenant : `entreprise_id` sur toute table métier,
--                              + clés étrangères COMPOSITES pour rendre une fuite
--                              inter-entreprises impossible au niveau base
--
-- Pourquoi TEXT + CHECK plutôt que des types ENUM : ajouter une valeur à un ENUM
-- Postgres est une opération lourde et mal supportée par les migrations
-- transactionnelles. Un CHECK se remplace par un simple ALTER ... DROP/ADD
-- CONSTRAINT dans la même transaction.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Fonctions utilitaires
-- ---------------------------------------------------------------------------

-- Tient `modifie_le` à jour sans que l'application ait à y penser.
CREATE OR REPLACE FUNCTION bizly_touch_modifie_le() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.modifie_le := now();
  RETURN NEW;
END;
$$;

-- Refuse un fuseau horaire inconnu de Postgres. Un fuseau invalide fausserait
-- silencieusement TOUTES les bornes de période, donc tous les KPI.
CREATE OR REPLACE FUNCTION bizly_valider_fuseau() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM pg_timezone_names WHERE name = NEW.fuseau;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fuseau horaire inconnu: %', NEW.fuseau
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Référentiels globaux (non rattachés à une entreprise)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS devises (
  code       TEXT PRIMARY KEY CHECK (code ~ '^[A-Z]{3}$'),
  libelle    TEXT     NOT NULL,
  symbole    TEXT     NOT NULL,
  decimales  SMALLINT NOT NULL CHECK (decimales BETWEEN 0 AND 4)
);

COMMENT ON COLUMN devises.decimales IS
  'Exposant de l''unité mineure : 2 pour EUR (centimes), 0 pour XOF, 3 pour TND. '
  'Le code ne doit JAMAIS supposer 2.';

CREATE TABLE IF NOT EXISTS secteurs (
  code     TEXT PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  libelle  TEXT     NOT NULL,
  ordre    SMALLINT NOT NULL DEFAULT 100
);

COMMENT ON TABLE secteurs IS
  'Secteur d''activité de l''entreprise. Détermine quelles règles du moteur de '
  'questions intelligentes s''appliquent (CLAUDE.md §6).';

-- Catégories de dépense proposées à la création d'une entreprise. Elles sont
-- COPIÉES dans `categories_depense`, jamais partagées : l'isolation stricte
-- interdit qu'une ligne métier n'appartienne à personne.
CREATE TABLE IF NOT EXISTS modeles_categorie_depense (
  code     TEXT PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  libelle  TEXT     NOT NULL,
  secteurs TEXT[]   NOT NULL DEFAULT '{}',  -- vide = tous secteurs
  ordre    SMALLINT NOT NULL DEFAULT 100
);

-- ---------------------------------------------------------------------------
-- Entreprises (tenants)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS entreprises (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom                TEXT NOT NULL CHECK (length(btrim(nom)) BETWEEN 1 AND 120),
  secteur_code       TEXT NOT NULL REFERENCES secteurs(code),
  devise             TEXT NOT NULL DEFAULT 'EUR' REFERENCES devises(code),
  fuseau             TEXT NOT NULL DEFAULT 'Europe/Paris',
  statut             TEXT NOT NULL DEFAULT 'ACTIF'
                       CHECK (statut IN ('ACTIF', 'SUSPENDU')),
  motif_suspension   TEXT,
  suspendue_le       TIMESTAMPTZ,
  cree_le            TIMESTAMPTZ NOT NULL DEFAULT now(),
  modifie_le         TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Cohérence du couple statut / suspendue_le : pas de compte « suspendu depuis
  -- jamais », ni d'« actif suspendu le 3 mars ».
  CONSTRAINT entreprises_suspension_coherente CHECK (
    (statut = 'SUSPENDU' AND suspendue_le IS NOT NULL) OR
    (statut = 'ACTIF'    AND suspendue_le IS NULL)
  )
);

CREATE OR REPLACE TRIGGER trg_entreprises_modifie_le
  BEFORE UPDATE ON entreprises
  FOR EACH ROW EXECUTE FUNCTION bizly_touch_modifie_le();

CREATE OR REPLACE TRIGGER trg_entreprises_fuseau
  BEFORE INSERT OR UPDATE OF fuseau ON entreprises
  FOR EACH ROW EXECUTE FUNCTION bizly_valider_fuseau();

-- ---------------------------------------------------------------------------
-- Utilisateurs clients et sessions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS utilisateurs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id         UUID NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
  email                 TEXT NOT NULL CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  mot_de_passe_hash     TEXT NOT NULL,
  nom                   TEXT NOT NULL CHECK (length(btrim(nom)) BETWEEN 1 AND 120),
  role                  TEXT NOT NULL DEFAULT 'PROPRIETAIRE'
                          CHECK (role IN ('PROPRIETAIRE', 'EMPLOYE')),
  statut                TEXT NOT NULL DEFAULT 'ACTIF'
                          CHECK (statut IN ('ACTIF', 'SUSPENDU')),
  derniere_connexion_le TIMESTAMPTZ,
  cree_le               TIMESTAMPTZ NOT NULL DEFAULT now(),
  modifie_le            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unicité globale de l'email : la connexion se fait par email seul, sans avoir
-- à désigner son entreprise. Insensible à la casse.
CREATE UNIQUE INDEX IF NOT EXISTS utilisateurs_email_unique
  ON utilisateurs (lower(email));

CREATE INDEX IF NOT EXISTS utilisateurs_entreprise_idx
  ON utilisateurs (entreprise_id);

CREATE OR REPLACE TRIGGER trg_utilisateurs_modifie_le
  BEFORE UPDATE ON utilisateurs
  FOR EACH ROW EXECUTE FUNCTION bizly_touch_modifie_le();

CREATE TABLE IF NOT EXISTS sessions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  utilisateur_id       UUID NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  token_hash           BYTEA NOT NULL,
  expire_le            TIMESTAMPTZ NOT NULL,
  revoquee_le          TIMESTAMPTZ,
  ip                   INET,
  user_agent           TEXT,
  cree_le              TIMESTAMPTZ NOT NULL DEFAULT now(),
  derniere_activite_le TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT sessions_token_hash_sha256 CHECK (octet_length(token_hash) = 32)
);

COMMENT ON COLUMN sessions.token_hash IS
  'SHA-256 du token de session. Le token en clair n''existe que dans le cookie '
  'du client : une fuite de la base ne permet pas d''usurper une session.';

CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_hash_unique ON sessions (token_hash);
CREATE INDEX IF NOT EXISTS sessions_utilisateur_idx ON sessions (utilisateur_id);
CREATE INDEX IF NOT EXISTS sessions_expire_idx ON sessions (expire_le);

-- ---------------------------------------------------------------------------
-- Admins plateforme — table SÉPARÉE des utilisateurs clients
--
-- Un admin n'a pas d'entreprise_id : il ne peut structurellement pas se
-- connecter à l'app cliente, et un bug de rôle ne peut pas transformer un
-- client en admin.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS admins (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                 TEXT NOT NULL CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  mot_de_passe_hash     TEXT NOT NULL,
  nom                   TEXT NOT NULL,
  statut                TEXT NOT NULL DEFAULT 'ACTIF'
                          CHECK (statut IN ('ACTIF', 'SUSPENDU')),
  derniere_connexion_le TIMESTAMPTZ,
  cree_le               TIMESTAMPTZ NOT NULL DEFAULT now(),
  modifie_le            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS admins_email_unique ON admins (lower(email));

CREATE OR REPLACE TRIGGER trg_admins_modifie_le
  BEFORE UPDATE ON admins
  FOR EACH ROW EXECUTE FUNCTION bizly_touch_modifie_le();

CREATE TABLE IF NOT EXISTS admin_sessions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id             UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  token_hash           BYTEA NOT NULL,
  expire_le            TIMESTAMPTZ NOT NULL,
  revoquee_le          TIMESTAMPTZ,
  ip                   INET,
  user_agent           TEXT,
  cree_le              TIMESTAMPTZ NOT NULL DEFAULT now(),
  derniere_activite_le TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT admin_sessions_token_hash_sha256 CHECK (octet_length(token_hash) = 32)
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_sessions_token_hash_unique
  ON admin_sessions (token_hash);
CREATE INDEX IF NOT EXISTS admin_sessions_admin_idx ON admin_sessions (admin_id);

-- ---------------------------------------------------------------------------
-- Compteurs par entreprise (numérotation lisible des ventes)
--
-- Une SEQUENCE Postgres est globale et laisse des trous ; le client veut
-- « vente n° 42 » et non un uuid. On alloue avec
--   UPDATE ... SET valeur = valeur + 1 RETURNING valeur
-- dans la transaction d'écriture : le verrou de ligne rend l'allocation sûre
-- même sous concurrence.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS compteurs (
  entreprise_id UUID   NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
  nom           TEXT   NOT NULL CHECK (nom IN ('vente')),
  valeur        BIGINT NOT NULL DEFAULT 0 CHECK (valeur >= 0),
  PRIMARY KEY (entreprise_id, nom)
);

-- ---------------------------------------------------------------------------
-- Données métier
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS clients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
  nom           TEXT NOT NULL CHECK (length(btrim(nom)) BETWEEN 1 AND 160),
  email         TEXT,
  telephone     TEXT,
  note          TEXT,
  cree_le       TIMESTAMPTZ NOT NULL DEFAULT now(),
  modifie_le    TIMESTAMPTZ NOT NULL DEFAULT now(),
  supprime_le   TIMESTAMPTZ,

  -- Cible des clés étrangères composites : garantit qu'une vente ne peut pas
  -- référencer le client d'une AUTRE entreprise.
  CONSTRAINT clients_id_entreprise_unique UNIQUE (id, entreprise_id)
);

CREATE INDEX IF NOT EXISTS clients_entreprise_idx
  ON clients (entreprise_id) WHERE supprime_le IS NULL;

CREATE OR REPLACE TRIGGER trg_clients_modifie_le
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION bizly_touch_modifie_le();

CREATE TABLE IF NOT EXISTS categories_depense (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
  code          TEXT NOT NULL CHECK (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  libelle       TEXT NOT NULL CHECK (length(btrim(libelle)) BETWEEN 1 AND 80),
  ordre         SMALLINT NOT NULL DEFAULT 100,
  cree_le       TIMESTAMPTZ NOT NULL DEFAULT now(),
  modifie_le    TIMESTAMPTZ NOT NULL DEFAULT now(),
  supprime_le   TIMESTAMPTZ,

  CONSTRAINT categories_depense_code_unique UNIQUE (entreprise_id, code),
  CONSTRAINT categories_depense_id_entreprise_unique UNIQUE (id, entreprise_id)
);

CREATE OR REPLACE TRIGGER trg_categories_depense_modifie_le
  BEFORE UPDATE ON categories_depense
  FOR EACH ROW EXECUTE FUNCTION bizly_touch_modifie_le();

CREATE TABLE IF NOT EXISTS ventes (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id        UUID   NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
  numero               BIGINT NOT NULL CHECK (numero > 0),
  effectuee_le         TIMESTAMPTZ NOT NULL,
  montant_total_mineur BIGINT NOT NULL CHECK (montant_total_mineur >= 0),
  moyen_paiement       TEXT CHECK (moyen_paiement IN
                         ('ESPECES', 'CARTE', 'VIREMENT', 'CHEQUE', 'MOBILE', 'AUTRE')),
  client_id            UUID,
  statut               TEXT NOT NULL DEFAULT 'VALIDEE'
                         CHECK (statut IN ('BROUILLON', 'VALIDEE', 'ANNULEE')),
  note                 TEXT,
  cree_le              TIMESTAMPTZ NOT NULL DEFAULT now(),
  modifie_le           TIMESTAMPTZ NOT NULL DEFAULT now(),
  supprime_le          TIMESTAMPTZ,

  CONSTRAINT ventes_numero_unique UNIQUE (entreprise_id, numero),
  CONSTRAINT ventes_id_entreprise_unique UNIQUE (id, entreprise_id),
  -- Clé étrangère COMPOSITE : rend impossible de rattacher une vente au client
  -- d'une AUTRE entreprise, quelle que soit l'erreur applicative.
  -- NO ACTION et non SET NULL : sur une clé composite, SET NULL viderait aussi
  -- entreprise_id, qui est NOT NULL. Les clients sont de toute façon soft-deleted ;
  -- seule la suppression d'une entreprise les efface pour de bon, et elle emporte
  -- les ventes dans la même instruction — NO ACTION vérifie en fin d'instruction.
  CONSTRAINT ventes_client_meme_entreprise
    FOREIGN KEY (client_id, entreprise_id)
    REFERENCES clients (id, entreprise_id) ON DELETE NO ACTION
);

COMMENT ON COLUMN ventes.effectuee_le IS
  'Date RÉELLE de la vente — c''est elle qui rattache la vente à une période, '
  'jamais cree_le. Une vente de lundi saisie mercredi appartient à lundi.';
COMMENT ON COLUMN ventes.montant_total_mineur IS
  'Montant TTC en unité mineure de la devise de l''entreprise. Fait autorité : '
  'les lignes de vente sont un détail facultatif.';

-- Index de travail du moteur de KPI : exactement le filtre du §4.1 de
-- docs/MOTEUR-ANALYTICS.md. Index PARTIEL — il ne contient que les lignes que
-- les KPI regardent, donc il reste petit et tient en cache.
CREATE INDEX IF NOT EXISTS ventes_kpi_idx
  ON ventes (entreprise_id, effectuee_le)
  WHERE statut = 'VALIDEE' AND supprime_le IS NULL;

CREATE INDEX IF NOT EXISTS ventes_client_idx
  ON ventes (entreprise_id, client_id) WHERE supprime_le IS NULL;

CREATE OR REPLACE TRIGGER trg_ventes_modifie_le
  BEFORE UPDATE ON ventes
  FOR EACH ROW EXECUTE FUNCTION bizly_touch_modifie_le();

CREATE TABLE IF NOT EXISTS lignes_vente (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id         UUID NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
  vente_id              UUID NOT NULL,
  rang                  SMALLINT NOT NULL DEFAULT 1 CHECK (rang > 0),
  libelle               TEXT NOT NULL CHECK (length(btrim(libelle)) BETWEEN 1 AND 160),
  quantite              NUMERIC(14, 3) NOT NULL CHECK (quantite > 0),
  prix_unitaire_mineur  BIGINT NOT NULL CHECK (prix_unitaire_mineur >= 0),
  montant_mineur        BIGINT NOT NULL CHECK (montant_mineur >= 0),

  CONSTRAINT lignes_vente_meme_entreprise
    FOREIGN KEY (vente_id, entreprise_id)
    REFERENCES ventes (id, entreprise_id) ON DELETE CASCADE
);

COMMENT ON COLUMN lignes_vente.montant_mineur IS
  'quantite x prix_unitaire_mineur, arrondi selon docs/MOTEUR-ANALYTICS.md §2 '
  '(au plus proche, moitié s''éloignant de zéro). Stocké et non calculé : '
  'l''arrondi doit être figé au moment de la vente.';

CREATE INDEX IF NOT EXISTS lignes_vente_vente_idx ON lignes_vente (vente_id);
CREATE INDEX IF NOT EXISTS lignes_vente_entreprise_libelle_idx
  ON lignes_vente (entreprise_id, libelle);

CREATE TABLE IF NOT EXISTS depenses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id   UUID   NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
  effectuee_le    TIMESTAMPTZ NOT NULL,
  montant_mineur  BIGINT NOT NULL CHECK (montant_mineur >= 0),
  categorie_id    UUID,
  fournisseur     TEXT,
  moyen_paiement  TEXT CHECK (moyen_paiement IN
                    ('ESPECES', 'CARTE', 'VIREMENT', 'CHEQUE', 'MOBILE', 'AUTRE')),
  statut          TEXT NOT NULL DEFAULT 'VALIDEE'
                    CHECK (statut IN ('BROUILLON', 'VALIDEE', 'ANNULEE')),
  note            TEXT,
  cree_le         TIMESTAMPTZ NOT NULL DEFAULT now(),
  modifie_le      TIMESTAMPTZ NOT NULL DEFAULT now(),
  supprime_le     TIMESTAMPTZ,

  -- Même raisonnement que ventes_client_meme_entreprise ci-dessus.
  CONSTRAINT depenses_categorie_meme_entreprise
    FOREIGN KEY (categorie_id, entreprise_id)
    REFERENCES categories_depense (id, entreprise_id) ON DELETE NO ACTION
);

CREATE INDEX IF NOT EXISTS depenses_kpi_idx
  ON depenses (entreprise_id, effectuee_le)
  WHERE statut = 'VALIDEE' AND supprime_le IS NULL;

CREATE INDEX IF NOT EXISTS depenses_categorie_idx
  ON depenses (entreprise_id, categorie_id) WHERE supprime_le IS NULL;

CREATE OR REPLACE TRIGGER trg_depenses_modifie_le
  BEFORE UPDATE ON depenses
  FOR EACH ROW EXECUTE FUNCTION bizly_touch_modifie_le();
