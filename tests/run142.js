// 2.62.0-alpha.34 : données structurelles demandées aux services.
// Administration › Référentiel, carte « Données demandées aux services » : colonnes proposées (celles de l'annuaire
// grisées), ajout d'une colonne, droits de l'établissement, échelons, enregistrement (Config, colonnes de mise à jour
// avec formules d'initialisation recalculées) ; onglet Accès ; saisie : bloc « Données de l'établissement » de l'onglet
// Compléments pour un viseur départemental de son périmètre (champ à compléter, enregistrement dans le référentiel),
// absent pour un viseur académique quand seul le département est coché.
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docValidation } = require('./run108');

function ajouterColonne(doc, tid, colId, type, label, valeurs, wo) {
  const T = doc._grist_Tables, C = doc._grist_Tables_column, ref = T.id[T.tableId.indexOf(tid)];
  C.id.push(C.id.length + 1); C.parentId.push(ref); C.colId.push(colId); C.type.push(type); C.label.push(label || colId);
  C.isFormula.push(false); C.formula.push(''); C.widgetOptions.push(wo ? JSON.stringify(wo) : ''); C.visibleCol.push(0); C.parentPos.push(C.id.length);
  const D = doc.__data[tid]; D[colId] = D.id.map((_, i) => (valeurs && valeurs[i] !== undefined) ? valeurs[i] : null);
}
function docStructurel(reglage) {
  const doc = docValidation();
  ajouterColonne(doc, 'Etablissements', 'Effectif', 'Int', 'Effectif', [512, 1430, null, 210]);
  ajouterColonne(doc, 'Etablissements', 'Internat', 'Choice', 'Internat', [null, 'Oui', null, null], { choices: ['Oui', 'Non'] });
  ajouterColonne(doc, 'Agents', 'Echelon_visa', 'Choice', 'Échelon de visa', ['Départemental', 'Académique', null], { choices: ['Départemental', 'Académique'] });
  ajouterColonne(doc, 'Agents', 'Visa_departements', 'ChoiceList', 'Départements visés', [['L', 'Yvelines'], null, null]);
  ajouterColonne(doc, 'Agents', 'Visa_academies', 'ChoiceList', 'Académies visées', [null, ['L', 'Créteil'], null]);
  if (reglage) { const C = doc.__data.Config; C.id.push(C.id.length + 1); C.Cle.push('structurel'); C.Valeur.push(JSON.stringify(reglage)); C.Modifie_le.push(0); }
  return doc;
}
const texte = async (page, sel) => (await page.$eval(sel, e => e.innerText)).replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
const api = doc => `window.__DOC__=${JSON.stringify(doc)};`;

