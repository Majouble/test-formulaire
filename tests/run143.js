// 2.62.0-alpha.37 : partenaires « services » (DSDEN, rectorats…) — un lien commun pour consulter la fiche établissement
// et le tableau de bord et compléter les fiches. Administration › Accès, carte « Partenaires : DSDEN, rectorats… » :
// préparation (colonnes Echelon, Departements, échéance ; partenaire existant repris en « Académique » ; colonne d'aide
// d'une académie en référence ; département d'une table de la fiche), création par lot, pages des partenaires (compléments,
// tableau de bord), CSV ; règles d'accès (périmètre par échelon, éléments réservés et données demandées modifiables,
// tables non ouvertes fermées) ; saisie en page des partenaires (ni nouveau signalement ni mise à jour, dossier ouvert
// sur ses compléments, éléments réservés enregistrés).
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docValidation } = require('./run108');

function docPartenaires() {
  const doc = docValidation(), T = doc._grist_Tables, C = doc._grist_Tables_column;
  const colonne = (tid, colId, type, label, valeurs, wo) => {
    const ref = T.id[T.tableId.indexOf(tid)];
    C.id.push(C.id.length + 1); C.parentId.push(ref); C.colId.push(colId); C.type.push(type); C.label.push(label || colId);
    C.isFormula.push(false); C.formula.push(''); C.widgetOptions.push(wo ? JSON.stringify(wo) : ''); C.visibleCol.push(0); C.parentPos.push(C.id.length);
    const D = doc.__data[tid]; D[colId] = D.id.map((_, i) => (valeurs && valeurs[i] !== undefined) ? valeurs[i] : null);
  };
  const table = (tid, cols, rows) => { const ref = T.id.length + 1; T.id.push(ref); T.tableId.push(tid); doc.__data[tid] = { id: rows.map((_, i) => i + 1) };
    cols.forEach(([colId, type, label, formula, vis], k) => { doc.__data[tid][colId] = rows.map(r => r[k]); C.id.push(C.id.length + 1); C.parentId.push(ref); C.colId.push(colId); C.type.push(type); C.label.push(label || colId); C.isFormula.push(!!formula); C.formula.push(formula || ''); C.widgetOptions.push(''); C.visibleCol.push(vis || 0); C.parentPos.push(C.id.length); });
    return ref; };
  // éléments réservés (partie « r ») et données demandées (Internat)
  colonne('Reponses', 'Appreciation', 'Text', 'Appréciation de la DSDEN', []);
  colonne('Etablissements', 'Internat', 'Choice', 'Internat', [], { choices: ['Oui', 'Non'] });
  const F = doc.__data.Formulaires, conf = JSON.parse(F.Publie[0]);
  conf.parties = [{ id: 'q', nom: 'Signalement', role: 'q' }, { id: 'vd', nom: 'Visa départemental', role: 'vd' }, { id: 'va', nom: 'Visa académique', role: 'va' }, { id: 'r', nom: 'Éléments réservés', role: 'r', echelons: ['dep', 'aca'] }];
  conf.blocs.push({ id: 'r1', section: 'r', genre: 'question', colonne: 'Appreciation' });
  F.Publie[0] = F.Brouillon[0] = JSON.stringify(conf);
  const Cf = doc.__data.Config, cle = (k, v) => { Cf.id.push(Cf.id.length + 1); Cf.Cle.push(k); Cf.Valeur.push(JSON.stringify(v)); Cf.Modifie_le.push(0); };
  cle('structurel', { tables: { Etablissements: { colonnes: { Internat: 'masquee' }, echelons: ['dep', 'aca'] } } });
  cle('partenaires', { tables: ['Faits'] });
  // table des académies ; Faits (fiche) rattachée à l'établissement, académie en référence ; Notes, non ouverte
  table('Academies', [['Nom', 'Text']], [['Versailles'], ['Créteil']]);
  const nomAca = C.id[C.colId.lastIndexOf('Nom')];
  table('Faits', [['Etablissement', 'Ref:Etablissements'], ['Academie', 'Ref:Academies', 'Académie', '', nomAca], ['Fait', 'Text']], [[1, 1, 'Intrusion'], [3, 2, 'Blocage']]);
  table('Notes', [['Texte', 'Text']], [['note interne']]);
  // table Partenaires (avant la 2.62.0-alpha.37) : un partenaire limité à Versailles
  table('Partenaires', [['Nom', 'Text'], ['Cle', 'Text'], ['Actif', 'Bool'], ['Lien', 'Text', '', 'SELF_HYPERLINK()'], ['Fiche', 'Text'], ['Lecture_seule', 'Bool'], ['Academies', 'ChoiceList']],
    [['Préfecture des Yvelines', 'cle-pref', true, '', '', false, ['L', 'Versailles']]]);
  // pages : fiche des partenaires, tableau de bord, page de saisie d'Alice
  const V = doc._grist_Views, Sx = doc._grist_Views_section, P = doc._grist_Pages, refRep = T.id[T.tableId.indexOf('Reponses')];
  const page = (nom, url, wo) => { const v = V.id.length + 1; V.id.push(v); V.name.push(nom); P.id.push(P.id.length + 1); P.viewRef.push(v);
    Sx.id.push(Sx.id.length + 1); Sx.parentId.push(v); Sx.parentKey.push('custom'); Sx.tableRef.push(refRep); Sx.title.push(nom);
    Sx.options.push(JSON.stringify({ customView: JSON.stringify({ mode: 'url', url, access: 'full', widgetOptions: wo }) })); };
  page('Fiche partenaires', 'https://exemple.fr/v2/fiche/', { partenaires: true });
  page('Tableau de bord', 'https://exemple.fr/v2/tableau-de-bord/', { mode: 'complet' });
  page('Formulaire Alice Martin', 'https://exemple.fr/v2/saisie/', { formulaire: 'Signalements', libelle: 'Alice Martin', agent: 1 });
  return doc;
}
const texte = async (page, sel) => (await page.$eval(sel, e => e.innerText)).replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
const api = doc => `window.__DOC__=${JSON.stringify(doc)};`;

