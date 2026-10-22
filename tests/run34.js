const __C = require('./chemins');
const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{
 const browser = await chromium.launch({executablePath: __C.chromium}); const page = await browser.newPage({viewport:{width:1300,height:1100}});
 page.on('pageerror', e=>console.log('PAGEERROR',e.message)); page.on('dialog', d=>d.accept());
 await page.route('**/grist-plugin-api.js', r=>r.fulfill({contentType:'text/javascript', body:`window.__DOC__=${fs.readFileSync('${__C.donnees + '/'}blank.json')};`+fs.readFileSync('mock.js')+fs.readFileSync('fakeapi.js')+`;grist.onRecords=()=>{};grist.getOption=async()=>null;`}));
 await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(400);
 console.log('PLAN circ:', await page.evaluate(async()=>Socle.planInstallation(await Socle.lireMeta(), await Socle.lireConfig()).etapes.filter(e=>/circonscription|table-referentiel/i.test(e.titre+e.detail)).map(e=>e.titre).join(' | ')));
 // document existant dont le référentiel n'a pas la colonne : l'import la crée
 await page.click('#btn-appliquer'); await page.waitForTimeout(500);
 await page.evaluate(()=>grist.docApi.applyUserActions([["RemoveColumn","Etablissements","Nom_circonscription"]]).catch(e=>console.log('rm',e.message)));
 await page.fill('#g-academies','Versailles\nCréteil'); await page.click('#btn-general'); await page.waitForTimeout(300);
 await page.click('nav button[data-onglet=referentiel]'); await page.waitForTimeout(300);
 await page.click('#btn-ref-apercu'); await page.waitForTimeout(300); await page.click('#btn-ref-analyser'); await page.waitForTimeout(400);
 console.log('BILAN:', (await page.textContent('#ref-bilan')).replace(/\s+/g,' ').slice(0,300));
 await page.click('#btn-ref-importer'); await page.waitForTimeout(500);
 console.log('CIRC:', JSON.stringify(await page.evaluate(()=>window.__DOC__.__data.Etablissements.Nom_circonscription)));
 await browser.close();
})();
