# PRODUCT.md — Bizly

> **Bizly** est un SaaS de gestion et d'analyse financière intuitif et intelligent, spécialement conçu pour les petites entreprises, commerçants, artisans et indépendants.

---

## 🎯 Vision Produit

Bizly transforme la gestion quotidienne d'une petite entreprise en offrant une vision claire, instantanée et sans jargon de sa santé financière (chiffre d'affaires, dépenses, bénéfice net, trésorerie et rentabilité des produits). 

L'application élimine la complexité comptable en privilégiant des formulaires ultra-courts, des saisies rapides en entiers d'unité mineure (centimes/unités) et des explications en langage naturel via son moteur d'analyses intelligentes.

---

## 👥 Cibles & Utilisateurs

- **Commerçants et boutiquiers** (commerce de détail, prêt-à-porter, alimentation).
- **Restaurateurs et cafés** (restauration rapide, tables traditionnelles).
- **Prestataires de services & artisans** (coiffure, retouche, conseil, maintenance, artisanat).
- **Zones géographiques principales** : Afrique de l'Ouest et Centrale (Franc CFA - XOF/XAF, Franc guinéen, Franc congolais...), Europe (Euro - EUR), Amériques (Dollar - USD) et plus de 20 autres devises locales.

---

## 🗺️ Les 7 Surfaces Clés

| Surface | Rôle & Usage | Mode Impeccable |
|---|---|---|
| **1. Authentification & Onboarding** | Inscription en 1 clic avec choix de la devise et du secteur d'activité ; connexion sécurisée via cookie HttpOnly. | `Persuade` / `Operate` |
| **2. Tableau de Bord** | Vue d'ensemble des indicateurs clés (CA, Dépenses, Bénéfice, Panier Moyen, Marge %), graphiques temporels et comparatif à-date. | `Operate` |
| **3. Ventes & Dépenses** | Saisie ultra-rapide des opérations courantes, filtrage par période/statut/catégorie et numérotation automatique. | `Operate` |
| **4. Catalogue Produits** | Gestion des fiches articles avec prix de vente, coût de revient et calcul de marge unitaire/globale. | `Operate` |
| **5. Clients** | Répertoire clients, suivi de l'historique des achats, détection des nouveaux clients et alerte d'inactivité. | `Operate` |
| **6. Questions Intelligentes** | Moteur de réponses financières déterministes à 14 questions stratégiques avec conseils d'orientation métier. | `Read` / `Operate` |
| **7. Console Admin (`/admin/`)** | Interface de supervision pour gérer le statut des entreprises, les plans d'abonnement et la sécurité. | `Operate` |

---

## 💎 Principes d'Expérience Utilisateur (UX)

1. **Zéro friction** : Moins de champs, moins de clics. Les champs facultatifs ne bloquent jamais la validation.
2. **Clarté monétaire absolue** : Les montants s'affichent avec la devise résolue et le nombre exact de décimales du pays (ex: `1 500 FCFA` sans décimale inutiles, `15,50 €` avec deux décimales).
3. **Vérité des données** : Pas d'estimations trompeuses. Un panier moyen sans vente affiche `—` plutôt qu'un faux `0 €`.
4. **Conception responsive & mobile-first** : Une interface parfaitement fluide sur smartphone en boutique comme sur ordinateur au bureau.
