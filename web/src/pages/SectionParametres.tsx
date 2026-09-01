import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { PaiementWave } from "../composants/PaiementWave";
import { useAbonnement } from "../lib/abonnement";
import {
  MOT_DE_PASSE_LONGUEUR_MIN,
  type EntreprisePublique,
  type Plan,
  type UtilisateurPublic,
  type VolumesEnregistres,
} from "@bizly/shared";
import { ChoixDevise } from "../composants/ChoixDevise";
import { Alerte, Bouton, Champ, Liste } from "../composants/Formulaire";
import { appelApi, ErreurApiClient } from "../lib/api";
import { fuseauxDisponibles, useReferentiels } from "../lib/referentiels";

/**
 * Paramètres — CLAUDE.md §8, contrat `docs/API-CONTRACT.md` §8.
 *
 * Trois blocs indépendants, chacun avec son bouton : entreprise, profil, mot de
 * passe. Un seul formulaire géant obligerait à ressaisir son mot de passe pour
 * corriger une faute dans le nom de la boutique.
 */

export type SectionParametresProps = {
  entreprise: EntreprisePublique;
  utilisateur: UtilisateurPublic;
  appliquer: (partiel: {
    entreprise?: EntreprisePublique;
    utilisateur?: UtilisateurPublic;
  }) => void;
};

const LIBELLES_PLAN: Record<Plan, string> = {
  free: "Découverte",
  pro: "Pro",
  business: "Business",
};

export function SectionParametres({
  entreprise,
  utilisateur,
  appliquer,
}: SectionParametresProps) {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <BlocEntreprise entreprise={entreprise} appliquer={appliquer} />
      <BlocProfil utilisateur={utilisateur} appliquer={appliquer} />
      <BlocMotDePasse />
      <BlocAbonnement entreprise={entreprise} />
    </div>
  );
}

// ---------------------------------------------------------------- entreprise --

