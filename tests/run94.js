// Rapprochement des sites saisis : colonne référence aux sites qui garde des anciens noms (références non résolues),
// dans l'administration (onglet Référentiel) et dans le widget « Référentiel des sites » (Corriger les saisies > Tous les établissements)
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docSites } = require('./run78');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6XqXcEAAAAASUVORK5CYII=', 'base64');
function docRef() {
  const doc = docSites(), T = doc._grist_Tables, C = doc._grist_Tables_column, D = doc.__data;
  const tid = Math.max(...T.id) + 1; for (const k of Object.keys(T)) T[k].push(k === 'id' ? tid : k === 'tableId' ? 'Sites' : (typeof T[k][0] === 'number' ? 0 : ''));
  for (const [c, ty, lab] of [['Dossier', 'Ref:Reponses', 'Dossier'], ['Nom_du_site', 'Ref:Referentiel_sites', 'Nom du site'], ['Qualification', 'Choice', 'Qualification']]) { const n = Math.max(...C.id) + 1; for (const k of Object.keys(C)) C[k].push(k === 'id' ? n : k === 'parentId' ? tid : k === 'colId' ? c : k === 'label' ? lab : k === 'type' ? ty : k === 'isFormula' ? false : (typeof C[k][0] === 'number' ? 0 : typeof C[k][0] === 'boolean' ? false : '')); }
  // anciens noms gardés en texte par Grist (référence non résolue) ; ligne 1 déjà rattachée
  D.Sites = { id: [1, 2, 3, 4, 5, 6], Dossier: [3, 3, 4, 4, 2, 5], Nom_du_site: [2, 'Annexe Rue Dupont', 'campus beaulieu, bât. 12', 'Villejean', 'Bâtiment Ivry', 'Annexe rue Dupont'], Qualification: ['Blocage total', 'Rassemblement', 'Blocage total', 'Rassemblement', 'RAS', 'RAS'] };
  D.Reponses.Description = D.Reponses.Description.map((d, i) => `${d} n°${D.Reponses.id[i]} : blocage de l'entrée principale, une cinquantaine d'étudiants devant le bâtiment`);
  return doc;
}
(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const etatSites = p => p.evaluate(() => { const S = window.__DOC__.__data.Sites; return S.id.map((id, i) => `${id}:${JSON.stringify(S.Nom_du_site[i])}`).join('  '); });
  const corr = p => p.evaluate(() => { const t = window.__DOC__.__data.Sites_correspondances; return t ? t.id.map((id, i) => `${t.Etablissement[i]}|${t.Libelle[i]}→${t.Site[i]}(${t.Statut[i]})`).join('  ') : '(aucune table)'; });
  // 1. administration
  let doc = docRef();
  const pa = await browser.newPage({ viewport: { width: 1300, height: 1500 } });
  pa.on('pageerror', e => console.log('PAGEERROR', e.message)); pa.on('dialog', d => d.accept());
  await pa.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await pa.goto('file://' + __C.racine + '/v2/admin/index.html'); await pa.waitForTimeout(1200);
  await pa.click('nav button[data-onglet=referentiel]'); await pa.waitForTimeout(1800);
  console.log('ADMIN SOURCES :', await pa.$$eval('#si-source option', l => l.map(o => (o.selected ? '*' : '') + o.textContent).join(' | ')));
  const lignesAdmin = () => pa.$$eval('#ref-sites tbody tr', l => l.map(tr => `${tr.querySelector('.si-coche').checked ? '☑' : '☐'} ${tr.cells[1].textContent} « ${tr.cells[2].innerText.replace(/\s+/g, ' ').trim()} » → ${tr.querySelector('.si-site').selectedOptions[0].textContent}`).join('\n   '));
  console.log('ADMIN LIBELLÉS :\n  ', await lignesAdmin());
  console.log('ADMIN CONTEXTE :\n  ', (await pa.$$eval('#ref-sites tbody tr .si-ctx', l => l.map(x => x.innerText.replace(/\s+/g, ' ').trim()))).join('\n   '));
  await pa.click('#si-valider'); await pa.waitForTimeout(1500);
  console.log('ADMIN STATUT :', await pa.textContent('#si-statut'));
  console.log('ADMIN TABLE Sites :', await etatSites(pa));
  console.log('ADMIN CORRESPONDANCES :', await corr(pa));
  // 2. widget, tous les établissements
  doc = docRef();
  const pw = await browser.newPage({ viewport: { width: 1300, height: 1100 } });
  pw.on('pageerror', e => console.log('PAGEERROR', e.message)); pw.on('dialog', d => d.accept());
  await pw.route('**/leaflet.min.js', r => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync('node_modules/leaflet/dist/leaflet.js') }));
  await pw.route('**/leaflet.min.css', r => r.fulfill({ contentType: 'text/css', body: fs.readFileSync('node_modules/leaflet/dist/leaflet.css') }));
  await pw.route(/data\.geopf\.fr/, r => r.fulfill({ contentType: 'image/png', body: PNG }));
  await pw.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await pw.goto('file://' + __C.racine + '/v2/sites/index.html'); await pw.waitForTimeout(1200);
  await pw.click('[data-vue=saisies]'); await pw.waitForTimeout(500);
  console.log('WIDGET SANS ÉTABLISSEMENT :', await pw.$eval('#sx-corps', z => z.innerText.replace(/\s+/g, ' ').slice(0, 100)));
  await pw.click('[data-sx-mode=tous]'); await pw.waitForTimeout(1500);
  console.log('WIDGET SOURCES :', await pw.$$eval('#si-source option', l => l.map(o => (o.selected ? '*' : '') + o.textContent).join(' | ')));
  console.log('WIDGET LIBELLÉS :\n  ', await pw.$$eval('#sx-corps tbody tr', l => l.map(tr => `${tr.querySelector('.si-coche').checked ? '☑' : '☐'} ${tr.cells[1].innerText.replace(/\s+/g, ' ').trim()} → ${tr.querySelector('.si-site').selectedOptions[0].textContent}`).join('\n   ')));
  console.log('FICHE / MOTS-CLÉS DANS LE WIDGET :', await pw.$('#si-fe-q') ? 'oui' : 'non', '/', await pw.$('#si-mc-creer, .si-mc') ? 'oui' : 'non');
  await pw.screenshot({ path: __C.sorties + '/run94-widget.png', fullPage: true });
  // « Bâtiment Ivry » : nouveau site ; les autres : proposés
  await pw.selectOption('#sx-corps tr:has-text("Bâtiment Ivry") .si-site', 'nouveau'); await pw.waitForTimeout(100);
  await pw.click('#si-valider'); await pw.waitForTimeout(2000);
  console.log('WIDGET STATUT :', await pw.textContent('#si-statut'));
  console.log('WIDGET TABLE Sites :', await etatSites(pw));
  console.log('WIDGET CORRESPONDANCES :', await corr(pw));
  console.log('RESTE À TRAITER :', await pw.$$eval('#sx-corps tbody tr', l => l.length), '|', await pw.$eval('#si-filtre', s => s.selectedOptions[0].textContent));
  // retour au mode établissement
  await pw.click('[data-sx-mode=etab]'); await pw.waitForTimeout(400);
  console.log('MODE ÉTABLISSEMENT :', await pw.$eval('#sx-corps', z => z.innerText.replace(/\s+/g, ' ').slice(0, 80)));
  await pw.click('[data-vue=etab]'); await pw.fill('#etab-q', 'moulin'); await pw.waitForTimeout(200); await pw.click('#etab-res li >> nth=0'); await pw.waitForTimeout(300);
  await pw.click('[data-vue=saisies]'); await pw.waitForTimeout(800);
  console.log('ÉTABLISSEMENT CHOISI, CONTEXTE :\n  ', (await pw.$$eval('#sx-corps [data-sx]', l => l.map(x => x.innerText.replace(/\s+/g, ' ').trim()))).join('\n   '));
  await browser.close();
})();
