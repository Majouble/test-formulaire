// Question tableau historisée : une copie des lignes par version, mouvements Ajout / Modification / Inchangée / Retrait
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  let doc = JSON.parse(fs.readFileSync(__C.donnees + '/' + 'doc_saisie2.json'));
  const T = doc._grist_Tables, C = doc._grist_Tables_column, R = doc.__data.Reponses;
  const ajCol = (table, col, ty, wo = '') => { const tr = T.id[T.tableId.indexOf(table)], n = Math.max(...C.id) + 1; for (const k of Object.keys(C)) C[k].push(k === 'id' ? n : k === 'parentId' ? tr : k === 'colId' || k === 'label' ? col : k === 'type' ? ty : k === 'widgetOptions' ? wo : k === 'isFormula' ? false : (typeof C[k][0] === 'number' ? 0 : typeof C[k][0] === 'boolean' ? false : '')); };
  if (!R.Dossier) { ajCol('Reponses', 'Dossier', 'Ref:Reponses'); R.Dossier = R.id.slice(); }
  ajCol('Reponses', 'Blesses_json', 'Text'); R.Blesses_json = R.id.map(() => '');
  const tid = Math.max(...T.id) + 1; for (const k of Object.keys(T)) T[k].push(k === 'id' ? tid : k === 'tableId' ? 'Blesses' : (typeof T[k][0] === 'number' ? 0 : ''));
  for (const [c, ty, wo] of [['Dossier', 'Ref:Reponses'], ['Ligne_id', 'Text'], ['Ordre', 'Int'], ['Version', 'Ref:Reponses'], ['Mouvement', 'Choice', JSON.stringify({ choices: ['Ajout', 'Modification', 'Inchangée', 'Retrait'] })],
    ['Gravite', 'Choice', JSON.stringify({ choices: ['Légère', 'Grave'] })], ['Nom', 'Text']]) ajCol('Blesses', c, ty, wo || '');
  // une ligne d'avant l'historique sur le dossier 1 (sans version)
  doc.__data.Blesses = { id: [1], Dossier: [1], Ligne_id: ['ancien'], Ordre: [1], Version: [0], Mouvement: [null], Gravite: ['Légère'], Nom: ['Ancien'] };
  R.Blesses_json[0] = JSON.stringify([{ _id: 'ancien', Gravite: 'Légère', Nom: 'Ancien' }]);
  const F = doc.__data.Formulaires, i = F.Nom.indexOf('Signalements'), conf = JSON.parse(F.Publie[i]);
  conf.blocs = [{ id: 'b1', section: 'q', genre: 'question', colonne: 'Blesses_json', reglages: { libelle: 'Blessés', tableau: { table: 'Blesses' } } }];
  F.Publie[i] = JSON.stringify(conf);
  const browser = await chromium.launch({ executablePath: __C.chromium }); const page = await browser.newPage({ viewport: { width: 1100, height: 1200 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => d.accept());
  const opts = { formulaire: 'Signalements', libelle: 'Alice', perimetre: { Academie: ['Versailles'] } };
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};window.__OPTS__=${JSON.stringify(opts)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + fs.readFileSync('mock-saisie.js') }));
  const B = () => page.evaluate(() => { const b = window.__DOC__.__data.Blesses; return b.id.map((id, i) => `${id}:d${b.Dossier[i]}/v${b.Version[i]}/${b.Ligne_id[i]}/${b.Mouvement[i]}/${b.Gravite[i]}/${b.Nom[i]}`).join('  '); });
  const poser = lignes => page.evaluate(ls => { const c = Object.values(tableaux).find(x => x.table === 'Blesses' && document.body.contains(x.el)); c.lignes = ls.map(l => ({ _id: l.id, valeurs: l.v })); c.dessiner(); c.signaler && c.signaler(); }, lignes);
  await page.goto('file://' + __C.racine + '/v2/saisie/index.html'); await page.waitForTimeout(1500);
  // 1. dossier existant (ligne ancienne sans version) : mise à jour
  await page.click('#cartes-signalements li >> nth=0'); await page.waitForTimeout(900);
  console.log('TABLEAU chargé :', await page.evaluate(() => { const c = Object.values(tableaux).find(x => x.table === 'Blesses' && document.body.contains(x.el)); return c ? `${c.colVersion}/${c.colMouvement} lignes=${c.lignes.map(l => l._id).join(',')}` : 'absent'; }));
  await poser([{ id: 'ancien', v: { Gravite: 'Grave', Nom: 'Ancien' } }, { id: 'n1', v: { Gravite: 'Légère', Nom: 'Nouveau 1' } }]);
  await page.fill('#description', 'Mise à jour avec blessés'); await page.waitForTimeout(200);
  await page.click('#btn-signalement'); await page.waitForTimeout(1200);
  console.log('V2 :', await page.textContent('#statut-signalement'));
  console.log('  ', await B());
  // 2. nouvelle mise à jour : retrait de « ancien », n1 inchangée, ajout n2
  doc = await page.evaluate(() => window.__DOC__);
  await page.goto('file://' + __C.racine + '/v2/saisie/index.html'); await page.waitForTimeout(1500);
  await page.click('#cartes-signalements li >> nth=0'); await page.waitForTimeout(900);
  console.log('RELU :', await page.evaluate(() => { const c = Object.values(tableaux).find(x => x.table === 'Blesses' && document.body.contains(x.el)); return c.lignes.map(l => l._id + '=' + JSON.stringify(l.valeurs)).join(' | '); }));
  await poser([{ id: 'n1', v: { Gravite: 'Légère', Nom: 'Nouveau 1' } }, { id: 'n2', v: { Gravite: 'Grave', Nom: 'Nouveau 2' } }]);
  await page.fill('#description', 'Seconde mise à jour'); await page.waitForTimeout(200);
  await page.click('#btn-signalement'); await page.waitForTimeout(1200);
  console.log('V3 :', await page.textContent('#statut-signalement'));
  console.log('  ', await B());
  // 3. création d'un dossier avec deux lignes
  doc = await page.evaluate(() => window.__DOC__);
  await page.goto('file://' + __C.racine + '/v2/saisie/index.html'); await page.waitForTimeout(1500);
  await page.click('#porte-nouveau'); await page.waitForTimeout(400);
  await page.fill('#nom', 'Lycée'); await page.waitForTimeout(700); await page.click('#liste [role=option] >> nth=0'); await page.waitForTimeout(400);
  await page.check('input[name=qualif-initiale]', { force: true }).catch(e => console.log('radio ?', e.message.slice(0, 80)));
  await poser([{ id: 'c1', v: { Gravite: 'Grave', Nom: 'Créé 1' } }]);
  await page.fill('#description', 'Création'); await page.click('#btn-signalement'); await page.waitForTimeout(1200);
  console.log('CRÉATION :', await page.textContent('#statut-signalement'));
  console.log('  ', await B());
  // 4. reconstruction de tout l'historique depuis les JSON des versions
  const avant = await B();
  await page.evaluate(() => reconstruireTableaux()); await page.waitForTimeout(2500);
  console.log('RECONSTRUIT :', await page.textContent('#statut-tableaux').catch(() => '?'));
  const apres = await B(); console.log('  identique ?', avant === apres); if (avant !== apres) console.log('  ', apres);
  await browser.close();
})();
