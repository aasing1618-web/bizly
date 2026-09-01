import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { creerApp } from "./app.js";
import { RACINE_DEPOT, enProduction } from "./config/env.js";
import { pool } from "./db/pool.js";
import { creerSondeBase } from "./db/sonde.js";
import { definirNiveauJournal } from "./http/journal.js";
import { creerFabriqueLimiteurBase } from "./http/limiteurBase.js";
import { creerDepotAdmin } from "./modules/admin/depot.js";
import { creerServiceAdmin } from "./modules/admin/service.js";
import { creerDepotPg } from "./modules/auth/depot.js";
import { creerServiceAuth } from "./modules/auth/service.js";
import { creerDepotCatalogue } from "./modules/catalogue/depot.js";
import { creerDepotEntreprise } from "./modules/entreprise/depot.js";
import { creerDepotKpi } from "./modules/kpi/depot.js";
import { creerDepotOperations } from "./modules/operations/depot.js";
import { creerServiceOperations } from "./modules/operations/service.js";
import { creerDepotQuestions } from "./modules/questions/depot.js";
import { creerDepotReferentiels } from "./modules/referentiels/depot.js";

/**
 * Point d'entrée pour un hébergeur **sans état** (Vercel).
 *
 * Jumeau de `index.ts`, à trois différences près, et chacune compte :
 *
 * 1. **Pas de `listen()`.** L'hébergeur appelle l'application comme une
 *    fonction ; ouvrir un port n'aurait aucun sens et ferait échouer le
 *    démarrage.
 * 2. **Pas d'arrêt propre.** `SIGTERM` n'est pas reçu, et fermer le pool à la
 *    fin d'une requête rouvrirait une connexion à la suivante. Le pooler
 *    Supabase en mode transaction est justement fait pour ça.
 * 3. **Le module est évalué une fois par instance**, puis réutilisé entre les
 *    requêtes. Le pool survit donc aux appels — c'est voulu, et c'est ce qui
 *    évite de payer une poignée de main TLS à chaque requête.
 *
 * Ce que ce mode **change vraiment**, et qui est traité ailleurs : la
 * limitation de débit ne peut plus vivre en mémoire, puisque plusieurs
 * instances répondent aux mêmes requêtes. Elle passe par Postgres
 * (`http/limiteurBase.ts`).
 */

import { creerDepotPaiement } from "./modules/paiement/depot.js";
import { creerServicePaiement } from "./modules/paiement/service.js";

definirNiveauJournal(enProduction ? "info" : "debug");

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

/**
 * Racine des bundles front.
 *
 * Calculée depuis ce fichier (`server/dist/vercel.js` → `server/public`) plutôt
 * que depuis la racine du dépôt : dans un bac à sable de fonction, seul le
 * chemin relatif au module est certain.
 */
const racinePublic = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

export const app = creerApp({
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
  creerLimiteur: creerFabriqueLimiteurBase(pool),
  version: lireVersion(),
  demarreLe: Date.now(),
  production: enProduction,
  racinePublic,
});

export default app;

/** Version affichée par `/api/health`. `RACINE_DEPOT` est déjà résolu par `config/env`. */
function lireVersion(): string {
  try {
    const contenu = JSON.parse(
      readFileSync(path.join(RACINE_DEPOT, "server", "package.json"), "utf8"),
    ) as { version?: unknown };
    return typeof contenu.version === "string" ? contenu.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}
