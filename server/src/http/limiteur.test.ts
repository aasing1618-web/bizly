import { describe, expect, it } from "vitest";
import { cleEmail, cleIp, creerLimiteur } from "./limiteur.js";

/** Horloge manuelle : un test ne doit jamais attendre une vraie fenêtre. */
function horlogeManuelle(depart = 1_000_000) {
  let instant = depart;
  return {
    maintenant: () => instant,
    avancer: (ms: number) => {
      instant += ms;
    },
  };
}

describe("limiteur de débit", () => {
  it("laisse passer jusqu'au maximum, puis bloque", () => {
    const limiteur = creerLimiteur({ maximum: 3, fenetreMs: 1000 });

    expect(limiteur.autoriser("a")).toBe(true);
    expect(limiteur.autoriser("a")).toBe(true);
    expect(limiteur.autoriser("a")).toBe(true);
    expect(limiteur.autoriser("a")).toBe(false);
  });

  it("compte chaque clé séparément", () => {
    const limiteur = creerLimiteur({ maximum: 1, fenetreMs: 1000 });

    expect(limiteur.autoriser("a")).toBe(true);
    expect(limiteur.autoriser("b")).toBe(true);
    expect(limiteur.autoriser("a")).toBe(false);
  });

  it("rouvre progressivement — fenêtre glissante, pas remise à zéro", () => {
    const horloge = horlogeManuelle();
    const limiteur = creerLimiteur({ maximum: 2, fenetreMs: 1000, horloge: horloge.maintenant });

    limiteur.autoriser("a");
    horloge.avancer(600);
    limiteur.autoriser("a");
    expect(limiteur.autoriser("a")).toBe(false);

    // La première tentative sort de la fenêtre : une place se libère, pas deux.
    horloge.avancer(500);
    expect(limiteur.autoriser("a")).toBe(true);
    expect(limiteur.autoriser("a")).toBe(false);
  });

  it("n'enregistre pas les tentatives refusées", () => {
    const horloge = horlogeManuelle();
    const limiteur = creerLimiteur({ maximum: 1, fenetreMs: 1000, horloge: horloge.maintenant });

    limiteur.autoriser("a");
    // Marteler pendant le blocage ne doit pas repousser indéfiniment la
    // réouverture, sinon un client bloqué le reste pour toujours.
    for (let i = 0; i < 20; i += 1) {
      horloge.avancer(10);
      expect(limiteur.autoriser("a")).toBe(false);
    }

    horloge.avancer(1000);
    expect(limiteur.autoriser("a")).toBe(true);
  });

  it("se réinitialise à la demande", () => {
    const limiteur = creerLimiteur({ maximum: 1, fenetreMs: 10_000 });

    limiteur.autoriser("a");
    expect(limiteur.autoriser("a")).toBe(false);

    limiteur.reinitialiser("a");
    expect(limiteur.autoriser("a")).toBe(true);
  });

  it("purge les clés périmées plutôt que de grossir sans fin", () => {
    const horloge = horlogeManuelle();
    const limiteur = creerLimiteur({ maximum: 5, fenetreMs: 1000, horloge: horloge.maintenant });

    for (let i = 0; i < 500; i += 1) limiteur.autoriser(`ip-${i}`);
    horloge.avancer(2000);
    limiteur.nettoyer();

    // Après purge, chaque clé repart de zéro : la mémoire ne fuit pas.
    expect(limiteur.autoriser("ip-0")).toBe(true);
  });
});

describe("clés de limitation", () => {
  it("préfixe pour qu'une IP ne collisionne jamais avec un e-mail", () => {
    expect(cleIp("1.2.3.4")).toBe("ip:1.2.3.4");
    expect(cleEmail("Awa@Exemple.FR")).toBe("email:awa@exemple.fr");
  });

  it("normalise l'e-mail, sinon la casse suffirait à contourner la limite", () => {
    expect(cleEmail("  AWA@EXEMPLE.FR ")).toBe(cleEmail("awa@exemple.fr"));
  });

  it("gère une IP absente sans planter", () => {
    expect(cleIp(undefined)).toBe("ip:inconnue");
  });
});
