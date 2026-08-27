import { MONTANT_MAX_SUR } from "@bizly/shared";

/**
 * Arithmétique monétaire — implémentation de référence de
 * docs/MOTEUR-ANALYTICS.md §2.
 *
 * Ce module vit CÔTÉ SERVEUR uniquement : le moteur de calcul ne part jamais
 * dans le navigateur (CLAUDE.md §2). Le client ne reçoit que des résultats.
 *
 * Tout est en `bigint`. Aucun `number` n'entre dans un calcul monétaire : la
 * seule conversion autorisée est `enNombreSur`, à la frontière JSON.
 */

/** Un pourcentage en dixièmes de point : 742 se lit « 74,2 % ». */
export type PourcentDixiemes = number;

const MILLE = 1000n;

/**
 * Divise `a` par `b`, arrondi au plus proche ; à exactement la moitié, on
 * s'éloigne de zéro (arrondi commercial).
 *
 * Entièrement en entiers : aucune division flottante intermédiaire, donc aucun
 * risque que 250,49999999 soit arrondi à 251.
 */
export function divArrondi(a: bigint, b: bigint): bigint {
  if (b === 0n) throw new Error("divArrondi : division par zéro");

  const quotient = a / b; // troncature vers zéro
  const reste = a % b;
  if (reste === 0n) return quotient;

  const resteDouble = (reste < 0n ? -reste : reste) * 2n;
  const diviseurAbsolu = b < 0n ? -b : b;
  if (resteDouble < diviseurAbsolu) return quotient;

  const memeSigne = a < 0n === b < 0n;
  return quotient + (memeSigne ? 1n : -1n);
}

/** Valeur absolue d'un `bigint`. */
export function abs(valeur: bigint): bigint {
  return valeur < 0n ? -valeur : valeur;
}

/**
 * Moyenne d'un total sur un effectif.
 *
 * Rend `null` — et non 0 — quand l'effectif est nul : un panier moyen sans
 * vente n'est pas « zéro euro », il n'est pas calculable
 * (docs/MOTEUR-ANALYTICS.md §5.1).
 */
export function moyenne(total: bigint, effectif: number): bigint | null {
  if (!Number.isInteger(effectif) || effectif <= 0) return null;
  return divArrondi(total, BigInt(effectif));
}

/**
 * Pourcentage `numerateur / denominateur`, en dixièmes de point.
 * `null` si le dénominateur est nul ou négatif.
 */
export function pourcent(numerateur: bigint, denominateur: bigint): PourcentDixiemes | null {
  if (denominateur <= 0n) return null;
  return Number(divArrondi(numerateur * MILLE, denominateur));
}

export type Evolution = {
  pourcent: PourcentDixiemes | null;
  /** Vrai quand la période précédente valait 0 : l'évolution n'a pas de sens. */
  base_nulle: boolean;
};

/**
 * Évolution d'une valeur par rapport à la période précédente.
 *
 * Dénominateur en valeur absolue : une perte qui se réduit doit sortir en
 * POSITIF (−1000 → −500, c'est +50 % d'amélioration). Sans la valeur absolue,
 * le tableau de bord annoncerait une dégradation à un client dont la situation
 * s'améliore.
 */
export function evolution(valeur: bigint, precedente: bigint): Evolution {
  if (precedente === 0n) return { pourcent: null, base_nulle: true };
  return { pourcent: pourcent(valeur - precedente, abs(precedente)), base_nulle: false };
}

export type PartRepartition = {
  id: string;
  montant: bigint;
};

/**
 * Répartit 100,0 % (soit 1000 dixièmes) entre des parts, par la méthode du plus
 * fort reste : la somme des parts rendues vaut EXACTEMENT 1000.
 *
 * Trois parts égales donneraient sinon 33,3 + 33,3 + 33,3 = 99,9 %, ce que
 * l'utilisateur repère immédiatement.
 *
 * Départage des ex æquo, déterministe : plus grand reste, puis plus grand
 * montant, puis identifiant croissant. Le déterminisme est indispensable —
 * sinon l'affichage change tout seul d'un rafraîchissement à l'autre.
 */
export function repartirEnDixiemes(parts: readonly PartRepartition[]): Map<string, number> {
  const resultat = new Map<string, number>();

  let total = 0n;
  for (const part of parts) {
    if (part.montant < 0n) {
      throw new Error(`repartirEnDixiemes : montant négatif pour « ${part.id} »`);
    }
    total += part.montant;
  }

  if (total === 0n) {
    for (const part of parts) resultat.set(part.id, 0);
    return resultat;
  }

  const calculees = parts.map((part) => {
    const brut = part.montant * MILLE;
    return { id: part.id, montant: part.montant, base: brut / total, reste: brut % total };
  });

  let distribue = 0n;
  for (const part of calculees) distribue += part.base;

  const ordre = [...calculees].sort((a, b) => {
    if (a.reste !== b.reste) return a.reste > b.reste ? -1 : 1;
    if (a.montant !== b.montant) return a.montant > b.montant ? -1 : 1;
    return a.id.localeCompare(b.id, "en");
  });

  const bonus = new Set<string>();
  let restant = MILLE - distribue;
  for (const part of ordre) {
    if (restant <= 0n) break;
    bonus.add(part.id);
    restant -= 1n;
  }

  for (const part of calculees) {
    resultat.set(part.id, Number(part.base) + (bonus.has(part.id) ? 1 : 0));
  }

  return resultat;
}

/**
 * Convertit un montant `bigint` en `number` pour la sérialisation JSON.
 *
 * Lève au-delà de `Number.MAX_SAFE_INTEGER` plutôt que de rendre un montant
 * silencieusement faux (docs/MOTEUR-ANALYTICS.md §6). La limite représente
 * 90 000 milliards d'euros en centimes : l'atteindre signale un bug, pas un
 * client prospère.
 */
export function enNombreSur(valeur: bigint): number {
  if (abs(valeur) > BigInt(MONTANT_MAX_SUR)) {
    throw new Error(
      `Montant hors des entiers représentables en JSON : ${valeur.toString()}. ` +
        "C'est le signe d'une erreur d'unité (montant déjà converti deux fois ?).",
    );
  }
  return Number(valeur);
}
