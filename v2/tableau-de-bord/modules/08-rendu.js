/* PRISME — tableau de bord, module 08/15 : Rendu des blocs : chiffres clés, tableaux croisés, réglages.
   Publie sur tableauDeBord : showMsg, scopeHost, logicOf, renderGlobal, blockEditor, baseRows, attachedTo, cardParts,
     renderTile, crossData, expectCells, renderCross, opt, fmtPct, cellRatio, withRatio.
   Utilise (tableauDeBord.) : ADDITIVE, AGGS, CFG_TABLE, CHART_TYPES, DATE_PRECS, EMPTY, GEO_GRAINS, GEO_T, LABEL_MODES,
     LOGIC_MODES, MAX_SERIES, NO_VALUE, OPS, REL_KINDS, SERIES, STACK_MODES, aggregate, autoDesc, blockDesc,
     choixGrist, columns, condText, condsText, config, coverNote, dashName, detailOpen, drillCell, fenetre, fmtNum,
     hasTime, inSrc, isCover, isDate, isMainSrc, keyLabel, keysOf, labelOf, logicError, logicTree, mainTable,
     mapEditor, measureText, missingColsNote, nf, passAll, plain, pointsEditor, quickPass, rangColonne, records,
     refColumns, refList, refNorm, refStateText, refTables, renderChart, rich, rowHead, shareUnit, srcNote, studio,
     tileNumbers, topOf, valeursColonnes.
   tableauDeBord et l'ordre des modules : voir tableau-de-bord/tableau.js. */

