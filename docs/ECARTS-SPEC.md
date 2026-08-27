# Écarts entre la spécification métier et le code

> Spécification métier reçue le **27 août 2026**. Ce document la confronte, point
> par point, à ce qui est construit et vérifié (Vagues 0 à 3).
>
> Son §8 le demande explicitement : *« toute contradiction se signale, elle ne se
> tranche pas en silence »*. C'est ce fichier.

---

## 0. Le cas de référence est juste

Recalculé indépendamment, sans réutiliser une ligne du moteur : **26 valeurs sur
26 confirmées**. Y compris les deux points où une erreur était facile :

- **panier moyen, +1,3 %** — la valeur exacte est `+1,25 %`, et le demi se
  résout vers le haut. Un arrondi intermédiaire du panier précédent
  (`31,11 €`) aurait donné `1,2536 %`, soit `1,3 %` aussi : le cas ne discrimine
  pas, mais la règle du §1 reste appliquée (voir écart n° 2) ;
- **Ibrahima Ba, 118 jours** d'inactivité au 27 août.

Le cas est encodé dans `server/src/domaine/casReference.test.ts`. **Sur les
20 assertions que le modèle de données actuel permet, 20 passent.**

---

## 1. Ce qui manque en base — 8 questions sur 14 sans réponse possible

Aucun code ne peut contourner une donnée absente. Le §4 de la spécification liste
14 questions ; voici l'état réel.

### Répondues aujourd'hui

| Question | État |
|---|---|
| Combien ai-je gagné ? | ✅ vérifié au centime |
| Quel est mon bénéfice estimé ? | ✅ |
| Où est-ce que je dépense le plus ? | ✅ |
| Mes dépenses augmentent-elles ? | ✅ |
| Mes ventes progressent-elles ? | ✅ |
| Quel est mon panier moyen ? | ✅ |

### Bloquées faute de données

| Question | Ce qui manque |
|---|---|
| Quel est mon produit le plus vendu ? | classement par **quantité** — les données existent (`lignes_vente`), le classement n'est exposé que par CA |
| Quel produit génère le plus de CA ? | ✅ en réalité — déjà rendu par `top_produits` |
| Quel produit est le plus rentable ? | **`cost` produit** |
| Quels produits se vendent le moins ? | classement croissant par quantité + gestion des ex æquo |
| Quelle catégorie génère le plus de revenus ? | **`products.category`** |
| Qui sont mes meilleurs clients ? | **clients rattachés aux ventes** |
| Combien de clients ai-je ? | **clients** |
| Quels clients n'ont pas acheté récemment ? | **clients** |

### Les deux tables manquantes

**`produits`** — la spécification suppose un catalogue :
`{ id, name, category, price, cost }`. Bizly stocke aujourd'hui des **lignes de
vente en texte libre** (`libelle`, `quantite`, `prix_unitaire`), sans coût ni
catégorie. Conséquence directe : **la marge est impossible à calculer**, et
« marge globale 138,00 € » n'a aucune donnée derrière elle.

**`clients` rattachés aux ventes** — la table `clients` existe depuis la
Vague 0 et `ventes.client_id` aussi, avec la clé étrangère composite qui
garantit l'isolation. Mais **aucun écran ne crée de client** et `client_id`
n'est jamais renseigné. Ce n'est donc pas une migration lourde : c'est un CRUD
et un champ dans le formulaire de vente.

> Ces deux manques sont la vraie Vague 4. Le moteur de questions ne peut pas
> être « le cœur de valeur » tant que 8 de ses 14 questions n'ont rien à lire.

---

## 2. Règles appliquées immédiatement

Deux règles de la spécification sont énoncées sans ambiguïté et contredisaient le
code. Elles sont **corrigées**, avec leurs tests.

### Écart n° 1 — évolution du bénéfice quand le signe est traversé *(corrigé)*

