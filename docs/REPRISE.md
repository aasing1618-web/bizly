# Reprise — où en est Bizly

> Mis à jour à la fin de chaque vague. À lire en premier quand on reprend le
> projet après une pause, avant `CLAUDE.md`.

**Dernière mise à jour : 27 août 2026 — Vague 2 (ventes et dépenses) livrée.**

---

## État en une phrase

Vagues 0, 1 et 2 **terminées et vérifiées contre la vraie base Supabase**
(PostgreSQL 17.6, `eu-central-1`, TLS authentifié). **149 tests automatisés** au
vert, et 51 vérifications de bout en bout sur l'instance réelle pour la seule
Vague 2. Un client peut créer son compte, saisir ses ventes et ses dépenses.
La Vague 3 (moteur de KPI) peut s'ouvrir — il lui manque les cas de référence
métier.

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

## Prochaine vague

**Vague 3 — moteur de KPI et tableau de bord.** Toutes les formules sont déjà
spécifiées dans `docs/MOTEUR-ANALYTICS.md` §5, et l'arithmétique de base
(`divArrondi`, `moyenne`, `pourcent`, `repartirEnDixiemes`) est écrite et testée
depuis la Vague 0.

Il manque **les cas de référence issus du métier réel** — formulaire en fin de
`MOTEUR-ANALYTICS.md` §8. Huit cas synthétiques couvrent déjà les arrondis et
les fuseaux ; les cas venant du terrain sont ce qui prouvera que le moteur
calcule ce qu'un commerçant attend.

---

## Comment relancer le projet

```bash
npm install
cp .env.example .env          # puis remplir DATABASE_URL (pooler, port 6543)
npm run migrate:statut        # doit afficher 2 migrations appliquees
npm run build
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
