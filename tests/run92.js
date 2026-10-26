// Formulaire par site : site obligatoire et nom hors référentiel ; ancien nom gardé en texte dans la colonne référence
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docSites } = require('./run78');
(async () => {
  const doc = docSites(), T = doc._grist_Tables, C = doc._grist_Tables_column, D = doc.__data;
  const tr = T.id[T.tableId.indexOf('Sites_signales')], k = C.id.findIndex((_, i) => C.parentId[i] === tr && C.colId[i] === 'Site');
  if (!C.description) C.description = C.id.map(() => ''); C.description[k] = '*';   // site obligatoire
  // dossier d'hier avec un ancien nom resté en texte dans la colonne référence Site
  const R = D.Reponses, id = Math.max(...R.id) + 1, S = D.Sites_signales;
  for (const c of Object.keys(R)) R[c].push(c === 'id' ? id : c === 'Etablissement' ? 1 : c === 'Dossier' ? id : c === 'Derniere_version' ? true : c === 'Qualification' ? 'Rassemblement' : c === 'Nature' ? 'Nouveau signalement' : c === 'Description' ? 'Ancien' : c === 'Date_faits' ? Date.UTC(2026, 9, 25) / 1000 : c === 'Cree_le' ? Date.UTC(2026, 9, 25, 9) / 1000 : c === 'Detail_des_sites' ? JSON.stringify([{ _id: 'z', Site: 'Bât. Z ancien nom', Qualification: 'Rassemblement' }]) : (typeof R[c][0] === 'string' ? '' : null));
  const browser = await chromium.launch({ executablePath: __C.chromium }); const page = await browser.newPage({ viewport: { width: 1100, height: 1400 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => { console.log('DIALOG :', d.message().replace(/\n+/g, ' | ').slice(0, 200)); d.accept(); });
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};window.__OPTS__=${JSON.stringify({ formulaire: 'Signalements' })};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + fs.readFileSync('mock-saisie.js') }));
  await page.goto('file://' + __C.racine + '/v2/saisie/index.html'); await page.waitForTimeout(1500);
  await page.click('#porte-nouveau'); await page.waitForTimeout(300);
  await page.fill('#nom', 'Jean Moulin'); await page.waitForTimeout(700); await page.click('#liste [role=option] >> nth=0'); await page.waitForTimeout(700);
  console.log('REPRIS :', await page.$$eval('.ligne-rep', l => l.map(x => { const i = x.querySelector('.site-txt'); return `${i.value}${i.disabled ? ' (verrouillé)' : ''} [${x.querySelector('.site-etat').textContent}]`; }).join(' | ')));
  // nouvelle ligne : nom hors référentiel, site obligatoire
  await page.click('[data-action=ajouter]'); await page.waitForTimeout(200);
  await page.fill('.ligne-rep:last-child .site-txt', 'Gymnase du Moulin'); await page.waitForTimeout(150);
  await page.click('.ligne-rep:last-child .site-sugg li[data-libre]'); await page.waitForTimeout(150);
  await page.click('.ligne-rep:last-child .sous-champ[data-sous=Qualification] label:has-text("Rassemblement")'); await page.waitForTimeout(150);
  await page.fill('#description', 'Rassemblement au gymnase'); await page.click('#btn-signalement'); await page.waitForTimeout(1500);
  console.log('ERREURS DE LIGNE :', await page.$$eval('.msg-ligne:not([hidden])', l => l.map(x => x.textContent).join(' | ') || 'aucune'));
  console.log('STATUT :', await page.textContent('#statut-signalement'));
  console.log('SOUS-TABLE :', await page.evaluate(() => { const t = window.__DOC__.__data.Sites_signales; return t.id.map((id, i) => `${id}:site ${t.Site[i]}/${t.Site_libre[i] || ''}/${t.Qualification[i]}`).join('  '); }));
  await browser.close();
})();
