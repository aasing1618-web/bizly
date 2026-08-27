import {
  CATEGORIE_NON_CATEGORISE,
  LIBELLES_JOUR_SEMAINE,
  LIBELLES_MOYEN_PAIEMENT,
  PAIEMENT_NON_PRECISE,
  type BlocKpi,
  type Devise,
  type Indicateur,
  type MeilleurJourSemaine,
  type MoyenPaiement,
  type PartRepartition,
  type PointSerie,
  type ProduitVendu,
  type ReponseTableauDeBord,
} from "@bizly/shared";
import { abs, divArrondi, enNombreSur, moyenne, pourcent, repartirEnDixiemes } from "./montant.js";
import { jourDeSemaine, joursDe, type Comparaison, type Periode } from "./periodes.js";
import { jourLocal } from "./temps.js";

/**
 * Moteur de calcul des KPI — `docs/MOTEUR-ANALYTICS.md` §5.
 *
 * **Fonction pure** : mêmes entrées, mêmes sorties. Elle ne lit ni l'horloge,
 * ni la base, ni l'environnement. C'est exactement ce qui rend les cas de
 * référence du §8 testables au centime, sans Postgres.
 *
 * Le **filtrage** (période, statut, suppression, entreprise) est fait en SQL,
 * qui sait le faire vite. Le **calcul** est fait ici, où il se teste.
 */

export type VenteAgregable = {
  effectuee_le: Date;
  montant_total_mineur: bigint;
  moyen_paiement: MoyenPaiement | null;
};

export type DepenseAgregable = {
  effectuee_le: Date;
  montant_mineur: bigint;
  categorie_id: string | null;
};

export type ProduitAgrege = {
  libelle: string;
  quantite: string;
  montant: bigint;
};

export type EntreesKpi = {
  ventes: VenteAgregable[];
  depenses: DepenseAgregable[];
  ventesPrecedentes: VenteAgregable[];
  depensesPrecedentes: DepenseAgregable[];
  periode: Periode;
  comparaison: Comparaison;
  devise: Devise;
  /** `id → libellé`, pour nommer les parts de la répartition des dépenses. */
  libellesCategories: Map<string, string>;
  /** Agrégat des lignes de vente, déjà fait par la base. */
  topProduits: ProduitAgrege[];
};

function sommeVentes(ventes: VenteAgregable[]): bigint {
  return ventes.reduce((total, vente) => total + vente.montant_total_mineur, 0n);
}

function sommeDepenses(depenses: DepenseAgregable[]): bigint {
  return depenses.reduce((total, depense) => total + depense.montant_mineur, 0n);
}

/**
 * Construit un indicateur monétaire avec son évolution.
 *
 * Dénominateur en valeur absolue : une perte qui se réduit doit sortir en
 * POSITIF. Un bénéfice passant de −1 000 à −500, c'est +50 % d'amélioration ;
 * sans la valeur absolue, le tableau annoncerait une dégradation à un client
 * dont la situation s'améliore.
 */
function indicateur(valeur: bigint, precedente: bigint): Indicateur {
  if (precedente === 0n) {
    return { valeur: enNombreSur(valeur), evolution_pourcent: null, base_nulle: true };
  }
  return {
    valeur: enNombreSur(valeur),
    evolution_pourcent: pourcent(valeur - precedente, abs(precedente)),
    base_nulle: false,
  };
}

/** Même chose pour un effectif (nombre de ventes, de dépenses). */
function indicateurEffectif(valeur: number, precedent: number): Indicateur {
  if (precedent === 0) {
    return { valeur, evolution_pourcent: null, base_nulle: true };
  }
  return {
    valeur,
    evolution_pourcent: pourcent(BigInt(valeur - precedent), BigInt(precedent)),
    base_nulle: false,
  };
}

/**
 * Indicateur qui peut être **non calculable** — une moyenne sans effectif.
 *
 * `null` et non `0` : afficher « 0 € » pour un panier moyen sans vente ferait
 * croire à des ventes à zéro euro (`MOTEUR-ANALYTICS.md` §5.1).
 */
