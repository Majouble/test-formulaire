// Faux serveur de l'API REST de Grist (pour les essais du relais n8n et du mode veille), à partir d'un document
// d'essai au format des tests ({ _grist_Tables, _grist_Tables_column, …, __data } ou { tables }).
// Routes : /o/<org>/api/docs/<doc>[ /tables | /tables/T/columns | /tables/T/records | /sql (POST) | /download ]
// Contrôle des essais : faux.etat.panne = true (connexions coupées), faux.etat.reponsesEnPlus = n, faux.appels.
const http = require("http"), fs = require("fs"), path = require("path");
const initSqlJs = require("../v2/secours/vendor/sql-wasm.js");

async function documentGrist(tables) {
  const S = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(__dirname, "../v2/secours/vendor/sql-wasm.wasm")) });
  const db = new S.Database();
  for (const [n, t] of Object.entries(tables)) {
    const cols = Object.keys(t), q = c => `"${c.replace(/"/g, '""')}"`;
    db.run(`CREATE TABLE ${q(n)} (${cols.map(c => q(c) + (c === "id" ? " INTEGER PRIMARY KEY" : "")).join(", ")})`);
    const st = db.prepare(`INSERT INTO ${q(n)} VALUES (${cols.map(() => "?").join(",")})`);
    (t.id || []).forEach((_, i) => st.run(cols.map(c => { const v = t[c][i]; return typeof v === "boolean" ? +v : v && typeof v === "object" ? JSON.stringify(v) : v === undefined ? null : v; })));
    st.free();
  }
  db.run(`CREATE TABLE "_gristsys_ActionHistory" (id INTEGER PRIMARY KEY, x TEXT)`);
  const o = db.export(); db.close(); return { octets: Buffer.from(o), S };
}

function creer({ doc, org = "crise", id = "docdemo", cle = "cleg", port = 8801 }) {
  const etat = { panne: false, reponsesEnPlus: 0, etabsEnPlus: 0 }, appels = {};
  const tablesDoc = () => {
    const t = {}; for (const [k, v] of Object.entries(doc)) if (k.startsWith("_grist_")) t[k] = v;
    Object.assign(t, JSON.parse(JSON.stringify(doc.__data || doc.tables || {})));
    const R = t.Reponses;
    for (let k = 0; k < etat.reponsesEnPlus; k++) { const i = k % R.id.length, nid = 1000 + k; for (const c of Object.keys(R)) R[c].push(c === "id" ? nid : c === "Dossier" ? nid : R[c][i]); }
    const E = t.Etablissements;
    for (let k = 0; k < etat.etabsEnPlus; k++) for (const c of Object.keys(E)) E[c].push(c === "id" ? 5000 + k : E[c][k % E.id.length]);
    return t;
  };
  const colonnes = (t, n) => { const T = t._grist_Tables, C = t._grist_Tables_column, ref = T.id[T.tableId.indexOf(n)];
    return C.id.map((_, i) => i).filter(i => C.parentId[i] === ref).map(i => ({ id: C.colId[i], fields: { type: C.type[i], isFormula: !!(C.isFormula && C.isFormula[i]) } })); };
  const serveur = http.createServer(async (q, r) => {
    if (etat.panne) return q.socket.destroy();
    const u = new URL(q.url, "http://x"), base = `/o/${org}/api/docs/${id}`;
    const j = (o, s = 200) => { r.writeHead(s, { "Content-Type": "application/json" }); r.end(JSON.stringify(o)); };
    if (!u.pathname.startsWith(base)) { r.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); return r.end("<!doctype html><html><head><title>Grist</title></head></html>"); }
    if (q.headers.authorization !== `Bearer ${cle}`) return j({ error: "Unauthorized" }, 401);
    const p = u.pathname.slice(base.length), t = tablesDoc(), noms = Object.keys(t).filter(n => !n.startsWith("_grist"));
    appels[p.replace(/\/tables\/[^/]+\//, "/tables/T/")] = (appels[p.replace(/\/tables\/[^/]+\//, "/tables/T/")] || 0) + 1;
    try {
      if (p === "") return j({ name: "Document d'essai", id });
      if (p === "/tables") return j({ tables: noms.map(id => ({ id, fields: {} })) });
      let m = p.match(/^\/tables\/([^/]+)\/(columns|records)$/);
      if (m) { const n = decodeURIComponent(m[1]); if (!t[n]) return j({ error: `Table not found "${n}"` }, 404);
        if (m[2] === "columns") return j({ columns: colonnes(t, n) });
        const T = t[n], cs = Object.keys(T).filter(c => c !== "id" && c !== "manualSort");
        return j({ records: T.id.map((rid, i) => ({ id: rid, fields: Object.fromEntries(cs.map(c => [c, T[c][i] === undefined ? null : T[c][i]])) })) }); }
      if (p === "/sql" && q.method === "POST") {
        let corps = ""; for await (const x of q) corps += x;
        const { octets, S } = await documentGrist(t), db = new S.Database(octets);
        try { const res = db.exec(JSON.parse(corps).sql)[0] || { columns: [], values: [] }; return j({ records: res.values.map(v => ({ fields: Object.fromEntries(res.columns.map((c, k) => [c, v[k]])) })) }); }
        finally { db.close(); }
      }
      if (p === "/download") { const { octets } = await documentGrist(t); r.writeHead(200, { "Content-Type": "application/x-sqlite3" }); return r.end(octets); }
      return j({ error: "?" }, 404);
    } catch (e) { return j({ error: e.message }, 500); }
  }).listen(port);
  return { serveur, etat, appels, url: `http://localhost:${port}/o/${org}/api`, id, cle, fermer: () => new Promise(ok => serveur.close(ok)) };
}
module.exports = { creer, documentGrist };
