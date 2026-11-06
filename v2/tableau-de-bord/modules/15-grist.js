/* PRISME — tableau de bord, module 15/15 : Branchement Grist : structure du document, colonnes, démarrage.
   Utilise (tableauDeBord.) : accessLevel, colLabels, colTypes, columnIds, columns, config, configLoaded, contexte,
     defaultConfig, diagError, diagSource, docMeta, kindCache, labelOf, mainTable, records, refCache, render,
     saveConfig, typeOf.
   tableauDeBord et l'ordre des modules : voir tableau-de-bord/tableau.js. */

TableauDeBord.modules["grist"] = function (tableauDeBord) {
  const { $ } = Outils;
  // =============================================================================
  // Branchement Grist
  // =============================================================================
  async function loadMeta() {
    try {
      const tableId = tableauDeBord.contexte.table;
      if (!tableId || !grist.docApi) return null;
      const T = await Donnees.lire("_grist_Tables");
      const ref = T.id[T.tableId.indexOf(tableId)];
      const C = await Donnees.lire("_grist_Tables_column");
      tableauDeBord.docMeta = { T, C };
      tableauDeBord.mainTable = tableId;
      const types = {},
        labels = {},
        order = [];
      C.id.forEach((_, i) => {
        if (C.parentId[i] !== ref) return;
        const id = C.colId[i];
        if (id === "manualSort" || id.startsWith("gristHelper_")) return;
        types[id] = C.type[i];
        labels[id] = (C.label && C.label[i]) || id;
        order.push(id);
      });
      tableauDeBord.colTypes = types;
      tableauDeBord.colLabels = labels;
      return { tableId, order };
    } catch (e) {
      tableauDeBord.diagError = e && e.message ? e.message : String(e);
      return null;
    }
  }

  function buildColumns(order) {
    const seen = new Set(),
      ids = [];
    (order || []).forEach((id) => {
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    });
    tableauDeBord.records.forEach((r) =>
      Object.keys(r).forEach((k) => {
        if (k !== "id" && k !== "manualSort" && !k.startsWith("gristHelper_") && !seen.has(k)) {
          seen.add(k);
          ids.push(k);
        }
      }),
    );
    // on ne garde que les colonnes présentes dans les lignes reçues
    const present = new Set();
    tableauDeBord.records.forEach((r) => Object.keys(r).forEach((k) => present.add(k)));
    tableauDeBord.columns = ids
      .filter((id) => present.has(id) || !tableauDeBord.records.length)
      .map((id) => ({ id, label: tableauDeBord.labelOf(id), type: tableauDeBord.typeOf(id) }));
    tableauDeBord.columnIds = new Set(tableauDeBord.columns.map((c) => c.id));
  }

  // ---------- Démarrage (v2) : la page hôte fournit les lignes et la configuration ----------
  // Ce module, construit en dernier, démarre le tableau : il s'abonne aux lignes envoyées par la page hôte.
  tableauDeBord.accessLevel = "full";
  tableauDeBord.contexte.abonner(async (rows) => {
    try {
      await recevoir(rows);
    } catch (e) {
      // erreur visible plutôt qu'une attente sans fin
      console.error(e);
      const src = $("source");
      if (src) src.textContent = `Erreur d'affichage : ${e && e.message ? e.message : e}`;
    }
  });
  async function recevoir(rows) {
    tableauDeBord.records = rows || [];
    const meta = await loadMeta();
    tableauDeBord.diagSource =
      tableauDeBord.contexte.mode === "edition" ? "table " + tableauDeBord.contexte.table : "widget";
    tableauDeBord.kindCache = new Map();
    tableauDeBord.refCache.forEach((c) => (c.stale = true));
    buildColumns(meta && meta.order);
    if (!tableauDeBord.configLoaded) {
      const c = tableauDeBord.contexte.configuration && tableauDeBord.contexte.configuration();
      if (c && Array.isArray(c.blocks)) {
        tableauDeBord.config = JSON.parse(JSON.stringify(c));
        tableauDeBord.configLoaded = true;
      } else if (!tableauDeBord.config.blocks.length) {
        tableauDeBord.config = tableauDeBord.defaultConfig();
        if (tableauDeBord.contexte.mode === "edition") tableauDeBord.saveConfig();
      }
    }
    tableauDeBord.render();
  }
};
