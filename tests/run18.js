const __C = require('./chemins');
const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{
 const doc = JSON.parse(fs.readFileSync(__C.donnees + '/' + 'doc_planning3.json'));
 const browser = await chromium.launch({executablePath: __C.chromium}); const page = await browser.newPage({viewport:{width:1100,height:800}});
 page.on('pageerror', e=>console.log('PAGEERROR',e.message));
 for (const [agent, perim] of [[2, {Academie:['Créteil']}], [1, {Academie:['Versailles','Créteil'],Statut_public_prive:['Public']}], [4, {}]]) {
   const opts = { formulaire: 'Signalements', libelle: ['','Alice','Bob','Chloé','David'][agent], perimetre: perim, agent };
   await page.route('**/grist-plugin-api.js', r=>r.fulfill({contentType:'text/javascript', body:`window.__DOC__=${JSON.stringify(doc)};window.__OPTS__=${JSON.stringify(opts)};`+fs.readFileSync('mock.js')+fs.readFileSync('fakeapi.js')+fs.readFileSync('mock-saisie.js')}));
   await page.goto('file://' + __C.racine + '/v2/saisie/index.html'); await page.waitForTimeout(1500);
   console.log('BANDEAU', agent, ':', (await page.textContent('#bandeau-perimetre')).replace(/\s+/g,' '));
   if (agent===2) await page.screenshot({path:'saisie-pl.png'});
   await page.unroute('**/grist-plugin-api.js');
 }
 await browser.close();
})();
