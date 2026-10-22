// Saisie : SEGPA choisie à la création → alerte et bascule sur le collège
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const doc = JSON.parse(fs.readFileSync(__C.donnees + '/' + 'doc_saisie2.json')), E = doc.__data.Etablissements;
  const id = Math.max(...E.id) + 1;
  for (const c of Object.keys(E)) { if (c === 'id') E.id.push(id); else E[c].push({ UAI: '0781299S', Nom: 'SEGPA Collège Jean Moulin', Type: 'Collège', Commune: E.Commune[0], Academie: E.Academie[0], Departement: E.Departement[0],
    Libelle_nature: "SECTION D'ENSEIGNEMENT GENERAL ET PROFESSIONNEL ADAPTE", Latitude: E.Latitude[0] + 0.0003, Longitude: E.Longitude[0] }[c] ?? E[c][0]); }
  const browser = await chromium.launch({ executablePath: __C.chromium }); const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => d.accept());
  const opts = { formulaire: 'Signalements', libelle: 'Alice', perimetre: { Academie: ['Versailles'] } };
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};window.__OPTS__=${JSON.stringify(opts)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + fs.readFileSync('mock-saisie.js') }));
  await page.goto('file://' + __C.racine + '/v2/saisie/index.html'); await page.waitForTimeout(1500);
  await page.click('.porte-nouveau'); await page.waitForTimeout(400);
  await page.fill('#nom', 'SEGPA'); await page.waitForTimeout(700);
  console.log('LISTE :', (await page.textContent('#liste')).replace(/\s+/g, ' ').slice(0, 160));
  await page.click('#liste [role=option] >> nth=0'); await page.waitForTimeout(400);
  console.log('ALERTE visible :', await page.isVisible('#alerte-section'), '|', (await page.textContent('#alerte-section')).replace(/\s+/g, ' ').trim());
  await page.screenshot({ path: __C.sorties + '/saisie-75.png' });
  await page.click('#btn-choisir-rattachement'); await page.waitForTimeout(300);
  console.log('APRÈS :', (await page.textContent('#carte-etab')).replace(/\s+/g, ' ').slice(0, 120), '| alerte', await page.isVisible('#alerte-section'));
  await browser.close();
})();
