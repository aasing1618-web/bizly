# Déploiement

> Comment mettre Bizly en ligne, et ce que l'hébergeur choisi change au
> comportement du produit.

---

## 1. Le point d'architecture à connaître avant de choisir

`CLAUDE.md` §7 fige **« un seul processus Node/Express »**. Vercel n'exécute pas
un processus : il exécute une **fonction sans état**, instanciée autant de fois
qu'il le faut, détruite quand le trafic retombe.

Ce que ça change réellement, dans l'ordre d'importance :

| Point | Conséquence | Traité |
|---|---|---|
| Limitation de débit | Un compteur en mémoire redémarre à chaque instance : la défense contre la force brute de la connexion **n'existe plus** | ✅ déplacée en base — `db/migrations/0005_limites_debit.sql` |
| Connexions Postgres | Chaque instance ouvre les siennes | ✅ pooler Supabase en mode transaction + `DATABASE_POOL_MAX=1` |
| Démarrage à froid | Première requête après une accalmie : ~1 s | assumé au MVP |
| Fichiers lus au démarrage | Le certificat TLS et les bundles ne sont pas tracés par le compilateur | ✅ `includeFiles` dans `vercel.json`, et `DATABASE_CA_CERT` accepte aussi le PEM collé |
| Arrêt propre | `SIGTERM` n'est pas reçu | sans objet : rien à fermer entre deux requêtes |

**Une alternative existe** et demanderait zéro ligne de code : un hébergeur à
processus long (Railway, Render, Fly.io, un conteneur). `npm start` y suffit, et
l'architecture du §7 est respectée à la lettre. Vercel reste un choix
raisonnable — le déploiement est plus simple, le CDN est inclus — à condition
que la limitation partagée ci-dessus soit en place. **Elle l'est.**

---

## 2. Ce que le dépôt contient déjà

| Fichier | Rôle |
|---|---|
| `vercel.json` | commande de construction, région, réécritures, fichiers à embarquer |
| `api/index.js` | la fonction — deux lignes, qui réexportent le vrai point d'entrée |
| `server/src/vercel.ts` | point d'entrée sans état : pas de `listen()`, pas d'arrêt propre |

La région est **`fra1`** (Francfort), au plus près de la base Supabase en
`eu-central-1`. Une base à un océan de distance ajouterait 150 ms à chaque
requête.

---

## 3. Mise en ligne, pas à pas

### 3.1 Pousser le dépôt

```bash
git remote add origin git@github.com:<compte>/bizly.git   # ou l'URL HTTPS
git push -u origin main
```

Le dépôt peut rester **privé** : Vercel s'y connecte sans difficulté.

### 3.2 Créer le projet Vercel

1. [vercel.com/new](https://vercel.com/new) → importer le dépôt.
2. **Ne rien changer** aux réglages de construction : `vercel.json` les impose.
3. Avant de déployer, ouvrir **Environment Variables**.

### 3.3 Les variables d'environnement

À saisir dans le panneau Vercel, **jamais dans un fichier commité**
(`CLAUDE.md` §11). Un secret collé ailleurs que là est un secret à révoquer.

| Variable | Valeur | Où la trouver |
|---|---|---|
| `DATABASE_URL` | la chaîne du **pooler**, port **6543** | Supabase → Connect → Connection string → *Transaction pooler* |
| `DATABASE_POOL_MAX` | `1` | — |
| `DATABASE_SSL` | `require` | — |
| `DATABASE_CA_CERT` | `db/supabase-root-2021-ca.crt` | déjà dans le dépôt |

`NODE_ENV=production` est posé automatiquement par Vercel. C'est lui qui active
le cookie `Secure` et la confiance au premier proxy — ne pas le surcharger.

> Port 6543, pas 5432. Le port 5432 est la connexion directe : elle ne supporte
> pas le va-et-vient d'un hébergeur sans état et sature en quelques minutes.

### 3.4 Les migrations

Elles **ne s'appliquent pas au déploiement**, volontairement : un déploiement ne
doit jamais modifier le schéma sans qu'on l'ait décidé. Depuis un poste, avec le
`.env` local pointant sur la base de production :

```bash
npm run migrate:statut    # ce qui est appliqué, ce qui attend
npm run migrate           # applique ce qui manque
```

### 3.5 Le premier administrateur

```bash
npm run admin:creer
```

Le mot de passe est saisi masqué, jamais passé en argument — un argument
atterrit dans l'historique du shell et dans la liste des processus.

### 3.6 Vérifier le déploiement

```bash
curl https://<projet>.vercel.app/api/health
```

Attendu : `{"statut":"ok", ...,"base":{"statut":"ok","latence_ms":<n>}}`.

Si `base.statut` vaut `erreur`, la réponse reste un `503` propre : c'est
`DATABASE_URL` ou `DATABASE_CA_CERT` qu'il faut regarder, dans cet ordre.

Puis, dans un navigateur : `/` pour l'application, `/admin/` pour la console.

---

## 4. Ce qui reste à faire avant d'ouvrir à de vrais clients

Par ordre d'urgence :

1. **Base de test séparée de la production** (`CLAUDE.md` §9). Les vérifications
   de fin de vague tournent contre la base réelle, nettoyées à chaque fois. Avec
   de vraies données, ce n'est plus acceptable.
2. **RLS Postgres** (`CLAUDE.md` §9). L'isolation repose aujourd'hui sur le
   filtrage applicatif **et** des clés étrangères composites que la base fait
   respecter. Une requête qui oublierait son `WHERE entreprise_id` lirait tout.
3. **Mot de passe oublié.** Aucun service d'e-mail n'est choisi ; en attendant,
   la réinitialisation se fait depuis `/admin/`, et l'écran de connexion le dit
   plutôt que d'afficher un lien mort.
4. **Sauvegardes.** Supabase en fait, leur fréquence dépend du plan : à vérifier
   avant d'avoir des données que l'on ne peut pas perdre.

---

## 5. Optimisation possible, plus tard

Aujourd'hui la fonction sert aussi les fichiers statiques de l'application
cliente. C'est simple, fidèle au « processus unique » du §7, et sans conséquence
tant que le trafic est faible — les fichiers sont marqués immuables et le
navigateur ne les redemande pas.

Le jour où le volume le justifie : publier les bundles comme fichiers statiques
sur le CDN et ne router que `/api/*` vers la fonction. Cela demande d'assembler
un dossier de sortie à la racine et d'écrire les réécritures à la main. **À ne
faire que si une mesure le justifie**, pas par principe.
