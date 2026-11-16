// 2.62 : Fiche établissement — badges affichant une valeur (« Label CVL : Niv 3 ») et filtre rapide sur ces valeurs ;
// modèles de sélection (enregistrés pour le document dans Config, clé « fiche », ou pour la page sans table Config),
// appliqués d'un choix, remis à « — Modèles — » dès qu'un filtre change, supprimés.
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docFiltres, CONFIG } = require('./run128');

function ajouterTable(d, tid, cols, lignes) {
  const T = d._grist_Tables, C = d._grist_Tables_column, ref = T.id.length + 1;
  T.id.push(ref); T.tableId.push(tid); d.__data[tid] = { id: [] };
  cols.forEach(([colId, type], k) => {
    C.id.push(C.id.length + 1); C.parentId.push(ref); C.colId.push(colId); C.type.push(type); C.label.push(colId);
    C.isFormula.push(false); C.formula.push(''); C.widgetOptions.push(''); C.visibleCol.push(0); C.parentPos.push(k + 1);
    d.__data[tid][colId] = [];
  });
  lignes.forEach((l, i) => { d.__data[tid].id.push(i + 1); cols.forEach(([c], k) => d.__data[tid][c].push(l[k] ?? null)); });
}
function doc(avecConfig) {
  const d = docFiltres();
  ajouterTable(d, 'Labels', [['UAI', 'Text'], ['Label_CVL', 'Choice']], [['0780001A', 'Niv 3'], ['0750003C', 'Niv 1']]);
  if (avecConfig) ajouterTable(d, 'Config', [['Cle', 'Text'], ['Valeur', 'Text'], ['Modifie_le', 'DateTime:Europe/Paris']], []);
  return d;
}
const config = { ...CONFIG, badges: [...CONFIG.badges, { libelle: 'Label CVL', table: 'Labels', lien: 'UAI', colonne: 'Label_CVL', affichage: 'valeur' }] };

