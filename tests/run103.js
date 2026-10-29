// « À vérifier » : modifier une saisie sur place, supprimer une mise à jour, supprimer un dossier entier (lignes liées comprises),
// dans l'administration et dans le widget « Référentiel des sites »
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docSites } = require('./run78');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6XqXcEAAAAASUVORK5CYII=', 'base64');
function docQa() {
  const doc = docSites(), D = doc.__data, R = D.Reponses, SS = D.Sites_signales;
  R.Derniere_version = R.id.map(id => ![4, 6].includes(id));
  // doublon : un second dossier pour le même établissement le même jour que le dossier 4 (saisi par erreur)
  const x = Math.max(...R.id) + 1;
  for (const c of Object.keys(R)) R[c].push(c === 'id' ? x : c === 'Etablissement' ? 1 : c === 'Dossier' ? x : c === 'Derniere_version' ? true : c === 'Qualification' ? 'Rassemblement' : c === 'Nature' ? 'Nouveau signalement' : c === 'Description' ? 'test' : c === 'Date_faits' ? 1792540800 : c === 'Cree_le' ? 1792545000 : (typeof R[c][0] === 'string' ? '' : null));
  [[4, 4, 'c', 1, 'Blocage partiel'], [4, 5, 'c', 1, 'Rassemblement'], [x, x, 'z', 2, 'Rassemblement']].forEach(([dos, ver, lid, site, q], k) => {
    SS.id.push(k + 1); SS.Dossier.push(dos); SS.Version.push(ver); SS.Ligne_id.push(lid); SS.Ordre.push(0); SS.Mouvement.push('Ajout'); SS.Site.push(site); SS.Site_libre.push(''); SS.Qualification.push(q); SS.Precisions.push(''); });
  return { doc, x };
}
(async () => {
  const { doc, x } = docQa();
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const page = await browser.newPage({ viewport: { width: 1250, height: 1700 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => { console.log('CONFIRMATION :', d.message().replace(/\n+/g, ' | ')); d.accept(); });
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(2500);
  await page.click('nav button[data-onglet=qualite]'); await page.waitForTimeout(1800);
  const items = () => page.$$eval('#qualite .qa-item', l => l.map(x => x.querySelector('.qa-tete').textContent.replace(/\s+/g, ' ').trim()).join(' | '));
  console.log('ANOMALIES :', await items());
  const doublon = '#qualite .qa-item:has-text("dossiers pour")';
  await page.click(`${doublon} .qe-details[data-dossier="4"] summary`); await page.waitForTimeout(200);
  console.log('SAISIES DU DOSSIER 4 :', await page.$$eval(`${doublon} .qe-details[data-dossier="4"] tbody tr[data-v]`, l => l.map(tr => `${tr.cells[0].innerText.replace(/\s+/g, ' ').trim()} [supprimer ${tr.querySelector('[data-qe=supprimer]').disabled ? 'désactivé' : 'possible'}]`).join(' | ')));
  // 1. modifier la saisie en double : description et qualification
  await page.click(`${doublon} .qe-details[data-dossier="${x}"] summary`); await page.waitForTimeout(200);
  await page.click(`${doublon} .qe-details[data-dossier="${x}"] tr[data-v="${x}"] [data-qe=modifier]`); await page.waitForTimeout(800);
  const ed = `${doublon} .qe-details[data-dossier="${x}"] .qe-editeur[data-pour="${x}"]`;
  console.log('CHAMPS MODIFIABLES :', await page.$$eval(`${ed} .fe-champ`, l => l.map(c => c.querySelector('label').textContent.trim() + (c.querySelector('[data-fe]') ? '' : ' (lecture)')).join(', ')));
  await page.fill(`${ed} [data-fe=Description]`, 'Rassemblement devant le hall, saisi deux fois'); await page.press(`${ed} [data-fe=Description]`, 'Tab'); await page.waitForTimeout(300);
  console.log('ENREGISTRÉ :', await page.evaluate(id => { const R = window.__DOC__.__data.Reponses; return R.Description[R.id.indexOf(id)]; }, x));
  await page.click(`${ed} [data-qe=terminer]`); await page.waitForTimeout(1500);
  console.log('APRÈS « Terminer » :', await page.textContent('#qa-statut-msg'), '|', await items());
  // 2. supprimer la mise à jour n° 5 du dossier 4 (et ses lignes de sites)
  await page.click(`${doublon} .qe-details[data-dossier="4"] summary`); await page.waitForTimeout(200);
  await page.click(`${doublon} .qe-details[data-dossier="4"] tr[data-v="5"] [data-qe=supprimer]`); await page.waitForTimeout(1500);
  console.log('APRÈS SUPPRESSION DE LA MISE À JOUR :', await page.textContent('#qa-statut-msg'));
  // 3. supprimer le dossier en double entier
  await page.click(`${doublon} .qe-details[data-dossier="${x}"] summary`); await page.waitForTimeout(200);
  await page.click(`${doublon} .qe-details[data-dossier="${x}"] [data-qe=supprimer-dossier]`); await page.waitForTimeout(1500);
  console.log('APRÈS SUPPRESSION DU DOSSIER :', await page.textContent('#qa-statut-msg'), '| anomalies :', await items());
  const etat = await page.evaluate(() => { const D = window.__DOC__.__data; return { rep: D.Reponses.id.join(','), sites: D.Sites_signales.id.map((id, i) => `${id}:d${D.Sites_signales.Dossier[i]}/v${D.Sites_signales.Version[i]}`).join(' ') }; });
  console.log('RÉPONSES :', etat.rep, '| SITES :', etat.sites);
  await page.screenshot({ path: __C.sorties + '/qa-103.png', fullPage: true });
  // 4. widget « Référentiel des sites » : mêmes outils dans la vue « À vérifier »
  const { doc: doc2 } = docQa();
  const p2 = await browser.newPage({ viewport: { width: 1300, height: 1100 } });
  p2.on('pageerror', e => console.log('PAGEERROR', e.message)); p2.on('dialog', d => d.accept());
  await p2.route('**/leaflet.min.js', r => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync('node_modules/leaflet/dist/leaflet.js') }));
  await p2.route('**/leaflet.min.css', r => r.fulfill({ contentType: 'text/css', body: fs.readFileSync('node_modules/leaflet/dist/leaflet.css') }));
  await p2.route(/data\.geopf\.fr/, r => r.fulfill({ contentType: 'image/png', body: PNG }));
  await p2.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc2)};` + fs.readFileSync('mock.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await p2.goto('file://' + __C.racine + '/v2/sites/index.html'); await p2.waitForTimeout(1500);
  await p2.click('[data-vue=qa]'); await p2.waitForTimeout(1500);
  await p2.click('#vue-qa li:has-text("dossiers pour") [data-qa=ouvrir], #vue-qa li:has-text("dossiers pour") button >> nth=0').catch(e => console.log('OUVRIR ?', e.message.slice(0, 80)));
  await p2.waitForTimeout(800);
  console.log('WIDGET, SAISIES :', await p2.$$eval('#vue-qa .qe tbody tr[data-v]', l => l.map(tr => tr.dataset.v + ':' + [...tr.querySelectorAll('button')].map(b => b.textContent.trim()).join('/')).join(' | ')));
  await p2.click(`#vue-qa .qe[data-dossier="${x}"] [data-qe=supprimer-dossier]`).catch(e => console.log('SUPPR ?', e.message.slice(0, 80))); await p2.waitForTimeout(1500);
  console.log('WIDGET, APRÈS :', (await p2.textContent('#vue-qa')).replace(/\s+/g, ' ').slice(0, 160), '| réponses', await p2.evaluate(() => window.__DOC__.__data.Reponses.id.join(',')));
  await browser.close();
})();
