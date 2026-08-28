import { Router } from "express";
import { z } from "zod";
import { CLES_PERIODE, type ReponseQuestions } from "@bizly/shared";
import { repondreAuxQuestions } from "../../domaine/questions.js";
import {
  construireComparaison,
  construirePeriode,
  PeriodeInvalide,
} from "../../domaine/periodes.js";
import { DateInvalide } from "../../domaine/temps.js";
import { erreurs } from "../../http/erreurs.js";
import { contexteDe, exigerSession } from "../../http/session.js";
import { analyser } from "../../http/validation.js";
import type { ServiceAuth } from "../auth/service.js";
import type { DepotQuestions } from "./depot.js";

/**
 * `GET /api/questions` — docs/API-CONTRACT.md §6.
 *
 * Mêmes paramètres de période que le tableau de bord, pour qu'un utilisateur
 * qui bascule d'un écran à l'autre lise les mêmes chiffres sur la même fenêtre.
 */

const schemaRequete = z.object({
  periode: z.enum(CLES_PERIODE).default("mois"),
  reference: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format attendu : AAAA-MM-JJ.").optional(),
  du: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format attendu : AAAA-MM-JJ.").optional(),
  au: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format attendu : AAAA-MM-JJ.").optional(),
});

export type OptionsRouteurQuestions = {
  serviceAuth: ServiceAuth;
  depot: DepotQuestions;
  horloge?: () => Date;
};

export function creerRouteurQuestions(options: OptionsRouteurQuestions): Router {
  const { serviceAuth, depot, horloge = () => new Date() } = options;
  const routeur = Router();
  const protege = exigerSession(serviceAuth);

  routeur.get("/questions", protege, async (requete, reponse) => {
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
      // L'inactivité d'un client se mesure depuis AUJOURD'HUI, pas depuis la
      // fin de la période consultée : « n'a pas acheté récemment » est une
      // question sur le présent.
      maintenant,
    );

    const resultat: ReponseQuestions = repondreAuxQuestions({
      ...donnees,
      periode,
      comparaison,
      devise: entreprise.devise,
      secteur: entreprise.secteur,
    });

    reponse.json(resultat);
  });

  return routeur;
}
