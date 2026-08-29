/**
 * Limitation de débit.
 *
 * Deux implémentations derrière une seule interface : en mémoire du processus
 * (`creerLimiteur`, ci-dessous) et partagée en base (`limiteurBase.ts`).
 * Laquelle est utilisée se décide au câblage, pas dans les routes.
 *
 * L'interface est **asynchrone** parce que la version partagée fait un
 * aller-retour Postgres. Le coût est d'une requête par tentative de connexion,
 * ce qui est le prix d'une défense qui survit à plusieurs instances.
 *
 * Fenêtre **glissante** par horodatages dans les deux cas : plus juste qu'un
 * compteur remis à zéro à heure fixe, qui laisse passer deux fois le quota à
 * cheval sur la bascule.
 */

export type Limiteur = {
  /** `true` si la tentative est acceptée. L'enregistre au passage. */
  autoriser(cle: string): Promise<boolean>;
  /** Efface l'historique d'une clé — après une connexion réussie, par exemple. */
  reinitialiser(cle: string): Promise<void>;
};

export type OptionsLimiteur = {
  /** Nombre de tentatives autorisées dans la fenêtre. */
  maximum: number;
  /** Largeur de la fenêtre, en millisecondes. */
  fenetreMs: number;
  /** Horloge injectable — les tests ne doivent pas attendre 15 minutes. */
  horloge?: () => number;
};

/**
 * Fabrique un limiteur pour un usage donné.
 *
 * Le `nom` est un espace de noms : « connexion », « inscription »… Sans lui,
 * une même IP partagerait un compteur entre l'inscription et la connexion, et
 * bloquer l'une bloquerait l'autre.
 */
export type FabriqueLimiteur = (nom: string, options: OptionsLimiteur) => Limiteur;

/** Limiteur en mémoire du processus. Convient au développement et aux tests. */
export function creerLimiteur(options: OptionsLimiteur): Limiteur & {
  /** Purge les entrées périmées. Appelée automatiquement, exposée pour les tests. */
  nettoyer(maintenant?: number): void;
} {
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
    async autoriser(cle: string): Promise<boolean> {
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

    async reinitialiser(cle: string): Promise<void> {
      historique.delete(cle);
    },

    nettoyer,
  };
}

/** Fabrique en mémoire — celle des tests et du développement hors base. */
export const fabriqueLimiteurMemoire: FabriqueLimiteur = (_nom, options) =>
  creerLimiteur(options);

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
