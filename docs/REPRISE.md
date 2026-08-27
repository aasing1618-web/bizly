# Reprise — où en est Bizly

> Mis à jour à la fin de chaque vague. À lire en premier quand on reprend le
> projet après une pause, avant `CLAUDE.md`.

**Dernière mise à jour : 26 août 2026 — fin de la Vague 0.**

---

## État en une phrase

Le socle technique tient debout, est testé, et le schéma a été exécuté sur un
vrai Postgres ; il reste à l'appliquer **sur l'instance Supabase du projet** —
il manque `DATABASE_URL`.

---

## Vague 0 — livrée

| Livrable | Où | État |
|---|---|---|
| Constitution du projet | `CLAUDE.md` | écrite (reconstruite : le fichier était vide) |
| Règles pour les agents | `AGENTS.md` | écrites |
| Spécification du moteur | `docs/MOTEUR-ANALYTICS.md` | écrite, **7 décisions en attente** (§9) |
| Contrat d'API | `docs/API-CONTRACT.md` | Vague 0 fait, Vague 1 proposé |
| Structure npm workspaces | racine, `shared/`, `server/`, `web/`, `admin/` | en place |
| Schéma de base | `db/migrations/0001_init.sql`, `0002_referentiels.sql` | écrit, **exécuté et vérifié sur Postgres 18**, pas encore sur Supabase |
| Lanceur de migrations | `server/src/scripts/migrate.ts` | écrit, **non exécuté** (attend `DATABASE_URL`) |
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
| Migrations exécutées sur un Postgres réel (PGlite 18.3, script jetable) | **25 vérifications OK, 0 échec** — isolation inter-entreprises refusée par la base, unicité d'email insensible à la casse, fuseau invalide rejeté, cascade complète, **cas E du §8 exact au centime** (CA 30000, 2 ventes, bénéfice 25000) |

Le script de vérification a été supprimé après affichage, conformément à
`AGENTS.md` §4.

**Réserve :** PGlite embarque PostgreSQL 18 ; Supabase tourne en 15 ou 17. Le
seul point sensible est `CREATE OR REPLACE TRIGGER`, qui exige **PostgreSQL 14
minimum** — vrai pour tout projet Supabase actuel, mais à confirmer au premier
`npm run migrate`.

---

## Ce qui bloque

### 1. `DATABASE_URL` manque *(bloquant)*

Sans elle, impossible d'appliquer les migrations et donc de vérifier le schéma
contre la vraie base.

**À faire :** copier `.env.example` en `.env`, remplir `DATABASE_URL` avec la
chaîne du **pooler Supabase, port 6543**
(Dashboard Supabase → projet → *Connect* → *Transaction pooler*).

Rien d'autre n'est requis pour l'instant : ni clé d'API IA, ni clé de service
Supabase, ni service d'e-mail.

### 2. Décisions métier en attente

Détail et impact dans `docs/MOTEUR-ANALYTICS.md` §9. Les trois qui coûtent cher
si on les découvre tard :

- **TVA : HT ou TTC ?** — hypothèse actuelle : tout TTC, pas de TVA.
  À trancher **avant la Vague 2**, ça change le schéma.
- **Encaissé ou facturé ?** — hypothèse actuelle : trésorerie, pas d'impayés.
- **Contenu des questions intelligentes** — la mécanique est spécifiée, le
  contenu métier est vide. C'est le cœur de valeur du produit.

### 3. Cas de référence chiffrés

Huit cas synthétiques sont déjà en test (`server/src/domaine/montant.test.ts`).
Il manque **3 à 5 cas issus du métier réel** — voir le formulaire en fin de
`docs/MOTEUR-ANALYTICS.md` §8.

---

## Prochaine vague

**Vague 1 — authentification.** Contrat proposé dans `docs/API-CONTRACT.md` §2,
**à relire avant de lancer le moindre agent**. Deux points y attendent une
décision : inscription ouverte ou sur invitation, et absence de « mot de passe
oublié » tant qu'aucun service d'e-mail n'est choisi.

---

## Comment relancer le projet

```bash
npm install
cp .env.example .env          # puis remplir DATABASE_URL
npm run migrate:statut        # doit lister 2 migrations en attente
npm run migrate
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
