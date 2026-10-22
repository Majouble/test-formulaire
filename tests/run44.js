const __C = require('./chemins');
const { chromium } = require('playwright'); const fs=require('fs');
const src = fs.readFileSync('run27.js','utf8'); const mkDoc = eval('('+src.slice(src.indexOf('(sansDep) =>'), src.indexOf('\n};\n')+2)+')');
(async()=>{
 const browser = await chromium.launch({executablePath: __C.chromium});
 const log = p => { p.on('pageerror', e=>console.log('PAGEERROR',e.message)); p.on('console', m=>{ if(m.type()==='error'&&!/ERR_FAILED/.test(m.text())) console.log('CONSOLE',m.text().slice(0,200)); }); p.on('dialog', d=>d.accept()); };
 // A : document paramétré
 const doc = mkDoc(false); const C=doc.__data.Config;
 const T=doc._grist_Tables, Cc=doc._grist_Tables_column, rRep=T.id[T.tableId.indexOf('Reponses')];
 const addMeta=(tref,cid,type,extra={})=>{ const id=Math.max(...Cc.id)+1; Cc.id.push(id); Cc.parentId.push(tref); Cc.colId.push(cid); Cc.type.push(type); Cc.label.push(extra.label||cid); Cc.isFormula.push(!!extra.isFormula); Cc.formula.push(extra.formula||''); Cc.widgetOptions.push(extra.widgetOptions||''); Object.keys(Cc).forEach(k=>{ if(Cc[k].length<Cc.id.length) Cc[k].push(k==='visibleCol'?(extra.visibleCol||0):null); }); return id; };
 addMeta(rRep,'Visa_dep','Choice',{widgetOptions:JSON.stringify({choices:['Favorable','Réservé']}),label:'Visa départemental'});
 // sous-table Lignes_victimes
 T.id.push(200); T.tableId.push('Lignes_victimes'); doc.__data.Lignes_victimes={id:[]}; addMeta(200,'Libelle','Text'); addMeta(200,'Dossier','Ref:Reponses');
 const F=doc.__data.Formulaires; const pub=JSON.parse(F.Publie[0]); pub.blocs=[{id:'b1',genre:'question',colonne:'Visa_dep',section:'vd'},{id:'b2',genre:'question',colonne:'Description',reglages:{tableau:{table:'Lignes_victimes'}}}]; F.Publie[0]=JSON.stringify(pub); F.Brouillon[0]=JSON.stringify(pub);
 const tdb={tableaux:[{id:'principal',nom:'TDB MEN',table:'Reponses',brouillon:{blocks:[]},publie:{blocks:[]}}]};
 C.id.push(99,100); C.Cle.push('tableau_de_bord','schema'); C.Valeur.push(JSON.stringify(tdb), JSON.stringify({tables:{}})); if(C.Modifie_le) C.Modifie_le.push(null,null);
 let texte;
 { const page = await browser.newPage({viewport:{width:1300,height:1400}}); log(page);
   await page.route('**/grist-plugin-api.js', r=>r.fulfill({contentType:'text/javascript', body:`window.__DOC__=${JSON.stringify(doc)};`+fs.readFileSync('mock.js')+fs.readFileSync('fakeapi.js')+`;grist.onRecords=()=>{};grist.getOption=async()=>null;`}));
   await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(600);
   await page.check('#cfg-equipe'); await page.click('#cfg-exporter'); await page.waitForTimeout(600);
   console.log('EXPORT:', await page.textContent('#cfg-statut'));
   texte = await page.inputValue('#cfg-sortie'); const j = JSON.parse(texte);
   console.log('  clés:', Object.keys(j.config).join(','), '| formulaires:', j.formulaires.map(f=>f.Nom).join(','), '| tables:', Object.entries(j.structure.tables).map(([t,c])=>t+'('+c.length+')').join(','), '| équipe:', (j.equipe||[]).length);
   await page.close(); }
 // B : document vierge, installation puis import
 { const page = await browser.newPage({viewport:{width:1300,height:1600}}); log(page);
   await page.route('**/grist-plugin-api.js', r=>r.fulfill({contentType:'text/javascript', body:`window.__DOC__=${fs.readFileSync('${__C.donnees + '/'}blank.json')};`+fs.readFileSync('mock.js')+fs.readFileSync('fakeapi.js')+`;grist.onRecords=()=>{};grist.getOption=async()=>null;`}));
   await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(500);
   await page.click('#cfg-coller-btn'); await page.fill('#cfg-coller-texte', texte); await page.click('#cfg-coller-ok'); await page.waitForTimeout(500);
   console.log('AVANT INSTALL:', await page.textContent('#cfg-statut'));
   await page.click('#btn-appliquer'); await page.waitForTimeout(800);
   await page.click('#cfg-coller-ok'); await page.waitForTimeout(600);
   console.log('ANALYSE:', (await page.$$eval('#cfg-analyse .etape', x=>x.map(e=>(e.querySelector('input')?.checked?'[x] ':'[ ] ')+e.textContent.replace(/\s+/g,' ').trim().slice(0,110)))).join('\n   '));
   await page.screenshot({path:'cfg-1.png', fullPage:true});
   await page.click('#cfg-appliquer'); await page.waitForTimeout(1200);
   console.log('RESULTAT:', await page.textContent('#cfg-statut'), '\n', (await page.textContent('#cfg-suite')).replace(/\s+/g,' ').slice(0,500));
   const verif = await page.evaluate(()=>{ const D=window.__DOC__, T=D._grist_Tables, C=D._grist_Tables_column; const cols=t=>{const r=T.id[T.tableId.indexOf(t)]; return C.id.map((_,i)=>i).filter(i=>C.parentId[i]===r).map(i=>C.colId[i]+':'+C.type[i]).join(' ');};
     const cfg=D.__data.Config; return { reponses: cols('Reponses'), sous: cols('Lignes_victimes'), cles: cfg.Cle.join(','), form: D.__data.Formulaires.Nom.join(','), agents: (D.__data.Agents||{}).Nom };});
   console.log(JSON.stringify(verif, null, 1));
   await page.close(); }
 await browser.close();
})();
