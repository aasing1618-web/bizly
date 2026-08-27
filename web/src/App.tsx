import { useEffect, useState } from "react";
import type { ReponseSante } from "@bizly/shared";

/**
 * Écran de la Vague 0.
 *
 * Il n'a qu'un rôle : prouver que la chaîne complète fonctionne — le navigateur
 * atteint Express sur la même origine, Express atteint Supabase. L'application
 * réelle est construite à partir de la Vague 1.
 */

type Etat =
  | { phase: "chargement" }
  | { phase: "recu"; sante: ReponseSante }
  | { phase: "injoignable"; detail: string };

export function App() {
  const [etat, setEtat] = useState<Etat>({ phase: "chargement" });

  useEffect(() => {
    const controleur = new AbortController();

    async function interroger() {
      try {
        const reponse = await fetch("/api/health", { signal: controleur.signal });
        const sante = (await reponse.json()) as ReponseSante;
        setEtat({ phase: "recu", sante });
      } catch (cause) {
        if (controleur.signal.aborted) return;
        setEtat({
          phase: "injoignable",
          detail: cause instanceof Error ? cause.message : String(cause),
        });
      }
    }

    void interroger();
    return () => controleur.abort();
  }, []);

  return (
    <main className="min-h-dvh bg-ardoise-950 text-slate-100 flex items-center justify-center p-6">
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-ardoise-900 p-8 shadow-2xl">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-ardoise-400">
          Vague 0 — socle
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Bizly</h1>
        <p className="mt-1 text-sm text-ardoise-400">
          Gestion et analyse pour petites entreprises.
        </p>

        <div className="mt-8 rounded-xl border border-white/10 bg-black/20 p-4">
          <EtatServeur etat={etat} />
        </div>
      </section>
    </main>
  );
}

function EtatServeur({ etat }: { etat: Etat }) {
  if (etat.phase === "chargement") {
    return <Ligne pastille="bg-ardoise-400" titre="Interrogation du serveur…" />;
  }

  if (etat.phase === "injoignable") {
    return (
      <Ligne
        pastille="bg-corail-400"
        titre="Serveur injoignable"
        detail={etat.detail}
      />
    );
  }

  const { sante } = etat;
  const baseOk = sante.base.statut === "ok";

  return (
    <div className="space-y-3">
      <Ligne
        pastille={baseOk ? "bg-menthe-400" : "bg-ambre-400"}
        titre={baseOk ? "API et base opérationnelles" : "API en ligne, base injoignable"}
        detail={`version ${sante.version} · démarré depuis ${sante.uptime_s} s`}
      />
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt className="text-ardoise-400">Base de données</dt>
        <dd className="text-right font-medium">{baseOk ? "ok" : "erreur"}</dd>
        <dt className="text-ardoise-400">Latence</dt>
        <dd className="text-right font-medium tabular-nums">
          {sante.base.latence_ms === null ? "—" : `${sante.base.latence_ms} ms`}
        </dd>
      </dl>
    </div>
  );
}

function Ligne({
  pastille,
  titre,
  detail,
}: {
  pastille: string;
  titre: string;
  detail?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className={`mt-1.5 size-2 shrink-0 rounded-full ${pastille}`} aria-hidden />
      <div>
        <p className="font-medium">{titre}</p>
        {detail !== undefined && <p className="text-sm text-ardoise-400">{detail}</p>}
      </div>
    </div>
  );
}