TableauDeBord.modules["rendu"] = function (tableauDeBord) {
  const { esc, $ } = Outils;
  // fonctions de ce module utilisées ailleurs : disponibles dès maintenant (déclarations remontées)
  Object.assign(tableauDeBord, {
    showMsg,
    scopeHost,
    logicOf,
    renderGlobal,
    blockEditor,
    baseRows,
    attachedTo,
    cardParts,
    renderTile,
    crossData,
    expectCells,
    renderCross,
  });
  // =============================================================================
  // Rendu
  // =============================================================================
  function showMsg(kind, text) {
    $("messages").innerHTML = text ? `<div class="msg ${kind}">${esc(text)}</div>` : "";
  }

  function colOptions(selected, { allowEmpty = false, emptyLabel = "—", filter = null } = {}) {
    const lost =
      selected && tableauDeBord.columns.length && !tableauDeBord.columns.some((c) => c.id === selected)
        ? `<option value="${esc(selected)}" selected>⚠ ${esc(tableauDeBord.labelOf(selected))} — absente de cette table</option>`
        : "";
    const opts =
      lost +
      tableauDeBord.columns
        .filter((c) => !filter || filter(c))
        .map((c) => `<option value="${esc(c.id)}" ${c.id === selected ? "selected" : ""}>${esc(c.label)}</option>`)
        .join("");
    return (allowEmpty ? `<option value="" ${!selected ? "selected" : ""}>${esc(emptyLabel)}</option>` : "") + opts;
  }
  const opt = (list, sel) =>
    list.map(([v, l]) => `<option value="${v}" ${v === sel ? "selected" : ""}>${esc(l)}</option>`).join("");

  function valueSuggestions(col) {
    if (!col || tableauDeBord.isDate(col)) return [];
    const counts = new Map();
    tableauDeBord.records.forEach((r) =>
      tableauDeBord.keysOf(col, r[col]).forEach((k) => {
        if (k !== tableauDeBord.EMPTY) counts.set(k, (counts.get(k) || 0) + 1);
      }),
    );
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 200)
      .map((e) => e[0]);
  }

  function scopeHost(scope) {
    if (scope === "g") return { host: tableauDeBord.config, condKey: "filters", logicKey: "filtersLogic", ctx: null };
    const m = String(scope).match(/^([bcr])(\d+)$/),
      b = tableauDeBord.config.blocks[Number(m[2])];
    if (m[1] === "b") return { host: b, condKey: "conds", logicKey: "logic", ctx: b };
    const ref = m[1] === "r" ? (b.rows.ref = b.rows.ref || {}) : (b.measure.ref = b.measure.ref || {});
    return { host: ref, condKey: "conds", logicKey: "logic", ctx: { source: ref.table } }; // colonnes de la table de référence
  }
  function logicOf(scope) {
    const h = scopeHost(scope);
    return (h.host[h.logicKey] = h.host[h.logicKey] || { mode: "and", expr: "" });
  }
  function condEditor(scope, conds) {
    const sh = scopeHost(scope),
      n = (conds || []).length,
      lg = sh.host[sh.logicKey] || { mode: "and", expr: "" };
    const mode = lg.mode || "and",
      err = n > 1 && mode === "expr" ? tableauDeBord.logicError(conds, lg) : "";
    const logicBar =
      n < 2
        ? ""
        : `<div class="cond logic">
      <span class="sub">Combiner</span>
      <select data-lscope="${scope}" data-lf="mode">${opt(tableauDeBord.LOGIC_MODES, mode)}</select>
      ${
        mode === "expr"
          ? `<input type="text" data-lscope="${scope}" data-lf="expr" value="${esc(lg.expr || "")}" placeholder="ex. 1 ET (2 OU 3)" style="min-width:200px" aria-label="Formule de combinaison des conditions">
        <span class="hint">Numéros des conditions, ET, OU, NON et parenthèses.</span>`
          : ""
      }
      ${err ? `<span class="warn">Formule à corriger : ${esc(err)}. En attendant, toutes les conditions s'appliquent (ET).</span>` : ""}</div>`;
    const list = (conds || [])
      .map((c, i) => {
        const needVal = !tableauDeBord.NO_VALUE.has(c.op || "eq");
        const dl = `dl-${scope}-${i}`;
        const prec = tableauDeBord.isDate(c.col) && tableauDeBord.hasTime(c.col) ? c.prec || "day" : "day";
        const precSel =
          tableauDeBord.isDate(c.col) &&
          tableauDeBord.hasTime(c.col) &&
          needVal &&
          !["contains", "ncontains", "in"].includes(c.op)
            ? `<select data-scope="${scope}" data-ci="${i}" data-f="prec" title="Précision de la comparaison">${opt(tableauDeBord.DATE_PRECS, prec)}</select>`
            : "";
        const rk = c.rel && c.rel.kind ? c.rel.kind : "";
        const relSel = `<select data-scope="${scope}" data-ci="${i}" data-f="relkind" title="Date fixe ou relative, recalculée à chaque affichage">${opt(tableauDeBord.REL_KINDS, rk)}</select>`;
        const relN =
          rk === "daysago" || rk === "hoursago"
            ? `<input type="number" min="0" step="1" style="width:64px" data-scope="${scope}" data-ci="${i}" data-f="reln" value="${esc(String((c.rel && c.rel.n) ?? 1))}" aria-label="${rk === "daysago" ? "Nombre de jours" : "Nombre d'heures"}">`
            : "";
        const valInput = !needVal
          ? ""
          : tableauDeBord.isDate(c.col) && !["contains", "ncontains", "in"].includes(c.op) && rk
            ? precSel +
              relSel +
              relN +
              `<span class="hint">= ${esc(tableauDeBord.condText(c).replace(/^.*\(([^()]*)\)$/, "$1"))}</span>`
            : tableauDeBord.isDate(c.col) && !["contains", "ncontains", "in"].includes(c.op)
              ? precSel +
                relSel +
                (prec === "time"
                  ? `<input type="time" data-scope="${scope}" data-ci="${i}" data-f="val" value="${esc(String(c.val || "").slice(0, 5))}">`
                  : prec === "datetime"
                    ? `<input type="datetime-local" data-scope="${scope}" data-ci="${i}" data-f="val" value="${esc(String(c.val || "").slice(0, 16))}">`
                    : `<input type="date" data-scope="${scope}" data-ci="${i}" data-f="val" value="${esc(String(c.val || "").slice(0, 10))}">`)
              : `<input type="text" list="${dl}" data-scope="${scope}" data-ci="${i}" data-f="val" value="${esc(c.val ?? "")}" placeholder="${c.op === "in" ? "valeur 1 ; valeur 2" : "valeur"}">
         <datalist id="${dl}">${valueSuggestions(c.col)
           .map((v) => `<option value="${esc(v)}">`)
           .join("")}</datalist>`;
        const link = n < 2 || i === 0 ? "" : mode === "or" ? "OU" : mode === "and" ? "ET" : "";
        return `<div class="cond">${n > 1 ? `<span class="num" title="Condition n° ${i + 1}">${link ? `<small>${link}</small> ` : ""}${i + 1}</span>` : ""}
      <select data-scope="${scope}" data-ci="${i}" data-f="col">${colOptions(c.col)}</select>
      <select data-scope="${scope}" data-ci="${i}" data-f="op">${opt(tableauDeBord.OPS, c.op || "eq")}</select>
      ${valInput}
      <button class="ghost" data-scope="${scope}" data-ci="${i}" data-act="delcond" title="Retirer cette condition">✕</button></div>`;
      })
      .join("");
    return `<div class="conds">${logicBar}${list || `<span class="hint">Aucune condition : toutes les lignes sont prises en compte.</span>`}</div>
    ${n > 1 && mode !== "and" && !err ? `<p class="hint">Lignes retenues : ${tableauDeBord.rich(tableauDeBord.condsText(conds, lg))}</p>` : ""}
    <div><button data-scope="${scope}" data-act="addcond">+ Condition</button></div>`;
  }

  function renderGlobal() {
    const f = tableauDeBord.config.filters || [];
    const lt = tableauDeBord.logicTree(f, tableauDeBord.config.filtersLogic);
    const chips =
      lt && !lt.error
        ? f.some((c) => c.col)
          ? `<span class="chip">${tableauDeBord.rich(tableauDeBord.condsText(f, tableauDeBord.config.filtersLogic))}</span>`
          : ""
        : f
            .filter((c) => c.col)
            .map((c) => `<span class="chip">${tableauDeBord.rich(tableauDeBord.condText(c))}</span>`)
            .join("");
    const vue = `<div class="view-only">${chips ? `<div class="chips"><span class="sub">Filtres communs :</span>${chips}</div>` : ""}</div>`;
    const reglages = `
      <div class="row" style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
        <span class="sub">Nom de ce tableau de bord</span>
        <input type="text" id="dashName" value="${esc(tableauDeBord.dashName())}" style="min-width:220px" title="Sert à retrouver la configuration dans la table ${tableauDeBord.CFG_TABLE}">
        <span class="hint">Enregistré dans la table Config (clé tableau_de_bord)</span>
      </div>
      <div class="row" style="display:flex;gap:8px;align-items:center;margin-bottom:12px">
        <span class="sub">Chiffres clés dans le document Word</span>
        <select id="wordTilesLayout">${opt(
          [
            ["tiles", "en tuiles, comme à l'écran"],
            ["table", "en tableau à deux colonnes"],
          ],
          (tableauDeBord.config.wordTiles || {}).layout || "tiles",
        )}</select>
        ${
          ((tableauDeBord.config.wordTiles || {}).layout || "tiles") === "tiles"
            ? `<select id="wordTilesPerRow">${opt(
                [
                  ["2", "2 par ligne"],
                  ["3", "3 par ligne"],
                  ["4", "4 par ligne"],
                ],
                String((tableauDeBord.config.wordTiles || {}).perRow || 3),
              )}</select>`
            : ""
        }
        <select id="wordDeltaColor" title="Couleur des évolutions (▲ ▼) en pied de carte dans le document Word">${opt(
          [
            ["color", "évolutions en couleur"],
            ["black", "évolutions en noir"],
          ],
          (tableauDeBord.config.wordTiles || {}).deltaColor || "color",
        )}</select>
      </div>
      <h2>Filtres rapides proposés aux lecteurs</h2>
      <div class="desc">Ils apparaissent en haut du tableau de bord, hors mode modification. Chaque lecteur filtre pour lui-même, sans changer le tableau de bord des autres.</div>
      <div class="chips" style="margin:6px 0 4px">${(tableauDeBord.config.quickFilters || []).map((c, k) => `<span class="chip">${esc(tableauDeBord.plain(tableauDeBord.labelOf(c)))}${tableauDeBord.isDate(c) ? " (période)" : ""} <button class="ghost" data-act="delqf" data-k="${k}" aria-label="Retirer ce filtre rapide">✕</button></span>`).join("") || `<span class="hint">Aucun filtre rapide pour l'instant.</span>`}</div>
      <div class="row" style="display:flex;gap:6px;align-items:center;margin-bottom:12px">
        <select id="qfAddCol">${colOptions("", { allowEmpty: true, emptyLabel: "Choisir une colonne…", filter: (c) => !(tableauDeBord.config.quickFilters || []).includes(c.id) })}</select>
        <button data-act="addqf">+ Filtre rapide</button></div>

      <h2>Filtres communs à tout le tableau de bord</h2>
      <div class="desc">Ces conditions s'appliquent à tous les blocs, en plus des conditions propres à chaque bloc.</div>
      <div style="margin-top:8px">${condEditor("g", f)}</div>`;
    if (tableauDeBord.studio()) {
      // atelier : réglages du tableau dans leur fenêtre ; à l'écran, les filtres communs en rappel
      $("globalBox").innerHTML = chips
        ? `<div class="chips st-rappel"><span class="sub">Filtres communs :</span>${chips} <button class="ghost" data-act="st-reglages">modifier</button></div>`
        : "";
      if (tableauDeBord.fenetre === "reglages")
        $("fenetreCorps").innerHTML = `<div class="st-reglages">${reglages}</div>`;
      return;
    }
    $("globalBox").innerHTML = `${vue}<div class="edit-only card">${reglages}</div>`;
  }

  // Ordre personnalisé des colonnes d'un tableau croisé : flèches pour avancer ou reculer chaque colonne
  function ordreColonnesEditeur(b, i) {
    const vals = tableauDeBord.valeursColonnes(b),
      n = vals.length;
    if (!n)
      return `<div class="row"><span class="lbl">Ordre des colonnes</span><span class="hint">Aucune valeur pour l'instant.</span></div>`;
    const lab = (k) => tableauDeBord.rich(tableauDeBord.keyLabel(b.cols.col, k, b.cols.grain));
    return `<div class="row" style="align-items:flex-start"><span class="lbl">Ordre des colonnes</span><div style="flex:1">
      <ol class="ordre-cols" style="margin:0;padding-left:22px">${vals
        .map(
          (k, j) => `<li style="margin:2px 0">
        <button class="ghost" data-act="colmove" data-b="${i}" data-j="${j}" data-d="-1" ${j ? "" : "disabled"} title="Avancer (plus à gauche)" aria-label="Avancer ${esc(k)}">↑</button>
        <button class="ghost" data-act="colmove" data-b="${i}" data-j="${j}" data-d="1" ${j < n - 1 ? "" : "disabled"} title="Reculer (plus à droite)" aria-label="Reculer ${esc(k)}">↓</button>
        ${lab(k)}</li>`,
        )
        .join("")}</ol>
      <p class="hint">De haut en bas : de gauche à droite dans le tableau (et ordre des séries du graphique). Une valeur nouvelle se place à la fin.
        ${(b.colOrder || []).length ? `<button class="ghost" data-act="colreset" data-b="${i}">Repartir de l'ordre par défaut</button>` : ""}</p></div></div>`;
  }
  function blockEditor(b, i) {
    const s = `b${i}`;
    const numFilter = (c) => true;
    const tables = tableauDeBord.refTables();
    const refPick = (k, ref, withExpect) => {
      const rc = tableauDeBord.refColumns(ref.table),
        L = tableauDeBord.refList(ref, k === "rows.ref" ? b.rows.grain : undefined);
      const nums = rc.filter((c) => /^(Numeric|Int)$/.test(c.type));
      return `<select data-b="${i}" data-k="${k}.table">${opt([["", withExpect ? "Sans liste de référence" : "Table de référence…"], ...tables.map((t) => [t, "Table " + t])], ref.table || "")}</select>
      ${ref.table ? `<select data-b="${i}" data-k="${k}.col">${opt([["", "Colonne de la liste…"], ...rc.map((c) => [c.id, c.label])], ref.col || "")}</select>` : ""}
      ${
        ref.table && withExpect
          ? `<select data-b="${i}" data-k="${k}.expect" title="Ajoute au tableau une colonne « Attendu » et un taux (valeur ÷ attendu)">${opt([["", "Sans valeur attendue"], ["__count", "Attendu : nombre de lignes de la référence"], ...nums.map((c) => [c.id, "Attendu : somme de " + c.label])], ref.expect || "")}</select>
        <label><input type="checkbox" data-b="${i}" data-k="${k}.only" ${ref.only ? "checked" : ""}> Masquer les valeurs absentes de la liste</label>`
          : ""
      }
      ${
        ref.table && withExpect && ref.expect
          ? `<input type="text" data-b="${i}" data-k="${k}.expLabel" value="${esc(ref.expLabel || "")}" placeholder="Attendu" title="Nom de la colonne de référence" style="width:150px">
        <input type="text" data-b="${i}" data-k="${k}.rateLabel" value="${esc(ref.rateLabel || "")}" placeholder="Taux" title="Nom de la colonne du ratio" style="width:110px">
        ${b.cols && b.cols.col ? `<label title="Ajoute dans chaque case le pourcentage de la valeur de référence de sa ligne"><input type="checkbox" data-b="${i}" data-k="${k}.perCol" ${ref.perCol ? "checked" : ""}> Ratio dans chaque colonne</label>` : ""}`
          : ""
      }
      ${ref.table && ref.col ? `<span class="hint">${L.state === "ok" ? `${L.size} valeur(s) dans la liste${L.rows < L.total ? ` · ${tableauDeBord.fmtNum(L.rows)} ligne(s) de la référence retenue(s) sur ${tableauDeBord.fmtNum(L.total)}` : ""}` : esc(tableauDeBord.refStateText(L))}</span>` : ""}`;
    };
    const refFilter = (k, ref) =>
      !ref.table
        ? ""
        : `<div class="row" style="align-items:flex-start"><span class="lbl">Filtrer la référence</span><div style="flex:1">
      ${tableauDeBord.inSrc({ source: ref.table }, () => condEditor((k === "rows.ref" ? "r" : "c") + i, ref.conds))}
      <p class="hint">Seules les lignes de « ${esc(ref.table)} » qui remplissent ces conditions comptent dans la liste et dans l'attendu (ex. Type d'établissement = Lycée).</p></div></div>`;
    const aggList = b.type === "tile" ? tableauDeBord.AGGS : tableauDeBord.AGGS.filter((a) => a[0] !== "cover");
    const measure = `<div class="row"><span class="lbl">Mesure</span>
      <select data-b="${i}" data-k="measure.agg">${opt(aggList, b.measure.agg || "count")}</select>
      ${b.measure.agg && b.measure.agg !== "count" ? `<select data-b="${i}" data-k="measure.col">${colOptions(b.measure.col, { allowEmpty: true, emptyLabel: "Choisir une colonne…", filter: numFilter })}</select>` : ""}
    </div>${
      tableauDeBord.isCover(b)
        ? `<div class="row"><span class="lbl">Liste attendue</span>${refPick("measure.ref", b.measure.ref || {}, false)}</div>${refFilter("measure.ref", b.measure.ref || {})}
      <p class="hint">Compte les valeurs de la liste (par exemple les 30 académies) qui apparaissent au moins une fois dans « ${esc(tableauDeBord.labelOf(b.measure.col || "?"))} ». Un clic sur le chiffre montre celles qui n'ont pas répondu. Les majuscules, accents et tirets ne comptent pas dans la comparaison.</p>`
        : ""
    }`;
    const grains = [
      ["jour", "par jour"],
      ["semaine", "par semaine"],
      ["mois", "par mois"],
      ["annee", "par année"],
    ];
    const dim = (
      k,
      d,
      emptyLabel,
    ) => `<select data-b="${i}" data-k="${k}.col">${colOptions(d.col, { allowEmpty: k === "cols", emptyLabel })}</select>
      ${d.col && tableauDeBord.isDate(d.col) ? `<select data-b="${i}" data-k="${k}.grain">${opt(grains, d.grain || "jour")}</select>` : ""}
      ${k === "rows" && d.col && !tableauDeBord.isDate(d.col) ? `<select data-b="${i}" data-k="${k}.grain" title="Pour la carte : rattacher chaque valeur à un département ou une académie">${opt(tableauDeBord.GEO_GRAINS, tableauDeBord.GEO_T[d.grain] ? d.grain : "")}</select>` : ""}`;
    const cross =
      b.type !== "cross"
        ? ""
        : `
    <div class="row"><span class="lbl">Lignes</span>${dim("rows", b.rows, "")}</div>
    ${b.rows.col && !tableauDeBord.isDate(b.rows.col) ? `<div class="row"><span class="lbl">Compléter avec</span>${refPick("rows.ref", b.rows.ref || {}, true)}</div>${refFilter("rows.ref", b.rows.ref || {})}` : ""}
    <div class="row"><span class="lbl">Colonnes</span>${dim("cols", b.cols, "Aucune (une seule colonne de résultat)")}
      ${
        b.cols && b.cols.col && !tableauDeBord.isDate(b.cols.col)
          ? `<select data-b="${i}" data-k="colSort" title="Ordre des colonnes du tableau et des séries du graphique">${opt(
              [
                ["value", "colonnes : par valeur décroissante"],
                ["label", "colonnes : de A à Z"],
                ["labeldesc", "colonnes : de Z à A"],
                ...(tableauDeBord.choixGrist(
                  tableauDeBord.isMainSrc(b) ? tableauDeBord.mainTable : b.source,
                  b.cols.col,
                ).length
                  ? [["choices", "colonnes : ordre des choix dans Grist"]]
                  : []),
                ["manual", "colonnes : ordre personnalisé…"],
              ],
              b.colSort || "value",
            )}</select>`
          : ""
      }</div>
    ${b.cols && b.cols.col && !tableauDeBord.isDate(b.cols.col) && b.colSort === "manual" ? ordreColonnesEditeur(b, i) : ""}
