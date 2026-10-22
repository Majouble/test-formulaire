const __C = require('./chemins');
const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{
 const browser = await chromium.launch({executablePath: __C.chromium}); const page = await browser.newPage({viewport:{width:1300,height:1100}});
 page.on('pageerror', e=>console.log('PAGEERROR',e.message));
 await page.route('**/grist-plugin-api.js', r=>r.fulfill({contentType:'text/javascript', body:`window.__DOC__=${fs.readFileSync('${__C.donnees + '/'}doc_planning3.json')};`+fs.readFileSync('mock.js')+fs.readFileSync('fakeapi.js')+`;grist.onRecords=()=>{};grist.getOption=async()=>null;`}));
 await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(500);
 await page.click('nav button[data-onglet=onglet-tdb]'); await page.waitForTimeout(800);
 await page.click('#addCross'); await page.waitForTimeout(300);
 const last = await page.$$eval('select[data-k=chart]', x=>x.length-1);
 await page.selectOption(`select[data-k="rows.col"] >> nth=${last}`, 'Etablissement').catch(e=>console.log('no etab col'));
 await page.selectOption(`select[data-k=chart] >> nth=${last}`, 'map'); await page.waitForTimeout(500);
 console.log('CARD:', (await page.textContent(`[data-card="${last}"]`).catch(()=>'')).replace(/\s+/g,' ').slice(-400)); console.log('MAP paths:', await page.$$eval('.chart.map path', x=>x.length), (await page.$$eval('.chart.map .hint', x=>x.map(e=>e.textContent))).join(' | ').slice(0,200));
 await browser.close();
})();
