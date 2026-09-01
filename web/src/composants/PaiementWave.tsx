import { useState, type FormEvent } from "react";
import type { ReponseStatutAbonnement } from "@bizly/shared";
import { Alerte, Bouton, Champ } from "./Formulaire";

/**
 * Le bloc « payer par Wave », partagé par l'écran de blocage et les Paramètres.
 *
 * Un seul exemplaire, deux emplacements : un client bloqué et un client encore
 * en essai voient exactement la même marche à suivre, le même numéro et le même
 * montant. Deux copies auraient fini par diverger — c'est toujours le prix qui
 * diverge en premier.
 *
 * Le thème est piloté par `sombre` plutôt que par deux composants : la seule
 * différence entre les deux emplacements est un fond.
 */

export type PaiementWaveProps = {
  statut: ReponseStatutAbonnement;
  /** Renvoie `true` si la déclaration a été acceptée. */
  declarer: (referenceWave: string) => Promise<boolean>;
  erreur: string | null;
  /** Relit l'état auprès du serveur — bouton « vérifier maintenant ». */
  recharger: () => void;
};

const FRANCS = new Intl.NumberFormat("fr-FR");

export function PaiementWave({ statut, declarer, erreur, recharger }: PaiementWaveProps) {
  const [reference, setReference] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [copie, setCopie] = useState(false);

  async function copierNumero() {
    try {
      await navigator.clipboard.writeText(statut.numero_wave);
      setCopie(true);
      window.setTimeout(() => setCopie(false), 2500);
    } catch {
      // Presse-papiers indisponible (contexte non sécurisé, permission
      // refusée) : le numéro reste lisible et recopiable à la main. On
      // n'interrompt pas le parcours de paiement pour si peu.
      setCopie(false);
    }
  }

  async function soumettre(evenement: FormEvent) {
    evenement.preventDefault();
    setEnvoi(true);
    const passe = await declarer(reference.trim());
    if (passe) setReference("");
    setEnvoi(false);
  }

  if (statut.en_attente !== null) {
    return (
      <section className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-5 text-center">
        <p className="text-base font-bold text-amber-300">
          Paiement reçu, en cours de vérification
        </p>
        <p className="mt-2 text-sm text-slate-300">
          Votre référence{" "}
          <span className="font-mono font-semibold text-white">
            {statut.en_attente.reference_wave}
          </span>{" "}
          est enregistrée. Dès qu'elle est vérifiée, votre accès est rouvert.
        </p>
        <button
          type="button"
          onClick={recharger}
          className="mt-4 rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20"
        >
          Vérifier maintenant
        </button>
      </section>
    );
  }

  const dernierRefus = statut.historique.find(
    (paiement) => paiement.statut === "echoue" && paiement.motif_refus !== null,
  );

  return (
    <div className="space-y-4">
      {dernierRefus !== undefined && (
        <Alerte>
          Votre dernière déclaration n'a pas été validée : {dernierRefus.motif_refus}
        </Alerte>
      )}
      {erreur !== null && <Alerte>{erreur}</Alerte>}

      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
          Montant à envoyer
        </p>
        <p className="mt-1 text-3xl font-black text-white">
          {FRANCS.format(statut.prix_mensuel)}{" "}
          <span className="text-lg font-bold text-slate-400">FCFA / mois</span>
        </p>

        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
          À envoyer par Wave au
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <span className="font-mono text-2xl font-bold tracking-wide text-amber-300">
            {statut.numero_wave_affiche}
          </span>
          <button
            type="button"
            onClick={() => void copierNumero()}
            className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/20"
          >
            {copie ? "Copié ✓" : "Copier"}
          </button>
        </div>

        {/* Bouton affiché seulement si un vrai lien Wave Business existe : il
            n'y a pas d'URL publique déductible d'un numéro, et un bouton qui
            ne mène nulle part coûte plus cher que pas de bouton. */}
        {statut.lien_wave !== null && (
          <a
            href={statut.lien_wave}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-4 block rounded-xl bg-sky-500 px-4 py-3 text-center text-sm font-bold text-white hover:bg-sky-400"
          >
            Payer avec Wave
          </a>
        )}

        <ol className="mt-5 space-y-1.5 text-sm text-slate-300">
          <li>1. Ouvrez Wave et envoyez le montant à ce numéro.</li>
          <li>2. Notez la référence de transaction affichée par Wave.</li>
          <li>3. Saisissez-la ci-dessous pour que nous la retrouvions.</li>
        </ol>
      </section>

      <form
        onSubmit={soumettre}
        className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5"
        noValidate
      >
        <div className="[&_label]:text-slate-300 [&_input]:border-white/15 [&_input]:bg-white/10 [&_input]:text-white">
          <Champ
            libelle="Référence de votre paiement Wave"
            name="reference_wave"
            required
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Ex. TIRAJ7K2M9"
            aide="Elle figure sur le reçu affiché par Wave après l'envoi."
          />
        </div>
        <Bouton charge={envoi} disabled={reference.trim().length < 4}>
          J'ai payé — envoyer ma référence
        </Bouton>
      </form>
    </div>
  );
}