`;
    const crossVue =
      b.type !== "cross"
        ? ""
        : `
    <div class="row"><span class="lbl">Affichage</span>
      <select data-b="${i}" data-k="view">${opt(
        [
          ["both", "Graphique et tableau"],
          ["table", "Tableau seul"],
          ["chart", "Graphique seul"],
        ],
        b.view || "both",
      )}</select>
      <select data-b="${i}" data-k="sort">${opt(
        [
          ["value", "Tri par valeur décroissante"],
          ["label", "Tri alphabétique ou chronologique"],
        ],
        b.sort || "value",
      )}</select>
      <label title="Nombre de lignes du tableau et du graphique ; 0 = toutes">Lignes affichées <input type="number" min="0" style="width:70px" data-b="${i}" data-k="top" value="${b.top === 0 ? 0 : b.top || 20}"> <span class="hint">(0 = toutes)</span></label>
      <label><input type="checkbox" data-b="${i}" data-k="percent" ${b.percent ? "checked" : ""}> Afficher en % du total</label>
    </div>
    <div class="row"><span class="lbl">Graphique</span>
      <select data-b="${i}" data-k="chart">${opt(tableauDeBord.CHART_TYPES, b.chart || "barh")}</select>
      ${
        b.chart === "map"
          ? tableauDeBord.mapEditor(b, i)
          : b.chart === "points"
            ? tableauDeBord.pointsEditor(b, i)
            : `${b.cols && b.cols.col && (b.chart || "barh") !== "pie" ? `<select data-b="${i}" data-k="stack">${opt(tableauDeBord.STACK_MODES, b.stack || "stack")}</select>` : ""}
      ${
        b.cols && b.cols.col && (b.chart || "barh") !== "pie"
          ? `<select data-b="${i}" data-k="swap" title="Ce qui va en abscisse (ou en barres) et ce qui forme les séries (couleurs, courbes)">${opt(
              [
                ["", "abscisse : lignes du tableau, séries : colonnes"],
                ["1", "abscisse : colonnes du tableau, séries : lignes"],
              ],
              b.swap ? "1" : "",
            )}</select>`
          : ""
      }
      <select data-b="${i}" data-k="labels" title="Pourcentage d'une barre : part du total du bloc. Avec des séries : part de la barre.">${opt(tableauDeBord.LABEL_MODES, b.labels || "auto")}</select>
      <label>Dans Word <select data-b="${i}" data-k="wordChart">${opt(
        [
          ["native", "graphique Word modifiable"],
          ["image", "image"],
        ],
        b.wordChart || "native",
      )}</select></label>`
      }
    </div>`;
    const others =
      b.type !== "tile"
        ? []
        : tableauDeBord.config.blocks
            .filter((x) => x !== b && x.type === "tile" && !(x.card && (x.card.sub || x.card.prev || x.card.ref)))
            .map((x) => [x.id, tableauDeBord.plain(x.title || tableauDeBord.measureText(x.measure))]);
    const cd = cardOf(b),
      tileSel = (k, val) =>
        `<select data-b="${i}" data-k="card.${k}">${opt([["", "aucune"], ...others], val || "")}</select>`;
    const lblIn = (k, val, ph) =>
      `<input type="text" data-b="${i}" data-k="card.${k}" value="${esc(val || "")}" placeholder="${esc(ph)}" style="min-width:160px">`;
    const card =
      b.type !== "tile"
        ? ""
        : `<details data-detailbox="${esc(b.id)}-card" ${tableauDeBord.detailOpen.has(b.id + "-card") ? "open" : ""}><summary><span class="lbl">Présentation en carte</span>
      <span class="hint">sous-chiffre, comparaison en bas à gauche, référence en bas à droite</span></summary>
      <div class="row"><span class="lbl">Sous-chiffre</span>${
        cd.sub
          ? `<select data-b="${i}" data-k="card.subWord" title="Mot placé devant le sous-chiffre">${opt(
              [
                ["dont", "dont"],
                ["pour", "pour"],
                ["sur", "sur"],
                ["soit", "soit"],
                ["", "(sans mot)"],
              ],
              cd.subWord === undefined ? "dont" : cd.subWord,
            )}</select>`
          : ""
      }${tileSel("sub", cd.sub)}${cd.sub ? lblIn("subLabel", cd.subLabel, "ex. collèges, signalements") : ""}</div>
      <div class="row"><span class="lbl">Bas gauche (comparaison)</span>${tileSel("prev", cd.prev)}
        ${cd.prev ? lblIn("prevLabel", cd.prevLabel, "ex. Veille même heure") + `<select data-b="${i}" data-k="card.deltaMode">${opt(DELTA_MODES, cd.deltaMode || "pct")}</select><select data-b="${i}" data-k="card.sense">${opt(DELTA_SENSES, cd.sense || "bad")}</select>` : ""}</div>
      <div class="row"><span class="lbl">Bas droite (référence)</span>${tileSel("ref", cd.ref)}${cd.ref ? lblIn("refLabel", cd.refLabel, "ex. Pic · 1er oct. 17 h 15") : ""}</div>
      <p class="hint">Chaque chiffre vient d'une autre tuile, qui garde ses propres conditions. Les tuiles rattachées sont masquées hors mode modification et dans Word. Libellé vide : le titre de la tuile est repris.</p></details>`;
    const pct =
      b.type !== "tile"
        ? ""
        : tableauDeBord.isCover(b)
          ? `<div class="row"><label><input type="checkbox" data-b="${i}" data-k="shareMain" ${b.shareMain ? "checked" : ""}> Mettre le pourcentage en grand</label></div>`
          : `<div class="row"><label><input type="checkbox" data-b="${i}" data-k="showShare" ${b.showShare ? "checked" : ""}> Afficher le pourcentage : même mesure avec les conditions du bloc ÷ même mesure sans elles</label>
      ${b.showShare ? `<label><input type="checkbox" data-b="${i}" data-k="shareMain" ${b.shareMain ? "checked" : ""}> Mettre le pourcentage en grand</label>` : ""}</div>`;
    const srcSel = `<div class="row"><span class="lbl">Source</span>
      <select data-b="${i}" data-k="source" data-prev="${esc(tableauDeBord.isMainSrc(b) ? "" : b.source)}">${opt([["", `Table du widget${tableauDeBord.mainTable ? " (" + tableauDeBord.mainTable + ")" : ""}`], ...tableauDeBord.refTables().map((t) => [t, "Table " + t])], tableauDeBord.isMainSrc(b) ? "" : b.source)}</select>
      <span class="hint">Les conditions et colonnes proposées sont celles de cette table. Filtres communs et rapides : appliqués quand la table a une colonne du même nom.</span></div>`;
    const nc = (b.conds || []).filter((c) => c.col).length;
    const resume = [
      tableauDeBord.isMainSrc(b) ? "" : "table " + b.source,
      tableauDeBord.plain(tableauDeBord.measureText(b.measure)),
      nc ? `${nc} condition${nc > 1 ? "s" : ""}` : "sans condition",
    ]
      .filter(Boolean)
      .join(" · ");
    const rappel = `    <div class="row"><span class="lbl">Rappel du calcul</span>
      <textarea rows="2" style="flex:1;min-width:240px;font:inherit;color:var(--ink);background:var(--surface);border:1px solid var(--axis);border-radius:6px;padding:4px 6px" data-b="${i}" data-k="desc" placeholder="${esc(tableauDeBord.plain(tableauDeBord.autoDesc(b)))}" ${b.hideDesc ? "disabled" : ""}>${esc(b.desc || "")}</textarea>
      ${String(b.desc || "").trim() ? `<button class="ghost" data-act="autodesc" data-b="${i}" title="Effacer le texte saisi et revenir au rappel automatique">Texte automatique</button>` : ""}</div>
    <div class="row"><span class="hint">Laissez vide pour le texte automatique (affiché en grisé). Saisi, votre texte le remplace à l'écran et dans les exports ; <b>{calcul}</b> y insère le texte automatique, *texte* le met en gras.</span></div>
    <div class="row"><label><input type="checkbox" data-b="${i}" data-k="hideDesc" ${b.hideDesc ? "checked" : ""}> Masquer le rappel du calcul (sous le titre, à l'écran et dans les exports)</label></div>
`;
    const detailBox = `    <details data-detailbox="${esc(b.id)}" ${tableauDeBord.detailOpen.has(b.id) ? "open" : ""}><summary><span class="lbl">Colonnes du détail</span>
      <span class="hint">${(b.detailCols || []).length ? `${b.detailCols.length} colonne(s) choisie(s)` : "choix automatique"} · affichées au clic sur un chiffre, une barre ou une case</span></summary>
      <div class="chips" style="margin-top:6px">${tableauDeBord.columns.map((c) => `<label class="chip" style="display:inline-flex;gap:4px;align-items:center"><input type="checkbox" data-bdetail="${i}" data-col="${esc(c.id)}" ${(b.detailCols || []).includes(c.id) ? "checked" : ""}> ${esc(tableauDeBord.plain(c.label))}</label>`).join("")}</div>
      <p class="hint">Aucune case cochée : le widget montre les colonnes du bloc et les colonnes courtes.${(b.detailCols || []).length ? ` <button class="ghost" data-act="clrdetail" data-b="${i}">Revenir au choix automatique</button>` : ""}</p></details>
`;
    const conditions = `<div class="row" style="align-items:flex-start"><span class="lbl">Conditions</span><div style="flex:1">${condEditor(s, b.conds)}</div></div>`;
    const titre = `<div class="row"><span class="lbl">Titre</span><input type="text" style="flex:1;min-width:200px" data-b="${i}" data-k="title" value="${esc(b.title || "")}"></div>`;
    // atelier (administration) : réglages répartis en onglets dans le panneau de droite
    if (tableauDeBord.studio())
      return {
        resume,
        donnees: `${srcSel}${measure}${cross}${conditions}`,
        presentation: `${titre}${crossVue}${pct}${card}${rappel}`,
        detail: detailBox,
      };
    return `<details class="edbox edit-only" data-detailbox="${esc(b.id)}-ed" ${tableauDeBord.detailOpen.has(b.id + "-ed") ? "open" : ""}>
    <summary><span class="lbl">Réglages</span> <span class="hint">${esc(resume)}</span></summary>
    <div class="editor">
    ${srcSel}${titre}${measure}${cross}${crossVue}${pct}${card}${rappel}${detailBox}${conditions}
  </div></details>`;
  }

  function blockTools(i) {
    return `<span class="edit-only" style="white-space:nowrap">
    <span class="drag" draggable="true" data-drag="${i}" title="Glisser pour déplacer ce bloc" aria-hidden="true">⠿</span>
    <button class="ghost" data-act="up" data-b="${i}" title="Monter">↑</button>
    <button class="ghost" data-act="down" data-b="${i}" title="Descendre">↓</button>
    <button class="ghost" data-act="dup" data-b="${i}" title="Dupliquer">⧉</button>
    <button class="ghost" data-act="del" data-b="${i}" title="Supprimer">✕</button></span>`;
  }
  function exportTools(i) {
    return `<span class="view-only" style="white-space:nowrap">
    <button class="ghost" data-act="copy" data-b="${i}" title="Copier le tableau, à coller dans Word">Copier</button>
    <button class="ghost" data-act="png" data-b="${i}" title="Télécharger le graphique en image PNG">Image</button>
    <button class="ghost" data-act="docx" data-b="${i}" title="Télécharger ce bloc en document Word">Word</button>
    <button class="ghost" data-act="csv" data-b="${i}" title="Télécharger ce tableau en CSV">CSV</button></span>`;
  }

  function baseRows(except) {
    return tableauDeBord.records.filter(
      (r) =>
        tableauDeBord.passAll(r, tableauDeBord.config.filters, tableauDeBord.config.filtersLogic) &&
        tableauDeBord.quickPass(r, except),
    );
  }

  // ---- Présentation en carte : « dont … », comparaison (bas gauche) et référence (bas droite), chacune issue d'une autre tuile
  const blockById = (id) => tableauDeBord.config.blocks.find((x) => x.id === id) || null;
  const indexOfId = (id) => tableauDeBord.config.blocks.findIndex((x) => x.id === id);
  const cardOf = (b) => b.card || {};
  // tuiles rattachées à une autre : masquées hors mode modification, dans l'écran comme dans Word
  function attachedTo(b) {
    return (
      tableauDeBord.config.blocks.find(
        (x) => x !== b && x.type === "tile" && x.card && [x.card.sub, x.card.prev, x.card.ref].includes(b.id),
      ) || null
    );
  }
  // valeur affichée d'une tuile (nombre ou pourcentage si « pourcentage en grand »)
  function tileMain(b, base) {
    const t = tableauDeBord.tileNumbers(b, base),
      hasShare = (b.showShare || tableauDeBord.isCover(b)) && !isNaN(t.share);
    return hasShare && b.shareMain
      ? { text: `${tableauDeBord.fmtNum(t.share)} %`, num: t.share }
      : { text: tableauDeBord.fmtNum(t.v), num: t.v };
  }
  const DELTA_MODES = [
    ["pct", "évolution en %"],
    ["abs", "écart en nombre"],
    ["both", "écart et %"],
    ["none", "sans évolution"],
  ];
  const DELTA_SENSES = [
    ["bad", "hausse = défavorable (rouge)"],
    ["good", "hausse = favorable (vert)"],
    ["neutral", "neutre (gris)"],
  ];
  // évolution du chiffre principal par rapport à la tuile de comparaison
  function deltaOf(b, cur, prev) {
    const c = cardOf(b),
      mode = c.deltaMode || "pct";
    if (mode === "none" || isNaN(cur) || isNaN(prev)) return null;
    const diff = cur - prev,
      pct = prev ? (diff / prev) * 100 : NaN;
    const sign = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + tableauDeBord.nf.format(Math.abs(Math.round(v * 10) / 10));
    const arrow = diff > 0 ? "▲" : diff < 0 ? "▼" : "=";
    const p = Math.abs(pct) >= 10 ? Math.round(pct) : pct; // au-delà de 10 %, pas de décimale
    let txt =
      mode === "abs" || isNaN(pct) ? sign(diff) : mode === "both" ? `${sign(diff)} (${sign(p)} %)` : `${sign(p)} %`;
    if (diff === 0) txt = "stable";
    const sense = c.sense || "bad";
    const tone = diff === 0 || sense === "neutral" ? "neutral" : diff > 0 === (sense === "good") ? "good" : "bad";
    return { text: (diff === 0 ? txt : `${arrow} ${txt}`).replace(/ /g, "\u00a0"), tone }; // insécables : l'évolution ne se coupe pas
  }
  // éléments de la carte calculés une fois (écran et Word)
  function cardParts(b, base) {
    const c = cardOf(b),
      out = {};
    const sb = c.sub && blockById(c.sub),
      pb = c.prev && blockById(c.prev),
      rb = c.ref && blockById(c.ref);
    const word = c.subWord === undefined ? "dont" : c.subWord; // « dont » par défaut, ou « pour », « sur », « soit »…
    if (sb)
      out.sub = {
        text: `${word ? word + " " : ""}${tileMain(sb).text}${c.subLabel ? " " + c.subLabel : ""}`,
        i: indexOfId(sb.id),
      };
    if (pb) {
      const m = tileMain(pb);
      out.prev = {
        label: c.prevLabel || pb.title || tableauDeBord.measureText(pb.measure),
        value: m.text,
        i: indexOfId(pb.id),
        delta: deltaOf(b, tileMain(b, base).num, m.num),
      };
    }
    if (rb)
      out.ref = {
        label: c.refLabel || rb.title || tableauDeBord.measureText(rb.measure),
        value: tileMain(rb).text,
        i: indexOfId(rb.id),
      };
    return out;
  }

  function renderTile(b, i, base) {
    const t = tableauDeBord.tileNumbers(b, base),
      v = t.v;
    const unit = tableauDeBord.shareUnit(b);
    const hasShare = (b.showShare || tableauDeBord.isCover(b)) && !isNaN(t.share);
    const main = hasShare && b.shareMain ? `${tableauDeBord.fmtNum(t.share)} %` : tableauDeBord.fmtNum(v);
    const share = !hasShare
      ? ""
      : b.shareMain
        ? `<div class="part">${tableauDeBord.fmtNum(v)} sur ${tableauDeBord.fmtNum(t.all)}${unit ? " " + esc(unit) : ""}</div>`
        : `<div class="part">${tableauDeBord.fmtNum(t.share)} % (sur ${tableauDeBord.fmtNum(t.all)}${unit ? " " + esc(unit) : ""})</div>`;
    return `<div class="card tile${attachedTo(b) ? " attached" : ""}" data-bi="${i}">
    <div class="card-head"><div class="t"><h2>${tableauDeBord.rich(b.title || tableauDeBord.measureText(b.measure))}</h2>
      ${b.hideDesc ? "" : `<div class="desc">${tableauDeBord.rich(tableauDeBord.blockDesc(b))}</div>`}</div>${blockTools(i)}</div>
    <div class="value"${tableauDeBord.drillCell(i, null, null)} title="${tableauDeBord.isCover(b) ? "Voir la liste : qui a répondu, qui manque" : "Voir le détail des lignes"}">${main}</div>${share}
    ${(() => {
      const cp = cardParts(b, base);
      const att = attachedTo(b);
      return (
        (cp.sub
          ? `<div class="part"><span${tableauDeBord.drillCell(cp.sub.i, null, null)}>${tableauDeBord.rich(cp.sub.text)}</span></div>`
          : "") +
        (cp.prev || cp.ref
          ? `<div class="kfoot"><span>${cp.prev ? `${tableauDeBord.rich(cp.prev.label)}<br><b${tableauDeBord.drillCell(cp.prev.i, null, null)}>${esc(cp.prev.value)}</b>${cp.prev.delta ? ` <span class="d-${cp.prev.delta.tone}">${esc(cp.prev.delta.text)}</span>` : ""}` : ""}</span>
            <span class="r">${cp.ref ? `${tableauDeBord.rich(cp.ref.label)}<br><b${tableauDeBord.drillCell(cp.ref.i, null, null)}>${esc(cp.ref.value)}</b>` : ""}</span></div>`
          : "") +
        (att
          ? `<span class="attached-badge edit-only">Rattachée à « ${esc(tableauDeBord.plain(att.title || "tuile"))} » · masquée hors modification</span>`
          : "")
      );
    })()}
    ${tableauDeBord.srcNote(b)}${tableauDeBord.missingColsNote(b)}
    ${tableauDeBord.isCover(b) ? `<div class="part">${t.cover && t.cover.ok ? esc(tableauDeBord.coverNote(t.cover)) : esc(tableauDeBord.refStateText(t.cover ? t.cover.L : { state: "unset" }))}</div>` : ""}
    ${tableauDeBord.studio() ? "" : tableauDeBord.blockEditor(b, i)}</div>`;
  }

  // Calcul d'un tableau croisé
  function crossData(b, base) {
    const rows = base.filter((r) => tableauDeBord.passAll(r, b.conds, b.logic));
    const rc = b.rows.col,
      cc = b.cols && b.cols.col;
    const rg = b.rows.grain,
      cg = b.cols && b.cols.grain;
    const byRow = new Map(),
      byCol = new Map(),
      cells = new Map();
    const push = (map, k, r) => {
      let a = map.get(k);
      if (!a) map.set(k, (a = []));
      a.push(r);
    };
    rows.forEach((r) => {
      const rks = rc ? [...new Set(tableauDeBord.keysOf(rc, r[rc], rg))] : ["Total"];
      const cks = cc ? [...new Set(tableauDeBord.keysOf(cc, r[cc], cg))] : [null];
      rks.forEach((rk) => {
        push(byRow, rk, r);
        cks.forEach((ck) => {
          push(cells, rk + "\u0001" + ck, r);
        });
      });
      cks.forEach((ck) => {
        if (ck !== null) push(byCol, ck, r);
      });
    });
    const m = b.measure;
    let rowKeys = [...byRow.keys()];
    const rowVal = new Map(rowKeys.map((k) => [k, tableauDeBord.aggregate(byRow.get(k), m)]));
    // liste de référence : valeurs sans réponse ajoutées à 0, valeur attendue par ligne
    const L =
      rc && !tableauDeBord.isDate(rc) && b.rows.ref ? tableauDeBord.refList(b.rows.ref, rg) : { state: "unset" };
    let expected = null,
      missingKeys = new Set(),
      outsideKeys = new Set();
    if (L.state === "ok") {
      const have = new Set(rowKeys.map(tableauDeBord.refNorm));
      rowKeys.forEach((k) => {
        if (!L.map.has(tableauDeBord.refNorm(k))) outsideKeys.add(k);
      });
      if (b.rows.ref.only) {
        rowKeys = rowKeys.filter((k) => !outsideKeys.has(k));
      }
      L.map.forEach((e, nk) => {
        if (!have.has(nk)) {
          rowKeys.push(e.label);
          missingKeys.add(e.label);
          rowVal.set(e.label, tableauDeBord.ADDITIVE.has(m.agg || "count") || m.agg === "distinct" ? 0 : NaN);
        }
      });
      if (b.rows.ref.expect) expected = new Map(rowKeys.map((k) => [k, L.expected(tableauDeBord.refNorm(k))]));
    }
    const chrono = rc && tableauDeBord.isDate(rc);
    if (b.sort === "label" || (chrono && b.sort !== "value"))
      rowKeys.sort(
        (a, c) =>
          (a === tableauDeBord.EMPTY) - (c === tableauDeBord.EMPTY) || a.localeCompare(c, "fr", { numeric: true }),
      );
    else rowKeys.sort((a, c) => (rowVal.get(c) || 0) - (rowVal.get(a) || 0) || a.localeCompare(c, "fr"));
    let colKeys = cc ? [...byCol.keys()] : [];
    const colVal = new Map(colKeys.map((k) => [k, tableauDeBord.aggregate(byCol.get(k), m)]));
    if (cc && tableauDeBord.isDate(cc))
      colKeys.sort((a, c) => (a === tableauDeBord.EMPTY) - (c === tableauDeBord.EMPTY) || a.localeCompare(c));
    else if (b.colSort === "label")
      colKeys.sort(
        (a, c) =>
          (a === tableauDeBord.EMPTY) - (c === tableauDeBord.EMPTY) ||
          tableauDeBord.keyLabel(cc, a, cg).localeCompare(tableauDeBord.keyLabel(cc, c, cg), "fr", { numeric: true }),
      );
    else if (b.colSort === "labeldesc")
      colKeys.sort(
        (a, c) =>
          (a === tableauDeBord.EMPTY) - (c === tableauDeBord.EMPTY) ||
          tableauDeBord.keyLabel(cc, c, cg).localeCompare(tableauDeBord.keyLabel(cc, a, cg), "fr", { numeric: true }),
      );
    else if (b.colSort === "manual" || b.colSort === "choices") {
      const rang = tableauDeBord.rangColonne(b) || (() => 0);
      colKeys.sort(
        (a, c) => rang(a) - rang(c) || (colVal.get(c) || 0) - (colVal.get(a) || 0) || a.localeCompare(c, "fr"),
      );
    } else colKeys.sort((a, c) => (colVal.get(c) || 0) - (colVal.get(a) || 0) || a.localeCompare(c, "fr"));
    const val = (rk, ck) => {
      const a = cells.get(rk + "\u0001" + ck);
      return a ? tableauDeBord.aggregate(a, m) : tableauDeBord.ADDITIVE.has(m.agg || "count") ? 0 : NaN;
    };
    const keptRows =
      L.state === "ok" && b.rows.ref.only
        ? rows.filter((r) => tableauDeBord.keysOf(rc, r[rc], rg).some((k) => !outsideKeys.has(k)))
        : rows;
    const total = tableauDeBord.aggregate(keptRows, m);
    // couleurs des séries : attribuées par l'ordre des valeurs sur l'ensemble des données (stable quand on filtre)
    const colorOf = new Map();
    if (cc) {
      const all = new Map();
      tableauDeBord.records.forEach((r) =>
        tableauDeBord.keysOf(cc, r[cc], cg).forEach((k) => all.set(k, (all.get(k) || 0) + 1)),
      );
      const ordered = [...all.entries()].sort((a, c) => c[1] - a[1] || a[0].localeCompare(c[0], "fr")).map((e) => e[0]);
      ordered.forEach((k, j) =>
        colorOf.set(k, j < tableauDeBord.MAX_SERIES ? `var(${tableauDeBord.SERIES[j]})` : "var(--other)"),
      );
    }
    const expTotal = expected ? [...expected.values()].filter((v) => !isNaN(v)).reduce((a, v) => a + v, 0) : NaN;
    return {
      refCfg: (b.rows && b.rows.ref) || {},
      rows,
      rowKeys,
      colKeys,
      rowVal,
      colVal,
      val,
      total,
      colorOf,
      rc,
      cc,
      rg,
      cg,
      refState: L,
      expected,
      expTotal,
      missingKeys,
      outsideKeys,
    };
  }
  // colonnes « Attendu » et « Taux » d'un tableau croisé complété par une liste de référence
  const rateOf = (v, e) => (isNaN(v) || isNaN(e) || !e ? NaN : (v / e) * 100);
  const fmtPct = (v) => (isNaN(v) ? "–" : tableauDeBord.nf.format(Math.round(v * 10) / 10) + " %");
  function expectCells(d) {
    if (!d.expected) return null;
    const rc = d.refCfg || {};
    return {
      head: [rc.expLabel || "Attendu", rc.rateLabel || "Taux"],
      row: (rk) => [tableauDeBord.fmtNum(d.expected.get(rk)), fmtPct(rateOf(d.rowVal.get(rk), d.expected.get(rk)))],
      raw: (rk) => [d.expected.get(rk), rateOf(d.rowVal.get(rk), d.expected.get(rk))],
      total: [tableauDeBord.fmtNum(d.expTotal), fmtPct(rateOf(d.total, d.expTotal))],
      rawTotal: [d.expTotal, rateOf(d.total, d.expTotal)],
    };
  }
  // ratio d'une case (colonne) rapportée à la valeur de référence de sa ligne, si demandé
  const cellRatio = (d, rk, v) =>
    d.expected && d.refCfg && d.refCfg.perCol ? rateOf(v, rk === null ? d.expTotal : d.expected.get(rk)) : NaN;
  const withRatio = (txt, r) => (isNaN(r) ? txt : `${txt} (${fmtPct(r)})`);
  function refNote(b, d) {
    if (!b.rows.ref || !b.rows.ref.table) return "";
    if (d.refState.state !== "ok") return `<p class="hint">${esc(tableauDeBord.refStateText(d.refState))}</p>`;
    const parts = [
      `${d.refState.size} valeur(s) dans la liste « ${b.rows.ref.col} »`,
      `${d.missingKeys.size} sans réponse (à 0)`,
    ];
    if ((b.rows.ref.conds || []).some((c) => c && c.col))
      parts.push(
        `référence filtrée : ${tableauDeBord.inSrc({ source: b.rows.ref.table }, () => tableauDeBord.condsText(b.rows.ref.conds, b.rows.ref.logic))} (${tableauDeBord.fmtNum(d.refState.rows)} ligne(s) sur ${tableauDeBord.fmtNum(d.refState.total)})`,
      );
    if (d.outsideKeys.size)
      parts.push(
        b.rows.ref.only
          ? `${d.outsideKeys.size} valeur(s) hors liste masquée(s)`
          : `${d.outsideKeys.size} valeur(s) hors liste : ${[...d.outsideKeys].slice(0, 5).join(", ")}${d.outsideKeys.size > 5 ? "…" : ""}`,
      );
    return `<p class="hint">${esc(parts.join(" · "))}</p>`;
  }

  function renderCross(b, i, base) {
    const d = tableauDeBord.crossData(b, base);
    const head = `<div class="card-head"><div class="t"><h2>${tableauDeBord.rich(b.title || tableauDeBord.measureText(b.measure))}</h2>
      ${b.hideDesc ? "" : `<div class="desc">${tableauDeBord.rich(tableauDeBord.blockDesc(b))}</div>`}</div>
      ${exportTools(i)}${blockTools(i)}</div>`;
    if (!b.rows.col)
      return `<div class="card" data-card="${i}" data-bi="${i}">${head}<div class="empty">Choisissez une colonne pour les lignes (bouton « Modifier le tableau de bord »).</div>${tableauDeBord.studio() ? "" : tableauDeBord.blockEditor(b, i)}</div>`;
    if (!d.rows.length && !d.missingKeys.size)
      return `<div class="card" data-card="${i}" data-bi="${i}">${head}<div class="empty">Aucune ligne ne correspond aux conditions.</div>${tableauDeBord.srcNote(b)}${tableauDeBord.missingColsNote(b)}${tableauDeBord.studio() ? "" : tableauDeBord.blockEditor(b, i)}</div>`;
    const top = tableauDeBord.topOf(b);
    const shownRows = d.rowKeys.slice(0, top);
    const pct = b.percent && tableauDeBord.ADDITIVE.has(b.measure.agg || "count") && d.total;
    const show = (v) =>
      pct ? (isNaN(v) ? "–" : tableauDeBord.nf.format((v / d.total) * 100) + " %") : tableauDeBord.fmtNum(v);
    const view = b.view || "both";
    let chart = "",
      table = "";
    if (view !== "table") chart = tableauDeBord.renderChart(b, d, shownRows, i);
    if (view !== "chart") {
      const rl = (k) => tableauDeBord.rich(tableauDeBord.keyLabel(d.rc, k, d.rg));
      const cl = (k) => tableauDeBord.rich(tableauDeBord.keyLabel(d.cc, k, d.cg));
      const maxCell = d.cc ? Math.max(...shownRows.flatMap((rk) => d.colKeys.map((ck) => d.val(rk, ck) || 0)), 1) : 1;
      const heat = (v) =>
        !d.cc || isNaN(v) || !v
          ? ""
          : ` style="background: rgba(var(--heat), ${(0.06 + (0.34 * v) / maxCell).toFixed(3)})"`;
      const ex = expectCells(d);
      const headRow = `<tr><th>${tableauDeBord.rich(tableauDeBord.rowHead(d.rc, d.rg))}</th>${d.colKeys.map((ck) => `<th>${cl(ck)}</th>`).join("")}<th class="total">${d.cc ? "Total" : esc(tableauDeBord.measureText(b.measure))}</th>${ex ? ex.head.map((h) => `<th>${h}</th>`).join("") : ""}</tr>`;
      const body = shownRows
        .map(
          (rk) =>
            `<tr${d.missingKeys.has(rk) ? ' class="missing"' : ""}><td${tableauDeBord.drillCell(i, rk, null)}>${rl(rk)}</td>${d.colKeys
              .map((ck) => {
                const v = d.val(rk, ck);
                const r = cellRatio(d, rk, v);
                return `<td${heat(v)}${tableauDeBord.drillCell(i, rk, ck)}>${show(v)}${isNaN(r) ? "" : ` <span class="hint">${fmtPct(r)}</span>`}</td>`;
              })
              .join("")}<td class="total"${tableauDeBord.drillCell(i, rk, null)}>${show(d.rowVal.get(rk))}</td>${
              ex
                ? ex
                    .row(rk)
                    .map((c) => `<td>${c}</td>`)
                    .join("")
                : ""
            }</tr>`,
        )
        .join("");
      const rest =
        d.rowKeys.length > top
          ? `<tr><td colspan="${d.colKeys.length + 2 + (ex ? 2 : 0)}" class="hint">${d.rowKeys.length - top} autre(s) ligne(s) non affichée(s) : augmentez « Lignes affichées » ou téléchargez le CSV.</td></tr>`
          : "";
      const totalRow = `<tr class="total"><td${tableauDeBord.drillCell(i, null, null)}>Total</td>${d.colKeys
        .map((ck) => {
          const r = cellRatio(d, null, d.colVal.get(ck));
          return `<td${tableauDeBord.drillCell(i, null, ck)}>${show(d.colVal.get(ck))}${isNaN(r) ? "" : ` <span class="hint">${fmtPct(r)}</span>`}</td>`;
        })
        .join(
          "",
        )}<td${tableauDeBord.drillCell(i, null, null)}>${show(d.total)}</td>${ex ? ex.total.map((c) => `<td>${c}</td>`).join("") : ""}</tr>`;
      table = `<div class="tbl-wrap"><table><thead>${headRow}</thead><tbody>${body}${rest}${totalRow}</tbody></table></div>`;
    }
    const note =
      !tableauDeBord.ADDITIVE.has(b.measure.agg || "count") && (d.cc || true)
        ? `<p class="hint">Les totaux sont recalculés sur l'ensemble des lignes concernées${b.measure.agg === "distinct" ? " (une même valeur n'est comptée qu'une fois)" : ""}.</p>`
        : "";
    const multi =
      (d.rc && tableauDeBord.records.some((r) => Array.isArray(r[d.rc]))) ||
      (d.cc && tableauDeBord.records.some((r) => Array.isArray(r[d.cc])));
    const noteMulti = multi
      ? `<p class="hint">Une ligne ayant plusieurs valeurs dans une liste de choix est comptée dans chacune : la somme des lignes peut dépasser le total.</p>`
      : "";
    return `<div class="card" data-card="${i}" data-bi="${i}">${head}${chart}${table}${tableauDeBord.srcNote(b)}${tableauDeBord.missingColsNote(b)}${refNote(b, d)}${tableauDeBord.ADDITIVE.has(b.measure.agg || "count") ? "" : note}${noteMulti}${tableauDeBord.studio() ? "" : tableauDeBord.blockEditor(b, i)}</div>`;
  }
  // constantes de ce module utilisées ailleurs
  Object.assign(tableauDeBord, { opt, fmtPct, cellRatio, withRatio });
};
