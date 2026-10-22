const __C = require('./chemins');
const { chromium } = require('playwright'); const fs=require('fs');
const src = fs.readFileSync('run27.js','utf8'); const mkDoc = eval('('+src.slice(src.indexOf('(sansDep) =>'), src.indexOf('\n};\n')+2)+')');
(async()=>{
 const browser = await chromium.launch({executablePath: __C.chromium});
 const doc = mkDoc(false);
 // vue d'un établissement ouvert par son lien (règles simulées) : sa seule ligne, sans clé ni lien ; ses seuls signalements
 const E=doc.__data.Etablissements, keep=1; Object.keys(E).forEach(k=>{ E[k]=[E[k][keep]]; });
 const R=doc.__data.Reponses, idx=R.Etablissement.map((e,i)=>e===2?i:-1).filter(i=>i>=0); Object.keys(R).forEach(k=>{ R[k]=idx.map(i=>R[k][i]); });
 const bloquees=['Agents','Creneaux','Affectations','Emargements','Actions'];
 const page = await browser.newPage({viewport:{width:1000,height:1100}});
 page.on('pageerror', e=>console.log('PAGEERROR',e.message)); page.on('console', m=>{ if(m.type()==='error') console.log('CONSOLE',m.text().slice(0,200)); });
 await page.route('**/grist-plugin-api.js', r=>r.fulfill({contentType:'text/javascript', body:`window.__DOC__=${JSON.stringify(doc)};window.__OPTS__={formulaire:'Signalements',etablissements:'Etablissements'};`+fs.readFileSync('mock.js')+fs.readFileSync('fakeapi.js')+fs.readFileSync('mock-saisie.js')
   +`;(()=>{const f=grist.docApi.fetchTable;grist.docApi.fetchTable=async t=>{ if(${JSON.stringify(bloquees)}.includes(t)) throw new Error('Blocked by table read access rules'); return f(t); };})();`}));
 await page.goto('file://' + __C.racine + '/v2/saisie/index.html'); await page.waitForTimeout(2500);
 console.log('TITRE LISTE:', await page.textContent('#titre-liste').catch(()=>'?'), '| sous-titre:', await page.textContent('#sous-titre').catch(()=>'?'));
 console.log('ALERTE:', await page.$eval('#alerte', e=>e.hidden?'(masquée)':e.textContent));
 console.log('BTN CONFIG hidden:', await page.$eval('#btn-config', e=>e.hidden), '| bandeau-perimetre hidden:', await page.$eval('#bandeau-perimetre', e=>e.hidden).catch(()=>'?'));
 console.log('TEXTE:', (await page.textContent('body')).replace(/\s+/g,' ').slice(0,400));
 await page.screenshot({path:'etab-1.png'});
 await browser.close();
})();
