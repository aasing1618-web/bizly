import type { ReponseSession } from "@bizly/shared";
import { Alerte } from "../composants/Formulaire";
import { PaiementWave } from "../composants/PaiementWave";
import { useAbonnement } from "../lib/abonnement";

/**
 * Écran de paiement — le seul que voit une entreprise dont l'essai est fini.
 *
 * Trois choses, dans l'ordre où la personne agit : combien, à qui, et comment
 * nous le dire. Le reste de l'application est fermé ; cet écran doit donc se
 * suffire à lui-même, et rester la seule sortie du blocage.
 *
 * On dit explicitement que les données sont conservées : c'est la première
 * inquiétude de quelqu'un qui se voit bloqué, et la taire coûterait des
 * clients qu'un simple mot rassure.
 */

export type PaywallProps = {
  session: ReponseSession;
  deconnecter: () => Promise<void>;
  /** Relit la session pour rouvrir l'application dès la validation. */
  rafraichir: () => Promise<void>;
};

export function Paywall({ session, deconnecter, rafraichir }: PaywallProps) {
  const { etat, erreurAction, declarer, recharger } = useAbonnement();
  const { acces, nom } = session.entreprise;

  return (
    <main className="min-h-dvh bg-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto w-full max-w-lg space-y-5">
        <header className="text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-400 text-xl font-black text-slate-950">
            ⚡
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            {acces.motif === "ABONNEMENT_EXPIRE"
              ? "Votre abonnement est arrivé à échéance"
              : "Votre essai de deux mois est terminé"}
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            {nom} — passez au plan Pro pour retrouver votre tableau de bord.
          </p>
        </header>

        {etat.phase === "chargement" && (
          <p className="text-center text-sm text-slate-400" role="status">
            Chargement…
          </p>
        )}

        {etat.phase === "echec" && <Alerte>{etat.message}</Alerte>}

        {etat.phase === "pret" && (
          <PaiementWave
            statut={etat.statut}
            declarer={declarer}
            erreur={erreurAction}
            recharger={() => {
              recharger();
              void rafraichir();
            }}
          />
        )}

        <p className="text-center text-xs text-slate-500">
          Vos ventes, dépenses et clients sont conservés intacts. Tout revient dès la validation.
        </p>

        <div className="text-center">
          <button
            type="button"
            onClick={() => void deconnecter()}
            className="text-sm font-semibold text-slate-400 underline-offset-4 hover:text-white hover:underline"
          >
            Se déconnecter
          </button>
        </div>
      </div>
    </main>
  );
}
