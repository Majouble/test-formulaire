// Saisie : bouton ⚙ Diagnostic (les réglages se font dans l'administration) : rubriques affichées, colonnes et
// référentiel utilisés, diagnostic des questions conditionnelles, fermeture
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const doc = JSON.parse(fs.readFileSync(__C.donnees + '/' + 'doc_saisie2.json'));
  const browser = await chromium.launch({ executablePath: __C.chromium }); const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => d.accept());
  const opts = { formulaire: 'Signalements', libelle: 'Alice', perimetre: { Academie: ['Versailles'] } };
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};window.__OPTS__=${JSON.stringify(opts)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + fs.readFileSync('mock-saisie.js') }));
  await page.goto('file://' + __C.racine + '/v2/saisie/index.html'); await page.waitForTimeout(1500);
  const texte = (sel) => page.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' ').trim());
  console.log('BOUTON :', await texte('#btn-config'), '|', await page.getAttribute('#btn-config', 'title'));
  await page.click('#btn-config'); await page.waitForTimeout(500);
  console.log('PANNEAU visible :', await page.isVisible('#config'));
  console.log('RUBRIQUES :', await page.$$eval('#config h2, #config summary', (l) => l.map((e) => e.textContent.trim()).join(' | ')));
  console.log('AUCUN RÉGLAGE :', await page.$$eval('#config select, #config input', (l) => l.length), 'champ(s)');
  console.log('INTRODUCTION :', await texte('#config > p.note'));
  console.log('COLONNES :', await texte('#cfg-diagnostic'));
  console.log('ACTIVITÉ affichée :', (await texte('#cfg-activite')).startsWith("Depuis l'ouverture du widget"));
  await page.click('#diagnostic-conditions summary'); await page.waitForTimeout(300);
  console.log('CONDITIONS :', await texte('#diag-lignes'));
  await page.click('#cfg-fermer'); await page.waitForTimeout(200);
  console.log('PANNEAU visible après « Fermer » :', await page.isVisible('#config'));
  await browser.close();
})();
