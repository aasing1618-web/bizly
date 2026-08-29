import { useState } from "react";
import type { EntreprisePublique, ReponseSession, UtilisateurPublic } from "@bizly/shared";
import { SectionCatalogue } from "./SectionCatalogue";
import { SectionDepenses } from "./SectionDepenses";
import { SectionParametres } from "./SectionParametres";
import { SectionQuestions } from "./SectionQuestions";
import { TableauDeBord } from "./TableauDeBord";
import { SectionVentes } from "./SectionVentes";
import { HandwritingSvg } from "@/components/ui/handwriting-svg";

export type AccueilProps = {
  session: ReponseSession;
  deconnecter: () => Promise<void>;
  appliquer: (partiel: {
    entreprise?: EntreprisePublique;
    utilisateur?: UtilisateurPublic;
  }) => void;
};

type Onglet = "tableau" | "questions" | "ventes" | "depenses" | "catalogue" | "parametres";

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
    <div className="min-h-dvh bg-slate-50 text-slate-800 font-sans">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur-md shadow-xs">
        <div className="mx-auto flex flex-col sm:flex-row max-w-7xl items-start sm:items-center justify-between gap-3 px-4 sm:px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-900 via-slate-900 to-indigo-950 text-amber-400 font-black text-xl shadow-md">
              ⚡
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <HandwritingSvg
                  text="Bizly"
                  width={85}
                  height={30}
                  fontSize={26}
                  strokeWidth={1.5}
                  duration={2}
                  className="text-indigo-600"
                />
                <span className="text-sm font-bold text-slate-900">• {entreprise.nom}</span>
                <span className="pill-tag pill-indigo">{entreprise.devise.code}</span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">SaaS de gestion & analytics intelligents</p>
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-3 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-100">
            <div className="flex items-center gap-2 rounded-full border border-slate-200/80 bg-slate-100/80 py-1 pl-1 pr-3 shadow-2xs">
              <img
                src="/photos/avatar1.jfif"
                alt={utilisateur.nom}
                className="h-7 w-7 rounded-full object-cover ring-2 ring-indigo-500/40"
              />
              <span className="text-xs font-bold text-slate-800 truncate max-w-[120px]">{utilisateur.nom}</span>
            </div>

            <button
              type="button"
              onClick={surDeconnexion}
              disabled={deconnexionEnCours}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-xs transition
                hover:bg-slate-50 hover:text-slate-900 disabled:opacity-60 shrink-0"
            >
              {deconnexionEnCours ? "…" : "Déconnexion"}
            </button>
          </div>
        </div>

        <nav className="mx-auto flex max-w-7xl gap-2 px-4 sm:px-6 pt-1 pb-2 overflow-x-auto whitespace-nowrap scrollbar-none" aria-label="Sections">
          {(
            [
              ["tableau", "📊 Dashboard", "pill-pink"],
              ["questions", "💡 Questions Intelligentes", "pill-indigo"],
              ["ventes", "📈 Ventes", "pill-emerald"],
              ["depenses", "💳 Dépenses", "pill-amber"],
              ["catalogue", "📦 Catalogue", "pill-cyan"],
              ["parametres", "⚙️ Paramètres", "pill-indigo"],
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

      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-8 grid grid-cols-1 lg:grid-cols-4 gap-6 sm:gap-8">
        <main className="lg:col-span-3">
          {onglet === "tableau" && <TableauDeBord devise={entreprise.devise} />}
          {onglet === "questions" && <SectionQuestions devise={entreprise.devise} />}
          {onglet === "ventes" && (
            <SectionVentes
              devise={entreprise.devise}
              plan={entreprise.plan}
              onAllerAuxParametres={() => setOnglet("parametres")}
            />
          )}
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

        <aside className="space-y-6">
          <div className="bizly-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Conseils & Guide</h3>
              <span className="pill-tag pill-pink">E-Commerce</span>
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-100 shadow-xs">
              <img
                src="/photos/promo.jfif"
                alt="Conseils E-commerce"
                className="h-36 w-full object-cover transition-transform duration-300 hover:scale-105"
              />
            </div>
            <p className="text-xs font-semibold text-slate-700 leading-snug">
              Boostez votre chiffre d'affaires en automatisant le suivi de vos dépenses et marges.
            </p>
          </div>

          <div className="gradient-banner p-5 shadow-md space-y-3">
            <span className="pill-tag bg-white/20 text-white border-white/30">Nouveau</span>
            <h4 className="text-sm font-bold leading-tight">Moteur de Questions Financières</h4>
            <p className="text-xs text-white/90 leading-relaxed">
              Obtenez des réponses instantanées en français sur la rentabilité de vos produits et vos meilleurs clients.
            </p>
            <button
              type="button"
              onClick={() => setOnglet("questions")}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-indigo-600 shadow-xs transition hover:bg-slate-100"
            >
              Consulter les conseils →
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
