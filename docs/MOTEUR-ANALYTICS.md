# Moteur analytique Bizly — spécification

> **Ce document fait foi.** Aucune formule ne s'écrit dans le code avant d'être ici.
> Si le code et ce document divergent, c'est le code qui a tort.
>
> Les arbitrages métier ont été délégués et sont **tranchés au §9**, avec leur
> raison. Toute nouvelle ambiguïté se signale avant d'écrire la moindre ligne
> de code, elle ne se tranche pas en silence.

Version 1 — Vague 0. Le moteur lui-même est implémenté en Vague 3.

---

## §1. Représentation de l'argent

### 1.1 Règle absolue

Tout montant est un **entier signé** (`BIGINT` en base, `bigint` en TypeScript) exprimé
dans **l'unité mineure** de la devise.

- 3 450,00 € → `345000` (centimes)
- 1 750 000 XOF → `1750000` (le franc CFA n'a pas de subdivision)
- 12,345 TND → `12345` (le dinar tunisien a **3** décimales)

**Jamais** de `float`, `double`, `number` JavaScript ni de type `money` Postgres pour
un montant. `0.1 + 0.2 !== 0.3` : un centime perdu par arrondi flottant dans un KPI
détruit la confiance dans le produit entier.

### 1.2 Le nombre de décimales est une donnée, pas une constante

Il est porté par la table `devises` (colonne `decimales`), pas par le code :

| Code | Décimales | Facteur |
|---|---|---|
| EUR, USD, CAD, CHF, GBP, MAD, DZD | 2 | 100 |
| XOF, XAF | 0 | 1 |
| TND | 3 | 1000 |

`montant_affiché = montant_mineur / 10^decimales`

La conversion mineur → affichage se fait **uniquement à la sortie** (formatage), jamais
au milieu d'un calcul.

### 1.3 Une entreprise = une devise

La devise est fixée sur l'entreprise (`entreprises.devise`). Pas de multi-devise, pas de
conversion, pas de taux de change dans le MVP. Un KPI porte toujours sa devise dans sa
réponse, pour que le client n'ait jamais à la deviner.

---

## §2. Arrondi

### 2.1 La règle

**Arrondi au plus proche ; à exactement la moitié, on s'éloigne de zéro.**
(« arrondi commercial », *half away from zero*.)

| Valeur exacte | Arrondi |
|---|---|
| 287,4999 | 287 |
| 287,5 | **288** |
| −287,5 | **−288** |
| 287,4 | 287 |

C'est la règle qu'attend un commerçant. On n'utilise **pas** l'arrondi bancaire
(*half to even*) : il est plus juste statistiquement mais contre-intuitif pour
l'utilisateur, qui vérifie à la calculatrice.

### 2.2 Implémentation de référence

Un seul helper, en arithmétique entière — pas de division flottante intermédiaire :

```ts
/** Divise a par b avec arrondi au plus proche, moitié s'éloignant de zéro. */
export function divArrondi(a: bigint, b: bigint): bigint {
  if (b === 0n) throw new Error("division par zéro");
  const q = a / b;              // troncature vers zéro
  const r = a % b;              // même signe que a
  if (r === 0n) return q;
  const doubleReste = (r < 0n ? -r : r) * 2n;
  const absB = b < 0n ? -b : b;
  if (doubleReste < absB) return q;
  const signe = (a < 0n) === (b < 0n) ? 1n : -1n;
  return q + signe;
}
```

### 2.3 Où l'arrondi a le droit d'intervenir

| Opération | Arrondi ? |
|---|---|
| Somme, différence de montants | **Non** — entiers, exact par construction |
| Moyenne (panier moyen, dépense moyenne) | Oui, au **plus proche entier d'unité mineure** |
| Pourcentage | Oui, à **une décimale** (voir §2.4) |
| Affichage | Formatage seulement, la valeur transmise est déjà arrondie |

**Aucun arrondi intermédiaire.** On arrondit une fois, à la toute fin, sur la valeur
qui sort du moteur. Arrondir deux fois de suite (arrondi en cascade) est un bug.

### 2.4 Pourcentages

Un pourcentage est calculé et transporté en **dixièmes de point** (entier), puis divisé
par 10 à l'affichage. `742` → `74,2 %`.

```
pourcentDixiemes = divArrondi(numerateur * 1000n, denominateur)
```

Une seule décimale partout dans le produit. Pas de « 74,23 % » ici et « 74 % » là.

### 2.5 Répartitions : la somme doit faire 100,0 %

Une répartition (dépenses par catégorie, CA par moyen de paiement) doit afficher des
parts dont la somme fait **exactement 100,0 %**. Trois parts à 33,3 % font 99,9 %, ce
que l'utilisateur voit immédiatement.

**Méthode du plus fort reste** :

1. Pour chaque part, calculer `1000 * montant / total` et garder la **partie entière**
   (en dixièmes de point) et le reste.
2. Distribuer les `1000 − Σ parties entières` dixièmes restants, un par un, aux parts
   ayant le **plus grand reste**.
3. Départage déterministe des ex æquo, dans cet ordre : plus grand montant, puis
   identifiant (ordre lexicographique croissant).

Le départage doit être déterministe : deux appels sur les mêmes données rendent
exactement le même résultat, sinon l'affichage bouge tout seul au rafraîchissement.

---

## §3. Périodes

### 3.1 Bornes

Une période est un intervalle **`[debut, fin[`** : début **inclus**, fin **exclue**.
Toujours. Cela supprime la classe entière de bugs « la vente de 23 h 59 le 31 est-elle
dans le mois ? ».

### 3.2 Fuseau horaire

Les bornes sont calculées dans le **fuseau de l'entreprise** (`entreprises.fuseau`,
défaut `Europe/Paris`), puis converties en UTC pour interroger la base.

