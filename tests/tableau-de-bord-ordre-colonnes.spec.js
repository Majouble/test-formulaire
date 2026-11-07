// Tableau de bord : ordre des colonnes d'un tableau croisé au choix — par valeur (défaut), ordre des choix dans Grist,
// ou ordre personnalisé réglé avec des flèches (gardé dans la configuration, repris par le graphique et les exports)
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docSites } = require('./sites-esr-reprise-dernier-etat.spec');
(async () => {
  const doc = docSites(), C = doc.__data.Config;
  const blocs = { name: 'Tableau de bord', filters: [], blocks: [{ id: 'c1', type: 'cross', title: 'Nature × qualification', measure: { agg: 'count' }, rows: { col: 'Nature' }, cols: { col: 'Qualification' }, conds: [], view: 'both', sort: 'label', top: 20 }] };
  const i = C.Cle.indexOf('tableau_de_bord');
  if (i >= 0) C.Valeur[i] = JSON.stringify({ publie: blocs, brouillon: blocs });
  else { C.id.push(Math.max(...C.id) + 1); C.Cle.push('tableau_de_bord'); C.Valeur.push(JSON.stringify({ publie: blocs, brouillon: blocs })); if (C.Modifie_le) C.Modifie_le.push(null); }
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const page = await browser.newPage({ viewport: { width: 1300, height: 1100 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => d.accept());
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};window.__OPTS__={};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + fs.readFileSync('mock-saisie.js') }));
  await page.goto('file://' + __C.racine + '/v2/tableau-de-bord/index.html'); await page.waitForTimeout(1800);
  const entetes = () => page.$$eval('[data-card="0"] table thead th', l => l.map(t => t.textContent.trim()).slice(1, -1).join(' | '));
  console.log('PAR DÉFAUT (valeur décroissante) :', await entetes());
  // modification : onglet « Tableau de bord » de l'administration (tableau de bord en mode édition), bloc sélectionné
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(1200);
  await page.click('nav button[data-onglet=onglet-tdb]'); await page.waitForTimeout(2500);
  await page.click('[data-card="0"] h2').catch(e => console.log('SÉLECTION ?', e.message.split('\n')[0])); await page.waitForTimeout(800);
  const ouvrir = await page.$$('details:not([open]) > summary'); for (const d of ouvrir) await d.click().catch(() => {});
  const sel = '[data-k="colSort"]';
  console.log('CHOIX PROPOSÉS :', await page.$$eval(`${sel} option`, l => l.map(o => o.textContent).join(' ; ')));
  await page.selectOption(sel, 'choices'); await page.waitForTimeout(800);
  console.log('ORDRE DES CHOIX DANS GRIST :', await entetes());
  await page.selectOption(sel, 'manual'); await page.waitForTimeout(800);
  const liste = () => page.$$eval('.ordre-cols li', l => l.map(x => x.textContent.replace(/[↑↓]/g, '').trim()).join(' › '));
  console.log('ORDRE PERSONNALISÉ, LISTE :', await liste(), '| tableau :', await entetes());
  // « Rassemblement » avancé de deux places, « Blocage total » reculé d'une
  const avancer = async (nom, d) => { const j = await page.$$eval('.ordre-cols li', (l, n) => l.findIndex(x => x.textContent.includes(n)), nom); await page.click(`.ordre-cols li >> nth=${j} >> [data-d="${d}"]`); await page.waitForTimeout(500); };
  await avancer('Rassemblement', -1); await avancer('Rassemblement', -1); await avancer('Blocage total', 1);
  console.log('APRÈS DÉPLACEMENTS :', await liste(), '| tableau :', await entetes());
  await page.waitForTimeout(2500);   // enregistrement du brouillon
  const cfg = await page.evaluate(() => { const C = window.__DOC__.__data.Config, v = JSON.parse(C.Valeur[C.Cle.indexOf('tableau_de_bord')]); const t = (v.tableaux && v.tableaux[0]) || v; const b = (t.brouillon || t.publie).blocks[0]; return `${b.colSort} ${JSON.stringify(b.colOrder)}`; });
  console.log('CONFIGURATION :', cfg);
  console.log('SÉRIES DU GRAPHIQUE :', await page.$$eval('[data-card="0"] .legend span, [data-card="0"] .leg span, [data-card="0"] .legende span', l => l.map(x => x.textContent.trim()).filter(Boolean).join(' | ')) || '(légende non lue)');
  await page.click('[data-act="colreset"]'); await page.waitForTimeout(500);
  console.log('RÉINITIALISÉ :', await liste());
  await browser.close();
})();
