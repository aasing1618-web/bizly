AGENTS.md — Règles de travail (Bizly AI)

CLAUDE.md fait loi sur le produit. Ce fichier fait loi sur la manière de travailler. tient l’état de la session. Lire les trois, dans cet ordre, en Début de session.docs/REPRISE.md

1. Avant de coder quoi que ce soit
Lire (où on en est, ce qui bloque, l’ordre de reprise).docs/REPRISE.md
Lire (le produit).CLAUDE.md
Lire ce fichier.
Lire le contrat d’API de la vague en cours (), s’il existe.docs/CONTRAT-VAGUE-N.md

Un contrat d’API tient en une page : routes, forme des erreurs, codes de retour, et les décisions qui se discutent (ex. « une ressource appartenant à une autre entreprise renvoie 404, jamais 403 »). Il est écrit avant de lancer le moindre agent — c’est ce qui permet à deux agents de travailler en parallèle sans se contredire : ils obéissent au même document, ils ne négocient pas entre eux.

2. Rythme de travail
1. Lire docs/REPRISE.md
2. Écrire le contrat de la vague (si pas déjà fait)
3. Lancer au maximum 2 agents, sur des périmètres de fichiers disjoints
4. Relire leur travail : git diff, puis les tests
5. Vérifier contre la vraie base avec un script jetable (affiche le résultat AVANT de se supprimer)
6. Commit avec un message qui explique POURQUOI, pas seulement quoi
7. Mettre à jour docs/REPRISE.md
8. Push

Jamais 3 agents en parallèle. Un agent coupé par une limite d’usage laisse un travail presque complet mais non testé — il faut alors relire tout son périmètre avant de relancer quoi que ce soit. Deux agents sur des périmètres disjoints est le maximum Louer.

Un objectif par message. Trois demandes dans un message donnent trois travaux à moitié faits.

3. Identifiants et secrets
Ne jamais coller un secret dans la conversation. Un secret collé au chat est un secret à révoquer, point final.
Quand un identifiant est nécessaire, l’agent dit précisément lequel et où le trouver/générer, puis attend qu’il soit placé dans (local) ou dans le panneau d’environnement de l’hébergeur (production)..env
Voir §11 pour la liste des identifiants attendus sur ce projet et où les trouver.CLAUDE.md
L’agent fait tout le travail d’intégration (client, migrations, config) ; l’humain ne fournit que la valeur, jamais le code.
4. Interdits produit
Ne jamais exécuter le moteur de calcul (KPI, questions intelligentes) côté navigateur.
Ne jamais laisser l’IA produire un chiffre financier — elle reformule un résultat déjà calculé, elle ne calcule pas (voir §1 et §6).CLAUDE.md
Ne jamais afficher une donnée d’une autre entreprise ; toute violation d’isolation est un défaut bloquant, pas un détail.
Ne pas construire l’import Excel, la facturation ou une intégration tierce avant que le MVP soit validé (voir §3 et §13).CLAUDE.md
Une erreur « ressource étrangère » est un 404 identique en forme aux autres 404 — ne jamais laisser une erreur trahir l’existence d’une route admin ou d’une ressource.
5. Catalogue des pièges (prouvés sur un projet précédent, valables ici)
⭐ Serveur de développement oublié (le plus coûteux)

Symptôme : une vérification déclare bon un travail qui ne marche pas, ou échoue sur du code déjà corrigé. Cause : un lancé plus tôt occupe encore le port et sert du vieux code. Correctif : avant toute mesure, vérifier le port et tuer ce qui traîne.npm run dev

NODE_ENV=production supprime les outils de compilation

Symptôme : le déploiement échoue sur . Cause : l’hébergeur applique pendant la compilation aussi, donc ignore les (TypeScript, Vite en font partie). Correctif : explicite dans le script de build, plus un contrôle final que les des artefacts existants.tsc: not foundNODE_ENV=productionnpm installdevDependenciesnpm ci --include=dev

Mauvaise chaîne de connexion Supabase

Symptôme : le serveur démarre, répond en mode dégradé, ne se connecte jamais. Cause : la connexion directe (port 5432) est IPv6 uniquement. Correctif : toujours le Transaction pooler, port 6543 (Paramètres du projet → → Pooling de connexions).

Le projet Supabase se met en pause

Symptôme : répond « Domaine inexistant ». Cause : l’offre gratuite met le projet en veille après une semaine sans activité. Correctif : le réveiller depuis le tableau de bord (les données sont intactes) et brancher une supervision sur .nslookup/health

Nom de bucket sensible à la casse

Symptôme : « Bucket not found » uniquement en production. Correctif : rendre le nom configurable (), et faire apparaître le nom cherché dans le Message d’erreur.SUPABASE_BUCKET

Les deux clés Supabase ne font pas la même chose
Clé	Utilisation	Peut écrire dans un bucket privé ?
sb_publishable_...	navigateur, soumis à RLS	non
sb_secret_... (service_role)	serveur uniquement	oui

Avec des tables verrouillées par RLS, la clé publiable ne peut rien : le backend a besoin de la clé secrète.

SameSite=Strict raisonne en domaine, pas en adresse

Symptôme : en production, déconnexion à chaque rechargement ; introuvable en local. Cause : interface et API sur deux domaines différents (ex. et ). Correctif : une seule origine (voir §7), ou un vrai domaine avec deux sous-domaines.vercel.apponrender.comCLAUDE.md

Les tests qui écrivent dans le stockage de production

Cause : lancer les tests avec les identifiants de production. Correctif : un commutateur sûr par défaut — on ne parle au stockage distant que si ou sur demande explicite ; Sinon, disque local.NODE_ENV=production

Détails d’outillage qui font perdre une heure
Symptôme	Cause	Correctif
Permission denied sur un script chez l’hébergeur	fichier en mode 644	git update-index --chmod=+x script.sh
CORS refuse tout	CORS_ORIGINS="*" avec des cookies	un navigateur refuse quand *credentials: true
Heredoc cassé en PowerShell	Apostrophes françaises	passer par un fichier de message
grep qui ne finit jamais	Fichier énorme	cibler le fichier, pas le dossier
Variables invisibles dans .env	collées en texte libre	Format strict CLE=valeur
6. Deux choses qu’aucun test ne remplace
Regarder les écrans. Une suite de tests prouve qu’une fonction renvoie la bonne valeur, jamais qu’un bouton est illisible ou qu’un écran saute au chargement.
Vérifier les chiffres à l’œil sur un cas réel, en comparant au cas de référence défini dans §5 — un moteur de KPI sans cas de référence chiffré n’est pas vérifiable.CLAUDE.md
7. Formuler une demande sans perdre de temps ni de tokens

À faire :

Donner le symptôme exact (le message d’erreur, les dernières lignes du journal), pas une interprétation.
Dire ce qui a changé depuis la dernière fois (« j’ai créé le bucket, j’ai mis les clés ») pour éviter une re-vérification complète inutile.
Répondre tout de suite aux questions bloquantes posées par l’agent.

À éviter :

Coller un secret dans la conversation (voir §3).
Demander une refonte visuelle pendant qu’une panne bloque le produit — les deux se font, mais dans l’ordre.
Laisser tourner un serveur de développement oublié (voir §5).