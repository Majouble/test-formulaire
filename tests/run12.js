const __C = require('./chemins');
const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{
 const doc = JSON.parse(fs.readFileSync(__C.donnees + '/' + 'doc_ps.json'));
 doc.__data.Reponses.Qualification[0]='Blocage';
 const browser = await chromium.launch({executablePath: __C.chromium}); const page = await browser.newPage({viewport:{width:1400,height:1000}});
 page.on('pageerror', e=>console.log('PAGEERROR',e.message)); page.on('dialog', d=>{ console.log('DIALOG', d.message().slice(0,120)); d.accept(); });
 page.on('console', m=>{ if(m.type()==='error') console.log('console:',m.text().slice(0,200))});
 await page.route('**/grist-plugin-api.js', r=>r.fulfill({contentType:'text/javascript', body:`window.__DOC__=${JSON.stringify(doc)};`+fs.readFileSync('mock.js')+fs.readFileSync('fakeapi.js')+`;grist.onRecords=()=>{};grist.getOption=async()=>null;grist.docApi.listTables=async()=>window.__DOC__._grist_Tables.tableId.slice();`}));
 await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(400);
 await page.click('nav button[data-onglet="point-situation"]'); await page.waitForTimeout(1200);
 console.log('INFO:', await page.textContent('#ps-apercu-info'));
 await page.screenshot({path:'ps2-1.png'});
 // tableau 2 : ajouter une condition, choisir Établissement › Académie = Créteil
 await page.click('[data-act=clause-ajouter][data-i="1"]'); await page.waitForTimeout(400);
 await page.selectOption('select[data-clause="0"][data-i="1"][data-cc=chemin]', 'Etablissement.Academie'); await page.waitForTimeout(400);
 await page.fill('input[data-clause="0"][data-i="1"][data-cc=val]', 'Créteil'); await page.waitForTimeout(800);
 console.log('COND:', await page.evaluate(()=>document.querySelector('input[data-clause="0"][data-i="1"][data-cc=val]').list.options.length), 'valeurs proposées');
 console.log('INFO2:', await page.textContent('#ps-apercu-info'));
 // colonne Synthèse : ajouter une ligne Commune en gras
 await page.selectOption('select[data-act-select=ligne-ajouter][data-i="4"]', 'Etablissement.Commune'); await page.waitForTimeout(300);
 await page.selectOption('select[data-ligne="1"][data-i="4"][data-lc=style]', '**'); await page.waitForTimeout(800);
 const v = await page.evaluate(()=>{const t=window.__DOC__.__data.Config; return JSON.parse(t.Valeur[t.Cle.indexOf('point_situation')]).brouillon;});
 console.log('BROUILLON sections:', JSON.stringify(v.sections.map(s=>s.Condition)), '| col5:', JSON.stringify(v.colonnes[4].Contenu));
 await page.screenshot({path:'ps2-2.png'});
 await browser.close();
})();
