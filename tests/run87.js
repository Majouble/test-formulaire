// Référentiel ESR v7 (règle des 3 questions) : import de l'ancien classeur, puis du classeur v7 ; composantes rattachées à
// leur personne morale, rattachement effacé des établissements, Membre de, Siège, lignes retirées (État, Remplacé par,
// références reportées), sites d'une composante sur la personne morale. L'ancienne règle « une école d'ingénieurs
// compte pour un établissement » n'existe plus (2.56).
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docEsr, CLASSEUR } = require('./run81');
const V7 = __C.donnees + '/referentiel_esr_v7_essai.xlsx';
async function ouvrir(browser, doc) {
  const page = await browser.newPage({ viewport: { width: 1300, height: 1600 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => { console.log('CONFIRMATION :', d.message().split('\n')[0]); d.accept(); });
  await page.route('**/jszip.min.js', r => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(require.resolve('jszip/dist/jszip.min.js')) }));
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(1200);
  await page.click('nav button[data-onglet=referentiel]'); await page.waitForTimeout(1200);
  return page;
}
const etat = page => page.evaluate(() => {
  const D = window.__DOC__.__data, E = D.Etablissements, S = D.Referentiel_sites, nom = id => (E.Nom[E.id.indexOf(id)] || '').slice(0, 24);
  const ids = ['ETAB-0001', 'ETAB-0003', 'ETAB-0004', 'ETAB-0005', 'ETAB-0006', 'ETAB-0007', 'ETAB-0008', 'ETAB-0009', 'ETAB-0010', 'ETAB-A0001'];
  const col = (c, i, f) => E[c] ? (f ? f(E[c][i]) : E[c][i]) || '—' : '∅';
  const liste = v => Array.isArray(v) ? v.slice(1).map(nom).join(', ') : '';
  const site = v => { const k = S.id.indexOf(v); return k < 0 ? '' : S.Site_id[k]; };
  return ids.map(k => { const i = E.Etablissement_ID.indexOf(k); return i < 0 ? `${k} absent` : `${k} ${E.Nom[i].slice(0, 26)} | ${col('Niveau', i)} | ratt=${col('Rattachement', i, nom)} | membre=${col('Membre_de', i, liste)} | siège=${col('Siege', i, site)} | état=${col('Etat', i)} | remplacé par=${col('Remplace_par', i, nom)}`; }).join('\n   ')
    + '\n   SITES : ' + S.id.map((id, i) => S.Site_id[i] && /0003|0006|0008|0009|R0001|A0001/.test(S.Site_id[i]) ? `${S.Site_id[i]} ${S.Nom[i]} → etab ${nom(S.Etablissement[i])} / comp ${S.Composante ? nom(S.Composante[i]) || '—' : '∅'}` : '').filter(Boolean).join(' ; ');
});
(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const page = await ouvrir(browser, docEsr());
  console.log('ANCIENNE RÈGLE (case) :', await page.$('#esr-regle-ecoles') ? 'présente' : 'absente');
  // 1. ancien classeur
  await page.setInputFiles('#esr-fichier', CLASSEUR); await page.waitForTimeout(2000);
  await page.click('#esr-importer'); await page.waitForTimeout(3000);
  console.log('APRÈS IMPORT (ancien format) :\n  ', await etat(page));
  // un signalement sur le campus de Rennes de l'IMT (ligne qui sera retirée)
  await page.evaluate(async () => {
    const D = window.__DOC__.__data, E = D.Etablissements, rid = E.id[E.Etablissement_ID.indexOf('ETAB-0010')];
    await grist.docApi.applyUserActions([['AddRecord', 'Reponses', null, { Etablissement: rid, Description: 'Signalement sur le campus de Rennes', Qualification: 'RAS' }]]);
  });
  // 2. classeur v7
  await page.setInputFiles('#esr-fichier', V7); await page.waitForTimeout(2500);
  const bilan = await page.textContent('#ref-esr');
  for (const re of [/Lignes du classeur[^À]*/, /Membre de\s*\d[^S]*/, /Siège\s*\d[^C]*/, /Lignes retirées\s*\d[^.]*\./, /reporter les \d+ référence/]) { const m = bilan.match(re); console.log('BILAN :', m ? m[0].replace(/\s+/g, ' ').trim() : `(absent : ${re})`); }
  await page.click('#esr-importer'); await page.waitForTimeout(3500);
  console.log('STATUT :', (await page.textContent('#esr-statut')).trim());
  console.log('APRÈS IMPORT (v7) :\n  ', await etat(page));
  console.log('SIGNALEMENT :', await page.evaluate(() => { const D = window.__DOC__.__data, R = D.Reponses, E = D.Etablissements, i = R.Description.indexOf('Signalement sur le campus de Rennes'); return E.Etablissement_ID[E.id.indexOf(R.Etablissement[i])]; }));
  console.log('COLONNES :', await page.evaluate(() => { const C = window.__DOC__._grist_Tables_column, T = window.__DOC__._grist_Tables, t = T.id[T.tableId.indexOf('Etablissements')];
    return C.colId.map((c, i) => C.parentId[i] === t && /Membre|Siege|Remplace|Autres|Ministere|Commentaire/.test(c) ? `${c}:${C.type[i]}` : '').filter(Boolean).join(' '); }));
  await page.screenshot({ path: __C.sorties + '/run87.png', fullPage: true });
  await browser.close();
})();
