// Administration › Formulaires : renommer la table d'une question tableau (Grist, formulaires publiés et brouillons, Config),
// puis saisie dans la table renommée
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docSites } = require('./run78');
(async () => {
  let doc = docSites();
  const D = doc.__data, F = D.Formulaires, i = F.Nom.indexOf('Signalements');
  if (F.Brouillon) F.Brouillon[i] = F.Publie[i];
  // profil d'atlas qui cite la sous-table (marques)
  const Cf = D.Config; Cf.id.push(Math.max(...Cf.id) + 1); Cf.Cle.push('atlas'); Cf.Valeur.push(JSON.stringify({ actif: 'P', profils: { P: { marques: { table: 'Sites_signales', colonne: 'Qualification' }, sites: { table: 'Sites_signales' } } } }));
  Object.keys(Cf).filter(k => !['id', 'Cle', 'Valeur'].includes(k)).forEach(k => Cf[k].push(null));
  const browser = await chromium.launch({ executablePath: __C.chromium }); const page = await browser.newPage({ viewport: { width: 1300, height: 1400 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => { console.log('CONFIRMATION :', d.message().replace(/\n+/g, ' | ')); d.accept(); });
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(1200);
  await page.click('nav button[data-onglet=formulaires]'); await page.waitForTimeout(1800);
  await page.click('[data-bloc="b1"]'); await page.waitForTimeout(600);
  console.log('CHAMP :', await page.$eval('#pa-table-nom', e => e.value));
  // nom déjà pris : refusé
  await page.fill('#pa-table-nom', 'Reponses'); await page.click('#pa-table-renommer'); await page.waitForTimeout(400);
  console.log('NOM PRIS :', await page.textContent('#msg-global').catch(() => '?'));
  await page.fill('#pa-table-nom', 'Sites concernés ESR'); await page.click('#pa-table-renommer'); await page.waitForTimeout(1500);
  const etat = await page.evaluate(() => { const D = window.__DOC__, F = D.__data.Formulaires, i = F.Nom.indexOf('Signalements');
    const t = j => JSON.parse(j).blocs.filter(b => b.reglages && b.reglages.tableau).map(b => b.reglages.tableau.table).join(',');
    const Cf = D.__data.Config; return { tables: D._grist_Tables.tableId.join(','), publie: t(F.Publie[i]), brouillon: t(F.Brouillon[i]), atlas: Cf.Valeur[Cf.Cle.indexOf('atlas')],
      lignes: (D.__data.Sites_concernes_ESR || {}).id ? 'données suivies' : 'données absentes' }; });
  console.log('TABLES :', etat.tables); console.log('PUBLIÉ :', etat.publie, '| BROUILLON :', etat.brouillon, '|', etat.lignes); console.log('ATLAS :', etat.atlas);
  console.log('PANNEAU :', await page.$eval('#pa-table-nom', e => e.value), '|', await page.$eval('#panneau', p => (p.innerText.match(/CHAMPS DE CHAQUE LIGNE \(TABLE [^)]*\)|Champs de chaque ligne \(table [^)]*\)/i) || ['?'])[0]), '|', await page.textContent('#msg-global'));
  doc = await page.evaluate(() => window.__DOC__);
  // saisie : la table renommée reçoit les lignes
  const p2 = await browser.newPage({ viewport: { width: 1100, height: 1400 } });
  p2.on('pageerror', e => console.log('PAGEERROR', e.message)); p2.on('dialog', d => d.accept());
  await p2.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};window.__OPTS__=${JSON.stringify({ formulaire: 'Signalements' })};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + fs.readFileSync('mock-saisie.js') }));
  await p2.goto('file://' + __C.racine + '/v2/saisie/index.html'); await p2.waitForTimeout(1500);
  await p2.click('#porte-nouveau'); await p2.waitForTimeout(300);
  await p2.fill('#nom', 'Jean Moulin'); await p2.waitForTimeout(700); await p2.click('#liste [role=option] >> nth=0'); await p2.waitForTimeout(700);
  await p2.click('[data-action=ajouter]'); await p2.waitForTimeout(200);
  await p2.fill('.ligne-rep:last-child .site-txt', 'Gymnase du Moulin'); await p2.waitForTimeout(150);
  await p2.click('.ligne-rep:last-child .site-sugg li[data-libre]'); await p2.waitForTimeout(150);
  await p2.click('.ligne-rep:last-child .sous-champ[data-sous=Qualification] label:has-text("Rassemblement")'); await p2.waitForTimeout(150);
  await p2.fill('#description', 'Rassemblement au gymnase'); await p2.click('#btn-signalement'); await p2.waitForTimeout(1500);
  console.log('SAISIE :', (await p2.textContent('#statut-signalement')).trim().slice(0, 80), '| lignes dans la table renommée :', await p2.evaluate(() => { const t = window.__DOC__.__data.Sites_concernes_ESR; return t.id.map((id, i) => `${t.Site_libre[i] || t.Site[i]}/${t.Qualification[i]}`).join(' ; '); }));
  await browser.close();
})();
