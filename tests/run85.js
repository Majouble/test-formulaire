// Référentiel : un site saisi hors référentiel devient un site du référentiel (nouveau site, correspondance validée, saisies complétées)
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docSites } = require('./run78');
(async () => {
  const doc = docSites(), D = doc.__data;
  D.Sites_signales = { id: [1, 2, 3, 4], Dossier: [3, 4, 4, 2], Ligne_id: ['a', 'b', 'c', 'd'], Ordre: [1, 1, 2, 1], Version: [3, 4, 4, 2], Mouvement: ['Ajout', 'Ajout', 'Ajout', 'Ajout'],
    Site: [0, 0, 1, 0], Site_libre: ['Gymnase municipal', 'gymnase  municipal', null, 'Maison des étudiants'], Qualification: ['Blocage total', 'Rassemblement', 'RAS', 'RAS'], Precisions: [null, null, null, null] };
  const browser = await chromium.launch({ executablePath: __C.chromium }); const page = await browser.newPage({ viewport: { width: 1300, height: 1500 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => d.accept());
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(1200);
  await page.click('nav button[data-onglet=referentiel]'); await page.waitForTimeout(1800);
  await page.selectOption('#si-source', 'Sites_signales.Site_libre'); await page.waitForTimeout(1200);
  const lignes = () => page.$$eval('#ref-sites tbody tr', l => l.map(tr => [...tr.querySelectorAll('td')].slice(1, 3).map(td => td.textContent.replace(/\s+/g, ' ').trim()).join(' · ')).join(' | '));
  console.log('À TRAITER :', await lignes());
  // « Gymnase municipal » : nouveau site, nom corrigé
  const tr = '#ref-sites tbody tr:has-text("Gymnase")';
  await page.selectOption(`${tr} .si-site`, 'nouveau'); await page.waitForTimeout(100);
  console.log('CHAMP NOM visible :', await page.$eval(`${tr} .si-nouveau`, e => !e.hidden && e.value));
  await page.fill(`${tr} .si-nouveau`, 'Gymnase municipal Beaulieu');
  await page.click('#si-valider'); await page.waitForTimeout(1500);
  console.log('STATUT :', await page.textContent('#si-statut'));
  // « Maison des étudiants » (établissement 2) : en lot
  await page.check('#ref-sites tbody tr:has-text("Maison") .si-coche'); await page.click('#si-creer'); await page.waitForTimeout(1500);
  console.log('STATUT :', await page.textContent('#si-statut'));
  console.log('RÉFÉRENTIEL :', await page.evaluate(() => { const t = window.__DOC__.__data.Referentiel_sites; return t.id.slice(5).map((id, k) => { const i = k + 5; return `${id}:${t.Site_id[i]}|${t.Nom[i]}|e${t.Etablissement[i]}|${t.Statut ? t.Statut[i] : '∅'}|${t.Source ? t.Source[i] : '∅'}`; }).join('  '); }));
  console.log('CORRESPONDANCES :', await page.evaluate(() => { const t = window.__DOC__.__data.Sites_correspondances; return t.id.map((id, i) => `${t.Etablissement[i]}|${t.Libelle[i]}→${t.Site[i]}(${t.Statut[i]})`).join('  '); }));
  console.log('SAISIES :', await page.evaluate(() => { const t = window.__DOC__.__data.Sites_signales; return t.id.map((id, i) => `${id}:${t.Site[i]}/${t.Site_libre[i] || ''}`).join('  '); }));
  console.log('RESTE À TRAITER :', await lignes());
  await browser.close();
})();
