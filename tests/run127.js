// 2.62 : widget Fiche établissement — configuration de départ tirée du socle, fiche réglée sur plusieurs tables
// (réponses, faits établissement reliés par l'UAI, bâti relié par référence, badge de liste), repère « nouveau »
// depuis le dernier point, dépliage d'une tuile, réglages (changement de table, enregistrement), rendu imprimé.
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');

// document d'essai : tables et colonnes au format du faux Grist
function docFiche() {
  const T = { id: [], tableId: [] }, C = { id: [], parentId: [], colId: [], type: [], label: [], isFormula: [], formula: [], widgetOptions: [], visibleCol: [], parentPos: [] }, data = {};
  const table = (tid, cols, lignes) => {
    const ref = T.id.length + 1; T.id.push(ref); T.tableId.push(tid); data[tid] = { id: [] };
    cols.forEach(([colId, type, label, choix], k) => {
      C.id.push(C.id.length + 1); C.parentId.push(ref); C.colId.push(colId); C.type.push(type); C.label.push(label || colId);
      C.isFormula.push(false); C.formula.push(''); C.widgetOptions.push(choix ? JSON.stringify({ choices: choix }) : ''); C.visibleCol.push(0); C.parentPos.push(k + 1);
      data[tid][colId] = [];
    });
    lignes.forEach((l, i) => { data[tid].id.push(i + 1); cols.forEach(([colId], k) => data[tid][colId].push(l[k] ?? null)); });
  };
  const jour = iso => Date.parse(iso + 'T00:00:00Z') / 1000, heure = iso => Date.parse(iso) / 1000;   // Date : minuit UTC ; Date et heure : instant
  table('Etablissements', [['Nom_etablissement', 'Text', "Nom de l'établissement"], ['UAI', 'Text'], ['Type', 'Choice'], ['Commune', 'Text'], ['Academie', 'Text', 'Académie'], ['Departement', 'Text', 'Département']], [
    ['Lycée des Lilas', '0780001A', 'Lycée', 'Versailles', 'Versailles', 'Yvelines'],
    ['Collège Jean Moulin', '0780002B', 'Collège', 'Versailles', 'Versailles', 'Yvelines']]);
  const qualifs = ['RAS', 'Rassemblement', 'Blocage partiel', 'Blocage'];
  table('Reponses', [['Etablissement', 'Ref:Etablissements', 'Établissement'], ['Dossier', 'Ref:Reponses'], ['Date_faits', 'Date', 'Date des faits'], ['Cree_le', 'DateTime:Europe/Paris', 'Saisi le'],
    ['Nature', 'Choice', 'Nature', ['Nouveau signalement', 'Mise à jour']], ['Qualification', 'Choice', 'Qualification', qualifs], ['Description', 'Text']], [
    [1, 1, jour('2026-11-05'), heure('2026-11-05T08:00:00Z'), 'Nouveau signalement', 'Rassemblement', "Une centaine d'élèves devant l'entrée."],
    [1, 2, jour('2026-11-06'), heure('2026-11-06T08:00:00Z'), 'Nouveau signalement', 'Blocage', 'Portail bloqué de 7 h à 10 h.'],
    [1, 3, jour('2026-11-07'), heure('2026-11-07T08:00:00Z'), 'Nouveau signalement', 'Rassemblement', 'Environ 150 élèves.'],
    [1, 4, jour('2026-11-10'), heure('2026-11-10T08:00:00Z'), 'Nouveau signalement', 'Blocage partiel', 'Poubelles devant le portail.'],
    [1, 5, jour('2026-11-13'), heure('2026-11-13T06:40:00Z'), 'Nouveau signalement', 'Blocage', "Entrée principale bloquée dès 7 h 40."],
    [1, 5, jour('2026-11-13'), heure('2026-11-13T13:20:00Z'), 'Mise à jour', 'Blocage', "Blocage maintenu ; forces de l'ordre sur place."],
    [2, 7, jour('2026-11-12'), heure('2026-11-12T09:00:00Z'), 'Nouveau signalement', 'RAS', 'Calme.']]);
  table('Faits_etablissement', [['UAI', 'Text'], ['Date', 'Date'], ['Categorie', 'Choice', 'Catégorie']], [
    ['0780001A', jour('2026-09-15'), 'Atteintes aux personnes'], ['0780001A', jour('2026-10-02'), 'Atteintes aux biens'], ['0780001a', jour('2026-10-20'), 'Atteintes aux personnes'],
    ['0780001A', jour('2026-11-06'), 'Atteintes aux biens'], ['0780001A', jour('2026-11-13'), 'Atteintes à la sécurité'],
    ['0780001A', jour('2025-11-03'), 'Atteintes aux personnes'], ['0780002B', jour('2026-10-01'), 'Autres']]);
  table('Liste_200', [['UAI', 'Text']], [['0780001A']]);
  table('Bati', [['Etablissement', 'Ref:Etablissements', 'Établissement'], ['Confort_ete', 'Choice', "Confort d'été"], ['Travaux', 'Text'], ['Echeance', 'Text', 'Échéance']], [
    [1, 'Faible', 'Brise-soleil sur la façade sud', 'Été 2027'], [1, 'Faible', 'Ventilation des salles du 2e étage', 'À prévoir'], [2, 'Moyen', 'Aucun', '']]);
  table('Points_situation', [['Horodatage', 'DateTime:Europe/Paris'], ['Numero', 'Int', 'Numéro']], [[heure('2026-11-13T11:00:00Z'), 3]]);
  return { _grist_Tables: T, _grist_Tables_column: C, __data: data };
}

