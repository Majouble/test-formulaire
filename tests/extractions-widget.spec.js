// 2.45 : widget « Extractions » intégré au socle — page créée depuis l'administration (onglet Tableau de bord, menu « ⋯ »),
// réglages proposés d'après les rôles du socle (UAI, date des faits, qualification, colonnes de l'établissement, RAS),
// tables techniques écartées, filtres, modèle enregistré pour tout le document (clé « extractions » de Config), export Excel
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docValidation } = require('./validation-et-campagnes.spec');

function docExtr() {
  const doc = docValidation(), T = doc._grist_Tables, C = doc._grist_Tables_column, D = doc.__data, ref = T.id[T.tableId.indexOf('Reponses')];
  [['UAI', '$Etablissement.UAI'], ['Nom_etablissement', '$Etablissement.Nom']].forEach(([c, f]) => {
    C.id.push(Math.max(...C.id) + 1); C.parentId.push(ref); C.colId.push(c); C.type.push('Text'); C.label.push(c); C.isFormula.push(true); C.formula.push(f); C.widgetOptions.push(''); C.visibleCol.push(0); C.parentPos.push(40); });
  const E = D.Etablissements; D.Reponses.UAI = D.Reponses.Etablissement.map(e => E.UAI[e - 1]); D.Reponses.Nom_etablissement = D.Reponses.Etablissement.map(e => E.Nom[e - 1]);
  return doc;
}
(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const doc = docExtr();
  // 1. administration : création de la page
  const pa = await browser.newPage({ viewport: { width: 1300, height: 1200 } });
  pa.on('pageerror', e => console.log('PAGEERROR', e.message));
  await pa.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await pa.goto('file://' + __C.racine + '/v2/admin/index.html'); await pa.waitForTimeout(1200);
  await pa.click('nav button[data-onglet=onglet-tdb]'); await pa.waitForTimeout(1500);
  await pa.click('#tdb-menu-btn'); await pa.waitForTimeout(300);
  console.log('MENU :', (await pa.textContent('#tdb-pages')).replace(/\s+/g, ' ').trim());
  await pa.click('#extr-page-creer'); await pa.waitForTimeout(1200);
  console.log('CRÉATION :', await pa.textContent('#tdb-statut'), '|', await pa.evaluate(() => { const S = window.__DOC__._grist_Views_section, i = S.id.length - 1, cv = JSON.parse(JSON.parse(S.options[i]).customView); return `${window.__DOC__._grist_Views.name.slice(-1)[0]} → ${cv.url.replace(/^.*test-formulaire/, '…')} (accès ${cv.access})`; }));
  await pa.close();

  // 2. widget
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true });
  page.on('pageerror', e => console.log('PAGEERROR (widget)', e.message));
  await page.route('**/exceljs.min.js', r => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(require.resolve('exceljs/dist/exceljs.min.js')) }));
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js')
    + `;window.__OPTS={};grist.ready=()=>{};grist.onOptions=cb=>setTimeout(()=>cb(null),50);grist.setOptions=o=>{window.__OPTS=JSON.parse(JSON.stringify(o));};grist.docApi.listTables=async()=>window.__DOC__._grist_Tables.tableId.slice();` }));
  await page.goto('file://' + __C.racine + '/v2/extractions/index.html'); await page.waitForTimeout(1500);
  console.log('VERSION :', await page.textContent('#version'), '| TABLES :', await page.$$eval('#table option', l => l.map(o => o.value).join(', ')));
  console.log('RÉGLAGES PROPOSÉS :', JSON.stringify(await page.evaluate(() => ({ cle: config.cleCol, date: config.dateCol, qual: config.qualCol, id: config.idCols, exclure: config.exclure, gravite: config.gravite }))));
  console.log('RÉSULTAT :', await page.textContent('#compte'), '\n  ' + (await page.$$eval('#resultat tr', l => l.map(tr => [...tr.children].map(c => c.textContent.trim()).join(' ¦ ')))).join('\n  '));
  await page.fill('#joursMin', '2'); await page.waitForTimeout(200);
  console.log('2 JOURS OU PLUS :', await page.textContent('#compte'));
  await page.fill('#nomModele', 'Mobilisés deux jours'); await page.click('#btnEnregModele'); await page.waitForTimeout(800);
  console.log('MODÈLE :', await page.textContent('#message'), '| Config :', await page.evaluate(() => { const C = window.__DOC__.__data.Config, i = C.Cle.indexOf('extractions'); return i < 0 ? 'absent' : JSON.parse(C.Valeur[i]).modeles.map(m => m.nom).join(', '); }),
    '| liste :', await page.$$eval('#modele option', l => l.map(o => o.textContent).join(' / ')));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnExcel')]);
  const ExcelJS = require('exceljs'), wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(await dl.path());
  console.log('EXCEL :', dl.suggestedFilename(), '|', wb.worksheets.map(w => `${w.name} (${w.rowCount} lignes)`).join(', '), '|', JSON.stringify(wb.getWorksheet('Extraction').getRow(2).values.slice(1, 8)));
  await page.screenshot({ path: __C.sorties + '/extractions-113.png' });
  await browser.close();
})();
