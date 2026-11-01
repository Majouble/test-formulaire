// 2.42 : effectifs des établissements (onglet Référentiel, carte « Effectifs ») — jeux de la DEPP par UAI (noms de champs
// différents d'un jeu à l'autre, jeu « voie professionnelle » repris du second candidat), somme pour un lycée polyvalent,
// dernière rentrée, filtre des académies couvertes ; SIES par identifiant Paysage ; colonne Effectif recopiée dans les réponses
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docValidation } = require('./run108');

const JEUX = {
  'fr-en-ecoles-effectifs-nb_classes': { fields: [['rentree_scolaire', 'text'], ['academie', 'text'], ['numero_ecole', 'text'], ['denomination_principale', 'text'], ['nombre_total_classes', 'int'], ['nombre_total_eleves', 'int'], ['nombre_eleves_cp', 'int']],
    rows: [['2025', 'Créteil', '0944444D', 'ECOLE JULES FERRY', 9, 210, 40], ['2024', 'Créteil', '0944444D', 'ECOLE JULES FERRY', 9, 205, 38], ['2025', 'Lyon', '0699999Z', 'ECOLE LYON', 5, 120, 20]] },
  'fr-en-college-effectifs-niveau-sexe-lv': { fields: [['rentree_scolaire', 'int'], ['academie', 'text'], ['numero_college', 'text'], ['nombre_eleves_total', 'int'], ['nombre_eleves_6eme', 'int'], ['patronyme', 'text']],
    rows: [[2025, 'Versailles', '0781111A', 600, 150, 'CAMUS'], [2024, 'Versailles', '0781111A', 580, 140, 'CAMUS'], [2025, 'Versailles', '0913333C', 420, 100, 'ELUARD'], [2025, 'Versailles', '0785555E', 300, 80, 'ABSENT DU REFERENTIEL']] },
  'fr-en-lycee_gt-effectifs-niveau-sexe-lv': { fields: [['rentree_scolaire', 'int'], ['academie', 'text'], ['numero_lycee', 'text'], ['nombre_d_eleves', 'int'], ['2ndes_gt', 'int']],
    rows: [[2025, 'Versailles', '0782222B', 1200, 400], [2024, 'Versailles', '0782222B', 1180, 390]] },
  'fr-en-lycee_pro-effectifs-niveau-sexe-lv': { fields: [['rentree_scolaire', 'int'], ['academie', 'text'], ['numero_lycee', 'text'], ['nombre_d_eleves', 'int']],
    rows: [[2025, 'Versailles', '0782222B', 150]] },
  'fr-esr-statistiques-sur-les-effectifs-d-etudiants-inscrits-par-etablissement-hcp': { fields: [['annee_universitaire', 'text'], ['etablissement_id_paysage', 'text'], ['etablissement_lib', 'text'], ['effectif', 'int'], ['effectif_sans_cpge', 'int']],
    rows: [['2024-25', 'qJ7Ae', 'Université Paris-Saclay', 48000, 47000], ['2023-24', 'qJ7Ae', 'Université Paris-Saclay', 47000, 46000], ['2024-25', 'u3Xb9', 'INSA Lyon', 6000, 6000]] },
};
const FETCH = `window.__FETCHLOG__=[];const JEUX=${JSON.stringify(JEUX)};
window.fetch=async(url)=>{ const u=new URL(url); window.__FETCHLOG__.push(decodeURIComponent(u.pathname.split('/datasets/')[1]+'?'+u.search.slice(1)));
 const ok=b=>({ok:true,status:200,json:async()=>b}), ko=()=>({ok:false,status:404,json:async()=>({message:'Unknown dataset'})});
 const [id,suite]=u.pathname.split('/catalog/datasets/')[1].split('/'), j=JEUX[id]; if(!j) return ko();
 const obj=r=>Object.fromEntries(j.fields.map(([n],k)=>[n,r[k]]));
 if(!suite) return ok({dataset_id:id,fields:j.fields.map(([name,type])=>({name,label:name.replace(/_/g,' '),type}))});
 let rows=j.rows.map(obj); const w=u.searchParams.get('where');
 if(w) rows=rows.filter(r=>w.split(' AND ').every(p=>[...p.matchAll(/(\\w+)=("([^"]*)"|[\\d.]+)/g)].some(m=>String(r[m[1]])===(m[3]!==undefined?m[3]:m[2]))));
 if(suite==='records'){ const g=u.searchParams.get('group_by'); const m={}; rows.forEach(r=>m[r[g]]=(m[r[g]]||0)+1); return ok({results:Object.entries(m).map(([k,n])=>({[g]:isNaN(k)?k:Number(k),n}))}); }
 if(suite==='exports'){ const sel=u.searchParams.get('select').split(','); return ok(rows.map(r=>Object.fromEntries(sel.map(c=>[c,r[c]])))); }
 return ko(); };`;

