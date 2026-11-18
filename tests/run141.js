// 2.62.0-alpha.33 : éléments réservés aux services (partie de rôle « r » du formulaire).
// Administration : ajout de la partie, réglage des échelons, publication (formule de reprise posée sur les colonnes
// réservées) ; onglet Accès (modification par les agents mobilisés et les viseurs de l'échelon, lecture fermée aux
// établissements et aux partenaires) ; saisie : onglet « Compléments » pour un viseur départemental de son périmètre,
// absent pour un viseur académique quand seul le département est coché, absent pour l'établissement.
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docValidation } = require('./run108');

// colonne ajoutée à une table du document d'essai (structure et valeurs)
function ajouterColonne(doc, tid, colId, type, label, valeurs, wo, formula = '', isFormula = false) {
  const T = doc._grist_Tables, C = doc._grist_Tables_column, ref = T.id[T.tableId.indexOf(tid)];
  C.id.push(C.id.length + 1); C.parentId.push(ref); C.colId.push(colId); C.type.push(type); C.label.push(label || colId);
  C.isFormula.push(isFormula); C.formula.push(formula); C.widgetOptions.push(wo ? JSON.stringify(wo) : ''); C.visibleCol.push(0); C.parentPos.push(C.id.length);
  const D = doc.__data[tid]; D[colId] = D.id.map((_, i) => (valeurs && valeurs[i] !== undefined) ? valeurs[i] : null);
}
function docReserve({ modeEtab = false, echelons = ['dep', 'aca'], avecPartie = true } = {}) {
  const doc = docValidation({ modeEtab });
  ajouterColonne(doc, 'Reponses', 'Appreciation', 'Text', 'Appréciation de la DSDEN', []);
  ajouterColonne(doc, 'Reponses', 'Moyens', 'ChoiceList', 'Moyens engagés', [], { choices: ['Équipe mobile de sécurité', 'Renfort de personnels', 'Demande de sécurisation à la préfecture'] });
  ajouterColonne(doc, 'Agents', 'Echelon_visa', 'Choice', 'Échelon de visa', ['Départemental', 'Académique', null], { choices: ['Départemental', 'Académique'] });
  ajouterColonne(doc, 'Agents', 'Visa_departements', 'ChoiceList', 'Départements visés', [['L', 'Yvelines'], null, null]);
  ajouterColonne(doc, 'Agents', 'Visa_academies', 'ChoiceList', 'Académies visées', [null, ['L', 'Créteil'], null]);
  const F = doc.__data.Formulaires, conf = JSON.parse(F.Publie[0]);
  conf.parties = [{ id: 'q', nom: 'Signalement', role: 'q' }, { id: 'vd', nom: 'Visa départemental', role: 'vd' }, { id: 'va', nom: 'Visa académique', role: 'va' }];
  // sans la partie : les deux questions sont d'abord dans le signalement (l'essai les déplace dans la partie ajoutée)
  if (avecPartie) conf.parties.push({ id: 'r', nom: 'Éléments réservés', role: 'r', echelons });
  conf.blocs.push({ id: 'r1', section: avecPartie ? 'r' : 'q', genre: 'question', colonne: 'Appreciation' }, { id: 'r2', section: avecPartie ? 'r' : 'q', genre: 'question', colonne: 'Moyens' });
  F.Publie[0] = F.Brouillon[0] = JSON.stringify(conf);
  return doc;
}
const texte = async (page, sel) => (await page.$eval(sel, e => e.innerText)).replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
const api = doc => `window.__DOC__=${JSON.stringify(doc)};`;

