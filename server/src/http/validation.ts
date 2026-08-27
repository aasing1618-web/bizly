import type { ZodError, ZodTypeAny, output } from "zod";
import { erreurs } from "./erreurs.js";

/**
 * Passerelle entre zod et la forme d'erreur de l'API.
 *
 * Vit dans `http/` et non dans un module métier : ventes, dépenses et
 * authentification s'en servent toutes, et aucune n'a à piocher dans les
 * internes d'une autre.
 */

/** Traduit une erreur zod en `details` exploitables par le client. */
export function detailsValidation(erreur: ZodError): Record<string, unknown> {
  return {
    champs: erreur.issues.map((probleme) => ({
      champ: probleme.path.join("."),
      message: probleme.message,
    })),
  };
}

/** Premier message lisible, pour un affichage direct. */
export function premierMessage(erreur: ZodError): string {
  return erreur.issues[0]?.message ?? "Les données envoyées sont invalides.";
}

/**
 * Valide une entrée, ou lève un `400 VALIDATION` portant le champ fautif.
 *
 * Le type rendu est celui de **sortie** du schéma : après un `.default()`,
 * `limite` est un `number` garanti et non un `number | undefined`. Se tromper
 * de côté ici rendrait tous les défauts optionnels pour le reste du code.
 *
 * La validation intervient **avant** toute requête en base : un corps malformé
 * ne consomme pas de connexion Postgres et n'atteint jamais une requête SQL.
 */
export function analyser<S extends ZodTypeAny>(schema: S, valeur: unknown): output<S> {
  const resultat = schema.safeParse(valeur);

  if (!resultat.success) {
    throw erreurs.validation(premierMessage(resultat.error), detailsValidation(resultat.error));
  }

  return resultat.data;
}
