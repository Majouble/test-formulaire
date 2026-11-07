/* PRISME — tableau de bord, module 14/15 : Fonctions de bloc exécutées dans la table source du bloc ; relecture des autres tables.
   Remplace sur tableauDeBord les fonctions d'affichage publiées par les modules 08 à 13 (voir le commentaire ci-dessous).
   Utilise (tableauDeBord.) : baseRows, blockDesc, blockEditor, blockTable, chartSpec, config, crossData, downloadCsv,
     drillCsv, drillFilter, drillRows, drillState, editing, ensureRefs, hasRelConds, inSrc, isMainSrc, openDrill,
     racine, refCache, render, renderChart, renderCross, renderDrill, renderTile, tableHtml, tileNumbers, tileValue.
   tableauDeBord et l'ordre des modules : voir tableau-de-bord/tableau.js. */

TableauDeBord.modules["source-des-blocs"] = function (tableauDeBord) {
  const { $ } = Outils;
  // ---- Fonctions de bloc exécutées dans la table source du bloc
  // Les fonctions d'affichage des modules précédents, écrites pour la table principale, sont ici remplacées sur
  // tableauDeBord par des versions qui basculent d'abord sur la table source du bloc (inSrc). Tous les appels passant
  // par tableauDeBord, ils prennent la nouvelle version. Piste de simplification : passer la source en paramètre.
  {
    // bloc : les enveloppes et les originaux capturés (_rt, _df…) restent locaux
    const withB =
      (f) =>
      (b, ...a) =>
        tableauDeBord.inSrc(b, () => f(b, ...a));
    const withBase2 = (f) => (b, base) =>
      tableauDeBord.inSrc(b, () => f(b, tableauDeBord.isMainSrc(b) && base ? base : tableauDeBord.baseRows()));
    const withI =
      (f) =>
      (i, ...a) =>
        tableauDeBord.inSrc(tableauDeBord.config.blocks[i], () => f(i, ...a));
    const withDrill =
      (f) =>
      (...a) =>
        tableauDeBord.inSrc(tableauDeBord.drillState && tableauDeBord.config.blocks[tableauDeBord.drillState.i], () =>
          f(...a),
        );
    const _rt = tableauDeBord.renderTile,
      _rc = tableauDeBord.renderCross;
    tableauDeBord.renderTile = (b, i, base) =>
      tableauDeBord.inSrc(b, () => _rt(b, i, tableauDeBord.isMainSrc(b) ? base : tableauDeBord.baseRows()));
    tableauDeBord.renderCross = (b, i, base) =>
      tableauDeBord.inSrc(b, () => _rc(b, i, tableauDeBord.isMainSrc(b) ? base : tableauDeBord.baseRows()));
    tableauDeBord.crossData = withBase2(tableauDeBord.crossData);
    tableauDeBord.tileNumbers = withBase2(tableauDeBord.tileNumbers);
    tableauDeBord.tileValue = withB(tableauDeBord.tileValue);
    tableauDeBord.blockTable = withB(tableauDeBord.blockTable);
    tableauDeBord.tableHtml = withB(tableauDeBord.tableHtml);
    tableauDeBord.downloadCsv = withB(tableauDeBord.downloadCsv);
    tableauDeBord.blockDesc = withB(tableauDeBord.blockDesc);
    tableauDeBord.blockEditor = withB(tableauDeBord.blockEditor);
    tableauDeBord.chartSpec = withB(tableauDeBord.chartSpec);
    tableauDeBord.renderChart = withB(tableauDeBord.renderChart);
    tableauDeBord.openDrill = withI(tableauDeBord.openDrill);
    tableauDeBord.drillRows = withI(tableauDeBord.drillRows);
    tableauDeBord.renderDrill = withDrill(tableauDeBord.renderDrill);
    tableauDeBord.drillCsv = withDrill(tableauDeBord.drillCsv);
    const _df = tableauDeBord.drillFilter;
    tableauDeBord.drillFilter = () => {
      tableauDeBord.inSrc(tableauDeBord.drillState && tableauDeBord.config.blocks[tableauDeBord.drillState.i], () => {
        const keep = tableauDeBord.render;
        tableauDeBord.render = () => {};
        try {
          _df();
        } finally {
          tableauDeBord.render = keep;
        }
      });
      tableauDeBord.render();
    };
    const _render = tableauDeBord.render;
    tableauDeBord.render = () => {
      if (!tableauDeBord.racine.isConnected) return;
      tableauDeBord.inSrc(null, _render);
    }; // tableau de bord démonté (autre tableau choisi) : plus d'affichage
  }
  // autres tables : relues au retour sur l'onglet et toutes les 2 minutes (hors mode modification)
  function refreshSources() {
    if (
      tableauDeBord.editing ||
      document.hidden ||
      !tableauDeBord.config.blocks.some((b) => !tableauDeBord.isMainSrc(b))
    )
      return;
    tableauDeBord.refCache.forEach((c) => (c.stale = true));
    tableauDeBord.ensureRefs();
  }
  setInterval(refreshSources, 120000);
  setInterval(() => {
    if (
      !tableauDeBord.editing &&
      !document.hidden &&
      $("drill").hidden &&
      $("qpop").hidden &&
      tableauDeBord.hasRelConds()
    )
      tableauDeBord.render();
  }, 60000);
  document.addEventListener("visibilitychange", refreshSources);
};
