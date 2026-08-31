import type { Pool } from "pg";
import type {
  AdminPublic,
  EntrepriseAdmin,
  Page,
  Plan,
  StatutCompte,
} from "@bizly/shared";
import { dansTransaction, estViolationUnicite } from "../../db/transaction.js";

/**
 * Accès aux données de la console d'administration — docs/API-CONTRACT.md §9.
 *
 * C'est le seul dépôt du projet qui lise **au travers** des entreprises. Il est
 * donc aussi le seul dont chaque requête doit être relue avec l'idée qu'elle
 * n'a aucun filtre `entreprise_id` pour la protéger : ce qui sort d'ici sort
 * volontairement de l'isolation, et se limite donc à des métadonnées de compte
 * — jamais une vente, une dépense ou un client (§9.6).
 */

export type CompteAdminAvecSecret = {
  admin: AdminPublic;
  mot_de_passe_hash: string;
  statut: StatutCompte;
};

export type SessionAdminResolue = {
  session_id: string;
  admin: AdminPublic;
  statut: StatutCompte;
  derniere_activite_le: Date;
};

export type FiltresEntreprises = {
  recherche: string | null;
  statut: StatutCompte | null;
  plan: Plan | null;
  limite: number;
  decalage: number;
};

export type PatchEntrepriseAdmin = {
  plan?: Plan;
  statut?: StatutCompte;
  motif_suspension?: string | null;
};

export type StatistiquesBrutes = {
  entreprises: number;
  entreprises_actives: number;
  entreprises_suspendues: number;
  utilisateurs: number;
  entreprises_avec_vente: number;
  inscriptions_30_jours: number;
  par_plan: { plan: Plan; nombre: number }[];
};

export type DepotAdmin = {
  trouverAdminParEmail(email: string): Promise<CompteAdminAvecSecret | null>;
  creerSession(entree: {
    admin_id: string;
    empreinte: Buffer;
    expire_le: Date;
    ip: string | null;
    user_agent: string | null;
  }): Promise<void>;
  resoudreSession(empreinte: Buffer): Promise<SessionAdminResolue | null>;
  revoquerSession(empreinte: Buffer): Promise<void>;
  marquerConnexion(adminId: string): Promise<void>;

  listerEntreprises(filtres: FiltresEntreprises): Promise<Page<EntrepriseAdmin>>;
  trouverEntreprise(id: string): Promise<EntrepriseAdmin | null>;
  modifierEntreprise(id: string, patch: PatchEntrepriseAdmin): Promise<EntrepriseAdmin | null>;
  /** `false` si l'utilisateur n'existe pas. Révoque toutes ses sessions. */
  reinitialiserMotDePasse(utilisateurId: string, empreinte: string): Promise<boolean>;
  statistiques(): Promise<StatistiquesBrutes>;

  /** Utilisé par `npm run comptes`, jamais exposé en HTTP (§9). */
  creerAdmin(entree: {
    nom: string;
    email: string;
    mot_de_passe_hash: string;
  }): Promise<AdminPublic>;

  /**
   * Inventaire des administrateurs — `npm run comptes etat`, jamais en HTTP.
   *
   * Ne renvoie aucune empreinte : savoir QUI peut ouvrir la console est une
   * information d'exploitation, le secret qui va avec n'en est pas une.
   */
  listerAdmins(): Promise<FicheAdmin[]>;

  /**
   * Repose le mot de passe d'un administrateur — `npm run comptes admin:mdp`.
   *
   * En ligne de commande **uniquement** : une réinitialisation d'admin exposée
   * en HTTP ferait de cette route la porte d'entrée de tout le service (§9).
   * `false` si aucun administrateur ne porte cet e-mail.
   */
  changerMotDePasseAdmin(email: string, empreinte: string): Promise<boolean>;
};

/** Fiche d'administrateur pour l'inventaire en ligne de commande. */
export type FicheAdmin = {
  admin: AdminPublic;
  statut: StatutCompte;
  cree_le: Date;
  derniere_connexion_le: Date | null;
};

export class EmailAdminDejaPris extends Error {
  constructor() {
    super("Un administrateur utilise déjà cet e-mail.");
    this.name = "EmailAdminDejaPris";
  }
}

type LigneEntrepriseAdmin = {
  id: string;
  nom: string;
  secteur_code: string;
  pays: string | null;
  devise: string;
  plan: Plan;
  statut: StatutCompte;
  motif_suspension: string | null;
  cree_le: Date;
  proprietaire_id: string | null;
  proprietaire_nom: string | null;
  proprietaire_email: string | null;
  nombre_utilisateurs: string;
  nombre_ventes: string;
  nombre_depenses: string;
  derniere_activite_le: Date | null;
};

