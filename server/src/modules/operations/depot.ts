import type { Pool, PoolClient } from "pg";
import type { CategorieDepense, MoyenPaiement, StatutOperation } from "@bizly/shared";
import { dansTransaction } from "../../db/transaction.js";

/**
 * Accès aux données des ventes et dépenses.
 *
 * **Toute** requête filtre sur `entreprise_id`, sans exception. Une requête
 * métier sans ce filtre est un défaut de sécurité, pas un oubli de style
 * (AGENTS.md §3). L'identifiant vient du contexte de session, jamais du client.
 *
 * Le dépôt rend des lignes brutes ; la traduction vers les formes publiques
 * (dont `date_locale`, qui dépend du fuseau) est faite par le service.
 */

// ---------------------------------------------------------------------------
// Lignes brutes
// ---------------------------------------------------------------------------

export type LigneVenteDb = {
  id: string;
  numero: bigint;
  effectuee_le: Date;
  montant_total_mineur: bigint;
  moyen_paiement: MoyenPaiement | null;
  statut: StatutOperation;
  note: string | null;
  cree_le: Date;
  nombre_lignes: bigint;
  client_id: string | null;
  client_nom: string | null;
};

export type LigneDetailDb = {
  id: string;
  rang: number;
  produit_id: string | null;
  libelle: string;
  quantite: string;
  prix_unitaire_mineur: bigint;
  montant_mineur: bigint;
};

export type LigneDepenseDb = {
  id: string;
  effectuee_le: Date;
  montant_mineur: bigint;
  categorie_id: string | null;
  categorie_code: string | null;
  categorie_libelle: string | null;
  fournisseur: string | null;
  moyen_paiement: MoyenPaiement | null;
  statut: StatutOperation;
  note: string | null;
  cree_le: Date;
};

export type PageBrute<T> = { elements: T[]; total: number };

export type FiltresDepot = {
  debut: Date | null;
  fin: Date | null;
  statut: StatutOperation | null;
  moyen_paiement: MoyenPaiement | null;
  categorie_id: string | null;
  client_id: string | null;
  limite: number;
  decalage: number;
};

export type EntreeLigneDb = {
  produit_id: string | null;
  libelle: string;
  quantite: string;
  prix_unitaire_mineur: bigint;
  montant_mineur: bigint;
};

export type EntreeVenteDb = {
  effectuee_le: Date;
  client_id: string | null;
  montant_total_mineur: bigint;
  moyen_paiement: MoyenPaiement | null;
  statut: StatutOperation;
  note: string | null;
  lignes: EntreeLigneDb[] | null;
};

export type PatchVenteDb = {
  effectuee_le?: Date;
  client_id?: string | null;
  montant_total_mineur?: bigint;
  moyen_paiement?: MoyenPaiement | null;
  statut?: StatutOperation;
  note?: string | null;
  lignes?: EntreeLigneDb[];
};

export type EntreeDepenseDb = {
  effectuee_le: Date;
  montant_mineur: bigint;
  categorie_id: string | null;
  fournisseur: string | null;
  moyen_paiement: MoyenPaiement | null;
  statut: StatutOperation;
  note: string | null;
};

export type PatchDepenseDb = Partial<EntreeDepenseDb>;

