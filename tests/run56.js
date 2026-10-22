// 2.0.4 : second champ (MESRE) dans le même document
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const doc = JSON.parse(fs.readFileSync(__C.donnees + '/' + 'doc_planning3.json'));
  const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(2000);
  await page.check('#g-second'); await page.waitForTimeout(200);
  console.log('SECOND :', await page.textContent('#g-second-lib'), await page.inputValue('#g-second-rep'), await page.inputValue('#g-second-ref'));
  await page.click('#btn-general'); await page.waitForTimeout(1500);
  console.log('STATUT :', (await page.textContent('#statut-general')).trim());
  const etapes = await page.$$eval('#actions-liste label, #actions .etape, #liste-actions label', l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  console.log('ÉTAPES @ :', etapes.filter(t => /ESR/.test(t)).map(t => t.slice(0, 120)));
  await page.click('text=Appliquer la sélection'); await page.waitForTimeout(3000);
  const cols = await page.evaluate(() => { const D = window.__DOC__, T = D._grist_Tables, C = D._grist_Tables_column; const of = t => { const r = T.id[T.tableId.indexOf(t)]; return C.id.map((_, i) => i).filter(i => C.parentId[i] === r).map(i => `${C.colId[i]}:${C.type[i]}${C.formula[i] ? '=' + C.formula[i].split('\n')[0].slice(0, 40) : ''}`); }; return { rep: of('Reponses_ESR'), ref: of('Etablissements_ESR') }; });
  console.log('Reponses_ESR :', cols.rep.join(' | '));
  console.log('Etablissements_ESR :', cols.ref.join(' | '));
  console.log('BANDEAU :', (await page.textContent('#bandeau')).trim());
  // formulaire publié sur la table ESR, puis règles
  await page.evaluate(async () => { const conf = { blocs: [], parties: [{ id: 'q', nom: 'Signalement', role: 'q' }] }; await grist.docApi.applyUserActions([["AddRecord", "Formulaires", null, { Nom: "ESR", Table: "Reponses_ESR", Type: "etablissement", Publie: JSON.stringify(conf), Brouillon: JSON.stringify(conf) }]]); });
  await page.click('nav button[data-onglet=acces]'); await page.waitForTimeout(1500);
  if (await page.$('#ac-formule')) { await page.click('#ac-formule'); await page.waitForTimeout(1500); }
  await page.click('#ac-appliquer'); await page.waitForTimeout(300); const ok = await page.$('text=Oui, appliquer'); if (ok) await ok.click(); await page.waitForTimeout(1500);
  const acl = await page.evaluate(() => { const d = window.__DOC__.__data, R = d._grist_ACLRules, Rs = d._grist_ACLResources; return R.id.map((id, i) => { const k = Rs.id.indexOf(R.resource[i]); return [Rs.tableId[k], R.aclFormula[i], R.permissionsText[i]]; }).filter(r => /Reponses|Etablissements/.test(r[0])); });
  acl.forEach(r => console.log('  ', r.join('  ')));
  await browser.close();
})();
