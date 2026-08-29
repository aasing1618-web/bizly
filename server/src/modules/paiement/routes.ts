import { Router, type Request } from "express";
import { z } from "zod";
import { erreurs } from "../../http/erreurs.js";
import { contexteDe, exigerSession } from "../../http/session.js";
import { analyser } from "../../http/validation.js";
import type { ServiceAuth } from "../auth/service.js";
import { ErreurPaiement, type ServicePaiement } from "./service.js";
import type { DepotPaiement } from "./depot.js";

export type OptionsRouteurPaiement = {
  serviceAuth: ServiceAuth;
  servicePaiement: ServicePaiement;
  depotPaiement: DepotPaiement;
};

const schemaInitialiser = z.object({
  plan: z.enum(["pro", "business"]),
  cycle: z.enum(["mensuel", "annuel"]),
  moyen_paiement: z.enum(["wave", "orange_money"]),
});

const schemaWebhook = z.object({
  reference_transaction: z.string().min(1),
  statut: z.enum(["valide", "echoue"]),
  secret_signature: z.string().optional(),
});

const schemaSimuler = z.object({
  reference_transaction: z.string().min(1),
});

export function creerRouteurPaiement(options: OptionsRouteurPaiement): Router {
  const { serviceAuth, servicePaiement, depotPaiement } = options;
  const routeur = Router();
  const protege = exigerSession(serviceAuth);

  const entrepriseDe = (requete: Request): string => contexteDe(requete).entreprise.id;

  // Initialiser la transaction de paiement (Wave, Orange Money)
  routeur.post("/paiement/initialiser", protege, async (requete, reponse) => {
    const corps = analyser(schemaInitialiser, requete.body);
    try {
      const res = await servicePaiement.initialiserPaiement(entrepriseDe(requete), corps);
      reponse.status(201).json(res);
    } catch (err) {
      if (err instanceof ErreurPaiement) {
        throw erreurs.validation(err.message);
      }
      throw err;
    }
  });

  // Webhook public appelé par la passerelle de paiement
  routeur.post("/paiement/webhook", async (requete, reponse) => {
    const corps = analyser(schemaWebhook, requete.body);
    try {
      const res = await servicePaiement.traiterWebhook({
        reference_transaction: corps.reference_transaction,
        statut: corps.statut,
        ...(corps.secret_signature ? { secret_signature: corps.secret_signature } : {}),
      });
      reponse.json(res);
    } catch (err) {
      if (err instanceof ErreurPaiement) {
        reponse.status(err.codeHttp).json({ erreur: err.message });
        return;
      }
      throw err;
    }
  });

  // Simulation instantanée de confirmation de paiement (Dev / Demo)
  routeur.post("/paiement/simuler-confirmation", protege, async (requete, reponse) => {
    const corps = analyser(schemaSimuler, requete.body);
    try {
      const res = await servicePaiement.simulerConfirmation(entrepriseDe(requete), corps.reference_transaction);
      reponse.json(res);
    } catch (err) {
      if (err instanceof ErreurPaiement) {
        throw erreurs.validation(err.message);
      }
      throw err;
    }
  });

  // Statut de l'abonnement actif
  routeur.get("/paiement/statut", protege, async (requete, reponse) => {
    const entrepriseId = entrepriseDe(requete);
    const abo = await depotPaiement.lireAbonnementActif(entrepriseId);
    const session = contexteDe(requete);

    const dateExpStr = session.entreprise.date_expiration_plan || abo?.expire_le || null;
    const dateExp = dateExpStr ? new Date(dateExpStr) : null;
    const estExpire = dateExp ? dateExp.getTime() < Date.now() : false;

    reponse.json({
      plan: session.entreprise.plan,
      statut_entreprise: session.entreprise.statut,
      date_expiration: dateExpStr,
      est_expire: estExpire,
      est_payant: session.entreprise.plan !== "free",
      dernier_moyen_paiement: abo?.moyen_paiement ?? null,
    });
  });

  return routeur;
}
