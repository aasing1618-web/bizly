import type { Pool } from "pg";
import type {
  EntreprisePublique,
  Plan,
  ReponseSession,
  Role,
  UtilisateurPublic,
} from "@bizly/shared";
import { dansTransaction, estViolationUnicite } from "../../db/transaction.js";

/**
 * Accès aux données d'authentification.
 *
 * Défini comme une **interface** et non comme un ensemble de fonctions : les
 * tests injectent une implémentation en mémoire et couvrent toute la logique de
 * connexion, d'inscription et de session sans Postgres. Seule
 * `creerDepotPg` parle SQL.
 */

export type CompteAvecSecret = {
  utilisateur: UtilisateurPublic;
  entreprise: EntreprisePublique;
  /** Ne sort jamais de la couche service. */
  mot_de_passe_hash: string;
  statut_utilisateur: "ACTIF" | "SUSPENDU";
};

export type EntreeInscription = {
  entreprise: {
    nom: string;
    secteur: string;
    pays: string | null;
    devise: string;
    fuseau: string;
  };
  utilisateur: { nom: string; email: string; mot_de_passe_hash: string };
};

export type SessionResolue = {
  session_id: string;
  expire_le: Date;
  derniere_activite_le: Date;
  utilisateur: UtilisateurPublic;
  entreprise: EntreprisePublique;
  statut_utilisateur: "ACTIF" | "SUSPENDU";
};

export type EntreeSession = {
  utilisateur_id: string;
  empreinte: Buffer;
  expire_le: Date;
  ip: string | null;
  user_agent: string | null;
};

export type DepotAuth = {
  trouverCompteParEmail(email: string): Promise<CompteAvecSecret | null>;
  /** Lève `EmailDejaPris` si l'e-mail existe déjà. */
  creerCompte(entree: EntreeInscription): Promise<ReponseSession>;
  creerSession(entree: EntreeSession): Promise<void>;
  resoudreSession(empreinte: Buffer): Promise<SessionResolue | null>;
  revoquerSession(empreinte: Buffer): Promise<void>;
  prolongerSession(sessionId: string, expireLe: Date): Promise<void>;
  marquerConnexion(utilisateurId: string): Promise<void>;
  secteurExiste(code: string): Promise<boolean>;
  deviseExiste(code: string): Promise<boolean>;
};

export class EmailDejaPris extends Error {
  constructor() {
    super("Cet e-mail est déjà utilisé.");
    this.name = "EmailDejaPris";
  }
}

// ---------------------------------------------------------------------------
// Projection SQL → formes publiques
// ---------------------------------------------------------------------------

type LigneCompte = {
  utilisateur_id: string;
  utilisateur_nom: string;
  email: string;
  role: Role;
  statut_utilisateur: "ACTIF" | "SUSPENDU";
  mot_de_passe_hash: string;
  entreprise_id: string;
  entreprise_nom: string;
  secteur_code: string;
  pays: string | null;
  devise_code: string;
  devise_decimales: number;
  fuseau: string;
  plan: Plan;
  statut_entreprise: "ACTIF" | "SUSPENDU";
};

function versUtilisateur(ligne: LigneCompte): UtilisateurPublic {
  return {
    id: ligne.utilisateur_id,
    nom: ligne.utilisateur_nom,
    email: ligne.email,
    role: ligne.role,
  };
}

function versEntreprise(ligne: LigneCompte): EntreprisePublique {
  return {
    id: ligne.entreprise_id,
    nom: ligne.entreprise_nom,
    secteur: ligne.secteur_code,
    pays: ligne.pays,
    devise: { code: ligne.devise_code, decimales: ligne.devise_decimales },
    fuseau: ligne.fuseau,
    plan: ligne.plan,
    statut: ligne.statut_entreprise,
  };
}

/**
 * Colonnes communes à toutes les lectures de compte.
 *
 * La devise est jointe et **résolue** ici : le client reçoit `decimales` et ne
 * peut pas supposer « 2 » — ce qui, en XOF, se traduirait par un facteur 100
 * d'erreur sur chaque montant affiché.
 */
const COLONNES_COMPTE = `
  u.id                AS utilisateur_id,
  u.nom               AS utilisateur_nom,
  u.email             AS email,
  u.role              AS role,
  u.statut            AS statut_utilisateur,
  u.mot_de_passe_hash AS mot_de_passe_hash,
  e.id                AS entreprise_id,
  e.nom               AS entreprise_nom,
  e.secteur_code      AS secteur_code,
  e.pays              AS pays,
  d.code              AS devise_code,
  d.decimales         AS devise_decimales,
  e.fuseau            AS fuseau,
  e.plan              AS plan,
  e.statut            AS statut_entreprise
`;

// ---------------------------------------------------------------------------

