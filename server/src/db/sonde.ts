import type { Pool } from "pg";
import { detaillerErreur, journal } from "../http/journal.js";

export type EtatBase = {
  statut: "ok" | "erreur";
  latence_ms: number | null;
};

export type SondeBase = () => Promise<EtatBase>;

/**
 * Sonde de disponibilité de la base, pour `GET /api/health`.
 *
 * Deux exigences contradictoires : dire la vérité, et répondre vite. Une sonde
 * qui attend aussi longtemps que le pool (5 s de connexion + requête) est
 * inutile — l'hébergeur l'aura déjà considérée en échec. D'où le délai court et
 * indépendant.
 *
 * Le détail de l'erreur (hôte, message Postgres) part dans les logs, jamais
 * dans la réponse : `/api/health` est une route publique.
 */
export function creerSondeBase(pool: Pool, delaiMaxMs = 2_000): SondeBase {
  return async function sonder(): Promise<EtatBase> {
    const debut = process.hrtime.bigint();
    let minuteur: NodeJS.Timeout | undefined;

    const expiration = new Promise<never>((_resoudre, rejeter) => {
      minuteur = setTimeout(
        () => rejeter(new Error(`sonde base : pas de réponse en ${delaiMaxMs} ms`)),
        delaiMaxMs,
      );
    });

    try {
      await Promise.race([pool.query("SELECT 1"), expiration]);
      const latence = Number(process.hrtime.bigint() - debut) / 1_000_000;
      return { statut: "ok", latence_ms: Math.round(latence) };
    } catch (cause) {
      journal.erreur("sonde base en échec", detaillerErreur(cause));
      return { statut: "erreur", latence_ms: null };
    } finally {
      // Sans ça, le minuteur gagnant garde le processus vivant jusqu'à son terme.
      if (minuteur !== undefined) clearTimeout(minuteur);
    }
  };
}
