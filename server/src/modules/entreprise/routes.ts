import { Router } from "express";
import { z } from "zod";
import { paysParCode, type VolumesEnregistres } from "@bizly/shared";
import { fuseauValide } from "../../domaine/temps.js";
import { lireCookieSession } from "../../http/cookies.js";
import { ErreurApi, erreurs } from "../../http/erreurs.js";
import { cleUtilisateur, creerLimiteur } from "../../http/limiteur.js";
import { contexteDe, exigerRole, exigerSession } from "../../http/session.js";
import { analyser } from "../../http/validation.js";
import type { DepotAuth } from "../auth/depot.js";
import { empreinteJeton } from "../auth/jetons.js";
import { hacherMotDePasse, verifierMotDePasse } from "../auth/motDePasse.js";
import { schemaMotDePasse } from "../auth/validation.js";
import type { ServiceAuth } from "../auth/service.js";
import type { DepotEntreprise } from "./depot.js";

/**
 * Paramètres de l'entreprise et du compte — docs/API-CONTRACT.md §8.
 */

export type OptionsRouteurEntreprise = {
  serviceAuth: ServiceAuth;
  depot: DepotEntreprise;
  /** Pour valider secteur et devise contre les référentiels de la base. */
  depotAuth: DepotAuth;
};

/** Changer son mot de passe est un geste rare : cinq essais par heure suffisent. */
const LIMITE_MOT_DE_PASSE = { maximum: 5, fenetreMs: 60 * 60 * 1000 };

const schemaModificationEntreprise = z
  .object({
    nom: z.string().trim().min(1, "Le nom de l'entreprise est requis.").max(120).optional(),
    secteur: z.string().trim().min(1).max(40).optional(),
    pays: z.string().trim().toUpperCase().length(2).nullable().optional(),
    devise: z.string().trim().toUpperCase().length(3).optional(),
    fuseau: z.string().trim().min(1).max(64).optional(),
  })
  // `strict` : envoyer `plan` ou `statut` doit produire une erreur visible, pas
  // un champ ignoré en silence — sinon le client croirait avoir changé de plan
  // (docs/API-CONTRACT.md §8.1).
  .strict("Ce champ ne se modifie pas ici.")
  .refine((corps) => Object.keys(corps).length > 0, { message: "Aucun champ à modifier." });

const schemaModificationProfil = z.object({
  nom: z.string().trim().min(1, "Le nom est requis.").max(120, "Le nom est trop long."),
});

const schemaChangementMotDePasse = z
  .object({
    ancien: z.string().min(1, "Le mot de passe actuel est requis."),
    nouveau: schemaMotDePasse,
  })
  .refine((corps) => corps.ancien !== corps.nouveau, {
    message: "Le nouveau mot de passe doit être différent de l'ancien.",
    path: ["nouveau"],
  });

/** « 12 ventes, 5 dépenses et 4 produits », sans les catégories vides. */
export function decrireVolumes(volumes: VolumesEnregistres): string {
  const morceaux: string[] = [];
  if (volumes.ventes > 0) morceaux.push(`${volumes.ventes} vente${volumes.ventes > 1 ? "s" : ""}`);
  if (volumes.depenses > 0) {
    morceaux.push(`${volumes.depenses} dépense${volumes.depenses > 1 ? "s" : ""}`);
  }
  if (volumes.produits > 0) {
    morceaux.push(`${volumes.produits} produit${volumes.produits > 1 ? "s" : ""}`);
  }

  const dernier = morceaux[morceaux.length - 1];
  if (dernier === undefined) return "aucune donnée";
  if (morceaux.length === 1) return dernier;
  return `${morceaux.slice(0, -1).join(", ")} et ${dernier}`;
}

