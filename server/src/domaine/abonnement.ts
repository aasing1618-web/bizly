import { type EtatAcces, type MotifAcces } from "@bizly/shared";

/**
 * Qui a accès à l'application, et jusqu'à quand.
 *
 * Fonction **pure** : mêmes entrées, même sortie, aucune base, aucune horloge
 * implicite. C'est la règle qui décide si un client entre ou voit l'écran de
 * paiement — elle doit être vérifiable au cas près, pas déduite d'un test
 * d'intégration qui passe « en général ».
 *
 * L'ordre des règles est significatif et ne doit pas être réarrangé :
 *
 * 1. **Exemption** d'abord. Les comptes du propriétaire ne sont jamais bloqués,
 *    quelles que soient les dates — sinon une erreur de date le mettrait dehors
 *    de son propre produit, sans personne pour le débloquer.
 * 2. **Abonnement payé** ensuite. Un abonnement valide l'emporte sur un essai
 *    terminé : c'est tout l'intérêt d'avoir payé.
 * 3. **Essai** enfin, puis le blocage.
 */

export type EntreeAcces = {
  /** `entreprises.exempt_facturation`. */
  exempt: boolean;
  /** `entreprises.essai_expire_le`. */
  essaiExpireLe: Date | null;
  /** `entreprises.date_expiration_plan` — fin de l'abonnement payé. */
  abonnementExpireLe: Date | null;
};

const MS_PAR_JOUR = 24 * 60 * 60 * 1000;

/**
 * Jours entiers restants avant une échéance, jamais négatif.
 *
 * Arrondi au **plafond** : à onze heures de l'échéance il reste « 1 jour », pas
 * « 0 ». Annoncer zéro à quelqu'un qui a encore accès serait faux, et
 * l'inciterait à payer une journée trop tôt.
 */
function joursRestants(echeance: Date, maintenant: Date): number {
  const delta = echeance.getTime() - maintenant.getTime();
  return delta <= 0 ? 0 : Math.ceil(delta / MS_PAR_JOUR);
}

/** Vrai si l'échéance est dans le futur. Une date absente n'échoit jamais. */
function encoreValide(echeance: Date | null, maintenant: Date): boolean {
  return echeance !== null && echeance.getTime() > maintenant.getTime();
}

function iso(date: Date | null): string | null {
  return date === null ? null : date.toISOString();
}

export function evaluerAcces(entree: EntreeAcces, maintenant: Date): EtatAcces {
  const { exempt, essaiExpireLe, abonnementExpireLe } = entree;

  const base = {
    essai_expire_le: iso(essaiExpireLe),
    abonnement_expire_le: iso(abonnementExpireLe),
  };

  const ouvert = (motif: MotifAcces, echeance: Date | null): EtatAcces => ({
    ...base,
    bloque: false,
    motif,
    jours_restants: echeance === null ? null : joursRestants(echeance, maintenant),
  });

  if (exempt) return ouvert("EXEMPT", null);

  if (encoreValide(abonnementExpireLe, maintenant)) {
    return ouvert("ABONNE", abonnementExpireLe);
  }

  if (encoreValide(essaiExpireLe, maintenant)) {
    return ouvert("ESSAI", essaiExpireLe);
  }

  // Bloqué. Le motif distingue « votre essai est fini » de « votre abonnement
  // est arrivé à échéance » : ce n'est pas le même message, ni le même client.
  // Une entreprise qui a déjà payé une fois a `abonnementExpireLe` renseigné.
  return {
    ...base,
    bloque: true,
    motif: abonnementExpireLe === null ? "ESSAI_EXPIRE" : "ABONNEMENT_EXPIRE",
    jours_restants: 0,
  };
}

/**
 * Nouvelle échéance après validation d'un paiement.
 *
 * On prolonge à partir de l'échéance en cours quand elle est dans le futur, et
 * non à partir d'aujourd'hui : un client qui paie trois jours en avance ne doit
 * pas perdre ces trois jours. S'il a laissé son abonnement expirer, le compte
 * repart de maintenant — on ne facture pas une période déjà bloquée.
 */
export function prolongerAbonnement(
  echeanceActuelle: Date | null,
  maintenant: Date,
  jours: number,
): Date {
  const depart =
    echeanceActuelle !== null && echeanceActuelle.getTime() > maintenant.getTime()
      ? echeanceActuelle
      : maintenant;

  return new Date(depart.getTime() + jours * MS_PAR_JOUR);
}
