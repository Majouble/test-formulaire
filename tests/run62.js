// Export « Atlas QGIS » du widget de cartographie
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs'); const http = require('http'); const path = require('path');
const RACINE = __C.racine;
const srv = http.createServer((q, r) => { if (q.url.includes('atlas')) console.log('GET', q.url); const f = path.join(RACINE, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f.endsWith('/') ? f + 'index.html' : f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200); r.end(d); } }); }).listen(8765);
const src = fs.readFileSync('run27.js', 'utf8'); const mkDoc = eval('(' + src.slice(src.indexOf('(sansDep) =>'), src.indexOf('\n};\n') + 2) + ')');
(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const doc = mkDoc(false);
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 }, acceptDownloads: true });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.route('**/leaflet.min.*', r => r.abort());
  await page.route('**/jszip.min.js', r => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(require.resolve('jszip/dist/jszip.min.js')) }));
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__vraiFetch=window.fetch.bind(window);window.__DOC__=${JSON.stringify(doc)};window.__OPTS__={};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + fs.readFileSync('mock-saisie.js') + `;{const f=window.fetch;window.fetch=(u,...a)=>String(u).includes('/atlas/')?window.__vraiFetch(u,...a):f(u,...a);}` }));
  await page.goto('http://localhost:8765/v2/cartographie/index.html'); await page.waitForTimeout(2500);
  await page.selectOption('#format', 'atlas'); await page.waitForTimeout(400);
  console.log('ATLAS options :', await page.inputValue('#atlasTitre'), '|', await page.inputValue('#atlasDate'));
  await page.fill('#atlasTitre', 'Trafic de drogue aux abords des établissements');
  console.log('download désactivé ?', await page.$eval('#download', b => b.disabled), '| entités', await page.evaluate(() => state.features.length));
  const pdl = page.waitForEvent('download', { timeout: 15000 }).catch(() => null); await page.click('#download'); const dl = await pdl;
  if (!dl) { console.log('MESSAGES :', (await page.textContent('#messages')).trim().slice(0, 300)); await browser.close(); srv.close(); return; }
  const out = __C.sorties + '/atlas/export.zip';
  await dl.saveAs(out); console.log('ZIP :', dl.suggestedFilename(), fs.statSync(out).size);
  console.log('MESSAGES :', (await page.textContent('#messages')).trim().slice(0, 200));
  await browser.close(); srv.close();
})();
