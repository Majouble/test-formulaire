// Formulaire par site (2.62) : un site est proposé à tous ses occupants (colonne Occupants du référentiel des sites,
// liste de références vers les établissements et composantes), et le site unique d'un établissement est présélectionné
// dans un nouveau dossier (tableau des sites vide, note « Seul site… »).
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docSites } = require('./run78');
function doc() {
  const d = docSites(), T = d._grist_Tables, C = d._grist_Tables_column, S = d.__data.Referentiel_sites;
  const tr = T.id[T.tableId.indexOf('Referentiel_sites')], n = Math.max(...C.id) + 1;
  for (const k of Object.keys(C)) C[k].push(k === 'id' ? n : k === 'parentId' ? tr : k === 'colId' || k === 'label' ? 'Occupants' : k === 'type' ? 'RefList:Etablissements' : k === 'isFormula' ? false : (typeof C[k][0] === 'number' ? 0 : typeof C[k][0] === 'boolean' ? false : ''));
  S.Occupants = [null, ['L', 3], null, null, ['L', 1]];   // S2 (Campus Beaulieu, Jean Moulin) occupé aussi par Jules Ferry ; S5 (Campus Ivry, Romain Rolland) par Jean Moulin
  return d;
}
async function nouveau(browser, nom) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1400 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => d.dismiss());
  const opts = { formulaire: 'Signalements', libelle: 'Alice', perimetre: { Academie: ['Versailles', 'Créteil'] } };
  await page.clock.setSystemTime(new Date('2026-10-23T10:00:00+02:00'));
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc())};window.__OPTS__=${JSON.stringify(opts)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + fs.readFileSync('mock-saisie.js') }));
  await page.goto('file://' + __C.racine + '/v2/saisie/index.html'); await page.waitForTimeout(1500);
  await page.click('#porte-nouveau'); await page.waitForTimeout(400);
  await page.fill('#nom', nom); await page.waitForTimeout(700); await page.click('#liste [role=option] >> nth=0'); await page.waitForTimeout(800);
  return page;
}
const lignes = page => page.evaluate(() => { const c = controleursTableau('q')[0]; return JSON.stringify(c.lignes.filter(l => !c.ligneVide(l)).map(l => ({ site: l.valeurs.Site, repris: !!l._repris }))); });
const proposes = page => page.evaluate(() => { const c = controleursTableau('q')[0], d = c.sousDefs.find(x => x.colId === 'Site'); return c.sitesProposables(d).map(o => o.libelle).join(' | '); });
(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });
  for (const nom of ['Romain Rolland', 'Jules Ferry', 'Jean Moulin']) {
    const page = await nouveau(browser, nom);
    console.log(`${nom.toUpperCase()} — sites proposés :`, await proposes(page));
    console.log('   lignes :', await lignes(page), '| note :', (await page.evaluate(() => controleursTableau('q')[0].noteAuto || '') || '—'));
    console.log('   champ :', await page.$$eval('.ligne-rep .site-txt', l => l.map(x => x.value).join(' | ')));
    await page.close();
  }
  await browser.close();
})();
