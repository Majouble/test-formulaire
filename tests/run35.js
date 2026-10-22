const __C = require('./chemins');
const { chromium } = require('playwright'); const fs=require('fs');
const src = fs.readFileSync('run27.js','utf8'); const mkDoc = eval('('+src.slice(src.indexOf('(sansDep) =>'), src.indexOf('\n};\n')+2)+')');
(async()=>{
 const browser = await chromium.launch({executablePath: __C.chromium});
 const log = p => { p.on('pageerror', e=>console.log('PAGEERROR',e.message)); p.on('console', m=>{ if(m.type()==='error' && !/ERR_FAILED/.test(m.text())) console.log('CONSOLE',m.text().slice(0,200)); }); };
 const doc = mkDoc(false);
 // visa : une question de la partie « vd » ; Auteur
 const T=doc._grist_Tables, C=doc._grist_Tables_column, rRep=T.id[T.tableId.indexOf('Reponses')];
 const addMeta=(cid,type)=>{ const id=Math.max(...C.id)+1; C.id.push(id); C.parentId.push(rRep); C.colId.push(cid); C.type.push(type); C.label.push(cid); C.isFormula.push(false); C.formula.push(''); C.widgetOptions.push(''); if(C.parentPos) C.parentPos.push(id); Object.keys(C).forEach(k=>{ if(C[k].length<C.id.length) C[k].push(null); }); };
 addMeta('Visa_dep','Text'); addMeta('Auteur','Text');
 const F=doc.__data.Formulaires; const pub=JSON.parse(F.Publie[0]); pub.blocs=[{id:'b1',genre:'question',colonne:'Visa_dep',section:'vd'}]; F.Publie[0]=JSON.stringify(pub);
 const page = await browser.newPage({viewport:{width:1250,height:1400}}); log(page);
 await page.route('**/grist-plugin-api.js', r=>r.fulfill({contentType:'text/javascript', body:`window.__DOC__=${JSON.stringify(doc)};`+fs.readFileSync('mock.js')+fs.readFileSync('fakeapi.js')+`;grist.onRecords=()=>{};grist.getOption=async()=>null;`}));
 await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(500);
 const etapes = async () => (await page.$$eval('#liens .li-etape', x=>x.map(e=>e.querySelector('.pastille').textContent+' '+e.querySelector('strong').textContent))).join(' | ');
 await page.click('nav button[data-onglet=liens]'); await page.waitForTimeout(800);
 console.log('E0:', await etapes()); console.log('PUB0:', (await page.textContent('#liens section:last-child')).replace(/\s+/g,' ').slice(0,120));
 await page.click('[data-act=colonnes]'); await page.waitForTimeout(600);
 console.log('E1:', await etapes(), '|', await page.textContent('#li-statut-0'));
 console.log('COLS:', await page.evaluate(()=>{const D=window.__DOC__,T=D._grist_Tables,C=D._grist_Tables_column;const r=T.id[T.tableId.indexOf('Etablissements')];return C.id.map((_,i)=>i).filter(i=>C.parentId[i]===r&&['UUID','Lien'].includes(C.colId[i])).map(i=>C.colId[i]+':'+C.isFormula[i]+':'+C.formula[i]).join(' ; ');}));
 await page.click('[data-act=cles]'); await page.waitForTimeout(600);
 console.log('E2:', await etapes(), '|', await page.textContent('#li-statut-0'));
 await page.click('[data-act=page]'); await page.waitForTimeout(600);
 console.log('E3:', await etapes(), '|', await page.textContent('#li-statut-0'));
 console.log('LIEN F:', await page.evaluate(()=>{const D=window.__DOC__,T=D._grist_Tables,C=D._grist_Tables_column;const r=T.id[T.tableId.indexOf('Etablissements')];const i=C.id.findIndex((_,k)=>C.parentId[k]===r&&C.colId[k]==='Lien');return C.formula[i];}), 'PAGE:', await page.evaluate(()=>JSON.stringify(window.__DOC__._grist_Views)));
 // Grist calcule les liens
 await page.evaluate(()=>{ const E=window.__DOC__.__data.Etablissements; E.Lien=E.UUID.map(u=>'https://grist.example/doc/p/1?Etab_='+u); E.Mail=E.Mail.map((m,i)=>i===3?'':'ce.'+E.UAI[i].toLowerCase()+'@ac.fr'); });
 await page.click('nav button[data-onglet=acces]'); await page.waitForTimeout(300);
 await page.click('nav button[data-onglet=liens]'); await page.waitForTimeout(800);
 console.log('PUB:', (await page.$$eval('#liens p strong', x=>x.map(e=>e.textContent))).join(','));
 await page.evaluate(()=>{ const E=window.__DOC__.__data.Etablissements; E.Nom_circonscription=E.UAI.map((_,i)=>['Versailles 1','Ivry','Lyon 3'][i%3]); E.Type=E.UAI.map((_,i)=>i%2?'Lycée':'Collège'); });
 await page.click('nav button[data-onglet=acces]'); await page.waitForTimeout(300); await page.click('nav button[data-onglet=liens]'); await page.waitForTimeout(800);
 const filtres = async () => (await page.$$eval('#liens .li-crit', x=>x.map(e=>(e.querySelector('.li-crit-nom').textContent||'+')+'['+e.querySelectorAll('.puce-ps').length+(e.querySelector('select[data-crit-liste]')?'+liste':'')+']'))).join(' ');
 console.log('FILTRES:', await filtres());
 console.log('AJOUTABLES:', (await page.$$eval('#li-ajout-filtre option', x=>x.map(o=>o.textContent))).join(', '));
 await page.click('[data-crit=Nom_circonscription][data-val="Ivry"]'); await page.waitForTimeout(200);
 await page.click('[data-crit=Type][data-val="Lycée"]'); await page.waitForTimeout(200);
 console.log('IVRY+LYCEE:', (await page.$$eval('.li-table tbody tr td:first-child', x=>x.map(e=>e.textContent))).join(' | '));
 await page.selectOption('#li-ajout-filtre', 'Commune'); await page.waitForTimeout(400);
 console.log('APRES AJOUT:', await filtres(), '| config:', await page.evaluate(()=>{const C=window.__DOC__.__data.Config;return C.Valeur[C.Cle.indexOf('liens')];}));
 await page.click('[data-retirer-filtre="Libelle_nature"]'); await page.waitForTimeout(400);
 console.log('APRES RETRAIT:', await filtres());
 await page.click('#li-effacer'); await page.waitForTimeout(200);
 await page.screenshot({path:'li-2.png', fullPage:true});
 // révocation
 const avant = await page.evaluate(()=>window.__DOC__.__data.Etablissements.UUID[1]);
 await page.click('[data-revoquer="2"]'); await page.click('#li-oui'); await page.waitForTimeout(500);
 console.log('REVOC:', avant !== await page.evaluate(()=>window.__DOC__.__data.Etablissements.UUID[1]), await page.textContent('#li-statut'));
 // Accès
 await page.click('nav button[data-onglet=acces]'); await page.waitForTimeout(800);
 console.log('ACCES regles:', (await page.$$eval('#acces .ac-table > strong', x=>x.map(e=>e.textContent))).join(' || '));
 await page.click('#ac-appliquer'); await page.waitForTimeout(300); console.log('ST0:', await page.textContent('#ac-statut')); if (await page.$('#ac-formule')) { await page.click('#ac-formule'); await page.waitForTimeout(500); await page.click('#ac-appliquer'); await page.waitForTimeout(300);} await page.click('#ac-oui'); await page.waitForTimeout(800);
 console.log('STATUT:', await page.textContent('#ac-statut'), '| bandeau:', await page.textContent('#acces .bandeau'));
 const acl = await page.evaluate(()=>{ const D=window.__DOC__.__data, Rs=D._grist_ACLResources, Ru=D._grist_ACLRules; return Ru.id.map((_,i)=>{ const r=Rs.id.indexOf(Ru.resource[i]); return `${Rs.tableId[r]}[${Rs.colIds[r]}] ${Ru.userAttributes[i]||Ru.aclFormula[i]} => ${Ru.permissionsText[i]}`; }).join('\n'); });
 console.log(acl);
 await browser.close();
})();
