# Reprise — où en est Bizly

> Mis à jour à la fin de chaque vague. À lire en premier quand on reprend le
> projet après une pause, avant `CLAUDE.md`.

**Dernière mise à jour : 29 août 2026 — Module de paiement Mobile Money & Quota 30 ventes/mois du plan Gratuit intégrés.**

> ⚠️ **À lire en premier** : `CLAUDE.md` et `GEMINI.md` sont les **fichiers
> authentiques** transmis par le propriétaire, et non plus la reconstruction
> faite en Vague 0. Les écarts entre eux et le code sont recensés dans
> `docs/ECARTS-SPEC.md`, **partie II**. Deux points y demandent encore une
> action : la base de test séparée de la production, et RLS Postgres.

---

## État en une phrase

Les **sept modules du MVP** (`CLAUDE.md` §3) ainsi que le **module d'abonnement & paiement Mobile Money (Wave & Orange Money)** et le **blocage Paywall du plan Gratuit (30 ventes/mois max)** sont entièrement livrés et vérifiés contre la vraie base Supabase :
entreprise, tableau de bord, ventes, dépenses, clients, produits, analyses, paramètres, abonnements & paiements — plus les Paramètres et une console d'administration. **377 tests automatisés** au vert. Tout est poussé sur GitHub (`origin/main`). Vague 5 du §10 : RLS Postgres et mise en ligne.

### Pour démarrer un test complet

```bash
npm install && npm run build
npm run migrate            # doit afficher 4 migrations appliquées
npm run admin:creer        # crée l'accès à /admin/ — une seule fois
npm start                  # http://localhost:3000  et  http://localhost:3000/admin/
```

---

## Vague 0 — livrée

| Livrable | Où | État |
|---|---|---|
| Constitution du projet | `CLAUDE.md` | écrite (reconstruite : le fichier était vide) |
| Règles pour les agents | `AGENTS.md` | écrites |
| Spécification du moteur | `docs/MOTEUR-ANALYTICS.md` | écrite, **7 décisions en attente** (§9) |
| Contrat d'API | `docs/API-CONTRACT.md` | Vague 0 fait, Vague 1 proposé |
| Structure npm workspaces | racine, `shared/`, `server/`, `web/`, `admin/` | en place |
| Schéma de base | `db/migrations/0001_init.sql`, `0002_referentiels.sql` | **appliqué sur Supabase** et vérifié |
| Lanceur de migrations | `server/src/scripts/migrate.ts` | **exécuté**, 2 migrations appliquées |
| TLS vers Supabase | `db/supabase-root-2021-ca.crt`, `server/src/db/certificat.ts` | certificat racine épinglé, vérification stricte |
| Socle HTTP + `/api/health` | `server/src/` | écrit, testé, exécuté |
| Arithmétique monétaire | `server/src/domaine/montant.ts` | écrite et testée |
| Écrans Vague 0 | `web/`, `admin/` | minimaux, prouvent la chaîne complète |

## Vérifications passées en fin de Vague 0

| Quoi | Résultat |
|---|---|
| `npm run typecheck` | 4 workspaces, 0 erreur |
| `npm test` | **38 tests**, 0 échec |
| `npm run build` | shared + server + les 2 bundles Vite |
| Serveur réel, base volontairement morte | `/api/health` → **503 `degrade`** ; `/api/inconnue` → 404 JSON ; `/` et `/admin/` servent leurs bundles ; `/assets/absent.js` → 404 franc et non `index.html` ; en-têtes de sécurité posés |
| Migrations sur un Postgres jetable (PGlite 18.3) | **25 vérifications OK, 0 échec** |
| **Migrations sur la vraie base Supabase** (PostgreSQL 17.6, script jetable) | **32 vérifications OK, 0 échec** — TLS 1.3 authentifié, 15 tables, toutes les colonnes `_mineur` en `bigint`, aucune colonne flottante ni `timestamp` sans fuseau, index KPI choisis par le planificateur, isolation inter-entreprises refusée par la base, **cas E du §8 exact au centime**, `bigint` lu en `bigint` côté Node |
| Serveur complet contre la vraie base | `/api/health` → **200 `ok`**, latence base ~75 ms en régime établi |

Toute écriture du script de vérification s'est faite dans une **transaction
annulée** : les tables métier de Supabase sont restées à 0 ligne, vérifié après
coup. Le script a été supprimé après affichage (`AGENTS.md` §4).

### Note TLS

Le pooler Supabase présente une chaîne signée par « Supabase Root 2021 CA », une
autorité **privée** absente du magasin de Node : une vérification stricte échoue
avec `SELF_SIGNED_CERT_IN_CHAIN`. Le certificat racine — **public** — est
versionné dans `db/supabase-root-2021-ca.crt` et référencé par `DATABASE_CA_CERT`.
On garde donc `DATABASE_SSL=require`, jamais `no-verify`.

Empreinte SHA-256 du certificat épinglé :
`80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`

Il a été capté depuis la chaîne présentée par le serveur. Pour lever tout doute,
le télécharger depuis *Project Settings → Database → SSL Configuration* et
comparer l'empreinte.

---

## Ce qui reste ouvert

### 1. Décisions métier en attente

Détail et impact dans `docs/MOTEUR-ANALYTICS.md` §9. Les trois qui coûtent cher
si on les découvre tard :

- **TVA : HT ou TTC ?** — hypothèse actuelle : tout TTC, pas de TVA.
  À trancher **avant la Vague 2**, ça change le schéma.
