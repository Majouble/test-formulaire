// Extractions (2.52) : filtres sur plusieurs colonnes, chacun avec un opérateur (contient, est égal à, ne contient pas,
// est renseigné, n'est jamais renseigné ; 2.55 : opérateurs du tableau de bord, portée « jamais ») ; combinaison « en cascade » (tous) ou « autonomes » (au moins un, sans doublon,
// colonne « Filtres vérifiés », compte des établissements retenus par plusieurs filtres) ; saisie sans perte du focus ;
// reprise de l'ancien filtre unique (chercheCol / chercheTexte) ; paramètres de l'Excel
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docValidation } = require('./run108');
(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const doc = docValidation();
  const ouvrir = async opts => {
    const page = await browser.newPage({ viewport: { width: 1500, height: 900 }, acceptDownloads: true });
    page.on('pageerror', e => console.log('PAGEERROR', e.message));
    await page.route('**/exceljs.min.js', r => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(require.resolve('exceljs/dist/exceljs.min.js')) }));
    await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js')
      + `;window.__OPTS={};grist.ready=()=>{};grist.onOptions=cb=>setTimeout(()=>cb(${JSON.stringify(opts)}),50);grist.setOptions=o=>{window.__OPTS=JSON.parse(JSON.stringify(o));};grist.docApi.listTables=async()=>window.__DOC__._grist_Tables.tableId.slice();` }));
    await page.goto('file://' + __C.racine + '/v2/extractions/index.html'); await page.waitForTimeout(1500);
    return page;
  };
  const etat = async (page, titre) => console.log(titre, '|', await page.textContent('#compte'), '|', await page.$$eval('#resultat tbody tr', l => l.map(tr => { const c = [...tr.children].map(x => x.textContent.trim()); return c[0] + (tr.parentElement.parentElement.querySelector('th[data-key=filtresOk]') ? ` [${c[c.length - 1]}]` : ''); }).join(', ')),
    '| combinaison :', await page.$eval('#combinaison', s => s.disabled ? 'inactive' : s.value), '|', await page.textContent('#aideCombinaison'));
  const page = await ouvrir(null);
  await etat(page, 'SANS FILTRE');
  // F1 : Description contient « blocage ; intrusion » (tapé au clavier : le focus reste dans le champ)
  await page.selectOption('#filtresCol [data-i="0"] select.col', 'Description');
  await page.click('#filtresCol [data-i="0"] input[data-champ=val]'); await page.keyboard.type('blocage ; intrusion'); await page.waitForTimeout(150);
  console.log('FOCUS GARDÉ :', await page.evaluate(() => document.activeElement.dataset.champ), '| valeur :', await page.inputValue('#filtresCol [data-i="0"] input[data-champ=val]'));
  await etat(page, 'F1');
  await page.click('#ajoutFiltreCol');
  await page.selectOption('#filtresCol [data-i="1"] select.col', 'Departement');
  await page.selectOption('#filtresCol [data-i="1"] select.op', 'eq');
  await page.click('#filtresCol [data-i="1"] input[data-champ=val]'); await page.keyboard.type('essonne'); await page.waitForTimeout(150);
  console.log('FOCUS GARDÉ (2e filtre) :', await page.evaluate(() => document.activeElement.dataset.champ));
  await etat(page, 'F1 ET F2 (cascade)');
  await page.selectOption('#combinaison', 'autonome'); await page.waitForTimeout(150);
  await etat(page, 'F1 OU F2 (autonomes)');
  await page.click('#ajoutFiltreCol');
  await page.selectOption('#filtresCol [data-i="2"] select.col', 'Description');
  await page.selectOption('#filtresCol [data-i="2"] select.op', 'contains');
  await page.selectOption('#filtresCol [data-i="2"] [data-champ=portee]', 'jamais');
  await page.fill('#filtresCol [data-i="2"] input[data-champ=val]', 'levée'); await page.waitForTimeout(150);
  await etat(page, 'F1 OU F2 OU F3 (ne contient pas « levée »)');
  await page.selectOption('#combinaison', 'cascade'); await page.waitForTimeout(150);
  await etat(page, 'F1 ET F2 ET F3');
  await page.click('#filtresCol [data-retirer="1"]'); await page.waitForTimeout(150);
  await etat(page, 'F2 retiré (F1 ET ex-F3)');
  await page.selectOption('#filtresCol [data-i="1"] select.op', 'nempty'); await page.waitForTimeout(150);
  console.log('« est renseigné » : champ valeur caché :', await page.$eval('#filtresCol [data-i="1"] input[data-champ=val]', e => e.hidden));
  await etat(page, 'F1 ET Description renseignée');
  await page.selectOption('#combinaison', 'autonome'); await page.waitForTimeout(150);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnExcel')]);
  const ExcelJS = require('exceljs'), wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(await dl.path());
  const ws = wb.getWorksheet('Extraction'), nb = ws.getRow(1).values.length - 1;
  console.log('EXCEL : dernière colonne', ws.getRow(1).values[nb], '|', [2, 3, 4, 5].filter(r => r <= ws.rowCount).map(r => `${ws.getRow(r).values[1]} → ${ws.getRow(r).values[nb]}`).join(' ; '));
  const wp = wb.getWorksheet('Paramètres');
  console.log('PARAMÈTRES :', [...Array(wp.rowCount).keys()].map(i => wp.getRow(i + 1).values.slice(1).join(' = ')).filter(l => /Filtre/.test(l)).join(' | '));
  console.log('ENREGISTRÉ :', await page.evaluate(() => JSON.stringify({ c: window.__OPTS.filtres.combinaison, f: window.__OPTS.filtres.colonnes })));
  await page.close();
  // ancien réglage : un seul filtre (chercheCol / chercheTexte)
  const p2 = await ouvrir({ config: { tableId: 'Reponses', cleCol: 'Etablissement', dateCol: 'Date_faits', qualCol: 'Qualification', idCols: ['Departement'], fusCols: [], calc: {}, gravite: ['RAS', 'Perturbé', 'Fermé'], exclure: 'RAS', prefixeDate: true },
    filtres: { du: '', au: '', joursMin: '', joursMax: '', qualMode: 'une', qualValeurs: [], chercheCol: 'Description', chercheTexte: 'fermeture' } });
  console.log('ANCIEN FILTRE REPRIS :', await p2.$$eval('#filtresCol .filtre', l => l.map(x => `${x.querySelector('select.col').value} ${x.querySelector('select.op').value} « ${x.querySelector('input[data-champ=val]').value} » ${x.querySelector('[data-champ=portee]').value}`).join(' | ')));
  await etat(p2, 'ANCIEN FILTRE');
  await browser.close();
})();
