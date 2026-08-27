import type {
  CategorieDepense,
  CorpsCreationDepense,
  CorpsCreationVente,
  CorpsModificationDepense,
  CorpsModificationVente,
  Depense,
  FiltresListe,
  Page,
  Vente,
  VenteDetaillee,
} from "@bizly/shared";
import { appelApi } from "./api";

/**
 * Appels des routes ventes et dépenses — docs/API-CONTRACT.md §3.
 *
 * Aucune logique métier ici : ni calcul de total, ni conversion de fuseau. Le
 * serveur renvoie déjà `date_locale` et les montants calculés, le client se
 * contente de les afficher.
 */

function versRequete(filtres: FiltresListe): string {
  const parametres = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(filtres)) {
    if (valeur !== undefined && valeur !== "") parametres.set(cle, String(valeur));
  }
  const chaine = parametres.toString();
  return chaine === "" ? "" : `?${chaine}`;
}

export const apiVentes = {
  lister: (filtres: FiltresListe = {}) =>
    appelApi<Page<Vente>>(`/ventes${versRequete(filtres)}`),

  creer: (corps: CorpsCreationVente) =>
    appelApi<VenteDetaillee>("/ventes", { methode: "POST", corps }),

  obtenir: (id: string) => appelApi<VenteDetaillee>(`/ventes/${id}`),

  modifier: (id: string, corps: CorpsModificationVente) =>
    appelApi<VenteDetaillee>(`/ventes/${id}`, { methode: "PATCH", corps }),

  supprimer: (id: string) => appelApi<void>(`/ventes/${id}`, { methode: "DELETE" }),
};

export const apiDepenses = {
  lister: (filtres: FiltresListe = {}) =>
    appelApi<Page<Depense>>(`/depenses${versRequete(filtres)}`),

  creer: (corps: CorpsCreationDepense) =>
    appelApi<Depense>("/depenses", { methode: "POST", corps }),

  modifier: (id: string, corps: CorpsModificationDepense) =>
    appelApi<Depense>(`/depenses/${id}`, { methode: "PATCH", corps }),

  supprimer: (id: string) => appelApi<void>(`/depenses/${id}`, { methode: "DELETE" }),
};

export const apiCategories = {
  lister: () => appelApi<{ elements: CategorieDepense[] }>("/categories-depense"),
};

/** Date du jour au format attendu par `<input type="date">` et par l'API. */
export function aujourdhui(): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