- **Encaissé ou facturé ?** — hypothèse actuelle : trésorerie, pas d'impayés.
- **Contenu des questions intelligentes** — la mécanique est spécifiée, le
  contenu métier est vide. C'est le cœur de valeur du produit.

### 2. Cas de référence chiffrés

Huit cas synthétiques sont déjà en test (`server/src/domaine/montant.test.ts`).
Il manque **3 à 5 cas issus du métier réel** — voir le formulaire en fin de
`docs/MOTEUR-ANALYTICS.md` §8.

---

## Vague 1 — authentification *(livrée et vérifiée)*

Contrat : `docs/API-CONTRACT.md` §2. **Inscription ouverte**, décidée le 27 août 2026.

| Livrable | Où |
|---|---|
| Hachage des mots de passe (scrypt, `node:crypto`) | `server/src/modules/auth/motDePasse.ts` |
| Jetons de session (256 bits, SHA-256 en base) | `server/src/modules/auth/jetons.ts` |
| Cookie `HttpOnly` / `SameSite=Lax` | `server/src/http/cookies.ts` |
| Limitation de débit (fenêtre glissante) | `server/src/http/limiteur.ts` |
| Accès aux données | `server/src/modules/auth/depot.ts` |
| Logique métier | `server/src/modules/auth/service.ts` |
| Routes | `server/src/modules/auth/routes.ts` |
| `exigerSession` / `exigerRole` | `server/src/http/session.ts` |
| Écrans connexion / inscription / accueil | `web/src/pages/**`, `web/src/lib/**` |

Routes livrées : `POST /api/inscription`, `POST /api/connexion`,
`POST /api/deconnexion`, `GET /api/moi`.

**Aucune migration n'a été nécessaire** : `utilisateurs`, `sessions`, `compteurs`
et `categories_depense` existaient déjà depuis la Vague 0.

### Vérifié

| Quoi | Résultat |
|---|---|
| `npm run typecheck` | 4 workspaces, 0 erreur |
| `npm test` | **89 tests**, 0 échec (38 en Vague 0, 51 ajoutés) |
| `npm run build` | shared + server + les 2 bundles |
| Binaire construit, base injoignable | `/api/moi` → 401 sans toucher la base ; cookie forgé → 401 ; `/api/deconnexion` → 204 ; corps invalide → 400 **avant** tout accès base |
| **Parcours complet sur le serveur réel + Supabase réel** (script jetable) | **50 vérifications, 0 échec** |

Détail de ce que le parcours réel a prouvé :

- l'inscription crée bien, **en une seule transaction**, l'entreprise, le
  propriétaire, le compteur de ventes à 0 et les catégories de dépense
  **filtrées par secteur** — 18 pour un commerce de détail, 19 pour la
  restauration, « matières premières » absente du premier ;
- la base ne contient **aucun mot de passe en clair** : empreinte
  `scrypt$32768$8$1$…`, et `sessions.token_hash` fait exactement 32 octets ;
- e-mail inconnu et mot de passe faux rendent des réponses **strictement
  identiques**, avec un écart de temps de 1 % (187 ms contre 189 ms) : pas
  d'oracle d'énumération, ni par le message ni par le chronomètre ;
- une suspension coupe une session **déjà ouverte** à la requête suivante ;
- la déconnexion **révoque en base** — rejouer le cookie ne donne plus rien.

Toutes les écritures de test ont été supprimées et l'absence de résidu vérifiée
table par table : les 8 tables métier sont revenues à 0 ligne.

### Défaut trouvé pendant cette vérification, et corrigé

La limite de connexion par IP valait 10 / 15 min, comme celle par e-mail. Or un
commerce ou un bureau partage **une seule IP publique** : dix mots de passe
ratés cumulés par l'équipe auraient verrouillé tout le monde, y compris ceux qui
tapent le bon mot de passe, puisque la limitation s'applique avant
l'authentification. La limite par IP est passée à **30 / 15 min** ; celle par
e-mail, qui protège un compte précis, reste à 10. Deux tests couvrent désormais
les deux cas.

### Décisions de sécurité, et pourquoi

- **scrypt plutôt qu'argon2 / bcrypt** : pas de dépendance native, donc pas de
  compilation qui casse sous Windows. Paramètres OWASP (N=2¹⁵, r=8, p=1),
  stockés **avec** l'empreinte pour pouvoir les durcir sans invalider l'existant.
- **Réponse identique** pour « e-mail inconnu » et « mot de passe faux », **et
  même temps de réponse** : on hache un mot de passe factice quand le compte
  n'existe pas. Sans cela, l'écart de durée (~100 ms) permet d'énumérer les
  clients.
- **Le statut du compte n'est lu qu'après le mot de passe** : annoncer
  « suspendu » avant rétablirait l'oracle qu'on vient de fermer.
- **Deux compteurs de limitation** : par IP (balayage depuis une machine) et par
  e-mail (un compte visé depuis plusieurs machines). L'un sans l'autre laisse
  une porte ouverte.
- **La déconnexion révoque en base**, elle ne se contente pas d'effacer le
  cookie — sinon le jeton reste valide dans la nature.
- **Suspension immédiate** : un compte suspendu perd l'accès à la requête
  suivante, sans attendre l'expiration du cookie.

### Limite assumée