function indicateurMoyenne(
  total: bigint,
  effectif: number,
  totalPrecedent: bigint,
  effectifPrecedent: number,
): Indicateur {
  const valeur = moyenne(total, effectif);
  const precedente = moyenne(totalPrecedent, effectifPrecedent);

  if (valeur === null) return { valeur: null, evolution_pourcent: null, base_nulle: precedente === null };
  if (precedente === null || precedente === 0n) {
    return { valeur: enNombreSur(valeur), evolution_pourcent: null, base_nulle: true };
  }

  return {
    valeur: enNombreSur(valeur),
    evolution_pourcent: pourcent(valeur - precedente, abs(precedente)),
    base_nulle: false,
  };
}

/** Regroupe des montants par clé, puis normalise les parts à 1000 dixièmes. */
function repartition(
  groupes: Map<string, { libelle: string; montant: bigint }>,
): PartRepartition[] {
  const parts = [...groupes.entries()].map(([id, groupe]) => ({ id, montant: groupe.montant }));
  const dixiemes = repartirEnDixiemes(parts);

  return [...groupes.entries()]
    .map(([id, groupe]) => ({
      id,
      libelle: groupe.libelle,
      montant: enNombreSur(groupe.montant),
      part_dixiemes: dixiemes.get(id) ?? 0,
    }))
    // Du plus gros au plus petit ; à montant égal, ordre d'identifiant, pour
    // que deux affichages successifs ne s'inversent jamais.
    .sort((a, b) => (b.montant - a.montant) || a.id.localeCompare(b.id, "fr"));
}

export function calculerKpi(entrees: EntreesKpi): ReponseTableauDeBord {
  const { ventes, depenses, ventesPrecedentes, depensesPrecedentes, periode, devise } = entrees;

  const chiffreAffaires = sommeVentes(ventes);
  const depensesTotales = sommeDepenses(depenses);
  const benefice = chiffreAffaires - depensesTotales;

  const caPrecedent = sommeVentes(ventesPrecedentes);
  const depensesPrecedentesTotal = sommeDepenses(depensesPrecedentes);
  const beneficePrecedent = caPrecedent - depensesPrecedentesTotal;

  const kpi: BlocKpi = {
    chiffre_affaires: indicateur(chiffreAffaires, caPrecedent),
    depenses_totales: indicateur(depensesTotales, depensesPrecedentesTotal),
    benefice: indicateur(benefice, beneficePrecedent),
    nombre_ventes: indicateurEffectif(ventes.length, ventesPrecedentes.length),
    panier_moyen: indicateurMoyenne(
      chiffreAffaires,
      ventes.length,
      caPrecedent,
      ventesPrecedentes.length,
    ),
    nombre_depenses: indicateurEffectif(depenses.length, depensesPrecedentes.length),
    depense_moyenne: indicateurMoyenne(
      depensesTotales,
      depenses.length,
      depensesPrecedentesTotal,
      depensesPrecedentes.length,
    ),
    // `null` si le CA est nul : une marge sur zéro de chiffre d'affaires ne
    // veut rien dire, et 0 % serait un mensonge lisible.
    marge_pourcent: { valeur: pourcent(benefice, chiffreAffaires) },
  };

  return {
    periode: {
      cle: periode.cle,
      debut: periode.debut.toISOString(),
      fin: periode.fin.toISOString(),
      debut_local: periode.debut_local,
      fin_local: periode.fin_local,
      fuseau: periode.fuseau,
      en_cours: periode.en_cours,
    },
    comparaison: {
      debut_local: entrees.comparaison.debut_local,
      fin_local: entrees.comparaison.fin_local,
      a_date: entrees.comparaison.a_date,
    },
    devise,
    kpi,
    serie_ca_par_jour: serieParJour(ventes, periode),
    repartition_depenses: repartitionDepenses(depenses, entrees.libellesCategories),
    ca_par_moyen_paiement: repartitionPaiements(ventes),
    top_produits: entrees.topProduits.map(versProduit),
    meilleur_jour_semaine: meilleurJourSemaine(ventes, periode),
  };
}

/**
 * Série journalière du chiffre d'affaires.
 *
 * **Un point par jour de la période, y compris les jours sans vente** : un
 * graphe à trous ment sur la régularité de l'activité, et laisse croire que la
 * boutique était fermée là où elle n'a simplement rien vendu.
 */
