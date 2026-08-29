/**
 * Limitation de débit, en mémoire du processus.
 *
 * Fenêtre glissante par horodatages : plus juste qu'un compteur remis à zéro à
 * heure fixe, qui laisse passer deux fois le quota à cheval sur la bascule.
 *
 * **Limite assumée** : l'état vit dans le processus. Avec deux instances, chacune
 * accorde le quota complet. Acceptable pour le MVP mono-instance ; le jour où
 * l'on passe à deux, il faudra un magasin partagé. C'est écrit ici pour que la
 * découverte ne se fasse pas en production (docs/API-CONTRACT.md §2).
 */

export type Limiteur = {
  /** `true` si la tentative est acceptée. L'enregistre au passage. */
  autoriser(cle: string): boolean;
  /** Efface l'historique d'une clé — après une connexion réussie, par exemple. */
  reinitialiser(cle: string): void;
  /** Purge les entrées périmées. Appelée automatiquement, exposée pour les tests. */
  nettoyer(maintenant?: number): void;
};

export type OptionsLimiteur = {
  /** Nombre de tentatives autorisées dans la fenêtre. */
  maximum: number;
  /** Largeur de la fenêtre, en millisecondes. */
  fenetreMs: number;
  /** Horloge injectable — les tests ne doivent pas attendre 15 minutes. */
  horloge?: () => number;
};

export function creerLimiteur(options: OptionsLimiteur): Limiteur {
  const { maximum, fenetreMs, horloge = Date.now } = options;
  const historique = new Map<string, number[]>();

  // Sans purge, une attaque distribuée ferait grossir la Map indéfiniment :
  // la limitation de débit deviendrait elle-même le déni de service.
  let prochainNettoyage = horloge() + fenetreMs;

  function nettoyer(maintenant = horloge()): void {
    for (const [cle, horodatages] of historique) {
      const recents = horodatages.filter((t) => maintenant - t < fenetreMs);
      if (recents.length === 0) historique.delete(cle);
      else historique.set(cle, recents);
    }
    prochainNettoyage = maintenant + fenetreMs;
  }

  return {
    autoriser(cle: string): boolean {
      const maintenant = horloge();
      if (maintenant >= prochainNettoyage) nettoyer(maintenant);

      const recents = (historique.get(cle) ?? []).filter((t) => maintenant - t < fenetreMs);

      if (recents.length >= maximum) {
        // On n'enregistre pas la tentative refusée : sinon un client bloqué le
        // resterait indéfiniment en continuant de marteler.
        historique.set(cle, recents);
        return false;
      }

      recents.push(maintenant);
      historique.set(cle, recents);
      return true;
    },

    reinitialiser(cle: string): void {
      historique.delete(cle);
    },

    nettoyer,
  };
}

/**
 * Identifie l'appelant pour la limitation.
 *
 * `requete.ip` tient compte de `trust proxy`, réglé à `1` en production dans
 * `app.ts` : derrière l'hébergeur, on lit l'IP réelle et non celle du proxy,
 * sans pour autant faire confiance à un `X-Forwarded-For` entièrement forgé.
 */
export function cleIp(ip: string | undefined): string {
  return `ip:${ip ?? "inconnue"}`;
}

export function cleEmail(email: string): string {
  return `email:${email.trim().toLowerCase()}`;
}

/**
 * Clé de limitation par utilisateur authentifié.
 *
 * Distincte de `cleIp` : le changement de mot de passe (§8.4) vise un compte
 * précis, pas une machine. Un couple partageant une connexion ne doit pas se
 * bloquer mutuellement.
 */
export function cleUtilisateur(utilisateurId: string): string {
  return `utilisateur:${utilisateurId}`;
}
