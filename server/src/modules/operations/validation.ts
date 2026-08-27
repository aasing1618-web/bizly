import { z } from "zod";
import {
  LIGNES_VENTE_MAX,
  LIMITE_LISTE_DEFAUT,
  LIMITE_LISTE_MAX,
  MONTANT_MAX_SUR,
  MOYENS_PAIEMENT,
  STATUTS_OPERATION,
} from "@bizly/shared";

/**
 * Validation des corps et paramètres de la Vague 2.
 * Contrat : docs/API-CONTRACT.md §3.
 */

/**
 * Un montant est un **entier d'unité mineure**, positif ou nul.
 *
 * `int()` refuse `3450.5` : recevoir une décimale signifierait que le client a
 * envoyé des euros là où on attend des centimes, soit un facteur 100 d'erreur.
 * Mieux vaut un 400 franc qu'un montant divisé par cent en base.
 */
const montantMineur = z
  .number()
  .int("Le montant doit être un entier en unité mineure (centimes pour l'euro).")
  .min(0, "Le montant ne peut pas être négatif.")
  .max(MONTANT_MAX_SUR, "Le montant dépasse les valeurs représentables.");

/** Date locale `YYYY-MM-DD` ou instant ISO. Le sens exact est donné par le fuseau. */
const dateOperation = z
  .string()
  .trim()
  .min(1, "La date est requise.")
  .max(40, "La date est illisible.");

const moyenPaiement = z.enum(MOYENS_PAIEMENT);
const statut = z.enum(STATUTS_OPERATION);
const note = z.string().trim().max(2000, "La note est trop longue.").nullable();
const uuid = z.string().uuid("Identifiant invalide.");

const ligneVente = z.object({
  libelle: z.string().trim().min(1, "Le libellé est requis.").max(160, "Le libellé est trop long."),
  // Chaîne et non nombre : `0.1 + 0.2` n'a pas sa place dans une quantité non
  // plus. La conversion exacte est faite par `analyserQuantite`.
  quantite: z.string().trim().min(1, "La quantité est requise.").max(20),
  prix_unitaire_mineur: montantMineur,
});

export const schemaCreationVente = z.object({
  effectuee_le: dateOperation,
  montant_total_mineur: montantMineur.optional(),
  moyen_paiement: moyenPaiement.nullable().optional(),
  statut: statut.optional(),
  note: note.optional(),
  lignes: z
    .array(ligneVente)
    .max(LIGNES_VENTE_MAX, `Une vente ne peut pas dépasser ${LIGNES_VENTE_MAX} lignes.`)
    .optional(),
}).refine(
  (corps) => corps.lignes !== undefined || corps.montant_total_mineur !== undefined,
  {
    message: "Indiquez un montant total, ou au moins une ligne de vente.",
    path: ["montant_total_mineur"],
  },
);

/**
 * Modification partielle : tous les champs sont optionnels.
 *
 * `.partial()` ne suffit pas — le `refine` de la création exigerait encore un
 * montant ou des lignes, ce qui interdirait de ne changer que la note.
 */
export const schemaModificationVente = z
  .object({
    effectuee_le: dateOperation.optional(),
    montant_total_mineur: montantMineur.optional(),
    moyen_paiement: moyenPaiement.nullable().optional(),
    statut: statut.optional(),
    note: note.optional(),
    lignes: z.array(ligneVente).max(LIGNES_VENTE_MAX).optional(),
  })
  .refine((corps) => Object.keys(corps).length > 0, {
    message: "Aucun champ à modifier.",
  });

export const schemaCreationDepense = z.object({
  effectuee_le: dateOperation,
  montant_mineur: montantMineur,
  categorie_id: uuid.nullable().optional(),
  fournisseur: z.string().trim().max(160, "Le fournisseur est trop long.").nullable().optional(),
  moyen_paiement: moyenPaiement.nullable().optional(),
  statut: statut.optional(),
  note: note.optional(),
});

export const schemaModificationDepense = z
  .object({
    effectuee_le: dateOperation.optional(),
    montant_mineur: montantMineur.optional(),
    categorie_id: uuid.nullable().optional(),
    fournisseur: z.string().trim().max(160).nullable().optional(),
    moyen_paiement: moyenPaiement.nullable().optional(),
    statut: statut.optional(),
    note: note.optional(),
  })
  .refine((corps) => Object.keys(corps).length > 0, {
    message: "Aucun champ à modifier.",
  });

/**
 * Filtres de liste.
 *
 * `du` et `au` sont **inclusifs tous les deux** ici : « du 1er au 31 mai »
 * comprend le 31. La conversion vers l'intervalle `[début, fin[` du moteur se
 * fait dans le service, pas dans l'esprit de l'utilisateur.
 */
export const schemaFiltres = z.object({
  limite: z.coerce.number().int().min(1).max(LIMITE_LISTE_MAX).default(LIMITE_LISTE_DEFAUT),
  decalage: z.coerce.number().int().min(0).default(0),
  du: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format attendu : AAAA-MM-JJ.").optional(),
  au: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format attendu : AAAA-MM-JJ.").optional(),
  statut: statut.optional(),
  moyen_paiement: moyenPaiement.optional(),
  categorie_id: uuid.optional(),
});

export type FiltresValides = z.infer<typeof schemaFiltres>;
export type CreationVenteValidee = z.infer<typeof schemaCreationVente>;
export type ModificationVenteValidee = z.infer<typeof schemaModificationVente>;
export type CreationDepenseValidee = z.infer<typeof schemaCreationDepense>;
export type ModificationDepenseValidee = z.infer<typeof schemaModificationDepense>;
