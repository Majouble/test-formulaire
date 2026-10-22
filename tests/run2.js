const __C = require('./chemins');
const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{
 const browser = await chromium.launch({executablePath: __C.chromium}); const page = await browser.newPage({viewport:{width:1000,height:900}});
 page.on('pageerror', e=>console.log('PAGEERROR',e.message)); page.on('console', m=>{ if(m.type()==='error') console.log('console:',m.text())});
 await page.route('**/grist-plugin-api.js', r=>r.fulfill({contentType:'text/javascript', body:`window.__DOC__=${fs.readFileSync('${__C.donnees + '/'}blank.json')};`+fs.readFileSync('mock.js')+fs.readFileSync('fakeapi.js')}));
 await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(400);
 await page.click('#btn-appliquer'); await page.waitForTimeout(500);
 await page.fill('#g-academies','Versailles\nCréteil\nOrleans'); await page.click('#btn-general'); await page.waitForTimeout(300);
 // ligne manuelle avec un UAI de l'annuaire
 await page.evaluate(()=>grist.docApi.applyUserActions([["AddRecord","Etablissements",null,{UAI:"0781234a",Nom:"saisie main",Origine:"Manuel"}]]));
 await page.click('nav button[data-onglet=referentiel]'); await page.waitForTimeout(300);
 console.log('CTX:', (await page.textContent('#ref-contexte')).replace(/\s+/g,' '));
 await page.click('#btn-ref-apercu'); await page.waitForTimeout(400);
 console.log('ACA:', (await page.textContent('#ref-academies')).replace(/\s+/g,' '));
 console.log('TYPES:', (await page.textContent('#ref-types')).replace(/\s+/g,' '));
 await page.uncheck('#ref-types input >> nth=2').catch(()=>{});
 
 await page.click('#btn-ref-analyser'); await page.waitForTimeout(500);
 console.log('BILAN:', (await page.textContent('#ref-bilan')).replace(/\s+/g,' '), '|', await page.textContent('#ref-statut'));
 await page.screenshot({path:'ref-1.png',fullPage:true});
 await page.click('#btn-ref-importer'); await page.waitForTimeout(500);
 console.log('STATUT:', await page.textContent('#ref-statut'));
 console.log('ETAB:', JSON.stringify(await page.evaluate(()=>window.__DOC__.__data.Etablissements)));
 // relance : rien à faire attendu
 await page.click('#btn-ref-apercu'); await page.waitForTimeout(300); await page.click('#btn-ref-analyser'); await page.waitForTimeout(400);
 console.log('BILAN2:', (await page.textContent('#ref-bilan')).replace(/\s+/g,' '), '|', await page.textContent('#ref-statut'));
 console.log('CONFIG:', JSON.stringify(await page.evaluate(()=>window.__DOC__.__data.Config.Cle)));
 console.log('WHERE:', (await page.evaluate(()=>window.__FETCHLOG__)).filter(u=>u.includes('exports')).slice(-1)[0]);
 await browser.close();
})();
