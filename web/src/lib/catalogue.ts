import type {
  Client,
  CorpsCreationClient,
  CorpsCreationProduit,
  CorpsModificationClient,
  CorpsModificationProduit,
  FiltresCatalogue,
  Page,
  Produit,
} from "@bizly/shared";
import { appelApi } from "./api";

function versRequete(filtres: FiltresCatalogue): string {
  const parametres = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(filtres)) {
    if (valeur !== undefined && valeur !== "") parametres.set(cle, String(valeur));
  }
  const chaine = parametres.toString();
  return chaine === "" ? "" : `?${chaine}`;
}

export const apiProduits = {
  lister: (filtres: FiltresCatalogue = {}) =>
    appelApi<Page<Produit>>(`/produits${versRequete(filtres)}`),
  creer: (corps: CorpsCreationProduit) =>
    appelApi<Produit>("/produits", { methode: "POST", corps }),
  modifier: (id: string, corps: CorpsModificationProduit) =>
    appelApi<Produit>(`/produits/${id}`, { methode: "PATCH", corps }),
  supprimer: (id: string) => appelApi<void>(`/produits/${id}`, { methode: "DELETE" }),
};

export const apiClients = {
  lister: (filtres: FiltresCatalogue = {}) =>
    appelApi<Page<Client>>(`/clients${versRequete(filtres)}`),
  creer: (corps: CorpsCreationClient) => appelApi<Client>("/clients", { methode: "POST", corps }),
  modifier: (id: string, corps: CorpsModificationClient) =>
    appelApi<Client>(`/clients/${id}`, { methode: "PATCH", corps }),
  supprimer: (id: string) => appelApi<void>(`/clients/${id}`, { methode: "DELETE" }),
};
