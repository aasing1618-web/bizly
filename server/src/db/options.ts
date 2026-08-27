/**
 * Résolution des options de connexion Postgres.
 *
 * Module PUR (aucun import de `pg`, aucune lecture d'environnement) pour être
 * testable sans base : c'est ici que se jouent deux erreurs de configuration
 * classiques et coûteuses — TLS désactivé par facilité, et connexion directe
 * (5432) au lieu du pooler (6543).
 */

export type ModeTls = "require" | "no-verify" | "disable";

export type OptionsTls = false | { rejectUnauthorized: boolean };

/** Traduit le mode TLS déclaré en configuration `ssl` de node-postgres. */
export function optionsTls(mode: ModeTls): OptionsTls {
  switch (mode) {
    case "disable":
      return false;
    case "no-verify":
      return { rejectUnauthorized: false };
    case "require":
      return { rejectUnauthorized: true };
  }
}

export type DiagnosticConnexion = {
  /** Hôte extrait de l'URL, sans identifiants. Sûr à journaliser. */
  hote: string | null;
  port: number | null;
  /** Vrai si la chaîne pointe bien vers le pooler Supabase en port 6543. */
  estPoolerSupabase: boolean;
  /** Avertissements à journaliser au démarrage. Jamais d'identifiant dedans. */
  avertissements: string[];
};

/**
 * Analyse une chaîne de connexion SANS jamais exposer le mot de passe.
 *
 * L'architecture Bizly impose le pooler Supabase en port 6543 (mode
 * transaction) : le port 5432 ouvre une connexion directe, dont le nombre est
 * très limité et qui sature dès quelques instances déployées.
 */
export function diagnostiquerConnexion(
  chaine: string,
  mode: ModeTls,
): DiagnosticConnexion {
  const avertissements: string[] = [];
  let hote: string | null = null;
  let port: number | null = null;

  try {
    const url = new URL(chaine);
    hote = url.hostname || null;
    port = url.port ? Number(url.port) : 5432;
  } catch {
    avertissements.push(
      "DATABASE_URL n'est pas une URL valide (format attendu : postgresql://…).",
    );
  }

  const estPoolerSupabase =
    hote !== null && hote.includes("pooler.supabase.com") && port === 6543;

  if (port !== null && port !== 6543) {
    avertissements.push(
      `DATABASE_URL utilise le port ${port}. L'architecture impose le pooler ` +
        "Supabase en port 6543 (mode transaction) — voir CLAUDE.md §2.",
    );
  }

  if (hote !== null && !hote.includes("pooler.supabase.com")) {
    avertissements.push(
      `L'hôte « ${hote} » ne ressemble pas au pooler Supabase ` +
        "(attendu : *.pooler.supabase.com).",
    );
  }

  if (mode === "disable") {
    avertissements.push(
      "DATABASE_SSL=disable : la connexion à la base n'est PAS chiffrée. " +
        "Inacceptable hors test local.",
    );
  }

  if (mode === "no-verify") {
    avertissements.push(
      "DATABASE_SSL=no-verify : le certificat du serveur n'est pas vérifié. " +
        "Mode dépannage — à ne pas laisser en production.",
    );
  }

  return { hote, port, estPoolerSupabase, avertissements };
}

/**
 * Le pooler Supabase en mode transaction ne conserve pas l'état de session
 * entre deux requêtes. Ces limites sont structurelles, pas contournables :
 * elles sont rappelées ici pour que le code écrit plus tard s'y conforme.
 */
export const LIMITES_POOLER_TRANSACTION = [
  "pas de requêtes préparées NOMMÉES (node-postgres ne doit jamais recevoir l'option `name`)",
  "pas de LISTEN / NOTIFY",
  "pas de SET au niveau session (utiliser SET LOCAL dans une transaction)",
  "pas de curseurs persistants entre requêtes",
] as const;
