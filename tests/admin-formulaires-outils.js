// Outils communs aux scénarios « admin-formulaire-… » : ouverture de l'onglet Formulaires sur un document d'essai,
// et extraits du document simulé (table Formulaires, colonnes de la table des réponses).
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const doc0 = () => JSON.parse(fs.readFileSync(__C.donnees + '/doc_saisie2.json', 'utf8'));
async function ouvrir(doc) {
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const page = await browser.newPage({ viewport: { width: 1300, height: 1400 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.reponsesPrompt = []; page.on('dialog', d => d.accept(d.type() === 'prompt' ? (page.reponsesPrompt.shift() || '') : undefined));
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await page.goto('file://' + __C.racine + '/v2/admin/index.html');
  await page.waitForSelector('nav button[data-onglet=formulaires]');
  await page.click('nav button[data-onglet=formulaires]');
  await page.waitForSelector('#apercu', { state: 'visible' });
  return { browser, page };
}
// ligne de la table Formulaires (JSON analysé pour Brouillon et Publie)
const ligneF = (page, nom) => page.evaluate(n => { const F = window.__DOC__.__data.Formulaires, i = F.Nom.indexOf(n); if (i < 0) return null;
  const j = s => s ? JSON.parse(s) : null; return { Nom: F.Nom[i], Table: F.Table[i], Type: F.Type[i], Brouillon: j(F.Brouillon[i]), Publie: j(F.Publie[i]), Publie_le: F.Publie_le[i], Modifie_le: F.Modifie_le[i] }; }, nom);
// colonnes d'une table : colId, type, widgetOptions
const colonnes = (page, table) => page.evaluate(t => { const D = window.__DOC__, ti = D._grist_Tables.tableId.indexOf(t); if (ti < 0) return null;
  const id = D._grist_Tables.id[ti], C = D._grist_Tables_column, r = [];
  C.id.forEach((x, k) => { if (C.parentId[k] === id) r.push({ colId: C.colId[k], type: C.type[k], opts: C.widgetOptions && C.widgetOptions[k] ? C.widgetOptions[k] : '', formule: C.isFormula && C.isFormula[k] ? C.formula[k] : '' }); }); return r; }, table);
const texte = (page, sel) => page.$eval(sel, e => e.innerText.replace(/\s*\n\s*/g, ' | ').trim());
module.exports = { __C, doc0, ouvrir, ligneF, colonnes, texte };
// ajoute une question (ou un titre / texte) en fin de la partie « q » par le menu d'ajout
async function ajouter(page, cle, texte, section = 'q') {
  await page.$$eval(`[data-section-feuille="${section}"] [data-ajout]`, l => l[l.length - 1].click());
  await page.waitForSelector(`#menu-ajout [data-type=${cle}]`, { state: 'visible' });
  await page.click(`#menu-ajout [data-type=${cle}]`);
  await page.fill('#e2-texte', texte); await page.click('#form-etape2 button[type=submit]');
  await page.waitForSelector('#menu-ajout', { state: 'hidden' });
}
// laisse passer les écritures asynchrones du faux Grist
const calme = page => page.evaluate(() => new Promise(r => setTimeout(r, 1000)));
module.exports.ajouter = ajouter; module.exports.calme = calme;
