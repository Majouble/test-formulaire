// 2.62.0-alpha.41 : demandes de compléments aux partenaires sur une sélection d'établissements.
// Extractions (filtre de qualification) et Fiche établissement (sélection) : bouton « Demander des compléments… », fenêtre
// commune (données demandées, éléments réservés, consigne, échéance), clé « demandes » de Config ; administration ›
// Établissements, carte « Demandes de compléments » (avancement par académie, à compléter, CSV, clore) ; règles d'accès
// (ligne « demandes » de Config illisible des établissements) ; page des compléments des partenaires (demande à l'accueil,
// donnée complétée sur place, compte mis à jour, éléments réservés du dernier signalement).
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docValidation } = require('./run108');
const { docFiche, CONFIG } = require('./run127');

function docDemandes() {
  const doc = docValidation(), T = doc._grist_Tables, C = doc._grist_Tables_column;
  const colonne = (tid, colId, type, label, valeurs, wo) => {
    const ref = T.id[T.tableId.indexOf(tid)];
    C.id.push(C.id.length + 1); C.parentId.push(ref); C.colId.push(colId); C.type.push(type); C.label.push(label || colId);
    C.isFormula.push(false); C.formula.push(''); C.widgetOptions.push(wo ? JSON.stringify(wo) : ''); C.visibleCol.push(0); C.parentPos.push(C.id.length);
    const D = doc.__data[tid]; D[colId] = D.id.map((_, i) => (valeurs && valeurs[i] !== undefined) ? valeurs[i] : null);
  };
  // éléments réservés (partie « r ») ; données demandées : Internat (déjà renseigné pour Hoche) et Referent_surete
  colonne('Reponses', 'Appreciation', 'Text', 'Appréciation de la DSDEN', []);
  colonne('Etablissements', 'Internat', 'Choice', 'Internat', [null, 'Oui'], { choices: ['Oui', 'Non'] });
  colonne('Etablissements', 'Referent_surete', 'Text', 'Référent sûreté', [null, 'M. Martin']);
  const F = doc.__data.Formulaires, conf = JSON.parse(F.Publie[0]);
  conf.parties = [{ id: 'q', nom: 'Signalement', role: 'q' }, { id: 'vd', nom: 'Visa départemental', role: 'vd' }, { id: 'va', nom: 'Visa académique', role: 'va' }, { id: 'r', nom: 'Éléments réservés', role: 'r', echelons: ['dep', 'aca'] }];
  conf.blocs.push({ id: 'r1', section: 'r', genre: 'question', colonne: 'Appreciation' });
  F.Publie[0] = F.Brouillon[0] = JSON.stringify(conf);
  const Cf = doc.__data.Config, cle = (k, v) => { Cf.id.push(Cf.id.length + 1); Cf.Cle.push(k); Cf.Valeur.push(JSON.stringify(v)); Cf.Modifie_le.push(0); };
  cle('structurel', { tables: { Etablissements: { colonnes: { Internat: 'masquee', Referent_surete: 'masquee' }, echelons: ['dep', 'aca'] } } });
  return doc;
}
const texte = async (page, sel) => (await page.$eval(sel, e => e.innerText)).replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
const api = doc => `window.__DOC__=${JSON.stringify(doc)};`;
const demandes = d => { const C = d.__data.Config, i = C.Cle.indexOf('demandes'); return i < 0 ? [] : JSON.parse(C.Valeur[i]).liste; };

