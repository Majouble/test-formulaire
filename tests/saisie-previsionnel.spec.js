// Saisie : bandeau « Prévisionnel » (vert). Dossier saisi avant le jour de ses faits : le bandeau reste une fois le jour
// venu, avec ou sans mise à jour saisie depuis ; date des faits à venir pendant la saisie d'un nouveau signalement.
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const doc = JSON.parse(fs.readFileSync(__C.donnees + '/' + 'doc_saisie2.json'));
  const R = doc.__data.Reponses;
  const paris = (jour, heure) => Date.parse(`${jour}T${heure}:00+02:00`) / 1000; // octobre : heure d'été
  R.Dossier = R.id.slice();
  // dossier 1 : saisi le 12/10 pour des faits du 15/10, jamais mis à jour ; dossier 2 : idem, mis à jour le 15/10
  R.Cree_le = [paris('2026-10-12', '09:00'), paris('2026-10-12', '09:10')];
  for (const c of Object.keys(R)) R[c].push(c === 'id' ? 3 : c === 'Dossier' ? 2 : c === 'Etablissement' ? R.Etablissement[1] : c === 'Date_faits' ? R.Date_faits[1]
    : c === 'Cree_le' ? paris('2026-10-15', '08:30') : c === 'Nature' ? 'Mise à jour' : c === 'Description' ? 'Confirmé ce matin' : R[c][1]);
  const browser = await chromium.launch({ executablePath: __C.chromium }); const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => d.accept());
  const opts = { formulaire: 'Signalements', libelle: 'Alice', perimetre: { Academie: ['Versailles'] } };
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};window.__OPTS__=${JSON.stringify(opts)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + fs.readFileSync('mock-saisie.js') }));
  await page.goto('file://' + __C.racine + '/v2/saisie/index.html'); await page.waitForTimeout(1500);
  // dates relatives au jour du test, ramenées à des repères stables
  const bandeau = async () => (await page.isVisible('#bandeau-previsionnel'))
    ? (await page.textContent('#bandeau-previsionnel')).replace(/\b(lun|mar|mer|jeu|ven|sam|dim)\. \d{2}\/\d{2}/g, (j) => (/1[25]\/10/.test(j) ? j : '<JOUR>'))
    : '(pas de bandeau)';
  for (const id of [1, 2]) {
    await page.evaluate((id) => ouvrirDepuisListe(id), id); await page.waitForTimeout(700);
    console.log(`DOSSIER ${id} :`, await bandeau());
  }
  console.log('COULEUR :', await page.$eval('#bandeau-previsionnel', (e) => getComputedStyle(e).borderLeftColor));
  // nouveau signalement : aujourd'hui (pas de bandeau), puis faits dans 3 jours
  await page.click('#btn-retour-liste'); await page.waitForTimeout(300);
  await page.click('.porte-nouveau'); await page.waitForTimeout(400);
  console.log('NOUVEAU, aujourd\'hui :', await bandeau());
  const dans3jours = await page.evaluate(() => Outils.dates.valeurChamp(Date.now() + 3 * 86400000, false));
  await page.fill('#date-faits', dans3jours); await page.dispatchEvent('#date-faits', 'change'); await page.waitForTimeout(200);
  console.log('NOUVEAU, faits à venir :', await bandeau());
  await page.fill('#nom', 'Jean'); await page.waitForTimeout(700);
  await page.click('#liste [role=option] >> nth=0'); await page.waitForTimeout(300);
  await page.click('#qualifs-initiales label >> nth=0'); await page.fill('#description', 'Fermeture annoncée'); await page.waitForTimeout(200);
  await page.click('#btn-signalement'); await page.waitForTimeout(1500);
  console.log('ENREGISTRÉ :', (await page.textContent('#statut-signalement')).replace(/n° \d+/, 'n° N'), '|', (await page.textContent('#confirmation')).replace(/\s+/g, ' ').replace(/n° \d+/, 'n° N').slice(0, 120));
  // date de saisie posée par Grist (formule d'initialisation de Cree_le, que le faux Grist ne calcule pas)
  const id = await page.evaluate(() => { const R = window.__DOC__.__data.Reponses, i = R.id.length - 1; R.Cree_le[i] = Date.now() / 1000; window.__emit(); return R.id[i]; });
  await page.waitForTimeout(500);
  await page.evaluate((id) => ouvrirDepuisListe(id), id); await page.waitForTimeout(700);
  console.log('ROUVERT :', await bandeau());
  await page.screenshot({ path: __C.sorties + '/saisie-previsionnel.png' });
  await browser.close();
})();
