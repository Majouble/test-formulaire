// Formulaire par site (ESR) : reprise du dernier état connu de chaque site, qualification déduite en bas, contrôle de cohérence
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
function docSites() {
  const doc = JSON.parse(fs.readFileSync(__C.donnees + '/doc_saisie2.json'));
  const T = doc._grist_Tables, C = doc._grist_Tables_column, D = doc.__data;
  const table = (nom, cols, data) => { const tid = Math.max(...T.id) + 1; for (const k of Object.keys(T)) T[k].push(k === 'id' ? tid : k === 'tableId' ? nom : (typeof T[k][0] === 'number' ? 0 : ''));
    cols.forEach(([c, ty, wo]) => ajCol(nom, c, ty, wo)); D[nom] = data; };
  const ajCol = (nom, c, ty, wo = '') => { const tr = T.id[T.tableId.indexOf(nom)], n = Math.max(...C.id) + 1; for (const k of Object.keys(C)) C[k].push(k === 'id' ? n : k === 'parentId' ? tr : k === 'colId' || k === 'label' ? c : k === 'type' ? ty : k === 'widgetOptions' ? wo : k === 'isFormula' ? false : (typeof C[k][0] === 'number' ? 0 : typeof C[k][0] === 'boolean' ? false : '')); };
  const QUALIFS = JSON.stringify({ choices: ['Blocage total', 'Blocage partiel', 'Rassemblement', 'RAS'] });
  { const tr = T.id[T.tableId.indexOf('Reponses')]; const i = C.id.findIndex((_, k) => C.parentId[k] === tr && C.colId[k] === 'Qualification'); C.widgetOptions[i] = QUALIFS; }
  table('Referentiel_sites', [['Site_id', 'Text'], ['Nom', 'Text'], ['Etablissement', 'Ref:Etablissements']],
    { id: [1, 2, 3, 4, 5], Site_id: ['S1', 'S2', 'S3', 'S4', 'S5'], Nom: ['Campus centre', 'Campus Beaulieu', 'Site Villejean', 'Site Lorient', 'Campus Ivry'], Etablissement: [1, 1, 1, 1, 2] });
  table('Sites_correspondances', [['Etablissement', 'Ref:Etablissements'], ['Libelle', 'Text'], ['Site', 'Ref:Referentiel_sites'], ['Statut', 'Choice']],
    { id: [1], Etablissement: [1], Libelle: ['Campus Beaulieu bat 12'], Site: [2], Statut: ['Validé'] });
  table('Sites_signales', [['Dossier', 'Ref:Reponses'], ['Ligne_id', 'Text'], ['Ordre', 'Int'], ['Version', 'Ref:Reponses'], ['Mouvement', 'Choice'],
    ['Site', 'Ref:Referentiel_sites'], ['Site_libre', 'Text'], ['Qualification', 'Choice', QUALIFS], ['Precisions', 'Text']],
    { id: [], Dossier: [], Ligne_id: [], Ordre: [], Version: [], Mouvement: [], Site: [], Site_libre: [], Qualification: [], Precisions: [] });
  ajCol('Reponses', 'Detail_des_sites', 'Text'); ajCol('Reponses', 'Ancien_detail', 'Text');
  const R = D.Reponses; R.Detail_des_sites = R.id.map(() => ''); R.Ancien_detail = R.id.map(() => ''); R.Dossier = R.id.slice(); R.Derniere_version = R.id.map(() => true);
  const j = (jour, h) => Date.UTC(2026, 9, jour) / 1000 + (h || 0) * 3600;
  const ajR = (dossier, jour, h, qualif, detail, ancien) => { const id = Math.max(...R.id) + 1;
    R.id.push(id); R.Etablissement.push(1); R.Date_faits.push(j(jour)); R.Cree_le.push(j(jour, h)); R.Nature.push(dossier ? 'Mise à jour' : 'Nouveau signalement');
    R.Qualification.push(qualif); R.Description.push('Mouvement'); R.Dossier.push(dossier || id); R.Derniere_version.push(true);
    R.Detail_des_sites.push(detail ? JSON.stringify(detail) : ''); R.Ancien_detail.push(ancien ? JSON.stringify(ancien) : ''); return id; };
  // 20/10 : ancien formulaire (libellés libres)
  ajR(null, 20, 12.3, 'Blocage total', null, [{ _id: 'a', Nom_du_site: 'Campus Beaulieu bat 12', Qualification: 'Blocage total' }, { _id: 'b', Nom_du_site: 'Annexe Rue Dupont', Qualification: 'Rassemblement' }]);
  // 21/10 : site 1 bloqué puis revenu à la normale ; site 3 en rassemblement
  const d2 = ajR(null, 21, 10, 'Blocage partiel', [{ _id: 'c', Site: 1, Qualification: 'Blocage partiel' }]);
  ajR(d2, 21, 14.37, 'Rassemblement', [{ _id: 'c', Site: 1, Qualification: 'RAS' }, { _id: 'd', Site: 3, Qualification: 'Rassemblement' }]);
  // 22/10 : site 3 encore, puis retiré dans une mise à jour du même dossier
  const d3 = ajR(null, 22, 9, 'Rassemblement', [{ _id: 'e', Site: 3, Qualification: 'Rassemblement' }]);
  ajR(d3, 22, 16, 'RAS', [{ _id: 'f', Site: 4, Qualification: 'RAS' }]);
  const F = D.Formulaires, i = F.Nom.indexOf('Signalements'), conf = JSON.parse(F.Publie[i]);
  conf.blocs = [{ id: 'b1', section: 'q', genre: 'question', colonne: 'Detail_des_sites', reglages: { libelle: 'Sites concernés',
    tableau: { table: 'Sites_signales', sites: { site: 'Site', libre: 'Site_libre', qualif: 'Qualification', reprise: 'auto', historique: [{ colonne: 'Ancien_detail', libre: 'Nom_du_site', qualif: 'Qualification' }] } } } }];
  conf.saisie = { version: 'esr' };
  F.Publie[i] = JSON.stringify(conf);
  return doc;
}
module.exports = { docSites };
if (require.main === module) (async () => {
  let doc = docSites();
  const browser = await chromium.launch({ executablePath: __C.chromium }); const page = await browser.newPage({ viewport: { width: 1100, height: 1400 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => { console.log('DIALOG :', d.message().replace(/\n+/g, ' | ')); d.dismiss(); });
  const opts = { formulaire: 'Signalements', libelle: 'Alice', perimetre: { Academie: ['Versailles'] } };
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};window.__OPTS__=${JSON.stringify(opts)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + fs.readFileSync('mock-saisie.js') }));
  await page.goto('file://' + __C.racine + '/v2/saisie/index.html'); await page.waitForTimeout(1500);
  await page.click('#porte-nouveau'); await page.waitForTimeout(400);
  console.log('ORDRE : qualification après les sites ?', await page.evaluate(() => { const q = document.getElementById('qualifs-initiales').closest('fieldset'), s = document.getElementById('questions'); return !!(s.compareDocumentPosition(q) & Node.DOCUMENT_POSITION_FOLLOWING); }));
  await page.fill('#nom', 'Jean Moulin'); await page.waitForTimeout(700); await page.click('#liste [role=option] >> nth=0'); await page.waitForTimeout(500);
  console.log('REPRISE AUTOMATIQUE :', await page.$$eval('.ligne-rep .repris', l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim()).join(' || ')));
  console.log('PROPOSITION :', (await page.textContent('#proposition-encours')).replace(/\s+/g, ' ').slice(0, 260));
  await page.click('#proposition-encours [data-reprendre] >> nth=0'); await page.waitForTimeout(800);
  console.log('STATUT :', await page.textContent('#statut-signalement'));
  console.log('SITES REPRIS :', await page.$$eval('.ligne-rep', l => l.map(x => (x.querySelector('.repris') || {}).textContent + ' | ' + [...x.querySelectorAll('select, input[type=text], textarea')].map(c => c.tagName === 'SELECT' ? (c.selectedOptions[0] || {}).textContent : c.value).filter(Boolean).join(' / ') + ' | ' + [...x.querySelectorAll('input:checked')].map(c => c.value).join(','))).then(a => a.join('\n   ')));
  // champ du site : liste de l'établissement, recherche par mot-clé (libellé validé), nom libre accepté
  await page.click('[data-action=ajouter]'); await page.waitForTimeout(200);
  const champ = '.ligne-rep:last-child .site-txt', sugg = () => page.$$eval('.ligne-rep:last-child .site-sugg li', l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim()).join(' | '));
  await page.focus(champ); await page.waitForTimeout(150);
  console.log('SITES PROPOSÉS (champ vide) :', await sugg());
  await page.fill(champ, 'bat 12'); await page.waitForTimeout(150);
  console.log('« bat 12 » :', await sugg());
  await page.click('.ligne-rep:last-child .site-sugg li >> nth=0'); await page.waitForTimeout(150);
  console.log('CHOISI :', await page.evaluate(() => { const c = controleursTableau('q')[0], l = c.lignes[c.lignes.length - 1]; return JSON.stringify(l.valeurs); }));
  await page.fill(champ, 'Gymnase municipal'); await page.waitForTimeout(150);
  console.log('« Gymnase municipal » :', await sugg(), '| état :', await page.textContent('.ligne-rep:last-child .site-etat'));
  await page.keyboard.press('Escape');
  console.log('VALEURS :', await page.evaluate(() => { const c = controleursTableau('q')[0], l = c.lignes[c.lignes.length - 1]; return JSON.stringify(l.valeurs); }));
  console.log('QUALIF :', await page.evaluate(() => lireQualificationInitiale()), '|', await page.textContent('#qualif-sites'));
  // l'agent choisit une autre qualification : incohérence signalée et confirmation demandée
  await page.check('input[name=qualif-initiale][value="Rassemblement"]', { force: true }); await page.waitForTimeout(200);
  console.log('APRÈS CHOIX MANUEL :', await page.textContent('#qualif-sites'));
  await page.fill('#description', 'Suite du mouvement'); await page.click('#btn-signalement'); await page.waitForTimeout(600);
  console.log('ENREGISTRÉ (refusé) ? lignes Reponses =', await page.evaluate(() => window.__DOC__.__data.Reponses.id.length));
  // reprendre la qualification des sites, confirmer un site, modifier l'autre
  await page.click('#btn-qualif-sites'); await page.waitForTimeout(200);
  await page.click('.ligne-rep >> nth=0 >> [data-action=confirmer-site]'); await page.waitForTimeout(200);
  console.log('BOUTONS ligne reprise :', await page.$$eval('.ligne-rep >> nth=1', l => [...l[0].querySelectorAll('.actions-ligne button')].map(b => b.dataset.action + ':' + b.textContent).join(' ')), '| site verrouillé ?', await page.$eval('.ligne-rep:nth-child(1) .site-txt', x => x.disabled));
  await page.click('.ligne-rep >> nth=1 >> [data-action=ras-site]'); await page.waitForTimeout(200);
  console.log('APRÈS RAS : lignes', await page.$$eval('.ligne-rep', l => l.length), '| qualif ligne 2 :', await page.$$eval('.ligne-rep >> nth=1', l => [...l[0].querySelectorAll('input:checked')].map(c => c.value).join(',')));
  await page.click('.ligne-rep >> nth=1 >> .sous-champ[data-sous=Qualification] label:has-text("Blocage partiel")'); await page.waitForTimeout(200);
  console.log('MENTIONS :', await page.$$eval('.repris', l => l.map(x => x.textContent.trim()).join(' || ')));
  console.log('QUALIF :', await page.evaluate(() => lireQualificationInitiale()), '|', await page.textContent('#qualif-sites'));
  page.removeAllListeners('dialog'); page.on('dialog', d => { console.log('DIALOG (accepté) :', d.message().replace(/\n+/g, ' | ')); d.accept(); });
  await page.click('#btn-signalement'); await page.waitForTimeout(1200);
  console.log('STATUT :', await page.textContent('#statut-signalement'));
  console.log('SOUS-TABLE :', await page.evaluate(() => { const t = window.__DOC__.__data.Sites_signales; return t.id.map((id, i) => `${id}:v${t.Version[i]}/site ${t.Site[i]}/${t.Site_libre[i] || ''}/${t.Qualification[i]}/${t.Mouvement[i]}`).join('  '); }));
  console.log('RÉPONSE :', await page.evaluate(() => { const R = window.__DOC__.__data.Reponses, n = R.id.length - 1; return R.Qualification[n] + ' | ' + R.Detail_des_sites[n]; }));
  await page.screenshot({ path: __C.sorties + '/run78.png', fullPage: true });
  // mise à jour du dossier créé : les sites du dossier ne se suppriment pas, une ligne ajoutée oui
  doc = await page.evaluate(() => window.__DOC__);
  await page.goto('file://' + __C.racine + '/v2/saisie/index.html'); await page.waitForTimeout(1500);
  await page.click('#cartes-signalements li >> nth=0'); await page.waitForTimeout(900);
  await page.click('[data-action=ajouter]'); await page.waitForTimeout(200);
  console.log('MISE À JOUR, actions par ligne :', await page.$$eval('.ligne-rep', l => l.map(x => [...x.querySelectorAll('.actions-ligne button')].map(b => b.dataset.action).join('+')).join(' | ')));
  const verrous = () => page.$$eval('.ligne-rep .site-txt', l => l.map(x => `${x.value || '∅'}${x.disabled ? ' (verrouillé)' : ''}`).join(' | '));
  console.log('SITES (mise à jour) :', await verrous());
  await page.click('.ligne-rep >> nth=0 >> [data-action=corriger-site]'); await page.waitForTimeout(200);
  console.log('APRÈS « Corriger le site » :', await verrous());
  await browser.close();
})();
