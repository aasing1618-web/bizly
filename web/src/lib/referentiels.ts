import { useEffect, useState } from "react";
import type { Pays, ReponseReferentiels } from "@bizly/shared";
import { appelApi } from "./api";

/**
 * Devises, secteurs et pays — `GET /api/referentiels`.
 *
 * La liste est mise en cache **pour la durée de la page** : l'écran
 * d'inscription et l'écran Paramètres la demandent tous les deux, et elle ne
 * change pas entre les deux. Le serveur pose déjà `Cache-Control`, ce cache-ci
 * évite en plus l'aller-retour.
 */

let enCache: ReponseReferentiels | null = null;
let enVol: Promise<ReponseReferentiels> | null = null;

export async function chargerReferentiels(signal?: AbortSignal): Promise<ReponseReferentiels> {
  if (enCache !== null) return enCache;

  // Deux composants montés en même temps ne doivent lancer qu'une requête.
  enVol ??= appelApi<ReponseReferentiels>("/referentiels").then((reponse) => {
    enCache = reponse;
    enVol = null;
    return reponse;
  });

  try {
    return await enVol;
  } catch (cause) {
    enVol = null;
    if (signal?.aborted === true) throw cause;
    throw cause;
  }
}

export type EtatReferentiels =
  | { phase: "chargement" }
  | { phase: "prets"; donnees: ReponseReferentiels }
  | { phase: "echec" };

export function useReferentiels(): EtatReferentiels {
  const [etat, setEtat] = useState<EtatReferentiels>(
    enCache === null ? { phase: "chargement" } : { phase: "prets", donnees: enCache },
  );

  useEffect(() => {
    if (etat.phase === "prets") return;

    let vivant = true;
    void chargerReferentiels()
      .then((donnees) => {
        if (vivant) setEtat({ phase: "prets", donnees });
      })
      .catch(() => {
        if (vivant) setEtat({ phase: "echec" });
      });

    return () => {
      vivant = false;
    };
    // Une seule tentative au montage : l'écran affiche un repli si elle échoue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return etat;
}

/**
 * Le fuseau du navigateur, s'il correspond à un pays proposé.
 *
 * Sert à pré-sélectionner le pays sans jamais l'imposer : un commerçant à Dakar
 * ne devrait pas avoir à faire défiler une liste pour trouver le Sénégal.
 */
export function paysProbable(pays: readonly Pays[]): string | null {
  let fuseau: string;
  try {
    fuseau = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return null;
  }

  return pays.find((candidat) => candidat.fuseau === fuseau)?.code ?? null;
}

/**
 * Les fuseaux proposés dans Paramètres.
 *
 * `Intl.supportedValuesOf` donne la liste complète du navigateur — quelque
 * 400 entrées, toutes valides par construction. Un fuseau écrit à la main
 * serait refusé par le serveur ET par un trigger Postgres ; autant ne proposer
 * que des valeurs justes.
 */
export function fuseauxDisponibles(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    // Navigateur ancien : on retombe sur les fuseaux des pays proposés, ce qui
    // couvre la cible sans rien inventer.
    return [];
  }
}
