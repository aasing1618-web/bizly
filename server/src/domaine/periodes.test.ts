import { describe, expect, it } from "vitest";
import {
  ajouterJoursLocal,
  construireComparaison,
  construirePeriode,
  joursDe,
  joursEntre,
  jourDeSemaine,
  PeriodeInvalide,
} from "./periodes.js";

const PARIS = "Europe/Paris";

/** Instant correspondant à une heure locale parisienne, pour lire les tests. */
function aParis(iso: string): Date {
  return new Date(iso);
}

describe("arithmétique de jours locaux", () => {
  it("ajoute et retire des jours", () => {
    expect(ajouterJoursLocal("2026-05-15", 1, PARIS)).toBe("2026-05-16");
    expect(ajouterJoursLocal("2026-05-15", -1, PARIS)).toBe("2026-05-14");
    expect(ajouterJoursLocal("2026-05-31", 1, PARIS)).toBe("2026-06-01");
    expect(ajouterJoursLocal("2026-01-01", -1, PARIS)).toBe("2025-12-31");
  });

  it("enjambe un changement d'heure sans décaler", () => {
    // Le 29 mars la journée fait 23 h : « minuit + 24 h » tomberait à côté.
    expect(ajouterJoursLocal("2026-03-28", 1, PARIS)).toBe("2026-03-29");
    expect(ajouterJoursLocal("2026-03-29", 1, PARIS)).toBe("2026-03-30");
    // Le 25 octobre elle fait 25 h.
    expect(ajouterJoursLocal("2026-10-24", 1, PARIS)).toBe("2026-10-25");
    expect(ajouterJoursLocal("2026-10-25", 1, PARIS)).toBe("2026-10-26");
  });

  it("compte les jours en incluant les deux bornes", () => {
    expect(joursEntre("2026-05-01", "2026-05-01", PARIS)).toBe(1);
    expect(joursEntre("2026-05-01", "2026-05-31", PARIS)).toBe(31);
    expect(joursEntre("2026-02-01", "2026-02-28", PARIS)).toBe(28);
    // Le mois qui contient les deux changements d'heure.
    expect(joursEntre("2026-03-01", "2026-03-31", PARIS)).toBe(31);
    expect(joursEntre("2026-10-01", "2026-10-31", PARIS)).toBe(31);
  });

  it("rend le jour de la semaine en convention ISO", () => {
    expect(jourDeSemaine("2026-05-11", PARIS)).toBe(1); // lundi
    expect(jourDeSemaine("2026-05-17", PARIS)).toBe(7); // dimanche
  });
});

