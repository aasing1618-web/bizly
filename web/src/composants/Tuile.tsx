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

  /**
   * Quand le signe a été traversé, le serveur ne rend pas de pourcentage : seul
   * l'écart en montant reste lisible (spécification métier §3.5). Un bénéfice
   * passant de +20 € à −60 € s'affiche « −80,00 € », pas « −400,0 % ».
   */
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
    <div className="rounded-2xl border border-white/10 bg-ardoise-900 p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-ardoise-400">{titre}</p>

      <p
        className={`mt-2 text-2xl font-semibold tabular-nums tracking-tight ${
          valeur === null ? "text-ardoise-400" : ""
        }`}
      >
        {valeurAffichee}
      </p>

      <p className="mt-1 text-xs">
        {base_nulle ? (
          <span className="text-ardoise-400">nouveau sur cette période</span>
        ) : secondaire === null ? (
          <span className="text-ardoise-400">—</span>
        ) : (
          <span className={amelioration === true ? "text-menthe-400" : "text-corail-400"}>
            {secondaire.texte}
          </span>
        )}
        {precision !== undefined && <span className="ml-1 text-ardoise-400">{precision}</span>}
      </p>
    </div>
  );
}

/** Tuile sans comparaison — la marge, par exemple. */
export function TuilePourcent({ titre, valeur }: { titre: string; valeur: number | null }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-ardoise-900 p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-ardoise-400">{titre}</p>
      <p
        className={`mt-2 text-2xl font-semibold tabular-nums tracking-tight ${
          valeur === null ? "text-ardoise-400" : ""
        }`}
      >
        {valeur === null ? VALEUR_NON_CALCULABLE : formaterPourcent(valeur, { signe: false })}
      </p>
      <p className="mt-1 text-xs text-ardoise-400">
        {valeur === null ? "aucun chiffre d'affaires" : "du chiffre d'affaires"}
      </p>
    </div>
  );
}
