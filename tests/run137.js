// 2.62 : Fiche etablissement - couleur de badge sur une valeur avec guillemets, virgule, double espace et retour a la ligne
// (valeur recopiee sans le retour a la ligne par le champ texte) ; regle sans valeur correspondante signalee.
const __C = require('./chemins'); const { chromium } = require('playwright'); const fs = require('fs');
const { docFiche, CONFIG } = require('./run127');
(async () => {
  const b = await chromium.launch({ executablePath: __C.chromium });
  const V = '"Non, mais une situation  disciplinaire\nen lien avec le mouvement" ';
  const R = '"Non, mais une situation disciplinaireen lien avec le mouvement"';
  for (const type of ['Text', 'Choice']) {
    const d = docFiche(), E = d.__data.Etablissements; E.Enquete = E.id.map((_, i) => i === 0 ? V : 'Non');
    const T = d._grist_Tables, C = d._grist_Tables_column, ref = T.id[T.tableId.indexOf('Etablissements')];
    C.id.push(C.id.length + 1); C.parentId.push(ref); C.colId.push('Enquete'); C.type.push(type); C.label.push('Enquête'); C.isFormula.push(false); C.formula.push(''); C.widgetOptions.push(''); C.visibleCol.push(0); C.parentPos.push(99);
    const cfg = JSON.parse(JSON.stringify(CONFIG));
    cfg.badges = [{ libelle: 'Enquête', table: '', lien: '', colonne: 'Enquete', affichage: 'valeur', couleurs: [{ valeur: R, couleur: 'rouge' }, { valeur: 'Peut-être', couleur: 'vert' }, { valeur: 'Non', couleur: 'bleu' }, { valeur: 'vide', couleur: 'gris' }] }];
    const p = await b.newPage(); p.on('pageerror', e => console.log('PAGEERROR', e.message));
    await p.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(d)};` + fs.readFileSync('mock.js')
      + `;grist.ready=()=>{};grist.onOptions=cb=>setTimeout(()=>cb(${JSON.stringify({ fiche: cfg })}),50);grist.setOptions=async()=>{};grist.onRecord=cb=>{window.__REC=cb;};grist.setCursorPos=async()=>{};grist.selectedTable={getTableId:async()=>'Etablissements'};` }));
    await p.goto('file://' + __C.racine + '/v2/fiche/index.html'); await p.waitForTimeout(900);
    for (const id of [1, 2]) { await p.evaluate(i => window.__REC({ id: i }), id); await p.waitForTimeout(300);
      console.log(type, id, await p.$eval('.badge', x => x.className + ' | ' + x.textContent)); }
    // via les réglages : saisie de la valeur comme le ferait l'utilisateur
    await p.click('#ouvrirReglages'); await p.waitForTimeout(300);
    console.log('DATALIST :', await p.$$eval('#valeurs-badge-0 option', l => l.map(o => o.value).join(' || ')));
    await p.evaluate(() => document.querySelectorAll('#reglages details').forEach(d => d.open = true));
    console.log('ALERTES :', await p.$$eval('.couleurs-badge .regle', l => l.map(x => x.querySelector('input').value.slice(0, 12) + ' ' + (x.querySelector('.sans-effet') ? '⚠' : 'ok')).join(' | ')));
    console.log('CHAMP :', await p.$eval('[data-champ="badges.0.couleurs.0.valeur"]', x => x.value));
    await p.close();
  }
  await b.close();
})();
