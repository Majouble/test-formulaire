// Widget « Référentiel des sites » : recherche par adresse — texte nettoyé avant le géocodage (3 à 200 caractères, commençant
// par une lettre ou un chiffre), point de référence invalide omis, nouvel essai sans point de référence sur une erreur 400
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docSites } = require('./run78');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6XqXcEAAAAASUVORK5CYII=', 'base64');
(async () => {
  const doc = docSites(), E = doc.__data.Etablissements;
  E.Nom[0] = 'La Rochelle Université'; E.Latitude[0] = 6550000; E.Longitude[0] = 380000;   // coordonnées en Lambert 93 saisies par erreur
  const browser = await chromium.launch({ executablePath: __C.chromium }); const page = await browser.newPage({ viewport: { width: 1300, height: 950 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => d.accept());
  const appels = [];
  await page.route('**/leaflet.min.js', r => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync('node_modules/leaflet/dist/leaflet.js') }));
  await page.route('**/leaflet.min.css', r => r.fulfill({ contentType: 'text/css', body: fs.readFileSync('node_modules/leaflet/dist/leaflet.css') }));
  await page.route(/data\.geopf\.fr\/wmts/, r => r.fulfill({ contentType: 'image/png', body: PNG }));
  // service simulé : mêmes contrôles que la Géoplateforme
  await page.route(/data\.geopf\.fr\/geocodage\/search/, r => { const u = new URL(r.request().url()), q = u.searchParams.get('q') || '', lat = u.searchParams.get('lat');
    appels.push(`q=${JSON.stringify(q)}${lat ? ` lat=${lat}` : ''}`);
    const h = { 'Access-Control-Allow-Origin': '*' };
    if (q.length < 3 || q.length > 200 || !/^[\p{L}\p{N}]/u.test(q)) return r.fulfill({ status: 400, contentType: 'application/json', headers: h, body: JSON.stringify({ code: 400, message: 'Failed parsing query', detail: ['q: must contain between 3 and 200 chars and start with a number or a letter'] }) });
    if (lat && Math.abs(+lat) > 90) return r.fulfill({ status: 400, contentType: 'application/json', headers: h, body: JSON.stringify({ code: 400, message: 'Failed parsing query', detail: ['lat: must be a valid latitude'] }) });
    r.fulfill({ contentType: 'application/json', headers: h, body: JSON.stringify({ type: 'FeatureCollection', features: [{ geometry: { type: 'Point', coordinates: [-1.1601, 46.1489] }, properties: { label: '23 Avenue Albert Einstein 17000 La Rochelle', name: '23 Avenue Albert Einstein', city: 'La Rochelle', postcode: '17000', type: 'housenumber', score: .97 } }] }) }); });
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await page.goto('file://' + __C.racine + '/v2/sites/index.html'); await page.waitForTimeout(1200);
  await page.fill('#etab-q', 'rochelle'); await page.waitForTimeout(200); await page.click('#etab-res li >> nth=0'); await page.waitForTimeout(500);
  await page.click('[data-source=adresse]');
  for (const q of ['« 23 avenue Albert Einstein, La Rochelle »', '- 23 av. Albert Einstein ;', '12', '#']) {
    appels.length = 0;
    await page.fill('#trouver-q', q); await page.click('#trouver-go'); await page.waitForTimeout(500);
    console.log(`${JSON.stringify(q)} → appels : ${appels.join(' | ') || '(aucun)'} → ${await page.$eval('#cands', u => u.innerText.replace(/\s+/g, ' ').trim().slice(0, 140))}`);
  }
  await browser.close();
})();
