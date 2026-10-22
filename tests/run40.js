const __C = require('./chemins');
const { chromium } = require('playwright'); const fs=require('fs');
const src = fs.readFileSync('run27.js','utf8'); const mkDoc = eval('('+src.slice(src.indexOf('(sansDep) =>'), src.indexOf('\n};\n')+2)+')');
(async()=>{
 const browser = await chromium.launch({executablePath: __C.chromium});
 const doc = mkDoc(false); const C=doc.__data.Config;
 const blocs={name:'Tableau de bord',filters:[],blocks:[{id:'t1',type:'tile',title:'Nombre de lignes',measure:{agg:'distinct',col:'Etablissement'},conds:[]},{id:'t2',type:'tile',title:'Nouveau chiffre clé',measure:{agg:'count'},conds:[]},
   {id:'c1',type:'cross',title:'Répartition par Nature',measure:{agg:'count'},rows:{col:'Qualification',grain:'jour'},cols:{col:'',grain:'jour'},conds:[],view:'both',sort:'value',top:20}]};
 C.id.push(99); C.Cle.push('tableau_de_bord'); C.Valeur.push(JSON.stringify({publie:blocs,brouillon:blocs})); if(C.Modifie_le) C.Modifie_le.push(null);
 const page = await browser.newPage({viewport:{width:1100,height:900}});
 page.on('pageerror', e=>console.log('PAGEERROR',e.message, e.stack.split('\n').slice(0,3).join(' | '))); page.on('console', m=>{ if(m.type()==='error') console.log('CONSOLE',m.text().slice(0,300)); });
 await page.route('**/grist-plugin-api.js', r=>r.fulfill({contentType:'text/javascript', body:`window.__DOC__=${JSON.stringify(doc)};window.__OPTS__={};`+fs.readFileSync('mock.js')+fs.readFileSync('fakeapi.js')+fs.readFileSync('mock-saisie.js')+";(()=>{ const ft=grist.docApi.fetchTable; grist.docApi.fetchTable=async t=>{ await new Promise(r=>setTimeout(r,100)); return ft(t); }; let cb=null; grist.onRecords=f=>{cb=f;}; grist.fetchSelectedTable=async()=>{throw new Error('non');}; grist.ready=o=>{ setTimeout(()=>{ if(cb) cb(window.__lignesRep()); else console.log('ENVOI PERDU'); },5); };\n window.__lignesRep=()=>{const t=window.__DOC__.__data.Reponses;const cols=Object.keys(t).filter(k=>k!=='id');return t.id.map((id,i)=>{const o={id};cols.forEach(c=>o[c]=t[c][i]);return o;});}; })();"}));
 await page.goto('file://' + __C.racine + '/v2/tableau-de-bord/_old.html'); await page.waitForTimeout(1500);
 console.log('SOURCE:', await page.textContent('#source'), '| tuiles:', await page.$$eval('.tile', x=>x.length));
 await browser.close();
})();