La limitation de débit vit **en mémoire du processus**. Avec deux instances,
chacune accorde le quota complet. Acceptable en MVP mono-instance ; à remplacer
par un magasin partagé au premier passage à l'échelle.

### Hors périmètre, à ne pas oublier

**Mot de passe oublié** : demande un service d'e-mail, aucun n'est choisi. En
attendant, la réinitialisation est manuelle depuis `/admin`. **À traiter avant
toute mise en ligne réelle** — l'écran de connexion le dit explicitement à
l'utilisateur plutôt que d'afficher un lien mort.

---

## Vague 2 — ventes et dépenses *(livrée et vérifiée)*

Contrat : `docs/API-CONTRACT.md` §3.

| Livrable | Où |
|---|---|
| Temps et fuseaux (jour local ↔ instant UTC) | `server/src/domaine/temps.ts` |
| Arithmétique des lignes de vente | `server/src/domaine/montant.ts` |
| Accès aux données | `server/src/modules/operations/depot.ts` |
| Logique métier | `server/src/modules/operations/service.ts` |
| Routes | `server/src/modules/operations/routes.ts` |
| Saisie et listes | `web/src/pages/SectionVentes.tsx`, `SectionDepenses.tsx` |

Routes : `GET/POST /api/ventes`, `GET/PATCH/DELETE /api/ventes/:id`, les mêmes
pour `/api/depenses`, et `GET /api/categories-depense`.
**Aucune migration** : le schéma de la Vague 0 suffisait.

### Les deux décisions structurantes

**Les montants transitent en entiers d'unité mineure**, jamais en décimal. La
conversion « ce que l'utilisateur tape » → centimes est un travail de
présentation, fait par `analyserMontantSaisi` (partagé, testé), qui accepte
`3 450,50`, `3450.50` et `3450` — **sans jamais multiplier un flottant** : les
chiffres sont assemblés en chaîne puis convertis une fois.

**La date se donne en date locale.** `2026-05-15` pour une entreprise à Paris
devient `2026-05-14T22:00:00Z`. Toute réponse porte les **deux** formes —
`effectuee_le` (l'instant stocké) et `date_locale` (ce que l'utilisateur doit
voir) — pour que le client n'ait aucun calcul de fuseau à faire, et ne puisse
donc pas se tromper de jour sur une vente de fin de soirée.

### Vérifié

| Quoi | Résultat |
|---|---|
| `npm run typecheck` | 4 workspaces, 0 erreur |
| `npm test` | **149 tests**, 0 échec (89 auparavant, 60 ajoutés) |
| Fuseaux horaires | 22 tests dédiés, dont les journées de **23 h et 25 h** aux changements d'heure |
| **Parcours complet sur Supabase réel** (script jetable) | **51 vérifications, 0 échec** |

Ce que le parcours réel a prouvé :

- `0,5 × 5,01 € = 2,51 €` — l'arrondi commercial, pas l'arrondi bancaire ;
- `1,234 × 9,99 € = 12,33 €` — quantité à 3 décimales, exacte ;
- le total envoyé par le client est **ignoré** quand des lignes sont fournies ;
- une vente à `22:30 UTC` le 31 mai s'affiche au **1er juin** pour une
  entreprise à Paris, et au **31 mai** pour une entreprise à Abidjan ;
- « du 1er au 31 mai » comprend bien le 31 ;
- une entreprise reçoit **404** sur la vente d'une autre — en lecture, en
  modification comme en suppression — et la vente visée reste intacte ;
- une vente supprimée reste en base avec `supprime_le`, disparaît des listes,
  et **sort du total que verra le moteur de KPI** ;
- le planificateur utilise bien `ventes_kpi_idx`.

Écritures de test supprimées, 8 tables métier revérifiées à 0 ligne.

### Défaut trouvé pendant les tests, et corrigé

`exigerSession` était monté via `routeur.use(...)`, donc sur **tout** `/api/*` :
une route inconnue répondait `401` au lieu du `404 ROUTE_INTROUVABLE` promis par
le contrat §0. Le middleware est désormais posé route par route.

### Hors périmètre, à traiter avant la Vague 3

**Les clients n'existent pas** : `ventes.client_id` reste `null`. Le KPI
`top_clients` de `MOTEUR-ANALYTICS.md` §5.3 sera donc vide — il faut soit livrer
les clients avant la Vague 3, soit le retirer du tableau de bord.

L'import de fichier (CSV, relevé bancaire) et les pièces jointes restent hors
MVP.

---

## Vague 3 — moteur de KPI et tableau de bord *(livrée et vérifiée)*

Contrat : `docs/API-CONTRACT.md` §4. Formules : `docs/MOTEUR-ANALYTICS.md` §5.

| Livrable | Où |
|---|---|
| Périodes, comparaison, jours locaux | `server/src/domaine/periodes.ts` |
| **Moteur de calcul, fonction pure** | `server/src/domaine/kpi.ts` |
| Lecture des données | `server/src/modules/kpi/depot.ts` |
| Route | `server/src/modules/kpi/routes.ts` |
| Écran | `web/src/pages/TableauDeBord.tsx`, `web/src/composants/Tuile.tsx`, `Graphiques.tsx` |

**Une seule route** : `GET /api/tableau-de-bord`. Découper en cinq aurait produit
cinq instantanés différents de la base — le total d'une répartition pouvant ne
plus correspondre à l'indicateur affiché juste au-dessus.

**Aucune migration** : le schéma de la Vague 0 suffisait, index `ventes_kpi_idx`
compris.

