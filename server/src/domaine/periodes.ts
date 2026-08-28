import {
  DateInvalide,
  debutDeJourLocal,
  finDeJourLocal,
  jourLocal,
  type DateLocale,
} from "./temps.js";

/**
 * Périodes d'analyse — `docs/MOTEUR-ANALYTICS.md` §3.
 *
 * Une période est TOUJOURS un intervalle `[debut, fin[` : début inclus, fin
 * exclue. Cela supprime d'un coup la classe de bugs « la vente de 23 h 59 le 31
 * est-elle dans le mois ? ».
 *
 * Les bornes sont calculées dans le fuseau de l'entreprise, puis exprimées en
 * UTC pour interroger la base.
 */

export const CLES_PERIODE = [
  "jour",
  "semaine",
  "mois",
  "trimestre",
  "annee",
  "personnalisee",
] as const;
export type ClePeriode = (typeof CLES_PERIODE)[number];

export type Periode = {
  cle: ClePeriode;
  debut: Date;
  /** Exclue. */
  fin: Date;
  debut_local: DateLocale;
  /** Dernier jour **inclus**, pour l'affichage : `fin` moins un jour. */
  fin_local: DateLocale;
  fuseau: string;
  en_cours: boolean;
};

export type Comparaison = {
  debut: Date;
  fin: Date;
  debut_local: DateLocale;
  fin_local: DateLocale;
  /** Vrai quand la fenêtre a été tronquée pour coller à la période en cours. */
  a_date: boolean;
};

const MS_PAR_JOUR = 24 * 60 * 60 * 1000;
/** Au-delà, l'écran est illisible bien avant que la base ne peine. */
export const DUREE_MAX_JOURS = 3 * 366;

// ---------------------------------------------------------------------------
// Arithmétique de jours locaux
// ---------------------------------------------------------------------------

/**
 * Ajoute des jours à une date locale.
 *
 * Passe par midi et non par minuit : lors d'un changement d'heure, minuit + 24 h
 * peut retomber sur le jour même ou sauter le suivant. Midi laisse douze heures
 * de marge de chaque côté, largement au-delà du décalage d'une heure.
 */
export function ajouterJoursLocal(date: DateLocale, jours: number, fuseau: string): DateLocale {
  const midi = new Date(debutDeJourLocal(date, fuseau).getTime() + 12 * 60 * 60 * 1000);
  return jourLocal(new Date(midi.getTime() + jours * MS_PAR_JOUR), fuseau);
}

/** Nombre de jours locaux entre deux dates, `fin` **incluse**. */
export function joursEntre(debut: DateLocale, fin: DateLocale, fuseau: string): number {
  const a = debutDeJourLocal(debut, fuseau).getTime();
  const b = debutDeJourLocal(fin, fuseau).getTime();
  // Arrondi : une journée de 23 h ou 25 h ne doit pas produire 0,96 ou 1,04.
  return Math.round((b - a) / MS_PAR_JOUR) + 1;
}

/** Décompose une date locale en `[année, mois, jour]`. */
function pieces(date: DateLocale): [number, number, number] {
  const [a = "0", m = "0", j = "0"] = date.split("-");
  return [Number(a), Number(m), Number(j)];
}

function formater(annee: number, mois: number, jour: number): DateLocale {
  return `${String(annee).padStart(4, "0")}-${String(mois).padStart(2, "0")}-${String(jour).padStart(2, "0")}`;
}

/** Jour de la semaine, 1 = lundi … 7 = dimanche (ISO 8601). */
export function jourDeSemaine(date: DateLocale, fuseau: string): number {
  const instant = new Date(debutDeJourLocal(date, fuseau).getTime() + 12 * 60 * 60 * 1000);
  const nom = new Intl.DateTimeFormat("en-US", { timeZone: fuseau, weekday: "short" }).format(instant);
  const table: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return table[nom] ?? 1;
}

// ---------------------------------------------------------------------------
// Construction des périodes
// ---------------------------------------------------------------------------

