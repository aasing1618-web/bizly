import type { Pool } from "pg";
import type { AgregatClient, AgregatProduit } from "../../domaine/questions.js";

/**
 * Lecture des données du moteur de questions.
 *
 * **Chaque `sum()` est explicitement recastée en `::bigint`.** Postgres rend
 * un `numeric` quand on somme des `bigint`, et node-postgres livre un
 * `numeric` sous forme de CHAINE. La premiere soustraction leve alors
 * « Cannot mix BigInt and other types » — alors que les comparaisons, elles,
 * coercent en silence : le defaut se cache jusqu'au premier calcul.
 *
 * Tout ce qui se regroupe se regroupe **en SQL** : agréger en mémoire des lignes
 * de vente d'une année entière n'aurait aucun sens quand `GROUP BY` existe. Le
 * calcul des marges, des classements et des seuils reste dans
 * `domaine/questions.ts`, où il se teste.
 */

export type FenetreQuestions = { debut: Date; fin: Date };

export type DonneesQuestions = {
  chiffreAffaires: bigint;
  depenses: bigint;
  nombreVentes: number;
  chiffreAffairesPrecedent: bigint;
  depensesPrecedentes: bigint;
  nombreVentesPrecedent: number;
  depensesParCategorie: Map<string, { libelle: string; montant: bigint }>;
  produits: AgregatProduit[];
  clients: AgregatClient[];
  nombreClientsTotal: number;
  caHorsCatalogue: bigint;
};

export type DepotQuestions = {
  charger(
    entrepriseId: string,
    periode: FenetreQuestions,
    comparaison: FenetreQuestions,
    aujourdhui: Date,
  ): Promise<DonneesQuestions>;
};

/** Le filtre du §4 de `MOTEUR-ANALYTICS.md`, identique à celui du tableau de bord. */
const FILTRE = `
  entreprise_id = $1 AND statut = 'VALIDEE' AND supprime_le IS NULL
  AND effectuee_le >= $2 AND effectuee_le < $3
`;

