// 2.62.0-alpha.38 : Fiche établissement — filtres par table (réglages) : ajout, choix de la condition (dernier jour de la table,
// de chaque établissement, N derniers jours, valeurs), appliqués à toutes les tuiles ; enregistrés avec la fiche.
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docFiche, CONFIG } = require('./run127');
(async () => {
  const b = await chromium.launch({ executablePath: __C.chromium });
  const p = await b.newPage({ viewport: { width: 1400, height: 1300 } }); p.on('pageerror', e => console.log('PAGEERROR', e.message));
  await p.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(docFiche())};` + fs.readFileSync('mock.js')
    + `;grist.ready=()=>{};grist.onOptions=cb=>setTimeout(()=>cb(${JSON.stringify({ fiche: CONFIG })}),50);grist.setOptions=async o=>{window.__O=JSON.parse(JSON.stringify(o));};grist.onRecord=cb=>{window.__REC=cb;};grist.setCursorPos=async()=>{};grist.selectedTable={getTableId:async()=>'Etablissements'};` }));
  await p.goto('file://' + __C.racine + '/v2/fiche/index.html'); await p.waitForTimeout(1000);
  await p.evaluate(() => window.__REC({ id: 1 })); await p.waitForTimeout(300);
  const tuiles = () => p.$$eval('.tuile', l => l.map(x => x.querySelector('.titre').textContent.replace(/\s+/g, ' ').trim().slice(0, 22) + ' = ' + (x.querySelector('.grand') || {}).textContent).join(' | '));
  console.log('SANS FILTRE :', await tuiles());
  await p.click('#ouvrirReglages'); await p.waitForTimeout(300);
  const ouvrir = () => p.evaluate(() => { const d = document.querySelector('#reglages details[data-cle="filtres-tables"]'); if (d) d.open = true; });
  await ouvrir(); await p.click('[data-action="ajouter-filtre-table"]'); await p.waitForTimeout(400); await ouvrir();
  const t = await p.$eval('[data-champ="filtresTables.0.table"]', s => s.value);
  console.log('TABLE PROPOSÉE :', t, '| colonnes proposées :', await p.$$eval('[data-champ="filtresTables.0.colonne"] option', l => l.map(o => o.value).filter(Boolean).join(',')));
  console.log('PROPOSÉ :', await p.$eval('[data-champ="filtresTables.0.colonne"]', s => s.value), await p.$eval('[data-champ="filtresTables.0.condition"]', s => s.value));
  const col = 'Date_faits';
  for (const cond of ['dernierJour', 'dernierJourEtab', 'derniersJours']) {
    await p.selectOption('[data-champ="filtresTables.0.condition"]', cond); await p.waitForTimeout(500); await ouvrir();
    await p.selectOption('[data-champ="filtresTables.0.colonne"]', col); await p.waitForTimeout(500); await ouvrir();
    console.log(cond.toUpperCase(), ':', await tuiles());
  }
  await p.selectOption('[data-champ="filtresTables.0.condition"]', 'exclure'); await p.waitForTimeout(400); await ouvrir();
  console.log('CHAMP VALEURS :', !!(await p.$('[data-champ="filtresTables.0.valeurs"]')));
  await p.click('[data-action="enregistrer"]'); await p.waitForTimeout(500);
  console.log('ENREGISTRÉ :', JSON.stringify(await p.evaluate(() => window.__O && window.__O.fiche.filtresTables)));
  await b.close();
})();
