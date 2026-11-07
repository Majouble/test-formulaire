/* PRISME — tableau de bord, module 13/15 : Détail des lignes derrière un chiffre, une barre ou une case.
   État posé sur tableauDeBord : drillState, lastDrillFocus.
   Publie sur tableauDeBord : drillRows, openDrill, renderDrill, drillCsv, drillFilter, drillPt, drillAttr, drillCell.
   Utilise (tableauDeBord.) : EMPTY, GEO_T, PIE_MAX, baseRows, closeQuick, columns, config, coverInfo, crossData,
     dateLabel, dayOf, downloadCsv, editing, fileSafe, fmtPct, isCover, isDate, isMainSrc, isNumCol, keyLabel,
     keysOf, labelOf, measureText, numOf, passAll, plain, quick, racine, records, render, rich, showMsg, textOf,
     toJsDate, triggerDownload, typeOf.
   tableauDeBord et l'ordre des modules : voir tableau-de-bord/tableau.js. */

TableauDeBord.modules["detail"] = function (tableauDeBord) {
  const { esc, $ } = Outils;
  // fonctions de ce module utilisées ailleurs : disponibles dès maintenant (déclarations remontées)
  Object.assign(tableauDeBord, { drillRows, openDrill, renderDrill, drillCsv, drillFilter });
  // =============================================================================
  // Clic sur un chiffre, une barre, une part ou une case : détail des lignes
  // =============================================================================
  // point d'un graphique : (catégorie, série) = (ligne, colonne), ou l'inverse quand l'abscisse est inversée
  const drillPt = (spec, catKey, serKey) =>
    spec.swap ? (serKey === "__autres" ? "" : drillAttr(spec.bi, serKey, catKey)) : drillAttr(spec.bi, catKey, serKey);
  const drillAttr = (i, rk, ck) => ` data-drill="${esc(JSON.stringify([i, rk ?? null, ck ?? null]))}"`;
  const drillCell = (i, rk, ck) => drillAttr(i, rk, ck) + ` tabindex="0" role="button" aria-label="Voir le détail"`;
  tableauDeBord.drillState = null; // { i, rk, ck, rows, sortCol, sortDir }

  function isoWeekStart(key) {
    // "2026-S40" -> lundi de la semaine
    const [y, w] = key.split("-S").map(Number);
    const jan4 = new Date(Date.UTC(y, 0, 4)),
      mon = new Date(jan4);
    mon.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + (w - 1) * 7);
    return mon;
  }
  function keyRange(key, grain) {
    if (grain === "mois") return [key + "-01", key + "-31"];
    if (grain === "annee") return [key + "-01-01", key + "-12-31"];
    if (grain === "semaine") {
      const a = isoWeekStart(key),
        b = new Date(a);
      b.setUTCDate(a.getUTCDate() + 6);
      return [a.toISOString().slice(0, 10), b.toISOString().slice(0, 10)];
    }
    return [key, key];
  }

  function drillRows(i, rk, ck) {
    const b = tableauDeBord.config.blocks[i],
      base = tableauDeBord.baseRows(),
      rows = base.filter((r) => tableauDeBord.passAll(r, b.conds, b.logic));
    if (b.type === "tile" || (rk === null && ck === null)) return rows;
    const d = tableauDeBord.crossData(b, base);
    const othersCols = new Set(d.colKeys.filter((k) => d.colorOf.get(k) === "var(--other)"));
    const restRows = new Set(d.rowKeys.filter((k) => (d.rowVal.get(k) || 0) > 0).slice(tableauDeBord.PIE_MAX));
    return rows.filter((r) => {
      if (rk !== null) {
        const ks = tableauDeBord.keysOf(d.rc, r[d.rc], d.rg);
        if (rk === "__autres" ? !ks.some((k) => restRows.has(k)) : !ks.includes(rk)) return false;
      }
      if (ck !== null && d.cc) {
        const ks = tableauDeBord.keysOf(d.cc, r[d.cc], d.cg);
        if (ck === "__autres" ? !ks.some((k) => othersCols.has(k)) : !ks.includes(ck)) return false;
      }
      return true;
    });
  }

  function detailColumns(b) {
    const exist = (id) => tableauDeBord.columns.some((c) => c.id === id);
    if (b.detailCols && b.detailCols.filter(exist).length) return b.detailCols.filter(exist);
    const avgLen = (id) => {
      let n = 0,
        s = 0;
      for (const r of tableauDeBord.records.slice(0, 200)) {
        const t = tableauDeBord.textOf(r[id]);
        if (t) {
          n++;
          s += t.length;
        }
      }
      return n ? s / n : 0;
    };
    const pref = [b.rows && b.rows.col, b.cols && b.cols.col, b.measure && b.measure.col].filter(Boolean);
    const ids = [...new Set([...pref, ...tableauDeBord.columns.map((c) => c.id)])].filter(
      (id) => exist(id) && (pref.includes(id) || avgLen(id) <= 80),
    );
    return ids.slice(0, 7);
  }
  const cellText = (col, v) =>
    tableauDeBord.isDate(col)
      ? (() => {
          const d = tableauDeBord.toJsDate(v);
          if (!d) return "";
          const day = tableauDeBord.dayOf(col, v);
          return tableauDeBord.typeOf(col).startsWith("DateTime")
            ? `${tableauDeBord.dateLabel(day, "jour")} ${Outils.dates.heure(d, { hour: "2-digit", minute: "2-digit" })}`
            : tableauDeBord.dateLabel(day, "jour");
        })()
      : Array.isArray(v)
        ? tableauDeBord
            .keysOf(col, v)
            .filter((k) => k !== tableauDeBord.EMPTY)
            .join(", ")
        : (tableauDeBord.textOf(v) ?? "");

  function openDrill(i, rk, ck) {
    if (tableauDeBord.isCover(tableauDeBord.config.blocks[i])) {
      const b = tableauDeBord.config.blocks[i],
        c = tableauDeBord.coverInfo(
          tableauDeBord.baseRows().filter((r) => tableauDeBord.passAll(r, b.conds, b.logic)),
          b.measure,
        );
      if (!c.ok) return;
      tableauDeBord.drillState = { i, rk, ck, cover: c, rows: [], sortCol: null, sortDir: 1 };
      tableauDeBord.renderDrill();
      $("drill").hidden = false;
      const btn = $("drill").querySelector("#drillClose");
      if (btn) btn.focus();
      return;
    }
    tableauDeBord.drillState = { i, rk, ck, rows: tableauDeBord.drillRows(i, rk, ck), sortCol: null, sortDir: 1 };
    tableauDeBord.renderDrill();
    $("drill").hidden = false;
    const btn = $("drill").querySelector("#drillClose");
    if (btn) btn.focus();
  }
  function closeDrill() {
    $("drill").hidden = true;
    tableauDeBord.drillState = null;
    if (tableauDeBord.lastDrillFocus)
      try {
        tableauDeBord.lastDrillFocus.focus();
      } catch (e) {}
  }
  tableauDeBord.lastDrillFocus = null;

  function renderCoverDrill(s, b) {
    const c = s.cover,
      byLabel = (a, z) => a.label.localeCompare(z.label, "fr", { numeric: true });
    const list = (items, n) =>
      items.length
        ? `<div class="chips">${items
            .slice()
            .sort(byLabel)
            .map(
              (x) =>
                `<span class="chip">${tableauDeBord.rich(x.label)}${n ? ` <span class="hint">${x.n}</span>` : ""}</span>`,
            )
            .join("")}</div>`
        : `<p class="hint">Aucune.</p>`;
    $("drill").innerHTML = `<div class="drill-panel" role="dialog" aria-modal="true" aria-labelledby="drillTitle">
    <div class="card-head"><div class="t"><h2 id="drillTitle">${tableauDeBord.rich(b.title || tableauDeBord.measureText(b.measure))}</h2>
      <div class="desc">${c.present.length} sur ${c.total} (${tableauDeBord.fmtPct(c.total ? (c.present.length / c.total) * 100 : NaN)}) · liste « ${esc(b.measure.ref.col)} » de la table ${esc(b.measure.ref.table)}</div></div>
      <button class="ghost" id="drillClose" aria-label="Fermer le détail">✕</button></div>
    <div class="bar" style="margin:8px 0"><button id="drillCsv">Télécharger en CSV</button></div>
    <div style="max-height:62vh;overflow:auto">
      <h3 class="lbl" style="margin:8px 0 4px">Sans réponse (${c.missing.length})</h3>${list(c.missing, false)}
      <h3 class="lbl" style="margin:12px 0 4px">Ont répondu (${c.present.length}) <span class="hint">· nombre de lignes</span></h3>${list(c.present, true)}
      ${c.outside.length ? `<h3 class="lbl" style="margin:12px 0 4px">Hors liste (${c.outside.length}) <span class="hint">· valeurs des réponses absentes de la liste : faute de frappe ou liste incomplète ?</span></h3>${list(c.outside, true)}` : ""}
    </div></div>`;
  }
  function renderDrill() {
    const s = tableauDeBord.drillState;
    if (!s) return;
    const b = tableauDeBord.config.blocks[s.i];
    if (s.cover) return renderCoverDrill(s, b);
    const cols = detailColumns(b);
    const parts = [];
    if (b.type === "cross") {
      if (s.rk !== null)
        parts.push(s.rk === "__autres" ? "Autres" : tableauDeBord.keyLabel(b.rows.col, s.rk, b.rows.grain));
      if (s.ck !== null && b.cols && b.cols.col)
        parts.push(s.ck === "__autres" ? "Autres" : tableauDeBord.keyLabel(b.cols.col, s.ck, b.cols.grain));
    }
    let rows = s.rows.slice();
    if (s.sortCol) {
      const c = s.sortCol,
        num = tableauDeBord.isNumCol(c);
      rows.sort((a, z) => {
        const va = tableauDeBord.isDate(c)
          ? (tableauDeBord.toJsDate(a[c]) || 0) - 0
          : num
            ? tableauDeBord.numOf(a[c])
            : tableauDeBord.plain(cellText(c, a[c]));
        const vz = tableauDeBord.isDate(c)
          ? (tableauDeBord.toJsDate(z[c]) || 0) - 0
          : num
            ? tableauDeBord.numOf(z[c])
            : tableauDeBord.plain(cellText(c, z[c]));
        return (
          (typeof va === "number"
            ? (isNaN(va) ? -Infinity : va) - (isNaN(vz) ? -Infinity : vz)
            : String(va).localeCompare(String(vz), "fr", { numeric: true })) * s.sortDir
        );
      });
    }
    const LIMIT = 300,
      shown = rows.slice(0, LIMIT);
    const canFilter =
      b.type === "cross" &&
      !tableauDeBord.GEO_T[b.rows.grain] &&
      ((s.rk !== null && s.rk !== "__autres") || (s.ck !== null && s.ck !== "__autres"));
    const canSelect = window.grist && typeof grist.setSelectedRows === "function" && tableauDeBord.isMainSrc(b);
    $("drill").innerHTML = `<div class="drill-panel" role="dialog" aria-modal="true" aria-labelledby="drillTitle">
    <div class="card-head"><div class="t"><h2 id="drillTitle">Détail · ${tableauDeBord.rich(b.title || tableauDeBord.measureText(b.measure))}</h2>
      <div class="desc">${parts.length ? tableauDeBord.rich(parts.join(" · ")) + " · " : ""}${s.rows.length} ligne${s.rows.length > 1 ? "s" : ""}</div></div>
      <button class="ghost" id="drillClose" aria-label="Fermer le détail">✕</button></div>
    <div class="bar" style="margin:8px 0">
      ${canFilter ? `<button class="primary" id="drillFilter">Filtrer le tableau de bord sur cette sélection</button>` : ""}
      ${canSelect ? `<button id="drillSelect" title="Sélectionne ces lignes dans les vues Grist liées à ce widget">Sélectionner dans Grist</button>` : ""}
      <button id="drillCsv">Télécharger en CSV</button>
    </div>
    <div class="tbl-wrap" style="max-height:60vh"><table><thead><tr>${cols.map((c) => `<th><button class="ghost sort" data-sort="${esc(c)}" title="Trier">${tableauDeBord.rich(tableauDeBord.labelOf(c))}${s.sortCol === c ? (s.sortDir > 0 ? " ▲" : " ▼") : ""}</button></th>`).join("")}</tr></thead>
    <tbody>${shown.map((r) => `<tr>${cols.map((c) => `<td style="text-align:left;white-space:normal">${tableauDeBord.rich(cellText(c, r[c]))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
    ${rows.length > LIMIT ? `<p class="hint">Affichage limité aux ${LIMIT} premières lignes : téléchargez le CSV pour avoir les ${rows.length}.</p>` : ""}
    <p class="hint">Colonnes affichées : réglables dans les paramètres de ce bloc (« Modifier le tableau de bord » → Colonnes du détail).</p>
  </div>`;
  }

  function drillCsv() {
    const s = tableauDeBord.drillState;
    if (!s) return;
    if (s.cover) {
      tableauDeBord.downloadCsv(tableauDeBord.config.blocks[s.i]);
      return;
    }
    const b = tableauDeBord.config.blocks[s.i],
      cols = detailColumns(b);
    const q = (v) => {
      const t = v == null ? "" : String(v);
      return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const lines = [
      cols.map((c) => q(tableauDeBord.plain(tableauDeBord.labelOf(c)))).join(";"),
      ...s.rows.map((r) => cols.map((c) => q(tableauDeBord.plain(cellText(c, r[c])))).join(";")),
    ];
    tableauDeBord.triggerDownload(
      new Blob(["﻿" + lines.join("\r\n") + "\r\n"], { type: "application/octet-stream" }),
      `detail ${tableauDeBord.fileSafe(b.title || "bloc")}.csv`,
    );
  }

  function drillFilter() {
    const s = tableauDeBord.drillState;
    if (!s) return;
    const b = tableauDeBord.config.blocks[s.i];
    const apply = (col, key, grain) => {
      if (!col || key === null || key === "__autres" || tableauDeBord.GEO_T[grain]) return;
      if (tableauDeBord.isDate(col)) {
        const [from, to] = keyRange(key, grain || "jour");
        tableauDeBord.quick[col] = { kind: "date", preset: "custom", from, to };
      } else tableauDeBord.quick[col] = { kind: "values", values: [key] };
    };
    apply(b.rows.col, s.rk, b.rows.grain);
    if (b.cols && b.cols.col) apply(b.cols.col, s.ck, b.cols.grain);
    closeDrill();
    tableauDeBord.render();
  }

  tableauDeBord.racine.addEventListener("click", (e) => {
    if (tableauDeBord.editing) return;
    const dp = e.target.closest("#drill");
    if (dp) {
      if (e.target === dp || e.target.closest("#drillClose")) closeDrill();
      else if (e.target.closest("#drillFilter")) tableauDeBord.drillFilter();
      else if (e.target.closest("#drillCsv")) tableauDeBord.drillCsv();
      else if (e.target.closest("#drillSelect")) {
        try {
          grist.setSelectedRows(tableauDeBord.drillState.rows.map((r) => r.id));
          tableauDeBord.showMsg(
            "ok",
            `${tableauDeBord.drillState.rows.length} ligne(s) sélectionnée(s) dans les vues Grist liées à ce widget.`,
          );
        } catch (err) {
          tableauDeBord.showMsg("warn", "Sélection impossible : " + err.message);
        }
        closeDrill();
      } else {
        const sb = e.target.closest("[data-sort]");
        if (sb) {
          const c = sb.dataset.sort;
          tableauDeBord.drillState.sortDir =
            tableauDeBord.drillState.sortCol === c ? -tableauDeBord.drillState.sortDir : 1;
          tableauDeBord.drillState.sortCol = c;
          tableauDeBord.renderDrill();
        }
      }
      return;
    }
    const t = e.target.closest("[data-drill]");
    if (!t || e.target.closest("button")) return;
    tableauDeBord.lastDrillFocus = t;
    const [i, rk, ck] = JSON.parse(t.getAttribute("data-drill"));
    tableauDeBord.openDrill(i, rk, ck);
  });
  tableauDeBord.racine.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!$("drill").hidden) closeDrill();
      else if (!$("qpop").hidden) tableauDeBord.closeQuick();
      return;
    }
    if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("[data-drill]")) {
      e.preventDefault();
      tableauDeBord.lastDrillFocus = e.target;
      const [i, rk, ck] = JSON.parse(e.target.getAttribute("data-drill"));
      tableauDeBord.openDrill(i, rk, ck);
    }
  });
  // constantes de ce module utilisées ailleurs
  Object.assign(tableauDeBord, { drillPt, drillAttr, drillCell });
};
