# Reprise — où en est Bizly

> Mis à jour à la fin de chaque vague. À lire en premier quand on reprend le
> projet après une pause, avant `CLAUDE.md`.

**Dernière mise à jour : 27 août 2026 — Vague 1 (authentification) codée et testée.**

---

## État en une phrase

Vagues 0 et 1 **terminées et vérifiées contre la vraie base Supabase**
(PostgreSQL 17.6, `eu-central-1`, TLS authentifié). 89 tests automatisés au
vert, 50 vérifications de bout en bout sur l'instance réelle. La Vague 2
(saisie des ventes et dépenses) peut s'ouvrir.

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

## Prochaine vague

**Vague 2 — saisie des ventes et des dépenses.** Le contrat s'écrit dans
`docs/API-CONTRACT.md` §3 avant la première ligne de code. Rappel du §9 de
`docs/MOTEUR-ANALYTICS.md` : montants **TTC**, comptabilité de **trésorerie**,
pas d'impayés — ces trois choix conditionnent la forme des écrans de saisie.

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
