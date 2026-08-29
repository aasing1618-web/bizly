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

### ~~Écart n° 3 — période précédente~~ **RÉSOLU le 28 août 2026**

Arbitrage rendu : **le code avait raison** pour les périodes ancrées au
calendrier. La spécification métier §2 distingue désormais deux cas, et c'est
exactement ce que le code faisait déjà :

| Période | Comparaison |
|---|---|
| `mois`, `trimestre`, `annee` | même position depuis le début de l'unité précédente — le 8 août → **1–8 juillet** |
| `jour`, `semaine`, `personnalisee` | les **N jours immédiatement antérieurs** |

Vérifié par un test dédié (`periodes.test.ts`, « applique la règle ANCRÉE de la
spécification métier §2 »).

**Un point restait divergent, et il est corrigé** : le §2 borne une période en
cours à **aujourd'hui**, alors que le code prenait l'unité calendaire entière.
« Ce mois » vaut donc désormais le mois **à date** — un 8 août, du 1er au 8, et
non du 1er au 31. Sans quoi la série journalière traînait des jours futurs à
zéro et l'en-tête annonçait une période plus longue que la réalité.

Une période **personnalisée n'est jamais tronquée** : les bornes sont celles que
l'utilisateur a choisies.

Aucun effet sur le cas de référence du §7, qui utilise une période
personnalisée — confirmé par `casReference.test.ts`, toujours au vert.

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

---

# Partie II — écarts avec le vrai `CLAUDE.md`

> Le `CLAUDE.md` authentique et `GEMINI.md` ont été reçus le **28 août 2026** et
> remplacent la version reconstruite en Vague 0. Cette partie recense ce que
> cette substitution change.
>
> Bonne nouvelle d'abord : **aucune formule, aucun principe de sécurité, aucune
> décision d'architecture ne contredit ce qui est construit.** Les écarts
> portent sur des champs manquants, deux réglages, et un point de méthode que je
> dois assumer.

---

## A. Ce que je dois assumer

### A.1 J'ai testé contre la base de production — `CLAUDE.md` §9

> « **Base de test séparée de la base de production** avant tout test
> automatisé. »

Toutes mes vérifications de fin de vague (Vagues 0 à 4b) ont tourné **contre la
base Supabase réelle**. J'ai systématiquement nettoyé derrière moi et vérifié
table par table le retour à zéro ligne, et les écritures les plus risquées
passaient par une transaction annulée — mais la règle dit « base séparée », et
je ne l'ai pas respectée.

Ce n'est pas anodin : le jour où le projet aura de vraies données, un script de
vérification qui se trompe de `DELETE` les emporte.

**À faire avant la mise en ligne, et de préférence avant la prochaine vague :**
un second projet Supabase, `DATABASE_URL_TEST` dans `.env`, et les scripts de
vérification qui refusent de démarrer si l'URL pointe ailleurs. C'est une
vingtaine de lignes ; dis-moi si tu veux que je crée le projet de test ou si tu
préfères le faire.

### A.2 RLS Postgres n'est pas activée — `CLAUDE.md` §9

> « Isolation par `business_id` stricte ; **RLS Postgres** empêche toute lecture
> croisée. »

Ce qui est en place : chaque requête filtre sur `entreprise_id`, et des **clés
étrangères composites** `(ressource_id, entreprise_id)` font refuser par la base
elle-même toute ligne qui traverserait la frontière d'une entreprise. C'est
vérifié — la base a bien refusé une ligne de vente pointant vers le produit
d'une autre entreprise (Vague 4a).

Ce qui manque : **`ROW LEVEL SECURITY`**. Aujourd'hui, une requête qui oublierait
son `WHERE entreprise_id` lirait tout. Rien ne l'empêche au niveau de la base.

