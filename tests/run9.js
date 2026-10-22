const __C = require('./chemins');
const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{
 const doc = JSON.parse(fs.readFileSync(__C.donnees + '/' + 'doc_saisie2.json'));
 const browser = await chromium.launch({executablePath: __C.chromium}); const page = await browser.newPage({viewport:{width:1100,height:1000}});
 page.on('pageerror', e=>console.log('PAGEERROR',e.message)); page.on('dialog', d=>{ console.log('DIALOG:', d.message().replace(/\n/g,' ').slice(0,300)); d.accept(); });
 const opts = { formulaire: 'Signalements', libelle: 'Alice', perimetre: { Academie: ['Versailles'] } };
 await page.route('**/grist-plugin-api.js', r=>r.fulfill({contentType:'text/javascript', body:`window.__DOC__=${JSON.stringify(doc)};window.__OPTS__=${JSON.stringify(opts)};`+fs.readFileSync('mock.js')+fs.readFileSync('fakeapi.js')+fs.readFileSync('mock-saisie.js')}));
 await page.goto('file://' + __C.racine + '/v2/saisie/index.html'); await page.waitForTimeout(1500);
 await page.click('#btn-voir-tout'); await page.waitForTimeout(300);
 console.log('VOIR TOUT:', await page.textContent('#nb-liste'));
 await page.click('#btn-voir-tout'); await page.waitForTimeout(300);
 // recherche d'établissement hors périmètre
 await page.click('.porte-nouveau'); await page.waitForTimeout(400);
 await page.fill('#nom', 'Lycée'); await page.waitForTimeout(600);
 console.log('RECHERCHE lycée:', (await page.textContent('#liste').catch(()=>'?')).replace(/\s+/g,' ').slice(0,200));
 await page.fill('#nom', 'Coll'); await page.waitForTimeout(600);
 console.log('RECHERCHE coll:', (await page.textContent('#liste').catch(()=>'?')).replace(/\s+/g,' ').slice(0,200));
 // Mise à jour concurrente
 await page.goto('file://' + __C.racine + '/v2/saisie/index.html'); await page.waitForTimeout(1500);
 await page.click('#cartes-signalements li >> nth=0'); await page.waitForTimeout(800);
 await page.screenshot({path:'saisie-2.png'});
 await page.fill('#description', 'Calme à Versailles. Rassemblement devant la grille (Alice).'); await page.waitForTimeout(200);
 // un collègue enregistre une version entre-temps
 await page.evaluate(()=>grist.docApi.applyUserActions([["AddRecord","Reponses",null,{Etablissement:1,Dossier:1,Date_faits:window.__DOC__.__data.Reponses.Date_faits[0],Cree_le:Date.now()/1000,Nature:"Mise à jour",Qualification:"Blocage",Description:"Grille bloquée (Bob)"}]]));
 await page.waitForTimeout(600);
 const btn = await page.$('#btn-signalement'); console.log('BTN:', await btn.textContent());
 await btn.click(); await page.waitForTimeout(800);
 console.log('STATUT:', await page.textContent('#statut-signalement'));
 const R = await page.evaluate(()=>window.__DOC__.__data.Reponses);
 console.log('LIGNES:', R.id.map((id,i)=>`${id}:${R.Qualification[i]}|${R.Description[i]}|${R.Nature[i]}|d${R.Dossier[i]}`).join('  ##  '));
 await browser.close();
})();
