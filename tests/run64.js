// Export « Atlas QGIS » du widget de cartographie
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs'); const http = require('http'); const path = require('path');
const RACINE = __C.racine;
const srv = http.createServer((q, r) => { if (q.url.includes('atlas')) console.log('GET', q.url); const f = path.join(RACINE, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f.endsWith('/') ? f + 'index.html' : f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200); r.end(d); } }); }).listen(8765);
const src = fs.readFileSync('run27.js', 'utf8'); const mkDoc = eval('(' + src.slice(src.indexOf('(sansDep) =>'), src.indexOf('\n};\n') + 2) + ')');
(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const doc = mkDoc(false);
  { // référentiel au nom de colonne différent (Type → Type_etablissement), date des faits dans les réponses
    const E = doc.__data.Etablissements; E.Type_etablissement = E.Type; delete E.Type;
    const C = doc._grist_Tables_column, T = doc._grist_Tables, te = T.id[T.tableId.indexOf('Etablissements')], tr = T.id[T.tableId.indexOf('Reponses')];
    C.colId.forEach((c, k) => { if (c === 'Type' && C.parentId[k] === te) { C.colId[k] = 'Type_etablissement'; C.label[k] = 'Type_etablissement'; } });
    const R = doc.__data.Reponses; R.Date_faits = R.id.map((_, i) => 1760000000 + i * 86400);
    const nid = Math.max(...C.id) + 1; for (const k of Object.keys(C)) C[k].push(k === 'id' ? nid : k === 'parentId' ? tr : k === 'colId' || k === 'label' ? 'Date_faits' : k === 'type' ? 'Date' : k === 'isFormula' ? false : (typeof C[k][0] === 'number' ? 0 : typeof C[k][0] === 'boolean' ? false : ''));
  }
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 }, acceptDownloads: true });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.route('**/leaflet.min.*', r => r.abort());
  await page.route('**/jszip.min.js', r => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(require.resolve('jszip/dist/jszip.min.js')) }));
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__vraiFetch=window.fetch.bind(window);window.__DOC__=${JSON.stringify(doc)};window.__OPTS__={};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + fs.readFileSync('mock-saisie.js') + `;{const f=window.fetch;window.fetch=(u,...a)=>String(u).includes('/atlas/')?window.__vraiFetch(u,...a):f(u,...a);}` }));
  await page.goto('http://localhost:8765/v2/cartographie/index.html'); await page.waitForTimeout(2500);
  await page.selectOption('#format', 'atlas'); await page.waitForTimeout(400);
  console.log('ATLAS options :', await page.inputValue('#atlasTitre'), '|', await page.inputValue('#atlasDate'));
  await page.fill('#atlasTitre', 'Trafic de drogue aux abords des établissements'); console.log('défauts :', await page.inputValue('#atlasLignes'), await page.isChecked('#atlasIgn')); await page.fill('#atlasLignes', '3'); await page.evaluate(() => document.querySelectorAll('#atlasBox details').forEach(d => d.open = true)); await page.uncheck('#atlasIgn');
  console.log('download désactivé ?', await page.$eval('#download', b => b.disabled), '| entités', await page.evaluate(() => state.features.length));
  const pdl = page.waitForEvent('download', { timeout: 15000 }).catch(() => null); await page.click('#download'); const dl = await pdl;
  if (!dl) { console.log('MESSAGES :', (await page.textContent('#messages')).trim().slice(0, 300)); await browser.close(); srv.close(); return; }
  const out = __C.sorties + '/atlas2/export64.zip';
  await dl.saveAs(out); console.log('ZIP :', dl.suggestedFilename(), fs.statSync(out).size);
  console.log('MESSAGES :', (await page.textContent('#messages')).trim().slice(0, 200));
  await browser.close(); srv.close();
})();
