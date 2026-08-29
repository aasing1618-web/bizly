import { useCallback, useEffect, useState } from "react";
import type { AdminPublic, CorpsConnexionAdmin } from "@bizly/shared";
import { appelAdmin, ErreurApiAdmin } from "./api";

/**
 * Session d'administration.
 *
 * Le jeton est dans un cookie `HttpOnly` nommé `bizly_admin`, distinct de celui
 * des clients : ce code ne le voit jamais. La seule source de vérité est
 * `GET /api/admin/moi`, appelé au démarrage.
 */

export type EtatAdmin =
  | { phase: "chargement" }
  | { phase: "anonyme" }
  | { phase: "connecte"; admin: AdminPublic }
  | { phase: "indisponible"; message: string };

export function useSessionAdmin() {
  const [etat, setEtat] = useState<EtatAdmin>({ phase: "chargement" });

  useEffect(() => {
    const controleur = new AbortController();

    void appelAdmin<{ admin: AdminPublic }>("/moi", { signal: controleur.signal })
      .then(({ admin }) => setEtat({ phase: "connecte", admin }))
      .catch((cause: unknown) => {
        if (controleur.signal.aborted) return;
        if (cause instanceof ErreurApiAdmin) {
          // 401 est le cas normal au premier chargement : personne n'est connecté.
          setEtat(
            cause.statut === 401
              ? { phase: "anonyme" }
              : { phase: "indisponible", message: cause.message },
          );
          return;
        }
        setEtat({ phase: "indisponible", message: "Erreur inattendue." });
      });

    return () => controleur.abort();
  }, []);

  const connecter = useCallback(async (corps: CorpsConnexionAdmin) => {
    const { admin } = await appelAdmin<{ admin: AdminPublic }>("/connexion", {
      methode: "POST",
      corps,
    });
    setEtat({ phase: "connecte", admin });
  }, []);

  const deconnecter = useCallback(async () => {
    await appelAdmin<void>("/deconnexion", { methode: "POST" });
    setEtat({ phase: "anonyme" });
  }, []);

  return { etat, connecter, deconnecter };
}
