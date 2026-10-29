// Formulaire par site : reprise du dernier état des sites réglable (administration) : désactivée (par défaut), à la demande (bouton), automatique
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docSites } = require('./run78');
(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });
  // 1. administration : case « reprendre automatiquement », décochée → réglage reprise = false
  let doc = docSites();
  { const F = doc.__data.Formulaires, i = F.Nom.indexOf('Signalements'); if (F.Brouillon) F.Brouillon[i] = F.Publie[i]; }
  const pa = await browser.newPage({ viewport: { width: 1300, height: 1400 } });
  pa.on('pageerror', e => console.log('PAGEERROR', e.message)); pa.on('dialog', d => d.accept());
  await pa.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await pa.goto('file://' + __C.racine + '/v2/admin/index.html'); await pa.waitForTimeout(1200);
  await pa.click('nav button[data-onglet=formulaires]'); await pa.waitForTimeout(1800);
  await pa.click('[data-bloc="b1"]'); await pa.waitForTimeout(600);
  console.log('RÉGLAGE AVANT :', await pa.$eval('#pa-site-reprise', e => e.value));
  await pa.selectOption('#pa-site-reprise', 'non'); await pa.waitForTimeout(500);
  console.log('NOTE (désactivée) :', await pa.$eval('#panneau', p => (p.innerText.match(/Nouveau dossier : le tableau des sites part vide, l'agent[^\n]*/) || ['?'])[0].slice(0, 100)), '| case RAS :', await pa.$('#pa-site-ras') ? 'visible' : 'masquée');
  await pa.selectOption('#pa-site-reprise', 'bouton'); await pa.waitForTimeout(500);
  console.log('RÉGLAGE :', await pa.evaluate(() => { const F = window.__DOC__.__data.Formulaires, i = F.Nom.indexOf('Signalements'); return JSON.stringify(JSON.parse(F.Brouillon[i]).blocs[0].reglages.tableau.sites.reprise); }));
  console.log('NOTE :', await pa.$eval('#panneau', p => (p.innerText.match(/Nouveau dossier : le tableau des sites part vide[^\n]*/) || ['?'])[0].slice(0, 120)));
  // 2. saisie avec reprise = false
  const F = doc.__data.Formulaires, i = F.Nom.indexOf('Signalements'), conf = JSON.parse(F.Publie[i]);
  conf.blocs[0].reglages.tableau.sites.reprise = 'bouton'; F.Publie[i] = JSON.stringify(conf);
  const page = await browser.newPage({ viewport: { width: 1100, height: 1400 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => d.accept());
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};window.__OPTS__=${JSON.stringify({ formulaire: 'Signalements' })};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + fs.readFileSync('mock-saisie.js') }));
  await page.goto('file://' + __C.racine + '/v2/saisie/index.html'); await page.waitForTimeout(1500);
  await page.click('#porte-nouveau'); await page.waitForTimeout(300);
  await page.fill('#nom', 'Jean Moulin'); await page.waitForTimeout(700); await page.click('#liste [role=option] >> nth=0'); await page.waitForTimeout(700);
  const lignes = () => page.$$eval('.ligne-rep', l => l.map(x => { const i = x.querySelector('.site-txt'); return `${i ? i.value : '?'}${x.classList.contains('reprise') ? ' (repris)' : ''}`; }).join(' | ') || '(aucune)');
  console.log('SANS REPRISE AUTO :', await lignes(), '| OFFRE :', await page.$eval('.offre-reprise', e => e.innerText.replace(/\s+/g, ' ')).catch(() => '(aucune)'));
  // une ligne saisie, puis reprise à la demande : la ligne saisie est gardée
  await page.click('[data-action=ajouter]'); await page.waitForTimeout(200);
  await page.fill('.ligne-rep:last-child .site-txt', 'Gymnase du Moulin'); await page.waitForTimeout(150);
  await page.click('.ligne-rep:last-child .site-sugg li[data-libre]'); await page.waitForTimeout(150);
  await page.click('[data-action=reprendre-sites]'); await page.waitForTimeout(400);
  console.log('APRÈS « Reprendre » :', await lignes(), '| OFFRE :', await page.$('.offre-reprise') ? 'encore là' : 'retirée');
  // 3. réglage absent : reprise désactivée (aucune ligne, aucun bouton) ; une reprise d'un signalement précédent ne reprend pas les sites
  conf.blocs[0].reglages.tableau.sites.reprise = undefined; F.Publie[i] = JSON.stringify(conf);
  await page.unroute('**/grist-plugin-api.js');
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};window.__OPTS__=${JSON.stringify({ formulaire: 'Signalements' })};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + fs.readFileSync('mock-saisie.js') }));
  await page.goto('file://' + __C.racine + '/v2/saisie/index.html'); await page.waitForTimeout(1500);
  await page.click('#porte-nouveau'); await page.waitForTimeout(300);
  await page.fill('#nom', 'Jean Moulin'); await page.waitForTimeout(700); await page.click('#liste [role=option] >> nth=0'); await page.waitForTimeout(700);
  console.log('PAR DÉFAUT :', await lignes(), '| bouton :', await page.$('.offre-reprise') ? 'proposé' : 'aucun', '| encadré des signalements récents :', await page.$eval('#proposition-encours', e => e.hidden ? 'masqué' : e.innerText.replace(/\s+/g, ' ').slice(0, 80)));
  const rep = await page.$('#proposition button[data-reprendre], [data-reprendre]');
  if (rep) { await rep.click(); await page.waitForTimeout(600); console.log('APRÈS « Reprendre » LE SIGNALEMENT PRÉCÉDENT :', await lignes(), '|', (await page.textContent('#statut-signalement')).trim().slice(0, 90)); }
  else console.log('APRÈS « Reprendre » : bouton de reprise absent');
  // 4. ancien réglage « automatique » (true) : toujours automatique
  conf.blocs[0].reglages.tableau.sites.reprise = true; F.Publie[i] = JSON.stringify(conf);
  await page.unroute('**/grist-plugin-api.js');
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};window.__OPTS__=${JSON.stringify({ formulaire: 'Signalements' })};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + fs.readFileSync('mock-saisie.js') }));
  await page.goto('file://' + __C.racine + '/v2/saisie/index.html'); await page.waitForTimeout(1500);
  await page.click('#porte-nouveau'); await page.waitForTimeout(300);
  await page.fill('#nom', 'Jean Moulin'); await page.waitForTimeout(700); await page.click('#liste [role=option] >> nth=0'); await page.waitForTimeout(700);
  console.log('ANCIEN RÉGLAGE AUTOMATIQUE :', await lignes());
  await browser.close();
})();
