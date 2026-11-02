// 2.46 : logo PRISME en haut à gauche de chaque widget (commun/marque.js) — un seul logo par page, au début de la barre
// du haut ; tableau de bord : posé dans la barre construite par tableau.js, reposé si elle est reconstruite ; pas de
// second logo dans l'éditeur du tableau de bord de l'administration
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docSites } = require('./run78');
const logos = page => page.$$eval('.prisme-logo', l => l.map(e => { const r = e.getBoundingClientRect(), p = e.parentElement;
  return { rempli: !!e.dataset.prismeOk, mot: e.textContent, x: Math.round(r.x), y: Math.round(r.y), h: Math.round(r.height), parent: p.tagName + (p.className ? '.' + String(p.className).split(' ')[0] : '') }; }));
(async () => {
  const doc = docSites(), C = doc.__data.Config;
  const blocs = { name: 'Tableau de bord', filters: [], blocks: [{ id: 'k', type: 'cross', title: 'Signalements', measure: { agg: 'count' }, rows: { col: 'Nature' }, cols: { col: 'Qualification' }, conds: [], view: 'table' }] };
  const i = C.Cle.indexOf('tableau_de_bord');
  if (i >= 0) C.Valeur[i] = JSON.stringify({ publie: blocs, brouillon: blocs });
  else { C.id.push(Math.max(...C.id) + 1); C.Cle.push('tableau_de_bord'); C.Valeur.push(JSON.stringify({ publie: blocs, brouillon: blocs })); if (C.Modifie_le) C.Modifie_le.push(null); }
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const ouvrir = async (chemin, corps, largeur = 1100) => {
    const page = await browser.newPage({ viewport: { width: largeur, height: 700 } });
    page.on('pageerror', e => console.log('PAGEERROR', chemin, e.message));
    await page.clock.setSystemTime(new Date('2026-10-23T10:00:00+02:00'));
    await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: corps }));
    await page.goto('file://' + __C.racine + '/v2/' + chemin); await page.waitForTimeout(1800);
    return page;
  };
  const base = `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js');
  // tableau de bord publié
  let p = await ouvrir('tableau-de-bord/index.html', `window.__DOC__=${JSON.stringify(doc)};window.__OPTS__={};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + fs.readFileSync('mock-saisie.js'));
  console.log('TABLEAU DE BORD :', JSON.stringify(await logos(p)));
  await p.screenshot({ path: __C.sorties + '/run115-tdb.png', clip: { x: 0, y: 0, width: 1100, height: 80 } });
  await p.close();
  // saisie (ordinateur et téléphone)
  const opts = { formulaire: 'Signalements', libelle: 'Alice', perimetre: { Academie: ['Versailles'] } };
  for (const l of [1100, 390]) {
    p = await ouvrir('saisie/index.html', `window.__DOC__=${JSON.stringify(doc)};window.__OPTS__=${JSON.stringify(opts)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + fs.readFileSync('mock-saisie.js'), l);
    console.log(`SAISIE ${l} px :`, JSON.stringify(await logos(p)), '| marque :', await p.$eval('#marque-app', e => e.textContent));
    await p.screenshot({ path: `${__C.sorties}/run115-saisie-${l}.png`, clip: { x: 0, y: 0, width: l, height: 120 } });
    await p.close();
  }
  // administration, onglet Tableau de bord : un seul logo (celui de l'en-tête)
  p = await ouvrir('admin/index.html', base + `;grist.onRecords=()=>{};grist.getOption=async()=>null;`);
  await p.click('nav button[data-onglet=onglet-tdb]'); await p.waitForTimeout(1500);
  console.log('ADMINISTRATION (onglet Tableau de bord) :', JSON.stringify(await logos(p)));
  await p.close();
  await browser.close();
})();
