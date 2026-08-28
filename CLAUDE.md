# CLAUDE.md — Bizly AI

> Ce fichier fait foi sur toute décision produit. En cas d'ambiguïté, il l'emporte
> sur l'interprétation d'un agent. Les règles de travail (comment coder, pièges à
> éviter, gestion des identifiants) sont dans `AGENTS.md`. L'état de la session en
> cours est dans `docs/REPRISE.md`.

<!--
  NOTE DE TRANSCRIPTION — 28 août 2026
  Ce fichier a été transmis par le propriétaire du projet et recopié fidèlement.
  Quelques termes techniques arrivaient manifestement altérés par la copie ; ils
  ont été rétablis, et la liste complète est donnée pour contrôle :

    « Nœud 22 »        → Node 22
    « Réaction 19 »    → React 19
    « Vent arrière »   → Tailwind
    « Très virulent »  → Vitest
    « pay, recese »    → pays, devise          (§3, ligne Entreprise)
    « Intégration »    → Onboarding            (§8, liste des écrans)
    « inventions »     → devises               (§16)
    « Petite et exploitante » → petite exploitation  (§2)
    « Affaires »       → Business              (§12, nom du plan)

  Aucune règle, aucun chiffre, aucune formule n'a été modifié. Les divergences
  entre ce document et le code construit sont recensées dans docs/ECARTS-SPEC.md.
-->

## 1. Vision

Bizly AI est un SaaS de gestion et d'analyse pour petites entreprises,
indépendants, commerçants et prestataires de services.
Promesse : **« Comprenez votre entreprise en quelques secondes. »**

L'utilisateur saisit un minimum de données (ventes, dépenses, clients, produits)
et obtient automatiquement un dashboard clair, des indicateurs financiers et des
réponses à des questions utiles sur son activité.

**Règle fondamentale du produit** : les calculs sont faits par l'application à
partir de données structurées. L'IA (couche d'interprétation) reformule et
explique, **elle n'invente jamais un chiffre**.

Ce que Bizly AI n'est pas, volontairement, dans cette version : un logiciel
comptable complet, un ERP, un CRM avancé.

## 2. Cible

| Segment | Exemples | Besoin principal |
|---|---|---|
| Commerce | boutique, revendeur, e-commerce | ventes, produits, bénéfice |
| Services | consultant, agence, indépendant | clients, prestations, revenus |
| Restauration | restaurant, traiteur, restauration rapide | ventes et produits |
| BTP / technique | artisan, petite entreprise | revenus et dépenses |
| Agriculture | petite exploitation | recettes et coûts |
| Autres | transport, formation, photographie… | performance générale |

Produit **horizontal et international** : le modèle de données doit supporter
plusieurs devises, langues et secteurs sans dupliquer l'application.

## 3. Périmètre exact du MVP

| Module | Fonctionnalités MVP | Statut |
|---|---|---|
| Entreprise | nom, secteur, pays, devise | indispensable |
| Tableau de bord | CA, dépenses, bénéfice, ventes, clients, graphiques | indispensable |
| Ventes | ajouter / modifier / supprimer | indispensable |
| Dépenses | ajouter / modifier / supprimer | indispensable |
| Clients | ajouter / modifier / supprimer | indispensable |
| Produits/Services | nom, prix, coût, catégorie | indispensable |
| Analyses | questions prédéfinies + réponses calculées | indispensable |

**Hors périmètre du MVP** (ne pas construire avant validation, voir §12) :
importation Excel, facturation, gestion de stock, équipes/multi-utilisateurs,
intégrations tierces, paiement en ligne.

## 4. Modèle de données

Chaque table métier (sauf `users`) est reliée à `business_id`. Aucune exception :
une donnée sans entreprise associée est un bug.

```
users            id, email, password_hash, created_at

businesses       id, owner_user_id, name, sector, country, currency,
                 plan (free|pro|business), status (ACTIF|SUSPENDU), created_at

products         id, business_id, name, category, price, cost (nullable),
                 active (bool)

customers        id, business_id, name, phone (nullable), email (nullable),
                 notes (nullable), created_at

sales            id, business_id, date, product_id, quantity, unit_price,
                 total_amount, customer_id (nullable), payment_method (nullable)

expenses         id, business_id, date, category, amount, description,
                 payment_method (nullable)

analysis_questions   id, key, category, sector (nullable = tous), label

analysis_results     id, business_id, question_key, period,
                     computed_value_json, computed_at   (historique, facultatif)
```

Champs facultatifs = **ne bloquent jamais l'enregistrement** (principe UX, §8).

## 5. Tableau de bord — indicateurs et formules exactes

Ces formules sont la référence. **Un agent qui les change doit le signaler
explicitement, jamais les réinterpréter en silence.**

