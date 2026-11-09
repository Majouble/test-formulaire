/* PRISME — tableau de bord, module 10/15 : Événements : clics, saisies, glisser-déposer, atelier.
   État posé sur tableauDeBord : dragFrom, resizeTimer.
   Publie sur tableauDeBord : ouvrirFenetre, renderStudio, downloadCsv.
   Utilise (tableauDeBord.) : CFG_TABLE, CHART_TYPES, TIP_SEP, aCoordonnees, aggregate, baseRows, blockEditor, cellRatio,
     cibleDe, colDeBloc, columns, config, configLoaded, copyForWord, coverInfo, crossData, detailOpen, downloadPng,
     editing, ensureRefs, expectCells, exportWord, fenetre, fileSafe, inSrc, isBool, isCover, isDate, isNumCol,
     keyLabel, labelOf, logicOf, mainTable, measureText, newId, ongletSt, passAll, plain, quick, racine,
     readCfgTable, refColumns, refNorm, remapBlockCols, render, renderGlobal, rich, rowHead, saveConfig, scopeHost,
     selId, showMsg, studio, tableDeBloc, triggerDownload, valeursColonnes.
   tableauDeBord et l'ordre des modules : voir tableau-de-bord/tableau.js. */

TableauDeBord.modules["evenements"] = function (tableauDeBord) {
  const { esc, $ } = Outils;
  // fonctions de ce module utilisées ailleurs : disponibles dès maintenant (déclarations remontées)
  Object.assign(tableauDeBord, { ouvrirFenetre, renderStudio, downloadCsv });
  // =============================================================================
  // Événements
  // =============================================================================
  function setPath(obj, path, value) {
    const ks = path.split(".");
    let o = obj;
    ks.slice(0, -1).forEach((k) => {
      o[k] = o[k] || {};
      o = o[k];
    });
    o[ks[ks.length - 1]] = value;
  }
  const scopeBlock = (scope) => tableauDeBord.scopeHost(scope).ctx;
  function condsOf(scope) {
    const h = tableauDeBord.scopeHost(scope);
    return (h.host[h.condKey] = h.host[h.condKey] || []);
  }

  function commit() {
    tableauDeBord.saveConfig();
    tableauDeBord.render();
  }

  tableauDeBord.racine.addEventListener("change", (e) => {
    const t = e.target;
    if (t.id === "dashName") {
      tableauDeBord.config.name = t.value.trim() || "Tableau de bord";
      commit();
      return;
    }
    if (t.id === "wordTilesLayout" || t.id === "wordTilesPerRow" || t.id === "wordDeltaColor") {
      tableauDeBord.config.wordTiles = {
        layout: $("wordTilesLayout").value,
        perRow: Number(($("wordTilesPerRow") || {}).value) || (tableauDeBord.config.wordTiles || {}).perRow || 3,
        deltaColor: ($("wordDeltaColor") || {}).value || "color",
      };
      commit();
      return;
    }
    if (t.dataset && t.dataset.bdetail !== undefined) {
      // colonnes du détail, propres au bloc
      const blk = tableauDeBord.config.blocks[Number(t.dataset.bdetail)];
      const set = new Set(blk.detailCols || []);
      t.checked ? set.add(t.dataset.col) : set.delete(t.dataset.col);
      blk.detailCols = tableauDeBord.inSrc(blk, () =>
        tableauDeBord.columns.map((c) => c.id).filter((id) => set.has(id)),
      );
      commit();
      return;
    }
    if (t.dataset.b !== undefined && t.dataset.k) {
      const b = tableauDeBord.config.blocks[Number(t.dataset.b)];
      const v = t.type === "checkbox" ? t.checked : t.type === "number" ? Number(t.value) : t.value;
      setPath(b, t.dataset.k, v);
      if (t.dataset.k === "source") {
        const oldSrc = t.dataset.prev || null;
        if (!v) delete b.source;
        tableauDeBord.remapBlockCols(b, oldSrc && oldSrc !== tableauDeBord.mainTable ? oldSrc : null);
        tableauDeBord.ensureRefs();
      }
      tableauDeBord.inSrc(b, () => {
        if (t.dataset.k === "measure.agg" && v === "cover" && (!b.measure.col || tableauDeBord.isNumCol(b.measure.col)))
          b.measure.col =
            (
              tableauDeBord.columns.find(
                (c) => !tableauDeBord.isNumCol(c.id) && !tableauDeBord.isDate(c.id) && !tableauDeBord.isBool(c.id),
              ) || {}
            ).id || "";
        else if (t.dataset.k === "measure.agg" && v !== "count" && !b.measure.col)
          b.measure.col = (tableauDeBord.columns.find((c) => tableauDeBord.isNumCol(c.id)) || {}).id || "";
        if (
          t.dataset.k === "chart" &&
          v === "points" &&
          !tableauDeBord.cibleDe((tableauDeBord.colDeBloc(b, b.rows.col) || {}).type) &&
          !/uai/i.test(b.rows.col || "")
        ) {
          // lignes : l'établissement
          const uai =
            (tableauDeBord.aCoordonnees(tableauDeBord.tableDeBloc(b)) &&
              tableauDeBord.columns.find((c) => /^uai$/i.test(c.id))) ||
            tableauDeBord.columns.find(
              (c) => /uai/i.test(c.id) && tableauDeBord.aCoordonnees(tableauDeBord.tableDeBloc(b)),
            );
          const etab =
            uai ||
            tableauDeBord.columns.find(
              (c) =>
                tableauDeBord.cibleDe(c.type) &&
                tableauDeBord.refColumns(tableauDeBord.cibleDe(c.type)).some((x) => /^lat/i.test(x.id)),
            );
          if (etab) {
            b.rows.col = etab.id;
            delete b.rows.grain;
            delete b.rows.ref;
          }
        }
        if (/\.ref\.table$/.test(t.dataset.k)) {
          // colonne de la liste devinée d'après la colonne des réponses
          const ref = t.dataset.k.startsWith("measure") ? b.measure.ref : b.rows.ref,
            own = t.dataset.k.startsWith("measure") ? b.measure.col : b.rows.col;
          const rc = tableauDeBord.refColumns(v),
            target = tableauDeBord.refNorm(tableauDeBord.labelOf(own || "")).replace(/ /g, "");
          ref.col =
            (
              rc.find((c) => tableauDeBord.refNorm(c.id).replace(/ /g, "") === target) ||
              rc.find((c) => {
                const n = tableauDeBord.refNorm(c.id + " " + c.label).replace(/ /g, "");
                return target && (n.includes(target) || target.includes(tableauDeBord.refNorm(c.id).replace(/ /g, "")));
              }) ||
              rc.find((c) => !/^(Numeric|Int|Bool|Date)/.test(c.type)) ||
              {}
            ).id || "";
          delete ref.expect;
          delete ref.conds;
          delete ref.logic; // nouvelle table : ses filtres repartent de zéro
        }
      });
      commit();
    } else if (t.dataset.lscope && t.dataset.lf) {
      // ET / OU / formule
      const lg = tableauDeBord.logicOf(t.dataset.lscope);
      lg[t.dataset.lf] = t.value.trim();
      if (t.dataset.lf === "mode" && t.value === "expr" && !lg.expr) {
        const n = condsOf(t.dataset.lscope).length;
        lg.expr = Array.from({ length: n }, (_, k) => k + 1).join(" ET ");
      }
      commit();
    } else if (t.dataset.scope && t.dataset.f) {
      const c = condsOf(t.dataset.scope)[Number(t.dataset.ci)];
      c[t.dataset.f] = t.value;
      if (t.dataset.f === "col") {
        c.val = "";
        delete c.prec;
        delete c.rel;
        if (tableauDeBord.inSrc(scopeBlock(t.dataset.scope), () => tableauDeBord.isBool(t.value))) c.op = "true";
      }
      if (t.dataset.f === "relkind") {
        delete c.relkind;
        if (t.value) c.rel = { kind: t.value, n: (c.rel && c.rel.n) || 1 };
        else delete c.rel;
      }
      if (t.dataset.f === "reln") {
        delete c.reln;
        c.rel = { ...(c.rel || {}), n: Math.max(0, Math.round(Number(t.value) || 0)) };
      }
      if (t.dataset.f === "prec") {
        // on adapte la valeur déjà saisie à la nouvelle précision
        const v = String(c.val || "");
        c.val =
          t.value === "day"
            ? v.slice(0, 10)
            : t.value === "datetime"
              ? v.length >= 16
                ? v.slice(0, 16)
                : v.length >= 10
                  ? v.slice(0, 10) + "T00:00"
                  : ""
              : v.length >= 16
                ? v.slice(11, 16)
                : "";
      }
      commit();
    }
  });
  // les titres et valeurs se mettent à jour sans perdre le curseur : enregistrement au changement uniquement
  tableauDeBord.racine.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    const act = t.dataset.act,
      i = Number(t.dataset.b);
    if (act === "clrdetail") {
      delete tableauDeBord.config.blocks[i].detailCols;
      commit();
      return;
    }
    if (act === "autodesc") {
      delete tableauDeBord.config.blocks[i].desc;
      commit();
      return;
    }
    if (act === "colmove") {
      const b = tableauDeBord.config.blocks[i],
        j = Number(t.dataset.j),
        d = Number(t.dataset.d);
      const vals = tableauDeBord.inSrc(b, () => tableauDeBord.valeursColonnes(b));
      if (j + d < 0 || j + d >= vals.length) return;
      [vals[j], vals[j + d]] = [vals[j + d], vals[j]];
      b.colOrder = vals;
      commit();
      return;
    }
    if (act === "colreset") {
      delete tableauDeBord.config.blocks[i].colOrder;
      commit();
      return;
    }
    if (act === "addqf") {
      const c = $("qfAddCol").value;
      if (c) {
        tableauDeBord.config.quickFilters = [...(tableauDeBord.config.quickFilters || []), c];
        commit();
      }
      return;
    }
    if (act === "delqf") {
      const c = (tableauDeBord.config.quickFilters || [])[Number(t.dataset.k)];
      tableauDeBord.config.quickFilters.splice(Number(t.dataset.k), 1);
      delete tableauDeBord.quick[c];
      commit();
      return;
    }
    if (act === "addcond") {
      condsOf(t.dataset.scope).push({
        col: tableauDeBord.inSrc(scopeBlock(t.dataset.scope), () => (tableauDeBord.columns[0] || {}).id || ""),
        op: "eq",
        val: "",
      });
      commit();
    } else if (act === "delcond") {
      const k = Number(t.dataset.ci),
        lg = tableauDeBord.logicOf(t.dataset.scope);
      condsOf(t.dataset.scope).splice(k, 1);
      if (lg.mode === "expr" && lg.expr) {
        // renumérotation ; la condition retirée sort de la formule
        lg.expr = lg.expr
          .replace(/\d+/g, (m) => {
            const i = Number(m) - 1;
            return i === k ? "§" : String(i > k ? i : i + 1);
          })
          .replace(/\s*(ET|OU|AND|OR|&&?|\|\|?)\s*§|§\s*(ET|OU|AND|OR|&&?|\|\|?)\s*/gi, " ")
          .replace(/(NON|NOT|!)\s*§/gi, "")
          .replace(/\(\s*\)/g, "")
          .replace(/§/g, "")
          .replace(/\(\s+/g, "(")
          .replace(/\s+\)/g, ")")
          .replace(/\s+/g, " ")
          .trim();
      }
      commit();
    } else if (act === "del") {
      tableauDeBord.config.blocks.splice(i, 1);
      commit();
    } else if (act === "dup") {
      const c = JSON.parse(JSON.stringify(tableauDeBord.config.blocks[i]));
      c.id = tableauDeBord.newId();
      c.title = (c.title || "") + " (copie)";
      tableauDeBord.config.blocks.splice(i + 1, 0, c);
      commit();
    } else if (act === "up" || act === "down") {
      const sameType = tableauDeBord.config.blocks
        .map((b, k) => [b, k])
        .filter(([b]) => (b.type === "tile") === (tableauDeBord.config.blocks[i].type === "tile"))
        .map(([, k]) => k);
      const pos = sameType.indexOf(i),
        j = sameType[pos + (act === "up" ? -1 : 1)];
      if (j !== undefined) {
        [tableauDeBord.config.blocks[i], tableauDeBord.config.blocks[j]] = [
          tableauDeBord.config.blocks[j],
          tableauDeBord.config.blocks[i],
        ];
        commit();
      }
    } else if (act === "csv") tableauDeBord.downloadCsv(tableauDeBord.config.blocks[i]);
    else if (act === "copy") tableauDeBord.copyForWord(tableauDeBord.config.blocks[i], t);
    else if (act === "png") tableauDeBord.downloadPng(tableauDeBord.config.blocks[i], i);
    else if (act === "docx") tableauDeBord.exportWord(i);
  });
  $("toggleEdit").addEventListener("click", () => {
    tableauDeBord.editing = !tableauDeBord.editing;
    tableauDeBord.render();
  });

  // ---- Atelier : panneau du bloc choisi, fenêtres « Ajouter un bloc » et « Réglages du tableau »
  const ICONES = {
    tile: "123",
    table: `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M2 7h12M2 10h12M7 3v10"/></svg>`,
    barh: `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3v10"/><path d="M2 5h9M2 8h12M2 11h6"/></svg>`,
    barv: `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 14h12"/><path d="M4 13V8M8 13V3M12 13V6"/></svg>`,
    line: `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 14h12"/><path d="M2 11l4-4 3 2 5-6"/></svg>`,
    pie: `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="5.5"/><path d="M8 2.5V8l4 3.8"/></svg>`,
    map: `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 4l4-1.5 4 1.5 4-1.5v9.5l-4 1.5-4-1.5-4 1.5z"/><path d="M6 2.5v9.5M10 4v9.5"/></svg>`,
    points: `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5" cy="6" r="1.6"/><circle cx="11" cy="5" r="2.2"/><circle cx="8" cy="11" r="1.2"/></svg>`,
  };
  function genreBloc(b) {
    if (b.type === "tile") return { icone: ICONES.tile, nom: "Chiffre clé" };
    if ((b.view || "both") === "table") return { icone: ICONES.table, nom: "Tableau" };
    const c = b.chart || "barh";
    return {
      icone: ICONES[c] || "▦",
      nom:
        (tableauDeBord.CHART_TYPES.find((x) => x[0] === c)?.[1] ?? "Graphique") +
        ((b.view || "both") === "both" ? " et tableau" : ""),
    };
  }
  const MODELES = [
    {
      cle: "tile",
      icone: ICONES.tile,
      nom: "Chiffre clé",
      desc: "Un nombre en grand : signalements, établissements touchés, part du total…",
    },
    {
      cle: "table",
      icone: ICONES.table,
      nom: "Tableau",
      desc: "Un tableau croisé : une ligne par valeur, une colonne de résultat ou plusieurs.",
    },
    {
      cle: "barh",
      icone: ICONES.barh,
      nom: "Barres",
      desc: "Classement horizontal, avec son tableau (qualifications, académies…).",
    },
    {
      cle: "barv",
      icone: ICONES.barv,
      nom: "Histogramme",
      desc: "Colonnes verticales, souvent par jour ou par semaine.",
    },
    {
      cle: "line",
      icone: ICONES.line,
      nom: "Courbe",
      desc: "Évolution dans le temps (date de saisie, date des faits).",
    },
    { cle: "pie", icone: ICONES.pie, nom: "Anneau", desc: "Répartition en parts (peu de valeurs)." },
    {
      cle: "map",
      icone: ICONES.map,
      nom: "Carte par territoire",
      desc: "Départements ou académies colorés selon la valeur.",
    },
    {
      cle: "points",
      icone: ICONES.points,
      nom: "Carte des établissements",
      desc: "Un point par établissement, taille selon la valeur.",
    },
  ];
  function creerBloc(cle) {
    const id = tableauDeBord.newId();
    if (cle === "tile")
      tableauDeBord.config.blocks.push({
        id,
        type: "tile",
        title: "Nouveau chiffre clé",
        measure: { agg: "count" },
        conds: [],
      });
    else {
      const date = tableauDeBord.columns.find((c) => tableauDeBord.isDate(c.id)),
        choix =
          tableauDeBord.columns.find((c) => /^Choice/.test(c.type)) ||
          tableauDeBord.columns.find((c) => !tableauDeBord.isDate(c.id) && !tableauDeBord.isNumCol(c.id)) ||
          tableauDeBord.columns[0] ||
          {};
      const geo = tableauDeBord.columns.find((c) => /^(departement|academie)$/i.test(c.id)),
        etab =
          tableauDeBord.columns.find((c) => /^uai$/i.test(c.id)) ||
          tableauDeBord.columns.find((c) => /^Ref:/.test(c.type));
      const col =
        cle === "line" || cle === "barv"
          ? (date || choix).id
          : cle === "map"
            ? (geo || choix).id
            : cle === "points"
              ? (etab || choix).id
              : choix.id;
      const b = {
        id,
        type: "cross",
        title: "Nouveau bloc",
        measure: { agg: "count" },
        rows: { col: col || "", grain: "jour" },
        cols: { col: "", grain: "jour" },
        conds: [],
        view: cle === "table" ? "table" : ["map", "points", "pie"].includes(cle) ? "chart" : "both",
        sort: cle === "line" || cle === "barv" ? "label" : "value",
        top: cle === "pie" ? 6 : 20,
      };
      if (cle !== "table") b.chart = cle;
      if (cle === "map" && geo) b.rows.grain = /acad/i.test(geo.id) ? "aca_norm" : "dep_norm";
      if (cle === "map" || cle === "points") b.top = 0;
      b.title = `${(MODELES.find((m) => m.cle === cle) || {}).nom || "Bloc"}${col ? ` — ${tableauDeBord.plain(tableauDeBord.labelOf(col))}` : ""}`;
      tableauDeBord.config.blocks.push(b);
    }
    tableauDeBord.selId = id;
    tableauDeBord.ongletSt = "donnees";
    fermerFenetre();
    commit();
    setTimeout(() => {
      const c = tableauDeBord.racine.querySelector(".card.selectionne");
      if (c) c.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 50);
  }
  function ouvrirFenetre(type) {
    tableauDeBord.fenetre = type;
    $("fenetre").hidden = false;
    $("fenetreTitre").textContent = type === "ajouter" ? "Ajouter un bloc" : "Réglages du tableau de bord";
    if (type === "ajouter")
      $("fenetreCorps").innerHTML =
        `<p class="hint">Choisissez une présentation : le bloc est créé avec des réglages de départ, à ajuster ensuite dans le panneau de droite.</p>
    <div class="st-modeles">${MODELES.map((m) => `<button class="st-modele" data-act="st-creer" data-k="${m.cle}"><span class="st-icone">${m.icone}</span><strong>${esc(m.nom)}</strong><span>${esc(m.desc)}</span></button>`).join("")}</div>`;
    else tableauDeBord.renderGlobal();
    const b = $("fenetreCorps").querySelector("button, input, select");
    if (b) b.focus();
  }
  function fermerFenetre() {
    tableauDeBord.fenetre = null;
    const f = $("fenetre");
    if (f) {
      f.hidden = true;
      $("fenetreCorps").innerHTML = "";
    }
  }
  function renderStudio() {
    const z = $("studio");
    if (!z) return;
    const i = tableauDeBord.config.blocks.findIndex((b) => b.id === tableauDeBord.selId);
    tableauDeBord.racine
      .querySelectorAll("[data-bi]")
      .forEach((c) => c.classList.toggle("selectionne", i >= 0 && Number(c.dataset.bi) === i));
    if (i < 0) {
      tableauDeBord.selId = null;
      z.innerHTML = `<div class="st-tete"><strong>Réglages</strong></div>
      <div class="st-corps"><p class="hint">Cliquez sur un bloc du tableau de bord pour le régler ici. Le résultat s'affiche à gauche au fur et à mesure.</p>
      <div class="st-actions"><button class="primary" data-act="st-ajouter">+ Ajouter un bloc</button><button data-act="st-reglages">⚙ Réglages du tableau</button></div>
      ${
        tableauDeBord.config.blocks.length
          ? `<div class="sub" style="margin-top:14px">Blocs du tableau de bord</div><ol class="st-liste">${tableauDeBord.config.blocks
              .map((b) => {
                const g = genreBloc(b);
                return `<li><button class="ghost" data-act="st-choisir" data-k="${esc(b.id)}"><span class="st-icone">${g.icone}</span> ${esc(tableauDeBord.plain(b.title || tableauDeBord.measureText(b.measure)))}</button></li>`;
              })
              .join("")}</ol>`
          : ""
      }</div>`;
      return;
    }
    const b = tableauDeBord.config.blocks[i],
      g = genreBloc(b);
    // les réglages se calculent dans la table source du bloc (colonnes proposées, conditions)
    const parts = tableauDeBord.inSrc(b, () => tableauDeBord.blockEditor(b, i));
    const onglet = (k, lib) =>
      `<button role="tab" class="st-onglet${tableauDeBord.ongletSt === k ? " actif" : ""}" aria-selected="${tableauDeBord.ongletSt === k}" data-act="st-onglet" data-k="${k}">${lib}</button>`;
    z.innerHTML = `<div class="st-tete"><span class="st-icone">${g.icone}</span><div class="st-titre"><span class="hint">${esc(g.nom)}</span><strong>${esc(tableauDeBord.plain(b.title || tableauDeBord.measureText(b.measure)))}</strong></div>
      <span class="st-outils"><button class="ghost" data-act="up" data-b="${i}" title="Monter">↑</button><button class="ghost" data-act="down" data-b="${i}" title="Descendre">↓</button>
      <button class="ghost" data-act="dup" data-b="${i}" title="Dupliquer">⧉</button><button class="ghost" data-act="del" data-b="${i}" title="Supprimer ce bloc">🗑</button>
      <button class="ghost" data-act="st-fermer" title="Fermer le panneau">✕</button></span></div>
    <div class="st-onglets" role="tablist">${onglet("donnees", "Données")}${onglet("presentation", "Présentation")}${onglet("detail", "Détail")}</div>
    <div class="st-corps editor" role="tabpanel">${tableauDeBord.ongletSt === "donnees" ? parts.donnees : tableauDeBord.ongletSt === "presentation" ? parts.presentation : parts.detail}</div>
    <div class="st-pied hint">${esc(parts.resume)}</div>`;
  }
  if (tableauDeBord.studio()) {
    tableauDeBord.racine.addEventListener("click", (e) => {
      const t = e.target.closest("button");
      const act = t && t.dataset.act;
      if (act === "st-ajouter") return ouvrirFenetre("ajouter");
      if (act === "st-reglages") return ouvrirFenetre("reglages");
      if (act === "st-fermer-fenetre") return fermerFenetre();
      if (act === "st-creer") return creerBloc(t.dataset.k);
      if (act === "st-choisir") {
        tableauDeBord.selId = t.dataset.k;
        tableauDeBord.ongletSt = "donnees";
        return renderStudio();
      }
      if (act === "st-onglet") {
        tableauDeBord.ongletSt = t.dataset.k;
        return renderStudio();
      }
      if (act === "st-fermer") {
        tableauDeBord.selId = null;
        return renderStudio();
      }
      if (e.target === $("fenetre")) return fermerFenetre();
      // clic sur un bloc du tableau de bord (hors boutons et champs) : il devient le bloc réglé
      if (t || e.target.closest("input, select, textarea, label, a, .studio, .fenetre")) return;
      const card = e.target.closest("[data-bi]");
      if (!card) return;
      const b = tableauDeBord.config.blocks[Number(card.dataset.bi)];
      if (!b) return;
      if (tableauDeBord.selId !== b.id) {
        tableauDeBord.selId = b.id;
        renderStudio();
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && tableauDeBord.fenetre && tableauDeBord.racine.isConnected) fermerFenetre();
    });
  }

  // ---- Glisser-déposer : réordonner les chiffres clés entre eux et les tableaux ou cartes entre eux
  tableauDeBord.dragFrom = null;
  const dropMarks = () =>
    document
      .querySelectorAll(".drop-before, .drop-after")
      .forEach((e) => e.classList.remove("drop-before", "drop-after"));
  function dropTarget(e) {
    const card = e.target.closest && e.target.closest("[data-bi]");
    if (!card || tableauDeBord.dragFrom === null) return null;
    const to = Number(card.dataset.bi),
      from = tableauDeBord.config.blocks[tableauDeBord.dragFrom];
    if (
      to === tableauDeBord.dragFrom ||
      !from ||
      (tableauDeBord.config.blocks[to].type === "tile") !== (from.type === "tile")
    )
      return null; // chaque zone garde ses blocs
    const r = card.getBoundingClientRect(),
      tile = from.type === "tile";
    const after = tile ? e.clientX > r.left + r.width / 2 : e.clientY > r.top + r.height / 2;
    return { card, to, after };
  }
  tableauDeBord.racine.addEventListener("dragstart", (e) => {
    const h = e.target.closest && e.target.closest("[data-drag]");
    if (!h || !tableauDeBord.editing) return;
    tableauDeBord.dragFrom = Number(h.dataset.drag);
    const card = h.closest("[data-bi]");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(tableauDeBord.dragFrom));
    if (card) {
      try {
        e.dataTransfer.setDragImage(card, 20, 20);
      } catch (err) {}
      setTimeout(() => card.classList.add("dragging"), 0);
    }
  });
  tableauDeBord.racine.addEventListener("dragover", (e) => {
    if (tableauDeBord.dragFrom !== null) {
      // défilement automatique près des bords
      if (e.clientY < 60) window.scrollBy(0, -24);
      else if (e.clientY > window.innerHeight - 60) window.scrollBy(0, 24);
    }
    const t = dropTarget(e);
    if (!t) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    dropMarks();
    t.card.classList.add(t.after ? "drop-after" : "drop-before");
  });
  tableauDeBord.racine.addEventListener("drop", (e) => {
    const t = dropTarget(e);
    dropMarks();
    if (!t) return;
    e.preventDefault();
    const [blk] = tableauDeBord.config.blocks.splice(tableauDeBord.dragFrom, 1);
    let at = t.to - (tableauDeBord.dragFrom < t.to ? 1 : 0);
    if (t.after) at++;
    tableauDeBord.config.blocks.splice(at, 0, blk);
    tableauDeBord.dragFrom = null;
    commit();
  });
  tableauDeBord.racine.addEventListener("dragend", () => {
    tableauDeBord.dragFrom = null;
    dropMarks();
    document.querySelectorAll(".dragging").forEach((e) => e.classList.remove("dragging"));
  });
  $("exportWord").addEventListener("click", () => tableauDeBord.exportWord());
  // Récupération d'une configuration enregistrée dans un autre widget du document
  // (réglages stockés dans _grist_Views_section.options -> customView -> widgetOptions)
  function findConfigs(value, path, out, depth = 0) {
    if (depth > 14 || value === null || value === undefined) return;
    if (typeof value === "string") {
      const t = value.trim();
      if ((t.startsWith("{") || t.startsWith("[")) && t.includes("blocks")) {
        try {
          findConfigs(JSON.parse(t), path, out, depth + 1);
        } catch (e) {}
      }
      return;
    }
    if (typeof value !== "object") return;
    if (Array.isArray(value.blocks) && value.blocks.every((b) => b && b.type && b.measure)) {
      out.push(value);
      return;
    }
    Object.keys(value).forEach((k) => findConfigs(value[k], path.concat(k), out, depth + 1));
  }
  async function scanDocument() {
    const S = await Donnees.lire("_grist_Views_section");
    let V = { id: [], name: [] };
    try {
      V = await Donnees.lire("_grist_Views");
    } catch (e) {}
    const T = await Donnees.lire("_grist_Tables");
    const found = [];
    S.id.forEach((id, i) => {
      const out = [];
      findConfigs(S.options[i], [], out);
      out.forEach((cfg) => {
        const vi = V.id.indexOf(S.parentId[i]),
          ti = T.id.indexOf(S.tableRef ? S.tableRef[i] : -1);
        found.push({
          section: id,
          page: vi >= 0 ? V.name[vi] : `page ${S.parentId[i]}`,
          title: (S.title && S.title[i]) || "",
          table: ti >= 0 ? T.tableId[ti] : "",
          cfg,
        });
      });
    });
    const C = await tableauDeBord.readCfgTable();
    if (C && C.id)
      C.id.forEach((id, k) => {
        try {
          const cfg = JSON.parse(C.Configuration[k]);
          if (cfg && Array.isArray(cfg.blocks))
            found.push({ section: "table", page: tableauDeBord.CFG_TABLE, title: C.Nom[k], table: "", cfg });
        } catch (e) {}
      });
    return found;
  }
  $("findCfg").addEventListener("click", async () => {
    const box = $("recover");
    box.innerHTML = `<div class="card"><div class="empty">Recherche dans le document…</div></div>`;
    try {
      const found = await scanDocument();
      const same = (c) => JSON.stringify(c) === JSON.stringify(tableauDeBord.config);
      window.__found = found;
      box.innerHTML = `<div class="card"><div class="card-head"><div class="t"><h2>Configurations trouvées dans ce document</h2>
      <div class="desc">Choisissez celle à reprendre dans ce widget. La configuration actuelle sera remplacée (pensez à la sauvegarder avant si besoin).</div></div>
      <button class="ghost" id="recoverClose">✕</button></div>
      ${
        found.length
          ? `<table style="margin-top:8px"><thead><tr><th>Page</th><th>Widget</th><th>Table</th><th>Blocs</th><th></th></tr></thead><tbody>
      ${found
        .map(
          (
            f,
            k,
          ) => `<tr><td>${esc(f.page)}</td><td>${esc(f.title || "sans titre")}${f.section === "table" ? " (copie de sécurité)" : ` (n° ${f.section})`}</td><td>${esc(f.table)}</td>
        <td>${f.cfg.blocks.length} : ${esc(
          f.cfg.blocks
            .slice(0, 3)
            .map((b) => tableauDeBord.plain(b.title || ""))
            .join(", "),
        )}${f.cfg.blocks.length > 3 ? "…" : ""}</td>
        <td>${same(f.cfg) ? `<span class="hint">configuration actuelle</span>` : `<button data-act="usecfg" data-k="${k}">Utiliser</button>`}</td></tr>`,
        )
        .join("")}</tbody></table>`
          : `<div class="empty">Aucune configuration de tableau de bord n'a été trouvée dans les widgets de ce document.</div>`
      }</div>`;
    } catch (e) {
      box.innerHTML = `<div class="msg err">Recherche impossible : ${esc(e && e.message ? e.message : e)} (l'accès complet est nécessaire).</div>`;
    }
  });
  tableauDeBord.racine.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.id === "recoverClose") $("recover").innerHTML = "";
    if (t.dataset.act === "usecfg") {
      const f = (window.__found || [])[Number(t.dataset.k)];
      if (!f) return;
      tableauDeBord.config = JSON.parse(JSON.stringify({ filters: f.cfg.filters || [], blocks: f.cfg.blocks }));
      tableauDeBord.configLoaded = true;
      $("recover").innerHTML = "";
      commit();
      tableauDeBord.showMsg(
        "ok",
        `Configuration reprise du widget « ${f.title || "sans titre"} » (page ${f.page}) : ${f.cfg.blocks.length} bloc(s). Pensez à cliquer sur « Sauvegarder la configuration ».`,
      );
    }
  });

  // Sauvegarde / restauration de la configuration (pour changer de version du widget ou copier un tableau de bord)
  $("saveCfg").addEventListener("click", () => {
    const data = JSON.stringify(
      { format: "tableau_de_bord_grist", version: 1, date: new Date().toISOString(), config: tableauDeBord.config },
      null,
      2,
    );
    tableauDeBord.triggerDownload(
      new Blob([data], { type: "application/octet-stream" }),
      `configuration tableau de bord ${Outils.dates.aujourdhui()}.json`,
    );
  });
  $("loadCfg").addEventListener("click", () => {
    $("cfgFile").value = "";
    $("cfgFile").click();
  });
  $("cfgFile").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      const obj = JSON.parse(await f.text());
      const cfg = obj && obj.config ? obj.config : obj;
      if (!cfg || !Array.isArray(cfg.blocks))
        throw new Error("ce fichier ne contient pas de configuration de tableau de bord");
      const unknown = [
        ...new Set(
          [...(cfg.filters || []), ...cfg.blocks.flatMap((b) => [...(b.conds || []), b.measure, b.rows, b.cols])]
            .filter((x) => x && x.col)
            .map((x) => x.col),
        ),
      ].filter((c) => !tableauDeBord.columns.some((k) => k.id === c));
      tableauDeBord.config = { filters: cfg.filters || [], blocks: cfg.blocks };
      tableauDeBord.configLoaded = true;
      commit();
      tableauDeBord.showMsg(
        unknown.length ? "warn" : "ok",
        `Configuration restaurée : ${cfg.blocks.length} bloc(s).` +
          (unknown.length ? ` Colonnes introuvables dans cette table : ${unknown.join(", ")}.` : ""),
      );
    } catch (err) {
      tableauDeBord.showMsg("err", "Restauration impossible : " + err.message);
    }
  });
  tableauDeBord.resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(tableauDeBord.resizeTimer);
    tableauDeBord.resizeTimer = setTimeout(tableauDeBord.render, 150);
  });
  $("addTile").addEventListener("click", () => {
    const id = tableauDeBord.newId();
    tableauDeBord.detailOpen.add(id + "-ed");
    tableauDeBord.config.blocks.push({
      id,
      type: "tile",
      title: "Nouveau chiffre clé",
      measure: { agg: "count" },
      conds: [],
    });
    commit();
  });
  $("openAll").addEventListener("click", () => {
    tableauDeBord.config.blocks.forEach((b) => tableauDeBord.detailOpen.add(b.id + "-ed"));
    tableauDeBord.render();
  });
  $("closeAll").addEventListener("click", () => {
    tableauDeBord.config.blocks.forEach((b) => tableauDeBord.detailOpen.delete(b.id + "-ed"));
    tableauDeBord.render();
  });
  $("addCross").addEventListener("click", () => {
    const col = (tableauDeBord.columns.find((c) => /^Choice/.test(c.type)) || tableauDeBord.columns[0] || {}).id || "";
    const nid = tableauDeBord.newId();
    tableauDeBord.detailOpen.add(nid + "-ed");
    tableauDeBord.config.blocks.push({
      id: nid,
      type: "cross",
      title: "Nouveau tableau croisé",
      measure: { agg: "count" },
      rows: { col, grain: "jour" },
      cols: { col: "", grain: "jour" },
      conds: [],
      view: "both",
      sort: "value",
      top: 20,
    });
    commit();
  });

  // info-bulle des graphiques
  tableauDeBord.racine.addEventListener("mousemove", (e) => {
    const t = e.target.closest && e.target.closest("[data-tip]"),
      tip = $("tip");
    if (!t) {
      tip.style.display = "none";
      return;
    }
    const [a, v] = t.getAttribute("data-tip").split(tableauDeBord.TIP_SEP);
    tip.innerHTML = `${tableauDeBord.rich(a)}<br><b>${esc(v)}</b>`;
    tip.style.display = "block";
    const x = Math.min(e.clientX + 12, window.innerWidth - tip.offsetWidth - 8);
    tip.style.left = x + "px";
    tip.style.top = e.clientY + 14 + "px";
  });

  function downloadCsv(b) {
    const q = (v) => {
      const s = v == null ? "" : String(v);
      return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const num = (v) => (isNaN(v) ? "" : String(Math.round(v * 1000) / 1000).replace(".", ","));
    const base = tableauDeBord.baseRows();
    let lines;
    if (tableauDeBord.isCover(b)) {
      const c = tableauDeBord.coverInfo(
        base.filter((r) => tableauDeBord.passAll(r, b.conds, b.logic)),
        b.measure,
      );
      lines = [[b.title || tableauDeBord.measureText(b.measure)], ["Valeur", "Lignes", "Statut"]];
      if (c.ok)
        [...c.missing, ...c.present].forEach((x) =>
          lines.push([x.label, String(x.n), x.n ? "A répondu" : "Sans réponse"]),
        );
      if (c.ok) c.outside.forEach((x) => lines.push([x.label, String(x.n), "Hors liste"]));
    } else if (b.type === "tile")
      lines = [
        [b.title || tableauDeBord.measureText(b.measure)],
        [
          num(
            tableauDeBord.aggregate(
              base.filter((r) => tableauDeBord.passAll(r, b.conds, b.logic)),
              b.measure,
            ),
          ),
        ],
      ];
    else {
      const d = tableauDeBord.crossData(b, base);
      const ex = tableauDeBord.expectCells(d),
        pc = !!(ex && d.refCfg.perCol);
      lines = [
        [
          tableauDeBord.plain(tableauDeBord.rowHead(d.rc, d.rg)),
          ...d.colKeys.flatMap((k) =>
            pc
              ? [
                  tableauDeBord.plain(tableauDeBord.keyLabel(d.cc, k, d.cg)),
                  tableauDeBord.plain(tableauDeBord.keyLabel(d.cc, k, d.cg)) + " (%)",
                ]
              : [tableauDeBord.plain(tableauDeBord.keyLabel(d.cc, k, d.cg))],
          ),
          "Total",
          ...(ex ? [tableauDeBord.plain(ex.head[0]), tableauDeBord.plain(ex.head[1]) + " (%)"] : []),
        ],
      ];
      d.rowKeys.forEach((rk) =>
        lines.push([
          tableauDeBord.plain(tableauDeBord.keyLabel(d.rc, rk, d.rg)),
          ...d.colKeys.flatMap((ck) =>
            pc ? [num(d.val(rk, ck)), num(tableauDeBord.cellRatio(d, rk, d.val(rk, ck)))] : [num(d.val(rk, ck))],
          ),
          num(d.rowVal.get(rk)),
          ...(ex ? ex.raw(rk).map(num) : []),
        ]),
      );
      lines.push([
        "Total",
        ...d.colKeys.flatMap((ck) =>
          pc
            ? [num(d.colVal.get(ck)), num(tableauDeBord.cellRatio(d, null, d.colVal.get(ck)))]
            : [num(d.colVal.get(ck))],
        ),
        num(d.total),
        ...(ex ? ex.rawTotal.map(num) : []),
      ]);
    }
    const text = "﻿" + lines.map((l) => l.map(q).join(";")).join("\r\n") + "\r\n";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    a.download = tableauDeBord.fileSafe(b.title || "tableau") + ".csv";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  }
};
