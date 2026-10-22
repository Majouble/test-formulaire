const __C = require('./chemins');
const { chromium } = require('playwright'); const fs=require('fs');
const src = fs.readFileSync('run27.js','utf8'); const mkDoc = eval('('+src.slice(src.indexOf('(sansDep) =>'), src.indexOf('\n};\n')+2)+')');
// évaluation simple des formules $Ref.Col dans le faux Grist
const FORMULES = `window.__calc=()=>{const D=window.__DOC__,T=D._grist_Tables,C=D._grist_Tables_column;C.id.forEach((_,i)=>{const m=C.isFormula[i]&&/^\\$(\\w+)\\.(\\w+)$/.exec(C.formula[i]||'');if(!m)return;const tid=T.tableId[T.id.indexOf(C.parentId[i])],t=D.__data[tid];const rc=C.id.findIndex((_,k)=>C.parentId[k]===C.parentId[i]&&C.colId[k]===m[1]);const cible=(/^Ref:(.+)$/.exec(C.type[rc])||[])[1];const tc=D.__data[cible];t[C.colId[i]]=t.id.map((_,j)=>{const k=tc.id.indexOf(t[m[1]][j]);return k<0?null:(tc[m[2]]||[])[k]??null;});});};`;
(async()=>{
 const browser = await chromium.launch({executablePath: __C.chromium});
 const log = p => { p.on('pageerror', e=>console.log('PAGEERROR',e.message)); p.on('console', m=>{ if(m.type()==='error' && !/ERR_FAILED/.test(m.text())) console.log('CONSOLE',m.text().slice(0,200)); }); };
 const doc = mkDoc(false);
 // 1. Plan : document neuf et document existant
 { const page = await browser.newPage(); log(page);
   await page.route('**/grist-plugin-api.js', r=>r.fulfill({contentType:'text/javascript', body:`window.__DOC__=${JSON.stringify(doc)};`+fs.readFileSync('mock.js')+fs.readFileSync('fakeapi.js')+`;grist.onRecords=()=>{};grist.getOption=async()=>null;`+FORMULES}));
   await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(500);
   console.log('NEUF:', await page.evaluate(()=>{ const p=Socle.planInstallation({}, null); const i=p.etapes.findIndex(e=>e.id==='rep-etablissement'); return i+' / table-reponses '+p.etapes.findIndex(e=>e.id==='table-reponses')+' : '+(i>=0?p.etapes[i].detail:''); }));
   console.log('EXISTANT:', await page.evaluate(async()=>{ const p=Socle.planInstallation(await Socle.lireMeta(), await Socle.lireConfig()); const e=p.etapes.find(e=>e.id==='rep-etablissement'); return e?e.titre:'aucune'; }));
   // 2. Bandeau du tableau de bord
   await page.click('nav button[data-onglet=onglet-tdb]'); await page.waitForTimeout(800);
   console.log('BANDEAU:', (await page.textContent('#tdb-etab')).replace(/\s+/g,' ').trim(), '| hidden', await page.$eval('#tdb-etab', e=>e.hidden));
   await page.click('#tdb-etab-ajouter'); await page.waitForTimeout(500);
   console.log('APRES:', await page.$eval('#tdb-etab', e=>e.hidden), await page.evaluate(async()=>{ const m=await Socle.lireMeta(); return Object.values(m.Reponses.colonnes).filter(c=>c.isFormula&&/^\$Etablissement\./.test(c.formula)).map(c=>c.colId+'='+c.formula).join(', '); }));
   console.log('PLAN APRES:', await page.evaluate(async()=>{ const p=Socle.planInstallation(await Socle.lireMeta(), await Socle.lireConfig()); return p.etapes.some(e=>e.id==='rep-etablissement'); }));
   // 3. Carte des établissements, lignes par UAI, coordonnées de la table elle-même
   await page.evaluate(()=>{ window.__calc(); delete window.__DOC__.__data.Etablissements.Latitude; }); // le référentiel ne sert plus : coordonnées des formules
   await page.click('#tdb-recharger'); await page.waitForTimeout(600);
   await page.click('#addCross'); await page.waitForTimeout(300);
   const last = await page.$$eval('select[data-k=chart]', x=>x.length-1);
   await page.selectOption(`select[data-k=chart] >> nth=${last}`, 'points'); await page.waitForTimeout(800);
   console.log('ROWS:', await page.inputValue(`select[data-k="rows.col"] >> nth=${last}`), 'EDITOR:', (await page.$$eval('select[data-k^="pts."]', x=>x.map(s=>s.dataset.k+'='+s.value+(s.dataset.k==='pts.table'?'('+s.selectedOptions[0].text+')':'')))).join(' '));
   console.log('PTS:', await page.$$eval('.chart.points circle', x=>x.length), (await page.$$eval('.chart.points .hint', x=>x.map(e=>e.textContent))).join(' | '));
   await page.selectOption(`select[data-k="rows.col"] >> nth=${last}`, 'Departement'); await page.selectOption(`select[data-k="rows.grain"] >> nth=${last}`, 'dep_norm'); await page.selectOption(`select[data-k=chart] >> nth=${last}`, 'map'); await page.waitForTimeout(500);
   console.log('CHORO:', await page.$$eval('.chart.map text.val', x=>x.filter(t=>t.textContent!=='0').map(t=>t.textContent).join(',')), (await page.$$eval('.chart.map .hint', x=>x.map(e=>e.textContent))).join(' | '));
   fs.writeFileSync(__C.sorties + '/doc_etab.json', JSON.stringify(await page.evaluate(()=>window.__DOC__)));
   await page.close(); }
 // 4. Cartographie : pas de doublon Etab_
 { const d2 = JSON.parse(fs.readFileSync(__C.sorties + '/doc_etab.json'));
   const page = await browser.newPage({viewport:{width:1100,height:900}}); log(page);
   await page.route('**/leaflet.min.js', r=>r.abort()); await page.route('**/leaflet.min.css', r=>r.abort());
   await page.route('**/grist-plugin-api.js', r=>r.fulfill({contentType:'text/javascript', body:`window.__DOC__=${JSON.stringify(d2)};window.__OPTS__={};`+fs.readFileSync('mock.js')+fs.readFileSync('fakeapi.js')+fs.readFileSync('mock-saisie.js')}));
   await page.goto('file://' + __C.racine + '/v2/cartographie/index.html'); await page.waitForTimeout(2500);
   console.log('CARTO SOURCE:', await page.textContent('#source'), '| STATS:', (await page.textContent('#stats')).replace(/\s+/g,' '));
   await page.selectOption('#format','csv'); await page.click('#copy'); await page.waitForTimeout(300);
   console.log('CSV:', (await page.inputValue('#output')).split('\n').slice(0,2).join('\n'));
   await page.close(); }
 await browser.close();
})();