(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });

  /* ---------- 1. Administration › Référentiel : carte « Données demandées aux services » ---------- */
  const page = await browser.newPage({ viewport: { width: 1400, height: 2000 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => d.accept());
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: api(docStructurel()) + fs.readFileSync('mock.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await page.route('https://data.education.gouv.fr/**', r => r.fulfill({ status: 503, body: '' }));
  await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(1500);
  await page.click('nav button[data-onglet=referentiel]'); await page.waitForTimeout(2500);
  console.log('CARTE (ouverture) :\n' + (await texte(page, '#ref-structurel')).split('\n').slice(0, 22).join('\n'));
  await page.click('#ref-structurel .st-ajout summary'); await page.fill('#ref-structurel [data-st-nouv]', 'Référent sûreté'); await page.click('#ref-structurel [data-st-act=ajouter]'); await page.waitForTimeout(1500);
  console.log('AJOUT :', await page.textContent('#st-statut-0'));
  await page.check('#ref-structurel [data-st-col=Effectif]'); await page.waitForTimeout(300);
  await page.selectOption('#ref-structurel [data-st-droit=Effectif]', 'lecture');
  await page.check('#ref-structurel [data-st-col=Internat]'); await page.waitForTimeout(300);
  await page.selectOption('#ref-structurel [data-st-droit=Internat]', 'modification');
  await page.uncheck('#ref-structurel [data-st-echelon=aca]'); await page.waitForTimeout(300);
  console.log('COLONNE DE L\'ANNUAIRE (UAI) désactivée :', await page.$eval('#ref-structurel [data-st-col=UAI]', c => c.disabled));
  await page.click('#ref-structurel [data-st-act=enregistrer]'); await page.waitForTimeout(2000);
  console.log('ENREGISTREMENT :', await page.textContent('#st-statut-0'));
  console.log('CONFIG structurel :', await page.evaluate(() => { const C = window.__DOC__.__data.Config; return C.Valeur[C.Cle.indexOf('structurel')]; }));
  console.log('COLONNES DE MISE À JOUR :', await page.evaluate(() => {
    const C = window.__DOC__._grist_Tables_column, nom = id => C.colId[C.id.indexOf(id)];
    return ['Donnees_maj_le', 'Donnees_maj_par'].map(c => { const k = C.colId.indexOf(c); if (k < 0) return `${c} absente`;
      const deps = C.recalcDeps ? C.recalcDeps[k] : null;
      return `${c} (${C.type[k]}) : formule « ${String(C.formula[k]).split('\n')[0]} … », recalculée quand change : ${deps ? deps.slice(1).map(nom).join(', ') : '(non transmis au faux Grist)'}`; }).join(' | ');
  }));
  console.log('CARTE (après) :\n' + (await texte(page, '#ref-structurel')).split('\n').slice(3, 14).join('\n'));
  await page.screenshot({ path: __C.sorties + '/structurel-142.png', fullPage: true });

  /* ---------- 2. Onglet Accès ---------- */
  await page.click('nav button[data-onglet=acces]'); await page.waitForTimeout(1800);
  const lignes = (await texte(page, '#acces')).split('\n');
  lignes.forEach((l, k) => { if (/données demandées aux services, établissement|date et auteur des données demandées/.test(l)) console.log('ACCÈS :', lignes.slice(k, k + 5).join(' / ')); });
  const etat = await page.evaluate(() => window.__DOC__);
  await page.close();

  /* ---------- 3. Saisie : viseur départemental (Alice, Yvelines) ---------- */
  const ouvrir = async (doc, opts, titre) => {
    const p = await browser.newPage({ viewport: { width: 1200, height: 1500 } });
    p.on('pageerror', e => console.log(`PAGEERROR (${titre})`, e.message)); p.on('dialog', d => d.accept());
    await p.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: api(doc) + `window.__OPTS__=${JSON.stringify(opts)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + fs.readFileSync('mock-saisie.js') }));
    await p.goto('file://' + __C.racine + '/v2/saisie/index.html'); await p.waitForTimeout(2500);
    return p;
  };
  const ps = await ouvrir(etat, { formulaire: 'Signalements', agent: 1 }, 'viseur départemental');
  await ps.click('#cartes-signalements .carte-sig:has-text("Albert Camus")'); await ps.waitForTimeout(1800);
  console.log('DÉPARTEMENT, onglet Compléments :', !(await ps.$eval('#onglet-complements', e => e.hidden)), '| éléments réservés :', !(await ps.$eval('#form-reserve', e => e.hidden)));
  await ps.click('#onglet-complements'); await ps.waitForTimeout(400);
  console.log('DÉPARTEMENT, BLOC :', await texte(ps, '#bloc-structurel'));
  console.log('DÉPARTEMENT, champs à compléter :', await ps.$$eval('#bloc-structurel .fe-champ.a-completer label', l => l.map(x => x.textContent.trim()).join(', ')));
  await ps.fill('#st-Referent_surete', 'M. Dupont, 01 23 45 67 89'); await ps.press('#st-Referent_surete', 'Tab'); await ps.waitForTimeout(1200);
  await ps.selectOption('#st-Internat', 'Non'); await ps.waitForTimeout(1200);
  console.log('DÉPARTEMENT, ENREGISTREMENT :', (await ps.textContent('#statut-structurel')).trim(), '|', (await ps.textContent('#nb-structurel')).trim(), '| pastille masquée :', await ps.$eval('#nb-structurel', e => e.hidden));
  console.log('DÉPARTEMENT, RÉFÉRENTIEL :', await ps.evaluate(() => { const E = window.__DOC__.__data.Etablissements, i = E.Nom.indexOf('Collège Albert Camus'); return `Référent : ${E.Referent_surete[i]} | Internat : ${E.Internat[i]} | Effectif : ${E.Effectif[i]}`; }));
  await ps.screenshot({ path: __C.sorties + '/structurel-saisie-142.png', fullPage: true });
  await ps.close();

  /* ---------- 4. Saisie : viseur académique (Bruno, Créteil), seul le département coché ---------- */
  const pa = await ouvrir(etat, { formulaire: 'Signalements', agent: 2 }, 'viseur académique');
  await pa.click('#cartes-signalements .carte-sig:has-text("Jules Ferry")'); await pa.waitForTimeout(1500);
  console.log('ACADÉMIE (département seul coché), onglet Compléments :', !(await pa.$eval('#onglet-complements', e => e.hidden)));
  await pa.close();
  await browser.close();
})();