function BlocEntreprise({
  entreprise,
  appliquer,
}: {
  entreprise: EntreprisePublique;
  appliquer: SectionParametresProps["appliquer"];
}) {
  const referentiels = useReferentiels();

  const [nom, setNom] = useState(entreprise.nom);
  const [secteur, setSecteur] = useState(entreprise.secteur);
  const [pays, setPays] = useState(entreprise.pays ?? "");
  const [devise, setDevise] = useState(entreprise.devise.code);
  const [fuseau, setFuseau] = useState(entreprise.fuseau);
  const [erreur, setErreur] = useState<ErreurApiClient | null>(null);
  const [succes, setSucces] = useState(false);
  const [charge, setCharge] = useState(false);

  // Une modification faite ailleurs (console d'administration, autre onglet)
  // doit se refléter ici plutôt que d'être écrasée à l'enregistrement suivant.
  useEffect(() => {
    setNom(entreprise.nom);
    setSecteur(entreprise.secteur);
    setPays(entreprise.pays ?? "");
    setDevise(entreprise.devise.code);
    setFuseau(entreprise.fuseau);
  }, [entreprise]);

  function changerPays(code: string): void {
    setPays(code);
    if (referentiels.phase !== "prets") return;

    const trouve = referentiels.donnees.pays.find((candidat) => candidat.code === code);
    if (trouve === undefined) return;

    // Le fuseau suit le pays ; la devise, elle, ne bouge que si aucun montant
    // n'est encore enregistré — sinon le serveur refuserait l'enregistrement.
    setFuseau(trouve.fuseau);
    setDevise(trouve.devise);
  }

  async function soumettre(evenement: FormEvent) {
    evenement.preventDefault();
    setErreur(null);
    setSucces(false);
    setCharge(true);

    try {
      const modifiee = await appelApi<EntreprisePublique>("/entreprise", {
        methode: "PATCH",
        corps: { nom, secteur, pays: pays === "" ? null : pays, devise, fuseau },
      });
      appliquer({ entreprise: modifiee });
      setSucces(true);
    } catch (cause) {
      const echec =
        cause instanceof ErreurApiClient
          ? cause
          : new ErreurApiClient(0, "INCONNU", "Une erreur inattendue est survenue.");
      setErreur(echec);

      // Devise refusée : rien n'a été écrit, pas même le nom. Le champ doit
      // donc réafficher la devise réelle, sinon l'écran mentirait sur ce qui
      // est enregistré.
      if (volumesDuRefus(echec) !== null) setDevise(entreprise.devise.code);
    } finally {
      setCharge(false);
    }
  }

  // Le serveur est seul juge du verrou de devise. Tant qu'il n'a pas répondu,
  // on n'affiche aucun cadenas : deviner produirait un blocage à tort.
  const volumes = volumesDuRefus(erreur);
  const verrou =
    volumes === null
      ? undefined
      : `Verrouillée : ${resume(volumes)} en ${entreprise.devise.code}. ` +
        `Changer la devise réinterpréterait ces montants sans les convertir.`;

  return (
    <Carte titre="Votre entreprise">
      <form onSubmit={soumettre} className="space-y-4" noValidate>
        {erreur !== null && erreur.champs.length === 0 && <Alerte>{erreur.message}</Alerte>}
        {succes && <Confirmation>Modifications enregistrées.</Confirmation>}

        <Champ
          libelle="Nom de l'entreprise"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          required
          erreur={erreur?.messagePour("nom")}
        />

        {referentiels.phase === "prets" && (
          <>
            <Liste
              libelle="Secteur d'activité"
              value={secteur}
              onChange={(e) => setSecteur(e.target.value)}
              erreur={erreur?.messagePour("secteur")}
            >
              {referentiels.donnees.secteurs.map((element) => (
                <option key={element.code} value={element.code} className="bg-ardoise-900">
                  {element.libelle}
                </option>
              ))}
            </Liste>

            <Liste
              libelle="Pays"
              value={pays}
              onChange={(e) => changerPays(e.target.value)}
              erreur={erreur?.messagePour("pays")}
            >
              <option value="" className="bg-ardoise-900">
                — Non précisé —
              </option>
              {referentiels.donnees.pays.map((element) => (
                <option key={element.code} value={element.code} className="bg-ardoise-900">
                  {element.nom}
                </option>
              ))}
            </Liste>

            <ChoixDevise
              devises={referentiels.donnees.devises}
              rapides={referentiels.donnees.devises_rapides}
              valeur={devise}
              onChange={setDevise}
              verrou={verrou}
              erreur={verrou === undefined ? erreur?.messagePour("devise") : undefined}
            />
          </>
        )}

        <ChampFuseau
          valeur={fuseau}
          onChange={setFuseau}
          erreur={erreur?.messagePour("fuseau")}
        />

        <Bouton charge={charge}>Enregistrer</Bouton>
      </form>
    </Carte>
  );
}

/**
 * Sélecteur de fuseau horaire.
 *
 * Une liste, jamais un champ libre : le serveur ET un trigger Postgres refusent
 * un fuseau inconnu, autant ne proposer que des valeurs qui passent.
 */
function ChampFuseau({
  valeur,
  onChange,
  erreur,
}: {
  valeur: string;
  onChange: (fuseau: string) => void;
  erreur?: string | undefined;
}) {
  const [fuseaux] = useState(() => {
    const disponibles = fuseauxDisponibles();
    // La valeur en cours doit figurer dans la liste, sinon le `select`
    // afficherait autre chose que ce qui est réellement enregistré.
    return disponibles.includes(valeur) ? disponibles : [valeur, ...disponibles];
  });

  return (
    <Liste
      libelle="Fuseau horaire"
      value={valeur}
      onChange={(e) => onChange(e.target.value)}
      erreur={erreur}
    >
      {fuseaux.map((fuseau) => (
        <option key={fuseau} value={fuseau} className="bg-ardoise-900">
          {fuseau.replace(/_/g, " ")}
        </option>
      ))}
    </Liste>
  );
}

