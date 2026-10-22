// Installation : colonnes Etat_plus_grave et Nb_jours_mobilisation proposées et créées
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const doc = JSON.parse(fs.readFileSync(__C.donnees + '/' + 'doc_planning3.json'));
  const browser = await chromium.launch({ executablePath: __C.chromium }); const page = await browser.newPage({ viewport: { width: 1300, height: 1400 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => d.accept());
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(2500);
  const etapes = await page.$$eval('#actions label, #actions li, #actions .etape', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean));
  console.log('ÉTAPES :', etapes.filter(x => /Etat_plus_grave|Nb_jours/.test(x)).map(x => x.slice(0, 140)));
  await page.click('text=Appliquer la sélection'); await page.waitForTimeout(2500);
  const r = await page.evaluate(() => { const D = window.__DOC__, T = D._grist_Tables, C = D._grist_Tables_column, tr = T.id[T.tableId.indexOf('Reponses')];
    return ['Etat_plus_grave', 'Nb_jours_mobilisation'].map(n => { const i = C.id.findIndex((_, k) => C.parentId[k] === tr && C.colId[k] === n); return i < 0 ? n + ' absente' : `${n} ${C.type[i]} formule=${C.isFormula[i]} ${C.widgetOptions[i] || ''}`; }); });
  console.log(r.join('\n'));
  await browser.close();
})();
