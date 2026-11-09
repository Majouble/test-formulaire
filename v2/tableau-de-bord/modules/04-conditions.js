/* PRISME — tableau de bord, module 04/15 : Conditions (filtres des blocs) et mesures (nombre, somme, moyenne…).
   Publie sur tableauDeBord : logicTree, passAll, condsText, condText, OPS, NO_VALUE, colMissing, REL_KINDS, hasRelConds,
     LOGIC_MODES, logicError, AGGS, ADDITIVE, isCover.
   Utilise (tableauDeBord.) : columnIds, config, dateLabel, dayOf, hasTime, isDate, keysOf, labelOf, minuteOf, norm, numOf.
   tableauDeBord et l'ordre des modules : voir tableau-de-bord/tableau.js. */

TableauDeBord.modules["conditions"] = function (tableauDeBord) {
  // fonctions de ce module utilisées ailleurs : disponibles dès maintenant (déclarations remontées)
  Object.assign(tableauDeBord, { logicTree, passAll, condsText, condText });
  // =============================================================================
  // Conditions (expressions)
  // =============================================================================
  const OPS = [
    ["eq", "est égal à"],
    ["ne", "est différent de"],
    ["in", "est l'une des valeurs"],
    ["contains", "contient"],
    ["ncontains", "ne contient pas"],
    ["gt", ">"],
    ["ge", "≥"],
    ["lt", "<"],
    ["le", "≤"],
    ["empty", "est vide"],
    ["nempty", "n'est pas vide"],
    ["true", "est coché / Oui"],
    ["false", "n'est pas coché / Non"],
  ];
  const NO_VALUE = new Set(["empty", "nempty", "true", "false"]);

  function isEmptyCell(v) {
    return (
      v === null ||
      v === undefined ||
      v === "" ||
      (Array.isArray(v) && (v.length === 0 || (v[0] === "L" && v.length === 1)))
    );
  }
  function truthy(v) {
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v !== 0;
    return ["oui", "vrai", "true", "yes", "x", "1"].includes(tableauDeBord.norm(v));
  }

  const colMissing = (col) => tableauDeBord.columnIds.size > 0 && !tableauDeBord.columnIds.has(col);
  // ---- Dates relatives : recalculées à chaque affichage, dans le fuseau de la colonne
  const REL_KINDS = [
    ["", "date fixe"],
    ["today", "aujourd'hui"],
    ["yesterday", "hier"],
    ["daysago", "il y a … jours"],
    ["now", "maintenant"],
    ["now-1d", "hier à la même heure"],
    ["hoursago", "il y a … heures"],
  ];
  const REL_DAY = new Set(["today", "yesterday", "daysago"]);
  const relOn = (c) =>
    c &&
    c.rel &&
    c.rel.kind &&
    tableauDeBord.isDate(c.col) &&
    !["contains", "ncontains", "in"].includes(c.op || "eq") &&
    !NO_VALUE.has(c.op || "eq");
  const shiftDay = (day, n) => {
    const d = new Date(day + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  };
  // valeur de comparaison au format de la précision : "AAAA-MM-JJ", "AAAA-MM-JJTHH:MM" ou "HH:MM"
  function relValue(c, prec) {
    const r = c.rel,
      n = Math.max(0, Math.round(Number(r.n) || 0)),
      now = new Date();
    if (REL_DAY.has(r.kind)) {
      const day = shiftDay(tableauDeBord.dayOf(c.col, now), r.kind === "today" ? 0 : r.kind === "yesterday" ? 1 : n);
      return prec === "day" ? day : prec === "time" ? "00:00" : day + "T00:00";
    }
    const t = new Date(now - (r.kind === "now" ? 0 : r.kind === "now-1d" ? 864e5 : n * 36e5));
    const m = tableauDeBord.minuteOf(c.col, t);
    return prec === "day" ? m.slice(0, 10) : prec === "time" ? m.slice(11, 16) : m;
  }
  const relLabel = (c) => {
    const k = c.rel.kind,
      n = Math.max(0, Math.round(Number(c.rel.n) || 0));
    return k === "daysago"
      ? `il y a ${n} jour${n > 1 ? "s" : ""}`
      : k === "hoursago"
        ? `il y a ${n} heure${n > 1 ? "s" : ""}`
        : (REL_KINDS.find((x) => x[0] === k) || ["", k])[1];
  };
  const hasRelConds = () =>
    [...(tableauDeBord.config.filters || []), ...tableauDeBord.config.blocks.flatMap((b) => b.conds || [])].some(
      (c) => c && c.rel && c.rel.kind,
    );

  function testCond(r, c) {
    if (!c || !c.col || colMissing(c.col)) return true;
    const v = r[c.col],
      op = c.op || "eq";
    if (op === "empty") return isEmptyCell(v);
    if (op === "nempty") return !isEmptyCell(v);
    if (op === "true") return truthy(v);
    if (op === "false") return !truthy(v);
    let wanted = String(c.val ?? "");
    if (tableauDeBord.isDate(c.col)) {
      // comparaison par jour, par date et heure, ou par heure seule
      const prec = tableauDeBord.hasTime(c.col) ? c.prec || "day" : "day";
      if (relOn(c)) wanted = relValue(c, prec);
      const m = prec === "day" ? null : tableauDeBord.minuteOf(c.col, v);
      const d = prec === "day" ? tableauDeBord.dayOf(c.col, v) : m && (prec === "time" ? m.slice(11, 16) : m);
      if (!d) return op === "ne" || op === "ncontains";
      const w = prec === "day" ? wanted.slice(0, 10) : prec === "time" ? wanted.slice(0, 5) : wanted.slice(0, 16);
      switch (op) {
        case "eq":
          return d === w;
        case "ne":
          return d !== w;
        case "gt":
          return d > w;
        case "ge":
          return d >= w;
        case "lt":
          return d < w;
        case "le":
          return d <= w;
        case "contains":
          return d.includes(w);
        case "ncontains":
          return !d.includes(w);
        case "in":
          return wanted
            .split(";")
            .map((s) => s.trim())
            .includes(d);
      }
    }
    if (["gt", "ge", "lt", "le"].includes(op)) {
      const a = tableauDeBord.numOf(v),
        b = tableauDeBord.numOf(wanted);
      if (isNaN(a) || isNaN(b)) return false;
      return op === "gt" ? a > b : op === "ge" ? a >= b : op === "lt" ? a < b : a <= b;
    }
    const keys = tableauDeBord.keysOf(c.col, v).map(tableauDeBord.norm);
    if (typeof v === "boolean" && (op === "eq" || op === "ne")) {
      // « = oui » sur une case à cocher
      const res = truthy(v) === truthy(wanted);
      return op === "eq" ? res : !res;
    }
    const w = tableauDeBord.norm(wanted);
    switch (op) {
      case "eq":
        return keys.includes(w) || (typeof v === "number" && tableauDeBord.numOf(v) === tableauDeBord.numOf(wanted));
      case "ne":
        return !(keys.includes(w) || (typeof v === "number" && tableauDeBord.numOf(v) === tableauDeBord.numOf(wanted)));
      case "contains":
        return keys.some((k) => k.includes(w));
      case "ncontains":
        return !keys.some((k) => k.includes(w));
      case "in": {
        const set = wanted.split(";").map(tableauDeBord.norm).filter(Boolean);
        return keys.some((k) => set.includes(k));
      }
    }
    return true;
  }
  // ---- Combinaison des conditions : toutes (ET), au moins une (OU) ou formule « 1 ET (2 OU 3) »
  const LOGIC_MODES = [
    ["and", "Toutes les conditions (ET)"],
    ["or", "Au moins une condition (OU)"],
    ["expr", "Combinaison personnalisée…"],
  ];
  const exprCache = new Map();
  function parseLogic(src, n) {
    // -> arbre { op, a, b } | { not } | { i } ; erreur levée si invalide
    const toks =
      String(src || "")
        .toUpperCase()
        .match(/\d+|\(|\)|ET|AND|&&?|OU|OR|\|\|?|NON|NOT|!|\S/g) || [];
    let p = 0;
    const peek = () => toks[p],
      take = () => toks[p++];
    const isAnd = (t) => t === "ET" || t === "AND" || t === "&" || t === "&&",
      isOr = (t) => t === "OU" || t === "OR" || t === "|" || t === "||";
    const isNot = (t) => t === "NON" || t === "NOT" || t === "!";
    function or() {
      let a = and();
      while (isOr(peek())) {
        take();
        a = { op: "or", a, b: and() };
      }
      return a;
    }
    function and() {
      let a = not();
      while (isAnd(peek())) {
        take();
        a = { op: "and", a, b: not() };
      }
      return a;
    }
    function not() {
      if (isNot(peek())) {
        take();
        return { not: not() };
      }
      return atom();
    }
    function atom() {
      const t = take();
      if (t === "(") {
        const e = or();
        if (take() !== ")") throw new Error("parenthèse fermante manquante");
        return e;
      }
      if (/^\d+$/.test(t || "")) {
        const i = Number(t);
        if (i < 1 || i > n) throw new Error(`il n'y a pas de condition n° ${i}`);
        return { i: i - 1 };
      }
      throw new Error(t === undefined ? "formule incomplète" : `« ${t} » inattendu`);
    }
    if (!toks.length) throw new Error("formule vide");
    const tree = or();
    if (p < toks.length) throw new Error(`« ${toks[p]} » inattendu`);
    return tree;
  }
  function logicTree(conds, logic) {
    // null = toutes (ET)
    const mode = (logic && logic.mode) || "and",
      n = (conds || []).length;
    if (mode === "and" || n < 2) return null;
    if (mode === "or") return { anyOf: true };
    const key = n + "\u0001" + logic.expr;
    if (!exprCache.has(key)) {
      try {
        exprCache.set(key, { tree: parseLogic(logic.expr, n) });
      } catch (e) {
        exprCache.set(key, { error: e.message });
      }
    }
    return exprCache.get(key);
  }
  const logicError = (conds, logic) => {
    const t = logicTree(conds, logic);
    return t && t.error ? t.error : "";
  };
  function evalTree(t, r, conds) {
    if (t.i !== undefined) return testCond(r, conds[t.i]);
    if (t.not) return !evalTree(t.not, r, conds);
    return t.op === "and"
      ? evalTree(t.a, r, conds) && evalTree(t.b, r, conds)
      : evalTree(t.a, r, conds) || evalTree(t.b, r, conds);
  }
  function passAll(r, conds, logic) {
    const t = logicTree(conds, logic);
    if (!t || t.error) return (conds || []).every((c) => testCond(r, c)); // formule invalide : on reste sur « toutes »
    const active = conds.filter((c) => c && c.col && !colMissing(c.col));
    if (t.anyOf) return !active.length || active.some((c) => testCond(r, c));
    return evalTree(t.tree, r, conds);
  }
  // texte lisible des conditions d'un bloc ou des filtres communs
  function condsText(conds, logic) {
    const list = conds || [],
      t = logicTree(list, logic);
    if (!t || t.error)
      return list
        .filter((c) => c.col)
        .map(condText)
        .join(" · ");
    if (t.anyOf) {
      const a = list.filter((c) => c.col).map(condText);
      return a.length > 1 ? a.join(" OU ") : a.join("");
    }
    const w = (n, top) =>
      n.i !== undefined
        ? condText(list[n.i]) || "(condition vide)"
        : n.not
          ? `NON (${w(n.not)})`
          : (top ? "" : "(") + `${w(n.a)} ${n.op === "and" ? "ET" : "OU"} ${w(n.b)}` + (top ? "" : ")");
    return w(t.tree, true);
  }

  function condText(c) {
    if (!c || !c.col) return "";
    const op = (OPS.find((o) => o[0] === c.op) || OPS[0])[1];
    const prec = tableauDeBord.isDate(c.col) && tableauDeBord.hasTime(c.col) ? c.prec || "day" : "day";
    const dv = (v) =>
      prec === "time"
        ? String(v).slice(0, 5).replace(":", " h ")
        : prec === "datetime"
          ? `${tableauDeBord.dateLabel(String(v).slice(0, 10), "jour")} à ${String(v).slice(11, 16).replace(":", " h ")}`
          : tableauDeBord.dateLabel(String(v).slice(0, 10), "jour");
    const val = NO_VALUE.has(c.op)
      ? ""
      : relOn(c)
        ? ` ${relLabel(c)} (${dv(relValue(c, prec))})`
        : ` « ${tableauDeBord.isDate(c.col) && c.val ? dv(c.val) : (c.val ?? "")} »`;
    if (prec === "time" && !NO_VALUE.has(c.op)) return `${tableauDeBord.labelOf(c.col)} (heure) ${op}${val}`;
    return `${tableauDeBord.labelOf(c.col)} ${op}${val}`;
  }

  // =============================================================================
  // Mesures
  // =============================================================================
  const AGGS = [
    ["count", "Nombre de lignes"],
    ["sum", "Somme de"],
    ["avg", "Moyenne de"],
    ["min", "Minimum de"],
    ["max", "Maximum de"],
    ["distinct", "Nombre de valeurs distinctes de"],
    ["cover", "Couverture d'une liste de référence par"],
  ];
  const ADDITIVE = new Set(["count", "sum"]);
  const isCover = (b) => b && b.measure && b.measure.agg === "cover";
  // constantes de ce module utilisées ailleurs
  Object.assign(tableauDeBord, {
    OPS,
    NO_VALUE,
    colMissing,
    REL_KINDS,
    hasRelConds,
    LOGIC_MODES,
    logicError,
    AGGS,
    ADDITIVE,
    isCover,
  });
};