// -------------------------------------------------------------------- profil --

function BlocProfil({
  utilisateur,
  appliquer,
}: {
  utilisateur: UtilisateurPublic;
  appliquer: SectionParametresProps["appliquer"];
}) {
  const [nom, setNom] = useState(utilisateur.nom);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);
  const [charge, setCharge] = useState(false);

  useEffect(() => setNom(utilisateur.nom), [utilisateur]);

  async function soumettre(evenement: FormEvent) {
    evenement.preventDefault();
    setErreur(null);
    setSucces(false);
    setCharge(true);

    try {
      appliquer({
        utilisateur: await appelApi<UtilisateurPublic>("/moi", {
          methode: "PATCH",
          corps: { nom },
        }),
      });
      setSucces(true);
    } catch (cause) {
      setErreur(cause instanceof ErreurApiClient ? cause.message : "Enregistrement impossible.");
    } finally {
      setCharge(false);
    }
  }

  return (
    <Carte titre="Votre compte">
      <form onSubmit={soumettre} className="space-y-4" noValidate>
        {erreur !== null && <Alerte>{erreur}</Alerte>}
        {succes && <Confirmation>Nom mis à jour.</Confirmation>}

        <Champ
          libelle="Votre nom"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          required
          autoComplete="name"
        />

        <Champ
          libelle="Adresse e-mail"
          value={utilisateur.email}
          readOnly
          disabled
          aide="L'adresse identifie votre compte. La changer demande de vérifier la nouvelle — ce n'est pas encore possible."
        />

        <Bouton charge={charge}>Enregistrer</Bouton>
      </form>
    </Carte>
  );
}

// -------------------------------------------------------------- mot de passe --

function BlocMotDePasse() {
  const [ancien, setAncien] = useState("");
  const [nouveau, setNouveau] = useState("");
  const [erreur, setErreur] = useState<ErreurApiClient | null>(null);
  const [succes, setSucces] = useState(false);
  const [charge, setCharge] = useState(false);

  async function soumettre(evenement: FormEvent) {
    evenement.preventDefault();
    setErreur(null);
    setSucces(false);
    setCharge(true);

    try {
      await appelApi<void>("/mot-de-passe", { methode: "POST", corps: { ancien, nouveau } });
      setAncien("");
      setNouveau("");
      setSucces(true);
    } catch (cause) {
      setErreur(
        cause instanceof ErreurApiClient
          ? cause
          : new ErreurApiClient(0, "INCONNU", "Changement impossible."),
      );
    } finally {
      setCharge(false);
    }
  }

  return (
    <Carte titre="Mot de passe">
      <form onSubmit={soumettre} className="space-y-4" noValidate>
        {erreur !== null && erreur.champs.length === 0 && <Alerte>{erreur.message}</Alerte>}
        {succes && (
          <Confirmation>
            Mot de passe changé. Vos autres appareils ont été déconnectés.
          </Confirmation>
        )}

        <Champ
          libelle="Mot de passe actuel"
          type="password"
          autoComplete="current-password"
          value={ancien}
          onChange={(e) => setAncien(e.target.value)}
          required
          erreur={erreur?.messagePour("ancien")}
        />

        <Champ
          libelle="Nouveau mot de passe"
          type="password"
          autoComplete="new-password"
          value={nouveau}
          onChange={(e) => setNouveau(e.target.value)}
          required
          aide={`${MOT_DE_PASSE_LONGUEUR_MIN} caractères minimum. Les sessions ouvertes sur vos autres appareils seront fermées.`}
          erreur={erreur?.messagePour("nouveau")}
        />

        <Bouton charge={charge} disabled={ancien === "" || nouveau === ""}>
          Changer le mot de passe
        </Bouton>
      </form>
    </Carte>
  );
}

// ---------------------------------------------------------------- abonnement --

