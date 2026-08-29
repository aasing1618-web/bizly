import { useCallback, useEffect, useState } from "react";
import {
  PLANS,
  type EntrepriseAdmin,
  type Page,
  type Plan,
  type StatutCompte,
} from "@bizly/shared";
import { Alerte, Bouton, Carte, Champ, Etiquette, Liste } from "../composants/Briques";
import { appelAdmin, ErreurApiAdmin } from "../lib/api";

/**
 * Liste des entreprises et actions d'exploitation — docs/API-CONTRACT.md §9.
 *
 * Trois gestes, et trois seulement : changer la formule, suspendre ou
 * réactiver, réinitialiser un mot de passe. La console ne lit **aucune** donnée
 * métier — ni vente, ni dépense, ni client. Un support qui peut tout lire est
 * une fuite qui attend son incident (§9.6).
 */

const LIBELLES_PLAN: Record<Plan, string> = {
  free: "Découverte",
  pro: "Pro",
  business: "Business",
};

export function Entreprises() {
  const [recherche, setRecherche] = useState("");
  const [statut, setStatut] = useState<"" | StatutCompte>("");
  const [plan, setPlan] = useState<"" | Plan>("");
  const [page, setPage] = useState<Page<EntrepriseAdmin> | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ouverte, setOuverte] = useState<string | null>(null);

  const charger = useCallback(
    async (signal?: AbortSignal) => {
      const parametres = new URLSearchParams();
      if (recherche.trim() !== "") parametres.set("recherche", recherche.trim());
      if (statut !== "") parametres.set("statut", statut);
      if (plan !== "") parametres.set("plan", plan);

      try {
        setPage(
          await appelAdmin<Page<EntrepriseAdmin>>(`/entreprises?${parametres.toString()}`, {
            ...(signal === undefined ? {} : { signal }),
          }),
        );
        setErreur(null);
      } catch (cause) {
        if (signal?.aborted === true) return;
        setErreur(cause instanceof ErreurApiAdmin ? cause.message : "Chargement impossible.");
      }
    },
    [recherche, statut, plan],
  );

  useEffect(() => {
    const controleur = new AbortController();
    // Petite temporisation : on ne relance pas une requête à chaque frappe.
    const minuterie = setTimeout(() => void charger(controleur.signal), 250);
    return () => {
      clearTimeout(minuterie);
      controleur.abort();
    };
  }, [charger]);

  /** Remplace une fiche dans la liste, sans tout recharger. */
  function remplacer(fiche: EntrepriseAdmin): void {
    setPage((actuelle) =>
      actuelle === null
        ? actuelle
        : {
            ...actuelle,
            elements: actuelle.elements.map((element) =>
              element.id === fiche.id ? fiche : element,
            ),
          },
    );
  }

  return (
    <div className="space-y-4">
      <Carte>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <Champ
            libelle="Rechercher"
            placeholder="Nom d'entreprise ou e-mail du propriétaire"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
          />
          <Liste
            libelle="Statut"
            value={statut}
            onChange={(e) => setStatut(e.target.value as "" | StatutCompte)}
          >
            <option value="" className="bg-ardoise-900">
              Tous
            </option>
            <option value="ACTIF" className="bg-ardoise-900">
              Actifs
            </option>
            <option value="SUSPENDU" className="bg-ardoise-900">
              Suspendus
            </option>
          </Liste>
          <Liste
            libelle="Formule"
            value={plan}
            onChange={(e) => setPlan(e.target.value as "" | Plan)}
          >
            <option value="" className="bg-ardoise-900">
              Toutes
            </option>
            {PLANS.map((code) => (
              <option key={code} value={code} className="bg-ardoise-900">
                {LIBELLES_PLAN[code]}
              </option>
            ))}
          </Liste>
        </div>
      </Carte>

      {erreur !== null && <Alerte>{erreur}</Alerte>}

      {page === null ? (
        <p className="py-8 text-center text-sm text-ardoise-400" role="status">
          Chargement…
        </p>
      ) : page.elements.length === 0 ? (
        <p className="py-8 text-center text-sm text-ardoise-400">
          Aucune entreprise ne correspond.
        </p>
      ) : (
        <>
          <p className="text-xs text-ardoise-400">
            {page.total} entreprise{page.total > 1 ? "s" : ""}
          </p>
          <ul className="space-y-3">
            {page.elements.map((entreprise) => (
              <FicheEntreprise
                key={entreprise.id}
                entreprise={entreprise}
                ouverte={ouverte === entreprise.id}
                basculer={() => setOuverte(ouverte === entreprise.id ? null : entreprise.id)}
                surModification={remplacer}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function FicheEntreprise({
  entreprise,
  ouverte,
  basculer,
  surModification,
}: {
  entreprise: EntrepriseAdmin;
  ouverte: boolean;
  basculer: () => void;
  surModification: (fiche: EntrepriseAdmin) => void;
}) {
  const suspendue = entreprise.statut === "SUSPENDU";

  return (
    <li className="rounded-2xl border border-white/10 bg-ardoise-900">
      <button
        type="button"
        onClick={basculer}
        aria-expanded={ouverte}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <div className="min-w-0">
          <p className="truncate font-medium">{entreprise.nom}</p>
          <p className="truncate text-xs text-ardoise-400">
            {entreprise.proprietaire?.email ?? "sans propriétaire"} · {entreprise.devise}
            {entreprise.pays !== null && ` · ${entreprise.pays}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Etiquette ton="neutre">{LIBELLES_PLAN[entreprise.plan]}</Etiquette>
          <Etiquette ton={suspendue ? "alerte" : "positif"}>
            {suspendue ? "Suspendue" : "Active"}
          </Etiquette>
        </div>
      </button>

      {ouverte && <Detail entreprise={entreprise} surModification={surModification} />}
    </li>
  );
}

function Detail({
  entreprise,
  surModification,
}: {
  entreprise: EntrepriseAdmin;
  surModification: (fiche: EntrepriseAdmin) => void;
}) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [charge, setCharge] = useState(false);
  const [motif, setMotif] = useState("");

  async function modifier(corps: Record<string, unknown>): Promise<void> {
    setErreur(null);
    setCharge(true);
    try {
      surModification(
        await appelAdmin<EntrepriseAdmin>(`/entreprises/${entreprise.id}`, {
          methode: "PATCH",
          corps,
        }),
      );
      setMotif("");
    } catch (cause) {
      setErreur(cause instanceof ErreurApiAdmin ? cause.message : "Modification impossible.");
    } finally {
      setCharge(false);
    }
  }

  return (
    <div className="space-y-5 border-t border-white/10 px-5 py-5">
      {erreur !== null && <Alerte>{erreur}</Alerte>}

      <dl className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-1.5 text-sm">
        <dt className="text-ardoise-400">Secteur</dt>
        <dd>{entreprise.secteur}</dd>
        <dt className="text-ardoise-400">Créée le</dt>
        <dd className="tabular-nums">
          {new Date(entreprise.cree_le).toLocaleDateString("fr-FR")}
        </dd>
        <dt className="text-ardoise-400">Volumes</dt>
        <dd className="tabular-nums">
          {entreprise.nombre_ventes} vente{entreprise.nombre_ventes > 1 ? "s" : ""} ·{" "}
          {entreprise.nombre_depenses} dépense{entreprise.nombre_depenses > 1 ? "s" : ""} ·{" "}
          {entreprise.nombre_utilisateurs} utilisateur
          {entreprise.nombre_utilisateurs > 1 ? "s" : ""}
        </dd>
        <dt className="text-ardoise-400">Dernière activité</dt>
        <dd className="tabular-nums">
          {entreprise.derniere_activite_le === null
            ? "jamais connecté"
            : new Date(entreprise.derniere_activite_le).toLocaleString("fr-FR")}
        </dd>
        {entreprise.motif_suspension !== null && (
          <>
            <dt className="text-ardoise-400">Motif</dt>
            <dd className="text-corail-400">{entreprise.motif_suspension}</dd>
          </>
        )}
      </dl>

      <div className="flex flex-wrap items-end gap-3 border-t border-white/5 pt-4">
        <div className="w-44">
          <Liste
            libelle="Formule"
            value={entreprise.plan}
            disabled={charge}
            onChange={(e) => void modifier({ plan: e.target.value })}
          >
            {PLANS.map((code) => (
              <option key={code} value={code} className="bg-ardoise-900">
                {LIBELLES_PLAN[code]}
              </option>
            ))}
          </Liste>
        </div>
        <p className="pb-2 text-xs text-ardoise-400">
          Changement manuel : aucun paiement en ligne au MVP.
        </p>
      </div>

      {entreprise.statut === "ACTIF" ? (
        <div className="flex flex-wrap items-end gap-3 border-t border-white/5 pt-4">
          <div className="min-w-64 flex-1">
            <Champ
              libelle="Motif de suspension"
              placeholder="Impayé, usage abusif…"
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              aide="Obligatoire : une suspension sans motif est incompréhensible six mois plus tard."
            />
          </div>
          <Bouton
            type="button"
            variante="danger"
            charge={charge}
            disabled={motif.trim() === ""}
            onClick={() => void modifier({ statut: "SUSPENDU", motif_suspension: motif.trim() })}
          >
            Suspendre
          </Bouton>
        </div>
      ) : (
        <div className="border-t border-white/5 pt-4">
          <Bouton
            type="button"
            variante="discret"
            charge={charge}
            onClick={() => void modifier({ statut: "ACTIF" })}
          >
            Réactiver le compte
          </Bouton>
        </div>
      )}

      {entreprise.proprietaire !== null && (
        <ReinitialisationMotDePasse
          utilisateurId={entreprise.proprietaire.id}
          email={entreprise.proprietaire.email}
        />
      )}
    </div>
  );
}

/**
 * Réinitialisation manuelle du mot de passe.
 *
 * C'est le remplacement du « mot de passe oublié » tant qu'aucun service
 * d'e-mail n'est en place. Toutes les sessions du client tombent.
 */
function ReinitialisationMotDePasse({
  utilisateurId,
  email,
}: {
  utilisateurId: string;
  email: string;
}) {
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [fait, setFait] = useState(false);
  const [charge, setCharge] = useState(false);

  async function reinitialiser(): Promise<void> {
    setErreur(null);
    setFait(false);
    setCharge(true);
    try {
      await appelAdmin<void>(`/utilisateurs/${utilisateurId}/mot-de-passe`, {
        methode: "POST",
        corps: { mot_de_passe: motDePasse },
      });
      setMotDePasse("");
      setFait(true);
    } catch (cause) {
      setErreur(cause instanceof ErreurApiAdmin ? cause.message : "Réinitialisation impossible.");
    } finally {
      setCharge(false);
    }
  }

  return (
    <div className="space-y-3 border-t border-white/5 pt-4">
      {erreur !== null && <Alerte>{erreur}</Alerte>}
      {fait && (
        <p role="status" className="text-sm text-menthe-400">
          Mot de passe réinitialisé. Transmettez-le à {email} par un autre canal, et demandez-lui
          de le changer depuis Paramètres.
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <Champ
            libelle="Nouveau mot de passe du propriétaire"
            type="text"
            autoComplete="off"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            aide="Toutes ses sessions seront fermées. Mêmes règles de robustesse qu'à l'inscription."
          />
        </div>
        <Bouton
          type="button"
          variante="discret"
          charge={charge}
          disabled={motDePasse === ""}
          onClick={() => void reinitialiser()}
        >
          Réinitialiser
        </Bouton>
      </div>
    </div>
  );
}
