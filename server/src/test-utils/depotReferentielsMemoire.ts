import type { DepotReferentiels } from "../modules/referentiels/depot.js";

/**
 * Référentiels en mémoire — **usage tests uniquement**.
 *
 * Reprend les devises que `depotMemoire` accepte, pour que les deux ne se
 * contredisent pas : proposer ici une devise que l'inscription refuse ensuite
 * serait précisément le bug que ces tests doivent attraper.
 */
export function creerDepotReferentielsMemoire(): DepotReferentiels {
  return {
    async lister() {
      return {
        devises: [
          { code: "EUR", libelle: "Euro", symbole: "€", decimales: 2 },
          { code: "USD", libelle: "Dollar américain", symbole: "$", decimales: 2 },
          { code: "XAF", libelle: "Franc CFA (BEAC)", symbole: "FCFA", decimales: 0 },
          { code: "XOF", libelle: "Franc CFA (BCEAO)", symbole: "FCFA", decimales: 0 },
          { code: "TND", libelle: "Dinar tunisien", symbole: "DT", decimales: 3 },
        ],
        secteurs: [
          { code: "commerce_detail", libelle: "Commerce de détail" },
          { code: "restauration", libelle: "Restauration, café, bar" },
          { code: "services_pro", libelle: "Services professionnels et conseil" },
          { code: "artisanat_btp", libelle: "Artisanat et BTP" },
          { code: "beaute_bienetre", libelle: "Beauté et bien-être" },
          { code: "sante", libelle: "Santé et paramédical" },
          { code: "transport_logistique", libelle: "Transport et logistique" },
          { code: "education_formation", libelle: "Éducation et formation" },
          { code: "autre", libelle: "Autre activité" },
        ],
      };
    },
  };
}