async function ouvrir(browser, d) {
  const p = await browser.newPage({ viewport: { width: 1000, height: 1100 } });
  p.on('pageerror', e => console.log('PAGEERROR', e.message)); p.on('dialog', x => x.accept());
  await p.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(d)};` + fs.readFileSync('mock.js')
    + `;window.__OPTS=null;grist.ready=()=>{};grist.onOptions=cb=>setTimeout(()=>cb(${JSON.stringify({ fiche: config })}),50);grist.setOptions=async o=>{window.__OPTS=JSON.parse(JSON.stringify(o));};`
    + `grist.onRecord=cb=>{window.__REC=cb;};grist.setCursorPos=async()=>{};grist.selectedTable={getTableId:async()=>'Etablissements'};` }));
  await p.goto('file://' + __C.racine + '/v2/fiche/index.html'); await p.waitForTimeout(1000);
  return p;
}
const barre = async p => [await p.textContent('#compteSelection'), await p.textContent('.entete h2'), await p.$eval('#modele', s => s.options[s.selectedIndex].textContent)].join(' | ');
async function enregistrer(p, nom) {
  await p.click('#enregModele'); await p.fill('#nomModele', nom); await p.click('#validerModele'); await p.waitForTimeout(400);
  return p.textContent('#message');
}

(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });
  let p = await ouvrir(browser, doc(true));

  /* ---------- badges ---------- */
  await p.evaluate(() => window.__REC({ id: 1 })); await p.waitForTimeout(300);
  console.log('BADGES LILAS :', JSON.stringify(await p.$$eval('.badge', l => l.map(b => b.textContent + (b.classList.contains('non') ? ' [éteint]' : '')))));
  await p.evaluate(() => window.__REC({ id: 2 })); await p.waitForTimeout(300);
  console.log('BADGES COLLÈGE :', JSON.stringify(await p.$$eval('.badge', l => l.map(b => b.textContent + (b.classList.contains('non') ? ' [éteint]' : '')))));
  await p.click('[data-qf="badge:1"]'); await p.waitForTimeout(150);
  console.log('PUCE LABEL CVL :', JSON.stringify(await p.$$eval('#qpop .qopt', l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim()))));
  await p.click('#qpop [data-q=aucune]'); await p.check('#qpop input[value="Niv 3"]'); await p.check('#qpop input[value="Niv 1"]'); await p.waitForTimeout(200);
  await p.keyboard.press('Escape');
  console.log('LABEL CVL RENSEIGNÉ :', await barre(p));

  /* ---------- modèles du document ---------- */
  console.log('ENREGISTRÉ :', await enregistrer(p, 'Labellisés CVL'));
  await p.click('#effacerFiltres'); await p.waitForTimeout(200);
  await p.click('[data-qf="col:Academie"]'); await p.click('#qpop [data-q=aucune]'); await p.check('#qpop input[value="Versailles"]'); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  console.log('ENREGISTRÉ :', await enregistrer(p, 'Académie de Versailles'));
  const cfg = await p.evaluate(() => { const t = window.__DOC__.__data.Config; const i = t.Cle.indexOf('fiche'); return i < 0 ? null : JSON.parse(t.Valeur[i]); });
  console.log('CONFIG « fiche » :', JSON.stringify(cfg && cfg.modeles.map(m => [m.nom, Object.keys(m.filtres.rapides)])));
  console.log('LISTE :', JSON.stringify(await p.$$eval('#modele option', l => l.map(o => o.textContent))));
  await p.click('#effacerFiltres'); await p.waitForTimeout(200);
  console.log('EFFACÉ :', await barre(p));
  await p.selectOption('#modele', { label: 'Labellisés CVL · document' }); await p.waitForTimeout(300);
  console.log('MODÈLE LABELLISÉS :', await barre(p), '| puce :', await p.textContent('[data-qf="badge:1"]'));
  await p.selectOption('#modele', { label: 'Académie de Versailles · document' }); await p.waitForTimeout(300);
  console.log('MODÈLE VERSAILLES :', await barre(p), '| supprimer actif :', !(await p.isDisabled('#supprModele')));
  await p.click('[data-qf="col:Type"]'); await p.click('#qpop [data-q=aucune]'); await p.check('#qpop input[value="Lycée"]'); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  console.log('FILTRE CHANGÉ :', await barre(p), '| supprimer actif :', !(await p.isDisabled('#supprModele')));
  await p.selectOption('#modele', { label: 'Labellisés CVL · document' }); await p.waitForTimeout(200);
  await p.click('#supprModele'); await p.waitForTimeout(400);
  console.log('SUPPRIMÉ :', await p.textContent('#message'), '| liste :', JSON.stringify(await p.$$eval('#modele option', l => l.map(o => o.textContent))));
  await p.screenshot({ path: __C.sorties + '/fiche-129-modeles.png' });

  /* ---------- réglages du badge ---------- */
  await p.click('#ouvrirReglages'); await p.waitForTimeout(300);
  await p.evaluate(() => document.querySelector('#reglages details[data-cle="badges"]').open = true);
  console.log('RÉGLAGE BADGE 2 :', await p.$eval('[data-champ="badges.1.affichage"]', s => s.value), '|', await p.$eval('[data-champ="badges.1.colonne"]', s => s.closest('label').querySelector('span').textContent));
  await p.selectOption('[data-champ="badges.1.affichage"]', 'oui_non'); await p.waitForTimeout(400);
  console.log('EN OUI / NON :', JSON.stringify(await p.$$eval('.badge', l => l.map(b => b.textContent))), '|', await p.$eval('[data-champ="badges.1.colonne"]', s => s.closest('label').querySelector('span').textContent));
  await p.close();

  /* ---------- sans table Config : modèle de la page ---------- */
  p = await ouvrir(browser, doc(false));
  await p.click('[data-qf="col:Type"]'); await p.click('#qpop [data-q=aucune]'); await p.check('#qpop input[value="Lycée"]'); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  console.log('PAGE, ENREGISTRÉ :', await enregistrer(p, 'Lycées'));
  await p.waitForTimeout(800);
  console.log('OPTIONS :', JSON.stringify((await p.evaluate(() => window.__OPTS)).modeles.map(m => [m.nom, m.filtres.rapides])));
  await p.click('#effacerFiltres'); await p.waitForTimeout(200);
  await p.selectOption('#modele', { label: 'Lycées · cette page' }); await p.waitForTimeout(300);
  console.log('MODÈLE LYCÉES :', await barre(p));
  await browser.close();
})();
