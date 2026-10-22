// Planning : vue Grille (saisie clavier, bloc, champ, coller Excel, enregistrement)
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const doc = JSON.parse(fs.readFileSync(__C.donnees + '/' + 'doc_planning3.json'));
  const A = doc.__data.Agents, NOMS = ['Durand', 'Dupont', 'Martin', 'Bernard', 'Petit', 'Robert', 'Richard', 'Dubois', 'Moreau', 'Laurent'];
  for (let k = 0; k < 47; k++) for (const c of Object.keys(A)) { if (c === 'id') A.id.push(1000 + k); else if (Array.isArray(A[c])) A[c].push(c === 'Nom' ? `${['Anne', 'Paul', 'Léa', 'Marc', 'Sophie'][k % 5]} ${NOMS[k % 10]}${k > 9 ? ' ' + k : ''}` : c === 'Mail' ? `a${k}@x.fr` : A[c][0]); }
  const browser = await chromium.launch({ executablePath: __C.chromium }); const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => { console.log('DIALOG', d.message()); d.accept(); });
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(800);
  await page.click('nav button[data-onglet=onglet-equipe]'); await page.waitForTimeout(800);
  await page.click('#eq-sous [data-sous=planning]'); await page.waitForTimeout(1200);
  await page.click('[data-vue=grille]'); await page.waitForTimeout(300);
  const aff = () => page.evaluate(() => { const t = window.__DOC__.__data.Affectations; return t.id.length; });
  console.log('LIGNES', await page.$$eval('.pg-table tbody tr', l => l.length), '| COLONNES', await page.$$eval('.pg-table th.pg-cr', l => l.map(x => x.textContent).join(',')));
  console.log('OUTILS', await page.$$eval('[data-pg-fonction]', l => l.map(x => x.textContent).join(' | ')));
  console.log('CASES REMPLIES', await page.$$eval('.pg-c', l => l.filter(x => x.querySelector('span').textContent).length), '| affectations', await aff());
  // saisie : clic sur ligne 3 col 0, lettre
  await page.click('.pg-c[data-r="2"][data-c="0"]');
  const k1 = await page.$$eval('[data-pg-fonction]', l => l[0].textContent.trim()[0]);
  await page.keyboard.press(k1.toLowerCase()); await page.waitForTimeout(100);
  console.log('APRÈS lettre', k1, ': focus', await page.evaluate(() => document.activeElement.dataset.r + ',' + document.activeElement.dataset.c), '| case', await page.textContent('.pg-c[data-r="2"][data-c="0"]'));
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('2'); await page.waitForTimeout(100);
  console.log('APRÈS 2 :', await page.textContent('.pg-c[data-r="2"][data-c="0"]'));
  // bloc Maj+flèches
  await page.click('.pg-c[data-r="4"][data-c="1"]'); await page.keyboard.press('Shift+ArrowDown'); await page.keyboard.press('Shift+ArrowDown'); await page.keyboard.press('Shift+ArrowRight');
  console.log('SÉLECTION', await page.$$eval('.pg-c.sel', l => l.length));
  const k2 = await page.$$eval('[data-pg-fonction]', l => (l[1] || l[0]).textContent.trim()[0]);
  await page.keyboard.press(k2); await page.keyboard.press('1');
  console.log('BLOC', await page.$$eval('.pg-c.sel', l => l.map(x => x.textContent.trim()).join(' ')), '| modif', await page.$$eval('.pg-c.modif', l => l.length));
  // copier puis coller ailleurs, puis coller depuis « Excel »
  const copie = await page.evaluate(() => { const dt = new DataTransfer(); const e = new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true }); document.activeElement.dispatchEvent(e); return dt.getData('text/plain'); });
  console.log('COPIE', JSON.stringify(copie));
  await page.click('.pg-c[data-r="8"][data-c="0"]');
  await page.evaluate(t => { const dt = new DataTransfer(); dt.setData('text/plain', t); document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }, copie);
  await page.click('.pg-c[data-r="12"][data-c="0"]');
  const nomF = await page.$$eval('[data-pg-fonction]', l => l[0].dataset.pgFonction);
  await page.evaluate(t => { const dt = new DataTransfer(); dt.setData('text/plain', t); document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }, `${nomF}\tESR ${nomF.toLowerCase()}\r\nzzz\t\r\n`);
  console.log('COLLÉ', await page.textContent('#pg-statut'), '|', await page.$$eval('.pg-c[data-r="12"], .pg-c[data-r="13"]', l => l.slice(0, 2).concat(l.slice(-0)).map(x => x.textContent.trim()).join(' ')));
  console.log('TOTAUX', await page.$$eval('.pg-total', l => l.slice(0, 4).map(x => x.textContent.replace(/\s+/g, ' ').trim()).join(' || ')), '| manque', await page.$$eval('.pg-total.manque', l => l.length));
  console.log('BOUTON', await page.textContent('#pg-enregistrer'));
  await page.screenshot({ path: __C.sorties + '/pg-71.png' });
  // filtre
  await page.fill('#pg-filtre', 'sophie'); console.log('FILTRE sophie', await page.$$eval('.pg-table tbody tr', l => l.length), '| bouton gardé', await page.textContent('#pg-enregistrer')); await page.fill('#pg-filtre', '');
  const avant = await aff();
  await page.click('#pg-enregistrer'); await page.waitForTimeout(600);
  console.log('ENREGISTRÉ', await page.textContent('#pg-statut'), '| affectations', avant, '→', await aff(), '| modif restants', await page.$$eval('.pg-c.modif', l => l.length));
  const t = await page.evaluate(() => { const t = window.__DOC__.__data.Affectations; const n = t.id.length; return [-3, -2, -1].map(i => [t.Agent[n + i], t.Creneau[n + i], t.Fonction[n + i], JSON.stringify(t.Champ[n + i]), t.Perimetre[n + i]].join(' ')); });
  console.log('DERNIÈRES', t.join(' || '));
  // suppression
  await page.click('.pg-c[data-r="2"][data-c="0"]'); await page.keyboard.press('Delete'); await page.click('#pg-enregistrer'); await page.waitForTimeout(500);
  console.log('SUPPR', await page.textContent('#pg-statut'));
  // double clic → vue par fonction
  await page.dblclick('.pg-c[data-r="4"][data-c="1"]'); await page.waitForTimeout(400);
  console.log('DBLCLIC → édition', !!(await page.$('#pl-edition')), '| vue', await page.$eval('[data-vue].on', b => b.dataset.vue));
  // réglages : code
  await page.click('#pl-ouvrir-reglages').catch(() => {}); await page.waitForTimeout(200);
  console.log('CODE INPUTS', await page.$$eval('[data-champ=code]', l => l.length));
  await page.evaluate(() => document.getElementById('pl-reglages').open = true); const ins = await page.$$('[data-champ=code]'); await ins[3].fill('cs'); await ins[3].dispatchEvent('input');
  const btn = await page.$$eval('button', l => l.filter(b => /Enregistrer les réglages/.test(b.textContent)).map(b => b.id).filter(i => i.startsWith('pl'))); console.log('BTN', btn);
  await page.click('#' + btn[0]); await page.waitForTimeout(500); console.log('REG', await page.textContent('#pl-reg-statut').catch(() => '?'));
  await page.click('[data-vue=grille]'); await page.waitForTimeout(300);
  console.log('OUTILS2', await page.$$eval('[data-pg-fonction]', l => l.map(x => x.textContent).join(' | ')));
  await page.click('.pg-c[data-r="20"][data-c="3"]'); await page.keyboard.press('c'); await page.keyboard.press('s'); await page.waitForTimeout(100);
  await page.keyboard.press('c'); await page.waitForTimeout(1100);
  console.log('CS puis C :', await page.textContent('.pg-c[data-r="20"][data-c="3"]'), '|', await page.textContent('.pg-c[data-r="20"][data-c="4"]'));
  await browser.close();
})();