/**
 * Abonnement — état actuel et paiement Wave.
 *
 * Le bloc de paiement lui-même est le composant partagé avec l'écran de
 * blocage : un client encore en essai et un client bloqué voient le même
 * montant, le même numéro et la même marche à suivre. Deux copies auraient fini
 * par afficher deux prix.
 */
function BlocAbonnement({ entreprise }: { entreprise: EntreprisePublique }) {
  const { etat, erreurAction, declarer, recharger } = useAbonnement();
  const { acces } = entreprise;

  const libelleEcheance = () => {
    if (acces.motif === "EXEMPT") return "Accès permanent — aucune facturation.";
    if (acces.motif === "ABONNE") {
      return `Abonnement Pro actif — ${acces.jours_restants} jour(s) restant(s).`;
    }
    if (acces.motif === "ESSAI") {
      return `Essai gratuit — ${acces.jours_restants} jour(s) restant(s).`;
    }
    return "Accès fermé : renouvelez pour retrouver votre tableau de bord.";
  };

  return (
    <Carte titre="Abonnement">
      <div className="space-y-5">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Formule actuelle
          </span>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-xl font-bold text-amber-400">
              {LIBELLES_PLAN[entreprise.plan]}
            </span>
            {!acces.bloque && (
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
                Actif
              </span>
            )}
          </div>
          <p className="mt-2 text-sm text-slate-400">{libelleEcheance()}</p>
        </div>

        {acces.motif === "EXEMPT" ? (
          <p className="text-sm text-slate-400">
            Ce compte n'est pas facturé. Aucun paiement n'est attendu.
          </p>
        ) : (
          <>
            {etat.phase === "chargement" && (
              <p className="text-sm text-slate-400" role="status">
                Chargement…
              </p>
            )}
            {etat.phase === "echec" && <Alerte>{etat.message}</Alerte>}
            {etat.phase === "pret" && (
              <PaiementWave
                statut={etat.statut}
                declarer={declarer}
                erreur={erreurAction}
                recharger={recharger}
              />
            )}
          </>
        )}
      </div>
    </Carte>
  );
}

// ------------------------------------------------------------------- briques --

function Carte({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <section className="bizly-card p-6">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          {titre}
        </h2>
        <span className="pill-tag pill-indigo">Paramètres</span>
      </div>
      {children}
    </section>
  );
}

function Confirmation({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800 shadow-xs"
    >
      ✓ {children}
    </p>
  );
}

/**
 * Les volumes joints à un refus de changement de devise (§8.2), s'il y en a.
 *
 * On lit le `details.volumes` de la réponse plutôt que de recompter côté
 * client : c'est le serveur qui décide, et son décompte est le seul juste.
 */
function volumesDuRefus(erreur: ErreurApiClient | null): VolumesEnregistres | null {
  if (erreur === null || erreur.code !== "CONFLIT") return null;

  const volumes = erreur.details["volumes"];
  if (typeof volumes !== "object" || volumes === null) return null;

  const { ventes, depenses, produits } = volumes as Partial<VolumesEnregistres>;
  if (typeof ventes !== "number" || typeof depenses !== "number" || typeof produits !== "number") {
    return null;
  }
  return { ventes, depenses, produits };
}

/** « 12 ventes, 5 dépenses et 4 produits », sans les catégories vides. */
function resume(volumes: VolumesEnregistres): string {
  const morceaux: string[] = [];
  if (volumes.ventes > 0) morceaux.push(`${volumes.ventes} vente${volumes.ventes > 1 ? "s" : ""}`);
  if (volumes.depenses > 0) {
    morceaux.push(`${volumes.depenses} dépense${volumes.depenses > 1 ? "s" : ""}`);
  }
  if (volumes.produits > 0) {
    morceaux.push(`${volumes.produits} produit${volumes.produits > 1 ? "s" : ""}`);
  }

  const dernier = morceaux[morceaux.length - 1];
  if (dernier === undefined) return "des montants sont enregistrés";
  if (morceaux.length === 1) return dernier;
  return `${morceaux.slice(0, -1).join(", ")} et ${dernier}`;
}
