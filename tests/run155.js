// 2.62.0-alpha.62 : import de la base des fermetures (onglet Établissements) — chaque ligne (date, UAI, état) devient le
// dossier du jour avec l'état comme qualification. Qualification « Partiellement ouvert » ajoutée aux choix, ordre de gravité
// repris dans la formule de l'état le plus grave ; fichier CSV en Windows-1252 : doublon du fichier fusionné (le plus grave),
// dossier d'agent prioritaire (écart listé, rien d'écrit), UAI inconnu, date illisible, état non reconnu ; réimport par un
// classeur Excel (dates en numéros de série) : nouvelle version si l'état change, dossier importé repris par un agent devenu
// dossier d'agent, nouveau jour ; troisième passage : rien à écrire.
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const ExcelJS = require('exceljs');

const jour = (a, m, j) => Date.UTC(a, m - 1, j) / 1000, maintenant = Math.floor(Date.now() / 1000);
function doc() {
  const d = { _grist_Tables: { id: [], tableId: [] }, _grist_Tables_column: { id: [], parentId: [], colId: [], type: [], label: [], isFormula: [], formula: [], widgetOptions: [], visibleCol: [], parentPos: [] }, __data: {} };
  const T = d._grist_Tables, C = d._grist_Tables_column, D = d.__data;
  const table = (tid, cols, lignes) => {
    const ref = T.id.length + 1; T.id.push(ref); T.tableId.push(tid);
    cols.forEach(([colId, type, label, formula, wo, init], k) => { C.id.push(C.id.length + 1); C.parentId.push(ref); C.colId.push(colId); C.type.push(type); C.label.push(label || colId);
      C.isFormula.push(!!formula && !init); C.formula.push(formula || ''); C.widgetOptions.push(wo ? JSON.stringify(wo) : ''); C.visibleCol.push(0); C.parentPos.push(k); });
    const t = { id: lignes.map((_, i) => i + 1) }; cols.forEach(([c], k) => { t[c] = lignes.map(l => l[k] === undefined ? null : l[k]); }); D[tid] = t;
  };
  const general = { situation: 'Tempête', preset: 'en', academies: ['Versailles', 'Créteil'], reponses: 'Reponses', referentiel: 'Etablissements', formulaires: 'Formulaires', agents: 'Agents' };
  table('Config', [['Cle', 'Text'], ['Valeur', 'Text'], ['Modifie_le', 'DateTime:Europe/Paris']], [['general', JSON.stringify(general), maintenant]]);
  table('Formulaires', [['Nom', 'Text'], ['Table', 'Text'], ['Brouillon', 'Text'], ['Publie', 'Text'], ['Publie_le', 'DateTime:Europe/Paris'], ['Modifie_le', 'DateTime:Europe/Paris'], ['Type', 'Text'], ['Widget', 'Text']],
    [['Signalements', 'Reponses', '{"blocs":[]}', '{"blocs":[]}', maintenant, maintenant, 'etablissement', '']]);
  table('Etablissements', [['Nom', 'Text'], ['UAI', 'Text'], ['Type', 'Text'], ['Commune', 'Text'], ['Academie', 'Text'], ['Departement', 'Text'], ['Mail', 'Text']], [
    ['Collège Albert Camus', '0781111A', 'Collège', 'Versailles', 'Versailles', 'Yvelines', ''],
    ['Lycée Hoche', '0782222B', 'Lycée', 'Versailles', 'Versailles', 'Yvelines', ''],
    ['Collège Paul Éluard', '0913333C', 'Collège', 'Évry', 'Versailles', 'Essonne', ''],
    ['École Jules Ferry', '0944444D', 'École', 'Vitry', 'Créteil', 'Val-de-Marne', '']]);
  const QUALIF = { choices: ['Fermé', 'Perturbé', 'RAS'], choiceOptions: { 'Fermé': { fillColor: '#E1000F' }, 'Perturbé': { fillColor: '#FFCA00' }, RAS: { fillColor: '#B8FEC9' } } };
  const GRAVE = 'import datetime\n# du plus grave au moins grave : à ajuster si l\'ordre des choix change\nORDRE = ["Fermé", "Perturbé"]\nreturn None';
  // dossier 1 : Camus, saisi par un agent le 20/11, « Perturbé »
  table('Reponses', [['Etablissement', 'Ref:Etablissements'], ['Dossier', 'Ref:Reponses'], ['Date_faits', 'Date'], ['Cree_le', 'DateTime:Europe/Paris', 'Créé le', 'NOW()', null, true],
    ['Nature', 'Choice', 'Nature', '', { choices: ['Nouveau signalement', 'Mise à jour'] }], ['Qualification', 'Choice', 'Qualification', '', QUALIF], ['Description', 'Text'],
    ['Commentaire', 'Text'], ['Auteur', 'Text', 'Auteur', 'user.Email', null, true], ['Derniere_version', 'Bool', 'Dernière version', 'return True'],
    ['Etat_plus_grave', 'Choice', 'État le plus grave', GRAVE, { choices: ['Fermé', 'Perturbé'] }]],
    [[1, 1, jour(2026, 11, 20), maintenant - 86400 * 4, 'Nouveau signalement', 'Perturbé', 'Grilles bloquées', '', 'alice@ac-versailles.fr']]);
  table('Agents', [['Nom', 'Text'], ['Email', 'Text'], ['Actif', 'Bool']], [['Alice Martin', 'alice@ac-versailles.fr', true]]);
  return d;
}

