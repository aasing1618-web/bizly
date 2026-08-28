import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  analyserMontantSaisi,
  formaterMontant,
  LIBELLES_MOYEN_PAIEMENT,
  montantVersSaisie,
  MOYENS_PAIEMENT,
  type Client,
  type Devise,
  type EntreeLigneVente,
  type Produit,
  type MoyenPaiement,
  type Vente,
} from "@bizly/shared";
import { Alerte, Bouton, Champ, Liste } from "../composants/Formulaire";
import { ChampMontant } from "../composants/ChampMontant";
import { ErreurApiClient } from "../lib/api";
import { aujourdhui, apiVentes } from "../lib/operations";
import { apiClients, apiProduits } from "../lib/catalogue";

type LigneSaisie = { produitId: string; libelle: string; quantite: string; prix: string };

const LIGNE_VIDE: LigneSaisie = { produitId: "", libelle: "", quantite: "1", prix: "" };

export function SectionVentes({ devise }: { devise: Devise }) {
  const [ventes, setVentes] = useState<Vente[]>([]);
  const [total, setTotal] = useState(0);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const [enEdition, setEnEdition] = useState<string | null>(null);
  const [date, setDate] = useState(aujourdhui());
  const [montant, setMontant] = useState("");
  const [moyen, setMoyen] = useState<MoyenPaiement | "">("");
  const [note, setNote] = useState("");
  const [lignes, setLignes] = useState<LigneSaisie[]>([]);
  const [clientId, setClientId] = useState("");
  const [produits, setProduits] = useState<Produit[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [envoi, setEnvoi] = useState(false);

  const recharger = useCallback(async () => {
    try {
      const page = await apiVentes.lister({ limite: 50 });
      setVentes(page.elements);
      setTotal(page.total);
      setErreur(null);
    } catch (cause) {
      setErreur(cause instanceof ErreurApiClient ? cause.message : "Chargement impossible.");
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void recharger();
    // Catalogue et clients servent aux listes déroulantes du formulaire. Leur
    // absence n'empêche pas de saisir : une ligne peut rester en texte libre.
    void apiProduits.lister({ limite: 200 }).then((p) => setProduits(p.elements)).catch(() => setProduits([]));
    void apiClients.lister({ limite: 200 }).then((c) => setClients(c.elements)).catch(() => setClients([]));
  }, [recharger]);

  function reinitialiser() {
    setEnEdition(null);
    setDate(aujourdhui());
    setMontant("");
    setMoyen("");
    setNote("");
    setLignes([]);
    setClientId("");
  }

  // Total prévisionnel des lignes, calculé pour l'aperçu seulement : le serveur
  // reste seul juge du montant enregistré (docs/API-CONTRACT.md §3.3).
  const apercuLignes = lignes.reduce((somme, ligne) => {
    const prix = analyserMontantSaisi(ligne.prix, devise);
    const quantite = Number(ligne.quantite.replace(",", "."));
    if (prix === null || !Number.isFinite(quantite) || quantite <= 0) return somme;
    return somme + Math.round(prix * quantite);
  }, 0);

  async function soumettre(evenement: FormEvent) {
    evenement.preventDefault();
    setErreur(null);
    setEnvoi(true);

    try {
      const lignesUtiles: EntreeLigneVente[] = lignes
        .filter((ligne) => ligne.libelle.trim() !== "" && ligne.prix.trim() !== "")
        .map((ligne) => ({
          ...(ligne.produitId === "" ? {} : { produit_id: ligne.produitId }),
          libelle: ligne.libelle.trim(),
          quantite: ligne.quantite.replace(",", "."),
          prix_unitaire_mineur: analyserMontantSaisi(ligne.prix, devise) ?? 0,
        }));

      const montantMineur = analyserMontantSaisi(montant, devise);
      if (lignesUtiles.length === 0 && montantMineur === null) {
        setErreur("Indiquez un montant, ou au moins une ligne de vente.");
        return;
      }

      const corps = {
        effectuee_le: date,
        ...(lignesUtiles.length > 0
          ? { lignes: lignesUtiles }
          : { montant_total_mineur: montantMineur ?? 0 }),
        moyen_paiement: moyen === "" ? null : moyen,
        note: note.trim() === "" ? null : note.trim(),
        client_id: clientId === "" ? null : clientId,
      };

      if (enEdition === null) await apiVentes.creer(corps);
      else await apiVentes.modifier(enEdition, corps);

      reinitialiser();
      await recharger();
    } catch (cause) {
      setErreur(cause instanceof ErreurApiClient ? cause.message : "Enregistrement impossible.");
    } finally {
      setEnvoi(false);
    }
  }

  async function editer(vente: Vente) {
    setEnEdition(vente.id);
    setDate(vente.date_locale);
    setMoyen(vente.moyen_paiement ?? "");
    setNote(vente.note ?? "");
    setClientId(vente.client?.id ?? "");

    if (vente.nombre_lignes > 0) {
      const detail = await apiVentes.obtenir(vente.id);
      setLignes(
        detail.lignes.map((ligne) => ({
          produitId: ligne.produit_id ?? "",
          libelle: ligne.libelle,
          quantite: ligne.quantite,
          prix: montantVersSaisie(ligne.prix_unitaire_mineur, devise),
        })),
      );
      setMontant("");
    } else {
      setLignes([]);
      setMontant(montantVersSaisie(vente.montant_total_mineur, devise));
    }
  }

  async function supprimer(vente: Vente) {
    setErreur(null);
    try {
      await apiVentes.supprimer(vente.id);
      if (enEdition === vente.id) reinitialiser();
      await recharger();
    } catch (cause) {
      setErreur(cause instanceof ErreurApiClient ? cause.message : "Suppression impossible.");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
      <form
        onSubmit={soumettre}
        className="h-fit space-y-4 rounded-2xl border border-white/10 bg-ardoise-900 p-6"
      >
        <h2 className="font-semibold">
          {enEdition === null ? "Nouvelle vente" : "Modifier la vente"}
        </h2>

        {erreur !== null && <Alerte>{erreur}</Alerte>}

        <Champ
          libelle="Date"
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />

        {lignes.length === 0 ? (
          <ChampMontant libelle="Montant total" valeur={montant} onChange={setMontant} devise={devise} />
        ) : (
          <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm">
            <span className="text-ardoise-400">Total calculé depuis les lignes</span>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {formaterMontant(apercuLignes, devise)}
            </p>
          </div>
        )}

        <div className="space-y-3">
          {lignes.map((ligne, index) => (
            <div key={index} className="space-y-2 rounded-lg border border-white/10 p-2">
              {produits.length > 0 && (
                <select
                  aria-label={`Produit de la ligne ${index + 1}`}
                  value={ligne.produitId}
                  onChange={(e) => {
                    // Choisir un produit pré-remplit nom et prix. Les deux
                    // restent modifiables : le serveur fige ce qui est envoyé,
                    // ce qui permet une remise sans toucher au catalogue.
                    const produit = produits.find((p) => p.id === e.target.value);
                    setLignes(
                      lignes.map((l, i) =>
                        i === index
                          ? produit === undefined
                            ? { ...l, produitId: "" }
                            : {
                                ...l,
                                produitId: produit.id,
                                libelle: produit.nom,
                                prix: montantVersSaisie(produit.prix_mineur, devise),
                              }
                          : l,
                      ),
                    );
                  }}
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm"
                >
                  <option value="" className="bg-ardoise-900">
                    Hors catalogue (saisie libre)
                  </option>
                  {produits.map((produit) => (
                    <option key={produit.id} value={produit.id} className="bg-ardoise-900">
                      {produit.nom} — {formaterMontant(produit.prix_mineur, devise)}
                    </option>
                  ))}
                </select>
              )}

              <div className="grid grid-cols-[1fr_4rem_5rem_2rem] gap-2">
              <input
                aria-label={`Libellé de la ligne ${index + 1}`}
                placeholder="Article"
                value={ligne.libelle}
                onChange={(e) =>
                  setLignes(lignes.map((l, i) => (i === index ? { ...l, libelle: e.target.value } : l)))
                }
                className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm"
              />
              <input
                aria-label={`Quantité de la ligne ${index + 1}`}
                inputMode="decimal"
                value={ligne.quantite}
                onChange={(e) =>
                  setLignes(lignes.map((l, i) => (i === index ? { ...l, quantite: e.target.value } : l)))
                }
                className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-right text-sm tabular-nums"
              />
              <input
                aria-label={`Prix unitaire de la ligne ${index + 1}`}
                inputMode="decimal"
                placeholder="prix"
                value={ligne.prix}
                onChange={(e) =>
                  setLignes(lignes.map((l, i) => (i === index ? { ...l, prix: e.target.value } : l)))
                }
                className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-right text-sm tabular-nums"
              />
              <button
                type="button"
                aria-label={`Retirer la ligne ${index + 1}`}
                onClick={() => setLignes(lignes.filter((_, i) => i !== index))}
                className="rounded-lg border border-white/10 text-ardoise-400 hover:border-corail-400/60 hover:text-corail-400"
              >
                ×
              </button>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => setLignes([...lignes, { ...LIGNE_VIDE }])}
            className="text-sm font-medium text-menthe-400 underline-offset-4 hover:underline"
          >
            + Détailler en lignes
          </button>
        </div>

        <Liste
          libelle="Client"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
        >
          {/* Une vente sans client reste parfaitement valide : elle compte
              dans le chiffre d'affaires, simplement pas dans les classements
              de clients. */}
          <option value="" className="bg-ardoise-900">
            Vente anonyme
          </option>
          {clients.map((client) => (
            <option key={client.id} value={client.id} className="bg-ardoise-900">
              {client.nom}
            </option>
          ))}
        </Liste>

        <Liste
          libelle="Moyen de paiement"
          value={moyen}
          onChange={(e) => setMoyen(e.target.value as MoyenPaiement | "")}
        >
          <option value="" className="bg-ardoise-900">
            Non précisé
          </option>
          {MOYENS_PAIEMENT.map((code) => (
            <option key={code} value={code} className="bg-ardoise-900">
              {LIBELLES_MOYEN_PAIEMENT[code]}
            </option>
          ))}
        </Liste>

        <Champ
          libelle="Note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Facultatif"
        />

        <Bouton charge={envoi}>{enEdition === null ? "Enregistrer" : "Mettre à jour"}</Bouton>

        {enEdition !== null && (
          <button
            type="button"
            onClick={reinitialiser}
            className="w-full text-sm text-ardoise-400 underline-offset-4 hover:underline"
          >
            Annuler la modification
          </button>
        )}
      </form>

      <section className="rounded-2xl border border-white/10 bg-ardoise-900 p-6">
        <header className="mb-4 flex items-baseline justify-between">
          <h2 className="font-semibold">Ventes</h2>
          <span className="text-sm text-ardoise-400">{total} enregistrée(s)</span>
        </header>

        {chargement ? (
          <p className="text-sm text-ardoise-400">Chargement…</p>
        ) : ventes.length === 0 ? (
          <p className="text-sm text-ardoise-400">
            Aucune vente pour l&apos;instant. Saisissez la première à gauche.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-ardoise-400">
                <tr>
                  <th className="pb-2 font-medium">N°</th>
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 text-right font-medium">Montant</th>
                  <th className="pb-2 font-medium">Paiement</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {ventes.map((vente) => (
                  <tr key={vente.id} className="border-t border-white/5">
                    <td className="py-2 tabular-nums text-ardoise-400">{vente.numero}</td>
                    <td className="py-2 tabular-nums">{vente.date_locale}</td>
                    <td className="py-2 text-right font-medium tabular-nums">
                      {formaterMontant(vente.montant_total_mineur, devise)}
                      {vente.nombre_lignes > 0 && (
                        <span className="ml-1 text-xs text-ardoise-400">
                          ({vente.nombre_lignes} l.)
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-ardoise-400">
                      {vente.moyen_paiement === null
                        ? "—"
                        : LIBELLES_MOYEN_PAIEMENT[vente.moyen_paiement]}
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => void editer(vente)}
                        className="text-xs text-menthe-400 underline-offset-4 hover:underline"
                      >
                        modifier
                      </button>
                      <button
                        type="button"
                        onClick={() => void supprimer(vente)}
                        className="ml-3 text-xs text-corail-400 underline-offset-4 hover:underline"
                      >
                        supprimer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
