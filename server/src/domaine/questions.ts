import {
  SEUIL_CLIENT_INACTIF_JOURS,
  TAILLE_CLASSEMENT,
  type Devise,
  type ElementClassement,
  type IdQuestion,
  type Indicateur,
  type Question,
  type ReponseQuestions,
  type UniteClassement,
} from "@bizly/shared";
import { formuler } from "./formulation.js";
import { abs, divArrondi, enNombreSur, moyenne, pourcent, repartirEnDixiemes } from "./montant.js";
import type { Comparaison, Periode } from "./periodes.js";

/**
 * Moteur de questions intelligentes — `docs/API-CONTRACT.md` §6.
 *
 * **Fonction pure**, comme le moteur de KPI : mêmes entrées, mêmes sorties, ni
 * horloge ni base. Chaque réponse porte le paragraphe de spécification qui la
 * définit, pour qu'on puisse remonter d'un chiffre à sa règle sans lire le code.
 *
 * Règle qui gouverne tout ce fichier : **une question sans données répond
 * « indisponible » avec sa raison, jamais zéro**. Un indicateur faux coûte plus
 * cher qu'un indicateur absent.
 */

export type AgregatProduit = {
  produit_id: string;
  nom: string;
  categorie: string | null;
  prix_mineur: bigint;
  /** `null` = coût non renseigné : le produit sort des classements de marge. */
  cout_mineur: bigint | null;
  /** Quantité vendue sur la période, en millièmes. */
  quantite_millièmes: bigint;
  ca_mineur: bigint;
};

export type AgregatClient = {
  client_id: string;
  nom: string;
  ca_mineur: bigint;
  /** Nombre de jours depuis le dernier achat, mesuré depuis aujourd'hui. */
  jours_depuis_dernier_achat: number | null;
  /** Créé pendant la période analysée. */
  nouveau: boolean;
};

export type EntreesQuestions = {
  periode: Periode;
  comparaison: Comparaison;
  devise: Devise;
  secteur: string;

  chiffreAffaires: bigint;
  depenses: bigint;
  nombreVentes: number;
  chiffreAffairesPrecedent: bigint;
  depensesPrecedentes: bigint;
  nombreVentesPrecedent: number;

  /** Répartition des dépenses : `id → { libellé, montant }`. */
  depensesParCategorie: Map<string, { libelle: string; montant: bigint }>;
  produits: AgregatProduit[];
  clients: AgregatClient[];
  /** Effectif total du fichier clients, tout l'historique — pas la période. */
  nombreClientsTotal: number;
  /** Chiffre d'affaires des ventes non rattachées à un produit du catalogue. */
  caHorsCatalogue: bigint;
};

// ---------------------------------------------------------------------------
// Vocabulaire sectoriel — spécification métier §4
// ---------------------------------------------------------------------------

type Vocabulaire = {
  singulier: string;
  pluriel: string;
  /**
   * Libellés **complets**, pas des gabarits à trous.
   *
   * « Quel {nom} est le plus rentable ? » donne « Quel prestation est le plus
   * rentable ? » : le français demande l'accord en genre, et interpoler un nom
   * dans une phrase figée le casse. Écrire les phrases en entier coûte trois
   * lignes et supprime la classe entière de fautes.
   */
  plusVendu: string;
  plusDeCa: string;
  plusRentable: string;
  moinsVendus: string;
  horsCatalogue: string;
  sansCout: string;
  sansCategorie: string;
  exclus: string;
};

/**
 * Même moteur, mots différents — spécification métier §4.
 *
 * **Seuls les libellés changent** : aucune formule, aucun seuil, aucun
 * classement n'est modifié. Un moteur qui calculerait différemment selon le
 * secteur deviendrait impossible à tester.
 */
