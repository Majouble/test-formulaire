const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const doc = JSON.parse(fs.readFileSync(__C.donnees + '/' + 'doc_planning3.json'));
  const T = doc._grist_Tables, tr = n => T.id[T.tableId.indexOf(n)];
  const cv = (url, wo) => JSON.stringify({ customView: JSON.stringify({ mode: 'url', url, access: 'full', widgetOptions: wo || {} }) });
  doc._grist_Views = { id: [1, 2, 3, 4, 5], name: ['Admin', 'Réponses', 'Etablissements', 'Signalement — établissements', 'Formulaire Alice'] };
  doc._grist_Views_section = { id: [1, 2, 3, 4, 5], parentId: [1, 2, 3, 4, 5], parentKey: ['custom', 'record', 'record', 'custom', 'custom'], tableRef: [tr('Config'), tr('Reponses'), tr('Etablissements'), tr('Reponses'), tr('Reponses')],
    options: [cv('https://x/v2/admin/'), '{}', '{}', cv('https://x/v2/saisie/', { formulaire: 'Signalements', etablissements: 'Etablissements' }), cv('https://x/v2/saisie/', { formulaire: 'Signalements', agent: 1 })], title: ['', '', '', '', ''] };
  doc._grist_Pages = { id: [1, 2, 3, 4, 5], viewRef: [1, 2, 3, 4, 5], pagePos: [1, 2, 3, 4, 5], indentation: [0, 0, 1, 0, 0] };
  const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(2000);
  await page.click('nav button[data-onglet=acces]'); await page.waitForTimeout(1500);
  await page.click('#ac-formule'); await page.waitForTimeout(1500);
  const carte = async () => (await page.$$eval('#acces section.carte', s => s.map(x => x.textContent.replace(/\s+/g, ' ').trim()).filter(t => t.startsWith('Pages visibles')))).join('').slice(300, 700);
  console.log('AVANT :', await carte());
  await page.click('#ac-pages'); await page.waitForTimeout(2000);
  console.log('APRÈS :', await carte());
  console.log('PAGES :', JSON.stringify(await page.evaluate(() => { const D = window.__DOC__, P = D._grist_Pages, V = D._grist_Views; return P.id.map((id, i) => [P.pagePos[i], P.indentation[i], V.name[V.id.indexOf(P.viewRef[i])]]).sort((a, b) => a[0] - b[0]); })));
  await page.click('#ac-appliquer'); await page.waitForTimeout(300); const ok = await page.$('text=Oui, appliquer'); if (ok) await ok.click(); await page.waitForTimeout(1500);
  console.log('RÈGLES Cellule :', JSON.stringify(await page.evaluate(() => { const d = window.__DOC__.__data, R = d._grist_ACLRules, Rs = d._grist_ACLResources; return R.id.map((id, i) => { const k = Rs.id.indexOf(R.resource[i]); return [Rs.tableId[k], R.aclFormula[i], R.permissionsText[i]]; }).filter(r => r[0] === 'Cellule'); })));
  console.log('BANDEAU :', (await page.$eval('#acces .bandeau', b => b.textContent.trim())).slice(0, 80));
  await page.locator('#acces section.carte:nth-of-type(2)').screenshot({ path: 'v203-pages.png' }).catch(() => {});
  await browser.close();
})();
