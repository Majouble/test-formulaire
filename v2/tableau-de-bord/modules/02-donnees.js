/* PRISME — tableau de bord, module 02/15 : Données : colonnes, types et valeurs, dates.
   État posé sur tableauDeBord : records, columns, colTypes, colLabels, columnIds, accessLevel, diagSource, diagError,
     kindCache.
   Publie sur tableauDeBord : toJsDate, dayOf, minuteOf, dateLabel, textOf, keysOf, choixGrist, rangColonne,
     valeursColonnes, keyLabel, typeOf, isDate, isNumCol, isBool, labelOf, hasTime, DATE_PRECS.
   Utilise (tableauDeBord.) : EMPTY, GEO_T, docMeta, geoT, isMainSrc, mainTable, nf.
   tableauDeBord et l'ordre des modules : voir tableau-de-bord/tableau.js. */

TableauDeBord.modules["donnees"] = function (tableauDeBord) {
  const { DEP_NAMES } = window.Geo;
  // fonctions de ce module utilisées ailleurs : disponibles dès maintenant (déclarations remontées)
  Object.assign(tableauDeBord, {
    toJsDate,
    dayOf,
    minuteOf,
    dateLabel,
    textOf,
    keysOf,
    choixGrist,
    rangColonne,
    valeursColonnes,
    keyLabel,
  });
  // =============================================================================
  // Données : colonnes, types et valeurs
  // =============================================================================
  tableauDeBord.records = []; // lignes de la table (toutes colonnes)
  tableauDeBord.columns = []; // [{ id, label, type }]
  tableauDeBord.colTypes = {};
  tableauDeBord.colLabels = {};
  tableauDeBord.columnIds = new Set(); // colonnes de la table en cours (table du widget ou source du bloc)
  tableauDeBord.accessLevel = null;
  tableauDeBord.diagSource = "-";
  tableauDeBord.diagError = "";

  const typeOf = (col) => tableauDeBord.colTypes[col] || "";
  tableauDeBord.kindCache = new Map(); // vidé à chaque arrivée de données
  function kindOf(col) {
    if (tableauDeBord.kindCache.has(col)) return tableauDeBord.kindCache.get(col);
    const t = typeOf(col);
    let k = "text";
    if (/^Date/.test(t) || (!t && tableauDeBord.records.some((r) => r[col] instanceof Date))) k = "date";
    else if (
      t === "Bool" ||
      (!t &&
        tableauDeBord.records.some((r) => typeof r[col] === "boolean") &&
        tableauDeBord.records.every((r) => r[col] == null || typeof r[col] === "boolean"))
    )
      k = "bool";
    else if (
      /^(Numeric|Int)$/.test(t) ||
      (!t &&
        tableauDeBord.records.length &&
        tableauDeBord.records.every((r) => r[col] == null || r[col] === "" || typeof r[col] === "number"))
    )
      k = "num";
    tableauDeBord.kindCache.set(col, k);
    return k;
  }
  const isDate = (col) => kindOf(col) === "date";
  const isNumCol = (col) => kindOf(col) === "num";
  const isBool = (col) => kindOf(col) === "bool";
  const labelOf = (col) => tableauDeBord.colLabels[col] || col;

  function toJsDate(v) {
    if (v === null || v === undefined || v === "") return null;
    if (v instanceof Date) return isNaN(v) ? null : v;
    if (typeof v === "number") return new Date(v * 1000); // Grist stocke les dates en secondes
    if (Array.isArray(v) && (v[0] === "D" || v[0] === "d")) return new Date(v[1] * 1000);
    if (typeof v === "object" && typeof v.toISOString === "function") return new Date(v.toISOString());
    const d = new Date(v);
    return isNaN(d) ? null : d;
  }

  function dayOf(col, v) {
    // "AAAA-MM-JJ" : jour de Grist pour une colonne Date, jour de Paris pour une date-heure
    const d = toJsDate(v);
    if (!d) return null;
    const t = typeOf(col);
    if (t === "Date") return d.toISOString().slice(0, 10);
    const tz = Outils.dates.FUSEAU; // date-heure : jour de Paris, quel que soit le fuseau de la colonne ou du poste
    try {
      const o = {};
      new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
        .formatToParts(d)
        .forEach((p) => (o[p.type] = p.value));
      return `${o.year}-${o.month}-${o.day}`;
    } catch (e) {
      return d.toISOString().slice(0, 10);
    }
  }

  function minuteOf(col, v) {
    // "AAAA-MM-JJTHH:MM" à l'heure de Paris
    const d = toJsDate(v);
    if (!d) return null;
    const t = typeOf(col),
      tz = Outils.dates.FUSEAU;
    if (t === "Date") return d.toISOString().slice(0, 10) + "T00:00";
    try {
      const o = {};
      new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
        .formatToParts(d)
        .forEach((p) => (o[p.type] = p.value));
      return `${o.year}-${o.month}-${o.day}T${o.hour === "24" ? "00" : o.hour}:${o.minute}`;
    } catch (e) {
      return d.toISOString().slice(0, 16);
    }
  }
  const hasTime = (col) =>
    typeOf(col).startsWith("DateTime") || (!typeOf(col) && tableauDeBord.records.some((r) => r[col] instanceof Date));
  const DATE_PRECS = [
    ["day", "jour"],
    ["datetime", "date et heure"],
    ["time", "heure seule"],
  ];

  function isoWeek(day) {
    // "2026-S40"
    const d = new Date(day + "T00:00:00Z");
    const n = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - n + 3);
    const y = d.getUTCFullYear(),
      first = new Date(Date.UTC(y, 0, 4));
    const w = 1 + Math.round(((d - first) / 864e5 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
    return `${y}-S${String(w).padStart(2, "0")}`;
  }
  const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  function dateKey(col, v, grain) {
    const day = dayOf(col, v);
    if (!day) return tableauDeBord.EMPTY;
    if (grain === "semaine") return isoWeek(day);
    if (grain === "mois") return day.slice(0, 7);
    if (grain === "annee") return day.slice(0, 4);
    return day;
  }
  function dateLabel(key, grain) {
    if (key === tableauDeBord.EMPTY) return key;
    if (grain === "semaine") {
      const [y, w] = key.split("-S");
      return `Semaine ${Number(w)} (${y})`;
    }
    if (grain === "mois") return `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
    if (grain === "annee") return key;
    return `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}`;
  }

  function textOf(v) {
    // valeur affichable d'une cellule non-date
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "boolean") return v ? "Oui" : "Non";
    if (typeof v === "number") return tableauDeBord.nf.format(v);
    if (v && typeof v === "object") {
      if (v.constructor && v.constructor.name === "Reference") return String(v.rowId);
      return JSON.stringify(v);
    }
    return String(v);
  }

  // Clés de regroupement d'une cellule (une liste de choix donne plusieurs clés)
  function keysOf(col, v, grain) {
    if (isDate(col)) return [dateKey(col, v, grain || "jour")];
    const tf = tableauDeBord.GEO_T[grain];
    if (Array.isArray(v)) {
      const a = v[0] === "L" ? v.slice(1) : v;
      return a.length
        ? a.map((x) => (tf ? tableauDeBord.geoT(tf, textOf(x)) : (textOf(x) ?? tableauDeBord.EMPTY)))
        : [tableauDeBord.EMPTY];
    }
    const t = textOf(v);
    return [t === null ? tableauDeBord.EMPTY : tf ? tableauDeBord.geoT(tf, t) : t];
  }
  // Choix d'une colonne Choice / ChoiceList, dans l'ordre réglé dans Grist (table du bloc)
  function choixGrist(table, col) {
    if (!tableauDeBord.docMeta || !table || !col) return [];
    const { T, C } = tableauDeBord.docMeta,
      ref = T.id[T.tableId.indexOf(table)];
    for (let i = 0; i < C.id.length; i++)
      if (C.parentId[i] === ref && C.colId[i] === col) {
        try {
          const ch = JSON.parse(C.widgetOptions[i] || "{}").choices;
          return Array.isArray(ch) ? ch.map(String) : [];
        } catch (e) {
          return [];
        }
      }
    return [];
  }
  // Ordre des colonnes d'un tableau croisé : « manual » (ordre choisi, b.colOrder) ou « choices » (ordre des choix dans Grist) ;
  // les valeurs absentes de la liste suivent, par valeur décroissante ; « (vide) » toujours en dernier
  function rangColonne(b) {
    const liste =
      b.colSort === "manual"
        ? valeursColonnes(b)
        : b.colSort === "choices"
          ? choixGrist(tableauDeBord.isMainSrc(b) ? tableauDeBord.mainTable : b.source, b.cols && b.cols.col)
          : null;
    if (!liste) return null;
    const pos = new Map(liste.map((k, j) => [k, j]));
    return (k) => (k === tableauDeBord.EMPTY ? 1e9 : pos.has(k) ? pos.get(k) : 1e6);
  }
  // Valeurs possibles des colonnes d'un bloc (pour régler leur ordre) : ordre déjà choisi, puis choix de Grist, puis valeurs des lignes
  function valeursColonnes(b) {
    const cc = b.cols && b.cols.col;
    if (!cc) return [];
    const vues = new Map();
    tableauDeBord.records.forEach((r) =>
      keysOf(cc, r[cc], b.cols.grain).forEach((k) => vues.set(k, (vues.get(k) || 0) + 1)),
    );
    const choix = choixGrist(tableauDeBord.isMainSrc(b) ? tableauDeBord.mainTable : b.source, cc);
    const reste = [...vues.keys()]
      .filter((k) => !choix.includes(k))
      .sort(
        (a, c) =>
          (a === tableauDeBord.EMPTY) - (c === tableauDeBord.EMPTY) ||
          vues.get(c) - vues.get(a) ||
          a.localeCompare(c, "fr"),
      );
    const tout = [...choix, ...reste];
    const ordre = (b.colOrder || []).filter((k) => tout.includes(k));
    return [...ordre, ...tout.filter((k) => !ordre.includes(k))];
  }
  function keyLabel(col, key, grain) {
    if (isDate(col)) return dateLabel(key, grain || "jour");
    if (grain === "dep_uai" && DEP_NAMES[key]) return `${key} · ${DEP_NAMES[key]}`;
    return key;
  }
  // constantes de ce module utilisées ailleurs
  Object.assign(tableauDeBord, { typeOf, isDate, isNumCol, isBool, labelOf, hasTime, DATE_PRECS });
};
