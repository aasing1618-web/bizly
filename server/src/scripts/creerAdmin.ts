import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { MOT_DE_PASSE_LONGUEUR_MIN } from "@bizly/shared";
import { fermerPool, pool } from "../db/pool.js";
import { hacherMotDePasse } from "../modules/auth/motDePasse.js";
import { schemaMotDePasse } from "../modules/auth/validation.js";
import { creerDepotAdmin, EmailAdminDejaPris } from "../modules/admin/depot.js";

/**
 * Crée un administrateur de la console — `npm run admin:creer`.
 *
 * En ligne de commande **uniquement** : exposer une inscription d'admin sur
 * Internet ferait de cette page la porte d'entrée de tout le service
 * (docs/API-CONTRACT.md §9).
 *
 * Le mot de passe est demandé au clavier, jamais passé en argument : un
 * argument atterrit dans l'historique du shell et dans la liste des processus.
 */

/**
 * Pose une question et attend la réponse.
 *
 * Le `race` sur `close` n'est pas décoratif : si l'entrée standard est fermée
 * (script lancé sans terminal, entrée redirigée depuis un fichier vide), la
 * promesse de `question()` ne se résout jamais et le script reste figé sans
 * rien dire. Mieux vaut une erreur nette.
 */
async function demander(question: string): Promise<string> {
  const lecteur = createInterface({ input: stdin, output: stdout });
  try {
    const reponse = await Promise.race([
      lecteur.question(question),
      new Promise<never>((_, rejeter) => {
        lecteur.once("close", () =>
          rejeter(new Error("Entrée interrompue. Ce script s'utilise dans un terminal.")),
        );
      }),
    ]);
    return reponse.trim();
  } finally {
    lecteur.close();
  }
}

/**
 * Lit une saisie sans l'afficher.
 *
 * `readline` n'a pas d'option « masqué » : on intercepte l'écriture de l'écho
 * le temps de la question. Sans cela, le mot de passe reste lisible à l'écran
 * et dans le défilement du terminal.
 */
async function demanderSecret(question: string): Promise<string> {
  const lecteur = createInterface({ input: stdin, output: stdout, terminal: true });

  const ecrire = (
    stdout as unknown as { write: (bloc: string) => boolean }
  ).write.bind(stdout);
  let masquer = false;

  (stdout as unknown as { write: (bloc: string) => boolean }).write = (bloc: string) =>
    masquer ? true : ecrire(bloc);

  try {
    const promesse = Promise.race([
      lecteur.question(question),
      new Promise<never>((_, rejeter) => {
        lecteur.once("close", () =>
          rejeter(new Error("Entrée interrompue. Ce script s'utilise dans un terminal.")),
        );
      }),
    ]);
    masquer = true;
    const reponse = await promesse;
    masquer = false;
    ecrire("\n");
    return reponse;
  } finally {
    masquer = false;
    (stdout as unknown as { write: (bloc: string) => boolean }).write = ecrire;
    lecteur.close();
  }
}

async function principal(): Promise<void> {
  stdout.write("\nCréation d'un administrateur Bizly\n");
  stdout.write("----------------------------------\n");

  const nom = await demander("Nom             : ");
  const email = (await demander("Adresse e-mail  : ")).toLowerCase();
  const motDePasse = await demanderSecret("Mot de passe    : ");
  const confirmation = await demanderSecret("Confirmation    : ");

  if (nom === "") throw new Error("Le nom est requis.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Adresse e-mail invalide.");
  if (motDePasse !== confirmation) throw new Error("Les deux mots de passe diffèrent.");

  // Mêmes règles qu'à l'inscription client : un administrateur pressé ne doit
  // pas pouvoir poser « motdepasse ».
  const verdict = schemaMotDePasse.safeParse(motDePasse);
  if (!verdict.success) {
    throw new Error(
      verdict.error.issues[0]?.message ??
        `Le mot de passe doit faire au moins ${MOT_DE_PASSE_LONGUEUR_MIN} caractères.`,
    );
  }

  const depot = creerDepotAdmin(pool);
  const admin = await depot.creerAdmin({
    nom,
    email,
    mot_de_passe_hash: await hacherMotDePasse(motDePasse),
  });

  stdout.write(`\nAdministrateur créé : ${admin.nom} <${admin.email}>\n`);
  stdout.write("Connexion sur /admin/\n\n");
}

principal()
  .then(async () => {
    await fermerPool();
    process.exit(0);
  })
  .catch(async (cause: unknown) => {
    const message =
      cause instanceof EmailAdminDejaPris
        ? cause.message
        : cause instanceof Error
          ? cause.message
          : String(cause);
    process.stderr.write(`\nÉchec : ${message}\n\n`);
    await fermerPool().catch(() => undefined);
    process.exit(1);
  });
