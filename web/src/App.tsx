import { useState } from "react";
import { useSession } from "./lib/session";
import { Accueil } from "./pages/Accueil";
import { Connexion } from "./pages/Connexion";
import { Inscription } from "./pages/Inscription";
import { ShaderBackground } from "@/components/ui/oceanic-currents";
import { HandwritingSvg } from "@/components/ui/handwriting-svg";

export function App() {
  const { etat, connecter, inscrire, deconnecter, appliquer } = useSession();
  const [ecran, setEcran] = useState<"connexion" | "inscription">("connexion");

  if (etat.phase === "chargement") {
    return (
      <Centre>
        <p className="text-sm font-semibold text-white/90" role="status">
          Chargement de votre espace Bizly…
        </p>
      </Centre>
    );
  }

  if (etat.phase === "indisponible") {
    return (
      <Centre>
        <Carte>
          <h1 className="text-lg font-bold text-slate-900">Service indisponible</h1>
          <p className="mt-2 text-sm text-slate-600">{etat.message}</p>
        </Carte>
      </Centre>
    );
  }

  if (etat.phase === "suspendu") {
    return (
      <Centre>
        <Carte>
          <h1 className="text-lg font-bold text-slate-900">Compte suspendu</h1>
          <p className="mt-2 text-sm text-slate-600">{etat.message}</p>
          <button
            type="button"
            onClick={() => void deconnecter()}
            className="mt-4 text-sm font-bold text-indigo-600 underline-offset-4 hover:underline"
          >
            Se déconnecter
          </button>
        </Carte>
      </Centre>
    );
  }

  if (etat.phase === "connecte") {
    return (
      <Accueil session={etat.session} deconnecter={deconnecter} appliquer={appliquer} />
    );
  }

  return (
    <Centre>
      <Carte>
        {ecran === "connexion" ? (
          <Connexion connecter={connecter} versInscription={() => setEcran("inscription")} />
        ) : (
          <Inscription inscrire={inscrire} versConnexion={() => setEcran("connexion")} />
        )}
      </Carte>
    </Centre>
  );
}

function Centre({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center bg-slate-950 p-3 sm:p-6 text-slate-800 font-sans overflow-hidden">
      <ShaderBackground className="absolute inset-0 w-full h-full opacity-60 pointer-events-none" />
      <div className="relative z-10 w-full flex items-center justify-center max-w-full">
        {children}
      </div>
    </main>
  );
}

function Carte({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 rounded-2xl sm:rounded-3xl border border-white/20 bg-white/95 backdrop-blur-xl shadow-2xl overflow-hidden">
      <div className="hidden md:flex flex-col justify-between p-8 bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 text-white relative overflow-hidden">
        <div className="space-y-4 relative z-10">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400 text-slate-950 font-black text-lg shadow-md">
              ⚡
            </div>
            <span className="pill-tag bg-white/20 text-white border-white/30 backdrop-blur-md">
              Gestion Financière Simplifiée
            </span>
          </div>

          <div className="pt-2">
            <HandwritingSvg
              text="Bizly"
              width={260}
              height={90}
              fontSize={64}
              strokeWidth={1.5}
              duration={2.5}
              className="text-amber-400"
            />
            <p className="text-xs text-slate-300 font-medium leading-relaxed mt-1">
              Pilotez vos ventes, suivez vos coûts réels et maximisez votre rentabilité commerciale en temps réel.
            </p>
          </div>
        </div>

        <div className="relative z-10 mt-6 overflow-hidden rounded-2xl border border-white/10 shadow-lg group">
          <img
            src="/photos/growth.jfif"
            alt="Bizly Analytics"
            className="h-44 w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/20 to-transparent p-4 flex flex-col justify-end">
            <div className="flex items-center gap-2">
              <div className="flex -space-x-2">
                <img src="/photos/avatar1.jfif" alt="Awa" className="h-6 w-6 rounded-full border-2 border-white object-cover" />
                <img src="/photos/avatar2.jfif" alt="Koffi" className="h-6 w-6 rounded-full border-2 border-white object-cover" />
                <img src="/photos/avatar3.jfif" alt="Jean" className="h-6 w-6 rounded-full border-2 border-white object-cover" />
                <img src="/photos/avatar4.jfif" alt="Marie" className="h-6 w-6 rounded-full border-2 border-white object-cover" />
              </div>
              <span className="text-[11px] font-semibold text-white/90">Adopté par 1 200+ PME</span>
            </div>
          </div>
        </div>
      </div>

      <section className="p-5 sm:p-8 flex flex-col justify-center bg-white">
        <div className="flex items-center gap-2 mb-6 border-b border-slate-100 pb-4 md:hidden">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-amber-400 font-bold text-base shadow-xs">
            ⚡
          </div>
          <div>
            <span className="text-base font-extrabold tracking-tight text-slate-900">Bizly</span>
            <span className="ml-2 pill-tag pill-indigo">SaaS Financial</span>
          </div>
        </div>
        {children}
      </section>
    </div>
  );
}
