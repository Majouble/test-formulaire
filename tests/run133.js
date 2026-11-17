// 2.62 : Fiche établissement sur une page des partenaires — propriétaire : choix de la fiche réglée (page = modèle de
// départ, ou ligne d'un partenaire), filtres enregistrés dans la ligne du partenaire ; partenaire ouvert par son lien
// (sa seule ligne lisible, règles d'accès simulées) : sa fiche, tables refusées ignorées (tuile vide, alerte),
// réglages, filtres et modèles enregistrés dans sa ligne, jamais dans les options de la page.
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docFiche, CONFIG } = require('./run127');

const MODELE = { ...CONFIG, filtresRapides: ['Type'] };
const RECTORAT = { fiche: { ...CONFIG, filtresRapides: ['Type'], tuiles: [CONFIG.tuiles[2], { ...CONFIG.tuiles[3], restreint: false }] }, filtres: { rapides: { 'col:Type': ['Lycée'] } }, modeles: [] };
function doc(partenaire) {
  const d = docFiche(), T = d._grist_Tables, C = d._grist_Tables_column, ref = T.id.length + 1;
  T.id.push(ref); T.tableId.push('Partenaires');
  [['Nom', 'Text'], ['Cle', 'Text'], ['Lien', 'Text'], ['Actif', 'Bool'], ['Fiche', 'Text']].forEach(([c, t], k) => {
    C.id.push(C.id.length + 1); C.parentId.push(ref); C.colId.push(c); C.type.push(t); C.label.push(c);
    C.isFormula.push(c === 'Lien'); C.formula.push(''); C.widgetOptions.push(''); C.visibleCol.push(0); C.parentPos.push(k + 1);
  });
  const lignes = [[1, 'Préfecture des Yvelines', 'cle-a', '', true, ''], [2, 'Rectorat de Versailles', 'cle-b', '', true, JSON.stringify(RECTORAT)]].filter(l => !partenaire || l[0] === 2);
  d.__data.Partenaires = { id: lignes.map(l => l[0]), Nom: lignes.map(l => l[1]), Cle: lignes.map(l => l[2]), Lien: lignes.map(l => l[3]), Actif: lignes.map(l => l[4]), Fiche: lignes.map(l => l[5]) };
  // propriétaire : le faux Grist sert toujours _grist_ACLRules ; le partenaire se la voit refuser (ci-dessous)
  return d;
}
async function ouvrir(browser, partenaire) {
  const p = await browser.newPage({ viewport: { width: 1000, height: 1100 } });
  p.on('pageerror', e => console.log('PAGEERROR', e.message)); p.on('dialog', x => x.accept());
  const refus = partenaire ? `const __f=grist.docApi.fetchTable.bind(grist.docApi);grist.docApi.fetchTable=async n=>{if(['Points_situation','Config','Bati','_grist_ACLRules'].includes(n))throw new Error('Blocked by table read access rules');return __f(n);};` : '';
  await p.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc(partenaire))};` + fs.readFileSync('mock.js') + `;${refus}`
    + `window.__OPTS=null;grist.ready=()=>{};grist.onOptions=cb=>setTimeout(()=>cb(${JSON.stringify({ fiche: MODELE, partenaires: true })}),50);grist.setOptions=async o=>{window.__OPTS=JSON.parse(JSON.stringify(o));};`
    + `grist.onRecord=cb=>{window.__REC=cb;};grist.setCursorPos=async()=>{};grist.selectedTable={getTableId:async()=>'Etablissements'};` }));
  await p.goto('file://' + __C.racine + '/v2/fiche/index.html'); await p.waitForTimeout(1100);
  return p;
}
const ligne = (p, id) => p.evaluate(i => { const t = window.__DOC__.__data.Partenaires, k = t.id.indexOf(i); return k < 0 ? null : t.Fiche[k] ? JSON.parse(t.Fiche[k]) : {}; }, id);
const titres = p => p.$$eval('.tuile .titre', l => l.map(x => x.textContent).join(', '));

(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });
  /* ---------- propriétaire ---------- */
  let p = await ouvrir(browser, false);
  console.log('PROPRIÉTAIRE : choix visible', await p.isVisible('#source'), '|', JSON.stringify(await p.$$eval('#source option', l => l.map(o => o.textContent))));
  console.log('PAGE (modèle) :', await titres(p), '|', await p.textContent('#compteSelection'));
  await p.selectOption('#source', '1'); await p.waitForTimeout(400);
  console.log('PRÉFECTURE (sans réglages : modèle de la page) :', await titres(p), '|', await p.textContent('#message'));
  await p.click('[data-qf="col:Type"]'); await p.click('#qpop [data-q=aucune]'); await p.check('#qpop input[value="Collège"]'); await p.keyboard.press('Escape'); await p.waitForTimeout(900);
  const pref = await ligne(p, 1);
  console.log('PRÉFECTURE ENREGISTRÉE :', JSON.stringify({ filtres: pref.filtres && pref.filtres.rapides, tuiles: pref.fiche && pref.fiche.tuiles.length }), '| options de la page écrites :', !!(await p.evaluate(() => window.__OPTS)));
  await p.selectOption('#source', '2'); await p.waitForTimeout(400);
  console.log('RECTORAT :', await titres(p), '|', await p.textContent('#compteSelection'), '| puce :', await p.textContent('[data-qf="col:Type"]'));
  await p.selectOption('#source', ''); await p.waitForTimeout(400);
  console.log('RETOUR À LA PAGE :', await titres(p), '| puce :', await p.textContent('[data-qf="col:Type"]'));
  await p.click('#ouvrirReglages'); await p.waitForTimeout(300);
  console.log('RÉGLAGE « PAGE DES PARTENAIRES » :', await p.isChecked('#pagePartenaires'));
  await p.close();

  /* ---------- partenaire (lien du rectorat) ---------- */
  p = await ouvrir(browser, true);
  console.log('PARTENAIRE : choix visible', await p.isVisible('#source'), '| message :', JSON.stringify(await p.textContent('#message')));
  console.log('SA FICHE :', await titres(p), '|', await p.textContent('#compteSelection'), '|', await p.textContent('.entete h2'));
  console.log('TUILE BÂTI (table refusée) :', await p.$eval('.tuile:last-child', t => t.querySelector('.grand').textContent + (t.classList.contains('vide') ? ' [vide]' : '')));
  await p.click('#ouvrirReglages'); await p.waitForTimeout(300);
  console.log('ALERTES :', JSON.stringify(await p.$$eval('#alertes li', l => l.map(x => x.textContent))), '| case page des partenaires :', !!(await p.$('#pagePartenaires')));
  await p.evaluate(() => document.querySelector('#reglages details[data-cle="tuile-0"]').open = true);
  await p.fill('[data-champ="tuiles.0.titre"]', 'Faits établissement'); await p.dispatchEvent('[data-champ="tuiles.0.titre"]', 'change'); await p.waitForTimeout(300);
  await p.click('[data-action=enregistrer]'); await p.waitForTimeout(500);
  let rec = await ligne(p, 2);
  console.log('RÉGLAGES ENREGISTRÉS DANS SA LIGNE :', rec.fiche.tuiles.map(t => t.titre).join(', '), '| options de la page :', JSON.stringify(await p.evaluate(() => window.__OPTS)), '|', await p.textContent('#message'));
  await p.click('#enregModele'); await p.fill('#nomModele', 'Lycées de Versailles'); await p.click('#validerModele'); await p.waitForTimeout(500);
  rec = await ligne(p, 2);
  console.log('MODÈLE :', await p.textContent('#message'), '| ligne :', JSON.stringify(rec.modeles.map(m => m.nom)), '| liste :', JSON.stringify(await p.$$eval('#modele option', l => l.map(o => o.textContent))));
  await browser.close();
})();
