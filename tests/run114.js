// Tableau de bord : barres horizontales empilées avec un nombre de valeurs distinctes (établissements distincts par
// région et qualification) — avant, ce calcul forçait les séries côte à côte ; une moyenne reste côte à côte
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docSites } = require('./run78');
(async () => {
  const doc = docSites(), C = doc.__data.Config;
  const bloc = (id, agg, col) => ({ id, type: 'cross', title: id, measure: { agg, col }, rows: { col: 'Nature' }, cols: { col: 'Qualification' }, conds: [], view: 'chart', chart: 'barh', stack: 'stack', labels: 'val', top: 0 });
  const blocs = { name: 'Tableau de bord', filters: [], blocks: [bloc('distinct', 'distinct', 'Etablissement'), bloc('moyenne', 'avg', 'Etablissement')] };
  const i = C.Cle.indexOf('tableau_de_bord');
  if (i >= 0) C.Valeur[i] = JSON.stringify({ publie: blocs, brouillon: blocs });
  else { C.id.push(Math.max(...C.id) + 1); C.Cle.push('tableau_de_bord'); C.Valeur.push(JSON.stringify({ publie: blocs, brouillon: blocs })); if (C.Modifie_le) C.Modifie_le.push(null); }
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const page = await browser.newPage({ viewport: { width: 1300, height: 1100 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};window.__OPTS__={};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + fs.readFileSync('mock-saisie.js') }));
  await page.goto('file://' + __C.racine + '/v2/tableau-de-bord/index.html'); await page.waitForTimeout(1800);
  for (const k of [0, 1]) {
    // barres : rectangles colorés du graphique, regroupés par hauteur (y) — empilées : une seule rangée par ligne du tableau
    const r = await page.$$eval(`[data-card="${k}"] svg rect`, l => l.filter(x => /var\(--s\d|--other/.test(x.getAttribute('fill') || x.style.fill || '') && +x.getAttribute('width') > 0)
      .map(x => ({ y: Math.round(+x.getAttribute('y')), x: Math.round(+x.getAttribute('x')), w: Math.round(+x.getAttribute('width')) })));
    const rangees = [...new Set(r.map(x => x.y))].length;
    console.log(k ? 'MOYENNE :' : `DISTINCTS : ${r.length} morceaux sur ${rangees} rangée(s) | ${rangees < r.length ? 'empilées' : 'côte à côte'}`,
      '| note :', (await page.$$eval(`[data-card="${k}"] .hint`, l => l.map(x => x.textContent).filter(t => /empil|côte à côte/.test(t)).join(' ')) || '(aucune)').slice(0, 220));
  }
  await browser.close();
})();
