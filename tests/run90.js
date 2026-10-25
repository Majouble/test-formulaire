// Widget « Référentiel des sites » : « Corriger les saisies » — sites tapés dans une sous-table de réponses, rattachés au référentiel par lot
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docSites } = require('./run78');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6XqXcEAAAAASUVORK5CYII=', 'base64');
(async () => {
  const doc = docSites(), T = doc._grist_Tables, C = doc._grist_Tables_column, D = doc.__data;
  // sous-table « Sites » de l'ancien formulaire : nom du site en texte libre
  const tid = Math.max(...T.id) + 1; for (const k of Object.keys(T)) T[k].push(k === 'id' ? tid : k === 'tableId' ? 'Sites' : (typeof T[k][0] === 'number' ? 0 : ''));
  for (const [c, ty, lab] of [['Dossier', 'Ref:Reponses', 'Dossier'], ['Nom_du_site', 'Text', 'Nom du site'], ['Qualification', 'Choice', 'Qualification']]) { const n = Math.max(...C.id) + 1; for (const k of Object.keys(C)) C[k].push(k === 'id' ? n : k === 'parentId' ? tid : k === 'colId' ? c : k === 'label' ? lab : k === 'type' ? ty : k === 'isFormula' ? false : (typeof C[k][0] === 'number' ? 0 : typeof C[k][0] === 'boolean' ? false : '')); }
  D.Sites = { id: [1, 2, 3, 4, 5, 6], Dossier: [3, 3, 4, 4, 2, 5], Nom_du_site: ['Campus Beaulieu bat 12', 'Annexe Rue Dupont', 'campus beaulieu, bât. 12', 'Villejean', 'Bâtiment Ivry', 'Annexe rue Dupont'], Qualification: ['Blocage total', 'Rassemblement', 'Blocage total', 'Rassemblement', 'RAS', 'RAS'] };
  const browser = await chromium.launch({ executablePath: __C.chromium }); const page = await browser.newPage({ viewport: { width: 1300, height: 1100 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => { console.log('CONFIRMATION :', d.message()); d.accept(); });
  await page.route('**/leaflet.min.js', r => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync('node_modules/leaflet/dist/leaflet.js') }));
  await page.route('**/leaflet.min.css', r => r.fulfill({ contentType: 'text/css', body: fs.readFileSync('node_modules/leaflet/dist/leaflet.css') }));
  await page.route(/data\.geopf\.fr/, r => r.fulfill({ contentType: 'image/png', body: PNG }));
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await page.goto('file://' + __C.racine + '/v2/sites/index.html'); await page.waitForTimeout(1200);
  await page.fill('#etab-q', 'moulin'); await page.waitForTimeout(200); await page.click('#etab-res li >> nth=0'); await page.waitForTimeout(300);
  await page.click('[data-vue=saisies]'); await page.waitForTimeout(600);
  console.log('SOURCES :', await page.$$eval('#sx-source option', l => l.map(o => o.textContent).join(' | ')));
  await page.selectOption('#sx-source', 'Sites.Nom_du_site'); await page.waitForTimeout(600);
  const liste = () => page.$$eval('#vue-saisies [data-sx]', l => l.map(x => x.innerText.replace(/\s+/g, ' ').trim()).join('\n   '));
  console.log('LIBELLÉS :\n  ', await liste());
  await page.check('[data-sx="campus beaulieu bat 12"] .sx-coche'); await page.waitForTimeout(200);
  console.log('SITE PROPOSÉ :', await page.$eval('#sx-site', s => s.selectedOptions[0].textContent), '|', await page.textContent('#sx-appliquer'));
  await page.click('#sx-appliquer'); await page.waitForTimeout(1200);
  console.log('STATUT :', await page.textContent('#sx-msg'));
  // « Annexe Rue Dupont » : nouveau site du référentiel
  await page.check('[data-sx="annexe rue dupont"] .sx-coche'); await page.waitForTimeout(200);
  await page.selectOption('#sx-site', 'nouveau'); await page.fill('#sx-nouveau', 'Annexe Dupont'); await page.click('#sx-appliquer'); await page.waitForTimeout(1500);
  console.log('STATUT :', await page.textContent('#sx-msg'));
  console.log('LIBELLÉS :\n  ', await liste());
  console.log('TABLE Sites :', await page.evaluate(() => { const S = window.__DOC__.__data.Sites; return S.id.map((id, i) => `${id}:${S.Nom_du_site[i]}→${S.Site_referentiel ? S.Site_referentiel[i] : '∅'}`).join('  '); }));
  console.log('RÉFÉRENTIEL :', await page.evaluate(() => { const T = window.__DOC__.__data.Referentiel_sites; return T.id.slice(5).map((id, k) => `${id}:${T.Nom[k + 5]}|e${T.Etablissement[k + 5]}`).join('  '); }));
  console.log('CORRESPONDANCES :', await page.evaluate(() => { const t = window.__DOC__.__data.Sites_correspondances; return t.id.map((id, i) => `${t.Etablissement[i]}|${t.Libelle[i]}→${t.Site[i]}(${t.Statut[i]})`).join('  '); }));
  await browser.close();
})();