### Le moteur est une fonction pure

`calculerKpi` ne lit ni l'horloge, ni la base, ni l'environnement : on lui
injecte tout, y compris l'instant courant. C'est exactement ce qui rend les cas
de référence du §8 exécutables sans Postgres — ils sont dans
`server/src/domaine/kpi.test.ts`, un `describe` par cas.

Le **filtrage** reste en SQL (l'index partiel correspond mot pour mot au
prédicat du §4), le **calcul** est en TypeScript. Seul `top_produits` est agrégé
en base : remonter toutes les lignes de vente d'une année pour les sommer en
mémoire serait absurde.

### Vérifié

| Quoi | Résultat |
|---|---|
| `npm run typecheck` | 4 workspaces, 0 erreur |
| `npm test` | **216 tests**, 0 échec (149 auparavant, 67 ajoutés) |
| Périodes | 21 tests, dont les mois de 23 h / 25 h et le mois de février |
| Moteur | 28 tests — **les 8 cas de référence du §8** |
| **Parcours complet sur Supabase réel** | **48 vérifications, 0 échec** |

Le parcours réel a **saisi le cas A par l'API** puis relu le tableau de bord :
CA 345 000, dépenses 89 000, bénéfice 256 000, panier moyen 28 750, marge 742.
Au centime, sur la vraie base.

Il a aussi prouvé :

- **brouillons, annulées et supprimées n'entrent dans aucun indicateur** ;
- une vente à 22 h 30 le 31 mai compte pour **juin**, pas pour mai ;
- la série journalière **somme exactement** au chiffre d'affaires affiché ;
- les répartitions font **exactement 100,0 %** ;
- `top_produits` cumule bien les quantités d'un même article sur plusieurs
  ventes ;
- une entreprise voit un tableau **vide** des données d'une autre, et aucun
  paramètre d'URL ne permet de viser une autre entreprise.

### Défaut trouvé pendant les tests, et corrigé

`reference=2026-02-31` — une date qui n'existe pas — était refusée pour
`periode=jour` mais **acceptée** pour `periode=mois`, où seuls l'année et le mois
sont lus. Le même paramètre fautif se comportait différemment selon la
granularité. La date de référence est désormais validée en amont, toujours.

### Trois choix d'affichage qui comptent

- **`null` n'est pas `0`.** Un panier moyen sans vente affiche `—`. Afficher
  « 0 € » ferait croire à des ventes à zéro euro.
- **Une base de comparaison nulle affiche « nouveau »**, jamais « +100 % ».
- **La comparaison tronquée est annoncée** par une étiquette « à date » : sans
  elle, l'utilisateur croirait comparer à un mois entier.

### Hors périmètre, décidé

**`top_clients` retiré du tableau de bord.** Les clients n'existent pas encore
(Vague 2 §3.10) : cet indicateur serait structurellement vide. Une case toujours
à zéro n'est pas un indicateur, c'est une promesse non tenue. Il reviendra avec
les clients.

Export PDF/tableur, comparaison à l'année précédente, objectifs et prévisions :
après le MVP, ou en Vague 4 pour les derniers.

---

## Cas de référence métier — reçu le 27 août 2026

La spécification métier a été fournie, avec un cas de référence chiffré
« Boutique Test ». **Recalculé indépendamment : 26 valeurs sur 26 confirmées.**
Encodé dans `server/src/domaine/casReference.test.ts` — 20 assertions, toutes
au vert sur ce que le modèle de données actuel permet.

Deux règles de cette spécification contredisaient le code et ont été
**appliquées** : l'évolution du bénéfice s'exprime en montant quand le signe est
traversé, et l'évolution du panier moyen ne passe plus par un arrondi
intermédiaire.

**Cinq contradictions restent ouvertes, et huit questions sur quatorze sont
bloquées faute de données** (catalogue de produits avec coût, clients rattachés
aux ventes) — tout est détaillé dans `docs/ECARTS-SPEC.md`.

---

## Vague 4a — catalogue de produits et clients *(livrée et vérifiée)*

Contrat : `docs/API-CONTRACT.md` §5. Objet : donner au moteur de questions les
données qui lui manquaient — **8 des 14 questions n'avaient rien à lire**.

| Livrable | Où |
|---|---|
| Table `produits` (prix, **coût**, catégorie) | `db/migrations/0003_catalogue.sql` |
| `lignes_vente.produit_id` (facultatif) | idem |
| Accès aux données | `server/src/modules/catalogue/depot.ts` |
| Routes produits et clients | `server/src/modules/catalogue/routes.ts` |
| Marge produit | `shared/src/catalogue.ts` (`margePourcent`) |
| Écrans catalogue et clients | `web/src/pages/SectionCatalogue.tsx` |
| Sélecteurs dans la saisie de vente | `web/src/pages/SectionVentes.tsx` |

Routes : `GET/POST /api/produits`, `GET/PATCH/DELETE /api/produits/:id`, les
mêmes pour `/api/clients`. Les ventes acceptent désormais `client_id` et un
`produit_id` par ligne.

### Trois décisions de conception

**Le libellé d'une ligne est une photographie, pas un lien.** Le nom et le prix
sont **recopiés** du catalogue au moment de la vente. Renommer « T-shirt » en
« T-shirt coton bio » ne réécrit pas l'historique : la vente de mars s'est faite
sur un « T-shirt ». Le `produit_id` sert aux regroupements, le `libelle` à
l'affichage — les deux sont nécessaires.

