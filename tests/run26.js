const __C = require('./chemins');
const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{
 const doc = JSON.parse(fs.readFileSync(__C.donnees + '/' + 'doc_planning3.json'));
 // quelques signalements supplémentaires
 const R = doc.__data.Reponses; const E = doc.__data.Etablissements;
 E.Latitude=[48.80,48.81,48.79]; E.Longitude=[2.13,2.39,2.40];
 const lignes=[{Etablissement:1,Dossier:1,Qualification:['L','Blocage'],Derniere_version:false,Description:'v1'},{Etablissement:1,Dossier:1,Qualification:['L','RAS'],Derniere_version:true,Description:'v2'},{Etablissement:2,Dossier:3,Qualification:['L','Intrusion'],Derniere_version:true,Description:'x'},{Etablissement:3,Dossier:4,Qualification:['L','Blocage'],Derniere_version:true,Description:'y'}];
 const cols=['Etablissement','Dossier','Qualification','Derniere_version','Description']; R.id=[1,2,3,4]; cols.forEach(c=>R[c]=lignes.map(l=>l[c]));

 const browser = await chromium.launch({executablePath: __C.chromium}); const page = await browser.newPage({viewport:{width:1100,height:1300}});
 page.on('pageerror', e=>console.log('PAGEERROR',e.message)); page.on('console', m=>{ if(m.type()==='error') console.log('CONSOLE',m.text().slice(0,200)); });
 await page.route('**/leaflet.min.js', r=>r.fulfill({contentType:'text/javascript', body: fs.readFileSync('node_modules/leaflet/dist/leaflet.js')}));
 await page.route('**/leaflet.min.css', r=>r.fulfill({contentType:'text/css', body: fs.readFileSync('node_modules/leaflet/dist/leaflet.css')}));
 await page.route('**/data.geopf.fr/**', r=>r.fulfill({contentType:'image/png', body: Buffer.alloc(0)}));
 await page.route('**/grist-plugin-api.js', r=>r.fulfill({contentType:'text/javascript', body:`window.__DOC__=${JSON.stringify(doc)};window.__OPTS__={};`+fs.readFileSync('mock.js')+fs.readFileSync('fakeapi.js')+fs.readFileSync('mock-saisie.js')}));
 await page.goto('file://' + __C.racine + '/v2/cartographie/index.html'); await page.waitForTimeout(3000);
 console.log('LEAFLET:', await page.evaluate(()=>!!window.L));
 console.log('SOURCE:', await page.textContent('#source'));
 console.log('STATS:', (await page.textContent('#stats')).replace(/\s+/g,' '));
 console.log('MSG:', (await page.textContent('#messages')).replace(/\s+/g,' ').slice(0,300));
 console.log('COULEURS:', (await page.textContent('#couleurs')).replace(/\s+/g,' '), '| colorBy:', await page.inputValue('#colorBy'));
 console.log('COLS:', (await page.textContent('#colsCount')));
 await page.selectOption('#format','geojson');
 const gj = await page.evaluate(async()=>{ const o = await (async()=>{ const b=document.getElementById('copy'); b.click(); await new Promise(r=>setTimeout(r,300)); return document.getElementById('output').value; })(); return o.slice(0,700); });
 console.log('GEOJSON:', gj);
 await page.uncheck('#dvOnly'); await page.waitForTimeout(300);
 console.log('STATS2:', (await page.textContent('#stats')).replace(/\s+/g,' '));
 await page.screenshot({path:'carte-1.png', fullPage:false});
 console.log('DIAG:', await page.textContent('#diag'));
 await browser.close();
})();
