import { useId } from "react";
import { analyserMontantSaisi, formaterMontant, type Devise } from "@bizly/shared";

/**
 * Champ de saisie d'un montant.
 *
 * Il travaille en **texte** et ne convertit qu'à la soumission, via
 * `analyserMontantSaisi` : convertir à chaque frappe empêcherait de taper
 * « 3,5 » (état intermédiaire « 3, » invalide) et ferait sauter le curseur.
 *
 * L'aperçu formaté sous le champ vient du montant réellement converti : ce que
 * l'utilisateur voit est donc exactement ce qui partira au serveur.
 */
export type ChampMontantProps = {
  libelle: string;
  valeur: string;
  onChange: (valeur: string) => void;
  devise: Devise;
  erreur?: string | undefined;
  requis?: boolean;
};

export function ChampMontant({
  libelle,
  valeur,
  onChange,
  devise,
  erreur,
  requis = true,
}: ChampMontantProps) {
  const id = useId();
  const mineur = analyserMontantSaisi(valeur, devise);
  const saisieCommencee = valeur.trim() !== "";
  const invalide = erreur !== undefined || (saisieCommencee && mineur === null);

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-slate-200">
        {libelle} <span className="text-ardoise-400">({devise.code})</span>
      </label>
      <input
        id={id}
        // `inputMode="decimal"` sort le pavé numérique sur mobile sans imposer
        // le point décimal d'un `type="number"`, qui rejetterait la virgule.
        inputMode="decimal"
        autoComplete="off"
        required={requis}
        value={valeur}
        onChange={(e) => onChange(e.target.value)}
        placeholder={devise.decimales === 0 ? "1750000" : "3450,50"}
        aria-invalid={invalide}
        className={`w-full rounded-lg border bg-black/30 px-3 py-2.5 text-right font-medium
          tabular-nums text-slate-100 outline-none transition
          focus:ring-2 focus:ring-menthe-400/40
          ${invalide ? "border-corail-400/60" : "border-white/10 focus:border-menthe-400/60"}`}
      />
      {erreur !== undefined ? (
        <p className="text-xs text-corail-400">{erreur}</p>
      ) : saisieCommencee && mineur === null ? (
        <p className="text-xs text-corail-400">
          Montant illisible
          {devise.decimales === 0
            ? " — cette devise n'a pas de décimales."
            : ` — au maximum ${devise.decimales} décimales.`}
        </p>
      ) : mineur !== null ? (
        <p className="text-xs text-ardoise-400">= {formaterMontant(mineur, devise)}</p>
      ) : null}
    </div>
  );
}
