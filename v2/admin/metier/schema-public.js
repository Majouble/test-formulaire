/* =====================================================================
   PRISME — règles métier : schéma public (accès par lien)
   ---------------------------------------------------------------------
   Une personne ouverte par un lien d'établissement ne peut pas lire les métadonnées de Grist (_grist_Tables_column…) :
   le widget de saisie lit alors une copie des colonnes utiles, rangée dans la clé « schema » de Config (lisible par les
   établissements). La copie est rafraîchie à la publication d'un formulaire, à l'ouverture de l'onglet Établissements
   et à l'application des règles d'accès.
   Chargé par la page d'administration seulement, après commun/socle.js et commun/metier/.

   Définit (sur window.Socle) : instantaneSchema, majSchemaPublic.
   Utilise (window.Socle) : ecrireConfig, lireConfig.
   Utilise aussi : Donnees (lecture et écriture du document).
   ===================================================================== */
(function () {
  "use strict";

  const { ecrireConfig, lireConfig } = window.Socle;

  async function instantaneSchema(tables) {
    const [tablesGrist, colonnesGrist] = await Promise.all([
      Donnees.lire("_grist_Tables"),
      Donnees.lire("_grist_Tables_column"),
    ]);
    const schema = {};
    for (const tableId of [...new Set(tables)].filter(Boolean).sort()) {
      const idTable = tablesGrist.id[tablesGrist.tableId.indexOf(tableId)];
      if (idTable == null) continue;
      schema[tableId] = colonnesGrist.id
        .map((_, i) => i)
        .filter(
          (i) =>
            colonnesGrist.parentId[i] === idTable &&
            colonnesGrist.colId[i] !== "manualSort" &&
            !String(colonnesGrist.colId[i]).startsWith("gristHelper"),
        )
        .sort((a, b) => ((colonnesGrist.parentPos || [])[a] || 0) - ((colonnesGrist.parentPos || [])[b] || 0))
        .map((i) => {
          const colonneAffichee = (colonnesGrist.visibleCol || [])[i],
            positionAffichee = colonneAffichee ? colonnesGrist.id.indexOf(colonneAffichee) : -1;
          return {
            colId: colonnesGrist.colId[i],
            label: colonnesGrist.label[i] || "",
            type: colonnesGrist.type[i] || "Any",
            widgetOptions: colonnesGrist.widgetOptions[i] || "",
            isFormula: !!colonnesGrist.isFormula[i],
            formula: colonnesGrist.formula[i] || "",
            description: (colonnesGrist.description || [])[i] || "",
            visibleCol: positionAffichee >= 0 ? colonnesGrist.colId[positionAffichee] : "",
          };
        });
    }
    return schema;
  }
  // Écrit la copie si elle a changé ; renvoie true si écrite. Sans droit d'écriture : silencieux.
  async function majSchemaPublic(tables) {
    try {
      const config = await lireConfig(),
        schema = await instantaneSchema(tables);
      const avant = config && config.valeurs.schema && config.valeurs.schema.tables;
      if (JSON.stringify(avant || null) === JSON.stringify(schema)) return false;
      await ecrireConfig("schema", { tables: schema, maj: new Date().toISOString() });
      return true;
    } catch (_) {
      return false;
    }
  }

  Object.assign(window.Socle, {
    instantaneSchema,
    majSchemaPublic,
  });
})();
