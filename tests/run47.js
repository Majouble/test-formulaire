const __C = require('./chemins');
const { chromium } = require('playwright'); const fs=require('fs');
const src = fs.readFileSync('run27.js','utf8'); const mkDoc = eval('('+src.slice(src.indexOf('(sansDep) =>'), src.indexOf('\n};\n')+2)+')');
(async()=>{
 const browser = await chromium.launch({executablePath: __C.chromium});
 const doc = JSON.parse(fs.readFileSync(__C.donnees + '/' + 'doc_planning3.json'));
 const page = await browser.newPage({viewport:{width:1300,height:1000}, colorScheme:'dark'});
 page.on('pageerror', e=>console.log('PAGEERROR',e.message));
 await page.route('**/grist-plugin-api.js', r=>r.fulfill({contentType:'text/javascript', body:`window.__DOC__=${JSON.stringify(doc)};`+fs.readFileSync('mock.js')+fs.readFileSync('fakeapi.js')+`;grist.onRecords=()=>{};grist.getOption=async()=>null;`}));
 await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(600);
 console.log('THEME:', await page.evaluate(()=>document.documentElement.dataset.theme));
 for (const o of ['installation','equipe','planning','acces','onglet-tdb','formulaires']) { await page.click(`nav button[data-onglet=${o}]`); await page.waitForTimeout(900); await page.screenshot({path:`dk-${o}.png`}); }
 await browser.close();
})();