const CONFIG = {
  referentiel: { table: 'Etablissements', titre: 'Nom_etablissement', cle: 'UAI', details: ['Type', 'Commune', 'UAI'] },
  nouveau: 'point',
  badges: [{ libelle: 'Bâti dégradé · liste des 200', table: 'Liste_200', lien: 'UAI', colonne: '' }, { libelle: 'Site prioritaire', table: '', lien: '', colonne: 'Prioritaire_absent' }],
  tuiles: [
    { titre: 'Mobilisation', bloc: 'Situation en cours', largeur: 2, table: 'Reponses', lien: 'Etablissement', parDossier: 'Dossier', date: 'Date_faits', saisie: 'Cree_le',
      synthese: { mode: 'valeur', colonne: 'Qualification', legende: '{jours} jours signalés' }, detail: ['Date_faits', 'Qualification', 'Description'], source: 'PRISME · SDS BV2A' },
    { titre: 'Historique', bloc: 'Situation en cours', table: 'Reponses', lien: 'Etablissement', parDossier: 'Dossier', date: 'Date_faits', saisie: 'Cree_le',
      synthese: { mode: 'episodes', unite: 'épisodes' }, ventilation: 'Qualification', filtre: { colonne: 'Qualification', valeurs: 'RAS', exclure: true } },
    { titre: 'Climat scolaire', bloc: 'Contexte', table: 'Faits_etablissement', lien: 'UAI', date: 'Date', depuis: '2026-09-01',
      synthese: { mode: 'nombre', unite: 'faits' }, ventilation: 'Categorie', detail: ['Date', 'Categorie'], source: 'SDS BV2A-DNE' },
    { titre: 'Bâti scolaire', bloc: 'Contexte', table: 'Bati', lien: 'Etablissement', synthese: { mode: 'valeur', colonne: 'Confort_ete', legende: "confort d'été · {nombre} travaux" },
      detail: ['Travaux', 'Echeance'], source: 'Cellule bâti scolaire', restreint: true },
  ],
};

async function ouvrir(browser, doc, options) {
  const p = await browser.newPage({ viewport: { width: 900, height: 1300 } });
  p.on('pageerror', e => console.log('PAGEERROR', e.message)); p.on('dialog', d => d.accept());
  await p.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js')
    + `;window.__OPTS=null;grist.ready=()=>{};grist.onOptions=cb=>setTimeout(()=>cb(${JSON.stringify(options)}),50);grist.setOptions=async o=>{window.__OPTS=JSON.parse(JSON.stringify(o));};`
    + `grist.onRecord=cb=>{window.__REC=cb;};grist.setCursorPos=async()=>{};grist.selectedTable={getTableId:async()=>'Etablissements'};` }));
  await p.goto('file://' + __C.racine + '/v2/fiche/index.html'); await p.waitForTimeout(900);
  return p;
}
const tuiles = p => p.$$eval('.tuile', l => l.map(t => [t.querySelector('.titre').textContent, t.querySelector('.grand').textContent.trim(),
  (t.querySelector('.legende') || {}).textContent || '', (t.querySelector('.tete .periode') || {}).textContent || ''].join(' | ')));

