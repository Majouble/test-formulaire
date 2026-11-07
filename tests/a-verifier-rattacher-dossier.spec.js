// « À vérifier » : rattacher un dossier à un autre (même affaire saisie deux fois : blocage le matin, occupation l'après-midi).
// Les saisies du dossier rattaché deviennent des versions du dossier qui le reçoit (numéro gardé), rangées par date ;
// une seule saisie « Nouveau signalement » (la plus ancienne) ; les lignes de sites suivent le dossier ; doublon résolu
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docSites } = require('./sites-esr-reprise-dernier-etat.spec');
function docFusion() {
  const doc = docSites(), D = doc.__data, R = D.Reponses, SS = D.Sites_signales;
  R.Derniere_version = R.id.map(id => ![4, 6].includes(id));
  // dossier 4 : blocage le matin (saisie 4) puis mise à jour (5) ; dossier x : même établissement, même jour, l'après-midi
  const x = Math.max(...R.id) + 1;
  for (const c of Object.keys(R)) R[c].push(c === 'id' ? x : c === 'Etablissement' ? 1 : c === 'Dossier' ? x : c === 'Derniere_version' ? true : c === 'Qualification' ? 'Rassemblement'
    : c === 'Nature' ? 'Nouveau signalement' : c === 'Description' ? 'Occupation du hall depuis 14 h' : c === 'Date_faits' ? 1792540800 : c === 'Cree_le' ? 1792600000 : (typeof R[c][0] === 'string' ? '' : null));
  [[4, 4, 'c', 1, 'Blocage partiel'], [4, 5, 'c', 1, 'Rassemblement'], [x, x, 'z', 2, 'Rassemblement']].forEach(([dos, ver, lid, site, q], k) => {
    SS.id.push(k + 1); SS.Dossier.push(dos); SS.Version.push(ver); SS.Ligne_id.push(lid); SS.Ordre.push(0); SS.Mouvement.push('Ajout'); SS.Site.push(site); SS.Site_libre.push(''); SS.Qualification.push(q); SS.Precisions.push(''); });
  return { doc, x };
}
(async () => {
  const { doc, x } = docFusion();
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const page = await browser.newPage({ viewport: { width: 1250, height: 1700 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => { console.log('CONFIRMATION :', d.message().replace(/\n+/g, ' | ').slice(0, 330)); d.accept(); });
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(2500);
  await page.click('nav button[data-onglet=qualite]'); await page.waitForTimeout(1800);
  const items = () => page.$$eval('#qualite .qa-item', l => l.map(x => x.querySelector('.qa-tete').textContent.replace(/\s+/g, ' ').trim()).join(' | '));
  console.log('ANOMALIES :', await items());
  const doublon = '#qualite .qa-item:has-text("dossiers pour")';
  console.log('PROPOSITION :', await page.$eval(`${doublon} .qa-fusion`, e => `${e.querySelector('[data-fus-src]').selectedOptions[0].textContent} → ${e.querySelector('[data-fus-cible]').selectedOptions[0].textContent}`));
  await page.click(`${doublon} [data-fusionner]`); await page.waitForTimeout(2000);
  console.log('MESSAGE :', await page.textContent('#qa-statut-msg'));
  const R = await page.evaluate(() => { const R = window.__DOC__.__data.Reponses; return [4, 5, 8].map(id => { const i = R.id.indexOf(id); return `n° ${id} : dossier ${R.Dossier[i]}, ${R.Nature[i]}`; }).join(' ; '); });
  console.log('SAISIES :', R);
  console.log('SITES :', await page.evaluate(() => { const S = window.__DOC__.__data.Sites_signales; return S.id.map((id, i) => `ligne ${id} : dossier ${S.Dossier[i]}, version ${S.Version[i]}`).join(' ; '); }));
  console.log('APRÈS :', await items() || '(aucune anomalie de doublon)');
  // le dossier fusionné : ses saisies, par date
  await page.selectOption('#qa-statut', 'tous'); await page.waitForTimeout(500);
  await browser.close();
})();
