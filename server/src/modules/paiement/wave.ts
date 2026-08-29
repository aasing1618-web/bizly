/**
 * Module d'intégration directe avec l'API Wave Merchant (Checkout API).
 *
 * Documentation officielle Wave Merchant API v1:
 * https://developer.wave.com/
 */

export type ReponseSessionWave = {
  id: string;
  wave_launch_url: string;
  checkout_status: "open" | "complete" | "cancelled";
  amount: string;
  currency: string;
};

export type OptionsCreationSessionWave = {
  montant: number;
  devise: string;
  referenceTransaction: string;
  urlSucces: string;
  urlAnnulation: string;
};

/**
 * Crée une session de paiement Wave via l'API officiel Wave.
 * Si WAVE_API_KEY n'est pas définie dans .env, la fonction lève une erreur
 * explicite pour basculer sur le mode simulation / passerelle.
 */
export async function creerSessionPaiementWave(
  options: OptionsCreationSessionWave,
): Promise<ReponseSessionWave> {
  const apiKey = process.env["WAVE_API_KEY"];
  if (!apiKey) {
    throw new Error("WAVE_API_KEY_MANQUANTE");
  }

  const urlApi = process.env["WAVE_API_URL"] || "https://api.wave.com/v1/checkout/sessions";

  const reponse = await fetch(urlApi, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: options.montant.toString(),
      currency: options.devise,
      error_url: options.urlAnnulation,
      success_url: options.urlSucces,
      client_reference: options.referenceTransaction,
    }),
  });

  if (!reponse.ok) {
    const texte = await reponse.text();
    throw new Error(`Erreur API Wave (${reponse.status}): ${texte}`);
  }

  const donnee = (await reponse.json()) as ReponseSessionWave;
  return donnee;
}
