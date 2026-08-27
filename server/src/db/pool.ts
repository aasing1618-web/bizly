import pg from "pg";
import { RACINE_DEPOT, env } from "../config/env.js";
import { detaillerErreur, journal } from "../http/journal.js";
import { chargerCertificatCa } from "./certificat.js";
import { diagnostiquerConnexion, optionsTls } from "./options.js";
import "./typesPg.js";

const { Pool } = pg;

const diagnostic = diagnostiquerConnexion(env.DATABASE_URL, env.DATABASE_SSL);

for (const avertissement of diagnostic.avertissements) {
  journal.avertissement(avertissement, { hote: diagnostic.hote, port: diagnostic.port });
}

/**
 * Pool de connexions applicatif.
 *
 * `max` reste volontairement modeste : le pooler Supabase (port 6543) est déjà
 * partagé entre toutes les instances du projet. Ouvrir 50 connexions par
 * processus n'accélère rien et sature la ressource commune.
 */
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DATABASE_POOL_MAX,
  ssl: optionsTls(env.DATABASE_SSL, chargerCertificatCa(env.DATABASE_CA_CERT, RACINE_DEPOT)),
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
  application_name: "bizly",
});

/**
 * Une erreur sur une connexion INACTIVE du pool est émise sur le pool lui-même.
 * Sans écouteur, Node considère l'événement `error` comme non géré et tue le
 * processus. Le pool sait remplacer une connexion morte : on journalise et on
 * continue.
 */
pool.on("error", (cause) => {
  journal.erreur("connexion Postgres inactive en erreur", detaillerErreur(cause));
});

export async function fermerPool(): Promise<void> {
  await pool.end();
}

export const diagnosticConnexion = diagnostic;
