// Formulaire par site, cas du terrain : colonne du site en double, sans colonne hors référentiel ; tableau ordinaire avec un site ;
// contrôle du paramétrage dans l'administration (référentiel des sites relié à un autre référentiel des établissements)
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docSites } = require('./run78');
function docTerrain(autreReferentiel) {
  const doc = docSites(), T = doc._grist_Tables, C = doc._grist_Tables_column, D = doc.__data;
  const tr = T.id[T.tableId.indexOf('Sites_signales')];
  const ajCol = (t, c, ty, label) => { const p = T.id[T.tableId.indexOf(t)], n = Math.max(...C.id) + 1; for (const k of Object.keys(C)) C[k].push(k === 'id' ? n : k === 'parentId' ? p : k === 'colId' ? c : k === 'label' ? label || c : k === 'type' ? ty : k === 'isFormula' ? false : (typeof C[k][0] === 'number' ? 0 : typeof C[k][0] === 'boolean' ? false : '')); D[t][c] = D[t].id.map(() => null); };
  ajCol('Sites_signales', 'Site_2', 'Ref:Referentiel_sites', 'Site');           // colonne du site créée deux fois
  ajCol('Referentiel_sites', 'Commune', 'Text'); D.Referentiel_sites.Commune = ['Rennes', 'Rennes', 'Rennes', 'Lorient', 'Ivry'];
  ajCol('Referentiel_sites', 'Mots_cles', 'Text'); D.Referentiel_sites.Mots_cles = [null, 'Bâtiment 12', null, null, null];
  const F = D.Formulaires, i = F.Nom.indexOf('Signalements'), conf = JSON.parse(F.Publie[i]);
  conf.blocs[0].reglages.tableau.sites.libre = null; F.Publie[i] = JSON.stringify(conf); if (F.Brouillon) F.Brouillon[i] = JSON.stringify(conf);
  if (autreReferentiel) { const k = C.id.findIndex((_, j) => C.parentId[j] === T.id[T.tableId.indexOf('Referentiel_sites')] && C.colId[j] === 'Etablissement'); C.type[k] = 'Ref:Config'; }
  return doc;
}
(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const page = await browser.newPage({ viewport: { width: 1100, height: 1400 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => d.dismiss());
  const doc = docTerrain(false);
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};window.__OPTS__=${JSON.stringify({ formulaire: 'Signalements' })};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + fs.readFileSync('mock-saisie.js') }));
  await page.goto('file://' + __C.racine + '/v2/saisie/index.html'); await page.waitForTimeout(1500);
  await page.click('#porte-nouveau'); await page.waitForTimeout(400);
  await page.fill('#nom', 'Jean Moulin'); await page.waitForTimeout(700); await page.click('#liste [role=option] >> nth=0'); await page.waitForTimeout(600);
  console.log('CHAMPS D\'UNE LIGNE :', await page.$$eval('.ligne-rep >> nth=0', l => [...l[0].querySelectorAll('.sous-champ:not([hidden]) .etiq')].map(x => x.textContent.trim()).join(' | ')));
  console.log('BANDEAU :', await page.$eval('#questions .bandeau', e => e.textContent).catch(() => '(aucun)'));
  await page.click('[data-action=ajouter]'); await page.waitForTimeout(200);
  const champ = '.ligne-rep:last-child .site-txt';
  await page.focus(champ); await page.waitForTimeout(150);
  const sugg = () => page.$$eval('.ligne-rep:last-child .site-sugg li', l => l.map(x => x.innerText.replace(/\s+/g, ' ').trim()).join(' | '));
  console.log('LISTE (champ vide) :', await sugg());
  await page.fill(champ, 'lorient'); await page.waitForTimeout(150); console.log('« lorient » :', await sugg());
  await page.fill(champ, 'batiment'); await page.waitForTimeout(150); console.log('« batiment » :', await sugg());
  await page.fill(champ, 'Gymnase'); await page.waitForTimeout(150); console.log('« Gymnase » :', await sugg(), '| état :', await page.textContent('.ligne-rep:last-child .site-etat'));
  // administration : contrôle du paramétrage
  for (const autre of [false, true]) {
    const d2 = docTerrain(autre), p2 = await browser.newPage({ viewport: { width: 1300, height: 1400 } });
    p2.on('pageerror', e => console.log('PAGEERROR', e.message));
    await p2.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(d2)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
    await p2.goto('file://' + __C.racine + '/v2/admin/index.html'); await p2.waitForTimeout(1200);
    await p2.click('nav button[data-onglet=formulaires]'); await p2.waitForTimeout(1800);
    await p2.click('[data-bloc="b1"]'); await p2.waitForTimeout(600);
    console.log(`CONTRÔLE${autre ? ' (référentiel des sites relié à une autre table)' : ''} :\n  ` + await p2.$$eval('.controle-sites li', l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim()).join('\n  ')));
  }
  await browser.close();
})();
