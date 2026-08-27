import pg from "pg";

/**
 * Correspondances de types Postgres → JavaScript.
 *
 * À importer UNE fois, avant toute requête (fait par `pool.ts`).
 */

/**
 * `bigint` (int8) est rendu par node-postgres sous forme de CHAÎNE par défaut,
 * pour ne pas perdre de précision au-delà de 2^53. On le convertit en `bigint`
 * JavaScript : c'est le type dans lequel tout l'argent Bizly est manipulé
 * (docs/MOTEUR-ANALYTICS.md §1).
 *
 * Conséquences assumées :
 *   - `COUNT(*)` rend lui aussi un `bigint` — il faut le convertir
 *     explicitement en `Number` pour le sérialiser ;
 *   - `JSON.stringify` LÈVE sur un `bigint`. C'est voulu : mieux vaut une
 *     exception au développement qu'un montant silencieusement corrompu.
 */
pg.types.setTypeParser(pg.types.builtins.INT8, (valeur: string) => BigInt(valeur));

/**
 * `numeric` reste une CHAÎNE (comportement par défaut de node-postgres) : le
 * convertir en `number` introduirait exactement l'imprécision flottante que
 * tout le projet cherche à éviter. Seule `lignes_vente.quantite` est concernée.
 */
export const NUMERIC_RESTE_CHAINE = true;
