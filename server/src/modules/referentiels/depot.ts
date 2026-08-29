import type { Pool } from "pg";
import type { DeviseReferentiel, SecteurReferentiel } from "@bizly/shared";

/**
 * Lecture des référentiels — docs/API-CONTRACT.md §7.
 *
 * Devises et secteurs viennent de la **base** : ce sont eux que les clés
 * étrangères de `entreprises` contraignent, la base en est donc l'autorité. Une
 * liste recopiée côté serveur finirait par proposer une devise que l'INSERT
 * refuse.
 *
 * Les pays, eux, ne sont pas ici : ISO 3166-1 figé, aucune clé étrangère, ils
 * vivent dans `@bizly/shared` (§7.1).
 */

export type DepotReferentiels = {
  lister(): Promise<{ devises: DeviseReferentiel[]; secteurs: SecteurReferentiel[] }>;
};

export function creerDepotReferentiels(pool: Pool): DepotReferentiels {
  return {
    async lister() {
      // Deux requêtes en parallèle : aucune ne dépend de l'autre, et la route
      // est appelée à chaque ouverture de l'écran d'inscription.
      const [devises, secteurs] = await Promise.all([
        pool.query<DeviseReferentiel>(
          `SELECT code, libelle, symbole, decimales
             FROM devises
            ORDER BY code`,
        ),
        pool.query<SecteurReferentiel>(
          `SELECT code, libelle
             FROM secteurs
            ORDER BY ordre, libelle`,
        ),
      ]);

      return { devises: devises.rows, secteurs: secteurs.rows };
    },
  };
}
