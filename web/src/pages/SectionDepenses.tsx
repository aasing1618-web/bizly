import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  analyserMontantSaisi,
  formaterMontant,
  LIBELLES_MOYEN_PAIEMENT,
  montantVersSaisie,
  MOYENS_PAIEMENT,
  type CategorieDepense,
  type Depense,
  type Devise,
  type MoyenPaiement,
} from "@bizly/shared";
import { Alerte, Bouton, Champ, Liste } from "../composants/Formulaire";
import { ChampMontant } from "../composants/ChampMontant";
import { ErreurApiClient } from "../lib/api";
import { aujourdhui, apiCategories, apiDepenses } from "../lib/operations";

export function SectionDepenses({ devise }: { devise: Devise }) {
  const [depenses, setDepenses] = useState<Depense[]>([]);
  const [categories, setCategories] = useState<CategorieDepense[]>([]);
  const [total, setTotal] = useState(0);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const [enEdition, setEnEdition] = useState<string | null>(null);
  const [date, setDate] = useState(aujourdhui());
  const [montant, setMontant] = useState("");
  const [categorieId, setCategorieId] = useState("");
  const [fournisseur, setFournisseur] = useState("");
  const [moyen, setMoyen] = useState<MoyenPaiement | "">("");
  const [note, setNote] = useState("");
  const [envoi, setEnvoi] = useState(false);

  const recharger = useCallback(async () => {
    try {
      const page = await apiDepenses.lister({ limite: 50 });
      setDepenses(page.elements);
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
    void apiCategories
      .lister()
      .then((reponse) => setCategories(reponse.elements))
      .catch(() => setCategories([]));
  }, [recharger]);

  function reinitialiser() {
    setEnEdition(null);
    setDate(aujourdhui());
    setMontant("");
    setCategorieId("");
    setFournisseur("");
    setMoyen("");
    setNote("");
  }

  async function soumettre(evenement: FormEvent) {
    evenement.preventDefault();
    setErreur(null);

    const montantMineur = analyserMontantSaisi(montant, devise);
    if (montantMineur === null) {
      setErreur("Le montant est illisible.");
      return;
    }

    setEnvoi(true);
    try {
      const corps = {
        effectuee_le: date,
        montant_mineur: montantMineur,
        categorie_id: categorieId === "" ? null : categorieId,
        fournisseur: fournisseur.trim() === "" ? null : fournisseur.trim(),
        moyen_paiement: moyen === "" ? null : moyen,
        note: note.trim() === "" ? null : note.trim(),
      };

      if (enEdition === null) await apiDepenses.creer(corps);
      else await apiDepenses.modifier(enEdition, corps);

      reinitialiser();
      await recharger();
    } catch (cause) {
      setErreur(cause instanceof ErreurApiClient ? cause.message : "Enregistrement impossible.");
    } finally {
      setEnvoi(false);
    }
  }

  function editer(depense: Depense) {
    setEnEdition(depense.id);
    setDate(depense.date_locale);
    setMontant(montantVersSaisie(depense.montant_mineur, devise));
    setCategorieId(depense.categorie?.id ?? "");
    setFournisseur(depense.fournisseur ?? "");
    setMoyen(depense.moyen_paiement ?? "");
    setNote(depense.note ?? "");
  }

  async function supprimer(depense: Depense) {
    setErreur(null);
    try {
      await apiDepenses.supprimer(depense.id);
      if (enEdition === depense.id) reinitialiser();
      await recharger();
    } catch (cause) {
      setErreur(cause instanceof ErreurApiClient ? cause.message : "Suppression impossible.");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
      <form
        onSubmit={soumettre}
        className="h-fit space-y-4 bizly-card p-6"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-sm font-extrabold text-slate-900">
            {enEdition === null ? "Nouvelle dépense" : "Modifier la dépense"}
          </h2>
          <span className="pill-tag pill-amber">Dépenses</span>
        </div>

        {erreur !== null && <Alerte>{erreur}</Alerte>}

        <Champ
          libelle="Date"
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />

        <ChampMontant libelle="Montant" valeur={montant} onChange={setMontant} devise={devise} />

        <Liste
          libelle="Catégorie"
          value={categorieId}
          onChange={(e) => setCategorieId(e.target.value)}
        >
          <option value="">
            Non catégorisée
          </option>
          {categories.map((categorie) => (
            <option key={categorie.id} value={categorie.id}>
              {categorie.libelle}
            </option>
          ))}
        </Liste>

        <Champ
          libelle="Fournisseur"
          value={fournisseur}
          onChange={(e) => setFournisseur(e.target.value)}
          placeholder="Facultatif"
        />

        <Liste
          libelle="Moyen de paiement"
          value={moyen}
          onChange={(e) => setMoyen(e.target.value as MoyenPaiement | "")}
        >
          <option value="">
            Non précisé
          </option>
          {MOYENS_PAIEMENT.map((code) => (
            <option key={code} value={code}>
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
            className="w-full text-xs font-semibold text-slate-500 hover:underline"
          >
            Annuler la modification
          </button>
        )}
      </form>

      <section className="bizly-card p-6">
        <header className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-sm font-extrabold text-slate-900">Historique des Dépenses</h2>
          <span className="pill-tag pill-amber">{total} enregistrée(s)</span>
        </header>

        {chargement ? (
          <p className="text-xs font-medium text-slate-500 py-6 text-center">Chargement…</p>
        ) : depenses.length === 0 ? (
          <p className="text-xs font-medium text-slate-500 py-6 text-center">
            Aucune dépense pour l&apos;instant. Saisissez la première à gauche.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left uppercase tracking-wider text-slate-400 font-bold border-b border-slate-100">
                <tr>
                  <th className="pb-3">Date</th>
                  <th className="pb-3 text-right">Montant</th>
                  <th className="pb-3">Catégorie</th>
                  <th className="pb-3">Fournisseur</th>
                  <th className="pb-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {depenses.map((depense) => (
                  <tr key={depense.id} className="hover:bg-slate-50/50 transition">
                    <td className="py-3 tabular-nums font-semibold text-slate-700">{depense.date_locale}</td>
                    <td className="py-3 text-right font-extrabold tabular-nums text-slate-900">
                      {formaterMontant(depense.montant_mineur, devise)}
                    </td>
                    <td className="py-3">
                      {depense.categorie?.libelle ? (
                        <span className="pill-tag pill-amber">{depense.categorie.libelle}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-3 font-medium text-slate-600">{depense.fournisseur ?? "—"}</td>
                    <td className="py-3 text-right whitespace-nowrap space-x-2">
                      <button
                        type="button"
                        onClick={() => editer(depense)}
                        className="font-bold text-indigo-600 hover:underline"
                      >
                        modifier
                      </button>
                      <button
                        type="button"
                        onClick={() => void supprimer(depense)}
                        className="font-bold text-red-600 hover:underline"
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
