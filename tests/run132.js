// 2.62 : partenaires (consultation des fiches établissement par lien) — onglet Accès : création de la table
// Partenaires (clé UUID, lien vers la page des partenaires en « page seule »), tables ouvertes (clé « partenaires »
// de Config, tables de réglages et d'équipe jamais proposées), règles : attribut « Partenaire », sa seule ligne
// (modification de ses réglages de fiche seulement), lecture seule des tables ouvertes, clés et liens des
// établissements, visas et auteur illisibles ; page des partenaires reconnue comme page de lien.
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
  return doc;
}

(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const page = await browser.newPage({ viewport: { width: 1300, height: 1300 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => d.accept());
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(docComplet())};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(1200);
  await page.click('nav button[data-onglet=acces]'); await page.waitForTimeout(2000);
  const carte = () => page.$eval('#acces', e => [...e.querySelectorAll('section.carte')].find(s => /Partenaires/.test(s.querySelector('h2').textContent)).innerText.replace(/\s+/g, ' '));
  console.log('CARTE (avant) :', (await carte()).slice(0, 420));
  console.log('TABLES PROPOSÉES :', (await page.$$eval('[data-part-table]', l => l.map(i => i.dataset.partTable))).join(', '));

  await page.click('#ac-part-creer'); await page.waitForTimeout(1500);
  const cols = await page.evaluate(() => { const T = window.__DOC__._grist_Tables, C = window.__DOC__._grist_Tables_column, ref = T.id[T.tableId.indexOf('Partenaires')];
    return C.id.map((_, i) => C.parentId[i] === ref ? `${C.colId[i]} [${C.type[i]}${C.isFormula[i] ? ', formule' : ''}] ${C.formula[i] || ''}` : null).filter(Boolean); });
  console.log('TABLE PARTENAIRES :', JSON.stringify(cols));
  console.log('STATUT :', await page.textContent('#ac-part-statut'));

  await page.check('[data-part-table="Etablissements"]'); await page.check('[data-part-table="Reponses"]');
  await page.click('#ac-part-tables'); await page.waitForTimeout(1500);
  const cfg = await page.evaluate(() => { const t = window.__DOC__.__data.Config; const i = t.Cle.indexOf('partenaires'); return i < 0 ? null : t.Valeur[i]; });
  console.log('CONFIG « partenaires » :', cfg, '|', await page.textContent('#ac-part-statut'));

  // règles proposées pour les partenaires
  const regles = await page.$$eval('#acces .ac-table', l => l.map(d => ({ titre: d.querySelector('strong').textContent,
    f: [...d.querySelectorAll('.ac-formules tr')].map(tr => tr.textContent.replace(/\s+/g, ' ').trim()) })).filter(x => x.f.some(f => /Partenaire/.test(f)) || /artenaire/.test(x.titre)));
  regles.forEach(r => console.log('RÈGLE', r.titre, '::', r.f.filter(f => /Partenaire|OWNER/.test(f)).join(' ; ')));
  console.log('ATTRIBUT :', (await page.$eval('#acces', e => e.innerText.match(/Attribut « Partenaire »[^.]*\./) || ['absent']))[0]);
  const pages = await page.$eval('#acces', e => (e.innerText.match(/Page des partenaires[^\n]*/) || [''])[0]);
  console.log('PAGE :', pages);
  await browser.close();
})();
