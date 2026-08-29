import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";
import { useId } from "react";

/**
 * Briques de formulaire communes aux écrans de connexion et d'inscription.
 *
 * Elles existent pour que l'accessibilité soit acquise par défaut plutôt que
 * refaite à chaque champ : label lié à son input, message d'erreur annoncé aux
 * lecteurs d'écran, `aria-invalid` posé.
 */

type ChampProps = InputHTMLAttributes<HTMLInputElement> & {
  libelle: string;
  erreur?: string | undefined;
  aide?: string | undefined;
};

export function Champ({ libelle, erreur, aide, ...props }: ChampProps) {
  const id = useId();
  const idErreur = `${id}-erreur`;
  const idAide = `${id}-aide`;
  const decrivePar = [erreur !== undefined ? idErreur : null, aide !== undefined ? idAide : null]
    .filter((v) => v !== null)
    .join(" ");

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-bold uppercase tracking-wider text-slate-700">
        {libelle}
      </label>
      <input
        id={id}
        {...props}
        aria-invalid={erreur !== undefined}
        {...(decrivePar === "" ? {} : { "aria-describedby": decrivePar })}
        className={`w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 font-medium
          placeholder:text-slate-400 outline-none transition-all shadow-xs
          focus:ring-3 focus:ring-indigo-500/15
          ${erreur === undefined ? "border-slate-200 focus:border-indigo-500" : "border-red-400 focus:border-red-500"}`}
      />
      {aide !== undefined && erreur === undefined && (
        <p id={idAide} className="text-xs text-slate-500">
          {aide}
        </p>
      )}
      {erreur !== undefined && (
        <p id={idErreur} className="text-xs font-semibold text-red-600">
          {erreur}
        </p>
      )}
    </div>
  );
}

type ListeProps = SelectHTMLAttributes<HTMLSelectElement> & {
  libelle: string;
  erreur?: string | undefined;
  children: ReactNode;
};

export function Liste({ libelle, erreur, children, ...props }: ListeProps) {
  const id = useId();

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-bold uppercase tracking-wider text-slate-700">
        {libelle}
      </label>
      <select
        id={id}
        {...props}
        aria-invalid={erreur !== undefined}
        className={`w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 font-medium outline-none
          transition-all shadow-xs focus:ring-3 focus:ring-indigo-500/15
          ${erreur === undefined ? "border-slate-200 focus:border-indigo-500" : "border-red-400 focus:border-red-500"}`}
      >
        {children}
      </select>
      {erreur !== undefined && <p className="text-xs font-semibold text-red-600">{erreur}</p>}
    </div>
  );
}

export function Bouton({
  children,
  charge = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { charge?: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      {...props}
      disabled={charge === true || props.disabled === true}
      className="w-full rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-600 to-purple-600 px-4 py-3 font-bold text-white shadow-md
        transition-all hover:brightness-105 active:scale-[0.99] focus:outline-none focus:ring-3 focus:ring-indigo-500/30
        disabled:cursor-not-allowed disabled:opacity-60 text-sm"
    >
      {charge ? "Vérification en cours…" : children}
    </button>
  );
}

/** Bandeau d'erreur générale, annoncé aux lecteurs d'écran dès son apparition. */
export function Alerte({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700 shadow-xs"
    >
      {children}
    </div>
  );
}
