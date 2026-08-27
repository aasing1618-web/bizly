import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import pg from "pg";
import { RACINE_DEPOT, env } from "../config/env.js";
import { diagnostiquerConnexion, optionsTls } from "../db/options.js";

/**
 * Applique les migrations SQL de `db/migrations` dans l'ordre de leur numéro.
 *
 *   npm run migrate            applique ce qui manque
 *   npm run migrate:statut     affiche l'état sans rien modifier
 *
 * Trois garanties :
 *   1. une migration déjà appliquée n'est jamais rejouée ;
 *   2. son empreinte est vérifiée — modifier un fichier déjà appliqué est une
 *      erreur, pas un silence (les migrations sont append-only, AGENTS.md §3) ;
 *   3. chaque migration s'exécute dans SA transaction : elle passe entièrement
 *      ou pas du tout.
 */

const TABLE_SUIVI = "_migrations";
const SORTIE = process.stdout;

type Migration = {
  nom: string;
  chemin: string;
  sql: string;
  empreinte: string;
};

type LigneAppliquee = {
  nom: string;
  empreinte: string;
  applique_le: Date;
};

function ecrire(ligne = ""): void {
  SORTIE.write(`${ligne}\n`);
}

function empreinteDe(sql: string): string {
  // Normalise les fins de ligne : un fichier passé par Windows ne doit pas
  // paraître modifié pour la seule raison de ses CRLF.
  return createHash("sha256").update(sql.replace(/\r\n/g, "\n"), "utf8").digest("hex");
}

function lireMigrations(): Migration[] {
  const dossier = path.join(RACINE_DEPOT, "db", "migrations");

  return readdirSync(dossier)
    .filter((nom) => nom.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b, "en"))
    .map((nom) => {
      const chemin = path.join(dossier, nom);
      const sql = readFileSync(chemin, "utf8");
      return { nom, chemin, sql, empreinte: empreinteDe(sql) };
    });
}

async function assurerTableSuivi(client: pg.Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${TABLE_SUIVI} (
      nom         TEXT PRIMARY KEY,
      empreinte   TEXT        NOT NULL,
      applique_le TIMESTAMPTZ NOT NULL DEFAULT now(),
      duree_ms    INTEGER     NOT NULL
    )
  `);
}

async function lireAppliquees(client: pg.Client): Promise<Map<string, LigneAppliquee>> {
  const resultat = await client.query<LigneAppliquee>(
    `SELECT nom, empreinte, applique_le FROM ${TABLE_SUIVI} ORDER BY nom`,
  );
  return new Map(resultat.rows.map((ligne) => [ligne.nom, ligne]));
}

/**
 * Détecte la modification d'une migration déjà appliquée.
 *
 * Cas dangereux : le fichier a changé sur disque, mais la base a exécuté
 * l'ancienne version. Les deux divergent en silence, et l'environnement suivant
 * ne recevra pas le même schéma. On refuse d'aller plus loin.
 */
function verifierEmpreintes(
  migrations: Migration[],
  appliquees: Map<string, LigneAppliquee>,
): string[] {
  const problemes: string[] = [];

  for (const migration of migrations) {
    const dejaFaite = appliquees.get(migration.nom);
    if (dejaFaite && dejaFaite.empreinte !== migration.empreinte) {
      problemes.push(
        `${migration.nom} a été MODIFIÉE après avoir été appliquée le ` +
          `${dejaFaite.applique_le.toISOString()}. Les migrations sont append-only : ` +
          "restaurer le fichier d'origine et créer une nouvelle migration.",
      );
    }
  }

  for (const nom of appliquees.keys()) {
    if (!migrations.some((migration) => migration.nom === nom)) {
      problemes.push(
        `${nom} est enregistrée en base mais son fichier a disparu de db/migrations.`,
      );
    }
  }

  return problemes;
}

async function appliquer(client: pg.Client, migration: Migration): Promise<number> {
  const debut = Date.now();

  await client.query("BEGIN");
  try {
    // Verrou consultatif de transaction : deux déploiements simultanés ne
    // peuvent pas appliquer la même migration en même temps. Version « xact »
    // et non « session » : le pooler en mode transaction ne conserve aucun état
    // de session entre deux requêtes.
    await client.query("SELECT pg_advisory_xact_lock($1)", [hashVerrou(migration.nom)]);
    await client.query(migration.sql);

    const duree = Date.now() - debut;
    await client.query(
      `INSERT INTO ${TABLE_SUIVI} (nom, empreinte, duree_ms) VALUES ($1, $2, $3)`,
      [migration.nom, migration.empreinte, duree],
    );
    await client.query("COMMIT");
    return duree;
  } catch (cause) {
    await client.query("ROLLBACK");
    throw cause;
  }
}

/** Empreinte stable d'un nom de migration, sur 63 bits (limite de bigint signé). */
function hashVerrou(nom: string): string {
  const digest = createHash("sha256").update(nom).digest();
  return (digest.readBigUInt64BE(0) >> 1n).toString();
}

async function principal(): Promise<void> {
  const { values } = parseArgs({
    options: { statut: { type: "boolean", default: false } },
    allowPositionals: false,
  });

  const diagnostic = diagnostiquerConnexion(env.DATABASE_URL, env.DATABASE_SSL);
  ecrire(`Base : ${diagnostic.hote ?? "?"}:${diagnostic.port ?? "?"}`);
  for (const avertissement of diagnostic.avertissements) {
    ecrire(`  /!\\ ${avertissement}`);
  }
  ecrire();

  const migrations = lireMigrations();
  if (migrations.length === 0) {
    ecrire("Aucune migration dans db/migrations.");
    return;
  }

  const client = new pg.Client({
    connectionString: env.DATABASE_URL,
    ssl: optionsTls(env.DATABASE_SSL),
    connectionTimeoutMillis: 10_000,
    application_name: "bizly-migrate",
  });

  await client.connect();

  try {
    await assurerTableSuivi(client);
    const appliquees = await lireAppliquees(client);

    const problemes = verifierEmpreintes(migrations, appliquees);
    if (problemes.length > 0) {
      ecrire("MIGRATIONS INCOHÉRENTES :");
      for (const probleme of problemes) ecrire(`  - ${probleme}`);
      process.exitCode = 1;
      return;
    }

    const enAttente = migrations.filter((migration) => !appliquees.has(migration.nom));

    if (values.statut === true) {
      ecrire("État des migrations :");
      for (const migration of migrations) {
        const faite = appliquees.get(migration.nom);
        ecrire(
          faite
            ? `  [x] ${migration.nom}  (${faite.applique_le.toISOString()})`
            : `  [ ] ${migration.nom}`,
        );
      }
      ecrire();
      ecrire(`${appliquees.size} appliquée(s), ${enAttente.length} en attente.`);
      return;
    }

    if (enAttente.length === 0) {
      ecrire(`Base à jour — ${appliquees.size} migration(s) déjà appliquée(s).`);
      return;
    }

    for (const migration of enAttente) {
      SORTIE.write(`  → ${migration.nom} ... `);
      const duree = await appliquer(client, migration);
      ecrire(`ok (${duree} ms)`);
    }

    ecrire();
    ecrire(`${enAttente.length} migration(s) appliquée(s).`);
  } finally {
    await client.end();
  }
}

principal().catch((cause: unknown) => {
  ecrire();
  ecrire("ÉCHEC DE LA MIGRATION");
  ecrire(cause instanceof Error ? cause.message : String(cause));
  process.exitCode = 1;
});
