// 2.62 : Fiche établissement — filtres. Filtres rapides (colonnes du référentiel et badges, liste à cocher avec
// décomptes), filtres avancés du moteur des Extractions sur les lignes d'une tuile (condition, comptage, combinaison
// OU), sélection parcourue avec ◀ ▶, filtres gardés dans les options, impression de la sélection (une fiche par page).
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docFiche } = require('./run127');

// document de run127, avec deux établissements de plus (autre académie, autre type)
function docFiltres() {
  const d = docFiche(), E = d.__data.Etablissements, R = d.__data.Reponses, F = d.__data.Faits_etablissement;
  [['Lycée Victor Hugo', '0750003C', 'Lycée', 'Paris', 'Paris', 'Paris'], ['École des Tilleuls', '0780004D', 'École', 'Versailles', 'Versailles', 'Yvelines']].forEach(l => {
    E.id.push(E.id.length + 1); ['Nom_etablissement', 'UAI', 'Type', 'Commune', 'Academie', 'Departement'].forEach((c, k) => E[c].push(l[k]));
  });
  const jour = iso => Date.parse(iso + 'T00:00:00Z') / 1000;
  R.id.push(8); R.Etablissement.push(3); R.Dossier.push(8); R.Date_faits.push(jour('2026-11-12')); R.Cree_le.push(Date.parse('2026-11-12T09:00:00Z') / 1000);
  R.Nature.push('Nouveau signalement'); R.Qualification.push('Blocage'); R.Description.push('Blocage du portail.');
  ['2026-09-20', '2026-10-05', '2026-10-25'].forEach(j => { F.id.push(F.id.length + 1); F.UAI.push('0780004D'); F.Date.push(jour(j)); F.Categorie.push('Atteintes aux biens'); });
  return d;
}
const CONFIG = {
  referentiel: { table: 'Etablissements', titre: 'Nom_etablissement', cle: 'UAI', details: ['Type', 'Commune'] },
  filtresRapides: ['Academie', 'Type'], filtrerBadges: true,
  badges: [{ libelle: 'Bâti dégradé', table: 'Liste_200', lien: 'UAI', colonne: '' }],
  tuiles: [
    { titre: 'Mobilisation', bloc: 'Situation', table: 'Reponses', lien: 'Etablissement', parDossier: 'Dossier', date: 'Date_faits', saisie: 'Cree_le',
      synthese: { mode: 'valeur', colonne: 'Qualification' }, detail: ['Date_faits', 'Qualification', 'Description'] },
    { titre: 'Climat scolaire', bloc: 'Contexte', table: 'Faits_etablissement', lien: 'UAI', date: 'Date', depuis: '2026-09-01', synthese: { mode: 'nombre', unite: 'faits' }, detail: ['Date', 'Categorie'] },
  ],
};

