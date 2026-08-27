import { useState } from "react";
import { useSession } from "./lib/session";
import { Accueil } from "./pages/Accueil";
import { Connexion } from "./pages/Connexion";
import { Inscription } from "./pages/Inscription";

/**
 * Aiguillage de l'application cliente.
 *
 * Pas de routeur pour l'instant : il n'y a qu'un écran une fois connecté. Une
 * vraie navigation arrivera avec le tableau de bord (Vague 3), quand il y aura
 * plusieurs pages à adresser.
 *
 * L'application n'affiche RIEN d'authentifié tant que `GET /api/moi` n'a pas
 * répondu : deviner l'état de connexion produirait un écran qui clignote entre
 * connecté et anonyme à chaque rechargement.
 */
export function App() {
  const { etat, connecter, inscrire, deconnecter } = useSession();
  const [ecran, setEcran] = useState<"connexion" | "inscription">("connexion");

  if (etat.phase === "chargement") {
    return (
      <Centre>
        <p className="text-sm text-ardoise-400" role="status">
          Chargement…
        </p>
      </Centre>
    );
  }

  if (etat.phase === "indisponible") {
    return (
      <Centre>
        <Carte>
          <h1 className="text-lg font-semibold">Service indisponible</h1>
          <p className="mt-2 text-sm text-ardoise-400">{etat.message}</p>
        </Carte>
      </Centre>
    );
  }

  if (etat.phase === "suspendu") {
    return (
      <Centre>
        <Carte>
          <h1 className="text-lg font-semibold">Compte suspendu</h1>
          <p className="mt-2 text-sm text-ardoise-400">{etat.message}</p>
          <button
            type="button"
            onClick={() => void deconnecter()}
            className="mt-4 text-sm font-medium text-menthe-400 underline-offset-4 hover:underline"
          >
            Se déconnecter
          </button>
        </Carte>
      </Centre>
    );
  }

  if (etat.phase === "connecte") {
    return <Accueil session={etat.session} deconnecter={deconnecter} />;
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
    <main className="flex min-h-dvh items-center justify-center bg-ardoise-950 p-6 text-slate-100">
      {children}
    </main>
  );
}

function Carte({ children }: { children: React.ReactNode }) {
  return (
    <section className="w-full max-w-md rounded-2xl border border-white/10 bg-ardoise-900 p-8 shadow-2xl">
      {children}
    </section>
  );
}
