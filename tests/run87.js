// Référentiel ESR : une école d'ingénieurs compte pour un établissement (écoles internes, écoles de l'IMT), à l'import et sur le référentiel en place
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docEsr, CLASSEUR } = require('./run81');
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
  const D = window.__DOC__.__data, E = D.Etablissements, S = D.Referentiel_sites, nom = id => (E.Nom[E.id.indexOf(id)] || '').slice(0, 28);
  const ids = ['ETAB-0001', 'ETAB-0004', 'ETAB-0006', 'ETAB-0007', 'ETAB-0008', 'ETAB-0009', 'ETAB-0010'];
  return ids.map(k => { const i = E.Etablissement_ID.indexOf(k); return i < 0 ? `${k} absent` : `${k} ${E.Nom[i].slice(0, 30)} | ${E.Niveau ? E.Niveau[i] : ''} | ${E.Type[i]} | ratt=${E.Rattachement ? nom(E.Rattachement[i]) || '—' : '∅'} | groupe=${E.Groupe ? E.Groupe[i] || '—' : '∅'}`; }).join('\n   ')
    + '\n   SITES : ' + S.id.map((id, i) => S.Site_id[i] && /0008|0009|0003/.test(S.Site_id[i]) ? `${S.Site_id[i]} ${S.Nom[i]} → etab ${nom(S.Etablissement[i])} / comp ${S.Composante ? nom(S.Composante[i]) || '—' : '∅'}` : '').filter(Boolean).join(' ; ');
});
(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });
  // 1. import avec la règle (cochée par défaut)
  let page = await ouvrir(browser, docEsr());
  console.log('RÈGLE cochée :', await page.isChecked('#esr-regle-ecoles'));
  await page.setInputFiles('#esr-fichier', CLASSEUR); await page.waitForTimeout(2000);
  console.log('BILAN :', (await page.textContent('#ref-esr')).match(/Écoles d'ingénieurs[^É]*/)[0].trim());
  await page.click('#esr-importer'); await page.waitForTimeout(3000);
  console.log('APRÈS IMPORT (règle) :\n  ', await etat(page));
  // 2. import sans la règle, puis règle appliquée au référentiel en place
  page = await ouvrir(browser, docEsr());
  await page.uncheck('#esr-regle-ecoles'); await page.waitForTimeout(300);
  await page.setInputFiles('#esr-fichier', CLASSEUR); await page.waitForTimeout(2000);
  await page.click('#esr-importer'); await page.waitForTimeout(3000);
  console.log('APRÈS IMPORT (sans règle) :\n  ', await etat(page));
  await page.check('#esr-regle-ecoles'); await page.waitForTimeout(300);
  await page.click('#esr-regle-appliquer'); await page.waitForTimeout(1500);
  console.log('STATUT :', await page.textContent('#esr-regle-statut'));
  console.log('APRÈS « Appliquer au référentiel actuel » :\n  ', await etat(page));
  console.log('CONFIG :', await page.evaluate(() => { const C = window.__DOC__.__data.Config, i = C.Cle.indexOf('regles_esr'); return i < 0 ? '∅' : C.Valeur[i].replace(/\s+/g, ' '); }));
  await browser.close();
})();
