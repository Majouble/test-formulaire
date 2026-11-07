/* PRISME — tableau de bord, module 06/15 : Source d'un bloc : la table du widget ou une autre table du document.
   État posé sur tableauDeBord : curSrc, mainState.
   Publie sur tableauDeBord : inSrc, srcNote, missingColsNote, remapBlockCols, aggregate, measureText, isMainSrc.
   Utilise (tableauDeBord.) : AGGS, EMPTY, colLabels, colTypes, columnIds, columns, config, coverInfo, keysOf, kindCache,
     labelOf, mainTable, numOf, quick, records, refCache, refColumns, refLoading, refNorm.
   tableauDeBord et l'ordre des modules : voir tableau-de-bord/tableau.js. */

TableauDeBord.modules["sources"] = function (tableauDeBord) {
  const { esc } = Outils;
  // fonctions de ce module utilisées ailleurs : disponibles dès maintenant (déclarations remontées)
  Object.assign(tableauDeBord, { inSrc, srcNote, missingColsNote, remapBlockCols, aggregate, measureText });
  // =============================================================================
  // Source d'un bloc : la table du widget (par défaut) ou une autre table du document
  // =============================================================================
  const isMainSrc = (b) => !b || !b.source || b.source === tableauDeBord.mainTable;
  tableauDeBord.curSrc = null;
  tableauDeBord.mainState = null;
  const stateNow = () => ({
    records: tableauDeBord.records,
    columns: tableauDeBord.columns,
    colTypes: tableauDeBord.colTypes,
    colLabels: tableauDeBord.colLabels,
    kindCache: tableauDeBord.kindCache,
    columnIds: tableauDeBord.columnIds,
  });
  function setState(st) {
    ({
      records: tableauDeBord.records,
      columns: tableauDeBord.columns,
      colTypes: tableauDeBord.colTypes,
      colLabels: tableauDeBord.colLabels,
      kindCache: tableauDeBord.kindCache,
      columnIds: tableauDeBord.columnIds,
    } = st);
  }
  const EMPTY_STATE = () => ({
    records: [],
    columns: [],
    colTypes: {},
    colLabels: {},
    kindCache: new Map(),
    columnIds: new Set(),
  });
  function ctxOf(table) {
    const c = tableauDeBord.refCache.get(table);
    if (!c || !c.data) return null;
    if (!c.ctx) {
      const d = c.data,
        meta = tableauDeBord.refColumns(table).filter((x) => d[x.id]);
      const ids = meta.map((x) => x.id);
      c.ctx = {
        records: (d.id || []).map((id, i) => {
          const r = { id };
          ids.forEach((k) => (r[k] = d[k][i]));
          return r;
        }),
        columns: meta.map((x) => ({ id: x.id, label: x.label, type: x.type })),
        colTypes: Object.fromEntries(meta.map((x) => [x.id, x.type])),
        colLabels: Object.fromEntries(meta.map((x) => [x.id, x.label])),
        kindCache: new Map(),
        columnIds: new Set(ids),
      };
    }
    return c.ctx;
  }
  // exécute fn avec les lignes et colonnes de la table source du bloc (calcul synchrone uniquement)
  function inSrc(b, fn) {
    const target = isMainSrc(b) ? null : b.source;
    if (target === tableauDeBord.curSrc) return fn();
    const prev = stateNow(),
      prevSrc = tableauDeBord.curSrc;
    if (prevSrc === null) tableauDeBord.mainState = prev;
    setState(target === null ? tableauDeBord.mainState : ctxOf(target) || EMPTY_STATE());
    tableauDeBord.curSrc = target;
    try {
      return fn();
    } finally {
      setState(prev);
      tableauDeBord.curSrc = prevSrc;
    }
  }
  // filtres communs ou rapides qui ne s'appliquent pas à la table du bloc (colonne absente)
  function srcNote(b) {
    if (isMainSrc(b)) return "";
    const c = tableauDeBord.refCache.get(b.source);
    if (!c || (tableauDeBord.refLoading.has(b.source) && !c.data))
      return `<p class="hint">Lecture de la table « ${esc(b.source)} »…</p>`;
    if (c.error) return `<p class="hint warn">Table « ${esc(b.source)} » illisible : ${esc(c.error)}</p>`;
    const skipped = [
      ...new Set([
        ...(tableauDeBord.config.filters || []).filter((f) => f.col).map((f) => f.col),
        ...Object.keys(tableauDeBord.quick),
      ]),
    ].filter((col) => !tableauDeBord.columnIds.has(col));
    return skipped.length
      ? `<p class="hint edit-only">Table « ${esc(b.source)} » : filtre(s) sans effet ici, faute de colonne du même nom : ${esc(skipped.map(tableauDeBord.labelOf).join(", "))}. (Message visible seulement en mode modification.)</p>`
      : "";
  }
  // colonnes du bloc absentes de sa table (après un changement de source, ou colonne supprimée)
  function missingColsNote(b) {
    if (!tableauDeBord.columnIds.size) return "";
    const out = [];
    const chk = (col, what) => {
      if (col && !tableauDeBord.columnIds.has(col)) out.push(`${what} : « ${tableauDeBord.labelOf(col)} »`);
    };
    chk(b.measure && b.measure.col, "mesure");
    if (b.type === "cross") {
      chk(b.rows && b.rows.col, "lignes");
      chk(b.cols && b.cols.col, "colonnes");
    }
    (b.conds || []).forEach((c, k) => chk(c.col, `condition ${k + 1} (ignorée)`));
    return out.length
      ? `<p class="hint warn edit-only">Colonne(s) absente(s) de la table ${esc(isMainSrc(b) ? tableauDeBord.mainTable || "du widget" : b.source)} : ${esc(out.join(" · "))}. Choisissez-en une autre dans les réglages ci-dessous.</p>`
      : "";
  }
  // au changement de source : chaque colonne du bloc est reprise si la nouvelle table a la même (même identifiant ou même libellé)
  function remapBlockCols(b, oldSrc) {
    const target = isMainSrc(b)
      ? tableauDeBord.curSrc === null
        ? tableauDeBord.columns
        : tableauDeBord.mainState.columns
      : tableauDeBord.refColumns(b.source);
    if (!target || !target.length) return;
    const oldLabel = (col) => inSrc(oldSrc ? { source: oldSrc } : null, () => tableauDeBord.labelOf(col));
    const map = (col) => {
      if (!col) return col;
      const hit =
        target.find((c) => c.id === col) ||
        target.find((c) => tableauDeBord.refNorm(c.label) === tableauDeBord.refNorm(oldLabel(col))) ||
        target.find((c) => tableauDeBord.refNorm(c.id) === tableauDeBord.refNorm(col));
      return hit ? hit.id : col;
    };
    if (b.measure) b.measure.col = map(b.measure.col);
    if (b.rows) b.rows.col = map(b.rows.col);
    if (b.cols) b.cols.col = map(b.cols.col);
    (b.conds || []).forEach((c) => (c.col = map(c.col)));
    if (b.detailCols) b.detailCols = b.detailCols.map(map).filter((c) => target.some((t) => t.id === c));
  }

  function aggregate(rows, m) {
    const agg = m.agg || "count";
    if (agg === "count") return rows.length;
    if (agg === "cover") {
      const c = tableauDeBord.coverInfo(rows, m);
      return c.ok ? c.present.length : NaN;
    }
    if (!m.col) return NaN;
    if (agg === "distinct") {
      const s = new Set();
      rows.forEach((r) =>
        tableauDeBord.keysOf(m.col, r[m.col]).forEach((k) => {
          if (k !== tableauDeBord.EMPTY) s.add(k);
        }),
      );
      return s.size;
    }
    const nums = rows.map((r) => tableauDeBord.numOf(r[m.col])).filter((n) => !isNaN(n));
    if (agg === "sum") return nums.reduce((a, b) => a + b, 0);
    if (!nums.length) return NaN;
    if (agg === "avg") return nums.reduce((a, b) => a + b, 0) / nums.length;
    if (agg === "min") return Math.min(...nums);
    if (agg === "max") return Math.max(...nums);
    return NaN;
  }
  function measureText(m) {
    if (m.agg === "cover")
      return `Couverture de la liste « ${(m.ref && m.ref.col) || "?"} » (table ${(m.ref && m.ref.table) || "?"}) par ${tableauDeBord.labelOf(m.col || "?")}`;
    const a = (tableauDeBord.AGGS.find((x) => x[0] === (m.agg || "count")) || tableauDeBord.AGGS[0])[1];
    return m.agg && m.agg !== "count" ? `${a} ${tableauDeBord.labelOf(m.col || "?")}` : a;
  }
  // constantes de ce module utilisées ailleurs
  Object.assign(tableauDeBord, { isMainSrc });
};
