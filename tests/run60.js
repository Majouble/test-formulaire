// Onglet Équipe fusionné : sous-onglets Agents, Planning, Pages de saisie
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const doc = JSON.parse(fs.readFileSync(__C.donnees + '/' + 'doc_planning3.json'));
  doc._grist_Views = { id: [], name: [] }; doc._grist_Views_section = { id: [], parentId: [], parentKey: [], tableRef: [], options: [], title: [] }; doc._grist_Pages = { id: [], viewRef: [], pagePos: [], indentation: [] };
  const page = await browser.newPage({ viewport: { width: 1300, height: 1100 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => d.accept());
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(1500);
  console.log('ONGLETS :', (await page.$$eval('nav button[data-onglet]', l => l.map(b => b.textContent))).join(' | '));
  await page.click('nav button[data-onglet=onglet-equipe]'); await page.waitForTimeout(2000);
  console.log('SOUS :', (await page.$$eval('#eq-sous button', l => l.map(b => b.textContent + (b.getAttribute('aria-selected') === 'true' ? '*' : '')))).join(' | '));
  console.log('SYNTHÈSE :', (await page.textContent('#eq-synthese-zone')).trim());
  await page.screenshot({ path: 'eq-agents.png', fullPage: true });
  await page.click('#equipe .eq-ligne'); await page.waitForTimeout(800);
  console.log('FICHE :', (await page.$eval('#eq-fiche .eq-activite', e => e.textContent.replace(/\s+/g, ' ').trim())).slice(0, 300));
  await page.locator('#eq-fiche').screenshot({ path: 'eq-fiche.png' });
  if (await page.$('#eq-pages-agent')) { await page.click('#eq-pages-agent'); await page.waitForTimeout(1200); console.log('FICHE après :', (await page.textContent('#eq-fiche-statut')).trim()); }
  await page.click('#eq-sous [data-sous=planning]'); await page.waitForTimeout(1500);
  console.log('PLANNING visible :', await page.isVisible('#planning'), (await page.textContent('#planning')).slice(0, 60).trim());
  await page.click('#eq-sous [data-sous=pages]'); await page.waitForTimeout(1500);
  console.log('PAGES :', (await page.$$eval('#pages-agents tbody tr', l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim().slice(0, 90)))).join('\n   '));
  await page.screenshot({ path: 'eq-pages.png', fullPage: true });
  await page.click('#pa-creer'); await page.waitForTimeout(1500);
  console.log('CRÉATION :', (await page.textContent('#pa-statut')).trim(), '| vues :', await page.evaluate(() => window.__DOC__._grist_Views.name.join(', ')));
  console.log('SYNTHÈSE après :', (await page.textContent('#eq-synthese-zone')).trim());
  await page.click('nav button[data-onglet=formulaires]'); await page.waitForTimeout(2500);
  console.log('FORMULAIRES :', (await page.textContent('#pf-pages').catch(() => '(absent)')).trim());
  await page.click('nav button[data-onglet=acces]'); await page.waitForTimeout(1500);
  console.log('ACCÈS qui :', (await page.$$eval('#acces section.carte', l => l.map(s => s.textContent.replace(/\s+/g, ' ').trim()).filter(t => t.startsWith('Qui')))).join('').slice(0, 200));
  await browser.close();
})();
