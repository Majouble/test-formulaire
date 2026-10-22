// Atlas : établissements cités dans une sous-table (référence au référentiel) : points propres, pages, encarts, étiquettes
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs'); const http = require('http'); const path = require('path');
const RACINE = __C.racine, S = __C.sorties + '/atlas2';
const srv = http.createServer((q, r) => { const f = path.join(RACINE, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f.endsWith('/') ? f + 'index.html' : f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200); r.end(d); } }); }).listen(8767);
const src = fs.readFileSync('run27.js', 'utf8'); const mkDoc = eval('(' + src.slice(src.indexOf('(sansDep) =>'), src.indexOf('\n};\n') + 2) + ')');
async function telecharger(page, out) {
  const pdl = page.waitForEvent('download', { timeout: 20000 }).catch(() => null); await page.click('#download'); const dl = await pdl;
  if (!dl) { console.log('MESSAGES :', (await page.textContent('#messages')).trim().slice(0, 400)); return false; }
  await dl.saveAs(out); return true;
}
(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const doc = mkDoc(false);
  const E = doc.__data.Etablissements, i0 = Math.max(...E.id);
  // 8 collèges autour de Versailles (référentiel seulement, aucune réponse à eux)
  for (let k = 0; k < 8; k++) for (const c of Object.keys(E)) { if (c === 'id') E.id.push(i0 + k + 1); else if (Array.isArray(E[c])) E[c].push(c === 'UAI' ? `078900${k}X` : c === 'Nom' ? `Collège Cité ${k}` : c === 'Latitude' ? 48.80 + (k % 3) * 0.004 : c === 'Longitude' ? 2.13 + Math.floor(k / 3) * 0.005 : E[c][0]); }
  const R = doc.__data.Reponses;
  console.log('réponses', R.id.length, '| établissement de la réponse 1 :', R.Etablissement[0]);
  { const T = doc._grist_Tables, C = doc._grist_Tables_column, tid = Math.max(...T.id) + 1;
    for (const k of Object.keys(T)) T[k].push(k === 'id' ? tid : k === 'tableId' ? 'Cites' : (typeof T[k][0] === 'number' ? 0 : typeof T[k][0] === 'boolean' ? false : ''));
    const opts = JSON.stringify({ choices: ['Grave', 'Légère'], choiceOptions: { Grave: { fillColor: '#A00000' }, 'Légère': { fillColor: '#2E8540' } } });
    for (const [col, ty, wo] of [['Dossier', 'Ref:Reponses', ''], ['Etablissement', 'Ref:Etablissements', ''], ['Gravite', 'Choice', opts], ['Ligne_id', 'Text', '']]) { const n2 = Math.max(...C.id) + 1;
      for (const k of Object.keys(C)) C[k].push(k === 'id' ? n2 : k === 'parentId' ? tid : k === 'colId' || k === 'label' ? col : k === 'type' ? ty : k === 'widgetOptions' ? wo : k === 'isFormula' ? false : (typeof C[k][0] === 'number' ? 0 : typeof C[k][0] === 'boolean' ? false : '')); }
    // réponse 1 cite les 8 collèges de Versailles et son propre établissement ; réponse 2 cite un collège déjà cité
    const etabs = [...Array(8)].map((_, k) => i0 + k + 1);
    doc.__data.Cites = { id: [...etabs.map((_, k) => k + 1), 9, 10], Dossier: [...etabs.map(() => 1), 1, 2], Etablissement: [...etabs, R.Etablissement[0], i0 + 1],
      Gravite: [...etabs.map((_, k) => k % 2 ? 'Grave' : 'Légère'), 'Grave', 'Grave'], Ligne_id: [...etabs.map((_, k) => 'l' + k), 'm', 'n'] };
    if (process.env.HIST) {   // sous-table historisée : version de chaque ligne, plus un retrait (collège 0 de Lyon : jamais affiché)
      for (const [col, ty] of [['Version', 'Ref:Reponses'], ['Mouvement', 'Choice']]) { const n2 = Math.max(...C.id) + 1;
        for (const k of Object.keys(C)) C[k].push(k === 'id' ? n2 : k === 'parentId' ? tid : k === 'colId' || k === 'label' ? col : k === 'type' ? ty : k === 'isFormula' ? false : (typeof C[k][0] === 'number' ? 0 : typeof C[k][0] === 'boolean' ? false : '')); }
      const X = doc.__data.Cites; X.Version = X.Dossier.slice(); X.Mouvement = X.id.map(() => 'Ajout');
      X.id.push(11); X.Dossier.push(1); X.Version.push(1); X.Etablissement.push(5); X.Gravite.push('Grave'); X.Ligne_id.push('z'); X.Mouvement.push('Retrait');
    }
  }
  const page = await browser.newPage({ viewport: { width: 1100, height: 1400 }, acceptDownloads: true });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
  await page.route('**/leaflet.min.*', r => r.abort());
  await page.route('**/jszip.min.js', r => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(require.resolve('jszip/dist/jszip.min.js')) }));
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__vraiFetch=window.fetch.bind(window);window.__DOC__=${JSON.stringify(doc)};window.__OPTS__={};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + fs.readFileSync('mock-saisie.js') + `;{const f=window.fetch;window.fetch=(u,...a)=>(String(u).includes('/atlas/')||String(u).includes('/attachments'))?window.__vraiFetch(u,...a):f(u,...a);}` }));
  let depose = null;
  await page.route('http://localhost/x/attachments**', async r => {
    if (r.request().method() === 'POST') { depose = r.request().postDataBuffer().toString(); return r.fulfill({ contentType: 'application/json', body: '[99]' }); }
    const m = /<qgis[\s\S]*<\/qgis>/.exec(depose || ''); return r.fulfill({ contentType: 'application/xml', body: m ? m[0] : '' });
  });
  await page.goto('http://localhost:8767/v2/cartographie/index.html'); await page.waitForTimeout(2500);
  await page.selectOption('#format', 'atlas'); await page.waitForTimeout(1200);
  await page.evaluate(() => document.querySelectorAll('#atlasBox details').forEach(d => d.open = true));
  await page.selectOption('#atlasMarqueTable', 'Cites'); await page.waitForTimeout(300);
  await page.selectOption('#atlasMarqueColonne', 'Gravite'); await page.fill('#atlasMarqueTitre', 'Établissements cités');
  console.log('LIEU :', await page.textContent('#atlasMarqueLieu'));
  if (!await telecharger(page, S + '/export73.zip')) { await browser.close(); srv.close(); return; }
  // ancien modèle déposé (couche marques sur signalements.geojson, sans étiquettes)
  await page.setInputFiles('#atlasModeleFichier', __C.donnees + '/ancien_modele.qgs'); await page.waitForTimeout(1200);
  console.log('MODÈLE :', await page.textContent('#atlasStatut'));
  await telecharger(page, S + '/export73b.zip');
  await browser.close(); srv.close();
})();
