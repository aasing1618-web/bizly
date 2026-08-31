# Contrat d'API Bizly

> Règle du projet : **le contrat d'une vague s'écrit avant sa première ligne de code**,
> et avant de lancer le moindre agent. Ce fichier est le contrat courant.
> Toute route implémentée qui n'est pas ici est un écart à corriger.

---

## §0. Conventions communes

### Préfixe et format

- Toutes les routes API sont sous **`/api/`**. Rien d'autre ne répond en JSON.
- `Content-Type: application/json; charset=utf-8` en entrée comme en sortie.
- Une route `/api/*` inconnue renvoie **404 JSON**, jamais l'`index.html` du SPA.

### Réponse en succès

Le corps est directement la ressource ou la collection demandée. Pas d'enveloppe
`{ data: … }` : elle n'apporte rien quand la forme d'erreur est déjà distincte.

```json
{ "id": "…", "nom": "…" }
```

Collection paginée :

```json
{ "elements": [ … ], "total": 128, "limite": 50, "decalage": 0 }
```

### Réponse en erreur

**Toujours** cette forme, pour tous les codes ≥ 400 :

```json
{
  "erreur": {
    "code": "VALIDATION",
    "message": "Le champ « email » est invalide.",
    "details": { "champ": "email" }
  }
}
```

| Champ | Type | Rôle |
|---|---|---|
| `code` | `SCREAMING_SNAKE_CASE` | stable, destiné au code client — **ne change jamais** |
| `message` | `string` | français, destiné à l'humain — peut évoluer |
| `details` | `object` optionnel | contexte machine (champ fautif…), jamais de stack |

Aucune stack, aucun message Postgres, aucun nom de table ne sort vers le client.

### Codes d'erreur du socle

| `code` | HTTP | Quand |
|---|---|---|
| `VALIDATION` | 400 | corps ou paramètre malformé |
| `JSON_INVALIDE` | 400 | corps non parsable |
| `NON_AUTHENTIFIE` | 401 | pas de session valide |
| `DROIT_INSUFFISANT` | 403 | session valide, rôle insuffisant **dans sa propre entreprise** |
| `COMPTE_SUSPENDU` | 403 | entreprise ou utilisateur `SUSPENDU` |
| `RESSOURCE_INTROUVABLE` | 404 | inexistante **ou appartenant à une autre entreprise** |
| `ROUTE_INTROUVABLE` | 404 | route `/api/*` inconnue |
| `CONFLIT` | 409 | unicité violée (email déjà pris…) |
| `TROP_DE_REQUETES` | 429 | rate limit |
| `ERREUR_INTERNE` | 500 | bug — corps générique, détail seulement dans les logs |

**Règle d'isolation :** on ne renvoie jamais `403` pour une ressource d'un autre tenant.
`403` révélerait son existence. C'est `404`, indistinguable d'un identifiant inventé.

### En-têtes

- Chaque réponse porte `X-Request-Id` (UUID), repris dans les logs. C'est ce qu'on
  demande à l'utilisateur quand il signale un bug.
- Sécurité : `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`, CSP sur les routes HTML.

---

## §1. Vague 0 — socle *(implémenté)*

### `GET /api/health`

Sonde de santé. **Publique, non authentifiée.** Destinée à l'hébergeur et au monitoring.

Réponse **200** — tout va bien :

```json
{
  "statut": "ok",
  "version": "0.1.0",
  "horodatage": "2026-08-26T20:14:03.412Z",
  "uptime_s": 137,
  "base": { "statut": "ok", "latence_ms": 23 }
}
```

Réponse **503** — la base ne répond pas :

```json
{
  "statut": "degrade",
  "version": "0.1.0",
  "horodatage": "2026-08-26T20:14:03.412Z",
  "uptime_s": 137,
  "base": { "statut": "erreur", "latence_ms": null }
}
```

Décisions :

- **503 et pas 200** quand la base est morte : sinon l'hébergeur croit le service sain
  et route du trafic vers un processus incapable de servir une seule page utile.
- La sonde **n'expose ni l'hôte, ni le nom de la base, ni le message d'erreur Postgres** :
  c'est une route publique. Le détail part dans les logs serveur.
- La sonde exécute un `SELECT 1` avec un **timeout court (2 s)**. Une sonde qui pend
  aussi longtemps que le pool est pire qu'une sonde en erreur.
- Elle ne renvoie **pas** la forme d'erreur standard `{ erreur: … }` : c'est un rapport
  d'état, pas un échec de requête. Le monitoring lit `statut` et le code HTTP.

### `GET /api/*` (inconnue)

**404** avec `{ "erreur": { "code": "ROUTE_INTROUVABLE", … } }`.

### Routes non-API

| Chemin | Sert |
|---|---|
| `/admin`, `/admin/*` | bundle admin (`server/public/admin`) |
| `/`, tout le reste | bundle client (`server/public/app`) |

Fallback SPA sur `index.html` pour les chemins sans extension. Un fichier statique
absent (`/app.js` manquant) renvoie un vrai 404, pas l'`index.html` — sinon le
navigateur reçoit du HTML là où il attend du JavaScript et l'erreur devient illisible.

---

## §2. Vague 1 — authentification *(contrat arrêté)*

Décidé : **inscription ouverte**. N'importe qui crée un compte, l'entreprise est
`ACTIF` immédiatement. La suspension reste **manuelle depuis `/admin`**, a
posteriori — conforme au « comptes changés à la main, aucun paiement en ligne »
de CLAUDE.md §2. Un mur d'invitation avant même d'avoir un utilisateur ne
protège de rien et empêche de tester le produit.

### Modèle de session

| Point | Valeur | Raison |
|---|---|---|
| Transport | cookie `bizly_session` | `HttpOnly` : un XSS ne peut pas lire le jeton, contrairement à `localStorage`. |
| Attributs | `HttpOnly; SameSite=Lax; Path=/` + `Secure` hors développement | `Lax` laisse passer la navigation entrante tout en bloquant les POST inter-sites. |
| Jeton | 256 bits aléatoires, encodés base64url | |
| Stockage | **SHA-256 seul** en base | Une fuite de la table `sessions` ne permet d'usurper aucune session. |
| Durée | 30 jours, **glissante** | Prolongée à chaque requête authentifiée si plus de 24 h se sont écoulées — pas à chaque appel, pour ne pas écrire en base à chaque requête. |
| Révocation | `revoquee_le` renseigné | La déconnexion révoque, elle ne supprime pas : on garde la trace. |

### `POST /api/inscription`

Crée l'entreprise **et** son premier utilisateur (`PROPRIETAIRE`) dans **une
seule transaction**, avec ses catégories de dépense et son compteur de ventes.

