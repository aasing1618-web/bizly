import { useState, type FormEvent } from "react";
import type { CorpsConnexion } from "@bizly/shared";
import { Alerte, Bouton, Champ } from "../composants/Formulaire";
import { ErreurApiClient } from "../lib/api";

export type ConnexionProps = {
  connecter: (corps: CorpsConnexion) => Promise<void>;
  versInscription: () => void;
};

export function Connexion({ connecter, versInscription }: ConnexionProps) {
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<ErreurApiClient | null>(null);
  const [charge, setCharge] = useState(false);

  async function soumettre(evenement: FormEvent) {
    evenement.preventDefault();
    setErreur(null);
    setCharge(true);

    try {
      await connecter({ email, mot_de_passe: motDePasse });
    } catch (cause) {
      setErreur(
        cause instanceof ErreurApiClient
          ? cause
          : new ErreurApiClient(0, "INCONNU", "Une erreur inattendue est survenue."),
      );
      // Le mot de passe est vidé, l'e-mail conservé : refaire les deux à chaque
      // faute de frappe est pénible, et l'e-mail n'est pas le secret.
      setMotDePasse("");
    } finally {
      setCharge(false);
    }
  }

  return (
    <form onSubmit={soumettre} className="space-y-5" noValidate>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Connexion</h1>
        <p className="mt-1 text-sm text-ardoise-400">Accédez à votre tableau de bord Bizly.</p>
      </header>

      {erreur !== null && <Alerte>{erreur.message}</Alerte>}

      <Champ
        libelle="Adresse e-mail"
        type="email"
        name="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="vous@exemple.fr"
      />

      <Champ
        libelle="Mot de passe"
        type="password"
        name="mot_de_passe"
        autoComplete="current-password"
        required
        value={motDePasse}
        onChange={(e) => setMotDePasse(e.target.value)}
      />

      <Bouton charge={charge}>Se connecter</Bouton>

      <p className="text-center text-sm text-ardoise-400">
        Pas encore de compte ?{" "}
        <button
          type="button"
          onClick={versInscription}
          className="font-medium text-menthe-400 underline-offset-4 hover:underline"
        >
          Créer un compte
        </button>
      </p>

      {/* Tant qu'aucun service d'e-mail n'est choisi, la réinitialisation se
          fait à la main depuis /admin. Le dire vaut mieux qu'un lien mort. */}
      <p className="text-center text-xs text-ardoise-400/70">
        Mot de passe oublié ? Contactez le support, la réinitialisation est manuelle
        pour l&apos;instant.
      </p>
    </form>
  );
}