function serieParJour(ventes: VenteAgregable[], periode: Periode): PointSerie[] {
  const totaux = new Map<string, { ca: bigint; nombre: number }>();

  for (const vente of ventes) {
    const jour = jourLocal(vente.effectuee_le, periode.fuseau);
    const courant = totaux.get(jour) ?? { ca: 0n, nombre: 0 };
    totaux.set(jour, {
      ca: courant.ca + vente.montant_total_mineur,
      nombre: courant.nombre + 1,
    });
  }

  return joursDe(periode).map((jour) => {
    const total = totaux.get(jour) ?? { ca: 0n, nombre: 0 };
    return { date_locale: jour, ca: enNombreSur(total.ca), nombre_ventes: total.nombre };
  });
}

function repartitionDepenses(
  depenses: DepenseAgregable[],
  libelles: Map<string, string>,
): PartRepartition[] {
  const groupes = new Map<string, { libelle: string; montant: bigint }>();

  for (const depense of depenses) {
    const id = depense.categorie_id ?? CATEGORIE_NON_CATEGORISE;
    const libelle =
      depense.categorie_id === null
        ? "Non catégorisé"
        : (libelles.get(depense.categorie_id) ?? "Catégorie supprimée");

    const courant = groupes.get(id);
    groupes.set(id, {
      libelle,
      montant: (courant?.montant ?? 0n) + depense.montant_mineur,
    });
  }

  return repartition(groupes);
}

function repartitionPaiements(ventes: VenteAgregable[]): PartRepartition[] {
  const groupes = new Map<string, { libelle: string; montant: bigint }>();

  for (const vente of ventes) {
    const id = vente.moyen_paiement ?? PAIEMENT_NON_PRECISE;
    const libelle =
      vente.moyen_paiement === null ? "Non précisé" : LIBELLES_MOYEN_PAIEMENT[vente.moyen_paiement];

    const courant = groupes.get(id);
    groupes.set(id, { libelle, montant: (courant?.montant ?? 0n) + vente.montant_total_mineur });
  }

  return repartition(groupes);
}

function versProduit(produit: ProduitAgrege): ProduitVendu {
  return {
    libelle: produit.libelle,
    quantite: produit.quantite,
    montant: enNombreSur(produit.montant),
  };
}

/**
 * Jour de la semaine le plus rentable, en **moyenne par occurrence**.
 *
 * Un mois contient 4 ou 5 lundis. Sommer sans diviser avantagerait
 * mécaniquement le jour qui apparaît cinq fois — on désignerait le mauvais jour
 * à un commerçant qui s'en sert pour décider de ses horaires.
 */
function meilleurJourSemaine(ventes: VenteAgregable[], periode: Periode): MeilleurJourSemaine {
  if (ventes.length === 0) return null;

  const totaux = new Map<number, bigint>();
  for (const vente of ventes) {
    const jour = jourDeSemaine(jourLocal(vente.effectuee_le, periode.fuseau), periode.fuseau);
    totaux.set(jour, (totaux.get(jour) ?? 0n) + vente.montant_total_mineur);
  }

  const occurrences = new Map<number, number>();
  for (const jour of joursDe(periode)) {
    const numero = jourDeSemaine(jour, periode.fuseau);
    occurrences.set(numero, (occurrences.get(numero) ?? 0) + 1);
  }

  let meilleur: { jour: number; moyenne: bigint } | null = null;

  for (const [jour, total] of totaux) {
    const nombre = occurrences.get(jour) ?? 1;
    const moyennePar = divArrondi(total, BigInt(nombre));

    // Départage déterministe par numéro de jour : deux appels sur les mêmes
    // données doivent désigner le même jour.
    if (meilleur === null || moyennePar > meilleur.moyenne || (moyennePar === meilleur.moyenne && jour < meilleur.jour)) {
      meilleur = { jour, moyenne: moyennePar };
    }
  }

  if (meilleur === null) return null;

  return {
    jour: meilleur.jour,
    libelle: LIBELLES_JOUR_SEMAINE[meilleur.jour] ?? "",
    ca_moyen: enNombreSur(meilleur.moyenne),
  };
}
