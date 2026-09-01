import { Router } from "express";
import { z } from "zod";
import { CLES_PERIODE, type Devise, type ReponseTableauDeBord } from "@bizly/shared";
import { calculerKpi } from "../../domaine/kpi.js";
import {
  construireComparaison,
  construirePeriode,
  PeriodeInvalide,
} from "../../domaine/periodes.js";
import { DateInvalide } from "../../domaine/temps.js";
import { erreurs } from "../../http/erreurs.js";
import { exigerSessionActive } from "../../http/abonnement.js";
import { contexteDe, exigerSession } from "../../http/session.js";
import { analyser } from "../../http/validation.js";
import type { ServiceAuth } from "../auth/service.js";
import type { DepotKpi } from "./depot.js";

/**
 * `GET /api/tableau-de-bord` — docs/API-CONTRACT.md §4.
 *
 * Une seule route rend tout l'écran : indicateurs, comparaison, série et
 * répartitions. Découper ferait autant d'allers-retours, et surtout autant
 * d'instantanés différents de la base — le total des répartitions pourrait ne
 * plus correspondre à l'indicateur affiché juste au-dessus.
 */

const LIMITE_TOP_PRODUITS = 5;

const schemaRequete = z.object({
  periode: z.enum(CLES_PERIODE).default("mois"),
  reference: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format attendu : AAAA-MM-JJ.").optional(),
  du: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format attendu : AAAA-MM-JJ.").optional(),
  au: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format attendu : AAAA-MM-JJ.").optional(),
});

export type OptionsRouteurKpi = {
  serviceAuth: ServiceAuth;
  depot: DepotKpi;
  /** Horloge injectable : le moteur ne lit jamais l'heure lui-même. */
  horloge?: () => Date;
};

export function creerRouteurKpi(options: OptionsRouteurKpi): Router {
  const { serviceAuth, depot, horloge = () => new Date() } = options;
  const routeur = Router();
  // Session valide ET abonnement en cours : un essai termine ferme tout le
  // module metier, pas seulement l ecriture (voir http/abonnement.ts).
  const protege = exigerSessionActive(serviceAuth);

  routeur.get("/tableau-de-bord", protege, async (requete, reponse) => {
    const { entreprise } = contexteDe(requete);
    const demande = analyser(schemaRequete, requete.query);
    const maintenant = horloge();

    let periode;
    try {
      periode = construirePeriode(
        { cle: demande.periode, reference: demande.reference, du: demande.du, au: demande.au },
        entreprise.fuseau,
        maintenant,
      );
    } catch (cause) {
      // Période mal formée : c'est la demande du client qui est invalide.
      if (cause instanceof PeriodeInvalide || cause instanceof DateInvalide) {
        throw erreurs.validation(cause.message, {
          champs: [{ champ: "periode", message: cause.message }],
        });
      }
      throw cause;
    }

    const comparaison = construireComparaison(periode, maintenant);

    const donnees = await depot.charger(
      entreprise.id,
      { debut: periode.debut, fin: periode.fin },
      { debut: comparaison.debut, fin: comparaison.fin },
      LIMITE_TOP_PRODUITS,
    );

    const devise: Devise = entreprise.devise;

    const resultat: ReponseTableauDeBord = calculerKpi({
      ventes: donnees.ventes,
      depenses: donnees.depenses,
      ventesPrecedentes: donnees.ventesPrecedentes,
      depensesPrecedentes: donnees.depensesPrecedentes,
      periode,
      comparaison,
      devise,
      libellesCategories: donnees.libellesCategories,
      topProduits: donnees.topProduits,
    });

    // Un tableau de bord vide est un SUCCÈS, pas une erreur : c'est l'état
    // normal d'un compte le jour de son inscription.
    reponse.json(resultat);
  });

  return routeur;
}