| Indicateur | Formule | Note |
|---|---|---|
| Chiffre d'affaires (CA) | Σ `sales.total_amount` sur la période | toutes ventes, tout moyen de paiement |
| Dépenses | Σ `expenses.amount` sur la période | |
| Bénéfice estimé | CA − Dépenses | ne soustrait pas le coût produit (c'est la marge, distincte) |
| Nombre de ventes | `COUNT(sales)` sur la période | |
| Nombre de clients | `COUNT(clients)` total | pas limité à la période, sauf demande explicite |
| Panier moyen | CA / nombre de ventes | 0 si aucune vente, jamais une division par zéro qui plante |
| Évolution | (période actuelle − période précédente) / période précédente | période précédente = même durée, immédiatement avant |
| Marge par produit | (prix − coût) / prix | si `cost` est null → marge = null, ne jamais afficher 100 % par défaut |

Périodes disponibles : aujourd'hui, 7 jours, mois, trimestre, année,
personnalisée.

**Cas de référence à écrire avant de coder le moteur** (voir `AGENTS.md` — un
moteur sans cas de référence chiffré n'est pas vérifiable) : je fournirai 3 à 5
jeux de ventes/dépenses avec le résultat attendu pour chaque indicateur ci-dessus.

## 6. Moteur de questions intelligentes

**Principe : des questions préconstruites, pas un champ de texte libre vers une
IA.** Chaque question correspond à un calcul défini, pas à une interprétation
libre du modèle.

| Catégorie | Questions |
|---|---|
| Finances | Combien ai-je gagné ce mois-ci ? · Quel est mon bénéfice estimé ? · Où est-ce que je dépense le plus ? · Mes dépenses augmentent-elles ? |
| Ventes | Quel est mon produit le plus vendu ? · Quel produit génère le plus de CA ? · Mes ventes progressent-elles ? · Quel est mon panier moyen ? |
| Clients | Qui sont mes meilleurs clients ? · Combien de clients ai-je ? · Quels clients n'ont pas acheté récemment ? |
| Produits | Quel produit est le plus rentable ? · Quels produits se vendent le moins ? · Quelle catégorie génère le plus de revenus ? |

**Personnalisation par secteur** (affichage conditionnel, pas d'application
différente) :

| Secteur | Questions spécifiques |
|---|---|
| Commerce | Quels produits se vendent le plus / le moins ? |
| Restauration | Quel plat se vend le plus ? Quel plat génère le plus de revenus ? |
| Indépendant | Quel client rapporte le plus ? Quelle prestation est la plus rentable ? |
| BTP | Quel projet génère le plus de revenus ? Quelles dépenses sont les plus importantes ? |
| Services | Quelle prestation génère le plus de CA ? Quels clients sont les plus rentables ? |

**Pipeline obligatoire** : question sélectionnée → données identifiées → calcul
en base/backend → résultat structuré → **reformulation optionnelle par l'IA** →
réponse à l'utilisateur. L'IA n'intervient **jamais** avant l'étape de calcul.

## 7. Technique architecturale (décisions figées)

```
              https://bizly.app  (une seule origine)
                        │
     ┌──────────────────▼──────────────────┐
     │     un seul processus Node/Express   │
     │  /api/*    → l'API                   │
     │  /admin/*  → dashboard admin         │
     │  /*        → l'application cliente   │
     └──────────────────┬──────────────────┘
                        │
             ┌──────────┴──────────┐
             ▼                     ▼
      Supabase Postgres      Supabase Storage
       (les données)          (fichiers, futur)
```

**Stack** : Node 22 · Express 5 · TypeScript strict · PostgreSQL (Supabase,
pooler, sans ORM) · React 19 · Vite · Tailwind · Vitest.

Décisions et pourquoi :

1. **Une seule origine.** Nécessaire pour qu'un cookie `SameSite=Strict`
   fonctionne. Deux hébergeurs = deux domaines = l'utilisateur ne reste jamais
   connecté.
2. **Le moteur (KPI + questions intelligentes) s'exécute côté serveur
   uniquement.** C'est le savoir-faire du produit ; il ne descend jamais dans le
   navigateur.
3. **Pas d'ORM.** SQL écrit à la main, migrations numérotées. Modèle à 8 tables :
   un ORM ajoute une couche à déboguer pour un gain nul.
4. **Aucun paiement en ligne dans le MVP.** Le champ `plan` est changé à la main
   par l'admin. Supprime toute une famille de bugs et d'obligations légales avant
   d'avoir des utilisateurs payants réels. Stripe (ou équivalent) est une phase
   ultérieure (§12), pas un prérequis du MVP.
5. **IA (Gemini ou équivalent) = couche d'explication uniquement**, jamais source
   des chiffres (voir §1 et §6).

## 8. Expérience utilisateur

- Moins de champs, moins de clics, plus de résultats.
- Chaque formulaire est court ; les champs facultatifs ne bloquent jamais
  l'enregistrement.
- Les actions principales sont visibles depuis le dashboard.
- Les graphiques restent simples ; les réponses analytiques sont compréhensibles
  par un non-spécialiste.

**Écrans** : Connexion/Inscription · Onboarding (nom, secteur, devise, premières
données) · Tableau de bord (KPI, graphiques, questions) · Ventes · Dépenses ·
Clients · Produits/Services · Analyses · Paramètres.

## 9. Sécurité

- Isolation par `business_id` stricte ; **RLS Postgres** empêche toute lecture
  croisée.
- Une ressource appartenant à une autre entreprise renvoie **404, jamais 403**
  (ne pas révéler qu'elle existe).
- Les clés API (Supabase, IA) ne sont jamais exposées au navigateur.
- Aucun secret n'est collé dans la conversation avec l'agent — voir `AGENTS.md`.
- **Base de test séparée de la base de production** avant tout test automatisé.

## 10. Méthode par vagues

Ne pas sauter de vague ; chacune est validée avant la suivante.

| Vague | Contenu | Livrable vérifiable |
|---|---|---|
| 0 | Structure du dépôt, schéma de base, `/health` | le serveur tourne, l'app le contacte |
| 1 | Connexion, comptes, ACTIF/SUSPENDU | un compte suspendu est bloqué |
| 2 | Ventes/dépenses/clients/produits + moteur de KPI | le dashboard affiche des chiffres justes (cas de référence §5) |
| 3 | Moteur de questions intelligentes + explication IA optionnelle | une question posée renvoie une réponse calculée, pas inventée |
| 4 | Dashboard admin, personnalisation sectorielle, finitions | c'est présentable |
| 5 | Sécurité, mise en ligne | c'est en ligne et ça tient |

**La vague 2 est celle qui compte le plus** : c'est le moteur, et c'est le
produit. Le reste est de l'infrastructure standard.

## 11. Identifiants et services externes — comment procéder

Cette règle s'applique à toute intégration externe (Supabase, IA, hébergeur,
Storage) :

1. L'agent identifie précisément **quel identifiant est nécessaire** (nom exact
   de la variable, ex. `SUPABASE_SERVICE_ROLE_KEY`).
2. Il indique **où le trouver/générer** (ex. « Supabase → Project Settings → API »).
3. Il me le demande directement, sans que j'aie à deviner quoi que ce soit.
4. La valeur est placée directement dans `.env` (local) ou dans le panneau
   d'environnement de l'hébergeur (production) — **jamais collée dans la
   conversation** (un secret collé au chat est un secret à révoquer).
5. L'agent fait ensuite **100 % du travail d'intégration** (client, migrations,
   configuration) sans que j'aie à écrire une ligne de code.

Identifiants attendus pour ce projet (à demander au moment où ils deviennent
nécessaires, pas tous d'un coup) :

| Variable | Où la trouver |
|---|---|
| `SUPABASE_URL` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` (secrète) | Supabase → Project Settings → API |
| `SUPABASE_DB_URL` | Supabase → Project Settings → Database → Connection pooling (port 6543, pas 5432) |
| `GEMINI_API_KEY` (ou autre IA choisie) | Google AI Studio (ou équivalent) |
| `JWT_SECRET` | généré par l'hébergeur au déploiement, jamais choisi à la main |
| variables spécifiques à l'hébergeur | selon la plateforme retenue |

## 12. Modèle économique (rappel MVP)

| Plan | Contenu indicatif | Objectif |
|---|---|---|
| Free | données limitées, analyses limitées | découverte |
| Pro | données étendues, historique complet | monétisation principale |
| Business | équipe, fonctionnalités avancées | PME |

MVP : le plan est un **champ manuel**, pas de paiement en ligne (§7.4). Prix à
valider avec de vrais utilisateurs.

## 13. Feuille de route après le MVP

1. **Validation** — premiers utilisateurs, corrections UX.
2. **IA avancée** — explications Gemini, détection de tendances.
3. **Import Excel** — mapping intelligent de colonnes.
4. **Automatisation** — rapports périodiques, alertes.
5. **Expansion** — facturation, paiement en ligne, stock léger, équipes,
   intégrations.

## 14. Indicateurs de succès

Entreprises inscrites · % d'utilisateurs ayant ajouté ≥ 1 vente · ventes moyennes
par entreprise · sessions par utilisateur · questions analytiques les plus
utilisées · conversion Free → Pro · rétention mensuelle · MRR.

## 15. Risques à éviter

- Ajouter des fonctionnalités avant d'avoir des utilisateurs réels.
- Dériver vers un ERP complexe.
- **Laisser l'IA calculer un chiffre financier** (elle explique, jamais elle ne
  calcule).
- Construire l'import Excel ou la facturation avant validation du MVP.
- Multiplier secteurs et règles métier trop tôt.
- Négliger la simplicité de l'interface.
- Ne pas tester avec de vrais entrepreneurs.

## 16. Principes directeurs

**Simple** — compréhensible immédiatement. **Rapide** — ajouter une
vente/dépense en quelques secondes. **Fiable** — les chiffres viennent du
système, jamais de l'IA. **Actionnable** — chaque analyse aide à décider.
**Évolutif** — la structure permet d'ajouter Excel, IA avancée, intégrations plus
tard. **International** — devises, langues et secteurs multiples dès la
conception du modèle de données.
