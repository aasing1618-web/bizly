import { existsSync } from "node:fs";
import path from "node:path";
import express, { type Express, type Request, type Response } from "express";
import { journal } from "./http/journal.js";

export type OptionsStatiques = {
  /** Dossier contenant les deux bundles : `app/` (client) et `admin/`. */
  racinePublic: string;
};

/**
 * Sert les deux applications React depuis le processus unique.
 *
 * Ordre imposé : l'API est déjà montée avant d'arriver ici, donc rien de ce qui
 * suit ne peut intercepter `/api/*`. C'est la garantie qu'une route d'API
 * inconnue renvoie du JSON et non l'`index.html` du SPA.
 */
export function monterStatiques(app: Express, options: OptionsStatiques): void {
  const dossierApp = path.join(options.racinePublic, "app");
  const dossierAdmin = path.join(options.racinePublic, "admin");

  monterBundle(app, { prefixe: "/admin", dossier: dossierAdmin, nom: "admin" });
  monterBundle(app, { prefixe: "/", dossier: dossierApp, nom: "app cliente" });
}

type OptionsBundle = {
  /** `/admin` ou `/`. */
  prefixe: string;
  dossier: string;
  nom: string;
};

function monterBundle(app: Express, options: OptionsBundle): void {
  const { prefixe, dossier, nom } = options;
  const indexHtml = path.join(dossier, "index.html");
  const motifFallback = prefixe === "/" ? "/{*reste}" : `${prefixe}{/*reste}`;

  if (!existsSync(indexHtml)) {
    journal.avertissement(`bundle « ${nom} » absent — exécuter « npm run build »`, {
      attendu: indexHtml,
    });

    app.get(motifFallback, (_requete, reponse) => {
      reponse.status(503).type("text/plain; charset=utf-8").send(
        `Bizly — le bundle « ${nom} » n'est pas encore construit.\n` +
          `Lancer « npm run build » à la racine du dépôt, puis relancer le serveur.\n`,
      );
    });
    return;
  }

  const servirFichiers = express.static(dossier, {
    index: false,
    // Les fichiers absents tombent dans le fallback SPA ci-dessous, où ils sont
    // filtrés sur leur extension.
    fallthrough: true,
    setHeaders(reponse, cheminFichier) {
      // Vite produit des noms de fichiers empreintés dans /assets : leur contenu
      // ne change jamais pour une même URL, on peut les mettre en cache très
      // longtemps. L'index.html, lui, doit toujours être revalidé, sinon un
      // déploiement ne s'applique pas aux onglets déjà ouverts.
      if (cheminFichier.endsWith("index.html")) {
        reponse.setHeader("Cache-Control", "no-cache");
      } else if (cheminFichier.includes(`${path.sep}assets${path.sep}`)) {
        reponse.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  });

  if (prefixe === "/") app.use(servirFichiers);
  else app.use(prefixe, servirFichiers);

  app.get(motifFallback, (requete: Request, reponse: Response) => {
    // Une requête vers un fichier manquant (« /assets/app-abc123.js » supprimé
    // par un déploiement partiel) ne doit PAS recevoir l'index.html : le
    // navigateur exécuterait du HTML là où il attend du JavaScript, et l'erreur
    // devient indéchiffrable. On répond un vrai 404.
    if (path.extname(requete.path) !== "") {
      reponse.status(404).type("text/plain; charset=utf-8").send("Fichier introuvable.\n");
      return;
    }

    reponse.setHeader("Cache-Control", "no-cache");
    reponse.sendFile(indexHtml);
  });
}
