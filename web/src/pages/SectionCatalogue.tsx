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
            ["produits", "📦 Produits"],
            ["clients", "👥 Clients"],
          ] as const
        ).map(([cle, libelle]) => (
          <button
            key={cle}
            type="button"
            onClick={() => setVue(cle)}
            aria-pressed={vue === cle}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
              vue === cle
                ? "pill-tag pill-cyan shadow-xs scale-105"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
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
        className="h-fit space-y-4 bizly-card p-6"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-sm font-extrabold text-slate-900">{enEdition === null ? "Nouveau produit" : "Modifier le produit"}</h2>
          <span className="pill-tag pill-cyan">Catalogue</span>
        </div>

        {erreur !== null && <Alerte>{erreur}</Alerte>}

        <Champ
          libelle="Nom du produit"
          required
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          placeholder="Ex: T-Shirt Coton"
        />
        <Champ
          libelle="Catégorie"
          value={categorie}
          onChange={(e) => setCategorie(e.target.value)}
          placeholder="Ex: Vêtements"
          aide="Sert au chiffre d'affaires par catégorie."
        />
        <ChampMontant libelle="Prix de vente" valeur={prix} onChange={setPrix} devise={devise} />
        <ChampMontant
          libelle="Coût de revient"
          valeur={cout}
          onChange={setCout}
          devise={devise}
          requis={false}
        />
        <p className="-mt-2 text-[11px] text-slate-500 font-medium">
          Laissé vide, le produit n&apos;apparaîtra dans aucun classement de rentabilité.
        </p>

        <Bouton charge={envoi}>{enEdition === null ? "Ajouter" : "Mettre à jour"}</Bouton>

        {enEdition !== null && (
          <button
            type="button"
            onClick={reinitialiser}
            className="w-full text-xs font-semibold text-slate-500 hover:underline"
          >
            Annuler
          </button>
        )}
      </form>

      <section className="bizly-card p-6">
        <header className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-sm font-extrabold text-slate-900">Produits du Catalogue</h2>
          <span className="pill-tag pill-cyan">{produits.length} produit(s)</span>
        </header>

        {sansCout > 0 && (
          <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
            ⚠️ {sansCout} produit(s) sans coût de revient : ils resteront hors des analyses de rentabilité.
          </p>
        )}

        {chargement ? (
          <p className="text-xs font-medium text-slate-500 py-6 text-center">Chargement…</p>
        ) : produits.length === 0 ? (
          <p className="text-xs font-medium text-slate-500 py-6 text-center">
            Aucun produit. Ajoutez-en un pour pouvoir suivre vos marges.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left uppercase tracking-wider text-slate-400 font-bold border-b border-slate-100">
                <tr>
                  <th className="pb-3">Nom</th>
                  <th className="pb-3">Catégorie</th>
                  <th className="pb-3 text-right">Prix</th>
                  <th className="pb-3 text-right">Coût</th>
                  <th className="pb-3 text-right">Marge</th>
                  <th className="pb-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {produits.map((produit) => {
                  const marge = margePourcent(produit);
                  return (
                    <tr key={produit.id} className="hover:bg-slate-50/50 transition">
                      <td className="py-3 font-bold text-slate-900">{produit.nom}</td>
                      <td className="py-3">
                        {produit.categorie ? (
                          <span className="pill-tag pill-indigo">{produit.categorie}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3 text-right font-extrabold tabular-nums text-slate-900">
                        {formaterMontant(produit.prix_mineur, devise)}
                      </td>
                      <td className="py-3 text-right tabular-nums font-semibold text-slate-500">
                        {produit.cout_mineur === null
                          ? VALEUR_NON_CALCULABLE
                          : formaterMontant(produit.cout_mineur, devise)}
                      </td>
                      <td className="py-3 text-right tabular-nums">
                        {marge === null ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          <span className="pill-tag pill-emerald">
                            {formaterPourcent(marge, { signe: false })}
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-right whitespace-nowrap space-x-2">
                        <button
                          type="button"
                          onClick={() => editer(produit)}
                          className="font-bold text-indigo-600 hover:underline"
                        >
                          modifier
                        </button>
                        <button
                          type="button"
                          onClick={() => void supprimer(produit)}
                          className="font-bold text-red-600 hover:underline"
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
        className="h-fit space-y-4 bizly-card p-6"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-sm font-extrabold text-slate-900">{enEdition === null ? "Nouveau client" : "Modifier le client"}</h2>
          <span className="pill-tag pill-pink">Fichier Client</span>
        </div>

        {erreur !== null && <Alerte>{erreur}</Alerte>}

        <Champ libelle="Nom" required value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom complet ou société" />
        <Champ
          libelle="E-mail"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="contact@client.com"
        />
        <Champ
          libelle="Téléphone"
          value={telephone}
          onChange={(e) => setTelephone(e.target.value)}
          placeholder="+33 6 12 34 56 78"
        />

        <Bouton charge={envoi}>{enEdition === null ? "Ajouter" : "Mettre à jour"}</Bouton>

        {enEdition !== null && (
          <button
            type="button"
            onClick={reinitialiser}
            className="w-full text-xs font-semibold text-slate-500 hover:underline"
          >
            Annuler
          </button>
        )}
      </form>

      <section className="bizly-card p-6">
        <header className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-sm font-extrabold text-slate-900">Répertoire Clients</h2>
          <span className="pill-tag pill-pink">{clients.length} client(s)</span>
        </header>

        {chargement ? (
          <p className="text-xs font-medium text-slate-500 py-6 text-center">Chargement…</p>
        ) : clients.length === 0 ? (
          <p className="text-xs font-medium text-slate-500 py-6 text-center">
            Aucun client. Rattachez vos ventes à un client pour savoir qui compte le plus.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 text-xs">
            {clients.map((client, idx) => (
              <li key={client.id} className="flex items-center justify-between gap-3 py-3 hover:bg-slate-50/50 transition px-2 rounded-lg">
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={`/photos/avatar${(idx % 5) + 1}.jfif`}
                    alt={client.nom}
                    className="h-8 w-8 rounded-full object-cover ring-2 ring-indigo-500/20"
                  />
                  <div className="min-w-0">
                    <p className="truncate font-bold text-slate-900">{client.nom}</p>
                    <p className="truncate text-[11px] font-medium text-slate-500">
                      {[client.email, client.telephone].filter((v) => v !== null).join(" · ") || "—"}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 whitespace-nowrap space-x-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEnEdition(client.id);
                      setNom(client.nom);
                      setEmail(client.email ?? "");
                      setTelephone(client.telephone ?? "");
                    }}
                    className="font-bold text-indigo-600 hover:underline"
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
                    className="font-bold text-red-600 hover:underline"
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
