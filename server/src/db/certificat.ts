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
 * La valeur accepte **deux formes** :
 *
 * - un **chemin** de fichier (local : `db/supabase-root-2021-ca.crt`) ;
 * - le **contenu PEM** lui-même, collé dans la variable d'environnement.
 *
 * La seconde existe pour les hébergeurs sans système de fichiers stable — une
 * fonction sans état n'embarque pas forcément les fichiers non tracés par le
 * compilateur, et une connexion TLS qui échoue au démarrage est difficile à
 * diagnostiquer à distance.
 *
 * @param valeur  valeur de DATABASE_CA_CERT : chemin, ou PEM complet
 * @param racine  racine du dépôt, pour résoudre un chemin relatif
 */
export function chargerCertificatCa(
  valeur: string | undefined,
  racine: string,
): string | undefined {
  if (valeur === undefined || valeur.trim() === "") return undefined;

  // PEM collé directement : on le prend tel quel, sans toucher au disque.
  if (valeur.includes("BEGIN CERTIFICATE")) return valeur.replace(/\\n/g, "\n");

  const chemin = valeur;
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
