import { randomInt } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { MOT_DE_PASSE_LONGUEUR_MIN } from "@bizly/shared";
import { fermerPool, pool } from "../db/pool.js";
import { creerDepotAdmin, EmailAdminDejaPris } from "../modules/admin/depot.js";
import { creerDepotPg } from "../modules/auth/depot.js";
import { hacherMotDePasse } from "../modules/auth/motDePasse.js";
import { schemaMotDePasse } from "../modules/auth/validation.js";

/**
 * Gestion des comptes en ligne de commande — `npm run comptes`.
 *
 * Ce script existe parce qu'il manquait la seule chose qui rende un service
 * réparable : **reposer un mot de passe perdu**. Sans lui, un administrateur
 * qui oublie le sien n'a plus aucun chemin de retour — la console n'expose ni
 * inscription ni réinitialisation (et ne doit pas : ce serait la porte d'entrée
 * de tout le service, docs/API-CONTRACT.md §9) — et le mot de passe d'un client
 * ne se repose que depuis cette console, devenue inaccessible. La boucle était
 * fermée sur elle-même.
 *
 *   npm run comptes -- etat
 *   npm run comptes -- admin:creer  --email=vous@exemple.fr [--nom="Votre nom"]
 *   npm run comptes -- admin:mdp    --email=vous@exemple.fr
 *   npm run comptes -- client:mdp   --email=client@exemple.fr
 *
 * Le mot de passe n'est **jamais** passé en argument : un argument atterrit
 * dans l'historique du shell et dans la liste des processus, visible par tout
 * autre utilisateur de la machine. Il est demandé au clavier sans écho, lu sur
 * l'entrée standard quand le script n'a pas de terminal (`echo … | npm run …`),
 * ou tiré au sort avec `--genere`.
 */

const COMMANDES = [
  "etat",
  "admin:creer",
  "admin:mdp",
  "client:mdp",
  "exempter",
  "facturer",
] as const;
type Commande = (typeof COMMANDES)[number];

const USAGE = `
Gestion des comptes Bizly

  npm run comptes -- etat
      Inventaire : administrateurs de la console, entreprises et propriétaires.

  npm run comptes -- admin:creer --email=vous@exemple.fr [--nom="Votre nom"]
      Crée un accès à la console /admin/.

  npm run comptes -- admin:mdp --email=vous@exemple.fr
      Repose le mot de passe d'un administrateur et coupe ses sessions.

  npm run comptes -- client:mdp --email=client@exemple.fr
      Repose le mot de passe d'un utilisateur de l'application et coupe ses sessions.

  npm run comptes -- exempter --email=vous@exemple.fr
      Dispense ce compte de tout paiement : jamais bloqué, quelle que soit la date.

  npm run comptes -- facturer --email=client@exemple.fr
      Remet le compte dans le régime normal (essai puis abonnement).

Options
  --genere    Tire un mot de passe au sort et l'affiche UNE fois, au lieu de le demander.
`;

// ---------------------------------------------------------------- arguments --

type Arguments = {
  commande: Commande | null;
  email: string | null;
  nom: string | null;
  genere: boolean;
};

/**
 * Lecture des arguments.
 *
 * Volontairement minimale : quatre commandes ne justifient pas une dépendance
 * d'analyse de ligne de commande. `--cle=valeur` uniquement — la forme
 * `--cle valeur` inviterait à écrire `--mot-de-passe secret`, exactement ce
 * qu'on refuse.
 */
export function lireArguments(argv: string[]): Arguments {
  const resultat: Arguments = { commande: null, email: null, nom: null, genere: false };

  for (const brut of argv) {
    if (brut === "--genere") {
      resultat.genere = true;
      continue;
    }

    if (brut.startsWith("--")) {
      const separateur = brut.indexOf("=");
      if (separateur === -1) continue;
      const cle = brut.slice(2, separateur);
      const valeur = brut.slice(separateur + 1).trim();
      if (cle === "email") resultat.email = valeur.toLowerCase();
      else if (cle === "nom") resultat.nom = valeur;
      continue;
    }

    if (resultat.commande === null && (COMMANDES as readonly string[]).includes(brut)) {
      resultat.commande = brut as Commande;
    }
  }

  return resultat;
}

