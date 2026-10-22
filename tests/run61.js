const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const doc = JSON.parse(fs.readFileSync(__C.donnees + '/' + 'doc_planning3.json'));
  doc._grist_Views = { id: [], name: [] }; doc._grist_Views_section = { id: [], parentId: [], parentKey: [], tableRef: [], options: [], title: [] }; doc._grist_Pages = { id: [], viewRef: [], pagePos: [], indentation: [] };
  const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(1500);
  await page.click('nav button[data-onglet=onglet-equipe]'); await page.waitForTimeout(1000);
  await page.click('#eq-sous [data-sous=pages]'); await page.waitForTimeout(1200);
  await page.click('#pa-creer'); await page.waitForTimeout(1200);
  const etats = async () => (await page.$$eval('#pages-agents tbody tr', l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim().split('«')[0]))).join(' | ');
  console.log('APRÈS CRÉATION :', await etats());
  // suppression dans Grist (hors widget) : la vue, ses sections, sa page
  await page.evaluate(() => { const D = window.__DOC__; for (const t of ['_grist_Views_section', '_grist_Views', '_grist_Pages']) for (const k of Object.keys(D[t])) D[t][k] = []; });
  await page.click('#eq-sous [data-sous=pages]'); await page.waitForTimeout(1200);
  console.log('APRÈS SUPPRESSION :', await etats());
  console.log('SYNTHÈSE :', (await page.textContent('#eq-synthese-zone')).trim());
  await browser.close();
})();
