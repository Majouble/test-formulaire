const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const doc = JSON.parse(fs.readFileSync(__C.donnees + '/' + 'doc_planning3.json'));
  const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('CONSOLE', m.text().slice(0, 200)); });
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(2000);
  await page.click('nav button[data-onglet=acces]'); await page.waitForTimeout(1200);
  await page.click('#ac-formule'); await page.waitForTimeout(1200);
  await page.click('#ac-appliquer'); await page.waitForTimeout(300); const ok = await page.$('text=Oui, appliquer'); if (ok) await ok.click(); await page.waitForTimeout(1500);
  console.log('STATUT :', (await page.textContent('#ac-statut')).trim());
  // nouvelle question tableau (comme l'onglet Formulaires) puis publication
  const res = await page.evaluate(async () => {
    await grist.docApi.applyUserActions([["AddTable", "Victimes", [{ id: "Dossier", type: "Ref:Reponses", isFormula: false }, { id: "Ligne_id", type: "Text", isFormula: false }, { id: "Ordre", type: "Int", isFormula: false }]], ["AddColumn", "Reponses", "Victimes_q", { type: "Text", isFormula: false }]]);
    const F = window.__DOC__.__data.Formulaires; const conf = JSON.parse(F.Publie[0]);
    conf.blocs.push({ id: "b1", genre: "question", colonne: "Victimes_q", reglages: { libelle: "Victimes", tableau: { table: "Victimes" } } });
    await grist.docApi.applyUserActions([["UpdateRecord", "Formulaires", 1, { Publie: JSON.stringify(conf), Brouillon: JSON.stringify(conf) }]]);
    return await window.OngletAcces.reappliquerSiBesoin();
  });
  console.log('RÉAPPLICATION :', JSON.stringify(res));
  const r = await page.evaluate(() => { const d = window.__DOC__.__data, R = d._grist_ACLRules, Rs = d._grist_ACLResources; return R.id.map((id, i) => { const k = Rs.id.indexOf(R.resource[i]); return Rs.tableId[k]; }).filter(t => t === 'Victimes').length; });
  console.log('règles sur Victimes :', r);
  await browser.close();
})();
