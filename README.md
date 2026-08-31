# Bizly AI

> **« Comprenez votre entreprise en quelques secondes. »**

SaaS de gestion et d'analyse pour petites entreprises, indépendants, commerçants
et prestataires de services. L'utilisateur saisit un minimum de données —
ventes, dépenses, clients, produits — et obtient un tableau de bord clair, des
indicateurs financiers justes et des réponses à quatorze questions utiles sur
son activité.

**Règle fondamentale** : les calculs sont faits par l'application à partir de
données structurées. La couche d'explication reformule et explique, **elle
n'invente jamais un chiffre**.

---

## Démarrer

```bash
npm install
cp .env.example .env       # puis remplir DATABASE_URL (pooler Supabase, port 6543)
npm run migrate            # applique les migrations manquantes
npm run build
npm run admin:creer        # une seule fois : ouvre l'accès à /admin/
npm start                  # http://localhost:3000
```

### Gérer les comptes

```bash
npm run comptes -- etat                                   # qui existe, et où il se connecte
npm run comptes -- admin:creer --email=vous@exemple.fr    # accès à /admin/
npm run comptes -- admin:mdp   --email=vous@exemple.fr    # mot de passe admin oublié
npm run comptes -- client:mdp  --email=client@exemple.fr  # mot de passe client oublié
```

Le mot de passe est demandé au clavier sans écho, jamais passé en argument.
Ajouter `--genere` pour en tirer un au sort et l'afficher une seule fois.

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

---

## Architecture

```
              une seule origine
                     │
   ┌─────────────────▼─────────────────┐
   │   un seul processus Node/Express  │
   │  /api/*    → l'API                │
   │  /admin/*  → console interne      │
   │  /*        → l'application        │
   └─────────────────┬─────────────────┘
                     │
              Supabase Postgres
```

**Node 22 · Express 5 · TypeScript strict · PostgreSQL (Supabase, pooler, sans
ORM) · React 19 · Vite · Tailwind · Vitest.**

Quatre espaces de travail npm :

| Dossier | Rôle |
|---|---|
| `shared/` | types et formes de l'API, partagés serveur / clients |
| `server/` | API, moteur de calcul, service des bundles |
| `web/` | application cliente |
| `admin/` | console d'administration, bundle **séparé** |

Cinq décisions figées, et pourquoi :

1. **Une seule origine** — nécessaire pour qu'un cookie de session fonctionne.
   Deux hébergeurs = deux domaines = l'utilisateur ne reste jamais connecté.
2. **Le moteur s'exécute côté serveur uniquement** — c'est le savoir-faire du
   produit, il ne descend jamais dans le navigateur.
3. **Pas d'ORM** — SQL écrit à la main, migrations numérotées. Pour un modèle à
   une quinzaine de tables, un ORM ajoute une couche à déboguer pour un gain nul.
4. **Aucun paiement en ligne** — le champ `plan` est changé à la main depuis
   `/admin/`.
5. **Montants en entiers d'unité mineure**, jamais en flottant. Le nombre de
   décimales est une **donnée** de la devise (EUR 2, XOF 0, TND 3), jamais une
   constante.

---

## Déploiement

Voir **[`docs/DEPLOIEMENT.md`](docs/DEPLOIEMENT.md)**.

Aucun secret ne vit dans le dépôt : `.env` est ignoré par git, et les variables
de production se saisissent dans le panneau de l'hébergeur.

---

## Documentation

| Fichier | Contenu |
|---|---|
| `CLAUDE.md` | la constitution du produit — fait foi sur toute décision |
| `GEMINI.md` | périmètre de l'agent front / design |
| `AGENTS.md` | règles de travail pour les agents |
| `docs/REPRISE.md` | **où en est le projet** — à lire en premier |
| `docs/API-CONTRACT.md` | contrat d'API, section par section |
| `docs/MOTEUR-ANALYTICS.md` | formules, arrondis, périodes, cas de référence |
| `docs/ECARTS-SPEC.md` | divergences relevées et arbitrages en attente |
| `docs/DEPLOIEMENT.md` | mise en ligne |
| `db/README.md` | conventions de schéma et limites du pooler |
