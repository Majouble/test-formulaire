/* =====================================================================
   PRISME — règles métier : point de situation
   ---------------------------------------------------------------------
   Réglages techniques du point de situation (table et colonnes) déduits des colonnes associées du document.
   Chargé par chaque page, après commun/socle.js.

   Définit (sur window.Socle) : reglagesPointParDefaut.
   Utilise (window.Socle) : associerColonnes, general, lireMeta, TABLE_CONFIG.
   ===================================================================== */
(function () {
  "use strict";

  const { associerColonnes, general, lireMeta, TABLE_CONFIG } = window.Socle;

  // Réglages techniques du point de situation déduits du socle (table et colonnes) : valeurs par défaut,
  // que la configuration publiée peut remplacer
  async function reglagesPointParDefaut(meta, config) {
    meta = meta || (await lireMeta());
    const reglagesGeneraux = general(config),
      associationsEnregistrees = (config && config.valeurs && config.valeurs.roles) || {};
    const contexte = { reponses: reglagesGeneraux.reponses, referentiel: reglagesGeneraux.referentiel };
    const associationsReponses = associerColonnes(
      "reponses",
      meta[reglagesGeneraux.reponses],
      contexte,
      associationsEnregistrees.reponses || {},
      {},
    );
    const associationsReferentiel = associerColonnes(
      "referentiel",
      meta[reglagesGeneraux.referentiel],
      contexte,
      associationsEnregistrees.referentiel || {},
      {},
    );
    const colonneDe = (associations, role, parDefaut) => (associations[role] && associations[role].col) || parDefaut;
    const colonneEtablissement = colonneDe(associationsReponses, "Etablissement", "Etablissement");
    return {
      table: reglagesGeneraux.reponses,
      dossier: colonneDe(associationsReponses, "Dossier", "Dossier"),
      date: colonneDe(associationsReponses, "Cree_le", "Cree_le"),
      dateFaits: colonneDe(associationsReponses, "Date_faits", ""),
      nature: colonneDe(associationsReponses, "Nature", ""),
      champAcademie: `${colonneEtablissement}.${colonneDe(associationsReferentiel, "Academie", "Academie")}`,
      modeleTable: TABLE_CONFIG,
      modeleColonne: "Fichier",
    };
  }

  Object.assign(window.Socle, {
    reglagesPointParDefaut,
  });
})();
