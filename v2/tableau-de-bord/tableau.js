/* =====================================================================
   Tableau de bord v2 — module partagé (administration : édition ; widget : lecture)
   Reprise du tableau de bord v1. Contexte fourni par la page hôte :
   { mode: "edition" | "lecture", table, abonner(cb), configuration(), enregistrer(config) }
   ===================================================================== */
(function () {
  const BALISAGE = "<div class=\"tdb-header\">\n  <div class=\"bar\">\n    <h1>Tableau de bord</h1>\n    <span class=\"sub\" id=\"source\">En attente des donn\u00e9es Grist\u2026</span>\n    <span class=\"sp\"></span>\n    <button class=\"edit-only\" id=\"saveCfg\" title=\"T\u00e9l\u00e9charger la configuration des blocs (fichier .json)\">Sauvegarder la configuration</button>\n    <button class=\"edit-only\" id=\"loadCfg\" title=\"Recharger une configuration sauvegard\u00e9e\">Restaurer\u2026</button>\n    <button class=\"edit-only\" id=\"findCfg\" title=\"Chercher les configurations enregistr\u00e9es dans les autres widgets de ce document\">R\u00e9cup\u00e9rer d'un autre widget\u2026</button>\n    <input type=\"file\" id=\"cfgFile\" accept=\".json,application/json\" style=\"display:none\">\n    <button class=\"edit-only\" id=\"addTile\">+ Chiffre cl\u00e9</button>\n    <button class=\"edit-only\" id=\"addCross\">+ Tableau crois\u00e9</button>\n    <button class=\"edit-only ghost\" id=\"openAll\" title=\"D\u00e9plier les r\u00e9glages de tous les blocs\">Tout d\u00e9plier</button>\n    <button class=\"edit-only ghost\" id=\"closeAll\" title=\"Replier les r\u00e9glages de tous les blocs\">Tout replier</button>\n    <button class=\"view-only\" id=\"exportWord\" title=\"Tous les blocs dans un document Word : chiffres cl\u00e9s, graphiques et tableaux\">Exporter en Word</button>\n    <button class=\"primary\" id=\"toggleEdit\">Modifier le tableau de bord</button>\n  </div>\n  <div id=\"quickBar\" class=\"view-only quickbar\" role=\"toolbar\" aria-label=\"Filtres rapides\"></div>\n</div>\n<div class=\"tdb-main\">\n  <div id=\"globalBox\"></div>\n  <div id=\"messages\"></div>\n  <div id=\"recover\"></div>\n  <div class=\"tiles\" id=\"tiles\"></div>\n  <div id=\"blocks\" style=\"display:grid;gap:12px\"></div>\n  <p class=\"hint\" id=\"diag\"></p>\n</div>\n<div id=\"tip\"></div>\n<div id=\"qpop\" class=\"qpop\" hidden></div>\n<div id=\"drill\" class=\"drill-overlay\" hidden></div>";
  function monter(RACINE, CTX) {
    RACINE.innerHTML = BALISAGE;

"use strict";
// =============================================================================
// Outils
// =============================================================================
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const norm = s => String(s ?? "").replace(/\*/g, "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const fmtNum = v => v === null || v === undefined || isNaN(v) ? "–" : nf.format(v);
const EMPTY = "(vide)";
// Texte entre astérisques (**texte** ou *texte*) affiché en gras
function dateTokens(s) {
  if (!/\{(aujourd'?hui|hier|heure)\}/i.test(s)) return s;
  const p = n => String(n).padStart(2, "0"), d = new Date(), y = new Date(d - 864e5);
  return s.replace(/\{aujourd'?hui\}/gi, `${p(d.getDate())}/${p(d.getMonth() + 1)}`).replace(/\{hier\}/gi, `${p(y.getDate())}/${p(y.getMonth() + 1)}`)
    .replace(/\{heure\}/gi, `${d.getHours()} h ${p(d.getMinutes())}`);
}
function segs(s) {
  s = dateTokens(String(s ?? "")); const out = [], re = /\*\*([^*]+?)\*\*|\*([^*\n]+?)\*/g; let last = 0, m;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ t: s.slice(last, m.index), b: false });
    out.push({ t: m[1] !== undefined ? m[1] : m[2], b: true }); last = re.lastIndex;
  }
  if (last < s.length) out.push({ t: s.slice(last), b: false });
  return out;
}
const rich = s => segs(s).map(x => x.b ? `<b>${esc(x.t)}</b>` : esc(x.t)).join("");
const plain = s => segs(s).map(x => x.t).join("");
function svgRich(s, max) {                                         // libellé SVG tronqué, gras conservé
  let n = 0, out = "", cut = false;
  for (const x of segs(s)) {
    if (n >= max) { cut = true; break; }
    let t = x.t; if (n + t.length > max) { t = t.slice(0, max - n); cut = true; }
    n += t.length; out += x.b ? `<tspan font-weight="700">${esc(t)}</tspan>` : esc(t);
  }
  return out + (cut ? "…" : "");
}
const TIP_SEP = "\u0001";
const SERIES = ["--s1", "--s2", "--s3", "--s4", "--s5", "--s6", "--s7"];
const MAX_SERIES = 7;

// =============================================================================
// Données : colonnes, types et valeurs
// =============================================================================
let records = [];                 // lignes de la table (toutes colonnes)
let columns = [];                 // [{ id, label, type }]
let colTypes = {}, colLabels = {};
let columnIds = new Set();        // colonnes de la table en cours (table du widget ou source du bloc)
let accessLevel = null, diagSource = "-", diagError = "";

const typeOf = col => colTypes[col] || "";
let kindCache = new Map();                                            // vidé à chaque arrivée de données
function kindOf(col) {
  if (kindCache.has(col)) return kindCache.get(col);
  const t = typeOf(col); let k = "text";
  if (/^Date/.test(t) || (!t && records.some(r => r[col] instanceof Date))) k = "date";
  else if (t === "Bool" || (!t && records.some(r => typeof r[col] === "boolean") && records.every(r => r[col] == null || typeof r[col] === "boolean"))) k = "bool";
  else if (/^(Numeric|Int)$/.test(t) || (!t && records.length && records.every(r => r[col] == null || r[col] === "" || typeof r[col] === "number"))) k = "num";
  kindCache.set(col, k); return k;
}
const isDate = col => kindOf(col) === "date";
const isNumCol = col => kindOf(col) === "num";
const isBool = col => kindOf(col) === "bool";
const labelOf = col => colLabels[col] || col;

function toJsDate(v) {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return isNaN(v) ? null : v;
  if (typeof v === "number") return new Date(v * 1000);            // Grist stocke les dates en secondes
  if (Array.isArray(v) && (v[0] === "D" || v[0] === "d")) return new Date(v[1] * 1000);
  if (typeof v === "object" && typeof v.toISOString === "function") return new Date(v.toISOString());
  const d = new Date(v); return isNaN(d) ? null : d;
}

function dayOf(col, v) {                                           // "AAAA-MM-JJ" à l'heure du fuseau de la colonne
  const d = toJsDate(v); if (!d) return null;
  const t = typeOf(col);
  if (t === "Date") return d.toISOString().slice(0, 10);
  const tz = t.startsWith("DateTime:") ? t.split(":")[1] : undefined;
  try {
    const o = {}; new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(d).forEach(p => o[p.type] = p.value);
    return `${o.year}-${o.month}-${o.day}`;
  } catch (e) { return d.toISOString().slice(0, 10); }
}

function minuteOf(col, v) {                                        // "AAAA-MM-JJTHH:MM" à l'heure du fuseau de la colonne
  const d = toJsDate(v); if (!d) return null;
  const t = typeOf(col), tz = t.startsWith("DateTime:") ? t.split(":")[1] : undefined;
  if (t === "Date") return d.toISOString().slice(0, 10) + "T00:00";
  try {
    const o = {}; new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(d).forEach(p => o[p.type] = p.value);
    return `${o.year}-${o.month}-${o.day}T${o.hour === "24" ? "00" : o.hour}:${o.minute}`;
  } catch (e) { return d.toISOString().slice(0, 16); }
}
const hasTime = col => typeOf(col).startsWith("DateTime") || (!typeOf(col) && records.some(r => r[col] instanceof Date));
const DATE_PRECS = [["day", "jour"], ["datetime", "date et heure"], ["time", "heure seule"]];

function isoWeek(day) {                                             // "2026-S40"
  const d = new Date(day + "T00:00:00Z"); const n = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - n + 3);
  const y = d.getUTCFullYear(), first = new Date(Date.UTC(y, 0, 4));
  const w = 1 + Math.round(((d - first) / 864e5 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
  return `${y}-S${String(w).padStart(2, "0")}`;
}
const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
function dateKey(col, v, grain) {
  const day = dayOf(col, v); if (!day) return EMPTY;
  if (grain === "semaine") return isoWeek(day);
  if (grain === "mois") return day.slice(0, 7);
  if (grain === "annee") return day.slice(0, 4);
  return day;
}
function dateLabel(key, grain) {
  if (key === EMPTY) return key;
  if (grain === "semaine") { const [y, w] = key.split("-S"); return `Semaine ${Number(w)} (${y})`; }
  if (grain === "mois") return `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
  if (grain === "annee") return key;
  return `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}`;
}

function textOf(v) {                                                // valeur affichable d'une cellule non-date
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "boolean") return v ? "Oui" : "Non";
  if (typeof v === "number") return nf.format(v);
  if (v && typeof v === "object") {
    if (v.constructor && v.constructor.name === "Reference") return String(v.rowId);
    return JSON.stringify(v);
  }
  return String(v);
}

// Clés de regroupement d'une cellule (une liste de choix donne plusieurs clés)
function keysOf(col, v, grain) {
  if (isDate(col)) return [dateKey(col, v, grain || "jour")];
  const tf = GEO_T[grain];
  if (Array.isArray(v)) { const a = v[0] === "L" ? v.slice(1) : v; return a.length ? a.map(x => tf ? geoT(tf, textOf(x)) : textOf(x) ?? EMPTY) : [EMPTY]; }
  const t = textOf(v); return [t === null ? EMPTY : tf ? geoT(tf, t) : t];
}
function keyLabel(col, key, grain) {
  if (isDate(col)) return dateLabel(key, grain || "jour");
  if (grain === "dep_uai" && DEP_NAMES[key]) return `${key} · ${DEP_NAMES[key]}`;
  return key;
}

// =============================================================================
// Fond de carte embarqué : départements et académies (Lambert-93 ; Outre-mer et petite couronne en encarts)
// =============================================================================
// fond, noms et correspondances : socle (commun/geo.js)
const { GEO, geoNorm, DEP_NAMES, DEP_ACA, ACA_NAMES, DEP_BY_NAME, ACA_BY_NAME, depKey, acaKey, depFromUai } = window.Geo;
const UNKNOWN = "(non reconnu)";
// libellé des lignes d'un tableau croisé : « Département », « Académie » quand la valeur est rattachée
const GEO_HEAD = { dep_uai: ["Département", "d'après l'UAI"], dep_norm: ["Département", ""], aca_uai: ["Académie", "d'après l'UAI"], aca_dep: ["Académie", "d'après le département"], aca_norm: ["Académie", ""] };
const rowHead = (col, grain) => GEO_HEAD[grain] ? GEO_HEAD[grain][0] : labelOf(col);
const rowDim = (col, grain) => GEO_HEAD[grain] ? `${GEO_HEAD[grain][0].toLowerCase()}${GEO_HEAD[grain][1] ? " (" + GEO_HEAD[grain][1] + " « " + labelOf(col) + " »)" : ""}` : labelOf(col);
const GEO_T = { dep_uai: "dep_uai", aca_uai: "aca_uai", aca_dep: "aca_dep", dep_norm: "dep_norm", aca_norm: "aca_norm" };
const GEO_GRAINS = [["", "valeurs telles quelles"], ["dep_norm", "département (code ou nom)"], ["aca_norm", "académie (nom)"],
  ["dep_uai", "département déduit de l'UAI"], ["aca_uai", "académie déduite de l'UAI"], ["aca_dep", "académie déduite du département"]];
function geoT(tf, t) {
  if (t === null || t === undefined || t === "") return EMPTY;
  const k = tf === "dep_uai" ? depFromUai(t) : tf === "aca_uai" ? DEP_ACA[depFromUai(t)] : tf === "aca_dep" ? DEP_ACA[depKey(t)] : tf === "dep_norm" ? depKey(t) : acaKey(t);
  return k || UNKNOWN;
}

function numOf(v) {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v === null || v === undefined || v === "") return NaN;
  const n = Number(String(v).replace(/\s/g, "").replace(",", ".")); return n;
}

// =============================================================================
// Conditions (expressions)
// =============================================================================
const OPS = [
  ["eq", "est égal à"], ["ne", "est différent de"], ["in", "est l'une des valeurs"], ["contains", "contient"], ["ncontains", "ne contient pas"],
  ["gt", ">"], ["ge", "≥"], ["lt", "<"], ["le", "≤"],
  ["empty", "est vide"], ["nempty", "n'est pas vide"], ["true", "est coché / Oui"], ["false", "n'est pas coché / Non"],
];
const NO_VALUE = new Set(["empty", "nempty", "true", "false"]);

function isEmptyCell(v) { return v === null || v === undefined || v === "" || (Array.isArray(v) && (v.length === 0 || (v[0] === "L" && v.length === 1))); }
function truthy(v) {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  return ["oui", "vrai", "true", "yes", "x", "1"].includes(norm(v));
}

const colMissing = col => columnIds.size > 0 && !columnIds.has(col);
// ---- Dates relatives : recalculées à chaque affichage, dans le fuseau de la colonne
const REL_KINDS = [["", "date fixe"], ["today", "aujourd'hui"], ["yesterday", "hier"], ["daysago", "il y a … jours"],
  ["now", "maintenant"], ["now-1d", "hier à la même heure"], ["hoursago", "il y a … heures"]];
const REL_DAY = new Set(["today", "yesterday", "daysago"]);
const relOn = c => c && c.rel && c.rel.kind && isDate(c.col) && !["contains", "ncontains", "in"].includes(c.op || "eq") && !NO_VALUE.has(c.op || "eq");
const shiftDay = (day, n) => { const d = new Date(day + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
// valeur de comparaison au format de la précision : "AAAA-MM-JJ", "AAAA-MM-JJTHH:MM" ou "HH:MM"
function relValue(c, prec) {
  const r = c.rel, n = Math.max(0, Math.round(Number(r.n) || 0)), now = new Date();
  if (REL_DAY.has(r.kind)) {
    const day = shiftDay(dayOf(c.col, now), r.kind === "today" ? 0 : r.kind === "yesterday" ? 1 : n);
    return prec === "day" ? day : prec === "time" ? "00:00" : day + "T00:00";
  }
  const t = new Date(now - (r.kind === "now" ? 0 : r.kind === "now-1d" ? 864e5 : n * 36e5));
  const m = minuteOf(c.col, t);
  return prec === "day" ? m.slice(0, 10) : prec === "time" ? m.slice(11, 16) : m;
}
const relLabel = c => { const k = c.rel.kind, n = Math.max(0, Math.round(Number(c.rel.n) || 0));
  return k === "daysago" ? `il y a ${n} jour${n > 1 ? "s" : ""}` : k === "hoursago" ? `il y a ${n} heure${n > 1 ? "s" : ""}` : (REL_KINDS.find(x => x[0] === k) || ["", k])[1]; };
const hasRelConds = () => [...(config.filters || []), ...config.blocks.flatMap(b => b.conds || [])].some(c => c && c.rel && c.rel.kind);

function testCond(r, c) {
  if (!c || !c.col || colMissing(c.col)) return true;
  const v = r[c.col], op = c.op || "eq";
  if (op === "empty") return isEmptyCell(v);
  if (op === "nempty") return !isEmptyCell(v);
  if (op === "true") return truthy(v);
  if (op === "false") return !truthy(v);
  let wanted = String(c.val ?? "");
  if (isDate(c.col)) {                                               // comparaison par jour, par date et heure, ou par heure seule
    const prec = hasTime(c.col) ? (c.prec || "day") : "day";
    if (relOn(c)) wanted = relValue(c, prec);
    const m = prec === "day" ? null : minuteOf(c.col, v);
    const d = prec === "day" ? dayOf(c.col, v) : m && (prec === "time" ? m.slice(11, 16) : m);
    if (!d) return op === "ne" || op === "ncontains";
    const w = prec === "day" ? wanted.slice(0, 10) : prec === "time" ? wanted.slice(0, 5) : wanted.slice(0, 16);
    switch (op) {
      case "eq": return d === w; case "ne": return d !== w;
      case "gt": return d > w; case "ge": return d >= w; case "lt": return d < w; case "le": return d <= w;
      case "contains": return d.includes(w); case "ncontains": return !d.includes(w);
      case "in": return wanted.split(";").map(s => s.trim()).includes(d);
    }
  }
  if (["gt", "ge", "lt", "le"].includes(op)) {
    const a = numOf(v), b = numOf(wanted); if (isNaN(a) || isNaN(b)) return false;
    return op === "gt" ? a > b : op === "ge" ? a >= b : op === "lt" ? a < b : a <= b;
  }
  const keys = keysOf(c.col, v).map(norm);
  if (typeof v === "boolean" && (op === "eq" || op === "ne")) {      // « = oui » sur une case à cocher
    const res = truthy(v) === truthy(wanted); return op === "eq" ? res : !res;
  }
  const w = norm(wanted);
  switch (op) {
    case "eq": return keys.includes(w) || (typeof v === "number" && numOf(v) === numOf(wanted));
    case "ne": return !(keys.includes(w) || (typeof v === "number" && numOf(v) === numOf(wanted)));
    case "contains": return keys.some(k => k.includes(w));
    case "ncontains": return !keys.some(k => k.includes(w));
    case "in": { const set = wanted.split(";").map(norm).filter(Boolean); return keys.some(k => set.includes(k)); }
  }
  return true;
}
// ---- Combinaison des conditions : toutes (ET), au moins une (OU) ou formule « 1 ET (2 OU 3) »
const LOGIC_MODES = [["and", "Toutes les conditions (ET)"], ["or", "Au moins une condition (OU)"], ["expr", "Combinaison personnalisée…"]];
const exprCache = new Map();
function parseLogic(src, n) {                                       // -> arbre { op, a, b } | { not } | { i } ; erreur levée si invalide
  const toks = String(src || "").toUpperCase().match(/\d+|\(|\)|ET|AND|&&?|OU|OR|\|\|?|NON|NOT|!|\S/g) || [];
  let p = 0;
  const peek = () => toks[p], take = () => toks[p++];
  const isAnd = t => t === "ET" || t === "AND" || t === "&" || t === "&&", isOr = t => t === "OU" || t === "OR" || t === "|" || t === "||";
  const isNot = t => t === "NON" || t === "NOT" || t === "!";
  function or() { let a = and(); while (isOr(peek())) { take(); a = { op: "or", a, b: and() }; } return a; }
  function and() { let a = not(); while (isAnd(peek())) { take(); a = { op: "and", a, b: not() }; } return a; }
  function not() { if (isNot(peek())) { take(); return { not: not() }; } return atom(); }
  function atom() {
    const t = take();
    if (t === "(") { const e = or(); if (take() !== ")") throw new Error("parenthèse fermante manquante"); return e; }
    if (/^\d+$/.test(t || "")) { const i = Number(t); if (i < 1 || i > n) throw new Error(`il n'y a pas de condition n° ${i}`); return { i: i - 1 }; }
    throw new Error(t === undefined ? "formule incomplète" : `« ${t} » inattendu`);
  }
  if (!toks.length) throw new Error("formule vide");
  const tree = or(); if (p < toks.length) throw new Error(`« ${toks[p]} » inattendu`);
  return tree;
}
function logicTree(conds, logic) {                                  // null = toutes (ET)
  const mode = (logic && logic.mode) || "and", n = (conds || []).length;
  if (mode === "and" || n < 2) return null;
  if (mode === "or") return { anyOf: true };
  const key = n + "\u0001" + logic.expr;
  if (!exprCache.has(key)) { try { exprCache.set(key, { tree: parseLogic(logic.expr, n) }); } catch (e) { exprCache.set(key, { error: e.message }); } }
  return exprCache.get(key);
}
const logicError = (conds, logic) => { const t = logicTree(conds, logic); return t && t.error ? t.error : ""; };
function evalTree(t, r, conds) {
  if (t.i !== undefined) return testCond(r, conds[t.i]);
  if (t.not) return !evalTree(t.not, r, conds);
  return t.op === "and" ? evalTree(t.a, r, conds) && evalTree(t.b, r, conds) : evalTree(t.a, r, conds) || evalTree(t.b, r, conds);
}
function passAll(r, conds, logic) {
  const t = logicTree(conds, logic);
  if (!t || t.error) return (conds || []).every(c => testCond(r, c));  // formule invalide : on reste sur « toutes »
  const active = conds.filter(c => c && c.col && !colMissing(c.col));
  if (t.anyOf) return !active.length || active.some(c => testCond(r, c));
  return evalTree(t.tree, r, conds);
}
// texte lisible des conditions d'un bloc ou des filtres communs
function condsText(conds, logic) {
  const list = conds || [], t = logicTree(list, logic);
  if (!t || t.error) return list.filter(c => c.col).map(condText).join(" · ");
  if (t.anyOf) { const a = list.filter(c => c.col).map(condText); return a.length > 1 ? a.join(" OU ") : a.join(""); }
  const w = (n, top) => n.i !== undefined ? condText(list[n.i]) || "(condition vide)" : n.not ? `NON (${w(n.not)})` : (top ? "" : "(") + `${w(n.a)} ${n.op === "and" ? "ET" : "OU"} ${w(n.b)}` + (top ? "" : ")");
  return w(t.tree, true);
}

function condText(c) {
  if (!c || !c.col) return "";
  const op = (OPS.find(o => o[0] === c.op) || OPS[0])[1];
  const prec = isDate(c.col) && hasTime(c.col) ? (c.prec || "day") : "day";
  const dv = v => prec === "time" ? String(v).slice(0, 5).replace(":", " h ") :
    prec === "datetime" ? `${dateLabel(String(v).slice(0, 10), "jour")} à ${String(v).slice(11, 16).replace(":", " h ")}` : dateLabel(String(v).slice(0, 10), "jour");
  const val = NO_VALUE.has(c.op) ? "" : relOn(c) ? ` ${relLabel(c)} (${dv(relValue(c, prec))})` : ` « ${isDate(c.col) && c.val ? dv(c.val) : c.val ?? ""} »`;
  if (prec === "time" && !NO_VALUE.has(c.op)) return `${labelOf(c.col)} (heure) ${op}${val}`;
  return `${labelOf(c.col)} ${op}${val}`;
}

// =============================================================================
// Mesures
// =============================================================================
const AGGS = [["count", "Nombre de lignes"], ["sum", "Somme de"], ["avg", "Moyenne de"], ["min", "Minimum de"], ["max", "Maximum de"], ["distinct", "Nombre de valeurs distinctes de"], ["cover", "Couverture d'une liste de référence par"]];
const ADDITIVE = new Set(["count", "sum"]);
const isCover = b => b && b.measure && b.measure.agg === "cover";

// =============================================================================
// Tables de référence (autres tables du document) : listes attendues
// =============================================================================
let docMeta = null, mainTable = null;
const refCache = new Map();          // table -> { cols, data, stale }
const refLoading = new Set();
const refNorm = s => norm(s).replace(/[\s\-'’_.]+/g, " ").trim();
function refTables() {
  if (!docMeta) return [];
  const T = docMeta.T;
  return T.tableId.filter((t, i) => t && t !== mainTable && t !== CFG_TABLE && !t.startsWith("GristHidden") && !(T.summarySourceTable && T.summarySourceTable[i]));
}
function refColumns(table) {
  if (!docMeta || !table) return [];
  const T = docMeta.T, C = docMeta.C, ref = T.id[T.tableId.indexOf(table)];
  const out = [];
  C.id.forEach((_, i) => { if (C.parentId[i] === ref && C.colId[i] !== "manualSort" && !C.colId[i].startsWith("gristHelper_")) out.push({ id: C.colId[i], label: (C.label && C.label[i]) || C.colId[i], type: C.type[i] }); });
  return out;
}
function wantedRefs() {
  const s = new Set();
  config.blocks.forEach(b => { if (!isMainSrc(b)) s.add(b.source); if (isCover(b) && b.measure.ref && b.measure.ref.table) s.add(b.measure.ref.table); if (b.rows && b.rows.ref && b.rows.ref.table) s.add(b.rows.ref.table); if (b.chart === "points" && ptsTable(b)) s.add(ptsTable(b)); });
  return [...s];
}
async function ensureRefs() {
  if (!window.grist || !grist.docApi) return;
  const todo = wantedRefs().filter(t => (!refCache.has(t) || refCache.get(t).stale) && !refLoading.has(t));
  if (!todo.length) return;
  todo.forEach(t => refLoading.add(t));
  await Promise.all(todo.map(async t => {
    try { const data = await grist.docApi.fetchTable(t); refCache.set(t, { data, stale: false }); }
    catch (e) { refCache.set(t, { error: e && e.message ? e.message : String(e), stale: false }); }
    refLoading.delete(t);
  }));
  render();
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
  const col = c.data[ref.col]; if (!col) return { state: "error", error: `colonne « ${ref.col} » introuvable dans ${ref.table}` };
  const exp = ref.expect && ref.expect !== "__count" ? c.data[ref.expect] : null;
  // filtre propre à la référence (ex. Type d'établissement = Lycée), évalué dans les colonnes de la table de référence
  let keep = null;
  if ((ref.conds || []).some(x => x && x.col)) {
    keep = new Set();
    inSrc({ source: ref.table }, () => records.forEach((r, i) => { if (passAll(r, ref.conds, ref.logic)) keep.add(i); }));
  }
  const geo = GEO_T[grain];
  const map = new Map();
  let kept = 0;
  col.forEach((v, i) => {
    if (keep && !keep.has(i)) return;
    kept++;
    const items = Array.isArray(v) ? (v[0] === "L" ? v.slice(1) : v) : [v];
    items.forEach(x => {
      let t = textOf(x); if (t === null) return;
      if (geo) { t = refGeoKey(grain, t); if (!t) return; }
      const k = refNorm(t); let e = map.get(k); if (!e) map.set(k, e = { label: t, n: 0, sum: 0 });
      e.n++; if (exp) { const n = numOf(exp[i]); if (!isNaN(n)) e.sum += n; }
    });
  });
  return { state: "ok", map, size: map.size, rows: kept, total: col.length, expected: k => { const e = map.get(k); return !e ? NaN : ref.expect === "__count" ? e.n : exp ? e.sum : NaN; } };
}
const refStateText = L => L.state === "loading" ? "lecture de la table de référence…" : L.state === "error" ? "table de référence illisible : " + L.error : "choisissez la table et la colonne de référence";
// couverture : valeurs de la liste présentes dans les réponses
function coverInfo(rows, m) {
  const L = refList(m.ref); if (L.state !== "ok" || !m.col) return { L, ok: false };
  const seen = new Map(), outside = new Map();
  rows.forEach(r => new Set(keysOf(m.col, r[m.col]).filter(k => k !== EMPTY)).forEach(k => {
    const nk = refNorm(k);
    if (L.map.has(nk)) seen.set(nk, (seen.get(nk) || 0) + 1); else outside.set(k, (outside.get(k) || 0) + 1);
  }));
  const list = [...L.map.entries()].map(([k, e]) => ({ key: k, label: e.label, n: seen.get(k) || 0 }));
  return { L, ok: true, present: list.filter(x => x.n), missing: list.filter(x => !x.n), outside: [...outside.entries()].map(([label, n]) => ({ label, n })), total: L.size };
}

// =============================================================================
// Source d'un bloc : la table du widget (par défaut) ou une autre table du document
// =============================================================================
const isMainSrc = b => !b || !b.source || b.source === mainTable;
let curSrc = null, mainState = null;
const stateNow = () => ({ records, columns, colTypes, colLabels, kindCache, columnIds });
function setState(st) { ({ records, columns, colTypes, colLabels, kindCache, columnIds } = st); }
const EMPTY_STATE = () => ({ records: [], columns: [], colTypes: {}, colLabels: {}, kindCache: new Map(), columnIds: new Set() });
function ctxOf(table) {
  const c = refCache.get(table); if (!c || !c.data) return null;
  if (!c.ctx) {
    const d = c.data, meta = refColumns(table).filter(x => d[x.id]);
    const ids = meta.map(x => x.id);
    c.ctx = { records: (d.id || []).map((id, i) => { const r = { id }; ids.forEach(k => r[k] = d[k][i]); return r; }),
      columns: meta.map(x => ({ id: x.id, label: x.label, type: x.type })), colTypes: Object.fromEntries(meta.map(x => [x.id, x.type])),
      colLabels: Object.fromEntries(meta.map(x => [x.id, x.label])), kindCache: new Map(), columnIds: new Set(ids) };
  }
  return c.ctx;
}
// exécute fn avec les lignes et colonnes de la table source du bloc (calcul synchrone uniquement)
function inSrc(b, fn) {
  const target = isMainSrc(b) ? null : b.source;
  if (target === curSrc) return fn();
  const prev = stateNow(), prevSrc = curSrc;
  if (prevSrc === null) mainState = prev;
  setState(target === null ? mainState : (ctxOf(target) || EMPTY_STATE()));
  curSrc = target;
  try { return fn(); } finally { setState(prev); curSrc = prevSrc; }
}
// filtres communs ou rapides qui ne s'appliquent pas à la table du bloc (colonne absente)
function srcNote(b) {
  if (isMainSrc(b)) return "";
  const c = refCache.get(b.source);
  if (!c || refLoading.has(b.source) && !c.data) return `<p class="hint">Lecture de la table « ${esc(b.source)} »…</p>`;
  if (c.error) return `<p class="hint warn">Table « ${esc(b.source)} » illisible : ${esc(c.error)}</p>`;
  const skipped = [...new Set([...(config.filters || []).filter(f => f.col).map(f => f.col), ...Object.keys(quick)])].filter(col => !columnIds.has(col));
  return skipped.length ? `<p class="hint edit-only">Table « ${esc(b.source)} » : filtre(s) sans effet ici, faute de colonne du même nom : ${esc(skipped.map(labelOf).join(", "))}. (Message visible seulement en mode modification.)</p>` : "";
}
// colonnes du bloc absentes de sa table (après un changement de source, ou colonne supprimée)
function missingColsNote(b) {
  if (!columnIds.size) return "";
  const out = [];
  const chk = (col, what) => { if (col && !columnIds.has(col)) out.push(`${what} : « ${labelOf(col)} »`); };
  chk(b.measure && b.measure.col, "mesure");
  if (b.type === "cross") { chk(b.rows && b.rows.col, "lignes"); chk(b.cols && b.cols.col, "colonnes"); }
  (b.conds || []).forEach((c, k) => chk(c.col, `condition ${k + 1} (ignorée)`));
  return out.length ? `<p class="hint warn edit-only">Colonne(s) absente(s) de la table ${esc(isMainSrc(b) ? (mainTable || "du widget") : b.source)} : ${esc(out.join(" · "))}. Choisissez-en une autre dans les réglages ci-dessous.</p>` : "";
}
// au changement de source : chaque colonne du bloc est reprise si la nouvelle table a la même (même identifiant ou même libellé)
function remapBlockCols(b, oldSrc) {
  const target = isMainSrc(b) ? (curSrc === null ? columns : mainState.columns) : refColumns(b.source);
  if (!target || !target.length) return;
  const oldLabel = col => inSrc(oldSrc ? { source: oldSrc } : null, () => labelOf(col));
  const map = col => {
    if (!col) return col;
    const hit = target.find(c => c.id === col) || target.find(c => refNorm(c.label) === refNorm(oldLabel(col))) || target.find(c => refNorm(c.id) === refNorm(col));
    return hit ? hit.id : col;
  };
  if (b.measure) b.measure.col = map(b.measure.col);
  if (b.rows) b.rows.col = map(b.rows.col);
  if (b.cols) b.cols.col = map(b.cols.col);
  (b.conds || []).forEach(c => c.col = map(c.col));
  if (b.detailCols) b.detailCols = b.detailCols.map(map).filter(c => target.some(t => t.id === c));
}

function aggregate(rows, m) {
  const agg = m.agg || "count";
  if (agg === "count") return rows.length;
  if (agg === "cover") { const c = coverInfo(rows, m); return c.ok ? c.present.length : NaN; }
  if (!m.col) return NaN;
  if (agg === "distinct") { const s = new Set(); rows.forEach(r => keysOf(m.col, r[m.col]).forEach(k => { if (k !== EMPTY) s.add(k); })); return s.size; }
  const nums = rows.map(r => numOf(r[m.col])).filter(n => !isNaN(n));
  if (agg === "sum") return nums.reduce((a, b) => a + b, 0);
  if (!nums.length) return NaN;
  if (agg === "avg") return nums.reduce((a, b) => a + b, 0) / nums.length;
  if (agg === "min") return Math.min(...nums);
  if (agg === "max") return Math.max(...nums);
  return NaN;
}
function measureText(m) {
  if (m.agg === "cover") return `Couverture de la liste « ${(m.ref && m.ref.col) || "?"} » (table ${(m.ref && m.ref.table) || "?"}) par ${labelOf(m.col || "?")}`;
  const a = (AGGS.find(x => x[0] === (m.agg || "count")) || AGGS[0])[1];
  return m.agg && m.agg !== "count" ? `${a} ${labelOf(m.col || "?")}` : a;
}

// =============================================================================
// Configuration (enregistrée avec le widget)
// =============================================================================
let config = { filters: [], blocks: [] };
let editing = CTX.mode === "edition", configLoaded = false;
let uid = 1;
const newId = () => "b" + Date.now().toString(36) + (uid++);

function defaultConfig() {
  const cfg = { filters: [], blocks: [{ id: newId(), type: "tile", title: "Nombre de lignes", measure: { agg: "count" }, conds: [] }] };
  const cat = columns.find(c => /^Choice/.test(c.type)) || columns.find(c => !isDate(c.id) && !isNumCol(c.id));
  if (cat) cfg.blocks.push({ id: newId(), type: "cross", title: `Répartition par ${labelOf(cat.id)}`, measure: { agg: "count" },
    rows: { col: cat.id, grain: "jour" }, cols: { col: "", grain: "jour" }, conds: [], view: "both", sort: "value", top: 20 });
  return cfg;
}

let saveTimer = null;
function saveConfig() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try { if (CTX.enregistrer) await CTX.enregistrer(config); }
    catch (e) { showMsg("warn", "Configuration non enregistrée : " + (e && e.message ? e.message : e)); }
  }, 600);
}

// -----------------------------------------------------------------------------
// Copie de sécurité de la configuration dans une table du document.
// Elle survit au remplacement du code du widget (qui peut effacer les réglages du widget).
// -----------------------------------------------------------------------------
const CFG_TABLE = "Config_tableau_de_bord";
const dashName = () => (config.name || "Tableau de bord").trim() || "Tableau de bord";
let tableState = "Config, clé tableau_de_bord";                                        // « inconnue », « absente », « à jour », « erreur »

async function readCfgTable() {
  try { return await grist.docApi.fetchTable(CFG_TABLE); }
  catch (e) { return null; }                                        // la table n'existe pas encore
}
async function ensureCfgTable() {
  const t = await readCfgTable(); if (t) return t;
  await grist.docApi.applyUserActions([
    ["AddRawTable", CFG_TABLE],                                     // table sans page (visible dans « Données brutes »)
    ["AddColumn", CFG_TABLE, "Nom", { type: "Text", isFormula: false }],
    ["AddColumn", CFG_TABLE, "Configuration", { type: "Text", isFormula: false }],
    ["AddColumn", CFG_TABLE, "Mise_a_jour", { type: "DateTime:Europe/Paris", isFormula: false }],
    ["RemoveColumn", CFG_TABLE, "A"], ["RemoveColumn", CFG_TABLE, "B"], ["RemoveColumn", CFG_TABLE, "C"],
  ]);
  return await readCfgTable();
}
async function saveToTable() {
  return;   // v2 : la configuration est dans Config (clé tableau_de_bord)
  if (!window.grist || !grist.docApi || accessLevel && accessLevel !== "full") return;
  try {
    const t = await ensureCfgTable(); if (!t) throw new Error("table introuvable");
    const json = JSON.stringify(config), now = Date.now() / 1000;
    const k = (t.Nom || []).findIndex(n => n === dashName());
    if (k >= 0) { if (t.Configuration[k] !== json) await grist.docApi.applyUserActions([["UpdateRecord", CFG_TABLE, t.id[k], { Configuration: json, Mise_a_jour: now }]]); }
    else await grist.docApi.applyUserActions([["AddRecord", CFG_TABLE, null, { Nom: dashName(), Configuration: json, Mise_a_jour: now }]]);
    tableState = "à jour";
  } catch (e) { tableState = "erreur : " + (e && e.message ? e.message : e); }
  renderDiagOnly();
}
// Au chargement : si le widget n'a plus de configuration, on la reprend dans la table
async function syncWithTable() {
  tableState = "Config (clé tableau_de_bord)"; return;
  if (!window.grist || !grist.docApi) return;
  const t = await readCfgTable();
  if (!t || !t.id || !t.id.length) {
    tableState = "absente";
    if (configLoaded) await saveToTable();                          // première utilisation : on crée la copie de sécurité
    return;
  }
  const names = t.Nom || [];
  if (!configLoaded) {
    let k = names.findIndex(n => n === dashName());
    if (k < 0 && names.length === 1) k = 0;
    if (k >= 0) {
      try {
        const cfg = JSON.parse(t.Configuration[k]);
        if (cfg && Array.isArray(cfg.blocks)) {
          config = cfg; configLoaded = true; tableState = "à jour";
          showMsg("ok", `Configuration « ${names[k]} » rechargée depuis la table ${CFG_TABLE} (${cfg.blocks.length} bloc(s)).`);
          try { await grist.setOption("tableau_de_bord", config); } catch (e) { }
          return;
        }
      } catch (e) { tableState = "erreur : configuration illisible"; }
    } else if (names.length > 1) {
      showMsg("warn", `Plusieurs tableaux de bord sont enregistrés dans la table ${CFG_TABLE} (${names.join(", ")}). Utilisez « Récupérer… » pour choisir.`);
    }
  } else await saveToTable();                                       // la configuration du widget fait foi : on met la table à jour
}

// =============================================================================
// Rendu
// =============================================================================
function showMsg(kind, text) { $("messages").innerHTML = text ? `<div class="msg ${kind}">${esc(text)}</div>` : ""; }

function colOptions(selected, { allowEmpty = false, emptyLabel = "—", filter = null } = {}) {
  const lost = selected && columns.length && !columns.some(c => c.id === selected)
    ? `<option value="${esc(selected)}" selected>⚠ ${esc(labelOf(selected))} — absente de cette table</option>` : "";
  const opts = lost + columns.filter(c => !filter || filter(c)).map(c => `<option value="${esc(c.id)}" ${c.id === selected ? "selected" : ""}>${esc(c.label)}</option>`).join("");
  return (allowEmpty ? `<option value="" ${!selected ? "selected" : ""}>${esc(emptyLabel)}</option>` : "") + opts;
}
const opt = (list, sel) => list.map(([v, l]) => `<option value="${v}" ${v === sel ? "selected" : ""}>${esc(l)}</option>`).join("");

function valueSuggestions(col) {
  if (!col || isDate(col)) return [];
  const counts = new Map();
  records.forEach(r => keysOf(col, r[col]).forEach(k => { if (k !== EMPTY) counts.set(k, (counts.get(k) || 0) + 1); }));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 200).map(e => e[0]);
}

function scopeHost(scope) {
  if (scope === "g") return { host: config, condKey: "filters", logicKey: "filtersLogic", ctx: null };
  const m = String(scope).match(/^([bcr])(\d+)$/), b = config.blocks[Number(m[2])];
  if (m[1] === "b") return { host: b, condKey: "conds", logicKey: "logic", ctx: b };
  const ref = m[1] === "r" ? (b.rows.ref = b.rows.ref || {}) : (b.measure.ref = b.measure.ref || {});
  return { host: ref, condKey: "conds", logicKey: "logic", ctx: { source: ref.table } };   // colonnes de la table de référence
}
function logicOf(scope) { const h = scopeHost(scope); return (h.host[h.logicKey] = h.host[h.logicKey] || { mode: "and", expr: "" }); }
function condEditor(scope, conds) {
  const sh = scopeHost(scope), n = (conds || []).length, lg = sh.host[sh.logicKey] || { mode: "and", expr: "" };
  const mode = lg.mode || "and", err = n > 1 && mode === "expr" ? logicError(conds, lg) : "";
  const logicBar = n < 2 ? "" : `<div class="cond logic">
      <span class="sub">Combiner</span>
      <select data-lscope="${scope}" data-lf="mode">${opt(LOGIC_MODES, mode)}</select>
      ${mode === "expr" ? `<input type="text" data-lscope="${scope}" data-lf="expr" value="${esc(lg.expr || "")}" placeholder="ex. 1 ET (2 OU 3)" style="min-width:200px" aria-label="Formule de combinaison des conditions">
        <span class="hint">Numéros des conditions, ET, OU, NON et parenthèses.</span>` : ""}
      ${err ? `<span class="warn">Formule à corriger : ${esc(err)}. En attendant, toutes les conditions s'appliquent (ET).</span>` : ""}</div>`;
  const list = (conds || []).map((c, i) => {
    const needVal = !NO_VALUE.has(c.op || "eq");
    const dl = `dl-${scope}-${i}`;
    const prec = isDate(c.col) && hasTime(c.col) ? (c.prec || "day") : "day";
    const precSel = isDate(c.col) && hasTime(c.col) && needVal && !["contains", "ncontains", "in"].includes(c.op)
      ? `<select data-scope="${scope}" data-ci="${i}" data-f="prec" title="Précision de la comparaison">${opt(DATE_PRECS, prec)}</select>` : "";
    const rk = c.rel && c.rel.kind ? c.rel.kind : "";
    const relSel = `<select data-scope="${scope}" data-ci="${i}" data-f="relkind" title="Date fixe ou relative, recalculée à chaque affichage">${opt(REL_KINDS, rk)}</select>`;
    const relN = rk === "daysago" || rk === "hoursago" ? `<input type="number" min="0" step="1" style="width:64px" data-scope="${scope}" data-ci="${i}" data-f="reln" value="${esc(String((c.rel && c.rel.n) ?? 1))}" aria-label="${rk === "daysago" ? "Nombre de jours" : "Nombre d'heures"}">` : "";
    const valInput = !needVal ? "" : isDate(c.col) && !["contains", "ncontains", "in"].includes(c.op) && rk
      ? precSel + relSel + relN + `<span class="hint">= ${esc(condText(c).replace(/^.*\(([^()]*)\)$/, "$1"))}</span>`
      : isDate(c.col) && !["contains", "ncontains", "in"].includes(c.op)
      ? precSel + relSel + (prec === "time"
        ? `<input type="time" data-scope="${scope}" data-ci="${i}" data-f="val" value="${esc(String(c.val || "").slice(0, 5))}">`
        : prec === "datetime"
        ? `<input type="datetime-local" data-scope="${scope}" data-ci="${i}" data-f="val" value="${esc(String(c.val || "").slice(0, 16))}">`
        : `<input type="date" data-scope="${scope}" data-ci="${i}" data-f="val" value="${esc(String(c.val || "").slice(0, 10))}">`)
      : `<input type="text" list="${dl}" data-scope="${scope}" data-ci="${i}" data-f="val" value="${esc(c.val ?? "")}" placeholder="${c.op === "in" ? "valeur 1 ; valeur 2" : "valeur"}">
         <datalist id="${dl}">${valueSuggestions(c.col).map(v => `<option value="${esc(v)}">`).join("")}</datalist>`;
    const link = n < 2 || i === 0 ? "" : mode === "or" ? "OU" : mode === "and" ? "ET" : "";
    return `<div class="cond">${n > 1 ? `<span class="num" title="Condition n° ${i + 1}">${link ? `<small>${link}</small> ` : ""}${i + 1}</span>` : ""}
      <select data-scope="${scope}" data-ci="${i}" data-f="col">${colOptions(c.col)}</select>
      <select data-scope="${scope}" data-ci="${i}" data-f="op">${opt(OPS, c.op || "eq")}</select>
      ${valInput}
      <button class="ghost" data-scope="${scope}" data-ci="${i}" data-act="delcond" title="Retirer cette condition">✕</button></div>`;
  }).join("");
  return `<div class="conds">${logicBar}${list || `<span class="hint">Aucune condition : toutes les lignes sont prises en compte.</span>`}</div>
    ${n > 1 && mode !== "and" && !err ? `<p class="hint">Lignes retenues : ${rich(condsText(conds, lg))}</p>` : ""}
    <div><button data-scope="${scope}" data-act="addcond">+ Condition</button></div>`;
}

function renderGlobal() {
  const f = config.filters || [];
  const lt = logicTree(f, config.filtersLogic);
  const chips = lt && !lt.error ? (f.some(c => c.col) ? `<span class="chip">${rich(condsText(f, config.filtersLogic))}</span>` : "")
    : f.filter(c => c.col).map(c => `<span class="chip">${rich(condText(c))}</span>`).join("");
  $("globalBox").innerHTML = `
    <div class="view-only">${chips ? `<div class="chips"><span class="sub">Filtres communs :</span>${chips}</div>` : ""}</div>
    <div class="edit-only card">
      <div class="row" style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
        <span class="sub">Nom de ce tableau de bord</span>
        <input type="text" id="dashName" value="${esc(dashName())}" style="min-width:220px" title="Sert à retrouver la configuration dans la table ${CFG_TABLE}">
        <span class="hint">Enregistré dans la table Config (clé tableau_de_bord)</span>
      </div>
      <div class="row" style="display:flex;gap:8px;align-items:center;margin-bottom:12px">
        <span class="sub">Chiffres clés dans le document Word</span>
        <select id="wordTilesLayout">${opt([["tiles", "en tuiles, comme à l'écran"], ["table", "en tableau à deux colonnes"]], (config.wordTiles || {}).layout || "tiles")}</select>
        ${((config.wordTiles || {}).layout || "tiles") === "tiles" ? `<select id="wordTilesPerRow">${opt([["2", "2 par ligne"], ["3", "3 par ligne"], ["4", "4 par ligne"]], String((config.wordTiles || {}).perRow || 3))}</select>` : ""}
        <select id="wordDeltaColor" title="Couleur des évolutions (▲ ▼) en pied de carte dans le document Word">${opt([["color", "évolutions en couleur"], ["black", "évolutions en noir"]], (config.wordTiles || {}).deltaColor || "color")}</select>
      </div>
      <h2>Filtres rapides proposés aux lecteurs</h2>
      <div class="desc">Ils apparaissent en haut du tableau de bord, hors mode modification. Chaque lecteur filtre pour lui-même, sans changer le tableau de bord des autres.</div>
      <div class="chips" style="margin:6px 0 4px">${(config.quickFilters || []).map((c, k) => `<span class="chip">${esc(plain(labelOf(c)))}${isDate(c) ? " (période)" : ""} <button class="ghost" data-act="delqf" data-k="${k}" aria-label="Retirer ce filtre rapide">✕</button></span>`).join("") || `<span class="hint">Aucun filtre rapide pour l'instant.</span>`}</div>
      <div class="row" style="display:flex;gap:6px;align-items:center;margin-bottom:12px">
        <select id="qfAddCol">${colOptions("", { allowEmpty: true, emptyLabel: "Choisir une colonne…", filter: c => !(config.quickFilters || []).includes(c.id) })}</select>
        <button data-act="addqf">+ Filtre rapide</button></div>

      <h2>Filtres communs à tout le tableau de bord</h2>
      <div class="desc">Ces conditions s'appliquent à tous les blocs, en plus des conditions propres à chaque bloc.</div>
      <div style="margin-top:8px">${condEditor("g", f)}</div>
    </div>`;
}

function blockEditor(b, i) {
  const s = `b${i}`;
  const numFilter = c => true;
  const tables = refTables();
  const refPick = (k, ref, withExpect) => {
    const rc = refColumns(ref.table), L = refList(ref, k === "rows.ref" ? b.rows.grain : undefined);
    const nums = rc.filter(c => /^(Numeric|Int)$/.test(c.type));
    return `<select data-b="${i}" data-k="${k}.table">${opt([["", withExpect ? "Sans liste de référence" : "Table de référence…"], ...tables.map(t => [t, "Table " + t])], ref.table || "")}</select>
      ${ref.table ? `<select data-b="${i}" data-k="${k}.col">${opt([["", "Colonne de la liste…"], ...rc.map(c => [c.id, c.label])], ref.col || "")}</select>` : ""}
      ${ref.table && withExpect ? `<select data-b="${i}" data-k="${k}.expect" title="Ajoute au tableau une colonne « Attendu » et un taux (valeur ÷ attendu)">${opt([["", "Sans valeur attendue"], ["__count", "Attendu : nombre de lignes de la référence"], ...nums.map(c => [c.id, "Attendu : somme de " + c.label])], ref.expect || "")}</select>
        <label><input type="checkbox" data-b="${i}" data-k="${k}.only" ${ref.only ? "checked" : ""}> Masquer les valeurs absentes de la liste</label>` : ""}
      ${ref.table && withExpect && ref.expect ? `<input type="text" data-b="${i}" data-k="${k}.expLabel" value="${esc(ref.expLabel || "")}" placeholder="Attendu" title="Nom de la colonne de référence" style="width:150px">
        <input type="text" data-b="${i}" data-k="${k}.rateLabel" value="${esc(ref.rateLabel || "")}" placeholder="Taux" title="Nom de la colonne du ratio" style="width:110px">
        ${b.cols && b.cols.col ? `<label title="Ajoute dans chaque case le pourcentage de la valeur de référence de sa ligne"><input type="checkbox" data-b="${i}" data-k="${k}.perCol" ${ref.perCol ? "checked" : ""}> Ratio dans chaque colonne</label>` : ""}` : ""}
      ${ref.table && ref.col ? `<span class="hint">${L.state === "ok" ? `${L.size} valeur(s) dans la liste${L.rows < L.total ? ` · ${fmtNum(L.rows)} ligne(s) de la référence retenue(s) sur ${fmtNum(L.total)}` : ""}` : esc(refStateText(L))}</span>` : ""}`;
  };
  const refFilter = (k, ref) => !ref.table ? "" : `<div class="row" style="align-items:flex-start"><span class="lbl">Filtrer la référence</span><div style="flex:1">
      ${inSrc({ source: ref.table }, () => condEditor((k === "rows.ref" ? "r" : "c") + i, ref.conds))}
      <p class="hint">Seules les lignes de « ${esc(ref.table)} » qui remplissent ces conditions comptent dans la liste et dans l'attendu (ex. Type d'établissement = Lycée).</p></div></div>`;
  const aggList = b.type === "tile" ? AGGS : AGGS.filter(a => a[0] !== "cover");
  const measure = `<div class="row"><span class="lbl">Mesure</span>
      <select data-b="${i}" data-k="measure.agg">${opt(aggList, b.measure.agg || "count")}</select>
      ${b.measure.agg && b.measure.agg !== "count" ? `<select data-b="${i}" data-k="measure.col">${colOptions(b.measure.col, { allowEmpty: true, emptyLabel: "Choisir une colonne…", filter: numFilter })}</select>` : ""}
    </div>${isCover(b) ? `<div class="row"><span class="lbl">Liste attendue</span>${refPick("measure.ref", b.measure.ref || {}, false)}</div>${refFilter("measure.ref", b.measure.ref || {})}
      <p class="hint">Compte les valeurs de la liste (par exemple les 30 académies) qui apparaissent au moins une fois dans « ${esc(labelOf(b.measure.col || "?"))} ». Un clic sur le chiffre montre celles qui n'ont pas répondu. Les majuscules, accents et tirets ne comptent pas dans la comparaison.</p>` : ""}`;
  const grains = [["jour", "par jour"], ["semaine", "par semaine"], ["mois", "par mois"], ["annee", "par année"]];
  const dim = (k, d, emptyLabel) => `<select data-b="${i}" data-k="${k}.col">${colOptions(d.col, { allowEmpty: k === "cols", emptyLabel })}</select>
      ${d.col && isDate(d.col) ? `<select data-b="${i}" data-k="${k}.grain">${opt(grains, d.grain || "jour")}</select>` : ""}
      ${k === "rows" && d.col && !isDate(d.col) ? `<select data-b="${i}" data-k="${k}.grain" title="Pour la carte : rattacher chaque valeur à un département ou une académie">${opt(GEO_GRAINS, GEO_T[d.grain] ? d.grain : "")}</select>` : ""}`;
  const cross = b.type !== "cross" ? "" : `
    <div class="row"><span class="lbl">Lignes</span>${dim("rows", b.rows, "")}</div>
    ${b.rows.col && !isDate(b.rows.col) ? `<div class="row"><span class="lbl">Compléter avec</span>${refPick("rows.ref", b.rows.ref || {}, true)}</div>${refFilter("rows.ref", b.rows.ref || {})}` : ""}
    <div class="row"><span class="lbl">Colonnes</span>${dim("cols", b.cols, "Aucune (une seule colonne de résultat)")}
      ${b.cols && b.cols.col && !isDate(b.cols.col) ? `<select data-b="${i}" data-k="colSort" title="Ordre des colonnes du tableau et des séries du graphique">${opt([["value", "colonnes : par valeur décroissante"], ["label", "colonnes : de A à Z"], ["labeldesc", "colonnes : de Z à A"]], b.colSort || "value")}</select>` : ""}</div>
    <div class="row"><span class="lbl">Affichage</span>
      <select data-b="${i}" data-k="view">${opt([["both", "Graphique et tableau"], ["table", "Tableau seul"], ["chart", "Graphique seul"]], b.view || "both")}</select>
      <select data-b="${i}" data-k="sort">${opt([["value", "Tri par valeur décroissante"], ["label", "Tri alphabétique ou chronologique"]], b.sort || "value")}</select>
      <label title="Nombre de lignes du tableau et du graphique ; 0 = toutes">Lignes affichées <input type="number" min="0" style="width:70px" data-b="${i}" data-k="top" value="${b.top === 0 ? 0 : (b.top || 20)}"> <span class="hint">(0 = toutes)</span></label>
      <label><input type="checkbox" data-b="${i}" data-k="percent" ${b.percent ? "checked" : ""}> Afficher en % du total</label>
    </div>
    <div class="row"><span class="lbl">Graphique</span>
      <select data-b="${i}" data-k="chart">${opt(CHART_TYPES, b.chart || "barh")}</select>
      ${b.chart === "map" ? mapEditor(b, i) : b.chart === "points" ? pointsEditor(b, i) : `${b.cols && b.cols.col && (b.chart || "barh") !== "pie" ? `<select data-b="${i}" data-k="stack">${opt(STACK_MODES, b.stack || "stack")}</select>` : ""}
      <select data-b="${i}" data-k="labels" title="Pourcentage d'une barre : part du total du bloc. Avec des séries : part de la barre.">${opt(LABEL_MODES, b.labels || "auto")}</select>
      <label>Dans Word <select data-b="${i}" data-k="wordChart">${opt([["native", "graphique Word modifiable"], ["image", "image"]], b.wordChart || "native")}</select></label>`}
    </div>`;
  const others = b.type !== "tile" ? [] : config.blocks.filter(x => x !== b && x.type === "tile" && !(x.card && (x.card.sub || x.card.prev || x.card.ref))).map(x => [x.id, plain(x.title || measureText(x.measure))]);
  const cd = cardOf(b), tileSel = (k, val) => `<select data-b="${i}" data-k="card.${k}">${opt([["", "aucune"], ...others], val || "")}</select>`;
  const lblIn = (k, val, ph) => `<input type="text" data-b="${i}" data-k="card.${k}" value="${esc(val || "")}" placeholder="${esc(ph)}" style="min-width:160px">`;
  const card = b.type !== "tile" ? "" : `<details data-detailbox="${esc(b.id)}-card" ${detailOpen.has(b.id + "-card") ? "open" : ""}><summary><span class="lbl">Présentation en carte</span>
      <span class="hint">sous-chiffre, comparaison en bas à gauche, référence en bas à droite</span></summary>
      <div class="row"><span class="lbl">Sous-chiffre</span>${cd.sub ? `<select data-b="${i}" data-k="card.subWord" title="Mot placé devant le sous-chiffre">${opt([["dont", "dont"], ["pour", "pour"], ["sur", "sur"], ["soit", "soit"], ["", "(sans mot)"]], cd.subWord === undefined ? "dont" : cd.subWord)}</select>` : ""}${tileSel("sub", cd.sub)}${cd.sub ? lblIn("subLabel", cd.subLabel, "ex. collèges, signalements") : ""}</div>
      <div class="row"><span class="lbl">Bas gauche (comparaison)</span>${tileSel("prev", cd.prev)}
        ${cd.prev ? lblIn("prevLabel", cd.prevLabel, "ex. Veille même heure") + `<select data-b="${i}" data-k="card.deltaMode">${opt(DELTA_MODES, cd.deltaMode || "pct")}</select><select data-b="${i}" data-k="card.sense">${opt(DELTA_SENSES, cd.sense || "bad")}</select>` : ""}</div>
      <div class="row"><span class="lbl">Bas droite (référence)</span>${tileSel("ref", cd.ref)}${cd.ref ? lblIn("refLabel", cd.refLabel, "ex. Pic · 1er oct. 17 h 15") : ""}</div>
      <p class="hint">Chaque chiffre vient d'une autre tuile, qui garde ses propres conditions. Les tuiles rattachées sont masquées hors mode modification et dans Word. Libellé vide : le titre de la tuile est repris.</p></details>`;
  const pct = b.type !== "tile" ? "" : isCover(b) ? `<div class="row"><label><input type="checkbox" data-b="${i}" data-k="shareMain" ${b.shareMain ? "checked" : ""}> Mettre le pourcentage en grand</label></div>` : `<div class="row"><label><input type="checkbox" data-b="${i}" data-k="showShare" ${b.showShare ? "checked" : ""}> Afficher le pourcentage : même mesure avec les conditions du bloc ÷ même mesure sans elles</label>
      ${b.showShare ? `<label><input type="checkbox" data-b="${i}" data-k="shareMain" ${b.shareMain ? "checked" : ""}> Mettre le pourcentage en grand</label>` : ""}</div>`;
  const srcSel = `<div class="row"><span class="lbl">Source</span>
      <select data-b="${i}" data-k="source" data-prev="${esc(isMainSrc(b) ? "" : b.source)}">${opt([["", `Table du widget${mainTable ? " (" + mainTable + ")" : ""}`], ...refTables().map(t => [t, "Table " + t])], isMainSrc(b) ? "" : b.source)}</select>
      <span class="hint">Les conditions et colonnes proposées sont celles de cette table. Filtres communs et rapides : appliqués quand la table a une colonne du même nom.</span></div>`;
  const nc = (b.conds || []).filter(c => c.col).length;
  const resume = [isMainSrc(b) ? "" : "table " + b.source, plain(measureText(b.measure)), nc ? `${nc} condition${nc > 1 ? "s" : ""}` : "sans condition"].filter(Boolean).join(" · ");
  return `<details class="edbox edit-only" data-detailbox="${esc(b.id)}-ed" ${detailOpen.has(b.id + "-ed") ? "open" : ""}>
    <summary><span class="lbl">Réglages</span> <span class="hint">${esc(resume)}</span></summary>
    <div class="editor">
    ${srcSel}
    <div class="row"><span class="lbl">Titre</span><input type="text" style="flex:1;min-width:200px" data-b="${i}" data-k="title" value="${esc(b.title || "")}"></div>
    ${measure}${cross}${pct}${card}
    <div class="row"><span class="lbl">Rappel du calcul</span>
      <textarea rows="2" style="flex:1;min-width:240px;font:inherit;color:var(--ink);background:var(--surface);border:1px solid var(--axis);border-radius:6px;padding:4px 6px" data-b="${i}" data-k="desc" placeholder="${esc(plain(autoDesc(b)))}" ${b.hideDesc ? "disabled" : ""}>${esc(b.desc || "")}</textarea>
      ${String(b.desc || "").trim() ? `<button class="ghost" data-act="autodesc" data-b="${i}" title="Effacer le texte saisi et revenir au rappel automatique">Texte automatique</button>` : ""}</div>
    <div class="row"><span class="hint">Laissez vide pour le texte automatique (affiché en grisé). Saisi, votre texte le remplace à l'écran et dans les exports ; <b>{calcul}</b> y insère le texte automatique, *texte* le met en gras.</span></div>
    <div class="row"><label><input type="checkbox" data-b="${i}" data-k="hideDesc" ${b.hideDesc ? "checked" : ""}> Masquer le rappel du calcul (sous le titre, à l'écran et dans les exports)</label></div>
    <details data-detailbox="${esc(b.id)}" ${detailOpen.has(b.id) ? "open" : ""}><summary><span class="lbl">Colonnes du détail</span>
      <span class="hint">${(b.detailCols || []).length ? `${b.detailCols.length} colonne(s) choisie(s)` : "choix automatique"} · affichées au clic sur un chiffre, une barre ou une case</span></summary>
      <div class="chips" style="margin-top:6px">${columns.map(c => `<label class="chip" style="display:inline-flex;gap:4px;align-items:center"><input type="checkbox" data-bdetail="${i}" data-col="${esc(c.id)}" ${(b.detailCols || []).includes(c.id) ? "checked" : ""}> ${esc(plain(c.label))}</label>`).join("")}</div>
      <p class="hint">Aucune case cochée : le widget montre les colonnes du bloc et les colonnes courtes.${(b.detailCols || []).length ? ` <button class="ghost" data-act="clrdetail" data-b="${i}">Revenir au choix automatique</button>` : ""}</p></details>
    <div class="row" style="align-items:flex-start"><span class="lbl">Conditions</span><div style="flex:1">${condEditor(s, b.conds)}</div></div>
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

function baseRows(except) { return records.filter(r => passAll(r, config.filters, config.filtersLogic) && quickPass(r, except)); }

// ---- Présentation en carte : « dont … », comparaison (bas gauche) et référence (bas droite), chacune issue d'une autre tuile
const blockById = id => config.blocks.find(x => x.id === id) || null;
const indexOfId = id => config.blocks.findIndex(x => x.id === id);
const cardOf = b => b.card || {};
// tuiles rattachées à une autre : masquées hors mode modification, dans l'écran comme dans Word
function attachedTo(b) {
  return config.blocks.find(x => x !== b && x.type === "tile" && x.card && [x.card.sub, x.card.prev, x.card.ref].includes(b.id)) || null;
}
// valeur affichée d'une tuile (nombre ou pourcentage si « pourcentage en grand »)
function tileMain(b, base) {
  const t = tileNumbers(b, base), hasShare = (b.showShare || isCover(b)) && !isNaN(t.share);
  return hasShare && b.shareMain ? { text: `${fmtNum(t.share)} %`, num: t.share } : { text: fmtNum(t.v), num: t.v };
}
const DELTA_MODES = [["pct", "évolution en %"], ["abs", "écart en nombre"], ["both", "écart et %"], ["none", "sans évolution"]];
const DELTA_SENSES = [["bad", "hausse = défavorable (rouge)"], ["good", "hausse = favorable (vert)"], ["neutral", "neutre (gris)"]];
// évolution du chiffre principal par rapport à la tuile de comparaison
function deltaOf(b, cur, prev) {
  const c = cardOf(b), mode = c.deltaMode || "pct";
  if (mode === "none" || isNaN(cur) || isNaN(prev)) return null;
  const diff = cur - prev, pct = prev ? diff / prev * 100 : NaN;
  const sign = v => (v > 0 ? "+" : v < 0 ? "−" : "") + nf.format(Math.abs(Math.round(v * 10) / 10));
  const arrow = diff > 0 ? "▲" : diff < 0 ? "▼" : "=";
  const p = Math.abs(pct) >= 10 ? Math.round(pct) : pct;            // au-delà de 10 %, pas de décimale
  let txt = mode === "abs" || isNaN(pct) ? sign(diff) : mode === "both" ? `${sign(diff)} (${sign(p)} %)` : `${sign(p)} %`;
  if (diff === 0) txt = "stable";
  const sense = c.sense || "bad";
  const tone = diff === 0 || sense === "neutral" ? "neutral" : (diff > 0) === (sense === "good") ? "good" : "bad";
  return { text: (diff === 0 ? txt : `${arrow} ${txt}`).replace(/ /g, "\u00a0"), tone };   // insécables : l'évolution ne se coupe pas
}
// éléments de la carte calculés une fois (écran et Word)
function cardParts(b, base) {
  const c = cardOf(b), out = {};
  const sb = c.sub && blockById(c.sub), pb = c.prev && blockById(c.prev), rb = c.ref && blockById(c.ref);
  const word = c.subWord === undefined ? "dont" : c.subWord;           // « dont » par défaut, ou « pour », « sur », « soit »…
  if (sb) out.sub = { text: `${word ? word + " " : ""}${tileMain(sb).text}${c.subLabel ? " " + c.subLabel : ""}`, i: indexOfId(sb.id) };
  if (pb) { const m = tileMain(pb); out.prev = { label: c.prevLabel || pb.title || measureText(pb.measure), value: m.text, i: indexOfId(pb.id), delta: deltaOf(b, tileMain(b, base).num, m.num) }; }
  if (rb) out.ref = { label: c.refLabel || rb.title || measureText(rb.measure), value: tileMain(rb).text, i: indexOfId(rb.id) };
  return out;
}

function renderTile(b, i, base) {
  const t = tileNumbers(b, base), v = t.v;
  const conds = condsText(b.conds, b.logic);
  const unit = shareUnit(b);
  const hasShare = (b.showShare || isCover(b)) && !isNaN(t.share);
  const main = hasShare && b.shareMain ? `${fmtNum(t.share)} %` : fmtNum(v);
  const share = !hasShare ? "" : b.shareMain
    ? `<div class="part">${fmtNum(v)} sur ${fmtNum(t.all)}${unit ? " " + esc(unit) : ""}</div>`
    : `<div class="part">${fmtNum(t.share)} % (sur ${fmtNum(t.all)}${unit ? " " + esc(unit) : ""})</div>`;
  return `<div class="card tile${attachedTo(b) ? " attached" : ""}" data-bi="${i}">
    <div class="card-head"><div class="t"><h2>${rich(b.title || measureText(b.measure))}</h2>
      ${b.hideDesc ? "" : `<div class="desc">${rich(blockDesc(b))}</div>`}</div>${blockTools(i)}</div>
    <div class="value"${drillCell(i, null, null)} title="${isCover(b) ? "Voir la liste : qui a répondu, qui manque" : "Voir le détail des lignes"}">${main}</div>${share}
    ${(() => { const cp = cardParts(b, base); const att = attachedTo(b);
      return (cp.sub ? `<div class="part"><span${drillCell(cp.sub.i, null, null)}>${rich(cp.sub.text)}</span></div>` : "")
        + (cp.prev || cp.ref ? `<div class="kfoot"><span>${cp.prev ? `${rich(cp.prev.label)}<br><b${drillCell(cp.prev.i, null, null)}>${esc(cp.prev.value)}</b>${cp.prev.delta ? ` <span class="d-${cp.prev.delta.tone}">${esc(cp.prev.delta.text)}</span>` : ""}` : ""}</span>
            <span class="r">${cp.ref ? `${rich(cp.ref.label)}<br><b${drillCell(cp.ref.i, null, null)}>${esc(cp.ref.value)}</b>` : ""}</span></div>` : "")
        + (att ? `<span class="attached-badge edit-only">Rattachée à « ${esc(plain(att.title || "tuile"))} » · masquée hors modification</span>` : ""); })()}
    ${srcNote(b)}${missingColsNote(b)}
    ${isCover(b) ? `<div class="part">${t.cover && t.cover.ok ? esc(coverNote(t.cover)) : esc(refStateText(t.cover ? t.cover.L : { state: "unset" }))}</div>` : ""}
    ${blockEditor(b, i)}</div>`;
}

// Calcul d'un tableau croisé
function crossData(b, base) {
  const rows = base.filter(r => passAll(r, b.conds, b.logic));
  const rc = b.rows.col, cc = b.cols && b.cols.col;
  const rg = b.rows.grain, cg = b.cols && b.cols.grain;
  const byRow = new Map(), byCol = new Map(), cells = new Map();
  const push = (map, k, r) => { let a = map.get(k); if (!a) map.set(k, a = []); a.push(r); };
  rows.forEach(r => {
    const rks = rc ? [...new Set(keysOf(rc, r[rc], rg))] : ["Total"];
    const cks = cc ? [...new Set(keysOf(cc, r[cc], cg))] : [null];
    rks.forEach(rk => { push(byRow, rk, r); cks.forEach(ck => { push(cells, rk + "\u0001" + ck, r); }); });
    cks.forEach(ck => { if (ck !== null) push(byCol, ck, r); });
  });
  const m = b.measure;
  let rowKeys = [...byRow.keys()];
  const rowVal = new Map(rowKeys.map(k => [k, aggregate(byRow.get(k), m)]));
  // liste de référence : valeurs sans réponse ajoutées à 0, valeur attendue par ligne
  const L = rc && !isDate(rc) && b.rows.ref ? refList(b.rows.ref, rg) : { state: "unset" };
  let expected = null, missingKeys = new Set(), outsideKeys = new Set();
  if (L.state === "ok") {
    const have = new Set(rowKeys.map(refNorm));
    rowKeys.forEach(k => { if (!L.map.has(refNorm(k))) outsideKeys.add(k); });
    if (b.rows.ref.only) { rowKeys = rowKeys.filter(k => !outsideKeys.has(k)); }
    L.map.forEach((e, nk) => { if (!have.has(nk)) { rowKeys.push(e.label); missingKeys.add(e.label); rowVal.set(e.label, ADDITIVE.has(m.agg || "count") || m.agg === "distinct" ? 0 : NaN); } });
    if (b.rows.ref.expect) expected = new Map(rowKeys.map(k => [k, L.expected(refNorm(k))]));
  }
  const chrono = rc && isDate(rc);
  if (b.sort === "label" || (chrono && b.sort !== "value"))
    rowKeys.sort((a, c) => (a === EMPTY) - (c === EMPTY) || a.localeCompare(c, "fr", { numeric: true }));
  else rowKeys.sort((a, c) => (rowVal.get(c) || 0) - (rowVal.get(a) || 0) || a.localeCompare(c, "fr"));
  let colKeys = cc ? [...byCol.keys()] : [];
  const colVal = new Map(colKeys.map(k => [k, aggregate(byCol.get(k), m)]));
  if (cc && isDate(cc)) colKeys.sort((a, c) => (a === EMPTY) - (c === EMPTY) || a.localeCompare(c));
  else if (b.colSort === "label") colKeys.sort((a, c) => (a === EMPTY) - (c === EMPTY) || keyLabel(cc, a, cg).localeCompare(keyLabel(cc, c, cg), "fr", { numeric: true }));
  else if (b.colSort === "labeldesc") colKeys.sort((a, c) => (a === EMPTY) - (c === EMPTY) || keyLabel(cc, c, cg).localeCompare(keyLabel(cc, a, cg), "fr", { numeric: true }));
  else colKeys.sort((a, c) => (colVal.get(c) || 0) - (colVal.get(a) || 0) || a.localeCompare(c, "fr"));
  const val = (rk, ck) => { const a = cells.get(rk + "\u0001" + ck); return a ? aggregate(a, m) : (ADDITIVE.has(m.agg || "count") ? 0 : NaN); };
  const keptRows = L.state === "ok" && b.rows.ref.only ? rows.filter(r => keysOf(rc, r[rc], rg).some(k => !outsideKeys.has(k))) : rows;
  const total = aggregate(keptRows, m);
  // couleurs des séries : attribuées par l'ordre des valeurs sur l'ensemble des données (stable quand on filtre)
  const colorOf = new Map();
  if (cc) {
    const all = new Map();
    records.forEach(r => keysOf(cc, r[cc], cg).forEach(k => all.set(k, (all.get(k) || 0) + 1)));
    const ordered = [...all.entries()].sort((a, c) => c[1] - a[1] || a[0].localeCompare(c[0], "fr")).map(e => e[0]);
    ordered.forEach((k, j) => colorOf.set(k, j < MAX_SERIES ? `var(${SERIES[j]})` : "var(--other)"));
  }
  const expTotal = expected ? [...expected.values()].filter(v => !isNaN(v)).reduce((a, v) => a + v, 0) : NaN;
  return { refCfg: b.rows && b.rows.ref || {}, rows, rowKeys, colKeys, rowVal, colVal, val, total, colorOf, rc, cc, rg, cg, refState: L, expected, expTotal, missingKeys, outsideKeys };
}
// colonnes « Attendu » et « Taux » d'un tableau croisé complété par une liste de référence
const rateOf = (v, e) => isNaN(v) || isNaN(e) || !e ? NaN : v / e * 100;
const fmtPct = v => isNaN(v) ? "–" : nf.format(Math.round(v * 10) / 10) + " %";
function expectCells(d) {
  if (!d.expected) return null;
  const rc = d.refCfg || {};
  return { head: [rc.expLabel || "Attendu", rc.rateLabel || "Taux"], row: rk => [fmtNum(d.expected.get(rk)), fmtPct(rateOf(d.rowVal.get(rk), d.expected.get(rk)))],
    raw: rk => [d.expected.get(rk), rateOf(d.rowVal.get(rk), d.expected.get(rk))], total: [fmtNum(d.expTotal), fmtPct(rateOf(d.total, d.expTotal))], rawTotal: [d.expTotal, rateOf(d.total, d.expTotal)] };
}
// ratio d'une case (colonne) rapportée à la valeur de référence de sa ligne, si demandé
const cellRatio = (d, rk, v) => d.expected && d.refCfg && d.refCfg.perCol ? rateOf(v, rk === null ? d.expTotal : d.expected.get(rk)) : NaN;
const withRatio = (txt, r) => isNaN(r) ? txt : `${txt} (${fmtPct(r)})`;
function refNote(b, d) {
  if (!b.rows.ref || !b.rows.ref.table) return "";
  if (d.refState.state !== "ok") return `<p class="hint">${esc(refStateText(d.refState))}</p>`;
  const parts = [`${d.refState.size} valeur(s) dans la liste « ${b.rows.ref.col} »`, `${d.missingKeys.size} sans réponse (à 0)`];
  if ((b.rows.ref.conds || []).some(c => c && c.col)) parts.push(`référence filtrée : ${inSrc({ source: b.rows.ref.table }, () => condsText(b.rows.ref.conds, b.rows.ref.logic))} (${fmtNum(d.refState.rows)} ligne(s) sur ${fmtNum(d.refState.total)})`);
  if (d.outsideKeys.size) parts.push(b.rows.ref.only ? `${d.outsideKeys.size} valeur(s) hors liste masquée(s)` : `${d.outsideKeys.size} valeur(s) hors liste : ${[...d.outsideKeys].slice(0, 5).join(", ")}${d.outsideKeys.size > 5 ? "…" : ""}`);
  return `<p class="hint">${esc(parts.join(" · "))}</p>`;
}

function renderCross(b, i, base) {
  const d = crossData(b, base);
  const conds = condsText(b.conds, b.logic);
  const head = `<div class="card-head"><div class="t"><h2>${rich(b.title || measureText(b.measure))}</h2>
      ${b.hideDesc ? "" : `<div class="desc">${rich(blockDesc(b))}</div>`}</div>
      ${exportTools(i)}${blockTools(i)}</div>`;
  if (!b.rows.col) return `<div class="card" data-card="${i}" data-bi="${i}">${head}<div class="empty">Choisissez une colonne pour les lignes (bouton « Modifier le tableau de bord »).</div>${blockEditor(b, i)}</div>`;
  if (!d.rows.length && !d.missingKeys.size) return `<div class="card" data-card="${i}" data-bi="${i}">${head}<div class="empty">Aucune ligne ne correspond aux conditions.</div>${srcNote(b)}${missingColsNote(b)}${blockEditor(b, i)}</div>`;
  const top = topOf(b);
  const shownRows = d.rowKeys.slice(0, top);
  const pct = b.percent && ADDITIVE.has(b.measure.agg || "count") && d.total;
  const show = v => pct ? (isNaN(v) ? "–" : nf.format(v / d.total * 100) + " %") : fmtNum(v);
  const view = b.view || "both";
  let chart = "", table = "";
  if (view !== "table") chart = renderChart(b, d, shownRows, i);
  if (view !== "chart") {
    const rl = k => rich(keyLabel(d.rc, k, d.rg));
    const cl = k => rich(keyLabel(d.cc, k, d.cg));
    const maxCell = d.cc ? Math.max(...shownRows.flatMap(rk => d.colKeys.map(ck => d.val(rk, ck) || 0)), 1) : 1;
    const heat = v => (!d.cc || isNaN(v) || !v) ? "" : ` style="background: rgba(var(--heat), ${(0.06 + 0.34 * v / maxCell).toFixed(3)})"`;
    const ex = expectCells(d);
    const headRow = `<tr><th>${rich(rowHead(d.rc, d.rg))}</th>${d.colKeys.map(ck => `<th>${cl(ck)}</th>`).join("")}<th class="total">${d.cc ? "Total" : esc(measureText(b.measure))}</th>${ex ? ex.head.map(h => `<th>${h}</th>`).join("") : ""}</tr>`;
    const body = shownRows.map(rk => `<tr${d.missingKeys.has(rk) ? ' class="missing"' : ""}><td${drillCell(i, rk, null)}>${rl(rk)}</td>${d.colKeys.map(ck => { const v = d.val(rk, ck); const r = cellRatio(d, rk, v); return `<td${heat(v)}${drillCell(i, rk, ck)}>${show(v)}${isNaN(r) ? "" : ` <span class="hint">${fmtPct(r)}</span>`}</td>`; }).join("")}<td class="total"${drillCell(i, rk, null)}>${show(d.rowVal.get(rk))}</td>${ex ? ex.row(rk).map(c => `<td>${c}</td>`).join("") : ""}</tr>`).join("");
    const rest = d.rowKeys.length > top ? `<tr><td colspan="${d.colKeys.length + 2 + (ex ? 2 : 0)}" class="hint">${d.rowKeys.length - top} autre(s) ligne(s) non affichée(s) : augmentez « Lignes affichées » ou téléchargez le CSV.</td></tr>` : "";
    const totalRow = `<tr class="total"><td${drillCell(i, null, null)}>Total</td>${d.colKeys.map(ck => { const r = cellRatio(d, null, d.colVal.get(ck)); return `<td${drillCell(i, null, ck)}>${show(d.colVal.get(ck))}${isNaN(r) ? "" : ` <span class="hint">${fmtPct(r)}</span>`}</td>`; }).join("")}<td${drillCell(i, null, null)}>${show(d.total)}</td>${ex ? ex.total.map(c => `<td>${c}</td>`).join("") : ""}</tr>`;
    table = `<div class="tbl-wrap"><table><thead>${headRow}</thead><tbody>${body}${rest}${totalRow}</tbody></table></div>`;
  }
  const note = !ADDITIVE.has(b.measure.agg || "count") && (d.cc || true)
    ? `<p class="hint">Les totaux sont recalculés sur l'ensemble des lignes concernées${b.measure.agg === "distinct" ? " (une même valeur n'est comptée qu'une fois)" : ""}.</p>` : "";
  const multi = (d.rc && records.some(r => Array.isArray(r[d.rc]))) || (d.cc && records.some(r => Array.isArray(r[d.cc])));
  const noteMulti = multi ? `<p class="hint">Une ligne ayant plusieurs valeurs dans une liste de choix est comptée dans chacune : la somme des lignes peut dépasser le total.</p>` : "";
  return `<div class="card" data-card="${i}" data-bi="${i}">${head}${chart}${table}${srcNote(b)}${missingColsNote(b)}${refNote(b, d)}${ADDITIVE.has(b.measure.agg || "count") ? "" : note}${noteMulti}${blockEditor(b, i)}</div>`;
}

// =============================================================================
// Graphiques : description commune (écran + Word), puis rendu SVG
// =============================================================================
const CHART_TYPES = [["barh", "Barres horizontales"], ["barv", "Colonnes (histogramme)"], ["line", "Courbe"], ["pie", "Anneau (répartition)"], ["map", "Carte (départements ou académies)"], ["points", "Carte des établissements (points)"]];
const STACK_MODES = [["stack", "Séries empilées"], ["group", "Séries côte à côte"], ["pct", "Empilées à 100 %"]];
const PIE_MAX = 6;

// Données d'un graphique : catégories (lignes du tableau croisé) et séries (colonnes)
// Nombre de lignes à afficher : « Lignes affichées » du bloc, 0 = toutes
function topOf(b) { return Number(b.top) === 0 && b.top !== undefined && b.top !== null && b.top !== "" ? Infinity : Math.max(1, Number(b.top) || 20); }

function chartSpec(b, d, shownRows) {
  const agg = b.measure.agg || "count", additive = ADDITIVE.has(agg);
  const type = b.chart || "barh";
  let mode = d.cc ? (b.stack || "stack") : "single";
  const notes = [];
  if (d.cc && !additive && mode !== "group") { mode = "group"; notes.push("Séries affichées côte à côte : une moyenne, un minimum, un maximum ou un nombre de valeurs distinctes ne s'additionnent pas."); }
  const pctTotal = b.percent && additive && d.total ? d.total : null;
  const scale = v => (v === null || v === undefined || isNaN(v)) ? null : pctTotal ? v / pctTotal * 100 : v;
  const unit = pctTotal ? " %" : "";

  if (type === "pie") {
    if (d.cc) return { error: "L'anneau montre une seule répartition : retirez la colonne « Colonnes » ou choisissez un autre type de graphique." };
    if (!additive) return { error: "L'anneau n'a de sens que pour un nombre de lignes ou une somme." };
    const keys = d.rowKeys.filter(k => (d.rowVal.get(k) || 0) > 0);
    const main = keys.slice(0, PIE_MAX), rest = keys.slice(PIE_MAX);
    const cats = main.map(k => ({ key: k, label: keyLabel(d.rc, k, d.rg) }));
    const values = main.map(k => scale(d.rowVal.get(k)));
    const colors = main.map((k, j) => `var(${SERIES[j]})`);
    if (rest.length) {
      cats.push({ key: "__autres", label: `Autres (${rest.length})` });
      values.push(scale(rest.reduce((a, k) => a + (d.rowVal.get(k) || 0), 0)));
      colors.push("var(--other)");
    }
    return withLabels(b, { type, mode: "single", cats, series: [{ key: null, name: plain(measureText(b.measure)), color: "var(--s1)", values, colors }], unit, notes, total: scale(d.total) }, additive, values.reduce((a, v) => a + (v || 0), 0), unit);
  }

  const catKeys = shownRows;                                          // plus de plafond : le graphique suit « Lignes affichées »
  const cats = catKeys.map(k => ({ key: k, label: keyLabel(d.rc, k, d.rg) }));
  let series;
  if (!d.cc) series = [{ key: null, name: plain(measureText(b.measure)), color: "var(--s1)", values: catKeys.map(k => scale(d.rowVal.get(k))) }];
  else {
    const named = d.colKeys.filter(k => d.colorOf.get(k) !== "var(--other)");
    const others = d.colKeys.filter(k => d.colorOf.get(k) === "var(--other)");
    series = named.map(ck => ({ key: ck, name: plain(keyLabel(d.cc, ck, d.cg)), color: d.colorOf.get(ck), values: catKeys.map(rk => scale(d.val(rk, ck))) }));
    if (others.length) {
      if (additive) series.push({ key: "__autres", name: `Autres (${others.length})`, color: "var(--other)", values: catKeys.map(rk => scale(others.reduce((a, ck) => a + (d.val(rk, ck) || 0), 0))) });
      else notes.push(`${others.length} série(s) de plus sont dans le tableau.`);
    }
  }
  series.forEach(s => s.raw = s.values.slice());                     // valeurs avant passage à 100 %, pour les étiquettes
  if (mode === "pct") {                                               // chaque catégorie ramenée à 100 %
    const sums = cats.map((_, j) => series.reduce((a, s) => a + (s.values[j] || 0), 0));
    series.forEach(s => s.values = s.values.map((v, j) => sums[j] ? (v || 0) / sums[j] * 100 : 0));
  }
  return withLabels(b, { type, mode, cats, series, unit: mode === "pct" ? " %" : unit, notes }, additive, scale(d.total), unit);
}

// ---- Étiquettes de données ----
// auto : comportement d'origine ; none : aucune ; val : valeurs ; pct : pourcentages ; both : valeur et pourcentage.
// Pourcentage d'une barre seule = part du total du bloc (toutes les lignes, même celles non affichées) ;
// pourcentage d'un morceau de barre (séries) = part de sa barre ; total d'une barre empilée = part du total du bloc.
const LABEL_MODES = [["auto", "Étiquettes automatiques"], ["none", "Sans étiquette"], ["val", "Étiquettes : valeurs"], ["pct", "Étiquettes : pourcentages"], ["both", "Étiquettes : valeurs et %"], ["valtot", "Étiquettes : valeurs, % au total"]];
const pf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
function withLabels(b, spec, additive, grand, baseUnit) {
  spec.labels = b.labels || "auto";
  spec.baseUnit = baseUnit;                                           // unité des valeurs brutes (« % » si « Afficher en % du total »)
  spec.grand = additive && grand > 0 ? grand : null;
  spec.shares = additive;
  spec.series.forEach(s => { if (!s.raw) s.raw = s.values.slice(); });
  if (!additive && (spec.labels === "pct" || spec.labels === "both"))
    spec.notes.push("Pourcentages non affichés : une moyenne, un minimum, un maximum ou un nombre de valeurs distinctes ne se répartit pas en parts.");
  return spec;
}
const labelsOn = spec => spec.labels && spec.labels !== "auto" && spec.labels !== "none";
const catTotal = (spec, j) => spec.series.reduce((a, s) => a + Math.max(0, s.raw[j] || 0), 0);
// texte d'une étiquette : v = valeur brute, part = pourcentage (ou null)
// « valtot » : chaque série (colonne) porte sa valeur, le total de la barre porte son pourcentage du total ;
// sans colonnes (une seule série), la barre est le total : valeur et pourcentage.
function labelText(spec, v, part, as) {
  if (v === null || v === undefined || isNaN(v)) return "";
  let mode = as || spec.labels; if (mode === "valtot") mode = "both";
  const val = nf.format(v) + (spec.baseUnit || "");
  const already = spec.baseUnit === " %";                             // valeurs déjà en % du total : pas de doublon
  const pc = part === null || part === undefined || isNaN(part) || !spec.shares || (already && spec.mode === "single") ? null : pf.format(part) + " %";
  if (mode === "val") return val;
  if (mode === "pct") return pc || val;
  if (mode === "both") return pc ? `${val} (${pc})` : val;
  return "";
}
// étiquette d'un point (série k, catégorie j)
function pointLabel(spec, j, k) {
  const v = spec.series[k].raw[j];
  if (spec.mode === "single") return labelText(spec, v, spec.grand ? v / spec.grand * 100 : null);
  if (!v) return "";                                                  // pas d'étiquette « 0 » pour une série absente de la barre
  const t = catTotal(spec, j);
  return labelText(spec, v, t ? Math.max(0, v || 0) / t * 100 : null, spec.labels === "valtot" ? "val" : undefined);
}
// étiquette du total d'une barre empilée
function totalLabel(spec, j) {
  const t = catTotal(spec, j);
  return labelText(spec, t, spec.grand ? t / spec.grand * 100 : null, spec.labels === "valtot" ? "pct" : undefined);
}
// total au bout des barres empilées (aussi en « 100 % » quand le total porte le pourcentage)
const showTotals = spec => labelsOn(spec) && spec.series.length > 1 && (spec.mode === "stack" || (spec.mode === "pct" && spec.labels === "valtot"));
const textW = (t, px = 7) => String(t).length * px;
// couleur de texte lisible sur un aplat : noir ou blanc, celui qui contraste le plus
function inkOn(color) {
  let c = String(color || "");
  const m = c.match(/var\((--[a-z0-9-]+)\)/);
  if (m) c = (getComputedStyle(document.documentElement).getPropertyValue(m[1]) || LIGHT[m[1]] || "#2a78d6").trim();
  const h = c.replace("#", ""); if (h.length < 6) return "#000000";
  const lin = x => { x = parseInt(x, 16) / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
  const L = 0.2126 * lin(h.slice(0, 2)) + 0.7152 * lin(h.slice(2, 4)) + 0.0722 * lin(h.slice(4, 6));
  return (L + 0.05) / 0.05 >= 1.05 / (L + 0.05) ? "#000000" : "#ffffff";
}
const inLabel = (x, y, txt, fillColor, anchor = "middle") => `<text class="val in" x="${(+x).toFixed(1)}" y="${(+y).toFixed(1)}" text-anchor="${anchor}" style="fill:${inkOn(fillColor)};font-size:9pt" pointer-events="none">${esc(txt)}</text>`;

const fmtVal = (spec, v) => v === null || v === undefined || isNaN(v) ? "–" : nf.format(v) + (spec.unit || "");

function niceTicks(max, n = 5) {
  if (!(max > 0)) return [0, 1];
  const raw = max / n, p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * p).find(s => s >= raw) || p * 10;
  const out = []; for (let v = 0; v <= max + step * 0.001; v += step) out.push(+v.toFixed(10));
  if (out[out.length - 1] < max) out.push(+(out[out.length - 1] + step).toFixed(10));
  return out;
}

function stackTotals(spec) { return spec.cats.map((_, j) => spec.series.reduce((a, s) => a + Math.max(0, s.values[j] || 0), 0)); }
function maxValue(spec) {
  if (spec.mode === "pct") return 100;
  if (spec.mode === "stack") return Math.max(0, ...stackTotals(spec));
  return Math.max(0, ...spec.series.flatMap(s => s.values.map(v => v || 0)));
}

// Barre à bout arrondi (4 px) côté valeur, carrée côté axe ; dir = "right" ou "up"
function barPath(x0, y, w, h, fill, attrs, dir = "right") {
  if (w <= 0 || h <= 0) return "";
  let d;
  if (dir === "right") { const r = Math.min(4, w, h / 2); d = `M${x0},${y} H${x0 + w - r} Q${x0 + w},${y} ${x0 + w},${y + r} V${y + h - r} Q${x0 + w},${y + h} ${x0 + w - r},${y + h} H${x0} Z`; }
  else { const r = Math.min(4, h, w / 2); d = `M${x0},${y + h} V${y + r} Q${x0},${y} ${x0 + r},${y} H${x0 + w - r} Q${x0 + w},${y} ${x0 + w},${y + r} V${y + h} Z`; }
  return `<path d="${d}" fill="${fill}" ${attrs}></path>`;
}
const tipAttr = (a, v) => `data-tip="${esc(a)}${TIP_SEP}${esc(v)}"`;

function legendHtml(spec) {
  if (spec.type === "pie") {
    const s = spec.series[0], tot = s.values.reduce((a, v) => a + (v || 0), 0);
    return `<div class="legend">${spec.cats.map((c, j) => `<span><i style="background:${s.colors[j]}"></i>${rich(c.label)} · ${esc(fmtVal(spec, s.values[j]))} (${nf.format(tot ? s.values[j] / tot * 100 : 0)} %)</span>`).join("")}</div>`;
  }
  if (spec.series.length < 2) return "";
  return `<div class="legend">${spec.series.map(s => `<span><i style="background:${s.color}"></i>${rich(s.name)}</span>`).join("")}</div>`;
}

function renderChart(b, d, shownRows, bi) {
  if (b.chart === "map") return renderMap(b, d, bi);
  if (b.chart === "points") return renderPoints(b, d, bi);
  const spec = chartSpec(b, d, shownRows); spec.bi = bi;
  if (spec.error) return `<p class="hint">${esc(spec.error)}</p>`;
  const W = Math.max(320, Math.min(900, ($("blocks").clientWidth || 700) - 32));
  const svg = spec.type === "barh" ? svgBarH(spec, W) : spec.type === "barv" ? svgBarV(spec, W) : spec.type === "line" ? svgLine(spec, W) : svgPie(spec, W);
  const notes = spec.notes.map(n => `<p class="hint">${esc(n)}</p>`).join("");
  return `<div class="chart">${svg}${legendHtml(spec)}${notes}</div>`;
}
// ---- Carte choroplèthe : une couleur par classe de valeur, du clair (peu) au foncé (beaucoup)
const MAP_CLASSES = [["quantile", "classes d'effectifs égaux (quantiles)"], ["equal", "classes d'amplitude égale"]];
function mapEditor(b, i) {
  const m = b.map || {}, hasExp = b.rows && b.rows.ref && b.rows.ref.expect;
  return `<select data-b="${i}" data-k="map.level">${opt([["", "maille automatique"], ["dep", "par département"], ["aca", "par académie"]], m.level || "")}</select>
    <select data-b="${i}" data-k="map.metric" title="${hasExp ? "" : "Le taux demande une valeur attendue : « Compléter avec » une table de référence"}">${opt(hasExp ? [["value", "couleur : valeur"], ["rate", "couleur : taux (valeur ÷ attendu)"]] : [["value", "couleur : valeur"]], hasExp ? (m.metric || "value") : "value")}</select>
    <select data-b="${i}" data-k="map.classes">${opt(MAP_CLASSES, m.classes || "quantile")}</select>
    <select data-b="${i}" data-k="map.n">${opt([["3", "3 classes"], ["4", "4 classes"], ["5", "5 classes"]], String(m.n || 5))}</select>
    <select data-b="${i}" data-k="map.labels">${opt([["auto", "chiffres sur la carte"], ["off", "sans chiffres"]], m.labels === "off" ? "off" : "auto")}</select>
    <span class="hint">Dans Word : image. Lignes du bloc : codes ou noms de départements ou d'académies (voir « Lignes »).</span>`;
}
function mapLevel(b, d) {
  const m = b.map || {}; if (m.level) return m.level;
  const g = b.rows && b.rows.grain;
  if (g === "dep_uai" || g === "dep_norm") return "dep";
  if (g === "aca_uai" || g === "aca_dep" || g === "aca_norm") return "aca";
  let nd = 0, na = 0;
  d.rowKeys.forEach(k => { if (ACA_BY_NAME.has(geoNorm(k))) na++; else if (depKey(k)) nd++; });
  return na > nd ? "aca" : "dep";
}
function mapBreaks(vals, n, method) {
  const v = vals.filter(x => x > 0 && isFinite(x)).sort((a, z) => a - z);
  if (!v.length) return [];
  const ints = v.every(x => Number.isInteger(x));
  let br;
  if (method === "equal") { const step = v[v.length - 1] / n; br = Array.from({ length: n }, (_, j) => step * (j + 1)); }
  else br = Array.from({ length: n }, (_, j) => v[Math.min(v.length - 1, Math.ceil((j + 1) / n * v.length) - 1)]);
  if (ints) br = br.map(Math.ceil);
  br = br.filter((x, j) => j === 0 || x > br[j - 1]);
  br[br.length - 1] = Math.max(br[br.length - 1], v[v.length - 1]);
  return br;
}
const RAMP = { 1: [4], 2: [2, 5], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5] };
function renderMap(b, d, bi) {
  const level = mapLevel(b, d), m = b.map || {};
  const additive = ADDITIVE.has(b.measure.agg || "count") || b.measure.agg === "distinct";
  const rate = m.metric === "rate" && d.expected;
  const num = new Map(), den = new Map(), orig = new Map(), unmatched = [];
  d.rowKeys.forEach(rk => {
    if (rk === EMPTY) return;
    const g = level === "dep" ? depKey(rk) : acaKey(rk);
    if (!g) { if ((d.rowVal.get(rk) || 0) > 0) unmatched.push(rk); return; }
    const v = d.rowVal.get(rk);
    if (!orig.has(g)) orig.set(g, rk);
    num.set(g, additive ? (num.get(g) || 0) + (v || 0) : num.has(g) ? num.get(g) : v);
    if (rate) den.set(g, (den.get(g) || 0) + (d.expected.get(rk) || 0));
  });
  const valOf = g => rate ? (den.get(g) ? (num.get(g) || 0) / den.get(g) * 100 : NaN) : num.get(g);
  const keys = level === "dep" ? Object.keys(DEP_NAMES) : ACA_NAMES;
  const n = Math.max(3, Math.min(5, Number(m.n) || 5));
  const br = mapBreaks(keys.map(valOf), n, m.classes || "quantile"), ramp = RAMP[br.length] || [];
  const ints = !rate && keys.every(k => { const v = valOf(k); return v === undefined || isNaN(v) || Number.isInteger(v); });
  const classOf = v => (v === undefined || isNaN(v) || v <= 0) ? -1 : br.findIndex(t => v <= t);
  const colorOf = v => { const c = classOf(v); return c < 0 ? "var(--q0)" : `var(--q${ramp[c] || 5})`; };
  const fmt = v => rate ? fmtPct(v) : fmtNum(v);
  const W = Math.max(320, Math.min(760, ($("blocks").clientWidth || 700) - 32)), k = W / GEO.w, H = Math.round(GEO.h * k);
  const name = g => level === "dep" ? `${g} · ${DEP_NAMES[g]}` : `Académie ${/^[AEIOUÉ]/.test(g) ? "d'" : "de "}${g}`;
  const tipTxt = g => { const v = valOf(g); if (v === undefined || isNaN(v)) return rate ? "aucune valeur attendue" : "0";
    return rate ? `${fmtPct(v)} (${fmtNum(num.get(g) || 0)} sur ${fmtNum(den.get(g) || 0)})` : fmtNum(v); };
  let shapes = "", lines = "", labels = "";
  const layer = level === "dep" ? GEO.dep : GEO.aca;
  layer.forEach(e => {
    const v = valOf(e.k), rk = orig.get(e.k);
    shapes += `<path d="${e.d}" fill="${colorOf(v)}" stroke="var(--surface)" stroke-width="${(0.8 / k).toFixed(2)}" stroke-linejoin="round" ${tipAttr(name(e.k), tipTxt(e.k))}${rk !== undefined ? drillAttr(bi, rk, null) : ""}></path>`;
  });
  if (level === "dep") GEO.aca.forEach(e => lines += `<path d="${e.d}" fill="none" stroke="var(--ink-2)" stroke-width="${(1 / k).toFixed(2)}" stroke-linejoin="round" pointer-events="none" opacity=".7"></path>`);
  const showLabels = m.labels !== "off";
  if (showLabels) layer.forEach(e => {
    if (e.x === undefined || (e.i === "metro" && ["Paris", "75", "92", "93", "94"].includes(e.k))) return;   // trop petits : chiffre dans l'encart
    let v = valOf(e.k);
    if (rate && (v === undefined || isNaN(v))) { if (!den.get(e.k)) return; v = 0; }
    if (v === undefined || isNaN(v)) v = 0;                                   // zone sans valeur : étiquette « 0 »
    labels += `<text class="val" x="${(e.x * k).toFixed(1)}" y="${(e.y * k + 4).toFixed(1)}" text-anchor="middle" style="fill:${inkOn(colorOf(v))};font-size:${level === "aca" ? "9pt" : "7.5pt"}" pointer-events="none">${esc(rate ? nf.format(Math.round(v)) + " %" : fmtNum(v))}</text>`;
  });
  const frames = GEO.frames.map(f => `<rect x="${(f.x * k).toFixed(1)}" y="${(f.y * k).toFixed(1)}" width="${(f.w * k).toFixed(1)}" height="${(f.h * k).toFixed(1)}" fill="none" stroke="var(--axis)" stroke-width="1" rx="3"></rect>
    <text x="${(f.x * k + 4).toFixed(1)}" y="${(f.y * k + 11).toFixed(1)}" style="font-size:7.5pt">${esc(f.t)}</text>`).join("");
  const svg = svgWrap(W, H, `<g transform="scale(${k.toFixed(5)})">${shapes}${lines}</g>${frames}${labels}`, "Carte " + (level === "dep" ? "par département" : "par académie"));
  // légende : une case par classe, plus « aucun »
  let prev = 0;
  const items = br.map((t, j) => { const lo = ints ? Math.floor(prev) + 1 : prev, txt = j === 0 && !ints ? `jusqu'à ${fmt(t)}` : lo >= t ? fmt(t) : `${ints ? fmtNum(lo) : fmt(lo)} – ${fmt(t)}`; prev = t; return `<span><i style="background:var(--q${ramp[j]})"></i>${esc(txt)}</span>`; });
  items.unshift(`<span><i style="background:var(--q0)"></i>${rate ? "0 ou sans attendu" : "0"}</span>`);
  if (rate) items.unshift(`<span><i style="background:transparent"></i>Taux :</span>`);
  const what = rate ? "Taux : valeur ÷ attendu" : plain(measureText(b.measure));
  const notes = [];
  const unk = unmatched.filter(x => x === UNKNOWN), other = unmatched.filter(x => x !== UNKNOWN);
  if (unk.length) notes.push(`${fmtNum(d.rowVal.get(UNKNOWN))} sans ${level === "dep" ? "département" : "académie"} reconnu(e) (valeur vide ou mal formée) : non placé(s) sur la carte.`);
  if (other.length) notes.push(`${other.length} valeur(s) non placée(s) sur la carte : ${other.slice(0, 6).join(", ")}${other.length > 6 ? "…" : ""}. Réglez « Lignes » sur « département (code ou nom) », « académie (nom) » ou une valeur déduite de l'UAI.`);
  if (d.cc) notes.push("La carte montre le total de chaque ligne ; les colonnes restent visibles dans le tableau.");
  return `<div class="chart map">${svg}<div class="legend" title="${esc(what)}">${items.join("")}</div>${notes.map(t => `<p class="hint">${esc(t)}</p>`).join("")}</div>`;
}
// ---- Carte des établissements : un point par ligne du bloc, placé d'après la latitude et la longitude du référentiel ----
const cibleDe = type => (/^Ref:(.+)$/.exec(type || "") || [])[1] || "";
const colDeBloc = (b, col) => col ? refColumns(isMainSrc(b) ? mainTable : b.source).find(c => c.id === col) : null;
// table des établissements : choisie dans le bloc, sinon celle que vise la colonne des lignes (référence)
function ptsTable(b) {
  const p = b.pts || {}; if (p.table) return p.table;
  const c = colDeBloc(b, b.rows && b.rows.col); return c ? cibleDe(c.type) : "";
}
function ptsCols(b) {
  const p = b.pts || {}, table = ptsTable(b), rc = refColumns(table), a = id => id && rc.some(c => c.id === id) ? id : "";
  const find = re => (rc.find(c => re.test(c.id)) || rc.find(c => re.test(c.label)) || {}).id || "";
  const lignes = colDeBloc(b, b.rows && b.rows.col), parRef = !!lignes && cibleDe(lignes.type) === table;
  return { table, parRef,
    key: parRef ? "id" : (a(p.key) || find(/^(uai|code_?uai|numero_?uai|identifiant)/i)),
    lat: a(p.lat) || find(/^lat/i), lon: a(p.lon) || find(/^(lon|lng)/i),
    name: a(p.name) || find(/^(nom|appellation|libell|d[ée]nomination)/i) };
}
function pointsEditor(b, i) {
  const p = b.pts || {}, P = ptsCols(b), rc = refColumns(P.table), auto = ptsTable({ ...b, pts: {} });
  const cols = (k, val, vide) => `<select data-b="${i}" data-k="pts.${k}">${opt([["", vide], ...rc.map(c => [c.id, c.label])], val || "")}</select>`;
  return `<select data-b="${i}" data-k="pts.table" title="Table qui porte les coordonnées des établissements">${opt([["", auto ? `établissements : ${auto}` : "Table des établissements…"], ...refTables().map(t => [t, "Table " + t])], p.table || "")}</select>
    ${P.table && !P.parRef ? cols("key", p.key || P.key, "Correspondance avec les lignes…") : ""}
    ${P.table ? `${cols("lat", p.lat || P.lat, "Latitude…")}${cols("lon", p.lon || P.lon, "Longitude…")}${cols("name", p.name || P.name, "Nom affiché : valeur de la ligne")}` : ""}
    <select data-b="${i}" data-k="pts.size">${opt([["value", "taille : selon la valeur"], ["fixed", "taille fixe"]], p.size || "value")}</select>
    <select data-b="${i}" data-k="pts.color">${opt([["classes", "couleur : classes de valeur"], ["unie", "couleur unie"]], p.color || "classes")}</select>
    <span class="hint">Lignes du bloc : la colonne de l'établissement${P.parRef ? " (référence : coordonnées lues dans « " + esc(P.table) + " »)" : " ; choisissez la colonne du référentiel qui lui correspond (UAI…)"}. Dans Word : image.</span>`;
}
function renderPoints(b, d, bi) {
  const p = b.pts || {}, P = ptsCols(b), G = window.Geo;
  const msg = t => `<div class="chart"><p class="hint">${esc(t)}</p></div>`;
  if (!P.table) return msg("Carte des établissements : choisissez la table des établissements (réglage « Graphique »), ou prenez pour lignes la colonne de l'établissement.");
  const c = refCache.get(P.table);
  if (!c || !c.data) return msg(c && c.error ? `Table « ${P.table} » illisible : ${c.error}` : "Lecture de la table des établissements…");
  if (!P.lat || !P.lon) return msg(`La table « ${P.table} » n'a pas de colonnes de latitude et de longitude reconnues : choisissez-les dans le réglage « Graphique ».`);
  if (!P.key) return msg("Choisissez la colonne du référentiel qui correspond aux lignes du bloc.");
  const data = c.data, idx = new Map();
  if (P.key === "id") (data.id || []).forEach((id, j) => { idx.set(refNorm(String(id)), j); idx.set(refNorm(textOf(id)), j); });
  else (data[P.key] || []).forEach((v, j) => { const t = textOf(v); if (t !== null && !idx.has(refNorm(t))) idx.set(refNorm(t), j); });
  const pts = []; let sansRef = 0, sansCoord = 0, valSans = 0;
  d.rowKeys.forEach(rk => {
    if (rk === EMPTY) return;
    const v = d.rowVal.get(rk) || 0; if (!(v > 0)) return;
    const j = idx.get(refNorm(rk));
    if (j === undefined) { sansRef++; valSans += v; return; }
    const pos = G.placer(data[P.lat][j], data[P.lon][j]);
    if (!pos) { sansCoord++; valSans += v; return; }
    pts.push({ rk, v, pos, nom: (P.name && textOf(data[P.name][j])) || rk });
  });
  const W = Math.max(320, Math.min(760, ($("blocks").clientWidth || 700) - 32)), k = W / GEO.w, H = Math.round(GEO.h * k);
  const max = Math.max(0, ...pts.map(x => x.v)) || 1;
  const n = 4, br = p.color === "unie" ? [] : mapBreaks(pts.map(x => x.v), n, "quantile"), ramp = { 1: [4], 2: [3, 5], 3: [2, 4, 5], 4: [2, 3, 4, 5] }[br.length] || [];
  const couleur = v => !br.length ? "var(--s1)" : `var(--q${ramp[Math.max(0, br.findIndex(t => v <= t))] || 5})`;
  const ints = pts.every(x => Number.isInteger(x.v));
  const rayon = v => p.size === "fixed" ? 4 : 2.5 + 11 * Math.sqrt(v / max);
  const parisK = 1;   // l'encart de Paris est déjà agrandi dans le fond
  let ronds = "";
  [...pts].sort((x, y) => y.v - x.v).forEach(x => {
    const att = `fill="${couleur(x.v)}" fill-opacity=".85" stroke="var(--surface)" stroke-width="1" style="cursor:pointer" ${tipAttr(x.nom, fmtNum(x.v))}${drillAttr(bi, x.rk, null)}`;
    ronds += `<circle cx="${(x.pos.x * k).toFixed(1)}" cy="${(x.pos.y * k).toFixed(1)}" r="${rayon(x.v).toFixed(1)}" ${att}></circle>`;
    if (x.pos.paris) ronds += `<circle cx="${(x.pos.paris.x * k).toFixed(1)}" cy="${(x.pos.paris.y * k).toFixed(1)}" r="${(rayon(x.v) * parisK).toFixed(1)}" ${att}></circle>`;
  });
  const fond = G.fondSvg(k, { fond: "var(--q0)", trait: "var(--surface)", traitAcademie: "var(--axis)" }).replace(/<title>[^<]*<\/title>/g, "");
  const frames = GEO.frames.map(f => `<rect x="${(f.x * k).toFixed(1)}" y="${(f.y * k).toFixed(1)}" width="${(f.w * k).toFixed(1)}" height="${(f.h * k).toFixed(1)}" fill="none" stroke="var(--axis)" stroke-width="1" rx="3"></rect>
    <text x="${(f.x * k + 4).toFixed(1)}" y="${(f.y * k + 11).toFixed(1)}" style="font-size:7.5pt">${esc(f.t)}</text>`).join("");
  const svg = svgWrap(W, H, `${fond}${frames}${ronds}`, "Carte des établissements");
  let prev = 0;
  const items = br.length ? br.map((t, j) => { const lo = ints ? Math.floor(prev) + 1 : prev, txt = lo >= t ? fmtNum(t) : `${fmtNum(lo)} – ${fmtNum(t)}`; prev = t; return `<span><i style="background:var(--q${ramp[j]})"></i>${esc(txt)}</span>`; })
    : [`<span><i style="background:var(--s1)"></i>${esc(plain(measureText(b.measure)))}</span>`];
  const notes = [`${fmtNum(pts.length)} établissement(s) sur la carte${p.size === "fixed" ? "" : ` ; taille des points selon la valeur (jusqu'à ${fmtNum(max)})`}.`];
  if (sansRef) notes.push(`${fmtNum(sansRef)} ligne(s) introuvable(s) dans « ${P.table} »${P.parRef ? "" : ` (colonne « ${P.key} »)`} : non placée(s).`);
  if (sansCoord) notes.push(`${fmtNum(sansCoord)} établissement(s) sans coordonnées utilisables : non placé(s).`);
  if (d.cc) notes.push("La carte montre le total de chaque ligne ; les colonnes restent visibles dans le tableau.");
  return `<div class="chart map points">${svg}<div class="legend" title="${esc(plain(measureText(b.measure)))}">${items.join("")}</div>${notes.map(t => `<p class="hint">${esc(t)}</p>`).join("")}</div>`;
}
const svgWrap = (W, H, inner, label) => `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="width:${W}px;max-width:100%" role="img" aria-label="${esc(label || "")}">${inner}</svg>`;

function svgBarH(spec, W) {
  const on = labelsOn(spec), nS = spec.series.length, grouped = spec.mode === "group" && nS > 1;
  // place à droite pour l'étiquette la plus longue
  const tipTexts = !on ? [] : spec.cats.map((_, j) => nS === 1 || grouped ? spec.series.map((_, k) => pointLabel(spec, j, k)) : showTotals(spec) ? [totalLabel(spec, j)] : []).flat();
  const labelW = Math.min(200, Math.round(W * 0.3)), valW = on ? Math.max(40, Math.min(150, Math.max(0, ...tipTexts.map(t => textW(t))) + 14)) : 64, plotW = W - labelW - valW;
  const barH = grouped ? (on ? 14 : Math.max(6, Math.min(12, Math.floor(40 / nS)))) : 18;
  const band = grouped ? nS * (barH + 2) + 10 : barH + 10;
  const max = maxValue(spec) || 1, H = spec.cats.length * band + 4;
  const x = v => Math.max(0, v || 0) / max * plotW;
  const totals = stackTotals(spec);
  let m = `<line x1="${labelW}" x2="${labelW}" y1="0" y2="${H}" stroke="var(--axis)" stroke-width="1"></line>`;
  const maxChars = Math.max(10, Math.floor((labelW - 12) / 7.3));
  spec.cats.forEach((c, j) => {
    const y = j * band + 2, bh = grouped ? nS * (barH + 2) - 2 : barH;
    m += `<text x="${labelW - 8}" y="${y + bh / 2 + 4}" text-anchor="end"><title>${esc(plain(c.label))}</title>${svgRich(c.label, maxChars)}</text>`;
    if (nS === 1 || grouped) {
      spec.series.forEach((s, k) => {
        const yy = grouped ? y + k * (barH + 2) : y;
        m += barPath(labelW, yy, x(s.values[j]), barH, s.color, tipAttr(`${c.label}${nS > 1 ? " · " + s.name : ""}`, fmtVal(spec, s.values[j])) + drillAttr(spec.bi, c.key, s.key));
      });
      if (on) spec.series.forEach((s, k) => {
        const yy = grouped ? y + k * (barH + 2) : y, t = pointLabel(spec, j, k);
        if (t) m += `<text class="val" x="${labelW + x(s.values[j]) + 6}" y="${yy + barH / 2 + 4}"${grouped ? ' style="font-size:9pt"' : ""}>${esc(t)}</text>`;
      });
      else if (nS === 1 && spec.labels !== "none") m += `<text class="val" x="${labelW + x(spec.series[0].values[j]) + 6}" y="${y + barH / 2 + 4}">${esc(fmtVal(spec, spec.series[0].values[j]))}</text>`;
    } else {
      const vis = spec.series.map((s, k) => [s, s.values[j] || 0, k]).filter(e => e[1] > 0);
      let acc = 0;
      vis.forEach(([s, v, k], n) => {
        const x0 = labelW + x(acc), w = x(acc + v) - x(acc), last = n === vis.length - 1, w2 = Math.max(0, last ? w : w - 2);
        const t = tipAttr(`${c.label} · ${s.name}`, fmtVal(spec, v)) + drillAttr(spec.bi, c.key, s.key);
        m += last ? barPath(x0, y, w2, barH, s.color, t) : `<rect x="${x0.toFixed(1)}" y="${y}" width="${w2.toFixed(1)}" height="${barH}" fill="${s.color}" ${t}></rect>`;
        if (on) { const lt = pointLabel(spec, j, k); if (lt && textW(lt, 6.2) + 6 <= w2) m += inLabel(x0 + w2 / 2, y + barH / 2 + 4, lt, s.color); }
        acc += v;
      });
      if (on ? showTotals(spec) : spec.mode !== "pct" && spec.labels !== "none") m += `<text class="val" x="${labelW + x(totals[j]) + 6}" y="${y + barH / 2 + 4}">${esc(on ? totalLabel(spec, j) : fmtVal(spec, totals[j]))}</text>`;
    }
  });
  return svgWrap(W, H, m);
}

// axe vertical commun aux colonnes et aux courbes
function yAxis(spec, left, top, plotW, plotH) {
  const ticks = niceTicks(maxValue(spec)), max = ticks[ticks.length - 1] || 1;
  const y = v => top + plotH - Math.max(0, v || 0) / max * plotH;
  let m = "";
  ticks.forEach(t => {
    m += `<line x1="${left}" x2="${left + plotW}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" stroke="${t === 0 ? "var(--axis)" : "var(--grid)"}" stroke-width="1"></line>`;
    m += `<text x="${left - 6}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end">${esc(nf.format(t))}${spec.unit ? esc(spec.unit) : ""}</text>`;
  });
  return { m, y };
}
function xLabels(spec, left, bandW, top) {
  const n = spec.cats.length, rotate = n > 6 || spec.cats.some(c => plain(c.label).length * 7.3 > bandW - 4);
  const maxChars = rotate ? 22 : Math.max(4, Math.floor((bandW - 4) / 7.3));
  const every = Math.max(1, Math.ceil(n / 24));
  return spec.cats.map((c, j) => {
    if (j % every) return "";
    const cx = left + j * bandW + bandW / 2;
    return rotate
      ? `<text transform="translate(${cx.toFixed(1)},${top + 10}) rotate(-40)" text-anchor="end"><title>${esc(plain(c.label))}</title>${svgRich(c.label, maxChars)}</text>`
      : `<text x="${cx.toFixed(1)}" y="${top + 16}" text-anchor="middle"><title>${esc(plain(c.label))}</title>${svgRich(c.label, maxChars)}</text>`;
  }).join("");
}
const xBand = spec => (spec.cats.length > 6 || spec.cats.some(c => plain(c.label).length > 12)) ? 96 : 30;

function svgBarV(spec, W) {
  const on = labelsOn(spec), left = 52, right = 12, plotH = 220, bottomH = xBand(spec), plotW = W - left - right;
  const n = spec.cats.length, bandW = plotW / Math.max(1, n), nS = spec.series.length, grouped = spec.mode === "group" && nS > 1;
  const colW = Math.min(on ? 48 : 24, grouped ? Math.max(3, (bandW * 0.8 - (nS - 1) * 2) / nS) : bandW * 0.62);
  // étiquettes au-dessus des colonnes : à la verticale si elles débordent de la colonne
  const capTexts = !on ? [] : spec.cats.map((_, j) => nS === 1 || grouped ? spec.series.map((_, k) => pointLabel(spec, j, k)) : showTotals(spec) ? [totalLabel(spec, j)] : []).flat();
  const slot = grouped ? colW + 2 : bandW, longest = Math.max(0, ...capTexts.map(t => textW(t, 6.6)));
  const vertical = on && longest > slot - 2, top = vertical ? 12 + longest : 16;
  const cap = (cx, yv, t, small) => !t ? "" : vertical
    ? `<text class="val" transform="translate(${(cx + 4).toFixed(1)},${(yv - 5).toFixed(1)}) rotate(-90)" text-anchor="start" style="font-size:9pt">${esc(t)}</text>`
    : `<text class="val" x="${cx.toFixed(1)}" y="${(yv - 5).toFixed(1)}" text-anchor="middle"${small ? ' style="font-size:9pt"' : ""}>${esc(t)}</text>`;
  const ax = yAxis(spec, left, top, plotW, plotH), totals = stackTotals(spec);
  let m = ax.m;
  spec.cats.forEach((c, j) => {
    const x0 = left + j * bandW + bandW / 2;
    if (nS === 1 || grouped) {
      const groupW = grouped ? nS * colW + (nS - 1) * 2 : colW;
      spec.series.forEach((s, k) => {
        const xx = x0 - groupW / 2 + (grouped ? k * (colW + 2) : 0), yy = ax.y(s.values[j]);
        m += barPath(xx, yy, colW, top + plotH - yy, s.color, tipAttr(`${c.label}${nS > 1 ? " · " + s.name : ""}`, fmtVal(spec, s.values[j])) + drillAttr(spec.bi, c.key, s.key), "up");
      });
      if (on) spec.series.forEach((s, k) => { const xx = x0 - groupW / 2 + (grouped ? k * (colW + 2) : 0); m += cap(xx + colW / 2, ax.y(s.values[j]), pointLabel(spec, j, k), grouped); });
      else if (nS === 1 && n <= 16 && spec.labels !== "none") m += `<text class="val" x="${x0.toFixed(1)}" y="${(ax.y(spec.series[0].values[j]) - 5).toFixed(1)}" text-anchor="middle">${esc(fmtVal(spec, spec.series[0].values[j]))}</text>`;
    } else {
      const vis = spec.series.map((s, k) => [s, s.values[j] || 0, k]).filter(e => e[1] > 0);
      let acc = 0;
      vis.forEach(([s, v, sk], k) => {
        const yTop = ax.y(acc + v), yBot = ax.y(acc), last = k === vis.length - 1, h = Math.max(0, last ? yBot - yTop : yBot - yTop - 2);
        const t = tipAttr(`${c.label} · ${s.name}`, fmtVal(spec, v)) + drillAttr(spec.bi, c.key, s.key);
        m += last ? barPath(x0 - colW / 2, yTop, colW, h, s.color, t, "up") : `<rect x="${(x0 - colW / 2).toFixed(1)}" y="${(yTop + 2).toFixed(1)}" width="${colW.toFixed(1)}" height="${h.toFixed(1)}" fill="${s.color}" ${t}></rect>`;
        if (on) { const lt = pointLabel(spec, j, sk); if (lt && h >= 14 && textW(lt, 6.2) + 4 <= colW) m += inLabel(x0, (last ? yTop : yTop + 2) + h / 2 + 4, lt, s.color); }
        acc += v;
      });
      if (on) { if (showTotals(spec)) m += cap(x0, ax.y(totals[j]), totalLabel(spec, j)); }
      else if (spec.mode !== "pct" && n <= 16 && spec.labels !== "none") m += `<text class="val" x="${x0.toFixed(1)}" y="${(ax.y(totals[j]) - 5).toFixed(1)}" text-anchor="middle">${esc(fmtVal(spec, totals[j]))}</text>`;
    }
  });
  m += xLabels(spec, left, bandW, top + plotH);
  return svgWrap(W, top + plotH + bottomH, m);
}

function svgLine(spec, W) {
  const on = labelsOn(spec), left = 52, right = 16, plotH = 220, bottomH = xBand(spec), plotW = W - left - right;
  const n = spec.cats.length, bandW = plotW / Math.max(1, n);
  const ptTexts = !on ? [] : spec.series.flatMap((s, k) => spec.cats.map((_, j) => pointLabel(spec, j, k)));
  const longest = Math.max(0, ...ptTexts.map(t => textW(t, 6.6))), vertical = on && longest > bandW - 2, top = vertical ? 16 + longest : on ? 22 : 16;
  // une courbe n'empile pas : en mode « 100 % » on garde les parts, sinon les valeurs brutes
  const lineSpec = { ...spec, mode: spec.mode === "pct" ? "pct" : "group" };
  const ax = yAxis(lineSpec, left, top, plotW, plotH);
  let m = ax.m;
  const X = j => left + j * bandW + bandW / 2;
  spec.series.forEach(s => {
    const pts = s.values.map((v, j) => v === null || isNaN(v) ? null : [X(j), ax.y(v)]);
    let dPath = "", pen = false;
    pts.forEach(p => { if (!p) { pen = false; return; } dPath += (pen ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1); pen = true; });
    m += `<path d="${dPath}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></path>`;
  });
  spec.series.forEach(s => s.values.forEach((v, j) => {
    if (v === null || isNaN(v)) return;
    const cx = X(j).toFixed(1), cy = ax.y(v).toFixed(1), t = tipAttr(`${spec.cats[j].label}${spec.series.length > 1 ? " · " + s.name : ""}`, fmtVal(spec, v)) + drillAttr(spec.bi, spec.cats[j].key, s.key);
    m += `<circle cx="${cx}" cy="${cy}" r="12" fill="transparent" ${t}></circle><circle cx="${cx}" cy="${cy}" r="4" fill="${s.color}" stroke="var(--surface)" stroke-width="2" ${t}></circle>`;
  }));
  if (on) spec.series.forEach((s, k) => s.values.forEach((v, j) => {   // une étiquette par point
    const t = pointLabel(spec, j, k); if (!t || v === null || isNaN(v)) return;
    const cx = X(j), cy = ax.y(v);
    m += vertical ? `<text class="val" transform="translate(${(cx + 4).toFixed(1)},${(cy - 9).toFixed(1)}) rotate(-90)" text-anchor="start" style="font-size:9pt">${esc(t)}</text>`
      : `<text class="val" x="${cx.toFixed(1)}" y="${(cy - 10).toFixed(1)}" text-anchor="middle" style="font-size:9pt">${esc(t)}</text>`;
  }));
  else if (spec.series.length === 1 && spec.labels !== "none") {      // automatique : étiquette sur le dernier point seulement
    const s = spec.series[0], j = s.values.map((v, k) => v === null || isNaN(v) ? -1 : k).filter(k => k >= 0).pop();
    if (j !== undefined) m += `<text class="val" x="${X(j).toFixed(1)}" y="${(ax.y(s.values[j]) - 10).toFixed(1)}" text-anchor="middle">${esc(fmtVal(spec, s.values[j]))}</text>`;
  }
  m += xLabels(spec, left, bandW, top + plotH);
  return svgWrap(W, top + plotH + bottomH, m);
}

function svgPie(spec, W) {
  const size = 220, R = 100, r = 58, cx = size / 2, cy = size / 2, s = spec.series[0];
  const tot = s.values.reduce((a, v) => a + (v || 0), 0) || 1;
  let a0 = -Math.PI / 2, m = "";
  const gap = spec.cats.length > 1 ? 0.012 : 0;                      // fin liseré de séparation entre parts
  s.values.forEach((v, j) => {
    const a1 = a0 + (v || 0) / tot * Math.PI * 2;
    const s0 = a0 + gap, s1 = Math.max(s0, a1 - gap), large = s1 - s0 > Math.PI ? 1 : 0;
    const p = (ang, rad) => `${(cx + rad * Math.cos(ang)).toFixed(2)},${(cy + rad * Math.sin(ang)).toFixed(2)}`;
    const dPath = (s1 - s0) >= Math.PI * 2 - 0.001
      ? `M${cx - R},${cy} a${R},${R} 0 1,0 ${2 * R},0 a${R},${R} 0 1,0 ${-2 * R},0 M${cx - r},${cy} a${r},${r} 0 1,1 ${2 * r},0 a${r},${r} 0 1,1 ${-2 * r},0 Z`
      : `M${p(s0, R)} A${R},${R} 0 ${large},1 ${p(s1, R)} L${p(s1, r)} A${r},${r} 0 ${large},0 ${p(s0, r)} Z`;
    m += `<path d="${dPath}" fill="${s.colors[j]}" fill-rule="evenodd" ${tipAttr(spec.cats[j].label, `${fmtVal(spec, v)} (${nf.format(v / tot * 100)} %)`)}${drillAttr(spec.bi, spec.cats[j].key, null)}></path>`;
    if (labelsOn(spec) && v > 0) {                                     // étiquette au milieu de la part, si elle y tient
      const mid = (a0 + a1) / 2, rm = (R + r) / 2, arc = (a1 - a0) * rm, part = v / tot * 100;
      const vt = nf.format(v) + (spec.baseUnit || ""), pt = pf.format(part) + " %";
      const lines = spec.labels === "val" || spec.baseUnit === " %" ? [vt] : spec.labels === "pct" ? [pt] : [vt, pt];   // « valtot » : valeur et %
      const lx = cx + rm * Math.cos(mid), ly = cy + rm * Math.sin(mid), need = Math.max(...lines.map(t => textW(t, 6.2))) + 4;
      if (arc >= need || (lines.length === 1 && arc >= 22 && need <= R - r)) lines.forEach((t, li) => m += inLabel(lx, ly + 4 + (li - (lines.length - 1) / 2) * 13, t, s.colors[j]));
    }
    a0 = a1;
  });
  m += `<text class="val" x="${cx}" y="${cy + 2}" text-anchor="middle" style="font-size:18px;font-weight:600">${esc(fmtVal(spec, tot))}</text>`;
  m += `<text x="${cx}" y="${cy + 20}" text-anchor="middle">au total</text>`;
  return svgWrap(size, size, m);
}

function renderDiagOnly() {
  const el = $("diag"); if (!el) return;
  el.textContent = `Diagnostic : accès « ${accessLevel || "inconnu"} » · ${records.length} ligne(s) · ${columns.length} colonne(s) · source : ${diagSource} · copie de sécurité : ${tableState}${diagError ? " · erreur : " + diagError : ""}`;
}

function render() {
  // ancien réglage global des colonnes du détail : recopié dans chaque bloc qui n'a pas le sien, puis supprimé
  if (config.detailCols) {
    const legacy = config.detailCols; delete config.detailCols;
    if (legacy.length) config.blocks.forEach(b => { if (!b.detailCols || !b.detailCols.length) b.detailCols = legacy.slice(); });
    saveConfig();
  }
  RACINE.classList.toggle("editing", editing); RACINE.classList.toggle("lecture", CTX.mode !== "edition");
  $("toggleEdit").textContent = editing ? "Terminer les modifications" : "Modifier le tableau de bord";
  renderGlobal();
  const base = baseRows();
  const tiles = [], blocks = [];
  config.blocks.forEach((b, i) => { if (b.type === "tile" && !editing && attachedTo(b)) return; (b.type === "tile" ? tiles : blocks).push(b.type === "tile" ? renderTile(b, i, base) : renderCross(b, i, base)); });
  $("tiles").innerHTML = tiles.join("");
  $("blocks").innerHTML = blocks.join("") || (config.blocks.length ? "" : `<div class="card empty">Tableau de bord vide : cliquez sur « Modifier le tableau de bord » pour ajouter des blocs.</div>`);
  renderQuickBar();
  const filtered = (config.filters && config.filters.some(c => c.col)) || Object.keys(quick).length;
  $("source").textContent = `${base.length} ligne${base.length > 1 ? "s" : ""}${filtered ? ` sur ${records.length}` : ""}`;
  renderDiagOnly();
  ensureRefs();
  if (accessLevel && accessLevel !== "full") showMsg("warn", "Le widget n'a pas l'accès complet au document : dans le panneau de droite, onglet du widget, réglez « Accès » sur « Accès complet » pour lire toutes les colonnes.");
}

// =============================================================================
// Événements
// =============================================================================
function setPath(obj, path, value) {
  const ks = path.split("."); let o = obj;
  ks.slice(0, -1).forEach(k => { o[k] = o[k] || {}; o = o[k]; });
  o[ks[ks.length - 1]] = value;
}
const scopeBlock = scope => scopeHost(scope).ctx;
function condsOf(scope) { const h = scopeHost(scope); return (h.host[h.condKey] = h.host[h.condKey] || []); }

function commit() { saveConfig(); render(); }

RACINE.addEventListener("change", e => {
  const t = e.target;
  if (t.id === "dashName") { config.name = t.value.trim() || "Tableau de bord"; commit(); return; }
  if (t.id === "wordTilesLayout" || t.id === "wordTilesPerRow" || t.id === "wordDeltaColor") {
    config.wordTiles = { layout: $("wordTilesLayout").value, perRow: Number(($("wordTilesPerRow") || {}).value) || (config.wordTiles || {}).perRow || 3, deltaColor: ($("wordDeltaColor") || {}).value || "color" };
    commit(); return;
  }
  if (t.dataset && t.dataset.bdetail !== undefined) {                 // colonnes du détail, propres au bloc
    const blk = config.blocks[Number(t.dataset.bdetail)];
    const set = new Set(blk.detailCols || []); t.checked ? set.add(t.dataset.col) : set.delete(t.dataset.col);
    blk.detailCols = inSrc(blk, () => columns.map(c => c.id).filter(id => set.has(id))); commit(); return;
  }
  if (t.dataset.b !== undefined && t.dataset.k) {
    const b = config.blocks[Number(t.dataset.b)];
    const v = t.type === "checkbox" ? t.checked : t.type === "number" ? Number(t.value) : t.value;
    setPath(b, t.dataset.k, v);
    if (t.dataset.k === "source") {
      const oldSrc = t.dataset.prev || null;
      if (!v) delete b.source;
      remapBlockCols(b, oldSrc && oldSrc !== mainTable ? oldSrc : null);
      ensureRefs();
    }
    inSrc(b, () => {
    if (t.dataset.k === "measure.agg" && v === "cover" && (!b.measure.col || isNumCol(b.measure.col))) b.measure.col = (columns.find(c => !isNumCol(c.id) && !isDate(c.id) && !isBool(c.id)) || {}).id || "";
    else if (t.dataset.k === "measure.agg" && v !== "count" && !b.measure.col) b.measure.col = (columns.find(c => isNumCol(c.id)) || {}).id || "";
    if (t.dataset.k === "chart" && v === "points" && !cibleDe((colDeBloc(b, b.rows.col) || {}).type)) {   // lignes : la colonne de l'établissement
      const etab = columns.find(c => cibleDe(c.type) && refColumns(cibleDe(c.type)).some(x => /^lat/i.test(x.id)));
      if (etab) { b.rows.col = etab.id; delete b.rows.grain; delete b.rows.ref; }
    }
    if (/\.ref\.table$/.test(t.dataset.k)) {                            // colonne de la liste devinée d'après la colonne des réponses
      const ref = t.dataset.k.startsWith("measure") ? b.measure.ref : b.rows.ref, own = t.dataset.k.startsWith("measure") ? b.measure.col : b.rows.col;
      const rc = refColumns(v), target = refNorm(labelOf(own || "")).replace(/ /g, "");
      ref.col = (rc.find(c => refNorm(c.id).replace(/ /g, "") === target) || rc.find(c => { const n = refNorm(c.id + " " + c.label).replace(/ /g, ""); return target && (n.includes(target) || target.includes(refNorm(c.id).replace(/ /g, ""))); })
        || rc.find(c => !/^(Numeric|Int|Bool|Date)/.test(c.type)) || {}).id || "";
      delete ref.expect; delete ref.conds; delete ref.logic;              // nouvelle table : ses filtres repartent de zéro
    }
    });
    commit();
  } else if (t.dataset.lscope && t.dataset.lf) {                     // ET / OU / formule
    const lg = logicOf(t.dataset.lscope);
    lg[t.dataset.lf] = t.value.trim();
    if (t.dataset.lf === "mode" && t.value === "expr" && !lg.expr) {
      const n = condsOf(t.dataset.lscope).length;
      lg.expr = Array.from({ length: n }, (_, k) => k + 1).join(" ET ");
    }
    commit();
  } else if (t.dataset.scope && t.dataset.f) {
    const c = condsOf(t.dataset.scope)[Number(t.dataset.ci)];
    c[t.dataset.f] = t.value;
    if (t.dataset.f === "col") { c.val = ""; delete c.prec; delete c.rel; if (inSrc(scopeBlock(t.dataset.scope), () => isBool(t.value))) c.op = "true"; }
    if (t.dataset.f === "relkind") { delete c.relkind; if (t.value) c.rel = { kind: t.value, n: (c.rel && c.rel.n) || 1 }; else delete c.rel; }
    if (t.dataset.f === "reln") { delete c.reln; c.rel = { ...(c.rel || {}), n: Math.max(0, Math.round(Number(t.value) || 0)) }; }
    if (t.dataset.f === "prec") {                                      // on adapte la valeur déjà saisie à la nouvelle précision
      const v = String(c.val || "");
      c.val = t.value === "day" ? v.slice(0, 10) : t.value === "datetime" ? (v.length >= 16 ? v.slice(0, 16) : v.length >= 10 ? v.slice(0, 10) + "T00:00" : "") : (v.length >= 16 ? v.slice(11, 16) : "");
    }
    commit();
  }
});
// les titres et valeurs se mettent à jour sans perdre le curseur : enregistrement au changement uniquement
RACINE.addEventListener("click", e => {
  const t = e.target.closest("button"); if (!t) return;
  const act = t.dataset.act, i = Number(t.dataset.b);
  if (act === "clrdetail") { delete config.blocks[i].detailCols; commit(); return; }
  if (act === "autodesc") { delete config.blocks[i].desc; commit(); return; }
  if (act === "addqf") { const c = $("qfAddCol").value; if (c) { config.quickFilters = [...(config.quickFilters || []), c]; commit(); } return; }
  if (act === "delqf") { const c = (config.quickFilters || [])[Number(t.dataset.k)]; config.quickFilters.splice(Number(t.dataset.k), 1); delete quick[c]; commit(); return; }
  if (act === "addcond") { condsOf(t.dataset.scope).push({ col: inSrc(scopeBlock(t.dataset.scope), () => (columns[0] || {}).id || ""), op: "eq", val: "" }); commit(); }
  else if (act === "delcond") {
    const k = Number(t.dataset.ci), lg = logicOf(t.dataset.scope);
    condsOf(t.dataset.scope).splice(k, 1);
    if (lg.mode === "expr" && lg.expr) {                               // renumérotation ; la condition retirée sort de la formule
      lg.expr = lg.expr.replace(/\d+/g, m => { const i = Number(m) - 1; return i === k ? "§" : String(i > k ? i : i + 1); })
        .replace(/\s*(ET|OU|AND|OR|&&?|\|\|?)\s*§|§\s*(ET|OU|AND|OR|&&?|\|\|?)\s*/gi, " ").replace(/(NON|NOT|!)\s*§/gi, "").replace(/\(\s*\)/g, "").replace(/§/g, "").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").replace(/\s+/g, " ").trim();
    }
    commit();
  }
  else if (act === "del") { config.blocks.splice(i, 1); commit(); }
  else if (act === "dup") { const c = JSON.parse(JSON.stringify(config.blocks[i])); c.id = newId(); c.title = (c.title || "") + " (copie)"; config.blocks.splice(i + 1, 0, c); commit(); }
  else if (act === "up" || act === "down") {
    const sameType = config.blocks.map((b, k) => [b, k]).filter(([b]) => (b.type === "tile") === (config.blocks[i].type === "tile")).map(([, k]) => k);
    const pos = sameType.indexOf(i), j = sameType[pos + (act === "up" ? -1 : 1)];
    if (j !== undefined) { [config.blocks[i], config.blocks[j]] = [config.blocks[j], config.blocks[i]]; commit(); }
  }
  else if (act === "csv") downloadCsv(config.blocks[i]);
  else if (act === "copy") copyForWord(config.blocks[i], t);
  else if (act === "png") downloadPng(config.blocks[i], i);
  else if (act === "docx") exportWord(i);
});
$("toggleEdit").addEventListener("click", () => { editing = !editing; render(); });

// ---- Glisser-déposer : réordonner les chiffres clés entre eux et les tableaux ou cartes entre eux
let dragFrom = null;
const dropMarks = () => document.querySelectorAll(".drop-before, .drop-after").forEach(e => e.classList.remove("drop-before", "drop-after"));
function dropTarget(e) {
  const card = e.target.closest && e.target.closest("[data-bi]"); if (!card || dragFrom === null) return null;
  const to = Number(card.dataset.bi), from = config.blocks[dragFrom];
  if (to === dragFrom || !from || (config.blocks[to].type === "tile") !== (from.type === "tile")) return null;   // chaque zone garde ses blocs
  const r = card.getBoundingClientRect(), tile = from.type === "tile";
  const after = tile ? e.clientX > r.left + r.width / 2 : e.clientY > r.top + r.height / 2;
  return { card, to, after };
}
RACINE.addEventListener("dragstart", e => {
  const h = e.target.closest && e.target.closest("[data-drag]"); if (!h || !editing) return;
  dragFrom = Number(h.dataset.drag);
  const card = h.closest("[data-bi]");
  e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(dragFrom));
  if (card) { try { e.dataTransfer.setDragImage(card, 20, 20); } catch (err) { } setTimeout(() => card.classList.add("dragging"), 0); }
});
RACINE.addEventListener("dragover", e => {
  if (dragFrom !== null) {                                            // défilement automatique près des bords
    if (e.clientY < 60) window.scrollBy(0, -24); else if (e.clientY > window.innerHeight - 60) window.scrollBy(0, 24);
  }
  const t = dropTarget(e); if (!t) return;
  e.preventDefault(); e.dataTransfer.dropEffect = "move";
  dropMarks(); t.card.classList.add(t.after ? "drop-after" : "drop-before");
});
RACINE.addEventListener("drop", e => {
  const t = dropTarget(e); dropMarks(); if (!t) return;
  e.preventDefault();
  const [blk] = config.blocks.splice(dragFrom, 1);
  let at = t.to - (dragFrom < t.to ? 1 : 0); if (t.after) at++;
  config.blocks.splice(at, 0, blk); dragFrom = null; commit();
});
RACINE.addEventListener("dragend", () => { dragFrom = null; dropMarks(); document.querySelectorAll(".dragging").forEach(e => e.classList.remove("dragging")); });
$("exportWord").addEventListener("click", () => exportWord());
// Récupération d'une configuration enregistrée dans un autre widget du document
// (réglages stockés dans _grist_Views_section.options -> customView -> widgetOptions)
function findConfigs(value, path, out, depth = 0) {
  if (depth > 14 || value === null || value === undefined) return;
  if (typeof value === "string") {
    const t = value.trim();
    if ((t.startsWith("{") || t.startsWith("[")) && t.includes("blocks")) { try { findConfigs(JSON.parse(t), path, out, depth + 1); } catch (e) { } }
    return;
  }
  if (typeof value !== "object") return;
  if (Array.isArray(value.blocks) && value.blocks.every(b => b && b.type && b.measure)) { out.push(value); return; }
  Object.keys(value).forEach(k => findConfigs(value[k], path.concat(k), out, depth + 1));
}
async function scanDocument() {
  const S = await grist.docApi.fetchTable("_grist_Views_section");
  let V = { id: [], name: [] }; try { V = await grist.docApi.fetchTable("_grist_Views"); } catch (e) { }
  const T = await grist.docApi.fetchTable("_grist_Tables");
  const found = [];
  S.id.forEach((id, i) => {
    const out = []; findConfigs(S.options[i], [], out);
    out.forEach(cfg => {
      const vi = V.id.indexOf(S.parentId[i]), ti = T.id.indexOf(S.tableRef ? S.tableRef[i] : -1);
      found.push({ section: id, page: vi >= 0 ? V.name[vi] : `page ${S.parentId[i]}`, title: (S.title && S.title[i]) || "", table: ti >= 0 ? T.tableId[ti] : "", cfg });
    });
  });
  const C = await readCfgTable();
  if (C && C.id) C.id.forEach((id, k) => { try { const cfg = JSON.parse(C.Configuration[k]); if (cfg && Array.isArray(cfg.blocks)) found.push({ section: "table", page: CFG_TABLE, title: C.Nom[k], table: "", cfg }); } catch (e) { } });
  return found;
}
$("findCfg").addEventListener("click", async () => {
  const box = $("recover");
  box.innerHTML = `<div class="card"><div class="empty">Recherche dans le document…</div></div>`;
  try {
    const found = await scanDocument();
    const same = c => JSON.stringify(c) === JSON.stringify(config);
    window.__found = found;
    box.innerHTML = `<div class="card"><div class="card-head"><div class="t"><h2>Configurations trouvées dans ce document</h2>
      <div class="desc">Choisissez celle à reprendre dans ce widget. La configuration actuelle sera remplacée (pensez à la sauvegarder avant si besoin).</div></div>
      <button class="ghost" id="recoverClose">✕</button></div>
      ${found.length ? `<table style="margin-top:8px"><thead><tr><th>Page</th><th>Widget</th><th>Table</th><th>Blocs</th><th></th></tr></thead><tbody>
      ${found.map((f, k) => `<tr><td>${esc(f.page)}</td><td>${esc(f.title || "sans titre")}${f.section === "table" ? " (copie de sécurité)" : ` (n° ${f.section})`}</td><td>${esc(f.table)}</td>
        <td>${f.cfg.blocks.length} : ${esc(f.cfg.blocks.slice(0, 3).map(b => plain(b.title || "")).join(", "))}${f.cfg.blocks.length > 3 ? "…" : ""}</td>
        <td>${same(f.cfg) ? `<span class="hint">configuration actuelle</span>` : `<button data-act="usecfg" data-k="${k}">Utiliser</button>`}</td></tr>`).join("")}</tbody></table>`
      : `<div class="empty">Aucune configuration de tableau de bord n'a été trouvée dans les widgets de ce document.</div>`}</div>`;
  } catch (e) { box.innerHTML = `<div class="msg err">Recherche impossible : ${esc(e && e.message ? e.message : e)} (l'accès complet est nécessaire).</div>`; }
});
RACINE.addEventListener("click", e => {
  const t = e.target.closest("button"); if (!t) return;
  if (t.id === "recoverClose") $("recover").innerHTML = "";
  if (t.dataset.act === "usecfg") {
    const f = (window.__found || [])[Number(t.dataset.k)]; if (!f) return;
    config = JSON.parse(JSON.stringify({ filters: f.cfg.filters || [], blocks: f.cfg.blocks })); configLoaded = true;
    $("recover").innerHTML = ""; commit();
    showMsg("ok", `Configuration reprise du widget « ${f.title || "sans titre"} » (page ${f.page}) : ${f.cfg.blocks.length} bloc(s). Pensez à cliquer sur « Sauvegarder la configuration ».`);
  }
});

// Sauvegarde / restauration de la configuration (pour changer de version du widget ou copier un tableau de bord)
$("saveCfg").addEventListener("click", () => {
  const data = JSON.stringify({ format: "tableau_de_bord_grist", version: 1, date: new Date().toISOString(), config }, null, 2);
  const d = new Date(), p = n => String(n).padStart(2, "0");
  triggerDownload(new Blob([data], { type: "application/octet-stream" }), `configuration tableau de bord ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`);
});
$("loadCfg").addEventListener("click", () => { $("cfgFile").value = ""; $("cfgFile").click(); });
$("cfgFile").addEventListener("change", async e => {
  const f = e.target.files && e.target.files[0]; if (!f) return;
  try {
    const obj = JSON.parse(await f.text());
    const cfg = obj && obj.config ? obj.config : obj;
    if (!cfg || !Array.isArray(cfg.blocks)) throw new Error("ce fichier ne contient pas de configuration de tableau de bord");
    const unknown = [...new Set([...(cfg.filters || []), ...cfg.blocks.flatMap(b => [...(b.conds || []), b.measure, b.rows, b.cols])]
      .filter(x => x && x.col).map(x => x.col))].filter(c => !columns.some(k => k.id === c));
    config = { filters: cfg.filters || [], blocks: cfg.blocks }; configLoaded = true;
    commit();
    showMsg(unknown.length ? "warn" : "ok", `Configuration restaurée : ${cfg.blocks.length} bloc(s).` +
      (unknown.length ? ` Colonnes introuvables dans cette table : ${unknown.join(", ")}.` : ""));
  } catch (err) { showMsg("err", "Restauration impossible : " + err.message); }
});
let resizeTimer = null;
window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(render, 150); });
$("addTile").addEventListener("click", () => { const id = newId(); detailOpen.add(id + "-ed"); config.blocks.push({ id, type: "tile", title: "Nouveau chiffre clé", measure: { agg: "count" }, conds: [] }); commit(); });
$("openAll").addEventListener("click", () => { config.blocks.forEach(b => detailOpen.add(b.id + "-ed")); render(); });
$("closeAll").addEventListener("click", () => { config.blocks.forEach(b => detailOpen.delete(b.id + "-ed")); render(); });
$("addCross").addEventListener("click", () => {
  const col = (columns.find(c => /^Choice/.test(c.type)) || columns[0] || {}).id || "";
  const nid = newId(); detailOpen.add(nid + "-ed");
  config.blocks.push({ id: nid, type: "cross", title: "Nouveau tableau croisé", measure: { agg: "count" }, rows: { col, grain: "jour" }, cols: { col: "", grain: "jour" }, conds: [], view: "both", sort: "value", top: 20 });
  commit();
});

