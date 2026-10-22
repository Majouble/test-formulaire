const __C = require('./chemins');
const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{
 const browser = await chromium.launch({executablePath: __C.chromium}); const page = await browser.newPage();
 page.on('pageerror', e=>console.log('PAGEERROR',e.message));
 await page.route('**/grist-plugin-api.js', r=>r.fulfill({contentType:'text/javascript', body:`window.__DOC__=${fs.readFileSync('${__C.donnees + '/'}doc_equipe.json')};`+fs.readFileSync('mock.js')+fs.readFileSync('fakeapi.js')+`;grist.onRecords=()=>{};grist.getOption=async()=>null;`}));
 await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(500);
 console.log(await page.evaluate(async()=>{ try { await grist.docApi.applyUserActions([["RemoveColumn","Agents","Acces"],["RemoveColumn","Agents","Fonction"],["AddColumn","Agents","Role",{type:"Choice"}],["UpdateRecord","Agents",1,{Role:"Saisie"}]]); return 'ok'; } catch(e){ return e.message; } }));
 await page.click('nav button[data-onglet=equipe]'); await page.waitForTimeout(800);
 console.log((await page.textContent('#equipe')).slice(0,300));
 await browser.close();
})();
