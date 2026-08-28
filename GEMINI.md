# GEMINI.md — Bizly AI

> Quand Claude Code et un agent Gemini travaillent en parallèle, **Gemini prend
> le frontend et le design** (voir `AGENTS.md` §2 pour la répartition complète).
> Ce n'est pas arbitraire : Antigravity pilote un navigateur et prend des
> captures d'écran, donc c'est le seul des deux agents capable de réellement
> **voir** ce qu'il produit — exactement le point qu'aucun test ne remplace
> (`AGENTS.md` §7).

<!--
  NOTE DE TRANSCRIPTION — 28 août 2026
  Fichier transmis par le propriétaire du projet, recopié fidèlement.
  Seule correction : « en cours de cours de route » → « en cours de route ».
  Divergences avec le dépôt réel recensées dans docs/ECARTS-SPEC.md.
-->

## Ce que ça veut dire concrètement

- **Périmètre** : `frontend/` — composants React, Tailwind, mise en page,
  accessibilité, responsive. **Jamais** `backend/`, **jamais** les migrations,
  **jamais** la logique de calcul (`src/engine/`, voir `AGENTS.md` §2 et §5).
- Les **principes UX du §8 de `CLAUDE.md`** sont la référence : moins de champs,
  moins de clics, formulaires courts, champs facultatifs qui ne bloquent jamais
  l'enregistrement, graphiques simples.
- **Boucle de vérification visuelle obligatoire** après chaque vague qui touche
  l'interface : capture d'écran de chaque écran modifié, comparée à l'écran
  attendu (`CLAUDE.md` §8, liste des écrans). C'est la vérification qu'un agent
  texte seul ne peut pas faire — **ne pas la sauter au prétexte que les tests
  passent**.
- Le point de jonction avec le backend est le **contrat d'API écrit avant la
  vague** (`AGENTS.md` §1) : Gemini consomme ce contrat, il ne le négocie pas en
  cours de route avec Claude Code. Un contrat qui s'avère insuffisant se corrige
  en le réécrivant, pas en improvisant côté frontend.

## Ce qui est spécifique à Gemini dans ce projet

Deux usages distincts, **à ne jamais confondre** :

1. **Agent de code / designer** (ci-dessus) — l'agent Gemini travaille sur le
   frontend en suivant `CLAUDE.md` et `AGENTS.md`, en parallèle de Claude Code
   sur le backend.

2. **Couche d'explication dans le produit lui-même** (voir `CLAUDE.md` §1, §6,
   §7) — l'API Gemini est appelée **par le backend** pour reformuler un résultat
   **déjà calculé**, jamais pour produire un chiffre. Si tu travailles sur cette
   intégration (vague 3), le contrat est strict :

   - **entrée** = résultat structuré (JSON) déjà calculé ;
   - **sortie** = phrase en langage naturel ;
   - **aucune valeur numérique dans la sortie qui ne soit déjà présente dans
     l'entrée**.

   **Un test doit vérifier que le texte généré ne contient pas de nombre absent
   du JSON d'entrée.** Cet usage-là est indépendant du rôle de designer — c'est
   le backend qui appelle l'API Gemini, pas l'agent de code.

## Configuration recommandée

Si l'outil le permet (`settings.json`), fais-lui lire les deux conventions dans
l'ordre, pour qu'aucun agent ne travaille sur un jeu de règles incomplet :

```json
{
  "context": {
    "fileName": ["AGENTS.md", "GEMINI.md"]
  }
}
```

## Règle identifiants

*(rappel — détail complet dans `CLAUDE.md` §11 et `AGENTS.md` §4)*

Même règle que pour Claude Code, sans exception : **jamais un secret collé dans
la conversation**. Si l'agent Gemini a besoin d'une clé (Supabase, clé Gemini
elle-même pour l'intégration runtime, hébergeur), il dit précisément laquelle et
où la trouver, puis attend qu'elle soit placée dans `.env` (local) ou chez
l'hébergeur (production).

## `docs/REPRISE.md` reste unique et partagé

Que Claude Code ou l'agent Gemini termine la session, il le met à jour (voir
`AGENTS.md` §3) pour que l'autre agent — humain ou IA — sache où en est le projet
en 30 secondes, sans avoir à relire tout l'historique.
