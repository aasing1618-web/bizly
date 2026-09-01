import { useCallback, useEffect, useState } from "react";
import type { ReponseStatutAbonnement } from "@bizly/shared";
import { appelApi, ErreurApiClient } from "./api";

/**
 * État d'abonnement de l'entreprise — `GET /api/paiement/statut`.
 *
 * Volontairement **non mis en cache** entre les montages : contrairement aux
 * référentiels, cet état change (un administrateur valide un paiement pendant
 * que la page est ouverte). Un cache ferait afficher « bloqué » à quelqu'un qui
 * vient d'être débloqué.
 */

export type EtatAbonnement =
  | { phase: "chargement" }
  | { phase: "pret"; statut: ReponseStatutAbonnement }
  | { phase: "echec"; message: string };

export function useAbonnement() {
  const [etat, setEtat] = useState<EtatAbonnement>({ phase: "chargement" });
  const [erreurAction, setErreurAction] = useState<string | null>(null);

  const charger = useCallback(async (signal?: AbortSignal) => {
    try {
      const statut = await appelApi<ReponseStatutAbonnement>("/paiement/statut", {
        ...(signal === undefined ? {} : { signal }),
      });
      setEtat({ phase: "pret", statut });
    } catch (cause) {
      if (signal?.aborted === true) return;
      setEtat({
        phase: "echec",
        message:
          cause instanceof ErreurApiClient
            ? cause.message
            : "Impossible de charger les informations d'abonnement.",
      });
    }
  }, []);

  useEffect(() => {
    const controleur = new AbortController();
    void charger(controleur.signal);
    return () => controleur.abort();
  }, [charger]);

  /** Déclare un paiement Wave. Renvoie `true` si la déclaration est passée. */
  const declarer = useCallback(async (referenceWave: string): Promise<boolean> => {
    setErreurAction(null);
    try {
      const statut = await appelApi<ReponseStatutAbonnement>("/paiement/declarer", {
        methode: "POST",
        corps: { reference_wave: referenceWave },
      });
      setEtat({ phase: "pret", statut });
      return true;
    } catch (cause) {
      setErreurAction(
        cause instanceof ErreurApiClient ? cause.message : "Une erreur inattendue est survenue.",
      );
      return false;
    }
  }, []);

  return { etat, erreurAction, declarer, recharger: () => charger() };
}
