/**
 * Journalisation.
 *
 * Une ligne JSON par événement : lisible par un humain en développement,
 * exploitable par n'importe quel agrégateur de logs en production, sans
 * dépendance supplémentaire.
 *
 * Rien de sensible ne doit passer ici : ni mot de passe, ni token de session,
 * ni chaîne de connexion, ni contenu de `.env`.
 */

export type NiveauJournal = "debug" | "info" | "avertissement" | "erreur" | "silence";

const ORDRE: Record<NiveauJournal, number> = {
  debug: 10,
  info: 20,
  avertissement: 30,
  erreur: 40,
  // « silence » n'est jamais un niveau d'écriture : c'est un seuil, qui muselle
  // complètement le journal. Utilisé par les tests qui provoquent des erreurs
  // volontaires.
  silence: 100,
};

let niveauMinimum: NiveauJournal = "info";

export function definirNiveauJournal(niveau: NiveauJournal): void {
  niveauMinimum = niveau;
}

function ecrire(niveau: NiveauJournal, message: string, contexte?: Record<string, unknown>): void {
  if (ORDRE[niveau] < ORDRE[niveauMinimum]) return;

  const ligne = JSON.stringify({
    horodatage: new Date().toISOString(),
    niveau,
    message,
    ...contexte,
  });

  if (niveau === "erreur") process.stderr.write(`${ligne}\n`);
  else process.stdout.write(`${ligne}\n`);
}

export const journal = {
  debug: (message: string, contexte?: Record<string, unknown>) => ecrire("debug", message, contexte),
  info: (message: string, contexte?: Record<string, unknown>) => ecrire("info", message, contexte),
  avertissement: (message: string, contexte?: Record<string, unknown>) =>
    ecrire("avertissement", message, contexte),
  erreur: (message: string, contexte?: Record<string, unknown>) => ecrire("erreur", message, contexte),
};

/**
 * Réduit une exception inconnue à des champs journalisables.
 * `catch (e: unknown)` ne garantit pas une `Error` : un `throw "oups"` est légal.
 */
export function detaillerErreur(cause: unknown): Record<string, unknown> {
  if (cause instanceof Error) {
    return {
      erreur_nom: cause.name,
      erreur_message: cause.message,
      erreur_pile: cause.stack,
    };
  }
  return { erreur_message: String(cause) };
}
