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

const PERIODES: ClePeriode[] = ["jour", "semaine", "mois", "trimestre", "annee"];

/**
 * Les questions intelligentes.
 *
 * Chaque carte affiche la réponse **ou** la raison pour laquelle elle n'est pas
 * calculable. Jamais un zéro à la place d'une donnée manquante : c'est la règle
 * qui gouverne tout le moteur.
 */
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
          {chargement ? "Analyse en cours…" : "Aucune donnée."}
        </p>
      ) : (
        <div className={chargement ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <p className="text-sm text-ardoise-400">
            Du <strong className="text-slate-200">{formaterDateLocale(donnees.periode.debut_local)}</strong>{" "}
            au <strong className="text-slate-200">{formaterDateLocale(donnees.periode.fin_local)}</strong>
            {donnees.comparaison.a_date && (
              <span className="ml-2 rounded bg-white/5 px-1.5 py-0.5 text-xs">
                comparé au {formaterDateLocale(donnees.comparaison.debut_local)} –{" "}
                {formaterDateLocale(donnees.comparaison.fin_local)}
              </span>
            )}
          </p>

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
    <article className="flex flex-col rounded-2xl border border-white/10 bg-ardoise-900 p-5">
      <h3 className="text-sm font-medium text-slate-200">{question.question}</h3>

      {/* La réponse en une phrase, formulée par le serveur. Elle vient AVANT
          les chiffres : c'est elle qui répond réellement à la question posée,
          le détail chiffré est là pour vérifier. */}
      <p
        className={`mt-2 text-sm leading-relaxed ${
          question.disponible ? "text-slate-300" : "text-ardoise-400"
        }`}
      >
        {question.phrase}
      </p>

      <div className="mt-4 grow">
        {question.disponible && <Reponse question={question} devise={devise} />}
      </div>

      {/* Traçabilité : d'un chiffre affiché on remonte à la règle qui l'a produit. */}
      <p className="mt-4 text-[0.7rem] uppercase tracking-wide text-ardoise-400/60">
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
        <div>
          <p className="text-2xl font-semibold tabular-nums tracking-tight">
            {indicateur.valeur === null
              ? VALEUR_NON_CALCULABLE
              : formaterMontant(indicateur.valeur, devise)}
          </p>
          <Evolution indicateur={indicateur} devise={devise} />
        </div>
      )}

      {classement !== undefined &&
        (classement.length === 0 ? (
          <p className="text-sm text-menthe-400">Aucun — tout le monde a acheté récemment.</p>
        ) : (
          <ol className="space-y-1.5 text-sm">
            {classement.map((element, rang) => (
              <li key={element.id} className="flex items-baseline justify-between gap-3">
                <span className="truncate">
                  <span className="mr-2 text-ardoise-400 tabular-nums">{rang + 1}.</span>
                  {element.libelle}
                  {element.ex_aequo === true && (
                    <span className="ml-1.5 text-xs text-ardoise-400">ex æquo</span>
                  )}
                </span>
                <span className="shrink-0 tabular-nums font-medium">
                  {valeurAffichee(element, devise)}
                  {element.part_dixiemes !== undefined && (
                    <span className="ml-2 text-xs font-normal text-ardoise-400">
                      {formaterPourcent(element.part_dixiemes, { signe: false })}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        ))}

      {complements !== undefined && complements.length > 0 && (
        <dl className="space-y-0.5 border-t border-white/5 pt-2 text-xs text-ardoise-400">
          {complements.map((complement) => (
            <div key={complement.libelle} className="flex justify-between gap-3">
              <dt className="truncate">{complement.libelle}</dt>
              <dd className="shrink-0 tabular-nums text-slate-200">
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
    return <p className="mt-1 text-xs text-ardoise-400">nouveau sur cette période</p>;
  }

  // Signe traversé : le serveur ne rend pas de pourcentage, seul le montant est
  // lisible (spécification métier §3.5).
  const secondaire =
    evolution_pourcent !== null
      ? { texte: formaterPourcent(evolution_pourcent), signe: evolution_pourcent }
      : evolution_montant !== null
        ? {
            texte: `${evolution_montant >= 0 ? "+" : "−"}${formaterMontant(Math.abs(evolution_montant), devise)}`,
            signe: evolution_montant,
          }
        : null;

  if (secondaire === null) return <p className="mt-1 text-xs text-ardoise-400">—</p>;

  return (
    <p
      className={`mt-1 text-xs ${secondaire.signe >= 0 ? "text-menthe-400" : "text-corail-400"}`}
    >
      {secondaire.texte}
    </p>
  );
}
