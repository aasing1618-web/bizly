import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  analyserMontantSaisi,
  formaterMontant,
  formaterPourcent,
  margePourcent,
  montantVersSaisie,
  VALEUR_NON_CALCULABLE,
  type Client,
  type Devise,
  type Produit,
} from "@bizly/shared";
import { Alerte, Bouton, Champ } from "../composants/Formulaire";
import { ChampMontant } from "../composants/ChampMontant";
import { ErreurApiClient } from "../lib/api";
import { apiClients, apiProduits } from "../lib/catalogue";

/**
 * Catalogue de produits et fichier clients.
 *
 * Ce sont ces deux écrans qui alimentent la moitié des questions du moteur :
 * sans coût saisi, aucune marge ; sans client, aucun classement de clients.
 */
export function SectionCatalogue({ devise }: { devise: Devise }) {
  const [vue, setVue] = useState<"produits" | "clients">("produits");

  return (
    <div className="space-y-6">
      <nav className="flex gap-2" aria-label="Catalogue">
        {(
          [
            ["produits", "Produits"],
            ["clients", "Clients"],
          ] as const
        ).map(([cle, libelle]) => (
          <button
            key={cle}
            type="button"
            onClick={() => setVue(cle)}
            aria-pressed={vue === cle}
            className={`rounded-lg border px-3 py-1.5 text-sm transition ${
              vue === cle
                ? "border-menthe-400/60 bg-menthe-400/10 text-slate-100"
                : "border-white/10 text-ardoise-400 hover:border-white/25 hover:text-slate-200"
            }`}
          >
            {libelle}
          </button>
        ))}
      </nav>

      {vue === "produits" ? <Produits devise={devise} /> : <Clients />}
    </div>
  );
}

