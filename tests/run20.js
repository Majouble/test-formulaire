const __C = require('./chemins');
const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{
 const browser = await chromium.launch({executablePath: __C.chromium}); const page = await browser.newPage({viewport:{width:1300,height:1200}});
 page.on('pageerror', e=>console.log('PAGEERROR',e.message)); page.on('dialog', d=>d.accept());
 await page.route('**/grist-plugin-api.js', r=>r.fulfill({contentType:'text/javascript', body:`window.__DOC__=${fs.readFileSync('${__C.donnees + '/'}doc_planning2.json')};`+fs.readFileSync('mock.js')+fs.readFileSync('fakeapi.js')+`;grist.onRecords=()=>{};grist.getOption=async()=>null;`}));
 await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(500);
 await page.click('nav button[data-onglet=formulaires]'); await page.waitForTimeout(1000);
 console.log('FORM PAGES:', (await page.evaluate(()=>{ const x=[...document.querySelectorAll('.groupe')].find(e=>/Pages de saisie/.test(e.textContent)); return x? x.textContent:''; })).replace(/\s+/g,' '));
 await page.click('#pg-creer'); await page.waitForTimeout(800);
 console.log('VUES:', JSON.stringify(await page.evaluate(()=>({n:window.__DOC__._grist_Views.name, o:window.__DOC__._grist_Views_section.options.map(o=>JSON.parse(JSON.parse(o).customView).widgetOptions)}))));
 await page.click('nav button[data-onglet=equipe]'); await page.waitForTimeout(500);
 await page.click('.eq-ligne >> text=David'); await page.waitForTimeout(200);
 await page.screenshot({path:'eq-4.png', fullPage:true});
 await page.click('#eq-import summary'); await page.fill('#eq-liste','Émile Roux ; emile@x.fr ; rédactrice ; 06 11\nZoé ; zoe@x.fr ; chef');
 await page.click('#eq-analyser'); await page.waitForTimeout(200); console.log('BILAN:', (await page.textContent('#eq-import-bilan')).replace(/\s+/g,' '));
 await browser.close();
})();