export function creerDepotQuestions(pool: Pool): DepotQuestions {
  return {
    async charger(entrepriseId, periode, comparaison, aujourdhui) {
      const args = [entrepriseId, periode.debut, periode.fin];
      const argsPrecedents = [entrepriseId, comparaison.debut, comparaison.fin];

      const [
        ventes,
        depenses,
        ventesPrecedentes,
        depensesPrecedentes,
        parCategorie,
        produits,
        clients,
        totalClients,
        horsCatalogue,
      ] = await Promise.all([
        pool.query<{ total: bigint; nombre: number }>(
          `SELECT coalesce(sum(montant_total_mineur), 0)::bigint AS total, count(*)::int AS nombre
             FROM ventes WHERE ${FILTRE}`,
          args,
        ),
        pool.query<{ total: bigint }>(
          `SELECT coalesce(sum(montant_mineur), 0)::bigint AS total FROM depenses WHERE ${FILTRE}`,
          args,
        ),
        pool.query<{ total: bigint; nombre: number }>(
          `SELECT coalesce(sum(montant_total_mineur), 0)::bigint AS total, count(*)::int AS nombre
             FROM ventes WHERE ${FILTRE}`,
          argsPrecedents,
        ),
        pool.query<{ total: bigint }>(
          `SELECT coalesce(sum(montant_mineur), 0)::bigint AS total FROM depenses WHERE ${FILTRE}`,
          argsPrecedents,
        ),
        pool.query<{ id: string; libelle: string; montant: bigint }>(
          `SELECT coalesce(c.id::text, 'non_categorise') AS id,
                  coalesce(c.libelle, 'Non catégorisé')  AS libelle,
                  sum(d.montant_mineur)::bigint          AS montant
             FROM depenses d
             LEFT JOIN categories_depense c ON c.id = d.categorie_id
            WHERE d.entreprise_id = $1 AND d.statut = 'VALIDEE' AND d.supprime_le IS NULL
              AND d.effectuee_le >= $2 AND d.effectuee_le < $3
            GROUP BY c.id, c.libelle`,
          args,
        ),
        // Agrégat par produit du catalogue. `prix_mineur` et `cout_mineur`
        // viennent du CATALOGUE, pas de la ligne de vente : c'est la formule
        // du §3.6 de la spécification métier.
        pool.query<{
          produit_id: string;
          nom: string;
          categorie: string | null;
          prix_mineur: bigint;
          cout_mineur: bigint | null;
          quantite_millièmes: bigint;
          ca_mineur: bigint;
        }>(
          `SELECT p.id                                AS produit_id,
                  p.nom                               AS nom,
                  p.categorie                         AS categorie,
                  p.prix_mineur                       AS prix_mineur,
                  p.cout_mineur                       AS cout_mineur,
                  (sum(l.quantite) * 1000)::bigint    AS "quantite_millièmes",
                  sum(l.montant_mineur)::bigint       AS ca_mineur
             FROM lignes_vente l
             JOIN ventes   v ON v.id = l.vente_id
             JOIN produits p ON p.id = l.produit_id
            WHERE v.entreprise_id = $1 AND v.statut = 'VALIDEE' AND v.supprime_le IS NULL
              AND v.effectuee_le >= $2 AND v.effectuee_le < $3
            GROUP BY p.id, p.nom, p.categorie, p.prix_mineur, p.cout_mineur`,
          args,
        ),
        // Clients : chiffre d'affaires sur la période, ancienneté du dernier
        // achat sur TOUT l'historique, et création dans la période.
        pool.query<{
          client_id: string;
          nom: string;
          ca_mineur: bigint;
          jours_depuis_dernier_achat: number | null;
          nouveau: boolean;
        }>(
          `SELECT c.id  AS client_id,
                  c.nom AS nom,
                  coalesce(sum(v.montant_total_mineur) FILTER (
                    WHERE v.effectuee_le >= $2 AND v.effectuee_le < $3
                  ), 0)::bigint AS ca_mineur,
                  CASE WHEN max(v.effectuee_le) IS NULL THEN NULL
                       ELSE ($4::date - max(v.effectuee_le)::date)
                  END::int AS jours_depuis_dernier_achat,
                  (c.cree_le >= $2 AND c.cree_le < $3) AS nouveau
             FROM clients c
             LEFT JOIN ventes v
               ON v.client_id = c.id
              AND v.statut = 'VALIDEE'
              AND v.supprime_le IS NULL
            WHERE c.entreprise_id = $1 AND c.supprime_le IS NULL
            GROUP BY c.id, c.nom, c.cree_le`,
          [entrepriseId, periode.debut, periode.fin, aujourdhui],
        ),
        pool.query<{ nombre: number }>(
          `SELECT count(*)::int AS nombre FROM clients
            WHERE entreprise_id = $1 AND supprime_le IS NULL`,
          [entrepriseId],
        ),
        // Chiffre d'affaires des lignes SANS produit du catalogue : il compte
        // dans le CA mais pas dans les classements, et l'écart doit être dit.
        pool.query<{ total: bigint }>(
          `SELECT coalesce(sum(l.montant_mineur), 0)::bigint AS total
             FROM lignes_vente l
             JOIN ventes v ON v.id = l.vente_id
            WHERE v.entreprise_id = $1 AND v.statut = 'VALIDEE' AND v.supprime_le IS NULL
              AND v.effectuee_le >= $2 AND v.effectuee_le < $3
              AND l.produit_id IS NULL`,
          args,
        ),
      ]);

      return {
        chiffreAffaires: ventes.rows[0]?.total ?? 0n,
        nombreVentes: ventes.rows[0]?.nombre ?? 0,
        depenses: depenses.rows[0]?.total ?? 0n,
        chiffreAffairesPrecedent: ventesPrecedentes.rows[0]?.total ?? 0n,
        nombreVentesPrecedent: ventesPrecedentes.rows[0]?.nombre ?? 0,
        depensesPrecedentes: depensesPrecedentes.rows[0]?.total ?? 0n,
        depensesParCategorie: new Map(
          parCategorie.rows.map((ligne) => [
            ligne.id,
            { libelle: ligne.libelle, montant: ligne.montant },
          ]),
        ),
        produits: produits.rows,
        clients: clients.rows,
        nombreClientsTotal: totalClients.rows[0]?.nombre ?? 0,
        caHorsCatalogue: horsCatalogue.rows[0]?.total ?? 0n,
      };
    },
  };
}