function Produits({ devise }: { devise: Devise }) {
  const [produits, setProduits] = useState<Produit[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const [enEdition, setEnEdition] = useState<string | null>(null);
  const [nom, setNom] = useState("");
  const [categorie, setCategorie] = useState("");
  const [prix, setPrix] = useState("");
  const [cout, setCout] = useState("");
  const [envoi, setEnvoi] = useState(false);

  const recharger = useCallback(async () => {
    try {
      setProduits((await apiProduits.lister({ limite: 200 })).elements);
      setErreur(null);
    } catch (cause) {
      setErreur(cause instanceof ErreurApiClient ? cause.message : "Chargement impossible.");
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void recharger();
  }, [recharger]);

  function reinitialiser() {
    setEnEdition(null);
    setNom("");
    setCategorie("");
    setPrix("");
    setCout("");
  }

  async function soumettre(evenement: FormEvent) {
    evenement.preventDefault();
    setErreur(null);

    const prixMineur = analyserMontantSaisi(prix, devise);
    if (prixMineur === null) {
      setErreur("Le prix de vente est illisible.");
      return;
    }

    // Un champ coût laissé vide signifie « non renseigné », pas zéro. C'est
    // cette distinction qui exclut le produit des classements de rentabilité
    // au lieu de lui inventer une marge de 100 %.
    const coutMineur = cout.trim() === "" ? null : analyserMontantSaisi(cout, devise);
    if (cout.trim() !== "" && coutMineur === null) {
      setErreur("Le coût de revient est illisible.");
      return;
    }

    setEnvoi(true);
    try {
      const corps = {
        nom: nom.trim(),
        categorie: categorie.trim() === "" ? null : categorie.trim(),
        prix_mineur: prixMineur,
        cout_mineur: coutMineur,
      };

      if (enEdition === null) await apiProduits.creer(corps);
      else await apiProduits.modifier(enEdition, corps);

      reinitialiser();
      await recharger();
    } catch (cause) {
      setErreur(cause instanceof ErreurApiClient ? cause.message : "Enregistrement impossible.");
    } finally {
      setEnvoi(false);
    }
  }

  function editer(produit: Produit) {
    setEnEdition(produit.id);
    setNom(produit.nom);
    setCategorie(produit.categorie ?? "");
    setPrix(montantVersSaisie(produit.prix_mineur, devise));
    setCout(produit.cout_mineur === null ? "" : montantVersSaisie(produit.cout_mineur, devise));
  }

  async function supprimer(produit: Produit) {
    try {
      await apiProduits.supprimer(produit.id);
      if (enEdition === produit.id) reinitialiser();
      await recharger();
    } catch (cause) {
      setErreur(cause instanceof ErreurApiClient ? cause.message : "Suppression impossible.");
    }
  }

  const sansCout = produits.filter((produit) => produit.cout_mineur === null).length;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
      <form
        onSubmit={soumettre}
        className="h-fit space-y-4 rounded-2xl border border-white/10 bg-ardoise-900 p-6"
      >
        <h2 className="font-semibold">{enEdition === null ? "Nouveau produit" : "Modifier"}</h2>

        {erreur !== null && <Alerte>{erreur}</Alerte>}

        <Champ
          libelle="Nom"
          required
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          placeholder="T-shirt"
        />
        <Champ
          libelle="Catégorie"
          value={categorie}
          onChange={(e) => setCategorie(e.target.value)}
          placeholder="Vêtements"
          aide="Facultatif — sert au chiffre d'affaires par catégorie."
        />
        <ChampMontant libelle="Prix de vente" valeur={prix} onChange={setPrix} devise={devise} />
        <ChampMontant
          libelle="Coût de revient"
          valeur={cout}
          onChange={setCout}
          devise={devise}
          requis={false}
        />
        <p className="-mt-2 text-xs text-ardoise-400">
          Laissé vide, le produit n&apos;apparaîtra dans aucun classement de rentabilité —
          plutôt que d&apos;afficher une marge fausse.
        </p>

        <Bouton charge={envoi}>{enEdition === null ? "Ajouter" : "Mettre à jour"}</Bouton>

        {enEdition !== null && (
          <button
            type="button"
            onClick={reinitialiser}
            className="w-full text-sm text-ardoise-400 underline-offset-4 hover:underline"
          >
            Annuler
          </button>
        )}
      </form>

      <section className="rounded-2xl border border-white/10 bg-ardoise-900 p-6">
        <header className="mb-4 flex items-baseline justify-between">
          <h2 className="font-semibold">Catalogue</h2>
          <span className="text-sm text-ardoise-400">{produits.length} produit(s)</span>
        </header>

        {sansCout > 0 && (
          <p className="mb-4 rounded-lg border border-ambre-400/30 bg-ambre-400/5 px-3 py-2 text-xs text-ambre-400">
            {sansCout} produit(s) sans coût de revient : ils resteront hors des analyses de
            rentabilité.
          </p>
        )}

        {chargement ? (
          <p className="text-sm text-ardoise-400">Chargement…</p>
        ) : produits.length === 0 ? (
          <p className="text-sm text-ardoise-400">
            Aucun produit. Ajoutez-en un pour pouvoir suivre vos marges.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-ardoise-400">
                <tr>
                  <th className="pb-2 font-medium">Nom</th>
                  <th className="pb-2 font-medium">Catégorie</th>
                  <th className="pb-2 text-right font-medium">Prix</th>
                  <th className="pb-2 text-right font-medium">Coût</th>
                  <th className="pb-2 text-right font-medium">Marge</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {produits.map((produit) => {
                  const marge = margePourcent(produit);
                  return (
                    <tr key={produit.id} className="border-t border-white/5">
                      <td className="py-2 font-medium">{produit.nom}</td>
                      <td className="py-2 text-ardoise-400">{produit.categorie ?? "—"}</td>
                      <td className="py-2 text-right tabular-nums">
                        {formaterMontant(produit.prix_mineur, devise)}
                      </td>
                      <td className="py-2 text-right tabular-nums text-ardoise-400">
                        {produit.cout_mineur === null
                          ? VALEUR_NON_CALCULABLE
                          : formaterMontant(produit.cout_mineur, devise)}
                      </td>
                      <td
                        className={`py-2 text-right tabular-nums ${
                          marge === null ? "text-ardoise-400" : "text-menthe-400"
                        }`}
                      >
                        {marge === null
                          ? VALEUR_NON_CALCULABLE
                          : formaterPourcent(marge, { signe: false })}
                      </td>
                      <td className="py-2 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => editer(produit)}
                          className="text-xs text-menthe-400 underline-offset-4 hover:underline"
                        >
                          modifier
                        </button>
                        <button
                          type="button"
                          onClick={() => void supprimer(produit)}
                          className="ml-3 text-xs text-corail-400 underline-offset-4 hover:underline"
                        >
                          supprimer
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Clients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const [enEdition, setEnEdition] = useState<string | null>(null);
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [telephone, setTelephone] = useState("");
  const [envoi, setEnvoi] = useState(false);

  const recharger = useCallback(async () => {
    try {
      setClients((await apiClients.lister({ limite: 200 })).elements);
      setErreur(null);
    } catch (cause) {
      setErreur(cause instanceof ErreurApiClient ? cause.message : "Chargement impossible.");
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void recharger();
  }, [recharger]);

  function reinitialiser() {
    setEnEdition(null);
    setNom("");
    setEmail("");
    setTelephone("");
  }

  async function soumettre(evenement: FormEvent) {
    evenement.preventDefault();
    setErreur(null);
    setEnvoi(true);

    try {
      const corps = {
        nom: nom.trim(),
        email: email.trim() === "" ? null : email.trim(),
        telephone: telephone.trim() === "" ? null : telephone.trim(),
      };

      if (enEdition === null) await apiClients.creer(corps);
      else await apiClients.modifier(enEdition, corps);

      reinitialiser();
      await recharger();
    } catch (cause) {
      setErreur(cause instanceof ErreurApiClient ? cause.message : "Enregistrement impossible.");
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
      <form
        onSubmit={soumettre}
        className="h-fit space-y-4 rounded-2xl border border-white/10 bg-ardoise-900 p-6"
      >
        <h2 className="font-semibold">{enEdition === null ? "Nouveau client" : "Modifier"}</h2>

        {erreur !== null && <Alerte>{erreur}</Alerte>}

        <Champ libelle="Nom" required value={nom} onChange={(e) => setNom(e.target.value)} />
        <Champ
          libelle="E-mail"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Facultatif"
        />
        <Champ
          libelle="Téléphone"
          value={telephone}
          onChange={(e) => setTelephone(e.target.value)}
          placeholder="Facultatif"
        />

        <Bouton charge={envoi}>{enEdition === null ? "Ajouter" : "Mettre à jour"}</Bouton>

        {enEdition !== null && (
          <button
            type="button"
            onClick={reinitialiser}
            className="w-full text-sm text-ardoise-400 underline-offset-4 hover:underline"
          >
            Annuler
          </button>
        )}
      </form>

      <section className="rounded-2xl border border-white/10 bg-ardoise-900 p-6">
        <header className="mb-4 flex items-baseline justify-between">
          <h2 className="font-semibold">Clients</h2>
          <span className="text-sm text-ardoise-400">{clients.length} client(s)</span>
        </header>

        {chargement ? (
          <p className="text-sm text-ardoise-400">Chargement…</p>
        ) : clients.length === 0 ? (
          <p className="text-sm text-ardoise-400">
            Aucun client. Rattachez vos ventes à un client pour savoir qui compte le plus.
          </p>
        ) : (
          <ul className="divide-y divide-white/5 text-sm">
            {clients.map((client) => (
              <li key={client.id} className="flex items-baseline justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{client.nom}</p>
                  <p className="truncate text-xs text-ardoise-400">
                    {[client.email, client.telephone].filter((v) => v !== null).join(" · ") || "—"}
                  </p>
                </div>
                <div className="shrink-0 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => {
                      setEnEdition(client.id);
                      setNom(client.nom);
                      setEmail(client.email ?? "");
                      setTelephone(client.telephone ?? "");
                    }}
                    className="text-xs text-menthe-400 underline-offset-4 hover:underline"
                  >
                    modifier
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void apiClients.supprimer(client.id).then(recharger).catch(() =>
                        setErreur("Suppression impossible."),
                      )
                    }
                    className="ml-3 text-xs text-corail-400 underline-offset-4 hover:underline"
                  >
                    supprimer
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
