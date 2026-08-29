import { estReponseErreur } from "@bizly/shared";

/**
 * Client HTTP de la console d'administration.
 *
 * Jumeau de `web/src/lib/api.ts`, et **volontairement séparé** : les deux
 * bundles sont indépendants par construction (le code de l'admin ne doit jamais
 * être téléchargé par un client), et les faire dépendre l'un de l'autre
 * annulerait cette séparation pour quatre-vingts lignes. Ce qui est réellement
 * commun — les formes de l'API — vit dans `@bizly/shared`.
 */

export type ChampInvalide = { champ: string; message: string };

export class ErreurApiAdmin extends Error {
  readonly code: string;
  readonly statut: number;
  readonly champs: ChampInvalide[];

  constructor(statut: number, code: string, message: string, champs: ChampInvalide[] = []) {
    super(message);
    this.name = "ErreurApiAdmin";
    this.statut = statut;
    this.code = code;
    this.champs = champs;
  }

  messagePour(champ: string): string | undefined {
    return this.champs.find((candidat) => candidat.champ === champ)?.message;
  }
}

export type OptionsAppel = {
  methode?: "GET" | "POST" | "PATCH" | "DELETE";
  corps?: unknown;
  signal?: AbortSignal;
};

export async function appelAdmin<T>(chemin: string, options: OptionsAppel = {}): Promise<T> {
  const { methode = "GET", corps, signal } = options;

  let reponse: Response;
  try {
    reponse = await fetch(`/api/admin${chemin}`, {
      method: methode,
      headers: corps === undefined ? {} : { "Content-Type": "application/json" },
      body: corps === undefined ? null : JSON.stringify(corps),
      ...(signal === undefined ? {} : { signal }),
    });
  } catch (cause) {
    if (signal?.aborted === true) throw cause;
    throw new ErreurApiAdmin(0, "RESEAU", "Serveur injoignable.");
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
      const details = charge.erreur.details as { champs?: ChampInvalide[] } | undefined;
      throw new ErreurApiAdmin(
        reponse.status,
        charge.erreur.code,
        charge.erreur.message,
        details?.champs ?? [],
      );
    }
    throw new ErreurApiAdmin(reponse.status, "ERREUR_INTERNE", "Erreur inattendue.");
  }

  return charge as T;
}