function versEntrepriseAdmin(ligne: LigneEntrepriseAdmin): EntrepriseAdmin {
  return {
    id: ligne.id,
    nom: ligne.nom,
    secteur: ligne.secteur_code,
    pays: ligne.pays,
    devise: ligne.devise,
    plan: ligne.plan,
    statut: ligne.statut,
    motif_suspension: ligne.motif_suspension,
    cree_le: ligne.cree_le.toISOString(),
    proprietaire:
      ligne.proprietaire_id === null || ligne.proprietaire_nom === null
        ? null
        : {
            id: ligne.proprietaire_id,
            nom: ligne.proprietaire_nom,
            email: ligne.proprietaire_email ?? "",
          },
    // `count(*)` rend un `bigint`, livré en chaîne par node-postgres : la
    // conversion est explicite (piège rencontré en Vague 4b).
    nombre_utilisateurs: Number(ligne.nombre_utilisateurs),
    nombre_ventes: Number(ligne.nombre_ventes),
    nombre_depenses: Number(ligne.nombre_depenses),
    derniere_activite_le:
      ligne.derniere_activite_le === null ? null : ligne.derniere_activite_le.toISOString(),
  };
}

/**
 * Colonnes d'une fiche entreprise vue de l'administration.
 *
 * Les volumes passent par des sous-requêtes corrélées plutôt que par des
 * jointures : trois `LEFT JOIN` sur des tables de lignes multiplieraient les
 * lignes entre elles et fausseraient tous les comptes.
 */
const COLONNES_ENTREPRISE_ADMIN = `
  e.id, e.nom, e.secteur_code, e.pays, e.devise, e.plan, e.statut,
  e.motif_suspension, e.cree_le,
  p.id    AS proprietaire_id,
  p.nom   AS proprietaire_nom,
  p.email AS proprietaire_email,
  (SELECT count(*) FROM utilisateurs u WHERE u.entreprise_id = e.id) AS nombre_utilisateurs,
  (SELECT count(*) FROM ventes   v WHERE v.entreprise_id = e.id AND v.supprime_le IS NULL) AS nombre_ventes,
  (SELECT count(*) FROM depenses d WHERE d.entreprise_id = e.id AND d.supprime_le IS NULL) AS nombre_depenses,
  (SELECT max(s.derniere_activite_le)
     FROM sessions s
     JOIN utilisateurs u2 ON u2.id = s.utilisateur_id
    WHERE u2.entreprise_id = e.id) AS derniere_activite_le
`;

/** Le propriétaire du compte : le plus ancien utilisateur portant ce rôle. */
const JOINTURE_PROPRIETAIRE = `
  LEFT JOIN LATERAL (
    SELECT u.id, u.nom, u.email
      FROM utilisateurs u
     WHERE u.entreprise_id = e.id AND u.role = 'PROPRIETAIRE'
     ORDER BY u.cree_le
     LIMIT 1
  ) p ON true
`;

