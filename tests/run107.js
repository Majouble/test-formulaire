// Atlas national appliqué au supérieur (85 établissements d'essai, positions approchées) : réglage « Tous risques »
// (France entière), option « toujours afficher toutes les étiquettes » ; sigles sans abréviation scolaire (EE, LT…),
// aucun encart ne cache un point (sans place libre, l'encart n'est pas créé), tableau tenant sur la page (22 lignes)
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs'); const http = require('http'); const path = require('path');
const JSZip = require('jszip');
const { docAtlasEsr } = require('./run102');
const ESR = require('./esr_essai');
const srv = http.createServer((q, r) => { const f = path.join(__C.racine, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200); r.end(d); } }); }).listen(8772);
function doc() {
  const d = docAtlasEsr(), D = d.__data, E = D.Etablissements, R = D.Reponses, SS = D.Sites_signales;
  const modE = Object.fromEntries(Object.keys(E).map(k => [k, E[k][0]])), modR = Object.fromEntries(Object.keys(R).map(k => [k, R[k][0]]));
  Object.keys(E).forEach(k => { E[k] = []; }); Object.keys(R).forEach(k => { R[k] = []; }); Object.keys(SS).forEach(k => { SS[k] = []; });
  const Q = ['Blocage total', 'Blocage partiel', 'Rassemblement', 'Rassemblement', 'Blocage partiel', 'Rassemblement', 'Blocage total'];
  ESR.forEach(([sigle, nom, type, dep, commune, lat, lon], i) => {
    const id = i + 1, e = { ...modE, id, UAI: `${dep}${String(id).padStart(4, '0')}${'ABCDEFGHJKLMNPRSTUVWXYZ'[id % 23]}`, Nom: nom, Sigle: sigle, Type: type, Commune: commune,
      Academie: '', Departement: '', Libelle_nature: '', Latitude: lat, Longitude: lon, Region_academique: '', Statut_public_prive: 'Public', Mail: '' };
    Object.keys(E).forEach(k => E[k].push(e[k] === undefined ? null : e[k]));
    const q = Q[(i * 5 + 3) % Q.length], j = 1792627200 + ((i * 7) % 5) * 86400;
    const r = { ...modR, id, Etablissement: id, Dossier: id, Derniere_version: true, Qualification: q, Nature: 'Nouveau signalement', Description: q, Date_faits: j, Cree_le: j + 3600 };
    Object.keys(R).forEach(k => R[k].push(r[k] === undefined ? null : r[k]));
  });
  return d;
}
// Lambert-93 → papier (mm) sur la page France entière : mêmes calculs que le widget (CARTE_MM, emprise « Auto » + 6 %)
function versL93(lon, lat) {
  const a = 6378137, e = 0.0818191910428158, rad = Math.PI / 180, l0 = 3 * rad, p0 = 46.5 * rad, p1 = 44 * rad, p2 = 49 * rad;
  const m = p => Math.cos(p) / Math.sqrt(1 - e * e * Math.sin(p) ** 2), t = p => Math.tan(Math.PI / 4 - p / 2) / ((1 - e * Math.sin(p)) / (1 + e * Math.sin(p))) ** (e / 2);
  const n = (Math.log(m(p1)) - Math.log(m(p2))) / (Math.log(t(p1)) - Math.log(t(p2))), F = m(p1) / (n * t(p1) ** n), r0 = a * F * t(p0) ** n, r = a * F * t(lat * rad) ** n, th = n * (lon * rad - l0);
  return [700000 + r * Math.sin(th), 6600000 + r0 - r * Math.cos(th)];
}
(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const page = await browser.newPage({ viewport: { width: 1100, height: 1600 }, acceptDownloads: true });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.route('**/leaflet.min.*', r => r.abort());
  await page.route('**/jszip.min.js', r => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(require.resolve('jszip/dist/jszip.min.js')) }));
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__vraiFetch=window.fetch.bind(window);window.__DOC__=${JSON.stringify(doc())};window.__OPTS__={};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + fs.readFileSync('mock-saisie.js') + `;{const f=window.fetch;window.fetch=(u,...a)=>(String(u).includes('/atlas/')||String(u).includes('/attachments'))?window.__vraiFetch(u,...a):f(u,...a);}` }));
  await page.goto('http://localhost:8772/v2/cartographie/index.html'); await page.waitForTimeout(2500);
  await page.selectOption('#format', 'atlas'); await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelectorAll('#atlasBox details').forEach(x => x.open = true));
  await page.selectOption('#atlasPrereglage', 'tous_risques'); await page.click('#atlasAppliquerPrereglage'); await page.waitForTimeout(800);
  await page.check('#atlasToutes'); await page.waitForTimeout(300);
  console.log('ATLAS :', await page.textContent('#atlasCompte'), '| pages :', await page.$eval('#atlasDecoupage', s => s.value), '| lignes :', await page.$eval('#atlasLignes', s => s.value), '| toutes les étiquettes :', await page.isChecked('#atlasToutes'));
  const pdl = page.waitForEvent('download', { timeout: 40000 }).catch(() => null); await page.click('#download'); const dl = await pdl;
  if (!dl) { console.log('MESSAGES :', (await page.textContent('#messages')).trim().slice(0, 400)); await browser.close(); srv.closeAllConnections(); srv.close(); process.exit(0); }
  const out = __C.sorties + '/export107.zip'; await dl.saveAs(out); const zip = await JSZip.loadAsync(fs.readFileSync(out));
  const lire = f => zip.files[Object.keys(zip.files).find(x => x.endsWith('/' + f))].async('string');
  const sig = JSON.parse(await lire('signalements.geojson')).features, zones = JSON.parse(await lire('zones.geojson')).features, pages = JSON.parse(await lire('pages.geojson')).features;
  const ab = sig.filter(f => /^(EE|EM|CLG|LT|LP|LPO|LGT|LYC) /.test(f.properties.Etiquette)).map(f => f.properties.Etiquette);
  console.log('POINTS :', sig.length, '| étiquettes à abréviation scolaire :', ab.length ? ab.join(', ') : 'aucune', '| sans étiquette (Lh/Eh) :', sig.filter(f => f.properties.Lh === 1 || f.properties.Eh === 1).length,
    '| exemples :', ['INSA Lyon', 'UTT', 'UTC', 'ENS de Lyon', 'UCPP'].map(s => (sig.find(f => f.properties.Sigle === s) || { properties: {} }).properties.Etiquette).join(', '));
  // points cachés par un encart (hors ceux de sa zone) : position papier de chaque point sur la page France entière
  const pg = pages.find(f => f.properties.type === 'france'), an = pg.geometry.coordinates.flat(2).length ? pg.geometry.coordinates.flat(1) : [];
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity; an.forEach(([x, y]) => { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y); });
  const L = 198, H = 134, ratio = L / H; if ((x2 - x1) / (y2 - y1) < ratio) { const d = (ratio * (y2 - y1) - (x2 - x1)) / 2; x1 -= d; x2 += d; } else { const d = ((x2 - x1) / ratio - (y2 - y1)) / 2; y1 -= d; y2 += d; }
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, w = (x2 - x1) * 1.06, h = (y2 - y1) * 1.06, k = w / L, Ex1 = cx - w / 2, Ey2 = cy + h / 2;
  const caches = [];
  zones.forEach(z => { const Z = z.properties; sig.forEach(f => { const [X, Y] = versL93(...f.geometry.coordinates), u = 6 + (X - Ex1) / k, v = 56 + (Ey2 - Y) / k;
    if (f.properties.Zoom !== Z.num && u > Z.px && u < Z.px + Z.pw && v > Z.py && v < Z.py + Z.ph) caches.push(`${f.properties.Etiquette} sous l'encart ${Z.num}`); }); });
  console.log('ENCARTS :', zones.map(z => `n° ${z.properties.num} (${z.properties.nb} points, zoom ×${z.properties.zoom})`).join(' ; ') || 'aucun', '| points cachés :', caches.length ? caches.join(', ') : 'aucun');
  console.log('LISEZMOI :', (await lire('LISEZMOI.txt')).split('\r\n').filter(l => /^- Étiquettes/.test(l)).join(' '));
  await browser.close(); srv.closeAllConnections(); srv.close(); process.exit(0);
})();
