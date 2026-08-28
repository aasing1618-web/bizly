import type { Pool } from "pg";
import type { Client, Produit } from "@bizly/shared";
import { estViolationUnicite } from "../../db/transaction.js";

/**
 * Accès aux données du catalogue et du fichier clients.
 *
 * Comme partout, chaque requête filtre sur `entreprise_id` — sans exception.
 */

export class NomDejaPris extends Error {
  constructor() {
    super("Un produit porte déjà ce nom.");
    this.name = "NomDejaPris";
  }
}

export type LigneProduitDb = {
  id: string;
  nom: string;
  categorie: string | null;
  prix_mineur: bigint;
  cout_mineur: bigint | null;
  cree_le: Date;
};

export type LigneClientDb = {
  id: string;
  nom: string;
  email: string | null;
  telephone: string | null;
  note: string | null;
  cree_le: Date;
};

export type FiltresDepotCatalogue = {
  recherche: string | null;
  categorie: string | null;
  limite: number;
  decalage: number;
};

export type EntreeProduitDb = {
  nom: string;
  categorie: string | null;
  prix_mineur: bigint;
  cout_mineur: bigint | null;
};

export type PatchProduitDb = Partial<EntreeProduitDb>;

export type EntreeClientDb = {
  nom: string;
  email: string | null;
  telephone: string | null;
  note: string | null;
};

export type PatchClientDb = Partial<EntreeClientDb>;

export type PageBrute<T> = { elements: T[]; total: number };

export type DepotCatalogue = {
  listerProduits(
    entrepriseId: string,
    filtres: FiltresDepotCatalogue,
  ): Promise<PageBrute<LigneProduitDb>>;
  trouverProduit(entrepriseId: string, id: string): Promise<LigneProduitDb | null>;
  creerProduit(entrepriseId: string, entree: EntreeProduitDb): Promise<LigneProduitDb>;
  modifierProduit(
    entrepriseId: string,
    id: string,
    patch: PatchProduitDb,
  ): Promise<LigneProduitDb | null>;
  supprimerProduit(entrepriseId: string, id: string): Promise<boolean>;
  /** Produits vivants dont l'identifiant est fourni, pour recopier nom et prix. */
  chargerProduits(entrepriseId: string, ids: string[]): Promise<Map<string, LigneProduitDb>>;

  listerClients(
    entrepriseId: string,
    filtres: FiltresDepotCatalogue,
  ): Promise<PageBrute<LigneClientDb>>;
  trouverClient(entrepriseId: string, id: string): Promise<LigneClientDb | null>;
  creerClient(entrepriseId: string, entree: EntreeClientDb): Promise<LigneClientDb>;
  modifierClient(
    entrepriseId: string,
    id: string,
    patch: PatchClientDb,
  ): Promise<LigneClientDb | null>;
  supprimerClient(entrepriseId: string, id: string): Promise<boolean>;
  clientAppartient(entrepriseId: string, id: string): Promise<boolean>;
};

const COLONNES_PRODUIT = `id, nom, categorie, prix_mineur, cout_mineur, cree_le`;
const COLONNES_CLIENT = `id, nom, email, telephone, note, cree_le`;

function versNombre(valeur: bigint | number | undefined): number {
  return typeof valeur === "bigint" ? Number(valeur) : (valeur ?? 0);
}

export function versProduit(ligne: LigneProduitDb): Produit {
  return {
    id: ligne.id,
    nom: ligne.nom,
    categorie: ligne.categorie,
    prix_mineur: Number(ligne.prix_mineur),
    cout_mineur: ligne.cout_mineur === null ? null : Number(ligne.cout_mineur),
    cree_le: ligne.cree_le.toISOString(),
  };
}

export function versClient(ligne: LigneClientDb): Client {
  return {
    id: ligne.id,
    nom: ligne.nom,
    email: ligne.email,
    telephone: ligne.telephone,
    note: ligne.note,
    cree_le: ligne.cree_le.toISOString(),
  };
}

