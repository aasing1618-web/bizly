import { useEffect, useState } from "react";
import type { ReponseSante } from "@bizly/shared";
import { Carte, Etiquette } from "./composants/Briques";
import { useSessionAdmin } from "./lib/session";
import { Connexion } from "./pages/Connexion";
import { Entreprises } from "./pages/Entreprises";
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
  const [onglet, setOnglet] = useState<"entreprises" | "etat">("entreprises");

  if (etat.phase === "chargement") {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-ardoise-950 text-slate-100">
        <p className="text-sm text-ardoise-400" role="status">
          Chargement…
        </p>
      </main>
    );
  }

  if (etat.phase === "indisponible") {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-ardoise-950 p-6 text-slate-100">
        <Carte titre="Service indisponible">
          <p className="text-sm text-ardoise-400">{etat.message}</p>
        </Carte>
      </main>
    );
  }

  if (etat.phase === "anonyme") return <Connexion connecter={connecter} />;

  return (
    <div className="min-h-dvh bg-ardoise-950 text-slate-100">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-ambre-400">
              Administration
            </p>
            <h1 className="text-lg font-semibold tracking-tight">Console Bizly</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-ardoise-400 sm:inline">{etat.admin.nom}</span>
            <button
              type="button"
              onClick={() => void deconnecter()}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-sm transition hover:border-white/25"
            >
              Se déconnecter
            </button>
          </div>
        </div>

        <nav className="mx-auto flex max-w-6xl gap-1 px-6" aria-label="Sections">
          {(
            [
              ["entreprises", "Entreprises"],
              ["etat", "État du service"],
            ] as const
          ).map(([cle, libelle]) => (
            <button
              key={cle}
              type="button"
              onClick={() => setOnglet(cle)}
              aria-current={onglet === cle ? "page" : undefined}
              className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                onglet === cle
                  ? "border-ambre-400 text-slate-100"
                  : "border-transparent text-ardoise-400 hover:text-slate-200"
              }`}
            >
              {libelle}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        {onglet === "entreprises" ? (
          <>
            <Statistiques />
            <Entreprises />
          </>
        ) : (
          <EtatService />
        )}
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
      {echec && <p className="text-corail-400">Serveur injoignable.</p>}
      {!echec && sante === null && <p className="text-ardoise-400">Chargement…</p>}
      {sante !== null && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-2 text-sm">
          <dt className="text-ardoise-400">Statut</dt>
          <dd>
            <Etiquette ton={sante.statut === "ok" ? "positif" : "alerte"}>{sante.statut}</Etiquette>
          </dd>
          <dt className="text-ardoise-400">Version</dt>
          <dd className="font-medium tabular-nums">{sante.version}</dd>
          <dt className="text-ardoise-400">Base de données</dt>
          <dd className="font-medium">
            {sante.base.statut}
            {sante.base.latence_ms !== null && ` · ${sante.base.latence_ms} ms`}
          </dd>
          <dt className="text-ardoise-400">En ligne depuis</dt>
          <dd className="font-medium tabular-nums">
            {Math.floor(sante.uptime_s / 60)} min
          </dd>
        </dl>
      )}
    </Carte>
  );
}
