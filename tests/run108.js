// 2.41 : circuit de validation (onglet Validation, viseurs par échelon et périmètre, statut, règles d'accès, file « à viser »
// dans la saisie) et campagnes (onglet Établissements : lancement sur la sélection du publipostage, suivi, relance CSV ;
// page d'un établissement : bandeau de campagne et « Rien à signaler »)
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');

const J = 86400, maintenant = Math.floor(Date.now() / 1000), aujourdhui = Math.floor(maintenant / J) * J;
function docValidation({ modeEtab = false } = {}) {
  const doc = { _grist_Tables: { id: [], tableId: [] }, _grist_Tables_column: { id: [], parentId: [], colId: [], type: [], label: [], isFormula: [], formula: [], widgetOptions: [], visibleCol: [], parentPos: [] }, __data: {} };
  const T = doc._grist_Tables, C = doc._grist_Tables_column, D = doc.__data;
  const table = (tid, cols, lignes) => {
    const ref = T.id.length + 1; T.id.push(ref); T.tableId.push(tid);
    cols.forEach(([colId, type, label, formula, wo], k) => { C.id.push(C.id.length + 1); C.parentId.push(ref); C.colId.push(colId); C.type.push(type); C.label.push(label || colId);
      C.isFormula.push(!!formula); C.formula.push(formula || ''); C.widgetOptions.push(wo ? JSON.stringify(wo) : ''); C.visibleCol.push(0); C.parentPos.push(k); });
    const t = { id: lignes.map((_, i) => i + 1) }; cols.forEach(([c], k) => { t[c] = lignes.map(l => l[k] === undefined ? null : l[k]); }); D[tid] = t;
  };
  const general = { situation: 'Exercice', preset: 'en', academies: ['Versailles', 'Créteil'], reponses: 'Reponses', referentiel: 'Etablissements', formulaires: 'Formulaires', agents: 'Agents' };
  const form = { blocs: [{ id: 'v1', section: 'vd', genre: 'question', colonne: 'Avis_dep' }, { id: 'v2', section: 'vd', genre: 'question', colonne: 'Obs_dep' }, { id: 'v3', section: 'va', genre: 'question', colonne: 'Avis_aca' }] };
  table('Config', [['Cle', 'Text'], ['Valeur', 'Text'], ['Modifie_le', 'DateTime:Europe/Paris']], [['general', JSON.stringify(general), maintenant]]);
  table('Formulaires', [['Nom', 'Text'], ['Table', 'Text'], ['Brouillon', 'Text'], ['Publie', 'Text'], ['Publie_le', 'DateTime:Europe/Paris'], ['Modifie_le', 'DateTime:Europe/Paris'], ['Type', 'Text'], ['Widget', 'Text']],
    [['Signalements', 'Reponses', JSON.stringify(form), JSON.stringify(form), maintenant, maintenant, 'etablissement', '']]);
  const etabs = [['Collège Albert Camus', '0781111A', 'Collège', 'Versailles', 'Versailles', 'Yvelines', 'ce.0781111a@ac-versailles.fr', 'k1', 'https://grist/p/9?Etab_=k1'],
    ['Lycée Hoche', '0782222B', 'Lycée', 'Versailles', 'Versailles', 'Yvelines', 'ce.0782222b@ac-versailles.fr', 'k2', 'https://grist/p/9?Etab_=k2'],
    ['Collège Paul Éluard', '0913333C', 'Collège', 'Évry', 'Versailles', 'Essonne', 'ce.0913333c@ac-versailles.fr', 'k3', 'https://grist/p/9?Etab_=k3'],
    ['École Jules Ferry', '0944444D', 'École', 'Vitry', 'Créteil', 'Val-de-Marne', '', 'k4', 'https://grist/p/9?Etab_=k4']];
  table('Etablissements', [['Nom', 'Text'], ['UAI', 'Text'], ['Type', 'Text'], ['Commune', 'Text'], ['Academie', 'Text'], ['Departement', 'Text'], ['Mail', 'Text'], ['UUID', 'Text'], ['Lien', 'Text', 'Lien', 'SELF_HYPERLINK(LinkKey_Etab=$UUID)']],
    modeEtab ? [[...etabs[0].slice(0, 7), ['C'], etabs[0][8]]] : etabs);
  const QUALIF = { choices: ['Fermé', 'Perturbé', 'RAS'], choiceOptions: { 'Fermé': { fillColor: '#E1000F', textColor: '#FFFFFF' }, 'Perturbé': { fillColor: '#FFCA00' }, RAS: { fillColor: '#B8FEC9' } } };
  const AVIS = { choices: ['Favorable', 'À revoir'] };
  // dossiers : 1 (Camus, à viser département), 2 (Hoche, avis départemental favorable : à viser académie),
  // 3 (Éluard, avis départemental « À revoir »), 4 (Jules Ferry, à viser département), 5 = mise à jour du dossier 1
  const rep = [[1, 1, aujourdhui - J, maintenant - J * 1.5, 'Nouveau signalement', 'Perturbé', 'Blocage partiel', false, 'Yvelines', 'Versailles', null, '', null],
    [2, 2, aujourdhui, maintenant - 3600, 'Nouveau signalement', 'Fermé', 'Fermeture administrative', true, 'Yvelines', 'Versailles', 'Favorable', 'RAS côté DSDEN', null],
    [3, 3, aujourdhui, maintenant - 3000, 'Nouveau signalement', 'Perturbé', 'Intrusion', true, 'Essonne', 'Versailles', 'À revoir', 'Préciser les faits', null],
    [4, 4, aujourdhui, maintenant - 2000, 'Nouveau signalement', 'Perturbé', 'Rassemblement', true, 'Val-de-Marne', 'Créteil', null, '', null],
    [1, 1, aujourdhui, maintenant - 1000, 'Mise à jour', 'Perturbé', 'Blocage partiel, levée prévue', true, 'Yvelines', 'Versailles', null, '', null]];
  table('Reponses', [['Etablissement', 'Ref:Etablissements'], ['Dossier', 'Ref:Reponses'], ['Date_faits', 'Date'], ['Cree_le', 'DateTime:Europe/Paris'], ['Nature', 'Choice', 'Nature', '', { choices: ['Nouveau signalement', 'Mise à jour'] }],
    ['Qualification', 'Choice', 'Qualification', '', QUALIF], ['Description', 'Text'], ['Derniere_version', 'Bool', 'Dernière version', 'return True'],
    ['Departement', 'Text', 'Département', '$Etablissement.Departement'], ['Academie', 'Text', 'Académie', '$Etablissement.Academie'],
    ['Avis_dep', 'Choice', 'Avis départemental', '', AVIS], ['Obs_dep', 'Text', 'Observations (département)'], ['Avis_aca', 'Choice', 'Avis académique', '', AVIS]],
    modeEtab ? rep.filter(r => r[0] === 1).map(r => [...r]) : rep);
  table('Agents', [['Nom', 'Text'], ['Email', 'Text'], ['Telephone', 'Text'], ['Actif', 'Bool'], ['Equipe', 'Text'], ['Fonction', 'Choice'], ['Modifie_le', 'DateTime:Europe/Paris'], ['Cle_acces', 'Text'], ['Page_saisie', 'Int'], ['Lien_expire_le', 'DateTime:Europe/Paris']],
    [['Alice Martin', 'alice@ac-versailles.fr', '', true, 'DSDEN 78', 'Opérateur'], ['Bruno Petit', '', '', true, 'Rectorat', 'Opérateur', null, 'cle-bruno', 3], ['Chloé Durand', 'chloe@education.gouv.fr', '', true, 'Cellule', 'Coordinateur']]);
  table('Creneaux', [['Date', 'Date'], ['Nom', 'Text'], ['Debut', 'DateTime:Europe/Paris'], ['Fin', 'DateTime:Europe/Paris'], ['Note', 'Text']], []);
  table('Affectations', [['Creneau', 'Ref:Creneaux'], ['Agent', 'Ref:Agents'], ['Fonction', 'Choice'], ['Perimetre', 'Text'], ['Champ', 'ChoiceList'], ['Note', 'Text'], ['Modifie_le', 'DateTime:Europe/Paris']], []);
  doc._grist_Views = { id: [], name: [] }; doc._grist_Views_section = { id: [], parentId: [], parentKey: [], tableRef: [], options: [], title: [] }; doc._grist_Pages = { id: [], viewRef: [] };
  return doc;
}
module.exports = { docValidation };

