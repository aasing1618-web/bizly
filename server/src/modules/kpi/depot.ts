import type { Pool } from "pg";
import type { MoyenPaiement } from "@bizly/shared";
import type { DepenseAgregable, ProduitAgrege, VenteAgregable } from "../../domaine/kpi.js";

/**
 * Lecture des données du tableau de bord.
 *
 * Le **filtrage** est fait ici, en SQL — c'est Postgres qui sait le faire vite,
 * et l'index partiel `ventes_kpi_idx` correspond exactement à ce prédicat. Le
 * **calcul** est fait dans `domaine/kpi.ts`, où il se teste au centime.
 *
 *
 * **Chaque `sum()` est explicitement recastée en `::bigint`.** Postgres rend
 * un `numeric` quand on somme des `bigint`, et node-postgres livre un
 * `numeric` sous forme de CHAINE. La premiere soustraction leve alors
 * « Cannot mix BigInt and other types » — alors que les comparaisons, elles,
 * coercent en silence : le defaut se cache jusqu'au premier calcul.
 *
 * Seule exception : `topProduits` est agrégé en SQL. Remonter toutes les lignes
 * de vente d'une année pour les sommer en mémoire serait absurde, et
 * `GROUP BY` est précisément le travail d'une base.
 */

export type FenetreKpi = { debut: Date; fin: Date };

export type DonneesKpi = {
  ventes: VenteAgregable[];
  depenses: DepenseAgregable[];
  ventesPrecedentes: VenteAgregable[];
  depensesPrecedentes: DepenseAgregable[];
  libellesCategories: Map<string, string>;
  topProduits: ProduitAgrege[];
};

export type DepotKpi = {
  charger(
    entrepriseId: string,
    periode: FenetreKpi,
    comparaison: FenetreKpi,
    limiteProduits: number,
  ): Promise<DonneesKpi>;
};

type LigneVente = {
  effectuee_le: Date;
  montant_total_mineur: bigint;
  moyen_paiement: MoyenPaiement | null;
};

type LigneDepense = {
  effectuee_le: Date;
  montant_mineur: bigint;
  categorie_id: string | null;
};

/**
 * Le filtre du §4 de `MOTEUR-ANALYTICS.md`, mot pour mot.
 *
 * Brouillons, annulées et supprimées n'entrent dans **aucun** indicateur. Ce
 * prédicat est aussi celui de l'index partiel : le modifier sans toucher à
 * l'index ferait basculer la requête en parcours séquentiel.
 */
const FILTRE_VENTES = `
  entreprise_id = $1
  AND statut = 'VALIDEE'
  AND supprime_le IS NULL
  AND effectuee_le >= $2 AND effectuee_le < $3
`;

const FILTRE_DEPENSES = FILTRE_VENTES;

export function creerDepotKpi(pool: Pool): DepotKpi {
  return {
    async charger(entrepriseId, periode, comparaison, limiteProduits) {
      // Les six requêtes sont indépendantes : les lancer en parallèle divise la
      // latence perçue par six, ce qui compte sur une base distante.
      const [ventes, depenses, ventesPrecedentes, depensesPrecedentes, categories, produits] =
        await Promise.all([
          pool.query<LigneVente>(
            `SELECT effectuee_le, montant_total_mineur, moyen_paiement
               FROM ventes WHERE ${FILTRE_VENTES}`,
            [entrepriseId, periode.debut, periode.fin],
          ),
          pool.query<LigneDepense>(
            `SELECT effectuee_le, montant_mineur, categorie_id
               FROM depenses WHERE ${FILTRE_DEPENSES}`,
            [entrepriseId, periode.debut, periode.fin],
          ),
          pool.query<LigneVente>(
            `SELECT effectuee_le, montant_total_mineur, moyen_paiement
               FROM ventes WHERE ${FILTRE_VENTES}`,
            [entrepriseId, comparaison.debut, comparaison.fin],
          ),
          pool.query<LigneDepense>(
            `SELECT effectuee_le, montant_mineur, categorie_id
               FROM depenses WHERE ${FILTRE_DEPENSES}`,
            [entrepriseId, comparaison.debut, comparaison.fin],
          ),
          pool.query<{ id: string; libelle: string }>(
            `SELECT id, libelle FROM categories_depense WHERE entreprise_id = $1`,
            [entrepriseId],
          ),
          pool.query<{ libelle: string; quantite: string; montant: bigint }>(
            `SELECT l.libelle,
                    sum(l.quantite)::text  AS quantite,
                    sum(l.montant_mineur)::bigint AS montant
               FROM lignes_vente l
               JOIN ventes v ON v.id = l.vente_id
              WHERE v.entreprise_id = $1
                AND v.statut = 'VALIDEE'
                AND v.supprime_le IS NULL
                AND v.effectuee_le >= $2 AND v.effectuee_le < $3
              GROUP BY l.libelle
              ORDER BY montant DESC, quantite DESC, l.libelle ASC
              LIMIT $4`,
            [entrepriseId, periode.debut, periode.fin, limiteProduits],
          ),
        ]);

      return {
        ventes: ventes.rows,
        depenses: depenses.rows,
        ventesPrecedentes: ventesPrecedentes.rows,
        depensesPrecedentes: depensesPrecedentes.rows,
        libellesCategories: new Map(categories.rows.map((ligne) => [ligne.id, ligne.libelle])),
        topProduits: produits.rows.map((ligne) => ({
          libelle: ligne.libelle,
          quantite: ligne.quantite,
          montant: ligne.montant,
        })),
      };
    },
  };
}
