/* PRISME — tableau de bord, module 07/15 : Configuration du tableau de bord : lecture, enregistrement, atelier.
   État posé sur tableauDeBord : config, editing, configLoaded, selId, ongletSt, fenetre, uid, saveTimer, tableState.
   Publie sur tableauDeBord : defaultConfig, saveConfig, readCfgTable, studio, newId, CFG_TABLE, dashName.
   Utilise (tableauDeBord.) : columns, contexte, isDate, isNumCol, labelOf, racine, showMsg.
   tableauDeBord et l'ordre des modules : voir tableau-de-bord/tableau.js. */

TableauDeBord.modules["configuration"] = function (tableauDeBord) {
  // fonctions de ce module utilisées ailleurs : disponibles dès maintenant (déclarations remontées)
  Object.assign(tableauDeBord, { defaultConfig, saveConfig, readCfgTable });
  // =============================================================================
  // Configuration (enregistrée avec le widget)
  // =============================================================================
  tableauDeBord.config = { filters: [], blocks: [] };
  tableauDeBord.editing = tableauDeBord.contexte.mode === "edition";
  tableauDeBord.configLoaded = false;
  // Atelier (administration, CTX.atelier) : tableau de bord tel que le lecteur le verra au centre, réglages du bloc choisi
  // dans un panneau à droite (onglets Données, Présentation, Détail), fenêtres pour l'ajout d'un bloc et les réglages du tableau.
  const studio = () => tableauDeBord.contexte.mode === "edition" && !!tableauDeBord.contexte.atelier;
  tableauDeBord.selId = null;
  tableauDeBord.ongletSt = "donnees";
  tableauDeBord.fenetre = null; // bloc choisi, onglet du panneau, fenêtre ouverte (« ajouter » | « reglages »)
  tableauDeBord.uid = 1;
  const newId = () => "b" + Date.now().toString(36) + tableauDeBord.uid++;

  function defaultConfig() {
    const cfg = {
      filters: [],
      blocks: [{ id: newId(), type: "tile", title: "Nombre de lignes", measure: { agg: "count" }, conds: [] }],
    };
    const cat =
      tableauDeBord.columns.find((c) => /^Choice/.test(c.type)) ||
      tableauDeBord.columns.find((c) => !tableauDeBord.isDate(c.id) && !tableauDeBord.isNumCol(c.id));
    if (cat)
      cfg.blocks.push({
        id: newId(),
        type: "cross",
        title: `Répartition par ${tableauDeBord.labelOf(cat.id)}`,
        measure: { agg: "count" },
        rows: { col: cat.id, grain: "jour" },
        cols: { col: "", grain: "jour" },
        conds: [],
        view: "both",
        sort: "value",
        top: 20,
      });
    return cfg;
  }

  tableauDeBord.saveTimer = null;
  function saveConfig() {
    clearTimeout(tableauDeBord.saveTimer);
    if (!tableauDeBord.racine.isConnected) return;
    tableauDeBord.saveTimer = setTimeout(async () => {
      try {
        if (tableauDeBord.contexte.enregistrer) await tableauDeBord.contexte.enregistrer(tableauDeBord.config);
      } catch (e) {
        tableauDeBord.showMsg("warn", "Configuration non enregistrée : " + (e && e.message ? e.message : e));
      }
    }, 600);
  }

  // -----------------------------------------------------------------------------
  // Ancienne copie de sécurité de la configuration (table Config_tableau_de_bord, avant la v2) :
  // elle n'est plus écrite (la configuration est dans Config, clé tableau_de_bord) mais reste lue
  // pour reprendre un ancien tableau de bord.
  // -----------------------------------------------------------------------------
  const CFG_TABLE = "Config_tableau_de_bord";
  const dashName = () => (tableauDeBord.config.name || "Tableau de bord").trim() || "Tableau de bord";
  tableauDeBord.tableState = "Config, clé tableau_de_bord"; // « inconnue », « absente », « à jour », « erreur »

  async function readCfgTable() {
    try {
      return await Donnees.lire(CFG_TABLE);
    } catch (e) {
      return null;
    } // la table n'existe pas encore
  }
  // constantes de ce module utilisées ailleurs
  Object.assign(tableauDeBord, { studio, newId, CFG_TABLE, dashName });
};
