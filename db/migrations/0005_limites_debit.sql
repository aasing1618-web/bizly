-- ===========================================================================
-- Bizly — 0005_limites_debit
--
-- Limitation de débit PARTAGÉE entre instances.
--
-- Jusqu'ici le compteur vivait en mémoire du processus (Vague 1, « limite
-- assumée » : « avec deux instances, chacune accorde le quota complet »). Cette
-- dette arrive à échéance au déploiement : un hébergeur sans état lance
-- plusieurs instances éphémères, et une défense contre la force brute qui
-- redémarre à chaque requête n'est plus une défense.
--
-- Une ligne = une tentative. La fenêtre est GLISSANTE, comme en mémoire : un
-- compteur remis à zéro à heure fixe laisse passer deux fois le quota à cheval
-- sur la bascule.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS limites_debit (
  id         BIGSERIAL PRIMARY KEY,
  cle        TEXT        NOT NULL CHECK (length(cle) BETWEEN 1 AND 200),
  survenu_le TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE limites_debit IS
  'Tentatives horodatées, pour une limitation de débit partagée entre instances. '
  'Aucune donnée personnelle durable : les lignes sont purgées au fil de l''eau.';

COMMENT ON COLUMN limites_debit.cle IS
  'Espace de noms + identifiant, ex. « connexion:email:awa@exemple.fr ». '
  'Le préfixe évite qu''une IP et un e-mail partagent un compteur.';

-- L'index sert exactement la requête du limiteur : compter les lignes d'une clé
-- plus récentes qu'un instant. Sans lui, chaque tentative de connexion
-- balaierait toute la table.
CREATE INDEX IF NOT EXISTS limites_debit_cle_idx
  ON limites_debit (cle, survenu_le DESC);
