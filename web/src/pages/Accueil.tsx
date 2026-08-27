import { useState } from "react";
import type { ReponseSession } from "@bizly/shared";
import { formaterMontant } from "@bizly/shared";

export type AccueilProps = {
  session: ReponseSession;
  deconnecter: () => Promise<void>;
};

/**
 * Écran d'accueil après connexion — Vague 1.
 *
 * Il prouve que la session tient et affiche ce que l'API renvoie réellement.
 * Le tableau de bord et ses KPI arrivent en Vague 3 ; la navigation entre
 * écrans aussi, elle n'a pas d'objet tant qu'il n'y a qu'une page.
 */
export function Accueil({ session, deconnecter }: AccueilProps) {
  const { utilisateur, entreprise } = session;
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
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-4">
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
      </header>

      <main className="mx-auto max-w-4xl space-y-4 px-6 py-8">
        <section className="rounded-2xl border border-white/10 bg-ardoise-900 p-6">
          <h2 className="text-sm font-medium text-ardoise-400">Votre compte</h2>
          <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
            <Ligne terme="Utilisateur" valeur={`${utilisateur.nom} · ${utilisateur.email}`} />
            <Ligne terme="Rôle" valeur={utilisateur.role === "PROPRIETAIRE" ? "Propriétaire" : "Employé"} />
            <Ligne terme="Secteur" valeur={entreprise.secteur} />
            <Ligne terme="Fuseau horaire" valeur={entreprise.fuseau} />
            <Ligne
              terme="Devise"
              valeur={`${entreprise.devise.code} — ${entreprise.devise.decimales} décimale(s)`}
            />
            <Ligne terme="Statut" valeur={entreprise.statut === "ACTIF" ? "Actif" : "Suspendu"} />
          </dl>
        </section>

        <section className="rounded-2xl border border-white/10 bg-ardoise-900 p-6">
          <h2 className="text-sm font-medium text-ardoise-400">Exemple de formatage</h2>
          <p className="mt-3 text-sm text-ardoise-400">
            Un montant de <code className="text-slate-200">345000</code> en unité mineure
            s&apos;affiche, dans votre devise :
          </p>
          {/* Le nombre de décimales vient du serveur : en XOF ce même entier
              vaut 345 000 F CFA, pas 3 450,00. */}
          <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">
            {formaterMontant(345000, entreprise.devise)}
          </p>
        </section>

        <section className="rounded-2xl border border-dashed border-white/10 p-6 text-sm text-ardoise-400">
          Saisie des ventes et des dépenses — Vague 2. Tableau de bord et questions
          intelligentes — Vagues 3 et 4.
        </section>
      </main>
    </div>
  );
}

function Ligne({ terme, valeur }: { terme: string; valeur: string }) {
  return (
    <div>
      <dt className="text-xs text-ardoise-400">{terme}</dt>
      <dd className="mt-0.5 font-medium">{valeur}</dd>
    </div>
  );
}