**`produit_id` reste facultatif.** Une ligne peut rester du texte libre. Ces
lignes comptent dans le chiffre d'affaires, jamais dans un classement par
produit. Rendre le catalogue obligatoire imposerait de créer une fiche avant
d'encaisser la première vente : un mur à l'entrée du produit.

**`cout_mineur` est nullable, et ce `null` est signifiant.** Un produit sans coût
est exclu de tout classement de rentabilité — ni au mieux, ni au pire. Lui
attribuer 0 ou le prix de vente inventerait une marge de 100 % ou de 0 %.
L'écran le dit explicitement à la saisie, et compte les produits concernés.

### Vérifié

| Quoi | Résultat |
|---|---|
| `npm run typecheck` | 4 workspaces, 0 erreur |
| `npm test` | **265 tests**, 0 échec (238 auparavant, 27 ajoutés) |
| Migration `0003` sur Supabase | appliquée |
| **Parcours complet sur Supabase réel** | **33 vérifications, 0 échec** |

Le parcours a rejoué **le catalogue du cas de référence métier** — 4 produits
dont le Pull sans coût, 4 clients, les 10 ventes rattachées — puis recalculé
depuis la base :

- CA 315,00 € ; quantités T-shirt 4, Casquette 5, Sac 2, Pull 2 ;
- **marge globale 138,00 €, Pull exclu** ;
- CA par catégorie : Vêtements 170,00 €, Accessoires 145,00 € ;
- **meilleur client Awa Diop, 165,00 €** ; les 2 ventes anonymes comptent dans
  le CA (35,00 €) mais **ne polluent pas le classement clients** ;
- renommer un produit **ne touche pas** l'historique des ventes ;
- la **base elle-même** refuse une ligne pointant vers le produit d'une autre
  entreprise (clé étrangère composite), pas seulement l'API.

### Ce que cela débloque

Les 5 questions restées sans réponse ont maintenant leurs données : produit le
plus rentable, CA par catégorie, meilleurs clients, nombre de clients, clients
inactifs. **Les indicateurs eux-mêmes restent à écrire — c'est la Vague 4b.**

---

## Vague 4b — moteur de questions intelligentes *(livrée et vérifiée)*

Contrat : `docs/API-CONTRACT.md` §6. Les **14 questions** du §4 de la
spécification métier, chacune adossée à sa formule.

| Livrable | Où |
|---|---|
| **Moteur de réponses, fonction pure** | `server/src/domaine/questions.ts` |
| Agrégats SQL | `server/src/modules/questions/depot.ts` |
| Route `GET /api/questions` | `server/src/modules/questions/routes.ts` |
| Écran | `web/src/pages/SectionQuestions.tsx` |

**Aucune migration** : la Vague 4a avait posé les données manquantes.

### La règle qui gouverne tout le moteur

**Une question sans données répond « indisponible » avec sa raison, jamais
zéro.** Une entreprise qui n'a renseigné aucun coût ne lit pas « produit le plus
rentable : T-shirt, 0 % » mais *« aucun produit vendu n'a de coût de revient
renseigné »*, et sait quoi faire pour obtenir la réponse.

Chaque réponse porte aussi son **renvoi de formule** (`§3.6`, `§3.9`…) : on
remonte d'un chiffre affiché à la règle qui l'a produit, sans lire le code.

### Vérifié

| Quoi | Résultat |
|---|---|
| `npm run typecheck` | 4 workspaces, 0 erreur |
| `npm test` | **307 tests**, 0 échec (265 auparavant, 42 ajoutés) |
| **Cas de référence §7 saisi par l'API puis relu** | **36 vérifications, 0 échec** |

Les 14 réponses, sur la vraie base : CA 315,00 € (+12,5 %), bénéfice −60,00 €
avec un **écart de −80,00 € et aucun pourcentage** (signe traversé), panier
31,50 € (+1,3 %), Loyer 53,3 %, Casquette la plus vendue (5), Pull le plus de CA
(90 €), **Casquette la plus rentable à 66,7 % avec le Pull exclu**, marge globale
138,00 €, **Pull ET Sac ex æquo** aux moins vendus, Vêtements 170 € (54,0 %),
Awa Diop 165 € en tête sans qu'aucun « anonyme » n'apparaisse, 4 clients dont
1 nouveau, et Ibrahima Ba inactif.

### Deux défauts trouvés pendant les tests

**`sum()` sur un `bigint` rend un `numeric` en Postgres**, que node-postgres
livre sous forme de **chaîne**. Les comparaisons coercent en silence — le défaut
restait donc invisible jusqu'à la première soustraction, qui levait « Cannot mix
BigInt and other types ». Chaque `sum()` est désormais recastée en `::bigint`,
dans le moteur de questions **et** dans celui du tableau de bord, où le même
piège dormait.

**Le vocabulaire sectoriel cassait les accords.** « Quel {nom} est le plus
rentable ? » donnait « Quel prestation est le plus rentable ? ». Les libellés
sont maintenant écrits **en entier** par secteur, ce qui supprime la classe
entière de fautes.

### Ce qui reste ouvert

Les seuils du §8 de la spécification : inactivité à **60 jours** (à confirmer,
à rendre paramétrable par secteur), période par défaut des meilleurs clients, et
le concept de « projet » pour le BTP — sans table `projets`, la question n'a
aucune donnée à interroger.

---

