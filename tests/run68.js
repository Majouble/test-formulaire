// Planning : mobilisation de plusieurs agents d'un coup (recherche + cases à cocher), lignes repliées
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const doc = JSON.parse(fs.readFileSync(__C.donnees + '/' + 'doc_planning3.json'));
  const A = doc.__data.Agents, n0 = A.id.length, NOMS = ['Durand', 'Dupont', 'Martin', 'Bernard', 'Petit', 'Robert', 'Richard', 'Dubois', 'Moreau', 'Laurent'];
  for (let k = 0; k < 47; k++) for (const c of Object.keys(A)) { if (c === 'id') A.id.push(1000 + k); else if (Array.isArray(A[c])) A[c].push(c === 'Nom' ? `${['Anne', 'Paul', 'Léa', 'Marc', 'Sophie'][k % 5]} ${NOMS[k % 10]}${k > 9 ? ' ' + k : ''}` : c === 'Mail' ? `a${k}@x.fr` : A[c][0]); }
  console.log('agents :', A.id.length);
  const browser = await chromium.launch({ executablePath: __C.chromium }); const page = await browser.newPage({ viewport: { width: 1300, height: 1400 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => d.accept());
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(800);
  await page.click('nav button[data-onglet=onglet-equipe]'); await page.waitForTimeout(800);
  await page.click('#eq-sous [data-sous=planning]'); await page.waitForTimeout(1200);
  await page.locator('.pl-tableau td.auj .pl-cellule[data-fonction="Opérateur"]').click(); await page.waitForTimeout(300);
  console.log('CIBLES :', await page.$$eval('.pl-cibles label', l => l.map(x => x.textContent.trim()).join(' | ')));
  console.log('GROUPES :', await page.$$eval('.pl-choix-groupe', l => l.map(x => x.textContent).join(' | ')), '| cases', await page.$$eval('.pl-choix-ag', l => l.length), '| prises', await page.$$eval('.pl-choix-ag.pris', l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim()).join(' ; ')));
  // recherche + Entrée, puis cases à cocher
  await page.fill('#pl-cherche', 'dupo'); console.log('FILTRE dupo :', await page.$$eval('.pl-choix-ag', l => l.filter(x => x.style.display !== 'none').length));
  await page.press('#pl-cherche', 'Enter'); await page.fill('#pl-cherche', 'so lau'); console.log('FILTRE « so lau » :', await page.$$eval('.pl-choix-ag', l => l.filter(x => x.style.display !== 'none').map(x => x.dataset.nom).join(',')), await page.$$eval('.pl-choix-ag', l => l.slice(0,3).map(x => x.dataset.nom).join(',')));
  await page.fill('#pl-cherche', 'moreau'); await page.press('#pl-cherche', 'Enter');
  await page.fill('#pl-cherche', 'sophie');
  const vis = await page.$$('.pl-choix-ag:visible input:not(:disabled)'); for (const b of vis.slice(0, 3)) await b.check();
  console.log('BOUTON :', await page.textContent('#pl-mobiliser'));
  await page.check('.pl-cibles input[value]:not([value=jour])');   // premier créneau seulement
  await page.waitForTimeout(200);
  console.log('APRÈS changement de cible, sélection gardée :', await page.textContent('#pl-mobiliser'));
  await page.click('#pl-mobiliser'); await page.waitForTimeout(300);
  console.log('LIGNES :', await page.$$eval('.pl-bloc-creneau', b => b.map(x => x.querySelector('.pl-bloc-tete').textContent.replace(/\s+/g, ' ').trim() + ' → ' + [...x.querySelectorAll('.pl-aff strong')].map(s => s.textContent).join(', ')).join(' || ')));
  console.log('PUCES visibles (replié) :', await page.$$eval('.pl-aff .eq-puce', p => p.length));
  await page.click('.pl-aff [data-deplier]'); await page.waitForTimeout(200);
  console.log('PUCES après « modifier » :', await page.$$eval('.pl-aff .eq-puce', p => p.length));
  await page.screenshot({ path: 'pl-68.png', fullPage: false }); await page.locator('#pl-edition').screenshot({ path: __C.sorties + '/pl-68-edition.png' });
  const avant = await page.evaluate(() => window.__DOC__.__data.Affectations.id.length);
  await page.click('#pl-enregistrer'); await page.waitForTimeout(500);
  console.log('ENREGISTRÉ :', await page.textContent('#pl-statut'), '| affectations', avant, '→', await page.evaluate(() => window.__DOC__.__data.Affectations.id.length));
  await browser.close();
})();
