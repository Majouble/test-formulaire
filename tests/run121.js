// Extractions (2.53) : colonnes fusionnées avec « Préfixer chaque valeur par sa date » — chaque entrée porte sa date :
// texte sur plusieurs lignes (entrées séparées par une ligne vide), choix multiples (valeur de la ligne datée),
// ligne sans date (« sans date ») ; sans préfixe, choix multiples = éléments distincts comme avant
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docValidation } = require('./run108');
function doc2() {
  const doc = docValidation(), T = doc._grist_Tables, C = doc._grist_Tables_column, D = doc.__data, ref = T.id[T.tableId.indexOf('Reponses')];
  C.id.push(Math.max(...C.id) + 1); C.parentId.push(ref); C.colId.push('Motifs'); C.type.push('ChoiceList'); C.label.push('Motifs'); C.isFormula.push(false); C.formula.push(''); C.widgetOptions.push(JSON.stringify({ choices: ['Réforme', 'Budget', 'Conflit'] })); C.visibleCol.push(0); C.parentPos.push(50);
  const R = D.Reponses;
  R.Motifs = R.id.map((_, i) => i === 0 ? ['L', 'Réforme'] : i === 4 ? ['L', 'Réforme', 'Budget'] : null);
  R.Description[0] = 'Blocage partiel\nentrée nord fermée';
  R.Description[4] = 'Blocage partiel, levée prévue\nAG à 14 h';
  // une ligne de l'établissement 1 sans date des faits
  Object.keys(R).forEach(k => R[k].push(k === 'id' ? 6 : R[k][0]));
  R.Date_faits[5] = null; R.Description[5] = 'Tract signalé'; R.Motifs[5] = ['L', 'Conflit'];
  return doc;
}
(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc2())};` + fs.readFileSync('mock.js')
    + `;window.__OPTS={};grist.ready=()=>{};grist.onOptions=cb=>setTimeout(()=>cb(null),50);grist.setOptions=o=>{window.__OPTS=JSON.parse(JSON.stringify(o));};grist.docApi.listTables=async()=>window.__DOC__._grist_Tables.tableId.slice();` }));
  await page.goto('file://' + __C.racine + '/v2/extractions/index.html'); await page.waitForTimeout(1500);
  const montrer = async titre => {
    const o = await page.evaluate(() => resultat.lignes.find(l => l.cle === '1') || resultat.lignes[0]);
    console.log(`${titre} — établissement ${o.cle}\n  Description :\n    ${String(o.fus_Description).replace(/\n/g, '\n    ')}\n  Motifs : ${String(o.fus_Motifs).replace(/\n/g, ' ¶ ')}`);
  };
  await page.evaluate(() => { config.fusCols = ['Description', 'Motifs']; config.prefixeDate = true; afficherReglages(); majResultat(); });
  await montrer('AVEC DATES');
  await page.evaluate(() => { config.prefixeDate = false; afficherReglages(); majResultat(); });
  await montrer('SANS DATES');
  await browser.close();
})();
