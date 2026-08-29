import { estReponseErreur } from "@bizly/shared";

/**
 * Client HTTP de l'application.
 *
 * Une seule origine : pas d'URL de base, pas de CORS, et le cookie de session
 * part tout seul avec chaque requête — le jeton n'est jamais manipulé par ce
 * code, puisqu'il est `HttpOnly`.
 */

export type ChampInvalide = { champ: string; message: string };

/** Erreur portant le code stable de l'API, exploitable par l'interface. */
export class ErreurApiClient extends Error {
  readonly code: string;
  readonly statut: number;
  readonly champs: ChampInvalide[];
  /**
   * Le bloc `details` complet de la réponse.
   *
   * Certaines erreurs y joignent de quoi construire un message utile — les
   * volumes enregistrés d'un refus de changement de devise, par exemple
   * (docs/API-CONTRACT.md §8.2). Ne garder que `champs` les jetterait.
   */
  readonly details: Record<string, unknown>;

  constructor(
    statut: number,
    code: string,
    message: string,
    champs: ChampInvalide[] = [],
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ErreurApiClient";
    this.statut = statut;
    this.code = code;
    this.champs = champs;
    this.details = details;
  }

  /** Message associé à un champ précis, pour l'afficher sous le bon input. */
  messagePour(champ: string): string | undefined {
    return this.champs.find((c) => c.champ === champ)?.message;
  }
}

export type OptionsAppel = {
  methode?: "GET" | "POST" | "PATCH" | "DELETE";
  corps?: unknown;
  signal?: AbortSignal;
};

export async function appelApi<T>(chemin: string, options: OptionsAppel = {}): Promise<T> {
  const { methode = "GET", corps, signal } = options;

  let reponse: Response;
  try {
    reponse = await fetch(`/api${chemin}`, {
      method: methode,
      headers: corps === undefined ? {} : { "Content-Type": "application/json" },
      body: corps === undefined ? null : JSON.stringify(corps),
      ...(signal === undefined ? {} : { signal }),
    });
  } catch (cause) {
    // Coupure réseau ou serveur injoignable : pas de réponse HTTP du tout.
    // On produit quand même une ErreurApiClient pour que l'appelant n'ait
    // qu'un seul type d'erreur à traiter.
    if (signal?.aborted === true) throw cause;
    throw new ErreurApiClient(0, "RESEAU", "Impossible de joindre le serveur. Vérifiez votre connexion.");
  }

  if (reponse.status === 204) return undefined as T;

  const texte = await reponse.text();
  let charge: unknown = null;
  if (texte !== "") {
    try {
      charge = JSON.parse(texte);
    } catch {
      charge = null;
    }
  }

  if (!reponse.ok) {
    if (estReponseErreur(charge)) {
      const details = charge.erreur.details ?? {};
      throw new ErreurApiClient(
        reponse.status,
        charge.erreur.code,
        charge.erreur.message,
        (details as { champs?: ChampInvalide[] }).champs ?? [],
        details,
      );
    }
    // Réponse d'erreur qui ne suit pas le contrat : ne jamais afficher du HTML
    // brut à l'utilisateur.
    throw new ErreurApiClient(reponse.status, "ERREUR_INTERNE", "Une erreur inattendue est survenue.");
  }

  return charge as T;
}
