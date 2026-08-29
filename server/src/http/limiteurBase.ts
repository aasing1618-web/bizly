import type { Pool } from "pg";
import { detaillerErreur, journal } from "./journal.js";
import type { FabriqueLimiteur, Limiteur, OptionsLimiteur } from "./limiteur.js";

/**
 * Limitation de débit **partagée**, adossée à Postgres.
 *
 * C'est la version qui tient quand l'application tourne en plusieurs
 * exemplaires — plusieurs conteneurs, ou des fonctions sans état chez un
 * hébergeur serverless. Le limiteur en mémoire y accorderait le quota complet à
 * chaque instance, et la défense contre la force brute ne vaudrait plus rien.
 *
 * Voir `db/migrations/0005_limites_debit.sql`.
 */

/**
 * Compter puis insérer en **une seule instruction**.
 *
 * Deux requêtes séparées laisseraient une fenêtre entre le comptage et
 * l'écriture : sous rafale, plusieurs tentatives verraient le même total et
 * passeraient toutes. Ici les CTE partagent un instantané, et l'insertion est
 * conditionnée par le comptage.
 *
 * La purge est incluse et **limitée à la clé touchée** : travail borné, et
 * chaque clé se nettoie d'elle-même à son usage suivant.
 */
const REQUETE = `
WITH purge AS (
  DELETE FROM limites_debit
   WHERE cle = $1 AND survenu_le < now() - make_interval(secs => $2))
, recentes AS (
  SELECT count(*)::int AS n
    FROM limites_debit
   WHERE cle = $1 AND survenu_le > now() - make_interval(secs => $2))
, inseree AS (
  INSERT INTO limites_debit (cle)
  SELECT $1 FROM recentes WHERE n < $3
  RETURNING 1)
SELECT EXISTS (SELECT 1 FROM inseree) AS autorise
`;

export function creerFabriqueLimiteurBase(pool: Pool): FabriqueLimiteur {
  return (nom: string, options: OptionsLimiteur): Limiteur => {
    const fenetreSecondes = options.fenetreMs / 1000;
    const prefixe = (cle: string): string => `${nom}:${cle}`;

    return {
      async autoriser(cle) {
        try {
          const resultat = await pool.query<{ autorise: boolean }>(REQUETE, [
            prefixe(cle),
            fenetreSecondes,
            options.maximum,
          ]);
          return resultat.rows[0]?.autorise ?? false;
        } catch (cause) {
          // Base indisponible : on LAISSE PASSER. Refuser transformerait un
          // incident de base de données en panne totale de connexion, alors
          // que la requête suivante échouera de toute façon proprement si la
          // base est vraiment morte. On journalise fort : une limitation
          // silencieusement inopérante est pire qu'une limitation absente.
          journal.erreur("limitation de débit indisponible — tentative laissée passer", {
            limiteur: nom,
            ...detaillerErreur(cause),
          });
          return true;
        }
      },

      async reinitialiser(cle) {
        try {
          await pool.query(`DELETE FROM limites_debit WHERE cle = $1`, [prefixe(cle)]);
        } catch (cause) {
          // Sans conséquence pour l'appelant : au pire le compteur met sa
          // fenêtre à expirer tout seul.
          journal.avertissement("réinitialisation de limite impossible", {
            limiteur: nom,
            ...detaillerErreur(cause),
          });
        }
      },
    };
  };
}