export function creerRouteurEntreprise(options: OptionsRouteurEntreprise): Router {
  const { serviceAuth, depot, depotAuth } = options;
  const routeur = Router();
  const protege = exigerSession(serviceAuth);
  const limiteMotDePasse = creerLimiteur(LIMITE_MOT_DE_PASSE);

  routeur.patch("/entreprise", protege, exigerRole("PROPRIETAIRE"), async (requete, reponse) => {
    const corps = analyser(schemaModificationEntreprise, requete.body);
    const { entreprise } = contexteDe(requete);

    if (corps.secteur !== undefined && !(await depotAuth.secteurExiste(corps.secteur))) {
      throw erreurs.validation("Ce secteur d'activité n'existe pas.", {
        champs: [{ champ: "secteur", message: "Secteur inconnu." }],
      });
    }

    if (corps.pays !== undefined && corps.pays !== null && paysParCode(corps.pays) === null) {
      throw erreurs.validation("Ce pays n'est pas pris en charge.", {
        champs: [{ champ: "pays", message: "Pays inconnu." }],
      });
    }

    // Le fuseau est validé ici ET par un trigger Postgres. Doublon assumé :
    // sans ce contrôle, un fuseau inconnu remonterait en 500 depuis la base au
    // lieu d'un 400 qui désigne le champ fautif.
    if (corps.fuseau !== undefined && !fuseauValide(corps.fuseau)) {
      throw erreurs.validation("Ce fuseau horaire n'existe pas.", {
        champs: [{ champ: "fuseau", message: "Fuseau inconnu." }],
      });
    }

    if (corps.devise !== undefined && corps.devise !== entreprise.devise.code) {
      if (!(await depotAuth.deviseExiste(corps.devise))) {
        throw erreurs.validation("Cette devise n'est pas prise en charge.", {
          champs: [{ champ: "devise", message: "Devise inconnue." }],
        });
      }

      // Les montants sont stockés en unité mineure : changer la devise les
      // réinterpréterait sans les convertir (docs/API-CONTRACT.md §8.2).
      const volumes = await depot.compterVolumes(entreprise.id);
      const total = volumes.ventes + volumes.depenses + volumes.produits;

      if (total > 0) {
        throw erreurs.conflit(
          `La devise ne peut plus changer : ${decrireVolumes(volumes)} ` +
            `${total > 1 ? "sont enregistrés" : "est enregistré"} en ${entreprise.devise.code}. ` +
            `Changer la devise réinterpréterait ces montants sans les convertir.`,
          {
            volumes,
            champs: [{ champ: "devise", message: "Des montants sont déjà enregistrés." }],
          },
        );
      }
    }

    const patch: Parameters<DepotEntreprise["modifierEntreprise"]>[1] = {};
    if (corps.nom !== undefined) patch.nom = corps.nom;
    if (corps.secteur !== undefined) patch.secteur = corps.secteur;
    if (corps.pays !== undefined) patch.pays = corps.pays;
    if (corps.devise !== undefined) patch.devise = corps.devise;
    if (corps.fuseau !== undefined) patch.fuseau = corps.fuseau;

    const modifiee = await depot.modifierEntreprise(entreprise.id, patch);
    if (modifiee === null) throw erreurs.introuvable("Entreprise");
    reponse.json(modifiee);
  });

  routeur.patch("/moi", protege, async (requete, reponse) => {
    const corps = analyser(schemaModificationProfil, requete.body);
    const { utilisateur } = contexteDe(requete);

    const modifie = await depot.modifierProfil(utilisateur.id, corps.nom);
    if (modifie === null) throw erreurs.introuvable("Utilisateur");
    reponse.json(modifie);
  });

  routeur.post("/mot-de-passe", protege, async (requete, reponse) => {
    const { utilisateur } = contexteDe(requete);
    if (!limiteMotDePasse.autoriser(cleUtilisateur(utilisateur.id))) {
      throw erreurs.tropDeRequetes();
    }

    const corps = analyser(schemaChangementMotDePasse, requete.body);

    const empreinteActuelle = await depot.lireEmpreinteMotDePasse(utilisateur.id);
    if (empreinteActuelle === null) throw erreurs.introuvable("Utilisateur");

    if (!(await verifierMotDePasse(corps.ancien, empreinteActuelle))) {
      // Même code qu'à la connexion : il n'y a rien de plus à révéler à
      // quelqu'un qui détient déjà une session valide.
      throw new ErreurApi(401, "IDENTIFIANTS_INVALIDES", "Le mot de passe actuel est incorrect.", {
        champs: [{ champ: "ancien", message: "Mot de passe incorrect." }],
      });
    }

    // La session courante est conservée, toutes les autres tombent : on change
    // son mot de passe quand on se croit compromis, et laisser les autres
    // sessions ouvertes viderait le geste de son sens.
    const jetonCourant = lireCookieSession(requete);
    if (jetonCourant === null) throw erreurs.nonAuthentifie();

    await depot.changerMotDePasse(
      utilisateur.id,
      await hacherMotDePasse(corps.nouveau),
      empreinteJeton(jetonCourant),
    );

    limiteMotDePasse.reinitialiser(cleUtilisateur(utilisateur.id));
    reponse.status(204).end();
  });

  return routeur;
}