Exemple concret, à tester :

> Une vente stockée `2026-05-31T22:30:00Z` appartient au mois de **juin** pour une
> entreprise en `Europe/Paris` (il est alors le 1er juin, 00 h 30, heure locale).

Ignorer le fuseau ferait basculer toutes les ventes de fin de soirée sur le mois
suivant ou précédent. C'est la première chose qu'un commerçant repère.

### 3.3 Périodes nommées

| Clé | Définition (heure locale de l'entreprise) |
|---|---|
| `jour` | de 00:00 du jour à 00:00 du lendemain |
| `semaine` | du **lundi** 00:00 au lundi suivant 00:00 (ISO 8601) |
| `mois` | du 1er 00:00 au 1er du mois suivant 00:00 |
| `trimestre` | 1er jour du trimestre → 1er jour du trimestre suivant |
| `annee` | 1er janvier → 1er janvier suivant |
| `personnalisee` | deux dates fournies, converties en `[debut 00:00, fin+1j 00:00[` |

### 3.4 Période de comparaison — **deux règles, selon l'ancrage**

Arbitrage du 28 août 2026 (spécification métier §2). Il y a **deux** règles, pas
une, parce qu'il y a deux questions différentes.

| Période courante | Comparaison | Pourquoi |
|---|---|---|
| `mois`, `trimestre`, `annee` — **ancrées au calendrier** | **même position** depuis le début de l'unité précédente. Le 8 août → **1–8 juillet** | « vs le mois dernier » veut dire, pour un commerçant, « les mêmes premiers jours du mois d'avant » |
| `jour`, `semaine`, `personnalisee` — **non ancrées** | les **N jours immédiatement antérieurs** | une fenêtre glissante répond à « est-ce que ça accélère par rapport à juste avant ? » |

Comparer un mois à date aux **derniers** jours du mois précédent répondrait à une
autre question que celle posée. Et comparer à 30 jours fixes fausserait février
contre janvier de trois jours, soit environ 10 % de CA d'écart artificiel.

### 3.4 bis — une période en cours s'arrête à aujourd'hui

`mois`, `trimestre` et `annee` en cours sont bornés à **aujourd'hui**, pas à la
fin de l'unité calendaire : « ce mois » vaut le **mois à date**.

Sans cela, la série journalière traînerait des jours futurs à zéro et l'en-tête
annoncerait « du 1er au 31 août » un 8 août — deux façons de faire croire à une
chute d'activité qui n'existe pas.

Une période **personnalisée n'est jamais tronquée** : l'utilisateur a choisi ses
bornes, on ne les corrige pas dans son dos.

### 3.5 Comparer un mois en cours à un mois complet — **tranché : option A**

Le 8 du mois, comparer « ce mois » (8 jours de ventes) à « le mois dernier » (31 jours)
affiche mécaniquement −74 %. C'est faux et anxiogène.

**Décision retenue** : quand la période
courante est **en cours**, la comparaison se fait **à date** — on ne prend du mois
précédent que le même nombre de jours écoulés (du 1er au 8 inclus). La réponse porte
alors un drapeau `comparaison_a_date: true` que l'interface affiche explicitement
(« comparé au 1–8 du mois dernier »).

Options écartées : comparer au mois complet avec un avertissement — un
avertissement ne rattrape jamais un chiffre choquant, l'œil voit le −74 % avant
de lire la note ; ou ne rien comparer tant que la période court — cela priverait
le client de son indicateur le plus consulté pendant tout le mois.

---

## §4. Ce qui entre dans un KPI

### 4.1 Ventes retenues

Une vente compte si, et seulement si :

- `entreprise_id` = l'entreprise appelante ;
- `statut = 'VALIDEE'` (donc **ni** `BROUILLON`, **ni** `ANNULEE`) ;
- `supprime_le IS NULL` ;
- `effectuee_le` (date de la vente) ∈ `[debut, fin[`.

**Le rattachement se fait sur `effectuee_le`, jamais sur `cree_le`.** Une vente de
lundi saisie mercredi appartient à lundi.

### 4.2 Dépenses retenues

Mêmes règles : `statut = 'VALIDEE'`, `supprime_le IS NULL`, `effectuee_le` dans la
période.

### 4.3 TVA / HT / TTC — **tranché : tout TTC, pas de TVA** (voir §9.1)

**Décision :** tous les montants sont **TTC**, le MVP ne gère **pas** la TVA. `chiffre_affaires` est donc un CA TTC, et `benefice` est un
solde encaissements − décaissements, pas un résultat comptable.

Si les clients cibles sont assujettis, il faudra :
- un taux de TVA par ligne de vente et par dépense,
- un CA HT **et** TTC dans le dashboard,
- une TVA collectée / déductible.

Ce n'est pas un ajout cosmétique : ça change le schéma, les formules et l'UI de saisie.
**Décision nécessaire avant la Vague 2** (CRUD ventes/dépenses).

### 4.4 Encaissé ou facturé ? — **tranché : trésorerie** (voir §9.2)

Pour un prestataire de services, une vente facturée en mars et payée en mai pose la
question : le CA de mars, ou de mai ?

**Décision :** le MVP est en **comptabilité de trésorerie** —
`effectuee_le` est la date de l'encaissement, et il n'existe pas d'état « impayé ».
Si tu veux suivre les impayés (utile pour les prestataires), il faut un statut de
paiement et une date d'échéance : ça relève de la Vague 2.

---

## §5. Les KPI

Notation : `Σventes` = somme des `montant_total` des ventes retenues (§4.1),
`Nventes` = leur nombre, `Σdepenses` / `Ndepenses` idem pour les dépenses.
Tous les montants sont en unité mineure.

| # | KPI | Formule | Cas nul |
|---|---|---|---|
| 1 | `chiffre_affaires` | `Σventes` | `0` si aucune vente |
| 2 | `depenses_totales` | `Σdepenses` | `0` |
| 3 | `benefice` | `chiffre_affaires − depenses_totales` | peut être négatif |
| 4 | `marge_pourcent` | `divArrondi(benefice * 1000, chiffre_affaires)` | **`null`** si `chiffre_affaires <= 0` |
| 5 | `nombre_ventes` | `Nventes` | `0` |
| 6 | `panier_moyen` | `divArrondi(chiffre_affaires, Nventes)` | **`null`** si `Nventes = 0` |
| 7 | `nombre_depenses` | `Ndepenses` | `0` |
| 8 | `depense_moyenne` | `divArrondi(depenses_totales, Ndepenses)` | **`null`** si `Ndepenses = 0` |

### 5.1 `null` ≠ `0`

Un panier moyen sans vente n'est pas 0 €, il est **non calculable**. Le moteur rend
`null`, l'interface affiche `—`. Afficher « 0 € » ferait croire à des ventes à 0 €.
Cette règle vaut pour tout quotient à dénominateur nul.

### 5.2 Évolution vs période précédente

Pour chaque KPI comparable (CA, dépenses, bénéfice, nombre de ventes, panier moyen) :

```
evolution_pourcent = divArrondi((valeur - valeur_precedente) * 1000, |valeur_precedente|)
```

- `valeur_precedente = 0` → `evolution_pourcent = null` **et** `base_nulle = true`.
  L'interface affiche « nouveau » ou « première période », pas « +∞ % » ni « +100 % ».
- Valeur absolue au dénominateur : une perte qui se réduit doit sortir en **positif**.
  (Bénéfice −1000 → −500 : c'est +50 % d'amélioration, pas −50 %.)

### 5.3 Séries et répartitions

| KPI | Définition |
|---|---|
| `serie_ca_par_jour` | Un point **par jour de la période, y compris les jours sans vente** (valeur `0`). Un graphe à trous ment sur la régularité de l'activité. |
| `repartition_depenses_par_categorie` | Montant + part en dixièmes de point, parts normalisées à 1000 (§2.5). Les dépenses sans catégorie tombent dans un bucket `non_categorise`. |
| `ca_par_moyen_paiement` | Idem, réparti sur `ventes.moyen_paiement`. |
| `top_produits` | Agrégat sur `lignes_vente` : par CA décroissant, puis quantité décroissante, puis libellé croissant. Limite par défaut 5. |
| `top_clients` | Agrégat sur `ventes.client_id`, ventes sans client exclues (pas regroupées en « anonyme »). |
| `meilleur_jour_semaine` | CA **moyen** par jour de la semaine, calculé sur le nombre d'occurrences réelles de ce jour dans la période. Un mois contient 4 ou 5 lundis : sommer sans diviser avantagerait le jour qui apparaît 5 fois. |

---

## §6. Forme de sortie du moteur

Une réponse de KPI est autoportante : elle contient sa période, sa devise et le nombre
de décimales, pour que le client formate sans rien deviner.

```jsonc
{
  "periode": {
    "cle": "mois",
    "debut": "2026-07-31T22:00:00.000Z",   // 1er août 00:00 Europe/Paris
    "fin":   "2026-08-31T22:00:00.000Z",
    "fuseau": "Europe/Paris",
    "en_cours": true
  },
  "devise": { "code": "EUR", "decimales": 2 },
  "kpi": {
    "chiffre_affaires": { "valeur": 345000, "evolution_pourcent": 122, "base_nulle": false },
    "depenses_totales": { "valeur": 89000,  "evolution_pourcent": -45,  "base_nulle": false },
    "benefice":         { "valeur": 256000, "evolution_pourcent": 210,  "base_nulle": false },
    "marge_pourcent":   { "valeur": 742 },
    "nombre_ventes":    { "valeur": 12,     "evolution_pourcent": 90,   "base_nulle": false },
    "panier_moyen":     { "valeur": 28750,  "evolution_pourcent": 17,   "base_nulle": false }
  },
  "comparaison_a_date": true
}
```

- Les montants sont des **entiers en unité mineure**. `345000` = 3 450,00 €.
- Les pourcentages sont des **dixièmes de point**. `742` = 74,2 %, `-45` = −4,5 %.
- `bigint` ne se sérialise pas en JSON : la sérialisation se fait en **nombre** si la
  valeur tient dans `Number.MAX_SAFE_INTEGER` (9,007 × 10¹⁵ — soit 90 000 milliards
  d'euros en centimes, largement au-delà de nos clients), sinon en **chaîne**. Le
  contrat retient le **nombre**, avec une garde qui lève une erreur au-delà.

---

## §7. Signature du moteur

Le moteur est **pur** : mêmes entrées → mêmes sorties. Il ne lit ni l'horloge, ni la
base, ni l'environnement. C'est ce qui rend les cas du §8 testables sans base.

```ts
export type VenteAgregable = {
  id: string;
  effectuee_le: Date;
  montant_total_mineur: bigint;   // unité mineure
  client_id: string | null;
  moyen_paiement: string | null;
};

export type DepenseAgregable = {
  id: string;
  effectuee_le: Date;
  montant_mineur: bigint;
  categorie_id: string | null;
};

export type Periode = { debut: Date; fin: Date; fuseau: string; cle: ClePeriode };

export function calculerKpi(entrees: {
  ventes: VenteAgregable[];        // déjà filtrées §4.1
  depenses: DepenseAgregable[];    // déjà filtrées §4.2
  ventesPrecedentes: VenteAgregable[];
  depensesPrecedentes: DepenseAgregable[];
  periode: Periode;
  devise: { code: string; decimales: number };
  maintenant: Date;                // injecté, jamais new Date() dans le moteur
}): ReponseKpi;
```

Le **filtrage** (§4) se fait en SQL — c'est Postgres qui sait faire ça vite. Le
**calcul** se fait en TypeScript — c'est là qu'on peut le tester au centime près. Les
deux sont testés séparément : le SQL contre la vraie base, le calcul contre les cas
du §8.

---

## §8. Cas de référence chiffrés

Ces cas deviennent des tests Vitest en Vague 3. **Un cas qui ne passe pas bloque la
vague.**

### Cas A — le cas nominal (celui du brief)

Entreprise en EUR. Période : mois complet.

| Entrée | Valeur |
|---|---|
| Ventes | 12 ventes, total **3 450,00 €** → `345000` |
| Dépenses | **890,00 €** → `89000` |

| Sortie attendue | Valeur mineure | Affichage |
|---|---|---|
| `chiffre_affaires` | `345000` | 3 450,00 € |
| `depenses_totales` | `89000` | 890,00 € |
| `benefice` | `256000` | 2 560,00 € |
| `panier_moyen` | `28750` | 287,50 € |
| `marge_pourcent` | `742` | 74,2 % |

Vérification du panier moyen : `345000 / 12 = 28750` exact.
Vérification de la marge : `256000 × 1000 / 345000 = 742,0289…` → `742`.

### Cas B — arrondis

| Situation | Calcul | Attendu |
|---|---|---|
| 3 ventes, total 100,00 € | `10000 / 3 = 3333,33` | `3333` → 33,33 € |
| 2 ventes, total 5,01 € | `501 / 2 = 250,5` → moitié, on s'éloigne de 0 | `251` → 2,51 € |
| 3 ventes, total 150,03 € | `15003 / 3 = 5001` exact | `5001` → 50,01 € |

Le deuxième cas est le test qui discrimine l'arrondi commercial de l'arrondi bancaire :
*half to even* donnerait `250`.

### Cas C — dénominateurs nuls

Aucune vente, 450,00 € de dépenses.

| Sortie | Attendu |
|---|---|
| `chiffre_affaires` | `0` |
| `depenses_totales` | `45000` |
| `benefice` | `-45000` (négatif, autorisé) |
| `panier_moyen` | **`null`** |
| `marge_pourcent` | **`null`** (CA = 0) |
| `nombre_ventes` | `0` |

### Cas D — devise sans décimale (XOF)

6 ventes, total **1 750 000 XOF** → `1750000` (décimales = 0).

`1750000 / 6 = 291666,67` → `panier_moyen = 291667` → affiché **291 667 XOF**,
sans virgule. Un moteur qui suppose « 2 décimales » afficherait 2 916,67 XOF, soit une
erreur d'un facteur 100.

### Cas E — fuseau horaire et exclusions

Entreprise `Europe/Paris`, période = **mai 2026** (`[2026-04-30T22:00Z, 2026-05-31T22:00Z[`).

| Enregistrement | Compté ? | Pourquoi |
|---|---|---|
| Vente `2026-05-15T10:00Z`, VALIDEE, 100,00 € | **oui** | dans la période |
| Vente `2026-05-31T22:30Z`, VALIDEE, 500,00 € | **non** | = 1er juin 00 h 30 à Paris |
| Vente `2026-04-30T22:30Z`, VALIDEE, 200,00 € | **oui** | = 1er mai 00 h 30 à Paris |
| Vente `2026-05-10T09:00Z`, **ANNULEE**, 999,00 € | **non** | statut exclu |
| Vente `2026-05-11T09:00Z`, VALIDEE, `supprime_le` renseigné | **non** | soft delete |
| Dépense `2026-05-20T08:00Z`, VALIDEE, 50,00 € | **oui** | |

Attendu : `chiffre_affaires = 30000` (300,00 €), `nombre_ventes = 2`,
`depenses_totales = 5000`, `benefice = 25000`, `panier_moyen = 15000`.

### Cas F — évolution sur base nulle

Mois précédent : 0 vente, CA `0`. Mois courant : CA `120000`.

Attendu : `evolution_pourcent = null`, `base_nulle = true`.
**Pas** `+100 %`, **pas** `+∞`.

Bénéfice précédent `-100000`, bénéfice courant `-50000` →
`(-50000 − (−100000)) × 1000 / |−100000| = +500` → **+50,0 %** (la perte se réduit,
l'indicateur est positif).

### Cas G — répartition normalisée à 100,0 %

Trois catégories de dépenses : `achats` 1 000,00 €, `loyer` 1 000,00 €,
`salaires` 1 000,00 €. Total 3 000,00 €.

Parts brutes : `1000 × 100000 / 300000 = 333,33` dixièmes → partie entière `333`
chacune, somme `999`. Il reste **1** dixième à distribuer. Restes égaux → départage par
montant (égaux) → par identifiant croissant → `achats`.

Attendu : `achats 33,4 %`, `loyer 33,3 %`, `salaires 33,3 %`. **Somme = 100,0 %.**

### Cas H — meilleur jour de la semaine

Période = un mois contenant **5 lundis** et **4 mardis**.
Lundis : 5 ventes de 100,00 € (une par lundi) → total `50000`.
Mardis : 4 ventes de 110,00 € → total `44000`.

Moyenne par occurrence : lundi `50000/5 = 10000`, mardi `44000/4 = 11000`.
Attendu : **le mardi** est le meilleur jour, malgré un total inférieur.

---

### À remplir par toi — cas issus du métier

Il me manque **3 à 5 cas réels** venant de ton terrain. C'est la seule partie que je ne
peux pas produire : elle vient de ce que tes futurs clients considèrent comme juste.
Format attendu, un cas par bloc :

```
Secteur          : (commerce de détail / restauration / services…)
Devise           : EUR
Période          : mois de …
Ventes           : N ventes, détail ou total
Dépenses         : détail ou total
→ CA attendu     :
→ Bénéfice       :
→ Panier moyen   :
→ Ce qui te surprendrait dans ce chiffre si le moteur se trompait :
```

Les cas les plus utiles sont ceux qui **ne tombent pas rond** et ceux où tu hésites
toi-même : c'est là que la spec est ambiguë.

---

## §9. Décisions — arrêtées le 27 août 2026

Le propriétaire du projet a délégué ces arbitrages. Ils sont **tranchés**, avec
leur raison. Ils restent révisables, mais plus par défaut : les changer demande
une migration et une reprise de l'UI.

| # | Sujet | Décision | Raison |
|---|---|---|---|
| 1 | Comparaison période en cours (§3.5) | **Option A — comparaison à date**, avec `comparaison_a_date: true` affiché | Comparer 8 jours à 31 affiche −74 % le 8 du mois. C'est faux, et un indicateur qui ment une fois n'est plus jamais cru. |
| 2 | TVA / HT / TTC (§4.3) | **Tout TTC, pas de TVA en MVP** | Voir §9.1 |
| 3 | Encaissé vs facturé (§4.4) | **Comptabilité de trésorerie** — `effectuee_le` = date d'encaissement | Voir §9.2 |
| 4 | Devise par défaut | `EUR`, modifiable par entreprise parmi 10 devises | Le référentiel porte déjà XOF/XAF/MAD/DZD/TND : ouvrir hors zone euro ne demandera aucune migration. |
| 5 | Fuseau par défaut | `Europe/Paris`, modifiable | Idem, et validé par la base. |
| 6 | Contenu des questions intelligentes | **Catalogue rédigé en Vague 4**, soumis à validation avant implémentation | C'est le cœur de valeur : il mérite d'être écrit avec les vraies données de test sous les yeux, pas dans le vide. |
| 7 | Secteurs d'activité | **Les 9 en base** | Assez large pour couvrir la cible, assez court pour que chaque secteur ait de vraies règles dédiées. |

### §9.1 Pourquoi pas de TVA dans le MVP

CLAUDE.md §1 met explicitement la **conformité fiscale hors périmètre**. Gérer
la TVA correctement, ce n'est pas ajouter un champ : c'est un taux par ligne, un
CA HT **et** TTC, une TVA collectée et déductible, et les régimes (franchise en
base, réel simplifié, réel normal). Mal faite, elle produit des chiffres faux
que le client prendrait pour argent comptant.

Le MVP vise d'abord **l'entreprise non assujettie ou en franchise en base** —
micro-entrepreneur, petit commerçant — pour qui `CA TTC − dépenses TTC` est un
solde juste.

Deux conséquences à tenir :

1. L'interface libelle le KPI **« Chiffre d'affaires encaissé (TTC) »**, jamais
   « CA » tout court. Un assujetti doit voir immédiatement ce qu'il regarde.
2. Les migrations étant append-only, ajouter plus tard `taux_tva` sur les lignes
   et un `montant_ht_mineur` est une migration simple. **Rien dans le schéma
   actuel n'interdit la TVA** — on ne se ferme aucune porte, on ne l'ouvre pas
   maintenant.

### §9.2 Pourquoi la trésorerie plutôt que la facturation

Un commerçant encaisse au moment de la vente : les deux dates se confondent, et
la trésorerie est son modèle mental naturel. Pour un prestataire, elles
diffèrent — mais un « bénéfice » calculé sur des factures non payées est un
bénéfice qu'on n'a pas en banque, et c'est le pire mensonge que puisse faire un
outil de gestion.

Le suivi des impayés (statut de paiement, date d'échéance, relances) est une
**fonctionnalité à part entière**, pas un réglage. Elle a sa valeur commerciale
propre pour les prestataires de services : c'est un candidat sérieux pour la
première évolution après le MVP, pas un ajout discret en Vague 2.
