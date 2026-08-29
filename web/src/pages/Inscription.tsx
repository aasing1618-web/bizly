import { useEffect, useState, type FormEvent } from "react";
import { MOT_DE_PASSE_LONGUEUR_MIN, type CorpsInscription } from "@bizly/shared";
import { ChoixDevise } from "../composants/ChoixDevise";
import { Alerte, Bouton, Champ, Liste } from "../composants/Formulaire";
import { ErreurApiClient } from "../lib/api";
import { paysProbable, useReferentiels } from "../lib/referentiels";

export type InscriptionProps = {
  inscrire: (corps: CorpsInscription) => Promise<void>;
  versConnexion: () => void;
};

/**
 * Création d'un compte : l'entreprise et son propriétaire, en une étape.
 *
 * Secteurs, devises et pays viennent de `GET /api/referentiels` — jamais d'une
 * liste recopiée ici, qui finirait par proposer un code que le serveur refuse.
 *
 * Le **pays** est le seul champ de localisation demandé : il remplit la devise
 * et le fuseau, tous deux modifiables ensuite. Poser trois questions là où une
 * suffit est le contraire du principe « moins de champs » (CLAUDE.md §8).
 */
export function Inscription({ inscrire, versConnexion }: InscriptionProps) {
  const referentiels = useReferentiels();

  const [nomEntreprise, setNomEntreprise] = useState("");
  const [secteur, setSecteur] = useState("");
  const [pays, setPays] = useState("");
  const [devise, setDevise] = useState("");
  // Une devise choisie à la main ne doit plus bouger quand on change de pays :
  // sinon le choix explicite de l'utilisateur serait écrasé en silence.
  const [deviseImposee, setDeviseImposee] = useState(false);
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<ErreurApiClient | null>(null);
  const [charge, setCharge] = useState(false);

  // Valeurs de départ, une seule fois, dès que les référentiels arrivent.
  const [prerempli, setPrerempli] = useState(false);
  useEffect(() => {
    if (referentiels.phase !== "prets" || prerempli) return;
    setPrerempli(true);

    const { secteurs, pays: listePays } = referentiels.donnees;
    setSecteur(secteurs[0]?.code ?? "");

    // Le fuseau du navigateur suffit à deviner le pays dans l'immense majorité
    // des cas. On le propose, on ne l'impose pas.
    const devine = paysProbable(listePays);
    if (devine === null) return;

    setPays(devine);
    const trouve = listePays.find((candidat) => candidat.code === devine);
    if (trouve !== undefined) setDevise(trouve.devise);
  }, [referentiels, prerempli]);

  function changerPays(code: string): void {
    setPays(code);
    if (deviseImposee) return;

    if (referentiels.phase === "prets") {
      const trouve = referentiels.donnees.pays.find((candidat) => candidat.code === code);
      if (trouve !== undefined) setDevise(trouve.devise);
    }
  }

  async function soumettre(evenement: FormEvent) {
    evenement.preventDefault();
    setErreur(null);
    setCharge(true);

    try {
      await inscrire({
        entreprise: {
          nom: nomEntreprise,
          secteur,
          ...(pays === "" ? {} : { pays }),
          ...(devise === "" ? {} : { devise }),
        },
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

  const erreurChamp = (champ: string) => erreur?.messagePour(champ);
  const erreurGenerale = erreur !== null && erreur.champs.length === 0 ? erreur.message : null;

  if (referentiels.phase === "chargement") {
    return (
      <p className="py-8 text-center text-sm text-ardoise-400" role="status">
        Chargement…
      </p>
    );
  }

  if (referentiels.phase === "echec") {
    return (
      <div className="space-y-4">
        <Alerte>
          Impossible de charger la liste des secteurs et des devises. Vérifiez votre connexion, puis
          rechargez la page.
        </Alerte>
        <button
          type="button"
          onClick={versConnexion}
          className="text-sm font-medium text-menthe-400 underline-offset-4 hover:underline"
        >
          Retour à la connexion
        </button>
      </div>
    );
  }

  const { secteurs, devises, devises_rapides, pays: listePays } = referentiels.donnees;

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
          {secteurs.map((element) => (
            <option key={element.code} value={element.code} className="bg-ardoise-900">
              {element.libelle}
            </option>
          ))}
        </Liste>

        <Liste
          libelle="Pays"
          name="pays"
          value={pays}
          onChange={(e) => changerPays(e.target.value)}
          erreur={erreurChamp("entreprise.pays")}
        >
          <option value="" className="bg-ardoise-900">
            — Choisir —
          </option>
          {listePays.map((element) => (
            <option key={element.code} value={element.code} className="bg-ardoise-900">
              {element.nom}
            </option>
          ))}
        </Liste>

        <ChoixDevise
          devises={devises}
          rapides={devises_rapides}
          valeur={devise}
          onChange={(code) => {
            setDevise(code);
            setDeviseImposee(true);
          }}
          erreur={erreurChamp("entreprise.devise")}
        />
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

      {/* La devise est le seul champ sans valeur par défaut acceptable : la
          laisser vide ferait retomber le serveur sur l'euro, silencieusement. */}
      <Bouton charge={charge} disabled={devise === ""}>
        Créer mon compte
      </Bouton>

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
