// 2.62.0-alpha.39 : Fiche établissement — « + Filtre » dans la barre : filtre ajouté à la volée sur une colonne de
// n'importe quelle table liée aux établissements (valeurs des lignes de l'établissement ; sans ligne : « (vide) »),
// gardé dans les filtres (et les modèles), conservé par « Effacer les filtres », retiré par « Retirer ».
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docFiche, CONFIG } = require('./run127');
(async () => {
  const b = await chromium.launch({ executablePath: __C.chromium });
  const p = await b.newPage({ viewport: { width: 1400, height: 1200 } }); p.on('pageerror', e => console.log('PAGEERROR', e.message));
  await p.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(docFiche())};` + fs.readFileSync('mock.js')
    + `;grist.ready=()=>{};grist.onOptions=cb=>setTimeout(()=>cb(${JSON.stringify({ fiche: { ...CONFIG, filtresRapides: ['Type'] } })}),50);grist.setOptions=async o=>{window.__O=JSON.parse(JSON.stringify(o));};grist.onRecord=cb=>{window.__REC=cb;};grist.setCursorPos=async()=>{};grist.selectedTable={getTableId:async()=>'Etablissements'};` }));
  await p.goto('file://' + __C.racine + '/v2/fiche/index.html'); await p.waitForTimeout(1000);
  await p.evaluate(() => window.__REC({ id: 1 })); await p.waitForTimeout(300);
  console.log('PUCES :', await p.$$eval('#puces .qchip', l => l.map(x => x.textContent.trim()).join(' | ')), '|', await p.textContent('#compteSelection'));
  await p.click('#ajouterPuce'); await p.waitForTimeout(200);
  console.log('TABLES PROPOSÉES :', await p.$$eval('#ajoutTable option', l => l.map(o => o.value).join(',')));
  await p.selectOption('#ajoutTable', 'Reponses'); await p.waitForTimeout(100);
  await p.selectOption('#ajoutColonne', 'Qualification');
  await p.click('[data-q="ajouter"]'); await p.waitForTimeout(600);
  console.log('VALEURS :', await p.$$eval('#qpop .qopt', l => l.map(x => x.textContent.trim().replace(/\s+/g, ' ')).join(' | ')));
  await p.click('[data-q="aucune"]'); await p.waitForTimeout(200);
  const premier = await p.$$eval('#qpop .qopt input', l => l[0].value);
  await p.check(`#qpop .qopt input[value="${premier}"]`); await p.waitForTimeout(400);
  console.log(`SEULEMENT « ${premier} » :`, await p.textContent('#compteSelection'), '| puce :', await p.$eval('[data-qf="tab:Reponses.Qualification"]', x => x.textContent.trim()));
  await p.waitForTimeout(800);
  console.log('ENREGISTRÉ :', JSON.stringify(await p.evaluate(() => window.__O && { colonnes: window.__O.filtres.colonnes, rapides: window.__O.filtres.rapides })));
  await p.click('body'); await p.click('#effacerFiltres'); await p.waitForTimeout(400);
  console.log('APRÈS « EFFACER » :', await p.textContent('#compteSelection'), '| puce gardée :', !!(await p.$('[data-qf="tab:Reponses.Qualification"]')));
  await p.click('[data-qf="tab:Reponses.Qualification"]'); await p.waitForTimeout(200); await p.click('[data-q="retirer"]'); await p.waitForTimeout(400);
  console.log('APRÈS « RETIRER » :', await p.$$eval('#puces .qchip', l => l.map(x => x.textContent.trim()).join(' | ')));
  await b.close();
})();