## Vague 4c — couche d'explication *(livrée, sans IA)*

`CLAUDE.md` §6 et §10 qualifient deux fois la reformulation par IA
d'**optionnelle**. Elle est donc implémentée **en français déterministe côté
serveur** — `server/src/domaine/formulation.ts`. Chaque question porte désormais
un champ `phrase`, affiché avant les chiffres.

### Pourquoi sans IA

| | Couche déterministe | Appel Gemini |
|---|---|---|
| « Aucun chiffre inventé » | **vrai par construction** | vérifié après coup, donc faillible en production |
| Clé d'API | aucune | à obtenir, stocker, faire tourner |
| Coût / latence | nuls | par requête, ×14 par écran |
| Panne du service | impossible | l'écran perd ses phrases |
| Déterminisme | garanti | non |

**Le garde-fou de `GEMINI.md` est écrit quand même** : un test extrait tous les
nombres de chaque phrase et vérifie qu'ils figurent dans le résultat calculé,
avec une contre-épreuve prouvant qu'il détecterait un chiffre inventé. Il sera
prêt tel quel le jour où une reformulation par IA s'ajoutera — `CLAUDE.md` §13
la place après le MVP, et ces phrases resteront alors le **repli** quand l'API
est indisponible.

### Vérifié

| Quoi | Résultat |
|---|---|
| `npm test` | **323 tests**, 0 échec |
| **Sur Supabase réel** | **28 vérifications, 0 échec**, dont **31 nombres contrôlés un par un** dans les phrases produites |

Exemple de ce que lit l'utilisateur, sur le cas de référence :

> *Vous êtes en déficit sur cette période : −60,00 €, en baisse de 80,00 €. Ce
> montant est votre chiffre d'affaires moins vos dépenses ; il ne tient pas
> compte du coût de revient de vos produits.*
>
> *Casquette est le plus rentable, avec 66,7 % de marge. Sur l'ensemble de la
> période, votre marge est de 138,00 €. 1 produit est exclu de ce calcul, faute
> de coût de revient renseigné.*

Et sur un compte neuf :

> *Aucune vente sur cette période : le panier moyen n'est pas calculable.*

---

---

## Vague 5 — devise choisie, Paramètres, console d'administration *(livrée et vérifiée)*

Contrat : `docs/API-CONTRACT.md` §7 (référentiels), §8 (entreprise et compte),
§9 (administration). Migration : `db/migrations/0004_pays_plan_devises.sql`,
**appliquée sur Supabase**.

| Livrable | Où |
|---|---|
| `entreprises.pays` et `entreprises.plan` (`CLAUDE.md` §4) | `db/migrations/0004_pays_plan_devises.sql` |
| Dix devises supplémentaires (CDF, GNF, NGN, GHS, KES, ZAR, RWF, BIF, DJF, KMF) | idem |
| Liste des pays, devise et fuseau par défaut | `shared/src/referentiels.ts` |
| `GET /api/referentiels` (publique) | `server/src/modules/referentiels/` |
| `PATCH /api/entreprise`, `PATCH /api/moi`, `POST /api/mot-de-passe` | `server/src/modules/entreprise/` |
| Console d'administration complète | `server/src/modules/admin/`, `admin/src/` |
| Création du premier administrateur | `server/src/scripts/creerAdmin.ts` — `npm run admin:creer` |
| Choix de la devise à l'inscription | `web/src/composants/ChoixDevise.tsx`, `web/src/pages/Inscription.tsx` |
| Écran Paramètres (`CLAUDE.md` §8) | `web/src/pages/SectionParametres.tsx` |
| Jeu de dépendances de test partagé | `server/src/test-utils/dependancesTest.ts` |

### Le choix de la devise

Franc CFA, euro et dollar sont trois boutons ; les vingt autres devises sont
dans une liste. Le **pays** pré-remplit devise et fuseau — une question au lieu
de trois — mais n'impose rien : une agence sénégalaise qui facture en euros
choisit l'euro, et garde l'heure de Dakar.

Le fuseau est le point qui se serait vu tard : sans lui, une vente saisie à
22 h 30 à Dakar serait comptée le lendemain, parce que le serveur aurait
supposé Paris.

### La règle qui protège les données : le verrou de devise

Un montant est stocké en **unité mineure**. Passer d'EUR à XOF ne convertit
rien : `31500` cesse de valoir 315,00 € pour valoir 31 500 FCFA. Tout
l'historique changerait de sens d'un coup.

**La devise se change donc librement tant qu'aucun montant n'est enregistré, et
plus après.** Le refus est un `409` qui dit exactement ce qui bloque :

> *La devise ne peut plus changer : 12 ventes, 5 dépenses et 4 produits sont
> enregistrés en EUR. Changer la devise réinterpréterait ces montants sans les
> convertir.*

Convertir automatiquement supposerait un taux de change. Aucun n'est
disponible, et en inventer un ferait produire à l'application un chiffre
financier faux — ce que `CLAUDE.md` §15 interdit.

### La console d'administration

Elle existe parce que trois choses n'avaient **aucune autre porte** : changer le
plan à la main (`CLAUDE.md` §7.4), suspendre ou réactiver un compte, et
réinitialiser un mot de passe — la « réinitialisation manuelle depuis /admin »
promise en Vague 1, qui n'existait pas encore.

Séparation stricte : table `admins`, table `admin_sessions`, cookie
`bizly_admin`, session de **12 heures** contre 30 jours côté client. Un jeton
client n'ouvre rien ici, un jeton admin n'ouvre rien côté client.

