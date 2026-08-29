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
      <p className="py-8 text-center text-xs font-medium text-slate-500">
        Aucune vente enregistrée sur cette période.
      </p>
    );
  }

  const pasEtiquette = Math.max(1, Math.ceil(points.length / 7));

  return (
    <figure>
      <div className="flex h-44 items-end gap-1.5 pt-4 pb-2" role="presentation">
        {points.map((point) => {
          const hauteur = maximum === 0 ? 0 : Math.max(4, (point.ca / maximum) * 100);
          return (
            <div
              key={point.date_locale}
              className="group relative flex-1"
              style={{ height: "100%" }}
            >
              <div
                className={`absolute bottom-0 w-full rounded-t-md transition-all duration-200 ${
                  point.ca === 0
                    ? "bg-slate-100"
                    : "bg-gradient-to-t from-indigo-500 to-indigo-400 group-hover:from-indigo-600 group-hover:to-purple-500 shadow-xs"
                }`}
                style={{ height: point.ca === 0 ? "4px" : `${hauteur}%` }}
              />
              <span
                className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden
                  -translate-x-1/2 whitespace-nowrap rounded-lg border border-slate-200
                  bg-slate-900 px-3 py-1.5 text-xs text-white shadow-xl group-hover:block"
              >
                {formaterJourCourt(point.date_locale)} · {formaterMontant(point.ca, devise)}
                {point.nombre_ventes > 0 && ` · ${point.nombre_ventes} vente(s)`}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex justify-between text-[11px] font-semibold text-slate-400">
        {points
          .filter((_, index) => index % pasEtiquette === 0)
          .map((point) => (
            <span key={point.date_locale}>{formaterJourCourt(point.date_locale)}</span>
          ))}
      </div>

      <details className="mt-4 pt-3 border-t border-slate-100">
        <summary className="cursor-pointer text-xs font-semibold text-indigo-600 hover:text-indigo-800">
          Voir le détail quotidien en chiffres
        </summary>
        <table className="mt-3 w-full text-xs">
          <caption className="sr-only">Chiffre d&apos;affaires par jour</caption>
          <thead className="text-left text-slate-400 uppercase tracking-wider">
            <tr>
              <th className="font-semibold py-1.5">Date</th>
              <th className="text-right font-semibold py-1.5">CA Total</th>
              <th className="text-right font-semibold py-1.5">Nb Ventes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {points
              .filter((point) => point.ca !== 0)
              .map((point) => (
                <tr key={point.date_locale}>
                  <td className="py-2 font-medium text-slate-700 tabular-nums">{point.date_locale}</td>
                  <td className="py-2 text-right font-bold text-slate-900 tabular-nums">
                    {formaterMontant(point.ca, devise)}
                  </td>
                  <td className="py-2 text-right font-semibold text-slate-600 tabular-nums">{point.nombre_ventes}</td>
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
    <section className="bizly-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">{titre}</h3>
        <span className="pill-tag pill-indigo">Répartition</span>
      </div>

      {parts.length === 0 ? (
        <p className="mt-4 text-xs font-medium text-slate-500">{vide}</p>
      ) : (
        <ul className="mt-4 space-y-3.5">
          {parts.map((part) => (
            <li key={part.id}>
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-semibold text-slate-800 truncate">{part.libelle}</span>
                <span className="shrink-0 tabular-nums font-bold text-slate-900">
                  {formaterMontant(part.montant, devise)}
                  <span className="ml-2 pill-tag pill-indigo py-0.5 px-2">
                    {formaterPourcent(part.part_dixiemes, { signe: false })}
                  </span>
                </span>
              </div>
              <div className="mt-2 thin-progress">
                <div
                  className="thin-progress-bar bg-gradient-to-r from-indigo-500 to-purple-500"
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
