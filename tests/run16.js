const __C = require('./chemins');
const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{
 const browser = await chromium.launch({executablePath: __C.chromium}); const page = await browser.newPage({viewport:{width:1300,height:1100}});
 page.on('pageerror', e=>console.log('PAGEERROR',e.message)); page.on('dialog', d=>d.accept());
 await page.route('**/grist-plugin-api.js', r=>r.fulfill({contentType:'text/javascript', body:`window.__DOC__=${fs.readFileSync('${__C.donnees + '/'}blank.json')};`+fs.readFileSync('mock.js')+fs.readFileSync('fakeapi.js')+`;grist.onRecords=()=>{};grist.getOption=async()=>null;`}));
 await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(400);
 await page.click('#btn-appliquer'); await page.waitForTimeout(500);
 console.log('JOURNAL:', (await page.textContent('#journal')).replace(/\s+/g,' '));
 console.log('COLS:', JSON.stringify(await page.evaluate(()=>{const T=window.__DOC__._grist_Tables,C=window.__DOC__._grist_Tables_column; const r=T.id[T.tableId.indexOf('Agents')]; return C.colId.map((c,i)=>C.parentId[i]===r?[c,C.type[i],C.widgetOptions[i]]:null).filter(Boolean);})));
 await page.click('nav button[data-onglet=formulaires]'); await page.waitForTimeout(600);
 await page.click('#btn-nouveau'); await page.fill('#nf-nom','Signalements'); await page.click('#nf-valider'); await page.waitForTimeout(800);
 console.log('FORM PAGES:', (await page.evaluate(()=>{ const x=[...document.querySelectorAll('.groupe')].find(e=>/Pages de saisie/.test(e.textContent)); return x? x.textContent:''; })).replace(/\s+/g,' '));
 await page.click('[data-pg="equipe"]'); await page.waitForTimeout(400);
 console.log('EQ:', (await page.textContent('#equipe')).replace(/\s+/g,' ').slice(0,300));
 await browser.close();
})();