(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });

  /* ---------- 1. Extractions : sélection par la qualification, demande ---------- */
  let page = await browser.newPage({ viewport: { width: 1400, height: 1400 } });
  page.on('pageerror', e => console.log('PAGEERROR (extractions)', e.message));
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: api(docDemandes()) + fs.readFileSync('mock.js')
    + `;grist.ready=()=>{};grist.onOptions=cb=>setTimeout(()=>cb(null),50);grist.setOptions=async()=>{};grist.docApi.listTables=async()=>window.__DOC__._grist_Tables.tableId.slice();` }));
  await page.goto('file://' + __C.racine + '/v2/extractions/index.html'); await page.waitForTimeout(2000);
  await page.click('#qualPuces .puce:has-text("Fermé")'); await page.waitForTimeout(300);
  await page.click('#qualPuces .puce:has-text("Perturbé")'); await page.waitForTimeout(300);
  await page.click('#qualPuces .puce:has-text("Fermé")'); await page.waitForTimeout(300);   // « Perturbé » seul : Camus, Éluard, Jules Ferry
  console.log('EXTRACTION :', (await page.textContent('#compte')).trim(), '| bouton', await page.$eval('#btnDemande', b => b.hidden ? 'caché' : 'visible'));
  await page.click('#btnDemande'); await page.waitForTimeout(800);
  console.log('FENÊTRE :\n  ' + (await texte(page, '#dm-dialog')).split('\n').join('\n  '));
  await page.fill('#dm-nom', 'Internats et référents'); await page.check('#dm-reserves');
  await page.fill('#dm-consigne', 'Merci de compléter avant la réunion de vendredi.'); await page.fill('#dm-echeance', '2026-11-27');
  await page.click('#dm-creer'); await page.waitForTimeout(800);
  console.log('MESSAGE :', (await page.textContent('#message')).trim());
  let doc = await page.evaluate(() => window.__DOC__);
  const d1 = demandes(doc)[0];
  console.log('DEMANDE :', JSON.stringify({ ...d1, id: d1.id.slice(0, 2) + '…', cree_le: d1.cree_le ? 'oui' : 'non' }));
  await page.close();

  /* ---------- 2. Fiche établissement : sélection, demande (propriétaire) ---------- */
  const df = docFiche();
  df._grist_ACLRules = { id: [] };   // lisible : propriétaire
  (() => { const T = df._grist_Tables, C = df._grist_Tables_column, ref = T.id.length + 1; T.id.push(ref); T.tableId.push('Config');
    [['Cle', 'Text'], ['Valeur', 'Text'], ['Modifie_le', 'DateTime:Europe/Paris']].forEach(([c, t]) => { C.id.push(C.id.length + 1); C.parentId.push(ref); C.colId.push(c); C.type.push(t); C.label.push(c); C.isFormula.push(false); C.formula.push(''); C.widgetOptions.push(''); C.visibleCol.push(0); C.parentPos.push(C.id.length); });
    df.__data.Config = { id: [1, 2], Cle: ['general', 'structurel'], Valeur: [JSON.stringify({ reponses: 'Reponses', referentiel: 'Etablissements', formulaires: 'Formulaires' }), JSON.stringify({ tables: { Etablissements: { colonnes: { Commune: 'lecture' }, echelons: ['aca'] } } })], Modifie_le: [0, 0] }; })();
  page = await browser.newPage({ viewport: { width: 1400, height: 1200 } }); page.on('pageerror', e => console.log('PAGEERROR (fiche)', e.message));
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: api(df) + fs.readFileSync('mock.js')
    + `;grist.ready=()=>{};grist.onOptions=cb=>setTimeout(()=>cb(${JSON.stringify({ fiche: { ...CONFIG, filtresRapides: ['Type'] } })}),50);grist.setOptions=async()=>{};grist.onRecord=cb=>{window.__REC=cb;};grist.setCursorPos=async()=>{};grist.selectedTable={getTableId:async()=>'Etablissements'};` }));
  await page.goto('file://' + __C.racine + '/v2/fiche/index.html'); await page.waitForTimeout(1500);
  await page.evaluate(() => window.__REC({ id: 1 })); await page.waitForTimeout(400);
  console.log('FICHE : sélection', (await page.textContent('#compteSelection')).trim() || '(toute)', '| bouton', await page.$eval('#demanderComplements', b => b.hidden ? 'caché' : b.disabled ? 'grisé' : 'visible'));
  await page.click('#demanderComplements'); await page.waitForTimeout(800);
  console.log('FENÊTRE (fiche) :', (await texte(page, '#dm-dialog')).split('\n').slice(0, 4).join(' / '));
  await page.click('#dm-creer'); await page.waitForTimeout(800);
  const dfin = await page.evaluate(() => window.__DOC__);
  const d2 = demandes(dfin)[0];
  console.log('DEMANDE (fiche) :', d2 ? `${d2.nom} · ${d2.etabs.length} établissements · données ${d2.donnees.join(',')} · réservés ${d2.reserves} · source « ${d2.source} »` : 'aucune', '|', (await page.textContent('#message')).trim());
  await page.close();

  /* ---------- 3. Administration › Établissements : suivi ---------- */
  page = await browser.newPage({ viewport: { width: 1400, height: 2400 }, acceptDownloads: true });
  page.on('pageerror', e => console.log('PAGEERROR (admin)', e.message)); page.on('dialog', x => x.accept());
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: api(doc) + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(1500);
  await page.click('nav button[data-onglet=liens]'); await page.waitForTimeout(3500);
  console.log('CARTE :\n  ' + (await texte(page, '#demandes')).split('\n').join('\n  '));
  await page.click('#demandes [data-dm-dep]'); await page.waitForTimeout(800);
  console.log('PAR DÉPARTEMENT :', (await texte(page, '#demandes .va-table')).split('\n').slice(1).join(' | '));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#demandes [data-dm=csv]')]);
  console.log('CSV :', dl.suggestedFilename().replace(/\d{4}-\d\d-\d\d/, 'AAAA-MM-JJ'), '|', fs.readFileSync(await dl.path(), 'utf8').replace(/^﻿/, '').trim().split('\r\n').join(' / '));

  /* ---------- 4. Règles d'accès : ligne « demandes » de Config ---------- */
  await page.click('nav button[data-onglet=acces]'); await page.waitForTimeout(3000);
  const brut = await page.$eval('#acces', e => e.textContent);
  console.log('RÈGLE ÉTABLISSEMENT :', (brut.match(/\(user\.Etab[^)]*\) and rec\.Cle == "demandes"/) || ['absente'])[0], '|',
    (await texte(page, '#acces')).split('\n').find(l => /sauf les demandes de compléments/.test(l)) || 'texte absent');
  await page.close();

  /* ---------- 5. Page des compléments des partenaires ---------- */
  const ps = await browser.newPage({ viewport: { width: 1200, height: 1600 } });
  ps.on('pageerror', e => console.log('PAGEERROR (partenaire)', e.message)); ps.on('dialog', x => x.accept());
  await ps.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: api(doc) + `window.__OPTS__=${JSON.stringify({ formulaire: 'Signalements', libelle: 'Partenaires', partenaires: true })};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + fs.readFileSync('mock-saisie.js') }));
  await ps.goto('file://' + __C.racine + '/v2/saisie/index.html'); await ps.waitForTimeout(3500);
  console.log('ACCUEIL (partenaire) :\n  ' + (await texte(ps, '#demandes-accueil')).split('\n').join('\n  '));
  await ps.click('#demandes-liste li:has-text("Albert Camus") .demande-etab'); await ps.waitForTimeout(500);
  console.log('ÉDITION :', (await texte(ps, '#demandes-liste .demande-edition:not([hidden])')).split('\n').join(' / '));
  await ps.selectOption('#demandes-liste .demande-edition:not([hidden]) select', 'Oui'); await ps.waitForTimeout(500);
  await ps.fill('#demandes-liste .demande-edition:not([hidden]) input[type=text]', 'Mme Durand'); await ps.dispatchEvent('#demandes-liste .demande-edition:not([hidden]) input[type=text]', 'change'); await ps.waitForTimeout(600);
  console.log('APRÈS SAISIE :', (await texte(ps, '#demandes-liste li:has-text("Albert Camus") [data-dm-etat]')), '|', (await ps.textContent('[data-dm-compte]')).trim(), '|',
    await ps.evaluate(() => { const E = window.__DOC__.__data.Etablissements; return `${E.Nom[0]} : ${E.Internat[0]}, ${E.Referent_surete[0]}`; }));
  await ps.click('#demandes-liste .demande-edition:not([hidden]) [data-dm-dossier]'); await ps.waitForTimeout(1800);
  console.log('ÉLÉMENTS RÉSERVÉS : onglet', await ps.$eval('[role=tab][aria-selected=true]', e => e.textContent.trim()));
  await ps.fill('#form-reserve textarea', 'Suivi DSDEN.'); await ps.click('#form-reserve button[type=submit]'); await ps.waitForTimeout(1200);
  await ps.click('#btn-retour-liste'); await ps.waitForTimeout(2000);
  console.log('RETOUR :', (await texte(ps, '#demandes-liste li:has-text("Albert Camus") [data-dm-etat]')), '|', (await ps.textContent('[data-dm-compte]')).trim());
  await ps.screenshot({ path: __C.sorties + '/demandes-146.png' });
  await ps.close();

  /* ---------- 6. Demande close : plus sur la page des partenaires ---------- */
  doc = await ps.context().pages().length ? doc : doc;
  const close = JSON.parse(JSON.stringify(doc)); { const C = close.__data.Config, i = C.Cle.indexOf('demandes'), v = JSON.parse(C.Valeur[i]); v.liste[0].close = true; C.Valeur[i] = JSON.stringify(v); }
  const p2 = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await p2.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: api(close) + `window.__OPTS__=${JSON.stringify({ formulaire: 'Signalements', libelle: 'Partenaires', partenaires: true })};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + fs.readFileSync('mock-saisie.js') }));
  await p2.goto('file://' + __C.racine + '/v2/saisie/index.html'); await p2.waitForTimeout(3000);
  console.log('DEMANDE CLOSE : bloc', await p2.$eval('#demandes-accueil', e => e.hidden ? 'caché' : 'visible'));
  await browser.close();
})();
