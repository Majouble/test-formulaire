// 2.43 : veille météo — onglet Veille (carte, synthèse par phénomène, établissements et élèves concernés, campagne pré-ciblée,
// réglages, relais n8n préréglé), relais n8n exécuté hors n8n avec Météo-France, Grist et Tchap simulés (lecture de la carte,
// littoral, réécriture de la table, journal, alerte au passage du seuil), bandeau de vigilance dans la saisie d'un agent
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docValidation } = require('./validation-et-campagnes.spec');

const M = Math.floor(Date.now() / 1000);
function ajouterTable(doc, tid, cols, lignes) {
  const T = doc._grist_Tables, C = doc._grist_Tables_column, ref = Math.max(...T.id) + 1; T.id.push(ref); T.tableId.push(tid);
  cols.forEach(([colId, type, wo], k) => { C.id.push(Math.max(...C.id) + 1); C.parentId.push(ref); C.colId.push(colId); C.type.push(type); C.label.push(colId); C.isFormula.push(false); C.formula.push(''); C.widgetOptions.push(wo ? JSON.stringify(wo) : ''); C.visibleCol.push(0); C.parentPos.push(k); });
  const t = { id: lignes.map((_, i) => i + 1) }; cols.forEach(([c], k) => { t[c] = lignes.map(l => l[k] ?? null); }); doc.__data[tid] = t;
}
function ajouterColonne(doc, tid, colId, type, valeurs) {
  const T = doc._grist_Tables, C = doc._grist_Tables_column, ref = T.id[T.tableId.indexOf(tid)];
  C.id.push(Math.max(...C.id) + 1); C.parentId.push(ref); C.colId.push(colId); C.type.push(type); C.label.push(colId); C.isFormula.push(false); C.formula.push(''); C.widgetOptions.push(''); C.visibleCol.push(0); C.parentPos.push(30);
  doc.__data[tid][colId] = valeurs;
}
const COLS_V = [['Departement_code', 'Text'], ['Departement', 'Text'], ['Phenomene', 'Text'], ['Couleur', 'Choice'], ['Niveau', 'Int'], ['Echeance', 'Choice'], ['Debut', 'DateTime:Europe/Paris'], ['Fin', 'DateTime:Europe/Paris'], ['Mise_a_jour', 'DateTime:Europe/Paris'], ['Littoral', 'Bool']];
const COLS_J = [['Le', 'DateTime:Europe/Paris'], ['Departement_code', 'Text'], ['Departement', 'Text'], ['Phenomene', 'Text'], ['Echeance', 'Choice'], ['Avant', 'Choice'], ['Apres', 'Choice'], ['Niveau', 'Int']];
function docVeille() {
  const doc = docValidation();
  ajouterColonne(doc, 'Etablissements', 'Effectif', 'Int', [600, 1350, 420, 210]);
  ajouterTable(doc, 'Vigilances', COLS_V, [
    ['78', 'Yvelines', 'Vent violent', 'Orange', 3, "Aujourd'hui", M - 3600, M + 20000, M - 900, false],
    ['91', 'Essonne', 'Vent violent', 'Orange', 3, "Aujourd'hui", M - 3600, M + 20000, M - 900, false],
    ['78', 'Yvelines', 'Orages', 'Jaune', 2, "Aujourd'hui", M - 3600, M + 20000, M - 900, false],
    ['94', 'Val-de-Marne', 'Crues', 'Rouge', 4, 'Demain', M + 30000, M + 116400, M - 900, false],
    ['13', 'Bouches-du-Rhône', 'Canicule', 'Orange', 3, "Aujourd'hui", M - 3600, M + 20000, M - 900, false]]);
  ajouterTable(doc, 'Vigilances_journal', COLS_J, [[M - 900, '94', 'Val-de-Marne', 'Crues', 'Demain', 'Orange', 'Rouge', 4], [M - 4000, '78', 'Yvelines', 'Vent violent', "Aujourd'hui", 'Jaune', 'Orange', 3]]);
  const g = JSON.parse(doc.__data.Config.Valeur[0]); g.vigilances = 'Vigilances'; g.vigilances_journal = 'Vigilances_journal'; doc.__data.Config.Valeur[0] = JSON.stringify(g);
  return doc;
}
const texte = async (page, sel) => (await page.$eval(sel, e => e.innerText)).replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();