(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });

  /* ---------- 1. Administration › Accès, carte « Partenaires : DSDEN, rectorats… » ---------- */
  const page = await browser.newPage({ viewport: { width: 1400, height: 2400 }, acceptDownloads: true });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => d.accept());
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: api(docPartenaires()) + fs.readFileSync('mock.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(1500);
  await page.click('nav button[data-onglet=acces]'); await page.waitForTimeout(3000);
  console.log('CARTE (ouverture) :\n' + (await texte(page, '#ac-partenaires')).split('\n').filter(l => !/^(24 heures|3 jours|7 jours|30 jours|sans limite)$/.test(l)).join('\n'));
  await page.click('#ac-partenaires [data-pa-act=preparer]'); await page.waitForTimeout(3000);
  console.log('PRÉPARATION :', await page.textContent('#pa-statut'));
  console.log('PARTENAIRE EXISTANT :', await page.evaluate(() => { const P = window.__DOC__.__data.Partenaires; return `${P.Nom[0]} : ${P.Echelon[0]} ${JSON.stringify(P.Academies[0])}`; }));
  await page.click('#ac-partenaires [data-pa-act=creer]'); await page.waitForTimeout(3000);
  console.log('CRÉATION :', await page.textContent('#pa-statut'));
  console.log('PARTENAIRES :\n  ' + await page.evaluate(() => { const P = window.__DOC__.__data.Partenaires;
    return P.id.map((id, i) => `${P.Nom[i]} : ${P.Echelon[i]}, ${JSON.stringify(P.Departements[i] || P.Academies[i])}, clé ${P.Cle[i] ? 'oui' : 'non'}, échéance ${P.Lien_expire_le[i] ? Math.round((P.Lien_expire_le[i] - Date.now() / 1000) / 86400) + ' j' : '—'}`).join('\n  '); }));
  await page.click('#ac-partenaires [data-pa-act=pages]'); await page.waitForTimeout(2500);
  console.log('PAGES :', await page.textContent('#pa-statut'));
  console.log('OPTIONS DES PAGES :', await page.evaluate(() => { const Sx = window.__DOC__._grist_Views_section;
    return Sx.title.map((t, i) => { if (!/partenaires/.test(t)) return null; const cv = JSON.parse(JSON.parse(Sx.options[i]).customView); return `${t} → ${cv.url} ${JSON.stringify(cv.widgetOptions)}`; }).filter(Boolean).join(' | '); }));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#ac-partenaires [data-pa-act=csv]')]);
  console.log('CSV :', dl.suggestedFilename(), '|', fs.readFileSync(await dl.path(), 'utf8').replace(/^﻿/, '').split('\r\n').slice(0, 2).join(' / '));

  /* ---------- 2. Règles proposées ---------- */
  await page.click('nav button[data-onglet=formulaires]'); await page.waitForTimeout(500); await page.click('nav button[data-onglet=acces]'); await page.waitForTimeout(3000);
  const lignes = (await texte(page, '#acces')).split('\n');
  console.log('RÈGLES (partenaires) :\n  ' + [...new Set(lignes.filter(l => /^Partenaires? /.test(l)))].join('\n  '));
  const brut = await page.$eval('#acces', e => e.textContent);
  const formule = re => (brut.match(re) || ['absente'])[0];
  console.log('PÉRIMÈTRE (Faits, académie en référence) :', formule(/\(user\.Partenaire\.Echelon == "National" or \(user\.Partenaire\.Echelon == "Départemental" and user\.Partenaire\.Departements and rec\.Departement in user\.Partenaire\.Departements\) or \(user\.Partenaire\.Echelon == "Académique" and user\.Partenaire\.Academies and rec\.Academie_nom in user\.Partenaire\.Academies\)\)/));
  console.log('CONDITION DU LIEN :', formule(/user\.Partenaire and user\.LinkKey\.Partenaire and user\.Partenaire\.Actif( and user\.Partenaire\.Lien_valide)?/));
  console.log('TABLE NON OUVERTE (Notes) :', lignes.some(l => /^Notes —/.test(l)) ? 'règle propre' : 'aucune règle propre : fermée par la règle par défaut (réservée aux agents)');
  const etat = await page.evaluate(() => window.__DOC__);
  await page.close();

  /* ---------- 3. Saisie, page des compléments des partenaires ---------- */
  const ps = await browser.newPage({ viewport: { width: 1200, height: 1500 } });
  ps.on('pageerror', e => console.log('PAGEERROR (partenaire)', e.message)); ps.on('dialog', d => d.accept());
  await ps.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: api(etat) + `window.__OPTS__=${JSON.stringify({ formulaire: 'Signalements', libelle: 'Partenaires', partenaires: true })};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + fs.readFileSync('mock-saisie.js') }));
  await ps.goto('file://' + __C.racine + '/v2/saisie/index.html'); await ps.waitForTimeout(2500);
  console.log('ACCUEIL : « Nouveau signalement »', await ps.$eval('#porte-nouveau', e => e.hidden || getComputedStyle(e).display === 'none') ? 'retiré' : 'présent', '|', (await ps.textContent('#porte-retrouver-texte')).trim());
  await ps.click('#cartes-signalements .carte-sig:has-text("Albert Camus")'); await ps.waitForTimeout(1800);
  console.log('DOSSIER : onglet affiché', await ps.$eval('[role=tab][aria-selected=true]', e => e.textContent.trim()), '| champs du signalement désactivés :',
    await ps.$$eval('#form-signalement :is(input, textarea, select)', l => `${l.filter(e => e.disabled).length}/${l.length}`), '| boutons du formulaire visibles :',
    await ps.$$eval('#form-signalement .actions button', l => l.filter(b => b.offsetParent).length));
  console.log('COMPLÉMENTS :', (await texte(ps, '#panneau-complements')).split('\n').slice(0, 8).join(' / '));
  await ps.fill('#form-reserve textarea', 'Situation suivie par la DSDEN.'); await ps.click('#form-reserve button[type=submit]'); await ps.waitForTimeout(1500);
  console.log('ENREGISTREMENT :', (await ps.textContent('#statut-res')).trim(), '|', await ps.evaluate(() => { const R = window.__DOC__.__data.Reponses; return R.id.map((id, i) => R.Dossier[i] === 1 ? `n° ${id} ${JSON.stringify(R.Appreciation[i])}` : null).filter(Boolean).join(' | '); }));
  await ps.screenshot({ path: __C.sorties + '/partenaires-143.png' });
  await ps.close();
  await browser.close();
})();
