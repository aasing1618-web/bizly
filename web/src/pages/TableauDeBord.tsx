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
import { HandwritingSvg } from "@/components/ui/handwriting-svg";
import { WaterRippleImage } from "@/components/ui/water-ripple-image";

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
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 md:p-8 text-white shadow-xl">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="pill-tag bg-white/10 text-amber-300 border-white/20">
                ⚡ Analytics Financiers
              </span>
              <span className="text-xs font-semibold text-slate-300">En direct</span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-amber-400 py-1">
              Dashboard
            </h1>
            <p className="text-xs text-slate-300 max-w-xl font-medium leading-relaxed">
              Vue synthétique de votre activité commerciale, bénéfices nets et performance par produit.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <nav className="flex flex-wrap gap-2" aria-label="Période">
          {PERIODES.map((cle) => (
            <button
              key={cle}
              type="button"
              onClick={() => setPeriode(cle)}
              aria-pressed={periode === cle}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
                periode === cle
                  ? "pill-tag pill-indigo shadow-xs scale-105"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              {LIBELLES_PERIODE[cle]}
            </button>
          ))}
        </nav>
      </div>

      {erreur !== null && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-700 shadow-xs"
        >
          {erreur}
        </div>
      )}

      {donnees === null ? (
        <div className="bizly-card p-12 text-center text-sm font-medium text-slate-500" role="status">
          {chargement ? "Calcul en cours…" : "Aucune donnée disponible."}
        </div>
      ) : (
        <div className={chargement ? "opacity-60 transition-opacity space-y-6" : "transition-opacity space-y-6"}>
          <Entete donnees={donnees} />

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
            <Tuile titre="Bénéfice Net" indicateur={donnees.kpi.benefice} devise={devise} />
            <TuilePourcent titre="Marge Globale" valeur={donnees.kpi.marge_pourcent.valeur} />

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

          <div className="bizly-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Chiffre d&apos;affaires jour par jour
              </h3>
              <span className="pill-tag pill-cyan">Évolution</span>
            </div>
            <SerieJournaliere points={donnees.serie_ca_par_jour} devise={devise} />
          </div>

          <div className="grid gap-6 md:grid-cols-2">
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

          <div className="grid gap-6 md:grid-cols-2">
            <TopProduits produits={donnees.top_produits} devise={devise} />
            <MeilleurJour donnees={donnees} devise={devise} />
          </div>

          <div className="flex justify-center pt-4 pb-6">
            <div className="relative w-full max-w-xl h-64 sm:h-80 rounded-2xl overflow-hidden shadow-2xl border border-slate-200/80 transition-transform duration-300 hover:scale-[1.01]">
              <WaterRippleImage
                blueish={0.45}
                scale={6}
                illumination={0.18}
                surfaceDistortion={0.05}
                waterDistortion={0.03}
                src="/photos/growth.jfif"
                showControls={false}
                className="w-full h-full"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Entete({ donnees }: { donnees: ReponseTableauDeBord }) {
  const { periode, comparaison } = donnees;

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 bizly-card p-4">
      <p className="text-xs font-semibold text-slate-600">
        Du <strong className="text-slate-900">{formaterDateLocale(periode.debut_local)}</strong> au{" "}
        <strong className="text-slate-900">{formaterDateLocale(periode.fin_local)}</strong>
        {periode.en_cours && <span className="ml-2 pill-tag pill-amber">période en cours</span>}
      </p>

      <p className="text-xs font-semibold text-slate-500">
        comparé au {formaterDateLocale(comparaison.debut_local)} –{" "}
        {formaterDateLocale(comparaison.fin_local)}
        {comparaison.a_date && (
          <span className="ml-1.5 pill-tag pill-indigo">à date</span>
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
    <section className="bizly-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Produits les plus vendus</h3>
        <span className="pill-tag pill-pink">Top Articles</span>
      </div>

      {produits.length === 0 ? (
        <p className="mt-4 text-xs font-medium text-slate-500">
          Aucune vente détaillée en lignes sur cette période. Détaillez vos ventes pour voir
          apparaître ce classement.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100 text-xs">
          {produits.map((produit) => (
            <li key={produit.libelle} className="flex items-center justify-between py-2.5 gap-3">
              <span className="font-semibold text-slate-800 truncate">{produit.libelle}</span>
              <span className="shrink-0 tabular-nums font-bold text-slate-900">
                <span className="text-slate-400 font-normal">{Number(produit.quantite)} ×</span>{" "}
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
    <section className="bizly-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Meilleur jour de la semaine</h3>
        <span className="pill-tag pill-emerald">Pic d'Activité</span>
      </div>

      {meilleur === null ? (
        <p className="mt-4 text-xs font-medium text-slate-500">Pas encore assez de ventes.</p>
      ) : (
        <>
          <p className="mt-2 text-2xl font-extrabold capitalize tracking-tight text-slate-900">{meilleur.libelle}</p>
          <p className="mt-1 text-xs font-semibold text-indigo-600">
            {formaterMontant(meilleur.ca_moyen, devise)} en moyenne par {meilleur.libelle}
          </p>
          <p className="mt-3 text-[11px] text-slate-400">
            Calculé sur le nombre réel de {meilleur.libelle}s de la période.
          </p>
        </>
      )}
    </section>
  );
}
