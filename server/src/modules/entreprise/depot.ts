import type { Pool } from "pg";
import type {
  EntreprisePublique,
  Plan,
  UtilisateurPublic,
  VolumesEnregistres,
} from "@bizly/shared";
import { dansTransaction } from "../../db/transaction.js";

/**
 * Paramètres de l'entreprise et du compte — docs/API-CONTRACT.md §8.
 *
 * Chaque requête porte son `entreprise_id` ou son `utilisateur_id` dans le
 * `WHERE`, jamais en confiance : ces identifiants viennent du contexte de
 * session, jamais du corps ni de l'URL.
 */

export type PatchEntreprise = {
  nom?: string;
  secteur?: string;
  pays?: string | null;
  devise?: string;
  fuseau?: string;
};

export type DepotEntreprise = {
  /** Ce qui empêche un changement de devise. Voir §8.2. */
  compterVolumes(entrepriseId: string): Promise<VolumesEnregistres>;
  modifierEntreprise(
    entrepriseId: string,
    patch: PatchEntreprise,
  ): Promise<EntreprisePublique | null>;
  modifierProfil(utilisateurId: string, nom: string): Promise<UtilisateurPublic | null>;
  lireEmpreinteMotDePasse(utilisateurId: string): Promise<string | null>;
  /**
   * Pose la nouvelle empreinte et révoque toutes les sessions SAUF celle
   * fournie. Une seule transaction : un mot de passe changé sans révocation
   * laisserait les sessions volées actives, et une révocation sans changement
   * déconnecterait pour rien.
   */
  changerMotDePasse(
    utilisateurId: string,
    empreinteMotDePasse: string,
    sessionConservee: Buffer,
  ): Promise<void>;
};

type LigneEntreprise = {
  id: string;
  nom: string;
  secteur_code: string;
  pays: string | null;
  devise_code: string;
  devise_decimales: number;
  fuseau: string;
  plan: Plan;
  statut: "ACTIF" | "SUSPENDU";
};

function versEntreprise(ligne: LigneEntreprise): EntreprisePublique {
  return {
    id: ligne.id,
    nom: ligne.nom,
    secteur: ligne.secteur_code,
    pays: ligne.pays,
    devise: { code: ligne.devise_code, decimales: ligne.devise_decimales },
    fuseau: ligne.fuseau,
    plan: ligne.plan,
    statut: ligne.statut,
  };
}

export function creerDepotEntreprise(pool: Pool): DepotEntreprise {
  return {
    /**
     * Compte ce que l'entreprise a déjà enregistré en montants.
     *
     * Les lignes supprimées (`supprime_le`) ne comptent pas : elles sont
     * invisibles partout ailleurs, les faire bloquer un changement de devise
     * serait incompréhensible pour l'utilisateur, qui les a effacées.
     */
    async compterVolumes(entrepriseId) {
      const resultat = await pool.query<{
        ventes: string;
        depenses: string;
        produits: string;
      }>(
        `SELECT
           (SELECT count(*) FROM ventes   WHERE entreprise_id = $1 AND supprime_le IS NULL) AS ventes,
           (SELECT count(*) FROM depenses WHERE entreprise_id = $1 AND supprime_le IS NULL) AS depenses,
           (SELECT count(*) FROM produits WHERE entreprise_id = $1 AND supprime_le IS NULL) AS produits`,
        [entrepriseId],
      );

      const ligne = resultat.rows[0];
      // `count(*)` rend un `bigint`, que node-postgres livre en chaîne : la
      // conversion est explicite, jamais implicite (cf. Vague 4b).
      return {
        ventes: Number(ligne?.ventes ?? 0),
        depenses: Number(ligne?.depenses ?? 0),
        produits: Number(ligne?.produits ?? 0),
      };
    },

    async modifierEntreprise(entrepriseId, patch) {
      const colonnes: string[] = [];
      const valeurs: unknown[] = [entrepriseId];

      const poser = (colonne: string, valeur: unknown): void => {
        valeurs.push(valeur);
        colonnes.push(`${colonne} = $${valeurs.length}`);
      };

      if (patch.nom !== undefined) poser("nom", patch.nom);
      if (patch.secteur !== undefined) poser("secteur_code", patch.secteur);
      if (patch.pays !== undefined) poser("pays", patch.pays);
      if (patch.devise !== undefined) poser("devise", patch.devise);
      if (patch.fuseau !== undefined) poser("fuseau", patch.fuseau);

      // Un UPDATE sans SET est syntaxiquement invalide : sans champ à écrire,
      // on relit. Le cas est déjà écarté par la validation de la route, cette
      // branche existe pour que le dépôt reste utilisable seul.
      const requete =
        colonnes.length === 0
          ? `SELECT e.id, e.nom, e.secteur_code, e.pays, e.fuseau, e.plan, e.statut,
                    d.code AS devise_code, d.decimales AS devise_decimales
               FROM entreprises e
               JOIN devises d ON d.code = e.devise
              WHERE e.id = $1`
          : `WITH modifiee AS (
               UPDATE entreprises SET ${colonnes.join(", ")}
                WHERE id = $1
                RETURNING id, nom, secteur_code, pays, devise, fuseau, plan, statut
             )
             SELECT m.id, m.nom, m.secteur_code, m.pays, m.fuseau, m.plan, m.statut,
                    d.code AS devise_code, d.decimales AS devise_decimales
               FROM modifiee m
               JOIN devises d ON d.code = m.devise`;

      const resultat = await pool.query<LigneEntreprise>(requete, valeurs);

      const ligne = resultat.rows[0];
      return ligne === undefined ? null : versEntreprise(ligne);
    },

    async modifierProfil(utilisateurId, nom) {
      const resultat = await pool.query<UtilisateurPublic>(
        `UPDATE utilisateurs SET nom = $2
          WHERE id = $1
          RETURNING id, nom, email, role`,
        [utilisateurId, nom],
      );
      return resultat.rows[0] ?? null;
    },

    async lireEmpreinteMotDePasse(utilisateurId) {
      const resultat = await pool.query<{ mot_de_passe_hash: string }>(
        `SELECT mot_de_passe_hash FROM utilisateurs WHERE id = $1`,
        [utilisateurId],
      );
      return resultat.rows[0]?.mot_de_passe_hash ?? null;
    },

    async changerMotDePasse(utilisateurId, empreinteMotDePasse, sessionConservee) {
      await dansTransaction(pool, async (client) => {
        await client.query(`UPDATE utilisateurs SET mot_de_passe_hash = $2 WHERE id = $1`, [
          utilisateurId,
          empreinteMotDePasse,
        ]);
        await client.query(
          `UPDATE sessions SET revoquee_le = now()
            WHERE utilisateur_id = $1
              AND revoquee_le IS NULL
              AND token_hash <> $2`,
          [utilisateurId, sessionConservee],
        );
      });
    },
  };
}
