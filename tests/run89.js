// Widget « Référentiel des sites » : modification par lot (homonymes, mots-clés, statut, renommage, désactivation) et fusion de doublons
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docSites } = require('./run78');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6XqXcEAAAAASUVORK5CYII=', 'base64');
(async () => {
  const doc = docSites(), D = doc.__data;
  D.Referentiel_sites.Nom = ['Campus centre', 'Campus Beaulieu', 'Campus  Centre', 'campus centre', 'Campus Ivry'];
  D.Sites_signales = { id: [1, 2, 3, 4], Dossier: [3, 4, 4, 5], Ligne_id: ['a', 'b', 'c', 'd'], Ordre: [1, 1, 2, 1], Version: [3, 4, 4, 5], Mouvement: ['Ajout', 'Ajout', 'Ajout', 'Ajout'],
    Site: [3, 4, 2, 1], Site_libre: [null, null, null, null], Qualification: ['RAS', 'RAS', 'RAS', 'RAS'], Precisions: [null, null, null, null] };
  D.Sites_correspondances.Site = [4];
  const browser = await chromium.launch({ executablePath: __C.chromium }); const page = await browser.newPage({ viewport: { width: 1300, height: 1100 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => { console.log('CONFIRMATION :', d.message().split('\n').filter(Boolean).join(' | ')); d.accept(); });
  await page.route('**/leaflet.min.js', r => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync('node_modules/leaflet/dist/leaflet.js') }));
  await page.route('**/leaflet.min.css', r => r.fulfill({ contentType: 'text/css', body: fs.readFileSync('node_modules/leaflet/dist/leaflet.css') }));
  await page.route(/data\.geopf\.fr/, r => r.fulfill({ contentType: 'image/png', body: PNG }));
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await page.goto('file://' + __C.racine + '/v2/sites/index.html'); await page.waitForTimeout(1200);
  await page.fill('#etab-q', 'moulin'); await page.waitForTimeout(200); await page.click('#etab-res li >> nth=0'); await page.waitForTimeout(400);
  console.log('HOMONYMES :', await page.$$eval('[data-homonymes]', l => l.map(b => b.textContent).join(' | ')));
  await page.click('[data-homonymes]'); await page.waitForTimeout(200);
  console.log('SÉLECTION :', await page.$$eval('.site.coche .nom', l => l.map(x => x.value).join(' | ')));
  await page.fill('#lot-mots', 'bât. A, Présidence'); await page.click('[data-lot=mots]'); await page.waitForTimeout(400);
  console.log('MOTS :', await page.textContent('#statut'));
  await page.selectOption('#lot-statut', 'Proposé'); await page.click('[data-lot=statut]'); await page.waitForTimeout(400);
  console.log('RADIOS :', await page.$$eval('[name=lot-garde]', l => l.map(r => (r.checked ? '●' : '○') + r.parentNode.textContent.replace(/\s+/g, ' ').trim()).join(' | ')));
  await page.click('[data-lot=fusion]'); await page.waitForTimeout(1200);
  console.log('FUSION :', await page.textContent('#statut'));
  console.log('SITES :', await page.evaluate(() => { const T = window.__DOC__.__data.Referentiel_sites; return T.id.map((id, i) => `${id}:${T.Nom[i]}|${T.Statut ? T.Statut[i] : ''}|actif=${T.Actif ? T.Actif[i] : ''}|${T.Mots_cles ? T.Mots_cles[i] || '' : ''}`).join('  '); }));
  console.log('RÉFÉRENCES :', await page.evaluate(() => { const D = window.__DOC__.__data; return 'Sites_signales ' + D.Sites_signales.Site.join(',') + ' | correspondances ' + D.Sites_correspondances.Site.join(','); }));
  // renommage et désactivation par lot
  await page.check('#lot-tout'); await page.waitForTimeout(200);
  await page.fill('#lot-nom', 'Site'); await page.uncheck('.site:has(input.nom[value="Campus Beaulieu"]) .sel').catch(() => {}); await page.waitForTimeout(200);
  await page.fill('#lot-nom', 'Ancien site'); await page.click('[data-lot=nom]'); await page.waitForTimeout(400);
  await page.click('[data-lot=desactiver]'); await page.waitForTimeout(400);
  console.log('APRÈS LOT :', await page.evaluate(() => { const T = window.__DOC__.__data.Referentiel_sites; return T.id.map((id, i) => `${id}:${T.Nom[i]}|actif=${T.Actif ? T.Actif[i] : ''}`).join('  '); }));
  await page.screenshot({ path: __C.sorties + '/run89.png' });
  await browser.close();
})();