function exigerEmail(email: string | null): string {
  if (email === null || email === "") {
    throw new Error("Précisez le compte visé : --email=vous@exemple.fr");
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error(`Adresse e-mail invalide : ${email}`);
  }
  return email;
}

// ------------------------------------------------------------ mot de passe --

/**
 * Alphabet sans caractère ambigu : ni `l`/`1`/`I`, ni `O`/`0`.
 *
 * Un mot de passe généré est recopié à la main au moins une fois. Les caractères
 * qu'on lit de travers y coûtent plus cher qu'ils ne rapportent en entropie.
 */
const ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789-_";
const LONGUEUR_GENEREE = 24;

/** ~140 bits d'entropie, tirés du générateur cryptographique de Node. */
function genererMotDePasse(): string {
  let resultat = "";
  for (let i = 0; i < LONGUEUR_GENEREE; i += 1) {
    resultat += ALPHABET[randomInt(ALPHABET.length)];
  }
  return resultat;
}

/**
 * Pose une question et attend la réponse.
 *
 * Le `race` sur `close` n'est pas décoratif : si l'entrée standard est fermée,
 * la promesse de `question()` ne se résout jamais et le script reste figé sans
 * rien dire. Mieux vaut une erreur nette.
 */
async function demander(question: string): Promise<string> {
  const lecteur = createInterface({ input: stdin, output: stdout });
  try {
    const reponse = await Promise.race([
      lecteur.question(question),
      new Promise<never>((_, rejeter) => {
        lecteur.once("close", () => rejeter(new Error("Entrée interrompue.")));
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
 * `readline` n'a pas d'option « masqué » : on intercepte l'écriture de l'écho le
 * temps de la question. Sans cela, le mot de passe reste lisible à l'écran et
 * dans le défilement du terminal.
 */
async function demanderSecret(question: string): Promise<string> {
  const lecteur = createInterface({ input: stdin, output: stdout, terminal: true });

  const ecrire = (stdout as unknown as { write: (bloc: string) => boolean }).write.bind(stdout);
  let masquer = false;

  (stdout as unknown as { write: (bloc: string) => boolean }).write = (bloc: string) =>
    masquer ? true : ecrire(bloc);

  try {
    const promesse = Promise.race([
      lecteur.question(question),
      new Promise<never>((_, rejeter) => {
        lecteur.once("close", () => rejeter(new Error("Entrée interrompue.")));
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

/** Lit une ligne de l'entrée standard, quand le script tourne sans terminal. */
async function lireUneLigne(): Promise<string> {
  const lecteur = createInterface({ input: stdin });
  try {
    for await (const ligne of lecteur) return ligne.trim();
    return "";
  } finally {
    lecteur.close();
  }
}

type MotDePasseObtenu = { valeur: string; genere: boolean };

/**
 * Obtient le mot de passe à poser, par le canal disponible.
 *
 * Trois cas, dans cet ordre : tiré au sort (`--genere`), demandé au clavier
 * quand il y a un terminal, lu sur l'entrée standard sinon. Ce dernier cas
 * n'est pas un détail : le script tournait jusqu'ici *uniquement* dans un vrai
 * terminal, et échouait sur « Entrée interrompue » partout ailleurs — terminal
 * d'éditeur, tâche planifiée, conteneur.
 */
async function obtenirMotDePasse(genere: boolean): Promise<MotDePasseObtenu> {
  if (genere) return { valeur: genererMotDePasse(), genere: true };

  if (stdin.isTTY === true) {
    const motDePasse = await demanderSecret("Mot de passe    : ");
    const confirmation = await demanderSecret("Confirmation    : ");
    if (motDePasse !== confirmation) throw new Error("Les deux mots de passe diffèrent.");
    return { valeur: motDePasse, genere: false };
  }

  stdout.write("Lecture du mot de passe sur l'entrée standard…\n");
  const motDePasse = await lireUneLigne();
  if (motDePasse === "") {
    throw new Error(
      "Aucun mot de passe reçu. Lancez la commande dans un terminal, ajoutez --genere, " +
        "ou fournissez-le sur l'entrée standard.",
    );
  }
  return { valeur: motDePasse, genere: false };
}

/** Mêmes règles qu'à l'inscription : un accès admin ne mérite pas moins. */
function validerMotDePasse(valeur: string): void {
  const verdict = schemaMotDePasse.safeParse(valeur);
  if (!verdict.success) {
    throw new Error(
      verdict.error.issues[0]?.message ??
        `Le mot de passe doit faire au moins ${MOT_DE_PASSE_LONGUEUR_MIN} caractères.`,
    );
  }
}

function annoncer(obtenu: MotDePasseObtenu): void {
  if (!obtenu.genere) return;
  stdout.write(`\nMot de passe généré : ${obtenu.valeur}\n`);
  stdout.write("Notez-le maintenant : il ne sera plus affiché.\n");
}

// ----------------------------------------------------------------- commandes --

const depotAdmin = creerDepotAdmin(pool);
const depotAuth = creerDepotPg(pool);

function dateCourte(valeur: Date | string | null): string {
  if (valeur === null) return "jamais";
  const date = valeur instanceof Date ? valeur : new Date(valeur);
  return Number.isNaN(date.getTime()) ? "—" : date.toISOString().slice(0, 10);
}

async function etat(): Promise<void> {
  const [admins, entreprises] = await Promise.all([
    depotAdmin.listerAdmins(),
    depotAdmin.listerEntreprises({
      recherche: null,
      statut: null,
      plan: null,
      limite: 50,
      decalage: 0,
    }),
  ]);

  stdout.write("\nAdministrateurs de la console — connexion sur /admin/\n");
  stdout.write("-----------------------------------------------------\n");
  if (admins.length === 0) {
    stdout.write("  aucun — « npm run comptes -- admin:creer --email=… » pour en créer un\n");
  }
  for (const fiche of admins) {
    stdout.write(
      `  ${fiche.admin.email}  [${fiche.statut}]  dernière connexion : ${dateCourte(fiche.derniere_connexion_le)}\n`,
    );
  }

  stdout.write("\nComptes clients — connexion sur /\n");
  stdout.write("---------------------------------\n");
  if (entreprises.elements.length === 0) {
    stdout.write("  aucun — « Créer un compte » sur la page d'accueil\n");
  }
  for (const entreprise of entreprises.elements) {
    const proprietaire = entreprise.proprietaire?.email ?? "(sans propriétaire)";
    stdout.write(
      `  ${proprietaire}  [${entreprise.statut}]  ${entreprise.nom} · ${entreprise.plan} · ${entreprise.nombre_ventes} vente(s)\n`,
    );
  }

  if (entreprises.total > entreprises.elements.length) {
    stdout.write(`  … et ${entreprises.total - entreprises.elements.length} autre(s)\n`);
  }

  stdout.write(
    "\nUn compte client ne peut pas ouvrir /admin/, et un administrateur ne peut pas\n" +
      "ouvrir l'application : ce sont deux tables et deux cookies distincts.\n\n",
  );
}

/**
 * Exempte un compte client de toute facturation, ou l'y remet.
 *
 * L'entreprise est désignée par l'e-mail de l'un de ses utilisateurs : c'est
 * ce que le propriétaire a sous la main, pas un UUID.
 */
async function exemption(args: Arguments, exempt: boolean): Promise<void> {
  const email = exigerEmail(args.email);

  const compte = await depotAuth.trouverCompteParEmail(email);
  if (compte === null) {
    throw new Error(
      `Aucun compte client avec l'adresse ${email}. ` +
        "« npm run comptes -- etat » liste ceux qui existent.",
    );
  }

  const fait = await depotAdmin.definirExemptionFacturation(compte.entreprise.id, exempt);
  if (!fait) throw new Error("Entreprise introuvable.");

  stdout.write(
    exempt
      ? `\n${compte.entreprise.nom} (${email}) est exemptée de facturation.\n` +
          "Ce compte ne sera jamais bloqué, quelle que soit la date.\n\n"
      : `\n${compte.entreprise.nom} (${email}) repasse au régime normal :\n` +
          "essai de deux mois, puis abonnement Pro obligatoire.\n\n",
  );
}

async function creerAdmin(args: Arguments): Promise<void> {
  // Sans `--email`, on demande — `npm run admin:creer` sans aucun argument
  // reste le geste documenté sur l'écran de connexion de la console.
  const saisi =
    args.email ?? (stdin.isTTY === true ? (await demander("Adresse e-mail  : ")).toLowerCase() : null);
  const email = exigerEmail(saisi);
  const nom = args.nom ?? (stdin.isTTY === true ? await demander("Nom             : ") : email);
  if (nom.trim() === "") throw new Error("Le nom est requis : --nom=\"Votre nom\"");

  const obtenu = await obtenirMotDePasse(args.genere);
  validerMotDePasse(obtenu.valeur);

  const admin = await depotAdmin.creerAdmin({
    nom: nom.trim(),
    email,
    mot_de_passe_hash: await hacherMotDePasse(obtenu.valeur),
  });

  stdout.write(`\nAdministrateur créé : ${admin.nom} <${admin.email}>\n`);
  annoncer(obtenu);
  stdout.write("Connexion sur /admin/\n\n");
}

async function motDePasseAdmin(args: Arguments): Promise<void> {
  const email = exigerEmail(args.email);

  const obtenu = await obtenirMotDePasse(args.genere);
  validerMotDePasse(obtenu.valeur);

  const trouve = await depotAdmin.changerMotDePasseAdmin(
    email,
    await hacherMotDePasse(obtenu.valeur),
  );
  if (!trouve) {
    throw new Error(
      `Aucun administrateur avec l'adresse ${email}. ` +
        "« npm run comptes -- etat » liste ceux qui existent.",
    );
  }

  stdout.write(`\nMot de passe reposé pour ${email}. Ses sessions ouvertes sont coupées.\n`);
  annoncer(obtenu);
  stdout.write("Connexion sur /admin/\n\n");
}

async function motDePasseClient(args: Arguments): Promise<void> {
  const email = exigerEmail(args.email);

  const compte = await depotAuth.trouverCompteParEmail(email);
  if (compte === null) {
    throw new Error(
      `Aucun compte client avec l'adresse ${email}. ` +
        "« npm run comptes -- etat » liste ceux qui existent.",
    );
  }

  const obtenu = await obtenirMotDePasse(args.genere);
  validerMotDePasse(obtenu.valeur);

  await depotAdmin.reinitialiserMotDePasse(
    compte.utilisateur.id,
    await hacherMotDePasse(obtenu.valeur),
  );

  stdout.write(`\nMot de passe reposé pour ${email}. Ses sessions ouvertes sont coupées.\n`);
  annoncer(obtenu);

  // Un mot de passe juste, sur un compte suspendu, échoue quand même — et le
  // message d'erreur parle alors de suspension, pas d'identifiants. Le dire
  // ici évite de chercher au mauvais endroit.
  if (compte.statut_utilisateur === "SUSPENDU" || compte.entreprise.statut === "SUSPENDU") {
    stdout.write(
      "\nAttention : ce compte est SUSPENDU. Le nouveau mot de passe ne suffira pas à\n" +
        "ouvrir une session tant qu'il n'est pas réactivé depuis /admin/.\n",
    );
  }

  stdout.write("Connexion sur /\n\n");
}

// ------------------------------------------------------------------ exécution --

async function principal(): Promise<void> {
  const args = lireArguments(process.argv.slice(2));

  if (args.commande === null) {
    stdout.write(USAGE);
    return;
  }

  switch (args.commande) {
    case "etat":
      return etat();
    case "admin:creer":
      return creerAdmin(args);
    case "admin:mdp":
      return motDePasseAdmin(args);
    case "client:mdp":
      return motDePasseClient(args);
    case "exempter":
      return exemption(args, true);
    case "facturer":
      return exemption(args, false);
  }
}

principal()
  .then(async () => {
    await fermerPool();
    process.exit(0);
  })
  .catch(async (cause: unknown) => {
    const message =
      cause instanceof EmailAdminDejaPris
        ? `${cause.message} Utilisez « admin:mdp » pour reposer son mot de passe.`
        : cause instanceof Error
          ? cause.message
          : String(cause);
    process.stderr.write(`\nÉchec : ${message}\n\n`);
    await fermerPool().catch(() => undefined);
    process.exit(1);
  });
