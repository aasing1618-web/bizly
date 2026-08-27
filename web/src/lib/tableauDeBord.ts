import type { ClePeriode, ReponseTableauDeBord } from "@bizly/shared";
import { appelApi } from "./api";

export type DemandeTableauDeBord = {
  periode: ClePeriode;
  reference?: string;
  du?: string;
  au?: string;
};

export function chargerTableauDeBord(
  demande: DemandeTableauDeBord,
  signal?: AbortSignal,
): Promise<ReponseTableauDeBord> {
  const parametres = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(demande)) {
    if (valeur !== undefined && valeur !== "") parametres.set(cle, String(valeur));
  }

  return appelApi<ReponseTableauDeBord>(`/tableau-de-bord?${parametres.toString()}`, {
    ...(signal === undefined ? {} : { signal }),
  });
}

/** `2026-05-15` → `15 mai 2026`. */
export function formaterDateLocale(date: string): string {
  const [annee, mois, jour] = date.split("-").map(Number);
  if (annee === undefined || mois === undefined || jour === undefined) return date;

  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(
    new Date(Date.UTC(annee, mois - 1, jour, 12)),
  );
}

/** `2026-05-15` → `15/05`, pour un axe de graphique. */
export function formaterJourCourt(date: string): string {
  const [, mois, jour] = date.split("-");
  return `${jour}/${mois}`;
}
