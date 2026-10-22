const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const doc = JSON.parse(fs.readFileSync(__C.donnees + '/' + 'blank.json'));
  const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(2000);
  console.log('AVANT :', (await page.textContent('#bandeau')).trim());
  await page.click('text=Appliquer la sélection'); await page.waitForTimeout(3000);
  console.log('APRÈS :', (await page.textContent('#bandeau')).trim());
  console.log('TABLES :', await page.evaluate(() => window.__DOC__._grist_Tables.tableId.join(', ')));
  await browser.close();
})();
