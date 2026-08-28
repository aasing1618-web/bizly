import { Router, type Request } from "express";
import { z } from "zod";
import { LIMITE_LISTE_DEFAUT, LIMITE_LISTE_MAX, MONTANT_MAX_SUR } from "@bizly/shared";
import { erreurs } from "../../http/erreurs.js";
import { contexteDe, exigerSession } from "../../http/session.js";
import { analyser } from "../../http/validation.js";
import type { ServiceAuth } from "../auth/service.js";
import { NomDejaPris, versClient, versProduit, type DepotCatalogue } from "./depot.js";

/**
 * Catalogue de produits et fichier clients — `docs/API-CONTRACT.md` §5.
 *
 * Ces deux ressources n'ont pas de logique métier propre : valider, écrire,
 * projeter. Pas de couche service intermédiaire qui ne ferait que transmettre.
 */

export type OptionsRouteurCatalogue = {
  serviceAuth: ServiceAuth;
  depot: DepotCatalogue;
};

const montant = z
  .number()
  .int("Le montant doit être un entier en unité mineure (centimes pour l'euro).")
  .min(0, "Le montant ne peut pas être négatif.")
  .max(MONTANT_MAX_SUR);

const schemaFiltres = z.object({
  limite: z.coerce.number().int().min(1).max(LIMITE_LISTE_MAX).default(LIMITE_LISTE_DEFAUT),
  decalage: z.coerce.number().int().min(0).default(0),
  recherche: z.string().trim().min(1).max(80).optional(),
  categorie: z.string().trim().min(1).max(80).optional(),
});

const schemaCreationProduit = z.object({
  nom: z.string().trim().min(1, "Le nom est requis.").max(160, "Le nom est trop long."),
  categorie: z.string().trim().min(1).max(80).nullable().optional(),
  prix_mineur: montant,
  // `null` explicite = coût non renseigné. Le produit sort alors de tout
  // classement de rentabilité, plutôt que de recevoir une marge inventée.
  cout_mineur: montant.nullable().optional(),
});

const schemaModificationProduit = z
  .object({
    nom: z.string().trim().min(1).max(160).optional(),
    categorie: z.string().trim().min(1).max(80).nullable().optional(),
    prix_mineur: montant.optional(),
    cout_mineur: montant.nullable().optional(),
  })
  .refine((corps) => Object.keys(corps).length > 0, { message: "Aucun champ à modifier." });

const schemaCreationClient = z.object({
  nom: z.string().trim().min(1, "Le nom est requis.").max(160, "Le nom est trop long."),
  email: z.string().trim().max(254).nullable().optional(),
  telephone: z.string().trim().max(40).nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
});

