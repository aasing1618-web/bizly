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

## §2. Vague 1 — authentification *(proposé, à valider avant ouverture)*

> Rien de cette section n'est implémenté. Elle est ici pour être **relue et corrigée
> avant** que le premier agent de la Vague 1 démarre.

### `POST /api/inscription`

Crée une **entreprise** et son **premier utilisateur** (rôle `PROPRIETAIRE`), en une
seule transaction.

```json
{
  "entreprise": { "nom": "Boulangerie Martin", "secteur": "commerce_detail" },
  "utilisateur": { "nom": "Awa Martin", "email": "awa@ex.fr", "mot_de_passe": "…" }
}
```

- **201** → `{ "utilisateur": { … }, "entreprise": { … } }`, cookie de session posé.
- **409 `CONFLIT`** → email déjà utilisé.
- **400 `VALIDATION`** → mot de passe < 10 caractères, email invalide, secteur inconnu.

`[À VALIDER]` — l'inscription est-elle **ouverte** (n'importe qui crée un compte, statut
`ACTIF` immédiat) ou **sur invitation** (statut `SUSPENDU` jusqu'à activation manuelle
depuis `/admin`) ? Le brief dit « comptes changés à la main, aucun paiement en ligne »,
ce qui plaide pour la seconde. **Défaut proposé : création en `ACTIF`**, suspension
manuelle a posteriori — moins frustrant pour tester, réversible en une ligne.

### `POST /api/connexion`

```json
{ "email": "awa@ex.fr", "mot_de_passe": "…" }
```

- **200** → `{ "utilisateur": { … }, "entreprise": { … } }` + cookie `bizly_session`.
- **401 `IDENTIFIANTS_INVALIDES`** → email inconnu **ou** mot de passe faux.
  Message identique dans les deux cas, et **temps de réponse identique** (on hache un
  mot de passe factice quand l'email est inconnu) : sinon l'API devient un oracle
  permettant d'énumérer les comptes clients.
- **403 `COMPTE_SUSPENDU`** → identifiants bons, compte suspendu. Là on **peut** le dire :
  l'utilisateur a prouvé qui il est.
- **429 `TROP_DE_REQUETES`** → au-delà de 10 tentatives / 15 min par IP **et** par email.

Cookie : `bizly_session=<token>; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`
(+ `Secure` hors développement). Durée **30 jours**, glissante : prolongée à chaque
requête authentifiée si plus de 24 h se sont écoulées.

### `POST /api/deconnexion`

- **204**. Révoque la session en base **et** efface le cookie. Idempotent : sans session
  valide, renvoie **204** quand même.

### `GET /api/moi`

- **200** → utilisateur + entreprise + rôle courant. C'est ce qu'appelle le SPA au
  démarrage pour savoir s'il doit afficher l'app ou l'écran de connexion.
- **401 `NON_AUTHENTIFIE`** → pas de session. Pas une erreur à logger.

### Périmètre de la Vague 1

| Inclus | Exclu (vagues suivantes) |
|---|---|
| Inscription, connexion, déconnexion, `/api/moi` | Mot de passe oublié (nécessite un envoi d'e-mail) |
| Session en base + cookie HttpOnly | Invitation d'un collègue |
| Middleware `exigerSession` + `exigerRole` | 2FA |
| Blocage des comptes `SUSPENDU` | Gestion des rôles fins |

`[À VALIDER]` — la réinitialisation de mot de passe suppose un service d'envoi d'e-mail
(Resend, Postmark, SMTP Supabase…). **Aucun n'est choisi.** Tant qu'il ne l'est pas, un
mot de passe perdu se réinitialise à la main depuis `/admin`. Acceptable en MVP, pas
au-delà.

### Découpage en deux agents (périmètres disjoints)

| Agent | Écrit dans |
|---|---|
| **A — domaine auth** | `server/src/modules/auth/**`, `db/migrations/0003_*.sql`, tests associés |
| **B — écrans** | `web/src/pages/Connexion.tsx`, `web/src/pages/Inscription.tsx`, `web/src/lib/api.ts` |

Les types partagés (`shared/src/**`) sont écrits **avant** le lancement des deux agents,
par moi seul : c'est le seul fichier qu'ils liraient tous les deux.
