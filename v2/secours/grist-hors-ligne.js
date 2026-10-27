/* =====================================================================
   Grist hors ligne — mode secours du widget de saisie
   ---------------------------------------------------------------------
   Remplace grist-plugin-api.js quand Grist est injoignable (panne réseau).
   Le vrai widget de saisie (v2/saisie) tourne tel quel : il croit parler à
   Grist, et ce module lui répond à partir :
     1. d'une copie du document (« instantané ») : fichier .grist téléchargé
        depuis Grist, ou .json ;
     2. des saisies faites pendant la panne, tenues dans un journal par poste.
   La copie peut être en deux couches, déposées dans le dossier partagé (par n8n,
   ou à la main) : une base (instantane-base.grist ou .json : référentiel et
   configuration, renouvelée une fois par jour) et un complément
   (instantane-dossiers.json : tables des réponses et autres tables qui bougent,
   renouvelé toutes les heures par le mode veille). Les tables du complément remplacent celles
   de la base. Le kit prend d'office les plus récentes.
   Mode veille (Grist accessible) : un poste garde le kit ouvert ; il demande les copies au relais n8n
   (relais-n8n.json : le navigateur ne peut pas lire Grist directement) et les écrit dans le dossier
   partagé, aux heures réglées, avec des garde-fous (contrôle avant d'écraser, copie précédente gardée).
   Chaque poste écrit son journal dans un dossier partagé (un fichier par
   poste, donc pas de conflit d'écriture) et lit ceux des autres : tous les
   postes voient les mêmes signalements. Sans dossier partagé, le poste
   travaille seul et garde tout dans le navigateur.
   Les lignes créées en mode secours ont des numéros à partir de 10^12
   (préfixe propre au poste), pour ne jamais se mélanger entre postes ; la
   réintégration dans Grist les renumérote.
   Assemblé avec le widget par outils/construire-secours.js.
   ===================================================================== */