/** Premier jour de la période nommée qui **contient** `reference`. */
function premierJour(cle: Exclude<ClePeriode, "personnalisee">, reference: DateLocale, fuseau: string): DateLocale {
  const [annee, mois, jour] = pieces(reference);

  switch (cle) {
    case "jour":
      return reference;
    case "semaine": {
      // Semaine ISO : du lundi au dimanche.
      const decalage = jourDeSemaine(reference, fuseau) - 1;
      return ajouterJoursLocal(reference, -decalage, fuseau);
    }
    case "mois":
      return formater(annee, mois, 1);
    case "trimestre":
      return formater(annee, Math.floor((mois - 1) / 3) * 3 + 1, 1);
    case "annee":
      return formater(annee, 1, 1);
  }
  // Inatteignable : `jour` est exhaustif sur le type.
  return reference;
}

/** Premier jour de la période SUIVANTE — la borne haute exclusive. */
function premierJourSuivant(
  cle: Exclude<ClePeriode, "personnalisee">,
  debut: DateLocale,
  fuseau: string,
): DateLocale {
  const [annee, mois] = pieces(debut);

  switch (cle) {
    case "jour":
      return ajouterJoursLocal(debut, 1, fuseau);
    case "semaine":
      return ajouterJoursLocal(debut, 7, fuseau);
    case "mois":
      // Calendaire, jamais « +30 jours » : février contre janvier serait faussé
      // de trois jours, soit environ 10 % de CA d'écart artificiel.
      return mois === 12 ? formater(annee + 1, 1, 1) : formater(annee, mois + 1, 1);
    case "trimestre":
      return mois > 9 ? formater(annee + 1, 1, 1) : formater(annee, mois + 3, 1);
    case "annee":
      return formater(annee + 1, 1, 1);
  }
  return debut;
}

export type DemandePeriode = {
  cle: ClePeriode;
  /** Date locale contenue dans la période. Par défaut : aujourd'hui. */
  reference?: DateLocale | undefined;
  du?: DateLocale | undefined;
  au?: DateLocale | undefined;
};

export class PeriodeInvalide extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PeriodeInvalide";
  }
}

/**
 * Construit la période demandée.
 *
 * `maintenant` est **injecté** : le moteur ne lit jamais l'horloge lui-même,
 * c'est ce qui rend les cas de référence reproductibles.
 */
export function construirePeriode(
  demande: DemandePeriode,
  fuseau: string,
  maintenant: Date,
): Periode {
  const aujourdhui = jourLocal(maintenant, fuseau);

  let debutLocal: DateLocale;
  let finLocaleExclue: DateLocale;

  if (demande.cle === "personnalisee") {
    if (demande.du === undefined || demande.au === undefined) {
      throw new PeriodeInvalide("Une période personnalisée demande une date de début et de fin.");
    }
    // Lève `DateInvalide` sur une date qui n'existe pas (31 février…).
    debutDeJourLocal(demande.du, fuseau);
    debutDeJourLocal(demande.au, fuseau);

    if (demande.du > demande.au) {
      throw new PeriodeInvalide("La date de début est postérieure à la date de fin.");
    }
    debutLocal = demande.du;
    // `au` est inclus côté utilisateur : la borne exclue est le lendemain.
    finLocaleExclue = ajouterJoursLocal(demande.au, 1, fuseau);
  } else {
    const reference = demande.reference ?? aujourdhui;

    // Validée AVANT d'en extraire le mois ou l'année. Sans cela, un
    // `reference=2026-02-31` serait refusé pour `periode=jour` mais accepté
    // pour `periode=mois`, où seuls l'année et le mois sont lus : le même
    // paramètre fautif se comporterait différemment selon la granularité.
    debutDeJourLocal(reference, fuseau);

    debutLocal = premierJour(demande.cle, reference, fuseau);
    finLocaleExclue = premierJourSuivant(demande.cle, debutLocal, fuseau);
  }

  const debut = debutDeJourLocal(debutLocal, fuseau);
  const instant = maintenant.getTime();
  const enCours =
    instant >= debut.getTime() && instant < debutDeJourLocal(finLocaleExclue, fuseau).getTime();

  /**
   * Une période **ancrée au calendrier** encore en cours s'arrête à aujourd'hui,
   * pas à la fin du mois : « ce mois » vaut le mois **à date**.
   *
   * Sans cette troncature, la série journalière traînerait des jours futurs à
   * zéro et l'en-tête annoncerait « du 1er au 31 août » un 8 août — deux
   * façons de faire croire à une chute d'activité qui n'existe pas.
   *
   * Une période **personnalisée** n'est jamais tronquée : l'utilisateur a
   * choisi ses bornes, on ne les corrige pas dans son dos.
   */
  if (enCours && demande.cle !== "personnalisee") {
    finLocaleExclue = ajouterJoursLocal(aujourdhui, 1, fuseau);
  }

  const fin = debutDeJourLocal(finLocaleExclue, fuseau);
  const finLocale = ajouterJoursLocal(finLocaleExclue, -1, fuseau);

  const duree = joursEntre(debutLocal, finLocale, fuseau);
  if (duree > DUREE_MAX_JOURS) {
    throw new PeriodeInvalide(`La période ne peut pas dépasser ${DUREE_MAX_JOURS} jours.`);
  }

  return {
    cle: demande.cle,
    debut,
    fin,
    debut_local: debutLocal,
    fin_local: finLocale,
    fuseau,
    en_cours: enCours,
  };
}

