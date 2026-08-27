import type { Pool, PoolClient } from "pg";

/**
 * Exécute un travail dans une transaction, et rend la connexion au pool quoi
 * qu'il arrive.
 *
 * Le `finally` n'est pas décoratif : une connexion non relâchée sur un chemin
 * d'erreur épuise le pool en quelques requêtes, et le symptôme observé est une
 * application qui se fige — sans aucune erreur dans les logs.
 */
export async function dansTransaction<T>(
  pool: Pool,
  travail: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const resultat = await travail(client);
    await client.query("COMMIT");
    return resultat;
  } catch (cause) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // La connexion est déjà morte : le pool la remplacera. L'erreur
      // d'origine reste la seule intéressante, on ne la masque pas.
    }
    throw cause;
  } finally {
    client.release();
  }
}

/** Code SQLSTATE d'une violation de contrainte d'unicité. */
export const VIOLATION_UNICITE = "23505";

/** Vrai si l'erreur est une violation d'unicité, éventuellement sur une contrainte donnée. */
export function estViolationUnicite(cause: unknown, contrainte?: string): boolean {
  if (typeof cause !== "object" || cause === null) return false;
  const erreur = cause as { code?: unknown; constraint?: unknown };
  if (erreur.code !== VIOLATION_UNICITE) return false;
  return contrainte === undefined || erreur.constraint === contrainte;
}