```json
{
  "entreprise": { "nom": "Boulangerie Martin", "secteur": "commerce_detail" },
  "utilisateur": { "nom": "Awa Martin", "email": "awa@exemple.fr", "mot_de_passe": "…" }
}
```

Champs optionnels sur `entreprise` : `devise` (défaut `EUR`), `fuseau` (défaut
`Europe/Paris`).

| Code | Cas |
|---|---|
| **201** | `{ "utilisateur": {…}, "entreprise": {…} }` + cookie posé |
| **400** `VALIDATION` | e-mail invalide, mot de passe < 10 caractères, secteur ou devise inconnus, nom vide |
| **409** `CONFLIT` | e-mail déjà utilisé |
| **429** `TROP_DE_REQUETES` | 5 inscriptions / heure / IP |

Règles de mot de passe : **10 caractères minimum**, 200 maximum, et refus de la
liste des mots de passe les plus courants. Pas d'exigence de majuscule ni de
caractère spécial : ces règles poussent à `Motdepasse1!` et n'apportent rien
face à une longueur suffisante.

Ce que fait la transaction, dans l'ordre :

1. `entreprises` — statut `ACTIF` ;
2. `utilisateurs` — rôle `PROPRIETAIRE`, `mot_de_passe_hash` scrypt ;
3. `compteurs` — ligne `('vente', 0)` ;
4. `categories_depense` — copie des `modeles_categorie_depense` applicables au
   secteur (`secteurs = '{}'` ou contenant le secteur choisi) ;
5. `sessions` — la session, et le cookie part avec la réponse.

Tout échoue ensemble ou rien ne passe : une entreprise sans catégories ni
compteur serait cassée dès la première dépense.

### `POST /api/connexion`

```json
{ "email": "awa@exemple.fr", "mot_de_passe": "…" }
```

| Code | Cas |
|---|---|
| **200** | `{ "utilisateur": {…}, "entreprise": {…} }` + cookie |
| **401** `IDENTIFIANTS_INVALIDES` | e-mail inconnu **ou** mot de passe faux |
| **403** `COMPTE_SUSPENDU` | identifiants bons, entreprise ou utilisateur suspendu |
| **429** `TROP_DE_REQUETES` | **10 tentatives / 15 min par e-mail**, **30 / 15 min par IP** |

Deux exigences non négociables :

1. **Message identique** que l'e-mail soit inconnu ou le mot de passe faux.
   Distinguer les deux transforme l'API en oracle : on énumère les clients.
2. **Temps de réponse identique** dans les deux cas. Quand l'e-mail est inconnu,
   on vérifie quand même un hachage factice. Sans cela, la différence de durée
   (scrypt coûte ~100 ms) redonne l'oracle qu'on vient de fermer.

`COMPTE_SUSPENDU` est en revanche explicite : l'utilisateur a prouvé qui il est,
lui cacher la raison ne ferait que générer un ticket de support.

### `POST /api/deconnexion`

**204** toujours, même sans session valide — l'opération est idempotente.
Révoque la session en base **et** efface le cookie. Effacer seulement le cookie
laisserait un jeton valide dans la nature.

### `GET /api/moi`

Ce qu'appelle le SPA au démarrage pour savoir s'il affiche l'application ou
l'écran de connexion.

| Code | Cas |
|---|---|
| **200** | `{ "utilisateur": {…}, "entreprise": {…} }` |
| **401** `NON_AUTHENTIFIE` | pas de session — cas normal, pas une erreur à journaliser |

### Formes renvoyées

```jsonc
// utilisateur
{ "id": "uuid", "nom": "Awa Martin", "email": "awa@exemple.fr", "role": "PROPRIETAIRE" }

// entreprise
{
  "id": "uuid", "nom": "Boulangerie Martin", "secteur": "commerce_detail",
  "devise": { "code": "EUR", "decimales": 2 },
  "fuseau": "Europe/Paris", "statut": "ACTIF"
}
```

Le hachage du mot de passe ne sort **jamais**, sous aucune forme. L'entreprise
porte sa devise **résolue** (code + décimales) : le client n'a pas à connaître la
table `devises` pour formater un montant.

### Nouveau code d'erreur

| `code` | HTTP | Quand |
|---|---|---|
| `IDENTIFIANTS_INVALIDES` | 401 | e-mail ou mot de passe faux, sans distinction |

### Middlewares introduits

- `exigerSession` — résout le cookie, charge utilisateur + entreprise, refuse
  `401` sans session et `403 COMPTE_SUSPENDU` si l'un des deux est suspendu.
  Il pose `requete.contexte = { utilisateur, entreprise }` : **toute** requête
  métier des vagues suivantes lira `entreprise.id` là, jamais dans le corps ou
  l'URL. C'est ce qui rend l'isolation structurelle plutôt que déclarative.
- `exigerRole('PROPRIETAIRE')` — à composer après `exigerSession`.

### Limitation de débit

En mémoire du processus, fenêtre glissante.

**Les deux seuils de connexion sont volontairement différents**, parce que les
deux compteurs ne font pas le même travail :

| Compteur | Seuil | Rôle |
|---|---|---|
| **par e-mail** | 10 / 15 min | Protège **un compte** contre la force brute. Serré : un propriétaire ne se trompe pas dix fois sur son propre mot de passe. |
| **par IP** | 30 / 15 min | Ralentit le **balayage de plusieurs comptes** depuis une machine. Large : un commerce ou un bureau partage une seule IP publique. Au même seuil que l'e-mail, dix erreurs cumulées par l'équipe bloqueraient tout le monde — y compris ceux qui tapent le bon mot de passe, puisque la limitation s'applique avant l'authentification. |

Une connexion réussie remet à zéro le compteur de **l'e-mail** seulement. Remettre
aussi celui de l'IP donnerait un quota infini à qui balaye des comptes en
possédant l'un d'eux.

Assumé : une seule instance en MVP. Le jour où il y en a deux, chacune accordera
le quota complet — il faudra alors un magasin partagé. C'est écrit ici pour que
la découverte ne se fasse pas en production.

### Hors périmètre de la Vague 1

| Exclu | Pourquoi |
|---|---|
| Mot de passe oublié | Demande un service d'e-mail, **aucun n'est choisi**. En attendant, réinitialisation manuelle depuis `/admin`. À traiter avant toute mise en ligne réelle. |
| Invitation d'un collègue | Le rôle `EMPLOYE` existe en base, aucun écran ne le crée encore. |
| 2FA | Hors MVP. |
| Connexion admin `/admin` | Vague 5, tables `admins` / `admin_sessions` déjà en place. |

### Découpage du travail

