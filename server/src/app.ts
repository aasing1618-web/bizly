import express, { type Express } from "express";
import type { SondeBase } from "./db/sonde.js";
import { gestionnaireErreurs, routeApiIntrouvable } from "./http/erreurs.js";
import {
  entetesSecurite,
  identifiantRequete,
  journaliserRequetes,
} from "./http/middlewares.js";
import { creerRouteurAuth } from "./modules/auth/routes.js";
import type { ServiceAuth } from "./modules/auth/service.js";
import { creerRouteurOperations } from "./modules/operations/routes.js";
import type { ServiceOperations } from "./modules/operations/service.js";
import { creerRouteurSante } from "./routes/health.js";
import { monterStatiques } from "./statiques.js";

export type DependancesApp = {
  sonderBase: SondeBase;
  serviceAuth: ServiceAuth;
  serviceOperations: ServiceOperations;
  version: string;
  demarreLe: number;
  production: boolean;
  /**
   * Dossier des bundles front. `null` pour ne monter que l'API — c'est ce que
   * font les tests, qui n'ont pas de build à servir.
   */
  racinePublic: string | null;
};

/**
 * Construit l'application Express.
 *
 * Toutes les dépendances sont injectées : `creerApp` ne lit ni l'environnement,
 * ni l'horloge, ni la base. C'est ce qui permet de tester le socle HTTP sans
 * `.env` ni connexion Postgres.
 *
 * L'ordre de montage est significatif :
 *   1. identité de requête et en-têtes de sécurité, pour TOUTE réponse ;
 *   2. l'API — donc `/api/*` est traité avant que le moindre statique n'existe ;
 *   3. le 404 JSON de l'API, qui ferme `/api/*` ;
 *   4. les statiques et le fallback SPA ;
 *   5. le gestionnaire d'erreurs, obligatoirement en dernier.
 */
export function creerApp(deps: DependancesApp): Express {
  const app = express();

  // Ne pas annoncer « Express » à qui scanne le service.
  app.disable("x-powered-by");

  // Derrière l'hébergeur (proxy TLS), fait confiance au premier X-Forwarded-*
  // pour obtenir l'IP réelle du client. Indispensable au rate limiting de la
  // Vague 1. Valeur numérique et non `true` : `true` ferait confiance à toute
  // la chaîne, y compris à un en-tête forgé par le client.
  app.set("trust proxy", deps.production ? 1 : false);

  app.use(identifiantRequete);
  app.use(entetesSecurite({ production: deps.production }));

  const api = express.Router();
  api.use(journaliserRequetes);
  api.use(express.json({ limit: "100kb" }));
  api.use(
    creerRouteurSante({
      sonderBase: deps.sonderBase,
      version: deps.version,
      demarreLe: deps.demarreLe,
    }),
  );
  api.use(creerRouteurAuth({ service: deps.serviceAuth, production: deps.production }));
  api.use(
    creerRouteurOperations({
      serviceAuth: deps.serviceAuth,
      serviceOperations: deps.serviceOperations,
    }),
  );
  api.use(routeApiIntrouvable);

  app.use("/api", api);

  if (deps.racinePublic !== null) {
    monterStatiques(app, { racinePublic: deps.racinePublic });
  }

  app.use(gestionnaireErreurs);

  return app;
}