async function principal() {
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const p = await browser.newPage({ viewport: { width: 1000, height: 1200 } });
  p.on('pageerror', e => console.log('PAGEERROR', e.message)); p.on('dialog', d => d.accept());
  await p.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(docFiltres())};` + fs.readFileSync('mock.js')
    + `;window.__OPTS=null;grist.ready=()=>{};grist.onOptions=cb=>setTimeout(()=>cb(${JSON.stringify({ fiche: CONFIG })}),50);grist.setOptions=async o=>{window.__OPTS=JSON.parse(JSON.stringify(o));};`
    + `grist.onRecord=cb=>{window.__REC=cb;};window.__CURSEUR=[];grist.setCursorPos=async o=>{window.__CURSEUR.push(o.rowId);};grist.selectedTable={getTableId:async()=>'Etablissements'};` }));
  await p.goto('file://' + __C.racine + '/v2/fiche/index.html'); await p.waitForTimeout(1000);
  const etatBarre = async () => [await p.textContent('#compteSelection'), await p.textContent('#position'), await p.textContent('.entete h2')].join(' | ');

  console.log('SANS FILTRE :', await etatBarre());
  console.log('PUCES :', JSON.stringify(await p.$$eval('#puces .qchip', l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim()))));
  await p.click('#suivant'); console.log('SUIVANT :', await etatBarre(), '| curseur Grist :', JSON.stringify(await p.evaluate(() => window.__CURSEUR)));
  await p.click('#precedent'); await p.click('#precedent'); console.log('PRÉCÉDENT ×2 (boucle) :', await etatBarre());

  // filtre rapide : académie de Versailles (liste à cocher, décomptes)
  await p.click('[data-qf="col:Academie"]'); await p.waitForTimeout(150);
  console.log('LISTE ACADÉMIE :', JSON.stringify(await p.$$eval('#qpop .qopt', l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim()))));
  await p.click('#qpop [data-q=aucune]'); await p.check('#qpop input[value="Versailles"]'); await p.waitForTimeout(200);
  console.log('ACADÉMIE = VERSAILLES :', await etatBarre(), '| puce :', await p.textContent('[data-qf="col:Academie"]'));
  await p.keyboard.press('Escape');
  // badge : non
  await p.click('[data-qf="badge:0"]'); await p.waitForTimeout(150);
  console.log('LISTE BADGE (décomptes sous le filtre académie) :', JSON.stringify(await p.$$eval('#qpop .qopt', l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim()))));
  await p.uncheck('#qpop input[value="Oui"]'); await p.waitForTimeout(200);
  console.log('+ BADGE = NON :', await etatBarre());
  await p.click('#effacerFiltres'); await p.waitForTimeout(200);
  console.log('EFFACÉ :', await etatBarre(), '| bouton effacer masqué :', await p.isHidden('#effacerFiltres'));

  // filtres avancés : Mobilisation = Blocage au moins une fois, puis Climat ≥ 3 faits, combinés en OU
  await p.click('#btnAvances'); await p.waitForTimeout(200);
  console.log('SOURCES :', JSON.stringify(await p.$$eval('#avances [data-ch=source] option', l => l.map(o => o.textContent))));
  await p.selectOption('#avances .filtre[data-i="0"] [data-ch=col]', 'Qualification'); await p.waitForTimeout(150);
  await p.selectOption('#avances .filtre[data-i="0"] [data-ch=op]', 'eq'); await p.waitForTimeout(150);
  console.log('VALEURS PROPOSÉES :', (await p.$$eval('#fa-valeurs-0 option', l => l.map(o => o.value))).join(', '));
  await p.fill('#avances .filtre[data-i="0"] [data-ch=val]', 'Blocage'); await p.waitForTimeout(600);
  console.log('F1 BLOCAGE :', await etatBarre(), '|', await p.textContent('#avances .filtre[data-i="0"] .resume'), '|', await p.textContent('#btnAvances'));
  await p.click('#avances [data-ajouter]'); await p.waitForTimeout(150);
  await p.selectOption('#avances .filtre[data-i="1"] [data-ch=source]', '1'); await p.waitForTimeout(150);
  await p.selectOption('#avances .filtre[data-i="1"] [data-ch=portee]', 'compter'); await p.waitForTimeout(150);
  await p.selectOption('#avances .filtre[data-i="1"] [data-ch=mesure]', 'lignes'); await p.waitForTimeout(150);
  await p.fill('#avances .filtre[data-i="1"] [data-ch=seuil]', '3'); await p.waitForTimeout(600);
  console.log('F1 ET F2 (≥ 3 faits) :', await etatBarre(), '|', await p.textContent('#avances .filtre[data-i="1"] .resume'));
  await p.selectOption('#combinaison', 'autonome'); await p.waitForTimeout(200);
  console.log('F1 OU F2 :', await etatBarre());
  await p.selectOption('#combinaison', 'formule'); await p.waitForTimeout(150);
  await p.fill('#formule', '2 ET NON 1'); await p.waitForTimeout(600);
  console.log('FORMULE 2 ET NON 1 :', await etatBarre());
  await p.selectOption('#combinaison', 'autonome'); await p.waitForTimeout(150);

  // ligne choisie dans Grist hors sélection : affichée, position « hors sélection », sans renvoyer le curseur
  const avant = (await p.evaluate(() => window.__CURSEUR)).length;
  await p.evaluate(() => window.__REC({ id: 4 })); await p.waitForTimeout(300);
  console.log('GRIST, LIGNE 4 :', await etatBarre(), '| curseur renvoyé :', (await p.evaluate(() => window.__CURSEUR)).length - avant);

  // filtres gardés dans les options du widget
  await p.waitForTimeout(800);
  const o = await p.evaluate(() => window.__OPTS);
  console.log('OPTIONS :', JSON.stringify({ combinaison: o.filtres.combinaison, avances: o.filtres.avances.map(f => [f.source, f.col, f.op, f.val, f.portee, f.mesure, f.seuil]), fiche: !!o.fiche }));

  // impression de la sélection : une fiche par établissement retenu, chacune sur sa page
  await p.evaluate(() => { window.print = () => { window.__LOT = [...document.querySelectorAll('#lot .fiche-lot h2')].map(h => h.textContent); }; });
  await p.click('#imprimerSelection'); await p.waitForTimeout(200);
  console.log('LOT :', JSON.stringify(await p.evaluate(() => window.__LOT)));
  await p.emulateMedia({ media: 'print' });
  console.log('LOT IMPRIMÉ : fiche écran masquée', await p.$eval('#fiche', n => getComputedStyle(n).display === 'none'), '| saut de page', await p.$eval('.fiche-lot + .fiche-lot', n => getComputedStyle(n).breakBefore), '| barre masquée', await p.$eval('#barreFiltres', n => getComputedStyle(n).display === 'none'));
  await p.pdf({ path: __C.sorties + '/fiche-128-lot.pdf', format: 'A4', printBackground: true });
  await p.emulateMedia({ media: 'screen' });
  await p.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  console.log('APRÈS IMPRESSION : lot vidé', await p.evaluate(() => document.getElementById('lot').innerHTML === ''));
  await p.screenshot({ path: __C.sorties + '/fiche-128-filtres.png', fullPage: false });

  // réglages : puces proposées
  await p.click('#ouvrirReglages'); await p.waitForTimeout(300);
  await p.uncheck('[data-liste="filtresRapides"][value="Type"]'); await p.waitForTimeout(400);
  console.log('PUCES APRÈS RÉGLAGE :', JSON.stringify(await p.$$eval('#puces .qchip', l => l.map(x => x.dataset.qf))));
  await browser.close();
}
if (require.main === module) principal();
module.exports = { docFiltres, CONFIG };
