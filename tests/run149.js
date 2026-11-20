// 2.62.0-alpha.45 : tableau de bord — couleurs choisies par l'utilisateur (réglage « Couleurs » de chaque graphique) :
// séries, part d'un anneau, graphique à une série, couleurs des choix de Grist (case), frise, teinte des cartes ;
// réglage dans l'atelier (case de couleur, retour à la couleur automatique), image et graphique Word
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const { execSync } = require('child_process');
const { docDurees, publier, API } = require('./run148');

const BLOCS = [
  { id: 'barres', type: 'cross', title: 'Barres', measure: { agg: 'count' }, rows: { col: 'Academie' }, cols: { col: 'Qualification' }, conds: [], view: 'chart', chart: 'barh', top: 20,
    couleurs: { valeurs: { Fermeture: '#123456' } } },
  { id: 'grist', type: 'cross', title: 'Barres, couleurs de Grist', measure: { agg: 'count' }, rows: { col: 'Academie' }, cols: { col: 'Qualification' }, conds: [], view: 'chart', chart: 'barv', top: 20,
    couleurs: { grist: true, valeurs: { Perturbation: '#00aa00' } } },
  { id: 'anneau', type: 'cross', title: 'Anneau', measure: { agg: 'count' }, rows: { col: 'Qualification' }, cols: { col: '' }, conds: [], view: 'chart', chart: 'pie', top: 6,
    couleurs: { valeurs: { RAS: '#aaaaaa' } } },
  { id: 'une', type: 'cross', title: 'Une série', measure: { agg: 'count' }, rows: { col: 'Academie' }, cols: { col: '' }, conds: [], view: 'chart', chart: 'barh', top: 20,
    couleurs: { valeurs: { __serie: '#ff00ff' } } },
  { id: 'frise', type: 'cross', title: 'Frise sans les couleurs de Grist', source: '__Episodes', measure: { agg: 'sum', col: 'Duree' }, rows: { col: 'Etablissement' }, cols: { col: 'Qualification' },
    colSort: 'choices', conds: [], view: 'chart', chart: 'gantt', top: 20, couleurs: { grist: false } },
  { id: 'carte', type: 'cross', title: 'Carte', measure: { agg: 'count' }, rows: { col: 'Academie', grain: 'aca_norm' }, cols: { col: '' }, conds: [], view: 'chart', chart: 'map', top: 0,
    couleurs: { teinte: '#cc3300' } },
];
(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const page = await browser.newPage({ viewport: { width: 1300, height: 1400 }, acceptDownloads: true });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => d.accept());
  const doc = docDurees(); publier(doc, { name: 'Tableau de bord', filters: [], blocks: BLOCS });
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: API(doc) }));
  await page.goto('file://' + __C.racine + '/v2/tableau-de-bord/index.html'); await page.waitForTimeout(1800);
  const couleurs = k => page.$$eval(`[data-card="${k}"] .chart svg [data-tip]`, l => [...new Set(l.map(x => (x.getAttribute('data-tip').split('\u0001')[0].split(' · ').pop()) + '=' + x.getAttribute('fill')))].sort().join(' ; '));
  const legende = k => page.$$eval(`[data-card="${k}"] .legend span`, l => l.map(s => s.textContent.trim().split(' · ')[0] + '=' + s.querySelector('i').style.background).join(' ; '));
  console.log('BARRES (Fermeture choisie) :', await legende(0));
  console.log('GRIST + Perturbation choisie :', await legende(1));
  console.log('ANNEAU (RAS choisi) :', await legende(2));
  console.log('UNE SÉRIE :', await page.$$eval('[data-card="3"] .chart svg [data-tip]', l => [...new Set(l.map(x => x.getAttribute('fill')))].join(' ')));
  console.log('FRISE SANS GRIST :', await legende(4));
  console.log('CARTE, TEINTE :', await legende(5));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#exportWord')]);
  const f = path.join(__C.sorties, 'run149.docx'); await dl.saveAs(f);
  const x = execSync(`unzip -p "${f}" word/charts/chart1.xml`).toString();
  console.log('WORD, GRAPHIQUE 1 :', [...x.matchAll(/<c:tx>.*?<c:v>([^<]+)<\/c:v>.*?<\/c:tx><c:spPr><a:solidFill><a:srgbClr val="([0-9A-F]+)"/g)].map(m => `${m[1]}=${m[2]}`).join(' ; '));
  await page.screenshot({ path: path.join(__C.sorties, 'run149-lecture.png'), fullPage: true });

  // atelier : cases de couleur du bloc choisi, changement, retour à l'automatique
  const doc2 = docDurees(); publier(doc2, { name: 'Tableau de bord', filters: [], blocks: [BLOCS[0], BLOCS[5]] });
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc2)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + fs.readFileSync('mock-saisie.js') + `;grist.getOption=async()=>null;` }));
  await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(1200);
  await page.click('nav button[data-onglet=onglet-tdb]'); await page.waitForTimeout(2500);
  await page.click('[data-card="0"] h2'); await page.waitForTimeout(400);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /^Présentation$/.test(x.textContent.trim())); if (b) b.click(); }); await page.waitForTimeout(400);
  const cases = () => page.$$eval('[data-couleur]', l => l.map(x => `${x.dataset.couleur}=${x.value}`).join(' ; '));
  console.log('ATELIER, CASES :', await cases(), '| GRIST :', await page.$$eval('[data-k="couleurs.grist"]', l => l.length ? (l[0].checked ? 'cochée' : 'décochée') : 'absente'));
  await page.$eval('[data-couleur="RAS"]', el => { el.value = '#0000ff'; el.dispatchEvent(new Event('change', { bubbles: true })); }); await page.waitForTimeout(600);
  console.log('APRÈS RAS = bleu :', await legende(0));
  await page.click('[data-act="coulsuppr"][data-v="Fermeture"]'); await page.waitForTimeout(500);
  console.log('FERMETURE AUTOMATIQUE :', await legende(0));
  await page.check('[data-k="couleurs.grist"]'); await page.waitForTimeout(500);
  console.log('COULEURS DE GRIST COCHÉES :', await legende(0));
  await page.click('[data-act="coulreset"]'); await page.waitForTimeout(500);
  console.log('TOUT AUTOMATIQUE :', await legende(0));
  await page.click('[data-card="1"] h2'); await page.waitForTimeout(400);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /^Présentation$/.test(x.textContent.trim())); if (b) b.click(); }); await page.waitForTimeout(400);
  console.log('CARTE, TEINTE DANS L\'ATELIER :', await page.$eval('[data-k="couleurs.teinte"]', x => x.value));
  await page.waitForTimeout(2500);
  const cfg = await page.evaluate(() => { const C = window.__DOC__.__data.Config, v = JSON.parse(C.Valeur[C.Cle.indexOf('tableau_de_bord')]); const t = (v.tableaux && v.tableaux[0]) || v; return JSON.stringify((t.brouillon || t.publie).blocks.map(b => b.couleurs || null)); });
  console.log('BROUILLON ENREGISTRÉ :', cfg);
  await page.screenshot({ path: path.join(__C.sorties, 'run149-atelier.png'), fullPage: true });
  await browser.close();
})();
