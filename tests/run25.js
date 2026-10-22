const __C = require('./chemins');
const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{
 const browser = await chromium.launch({executablePath: __C.chromium}); const page = await browser.newPage({viewport:{width:1400,height:950}});
 page.on('pageerror', e=>console.log('PAGEERROR',e.message));
 await page.route('**/grist-plugin-api.js', r=>r.fulfill({contentType:'text/javascript', body:`window.__DOC__=${fs.readFileSync('${__C.donnees + '/'}doc_planning3.json')};`+fs.readFileSync('mock.js')+fs.readFileSync('fakeapi.js')+`;grist.onRecords=()=>{};grist.getOption=async()=>null;`}));
 await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(400);
 await page.evaluate(()=>localStorage.clear());
 await page.click('nav button[data-onglet=onglet-actions]'); await page.waitForTimeout(400);
 await page.click('#ak-creer-table'); await page.waitForTimeout(400);
 const T = async () => (await page.textContent('.ak-tableau')).replace(/\s+/g,' ');
 const creer = async (titre, statut, prio, resp, ech) => {
   await page.click('#ak-nouvelle'); await page.fill('#ak-titre', titre); await page.selectOption('#ak-statut-f', statut); await page.selectOption('#ak-priorite', prio);
   if (resp) await page.selectOption('#ak-responsable', String(resp)); if (ech) await page.fill('#ak-echeance', ech);
   await page.click('#ak-enregistrer'); await page.waitForTimeout(200);
 };
 await creer('B Rappeler le proviseur', 'À faire', 'Haute', 2, '2026-10-16');
 await creer('A Préparer le point de 16 h', 'En cours', 'Moyenne', 3, '2026-10-17');
 await creer('C Informer le cabinet', 'À faire', 'Basse', null, null);
 await creer('D Vérifier la liste', 'À faire', 'Moyenne', 1, null);
 console.log('T1:', await T());
 // tri manuel : D en tête de « À faire »
 await page.dragAndDrop('.ak-carte[data-id="4"]', '.ak-cartes[data-cle="À faire"] .ak-carte[data-id="1"]', { targetPosition: { x: 20, y: 5 } }); await page.waitForTimeout(400);
 console.log('ORDRE À faire:', await page.$$eval('.ak-cartes[data-cle="À faire"] .ak-carte .ak-titre', x=>x.map(e=>e.textContent).join(' | ')));
 // colonne rapide
 await page.click('#ak-col-ajout'); await page.fill('#ak-nc-nom', 'À valider'); await page.click('#ak-nc-ok'); await page.waitForTimeout(300);
 console.log('COLS:', await page.$$eval('.ak-col-titre', x=>x.map(e=>e.textContent.trim()).join(' | ')));
 // déplacer A vers Fait puis archiver
 await page.dragAndDrop('.ak-carte[data-id="2"]', '.ak-cartes[data-cle="Fait"]'); await page.waitForTimeout(400);
 await page.click('[data-archiver="2"]'); await page.waitForTimeout(300);
 console.log('ARCH:', await page.textContent('#ak-archives'), await page.textContent('#ak-statut'));
 // réglages : renommer En cours, supprimer À valider (vide), cartes : date de création
 await page.click('#ak-reglages'); await page.waitForTimeout(200);
 await page.fill('.ak-reg-ligne[data-i="1"] [data-champ=nom]', 'En traitement');
 await page.click('[data-carte="creation"]');
 await page.click('.ak-reg-ligne[data-i="2"] [data-suppr]'); await page.waitForTimeout(100);
 await page.screenshot({path:'ak-reg.png'});
 await page.click('#ak-reg-enregistrer'); await page.waitForTimeout(300);
 console.log('REG:', await page.textContent('#ak-statut'));
 console.log('CHOIX:', await page.evaluate(()=>{const T=window.__DOC__._grist_Tables,C=window.__DOC__._grist_Tables_column; const r=T.id[T.tableId.indexOf('Actions')]; const i=C.id.findIndex((_,k)=>C.parentId[k]===r&&C.colId[k]==='Statut'); return C.widgetOptions[i];}));
 // groupe priorité et glisser
 await page.selectOption('#ak-groupe', 'priorite'); await page.waitForTimeout(200);
 await page.dragAndDrop('.ak-carte[data-id="3"]', '.ak-cartes[data-cle="Haute"]'); await page.waitForTimeout(300);
 console.log('PRIO:', JSON.stringify(await page.evaluate(()=>window.__DOC__.__data.Actions.Priorite)));
 await page.selectOption('#ak-groupe', 'responsable'); await page.waitForTimeout(200);
 console.log('RESP:', await page.$$eval('.ak-col-titre', x=>x.map(e=>e.textContent.trim()).join(' | ')));
 await page.selectOption('#ak-groupe', 'statut'); await page.selectOption('#ak-tri', 'alpha'); await page.waitForTimeout(200);
 await page.click('[data-replier="En traitement"]'); await page.waitForTimeout(200);
 await page.click('[data-deplier="1"]'); await page.waitForTimeout(200);
 await page.screenshot({path:'ak-3.png'});
 console.log('T2:', await T());
 await page.click('#ak-archives'); await page.waitForTimeout(200);
 console.log('ARCHIVES:', await T());
 await page.click('[data-restaurer="2"]'); await page.waitForTimeout(300);
 await page.click('#ak-archives'); await page.click('#ak-filtre-retard'); await page.waitForTimeout(200);
 console.log('RETARD:', await T());
 await browser.close();
})();
