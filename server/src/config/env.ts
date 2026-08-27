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

export const env: Env = lireEnv(process.env);

export const enProduction = env.NODE_ENV === "production";
