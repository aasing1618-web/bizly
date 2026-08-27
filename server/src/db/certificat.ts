import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Charge le certificat racine à faire confiance pour la connexion Postgres.
 *
 * Supabase signe le certificat du pooler avec sa propre autorité
 * (« Supabase Root 2021 CA »), absente du magasin de Node. Ce fichier est
 * PUBLIC : il n'a rien d'un secret, il peut vivre dans le dépôt.
 *
 * Le télécharger : Dashboard Supabase → Project Settings → Database →
 * SSL Configuration → « Download certificate ».
 *
 * @param chemin  valeur de DATABASE_CA_CERT, absolue ou relative à la racine
 * @param racine  racine du dépôt
 */
export function chargerCertificatCa(
  chemin: string | undefined,
  racine: string,
): string | undefined {
  if (chemin === undefined || chemin.trim() === "") return undefined;

  const cheminComplet = path.isAbsolute(chemin) ? chemin : path.join(racine, chemin);

  if (!existsSync(cheminComplet)) {
    throw new Error(
      `Certificat introuvable : ${cheminComplet}\n` +
        "DATABASE_CA_CERT pointe vers un fichier qui n'existe pas. " +
        "Le télécharger depuis Supabase → Project Settings → Database → SSL Configuration.",
    );
  }

  const contenu = readFileSync(cheminComplet, "utf8");

  if (!contenu.includes("BEGIN CERTIFICATE")) {
    throw new Error(
      `Le fichier ${cheminComplet} n'est pas un certificat PEM ` +
        "(le contenu attendu commence par « -----BEGIN CERTIFICATE----- »).",
    );
  }

  return contenu;
}