// Exécute le code du nœud n8n avec des services simulés
async function executerRelais(jsCode, etatGrist) {
  const appels = [], update = '2026-11-02T06:00:00Z';
  const carte = { product: { update_time: update, periods: [
    { echeance: 'J', begin_validity_time: '2026-11-02T00:00:00Z', end_validity_time: '2026-11-03T00:00:00Z', timelaps: { domain_ids: [
      { domain_id: '78', max_color_id: 3, phenomenon_items: [{ phenomenon_id: '1', phenomenon_max_color_id: 3 }, { phenomenon_id: '3', phenomenon_max_color_id: 1 }] },
      { domain_id: '91', max_color_id: 3, phenomenon_items: [{ phenomenon_id: '1', phenomenon_max_color_id: 3 }] },
      { domain_id: '17', max_color_id: 2, phenomenon_items: [{ phenomenon_id: '1', phenomenon_max_color_id: 2 }] },
      { domain_id: '1710', max_color_id: 3, phenomenon_items: [{ phenomenon_id: '9', phenomenon_max_color_id: 3 }] },
      { domain_id: '75', max_color_id: 1, phenomenon_items: [{ phenomenon_id: '1', phenomenon_max_color_id: 1 }] },
      { domain_id: 'FRA', max_color_id: 3, phenomenon_items: [] }] } },
    { echeance: 'J1', begin_validity_time: '2026-11-03T00:00:00Z', end_validity_time: '2026-11-04T00:00:00Z', timelaps: { domain_ids: [
      { domain_id: '94', max_color_id: 4, phenomenon_items: [{ phenomenon_id: '4', phenomenon_max_color_id: 4 }] }] } }] } };
  const helpers = { httpRequest: async o => {
    appels.push(`${o.method || 'GET'} ${o.url.replace(/^https?:\/\/[^/]+/, '')}${o.headers && o.headers.apikey ? ` [apikey ${o.headers.apikey}]` : ''}`);
    if (/meteofrance/.test(o.url)) return carte;
    if (/\/tables\/Vigilances\/records$/.test(o.url)) return { records: etatGrist.map((f, i) => ({ id: i + 1, fields: f })) };
    if (/\/apply$/.test(o.url)) { appels.push('   actions : ' + o.body.map(a => `${a[0]} ${a[1]} (${(a[2] || []).length})`).join(', ')); return { retValues: [] }; }
    if (/\/sql\?/.test(o.url)) return { records: [{ fields: { d: 'Yvelines', n: 2, e: 1950 } }, { fields: { d: 'Essonne', n: 1, e: 420 } }, { fields: { d: 'Val-de-Marne', n: 1, e: 210 } }] };
    if (/_matrix/.test(o.url)) { appels.push('   tchap : ' + o.body.body.replace(/\n/g, ' | ')); return {}; }
    throw new Error('url inattendue ' + o.url);
  } };
  const regle = jsCode.replace("const CLE_METEOFRANCE = 'cle-api-meteofrance';", "const CLE_METEOFRANCE = 'CLE-MF';").replace("const TCHAP_SERVEUR = '';", "const TCHAP_SERVEUR = 'https://matrix.tchap.test';")
    .replace("const TCHAP_JETON = '';", "const TCHAP_JETON = 'jeton';").replace("const TCHAP_SALON = '';", "const TCHAP_SALON = '!salon:tchap.test';");
  const fn = new (Object.getPrototypeOf(async function () {}).constructor)(regle);
  const sortie = await fn.call({ helpers });
  return { appels, sortie: sortie[0].json };
}

