const __C = require('./chemins');
const { chromium } = require('playwright'); const fs=require('fs');
const src = fs.readFileSync('run27.js','utf8'); const mkDoc = eval('('+src.slice(src.indexOf('(sansDep) =>'), src.indexOf('\n};\n')+2)+')');
(async()=>{
 const browser = await chromium.launch({executablePath: __C.chromium});
 const page = await browser.newPage({viewport:{width:1300,height:1300}});
 page.on('pageerror', e=>console.log('PAGEERROR',e.message)); page.on('console', m=>{ if(m.type()==='error'&&!/ERR_FAILED/.test(m.text())) console.log('CONSOLE',m.text().slice(0,200)); }); page.on('dialog', d=>d.accept());
 const doc = mkDoc(false);
 await page.route('**/grist-plugin-api.js', r=>r.fulfill({contentType:'text/javascript', body:`window.__DOC__=${JSON.stringify(doc)};`+fs.readFileSync('mock.js')+fs.readFileSync('fakeapi.js')+`;grist.onRecords=()=>{};grist.getOption=async()=>null;`}));
 await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(400);
 await page.click('nav button[data-onglet=onglet-equipe]'); await page.waitForTimeout(700);
 console.log('BANDEAU:', await page.$eval('#equipe .bandeau', e=>e.textContent.replace(/\s+/g,' ')).catch(()=>'aucun'));
 if (await page.$('#eq-completer')) { await page.click('#eq-completer'); await page.waitForTimeout(800); }
 console.log('COLS Agents:', await page.evaluate(()=>{const D=window.__DOC__,T=D._grist_Tables,C=D._grist_Tables_column;const r=T.id[T.tableId.indexOf('Agents')];return C.id.map((_,i)=>i).filter(i=>C.parentId[i]===r).map(i=>C.colId[i]+(C.isFormula[i]?'(f)':'')).join(' ');}));
 // invité : Bob (a une page de saisie)
 await page.click('.eq-ligne:has-text("Bob")'); await page.waitForTimeout(300);
 await page.check('#eq-invite'); await page.waitForTimeout(200);
 await page.click('#eq-enregistrer'); await page.waitForTimeout(800);
 console.log('FICHE:', await page.textContent('#eq-fiche-statut'));
 console.log('AGENT Bob:', await page.evaluate(()=>{const A=window.__DOC__.__data.Agents;const i=A.Nom.indexOf('Bob');return JSON.stringify({cle:A.Cle_acces[i],page:A.Page_saisie[i]});}));
 console.log('LISTE:', (await page.textContent('.eq-ligne:has-text("Bob")')).replace(/\s+/g,' '));
 console.log('AUTEUR emargement:', await page.evaluate(()=>{const D=window.__DOC__,T=D._grist_Tables,C=D._grist_Tables_column;const r=T.id[T.tableId.indexOf('Emargements')];const i=C.id.findIndex((_,k)=>C.parentId[k]===r&&C.colId[k]==='Auteur');return i<0?'pas de table':C.formula[i].slice(0,80);}));
 await page.screenshot({path:'inv-1.png'});
 // Accès
 await page.click('nav button[data-onglet=acces]'); await page.waitForTimeout(800);
 if (await page.$('#ac-formule')) { await page.click('#ac-formule'); await page.waitForTimeout(600); }
 await page.click('#ac-appliquer'); await page.waitForTimeout(200); await page.click('#ac-oui'); await page.waitForTimeout(800);
 console.log('STATUT:', await page.textContent('#ac-statut'), '|', await page.textContent('#acces .bandeau'));
 console.log(await page.evaluate(()=>{ const D=window.__DOC__.__data, Rs=D._grist_ACLResources, Ru=D._grist_ACLRules; return Ru.id.map((_,i)=>{ const r=Rs.id.indexOf(Ru.resource[i]); return `${Rs.tableId[r]}[${Rs.colIds[r]}] ${Ru.userAttributes[i]||Ru.aclFormula[i]} => ${Ru.permissionsText[i]}`; }).filter(l=>/Agents|^\*|Reponses\[\*\]|Emarg/.test(l)).join('\n'); }));
 console.log('QUI Bob:', (await page.textContent('#acces tr:has-text("Bob")')).replace(/\s+/g,' '));
 await browser.close();
})();
