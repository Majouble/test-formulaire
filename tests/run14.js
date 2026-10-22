const __C = require('./chemins');
const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{
 const doc = JSON.parse(fs.readFileSync(__C.donnees + '/' + 'doc_ps.json'));
 const browser = await chromium.launch({executablePath: __C.chromium}); const page = await browser.newPage({viewport:{width:1300,height:1000}});
 page.on('pageerror', e=>console.log('PAGEERROR',e.message)); page.on('dialog', d=>{ console.log('DIALOG', d.message().slice(0,120)); d.type()==='prompt' ? d.accept(d.defaultValue()) : d.accept(); });
 page.on('console', m=>{ if(m.type()==='error') console.log('console:',m.text().slice(0,200))});
 await page.route('**/grist-plugin-api.js', r=>r.fulfill({contentType:'text/javascript', body:`window.__DOC__=${JSON.stringify(doc)};`+fs.readFileSync('mock.js')+fs.readFileSync('fakeapi.js')+`;grist.onRecords=()=>{};grist.onOptions=()=>{};grist.getOption=async()=>null;grist.docApi.listTables=async()=>window.__DOC__._grist_Tables.tableId.slice();`}));
 await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(400);
 await page.click('nav button[data-onglet="onglet-tdb"]'); await page.waitForTimeout(1500);
 console.log('ETAT:', await page.textContent('#tdb-etat'), '|', await page.textContent('#tdb-statut'));
 console.log('TUILES:', (await page.textContent('#tiles')).replace(/\s+/g,' ').slice(0,200));
 await page.click('#addTile'); await page.waitForTimeout(900);
 await page.screenshot({path:'tdb-admin.png'});
 await page.click('#tdb-publier'); await page.waitForTimeout(800); console.log('PAGES:', await page.textContent('#tdb-pages'), '|', await page.textContent('#tdb-statut')); console.log('VUES:', JSON.stringify(await page.evaluate(()=>({n:window.__DOC__._grist_Views.name, o:window.__DOC__._grist_Views_section.options.map(o=>JSON.parse(JSON.parse(o).customView).url)}))));
 console.log('PUBLIE:', await page.textContent('#tdb-etat'), '|', await page.textContent('#tdb-statut'));
 const v = await page.evaluate(()=>{const t=window.__DOC__.__data.Config; return JSON.parse(t.Valeur[t.Cle.indexOf('tableau_de_bord')]);});
 console.log('CONFIG blocs publiés:', v.publie.blocks.length, v.publie.blocks.map(b=>b.type+':'+b.title).join(' | '));
 // autres onglets : les clics n'interfèrent pas
 await page.click('nav button[data-onglet="installation"]'); await page.waitForTimeout(300);
 console.log('INSTALL OK:', await page.textContent('#bandeau'));
 fs.writeFileSync(__C.donnees + '/' + 'doc_tdb.json', JSON.stringify(await page.evaluate(()=>window.__DOC__)));
 await browser.close();
 // widget en lecture
 const doc2 = JSON.parse(fs.readFileSync(__C.donnees + '/' + 'doc_tdb.json'));
 const b2 = await chromium.launch({executablePath: __C.chromium}); const p2 = await b2.newPage({viewport:{width:1100,height:800}});
 p2.on('pageerror', e=>console.log('PAGEERROR2',e.message));
 await p2.route('**/grist-plugin-api.js', r=>r.fulfill({contentType:'text/javascript', body:`window.__DOC__=${JSON.stringify(doc2)};`+fs.readFileSync('mock.js')+fs.readFileSync('mock-saisie.js')}));
 await p2.goto('file://' + __C.racine + '/v2/tableau-de-bord/index.html'); await p2.waitForTimeout(1500);
 console.log('WIDGET:', (await p2.textContent('body')).replace(/\s+/g,' ').slice(0,300));
 console.log('EDIT VISIBLE:', await p2.isVisible('#addTile'));
 await p2.screenshot({path:'tdb-widget.png'});
 await b2.close();
})();