(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const page = await browser.newPage({ viewport: { width: 1300, height: 1700 }, acceptDownloads: true });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => d.accept());
  const relaisJson = fs.readFileSync(__C.racine + '/v2/veille/relais-vigilance-n8n.json', 'utf8');
  await page.route('**/veille/relais-vigilance-n8n.json', r => r.fulfill({ contentType: 'application/json', body: relaisJson }));
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(docVeille())};` + fs.readFileSync('mock.js')
    + `;grist.onRecords=()=>{};grist.getOption=async()=>null;grist.docApi.getAccessToken=async()=>({token:'t',baseUrl:'https://grist.test/o/crise/api/docs/AbCdEfGh1234'});` }));
  await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(1500);
  await page.click('nav button[data-onglet=veille]'); await page.waitForTimeout(1800);
  const t = await texte(page, '#veille');
  console.log('VEILLE :', t.split('\n').slice(0, 14).join(' | '));
  await page.screenshot({ path: __C.sorties + '/veille-110.png', fullPage: true });
  console.log('CARTE : départements colorés', await page.$$eval('#veille .vg-carte path[fill="#FFB82B"], #veille .vg-carte path[fill="#FFF600"], #veille .vg-carte path[fill="#CC0000"]', l => [...new Set(l.map(p => p.dataset.dep))].join(',')));
  await page.click('#veille [role=tab][data-ech="Demain"]'); await page.waitForTimeout(500);
  console.log('DEMAIN :', (await texte(page, '#veille section.carte')).split('\n').slice(0, 9).join(' | '));
  // campagne pré-ciblée sur les départements de demain
  await page.click('#veille [data-vg=campagne]'); await page.waitForTimeout(2500);
  console.log('ONGLET :', await page.$eval('nav button[aria-selected=true]', b => b.textContent), '| PROJET :', (await texte(page, '#cp-projet')).split('\n').slice(0, 2).join(' | '),
    '| nom :', await page.inputValue('#cp-nom'), '| mode :', await page.inputValue('#cp-mode'), '| fin :', await page.inputValue('#cp-fin'));
  // réglages : seuil jaune
  await page.click('nav button[data-onglet=veille]'); await page.waitForTimeout(1500);
  await page.selectOption('#vg-seuil', '2'); await page.click('#veille [data-vg=reglages]'); await page.waitForTimeout(1200);
  console.log('RÉGLAGES :', await page.evaluate(() => { const C = window.__DOC__.__data.Config; return C.Valeur[C.Cle.indexOf('veille')].replace(/\s+/g, ' '); }), '|',
    (await texte(page, '#veille section.carte h2')));
  // relais préréglé
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#veille [data-vg=relais]')]);
  const w = JSON.parse(fs.readFileSync(await dl.path(), 'utf8')), code = w.nodes.find(n => n.type === 'n8n-nodes-base.code').parameters.jsCode;
  console.log('RELAIS :', dl.suggestedFilename(), '|', ['API_GRIST', 'DOC', 'REFERENTIEL', 'COL_DEP', 'COL_EFFECTIF', 'DEPARTEMENTS', 'SEUIL_ALERTE'].map(k => (code.match(new RegExp(`const ${k} = '([^']*)'`)) || [])[0]).join(' ; '),
    '| DEP_NOMS :', Object.keys(JSON.parse(code.match(/const DEP_NOMS = (\{[^\n]*\});/)[1])).length, 'départements');
  await page.close();

  // relais exécuté : Yvelines déjà orange (inchangé), Bouches-du-Rhône sorti, Essonne et littoral 17 nouveaux, crues rouges demain
  const regleDeps = code.replace(/const DEPARTEMENTS = '[^']*';/, "const DEPARTEMENTS = '';").replace("const SEUIL_ALERTE = '2';", "const SEUIL_ALERTE = '3';");
  const r = await executerRelais(regleDeps, [
    { Departement_code: '78', Departement: 'Yvelines', Phenomene: 'Vent violent', Echeance: "Aujourd'hui", Niveau: 3, Mise_a_jour: 1 },
    { Departement_code: '13', Departement: 'Bouches-du-Rhône', Phenomene: 'Canicule', Echeance: "Aujourd'hui", Niveau: 3, Mise_a_jour: 1 }]);
  console.log('RELAIS EXÉCUTÉ :\n   ' + r.appels.join('\n   '));
  console.log('SORTIE :', JSON.stringify({ ...r.sortie, alerte: r.sortie.alerte && { envoyee: r.sortie.alerte.envoyee } }));
  const r2 = await executerRelais(regleDeps.replace("const DEPARTEMENTS = '';", "const DEPARTEMENTS = '78,91,94';"), [
    { Departement_code: '78', Departement: 'Yvelines', Phenomene: 'Vent violent', Echeance: "Aujourd'hui", Niveau: 3, Mise_a_jour: Date.parse('2026-11-02T06:00:00Z') / 1000 },
    { Departement_code: '91', Departement: 'Essonne', Phenomene: 'Vent violent', Echeance: "Aujourd'hui", Niveau: 3, Mise_a_jour: Date.parse('2026-11-02T06:00:00Z') / 1000 },
    { Departement_code: '94', Departement: 'Val-de-Marne', Phenomene: 'Crues', Echeance: 'Demain', Niveau: 4, Mise_a_jour: Date.parse('2026-11-02T06:00:00Z') / 1000 }]);
  console.log('SECOND PASSAGE (rien de nouveau, départements du référentiel) :', r2.appels.filter(a => !/meteofrance|records$/.test(a)).join(' | ') || 'aucune écriture', JSON.stringify(r2.sortie));

  // saisie : bandeau de veille pour un agent
  const ps = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  ps.on('pageerror', e => console.log('PAGEERROR (saisie)', e.message));
  await ps.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(docVeille())};window.__OPTS__=${JSON.stringify({ formulaire: 'Signalements' })};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + fs.readFileSync('mock-saisie.js') }));
  await ps.goto('file://' + __C.racine + '/v2/saisie/index.html'); await ps.waitForTimeout(2500);
  console.log('SAISIE, BANDEAU :', await texte(ps, '#bandeau-veille'));
  await ps.screenshot({ path: __C.sorties + '/saisie-veille-110.png' });
  await browser.close();
})();
