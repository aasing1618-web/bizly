import {
  formaterMontant,
  formaterPourcent,
  LIBELLES_JOUR_SEMAINE,
  type Devise,
  type ElementClassement,
  type Question,
} from "@bizly/shared";

/**
 * Reformulation en français d'une réponse déjà calculée.
 *
 * `CLAUDE.md` §6 : « question sélectionnée → calcul en backend → résultat
 * structuré → **reformulation optionnelle par l'IA** → réponse ». Cette couche
 * occupe la place de la reformulation, **sans appeler d'IA**.
 *
 * Pourquoi sans IA, alors que le contrat de `GEMINI.md` la prévoit :
 *
 * - la garantie « aucune valeur numérique qui ne soit déjà dans l'entrée »
 *   devient vraie **par construction**, pas seulement vérifiée après coup par un
 *   test. Une phrase produite ici ne PEUT pas contenir un chiffre inventé ;
 * - aucune clé d'API, aucun coût par requête, aucune latence réseau, aucune
 *   dépendance à un service tiers pour afficher une phrase ;
 * - le résultat est **déterministe** : deux chargements de la même page donnent
 *   exactement le même texte.
 *
 * L'appel à Gemini reste possible plus tard (`CLAUDE.md` §13 : « IA avancée »).
 * Il viendrait **en plus** de cette couche, pas à sa place : ces phrases restent
 * le repli quand l'API est indisponible.
 */

/** Rend la valeur d'un élément de classement dans son unité. */
function valeur(element: ElementClassement, devise: Devise): string {
  switch (element.unite) {
    case "montant":
      return formaterMontant(element.valeur, devise);
    case "pourcent":
      return formaterPourcent(element.valeur, { signe: false });
    case "jours":
      return `${element.valeur} jours`;
    case "quantite":
      return `${new Intl.NumberFormat("fr-FR").format(element.valeur)} unité${
        element.valeur > 1 ? "s" : ""
      }`;
  }
}

/** « Awa Diop », « Pull et Sac », « A, B et C ». */
function enumerer(libelles: string[]): string {
  if (libelles.length <= 1) return libelles[0] ?? "";
  return `${libelles.slice(0, -1).join(", ")} et ${libelles[libelles.length - 1]}`;
}

/** Évolution en une locution : « en hausse de 12,5 % », « stable ». */
function evolution(question: Question, devise: Devise): string | null {
  const indicateur = question.indicateur;
  if (indicateur === undefined) return null;
  if (indicateur.base_nulle) return null;

  if (indicateur.evolution_pourcent !== null) {
    if (indicateur.evolution_pourcent === 0) return "stable par rapport à la période précédente";
    const sens = indicateur.evolution_pourcent > 0 ? "en hausse de" : "en baisse de";
    return `${sens} ${formaterPourcent(Math.abs(indicateur.evolution_pourcent), { signe: false })}`;
  }

  // Le signe a été traversé : seul l'écart en montant reste lisible (§3.5).
  if (indicateur.evolution_montant !== null) {
    const sens = indicateur.evolution_montant >= 0 ? "en hausse de" : "en baisse de";
    return `${sens} ${formaterMontant(Math.abs(indicateur.evolution_montant), devise)}`;
  }

  return null;
}

const complementDe = (question: Question, index: number): number | undefined =>
  question.complements?.[index]?.valeur;

/**
 * Formule la réponse à une question.
 *
 * Quand la question est indisponible, la phrase **est** la raison : c'est déjà
 * une explication en français, il n'y a rien à reformuler par-dessus.
 */
