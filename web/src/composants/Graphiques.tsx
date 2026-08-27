import {
  formaterMontant,
  formaterPourcent,
  type Devise,
  type PartRepartition,
  type PointSerie,
} from "@bizly/shared";
import { formaterJourCourt } from "../lib/tableauDeBord";

/**
 * Graphiques du tableau de bord.
 *
 * Pas de bibliothèque de dataviz : deux formes suffisent, et une dépendance de
 * 200 ko pour dessiner des rectangles serait un mauvais échange. Tout est en
 * CSS, donc responsive et lisible par un lecteur d'écran via le tableau de
 * secours.
 */

export type SerieProps = {
  points: PointSerie[];
  devise: Devise;
};

export function SerieJournaliere({ points, devise }: SerieProps) {
  const maximum = points.reduce((max, point) => Math.max(max, point.ca), 0);
  const total = points.reduce((somme, point) => somme + point.ca, 0);

  if (total === 0) {
    return (
      <p className="py-8 text-center text-sm text-ardoise-400">
        Aucune vente sur cette période.
      </p>
    );
  }

  // Un jour sur cinq porte une étiquette : au-delà, elles se chevauchent sur un
  // mois complet.
  const pasEtiquette = Math.max(1, Math.ceil(points.length / 7));

  return (
    <figure>
      <div className="flex h-40 items-end gap-[2px]" role="presentation">
        {points.map((point) => {
          // Hauteur minimale de 2 % pour qu'un jour à faible chiffre reste
          // visible, et distinct d'un jour à zéro.
          const hauteur = maximum === 0 ? 0 : Math.max(2, (point.ca / maximum) * 100);
          return (
            <div
              key={point.date_locale}
              className="group relative flex-1"
              style={{ height: "100%" }}
            >
              <div
                className={`absolute bottom-0 w-full rounded-t transition-colors ${
                  point.ca === 0 ? "bg-white/5" : "bg-menthe-400/70 group-hover:bg-menthe-400"
                }`}
                style={{ height: point.ca === 0 ? "2px" : `${hauteur}%` }}
              />
              <span
                className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden
                  -translate-x-1/2 whitespace-nowrap rounded-md border border-white/10
                  bg-ardoise-950 px-2 py-1 text-xs group-hover:block"
              >
                {formaterJourCourt(point.date_locale)} · {formaterMontant(point.ca, devise)}
                {point.nombre_ventes > 0 && ` · ${point.nombre_ventes} vente(s)`}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex justify-between text-xs text-ardoise-400">
        {points
          .filter((_, index) => index % pasEtiquette === 0)
          .map((point) => (
            <span key={point.date_locale}>{formaterJourCourt(point.date_locale)}</span>
          ))}
      </div>

      {/* Le graphique est décoratif pour un lecteur d'écran ; les chiffres
          restent accessibles par ce tableau, replié par défaut. */}
      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-ardoise-400 hover:text-slate-200">
          Voir les chiffres jour par jour
        </summary>
        <table className="mt-2 w-full text-sm">
          <caption className="sr-only">Chiffre d&apos;affaires par jour</caption>
          <thead className="text-left text-xs text-ardoise-400">
            <tr>
              <th className="font-medium">Jour</th>
              <th className="text-right font-medium">CA</th>
              <th className="text-right font-medium">Ventes</th>
            </tr>
          </thead>
          <tbody>
            {points
              .filter((point) => point.ca !== 0)
              .map((point) => (
                <tr key={point.date_locale} className="border-t border-white/5">
                  <td className="py-1 tabular-nums">{point.date_locale}</td>
                  <td className="py-1 text-right tabular-nums">
                    {formaterMontant(point.ca, devise)}
                  </td>
                  <td className="py-1 text-right tabular-nums">{point.nombre_ventes}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

export type RepartitionProps = {
  titre: string;
  parts: PartRepartition[];
  devise: Devise;
  vide: string;
};

export function Repartition({ titre, parts, devise, vide }: RepartitionProps) {
  return (
    <section className="rounded-2xl border border-white/10 bg-ardoise-900 p-5">
      <h3 className="text-sm font-medium text-ardoise-400">{titre}</h3>

      {parts.length === 0 ? (
        <p className="mt-4 text-sm text-ardoise-400">{vide}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {parts.map((part) => (
            <li key={part.id}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate">{part.libelle}</span>
                <span className="shrink-0 tabular-nums">
                  {formaterMontant(part.montant, devise)}
                  <span className="ml-2 text-ardoise-400">
                    {formaterPourcent(part.part_dixiemes, { signe: false })}
                  </span>
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full bg-menthe-400/70"
                  style={{ width: `${part.part_dixiemes / 10}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
