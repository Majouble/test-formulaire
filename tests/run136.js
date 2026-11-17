// 2.62 : Fiche établissement — lecture des tables par l'API SQL de Grist (jeton d'accès), mêmes fiches qu'avec fetchTable ;
// Points_situation lue pour sa seule colonne Horodatage ; SQL refusée (lien sans accès complet) : retour à fetchTable.
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docFiche, CONFIG } = require('./run127');

async function ouvrir(b, mode) {
  const d = docFiche(), T = d._grist_Tables, C = d._grist_Tables_column;
  const p = await b.newPage({ viewport: { width: 1200, height: 1100 } }); p.on('pageerror', e => console.log('PAGEERROR', e.message));
  const requetes = [];
  // API SQL simulée : valeurs au format de la base (listes en JSON, cases à cocher en 0/1)
  await p.route('https://grist.test/**', async r => {
    if (mode === 'refus') return r.fulfill({ status: 403, body: '{}' });
    const q = new URL(r.request().url()).searchParams.get('q'); requetes.push(q);
    const m = /^SELECT (.+) FROM "([^"]+)"$/.exec(q), cols = m[1].split(', ').map(c => c.replace(/"/g, '')), t = d.__data[m[2]] || { id: [] };
    const ref = T.id[T.tableId.indexOf(m[2])], type = c => { const i = C.id.findIndex((_, k) => C.parentId[k] === ref && C.colId[k] === c); return i < 0 ? '' : C.type[i]; };
    const enBase = (c, v) => Array.isArray(v) && v[0] === 'L' ? JSON.stringify(v.slice(1)) : type(c) === 'Bool' ? (v == null ? v : v ? 1 : 0) : v;
    r.fulfill({ contentType: 'application/json', body: JSON.stringify({ records: t.id.map((id, i) => ({ fields: Object.fromEntries(cols.map(c => [c, c === 'id' ? id : enBase(c, (t[c] || [])[i])])) })) }) });
  });
  await p.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(d)};` + fs.readFileSync('mock.js')
    + `;window.__FT=[];const __f=grist.docApi.fetchTable.bind(grist.docApi);grist.docApi.fetchTable=async n=>{if(!n.startsWith('_grist'))window.__FT.push(n);return __f(n);};`
    + (mode === 'fetch' ? '' : `grist.docApi.getAccessToken=async()=>({token:'jeton',baseUrl:'https://grist.test/api/docs/doc1',ttl:300});`)
    + `grist.ready=()=>{};grist.onOptions=cb=>setTimeout(()=>cb(${JSON.stringify({ fiche: CONFIG })}),50);grist.setOptions=async()=>{};grist.onRecord=cb=>{window.__REC=cb;};grist.setCursorPos=async()=>{};grist.selectedTable={getTableId:async()=>'Etablissements'};` }));
  await p.goto('file://' + __C.racine + '/v2/fiche/index.html'); await p.waitForTimeout(1200);
  await p.evaluate(() => window.__REC({ id: 1 })); await p.waitForTimeout(400);
  const tuiles = await p.$$eval('.tuile', l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  const ft = await p.evaluate(() => window.__FT), titre = await p.getAttribute('#version', 'title');
  await p.close();
  return { tuiles, requetes, ft, titre };
}
(async () => {
  const b = await chromium.launch({ executablePath: __C.chromium });
  const ref = await ouvrir(b, 'fetch'), sql = await ouvrir(b, 'sql'), refus = await ouvrir(b, 'refus');
  console.log('FETCHTABLE, tables lues :', ref.ft.join(','));
  console.log('SQL, requêtes :', sql.requetes.length, '| fetchTable restants :', sql.ft.join(',') || 'aucun');
  console.log('SQL, POINTS DE SITUATION :', sql.requetes.filter(q => q.includes('Points_situation')).join(' ; ') || '(table non demandée)');
  console.log('MÊMES TUILES (SQL / fetchTable) :', JSON.stringify(sql.tuiles) === JSON.stringify(ref.tuiles), '|', sql.tuiles.length, 'tuiles');
  console.log('REFUS SQL → fetchTable :', refus.ft.join(','), '| mêmes tuiles :', JSON.stringify(refus.tuiles) === JSON.stringify(ref.tuiles));
  console.log('DURÉES AU SURVOL :', (sql.titre || '').split('\n').slice(0, 3).join(' / '));
  await b.close();
})();
