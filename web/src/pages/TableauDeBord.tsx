import { useCallback, useEffect, useState } from "react";
import {
  formaterMontant,
  LIBELLES_PERIODE,
  type ClePeriode,
  type Devise,
  type ReponseTableauDeBord,
} from "@bizly/shared";
import { Repartition, SerieJournaliere } from "../composants/Graphiques";
import { Tuile, TuilePourcent } from "../composants/Tuile";
import { ErreurApiClient } from "../lib/api";
import { chargerTableauDeBord, formaterDateLocale } from "../lib/tableauDeBord";

const PERIODES: ClePeriode[] = ["jour", "semaine", "mois", "trimestre", "annee"];

export function TableauDeBord({ devise }: { devise: Devise }) {
  const [periode, setPeriode] = useState<ClePeriode>("mois");
  const [donnees, setDonnees] = useState<ReponseTableauDeBord | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(
    async (cle: ClePeriode, signal: AbortSignal) => {
      setChargement(true);
      try {
        setDonnees(await chargerTableauDeBord({ periode: cle }, signal));
        setErreur(null);
      } catch (cause) {
        if (signal.aborted) return;
        setErreur(cause instanceof ErreurApiClient ? cause.message : "Chargement impossible.");
      } finally {
        if (!signal.aborted) setChargement(false);
      }
    },
    [],
  );

  useEffect(() => {
    const controleur = new AbortController();
    void charger(periode, controleur.signal);
    return () => controleur.abort();
  }, [periode, charger]);

  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap gap-2" aria-label="Période">
        {PERIODES.map((cle) => (
          <button
            key={cle}
            type="button"
            onClick={() => setPeriode(cle)}
            aria-pressed={periode === cle}
            className={`rounded-lg border px-3 py-1.5 text-sm transition ${
              periode === cle
                ? "border-menthe-400/60 bg-menthe-400/10 text-slate-100"
                : "border-white/10 text-ardoise-400 hover:border-white/25 hover:text-slate-200"
            }`}
          >
            {LIBELLES_PERIODE[cle]}
          </button>
        ))}
      </nav>

      {erreur !== null && (
        <div
          role="alert"
          className="rounded-lg border border-corail-400/40 bg-corail-400/10 px-3 py-2.5 text-sm text-corail-400"
        >
          {erreur}
        </div>
      )}

      {donnees === null ? (
        <p className="py-12 text-center text-sm text-ardoise-400" role="status">
          {chargement ? "Calcul en cours…" : "Aucune donnée."}
        </p>
      ) : (
        <div className={chargement ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <Entete donnees={donnees} />

          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Tuile
              titre="Chiffre d'affaires (TTC)"
              indicateur={donnees.kpi.chiffre_affaires}
              devise={devise}
            />
            <Tuile
              titre="Dépenses"
              indicateur={donnees.kpi.depenses_totales}
              devise={devise}
              hausseEstBonne={false}
            />
            <Tuile titre="Bénéfice" indicateur={donnees.kpi.benefice} devise={devise} />
            <TuilePourcent titre="Marge" valeur={donnees.kpi.marge_pourcent.valeur} />

            <Tuile
              titre="Nombre de ventes"
              indicateur={donnees.kpi.nombre_ventes}
              devise={devise}
              format="nombre"
            />
            <Tuile titre="Panier moyen" indicateur={donnees.kpi.panier_moyen} devise={devise} />
            <Tuile
              titre="Nombre de dépenses"
              indicateur={donnees.kpi.nombre_depenses}
              devise={devise}
              format="nombre"
              hausseEstBonne={false}
            />
            <Tuile
              titre="Dépense moyenne"
              indicateur={donnees.kpi.depense_moyenne}
              devise={devise}
              hausseEstBonne={false}
            />
          </div>

          <section className="mt-6 rounded-2xl border border-white/10 bg-ardoise-900 p-5">
            <h3 className="mb-4 text-sm font-medium text-ardoise-400">
              Chiffre d&apos;affaires jour par jour
            </h3>
            <SerieJournaliere points={donnees.serie_ca_par_jour} devise={devise} />
          </section>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Repartition
              titre="Dépenses par catégorie"
              parts={donnees.repartition_depenses}
              devise={devise}
              vide="Aucune dépense sur cette période."
            />
            <Repartition
              titre="Chiffre d'affaires par moyen de paiement"
              parts={donnees.ca_par_moyen_paiement}
              devise={devise}
              vide="Aucune vente sur cette période."
            />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <TopProduits produits={donnees.top_produits} devise={devise} />
            <MeilleurJour donnees={donnees} devise={devise} />
          </div>
        </div>
      )}
    </div>
  );
}

