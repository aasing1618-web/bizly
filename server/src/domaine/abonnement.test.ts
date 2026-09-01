import { describe, expect, it } from "vitest";
import { evaluerAcces, prolongerAbonnement } from "./abonnement.js";

/**
 * Cas de référence de la règle d'accès.
 *
 * Chaque cas est daté à la main : c'est la seule façon de vérifier une règle de
 * temps sans attendre deux mois. `MAINTENANT` est arbitraire mais fixe.
 */

const MAINTENANT = new Date("2026-09-01T12:00:00.000Z");
const jours = (n: number) => new Date(MAINTENANT.getTime() + n * 24 * 60 * 60 * 1000);

describe("evaluerAcces", () => {
  it("laisse entrer pendant l'essai et annonce les jours restants", () => {
    const etat = evaluerAcces(
      { exempt: false, essaiExpireLe: jours(30), abonnementExpireLe: null },
      MAINTENANT,
    );

    expect(etat.bloque).toBe(false);
    expect(etat.motif).toBe("ESSAI");
    expect(etat.jours_restants).toBe(30);
  });

  it("bloque quand l'essai est terminé et qu'aucun paiement n'a jamais eu lieu", () => {
    const etat = evaluerAcces(
      { exempt: false, essaiExpireLe: jours(-1), abonnementExpireLe: null },
      MAINTENANT,
    );

    expect(etat.bloque).toBe(true);
    expect(etat.motif).toBe("ESSAI_EXPIRE");
    expect(etat.jours_restants).toBe(0);
  });

  it("distingue un abonnement échu d'un essai jamais payé", () => {
    const etat = evaluerAcces(
      { exempt: false, essaiExpireLe: jours(-40), abonnementExpireLe: jours(-2) },
      MAINTENANT,
    );

    expect(etat.bloque).toBe(true);
    expect(etat.motif).toBe("ABONNEMENT_EXPIRE");
  });

  it("laisse entrer un abonné dont l'essai est terminé depuis longtemps", () => {
    const etat = evaluerAcces(
      { exempt: false, essaiExpireLe: jours(-100), abonnementExpireLe: jours(12) },
      MAINTENANT,
    );

    expect(etat.bloque).toBe(false);
    expect(etat.motif).toBe("ABONNE");
    expect(etat.jours_restants).toBe(12);
  });

  it("n'oppose jamais de blocage à un compte exempté, même sans aucune date", () => {
    const etat = evaluerAcces(
      { exempt: true, essaiExpireLe: jours(-500), abonnementExpireLe: jours(-500) },
      MAINTENANT,
    );

    expect(etat.bloque).toBe(false);
    expect(etat.motif).toBe("EXEMPT");
    expect(etat.jours_restants).toBeNull();
  });

  it("bloque une entreprise sans aucune date d'essai plutôt que de l'ouvrir", () => {
    // Ne devrait pas exister — la base pose un défaut. Mais si la colonne est
    // nulle, le comportement sûr est le blocage, pas l'accès illimité.
    const etat = evaluerAcces(
      { exempt: false, essaiExpireLe: null, abonnementExpireLe: null },
      MAINTENANT,
    );

    expect(etat.bloque).toBe(true);
    expect(etat.motif).toBe("ESSAI_EXPIRE");
  });

  it("compte encore un jour à quelques heures de l'échéance", () => {
    const dansOnzeHeures = new Date(MAINTENANT.getTime() + 11 * 60 * 60 * 1000);
    const etat = evaluerAcces(
      { exempt: false, essaiExpireLe: dansOnzeHeures, abonnementExpireLe: null },
      MAINTENANT,
    );

    expect(etat.bloque).toBe(false);
    expect(etat.jours_restants).toBe(1);
  });

  it("bloque à la seconde exacte de l'échéance, pas une seconde après", () => {
    const etat = evaluerAcces(
      { exempt: false, essaiExpireLe: MAINTENANT, abonnementExpireLe: null },
      MAINTENANT,
    );

    expect(etat.bloque).toBe(true);
  });

  it("expose les deux dates telles quelles, pour que l'interface n'ait rien à deviner", () => {
    const fin = jours(5);
    const etat = evaluerAcces(
      { exempt: false, essaiExpireLe: fin, abonnementExpireLe: null },
      MAINTENANT,
    );

    expect(etat.essai_expire_le).toBe(fin.toISOString());
    expect(etat.abonnement_expire_le).toBeNull();
  });
});

describe("prolongerAbonnement", () => {
  it("part de maintenant quand rien n'est en cours", () => {
    const fin = prolongerAbonnement(null, MAINTENANT, 30);
    expect(fin.toISOString()).toBe(jours(30).toISOString());
  });

  it("ne fait pas perdre les jours payés d'avance", () => {
    // Il reste 10 jours, il repaie : il doit obtenir 40 jours, pas 30.
    const fin = prolongerAbonnement(jours(10), MAINTENANT, 30);
    expect(fin.toISOString()).toBe(jours(40).toISOString());
  });

  it("repart de maintenant après une expiration, sans facturer le temps bloqué", () => {
    const fin = prolongerAbonnement(jours(-15), MAINTENANT, 30);
    expect(fin.toISOString()).toBe(jours(30).toISOString());
  });
});
