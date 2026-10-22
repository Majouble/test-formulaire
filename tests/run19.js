const __C = require('./chemins');
const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{
 const browser = await chromium.launch({executablePath: __C.chromium}); const page = await browser.newPage({viewport:{width:1300,height:1300}});
 page.on('pageerror', e=>console.log('PAGEERROR',e.message)); page.on('dialog', d=>{console.log('DIALOG',d.message()); d.accept();});
 await page.route('**/grist-plugin-api.js', r=>r.fulfill({contentType:'text/javascript', body:`window.__DOC__=${fs.readFileSync('${__C.donnees + '/'}doc_planning.json')};`+fs.readFileSync('mock.js')+fs.readFileSync('fakeapi.js')+`;grist.onRecords=()=>{};grist.getOption=async()=>null;`}));
 await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(500);
 await page.click('nav button[data-onglet=equipe]'); await page.waitForTimeout(500);
 console.log('EQ:', (await page.textContent('#equipe')).replace(/\s+/g,' ').slice(0,500));
 await page.click('nav button[data-onglet=planning]'); await page.waitForTimeout(500);
 console.log('TAB:', (await page.textContent('.pl-tableau')).replace(/\s+/g,' '));
 // Rédacteur, lundi : David toute la journée
 const lun = await page.getAttribute('.pl-tableau thead th:nth-child(2)', 'class');
 const cell = page.locator('.pl-cellule[data-fonction="Rédacteur"]').first();
 await cell.click(); await page.waitForTimeout(200);
 console.log('ED:', (await page.textContent('#pl-edition')).replace(/\s+/g,' ').slice(0,300));
 await page.selectOption('#pl-ajout-journee', '4'); await page.waitForTimeout(200);
 await page.click('.pl-aff[data-i="0"] .eq-puce[data-val="Créteil"]');
 await page.selectOption('[data-ajout-creneau] >> nth=0', '1'); await page.waitForTimeout(200);
 await page.screenshot({path:'pl-3.png', fullPage:true});
 await page.click('#pl-enregistrer'); await page.waitForTimeout(400);
 console.log('STATUT:', await page.textContent('#pl-statut'));
 // créneaux du dimanche
 await page.locator('.pl-cr-jour').nth(6).click(); await page.waitForTimeout(200);
 await page.click('#pl-plus-cr'); await page.waitForTimeout(100);
 await page.fill('[data-cr="1"] [data-champ=nom]','Astreinte soir'); await page.fill('[data-cr="1"] [data-champ=debut]','19:00'); await page.fill('[data-cr="1"] [data-champ=fin]','08:00');
 await page.click('#pl-enregistrer'); await page.waitForTimeout(400);
 console.log('STATUT2:', await page.textContent('#pl-statut'));
 console.log('TAB2:', (await page.textContent('.pl-tableau')).replace(/\s+/g,' '));
 await page.click('#pl-reglages summary');
 console.log('REG:', (await page.textContent('#pl-reglages')).replace(/\s+/g,' ').slice(0,300));
 await page.screenshot({path:'pl-4.png', fullPage:true});
 const C = await page.evaluate(()=>window.__DOC__.__data.Creneaux); console.log('DERNIER CRENEAU:', C.Nom.at(-1), new Date(C.Debut.at(-1)*1000).toString().slice(0,24), '→', new Date(C.Fin.at(-1)*1000).toString().slice(0,24));
 fs.writeFileSync(__C.donnees + '/' + 'doc_planning2.json', JSON.stringify(await page.evaluate(()=>window.__DOC__)));
 await browser.close();
})();
