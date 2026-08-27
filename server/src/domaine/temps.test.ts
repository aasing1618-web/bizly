import { describe, expect, it } from "vitest";
import {
  DateInvalide,
  debutDeJourLocal,
  decalageMinutes,
  finDeJourLocal,
  fuseauValide,
  interpreterDateOperation,
  jourLocal,
} from "./temps.js";

/**
 * Le fuseau décide à quel jour — donc à quel mois — appartient une vente.
 * Une erreur ici fausse silencieusement tous les KPI, sans jamais lever
 * d'exception. D'où l'insistance sur les changements d'heure.
 */

describe("decalageMinutes", () => {
  it("suit l'heure d'été et l'heure d'hiver", () => {
    expect(decalageMinutes(new Date("2026-01-15T12:00:00Z"), "Europe/Paris")).toBe(60);
    expect(decalageMinutes(new Date("2026-07-15T12:00:00Z"), "Europe/Paris")).toBe(120);
  });

  it("gère les fuseaux sans changement d'heure", () => {
    // Abidjan est à UTC toute l'année : c'est le cas du franc CFA.
    expect(decalageMinutes(new Date("2026-01-15T12:00:00Z"), "Africa/Abidjan")).toBe(0);
    expect(decalageMinutes(new Date("2026-07-15T12:00:00Z"), "Africa/Abidjan")).toBe(0);
  });

  it("gère un décalage négatif et un décalage non entier en heures", () => {
    expect(decalageMinutes(new Date("2026-01-15T12:00:00Z"), "America/Montreal")).toBe(-300);
    expect(decalageMinutes(new Date("2026-01-15T12:00:00Z"), "Asia/Kolkata")).toBe(330);
  });
});

describe("debutDeJourLocal", () => {
  it("place minuit de Paris en hiver et en été", () => {
    expect(debutDeJourLocal("2026-01-15", "Europe/Paris").toISOString()).toBe(
      "2026-01-14T23:00:00.000Z",
    );
    expect(debutDeJourLocal("2026-07-15", "Europe/Paris").toISOString()).toBe(
      "2026-07-14T22:00:00.000Z",
    );
  });

  it("tombe juste le jour du passage à l'heure d'été", () => {
    // 29 mars 2026 : à 02:00 locales il devient 03:00. Minuit reste en +01:00.
    expect(debutDeJourLocal("2026-03-29", "Europe/Paris").toISOString()).toBe(
      "2026-03-28T23:00:00.000Z",
    );
  });

  it("tombe juste le jour du passage à l'heure d'hiver", () => {
    // 25 octobre 2026 : à 03:00 locales il redevient 02:00. Minuit est en +02:00.
    expect(debutDeJourLocal("2026-10-25", "Europe/Paris").toISOString()).toBe(
      "2026-10-24T22:00:00.000Z",
    );
  });

  it("refuse une date qui n'existe pas plutôt que de glisser au jour suivant", () => {
    // Date.UTC(2026, 1, 31) rend le 3 mars sans broncher : on enregistrerait
    // une vente à une date que l'utilisateur n'a jamais saisie.
    expect(() => debutDeJourLocal("2026-02-31", "Europe/Paris")).toThrow(DateInvalide);
    expect(() => debutDeJourLocal("2026-13-01", "Europe/Paris")).toThrow(DateInvalide);
    expect(() => debutDeJourLocal("2026-04-31", "Europe/Paris")).toThrow(DateInvalide);
  });

  it("accepte le 29 février d'une année bissextile", () => {
    expect(() => debutDeJourLocal("2028-02-29", "Europe/Paris")).not.toThrow();
    expect(() => debutDeJourLocal("2026-02-29", "Europe/Paris")).toThrow(DateInvalide);
  });

  it("refuse une forme qui n'est pas YYYY-MM-DD", () => {
    for (const mauvaise of ["15/05/2026", "2026-5-15", "", "hier", "2026-05-15T10:00:00Z"]) {
      expect(() => debutDeJourLocal(mauvaise, "Europe/Paris")).toThrow(DateInvalide);
    }
  });
});