function Entete({ donnees }: { donnees: ReponseTableauDeBord }) {
  const { periode, comparaison } = donnees;

  return (
    <header className="flex flex-wrap items-baseline justify-between gap-2">
      <p className="text-sm text-ardoise-400">
        Du <strong className="text-slate-200">{formaterDateLocale(periode.debut_local)}</strong> au{" "}
        <strong className="text-slate-200">{formaterDateLocale(periode.fin_local)}</strong>
        {periode.en_cours && <span className="ml-2 text-xs">(période en cours)</span>}
      </p>

      {/* La comparaison tronquée est ANNONCÉE, jamais silencieuse : sinon
          l'utilisateur croit comparer à un mois entier. */}
      <p className="text-xs text-ardoise-400">
        comparé au {formaterDateLocale(comparaison.debut_local)} –{" "}
        {formaterDateLocale(comparaison.fin_local)}
        {comparaison.a_date && (
          <span className="ml-1 rounded bg-white/5 px-1.5 py-0.5">à date</span>
        )}
      </p>
    </header>
  );
}

function TopProduits({
  produits,
  devise,
}: {
  produits: ReponseTableauDeBord["top_produits"];
  devise: Devise;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-ardoise-900 p-5">
      <h3 className="text-sm font-medium text-ardoise-400">Produits les plus vendus</h3>

      {produits.length === 0 ? (
        <p className="mt-4 text-sm text-ardoise-400">
          Aucune vente détaillée en lignes sur cette période. Détaillez vos ventes pour voir
          apparaître ce classement.
        </p>
      ) : (
        <ul className="mt-4 space-y-2 text-sm">
          {produits.map((produit) => (
            <li key={produit.libelle} className="flex items-baseline justify-between gap-3">
              <span className="truncate">{produit.libelle}</span>
              <span className="shrink-0 tabular-nums">
                <span className="text-ardoise-400">{Number(produit.quantite)} ×</span>{" "}
                {formaterMontant(produit.montant, devise)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MeilleurJour({
  donnees,
  devise,
}: {
  donnees: ReponseTableauDeBord;
  devise: Devise;
}) {
  const meilleur = donnees.meilleur_jour_semaine;

  return (
    <section className="rounded-2xl border border-white/10 bg-ardoise-900 p-5">
      <h3 className="text-sm font-medium text-ardoise-400">Meilleur jour de la semaine</h3>

      {meilleur === null ? (
        <p className="mt-4 text-sm text-ardoise-400">Pas encore assez de ventes.</p>
      ) : (
        <>
          <p className="mt-3 text-2xl font-semibold capitalize tracking-tight">{meilleur.libelle}</p>
          <p className="mt-1 text-sm text-ardoise-400">
            {formaterMontant(meilleur.ca_moyen, devise)} en moyenne par {meilleur.libelle}
          </p>
          {/* Précision utile : la moyenne est par occurrence du jour, pas un
              total — un mois contient 4 ou 5 lundis. */}
          <p className="mt-3 text-xs text-ardoise-400">
            Calculé sur le nombre réel de {meilleur.libelle}s de la période.
          </p>
        </>
      )}
    </section>
  );
}
