// 2.1 : profils d'atlas (Config), tableau libre, regroupement, modèle QGIS déposé
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs'); const http = require('http'); const path = require('path');
const RACINE = __C.racine, S = __C.sorties + '/atlas2';
const srv = http.createServer((q, r) => { const f = path.join(RACINE, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f.endsWith('/') ? f + 'index.html' : f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200); r.end(d); } }); }).listen(8766);
const src = fs.readFileSync('run27.js', 'utf8'); const mkDoc = eval('(' + src.slice(src.indexOf('(sansDep) =>'), src.indexOf('\n};\n') + 2) + ')');
async function telecharger(page, out) {
  const pdl = page.waitForEvent('download', { timeout: 15000 }).catch(() => null); await page.click('#download'); const dl = await pdl;
  if (!dl) { console.log('MESSAGES :', (await page.textContent('#messages')).trim().slice(0, 400)); return false; }
  await dl.saveAs(out); return true;
}
(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const doc = mkDoc(false);
  { const R = doc.__data.Reponses, C = doc._grist_Tables_column, T = doc._grist_Tables, tr = T.id[T.tableId.indexOf('Reponses')];
    R.Date_faits = R.id.map((_, i) => 1760000000 + (i % 3) * 86400); R.Gravite = R.id.map((_, i) => ['Grave', 'Légère', ''][i % 3]);
    for (const [col, ty] of [['Date_faits', 'Date'], ['Gravite', 'Choice']]) { const n2 = Math.max(...C.id) + 1; for (const k of Object.keys(C)) C[k].push(k === 'id' ? n2 : k === 'parentId' ? tr : k === 'colId' || k === 'label' ? col : k === 'type' ? ty : k === 'isFormula' ? false : (typeof C[k][0] === 'number' ? 0 : typeof C[k][0] === 'boolean' ? false : '')); } }
  console.log('Config présente ?', !!doc.__data.Config);
  { // sous-table d'une question tableau : Blesses (Dossier → Reponses, Gravite)
    const T = doc._grist_Tables, C = doc._grist_Tables_column, tid = Math.max(...T.id) + 1;
    for (const k of Object.keys(T)) T[k].push(k === 'id' ? tid : k === 'tableId' ? 'Blesses' : (typeof T[k][0] === 'number' ? 0 : typeof T[k][0] === 'boolean' ? false : ''));
    const opts = JSON.stringify({ choices: ['Grave', 'Légère', 'Sans précision'], choiceOptions: { Grave: { fillColor: '#A00000' }, 'Légère': { fillColor: '#2E8540' } } });
    for (const [col, ty, wo] of [['Dossier', 'Ref:Reponses', ''], ['Gravite', 'Choice', opts], ['Ligne_id', 'Text', '']]) { const n2 = Math.max(...C.id) + 1;
      for (const k of Object.keys(C)) C[k].push(k === 'id' ? n2 : k === 'parentId' ? tid : k === 'colId' || k === 'label' ? col : k === 'type' ? ty : k === 'widgetOptions' ? wo : k === 'isFormula' ? false : (typeof C[k][0] === 'number' ? 0 : typeof C[k][0] === 'boolean' ? false : '')); }
    doc.__data.Blesses = { id: [1, 2, 3, 4], Dossier: [1, 1, 2, 5], Gravite: ['Légère', 'Grave', 'Sans précision', 'Légère'], Ligne_id: ['a', 'b', 'c', 'd'] };
  }
  { // grappe dense à Versailles : 8 établissements autour de Versailles, rattachés à l'académie
    const R = doc.__data.Reponses, E = doc.__data.Etablissements, i0 = E.id.length;
    for (let k = 0; k < 8; k++) { for (const c of Object.keys(E)) { if (c === 'id') E.id.push(i0 + k + 1); else if (Array.isArray(E[c])) E[c].push(c === 'UAI' ? `078900${k}X` : c === 'Nom' ? `Collège Test ${k}` : c === 'Latitude' ? 48.80 + (k % 3) * 0.004 : c === 'Longitude' ? 2.13 + Math.floor(k / 3) * 0.005 : E[c][0]); }
      for (const c of Object.keys(R)) { if (c === 'id') R.id.push(Math.max(...R.id) + 1); else if (Array.isArray(R[c])) R[c].push(c === 'Etablissement' ? i0 + k + 1 : c === 'Dossier' ? 100 + k : R[c][0]); } }
  }
  const page = await browser.newPage({ viewport: { width: 1100, height: 1400 }, acceptDownloads: true });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
  await page.route('**/leaflet.min.*', r => r.abort());
  await page.route('**/jszip.min.js', r => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(require.resolve('jszip/dist/jszip.min.js')) }));
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__vraiFetch=window.fetch.bind(window);window.__DOC__=${JSON.stringify(doc)};window.__OPTS__={};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + fs.readFileSync('mock-saisie.js') + `;{const f=window.fetch;window.fetch=(u,...a)=>(String(u).includes('/atlas/')||String(u).includes('/attachments'))?window.__vraiFetch(u,...a):f(u,...a);}` }));
  let depose = null;
  await page.route('http://localhost/x/attachments**', async r => {
    if (r.request().method() === 'POST') { depose = r.request().postDataBuffer().toString(); return r.fulfill({ contentType: 'application/json', body: '[99]' }); }
    const m = /<qgis[\s\S]*<\/qgis>/.exec(depose || ''); return r.fulfill({ contentType: 'application/xml', body: m ? m[0] : '' });
  });
  await page.goto('http://localhost:8766/v2/cartographie/index.html'); await page.waitForTimeout(2500);
  await page.selectOption('#format', 'atlas'); await page.waitForTimeout(1200);
  console.log('PROFILS :', await page.$$eval('#atlasProfil option', o => o.map(x => x.textContent)), '| titre', await page.inputValue('#atlasTitre'));
  console.log('COLONNES :', await page.$$eval('.atlas-col', d => d.map(x => x.querySelector('[data-k=champ]').value + '=' + x.querySelector('[data-k=titre]').value)).then(a => a.join(' | ')));
  console.log('OPTIONS table :', await page.$$eval('.atlas-col:first-child [data-k=champ] optgroup:last-child option', o => o.map(x => x.value).join(',')));
  console.log('JOURS :', await page.$$eval('#atlasJours option', o => o.map(x => x.value).join(',')));
  // retirer UAI, ajouter Gravité (colonne de la table), monter « Gravité » d'un cran, tri par rang, critère jours
  await page.click('.atlas-col:nth-child(3) [data-a=suppr]');
  await page.click('#atlasAjouterCol'); const n = await page.$$eval('.atlas-col', d => d.length);
  await page.selectOption(`.atlas-col:nth-child(${n}) [data-k=champ]`, 'col:Gravite'); await page.waitForTimeout(200);
  console.log('AJOUT :', await page.inputValue(`.atlas-col:nth-child(${n}) [data-k=titre]`), await page.inputValue(`.atlas-col:nth-child(${n}) [data-k=agregat]`));
  await page.selectOption(`.atlas-col:nth-child(${n}) [data-k=agregat]`, 'liste');
  await page.click(`.atlas-col:nth-child(${n}) [data-a=haut]`);
  await page.selectOption('#atlasTri', 'rang'); await page.selectOption('#atlasCritere', 'jours'); await page.fill('#atlasLignes', '5');
  await page.fill('#atlasTitre', 'Mouvements lycéens'); await page.fill('#atlasProfilNom', 'Mouvements');
  await page.evaluate(() => document.querySelectorAll('#atlasBox details').forEach(d => d.open = true));
  await page.waitForTimeout(500); console.log('COMPTE :', await page.textContent('#atlasCompte'));
  await page.check('#atlasFiltreCat input[data-cat="Collège"]'); await page.waitForTimeout(600);
  console.log('FILTRE PROFIL Collège :', await page.textContent('#atlasCompte'), '| qualifs proposées', await page.$$eval('#atlasFiltreQualif input', l => l.map(x => x.dataset.qualif).join(',')));
  await page.uncheck('#atlasVoisins');
  console.log('SOUS-TABLES :', await page.$$eval('#atlasMarqueTable option', o => o.map(x => x.textContent).join(' | ')));
  await page.selectOption('#atlasMarqueTable', 'Blesses'); await page.waitForTimeout(300);
  await page.selectOption('#atlasMarqueColonne', 'Gravite'); await page.fill('#atlasMarqueTitre', 'Atteintes aux personnes');
  console.log('MODIFIÉ visible ?', await page.isVisible('#atlasModifie'));
  await page.click('#atlasEnregistrer'); await page.waitForTimeout(800);
  console.log('STATUT :', await page.textContent('#atlasStatut'), '| profils', await page.$$eval('#atlasProfil option', o => o.map(x => x.textContent)));
  const cfg = await page.evaluate(() => { const d = window.__DOC__.__data.Config; const i = d.Cle.indexOf('atlas'); return i >= 0 ? JSON.parse(d.Valeur[i]) : null; });
  console.log('CONFIG atlas :', cfg && cfg.actif, Object.keys(cfg.profils), JSON.stringify(cfg.profils.Mouvements.colonnes));
  if (!await telecharger(page, S + '/export67.zip')) { await browser.close(); srv.close(); return; }
  // modèle déposé : le modèle intégré, retouché (titre de la mise en page changé), puis rechargé
  // ancien filtre d'atlas (aggregate sur le nom de couche) et couche des points renommée : le widget doit corriger
  let qgs = fs.readFileSync(RACINE + '/v2/cartographie/atlas/atlas.qgs', 'utf8').replace('name="Atlas par académie"', 'name="Atlas retouché"')
    .replace(/(<Atlas [^>]*featureFilter=")[^"]*"/, '$1aggregate(\'signalements\', \'count\', &quot;UAI&quot;, &quot;Academie&quot; = attribute(@parent, \'nom\')) > 0"')
    .replace(/name="signalements"/g, 'name="Établissements bloqués"');
  fs.writeFileSync(S + '/retouche.qgs', qgs);
  await page.click('summary:has-text("Carte et modèle QGIS")');
  await page.setInputFiles('#atlasModeleFichier', S + '/retouche.qgs'); await page.waitForTimeout(1200);
  console.log('MODÈLE :', await page.textContent('#atlasStatut'), '|', await page.textContent('#atlasModeleEtat'));
  console.log('CONFIG modèle :', await page.evaluate(() => { const d = window.__DOC__.__data.Config; const i = d.Cle.indexOf('atlas_modele:Mouvements'); return i >= 0 ? JSON.stringify(d.Fichier && d.Fichier[i]) : 'absent'; }));
  await telecharger(page, S + '/export67b.zip');
  // autre profil : modèle intégré ; retour au profil Mouvements : son modèle
  await page.selectOption('#atlasProfil', 'Par défaut'); await page.waitForTimeout(300); console.log('Par défaut →', await page.textContent('#atlasModeleEtat'), '| colonnes', await page.$$eval('.atlas-col', d => d.length));
  await page.selectOption('#atlasProfil', 'Mouvements'); await page.waitForTimeout(300); console.log('Mouvements →', await page.textContent('#atlasModeleEtat'), '| tri', await page.inputValue('#atlasTri'));
  await page.screenshot({ path: S + '/ui67.png', fullPage: true });
  await page.locator('#atlasBox').screenshot({ path: S + '/atlasbox67.png' });
  await browser.close(); srv.close();
})();
