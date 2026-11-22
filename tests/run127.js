// Référentiel ESR v8 : import du classeur v7 puis du classeur v8 ; nouvelles colonnes (Nom court, Ministère de contrat ou
// de reconnaissance, Périmètre, Statut juridique, Domaine ; sites : Actif, Nom d'usage, Voie, Numéro, Occupants,
// Remplacé par), site fusionné (références reportées sur le site qui le remplace), tables annexes (Liaisons_sites,
// Unites_Atlas, Confirmations_sites, Effectifs), colonnes formules ; réimport sans doublon.
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docEsr, CLASSEUR } = require('./run81');
const V7 = __C.donnees + '/referentiel_esr_v7_essai.xlsx', V8 = __C.donnees + '/referentiel_esr_v8_essai.xlsx';
async function ouvrir(browser, doc) {
  const page = await browser.newPage({ viewport: { width: 1300, height: 1800 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => { console.log('CONFIRMATION :', d.message().split('\n')[0]); d.accept(); });
  await page.route('**/jszip.min.js', r => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(require.resolve('jszip/dist/jszip.min.js')) }));
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};window.__FORMULES_STRICTES__=true;` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(1200);
  await page.click('nav button[data-onglet=referentiel]'); await page.waitForTimeout(1200);
  return page;
}
async function importer(page, fichier) {
  await page.setInputFiles('#esr-fichier', fichier); await page.waitForTimeout(2500);
  const bilan = await page.textContent('#ref-esr');
  await page.click('#esr-importer'); await page.waitForTimeout(4000);
  return { bilan, statut: (await page.textContent('#esr-statut')).trim() };
}
const etat = page => page.evaluate(() => {
  const DOC = window.__DOC__, D = DOC.__data, E = D.Etablissements, S = D.Referentiel_sites, C = DOC._grist_Tables_column, T = DOC._grist_Tables;
  const eid = r => E.Etablissement_ID[E.id.indexOf(r)] || '?', sid = r => S.Site_id[S.id.indexOf(r)] || '?';
  const iS = k => S.Site_id.indexOf(k), iE = k => E.Etablissement_ID.indexOf(k);
  const cols = t => { const r = T.id[T.tableId.indexOf(t)]; return C.colId.map((c, i) => C.parentId[i] === r ? c + (C.isFormula[i] ? '(f)' : '') + ':' + C.type[i] : '').filter(Boolean); };
  const out = [];
  out.push('ETAB-0011 : ' + (iE('ETAB-0011') < 0 ? 'absent' : ['Nom_court', 'Ministere_contrat', 'Perimetre', 'Statut_juridique', 'Domaine'].map(c => `${c}=${E[c] ? E[c][iE('ETAB-0011')] : '∅'}`).join(' ')));
  out.push('ETAB-0001 statut juridique : ' + (E.Statut_juridique ? E.Statut_juridique[iE('ETAB-0001')] : '∅'));
  out.push('SITE-0004 occupants : ' + (S.Occupants ? JSON.stringify((S.Occupants[iS('SITE-0004')] || []).slice(1).map(eid)) : '∅') + ' ; nom d\'usage=' + (S.Nom_usage ? S.Nom_usage[iS('SITE-0004')] : '∅'));
  out.push('SITE-0008 : statut=' + S.Statut[iS('SITE-0008')] + ' actif=' + S.Actif[iS('SITE-0008')] + ' remplacé par=' + (S.Remplace_par ? sid(S.Remplace_par[iS('SITE-0008')]) : '∅'));
  out.push('SITE-0001 : voie=' + (S.Voie ? S.Voie[iS('SITE-0001')] : '∅') + ' numéro=' + (S.Numero ? S.Numero[iS('SITE-0001')] : '∅') + ' ; SITE-0010 actif=' + (iS('SITE-0010') < 0 ? 'absent' : S.Actif[iS('SITE-0010')]));
  for (const t of ['Liaisons_sites', 'Unites_Atlas', 'Confirmations_sites', 'Effectifs']) {
    const d = D[t]; if (!d) { out.push(`${t} : absente`); continue; }
    const ligne = i => Object.keys(d).filter(c => c !== 'id' && Array.isArray(d[c])).map(c => { const v = d[c][i]; const ty = (C.type[C.colId.findIndex((x, j) => x === c && C.parentId[j] === T.id[T.tableId.indexOf(t)])] || ''); return `${c}=${ty === 'Ref:Etablissements' ? eid(v) : ty === 'Ref:Referentiel_sites' ? sid(v) : v}`; }).join(',');
    out.push(`${t} (${d.id.length}) : ` + d.id.map((_, i) => ligne(i)).join(' | '));
  }
  out.push('FORMULES : ' + ['Etablissements', 'Referentiel_sites', 'Unites_Atlas'].map(t => t + ' → ' + cols(t).filter(c => c.includes('(f)')).join(' ')).join(' ; '));
  const f = (t, c) => { const r = T.id[T.tableId.indexOf(t)], i = C.colId.findIndex((x, j) => x === c && C.parentId[j] === r); return i < 0 ? '(absente)' : C.formula[i]; };
  out.push('NOM CALCULÉ :\n' + f('Referentiel_sites', 'Nom_calcule'));
  out.push('LIBELLÉ :\n' + f('Referentiel_sites', 'Libelle'));
  out.push('EFFECTIF ÉTAB :\n' + f('Etablissements', 'Effectif_Atlas'));
  out.push('COLONNES SITES : ' + cols('Referentiel_sites').join(' '));
  return out.join('\n   ');
});
(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const page = await ouvrir(browser, docEsr());
  await importer(page, CLASSEUR);
  console.log('V7 :', (await importer(page, V7)).statut);
  // une correspondance (libellé saisi → site) sur le site ESIR Beaulieu, qui sera fusionné dans SITE-0001
  await page.evaluate(async () => {
    const D = window.__DOC__.__data, S = D.Referentiel_sites, E = D.Etablissements;
    const s = S.id[S.Site_id.indexOf('SITE-0008')], e = E.id[E.Etablissement_ID.indexOf('ETAB-0001')];
    await grist.docApi.applyUserActions([['AddRecord', 'Sites_correspondances', null, { Etablissement: e, Libelle: 'ESIR bat 41', Site: s, Statut: 'Validé' }]]);
  });
  const r8 = await importer(page, V8);
  for (const re of [/Occupants\s*\d[^S]*/, /Sites fusionnés ou fermés[^L]*?site\(s\)[^(]*/, /reporter les \d+ référence\(s\) \(signalements, sièges/, /Tables annexes[\s\S]*?Colonnes formules/]) { const m = r8.bilan.match(re); console.log('BILAN v8 :', m ? m[0].replace(/\s+/g, ' ').trim().slice(0, 600) : `(absent : ${re})`); }
  console.log('STATUT v8 :', r8.statut);
  console.log('APRÈS v8 :\n  ', await etat(page));
  console.log('CORRESPONDANCE :', await page.evaluate(() => { const D = window.__DOC__.__data, A = D.Sites_correspondances, S = D.Referentiel_sites, i = A.Libelle.indexOf('ESIR bat 41'); return S.Site_id[S.id.indexOf(A.Site[i])]; }));
  // réimport : rien à ajouter
  const r9 = await importer(page, V8);
  console.log('RÉIMPORT :', r9.statut);
  await page.screenshot({ path: __C.sorties + '/run127.png', fullPage: true });
  await browser.close();
})();
