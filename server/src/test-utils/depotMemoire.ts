import { randomUUID } from "node:crypto";
import type { EntreprisePublique, ReponseSession, UtilisateurPublic } from "@bizly/shared";
import {
  EmailDejaPris,
  type CompteAvecSecret,
  type DepotAuth,
  type EntreeInscription,
  type EntreeSession,
  type SessionResolue,
} from "../modules/auth/depot.js";

/**
 * Dépôt d'authentification en mémoire — **usage tests uniquement**.
 *
 * Exclu du build (`tsconfig.build.json`) : il ne part pas en production.
 *
 * Il reproduit les invariants que la vraie base impose, et rien de plus :
 * unicité de l'e-mail insensible à la casse, expiration et révocation des
 * sessions. Il permet de couvrir les cas qu'une vraie base rend pénibles à
 * provoquer — compte suspendu, session expirée, e-mail déjà pris.
 */

const DEVISES: Record<string, number> = {
  EUR: 2,
  XOF: 0,
  TND: 3,
  USD: 2,
};

const SECTEURS = new Set([
  "commerce_detail",
  "restauration",
  "services_pro",
  "artisanat_btp",
  "beaute_bienetre",
  "sante",
  "transport_logistique",
  "education_formation",
  "autre",
]);

type Compte = {
  utilisateur: UtilisateurPublic;
  entreprise: EntreprisePublique;
  mot_de_passe_hash: string;
  statut_utilisateur: "ACTIF" | "SUSPENDU";
};

type SessionEnMemoire = {
  id: string;
  utilisateur_id: string;
  empreinte: string;
  expire_le: Date;
  derniere_activite_le: Date;
  revoquee: boolean;
};

export type DepotMemoire = DepotAuth & {
  /** Bascule un compte en SUSPENDU, pour tester le refus d'accès. */
  suspendreEntreprise(entrepriseId: string): void;
  suspendreUtilisateur(utilisateurId: string): void;
  /** Force l'expiration de toutes les sessions d'un utilisateur. */
  expirerSessions(utilisateurId: string): void;
  nombreSessionsActives(utilisateurId: string): number;
  compte(email: string): Compte | undefined;
};

export function creerDepotMemoire(): DepotMemoire {
  const comptes: Compte[] = [];
  const secrets = new Map<string, { hash: string; statut: "ACTIF" | "SUSPENDU" }>();
  const sessions: SessionEnMemoire[] = [];

  const trouver = (email: string): Compte | undefined =>
    comptes.find((c) => c.utilisateur.email.toLowerCase() === email.trim().toLowerCase());

  function versCompteAvecSecret(compte: Compte): CompteAvecSecret {
    const secret = secrets.get(compte.utilisateur.id);
    return {
      utilisateur: compte.utilisateur,
      entreprise: compte.entreprise,
      mot_de_passe_hash: secret?.hash ?? "",
      statut_utilisateur: secret?.statut ?? "ACTIF",
    };
  }

  return {
    async trouverCompteParEmail(email) {
      const compte = trouver(email);
      return compte === undefined ? null : versCompteAvecSecret(compte);
    },

    async creerCompte(entree: EntreeInscription): Promise<ReponseSession> {
      if (trouver(entree.utilisateur.email) !== undefined) throw new EmailDejaPris();

      const utilisateur: UtilisateurPublic = {
        id: randomUUID(),
        nom: entree.utilisateur.nom,
        email: entree.utilisateur.email,
        role: "PROPRIETAIRE",
      };
      const entreprise: EntreprisePublique = {
        id: randomUUID(),
        nom: entree.entreprise.nom,
        secteur: entree.entreprise.secteur,
        devise: {
          code: entree.entreprise.devise,
          decimales: DEVISES[entree.entreprise.devise] ?? 2,
        },
        fuseau: entree.entreprise.fuseau,
        statut: "ACTIF",
      };

      comptes.push({
        utilisateur,
        entreprise,
        mot_de_passe_hash: entree.utilisateur.mot_de_passe_hash,
        statut_utilisateur: "ACTIF",
      });
      secrets.set(utilisateur.id, { hash: entree.utilisateur.mot_de_passe_hash, statut: "ACTIF" });

      return { utilisateur, entreprise };
    },

    async creerSession(entree: EntreeSession) {
      sessions.push({
        id: randomUUID(),
        utilisateur_id: entree.utilisateur_id,
        empreinte: entree.empreinte.toString("hex"),
        expire_le: entree.expire_le,
        derniere_activite_le: new Date(),
        revoquee: false,
      });
    },

    async resoudreSession(empreinte): Promise<SessionResolue | null> {
      const cle = empreinte.toString("hex");
      const session = sessions.find(
        (s) => s.empreinte === cle && !s.revoquee && s.expire_le.getTime() > Date.now(),
      );
      if (session === undefined) return null;

      const compte = comptes.find((c) => c.utilisateur.id === session.utilisateur_id);
      if (compte === undefined) return null;

      return {
        session_id: session.id,
        expire_le: session.expire_le,
        derniere_activite_le: session.derniere_activite_le,
        utilisateur: compte.utilisateur,
        entreprise: compte.entreprise,
        statut_utilisateur: secrets.get(compte.utilisateur.id)?.statut ?? "ACTIF",
      };
    },

    async revoquerSession(empreinte) {
      const cle = empreinte.toString("hex");
      for (const session of sessions) {
        if (session.empreinte === cle) session.revoquee = true;
      }
    },

    async prolongerSession(sessionId, expireLe) {
      const session = sessions.find((s) => s.id === sessionId);
      if (session !== undefined) {
        session.expire_le = expireLe;
        session.derniere_activite_le = new Date();
      }
    },

    async marquerConnexion() {
      // Sans effet observable ici.
    },

    async secteurExiste(code) {
      return SECTEURS.has(code);
    },

    async deviseExiste(code) {
      return Object.hasOwn(DEVISES, code);
    },

    // ----- commandes réservées aux tests -----

    suspendreEntreprise(entrepriseId) {
      for (const compte of comptes) {
        if (compte.entreprise.id === entrepriseId) compte.entreprise.statut = "SUSPENDU";
      }
    },

    suspendreUtilisateur(utilisateurId) {
      const secret = secrets.get(utilisateurId);
      if (secret !== undefined) secrets.set(utilisateurId, { ...secret, statut: "SUSPENDU" });
    },

    expirerSessions(utilisateurId) {
      for (const session of sessions) {
        if (session.utilisateur_id === utilisateurId) session.expire_le = new Date(0);
      }
    },

    nombreSessionsActives(utilisateurId) {
      return sessions.filter(
        (s) => s.utilisateur_id === utilisateurId && !s.revoquee && s.expire_le.getTime() > Date.now(),
      ).length;
    },

    compte(email) {
      return trouver(email);
    },
  };
}