export type DepotOperations = {
  listerVentes(entrepriseId: string, filtres: FiltresDepot): Promise<PageBrute<LigneVenteDb>>;
  trouverVente(
    entrepriseId: string,
    id: string,
  ): Promise<{ vente: LigneVenteDb; lignes: LigneDetailDb[] } | null>;
  creerVente(
    entrepriseId: string,
    entree: EntreeVenteDb,
  ): Promise<{ vente: LigneVenteDb; lignes: LigneDetailDb[] }>;
  modifierVente(
    entrepriseId: string,
    id: string,
    patch: PatchVenteDb,
  ): Promise<{ vente: LigneVenteDb; lignes: LigneDetailDb[] } | null>;
  supprimerVente(entrepriseId: string, id: string): Promise<boolean>;

  listerDepenses(entrepriseId: string, filtres: FiltresDepot): Promise<PageBrute<LigneDepenseDb>>;
  trouverDepense(entrepriseId: string, id: string): Promise<LigneDepenseDb | null>;
  creerDepense(entrepriseId: string, entree: EntreeDepenseDb): Promise<LigneDepenseDb>;
  modifierDepense(
    entrepriseId: string,
    id: string,
    patch: PatchDepenseDb,
  ): Promise<LigneDepenseDb | null>;
  supprimerDepense(entrepriseId: string, id: string): Promise<boolean>;

  listerCategories(entrepriseId: string): Promise<CategorieDepense[]>;
  categorieAppartient(entrepriseId: string, categorieId: string): Promise<boolean>;
  compterVentesMois(entrepriseId: string): Promise<number>;
};

// ---------------------------------------------------------------------------

const COLONNES_VENTE = `
  v.id, v.numero, v.effectuee_le, v.montant_total_mineur, v.moyen_paiement,
  v.statut, v.note, v.cree_le,
  v.client_id       AS client_id,
  cl.nom            AS client_nom,
  (SELECT count(*) FROM lignes_vente l WHERE l.vente_id = v.id) AS nombre_lignes
`;

/** Le client est résolu dès la lecture : afficher une liste ne coûte pas deux appels. */
const JOINTURE_CLIENT = `LEFT JOIN clients cl ON cl.id = v.client_id`;

const COLONNES_DEPENSE = `
  d.id, d.effectuee_le, d.montant_mineur, d.fournisseur, d.moyen_paiement,
  d.statut, d.note, d.cree_le,
  c.id      AS categorie_id,
  c.code    AS categorie_code,
  c.libelle AS categorie_libelle
`;

/**
 * `count(*)` et les colonnes `bigint` remontent en `bigint` (parseur de
 * `db/typesPg.ts`). La conversion en `number` est explicite et locale.
 */
function versNombre(valeur: bigint | number | undefined): number {
  return typeof valeur === "bigint" ? Number(valeur) : (valeur ?? 0);
}

