// Équipe et fonction habituelle des agents : liste (filtre, tri, modification en ligne, import), planning (filtre, tri, groupes, Espace)
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const doc = JSON.parse(fs.readFileSync(__C.donnees + '/' + 'doc_planning3.json'));
  const A = doc.__data.Agents, NOMS = ['Durand', 'Dupont', 'Martin', 'Bernard', 'Petit', 'Robert', 'Richard', 'Dubois', 'Moreau', 'Laurent'];
  for (let k = 0; k < 47; k++) for (const c of Object.keys(A)) { if (c === 'id') A.id.push(1000 + k); else if (Array.isArray(A[c])) A[c].push(c === 'Nom' ? `${['Anne', 'Paul', 'Léa', 'Marc', 'Sophie'][k % 5]} ${NOMS[k % 10]}${k > 9 ? ' ' + k : ''}` : c === 'Mail' ? `a${k}@x.fr` : A[c][0]); }
  console.log('colonnes Agents :', Object.keys(A).join(','));
  const browser = await chromium.launch({ executablePath: __C.chromium }); const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => { console.log('DIALOG', d.message().slice(0, 80)); d.accept(); });
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(800);
  await page.click('nav button[data-onglet=onglet-equipe]'); await page.waitForTimeout(1000);
  console.log('BANDEAU', (await page.textContent('#equipe .bandeau').catch(() => '—')).slice(0, 160));
  if (await page.$('#eq-completer')) { await page.click('#eq-completer'); await page.waitForTimeout(800); }
  console.log('APRÈS COMPLÉTER', (await page.textContent('#equipe .bandeau').catch(() => 'plus de bandeau')).slice(0, 160), await page.textContent('#eq-statut').catch(() => ''));
  console.log('COLONNES', await page.$$eval('#equipe .eq-table thead th', l => l.map(x => x.textContent.trim()).join(' | ')), '| Agents a Equipe/Fonction', await page.evaluate(() => ['Equipe', 'Fonction'].map(c => c in window.__DOC__.__data.Agents).join(',')));
  // modification en ligne
  const eqs = ['Équipe A', 'Équipe B', 'Nuit'];
  const inputs = await page.$$('[data-equipe]');
  for (let i = 0; i < 12; i++) { await inputs[i].fill(eqs[i % 3]); await inputs[i].press('Enter'); await page.waitForTimeout(60); }
  const sels = await page.$$('[data-fonction]');
  for (let i = 0; i < 12; i++) await sels[i].selectOption({ index: 1 + (i % 3) });
  await page.waitForTimeout(300);
  console.log('STATUT', await page.textContent('#eq-statut'), '| fiche ouverte ?', !!(await page.$('#eq-fiche')));
  console.log('DOC', await page.evaluate(() => { const t = window.__DOC__.__data.Agents; return t.id.slice(0, 4).map((id, i) => `${t.Nom[i]}=${t.Equipe[i]}/${t.Fonction[i]}`).join(' ; '); }));
  // filtre et tri
  await page.selectOption('#eq-f-equipe', 'Nuit'); await page.waitForTimeout(200);
  console.log('FILTRE Nuit', await page.$$eval('#eq-corps .eq-ligne', l => l.length), '|', await page.textContent('#eq-compte'));
  await page.selectOption('#eq-f-equipe', ''); await page.click('[data-tri=equipe]'); await page.waitForTimeout(200);
  console.log('TRI équipe groupes', await page.$$eval('#eq-corps .eq-groupe', l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim()).join(' | ')));
  await page.fill('#eq-cherche', 'nuit dur'); console.log('RECHERCHE « nuit dur »', await page.$$eval('#eq-corps .eq-ligne', l => l.length), '| focus', await page.evaluate(() => document.activeElement.id));
  await page.fill('#eq-cherche', '');
  await page.screenshot({ path: __C.sorties + '/eq-72.png' });
  // fiche
  await page.click('#eq-corps .eq-ligne td:first-child'); await page.waitForTimeout(200);
  console.log('FICHE équipe/fonction', await page.inputValue('#eq-equipe'), '/', await page.inputValue('#eq-fonction'));
  await page.click('#eq-annuler');
  // import
  await page.evaluate(() => document.getElementById('eq-import').open = true);
  await page.fill('#eq-liste', 'Zoé Neuve ; zoe@x.fr ; 0102 ; Équipe C ; opérateur\nAlice ; ; ; Équipe A ; Coordinateur\nYves ; y@x.fr ; ; ; Pilote');
  await page.click('#eq-analyser'); console.log('IMPORT bilan', (await page.textContent('#eq-import-bilan')).replace(/\s+/g, ' '));
  await page.fill('#eq-liste', 'Zoé Neuve ; zoe@x.fr ; 0102 ; Équipe C ; opérateur\nAlice ; ; ; Équipe A ; Coordinateur');
  await page.click('#eq-analyser'); await page.click('#eq-importer'); await page.waitForTimeout(500);
  console.log('IMPORT', await page.textContent('#eq-statut'), '|', await page.evaluate(() => { const t = window.__DOC__.__data.Agents; return ['Zoé Neuve', 'Alice'].map(n => { const i = t.Nom.indexOf(n); return `${n}=${t.Equipe[i]}/${t.Fonction[i]}`; }).join(' ; '); }));
  // planning
  await page.click('#eq-sous [data-sous=planning]'); await page.waitForTimeout(1200);
  if (!(await page.$('#pl-grille'))) await page.click('[data-vue=grille]'); await page.waitForTimeout(300);
  await page.selectOption('#pg-tri', 'equipe'); await page.waitForTimeout(200);
  console.log('GRILLE groupes', await page.$$eval('.pg-groupe', l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim()).join(' | ')));
  console.log('SOUS-TITRES', await page.$$eval('.pg-sous', l => l.slice(0, 3).map(x => x.textContent).join(' | ')));
  await page.selectOption('#pg-f-equipe', 'Équipe A'); await page.waitForTimeout(200);
  console.log('FILTRE Équipe A', await page.$$eval('.pg-table tbody tr:not(.pg-groupe)', l => l.length));
  // Espace = fonction habituelle sur un bloc
  await page.click('.pg-c[data-r="0"][data-c="0"]'); await page.keyboard.press('Shift+ArrowDown'); await page.keyboard.press('Shift+ArrowDown'); await page.keyboard.press(' ');
  console.log('ESPACE', await page.$$eval('.pg-c.sel', l => l.map(x => x.textContent.trim()).join(' ')), '|', await page.$$eval('.pg-table tbody tr:not(.pg-groupe) .pg-nom', l => l.slice(0, 3).map(x => x.textContent.trim()).join(' / ')), '|', await page.textContent('#pg-statut'));
  await page.screenshot({ path: __C.sorties + '/pg-72.png' });
  // agent sans fonction habituelle
  await page.selectOption('#pg-f-equipe', ''); await page.selectOption('#pg-tri', 'nom'); await page.fill('#pg-filtre', 'bob');
  await page.click('.pg-c[data-r="0"][data-c="0"]'); await page.keyboard.press(' '); console.log('ESPACE sans fonction', await page.textContent('#pg-statut'));
  // par fonction : groupe fonction habituelle
  await page.fill('#pg-filtre', ''); await page.click('#pg-annuler'); await page.click('[data-vue=fonction]'); await page.waitForTimeout(300);
  console.log('VUE', await page.$eval('[data-vue].on', b => b.dataset.vue), await page.$$eval('.pl-tableau .pl-cellule', l => l.slice(0, 6).map(x => x.dataset.fonction + '@' + x.closest('td').className).join(',')));
  await page.locator('.pl-tableau td.auj .pl-cellule[data-fonction="Opérateur"]').click(); await page.waitForTimeout(300);
  console.log('PAR FONCTION groupes', await page.$$eval('.pl-choix-groupe', l => l.map(x => x.textContent).join(' | ')), '|', await page.$$eval('.pl-choix-ag span', l => l.slice(0, 4).map(x => x.textContent).join(' ; ')));
  await browser.close();
})();
