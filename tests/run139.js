// 2.62 : partenaires, périmètre académique quand la colonne Academie des tables est une référence (vers Academies) :
// colonne « Academies » des partenaires créée en liste de références vers la même table, nom affiché ; périmètre déjà
// saisi en texte (liste de choix) : avertissement, puis conversion avec reprise des noms ; règle rec.Academie in …
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docSites } = require('./run78');

function docComplet() {   // comme run112 : document des sites + équipe et planning
  const doc = docSites(), P = JSON.parse(fs.readFileSync(__C.donnees + '/doc_planning.json'));
  const T = doc._grist_Tables, C = doc._grist_Tables_column, TP = P._grist_Tables, CP = P._grist_Tables_column;
  for (const t of ['Agents', 'Creneaux', 'Affectations']) {
    const ancien = TP.id[TP.tableId.indexOf(t)], nouveau = Math.max(...T.id) + 1; T.id.push(nouveau); T.tableId.push(t);
    CP.id.forEach((_, i) => { if (CP.parentId[i] !== ancien) return; const n = Math.max(...C.id) + 1; Object.keys(C).forEach(k => C[k].push(k === 'id' ? n : k === 'parentId' ? nouveau : CP[k] ? CP[k][i] : null)); });
    doc.__data[t] = P.__data[t];
  }
  // clé et lien d'accès des établissements, auteur des signalements : colonnes que les partenaires ne doivent pas lire
  const ajouterCol = (t, colId, type) => { const ref = T.id[T.tableId.indexOf(t)], n = Math.max(...C.id) + 1;
    Object.keys(C).forEach(k => C[k].push(k === 'id' ? n : k === 'parentId' ? ref : k === 'colId' ? colId : k === 'type' ? type : k === 'label' ? colId : k === 'isFormula' ? false : k === 'formula' || k === 'widgetOptions' ? '' : k === 'parentPos' ? n : 0));
    doc.__data[t][colId] = doc.__data[t].id.map(() => ''); };
  ajouterCol('Etablissements', 'UUID', 'Text'); ajouterCol('Etablissements', 'Lien', 'Text'); ajouterCol('Reponses', 'Auteur', 'Text');
  // page des partenaires : widget Fiche établissement, option « partenaires »
  const V = doc._grist_Views, S = doc._grist_Views_section, Pg = doc._grist_Pages;
  V.id.push(3); V.name.push('Fiches partenaires');
  const sid = Math.max(...S.id) + 1; S.id.push(sid); S.parentId.push(3); S.parentKey.push('custom'); S.tableRef.push(T.id[T.tableId.indexOf('Etablissements')]); S.title.push('');
  S.options.push(JSON.stringify({ customView: JSON.stringify({ mode: 'url', url: 'https://majouble.github.io/test-formulaire/v2/fiche/', access: 'full', widgetOptions: { partenaires: true } }) }));
  Pg.id = [1, 2, 3]; Pg.viewRef = [1, 2, 3]; Pg.pagePos = [1, 2, 3]; Pg.indentation = [0, 0, 0];
  doc._grist_ACLResources = { id: [], tableId: [], colIds: [] }; doc._grist_ACLRules = { id: [], resource: [], aclFormula: [], permissionsText: [], rulePos: [], memo: [], userAttributes: [] };
  // table des académies ; colonne Academie (référence) dans le référentiel et les signalements
  if (!C.visibleCol) C.visibleCol = C.id.map(() => 0);
  const ref = Math.max(...T.id) + 1; T.id.push(ref); T.tableId.push('Academies');
  const ajouterRef = (t, colId, type, vis) => { const r = T.id[T.tableId.indexOf(t)], n = Math.max(...C.id) + 1;
    Object.keys(C).forEach(k => C[k].push(k === 'id' ? n : k === 'parentId' ? r : k === 'colId' ? colId : k === 'type' ? type : k === 'label' ? colId : k === 'isFormula' ? false : k === 'visibleCol' ? (vis || 0) : k === 'formula' || k === 'widgetOptions' ? '' : k === 'parentPos' ? n : null)); return n; };
  const nom = ajouterRef('Academies', 'Nom', 'Text');
  doc.__data.Academies = { id: [1, 2, 3], Nom: ['Créteil', 'Paris', 'Versailles'] };
  for (const t of ['Etablissements', 'Reponses']) { ajouterRef(t, 'Academie', 'Ref:Academies', nom); doc.__data[t].Academie = doc.__data[t].id.map((_, i) => (i % 3) + 1); }
  if (process.env.AVANT_TEXTE) { /* table Partenaires déjà créée avec un périmètre en texte */ }
  return doc;
}

