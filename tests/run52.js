const __C = require('./chemins');
const { chromium } = require('playwright'); const fs=require('fs');
const src = fs.readFileSync('run27.js','utf8'); const mkDoc = eval('('+src.slice(src.indexOf('(sansDep) =>'), src.indexOf('\n};\n')+2)+')');
(async()=>{
 const browser = await chromium.launch({executablePath: __C.chromium});
 const doc = mkDoc(false);
 const page = await browser.newPage({viewport:{width:1000,height:800}});
 page.on('pageerror', e=>console.log('PAGEERROR',e.message));
 await page.route('**/grist-plugin-api.js', r=>r.fulfill({contentType:'text/javascript', body:`window.__DOC__=${JSON.stringify(doc)};window.__OPTS__=${JSON.stringify({formulaire:'Signalements',etablissements:'Etablissements'})};`+fs.readFileSync('mock.js')+fs.readFileSync('fakeapi.js')+fs.readFileSync('mock-saisie.js')}));
 await page.goto('file://' + __C.racine + '/v2/saisie/index.html'); await page.waitForTimeout(2500);
 console.log('BANDEAU:', await page.evaluate(()=>{const z=document.getElementById('alerte-page-etab'); return z.hidden?'(caché)':z.textContent.replace(/\s+/g,' ').trim();}));
 await page.screenshot({path:'v201-saisie-etab.png'});
 await browser.close();
})();
