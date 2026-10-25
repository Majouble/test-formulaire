// Widget « Référentiel des sites » : établissement, sites sur la carte, candidats IGN / OpenStreetMap / adresse, ajout, déplacement, mots-clés
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docSites } = require('./run78');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6XqXcEAAAAASUVORK5CYII=', 'base64');
(async () => {
  const doc = docSites(), E = doc.__data.Etablissements, S = doc.__data.Referentiel_sites;
  E.Nom[0] = 'La Rochelle Université'; E.Commune[0] = 'La Rochelle'; E.Latitude[0] = 46.1450; E.Longitude[0] = -1.1530;
  S.Nom = ['Campus des Minimes', 'Pôle Communication', 'Site Villejean', 'Site Lorient', 'Campus Ivry'];
  const browser = await chromium.launch({ executablePath: __C.chromium }); const page = await browser.newPage({ viewport: { width: 1300, height: 950 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => d.accept());
  const appels = [];
  await page.route('**/leaflet.min.js', r => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync('node_modules/leaflet/dist/leaflet.js') }));
  await page.route('**/leaflet.min.css', r => r.fulfill({ contentType: 'text/css', body: fs.readFileSync('node_modules/leaflet/dist/leaflet.css') }));
  await page.route(/data\.geopf\.fr\/wmts/, r => r.fulfill({ contentType: 'image/png', body: PNG }));
  await page.route(/data\.geopf\.fr\/geocodage\/search/, r => { const u = new URL(r.request().url()); appels.push('search ' + u.searchParams.get('index') + ' ' + u.searchParams.get('q'));
    const poi = { type: 'FeatureCollection', features: [
      { geometry: { type: 'Point', coordinates: [-1.1535, 46.1452] }, properties: { toponym: 'Campus des Minimes', category: ['enseignement supérieur'], city: ['La Rochelle'], postcode: ['17000'] } },
      { geometry: { type: 'Point', coordinates: [-1.1395, 46.1598] }, properties: { toponym: 'Faculté de droit, science politique et management', category: ['enseignement supérieur'], city: ['La Rochelle'] } },
      { geometry: { type: 'Point', coordinates: [5.3, 43.3] }, properties: { toponym: 'Université lointaine', category: ['enseignement supérieur'], city: ['Marseille'] } }] };
    const adr = { type: 'FeatureCollection', features: [{ geometry: { type: 'Point', coordinates: [-1.1601, 46.1489] }, properties: { label: '23 Avenue Albert Einstein 17000 La Rochelle', name: '23 Avenue Albert Einstein', city: 'La Rochelle', postcode: '17000', type: 'housenumber', score: .97 } }] };
    r.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(u.searchParams.get('index') === 'poi' ? poi : adr) }); });
  await page.route(/data\.geopf\.fr\/geocodage\/reverse/, r => r.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ features: [{ properties: { city: 'La Rochelle', postcode: '17000', name: '1 rue de la Paix' } }] }) }));
  await page.route(/overpass-api\.de/, r => { appels.push('overpass'); r.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ elements: [
    { type: 'way', center: { lat: 46.1471, lon: -1.1557 }, tags: { amenity: 'university', name: 'Maison de la Réussite', operator: 'La Rochelle Université' } },
    { type: 'node', lat: 46.1452, lon: -1.1534, tags: { amenity: 'university', name: 'Campus des Minimes' } },
    { type: 'node', lat: 46.16, lon: -1.13, tags: { amenity: 'college', name: 'Lycée Valin BTS' } }] }) }); });
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await page.goto('file://' + __C.racine + '/v2/sites/index.html'); await page.waitForTimeout(1200);
  console.log('CONTEXTE :', await page.textContent('#contexte'));
  await page.fill('#etab-q', 'rochelle'); await page.waitForTimeout(200);
  console.log('RECHERCHE :', await page.$$eval('#etab-res li', l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim()).join(' | ')));
  await page.click('#etab-res li >> nth=0'); await page.waitForTimeout(400);
  console.log('SITES :', await page.$$eval('.site', l => l.map(x => x.querySelector('.nom').value + ' [' + x.querySelector('.meta').textContent.replace(/\s+/g, ' ').trim() + ']').join(' | ')));
  // IGN
  await page.click('#trouver-go'); await page.waitForTimeout(500);
  console.log('IGN :', await page.$$eval('.cand', l => l.map(x => x.innerText.replace(/\s+/g, ' ').trim()).join(' || ')));
  await page.click('.cand:not(.deja) [data-action=ajouter] >> nth=0'); await page.waitForTimeout(800);
  console.log('STATUT :', await page.textContent('#statut'));
  // le site existant « Campus des Minimes » sans coordonnées : placé sur la carte
  await page.click('.site:has(input.nom[value="Campus des Minimes"]) [data-action=placer]'); await page.waitForTimeout(200);
  const box = await page.$eval('#carte', e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.click(box.x, box.y); await page.waitForTimeout(500);
  console.log('PLACÉ :', await page.textContent('#statut'));
  // OSM
  await page.click('[data-source=osm]'); await page.waitForTimeout(600);
  console.log('OSM :', await page.$$eval('.cand', l => l.map(x => x.innerText.replace(/\s+/g, ' ').trim()).join(' || ')));
  // adresse : nom à donner
  await page.click('[data-source=adresse]'); await page.fill('#trouver-q', '23 avenue Albert Einstein La Rochelle'); await page.click('#trouver-go'); await page.waitForTimeout(500);
  await page.fill('.cand .nom-cand', 'Pôle Sciences et Technologie'); await page.click('.cand [data-action=ajouter]'); await page.waitForTimeout(800);
  // ajout d'un clic sur la carte
  await page.mouse.click(box.x + 120, box.y - 60); await page.waitForTimeout(300);
  await page.fill('.popup-ajout input', 'Résidence Antinéa'); await page.keyboard.press('Enter'); await page.waitForTimeout(800);
  // mots-clés et désactivation
  await page.fill('.site:has(input.nom[value="Pôle Communication"]) .mots', 'PCM ; Pôle Communication Multimédia Réseaux'); await page.press('.site:has(input.nom[value="Pôle Communication"]) .mots', 'Tab'); await page.waitForTimeout(300);
  await page.click('.site:has(input.nom[value="Site Lorient"]) [data-action=actif]'); await page.waitForTimeout(300);
  console.log('TABLE :', await page.evaluate(() => { const T = window.__DOC__.__data.Referentiel_sites; return T.id.map((id, i) => `${id}:${T.Site_id[i]}|${T.Nom[i]}|e${T.Etablissement[i]}|${T.Latitude ? T.Latitude[i] : ''},${T.Longitude ? T.Longitude[i] : ''}|${T.Commune ? T.Commune[i] : ''}|${T.Source ? T.Source[i] : ''}|${T.Statut ? T.Statut[i] : ''}|${T.Mots_cles ? T.Mots_cles[i] || '' : ''}|actif=${T.Actif ? T.Actif[i] : ''}`).join('\n   '); }));
  console.log('APPELS :', appels.join(' ; '));
  // fiche de l'établissement dans le widget
  await page.click('#fe-bloc summary'); await page.waitForTimeout(600);
  console.log('FICHE :', await page.$$eval('#fe-zone .fe-grille >> nth=0', g => [...g[0].querySelectorAll('.fe-champ label')].map(x => x.textContent.trim()).join(' | ')));
  await page.fill('#fe-Commune', 'La Rochelle (17)'); await page.press('#fe-Commune', 'Tab'); await page.waitForTimeout(500);
  console.log('FICHE MODIFIÉE :', await page.textContent('#fe-statut'), '|', await page.evaluate(() => window.__DOC__.__data.Etablissements.Commune[0]), '| fiche du haut :', (await page.textContent('.fiche .aide')).trim());
  await page.click('#fe-bloc .fe-autres summary:has-text("Ajouter")'); await page.fill('#fe-nouv', 'Tutelle'); await page.selectOption('#fe-type', 'Choice'); await page.click('#fe-ajout'); await page.waitForTimeout(800);
  console.log('AJOUT :', await page.textContent('#fe-statut'), '| champ :', !!(await page.$('#fe-Tutelle')));
  await page.screenshot({ path: __C.sorties + '/run83.png' });
  await browser.close();
})();