// info-bulle des graphiques
RACINE.addEventListener("mousemove", e => {
  const t = e.target.closest && e.target.closest("[data-tip]"), tip = $("tip");
  if (!t) { tip.style.display = "none"; return; }
  const [a, v] = t.getAttribute("data-tip").split(TIP_SEP);
  tip.innerHTML = `${rich(a)}<br><b>${esc(v)}</b>`; tip.style.display = "block";
  const x = Math.min(e.clientX + 12, window.innerWidth - tip.offsetWidth - 8);
  tip.style.left = x + "px"; tip.style.top = (e.clientY + 14) + "px";
});

function downloadCsv(b) {
  const q = v => { const s = v == null ? "" : String(v); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const num = v => isNaN(v) ? "" : String(Math.round(v * 1000) / 1000).replace(".", ",");
  const base = baseRows(); let lines;
  if (isCover(b)) {
    const c = coverInfo(base.filter(r => passAll(r, b.conds, b.logic)), b.measure);
    lines = [[b.title || measureText(b.measure)], ["Valeur", "Lignes", "Statut"]];
    if (c.ok) [...c.missing, ...c.present].forEach(x => lines.push([x.label, String(x.n), x.n ? "A répondu" : "Sans réponse"]));
    if (c.ok) c.outside.forEach(x => lines.push([x.label, String(x.n), "Hors liste"]));
  }
  else if (b.type === "tile") lines = [[b.title || measureText(b.measure)], [num(aggregate(base.filter(r => passAll(r, b.conds, b.logic)), b.measure))]];
  else {
    const d = crossData(b, base);
    const ex = expectCells(d), pc = !!(ex && d.refCfg.perCol);
    lines = [[plain(rowHead(d.rc, d.rg)), ...d.colKeys.flatMap(k => pc ? [plain(keyLabel(d.cc, k, d.cg)), plain(keyLabel(d.cc, k, d.cg)) + " (%)"] : [plain(keyLabel(d.cc, k, d.cg))]), "Total", ...(ex ? [plain(ex.head[0]), plain(ex.head[1]) + " (%)"] : [])]];
    d.rowKeys.forEach(rk => lines.push([plain(keyLabel(d.rc, rk, d.rg)), ...d.colKeys.flatMap(ck => pc ? [num(d.val(rk, ck)), num(cellRatio(d, rk, d.val(rk, ck)))] : [num(d.val(rk, ck))]), num(d.rowVal.get(rk)), ...(ex ? ex.raw(rk).map(num) : [])]));
    lines.push(["Total", ...d.colKeys.flatMap(ck => pc ? [num(d.colVal.get(ck)), num(cellRatio(d, null, d.colVal.get(ck)))] : [num(d.colVal.get(ck))]), num(d.total), ...(ex ? ex.rawTotal.map(num) : [])]);
  }
  const text = "﻿" + lines.map(l => l.map(q).join(";")).join("\r\n") + "\r\n";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  a.download = fileSafe(b.title || "tableau") + ".csv";
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// =============================================================================
// Export vers Word : image PNG des graphiques, copie des tableaux, document .docx
// =============================================================================
// Couleurs claires imposées pour les exports (fond blanc dans Word, même si l'écran est en mode sombre)
const LIGHT = { "--s1": "#2a78d6", "--s2": "#eb6834", "--s3": "#1baf7a", "--s4": "#eda100", "--s5": "#e87ba4", "--s6": "#008300",
  "--s7": "#4a3aa7", "--other": "#898781", "--axis": "#c3c2b7", "--ink": "#000000", "--ink-2": "#000000",
  "--q0": "#f0efec", "--q1": "#cde2fb", "--q2": "#86b6ef", "--q3": "#3987e5", "--q4": "#1c5cab", "--q5": "#0d366b", "--surface": "#ffffff", "--grid": "#e1e0d9" };
const lightVars = s => s.replace(/var\((--[a-z0-9-]+)\)/g, (m, v) => LIGHT[v] || m);

function stamp() {
  const d = new Date(), p = n => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} à ${p(d.getHours())}h${p(d.getMinutes())}`;
}
// nom de fichier sans accents ni caractères spéciaux (certains navigateurs remplacent sinon le nom par « download »)
const fileSafe = s => plain(s || "export").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[’']/g, " ")
  .replace(/[^A-Za-z0-9 ._-]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 80) || "export";

function triggerDownload(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

// Graphique SVG (+ légende) -> PNG, en couleurs claires, à 2x pour une impression nette
function chartToPng(card) {
  const svg = card && card.querySelector(".chart svg"); if (!svg) return Promise.resolve(null);
  const W = Number(svg.getAttribute("width")), H0 = Number(svg.getAttribute("height"));
  const legendItems = [...card.querySelectorAll(".chart .legend span")].map(s => ({
    color: lightVars((s.querySelector("i") || {}).style ? s.querySelector("i").style.background : "#898781"), text: s.textContent.trim() }));
  // légende redessinée sous le graphique
  let lx = 0, ly = H0 + 18, leg = "";
  legendItems.forEach(it => {
    const w = 18 + it.text.length * 7.5;
    if (lx + w > W) { lx = 0; ly += 18; }
    leg += `<rect x="${lx}" y="${ly - 9}" width="10" height="10" rx="3" fill="${it.color}"/><text x="${lx + 15}" y="${ly}" fill="#000000">${esc(it.text)}</text>`;
    lx += w + 12;
  });
  const H = legendItems.length ? ly + 8 : H0;
  let inner = svg.innerHTML.replace(/<title>[\s\S]*?<\/title>/g, "").replace(/ data-tip="[^"]*"/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");     // caractères interdits en XML
  inner = lightVars(inner).replace(/<text class="val"/g, '<text fill="#000000"').replace(/<text(?![^>]*fill=)/g, '<text fill="#000000"');
  const src = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <style>text{font-family:Marianne,Arial,Helvetica,sans-serif;font-size:13.33px}</style>
    <rect width="100%" height="100%" fill="#ffffff"/>${inner}${leg}</svg>`;
  return new Promise((resolve, reject) => {
    const img = new Image(), k = 2;
    img.onload = () => {
      const c = document.createElement("canvas"); c.width = W * k; c.height = H * k;
      const ctx = c.getContext("2d"); ctx.scale(k, k); ctx.drawImage(img, 0, 0);
      c.toBlob(b => b ? resolve({ blob: b, w: W, h: H }) : reject(new Error("conversion impossible")), "image/png");
    };
    img.onerror = () => reject(new Error("graphique illisible"));
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(src.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, ""));
  });
}

