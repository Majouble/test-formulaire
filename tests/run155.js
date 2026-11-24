// Référentiel ESR (2.62.0-alpha.62) : cascade du « Nom calculé » des sites et bouton « Mettre à jour les formules » (sans
// classeur). Import v8 (formules créées), formule rendue ancienne, puis mise à jour : la nouvelle formule est écrite.
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docEsr } = require('./run81');
(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const page = await browser.newPage({ viewport: { width: 1300, height: 1600 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.route('**/jszip.min.js', r => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(require.resolve('jszip/dist/jszip.min.js')) }));
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(docEsr())};window.__FORMULES_STRICTES__=true;` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(1200);
  await page.click('nav button[data-onglet=referentiel]'); await page.waitForTimeout(1200);
  await page.setInputFiles('#esr-fichier', __C.donnees + '/referentiel_esr_v8_essai.xlsx'); await page.waitForTimeout(2500);
  await page.click('#esr-importer'); await page.waitForTimeout(4000);
  const formule = c => page.evaluate(c => { const D = window.__DOC__, T = D._grist_Tables, C = D._grist_Tables_column, r = T.id[T.tableId.indexOf('Referentiel_sites')]; const i = C.colId.findIndex((x, j) => x === c && C.parentId[j] === r); return i < 0 ? '(absente)' : C.formula[i]; }, c);
  console.log('APRÈS IMPORT, cascade présente :', /seul = bool\(e\)/.test(await formule('Nom_calcule')), '| libellé sans répétition :', /n\.endswith/.test(await formule('Libelle')));
  // formules « anciennes » (comme posées par l'alpha.52)
  await page.evaluate(async () => { await grist.docApi.applyUserActions([['ModifyColumn', 'Referentiel_sites', 'Nom_calcule', { formula: 'return "ancien"' }], ['ModifyColumn', 'Referentiel_sites', 'Libelle', { formula: 'return "ancien"' }]]); });
  await page.evaluate(() => window.OngletReferentielESR.formules()); await page.waitForTimeout(800);
  console.log('SECTION :', (await page.textContent('#esr-formules')).replace(/\s+/g, ' ').trim().slice(0, 400));
  await page.click('#esr-formules-maj'); await page.waitForTimeout(1500);
  console.log('STATUT :', (await page.textContent('#esr-formules-statut')).trim());
  console.log('APRÈS MISE À JOUR, cascade :', /seul = bool\(e\)/.test(await formule('Nom_calcule')), '| libellé :', /n\.endswith/.test(await formule('Libelle')));
  await page.evaluate(() => window.OngletReferentielESR.formules()); await page.waitForTimeout(800);
  console.log('SECTION ENSUITE :', (await page.textContent('#esr-formules')).replace(/\s+/g, ' ').trim().slice(-160));
  await browser.close();
})();
