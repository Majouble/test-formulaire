// 2.62 : Fiche établissement, lien de partenaire en affichage seul (case Lecture_seule de sa ligne) : ni réglages, ni
// enregistrement de modèle ou de modèle par défaut, filtres appliqués sans écriture ; modèles proposés toujours applicables ;
// le propriétaire voit « (affichage seul) » dans le choix de la fiche réglée.
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docFiche, CONFIG } = require('./run127');

const MODELE = { ...CONFIG, filtresRapides: ['Type'] };
const F = t => ({ rapides: { 'col:Type': [t] }, avances: [], combinaison: 'cascade', formule: '' });
const COMMUNS = [{ nom: 'Collèges', filtres: F('Collège') }];
const DOCUMENT = [{ nom: 'Lycées', filtres: F('Lycée') }];
function doc(partenaire) {
  const d = docFiche(), T = d._grist_Tables, C = d._grist_Tables_column, ref = T.id.length + 1;
  T.id.push(ref); T.tableId.push('Partenaires');
  [['Nom', 'Text'], ['Cle', 'Text'], ['Lien', 'Text'], ['Actif', 'Bool'], ['Fiche', 'Text'], ['Lecture_seule', 'Bool']].forEach(([c, t], k) => {
    C.id.push(C.id.length + 1); C.parentId.push(ref); C.colId.push(c); C.type.push(t); C.label.push(c);
    C.isFormula.push(c === 'Lien'); C.formula.push(''); C.widgetOptions.push(''); C.visibleCol.push(0); C.parentPos.push(k + 1);
  });
  const lignes = [[1, 'Préfecture des Yvelines', 'cle-a', '', true, ''], [2, 'Rectorat de Versailles', 'cle-b', '', true, JSON.stringify({ filtres: F('Collège') })]].filter(l => !partenaire || l[0] === 2);
  d.__data.Partenaires = { id: lignes.map(l => l[0]), Nom: lignes.map(l => l[1]), Cle: lignes.map(l => l[2]), Lien: lignes.map(l => l[3]), Actif: lignes.map(l => l[4]), Fiche: lignes.map(l => l[5]), Lecture_seule: lignes.map(l => l[0] === 2) };
  return d;
}
async function ouvrir(browser, partenaire) {
  const p = await browser.newPage({ viewport: { width: 1000, height: 1100 } });
  p.on('pageerror', e => console.log('PAGEERROR', e.message)); p.on('dialog', x => x.accept());
  const d = doc(partenaire), T = d._grist_Tables, C = d._grist_Tables_column, copie = {};
  T.tableId.forEach((t, k) => { copie[t] = C.id.map((_, i) => i).filter(i => C.parentId[i] === T.id[k]).map(i => ({ colId: C.colId[i], label: C.label[i], type: C.type[i], visibleCol: '' })); });
  // Config : lignes « schema_partenaires » et « fiche » (seules lisibles par le partenaire)
  const config = { id: [1, 2], Cle: ['schema_partenaires', 'fiche'], Valeur: [JSON.stringify({ tables: copie }), JSON.stringify({ modeles: DOCUMENT })] };
  const refus = `const __f=grist.docApi.fetchTable.bind(grist.docApi);grist.docApi.fetchTable=async n=>{if(n==='Config')return ${JSON.stringify(config)};`
    + (partenaire ? `if(['Points_situation','Bati','_grist_ACLRules','_grist_Tables','_grist_Tables_column'].includes(n))throw new Error('Blocked by table read access rules');` : '') + `return __f(n);};`;
  await p.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(d)};` + fs.readFileSync('mock.js') + `;${refus}`
    + `window.__OPTS=null;window.__ECRITURES=[];const __a=grist.docApi.applyUserActions.bind(grist.docApi);grist.docApi.applyUserActions=async a=>{window.__ECRITURES.push(a);return __a(a);};grist.ready=()=>{};grist.onOptions=cb=>setTimeout(()=>cb(${JSON.stringify({ fiche: MODELE, partenaires: true, modeles: COMMUNS, modeleDefaut: 'Lycées' })}),50);grist.setOptions=async o=>{window.__OPTS=JSON.parse(JSON.stringify(o));};`
    + `grist.onRecord=cb=>{window.__REC=cb;};grist.setCursorPos=async()=>{};grist.selectedTable={getTableId:async()=>'Etablissements'};` }));
  await p.goto('file://' + __C.racine + '/v2/fiche/index.html'); await p.waitForTimeout(1100);
  return p;
}
const ligne = (p, id) => p.evaluate(i => { const t = window.__DOC__.__data.Partenaires, k = t.id.indexOf(i); return k < 0 ? null : t.Fiche[k] ? JSON.parse(t.Fiche[k]) : {}; }, id);
const choisi = p => p.$eval('#modele', s => s.options[s.selectedIndex].textContent);

(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });
  let p = await ouvrir(browser, false);
  await p.click('#ouvrirReglages').catch(() => {}); await p.evaluate(() => { const s = document.getElementById('source'); s.value = '2'; s.dispatchEvent(new Event('change')); }); await p.waitForTimeout(800);
  console.log('PROPRIÉTAIRE, CHOIX :', JSON.stringify(await p.$$eval('#source option', l => l.map(o => o.textContent))), '| réglages visibles :', await p.isVisible('#ouvrirReglages'));
  await p.close();
  p = await ouvrir(browser, true);
  console.log('PARTENAIRE EN AFFICHAGE SEUL — boutons visibles :', JSON.stringify(await p.$$eval('#ouvrirReglages, #enregModele, #defautModele, #supprModele', l => l.map(b => b.id + ':' + !b.hidden))));
  console.log('À L\'OUVERTURE :', await choisi(p), '|', await p.textContent('#compteSelection'), '|', await p.textContent('.entete h2'));
  await p.selectOption('#modele', { label: 'Collèges · commun aux partenaires' }); await p.waitForTimeout(900);
  console.log('MODÈLE APPLIQUÉ :', await p.textContent('#compteSelection'), '| ligne inchangée :', JSON.stringify(await ligne(p, 2)), '| écritures :', await p.evaluate(() => (window.__ECRITURES || []).length));
  await browser.close();
})();
