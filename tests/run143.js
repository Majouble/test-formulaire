// 2.62.0-alpha.35 : accès des services (lien partagé d'une DSDEN ou d'un rectorat).
// Administration › Validation, carte « Accès des services » : préparation du document (colonne Service, colonne
// Personne_service), création par lot depuis le référentiel (un accès par département et par académie : échelon,
// périmètre, clé, échéance, pages de saisie), liens en CSV, réglages ; onglet Accès : lignes limitées au périmètre,
// saisie, sa seule ligne de l'équipe, planning fermé ; saisie : bandeau « Accès partagé », nom exigé avant d'enregistrer,
// inscrit dans Personne_service de la nouvelle version.
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docValidation } = require('./run108');

function ajouterColonne(doc, tid, colId, type, label, valeurs, wo) {
  const T = doc._grist_Tables, C = doc._grist_Tables_column, ref = T.id[T.tableId.indexOf(tid)];
  C.id.push(C.id.length + 1); C.parentId.push(ref); C.colId.push(colId); C.type.push(type); C.label.push(label || colId);
  C.isFormula.push(false); C.formula.push(''); C.widgetOptions.push(wo ? JSON.stringify(wo) : ''); C.visibleCol.push(0); C.parentPos.push(C.id.length);
  const D = doc.__data[tid]; D[colId] = D.id.map((_, i) => (valeurs && valeurs[i] !== undefined) ? valeurs[i] : null);
}
function docServices() {
  const doc = docValidation();
  ajouterColonne(doc, 'Agents', 'Echelon_visa', 'Choice', 'Échelon de visa', [], { choices: ['Départemental', 'Académique'] });
  ajouterColonne(doc, 'Agents', 'Visa_departements', 'ChoiceList', 'Départements visés', []);
  ajouterColonne(doc, 'Agents', 'Visa_academies', 'ChoiceList', 'Académies visées', []);
  return doc;
}
const texte = async (page, sel) => (await page.$eval(sel, e => e.innerText)).replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
const api = doc => `window.__DOC__=${JSON.stringify(doc)};`;

