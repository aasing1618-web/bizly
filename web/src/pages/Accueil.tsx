import { useState } from "react";
import type { EntreprisePublique, ReponseSession, UtilisateurPublic } from "@bizly/shared";
import { SectionCatalogue } from "./SectionCatalogue";
import { SectionDepenses } from "./SectionDepenses";
import { SectionParametres } from "./SectionParametres";
import { SectionQuestions } from "./SectionQuestions";
import { TableauDeBord } from "./TableauDeBord";
import { SectionVentes } from "./SectionVentes";

export type AccueilProps = {
  session: ReponseSession;
  deconnecter: () => Promise<void>;
  appliquer: (partiel: {
    entreprise?: EntreprisePublique;
    utilisateur?: UtilisateurPublic;
  }) => void;
};

type Onglet = "tableau" | "questions" | "ventes" | "depenses" | "catalogue" | "parametres";

/**
 * Coquille de l'application connectée.
 *
 * Des onglets en état local plutôt qu'un routeur. Un vrai routeur deviendra
 * utile quand il y aura des URL à partager — un tableau de bord sur une période
 * précise, par exemple. Ce sera la finition (Vague 6).
 */
export function Accueil({ session, deconnecter, appliquer }: AccueilProps) {
  const { utilisateur, entreprise } = session;
  const [onglet, setOnglet] = useState<Onglet>("tableau");
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
              ["tableau", "Tableau de bord"],
              ["questions", "Questions"],
              ["ventes", "Ventes"],
              ["depenses", "Dépenses"],
              ["catalogue", "Catalogue"],
              ["parametres", "Paramètres"],
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
        {onglet === "tableau" && <TableauDeBord devise={entreprise.devise} />}
        {onglet === "questions" && <SectionQuestions devise={entreprise.devise} />}
        {onglet === "ventes" && <SectionVentes devise={entreprise.devise} />}
        {onglet === "depenses" && <SectionDepenses devise={entreprise.devise} />}
        {onglet === "catalogue" && <SectionCatalogue devise={entreprise.devise} />}
        {onglet === "parametres" && (
          <SectionParametres
            entreprise={entreprise}
            utilisateur={utilisateur}
            appliquer={appliquer}
          />
        )}
      </main>
    </div>
  );
}
