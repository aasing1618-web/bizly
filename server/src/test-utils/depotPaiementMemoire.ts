import type { DepotPaiement, LigneAbonnement } from "../modules/paiement/depot.js";
import type { DepotMemoire } from "./depotMemoire.js";

export function creerDepotPaiementMemoire(auth?: DepotMemoire): DepotPaiement {
  const abonnements: LigneAbonnement[] = [];

  return {
    async creerAbonnement(d) {
      const abo: LigneAbonnement = {
        id: `abo-${abonnements.length + 1}`,
        entreprise_id: d.entrepriseId,
        plan: d.plan,
        cycle: d.cycle,
        montant: d.montant,
        devise: d.devise,
        moyen_paiement: d.moyenPaiement,
        reference_transaction: d.referenceTransaction,
        statut: "en_attente",
        cree_le: new Date().toISOString(),
        expire_le: null,
      };
      abonnements.push(abo);
      return abo;
    },

    async trouverAbonnementParRef(ref) {
      return abonnements.find((a) => a.reference_transaction === ref) ?? null;
    },

    async validerAbonnementEtActiverPlan(ref, dateExpiration) {
      const idx = abonnements.findIndex((a) => a.reference_transaction === ref);
      if (idx === -1) return null;

      const dateStr = dateExpiration.toISOString();
      const existant = abonnements[idx]!;
      const MAJ: LigneAbonnement = {
        ...existant,
        statut: "valide",
        expire_le: dateStr,
      };
      abonnements[idx] = MAJ;

      if (auth) {
        const concernes = auth
          .tousLesComptes()
          .filter((c) => c.entreprise.id === MAJ.entreprise_id);
        for (const compte of concernes) {
          compte.entreprise.plan = MAJ.plan;
          compte.entreprise.date_expiration_plan = dateStr;
        }
      }

      return MAJ;
    },

    async marquerEchec(ref) {
      const idx = abonnements.findIndex((a) => a.reference_transaction === ref);
      if (idx !== -1) {
        const existant = abonnements[idx]!;
        abonnements[idx] = {
          ...existant,
          statut: "echoue",
        };
      }
    },

    async lireAbonnementActif(entrepriseId) {
      const valides = abonnements
        .filter((a) => a.entreprise_id === entrepriseId && a.statut === "valide")
        .sort((a, b) => new Date(b.cree_le).getTime() - new Date(a.cree_le).getTime());
      return valides[0] ?? null;
    },
  };
}
