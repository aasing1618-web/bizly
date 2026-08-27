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
| **429** `TROP_DE_REQUETES` | 10 tentatives / 15 min, par IP **et** par e-mail |

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

En mémoire du processus, fenêtre glissante. Assumé : une seule instance en MVP.
Le jour où il y en a deux, cela demandera un magasin partagé — c'est écrit ici
pour que la découverte ne se fasse pas en production.

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
