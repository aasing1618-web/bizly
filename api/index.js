/**
 * Fonction Vercel — la seule chose que l'hébergeur exécute.
 *
 * Volontairement réduite à une réexportation : tout le code réel vit dans
 * l'espace de travail `server/`, typé et testé. Un point d'entrée qui contient
 * de la logique est du code qui échappe à `npm run typecheck` et à `npm test`.
 *
 * `server/dist/vercel.js` est produit par `npm run build`, lancé par Vercel
 * avant de construire cette fonction (voir `vercel.json`).
 */
export { default } from "../server/dist/vercel.js";
