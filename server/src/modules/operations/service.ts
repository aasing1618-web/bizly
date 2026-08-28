import type {
  CategorieDepense,
  Depense,
  Page,
  Vente,
  VenteDetaillee,
} from "@bizly/shared";
import { erreurs } from "../../http/erreurs.js";
import {
  analyserQuantite,
  enNombreSur,
  montantLigne,
  quantiteVersTexte,
} from "../../domaine/montant.js";
import {
  DateInvalide,
  debutDeJourLocal,
  finDeJourLocal,
  interpreterDateOperation,
  jourLocal,
} from "../../domaine/temps.js";
import type { DepotCatalogue, LigneProduitDb } from "../catalogue/depot.js";
import type {
  DepotOperations,
  EntreeLigneDb,
  FiltresDepot,
  LigneDepenseDb,
  LigneDetailDb,
  LigneVenteDb,
} from "./depot.js";
import type {
  CreationDepenseValidee,
  CreationVenteValidee,
  FiltresValides,
  ModificationDepenseValidee,
  ModificationVenteValidee,
} from "./validation.js";

/**
 * Logique métier des ventes et dépenses.
 *
 * Trois responsabilités, et rien d'autre :
 *   1. interpréter les dates dans le fuseau de l'entreprise ;
 *   2. calculer les montants de lignes et le total, en entiers ;
 *   3. traduire les lignes de base en formes publiques.
 *
 * L'entreprise est toujours reçue en paramètre, jamais devinée.
 */

export type ContexteEntreprise = {
  id: string;
  fuseau: string;
};

export type ServiceOperations = {
  listerVentes(ctx: ContexteEntreprise, filtres: FiltresValides): Promise<Page<Vente>>;
  obtenirVente(ctx: ContexteEntreprise, id: string): Promise<VenteDetaillee>;
  creerVente(ctx: ContexteEntreprise, corps: CreationVenteValidee): Promise<VenteDetaillee>;
  modifierVente(
    ctx: ContexteEntreprise,
    id: string,
    corps: ModificationVenteValidee,
  ): Promise<VenteDetaillee>;
  supprimerVente(ctx: ContexteEntreprise, id: string): Promise<void>;

  listerDepenses(ctx: ContexteEntreprise, filtres: FiltresValides): Promise<Page<Depense>>;
  obtenirDepense(ctx: ContexteEntreprise, id: string): Promise<Depense>;
  creerDepense(ctx: ContexteEntreprise, corps: CreationDepenseValidee): Promise<Depense>;
  modifierDepense(
    ctx: ContexteEntreprise,
    id: string,
    corps: ModificationDepenseValidee,
  ): Promise<Depense>;
  supprimerDepense(ctx: ContexteEntreprise, id: string): Promise<void>;

  listerCategories(ctx: ContexteEntreprise): Promise<{ elements: CategorieDepense[] }>;
};