export function creerDepotOperations(pool: Pool): DepotOperations {
  async function lireLignes(
    client: Pool | PoolClient,
    entrepriseId: string,
    venteId: string,
  ): Promise<LigneDetailDb[]> {
    const resultat = await client.query<LigneDetailDb>(
      `SELECT id, rang, produit_id, libelle, quantite, prix_unitaire_mineur, montant_mineur
         FROM lignes_vente
        WHERE vente_id = $1 AND entreprise_id = $2
        ORDER BY rang`,
      [venteId, entrepriseId],
    );
    return resultat.rows;
  }

  async function lireVente(
    client: Pool | PoolClient,
    entrepriseId: string,
    id: string,
  ): Promise<LigneVenteDb | null> {
    const resultat = await client.query<LigneVenteDb>(
      `SELECT ${COLONNES_VENTE}
         FROM ventes v
         ${JOINTURE_CLIENT}
        WHERE v.id = $1 AND v.entreprise_id = $2 AND v.supprime_le IS NULL`,
      [id, entrepriseId],
    );
    return resultat.rows[0] ?? null;
  }

  async function lireDepense(
    client: Pool | PoolClient,
    entrepriseId: string,
    id: string,
  ): Promise<LigneDepenseDb | null> {
    const resultat = await client.query<LigneDepenseDb>(
      `SELECT ${COLONNES_DEPENSE}
         FROM depenses d
         LEFT JOIN categories_depense c ON c.id = d.categorie_id
        WHERE d.id = $1 AND d.entreprise_id = $2 AND d.supprime_le IS NULL`,
      [id, entrepriseId],
    );
    return resultat.rows[0] ?? null;
  }

  async function insererLignes(
    client: PoolClient,
    entrepriseId: string,
    venteId: string,
    lignes: EntreeLigneDb[],
  ): Promise<void> {
    for (const [index, ligne] of lignes.entries()) {
      await client.query(
        `INSERT INTO lignes_vente
           (entreprise_id, vente_id, rang, produit_id, libelle, quantite,
            prix_unitaire_mineur, montant_mineur)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          entrepriseId,
          venteId,
          index + 1,
          ligne.produit_id,
          ligne.libelle,
          ligne.quantite,
          ligne.prix_unitaire_mineur.toString(),
          ligne.montant_mineur.toString(),
        ],
      );
    }
  }

  return {
    async listerVentes(entrepriseId, filtres) {
      const resultat = await pool.query<LigneVenteDb & { total_filtre: bigint }>(
        `SELECT ${COLONNES_VENTE}, count(*) OVER () AS total_filtre
           FROM ventes v
           ${JOINTURE_CLIENT}
          WHERE v.entreprise_id = $1
            AND v.supprime_le IS NULL
            AND ($2::timestamptz IS NULL OR v.effectuee_le >= $2)
            AND ($3::timestamptz IS NULL OR v.effectuee_le <  $3)
            AND ($4::text IS NULL OR v.statut = $4)
            AND ($5::text IS NULL OR v.moyen_paiement = $5)
            AND ($6::uuid IS NULL OR v.client_id = $6)
          ORDER BY v.effectuee_le DESC, v.numero DESC
          LIMIT $7 OFFSET $8`,
        [
          entrepriseId,
          filtres.debut,
          filtres.fin,
          filtres.statut,
          filtres.moyen_paiement,
          filtres.client_id,
          filtres.limite,
          filtres.decalage,
        ],
      );

      // `count(*) OVER ()` donne le total AVANT la pagination, en une seule
      // requête : pas de second aller-retour, et pas de risque que les deux
      // comptes divergent entre-temps.
      return {
        elements: resultat.rows,
        total: versNombre(resultat.rows[0]?.total_filtre),
      };
    },

    async trouverVente(entrepriseId, id) {
      const vente = await lireVente(pool, entrepriseId, id);
      if (vente === null) return null;
      return { vente, lignes: await lireLignes(pool, entrepriseId, id) };
    },

    async creerVente(entrepriseId, entree) {
      return dansTransaction(pool, async (client) => {
        // Allocation du numéro : `UPDATE … RETURNING` pose un verrou de ligne,
        // donc deux ventes simultanées ne peuvent pas recevoir le même numéro.
        const compteur = await client.query<{ valeur: bigint }>(
          `UPDATE compteurs SET valeur = valeur + 1
            WHERE entreprise_id = $1 AND nom = 'vente'
        RETURNING valeur`,
          [entrepriseId],
        );
        const numero = compteur.rows[0]?.valeur;
        if (numero === undefined) {
          throw new Error(`compteur de ventes absent pour l'entreprise ${entrepriseId}`);
        }

        const creee = await client.query<{ id: string }>(
          `INSERT INTO ventes
             (entreprise_id, numero, effectuee_le, client_id, montant_total_mineur,
              moyen_paiement, statut, note)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id`,
          [
            entrepriseId,
            numero.toString(),
            entree.effectuee_le,
            entree.client_id,
            entree.montant_total_mineur.toString(),
            entree.moyen_paiement,
            entree.statut,
            entree.note,
          ],
        );
        const venteId = creee.rows[0]?.id;
        if (venteId === undefined) throw new Error("vente créée sans identifiant");

        if (entree.lignes !== null && entree.lignes.length > 0) {
          await insererLignes(client, entrepriseId, venteId, entree.lignes);
        }

        const vente = await lireVente(client, entrepriseId, venteId);
        if (vente === null) throw new Error("vente introuvable juste après création");

        return { vente, lignes: await lireLignes(client, entrepriseId, venteId) };
      });
    },

    async modifierVente(entrepriseId, id, patch) {
      return dansTransaction(pool, async (client) => {
        // Verrou de ligne : deux modifications simultanées de la même vente
        // seraient sinon appliquées sur un état déjà périmé.
        const existante = await client.query<{ id: string }>(
          `SELECT id FROM ventes
            WHERE id = $1 AND entreprise_id = $2 AND supprime_le IS NULL
              FOR UPDATE`,
          [id, entrepriseId],
        );
        if (existante.rowCount === 0) return null;

        // Motif « champ fourni ? » plutôt que SQL construit dynamiquement :
        // requête statique, paramétrée, et `null` reste une valeur qu'on peut
        // écrire (effacer une note) sans être confondu avec « non fourni ».
        await client.query(
          `UPDATE ventes SET
             effectuee_le         = CASE WHEN $3::boolean THEN $4::timestamptz ELSE effectuee_le END,
             montant_total_mineur = CASE WHEN $5::boolean THEN $6::bigint      ELSE montant_total_mineur END,
             moyen_paiement       = CASE WHEN $7::boolean THEN $8::text        ELSE moyen_paiement END,
             statut               = CASE WHEN $9::boolean THEN $10::text       ELSE statut END,
             note                 = CASE WHEN $11::boolean THEN $12::text      ELSE note END,
             client_id            = CASE WHEN $13::boolean THEN $14::uuid      ELSE client_id END
           WHERE id = $1 AND entreprise_id = $2`,
          [
            id,
            entrepriseId,
            patch.effectuee_le !== undefined,
            patch.effectuee_le ?? null,
            patch.montant_total_mineur !== undefined,
            patch.montant_total_mineur?.toString() ?? null,
            patch.moyen_paiement !== undefined,
            patch.moyen_paiement ?? null,
            patch.statut !== undefined,
            patch.statut ?? null,
            patch.note !== undefined,
            patch.note ?? null,
            patch.client_id !== undefined,
            patch.client_id ?? null,
          ],
        );

        if (patch.lignes !== undefined) {
          // Remplacement intégral : voir docs/API-CONTRACT.md §3.5. Fusionner
          // ligne à ligne demanderait une sémantique que personne ne devinerait.
          await client.query(`DELETE FROM lignes_vente WHERE vente_id = $1 AND entreprise_id = $2`, [
            id,
            entrepriseId,
          ]);
          if (patch.lignes.length > 0) {
            await insererLignes(client, entrepriseId, id, patch.lignes);
          }
        }

        const vente = await lireVente(client, entrepriseId, id);
        if (vente === null) throw new Error("vente introuvable juste après modification");

        return { vente, lignes: await lireLignes(client, entrepriseId, id) };
      });
    },

    async supprimerVente(entrepriseId, id) {
      const resultat = await pool.query(
        `UPDATE ventes SET supprime_le = now()
          WHERE id = $1 AND entreprise_id = $2 AND supprime_le IS NULL`,
        [id, entrepriseId],
      );
      // Déjà supprimée → 0 ligne touchée → le service répondra 404 : une
      // ressource supprimée est invisible, y compris pour la supprimer encore.
      return resultat.rowCount === 1;
    },

    async listerDepenses(entrepriseId, filtres) {
      const resultat = await pool.query<LigneDepenseDb & { total_filtre: bigint }>(
        `SELECT ${COLONNES_DEPENSE}, count(*) OVER () AS total_filtre
           FROM depenses d
           LEFT JOIN categories_depense c ON c.id = d.categorie_id
          WHERE d.entreprise_id = $1
            AND d.supprime_le IS NULL
            AND ($2::timestamptz IS NULL OR d.effectuee_le >= $2)
            AND ($3::timestamptz IS NULL OR d.effectuee_le <  $3)
            AND ($4::text IS NULL OR d.statut = $4)
            AND ($5::text IS NULL OR d.moyen_paiement = $5)
            AND ($6::uuid IS NULL OR d.categorie_id = $6)
          ORDER BY d.effectuee_le DESC, d.cree_le DESC
          LIMIT $7 OFFSET $8`,
        [
          entrepriseId,
          filtres.debut,
          filtres.fin,
          filtres.statut,
          filtres.moyen_paiement,
          filtres.categorie_id,
          filtres.limite,
          filtres.decalage,
        ],
      );

      return {
        elements: resultat.rows,
        total: versNombre(resultat.rows[0]?.total_filtre),
      };
    },

    async trouverDepense(entrepriseId, id) {
      return lireDepense(pool, entrepriseId, id);
    },

    async creerDepense(entrepriseId, entree) {
      const creee = await pool.query<{ id: string }>(
        `INSERT INTO depenses
           (entreprise_id, effectuee_le, montant_mineur, categorie_id,
            fournisseur, moyen_paiement, statut, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          entrepriseId,
          entree.effectuee_le,
          entree.montant_mineur.toString(),
          entree.categorie_id,
          entree.fournisseur,
          entree.moyen_paiement,
          entree.statut,
          entree.note,
        ],
      );
      const id = creee.rows[0]?.id;
      if (id === undefined) throw new Error("dépense créée sans identifiant");

      const depense = await lireDepense(pool, entrepriseId, id);
      if (depense === null) throw new Error("dépense introuvable juste après création");
      return depense;
    },

    async modifierDepense(entrepriseId, id, patch) {
      const resultat = await pool.query(
        `UPDATE depenses SET
           effectuee_le   = CASE WHEN $3::boolean  THEN $4::timestamptz ELSE effectuee_le END,
           montant_mineur = CASE WHEN $5::boolean  THEN $6::bigint      ELSE montant_mineur END,
           categorie_id   = CASE WHEN $7::boolean  THEN $8::uuid        ELSE categorie_id END,
           fournisseur    = CASE WHEN $9::boolean  THEN $10::text       ELSE fournisseur END,
           moyen_paiement = CASE WHEN $11::boolean THEN $12::text       ELSE moyen_paiement END,
           statut         = CASE WHEN $13::boolean THEN $14::text       ELSE statut END,
           note           = CASE WHEN $15::boolean THEN $16::text       ELSE note END
         WHERE id = $1 AND entreprise_id = $2 AND supprime_le IS NULL`,
        [
          id,
          entrepriseId,
          patch.effectuee_le !== undefined,
          patch.effectuee_le ?? null,
          patch.montant_mineur !== undefined,
          patch.montant_mineur?.toString() ?? null,
          patch.categorie_id !== undefined,
          patch.categorie_id ?? null,
          patch.fournisseur !== undefined,
          patch.fournisseur ?? null,
          patch.moyen_paiement !== undefined,
          patch.moyen_paiement ?? null,
          patch.statut !== undefined,
          patch.statut ?? null,
          patch.note !== undefined,
          patch.note ?? null,
        ],
      );

      if (resultat.rowCount === 0) return null;
      return lireDepense(pool, entrepriseId, id);
    },

    async supprimerDepense(entrepriseId, id) {
      const resultat = await pool.query(
        `UPDATE depenses SET supprime_le = now()
          WHERE id = $1 AND entreprise_id = $2 AND supprime_le IS NULL`,
        [id, entrepriseId],
      );
      return resultat.rowCount === 1;
    },

    async listerCategories(entrepriseId) {
      const resultat = await pool.query<CategorieDepense>(
        `SELECT id, code, libelle
           FROM categories_depense
          WHERE entreprise_id = $1 AND supprime_le IS NULL
          ORDER BY ordre, libelle`,
        [entrepriseId],
      );
      return resultat.rows;
    },

    async categorieAppartient(entrepriseId, categorieId) {
      const resultat = await pool.query(
        `SELECT 1 FROM categories_depense
          WHERE id = $1 AND entreprise_id = $2 AND supprime_le IS NULL`,
        [categorieId, entrepriseId],
      );
      return resultat.rowCount === 1;
    },

    async compterVentesMois(entrepriseId) {
      const resultat = await pool.query<{ total: bigint }>(
        `SELECT count(*) AS total
           FROM ventes
          WHERE entreprise_id = $1
            AND supprime_le IS NULL
            AND effectuee_le >= date_trunc('month', now())`,
        [entrepriseId],
      );
      return versNombre(resultat.rows[0]?.total);
    },
  };
}
