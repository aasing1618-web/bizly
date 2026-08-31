import { useCallback, useEffect, useState } from "react";
import {
  formaterMontant,
  formaterPourcent,
  LIBELLES_PERIODE,
  VALEUR_NON_CALCULABLE,
  type ClePeriode,
  type Devise,
  type ElementClassement,
  type Question,
  type ReponseQuestions,
} from "@bizly/shared";
import { appelApi, ErreurApiClient } from "../lib/api";
import { formaterDateLocale } from "../lib/tableauDeBord";
import { HandwritingSvg } from "@/components/ui/handwriting-svg";

const PERIODES: ClePeriode[] = ["jour", "semaine", "mois", "trimestre", "annee"];

export function SectionQuestions({ devise }: { devise: Devise }) {
  const [periode, setPeriode] = useState<ClePeriode>("mois");
  const [donnees, setDonnees] = useState<ReponseQuestions | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async (cle: ClePeriode, signal: AbortSignal) => {
    setChargement(true);
    try {
      setDonnees(
        await appelApi<ReponseQuestions>(`/questions?periode=${cle}`, { signal }),
      );
      setErreur(null);
    } catch (cause) {
      if (signal.aborted) return;
      setErreur(cause instanceof ErreurApiClient ? cause.message : "Chargement impossible.");
    } finally {
      if (!signal.aborted) setChargement(false);
    }
  }, []);

  useEffect(() => {
    const controleur = new AbortController();
    void charger(periode, controleur.signal);
    return () => controleur.abort();
  }, [periode, charger]);

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-purple-950 to-indigo-950 p-5 sm:p-8 text-white shadow-xl">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-full">
            <div className="flex flex-wrap items-center gap-2">
              <span className="pill-tag bg-white/10 text-amber-300 border-white/20">
                💡 Moteur de Décision Bizly
              </span>
              <span className="text-xs font-semibold text-purple-200">14 indicateurs clés</span>
            </div>

            <div className="flex items-center gap-4 max-w-full overflow-hidden">
              <HandwritingSvg
                text="Questions Intelligentes"
                width={320}
                height={60}
                fontSize={32}
                strokeWidth={1.5}
                duration={2.5}
                className="text-amber-400 max-w-full"
              />
            </div>
            <p className="text-xs text-purple-100 max-w-xl font-medium leading-relaxed">
              Des réponses formulées directement en français sans calcul à la main pour guider vos choix stratégiques.
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
          {chargement ? "Analyse financière en cours…" : "Aucune donnée disponible."}
        </div>
      ) : (
        <div className={chargement ? "opacity-60 transition-opacity space-y-6" : "transition-opacity space-y-6"}>
          <header className="flex flex-wrap items-center justify-between gap-3 bizly-card p-4">
            <p className="text-xs font-semibold text-slate-600">
              Du <strong className="text-slate-900">{formaterDateLocale(donnees.periode.debut_local)}</strong> au{" "}
              <strong className="text-slate-900">{formaterDateLocale(donnees.periode.fin_local)}</strong>
            </p>
            {donnees.comparaison.a_date && (
              <span className="pill-tag pill-indigo text-xs">
                comparé au {formaterDateLocale(donnees.comparaison.debut_local)} – {formaterDateLocale(donnees.comparaison.fin_local)}
              </span>
            )}
          </header>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {donnees.questions.map((question) => (
              <CarteQuestion key={question.id} question={question} devise={devise} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CarteQuestion({ question, devise }: { question: Question; devise: Devise }) {
  return (
    <article className="bizly-card p-6 flex flex-col justify-between relative overflow-hidden group">
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="text-xs font-bold text-slate-900 leading-snug">{question.question}</h3>
          <span className={`pill-tag ${question.disponible ? "pill-indigo" : "pill-amber"}`}>
            {question.disponible ? "Calculé" : "Info"}
          </span>
        </div>

        <p
          className={`mt-2 text-xs leading-relaxed font-medium ${
            question.disponible ? "text-slate-700" : "text-slate-400 italic"
          }`}
        >
          {question.phrase}
        </p>

        <div className="mt-4 grow">
          {question.disponible && <Reponse question={question} devise={devise} />}
        </div>
      </div>

      <p className="mt-4 pt-3 border-t border-slate-100 text-[10px] uppercase tracking-wider font-semibold text-slate-400">
        {question.formule}
      </p>
    </article>
  );
}

function Reponse({ question, devise }: { question: Question; devise: Devise }) {
  const { indicateur, classement, complements } = question;

  return (
    <div className="space-y-3">
      {indicateur !== undefined && (
        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
          <p className="text-xl font-extrabold text-slate-900 tabular-nums tracking-tight">
            {indicateur.valeur === null
              ? VALEUR_NON_CALCULABLE
              : formaterMontant(indicateur.valeur, devise)}
          </p>
          <Evolution indicateur={indicateur} devise={devise} />
        </div>
      )}

      {classement !== undefined &&
        (classement.length === 0 ? (
          <p className="text-xs font-semibold text-emerald-600">Aucun — tout le monde a acheté récemment.</p>
        ) : (
          <ol className="space-y-2 text-xs">
            {classement.map((element, rang) => (
              <li key={element.id} className="flex items-center justify-between gap-3 py-1 border-b border-slate-100 last:border-0">
                <span className="truncate font-semibold text-slate-800">
                  <span className="mr-2 pill-tag pill-indigo py-0.5 px-1.5 tabular-nums">{rang + 1}</span>
                  {element.libelle}
                  {element.ex_aequo === true && (
                    <span className="ml-1.5 text-[10px] text-slate-400">ex æquo</span>
                  )}
                </span>
                <span className="shrink-0 tabular-nums font-extrabold text-slate-900">
                  {valeurAffichee(element, devise)}
                  {element.part_dixiemes !== undefined && (
                    <span className="ml-1.5 pill-tag pill-pink py-0.5 px-1">
                      {formaterPourcent(element.part_dixiemes, { signe: false })}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        ))}

      {complements !== undefined && complements.length > 0 && (
        <dl className="space-y-1 border-t border-slate-100 pt-2 text-[11px]">
          {complements.map((complement) => (
            <div key={complement.libelle} className="flex justify-between gap-3">
              <dt className="truncate text-slate-500 font-medium">{complement.libelle}</dt>
              <dd className="shrink-0 tabular-nums font-bold text-slate-900">
                {complement.unite === "montant"
                  ? formaterMontant(complement.valeur, devise)
                  : new Intl.NumberFormat("fr-FR").format(complement.valeur)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function valeurAffichee(element: ElementClassement, devise: Devise): string {
  switch (element.unite) {
    case "montant":
      return formaterMontant(element.valeur, devise);
    case "pourcent":
      return formaterPourcent(element.valeur, { signe: false });
    case "jours":
      return `${element.valeur} j`;
    case "quantite":
      return new Intl.NumberFormat("fr-FR").format(element.valeur);
  }
}

function Evolution({
  indicateur,
  devise,
}: {
  indicateur: NonNullable<Question["indicateur"]>;
  devise: Devise;
}) {
  const { evolution_pourcent, evolution_montant, base_nulle } = indicateur;

  if (base_nulle) {
    return <p className="mt-1 text-xs font-semibold text-slate-400">nouveau sur cette période</p>;
  }

  const secondaire =
    evolution_pourcent !== null
      ? { texte: formaterPourcent(evolution_pourcent), signe: evolution_pourcent }
      : evolution_montant !== null
        ? {
            texte: `${evolution_montant >= 0 ? "+" : "−"}${formaterMontant(Math.abs(evolution_montant), devise)}`,
            signe: evolution_montant,
          }
        : null;

  if (secondaire === null) return <p className="mt-1 text-xs text-slate-400">—</p>;

  return (
    <p
      className={`mt-1 text-xs font-bold ${secondaire.signe >= 0 ? "text-emerald-600" : "text-red-600"}`}
    >
      {secondaire.texte}
    </p>
  );
}