describe("finDeJourLocal", () => {
  it("rend minuit du lendemain", () => {
    expect(finDeJourLocal("2026-07-15", "Europe/Paris").toISOString()).toBe(
      "2026-07-15T22:00:00.000Z",
    );
  });

  it("gère une journée de 23 heures", () => {
    const debut = debutDeJourLocal("2026-03-29", "Europe/Paris");
    const fin = finDeJourLocal("2026-03-29", "Europe/Paris");
    const heures = (fin.getTime() - debut.getTime()) / 3_600_000;

    // Ajouter 24 h en dur donnerait 24 : la journée du changement d'heure en
    // fait 23, et la vente de 23 h 30 basculerait au lendemain.
    expect(heures).toBe(23);
  });

  it("gère une journée de 25 heures", () => {
    const debut = debutDeJourLocal("2026-10-25", "Europe/Paris");
    const fin = finDeJourLocal("2026-10-25", "Europe/Paris");
    expect((fin.getTime() - debut.getTime()) / 3_600_000).toBe(25);
  });

  it("enjambe correctement une fin de mois et une fin d'année", () => {
    expect(finDeJourLocal("2026-01-31", "Europe/Paris").toISOString()).toBe(
      "2026-01-31T23:00:00.000Z",
    );
    expect(finDeJourLocal("2026-12-31", "Europe/Paris").toISOString()).toBe(
      "2026-12-31T23:00:00.000Z",
    );
  });
});

describe("jourLocal", () => {
  it("rattache une vente de fin de soirée au bon jour", () => {
    // Le cas E de docs/MOTEUR-ANALYTICS.md §8, vu depuis l'autre bout.
    expect(jourLocal(new Date("2026-05-31T22:30:00Z"), "Europe/Paris")).toBe("2026-06-01");
    expect(jourLocal(new Date("2026-05-31T21:30:00Z"), "Europe/Paris")).toBe("2026-05-31");
  });

  it("rend le même jour qu'UTC pour un fuseau à décalage nul", () => {
    expect(jourLocal(new Date("2026-05-31T22:30:00Z"), "Africa/Abidjan")).toBe("2026-05-31");
  });

  it("fait l'aller-retour avec debutDeJourLocal", () => {
    for (const date of ["2026-01-01", "2026-03-29", "2026-07-15", "2026-10-25", "2026-12-31"]) {
      expect(jourLocal(debutDeJourLocal(date, "Europe/Paris"), "Europe/Paris")).toBe(date);
    }
  });
});

describe("interpreterDateOperation", () => {
  it("interprète une date nue comme minuit local", () => {
    expect(interpreterDateOperation("2026-05-15", "Europe/Paris").toISOString()).toBe(
      "2026-05-14T22:00:00.000Z",
    );
  });

  it("laisse un instant ISO tel quel", () => {
    expect(interpreterDateOperation("2026-05-15T14:30:00.000Z", "Europe/Paris").toISOString()).toBe(
      "2026-05-15T14:30:00.000Z",
    );
  });

  it("donne le même jour local dans les deux formes", () => {
    const parDate = interpreterDateOperation("2026-05-15", "Europe/Paris");
    const parInstant = interpreterDateOperation("2026-05-15T14:30:00.000Z", "Europe/Paris");

    expect(jourLocal(parDate, "Europe/Paris")).toBe(jourLocal(parInstant, "Europe/Paris"));
  });

  it("refuse ce qui n'est pas une date", () => {
    for (const mauvaise of ["", "   ", "demain", "2026-99-99", "n'importe quoi"]) {
      expect(() => interpreterDateOperation(mauvaise, "Europe/Paris")).toThrow(DateInvalide);
    }
  });
});

describe("fuseauValide", () => {
  it("reconnaît les fuseaux réels", () => {
    for (const fuseau of ["Europe/Paris", "Africa/Abidjan", "UTC", "America/Montreal"]) {
      expect(fuseauValide(fuseau)).toBe(true);
    }
  });

  it("rejette les inventions", () => {
    for (const fuseau of ["Europe/Atlantide", "", "Paris", "GMT+25"]) {
      expect(fuseauValide(fuseau)).toBe(false);
    }
  });
});
