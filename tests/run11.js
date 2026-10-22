const __C = require('./chemins');
const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{
 const doc = JSON.parse(fs.readFileSync(__C.donnees + '/' + 'doc_ps.json'));
 // un blocage à Versailles pour remplir le premier tableau
 const R=doc.__data.Reponses; R.Qualification[0]='Blocage';
 const browser = await chromium.launch({executablePath: __C.chromium}); const page = await browser.newPage({viewport:{width:1100,height:900}});
 page.on('pageerror', e=>console.log('PAGEERROR',e.message)); page.on('console', m=>{ if(m.type()==='error'||m.type()==='warning') console.log('console:',m.text().slice(0,200))});
 await page.route('**/grist-plugin-api.js', r=>r.fulfill({contentType:'text/javascript', body:`window.__DOC__=${JSON.stringify(doc)};`+fs.readFileSync('mock.js')+fs.readFileSync('fakeapi.js')+fs.readFileSync('mock-saisie.js')}));
 await page.route('**/pizzip*', r=>r.fulfill({contentType:'text/javascript', body:'window.PizZip=function(){};'}));
 await page.route('**/docxtemplater*', r=>r.fulfill({contentType:'text/javascript', body:'window.docxtemplater=function(){};'}));
 await page.goto('file://' + __C.racine + '/v2/point-situation/index.html'); await page.waitForTimeout(2000);
 console.log('ETAT:', await page.textContent('#etat'));
 console.log('APERCU:', (await page.textContent('#apercu')).replace(/\s+/g,' ').slice(0,500));
 await page.click('#btnReglages'); await page.waitForTimeout(300);
 console.log('INFO:', await page.textContent('#infoConfig'));
 await page.screenshot({path:'ps-widget.png'});
 await browser.close();
})();
