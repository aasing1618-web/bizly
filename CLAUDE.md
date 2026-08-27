# Bizly — Constitution du projet

> **État de ce fichier.** Il était vide (0 octet) au démarrage de la Vague 0. Je l'ai
> reconstruit à partir du brief + de décisions d'ingénierie raisonnables.
> Tout ce qui porte le marqueur **`[À VALIDER]`** est une décision prise faute de spec
> écrite : relis, corrige, et ce fichier redevient la source de vérité unique.
> Le reste correspond aux décisions déjà figées par le propriétaire du projet.

---

## §1. Produit

**Bizly** — SaaS de gestion et d'analyse pour petites entreprises, indépendants,
commerçants et prestataires de services.

Le client saisit ses **ventes** et ses **dépenses**. Bizly lui rend :

1. un **dashboard de KPI** (chiffre d'affaires, bénéfice, panier moyen, évolution…) ;
2. un **moteur de questions intelligentes** : des observations écrites en français,
   déclenchées par ses propres données et adaptées à son secteur d'activité.

Le point 2 est ce qui différencie Bizly d'un tableur. C'est le cœur de valeur.

**Hors périmètre MVP** : paiement en ligne, conformité fiscale / facturation légale,
gestion de stock avancée, paie, multi-devise au sein d'une même entreprise.

---

## §2. Architecture (figée)

| Décision | Détail |
|---|---|
| **Une seule origine** | Un seul processus Node/Express sert l'API (`/api/*`), le dashboard admin (`/admin/*`) et l'app cliente (`/*`). Pas de CORS, pas de sous-domaine. |
| **Base de données** | PostgreSQL managé par Supabase, via le **pooler port 6543** (mode transaction). **Sans ORM** : SQL écrit à la main, requêtes paramétrées uniquement. |
| **Stockage fichiers** | Supabase Storage, plus tard (pas en MVP). |
| **Authentification** | Cookie **HttpOnly** de session côté serveur. Pas de JWT en localStorage, pas de Supabase Auth. |
| **Comptes** | Statut `ACTIF` / `SUSPENDU`, changé **à la main** depuis `/admin`. **Aucun paiement en ligne dans le MVP.** |
| **Moteur de calcul** | KPI + questions intelligentes s'exécutent **uniquement côté serveur**. Le navigateur ne reçoit que des résultats déjà calculés. Aucune formule métier dans le bundle client. |
| **Isolation** | Stricte par entreprise. Toute ressource appartenant à une autre entreprise renvoie **404**, jamais 403 : on ne divulgue pas son existence. |

### Stack

Node 22 · Express 5 · TypeScript strict · PostgreSQL (Supabase, sans ORM) ·
React 19 · Vite · Tailwind · Vitest.

> `[À VALIDER]` Le runtime installé sur cette machine est **Node 24.19**, pas Node 22.
> Le code cible `>=22`. Soit on installe Node 22 LTS pour être iso-production, soit on
> assume Node 24 partout. À trancher avant le premier déploiement.

### Conséquences de « une seule origine »

- Build : `web` → `server/public/app`, `admin` → `server/public/admin`.
- Express monte `/api/*` en premier, puis les statiques, puis un fallback SPA.
- Le fallback SPA ne doit **jamais** répondre sur `/api/*` : une route API inconnue
  renvoie un JSON 404, pas l'`index.html`.
- Le bundle admin n'est jamais servi à un utilisateur client.

---

## §3. Structure du dépôt

```
Bizly/
├── CLAUDE.md               ← ce fichier, source de vérité
├── AGENTS.md               ← règles d'exécution pour les agents
├── docs/
│   ├── REPRISE.md          ← état d'avancement, à jour après chaque vague
│   ├── MOTEUR-ANALYTICS.md ← formules KPI, arrondis, devises, cas de référence
│   └── API-CONTRACT.md     ← contrat d'API, écrit AVANT le code de chaque vague
├── db/migrations/          ← SQL numéroté, append-only
├── shared/                 ← types TypeScript partagés serveur ↔ client
├── server/                 ← Express 5 + moteur de calcul
├── web/                    ← app cliente (React 19 + Vite, base `/`)
└── admin/                  ← dashboard admin (React 19 + Vite, base `/admin/`)
```

Un seul `package.json` racine avec **npm workspaces**. Une seule commande installe tout.

---

## §4. Modèle de données

Détail exécutable : `db/migrations/0001_init.sql`. Principes :

1. **Clés** : `uuid` généré par la base (`gen_random_uuid()`).
2. **Multi-tenant** : toute table métier porte `entreprise_id NOT NULL` + FK.
   Toute requête métier filtre sur `entreprise_id`. Sans exception.
3. **Argent** : stocké en **entier signé (`BIGINT`), en unité mineure** de la devise
   (centimes pour EUR, unité entière pour XOF). **Jamais de `float`, jamais de `money`.**
4. **Temps** : `timestamptz` stocké en UTC. Chaque entreprise porte un `fuseau`
   (`Europe/Paris` par défaut) qui définit les bornes de « aujourd'hui » et « ce mois ».
5. **Suppression** : soft delete via `supprime_le timestamptz NULL` sur les tables
   métier, pour ne pas trouer l'historique des KPI.
6. **Admin plateforme** : table `admins` **séparée** de `utilisateurs`. Un admin n'a pas
   d'`entreprise_id` et ne peut pas se connecter à l'app cliente.

---

## §5. Moteur de calcul — KPI

**Le détail complet (formules, arrondis, devises, cas de référence chiffrés) est dans
`docs/MOTEUR-ANALYTICS.md`.** Ce fichier fait foi ; en cas de contradiction avec le
code, c'est le code qui a tort.

Règles non négociables :

- Toute arithmétique monétaire se fait en **entiers d'unité mineure**.
- Une division (panier moyen, marge %) ne produit un résultat que si le dénominateur
  est `> 0`, sinon `null`. **Jamais 0 à la place de « non calculable ».**
- Un KPI est toujours rendu avec sa **période explicite** (début inclus, fin exclue) et
  sa **devise**.
- Le moteur est **pur** : entrées (lignes + période + fuseau) → sortie. Il ne lit pas
  l'horloge lui-même, on lui injecte l'instant courant. C'est ce qui rend les cas de
  référence testables.

---

## §6. Questions intelligentes

> `[À VALIDER]` — **Section à écrire ensemble.** Le brief renvoyait à un §6 qui
> n'existait pas. Ce qui suit est la *mécanique*, pas le contenu métier.

Une « question intelligente » est une **règle** déclarative :

| Champ | Rôle |
|---|---|
| `id` | identifiant stable, ex. `ca_en_baisse_vs_mois_precedent` |
| `secteurs` | secteurs concernés, ou `*` pour tous |
| `donnees_requises` | ce qu'il faut avoir en base pour que la règle ait un sens |
| `volume_minimum` | en dessous, la règle ne se déclenche jamais |
| `seuil` | condition de déclenchement, chiffrée |
| `gravite` | `info` \| `attention` \| `alerte` |
| `titre` | la question, en français, à la 2e personne |
| `detail` | l'explication, avec les vrais montants du client |
| `action` | ce qu'il peut faire concrètement |

Le moteur évalue toutes les règles applicables au secteur de l'entreprise, garde celles
qui se déclenchent, et les trie par gravité puis par impact monétaire.

Une règle ne se déclenche **jamais** sur des données insuffisantes (ex. « ton panier
moyen baisse » avec 2 ventes) — d'où le `volume_minimum` obligatoire.

Contenu métier des règles : à définir secteur par secteur.

---

## §7. Conventions

### Forme des erreurs API

Toute erreur API renvoie ce corps, et rien d'autre :

```json
{ "erreur": { "code": "RESSOURCE_INTROUVABLE", "message": "…", "details": {} } }
```

`code` est une constante `SCREAMING_SNAKE_CASE` stable, destinée au code client.
`message` est en français, destiné à l'humain. `details` est optionnel.
Aucune stack, aucun message Postgres brut ne sort vers le client.

### Codes de retour

| Code | Usage |
|---|---|
| 200 | OK |
| 201 | Création |
| 204 | Suppression |
| 400 | Corps ou paramètre invalide (`VALIDATION`) |
| 401 | Pas de session valide (`NON_AUTHENTIFIE`) |
| 403 | Session valide, droit insuffisant **dans sa propre entreprise** |
| 404 | Ressource inexistante **ou appartenant à une autre entreprise** |
| 409 | Conflit (email déjà pris…) |
| 422 | Corps bien formé mais métier impossible |
| 429 | Trop de requêtes |
| 500 | Bug serveur — `ERREUR_INTERNE`, jamais de détail |

`403` ne doit jamais servir à masquer une ressource d'un autre tenant → `404`.

### Sécurité

- Mots de passe : `scrypt` (`node:crypto`, N=2^15, r=8, p=1, sel 16 o, sortie 64 o),
  comparaison à temps constant. Zéro dépendance native — important sous Windows.
- Session : token aléatoire 256 bits ; **seul son SHA-256 est stocké**.
  Cookie `HttpOnly` + `SameSite=Lax` + `Secure` en production + `Path=/`.
- Aucun secret dans le dépôt. `.env` est ignoré par git, `.env.example` documente les
  clés sans les valeurs.
- SQL **toujours** paramétré (`$1`). Jamais de concaténation de valeur.

### Code

- TypeScript `strict` + `noUncheckedIndexedAccess`. Pas de `any` non justifié.
- Nommage **métier en français** (`ventes`, `depenses`, `entreprise_id`), **technique en
  anglais** (`request`, `handler`, `pool`). S'y tenir évite le franglais aléatoire.
- Pas de `console.log` de debug dans le résultat final : un logger unique.

---

## §8. Méthode de travail

Le projet avance par **vagues**. Pour chaque vague, dans cet ordre :

1. Écrire le **contrat d'API** de la vague dans `docs/API-CONTRACT.md`
   (routes, corps, erreurs, codes) — **avant** la moindre ligne de code.
2. Implémenter — **deux agents en parallèle au maximum**, sur des périmètres de
   fichiers **disjoints**. Jamais trois.
3. Vérifier contre la **vraie base** avec un script jetable, afficher le résultat,
   puis supprimer le script.
4. Mettre à jour `docs/REPRISE.md` et rendre compte avant d'ouvrir la vague suivante.

**Secrets** : jamais dans la conversation. Si une clé manque, dire précisément
laquelle et où la trouver ; elle est mise dans `.env` ou chez l'hébergeur par le
propriétaire du projet.

### Vagues

| Vague | Contenu | État |
|---|---|---|
| 0 | Structure, schéma de base, `/health` | livrée |
| 1 | Auth (inscription, connexion, session, statut ACTIF/SUSPENDU) | à ouvrir |
| 2 | CRUD ventes + dépenses | |
| 3 | Moteur KPI + dashboard | |
| 4 | Moteur de questions intelligentes | |
| 5 | Admin plateforme | |
| 6 | Finition UI, déploiement | |