Périmètres disjoints, fichiers partagés écrits en premier et par un seul auteur :

| Lot | Écrit dans |
|---|---|
| **Socle partagé** *(d'abord, seul)* | `shared/src/auth.ts` |
| **A — domaine et routes** | `server/src/modules/auth/**`, `server/src/http/session.ts`, `server/src/http/cookies.ts`, `server/src/http/limiteur.ts` |
| **B — écrans** | `web/src/pages/**`, `web/src/lib/**`, `web/src/App.tsx` |

---

## §3. Vague 2 — ventes et dépenses *(contrat arrêté)*

Toutes ces routes exigent une session (`exigerSession`). L'entreprise est **lue
dans le contexte de session**, jamais dans l'URL ni dans le corps : un client ne
peut pas désigner une autre entreprise, puisqu'il ne désigne rien.

Rappel des décisions de `docs/MOTEUR-ANALYTICS.md` §9 qui façonnent ces routes :
montants **TTC**, comptabilité de **trésorerie**, **pas d'impayés**.

### 3.1 Deux décisions de conception

#### Les montants transitent en entiers d'unité mineure

`montant_total_mineur: 345000`, jamais `"3450.50"` ni `3450.5`.

La conversion « ce que l'utilisateur tape » → « unité mineure » est un travail de
**présentation**, fait par le client avec un helper partagé et testé
(`analyserMontantSaisi`), qui accepte `3 450,50`, `3450.50` et `3450`. Le serveur
ne voit jamais de décimale : il valide un entier, positif, cohérent avec le
nombre de décimales de la devise.

L'alternative — envoyer une chaîne décimale et convertir côté serveur —
demanderait une arithmétique décimale sur chaîne, pour déplacer le risque sans le
supprimer. Un entier ne peut pas être mal arrondi.

#### La date de l'opération se donne en date locale

`effectuee_le` accepte deux formes :

| Envoyé | Interprété |
|---|---|
| `"2026-05-15"` | **00:00:00 dans le fuseau de l'entreprise**, converti en UTC |
| `"2026-05-15T14:30:00.000Z"` | tel quel, instant exact |

Un commerçant saisit une date, pas un instant. `2026-05-15` pour une entreprise
en `Europe/Paris` devient `2026-05-14T22:00:00Z` — et retombe bien dans la
journée du 15 quand le moteur de KPI découpe les périodes.

Toute réponse porte donc **les deux** : `effectuee_le` (instant UTC, ce que la
base contient) et `date_locale` (`YYYY-MM-DD`, ce que l'utilisateur doit voir).
Le client n'a aucun calcul de fuseau à faire — cohérent avec « le moteur de
calcul ne part jamais dans le navigateur ».

### 3.2 `GET /api/ventes`

| Paramètre | Défaut | Rôle |
|---|---|---|
| `limite` | 50 | 1 à 200 |
| `decalage` | 0 | pagination |
| `du`, `au` | — | dates locales `YYYY-MM-DD`, bornes **incluses toutes les deux** |
| `statut` | toutes sauf supprimées | `VALIDEE` \| `BROUILLON` \| `ANNULEE` |
| `moyen_paiement` | — | filtre exact |

`du` et `au` sont **inclusives** ici, contrairement aux périodes du moteur : un
utilisateur qui demande « du 1er au 31 mai » attend le 31 mai compris. La
conversion en `[début, fin[` se fait côté serveur — `au=2026-05-31` devient
`< 2026-06-01T00:00 locale`.

Tri : `effectuee_le` décroissant, puis `numero` décroissant. Le plus récent
d'abord, c'est ce qu'on vient vérifier après avoir saisi.

```jsonc
{
  "elements": [ /* ventes, sans leurs lignes */ ],
  "total": 128,
  "limite": 50,
  "decalage": 0
}
```

### 3.3 `POST /api/ventes` → **201**

```jsonc
{
  "effectuee_le": "2026-05-15",
  "montant_total_mineur": 345000,      // ignoré si `lignes` est fourni
  "moyen_paiement": "CARTE",           // optionnel
  "statut": "VALIDEE",                 // optionnel, défaut VALIDEE
  "note": "Commande de la mairie",     // optionnel
  "lignes": [                          // optionnel
    { "libelle": "Baguette", "quantite": "12", "prix_unitaire_mineur": 110 }
  ]
}
```

**Quand `lignes` est fourni, le total est recalculé à partir des lignes** et le
`montant_total_mineur` envoyé est ignoré. Une seule source de vérité : un total
qui contredirait son propre détail est un bug qu'on ne veut pas pouvoir créer.

Chaque ligne : `montant_mineur = arrondi(quantite × prix_unitaire_mineur)` selon
la règle d'arrondi commercial du §2 de `MOTEUR-ANALYTICS.md`. Le résultat est
**stocké**, pas recalculé à la lecture : l'arrondi doit être figé au moment de la
vente.

`quantite` est une **chaîne décimale** (`"12"`, `"2.5"`), jamais un flottant :
3 décimales au maximum, ce que la colonne `NUMERIC(14,3)` accepte.

Le `numero` est alloué dans la même transaction que la vente, via la table
`compteurs` (`UPDATE … RETURNING`), donc sûr sous concurrence.

| Code | Cas |
|---|---|
| **201** | vente créée, avec ses lignes |
| **400** `VALIDATION` | montant négatif, date illisible, moyen de paiement inconnu, quantité ≤ 0, plus de 200 lignes |
| **401** / **403** | session absente ou compte suspendu |

### 3.4 `GET /api/ventes/:id` → **200**

La vente **avec ses lignes**. `404 RESSOURCE_INTROUVABLE` si elle n'existe pas,
**si elle est supprimée**, ou **si elle appartient à une autre entreprise** —
les trois cas sont indistinguables, c'est voulu.

### 3.5 `PATCH /api/ventes/:id` → **200**

Mise à jour partielle : seuls les champs envoyés changent. Envoyer `lignes`
**remplace intégralement** le jeu de lignes et recalcule le total ; ne pas
l'envoyer les laisse intactes. Un remplacement complet évite d'inventer une
sémantique de fusion ligne à ligne que personne ne devinerait.

`null` est une valeur : `{"note": null}` efface la note. Un champ absent ne
change rien.

### 3.6 `DELETE /api/ventes/:id` → **204**

Suppression **douce** (`supprime_le`). La vente disparaît des listes et des KPI
mais l'historique reste cohérent. Supprimer deux fois → **404** la seconde fois :
une ressource supprimée est invisible, y compris pour la supprimer encore.

### 3.7 Dépenses — `/api/depenses`

Mêmes routes, mêmes règles, mêmes codes. Différences :

- champ de montant : `montant_mineur` (une dépense n'a pas de lignes) ;
- `categorie_id` optionnel, **doit appartenir à l'entreprise** — sinon `400`, et
  non `404` : le champ est invalide, on ne cherche pas une ressource ;
- pas de `numero` : une dépense n'a pas de numérotation lisible à afficher ;
- filtre supplémentaire : `categorie_id`.

### 3.8 `GET /api/categories-depense` → **200**

Les catégories de l'entreprise, non supprimées, triées par `ordre` puis
`libelle`. Nécessaire au formulaire de dépense. Pas de création ni de
modification en Vague 2 : les catégories sont copiées à l'inscription depuis les
modèles, ça suffit pour saisir.

```jsonc
{ "elements": [ { "id": "uuid", "code": "loyer", "libelle": "Loyer et charges locatives" } ] }
```

### 3.9 Formes renvoyées

```jsonc
// vente en liste
{
  "id": "uuid",
  "numero": 42,
  "effectuee_le": "2026-05-14T22:00:00.000Z",
  "date_locale": "2026-05-15",
  "montant_total_mineur": 345000,
  "moyen_paiement": "CARTE",
  "statut": "VALIDEE",
  "note": null,
  "nombre_lignes": 3,
  "cree_le": "2026-05-15T09:12:44.001Z"
}

// vente en détail : les mêmes champs, plus
{
  "lignes": [
    { "id": "uuid", "rang": 1, "libelle": "Baguette",
      "quantite": "12.000", "prix_unitaire_mineur": 110, "montant_mineur": 1320 }
  ]
}

// dépense
{
  "id": "uuid",
  "effectuee_le": "2026-05-19T22:00:00.000Z",
  "date_locale": "2026-05-20",
  "montant_mineur": 5000,
  "categorie": { "id": "uuid", "code": "loyer", "libelle": "Loyer et charges locatives" },
  "fournisseur": "SCI du Centre",
  "moyen_paiement": "VIREMENT",
  "statut": "VALIDEE",
  "note": null,
  "cree_le": "2026-05-20T08:03:00.000Z"
}
```

`categorie` est **résolue** (pas seulement son identifiant) : afficher une liste
de dépenses ne doit pas obliger le client à croiser deux appels.

### 3.10 Hors périmètre de la Vague 2

| Exclu | Conséquence, et quand le traiter |
|---|---|
| **Clients** | `ventes.client_id` reste `null`. Le KPI `top_clients` de `MOTEUR-ANALYTICS.md` §5.3 sera donc vide tant que les clients n'existent pas — **à livrer avant la Vague 3** si ce KPI compte, ou à retirer du tableau de bord. |
| Création / modification de catégories | Les modèles copiés à l'inscription suffisent pour saisir. |
| Import de fichier (CSV, relevé bancaire) | Vraie fonctionnalité à part entière. |
| Pièces jointes (photo de ticket) | Demande Supabase Storage, prévu après le MVP. |

### 3.11 Découpage du travail

| Lot | Écrit dans |
|---|---|
| **Socle partagé** *(d'abord, seul)* | `shared/src/operations.ts`, `shared/src/montant.ts` |
| **A — domaine et routes** | `server/src/domaine/temps.ts`, `server/src/modules/operations/**` |
| **B — écrans** | `web/src/pages/**`, `web/src/composants/**` |

---

## §4. Vague 3 — moteur de KPI et tableau de bord *(contrat arrêté)*

Les formules font foi dans `docs/MOTEUR-ANALYTICS.md` §5. Ce contrat ne décrit
que leur transport.

### 4.1 Une seule route

`GET /api/tableau-de-bord` — session requise.

**Un seul appel** rend tout ce que l'écran affiche : indicateurs, comparaison,
série journalière, répartitions. Découper en cinq routes ferait cinq
allers-retours, et surtout cinq instantanés différents de la base — le total
des répartitions pourrait ne plus correspondre à l'indicateur affiché au-dessus.

| Paramètre | Défaut | Valeurs |
|---|---|---|
| `periode` | `mois` | `jour`, `semaine`, `mois`, `trimestre`, `annee`, `personnalisee` |
| `reference` | aujourd'hui | date locale `AAAA-MM-JJ` : la période est celle qui **contient** ce jour |
| `du`, `au` | — | obligatoires si `periode=personnalisee`, bornes **incluses** |

`reference` plutôt qu'un décalage (`-1`, `-2`) : « le mois qui contient le
15 mai » se lit sans ambiguïté, ne dépend pas de la date du jour, et rend l'URL
partageable et rejouable.

### 4.2 Ce que rend la route

```jsonc
{
  "periode": {
    "cle": "mois",
    "debut": "2026-04-30T22:00:00.000Z",
    "fin":   "2026-05-31T22:00:00.000Z",
    "debut_local": "2026-05-01",
    "fin_local":   "2026-05-31",          // dernier jour INCLUS, pour l'affichage
    "fuseau": "Europe/Paris",
    "en_cours": true
  },
  "comparaison": {
    "debut_local": "2026-04-01",
    "fin_local":   "2026-04-08",
    "a_date": true                        // voir §4.3
  },
  "devise": { "code": "EUR", "decimales": 2 },

  "kpi": {
    "chiffre_affaires": { "valeur": 345000, "evolution_pourcent": 122,  "base_nulle": false },
    "depenses_totales": { "valeur": 89000,  "evolution_pourcent": -45,  "base_nulle": false },
    "benefice":         { "valeur": 256000, "evolution_pourcent": 210,  "base_nulle": false },
    "nombre_ventes":    { "valeur": 12,     "evolution_pourcent": 90,   "base_nulle": false },
    "panier_moyen":     { "valeur": 28750,  "evolution_pourcent": 17,   "base_nulle": false },
    "nombre_depenses":  { "valeur": 4,      "evolution_pourcent": 0,    "base_nulle": false },
    "depense_moyenne":  { "valeur": 22250,  "evolution_pourcent": -45,  "base_nulle": false },
    "marge_pourcent":   { "valeur": 742 }
  },

  "serie_ca_par_jour": [
    { "date_locale": "2026-05-01", "ca": 12000, "nombre_ventes": 2 }
  ],
  "repartition_depenses": [
    { "id": "uuid", "libelle": "Loyer", "montant": 60000, "part_dixiemes": 674 }
  ],
  "ca_par_moyen_paiement": [
    { "id": "CARTE", "libelle": "Carte bancaire", "montant": 240000, "part_dixiemes": 696 }
  ],
  "top_produits": [
    { "libelle": "Baguette", "quantite": "120.000", "montant": 13200 }
  ],
  "meilleur_jour_semaine": { "jour": 2, "libelle": "mardi", "ca_moyen": 11000 }
}
```

Rappels de format, identiques partout dans le produit :

- **montants** : entiers d'unité mineure. `345000` = 3 450,00 € ;
- **pourcentages** : dixièmes de point. `742` = 74,2 %, `-45` = −4,5 % ;
- **`valeur: null`** signifie *non calculable*, jamais zéro. Un panier moyen sans
  vente n'est pas 0 € (`MOTEUR-ANALYTICS.md` §5.1) ;
- **`base_nulle: true`** : la période précédente valait 0, l'évolution n'a pas de
  sens. L'interface affiche « nouveau », pas « +∞ % » ;
- **`part_dixiemes`** : les parts d'une répartition somment **exactement 1000**,
  par la méthode du plus fort reste (§2.5).

### 4.3 Comparaison d'une période en cours

Décision `MOTEUR-ANALYTICS.md` §9, point 1 : quand la période court encore, la
comparaison est faite **à date**. Le 8 du mois, « ce mois » est comparé au
1–8 du mois précédent, et `comparaison.a_date` vaut `true` pour que l'interface
l'écrive noir sur blanc.

Sans cela, 8 jours comparés à 31 afficheraient mécaniquement −74 % : un chiffre
faux, et un indicateur qui ment une fois n'est plus jamais consulté.

Si le mois précédent est plus court que le nombre de jours écoulés (31 jours
courus en mars contre 28 en février), la fenêtre de comparaison est **bornée à
la fin du mois précédent** — jamais débordée sur celui d'avant.

### 4.4 Ce qui entre dans le calcul

Exactement le filtre de `MOTEUR-ANALYTICS.md` §4 : `statut = 'VALIDEE'`,
`supprime_le IS NULL`, `effectuee_le` dans `[debut, fin[`, `entreprise_id` du
contexte de session. Les brouillons, les annulées et les supprimées n'entrent
dans **aucun** indicateur.

### 4.5 Codes de retour

| Code | Cas |
|---|---|
| **200** | y compris sans aucune donnée — les indicateurs valent alors `0` ou `null` |
| **400** `VALIDATION` | période inconnue, date illisible, `personnalisee` sans `du`/`au`, intervalle supérieur à 3 ans |
| **401** / **403** | session absente, compte suspendu |

Un tableau de bord vide est un **succès**, pas une erreur : c'est l'état normal
d'un compte le jour de son inscription, et l'interface doit y accueillir
l'utilisateur, pas lui montrer un message d'échec.

La limite de 3 ans borne le coût d'une requête : au-delà, l'écran deviendrait
illisible bien avant que la base ne peine.

### 4.6 Hors périmètre de la Vague 3

| Exclu | Pourquoi |
|---|---|
| **`top_clients`** | Les clients n'existent pas (Vague 2 §3.10) : ce KPI serait structurellement vide. Une case toujours à zéro n'est pas un indicateur, c'est une promesse non tenue. Il reviendra avec les clients. |
| Export PDF / tableur | Après le MVP. |
| Comparaison à l'année précédente | Le comparatif à la période précédente couvre le besoin immédiat. |
| Objectifs et prévisions | Relèvent du moteur de questions intelligentes (Vague 4). |

### 4.7 Découpage du travail

| Lot | Écrit dans |
|---|---|
| **Socle partagé** *(d'abord, seul)* | `shared/src/kpi.ts` |
| **A — moteur et routes** | `server/src/domaine/periodes.ts`, `server/src/domaine/kpi.ts`, `server/src/modules/kpi/**` |
| **B — écran** | `web/src/pages/TableauDeBord.tsx`, `web/src/composants/**` |

Le moteur (`domaine/kpi.ts`) est **pur** : entrées → sortie, sans horloge ni
base. C'est ce qui rend les cas de référence du §8 testables au centime.

---

## §5. Vague 4a — catalogue de produits et clients *(contrat arrêté)*

Objet : donner au moteur de questions les données qui lui manquent. Sans
catalogue porteur d'un **coût**, la marge n'existe pas ; sans clients rattachés
aux ventes, huit des quatorze questions de la spécification métier
interrogent le vide (`docs/ECARTS-SPEC.md` §1).

Toutes ces routes exigent une session. L'entreprise vient du contexte, jamais de
l'URL.

### 5.1 Trois décisions de conception

#### Le libellé d'une ligne de vente est une photographie, pas un lien

Une ligne de vente garde **son propre `libelle`**, recopié depuis le produit au
moment de la vente, en plus de `produit_id`.

Renommer « T-shirt » en « T-shirt coton bio » ne doit pas réécrire l'historique :
la vente de mars s'est faite sur un « T-shirt », et c'est ce que la facture, le
journal et le client ont vu. Même raisonnement pour `prix_unitaire_mineur`, déjà
figé depuis la Vague 2.

Le `produit_id` sert aux **regroupements** (quel produit se vend le plus), le
`libelle` sert à **l'affichage de l'historique**. Les deux sont nécessaires.

#### `produit_id` reste facultatif

Une ligne peut désigner un produit du catalogue, ou rester du texte libre — un
article hors catalogue, une prestation ponctuelle.

Conséquence, conforme au §8 de la spécification métier : **les lignes sans
`produit_id` comptent dans le chiffre d'affaires, jamais dans un classement par
produit**. Le tableau de bord annonce alors combien de CA échappe au classement,
plutôt que de laisser croire que le total est complet.

Rendre le catalogue obligatoire imposerait de créer une fiche produit avant
d'encaisser la première vente. C'est un mur à l'entrée du produit.

#### `[À VALIDER]` La marge se calcule sur le prix du catalogue, pas sur le prix de vente

La spécification métier §3.6 dit : `marge % = (price − cost) / price`, et
`marge € = (price − cost) × quantité vendue` — c'est-à-dire le prix **du
catalogue**, pas celui auquel la vente s'est réellement faite.

Conséquence : une remise n'apparaît nulle part dans la marge. Un T-shirt à 20 €
(coût 8 €) soldé à 12 € affichera toujours 60 % de marge, alors que la marge
réelle est de 33 %.

**J'implémente la règle telle qu'elle est écrite**, et je la signale : si tu
préfères la marge réelle, la formule devient
`(prix_unitaire_vendu − cout) × quantité`, avec le coût figé lui aussi au moment
de la vente. C'est un changement de schéma, pas seulement de formule.

### 5.2 Produits — `/api/produits`

`GET` → liste, triée par nom. Paramètres : `limite`, `decalage`, `categorie`,
`recherche` (sur le nom, insensible à la casse).

`POST` → **201**

```jsonc
{
  "nom": "T-shirt",
  "categorie": "Vêtements",        // optionnel, texte libre
  "prix_mineur": 2000,             // 20,00 €
  "cout_mineur": 800               // optionnel — null signifie « non renseigné »
}
```

`PATCH /:id`, `DELETE /:id` (suppression douce).

| Code | Cas |
|---|---|
| **201** / **200** / **204** | selon la méthode |
| **400** `VALIDATION` | nom vide, prix négatif, coût négatif |
| **409** `CONFLIT` | un produit actif porte déjà ce nom dans l'entreprise |
| **404** | inexistant, supprimé, ou appartenant à une autre entreprise |

**`cout_mineur` est nullable, et ce `null` est signifiant.** Un produit sans coût
est **exclu de tout classement de rentabilité** — ni au mieux, ni au pire. Lui
attribuer un coût par défaut (0, ou le prix de vente) inventerait une marge de
100 % ou de 0 % : deux mensonges.

Unicité du nom par entreprise, insensible à la casse, sur les produits non
supprimés. Sans elle, deux fiches « T-shirt » scinderaient les classements en
deux et fausseraient toutes les réponses par produit.

### 5.3 Clients — `/api/clients`

`GET` → liste triée par nom. Paramètres : `limite`, `decalage`, `recherche`.

`POST` → **201**

```jsonc
{ "nom": "Awa Diop", "email": "awa@exemple.fr", "telephone": "+221…", "note": "…" }
```

Seul `nom` est obligatoire. `PATCH /:id`, `DELETE /:id` (suppression douce).

La table existe depuis la Vague 0, `cree_le` comprise — c'est le `created_at` de
la spécification, utilisé pour compter les **nouveaux clients** d'une période.

Supprimer un client ne touche pas ses ventes : la ligne reste en base
(`supprime_le`), la vente continue de la référencer, et l'historique reste juste.

### 5.4 Ventes — deux champs de plus

`POST /api/ventes` et `PATCH /api/ventes/:id` acceptent désormais :

```jsonc
{
  "client_id": "uuid",             // optionnel, null = vente anonyme
  "lignes": [
    { "produit_id": "uuid", "quantite": "2" },              // prix et libellé repris du catalogue
    { "produit_id": "uuid", "quantite": "2", "prix_unitaire_mineur": 1200 },  // prix forcé (remise)
    { "libelle": "Retouche", "quantite": "1", "prix_unitaire_mineur": 500 }   // hors catalogue
  ]
}
```

Règles de remplissage d'une ligne :

| Envoyé | Libellé retenu | Prix unitaire retenu |
|---|---|---|
| `produit_id` seul | nom du produit, **recopié** | prix du catalogue, **recopié** |
| `produit_id` + `prix_unitaire_mineur` | nom du produit | le prix envoyé (remise, promotion) |
| `produit_id` + `libelle` | le libellé envoyé | prix du catalogue si non fourni |
| `libelle` + `prix_unitaire_mineur` | le libellé envoyé | le prix envoyé |
| ni l'un ni l'autre | **400** | |

`client_id` et `produit_id` doivent appartenir à l'entreprise, sinon **400**
`VALIDATION` — pas 404 : c'est un champ du corps qui est invalide, on ne cherche
pas une ressource, et l'appelant a fourni la valeur lui-même.

La réponse d'une vente porte désormais `client` **résolu** (ou `null`) et chaque
ligne porte son `produit_id`.

### 5.5 Ce que cela débloque

| Question de la spécification métier §4 | Débloquée par |
|---|---|
| Quel produit est le plus rentable ? | `produits.cout_mineur` |
| Quelle catégorie génère le plus de revenus ? | `produits.categorie` |
| Qui sont mes meilleurs clients ? | `ventes.client_id` |
| Combien de clients ai-je ? | `clients` |
| Quels clients n'ont pas acheté récemment ? | `clients` + `ventes.client_id` |

Les indicateurs eux-mêmes (marge, classements clients, inactifs) arrivent en
**Vague 4b** : cette vague pose les données et la saisie, pas les calculs.

### 5.6 Hors périmètre

| Exclu | Pourquoi |
|---|---|
| Stock, seuil de réapprovisionnement | Ce n'est pas de l'analyse, c'est un autre produit. |
| Historique des prix du catalogue | La photographie sur la ligne de vente suffit à l'historique. |
| Import du catalogue par fichier | Après le MVP. |
| Fusion de doublons clients | À prévoir si la saisie libre en crée. |

---

## §6. Vague 4b — moteur de questions intelligentes *(contrat arrêté)*

Les 14 questions du §4 de la spécification métier, chacune adossée à **sa**
formule, jamais à une interprétation libre. Session requise.

### 6.1 `GET /api/questions`

Mêmes paramètres que le tableau de bord : `periode`, `reference`, `du`, `au`.

```jsonc
{
  "periode": { … },        // identique à /api/tableau-de-bord
  "comparaison": { … },
  "devise": { "code": "EUR", "decimales": 2 },
  "secteur": "commerce_detail",
  "questions": [
    {
      "id": "combien_ai_je_gagne",
      "question": "Combien ai-je gagné sur la période ?",
      "formule": "§3.1",
      "disponible": true,
      "indicateur": { "valeur": 31500, "evolution_pourcent": 125,
                      "evolution_montant": 3500, "base_nulle": false }
    },
    {
      "id": "produit_le_plus_rentable",
      "question": "Quel produit est le plus rentable ?",
      "formule": "§3.6",
      "disponible": false,
      "raison": "Aucun produit n'a de coût de revient renseigné."
    }
  ]
}
```

Chaque question porte **`formule`**, le renvoi vers le paragraphe de
`docs/MOTEUR-ANALYTICS.md` qui la définit. C'est la traçabilité : on peut
remonter d'un chiffre affiché à la règle qui l'a produit, sans lire le code.

### 6.2 Une question sans données répond « indisponible », jamais zéro

`disponible: false` + une **raison en français**, destinée à l'utilisateur.

C'est le point le plus important de cette vague. Une entreprise qui n'a renseigné
aucun coût ne doit pas lire « produit le plus rentable : T-shirt, 0 % » — elle
doit lire *« aucun produit n'a de coût de revient renseigné »*, et savoir quoi
faire pour obtenir la réponse. Un indicateur faux coûte plus cher qu'un
indicateur absent.

Les cinq raisons possibles :

| Raison | Question concernée |
|---|---|
| Aucune vente sur la période | classements produits, panier moyen |
| Aucune dépense sur la période | répartition des dépenses |
| Aucune vente rattachée à un produit du catalogue | classements produits |
| Aucun produit n'a de coût de revient renseigné | produit le plus rentable |
| Aucune vente rattachée à un client | meilleurs clients |

### 6.3 Les 14 questions

| `id` | Question | Formule | Forme de réponse |
|---|---|---|---|
| `combien_ai_je_gagne` | Combien ai-je gagné ? | §3.1 | indicateur |
| `benefice_estime` | Quel est mon bénéfice estimé ? | §3.3 | indicateur |
| `ou_je_depense_le_plus` | Où est-ce que je dépense le plus ? | §3.9 | classement |
| `depenses_augmentent` | Mes dépenses augmentent-elles ? | §3.5 sur §3.2 | indicateur |
| `produit_le_plus_vendu` | Quel produit se vend le plus ? | §3.7 (quantité) | classement |
| `produit_le_plus_de_ca` | Quel produit génère le plus de CA ? | §3.7 (CA) | classement |
| `ventes_progressent` | Mes ventes progressent-elles ? | §3.5 sur §3.1 | indicateur + effectif |
| `panier_moyen` | Quel est mon panier moyen ? | §3.4 | indicateur |
| `meilleurs_clients` | Qui sont mes meilleurs clients ? | §3.8 | classement |
| `combien_de_clients` | Combien de clients ai-je ? | §3.8 | nombre + nouveaux |
| `clients_inactifs` | Quels clients n'ont pas acheté récemment ? | §3.8 | classement (jours) |
| `produit_le_plus_rentable` | Quel produit est le plus rentable ? | §3.6 | classement (marge) |
| `produits_les_moins_vendus` | Quels produits se vendent le moins ? | §3.7 croissant | classement, **tous les ex æquo** |
| `categorie_la_plus_rentable` | Quelle catégorie génère le plus de revenus ? | §3.7 par catégorie | classement |

### 6.4 Égalités

Règle unique du §3.7, appliquée à **tous** les classements :

- départage par **ordre alphabétique** du libellé ;
- une question à réponse unique (« quel est… ») rend le premier, avec
  `ex_aequo: true` sur chaque élément à égalité avec lui ;
- une question en liste (« quels sont les moins vendus ») rend **tous** les ex
  æquo, jamais un seul.

C'est pourquoi « quels produits se vendent le moins » rend *Pull et Sac*, et non
l'un des deux.

### 6.5 Vocabulaire par secteur

Même moteur, mots différents — spécification métier §4 :

| Secteur | « produit » devient |
|---|---|
| `restauration` | **plat** |
| `services_pro` | **prestation** |
| tous les autres | produit |

Seuls les **libellés de questions** changent. Aucune formule, aucun seuil, aucun
classement n'est modifié : un moteur par secteur deviendrait impossible à tester.

### 6.6 Seuils

| Seuil | Valeur | Statut |
|---|---|---|
| Client inactif | **60 jours** sans achat | §8 de la spécification : à confirmer, à rendre paramétrable par secteur |
| Taille des classements | 5 éléments | tous les ex æquo du dernier rang sont conservés |

Le compteur d'inactivité se mesure depuis **aujourd'hui**, pas depuis la fin de
la période analysée : « n'a pas acheté récemment » est une question sur le
présent, pas sur la fenêtre consultée.

### 6.7 Hors périmètre

| Exclu | Pourquoi |
|---|---|
| Reformulation par IA | Vague 4c — attend `GEMINI_API_KEY` et le contrat `GEMINI.md`. |
| Question « quel projet rapporte le plus » (BTP) | Aucune table `projets` : §8 de la spécification, à trancher avant de coder. |
| Questions en langage libre | Le moteur répond à un **catalogue fixe** de questions. Interpréter une question libre relèverait de l'IA, et sortirait du principe « l'IA ne calcule jamais ». |

---

## §7. Vague 5 — référentiels *(contrat arrêté)*

### 7.1 `GET /api/referentiels`

**Publique**, sans session : l'écran d'inscription en a besoin avant qu'aucun
compte n'existe. Ne renvoie que des données de catalogue, aucune donnée client.

```json
{
  "devises": [{ "code": "XOF", "libelle": "Franc CFA (BCEAO)", "symbole": "FCFA", "decimales": 0 }],
  "secteurs": [{ "code": "commerce_detail", "libelle": "Commerce de détail" }],
  "pays": [{ "code": "SN", "nom": "Sénégal", "devise": "XOF", "fuseau": "Africa/Dakar" }],
  "devises_rapides": ["XOF", "EUR", "USD"]
}
```

`Cache-Control: public, max-age=3600` : la liste change à peine plus souvent
qu'une migration.

**Origine des trois listes.** `devises` et `secteurs` sont **lues en base** —
elles conditionnent des clés étrangères, la base en est donc la seule autorité.
`pays` vient de `@bizly/shared` : ISO 3166-1 figé, aucune clé étrangère, et le
serveur valide contre exactement la même constante que celle affichée au client.

**`devises_rapides`** est un ordre d'affichage, pas une restriction : ce sont les
trois devises mises en avant à l'inscription (franc CFA, euro, dollar). Les
autres restent choisissables dans la liste complète.

### 7.2 Pays, devise et fuseau — qui décide de quoi

Le pays **pré-remplit** la devise et le fuseau, il ne les impose pas :

| Champ envoyé | Comportement serveur |
|---|---|
| `pays` seul | `devise` et `fuseau` prennent la valeur usuelle du pays |
| `pays` + `devise` | la devise envoyée gagne — une agence sénégalaise peut facturer en euros |
| `pays` + `fuseau` | le fuseau envoyé gagne |
| rien | `EUR` / `Europe/Paris`, comme avant la Vague 5 |

Un `pays` inconnu de la liste est **refusé en 400**, jamais ignoré en silence :
l'ignorer donnerait à l'utilisateur une devise qu'il n'a pas choisie.

---

## §8. Vague 5 — entreprise et compte *(contrat arrêté)*

### 8.1 `PATCH /api/entreprise`

Session requise, **rôle `PROPRIETAIRE`**. Corps partiel, au moins un champ :

```json
{ "nom": "Boutique Awa", "secteur": "commerce_detail", "pays": "SN",
  "devise": "XOF", "fuseau": "Africa/Dakar" }
```

Renvoie l'`EntreprisePublique` à jour — la même forme que `GET /api/moi`, pour
que le client remplace son état sans recomposer d'objet.

`plan` et `statut` **n'y figurent pas** : ils relèvent de l'administration
(`CLAUDE.md` §7.4). Les envoyer est une erreur de validation, pas un silence.

### 8.2 Le changement de devise, et pourquoi il se ferme

Un montant est stocké en **unité mineure** (`MOTEUR-ANALYTICS.md` §1). Passer
d'EUR à XOF ne convertit rien : `31500` cesse de valoir 315,00 € pour valoir
31 500 FCFA. Tout l'historique change de sens d'un coup.

**Règle** : la devise se change librement **tant que l'entreprise n'a enregistré
aucun montant**. Dès la première vente, dépense ou fiche produit, la demande est
refusée en `409 CONFLIT` :

```json
{
  "erreur": {
    "code": "CONFLIT",
    "message": "La devise ne peut plus changer : 12 ventes, 5 dépenses et 4 produits sont enregistrés en EUR.",
    "details": { "volumes": { "ventes": 12, "depenses": 5, "produits": 4 } }
  }
}
```

Les volumes sont dans la réponse pour que le refus soit **vérifiable** par
l'utilisateur, et non un mur sans explication.

Convertir automatiquement supposerait un taux de change ; aucun n'est disponible,
et en inventer un ferait produire à l'application un chiffre financier faux —
exactement ce que `CLAUDE.md` §15 interdit.

Deux devises à deux décimales ne font pas exception : 315,00 € ne vaut pas
315,00 $.

### 8.3 `PATCH /api/moi`

Session requise. `{ "nom": "Awa Diop" }` renvoie l'`UtilisateurPublic` à jour.

L'**e-mail ne se change pas** : il identifie le compte, et le modifier sans
vérifier la nouvelle adresse permettrait de s'enfermer dehors, ou d'y envoyer un
compte qui ne nous appartient pas. Cela demande un envoi d'e-mail — hors MVP,
comme la réinitialisation de mot de passe (§2).

### 8.4 `POST /api/mot-de-passe`

Session requise. `{ "ancien": "...", "nouveau": "..." }` renvoie `204`.

- `ancien` faux : `401 IDENTIFIANTS_INVALIDES` (même code qu'à la connexion,
  rien à révéler de plus) ;
- `nouveau` doit passer les mêmes règles qu'à l'inscription ;
- `nouveau` identique à `ancien` : `400 VALIDATION` ;
- **toutes les autres sessions sont révoquées**, celle en cours conservée.
  Changer son mot de passe est le geste que l'on fait quand on se croit
  compromis : laisser les autres sessions ouvertes le viderait de son sens.
- Limite : 5 tentatives par heure et par utilisateur.

---

## §9. Vague 5 — console d'administration *(contrat arrêté)*

Espace **strictement séparé** : table `admins`, table `admin_sessions`, cookie
`bizly_admin`. Un jeton client n'ouvre rien ici, un jeton admin n'ouvre rien
côté client — deux domaines d'authentification qui ne se croisent jamais.

Aucune route d'inscription : le premier administrateur se crée en ligne de
commande (`npm run comptes -- admin:creer`), sur la machine qui détient déjà
l'accès à la base. Une page d'inscription admin exposée sur Internet serait la
porte d'entrée de tout le service.

**Aucune route de réinitialisation non plus**, pour la même raison. Un mot de
passe d'administrateur perdu se repose donc en ligne de commande
(`npm run comptes -- admin:mdp`), jamais par HTTP.

### 9.1 Authentification

| Route | Corps | Réponse |
|---|---|---|
| `POST /api/admin/connexion` | `{ email, mot_de_passe }` | `200 { admin }` et cookie |
| `POST /api/admin/deconnexion` | — | `204` |
| `GET /api/admin/moi` | — | `200 { admin }` ou `401` |

Mêmes défenses qu'au §2 : message unique pour « e-mail inconnu » et « mot de
passe faux », temps de réponse égalisé, double limitation IP / e-mail. Les
seuils sont **plus serrés** : 5 tentatives par quart d'heure et par e-mail,
20 par IP. Les administrateurs sont peu nombreux et connaissent leur mot de
passe.

Session admin : **12 heures**, contre 30 jours côté client. Un accès qui voit
tous les comptes ne reste pas ouvert un mois.

### 9.2 `GET /api/admin/entreprises`

| Paramètre | Défaut | Rôle |
|---|---|---|
| `recherche` | — | nom d'entreprise ou e-mail du propriétaire |
| `statut` | tous | `ACTIF` ou `SUSPENDU` |
| `plan` | tous | `free`, `pro` ou `business` |
| `limite` / `decalage` | 50 / 0 | pagination `Page<T>` du §0 |

Chaque élément est un `EntrepriseAdmin` : identité, plan, statut, propriétaire,
volumes (utilisateurs, ventes, dépenses) et date de dernière activité.

### 9.3 `PATCH /api/admin/entreprises/:id`

```json
{ "plan": "pro", "statut": "SUSPENDU", "motif_suspension": "Impayé" }
```

- `statut: "SUSPENDU"` **exige** `motif_suspension` — la base impose déjà le
  couple `statut` / `suspendue_le`, l'API impose la raison, pour qu'aucune
  suspension ne soit inexplicable six mois plus tard ;
- repasser à `ACTIF` efface `motif_suspension` et `suspendue_le` ;
- suspendre **révoque immédiatement toutes les sessions** de l'entreprise. Sans
  cela, le compte suspendu resterait utilisable jusqu'à sa prochaine requête ;
- `plan` est le champ manuel du `CLAUDE.md` §7.4 : c'est ici, et nulle part
  ailleurs, qu'il change.

### 9.4 `POST /api/admin/utilisateurs/:id/mot-de-passe`

`{ "mot_de_passe": "..." }` renvoie `204`. C'est la réinitialisation manuelle
promise en Vague 1, en attendant un service d'e-mail. Révoque **toutes** les
sessions de l'utilisateur. Le mot de passe est soumis aux mêmes règles qu'à
l'inscription : un administrateur pressé ne doit pas pouvoir poser
« motdepasse ».

### 9.5 `GET /api/admin/statistiques`

Les indicateurs de succès du `CLAUDE.md` §14 qui sont calculables aujourd'hui :
entreprises (total, actives, suspendues), utilisateurs, entreprises ayant
enregistré **au moins une vente**, répartition par plan, inscriptions des
30 derniers jours.

Rétention, MRR et conversion Free vers Pro n'y sont pas : ils demandent un
historique d'événements que le MVP n'enregistre pas. Les afficher à zéro les
ferait passer pour mesurés.

### 9.6 Ce que la console ne fait pas

| Exclu | Pourquoi |
|---|---|
| Lire les ventes, dépenses ou clients d'une entreprise | Aucune raison d'exploitation ne l'exige. Un support qui peut tout lire est une fuite qui attend son incident. |
| Supprimer une entreprise | Irréversible et sans filet. La suspension couvre le besoin réel. |
| Créer un administrateur depuis l'interface | Ligne de commande uniquement (§9). |
