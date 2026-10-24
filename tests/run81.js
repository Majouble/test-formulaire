// Référentiel : import du classeur du référentiel ESR (établissements, composantes, sites, correspondances, lignes fusionnées),
// puis formulaire par site : recherche par mots-clés, sites d'une composante, sites du rattachement pour un campus
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docSites } = require('./run78');
const CLASSEUR = process.env.CLASSEUR || __C.donnees + '/referentiel_esr_essai.xlsx';   // CLASSEUR=… : essai sur le vrai classeur
function docEsr() {
  const doc = docSites();
  const T = doc._grist_Tables, C = doc._grist_Tables_column, D = doc.__data;
  const tr = T.id[T.tableId.indexOf('Etablissements')], n = Math.max(...C.id) + 1;
  for (const k of Object.keys(C)) C[k].push(k === 'id' ? n : k === 'parentId' ? tr : k === 'colId' ? 'Etablissement_ID' : k === 'label' ? 'Établissement ID' : k === 'type' ? 'Text' : k === 'isFormula' ? false : (typeof C[k][0] === 'number' ? 0 : typeof C[k][0] === 'boolean' ? false : ''));
  const E = D.Etablissements;
  E.Etablissement_ID = ['ETAB-0001', '', ''];
  E.Nom = ['Université de Rennes 1', 'Université Rennes II', 'IEP-Rennes']; E.UAI = ['', '0350937D', ''];
  E.Latitude = [null, 48.11, null]; E.Longitude = [null, -1.70, null];
  const R = D.Reponses, id = Math.max(...R.id) + 1;
  for (const k of Object.keys(R)) R[k].push(k === 'id' ? id : k === 'Etablissement' ? 3 : k === 'Dossier' ? id : k === 'Derniere_version' ? true : k === 'Qualification' ? 'RAS' : k === 'Nature' ? 'Nouveau signalement' : k === 'Description' ? 'IEP calme' : k === 'Date_faits' ? Date.UTC(2026, 9, 22) / 1000 : k === 'Cree_le' ? Date.UTC(2026, 9, 22, 9) / 1000 : (typeof R[k][0] === 'string' ? '' : null));
  return doc;
}
(async () => {
  let doc = docEsr();
  const browser = await chromium.launch({ executablePath: __C.chromium }); const page = await browser.newPage({ viewport: { width: 1300, height: 1600 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => d.accept());
  await page.route('**/jszip.min.js', r => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(require.resolve('jszip/dist/jszip.min.js')) }));
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(1200);
  await page.click('nav button[data-onglet=referentiel]'); await page.waitForTimeout(1200);
  await page.setInputFiles('#esr-fichier', CLASSEUR); await page.waitForTimeout(2000);
  const texte = sel => page.$eval(sel, e => e.innerText.replace(/[ \t]+/g, ' ').replace(/\n+/g, ' ⏎ ')).catch(() => '?');
  console.log('BILAN :', await texte('#ref-esr'));
  // une colonne facultative cochée : reprise à l'import
  await page.click('#ref-esr details.esr-options summary'); await page.check('#ref-esr [data-opt=etab][value="Effectif étudiants déclaré"]'); await page.waitForTimeout(1200);
  console.log('COLONNES APRÈS OPTION :', (await texte('#ref-esr')).match(/Colonnes créées dans Etablissements : [^⏎]*/)[0]);
  await page.screenshot({ path: __C.sorties + '/run81-bilan.png', fullPage: true });
  await page.click('#esr-importer'); await page.waitForTimeout(3000);
  console.log('STATUT :', await texte('#esr-statut'));
  const etat = await page.evaluate(() => {
    const D = window.__DOC__.__data, E = D.Etablissements, cols = ['Etablissement_ID', 'Nom', 'Niveau', 'Rattachement', 'UAI', 'Statut_public_prive', 'Etat', 'Latitude', 'Effectif_etudiants_declare', 'Origine'];
    const S = D.Referentiel_sites, A = D.Sites_correspondances;
    return { etab: E.id.map((id, i) => `${id}: ` + cols.map(c => `${c}=${E[c] ? JSON.stringify(E[c][i]) : '∅'}`).join(' ')).join('\n   '),
      sites: S.id.map((id, i) => `${id}: ${S.Site_id[i] || ''} ${S.Nom[i]} etab=${S.Etablissement[i]} comp=${S.Composante ? S.Composante[i] : '∅'} ${S.Statut ? S.Statut[i] : ''} ${S.Latitude ? S.Latitude[i] : ''} actif=${S.Actif ? S.Actif[i] : '∅'}`).join('\n   '),
      alias: A.id.map((id, i) => `${id}: etab=${A.Etablissement[i]} « ${A.Libelle[i]} » → ${A.Site[i]} ${A.Statut[i]}`).join('\n   '),
      reponse3: D.Reponses.Etablissement[D.Reponses.Etablissement.length - 1],
      choix: window.__DOC__._grist_Tables_column.colId.map((c, i) => [c, window.__DOC__._grist_Tables_column.widgetOptions[i]]).filter(([c]) => ['Niveau', 'Statut', 'Source'].includes(c)).map(([c, w]) => c + ':' + ((JSON.parse(w || '{}').choices) || []).join('/')).join('  '),
      config: (D.Config.Cle.indexOf('referentiel_esr') >= 0) };
  });
  console.log('ÉTABLISSEMENTS :\n  ', etat.etab); console.log('SITES :\n  ', etat.sites); console.log('CORRESPONDANCES :\n  ', etat.alias);
  console.log('SIGNALEMENT DE L\'IEP REPORTÉ VERS :', etat.reponse3, '| CHOIX :', etat.choix, '| CONFIG :', etat.config);
  // réimport du même classeur : rien à ajouter
  await page.setInputFiles('#esr-fichier', CLASSEUR); await page.waitForTimeout(2000);
  console.log('RÉIMPORT :', (await texte('#ref-esr')).match(/À ajouter[^⏎]*⏎ À mettre à jour[^⏎]*⏎ Inchangées[^⏎]*/g));
  console.log('RAPPROCHEMENT (sites.js) :', (await texte('#ref-sites')).slice(0, 400));
  doc = await page.evaluate(() => window.__DOC__);

  // formulaire par site
  const p2 = await browser.newPage({ viewport: { width: 1100, height: 1400 } });
  p2.on('pageerror', e => console.log('PAGEERROR', e.message)); p2.on('dialog', d => d.dismiss());
  const opts = { formulaire: 'Signalements', libelle: 'Alice' };
  await p2.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};window.__OPTS__=${JSON.stringify(opts)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + fs.readFileSync('mock-saisie.js') }));
  await p2.goto('file://' + __C.racine + '/v2/saisie/index.html'); await p2.waitForTimeout(1500);
  await p2.click('#porte-nouveau'); await p2.waitForTimeout(400);
  const chercher = async q => { await p2.fill('#nom', ''); await p2.fill('#nom', q); await p2.waitForTimeout(700); return p2.$$eval('#liste [role=option]', l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim().slice(0, 70)).join(' | ')); };
  console.log('RECHERCHE « IEP » :', await chercher('IEP'));
  console.log('RECHERCHE « rennes » :', await chercher('rennes'));
  console.log('RECHERCHE « IUT » :', await chercher('IUT'));
  await p2.click('#liste [role=option] >> nth=0'); await p2.waitForTimeout(600);
  const optionsSite = async () => { await p2.click('[data-action=ajouter]'); await p2.waitForTimeout(300);
    return p2.$$eval('.ligne-rep .sous-champ[data-sous=Site] select', l => l.length ? [...l[l.length - 1].options].map(o => o.textContent).join(', ') : '(pas de ligne)'); };
  console.log('SITES PROPOSÉS (IUT, composante) :', await optionsSite());
  // campus sans site propre : sites de l'établissement de rattachement
  await p2.goto('file://' + __C.racine + '/v2/saisie/index.html'); await p2.waitForTimeout(1500);
  await p2.click('#porte-nouveau'); await p2.waitForTimeout(400);
  console.log('RECHERCHE « saint-malo » :', await chercher('saint-malo'));
  await p2.click('#liste [role=option] >> nth=0'); await p2.waitForTimeout(600);
  console.log('SITES PROPOSÉS (campus de Saint-Malo → Rennes 2) :', await optionsSite());
  await browser.close();
})();
