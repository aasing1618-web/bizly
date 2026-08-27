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
      <label htmlFor={id} className="block text-sm font-medium text-slate-200">
        {libelle}
      </label>
      <input
        id={id}
        {...props}
        aria-invalid={erreur !== undefined}
        {...(decrivePar === "" ? {} : { "aria-describedby": decrivePar })}
        className={`w-full rounded-lg border bg-black/30 px-3 py-2.5 text-slate-100
          placeholder:text-ardoise-400/60 outline-none transition
          focus:ring-2 focus:ring-menthe-400/40
          ${erreur === undefined ? "border-white/10 focus:border-menthe-400/60" : "border-corail-400/60"}`}
      />
      {aide !== undefined && erreur === undefined && (
        <p id={idAide} className="text-xs text-ardoise-400">
          {aide}
        </p>
      )}
      {erreur !== undefined && (
        <p id={idErreur} className="text-xs text-corail-400">
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
      <label htmlFor={id} className="block text-sm font-medium text-slate-200">
        {libelle}
      </label>
      <select
        id={id}
        {...props}
        aria-invalid={erreur !== undefined}
        className={`w-full rounded-lg border bg-black/30 px-3 py-2.5 text-slate-100 outline-none
          transition focus:ring-2 focus:ring-menthe-400/40
          ${erreur === undefined ? "border-white/10 focus:border-menthe-400/60" : "border-corail-400/60"}`}
      >
        {children}
      </select>
      {erreur !== undefined && <p className="text-xs text-corail-400">{erreur}</p>}
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
      className="w-full rounded-lg bg-menthe-400 px-4 py-2.5 font-semibold text-ardoise-950
        transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-menthe-400/50
        disabled:cursor-not-allowed disabled:opacity-60"
    >
      {charge ? "Un instant…" : children}
    </button>
  );
}

/** Bandeau d'erreur générale, annoncé aux lecteurs d'écran dès son apparition. */
export function Alerte({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-corail-400/40 bg-corail-400/10 px-3 py-2.5 text-sm text-corail-400"
    >
      {children}
    </div>
  );
}
