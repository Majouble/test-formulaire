// Pièces jointes et liens d'établissement : métadonnées de Grist illisibles, le formulaire lit la copie des colonnes
// (clé « schema » de Config). Copie antérieure à l'adaptation de la question (colonne Pièces jointes encore « simple ») :
// le formulaire repère la colonne d'envoi dans la table réelle et n'écrit jamais dans la colonne en formule
// (sinon : « Can't save value to formula column »). Copie à jour : même résultat.
const __C = require('./chemins');
const { chromium, devices } = require('playwright'); const fs = require('fs');
const { docPj } = require('./run105');
function copie(doc) {   // même forme que Socle.instantaneSchema
  const T = doc._grist_Tables, C = doc._grist_Tables_column, out = {};
  T.tableId.forEach((tid, k) => {
    const ref = T.id[k];
    out[tid] = C.id.map((_, i) => i).filter(i => C.parentId[i] === ref && C.colId[i] !== 'manualSort').map(i => {
      const v = (C.visibleCol || [])[i], vi = v ? C.id.indexOf(v) : -1;
      return { colId: C.colId[i], label: C.label[i] || '', type: C.type[i] || 'Any', widgetOptions: C.widgetOptions[i] || '', isFormula: !!C.isFormula[i],
        formula: C.formula[i] || '', description: (C.description || [])[i] || '', visibleCol: vi >= 0 ? C.colId[vi] : '' };
    });
  });
  return { tables: out, maj: '2026-10-01T00:00:00Z' };
}
function docLien(perimee) {
  const doc = docPj(true), sch = copie(perimee ? docPj(false) : doc), C = doc.__data.Config;
  const i = C.Cle.indexOf('schema');
  if (i >= 0) C.Valeur[i] = JSON.stringify(sch);
  else { const n = Math.max(0, ...C.id) + 1; Object.keys(C).forEach(k => C[k].push(k === 'id' ? n : k === 'Cle' ? 'schema' : k === 'Valeur' ? JSON.stringify(sch) : null)); }
  return doc;
}
(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });
  for (const perimee of [true, false]) {
    const doc = docLien(perimee);
    const ctx = await browser.newContext({ ...devices['iPhone 13'], defaultBrowserType: undefined });
    const page = await ctx.newPage();
    page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => d.accept());
    let prochain = 51;
    await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__FORMULES_STRICTES__=true;window.__vraiFetch=window.fetch.bind(window);window.__DOC__=${JSON.stringify(doc)};window.__OPTS__=${JSON.stringify({ formulaire: 'Signalements' })};`
      + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + fs.readFileSync('mock-saisie.js')
      + `;{const f=window.fetch;window.fetch=(u,...a)=>String(u).includes('/attachments')?window.__vraiFetch(u,...a):f(u,...a);}`
      + `;(()=>{const f=grist.docApi.fetchTable;grist.docApi.fetchTable=async t=>{ if(['_grist_Tables','_grist_Tables_column','_grist_Attachments'].includes(t)) throw new Error('Blocked by table read access rules'); return f(t); };})();` }));
    await page.route(/http:\/\/localhost\/x\/attachments/, async r => {
      const q = r.request();
      if (q.method() === 'POST') { const corps = q.postDataBuffer() || Buffer.alloc(0), nom = (/filename="([^"]+)"/.exec(corps.toString('latin1')) || [])[1];
        const id = prochain++;
        await page.evaluate(([id, nom, n]) => { const A = window.__DOC__._grist_Attachments; A.id.push(id); A.fileName.push(nom); A.fileSize.push(n); A.imageHeight.push(100); }, [id, nom, corps.length]).catch(() => {});
        return r.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([id]) }); }
      return r.fulfill({ contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6XqXcEAAAAASUVORK5CYII=', 'base64') });
    });
    await page.goto('file://' + __C.racine + '/v2/saisie/index.html'); await page.waitForTimeout(1800);
    const etiquette = perimee ? 'COPIE PÉRIMÉE' : 'COPIE À JOUR';
    console.log(etiquette, '| alerte :', await page.$eval('#alerte', e => e.hidden ? '(aucune)' : e.textContent.slice(0, 120)));
    await page.click('#porte-nouveau'); await page.waitForTimeout(300);
    await page.fill('#nom', 'Jean Moulin'); await page.waitForTimeout(700); await page.click('#liste [role=option] >> nth=0'); await page.waitForTimeout(700);
    await page.setInputFiles('#q-Photos-fichiers', { name: 'IMG_0050.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) }); await page.waitForTimeout(900);
    for (const b of await page.$$('[data-action=confirmer-site]')) await b.click().catch(() => {});
    await page.fill('#description', 'Dégradation, photo jointe'); await page.click('#btn-signalement'); await page.waitForTimeout(1500);
    const R = await page.evaluate(() => { const R = window.__DOC__.__data.Reponses, k = R.id.length - 1; return { desc: R.Description[k], photos: JSON.stringify(R.Photos[k]), envoi: R.Photos_envoi[k] }; });
    const err = await page.$eval('#msg', e => e.textContent).catch(() => '');
    console.log(etiquette, '| enregistré :', R.desc === 'Dégradation, photo jointe', '| colonne Photos (formule) non écrite :', R.photos, '| envoi :', String(R.envoi || '').replace(/:([0-9a-f]{40})$/, ':<sha1 ok>'), err && /formula|Pièces jointes/.test(err) ? `| ERREUR : ${err.slice(0, 160)}` : '');
    await ctx.close();
  }
  await browser.close();
})();