/**
 * Période de comparaison.
 *
 * Période **terminée** : la précédente, entière et calendaire.
 *
 * Période **en cours** : la précédente tronquée au même nombre de jours écoulés
 * — le 8 du mois, on compare au 1–8 du mois d'avant. Comparer 8 jours à 31
 * afficherait mécaniquement −74 %, un chiffre faux ; et un indicateur qui ment
 * une fois n'est plus jamais consulté (`MOTEUR-ANALYTICS.md` §3.5).
 */
export function construireComparaison(periode: Periode, maintenant: Date): Comparaison {
  const { fuseau } = periode;

  let debutPrecedentLocal: DateLocale;
  let finPrecedenteExclue: DateLocale;

  if (periode.cle === "personnalisee") {
    // Les N jours immédiatement antérieurs.
    const duree = joursEntre(periode.debut_local, periode.fin_local, fuseau);
    finPrecedenteExclue = periode.debut_local;
    debutPrecedentLocal = ajouterJoursLocal(periode.debut_local, -duree, fuseau);
  } else {
    finPrecedenteExclue = periode.debut_local;
    debutPrecedentLocal = premierJourPrecedent(periode.cle, periode.debut_local, fuseau);
  }

  let finComparaisonExclue = finPrecedenteExclue;
  let aDate = false;

  if (periode.en_cours) {
    const aujourdhui = jourLocal(maintenant, fuseau);
    const joursEcoules = joursEntre(periode.debut_local, aujourdhui, fuseau);
    const candidate = ajouterJoursLocal(debutPrecedentLocal, joursEcoules, fuseau);

    // Bornée à la fin de la période précédente : 31 jours courus en mars ne
    // doivent pas déborder de février sur janvier.
    finComparaisonExclue = candidate < finPrecedenteExclue ? candidate : finPrecedenteExclue;
    aDate = finComparaisonExclue < finPrecedenteExclue;
  }

  return {
    debut: debutDeJourLocal(debutPrecedentLocal, fuseau),
    fin: debutDeJourLocal(finComparaisonExclue, fuseau),
    debut_local: debutPrecedentLocal,
    fin_local: ajouterJoursLocal(finComparaisonExclue, -1, fuseau),
    a_date: aDate,
  };
}

function premierJourPrecedent(
  cle: Exclude<ClePeriode, "personnalisee">,
  debut: DateLocale,
  fuseau: string,
): DateLocale {
  const [annee, mois] = pieces(debut);

  switch (cle) {
    case "jour":
      return ajouterJoursLocal(debut, -1, fuseau);
    case "semaine":
      return ajouterJoursLocal(debut, -7, fuseau);
    case "mois":
      return mois === 1 ? formater(annee - 1, 12, 1) : formater(annee, mois - 1, 1);
    case "trimestre":
      return mois <= 3 ? formater(annee - 1, 10, 1) : formater(annee, mois - 3, 1);
    case "annee":
      return formater(annee - 1, 1, 1);
  }
  return debut;
}

/** Tous les jours locaux d'une période, bornes comprises. */
export function joursDe(periode: Periode): DateLocale[] {
  const jours: DateLocale[] = [];
  let courant = periode.debut_local;

  // Garde-fou : la durée est déjà bornée à `DUREE_MAX_JOURS` en amont.
  for (let i = 0; i <= DUREE_MAX_JOURS; i += 1) {
    jours.push(courant);
    if (courant >= periode.fin_local) break;
    courant = ajouterJoursLocal(courant, 1, fuseauDe(periode));
  }

  return jours;
}

function fuseauDe(periode: Periode): string {
  return periode.fuseau;
}

export { DateInvalide, finDeJourLocal };
