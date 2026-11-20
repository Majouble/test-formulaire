// 2.62.0-alpha.43 et .44 : durées de qualification — sources calculées « Épisodes de qualification » et « Durées par
// établissement » (jours avec un signalement seulement, qualification la plus grave du jour, RAS exclu), frise (Gantt),
// typologie par classe de durée, filtre commun appliqué avant le calcul, ajout des blocs dans l'atelier, export Word (image)
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const { execSync } = require('child_process');

// Document d'essai : 4 établissements signalés du 12 au 20/11/2026 (aujourd'hui = 20/11 pour la ligne « aujourd'hui »)
function docDurees() {
  const doc = JSON.parse(fs.readFileSync(__C.donnees + '/doc_saisie2.json'));
  const T = doc._grist_Tables, C = doc._grist_Tables_column, D = doc.__data;
  const tr = T.id[T.tableId.indexOf('Reponses')];
  const ajCol = (c, ty, wo = '') => { const n = Math.max(...C.id) + 1; for (const k of Object.keys(C)) C[k].push(k === 'id' ? n : k === 'parentId' ? tr : k === 'colId' || k === 'label' ? c : k === 'type' ? ty : k === 'widgetOptions' ? wo : k === 'isFormula' ? true : (typeof C[k][0] === 'number' ? 0 : typeof C[k][0] === 'boolean' ? false : '')); };
  const i = C.id.findIndex((_, k) => C.parentId[k] === tr && C.colId[k] === 'Qualification');
  C.widgetOptions[i] = JSON.stringify({ choices: ['Fermeture', 'Fonctionnement dégradé', 'Perturbation', 'RAS'],
    choiceOptions: { Fermeture: { fillColor: '#E24B4A' }, 'Fonctionnement dégradé': { fillColor: '#EF9F27' }, Perturbation: { fillColor: '#FAC775' }, RAS: { fillColor: '#97C459' } } });
  ajCol('Nom_etablissement', 'Any'); ajCol('Commune', 'Any'); ajCol('Academie', 'Any');
  const E = { 1: ['Lycée Jean-Moulin', 'Béziers', 'Montpellier'], 2: ['Collège Les Pins', 'Sète', 'Montpellier'], 3: ['École Pasteur', 'Agde', 'Montpellier'], 4: ['Lycée Chateaubriand', 'Rennes', 'Rennes'] };
  const R = { id: [], Date_faits: [], Cree_le: [], Nature: [], Qualification: [], Description: [], Etablissement: [], Dossier: [], Derniere_version: [], Nom_etablissement: [], Commune: [], Academie: [] };
  const j = (jour, h) => Date.UTC(2026, 10, jour) / 1000 + (h || 0) * 3600;
  const aj = (etab, jour, h, q) => { const id = R.id.length + 1; R.id.push(id); R.Date_faits.push(j(jour)); R.Cree_le.push(j(jour, h)); R.Nature.push('Nouveau signalement');
    R.Qualification.push(q); R.Description.push('…'); R.Etablissement.push(etab); R.Dossier.push(id); R.Derniere_version.push(true);
    R.Nom_etablissement.push(E[etab][0]); R.Commune.push(E[etab][1]); R.Academie.push(E[etab][2]); };
  // 1 : perturbation puis fermeture le 14 (la plus grave compte), fermé le 15 et 16, dégradé 17-18, RAS le 19
  aj(1, 14, 8, 'Perturbation'); aj(1, 14, 15, 'Fermeture'); aj(1, 15, 9, 'Fermeture'); aj(1, 16, 9, 'Fermeture');
  aj(1, 17, 9, 'Fonctionnement dégradé'); aj(1, 18, 9, 'Fonctionnement dégradé'); aj(1, 19, 9, 'RAS');
  // 2 : fermé du 15 au 20, toujours fermé (en cours)
  for (const d of [15, 16, 17, 18, 19, 20]) aj(2, d, 10, 'Fermeture');
  // 3 : dégradé le 16 et le 18 (le 17 sans signalement : deux épisodes d'un jour)
  aj(3, 16, 11, 'Fonctionnement dégradé'); aj(3, 18, 11, 'Fonctionnement dégradé');
  // 4 (autre académie) : perturbation du 12 au 13, puis plus rien
  aj(4, 12, 9, 'Perturbation'); aj(4, 13, 9, 'Perturbation'); aj(4, 13, 18, 'RAS');
  D.Reponses = R;
  return doc;
}
const BLOCS = [
  { id: 'frise', type: 'cross', title: 'Durée des qualifications', source: '__Episodes', measure: { agg: 'sum', col: 'Duree' }, rows: { col: 'Etablissement' }, cols: { col: 'Qualification' }, colSort: 'choices', conds: [], view: 'both', chart: 'gantt', sort: 'value', top: 20 },
  { id: 'typo', type: 'cross', title: 'Épisodes par classe de durée', source: '__Episodes', measure: { agg: 'count' }, rows: { col: 'Qualification' }, cols: { col: 'Classe_duree' }, colSort: 'choices', conds: [], view: 'table', sort: 'value', top: 0 },
  { id: 'jours', type: 'cross', title: 'Jours touchés', source: '__Durees', measure: { agg: 'sum', col: 'Jours_touches' }, rows: { col: 'Etablissement' }, cols: { col: '' }, conds: [], view: 'table', sort: 'value', top: 0 },
  { id: 'cours', type: 'tile', title: 'Établissements encore touchés', source: '__Durees', measure: { agg: 'count' }, conds: [{ col: 'En_cours', op: 'true' }] },
];
function publier(doc, cfg) {
  const C = doc.__data.Config, v = JSON.stringify({ publie: cfg, brouillon: cfg }), i = C.Cle.indexOf('tableau_de_bord');
  if (i >= 0) C.Valeur[i] = v; else { C.id.push(Math.max(...C.id) + 1); C.Cle.push('tableau_de_bord'); C.Valeur.push(v); if (C.Modifie_le) C.Modifie_le.push(null); }
}
const API = doc => `window.__DOC__=${JSON.stringify(doc)};window.__OPTS__={};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + fs.readFileSync('mock-saisie.js');

(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const page = await browser.newPage({ viewport: { width: 1300, height: 1400 }, acceptDownloads: true });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => d.accept());
  await page.addInitScript(() => { const V = Date; const t = V.UTC(2026, 10, 20, 11); window.Date = class extends V { constructor(...a) { super(...(a.length ? a : [t])); } static now() { return t; } }; });
  const ouvrir = async (cfg) => {
    const doc = docDurees(); publier(doc, cfg);
    await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: API(doc) }));
    await page.goto('file://' + __C.racine + '/v2/tableau-de-bord/index.html'); await page.waitForTimeout(1800);
  };
  const lignesTableau = k => page.$$eval(`[data-card="${k}"] table tr`, l => l.map(tr => [...tr.children].map(c => c.textContent.trim()).join(' | ')));

  // 1. lecture : frise, typologie, jours touchés, chiffre clé
  await ouvrir({ name: 'Tableau de bord', filters: [], blocks: BLOCS });
  const frise = await page.evaluate(() => {
    const c = document.querySelector('[data-card="0"]'), svg = c.querySelector('.chart svg');
    const noms = [...svg.querySelectorAll('text[text-anchor="end"] title')].map(t => t.textContent);
    const barres = [...svg.querySelectorAll('rect[data-tip]')].map(r => r.getAttribute('data-tip').replace('\u0001', ' → '));
    return { noms, barres, fleches: svg.querySelectorAll('path[data-tip]').length, axe: [...svg.querySelectorAll('text:not([text-anchor])')].map(t => t.textContent).join(' '),
      aujourdhui: !!svg.querySelector('line[stroke-dasharray]'), legende: [...c.querySelectorAll('.legend span')].map(s => s.textContent.trim()).join(' | '),
      droite: [...svg.querySelectorAll('text.val')].map(t => t.textContent).join(' ; '), couleurs: [...new Set([...svg.querySelectorAll('rect[data-tip]')].map(r => r.getAttribute('fill')))].join(' ') };
  });
  console.log('FRISE, LIGNES :', frise.noms.join(' ; '));
  console.log('FRISE, JOURS À DROITE :', frise.droite);
  console.log('FRISE, BARRES :\n  ' + frise.barres.join('\n  '));
  console.log('FRISE, FLÈCHES « EN COURS » :', frise.fleches, '| AXE :', frise.axe, '| AUJOURD\'HUI :', frise.aujourdhui);
  console.log('FRISE, LÉGENDE :', frise.legende, '| COULEURS DE GRIST :', frise.couleurs);
  console.log('FRISE, TABLEAU :\n  ' + (await lignesTableau(0)).join('\n  '));
  console.log('TYPOLOGIE :\n  ' + (await lignesTableau(1)).join('\n  '));
  console.log('JOURS TOUCHÉS (= jours de mobilisation) :\n  ' + (await lignesTableau(2)).join('\n  '));
  console.log('CHIFFRE CLÉ « ENCORE TOUCHÉS » :', await page.$eval('.tile', t => t.textContent.replace(/\s+/g, ' ').trim()));
  // détail au clic sur une barre
  await page.click('[data-card="0"] .chart svg rect[data-tip]'); await page.waitForTimeout(500);
  console.log('DÉTAIL D\'UNE BARRE :', await page.$eval('#drill', d => d.textContent.replace(/\s+/g, ' ').trim().slice(0, 260)));
  await page.keyboard.press('Escape');
  await page.screenshot({ path: path.join(__C.sorties, 'run148-frise.png'), fullPage: true });

  // 2. export Word : la frise en image
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#exportWord')]);
  const f = path.join(__C.sorties, 'run148.docx'); await dl.saveAs(f);
  console.log('WORD :', execSync(`unzip -l "${f}"`).toString().split('\n').filter(l => /media|charts\/chart/.test(l)).map(l => l.trim().split(/\s+/).pop()).join(', '));

  // 3. filtre commun sur l'académie (appliqué aux signalements avant le calcul) et tri par date de début
  await ouvrir({ name: 'Tableau de bord', filters: [{ col: 'Academie', op: 'eq', val: 'Rennes' }], blocks: [{ ...BLOCS[0], sort: 'debut' }, BLOCS[1]] });
  console.log('FILTRE ACADÉMIE = Rennes, FRISE :', await page.$$eval('[data-card="0"] .chart svg rect[data-tip]', l => l.map(r => r.getAttribute('data-tip').replace('\u0001', ' → ')).join(' ; ')));
  console.log('FILTRE ACADÉMIE = Rennes, TYPOLOGIE :', (await lignesTableau(1)).join(' / '));

  // 3 bis. condition de la frise sur les chiffres de l'établissement recopiés sur ses épisodes (2.62.0-alpha.44)
  await ouvrir({ name: 'Tableau de bord', filters: [], blocks: [{ ...BLOCS[0], conds: [{ col: 'Jours_touches', op: 'ge', val: '3' }] }] });
  console.log('FRISE, JOURS TOUCHÉS ≥ 3 :', await page.$$eval('[data-card="0"] .chart svg text[text-anchor="end"] title', l => l.map(t => t.textContent).join(' ; ')));
  console.log('COLONNES DES CONDITIONS :', await page.$$eval('[data-card="0"] [data-f="col"] option', l => l.map(o => o.textContent).filter(t => /établissement\)/.test(t)).join(' ; ')));

  // 4. atelier : réglages « Durées de qualification », sources proposées, ajout d'une frise et d'une typologie
  const doc = docDurees(); publier(doc, { name: 'Tableau de bord', filters: [], blocks: [] });
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + fs.readFileSync('mock-saisie.js') + `;grist.getOption=async()=>null;` }));
  await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(1200);
  await page.click('nav button[data-onglet=onglet-tdb]'); await page.waitForTimeout(2500);
  const action = async nom => { const ok = await page.evaluate(n => { const b = [...document.querySelectorAll('button')].find(x => x.dataset.act === n || x.dataset.tdb === n); if (b) { b.click(); return true; } return false; }, nom); return ok; };
  console.log('FENÊTRE « AJOUTER » :', await action('st-ajouter') || await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Ajouter un bloc/.test(x.textContent)); if (b) b.click(); return !!b; }));
  await page.waitForTimeout(500);
  console.log('MODÈLES :', await page.$$eval('.st-modele strong', l => l.map(x => x.textContent).join(' ; ')));
  await page.click('.st-modele[data-k="frise"]'); await page.waitForTimeout(800);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Ajouter un bloc/.test(x.textContent)); if (b) b.click(); }); await page.waitForTimeout(400);
  await page.click('.st-modele[data-k="durees"]'); await page.waitForTimeout(800);
  console.log('BLOCS CRÉÉS :', await page.$$eval('.card h2', l => l.map(x => x.textContent).join(' ; ')));
  console.log('FRISE CRÉÉE, BARRES :', await page.$$eval('[data-card="0"] .chart svg rect[data-tip]', l => l.length));
  await page.click('[data-card="0"] h2'); await page.waitForTimeout(500);
  console.log('SOURCES PROPOSÉES :', await page.$$eval('[data-k="source"] option', l => l.map(o => o.textContent).join(' ; ')));
  console.log('PÉRIODE DE LA FRISE :', await page.$$eval('[data-k="frise.debut"], [data-k="frise.fin"]', l => l.map(x => x.options[x.selectedIndex].textContent).join(' ; ')));
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.dataset.act === 'st-reglages' || /Réglages du tableau/.test(x.textContent)); if (b) b.click(); }); await page.waitForTimeout(500);
  console.log('RÉGLAGES « DURÉES DE QUALIFICATION » :', await page.$$eval('[data-ep]', l => l.map(x => `${x.dataset.ep}=${x.tagName === 'SELECT' ? x.options[x.selectedIndex].textContent : x.value}`).join(' ; ')));
  await page.fill('[data-ep="bornes"]', '1, 2, 5'); await page.press('[data-ep="bornes"]', 'Tab'); await page.waitForTimeout(600);
  console.log('CLASSES 1, 2, 5 :', await page.$$eval('[data-card="1"] table thead th', l => l.map(x => x.textContent.trim()).join(' | ')));
  await page.screenshot({ path: path.join(__C.sorties, 'run148-atelier.png'), fullPage: true });
  await browser.close();
})();
