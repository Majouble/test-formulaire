// Sites désactivés du référentiel (Actif décoché) : écartés du rapprochement (liste, proposition, compléments),
// de la reprise du dernier état (s'ils sont revenus à la normale) et des suggestions du formulaire
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docRef } = require('./run94');
function docInactifs() {
  const doc = docRef(), T = doc._grist_Tables, C = doc._grist_Tables_column, D = doc.__data, tr = T.id[T.tableId.indexOf('Referentiel_sites')], n = Math.max(...C.id) + 1;
  for (const k of Object.keys(C)) C[k].push(k === 'id' ? n : k === 'parentId' ? tr : k === 'colId' ? 'Actif' : k === 'label' ? 'Actif' : k === 'type' ? 'Bool' : k === 'isFormula' ? false : (typeof C[k][0] === 'number' ? 0 : typeof C[k][0] === 'boolean' ? false : ''));
  D.Referentiel_sites.Actif = [true, true, false, false, true];   // Site Villejean et Site Lorient désactivés
  return doc;
}
(async () => {
  const doc = docInactifs();
  const browser = await chromium.launch({ executablePath: __C.chromium });
  // administration : rapprochement
  const pa = await browser.newPage({ viewport: { width: 1300, height: 1500 } });
  pa.on('pageerror', e => console.log('PAGEERROR', e.message)); pa.on('dialog', d => d.accept());
  await pa.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await pa.goto('file://' + __C.racine + '/v2/admin/index.html'); await pa.waitForTimeout(1200);
  await pa.click('nav button[data-onglet=referentiel]'); await pa.waitForTimeout(1800);
  console.log('ADMIN :\n  ', (await pa.$$eval('#ref-sites tbody tr', l => l.map(tr => `${tr.querySelector('.si-coche').checked ? '☑' : '☐'} « ${tr.cells[2].querySelector('strong').textContent} » → ${tr.querySelector('.si-site').selectedOptions[0].textContent} | choix : ${[...tr.querySelectorAll('.si-site option')].map(o => o.textContent).join(', ')}`))).join('\n   '));
  // formulaire : reprise et suggestions
  const page = await browser.newPage({ viewport: { width: 1100, height: 1400 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => d.accept());
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};window.__OPTS__=${JSON.stringify({ formulaire: 'Signalements' })};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + fs.readFileSync('mock-saisie.js') }));
  await page.goto('file://' + __C.racine + '/v2/saisie/index.html'); await page.waitForTimeout(1500);
  await page.click('#porte-nouveau'); await page.waitForTimeout(300);
  await page.fill('#nom', 'Jean Moulin'); await page.waitForTimeout(700); await page.click('#liste [role=option] >> nth=0'); await page.waitForTimeout(700);
  console.log('REPRIS :', await page.$$eval('.ligne-rep', l => l.map(x => `${x.querySelector('.site-txt').value} [${(x.querySelector('.repris') || {}).textContent || ''}]`.replace(/\s+/g, ' ')).join(' | ')));
  await page.click('[data-action=ajouter]'); await page.waitForTimeout(200);
  await page.focus('.ligne-rep:last-child .site-txt'); await page.waitForTimeout(200);
  console.log('SUGGESTIONS :', await page.$$eval('.ligne-rep:last-child .site-sugg li', l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim()).join(' | ')));
  await browser.close();
})();