const texte = async (page, sel) => (await page.$eval(sel, e => e.innerText)).replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
const reponses = page => page.evaluate(() => { const R = window.__DOC__.__data.Reponses, E = window.__DOC__.__data.Etablissements;
  return R.id.map((id, i) => `${id} | dossier ${R.Dossier[i]} | ${E.UAI[E.id.indexOf(R.Etablissement[i])]} | ${new Date(R.Date_faits[i] * 1000).toISOString().slice(0, 10)} | ${R.Nature[i]} | ${R.Qualification[i]} | ${R.Auteur[i]} | ${R.Description[i]}`).join('\n'); });
const colonne = (page, col) => page.evaluate(c => { const C = window.__DOC__._grist_Tables_column, k = C.colId.indexOf(c); return { formule: C.formula[k], options: C.widgetOptions[k] }; }, col);

(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const page = await browser.newPage({ viewport: { width: 1300, height: 1800 }, acceptDownloads: true });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => d.accept());
  await page.route('**/jszip.min.js', r => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(require.resolve('jszip/dist/jszip.min.js')) }));
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc())};` + fs.readFileSync('mock.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(1500);
  await page.click('nav button[data-onglet=liens]'); await page.waitForTimeout(2000);
  console.log('CARTE (ouverture) :\n' + await texte(page, '#fermetures'));

  /* ---------- 1. Qualifications : choix ajouté, formule de l'état le plus grave ---------- */
  await page.click('#fermetures [data-fm=choix]'); await page.waitForTimeout(1200);
  console.log('\nCHOIX DE QUALIFICATION :', JSON.parse((await colonne(page, 'Qualification')).options).choices.join(' › '));
  console.log('CARTE (après ajout) :\n' + (await texte(page, '#fermetures')).split('\n').slice(0, 6).join('\n'));
  // l'utilisateur place « Partiellement ouvert » juste après « Fermé » dans Grist
  await page.evaluate(() => { const C = window.__DOC__._grist_Tables_column, k = C.colId.indexOf('Qualification'), o = JSON.parse(C.widgetOptions[k]);
    o.choices = ['Fermé', 'Partiellement ouvert', 'Perturbé', 'RAS']; C.widgetOptions[k] = JSON.stringify(o); window.Socle.viderCacheLecture(); });
  await page.click('nav button[data-onglet=liens]'); await page.waitForTimeout(1500);
  await page.click('#fermetures [data-fm=formule]'); await page.waitForTimeout(1200);
  const g = await colonne(page, 'Etat_plus_grave');
  console.log('\nFORMULE ÉTAT LE PLUS GRAVE :', (/^ORDRE = .*$/m.exec(g.formule) || ['?'])[0], '| choix :', JSON.parse(g.options).choices.join(', '));
  console.log('MESSAGE :', await page.textContent('#fermetures [role=status]'));

  /* ---------- 2. Premier fichier : CSV Windows-1252, séparateur « ; » ---------- */
  const csv = ['date_fermeture;UAI;Etat;Nom;Type;Statut;Commune;Telephone;Courriel;Département;Académie;Région',
    '20/11/2026;0781111A;Fermé;COLLEGE ALBERT CAMUS;Collège;Public;Versailles;;;Yvelines;Versailles;Île-de-France',
    '20/11/2026;0782222B;Partiellement ouvert;LYCEE HOCHE;Lycée;Public;Versailles;;;Yvelines;Versailles;Île-de-France',
    '20/11/2026; 0782222b ;Fermé;LYCEE HOCHE;Lycée;Public;Versailles;;;Yvelines;Versailles;Île-de-France',
    '21/11/2026;0913333C;fermé;COLLEGE PAUL ELUARD;Collège;Public;Évry;;;Essonne;Versailles;Île-de-France',
    '21/11/2026;9999999Z;Fermé;ECOLE INCONNUE;École;Privé;Sèvres;;;Hauts-de-Seine;Versailles;Île-de-France',
    '31/02/2026;0781111A;Fermé;COLLEGE ALBERT CAMUS;Collège;Public;Versailles;;;Yvelines;Versailles;Île-de-France',
    '21/11/2026;0944444D;Ouvert;ECOLE JULES FERRY;École;Public;Vitry;;;Val-de-Marne;Créteil;Île-de-France'].join('\r\n');
  const f1 = path.join(__C.sorties, 'fermetures-20-21.csv');
  fs.writeFileSync(f1, Buffer.from(csv.replace(/[^\x00-\x7F]/g, ch => ch), 'latin1'));
  await page.setInputFiles('#fm-fichier', f1); await page.waitForTimeout(2000);
  console.log('\nAPERÇU (fichier 1) :\n' + await texte(page, '#fermetures'));
  await page.click('#fermetures [data-fm=importer]'); await page.waitForTimeout(2500);
  console.log('\nAPRÈS IMPORT 1 :', await page.textContent('#fermetures [role=status]'));
  console.log('RÉPONSES :\n' + await reponses(page));

  // un agent met à jour le dossier importé d'Éluard (21/11) : le dossier devient un dossier d'agent
  await page.evaluate(j => { const R = window.__DOC__.__data.Reponses, k = R.Etablissement.indexOf(3), d = R.Dossier[k];
    window.grist.docApi.applyUserActions([['AddRecord', 'Reponses', null, { Etablissement: 3, Dossier: d, Date_faits: j, Cree_le: Date.now() / 1000, Nature: 'Mise à jour', Qualification: 'Perturbé', Description: 'Réouverture partielle', Auteur: 'alice@ac-versailles.fr' }]]); }, jour(2026, 11, 21));

  /* ---------- 3. Second fichier : classeur Excel, dates en numéros de série ---------- */
  const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Fermetures');
  ws.addRow(['date_fermeture', 'UAI', 'Etat', 'Nom', 'Type', 'Statut', 'Commune', 'Telephone', 'Courriel', 'Département', 'Académie', 'Région']);
  ws.addRow([new Date(Date.UTC(2026, 10, 20)), '0782222B', 'Partiellement ouvert', 'LYCEE HOCHE', 'Lycée', 'Public', 'Versailles']);   // était « Fermé » : nouvelle version
  ws.addRow([new Date(Date.UTC(2026, 10, 20)), '0781111A', 'Perturbé', 'COLLEGE ALBERT CAMUS', 'Collège', 'Public', 'Versailles']);     // même état que l'agent
  ws.addRow([new Date(Date.UTC(2026, 10, 21)), '0913333C', 'Partiellement ouvert', 'COLLEGE PAUL ELUARD', 'Collège', 'Public', 'Évry']); // dossier repris par un agent : écart
  ws.addRow([new Date(Date.UTC(2026, 10, 22)), '0782222B', 'Fermé', 'LYCEE HOCHE', 'Lycée', 'Public', 'Versailles']);                   // nouveau jour
  ws.getColumn(1).numFmt = 'dd/mm/yyyy';
  const f2 = path.join(__C.sorties, 'fermetures-20-22.xlsx'); await wb.xlsx.writeFile(f2);
  await page.click('nav button[data-onglet=liens]'); await page.waitForTimeout(1500);
  await page.setInputFiles('#fm-fichier', f2); await page.waitForTimeout(2500);
  console.log('\nAPERÇU (fichier 2) :\n' + await texte(page, '#fermetures'));
  await page.click('#fermetures [data-fm=importer]'); await page.waitForTimeout(2500);
  console.log('\nAPRÈS IMPORT 2 :', await page.textContent('#fermetures [role=status]'));
  console.log('RÉPONSES :\n' + await reponses(page));

  /* ---------- 4. Même fichier une seconde fois : rien à écrire ---------- */
  await page.setInputFiles('#fm-fichier', f2); await page.waitForTimeout(2000);
  console.log('\nRÉIMPORT :', await page.textContent('#fermetures [data-fm=importer]'), '| bouton actif :', !(await page.$eval('#fermetures [data-fm=importer]', b => b.disabled)));
  console.log('HISTORIQUE (Config) :', await page.evaluate(() => { const C = window.__DOC__.__data.Config, v = JSON.parse(C.Valeur[C.Cle.indexOf('fermetures')]);
    return v.imports.map(x => `${x.fichier} : ${x.crees} créé(s), ${x.versions} version(s), ${x.ecarts} écart(s), ${x.inconnus} inconnu(s), jours ${x.jours.join(' ')}`).join(' || '); }));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#fermetures details:has-text("Écarts") [data-fm=csv]')]);
  console.log('CSV DES ÉCARTS :', JSON.stringify(fs.readFileSync(await dl.path(), 'utf8').replace(/^﻿/, '')));
  await page.screenshot({ path: path.join(__C.sorties, 'run155-fermetures.png'), fullPage: true });
  await browser.close();
})();
