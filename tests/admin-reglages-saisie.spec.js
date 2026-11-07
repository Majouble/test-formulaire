// Administration : réglages de la saisie qui se faisaient dans son panneau ⚙ (Installation › « Saisie : réglages communs
// et pages », Formulaires › Description en mode « Communs »), et version d'un dossier sur un autre établissement séparée
// en dossier à part entière (À vérifier)
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docSites } = require('./sites-esr-reprise-dernier-etat.spec');
function docReglages() {
  const doc = docSites(), D = doc.__data, R = D.Reponses, K = D.Config;
  // réglages communs posés autrefois depuis le widget de saisie
  K.id.push(Math.max(...K.id) + 1); K.Cle.push('resume_auto');
  K.Valeur.push(JSON.stringify({ actif: true, format: 'libelle', separateur: 'ligne', entete: true, qualification: true, questions: true, mobilisation: true,
    nombresPositifs: false, bornes: { Nb_eleves: { min: 1, max: 900 } }, tableEtablissementsESR: 'Etablissements' }));
  // une mise à jour du dossier n° 4 saisie sur un autre établissement (n° 2)
  const x = Math.max(...R.id) + 1;
  for (const c of Object.keys(R)) R[c].push(c === 'id' ? x : c === 'Etablissement' ? 2 : c === 'Dossier' ? 4 : c === 'Derniere_version' ? true : c === 'Qualification' ? 'Rassemblement'
    : c === 'Nature' ? 'Mise à jour' : c === 'Description' ? 'Rassemblement devant le portail' : c === 'Date_faits' ? 1792540800 : c === 'Cree_le' ? 1792600000 : (typeof R[c][0] === 'string' ? '' : null));
  return { doc, x };
}
(async () => {
  const { doc, x } = docReglages();
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const page = await browser.newPage({ viewport: { width: 1250, height: 1700 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => { console.log('CONFIRMATION :', d.message().replace(/\n+/g, ' | ').slice(0, 300)); d.accept(); });
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(2500);
  const texte = (sel) => page.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' ').trim());
  const communs = () => page.evaluate(() => { const K = window.__DOC__.__data.Config; return K.Valeur[K.Cle.indexOf('resume_auto')]; });
  const optionsPages = () => page.evaluate(() => { const S = window.__DOC__._grist_Views_section;
    return S.id.map((id, i) => { const w = JSON.parse(JSON.parse(S.options[i]).customView).widgetOptions || {}; return `vue ${id} : formulaire ${w.formulaire ?? '(automatique)'}, version ${w.version ?? '(automatique)'}`; }).join(' ; '); });

  // Installation : carte des réglages communs et des pages
  console.log('CARTE :', await texte('#carte-reglages-saisie'));
  await page.check('#rs-positifs'); await page.waitForTimeout(500);
  console.log('NOMBRES :', await texte('#rs-statut'));
  await page.click('#rs-effacer-bornes'); await page.waitForTimeout(500);
  await page.click('#rs-table-auto'); await page.waitForTimeout(500);
  console.log('STATUT :', await texte('#rs-statut'));
  console.log('RÉGLAGES COMMUNS :', await communs());
  console.log('PAGES AVANT :', await optionsPages());
  await page.selectOption('[data-page-formulaire="2"]', ''); await page.waitForTimeout(600);
  console.log('PAGES APRÈS :', await optionsPages(), '|', await texte('#rs-statut'));
  console.log('CARTE APRÈS :', await texte('#carte-reglages-saisie'));

  // Formulaires : description automatique, réglages communs modifiés et enregistrés pour tous les formulaires
  await page.click('nav button[data-onglet=formulaires]'); await page.waitForTimeout(1800);
  await page.click('[data-commun="commun:Description"]'); await page.waitForTimeout(600);
  console.log('PANNEAU :', (await texte('#panneau')).slice(0, 700));
  await page.selectOption('#pd-separateur', 'pv'); await page.waitForTimeout(300);
  await page.uncheck('#panneau [data-desc="mobilisation"]'); await page.waitForTimeout(300);
  console.log('AVANT ENREGISTREMENT :', await texte('#pd-communs-statut'), '|', await texte('#pd-exemple'));
  await page.click('#pd-communs-ok'); await page.waitForTimeout(600);
  console.log('ENREGISTRÉ :', await texte('#pd-communs-statut'));
  console.log('RÉGLAGES COMMUNS :', await communs());

  // À vérifier : la version saisie sur un autre établissement devient un dossier à part entière
  await page.click('nav button[data-onglet=qualite]'); await page.waitForTimeout(1800);
  const item = '#qualite .qa-item:has-text("Dossier sur")';
  console.log('ANOMALIE :', await texte(item));
  await page.click(`${item} [data-corriger]`); await page.waitForTimeout(1500);
  console.log('MESSAGE :', await texte('#qa-statut-msg'));
  console.log('SAISIE :', await page.evaluate((x) => { const R = window.__DOC__.__data.Reponses, i = R.id.indexOf(x); return `n° ${x} : dossier ${R.Dossier[i]}, ${R.Nature[i]}, établissement ${R.Etablissement[i]}`; }, x));
  console.log('RESTE :', await page.$$eval('#qualite .qa-item', (l) => l.filter((e) => /Dossier sur/.test(e.textContent)).length), 'anomalie(s) « Dossier sur »');
  await page.screenshot({ path: 'sorties/admin-reglages-saisie.png', fullPage: false });
  await browser.close();
})();