export function creerServiceOperations(
  depot: DepotOperations,
  catalogue: DepotCatalogue,
): ServiceOperations {
  /**
   * Traduit `du` / `au` (bornes **incluses** côté utilisateur) en intervalle
   * `[début, fin[` — la seule forme que le reste du code manipule.
   */
  function bornes(filtres: FiltresValides, fuseau: string): { debut: Date | null; fin: Date | null } {
    try {
      return {
        debut: filtres.du === undefined ? null : debutDeJourLocal(filtres.du, fuseau),
        // `au` inclus : on prend le début du jour SUIVANT comme borne exclusive.
        fin: filtres.au === undefined ? null : finDeJourLocal(filtres.au, fuseau),
      };
    } catch (cause) {
      if (cause instanceof DateInvalide) {
        throw erreurs.validation(cause.message, {
          champs: [{ champ: filtres.du === undefined ? "au" : "du", message: cause.message }],
        });
      }
      throw cause;
    }
  }

  function versFiltresDepot(filtres: FiltresValides, fuseau: string): FiltresDepot {
    const { debut, fin } = bornes(filtres, fuseau);
    return {
      debut,
      fin,
      statut: filtres.statut ?? null,
      moyen_paiement: filtres.moyen_paiement ?? null,
      categorie_id: filtres.categorie_id ?? null,
      client_id: filtres.client_id ?? null,
      limite: filtres.limite,
      decalage: filtres.decalage,
    };
  }

  function dateOperation(valeur: string, fuseau: string, champ: string): Date {
    try {
      return interpreterDateOperation(valeur, fuseau);
    } catch (cause) {
      if (cause instanceof DateInvalide) {
        throw erreurs.validation(cause.message, { champs: [{ champ, message: cause.message }] });
      }
      throw cause;
    }
  }

  /**
   * Calcule les lignes et le total.
   *
   * **Quand des lignes sont fournies, le total vient d'elles** — le montant
   * envoyé par le client est ignoré (docs/API-CONTRACT.md §3.3). Une seule
   * source de vérité : un total qui contredirait son propre détail est un bug
   * qu'on ne veut pas pouvoir créer.
   */
  async function preparerLignes(
    ctx: ContexteEntreprise,
    lignes: CreationVenteValidee["lignes"],
    montantFourni: number | undefined,
  ): Promise<{ lignes: EntreeLigneDb[] | null; total: bigint }> {
    if (lignes === undefined) {
      return { lignes: null, total: BigInt(montantFourni ?? 0) };
    }

    // Les produits référencés sont chargés EN UNE FOIS, pas une requête par
    // ligne : une vente de 50 articles ne doit pas faire 50 allers-retours.
    const identifiants = [
      ...new Set(
        lignes
          .map((ligne) => ligne.produit_id)
          .filter((id): id is string => typeof id === "string"),
      ),
    ];
    const produits: Map<string, LigneProduitDb> = await catalogue.chargerProduits(
      ctx.id,
      identifiants,
    );

    for (const id of identifiants) {
      // 400 et non 404 : c'est un champ du corps qui est invalide. Cela ne
      // révèle rien non plus — l'appelant a fourni la valeur lui-même.
      if (!produits.has(id)) {
        throw erreurs.validation("Ce produit n'existe pas dans votre catalogue.", {
          champs: [{ champ: "lignes.produit_id", message: "Produit inconnu." }],
        });
      }
    }

    const preparees: EntreeLigneDb[] = [];
    let total = 0n;

    for (const [index, ligne] of lignes.entries()) {
      const quantite = analyserQuantite(ligne.quantite);
      if (quantite === null) {
        throw erreurs.validation(
          `Quantité invalide à la ligne ${index + 1} : au maximum 3 décimales, et strictement positive.`,
          { champs: [{ champ: `lignes.${index}.quantite`, message: "Quantité invalide." }] },
        );
      }

      // Nom et prix sont RECOPIÉS depuis le catalogue, pas référencés :
      // renommer un produit ou changer son prix ne doit pas réécrire
      // l'historique des ventes déjà enregistrées.
      const produit =
        typeof ligne.produit_id === "string" ? produits.get(ligne.produit_id) : undefined;

      const libelle = ligne.libelle ?? produit?.nom;
      const prixBrut = ligne.prix_unitaire_mineur ?? produit?.prix_mineur;

      if (libelle === undefined || prixBrut === undefined) {
        throw erreurs.validation(
          `Ligne ${index + 1} : indiquez un produit du catalogue, ou un libellé et un prix.`,
          { champs: [{ champ: `lignes.${index}`, message: "Ligne incomplète." }] },
        );
      }

      const prix = BigInt(prixBrut);
      const montant = montantLigne(quantite, prix);

      preparees.push({
        produit_id: ligne.produit_id ?? null,
        libelle,
        quantite: quantiteVersTexte(quantite),
        prix_unitaire_mineur: prix,
        montant_mineur: montant,
      });
      total += montant;
    }

    // Garde de sérialisation : au-delà, le total ne pourrait plus repartir en
    // JSON sans perte de précision (docs/MOTEUR-ANALYTICS.md §6).
    enNombreSur(total);
    return { lignes: preparees, total };
  }

  async function verifierCategorie(
    ctx: ContexteEntreprise,
    categorieId: string | null | undefined,
  ): Promise<void> {
    if (categorieId === undefined || categorieId === null) return;

    // 400 et non 404 : c'est un champ du corps qui est invalide, on ne cherche
    // pas une ressource. Et cela ne révèle rien — l'appelant a fourni la valeur.
    if (!(await depot.categorieAppartient(ctx.id, categorieId))) {
      throw erreurs.validation("Cette catégorie de dépense n'existe pas.", {
        champs: [{ champ: "categorie_id", message: "Catégorie inconnue." }],
      });
    }
  }

  async function verifierClient(
    ctx: ContexteEntreprise,
    clientId: string | null | undefined,
  ): Promise<void> {
    if (clientId === undefined || clientId === null) return;

    if (!(await catalogue.clientAppartient(ctx.id, clientId))) {
      throw erreurs.validation("Ce client n'existe pas.", {
        champs: [{ champ: "client_id", message: "Client inconnu." }],
      });
    }
  }

  // -------------------------------------------------------------------------
  // Traduction base → formes publiques
  // -------------------------------------------------------------------------

  function versVente(ligne: LigneVenteDb, fuseau: string): Vente {
    return {
      id: ligne.id,
      numero: Number(ligne.numero),
      effectuee_le: ligne.effectuee_le.toISOString(),
      // Calculé ici, côté serveur : le client n'a aucun calcul de fuseau à faire
      // et ne peut donc pas se tromper de jour sur une vente de fin de soirée.
      date_locale: jourLocal(ligne.effectuee_le, fuseau),
      montant_total_mineur: enNombreSur(ligne.montant_total_mineur),
      moyen_paiement: ligne.moyen_paiement,
      statut: ligne.statut,
      note: ligne.note,
      client:
        ligne.client_id === null
          ? null
          : { id: ligne.client_id, nom: ligne.client_nom ?? "" },
      nombre_lignes: Number(ligne.nombre_lignes),
      cree_le: ligne.cree_le.toISOString(),
    };
  }

  function versVenteDetaillee(
    ligne: LigneVenteDb,
    lignes: LigneDetailDb[],
    fuseau: string,
  ): VenteDetaillee {
    return {
      ...versVente(ligne, fuseau),
      lignes: lignes.map((l) => ({
        id: l.id,
        rang: l.rang,
        produit_id: l.produit_id,
        libelle: l.libelle,
        quantite: l.quantite,
        prix_unitaire_mineur: enNombreSur(l.prix_unitaire_mineur),
        montant_mineur: enNombreSur(l.montant_mineur),
      })),
    };
  }

  function versDepense(ligne: LigneDepenseDb, fuseau: string): Depense {
    return {
      id: ligne.id,
      effectuee_le: ligne.effectuee_le.toISOString(),
      date_locale: jourLocal(ligne.effectuee_le, fuseau),
      montant_mineur: enNombreSur(ligne.montant_mineur),
      categorie:
        ligne.categorie_id === null
          ? null
          : {
              id: ligne.categorie_id,
              code: ligne.categorie_code ?? "",
              libelle: ligne.categorie_libelle ?? "",
            },
      fournisseur: ligne.fournisseur,
      moyen_paiement: ligne.moyen_paiement,
      statut: ligne.statut,
      note: ligne.note,
      cree_le: ligne.cree_le.toISOString(),
    };
  }

  // -------------------------------------------------------------------------

  return {
    async listerVentes(ctx, filtres) {
      const page = await depot.listerVentes(ctx.id, versFiltresDepot(filtres, ctx.fuseau));
      return {
        elements: page.elements.map((ligne) => versVente(ligne, ctx.fuseau)),
        total: page.total,
        limite: filtres.limite,
        decalage: filtres.decalage,
      };
    },

    async obtenirVente(ctx, id) {
      const trouvee = await depot.trouverVente(ctx.id, id);
      // Inexistante, supprimée, ou appartenant à une autre entreprise : les
      // trois donnent le même 404. C'est ce qui rend l'isolation indétectable.
      if (trouvee === null) throw erreurs.introuvable("Vente");
      return versVenteDetaillee(trouvee.vente, trouvee.lignes, ctx.fuseau);
    },

    async creerVente(ctx, corps) {
      await verifierClient(ctx, corps.client_id);
      const { lignes, total } = await preparerLignes(ctx, corps.lignes, corps.montant_total_mineur);

      const creee = await depot.creerVente(ctx.id, {
        effectuee_le: dateOperation(corps.effectuee_le, ctx.fuseau, "effectuee_le"),
        client_id: corps.client_id ?? null,
        montant_total_mineur: total,
        moyen_paiement: corps.moyen_paiement ?? null,
        statut: corps.statut ?? "VALIDEE",
        note: corps.note ?? null,
        lignes,
      });

      return versVenteDetaillee(creee.vente, creee.lignes, ctx.fuseau);
    },

    async modifierVente(ctx, id, corps) {
      await verifierClient(ctx, corps.client_id);
      const patch: Parameters<DepotOperations["modifierVente"]>[2] = {};

      if (corps.client_id !== undefined) patch.client_id = corps.client_id;

      if (corps.effectuee_le !== undefined) {
        patch.effectuee_le = dateOperation(corps.effectuee_le, ctx.fuseau, "effectuee_le");
      }
      if (corps.moyen_paiement !== undefined) patch.moyen_paiement = corps.moyen_paiement;
      if (corps.statut !== undefined) patch.statut = corps.statut;
      if (corps.note !== undefined) patch.note = corps.note;

      if (corps.lignes !== undefined) {
        const { lignes, total } = await preparerLignes(ctx, corps.lignes, undefined);
        patch.lignes = lignes ?? [];
        // Le total suit les lignes, même quand le client en envoie un autre.
        patch.montant_total_mineur = total;
      } else if (corps.montant_total_mineur !== undefined) {
        patch.montant_total_mineur = BigInt(corps.montant_total_mineur);
      }

      const modifiee = await depot.modifierVente(ctx.id, id, patch);
      if (modifiee === null) throw erreurs.introuvable("Vente");
      return versVenteDetaillee(modifiee.vente, modifiee.lignes, ctx.fuseau);
    },

    async supprimerVente(ctx, id) {
      if (!(await depot.supprimerVente(ctx.id, id))) throw erreurs.introuvable("Vente");
    },

    async listerDepenses(ctx, filtres) {
      const page = await depot.listerDepenses(ctx.id, versFiltresDepot(filtres, ctx.fuseau));
      return {
        elements: page.elements.map((ligne) => versDepense(ligne, ctx.fuseau)),
        total: page.total,
        limite: filtres.limite,
        decalage: filtres.decalage,
      };
    },

    async obtenirDepense(ctx, id) {
      const trouvee = await depot.trouverDepense(ctx.id, id);
      if (trouvee === null) throw erreurs.introuvable("Dépense");
      return versDepense(trouvee, ctx.fuseau);
    },

    async creerDepense(ctx, corps) {
      await verifierCategorie(ctx, corps.categorie_id);

      const creee = await depot.creerDepense(ctx.id, {
        effectuee_le: dateOperation(corps.effectuee_le, ctx.fuseau, "effectuee_le"),
        montant_mineur: BigInt(corps.montant_mineur),
        categorie_id: corps.categorie_id ?? null,
        fournisseur: corps.fournisseur ?? null,
        moyen_paiement: corps.moyen_paiement ?? null,
        statut: corps.statut ?? "VALIDEE",
        note: corps.note ?? null,
      });

      return versDepense(creee, ctx.fuseau);
    },

    async modifierDepense(ctx, id, corps) {
      await verifierCategorie(ctx, corps.categorie_id);

      const patch: Parameters<DepotOperations["modifierDepense"]>[2] = {};
      if (corps.effectuee_le !== undefined) {
        patch.effectuee_le = dateOperation(corps.effectuee_le, ctx.fuseau, "effectuee_le");
      }
      if (corps.montant_mineur !== undefined) patch.montant_mineur = BigInt(corps.montant_mineur);
      if (corps.categorie_id !== undefined) patch.categorie_id = corps.categorie_id;
      if (corps.fournisseur !== undefined) patch.fournisseur = corps.fournisseur;
      if (corps.moyen_paiement !== undefined) patch.moyen_paiement = corps.moyen_paiement;
      if (corps.statut !== undefined) patch.statut = corps.statut;
      if (corps.note !== undefined) patch.note = corps.note;

      const modifiee = await depot.modifierDepense(ctx.id, id, patch);
      if (modifiee === null) throw erreurs.introuvable("Dépense");
      return versDepense(modifiee, ctx.fuseau);
    },

    async supprimerDepense(ctx, id) {
      if (!(await depot.supprimerDepense(ctx.id, id))) throw erreurs.introuvable("Dépense");
    },

    async listerCategories(ctx) {
      return { elements: await depot.listerCategories(ctx.id) };
    },
  };
}