// Contenu tabulaire d'un bloc, tel qu'affiché (lignes limitées à « Lignes affichées »)
function blockTable(b) {
  const base = baseRows();
  if (b.type === "tile") return null;
  const d = crossData(b, base);
  const top = topOf(b);
  const pct = b.percent && ADDITIVE.has(b.measure.agg || "count") && d.total;
  const show = v => pct ? (isNaN(v) ? "–" : nf.format(v / d.total * 100) + " %") : fmtNum(v);
  const ex = expectCells(d);
  const head = [rowHead(d.rc, d.rg), ...d.colKeys.map(k => keyLabel(d.cc, k, d.cg)), d.cc ? "Total" : plain(measureText(b.measure)), ...(ex ? ex.head : [])];
  const rows = d.rowKeys.slice(0, top).map(rk => [keyLabel(d.rc, rk, d.rg), ...d.colKeys.map(ck => withRatio(show(d.val(rk, ck)), cellRatio(d, rk, d.val(rk, ck)))), show(d.rowVal.get(rk)), ...(ex ? ex.row(rk) : [])]);
  const total = ["Total", ...d.colKeys.map(ck => withRatio(show(d.colVal.get(ck)), cellRatio(d, null, d.colVal.get(ck)))), show(d.total), ...(ex ? ex.total : [])];
  const hidden = Math.max(0, d.rowKeys.length - top);
  return { head, rows, total, hidden, empty: (!d.rows.length && !d.missingKeys.size) || !b.rows.col };
}
// Rappel du calcul : texte libre du bloc s'il est saisi ({calcul} y insère le texte automatique), sinon texte automatique
function blockDesc(b) {
  const auto = autoDesc(b), own = String(b.desc || "").trim();
  return own ? own.replace(/\{calcul\}/gi, auto) : auto;
}
function autoDesc(b) {
  if (!isMainSrc(b) && curSrc !== b.source) return inSrc(b, () => autoDesc(b));
  const src = isMainSrc(b) ? "" : `Table ${b.source} · `;
  const conds = condsText(b.conds, b.logic);
  const dims = b.type === "cross" ? (b.rows.col ? " par " + rowDim(b.rows.col, b.rows.grain) : "") + (b.cols && b.cols.col ? " et " + labelOf(b.cols.col) : "") : "";
  return src + measureText(b.measure) + dims + (conds ? " · " + conds : "");
}
// Valeur d'un chiffre clé et, si demandé, sa part : mesure avec conditions ÷ même mesure sans les conditions du bloc
const coverNote = c => `${c.missing.length} sans réponse${c.outside.length ? ` · ${c.outside.length} valeur(s) hors liste` : ""}`;
function tileNumbers(b, base) {
  base = base || baseRows();
  if (isCover(b)) {
    const c = coverInfo(base.filter(r => passAll(r, b.conds, b.logic)), b.measure);
    if (!c.ok) return { v: NaN, all: NaN, share: NaN, cover: c };
    return { v: c.present.length, all: c.total, share: c.total ? c.present.length / c.total * 100 : NaN, cover: c };
  }
  const v = aggregate(base.filter(r => passAll(r, b.conds, b.logic)), b.measure);
  const all = b.showShare ? aggregate(base, b.measure) : NaN;
  const share = b.showShare && all ? v / all * 100 : NaN;
  return { v, all, share };
}
const shareUnit = b => (b.measure.agg || "count") === "count" ? "lignes" : isCover(b) ? "attendus" : "";
function tileValue(b) {
  const cp = cardParts(b), extra = [cp.sub && cp.sub.text, cp.prev && `${plain(cp.prev.label)} : ${cp.prev.value}${cp.prev.delta ? " " + cp.prev.delta.text : ""}`, cp.ref && `${plain(cp.ref.label)} : ${cp.ref.value}`].filter(Boolean);
  return tileValueBase(b) + (extra.length ? " — " + extra.join(" ; ") : "");
}
function tileValueBase(b) {
  const t = tileNumbers(b);
  if (!(b.showShare || isCover(b)) || isNaN(t.share)) return fmtNum(t.v);
  return b.shareMain ? `${fmtNum(t.share)} % (${fmtNum(t.v)} sur ${fmtNum(t.all)})` : `${fmtNum(t.v)} (${fmtNum(t.share)} %)`;
}