(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });

  /* ---------- 1. Administration › Validation : carte « Accès des services » ---------- */
  const page = await browser.newPage({ viewport: { width: 1400, height: 2200 }, acceptDownloads: true });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => d.accept());
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: api(docServices()) + fs.readFileSync('mock.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(1500);
  await page.click('nav button[data-onglet=validation]'); await page.waitForTimeout(2500);
  console.log('CARTE (ouverture) :\n' + await texte(page, '#va-services'));
  await page.click('#va-services [data-sv-act=preparer]'); await page.waitForTimeout(2000);
  console.log('PRÉPARATION :', await page.textContent('#sv-statut'), '| colonnes :', await page.evaluate(() => {
    const C = window.__DOC__._grist_Tables_column; return ['Service', 'Personne_service'].map(c => `${c} ${C.colId.includes(c) ? 'créée' : 'absente'}`).join(', '); }));
  console.log('À CRÉER :', (await texte(page, '#va-services .sv-creation')).split('\n').slice(-1)[0]);
  await page.click('#va-services [data-sv-act=creer]'); await page.waitForTimeout(3500);
  console.log('CRÉATION :', await page.textContent('#sv-statut'));
  const lignes = await page.evaluate(() => {
    const A = window.__DOC__.__data.Agents;
    return A.id.map((id, i) => A.Service && A.Service[i] ? `n° ${id} ${A.Nom[i]} : ${A.Echelon_visa[i]}, ${JSON.stringify(A.Visa_departements[i] || A.Visa_academies[i])}, clé ${A.Cle_acces[i] ? 'oui' : 'non'}, échéance ${A.Lien_expire_le && A.Lien_expire_le[i] ? Math.round((A.Lien_expire_le[i] - Date.now() / 1000) / 86400) + ' j' : '—'}, page ${A.Page_saisie ? A.Page_saisie[i] : '—'}` : null).filter(Boolean).join('\n  ');
  });
  console.log('AGENTS DE SERVICE :\n  ' + lignes);
  console.log('PAGES :', await page.evaluate(() => window.__DOC__._grist_Views.name.join(' | ')));
  console.log('CARTE (après) :\n' + (await texte(page, '#va-services table')).split('\n').slice(0, 6).join('\n'));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#va-services [data-sv-act=csv]')]);
  console.log('CSV :', dl.suggestedFilename(), '|', fs.readFileSync(await dl.path(), 'utf8').replace(/^﻿/, '').split('\r\n').slice(0, 2).join(' / ').replace(/LinkKey_Invite_=[\w-]+/g, 'LinkKey_Invite_=…'));
  await page.uncheck('#sv-saisie'); await page.waitForTimeout(1500);
  console.log('RÉGLAGE :', await page.evaluate(() => { const C = window.__DOC__.__data.Config; return C.Valeur[C.Cle.indexOf('acces_services')]; }));
  await page.check('#sv-saisie'); await page.waitForTimeout(1500);

  /* ---------- 2. Onglet Accès ---------- */
  await page.click('nav button[data-onglet=acces]'); await page.waitForTimeout(1800);
  const acces = (await texte(page, '#acces')).split('\n').filter(l => /Accès de service/.test(l));
  console.log('ACCÈS :\n  ' + [...new Set(acces)].join('\n  '));
  const brut = await page.$eval('#acces', e => e.textContent);
  console.log('FORMULES (services) :\n  ' + [...new Set((brut.match(/[^\n]*user\.Invite\.Service[^\n]*/g) || []).map(l => l.trim()))].slice(0, 6).join('\n  '));
  const formules = await page.evaluate(() => window.__DOC__);
  const etat = formules;
  await page.close();

  /* ---------- 3. Saisie : page de « DSDEN Yvelines » ouverte par son lien ---------- */
  const idService = etat.__data.Agents.id[etat.__data.Agents.Nom.indexOf('DSDEN Yvelines')];
  const ps = await browser.newPage({ viewport: { width: 1200, height: 1500 } });
  ps.on('pageerror', e => console.log('PAGEERROR (service)', e.message)); ps.on('dialog', d => d.accept());
  await ps.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: api(etat) + `window.__OPTS__=${JSON.stringify({ formulaire: 'Signalements', agent: idService })};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + fs.readFileSync('mock-saisie.js') }));
  await ps.goto('file://' + __C.racine + '/v2/saisie/index.html'); await ps.waitForTimeout(2500);
  console.log('BANDEAU (ouverture) :', await texte(ps, '#bandeau-service'));
  await ps.click('#cartes-signalements .carte-sig:has-text("Albert Camus")'); await ps.waitForTimeout(1500);
  await ps.fill('#description', 'Point de la DSDEN : situation stabilisée.');
  await ps.click('#btn-signalement'); await ps.waitForTimeout(1500);
  console.log('SANS NOM :', (await ps.textContent('#statut-signalement')).trim());
  await ps.fill('#service-personne', 'Claire Martin'); await ps.click('#bandeau-service button[type=submit]'); await ps.waitForTimeout(500);
  console.log('BANDEAU (nommé) :', await texte(ps, '#bandeau-service'));
  await ps.click('#btn-signalement'); await ps.waitForTimeout(2000);
  console.log('AVEC NOM :', (await ps.textContent('#statut-signalement')).trim());
  console.log('VERSIONS :', await ps.evaluate(() => { const R = window.__DOC__.__data.Reponses; return R.id.filter((_, i) => R.Dossier[i] === 1).map(id => { const i = R.id.indexOf(id); return `n° ${id} (${R.Nature[i]}) ${JSON.stringify(R.Personne_service ? R.Personne_service[i] : '(colonne absente)')}`; }).join(' | '); }));
  await ps.screenshot({ path: __C.sorties + '/services-143.png' });
  await ps.close();
  await browser.close();
})();
