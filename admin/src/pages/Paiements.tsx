import { useCallback, useEffect, useState } from "react";
import type { PaiementAValider } from "@bizly/shared";
import { Alerte, Bouton, Carte, Confirmation, Etiquette } from "../composants/Briques";
import { appelAdmin, ErreurApiAdmin } from "../lib/api";

/**
 * Paiements Wave déclarés par les clients, en attente de vérification.
 *
 * Le geste central de la console : le client a envoyé de l'argent sur le
 * numéro Wave, il a déclaré sa référence, et un clic ici lui rouvre l'accès
 * pour un mois. La référence Wave et l'e-mail du propriétaire sont affichés
 * côte à côte parce que ce sont exactement les deux éléments à retrouver dans
 * l'historique Wave avant de valider.
 *
 * Rien n'est validé automatiquement : c'est une décision humaine, prise après
 * avoir vu l'argent arriver.
 */

const FRANCS = new Intl.NumberFormat("fr-FR");

function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function Paiements() {
  const [elements, setElements] = useState<PaiementAValider[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [refusPour, setRefusPour] = useState<string | null>(null);
  const [motif, setMotif] = useState("");

  const charger = useCallback(async (signal?: AbortSignal) => {
    try {
      const reponse = await appelAdmin<{ elements: PaiementAValider[] }>("/paiements", {
        ...(signal === undefined ? {} : { signal }),
      });
      setElements(reponse.elements);
    } catch (cause) {
      if (signal?.aborted === true) return;
      setErreur(cause instanceof ErreurApiAdmin ? cause.message : "Chargement impossible.");
    }
  }, []);

  useEffect(() => {
    const controleur = new AbortController();
    void charger(controleur.signal);
    return () => controleur.abort();
  }, [charger]);

  async function valider(paiement: PaiementAValider) {
    setErreur(null);
    setSucces(null);
    setEnCours(paiement.id);

    try {
      const resultat = await appelAdmin<{ abonnement_expire_le: string }>(
        `/paiements/${paiement.id}/valider`,
        { methode: "POST" },
      );
      setSucces(
        `Paiement validé : ${paiement.entreprise_nom} a de nouveau accès jusqu'au ` +
          `${new Date(resultat.abonnement_expire_le).toLocaleDateString("fr-FR")}.`,
      );
      await charger();
    } catch (cause) {
      setErreur(cause instanceof ErreurApiAdmin ? cause.message : "Validation impossible.");
    } finally {
      setEnCours(null);
    }
  }

  async function refuser(paiement: PaiementAValider) {
    setErreur(null);
    setSucces(null);
    setEnCours(paiement.id);

    try {
      await appelAdmin<void>(`/paiements/${paiement.id}/refuser`, {
        methode: "POST",
        corps: { motif: motif.trim() },
      });
      setSucces(`Paiement refusé. ${paiement.entreprise_nom} verra votre motif.`);
      setRefusPour(null);
      setMotif("");
      await charger();
    } catch (cause) {
      setErreur(cause instanceof ErreurApiAdmin ? cause.message : "Refus impossible.");
    } finally {
      setEnCours(null);
    }
  }

  return (
    <Carte titre="Paiements Wave à valider">
      <div className="space-y-4">
        {erreur !== null && <Alerte>{erreur}</Alerte>}
        {succes !== null && <Confirmation>{succes}</Confirmation>}

        {elements === null && (
          <p className="py-4 text-xs font-medium text-slate-500" role="status">
            Chargement…
          </p>
        )}

        {elements !== null && elements.length === 0 && (
          <p className="py-6 text-center text-xs font-medium text-slate-500">
            Aucun paiement en attente. Les déclarations des clients apparaîtront ici.
          </p>
        )}

        {elements !== null &&
          elements.map((paiement) => (
            <div
              key={paiement.id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900">{paiement.entreprise_nom}</p>
                  <p className="truncate text-xs font-medium text-slate-500">
                    {paiement.proprietaire_email ?? "propriétaire inconnu"}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    Référence Wave&nbsp;:{" "}
                    <span className="font-mono text-sm font-bold text-slate-900">
                      {paiement.reference_wave ?? "—"}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Déclaré le {dateCourte(paiement.cree_le)}
                  </p>
                </div>

                <div className="text-right">
                  <Etiquette ton="alerte">En attente</Etiquette>
                  <p className="mt-2 text-lg font-black tabular-nums text-slate-900">
                    {FRANCS.format(paiement.montant)} {paiement.devise}
                  </p>
                </div>
              </div>

              {refusPour === paiement.id ? (
                <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Motif du refus — le client le lira
                  </label>
                  <input
                    value={motif}
                    onChange={(e) => setMotif(e.target.value)}
                    placeholder="Aucun versement retrouvé avec cette référence."
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={motif.trim().length < 3 || enCours === paiement.id}
                      onClick={() => void refuser(paiement)}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
                    >
                      Confirmer le refus
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRefusPour(null);
                        setMotif("");
                      }}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  <Bouton
                    type="button"
                    charge={enCours === paiement.id}
                    onClick={() => void valider(paiement)}
                  >
                    Valider le paiement
                  </Bouton>
                  <button
                    type="button"
                    onClick={() => setRefusPour(paiement.id)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    Refuser
                  </button>
                </div>
              )}
            </div>
          ))}
      </div>
    </Carte>
  );
}
