import { useEffect, useState } from "react";
import type { ReponseSante } from "@bizly/shared";

/**
 * Écran d'administration de la Vague 0.
 *
 * Il prouve que `/admin/` est bien servi par un bundle distinct de celui de
 * l'application cliente. La gestion réelle des comptes (activation, suspension)
 * arrive en Vague 5.
 */
export function App() {
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
    <main className="min-h-dvh bg-ardoise-950 text-slate-100 p-8">
      <header className="mx-auto max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-ambre-400">
          Administration
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Bizly — console interne</h1>
        <p className="mt-1 text-sm text-ardoise-400">
          Bundle distinct de l&apos;application cliente, servi sous <code>/admin/</code>.
        </p>
      </header>

      <section className="mx-auto mt-8 max-w-3xl rounded-2xl border border-white/10 bg-ardoise-900 p-6">
        <h2 className="text-sm font-medium text-ardoise-400">État du service</h2>
        {echec && <p className="mt-3 text-corail-400">Serveur injoignable.</p>}
        {!echec && sante === null && <p className="mt-3 text-ardoise-400">Chargement…</p>}
        {sante !== null && (
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-8 gap-y-2 text-sm">
            <dt className="text-ardoise-400">Statut</dt>
            <dd className="font-medium">{sante.statut}</dd>
            <dt className="text-ardoise-400">Version</dt>
            <dd className="font-medium tabular-nums">{sante.version}</dd>
            <dt className="text-ardoise-400">Base de données</dt>
            <dd className="font-medium">
              {sante.base.statut}
              {sante.base.latence_ms !== null && ` · ${sante.base.latence_ms} ms`}
            </dd>
          </dl>
        )}
      </section>

      <section className="mx-auto mt-4 max-w-3xl rounded-2xl border border-dashed border-white/10 p-6 text-sm text-ardoise-400">
        Gestion des comptes (activation, suspension) — Vague 5.
      </section>
    </main>
  );
}
