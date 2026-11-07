/* PRISME — tableau de bord, module 09/15 : Graphiques : description commune (écran et Word), dessin SVG, cartes.
   Publie sur tableauDeBord : topOf, chartSpec, labelText, pointLabel, totalLabel, inkOn, maxValue, renderChart, mapEditor,
     pointsEditor, render, CHART_TYPES, STACK_MODES, PIE_MAX, LABEL_MODES, labelsOn, showTotals, cibleDe, colDeBloc,
     tableDeBloc, aCoordonnees, ptsTable.
   Utilise (tableauDeBord.) : ADDITIVE, EMPTY, LIGHT, MAX_SERIES, SERIES, TIP_SEP, UNKNOWN, accessLevel, attachedTo,
     baseRows, columns, config, contexte, diagError, diagSource, drillAttr, drillPt, editing, ensureRefs, fmtNum,
     fmtPct, isMainSrc, keyLabel, labelOf, mainTable, measureText, nf, opt, plain, quick, racine, records, refCache,
     refColumns, refNorm, renderCross, renderGlobal, renderQuickBar, renderStudio, renderTile, rich, saveConfig,
     showMsg, studio, svgRich, tableState, textOf.
   tableauDeBord et l'ordre des modules : voir tableau-de-bord/tableau.js. */

