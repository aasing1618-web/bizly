import express, { type Express } from "express";
import type { SondeBase } from "./db/sonde.js";
import { gestionnaireErreurs, routeApiIntrouvable } from "./http/erreurs.js";
import type { FabriqueLimiteur } from "./http/limiteur.js";
import {
  entetesSecurite,
  identifiantRequete,
  journaliserRequetes,
} from "./http/middlewares.js";
import { creerRouteurAdmin } from "./modules/admin/routes.js";
import type { DepotAdmin } from "./modules/admin/depot.js";
import type { ServiceAdmin } from "./modules/admin/service.js";
import { creerRouteurAuth } from "./modules/auth/routes.js";
import type { DepotAuth } from "./modules/auth/depot.js";
import type { ServiceAuth } from "./modules/auth/service.js";
import { creerRouteurCatalogue } from "./modules/catalogue/routes.js";
import type { DepotCatalogue } from "./modules/catalogue/depot.js";
import { creerRouteurEntreprise } from "./modules/entreprise/routes.js";
import type { DepotEntreprise } from "./modules/entreprise/depot.js";
import { creerRouteurReferentiels } from "./modules/referentiels/routes.js";
import type { DepotReferentiels } from "./modules/referentiels/depot.js";
import { creerRouteurKpi } from "./modules/kpi/routes.js";
import type { DepotKpi } from "./modules/kpi/depot.js";
import { creerRouteurOperations } from "./modules/operations/routes.js";
import { creerRouteurQuestions } from "./modules/questions/routes.js";
import type { DepotQuestions } from "./modules/questions/depot.js";
import type { ServiceOperations } from "./modules/operations/service.js";
import { creerRouteurSante } from "./routes/health.js";
import { monterStatiques } from "./statiques.js";

import { creerRouteurPaiement } from "./modules/paiement/routes.js";
import type { ServicePaiement } from "./modules/paiement/service.js";

export type DependancesApp = {
  sonderBase: SondeBase;
  serviceAuth: ServiceAuth;
  serviceOperations: ServiceOperations;
  serviceAdmin: ServiceAdmin;
  servicePaiement: ServicePaiement;
  depotAuth: DepotAuth;
  depotKpi: DepotKpi;
  depotCatalogue: DepotCatalogue;
  depotQuestions: DepotQuestions;
  depotEntreprise: DepotEntreprise;
  depotReferentiels: DepotReferentiels;
  depotAdmin: DepotAdmin;
  /**
   * Fabrique de limiteurs de débit.
   *
   * Injectée parce qu'elle dépend du déploiement, pas du métier : adossée à
   * Postgres dès qu'il peut y avoir plusieurs instances, en mémoire pour les
   * tests. Une limite qui vit dans le processus n'existe plus dès la deuxième
   * instance (`db/migrations/0005_limites_debit.sql`).
   */
  creerLimiteur: FabriqueLimiteur;
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
  api.use(creerRouteurReferentiels({ depot: deps.depotReferentiels }));
  api.use(
    creerRouteurAuth({
      service: deps.serviceAuth,
      production: deps.production,
      creerLimiteur: deps.creerLimiteur,
    }),
  );
  api.use(
    creerRouteurEntreprise({
      serviceAuth: deps.serviceAuth,
      depot: deps.depotEntreprise,
      depotAuth: deps.depotAuth,
      creerLimiteur: deps.creerLimiteur,
    }),
  );
  api.use(
    creerRouteurAdmin({
      service: deps.serviceAdmin,
      depot: deps.depotAdmin,
      servicePaiement: deps.servicePaiement,
      production: deps.production,
      creerLimiteur: deps.creerLimiteur,
    }),
  );
  api.use(
    creerRouteurOperations({
      serviceAuth: deps.serviceAuth,
      serviceOperations: deps.serviceOperations,
    }),
  );
  api.use(
    creerRouteurCatalogue({ serviceAuth: deps.serviceAuth, depot: deps.depotCatalogue }),
  );
  api.use(creerRouteurKpi({ serviceAuth: deps.serviceAuth, depot: deps.depotKpi }));
  api.use(creerRouteurQuestions({ serviceAuth: deps.serviceAuth, depot: deps.depotQuestions }));
  api.use(
    creerRouteurPaiement({
      serviceAuth: deps.serviceAuth,
      servicePaiement: deps.servicePaiement,
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
