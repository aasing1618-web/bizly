import { useId } from "react";
import type { DeviseReferentiel } from "@bizly/shared";

/**
 * Choix de la devise.
 *
 * Les trois devises de la cible immédiate — franc CFA, euro, dollar — sont des
 * boutons ; les autres sont dans une liste. Ce n'est pas une hiérarchie de
 * valeur, c'est un raccourci : trois clics de moins pour la grande majorité des
 * comptes, et zéro perte pour les autres.
 *
 * L'aide affiche le nombre de décimales, parce que c'est ce qui surprend :
 * en franc CFA on saisit `1500`, jamais `1500,00`.
 */

export type ChoixDeviseProps = {
  devises: DeviseReferentiel[];
  rapides: string[];
  valeur: string;
  onChange: (code: string) => void;
  /** Explique pourquoi le choix est figé. Rend tout le bloc non modifiable. */
  verrou?: string | undefined;
  erreur?: string | undefined;
};

export function ChoixDevise({
  devises,
  rapides,
  valeur,
  onChange,
  verrou,
  erreur,
}: ChoixDeviseProps) {
  const id = useId();
  const bloque = verrou !== undefined;

  const misesEnAvant = rapides
    .map((code) => devises.find((devise) => devise.code === code))
    .filter((devise): devise is DeviseReferentiel => devise !== undefined);

  const autres = devises.filter((devise) => !rapides.includes(devise.code));
  const choisie = devises.find((devise) => devise.code === valeur);
  const autreChoisie = choisie !== undefined && !rapides.includes(choisie.code);

  return (
    <fieldset className="space-y-2" disabled={bloque}>
      <legend className="mb-1.5 block text-sm font-medium text-slate-200">Devise</legend>

      <div className="grid grid-cols-3 gap-2">
        {misesEnAvant.map((devise) => {
          const active = devise.code === valeur;
          return (
            <button
              key={devise.code}
              type="button"
              onClick={() => onChange(devise.code)}
              aria-pressed={active}
              className={`rounded-lg border px-2 py-2.5 text-center transition disabled:cursor-not-allowed disabled:opacity-50 ${
                active
                  ? "border-menthe-400/70 bg-menthe-400/10 text-slate-100"
                  : "border-white/10 text-ardoise-400 hover:border-white/25 hover:text-slate-200"
              }`}
            >
              <span className="block text-base font-semibold">{devise.symbole}</span>
              <span className="block text-[0.7rem] leading-tight">{devise.code}</span>
            </button>
          );
        })}
      </div>

      <label htmlFor={id} className="sr-only">
        Une autre devise
      </label>
      <select
        id={id}
        value={autreChoisie ? valeur : ""}
        onChange={(evenement) => {
          if (evenement.target.value !== "") onChange(evenement.target.value);
        }}
        className={`w-full rounded-lg border bg-black/30 px-3 py-2 text-sm outline-none transition
          focus:ring-2 focus:ring-menthe-400/40 disabled:cursor-not-allowed disabled:opacity-50
          ${autreChoisie ? "border-menthe-400/60 text-slate-100" : "border-white/10 text-ardoise-400"}`}
      >
        <option value="" className="bg-ardoise-900">
          Une autre devise…
        </option>
        {autres.map((devise) => (
          <option key={devise.code} value={devise.code} className="bg-ardoise-900">
            {devise.libelle} ({devise.code})
          </option>
        ))}
      </select>

      {erreur !== undefined ? (
        <p className="text-xs text-corail-400">{erreur}</p>
      ) : bloque ? (
        <p className="text-xs text-ambre-400">{verrou}</p>
      ) : (
        <p className="text-xs text-ardoise-400">
          {choisie === undefined
            ? "Choisissez la devise de vos prix."
            : choisie.decimales === 0
              ? `Montants sans centimes : vous saisirez 1500, pas 1500,00.`
              : `Montants à ${choisie.decimales} décimales : vous saisirez 1500,00.`}
        </p>
      )}
    </fieldset>
  );
}
