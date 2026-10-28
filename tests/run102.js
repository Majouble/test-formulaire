// Atlas QGIS ouvert au supérieur et à tous les risques : un point par site (référentiel des sites), couleurs et formes
// libres (colonne au choix, valeurs gardées), pages par région académique et France entière, réglages prêts à l'emploi
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs'); const http = require('http'); const path = require('path');
const JSZip = require('jszip');
const { docSites } = require('./run78');
const S = __C.sorties + '/atlas2';
const srv = http.createServer((q, r) => { const f = path.join(__C.racine, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200); r.end(d); } }); }).listen(8769);
function docAtlasEsr() {
  const doc = docSites(), T = doc._grist_Tables, C = doc._grist_Tables_column, D = doc.__data;
  const ajCol = (table, col, type) => { const tid = T.id[T.tableId.indexOf(table)], n = Math.max(...C.id) + 1;
    for (const k of Object.keys(C)) C[k].push(k === 'id' ? n : k === 'parentId' ? tid : k === 'colId' || k === 'label' ? col : k === 'type' ? type : k === 'isFormula' ? false : (typeof C[k][0] === 'number' ? 0 : typeof C[k][0] === 'boolean' ? false : '')); };
  ajCol('Referentiel_sites', 'Latitude', 'Numeric'); ajCol('Referentiel_sites', 'Longitude', 'Numeric'); ajCol('Etablissements', 'Sigle', 'Text');
  const RS = D.Referentiel_sites; RS.Latitude = [48.80, 48.118, 48.121, 47.748]; RS.Longitude = [2.13, -1.638, -1.703, -3.366];
  D.Etablissements.Sigle = ['UJM', 'LRR', 'EJF'];
  D.Reponses.Derniere_version = [true, true, true, false, true, false, true];
  // sous-table historisée des sites : une copie des lignes par version
  const L = [[3, 3, 'a', 2, null, 'Blocage total'], [3, 3, 'b', 3, null, 'Rassemblement'], [4, 4, 'c', 1, null, 'Blocage partiel'],
    [4, 5, 'c', 1, null, 'Rassemblement'], [4, 5, 'd', 0, 'Gymnase du Moulin', 'Rassemblement'], [6, 6, 'e', 4, null, 'Rassemblement'], [6, 7, 'e', 4, null, 'RAS']];
  const SS = D.Sites_signales;
  L.forEach(([dos, ver, lid, site, libre, q], k) => { SS.id.push(k + 1); SS.Dossier.push(dos); SS.Version.push(ver); SS.Ligne_id.push(lid); SS.Ordre.push(k); SS.Mouvement.push('Ajout');
    SS.Site.push(site || 0); SS.Site_libre.push(libre || ''); SS.Qualification.push(q); SS.Precisions.push(''); });
  return doc;
}
module.exports = { docAtlasEsr };
async function telecharger(page, out) {
  const pdl = page.waitForEvent('download', { timeout: 25000 }).catch(() => null); await page.click('#download'); const dl = await pdl;
  if (!dl) { console.log('MESSAGES :', (await page.textContent('#messages')).trim().slice(0, 400)); return null; }
  await dl.saveAs(out); return JSZip.loadAsync(fs.readFileSync(out));
}
const lire = async (zip, f) => { const k = Object.keys(zip.files).find(x => x.endsWith('/' + f)); return k ? zip.files[k].async('string') : null; };
if (require.main === module) (async () => {
  const doc = docAtlasEsr();
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const page = await browser.newPage({ viewport: { width: 1100, height: 1600 }, acceptDownloads: true });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.route('**/leaflet.min.*', r => r.abort());
  await page.route('**/jszip.min.js', r => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(require.resolve('jszip/dist/jszip.min.js')) }));
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__vraiFetch=window.fetch.bind(window);window.__DOC__=${JSON.stringify(doc)};window.__OPTS__={};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + fs.readFileSync('mock-saisie.js') + `;{const f=window.fetch;window.fetch=(u,...a)=>(String(u).includes('/atlas/')||String(u).includes('/attachments'))?window.__vraiFetch(u,...a):f(u,...a);}` }));
  await page.goto('http://localhost:8769/v2/cartographie/index.html'); await page.waitForTimeout(2500);
  await page.selectOption('#format', 'atlas'); await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelectorAll('#atlasBox details').forEach(d => d.open = true));
  const sym = () => page.$$eval('#atlasSymItems .atlas-sym', l => l.map(d => `${d.querySelector('[data-s=garder]').checked ? '☑' : '☐'} ${d.querySelector('.val').textContent.trim()} → « ${d.querySelector('[data-s=libelle]').value} » ${d.querySelector('[type=color]').value} ${d.querySelector('[data-s=forme]').value}`).join('\n   '));
  console.log('PAR DÉFAUT :', await page.textContent('#atlasCompte'), '| couleurs selon', await page.$eval('#atlasSymChamp', s => s.value), '\n  ', await sym());
  // 1. supérieur, un point par site, par région académique
  await page.selectOption('#atlasPrereglage', 'sup_sites'); await page.click('#atlasAppliquerPrereglage'); await page.waitForTimeout(800);
  console.log('SUP. SITES :', await page.textContent('#atlasCompte'), '|', await page.textContent('#atlasSitesAide'));
  console.log('COULEURS :', await page.$eval('#atlasSymChamp', s => s.value), '\n  ', await sym());
  // autres valeurs (sites revenus à la normale, sans qualification retenue) : écartées ; « Rassemblement » en triangle
  await page.uncheck('#atlasSymItems .atlas-sym.autres [data-s=garder]');
  const k = await page.$$eval('#atlasSymItems .atlas-sym', l => l.findIndex(d => d.querySelector('.val').textContent.trim() === 'Rassemblement'));
  if (k >= 0) await page.selectOption(`#atlasSymItems .atlas-sym >> nth=${k} >> [data-s=forme]`, 'triangle');
  await page.waitForTimeout(500);
  console.log('APRÈS RÉGLAGE :', await page.textContent('#atlasCompte'));
  await page.screenshot({ path: S + '/ui102.png', fullPage: true });
  let zip = await telecharger(page, S + '/export102a.zip');
  if (zip) {
    const sig = JSON.parse(await lire(zip, 'signalements.geojson')), pages = JSON.parse(await lire(zip, 'pages.geojson')), qgs = await lire(zip, 'atlas.qgs');
    console.log('POINTS :\n  ', sig.features.map(f => { const p = f.properties; return `${p.Etiquette} | ${p.Academie} / ${p.Region_academique} | ${p.Categorie} | ${p.Qualification_principale} | signal. ${p.Nb_signalements} | jours ${p.Nb_jours} | page ${p.Page} | rang ${p.Rang}`; }).join('\n   '));
    console.log('PAGES :', pages.features.map(f => `${f.properties.cle} (${f.properties.type}, ${f.properties.academies}, ${f.properties.Nb_etablissements} pts, ${f.geometry.type})`).join(' ; '));
    const rend = /<renderer-v2 [^>]*attr="Categorie"[^>]*>[\s\S]*?<\/renderer-v2>/.exec(qgs)[0];
    console.log('CATÉGORIES QGIS :', [...rend.matchAll(/<category [^>]*label="([^"]*)"[^>]*symbol="(\d+)"/g)].map(m => `${m[1]}#${m[2]}`).join(', '),
      '| formes :', [...rend.matchAll(/<Option name="name" value="([a-z_]+)" type="QString"\/>/g)].map(m => m[1]).join(','),
      '| couleurs :', [...rend.matchAll(/<Option name="color" value="([\d,]+)"/g)].map(m => m[1]).join(' / '));
    console.log('LÉGENDE :', [...qgs.matchAll(/name="legend\/title-label" value="([^"]*)"/g)].map(m => m[1]).join(', '), '| compte :', /sites signalés/.test(qgs) ? 'sites signalés' : 'établissements', '| académies de la page :', (qgs.match(/'academies'/g) || []).length);
    console.log('LISEZMOI :', (await lire(zip, 'LISEZMOI.txt')).split('\r\n').filter(l => /^- (Points|Pages|Couleurs)/.test(l)).join('\n   '));
  }
  // 2. tous risques : France entière, un point par établissement
  await page.selectOption('#atlasPrereglage', 'tous_risques'); await page.click('#atlasAppliquerPrereglage'); await page.waitForTimeout(800);
  console.log('TOUS RISQUES :', await page.textContent('#atlasCompte'), '| pages :', await page.$eval('#atlasDecoupage', s => s.value));
  zip = await telecharger(page, S + '/export102b.zip');
  if (zip) { const pages = JSON.parse(await lire(zip, 'pages.geojson')), sig = JSON.parse(await lire(zip, 'signalements.geojson'));
    console.log('PAGES :', pages.features.map(f => `${f.properties.cle} (${f.properties.type}, ${f.properties.academies.split('|').filter(Boolean).length} académies, ${f.properties.Nb_etablissements} pts)`).join(' ; '));
    console.log('POINTS :', sig.features.map(f => `${f.properties.Etiquette} [${f.properties.Categorie}] sites ${f.properties.Nb_sites} (${f.properties.Sites})`).join(' ; ')); }
  // 3. couleurs selon une colonne du référentiel (Statut public / privé), en carrés
  await page.selectOption('#atlasSymChamp', 'ref:Statut_public_prive'); await page.waitForTimeout(800);
  console.log('RÉFÉRENTIEL :', await sym());
  await browser.close(); srv.close();
})();