// ---- Copie d'un tableau pour collage dans Word (tableau Word natif) ----
function tableHtml(b) {
  const t = blockTable(b); if (!t) return "";
  const th = s => `<th style="border:1px solid #bfbfbf;background:#f2f2f2;padding:3px 6px;text-align:left;font-weight:bold">${rich(s)}</th>`;
  const td = (s, i, bold) => `<td style="border:1px solid #bfbfbf;padding:3px 6px;text-align:${i ? "right" : "left"}${bold ? ";font-weight:bold" : ""}">${rich(s)}</td>`;
  return `<p style="font-family:Marianne,Arial;font-size:10pt"><b>${rich(b.title || measureText(b.measure))}</b></p>
    ${b.hideDesc ? "" : `<p style="font-family:Marianne,Arial;font-size:10pt">${rich(blockDesc(b))}</p>`}
    <table style="border-collapse:collapse;font-family:Marianne,Arial;font-size:10pt">
    <tr>${t.head.map(th).join("")}</tr>
    ${t.rows.map(r => `<tr>${r.map((c, i) => td(c, i)).join("")}</tr>`).join("")}
    <tr>${t.total.map((c, i) => td(c, i, true)).join("")}</tr></table>
    ${t.hidden ? `<p style="font-family:Marianne,Arial;font-size:10pt">${t.hidden} autre(s) ligne(s) non reprise(s).</p>` : ""}`;
}
async function copyForWord(b, btn) {
  const html = tableHtml(b), text = (() => { const t = blockTable(b); return t ? [t.head, ...t.rows, t.total].map(r => r.map(plain).join("\t")).join("\n") : ""; })();
  let ok = false;
  try {
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) })]);
      ok = true;
    }
  } catch (e) { ok = false; }
  if (!ok) {                                                        // repli : sélection d'un tableau caché puis copie
    const div = document.createElement("div");
    div.contentEditable = "true"; div.style.cssText = "position:fixed;left:-9999px;top:0;background:#fff;color:#000";
    div.innerHTML = html; document.body.appendChild(div);
    const r = document.createRange(); r.selectNodeContents(div);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    sel.removeAllRanges(); div.remove();
  }
  if (btn) { const old = btn.textContent; btn.textContent = ok ? "Copié ✓" : "Copie bloquée"; setTimeout(() => btn.textContent = old, 1800); }
  if (!ok) showMsg("warn", "Grist bloque la copie depuis le widget : utilisez « Exporter en Word » ou le bouton CSV.");
}