**Spécification §3.5** : quand la valeur traverse zéro, le pourcentage devient
trompeur ; afficher l'écart en **montant**, le pourcentage seulement si les deux
valeurs sont du même signe.

**Avant** : le bénéfice passant de `+20,00 €` à `−60,00 €` affichait
`−400,0 %` — exact, illisible.

**Maintenant** : `evolution_pourcent` vaut `null` dès que le signe change, et un
champ `evolution_montant` est rendu pour **tous** les indicateurs monétaires.
L'interface affiche `−80,00 €`.

### Écart n° 2 — arrondi intermédiaire sur l'évolution du panier moyen *(corrigé)*

**Spécification §1** : aucun arrondi intermédiaire, seul l'affichage arrondit.

**Avant** : les deux paniers moyens étaient arrondis au centime, *puis*
comparés. Sur le cas de référence les deux méthodes donnaient `1,3 %`, mais la
dérive était réelle sur d'autres jeux.

**Maintenant** : l'évolution est calculée sur les moyennes exactes, en
arithmétique entière :

```
(total × effectifPrécédent − totalPrécédent × effectif) / (totalPrécédent × effectif)
```

---

## 3. Contradictions à trancher — **non modifiées**

### Écart n° 3 — période précédente

| | Règle |
|---|---|
| **Spécification §2** | même nombre de jours, se terminant la veille du premier jour de la période |
| **Code** | période **calendaire** précédente pour `mois`/`semaine`/`trimestre`/`annee` ; pour une période **personnalisée**, les N jours antérieurs — soit exactement votre règle |

Concrètement, le 8 août :

- votre règle → « ce mois » = 1–8 août, comparé au **24–31 juillet** ;
- le code → 1–8 août, comparé au **1–8 juillet**, avec l'étiquette « à date ».

Aucune des deux n'est fausse. La vôtre supprime le biais 28 / 31 jours ; la
mienne compare la même position dans le mois, ce qui capte la saisonnalité
intra-mensuelle (un commerce qui encaisse en début de mois). **À trancher.**

### Écart n° 4 — fuseaux horaires

| | Règle |
|---|---|
| **Spécification §1** | `DATE` calendaire, **aucune conversion de fuseau** |
| **Code** | `timestamptz`, fuseau par entreprise, 22 tests dédiés dont les journées de 23 h et 25 h |

En pratique les deux se rejoignent : l'utilisateur saisit une date, le serveur
la range au bon jour local et rend `date_locale`. Le fuseau n'apparaît nulle
part dans l'interface.

Repasser en `DATE` nu demanderait une migration et retirerait des garanties déjà
vérifiées. **Recommandation : garder `timestamptz`**, en considérant que le
produit se comporte comme une date calendaire — ce qu'il fait déjà.

### Écart n° 5 — répartition qui ne somme pas à 100 %

**Spécification §3.9** : les pourcentages arrondis peuvent ne pas sommer à
100,0 %, ne pas forcer d'ajustement.

**Code** : méthode du plus fort reste, la somme fait **exactement** 100,0 %.

Sur votre cas de référence, les deux donnent le même résultat
(`53,3 / 20,0 / 18,7 / 8,0`). La divergence n'apparaît que sur des parts égales
— trois catégories identiques donneraient `33,3 × 3 = 99,9 %` avec votre règle.

**Recommandation : garder la normalisation.** Un camembert qui affiche 99,9 %
passe pour un bug aux yeux de l'utilisateur, et la méthode du plus fort reste est
déterministe (départage par montant puis par identifiant).

### Écart n° 6 — convention d'arrondi sur les négatifs

**Spécification §1** : « au plus proche, **demi vers le haut** ».
**Code** : au plus proche, **demi s'éloignant de zéro**.

Identiques sur les positifs. Sur `−1,25 %` : votre règle donne `−1,2 %`, le code
donne `−1,3 %`. Cela ne concerne que des pourcentages négatifs tombant
exactement sur un demi.