(function () {
"use strict";

const KIT_VERSION = "0.2.0 (27/10/2026)";
const BASE_HORS_LIGNE = 1e12, PAR_POSTE = 1e6;
const PREFIXE_JOURNAL = "secours-journal-";
const DELAI_LECTURE = 20000;            // relecture du dossier partagé (ms)
const NOM_BASE = /^instantane-base\.(grist|json)(\.gz)?$/i, NOM_COMPLEMENT = /^instantane-dossiers\.json(\.gz)?$/i;
const F_DOSSIERS = "instantane-dossiers.json", F_PRECEDENT = "instantane-dossiers.precedent.json", F_BASE = "instantane-base.grist", F_EMPREINTE = "instantane-base.empreinte.json";
const RELAIS_DEFAUT = { url: "", cle: "", debut: 7, fin: 20, intervalle: 60 };

/* ---------- utilitaires ---------- */
const norm = s => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const slug = s => norm(s).replace(/ /g, "-").slice(0, 40) || "agent";
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16); }));
const heure = d => d ? new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";
const dateHeure = d => d ? new Date(d).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
const copie = v => (typeof structuredClone === "function" ? structuredClone(v) : JSON.parse(JSON.stringify(v)));
const attendre = ms => new Promise(r => setTimeout(r, ms));
function octetsDeBase64(b64) { const s = atob(b64), o = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) o[i] = s.charCodeAt(i); return o; }
function telecharger(nom, contenu, type) {
  const url = URL.createObjectURL(contenu instanceof Blob ? contenu : new Blob([contenu], { type: type || "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = nom; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/* ---------- journal d'activité du kit (Réglages › Journal) ---------- */
const traces = [];
function trace(msg) { traces.push(`[${heure(Date.now())}] ${msg}`); if (traces.length > 300) traces.shift(); console.info("[mode secours]", msg); if (UI.pret) UI.majTraces(); }

/* ---------- stockage du navigateur ---------- */
const BD = {
  db: null,
  ouvrir() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((ok, ko) => {
      const r = indexedDB.open("kit-secours", 1);
      r.onupgradeneeded = () => { const d = r.result; d.createObjectStore("kv"); d.createObjectStore("journal", { keyPath: "id" }); d.createObjectStore("base"); };
      r.onsuccess = () => { this.db = r.result; ok(this.db); }; r.onerror = () => ko(r.error);
    });
  },
  async op(store, mode, f) {
    const db = await this.ouvrir();
    return new Promise((ok, ko) => { const tx = db.transaction(store, mode), st = tx.objectStore(store); let res; const req = f(st); if (req) req.onsuccess = () => { res = req.result; }; tx.oncomplete = () => ok(res); tx.onerror = () => ko(tx.error); tx.onabort = () => ko(tx.error); });
  },
  lire(store, cle) { return this.op(store, "readonly", st => st.get(cle)); },
  ecrire(store, val, cle) { return this.op(store, "readwrite", st => cle === undefined ? st.put(val) : st.put(val, cle)); },
  tout(store) { return this.op(store, "readonly", st => st.getAll()); },
  vider(store) { return this.op(store, "readwrite", st => st.clear()); },
  suppr(store, cle) { return this.op(store, "readwrite", st => st.delete(cle)); },
};

/* ---------- état ---------- */
const K = {
  agent: "", posteNum: 0, seq: 0,
  base: null,        // { info: { nom, cle, source, fichier, genere_le, charge_le, modifie, auto }, tables }
  complement: null,  // { info: { fichier, genere_le, modifie, auto }, tables } : remplace des tables de la base
  reintegrees: new Set(),   // saisies déjà réintégrées dans Grist (Config, clé « secours », vue dans la copie)
  doc: null,         // document vivant : copie de la base + journaux appliqués
  page: null,        // page de saisie : { cle, titre, tableId, widgetOptions, mapping }
  pageTableau: null, // tableau de bord : même forme (widgetOptions.tableau = identifiant du tableau publié)
  journal: [],       // mes entrées
  autres: new Map(), // nom de fichier → { agent, poste, maj, mod, entrees }
  appliquees: new Set(), dernierT: "",
  dir: null, dirEtat: "aucun", dirErreur: "", derniereLecture: null, enAttente: 0,
  nouvelleBase: null,
  mode: "secours",   // « veille » : Grist accessible, le kit tient les copies à jour ; « secours » : saisie hors ligne
  relais: { ...RELAIS_DEFAUT },
  veille: { enCours: false, contact: null, echecs: 0, erreur: null, copie: null, refus: null, base: null, retour: null, ping: 0, evenements: [] },
  pret: false,
};
let resoudrePret; const pret = new Promise(r => { resoudrePret = r; });

/* ---------- métadonnées du document ---------- */
const M = { tables: new Map(), cols: new Map(), index: new Map() };
function indexerMeta() {
  M.tables = new Map(); M.cols = new Map(); M.index = new Map();
  const T = K.doc._grist_Tables, C = K.doc._grist_Tables_column;
  if (!T || !C) throw new Error("Document sans métadonnées (_grist_Tables) : ce n'est pas une copie de document Grist.");
  T.id.forEach((id, i) => M.tables.set(id, T.tableId[i]));
  const nomCol = new Map(C.id.map((id, i) => [id, C.colId[i]]));
  C.id.forEach((id, i) => {
    const tid = M.tables.get(C.parentId[i]); if (!tid) return;
    if (!M.cols.has(tid)) M.cols.set(tid, new Map());
    M.cols.get(tid).set(C.colId[i], { type: C.type[i] || "Any", isFormula: !!(C.isFormula && C.isFormula[i]), formula: (C.formula && C.formula[i]) || "", visible: C.visibleCol ? nomCol.get(C.visibleCol[i]) || null : null });
  });
}
const typeBase = t => String(t || "Any").split(":")[0];
const cibleRef = t => (/^Ref(List)?:/.test(t || "") ? t.split(":")[1] : null);
function indexLignes(tid) {
  let m = M.index.get(tid); if (m) return m;
  const t = K.doc[tid]; m = new Map(); if (t) t.id.forEach((id, i) => m.set(id, i));
  M.index.set(tid, m); return m;
}
function defaut(tid, c) {
  const d = (M.cols.get(tid) || new Map()).get(c); if (!d) return null;
  if (d.isFormula) return null;
  switch (typeBase(d.type)) { case "Text": case "Choice": return ""; case "Int": case "Numeric": case "Ref": case "ManualSortPos": case "PositionNumber": return 0; case "Bool": return false; default: return null; }
}

/* ---------- formules : seules les recopies simples ($Ref.Colonne) et quelques déclencheurs sont recalculés ---------- */
const FORMULE_CHEMIN = /^\s*\$(\w+(?:\.\w+)*)\s*$/;
function evaluerChemin(tid, i, chemin) {
  let t = tid, idx = i, v = null; const parts = chemin.split(".");
  for (let k = 0; k < parts.length; k++) {
    const col = K.doc[t] && K.doc[t][parts[k]]; if (!col) return null;
    v = col[idx]; if (k === parts.length - 1) break;
    const d = (M.cols.get(t) || new Map()).get(parts[k]), cible = d && cibleRef(d.type);
    if (!cible || !v) return null;
    t = cible; idx = indexLignes(t).get(v); if (idx === undefined) return null;
  }
  return Array.isArray(v) ? v.slice() : v;
}
function recalculerFormules() {
  for (const [tid, cols] of M.cols) {
    const t = K.doc[tid]; if (!t) continue;
    const simples = [...cols].filter(([, d]) => d.isFormula && FORMULE_CHEMIN.test(d.formula));
    if (!simples.length) continue;
    t.id.forEach((id, i) => { if (id < BASE_HORS_LIGNE) return; for (const [c, d] of simples) { if (!t[c]) t[c] = t.id.map(() => null); t[c][i] = evaluerChemin(tid, i, d.formula.match(FORMULE_CHEMIN)[1]); } });
  }
}
function valeurDeclencheur(d, entree) {
  const f = d.formula || "";
  if (/user\.(Email|Name)/.test(f)) return `Mode secours : ${entree.agent || "agent"}`;
  if (/^\s*NOW\(\)\s*$/.test(f)) return Date.parse(entree.t) / 1000;
  if (/^\s*TODAY\(\)\s*$/.test(f)) { const j = new Date(entree.t); return Date.UTC(j.getFullYear(), j.getMonth(), j.getDate()) / 1000; }
  if (/UUID\(\)/.test(f)) return uuid();
  return undefined;
}

/* ---------- actions utilisateur ---------- */
function ajouterLigne(tid, id, champs, entree) {
  const t = K.doc[tid]; if (!t) throw new Error(`table inconnue : ${tid}`);
  const idx = indexLignes(tid); if (idx.has(id)) return;   // déjà appliquée (rejeu)
  const i = t.id.length; t.id.push(id); idx.set(id, i);
  const cols = M.cols.get(tid) || new Map();
  for (const c of Object.keys(t)) if (c !== "id") t[c][i] = c in champs ? champs[c] : defaut(tid, c);
  for (const [c, v] of Object.entries(champs)) { if (c === "id") continue; if (!t[c]) t[c] = t.id.map(() => null); t[c][i] = v; }
  if (t.manualSort && !("manualSort" in champs)) t.manualSort[i] = id;
  for (const [c, d] of cols) {
    if (d.isFormula || !d.formula || c in champs) continue;
    const v = valeurDeclencheur(d, entree); if (v !== undefined) { if (!t[c]) t[c] = t.id.map(() => null); t[c][i] = v; }
  }
}
function majLigne(tid, id, champs) {
  const t = K.doc[tid]; if (!t) throw new Error(`table inconnue : ${tid}`);
  const i = indexLignes(tid).get(id); if (i === undefined) { trace(`Modification ignorée : ligne ${id} absente de ${tid}`); return; }
  for (const [c, v] of Object.entries(champs)) { if (c === "id") continue; if (!t[c]) t[c] = t.id.map(() => null); t[c][i] = v; }
}
function supprLigne(tid, id) {
  const t = K.doc[tid]; if (!t) return;
  const i = indexLignes(tid).get(id); if (i === undefined) return;
  for (const c of Object.keys(t)) if (Array.isArray(t[c])) t[c].splice(i, 1);
  M.index.delete(tid);
}
function appliquerAction(a, entree) {
  const [nom, tid, x, y] = a;
  switch (nom) {
    case "AddRecord": ajouterLigne(tid, x, y || {}, entree); return x;
    case "BulkAddRecord": x.forEach((id, k) => { const f = {}; for (const [c, v] of Object.entries(y || {})) f[c] = v[k]; ajouterLigne(tid, id, f, entree); }); return x;
    case "UpdateRecord": majLigne(tid, x, y || {}); return null;
    case "BulkUpdateRecord": x.forEach((id, k) => { const f = {}; for (const [c, v] of Object.entries(y || {})) f[c] = v[k]; majLigne(tid, id, f); }); return null;
    case "RemoveRecord": supprLigne(tid, x); return null;
    case "BulkRemoveRecord": x.forEach(id => supprLigne(tid, id)); return null;
    default: throw new Error(`« ${nom} » n'est pas possible en mode secours : la structure du document est figée jusqu'au retour de Grist.`);
  }
}
function prochainId() { K.seq++; BD.ecrire("kv", K.seq, "seq").catch(() => {}); return BASE_HORS_LIGNE + K.posteNum * PAR_POSTE + K.seq; }
/* Avant l'enregistrement dans le journal : numéro définitif des nouvelles lignes, et valeurs des colonnes à
   formule de déclenchement (date de création, auteur…) écrites en clair, pour que la réintégration dans Grist
   garde l'heure et l'auteur de la saisie et non ceux de la réintégration. */
function declencheurs(tid, champs, entree) {
  const res = { ...(champs || {}) };
  for (const [c, d] of M.cols.get(tid) || []) {
    if (d.isFormula || !d.formula || c in res) continue;
    const v = valeurDeclencheur(d, entree); if (v !== undefined) res[c] = v;
  }
  return res;
}
function normaliser(a, entree) {
  const [nom, tid, x, y] = a;
  if (nom === "AddRecord") return [nom, tid, x == null || x < 0 ? prochainId() : x, declencheurs(tid, y, entree)];
  if (nom === "BulkAddRecord") {
    const ids = x.map(id => (id == null || id < 0 ? prochainId() : id)), cols = { ...(y || {}) };
    const extra = declencheurs(tid, Object.fromEntries(Object.keys(cols).map(c => [c, null])), entree);
    for (const [c, v] of Object.entries(extra)) if (!(c in cols)) cols[c] = ids.map(() => v);
    return [nom, tid, ids, cols];
  }
  return a.slice();
}
function appliquerEntree(e) {
  if (K.appliquees.has(e.id)) return;
  K.appliquees.add(e.id);
  if (K.reintegrees.has(e.id)) return;   // déjà réintégrée dans Grist, donc déjà dans la copie
  for (const a of e.actions || []) { try { appliquerAction(a, e); } catch (err) { trace(`Saisie de ${e.agent || "?"} (${heure(e.t)}) non rejouée : ${err.message}`); } }
  if (e.t > K.dernierT) K.dernierT = e.t;
}
const toutesEntrees = () => { const l = [...K.journal]; for (const f of K.autres.values()) l.push(...f.entrees); return l; };
const ordre = (a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
function complementValable() {
  const c = K.complement, b = K.base && K.base.info;
  if (!c || !b) return false;
  // un complément plus ancien que la base n'apporte rien : la base contient déjà ces tables, plus à jour
  return !(b.modifie && c.info.modifie && c.info.modifie < b.modifie - 60000);
}
function lireReintegrees() {
  K.reintegrees = new Set();
  const C = K.doc.Config; if (!C || !C.Cle) return;
  const i = C.Cle.indexOf("secours"); if (i < 0) return;
  try { Object.keys((JSON.parse(C.Valeur[i] || "{}") || {}).entrees || {}).forEach(id => K.reintegrees.add(id)); } catch (_) {}
}
function reconstruireDoc() {
  K.doc = copie(K.base.tables);
  if (complementValable()) {
    for (const [n, t] of Object.entries(K.complement.tables)) if (!n.startsWith("_grist")) K.doc[n] = copie(t);
    // la copie des dossiers porte aussi la clé « secours » de Config (saisies déjà réintégrées)
    const C = K.doc.Config, v = K.complement.secours;
    if (C && C.Cle && v != null) {
      const i = C.Cle.indexOf("secours"), txt = JSON.stringify(v);
      if (i >= 0) C.Valeur[i] = txt;
      else { C.id.push(Math.max(0, ...C.id) + 1); for (const c of Object.keys(C)) if (c !== "id") C[c].push(c === "Cle" ? "secours" : c === "Valeur" ? txt : null); }
    }
  }
  indexerMeta(); lireReintegrees(); K.appliquees = new Set(); K.dernierT = "";
  const vues = new Set();
  for (const e of toutesEntrees().sort(ordre)) {
    if (vues.has(e.id)) continue; vues.add(e.id);
    appliquerEntree(e);
  }
  recalculerFormules();
}
// nouvelles entrées d'autres postes : ajoutées à la suite, ou document rejoué dans l'ordre si l'une est antérieure
function integrerEntrees(nouvelles) {
  nouvelles = nouvelles.filter(e => !K.appliquees.has(e.id)); if (!nouvelles.length) return false;
  if (nouvelles.some(e => e.t < K.dernierT)) reconstruireDoc();
  else { nouvelles.sort(ordre).forEach(appliquerEntree); recalculerFormules(); }
  return true;
}
async function executer(actions) {
  await pret;
  const e = { id: uuid(), t: new Date().toISOString(), agent: K.agent, poste: K.posteNum, base: K.base.info.cle };
  e.actions = actions.map(a => normaliser(a, e));
  const sauvegarde = new Map();
  const touchees = [...new Set(e.actions.map(a => a[1]))];
  touchees.forEach(tid => { if (K.doc[tid]) sauvegarde.set(tid, copie(K.doc[tid])); });
  const retours = [];
  try { for (const a of e.actions) retours.push(appliquerAction(a, e)); }
  catch (err) { for (const [tid, t] of sauvegarde) K.doc[tid] = t; M.index = new Map(); throw err; }   // tout ou rien, comme Grist
  K.appliquees.add(e.id); if (e.t > K.dernierT) K.dernierT = e.t;
  recalculerFormules();
  K.journal.push(e); K.enAttente++;
  await BD.ecrire("journal", e);
  ecrireJournalPartage();
  emettreBientot();
  UI.maj();
  return retours;
}

/* ---------- lignes envoyées aux widgets ---------- */
const colonnesVisibles = t => Object.keys(t).filter(c => c !== "id" && c !== "manualSort" && !c.startsWith("gristHelper_"));
function ligne(tid, i) { const t = K.doc[tid], r = { id: t.id[i] }; for (const c of colonnesVisibles(t)) r[c] = t[c][i] === undefined ? null : t[c][i]; return r; }
function lignes(tid) { const t = K.doc[tid]; return t ? t.id.map((_, i) => ligne(tid, i)) : []; }

/* ---------- vues du kit : chaque widget tourne dans son cadre, avec sa page (table liée, options) ---------- */
const VUES = {
  saisie: { titre: "Saisie", page: () => K.page, cle: "page" },
  tableau: { titre: "Tableau de bord", page: () => K.pageTableau, cle: "pageTableau" },
  liste: { titre: "Tableau des signalements", page: () => (K.page ? { tableId: K.page.tableId, widgetOptions: { table: K.page.tableId } } : null), cle: null },
};
Object.values(VUES).forEach(v => { v.rappels = { records: null, record: null, nouveau: null }; v.minuteur = null; });
function emettre(vid) { const v = VUES[vid], p = v.page(); if (v.rappels.records && K.pret && p && K.doc[p.tableId]) v.rappels.records(copie(lignes(p.tableId)), p.mapping || null); }
function emettreBientot() { for (const vid of Object.keys(VUES)) { clearTimeout(VUES[vid].minuteur); VUES[vid].minuteur = setTimeout(() => emettre(vid), 20); } }

/* ---------- l'API Grist simulée, une par vue ---------- */
function creerGrist(vid) {
  const v = VUES[vid], page = () => v.page() || {}, opts = () => page().widgetOptions || {};
  const enregistrerOptions = async o => { const p = v.page(); if (!p) return; p.widgetOptions = o; if (v.cle) await BD.ecrire("kv", p, v.cle); };
  function tableOps(tidDemande) {
    const tid = () => tidDemande || page().tableId;
    const liste = x => (Array.isArray(x) ? x : [x]);
    return {
      getTableId: async () => { await pret; return tid(); },
      async create(recs) {
        await pret; const l = liste(recs);
        const r = await executer(l.map(({ fields }) => ["AddRecord", tid(), null, fields || {}]));
        const ids = r.map(id => ({ id })); return Array.isArray(recs) ? ids : ids[0];
      },
      async update(recs) { await pret; await executer(liste(recs).map(({ id, fields }) => ["UpdateRecord", tid(), id, fields || {}])); },
      async destroy(ids) { await pret; await executer(liste(ids).map(id => ["RemoveRecord", tid(), id])); },
      async upsert(recs) {
        await pret; const t = K.doc[tid()], acts = [];
        for (const { require: req = {}, fields = {} } of liste(recs)) {
          const i = t.id.findIndex((_, k) => Object.entries(req).every(([c, x]) => t[c] && t[c][k] === x));
          acts.push(i >= 0 ? ["UpdateRecord", tid(), t.id[i], fields] : ["AddRecord", tid(), null, { ...req, ...fields }]);
        }
        await executer(acts);
      },
    };
  }
  const g = {
    ready() {},
    onRecords(f) { v.rappels.records = f; pret.then(() => setTimeout(() => emettre(vid), 30)); },
    onRecord(f) { v.rappels.record = f; },
    onNewRecord(f) { v.rappels.nouveau = f; },
    onOptions(f) { pret.then(() => f(page().widgetOptions || null, {})); },
    async getOption(k) { await pret; const x = opts()[k]; return x === undefined ? null : x; },
    async getOptions() { await pret; return page().widgetOptions || null; },
    async setOption(k, x) { await pret; await enregistrerOptions({ ...opts(), [k]: x }); },
    async setOptions(o) { await pret; await enregistrerOptions({ ...(o || {}) }); },
    async clearOptions() { await pret; await enregistrerOptions({}); },
    async setCursorPos(p) {
      await pret; const id = p && p.rowId;
      setTimeout(() => {
        if (id === "new") { if (v.rappels.nouveau) v.rappels.nouveau(); return; }
        const i = indexLignes(page().tableId).get(id);
        if (i !== undefined && v.rappels.record) v.rappels.record(ligne(page().tableId, i));
      }, 0);
    },
    async setSelectedRows() {},
    async fetchSelectedTable(o) { await pret; return o && o.format === "rows" ? copie(lignes(page().tableId)) : copie(K.doc[page().tableId]); },
    async fetchSelectedRecord(id) { await pret; const i = indexLignes(page().tableId).get(id); return i === undefined ? null : ligne(page().tableId, i); },
    getTable: tid => tableOps(tid),
    get selectedTable() { return tableOps(); },
    docApi: {
      async fetchTable(n) { await pret; if (!K.doc[n]) throw new Error(`KeyError: '${n}'`); return copie(K.doc[n]); },
      async fetchSelectedTable() { await pret; return copie(K.doc[page().tableId]); },
      async applyUserActions(acts) { const r = await executer(acts); return { retValues: r }; },
      async listTables() { await pret; return [...M.tables.values()]; },
      async getDocName() { await pret; return `${K.base.info.nom} (secours ${K.base.info.cle})`; },
      // pas de getAccessToken : les widgets lisent alors tout par fetchTable (pas d'API SQL ni REST hors ligne)
    },
    sectionApi: { async configure() {} },
  };
  g.widgetApi = { getOption: k => g.getOption(k), setOption: (k, x) => g.setOption(k, x) };
  return g;
}
window.__kitGrist = vid => creerGrist(VUES[vid] ? vid : "saisie");
window.__kitTelecharger = (blob, nom) => telecharger(nom, blob);

/* ---------- lecture d'une copie du document ---------- */
// valeurs enregistrées par Grist au format « marshal » de Python (colonnes Any, erreurs, listes)
function lireMarshal(octets) {
  const v = new DataView(octets.buffer, octets.byteOffset, octets.byteLength); let p = 0; const refs = [];
  const i32 = () => { const x = v.getInt32(p, true); p += 4; return x; };
  const texte = n => { const s = new TextDecoder().decode(octets.subarray(p, p + n)); p += n; return s; };
  function lire() {
    const brut = v.getUint8(p++), code = String.fromCharCode(brut & 0x7f), garder = brut & 0x80;
    let r;
    switch (code) {
      case "N": return null; case "F": return false; case "T": return true; case "0": return undefined;
      case "i": r = i32(); break;
      case "I": { const lo = v.getUint32(p, true), hi = v.getInt32(p + 4, true); p += 8; r = hi * 4294967296 + lo; break; }
      case "g": r = v.getFloat64(p, true); p += 8; break;
      case "f": { const n = v.getUint8(p++); r = parseFloat(texte(n)); break; }
      case "l": { const n = i32(), s = Math.sign(n); let x = 0; for (let k = 0; k < Math.abs(n); k++) { x += v.getUint16(p, true) * Math.pow(32768, k); p += 2; } r = s * x; break; }
      case "s": case "t": case "u": case "a": case "A": { const n = i32(); r = texte(n); break; }
      case "z": case "Z": { const n = v.getUint8(p++); r = texte(n); break; }
      case "(": case "[": case "<": case ">": { const n = i32(); r = []; for (let k = 0; k < n; k++) r.push(lire()); break; }
      case ")": { const n = v.getUint8(p++); r = []; for (let k = 0; k < n; k++) r.push(lire()); break; }
      case "{": { r = {}; for (;;) { const k = lire(); if (k === undefined) break; r[k] = lire(); } break; }
      case "r": return refs[i32()];
      default: throw new Error(`marshal : code ${code}`);
    }
    if (garder) refs.push(r);
    return r;
  }
  try { return lire(); } catch (_) { return null; }
}
let moteurSQL = null;
async function lireFichierGrist(octets) {
  if (!window.initSqlJs || !window.__KIT_SQLJS_WASM__) throw new Error("Lecteur de fichiers .grist absent de ce kit.");
  if (!moteurSQL) moteurSQL = await window.initSqlJs({ wasmBinary: octetsDeBase64(window.__KIT_SQLJS_WASM__) });
  const db = new moteurSQL.Database(octets);
  try {
    const q = s => db.exec(s);
    const noms = (q("SELECT name FROM sqlite_master WHERE type='table'")[0] || { values: [] }).values.map(r => r[0])
      .filter(n => !n.startsWith("_gristsys_") && !n.startsWith("sqlite_"));
    const tables = {};
    for (const n of noms) {
      const e = n.replace(/"/g, '""'), res = q(`SELECT * FROM "${e}"`);
      const t = {};
      if (res.length) { const { columns, values } = res[0]; columns.forEach((c, k) => { t[c] = values.map(r => r[k]); }); }
      else (q(`PRAGMA table_info("${e}")`)[0] || { values: [] }).values.forEach(r => { t[r[1]] = []; });
      if (!t.id) continue;
      tables[n] = t;
    }
    // types des colonnes des tables du document
    const T = tables._grist_Tables, C = tables._grist_Tables_column;
    if (!T || !C) throw new Error("ce fichier n'est pas un document Grist");
    C.isFormula = C.isFormula.map(x => !!x);
    if (C.untieColIdFromLabel) C.untieColIdFromLabel = C.untieColIdFromLabel.map(x => !!x);
    const tableDe = new Map(T.id.map((id, i) => [id, T.tableId[i]]));
    const types = new Map();
    C.id.forEach((_, i) => { const tid = tableDe.get(C.parentId[i]); if (!types.has(tid)) types.set(tid, new Map()); types.get(tid).set(C.colId[i], C.type[i]); });
    for (const [n, t] of Object.entries(tables)) {
      const ty = types.get(n) || new Map();
      for (const c of Object.keys(t)) {
        if (c === "id") continue;
        const b = typeBase(ty.get(c));
        t[c] = t[c].map(x => {
          if (x instanceof Uint8Array) return lireMarshal(x);
          if (b === "Bool") return x == null ? x : !!x;
          if ((b === "ChoiceList" || b === "RefList" || b === "Attachments") && typeof x === "string" && x.startsWith("[")) { try { return ["L", ...JSON.parse(x)]; } catch (_) { return x; } }
          return x;
        });
      }
    }
    return tables;
  } finally { db.close(); }
}
// { records: [{ id, fields: {…} }] } (API REST de Grist) → colonnes, comme fetchTable
function colonnesDeRecords(records) {
  const t = { id: records.map(r => r.id) }, cols = new Set();
  records.forEach(r => Object.keys(r.fields || {}).forEach(c => cols.add(c)));
  for (const c of cols) t[c] = records.map(r => (r.fields && c in r.fields ? r.fields[c] : null));
  return t;
}
async function lireCopie(fichier) {
  const nom = fichier.name || "document";
  let octets = new Uint8Array(await fichier.arrayBuffer());
  if (/\.gz$/i.test(nom)) octets = new Uint8Array(await new Response(new Blob([octets]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
  const sqlite = octets.length > 16 && new TextDecoder().decode(octets.subarray(0, 15)) === "SQLite format 3";
  let tables;
  if (sqlite) tables = await lireFichierGrist(octets);
  else {
    const j = JSON.parse(new TextDecoder().decode(octets));
    if (j.format === "kit-secours-instantane" && j.tables) {
      tables = {};
      for (const [n, t] of Object.entries(j.tables)) tables[n] = Array.isArray(t.records) ? colonnesDeRecords(t.records) : t;
      if (j.complement) return { info: { complement: true, fichier: nom, genere_le: j.genere_le || null, modifie: fichier.lastModified || null, charge_le: new Date().toISOString(), ecrit_par: j.ecrit_par || null }, tables, secours: j.secours === undefined ? undefined : j.secours };
    }
    else if (j._grist_Tables) { tables = {}; for (const [k, v] of Object.entries(j)) if (k.startsWith("_grist_")) tables[k] = v; Object.assign(tables, j.__data || {}); }
    else throw new Error("format de fichier non reconnu (attendu : document .grist ou copie .json)");
  }
  const nomDoc = nom.replace(/\.(grist|json)(\.gz)?$/i, "");
  return { info: { nom: nomDoc, source: sqlite ? "grist" : "json", fichier: nom, modifie: fichier.lastModified || null, charge_le: new Date().toISOString(), cle: `${slug(nomDoc)}-${(fichier.lastModified || Date.now()).toString(36)}` }, tables };
}

/* ---------- pages de saisie du document ---------- */
function vueCustom(opt) { try { const o = JSON.parse(opt || "{}") || {}; return typeof o.customView === "string" ? JSON.parse(o.customView || "{}") : (o.customView || {}); } catch (_) { return {}; } }
function pagesDeSaisie(tables) {
  const res = [], T = tables._grist_Tables, S = tables._grist_Views_section, V = tables._grist_Views;
  const tableDe = new Map((T ? T.id : []).map((id, i) => [id, T.tableId[i]]));
  const nomVue = new Map((V ? V.id : []).map((id, i) => [id, V.name[i]]));
  if (S && S.options) S.id.forEach((sid, i) => {
    const cv = vueCustom(S.options[i]); if (!cv.url || !/\/saisie(\/|\/index\.html)?($|[?#])/.test(cv.url)) return;
    const tid = tableDe.get(S.tableRef[i]); if (!tid) return;
    const titre = [...new Set([nomVue.get(S.parentId[i]), S.title && S.title[i]].filter(Boolean))].join(" — ") || `Page ${sid}`;
    res.push({ cle: `section:${sid}`, titre, tableId: tid, widgetOptions: cv.widgetOptions || {}, mapping: cv.columnsMapping || null });
  });
  const F = tables.Formulaires;
  if (F && F.Nom) F.id.forEach((_, i) => {
    if (!F.Publie || !F.Publie[i]) return;
    res.push({ cle: `formulaire:${F.Nom[i]}`, titre: `Formulaire « ${F.Nom[i]} » (sans page d'agent)`, tableId: (F.Table && F.Table[i]) || "Reponses", widgetOptions: { formulaire: F.Nom[i] }, mapping: null });
  });
  return res.filter(p => tables[p.tableId]);
}

function pagesTableau(tables) {
  const res = [], T = tables._grist_Tables, S = tables._grist_Views_section, V = tables._grist_Views;
  const tableDe = new Map((T ? T.id : []).map((id, i) => [id, T.tableId[i]]));
  const nomVue = new Map((V ? V.id : []).map((id, i) => [id, V.name[i]]));
  if (S && S.options) S.id.forEach((sid, i) => {
    const cv = vueCustom(S.options[i]); if (!cv.url || !/\/tableau-de-bord(\/|\/index\.html)?($|[?#])/.test(cv.url)) return;
    const tid = tableDe.get(S.tableRef[i]); if (!tid) return;
    const titre = [...new Set([nomVue.get(S.parentId[i]), S.title && S.title[i]].filter(Boolean))].join(" — ") || `Page ${sid}`;
    res.push({ cle: `section:${sid}`, titre, tableId: tid, widgetOptions: cv.widgetOptions || {}, mapping: cv.columnsMapping || null });
  });
  // tableaux publiés dans Config (clé tableau_de_bord), y compris ceux qui n'ont pas de page
  const C = tables.Config, cfg = cle => { if (!C || !C.Cle) return null; const i = C.Cle.indexOf(cle); try { return i >= 0 ? JSON.parse(C.Valeur[i] || "null") : null; } catch (_) { return null; } };
  const v = cfg("tableau_de_bord"), g = cfg("general") || {};
  const liste = v && Array.isArray(v.tableaux) ? v.tableaux : v && v.publie ? [{ id: v.id || "", nom: v.nom || "Tableau de bord", table: v.table, publie: v.publie }] : [];
  liste.forEach((t, k) => {
    if (!t || !t.publie || res.some(p => (p.widgetOptions.tableau || "") === (t.id || "") || (k === 0 && !p.widgetOptions.tableau))) return;
    res.push({ cle: `tableau:${t.id || k}`, titre: t.nom || "Tableau de bord", tableId: t.table || g.reponses || "Reponses", widgetOptions: t.id ? { tableau: t.id } : {}, mapping: null });
  });
  return res.filter(p => tables[p.tableId]);
}

/* ---------- dossier partagé ---------- */
const FS_OK = typeof window.showDirectoryPicker === "function";
const monFichier = () => `${PREFIXE_JOURNAL}${slug(K.agent)}-${K.posteNum}.json`;
async function verifierAcces(demander) {
  if (!K.dir) return false;
  let p = await K.dir.queryPermission({ mode: "readwrite" });
  if (p !== "granted" && demander) p = await K.dir.requestPermission({ mode: "readwrite" });
  return p === "granted";
}
async function choisirDossier() {
  const h = await window.showDirectoryPicker({ id: "kitSecours", mode: "readwrite" });
  K.dir = h; await BD.ecrire("kv", h, "dossier"); await connecterDossier();
}
async function connecterDossier(demander) {
  try {
    if (!(await verifierAcces(demander))) { K.dirEtat = "reconnecter"; UI.maj(); return false; }
    K.dirEtat = "ok"; K.dirErreur = ""; trace(`Dossier partagé connecté : « ${K.dir.name} »`);
    if (K.pret) { await lireDossier(); await ecrireJournalPartage(); }
    UI.maj(); return true;
  } catch (e) { K.dirEtat = "erreur"; K.dirErreur = e.message; UI.maj(); return false; }
}
async function oublierDossier() { K.dir = null; K.dirEtat = "aucun"; await BD.suppr("kv", "dossier"); UI.maj(); }
let chaineEcriture = Promise.resolve();
function ecrireJournalPartage() {
  chaineEcriture = chaineEcriture.then(async () => {
    if (!K.dir || K.dirEtat !== "ok" || !K.agent || !K.journal.length) return;   // pas de journal vide dans le dossier
    try {
      const fh = await K.dir.getFileHandle(monFichier(), { create: true }), w = await fh.createWritable();
      await w.write(JSON.stringify({ format: "kit-secours-journal", version: 1, kit: KIT_VERSION, agent: K.agent, poste: K.posteNum, document: K.base && K.base.info, maj: new Date().toISOString(), entrees: K.journal }));
      await w.close();
      K.enAttente = 0; K.dirErreur = "";
    } catch (e) { K.dirEtat = "erreur"; K.dirErreur = e.message; trace(`Écriture sur le dossier partagé impossible : ${e.message}`); }
    UI.maj();
  });
  return chaineEcriture;
}
async function lireDossier() {
  if (!K.dir || K.dirEtat !== "ok") return;
  const vus = new Set(), nouvelles = [], candidats = [];
  try {
    for await (const [nom, h] of K.dir.entries()) {
      if (h.kind !== "file") continue;
      if (/\.(grist|json|json\.gz)$/i.test(nom) && !nom.startsWith(PREFIXE_JOURNAL)) { try { const f = await h.getFile(); candidats.push({ nom, mod: f.lastModified, taille: f.size }); } catch (_) {} continue; }
      if (!nom.startsWith(PREFIXE_JOURNAL) || !nom.endsWith(".json") || nom === monFichier()) continue;
      vus.add(nom);
      const f = await h.getFile(), avant = K.autres.get(nom);
      if (avant && avant.mod === f.lastModified) continue;
      let d; try { d = JSON.parse(await f.text()); } catch (_) { continue; }   // fichier en cours d'écriture : relu au prochain passage
      if (d.poste === K.posteNum && d.agent !== K.agent) trace(`⚠ Le poste de ${d.agent} a le même numéro que celui-ci (${K.posteNum}) : changez le numéro de poste dans les réglages avant de saisir.`);
      const entrees = Array.isArray(d.entrees) ? d.entrees : [];
      K.autres.set(nom, { agent: d.agent, poste: d.poste, maj: d.maj, mod: f.lastModified, entrees });
      nouvelles.push(...entrees);
    }
    for (const nom of [...K.autres.keys()]) if (!vus.has(nom) && !nom.startsWith("import:")) K.autres.delete(nom);
    K.derniereLecture = Date.now(); K.dirErreur = "";
    K.fichiersDossier = candidats.sort((a, b) => b.mod - a.mod);
    const b = K.base && K.base.info, plusRecent = b && candidats.find(c => (c.nom === b.fichier || (b.auto && NOM_BASE.test(c.nom))) && b.modifie && c.mod > b.modifie + 1000);
    K.nouvelleBase = plusRecent || null;
    const rebati = await majComplement(candidats);
    if (rebati) { emettreBientot(); if (nouvelles.length) integrerEntrees(nouvelles); }
    else if (integrerEntrees(nouvelles)) { trace(`${nouvelles.length} saisie(s) d'autres postes intégrée(s)`); emettreBientot(); }
    await BD.ecrire("kv", [...K.autres], "autres");
    if (K.enAttente) await ecrireJournalPartage();
  } catch (e) { K.dirEtat = "erreur"; K.dirErreur = e.message; trace(`Lecture du dossier partagé impossible : ${e.message}`); }
  UI.maj();
}
async function tic() {
  if (!K.pret) return;
  // en veille, une base plus récente est prise sans recharger la page (qui perdrait l'autorisation sur le dossier)
  if (K.mode === "veille" && K.nouvelleBase && UI.panneau !== "reglages") {
    const nom = K.nouvelleBase.nom; K.nouvelleBase = null;
    try {
      const b = await chargerDepuisDossier(nom); b.info.auto = true;
      K.base = b; await BD.ecrire("base", b, "courante");
      reconstruireDoc(); UI.rechargerVues();
      evenement(`nouvelle base ${nom} prise en compte`);
    } catch (e) { evenement(`nouvelle base illisible (${nom}) : ${e.message}`, "attention"); }
  }
  if (K.dir && K.dirEtat === "erreur") { try { if (await verifierAcces(false)) { K.dirEtat = "ok"; trace("Dossier partagé de nouveau accessible"); } } catch (_) {} }
  await lireDossier();
}
// complément plus récent déposé dans le dossier : chargé et appliqué sans recharger la page
async function majComplement(candidats) {
  const f = candidats.find(c => NOM_COMPLEMENT.test(c.nom));
  if (!f || !K.base) return false;
  if (K.complement && K.complement.info.modifie && f.mod <= K.complement.info.modifie) return false;
  try {
    const c = await chargerDepuisDossier(f.nom);
    if (!c.info.complement) return false;
    c.info.auto = true; K.complement = c; await BD.ecrire("base", c, "complement");
    if (!K.pret) return false;
    reconstruireDoc();
    trace(`Dossiers mis à jour depuis ${f.nom} (${dateHeure(c.info.genere_le || f.mod)}) : ${Object.entries(c.tables).map(([n, t]) => `${n} (${t.id.length})`).join(", ")}`);
    return true;
  } catch (e) { trace(`Complément illisible (${f.nom}) : ${e.message}`); return false; }
}
// au démarrage : base et complément les plus récents du dossier, si le poste suit les copies du dossier
async function copiesDuDossierAuDemarrage() {
  const c = K.fichiersDossier || [];
  const fb = c.find(x => NOM_BASE.test(x.nom));
  if (fb && (!K.base || (K.base.info.auto && (!K.base.info.modifie || fb.mod > K.base.info.modifie + 1000)))) {
    try { const b = await chargerDepuisDossier(fb.nom); b.info.auto = true; K.base = b; await BD.ecrire("base", b, "courante"); trace(`Base chargée d'office : ${fb.nom}`); }
    catch (e) { trace(`Base illisible (${fb.nom}) : ${e.message}`); }
  }
  await majComplement(c);
}
async function chargerDepuisDossier(nom) {
  const h = await K.dir.getFileHandle(nom); return lireCopie(await h.getFile());
}

/* =====================================================================
   Mode veille : copies demandées au relais n8n et écrites dans le dossier partagé
   ===================================================================== */
function evenement(txt, gravite) {
  const e = { t: Date.now(), txt, gravite: gravite || "info" };
  K.veille.evenements.unshift(e); K.veille.evenements = K.veille.evenements.slice(0, 30);
  trace(`Veille : ${txt}`);
  BD.ecrire("kv", K.veille.evenements, "veille-evenements").catch(() => {});
}
const relaisRegle = () => !!(K.relais.url && K.relais.cle);
async function appelRelais(quoi, binaire) {
  let u; try { u = new URL(K.relais.url); } catch (_) { throw new Error("adresse du relais non valable"); }
  u.searchParams.set("cle", K.relais.cle); u.searchParams.set("quoi", quoi); u.searchParams.set("_", Date.now());
  const arret = new AbortController(), minuteur = setTimeout(() => arret.abort(), binaire ? 300000 : 120000);
  let r;
  try { r = await fetch(u, { cache: "no-store", signal: arret.signal }); }
  catch (e) { throw Object.assign(new Error(e.name === "AbortError" ? "le relais ne répond pas (délai dépassé)" : "relais injoignable (réseau coupé, ou réponse bloquée par le navigateur)"), { reseau: true }); }
  finally { clearTimeout(minuteur); }
  if (binaire && r.ok && !/json/.test(r.headers.get("content-type") || "")) return new Uint8Array(await r.arrayBuffer());
  const txt = await r.text(); let j;
  try { j = JSON.parse(txt); } catch (_) { throw new Error(`réponse illisible du relais (HTTP ${r.status})`); }
  if (!r.ok || j.erreur) throw Object.assign(new Error(j.erreur || `HTTP ${r.status}`), { statut: r.status });
  return j;
}
async function fichierDuDossier(nom) { try { return await (await K.dir.getFileHandle(nom)).getFile(); } catch (_) { return null; } }
async function ecrireDansDossier(nom, contenu) { const fh = await K.dir.getFileHandle(nom, { create: true }), w = await fh.createWritable(); await w.write(contenu); await w.close(); }
const nbLignes = t => (t && Array.isArray(t.records) ? t.records.length : t && Array.isArray(t.id) ? t.id.length : 0);
const SEUIL_BAISSE = 0.5, MIN_CONTROLE = 20;   // une table d'au moins 20 lignes qui perd plus de la moitié : copie refusée

// copie des dossiers : contrôlée, puis écrite à la place de la précédente, gardée sous un autre nom
async function copierDossiers() {
  const j = await appelRelais("dossiers");
  if (j.format !== "kit-secours-instantane" || !j.complement || !j.tables) throw new Error("copie refusée : format inattendu");
  const rep = Array.isArray(j.reponses) ? j.reponses : [];
  if (!rep.length || rep.some(t => !j.tables[t])) throw new Error("copie refusée : table des réponses absente");
  j.ecrit_par = K.agent || `poste ${K.posteNum}`;
  const actuel = await fichierDuDossier(F_DOSSIERS);
  let avant = null;
  if (actuel) { try { avant = JSON.parse(await actuel.text()); } catch (_) { avant = null; } }   // copie en place illisible : remplacée
  const baisses = avant && avant.tables ? Object.entries(avant.tables).map(([t, x]) => [t, nbLignes(x), nbLignes(j.tables[t])])
    .filter(([, n, m]) => n >= MIN_CONTROLE && m < n * SEUIL_BAISSE) : [];
  if (baisses.length) {
    K.veille.refus = { t: Date.now(), copie: j, message: baisses.map(([t, n, m]) => `${t} : ${m} ligne(s) au lieu de ${n}`).join(" ; ") };
    evenement(`copie des dossiers refusée — ${K.veille.refus.message}. La copie en place est gardée.`, "attention");
    return false;
  }
  await ecrireCopieDossiers(j, actuel);
  return true;
}
async function ecrireCopieDossiers(j, actuel) {
  if (actuel === undefined) actuel = await fichierDuDossier(F_DOSSIERS);
  if (actuel) await ecrireDansDossier(F_PRECEDENT, actuel);
  await ecrireDansDossier(F_DOSSIERS, JSON.stringify(j));
  K.veille.refus = null;
  K.veille.copie = { t: Date.now(), compte: Object.fromEntries(Object.entries(j.tables).map(([t, x]) => [t, nbLignes(x)])), taille: null };
  evenement(`copie des dossiers écrite (${Object.entries(K.veille.copie.compte).map(([t, n]) => `${t} ${n}`).join(", ")})`);
}
// base : une vérification par jour ; téléchargée seulement si l'empreinte a changé ou si le fichier manque
const jourLocal = d => { const x = new Date(d); return `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}`; };
async function baseVerifieeAujourdhui() {
  const f = await fichierDuDossier(F_EMPREINTE); if (!f) return false;
  try { const e = JSON.parse(await f.text()); return !!e.verifie_le && jourLocal(e.verifie_le) === jourLocal(Date.now()) && !!(await fichierDuDossier(F_BASE)); } catch (_) { return false; }
}
async function verifierBase(forcer) {
  const e = await appelRelais("empreinte");
  const fe = await fichierDuDossier(F_EMPREINTE); let avant = null;
  if (fe) { try { avant = JSON.parse(await fe.text()); } catch (_) {} }
  const enPlace = await fichierDuDossier(F_BASE);
  const maintenant = new Date().toISOString();
  if (!forcer && enPlace && avant && avant.empreinte === e.empreinte) {
    await ecrireDansDossier(F_EMPREINTE, JSON.stringify({ ...avant, verifie_le: maintenant }));
    K.veille.base = { t: Date.now(), statut: "inchangée", taille: enPlace.size };
    evenement("base vérifiée : inchangée");
    return false;
  }
  const octets = await appelRelais("base", true);
  let tables;
  try { tables = await lireFichierGrist(octets); } catch (err) { throw new Error(`base refusée : fichier illisible (${err.message})`); }
  const C = tables.Config, iG = C && C.Cle ? C.Cle.indexOf("general") : -1;
  let g = {}; try { g = iG >= 0 ? JSON.parse(C.Valeur[iG] || "{}") || {} : {}; } catch (_) {}
  if (!tables[g.reponses || "Reponses"]) throw new Error("base refusée : la table des réponses n'y figure pas");
  await ecrireDansDossier(F_BASE, new Blob([octets]));
  await ecrireDansDossier(F_EMPREINTE, JSON.stringify({ empreinte: e.empreinte, mesure: e.mesure, base_le: maintenant, verifie_le: maintenant, taille: octets.length, ecrit_par: K.agent || null }));
  K.veille.base = { t: Date.now(), statut: avant ? "mise à jour" : "téléchargée", taille: octets.length };
  evenement(`base ${avant ? "mise à jour" : "téléchargée"} (${(octets.length / 1048576).toFixed(1)} Mo)`);
  return true;
}
const minutes = d => d.getHours() * 60 + d.getMinutes();
function dansPlage(d = new Date()) { const m = minutes(d); return m >= K.relais.debut * 60 && m <= K.relais.fin * 60; }
async function veilleTic(forcer) {
  if (!relaisRegle() || K.veille.enCours) return;
  if (K.mode !== "veille" && !forcer) {
    // mode secours : un signe de vie du relais toutes les 5 minutes, pour dire quand le réseau est revenu
    if (Date.now() - K.veille.ping < 300000) return;
    K.veille.ping = Date.now();
    try { await appelRelais("ping"); if (!K.veille.retour) evenement("le relais et Grist répondent de nouveau", "ok"); K.veille.retour = Date.now(); }
    catch (_) { K.veille.retour = null; }
    UI.maj(); return;
  }
  if (!K.dir || K.dirEtat !== "ok") { K.veille.erreur = "dossier partagé indisponible"; UI.maj(); return; }
  if (!forcer && !dansPlage()) { UI.maj(); return; }
  K.veille.enCours = true; UI.maj();
  let ecrit = false;
  try {
    if (forcer || !(await baseVerifieeAujourdhui())) ecrit = (await verifierBase()) || ecrit;
    const f = await fichierDuDossier(F_DOSSIERS);
    const age = f ? Date.now() - f.lastModified : Infinity;
    if (forcer || age >= (K.relais.intervalle - 1) * 60000) ecrit = (await copierDossiers()) || ecrit;
    if (K.veille.echecs) evenement("le relais répond de nouveau", "ok");
    K.veille.contact = Date.now(); K.veille.echecs = 0; K.veille.erreur = null;
  } catch (e) {
    K.veille.echecs++; K.veille.erreur = e.message;
    evenement(e.message, e.reseau || e.statut === 502 ? "ko" : "attention");
  } finally { K.veille.enCours = false; }
  if (ecrit) { if (K.pret) await lireDossier(); else { await lireDossierAvantDemarrage(); await copiesDuDossierAuDemarrage(); if (UI.panneau === "reglages") UI.ouvrirReglages(); } }
  UI.maj();
}
async function passerEnMode(mode) {
  K.mode = mode; await BD.ecrire("kv", mode, "mode");
  evenement(mode === "secours" ? "passage en mode secours (saisie hors ligne)" : "retour en mode veille", mode === "secours" ? "attention" : "ok");
  if (mode === "secours") { K.veille.ping = Date.now(); UI.ouvrirVue("saisie"); } else UI.ouvrirVue("veille");
}

/* ---------- exports ---------- */
const horodatageFichier = () => new Date().toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
function exporterMonJournal() {
  telecharger(`secours-journal-${slug(K.agent)}-${K.posteNum}-${horodatageFichier()}.json`, JSON.stringify({ format: "kit-secours-journal", version: 1, kit: KIT_VERSION, agent: K.agent, poste: K.posteNum, document: K.base.info, maj: new Date().toISOString(), entrees: K.journal }, null, 1));
}
function exporterConsolide() {
  const journaux = [{ agent: K.agent, poste: K.posteNum, fichier: monFichier(), entrees: K.journal }];
  for (const [f, d] of K.autres) journaux.push({ agent: d.agent, poste: d.poste, fichier: f, entrees: d.entrees });
  telecharger(`secours-consolide-${slug(K.base.info.nom)}-${horodatageFichier()}.json`, JSON.stringify({ format: "kit-secours-consolide", version: 1, kit: KIT_VERSION, document: K.base.info, exporte_le: new Date().toISOString(), exporte_par: K.agent, journaux }, null, 1));
}
function valeurLisible(tid, c, v) {
  const d = (M.cols.get(tid) || new Map()).get(c), b = typeBase(d && d.type);
  if (v == null) return "";
  if (Array.isArray(v) && v[0] === "L") return v.slice(1).map(x => (b === "RefList" ? afficherRef(d, x) : x)).join(", ");
  if (Array.isArray(v)) return JSON.stringify(v);
  if (b === "Date" && typeof v === "number") return new Date(v * 1000).toLocaleDateString("fr-FR", { timeZone: "UTC" });
  if (b === "DateTime" && typeof v === "number") return new Date(v * 1000).toLocaleString("fr-FR");
  if (b === "Bool") return v ? "Oui" : "Non";
  if (b === "Ref") return afficherRef(d, v);
  return String(v);
}
function afficherRef(d, id) {
  if (!id) return ""; const cible = cibleRef(d.type), t = K.doc[cible]; if (!t) return String(id);
  const i = indexLignes(cible).get(id); if (i === undefined) return String(id);
  const c = d.visible && t[d.visible] ? d.visible : ["Nom", "Nom_etablissement", "Libelle", "UAI"].find(x => t[x]);
  return c ? String(t[c][i] ?? id) : String(id);
}
function exporterCSV() {
  const tables = [...new Set(toutesEntrees().flatMap(e => (e.actions || []).filter(a => /AddRecord/.test(a[0])).map(a => a[1])))];
  if (!tables.length) { alert("Aucune ligne n'a encore été saisie en mode secours."); return; }
  for (const tid of tables) {
    const t = K.doc[tid]; if (!t) continue;
    const cols = colonnesVisibles(t), lignesHL = t.id.map((id, i) => [id, i]).filter(([id]) => id >= BASE_HORS_LIGNE);
    if (!lignesHL.length) continue;
    const cell = s => { s = String(s ?? ""); return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = [["N° mode secours", ...cols].map(cell).join(";"), ...lignesHL.map(([id, i]) => [id, ...cols.map(c => valeurLisible(tid, c, t[c][i]))].map(cell).join(";"))].join("\r\n");
    telecharger(`secours-${tid}-${horodatageFichier()}.csv`, "﻿" + csv, "text/csv;charset=utf-8");
  }
}
async function importerJournaux(fichiers) {
  let n = 0;
  for (const f of fichiers) {
    try {
      const d = JSON.parse(await f.text());
      const journaux = d.format === "kit-secours-consolide" ? d.journaux : [d];
      for (const j of journaux) {
        if (!Array.isArray(j.entrees)) continue;
        if (j.poste === K.posteNum && j.agent === K.agent) continue;   // mon propre journal
        K.autres.set(`import:${j.agent}-${j.poste}`, { agent: j.agent, poste: j.poste, maj: j.maj || d.exporte_le, mod: 0, entrees: j.entrees });
        n += j.entrees.length; integrerEntrees(j.entrees);
      }
    } catch (e) { alert(`${f.name} : fichier illisible (${e.message})`); }
  }
  await BD.ecrire("kv", [...K.autres], "autres");
  emettreBientot(); UI.maj(); trace(`${n} saisie(s) importée(s) d'un fichier`);
}

/* =====================================================================
   Interface du mode secours : bandeau en tête de page (isolé du widget)
   ===================================================================== */
const UI = {
  pret: false, hote: null, r: null, panneau: null,
  monter() {
    this.hote = document.createElement("div"); this.hote.id = "kit-secours";
    document.body.insertBefore(this.hote, document.body.firstChild);
    this.zone = document.createElement("div"); this.zone.id = "kit-vues"; document.body.appendChild(this.zone);
    this.r = this.hote.attachShadow({ mode: "open" });
    this.r.innerHTML = `<style>${CSS}</style><div class="barre" part="barre"></div><div class="voile" hidden><div class="fenetre" role="dialog" aria-modal="true"></div></div>`;
    this.r.addEventListener("click", ev => this.clic(ev));
    this.r.addEventListener("change", ev => this.changement(ev));
    this.pret = true; this.maj();
  },
  maj() {
    if (!this.pret) return;
    const b = this.r.querySelector(".barre"), info = K.base && K.base.info;
    const etat = { ok: ["ok", `Dossier partagé « ${esc(K.dir && K.dir.name)} » · ${1 + K.autres.size} poste(s)${K.derniereLecture ? ` · lu à ${heure(K.derniereLecture)}` : ""}`],
      reconnecter: ["attention", `Dossier partagé « ${esc(K.dir && K.dir.name)} » à reconnecter`], erreur: ["ko", `Dossier partagé injoignable — ${K.enAttente} saisie(s) gardée(s) sur ce poste`],
      aucun: ["neutre", FS_OK ? "Pas de dossier partagé : saisies sur ce poste seulement" : "Navigateur sans accès aux dossiers : saisies sur ce poste seulement"] }[K.dirEtat];
    const V = K.veille, veille = K.mode === "veille";
    const etatVeille = !relaisRegle() ? "" : veille
      ? (V.enCours ? `<span class="etat ok"><i></i>Copie en cours…</span>`
        : V.erreur ? `<span class="etat ko"><i></i>Relais : ${esc(V.erreur.slice(0, 60))}${V.echecs >= 2 ? " — passer en mode secours ?" : ""}</span>`
        : V.refus ? `<span class="etat attention"><i></i>Copie refusée : voir l'onglet Veille</span>`
        : `<span class="etat ok"><i></i>${V.copie || V.contact ? `Copies à jour${V.copie ? ` · ${heure(V.copie.t)}` : ""}` : "Veille active"}${dansPlage() ? "" : " · hors plage horaire"}</span>`)
      : (V.retour ? `<span class="etat ok"><i></i>Grist répond de nouveau (${heure(V.retour)}) : réintégrez les saisies</span>` : "");
    const vues = Object.entries(VUES).filter(([vid, v]) => v.page() && !(veille && vid === "saisie"));
    if (relaisRegle()) vues.unshift(["veille", { titre: "Veille" }]);
    b.classList.toggle("en-veille", veille);
    b.innerHTML = `<span class="marque">${veille ? "Mode veille" : "Mode secours"}</span>
      <span class="info">${K.agent ? `<b>${esc(K.agent)}</b>` : "<i>agent ?</i>"} · ${K.page ? esc(K.page.titre) : "<i>page ?</i>"}${info ? ` · <span title="${esc(info.fichier)}">copie du ${esc(dateHeure(info.modifie || info.charge_le))}</span>` : ""}${complementValable() ? ` · <span title="${esc(K.complement.info.fichier)}">dossiers de ${esc(heure(K.complement.info.genere_le || K.complement.info.modifie))}</span>` : ""}${K.reintegrees.size ? ` · ${K.reintegrees.size} saisie(s) déjà réintégrée(s)` : ""}</span>
      <span class="etat ${etat[0]}"><i></i>${etat[1]}</span>
      ${K.dirEtat === "reconnecter" ? `<button data-a="reconnecter" class="petit">Reconnecter</button>` : ""}
      ${K.nouvelleBase ? `<button data-a="maj-base" class="petit attention" title="Une copie plus récente du document a été déposée dans le dossier partagé">Copie plus récente disponible</button>` : ""}
      ${etatVeille}
      ${K.pret ? `<nav class="onglets">${vues.map(([vid, v]) => `<button data-a="vue" data-v="${vid}" class="onglet ${this.vue === vid ? "actif" : ""}">${esc(v.titre)}</button>`).join("")}</nav>` : ""}
      <span class="boutons">${K.pret ? `<button data-a="exports" class="petit">Exporter</button>` : ""}<button data-a="reglages" class="petit">Réglages</button></span>`;
    if (this.panneau === "reglages") this.ouvrirReglages(true);
    if (this.panneau === "exports") this.ouvrirExports(true);
    if (this.vue === "veille") this.majVeille();
  },
  ouvrirVue(vid) {
    if (vid === "veille" && !relaisRegle()) vid = "saisie";
    if (K.mode === "veille" && vid === "saisie" && relaisRegle()) vid = "veille";
    if (vid !== "veille" && (!VUES[vid] || !VUES[vid].page())) vid = "saisie";
    if (vid === "veille") {
      this.vue = vid; try { localStorage.setItem("kit-secours-vue", vid); } catch (_) {}
      if (!this.hoteVeille) {
        this.hoteVeille = document.createElement("div"); this.hoteVeille.className = "kit-panneau"; this.zone.appendChild(this.hoteVeille);
        this.rv = this.hoteVeille.attachShadow({ mode: "open" });
        this.rv.addEventListener("click", ev => this.clic(ev));
      }
      this.zone.querySelectorAll("iframe").forEach(x => { x.hidden = true; });
      this.hoteVeille.hidden = false;
      this.maj(); return;
    }
    if (this.hoteVeille) this.hoteVeille.hidden = true;
    this.vue = vid; try { localStorage.setItem("kit-secours-vue", vid); } catch (_) {}
    let f = this.zone.querySelector(`iframe[data-vue="${vid}"]`);
    if (!f) {
      f = document.createElement("iframe"); f.dataset.vue = vid; f.title = VUES[vid].titre;
      f.srcdoc = (window.__KIT_VUES__ || {})[vid] || "<p>Vue absente de ce kit.</p>";
      this.zone.appendChild(f);
    }
    this.zone.querySelectorAll("iframe").forEach(x => { x.hidden = x !== f; });
    this.maj();
  },
  // widgets recréés (nouvelle base) : les cadres sont refaits à la prochaine ouverture
  rechargerVues() { this.zone.querySelectorAll("iframe").forEach(f => f.remove()); this.ouvrirVue(this.vue || "veille"); },
  majVeille() {
    if (!this.rv) return;
    const V = K.veille, R = K.relais, veille = K.mode === "veille";
    const prochaine = V.copie ? new Date(V.copie.t + R.intervalle * 60000) : null;
    const ligne = (l, v) => `<tr><th>${l}</th><td>${v}</td></tr>`;
    this.rv.innerHTML = `<style>${CSS}${CSS_VEILLE}</style><div class="page-veille">
      <h2>${veille ? "Veille : copies automatiques du document" : "Mode secours : saisie hors ligne"}</h2>
      <p class="note">${veille
        ? `Grist est accessible : la saisie se fait dans Grist. Ce poste demande les copies au relais et les dépose dans le dossier partagé, de ${R.debut} h à ${R.fin} h, toutes les ${R.intervalle} minutes (un seul poste suffit ; les autres lisent les copies du dossier). Laissez cet onglet ouvert.`
        : `Les saisies sont faites sur la copie et réintégrées dans Grist au retour du réseau (Exporter › Saisies de tous les postes). Le relais est interrogé toutes les 5 minutes pour savoir quand Grist répond de nouveau.`}</p>
      ${V.refus ? `<div class="alerte"><b>Copie des dossiers refusée à ${heure(V.refus.t)}</b> : ${esc(V.refus.message)}. La copie précédente est gardée dans le dossier partagé.
        <p><button data-a="ecrire-refus" class="danger">Écrire quand même cette copie</button> <span class="note">si la baisse est normale (suppressions voulues dans Grist)</span></p></div>` : ""}
      <table class="etat-veille">
        ${ligne("Relais", V.erreur ? `<span class="ko">✗ ${esc(V.erreur)}</span>` : V.contact ? `<span class="ok">✓ dernier contact à ${heure(V.contact)}</span>` : "pas encore interrogé")}
        ${ligne("Dossier partagé", K.dir && K.dirEtat === "ok" ? `<span class="ok">✓ ${esc(K.dir.name)}</span>` : `<span class="ko">✗ ${K.dir ? "à reconnecter" : "aucun"}</span>`)}
        ${ligne("Copie des dossiers", V.copie ? `écrite à ${heure(V.copie.t)} — ${Object.entries(V.copie.compte).map(([t, n]) => `${esc(t)} ${n}`).join(", ")}${veille && prochaine ? ` · prochaine vers ${prochaine.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : ""}`
          : complementValable() ? `copie du dossier : ${esc(dateHeure(K.complement.info.genere_le || K.complement.info.modifie))}${K.complement.info.ecrit_par ? ` (par ${esc(K.complement.info.ecrit_par)})` : ""}` : "aucune")}
        ${ligne("Base (référentiels et structure)", V.base ? `${V.base.statut} à ${heure(V.base.t)}${V.base.taille ? ` (${(V.base.taille / 1048576).toFixed(1)} Mo)` : ""}` : K.base ? `copie du ${esc(dateHeure(K.base.info.modifie || K.base.info.charge_le))}` : "aucune")}
        ${ligne("Plage horaire", `${R.debut} h – ${R.fin} h${dansPlage() ? "" : " <span class=\"attention\">(hors plage : pas de copie)</span>"}`)}
      </table>
      <p>${veille ? `<button data-a="veille-maintenant" ${V.enCours || !K.dir ? "disabled" : ""}>${V.enCours ? "Copie en cours…" : "Faire les copies maintenant"}</button>
          <button data-a="mode-secours" class="danger">Passer en mode secours</button>`
        : `<button data-a="mode-veille" class="secondaire">Revenir en mode veille</button>`}
        <button data-a="reglages" class="secondaire">Réglages du relais</button></p>
      <h3>Derniers événements</h3>
      <ul class="evenements">${V.evenements.length ? V.evenements.map(e => `<li class="${e.gravite}"><span>${esc(dateHeure(e.t))}</span> ${esc(e.txt)}</li>`).join("") : "<li>—</li>"}</ul>
    </div>`;
  },
  majTraces() { const p = this.r && this.r.querySelector("#traces"); if (p) p.textContent = traces.slice().reverse().join("\n"); },
  fenetre(html, fermable = true) {
    const v = this.r.querySelector(".voile"), f = v.querySelector(".fenetre");
    const garde = f.scrollTop; f.innerHTML = (fermable ? `<button class="fermer" data-a="fermer" aria-label="Fermer">×</button>` : "") + html; f.scrollTop = garde; v.hidden = false;
  },
  fermer() { this.panneau = null; this.r.querySelector(".voile").hidden = true; },
  ouvrirReglages(rafraichir) {
    if (rafraichir && this.r.activeElement && /INPUT|SELECT/.test(this.r.activeElement.tagName)) return;   // ne pas couper une saisie
    this.panneau = "reglages";
    const info = K.base && K.base.info, pages = K.base ? pagesDeSaisie(K.base.tables) : [];
    const premier = !K.pret;
    const dossier = !FS_OK ? `<p class="note">Ce navigateur ne permet pas d'écrire dans un dossier (utilisez Edge ou Chrome). Les saisies restent sur ce poste ; échangez les journaux avec « Exporter ».</p>`
      : K.dir ? `<p>Dossier : <b>${esc(K.dir.name)}</b> — ${{ ok: "connecté", reconnecter: "autorisation à redonner", erreur: "injoignable : " + esc(K.dirErreur), aucun: "" }[K.dirEtat]}</p>
        <p>${K.dirEtat !== "ok" ? `<button data-a="reconnecter">Reconnecter</button>` : ""}<button data-a="choisir-dossier" class="secondaire">Choisir un autre dossier</button><button data-a="oublier-dossier" class="secondaire">Ne plus utiliser de dossier</button></p>
        ${K.autres.size ? `<p class="note">Autres postes : ${[...K.autres.values()].map(a => `${esc(a.agent)} (${a.entrees.length} saisie${a.entrees.length > 1 ? "s" : ""})`).join(", ")}</p>` : ""}`
      : `<p class="note">Choisissez le dossier réseau commun à l'équipe : chaque poste y écrit son journal et lit ceux des autres. Sans dossier, ce poste travaille seul.</p><p><button data-a="choisir-dossier">Choisir le dossier partagé</button></p>`;
    const fichiers = (K.fichiersDossier || []).filter(f => f.nom !== F_EMPREINTE).slice(0, 8);
    this.fenetre(`
      <h2>${premier ? "Mise en route du mode secours" : "Réglages du mode secours"}</h2>
      ${premier ? `<p class="note">Le formulaire fonctionne sans réseau à partir d'une copie du document Grist. Renseignez les quatre étapes, puis « Commencer la saisie ».</p>` : ""}
      <section><h3>1. Agent</h3>
        <label>Votre nom <input id="agent" value="${esc(K.agent)}" placeholder="Prénom Nom" autocomplete="off"></label>
        <p class="note">Noté comme auteur de chaque saisie. Poste n° ${K.posteNum} <button data-a="nouveau-poste" class="lien">changer</button></p></section>
      <section><h3>2. Dossier partagé</h3>${dossier}</section>
      <section><h3>3. Copie du document</h3>
        ${info ? `<p>Base : <b>${esc(info.fichier)}</b> (${info.source === "grist" ? "document Grist" : "fichier JSON"}, ${esc(dateHeure(info.modifie || info.charge_le))})${info.auto ? " — suit le dossier partagé" : ""}</p>
          <p>Dossiers : ${K.complement ? `<b>${esc(K.complement.info.fichier)}</b> (${esc(dateHeure(K.complement.info.genere_le || K.complement.info.modifie))})${complementValable() ? "" : " — plus ancien que la base, non utilisé"}` : "ceux de la base"}</p>`
          : `<p class="note">Aucune copie chargée. Dans Grist, menu du document › Télécharger › document (.grist), sans l'historique, puis déposez le fichier dans le dossier partagé.</p>`}
        <p class="note">Copies automatiques : « instantane-base.grist » (référentiel et configuration) et « instantane-dossiers.json » (réponses et sous-tables, écrites par le poste en mode veille) dans le dossier partagé ; les plus récentes sont prises d'office.</p>
        ${K.dir && K.dirEtat === "ok" ? (fichiers.length ? `<div class="liste">${fichiers.map(f => `<div><span>${esc(f.nom)} <small>${esc(dateHeure(f.mod))} · ${(f.taille / 1048576).toFixed(1)} Mo</small></span><button data-a="charger-dossier" data-nom="${esc(f.nom)}" class="petit secondaire">Charger</button></div>`).join("")}</div>` : `<p class="note">Aucun fichier .grist ou .json dans le dossier partagé.</p>`) : ""}
        <p><label class="bouton secondaire">Ouvrir un fichier (.grist ou .json)…<input type="file" id="fichier-base" accept=".grist,.json,.gz" hidden></label>
        ${window.__KIT_DEMO__ ? `<button data-a="demo" class="secondaire">Document de démonstration</button>` : ""}</p>
        <p class="etat-chargement" id="chargement"></p></section>
      <section><h3>4. Page de saisie</h3>
        ${pages.length ? `<select id="page">${pages.map(p => `<option value="${esc(p.cle)}" ${K.page && K.page.cle === p.cle ? "selected" : ""}>${esc(p.titre)}</option>`).join("")}</select>
          <p class="note">Les pages des agents reprennent leur périmètre et leurs réglages. Les formulaires seuls s'affichent sans périmètre.</p>`
        : `<p class="note">${K.base ? "Aucune page de saisie ni formulaire publié dans cette copie." : "Chargez d'abord une copie du document."}</p>`}</section>
      ${K.base && pagesTableau(K.base.tables).length ? `<section><h3>5. Tableau de bord</h3><select id="page-tableau">${pagesTableau(K.base.tables).map(p => `<option value="${esc(p.cle)}" ${K.pageTableau && K.pageTableau.cle === p.cle ? "selected" : ""}>${esc(p.titre)}</option>`).join("")}</select></section>` : ""}
      <section><h3>Relais n8n (mode veille)</h3>
        <p class="note">Pendant que Grist est accessible, un poste en mode veille demande les copies au relais et les dépose dans le dossier partagé. Facultatif : sans relais, déposez la copie à la main.</p>
        <label>Adresse du relais <input id="relais-url" value="${esc(K.relais.url)}" placeholder="https://n8n.exemple.fr/webhook/secours" autocomplete="off"></label>
        <label>Clé du relais <input id="relais-cle" type="password" value="${esc(K.relais.cle)}" autocomplete="off"></label>
        <div class="trois"><label>De (heure) <input id="relais-debut" type="number" min="0" max="23" value="${K.relais.debut}"></label>
          <label>À (heure) <input id="relais-fin" type="number" min="0" max="24" value="${K.relais.fin}"></label>
          <label>Toutes les (min) <input id="relais-intervalle" type="number" min="5" max="1440" value="${K.relais.intervalle}"></label></div>
        <p><button data-a="relais-enregistrer" class="secondaire">Enregistrer le relais</button><button data-a="relais-tester" class="secondaire">Tester</button>
          ${relaisRegle() && K.dir && K.dirEtat === "ok" ? `<button data-a="veille-maintenant" class="secondaire">Faire les copies maintenant</button>` : ""}</p>
        <p class="etat-chargement" id="relais-etat"></p></section>
      <p class="actions"><button data-a="commencer" class="principal" ${K.agent && K.base && pages.length ? "" : "disabled"}>${premier ? "Commencer la saisie" : "Appliquer et recharger le formulaire"}</button></p>
      ${premier ? "" : `<section><h3>Données de ce poste</h3><p>${K.journal.length} saisie(s) de ce poste, ${toutesEntrees().length - K.journal.length} d'autres postes.</p>
        <p><button data-a="effacer" class="danger">Effacer les données du mode secours sur ce poste…</button></p></section>`}
      <details><summary>Journal technique</summary><pre id="traces"></pre></details>
      <p class="note">Kit de secours ${esc(KIT_VERSION)} · widget ${esc(window.__KIT_WIDGET_VERSION__ || "?")}</p>`, !premier);
    this.majTraces();
  },
  ouvrirExports(rafraichir) {
    if (rafraichir && this.r.activeElement && /INPUT|SELECT/.test(this.r.activeElement.tagName)) return;
    this.panneau = "exports";
    const nHL = toutesEntrees().reduce((n, e) => n + (e.actions || []).filter(a => /AddRecord/.test(a[0])).length, 0);
    this.fenetre(`<h2>Exporter et sauvegarder</h2>
      <section><h3>Pour la réintégration dans Grist</h3>
        <p><button data-a="exp-consolide">Saisies de tous les postes (.json)</button></p>
        <p class="note">Un seul fichier avec les journaux de tous les postes connus de celui-ci (${1 + K.autres.size} poste(s), ${toutesEntrees().length} enregistrement(s)). C'est le fichier à réintégrer dans Grist au retour du réseau.</p></section>
      <section><h3>Sauvegarde de ce poste</h3>
        <p><button data-a="exp-journal" class="secondaire">Mes saisies (.json)</button></p>
        <p class="note">À faire de temps en temps si le dossier partagé est injoignable (clé USB, messagerie interne…).</p></section>
      <section><h3>Lecture dans Excel</h3>
        <p><button data-a="exp-csv" class="secondaire" ${nHL ? "" : "disabled"}>Lignes saisies en mode secours (.csv)</button></p>
        <p class="note">Un fichier par table, séparateur point-virgule.</p></section>
      <section><h3>Saisies d'un collègue</h3>
        <p><label class="bouton secondaire">Importer un journal (.json)…<input type="file" id="fichier-journal" accept=".json" multiple hidden></label></p>
        <p class="note">Pour un poste qui n'a pas pu écrire dans le dossier partagé.</p></section>`);
  },
  async clic(ev) {
    const b = ev.target.closest("[data-a]"); if (!b) return;
    const a = b.dataset.a;
    try {
      if (a === "fermer") this.fermer();
      else if (a === "reglages") this.ouvrirReglages();
      else if (a === "vue") this.ouvrirVue(b.dataset.v);
      else if (a === "relais-enregistrer" || a === "relais-tester") {
        const v = id => (this.r.querySelector(`#${id}`) || {}).value;
        const n = (x, d, min, max) => { const y = Math.round(Number(x)); return Number.isFinite(y) ? Math.min(max, Math.max(min, y)) : d; };
        K.relais = { url: String(v("relais-url") || "").trim(), cle: String(v("relais-cle") || "").trim(),
          debut: n(v("relais-debut"), 7, 0, 23), fin: n(v("relais-fin"), 20, 1, 24), intervalle: n(v("relais-intervalle"), 60, 5, 1440) };
        if (K.relais.fin <= K.relais.debut) K.relais.fin = Math.min(24, K.relais.debut + 1);
        await BD.ecrire("kv", K.relais, "relais");
        const zone = this.r.querySelector("#relais-etat");
        if (a === "relais-tester") {
          if (zone) zone.textContent = "Interrogation du relais…";
          try { const p = await appelRelais("ping"); if (zone) zone.textContent = `✓ Le relais répond et lit le document « ${p.document} » (${p.duree_grist_ms} ms côté Grist).`; }
          catch (e) { if (zone) zone.textContent = `✗ ${e.message}`; }
        } else {
          if (relaisRegle() && !(await BD.lire("kv", "mode"))) { K.mode = "veille"; await BD.ecrire("kv", "veille", "mode"); }
          if (zone) zone.textContent = relaisRegle() ? "Relais enregistré." : "Relais retiré : copies à déposer à la main.";
          this.maj();
        }
      }
      else if (a === "veille-maintenant") { await veilleTic(true); }
      else if (a === "mode-secours") { if (confirm("Passer en mode secours ?\n\nÀ faire quand Grist ne répond plus : la saisie se fera sur la copie du document, puis sera réintégrée dans Grist au retour du réseau.")) await passerEnMode("secours"); }
      else if (a === "mode-veille") {
        const n = K.journal.length;
        if (!confirm(`Revenir en mode veille ?${n ? `\n\nCe poste a ${n} enregistrement(s) du mode secours : vérifiez qu'ils ont été réintégrés dans Grist (Exporter › Saisies de tous les postes, puis widget de réintégration).` : ""}`)) return;
        await passerEnMode("veille");
      }
      else if (a === "ecrire-refus") {
        if (!K.veille.refus || !confirm(`Écrire la copie refusée à la place de la copie en place ?\n\n${K.veille.refus.message}`)) return;
        await ecrireCopieDossiers(K.veille.refus.copie); evenement("copie refusée écrite à la demande", "attention"); await lireDossier(); this.maj();
      }
      else if (a === "exports") this.ouvrirExports();
      else if (a === "reconnecter") await connecterDossier(true);
      else if (a === "choisir-dossier") { await choisirDossier(); await apresChoixDossier(); }
      else if (a === "oublier-dossier") { await oublierDossier(); this.ouvrirReglages(); }
      else if (a === "nouveau-poste") { if (K.journal.length && !confirm("Ce poste a déjà des saisies. Changer de numéro ne les modifie pas ; les prochaines lignes prendront le nouveau numéro. Continuer ?")) return; K.posteNum = tirerPoste(); K.seq = 0; await BD.ecrire("kv", K.posteNum, "poste"); await BD.ecrire("kv", 0, "seq"); this.ouvrirReglages(); }
      else if (a === "charger-dossier") await this.chargerBase(() => chargerDepuisDossier(b.dataset.nom));
      else if (a === "maj-base") { if (confirm(`Recharger le formulaire avec la copie plus récente « ${K.nouvelleBase.nom} » ? Les saisies du mode secours sont conservées.`)) { await this.chargerBase(() => chargerDepuisDossier(K.nouvelleBase.nom), true); } }
      else if (a === "demo") await this.chargerBase(async () => ({ info: { nom: "Démonstration", source: "json", fichier: "démonstration (intégrée au kit)", modifie: null, charge_le: new Date().toISOString(), cle: "demo" }, tables: copie(window.__KIT_DEMO__) }));
      else if (a === "commencer") await this.commencer();
      else if (a === "effacer") {
        if (!confirm("Effacer la copie du document et le journal des saisies de ce poste ?\n\nExportez d'abord « Mes saisies » si elles ne sont pas déjà dans le dossier partagé.")) return;
        await BD.vider("journal"); await BD.vider("base"); for (const k of ["page", "pageTableau", "autres", "seq"]) await BD.suppr("kv", k); location.reload();
      }
      else if (a === "exp-consolide") exporterConsolide();
      else if (a === "exp-journal") exporterMonJournal();
      else if (a === "exp-csv") exporterCSV();
    } catch (e) { if (e && e.name === "AbortError") return; alert(`Mode secours : ${e.message}`); trace(`Erreur : ${e.message}`); }
  },
  async changement(ev) {
    const c = ev.target;
    if (c.id === "agent") { K.agent = c.value.trim(); await BD.ecrire("kv", K.agent, "agent"); this.maj(); }
    else if (c.id === "page") { /* lu par « commencer » */ }
    else if (c.id === "fichier-base" && c.files[0]) { const f = c.files[0]; await this.chargerBase(() => lireCopie(f)); }
    else if (c.id === "fichier-journal" && c.files.length) { await importerJournaux([...c.files]); this.ouvrirExports(); }
  },
  async chargerBase(lire, relancer) {
    const zone = this.r.querySelector("#chargement"); if (zone) zone.textContent = "Lecture de la copie…";
    await attendre(30);
    try {
      const t0 = performance.now(), base = await lire();
      const nb = Object.entries(base.tables).filter(([n]) => !n.startsWith("_grist")).map(([n, t]) => `${n} (${t.id.length})`);
      if (base.info.complement) {
        if (!K.base) throw new Error("ce fichier ne contient que les dossiers (complément) : chargez d'abord la base (référentiel et configuration).");
        K.complement = base; await BD.ecrire("base", base, "complement");
        trace(`Complément chargé : ${base.info.fichier} — ${nb.join(", ")}`);
        if (K.pret) { await BD.ecrire("kv", K.page, "page"); location.reload(); return; }
        this.ouvrirReglages(); return;
      }
      await BD.ecrire("base", base, "courante");
      K.base = base;
      if (base.info.fichier && NOM_BASE.test(base.info.fichier) && K.dir) base.info.auto = true;
      trace(`Copie chargée : ${base.info.fichier} en ${Math.round(performance.now() - t0)} ms — ${nb.join(", ")}`);
      if (K.page && !pagesDeSaisie(base.tables).some(p => p.cle === K.page.cle)) K.page = null;
      if (relancer || K.pret) { await BD.ecrire("kv", K.page, "page"); location.reload(); return; }
      this.ouvrirReglages();
    } catch (e) { if (zone) zone.textContent = `Lecture impossible : ${e.message}`; trace(`Copie illisible : ${e.message}`); }
  },
  async commencer() {
    const sel = this.r.querySelector("#page"), agent = this.r.querySelector("#agent");
    if (agent) { K.agent = agent.value.trim(); await BD.ecrire("kv", K.agent, "agent"); }
    if (!K.agent) { alert("Indiquez votre nom."); return; }
    const p = pagesDeSaisie(K.base.tables).find(x => x.cle === (sel && sel.value));
    if (!p) { alert("Choisissez une page de saisie."); return; }
    const garder = K.page && K.page.cle === p.cle ? K.page.widgetOptions : p.widgetOptions;
    K.page = { ...p, widgetOptions: garder };
    await BD.ecrire("kv", K.page, "page");
    const st = this.r.querySelector("#page-tableau"), pt = st && pagesTableau(K.base.tables).find(x => x.cle === st.value);
    K.pageTableau = pt ? (K.pageTableau && K.pageTableau.cle === pt.cle ? { ...pt, widgetOptions: K.pageTableau.widgetOptions } : pt) : null;
    await BD.ecrire("kv", K.pageTableau, "pageTableau");
    location.reload();
  },
};
function tirerPoste() { const a = new Uint32Array(1); crypto.getRandomValues(a); return 1 + (a[0] % 999999); }
// dossier choisi pendant la mise en route : copies du dossier prises d'office
async function apresChoixDossier() {
  if (K.dirEtat === "ok" && !K.pret) { await lireDossierAvantDemarrage(); await copiesDuDossierAuDemarrage(); }
  UI.ouvrirReglages();
}
async function lireDossierAvantDemarrage() {
  try {
    const c = [];
    for await (const [nom, h] of K.dir.entries()) if (h.kind === "file" && /\.(grist|json|json\.gz)$/i.test(nom) && !nom.startsWith(PREFIXE_JOURNAL)) { const f = await h.getFile(); c.push({ nom, mod: f.lastModified, taille: f.size }); }
    K.fichiersDossier = c.sort((a, b) => b.mod - a.mod);
  } catch (e) { trace(`Dossier illisible : ${e.message}`); }
}

const CSS_VEILLE = `
.page-veille { max-width: 860px; margin: 0 auto; padding: 18px 16px 40px; }
.page-veille h2 { margin-top: 4px; }
.etat-veille { width: 100%; border-collapse: collapse; margin: 12px 0; background: #fff; border: 1px solid #e3e6eb; border-radius: 6px; }
.etat-veille th { text-align: left; font-weight: 600; width: 34%; padding: 7px 10px; border-bottom: 1px solid #eef0f3; color: #3a4150; }
.etat-veille td { padding: 7px 10px; border-bottom: 1px solid #eef0f3; }
.ok { color: #18794e; } .ko { color: #c0362c; } .attention { color: #b45f06; }
.alerte { border-left: 4px solid #b45f06; background: #fff7e6; padding: 8px 12px; margin: 10px 0; border-radius: 4px; }
.evenements { list-style: none; padding: 0; margin: 6px 0; font-size: 12.5px; }
.evenements li { padding: 3px 0; border-bottom: 1px solid #eef0f3; } .evenements li span { color: #5d6675; margin-right: 6px; }
.evenements li.ko { color: #c0362c; } .evenements li.attention { color: #b45f06; } .evenements li.ok { color: #18794e; }
`;
const CSS = `
:host { all: initial; display: block; font: 13px/1.4 system-ui, "Segoe UI", Marianne, Arial, sans-serif; color: #1e2430; }
* { box-sizing: border-box; }
.barre { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; padding: 6px 12px; background: #fff7e6; border-bottom: 2px solid #c0362c; }
.barre.en-veille { background: #eef6f1; border-bottom-color: #18794e; } .barre.en-veille .marque { background: #18794e; }
.trois { display: flex; gap: 10px; } .trois label { flex: 1; }
input[type=number], input[type=password] { font: inherit; width: 100%; padding: 6px 8px; border: 1px solid #c9ced6; border-radius: 4px; margin-top: 4px; }
.marque { background: #c0362c; color: #fff; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; font-size: 11px; padding: 3px 8px; border-radius: 3px; }
.info { color: #3a4150; }
.etat { display: inline-flex; align-items: center; gap: 6px; padding: 2px 9px; border-radius: 999px; border: 1px solid #d5d9e0; background: #fff; }
.etat i { width: 8px; height: 8px; border-radius: 50%; background: #8a93a3; }
.etat.ok i { background: #18794e; } .etat.attention i { background: #b45f06; } .etat.ko { background: #fde8e6; border-color: #f0b3ad; } .etat.ko i { background: #c0362c; }
.boutons { margin-left: auto; white-space: nowrap; }
.onglets { display: inline-flex; gap: 2px; margin-left: 8px; }
.onglet { background: #fff; color: #000091; border: 1px solid #c9ced6; padding: 3px 10px; margin: 0; }
.onglet.actif { background: #000091; color: #fff; border-color: #000091; }
button, .bouton { font: inherit; border-radius: 4px; padding: 6px 12px; cursor: pointer; border: 1px solid #000091; background: #000091; color: #fff; display: inline-block; margin: 2px 6px 2px 0; }
button.petit { padding: 3px 10px; }
button.secondaire, .bouton.secondaire { background: #fff; color: #000091; }
button.attention { background: #b45f06; border-color: #b45f06; }
button.danger { background: #fff; color: #c0362c; border-color: #c0362c; }
button.lien { background: none; border: 0; color: #000091; text-decoration: underline; padding: 0; margin: 0; }
button:disabled { opacity: .45; cursor: not-allowed; }
.voile { position: fixed; inset: 0; background: rgba(20, 24, 33, .45); z-index: 2147483000; display: flex; align-items: flex-start; justify-content: center; padding: 4vh 12px; }
.voile[hidden] { display: none; }
.fenetre { position: relative; background: #fff; border-radius: 8px; width: min(640px, 100%); max-height: 92vh; overflow: auto; padding: 18px 20px; box-shadow: 0 10px 40px rgba(0,0,0,.25); }
.fermer { position: absolute; top: 8px; right: 8px; background: none; border: 0; color: #3a4150; font-size: 22px; line-height: 1; padding: 2px 8px; }
h2 { font-size: 18px; margin: 0 0 10px; } h3 { font-size: 14px; margin: 0 0 6px; }
section { border-top: 1px solid #e3e6eb; padding: 10px 0; }
label { display: block; } input:not([type]), input[type=text], select { font: inherit; width: 100%; padding: 6px 8px; border: 1px solid #c9ced6; border-radius: 4px; margin-top: 4px; }
.note { color: #5d6675; font-size: 12.5px; margin: 4px 0; }
p { margin: 6px 0; }
.liste { border: 1px solid #e3e6eb; border-radius: 4px; margin: 6px 0; }
.liste div { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 4px 8px; border-bottom: 1px solid #eef0f3; }
.liste div:last-child { border-bottom: 0; } .liste small { color: #5d6675; }
.actions { text-align: right; } .principal { font-weight: 600; }
.etat-chargement { color: #5d6675; min-height: 1em; }
pre { white-space: pre-wrap; font-size: 11.5px; background: #f4f5f7; padding: 8px; border-radius: 4px; max-height: 200px; overflow: auto; }
details summary { cursor: pointer; color: #5d6675; margin: 8px 0; }
`;

/* ---------- démarrage ---------- */
async function demarrer() {
  UI.monter();
  K.agent = (await BD.lire("kv", "agent")) || "";
  K.posteNum = await BD.lire("kv", "poste"); if (!K.posteNum) { K.posteNum = tirerPoste(); await BD.ecrire("kv", K.posteNum, "poste"); }
  K.seq = (await BD.lire("kv", "seq")) || 0;
  K.page = (await BD.lire("kv", "page")) || null;
  K.pageTableau = (await BD.lire("kv", "pageTableau")) || null;
  K.base = (await BD.lire("base", "courante")) || null;
  K.journal = ((await BD.tout("journal")) || []).sort(ordre);
  K.seq = Math.max(K.seq, ...K.journal.flatMap(e => (e.actions || []).flatMap(a => (a[0] === "AddRecord" ? [a[2]] : a[0] === "BulkAddRecord" ? a[2] : [])))
    .filter(id => id >= BASE_HORS_LIGNE + K.posteNum * PAR_POSTE && id < BASE_HORS_LIGNE + (K.posteNum + 1) * PAR_POSTE).map(id => id - BASE_HORS_LIGNE - K.posteNum * PAR_POSTE));
  for (const [f, d] of (await BD.lire("kv", "autres")) || []) K.autres.set(f, d);
  K.complement = (await BD.lire("base", "complement")) || null;
  K.relais = { ...RELAIS_DEFAUT, ...((await BD.lire("kv", "relais")) || {}) };
  K.mode = (await BD.lire("kv", "mode")) || (relaisRegle() ? "veille" : "secours");
  K.veille.evenements = (await BD.lire("kv", "veille-evenements")) || [];
  // la veille tourne aussi avant la mise en route : un premier poste peut récupérer la base et les dossiers
  setTimeout(() => veilleTic(), 4000 + Math.random() * 20000);
  setInterval(() => veilleTic(), 60000);
  if (FS_OK) { const h = await BD.lire("kv", "dossier"); if (h) { K.dir = h; await connecterDossier(false); if (K.dirEtat === "ok") { await lireDossierAvantDemarrage(); await copiesDuDossierAuDemarrage(); } } }
  else K.dirEtat = "aucun";
  if (!K.agent || !K.base || !K.page) { trace("Réglages à compléter avant la saisie"); UI.ouvrirReglages(); return; }
  const t0 = performance.now();
  reconstruireDoc();
  // tableau de bord : celui choisi, sinon le premier publié dans la copie
  { const pt = pagesTableau(K.base.tables); if (!K.pageTableau || !pt.some(p => p.cle === K.pageTableau.cle)) K.pageTableau = pt[0] || null; }
  K.pret = true;
  trace(`Formulaire prêt : ${K.journal.length} saisie(s) de ce poste et ${toutesEntrees().length - K.journal.length} d'autres postes rejouées en ${Math.round(performance.now() - t0)} ms`);
  resoudrePret();
  let vue = K.mode === "veille" && relaisRegle() ? "veille" : "saisie"; try { vue = localStorage.getItem("kit-secours-vue") || vue; } catch (_) {}
  UI.ouvrirVue(vue);
  if (K.dirEtat === "ok") { await lireDossier(); if (K.enAttente || K.journal.length) ecrireJournalPartage(); }
  setInterval(tic, DELAI_LECTURE);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) tic(); });
}
// pour les essais automatisés
window.__KIT__ = { K, pret, tic, UI, VUES, veilleTic, passerEnMode, connecter: async h => { K.dir = h; await BD.ecrire("kv", h, "dossier").catch(() => {}); const r = await connecterDossier(false); if (!K.pret) await apresChoixDossier(); return r; }, lireDossier, lireCopie, importerJournaux, exporterCSV, BASE_HORS_LIGNE };

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", demarrer); else demarrer();
})();