describe("construirePeriode", () => {
  const maintenant = aParis("2026-05-08T10:00:00Z");

  it("borne un mois TERMINÉ du 1er au dernier jour", () => {
    const enJuin = aParis("2026-06-20T10:00:00Z");
    const periode = construirePeriode({ cle: "mois", reference: "2026-05-15" }, PARIS, enJuin);

    expect(periode.debut_local).toBe("2026-05-01");
    expect(periode.fin_local).toBe("2026-05-31");
    expect(periode.debut.toISOString()).toBe("2026-04-30T22:00:00.000Z");
    // Borne haute EXCLUE : minuit du 1er juin.
    expect(periode.fin.toISOString()).toBe("2026-05-31T22:00:00.000Z");
  });

  it("arrête un mois EN COURS à aujourd'hui — le mois à date", () => {
    // Spécification métier §2 : « Mois = [1er du mois en cours ; aujourd'hui] ».
    // Aller jusqu'au 31 traînerait des jours futurs à zéro dans la série et
    // afficherait « du 1er au 31 mai » un 8 mai.
    const periode = construirePeriode({ cle: "mois" }, PARIS, maintenant);

    expect(periode.debut_local).toBe("2026-05-01");
    expect(periode.fin_local).toBe("2026-05-08");
    expect(periode.en_cours).toBe(true);
  });

  it("ne tronque JAMAIS une période personnalisée", () => {
    // L'utilisateur a choisi ses bornes : on ne les corrige pas dans son dos.
    const periode = construirePeriode(
      { cle: "personnalisee", du: "2026-05-01", au: "2026-05-31" },
      PARIS,
      maintenant,
    );

    expect(periode.fin_local).toBe("2026-05-31");
    expect(periode.en_cours).toBe(true);
  });

  it("fait commencer la semaine un lundi", () => {
    // Le 15 mai 2026 est un vendredi.
    const periode = construirePeriode({ cle: "semaine", reference: "2026-05-15" }, PARIS, maintenant);

    expect(periode.debut_local).toBe("2026-05-11");
    expect(periode.fin_local).toBe("2026-05-17");
  });

  it("borne un trimestre et une année terminés", () => {
    const en2027 = aParis("2027-03-01T10:00:00Z");
    const trimestre = construirePeriode({ cle: "trimestre", reference: "2026-05-15" }, PARIS, en2027);
    expect(trimestre.debut_local).toBe("2026-04-01");
    expect(trimestre.fin_local).toBe("2026-06-30");

    const annee = construirePeriode({ cle: "annee", reference: "2026-05-15" }, PARIS, en2027);
    expect(annee.debut_local).toBe("2026-01-01");
    expect(annee.fin_local).toBe("2026-12-31");
  });

  it("arrête à aujourd'hui un trimestre et une année en cours", () => {
    const trimestre = construirePeriode({ cle: "trimestre" }, PARIS, maintenant);
    expect(trimestre.debut_local).toBe("2026-04-01");
    expect(trimestre.fin_local).toBe("2026-05-08");

    const annee = construirePeriode({ cle: "annee" }, PARIS, maintenant);
    expect(annee.debut_local).toBe("2026-01-01");
    expect(annee.fin_local).toBe("2026-05-08");
  });

  it("traite un mois de février bissextile", () => {
    const periode = construirePeriode({ cle: "mois", reference: "2028-02-10" }, PARIS, maintenant);
    expect(periode.fin_local).toBe("2028-02-29");
  });

  it("applique la règle ANCRÉE de la spécification métier §2", () => {
    // Le 8 août, « ce mois » vaut 1–8 août, comparé au 1–8 JUILLET — les mêmes
    // premiers jours du mois précédent, pas les huit derniers jours de juillet.
    const le8aout = aParis("2026-08-08T10:00:00Z");
    const periode = construirePeriode({ cle: "mois" }, PARIS, le8aout);
    const comparaison = construireComparaison(periode, le8aout);

    expect(periode.debut_local).toBe("2026-08-01");
    expect(periode.fin_local).toBe("2026-08-08");
    expect(comparaison.debut_local).toBe("2026-07-01");
    expect(comparaison.fin_local).toBe("2026-07-08");
  });

  it("prend une période personnalisée bornes incluses", () => {
    const periode = construirePeriode(
      { cle: "personnalisee", du: "2026-05-03", au: "2026-05-09" },
      PARIS,
      maintenant,
    );

    expect(periode.debut_local).toBe("2026-05-03");
    expect(periode.fin_local).toBe("2026-05-09");
    // Le 9 est inclus : la borne exclue est minuit du 10.
    expect(periode.fin.toISOString()).toBe("2026-05-09T22:00:00.000Z");
  });

  it("sait si la période est en cours", () => {
    expect(construirePeriode({ cle: "mois", reference: "2026-05-15" }, PARIS, maintenant).en_cours).toBe(true);
    expect(construirePeriode({ cle: "mois", reference: "2026-04-15" }, PARIS, maintenant).en_cours).toBe(false);
  });

  it("refuse une période personnalisée incomplète ou à l'envers", () => {
    expect(() => construirePeriode({ cle: "personnalisee", du: "2026-05-01" }, PARIS, maintenant))
      .toThrow(PeriodeInvalide);
    expect(() =>
      construirePeriode({ cle: "personnalisee", du: "2026-05-10", au: "2026-05-01" }, PARIS, maintenant),
    ).toThrow(PeriodeInvalide);
  });

  it("refuse une période démesurée", () => {
    expect(() =>
      construirePeriode({ cle: "personnalisee", du: "2000-01-01", au: "2026-01-01" }, PARIS, maintenant),
    ).toThrow(PeriodeInvalide);
  });
});

