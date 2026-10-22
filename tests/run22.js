const __C = require('./chemins');
const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{
 const browser = await chromium.launch({executablePath: __C.chromium}); const page = await browser.newPage({viewport:{width:1300,height:1500}});
 page.on('pageerror', e=>console.log('PAGEERROR',e.message)); page.on('dialog', d=>{console.log('DIALOG',d.message().replace(/\n/g,' ')); d.accept();});
 await page.route('**/grist-plugin-api.js', r=>r.fulfill({contentType:'text/javascript', body:`window.__DOC__=${fs.readFileSync('${__C.donnees + '/'}doc_planning3.json')};`+fs.readFileSync('mock.js')+fs.readFileSync('fakeapi.js')+`;grist.onRecords=()=>{};grist.getOption=async()=>null;`}));
 await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(500);
 await page.click('nav button[data-onglet=acces]'); await page.waitForTimeout(600);
 console.log('A1:', (await page.textContent('#acces')).replace(/\s+/g,' ').slice(0,400));
 await page.click('#ac-appliquer'); await page.waitForTimeout(200); console.log('BLOQUE:', await page.textContent('#ac-statut'));
 await page.click('#ac-formule'); await page.waitForTimeout(500);
 // simule le calcul de la formule
 await page.evaluate(()=>grist.docApi.applyUserActions([["UpdateRecord","Agents",1,{Champs_acces:["L","EN","ESR"]}],["UpdateRecord","Agents",2,{Champs_acces:["L","ESR"]}],["UpdateRecord","Agents",3,{Champs_acces:["L","EN","ESR"]}],["UpdateRecord","Agents",4,{Champs_acces:["L"]}]]));
 await page.click('nav button[data-onglet=equipe]'); await page.waitForTimeout(300);
 await page.click('nav button[data-onglet=acces]'); await page.waitForTimeout(600);
 console.log('A2:', (await page.textContent('#acces')).replace(/\s+/g,' ').slice(0,2500));
 await page.screenshot({path:'ac-1.png', fullPage:true});
 await page.click('#ac-appliquer'); await page.waitForTimeout(200); await page.click('#ac-oui'); await page.waitForTimeout(600);
 console.log('STATUT:', await page.textContent('#ac-statut'));
 console.log('BANDEAU:', (await page.textContent('#acces .bandeau')).replace(/\s+/g,' '));
 const acl = await page.evaluate(()=>({res:window.__DOC__.__data._grist_ACLResources, rules:window.__DOC__.__data._grist_ACLRules}));
 console.log('RES:', JSON.stringify(acl.res));
 acl.rules.id.forEach((id,i)=>console.log('  R', id, acl.rules.resource[i], acl.rules.rulePos[i], '|', acl.rules.aclFormula[i], '|', acl.rules.permissionsText[i], '|', acl.rules.userAttributes[i]));
 // réappliquer = idempotent
 await page.click('#ac-appliquer'); await page.waitForTimeout(200); await page.click('#ac-oui'); await page.waitForTimeout(600);
 const n2 = await page.evaluate(()=>window.__DOC__.__data._grist_ACLRules.id.length); console.log('NB REGLES apres reapplication:', n2);
 await page.screenshot({path:'ac-2.png', fullPage:true});
 await page.click('#ac-retirer'); await page.waitForTimeout(200); await page.click('#ac-oui'); await page.waitForTimeout(500);
 console.log('APRES RETRAIT:', await page.evaluate(()=>window.__DOC__.__data._grist_ACLRules.id.length), await page.textContent('#ac-statut'));
 await browser.close();
})();
