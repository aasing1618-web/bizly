import { createHash, randomBytes } from "node:crypto";

/**
 * Jetons de session.
 *
 * Le jeton en clair n'existe qu'à deux endroits : dans la réponse qui pose le
 * cookie, et dans le navigateur du client. La base ne contient que son SHA-256.
 * Conséquence : une fuite de la table `sessions` ne permet d'usurper aucune
 * session, alors qu'un jeton stocké en clair donnerait un accès immédiat à tous
 * les comptes connectés.
 *
 * SHA-256 nu suffit ici, là où un mot de passe exige scrypt : un jeton de
 * 256 bits tiré au hasard n'est pas devinable par force brute, contrairement à
 * un mot de passe choisi par un humain.
 */

const OCTETS_JETON = 32; // 256 bits

export type JetonSession = {
  /** À envoyer au client, jamais à stocker. */
  clair: string;
  /** À stocker, jamais à envoyer. */
  empreinte: Buffer;
};

export function creerJetonSession(): JetonSession {
  const brut = randomBytes(OCTETS_JETON);
  return {
    clair: brut.toString("base64url"),
    empreinte: empreinteJeton(brut.toString("base64url")),
  };
}

/** SHA-256 du jeton, sur 32 octets — la contrainte que la table impose. */
export function empreinteJeton(clair: string): Buffer {
  return createHash("sha256").update(clair, "utf8").digest();
}

/**
 * Rejette d'emblée ce qui ne peut pas être un jeton.
 *
 * Évite une requête en base pour chaque cookie tronqué, expiré côté client ou
 * bricolé à la main.
 */
export function ressembleAUnJeton(valeur: string): boolean {
  return valeur.length >= 40 && valeur.length <= 64 && /^[A-Za-z0-9_-]+$/.test(valeur);
}
