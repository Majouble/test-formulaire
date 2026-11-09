/* PRISME — tableau de bord, module 05/15 : Tables de référence : listes attendues (établissements, départements…).
   État posé sur tableauDeBord : docMeta, mainTable.
   Publie sur tableauDeBord : refTables, refColumns, ensureRefs, refList, coverInfo, refCache, refLoading, refNorm,
     refStateText.
   Utilise (tableauDeBord.) : CFG_TABLE, EMPTY, GEO_T, config, inSrc, isCover, isMainSrc, keysOf, norm, numOf, passAll,
     ptsTable, records, render, textOf.
   tableauDeBord et l'ordre des modules : voir tableau-de-bord/tableau.js. */

TableauDeBord.modules["references"] = function (tableauDeBord) {
  const { DEP_ACA, depKey, acaKey, depFromUai } = window.Geo;
  // fonctions de ce module utilisées ailleurs : disponibles dès maintenant (déclarations remontées)
  Object.assign(tableauDeBord, { refTables, refColumns, ensureRefs, refList, coverInfo });
  // =============================================================================
  // Tables de référence (autres tables du document) : listes attendues
  // =============================================================================
  tableauDeBord.docMeta = null;
  tableauDeBord.mainTable = null;
  const refCache = new Map(); // table -> { cols, data, stale }
  const refLoading = new Set();
  const refNorm = (s) =>
    tableauDeBord
      .norm(s)
      .replace(/[\s\-'’_.]+/g, " ")
      .trim();
  function refTables() {
    if (!tableauDeBord.docMeta) return [];
    const T = tableauDeBord.docMeta.T;
    return T.tableId.filter(
      (t, i) =>
        t &&
        t !== tableauDeBord.mainTable &&
        t !== tableauDeBord.CFG_TABLE &&
        !t.startsWith("GristHidden") &&
        !(T.summarySourceTable && T.summarySourceTable[i]),
    );
  }
  function refColumns(table) {
    if (!tableauDeBord.docMeta || !table) return [];
    const T = tableauDeBord.docMeta.T,
      C = tableauDeBord.docMeta.C,
      ref = T.id[T.tableId.indexOf(table)];
    const out = [];
    C.id.forEach((_, i) => {
      if (C.parentId[i] === ref && C.colId[i] !== "manualSort" && !C.colId[i].startsWith("gristHelper_"))
        out.push({ id: C.colId[i], label: (C.label && C.label[i]) || C.colId[i], type: C.type[i] });
    });
    return out;
  }
  function wantedRefs() {
    const s = new Set();
    tableauDeBord.config.blocks.forEach((b) => {
      if (!tableauDeBord.isMainSrc(b)) s.add(b.source);
      if (tableauDeBord.isCover(b) && b.measure.ref && b.measure.ref.table) s.add(b.measure.ref.table);
      if (b.rows && b.rows.ref && b.rows.ref.table) s.add(b.rows.ref.table);
      if (b.chart === "points" && tableauDeBord.ptsTable(b)) s.add(tableauDeBord.ptsTable(b));
    });
    return [...s];
  }
  async function ensureRefs() {
    if (!window.grist || !grist.docApi) return;
    const todo = wantedRefs().filter((t) => (!refCache.has(t) || refCache.get(t).stale) && !refLoading.has(t));
    if (!todo.length) return;
    todo.forEach((t) => refLoading.add(t));
    await Promise.all(
      todo.map(async (t) => {
        try {
          const data = await Donnees.lire(t);
          refCache.set(t, { data, stale: false });
        } catch (e) {
          refCache.set(t, { error: e && e.message ? e.message : String(e), stale: false });
        }
        refLoading.delete(t);
      }),
    );
    tableauDeBord.render();
  }
  // liste de référence : valeur normalisée -> { label, n (lignes de la référence), sum (valeur attendue) }
  // valeur de la référence rattachée comme les lignes du bloc (ex. « 093 », un UAI ou « Seine-Saint-Denis » -> « 93 »)
  function refGeoKey(grain, t) {
    if (grain === "dep_uai") return depFromUai(t) || depKey(t);
    if (grain === "aca_uai") return DEP_ACA[depFromUai(t)] || acaKey(t);
    if (grain === "aca_dep") return DEP_ACA[depKey(t)] || acaKey(t);
    if (grain === "dep_norm") return depKey(t);
    if (grain === "aca_norm") return acaKey(t);
    return t;
  }
  function refList(ref, grain) {
    if (!ref || !ref.table || !ref.col) return { state: "unset" };
    const c = refCache.get(ref.table);
    if (!c) return { state: "loading" };
    if (c.error) return { state: "error", error: c.error };
    const col = c.data[ref.col];
    if (!col) return { state: "error", error: `colonne « ${ref.col} » introuvable dans ${ref.table}` };
    const exp = ref.expect && ref.expect !== "__count" ? c.data[ref.expect] : null;
    // filtre propre à la référence (ex. Type d'établissement = Lycée), évalué dans les colonnes de la table de référence
    let keep = null;
    if ((ref.conds || []).some((x) => x && x.col)) {
      keep = new Set();
      tableauDeBord.inSrc({ source: ref.table }, () =>
        tableauDeBord.records.forEach((r, i) => {
          if (tableauDeBord.passAll(r, ref.conds, ref.logic)) keep.add(i);
        }),
      );
    }
    const geo = tableauDeBord.GEO_T[grain];
    const map = new Map();
    let kept = 0;
    col.forEach((v, i) => {
      if (keep && !keep.has(i)) return;
      kept++;
      const items = Array.isArray(v) ? (v[0] === "L" ? v.slice(1) : v) : [v];
      items.forEach((x) => {
        let t = tableauDeBord.textOf(x);
        if (t === null) return;
        if (geo) {
          t = refGeoKey(grain, t);
          if (!t) return;
        }
        const k = refNorm(t);
        let e = map.get(k);
        if (!e) map.set(k, (e = { label: t, n: 0, sum: 0 }));
        e.n++;
        if (exp) {
          const n = tableauDeBord.numOf(exp[i]);
          if (!isNaN(n)) e.sum += n;
        }
      });
    });
    return {
      state: "ok",
      map,
      size: map.size,
      rows: kept,
      total: col.length,
      expected: (k) => {
        const e = map.get(k);
        return !e ? NaN : ref.expect === "__count" ? e.n : exp ? e.sum : NaN;
      },
    };
  }
  const refStateText = (L) =>
    L.state === "loading"
      ? "lecture de la table de référence…"
      : L.state === "error"
        ? "table de référence illisible : " + L.error
        : "choisissez la table et la colonne de référence";
  // couverture : valeurs de la liste présentes dans les réponses
  function coverInfo(rows, m) {
    const L = refList(m.ref);
    if (L.state !== "ok" || !m.col) return { L, ok: false };
    const seen = new Map(),
      outside = new Map();
    rows.forEach((r) =>
      new Set(tableauDeBord.keysOf(m.col, r[m.col]).filter((k) => k !== tableauDeBord.EMPTY)).forEach((k) => {
        const nk = refNorm(k);
        if (L.map.has(nk)) seen.set(nk, (seen.get(nk) || 0) + 1);
        else outside.set(k, (outside.get(k) || 0) + 1);
      }),
    );
    const list = [...L.map.entries()].map(([k, e]) => ({ key: k, label: e.label, n: seen.get(k) || 0 }));
    return {
      L,
      ok: true,
      present: list.filter((x) => x.n),
      missing: list.filter((x) => !x.n),
      outside: [...outside.entries()].map(([label, n]) => ({ label, n })),
      total: L.size,
    };
  }
  // constantes de ce module utilisées ailleurs
  Object.assign(tableauDeBord, { refCache, refLoading, refNorm, refStateText });
};
