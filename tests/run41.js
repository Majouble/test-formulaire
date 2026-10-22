const __C = require('./chemins');
const { chromium } = require('playwright'); const fs=require('fs');
const src = fs.readFileSync('run27.js','utf8'); const mkDoc = eval('('+src.slice(src.indexOf('(sansDep) =>'), src.indexOf('\n};\n')+2)+')');
(async()=>{
 const browser = await chromium.launch({executablePath: __C.chromium});
 const log = p => { p.on('pageerror', e=>console.log('PAGEERROR',e.message)); p.on('console', m=>{ if(m.type()==='error'&&!/ERR_FAILED/.test(m.text())) console.log('CONSOLE',m.text().slice(0,200)); }); p.on('dialog', d=>d.accept()); };
 let doc = mkDoc(false); const C=doc.__data.Config;
 const ancien={name:'Tableau de bord',filters:[],blocks:[{id:'t1',type:'tile',title:'Signalements MEN',measure:{agg:'count'},conds:[]}]};
 C.id.push(99); C.Cle.push('tableau_de_bord'); C.Valeur.push(JSON.stringify({publie:ancien,brouillon:ancien,publie_le:1792000000})); if(C.Modifie_le) C.Modifie_le.push(null);
 // seconde table de signalements (ESR) et son formulaire
 const page = await browser.newPage({viewport:{width:1300,height:1000}}); log(page);
 await page.route('**/grist-plugin-api.js', r=>r.fulfill({contentType:'text/javascript', body:`window.__DOC__=${JSON.stringify(doc)};`+fs.readFileSync('mock.js')+fs.readFileSync('fakeapi.js')+`;grist.onRecords=()=>{};grist.getOption=async()=>null;`}));
 await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(400);
 await page.evaluate(async()=>{ await grist.docApi.applyUserActions([["AddTable","Reponses_ESR",[{id:"Site",type:"Text"},{id:"Qualification",type:"Text"}]],["BulkAddRecord","Reponses_ESR",[null,null,null],{Site:["A","B","C"],Qualification:["RAS","Blocage","RAS"]}],["AddRecord","Formulaires",null,{Nom:"ESR",Table:"Reponses_ESR",Type:"etablissement",Publie:"{\"blocs\":[]}"}]]); });
 await page.click('nav button[data-onglet=onglet-tdb]'); await page.waitForTimeout(900);
 const etat = async () => `choix=[${await page.$$eval('#tdb-choix option', x=>x.map(o=>(o.selected?'*':'')+o.textContent).join(' | '))}] etat=${await page.textContent('#tdb-etat')} tuiles=${await page.$$eval('#tableau-de-bord .tile h2', x=>x.map(e=>e.textContent).join(' / '))} pages=${(await page.textContent('#tdb-pages')).replace(/\s+/g,' ')}`;
 console.log('E0:', await etat());
 await page.click('#tdb-menu-btn'); await page.click('#tdb-nouveau'); await page.waitForTimeout(300);
 await page.fill('#tdb-p-nom','Tableau de bord MESRE'); await page.selectOption('#tdb-p-table','Reponses_ESR'); await page.check('#tdb-p-copie'); await page.click('#tdb-p-ok'); await page.waitForTimeout(900);
 console.log('E1:', await etat(), '|', await page.textContent('#tdb-statut'));
 console.log('AIDE:', (await page.textContent('#tdb-aide')).slice(0,110));
 // modifier le titre de la tuile du MESRE, publier, créer la page
 await page.click('#tdb-ajouter'); await page.click('[data-act=st-creer][data-k=tile]'); await page.waitForTimeout(700);
 await page.click('#tdb-publier'); await page.waitForTimeout(400);
 await page.click('#tdb-menu-btn'); await page.click('#tdb-page-creer'); await page.waitForTimeout(500);
 console.log('E2:', await etat());
 await page.selectOption('#tdb-choix', {index:0}); await page.waitForTimeout(900);
 console.log('E3 (retour MEN):', await etat());
 const cfg = await page.evaluate(()=>{ const C=window.__DOC__.__data.Config; return JSON.parse(C.Valeur[C.Cle.indexOf('tableau_de_bord')]); });
 console.log('CONFIG:', cfg.tableaux.map(t=>`${t.id}:${t.nom}:${t.table}:brouillon ${t.brouillon&&t.brouillon.blocks.length} blocs:publie ${t.publie?t.publie.blocks.length:'-'}`).join(' || '), '| tête publie blocs', cfg.publie&&cfg.publie.blocks.length);
 const vues = await page.evaluate(()=>{ const S=window.__DOC__._grist_Views_section; return S.options.map((o,i)=>{ try{ return S.tableRef[i]+':'+JSON.stringify(JSON.parse(JSON.parse(o).customView).widgetOptions);}catch(_){return '';} }).filter(Boolean).join(' ; '); });
 console.log('VUES:', vues);
 // renommer
 await page.click('#tdb-menu-btn'); await page.click('#tdb-gerer'); await page.fill('#tdb-p-nom','Tableau de bord MEN'); await page.click('#tdb-p-ok'); await page.waitForTimeout(500);
 console.log('E4:', await etat());
 doc = await page.evaluate(()=>window.__DOC__); await page.close();
 // widgets
 const mesre = doc.__data.Config; const id2 = JSON.parse(mesre.Valeur[mesre.Cle.indexOf('tableau_de_bord')]).tableaux[1].id;
 for (const [opts, tab] of [[{}, 'Reponses'], [{tableau:id2}, 'Reponses_ESR'], [{tableau:'inconnu'}, 'Reponses']]) {
   const p = await browser.newPage({viewport:{width:900,height:700}}); log(p);
   await p.route('**/grist-plugin-api.js', r=>r.fulfill({contentType:'text/javascript', body:`window.__DOC__=${JSON.stringify(doc)};window.__OPTS__=${JSON.stringify(opts)};`+fs.readFileSync('mock.js')+fs.readFileSync('fakeapi.js')+fs.readFileSync('mock-saisie.js')+`;grist.getTable=()=>({getTableId:async()=>'${tab}'});`}));
   await p.goto('file://' + __C.racine + '/v2/tableau-de-bord/index.html'); await p.waitForTimeout(1500);
   console.log('WIDGET', JSON.stringify(opts), '→', await p.$eval('#tdb-message', e=>e.hidden?'':e.textContent), '| tuiles:', await p.$$eval('.tile', x=>x.length));
   await p.close();
 }
 await browser.close();
})();
