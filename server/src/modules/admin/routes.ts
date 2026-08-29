import { Router, type Request, type RequestHandler } from "express";
import { z } from "zod";
import {
  LIMITE_LISTE_DEFAUT,
  LIMITE_LISTE_MAX,
  PLANS,
  type StatistiquesAdmin,
} from "@bizly/shared";
import { effacerCookieAdmin, lireCookieAdmin, poserCookieAdmin } from "../../http/cookies.js";
import { erreurs } from "../../http/erreurs.js";
import { cleEmail, cleIp, type FabriqueLimiteur } from "../../http/limiteur.js";
import { analyser, detailsValidation, premierMessage } from "../../http/validation.js";
import { schemaMotDePasse } from "../auth/validation.js";
import { hacherMotDePasse } from "../auth/motDePasse.js";
import type { MetaRequete } from "../auth/service.js";
import type { DepotAdmin } from "./depot.js";
import type { ContexteAdmin, ServiceAdmin } from "./service.js";

/**
 * Console d'administration — docs/API-CONTRACT.md §9.
 *
 * Aucune route d'inscription : le premier administrateur se crée en ligne de
 * commande (`npm run admin:creer`). Une page d'inscription admin exposée sur
 * Internet serait la porte d'entrée de tout le service.
 */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      contexteAdmin?: ContexteAdmin;
    }
  }
}

export type OptionsRouteurAdmin = {
  service: ServiceAdmin;
  depot: DepotAdmin;
  production: boolean;
  creerLimiteur: FabriqueLimiteur;
};

/**
 * Seuils plus serrés que côté client (§2) : les administrateurs sont peu
 * nombreux et connaissent leur mot de passe. Il n'y a pas de bureau entier
 * derrière une seule IP à ménager.
 */
const LIMITE_ADMIN_EMAIL = { maximum: 5, fenetreMs: 15 * 60 * 1000 };
const LIMITE_ADMIN_IP = { maximum: 20, fenetreMs: 15 * 60 * 1000 };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const schemaConnexion = z.object({
  email: z.string().trim().min(1, "L'adresse e-mail est requise.").max(254),
  mot_de_passe: z.string().min(1, "Le mot de passe est requis.").max(200),
});

const schemaFiltres = z.object({
  recherche: z.string().trim().min(1).max(160).optional(),
  statut: z.enum(["ACTIF", "SUSPENDU"]).optional(),
  plan: z.enum(PLANS).optional(),
  limite: z.coerce.number().int().min(1).max(LIMITE_LISTE_MAX).default(LIMITE_LISTE_DEFAUT),
  decalage: z.coerce.number().int().min(0).default(0),
});

const schemaModification = z
  .object({
    plan: z.enum(PLANS).optional(),
    statut: z.enum(["ACTIF", "SUSPENDU"]).optional(),
    motif_suspension: z.string().trim().min(1).max(500).nullable().optional(),
  })
  .refine((corps) => corps.plan !== undefined || corps.statut !== undefined, {
    message: "Aucun champ à modifier.",
  })
  // Une suspension sans motif est incompréhensible six mois plus tard. La base
  // impose déjà le couple statut / suspendue_le ; l'API impose la raison.
  .refine(
    (corps) =>
      corps.statut !== "SUSPENDU" ||
      (corps.motif_suspension !== undefined &&
        corps.motif_suspension !== null &&
        corps.motif_suspension.length > 0),
    { message: "Une suspension doit être motivée.", path: ["motif_suspension"] },
  );

const schemaReinitialisation = z.object({ mot_de_passe: schemaMotDePasse });

function meta(requete: Request): MetaRequete {
  const agent = requete.get("user-agent");
  return {
    ip: requete.ip ?? null,
    user_agent: agent === undefined ? null : agent.slice(0, 500),
  };
}

function contexteAdminDe(requete: Request): ContexteAdmin {
  const contexte = requete.contexteAdmin;
  if (contexte === undefined) {
    throw new Error("contexteAdminDe() sur une route non protégée : monter exigerAdmin en amont.");
  }
  return contexte;
}

/** Exige une session d'administration valide. */
function exigerAdmin(service: ServiceAdmin): RequestHandler {
  return async (requete, _reponse, suivant) => {
    const contexte = await service.resoudre(lireCookieAdmin(requete));
    if (contexte === null) {
      suivant(erreurs.nonAuthentifie());
      return;
    }
    requete.contexteAdmin = contexte;
    suivant();
  };
}

