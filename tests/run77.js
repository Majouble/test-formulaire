// Installation : étape « Historiser la sous-table » puis colonnes créées
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const src = fs.readFileSync('run27.js', 'utf8'); const mkDoc = eval('(' + src.slice(src.indexOf('(sansDep) =>'), src.indexOf('\n};\n') + 2) + ')');
(async () => {
  const doc = mkDoc(false), T = doc._grist_Tables, C = doc._grist_Tables_column, tid = Math.max(...T.id) + 1;
  for (const k of Object.keys(T)) T[k].push(k === 'id' ? tid : k === 'tableId' ? 'Blesses' : (typeof T[k][0] === 'number' ? 0 : ''));
  for (const [col, ty] of [['Dossier', 'Ref:Reponses'], ['Ligne_id', 'Text'], ['Gravite', 'Choice']]) { const n2 = Math.max(...C.id) + 1;
    for (const k of Object.keys(C)) C[k].push(k === 'id' ? n2 : k === 'parentId' ? tid : k === 'colId' || k === 'label' ? col : k === 'type' ? ty : k === 'isFormula' ? false : (typeof C[k][0] === 'number' ? 0 : typeof C[k][0] === 'boolean' ? false : '')); }
  doc.__data.Blesses = { id: [], Dossier: [], Ligne_id: [], Gravite: [] };
  const browser = await chromium.launch({ executablePath: __C.chromium }); const page = await browser.newPage({ viewport: { width: 1200, height: 1400 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => d.accept());
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(2500);
  const etapes = await page.$$eval('#liste-actions label, #liste-actions li', l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim()).filter(t => /Historiser/.test(t)));
  console.log('ÉTAPE :', etapes.join(' | ').slice(0, 300));
  // n'appliquer que cette étape
  await page.$$eval('#liste-actions input[type=checkbox]', l => l.forEach(c => { c.checked = /Historiser/.test(c.closest('label,li,div').textContent); c.dispatchEvent(new Event('change', { bubbles: true })); }));
  await page.click('#btn-appliquer'); await page.waitForTimeout(1500);
  console.log('COLONNES :', await page.evaluate(() => { const T = window.__DOC__._grist_Tables, C = window.__DOC__._grist_Tables_column, t = T.id[T.tableId.indexOf('Blesses')];
    return C.id.map((_, i) => i).filter(i => C.parentId[i] === t).map(i => `${C.colId[i]}:${C.type[i]}${C.isFormula[i] ? ' (formule)' : ''}`).join(', '); }));
  await browser.close();
})();
