// Admin : tableau des sites sans colonne vers le référentiel des sites (sous-table propre au document) : « Relier au référentiel des sites »
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docSites } = require('./run78');
(async () => {
  const doc = docSites(), F = doc.__data.Formulaires, i = F.Nom.indexOf('Signalements');
  // sous-table du document : nom du site en texte, qualification ; pas de colonne Site vers Referentiel_sites
  const T = doc._grist_Tables, C = doc._grist_Tables_column, tr = T.id[T.tableId.indexOf('Sites_signales')];
  const k = C.id.findIndex((_, j) => C.parentId[j] === tr && C.colId[j] === 'Site'); for (const c of Object.keys(C)) C[c].splice(k, 1); delete doc.__data.Sites_signales.Site;
  const conf = JSON.parse(F.Publie[i]); conf.blocs[0].reglages.tableau.sites.site = null; F.Publie[i] = JSON.stringify(conf); if (F.Brouillon) F.Brouillon[i] = JSON.stringify(conf);
  const browser = await chromium.launch({ executablePath: __C.chromium }); const page = await browser.newPage({ viewport: { width: 1300, height: 1400 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => d.accept());
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(1200);
  await page.click('nav button[data-onglet=formulaires]'); await page.waitForTimeout(1800);
  await page.click('[data-bloc="b1"]'); await page.waitForTimeout(600);
  console.log('PANNEAU :', await page.$eval('#panneau', p => (p.innerText.match(/Ce tableau n'a pas[^\n]*|Aucun référentiel des sites[^\n]*/) || ['(aucune note)'])[0]));
  await page.click('#pa-site-relier'); await page.waitForTimeout(1200);
  console.log('COLONNE SITE :', await page.evaluate(() => { const D = window.__DOC__, T = D._grist_Tables, C = D._grist_Tables_column, tr = T.id[T.tableId.indexOf('Sites_signales')];
    return C.id.map((_, j) => j).filter(j => C.parentId[j] === tr && /^Site/.test(C.colId[j])).map(j => `${C.colId[j]} (${C.type[j]}, « ${C.label[j]} »)`).join(', '); }));
  console.log('RÉGLAGE :', await page.evaluate(() => { const F = window.__DOC__.__data.Formulaires, i = F.Nom.indexOf('Signalements'); return JSON.stringify(JSON.parse(F.Brouillon[i]).blocs[0].reglages.tableau.sites); }));
  console.log('SÉLECTEUR :', await page.$eval('#pa-site-ref', s => s.selectedOptions[0].textContent).catch(() => '?'));
  // sans colonne hors référentiel : « Accepter les noms hors référentiel »
  await page.selectOption('#pa-site-libre', ''); await page.waitForTimeout(300);
  await page.click('[data-bloc="b1"]'); await page.waitForTimeout(400);
  await page.click('#pa-site-libre-creer'); await page.waitForTimeout(1000);
  console.log('HORS RÉFÉRENTIEL :', await page.evaluate(() => { const F = window.__DOC__.__data.Formulaires, i = F.Nom.indexOf('Signalements'), D = window.__DOC__, T = D._grist_Tables, C = D._grist_Tables_column, tr = T.id[T.tableId.indexOf('Sites_signales')];
    return JSON.parse(F.Brouillon[i]).blocs[0].reglages.tableau.sites.libre + ' | colonnes : ' + C.id.map((_, j) => j).filter(j => C.parentId[j] === tr && /^Site/.test(C.colId[j])).map(j => `${C.colId[j]} « ${C.label[j]} »`).join(', '); }));
  await browser.close();
})();