export function formuler(question: Question, devise: Devise): string {
  if (!question.disponible) return question.raison ?? "Donnée indisponible.";

  const evo = evolution(question, devise);
  const premier = question.classement?.[0];
  const exAequo = (question.classement ?? []).filter((element) => element.ex_aequo === true);

  switch (question.id) {
    case "combien_ai_je_gagne": {
      const montant = formaterMontant(question.indicateur?.valeur ?? 0, devise);
      if (question.indicateur?.base_nulle === true) {
        return `Vous avez encaissé ${montant} sur la période. C'est votre première période avec des ventes, il n'y a rien à quoi comparer.`;
      }
      return `Vous avez encaissé ${montant} sur la période, ${evo ?? "sans comparaison disponible"}.`;
    }

    case "benefice_estime": {
      const montant = question.indicateur?.valeur ?? 0;
      const etat =
        montant < 0
          ? "Vous êtes en déficit sur cette période"
          : montant === 0
            ? "Vous êtes à l'équilibre sur cette période"
            : "Vous êtes bénéficiaire sur cette période";
      return `${etat} : ${formaterMontant(montant, devise)}${evo === null ? "" : `, ${evo}`}. Ce montant est votre chiffre d'affaires moins vos dépenses ; il ne tient pas compte du coût de revient de vos produits.`;
    }

    case "depenses_augmentent": {
      const pourcent = question.indicateur?.evolution_pourcent;
      if (question.indicateur?.base_nulle === true) {
        return `Vous avez dépensé ${formaterMontant(question.indicateur.valeur ?? 0, devise)}. Aucune dépense sur la période précédente, il n'y a pas d'évolution à mesurer.`;
      }
      if (pourcent === null || pourcent === undefined) {
        return `Vos dépenses s'élèvent à ${formaterMontant(question.indicateur?.valeur ?? 0, devise)}.`;
      }
      const verdict = pourcent > 0 ? "Oui" : pourcent < 0 ? "Non, elles baissent" : "Non, elles sont stables";
      return `${verdict} : ${formaterMontant(question.indicateur?.valeur ?? 0, devise)} de dépenses, ${evo}.`;
    }

    case "ventes_progressent": {
      const actuel = complementDe(question, 0) ?? 0;
      const precedent = complementDe(question, 1) ?? 0;
      const sens =
        actuel > precedent ? "Oui" : actuel < precedent ? "Non, elles reculent" : "Elles se maintiennent";
      return `${sens} : ${actuel} vente${actuel > 1 ? "s" : ""} contre ${precedent} sur la période précédente, pour ${formaterMontant(question.indicateur?.valeur ?? 0, devise)}${evo === null ? "" : ` (${evo})`}.`;
    }

    case "panier_moyen": {
      const montant = formaterMontant(question.indicateur?.valeur ?? 0, devise);
      if (question.indicateur?.base_nulle === true) {
        return `Votre panier moyen est de ${montant}. Pas de période précédente à laquelle le comparer.`;
      }
      return `Votre panier moyen est de ${montant}, ${evo ?? "sans comparaison disponible"}.`;
    }

    case "ou_je_depense_le_plus": {
      if (premier === undefined) return "Aucune dépense à répartir.";
      const part =
        premier.part_dixiemes === undefined
          ? ""
          : `, soit ${formaterPourcent(premier.part_dixiemes, { signe: false })} du total`;
      const suite =
        question.classement !== undefined && question.classement.length > 1
          ? ` Viennent ensuite ${enumerer(
              question.classement.slice(1, 3).map((e) => `${e.libelle} (${valeur(e, devise)})`),
            )}.`
          : "";
      return `Votre premier poste de dépense est ${premier.libelle}, avec ${valeur(premier, devise)}${part}.${suite}`;
    }

    case "produit_le_plus_vendu": {
      if (premier === undefined) return "Aucun produit vendu.";
      if (exAequo.length > 1) {
        return `${enumerer(exAequo.map((e) => e.libelle))} sont à égalité en tête, avec ${valeur(premier, devise)} chacun.`;
      }
      return `${premier.libelle} est ce que vous vendez le plus, avec ${valeur(premier, devise)}.`;
    }

    case "produit_le_plus_de_ca": {
      if (premier === undefined) return "Aucun produit vendu.";
      const horsCatalogue = complementDe(question, 0);
      const reserve =
        horsCatalogue === undefined
          ? ""
          : ` À noter : ${formaterMontant(horsCatalogue, devise)} de ventes ne sont rattachées à aucun produit du catalogue et n'entrent pas dans ce classement.`;
      return `${premier.libelle} rapporte le plus, avec ${valeur(premier, devise)}.${reserve}`;
    }

    case "produit_le_plus_rentable": {
      if (premier === undefined) return "Aucun produit avec un coût renseigné.";
      const margeGlobale = complementDe(question, 0);
      const exclus = complementDe(question, 1) ?? 0;
      const phraseMarge =
        margeGlobale === undefined
          ? ""
          : ` Sur l'ensemble de la période, votre marge est de ${formaterMontant(margeGlobale, devise)}.`;
      const phraseExclus =
        exclus > 0
          ? ` ${exclus} produit${exclus > 1 ? "s sont exclus" : " est exclu"} de ce calcul, faute de coût de revient renseigné.`
          : "";
      return `${premier.libelle} est le plus rentable, avec ${valeur(premier, devise)} de marge.${phraseMarge}${phraseExclus}`;
    }

    case "produits_les_moins_vendus": {
      if (premier === undefined) return "Aucun produit vendu.";
      if ((question.classement ?? []).length > 1) {
        return `${enumerer((question.classement ?? []).map((e) => e.libelle))} se vendent le moins, avec ${valeur(premier, devise)} chacun.`;
      }
      return `${premier.libelle} est ce qui se vend le moins, avec ${valeur(premier, devise)}.`;
    }

    case "categorie_la_plus_rentable": {
      if (premier === undefined) return "Aucune catégorie renseignée.";
      const part =
        premier.part_dixiemes === undefined
          ? ""
          : `, soit ${formaterPourcent(premier.part_dixiemes, { signe: false })} de votre chiffre d'affaires`;
      return `La catégorie ${premier.libelle} rapporte le plus, avec ${valeur(premier, devise)}${part}.`;
    }

    case "meilleurs_clients": {
      if (premier === undefined) return "Aucune vente rattachée à un client.";
      const suite =
        question.classement !== undefined && question.classement.length > 1
          ? ` Suivent ${enumerer(
              question.classement.slice(1, 3).map((e) => `${e.libelle} (${valeur(e, devise)})`),
            )}.`
          : "";
      return `Votre meilleur client est ${premier.libelle}, avec ${valeur(premier, devise)}.${suite}`;
    }

    case "combien_de_clients": {
      const total = complementDe(question, 0) ?? 0;
      const nouveaux = complementDe(question, 1) ?? 0;
      if (total === 0) return "Vous n'avez encore enregistré aucun client.";
      const phraseNouveaux =
        nouveaux === 0
          ? " Aucun nouveau sur la période."
          : ` Dont ${nouveaux} nouveau${nouveaux > 1 ? "x" : ""} sur la période.`;
      return `Vous avez ${total} client${total > 1 ? "s" : ""} enregistré${total > 1 ? "s" : ""}.${phraseNouveaux}`;
    }

    case "clients_inactifs": {
      const inactifs = question.classement ?? [];
      if (inactifs.length === 0) return "Aucun client inactif : tous ont acheté récemment.";
      const noms = enumerer(inactifs.slice(0, 3).map((e) => `${e.libelle} (${valeur(e, devise)})`));
      return `${inactifs.length} client${inactifs.length > 1 ? "s n'ont" : " n'a"} pas acheté récemment : ${noms}.`;
    }
  }
}

/**
 * Extrait les nombres d'un texte français, sous forme normalisée.
 *
 * Sert au garde-fou de `GEMINI.md` : « un test doit vérifier que le texte
 * généré ne contient pas de nombre absent du JSON d'entrée ».
 */
export function nombresDuTexte(texte: string): string[] {
  const trouves = texte.match(/\d[\d   ]*(?:,\d+)?/g) ?? [];
  return trouves.map((brut) => brut.replace(/[  \s]/g, "").replace(/,$/, ""));
}

/** Libellé d'un jour de la semaine, réexporté pour les formulations à venir. */
export { LIBELLES_JOUR_SEMAINE };