export function creerDepotCatalogue(pool: Pool): DepotCatalogue {
  return {
    async listerProduits(entrepriseId, filtres) {
      const resultat = await pool.query<LigneProduitDb & { total_filtre: bigint }>(
        `SELECT ${COLONNES_PRODUIT}, count(*) OVER () AS total_filtre
           FROM produits
          WHERE entreprise_id = $1
            AND supprime_le IS NULL
            AND ($2::text IS NULL OR nom ILIKE '%' || $2 || '%')
            AND ($3::text IS NULL OR categorie = $3)
          ORDER BY nom
          LIMIT $4 OFFSET $5`,
        [entrepriseId, filtres.recherche, filtres.categorie, filtres.limite, filtres.decalage],
      );
      return { elements: resultat.rows, total: versNombre(resultat.rows[0]?.total_filtre) };
    },

    async trouverProduit(entrepriseId, id) {
      const resultat = await pool.query<LigneProduitDb>(
        `SELECT ${COLONNES_PRODUIT} FROM produits
          WHERE id = $1 AND entreprise_id = $2 AND supprime_le IS NULL`,
        [id, entrepriseId],
      );
      return resultat.rows[0] ?? null;
    },

    async creerProduit(entrepriseId, entree) {
      try {
        const resultat = await pool.query<LigneProduitDb>(
          `INSERT INTO produits (entreprise_id, nom, categorie, prix_mineur, cout_mineur)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING ${COLONNES_PRODUIT}`,
          [
            entrepriseId,
            entree.nom,
            entree.categorie,
            entree.prix_mineur.toString(),
            entree.cout_mineur?.toString() ?? null,
          ],
        );
        const ligne = resultat.rows[0];
        if (ligne === undefined) throw new Error("produit créé sans ligne rendue");
        return ligne;
      } catch (cause) {
        // On s'appuie sur l'index unique plutôt que sur un SELECT préalable :
        // entre le SELECT et l'INSERT, deux créations simultanées passeraient.
        if (estViolationUnicite(cause, "produits_nom_unique")) throw new NomDejaPris();
        throw cause;
      }
    },

    async modifierProduit(entrepriseId, id, patch) {
      try {
        const resultat = await pool.query<LigneProduitDb>(
          `UPDATE produits SET
             nom         = CASE WHEN $3::boolean THEN $4::text   ELSE nom END,
             categorie   = CASE WHEN $5::boolean THEN $6::text   ELSE categorie END,
             prix_mineur = CASE WHEN $7::boolean THEN $8::bigint ELSE prix_mineur END,
             cout_mineur = CASE WHEN $9::boolean THEN $10::bigint ELSE cout_mineur END
           WHERE id = $1 AND entreprise_id = $2 AND supprime_le IS NULL
           RETURNING ${COLONNES_PRODUIT}`,
          [
            id,
            entrepriseId,
            patch.nom !== undefined,
            patch.nom ?? null,
            patch.categorie !== undefined,
            patch.categorie ?? null,
            patch.prix_mineur !== undefined,
            patch.prix_mineur?.toString() ?? null,
            patch.cout_mineur !== undefined,
            patch.cout_mineur?.toString() ?? null,
          ],
        );
        return resultat.rows[0] ?? null;
      } catch (cause) {
        if (estViolationUnicite(cause, "produits_nom_unique")) throw new NomDejaPris();
        throw cause;
      }
    },

    async supprimerProduit(entrepriseId, id) {
      // Suppression douce : les lignes de vente qui le référencent restent
      // valides, et leur `libelle` continue d'afficher l'historique.
      const resultat = await pool.query(
        `UPDATE produits SET supprime_le = now()
          WHERE id = $1 AND entreprise_id = $2 AND supprime_le IS NULL`,
        [id, entrepriseId],
      );
      return resultat.rowCount === 1;
    },

    async chargerProduits(entrepriseId, ids) {
      if (ids.length === 0) return new Map();

      const resultat = await pool.query<LigneProduitDb>(
        `SELECT ${COLONNES_PRODUIT} FROM produits
          WHERE entreprise_id = $1 AND supprime_le IS NULL AND id = ANY($2::uuid[])`,
        [entrepriseId, ids],
      );
      return new Map(resultat.rows.map((ligne) => [ligne.id, ligne]));
    },

    async listerClients(entrepriseId, filtres) {
      const resultat = await pool.query<LigneClientDb & { total_filtre: bigint }>(
        `SELECT ${COLONNES_CLIENT}, count(*) OVER () AS total_filtre
           FROM clients
          WHERE entreprise_id = $1
            AND supprime_le IS NULL
            AND ($2::text IS NULL OR nom ILIKE '%' || $2 || '%')
          ORDER BY nom
          LIMIT $3 OFFSET $4`,
        [entrepriseId, filtres.recherche, filtres.limite, filtres.decalage],
      );
      return { elements: resultat.rows, total: versNombre(resultat.rows[0]?.total_filtre) };
    },

    async trouverClient(entrepriseId, id) {
      const resultat = await pool.query<LigneClientDb>(
        `SELECT ${COLONNES_CLIENT} FROM clients
          WHERE id = $1 AND entreprise_id = $2 AND supprime_le IS NULL`,
        [id, entrepriseId],
      );
      return resultat.rows[0] ?? null;
    },

    async creerClient(entrepriseId, entree) {
      const resultat = await pool.query<LigneClientDb>(
        `INSERT INTO clients (entreprise_id, nom, email, telephone, note)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING ${COLONNES_CLIENT}`,
        [entrepriseId, entree.nom, entree.email, entree.telephone, entree.note],
      );
      const ligne = resultat.rows[0];
      if (ligne === undefined) throw new Error("client créé sans ligne rendue");
      return ligne;
    },

    async modifierClient(entrepriseId, id, patch) {
      const resultat = await pool.query<LigneClientDb>(
        `UPDATE clients SET
           nom       = CASE WHEN $3::boolean THEN $4::text ELSE nom END,
           email     = CASE WHEN $5::boolean THEN $6::text ELSE email END,
           telephone = CASE WHEN $7::boolean THEN $8::text ELSE telephone END,
           note      = CASE WHEN $9::boolean THEN $10::text ELSE note END
         WHERE id = $1 AND entreprise_id = $2 AND supprime_le IS NULL
         RETURNING ${COLONNES_CLIENT}`,
        [
          id,
          entrepriseId,
          patch.nom !== undefined,
          patch.nom ?? null,
          patch.email !== undefined,
          patch.email ?? null,
          patch.telephone !== undefined,
          patch.telephone ?? null,
          patch.note !== undefined,
          patch.note ?? null,
        ],
      );
      return resultat.rows[0] ?? null;
    },

    async supprimerClient(entrepriseId, id) {
      const resultat = await pool.query(
        `UPDATE clients SET supprime_le = now()
          WHERE id = $1 AND entreprise_id = $2 AND supprime_le IS NULL`,
        [id, entrepriseId],
      );
      return resultat.rowCount === 1;
    },

    async clientAppartient(entrepriseId, id) {
      const resultat = await pool.query(
        `SELECT 1 FROM clients
          WHERE id = $1 AND entreprise_id = $2 AND supprime_le IS NULL`,
        [id, entrepriseId],
      );
      return resultat.rowCount === 1;
    },
  };
}