// ---- Fichier .docx (généré dans le navigateur, sans bibliothèque externe) ----
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function zipStore(files, mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {                                          // archive ZIP sans compression (suffisant pour Word)
  const enc = new TextEncoder(), parts = [], central = []; let offset = 0;
  files.forEach(f => {
    const name = enc.encode(f.name), data = typeof f.data === "string" ? enc.encode(f.data) : f.data, crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint16(10, 0, true); h.setUint16(12, 0x21, true); h.setUint32(14, crc, true);
    h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), name, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true); c.setUint16(12, 0, true); c.setUint16(14, 0x21, true); c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), name);
    offset += 30 + name.length + data.length;
  });
  const size = central.reduce((a, p) => a + p.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, size, true); e.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: mime });
}

// caractères interdits en XML (codes de contrôle venant des données) retirés : Word refuse sinon d'ouvrir le fichier
const xe = s => String(s ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "").replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function wRuns(text, { bold = false, size = 20 } = {}) {
  const color = null;                                                // tout le texte en noir
  return segs(text).map(x => `<w:r><w:rPr>${bold || x.b ? "<w:b/>" : ""}${color ? `<w:color w:val="${color}"/>` : ""}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr><w:t xml:space="preserve">${xe(x.t)}</w:t></w:r>`).join("");
}
const wP = (text, o = {}) => `<w:p><w:pPr>${o.keep ? "<w:keepNext/>" : ""}<w:spacing w:before="${o.before || 0}" w:after="${o.after ?? 80}"/></w:pPr>${wRuns(text, o)}</w:p>`;
function wCell(text, { head = false, right = false, bold = false, width } = {}) {
  return `<w:tc><w:tcPr>${width ? `<w:tcW w:w="${width}" w:type="dxa"/>` : ""}${head ? '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>' : ""}<w:tcMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tcMar></w:tcPr>
    <w:p><w:pPr><w:spacing w:before="20" w:after="20"/>${right ? '<w:jc w:val="right"/>' : ""}</w:pPr>${wRuns(text, { bold: head || bold, size: 20 })}</w:p></w:tc>`;
}
function wTable(head, rows, total) {
  const border = '<w:top w:val="single" w:sz="4" w:color="BFBFBF"/><w:left w:val="single" w:sz="4" w:color="BFBFBF"/><w:bottom w:val="single" w:sz="4" w:color="BFBFBF"/><w:right w:val="single" w:sz="4" w:color="BFBFBF"/><w:insideH w:val="single" w:sz="4" w:color="BFBFBF"/><w:insideV w:val="single" w:sz="4" w:color="BFBFBF"/>';
  const row = (cells, o = {}) => `<w:tr>${o.head ? '<w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>' : '<w:trPr><w:cantSplit/></w:trPr>'}${cells.map((c, i) => wCell(c, { head: o.head, right: i > 0 && !o.head, bold: o.bold })).join("")}</w:tr>`;
  const nCol = Math.max(1, head.length), cw = Math.floor(9638 / nCol);
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${border}</w:tblBorders><w:tblLayout w:type="autofit"/></w:tblPr>
    <w:tblGrid>${Array(nCol).fill(`<w:gridCol w:w="${cw}"/>`).join("")}</w:tblGrid>
    ${row(head, { head: true })}${rows.map(r => row(r)).join("")}${total ? row(total, { bold: true }) : ""}</w:tbl>`;
}
function wImage(rid, id, wPx, hPx) {
  const maxEmu = 6120000;                                           // largeur utile d'une page A4 (17 cm)
  let cx = wPx * 9525, cy = hPx * 9525; if (cx > maxEmu) { cy = Math.round(cy * maxEmu / cx); cx = maxEmu; }
  return `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/>
    <wp:docPr id="${id}" name="Graphique ${id}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>
    <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
    <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="graphique${id}.png"/><pic:cNvPicPr/></pic:nvPicPr>
    <pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
    <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>
    </a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

// ---- Graphiques Word natifs (modifiables : couleurs, police, type, données) ----
const hexOf = c => (lightVars(c || "var(--s1)").replace("#", "") || "2A78D6").toUpperCase();
const colLetter = n => { let s = ""; n++; while (n) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };

function strCache(list) { return `<c:strCache><c:ptCount val="${list.length}"/>${list.map((v, i) => `<c:pt idx="${i}"><c:v>${xe(v)}</c:v></c:pt>`).join("")}</c:strCache>`; }
function numCache(list) { return `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${list.length}"/>${list.map((v, i) => v === null || v === undefined || isNaN(v) ? "" : `<c:pt idx="${i}"><c:v>${+(+v).toFixed(4)}</c:v></c:pt>`).join("")}</c:numCache>`; }
const fill = hex => `<c:spPr><a:solidFill><a:srgbClr val="${hex}"/></a:solidFill></c:spPr>`;
const lnSp = hex => `<a:ln w="9525"><a:solidFill><a:srgbClr val="${hex}"/></a:solidFill></a:ln>`;
const dLbls = (o = {}) => `<c:dLbls>${o.pos ? `<c:dLblPos val="${o.pos}"/>` : ""}<c:showLegendKey val="0"/><c:showVal val="${o.val ? 1 : 0}"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="${o.pct ? 1 : 0}"/><c:showBubbleSize val="0"/></c:dLbls>`;

// Étiquettes Word : « valeurs » reste lié aux données (showVal) ; pourcentages et textes composés sont écrits point par point.
function wordLabels(spec, s, k, kind) {
  if (!labelsOn(spec)) return null;
  const stacked = kind === "bar" && spec.mode !== "group" && spec.mode !== "single";
  const pos = kind === "line" ? "t" : kind === "bar" ? (stacked ? "ctr" : "outEnd") : "";
  const posXml = pos ? `<c:dLblPos val="${pos}"/>` : "";
  const flags = (v, p) => `<c:showLegendKey val="0"/><c:showVal val="${v ? 1 : 0}"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="${p ? 1 : 0}"/><c:showBubbleSize val="0"/>`;
  // largeur approximative du tracé dans Word (17 cm ≈ 560 px), pour écarter les étiquettes qui ne tiennent pas
  const plotPx = 560, cw = 5.6, n = spec.cats.length;
  const longest = Math.max(0, ...spec.cats.map((_, j) => String(pointLabel(spec, j, k)).length));
  const rotate = (kind === "bar" && spec.type === "barv" && !stacked || kind === "line") && longest * cw + 4 > plotPx / Math.max(1, n) / (kind === "bar" && spec.mode === "group" ? spec.series.length : 1);
  const body = rotate ? '<a:bodyPr rot="-5400000" vert="horz"/>' : "<a:bodyPr/>";
  const txt = color => `<c:txPr>${body}<a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="fr-FR"/></a:p></c:txPr>`;
  const ink = stacked ? inkOn("#" + hexOf(s.color)).replace("#", "").toUpperCase() : "000000";
  if (kind === "pie") {
    if (spec.labels === "val" || spec.baseUnit === " %") return `<c:dLbls>${txt("000000")}${flags(1, 0)}</c:dLbls>`;
    if (spec.labels === "pct") return `<c:dLbls><c:numFmt formatCode="0.0%" sourceLinked="0"/>${txt("000000")}${flags(0, 1)}</c:dLbls>`;
  }
  const plainVal = (spec.labels === "val" || (spec.labels === "valtot" && spec.series.length > 1)) && spec.mode !== "pct";
  const max = maxValue(spec) || 1;
  const texts = spec.cats.map((_, j) => {
    if (kind === "pie") {
      const tot = s.values.reduce((a, v) => a + (v || 0), 0) || 1, v = s.values[j], t = labelText(spec, v, v / tot * 100);
      return v / tot * 2 * Math.PI * 85 >= t.length * cw + 4 ? t : "";   // part trop étroite
    }
    const t = pointLabel(spec, j, k);
    if (stacked) {                                                     // morceau trop petit pour son étiquette
      const px = (s.values[j] || 0) / max * (spec.type === "barh" ? plotPx : 200);
      if (spec.type === "barh" ? px < t.length * 6.5 + 8 : px < 14) return "";
    }
    return t;
  });
  const per = texts.map((t, j) => !t ? `<c:dLbl><c:idx val="${j}"/><c:delete val="1"/></c:dLbl>`
    : plainVal ? "" : `<c:dLbl><c:idx val="${j}"/><c:tx><c:rich>${body}<a:lstStyle/><a:p><a:r><a:rPr lang="fr-FR" sz="900"><a:solidFill><a:srgbClr val="${ink}"/></a:solidFill></a:rPr><a:t>${xe(t)}</a:t></a:r></a:p></c:rich></c:tx>${posXml}${flags(1, 0)}</c:dLbl>`).join("");
  return `<c:dLbls>${per}${txt(ink)}${posXml}${flags(1, 0)}</c:dLbls>`;
}

// Word n'affiche pas de total sur une barre empilée : on ajoute une série transparente, posée au bout de la pile,
// dont l'étiquette (collée à sa base) porte le total. Sans nom ni couleur, elle n'apparaît pas dans la légende.
function wordSeries(spec) {
  if (!(spec.type === "barh" || spec.type === "barv") || !showTotals(spec)) return spec.series;
  const labels = spec.cats.map((_, j) => totalLabel(spec, j)), longest = Math.max(1, ...labels.map(t => t.length));
  const base = maxValue(spec) || 1;
  let pad = spec.type === "barh" ? base * (longest * 5.6 + 10) / 440 : base * 0.12;
  if (spec.mode === "pct") pad = Math.min(19, pad);                  // l'axe s'arrête alors à 100 (graduations de 20)
  return [...spec.series, { key: "__total", name: " ", dummy: true, color: "#FFFFFF", values: spec.cats.map(() => +pad.toFixed(4)), raw: spec.cats.map(() => 0), labels, pad }];
}

function chartXml(spec) {
  const n = spec.cats.length, catF = `Feuil1!$A$2:$A$${n + 1}`, cats = spec.cats.map(c => plain(c.label));
  const all = spec.type === "barh" || spec.type === "barv" ? wordSeries(spec) : spec.series, dummy = all.find(s => s.dummy);
  const serXml = (s, k, kind) => {
    const L = colLetter(k + 1);
    const head = `<c:idx val="${k}"/><c:order val="${k}"/><c:tx><c:strRef><c:f>Feuil1!$${L}$1</c:f>${strCache([s.name])}</c:strRef></c:tx>`;
    const cat = `<c:cat><c:strRef><c:f>${catF}</c:f>${strCache(cats)}</c:strRef></c:cat>`;
    const val = `<c:val><c:numRef><c:f>Feuil1!$${L}$2:$${L}$${n + 1}</c:f>${numCache(s.values)}</c:numRef></c:val>`;
    if (s.dummy) {
      const per = s.labels.map((t, j) => `<c:dLbl><c:idx val="${j}"/><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="fr-FR" sz="900"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:rPr><a:t>${xe(t)}</a:t></a:r></a:p></c:rich></c:tx><c:dLblPos val="inBase"/><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbl>`).join("");
      return `<c:ser>${head}<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr><c:invertIfNegative val="0"/><c:dLbls>${per}<c:dLblPos val="inBase"/><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>${cat}${val}</c:ser>`;
    }
    const custom = wordLabels(spec, s, k, kind), auto = spec.labels === "auto" || !spec.labels;
    if (kind === "bar") return `<c:ser>${head}${fill(hexOf(s.color))}<c:invertIfNegative val="0"/>${custom || (auto && spec.series.length === 1 ? dLbls({ val: true, pos: "outEnd" }) : "")}${cat}${val}</c:ser>`;
    if (kind === "line") return `<c:ser>${head}<c:spPr><a:ln w="28575" cap="rnd"><a:solidFill><a:srgbClr val="${hexOf(s.color)}"/></a:solidFill><a:round/></a:ln></c:spPr>
      <c:marker><c:symbol val="circle"/><c:size val="6"/>${fill(hexOf(s.color)).replace("</c:spPr>", `<a:ln w="12700"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr>`)}</c:marker>${custom || ""}${cat}${val}<c:smooth val="0"/></c:ser>`;
    // anneau : une couleur par part
    const dpts = s.values.map((_, j) => `<c:dPt><c:idx val="${j}"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="${hexOf(s.colors[j])}"/></a:solidFill><a:ln w="19050"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr></c:dPt>`).join("");
    return `<c:ser>${head}${dpts}${custom || (auto ? dLbls({ pct: true }) : "")}${cat}${val}</c:ser>`;
  };
  const axes = (barh) => `
    <c:catAx><c:axId val="5001"/><c:scaling><c:orientation val="${barh ? "maxMin" : "minMax"}"/></c:scaling><c:delete val="0"/><c:axPos val="${barh ? "l" : "b"}"/>
      <c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>
      <c:spPr>${lnSp("C3C2B7")}</c:spPr><c:crossAx val="5002"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>
    <c:valAx><c:axId val="5002"/><c:scaling><c:orientation val="minMax"/>${spec.mode === "pct" ? `<c:max val="${100 + (dummy ? dummy.pad : 0)}"/>` : ""}<c:min val="0"/></c:scaling><c:delete val="0"/><c:axPos val="${barh ? "b" : "l"}"/>
      <c:majorGridlines><c:spPr>${lnSp("E1E0D9")}</c:spPr></c:majorGridlines><c:numFmt formatCode="General" sourceLinked="0"/>
      <c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>
      <c:crossAx val="5001"/><c:crosses val="${barh ? "max" : "autoZero"}"/><c:crossBetween val="between"/>${spec.mode === "pct" ? '<c:majorUnit val="20"/>' : ""}</c:valAx>`;
  let plot;
  if (spec.type === "pie") plot = `<c:doughnutChart><c:varyColors val="1"/>${serXml(spec.series[0], 0, "pie")}<c:firstSliceAng val="0"/><c:holeSize val="55"/></c:doughnutChart>`;
  else if (spec.type === "line") plot = `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${spec.series.map((s, k) => serXml(s, k, "line")).join("")}<c:marker val="1"/><c:axId val="5001"/><c:axId val="5002"/></c:lineChart>${axes(false)}`;
  else {
    const grouping = spec.mode === "stack" ? "stacked" : spec.mode === "pct" ? "stacked" : "clustered";   // « 100 % » : valeurs déjà ramenées à 100
    plot = `<c:barChart><c:barDir val="${spec.type === "barh" ? "bar" : "col"}"/><c:grouping val="${grouping}"/><c:varyColors val="0"/>
      ${wordSeries(spec).map((s, k) => serXml(s, k, "bar")).join("")}<c:gapWidth val="${spec.series.length > 1 && grouping === "clustered" ? 80 : 60}"/>${grouping === "stacked" ? '<c:overlap val="100"/>' : ""}
      <c:axId val="5001"/><c:axId val="5002"/></c:barChart>${axes(spec.type === "barh")}`;
  }
  const legend = spec.type === "pie" || spec.series.length > 1 ? `<c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<c:roundedCorners val="0"/>
<c:chart><c:autoTitleDeleted val="1"/><c:plotArea><c:layout/>${plot}<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr></c:plotArea>${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>
<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr>
<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1000"><a:solidFill><a:srgbClr val="000000"/></a:solidFill><a:latin typeface="Marianne"/><a:cs typeface="Marianne"/></a:defRPr></a:pPr><a:endParaRPr lang="fr-FR"/></a:p></c:txPr>
<c:externalData r:id="rId1"><c:autoUpdate val="0"/></c:externalData>
</c:chartSpace>`;
}

// Classeur Excel intégré au graphique (pour « Modifier les données » dans Word)
function chartWorkbook(spec0) {
  const spec = { ...spec0, series: spec0.type === "barh" || spec0.type === "barv" ? wordSeries(spec0) : spec0.series };
  const cell = (ref, v) => typeof v === "number" ? `<c r="${ref}"><v>${+v.toFixed(4)}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xe(v ?? "")}</t></is></c>`;
  const rows = [`<row r="1">${cell("A1", "")}${spec.series.map((s, k) => cell(colLetter(k + 1) + "1", s.name)).join("")}</row>`];
  spec.cats.forEach((c, j) => rows.push(`<row r="${j + 2}">${cell("A" + (j + 2), plain(c.label))}${spec.series.map((s, k) => {
    const v = s.values[j]; return v === null || v === undefined || isNaN(v) ? "" : cell(colLetter(k + 1) + (j + 2), v); }).join("")}</row>`));
  const x = s => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` + s;
  return zipStore([
    { name: "[Content_Types].xml", data: x(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
      <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
      <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`) },
    { name: "_rels/.rels", data: x(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
    { name: "xl/workbook.xml", data: x(`<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Feuil1" sheetId="1" r:id="rId1"/></sheets></workbook>`) },
    { name: "xl/_rels/workbook.xml.rels", data: x(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) },
    { name: "xl/styles.xml", data: x(`<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="10"/><name val="Marianne"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>`) },
    { name: "xl/worksheets/sheet1.xml", data: x(`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.join("")}</sheetData></worksheet>`) },
  ], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

function wChart(rid, id, spec) {
  const cx = spec.type === "pie" ? 4200000 : 6120000;
  const cy = spec.type === "barh" ? Math.min(8800000, 700000 + spec.cats.length * (spec.mode === "group" && spec.series.length > 1 ? 90000 * spec.series.length + 90000 : 260000))
    : spec.type === "pie" ? 3300000 : 3300000;
  return `<w:p><w:pPr><w:spacing w:after="120"/>${spec.type === "pie" ? '<w:jc w:val="center"/>' : ""}</w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>
    <wp:docPr id="${id}" name="Graphique ${id}"/><wp:cNvGraphicFramePr/>
    <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
    <c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="${rid}"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

// Chiffres clés en tuiles : un tableau Word sans bordure extérieure, espacé, une case encadrée par chiffre clé.
// Tout reste modifiable dans Word (taille des cases, couleurs, police, nombre de colonnes…).
// Pied de carte Word : un petit tableau à deux cases (texte modifiable), filet en haut
function wCardFoot(cp, width) {
  const colored = ((config.wordTiles || {}).deltaColor || "color") !== "black";
  const tone = { bad: "C9191E", good: "18753C", neutral: null };
  const run = (t, o = {}) => `<w:r><w:rPr>${o.bold ? "<w:b/>" : ""}${o.color ? `<w:color w:val="${o.color}"/>` : ""}<w:sz w:val="${o.size || 18}"/><w:szCs w:val="${o.size || 18}"/></w:rPr><w:t xml:space="preserve">${xe(t)}</w:t></w:r>`;
  const p = (runs, right) => `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/>${right ? '<w:jc w:val="right"/>' : ""}</w:pPr>${runs}</w:p>`;
  const side = (x, right, withDelta) => !x ? p("", right) : p(segs(x.label).map(s => run(s.t, { bold: s.b })).join(""), right)
    + p(run(x.value, { bold: true, size: 22 }) + (withDelta && x.delta ? run(" " + x.delta.text, { size: 18, color: colored ? tone[x.delta.tone] : null }) : ""), right);
  const half = Math.floor(width / 2);
  const tc = (inner, w) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/><w:tcBorders><w:top w:val="single" w:sz="4" w:color="D9D9D9"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/></w:tcBorders><w:tcMar><w:top w:w="60" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tcMar></w:tcPr>${inner}</w:tc>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="${width}" w:type="dxa"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders><w:tblLayout w:type="fixed"/>
    <w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w="${half}"/><w:gridCol w:w="${width - half}"/></w:tblGrid>
    <w:tr><w:trPr><w:cantSplit/></w:trPr>${tc(side(cp.prev, false, true), half)}${tc(side(cp.ref, true, false), width - half)}</w:tr></w:tbl>`;
}
function wTiles(tiles, perRow, base) {
  perRow = Math.max(1, Math.min(4, perRow));
  const textW = 9638, gap = 113;                                  // 17 cm utiles, 2 mm entre les tuiles
  const cw = Math.floor((textW - gap * (perRow + 1)) / perRow);
  const border = '<w:top w:val="single" w:sz="6" w:color="D9D9D9"/><w:left w:val="single" w:sz="6" w:color="D9D9D9"/><w:bottom w:val="single" w:sz="6" w:color="D9D9D9"/><w:right w:val="single" w:sz="6" w:color="D9D9D9"/>';
  const none = '<w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/>';
  const para = (text, o = {}) => `<w:p><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="${o.before || 0}" w:after="${o.after ?? 40}"/></w:pPr>${wRuns(text, o)}</w:p>`;
  const cell = b => inSrc(b, () => cellIn(b));
  const cellIn = b => {
    if (!b) return `<w:tc><w:tcPr><w:tcW w:w="${cw}" w:type="dxa"/><w:tcBorders>${none}</w:tcBorders></w:tcPr><w:p/></w:tc>`;
    const t = tileNumbers(b, base), hasShare = (b.showShare || isCover(b)) && !isNaN(t.share), unit = shareUnit(b);
    const main = hasShare && b.shareMain ? `${fmtNum(t.share)} %` : fmtNum(t.v);
    const sub = (!hasShare ? "" : b.shareMain ? `${fmtNum(t.v)} sur ${fmtNum(t.all)}${unit ? " " + unit : ""}` : `${fmtNum(t.share)} % (sur ${fmtNum(t.all)}${unit ? " " + unit : ""})`)
      + (t.cover && t.cover.ok ? " · " + coverNote(t.cover) : "");
    const cp = cardParts(b, base);
    return `<w:tc><w:tcPr><w:tcW w:w="${cw}" w:type="dxa"/><w:tcBorders>${border}</w:tcBorders></w:tcPr>
      ${para(b.title || measureText(b.measure), { bold: true, size: 20 })}
      ${b.hideDesc ? "" : para(blockDesc(b), { size: 20 })}
      ${para(main, { bold: true, size: 40, before: 80, after: sub || cp.sub ? 20 : 40 })}
      ${sub ? para(sub, { size: 20 }) : ""}${cp.sub ? para(cp.sub.text, { size: 20 }) : ""}
      ${cp.prev || cp.ref ? wCardFoot(cp, cw - 340) + `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:rPr><w:sz w:val="4"/></w:rPr></w:pPr></w:p>` : ""}</w:tc>`;
  };
  const rows = [];
  for (let k = 0; k < tiles.length; k += perRow) {
    const chunk = tiles.slice(k, k + perRow); while (chunk.length < perRow) chunk.push(null);
    rows.push(`<w:tr><w:trPr><w:cantSplit/></w:trPr>${chunk.map(cell).join("")}</w:tr>`);
  }
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblCellSpacing w:w="${gap}" w:type="dxa"/>
    <w:tblBorders>${none}<w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders><w:tblLayout w:type="fixed"/>
    <w:tblCellMar><w:top w:w="113" w:type="dxa"/><w:left w:w="170" w:type="dxa"/><w:bottom w:w="113" w:type="dxa"/><w:right w:w="170" w:type="dxa"/></w:tblCellMar></w:tblPr>
    <w:tblGrid>${Array(perRow).fill(`<w:gridCol w:w="${cw}"/>`).join("")}</w:tblGrid>${rows.join("")}</w:tbl>`;
}

async function exportWord(onlyIndex = null) {
  const btn = $("exportWord"); if (btn) { btn.disabled = true; btn.textContent = "Préparation…"; }
  try {
    const base = baseRows(), body = [], media = [], charts = [];
    const blocks = config.blocks.map((b, i) => [b, i]).filter(([, i]) => onlyIndex === null || i === onlyIndex);
    const commons = condsText(config.filters, config.filtersLogic);
    if (onlyIndex === null) {
      body.push(wP("Tableau de bord", { bold: true, size: 20, after: 60 }));
      const qt = quickText();
      body.push(wP(`Extraction du ${stamp()} · ${base.length} ligne${base.length > 1 ? "s" : ""}${commons ? " · filtres communs : " + commons : ""}${qt ? " · filtres appliqués : " + qt : ""}`, { size: 20, after: 240 }));
    }
    const tiles = blocks.filter(([b]) => b.type === "tile" && (onlyIndex !== null || !attachedTo(b)));
    if (tiles.length) {
      if (onlyIndex === null) body.push(wP("Chiffres clés", { bold: true, size: 20, before: 120, keep: true }));
      const wt = config.wordTiles || { layout: "tiles", perRow: 3 };
      if (wt.layout !== "table") { body.push(wTiles(tiles.map(([b]) => b), Number(wt.perRow) || 3, base)); body.push(wP("", { size: 20, after: 120 })); }
      else {
        body.push(wTable(["Indicateur", "Valeur"], tiles.map(([b]) => [b.title || measureText(b.measure), tileValue(b)]), null));
        const withDesc = tiles.filter(([b]) => !b.hideDesc);
        if (withDesc.length) body.push(wP(withDesc.map(([b]) => `${plain(b.title || measureText(b.measure))} : ${plain(blockDesc(b))}`).join(" — "), { size: 20, before: 60, after: 240 }));
        else body.push(wP("", { size: 20, after: 160 }));
      }
    }
    for (const [b, i] of blocks.filter(([b]) => b.type === "cross")) {
      body.push(wP(b.title || measureText(b.measure), { bold: true, size: 20, before: 240, keep: true }));
      if (!b.hideDesc) body.push(wP(blockDesc(b), { size: 20, keep: true }));
      const t = blockTable(b);
      if (!t || t.empty) { body.push(wP("Aucune donnée pour ces conditions.", { size: 20 })); continue; }
      if ((b.view || "both") !== "table" && (b.wordChart || "native") === "native" && b.chart !== "map" && b.chart !== "points") {
        const d = crossData(b, base), spec = chartSpec(b, d, d.rowKeys.slice(0, topOf(b)));
        if (spec.error) body.push(wP(spec.error, { size: 20 }));
        else {
          const n = charts.length + 1, rid = "rIdChart" + n;
          charts.push({ n, rid, xml: chartXml(spec), xlsx: new Uint8Array(await chartWorkbook(spec).arrayBuffer()) });
          body.push(wChart(rid, 100 + n, spec));
        }
      } else if ((b.view || "both") !== "table") {
        const png = await chartToPng(document.querySelector(`[data-card="${i}"]`));
        if (png) {
          const n = media.length + 1, rid = "rIdImg" + n;
          media.push({ name: `word/media/graphique${n}.png`, data: new Uint8Array(await png.blob.arrayBuffer()), rid });
          body.push(wImage(rid, n, png.w, png.h));
        }
      }
      if ((b.view || "both") !== "chart") {
        body.push(wTable(t.head, t.rows, t.total));
        if (t.hidden) body.push(wP(`${t.hidden} autre(s) ligne(s) non reprise(s) (réglage « Lignes affichées »).`, { size: 20, before: 40 }));
      }
    }
    const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';
    const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body.join("")}
      <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Marianne" w:hAnsi="Marianne" w:eastAsia="Marianne" w:cs="Marianne"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="fr-FR"/></w:rPr></w:rPrDefault>
      <w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
      <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;
    const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
      ${media.map(m => `<Relationship Id="${m.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${m.name.replace("word/", "")}"/>`).join("")}
      ${charts.map(c => `<Relationship Id="${c.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="charts/chart${c.n}.xml"/>`).join("")}</Relationships>`;
    const files = [
      { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="xlsx" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"/>
        ${charts.map(c => `<Override PartName="/word/charts/chart${c.n}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`).join("")}
        <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
        <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>` },
      { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>` },
      { name: "word/document.xml", data: doc }, { name: "word/styles.xml", data: styles },
      { name: "word/_rels/document.xml.rels", data: rels }, ...media.map(m => ({ name: m.name, data: m.data })),
      ...charts.flatMap(c => [
        { name: `word/charts/chart${c.n}.xml`, data: c.xml },
        { name: `word/charts/_rels/chart${c.n}.xml.rels`, data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/package" Target="../embeddings/Classeur_graphique${c.n}.xlsx"/></Relationships>` },
        { name: `word/embeddings/Classeur_graphique${c.n}.xlsx`, data: c.xlsx }]),
    ];
    const title = onlyIndex === null ? "Tableau de bord" : (config.blocks[onlyIndex].title || "Bloc");
    triggerDownload(zipStore(files), `${fileSafe(title)}.docx`);
  } catch (e) { showMsg("err", "Export Word impossible : " + (e && e.message ? e.message : e)); }
  finally { if (btn) { btn.disabled = false; btn.textContent = "Exporter en Word"; } }
}

async function downloadPng(b, i) {
  try {
    const png = await chartToPng(document.querySelector(`[data-card="${i}"]`));
    if (!png) { showMsg("warn", "Ce bloc n'affiche pas de graphique : réglez « Affichage » sur « Graphique et tableau »."); return; }
    // type générique : certains navigateurs ignorent le nom de fichier pour une image
    triggerDownload(new Blob([png.blob], { type: "application/octet-stream" }), `${fileSafe(b.title || "graphique")}.png`);
  } catch (e) { showMsg("err", "Image impossible : " + (e && e.message ? e.message : e)); }
}

// =============================================================================
// Filtres rapides (pour les lecteurs, sans passer par « Modifier »)
// =============================================================================
const detailOpen = new Set();                                       // blocs dont la liste « Colonnes du détail » est dépliée
RACINE.addEventListener("toggle", e => { const id = e.target.dataset && e.target.dataset.detailbox; if (id) e.target.open ? detailOpen.add(id) : detailOpen.delete(id); }, true);
let quick = {};            // colonne -> { kind: "values", values: [...] } | { kind: "date", preset, from, to }
const DATE_PRESETS = [["all", "Toute la période"], ["today", "Aujourd'hui"], ["yesterday", "Hier"], ["7d", "7 derniers jours"],
  ["30d", "30 derniers jours"], ["month", "Ce mois-ci"], ["custom", "Période personnalisée"]];

function dayKey(offset = 0) {
  const d = new Date(); d.setDate(d.getDate() + offset); const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function quickRange(q) {
  switch (q.preset) {
    case "today": return [dayKey(), dayKey()];
    case "yesterday": return [dayKey(-1), dayKey(-1)];
    case "7d": return [dayKey(-6), dayKey()];
    case "30d": return [dayKey(-29), dayKey()];
    case "month": return [dayKey().slice(0, 8) + "01", dayKey()];
    case "custom": return [q.from || "0000-01-01", q.to || "9999-12-31"];
    default: return null;
  }
}
function quickPass(r, except) {
  for (const col in quick) {
    if (col === except || colMissing(col)) continue;
    const q = quick[col];
    if (q.kind === "date") {
      const rg = quickRange(q); if (!rg) continue;
      const d = dayOf(col, r[col]); if (!d || d < rg[0] || d > rg[1]) return false;
    } else {
      const set = q._set || (q._set = new Set(q.values));
      if (!keysOf(col, r[col]).some(k => set.has(k))) return false;
    }
  }
  return true;
}
function quickLabel(col) {
  const q = quick[col];
  if (!q) return isDate(col) ? "Toute la période" : "Toutes";
  if (q.kind === "date") {
    if (q.preset !== "custom") return (DATE_PRESETS.find(p => p[0] === q.preset) || ["", ""])[1];
    const f = k => k ? dateLabel(k, "jour") : "…";
    return `du ${f(q.from)} au ${f(q.to)}`;
  }
  if (!q.values.length) return "aucune valeur";
  return plain(keyLabel(col, q.values[0])) + (q.values.length > 1 ? ` +${q.values.length - 1}` : "");
}
function quickText() {
  return Object.keys(quick).map(col => {
    const q = quick[col];
    const v = q.kind === "values" ? q.values.map(k => plain(keyLabel(col, k))).join(", ") : quickLabel(col);
    return `${plain(labelOf(col))} : ${v}`;
  }).join(" ; ");
}
const quickCols = () => [...new Set([...(config.quickFilters || []).filter(c => columns.some(k => k.id === c)), ...Object.keys(quick)])];

function renderQuickBar() {
  const cols = quickCols(), bar = $("quickBar");
  if (!cols.length) { bar.innerHTML = ""; return; }
  bar.innerHTML = `<span class="sub">Filtrer :</span>` + cols.map(col => `<button class="qchip${quick[col] ? " on" : ""}" data-qf="${esc(col)}" aria-haspopup="dialog">
      ${esc(plain(labelOf(col)))} : <b>${esc(quickLabel(col))}</b> ▾</button>`).join("") +
    (Object.keys(quick).length ? `<button class="ghost" id="quickReset">Réinitialiser</button>` : "");
}

function setQuickValues(col, values, all) {
  if (values.length === all.length) delete quick[col];
  else quick[col] = { kind: "values", values };
  render();
}

function openQuick(col, anchor) {
  const pop = $("qpop"), r = anchor.getBoundingClientRect();
  pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 330)) + "px";
  pop.style.top = (r.bottom + 6) + "px";
  pop.dataset.col = col;
  if (isDate(col)) {
    const q = quick[col] || { kind: "date", preset: "all" };
    pop.innerHTML = `<div class="qhead"><b>${esc(plain(labelOf(col)))}</b></div>
      ${DATE_PRESETS.map(([k, l]) => `<label class="qopt"><input type="radio" name="qpreset" value="${k}" ${q.preset === k ? "checked" : ""}> ${esc(l)}</label>`).join("")}
      <div class="qrow">du <input type="date" id="qfrom" value="${esc(q.from || "")}"> au <input type="date" id="qto" value="${esc(q.to || "")}"></div>
      <div class="qrow"><button class="primary" id="qapply">Appliquer</button><button id="qclose">Fermer</button></div>`;
  } else {
    const counts = new Map();
    baseRows(col).forEach(r => keysOf(col, r[col]).forEach(k => counts.set(k, (counts.get(k) || 0) + 1)));
    (quick[col] ? quick[col].values : []).forEach(k => { if (!counts.has(k)) counts.set(k, 0); });
    const all = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr"));
    pop._all = all.map(e => e[0]);
    const sel = quick[col] ? new Set(quick[col].values) : null;
    pop.innerHTML = `<div class="qhead"><b>${esc(plain(labelOf(col)))}</b></div>
      <input type="text" id="qsearch" placeholder="Rechercher…" aria-label="Rechercher une valeur">
      <div class="qrow"><button id="qall">Tout</button><button id="qnone">Aucune</button><button id="qclose">Fermer</button></div>
      <div class="qlist">${all.map(([k, n]) => `<label class="qopt" data-txt="${esc(norm(plain(keyLabel(col, k))))}"><input type="checkbox" data-qv="${esc(k)}" ${!sel || sel.has(k) ? "checked" : ""}>
        <span>${rich(keyLabel(col, k))}</span> <span class="c">${n}</span></label>`).join("") || `<span class="hint">Aucune valeur</span>`}</div>`;
  }
  pop.hidden = false;
  const first = pop.querySelector("#qsearch, input[type=radio]:checked"); if (first) first.focus();
}
function closeQuick() { $("qpop").hidden = true; }