describe("construireComparaison", () => {
  it("compare un mois terminé au mois calendaire précédent, entier", () => {
    const maintenant = aParis("2026-06-15T10:00:00Z");
    const periode = construirePeriode({ cle: "mois", reference: "2026-05-15" }, PARIS, maintenant);
    const comparaison = construireComparaison(periode, maintenant);

    expect(comparaison.debut_local).toBe("2026-04-01");
    expect(comparaison.fin_local).toBe("2026-04-30");
    expect(comparaison.a_date).toBe(false);
  });

  it("compare À DATE un mois en cours", () => {
    // Le 8 mai : « ce mois » vaut 8 jours. On le compare au 1–8 avril, pas au
    // mois entier — sinon l'écran afficherait mécaniquement −74 %.
    const maintenant = aParis("2026-05-08T10:00:00Z");
    const periode = construirePeriode({ cle: "mois" }, PARIS, maintenant);
    const comparaison = construireComparaison(periode, maintenant);

    expect(comparaison.debut_local).toBe("2026-04-01");
    expect(comparaison.fin_local).toBe("2026-04-08");
    expect(comparaison.a_date).toBe(true);
  });

  it("ne déborde pas quand le mois précédent est plus court", () => {
    // 31 mars en cours : 31 jours écoulés, février n'en a que 28. La fenêtre
    // doit s'arrêter au 28 février, sans mordre sur janvier.
    const maintenant = aParis("2026-03-31T10:00:00Z");
    const periode = construirePeriode({ cle: "mois" }, PARIS, maintenant);
    const comparaison = construireComparaison(periode, maintenant);

    expect(comparaison.debut_local).toBe("2026-02-01");
    expect(comparaison.fin_local).toBe("2026-02-28");
    expect(comparaison.a_date).toBe(false);
  });

  it("compare une semaine à la précédente", () => {
    const maintenant = aParis("2026-05-20T10:00:00Z");
    const periode = construirePeriode({ cle: "semaine", reference: "2026-05-11" }, PARIS, maintenant);
    const comparaison = construireComparaison(periode, maintenant);

    expect(comparaison.debut_local).toBe("2026-05-04");
    expect(comparaison.fin_local).toBe("2026-05-10");
  });

  it("recule d'un an sur un mois de janvier", () => {
    const maintenant = aParis("2026-03-01T10:00:00Z");
    const periode = construirePeriode({ cle: "mois", reference: "2026-01-15" }, PARIS, maintenant);
    const comparaison = construireComparaison(periode, maintenant);

    expect(comparaison.debut_local).toBe("2025-12-01");
    expect(comparaison.fin_local).toBe("2025-12-31");
  });

  it("compare une période personnalisée aux N jours qui la précèdent", () => {
    const maintenant = aParis("2026-06-01T10:00:00Z");
    const periode = construirePeriode(
      { cle: "personnalisee", du: "2026-05-10", au: "2026-05-16" },
      PARIS,
      maintenant,
    );
    const comparaison = construireComparaison(periode, maintenant);

    expect(comparaison.debut_local).toBe("2026-05-03");
    expect(comparaison.fin_local).toBe("2026-05-09");
  });
});

describe("joursDe", () => {
  it("énumère tous les jours, bornes comprises", () => {
    const maintenant = aParis("2026-06-15T10:00:00Z");
    const periode = construirePeriode({ cle: "mois", reference: "2026-05-15" }, PARIS, maintenant);
    const jours = joursDe(periode);

    expect(jours).toHaveLength(31);
    expect(jours[0]).toBe("2026-05-01");
    expect(jours[30]).toBe("2026-05-31");
  });

  it("n'oublie aucun jour au mois des changements d'heure", () => {
    const maintenant = aParis("2026-04-15T10:00:00Z");
    const mars = construirePeriode({ cle: "mois", reference: "2026-03-15" }, PARIS, maintenant);
    expect(joursDe(mars)).toHaveLength(31);

    const octobre = construirePeriode({ cle: "mois", reference: "2026-10-15" }, PARIS, maintenant);
    expect(joursDe(octobre)).toHaveLength(31);
  });

  it("s'arrête à aujourd'hui pour une période en cours", () => {
    const maintenant = aParis("2026-05-08T10:00:00Z");
    const periode = construirePeriode({ cle: "mois" }, PARIS, maintenant);
    expect(joursDe(periode)).toHaveLength(8);
  });

  it("rend un seul jour pour une période d'un jour", () => {
    const maintenant = aParis("2026-05-15T10:00:00Z");
    const jour = construirePeriode({ cle: "jour", reference: "2026-05-15" }, PARIS, maintenant);
    expect(joursDe(jour)).toEqual(["2026-05-15"]);
  });
});
