// Admin : changer le modèle d'un formulaire existant (standard ↔ enseignement supérieur par site)
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docSites } = require('./run78');
(async () => {
  const doc = docSites();
  const browser = await chromium.launch({ executablePath: __C.chromium }); const page = await browser.newPage({ viewport: { width: 1300, height: 1400 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => d.accept());
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(1200);
  await page.click('nav button[data-onglet=formulaires]'); await page.waitForTimeout(1800);
  const brouillon = nom => page.evaluate(n => { const F = window.__DOC__.__data.Formulaires, i = F.Nom.indexOf(n); const c = JSON.parse(F.Brouillon[i] || F.Publie[i]); return JSON.stringify({ saisie: c.saisie, sites: c.blocs.map(b => b.reglages && b.reglages.tableau && b.reglages.tableau.sites ? b.colonne + ':' + JSON.stringify(b.reglages.tableau.sites) : b.colonne) }); }, nom);
  const modele = () => page.$$eval('[data-modele]', l => l.map(b => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? ' ✓' : '')).join(' | '));
  console.log('MODÈLE (Signalements) :', await modele());
  await page.click('[data-modele=""]'); await page.waitForTimeout(800);
  console.log('→ STANDARD :', await modele(), '|', await brouillon('Signalements'));
  await page.click('[data-modele="esr-sites"]'); await page.waitForTimeout(1200);
  await page.click('#panneau .retour, #panneau button:has-text("Réglages du formulaire")').catch(() => {}); await page.waitForTimeout(500);
  console.log('→ PAR SITE (tableau existant) :', await brouillon('Signalements'));
  // formulaire vierge, puis passage au modèle par site : tables et question créées
  await page.click('#btn-nouveau'); await page.waitForTimeout(300);
  await page.fill('#nf-nom', 'Vierge'); await page.selectOption('#nf-table', 'Reponses'); await page.waitForTimeout(400);
  await page.click('#nf-valider'); await page.waitForTimeout(1500);
  console.log('VIERGE :', await modele());
  await page.click('[data-modele="esr-sites"]'); await page.waitForTimeout(3000);
  console.log('→ PAR SITE (création) :', await brouillon('Vierge'));
  console.log('TABLES :', await page.evaluate(() => window.__DOC__._grist_Tables.tableId.filter(t => /site|correspond/i.test(t)).join(', ')));
  await browser.close();
})();