**Aucune route d'inscription admin.** Le premier compte se crée en ligne de
commande, sur la machine qui a déjà accès à la base :

```bash
npm run admin:creer     # nom, e-mail, mot de passe — saisi masqué, jamais en argument
```

La console **ne lit aucune donnée métier** : ni vente, ni dépense, ni client
(§9.6). Un support qui peut tout lire est une fuite qui attend son incident.

### Vérifié

| Quoi | Résultat |
|---|---|
| `npm run typecheck` | 4 workspaces, 0 erreur |
| `npm test` | **372 tests**, 0 échec (323 auparavant, 49 ajoutés) |
| `npm run build` | shared + server + les 2 bundles |
| Migration `0004` sur Supabase | appliquée |
| **Parcours complet sur Supabase réel** (script jetable) | **104 vérifications, 0 échec** |

Ce que le parcours réel a prouvé :

- un compte sénégalais naît en **XOF à 0 décimale**, à l'heure de Dakar ;
  **1500 FCFA vaut 1500 en base**, pas 150 000 ;
- une devise explicite l'emporte sur celle du pays, **le fuseau reste celui du
  pays** ;
- un pays inconnu est **refusé en 400**, jamais ignoré — l'ignorer donnerait
  silencieusement une devise que personne n'a choisie ;
- le verrou de devise refuse en 409, **rien n'est écrit**, pas même le nom
  envoyé dans la même requête, et la devise reste intacte ;
- envoyer `plan` sur `PATCH /api/entreprise` est **refusé**, pas ignoré ;
- un fuseau inconnu donne **400 avec le champ fautif**, pas un 500 remonté de
  Postgres ;
- changer son mot de passe **conserve la session courante et coupe les autres** ;
- un cookie client sur `/api/admin/*` donne 401, et réciproquement ;
- suspendre **révoque toutes les sessions du compte en base** — le cookie ne
  vaut plus rien, et la reconnexion répond `403 COMPTE_SUSPENDU` ;
- réactiver efface le motif et rouvre la connexion ;
- un administrateur **ne peut pas poser un mot de passe faible**.

Les quatre entreprises de test ont été supprimées, l'administrateur aussi, et
les dix tables revérifiées à 0 ligne. Script supprimé après affichage.

### Deux défauts trouvés pendant l'écriture

**Un `count(*)` non casté rend un `BigInt`**, à cause du parseur de types posé
en Vague 0. Le même piège qu'en Vague 4b, sous une autre forme. Tous les
décomptes du nouveau code passent par `::text` ou `Number(...)` explicite.

**Le test de balayage par IP dépassait son délai** : trente-et-une tentatives
sur des e-mails inconnus hachent chacune un mot de passe factice pour égaliser
le temps de réponse (§2). C'est la défense qui coûte, pas le test — son délai
est désormais explicite plutôt que subi.

### Ce qui reste hors périmètre

| Exclu | Pourquoi |
|---|---|
| Changer son adresse e-mail | Demande de vérifier la nouvelle adresse, donc un service d'e-mail. Hors MVP, comme « mot de passe oublié ». |
| Conversion automatique lors d'un changement de devise | Supposerait un taux de change qu'on n'a pas. |
| Supprimer une entreprise depuis la console | Irréversible et sans filet. La suspension couvre le besoin. |
| MRR, rétention, conversion Free → Pro | Demandent un historique d'événements que le MVP n'enregistre pas. Les afficher à zéro les ferait passer pour mesurés. |

## Ce qui reste, dans l'ordre

### 1. Le test réel — c'est l'étape en cours

Le MVP est complet et vérifié techniquement. Ce qu'aucun test automatisé ne
remplace : **un vrai entrepreneur qui saisit sa vraie activité** (`CLAUDE.md`
§15). C'est de là que viendront les corrections d'ergonomie, et les **cas de
référence issus du terrain** qui manquent toujours (formulaire en fin de
`MOTEUR-ANALYTICS.md` §8).

### 2. Base de test séparée de la production — `CLAUDE.md` §9

Toutes les vérifications de fin de vague ont tourné contre la base réelle.
Nettoyées et revérifiées à zéro ligne à chaque fois, mais la règle dit « base
séparée ». **À faire avant d'avoir de vraies données** : un second projet
Supabase, un `DATABASE_URL_TEST`, et des scripts qui refusent de démarrer si
l'URL pointe ailleurs. Une vingtaine de lignes, une fois le projet créé.

### 3. Vague 5 du §10 — sécurité et mise en ligne

- **RLS Postgres** (`CLAUDE.md` §9). L'isolation repose aujourd'hui sur le
  filtrage applicatif **et** des clés étrangères composites que la base fait
  respecter — c'est solide et vérifié. Mais une requête qui oublierait son
  `WHERE entreprise_id` lirait tout. RLS demande un `SET LOCAL` par transaction
  à cause du pooler en mode transaction : c'est un chantier à part entière.
- **Mot de passe oublié** : demande un service d'e-mail, aucun n'est choisi. En
  attendant, la réinitialisation se fait depuis `/admin/`, et l'écran de
  connexion le dit plutôt que d'afficher un lien mort.
- Hébergement, variables d'environnement de production, `JWT_SECRET` généré par
  l'hébergeur (`CLAUDE.md` §11).

### 4. Décisions métier encore ouvertes