RACINE.addEventListener("click", e => {
  const chip = e.target.closest("[data-qf]");
  if (chip) { const col = chip.dataset.qf; if (!$("qpop").hidden && $("qpop").dataset.col === col) closeQuick(); else openQuick(col, chip); return; }
  if (e.target.id === "quickReset") { quick = {}; closeQuick(); render(); return; }
  const pop = $("qpop");
  if (!pop.hidden && !e.target.closest("#qpop")) { closeQuick(); return; }
  if (!e.target.closest("#qpop")) return;
  const col = pop.dataset.col;
  if (e.target.id === "qclose") closeQuick();
  else if (e.target.id === "qall") { pop.querySelectorAll("input[data-qv]").forEach(i => i.checked = true); setQuickValues(col, pop._all, pop._all); }
  else if (e.target.id === "qnone") { pop.querySelectorAll("input[data-qv]").forEach(i => i.checked = false); setQuickValues(col, [], pop._all); }
  else if (e.target.id === "qapply") {
    const preset = (pop.querySelector("input[name=qpreset]:checked") || {}).value || "all";
    const from = $("qfrom").value, to = $("qto").value;
    if (preset === "all") delete quick[col];
    else quick[col] = { kind: "date", preset: (from || to) && preset === "custom" ? "custom" : preset, from, to };
    closeQuick(); render();
  }
});
RACINE.addEventListener("change", e => {
  if (e.target.closest && e.target.closest("#qpop")) {
    const pop = $("qpop"), col = pop.dataset.col;
    if (e.target.dataset.qv !== undefined) {
      const values = [...pop.querySelectorAll("input[data-qv]")].filter(i => i.checked).map(i => i.dataset.qv);
      setQuickValues(col, values, pop._all);
    } else if (e.target.id === "qfrom" || e.target.id === "qto") {
      const c = pop.querySelector('input[name=qpreset][value="custom"]'); if (c) c.checked = true;
    }
  }
});
RACINE.addEventListener("input", e => {
  if (e.target.id !== "qsearch") return;
  const q = norm(e.target.value);
  $("qpop").querySelectorAll(".qopt").forEach(l => l.style.display = !q || l.dataset.txt.includes(q) ? "" : "none");
});