(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });

  /* ---------- 1. Administration › Formulaires : ajout de la partie, échelons, publication ---------- */
  const page = await browser.newPage({ viewport: { width: 1400, height: 1600 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => d.accept());
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: api(docReserve({ avecPartie: false })) + fs.readFileSync('mock.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(1500);
  await page.click('nav button[data-onglet=formulaires]'); await page.waitForTimeout(1500);
  console.log('BOUTON « PARTIE RÉSERVÉE » :', await page.$eval('#btn-ajout-reserve', b => b.textContent).catch(() => 'absent'));
  await page.click('#btn-ajout-reserve'); await page.waitForTimeout(800);
  console.log('PANNEAU DE LA PARTIE :', (await texte(page, '#panneau')).slice(0, 700));
  console.log('BOUTON APRÈS AJOUT :', await page.$('#btn-ajout-reserve') ? 'encore là' : 'retiré (une seule partie réservée)');
  await page.uncheck('#panneau [data-echelon=aca]'); await page.waitForTimeout(600);
  // les deux questions passent du signalement à la partie réservée (choix « Partie du formulaire » de leur panneau)
  for (const id of ['r1', 'r2']) { await page.click(`[data-bloc="${id}"]`); await page.waitForTimeout(400); await page.selectOption('#pa-section', 'r'); await page.waitForTimeout(600); }
  console.log('APERÇU, FEUILLE RÉSERVÉE :', await texte(page, '.feuille.reserve'));
  await page.click('#btn-publier'); await page.waitForTimeout(2500);
  console.log('PUBLICATION :', await page.$eval('#msg-global', e => e.innerText.trim()).catch(() => '?'));
  const etat = await page.evaluate(() => {
    const C = window.__DOC__._grist_Tables_column, F = window.__DOC__.__data.Formulaires;
    const col = c => { const k = C.colId.indexOf(c); return `${c} : isFormula=${C.isFormula[k]}, formule « ${String(C.formula[k]).split('\n').join(' / ')} »`; };
    return { parties: JSON.parse(F.Publie[0]).parties, cols: ['Appreciation', 'Moyens', 'Obs_dep'].map(col) };
  });
  console.log('PARTIES PUBLIÉES :', JSON.stringify(etat.parties));
  console.log('COLONNES :\n  ' + etat.cols.join('\n  '));

  /* ---------- 2. Onglet Accès ---------- */
  await page.click('nav button[data-onglet=acces]'); await page.waitForTimeout(1800);
  const acces = await texte(page, '#acces');
  const lignesAcces = acces.split('\n'), k = lignesAcces.findIndex(l => /— éléments réservés \(/.test(l));
  console.log('ACCÈS, éléments réservés :\n  ' + (k < 0 ? '(absent)' : lignesAcces.slice(k, k + 6).join('\n  ')));
  console.log('ACCÈS, partenaires et établissements :', (acces.match(/[^\n]*éléments réservés illisibles[^\n]*/g) || []).join(' || '));
  await page.close();

  /* ---------- 3. Saisie : viseur départemental (Alice, Yvelines) ---------- */
  const ouvrir = async (doc, opts, titre) => {
    const p = await browser.newPage({ viewport: { width: 1200, height: 1500 } });
    p.on('pageerror', e => console.log(`PAGEERROR (${titre})`, e.message)); p.on('dialog', d => d.accept());
    await p.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: api(doc) + `window.__OPTS__=${JSON.stringify(opts)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + fs.readFileSync('mock-saisie.js') }));
    await p.goto('file://' + __C.racine + '/v2/saisie/index.html'); await p.waitForTimeout(2500);
    return p;
  };
  const docDep = docReserve({ echelons: ['dep'] });
  const ps = await ouvrir(docDep, { formulaire: 'Signalements', agent: 1 }, 'viseur départemental');
  await ps.click('#cartes-signalements .carte-sig:has-text("Albert Camus")'); await ps.waitForTimeout(1500);
  console.log('DÉPARTEMENT, DOSSIER :', (await ps.textContent('#titre')).replace(/\s+/g, ' ').trim(), '| onglet Compléments :', !(await ps.$eval('#onglet-complements', e => e.hidden)));
  await ps.click('#onglet-complements'); await ps.waitForTimeout(400);
  console.log('DÉPARTEMENT, ONGLET :', await texte(ps, '#panneau-complements'));
  await ps.fill('#panneau-complements textarea, #panneau-complements input[type=text] >> nth=0', 'Contexte tendu, reprise possible demain.');
  await ps.check('#panneau-complements input[type=checkbox] >> nth=0').catch(async () => { await ps.click('#panneau-complements [data-champ="r-Moyens"] label >> nth=0'); });
  await ps.click('#form-reserve button[type=submit]'); await ps.waitForTimeout(1500);
  console.log('DÉPARTEMENT, ENREGISTREMENT :', (await ps.textContent('#statut-res')).trim());
  console.log('DÉPARTEMENT, LIGNES :', await ps.evaluate(() => { const R = window.__DOC__.__data.Reponses; return R.id.filter((_, i) => R.Dossier[i] === 1).map(id => { const i = R.id.indexOf(id); return `n° ${id} (${R.Nature[i]}) : ${JSON.stringify(R.Appreciation[i])} ${JSON.stringify(R.Moyens[i])}`; }).join(' | '); }));
  await ps.screenshot({ path: __C.sorties + '/complements-141.png', fullPage: true });
  await ps.close();

  /* ---------- 4. Saisie : viseur académique (Bruno, Créteil), partie réservée au département ---------- */
  const pa = await ouvrir(docReserve({ echelons: ['dep'] }), { formulaire: 'Signalements', agent: 2 }, 'viseur académique');
  await pa.click('#cartes-signalements .carte-sig:has-text("Jules Ferry")'); await pa.waitForTimeout(1500);
  console.log('ACADÉMIE (département seul coché), onglet Compléments :', !(await pa.$eval('#onglet-complements', e => e.hidden)));
  await pa.close();
  const pa2 = await ouvrir(docReserve({ echelons: ['dep', 'aca'] }), { formulaire: 'Signalements', agent: 2 }, 'viseur académique (2)');
  await pa2.click('#cartes-signalements .carte-sig:has-text("Jules Ferry")'); await pa2.waitForTimeout(1500);
  console.log('ACADÉMIE (département et académie cochés), Jules Ferry (Créteil) :', !(await pa2.$eval('#onglet-complements', e => e.hidden)));
  await pa2.click('#btn-retour-liste').catch(() => {}); await pa2.waitForTimeout(600);
  await pa2.click('#cartes-signalements .carte-sig:has-text("Lycée Hoche")'); await pa2.waitForTimeout(1500);
  console.log('ACADÉMIE (département et académie cochés), Lycée Hoche (Versailles, hors périmètre) :', !(await pa2.$eval('#onglet-complements', e => e.hidden)));
  await pa2.close();

  /* ---------- 5. Saisie : page d'un établissement (lien) ---------- */
  const pe = await ouvrir(docReserve({ modeEtab: true }), { formulaire: 'Signalements', etablissements: 'Etablissements' }, 'établissement');
  await pe.click('#cartes-signalements .carte-sig >> nth=0').catch(() => {}); await pe.waitForTimeout(1500);
  console.log('ÉTABLISSEMENT, onglet Compléments :', !(await pe.$eval('#onglet-complements', e => e.hidden)), '| onglet Visas :', !(await pe.$eval('#onglet-visas', e => e.hidden)));
  await pe.close();
  await browser.close();
})();
