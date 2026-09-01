import { Router, type Request } from "express";
import { erreurs } from "../../http/erreurs.js";
import { analyser } from "../../http/validation.js";
import { exigerSessionActive } from "../../http/abonnement.js";
import { contexteDe, exigerSession } from "../../http/session.js";
import type { ServiceAuth } from "../auth/service.js";
import type { ContexteEntreprise, ServiceOperations } from "./service.js";
import {
  schemaCreationDepense,
  schemaCreationVente,
  schemaFiltres,
  schemaModificationDepense,
  schemaModificationVente,
} from "./validation.js";

/**
 * Routes des ventes et dépenses — docs/API-CONTRACT.md §3.
 *
 * Toutes sont derrière `exigerSession`. L'entreprise vient du contexte de
 * session : aucune route ne lit un `entreprise_id` dans l'URL ou le corps, donc
 * aucune ne peut être détournée vers une autre entreprise.
 */

export type OptionsRouteurOperations = {
  serviceAuth: ServiceAuth;
  serviceOperations: ServiceOperations;
};

/** Contexte d'entreprise, extrait de la session. */
function entrepriseDe(requete: Request): ContexteEntreprise {
  const { entreprise } = contexteDe(requete);
  return { id: entreprise.id, fuseau: entreprise.fuseau, plan: entreprise.plan };
}

/**
 * Un identifiant qui n'est pas un UUID donne **404**, pas 400.
 *
 * C'est délibéré : `/api/ventes/abc` et `/api/ventes/<uuid d'une autre
 * entreprise>` doivent être indistinguables. Répondre 400 sur l'un et 404 sur
 * l'autre indiquerait qu'un identifiant bien formé « existe quelque part ».
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function identifiant(requete: Request, quoi: string): string {
  const id = requete.params["id"];
  if (typeof id !== "string" || !UUID.test(id)) throw erreurs.introuvable(quoi);
  return id;
}

export function creerRouteurOperations(options: OptionsRouteurOperations): Router {
  const { serviceAuth, serviceOperations } = options;
  const routeur = Router();

  // Middleware posé route par route, et NON via `routeur.use(...)` : monté sur
  // le routeur entier, il intercepterait aussi les chemins /api inconnus, qui
  // répondraient 401 au lieu du 404 promis par docs/API-CONTRACT.md §0.
  // Session valide ET abonnement en cours : un essai termine ferme tout le
  // module metier, pas seulement l ecriture (voir http/abonnement.ts).
  const protege = exigerSessionActive(serviceAuth);

  // ---------------------------------------------------------------- ventes --

  routeur.get("/ventes", protege, async (requete, reponse) => {
    const filtres = analyser(schemaFiltres, requete.query);
    reponse.json(await serviceOperations.listerVentes(entrepriseDe(requete), filtres));
  });

  routeur.post("/ventes", protege, async (requete, reponse) => {
    const corps = analyser(schemaCreationVente, requete.body);
    reponse.status(201).json(await serviceOperations.creerVente(entrepriseDe(requete), corps));
  });

  routeur.get("/ventes/:id", protege, async (requete, reponse) => {
    const vente = await serviceOperations.obtenirVente(
      entrepriseDe(requete),
      identifiant(requete, "Vente"),
    );
    reponse.json(vente);
  });

  routeur.patch("/ventes/:id", protege, async (requete, reponse) => {
    const corps = analyser(schemaModificationVente, requete.body);
    const vente = await serviceOperations.modifierVente(
      entrepriseDe(requete),
      identifiant(requete, "Vente"),
      corps,
    );
    reponse.json(vente);
  });

  routeur.delete("/ventes/:id", protege, async (requete, reponse) => {
    await serviceOperations.supprimerVente(entrepriseDe(requete), identifiant(requete, "Vente"));
    reponse.status(204).end();
  });

  // -------------------------------------------------------------- dépenses --

  routeur.get("/depenses", protege, async (requete, reponse) => {
    const filtres = analyser(schemaFiltres, requete.query);
    reponse.json(await serviceOperations.listerDepenses(entrepriseDe(requete), filtres));
  });

  routeur.post("/depenses", protege, async (requete, reponse) => {
    const corps = analyser(schemaCreationDepense, requete.body);
    reponse.status(201).json(await serviceOperations.creerDepense(entrepriseDe(requete), corps));
  });

  routeur.get("/depenses/:id", protege, async (requete, reponse) => {
    const depense = await serviceOperations.obtenirDepense(
      entrepriseDe(requete),
      identifiant(requete, "Dépense"),
    );
    reponse.json(depense);
  });

  routeur.patch("/depenses/:id", protege, async (requete, reponse) => {
    const corps = analyser(schemaModificationDepense, requete.body);
    const depense = await serviceOperations.modifierDepense(
      entrepriseDe(requete),
      identifiant(requete, "Dépense"),
      corps,
    );
    reponse.json(depense);
  });

  routeur.delete("/depenses/:id", protege, async (requete, reponse) => {
    await serviceOperations.supprimerDepense(entrepriseDe(requete), identifiant(requete, "Dépense"));
    reponse.status(204).end();
  });

  // ------------------------------------------------------------ référentiel --

  routeur.get("/categories-depense", protege, async (requete, reponse) => {
    reponse.json(await serviceOperations.listerCategories(entrepriseDe(requete)));
  });

  return routeur;
}