(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });
  for (const scenario of ['création', 'conversion']) {
    const page = await browser.newPage({ viewport: { width: 1300, height: 1300 } });
    page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => d.accept());
    await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(docComplet())};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
    await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(1200);
    await page.click('nav button[data-onglet=acces]'); await page.waitForTimeout(2000);
    await page.check('[data-part-table="Etablissements"]'); await page.check('[data-part-table="Reponses"]');
    await page.click('#ac-part-tables'); await page.waitForTimeout(1500);
    const colAca = () => page.evaluate(() => { const T = window.__DOC__._grist_Tables, C = window.__DOC__._grist_Tables_column, ref = T.id[T.tableId.indexOf('Partenaires')];
      const i = C.id.findIndex((_, k) => C.parentId[k] === ref && C.colId[k] === 'Academies'); return i < 0 ? null : `${C.type[i]} (affichée : ${C.visibleCol[i] ? C.colId[C.id.indexOf(C.visibleCol[i])] : '—'})`; });
    if (scenario === 'création') {
      await page.click('#ac-part-creer'); await page.waitForTimeout(1500);
      console.log('CRÉATION, colonne Academies :', await colAca());
    } else {
      // table créée avant la 2.62.0-alpha.31 : périmètre en liste de choix, déjà saisi en texte
      await page.evaluate(() => grist.docApi.applyUserActions([['AddTable', 'Partenaires', [{ id: 'Nom', type: 'Text' }, { id: 'Cle', type: 'Text' }, { id: 'Actif', type: 'Bool' }, { id: 'Lien', type: 'Text' }, { id: 'Fiche', type: 'Text' }, { id: 'Lecture_seule', type: 'Bool' }, { id: 'Academies', type: 'ChoiceList' }]],
        ['AddRecord', 'Partenaires', null, { Nom: 'Rectorat de Versailles', Cle: 'k1', Actif: true, Academies: ['L', 'Versailles'] }], ['AddRecord', 'Partenaires', null, { Nom: 'Préfecture', Cle: 'k2', Actif: true, Academies: ['L', 'versailles ', 'Lyon'] }]]));
      await page.click('nav button[data-onglet=acces]'); await page.waitForTimeout(1500);
      const carte = await page.$eval('#acces', e => [...e.querySelectorAll('section.carte')].find(s => /Partenaires/.test(s.querySelector('h2').textContent)).innerText.replace(/\s+/g, ' '));
      console.log('AVERTISSEMENT :', (carte.match(/La colonne « Academie »[^.]*\./) || ['absent'])[0], '| bouton :', !!(await page.$('#ac-part-convertir')));
      await page.click('#ac-part-convertir'); await page.waitForTimeout(1500);
      console.log('CONVERSION, colonne Academies :', await colAca(), '| valeurs :', JSON.stringify(await page.evaluate(() => window.__DOC__.__data.Partenaires.Academies)));
      console.log('STATUT :', await page.textContent('#ac-part-statut'));
    }
    const regles = await page.$$eval('#acces .ac-table', l => l.map(d => ({ titre: d.querySelector('strong').textContent,
      f: [...d.querySelectorAll('.ac-formules tr')].map(tr => tr.textContent.replace(/\s+/g, ' ').trim()) })).filter(x => /Reponses — signalements|Etablissements — référentiel/.test(x.titre)));
    regles.forEach(r => console.log('RÈGLE', r.titre, '::', r.f.filter(f => /Academie/.test(f)).join(' ; ')));
    await page.close();
  }
  await browser.close();
})();
