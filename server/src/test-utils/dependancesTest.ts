import type { DependancesApp } from "../app.js";
import type { EtatBase } from "../db/sonde.js";
import { fabriqueLimiteurMemoire } from "../http/limiteur.js";
import { creerServiceAdmin } from "../modules/admin/service.js";
import { creerServiceAuth } from "../modules/auth/service.js";
import { creerServiceOperations } from "../modules/operations/service.js";
import { creerDepotAdminMemoire, type DepotAdminMemoire } from "./depotAdminMemoire.js";
import { creerDepotCatalogueMemoire } from "./depotCatalogueMemoire.js";
import {
  creerDepotEntrepriseMemoire,
  type DepotEntrepriseMemoire,
} from "./depotEntrepriseMemoire.js";
import { creerDepotKpiMemoire } from "./depotKpiMemoire.js";
import { creerDepotMemoire, type DepotMemoire } from "./depotMemoire.js";
import { creerDepotOperationsMemoire } from "./depotOperationsMemoire.js";
import { creerDepotQuestionsMemoire } from "./depotQuestionsMemoire.js";
import { creerDepotReferentielsMemoire } from "./depotReferentielsMemoire.js";

/**
 * Fabrique un jeu complet de dépendances en mémoire — **tests uniquement**.
 *
 * Elle existe pour une raison précise : sans elle, ajouter une dépendance à
 * `creerApp` oblige à modifier six fichiers de test qui n'ont rien à voir avec
 * la nouveauté. Chaque test ne déclare donc que ce qui l'intéresse.
 *
 * Les objets liés sont construits **ensemble**, jamais indépendamment : le
 * service d'authentification et le dépôt d'entreprise partagent le même dépôt
 * en mémoire, sinon une entreprise renommée ne le serait pas dans la session
 * résolue, et les tests vérifieraient une cohérence que le vrai code n'a pas.
 */

import { creerDepotPaiementMemoire } from "./depotPaiementMemoire.js";
import { creerServicePaiement } from "../modules/paiement/service.js";

export type PiecesTest = {
  depotAuth: DepotMemoire;
  depotEntreprise: DepotEntrepriseMemoire;
  depotAdmin: DepotAdminMemoire;
};

export type SurchargesTest = Partial<DependancesApp> & {
  /** Le dépôt d'authentification à partager. Créé si absent. */
  depotAuth?: DepotMemoire;
};

/** Les dépendances **et** les pièces en mémoire, pour piloter le test. */
export function assemblerTest(surcharges: SurchargesTest = {}): {
  dependances: DependancesApp;
  pieces: PiecesTest;
} {
  const depotAuth = surcharges.depotAuth ?? creerDepotMemoire();
  const depotCatalogue = surcharges.depotCatalogue ?? creerDepotCatalogueMemoire();
  const depotEntreprise =
    (surcharges.depotEntreprise as DepotEntrepriseMemoire | undefined) ??
    creerDepotEntrepriseMemoire(depotAuth);
  const depotAdmin =
    (surcharges.depotAdmin as DepotAdminMemoire | undefined) ?? creerDepotAdminMemoire(depotAuth);
  const depotPaiement = surcharges.depotPaiement ?? creerDepotPaiementMemoire(depotAuth);
  const servicePaiement = surcharges.servicePaiement ?? creerServicePaiement(depotPaiement);

  const dependances: DependancesApp = {
    sonderBase: async (): Promise<EtatBase> => ({ statut: "ok", latence_ms: 1 }),
    serviceAuth: creerServiceAuth({ depot: depotAuth }),
    serviceOperations: creerServiceOperations(creerDepotOperationsMemoire(), depotCatalogue),
    serviceAdmin: creerServiceAdmin({ depot: depotAdmin }),
    servicePaiement,
    depotAuth,
    depotKpi: creerDepotKpiMemoire(),
    depotCatalogue,
    depotQuestions: creerDepotQuestionsMemoire(),
    depotEntreprise,
    depotReferentiels: creerDepotReferentielsMemoire(),
    depotAdmin,
    depotPaiement,
    // En mémoire : les tests n'ont pas de base, et la limitation partagée est
    // couverte par la vérification de fin de vague contre Postgres.
    creerLimiteur: fabriqueLimiteurMemoire,
    version: "0.1.0-test",
    demarreLe: Date.now(),
    production: false,
    racinePublic: null,
    ...surcharges,
  };

  return { dependances, pieces: { depotAuth, depotEntreprise, depotAdmin } };
}

/** Raccourci quand le test n'a pas besoin des pièces internes. */
export function dependancesTest(surcharges: SurchargesTest = {}): DependancesApp {
  return assemblerTest(surcharges).dependances;
}
