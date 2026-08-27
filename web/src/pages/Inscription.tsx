import { useState, type FormEvent } from "react";
import { MOT_DE_PASSE_LONGUEUR_MIN, type CorpsInscription } from "@bizly/shared";
import { Alerte, Bouton, Champ, Liste } from "../composants/Formulaire";
import { ErreurApiClient } from "../lib/api";

/**
 * Secteurs proposés à l'inscription.
 *
 * Recopiés du référentiel `secteurs` : ils conditionnent les règles du moteur
 * de questions intelligentes. Le serveur reste seul juge — un code inconnu est
 * refusé en 400, cette liste n'est qu'un confort de saisie.
 */
const SECTEURS = [
  ["commerce_detail", "Commerce de détail"],
  ["restauration", "Restauration, café, bar"],
  ["services_pro", "Services professionnels et conseil"],
  ["artisanat_btp", "Artisanat et BTP"],
  ["beaute_bienetre", "Beauté et bien-être"],
  ["sante", "Santé et paramédical"],
  ["transport_logistique", "Transport et logistique"],
  ["education_formation", "Éducation et formation"],
  ["autre", "Autre activité"],
] as const;

export type InscriptionProps = {
  inscrire: (corps: CorpsInscription) => Promise<void>;
  versConnexion: () => void;
};

export function Inscription({ inscrire, versConnexion }: InscriptionProps) {
  const [nomEntreprise, setNomEntreprise] = useState("");
  const [secteur, setSecteur] = useState<string>(SECTEURS[0][0]);
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<ErreurApiClient | null>(null);
  const [charge, setCharge] = useState(false);

  async function soumettre(evenement: FormEvent) {
    evenement.preventDefault();
    setErreur(null);
    setCharge(true);

    try {
      await inscrire({
        entreprise: { nom: nomEntreprise, secteur },
        utilisateur: { nom, email, mot_de_passe: motDePasse },
      });
    } catch (cause) {
      setErreur(
        cause instanceof ErreurApiClient
          ? cause
          : new ErreurApiClient(0, "INCONNU", "Une erreur inattendue est survenue."),
      );
    } finally {
      setCharge(false);
    }
  }

  // Un message d'erreur rattaché à un champ s'affiche sous ce champ ; le
  // bandeau ne garde que ce qui ne vise aucun champ précis.
  const erreurChamp = (champ: string) => erreur?.messagePour(champ);
  const erreurGenerale =
    erreur !== null && erreur.champs.length === 0 ? erreur.message : null;

  return (
    <form onSubmit={soumettre} className="space-y-5" noValidate>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Créer un compte</h1>
        <p className="mt-1 text-sm text-ardoise-400">
          Votre entreprise et votre compte propriétaire, en une étape.
        </p>
      </header>

      {erreurGenerale !== null && <Alerte>{erreurGenerale}</Alerte>}

      <fieldset className="space-y-4">
        <legend className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-ardoise-400">
          Votre entreprise
        </legend>

        <Champ
          libelle="Nom de l'entreprise"
          name="entreprise_nom"
          autoComplete="organization"
          required
          value={nomEntreprise}
          onChange={(e) => setNomEntreprise(e.target.value)}
          placeholder="Boulangerie Martin"
          erreur={erreurChamp("entreprise.nom")}
        />

        <Liste
          libelle="Secteur d'activité"
          name="secteur"
          value={secteur}
          onChange={(e) => setSecteur(e.target.value)}
          erreur={erreurChamp("entreprise.secteur")}
        >
          {SECTEURS.map(([code, libelle]) => (
            <option key={code} value={code} className="bg-ardoise-900">
              {libelle}
            </option>
          ))}
        </Liste>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-ardoise-400">
          Votre compte
        </legend>

        <Champ
          libelle="Votre nom"
          name="nom"
          autoComplete="name"
          required
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          placeholder="Awa Martin"
          erreur={erreurChamp("utilisateur.nom")}
        />

        <Champ
          libelle="Adresse e-mail"
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="vous@exemple.fr"
          erreur={erreurChamp("utilisateur.email")}
        />

        <Champ
          libelle="Mot de passe"
          type="password"
          name="mot_de_passe"
          autoComplete="new-password"
          required
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
          aide={`${MOT_DE_PASSE_LONGUEUR_MIN} caractères minimum. Une phrase dont vous vous souvenez vaut mieux qu'un mot compliqué.`}
          erreur={erreurChamp("utilisateur.mot_de_passe")}
        />
      </fieldset>

      <Bouton charge={charge}>Créer mon compte</Bouton>

      <p className="text-center text-sm text-ardoise-400">
        Vous avez déjà un compte ?{" "}
        <button
          type="button"
          onClick={versConnexion}
          className="font-medium text-menthe-400 underline-offset-4 hover:underline"
        >
          Se connecter
        </button>
      </p>
    </form>
  );
}
