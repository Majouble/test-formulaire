// 2.62.0-alpha.60 : graphique « Élèves concernés » paramétrable — autre table source (table des sites historisée), ce qu'on
// compte (le site), catégorie propre (qualification du site), valeur et zone lues dans la table visée par la colonne comptée
// (référentiel des sites : étudiants Atlas, académie), lignes « Retrait » écartées, mots affichés ; valeur additionnée sur
// la journée (blessés : somme des lignes du jour) ; réglages dans l'atelier.
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const { publier } = require('./run148');
const { docAnim } = require('./run152');

function ajTable(doc, nom, cols, data) {
  const T = doc._grist_Tables, C = doc._grist_Tables_column, tid = Math.max(...T.id) + 1;
  T.id.push(tid); T.tableId.push(nom);
  cols.forEach(([colId, type, wo]) => { const n = Math.max(...C.id) + 1; C.id.push(n); C.parentId.push(tid); C.colId.push(colId); C.type.push(type); C.label.push(colId); C.isFormula.push(false); C.formula.push(''); C.widgetOptions.push(wo ? JSON.stringify(wo) : ''); });
  doc.__data[nom] = data;
}
function ajColonne(doc, table, colId, type, valeurs) {
  const T = doc._grist_Tables, C = doc._grist_Tables_column, tid = T.id[T.tableId.indexOf(table)], n = Math.max(...C.id) + 1;
  C.id.push(n); C.parentId.push(tid); C.colId.push(colId); C.type.push(type); C.label.push(colId); C.isFormula.push(false); C.formula.push(''); C.widgetOptions.push('');
  doc.__data[table][colId] = valeurs;
}
const j = (jour, h = 0) => Date.UTC(2026, 10, jour) / 1000 + h * 3600;
// référentiel des sites : 4 sites de deux universités, dans deux académies ; étudiants Atlas par site
const SITES = { id: [1, 2, 3, 4], Nom: ['Site de Lyon – Bron', 'Site de Lyon – Berges', 'Site de Grenoble – Saint-Martin', 'Site de Valence – Briffaut'],
  Academie: ['Lyon', 'Lyon', 'Grenoble', 'Grenoble'], Etudiants_Atlas: [12000, 8000, 30000, 2500] };