const schemaModificationClient = z
  .object({
    nom: z.string().trim().min(1).max(160).optional(),
    email: z.string().trim().max(254).nullable().optional(),
    telephone: z.string().trim().max(40).nullable().optional(),
    note: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((corps) => Object.keys(corps).length > 0, { message: "Aucun champ à modifier." });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Un identifiant mal formé donne 404, comme un identifiant d'une autre entreprise. */
function identifiant(requete: Request, quoi: string): string {
  const id = requete.params["id"];
  if (typeof id !== "string" || !UUID.test(id)) throw erreurs.introuvable(quoi);
  return id;
}

export function creerRouteurCatalogue(options: OptionsRouteurCatalogue): Router {
  const { serviceAuth, depot } = options;
  const routeur = Router();
  const protege = exigerSession(serviceAuth);

  const entrepriseDe = (requete: Request): string => contexteDe(requete).entreprise.id;

  // --------------------------------------------------------------- produits --

  routeur.get("/produits", protege, async (requete, reponse) => {
    const filtres = analyser(schemaFiltres, requete.query);
    const page = await depot.listerProduits(entrepriseDe(requete), {
      recherche: filtres.recherche ?? null,
      categorie: filtres.categorie ?? null,
      limite: filtres.limite,
      decalage: filtres.decalage,
    });

    reponse.json({
      elements: page.elements.map(versProduit),
      total: page.total,
      limite: filtres.limite,
      decalage: filtres.decalage,
    });
  });

  routeur.post("/produits", protege, async (requete, reponse) => {
    const corps = analyser(schemaCreationProduit, requete.body);

    try {
      const cree = await depot.creerProduit(entrepriseDe(requete), {
        nom: corps.nom,
        categorie: corps.categorie ?? null,
        prix_mineur: BigInt(corps.prix_mineur),
        cout_mineur: corps.cout_mineur === undefined || corps.cout_mineur === null
          ? null
          : BigInt(corps.cout_mineur),
      });
      reponse.status(201).json(versProduit(cree));
    } catch (cause) {
      if (cause instanceof NomDejaPris) {
        throw erreurs.conflit("Un produit porte déjà ce nom.", {
          champs: [{ champ: "nom", message: "Nom déjà utilisé." }],
        });
      }
      throw cause;
    }
  });

  routeur.get("/produits/:id", protege, async (requete, reponse) => {
    const produit = await depot.trouverProduit(entrepriseDe(requete), identifiant(requete, "Produit"));
    if (produit === null) throw erreurs.introuvable("Produit");
    reponse.json(versProduit(produit));
  });

  routeur.patch("/produits/:id", protege, async (requete, reponse) => {
    const corps = analyser(schemaModificationProduit, requete.body);
    const patch: Parameters<DepotCatalogue["modifierProduit"]>[2] = {};

    if (corps.nom !== undefined) patch.nom = corps.nom;
    if (corps.categorie !== undefined) patch.categorie = corps.categorie;
    if (corps.prix_mineur !== undefined) patch.prix_mineur = BigInt(corps.prix_mineur);
    if (corps.cout_mineur !== undefined) {
      patch.cout_mineur = corps.cout_mineur === null ? null : BigInt(corps.cout_mineur);
    }

    try {
      const modifie = await depot.modifierProduit(
        entrepriseDe(requete),
        identifiant(requete, "Produit"),
        patch,
      );
      if (modifie === null) throw erreurs.introuvable("Produit");
      reponse.json(versProduit(modifie));
    } catch (cause) {
      if (cause instanceof NomDejaPris) {
        throw erreurs.conflit("Un produit porte déjà ce nom.", {
          champs: [{ champ: "nom", message: "Nom déjà utilisé." }],
        });
      }
      throw cause;
    }
  });

  routeur.delete("/produits/:id", protege, async (requete, reponse) => {
    const supprime = await depot.supprimerProduit(
      entrepriseDe(requete),
      identifiant(requete, "Produit"),
    );
    if (!supprime) throw erreurs.introuvable("Produit");
    reponse.status(204).end();
  });

  // ---------------------------------------------------------------- clients --

  routeur.get("/clients", protege, async (requete, reponse) => {
    const filtres = analyser(schemaFiltres, requete.query);
    const page = await depot.listerClients(entrepriseDe(requete), {
      recherche: filtres.recherche ?? null,
      categorie: null,
      limite: filtres.limite,
      decalage: filtres.decalage,
    });

    reponse.json({
      elements: page.elements.map(versClient),
      total: page.total,
      limite: filtres.limite,
      decalage: filtres.decalage,
    });
  });

  routeur.post("/clients", protege, async (requete, reponse) => {
    const corps = analyser(schemaCreationClient, requete.body);
    const cree = await depot.creerClient(entrepriseDe(requete), {
      nom: corps.nom,
      email: corps.email ?? null,
      telephone: corps.telephone ?? null,
      note: corps.note ?? null,
    });
    reponse.status(201).json(versClient(cree));
  });

  routeur.get("/clients/:id", protege, async (requete, reponse) => {
    const client = await depot.trouverClient(entrepriseDe(requete), identifiant(requete, "Client"));
    if (client === null) throw erreurs.introuvable("Client");
    reponse.json(versClient(client));
  });

  routeur.patch("/clients/:id", protege, async (requete, reponse) => {
    const corps = analyser(schemaModificationClient, requete.body);
    const patch: Parameters<DepotCatalogue["modifierClient"]>[2] = {};

    if (corps.nom !== undefined) patch.nom = corps.nom;
    if (corps.email !== undefined) patch.email = corps.email;
    if (corps.telephone !== undefined) patch.telephone = corps.telephone;
    if (corps.note !== undefined) patch.note = corps.note;

    const modifie = await depot.modifierClient(
      entrepriseDe(requete),
      identifiant(requete, "Client"),
      patch,
    );
    if (modifie === null) throw erreurs.introuvable("Client");
    reponse.json(versClient(modifie));
  });

  routeur.delete("/clients/:id", protege, async (requete, reponse) => {
    // Suppression douce : les ventes du client gardent leur référence, et
    // l'historique reste juste.
    const supprime = await depot.supprimerClient(
      entrepriseDe(requete),
      identifiant(requete, "Client"),
    );
    if (!supprime) throw erreurs.introuvable("Client");
    reponse.status(204).end();
  });

  return routeur;
}
