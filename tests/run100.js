// Administration › Installation, carte « Mode secours » : téléchargement du kit (version comparée à celle du socle),
// du relais n8n préréglé pour le document (API, document, clé tirée au hasard, chemin propre), page de réintégration.
// Les widgets sont servis en http (le kit et le relais sont lus à côté de l'administration, ce qu'une page file:// ne peut pas faire).
// Prérequis : node ../outils/construire-secours.js
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path'), http = require('http');
const { docSites } = require('./run78');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.geojson': 'application/json' };
const serveur = http.createServer((q, r) => {
  const f = path.join(__C.racine, decodeURIComponent(new URL(q.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
  if (!f.startsWith(__C.racine) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
}).listen(8831);
(async () => {
  const doc = docSites();
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const page = await (await browser.newContext({ acceptDownloads: true, viewport: { width: 1300, height: 1400 } })).newPage();
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => d.accept());
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js')   // sans fakeapi.js, qui remplace fetch
    + `;grist.onRecords=()=>{};grist.getOption=async()=>null;grist.setOption=async()=>{};grist.docApi.getAccessToken=async()=>({token:'t',baseUrl:'https://grist.numerique.gouv.fr/o/crise/api/docs/jDpuGM63egPP',ttl:300});` }));
  await page.goto('http://localhost:8831/v2/admin/index.html'); await page.waitForTimeout(1500);
  console.log('CARTE :', (await page.innerText('#carte-secours')).replace(/\s+/g, ' ').slice(0, 260));
  // kit
  const [dk] = await Promise.all([page.waitForEvent('download'), page.click('#sec-kit')]); await page.waitForTimeout(300);
  const kit = fs.readFileSync(await dk.path(), 'utf8');
  console.log('KIT :', dk.suggestedFilename(), (kit.length / 1048576).toFixed(1), 'Mo |', kit.match(/<!-- Kit de secours [^—]+/)[0], '| statut :', await page.textContent('#sec-statut'));
  // relais
  const [dr] = await Promise.all([page.waitForEvent('download'), page.click('#sec-n8n')]); await page.waitForTimeout(300);
  const w = JSON.parse(fs.readFileSync(await dr.path(), 'utf8')), js = w.nodes.find(n => n.name === 'Lecture de Grist').parameters.jsCode, wh = w.nodes.find(n => n.type === 'n8n-nodes-base.webhook');
  const val = k => (js.match(new RegExp(`const ${k} = '([^']*)'`)) || [])[1];
  const cle = await page.textContent('#sec-cle');
  console.log('RELAIS :', dr.suggestedFilename(), '| nom :', w.name, '| chemin :', wh.parameters.path, '| webhookId neuf :', wh.webhookId !== '3e9b6f2a-8c1d-4b7e-a5f0-6d2c9e1b4a77');
  console.log('RÉGLAGES :', JSON.stringify({ API_GRIST: val('API_GRIST'), DOC: val('DOC'), CLE_GRIST: val('CLE_GRIST'), cle_kit_affichee: val('CLE_KIT') === cle, longueur: cle.length }));
  console.log('CLÉ DANS LE DOCUMENT ?', (await page.evaluate(() => JSON.stringify(window.__DOC__))).includes(cle));
  console.log('ENCADRÉ :', (await page.innerText('#sec-relais')).replace(/\s+/g, ' ').slice(0, 200));
  // second téléchargement : nouvelle clé
  const [dr2] = await Promise.all([page.waitForEvent('download'), page.click('#sec-n8n')]); await page.waitForTimeout(300);
  console.log('NOUVELLE CLÉ :', (await page.textContent('#sec-cle')) !== cle);
  // page de réintégration
  await page.click('#sec-creer-page'); await page.waitForTimeout(600);
  console.log('PAGE :', await page.textContent('#sec-page'), '|', await page.textContent('#sec-statut'));
  console.log('VUE :', await page.evaluate(() => { const S = window.__DOC__._grist_Views_section, i = S.id.length - 1; return JSON.parse(JSON.parse(S.options[i]).customView).url + ' | table ' + S.tableRef[i] + ' | ' + window.__DOC__._grist_Views.name.slice(-1)[0]; }));
  await page.screenshot({ path: path.join(__C.sorties, 'admin-secours.png'), clip: await (await page.$('#carte-secours')).boundingBox() });
  await browser.close(); serveur.close();
})();
