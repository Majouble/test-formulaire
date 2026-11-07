/* =====================================================================
   PRISME — règles métier : tableaux de bord (clé « tableau_de_bord » de Config)
   ---------------------------------------------------------------------
   Plusieurs tableaux de bord (ex. MEN et MESRE) : { tableaux: [{ id, nom, table, brouillon, publie, publie_le, modifie_le }] }.
   Ancienne forme (un seul) : { brouillon, publie, publie_le, modifie_le } → premier tableau, id « principal ».
   Chargé par chaque page, après commun/socle.js.

   Définit (sur window.Socle) : tableauxDeBord, valeurTableauxDeBord.
   Utilise (window.Socle) : DEFAUTS_GENERAL.
   ===================================================================== */
(function () {
  "use strict";

  const { DEFAUTS_GENERAL } = window.Socle;

  function tableauxDeBord(valeur, general) {
    const reglages = valeur || {},
      reglagesGeneraux = general || DEFAUTS_GENERAL;
    if (Array.isArray(reglages.tableaux))
      return reglages.tableaux.map((tableau) => ({ ...tableau, table: tableau.table || reglagesGeneraux.reponses }));
    if (!reglages.brouillon && !reglages.publie) return [];
    const contenu = reglages.brouillon || reglages.publie;
    return [
      {
        id: "principal",
        nom: (contenu && contenu.name) || "Tableau de bord",
        table: reglagesGeneraux.reponses,
        brouillon: reglages.brouillon || null,
        publie: reglages.publie || null,
        publie_le: reglages.publie_le || null,
        modifie_le: reglages.modifie_le || null,
      },
    ];
  }
  // valeur à enregistrer ; le premier tableau reste aussi en tête (publie, brouillon) pour les pages d'avant la v2.0.0-alpha.29
  function valeurTableauxDeBord(liste) {
    const premier = liste[0] || {};
    return {
      tableaux: liste,
      brouillon: premier.brouillon || null,
      publie: premier.publie || null,
      publie_le: premier.publie_le || null,
    };
  }

  Object.assign(window.Socle, {
    tableauxDeBord,
    valeurTableauxDeBord,
  });
})();