function identifiant(requete: Request, quoi: string): string {
  const id = requete.params["id"];
  if (typeof id !== "string" || !UUID.test(id)) throw erreurs.introuvable(quoi);
  return id;
}

export function creerRouteurAdmin(options: OptionsRouteurAdmin): Router {
  const { service, depot, production, creerLimiteur } = options;
  const routeur = Router();
  const protege = exigerAdmin(service);

  const limiteEmail = creerLimiteur("admin-email", LIMITE_ADMIN_EMAIL);
  const limiteIp = creerLimiteur("admin-ip", LIMITE_ADMIN_IP);

  // ------------------------------------------------------- authentification --

  routeur.post("/admin/connexion", async (requete, reponse) => {
    const analyse = schemaConnexion.safeParse(requete.body);
    if (!analyse.success) {
      throw erreurs.validation(premierMessage(analyse.error), detailsValidation(analyse.error));
    }

    // Les deux compteurs sont consultés avant de conclure, pour qu'une
    // tentative compte dans chacun.
    const passeIp = await limiteIp.autoriser(cleIp(requete.ip));
    const passeEmail = await limiteEmail.autoriser(cleEmail(analyse.data.email));
    if (!passeIp || !passeEmail) throw erreurs.tropDeRequetes();

    const { admin, jeton } = await service.connecter(analyse.data, meta(requete));
    await limiteEmail.reinitialiser(cleEmail(analyse.data.email));

    poserCookieAdmin(reponse, jeton, { production });
    reponse.status(200).json({ admin });
  });

  routeur.post("/admin/deconnexion", async (requete, reponse) => {
    await service.deconnecter(lireCookieAdmin(requete));
    effacerCookieAdmin(reponse, { production });
    reponse.status(204).end();
  });

  routeur.get("/admin/moi", protege, (requete, reponse) => {
    reponse.json({ admin: contexteAdminDe(requete).admin });
  });

  // ------------------------------------------------------------ entreprises --

  routeur.get("/admin/entreprises", protege, async (requete, reponse) => {
    const filtres = analyser(schemaFiltres, requete.query);
    reponse.json(
      await depot.listerEntreprises({
        recherche: filtres.recherche ?? null,
        statut: filtres.statut ?? null,
        plan: filtres.plan ?? null,
        limite: filtres.limite,
        decalage: filtres.decalage,
      }),
    );
  });

  routeur.get("/admin/entreprises/:id", protege, async (requete, reponse) => {
    const entreprise = await depot.trouverEntreprise(identifiant(requete, "Entreprise"));
    if (entreprise === null) throw erreurs.introuvable("Entreprise");
    reponse.json(entreprise);
  });

  routeur.patch("/admin/entreprises/:id", protege, async (requete, reponse) => {
    const corps = analyser(schemaModification, requete.body);

    const patch: Parameters<DepotAdmin["modifierEntreprise"]>[1] = {};
    if (corps.plan !== undefined) patch.plan = corps.plan;
    if (corps.statut !== undefined) patch.statut = corps.statut;
    if (corps.motif_suspension !== undefined) patch.motif_suspension = corps.motif_suspension;

    const modifiee = await depot.modifierEntreprise(identifiant(requete, "Entreprise"), patch);
    if (modifiee === null) throw erreurs.introuvable("Entreprise");
    reponse.json(modifiee);
  });

  // ----------------------------------------------------------- utilisateurs --

  routeur.post(
    "/admin/utilisateurs/:id/mot-de-passe",
    protege,
    async (requete, reponse) => {
      const corps = analyser(schemaReinitialisation, requete.body);
      const empreinte = await hacherMotDePasse(corps.mot_de_passe);

      const fait = await depot.reinitialiserMotDePasse(
        identifiant(requete, "Utilisateur"),
        empreinte,
      );
      if (!fait) throw erreurs.introuvable("Utilisateur");
      reponse.status(204).end();
    },
  );

  // ----------------------------------------------------------- statistiques --

  routeur.get("/admin/statistiques", protege, async (_requete, reponse) => {
    const brutes = await depot.statistiques();
    const corps: StatistiquesAdmin = brutes;
    reponse.json(corps);
  });

  return routeur;
}