Détaillées dans `docs/ECARTS-SPEC.md` : seuil d'inactivité client (60 jours, à
confirmer), période par défaut des meilleurs clients, concept de « projet » pour
le BTP (aucune table `projets`), panier moyen à `0` ou à `null` quand il n'y a
aucune vente — le code applique `null`, `CLAUDE.md` §5 dit `0`.

---

## Comment relancer le projet

```bash
npm install
cp .env.example .env          # puis remplir DATABASE_URL (pooler, port 6543)
npm run migrate:statut        # doit afficher 4 migrations appliquees
npm run migrate               # si l'une est en attente
npm run build
npm run admin:creer           # une seule fois : ouvre l'acces a /admin/
npm start                     # http://localhost:3000
```

En développement, trois processus (API + les deux fronts) :

```bash
npm run dev
# API    http://localhost:3000
# client http://localhost:5173   (relaie /api vers 3000)
# admin  http://localhost:5174
```

Vérifications :

```bash
npm run typecheck
npm test
```

### Note de Déploiement Vercel (29 août 2026)

- **Correction du bundle Serverless** : `vercel.json` mis à jour (`includeFiles`: `{server/**,shared/**,db/**,package.json}`) pour inclure l'espace de travail `@bizly/shared` obligatoire à l'exécution de `api/index.js`.
- **Gestion d'erreurs en environnement Vercel** : `server/src/config/env.ts` lève désormais une exception explicite au lieu de `process.exit(1)` si des variables manquent sur Vercel, afin de fournir un log détaillé dans le dashboard Vercel.
- **Variables d'environnement requises sur Vercel** : configurer `DATABASE_URL` (chaîne de connexion Supabase pooler port 6543) et `DATABASE_SSL=require` dans **Project Settings > Environment Variables** sur Vercel.

### Refonte Visuelle & Charte de Design Impeccable (29 août 2026)

- **Documentation du Design System** : Création de `PRODUCT.md` (vision produit, 7 surfaces) et `DESIGN.md` (système visuel inspiré de la maquette de référence : cartes modulaires, pilules pastel, dégradés vibrants et typographie Outfit).
- **Embellissement du Frontend (`web/` & `admin/`)** :
  - Mise à jour des tokens CSS (`web/src/index.css` & `admin/src/index.css`) pour une expérience utilisateur haut de gamme et responsive.
  - Integration des images du dossier `Photos/` (`web/public/photos/`) dans les widgets d'accueil, bannières et avatars d'équipe.
  - Détection mécanique Impeccable sans aucun anti-pattern (`node detect.mjs` = `[]`).
- **Validation** : `npm run typecheck` propre, 372/372 tests vitest validés et bundles `npm run build` construits sans erreur.

### Intégration des Composants UI Interactifs (29 août 2026)

- **Composants ajoutés dans `web/src/components/ui/`** :
  - [`handwriting-svg.tsx`](file:///c:/Users/USER/Desktop/Bizly/web/src/components/ui/handwriting-svg.tsx) : Écriture manuscrite vectorielle animée avec `framer-motion` & `opentype.js`.
  - [`water-ripple-image.tsx`](file:///c:/Users/USER/Desktop/Bizly/web/src/components/ui/water-ripple-image.tsx) : Effet d'ondulation d'eau interactif sur canvas WebGL.
  - [`oceanic-currents.tsx`](file:///c:/Users/USER/Desktop/Bizly/web/src/components/ui/oceanic-currents.tsx) : Shader de fond animé avec distorsion FBM et OKLab.
- **Support shadcn/ui & Helper `cn`** : [`web/src/lib/utils.ts`](file:///c:/Users/USER/Desktop/Bizly/web/src/lib/utils.ts) configuré avec `clsx` & `tailwind-merge`.
- **Renommage du Titre et de l'Onglet en "Dashboard" & Push GitHub** :
  - **Titre & Onglet « Dashboard »** ([`TableauDeBord.tsx`](file:///c:/Users/USER/Desktop/Bizly/web/src/pages/TableauDeBord.tsx), [`Accueil.tsx`](file:///c:/Users/USER/Desktop/Bizly/web/src/pages/Accueil.tsx)) : Modification du libellé pour afficher uniquement **Dashboard** (au lieu de Tableau de bord), garantissant un rendu moderne, sobre et sans aucune tronquage.
  - **Publication Git / GitHub** : Modifications validées et envoyées sur `origin/main` (`https://github.com/aasing1618-web/bizly.git`). Vercel déploie automatiquement la version finale.
- **Module de Paiement & Abonnement Mobile Money (Wave & Orange Money)** (29 août 2026) :
  - **Migration `0006_abonnements_paiements.sql`** : Table `abonnements` et colonne `entreprises.date_expiration_plan` ajoutées.
  - **Module backend `/api/paiement/`** : Initialisation des abonnements Starter Pro (2 500 FCFA/mois ou 25 000 FCFA/an) et Business (5 000 FCFA/mois ou 50 000 FCFA/an), Webhook de confirmation et simulation instantanée.
  - **Interface utilisateur dans `SectionParametres.tsx`** : Choix du cycle (mensuel/annuel), sélection du plan (Pro/Business), choix du moyen de paiement (🌊 Wave / 🟠 Orange Money) et simulation de paiement en 1 clic.
  - **Validation** : `npm run typecheck` à 0 erreur sur les 4 workspaces, 377/377 tests Vitest validés, `npm run build` OK.