// =============================================================================
// Clic sur un chiffre, une barre, une part ou une case : détail des lignes
// =============================================================================
const drillAttr = (i, rk, ck) => ` data-drill="${esc(JSON.stringify([i, rk ?? null, ck ?? null]))}"`;
const drillCell = (i, rk, ck) => drillAttr(i, rk, ck) + ` tabindex="0" role="button" aria-label="Voir le détail"`;
let drillState = null;     // { i, rk, ck, rows, sortCol, sortDir }

function isoWeekStart(key) {                                       // "2026-S40" -> lundi de la semaine
  const [y, w] = key.split("-S").map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4)), mon = new Date(jan4);
  mon.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + (w - 1) * 7);
  return mon;
}
function keyRange(key, grain) {
  if (grain === "mois") return [key + "-01", key + "-31"];
  if (grain === "annee") return [key + "-01-01", key + "-12-31"];
  if (grain === "semaine") { const a = isoWeekStart(key), b = new Date(a); b.setUTCDate(a.getUTCDate() + 6); return [a.toISOString().slice(0, 10), b.toISOString().slice(0, 10)]; }
  return [key, key];
}

function drillRows(i, rk, ck) {
  const b = config.blocks[i], base = baseRows(), rows = base.filter(r => passAll(r, b.conds, b.logic));
  if (b.type === "tile" || (rk === null && ck === null)) return rows;
  const d = crossData(b, base);
  const othersCols = new Set(d.colKeys.filter(k => d.colorOf.get(k) === "var(--other)"));
  const restRows = new Set(d.rowKeys.filter(k => (d.rowVal.get(k) || 0) > 0).slice(PIE_MAX));
  return rows.filter(r => {
    if (rk !== null) { const ks = keysOf(d.rc, r[d.rc], d.rg); if (rk === "__autres" ? !ks.some(k => restRows.has(k)) : !ks.includes(rk)) return false; }
    if (ck !== null && d.cc) { const ks = keysOf(d.cc, r[d.cc], d.cg); if (ck === "__autres" ? !ks.some(k => othersCols.has(k)) : !ks.includes(ck)) return false; }
    return true;
  });
}

