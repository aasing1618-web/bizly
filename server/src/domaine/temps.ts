/**
 * Temps et fuseaux horaires.
 *
 * Tout Bizly stocke des instants UTC, mais raisonne en **jours locaux de
 * l'entreprise** : une vente du 15 mai est du 15 mai pour le commerçant, quelle
 * que soit l'heure UTC correspondante. Ce module fait le pont, et il le fait
 * seul — aucune autre partie du code ne doit manipuler de décalage horaire.
 *
 * Aucune dépendance : `Intl` connaît la base de données des fuseaux, y compris
 * les changements d'heure passés et à venir. Ajouter une bibliothèque de dates
 * n'apporterait rien ici.
 */

/** `YYYY-MM-DD`. */
export type DateLocale = string;

const MOTIF_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export class FuseauInvalide extends Error {
  constructor(fuseau: string) {
    super(`Fuseau horaire inconnu : ${fuseau}`);
    this.name = "FuseauInvalide";
  }
}

export class DateInvalide extends Error {
  constructor(valeur: string) {
    super(`Date illisible : ${valeur}`);
    this.name = "DateInvalide";
  }
}

/**
 * Décalage du fuseau par rapport à UTC, en minutes, **à un instant donné**.
 *
 * C'est bien « à un instant donné » qui compte : Paris est à +60 en janvier et
 * +120 en juillet. Un décalage figé décalerait la moitié de l'année.
 */
export function decalageMinutes(instant: Date, fuseau: string): number {
  let parties: Intl.DateTimeFormatPart[];
  try {
    parties = new Intl.DateTimeFormat("en-US", {
      timeZone: fuseau,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(instant);
  } catch {
    throw new FuseauInvalide(fuseau);
  }

  const lire = (type: string): number => Number(parties.find((p) => p.type === type)?.value ?? "0");

  // On reconstruit l'heure murale du fuseau comme si elle était UTC : l'écart
  // avec l'instant réel EST le décalage.
  const murale = Date.UTC(
    lire("year"),
    lire("month") - 1,
    lire("day"),
    lire("hour"),
    lire("minute"),
    lire("second"),
  );

  return Math.round((murale - instant.getTime()) / 60_000);
}

/**
 * Instant UTC correspondant à une heure murale dans un fuseau.
 *
 * Deux passes, et c'est nécessaire : on ne connaît le décalage qu'une fois
 * l'instant connu, et l'instant dépend du décalage. La première estimation
 * suffit sauf près d'un changement d'heure, où la seconde corrige.
 */
export function instantDepuisLocal(
  annee: number,
  mois: number,
  jour: number,
  heure = 0,
  minute = 0,
  seconde = 0,
  fuseau = "UTC",
): Date {
  const murale = Date.UTC(annee, mois - 1, jour, heure, minute, seconde);

  const premiere = new Date(murale - decalageMinutes(new Date(murale), fuseau) * 60_000);
  const seconde2 = new Date(murale - decalageMinutes(premiere, fuseau) * 60_000);

  return seconde2;
}

/** Début du jour local (`YYYY-MM-DD` → 00:00:00 dans le fuseau), en UTC. */
export function debutDeJourLocal(date: DateLocale, fuseau: string): Date {
  const correspondance = MOTIF_DATE.exec(date);
  if (correspondance === null) throw new DateInvalide(date);

  const [, anneeBrute = "", moisBrut = "", jourBrut = ""] = correspondance;
  const annee = Number(anneeBrute);
  const mois = Number(moisBrut);
  const jour = Number(jourBrut);

  if (mois < 1 || mois > 12 || jour < 1 || jour > 31) throw new DateInvalide(date);

  const instant = instantDepuisLocal(annee, mois, jour, 0, 0, 0, fuseau);

  // Rattrape le 31 février : `Date.UTC` glisse silencieusement au 3 mars, ce qui
  // enregistrerait une vente à une date que l'utilisateur n'a jamais saisie.
  if (jourLocal(instant, fuseau) !== date) throw new DateInvalide(date);

  return instant;
}

/**
 * Début du jour SUIVANT — la borne haute exclusive d'une journée.
 *
 * Passer par le jour suivant plutôt qu'ajouter 24 h : lors d'un changement
 * d'heure, une journée fait 23 ou 25 heures.
 */
export function finDeJourLocal(date: DateLocale, fuseau: string): Date {
  const debut = debutDeJourLocal(date, fuseau);
  const approximatif = new Date(debut.getTime() + 36 * 60 * 60 * 1000);
  const lendemain = jourLocal(approximatif, fuseau);
  return debutDeJourLocal(lendemain, fuseau);
}

/** Jour local (`YYYY-MM-DD`) auquel appartient un instant, dans un fuseau. */
export function jourLocal(instant: Date, fuseau: string): DateLocale {
  try {
    // `en-CA` produit nativement le format ISO `YYYY-MM-DD`.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: fuseau,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(instant);
  } catch {
    throw new FuseauInvalide(fuseau);
  }
}

/**
 * Interprète ce que le client a envoyé dans `effectuee_le`.
 *
 * - `2026-05-15` → 00:00:00 dans le fuseau de l'entreprise ;
 * - instant ISO complet → tel quel.
 *
 * Un commerçant saisit une date ; une intégration enverra un instant. Les deux
 * doivent marcher, et donner le même jour local à l'arrivée.
 */
export function interpreterDateOperation(valeur: string, fuseau: string): Date {
  const brut = valeur.trim();
  if (brut === "") throw new DateInvalide(valeur);

  if (MOTIF_DATE.test(brut)) return debutDeJourLocal(brut, fuseau);

  const instant = new Date(brut);
  if (Number.isNaN(instant.getTime())) throw new DateInvalide(valeur);
  return instant;
}

/** Vrai si le fuseau est connu du moteur `Intl`. */
export function fuseauValide(fuseau: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: fuseau });
    return true;
  } catch {
    return false;
  }
}
