# DESIGN.md — Bizly Design System

> **Aesthetic World: Modern SaaS Craft & Clean Professional Elegance**
> Inspiré des standards UI modernes haut de gamme : cartes modulaires épurées avec bordures légères, arrière-plans neutres surélevés, pilules pastel pour les statuts/catégories, dégradés vibrants pour les widgets et typographie d'une précision chirurgicale.

---

## 🎨 1. Palette de Couleurs & Tokens Visuels

### Arrière-plans & Surfaces
- **Fond d'écran principal** : `#F8FAFC` (Slate 50) — Arrière-plan doux et reposant.
- **Surfaces de carte / Panneaux** : `#FFFFFF` (Pure White) — Cartes détachées avec un contraste net.
- **Bordures de carte** : `1px solid rgba(226, 232, 240, 0.8)` (Slate 200/80%) — Lignes de structure ultra-fines.
- **Ombres portées** : 
  - Subtile : `0 1px 3px 0 rgba(15, 23, 42, 0.04), 0 1px 2px -1px rgba(15, 23, 42, 0.04)`
  - Survol / Élévation : `0 10px 15px -3px rgba(15, 23, 42, 0.06), 0 4px 6px -4px rgba(15, 23, 42, 0.04)`

### Couleurs d'Accentuation & Pilules Pastel
Les catégories et statuts utilisent un système de pilules colorées à fond pastel et texte saturé (exactement comme sur l'interface de référence) :

| Usage / Catégorie | Fond Pastel | Bordure Subtile | Texte / Icône | Hex Principal |
|---|---|---|---|---|
| **Design / Ventes** | `#FCE7F3` | `#FBCFE8` | `#BE185D` | `#EC4899` (Rose) |
| **Dev / Système** | `#EEF2FF` | `#C7D2FE` | `#4338CA` | `#6366F1` (Indigo) |
| **Web / Trésorerie** | `#E0F2FE` | `#BAE6FD` | `#0E7490` | `#06B6D4` (Cyan) |
| **Marketing / Benefices**| `#ECFDF5` | `#A7F3D0` | `#047857` | `#10B981` (Émeraude) |
| **Dépenses / Warning** | `#FEF3C7` | `#FDE68A` | `#B45309` | `#F59E0B` (Ambre) |
| **Urgent / Erreur** | `#FEE2E2` | `#FCA5A5` | `#B91C1C` | `#EF4444` (Rouge) |

### Dégradés Vibrants (Widgets & Bannières)
- **Gradient Promo / Conseil** : `linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #D946EF 100%)`
- **Gradient Accentuation KPI** : `linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)`

---

## 🔤 2. Typographie & Rythme

- **Police principale** : `'Plus Jakarta Sans', 'Inter', system-ui, -apple-system, sans-serif`
- **Titre de section (`h1`)** : `1.5rem` (`24px`), `font-weight: 700`, `letter-spacing: -0.02em`, couleur `#0F172A`.
- **Titre de carte (`h2` / `h3`)** : `1rem` (`16px`), `font-weight: 600`, couleur `#1E293B`.
- **Corps de texte** : `0.875rem` (`14px`), `font-weight: 400` / `500`, couleur `#475569`.
- **Métadonnées & Badges** : `0.75rem` (`12px`), `font-weight: 600`, `letter-spacing: 0.01em`.

---

## 📐 3. Structure & Composants UI

### 1. Dock d'Icônes & Barre Latérale (Navigation)
- **Dock fixe à gauche** (`64px`) : Icônes d'action rapide (Accueil, Analyses, Opérations, Catalogue, Clients, Paramètres) avec indicateur actif sous forme de pilule violette.
- **Panneau secondaire collapsible** (`240px`) : Liste des modules, membres de l'équipe et widget promotionnel dégradé avec bouton d'action.

### 2. En-Tête & Contrôles Rápidcs
- **Barre d'action supérieure** : Boutons de sélection de période sous forme de pilules pastel (`Mois`, `Semaine`, `Jour`, `Année`), barre de recherche contextuelle et bouton d'action primaire.

### 3. Cartes Modulaires & Métriques
- **Tuiles KPI** : Cartes blanches avec indicateurs numériques en grand (`1.75rem`), étiquette de variation % (vert si positif, rouge si négatif) et mini-barre de progression fine (`height: 4px`, `border-radius: 9999px`).
- **Graphiques & Répartitions** : Cartes épurées présentant les séries journalières et les répartitions par catégories avec pourcentages exacts.

---

## 🖼️ 4. Intégration des Ressources d'Images (`Photos/`)

Le dossier [`Photos/`](file:///c:/Users/USER/Desktop/Bizly/Photos) contient les ressources visuelles utilisées pour enrichir l'interface :
- **`Photos/Consejos Para E-commerce.jfif`** : Image d'illustration pour le bloc Conseils & E-commerce sur le Tableau de bord.
- **`Photos/Need more views...jfif`** : Bannière promotionnelle et d'activation de compte dans la barre latérale.
- **`Photos/télécharger (2).jfif` à `(6).jfif`** : Avatars d'utilisateurs et visuels d'accueil pour la présentation des modules.
