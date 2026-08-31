import { randomUUID } from "node:crypto";
import type { AdminPublic, EntrepriseAdmin, Plan, StatutCompte } from "@bizly/shared";
import {
  EmailAdminDejaPris,
  type DepotAdmin,
  type SessionAdminResolue,
} from "../modules/admin/depot.js";
import type { DepotMemoire } from "./depotMemoire.js";

/**
 * Console d'administration, en mémoire — **usage tests uniquement**.
 *
 * Les entreprises ne sont pas dupliquées : elles sont lues dans le
 * `DepotMemoire` d'authentification. Suspendre un compte ici doit couper la
 * session résolue là-bas, sinon le test le plus important de cette vague
 * — « une suspension prend effet immédiatement » — vérifierait deux copies
 * indépendantes.
 */

type AdminEnMemoire = {
  admin: AdminPublic;
  mot_de_passe_hash: string;
  statut: StatutCompte;
};

type SessionAdminEnMemoire = {
  id: string;
  admin_id: string;
  empreinte: string;
  expire_le: Date;
  revoquee: boolean;
};

export type DepotAdminMemoire = DepotAdmin & {
  /** Nombre de sessions client encore actives — pour vérifier la révocation. */
  nombreSessionsClient(utilisateurId: string): number;
};

export function creerDepotAdminMemoire(auth: DepotMemoire): DepotAdminMemoire {
  const admins: AdminEnMemoire[] = [];
  const sessions: SessionAdminEnMemoire[] = [];
  const volumes = new Map<string, { ventes: number; depenses: number }>();

  function fiche(entrepriseId: string): EntrepriseAdmin | null {
    const comptes = auth.tousLesComptes().filter((c) => c.entreprise.id === entrepriseId);
    const premier = comptes[0];
    if (premier === undefined) return null;

    const proprietaire =
      comptes.find((c) => c.utilisateur.role === "PROPRIETAIRE")?.utilisateur ?? null;
    const compte = volumes.get(entrepriseId) ?? { ventes: 0, depenses: 0 };

    return {
      id: premier.entreprise.id,
      nom: premier.entreprise.nom,
      secteur: premier.entreprise.secteur,
      pays: premier.entreprise.pays,
      devise: premier.entreprise.devise.code,
      plan: premier.entreprise.plan,
      statut: premier.entreprise.statut,
      motif_suspension: null,
      cree_le: new Date(0).toISOString(),
      proprietaire:
        proprietaire === null
          ? null
          : { id: proprietaire.id, nom: proprietaire.nom, email: proprietaire.email },
      nombre_utilisateurs: comptes.length,
      nombre_ventes: compte.ventes,
      nombre_depenses: compte.depenses,
      derniere_activite_le: null,
    };
  }

  function toutesLesFiches(): EntrepriseAdmin[] {
    const vues = new Set<string>();
    const fiches: EntrepriseAdmin[] = [];

    for (const compte of auth.tousLesComptes()) {
      if (vues.has(compte.entreprise.id)) continue;
      vues.add(compte.entreprise.id);
      const resultat = fiche(compte.entreprise.id);
      if (resultat !== null) fiches.push(resultat);
    }
    return fiches;
  }

  return {
    async trouverAdminParEmail(email) {
      const trouve = admins.find(
        (a) => a.admin.email.toLowerCase() === email.trim().toLowerCase(),
      );
      return trouve === undefined
        ? null
        : { admin: trouve.admin, mot_de_passe_hash: trouve.mot_de_passe_hash, statut: trouve.statut };
    },

    async creerSession(entree) {
      sessions.push({
        id: randomUUID(),
        admin_id: entree.admin_id,
        empreinte: entree.empreinte.toString("hex"),
        expire_le: entree.expire_le,
        revoquee: false,
      });
    },

    async resoudreSession(empreinte): Promise<SessionAdminResolue | null> {
      const cle = empreinte.toString("hex");
      const session = sessions.find(
        (s) => s.empreinte === cle && !s.revoquee && s.expire_le.getTime() > Date.now(),
      );
      if (session === undefined) return null;

      const admin = admins.find((a) => a.admin.id === session.admin_id);
      if (admin === undefined) return null;

      return {
        session_id: session.id,
        admin: admin.admin,
        statut: admin.statut,
        derniere_activite_le: new Date(),
      };
    },

    async revoquerSession(empreinte) {
      const cle = empreinte.toString("hex");
      for (const session of sessions) {
        if (session.empreinte === cle) session.revoquee = true;
      }
    },

    async marquerConnexion() {
      // Sans effet observable ici.
    },

    async listerEntreprises(filtres) {
      let fiches = toutesLesFiches();

      if (filtres.recherche !== null) {
        const terme = filtres.recherche.toLowerCase();
        fiches = fiches.filter(
          (f) =>
            f.nom.toLowerCase().includes(terme) ||
            (f.proprietaire?.email.toLowerCase().includes(terme) ?? false),
        );
      }
      if (filtres.statut !== null) fiches = fiches.filter((f) => f.statut === filtres.statut);
      if (filtres.plan !== null) fiches = fiches.filter((f) => f.plan === filtres.plan);

      return {
        elements: fiches.slice(filtres.decalage, filtres.decalage + filtres.limite),
        total: fiches.length,
        limite: filtres.limite,
        decalage: filtres.decalage,
      };
    },

    async trouverEntreprise(id) {
      return fiche(id);
    },

    async modifierEntreprise(id, patch) {
      const comptes = auth.tousLesComptes().filter((c) => c.entreprise.id === id);
      if (comptes.length === 0) return null;

      for (const compte of comptes) {
        if (patch.plan !== undefined) compte.entreprise.plan = patch.plan;
        if (patch.statut !== undefined) compte.entreprise.statut = patch.statut;
      }

      if (patch.statut === "SUSPENDU") {
        for (const compte of comptes) {
          auth.revoquerSessionsSauf(compte.utilisateur.id, null);
        }
      }

      const resultat = fiche(id);
      if (resultat !== null && patch.statut === "SUSPENDU") {
        resultat.motif_suspension = patch.motif_suspension ?? null;
      }
      return resultat;
    },

    async reinitialiserMotDePasse(utilisateurId, empreinte) {
      const compte = auth.tousLesComptes().find((c) => c.utilisateur.id === utilisateurId);
      if (compte === undefined) return false;

      auth.definirEmpreinteMotDePasse(utilisateurId, empreinte);
      auth.revoquerSessionsSauf(utilisateurId, null);
      return true;
    },

    async statistiques() {
      const fiches = toutesLesFiches();
      const parPlan = new Map<Plan, number>();
      for (const f of fiches) parPlan.set(f.plan, (parPlan.get(f.plan) ?? 0) + 1);

      return {
        entreprises: fiches.length,
        entreprises_actives: fiches.filter((f) => f.statut === "ACTIF").length,
        entreprises_suspendues: fiches.filter((f) => f.statut === "SUSPENDU").length,
        utilisateurs: auth.tousLesComptes().length,
        entreprises_avec_vente: fiches.filter((f) => f.nombre_ventes > 0).length,
        inscriptions_30_jours: fiches.length,
        par_plan: [...parPlan].map(([plan, nombre]) => ({ plan, nombre })),
      };
    },

    async creerAdmin(entree) {
      if (admins.some((a) => a.admin.email.toLowerCase() === entree.email.toLowerCase())) {
        throw new EmailAdminDejaPris();
      }
      const admin: AdminPublic = { id: randomUUID(), nom: entree.nom, email: entree.email };
      admins.push({ admin, mot_de_passe_hash: entree.mot_de_passe_hash, statut: "ACTIF" });
      return admin;
    },

    async listerAdmins() {
      return admins.map((entree) => ({
        admin: entree.admin,
        statut: entree.statut,
        cree_le: new Date(0),
        derniere_connexion_le: null,
      }));
    },

    async changerMotDePasseAdmin(email, empreinte) {
      const entree = admins.find((a) => a.admin.email.toLowerCase() === email.toLowerCase());
      if (entree === undefined) return false;

      entree.mot_de_passe_hash = empreinte;
      for (const session of sessions) {
        if (session.admin_id === entree.admin.id) session.revoquee = true;
      }
      return true;
    },

    nombreSessionsClient(utilisateurId) {
      return auth.nombreSessionsActives(utilisateurId);
    },
  };
}
