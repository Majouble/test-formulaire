// Extractions (2.62.0-alpha.42) : valeurs répétées des colonnes fusionnées réglables — « distinct » (défaut, comportement
// antérieur : une fois, à sa première date), « changements » (A, B, A), « toutes » (chaque version non vide) ; avec et sans
// préfixe de date, texte et choix multiples ; ancien modèle sans réglage = « distinct » ; réglage gardé au changement de table
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docValidation } = require('./run108');
function doc2() {
  const doc = docValidation(), T = doc._grist_Tables, C = doc._grist_Tables_column, D = doc.__data, ref = T.id[T.tableId.indexOf('Reponses')];
  C.id.push(Math.max(...C.id) + 1); C.parentId.push(ref); C.colId.push('Motifs'); C.type.push('ChoiceList'); C.label.push('Motifs'); C.isFormula.push(false); C.formula.push(''); C.widgetOptions.push(JSON.stringify({ choices: ['Réforme', 'Budget'] })); C.visibleCol.push(0); C.parentPos.push(50);
  const R = D.Reponses, base = R.id.length;
  // établissement de la ligne 1 : quatre versions supplémentaires, une par jour, valeurs A, A, B, (vide), A
  const etab = R.Etablissement[0], d0 = R.Date_faits[0];
  R.Motifs = R.id.map(() => null);
  const ajouts = [['A', ['L', 'Réforme']], ['A', ['L', 'Réforme']], ['B', ['L', 'Réforme', 'Budget']], ['', null], ['A', ['L', 'Réforme']]];
  for (let i = 1; i < base; i++) if (R.Etablissement[i] === etab) R.Description[i] = '';   // autres versions du jeu d'essai neutralisées
  R.Description[0] = 'A'; R.Motifs[0] = ['L', 'Réforme'];
  ajouts.slice(1).forEach(([desc, mot], k) => {
    Object.keys(R).forEach(c => R[c].push(c === 'id' ? base + k + 1 : R[c][0]));
    const i = R.id.length - 1;
    R.Date_faits[i] = d0 + (k + 1) * 86400; R.Description[i] = desc; R.Motifs[i] = mot;
  });
  return { doc, etab };
}
(async () => {
  const { doc, etab } = doc2();
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  let erreurs = 0; const ok = (c, m) => { console.log((c ? 'OK     ' : 'ÉCHEC  ') + m); if (!c) erreurs++; };
  page.on('pageerror', e => { console.log('PAGEERROR', e.message); erreurs++; });
  // ancien modèle de page, enregistré sans le réglage « fusion »
  const opts = { config: { tableId: 'Reponses', cleCol: 'Etablissement', dateCol: 'Date_faits', qualCol: '', idCols: [], fusCols: ['Description', 'Motifs'], calc: {}, gravite: [], exclure: '', prefixeDate: false } };
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js')
    + `;window.__OPTS={};grist.ready=()=>{};grist.onOptions=cb=>setTimeout(()=>cb(${JSON.stringify(opts)}),50);grist.setOptions=o=>{window.__OPTS=JSON.parse(JSON.stringify(o));};grist.docApi.listTables=async()=>window.__DOC__._grist_Tables.tableId.slice();` }));
  await page.goto('file://' + __C.racine + '/v2/extractions/index.html'); await page.waitForTimeout(1500);
  const lire = () => page.evaluate(e => { const o = resultat.lignes.find(l => String(l.cle) === String(e)) || {}; return { d: o.fus_Description, m: o.fus_Motifs }; }, etab);
  const regler = (mode, prefixe) => page.evaluate(([mode, prefixe]) => { const s = document.getElementById('fusion'); s.value = mode; s.dispatchEvent(new Event('change')); config.prefixeDate = prefixe; afficherReglages(); majResultat(); }, [mode, prefixe]);
  const sansDate = s => String(s).split('\n').map(l => l.replace(/^[^:]+ : /, '')).join('|');

  ok(await page.evaluate(() => config.fusion === 'distinct' && document.getElementById('fusion').value === 'distinct'), 'ancien modèle sans réglage : « Une seule fois » (comportement antérieur)');
  let v = await lire();
  ok(v.d === 'A\nB', `distinct, sans date : Description = ${JSON.stringify(v.d)}`);
  ok(v.m === 'Réforme, Budget', `distinct, sans date : Motifs = éléments distincts ${JSON.stringify(v.m)}`);

  await regler('changements', false); v = await lire();
  ok(v.d === 'A\nB\nA', `changements : Description = ${JSON.stringify(v.d)}`);
  ok(v.m === 'Réforme\nRéforme, Budget\nRéforme', `changements : Motifs = ${JSON.stringify(v.m)}`);
  ok(await page.evaluate(() => /diffère de la précédente/.test(document.getElementById('fusionAide').textContent)), 'aide du réglage mise à jour');

  await regler('toutes', false); v = await lire();
  ok(v.d === 'A\nA\nB\nA', `toutes : Description = ${JSON.stringify(v.d)} (vide ignoré)`);
  ok(v.m === 'Réforme\nRéforme\nRéforme, Budget\nRéforme', `toutes : Motifs = ${JSON.stringify(v.m)}`);

  await regler('toutes', true); v = await lire();
  const lignesD = String(v.d).split('\n');
  ok(lignesD.length === 4 && lignesD.every(l => / : /.test(l)) && sansDate(v.d) === 'A|A|B|A', `toutes + dates : ${JSON.stringify(v.d)}`);
  ok(new Set(lignesD.map(l => l.split(' : ')[0])).size === 4, 'toutes + dates : quatre dates différentes');

  await regler('distinct', true); v = await lire();
  ok(sansDate(v.d) === 'A|B', `distinct + dates : ${JSON.stringify(v.d)}`);

  await regler('changements', true); v = await lire();
  ok(sansDate(v.d) === 'A|B|A', `changements + dates : ${JSON.stringify(v.d)}`);

  await page.waitForTimeout(800);
  ok(await page.evaluate(() => window.__OPTS.config && window.__OPTS.config.fusion === 'changements'), 'réglage enregistré dans les options de la page');
  ok(await page.evaluate(async () => { await changerTable('Reponses'); return config.fusion === 'changements'; }), 'réglage gardé au changement de table');
  ok(await page.evaluate(() => { const m = { nom: 't', config: JSON.parse(JSON.stringify(config)) }; return m.config.fusion === 'changements'; }), 'réglage repris dans la configuration des modèles');

  await page.evaluate(() => { document.querySelector('details') && (document.querySelector('details').open = true); });
  const el = await page.$('#fusion'); if (el) { await el.scrollIntoViewIfNeeded(); }
  fs.mkdirSync('sorties', { recursive: true });
  await page.screenshot({ path: 'sorties/run147.png' });
  await browser.close();
  console.log(erreurs ? `${erreurs} échec(s)` : 'run147 : tout est conforme');
  process.exit(erreurs ? 1 : 0);
})();
