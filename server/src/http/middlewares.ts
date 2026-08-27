import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import { journal } from "./journal.js";

/**
 * Pose un identifiant de requête et le renvoie au client.
 *
 * C'est ce que l'on demande à l'utilisateur quand il signale un problème :
 * il permet de retrouver la ligne de log exacte sans rien exposer de sensible.
 * Un identifiant fourni par le client est ignoré : il pourrait être forgé pour
 * polluer les logs.
 */
export const identifiantRequete: RequestHandler = (_requete, reponse, suivant) => {
  reponse.setHeader("X-Request-Id", randomUUID());
  suivant();
};

/**
 * En-têtes de sécurité, posés à la main plutôt qu'avec Helmet : quatre en-têtes
 * suffisent ici, et chacun doit être un choix conscient.
 */
export function entetesSecurite(options: { production: boolean }): RequestHandler {
  return (_requete, reponse, suivant) => {
    // Empêche le navigateur de deviner un type MIME (JSON interprété en HTML…).
    reponse.setHeader("X-Content-Type-Options", "nosniff");
    // Bizly n'a aucune raison d'être affiché dans une iframe tierce.
    reponse.setHeader("X-Frame-Options", "DENY");
    // Ne fuite pas l'URL interne consultée vers les sites externes.
    reponse.setHeader("Referrer-Policy", "no-referrer");

    if (options.production) {
      // HSTS : uniquement en production, où l'on sert bien en HTTPS.
      reponse.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }

    suivant();
  };
}

/**
 * Journalise chaque requête API à sa fin, avec sa durée.
 *
 * Monté sur `/api` seulement : journaliser chaque fichier statique noierait
 * l'information utile.
 */
export const journaliserRequetes: RequestHandler = (requete, reponse, suivant) => {
  const debut = process.hrtime.bigint();

  reponse.on("finish", () => {
    const dureeMs = Number(process.hrtime.bigint() - debut) / 1_000_000;
    const niveau = reponse.statusCode >= 500 ? "erreur" : "info";

    journal[niveau]("requete", {
      requete_id: reponse.getHeader("X-Request-Id"),
      methode: requete.method,
      chemin: requete.originalUrl,
      statut: reponse.statusCode,
      duree_ms: Math.round(dureeMs * 100) / 100,
    });
  });

  suivant();
};
