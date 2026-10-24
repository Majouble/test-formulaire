/* =====================================================================
   Administration v2 — onglet « Référentiel » : référentiel de l'enseignement supérieur (classeur Excel)
   ---------------------------------------------------------------------
   Import du classeur consolidé des établissements, composantes et sites de l'ESR (onglets « Etablissements_ESR »,
   « Campus et sites », « Sites base mouvements », « Lignes fusionnées »), lu dans le navigateur :
   - établissements, composantes internes et sites ou campus → référentiel des établissements choisi (par défaut
     celui du champ ESR) ; rapprochement par identifiant ETAB-xxxx, puis UAI, puis nom ; « Établissement de
     rattachement » → colonne Rattachement (référence vers la même table) ;
   - campus et sites → référentiel des sites (repris s'il existe, sinon Referentiel_sites créée) ; rapprochement par
     identifiant SITE-xxxx, puis établissement et nom ;
   - sites saisis dans la base d'octobre → table Sites_correspondances (libellé saisi → site, « Validé ») ;
   - lignes fusionnées : la ligne existante absorbée est marquée (colonne Etat) et, sur option, les références qui y
     renvoient (signalements…) sont reportées sur l'établissement conservé.
   Rien n'est supprimé, une cellule vide du classeur n'efface rien, une colonne formule n'est jamais écrite.
   Les établissements sans coordonnées prennent celles d'un de leurs sites situé dans leur commune.
   Bilan affiché avant toute écriture ; réimporter une version corrigée du classeur met à jour sans doublon.
   ===================================================================== */
