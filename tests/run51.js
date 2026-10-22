// 2.0.1 : temps des onglets Équipe / Planning (référentiel de 68 000 lignes), installation (Auteur, Administration),
const __C = require('./chemins');
// règles d'accès (pas de condition vide), page protégée, colonnes de l'annuaire, fonction habituelle retirée
const { chromium } = require('playwright'); const fs = require('fs');
const OLD = __C.sorties + '/old/v2/';
const NEW = __C.racine + '/v2/';
function docGros() {
  const doc = JSON.parse(fs.readFileSync(__C.donnees + '/' + 'doc_planning3.json'));
  const E = doc.__data.Etablissements, n0 = E.id.length, N = 68000;
  for (let k = n0; k < N; k++) { for (const c of Object.keys(E)) { if (c === 'id') E.id.push(k + 1); else if (Array.isArray(E[c])) E[c].push(c === 'UAI' ? `X${k}` : c === 'Nom' ? `Etab ${k}` : E[c][k % n0]); } }
  // page d'administration liée à Config
  const T = doc._grist_Tables;
  doc._grist_Views = { id: [1], name: ['Admin'] };
  doc._grist_Views_section = { id: [1], parentId: [1], parentKey: ['custom'], tableRef: [T.id[T.tableId.indexOf('Config')]], options: [JSON.stringify({ customView: JSON.stringify({ mode: 'url', url: 'https://majouble.github.io/test-formulaire/v2/admin/', access: 'full' }) })], title: [''] };
  doc._grist_Pages = { id: [1], viewRef: [1] };
  return doc;
}
// latence simulée : 20 ms + 1 ms par 50 lignes
const LATENCE = `;(function(){const f=grist.docApi.fetchTable.bind(grist.docApi);window.__NFETCH__={};grist.docApi.fetchTable=async n=>{const r=await f(n);window.__NFETCH__[n]=(window.__NFETCH__[n]||0)+1;await new Promise(x=>setTimeout(x,20+((r.id||[]).length/50)));return r;};})();grist.onRecords=()=>{};grist.getOption=async()=>null;`;
async function ouvrir(browser, base, doc) {
  const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + LATENCE }));
  await page.goto('file://' + base + 'admin/index.html'); await page.waitForTimeout(4000);
  return page;
}
async function chrono(page, onglet, pret) {
  const t = Date.now();
  await page.click(`nav button[data-onglet=${onglet}]`);
  await page.waitForFunction(pret, null, { timeout: 30000 });
  return Date.now() - t;
}
(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const doc = docGros();
  const pretEq = () => /Équipe de la cellule/.test(document.getElementById('equipe').textContent);
  const pretPl = () => document.querySelector('#planning table') !== null;
  for (const [nom, base] of [['ancienne', OLD], ['nouvelle', NEW]]) {
    const page = await ouvrir(browser, base, JSON.parse(JSON.stringify(doc)));
    const t = [];
    t.push(await chrono(page, 'equipe', pretEq)); await page.click('nav button[data-onglet=installation]'); await page.waitForTimeout(300);
    t.push(await chrono(page, 'planning', pretPl)); await page.click('nav button[data-onglet=installation]'); await page.waitForTimeout(300);
    t.push(await chrono(page, 'equipe', pretEq)); await page.click('nav button[data-onglet=installation]'); await page.waitForTimeout(300);
    t.push(await chrono(page, 'planning', pretPl));
    const nf = await page.evaluate(() => window.__NFETCH__.Etablissements || 0);
    console.log(`${nom} : Équipe ${t[0]} ms, Planning ${t[1]} ms, Équipe (2e) ${t[2]} ms, Planning (2e) ${t[3]} ms ; lectures du référentiel : ${nf}`);
    await page.close();
  }
  // Fonctionnel, nouvelle version
  const page = await ouvrir(browser, NEW, doc);
  const etapes = await page.$$eval('#actions label, #actions li, #actions .etape', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean));
  console.log('ÉTAPES:', etapes.filter(x => /Auteur|Administration/.test(x)).map(x => x.slice(0, 110)));
  const banniere = await page.textContent('#page-admin');
  console.log('BANDEAU AVANT INSTALL:', JSON.stringify(banniere.trim().slice(0, 80)));
  // appliquer tout ce qui est coché
  await page.click('text=Appliquer la sélection'); await page.waitForTimeout(2500);
  const r = await page.evaluate(() => { const D = window.__DOC__, T = D._grist_Tables, C = D._grist_Tables_column, tr = T.id[T.tableId.indexOf('Reponses')]; const i = C.id.findIndex((_, k) => C.parentId[k] === tr && C.colId[k] === 'Auteur'); return { admin: T.tableId.includes('Administration'), auteur: i >= 0 ? C.formula[i] : null, agentsFonction: C.colId.filter((c, k) => c === 'Fonction' && C.parentId[k] === T.id[T.tableId.indexOf('Agents')]).length }; });
  console.log('APRÈS INSTALL: table Administration', r.admin, '| Auteur:\n' + r.auteur);
  console.log('BANDEAU:', (await page.textContent('#page-admin')).replace(/\s+/g, ' ').trim().slice(0, 160));
  if (await page.$('#btn-page-admin')) { await page.click('#btn-page-admin'); await page.waitForTimeout(800); console.log('CRÉATION:', (await page.textContent('#page-admin-statut')).trim());
    const s = await page.evaluate(() => { const Sx = window.__DOC__._grist_Views_section, T = window.__DOC__._grist_Tables; return Sx.id.map((id, i) => [id, T.tableId[T.id.indexOf(Sx.tableRef[i])], JSON.parse(JSON.parse(Sx.options[i]).customView || '{}').url, Sx.title[i]]); });
    console.log('SECTIONS:', JSON.stringify(s));
    await page.click('#btn-relire'); await page.waitForTimeout(1200); console.log('BANDEAU APRÈS:', (await page.textContent('#page-admin')).replace(/\s+/g, ' ').trim().slice(0, 160)); }
  await page.screenshot({ path: 'v201-installation.png' });
  // Équipe : plus de fonction habituelle
  await page.click('nav button[data-onglet=onglet-equipe]'); await page.waitForTimeout(1200);
  console.log('ÉQUIPE fonction habituelle ?', /Fonction habituelle/i.test(await page.textContent('#equipe')));
  await page.click('.eq-ligne'); await page.waitForTimeout(400); console.log('FICHE select fonction ?', !!(await page.$('#eq-fonction')));
  await page.screenshot({ path: 'v201-equipe.png', fullPage: true });
  await page.click('nav button[data-onglet=onglet-equipe]'); await page.waitForTimeout(800); await page.click('#eq-sous [data-sous=planning]'); await page.waitForTimeout(1500);
  console.log('PLANNING fonction habituelle ?', /Fonction habituelle|habituellement/i.test(await page.textContent('#planning')));
  // Référentiel
  await page.click('nav button[data-onglet=referentiel]'); await page.waitForTimeout(1000);
  await page.click('#btn-ref-apercu'); await page.waitForTimeout(1500);
  console.log('COLONNES ANNUAIRE:', (await page.$$eval('#ref-colonnes tr', t => t.map(x => x.textContent.replace(/\s+/g, ' ').trim()))).join(' | '));
  await page.locator('#ref-etape2').screenshot({ path: 'v201-referentiel.png' });
  // Accès
  await page.click('nav button[data-onglet=acces]'); await page.waitForTimeout(1500);
  const btn = await page.$('#ac-appliquer'); if (btn) { await btn.click(); await page.waitForTimeout(500); const ok = await page.$('text=Oui, appliquer'); if (ok) await ok.click(); await page.waitForTimeout(2000); }
  const acl = await page.evaluate(() => { const d = window.__DOC__.__data, R = d._grist_ACLRules, Rs = d._grist_ACLResources; return R.id.map((id, i) => { const k = Rs.id.indexOf(R.resource[i]); return [Rs.tableId[k], Rs.colIds[k], R.aclFormula[i], R.permissionsText[i], R.userAttributes[i] ? 'attr' : '']; }); });
  console.log('RÈGLES vides (hors attributs, hors règle 1 de Grist):', JSON.stringify(acl.filter((r, i) => i > 0 && !r[4] && !r[2])));
  console.log('RÈGLES S:', JSON.stringify(acl.filter(r => /S/.test(r[3]))));
  console.log('RÈGLES Administration:', JSON.stringify(acl.filter(r => r[0] === 'Administration' || r[0] === '*')));
  console.log('STATUT ACCÈS:', (await page.textContent('#acces')).match(/Règles (appliquées|à jour)[^.]*/g));
  await browser.close();
})();