export function vocabulaire(secteur: string): Vocabulaire {
  switch (secteur) {
    case "restauration":
      return {
        singulier: "plat",
        pluriel: "plats",
        plusVendu: "Quel plat se vend le plus ?",
        plusDeCa: "Quel plat génère le plus de chiffre d'affaires ?",
        plusRentable: "Quel plat est le plus rentable ?",
        moinsVendus: "Quels plats se vendent le moins ?",
        horsCatalogue: "Aucune vente n'est rattachée à un plat de la carte.",
        sansCout: "Aucun plat vendu n'a de coût de revient renseigné.",
        sansCategorie: "Aucun plat vendu n'a de catégorie renseignée.",
        exclus: "plats exclus faute de coût",
      };
    case "services_pro":
      return {
        singulier: "prestation",
        pluriel: "prestations",
        plusVendu: "Quelle prestation est la plus vendue ?",
        plusDeCa: "Quelle prestation génère le plus de chiffre d'affaires ?",
        plusRentable: "Quelle prestation est la plus rentable ?",
        moinsVendus: "Quelles prestations se vendent le moins ?",
        horsCatalogue: "Aucune vente n'est rattachée à une prestation du catalogue.",
        sansCout: "Aucune prestation vendue n'a de coût de revient renseigné.",
        sansCategorie: "Aucune prestation vendue n'a de catégorie renseignée.",
        exclus: "prestations exclues faute de coût",
      };
    default:
      return {
        singulier: "produit",
        pluriel: "produits",
        plusVendu: "Quel produit se vend le plus ?",
        plusDeCa: "Quel produit génère le plus de chiffre d'affaires ?",
        plusRentable: "Quel produit est le plus rentable ?",
        moinsVendus: "Quels produits se vendent le moins ?",
        horsCatalogue: "Aucune vente n'est rattachée à un produit du catalogue.",
        sansCout: "Aucun produit vendu n'a de coût de revient renseigné.",
        sansCategorie: "Aucun produit vendu n'a de catégorie renseignée.",
        exclus: "produits exclus faute de coût",
      };
  }
}

// ---------------------------------------------------------------------------
// Indicateurs
// ---------------------------------------------------------------------------

function memeSigne(a: bigint, b: bigint): boolean {
  return a >= 0n === b >= 0n;
}

function indicateur(valeur: bigint, precedente: bigint): Indicateur {
  const ecart = enNombreSur(valeur - precedente);

  if (precedente === 0n) {
    return { valeur: enNombreSur(valeur), evolution_pourcent: null, evolution_montant: ecart, base_nulle: true };
  }

  return {
    valeur: enNombreSur(valeur),
    evolution_pourcent: memeSigne(valeur, precedente)
      ? pourcent(valeur - precedente, abs(precedente))
      : null,
    evolution_montant: ecart,
    base_nulle: false,
  };
}

// ---------------------------------------------------------------------------
// Classements
// ---------------------------------------------------------------------------

type Candidat = { id: string; libelle: string; valeur: bigint };

/**
 * Ordonne, marque les ex æquo, et coupe à la taille voulue.
 *
 * Départage **alphabétique** en cas d'égalité stricte (spécification §3.7),
 * appliqué à tous les classements sans exception — produits, catégories,
 * clients. Le déterminisme compte : deux affichages successifs ne doivent
 * jamais s'inverser.
 *
 * `tousLesExAequo` est réservé aux questions en **liste** (« quels produits se
 * vendent le moins ») : elles ne doivent en cacher aucun.
 */
function classer(
  candidats: Candidat[],
  unite: UniteClassement,
  options: { croissant?: boolean; tousLesExAequo?: boolean; parts?: boolean } = {},
): ElementClassement[] {
  const { croissant = false, tousLesExAequo = false, parts = false } = options;

  const ordonnes = [...candidats].sort((a, b) => {
    if (a.valeur !== b.valeur) {
      const plusGrand = a.valeur > b.valeur ? -1 : 1;
      return croissant ? -plusGrand : plusGrand;
    }
    return a.libelle.localeCompare(b.libelle, "fr");
  });

  if (ordonnes.length === 0) return [];

  const premiere = ordonnes[0]?.valeur;
  const dixiemes = parts
    ? repartirEnDixiemes(candidats.map((c) => ({ id: c.id, montant: c.valeur })))
    : null;

  // Une liste d'ex æquo garde tous ceux qui égalent le premier, quelle que soit
  // la taille demandée : en cacher un serait mentir sur l'égalité.
  const retenus = tousLesExAequo
    ? ordonnes.filter((candidat) => candidat.valeur === premiere)
    : ordonnes.slice(0, TAILLE_CLASSEMENT);

  return retenus.map((candidat) => ({
    id: candidat.id,
    libelle: candidat.libelle,
    valeur: enNombreSur(candidat.valeur),
    unite,
    ...(dixiemes === null ? {} : { part_dixiemes: dixiemes.get(candidat.id) ?? 0 }),
    ...(candidat.valeur === premiere && ordonnes.filter((o) => o.valeur === premiere).length > 1
      ? { ex_aequo: true }
      : {}),
  }));
}

