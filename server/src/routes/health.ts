import { Router } from "express";
import type { ReponseSante } from "@bizly/shared";
import type { SondeBase } from "../db/sonde.js";

export type OptionsRouteurSante = {
  sonderBase: SondeBase;
  version: string;
  /** Instant de démarrage du processus, en millisecondes epoch. */
  demarreLe: number;
};

/**
 * `GET /api/health` — sonde de santé publique (docs/API-CONTRACT.md §1).
 *
 * Répond **503** quand la base ne répond pas, et non 200 : sinon l'hébergeur
 * croit le service sain et continue de router du trafic vers un processus
 * incapable de servir une seule page utile.
 *
 * La réponse ne suit volontairement PAS la forme d'erreur standard : ce n'est
 * pas l'échec d'une requête, c'est un rapport d'état. Le monitoring lit le code
 * HTTP et le champ `statut`.
 */
export function creerRouteurSante(options: OptionsRouteurSante): Router {
  const routeur = Router();

  routeur.get("/health", async (_requete, reponse) => {
    const base = await options.sonderBase();

    const corps: ReponseSante = {
      statut: base.statut === "ok" ? "ok" : "degrade",
      version: options.version,
      horodatage: new Date().toISOString(),
      uptime_s: Math.round((Date.now() - options.demarreLe) / 1000),
      base,
    };

    reponse.status(corps.statut === "ok" ? 200 : 503).json(corps);
  });

  return routeur;
}