function detailColumns(b) {
  const exist = id => columns.some(c => c.id === id);
  if (b.detailCols && b.detailCols.filter(exist).length) return b.detailCols.filter(exist);
  const avgLen = id => { let n = 0, s = 0; for (const r of records.slice(0, 200)) { const t = textOf(r[id]); if (t) { n++; s += t.length; } } return n ? s / n : 0; };
  const pref = [b.rows && b.rows.col, b.cols && b.cols.col, b.measure && b.measure.col].filter(Boolean);
  const ids = [...new Set([...pref, ...columns.map(c => c.id)])].filter(id => exist(id) && (pref.includes(id) || avgLen(id) <= 80));
  return ids.slice(0, 7);
}
const cellText = (col, v) => isDate(col) ? (() => { const d = toJsDate(v); if (!d) return ""; const day = dayOf(col, v);
  return typeOf(col).startsWith("DateTime") ? `${dateLabel(day, "jour")} ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: (typeOf(col).split(":")[1]) || undefined })}` : dateLabel(day, "jour"); })()
  : Array.isArray(v) ? keysOf(col, v).filter(k => k !== EMPTY).join(", ") : (textOf(v) ?? "");

function openDrill(i, rk, ck) {
  if (isCover(config.blocks[i])) {
    const b = config.blocks[i], c = coverInfo(baseRows().filter(r => passAll(r, b.conds, b.logic)), b.measure);
    if (!c.ok) return;
    drillState = { i, rk, ck, cover: c, rows: [], sortCol: null, sortDir: 1 };
    renderDrill(); $("drill").hidden = false;
    const btn = $("drill").querySelector("#drillClose"); if (btn) btn.focus();
    return;
  }
  drillState = { i, rk, ck, rows: drillRows(i, rk, ck), sortCol: null, sortDir: 1 };
  renderDrill();
  $("drill").hidden = false;
  const btn = $("drill").querySelector("#drillClose"); if (btn) btn.focus();
}
function closeDrill() { $("drill").hidden = true; drillState = null; if (lastDrillFocus) try { lastDrillFocus.focus(); } catch (e) { } }
let lastDrillFocus = null;

function renderCoverDrill(s, b) {
  const c = s.cover, byLabel = (a, z) => a.label.localeCompare(z.label, "fr", { numeric: true });
  const list = (items, n) => items.length ? `<div class="chips">${items.slice().sort(byLabel).map(x => `<span class="chip">${rich(x.label)}${n ? ` <span class="hint">${x.n}</span>` : ""}</span>`).join("")}</div>` : `<p class="hint">Aucune.</p>`;
  $("drill").innerHTML = `<div class="drill-panel" role="dialog" aria-modal="true" aria-labelledby="drillTitle">
    <div class="card-head"><div class="t"><h2 id="drillTitle">${rich(b.title || measureText(b.measure))}</h2>
      <div class="desc">${c.present.length} sur ${c.total} (${fmtPct(c.total ? c.present.length / c.total * 100 : NaN)}) · liste « ${esc(b.measure.ref.col)} » de la table ${esc(b.measure.ref.table)}</div></div>
      <button class="ghost" id="drillClose" aria-label="Fermer le détail">✕</button></div>
    <div class="bar" style="margin:8px 0"><button id="drillCsv">Télécharger en CSV</button></div>
    <div style="max-height:62vh;overflow:auto">
      <h3 class="lbl" style="margin:8px 0 4px">Sans réponse (${c.missing.length})</h3>${list(c.missing, false)}
      <h3 class="lbl" style="margin:12px 0 4px">Ont répondu (${c.present.length}) <span class="hint">· nombre de lignes</span></h3>${list(c.present, true)}
      ${c.outside.length ? `<h3 class="lbl" style="margin:12px 0 4px">Hors liste (${c.outside.length}) <span class="hint">· valeurs des réponses absentes de la liste : faute de frappe ou liste incomplète ?</span></h3>${list(c.outside, true)}` : ""}
    </div></div>`;
}
function renderDrill() {
  const s = drillState; if (!s) return;
  const b = config.blocks[s.i];
  if (s.cover) return renderCoverDrill(s, b);
  const cols = detailColumns(b);
  const parts = [];
  if (b.type === "cross") {
    if (s.rk !== null) parts.push(s.rk === "__autres" ? "Autres" : keyLabel(b.rows.col, s.rk, b.rows.grain));
    if (s.ck !== null && b.cols && b.cols.col) parts.push(s.ck === "__autres" ? "Autres" : keyLabel(b.cols.col, s.ck, b.cols.grain));
  }
  let rows = s.rows.slice();
  if (s.sortCol) {
    const c = s.sortCol, num = isNumCol(c);
    rows.sort((a, z) => {
      const va = isDate(c) ? (toJsDate(a[c]) || 0) - 0 : num ? numOf(a[c]) : plain(cellText(c, a[c]));
      const vz = isDate(c) ? (toJsDate(z[c]) || 0) - 0 : num ? numOf(z[c]) : plain(cellText(c, z[c]));
      return (typeof va === "number" ? (isNaN(va) ? -Infinity : va) - (isNaN(vz) ? -Infinity : vz) : String(va).localeCompare(String(vz), "fr", { numeric: true })) * s.sortDir;
    });
  }
  const LIMIT = 300, shown = rows.slice(0, LIMIT);
  const canFilter = b.type === "cross" && !GEO_T[b.rows.grain] && (s.rk !== null && s.rk !== "__autres" || (s.ck !== null && s.ck !== "__autres"));
  const canSelect = window.grist && typeof grist.setSelectedRows === "function" && isMainSrc(b);
  $("drill").innerHTML = `<div class="drill-panel" role="dialog" aria-modal="true" aria-labelledby="drillTitle">
    <div class="card-head"><div class="t"><h2 id="drillTitle">Détail · ${rich(b.title || measureText(b.measure))}</h2>
      <div class="desc">${parts.length ? rich(parts.join(" · ")) + " · " : ""}${s.rows.length} ligne${s.rows.length > 1 ? "s" : ""}</div></div>
      <button class="ghost" id="drillClose" aria-label="Fermer le détail">✕</button></div>
    <div class="bar" style="margin:8px 0">
      ${canFilter ? `<button class="primary" id="drillFilter">Filtrer le tableau de bord sur cette sélection</button>` : ""}
      ${canSelect ? `<button id="drillSelect" title="Sélectionne ces lignes dans les vues Grist liées à ce widget">Sélectionner dans Grist</button>` : ""}
      <button id="drillCsv">Télécharger en CSV</button>
    </div>
    <div class="tbl-wrap" style="max-height:60vh"><table><thead><tr>${cols.map(c => `<th><button class="ghost sort" data-sort="${esc(c)}" title="Trier">${rich(labelOf(c))}${s.sortCol === c ? (s.sortDir > 0 ? " ▲" : " ▼") : ""}</button></th>`).join("")}</tr></thead>
    <tbody>${shown.map(r => `<tr>${cols.map(c => `<td style="text-align:left;white-space:normal">${rich(cellText(c, r[c]))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
    ${rows.length > LIMIT ? `<p class="hint">Affichage limité aux ${LIMIT} premières lignes : téléchargez le CSV pour avoir les ${rows.length}.</p>` : ""}
    <p class="hint">Colonnes affichées : réglables dans les paramètres de ce bloc (« Modifier le tableau de bord » → Colonnes du détail).</p>
  </div>`;
}

function drillCsv() {
  const s = drillState; if (!s) return;
  if (s.cover) { downloadCsv(config.blocks[s.i]); return; }
  const b = config.blocks[s.i], cols = detailColumns(b);
  const q = v => { const t = v == null ? "" : String(v); return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const lines = [cols.map(c => q(plain(labelOf(c)))).join(";"), ...s.rows.map(r => cols.map(c => q(plain(cellText(c, r[c])))).join(";"))];
  triggerDownload(new Blob(["﻿" + lines.join("\r\n") + "\r\n"], { type: "application/octet-stream" }), `detail ${fileSafe(b.title || "bloc")}.csv`);
}

function drillFilter() {
  const s = drillState; if (!s) return;
  const b = config.blocks[s.i];
  const apply = (col, key, grain) => {
    if (!col || key === null || key === "__autres" || GEO_T[grain]) return;
    if (isDate(col)) { const [from, to] = keyRange(key, grain || "jour"); quick[col] = { kind: "date", preset: "custom", from, to }; }
    else quick[col] = { kind: "values", values: [key] };
  };
  apply(b.rows.col, s.rk, b.rows.grain);
  if (b.cols && b.cols.col) apply(b.cols.col, s.ck, b.cols.grain);
  closeDrill(); render();
}

RACINE.addEventListener("click", e => {
  if (editing) return;
  const dp = e.target.closest("#drill");
  if (dp) {
    if (e.target === dp || e.target.closest("#drillClose")) closeDrill();
    else if (e.target.closest("#drillFilter")) drillFilter();
    else if (e.target.closest("#drillCsv")) drillCsv();
    else if (e.target.closest("#drillSelect")) { try { grist.setSelectedRows(drillState.rows.map(r => r.id)); showMsg("ok", `${drillState.rows.length} ligne(s) sélectionnée(s) dans les vues Grist liées à ce widget.`); } catch (err) { showMsg("warn", "Sélection impossible : " + err.message); } closeDrill(); }
    else { const sb = e.target.closest("[data-sort]"); if (sb) { const c = sb.dataset.sort; drillState.sortDir = drillState.sortCol === c ? -drillState.sortDir : 1; drillState.sortCol = c; renderDrill(); } }
    return;
  }
  const t = e.target.closest("[data-drill]"); if (!t || e.target.closest("button")) return;
  lastDrillFocus = t;
  const [i, rk, ck] = JSON.parse(t.getAttribute("data-drill"));
  openDrill(i, rk, ck);
});
RACINE.addEventListener("keydown", e => {
  if (e.key === "Escape") { if (!$("drill").hidden) closeDrill(); else if (!$("qpop").hidden) closeQuick(); return; }
  if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("[data-drill]")) {
    e.preventDefault(); lastDrillFocus = e.target;
    const [i, rk, ck] = JSON.parse(e.target.getAttribute("data-drill")); openDrill(i, rk, ck);
  }
});

// ---- Fonctions de bloc exécutées dans la table source du bloc
{
  const withB = f => (b, ...a) => inSrc(b, () => f(b, ...a));
  const withBase = f => (b, x, base) => inSrc(b, () => f(b, x, isMainSrc(b) ? base : undefined));   // (b, i, base)
  const withBase2 = f => (b, base) => inSrc(b, () => f(b, isMainSrc(b) && base ? base : baseRows()));
  const withI = f => (i, ...a) => inSrc(config.blocks[i], () => f(i, ...a));
  const withDrill = f => (...a) => inSrc(drillState && config.blocks[drillState.i], () => f(...a));
  const _rt = renderTile, _rc = renderCross;
  renderTile = (b, i, base) => inSrc(b, () => _rt(b, i, isMainSrc(b) ? base : baseRows()));
  renderCross = (b, i, base) => inSrc(b, () => _rc(b, i, isMainSrc(b) ? base : baseRows()));
  crossData = withBase2(crossData); tileNumbers = withBase2(tileNumbers);
  tileValue = withB(tileValue); blockTable = withB(blockTable); tableHtml = withB(tableHtml); downloadCsv = withB(downloadCsv);
  blockDesc = withB(blockDesc); blockEditor = withB(blockEditor); chartSpec = withB(chartSpec); renderChart = withB(renderChart);
  openDrill = withI(openDrill); drillRows = withI(drillRows);
  renderDrill = withDrill(renderDrill); drillCsv = withDrill(drillCsv);
  const _df = drillFilter; drillFilter = () => { inSrc(drillState && config.blocks[drillState.i], () => { const keep = render; render = () => {}; try { _df(); } finally { render = keep; } }); render(); };
  const _render = render; render = () => inSrc(null, _render);
}
// autres tables : relues au retour sur l'onglet et toutes les 2 minutes (hors mode modification)
function refreshSources() {
  if (editing || document.hidden || !config.blocks.some(b => !isMainSrc(b))) return;
  refCache.forEach(c => c.stale = true); ensureRefs();
}
setInterval(refreshSources, 120000);
setInterval(() => { if (!editing && !document.hidden && $("drill").hidden && $("qpop").hidden && hasRelConds()) render(); }, 60000);
document.addEventListener("visibilitychange", refreshSources);

// =============================================================================
// Branchement Grist
// =============================================================================
async function loadMeta() {
  try {
    const tableId = CTX.table;
    if (!tableId || !grist.docApi) return null;
    const T = await grist.docApi.fetchTable("_grist_Tables");
    const ref = T.id[T.tableId.indexOf(tableId)];
    const C = await grist.docApi.fetchTable("_grist_Tables_column");
    docMeta = { T, C }; mainTable = tableId;
    const types = {}, labels = {}, order = [];
    C.id.forEach((_, i) => {
      if (C.parentId[i] !== ref) return;
      const id = C.colId[i]; if (id === "manualSort" || id.startsWith("gristHelper_")) return;
      types[id] = C.type[i]; labels[id] = (C.label && C.label[i]) || id; order.push(id);
    });
    colTypes = types; colLabels = labels;
    return { tableId, order };
  } catch (e) { diagError = e && e.message ? e.message : String(e); return null; }
}

function buildColumns(order) {
  const seen = new Set(), ids = [];
  (order || []).forEach(id => { if (!seen.has(id)) { seen.add(id); ids.push(id); } });
  records.forEach(r => Object.keys(r).forEach(k => { if (k !== "id" && k !== "manualSort" && !k.startsWith("gristHelper_") && !seen.has(k)) { seen.add(k); ids.push(k); } }));
  // on ne garde que les colonnes présentes dans les lignes reçues
  const present = new Set(); records.forEach(r => Object.keys(r).forEach(k => present.add(k)));
  columns = ids.filter(id => present.has(id) || !records.length).map(id => ({ id, label: labelOf(id), type: typeOf(id) }));
  columnIds = new Set(columns.map(c => c.id));
}

// ---------- Démarrage (v2) : la page hôte fournit les lignes et la configuration ----------
accessLevel = "full";
CTX.abonner(async rows => {
  records = rows || [];
  const meta = await loadMeta();
  diagSource = CTX.mode === "edition" ? "table " + CTX.table : "widget";
  kindCache = new Map();
  refCache.forEach(c => c.stale = true);
  buildColumns(meta && meta.order);
  if (!configLoaded) {
    const c = CTX.configuration && CTX.configuration();
    if (c && Array.isArray(c.blocks)) { config = JSON.parse(JSON.stringify(c)); configLoaded = true; }
    else if (!config.blocks.length) { config = defaultConfig(); if (CTX.mode === "edition") saveConfig(); }
  }
  render();
});
return {
  remplacer(c) { config = JSON.parse(JSON.stringify(c)); configLoaded = true; render(); },
  configuration: () => config,
};

  }
  window.TableauDeBord = { monter };
})();
