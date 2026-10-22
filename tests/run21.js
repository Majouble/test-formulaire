const __C = require('./chemins');
const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{
 const browser = await chromium.launch({executablePath: __C.chromium}); const page = await browser.newPage({viewport:{width:1300,height:1300}});
 page.on('pageerror', e=>console.log('PAGEERROR',e.message)); page.on('dialog', d=>{console.log('DIALOG',d.message()); d.accept();});
 await page.route('**/grist-plugin-api.js', r=>r.fulfill({contentType:'text/javascript', body:`window.__DOC__=${fs.readFileSync('${__C.donnees + '/'}doc_planning2.json')};`+fs.readFileSync('mock.js')+fs.readFileSync('fakeapi.js')+`;grist.onRecords=()=>{};grist.getOption=async()=>null;`}));
 await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(500);
 await page.click('nav button[data-onglet=planning]'); await page.waitForTimeout(600);
 console.log('BANDEAU:', (await page.textContent('#planning .bandeau')).replace(/\s+/g,' '));
 await page.click('#pl-completer'); await page.waitForTimeout(600);
 console.log('BANDEAU2:', await page.$('#planning .bandeau') ? 'encore' : 'disparu');
 await page.click('#pl-ouvrir-reglages'); await page.waitForTimeout(200);
 await page.click('[data-monter-fonction="2"]'); await page.waitForTimeout(150);   // Rédacteur ↑
 await page.uncheck('[data-fonction="3"] [data-champ=ligne]');                  // Chef de salle masquée
 await page.fill('[data-fonction="1"] [data-champ=nom]', 'Rédacteur PS');       // renommage
 await page.click('#pl-reg-enregistrer'); await page.waitForTimeout(500);
 console.log('REG:', await page.textContent('#pl-reg-statut'));
 console.log('AGENTS F:', JSON.stringify(await page.evaluate(()=>window.__DOC__.__data.Agents.Fonction)), 'AFF F:', JSON.stringify(await page.evaluate(()=>window.__DOC__.__data.Affectations.Fonction)));
 console.log('LIGNES:', (await page.$$eval('.pl-tableau tbody th', x=>x.map(e=>e.textContent))).join(' | '));
 // Opérateur, aujourd'hui : Bob ESR seulement
 await page.locator('.pl-tableau td.auj .pl-cellule[data-fonction="Opérateur"]').click(); await page.waitForTimeout(200);
 const i = await page.evaluate(()=>{ const d=[...document.querySelectorAll('.pl-aff')].find(x=>/Bob/.test(x.textContent)); return d.dataset.i; });
 await page.click(`.eq-puce[data-champ-ligne="${i}"][data-val="EN"]`); await page.waitForTimeout(150);
 await page.screenshot({path:'pl-5.png'});
 await page.click('#pl-enregistrer'); await page.waitForTimeout(400);
 console.log('TAB:', (await page.textContent('.pl-tableau')).replace(/\s+/g,' '));
 console.log('AFF CHAMP:', JSON.stringify(await page.evaluate(()=>window.__DOC__.__data.Affectations.Champ)));
 await page.screenshot({path:'pl-6.png', fullPage:true});
 await page.click('nav button[data-onglet=formulaires]'); await page.waitForTimeout(900);
 console.log('FORM PAGES:', (await page.evaluate(()=>{ const x=[...document.querySelectorAll('.groupe')].find(e=>/Pages de saisie/.test(e.textContent)); return x? x.textContent:''; })).replace(/\s+/g,' '));
 fs.writeFileSync(__C.donnees + '/' + 'doc_planning3.json', JSON.stringify(await page.evaluate(()=>window.__DOC__)));
 await browser.close();
})();
