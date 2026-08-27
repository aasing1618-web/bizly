import { z } from "zod";
import { MOT_DE_PASSE_LONGUEUR_MAX, MOT_DE_PASSE_LONGUEUR_MIN } from "@bizly/shared";

/**
 * Validation des corps d'authentification.
 *
 * La validation est faite **avant** toute requête en base : un corps malformé
 * ne doit pas consommer de connexion Postgres, et surtout ne jamais atteindre
 * une requête SQL.
 */

/**
 * Mots de passe courants d'au moins 10 caractères.
 *
 * Liste volontairement courte : elle n'a pas vocation à remplacer un service
 * comme Have I Been Pwned, seulement à écarter les choix évidents que la seule
 * contrainte de longueur laisserait passer. Les classiques trop courts
 * (« 123456 », « azerty ») sont déjà refusés par la longueur minimale.
 */
const MOTS_DE_PASSE_COURANTS = new Set([
  "motdepasse",
  "motdepasse1",
  "motdepasse123",
  "password123",
  "password1234",
  "passw0rd123",
  "azerty123456",
  "azertyuiop",
  "qwertyuiop",
  "1234567890",
  "123456789012",
  "0123456789",
  "iloveyou123",
  "administrateur",
  "administrator",
  "bonjour1234",
  "soleil1234",
  "chocolat123",
  "jesuisunmotdepasse",
  "changemesvp",
  "changeme123",
]);

/** Vrai si le mot de passe n'est qu'un caractère répété ou une suite évidente. */
function estTropRepetitif(valeur: string): boolean {
  const minuscule = valeur.toLowerCase();
  if (new Set(minuscule).size <= 2) return true;

  const suites = ["0123456789", "abcdefghijklmnopqrstuvwxyz", "azertyuiop", "qwertyuiop"];
  return suites.some((suite) => suite.includes(minuscule) || [...suite].reverse().join("").includes(minuscule));
}

const motDePasse = z
  .string()
  .min(MOT_DE_PASSE_LONGUEUR_MIN, `Le mot de passe doit faire au moins ${MOT_DE_PASSE_LONGUEUR_MIN} caractères.`)
  .max(MOT_DE_PASSE_LONGUEUR_MAX, "Le mot de passe est trop long.")
  .refine((valeur) => !MOTS_DE_PASSE_COURANTS.has(valeur.toLowerCase()), {
    message: "Ce mot de passe est trop courant. Choisissez-en un autre.",
  })
  .refine((valeur) => !estTropRepetitif(valeur), {
    message: "Ce mot de passe est trop simple (caractères répétés ou suite du clavier).",
  });

const email = z
  .string()
  .trim()
  .min(3, "L'adresse e-mail est requise.")
  .max(254, "L'adresse e-mail est trop longue.")
  // Volontairement permissif : la seule validation fiable d'un e-mail est
  // l'envoi d'un message. On écarte ce qui est certainement faux, rien de plus.
  .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, "L'adresse e-mail est invalide.")
  .transform((valeur) => valeur.toLowerCase());

const nom = z.string().trim().min(1, "Le nom est requis.").max(120, "Le nom est trop long.");

export const schemaInscription = z.object({
  entreprise: z.object({
    nom: z.string().trim().min(1, "Le nom de l'entreprise est requis.").max(120),
    secteur: z.string().trim().min(1, "Le secteur est requis.").max(40),
    devise: z.string().trim().toUpperCase().length(3).optional(),
    fuseau: z.string().trim().min(1).max(64).optional(),
  }),
  utilisateur: z.object({
    nom,
    email,
    mot_de_passe: motDePasse,
  }),
});

export const schemaConnexion = z.object({
  email: z.string().trim().min(1, "L'adresse e-mail est requise.").max(254),
  // Pas de contrainte de forme à la connexion : les règles de robustesse
  // s'appliquent à la création. Les imposer ici révélerait, pour un mot de
  // passe non conforme, qu'il ne peut appartenir à aucun compte.
  mot_de_passe: z.string().min(1, "Le mot de passe est requis.").max(MOT_DE_PASSE_LONGUEUR_MAX),
});

export type EntreeInscriptionValidee = z.infer<typeof schemaInscription>;
export type EntreeConnexionValidee = z.infer<typeof schemaConnexion>;

/**
 * Les helpers de traduction zod -> erreur API vivent dans
 * `server/src/http/validation.ts` : ils servent à tous les modules.
 */
