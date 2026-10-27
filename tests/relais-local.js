// Relais local pour les essais : exécute le code du nœud « Lecture de Grist » de v2/secours/relais-n8n.json
// comme le ferait n8n (même $input, même this.helpers.httpRequest, mêmes réponses), sans installer n8n.
const http = require("http"), fs = require("fs"), path = require("path");

function codeDuWorkflow(reglages) {
  const w = JSON.parse(fs.readFileSync(path.join(__dirname, "../v2/secours/relais-n8n.json"), "utf8"));
  let js = w.nodes.find(n => n.name === "Lecture de Grist").parameters.jsCode;
  for (const [cle, val] of Object.entries(reglages)) {
    const re = new RegExp(`const ${cle} = '[^']*';`);
    if (!re.test(js)) throw new Error(`réglage ${cle} introuvable dans le workflow`);
    js = js.replace(re, `const ${cle} = ${JSON.stringify(val)};`);
  }
  return js;
}
// this.helpers.httpRequest de n8n : erreur si le statut n'est pas 2xx ; json lu ; arraybuffer → Buffer
async function httpRequest(o) {
  const r = await fetch(o.url, { method: o.method || "GET", headers: o.headers, body: o.body ? JSON.stringify(o.body) : undefined, signal: AbortSignal.timeout(o.timeout || 300000) });
  if (!r.ok) throw new Error(`Request failed with status code ${r.status}`);
  const type = r.headers.get("content-type") || "";
  const body = o.encoding === "arraybuffer" ? Buffer.from(await r.arrayBuffer()) : /json/.test(type) ? await r.json() : await r.text();
  return o.returnFullResponse ? { body, headers: Object.fromEntries(r.headers), statusCode: r.status } : body;
}
function creer({ port = 8811, reglages }) {
  const code = codeDuWorkflow(reglages), AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const executer = new AsyncFunction("$input", "Buffer", code);
  const appels = [];
  const serveur = http.createServer(async (q, r) => {
    const u = new URL(q.url, "http://x"); if (u.pathname !== "/webhook/secours") { r.writeHead(404); return r.end(); }
    const query = Object.fromEntries(u.searchParams); appels.push(query.quoi);
    const cors = { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" };
    try {
      const [item] = await executer.call({ helpers: { httpRequest } }, { first: () => ({ json: { query } }) }, Buffer);
      if (item.json.binaire) { r.writeHead(200, { ...cors, "Content-Type": "application/octet-stream" }); return r.end(Buffer.from(item.binary.data.data, "base64")); }
      r.writeHead(item.json.statut, { ...cors, "Content-Type": "application/json; charset=utf-8" }); r.end(JSON.stringify(item.json.corps));
    } catch (e) { r.writeHead(500); r.end(String(e)); }   // comme n8n quand le workflow s'arrête : pas d'en-tête CORS
  }).listen(port);
  return { url: `http://localhost:${port}/webhook/secours`, appels, fermer: () => new Promise(ok => serveur.close(ok)) };
}
module.exports = { creer };
