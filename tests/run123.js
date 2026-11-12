// Extractions (2.55) : filtres de colonnes avec comptage et seuil — « Description contient blocage, nombre de jours ≥ 3 »,
// « somme de Blessés ≥ 5 » sur toutes les versions ou sur la dernière version de chaque dossier (réglage par filtre),
// portée « jamais » et « à chaque fois », opérateurs du tableau de bord (≥ sur un nombre), combinaison par formule
// (« 1 ET NON 2 », erreur signalée), colonnes des valeurs comptées, paramètres de l'Excel
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docValidation } = require('./run108');
function docComptages() {
  const doc = docValidation(), T = doc._grist_Tables, C = doc._grist_Tables_column, ref = T.id[T.tableId.indexOf('Reponses')];
  C.id.push(Math.max(...C.id) + 1); C.parentId.push(ref); C.colId.push('Blesses'); C.type.push('Int'); C.label.push('Blessés'); C.isFormula.push(false); C.formula.push(''); C.widgetOptions.push(''); C.visibleCol.push(0); C.parentPos.push(60);
  const R = doc.__data.Reponses, J = d => Date.UTC(2026, 10, d) / 1000;
  Object.keys(R).forEach(k => { R[k] = []; });
  R.Blesses = [];
  let id = 0;
  // une ligne ; dossier : id de la première version du jour (null = nouveau dossier)
  const ligne = (etab, jour, desc, blesses, dossier, nature = 'Nouveau signalement') => {
    id++; R.id.push(id); R.Etablissement.push(etab); R.Dossier.push(dossier || id); R.Date_faits.push(J(jour)); R.Cree_le.push(J(jour) + 3600 * (8 + id % 10));
    R.Nature.push(dossier ? 'Mise à jour' : nature); R.Qualification.push(/RAS/.test(desc) ? 'RAS' : 'Perturbé'); R.Description.push(desc); R.Blesses.push(blesses);
    R.Derniere_version.push(false); R.Departement.push(''); R.Academie.push(''); R.Avis_dep.push(null); R.Obs_dep.push(''); R.Avis_aca.push(null);
    return id;
  };
  // établissement 1 : blocage 4 jours (le 3, un blocage le matin levé le soir : RAS en dernière version)
  ligne(1, 1, 'Blocage du hall', 0); ligne(1, 2, 'Blocage total', 1);
  const d3 = ligne(1, 3, 'Blocage partiel', 0); ligne(1, 3, 'RAS, hall libéré', 0, d3); ligne(1, 4, 'Blocage', 0);
  // établissement 2 : blocage 2 jours
  ligne(2, 2, 'Blocage', 0); ligne(2, 5, 'Blocage partiel', 0);
  // établissement 3 : bagarre ; blessés en total du jour, mis à jour : 2 puis 6 (dernière version 6, toutes versions 8)
  const d6 = ligne(3, 6, 'Bagarre', 2); ligne(3, 6, 'Bagarre, nouveaux blessés', 6, d6);
  // établissement 4 : intrusion, sans blessé ni blocage
  ligne(4, 6, 'Intrusion', 0);
  // dernière version de chaque dossier (formule Derniere_version du document)
  const der = new Map(); R.id.forEach((x, i) => der.set(R.Dossier[i], i)); der.forEach(i => { R.Derniere_version[i] = true; });
  return doc;
}
(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.route('**/exceljs.min.js', r => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(require.resolve('exceljs/dist/exceljs.min.js')) }));
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(docComptages())};` + fs.readFileSync('mock.js')
    + `;window.__OPTS={};grist.ready=()=>{};grist.onOptions=cb=>setTimeout(()=>cb(null),50);grist.setOptions=o=>{window.__OPTS=JSON.parse(JSON.stringify(o));};grist.docApi.listTables=async()=>window.__DOC__._grist_Tables.tableId.slice();` }));
  await page.goto('file://' + __C.racine + '/v2/extractions/index.html'); await page.waitForTimeout(1500);
  const F = i => `#filtresCol [data-i="${i}"]`;
  const etat = async titre => {
    const r = await page.evaluate(() => ({ compte: document.getElementById('compte').textContent, cols: resultat.colonnes.filter(c => /^fc_|filtresOk/.test(c.key)).map(c => c.label),
      lignes: resultat.lignes.map(o => `${o.cle}${Object.keys(o).filter(k => /^fc_/.test(k)).map(k => ` ${k.slice(3) && 'F' + k.slice(3)}=${o[k]}`).join('')}${o.filtresOk !== undefined && resultat.colonnes.some(c => c.key === 'filtresOk') ? ` [${o.filtresOk}]` : ''}`) }));
    console.log(`${titre}\n   ${r.compte} | colonnes : ${r.cols.join(' ; ') || '—'} | ${r.lignes.join(', ') || '(aucun)'}`);
  };
  // F1 : Description contient « blocage », nombre de jours ≥ 3
  await page.selectOption(`${F(0)} select.col`, 'Description');
  await page.fill(`${F(0)} input[data-champ=val]`, 'blocage');
  await page.selectOption(`${F(0)} [data-champ=portee]`, 'compter'); await page.waitForTimeout(150);
  console.log('RÉGLAGES DU COMPTAGE :', await page.$$eval(`${F(0)} .portee select, ${F(0)} .portee input`, l => l.map(e => e.dataset.champ).join(', ')));
  await page.fill(`${F(0)} [data-champ=seuil]`, '3'); await page.waitForTimeout(200);
  await etat('F1 « blocage », jours ≥ 3, toutes les versions');
  await page.selectOption(`${F(0)} [data-champ=versions]`, 'derniere'); await page.waitForTimeout(200);
  await etat('F1 sur la dernière version de chaque dossier (le 3 : RAS le soir, ne compte plus)');
  await page.selectOption(`${F(0)} [data-champ=versions]`, 'toutes');
  // F2 : toutes les lignes, somme de Blessés ≥ 5
  await page.click('#ajoutFiltreCol');
  await page.selectOption(`${F(1)} [data-champ=portee]`, 'compter'); await page.waitForTimeout(100);
  console.log('SANS COLONNE + compter : 1er choix =', await page.$eval(`${F(1)} select.col option`, o => o.textContent));
  await page.selectOption(`${F(1)} [data-champ=mesure]`, 'sum'); await page.waitForTimeout(100);
  await page.selectOption(`${F(1)} [data-champ=colMesure]`, 'Blesses');
  await page.fill(`${F(1)} [data-champ=seuil]`, '5'); await page.waitForTimeout(200);
  await page.selectOption('#combinaison', 'autonome'); await page.waitForTimeout(200);
  await etat('F1 OU F2 (somme des blessés ≥ 5, toutes les versions : 2 + 6 = 8)');
  await page.selectOption(`${F(1)} [data-champ=versions]`, 'derniere'); await page.waitForTimeout(200);
  await etat('F2 sur la dernière version (6)');
  await page.selectOption(`${F(1)} [data-champ=mesure]`, 'max'); await page.waitForTimeout(200);
  await etat('F2 maximum de Blessés ≥ 5');
  // F3 : Description contient « blocage », jamais ; formule
  await page.click('#ajoutFiltreCol');
  await page.selectOption(`${F(2)} select.col`, 'Description'); await page.fill(`${F(2)} input[data-champ=val]`, 'blocage');
  await page.selectOption(`${F(2)} [data-champ=portee]`, 'jamais'); await page.waitForTimeout(150);
  await page.selectOption('#combinaison', 'formule'); await page.waitForTimeout(150);
  console.log('FORMULE : champ visible et actif :', await page.$eval('#formule', e => !e.hidden && document.activeElement === e));
  await page.keyboard.type('2 ET (1 OU'); await page.waitForTimeout(150);
  console.log('FORMULE INCOMPLÈTE :', await page.textContent('#aideCombinaison'));
  await page.fill('#formule', 'NON 1 ET 3'); await page.waitForTimeout(200);
  await etat('« NON 1 ET 3 » : ni 3 jours de blocage, ni aucun blocage');
  await page.fill('#formule', '1 OU (2 ET 3)'); await page.waitForTimeout(200);
  await etat('« 1 OU (2 ET 3) »');
  // F4 : opérateur ≥ sur un nombre, à chaque fois
  await page.click('#ajoutFiltreCol');
  await page.selectOption(`${F(3)} select.col`, 'Blesses'); await page.selectOption(`${F(3)} select.op`, 'ge'); await page.fill(`${F(3)} input[data-champ=val]`, '1');
  await page.selectOption(`${F(3)} [data-champ=portee]`, 'toutes'); await page.waitForTimeout(150);
  await page.fill('#formule', '4'); await page.waitForTimeout(200);
  await etat('« 4 » : Blessés ≥ 1 à chaque fois');
  await page.fill('#formule', '1 OU (2 ET 3)'); await page.waitForTimeout(200);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnExcel')]);
  const ExcelJS = require('exceljs'), wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(await dl.path());
  const ws = wb.getWorksheet('Extraction'), en = ws.getRow(1).values.slice(1);
  const ix = en.findIndex(x => /^F1 :/.test(x)) + 1;
  console.log('EXCEL :', en.filter(x => /^F\d|Filtres/.test(x)).join(' | '), '| F1 ligne 2 :', ws.getRow(2).values[ix], `(${typeof ws.getRow(2).values[ix]})`);
  const wp = wb.getWorksheet('Paramètres');
  console.log('PARAMÈTRES :\n   ' + [...Array(wp.rowCount).keys()].map(i => wp.getRow(i + 1).values.slice(1).join(' = ')).filter(l => /Filtre/.test(l)).join('\n   '));
  await browser.close();
})();
