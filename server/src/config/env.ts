import { existsSync } from "node:fs";
import path from "node:path";
import { config as chargerFichierEnv } from "dotenv";
import { z } from "zod";
import { trouverRacineDepot } from "../util/racine.js";

/**
 * Chargement et validation de l'environnement.
 *
 * Le processus refuse de démarrer si une variable obligatoire manque ou est
 * malformée. Un serveur qui démarre à moitié configuré échoue plus tard, sur
 * une requête utilisateur, avec un message incompréhensible : mieux vaut un
 * arrêt immédiat et explicite.
 */

export const RACINE_DEPOT = trouverRacineDepot();

const fichierEnv = path.join(RACINE_DEPOT, ".env");
if (existsSync(fichierEnv)) {
  chargerFichierEnv({ path: fichierEnv });
}

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z
    .string()
    .min(1, "obligatoire — chaîne du pooler Supabase (port 6543), voir .env.example"),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  DATABASE_SSL: z.enum(["require", "no-verify", "disable"]).default("require"),
  // Certificat racine PUBLIC de Supabase, sans quoi une vérification stricte
  // échoue : la chaîne du pooler est signée par une autorité privée.
  //
  // `preprocess` traite une valeur vide comme absente : dans un fichier `.env`,
  // laisser « CLE= » est la façon normale de ne pas renseigner une option, et
  // cela ne doit pas empêcher le serveur de démarrer.
  DATABASE_CA_CERT: z.preprocess(
    (valeur) => (typeof valeur === "string" && valeur.trim() === "" ? undefined : valeur),
    z.string().trim().min(1).default("db/supabase-root-2021-ca.crt"),
  ),
});

export type Env = z.infer<typeof schema>;

/**
 * Valide l'environnement fourni. Séparé de la lecture de `process.env` pour
 * rester testable.
 */
export function lireEnv(source: Record<string, string | undefined>): Env {
  const resultat = schema.safeParse(source);

  if (!resultat.success) {
    const lignes = resultat.error.issues.map(
      (probleme) => `  - ${probleme.path.join(".") || "(racine)"} : ${probleme.message}`,
    );
    throw new Error(
      ["Configuration invalide — le serveur ne peut pas démarrer :", ...lignes, "", `Fichier attendu : ${fichierEnv}`, "Modèle : .env.example"].join(
        "\n",
      ),
    );
  }

  return resultat.data;
}

/**
 * Une erreur de configuration n'est pas un bug : afficher une pile d'appels
 * n'aide personne et noie le seul message utile. On sort proprement, avec la
 * marche à suivre.
 */
function lireEnvOuSortir(): Env {
  try {
    return lireEnv(process.env);
  } catch (cause) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    process.stderr.write(`\n${msg}\n\n`);
    if (process.env["VERCEL"]) {
      throw cause instanceof Error ? cause : new Error(msg);
    }
    process.exit(1);
  }
}

export const env: Env = lireEnvOuSortir();

export const enProduction = env.NODE_ENV === "production";
