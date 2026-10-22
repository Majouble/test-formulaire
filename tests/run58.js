const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const doc = JSON.parse(fs.readFileSync(__C.donnees + '/' + 'doc_planning3.json'));
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 300)); });
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(1500);
  await page.evaluate(async () => {
    await grist.docApi.applyUserActions([["AddTable", "Victimes", [{ id: "Dossier", type: "Ref:Reponses", isFormula: false }, { id: "Ligne_id", type: "Text", isFormula: false }, { id: "Ordre", type: "Int", isFormula: false }, { id: "Age", type: "Int", isFormula: false }]], ["AddColumn", "Reponses", "Victimes_q", { type: "Text", isFormula: false }]]);
    const F = window.__DOC__.__data.Formulaires; const conf = JSON.parse(F.Brouillon[0]);
    conf.blocs.push({ id: "b1", genre: "question", colonne: "Victimes_q", section: "q", reglages: { libelle: "Victimes", tableau: { table: "Victimes" } } });
    await grist.docApi.applyUserActions([["UpdateRecord", "Formulaires", 1, { Publie: JSON.stringify(conf), Brouillon: JSON.stringify(conf) }]]);
  });
  await page.click('nav button[data-onglet=formulaires]'); await page.waitForTimeout(2000);
  await page.click('[data-bloc="b1"]'); await page.waitForTimeout(500);
  await page.click('[data-bloc="b1"] [data-act="dupliquer"]'); await page.waitForTimeout(1500);
  console.log('MESSAGE :', (await page.textContent('#message').catch(() => '')).trim());
  const blocs = await page.$$eval('[data-bloc]', l => l.map(x => x.dataset.bloc));
  console.log('BLOCS :', blocs);
  console.log('PANNEAU tableau :', await page.$eval('#panneau', p => (p.querySelector('.groupe .t') ? [...p.querySelectorAll('.groupe .t')].map(t => t.textContent).join(' | ') : p.textContent.slice(0, 200))));
  await page.fill('#sc-nouveau-lib', 'Sexe'); await page.click('#sc-ajouter'); await page.waitForTimeout(1200);
  console.log('MESSAGE 2 :', (await page.textContent('#message').catch(() => '')).trim());
  console.log('COLONNES :', await page.evaluate(() => { const D = window.__DOC__, T = D._grist_Tables, C = D._grist_Tables_column; return T.tableId.filter(t => /Victimes/.test(t)).map(t => t + ': ' + C.colId.filter((_, i) => C.parentId[i] === T.id[T.tableId.indexOf(t)]).join(',')); }));
  await page.screenshot({ path: 'dup-tableau.png' });
  await browser.close();
})();
