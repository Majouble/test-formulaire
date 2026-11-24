/* =====================================================================
   Lecture des fichiers de données dans le navigateur, sans script sur le poste (window.Tableur)
   ---------------------------------------------------------------------
   - lireClasseur(fichier) : classeur Excel (.xlsx = zip de XML, lu avec JSZip) → { noms, lire(nom), lireUne(noms) } ;
     lire(nom) rend { entetes, lignes } (une ligne = objet en-tête → valeur ; nombres, textes, booléens tels quels) ;
   - lireTexte(fichier) : fichier CSV ou texte tabulé (séparateur « ; », tabulation ou « , » deviné sur la ligne
     d'en-tête ; UTF-8, à défaut Windows-1252 comme les exports d'Excel) → même forme, une seule feuille ;
   - lireFichier(fichier) : l'un ou l'autre selon l'extension ;
   - jourDe(valeur) : jour civil « AAAA-MM-JJ » d'une date de tableur (numéro de série Excel, « JJ/MM/AAAA »,
     « AAAA-MM-JJ », avec ou sans heure), ou "" si illisible.
   ===================================================================== */
(function () {
  "use strict";
  const vide = v => v == null || (typeof v === "string" && !v.trim());

  /* ---------- Classeur Excel ---------- */
  let chargementZip = null;
  function chargerJSZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    if (!chargementZip) chargementZip = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
      s.onload = () => window.JSZip ? res(window.JSZip) : rej(new Error("bibliothèque absente"));
      s.onerror = () => { chargementZip = null; rej(new Error("impossible de charger la bibliothèque de lecture des classeurs (réseau bloqué ?)")); };
      document.head.appendChild(s);
    });
    return chargementZip;
  }
  const colonneLettres = r => { let n = 0; for (const ch of String(r).replace(/\d+$/, "")) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
  // Lignes brutes (tableaux) → { entetes, lignes } : la première ligne donne les en-têtes, les lignes vides sont écartées
  function enObjets(lignes) {
    const entetes = (lignes[0] || []).map(h => String(h ?? "").trim());
    const objets = lignes.slice(1).filter(l => l.some(v => !vide(v))).map(l => Object.fromEntries(entetes.map((h, i) => [h, l[i] ?? null]).filter(([h]) => h)));
    return { entetes: entetes.filter(Boolean), lignes: objets };
  }
  async function lireClasseur(fichier) {
    const JSZip = await chargerJSZip();
    let zip;
    try { zip = await JSZip.loadAsync(await fichier.arrayBuffer()); } catch (_) { throw new Error("Ce fichier n'est pas un classeur Excel (.xlsx)."); }
    const xml = async p => { const f = zip.file(p.replace(/^\//, "")); return f ? new DOMParser().parseFromString(await f.async("string"), "application/xml") : null; };
    const wb = await xml("xl/workbook.xml"), rels = await xml("xl/_rels/workbook.xml.rels");
    if (!wb || !rels) throw new Error("Ce fichier n'est pas un classeur Excel (.xlsx).");
    const cibles = {};
    [...rels.getElementsByTagName("Relationship")].forEach(r => { cibles[r.getAttribute("Id")] = r.getAttribute("Target"); });
    const partages = [], ss = await xml("xl/sharedStrings.xml");
    if (ss) [...ss.getElementsByTagName("si")].forEach(si => partages.push([...si.childNodes].filter(n => n.nodeName === "t" || n.nodeName === "r")
      .map(n => n.nodeName === "t" ? n.textContent : [...n.getElementsByTagName("t")].map(t => t.textContent).join("")).join("")));
    const feuilles = {};
    [...wb.getElementsByTagName("sheet")].forEach(s => {
      const rid = s.getAttribute("r:id") || [...s.attributes].find(a => /:id$/.test(a.name)).value, t = cibles[rid] || "";
      feuilles[s.getAttribute("name")] = t.startsWith("/") ? t.slice(1) : `xl/${t.replace(/^\.\//, "")}`;
    });
    const lues = {};
    async function lire(nom) {
      if (lues[nom]) return lues[nom];
      if (!feuilles[nom]) return null;
      const doc = await xml(feuilles[nom]); if (!doc) return null;
      const lignes = [];
      for (const row of doc.getElementsByTagName("row")) {
        const l = [];
        for (const c of row.getElementsByTagName("c")) {
          const t = c.getAttribute("t"), v = c.getElementsByTagName("v")[0], x = v ? v.textContent : null;
          let val = null;
          if (t === "s") val = x == null ? null : partages[+x];
          else if (t === "inlineStr") val = [...c.getElementsByTagName("t")].map(e => e.textContent).join("");
          else if (t === "b") val = x === "1";
          else if (t === "str" || t === "e") val = x;
          else val = x == null || x === "" ? null : Number(x);
          l[colonneLettres(c.getAttribute("r"))] = val;
        }
        lignes.push(l);
      }
      return (lues[nom] = enObjets(lignes));
    }
    const lireUne = async noms => { for (const n of noms) { const r = await lire(n); if (r) return { ...r, nom: n }; } return null; };
    return { noms: Object.keys(feuilles), lire, lireUne };
  }

  /* ---------- CSV et texte tabulé ---------- */
  // Découpe un texte délimité (guillemets doublés, retours à la ligne dans une cellule entre guillemets)
  function decouper(texte, sep) {
    const lignes = []; let l = [], cell = "", guill = false;
    for (let i = 0; i < texte.length; i++) {
      const ch = texte[i];
      if (guill) {
        if (ch === '"') { if (texte[i + 1] === '"') { cell += '"'; i++; } else guill = false; }
        else cell += ch;
      } else if (ch === '"' && cell === "") guill = true;
      else if (ch === sep) { l.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && texte[i + 1] === "\n") i++; l.push(cell); lignes.push(l); l = []; cell = ""; }
      else cell += ch;
    }
    if (cell !== "" || l.length) { l.push(cell); lignes.push(l); }
    return lignes.map(x => x.map(v => v.trim()));
  }
  function lireDelimite(texte) {
    texte = String(texte || "").replace(/^﻿/, "");
    const entete = texte.split(/\r?\n/, 1)[0] || "";
    const sep = ["\t", ";", ","].map(s => [s, entete.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
    return { ...enObjets(decouper(texte, sep)), separateur: sep };
  }
  async function lireTexte(fichier) {
    const brut = await fichier.arrayBuffer();
    let texte = new TextDecoder("utf-8").decode(brut);
    if (texte.includes("�")) texte = new TextDecoder("windows-1252").decode(brut);   // export Excel « CSV (séparateur : point-virgule) »
    const f = lireDelimite(texte), nom = "Feuille 1";
    return { noms: [nom], lire: async n => n === nom ? f : null, lireUne: async () => ({ ...f, nom }) };
  }
  const lireFichier = fichier => /\.xlsx$/i.test(fichier.name || "") ? lireClasseur(fichier) : lireTexte(fichier);

  /* ---------- Dates ---------- */
  const deux = n => String(n).padStart(2, "0");
  function jourDe(v) {
    if (v == null || v === "") return "";
    if (typeof v === "number" && isFinite(v)) {
      if (v > 20000 && v < 80000) {   // numéro de série Excel (jours depuis le 30/12/1899)
        const d = new Date(Math.round((Math.floor(v) - 25569) * 86400) * 1000);
        return `${d.getUTCFullYear()}-${deux(d.getUTCMonth() + 1)}-${deux(d.getUTCDate())}`;
      }
      return "";
    }
    const s = String(v).trim();
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s), a, mo, j;
    if (m) [a, mo, j] = [+m[1], +m[2], +m[3]];
    else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/.exec(s))) [j, mo, a] = [+m[1], +m[2], m[3].length === 2 ? 2000 + +m[3] : +m[3]];
    else if (/^\d+(\.\d+)?$/.test(s)) return jourDe(Number(s));
    else return "";
    const d = new Date(Date.UTC(a, mo - 1, j));
    if (d.getUTCFullYear() !== a || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== j) return "";   // 31/02, 13e mois…
    return `${a}-${deux(mo)}-${deux(j)}`;
  }

  window.Tableur = { lireClasseur, lireTexte, lireDelimite, lireFichier, jourDe };
})();
