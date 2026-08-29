import { Router } from "express";
import { DEVISES_RAPIDES, PAYS, type ReponseReferentiels } from "@bizly/shared";
import type { DepotReferentiels } from "./depot.js";

/**
 * `GET /api/referentiels` — docs/API-CONTRACT.md §7.
 *
 * **Volontairement publique** : l'écran d'inscription en a besoin avant qu'un
 * compte n'existe. Elle ne renvoie que du catalogue — devises, secteurs, pays —
 * et aucune donnée d'aucune entreprise.
 */

export type OptionsRouteurReferentiels = {
  depot: DepotReferentiels;
};

export function creerRouteurReferentiels(
  options: OptionsRouteurReferentiels,
): Router {
  const routeur = Router();

  routeur.get("/referentiels", async (_requete, reponse) => {
    const { devises, secteurs } = await options.depot.lister();

    const corps: ReponseReferentiels = {
      devises,
      secteurs,
      pays: [...PAYS],
      devises_rapides: [...DEVISES_RAPIDES],
    };

    // Cette liste change à peine plus souvent qu'une migration : une heure de
    // cache évite de rejouer deux requêtes à chaque ouverture du formulaire.
    reponse.setHeader("Cache-Control", "public, max-age=3600");
    reponse.json(corps);
  });

  return routeur;
}
