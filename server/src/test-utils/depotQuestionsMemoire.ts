import type { AgregatClient, AgregatProduit } from "../domaine/questions.js";
import type { DepotQuestions, DonneesQuestions } from "../modules/questions/depot.js";

/**
 * Données du moteur de questions en mémoire — **tests uniquement**.
 * Exclu du build (`tsconfig.build.json`).
 *
 * Ce dépôt ne recalcule rien : il rend telles quelles les valeurs qu'on lui
 * pose. C'est voulu — le regroupement est la responsabilité du SQL, vérifié
 * séparément contre Supabase ; ici on teste le **moteur de réponses**.
 */

export type DepotQuestionsMemoire = DepotQuestions & {
  definir(donnees: Partial<DonneesQuestions>): void;
};

const VIDE: DonneesQuestions = {
  chiffreAffaires: 0n,
  depenses: 0n,
  nombreVentes: 0,
  chiffreAffairesPrecedent: 0n,
  depensesPrecedentes: 0n,
  nombreVentesPrecedent: 0,
  depensesParCategorie: new Map(),
  produits: [],
  clients: [],
  nombreClientsTotal: 0,
  caHorsCatalogue: 0n,
};

export function creerDepotQuestionsMemoire(): DepotQuestionsMemoire {
  let donnees: DonneesQuestions = { ...VIDE };

  return {
    definir(partiel) {
      donnees = { ...VIDE, ...partiel };
    },
    async charger() {
      return donnees;
    },
  };
}

/** Raccourci pour composer un agrégat produit dans un test. */
export function produitAgrege(
  nom: string,
  options: {
    prix: bigint;
    cout?: bigint | null;
    quantite: number;
    ca: bigint;
    categorie?: string | null;
  },
): AgregatProduit {
  return {
    produit_id: `p-${nom.toLowerCase().replace(/\s+/g, "-")}`,
    nom,
    categorie: options.categorie ?? null,
    prix_mineur: options.prix,
    cout_mineur: options.cout ?? null,
    quantite_millièmes: BigInt(Math.round(options.quantite * 1000)),
    ca_mineur: options.ca,
  };
}

/** Raccourci pour composer un agrégat client dans un test. */
export function clientAgrege(
  nom: string,
  options: { ca: bigint; joursDepuisAchat?: number | null; nouveau?: boolean },
): AgregatClient {
  return {
    client_id: `c-${nom.toLowerCase().replace(/\s+/g, "-")}`,
    nom,
    ca_mineur: options.ca,
    jours_depuis_dernier_achat: options.joursDepuisAchat ?? null,
    nouveau: options.nouveau ?? false,
  };
}
