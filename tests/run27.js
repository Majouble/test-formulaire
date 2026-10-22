const __C = require('./chemins');
const { chromium } = require('playwright'); const fs=require('fs');
const mkDoc = (sansDep) => {
 const doc = JSON.parse(fs.readFileSync(__C.donnees + '/' + 'doc_planning3.json'));
 const E = doc.__data.Etablissements;
 const et=[['0781234A','Collège Jean Moulin',48.80,2.13,'Versailles','Yvelines'],['0941111B','Lycée Romain Rolland',48.81,2.39,'Créteil','Val-de-Marne'],['0942222C','Ecole Jules Ferry',48.79,2.40,'Créteil','Val-de-Marne'],
  ['0691111A','Lycée du Parc',45.77,4.85,'Lyon','Rhône'],['0131111A','Lycée Thiers',43.30,5.38,'Aix-Marseille','Bouches-du-Rhône'],['0291111A','Lycée de l\'Harteloire',48.39,-4.49,'Rennes','Finistère'],
  ['9741111A','Lycée Leconte de Lisle',-20.88,55.45,'La Réunion','La Réunion'],['6201111A','Lycée Fesch',41.92,8.74,'Corse','Corse-du-Sud'],['0591111A','Lycée Faidherbe',50.63,3.06,'Lille','Nord'],['0751111A','Lycée Henri-IV',48.846,2.347,'Paris','Paris']];
 const n=et.length; Object.keys(E).forEach(k=>{ if(k!=='id') E[k]=Array(n).fill(E[k][0]); });
 E.id=et.map((_,i)=>i+1); E.UAI=et.map(x=>x[0]); E.Nom=et.map(x=>x[1]); E.Latitude=et.map(x=>x[2]); E.Longitude=et.map(x=>x[3]); E.Academie=et.map(x=>x[4]); E.Departement=et.map(x=>x[5]);
 if (sansDep) { delete E.Departement; delete E.Academie; const T=doc._grist_Tables, C=doc._grist_Tables_column; const r=T.id[T.tableId.indexOf('Etablissements')];
   ['Departement','Academie'].forEach(cid=>{ const i=C.id.findIndex((_,k)=>C.parentId[k]===r&&C.colId[k]===cid); if(i>=0) Object.keys(C).forEach(k=>C[k].splice(i,1)); }); }
 const R = doc.__data.Reponses;
 const lignes=[]; [1,1,1,2,4,4,5,6,7,8,9,10,10,10,10,3].forEach((e,i)=>lignes.push({Etablissement:e,Dossier:i+1,Qualification:['L',i%3?'Blocage':'Intrusion'],Derniere_version:true,Description:'d'+i}));
 const cols=['Etablissement','Dossier','Qualification','Derniere_version','Description']; R.id=lignes.map((_,i)=>i+1); cols.forEach(c=>R[c]=lignes.map(l=>l[c]));
 return doc;
};
(async()=>{
 const browser = await chromium.launch({executablePath: __C.chromium});
 const log = p => { p.on('pageerror', e=>console.log('PAGEERROR',e.message)); p.on('console', m=>{ if(m.type()==='error') console.log('CONSOLE',m.text().slice(0,200)); }); };
 // 1. Tableau de bord (administration) : bloc carte des établissements
 { const doc=mkDoc(false); const page = await browser.newPage({viewport:{width:1300,height:1300}}); log(page);
   await page.route('**/grist-plugin-api.js', r=>r.fulfill({contentType:'text/javascript', body:`window.__DOC__=${JSON.stringify(doc)};`+fs.readFileSync('mock.js')+fs.readFileSync('fakeapi.js')+`;grist.onRecords=()=>{};grist.getOption=async()=>null;`}));
   await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(500);
   await page.click('nav button[data-onglet=onglet-tdb]'); await page.waitForTimeout(800);
   await page.click('#addCross'); await page.waitForTimeout(300);
   const last = await page.$$eval('select[data-k=chart]', x=>x.length-1);
   await page.selectOption(`select[data-k=chart] >> nth=${last}`, 'points'); await page.waitForTimeout(800);
   console.log('ROWS COL:', await page.inputValue(`select[data-k="rows.col"] >> nth=${last}`));
   console.log('EDITOR:', (await page.$$eval('select[data-k^="pts."]', x=>x.map(s=>s.dataset.k+'='+s.value))).join(' '));
   console.log('HINTS:', (await page.$$eval('.chart.points .hint', x=>x.map(e=>e.textContent))).join(' | '));
   console.log('CIRCLES:', await page.$$eval('.chart.points circle', x=>x.length), 'LEGEND:', (await page.textContent('.chart.points .legend')).replace(/\s+/g,' '));

   await page.selectOption(`select[data-k="rows.grain"] >> nth=${last}`, 'dep_uai').catch(()=>{});
   await page.selectOption(`select[data-k=chart] >> nth=${last}`, 'map'); await page.waitForTimeout(500);
   console.log('CHORO paths:', await page.$$eval('.chart.map path', x=>x.length), 'hints:', (await page.$$eval('.chart.map .hint', x=>x.map(e=>e.textContent))).join(' | ').slice(0,200));
   await page.selectOption(`select[data-k="rows.grain"] >> nth=${last}`, ''); await page.selectOption(`select[data-k=chart] >> nth=${last}`, 'points'); await page.waitForTimeout(500);
   const card = await page.$('.chart.points'); await card.screenshot({path:'pts-1.png'});
   // clic sur un point : détail
   await page.evaluate(()=>document.querySelector('.chart.points circle').dispatchEvent(new MouseEvent('click',{bubbles:true}))); await page.waitForTimeout(400);
   console.log('DRILL hidden:', await page.evaluate(()=>document.getElementById('drill').hidden));
   console.log('DRILL:', (await page.textContent('#drill')).replace(/\s+/g,' ').slice(0,160));
   await page.close(); }
 // 2. Cartographie sans Leaflet, référentiel sans département ni académie
 { const doc=mkDoc(true); const page = await browser.newPage({viewport:{width:1100,height:1300}}); log(page);
   await page.route('**/leaflet.min.js', r=>r.abort()); await page.route('**/leaflet.min.css', r=>r.abort());
   await page.route('**/grist-plugin-api.js', r=>r.fulfill({contentType:'text/javascript', body:`window.__DOC__=${JSON.stringify(doc)};window.__OPTS__={};`+fs.readFileSync('mock.js')+fs.readFileSync('fakeapi.js')+fs.readFileSync('mock-saisie.js')}));
   await page.goto('file://' + __C.racine + '/v2/cartographie/index.html'); await page.waitForTimeout(3000);
   console.log('LEAFLET:', await page.evaluate(()=>!!window.L), 'STATS:', (await page.textContent('#stats')).replace(/\s+/g,' '));
   console.log('PREVIEW circles:', await page.$$eval('#preview circle', x=>x.length), 'paths:', await page.$$eval('#preview path', x=>x.length));
   await page.selectOption('#format','csv'); await page.click('#copy'); await page.waitForTimeout(300);
   console.log('CSV:', (await page.inputValue('#output')).split('\n').slice(0,4).join('\n'));
   await page.screenshot({path:'carte-2.png'});
   await page.close(); }
 // 3. Widget du tableau de bord (lecture) : clic sur un point -> détail
 { const doc=mkDoc(false); const C=doc.__data.Config; const blocs={filters:[],blocks:[{id:'p1',type:'cross',title:'Signalements par établissement',measure:{agg:'count'},rows:{col:'Etablissement'},cols:{col:''},conds:[],view:'chart',chart:'points'}]};
   C.id.push(99); C.Cle.push('tableau_de_bord'); C.Valeur.push(JSON.stringify({publie:blocs,brouillon:blocs})); if(C.Modifie_le) C.Modifie_le.push(null);
   const page = await browser.newPage({viewport:{width:900,height:1000}}); log(page);
   await page.route('**/grist-plugin-api.js', r=>r.fulfill({contentType:'text/javascript', body:`window.__DOC__=${JSON.stringify(doc)};window.__OPTS__={};`+fs.readFileSync('mock.js')+fs.readFileSync('fakeapi.js')+fs.readFileSync('mock-saisie.js')}));
   await page.goto('file://' + __C.racine + '/v2/tableau-de-bord/index.html'); await page.waitForTimeout(1500);
   console.log('W CIRCLES:', await page.$$eval('.chart.points circle', x=>x.length), 'HINT:', (await page.$$eval('.chart.points .hint', x=>x.map(e=>e.textContent))).join(' | '));
   await page.evaluate(()=>{ const c=[...document.querySelectorAll('.chart.points circle')].pop(); c.dispatchEvent(new MouseEvent('click',{bubbles:true})); }); await page.waitForTimeout(400);
   console.log('W DRILL:', (await page.textContent('#drill')).replace(/\s+/g,' ').slice(0,200));
   await page.screenshot({path:'pts-2.png'});
   await page.close(); }
 await browser.close();
})();