// table des sites d'un formulaire par site (historisée) : une copie des lignes à chaque version du dossier
//  dossier 1 (Lyon) : le 16, version 1 : Bron bloqué, Berges perturbé ; le 16, version 2 : Bron inchangé, Berges bloqué ;
//                     le 17 : Bron inchangé (copie), Berges retiré (Retrait) ; dossier 2 (Grenoble) : le 17, Saint-Martin et Valence perturbés
const L = { id: [], Dossier: [], Version: [], Ligne_id: [], Mouvement: [], Site: [], Etat_site: [], Date_version: [] };
const ligne = (dos, ver, lig, mvt, site, etat, jour) => { L.id.push(L.id.length + 1); L.Dossier.push(dos); L.Version.push(ver); L.Ligne_id.push(lig); L.Mouvement.push(mvt); L.Site.push(site); L.Etat_site.push(etat); L.Date_version.push(j(jour)); };
ligne(901, 901, 'a', 'Ajout', 1, 'Blocage', 16); ligne(901, 901, 'b', 'Ajout', 2, 'Perturbation', 16);
ligne(901, 902, 'a', 'Inchangée', 1, 'Blocage', 16); ligne(901, 902, 'b', 'Modification', 2, 'Blocage', 16);
ligne(901, 903, 'a', 'Inchangée', 1, 'Blocage', 17); ligne(901, 903, 'b', 'Retrait', 2, 'Blocage', 17);
ligne(904, 904, 'c', 'Ajout', 3, 'Perturbation', 17); ligne(904, 904, 'd', 'Ajout', 4, 'RAS', 17); ligne(904, 905, 'd', 'Modification', 4, 'Perturbation', 17);
function docSites() {
  const doc = docAnim();
  ajTable(doc, 'Referentiel_sites', [['Nom', 'Text'], ['Academie', 'Text'], ['Etudiants_Atlas', 'Int']], JSON.parse(JSON.stringify(SITES)));
  ajTable(doc, 'Tableau_sites', [['Dossier', 'Ref:Reponses'], ['Version', 'Ref:Reponses'], ['Ligne_id', 'Text'], ['Mouvement', 'Choice'], ['Site', 'Ref:Referentiel_sites'],
    ['Etat_site', 'Choice', { choices: ['Blocage', 'Perturbation', 'RAS'], choiceOptions: { Blocage: { fillColor: '#d03b3b' }, Perturbation: { fillColor: '#fab219' } } }], ['Date_version', 'Date']], JSON.parse(JSON.stringify(L)));
  // blessés : deux versions le même jour pour un établissement (2 puis 3 nouveaux blessés), une autre le lendemain
  const R = doc.__data.Reponses, n = R.id.length;
  ajColonne(doc, 'Reponses', 'Nb_blesses', 'Int', R.id.map(() => 0));
  const k = R.Date_faits.findIndex(t => t === j(16)), aj = (h, nb) => { const i = R.id.length + 1; for (const c of Object.keys(R)) R[c].push(c === 'id' || c === 'Dossier' ? i : c === 'Nb_blesses' ? nb : c === 'Cree_le' ? j(16, h) : R[c][k]); };
  R.Nb_blesses[k] = 2; aj(14, 3);
  return doc;
}
const API = doc => `window.__DOC__=${JSON.stringify(doc)};window.__OPTS__={};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + fs.readFileSync('mock-saisie.js');
const BLOCS = [
  { id: 'sites', type: 'cross', title: 'Sites concernés', source: 'Tableau_sites', measure: { agg: 'count' }, rows: { col: 'Site' }, cols: { col: 'Date_version', grain: 'jour' },
    conds: [], view: 'chart', chart: 'eleves', top: 0, eleves: { mesure: 'fusion' }, anim: {} },
  { id: 'blesses', type: 'cross', title: 'Blessés', measure: { agg: 'count' }, rows: { col: 'Academie', grain: 'aca_norm' }, cols: { col: 'Date_faits', grain: 'jour' },
    conds: [], view: 'chart', chart: 'eleves', top: 0, eleves: { valeur: 'Nb_blesses', agg: 'somme', categorie: '-' }, anim: {} },
  { id: 'blessesmax', type: 'cross', title: 'Blessés (plus grande valeur)', measure: { agg: 'count' }, rows: { col: 'Academie', grain: 'aca_norm' }, cols: { col: 'Date_faits', grain: 'jour' },
    conds: [], view: 'chart', chart: 'eleves', top: 0, eleves: { valeur: 'Nb_blesses', categorie: '-' }, anim: {} },
];

(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const page = await browser.newPage({ viewport: { width: 1300, height: 1500 }, acceptDownloads: true });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => d.accept());
  const doc = docSites(); publier(doc, { name: 'Tableau de bord', filters: [], blocks: BLOCS });
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: API(doc) }));
  await page.goto('file://' + __C.racine + '/v2/tableau-de-bord/index.html'); await page.waitForTimeout(2500);
  const lire = k => page.evaluate(k => { const c = document.querySelector(`[data-card="${k}"]`); if (!c || !c.querySelector('.el-total')) return { absent: c ? c.querySelector('.chart, .empty') && (c.querySelector('.chart, .empty').textContent || '').trim().slice(0, 300) : 'bloc absent' };
    const t = c.querySelector('.el-tableau');
    return { date: c.querySelector('.anim-date').textContent, dates: Number(c.querySelector('.anim-curseur').max) + 1, total: c.querySelector('.el-total').textContent, sous: c.querySelector('.el-sous').textContent,
      parts: [...c.querySelectorAll('.el-parts span')].map(s => s.textContent.trim()).join(' | '),
      tableau: t ? [...t.querySelectorAll('[data-tn^="e"]')].map(n => { const q = n.dataset.tn.slice(1); return `${t.querySelectorAll('text title')[q].textContent} ${n.textContent} / ${t.querySelector(`[data-tn="p${q}"]`).textContent}`; }).join(' ; ') + ` | en-têtes : ${[...t.querySelectorAll('text')].slice(0, 2).map(x => x.textContent).join(', ')}` : '',
      zones: [...c.querySelectorAll('[data-zsel]')].map(e => e.getAttribute('data-tip').replace('\u0001', ' → ')).filter(x => !/→ 0 /.test(x)).join(' ; '),
      histos: [...c.querySelectorAll('.anim-histo')].map(h => h.querySelector('text:last-of-type').textContent).join(' + '),
      notes: [...c.querySelectorAll('.chart .hint')].map(p => p.textContent).join(' / ') }; }, k);
  const aller = async (k, p) => { await page.$eval(`[data-card="${k}"] .anim-curseur`, (el, p) => { el.value = p; el.dispatchEvent(new Event('input', { bubbles: true })); }, p); await page.waitForTimeout(700); };

  // 1. sites : 16/11 — Bron (Blocage, 12 000), Berges (Blocage au plus grave du jour, 8 000) ; 17/11 — Bron (Blocage, copie inchangée),
  //    Berges retiré (non compté), Saint-Martin et Valence (Perturbation ; Valence passé de RAS à Perturbation)
  let S = await lire(0);
  console.log('SITES :', S.absent || `${S.dates} dates | ${S.date} | ${S.total} ${S.sous}\n   tableau : ${S.tableau}\n   zones : ${S.zones}\n   histogrammes : ${S.histos}\n   ${S.notes}`);
  await aller(0, 0); S = await lire(0);
  console.log('SITES, 16/11 :', S.total, S.sous, '| attendu : 2 sites, 20 000 étudiants |', S.tableau, '|', S.zones);
  await aller(0, 1); S = await lire(0);
  console.log('SITES, 17/11 :', S.total, S.sous, '| attendu : 3 sites (Berges retiré), 44 500 étudiants |', S.tableau, '|', S.zones);
  await page.locator('[data-card="0"] .chart').screenshot({ path: path.join(__C.sorties, 'run154-sites.png') });
  // 2. blessés : 16/11 — 2 + 3 dans le même établissement (somme), 2 autres jours sans blessé
  const dateBlesses = async k => { const n = await page.$eval(`[data-card="${k}"] .anim-curseur`, el => Number(el.max)); for (let p = 0; p <= n; p++) { await aller(k, p); const x = await lire(k); if (/16\/11/.test(x.date)) return x; } };
  let B = await lire(1); console.log('BLESSÉS (somme), DÉPART :', B.absent || `${B.date} | ${B.total} ${B.sous}`);
  B = await dateBlesses(1); console.log('BLESSÉS (somme), 16/11 :', B.total, B.sous, '| attendu 5 |', B.parts, '|', B.zones, '|', B.histos);
  B = await dateBlesses(2); console.log('BLESSÉS (plus grande valeur), 16/11 :', B.total, '| attendu 3');

  // 3. atelier : réglages proposés pour la table des sites (valeur et zone lues dans le référentiel des sites)
  const doc2 = docSites(); publier(doc2, { name: 'Tableau de bord', filters: [], blocks: [BLOCS[0]] });
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc2)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + fs.readFileSync('mock-saisie.js') + `;grist.getOption=async()=>null;` }));
  await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(1200);
  await page.click('nav button[data-onglet=onglet-tdb]'); await page.waitForTimeout(3000);
  await page.click('[data-card="0"] h2'); await page.waitForTimeout(400);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /^Présentation$/.test(x.textContent.trim())); if (b) b.click(); }); await page.waitForTimeout(400);
  const reg = () => page.$$eval('.studio [data-k^="eleves."]', l => l.map(x => `${x.dataset.k.slice(7)}=${x.tagName === 'SELECT' ? x.options[x.selectedIndex].text : x.value || x.placeholder}`).join(' ; '));
  console.log('ATELIER, SITES :', await reg());
  console.log('ATELIER, CHOIX DE LA VALEUR :', await page.$$eval('.studio [data-k="eleves.valeur"] option', l => l.map(o => o.text).join(' | ')));
  await page.fill('.studio [data-k="eleves.motValeur"]', 'étudiants touchés'); await page.press('.studio [data-k="eleves.motValeur"]', 'Tab'); await page.waitForTimeout(800);
  S = await lire(0); console.log('ATELIER, MOT CHANGÉ :', S.sous);
  await page.selectOption('.studio [data-k="eleves.categorie"]', '-'); await page.waitForTimeout(800);
  S = await lire(0); console.log('ATELIER, SANS CATÉGORIE :', S.total, S.sous, '|', S.tableau);
  await page.waitForTimeout(2500);
  const cfg = await page.evaluate(() => { const C = window.__DOC__.__data.Config, v = JSON.parse(C.Valeur[C.Cle.indexOf('tableau_de_bord')]); const t = (v.tableaux && v.tableaux[0]) || v; return JSON.stringify((t.brouillon || t.publie).blocks[0].eleves); });
  console.log('BROUILLON ENREGISTRÉ :', cfg);
  await page.screenshot({ path: path.join(__C.sorties, 'run154-atelier.png'), fullPage: true });
  await browser.close();
})();
