import { useEffect, useState } from "react";
import type { Plan, StatistiquesAdmin } from "@bizly/shared";
import { Carte } from "../composants/Briques";
import { appelAdmin } from "../lib/api";

const LIBELLES_PLAN: Record<Plan, string> = {
  free: "Découverte",
  pro: "Pro",
  business: "Business",
};

/**
 * Les indicateurs du `CLAUDE.md` §14 qui sont réellement mesurés.
 *
 * Rétention, MRR et conversion Free vers Pro n'y figurent pas : ils demandent
 * un historique d'événements que le MVP n'enregistre pas. Les afficher à zéro
 * les ferait passer pour mesurés.
 */
export function Statistiques() {
  const [donnees, setDonnees] = useState<StatistiquesAdmin | null>(null);

  useEffect(() => {
    const controleur = new AbortController();
    void appelAdmin<StatistiquesAdmin>("/statistiques", { signal: controleur.signal })
      .then(setDonnees)
      .catch(() => undefined);
    return () => controleur.abort();
  }, []);

  if (donnees === null) {
    return (
      <Carte>
        <p className="text-sm text-ardoise-400" role="status">
          Chargement des indicateurs…
        </p>
      </Carte>
    );
  }

  const activation =
    donnees.entreprises === 0
      ? null
      : Math.round((donnees.entreprises_avec_vente / donnees.entreprises) * 1000) / 10;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Tuile libelle="Entreprises" valeur={donnees.entreprises}>
        {donnees.entreprises_suspendues > 0
          ? `${donnees.entreprises_suspendues} suspendue${donnees.entreprises_suspendues > 1 ? "s" : ""}`
          : "aucune suspension"}
      </Tuile>

      <Tuile libelle="Utilisateurs" valeur={donnees.utilisateurs} />

      <Tuile
        libelle="Ont saisi une vente"
        valeur={donnees.entreprises_avec_vente}
        // `null` et non 0 % : sans aucune entreprise, le taux n'existe pas.
      >
        {activation === null ? "—" : `${activation.toLocaleString("fr-FR")} % des comptes`}
      </Tuile>

      <Tuile libelle="Inscriptions (30 j)" valeur={donnees.inscriptions_30_jours} />

      <Carte titre="Répartition par formule">
        <dl className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-2 text-sm">
          {donnees.par_plan.length === 0 && <dt className="text-ardoise-400">Aucune entreprise.</dt>}
          {donnees.par_plan.map(({ plan, nombre }) => (
            <div key={plan} className="contents">
              <dt className="text-ardoise-400">{LIBELLES_PLAN[plan]}</dt>
              <dd className="font-medium tabular-nums">{nombre}</dd>
            </div>
          ))}
        </dl>
      </Carte>
    </div>
  );
}

function Tuile({
  libelle,
  valeur,
  children,
}: {
  libelle: string;
  valeur: number;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-ardoise-900 p-5">
      <p className="text-xs uppercase tracking-wide text-ardoise-400">{libelle}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
        {valeur.toLocaleString("fr-FR")}
      </p>
      {children !== undefined && <p className="mt-1 text-xs text-ardoise-400">{children}</p>}
    </div>
  );
}
