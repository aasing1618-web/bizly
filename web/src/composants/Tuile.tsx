import {
  formaterMontant,
  formaterPourcent,
  VALEUR_NON_CALCULABLE,
  type Devise,
  type Indicateur,
} from "@bizly/shared";

/**
 * Tuile d'indicateur.
 *
 * Trois états à distinguer, et l'interface ne doit jamais les confondre :
 *
 * - une **valeur nulle** (0 €) : il y a bien eu zéro euro de ventes ;
 * - une valeur **non calculable** (`null`) : un panier moyen sans vente. On
 *   affiche « — », jamais « 0 € », qui ferait croire à des ventes à zéro euro ;
 * - une **base de comparaison nulle** : l'évolution n'existe pas. On affiche
 *   « nouveau », jamais « +100 % » ni « +∞ % ».
 */

export type TuileProps = {
  titre: string;
  indicateur: Indicateur;
  devise: Devise;
  /** `montant` formate en devise, `nombre` affiche un effectif brut. */
  format?: "montant" | "nombre";
  /** Pour les dépenses : une hausse n'est pas une bonne nouvelle. */
  hausseEstBonne?: boolean;
  precision?: string;
};

export function Tuile({
  titre,
  indicateur,
  devise,
  format = "montant",
  hausseEstBonne = true,
  precision,
}: TuileProps) {
  const { valeur, evolution_pourcent, evolution_montant, base_nulle } = indicateur;

  const valeurAffichee =
    valeur === null
      ? VALEUR_NON_CALCULABLE
      : format === "montant"
        ? formaterMontant(valeur, devise)
        : new Intl.NumberFormat("fr-FR").format(valeur);

  const secondaire =
    evolution_pourcent !== null
      ? { texte: formaterPourcent(evolution_pourcent), signe: evolution_pourcent }
      : evolution_montant !== null && !base_nulle && format === "montant"
        ? {
            texte: `${evolution_montant >= 0 ? "+" : "−"}${formaterMontant(Math.abs(evolution_montant), devise)}`,
            signe: evolution_montant,
          }
        : null;

  const amelioration =
    secondaire === null ? null : hausseEstBonne ? secondaire.signe >= 0 : secondaire.signe <= 0;

  return (
    <div className="bizly-card p-5 relative overflow-hidden group">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{titre}</p>
        {base_nulle ? (
          <span className="pill-tag pill-indigo">Nouveau</span>
        ) : secondaire !== null ? (
          <span className={`pill-tag ${amelioration === true ? "pill-emerald" : "pill-red"}`}>
            {secondaire.texte}
          </span>
        ) : null}
      </div>

      <p
        className={`mt-3 text-2xl font-extrabold tabular-nums tracking-tight ${
          valeur === null ? "text-slate-400" : "text-slate-900"
        }`}
      >
        {valeurAffichee}
      </p>

      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        <span>{precision ?? (base_nulle ? "Première enregistrement" : "vs période précédente")}</span>
      </div>

      <div className="mt-3 thin-progress">
        <div
          className={`thin-progress-bar ${
            amelioration === false ? "bg-red-500" : "bg-gradient-to-r from-indigo-500 to-emerald-500"
          }`}
          style={{ width: valeur === null ? "0%" : "75%" }}
        />
      </div>
    </div>
  );
}

/** Tuile sans comparaison — la marge, par exemple. */
export function TuilePourcent({ titre, valeur }: { titre: string; valeur: number | null }) {
  return (
    <div className="bizly-card p-5 relative overflow-hidden group">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{titre}</p>
        <span className="pill-tag pill-cyan">Rentabilité</span>
      </div>

      <p
        className={`mt-3 text-2xl font-extrabold tabular-nums tracking-tight ${
          valeur === null ? "text-slate-400" : "text-slate-900"
        }`}
      >
        {valeur === null ? VALEUR_NON_CALCULABLE : formaterPourcent(valeur, { signe: false })}
      </p>

      <div className="mt-3 text-xs text-slate-500">
        {valeur === null ? "aucun chiffre d'affaires" : "du chiffre d'affaires global"}
      </div>

      <div className="mt-3 thin-progress">
        <div
          className="thin-progress-bar bg-gradient-to-r from-cyan-500 to-blue-600"
          style={{ width: valeur === null ? "0%" : `${Math.min(Math.max(valeur / 10, 5), 100)}%` }}
        />
      </div>
    </div>
  );
}
