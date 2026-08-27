import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * Hachage des mots de passe — scrypt (`node:crypto`).
 *
 * Pourquoi scrypt et pas argon2 ou bcrypt : les deux imposent une dépendance
 * native, donc une compilation qui casse sous Windows et allonge chaque
 * déploiement. scrypt est dans la bibliothèque standard de Node, reconnu par
 * l'OWASP, et coûteux en mémoire — exactement ce qui gêne une attaque par GPU.
 *
 * Format stocké, tout ce qu'il faut pour vérifier ET pour migrer plus tard :
 *
 *   scrypt$N$r$p$<sel base64>$<empreinte base64>
 *
 * Les paramètres voyagent avec l'empreinte : le jour où on les durcit, les
 * anciens mots de passe restent vérifiables et se réencodent à la connexion.
 */

const scryptAsync = promisify(scrypt) as (
  motDePasse: string | Buffer,
  sel: Buffer,
  longueur: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * N = 2^15 : ~100 ms par hachage sur une machine courante — assez lent pour
 * décourager le cassage hors ligne, assez rapide pour une connexion.
 * r = 8, p = 1 : les valeurs de référence de l'OWASP.
 */
const PARAMETRES = { N: 32_768, r: 8, p: 1 } as const;

const LONGUEUR_SEL = 16;
const LONGUEUR_EMPREINTE = 64;

/**
 * scrypt consomme environ 128 × N × r octets, soit exactement 32 Mio ici.
 * La limite par défaut de Node est de 32 Mio pile : sans marge, l'appel échoue.
 */
const MAXMEM = 96 * 1024 * 1024;

/** Hache un mot de passe. Chaque appel produit un sel neuf. */
export async function hacherMotDePasse(motDePasse: string): Promise<string> {
  const sel = randomBytes(LONGUEUR_SEL);
  const empreinte = await scryptAsync(motDePasse.normalize("NFKC"), sel, LONGUEUR_EMPREINTE, {
    ...PARAMETRES,
    maxmem: MAXMEM,
  });

  return [
    "scrypt",
    PARAMETRES.N,
    PARAMETRES.r,
    PARAMETRES.p,
    sel.toString("base64"),
    empreinte.toString("base64"),
  ].join("$");
}

/**
 * Vérifie un mot de passe contre une empreinte stockée.
 *
 * Rend `false` — jamais une exception — sur une empreinte illisible : une ligne
 * corrompue en base ne doit pas produire un 500 exploitable pour distinguer un
 * compte existant d'un compte inconnu.
 */
export async function verifierMotDePasse(
  motDePasse: string,
  empreinteStockee: string,
): Promise<boolean> {
  const parts = empreinteStockee.split("$");
  if (parts.length !== 6) return false;

  const [algorithme, nBrut, rBrut, pBrut, selBase64, empreinteBase64] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  if (algorithme !== "scrypt") return false;

  const N = Number(nBrut);
  const r = Number(rBrut);
  const p = Number(pBrut);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  let attendue: Buffer;
  let sel: Buffer;
  try {
    sel = Buffer.from(selBase64, "base64");
    attendue = Buffer.from(empreinteBase64, "base64");
  } catch {
    return false;
  }
  if (sel.length === 0 || attendue.length === 0) return false;

  let calculee: Buffer;
  try {
    calculee = await scryptAsync(motDePasse.normalize("NFKC"), sel, attendue.length, {
      N,
      r,
      p,
      maxmem: MAXMEM,
    });
  } catch {
    return false;
  }

  // Comparaison à temps constant : un `===` s'arrête au premier octet différent
  // et laisse mesurer la progression de la comparaison.
  if (calculee.length !== attendue.length) return false;
  return timingSafeEqual(calculee, attendue);
}

/**
 * Empreinte factice utilisée quand l'e-mail est inconnu.
 *
 * Sans elle, une connexion sur un e-mail inexistant répondrait en 1 ms là où un
 * e-mail réel prend ~100 ms : la différence suffit à énumérer les clients. On
 * paie donc le même coût dans les deux cas.
 *
 * Calculée une fois au démarrage, sur un mot de passe qui n'est celui de
 * personne.
 */
let empreinteFactice: Promise<string> | null = null;

export async function consommerTempsCommeSiCompteExistait(motDePasse: string): Promise<void> {
  empreinteFactice ??= hacherMotDePasse(randomBytes(32).toString("base64"));
  await verifierMotDePasse(motDePasse, await empreinteFactice);
}
