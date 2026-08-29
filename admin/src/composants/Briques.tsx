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
    <section className="rounded-2xl border border-white/10 bg-ardoise-900 p-6">
      {titre !== undefined && (
        <h2 className="mb-4 text-sm font-medium uppercase tracking-[0.16em] text-ardoise-400">
          {titre}
        </h2>
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
      <label htmlFor={id} className="block text-sm font-medium text-slate-200">
        {libelle}
      </label>
      <input
        id={id}
        {...props}
        aria-invalid={erreur !== undefined}
        className={`w-full rounded-lg border bg-black/30 px-3 py-2.5 text-slate-100
          placeholder:text-ardoise-400/60 outline-none transition
          focus:ring-2 focus:ring-ambre-400/40
          ${erreur === undefined ? "border-white/10 focus:border-ambre-400/60" : "border-corail-400/60"}`}
      />
      {aide !== undefined && erreur === undefined && (
        <p className="text-xs text-ardoise-400">{aide}</p>
      )}
      {erreur !== undefined && <p className="text-xs text-corail-400">{erreur}</p>}
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
      <label htmlFor={id} className="block text-xs font-medium text-ardoise-400">
        {libelle}
      </label>
      <select
        id={id}
        {...props}
        className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm
          text-slate-100 outline-none transition focus:border-ambre-400/60 focus:ring-2
          focus:ring-ambre-400/40"
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
    principal: "bg-ambre-400 text-ardoise-950 hover:brightness-110",
    discret: "border border-white/15 text-slate-200 hover:border-white/35",
    danger: "border border-corail-400/50 text-corail-400 hover:bg-corail-400/10",
  }[variante];

  return (
    <button
      {...props}
      disabled={charge || props.disabled === true}
      className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition
        focus:outline-none focus:ring-2 focus:ring-ambre-400/50
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
      className="rounded-lg border border-corail-400/40 bg-corail-400/10 px-3 py-2.5 text-sm text-corail-400"
    >
      {children}
    </div>
  );
}

export function Confirmation({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="rounded-lg border border-menthe-400/40 bg-menthe-400/10 px-3 py-2.5 text-sm text-menthe-400"
    >
      {children}
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
    neutre: "border-white/15 text-ardoise-400",
    positif: "border-menthe-400/40 text-menthe-400",
    alerte: "border-corail-400/40 text-corail-400",
  }[ton];

  return (
    <span className={`rounded border px-1.5 py-0.5 text-xs font-medium ${styles}`}>{children}</span>
  );
}
