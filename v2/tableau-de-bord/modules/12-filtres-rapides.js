/* PRISME — tableau de bord, module 12/15 : Filtres rapides des lecteurs.
   État posé sur tableauDeBord : quick.
   Publie sur tableauDeBord : quickPass, quickText, renderQuickBar, closeQuick, detailOpen.
   Utilise (tableauDeBord.) : baseRows, colMissing, columns, config, dateLabel, dayOf, isDate, keyLabel, keysOf, labelOf,
     norm, plain, racine, render, rich.
   tableauDeBord et l'ordre des modules : voir tableau-de-bord/tableau.js. */

TableauDeBord.modules["filtres-rapides"] = function (tableauDeBord) {
  const { esc, $ } = Outils;
  // fonctions de ce module utilisées ailleurs : disponibles dès maintenant (déclarations remontées)
  Object.assign(tableauDeBord, { quickPass, quickText, renderQuickBar, closeQuick });
  // =============================================================================
  // Filtres rapides (pour les lecteurs, sans passer par « Modifier »)
  // =============================================================================
  const detailOpen = new Set(); // blocs dont la liste « Colonnes du détail » est dépliée
  tableauDeBord.racine.addEventListener(
    "toggle",
    (e) => {
      const id = e.target.dataset && e.target.dataset.detailbox;
      if (id) e.target.open ? detailOpen.add(id) : detailOpen.delete(id);
    },
    true,
  );
  tableauDeBord.quick = {}; // colonne -> { kind: "values", values: [...] } | { kind: "date", preset, from, to }
  const DATE_PRESETS = [
    ["all", "Toute la période"],
    ["today", "Aujourd'hui"],
    ["yesterday", "Hier"],
    ["7d", "7 derniers jours"],
    ["30d", "30 derniers jours"],
    ["month", "Ce mois-ci"],
    ["custom", "Période personnalisée"],
  ];

  function dayKey(offset = 0) {
    // jour de Paris, décalé de offset jours (calcul sur le calendrier, sans heure)
    const d = new Date(Outils.dates.aujourdhui() + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  }
  function quickRange(q) {
    switch (q.preset) {
      case "today":
        return [dayKey(), dayKey()];
      case "yesterday":
        return [dayKey(-1), dayKey(-1)];
      case "7d":
        return [dayKey(-6), dayKey()];
      case "30d":
        return [dayKey(-29), dayKey()];
      case "month":
        return [dayKey().slice(0, 8) + "01", dayKey()];
      case "custom":
        return [q.from || "0000-01-01", q.to || "9999-12-31"];
      default:
        return null;
    }
  }
  function quickPass(r, except) {
    for (const col in tableauDeBord.quick) {
      if (col === except || tableauDeBord.colMissing(col)) continue;
      const q = tableauDeBord.quick[col];
      if (q.kind === "date") {
        const rg = quickRange(q);
        if (!rg) continue;
        const d = tableauDeBord.dayOf(col, r[col]);
        if (!d || d < rg[0] || d > rg[1]) return false;
      } else {
        const set = q._set || (q._set = new Set(q.values));
        if (!tableauDeBord.keysOf(col, r[col]).some((k) => set.has(k))) return false;
      }
    }
    return true;
  }
  function quickLabel(col) {
    const q = tableauDeBord.quick[col];
    if (!q) return tableauDeBord.isDate(col) ? "Toute la période" : "Toutes";
    if (q.kind === "date") {
      if (q.preset !== "custom") return (DATE_PRESETS.find((p) => p[0] === q.preset) || ["", ""])[1];
      const f = (k) => (k ? tableauDeBord.dateLabel(k, "jour") : "…");
      return `du ${f(q.from)} au ${f(q.to)}`;
    }
    if (!q.values.length) return "aucune valeur";
    return (
      tableauDeBord.plain(tableauDeBord.keyLabel(col, q.values[0])) +
      (q.values.length > 1 ? ` +${q.values.length - 1}` : "")
    );
  }
  function quickText() {
    return Object.keys(tableauDeBord.quick)
      .map((col) => {
        const q = tableauDeBord.quick[col];
        const v =
          q.kind === "values"
            ? q.values.map((k) => tableauDeBord.plain(tableauDeBord.keyLabel(col, k))).join(", ")
            : quickLabel(col);
        return `${tableauDeBord.plain(tableauDeBord.labelOf(col))} : ${v}`;
      })
      .join(" ; ");
  }
  const quickCols = () => [
    ...new Set([
      ...(tableauDeBord.config.quickFilters || []).filter((c) => tableauDeBord.columns.some((k) => k.id === c)),
      ...Object.keys(tableauDeBord.quick),
    ]),
  ];

  function renderQuickBar() {
    const cols = quickCols(),
      bar = $("quickBar");
    if (!cols.length) {
      bar.innerHTML = "";
      return;
    }
    bar.innerHTML =
      `<span class="sub">Filtrer :</span>` +
      cols
        .map(
          (
            col,
          ) => `<button class="qchip${tableauDeBord.quick[col] ? " on" : ""}" data-qf="${esc(col)}" aria-haspopup="dialog">
      ${esc(tableauDeBord.plain(tableauDeBord.labelOf(col)))} : <b>${esc(quickLabel(col))}</b> ▾</button>`,
        )
        .join("") +
      (Object.keys(tableauDeBord.quick).length ? `<button class="ghost" id="quickReset">Réinitialiser</button>` : "");
  }

  function setQuickValues(col, values, all) {
    if (values.length === all.length) delete tableauDeBord.quick[col];
    else tableauDeBord.quick[col] = { kind: "values", values };
    tableauDeBord.render();
  }

  function openQuick(col, anchor) {
    const pop = $("qpop"),
      r = anchor.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 330)) + "px";
    pop.style.top = r.bottom + 6 + "px";
    pop.dataset.col = col;
    if (tableauDeBord.isDate(col)) {
      const q = tableauDeBord.quick[col] || { kind: "date", preset: "all" };
      pop.innerHTML = `<div class="qhead"><b>${esc(tableauDeBord.plain(tableauDeBord.labelOf(col)))}</b></div>
      ${DATE_PRESETS.map(([k, l]) => `<label class="qopt"><input type="radio" name="qpreset" value="${k}" ${q.preset === k ? "checked" : ""}> ${esc(l)}</label>`).join("")}
      <div class="qrow">du <input type="date" id="qfrom" value="${esc(q.from || "")}"> au <input type="date" id="qto" value="${esc(q.to || "")}"></div>
      <div class="qrow"><button class="primary" id="qapply">Appliquer</button><button id="qclose">Fermer</button></div>`;
    } else {
      const counts = new Map();
      tableauDeBord
        .baseRows(col)
        .forEach((r) => tableauDeBord.keysOf(col, r[col]).forEach((k) => counts.set(k, (counts.get(k) || 0) + 1)));
      (tableauDeBord.quick[col] ? tableauDeBord.quick[col].values : []).forEach((k) => {
        if (!counts.has(k)) counts.set(k, 0);
      });
      const all = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr"));
      pop._all = all.map((e) => e[0]);
      const sel = tableauDeBord.quick[col] ? new Set(tableauDeBord.quick[col].values) : null;
      pop.innerHTML = `<div class="qhead"><b>${esc(tableauDeBord.plain(tableauDeBord.labelOf(col)))}</b></div>
      <input type="text" id="qsearch" placeholder="Rechercher…" aria-label="Rechercher une valeur">
      <div class="qrow"><button id="qall">Tout</button><button id="qnone">Aucune</button><button id="qclose">Fermer</button></div>
      <div class="qlist">${
        all
          .map(
            ([
              k,
              n,
            ]) => `<label class="qopt" data-txt="${esc(tableauDeBord.norm(tableauDeBord.plain(tableauDeBord.keyLabel(col, k))))}"><input type="checkbox" data-qv="${esc(k)}" ${!sel || sel.has(k) ? "checked" : ""}>
        <span>${tableauDeBord.rich(tableauDeBord.keyLabel(col, k))}</span> <span class="c">${n}</span></label>`,
          )
          .join("") || `<span class="hint">Aucune valeur</span>`
      }</div>`;
    }
    pop.hidden = false;
    const first = pop.querySelector("#qsearch, input[type=radio]:checked");
    if (first) first.focus();
  }
  function closeQuick() {
    $("qpop").hidden = true;
  }

  tableauDeBord.racine.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-qf]");
    if (chip) {
      const col = chip.dataset.qf;
      if (!$("qpop").hidden && $("qpop").dataset.col === col) closeQuick();
      else openQuick(col, chip);
      return;
    }
    if (e.target.id === "quickReset") {
      tableauDeBord.quick = {};
      closeQuick();
      tableauDeBord.render();
      return;
    }
    const pop = $("qpop");
    if (!pop.hidden && !e.target.closest("#qpop")) {
      closeQuick();
      return;
    }
    if (!e.target.closest("#qpop")) return;
    const col = pop.dataset.col;
    if (e.target.id === "qclose") closeQuick();
    else if (e.target.id === "qall") {
      pop.querySelectorAll("input[data-qv]").forEach((i) => (i.checked = true));
      setQuickValues(col, pop._all, pop._all);
    } else if (e.target.id === "qnone") {
      pop.querySelectorAll("input[data-qv]").forEach((i) => (i.checked = false));
      setQuickValues(col, [], pop._all);
    } else if (e.target.id === "qapply") {
      const preset = (pop.querySelector("input[name=qpreset]:checked") || {}).value || "all";
      const from = $("qfrom").value,
        to = $("qto").value;
      if (preset === "all") delete tableauDeBord.quick[col];
      else
        tableauDeBord.quick[col] = {
          kind: "date",
          preset: (from || to) && preset === "custom" ? "custom" : preset,
          from,
          to,
        };
      closeQuick();
      tableauDeBord.render();
    }
  });
  tableauDeBord.racine.addEventListener("change", (e) => {
    if (e.target.closest && e.target.closest("#qpop")) {
      const pop = $("qpop"),
        col = pop.dataset.col;
      if (e.target.dataset.qv !== undefined) {
        const values = [...pop.querySelectorAll("input[data-qv]")].filter((i) => i.checked).map((i) => i.dataset.qv);
        setQuickValues(col, values, pop._all);
      } else if (e.target.id === "qfrom" || e.target.id === "qto") {
        const c = pop.querySelector('input[name=qpreset][value="custom"]');
        if (c) c.checked = true;
      }
    }
  });
  tableauDeBord.racine.addEventListener("input", (e) => {
    if (e.target.id !== "qsearch") return;
    const q = tableauDeBord.norm(e.target.value);
    $("qpop")
      .querySelectorAll(".qopt")
      .forEach((l) => (l.style.display = !q || l.dataset.txt.includes(q) ? "" : "none"));
  });
  // constantes de ce module utilisées ailleurs
  Object.assign(tableauDeBord, { detailOpen });
};
