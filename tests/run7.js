const __C = require('./chemins');
const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{
 const doc = JSON.parse(fs.readFileSync(__C.donnees + '/' + 'doc_saisie.json'));
 // deux dossiers : établissement 1 (Versailles), établissement 2 (Créteil)
 const R = doc.__data.Reponses; const add = f => { const id = R.id.length + 1; R.id.push(id); for (const k of Object.keys(R)) if (k!=='id') R[k].push(f[k] ?? null); for (const [k,v] of Object.entries(f)) if (!(k in R)) { R[k] = R.id.map(()=>null); R[k][id-1]=v; } };
 const now = Date.now()/1000, jour = Math.floor(now/86400)*86400;
 add({Etablissement:1, Date_faits:jour, Cree_le:now-3600, Nature:"Nouveau signalement", Qualification:"RAS", Description:"Calme à Versailles"});
 add({Etablissement:2, Date_faits:jour, Cree_le:now-3000, Nature:"Nouveau signalement", Qualification:"RAS", Description:"Calme à Ivry"});
 const browser = await chromium.launch({executablePath: __C.chromium}); const page = await browser.newPage({viewport:{width:1100,height:900}});
 page.on('pageerror', e=>console.log('PAGEERROR',e.message)); page.on('dialog', d=>{ console.log('DIALOG:', d.message().slice(0,300)); d.accept(); });
 page.on('console', m=>{ if(m.type()==='error') console.log('console:',m.text().slice(0,200))});
 const opts = { formulaire: 'Signalements', libelle: 'Alice', perimetre: { Academie: ['Versailles'] } };
 await page.route('**/grist-plugin-api.js', r=>r.fulfill({contentType:'text/javascript', body:`window.__DOC__=${JSON.stringify(doc)};window.__OPTS__=${JSON.stringify(opts)};`+fs.readFileSync('mock.js')+fs.readFileSync('fakeapi.js')+fs.readFileSync('mock-saisie.js')}));
 await page.goto('file://' + __C.racine + '/v2/saisie/index.html'); await page.waitForTimeout(1500);
 console.log('BANDEAU:', await page.textContent('#bandeau-perimetre').catch(()=>'?'), '| hidden', await page.$eval('#bandeau-perimetre', e=>e.hidden));
 console.log('ALERTE:', (await page.textContent('#alerte')).slice(0,300));
 await page.screenshot({path:'saisie-1.png'});
 console.log('TEXTE:', (await page.textContent('main')).replace(/\s+/g,' ').slice(0,600));
 fs.writeFileSync(__C.donnees + '/' + 'doc_saisie2.json', JSON.stringify(doc));
 await browser.close();
})();
