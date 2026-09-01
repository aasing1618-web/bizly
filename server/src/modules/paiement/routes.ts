import { Router } from "express";
import { z } from "zod";
import { exigerSession } from "../../http/session.js";
import { contexteDe } from "../../http/session.js";
import { detailsValidation, premierMessage } from "../../http/validation.js";
import { erreurs } from "../../http/erreurs.js";
import type { ServiceAuth } from "../auth/service.js";
import type { ServicePaiement } from "./service.js";

/**
 * Routes d'abonnement — côté client.
 *
 * **Volontairement dépourvues de webhook et de route de confirmation.** Les
 * versions précédentes exposaient `POST /api/paiement/webhook` sans vérifier
 * aucune signature, et `POST /api/paiement/simuler-confirmation` permettait à
 * un client d'activer lui-même son propre abonnement. L'un et l'autre
 * offraient un plan payant à qui savait les appeler. Un accès payant ne
 * s'ouvre plus que depuis la console d'administration, authentifiée.
 *
 * Ces routes restent accessibles à une entreprise bloquée : c'est la seule
 * porte qui doit rester ouverte quand toutes les autres se ferment.
 */

export type OptionsRouteurPaiement = {
  serviceAuth: ServiceAuth;
  servicePaiement: ServicePaiement;
};

const schemaDeclarer = z.object({
  reference_wave: z
    .string()
    .trim()
    .min(4, "La référence Wave est requise — elle figure dans votre reçu Wave.")
    .max(80, "Cette référence est trop longue.")
    // Wave affiche des références alphanumériques ; on refuse ce qui n'y
    // ressemble pas plutôt que de stocker un paragraphe.
    .regex(/^[A-Za-z0-9._\-\s]+$/, "La référence ne doit contenir que lettres, chiffres et tirets."),
});

export function creerRouteurPaiement(options: OptionsRouteurPaiement): Router {
  const { serviceAuth, servicePaiement } = options;
  const routeur = Router();
  const protege = exigerSession(serviceAuth);

  routeur.get("/paiement/statut", protege, async (requete, reponse) => {
    reponse.status(200).json(await servicePaiement.statut(contexteDe(requete)));
  });

  routeur.post("/paiement/declarer", protege, async (requete, reponse) => {
    const analyse = schemaDeclarer.safeParse(requete.body);
    if (!analyse.success) {
      throw erreurs.validation(premierMessage(analyse.error), detailsValidation(analyse.error));
    }

    const etat = await servicePaiement.declarer(
      contexteDe(requete),
      analyse.data.reference_wave,
    );
    reponse.status(201).json(etat);
  });

  return routeur;
}