// ---------------------------------------------------------------------------

const MILLE = 1000n;

/** Quantité en millièmes → nombre lisible (`4000n` → `4`). */
function quantiteLisible(millièmes: bigint): number {
  return Number(millièmes) / 1000;
}

export function repondreAuxQuestions(entrees: EntreesQuestions): ReponseQuestions {
  const mots = vocabulaire(entrees.secteur);
  const questions: Question[] = [];

  const ajouter = (
    id: IdQuestion,
    question: string,
    formule: string,
    corps: Omit<Question, "id" | "question" | "formule" | "phrase">,
  ): void => {
    // La phrase est formulée À PARTIR de la réponse elle-même : elle ne peut
    // donc contenir aucun chiffre qui n'y figure pas. La garantie du §6 de
    // GEMINI.md est ici vraie par construction, pas seulement testée.
    const reponse: Question = { id, question, formule, ...corps, phrase: "" };
    questions.push({ ...reponse, phrase: formuler(reponse, entrees.devise) });
  };

  const indisponible = (raison: string) => ({ disponible: false, raison });

  const aucuneVente = entrees.nombreVentes === 0;
  const produitsVendus = entrees.produits.filter((p) => p.quantite_millièmes > 0n);
  const clientsAvecAchat = entrees.clients.filter((c) => c.ca_mineur > 0n);

  // ---- 1. Combien ai-je gagné ---------------------------------------------
  ajouter("combien_ai_je_gagne", "Combien ai-je gagné sur la période ?", "§3.1", {
    disponible: true,
    indicateur: indicateur(entrees.chiffreAffaires, entrees.chiffreAffairesPrecedent),
  });

  // ---- 2. Bénéfice estimé --------------------------------------------------
  const benefice = entrees.chiffreAffaires - entrees.depenses;
  const beneficePrecedent = entrees.chiffreAffairesPrecedent - entrees.depensesPrecedentes;
  ajouter("benefice_estime", "Quel est mon bénéfice estimé ?", "§3.3", {
    disponible: true,
    indicateur: indicateur(benefice, beneficePrecedent),
  });

  // ---- 3. Où je dépense le plus -------------------------------------------
  const categoriesDepense = [...entrees.depensesParCategorie.entries()].map(([id, groupe]) => ({
    id,
    libelle: groupe.libelle,
    valeur: groupe.montant,
  }));
  ajouter("ou_je_depense_le_plus", "Où est-ce que je dépense le plus ?", "§3.9", {
    ...(categoriesDepense.length === 0
      ? indisponible("Aucune dépense enregistrée sur cette période.")
      : { disponible: true, classement: classer(categoriesDepense, "montant", { parts: true }) }),
  });

  // ---- 4. Mes dépenses augmentent-elles ------------------------------------
  ajouter("depenses_augmentent", "Mes dépenses augmentent-elles ?", "§3.5 sur §3.2", {
    disponible: true,
    indicateur: indicateur(entrees.depenses, entrees.depensesPrecedentes),
  });

  // ---- 5. Produit le plus vendu (quantité) ---------------------------------
  ajouter(
    "produit_le_plus_vendu",
    mots.plusVendu,
    "§3.7 (quantité)",
    produitsVendus.length === 0
      ? indisponible(aucuneVente ? "Aucune vente sur cette période." : mots.horsCatalogue)
      : {
          disponible: true,
          classement: classer(
            produitsVendus.map((p) => ({
              id: p.produit_id,
              libelle: p.nom,
              valeur: p.quantite_millièmes,
            })),
            "quantite",
          ).map((element) => ({ ...element, valeur: quantiteLisible(BigInt(element.valeur)) })),
        },
  );

  // ---- 6. Produit générant le plus de CA -----------------------------------
  ajouter(
    "produit_le_plus_de_ca",
    mots.plusDeCa,
    "§3.7 (CA)",
    produitsVendus.length === 0
      ? indisponible(aucuneVente ? "Aucune vente sur cette période." : mots.horsCatalogue)
      : {
          disponible: true,
          classement: classer(
            produitsVendus.map((p) => ({ id: p.produit_id, libelle: p.nom, valeur: p.ca_mineur })),
            "montant",
          ),
          ...(entrees.caHorsCatalogue > 0n
            ? {
                complements: [
                  {
                    // Annoncé explicitement : sans cela, le total du classement
                    // serait inférieur au chiffre d'affaires sans explication.
                    libelle: "chiffre d'affaires hors catalogue",
                    valeur: enNombreSur(entrees.caHorsCatalogue),
                    unite: "montant" as const,
                  },
                ],
              }
            : {}),
        },
  );

  // ---- 7. Mes ventes progressent-elles -------------------------------------
  ajouter("ventes_progressent", "Mes ventes progressent-elles ?", "§3.5 sur §3.1", {
    disponible: true,
    indicateur: indicateur(entrees.chiffreAffaires, entrees.chiffreAffairesPrecedent),
    complements: [
      { libelle: "nombre de ventes", valeur: entrees.nombreVentes, unite: "nombre" },
      { libelle: "nombre de ventes précédent", valeur: entrees.nombreVentesPrecedent, unite: "nombre" },
    ],
  });

  // ---- 8. Panier moyen ------------------------------------------------------
  const panier = moyenne(entrees.chiffreAffaires, entrees.nombreVentes);
  const panierPrecedent = moyenne(entrees.chiffreAffairesPrecedent, entrees.nombreVentesPrecedent);
  ajouter(
    "panier_moyen",
    "Quel est mon panier moyen ?",
    "§3.4",
    panier === null
      ? indisponible("Aucune vente sur cette période : le panier moyen n'est pas calculable.")
      : {
          disponible: true,
          indicateur:
            panierPrecedent === null || panierPrecedent === 0n
              ? {
                  valeur: enNombreSur(panier),
                  evolution_pourcent: null,
                  evolution_montant: null,
                  base_nulle: true,
                }
              : {
                  valeur: enNombreSur(panier),
                  // Sur les moyennes EXACTES, sans arrondi intermédiaire (§1).
                  evolution_pourcent: pourcent(
                    entrees.chiffreAffaires * BigInt(entrees.nombreVentesPrecedent) -
                      entrees.chiffreAffairesPrecedent * BigInt(entrees.nombreVentes),
                    abs(entrees.chiffreAffairesPrecedent * BigInt(entrees.nombreVentes)),
                  ),
                  evolution_montant: enNombreSur(panier - panierPrecedent),
                  base_nulle: false,
                },
        },
  );

  // ---- 9. Meilleurs clients -------------------------------------------------
  ajouter(
    "meilleurs_clients",
    "Qui sont mes meilleurs clients ?",
    "§3.8",
    clientsAvecAchat.length === 0
      ? indisponible("Aucune vente n'est rattachée à un client sur cette période.")
      : {
          disponible: true,
          // Les ventes anonymes comptent dans le CA mais JAMAIS ici (§3.8).
          classement: classer(
            clientsAvecAchat.map((c) => ({ id: c.client_id, libelle: c.nom, valeur: c.ca_mineur })),
            "montant",
          ),
        },
  );

  // ---- 10. Combien de clients ----------------------------------------------
  const nouveaux = entrees.clients.filter((c) => c.nouveau).length;
  ajouter("combien_de_clients", "Combien de clients ai-je ?", "§3.8", {
    disponible: true,
    complements: [
      // Tout l'historique, pas la période : « combien de clients ai-je » n'est
      // pas une question sur la fenêtre consultée.
      { libelle: "clients au total", valeur: entrees.nombreClientsTotal, unite: "nombre" },
      { libelle: "nouveaux sur la période", valeur: nouveaux, unite: "nombre" },
    ],
  });

  // ---- 11. Clients inactifs -------------------------------------------------
  const inactifs = entrees.clients.filter(
    (c) =>
      c.jours_depuis_dernier_achat === null ||
      c.jours_depuis_dernier_achat > SEUIL_CLIENT_INACTIF_JOURS,
  );
  ajouter(
    "clients_inactifs",
    `Quels clients n'ont pas acheté depuis plus de ${SEUIL_CLIENT_INACTIF_JOURS} jours ?`,
    "§3.8",
    entrees.nombreClientsTotal === 0
      ? indisponible("Aucun client enregistré.")
      : inactifs.length === 0
        ? {
            disponible: true,
            classement: [],
            complements: [{ libelle: "clients inactifs", valeur: 0, unite: "nombre" }],
          }
        : {
            disponible: true,
            classement: classer(
              inactifs.map((c) => ({
                id: c.client_id,
                libelle: c.nom,
                // Jamais acheté : rangé au plus inactif, sans inventer de date.
                valeur: BigInt(c.jours_depuis_dernier_achat ?? 9999),
              })),
              "jours",
            ),
          },
  );

  // ---- 12. Produit le plus rentable ----------------------------------------
  const avecCout = produitsVendus.filter((p) => p.cout_mineur !== null && p.prix_mineur > 0n);
  ajouter(
    "produit_le_plus_rentable",
    mots.plusRentable,
    "§3.6",
    avecCout.length === 0
      ? indisponible(
          produitsVendus.length === 0
            ? "Aucune vente rattachée au catalogue sur cette période."
            : mots.sansCout,
        )
      : {
          disponible: true,
          // Marge en dixièmes de point : (prix − coût) / prix × 1000.
          classement: classer(
            avecCout.map((p) => ({
              id: p.produit_id,
              libelle: p.nom,
              valeur: divArrondi((p.prix_mineur - (p.cout_mineur ?? 0n)) * MILLE, p.prix_mineur),
            })),
            "pourcent",
          ),
          complements: [
            {
              // Marge globale : Σ (prix − coût) × quantité, produits sans coût
              // EXCLUS. Distincte du bénéfice, qui déduit toutes les dépenses.
              libelle: "marge globale sur la période",
              valeur: enNombreSur(
                avecCout.reduce(
                  (total, p) =>
                    total +
                    divArrondi(
                      (p.prix_mineur - (p.cout_mineur ?? 0n)) * p.quantite_millièmes,
                      MILLE,
                    ),
                  0n,
                ),
              ),
              unite: "montant" as const,
            },
            {
              libelle: mots.exclus,
              valeur: produitsVendus.length - avecCout.length,
              unite: "nombre" as const,
            },
          ],
        },
  );

  // ---- 13. Produits les moins vendus ---------------------------------------
  ajouter(
    "produits_les_moins_vendus",
    mots.moinsVendus,
    "§3.7 (quantité, croissant)",
    produitsVendus.length === 0
      ? indisponible(aucuneVente ? "Aucune vente sur cette période." : mots.horsCatalogue)
      : {
          disponible: true,
          // Question en LISTE : tous les ex æquo, jamais un seul (§3.7).
          classement: classer(
            produitsVendus.map((p) => ({
              id: p.produit_id,
              libelle: p.nom,
              valeur: p.quantite_millièmes,
            })),
            "quantite",
            { croissant: true, tousLesExAequo: true },
          ).map((element) => ({ ...element, valeur: quantiteLisible(BigInt(element.valeur)) })),
        },
  );

  // ---- 14. Catégorie générant le plus de revenus ---------------------------
  const parCategorie = new Map<string, bigint>();
  for (const produit of produitsVendus) {
    if (produit.categorie === null) continue;
    parCategorie.set(produit.categorie, (parCategorie.get(produit.categorie) ?? 0n) + produit.ca_mineur);
  }
  ajouter(
    "categorie_la_plus_rentable",
    "Quelle catégorie génère le plus de revenus ?",
    "§3.7 par catégorie",
    parCategorie.size === 0
      ? indisponible(
          produitsVendus.length === 0
            ? "Aucune vente rattachée au catalogue sur cette période."
            : mots.sansCategorie,
        )
      : {
          disponible: true,
          classement: classer(
            [...parCategorie.entries()].map(([nom, montant]) => ({
              id: nom,
              libelle: nom,
              valeur: montant,
            })),
            "montant",
            { parts: true },
          ),
        },
  );

  return {
    periode: {
      cle: entrees.periode.cle,
      debut: entrees.periode.debut.toISOString(),
      fin: entrees.periode.fin.toISOString(),
      debut_local: entrees.periode.debut_local,
      fin_local: entrees.periode.fin_local,
      fuseau: entrees.periode.fuseau,
      en_cours: entrees.periode.en_cours,
    },
    comparaison: {
      debut_local: entrees.comparaison.debut_local,
      fin_local: entrees.comparaison.fin_local,
      a_date: entrees.comparaison.a_date,
    },
    devise: entrees.devise,
    secteur: entrees.secteur,
    questions,
  };
}
