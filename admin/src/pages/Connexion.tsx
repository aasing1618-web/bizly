import { useState, type FormEvent } from "react";
import type { CorpsConnexionAdmin } from "@bizly/shared";
import { Alerte, Bouton, Carte, Champ } from "../composants/Briques";
import { ErreurApiAdmin } from "../lib/api";

/**
 * Connexion à la console.
 *
 * Aucun lien « créer un compte » : les administrateurs se créent en ligne de
 * commande (`npm run admin:creer`). Aucun lien « mot de passe oublié » non
 * plus — il n'existe pas, et afficher un lien mort vaut moins que de le dire.
 */
export function Connexion({
  connecter,
}: {
  connecter: (corps: CorpsConnexionAdmin) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [charge, setCharge] = useState(false);

  async function soumettre(evenement: FormEvent) {
    evenement.preventDefault();
    setErreur(null);
    setCharge(true);

    try {
      await connecter({ email, mot_de_passe: motDePasse });
    } catch (cause) {
      setErreur(cause instanceof ErreurApiAdmin ? cause.message : "Connexion impossible.");
    } finally {
      setCharge(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-ardoise-950 p-6 text-slate-100">
      <div className="w-full max-w-sm">
        <p className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-ambre-400">
          Administration
        </p>
        <Carte>
          <form onSubmit={soumettre} className="space-y-5" noValidate>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Console Bizly</h1>
              <p className="mt-1 text-sm text-ardoise-400">Accès réservé.</p>
            </div>

            {erreur !== null && <Alerte>{erreur}</Alerte>}

            <Champ
              libelle="Adresse e-mail"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <Champ
              libelle="Mot de passe"
              type="password"
              autoComplete="current-password"
              required
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
            />

            <Bouton type="submit" charge={charge} className="w-full">
              Se connecter
            </Bouton>
          </form>
        </Carte>

        <p className="mt-4 text-center text-xs text-ardoise-400">
          Les comptes d&apos;administration se créent en ligne de commande&nbsp;:{" "}
          <code className="text-ardoise-400">npm run admin:creer</code>
        </p>
      </div>
    </main>
  );
}
