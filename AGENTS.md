# AGENTS.md — règles d'exécution

Ce fichier s'applique à **tout agent** (Claude Code, sous-agent, autre outil) qui touche
au dépôt Bizly. `CLAUDE.md` dit *ce qu'on construit* ; ce fichier dit *comment on
travaille*. En cas de contradiction, `CLAUDE.md` gagne.

---

## 1. Avant d'écrire une ligne de code

1. Lire `CLAUDE.md`, puis `docs/REPRISE.md` (où on en est), puis
   `docs/API-CONTRACT.md` (ce qui est déjà promis).
2. Si la tâche touche un calcul métier : lire `docs/MOTEUR-ANALYTICS.md`. Aucune formule
   ne s'invente dans le code — elle est d'abord écrite dans ce document.
3. Si la spec est ambiguë : **le signaler, ne pas trancher seul**. Une ambiguïté tranchée
   en silence coûte plus cher qu'une question.

## 2. Parallélisme

- **Deux agents en parallèle au maximum. Jamais trois.**
- Les deux agents doivent avoir des **périmètres de fichiers disjoints**, écrits
  explicitement dans leur brief (liste de chemins autorisés en écriture).
- Un agent qui a besoin d'écrire hors de son périmètre s'arrête et le signale.
- Fichiers partagés par nature (`db/migrations/*`, `shared/src/*`, `docs/*`,
  `package.json`) : **un seul agent à la fois**, jamais en parallèle.

## 3. Base de données

- Les migrations sont **append-only** : on ne modifie jamais un fichier de migration déjà
  appliqué, on en ajoute un nouveau.
- Numérotation `NNNN_description.sql`, 4 chiffres, ordre d'application = ordre numérique.
- Chaque migration est **idempotente si possible** (`IF NOT EXISTS`) et tourne dans une
  transaction.
- Aucun ORM. SQL à la main, **toujours paramétré** (`$1`, `$2`…).
- Toute requête métier filtre sur `entreprise_id`. Une requête métier sans
  `entreprise_id` dans son `WHERE` est un bug de sécurité, pas un oubli de style.

## 4. Vérification

Une vague n'est pas terminée tant que ces quatre points ne sont pas vrais :

1. `npm run typecheck` passe sans erreur.
2. `npm test` passe.
3. Un **script jetable** a vérifié le comportement contre la **vraie base** ; son
   résultat a été affiché, puis le script supprimé.
4. `docs/REPRISE.md` est à jour.

« Ça devrait marcher » n'est pas une vérification. Un test qui n'a pas tourné n'existe pas.

## 5. Secrets

- **Jamais** de secret dans la conversation, dans un commit, dans un log, dans un
  message d'erreur.
- Un agent qui a besoin d'une clé dit **exactement laquelle** et **où la trouver**
  (nom de la variable, service, page du dashboard). Le propriétaire la met dans `.env`.
- `.env` est ignoré par git. `.env.example` liste les clés, jamais les valeurs.
- Ne jamais afficher le contenu de `.env`, même partiellement, même « pour vérifier ».
  Pour vérifier, tester la connexion, pas afficher la chaîne.

## 6. Style de modification

- **Chirurgical** : modifier ce qui est demandé, rien d'autre. Ne pas réécrire un fichier
  entier pour changer trois lignes.
- Ne pas casser l'existant pour ajouter du neuf. Si une modification impose de toucher
  à une fonctionnalité livrée, le dire avant.
- Pas de hack temporaire quand une solution propre existe.
- Pas de code mort, pas de `TODO` décoratif, pas de `console.log` de debug, pas de
  fichier temporaire dans le résultat final.
- Réutiliser ce qui existe (helpers, composants, types de `shared/`) plutôt que dupliquer.

## 7. Rendre compte

À la fin d'une tâche, un agent rend : ce qui a été fait, ce qui a été **vérifié et
comment**, ce qui reste ouvert, et les décisions prises faute de spec. Pas de résumé
optimiste : si un test échoue, on le dit avec sa sortie.
