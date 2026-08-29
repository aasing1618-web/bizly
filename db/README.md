# Base de données

PostgreSQL managé par Supabase, accédé **via le pooler, port 6543** (mode
transaction), **sans ORM**.

## Commandes

```bash
npm run migrate          # applique les migrations manquantes
npm run migrate:statut   # affiche l'état, ne modifie rien
```

Le suivi est stocké dans la table `_migrations` (nom, empreinte SHA-256, date,
durée).

## Règles

1. **Append-only.** Une migration appliquée ne se modifie jamais. Le lanceur
   compare l'empreinte du fichier à celle enregistrée en base et **refuse de
   continuer** en cas d'écart : sans ce garde-fou, deux environnements peuvent
   avoir un schéma différent en croyant être à jour.
2. **Numérotation `NNNN_description.sql`**, quatre chiffres. L'ordre
   d'application est l'ordre alphabétique, qui coïncide avec l'ordre numérique.
3. **Une transaction par migration.** Elle passe entièrement ou pas du tout.
4. **Idempotence quand c'est possible** (`IF NOT EXISTS`, `ON CONFLICT DO
   NOTHING`) : utile en cas de reprise après incident.

## Limites du pooler en mode transaction

Le port 6543 ne conserve **aucun état de session** entre deux requêtes. Ces
limites sont structurelles :

| Interdit | À utiliser à la place |
|---|---|
| Requêtes préparées **nommées** (option `name` de node-postgres) | requêtes paramétrées classiques (`$1`, `$2`) — c'est le comportement par défaut |
| `LISTEN` / `NOTIFY` | interrogation périodique, ou file de tâches en table |
| `SET` au niveau session | `SET LOCAL` dans une transaction |
| `pg_advisory_lock` (session) | `pg_advisory_xact_lock` (transaction) |
| Curseurs persistants entre requêtes | pagination par `LIMIT` / `OFFSET` ou par curseur applicatif |

Ces règles sont rappelées dans le code : `server/src/db/options.ts`,
constante `LIMITES_POOLER_TRANSACTION`.

## Conventions de schéma

- Identifiants : `uuid` généré par la base (`gen_random_uuid()`).
- Argent : `BIGINT` en unité mineure, colonnes suffixées **`_mineur`**.
  Jamais de `float`, jamais de type `money`.
- Temps : `timestamptz` en UTC ; le fuseau vit sur `entreprises.fuseau`.
- Suppression : soft delete via `supprime_le`, pour ne pas trouer l'historique
  des KPI.
- Multi-tenant : `entreprise_id NOT NULL` partout, **plus** des clés étrangères
  **composites** (`(client_id, entreprise_id) → clients(id, entreprise_id)`).
  Une erreur applicative ne peut donc pas rattacher une vente au client d'une
  autre entreprise : la base refuse.
- Énumérations : `TEXT` + `CHECK`, et non type `ENUM` — ajouter une valeur à un
  `ENUM` Postgres est une opération lourde, mal supportée par les migrations
  transactionnelles.

## Migrations

| Fichier | Contenu |
|---|---|
| `0001_init.sql` | référentiels, entreprises, utilisateurs, sessions, admins, compteurs, clients, catégories, ventes, lignes de vente, dépenses |
| `0002_referentiels.sql` | données de référence : 10 devises, 9 secteurs, 20 modèles de catégorie de dépense |
| `0003_catalogue.sql` | table `produits` (prix, coût nullable, catégorie), `lignes_vente.produit_id` et sa clé étrangère composite |
| `0004_pays_plan_devises.sql` | `entreprises.pays` et `entreprises.plan` (`CLAUDE.md` §4), index de la console d'administration, 10 devises supplémentaires |
