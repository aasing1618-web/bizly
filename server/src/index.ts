import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { creerApp } from "./app.js";
import { RACINE_DEPOT, enProduction, env } from "./config/env.js";
import { fermerPool, pool } from "./db/pool.js";
import { creerSondeBase } from "./db/sonde.js";
import { creerDepotAdmin } from "./modules/admin/depot.js";
import { creerServiceAdmin } from "./modules/admin/service.js";
import { creerDepotPg } from "./modules/auth/depot.js";
import { creerServiceAuth } from "./modules/auth/service.js";
import { creerDepotCatalogue } from "./modules/catalogue/depot.js";
import { creerDepotEntreprise } from "./modules/entreprise/depot.js";
import { creerDepotReferentiels } from "./modules/referentiels/depot.js";
import { creerFabriqueLimiteurBase } from "./http/limiteurBase.js";
import { creerDepotKpi } from "./modules/kpi/depot.js";
import { creerDepotOperations } from "./modules/operations/depot.js";
import { creerDepotQuestions } from "./modules/questions/depot.js";
import { creerServiceOperations } from "./modules/operations/service.js";
import { definirNiveauJournal, detaillerErreur, journal } from "./http/journal.js";

/**
 * Point d'entrée : câble l'environnement réel sur l'application.
 *
 * Tout ce qui est décidé ici (version, dossiers, pool, horloge) est passé à
 * `creerApp` sous forme de dépendance, pour que l'application reste testable.
 */

import { creerDepotPaiement } from "./modules/paiement/depot.js";
import { creerServicePaiement } from "./modules/paiement/service.js";

definirNiveauJournal(enProduction ? "info" : "debug");

const demarreLe = Date.now();
const version = lireVersion();

const depotCatalogue = creerDepotCatalogue(pool);
const depotAuth = creerDepotPg(pool);
const depotAdmin = creerDepotAdmin(pool);
const depotPaiement = creerDepotPaiement(pool);
const servicePaiement = creerServicePaiement({
  depot: depotPaiement,
  // Lien Wave Business, si le propriétaire en a un. Absent = le client voit le
  // numéro et la marche à suivre, jamais un bouton qui ne mène nulle part.
  lienWave: process.env["WAVE_LIEN_PAIEMENT"]?.trim() || null,
});

const app = creerApp({
  sonderBase: creerSondeBase(pool),
  serviceAuth: creerServiceAuth({ depot: depotAuth }),
  serviceOperations: creerServiceOperations(creerDepotOperations(pool), depotCatalogue),
  serviceAdmin: creerServiceAdmin({ depot: depotAdmin }),
  servicePaiement,
  depotAuth,
  depotKpi: creerDepotKpi(pool),
  depotCatalogue,
  depotQuestions: creerDepotQuestions(pool),
  depotEntreprise: creerDepotEntreprise(pool),
  depotReferentiels: creerDepotReferentiels(pool),
  depotAdmin,
  // Limitation partagée en base. Sur un hébergeur sans état, plusieurs
  // instances répondent aux mêmes requêtes : un compteur en mémoire accorderait
  // le quota complet à chacune, et la défense contre la force brute
  // disparaîtrait sans que rien ne le signale.
  creerLimiteur: creerFabriqueLimiteurBase(pool),
  version,
  demarreLe,
  production: enProduction,
  racinePublic: path.join(RACINE_DEPOT, "server", "public"),
});

const serveur = app.listen(env.PORT, () => {
  journal.info("Bizly démarré", {
    version,
    port: env.PORT,
    environnement: env.NODE_ENV,
    url: `http://localhost:${env.PORT}`,
  });
});

/**
 * Arrêt propre : on cesse d'accepter de nouvelles connexions, on laisse les
 * requêtes en cours se terminer, puis on ferme le pool. Sans ça, un
 * redéploiement coupe une écriture au milieu d'une transaction.
 */
function arreterProprement(signal: string): void {
  journal.info("arrêt demandé", { signal });

  const delaiMax = setTimeout(() => {
    journal.avertissement("arrêt forcé : requêtes toujours en cours après 10 s");
    process.exit(1);
  }, 10_000);
  delaiMax.unref();

  serveur.close(async (cause) => {
    if (cause) journal.erreur("fermeture du serveur HTTP en erreur", detaillerErreur(cause));
    try {
      await fermerPool();
    } catch (erreurPool) {
      journal.erreur("fermeture du pool en erreur", detaillerErreur(erreurPool));
    }
    journal.info("arrêt terminé");
    process.exit(cause ? 1 : 0);
  });
}

process.on("SIGTERM", () => arreterProprement("SIGTERM"));
process.on("SIGINT", () => arreterProprement("SIGINT"));

process.on("unhandledRejection", (cause) => {
  journal.erreur("promesse rejetée sans gestionnaire", detaillerErreur(cause));
});

process.on("uncaughtException", (cause) => {
  // Après une exception non attrapée, l'état du processus n'est plus fiable :
  // on journalise et on sort. L'hébergeur redémarre.
  journal.erreur("exception non attrapée — arrêt", detaillerErreur(cause));
  process.exit(1);
});

/** Lit la version depuis le package.json du serveur, en dev comme après build. */
function lireVersion(): string {
  const ici = path.dirname(fileURLToPath(import.meta.url));
  const candidats = [
    path.join(ici, "..", "package.json"), // dist/index.js -> server/package.json
    path.join(ici, "..", "..", "package.json"), // src/index.ts -> server/package.json
  ];

  for (const candidat of candidats) {
    try {
      const contenu = JSON.parse(readFileSync(candidat, "utf8")) as { version?: unknown };
      if (typeof contenu.version === "string") return contenu.version;
    } catch {
      // Candidat suivant.
    }
  }

  return "0.0.0";
}
