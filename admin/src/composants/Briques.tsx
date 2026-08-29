import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";
import { useId } from "react";

/**
 * Briques d'interface de la console.
 *
 * Mêmes principes d'accessibilité que côté client : label lié à son champ,
 * erreur annoncée, `aria-invalid` posé. Volontairement plus sobre — cette
 * console est un outil interne, pas une vitrine.
 */

export function Carte({ titre, children }: { titre?: string; children: ReactNode }) {
  return (
    <section className="bizly-card p-6">
      {titre !== undefined && (
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            {titre}
          </h2>
          <span className="pill-tag pill-amber">Console Admin</span>
        </div>
      )}
      {children}
    </section>
  );
}

type ChampProps = InputHTMLAttributes<HTMLInputElement> & {
  libelle: string;
  erreur?: string | undefined;
  aide?: string | undefined;
};

export function Champ({ libelle, erreur, aide, ...props }: ChampProps) {
  const id = useId();

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-bold uppercase tracking-wider text-slate-700">
        {libelle}
      </label>
      <input
        id={id}
        {...props}
        aria-invalid={erreur !== undefined}
        className={`w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 font-medium
          placeholder:text-slate-400 outline-none transition-all shadow-xs
          focus:ring-3 focus:ring-amber-500/20
          ${erreur === undefined ? "border-slate-200 focus:border-amber-500" : "border-red-400 focus:border-red-500"}`}
      />
      {aide !== undefined && erreur === undefined && (
        <p className="text-xs text-slate-500">{aide}</p>
      )}
      {erreur !== undefined && <p className="text-xs font-semibold text-red-600">{erreur}</p>}
    </div>
  );
}

type ListeProps = SelectHTMLAttributes<HTMLSelectElement> & {
  libelle: string;
  children: ReactNode;
};

export function Liste({ libelle, children, ...props }: ListeProps) {
  const id = useId();

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-bold uppercase tracking-wider text-slate-700">
        {libelle}
      </label>
      <select
        id={id}
        {...props}
        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium
          text-slate-900 outline-none transition-all shadow-xs focus:border-amber-500 focus:ring-3
          focus:ring-amber-500/20"
      >
        {children}
      </select>
    </div>
  );
}

export function Bouton({
  children,
  charge = false,
  variante = "principal",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  charge?: boolean;
  variante?: "principal" | "discret" | "danger";
  children: ReactNode;
}) {
  const styles = {
    principal: "bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold shadow-md hover:brightness-105",
    discret: "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 font-semibold shadow-xs",
    danger: "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 font-semibold shadow-xs",
  }[variante];

  return (
    <button
      {...props}
      disabled={charge || props.disabled === true}
      className={`rounded-xl px-4 py-2.5 text-xs transition-all active:scale-[0.99]
        focus:outline-none focus:ring-3 focus:ring-amber-500/30
        disabled:cursor-not-allowed disabled:opacity-60 ${styles}`}
    >
      {charge ? "Un instant…" : children}
    </button>
  );
}

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

export function Confirmation({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800 shadow-xs"
    >
      ✓ {children}
    </p>
  );
}

export function Etiquette({
  ton,
  children,
}: {
  ton: "neutre" | "positif" | "alerte";
  children: ReactNode;
}) {
  const styles = {
    neutre: "pill-indigo",
    positif: "pill-emerald",
    alerte: "pill-red",
  }[ton];

  return (
    <span className={`pill-tag ${styles}`}>{children}</span>
  );
}