async function principal() {
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const doc = docFiche();

  /* ---------- 1. sans réglages : configuration de départ tirée du socle ---------- */
  let p = await ouvrir(browser, doc, null);
  console.log('MESSAGE :', await p.textContent('#message'));
  console.log('RÉGLAGES VISIBLES :', await p.isVisible('#reglages'), '| alertes :', JSON.stringify(await p.$$eval('#alertes li', l => l.map(x => x.textContent))));
  await p.evaluate(() => window.__REC({ id: 1 })); await p.waitForTimeout(300);
  console.log('DÉPART, TITRE :', await p.textContent('.entete h2'), '|', await p.textContent('.entete .details'));
  console.log('DÉPART, TUILES :', JSON.stringify(await tuiles(p)));
  await p.click('[data-action=enregistrer]'); await p.waitForTimeout(300);
  console.log('ENREGISTRÉ :', JSON.stringify((await p.evaluate(() => window.__OPTS)).fiche.tuiles.map(t => [t.titre, t.table, t.synthese.mode])));
  await p.close();

  /* ---------- 2. fiche réglée sur cinq tables ---------- */
  p = await ouvrir(browser, doc, { fiche: CONFIG });
  await p.evaluate(() => window.__REC({ id: 1 })); await p.waitForTimeout(300);
  console.log('RÉGLAGES MASQUÉS :', !(await p.isVisible('#reglages')));
  console.log('REPÈRE :', await p.textContent('.entete .repere'));
  console.log('BADGES :', JSON.stringify(await p.$$eval('.badge', l => l.map(b => b.textContent + (b.classList.contains('non') ? ' [non]' : '')))));
  console.log('TUILES :', JSON.stringify(await tuiles(p)));
  console.log('PASTILLES :', JSON.stringify(await p.$$eval('.pastille', l => l.map(x => x.textContent))));
  console.log('BLOCS :', JSON.stringify(await p.$$eval('.bloc > h3', l => l.map(x => x.textContent))));
  await p.screenshot({ path: __C.sorties + '/fiche-127-ecran.png', fullPage: true });

  // dépliage : Mobilisation (détail, ligne nouvelle) puis Climat scolaire (ventilation)
  await p.click('[data-tuile="0"]'); await p.waitForTimeout(200);
  console.log('MOBILISATION OUVERTE :', await p.getAttribute('[data-tuile="0"]', 'aria-expanded'), '| lignes :', JSON.stringify(await p.$$eval('.tuile.ouverte tbody tr', l => l.map(r => (r.classList.contains('nouveau') ? '[N] ' : '') + r.textContent.replace(/\s+/g, ' ').trim()))));
  console.log('SOURCE :', await p.textContent('.tuile.ouverte .source'));
  await p.click('[data-tuile="0"]'); await p.click('[data-tuile="2"]'); await p.waitForTimeout(200);
  console.log('CLIMAT VENTILATION :', JSON.stringify(await p.$$eval('.tuile.ouverte .ventilation li', l => l.map(x => x.textContent))));
  await p.screenshot({ path: __C.sorties + '/fiche-127-depliee.png', fullPage: true });

  // autre établissement par la recherche
  await p.fill('#recherche', 'Collège Jean Moulin — 0780002B'); await p.dispatchEvent('#recherche', 'change'); await p.waitForTimeout(300);
  console.log('RECHERCHE :', await p.textContent('.entete h2'), '|', JSON.stringify(await tuiles(p)));
  console.log('BADGES (2) :', JSON.stringify(await p.$$eval('.badge', l => l.map(b => b.textContent))));

  // impression : toutes les tuiles détaillées, détail restreint masqué
  await p.evaluate(() => window.__REC({ id: 1 })); await p.waitForTimeout(300);
  await p.emulateMedia({ media: 'print' });
  console.log('IMPRESSION, DÉTAILS VISIBLES :', await p.$$eval('.tuile .detail', l => l.filter(d => getComputedStyle(d).display !== 'none').length), '/', await p.$$eval('.tuile', l => l.length),
    '| bâti restreint :', await p.$eval('.tuile.restreint .note-restreint', n => getComputedStyle(n).display), await p.$eval('.tuile.restreint .contenu-restreint', n => getComputedStyle(n).display));
  await p.screenshot({ path: __C.sorties + '/fiche-127-impression.png', fullPage: true });
  await p.pdf({ path: __C.sorties + '/fiche-127.pdf', format: 'A4', printBackground: true });
  await p.emulateMedia({ media: 'screen' });

  /* ---------- 3. réglages : changer la table d'une tuile, alerte, enregistrement ---------- */
  await p.click('#ouvrirReglages'); await p.waitForTimeout(300);
  await p.evaluate(() => document.querySelector('#reglages details[data-cle="tuile-0"]').open = true);
  await p.screenshot({ path: __C.sorties + '/fiche-127-reglages.png', fullPage: false });
  console.log('CARTES :', await p.$$eval('#reglages .carte', l => l.length), '| alertes :', await p.$$eval('#alertes li', l => l.length));
  await p.evaluate(() => document.querySelector('#reglages details[data-cle="tuile-3"]').open = true);
  await p.selectOption('[data-champ="tuiles.3.table"]', 'Faits_etablissement'); await p.waitForTimeout(400);
  console.log('APRÈS CHANGEMENT DE TABLE, alertes :', JSON.stringify(await p.$$eval('#alertes li', l => l.map(x => x.textContent))));
  console.log('CARTE ROUVERTE :', await p.$eval('#reglages details[data-cle="tuile-3"]', d => d.open), '| options du lien :', (await p.$$eval('[data-champ="tuiles.3.lien"] option', l => l.map(o => o.value))).join(','));
  await p.selectOption('[data-champ="tuiles.3.table"]', 'Bati'); await p.waitForTimeout(300);
  await p.evaluate(() => document.querySelector('#reglages details[data-cle="tuile-1"]').open = true);
  await p.fill('[data-champ="tuiles.1.titre"]', 'Épisodes'); await p.dispatchEvent('[data-champ="tuiles.1.titre"]', 'change'); await p.waitForTimeout(300);
  console.log('APERÇU EN DIRECT :', JSON.stringify(await p.$$eval('.tuile .titre', l => l.map(x => x.textContent))));
  await p.click('[data-action=enregistrer]'); await p.waitForTimeout(300);
  const o = await p.evaluate(() => window.__OPTS);
  console.log('ENREGISTRÉ :', o && o.fiche.tuiles.map(t => t.titre).join(', '), '| réglages fermés :', !(await p.isVisible('#reglages')));
  await browser.close();
}
if (require.main === module) principal();
module.exports = { docFiche };