La difficulté : RLS s'appuie sur une variable de session (`SET LOCAL
app.entreprise_id`), et le **pooler en mode transaction ne conserve aucun état
de session** entre deux requêtes. C'est faisable — `SET LOCAL` dans la même
transaction que la requête — mais cela impose de passer **toutes** les lectures
par une transaction explicite. C'est une vague à part entière, pas un ajout.

**Recommandation : la traiter en Vague 5 (« Sécurité, mise en ligne »)**, qui est
exactement là où ton §10 la place. Je la signale maintenant pour qu'elle ne soit
pas oubliée.

---

## B. Champs et tables manquants

| Ce que dit `CLAUDE.md` | État | Impact |
|---|---|---|
| `businesses.country` (§3, §4) | **ajouté** le 29 août 2026 (migration `0004`) | Demandé à l'inscription, il pré-remplit la devise et le fuseau. |
| `businesses.plan (free\|pro\|business)` (§4, §12) | **ajouté** le 29 août 2026 (migration `0004`) | Champ manuel, changé depuis `/admin/` uniquement — pas de paiement (§7.4). |
| `products.active (bool)` (§4) | remplacé par une suppression douce (`supprime_le`) | Équivalent fonctionnel, et l'historique reste daté. À confirmer. |
| `expenses.description` (§4) | présent sous le nom `note` | Simple différence de nom. |
| `analysis_questions` (table) (§4) | **le catalogue est dans le code**, pas en base | Voir §B.1 ci-dessous. |
| `analysis_results` (historique) (§4) | **absent** — marqué « facultatif » | À construire seulement si l'historique des analyses devient un besoin réel. |

### B.1 Le catalogue de questions : en base ou dans le code ?

Ton §4 prévoit une table `analysis_questions (id, key, category, sector, label)`.
Les 14 questions vivent aujourd'hui **dans le code**, avec leurs formules.

C'est délibéré de ma part et je le signale plutôt que de le corriger en silence :
une question n'est pas une donnée, c'est **une formule plus un libellé**. Mettre
le libellé en base sans la formule crée deux sources de vérité qui divergeront ;
et une question ajoutée en base sans code correspondant ne renverrait rien.

**Une table aurait du sens** si tu veux activer/désactiver des questions par
entreprise, ou les réordonner sans redéploiement. Dis-moi si c'est le besoin :
c'est alors une table de **configuration** (`key`, `active`, `ordre`) qui pointe
vers les formules du code, pas une table qui les remplace.

---

## C. Deux réglages divergents

### C.1 Cookie : `SameSite=Lax` contre `SameSite=Strict` — §7.1

Ton §7 justifie l'origine unique par le besoin d'un cookie `SameSite=Strict`.
J'ai posé **`Lax`**.

La différence, concrètement : avec `Strict`, un utilisateur qui clique sur un
lien vers Bizly **depuis un e-mail, une conversation ou un moteur de recherche
arrive déconnecté**, même s'il a une session valide. Le cookie n'est pas envoyé
sur une navigation venue d'un autre site. Il doit recharger la page pour que ça
marche — et la plupart des gens concluent que le service les a déconnectés.

`Lax` envoie le cookie sur une **navigation entrante** (un clic sur un lien),
mais jamais sur une requête inter-site (formulaire POST, image, script). La
protection CSRF est équivalente pour ce produit, sans le symptôme.

**Recommandation : garder `Lax`.** Mais c'est ton §7, décision figée — dis-moi
si tu veux `Strict` et je bascule en une ligne.

### C.2 « 7 jours » contre « semaine » — §5

Ton §5 liste les périodes : aujourd'hui, **7 jours**, mois, trimestre, année,
personnalisée. J'ai implémenté **`semaine`** = la semaine calendaire ISO
(lundi → dimanche).

Ce n'est pas la même chose : « 7 jours » est une fenêtre glissante
`[aujourd'hui − 6 ; aujourd'hui]`, la semaine ISO est ancrée au lundi.

Les deux ont leur usage, et la règle de comparaison diffère (glissante pour
« 7 jours », ancrée pour « semaine » — `MOTEUR-ANALYTICS.md` §3.4). **Je peux
ajouter « 7 jours » à côté de « semaine »** : c'est une clé de période de plus,
une dizaine de lignes. Dis-moi si tu veux les deux ou seulement l'une.

---

## D. Une contradiction entre tes deux documents

**Panier moyen sans aucune vente.**

| Document | Règle |
|---|---|
| `CLAUDE.md` §5 | « **0** si aucune vente, jamais une division par zéro qui plante » |
| `MOTEUR-ANALYTICS.md` §3.4 | « Si nombre de ventes = 0 → **`null`**, jamais une division par zéro qui plante ni un 0 qui casse l'affichage » |

Le code applique **`null`**, avec un `—` à l'écran.

Les deux textes partagent la même intention — ne pas planter — mais divergent
sur ce qu'on affiche. `CLAUDE.md` fait foi selon son propre en-tête ;
`MOTEUR-ANALYTICS.md` est plus récent et argumente explicitement contre le zéro
(« afficher 0 € ferait croire à des ventes à zéro euro »).

**Je n'ai rien changé** — c'est exactement le genre d'arbitrage que ton §5 dit de
signaler et pas de réinterpréter. Ma préférence va à `null` : un panier moyen de
0 € est une information fausse, alors qu'un tiret est une information juste.
**À trancher.**

*(Deuxième contradiction, déjà signalée en partie I : ton `MOTEUR-ANALYTICS.md`
§3.8 exclut les ventes anonymes des classements clients, tandis que le tableau
du §7 en liste une. Le code applique la règle du §3.8.)*

---

## E. Ce que le vrai `CLAUDE.md` confirme

Utile à noter, pour ne pas rouvrir ces sujets :

- **Une seule origine, un seul processus** (§7) — conforme.
- **Moteur côté serveur uniquement** (§7.2) — conforme, et vérifié : aucune
  formule métier n'est dans le bundle client.
- **Pas d'ORM, SQL à la main, migrations numérotées** (§7.3) — conforme.
- **Aucun paiement en ligne dans le MVP** (§7.4) — conforme.
- **404 et jamais 403** pour une ressource d'une autre entreprise (§9) —
  conforme, vérifié en lecture, modification et suppression.
- **Marge nulle si `cost` est null, jamais 100 %** (§5) — conforme.
- **Questions préconstruites, pas de champ libre vers une IA** (§6) — conforme.
- **L'IA n'intervient jamais avant l'étape de calcul** (§6) — conforme, et
  désormais renforcé : voir partie III.

---

# Partie III — la couche d'explication, sans IA

Ton `GEMINI.md` décrit une couche d'explication qui appelle l'API Gemini pour
reformuler un résultat déjà calculé. Ton `CLAUDE.md` §6 et §10 la qualifient
deux fois d'**optionnelle**.

Elle est implémentée **sans IA**, en français déterministe, côté serveur
(`server/src/domaine/formulation.ts`). Chaque question porte désormais un champ
`phrase`.

**Pourquoi c'est mieux ici qu'un appel à Gemini :**

| | Couche déterministe | Appel Gemini |
|---|---|---|
| « Aucun chiffre inventé » | **vrai par construction** — la phrase est assemblée à partir du résultat | vérifié après coup par un test, donc faillible en production |
| Clé d'API | aucune | `GEMINI_API_KEY` à obtenir, stocker, faire tourner |
| Coût | nul | par requête |
| Latence | nulle | un aller-retour réseau par question, soit 14 par écran |
| Panne du service | impossible | l'écran perd ses phrases |
| Déterminisme | deux chargements donnent le même texte | non garanti |

**Le garde-fou de ton `GEMINI.md` est écrit quand même** : un test extrait tous
les nombres de chaque phrase produite et vérifie qu'ils figurent tous dans le
résultat calculé, avec une contre-épreuve qui prouve que le test détecterait un
chiffre inventé. Il passe aujourd'hui trivialement — et il sera prêt, tel quel,
le jour où une reformulation par IA viendra s'ajouter.

Car elle peut s'ajouter : ton §13 place « explications Gemini » dans la feuille
de route **après** le MVP. Le jour venu, ces phrases resteront le **repli** quand
l'API est indisponible — ce qui est de toute façon nécessaire.

---

# Partie IV — décisions prises en Vague 5

## IV.1 La devise se choisit, et se verrouille

`CLAUDE.md` §2 veut un produit « horizontal et international », et §4 met
`currency` sur `businesses`. Le champ existait depuis la Vague 0, mais **rien ne
permettait de le choisir** : tout compte naissait en euro, à l'heure de Paris.

C'est désormais un choix explicite à l'inscription — franc CFA, euro et dollar
en tête, vingt autres devises derrière — et modifiable dans Paramètres, **tant
qu'aucun montant n'est enregistré**.

**Le verrou est la partie qui compte.** Un montant est stocké en unité mineure
(`MOTEUR-ANALYTICS.md` §1) : passer d'EUR à XOF ferait cesser à `31500` de valoir
315,00 € pour valoir 31 500 FCFA. Aucune conversion, tout l'historique change de
sens.

Trois options ont été pesées :

| Option | Verdict |
|---|---|
| Convertir au taux du jour | **Refusée.** Aucune source de taux n'est disponible, et en inventer une ferait produire à l'application un chiffre financier faux — ce que ton §15 interdit explicitement. |
| Laisser passer entre devises de même exposant (EUR → USD) | **Refusée.** 315,00 € ne vaut pas 315,00 $. La ressemblance des formats rend l'erreur plus dangereuse, pas moins. |
| Refuser dès la première écriture, en expliquant | **Retenue.** |

Le refus est un `409` qui nomme les volumes bloquants, pour qu'il soit
**vérifiable** par l'utilisateur au lieu d'être un mur.

## IV.2 Le fuseau suit le pays

Le point qui ne se serait vu que tard : sans lui, une vente saisie à 22 h 30 à
Dakar serait comptée le lendemain, le serveur ayant supposé Paris. Le pays est
donc demandé à l'inscription — **une question**, pas trois — et remplit devise
et fuseau, tous deux modifiables ensuite.

Un pays inconnu est refusé en `400`, jamais ignoré : l'ignorer donnerait
silencieusement une devise que personne n'a choisie.

## IV.3 La liste des pays vit dans le code, pas en base

Contrairement aux devises et aux secteurs, qui restent en base parce que des
clés étrangères les contraignent. Les pays ne contraignent rien : ISO 3166-1
figé, aucune jointure. Une table imposerait une migration par pays ajouté sans
rien apporter — et le serveur valide contre **exactement la même constante** que
celle affichée au client, ce qu'une table ne garantirait pas mieux.

Un test vérifie l'invariant qui compte : la devise de chaque pays proposé existe
bien dans les migrations. Sans lui, choisir un pays pourrait produire une
inscription refusée pour « devise inconnue » — sur un choix que l'écran a
lui-même proposé.

## IV.4 La console d'administration existe parce que trois choses n'avaient pas d'autre porte

1. **Changer le plan** — ton §7.4 dit « changé à la main par l'admin ». Il
   n'existait aucun admin.
2. **Suspendre et réactiver** — le livrable vérifiable de la Vague 1 (§10) était
   « un compte suspendu est bloqué ». C'était vrai en base, mais rien ne
   permettait de suspendre.
3. **Réinitialiser un mot de passe** — la Vague 1 promettait « la
   réinitialisation est manuelle depuis `/admin` ». `/admin` affichait une sonde
   de santé.

Ce qu'elle **ne fait pas**, volontairement : lire une vente, une dépense ou un
client. Aucune raison d'exploitation ne l'exige, et un support qui peut tout
lire est une fuite qui attend son incident.

Aucune route d'inscription admin n'est exposée : le premier compte se crée en
ligne de commande, sur la machine qui détient déjà l'accès à la base.

## IV.5 Ce qui reste à trancher, et qui t'appartient

| Question | État du code | Ce que je recommande |
|---|---|---|
| Panier moyen sans aucune vente : `0` (§5) ou `null` (`MOTEUR-ANALYTICS` §3.4) ? | `null`, affiché `—` | **`null`.** « 0 € » est une information fausse ; un tiret est une information juste. |
| Cookie `SameSite` : `Lax` (code) ou `Strict` (§7.1) ? | `Lax` | Voir partie C.1 — inchangé. |
| Catalogue de questions en table (§4) ou en code ? | en code | Voir partie B.1 — inchangé. |
| Seuil d'inactivité client | 60 jours | À confirmer avec de vrais utilisateurs, puis à rendre paramétrable par secteur. |

Aucune de ces questions ne bloque le test du produit.
