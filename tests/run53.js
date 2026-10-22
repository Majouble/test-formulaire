// 2.0.2 : académies dans l'onglet Référentiel ; règles d'accès (anciennes règles à condition vide → bandeau, remplacement)
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const doc = JSON.parse(fs.readFileSync(__C.donnees + '/' + 'doc_planning3.json'));
  // règles « 2.0.0 » : condition vide sur * et ressource *SPECIAL:SchemaEdit de la 2.0.1
  doc.__data._grist_ACLResources = { id: [1, 2, 3], tableId: ['', '*', '*SPECIAL'], colIds: ['', '*', 'SchemaEdit'] };
  doc.__data._grist_ACLRules = { id: [1, 2, 3, 4, 5], resource: [1, 2, 2, 2, 3], aclFormula: ['', 'user.Access == OWNER', 'user.Agent.Actif', '', 'user.Access == EDITOR'],
    permissionsText: ['', '+CRUDS', '+R-CUDS', '-CRUDS', '-S'], rulePos: [1, 2, 3, 4, 5], memo: ['', 'Socle v2 — a', 'Socle v2 — b', 'Socle v2 — c', 'Socle v2 — d'], userAttributes: ['', '', '', '', ''] };
  const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(2500);
  console.log('INSTALL académies :', (await page.textContent('#g-academies')).trim());
  // Référentiel : liste des académies
  await page.click('nav button[data-onglet=referentiel]'); await page.waitForTimeout(1500);
  console.log('ACADÉMIES ANNUAIRE :', (await page.$$eval('#ref-academies-choix label', l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim()))).join(' | '));
  await page.click('#ref-academies-choix [data-aca="0"]'); await page.waitForTimeout(200);
  console.log('bouton enregistrer actif :', !(await page.$eval('#ref-aca-enregistrer', b => b.disabled)));
  await page.click('#ref-aca-enregistrer'); await page.waitForTimeout(800);
  console.log('APRÈS ENREGISTREMENT :', await page.evaluate(() => { const c = window.__DOC__.__data.Config; return c.Valeur[c.Cle.indexOf('general')]; }).then(v => JSON.parse(v).academies));
  await page.locator('#referentiel').screenshot({ path: 'v202-referentiel.png' });
  // Accès
  await page.click('nav button[data-onglet=acces]'); await page.waitForTimeout(1500);
  console.log('BANDEAU AVANT :', ((await page.$eval('#acces', e => (e.querySelector('.bandeau.alerte') || {}).textContent || '')) || '').replace(/\s+/g, ' ').trim().slice(0, 400));
  await page.click('#ac-formule'); await page.waitForTimeout(1500);
  await page.click('#ac-appliquer'); await page.waitForTimeout(400); const ok = await page.$('text=Oui, appliquer'); if (ok) await ok.click(); await page.waitForTimeout(2000);
  console.log('STATUT :', (await page.textContent('#ac-statut')).trim());
  const acl = await page.evaluate(() => { const d = window.__DOC__.__data, R = d._grist_ACLRules, Rs = d._grist_ACLResources; return { res: Rs.id.map((id, i) => [id, Rs.tableId[i], Rs.colIds[i]]), r: R.id.map((id, i) => { const k = Rs.id.indexOf(R.resource[i]); return [Rs.tableId[k] + ':' + Rs.colIds[k], R.aclFormula[i], R.permissionsText[i], R.userAttributes[i] ? 'attr' : '']; }) }; });
  console.log('RESSOURCES :', JSON.stringify(acl.res));
  console.log('DÉFAUT :', JSON.stringify(acl.r.filter(x => x[0] === '*:*' && !x[3])));
  console.log('VIDES :', JSON.stringify(acl.r.filter(x => !x[3] && !x[1] && x[0] !== ':')));
  console.log('BANDEAU APRÈS :', (await page.$eval('#acces', e => [...e.querySelectorAll('.bandeau')].map(b => b.textContent.replace(/\s+/g, ' ').trim().slice(0, 90)))));
  await page.click('nav button[data-onglet=onglet-equipe]'); await page.waitForTimeout(1200);
  console.log('ÉQUIPE badges :', (await page.$$eval('.eq-ligne td:first-child', l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim()))).join(' | '));
  await browser.close();
})();