export function creerDepotPg(pool: Pool): DepotAuth {
  return {
    async trouverCompteParEmail(email) {
      const resultat = await pool.query<LigneCompte>(
        `SELECT ${COLONNES_COMPTE}
           FROM utilisateurs u
           JOIN entreprises  e ON e.id = u.entreprise_id
           JOIN devises      d ON d.code = e.devise
          WHERE lower(u.email) = lower($1)
          LIMIT 1`,
        [email],
      );

      const ligne = resultat.rows[0];
      if (ligne === undefined) return null;

      return {
        utilisateur: versUtilisateur(ligne),
        entreprise: versEntreprise(ligne),
        mot_de_passe_hash: ligne.mot_de_passe_hash,
        statut_utilisateur: ligne.statut_utilisateur,
      };
    },

    /**
     * Crée l'entreprise, son propriétaire, son compteur de ventes et ses
     * catégories de dépense — en une seule transaction.
     *
     * Une entreprise sans compteur ni catégories serait cassée dès la première
     * saisie : ces quatre écritures forment une unité, pas une séquence.
     */
    async creerCompte(entree) {
      try {
        return await dansTransaction(pool, async (client) => {
          const entreprise = await client.query<{ id: string }>(
            `INSERT INTO entreprises (nom, secteur_code, pays, devise, fuseau)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id`,
            [
              entree.entreprise.nom,
              entree.entreprise.secteur,
              entree.entreprise.pays,
              entree.entreprise.devise,
              entree.entreprise.fuseau,
            ],
          );
          const entrepriseId = entreprise.rows[0]?.id;
          if (entrepriseId === undefined) throw new Error("création d'entreprise sans identifiant");

          const utilisateur = await client.query<{ id: string }>(
            `INSERT INTO utilisateurs (entreprise_id, email, mot_de_passe_hash, nom, role)
             VALUES ($1, $2, $3, $4, 'PROPRIETAIRE')
             RETURNING id`,
            [
              entrepriseId,
              entree.utilisateur.email,
              entree.utilisateur.mot_de_passe_hash,
              entree.utilisateur.nom,
            ],
          );
          const utilisateurId = utilisateur.rows[0]?.id;
          if (utilisateurId === undefined) throw new Error("création d'utilisateur sans identifiant");

          await client.query(
            `INSERT INTO compteurs (entreprise_id, nom, valeur) VALUES ($1, 'vente', 0)`,
            [entrepriseId],
          );

          // Copie des modèles applicables : ceux de tous secteurs (tableau vide)
          // et ceux qui citent explicitement le secteur choisi.
          await client.query(
            `INSERT INTO categories_depense (entreprise_id, code, libelle, ordre)
             SELECT $1, m.code, m.libelle, m.ordre
               FROM modeles_categorie_depense m
              WHERE cardinality(m.secteurs) = 0 OR $2 = ANY(m.secteurs)`,
            [entrepriseId, entree.entreprise.secteur],
          );

          const relu = await client.query<LigneCompte>(
            `SELECT ${COLONNES_COMPTE}
               FROM utilisateurs u
               JOIN entreprises  e ON e.id = u.entreprise_id
               JOIN devises      d ON d.code = e.devise
              WHERE u.id = $1`,
            [utilisateurId],
          );
          const ligne = relu.rows[0];
          if (ligne === undefined) throw new Error("compte introuvable juste après création");

          return { utilisateur: versUtilisateur(ligne), entreprise: versEntreprise(ligne) };
        });
      } catch (cause) {
        // On s'appuie sur la contrainte d'unicité plutôt que sur un SELECT
        // préalable : entre le SELECT et l'INSERT, deux inscriptions
        // simultanées passeraient toutes les deux.
        if (estViolationUnicite(cause, "utilisateurs_email_unique")) throw new EmailDejaPris();
        throw cause;
      }
    },

    async creerSession(entree) {
      await pool.query(
        `INSERT INTO sessions (utilisateur_id, token_hash, expire_le, ip, user_agent)
         VALUES ($1, $2, $3, $4, $5)`,
        [entree.utilisateur_id, entree.empreinte, entree.expire_le, entree.ip, entree.user_agent],
      );
    },

    async resoudreSession(empreinte) {
      const resultat = await pool.query<LigneCompte & {
        session_id: string;
        expire_le: Date;
        derniere_activite_le: Date;
      }>(
        `SELECT ${COLONNES_COMPTE},
                s.id                   AS session_id,
                s.expire_le            AS expire_le,
                s.derniere_activite_le AS derniere_activite_le
           FROM sessions     s
           JOIN utilisateurs u ON u.id = s.utilisateur_id
           JOIN entreprises  e ON e.id = u.entreprise_id
           JOIN devises      d ON d.code = e.devise
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
        expire_le: ligne.expire_le,
        derniere_activite_le: ligne.derniere_activite_le,
        utilisateur: versUtilisateur(ligne),
        entreprise: versEntreprise(ligne),
        statut_utilisateur: ligne.statut_utilisateur,
      };
    },

    async revoquerSession(empreinte) {
      await pool.query(
        `UPDATE sessions SET revoquee_le = now()
          WHERE token_hash = $1 AND revoquee_le IS NULL`,
        [empreinte],
      );
    },

    async prolongerSession(sessionId, expireLe) {
      await pool.query(
        `UPDATE sessions SET expire_le = $2, derniere_activite_le = now() WHERE id = $1`,
        [sessionId, expireLe],
      );
    },

    async marquerConnexion(utilisateurId) {
      await pool.query(`UPDATE utilisateurs SET derniere_connexion_le = now() WHERE id = $1`, [
        utilisateurId,
      ]);
    },

    async secteurExiste(code) {
      const resultat = await pool.query(`SELECT 1 FROM secteurs WHERE code = $1`, [code]);
      return resultat.rowCount === 1;
    },

    async deviseExiste(code) {
      const resultat = await pool.query(`SELECT 1 FROM devises WHERE code = $1`, [code]);
      return resultat.rowCount === 1;
    },
  };
}
