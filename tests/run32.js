const __C = require('./chemins');
const { chromium } = require('playwright'); const fs=require('fs');
const src = fs.readFileSync('run27.js','utf8'); const mkDoc = eval('('+src.slice(src.indexOf('(sansDep) =>'), src.indexOf('\n};\n')+2)+')');
(async()=>{
 const browser = await chromium.launch({executablePath: __C.chromium});
 const log = p => { p.on('pageerror', e=>console.log('PAGEERROR',e.message)); p.on('console', m=>{ if(m.type()==='error'&&!/Blocked/.test(m.text())) console.log('CONSOLE',m.text().slice(0,200)); }); };
 // 1. l'administration range la copie des colonnes (onglet Établissements)
 let doc = mkDoc(false);
 { const page = await browser.newPage(); log(page);
   await page.route('**/grist-plugin-api.js', r=>r.fulfill({contentType:'text/javascript', body:`window.__DOC__=${JSON.stringify(doc)};`+fs.readFileSync('mock.js')+fs.readFileSync('fakeapi.js')+`;grist.onRecords=()=>{};grist.getOption=async()=>null;`}));
   await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(400);
   await page.click('nav button[data-onglet=liens]'); await page.waitForTimeout(600);
   await page.click('[data-act=colonnes]'); await page.waitForTimeout(800);
   const sch = await page.evaluate(()=>{ const C=window.__DOC__.__data.Config; const i=C.Cle.indexOf('schema'); return i<0?null:JSON.parse(C.Valeur[i]); });
   console.log('SCHEMA:', sch ? Object.entries(sch.tables).map(([t,l])=>t+'('+l.length+')').join(', ') : 'absent');
   doc = await page.evaluate(()=>window.__DOC__); await page.close(); }
 // 2. établissement ouvert par son lien : métadonnées illisibles
 const vue = (avecSchema) => { const d = JSON.parse(JSON.stringify(doc));
   const E=d.__data.Etablissements; Object.keys(E).forEach(k=>{ E[k]=[E[k][1]]; }); delete E.UUID; delete E.Lien;
   const R=d.__data.Reponses, idx=R.Etablissement.map((e,i)=>e===2?i:-1).filter(i=>i>=0); Object.keys(R).forEach(k=>{ R[k]=idx.map(i=>R[k][i]); });
   if (!avecSchema) { const C=d.__data.Config, i=C.Cle.indexOf('schema'); Object.keys(C).forEach(k=>C[k].splice(i,1)); }
   return d; };
 const bloquees=['_grist_Tables','_grist_Tables_column','Agents','Creneaux','Affectations','Emargements','Actions'];
 for (const avec of [false, true]) {
   const d = vue(avec), page = await browser.newPage({viewport:{width:900,height:1100}}); log(page);
   await page.route('**/grist-plugin-api.js', r=>r.fulfill({contentType:'text/javascript', body:`window.__DOC__=${JSON.stringify(d)};window.__OPTS__={formulaire:'Signalements',etablissements:'Etablissements'};`+fs.readFileSync('mock.js')+fs.readFileSync('fakeapi.js')+fs.readFileSync('mock-saisie.js')
     +`;(()=>{const f=grist.docApi.fetchTable;grist.docApi.fetchTable=async t=>{ if(${JSON.stringify(bloquees)}.includes(t)) throw new Error('Blocked by table read access rules'); return f(t); };})();`}));
   await page.goto('file://' + __C.racine + '/v2/saisie/index.html'); await page.waitForTimeout(2500);
   console.log(avec?'AVEC copie':'SANS copie', '| liste:', await page.textContent('#titre-liste'), '| alerte:', await page.$eval('#alerte', e=>e.hidden?'(aucune)':e.textContent.slice(0,140)));
   if (avec) {
     await page.click('#porte-nouveau'); await page.waitForTimeout(500);
     const q = await page.$$eval('[data-champ^="q-"]', x=>x.map(e=>e.dataset.champ+':'+(e.querySelector('select')?'liste':e.querySelector('input[type=radio]')?'boutons':e.querySelector('input,textarea')?.type||'?')));
     console.log('CHAMPS:', q.join(', '));
     await page.screenshot({path:'etab-2.png'});
     // remplir la qualification et enregistrer
     const qual = await page.$('[data-champ="q-Qualification"] input[type=radio], [data-champ="q-Qualification"] select, #qualification');
     await page.click('text=RAS'); await page.waitForTimeout(200);
     const avant = await page.evaluate(()=>window.__DOC__.__data.Reponses.id.length);
     await page.click('text=Enregistrer le signalement'); await page.waitForTimeout(1200);
     console.log('ENREGISTRE:', await page.evaluate(()=>{ const R=window.__DOC__.__data.Reponses, i=R.id.length-1; return R.id.length+' lignes ; dernière : Etablissement='+R.Etablissement[i]+' Dossier='+R.Dossier[i]+' id='+R.id[i]+' Qualification='+JSON.stringify(R.Qualification[i]); }), 'avant', avant);
     console.log('STATUT:', await page.textContent('#statut-signalement').catch(()=>'?'));
   }
   await page.close();
 }
 await browser.close();
})();