const texte = async (page, sel) => (await page.$eval(sel, e => e.innerText)).replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
const cfg = (page, cle) => page.evaluate(k => { const C = window.__DOC__.__data.Config, i = C.Cle.indexOf(k); return i < 0 ? null : JSON.parse(C.Valeur[i]); }, cle);
if (require.main === module) (async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const page = await browser.newPage({ viewport: { width: 1300, height: 1600 }, acceptDownloads: true });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => d.accept());
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(docValidation())};` + fs.readFileSync('mock.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(1500);

  /* ---------- 1. Onglet Validation ---------- */
  await page.click('nav button[data-onglet=validation]'); await page.waitForTimeout(1500);
  console.log('VALIDATION (ouverture) :\n' + (await texte(page, '#validation')).slice(0, 900));
  await page.click('#validation [data-act=colonnes]'); await page.waitForTimeout(1200);
  console.log('COLONNES DES VISEURS :', await page.evaluate(() => Object.keys(window.__DOC__.__data.Agents).filter(k => /visa/i.test(k)).join(', ')));
  await page.check('#validation section[data-table=Reponses] [data-v=actif]'); await page.waitForTimeout(400);
  console.log('PROPOSITION :', await page.$$eval('#validation section[data-table=Reponses] select', l => l.map(s => s.dataset.v + '=' + s.value).join(' | ')),
    '| valident :', await page.$$eval('#validation [data-fav]', l => l.map(x => `${x.dataset.fav}${x.checked ? ' ✓' : ''}`).join(', ')));
  await page.click('#validation [data-act=enregistrer]'); await page.waitForTimeout(1500);
  console.log('ENREGISTREMENT :', await page.textContent('#va-statut-0'));
  console.log('CONFIG validation :', JSON.stringify(await cfg(page, 'validation')));
  console.log('COLONNE DE STATUT :', await page.evaluate(() => { const C = window.__DOC__._grist_Tables_column, k = C.colId.indexOf('Statut_validation'); return k < 0 ? 'absente' : `${C.type[k]}, formule : ${C.formula[k].split('\n').slice(0, 3).join(' / ')} …`; }));
  // viseurs : Alice, départementale (Yvelines) ; Bruno (invité), académique (Créteil)
  await page.selectOption('#va-ajout-agent', { label: 'Alice Martin' }); await page.selectOption('#va-ajout-echelon', 'Départemental');
  await page.click('#validation [data-act=ajouter]'); await page.waitForTimeout(1000);
  await page.fill('#validation [data-ajout] >> nth=0', 'Yvelines'); await page.press('#validation [data-ajout] >> nth=0', 'Enter'); await page.waitForTimeout(1000);
  await page.selectOption('#va-ajout-agent', { label: 'Bruno Petit' }); await page.selectOption('#va-ajout-echelon', 'Académique');
  await page.click('#validation [data-act=ajouter]'); await page.waitForTimeout(1000);
  await page.fill('#validation tr:has-text("Bruno") [data-ajout]', 'Créteil'); await page.press('#validation tr:has-text("Bruno") [data-ajout]', 'Enter'); await page.waitForTimeout(1000);
  await page.fill('#validation tr:has-text("Bruno") [data-ajout]', 'Lyon'); await page.press('#validation tr:has-text("Bruno") [data-ajout]', 'Enter'); await page.waitForTimeout(500);
  console.log('VALEUR HORS RÉFÉRENTIEL :', await page.textContent('#va-statut-v'));
  console.log('VISEURS :', await page.evaluate(() => { const A = window.__DOC__.__data.Agents; return A.id.map((id, i) => `${A.Nom[i]} : ${A.Echelon_visa[i] || '—'} ${JSON.stringify(A.Visa_departements[i] || null)} ${JSON.stringify(A.Visa_academies[i] || null)}`).join(' | '); }));
  // Grist calcule la formule : on pose les statuts attendus (même règle, calculée en JavaScript par le socle)
  await page.evaluate(() => { const S = window.Socle, R = window.__DOC__.__data.Reponses, r = { echelons: 'dep_aca', verdict_dep: 'Avis_dep', verdict_aca: 'Avis_aca', favorables: ['Favorable'] };
    R.Statut_validation = R.id.map((_, i) => R.Derniere_version[i] ? S.statutValidation(r, { Avis_dep: R.Avis_dep[i], Avis_aca: R.Avis_aca[i] }) : null); S.viderCacheLecture(); });
  await page.click('nav button[data-onglet=installation]'); await page.click('nav button[data-onglet=validation]'); await page.waitForTimeout(1500);
  const sv = await texte(page, '#validation section[data-table=Reponses]');
  console.log('SUIVI :\n' + (sv.includes('Suivi des dossiers') ? sv.split('Suivi des dossiers')[1] : sv));
  await page.screenshot({ path: __C.sorties + '/validation-108.png', fullPage: true });

  /* ---------- 2. Règles d'accès ---------- */
  await page.click('nav button[data-onglet=acces]'); await page.waitForTimeout(1800);
  const acces = await texte(page, '#acces');
  console.log('ACCÈS, avis :', (acces.match(/[^\n]*avis (départemental|académique)[^\n]*/gi) || []).slice(0, 8).join(' || '));
  if (!/avis/i.test(acces)) console.log('ACCÈS (texte) :', acces.slice(0, 1500));
  const regles = await page.evaluate(async () => { /* formules proposées, lues dans le rendu de l'onglet */ return [...document.querySelectorAll('#acces code, #acces .ac-formule')].map(c => c.textContent).filter(t => /Echelon_visa/.test(t)).slice(0, 3); });
  console.log('ACCÈS, formules :', regles.join('\n   ') || '(non affichées)');

  /* ---------- 3. Campagnes (onglet Établissements) ---------- */
  await page.click('nav button[data-onglet=liens]'); await page.waitForTimeout(2000);
  await page.click('#liens [data-crit][data-val="Versailles"]'); await page.waitForTimeout(500);
  await page.click('#li-campagne'); await page.waitForTimeout(800);
  console.log('PROJET :', (await texte(page, '#cp-projet')).slice(0, 220));
  await page.fill('#cp-nom', 'Tempête Ciaran — situation des établissements'); await page.selectOption('#cp-mode', 'quotidienne');
  await page.click('[data-cp=lancer]'); await page.waitForTimeout(1500);
  const c0 = (await cfg(page, 'campagnes')).liste[0];
  console.log('CAMPAGNE :', JSON.stringify({ nom: c0.nom, mode: c0.mode, crit: c0.crit, avecMail: c0.avecMail }));
  console.log('SUIVI (lancement) :', (await texte(page, '.cp-campagne')).split('\n').slice(0, 9).join(' | '));
  // deux réponses après le lancement : Hoche (aujourd'hui) et Éluard (« Rien à signaler »)
  await page.evaluate(debut => { const R = window.__DOC__.__data.Reponses; [[2, 'Fermé', 'Toujours fermé'], [3, 'RAS', 'Rien à signaler.']].forEach(([e, q, d]) => {
    const id = Math.max(...R.id) + 1; R.id.push(id); R.Etablissement.push(e); R.Dossier.push(id); R.Date_faits.push(Math.floor(debut / 86400) * 86400); R.Cree_le.push(debut + 60); R.Nature.push('Nouveau signalement');
    R.Qualification.push(q); R.Description.push(d); R.Derniere_version.push(true); R.Departement.push(''); R.Academie.push(''); R.Avis_dep.push(null); R.Obs_dep.push(''); R.Avis_aca.push(null); R.Statut_validation.push('À viser (département)'); }); window.Socle.viderCacheLecture(); }, c0.debut);
  await page.click('nav button[data-onglet=installation]'); await page.click('nav button[data-onglet=liens]'); await page.waitForTimeout(2200);
  console.log('SUIVI (2 réponses) :', (await texte(page, '.cp-campagne')).split('\n').slice(3, 12).join(' | '));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-cp=relance]')]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  console.log('RELANCE :', dl.suggestedFilename(), '\n' + csv.split('\r\n').slice(0, 2).map(l => l.slice(0, 260)).join('\n'));
  await page.screenshot({ path: __C.sorties + '/campagnes-108.png', fullPage: true });
  const etatDoc = await page.evaluate(() => window.__DOC__);
  await page.close();

  /* ---------- 4. Saisie : file « à viser » d'un viseur départemental (Alice, Yvelines) ---------- */
  const doc2 = etatDoc; doc2.__data.Reponses.Departement = doc2.__data.Reponses.Departement.map((d, i) => d || ['', 'Yvelines', 'Yvelines', 'Essonne', 'Val-de-Marne'][doc2.__data.Reponses.Etablissement[i]]);
  const ps = await browser.newPage({ viewport: { width: 1200, height: 1400 } });
  ps.on('pageerror', e => console.log('PAGEERROR (saisie)', e.message)); ps.on('dialog', d => d.accept());
  await ps.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc2)};window.__OPTS__=${JSON.stringify({ formulaire: 'Signalements', agent: 1 })};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + fs.readFileSync('mock-saisie.js') }));
  await ps.goto('file://' + __C.racine + '/v2/saisie/index.html'); await ps.waitForTimeout(2500);
  console.log('SAISIE, BANDEAU :', await texte(ps, '#bandeau-visa'));
  console.log('SAISIE, CARTES (toutes) :', await ps.$$eval('#cartes-signalements .carte-titre', l => l.map(x => x.innerText.replace(/\s+/g, ' ').trim()).join(' | ')));
  await ps.click('#btn-file-visa'); await ps.waitForTimeout(500);
  console.log('SAISIE, FILE :', await ps.textContent('#titre-liste'), '→', await ps.$$eval('#cartes-signalements .carte-titre', l => l.map(x => x.innerText.replace(/\s+/g, ' ').trim()).join(' | ')));
  await ps.click('#cartes-signalements .carte-sig >> nth=0'); await ps.waitForTimeout(1500);
  console.log('SAISIE, DOSSIER OUVERT :', (await ps.textContent('#titre')).replace(/\s+/g, ' ').trim(), '| onglet Visas visible :', !(await ps.$eval('#onglet-visas', e => e.hidden)),
    '| visa départemental :', !(await ps.$eval('#form-visa-dep', e => e.hidden)), '| visa académique :', !(await ps.$eval('#form-visa-aca', e => e.hidden)));
  await ps.screenshot({ path: __C.sorties + '/saisie-visa-108.png', fullPage: true });
  await ps.close();

  /* ---------- 5. Page d'un établissement (lien) : campagne et « Rien à signaler » ---------- */
  const doc3 = docValidation({ modeEtab: true });
  doc3.__data.Config.id.push(doc3.__data.Config.id.length + 1); doc3.__data.Config.Cle.push('campagnes'); doc3.__data.Config.Valeur.push(JSON.stringify({ liste: [{ ...c0, debut: maintenant - 600 }] })); doc3.__data.Config.Modifie_le.push(maintenant);
  const pe = await browser.newPage({ viewport: { width: 1000, height: 1200 } });
  pe.on('pageerror', e => console.log('PAGEERROR (établissement)', e.message)); pe.on('dialog', d => { console.log('DIALOGUE :', d.message()); d.accept(); });
  await pe.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc3)};window.__OPTS__=${JSON.stringify({ formulaire: 'Signalements', etablissements: 'Etablissements' })};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + fs.readFileSync('mock-saisie.js') }));
  await pe.goto('file://' + __C.racine + '/v2/saisie/index.html'); await pe.waitForTimeout(2500);
  console.log('ÉTABLISSEMENT, BANDEAU :', await texte(pe, '#bandeau-campagne'), '| statut visible sur les cartes :', await pe.$$eval('.pastille-statut', l => l.length));
  await pe.screenshot({ path: __C.sorties + '/etab-campagne-108.png', fullPage: true });
  await pe.click('#btn-rien-a-signaler'); await pe.waitForTimeout(2500);
  console.log('ÉTABLISSEMENT, RÉPONSE ENREGISTRÉE :', await pe.evaluate(() => { const R = window.__DOC__.__data.Reponses, i = R.id.length - 1; return `n° ${R.id[i]} : ${R.Qualification[i]} / « ${R.Description[i]} » / ${R.Nature[i]}`; }),
    '|', (await pe.textContent('#statut-signalement')).trim());
  await pe.click('#btn-retour-liste').catch(() => {}); await pe.waitForTimeout(800);
  console.log('ÉTABLISSEMENT, BANDEAU APRÈS :', await texte(pe, '#bandeau-campagne'));
  await browser.close();
})();
