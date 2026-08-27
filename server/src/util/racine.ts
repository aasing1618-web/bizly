import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Retrouve la racine du dépôt en remontant l'arborescence.
 *
 * Nécessaire parce que le code tourne depuis deux endroits différents :
 * `server/src/...` via tsx en développement, `server/dist/...` après build.
 * Un chemin relatif en dur casserait dans l'un des deux cas.
 *
 * Marqueur : un dossier contenant à la fois `package.json` et `db/migrations`.
 */
export function trouverRacineDepot(depart = fileURLToPath(import.meta.url)): string {
  let dossier = path.dirname(depart);

  for (let i = 0; i < 12; i += 1) {
    const aPackage = existsSync(path.join(dossier, "package.json"));
    const aMigrations = existsSync(path.join(dossier, "db", "migrations"));
    if (aPackage && aMigrations) return dossier;

    const parent = path.dirname(dossier);
    if (parent === dossier) break;
    dossier = parent;
  }

  throw new Error(
    "Racine du dépôt Bizly introuvable : aucun dossier parent ne contient " +
      "à la fois package.json et db/migrations.",
  );
}
