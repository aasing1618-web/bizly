import { useCallback, useEffect, useState } from "react";
import type { CorpsConnexion, CorpsInscription, ReponseSession } from "@bizly/shared";
import { appelApi, ErreurApiClient } from "./api";

/**
 * État de session côté client.
 *
 * Le jeton est dans un cookie `HttpOnly` : ce code ne le voit jamais et ne peut
 * pas le stocker. La seule source de vérité est `GET /api/moi`, appelé au
 * démarrage — l'application ne devine jamais si elle est connectée.
 */

export type EtatSession =
  | { phase: "chargement" }
  | { phase: "anonyme" }
  | { phase: "connecte"; session: ReponseSession }
  | { phase: "suspendu"; message: string }
  | { phase: "indisponible"; message: string };

export function useSession() {
  const [etat, setEtat] = useState<EtatSession>({ phase: "chargement" });

  const rafraichir = useCallback(async (signal?: AbortSignal) => {
    try {
      const session = await appelApi<ReponseSession>("/moi", {
        ...(signal === undefined ? {} : { signal }),
      });
      setEtat({ phase: "connecte", session });
    } catch (cause) {
      if (signal?.aborted === true) return;
      if (cause instanceof ErreurApiClient) {
        // 401 est le cas NORMAL au premier chargement : personne n'est connecté.
        if (cause.statut === 401) setEtat({ phase: "anonyme" });
        else if (cause.code === "COMPTE_SUSPENDU") setEtat({ phase: "suspendu", message: cause.message });
        else setEtat({ phase: "indisponible", message: cause.message });
        return;
      }
      throw cause;
    }
  }, []);

  useEffect(() => {
    const controleur = new AbortController();
    void rafraichir(controleur.signal);
    return () => controleur.abort();
  }, [rafraichir]);

  const connecter = useCallback(async (corps: CorpsConnexion) => {
    const session = await appelApi<ReponseSession>("/connexion", { methode: "POST", corps });
    setEtat({ phase: "connecte", session });
  }, []);

  const inscrire = useCallback(async (corps: CorpsInscription) => {
    const session = await appelApi<ReponseSession>("/inscription", { methode: "POST", corps });
    setEtat({ phase: "connecte", session });
  }, []);

  const deconnecter = useCallback(async () => {
    await appelApi<void>("/deconnexion", { methode: "POST" });
    setEtat({ phase: "anonyme" });
  }, []);

  return { etat, connecter, inscrire, deconnecter, rafraichir };
}