export function creerDepotAdmin(pool: Pool): DepotAdmin {
  return {
    async trouverAdminParEmail(email) {
      const resultat = await pool.query<{
        id: string;
        nom: string;
        email: string;
        mot_de_passe_hash: string;
        statut: StatutCompte;
      }>(
        `SELECT id, nom, email, mot_de_passe_hash, statut
           FROM admins
          WHERE lower(email) = lower($1)
          LIMIT 1`,
        [email],
      );

      const ligne = resultat.rows[0];
      if (ligne === undefined) return null;

      return {
        admin: { id: ligne.id, nom: ligne.nom, email: ligne.email },
        mot_de_passe_hash: ligne.mot_de_passe_hash,
        statut: ligne.statut,
      };
    },

    async creerSession(entree) {
      await pool.query(
        `INSERT INTO admin_sessions (admin_id, token_hash, expire_le, ip, user_agent)
         VALUES ($1, $2, $3, $4, $5)`,
        [entree.admin_id, entree.empreinte, entree.expire_le, entree.ip, entree.user_agent],
      );
    },

    async resoudreSession(empreinte) {
      const resultat = await pool.query<{
        session_id: string;
        derniere_activite_le: Date;
        id: string;
        nom: string;
        email: string;
        statut: StatutCompte;
      }>(
        `SELECT s.id AS session_id, s.derniere_activite_le,
                a.id, a.nom, a.email, a.statut
           FROM admin_sessions s
           JOIN admins a ON a.id = s.admin_id
          WHERE s.token_hash = $1
            AND s.revoquee_le IS NULL
            AND s.expire_le > now()
          LIMIT 1`,
        [empreinte],
      );

      const ligne = resultat.rows[0];
      if (ligne === undefined) return null;

      return {
        session_id: ligne.session_id,
        admin: { id: ligne.id, nom: ligne.nom, email: ligne.email },
        statut: ligne.statut,
        derniere_activite_le: ligne.derniere_activite_le,
      };
    },

    async revoquerSession(empreinte) {
      await pool.query(
        `UPDATE admin_sessions SET revoquee_le = now()
          WHERE token_hash = $1 AND revoquee_le IS NULL`,
        [empreinte],
      );
    },

    async marquerConnexion(adminId) {
      await pool.query(`UPDATE admins SET derniere_connexion_le = now() WHERE id = $1`, [adminId]);
    },

    async listerEntreprises(filtres) {
      const conditions: string[] = [];
      const valeurs: unknown[] = [];

      if (filtres.recherche !== null) {
        valeurs.push(`%${filtres.recherche}%`);
        // Le nom de l'entreprise OU l'e-mail d'un de ses utilisateurs : au
        // support, on reçoit presque toujours l'e-mail, pas le nom exact.
        conditions.push(
          `(e.nom ILIKE $${valeurs.length}
            OR EXISTS (SELECT 1 FROM utilisateurs u3
                        WHERE u3.entreprise_id = e.id AND u3.email ILIKE $${valeurs.length}))`,
        );
      }
      if (filtres.statut !== null) {
        valeurs.push(filtres.statut);
        conditions.push(`e.statut = $${valeurs.length}`);
      }
      if (filtres.plan !== null) {
        valeurs.push(filtres.plan);
        conditions.push(`e.plan = $${valeurs.length}`);
      }

      const ou = conditions.length === 0 ? "" : `WHERE ${conditions.join(" AND ")}`;

      const total = await pool.query<{ total: string }>(
        `SELECT count(*) AS total FROM entreprises e ${ou}`,
        valeurs,
      );

      valeurs.push(filtres.limite, filtres.decalage);
      const elements = await pool.query<LigneEntrepriseAdmin>(
        `SELECT ${COLONNES_ENTREPRISE_ADMIN}
           FROM entreprises e
           ${JOINTURE_PROPRIETAIRE}
           ${ou}
          ORDER BY e.cree_le DESC
          LIMIT $${valeurs.length - 1} OFFSET $${valeurs.length}`,
        valeurs,
      );

      return {
        elements: elements.rows.map(versEntrepriseAdmin),
        total: Number(total.rows[0]?.total ?? 0),
        limite: filtres.limite,
        decalage: filtres.decalage,
      };
    },

    async trouverEntreprise(id) {
      const resultat = await pool.query<LigneEntrepriseAdmin>(
        `SELECT ${COLONNES_ENTREPRISE_ADMIN}
           FROM entreprises e
           ${JOINTURE_PROPRIETAIRE}
          WHERE e.id = $1`,
        [id],
      );
      const ligne = resultat.rows[0];
      return ligne === undefined ? null : versEntrepriseAdmin(ligne);
    },

    /**
     * Change plan et/ou statut, et révoque les sessions en cas de suspension.
     *
     * Une seule transaction : suspendre sans révoquer laisserait le compte
     * utilisable jusqu'à sa prochaine requête, et révoquer sans suspendre
     * déconnecterait un compte qui reste actif.
     */
    async modifierEntreprise(id, patch) {
      return dansTransaction(pool, async (client) => {
        const colonnes: string[] = [];
        const valeurs: unknown[] = [id];

        const poser = (colonne: string, valeur: unknown): void => {
          valeurs.push(valeur);
          colonnes.push(`${colonne} = $${valeurs.length}`);
        };

        if (patch.plan !== undefined) poser("plan", patch.plan);

        if (patch.statut === "SUSPENDU") {
          poser("statut", "SUSPENDU");
          poser("motif_suspension", patch.motif_suspension ?? null);
          // La contrainte `entreprises_suspension_coherente` impose le couple :
          // pas de « suspendu depuis jamais ».
          colonnes.push("suspendue_le = coalesce(suspendue_le, now())");
        } else if (patch.statut === "ACTIF") {
          poser("statut", "ACTIF");
          colonnes.push("motif_suspension = NULL", "suspendue_le = NULL");
        }

        if (colonnes.length > 0) {
          const modifiee = await client.query(
            `UPDATE entreprises SET ${colonnes.join(", ")} WHERE id = $1 RETURNING id`,
            valeurs,
          );
          if (modifiee.rowCount === 0) return null;
        }

        if (patch.statut === "SUSPENDU") {
          await client.query(
            `UPDATE sessions SET revoquee_le = now()
              WHERE revoquee_le IS NULL
                AND utilisateur_id IN (SELECT id FROM utilisateurs WHERE entreprise_id = $1)`,
            [id],
          );
        }

        const relu = await client.query<LigneEntrepriseAdmin>(
          `SELECT ${COLONNES_ENTREPRISE_ADMIN}
             FROM entreprises e
             ${JOINTURE_PROPRIETAIRE}
            WHERE e.id = $1`,
          [id],
        );
        const ligne = relu.rows[0];
        return ligne === undefined ? null : versEntrepriseAdmin(ligne);
      });
    },

    async reinitialiserMotDePasse(utilisateurId, empreinte) {
      return dansTransaction(pool, async (client) => {
        const modifie = await client.query(
          `UPDATE utilisateurs SET mot_de_passe_hash = $2 WHERE id = $1 RETURNING id`,
          [utilisateurId, empreinte],
        );
        if (modifie.rowCount === 0) return false;

        // Toutes les sessions tombent, sans exception : la réinitialisation
        // sert précisément aux cas où l'on soupçonne un accès illégitime.
        await client.query(
          `UPDATE sessions SET revoquee_le = now()
            WHERE utilisateur_id = $1 AND revoquee_le IS NULL`,
          [utilisateurId],
        );
        return true;
      });
    },

    async statistiques() {
      const [global, parPlan] = await Promise.all([
        pool.query<{
          entreprises: string;
          entreprises_actives: string;
          entreprises_suspendues: string;
          utilisateurs: string;
          entreprises_avec_vente: string;
          inscriptions_30_jours: string;
        }>(
          `SELECT
             (SELECT count(*) FROM entreprises)                              AS entreprises,
             (SELECT count(*) FROM entreprises WHERE statut = 'ACTIF')       AS entreprises_actives,
             (SELECT count(*) FROM entreprises WHERE statut = 'SUSPENDU')    AS entreprises_suspendues,
             (SELECT count(*) FROM utilisateurs)                             AS utilisateurs,
             (SELECT count(DISTINCT entreprise_id) FROM ventes
               WHERE supprime_le IS NULL)                                    AS entreprises_avec_vente,
             (SELECT count(*) FROM entreprises
               WHERE cree_le > now() - interval '30 days')                   AS inscriptions_30_jours`,
        ),
        pool.query<{ plan: Plan; nombre: string }>(
          `SELECT plan, count(*) AS nombre FROM entreprises GROUP BY plan ORDER BY plan`,
        ),
      ]);

      const ligne = global.rows[0];
      return {
        entreprises: Number(ligne?.entreprises ?? 0),
        entreprises_actives: Number(ligne?.entreprises_actives ?? 0),
        entreprises_suspendues: Number(ligne?.entreprises_suspendues ?? 0),
        utilisateurs: Number(ligne?.utilisateurs ?? 0),
        entreprises_avec_vente: Number(ligne?.entreprises_avec_vente ?? 0),
        inscriptions_30_jours: Number(ligne?.inscriptions_30_jours ?? 0),
        par_plan: parPlan.rows.map((r) => ({ plan: r.plan, nombre: Number(r.nombre) })),
      };
    },

    async creerAdmin(entree) {
      try {
        const resultat = await pool.query<AdminPublic>(
          `INSERT INTO admins (nom, email, mot_de_passe_hash)
           VALUES ($1, $2, $3)
           RETURNING id, nom, email`,
          [entree.nom, entree.email, entree.mot_de_passe_hash],
        );
        const ligne = resultat.rows[0];
        if (ligne === undefined) throw new Error("création d'admin sans identifiant");
        return ligne;
      } catch (cause) {
        if (estViolationUnicite(cause, "admins_email_unique")) throw new EmailAdminDejaPris();
        throw cause;
      }
    },

    async listerAdmins() {
      const resultat = await pool.query<{
        id: string;
        nom: string;
        email: string;
        statut: StatutCompte;
        cree_le: Date;
        derniere_connexion_le: Date | null;
      }>(
        `SELECT id, nom, email, statut, cree_le, derniere_connexion_le
           FROM admins
          ORDER BY cree_le`,
      );

      return resultat.rows.map((ligne) => ({
        admin: { id: ligne.id, nom: ligne.nom, email: ligne.email },
        statut: ligne.statut,
        cree_le: ligne.cree_le,
        derniere_connexion_le: ligne.derniere_connexion_le,
      }));
    },

    async changerMotDePasseAdmin(email, empreinte) {
      return dansTransaction(pool, async (client) => {
        const modifie = await client.query<{ id: string }>(
          `UPDATE admins SET mot_de_passe_hash = $2
            WHERE lower(email) = lower($1)
            RETURNING id`,
          [email, empreinte],
        );

        const ligne = modifie.rows[0];
        if (ligne === undefined) return false;

        // Mêmes raisons que pour un client (`reinitialiserMotDePasse`) : on
        // repose un mot de passe justement quand l'ancien n'est plus sûr, ou
        // plus connu. Laisser vivre les sessions ouvertes viderait le geste de
        // son sens.
        await client.query(
          `UPDATE admin_sessions SET revoquee_le = now()
            WHERE admin_id = $1 AND revoquee_le IS NULL`,
          [ligne.id],
        );
        return true;
      });
    },
  };
}
