// Extractions (2.51) : les colonnes d'identification numériques (Entier, Numérique, formule sans type qui donne des
// nombres : « Nombre de sites ») et les dates sortent en nombres et en dates dans l'export Excel, plus en texte ;
// tri numérique dans l'aperçu ; CSV avec la virgule décimale
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docValidation } = require('./run108');
function docNum() {
  const doc = docValidation(), T = doc._grist_Tables, C = doc._grist_Tables_column, D = doc.__data, ref = T.id[T.tableId.indexOf('Reponses')];
  [['UAI', 'Text', true], ['Nombre_de_sites', 'Any', true], ['Effectif', 'Int', true], ['Taux', 'Numeric', false], ['Date_ouverture', 'Date', false]].forEach(([c, ty, f]) => {
    C.id.push(Math.max(...C.id) + 1); C.parentId.push(ref); C.colId.push(c); C.type.push(ty); C.label.push(c.replace(/_/g, ' ')); C.isFormula.push(f); C.formula.push(f ? '$x' : ''); C.widgetOptions.push(''); C.visibleCol.push(0); C.parentPos.push(40); });
  const R = D.Reponses, E = D.Etablissements;
  R.UAI = R.Etablissement.map(e => E.UAI[e - 1]);
  R.Nombre_de_sites = R.Etablissement.map(e => [3, 12, 1, 7][(e - 1) % 4]);
  R.Effectif = R.Etablissement.map(e => [24000, 900, 15000, 300][(e - 1) % 4]);
  R.Taux = R.Etablissement.map(e => [0.5, 12.25, null, 3][(e - 1) % 4]);
  R.Date_ouverture = R.Etablissement.map(e => Date.UTC(2020, e, 1) / 1000);
  return doc;
}
(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const doc = docNum();
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 }, acceptDownloads: true });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.route('**/exceljs.min.js', r => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(require.resolve('exceljs/dist/exceljs.min.js')) }));
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js')
    + `;window.__OPTS={};grist.ready=()=>{};grist.onOptions=cb=>setTimeout(()=>cb(null),50);grist.setOptions=o=>{window.__OPTS=JSON.parse(JSON.stringify(o));};grist.docApi.listTables=async()=>window.__DOC__._grist_Tables.tableId.slice();` }));
  await page.goto('file://' + __C.racine + '/v2/extractions/index.html'); await page.waitForTimeout(1500);
  await page.evaluate(() => { config.cleCol = 'UAI'; config.idCols = ['Nombre_de_sites', 'Effectif', 'Taux', 'Date_ouverture']; afficherReglages(); majResultat(); });
  await page.waitForTimeout(200);
  console.log('NATURES :', await page.evaluate(() => resultat.colonnes.map(c => `${c.label}=${c.type}`).join(', ')));
  const apercu = () => page.$$eval('#resultat tr', l => l.map(tr => [...tr.children].slice(0, 5).map(c => c.textContent.trim()).join(' ¦ ')).join('\n  '));
  console.log('APERÇU :\n  ' + await apercu());
  await page.click('#resultat th[data-key=id_Nombre_de_sites]'); await page.waitForTimeout(150);
  console.log('TRI « Nombre de sites » :', await page.$$eval('#resultat tbody tr', l => l.map(tr => tr.children[1].textContent.trim()).join(', ')));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnExcel')]);
  const ExcelJS = require('exceljs'), wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(await dl.path());
  const ws = wb.getWorksheet('Extraction'), entetes = ws.getRow(1).values.slice(1);
  const typeDe = v => v instanceof Date ? 'date' : typeof v;
  console.log('EXCEL, en-têtes :', entetes.slice(0, 5).join(' | '));
  for (let r = 2; r <= ws.rowCount; r++) console.log('  ligne', r, ':', ws.getRow(r).values.slice(1, 6).map(v => `${v instanceof Date ? v.toISOString().slice(0, 10) : v} (${typeDe(v)})`).join(' ; '));
  const csv = await page.evaluate(() => { let out = ''; const b = window.Blob; window.Blob = function (parts, o) { out = parts.join(''); return new b(parts, o); }; window.URL.createObjectURL = () => 'blob:x'; exporterCSV(); window.Blob = b; return out; });
  console.log('CSV :', csv.split('\r\n').slice(0, 3).join(' // '));
  await browser.close();
})();