TableauDeBord.modules["graphiques"] = function (tableauDeBord) {
  const { esc, $ } = Outils;
  const { GEO, geoNorm, DEP_NAMES, ACA_NAMES, ACA_BY_NAME, depKey, acaKey } = window.Geo;
  // fonctions de ce module utilisées ailleurs : disponibles dès maintenant (déclarations remontées)
  Object.assign(tableauDeBord, {
    topOf,
    chartSpec,
    labelText,
    pointLabel,
    totalLabel,
    inkOn,
    maxValue,
    renderChart,
    mapEditor,
    pointsEditor,
    render,
  });
  // =============================================================================
  // Graphiques : description commune (écran + Word), puis rendu SVG
  // =============================================================================
  const CHART_TYPES = [
    ["barh", "Barres horizontales"],
    ["barv", "Colonnes (histogramme)"],
    ["line", "Courbe"],
    ["pie", "Anneau (répartition)"],
    ["map", "Carte (départements ou académies)"],
    ["points", "Carte des établissements (points)"],
  ];
  const STACK_MODES = [
    ["stack", "Séries empilées"],
    ["group", "Séries côte à côte"],
    ["pct", "Empilées à 100 %"],
  ];
  const PIE_MAX = 6;

  // Données d'un graphique : catégories (lignes du tableau croisé) et séries (colonnes)
  // Nombre de lignes à afficher : « Lignes affichées » du bloc, 0 = toutes
  function topOf(b) {
    return Number(b.top) === 0 && b.top !== undefined && b.top !== null && b.top !== ""
      ? Infinity
      : Math.max(1, Number(b.top) || 20);
  }

  function chartSpec(b, d, shownRows) {
    const agg = b.measure.agg || "count",
      additive = tableauDeBord.ADDITIVE.has(agg);
    const type = b.chart || "barh";
    let mode = d.cc ? b.stack || "stack" : "single";
    const notes = [];
    // un nombre de valeurs distinctes s'empile (chaque morceau est un compte juste) ; une moyenne, un minimum ou un maximum, non
    if (d.cc && !additive && agg !== "distinct" && mode !== "group") {
      mode = "group";
      notes.push("Séries affichées côte à côte : une moyenne, un minimum ou un maximum ne s'additionnent pas.");
    }
    // note seulement si une barre empilée dépasse vraiment le total distinct de sa ligne (valeur comptée dans plusieurs colonnes)
    if (
      d.cc &&
      agg === "distinct" &&
      mode !== "group" &&
      shownRows.some((rk) => d.colKeys.reduce((a, ck) => a + (d.val(rk, ck) || 0), 0) > (d.rowVal.get(rk) || 0))
    )
      notes.push(
        `Barres empilées : une même valeur de « ${tableauDeBord.plain(tableauDeBord.labelOf(b.measure.col || "?"))} » présente dans plusieurs colonnes compte dans chacune ; le bout d'une barre peut alors dépasser le nombre de valeurs distinctes de sa ligne (colonne Total du tableau).`,
      );
    const pctTotal = b.percent && additive && d.total ? d.total : null;
    const scale = (v) => (v === null || v === undefined || isNaN(v) ? null : pctTotal ? (v / pctTotal) * 100 : v);
    const unit = pctTotal ? " %" : "";

    if (type === "pie") {
      if (d.cc)
        return {
          error:
            "L'anneau montre une seule répartition : retirez la colonne « Colonnes » ou choisissez un autre type de graphique.",
        };
      if (!additive) return { error: "L'anneau n'a de sens que pour un nombre de lignes ou une somme." };
      const keys = d.rowKeys.filter((k) => (d.rowVal.get(k) || 0) > 0);
      const main = keys.slice(0, PIE_MAX),
        rest = keys.slice(PIE_MAX);
      const cats = main.map((k) => ({ key: k, label: tableauDeBord.keyLabel(d.rc, k, d.rg) }));
      const values = main.map((k) => scale(d.rowVal.get(k)));
      const colors = main.map((k, j) => `var(${tableauDeBord.SERIES[j]})`);
      if (rest.length) {
        cats.push({ key: "__autres", label: `Autres (${rest.length})` });
        values.push(scale(rest.reduce((a, k) => a + (d.rowVal.get(k) || 0), 0)));
        colors.push("var(--other)");
      }
      return withLabels(
        b,
        {
          type,
          mode: "single",
          cats,
          series: [
            {
              key: null,
              name: tableauDeBord.plain(tableauDeBord.measureText(b.measure)),
              color: "var(--s1)",
              values,
              colors,
            },
          ],
          unit,
          notes,
          total: scale(d.total),
        },
        additive,
        values.reduce((a, v) => a + (v || 0), 0),
        unit,
      );
    }

    // case sans ligne : 0 pour un compte (nombre de lignes, valeurs distinctes, somme) — la courbe ne s'interrompt pas
    const zeroVide = additive || agg === "distinct";
    const val0 = (rk, ck) => {
      const v = d.val(rk, ck);
      return (v === null || v === undefined || isNaN(v)) && zeroVide ? 0 : v;
    };
    // abscisse inversée : les colonnes du tableau en abscisse, ses lignes en séries (une courbe par région, par exemple)
    if (d.cc && b.swap) {
      const cats = d.colKeys.map((ck) => ({ key: ck, label: tableauDeBord.keyLabel(d.cc, ck, d.cg) }));
      const named = shownRows.slice(0, tableauDeBord.MAX_SERIES),
        others = shownRows.slice(tableauDeBord.MAX_SERIES);
      const series = named.map((rk, j) => ({
        key: rk,
        name: tableauDeBord.plain(tableauDeBord.keyLabel(d.rc, rk, d.rg)),
        color: `var(${tableauDeBord.SERIES[j]})`,
        values: d.colKeys.map((ck) => scale(val0(rk, ck))),
      }));
      if (others.length) {
        if (additive)
          series.push({
            key: "__autres",
            name: `Autres (${others.length})`,
            color: "var(--other)",
            values: d.colKeys.map((ck) => scale(others.reduce((a, rk) => a + (val0(rk, ck) || 0), 0))),
          });
        else
          notes.push(
            `${others.length} ligne(s) de plus sont dans le tableau : réduisez « Lignes affichées » ou ajoutez une condition.`,
          );
      }
      series.forEach((x) => (x.raw = x.values.slice()));
      if (mode === "pct") {
        const sums = cats.map((_, j) => series.reduce((a, x) => a + (x.values[j] || 0), 0));
        series.forEach((x) => (x.values = x.values.map((v, j) => (sums[j] ? ((v || 0) / sums[j]) * 100 : 0))));
      }
      return withLabels(
        b,
        { type, mode, cats, series, swap: true, unit: mode === "pct" ? " %" : unit, notes },
        additive,
        scale(d.total),
        unit,
      );
    }
    const catKeys = shownRows; // plus de plafond : le graphique suit « Lignes affichées »
    const cats = catKeys.map((k) => ({ key: k, label: tableauDeBord.keyLabel(d.rc, k, d.rg) }));
    let series;
    if (!d.cc)
      series = [
        {
          key: null,
          name: tableauDeBord.plain(tableauDeBord.measureText(b.measure)),
          color: "var(--s1)",
          values: catKeys.map((k) => scale(d.rowVal.get(k))),
        },
      ];
    else {
      const named = d.colKeys.filter((k) => d.colorOf.get(k) !== "var(--other)");
      const others = d.colKeys.filter((k) => d.colorOf.get(k) === "var(--other)");
      series = named.map((ck) => ({
        key: ck,
        name: tableauDeBord.plain(tableauDeBord.keyLabel(d.cc, ck, d.cg)),
        color: d.colorOf.get(ck),
        values: catKeys.map((rk) => scale(val0(rk, ck))),
      }));
      if (others.length) {
        if (additive)
          series.push({
            key: "__autres",
            name: `Autres (${others.length})`,
            color: "var(--other)",
            values: catKeys.map((rk) => scale(others.reduce((a, ck) => a + (d.val(rk, ck) || 0), 0))),
          });
        else notes.push(`${others.length} série(s) de plus sont dans le tableau.`);
      }
    }
    series.forEach((s) => (s.raw = s.values.slice())); // valeurs avant passage à 100 %, pour les étiquettes
    if (mode === "pct") {
      // chaque catégorie ramenée à 100 %
      const sums = cats.map((_, j) => series.reduce((a, s) => a + (s.values[j] || 0), 0));
      series.forEach((s) => (s.values = s.values.map((v, j) => (sums[j] ? ((v || 0) / sums[j]) * 100 : 0))));
    }
    return withLabels(
      b,
      { type, mode, cats, series, unit: mode === "pct" ? " %" : unit, notes },
      additive,
      scale(d.total),
      unit,
    );
  }

  // ---- Étiquettes de données ----
  // auto : comportement d'origine ; none : aucune ; val : valeurs ; pct : pourcentages ; both : valeur et pourcentage.
  // Pourcentage d'une barre seule = part du total du bloc (toutes les lignes, même celles non affichées) ;
  // pourcentage d'un morceau de barre (séries) = part de sa barre ; total d'une barre empilée = part du total du bloc.
  const LABEL_MODES = [
    ["auto", "Étiquettes automatiques"],
    ["none", "Sans étiquette"],
    ["val", "Étiquettes : valeurs"],
    ["pct", "Étiquettes : pourcentages"],
    ["both", "Étiquettes : valeurs et %"],
    ["valtot", "Étiquettes : valeurs, % au total"],
  ];
  const pf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
  function withLabels(b, spec, additive, grand, baseUnit) {
    spec.labels = b.labels || "auto";
    spec.baseUnit = baseUnit; // unité des valeurs brutes (« % » si « Afficher en % du total »)
    spec.grand = additive && grand > 0 ? grand : null;
    spec.shares = additive;
    spec.series.forEach((s) => {
      if (!s.raw) s.raw = s.values.slice();
    });
    if (!additive && (spec.labels === "pct" || spec.labels === "both"))
      spec.notes.push(
        "Pourcentages non affichés : une moyenne, un minimum, un maximum ou un nombre de valeurs distinctes ne se répartit pas en parts.",
      );
    return spec;
  }
  const labelsOn = (spec) => spec.labels && spec.labels !== "auto" && spec.labels !== "none";
  const catTotal = (spec, j) => spec.series.reduce((a, s) => a + Math.max(0, s.raw[j] || 0), 0);
  // texte d'une étiquette : v = valeur brute, part = pourcentage (ou null)
  // « valtot » : chaque série (colonne) porte sa valeur, le total de la barre porte son pourcentage du total ;
  // sans colonnes (une seule série), la barre est le total : valeur et pourcentage.
  function labelText(spec, v, part, as) {
    if (v === null || v === undefined || isNaN(v)) return "";
    let mode = as || spec.labels;
    if (mode === "valtot") mode = "both";
    const val = tableauDeBord.nf.format(v) + (spec.baseUnit || "");
    const already = spec.baseUnit === " %"; // valeurs déjà en % du total : pas de doublon
    const pc =
      part === null || part === undefined || isNaN(part) || !spec.shares || (already && spec.mode === "single")
        ? null
        : pf.format(part) + " %";
    if (mode === "val") return val;
    if (mode === "pct") return pc || val;
    if (mode === "both") return pc ? `${val} (${pc})` : val;
    return "";
  }
  // étiquette d'un point (série k, catégorie j)
  function pointLabel(spec, j, k) {
    const v = spec.series[k].raw[j];
    if (spec.mode === "single") return labelText(spec, v, spec.grand ? (v / spec.grand) * 100 : null);
    if (!v) return ""; // pas d'étiquette « 0 » pour une série absente de la barre
    const t = catTotal(spec, j);
    return labelText(spec, v, t ? (Math.max(0, v || 0) / t) * 100 : null, spec.labels === "valtot" ? "val" : undefined);
  }
  // étiquette du total d'une barre empilée
  function totalLabel(spec, j) {
    const t = catTotal(spec, j);
    return labelText(spec, t, spec.grand ? (t / spec.grand) * 100 : null, spec.labels === "valtot" ? "pct" : undefined);
  }
  // total au bout des barres empilées (aussi en « 100 % » quand le total porte le pourcentage)
  const showTotals = (spec) =>
    labelsOn(spec) &&
    spec.series.length > 1 &&
    (spec.mode === "stack" || (spec.mode === "pct" && spec.labels === "valtot"));
  const textW = (t, px = 7) => String(t).length * px;
  // couleur de texte lisible sur un aplat : noir ou blanc, celui qui contraste le plus
  function inkOn(color) {
    let c = String(color || "");
    const m = c.match(/var\((--[a-z0-9-]+)\)/);
    if (m)
      c = (
        getComputedStyle(document.documentElement).getPropertyValue(m[1]) ||
        tableauDeBord.LIGHT[m[1]] ||
        "#2a78d6"
      ).trim();
    const h = c.replace("#", "");
    if (h.length < 6) return "#000000";
    const lin = (x) => {
      x = parseInt(x, 16) / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    };
    const L = 0.2126 * lin(h.slice(0, 2)) + 0.7152 * lin(h.slice(2, 4)) + 0.0722 * lin(h.slice(4, 6));
    return (L + 0.05) / 0.05 >= 1.05 / (L + 0.05) ? "#000000" : "#ffffff";
  }
  const inLabel = (x, y, txt, fillColor, anchor = "middle") =>
    `<text class="val in" x="${(+x).toFixed(1)}" y="${(+y).toFixed(1)}" text-anchor="${anchor}" style="fill:${inkOn(fillColor)};font-size:9pt" pointer-events="none">${esc(txt)}</text>`;

  const fmtVal = (spec, v) =>
    v === null || v === undefined || isNaN(v) ? "–" : tableauDeBord.nf.format(v) + (spec.unit || "");

  function niceTicks(max, n = 5) {
    if (!(max > 0)) return [0, 1];
    const raw = max / n,
      p = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) || p * 10;
    const out = [];
    for (let v = 0; v <= max + step * 0.001; v += step) out.push(+v.toFixed(10));
    if (out[out.length - 1] < max) out.push(+(out[out.length - 1] + step).toFixed(10));
    return out;
  }

  function stackTotals(spec) {
    return spec.cats.map((_, j) => spec.series.reduce((a, s) => a + Math.max(0, s.values[j] || 0), 0));
  }
  function maxValue(spec) {
    if (spec.mode === "pct") return 100;
    if (spec.mode === "stack") return Math.max(0, ...stackTotals(spec));
    return Math.max(0, ...spec.series.flatMap((s) => s.values.map((v) => v || 0)));
  }

  // Barre à bout arrondi (4 px) côté valeur, carrée côté axe ; dir = "right" ou "up"
  function barPath(x0, y, w, h, fill, attrs, dir = "right") {
    if (w <= 0 || h <= 0) return "";
    let d;
    if (dir === "right") {
      const r = Math.min(4, w, h / 2);
      d = `M${x0},${y} H${x0 + w - r} Q${x0 + w},${y} ${x0 + w},${y + r} V${y + h - r} Q${x0 + w},${y + h} ${x0 + w - r},${y + h} H${x0} Z`;
    } else {
      const r = Math.min(4, h, w / 2);
      d = `M${x0},${y + h} V${y + r} Q${x0},${y} ${x0 + r},${y} H${x0 + w - r} Q${x0 + w},${y} ${x0 + w},${y + r} V${y + h} Z`;
    }
    return `<path d="${d}" fill="${fill}" ${attrs}></path>`;
  }
  const tipAttr = (a, v) => `data-tip="${esc(a)}${tableauDeBord.TIP_SEP}${esc(v)}"`;

  function legendHtml(spec) {
    if (spec.type === "pie") {
      const s = spec.series[0],
        tot = s.values.reduce((a, v) => a + (v || 0), 0);
      return `<div class="legend">${spec.cats.map((c, j) => `<span><i style="background:${s.colors[j]}"></i>${tableauDeBord.rich(c.label)} · ${esc(fmtVal(spec, s.values[j]))} (${tableauDeBord.nf.format(tot ? (s.values[j] / tot) * 100 : 0)} %)</span>`).join("")}</div>`;
    }
    if (spec.series.length < 2) return "";
    return `<div class="legend">${spec.series.map((s) => `<span><i style="background:${s.color}"></i>${tableauDeBord.rich(s.name)}</span>`).join("")}</div>`;
  }

  function renderChart(b, d, shownRows, bi) {
    if (b.chart === "map") return renderMap(b, d, bi);
    if (b.chart === "points") return renderPoints(b, d, bi);
    const spec = tableauDeBord.chartSpec(b, d, shownRows);
    spec.bi = bi;
    if (spec.error) return `<p class="hint">${esc(spec.error)}</p>`;
    const W = Math.max(320, Math.min(900, ($("blocks").clientWidth || 700) - 32));
    const svg =
      spec.type === "barh"
        ? svgBarH(spec, W)
        : spec.type === "barv"
          ? svgBarV(spec, W)
          : spec.type === "line"
            ? svgLine(spec, W)
            : svgPie(spec, W);
    const notes = spec.notes.map((n) => `<p class="hint">${esc(n)}</p>`).join("");
    return `<div class="chart">${svg}${legendHtml(spec)}${notes}</div>`;
  }
  // ---- Carte choroplèthe : une couleur par classe de valeur, du clair (peu) au foncé (beaucoup)
  const MAP_CLASSES = [
    ["quantile", "classes d'effectifs égaux (quantiles)"],
    ["equal", "classes d'amplitude égale"],
  ];
  function mapEditor(b, i) {
    const m = b.map || {},
      hasExp = b.rows && b.rows.ref && b.rows.ref.expect;
    return `<select data-b="${i}" data-k="map.level">${tableauDeBord.opt(
      [
        ["", "maille automatique"],
        ["dep", "par département"],
        ["aca", "par académie"],
      ],
      m.level || "",
    )}</select>
    <select data-b="${i}" data-k="map.metric" title="${hasExp ? "" : "Le taux demande une valeur attendue : « Compléter avec » une table de référence"}">${tableauDeBord.opt(
      hasExp
        ? [
            ["value", "couleur : valeur"],
            ["rate", "couleur : taux (valeur ÷ attendu)"],
          ]
        : [["value", "couleur : valeur"]],
      hasExp ? m.metric || "value" : "value",
    )}</select>
    <select data-b="${i}" data-k="map.classes">${tableauDeBord.opt(MAP_CLASSES, m.classes || "quantile")}</select>
    <select data-b="${i}" data-k="map.n">${tableauDeBord.opt(
      [
        ["3", "3 classes"],
        ["4", "4 classes"],
        ["5", "5 classes"],
      ],
      String(m.n || 5),
    )}</select>
    <select data-b="${i}" data-k="map.labels">${tableauDeBord.opt(
      [
        ["auto", "chiffres sur la carte"],
        ["off", "sans chiffres"],
      ],
      m.labels === "off" ? "off" : "auto",
    )}</select>
    <span class="hint">Dans Word : image. Lignes du bloc : codes ou noms de départements ou d'académies (voir « Lignes »).</span>`;
  }
  function mapLevel(b, d) {
    const m = b.map || {};
    if (m.level) return m.level;
    const g = b.rows && b.rows.grain;
    if (g === "dep_uai" || g === "dep_norm") return "dep";
    if (g === "aca_uai" || g === "aca_dep" || g === "aca_norm") return "aca";
    let nd = 0,
      na = 0;
    d.rowKeys.forEach((k) => {
      if (ACA_BY_NAME.has(geoNorm(k))) na++;
      else if (depKey(k)) nd++;
    });
    return na > nd ? "aca" : "dep";
  }
  function mapBreaks(vals, n, method) {
    const v = vals.filter((x) => x > 0 && isFinite(x)).sort((a, z) => a - z);
    if (!v.length) return [];
    const ints = v.every((x) => Number.isInteger(x));
    let br;
    if (method === "equal") {
      const step = v[v.length - 1] / n;
      br = Array.from({ length: n }, (_, j) => step * (j + 1));
    } else br = Array.from({ length: n }, (_, j) => v[Math.min(v.length - 1, Math.ceil(((j + 1) / n) * v.length) - 1)]);
    if (ints) br = br.map(Math.ceil);
    br = br.filter((x, j) => j === 0 || x > br[j - 1]);
    br[br.length - 1] = Math.max(br[br.length - 1], v[v.length - 1]);
    return br;
  }
  const RAMP = { 1: [4], 2: [2, 5], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5] };
  function renderMap(b, d, bi) {
    const level = mapLevel(b, d),
      m = b.map || {};
    const additive = tableauDeBord.ADDITIVE.has(b.measure.agg || "count") || b.measure.agg === "distinct";
    const rate = m.metric === "rate" && d.expected;
    const num = new Map(),
      den = new Map(),
      orig = new Map(),
      unmatched = [];
    d.rowKeys.forEach((rk) => {
      if (rk === tableauDeBord.EMPTY) return;
      const g = level === "dep" ? depKey(rk) : acaKey(rk);
      if (!g) {
        if ((d.rowVal.get(rk) || 0) > 0) unmatched.push(rk);
        return;
      }
      const v = d.rowVal.get(rk);
      if (!orig.has(g)) orig.set(g, rk);
      num.set(g, additive ? (num.get(g) || 0) + (v || 0) : num.has(g) ? num.get(g) : v);
      if (rate) den.set(g, (den.get(g) || 0) + (d.expected.get(rk) || 0));
    });
    const valOf = (g) => (rate ? (den.get(g) ? ((num.get(g) || 0) / den.get(g)) * 100 : NaN) : num.get(g));
    const keys = level === "dep" ? Object.keys(DEP_NAMES) : ACA_NAMES;
    const n = Math.max(3, Math.min(5, Number(m.n) || 5));
    const br = mapBreaks(keys.map(valOf), n, m.classes || "quantile"),
      ramp = RAMP[br.length] || [];
    const ints =
      !rate &&
      keys.every((k) => {
        const v = valOf(k);
        return v === undefined || isNaN(v) || Number.isInteger(v);
      });
    const classOf = (v) => (v === undefined || isNaN(v) || v <= 0 ? -1 : br.findIndex((t) => v <= t));
    const colorOf = (v) => {
      const c = classOf(v);
      return c < 0 ? "var(--q0)" : `var(--q${ramp[c] || 5})`;
    };
    const fmt = (v) => (rate ? tableauDeBord.fmtPct(v) : tableauDeBord.fmtNum(v));
    const W = Math.max(320, Math.min(760, ($("blocks").clientWidth || 700) - 32)),
      k = W / GEO.w,
      H = Math.round(GEO.h * k);
    const name = (g) =>
      level === "dep" ? `${g} · ${DEP_NAMES[g]}` : `Académie ${/^[AEIOUÉ]/.test(g) ? "d'" : "de "}${g}`;
    const tipTxt = (g) => {
      const v = valOf(g);
      if (v === undefined || isNaN(v)) return rate ? "aucune valeur attendue" : "0";
      return rate
        ? `${tableauDeBord.fmtPct(v)} (${tableauDeBord.fmtNum(num.get(g) || 0)} sur ${tableauDeBord.fmtNum(den.get(g) || 0)})`
        : tableauDeBord.fmtNum(v);
    };
    let shapes = "",
      lines = "",
      labels = "";
    const layer = level === "dep" ? GEO.dep : GEO.aca;
    layer.forEach((e) => {
      const v = valOf(e.k),
        rk = orig.get(e.k);
      shapes += `<path d="${e.d}" fill="${colorOf(v)}" stroke="var(--surface)" stroke-width="${(0.8 / k).toFixed(2)}" stroke-linejoin="round" ${tipAttr(name(e.k), tipTxt(e.k))}${rk !== undefined ? tableauDeBord.drillAttr(bi, rk, null) : ""}></path>`;
    });
    if (level === "dep")
      GEO.aca.forEach(
        (e) =>
          (lines += `<path d="${e.d}" fill="none" stroke="var(--ink-2)" stroke-width="${(1 / k).toFixed(2)}" stroke-linejoin="round" pointer-events="none" opacity=".7"></path>`),
      );
    const showLabels = m.labels !== "off";
    if (showLabels)
      layer.forEach((e) => {
        if (e.x === undefined || (e.i === "metro" && ["Paris", "75", "92", "93", "94"].includes(e.k))) return; // trop petits : chiffre dans l'encart
        let v = valOf(e.k);
        if (rate && (v === undefined || isNaN(v))) {
          if (!den.get(e.k)) return;
          v = 0;
        }
        if (v === undefined || isNaN(v)) v = 0; // zone sans valeur : étiquette « 0 »
        labels += `<text class="val" x="${(e.x * k).toFixed(1)}" y="${(e.y * k + 4).toFixed(1)}" text-anchor="middle" style="fill:${inkOn(colorOf(v))};font-size:${level === "aca" ? "9pt" : "7.5pt"}" pointer-events="none">${esc(rate ? tableauDeBord.nf.format(Math.round(v)) + " %" : tableauDeBord.fmtNum(v))}</text>`;
      });
    const frames = GEO.frames
      .map(
        (
          f,
        ) => `<rect x="${(f.x * k).toFixed(1)}" y="${(f.y * k).toFixed(1)}" width="${(f.w * k).toFixed(1)}" height="${(f.h * k).toFixed(1)}" fill="none" stroke="var(--axis)" stroke-width="1" rx="3"></rect>
    <text x="${(f.x * k + 4).toFixed(1)}" y="${(f.y * k + 11).toFixed(1)}" style="font-size:7.5pt">${esc(f.t)}</text>`,
      )
      .join("");
    const svg = svgWrap(
      W,
      H,
      `<g transform="scale(${k.toFixed(5)})">${shapes}${lines}</g>${frames}${labels}`,
      "Carte " + (level === "dep" ? "par département" : "par académie"),
    );
    // légende : une case par classe, plus « aucun »
    let prev = 0;
    const items = br.map((t, j) => {
      const lo = ints ? Math.floor(prev) + 1 : prev,
        txt =
          j === 0 && !ints
            ? `jusqu'à ${fmt(t)}`
            : lo >= t
              ? fmt(t)
              : `${ints ? tableauDeBord.fmtNum(lo) : fmt(lo)} – ${fmt(t)}`;
      prev = t;
      return `<span><i style="background:var(--q${ramp[j]})"></i>${esc(txt)}</span>`;
    });
    items.unshift(`<span><i style="background:var(--q0)"></i>${rate ? "0 ou sans attendu" : "0"}</span>`);
    if (rate) items.unshift(`<span><i style="background:transparent"></i>Taux :</span>`);
    const what = rate ? "Taux : valeur ÷ attendu" : tableauDeBord.plain(tableauDeBord.measureText(b.measure));
    const notes = [];
    const unk = unmatched.filter((x) => x === tableauDeBord.UNKNOWN),
      other = unmatched.filter((x) => x !== tableauDeBord.UNKNOWN);
    if (unk.length)
      notes.push(
        `${tableauDeBord.fmtNum(d.rowVal.get(tableauDeBord.UNKNOWN))} sans ${level === "dep" ? "département" : "académie"} reconnu(e) (valeur vide ou mal formée) : non placé(s) sur la carte.`,
      );
    if (other.length)
      notes.push(
        `${other.length} valeur(s) non placée(s) sur la carte : ${other.slice(0, 6).join(", ")}${other.length > 6 ? "…" : ""}. Réglez « Lignes » sur « département (code ou nom) », « académie (nom) » ou une valeur déduite de l'UAI.`,
      );
    if (d.cc) notes.push("La carte montre le total de chaque ligne ; les colonnes restent visibles dans le tableau.");
    return `<div class="chart map">${svg}<div class="legend" title="${esc(what)}">${items.join("")}</div>${notes.map((t) => `<p class="hint">${esc(t)}</p>`).join("")}</div>`;
  }
  // ---- Carte des établissements : un point par ligne du bloc, placé d'après la latitude et la longitude du référentiel ----
  const cibleDe = (type) => (/^Ref:(.+)$/.exec(type || "") || [])[1] || "";
  const colDeBloc = (b, col) =>
    col
      ? tableauDeBord
          .refColumns(tableauDeBord.isMainSrc(b) ? tableauDeBord.mainTable : b.source)
          .find((c) => c.id === col)
      : null;
  const SELF = "__self"; // coordonnées lues dans la table du bloc (colonnes Latitude et Longitude recopiées de l'établissement)
  const tableDeBloc = (b) => (tableauDeBord.isMainSrc(b) ? tableauDeBord.mainTable : b.source);
  const aCoordonnees = (table) => {
    const rc = tableauDeBord.refColumns(table);
    return rc.some((c) => /^lat/i.test(c.id)) && rc.some((c) => /^(lon|lng)/i.test(c.id));
  };
  // où lire les coordonnées : table choisie dans le bloc ; sinon celle que vise la colonne des lignes (référence) ;
  // sinon la table du bloc elle-même si elle a des colonnes de latitude et de longitude (lignes par UAI, par exemple)
  function ptsMode(b) {
    const p = b.pts || {};
    if (p.table) return p.table;
    const c = colDeBloc(b, b.rows && b.rows.col),
      cible = c ? cibleDe(c.type) : "";
    return cible || (aCoordonnees(tableDeBloc(b)) ? SELF : "");
  }
  const ptsTable = (b) => {
    const m = ptsMode(b);
    return m === SELF ? "" : m;
  }; // table à lire en plus des données du bloc
  function ptsCols(b) {
    const p = b.pts || {},
      mode = ptsMode(b),
      self = mode === SELF,
      table = self ? tableDeBloc(b) : mode;
    const rc = tableauDeBord.refColumns(table),
      a = (id) => (id && rc.some((c) => c.id === id) ? id : "");
    const find = (re) => (rc.find((c) => re.test(c.id)) || rc.find((c) => re.test(c.label)) || {}).id || "";
    const lignes = colDeBloc(b, b.rows && b.rows.col),
      parRef = !self && !!lignes && cibleDe(lignes.type) === table;
    return {
      table,
      self,
      parRef,
      key: self
        ? (b.rows && b.rows.col) || ""
        : parRef
          ? "id"
          : a(p.key) || find(/^(uai|code_?uai|numero_?uai|identifiant)/i),
      lat: a(p.lat) || find(/^lat/i),
      lon: a(p.lon) || find(/^(lon|lng)/i),
      name: a(p.name) || (self ? find(/^nom_?etab/i) : find(/^(nom|appellation|libell|d[ée]nomination)/i)),
    };
  }
  function pointsEditor(b, i) {
    const p = b.pts || {},
      P = ptsCols(b),
      rc = tableauDeBord.refColumns(P.table),
      auto = ptsMode({ ...b, pts: {} });
    const cols = (k, val, vide) =>
      `<select data-b="${i}" data-k="pts.${k}">${tableauDeBord.opt([["", vide], ...rc.map((c) => [c.id, c.label])], val || "")}</select>`;
    return `<select data-b="${i}" data-k="pts.table" title="Table qui porte les coordonnées des établissements">${tableauDeBord.opt([["", auto === SELF ? "coordonnées : cette table" : auto ? `établissements : ${auto}` : "Table des établissements…"], ...(aCoordonnees(tableDeBloc(b)) ? [[SELF, "Coordonnées de cette table"]] : []), ...tableauDeBord.refTables().map((t) => [t, "Table " + t])], p.table || "")}</select>
    ${P.table && !P.parRef && !P.self ? cols("key", p.key || P.key, "Correspondance avec les lignes…") : ""}
    ${P.table ? `${cols("lat", p.lat || P.lat, "Latitude…")}${cols("lon", p.lon || P.lon, "Longitude…")}${cols("name", p.name || P.name, "Nom affiché : valeur de la ligne")}` : ""}
    <select data-b="${i}" data-k="pts.size">${tableauDeBord.opt(
      [
        ["value", "taille : selon la valeur"],
        ["fixed", "taille fixe"],
      ],
      p.size || "value",
    )}</select>
    <select data-b="${i}" data-k="pts.color">${tableauDeBord.opt(
      [
        ["classes", "couleur : classes de valeur"],
        ["unie", "couleur unie"],
      ],
      p.color || "classes",
    )}</select>
    <span class="hint">Lignes du bloc : la colonne de l'établissement${P.self ? " (UAI, par exemple) ; coordonnées lues sur les lignes de cette table" : P.parRef ? " (référence : coordonnées lues dans « " + esc(P.table) + " »)" : " ; choisissez la colonne du référentiel qui lui correspond (UAI…)"}. Dans Word : image.</span>`;
  }
  function renderPoints(b, d, bi) {
    const p = b.pts || {},
      P = ptsCols(b),
      G = window.Geo;
    const msg = (t) => `<div class="chart"><p class="hint">${esc(t)}</p></div>`;
    if (!P.table)
      return msg(
        "Carte des établissements : choisissez la table des établissements (réglage « Graphique »), ou prenez pour lignes la colonne de l'établissement.",
      );
    let data;
    if (P.self) {
      // lignes de la table du bloc, en colonnes
      data = {};
      [P.key, P.lat, P.lon, P.name].filter(Boolean).forEach((k) => {
        data[k] = tableauDeBord.records.map((r) => r[k]);
      });
    } else {
      const c = tableauDeBord.refCache.get(P.table);
      if (!c || !c.data)
        return msg(
          c && c.error ? `Table « ${P.table} » illisible : ${c.error}` : "Lecture de la table des établissements…",
        );
      data = c.data;
    }
    if (!P.lat || !P.lon)
      return msg(
        `La table « ${P.table} » n'a pas de colonnes de latitude et de longitude reconnues : choisissez-les dans le réglage « Graphique ».`,
      );
    if (!P.key) return msg("Choisissez la colonne du référentiel qui correspond aux lignes du bloc.");
    const idx = new Map(),
      coord = (j) => isFinite(G.nombre(data[P.lat][j])) && isFinite(G.nombre(data[P.lon][j]));
    if (P.key === "id")
      (data.id || []).forEach((id, j) => {
        idx.set(tableauDeBord.refNorm(String(id)), j);
        idx.set(tableauDeBord.refNorm(tableauDeBord.textOf(id)), j);
      });
    else
      (data[P.key] || []).forEach((v, j) => {
        // première ligne qui a des coordonnées
        (Array.isArray(v) ? (v[0] === "L" ? v.slice(1) : v) : [v]).forEach((x) => {
          const t = tableauDeBord.textOf(x);
          if (
            t !== null &&
            (!idx.has(tableauDeBord.refNorm(t)) || (!coord(idx.get(tableauDeBord.refNorm(t))) && coord(j)))
          )
            idx.set(tableauDeBord.refNorm(t), j);
        });
      });
    const pts = [];
    let sansRef = 0,
      sansCoord = 0;
    d.rowKeys.forEach((rk) => {
      if (rk === tableauDeBord.EMPTY) return;
      const v = d.rowVal.get(rk) || 0;
      if (!(v > 0)) return;
      const j = idx.get(tableauDeBord.refNorm(rk));
      if (j === undefined) {
        sansRef++;
        return;
      }
      const pos = G.placer(data[P.lat][j], data[P.lon][j]);
      if (!pos) {
        sansCoord++;
        return;
      }
      pts.push({ rk, v, pos, nom: (P.name && tableauDeBord.textOf(data[P.name][j])) || rk });
    });
    const W = Math.max(320, Math.min(760, ($("blocks").clientWidth || 700) - 32)),
      k = W / GEO.w,
      H = Math.round(GEO.h * k);
    const max = Math.max(0, ...pts.map((x) => x.v)) || 1;
    const n = 4,
      br =
        p.color === "unie"
          ? []
          : mapBreaks(
              pts.map((x) => x.v),
              n,
              "quantile",
            ),
      ramp = { 1: [4], 2: [3, 5], 3: [2, 4, 5], 4: [2, 3, 4, 5] }[br.length] || [];
    const couleur = (v) =>
      !br.length
        ? "var(--s1)"
        : `var(--q${
            ramp[
              Math.max(
                0,
                br.findIndex((t) => v <= t),
              )
            ] || 5
          })`;
    const ints = pts.every((x) => Number.isInteger(x.v));
    const rayon = (v) => (p.size === "fixed" ? 4 : 2.5 + 11 * Math.sqrt(v / max));
    const parisK = 1; // l'encart de Paris est déjà agrandi dans le fond
    let ronds = "";
    [...pts]
      .sort((x, y) => y.v - x.v)
      .forEach((x) => {
        const att = `fill="${couleur(x.v)}" fill-opacity=".85" stroke="var(--surface)" stroke-width="1" style="cursor:pointer" ${tipAttr(x.nom, tableauDeBord.fmtNum(x.v))}${tableauDeBord.drillAttr(bi, x.rk, null)}`;
        ronds += `<circle cx="${(x.pos.x * k).toFixed(1)}" cy="${(x.pos.y * k).toFixed(1)}" r="${rayon(x.v).toFixed(1)}" ${att}></circle>`;
        if (x.pos.paris)
          ronds += `<circle cx="${(x.pos.paris.x * k).toFixed(1)}" cy="${(x.pos.paris.y * k).toFixed(1)}" r="${(rayon(x.v) * parisK).toFixed(1)}" ${att}></circle>`;
      });
    const fond = G.fondSvg(k, { fond: "var(--q0)", trait: "var(--surface)", traitAcademie: "var(--axis)" }).replace(
      /<title>[^<]*<\/title>/g,
      "",
    );
    const frames = GEO.frames
      .map(
        (
          f,
        ) => `<rect x="${(f.x * k).toFixed(1)}" y="${(f.y * k).toFixed(1)}" width="${(f.w * k).toFixed(1)}" height="${(f.h * k).toFixed(1)}" fill="none" stroke="var(--axis)" stroke-width="1" rx="3"></rect>
    <text x="${(f.x * k + 4).toFixed(1)}" y="${(f.y * k + 11).toFixed(1)}" style="font-size:7.5pt">${esc(f.t)}</text>`,
      )
      .join("");
    const svg = svgWrap(W, H, `${fond}${frames}${ronds}`, "Carte des établissements");
    let prev = 0;
    const items = br.length
      ? br.map((t, j) => {
          const lo = ints ? Math.floor(prev) + 1 : prev,
            txt = lo >= t ? tableauDeBord.fmtNum(t) : `${tableauDeBord.fmtNum(lo)} – ${tableauDeBord.fmtNum(t)}`;
          prev = t;
          return `<span><i style="background:var(--q${ramp[j]})"></i>${esc(txt)}</span>`;
        })
      : [
          `<span><i style="background:var(--s1)"></i>${esc(tableauDeBord.plain(tableauDeBord.measureText(b.measure)))}</span>`,
        ];
    const notes = [
      `${tableauDeBord.fmtNum(pts.length)} établissement(s) sur la carte${p.size === "fixed" ? "" : ` ; taille des points selon la valeur (jusqu'à ${tableauDeBord.fmtNum(max)})`}.`,
    ];
    if (sansRef)
      notes.push(
        `${tableauDeBord.fmtNum(sansRef)} ligne(s) introuvable(s) dans « ${P.table} »${P.parRef ? "" : ` (colonne « ${P.key} »)`} : non placée(s).`,
      );
    if (sansCoord)
      notes.push(`${tableauDeBord.fmtNum(sansCoord)} établissement(s) sans coordonnées utilisables : non placé(s).`);
    if (d.cc) notes.push("La carte montre le total de chaque ligne ; les colonnes restent visibles dans le tableau.");
    return `<div class="chart map points">${svg}<div class="legend" title="${esc(tableauDeBord.plain(tableauDeBord.measureText(b.measure)))}">${items.join("")}</div>${notes.map((t) => `<p class="hint">${esc(t)}</p>`).join("")}</div>`;
  }
  const svgWrap = (W, H, inner, label) =>
    `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="width:${W}px;max-width:100%" role="img" aria-label="${esc(label || "")}">${inner}</svg>`;

  function svgBarH(spec, W) {
    const on = labelsOn(spec),
      nS = spec.series.length,
      grouped = spec.mode === "group" && nS > 1;
    // place à droite pour l'étiquette la plus longue
    const tipTexts = !on
      ? []
      : spec.cats
          .map((_, j) =>
            nS === 1 || grouped
              ? spec.series.map((_, k) => pointLabel(spec, j, k))
              : showTotals(spec)
                ? [totalLabel(spec, j)]
                : [],
          )
          .flat();
    const labelW = Math.min(200, Math.round(W * 0.3)),
      valW = on ? Math.max(40, Math.min(150, Math.max(0, ...tipTexts.map((t) => textW(t))) + 14)) : 64,
      plotW = W - labelW - valW;
    const barH = grouped ? (on ? 14 : Math.max(6, Math.min(12, Math.floor(40 / nS)))) : 18;
    const band = grouped ? nS * (barH + 2) + 10 : barH + 10;
    const max = maxValue(spec) || 1,
      H = spec.cats.length * band + 4;
    const x = (v) => (Math.max(0, v || 0) / max) * plotW;
    const totals = stackTotals(spec);
    let m = `<line x1="${labelW}" x2="${labelW}" y1="0" y2="${H}" stroke="var(--axis)" stroke-width="1"></line>`;
    const maxChars = Math.max(10, Math.floor((labelW - 12) / 7.3));
    spec.cats.forEach((c, j) => {
      const y = j * band + 2,
        bh = grouped ? nS * (barH + 2) - 2 : barH;
      m += `<text x="${labelW - 8}" y="${y + bh / 2 + 4}" text-anchor="end"><title>${esc(tableauDeBord.plain(c.label))}</title>${tableauDeBord.svgRich(c.label, maxChars)}</text>`;
      if (nS === 1 || grouped) {
        spec.series.forEach((s, k) => {
          const yy = grouped ? y + k * (barH + 2) : y;
          m += barPath(
            labelW,
            yy,
            x(s.values[j]),
            barH,
            s.color,
            tipAttr(`${c.label}${nS > 1 ? " · " + s.name : ""}`, fmtVal(spec, s.values[j])) +
              tableauDeBord.drillPt(spec, c.key, s.key),
          );
        });
        if (on)
          spec.series.forEach((s, k) => {
            const yy = grouped ? y + k * (barH + 2) : y,
              t = pointLabel(spec, j, k);
            if (t)
              m += `<text class="val" x="${labelW + x(s.values[j]) + 6}" y="${yy + barH / 2 + 4}"${grouped ? ' style="font-size:9pt"' : ""}>${esc(t)}</text>`;
          });
        else if (nS === 1 && spec.labels !== "none")
          m += `<text class="val" x="${labelW + x(spec.series[0].values[j]) + 6}" y="${y + barH / 2 + 4}">${esc(fmtVal(spec, spec.series[0].values[j]))}</text>`;
      } else {
        const vis = spec.series.map((s, k) => [s, s.values[j] || 0, k]).filter((e) => e[1] > 0);
        let acc = 0;
        vis.forEach(([s, v, k], n) => {
          const x0 = labelW + x(acc),
            w = x(acc + v) - x(acc),
            last = n === vis.length - 1,
            w2 = Math.max(0, last ? w : w - 2);
          const t = tipAttr(`${c.label} · ${s.name}`, fmtVal(spec, v)) + tableauDeBord.drillPt(spec, c.key, s.key);
          m += last
            ? barPath(x0, y, w2, barH, s.color, t)
            : `<rect x="${x0.toFixed(1)}" y="${y}" width="${w2.toFixed(1)}" height="${barH}" fill="${s.color}" ${t}></rect>`;
          if (on) {
            const lt = pointLabel(spec, j, k);
            if (lt && textW(lt, 6.2) + 6 <= w2) m += inLabel(x0 + w2 / 2, y + barH / 2 + 4, lt, s.color);
          }
          acc += v;
        });
        if (on ? showTotals(spec) : spec.mode !== "pct" && spec.labels !== "none")
          m += `<text class="val" x="${labelW + x(totals[j]) + 6}" y="${y + barH / 2 + 4}">${esc(on ? totalLabel(spec, j) : fmtVal(spec, totals[j]))}</text>`;
      }
    });
    return svgWrap(W, H, m);
  }

  // axe vertical commun aux colonnes et aux courbes
  function yAxis(spec, left, top, plotW, plotH) {
    const ticks = niceTicks(maxValue(spec)),
      max = ticks[ticks.length - 1] || 1;
    const y = (v) => top + plotH - (Math.max(0, v || 0) / max) * plotH;
    let m = "";
    ticks.forEach((t) => {
      m += `<line x1="${left}" x2="${left + plotW}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" stroke="${t === 0 ? "var(--axis)" : "var(--grid)"}" stroke-width="1"></line>`;
      m += `<text x="${left - 6}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end">${esc(tableauDeBord.nf.format(t))}${spec.unit ? esc(spec.unit) : ""}</text>`;
    });
    return { m, y };
  }
  function xLabels(spec, left, bandW, top) {
    const n = spec.cats.length,
      rotate = n > 6 || spec.cats.some((c) => tableauDeBord.plain(c.label).length * 7.3 > bandW - 4);
    const maxChars = rotate ? 22 : Math.max(4, Math.floor((bandW - 4) / 7.3));
    const every = Math.max(1, Math.ceil(n / 24));
    return spec.cats
      .map((c, j) => {
        if (j % every) return "";
        const cx = left + j * bandW + bandW / 2;
        return rotate
          ? `<text transform="translate(${cx.toFixed(1)},${top + 10}) rotate(-40)" text-anchor="end"><title>${esc(tableauDeBord.plain(c.label))}</title>${tableauDeBord.svgRich(c.label, maxChars)}</text>`
          : `<text x="${cx.toFixed(1)}" y="${top + 16}" text-anchor="middle"><title>${esc(tableauDeBord.plain(c.label))}</title>${tableauDeBord.svgRich(c.label, maxChars)}</text>`;
      })
      .join("");
  }
  const xBand = (spec) =>
    spec.cats.length > 6 || spec.cats.some((c) => tableauDeBord.plain(c.label).length > 12) ? 96 : 30;

  function svgBarV(spec, W) {
    const on = labelsOn(spec),
      left = 52,
      right = 12,
      plotH = 220,
      bottomH = xBand(spec),
      plotW = W - left - right;
    const n = spec.cats.length,
      bandW = plotW / Math.max(1, n),
      nS = spec.series.length,
      grouped = spec.mode === "group" && nS > 1;
    const colW = Math.min(on ? 48 : 24, grouped ? Math.max(3, (bandW * 0.8 - (nS - 1) * 2) / nS) : bandW * 0.62);
    // étiquettes au-dessus des colonnes : à la verticale si elles débordent de la colonne
    const capTexts = !on
      ? []
      : spec.cats
          .map((_, j) =>
            nS === 1 || grouped
              ? spec.series.map((_, k) => pointLabel(spec, j, k))
              : showTotals(spec)
                ? [totalLabel(spec, j)]
                : [],
          )
          .flat();
    const slot = grouped ? colW + 2 : bandW,
      longest = Math.max(0, ...capTexts.map((t) => textW(t, 6.6)));
    const vertical = on && longest > slot - 2,
      top = vertical ? 12 + longest : 16;
    const cap = (cx, yv, t, small) =>
      !t
        ? ""
        : vertical
          ? `<text class="val" transform="translate(${(cx + 4).toFixed(1)},${(yv - 5).toFixed(1)}) rotate(-90)" text-anchor="start" style="font-size:9pt">${esc(t)}</text>`
          : `<text class="val" x="${cx.toFixed(1)}" y="${(yv - 5).toFixed(1)}" text-anchor="middle"${small ? ' style="font-size:9pt"' : ""}>${esc(t)}</text>`;
    const ax = yAxis(spec, left, top, plotW, plotH),
      totals = stackTotals(spec);
    let m = ax.m;
    spec.cats.forEach((c, j) => {
      const x0 = left + j * bandW + bandW / 2;
      if (nS === 1 || grouped) {
        const groupW = grouped ? nS * colW + (nS - 1) * 2 : colW;
        spec.series.forEach((s, k) => {
          const xx = x0 - groupW / 2 + (grouped ? k * (colW + 2) : 0),
            yy = ax.y(s.values[j]);
          m += barPath(
            xx,
            yy,
            colW,
            top + plotH - yy,
            s.color,
            tipAttr(`${c.label}${nS > 1 ? " · " + s.name : ""}`, fmtVal(spec, s.values[j])) +
              tableauDeBord.drillPt(spec, c.key, s.key),
            "up",
          );
        });
        if (on)
          spec.series.forEach((s, k) => {
            const xx = x0 - groupW / 2 + (grouped ? k * (colW + 2) : 0);
            m += cap(xx + colW / 2, ax.y(s.values[j]), pointLabel(spec, j, k), grouped);
          });
        else if (nS === 1 && n <= 16 && spec.labels !== "none")
          m += `<text class="val" x="${x0.toFixed(1)}" y="${(ax.y(spec.series[0].values[j]) - 5).toFixed(1)}" text-anchor="middle">${esc(fmtVal(spec, spec.series[0].values[j]))}</text>`;
      } else {
        const vis = spec.series.map((s, k) => [s, s.values[j] || 0, k]).filter((e) => e[1] > 0);
        let acc = 0;
        vis.forEach(([s, v, sk], k) => {
          const yTop = ax.y(acc + v),
            yBot = ax.y(acc),
            last = k === vis.length - 1,
            h = Math.max(0, last ? yBot - yTop : yBot - yTop - 2);
          const t = tipAttr(`${c.label} · ${s.name}`, fmtVal(spec, v)) + tableauDeBord.drillPt(spec, c.key, s.key);
          m += last
            ? barPath(x0 - colW / 2, yTop, colW, h, s.color, t, "up")
            : `<rect x="${(x0 - colW / 2).toFixed(1)}" y="${(yTop + 2).toFixed(1)}" width="${colW.toFixed(1)}" height="${h.toFixed(1)}" fill="${s.color}" ${t}></rect>`;
          if (on) {
            const lt = pointLabel(spec, j, sk);
            if (lt && h >= 14 && textW(lt, 6.2) + 4 <= colW)
              m += inLabel(x0, (last ? yTop : yTop + 2) + h / 2 + 4, lt, s.color);
          }
          acc += v;
        });
        if (on) {
          if (showTotals(spec)) m += cap(x0, ax.y(totals[j]), totalLabel(spec, j));
        } else if (spec.mode !== "pct" && n <= 16 && spec.labels !== "none")
          m += `<text class="val" x="${x0.toFixed(1)}" y="${(ax.y(totals[j]) - 5).toFixed(1)}" text-anchor="middle">${esc(fmtVal(spec, totals[j]))}</text>`;
      }
    });
    m += xLabels(spec, left, bandW, top + plotH);
    return svgWrap(W, top + plotH + bottomH, m);
  }

  function svgLine(spec, W) {
    const on = labelsOn(spec),
      left = 52,
      right = 16,
      plotH = 220,
      bottomH = xBand(spec),
      plotW = W - left - right;
    const n = spec.cats.length,
      bandW = plotW / Math.max(1, n);
    const ptTexts = !on ? [] : spec.series.flatMap((s, k) => spec.cats.map((_, j) => pointLabel(spec, j, k)));
    const longest = Math.max(0, ...ptTexts.map((t) => textW(t, 6.6))),
      vertical = on && longest > bandW - 2,
      top = vertical ? 16 + longest : on ? 22 : 16;
    // une courbe n'empile pas : en mode « 100 % » on garde les parts, sinon les valeurs brutes
    const lineSpec = { ...spec, mode: spec.mode === "pct" ? "pct" : "group" };
    const ax = yAxis(lineSpec, left, top, plotW, plotH);
    let m = ax.m;
    const X = (j) => left + j * bandW + bandW / 2;
    spec.series.forEach((s) => {
      const pts = s.values.map((v, j) => (v === null || isNaN(v) ? null : [X(j), ax.y(v)]));
      let dPath = "",
        pen = false;
      pts.forEach((p) => {
        if (!p) {
          pen = false;
          return;
        }
        dPath += (pen ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1);
        pen = true;
      });
      m += `<path d="${dPath}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></path>`;
    });
    spec.series.forEach((s) =>
      s.values.forEach((v, j) => {
        if (v === null || isNaN(v)) return;
        const cx = X(j).toFixed(1),
          cy = ax.y(v).toFixed(1),
          t =
            tipAttr(`${spec.cats[j].label}${spec.series.length > 1 ? " · " + s.name : ""}`, fmtVal(spec, v)) +
            tableauDeBord.drillPt(spec, spec.cats[j].key, s.key);
        m += `<circle cx="${cx}" cy="${cy}" r="12" fill="transparent" ${t}></circle><circle cx="${cx}" cy="${cy}" r="4" fill="${s.color}" stroke="var(--surface)" stroke-width="2" ${t}></circle>`;
      }),
    );
    if (on)
      spec.series.forEach((s, k) =>
        s.values.forEach((v, j) => {
          // une étiquette par point
          const t = pointLabel(spec, j, k);
          if (!t || v === null || isNaN(v)) return;
          const cx = X(j),
            cy = ax.y(v);
          m += vertical
            ? `<text class="val" transform="translate(${(cx + 4).toFixed(1)},${(cy - 9).toFixed(1)}) rotate(-90)" text-anchor="start" style="font-size:9pt">${esc(t)}</text>`
            : `<text class="val" x="${cx.toFixed(1)}" y="${(cy - 10).toFixed(1)}" text-anchor="middle" style="font-size:9pt">${esc(t)}</text>`;
        }),
      );
    else if (spec.series.length === 1 && spec.labels !== "none") {
      // automatique : étiquette sur le dernier point seulement
      const s = spec.series[0],
        j = s.values
          .map((v, k) => (v === null || isNaN(v) ? -1 : k))
          .filter((k) => k >= 0)
          .pop();
      if (j !== undefined)
        m += `<text class="val" x="${X(j).toFixed(1)}" y="${(ax.y(s.values[j]) - 10).toFixed(1)}" text-anchor="middle">${esc(fmtVal(spec, s.values[j]))}</text>`;
    }
    m += xLabels(spec, left, bandW, top + plotH);
    return svgWrap(W, top + plotH + bottomH, m);
  }

  function svgPie(spec, W) {
    const size = 220,
      R = 100,
      r = 58,
      cx = size / 2,
      cy = size / 2,
      s = spec.series[0];
    const tot = s.values.reduce((a, v) => a + (v || 0), 0) || 1;
    let a0 = -Math.PI / 2,
      m = "";
    const gap = spec.cats.length > 1 ? 0.012 : 0; // fin liseré de séparation entre parts
    s.values.forEach((v, j) => {
      const a1 = a0 + ((v || 0) / tot) * Math.PI * 2;
      const s0 = a0 + gap,
        s1 = Math.max(s0, a1 - gap),
        large = s1 - s0 > Math.PI ? 1 : 0;
      const p = (ang, rad) => `${(cx + rad * Math.cos(ang)).toFixed(2)},${(cy + rad * Math.sin(ang)).toFixed(2)}`;
      const dPath =
        s1 - s0 >= Math.PI * 2 - 0.001
          ? `M${cx - R},${cy} a${R},${R} 0 1,0 ${2 * R},0 a${R},${R} 0 1,0 ${-2 * R},0 M${cx - r},${cy} a${r},${r} 0 1,1 ${2 * r},0 a${r},${r} 0 1,1 ${-2 * r},0 Z`
          : `M${p(s0, R)} A${R},${R} 0 ${large},1 ${p(s1, R)} L${p(s1, r)} A${r},${r} 0 ${large},0 ${p(s0, r)} Z`;
      m += `<path d="${dPath}" fill="${s.colors[j]}" fill-rule="evenodd" ${tipAttr(spec.cats[j].label, `${fmtVal(spec, v)} (${tableauDeBord.nf.format((v / tot) * 100)} %)`)}${tableauDeBord.drillAttr(spec.bi, spec.cats[j].key, null)}></path>`;
      if (labelsOn(spec) && v > 0) {
        // étiquette au milieu de la part, si elle y tient
        const mid = (a0 + a1) / 2,
          rm = (R + r) / 2,
          arc = (a1 - a0) * rm,
          part = (v / tot) * 100;
        const vt = tableauDeBord.nf.format(v) + (spec.baseUnit || ""),
          pt = pf.format(part) + " %";
        const lines = spec.labels === "val" || spec.baseUnit === " %" ? [vt] : spec.labels === "pct" ? [pt] : [vt, pt]; // « valtot » : valeur et %
        const lx = cx + rm * Math.cos(mid),
          ly = cy + rm * Math.sin(mid),
          need = Math.max(...lines.map((t) => textW(t, 6.2))) + 4;
        if (arc >= need || (lines.length === 1 && arc >= 22 && need <= R - r))
          lines.forEach((t, li) => (m += inLabel(lx, ly + 4 + (li - (lines.length - 1) / 2) * 13, t, s.colors[j])));
      }
      a0 = a1;
    });
    m += `<text class="val" x="${cx}" y="${cy + 2}" text-anchor="middle" style="font-size:18px;font-weight:600">${esc(fmtVal(spec, tot))}</text>`;
    m += `<text x="${cx}" y="${cy + 20}" text-anchor="middle">au total</text>`;
    return svgWrap(size, size, m);
  }

  function renderDiagOnly() {
    const el = $("diag");
    if (!el) return;
    el.textContent = `Diagnostic : accès « ${tableauDeBord.accessLevel || "inconnu"} » · ${tableauDeBord.records.length} ligne(s) · ${tableauDeBord.columns.length} colonne(s) · source : ${tableauDeBord.diagSource} · copie de sécurité : ${tableauDeBord.tableState}${tableauDeBord.diagError ? " · erreur : " + tableauDeBord.diagError : ""}`;
  }

  function render() {
    // ancien réglage global des colonnes du détail : recopié dans chaque bloc qui n'a pas le sien, puis supprimé
    if (tableauDeBord.config.detailCols) {
      const legacy = tableauDeBord.config.detailCols;
      delete tableauDeBord.config.detailCols;
      if (legacy.length)
        tableauDeBord.config.blocks.forEach((b) => {
          if (!b.detailCols || !b.detailCols.length) b.detailCols = legacy.slice();
        });
      tableauDeBord.saveConfig();
    }
    tableauDeBord.racine.classList.toggle("editing", tableauDeBord.editing);
    tableauDeBord.racine.classList.toggle("lecture", tableauDeBord.contexte.mode !== "edition");
    $("toggleEdit").textContent = tableauDeBord.editing ? "Terminer les modifications" : "Modifier le tableau de bord";
    tableauDeBord.renderGlobal();
    const base = tableauDeBord.baseRows();
    const tiles = [],
      blocks = [];
    tableauDeBord.config.blocks.forEach((b, i) => {
      if (b.type === "tile" && !tableauDeBord.editing && tableauDeBord.attachedTo(b)) return;
      (b.type === "tile" ? tiles : blocks).push(
        b.type === "tile" ? tableauDeBord.renderTile(b, i, base) : tableauDeBord.renderCross(b, i, base),
      );
    });
    $("tiles").innerHTML = tiles.join("");
    $("blocks").innerHTML =
      blocks.join("") ||
      (tableauDeBord.config.blocks.length
        ? ""
        : `<div class="card empty">Tableau de bord vide : cliquez sur « Modifier le tableau de bord » pour ajouter des blocs.</div>`);
    tableauDeBord.renderQuickBar();
    if (tableauDeBord.studio()) tableauDeBord.renderStudio();
    const filtered =
      (tableauDeBord.config.filters && tableauDeBord.config.filters.some((c) => c.col)) ||
      Object.keys(tableauDeBord.quick).length;
    $("source").textContent =
      `${base.length} ligne${base.length > 1 ? "s" : ""}${filtered ? ` sur ${tableauDeBord.records.length}` : ""}`;
    renderDiagOnly();
    tableauDeBord.ensureRefs();
    if (tableauDeBord.accessLevel && tableauDeBord.accessLevel !== "full")
      tableauDeBord.showMsg(
        "warn",
        "Le widget n'a pas l'accès complet au document : dans le panneau de droite, onglet du widget, réglez « Accès » sur « Accès complet » pour lire toutes les colonnes.",
      );
  }
  // constantes de ce module utilisées ailleurs
  Object.assign(tableauDeBord, {
    CHART_TYPES,
    STACK_MODES,
    PIE_MAX,
    LABEL_MODES,
    labelsOn,
    showTotals,
    cibleDe,
    colDeBloc,
    tableDeBloc,
    aCoordonnees,
    ptsTable,
  });
};
