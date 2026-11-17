// 2.62 : Fiche établissement — ventilation par colonnes (une ligne par établissement, une colonne par thème :
// consultation lycéenne Moyens / Climat scolaire / Parcoursup), synthèse « total des colonnes comparées »,
// légende {principal}, affichage en barres (trois premières sur la synthèse, toutes dans le détail), réglages, impression.
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docFiche, CONFIG } = require('./run127');

function doc() {
  const d = docFiche(), T = d._grist_Tables, C = d._grist_Tables_column, ref = T.id.length + 1;
  T.id.push(ref); T.tableId.push('Consultation'); d.__data.Consultation = { id: [1, 2] };
  [['UAI', 'Text', 'UAI'], ['Moyens', 'Int', 'Moyens'], ['Climat_scolaire', 'Int', 'Climat scolaire'], ['Parcoursup', 'Int', 'Parcoursup'], ['Autres', 'Int', 'Autres'], ['Commentaire', 'Text', 'Commentaire']].forEach(([c, t, l], k) => {
    C.id.push(C.id.length + 1); C.parentId.push(ref); C.colId.push(c); C.type.push(t); C.label.push(l);
    C.isFormula.push(false); C.formula.push(''); C.widgetOptions.push(''); C.visibleCol.push(0); C.parentPos.push(k + 1);
  });
  Object.assign(d.__data.Consultation, { UAI: ['0780001A', '0750099Z'], Moyens: [12, 3], Climat_scolaire: [8, 1], Parcoursup: [20, 0], Autres: [0, 1], Commentaire: ['', ''] });
  return d;
}
const config = { ...CONFIG, tuiles: [
  { titre: 'Consultation lycéenne', bloc: 'Situation en cours', table: 'Consultation', lien: 'UAI',
    synthese: { mode: 'total', unite: 'réponses', legende: 'Thème principal : {principal}' },
    ventilationColonnes: ['Moyens', 'Climat_scolaire', 'Parcoursup', 'Autres'], ventilationAffichage: 'barres', source: 'DNE (AGORA)' },
  { ...CONFIG.tuiles[2], ventilationAffichage: 'barres' },
  ...CONFIG.tuiles.filter((t, i) => i !== 2)] };

(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const p = await browser.newPage({ viewport: { width: 900, height: 1200 } });
  p.on('pageerror', e => console.log('PAGEERROR', e.message)); p.on('dialog', d => d.accept());
  await p.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc())};` + fs.readFileSync('mock.js')
    + `;grist.ready=()=>{};grist.onOptions=cb=>setTimeout(()=>cb(${JSON.stringify({ fiche: config })}),50);grist.setOptions=async o=>{window.__OPTS=o;};`
    + `grist.onRecord=cb=>{window.__REC=cb;};grist.setCursorPos=async()=>{};grist.selectedTable={getTableId:async()=>'Etablissements'};` }));
  await p.goto('file://' + __C.racine + '/v2/fiche/index.html'); await p.waitForTimeout(1000);
  await p.evaluate(() => window.__REC({ id: 1 })); await p.waitForTimeout(300);
  // première tuile de la fiche (consultation) : bloc « Situation en cours »
  const barres = sel => p.$$eval(sel + ' .barre-ligne', l => l.map(b => [b.querySelector('.barre-lib').textContent, b.querySelector('.barre-n').textContent.replace(/\s+/g, ' '), b.querySelector('.barre-val').style.width].join(' | ')));

  console.log('SYNTHÈSE :', await p.textContent('.bloc:nth-child(3) .tuile:first-child .grand'), '|', await p.textContent('.bloc:nth-child(3) .tuile:first-child .legende'));
  console.log('BARRES COMPACTES :', JSON.stringify(await barres('.bloc:nth-child(3) .tuile:first-child .tete')));
  await p.click('[data-tuile="0"]'); await p.waitForTimeout(150);
  console.log('BARRES DU DÉTAIL :', JSON.stringify(await barres('.tuile.ouverte .detail')));
  console.log('SOURCE :', await p.textContent('.tuile.ouverte .source'));
  await p.click('[data-tuile="0"]'); await p.click('[data-tuile="3"]'); await p.waitForTimeout(150);
  console.log('CLIMAT EN BARRES (parts du nombre de lignes) :', JSON.stringify(await barres('.tuile.ouverte .detail')));
  await p.screenshot({ path: __C.sorties + '/fiche-131-ecran.png', fullPage: true });

  // établissement sans ligne de consultation
  await p.evaluate(() => window.__REC({ id: 2 })); await p.waitForTimeout(300);
  console.log('SANS CONSULTATION :', await p.textContent('.bloc:nth-child(3) .tuile:first-child .grand'), '| légende :', await p.$$eval('.bloc:nth-child(3) .tuile:first-child .legende', l => l.length), '| vide :', await p.$eval('.bloc:nth-child(3) .tuile:first-child', n => n.classList.contains('vide')));

  // réglages : colonnes numériques proposées, décocher « Autres », passer en liste
  await p.evaluate(() => window.__REC({ id: 1 })); await p.waitForTimeout(300);
  await p.click('#ouvrirReglages'); await p.waitForTimeout(300);
  await p.evaluate(() => document.querySelector('#reglages details[data-cle="tuile-0"]').open = true);
  console.log('COLONNES PROPOSÉES :', JSON.stringify(await p.$$eval('[data-liste="tuiles.0.ventilationColonnes"]', l => l.map(i => i.value + (i.checked ? ' ✓' : '')))));
  await p.uncheck('[data-liste="tuiles.0.ventilationColonnes"][value="Autres"]'); await p.waitForTimeout(400);
  console.log('SANS AUTRES :', JSON.stringify(await barres('.bloc:nth-child(3) .tuile:first-child .tete')), '| alertes :', await p.$$eval('#alertes li', l => l.length));
  await p.selectOption('[data-champ="tuiles.0.ventilationAffichage"]', 'liste'); await p.waitForTimeout(400);
  console.log('EN LISTE : barres compactes', await p.$$eval('.bloc:nth-child(3) .tuile:first-child .tete .barres', l => l.length));
  await p.selectOption('[data-champ="tuiles.0.ventilationAffichage"]', 'barres'); await p.waitForTimeout(300);
  await p.click('[data-action=enregistrer]'); await p.waitForTimeout(300);
  console.log('ENREGISTRÉ :', JSON.stringify(await p.evaluate(() => { const t = window.__OPTS.fiche.tuiles[0]; return [t.ventilationColonnes, t.ventilationAffichage, t.synthese.mode]; })));

  // impression : synthèse (barres compactes en page 1), annexe (toutes les barres)
  await p.emulateMedia({ media: 'print' });
  console.log('IMPRESSION : barres en page 1', await p.$$eval('.tuile .tete .barres', l => l.filter(b => getComputedStyle(b).display !== 'none').length), '| barres en annexe', await p.$$eval('.annexe .barres', l => l.length));
  await p.pdf({ path: __C.sorties + '/fiche-131.pdf', format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' } });
  await browser.close();
})();