function docESR() {
  const doc = docValidation(), C = doc._grist_Tables_column, T = doc._grist_Tables, D = doc.__data;
  const g = JSON.parse(D.Config.Valeur[0]); g.preset = 'esr'; D.Config.Valeur[0] = JSON.stringify(g);
  const ref = T.id[T.tableId.indexOf('Etablissements')];
  C.id.push(Math.max(...C.id) + 1); C.parentId.push(ref); C.colId.push('Identifiant_Paysage'); C.type.push('Text'); C.label.push('Identifiant Paysage'); C.isFormula.push(false); C.formula.push(''); C.widgetOptions.push(''); C.visibleCol.push(0); C.parentPos.push(20);
  D.Etablissements.Nom = ['Université Paris-Saclay', 'INSA Lyon', 'École sans Paysage', 'IUT d\'Orsay'];
  D.Etablissements.Identifiant_Paysage = ['qJ7Ae', 'u3Xb9', '', ''];
  return doc;
}
async function ouvrir(browser, doc) {
  const page = await browser.newPage({ viewport: { width: 1300, height: 1800 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => d.accept());
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js') + FETCH + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(1200);
  await page.click('nav button[data-onglet=referentiel]'); await page.waitForTimeout(1500);
  return page;
}
const texte = async (page, sel) => (await page.$eval(sel, e => e.innerText)).replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });
  // 1. scolaire
  const page = await ouvrir(browser, docValidation());
  console.log('CARTE :', (await texte(page, '#ref-effectifs')).split('\n').slice(0, 4).join(' | '));
  await page.click('[data-ef-act=chercher][data-ch=EN]'); await page.waitForTimeout(1500);
  console.log('JEUX :', await page.$$eval('#ref-effectifs .ef-table tbody tr', l => l.map(tr => [...tr.cells].map((c, k) => { const s = c.querySelector('select'); return k > 1 && s ? s.value : c.innerText.trim(); }).join(' / ')).join('\n      ')));
  await page.click('[data-ef-act=comparer][data-ch=EN]'); await page.waitForTimeout(1500);
  console.log('BILAN :', (await texte(page, '#ref-effectifs')).split('BILAN AVANT ÉCRITURE')[1].replace(/\n/g, ' | ').slice(0, 700));
  console.log('REQUÊTES :', (await page.evaluate(() => window.__FETCHLOG__.filter(x => x.includes('exports')))).map(x => x.replace(/select=[^&]*&/, '')).join('\n          '));
  await page.click('[data-ef-act=ecrire][data-ch=EN]'); await page.waitForTimeout(1500);
  console.log('ÉCRIT :', await page.textContent('#ef-statut-EN'), '|', await page.evaluate(() => { const E = window.__DOC__.__data.Etablissements; return E.Nom.map((n, i) => `${n} = ${E.Effectif[i] ?? '—'} (${E.Effectif_rentree[i] ?? ''})`).join(' ; '); }));
  console.log('CONFIG effectifs :', await page.evaluate(() => { const C = window.__DOC__.__data.Config; return C.Valeur[C.Cle.indexOf('effectifs')].replace(/\s+/g, ' ').slice(0, 300); }));
  await page.click('[data-ef-act=reponses][data-ch=EN]'); await page.waitForTimeout(1200);
  console.log('RÉPONSES :', await page.textContent('#ef-statut-EN'), '|', await page.evaluate(() => { const C = window.__DOC__._grist_Tables_column, k = C.colId.lastIndexOf('Effectif'); return `${C.type[k]} formule ${C.formula[k]}`; }));
  // seconde lecture : réglages repris, rien à écrire
  await page.click('[data-ef-act=chercher][data-ch=EN]'); await page.waitForTimeout(1200); await page.click('[data-ef-act=comparer][data-ch=EN]'); await page.waitForTimeout(1200);
  console.log('SECOND PASSAGE :', (await page.textContent('[data-ef-act=ecrire][data-ch=EN]')).trim());
  await page.screenshot({ path: __C.sorties + '/effectifs-109.png', fullPage: true });
  await page.close();
  // 2. supérieur
  const p2 = await ouvrir(browser, docESR());
  await p2.click('[data-ef-act=chercher][data-ch=ESR]'); await p2.waitForTimeout(1200);
  console.log('ESR, JEUX :', await p2.$$eval('#ref-effectifs .ef-table tbody tr', l => l.map(tr => [...tr.cells].map((c, k) => { const s = c.querySelector('select'); return k > 1 && s ? s.value : c.innerText.trim(); }).join(' / ')).join(' | ')));
  await p2.click('[data-ef-act=comparer][data-ch=ESR]'); await p2.waitForTimeout(1200);
  await p2.click('[data-ef-act=ecrire][data-ch=ESR]'); await p2.waitForTimeout(1200);
  console.log('ESR, ÉCRIT :', await p2.evaluate(() => { const E = window.__DOC__.__data.Etablissements; return E.Nom.map((n, i) => `${n} = ${E.Effectif[i] ?? '—'} (${E.Effectif_rentree[i] ?? ''})`).join(' ; '); }));
  await browser.close();
})();