**Recommandation : garder « s'éloignant de zéro »** — c'est l'arrondi commercial,
symétrique, celui qu'un commerçant retrouve à la calculatrice. Mais c'est votre
appel.

### Écart n° 7 — format des montants

**Spécification §6** : `"value": 315.00` — décimal dans le JSON.
**Code** : entiers d'unité mineure (`31500`), la devise porte ses décimales.

Le fond est compatible : votre §1 interdit l'arrondi intermédiaire, les entiers
l'interdisent par construction. Seule la **frontière JSON** diffère.

**Recommandation : garder les entiers en interne**, et produire la forme
décimale de votre §6 au moment précis où l'on parlera à la couche IA — un seul
adaptateur, à un seul endroit.

---

## 4. Incohérences internes à la spécification

Signalées telles quelles, sans les corriger.

1. **Les ventes anonymes dans le classement clients.** Le §3.8 dit : *« Les
   ventes sans client associé … jamais dans un classement de clients »*. Le
   tableau du §7 liste pourtant `(anonyme) 35 €` dans « Client par CA ».
   **Laquelle des deux ?** (Je penche pour le §3.8 : une ligne « anonyme » dans
   un classement de clients n'est actionnable pour personne.)

2. **« Ce mois-ci » du §4 vaut 315 €.** Mais le §2 définit *Mois* comme
   `[1er ; aujourd'hui]`, soit **1–27 août**, alors que le cas de référence
   couvre **1–15 août**. Le libellé et la période ne coïncident pas — le cas de
   référence est en réalité une période *personnalisée* de 15 jours.

3. **Renvois vers des documents absents du dépôt.** La spécification cite
   `CLAUDE.md §4` (obligation de `sales.product_id`), `CLAUDE.md §6` (questions
   par secteur) et un fichier `GEMINI.md` (contrat de la couche d'explication).
   **Aucun de ces contenus n'existe dans le dépôt.** Le `CLAUDE.md` qui s'y
   trouve est celui que j'ai reconstruit en Vague 0 — les fichiers étaient vides.
   Il y a donc une autre version quelque part : **peux-tu me la transmettre ?**
   Sans elle, la liste des questions par secteur et le contrat de la couche IA
   me manquent.

---

## 5. Le sujet neuf : la couche d'explication IA

La spécification introduit un élément absent de toute vague précédente : une
couche **Gemini** qui reçoit un JSON déjà calculé et le reformule en français.

Deux garde-fous y sont posés, et ils sont bons :

- l'IA **ne calcule jamais** ;
- *« toute valeur numérique dans sa phrase doit déjà exister dans ce JSON »*.

Le second est testable : on peut extraire les nombres de la phrase produite et
vérifier qu'ils figurent tous dans le JSON d'entrée — un garde-fou automatique
contre l'invention de chiffres.

**Il me faut une clé d'API.** Où la trouver : <https://aistudio.google.com/apikey>
→ *Create API key*. À déposer dans `.env` sous `GEMINI_API_KEY=`, jamais dans la
conversation. Rien d'autre n'est nécessaire ; je m'occupe de l'intégration, du
cache et du repli quand l'API est indisponible.

---

## 6. Ce que je propose

| Étape | Contenu | Bloqué par |
|---|---|---|
| **4a** | `produits` (catalogue avec `cost` et `category`) + activation des `clients` (CRUD, rattachement aux ventes) | rien — je peux commencer |
| **4b** | Les 14 questions du §4, chacune adossée à sa formule, testées sur le cas de référence | 4a |
| **4c** | Couche d'explication Gemini, avec le garde-fou « aucun chiffre inventé » | `GEMINI_API_KEY` + `GEMINI.md` |

Les quatre décisions du §8 de la spécification restent ouvertes : concept de
projet (BTP), `product_id` obligatoire, seuil d'inactivité à 60 jours,
période par défaut des meilleurs clients. Aucune ne bloque l'étape 4a.