(function () {
  "use strict";
  const S = window.Socle;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nf = n => Number(n || 0).toLocaleString("fr-FR");
  const refId = v => typeof v === "number" ? v : (v && typeof v === "object" && "rowId" in v) ? v.rowId : (Array.isArray(v) && v[0] === "R") ? v[2] : null;
  const sansAcc = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
  const cle = s => sansAcc(s).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const nomNorm = s => sansAcc(s).toLowerCase().replace(/[’']/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
  const vide = v => v == null || (typeof v === "string" && !v.trim());
  const idDe = (v, p) => { const m = new RegExp(`^${p}-\\d+`).exec(String(v ?? "").trim()); return m ? m[0] : null; };
  const LOT = 400;
  const ORIGINE = "Référentiel ESR";
  const TABLE_SITES = "Referentiel_sites", TABLE_ALIAS = "Sites_correspondances";
  const FEUILLES = { etab: "Etablissements_ESR", sites: "Campus et sites", alias: "Sites base mouvements", fusions: "Lignes fusionnées" };

  // Colonnes reprises d'office (créées si besoin). role : rôle du socle à défaut d'une colonne du même nom.
  const CHAMPS_ETAB = [
    { entete: "Établissement ID", id: "Etablissement_ID", cleRef: true },
    { entete: "Libellé consolidé (liste déroulante)", id: "Libelle_consolide" },
    { entete: "Mots-clés de recherche", id: "Mots_cles" },
    { entete: "Nom", id: "Nom", role: "Nom" },
    { entete: "Sigle", id: "Sigle" },
    { entete: "Niveau", id: "Niveau", type: "Choice" },
    { entete: "Type", id: "Type", role: "Type" },
    { entete: "Établissement de rattachement", id: "Rattachement", ratt: true },
    { entete: "Secteur", id: "Secteur", role: "Statut_public_prive" },
    { entete: "État", id: "Etat" },
    { entete: "Académie", id: "Academie", role: "Academie" },
    { entete: "Département", id: "Departement", role: "Departement" },
    { entete: "Commune", id: "Commune", role: "Commune" },
    { entete: "Région académique (siège)", id: "Region_academique", role: "Region_academique" },
    { entete: "UAI", id: "UAI", role: "UAI" },
    { entete: "Identifiant Paysage", id: "Identifiant_Paysage" },
    { entete: "Statut de la ligne", id: "Statut_ligne" },
    { entete: "Points à vérifier", id: "Points_a_verifier" },
  ];
  const CHAMPS_SITES = [
    { entete: "Site ID", id: "Site_id", cleRef: true },
    { entete: "Nom du site", id: "Nom", nom: true },
    { entete: "Établissement ID", id: "Etablissement", etab: true },
    { entete: "Composante concernée", id: "Composante", etab: true },
    { entete: "Autres noms", id: "Autres_noms" },
    { entete: "Statut", id: "Statut", type: "Choice" },
    { entete: "Source", id: "Source", type: "Choice" },
    { entete: "Commune", id: "Commune" },
    { entete: "Code postal", id: "Code_postal" },
    { entete: "Académie", id: "Academie" },
    { entete: "Adresse", id: "Adresse" },
    { entete: "Latitude", id: "Latitude", type: "Numeric" },
    { entete: "Longitude", id: "Longitude", type: "Numeric" },
    { entete: "Précision des coordonnées", id: "Precision_coordonnees" },
    { entete: "Implantation multi-occupants", id: "Multi_occupants" },
    { entete: "Autres occupants", id: "Autres_occupants" },
  ];
  const SITES_IGNORES = ["Établissement", "Établissement (base des sites)"];   // noms en clair : l'identifiant suffit

  let racine = null, classeur = null, nomFichier = "", choixTable = "", analyse = null, enCours = false;
  const optionsCochees = { etab: null, sites: null };   // en-têtes facultatifs cochés (null : colonnes déjà présentes)
  let reporter = true;

  /* ---------- Lecture du classeur (.xlsx = zip de XML) ---------- */
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
      const entetes = (lignes[0] || []).map(h => String(h ?? "").trim());
      const objets = lignes.slice(1).filter(l => l.some(v => !vide(v))).map(l => Object.fromEntries(entetes.map((h, i) => [h, l[i] ?? null]).filter(([h]) => h)));
      return (lues[nom] = { entetes: entetes.filter(Boolean), lignes: objets });
    }
    return { noms: Object.keys(feuilles), lire };
  }

  /* ---------- Contexte Grist ---------- */
  async function contexte() {
    const meta = await S.lireMeta(), config = await S.lireConfig(meta);
    if (!config) throw new Error("La table Config n'existe pas : terminez d'abord l'installation.");
    const g = S.general(config), esp = S.espaces(g);
    const cibles = [...new Set(esp.map(e => e.referentiel))].filter(t => meta[t]);
    const parDefaut = (esp.find(e => e.champ === "ESR" && meta[e.referentiel]) || {}).referentiel || cibles[0] || null;
    return { meta, config, g, esp, cibles, parDefaut, reps: esp.map(e => e.reponses).filter(t => meta[t]) };
  }
  // Référentiel des sites existant : table « …site… » qui renvoie vers les établissements (comme le modèle par site)
  function tableSitesDe(ctx, etab) {
    return Object.keys(ctx.meta).find(t => !t.startsWith("_grist") && /site/i.test(t) && !/signal|correspond/i.test(t)
      && Object.values(ctx.meta[t].colonnes).some(c => c.type === `Ref:${etab}`) && !Object.values(ctx.meta[t].colonnes).some(c => ctx.reps.includes(S.cibleRef(c.type)))) || null;
  }

  /* ---------- Correspondance en-tête du classeur → colonne Grist ---------- */
  // colonne existante (même identifiant ou même libellé, sans accents ni ponctuation), sinon rôle, sinon à créer
  function colonneDe(tm, ch, roles, dejaPrises) {
    const cols = tm ? Object.values(tm.colonnes) : [];
    const libre = c => c && !dejaPrises.has(c.colId);
    let c = cols.find(x => libre(x) && (cle(x.colId) === cle(ch.entete) || cle(x.label) === cle(ch.entete)))
      || cols.find(x => libre(x) && cle(x.colId) === cle(ch.id))
      || (ch.role && roles[ch.role] && roles[ch.role].col && libre(tm.colonnes[roles[ch.role].col]) ? tm.colonnes[roles[ch.role].col] : null);
    return c || null;
  }
  const typeCreation = (ch, table) => ch.ratt ? `Ref:${table}` : ch.etab ? `Ref:${table}` : ch.type || "Text";
  function plan(tm, champs, entetes, options, roles, table, etabTable) {
    const prises = new Set(), lignes = [], creer = [];
    for (const ch of champs) {
      if (!entetes.includes(ch.entete)) continue;
      let c = colonneDe(tm, ch, roles, prises);
      if (ch.etab && tm) c = (c && c.type === `Ref:${etabTable}` ? c : null) || Object.values(tm.colonnes).find(x => !prises.has(x.colId) && x.type === `Ref:${etabTable}` && (ch.id === "Etablissement" ? !/compos/i.test(x.colId) : /compos/i.test(x.colId))) || null;
      if (ch.cleRef && !c && tm) c = null;   // colonne d'identifiant : détectée sur son contenu à l'analyse
      if (c && c.isFormula) { lignes.push({ ...ch, col: null, formule: c.colId }); prises.add(c.colId); continue; }
      if (c) { prises.add(c.colId); lignes.push({ ...ch, col: c.colId, meta: c }); continue; }
      const id = tm && tm.colonnes[ch.id] ? `${ch.id}_ESR` : ch.id;
      const m = { colId: id, type: ch.etab ? `Ref:${etabTable}` : typeCreation(ch, table), label: ch.entete, isFormula: false, widgetOptions: "" };
      creer.push(m); prises.add(id); lignes.push({ ...ch, col: id, meta: m, cree: true });
    }
    const pris = new Set(champs.map(c => c.entete));
    const facultatifs = entetes.filter(h => !pris.has(h)).map(h => {
      const c = tm ? Object.values(tm.colonnes).find(x => !prises.has(x.colId) && (cle(x.colId) === cle(h) || cle(x.label) === cle(h))) : null;
      return { entete: h, existante: c ? c.colId : null, formule: !!(c && c.isFormula) };
    });
    for (const f of facultatifs) {
      if (f.formule || !(options ? options.includes(f.entete) : f.existante)) continue;
      if (f.existante) { prises.add(f.existante); lignes.push({ entete: f.entete, id: f.existante, col: f.existante, meta: tm.colonnes[f.existante] }); continue; }
      let id = cle(f.entete).replace(/^(\d)/, "C_$1"); id = id.charAt(0).toUpperCase() + id.slice(1);
      while ((tm && tm.colonnes[id]) || prises.has(id)) id += "_";
      const m = { colId: id, type: "Text", label: f.entete, isFormula: false, widgetOptions: "" };
      creer.push(m); prises.add(id); lignes.push({ entete: f.entete, id, col: id, meta: m, cree: true });
    }
    return { lignes, creer, facultatifs };
  }

  /* ---------- Conversion d'une valeur du classeur pour une colonne Grist ---------- */
  function choixDe(m) { try { return (JSON.parse(m.widgetOptions || "{}").choices) || []; } catch (_) { return []; } }
  function convertisseur(nouveauxChoix, resoudre) {
    return async (m, v) => {
      if (vide(v)) return undefined;
      const t = String(m.type || "Text").split(":")[0];
      if (t === "Int" || t === "Numeric") { const n = typeof v === "number" ? v : Number(String(v).replace(",", ".").replace(/\s/g, "")); return Number.isFinite(n) ? (t === "Int" ? Math.round(n) : n) : undefined; }
      if (t === "Bool") return typeof v === "boolean" ? v : /^(oui|vrai|true|1|x)$/i.test(String(v).trim());
      if (t === "Ref") { const id = await resoudre(m, v); return id || undefined; }
      if (t === "Date" || t === "DateTime") return typeof v === "number" ? v : undefined;
      const s = typeof v === "string" ? v.trim() : String(v);
      if (t === "Choice" || t === "ChoiceList") {
        const ch = choixDe(m).concat([...(nouveauxChoix.get(m.colId) || [])]), trouve = ch.find(x => nomNorm(x) === nomNorm(s));
        if (!trouve) { if (!nouveauxChoix.has(m.colId)) nouveauxChoix.set(m.colId, new Set()); nouveauxChoix.get(m.colId).add(s); }
        return t === "ChoiceList" ? ["L", trouve || s] : (trouve || s);
      }
      return s;
    };
  }
  // Référence par libellé : ligne de la table cible dont une colonne texte porte cette valeur
  function resolveurTexte() {
    const caches = {};
    return async (m, valeur) => {
      const cible = S.cibleRef(m.type); if (!cible) return null;
      if (!caches[cible]) {
        const t = await grist.docApi.fetchTable(cible), index = new Map();
        for (const [c, vals] of Object.entries(t)) if (c !== "id" && Array.isArray(vals)) vals.forEach((v, i) => { if (typeof v === "string" && !index.has(nomNorm(v))) index.set(nomNorm(v), t.id[i]); });
        caches[cible] = index;
      }
      return caches[cible].get(nomNorm(valeur)) || null;
    };
  }
  const memeValeur = (a, b) => {
    if (a === b) return true;
    if (vide(a) && vide(b)) return true;
    if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 1e-9;
    if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b);
    if (refId(a) != null && refId(a) === refId(b)) return true;
    return typeof a === "string" && typeof b === "string" && a.trim() === b.trim();
  };
  const colonneIdentifiants = (t, prefixe) => Object.keys(t).filter(c => c !== "id" && Array.isArray(t[c])).map(c => {
    const v = t[c].filter(x => typeof x === "string" && x.trim()); return [c, v.length ? v.filter(x => idDe(x, prefixe)).length / v.length : 0, v.length];
  }).filter(([, s, n]) => s >= 0.8 && n).sort((a, b) => b[1] - a[1]).map(([c]) => c)[0] || null;

  /* ---------- Analyse (rien n'est écrit) ---------- */
  async function analyser() {
    const ctx = await contexte();
    const table = ctx.cibles.includes(choixTable) ? choixTable : ctx.parDefaut;
    if (!table) throw new Error("Aucun référentiel des établissements dans le document : terminez d'abord l'installation.");
    const [fE, fS, fA, fF] = await Promise.all([classeur.lire(FEUILLES.etab), classeur.lire(FEUILLES.sites), classeur.lire(FEUILLES.alias), classeur.lire(FEUILLES.fusions)]);
    if (!fE || !fE.entetes.includes("Établissement ID")) throw new Error(`Onglet « ${FEUILLES.etab} » (avec la colonne « Établissement ID ») introuvable dans ce classeur. Onglets lus : ${classeur.noms.join(", ")}.`);
    const tm = ctx.meta[table], esp = ctx.esp.find(e => e.referentiel === table) || {};
    const roles = S.resoudreRoles("referentiel", tm, { reponses: esp.reponses, referentiel: table }, table === ctx.g.referentiel ? ((ctx.config.valeurs.roles || {}).referentiel) || {} : {}, {});
    const existant = await grist.docApi.fetchTable(table);

    // colonnes : identifiant détecté sur le contenu si son nom diffère
    const colIdEx = colonneIdentifiants(existant, "ETAB");
    const pE = plan(tm, CHAMPS_ETAB.map(c => c.cleRef && colIdEx ? { ...c, id: colIdEx } : c), fE.entetes, optionsCochees.etab, roles, table, table);
    const champ = id => pE.lignes.find(l => l.id === id || (l.cleRef && id === "cle")) || null;
    const lCle = pE.lignes.find(l => l.cleRef), lRatt = pE.lignes.find(l => l.ratt);
    // coordonnées et origine : rôles, sinon colonnes créées
    const coord = r => { const c = roles[r] && roles[r].col; if (c && tm.colonnes[c] && !tm.colonnes[c].isFormula) return { col: c, meta: tm.colonnes[c] };
      if (c) return null; const m = { colId: r, type: "Numeric", label: r, isFormula: false, widgetOptions: "" }; pE.creer.push(m); return { col: r, meta: m, cree: true }; };
    const cLat = coord("Latitude"), cLon = coord("Longitude");
    const cOrig = roles.Origine && roles.Origine.col && !tm.colonnes[roles.Origine.col].isFormula ? { col: roles.Origine.col, meta: tm.colonnes[roles.Origine.col] } : null;

    // rapprochement des lignes existantes : identifiant, puis UAI, puis nom
    const colUai = (champ("UAI") || {}).col, colNoms = [(champ("Nom") || {}).col, (champ("Libelle_consolide") || {}).col, roles.Nom && roles.Nom.col].filter(c => c && existant[c]);
    const idx = { id: new Map(), uai: new Map(), nom: new Map() };
    existant.id.forEach((rid, i) => {
      const k = lCle && existant[lCle.col] ? idDe(existant[lCle.col][i], "ETAB") : null; if (k && !idx.id.has(k)) idx.id.set(k, rid);
      const u = colUai && existant[colUai] ? String(existant[colUai][i] || "").trim().toUpperCase() : ""; if (u && !idx.uai.has(u)) idx.uai.set(u, rid);
      colNoms.forEach(c => { const n = nomNorm(existant[c][i]); if (n && !idx.nom.has(n)) idx.nom.set(n, rid); });
    });
    const pos = new Map(existant.id.map((rid, i) => [rid, i])), utilises = new Set();
    const lignes = fE.lignes.filter(l => idDe(l["Établissement ID"], "ETAB")).map(l => ({ l, id: idDe(l["Établissement ID"], "ETAB"), ex: null, mode: "" }));
    const essayer = (o, mode, k, carte) => { if (o.ex || !k) return; const rid = carte.get(k); if (rid != null && !utilises.has(rid)) { o.ex = rid; o.mode = mode; utilises.add(rid); } };
    lignes.forEach(o => essayer(o, "identifiant", o.id, idx.id));
    lignes.forEach(o => essayer(o, "UAI", String(o.l.UAI || "").trim().toUpperCase(), idx.uai));
    lignes.forEach(o => [o.l["Nom (source)"], o.l.Nom, o.l["Libellé consolidé (liste déroulante)"]].forEach(n => essayer(o, "nom", nomNorm(n), idx.nom)));
    const parId = new Map(lignes.map(o => [o.id, o]));

    // lignes fusionnées : ligne existante absorbée par un établissement conservé
    const absorbees = [];
    if (fF) for (const l of fF.lignes) {
      const sup = idDe(l["Ligne supprimée"], "ETAB"), vers = idDe(l["Fusionnée dans"], "ETAB"); if (!sup || !vers || !parId.has(vers)) continue;
      const o = { id: sup, ex: null }; essayer(o, "identifiant", sup, idx.id); essayer(o, "UAI", String(l.UAI || "").trim().toUpperCase(), idx.uai); essayer(o, "nom", nomNorm(l.Nom), idx.nom);
      if (o.ex) absorbees.push({ ex: o.ex, sup, vers, nom: String(l["Nom retenu"] || parId.get(vers).l.Nom || "") });
    }

    // sites (pour les coordonnées des établissements, puis leur propre import)
    const sitesL = fS ? fS.lignes.filter(l => idDe(l["Site ID"], "SITE")) : [];
    const sitesParId = new Map(sitesL.map(l => [idDe(l["Site ID"], "SITE"), l]));
    const sitesDeEtab = new Map();
    sitesL.forEach(l => { const comp = idDe(l["Composante concernée"], "ETAB"), e = idDe(l["Établissement ID"], "ETAB"), k = comp || e; if (!k) return;
      if (!sitesDeEtab.has(k)) sitesDeEtab.set(k, []); sitesDeEtab.get(k).push(l); });
    const num = v => { const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) && v !== null && v !== "" ? n : null; };
    function coordonneesDe(o) {
      const corr = String(o.l["Site(s) correspondant(s)"] || "").match(/SITE-\d+/g) || [];
      for (const s of corr) { const l = sitesParId.get(s); if (l && num(l.Latitude) != null) return [num(l.Latitude), num(l.Longitude), l]; }
      const cands = (sitesDeEtab.get(o.id) || []).filter(l => num(l.Latitude) != null && num(l.Longitude) != null);
      const commune = nomNorm(o.l.Commune).replace(/\s\d+(e|er)$/, "");
      const note = l => (commune && nomNorm(l.Commune).startsWith(commune) ? 4 : 0) + (/valid/i.test(l.Statut || "") ? 1 : 0) + (/centre/i.test(l["Précision des coordonnées"] || "") ? 0 : 1);
      const meilleurs = cands.filter(l => cands.length === 1 || (commune && nomNorm(l.Commune).startsWith(commune))).sort((a, b) => note(b) - note(a));
      return meilleurs[0] ? [num(meilleurs[0].Latitude), num(meilleurs[0].Longitude), meilleurs[0]] : null;
    }

    // valeurs à écrire
    const nouveauxChoix = new Map(), conv = convertisseur(nouveauxChoix, resolveurTexte());
    const ajouts = [], majs = [], parMode = { identifiant: 0, UAI: 0, nom: 0 };
    let inchanges = 0, coordsCompletees = 0;
    for (const o of lignes) {
      const f = {};
      for (const c of pE.lignes) {
        if (!c.col || c.ratt) continue;
        const v = c.cleRef ? o.id : await conv(c.meta, o.l[c.entete]);
        if (v !== undefined) f[c.col] = v;
      }
      if (cLat && cLon) {
        const i = o.ex != null ? pos.get(o.ex) : -1, a = i >= 0 ? (existant[cLat.col] || [])[i] : null, b = i >= 0 ? (existant[cLon.col] || [])[i] : null;
        if ((vide(a) || a === 0) && (vide(b) || b === 0)) { const xy = coordonneesDe(o); if (xy) { f[cLat.col] = xy[0]; f[cLon.col] = xy[1]; coordsCompletees++; } }
      }
      o.ratt = lRatt && lRatt.col ? idDe(o.l[lRatt.entete], "ETAB") : null;
      o.rattTexte = lRatt && lRatt.col ? o.l[lRatt.entete] : null;
      if (o.ex == null) { if (cOrig) f[cOrig.col] = await conv(cOrig.meta, ORIGINE); ajouts.push({ o, f }); continue; }
      parMode[o.mode]++;
      const i = pos.get(o.ex), diff = {};
      for (const [k, v] of Object.entries(f)) if (!memeValeur(existant[k] ? existant[k][i] : undefined, v)) diff[k] = v;
      if (Object.keys(diff).length) majs.push({ o, id: o.ex, f: diff }); else inchanges++;
    }
    const absentes = existant.id.filter(rid => !utilises.has(rid) && !absorbees.some(a => a.ex === rid));
    const nomEx = rid => { const i = pos.get(rid); return colNoms.map(c => existant[c][i]).find(v => !vide(v)) || `ligne ${rid}`; };

    // références vers les lignes absorbées (signalements, sites, correspondances…)
    const aRef = new Set(absorbees.map(a => a.ex)), references = [];
    if (absorbees.length) for (const [t, m] of Object.entries(ctx.meta)) {
      if (t.startsWith("_grist")) continue;
      const cols = Object.values(m.colonnes).filter(c => !c.isFormula && (c.type === `Ref:${table}` || c.type === `RefList:${table}`) && !(t === table && lRatt && c.colId === lRatt.col));
      if (!cols.length) continue;
      const d = await grist.docApi.fetchTable(t);
      for (const c of cols) (d[c.colId] || []).forEach((v, i) => {
        const ids = c.type.startsWith("RefList") ? (Array.isArray(v) ? v.slice(v[0] === "L" ? 1 : 0) : []) : [refId(v)];
        if (ids.some(x => aRef.has(x))) references.push({ table: t, col: c.colId, id: d.id[i], liste: c.type.startsWith("RefList"), valeur: v });
      });
    }

    // référentiel des sites
    let sites = null;
    if (sitesL.length) {
      const tS = tableSitesDe(ctx, table), tmS = tS ? ctx.meta[tS] : null;
      const exS = tS ? await grist.docApi.fetchTable(tS) : { id: [] };
      const colIdS = colonneIdentifiants(exS, "SITE");
      const pS = plan(tmS, CHAMPS_SITES.filter(c => !SITES_IGNORES.includes(c.entete)).map(c => c.cleRef && colIdS ? { ...c, id: colIdS } : c),
        fS.entetes.filter(h => !SITES_IGNORES.includes(h)), optionsCochees.sites, {}, tS || TABLE_SITES, table);
      const lS = id => pS.lignes.find(l => l.id === id || (l.cleRef && id === "cle") || (l.nom && id === "nom") || (l.etab && l.entete === "Établissement ID" && id === "etab")) || {};
      const cActif = tmS && tmS.colonnes.Actif && tmS.colonnes.Actif.type === "Bool" ? "Actif" : (!tmS ? "Actif" : null);
      if (!tmS) pS.creer.push({ colId: "Actif", type: "Bool", label: "Actif", isFormula: false, widgetOptions: "" });
      const kS = lS("cle").col, nS = lS("nom").col, eS = lS("etab").col;
      const idxS = new Map(), idxN = new Map(), posS = new Map(exS.id.map((rid, i) => [rid, i]));
      exS.id.forEach((rid, i) => { const k = kS && exS[kS] ? idDe(exS[kS][i], "SITE") : null; if (k && !idxS.has(k)) idxS.set(k, rid);
        const n = nS && exS[nS] && eS && exS[eS] ? `${refId(exS[eS][i])}|${nomNorm(exS[nS][i])}` : null; if (n && !idxN.has(n)) idxN.set(n, rid); });
      const prisS = new Set(), ajoutsS = [], majsS = [];
      let inchS = 0;
      const nvChoixS = new Map(), convS = convertisseur(nvChoixS, resolveurTexte());
      for (const l of sitesL) {
        const sid = idDe(l["Site ID"], "SITE"), eid = idDe(l["Établissement ID"], "ETAB"), oe = parId.get(eid);
        let ex = idxS.get(sid); if (ex != null && prisS.has(ex)) ex = null;
        if (ex == null && oe && oe.ex != null) { const r = idxN.get(`${oe.ex}|${nomNorm(l["Nom du site"])}`); if (r != null && !prisS.has(r)) ex = r; }
        if (ex != null) prisS.add(ex);
        const f = {}, refs = {};
        for (const c of pS.lignes) {
          if (!c.col) continue;
          if (c.etab) { const r = idDe(l[c.entete], "ETAB"); if (r) refs[c.col] = r; continue; }
          const v = c.cleRef ? sid : await convS(c.meta, l[c.entete]);
          if (v !== undefined) f[c.col] = v;
        }
        if (ex == null) { if (cActif) f[cActif] = true; ajoutsS.push({ sid, f, refs }); continue; }
        const i = posS.get(ex), diff = {};
        for (const [k, v] of Object.entries(f)) if (!memeValeur(exS[k] ? exS[k][i] : undefined, v)) diff[k] = v;
        majsS.push({ sid, id: ex, f: diff, refs, avant: Object.fromEntries(Object.keys(refs).map(k => [k, exS[k] ? refId(exS[k][i]) : null])) });
      }
      sites = { table: tS || TABLE_SITES, cree: !tS, plan: pS, ajouts: ajoutsS, majs: majsS, nouveauxChoix: nvChoixS, cleCol: kS, ex: exS,
        absents: exS.id.filter(rid => !prisS.has(rid)).map(rid => String(nS && exS[nS] ? exS[nS][posS.get(rid)] ?? "" : rid)) };
      inchS = majsS.filter(m => !Object.keys(m.f).length).length; sites.inchanges = inchS;
    }

    // correspondances (sites saisis dans la base d'octobre)
    let alias = null;
    if (fA && sites) {
      const exA = ctx.meta[TABLE_ALIAS] ? await grist.docApi.fetchTable(TABLE_ALIAS) : null, idxA = new Map();
      if (exA) exA.id.forEach((rid, i) => idxA.set(`${refId((exA.Etablissement || [])[i]) || 0}|${nomNorm((exA.Libelle || [])[i])}`, { rid, statut: String((exA.Statut || [])[i] || ""), site: refId((exA.Site || [])[i]) }));
      const lignesA = [], vus = new Set();
      let decides = 0;
      for (const l of fA.lignes) {
        const eid = idDe(l["Établissement ID"], "ETAB"), lib = String(l["Site saisi"] ?? "").trim(); if (!eid || !lib || !parId.has(eid)) continue;
        const sid = idDe(l["Site ID"], "SITE"), oe = parId.get(eid), k = `${eid}|${nomNorm(lib)}`; if (vus.has(k)) continue; vus.add(k);
        const deja = oe.ex != null ? idxA.get(`${oe.ex}|${nomNorm(lib)}`) : null;
        if (deja && /valid|cart/i.test(deja.statut)) { decides++; continue; }
        lignesA.push({ eid, lib, sid, statut: sid ? "Validé" : "Écarté", deja });
      }
      alias = { cree: !exA, lignes: lignesA, decides };
    }

    return { ctx, table, tm, plan: pE, cLat, cLon, lCle, lRatt, existant, lignes, parId, ajouts, majs, inchanges, parMode, coordsCompletees, absorbees, references,
      absentes: absentes.map(nomEx), nouveauxChoix, sites, alias,
      stats: { etab: lignes.length, niveaux: lignes.reduce((a, o) => { const n = String(o.l.Niveau || "?"); a[n] = (a[n] || 0) + 1; return a; }, {}) } };
  }

  /* ---------- Rendu ---------- */
  function dessiner(message, type) {
    if (!racine) return;
    const a = analyse;
    const ligneT = (lib, val) => `<tr><td>${lib}</td><td>${val}</td></tr>`;
    const colonnes = (p, t) => p.creer.length ? `<p class="aide">Colonnes créées dans ${esc(t)} : ${p.creer.map(c => `<code>${esc(c.colId)}</code>`).join(" ")}</p>` : "";
    const formules = p => { const f = p.lignes.filter(l => l.formule); return f.length ? `<p class="aide">Colonnes formules laissées telles quelles : ${f.map(l => `<code>${esc(l.formule)}</code>`).join(" ")}</p>` : ""; };
    const facultatifs = (p, cleOpt) => p.facultatifs.length ? `<details class="esr-options"><summary>Autres colonnes du classeur (${p.facultatifs.length}) : cochées, elles sont reprises dans Grist</summary>
      <div class="esr-cases">${p.facultatifs.map(f => `<label><input type="checkbox" data-opt="${cleOpt}" value="${esc(f.entete)}"${f.formule ? " disabled" : ""}${(optionsCochees[cleOpt] ? optionsCochees[cleOpt].includes(f.entete) : f.existante) ? " checked" : ""}> ${esc(f.entete)}${f.existante ? ` <span class="aide">(${f.formule ? "formule" : "colonne existante"})</span>` : ""}</label>`).join("")}</div></details>` : "";
    racine.innerHTML = `<h2>Référentiel de l'enseignement supérieur (classeur)</h2>
      <p class="aide">Import du classeur consolidé des établissements, composantes et sites (onglets « ${FEUILLES.etab} », « ${FEUILLES.sites} », « ${FEUILLES.alias} », « ${FEUILLES.fusions} »).
        Les lignes sont rapprochées par identifiant (ETAB-…, SITE-…), puis UAI, puis nom : les existantes sont mises à jour, les nouvelles ajoutées. Rien n'est supprimé, une cellule vide n'efface rien.
        Un bilan s'affiche avant toute écriture ; un classeur corrigé peut être réimporté.</p>
      <div class="esr-outils">
        <label>Classeur <input type="file" id="esr-fichier" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></label>
        ${a && a.ctx.cibles.length > 1 ? `<label>Référentiel des établissements <select id="esr-table">${a.ctx.cibles.map(t => `<option${t === a.table ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></label>` : ""}
      </div>
      ${nomFichier && !a && !message ? `<p class="aide">Lecture de ${esc(nomFichier)}…</p>` : ""}
      ${a ? `
      <h3 class="esr-titre">Établissements → ${esc(a.table)}</h3>
      <table class="eq-table esr-bilan"><tbody>
        ${ligneT("Lignes du classeur", `<strong>${nf(a.stats.etab)}</strong> <span class="aide">(${Object.entries(a.stats.niveaux).map(([k, n]) => `${esc(k)} : ${nf(n)}`).join(", ")})</span>`)}
        ${ligneT("À ajouter", `<strong>${nf(a.ajouts.length)}</strong>`)}
        ${ligneT("À mettre à jour", `<strong>${nf(a.majs.length)}</strong> <span class="aide">rapprochées : ${nf(a.parMode.identifiant)} par identifiant, ${nf(a.parMode.UAI)} par UAI, ${nf(a.parMode.nom)} par nom</span>`)}
        ${ligneT("Inchangées", nf(a.inchanges))}
        ${ligneT("Coordonnées reprises d'un site", `${nf(a.coordsCompletees)} <span class="aide">(établissements sans coordonnées : site de la même commune)</span>`)}
        ${a.absorbees.length ? ligneT("Lignes fusionnées", `${nf(a.absorbees.length)} ligne(s) existante(s) absorbée(s) par un autre établissement : marquées dans la colonne État, conservées.
          ${a.references.length ? `<br><label><input type="checkbox" id="esr-reporter"${reporter ? " checked" : ""}> reporter les ${nf(a.references.length)} référence(s) (signalements, sites…) sur l'établissement conservé</label>` : ""}`) : ""}
        ${a.absentes.length ? ligneT("Lignes absentes du classeur", `${nf(a.absentes.length)} <span class="aide">conservées : ${a.absentes.slice(0, 12).map(esc).join(" ; ")}${a.absentes.length > 12 ? " ; …" : ""}</span>`) : ""}
        ${a.nouveauxChoix.size ? ligneT("Choix ajoutés", [...a.nouveauxChoix].map(([c, s]) => `<code>${esc(c)}</code> : ${[...s].slice(0, 8).map(esc).join(", ")}${s.size > 8 ? "…" : ""}`).join("<br>")) : ""}
      </tbody></table>
      ${colonnes(a.plan, a.table)}${formules(a.plan)}${facultatifs(a.plan, "etab")}
      ${a.sites ? `<h3 class="esr-titre">Campus et sites → ${esc(a.sites.table)}${a.sites.cree ? " <span class=\"pastille reco\">table créée</span>" : ""}</h3>
      <table class="eq-table esr-bilan"><tbody>
        ${ligneT("Sites du classeur", `<strong>${nf(a.sites.ajouts.length + a.sites.majs.length)}</strong>`)}
        ${ligneT("À ajouter", `<strong>${nf(a.sites.ajouts.length)}</strong>`)}
        ${ligneT("Existants", `${nf(a.sites.majs.length)} <span class="aide">(dont ${nf(a.sites.inchanges)} sans changement de valeur)</span>`)}
        ${a.sites.absents.length ? ligneT("Sites absents du classeur", `${nf(a.sites.absents.length)} <span class="aide">conservés : ${a.sites.absents.slice(0, 12).map(esc).join(" ; ")}${a.sites.absents.length > 12 ? " ; …" : ""}</span>`) : ""}
      </tbody></table>${a.sites.cree ? "" : colonnes(a.sites.plan, a.sites.table)}${formules(a.sites.plan)}${facultatifs(a.sites.plan, "sites")}` : `<p class="aide">Pas d'onglet « ${FEUILLES.sites} » : sites non importés.</p>`}
      ${a.alias ? `<h3 class="esr-titre">Sites saisis dans la base d'octobre → ${TABLE_ALIAS}${a.alias.cree ? " <span class=\"pastille reco\">table créée</span>" : ""}</h3>
        <p>${nf(a.alias.lignes.filter(l => l.statut === "Validé").length)} correspondance(s) libellé saisi → site, ${nf(a.alias.lignes.filter(l => l.statut !== "Validé").length)} saisie(s) visant l'établissement entier (écartées)${a.alias.decides ? `, ${nf(a.alias.decides)} déjà décidée(s) dans Grist (inchangées)` : ""}.</p>` : ""}
      <div class="boutons"><button class="primaire" id="esr-importer"${enCours ? " disabled" : ""}>Importer dans Grist</button><span class="statut${type ? ` ${type}` : ""}" id="esr-statut" role="status">${esc(message || "")}</span></div>`
      : message ? `<p class="statut ${type || ""}" id="esr-statut" role="status">${esc(message)}</p>` : ""}`;
    lier();
  }
  function lier() {
    const f = $("esr-fichier");
    if (f) f.addEventListener("change", async () => {
      const fichier = f.files && f.files[0]; if (!fichier) return;
      nomFichier = fichier.name; classeur = null; analyse = null; optionsCochees.etab = optionsCochees.sites = null; dessiner();
      try { classeur = await lireClasseur(fichier); } catch (e) { dessiner(e.message || String(e), "err"); return; }
      await relancer();
    });
    const t = $("esr-table"); if (t) t.addEventListener("change", () => { choixTable = t.value; optionsCochees.etab = optionsCochees.sites = null; relancer(); });
    const r = $("esr-reporter"); if (r) r.addEventListener("change", () => { reporter = r.checked; });
    racine.querySelectorAll("[data-opt]").forEach(c => c.addEventListener("change", () => {
      const k = c.dataset.opt; optionsCochees[k] = [...racine.querySelectorAll(`[data-opt="${k}"]:checked`)].map(x => x.value);
      const ouverts = [...racine.querySelectorAll("details.esr-options")].map(d => d.open);
      relancer().then(() => racine.querySelectorAll("details.esr-options").forEach((d, i) => { if (ouverts[i]) d.open = true; }));
    }));
    const b = $("esr-importer"); if (b) b.addEventListener("click", importer);
  }
  async function relancer(message, type) {
    if (!classeur) { dessiner(message, type); return; }
    try { analyse = await analyser(); dessiner(message, type); }
    catch (e) { analyse = null; dessiner(e.message || String(e), "err"); }
  }
  const dire = (t, type) => { const s = $("esr-statut"); if (s) { s.textContent = t; s.className = `statut ${type || ""}`; } };

  /* ---------- Import ---------- */
  const actions = acts => grist.docApi.applyUserActions(acts);
  async function parLots(acts, quoi) {
    for (let k = 0; k < acts.length; k += LOT) { dire(`${quoi} : ${nf(Math.min(k + LOT, acts.length))} / ${nf(acts.length)}…`); await actions(acts.slice(k, k + LOT)); }
  }
  async function ajouterLignes(table, lignes, quoi) {
    const cols = [...new Set(lignes.flatMap(f => Object.keys(f)))];
    for (let k = 0; k < lignes.length; k += LOT) {
      const lot = lignes.slice(k, k + LOT);
      dire(`${quoi} : ${nf(Math.min(k + LOT, lignes.length))} / ${nf(lignes.length)}…`);
      await actions([["BulkAddRecord", table, lot.map(() => null), Object.fromEntries(cols.map(c => [c, lot.map(f => f[c] === undefined ? null : f[c])]))]]);
    }
  }
  async function etendreChoix(table, carte) {
    if (!carte.size) return;
    const meta = await S.lireMeta(), acts = [];
    for (const [c, s] of carte) {
      const m = meta[table] && meta[table].colonnes[c]; if (!m || !/^Choice/.test(m.type)) continue;
      let o = {}; try { o = JSON.parse(m.widgetOptions || "{}") || {}; } catch (_) { o = {}; }
      const ch = Array.isArray(o.choices) ? o.choices : [];
      acts.push(["ModifyColumn", table, c, { widgetOptions: JSON.stringify({ ...o, choices: ch.concat([...s].filter(x => !ch.includes(x))) }) }]);
    }
    if (acts.length) await actions(acts);
  }
  async function importer() {
    if (!analyse || enCours) return;
    enCours = true; const b = $("esr-importer"); if (b) b.disabled = true;
    const a = analyse, table = a.table;
    try {
      let tablesCreees = false;
      // 1. colonnes du référentiel des établissements
      if (a.plan.creer.length) await actions(a.plan.creer.map(c => ["AddColumn", table, c.colId, { type: c.type, label: c.label, isFormula: false, untieColIdFromLabel: true }]));
      const niveau = a.plan.lignes.find(l => l.id === "Niveau" && l.cree);
      if (niveau && !a.nouveauxChoix.has(niveau.col)) a.nouveauxChoix.set(niveau.col, new Set(Object.keys(a.stats.niveaux)));
      await etendreChoix(table, a.nouveauxChoix);
      // 2. nouveaux établissements, puis identifiants de lignes
      await ajouterLignes(table, a.ajouts.map(x => x.f), "Établissements ajoutés");
      const colCle = a.lCle && a.lCle.col;
      const t2 = await grist.docApi.fetchTable(table), rowDe = new Map();
      if (colCle && t2[colCle]) t2.id.forEach((rid, i) => { const k = idDe(t2[colCle][i], "ETAB"); if (k && !rowDe.has(k)) rowDe.set(k, rid); });
      a.lignes.forEach(o => { if (o.ex != null) rowDe.set(o.id, o.ex); });
      const pos2 = new Map(t2.id.map((rid, i) => [rid, i]));
      // 3. mises à jour, rattachements, lignes absorbées
      const champs = new Map(a.majs.map(m => [m.id, { ...m.f }]));
      const champsDe = rid => { if (!champs.has(rid)) champs.set(rid, {}); return champs.get(rid); };
      if (a.lRatt && a.lRatt.col) {
        const m = (await S.lireMeta())[table].colonnes[a.lRatt.col], estRef = m && m.type === `Ref:${table}`;
        for (const o of a.lignes) {
          const rid = rowDe.get(o.id); if (rid == null) continue;
          const v = estRef ? (o.ratt ? rowDe.get(o.ratt) || null : null) : (vide(o.rattTexte) ? null : String(o.rattTexte));
          if (v == null) continue;
          const avant = t2[a.lRatt.col] ? t2[a.lRatt.col][pos2.get(rid)] : null;
          if (!memeValeur(estRef ? refId(avant) : avant, v)) champsDe(rid)[a.lRatt.col] = v;
        }
      }
      const colEtat = (a.plan.lignes.find(l => l.id === "Etat") || {}).col;
      for (const x of a.absorbees) {
        const f = champsDe(x.ex);
        if (colEtat) f[colEtat] = `Fusionnée dans ${x.vers}${x.nom ? ` (${x.nom})` : ""}`;
        if (colCle && vide(t2[colCle] && t2[colCle][pos2.get(x.ex)])) f[colCle] = x.sup;
      }
      await parLots([...champs].filter(([, f]) => Object.keys(f).length).map(([rid, f]) => ["UpdateRecord", table, rid, f]), "Établissements mis à jour");
      // 4. références vers les lignes absorbées
      let reportees = 0;
      if (reporter && a.references.length) {
        const vers = new Map(a.absorbees.map(x => [x.ex, rowDe.get(x.vers)]).filter(([, r]) => r != null));
        const acts = a.references.map(r => {
          const v = r.liste ? ["L", ...[...new Set((Array.isArray(r.valeur) ? r.valeur.slice(r.valeur[0] === "L" ? 1 : 0) : []).map(x => vers.get(x) || x))]] : (vers.get(refId(r.valeur)) || refId(r.valeur));
          return ["UpdateRecord", r.table, r.id, { [r.col]: v }];
        });
        await parLots(acts, "Références reportées"); reportees = acts.length;
      }
      // 5. sites
      let nSitesA = 0, nSitesM = 0;
      const siteDe = new Map();
      if (a.sites) {
        const s = a.sites;
        if (s.cree) {
          await actions([["AddTable", s.table, s.plan.creer.map(c => ({ id: c.colId, type: c.type, isFormula: false }))]]);
          // libellés : identifiant détaché du libellé d'abord, sinon Grist renommerait la colonne
          await actions(s.plan.creer.flatMap(c => [["ModifyColumn", s.table, c.colId, { untieColIdFromLabel: true }], ["ModifyColumn", s.table, c.colId, { label: c.label }]]));
          tablesCreees = true;
        } else if (s.plan.creer.length) await actions(s.plan.creer.map(c => ["AddColumn", s.table, c.colId, { type: c.type, label: c.label, isFormula: false, untieColIdFromLabel: true }]));
        await etendreChoix(s.table, s.nouveauxChoix);
        const avecRefs = (f, refs) => { const r = { ...f }; for (const [c, eid] of Object.entries(refs)) { const rid = rowDe.get(eid); if (rid != null) r[c] = rid; } return r; };
        await ajouterLignes(s.table, s.ajouts.map(x => avecRefs(x.f, x.refs)), "Sites ajoutés"); nSitesA = s.ajouts.length;
        const acts = [];
        for (const m of s.majs) {
          const f = { ...m.f };
          for (const [c, eid] of Object.entries(m.refs)) { const rid = rowDe.get(eid); if (rid != null && rid !== m.avant[c]) f[c] = rid; }
          if (Object.keys(f).length) acts.push(["UpdateRecord", s.table, m.id, f]);
        }
        await parLots(acts, "Sites mis à jour"); nSitesM = acts.length;
        const tS = await grist.docApi.fetchTable(s.table), kS = (s.plan.lignes.find(l => l.cleRef) || {}).col;
        if (kS && tS[kS]) tS.id.forEach((rid, i) => { const k = idDe(tS[kS][i], "SITE"); if (k && !siteDe.has(k)) siteDe.set(k, rid); });
      }
      // 6. correspondances
      let nAlias = 0;
      if (a.alias && a.alias.lignes.length) {
        const meta = await S.lireMeta();
        if (!meta[TABLE_ALIAS]) {
          await actions([["AddTable", TABLE_ALIAS, [["Etablissement", `Ref:${table}`], ["Libelle", "Text"], ["Site", `Ref:${a.sites.table}`], ["Occurrences", "Int"], ["Statut", "Choice"]].map(([id, type]) => ({ id, type, isFormula: false }))]]);
          await actions([["ModifyColumn", TABLE_ALIAS, "Statut", { widgetOptions: JSON.stringify({ choices: ["À valider", "Validé", "Écarté"], choiceOptions: { "Validé": { fillColor: "#B8FEC9" }, "Écarté": { fillColor: "#EEEEEE" } } }) }]]);
          tablesCreees = true;
        }
        const acts = [], ajouts = [];
        for (const l of a.alias.lignes) {
          const e = rowDe.get(l.eid); if (e == null) continue;
          const f = { Etablissement: e, Libelle: l.lib, Site: l.sid ? siteDe.get(l.sid) || 0 : 0, Statut: l.sid && siteDe.get(l.sid) ? "Validé" : "Écarté" };
          if (l.deja) acts.push(["UpdateRecord", TABLE_ALIAS, l.deja.rid, f]); else ajouts.push(f);
        }
        await parLots(acts, "Correspondances mises à jour"); await ajouterLignes(TABLE_ALIAS, ajouts, "Correspondances ajoutées");
        nAlias = acts.length + ajouts.length;
      }
      // 7. trace dans Config, règles d'accès des tables créées
      const config = await S.lireConfig();
      await actions([S.actionConfig(config, "referentiel_esr", { fichier: nomFichier, table, sites: a.sites ? a.sites.table : null, derniere_mise_a_jour: Date.now() / 1000,
        etablissements: a.stats.etab, ajoutes: a.ajouts.length, sites_importes: a.sites ? a.sites.ajouts.length + a.sites.majs.length : 0 })]);
      let acces = "";
      if (tablesCreees && window.OngletAcces && window.OngletAcces.reappliquerSiBesoin) {
        try { const r = await window.OngletAcces.reappliquerSiBesoin(); if (r && ["incomplet", "refusees", "illisibles"].includes(r.etat)) acces = ` Règles d'accès : ${r.texte}`; } catch (e) { acces = ` Règles d'accès non appliquées (${e.message || e}).`; }
      }
      if (S.viderCacheLecture) S.viderCacheLecture();
      const bilan = `Import terminé : ${nf(a.ajouts.length)} établissement(s) ajouté(s), ${nf(champs.size)} mis à jour${reportees ? `, ${nf(reportees)} référence(s) reportée(s)` : ""}`
        + (a.sites ? `, ${nf(nSitesA)} site(s) ajouté(s), ${nf(nSitesM)} mis à jour` : "") + (nAlias ? `, ${nf(nAlias)} correspondance(s)` : "") + "." + acces;
      enCours = false;
      await relancer(bilan, acces ? "err" : "ok");
      if (window.OngletSitesESR) window.OngletSitesESR.afficher();
    } catch (e) {
      enCours = false;
      dire(`Import interrompu : ${e.message || e}. Relancez l'import : les lignes déjà écrites seront reconnues.`, "err");
      const b2 = $("esr-importer"); if (b2) b2.disabled = false;
    }
  }

  async function afficher() {
    racine = $("ref-esr"); if (!racine) return;
    if (classeur) { await relancer(); return; }
    let ctx = null;
    try { ctx = await contexte(); } catch (e) { racine.innerHTML = `<h2>Référentiel de l'enseignement supérieur (classeur)</h2><p class="statut err">${esc(e.message || e)}</p>`; return; }
    let info = "";
    const r = ctx.config.valeurs.referentiel_esr;
    if (r && r.derniere_mise_a_jour) info = `Dernier import : ${new Date(r.derniere_mise_a_jour * 1000).toLocaleString("fr-FR")}, ${r.fichier ? `« ${r.fichier} », ` : ""}${nf(r.etablissements)} ligne(s) dans ${r.table}.`;
    dessiner();
    if (info) racine.querySelector(".esr-outils").insertAdjacentHTML("afterend", `<p class="aide">${esc(info)}</p>`);
  }
  window.OngletReferentielESR = { afficher, lireClasseur };
})();
