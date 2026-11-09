/* PRISME — tableau de bord, module 11/15 : Export : images PNG, copie des tableaux, document Word.
   Publie sur tableauDeBord : triggerDownload, blockTable, blockDesc, autoDesc, tileNumbers, tileValue, tableHtml,
     copyForWord, exportWord, downloadPng, LIGHT, fileSafe, coverNote, shareUnit.
   Utilise (tableauDeBord.) : ADDITIVE, aggregate, attachedTo, baseRows, cardParts, cellRatio, chartSpec, condsText,
     config, coverInfo, crossData, curSrc, expectCells, fmtNum, inSrc, inkOn, isCover, isMainSrc, keyLabel, labelOf,
     labelText, labelsOn, maxValue, measureText, nf, passAll, plain, pointLabel, quickText, rich, rowDim, rowHead,
     segs, showMsg, showTotals, topOf, totalLabel, withRatio.
   tableauDeBord et l'ordre des modules : voir tableau-de-bord/tableau.js. */

TableauDeBord.modules["export-word"] = function (tableauDeBord) {
  const { esc, $ } = Outils;
  // fonctions de ce module utilisées ailleurs : disponibles dès maintenant (déclarations remontées)
  Object.assign(tableauDeBord, {
    triggerDownload,
    blockTable,
    blockDesc,
    autoDesc,
    tileNumbers,
    tileValue,
    tableHtml,
    copyForWord,
    exportWord,
    downloadPng,
  });
  // =============================================================================
  // Export vers Word : image PNG des graphiques, copie des tableaux, document .docx
  // =============================================================================
  // Couleurs claires imposées pour les exports (fond blanc dans Word, même si l'écran est en mode sombre)
  const LIGHT = {
    "--s1": "#2a78d6",
    "--s2": "#eb6834",
    "--s3": "#1baf7a",
    "--s4": "#eda100",
    "--s5": "#e87ba4",
    "--s6": "#008300",
    "--s7": "#4a3aa7",
    "--other": "#898781",
    "--axis": "#c3c2b7",
    "--ink": "#000000",
    "--ink-2": "#000000",
    "--q0": "#f0efec",
    "--q1": "#cde2fb",
    "--q2": "#86b6ef",
    "--q3": "#3987e5",
    "--q4": "#1c5cab",
    "--q5": "#0d366b",
    "--surface": "#ffffff",
    "--grid": "#e1e0d9",
  };
  const lightVars = (s) => s.replace(/var\((--[a-z0-9-]+)\)/g, (m, v) => LIGHT[v] || m);

  function stamp() {
    const d = Outils.dates.parties(Date.now()), // heure de Paris
      p = (n) => String(n).padStart(2, "0");
    return `${p(d.jour)}/${p(d.mois)}/${d.annee} à ${p(d.heures)}h${p(d.minutes)}`;
  }
  // nom de fichier sans accents ni caractères spéciaux (certains navigateurs remplacent sinon le nom par « download »)
  const fileSafe = (s) =>
    tableauDeBord
      .plain(s || "export")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[’']/g, " ")
      .replace(/[^A-Za-z0-9 ._-]+/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "export";

  function triggerDownload(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1500);
  }

  // Graphique SVG (+ légende) -> PNG, en couleurs claires, à 2x pour une impression nette
  function chartToPng(card) {
    const svg = card && card.querySelector(".chart svg");
    if (!svg) return Promise.resolve(null);
    const W = Number(svg.getAttribute("width")),
      H0 = Number(svg.getAttribute("height"));
    const legendItems = [...card.querySelectorAll(".chart .legend span")].map((s) => ({
      color: lightVars((s.querySelector("i") || {}).style ? s.querySelector("i").style.background : "#898781"),
      text: s.textContent.trim(),
    }));
    // légende redessinée sous le graphique
    let lx = 0,
      ly = H0 + 18,
      leg = "";
    legendItems.forEach((it) => {
      const w = 18 + it.text.length * 7.5;
      if (lx + w > W) {
        lx = 0;
        ly += 18;
      }
      leg += `<rect x="${lx}" y="${ly - 9}" width="10" height="10" rx="3" fill="${it.color}"/><text x="${lx + 15}" y="${ly}" fill="#000000">${esc(it.text)}</text>`;
      lx += w + 12;
    });
    const H = legendItems.length ? ly + 8 : H0;
    let inner = svg.innerHTML
      .replace(/<title>[\s\S]*?<\/title>/g, "")
      .replace(/ data-tip="[^"]*"/g, "")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ""); // caractères interdits en XML
    inner = lightVars(inner)
      .replace(/<text class="val"/g, '<text fill="#000000"')
      .replace(/<text(?![^>]*fill=)/g, '<text fill="#000000"');
    const src = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <style>text{font-family:Marianne,Arial,Helvetica,sans-serif;font-size:13.33px}</style>
    <rect width="100%" height="100%" fill="#ffffff"/>${inner}${leg}</svg>`;
    return new Promise((resolve, reject) => {
      const img = new Image(),
        k = 2;
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = W * k;
        c.height = H * k;
        const ctx = c.getContext("2d");
        ctx.scale(k, k);
        ctx.drawImage(img, 0, 0);
        c.toBlob(
          (b) => (b ? resolve({ blob: b, w: W, h: H }) : reject(new Error("conversion impossible"))),
          "image/png",
        );
      };
      img.onerror = () => reject(new Error("graphique illisible"));
      img.src =
        "data:image/svg+xml;charset=utf-8," +
        encodeURIComponent(src.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, ""));
    });
  }

  // Contenu tabulaire d'un bloc, tel qu'affiché (lignes limitées à « Lignes affichées »)
  function blockTable(b) {
    const base = tableauDeBord.baseRows();
    if (b.type === "tile") return null;
    const d = tableauDeBord.crossData(b, base);
    const top = tableauDeBord.topOf(b);
    const pct = b.percent && tableauDeBord.ADDITIVE.has(b.measure.agg || "count") && d.total;
    const show = (v) =>
      pct ? (isNaN(v) ? "–" : tableauDeBord.nf.format((v / d.total) * 100) + " %") : tableauDeBord.fmtNum(v);
    const ex = tableauDeBord.expectCells(d);
    const head = [
      tableauDeBord.rowHead(d.rc, d.rg),
      ...d.colKeys.map((k) => tableauDeBord.keyLabel(d.cc, k, d.cg)),
      d.cc ? "Total" : tableauDeBord.plain(tableauDeBord.measureText(b.measure)),
      ...(ex ? ex.head : []),
    ];
    const rows = d.rowKeys
      .slice(0, top)
      .map((rk) => [
        tableauDeBord.keyLabel(d.rc, rk, d.rg),
        ...d.colKeys.map((ck) =>
          tableauDeBord.withRatio(show(d.val(rk, ck)), tableauDeBord.cellRatio(d, rk, d.val(rk, ck))),
        ),
        show(d.rowVal.get(rk)),
        ...(ex ? ex.row(rk) : []),
      ]);
    const total = [
      "Total",
      ...d.colKeys.map((ck) =>
        tableauDeBord.withRatio(show(d.colVal.get(ck)), tableauDeBord.cellRatio(d, null, d.colVal.get(ck))),
      ),
      show(d.total),
      ...(ex ? ex.total : []),
    ];
    const hidden = Math.max(0, d.rowKeys.length - top);
    return { head, rows, total, hidden, empty: (!d.rows.length && !d.missingKeys.size) || !b.rows.col };
  }
  // Rappel du calcul : texte libre du bloc s'il est saisi ({calcul} y insère le texte automatique), sinon texte automatique
  function blockDesc(b) {
    const auto = autoDesc(b),
      own = String(b.desc || "").trim();
    return own ? own.replace(/\{calcul\}/gi, auto) : auto;
  }
  function autoDesc(b) {
    if (!tableauDeBord.isMainSrc(b) && tableauDeBord.curSrc !== b.source)
      return tableauDeBord.inSrc(b, () => autoDesc(b));
    const src = tableauDeBord.isMainSrc(b) ? "" : `Table ${b.source} · `;
    const conds = tableauDeBord.condsText(b.conds, b.logic);
    const dims =
      b.type === "cross"
        ? (b.rows.col ? " par " + tableauDeBord.rowDim(b.rows.col, b.rows.grain) : "") +
          (b.cols && b.cols.col ? " et " + tableauDeBord.labelOf(b.cols.col) : "")
        : "";
    return src + tableauDeBord.measureText(b.measure) + dims + (conds ? " · " + conds : "");
  }
  // Valeur d'un chiffre clé et, si demandé, sa part : mesure avec conditions ÷ même mesure sans les conditions du bloc
  const coverNote = (c) =>
    `${c.missing.length} sans réponse${c.outside.length ? ` · ${c.outside.length} valeur(s) hors liste` : ""}`;
  function tileNumbers(b, base) {
    base = base || tableauDeBord.baseRows();
    if (tableauDeBord.isCover(b)) {
      const c = tableauDeBord.coverInfo(
        base.filter((r) => tableauDeBord.passAll(r, b.conds, b.logic)),
        b.measure,
      );
      if (!c.ok) return { v: NaN, all: NaN, share: NaN, cover: c };
      return {
        v: c.present.length,
        all: c.total,
        share: c.total ? (c.present.length / c.total) * 100 : NaN,
        cover: c,
      };
    }
    const v = tableauDeBord.aggregate(
      base.filter((r) => tableauDeBord.passAll(r, b.conds, b.logic)),
      b.measure,
    );
    const all = b.showShare ? tableauDeBord.aggregate(base, b.measure) : NaN;
    const share = b.showShare && all ? (v / all) * 100 : NaN;
    return { v, all, share };
  }
  const shareUnit = (b) =>
    (b.measure.agg || "count") === "count" ? "lignes" : tableauDeBord.isCover(b) ? "attendus" : "";
  function tileValue(b) {
    const cp = tableauDeBord.cardParts(b),
      extra = [
        cp.sub && cp.sub.text,
        cp.prev &&
          `${tableauDeBord.plain(cp.prev.label)} : ${cp.prev.value}${cp.prev.delta ? " " + cp.prev.delta.text : ""}`,
        cp.ref && `${tableauDeBord.plain(cp.ref.label)} : ${cp.ref.value}`,
      ].filter(Boolean);
    return tileValueBase(b) + (extra.length ? " — " + extra.join(" ; ") : "");
  }
  function tileValueBase(b) {
    const t = tableauDeBord.tileNumbers(b);
    if (!(b.showShare || tableauDeBord.isCover(b)) || isNaN(t.share)) return tableauDeBord.fmtNum(t.v);
    return b.shareMain
      ? `${tableauDeBord.fmtNum(t.share)} % (${tableauDeBord.fmtNum(t.v)} sur ${tableauDeBord.fmtNum(t.all)})`
      : `${tableauDeBord.fmtNum(t.v)} (${tableauDeBord.fmtNum(t.share)} %)`;
  }

  // ---- Copie d'un tableau pour collage dans Word (tableau Word natif) ----
  function tableHtml(b) {
    const t = tableauDeBord.blockTable(b);
    if (!t) return "";
    const th = (s) =>
      `<th style="border:1px solid #bfbfbf;background:#f2f2f2;padding:3px 6px;text-align:left;font-weight:bold">${tableauDeBord.rich(s)}</th>`;
    const td = (s, i, bold) =>
      `<td style="border:1px solid #bfbfbf;padding:3px 6px;text-align:${i ? "right" : "left"}${bold ? ";font-weight:bold" : ""}">${tableauDeBord.rich(s)}</td>`;
    return `<p style="font-family:Marianne,Arial;font-size:10pt"><b>${tableauDeBord.rich(b.title || tableauDeBord.measureText(b.measure))}</b></p>
    ${b.hideDesc ? "" : `<p style="font-family:Marianne,Arial;font-size:10pt">${tableauDeBord.rich(tableauDeBord.blockDesc(b))}</p>`}
    <table style="border-collapse:collapse;font-family:Marianne,Arial;font-size:10pt">
    <tr>${t.head.map(th).join("")}</tr>
    ${t.rows.map((r) => `<tr>${r.map((c, i) => td(c, i)).join("")}</tr>`).join("")}
    <tr>${t.total.map((c, i) => td(c, i, true)).join("")}</tr></table>
    ${t.hidden ? `<p style="font-family:Marianne,Arial;font-size:10pt">${t.hidden} autre(s) ligne(s) non reprise(s).</p>` : ""}`;
  }
  async function copyForWord(b, btn) {
    const html = tableauDeBord.tableHtml(b),
      text = (() => {
        const t = tableauDeBord.blockTable(b);
        return t ? [t.head, ...t.rows, t.total].map((r) => r.map(tableauDeBord.plain).join("\t")).join("\n") : "";
      })();
    let ok = false;
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([text], { type: "text/plain" }),
          }),
        ]);
        ok = true;
      }
    } catch (e) {
      ok = false;
    }
    if (!ok) {
      // repli : sélection d'un tableau caché puis copie
      const div = document.createElement("div");
      div.contentEditable = "true";
      div.style.cssText = "position:fixed;left:-9999px;top:0;background:#fff;color:#000";
      div.innerHTML = html;
      document.body.appendChild(div);
      const r = document.createRange();
      r.selectNodeContents(div);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      try {
        ok = document.execCommand("copy");
      } catch (e) {
        ok = false;
      }
      sel.removeAllRanges();
      div.remove();
    }
    if (btn) {
      const old = btn.textContent;
      btn.textContent = ok ? "Copié ✓" : "Copie bloquée";
      setTimeout(() => (btn.textContent = old), 1800);
    }
    if (!ok)
      tableauDeBord.showMsg(
        "warn",
        "Grist bloque la copie depuis le widget : utilisez « Exporter en Word » ou le bouton CSV.",
      );
  }

  // ---- Fichier .docx (généré dans le navigateur, sans bibliothèque externe) ----
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(u8) {
    let c = 0xffffffff;
    for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function zipStore(files, mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    // archive ZIP sans compression (suffisant pour Word)
    const enc = new TextEncoder(),
      parts = [],
      central = [];
    let offset = 0;
    files.forEach((f) => {
      const name = enc.encode(f.name),
        data = typeof f.data === "string" ? enc.encode(f.data) : f.data,
        crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true);
      h.setUint16(4, 20, true);
      h.setUint16(6, 0x0800, true);
      h.setUint16(8, 0, true);
      h.setUint16(10, 0, true);
      h.setUint16(12, 0x21, true);
      h.setUint32(14, crc, true);
      h.setUint32(18, data.length, true);
      h.setUint32(22, data.length, true);
      h.setUint16(26, name.length, true);
      h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true);
      c.setUint16(4, 20, true);
      c.setUint16(6, 20, true);
      c.setUint16(8, 0x0800, true);
      c.setUint16(10, 0, true);
      c.setUint16(12, 0, true);
      c.setUint16(14, 0x21, true);
      c.setUint32(16, crc, true);
      c.setUint32(20, data.length, true);
      c.setUint32(24, data.length, true);
      c.setUint16(28, name.length, true);
      c.setUint32(42, offset, true);
      central.push(new Uint8Array(c.buffer), name);
      offset += 30 + name.length + data.length;
    });
    const size = central.reduce((a, p) => a + p.length, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true);
    e.setUint16(8, files.length, true);
    e.setUint16(10, files.length, true);
    e.setUint32(12, size, true);
    e.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: mime });
  }

  // caractères interdits en XML (codes de contrôle venant des données) retirés : Word refuse sinon d'ouvrir le fichier
  const xe = (s) =>
    String(s ?? "")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
      .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  function wRuns(text, { bold = false, size = 20 } = {}) {
    const color = null; // tout le texte en noir
    return tableauDeBord
      .segs(text)
      .map(
        (x) =>
          `<w:r><w:rPr>${bold || x.b ? "<w:b/>" : ""}${color ? `<w:color w:val="${color}"/>` : ""}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr><w:t xml:space="preserve">${xe(x.t)}</w:t></w:r>`,
      )
      .join("");
  }
  const wP = (text, o = {}) =>
    `<w:p><w:pPr>${o.keep ? "<w:keepNext/>" : ""}<w:spacing w:before="${o.before || 0}" w:after="${o.after ?? 80}"/></w:pPr>${wRuns(text, o)}</w:p>`;
  function wCell(text, { head = false, right = false, bold = false, width } = {}) {
    return `<w:tc><w:tcPr>${width ? `<w:tcW w:w="${width}" w:type="dxa"/>` : ""}${head ? '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>' : ""}<w:tcMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tcMar></w:tcPr>
    <w:p><w:pPr><w:spacing w:before="20" w:after="20"/>${right ? '<w:jc w:val="right"/>' : ""}</w:pPr>${wRuns(text, { bold: head || bold, size: 20 })}</w:p></w:tc>`;
  }
  function wTable(head, rows, total) {
    const border =
      '<w:top w:val="single" w:sz="4" w:color="BFBFBF"/><w:left w:val="single" w:sz="4" w:color="BFBFBF"/><w:bottom w:val="single" w:sz="4" w:color="BFBFBF"/><w:right w:val="single" w:sz="4" w:color="BFBFBF"/><w:insideH w:val="single" w:sz="4" w:color="BFBFBF"/><w:insideV w:val="single" w:sz="4" w:color="BFBFBF"/>';
    const row = (cells, o = {}) =>
      `<w:tr>${o.head ? "<w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>" : "<w:trPr><w:cantSplit/></w:trPr>"}${cells.map((c, i) => wCell(c, { head: o.head, right: i > 0 && !o.head, bold: o.bold })).join("")}</w:tr>`;
    const nCol = Math.max(1, head.length),
      cw = Math.floor(9638 / nCol);
    return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${border}</w:tblBorders><w:tblLayout w:type="autofit"/></w:tblPr>
    <w:tblGrid>${Array(nCol).fill(`<w:gridCol w:w="${cw}"/>`).join("")}</w:tblGrid>
    ${row(head, { head: true })}${rows.map((r) => row(r)).join("")}${total ? row(total, { bold: true }) : ""}</w:tbl>`;
  }
  function wImage(rid, id, wPx, hPx) {
    const maxEmu = 6120000; // largeur utile d'une page A4 (17 cm)
    let cx = wPx * 9525,
      cy = hPx * 9525;
    if (cx > maxEmu) {
      cy = Math.round((cy * maxEmu) / cx);
      cx = maxEmu;
    }
    return `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/>
    <wp:docPr id="${id}" name="Graphique ${id}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>
    <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
    <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="graphique${id}.png"/><pic:cNvPicPr/></pic:nvPicPr>
    <pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
    <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>
    </a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
  }

  // ---- Graphiques Word natifs (modifiables : couleurs, police, type, données) ----
  const hexOf = (c) => (lightVars(c || "var(--s1)").replace("#", "") || "2A78D6").toUpperCase();
  const colLetter = (n) => {
    let s = "";
    n++;
    while (n) {
      const r = (n - 1) % 26;
      s = String.fromCharCode(65 + r) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  };

  function strCache(list) {
    return `<c:strCache><c:ptCount val="${list.length}"/>${list.map((v, i) => `<c:pt idx="${i}"><c:v>${xe(v)}</c:v></c:pt>`).join("")}</c:strCache>`;
  }
  function numCache(list) {
    return `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${list.length}"/>${list.map((v, i) => (v === null || v === undefined || isNaN(v) ? "" : `<c:pt idx="${i}"><c:v>${+(+v).toFixed(4)}</c:v></c:pt>`)).join("")}</c:numCache>`;
  }
  const fill = (hex) => `<c:spPr><a:solidFill><a:srgbClr val="${hex}"/></a:solidFill></c:spPr>`;
  const lnSp = (hex) => `<a:ln w="9525"><a:solidFill><a:srgbClr val="${hex}"/></a:solidFill></a:ln>`;
  const dLbls = (o = {}) =>
    `<c:dLbls>${o.pos ? `<c:dLblPos val="${o.pos}"/>` : ""}<c:showLegendKey val="0"/><c:showVal val="${o.val ? 1 : 0}"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="${o.pct ? 1 : 0}"/><c:showBubbleSize val="0"/></c:dLbls>`;

  // Étiquettes Word : « valeurs » reste lié aux données (showVal) ; pourcentages et textes composés sont écrits point par point.
  function wordLabels(spec, s, k, kind) {
    if (!tableauDeBord.labelsOn(spec)) return null;
    const stacked = kind === "bar" && spec.mode !== "group" && spec.mode !== "single";
    const pos = kind === "line" ? "t" : kind === "bar" ? (stacked ? "ctr" : "outEnd") : "";
    const posXml = pos ? `<c:dLblPos val="${pos}"/>` : "";
    const flags = (v, p) =>
      `<c:showLegendKey val="0"/><c:showVal val="${v ? 1 : 0}"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="${p ? 1 : 0}"/><c:showBubbleSize val="0"/>`;
    // largeur approximative du tracé dans Word (17 cm ≈ 560 px), pour écarter les étiquettes qui ne tiennent pas
    const plotPx = 560,
      cw = 5.6,
      n = spec.cats.length;
    const longest = Math.max(0, ...spec.cats.map((_, j) => String(tableauDeBord.pointLabel(spec, j, k)).length));
    const rotate =
      ((kind === "bar" && spec.type === "barv" && !stacked) || kind === "line") &&
      longest * cw + 4 > plotPx / Math.max(1, n) / (kind === "bar" && spec.mode === "group" ? spec.series.length : 1);
    const body = rotate ? '<a:bodyPr rot="-5400000" vert="horz"/>' : "<a:bodyPr/>";
    const txt = (color) =>
      `<c:txPr>${body}<a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="fr-FR"/></a:p></c:txPr>`;
    const ink = stacked
      ? tableauDeBord
          .inkOn("#" + hexOf(s.color))
          .replace("#", "")
          .toUpperCase()
      : "000000";
    if (kind === "pie") {
      if (spec.labels === "val" || spec.baseUnit === " %") return `<c:dLbls>${txt("000000")}${flags(1, 0)}</c:dLbls>`;
      if (spec.labels === "pct")
        return `<c:dLbls><c:numFmt formatCode="0.0%" sourceLinked="0"/>${txt("000000")}${flags(0, 1)}</c:dLbls>`;
    }
    const plainVal =
      (spec.labels === "val" || (spec.labels === "valtot" && spec.series.length > 1)) && spec.mode !== "pct";
    const max = tableauDeBord.maxValue(spec) || 1;
    const texts = spec.cats.map((_, j) => {
      if (kind === "pie") {
        const tot = s.values.reduce((a, v) => a + (v || 0), 0) || 1,
          v = s.values[j],
          t = tableauDeBord.labelText(spec, v, (v / tot) * 100);
        return (v / tot) * 2 * Math.PI * 85 >= t.length * cw + 4 ? t : ""; // part trop étroite
      }
      const t = tableauDeBord.pointLabel(spec, j, k);
      if (stacked) {
        // morceau trop petit pour son étiquette
        const px = ((s.values[j] || 0) / max) * (spec.type === "barh" ? plotPx : 200);
        if (spec.type === "barh" ? px < t.length * 6.5 + 8 : px < 14) return "";
      }
      return t;
    });
    const per = texts
      .map((t, j) =>
        !t
          ? `<c:dLbl><c:idx val="${j}"/><c:delete val="1"/></c:dLbl>`
          : plainVal
            ? ""
            : `<c:dLbl><c:idx val="${j}"/><c:tx><c:rich>${body}<a:lstStyle/><a:p><a:r><a:rPr lang="fr-FR" sz="900"><a:solidFill><a:srgbClr val="${ink}"/></a:solidFill></a:rPr><a:t>${xe(t)}</a:t></a:r></a:p></c:rich></c:tx>${posXml}${flags(1, 0)}</c:dLbl>`,
      )
      .join("");
    return `<c:dLbls>${per}${txt(ink)}${posXml}${flags(1, 0)}</c:dLbls>`;
  }

  // Word n'affiche pas de total sur une barre empilée : on ajoute une série transparente, posée au bout de la pile,
  // dont l'étiquette (collée à sa base) porte le total. Sans nom ni couleur, elle n'apparaît pas dans la légende.
  function wordSeries(spec) {
    if (!(spec.type === "barh" || spec.type === "barv") || !tableauDeBord.showTotals(spec)) return spec.series;
    const labels = spec.cats.map((_, j) => tableauDeBord.totalLabel(spec, j)),
      longest = Math.max(1, ...labels.map((t) => t.length));
    const base = tableauDeBord.maxValue(spec) || 1;
    let pad = spec.type === "barh" ? (base * (longest * 5.6 + 10)) / 440 : base * 0.12;
    if (spec.mode === "pct") pad = Math.min(19, pad); // l'axe s'arrête alors à 100 (graduations de 20)
    return [
      ...spec.series,
      {
        key: "__total",
        name: " ",
        dummy: true,
        color: "#FFFFFF",
        values: spec.cats.map(() => +pad.toFixed(4)),
        raw: spec.cats.map(() => 0),
        labels,
        pad,
      },
    ];
  }

  function chartXml(spec) {
    const n = spec.cats.length,
      catF = `Feuil1!$A$2:$A$${n + 1}`,
      cats = spec.cats.map((c) => tableauDeBord.plain(c.label));
    const all = spec.type === "barh" || spec.type === "barv" ? wordSeries(spec) : spec.series,
      dummy = all.find((s) => s.dummy);
    const serXml = (s, k, kind) => {
      const L = colLetter(k + 1);
      const head = `<c:idx val="${k}"/><c:order val="${k}"/><c:tx><c:strRef><c:f>Feuil1!$${L}$1</c:f>${strCache([s.name])}</c:strRef></c:tx>`;
      const cat = `<c:cat><c:strRef><c:f>${catF}</c:f>${strCache(cats)}</c:strRef></c:cat>`;
      const val = `<c:val><c:numRef><c:f>Feuil1!$${L}$2:$${L}$${n + 1}</c:f>${numCache(s.values)}</c:numRef></c:val>`;
      if (s.dummy) {
        const per = s.labels
          .map(
            (t, j) =>
              `<c:dLbl><c:idx val="${j}"/><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="fr-FR" sz="900"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:rPr><a:t>${xe(t)}</a:t></a:r></a:p></c:rich></c:tx><c:dLblPos val="inBase"/><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbl>`,
          )
          .join("");
        return `<c:ser>${head}<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr><c:invertIfNegative val="0"/><c:dLbls>${per}<c:dLblPos val="inBase"/><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>${cat}${val}</c:ser>`;
      }
      const custom = wordLabels(spec, s, k, kind),
        auto = spec.labels === "auto" || !spec.labels;
      if (kind === "bar")
        return `<c:ser>${head}${fill(hexOf(s.color))}<c:invertIfNegative val="0"/>${custom || (auto && spec.series.length === 1 ? dLbls({ val: true, pos: "outEnd" }) : "")}${cat}${val}</c:ser>`;
      if (kind === "line")
        return `<c:ser>${head}<c:spPr><a:ln w="28575" cap="rnd"><a:solidFill><a:srgbClr val="${hexOf(s.color)}"/></a:solidFill><a:round/></a:ln></c:spPr>
      <c:marker><c:symbol val="circle"/><c:size val="6"/>${fill(hexOf(s.color)).replace("</c:spPr>", `<a:ln w="12700"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr>`)}</c:marker>${custom || ""}${cat}${val}<c:smooth val="0"/></c:ser>`;
      // anneau : une couleur par part
      const dpts = s.values
        .map(
          (_, j) =>
            `<c:dPt><c:idx val="${j}"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="${hexOf(s.colors[j])}"/></a:solidFill><a:ln w="19050"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr></c:dPt>`,
        )
        .join("");
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
    if (spec.type === "pie")
      plot = `<c:doughnutChart><c:varyColors val="1"/>${serXml(spec.series[0], 0, "pie")}<c:firstSliceAng val="0"/><c:holeSize val="55"/></c:doughnutChart>`;
    else if (spec.type === "line")
      plot = `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${spec.series.map((s, k) => serXml(s, k, "line")).join("")}<c:marker val="1"/><c:axId val="5001"/><c:axId val="5002"/></c:lineChart>${axes(false)}`;
    else {
      const grouping = spec.mode === "stack" ? "stacked" : spec.mode === "pct" ? "stacked" : "clustered"; // « 100 % » : valeurs déjà ramenées à 100
      plot = `<c:barChart><c:barDir val="${spec.type === "barh" ? "bar" : "col"}"/><c:grouping val="${grouping}"/><c:varyColors val="0"/>
      ${wordSeries(spec)
        .map((s, k) => serXml(s, k, "bar"))
        .join(
          "",
        )}<c:gapWidth val="${spec.series.length > 1 && grouping === "clustered" ? 80 : 60}"/>${grouping === "stacked" ? '<c:overlap val="100"/>' : ""}
      <c:axId val="5001"/><c:axId val="5002"/></c:barChart>${axes(spec.type === "barh")}`;
    }
    const legend =
      spec.type === "pie" || spec.series.length > 1
        ? `<c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>`
        : "";
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
    const spec = {
      ...spec0,
      series: spec0.type === "barh" || spec0.type === "barv" ? wordSeries(spec0) : spec0.series,
    };
    const cell = (ref, v) =>
      typeof v === "number"
        ? `<c r="${ref}"><v>${+v.toFixed(4)}</v></c>`
        : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xe(v ?? "")}</t></is></c>`;
    const rows = [
      `<row r="1">${cell("A1", "")}${spec.series.map((s, k) => cell(colLetter(k + 1) + "1", s.name)).join("")}</row>`,
    ];
    spec.cats.forEach((c, j) =>
      rows.push(
        `<row r="${j + 2}">${cell("A" + (j + 2), tableauDeBord.plain(c.label))}${spec.series
          .map((s, k) => {
            const v = s.values[j];
            return v === null || v === undefined || isNaN(v) ? "" : cell(colLetter(k + 1) + (j + 2), v);
          })
          .join("")}</row>`,
      ),
    );
    const x = (s) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` + s;
    return zipStore(
      [
        {
          name: "[Content_Types].xml",
          data: x(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
      <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
      <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`),
        },
        {
          name: "_rels/.rels",
          data: x(
            `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
          ),
        },
        {
          name: "xl/workbook.xml",
          data: x(
            `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Feuil1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
          ),
        },
        {
          name: "xl/_rels/workbook.xml.rels",
          data: x(
            `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
          ),
        },
        {
          name: "xl/styles.xml",
          data: x(
            `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="10"/><name val="Marianne"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>`,
          ),
        },
        {
          name: "xl/worksheets/sheet1.xml",
          data: x(
            `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.join("")}</sheetData></worksheet>`,
          ),
        },
      ],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
  }

  function wChart(rid, id, spec) {
    const cx = spec.type === "pie" ? 4200000 : 6120000;
    const cy =
      spec.type === "barh"
        ? Math.min(
            8800000,
            700000 +
              spec.cats.length *
                (spec.mode === "group" && spec.series.length > 1 ? 90000 * spec.series.length + 90000 : 260000),
          )
        : spec.type === "pie"
          ? 3300000
          : 3300000;
    return `<w:p><w:pPr><w:spacing w:after="120"/>${spec.type === "pie" ? '<w:jc w:val="center"/>' : ""}</w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>
    <wp:docPr id="${id}" name="Graphique ${id}"/><wp:cNvGraphicFramePr/>
    <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
    <c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="${rid}"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
  }

  // Chiffres clés en tuiles : un tableau Word sans bordure extérieure, espacé, une case encadrée par chiffre clé.
  // Tout reste modifiable dans Word (taille des cases, couleurs, police, nombre de colonnes…).
  // Pied de carte Word : un petit tableau à deux cases (texte modifiable), filet en haut
  function wCardFoot(cp, width) {
    const colored = ((tableauDeBord.config.wordTiles || {}).deltaColor || "color") !== "black";
    const tone = { bad: "C9191E", good: "18753C", neutral: null };
    const run = (t, o = {}) =>
      `<w:r><w:rPr>${o.bold ? "<w:b/>" : ""}${o.color ? `<w:color w:val="${o.color}"/>` : ""}<w:sz w:val="${o.size || 18}"/><w:szCs w:val="${o.size || 18}"/></w:rPr><w:t xml:space="preserve">${xe(t)}</w:t></w:r>`;
    const p = (runs, right) =>
      `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/>${right ? '<w:jc w:val="right"/>' : ""}</w:pPr>${runs}</w:p>`;
    const side = (x, right, withDelta) =>
      !x
        ? p("", right)
        : p(
            tableauDeBord
              .segs(x.label)
              .map((s) => run(s.t, { bold: s.b }))
              .join(""),
            right,
          ) +
          p(
            run(x.value, { bold: true, size: 22 }) +
              (withDelta && x.delta
                ? run(" " + x.delta.text, { size: 18, color: colored ? tone[x.delta.tone] : null })
                : ""),
            right,
          );
    const half = Math.floor(width / 2);
    const tc = (inner, w) =>
      `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/><w:tcBorders><w:top w:val="single" w:sz="4" w:color="D9D9D9"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/></w:tcBorders><w:tcMar><w:top w:w="60" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tcMar></w:tcPr>${inner}</w:tc>`;
    return `<w:tbl><w:tblPr><w:tblW w:w="${width}" w:type="dxa"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders><w:tblLayout w:type="fixed"/>
    <w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w="${half}"/><w:gridCol w:w="${width - half}"/></w:tblGrid>
    <w:tr><w:trPr><w:cantSplit/></w:trPr>${tc(side(cp.prev, false, true), half)}${tc(side(cp.ref, true, false), width - half)}</w:tr></w:tbl>`;
  }
  function wTiles(tiles, perRow, base) {
    perRow = Math.max(1, Math.min(4, perRow));
    const textW = 9638,
      gap = 113; // 17 cm utiles, 2 mm entre les tuiles
    const cw = Math.floor((textW - gap * (perRow + 1)) / perRow);
    const border =
      '<w:top w:val="single" w:sz="6" w:color="D9D9D9"/><w:left w:val="single" w:sz="6" w:color="D9D9D9"/><w:bottom w:val="single" w:sz="6" w:color="D9D9D9"/><w:right w:val="single" w:sz="6" w:color="D9D9D9"/>';
    const none = '<w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/>';
    const para = (text, o = {}) =>
      `<w:p><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="${o.before || 0}" w:after="${o.after ?? 40}"/></w:pPr>${wRuns(text, o)}</w:p>`;
    const cell = (b) => tableauDeBord.inSrc(b, () => cellIn(b));
    const cellIn = (b) => {
      if (!b)
        return `<w:tc><w:tcPr><w:tcW w:w="${cw}" w:type="dxa"/><w:tcBorders>${none}</w:tcBorders></w:tcPr><w:p/></w:tc>`;
      const t = tableauDeBord.tileNumbers(b, base),
        hasShare = (b.showShare || tableauDeBord.isCover(b)) && !isNaN(t.share),
        unit = shareUnit(b);
      const main = hasShare && b.shareMain ? `${tableauDeBord.fmtNum(t.share)} %` : tableauDeBord.fmtNum(t.v);
      const sub =
        (!hasShare
          ? ""
          : b.shareMain
            ? `${tableauDeBord.fmtNum(t.v)} sur ${tableauDeBord.fmtNum(t.all)}${unit ? " " + unit : ""}`
            : `${tableauDeBord.fmtNum(t.share)} % (sur ${tableauDeBord.fmtNum(t.all)}${unit ? " " + unit : ""})`) +
        (t.cover && t.cover.ok ? " · " + coverNote(t.cover) : "");
      const cp = tableauDeBord.cardParts(b, base);
      return `<w:tc><w:tcPr><w:tcW w:w="${cw}" w:type="dxa"/><w:tcBorders>${border}</w:tcBorders></w:tcPr>
      ${para(b.title || tableauDeBord.measureText(b.measure), { bold: true, size: 20 })}
      ${b.hideDesc ? "" : para(tableauDeBord.blockDesc(b), { size: 20 })}
      ${para(main, { bold: true, size: 40, before: 80, after: sub || cp.sub ? 20 : 40 })}
      ${sub ? para(sub, { size: 20 }) : ""}${cp.sub ? para(cp.sub.text, { size: 20 }) : ""}
      ${cp.prev || cp.ref ? wCardFoot(cp, cw - 340) + `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:rPr><w:sz w:val="4"/></w:rPr></w:pPr></w:p>` : ""}</w:tc>`;
    };
    const rows = [];
    for (let k = 0; k < tiles.length; k += perRow) {
      const chunk = tiles.slice(k, k + perRow);
      while (chunk.length < perRow) chunk.push(null);
      rows.push(`<w:tr><w:trPr><w:cantSplit/></w:trPr>${chunk.map(cell).join("")}</w:tr>`);
    }
    return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblCellSpacing w:w="${gap}" w:type="dxa"/>
    <w:tblBorders>${none}<w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders><w:tblLayout w:type="fixed"/>
    <w:tblCellMar><w:top w:w="113" w:type="dxa"/><w:left w:w="170" w:type="dxa"/><w:bottom w:w="113" w:type="dxa"/><w:right w:w="170" w:type="dxa"/></w:tblCellMar></w:tblPr>
    <w:tblGrid>${Array(perRow).fill(`<w:gridCol w:w="${cw}"/>`).join("")}</w:tblGrid>${rows.join("")}</w:tbl>`;
  }

  async function exportWord(onlyIndex = null) {
    const btn = $("exportWord");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Préparation…";
    }
    try {
      const base = tableauDeBord.baseRows(),
        body = [],
        media = [],
        charts = [];
      const blocks = tableauDeBord.config.blocks
        .map((b, i) => [b, i])
        .filter(([, i]) => onlyIndex === null || i === onlyIndex);
      const commons = tableauDeBord.condsText(tableauDeBord.config.filters, tableauDeBord.config.filtersLogic);
      if (onlyIndex === null) {
        body.push(wP("Tableau de bord", { bold: true, size: 20, after: 60 }));
        const qt = tableauDeBord.quickText();
        body.push(
          wP(
            `Extraction du ${stamp()} · ${base.length} ligne${base.length > 1 ? "s" : ""}${commons ? " · filtres communs : " + commons : ""}${qt ? " · filtres appliqués : " + qt : ""}`,
            { size: 20, after: 240 },
          ),
        );
      }
      const tiles = blocks.filter(([b]) => b.type === "tile" && (onlyIndex !== null || !tableauDeBord.attachedTo(b)));
      if (tiles.length) {
        if (onlyIndex === null) body.push(wP("Chiffres clés", { bold: true, size: 20, before: 120, keep: true }));
        const wt = tableauDeBord.config.wordTiles || { layout: "tiles", perRow: 3 };
        if (wt.layout !== "table") {
          body.push(
            wTiles(
              tiles.map(([b]) => b),
              Number(wt.perRow) || 3,
              base,
            ),
          );
          body.push(wP("", { size: 20, after: 120 }));
        } else {
          body.push(
            wTable(
              ["Indicateur", "Valeur"],
              tiles.map(([b]) => [b.title || tableauDeBord.measureText(b.measure), tableauDeBord.tileValue(b)]),
              null,
            ),
          );
          const withDesc = tiles.filter(([b]) => !b.hideDesc);
          if (withDesc.length)
            body.push(
              wP(
                withDesc
                  .map(
                    ([b]) =>
                      `${tableauDeBord.plain(b.title || tableauDeBord.measureText(b.measure))} : ${tableauDeBord.plain(tableauDeBord.blockDesc(b))}`,
                  )
                  .join(" — "),
                { size: 20, before: 60, after: 240 },
              ),
            );
          else body.push(wP("", { size: 20, after: 160 }));
        }
      }
      for (const [b, i] of blocks.filter(([b]) => b.type === "cross")) {
        body.push(
          wP(b.title || tableauDeBord.measureText(b.measure), { bold: true, size: 20, before: 240, keep: true }),
        );
        if (!b.hideDesc) body.push(wP(tableauDeBord.blockDesc(b), { size: 20, keep: true }));
        const t = tableauDeBord.blockTable(b);
        if (!t || t.empty) {
          body.push(wP("Aucune donnée pour ces conditions.", { size: 20 }));
          continue;
        }
        if (
          (b.view || "both") !== "table" &&
          (b.wordChart || "native") === "native" &&
          b.chart !== "map" &&
          b.chart !== "points"
        ) {
          const d = tableauDeBord.crossData(b, base),
            spec = tableauDeBord.chartSpec(b, d, d.rowKeys.slice(0, tableauDeBord.topOf(b)));
          if (spec.error) body.push(wP(spec.error, { size: 20 }));
          else {
            const n = charts.length + 1,
              rid = "rIdChart" + n;
            charts.push({
              n,
              rid,
              xml: chartXml(spec),
              xlsx: new Uint8Array(await chartWorkbook(spec).arrayBuffer()),
            });
            body.push(wChart(rid, 100 + n, spec));
          }
        } else if ((b.view || "both") !== "table") {
          const png = await chartToPng(document.querySelector(`[data-card="${i}"]`));
          if (png) {
            const n = media.length + 1,
              rid = "rIdImg" + n;
            media.push({
              name: `word/media/graphique${n}.png`,
              data: new Uint8Array(await png.blob.arrayBuffer()),
              rid,
            });
            body.push(wImage(rid, n, png.w, png.h));
          }
        }
        if ((b.view || "both") !== "chart") {
          body.push(wTable(t.head, t.rows, t.total));
          if (t.hidden)
            body.push(
              wP(`${t.hidden} autre(s) ligne(s) non reprise(s) (réglage « Lignes affichées »).`, {
                size: 20,
                before: 40,
              }),
            );
        }
      }
      const NS =
        'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';
      const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body.join("")}
      <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
      const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Marianne" w:hAnsi="Marianne" w:eastAsia="Marianne" w:cs="Marianne"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="fr-FR"/></w:rPr></w:rPrDefault>
      <w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
      <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;
      const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
      ${media.map((m) => `<Relationship Id="${m.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${m.name.replace("word/", "")}"/>`).join("")}
      ${charts.map((c) => `<Relationship Id="${c.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="charts/chart${c.n}.xml"/>`).join("")}</Relationships>`;
      const files = [
        {
          name: "[Content_Types].xml",
          data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="xlsx" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"/>
        ${charts.map((c) => `<Override PartName="/word/charts/chart${c.n}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`).join("")}
        <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
        <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`,
        },
        {
          name: "_rels/.rels",
          data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
        },
        { name: "word/document.xml", data: doc },
        { name: "word/styles.xml", data: styles },
        { name: "word/_rels/document.xml.rels", data: rels },
        ...media.map((m) => ({ name: m.name, data: m.data })),
        ...charts.flatMap((c) => [
          { name: `word/charts/chart${c.n}.xml`, data: c.xml },
          {
            name: `word/charts/_rels/chart${c.n}.xml.rels`,
            data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/package" Target="../embeddings/Classeur_graphique${c.n}.xlsx"/></Relationships>`,
          },
          { name: `word/embeddings/Classeur_graphique${c.n}.xlsx`, data: c.xlsx },
        ]),
      ];
      const title = onlyIndex === null ? "Tableau de bord" : tableauDeBord.config.blocks[onlyIndex].title || "Bloc";
      triggerDownload(zipStore(files), `${fileSafe(title)}.docx`);
    } catch (e) {
      tableauDeBord.showMsg("err", "Export Word impossible : " + (e && e.message ? e.message : e));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Exporter en Word";
      }
    }
  }

  async function downloadPng(b, i) {
    try {
      const png = await chartToPng(document.querySelector(`[data-card="${i}"]`));
      if (!png) {
        tableauDeBord.showMsg(
          "warn",
          "Ce bloc n'affiche pas de graphique : réglez « Affichage » sur « Graphique et tableau ».",
        );
        return;
      }
      // type générique : certains navigateurs ignorent le nom de fichier pour une image
      triggerDownload(
        new Blob([png.blob], { type: "application/octet-stream" }),
        `${fileSafe(b.title || "graphique")}.png`,
      );
    } catch (e) {
      tableauDeBord.showMsg("err", "Image impossible : " + (e && e.message ? e.message : e));
    }
  }
  // constantes de ce module utilisées ailleurs
  Object.assign(tableauDeBord, { LIGHT, fileSafe, coverNote, shareUnit });
};
