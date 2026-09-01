import { useEffect, useState } from "react";
import type { ReponseSante } from "@bizly/shared";
import { Carte, Etiquette } from "./composants/Briques";
import { useSessionAdmin } from "./lib/session";
import { Connexion } from "./pages/Connexion";
import { Entreprises } from "./pages/Entreprises";
import { Paiements } from "./pages/Paiements";
import { Statistiques } from "./pages/Statistiques";

/**
 * Console d'administration — docs/API-CONTRACT.md §9.
 *
 * Bundle distinct de l'application cliente, servi sous `/admin/`, authentifié
 * par son propre cookie. Rien de ce qui est ici n'est téléchargeable par un
 * utilisateur client, et un jeton client n'y ouvre aucune porte.
 */
export function App() {
  const { etat, connecter, deconnecter } = useSessionAdmin();
  const [onglet, setOnglet] = useState<"entreprises" | "paiements" | "etat">("entreprises");

  if (etat.phase === "chargement") {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-slate-50 text-slate-800 font-sans">
        <p className="text-xs font-semibold text-slate-500" role="status">
          Chargement de la console…
        </p>
      </main>
    );
  }

  if (etat.phase === "indisponible") {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-slate-50 p-6 text-slate-800 font-sans">
        <Carte titre="Service indisponible">
          <p className="text-xs font-semibold text-slate-500">{etat.message}</p>
        </Carte>
      </main>
    );
  }

  if (etat.phase === "anonyme") return <Connexion connecter={connecter} />;

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-800 font-sans">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur-md shadow-xs">
        <div className="mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 sm:px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white font-bold text-lg shadow-xs">
              🛡️
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base font-extrabold tracking-tight text-slate-900">Console Bizly</h1>
                <span className="pill-tag pill-amber">Super Admin</span>
              </div>
              <p className="text-xs text-slate-500 font-medium">Administration & Supervision</p>
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-3 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-100">
            <span className="text-xs font-semibold text-slate-700 truncate max-w-[150px]">{etat.admin.nom}</span>
            <button
              type="button"
              onClick={() => void deconnecter()}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-xs transition hover:bg-slate-50 hover:text-slate-900 shrink-0"
            >
              Déconnexion
            </button>
          </div>
        </div>

        <nav className="mx-auto flex max-w-6xl gap-2 px-4 sm:px-6 pt-1 pb-2 overflow-x-auto whitespace-nowrap scrollbar-none" aria-label="Sections">
          {(
            [
              ["entreprises", "🏢 Entreprises", "pill-amber"],
              ["paiements", "💳 Paiements", "pill-emerald"],
              ["etat", "⚡ État du service", "pill-indigo"],
            ] as const
          ).map(([cle, libelle, stylePilule]) => {
            const estActif = onglet === cle;
            return (
              <button
                key={cle}
                type="button"
                onClick={() => setOnglet(cle)}
                aria-current={estActif ? "page" : undefined}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 sm:px-3.5 sm:py-2 text-xs font-semibold transition-all shrink-0 ${
                  estActif
                    ? `${stylePilule} shadow-xs scale-105`
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                {libelle}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        {onglet === "entreprises" && (
          <>
            <Statistiques />
            <Entreprises />
          </>
        )}
        {onglet === "paiements" && <Paiements />}
        {onglet === "etat" && <EtatService />}
      </main>
    </div>
  );
}

/** Sonde publique `/api/health`, telle que l'hébergeur la voit. */
function EtatService() {
  const [sante, setSante] = useState<ReponseSante | null>(null);
  const [echec, setEchec] = useState(false);

  useEffect(() => {
    const controleur = new AbortController();

    fetch("/api/health", { signal: controleur.signal })
      .then((reponse) => reponse.json() as Promise<ReponseSante>)
      .then(setSante)
      .catch(() => {
        if (!controleur.signal.aborted) setEchec(true);
      });

    return () => controleur.abort();
  }, []);

  return (
    <Carte titre="État du service">
      {echec && <p className="text-xs font-semibold text-red-600">Serveur injoignable.</p>}
      {!echec && sante === null && <p className="text-xs font-medium text-slate-500 py-4">Chargement…</p>}
      {sante !== null && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-3 text-xs">
          <dt className="text-slate-500 font-semibold">Statut</dt>
          <dd>
            <Etiquette ton={sante.statut === "ok" ? "positif" : "alerte"}>{sante.statut}</Etiquette>
          </dd>
          <dt className="text-slate-500 font-semibold">Version</dt>
          <dd className="font-bold tabular-nums text-slate-900">{sante.version}</dd>
          <dt className="text-slate-500 font-semibold">Base de données</dt>
          <dd className="font-bold text-slate-900">
            {sante.base.statut}
            {sante.base.latence_ms !== null && ` · ${sante.base.latence_ms} ms`}
          </dd>
          <dt className="text-slate-500 font-semibold">En ligne depuis</dt>
          <dd className="font-bold tabular-nums text-slate-900">
            {Math.floor(sante.uptime_s / 60)} min
          </dd>
        </dl>
      )}
    </Carte>
  );
}
