const __C = require('./chemins');
const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{
 const browser = await chromium.launch({executablePath: __C.chromium}); const page = await browser.newPage({viewport:{width:1300,height:1400}});
 page.on('pageerror', e=>console.log('PAGEERROR',e.message)); page.on('dialog', d=>d.accept()); page.on('console', m=>{ if(m.type()==='error') console.log('CONSOLE',m.text()); });
 await page.route('**/grist-plugin-api.js', r=>r.fulfill({contentType:'text/javascript', body:`window.__DOC__=${fs.readFileSync('${__C.donnees + '/'}doc_equipe.json')};`+fs.readFileSync('mock.js')+fs.readFileSync('fakeapi.js')+`;grist.onRecords=()=>{};grist.getOption=async()=>null;`}));
 await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(500);
 await page.evaluate(()=>grist.docApi.applyUserActions([["RemoveColumn","Agents","Acces"],["RemoveColumn","Agents","Fonction"],["AddColumn","Agents","Role",{type:"Choice"}],["UpdateRecord","Agents",1,{Role:"Saisie",Fonction:null,Acces:null}],["UpdateRecord","Agents",2,{Role:"Saisie",Fonction:null}],["UpdateRecord","Agents",3,{Role:"Coordination",Fonction:null}],["UpdateRecord","Agents",4,{Role:"Lecture",Fonction:null}]]));
 await page.click('nav button[data-onglet=equipe]'); await page.waitForTimeout(500);
 console.log('EQ BANDEAU:', (await page.textContent('#equipe .bandeau')).replace(/\s+/g,' '));
 await page.click('#eq-completer'); await page.waitForTimeout(500);
 console.log('EQ:', (await page.textContent('.eq-table')).replace(/\s+/g,' '));
 console.log('AGENTS Fonction:', JSON.stringify(await page.evaluate(()=>window.__DOC__.__data.Agents.Fonction)));
 await page.click('.eq-ligne >> text=David'); await page.waitForTimeout(200);
 await page.check('input[name=eq-acces][value="National"]'); await page.selectOption('#eq-fonction','Rédacteur'); await page.click('#eq-enregistrer'); await page.waitForTimeout(400);
 await page.click('nav button[data-onglet=planning]'); await page.waitForTimeout(500);
 console.log('PL0:', (await page.textContent('#planning')).replace(/\s+/g,' ').slice(0,200));
 await page.click('#pl-creer-tables'); await page.waitForTimeout(600);
 await page.click('.pl-outils summary'); await page.click('#pl-appliquer-modeles'); await page.waitForTimeout(500);
 console.log('STATUT:', await page.textContent('#pl-statut'));
 // ouvrir le premier créneau d'aujourd'hui
 await page.click('.pl-col.auj .pl-creneau >> nth=0'); await page.waitForTimeout(300);
 for (const n of ['1','2','3']) { await page.selectOption('#pl-agent', n); await page.waitForTimeout(150); }
 // Bob : périmètre propre Versailles
 await page.check('.pl-aff[data-i="1"] [data-champ=propre]'); await page.waitForTimeout(150);
 await page.click('.pl-aff[data-i="1"] .eq-puce[data-val="Créteil"]'); await page.click('.pl-aff[data-i="1"] .eq-puce[data-val="Versailles"]'); await page.waitForTimeout(150);
 await page.screenshot({path:'pl-1.png', fullPage:true});
 await page.click('#pl-enregistrer'); await page.waitForTimeout(500);
 console.log('STATUT2:', await page.textContent('#pl-statut'));
 console.log('JOUR:', (await page.textContent('#planning .carte')).replace(/\s+/g,' ').slice(0,600));
 await page.click('#pl-suiv'); await page.waitForTimeout(200); await page.click('.pl-outils summary'); await page.click('#pl-copier'); await page.waitForTimeout(500);
 console.log('COPIE:', await page.textContent('#pl-statut'));
 await page.click('[data-suivi="1"]'); await page.waitForTimeout(300);
 console.log('SUIVI:', (await page.textContent('.pl-detail')).replace(/\s+/g,' ').slice(0,400));
 await page.click('#pl-reglages summary'); await page.click('#pl-plus-fonction'); await page.waitForTimeout(100);
 await page.fill('[data-fonction="3"] [data-champ=nom]','Chef de salle'); await page.click('#pl-reg-enregistrer'); await page.waitForTimeout(400);
 console.log('REG:', await page.textContent('#pl-reg-statut'));
 console.log('CHOICES:', await page.evaluate(()=>{const T=window.__DOC__._grist_Tables,C=window.__DOC__._grist_Tables_column; return ['Agents','Affectations'].map(t=>{const r=T.id[T.tableId.indexOf(t)]; const i=C.id.findIndex((_,k)=>C.parentId[k]===r&&C.colId[k]==='Fonction'); return C.widgetOptions[i];}).join(' | ');}));
 await page.click('#pl-prec'); await page.waitForTimeout(200);
 await page.screenshot({path:'pl-2.png', fullPage:true});
 console.log('AFF:', JSON.stringify(await page.evaluate(()=>window.__DOC__.__data.Affectations)));
 fs.writeFileSync(__C.donnees + '/' + 'doc_planning.json', JSON.stringify(await page.evaluate(()=>window.__DOC__)));
 await browser.close();
})();
