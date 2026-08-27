import { useState } from "react";
import type { ReponseSession } from "@bizly/shared";
import { SectionDepenses } from "./SectionDepenses";
import { SectionVentes } from "./SectionVentes";

export type AccueilProps = {
  session: ReponseSession;
  deconnecter: () => Promise<void>;
};

type Onglet = "ventes" | "depenses";

/**
 * Coquille de l'application connectée.
 *
 * Deux onglets en état local plutôt qu'un routeur : il n'y a que deux écrans,
 * et une vraie navigation adressable arrivera avec le tableau de bord
 * (Vague 3), quand il y aura des URL à partager.
 */
export function Accueil({ session, deconnecter }: AccueilProps) {
  const { utilisateur, entreprise } = session;
  const [onglet, setOnglet] = useState<Onglet>("ventes");
  const [deconnexionEnCours, setDeconnexionEnCours] = useState(false);

  async function surDeconnexion() {
    setDeconnexionEnCours(true);
    try {
      await deconnecter();
    } finally {
      setDeconnexionEnCours(false);
    }
  }

  return (
    <div className="min-h-dvh bg-ardoise-950 text-slate-100">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-ardoise-400">Bizly</p>
            <h1 className="text-lg font-semibold tracking-tight">{entreprise.nom}</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-ardoise-400 sm:inline">{utilisateur.nom}</span>
            <button
              type="button"
              onClick={surDeconnexion}
              disabled={deconnexionEnCours}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-sm transition
                hover:border-white/25 disabled:opacity-60"
            >
              {deconnexionEnCours ? "…" : "Se déconnecter"}
            </button>
          </div>
        </div>

        <nav className="mx-auto flex max-w-6xl gap-1 px-6" aria-label="Sections">
          {(
            [
              ["ventes", "Ventes"],
              ["depenses", "Dépenses"],
            ] as const
          ).map(([cle, libelle]) => (
            <button
              key={cle}
              type="button"
              onClick={() => setOnglet(cle)}
              aria-current={onglet === cle ? "page" : undefined}
              className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                onglet === cle
                  ? "border-menthe-400 text-slate-100"
                  : "border-transparent text-ardoise-400 hover:text-slate-200"
              }`}
            >
              {libelle}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {onglet === "ventes" ? (
          <SectionVentes devise={entreprise.devise} />
        ) : (
          <SectionDepenses devise={entreprise.devise} />
        )}

        <p className="mt-8 rounded-2xl border border-dashed border-white/10 p-6 text-sm text-ardoise-400">
          Tableau de bord et questions intelligentes — Vagues 3 et 4.
        </p>
      </main>
    </div>
  );
}
