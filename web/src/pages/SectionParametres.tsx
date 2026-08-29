import { useEffect, useState, type FormEvent, type ReactNode } from "react";
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
      <BlocAbonnement entreprise={entreprise} appliquer={appliquer} />
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

function BlocAbonnement({
  entreprise,
  appliquer,
}: {
  entreprise: EntreprisePublique;
  appliquer?: SectionParametresProps["appliquer"];
}) {
  const [cycle, setCycle] = useState<"mensuel" | "annuel">("mensuel");
  const [planChoisi, setPlanChoisi] = useState<"pro" | "business">("pro");
  const [moyenPaiement, setMoyenPaiement] = useState<"wave" | "orange_money">("wave");
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // État transaction initialisée
  const [transaction, setTransaction] = useState<{
    reference_transaction: string;
    montant: number;
    devise: string;
    plan: string;
    cycle: string;
    moyen_paiement: string;
  } | null>(null);

  const [confirmationSuccess, setConfirmationSuccess] = useState<string | null>(null);

  async function initialiserPaiement() {
    setErreur(null);
    setChargement(true);
    try {
      const res = await appelApi<{
        reference_transaction: string;
        montant: number;
        devise: string;
        plan: string;
        cycle: string;
        moyen_paiement: string;
      }>("/paiement/initialiser", {
        methode: "POST",
        corps: {
          plan: planChoisi,
          cycle,
          moyen_paiement: moyenPaiement,
        },
      });
      setTransaction(res);
    } catch (err) {
      setErreur(err instanceof ErreurApiClient ? err.message : "Erreur lors de l'initialisation du paiement.");
    } finally {
      setChargement(false);
    }
  }

  async function simulerConfirmation() {
    if (!transaction) return;
    setErreur(null);
    setChargement(true);
    try {
      const res = await appelApi<{ succes: boolean; message: string }>("/paiement/simuler-confirmation", {
        methode: "POST",
        corps: { reference_transaction: transaction.reference_transaction },
      });

      if (res.succes) {
        setConfirmationSuccess(res.message);
        setTransaction(null);
        if (appliquer) {
          appliquer({
            entreprise: {
              ...entreprise,
              plan: planChoisi,
            },
          });
        }
      }
    } catch (err) {
      setErreur(err instanceof ErreurApiClient ? err.message : "Erreur lors de la confirmation du paiement.");
    } finally {
      setChargement(false);
    }
  }

  return (
    <Carte titre="Abonnement & Facturation Mobile Money">
      <div className="space-y-6">
        {/* Statut actuel */}
        <div className="flex flex-wrap items-center justify-between rounded-xl bg-slate-900/60 p-4 border border-slate-800">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Formule actuelle</span>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xl font-bold text-amber-400">{LIBELLES_PLAN[entreprise.plan]}</span>
              {entreprise.plan !== "free" && (
                <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
                  Actif (Validé)
                </span>
              )}
            </div>
          </div>

          <div className="text-right">
            <span className="text-xs text-slate-400">Statut du compte</span>
            <p className="text-sm font-semibold text-slate-200">{entreprise.statut === "ACTIF" ? "Actif" : "Suspendu"}</p>
          </div>
        </div>

        {confirmationSuccess && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm font-semibold text-emerald-300">
            🎉 {confirmationSuccess}
          </div>
        )}

        {erreur && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-semibold text-red-300">
            ⚠️ {erreur}
          </div>
        )}

        {/* Modal de checkout / transaction en cours */}
        {transaction ? (
          <div className="rounded-2xl border border-amber-500/30 bg-slate-900/90 p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-amber-400">Paiement Mobile Money en cours</h3>
              <span className="text-xs text-slate-400 font-mono">{transaction.reference_transaction}</span>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-xs text-slate-400">Offre sélectionnée</span>
                <p className="font-semibold text-slate-200">
                  Plan {transaction.plan.toUpperCase()} ({transaction.cycle})
                </p>
              </div>
              <div>
                <span className="text-xs text-slate-400">Moyen de paiement</span>
                <p className="font-semibold text-slate-200">
                  {transaction.moyen_paiement === "wave" ? "🌊 Wave Mobile" : "🟠 Orange Money"}
                </p>
              </div>
              <div className="col-span-2 rounded-xl bg-amber-400/10 p-3.5 border border-amber-400/20 text-center">
                <span className="text-xs text-amber-300 uppercase tracking-wider font-semibold">Montant à régler</span>
                <p className="text-3xl font-black text-amber-400 mt-1">
                  {transaction.montant.toLocaleString()} {transaction.devise}
                </p>
              </div>
            </div>

            {/* Instructions spécifiques Mobile Money */}
            <div className="rounded-xl bg-slate-950 p-4 border border-slate-800 text-xs space-y-2">
              <h4 className="font-bold text-amber-300 flex items-center gap-1.5">
                <span>📱</span> Instructions de règlement {transaction.moyen_paiement === "wave" ? "Wave" : "Orange Money"}
              </h4>
              {transaction.moyen_paiement === "wave" ? (
                <p className="text-slate-300 leading-relaxed">
                  1. Ouvrez l'application <strong>Wave</strong> sur votre téléphone.<br />
                  2. Scannez ou confirmez le transfert de <strong>{transaction.montant.toLocaleString()} FCFA</strong> vers la référence <code className="text-amber-300 font-mono bg-slate-900 px-1 py-0.5 rounded">{transaction.reference_transaction}</code>.<br />
                  3. Cliquez sur le bouton ci-dessous pour valider l'activation instantanée.
                </p>
              ) : (
                <p className="text-slate-300 leading-relaxed">
                  1. Tapez le code USSD <strong>#144#</strong> ou ouvrez l'application <strong>Orange Money</strong>.<br />
                  2. Approuvez le paiement de <strong>{transaction.montant.toLocaleString()} FCFA</strong>.<br />
                  3. Cliquez sur le bouton ci-dessous dès que le débit est confirmé.
                </p>
              )}
            </div>

            <div className="pt-2 space-y-2">
              <button
                type="button"
                onClick={simulerConfirmation}
                disabled={chargement}
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-bold hover:from-amber-400 hover:to-amber-500 transition-all shadow-lg text-sm flex items-center justify-center gap-2"
              >
                {chargement ? "Validation en cours..." : "✓ Confirmer et Activer l'Abonnement Pro (Wave / OM)"}
              </button>
              <button
                type="button"
                onClick={() => setTransaction(null)}
                className="w-full py-2 text-xs text-slate-400 hover:text-slate-200 transition-colors"
              >
                Annuler et choisir un autre moyen
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Toggle Cycle */}
            <div className="flex items-center justify-center">
              <div className="inline-flex rounded-xl bg-slate-900 p-1 border border-slate-800">
                <button
                  type="button"
                  onClick={() => setCycle("mensuel")}
                  className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
                    cycle === "mensuel" ? "bg-amber-400 text-slate-950 shadow-xs" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Facturation Mensuelle
                </button>
                <button
                  type="button"
                  onClick={() => setCycle("annuel")}
                  className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
                    cycle === "annuel" ? "bg-amber-400 text-slate-950 shadow-xs" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Annuelle <span className="ml-1 text-[10px] uppercase text-slate-900 font-extrabold bg-amber-200 px-1.5 py-0.5 rounded-full">-17%</span>
                </button>
              </div>
            </div>

            {/* Choix des Plans */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Plan Starter Pro */}
              <div
                onClick={() => setPlanChoisi("pro")}
                className={`cursor-pointer rounded-2xl p-4 border transition-all ${
                  planChoisi === "pro"
                    ? "border-amber-400 bg-amber-400/5 ring-1 ring-amber-400"
                    : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Starter Pro</span>
                  {planChoisi === "pro" && <span className="text-amber-400 font-bold">✓</span>}
                </div>
                <div className="mt-2">
                  <span className="text-2xl font-black text-slate-100">
                    {cycle === "mensuel" ? "2 500 FCFA" : "25 000 FCFA"}
                  </span>
                  <span className="text-xs text-slate-400 font-normal"> / {cycle === "mensuel" ? "mois" : "an"}</span>
                </div>
                <ul className="mt-3 space-y-1.5 text-xs text-slate-300">
                  <li>✓ Ventes & Dépenses illimitées</li>
                  <li>✓ Moteur IA d'explication financière</li>
                  <li>✓ Export PDF/Excel complet</li>
                </ul>
              </div>

              {/* Plan Business */}
              <div
                onClick={() => setPlanChoisi("business")}
                className={`cursor-pointer rounded-2xl p-4 border transition-all ${
                  planChoisi === "business"
                    ? "border-amber-400 bg-amber-400/5 ring-1 ring-amber-400"
                    : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Business</span>
                  {planChoisi === "business" && <span className="text-amber-400 font-bold">✓</span>}
                </div>
                <div className="mt-2">
                  <span className="text-2xl font-black text-slate-100">
                    {cycle === "mensuel" ? "5 000 FCFA" : "50 000 FCFA"}
                  </span>
                  <span className="text-xs text-slate-400 font-normal"> / {cycle === "mensuel" ? "mois" : "an"}</span>
                </div>
                <ul className="mt-3 space-y-1.5 text-xs text-slate-300">
                  <li>✓ Tout ce qui est inclus dans Pro</li>
                  <li>✓ Multi-boutiques & Multi-devises</li>
                  <li>✓ Support prioritaire 7j/7</li>
                </ul>
              </div>
            </div>

            {/* Moyen de Paiement */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Moyen de Paiement Mobile Money
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setMoyenPaiement("wave")}
                  className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-semibold transition-all ${
                    moyenPaiement === "wave"
                      ? "border-cyan-400 bg-cyan-400/10 text-cyan-300"
                      : "border-slate-800 bg-slate-900/40 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <span className="text-lg">🌊</span> Wave Mobile
                </button>
                <button
                  type="button"
                  onClick={() => setMoyenPaiement("orange_money")}
                  className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-semibold transition-all ${
                    moyenPaiement === "orange_money"
                      ? "border-orange-400 bg-orange-400/10 text-orange-300"
                      : "border-slate-800 bg-slate-900/40 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <span className="text-lg">🟠</span> Orange Money
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={initialiserPaiement}
              disabled={chargement}
              className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-bold hover:from-amber-400 hover:to-amber-500 transition-all shadow-lg text-sm flex items-center justify-center gap-2"
            >
              {chargement ? "Initialisation..." : `Payer avec ${moyenPaiement === "wave" ? "Wave" : "Orange Money"}`}
            </button>
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
