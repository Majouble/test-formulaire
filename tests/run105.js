// Pièces jointes : question « Pièces jointes » (administration ; colonne simple adaptée aux liens d'établissement : colonne
// d'envoi + formule), ajout de photos et de documents depuis le formulaire sur téléphone (photo lourde réduite avant
// l'envoi, empreinte SHA-1), retrait, enregistrement dans la colonne d'envoi, mise à jour d'un dossier (pièces gardées)
const __C = require('./chemins');
const { chromium, devices } = require('playwright'); const fs = require('fs');
const { docSites } = require('./run78');
const FORMULE = ["# Pièces jointes envoyées par le formulaire (colonne Photos_envoi : « numéro:empreinte » de chaque fichier).", "# Seuls les fichiers dont l'empreinte (SHA-1 du contenu) correspond sont retenus.",
  "ids = []", "for x in ($Photos_envoi or \"\").split():", "  n, _, h = x.partition(':')", "  a = _grist_Attachments.lookupOne(id=int(n)) if n.isdigit() else None",
  "  if a and len(h) >= 40 and (a.fileIdent or '').startswith(h) and a.id not in ids:", "    ids.append(a.id)", "return ids"].join("\n");
function docPj(formule) {
  const doc = docSites(), T = doc._grist_Tables, C = doc._grist_Tables_column, D = doc.__data;
  const tr = T.id[T.tableId.indexOf('Reponses')];
  const ajCol = (col, label, type, f) => { const n = Math.max(...C.id) + 1; for (const k of Object.keys(C)) C[k].push(k === 'id' ? n : k === 'parentId' ? tr : k === 'colId' ? col : k === 'label' ? label : k === 'type' ? type : k === 'isFormula' ? !!f : k === 'formula' ? (f || '') : (typeof C[k][0] === 'number' ? 0 : typeof C[k][0] === 'boolean' ? false : '')); };
  if (formule) { ajCol('Photos_envoi', 'Photos et documents (envoi)', 'Text'); D.Reponses.Photos_envoi = D.Reponses.id.map(() => ''); }
  ajCol('Photos', 'Photos et documents', 'Attachments', formule ? FORMULE : '');
  D.Reponses.Photos = D.Reponses.id.map((_, i) => !formule && i === 2 ? ['L', 7] : null);
  const F = D.Formulaires, i = F.Nom.indexOf('Signalements'), conf = JSON.parse(F.Publie[i]);
  conf.blocs.push({ id: 'b2', section: 'q', genre: 'question', colonne: 'Photos', reglages: { libelle: 'Photos et documents', aide: 'Photos de la situation, courriers…' } });
  F.Publie[i] = JSON.stringify(conf); if (F.Brouillon) F.Brouillon[i] = F.Publie[i];
  doc._grist_Attachments = { id: [7], fileName: ['ancienne.jpg'], fileSize: [1000], imageHeight: [10], fileIdent: ['c'.repeat(40) + '.jpg'] };
  return doc;
}
(async () => {
  let doc = docPj(false);
  const browser = await chromium.launch({ executablePath: __C.chromium });
  // 1. administration : type de question proposé, aperçu ; colonne simple rendue utilisable par les liens d'établissement
  const pa = await browser.newPage({ viewport: { width: 1300, height: 1300 } });
  pa.on('pageerror', e => console.log('PAGEERROR', e.message));
  await pa.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await pa.goto('file://' + __C.racine + '/v2/admin/index.html'); await pa.waitForTimeout(1200);
  await pa.click('nav button[data-onglet=formulaires]'); await pa.waitForTimeout(1800);
  console.log('ADMIN, APERÇU :', await pa.$eval('[data-bloc="b2"]', e => e.innerText.replace(/\s+/g, ' ').trim().slice(0, 120)));
  console.log('ADMIN, TYPE DE QUESTION :', await pa.$eval('[data-bloc="b2"]', e => (e.querySelector('.type, .bloc-type, [class*=type]') || {}).textContent || '').catch(() => '?'));
  pa.on('dialog', d => d.accept());
  await pa.click('[data-bloc="b2"]'); await pa.waitForTimeout(500);
  console.log('ADMIN, PANNEAU (colonne simple) :', await pa.$eval('#panneau', p => (p.innerText.match(/Les liens d'établissement ne peuvent pas[^\n]*/) || ['?'])[0]));
  await pa.click('#pa-pj-adapter'); await pa.waitForTimeout(1200);
  console.log('ADMIN, ADAPTÉE :', await pa.textContent('#msg-global'), '|', await pa.evaluate(() => { const D = window.__DOC__, C = D._grist_Tables_column, k = C.colId.indexOf('Photos'), R = D.__data.Reponses;
    return `Photos formule ? ${C.isFormula[k]} | envoi : ${JSON.stringify(R.Photos_et_documents_envoi)}`; }));
  console.log('ADMIN, FORMULE ÉCRITE = FORMULE ESSAYÉE DANS LE MOTEUR DE GRIST :', await pa.evaluate(() => { const C = window.__DOC__._grist_Tables_column; return C.formula[C.colId.indexOf('Photos')]; }) === FORMULE.split('Photos_envoi').join('Photos_et_documents_envoi'));
  console.log('ADMIN, PANNEAU (adaptée) :', await pa.$eval('#panneau', p => (p.innerText.match(/Utilisable par tous[^\n]*/) || ['?'])[0].slice(0, 110)));
  await pa.close();
  doc = docPj(true);
  // 2. formulaire sur téléphone
  const ctx = await browser.newContext({ ...devices['iPhone 13'], defaultBrowserType: undefined });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => d.accept());
  const envois = []; let prochain = 41;
  const route = async () => {
    // fetch vers les pièces jointes : vrai réseau (intercepté ci-dessous), pas l'API simulée
    await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__vraiFetch=window.fetch.bind(window);window.__DOC__=${JSON.stringify(doc)};window.__OPTS__=${JSON.stringify({ formulaire: 'Signalements' })};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + fs.readFileSync('mock-saisie.js') + `;{const f=window.fetch;window.fetch=(u,...a)=>String(u).includes('/attachments')?window.__vraiFetch(u,...a):f(u,...a);}` }));
    await page.route(/http:\/\/localhost\/x\/attachments/, async r => {
      const q = r.request();
      if (q.method() === 'POST') { const corps = q.postDataBuffer() || Buffer.alloc(0), nom = (/filename="([^"]+)"/.exec(corps.toString('latin1')) || [])[1];
        const id = prochain++; envois.push(`${id}:${nom} (${Math.round(corps.length / 1024)} Ko)`);
        await page.evaluate(([id, nom, n]) => { const A = window.__DOC__._grist_Attachments; A.id.push(id); A.fileName.push(nom); A.fileSize.push(n); A.imageHeight.push(/\.jpe?g$/.test(nom) ? 100 : 0); }, [id, nom, corps.length]).catch(() => {});
        return r.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([id]) }); }
      return r.fulfill({ contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6XqXcEAAAAASUVORK5CYII=', 'base64') });
    });
  };
  await route();
  await page.goto('file://' + __C.racine + '/v2/saisie/index.html'); await page.waitForTimeout(1500);
  await page.click('#porte-nouveau'); await page.waitForTimeout(300);
  await page.fill('#nom', 'Jean Moulin'); await page.waitForTimeout(700); await page.click('#liste [role=option] >> nth=0'); await page.waitForTimeout(700);
  const champ = '[data-champ="q-Photos"]';
  console.log('CHAMP :', await page.$eval(champ, e => e.innerText.replace(/\s+/g, ' ').trim()), '| accepte :', await page.$eval('#q-Photos-fichiers', e => e.accept.split(',').slice(0, 3).join(',') + '…'), '| multiple :', await page.$eval('#q-Photos-fichiers', e => e.multiple));
  // photo de 3 000 × 2 000 px (lourde) et un PDF, choisis ensemble comme depuis la galerie
  await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 3000; c.height = 2000; const g = c.getContext('2d'), im = g.createImageData(3000, 2000);
    for (let i = 0; i < im.data.length; i++) im.data[i] = (Math.random() * 255) | 0; g.putImageData(im, 0, 0);
    const photo = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.95));
    const dt = new DataTransfer(); dt.items.add(new File([photo], 'IMG_0042.JPG', { type: 'image/jpeg' })); dt.items.add(new File(['%PDF-1.4\n%%EOF\n'], 'compte rendu.pdf', { type: 'application/pdf' }));
    window.__tailleOrigine = photo.size;
    const inp = document.getElementById('q-Photos-fichiers'); inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(2500);
  console.log('ENVOIS :', envois.join(' | '), '| photo d\'origine :', Math.round(await page.evaluate(() => window.__tailleOrigine) / 1024), 'Ko');
  const vignettes = () => page.$$eval(`${champ} .pj-liste li`, l => l.map(li => `${li.querySelector('.pj-nom').textContent}${li.querySelector('img') ? ' [vignette]' : ''}`).join(' | '));
  console.log('VIGNETTES :', await vignettes(), '| état :', await page.textContent(`${champ} .pj-etat`));
  await page.$eval(champ, e => e.scrollIntoView({ block: 'start' })); await page.waitForTimeout(300);
  await page.screenshot({ path: __C.sorties + '/pj-105.png' }).catch(e => console.log('CAPTURE ?', e.message));
  // une seconde photo, puis retrait du PDF
  await page.setInputFiles('#q-Photos-fichiers', { name: 'IMG_0043.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) }); await page.waitForTimeout(800);
  await page.click(`${champ} [aria-label="Retirer compte rendu.pdf"]`); await page.waitForTimeout(300);
  console.log('APRÈS RETRAIT :', await vignettes(), '|', await page.textContent(`${champ} .pj-etat`));
  for (const b of await page.$$('[data-action=confirmer-site]')) await b.click().catch(() => {});
  await page.fill('#description', 'Rassemblement, photos jointes'); await page.click('#btn-signalement'); await page.waitForTimeout(1500);
  const R = await page.evaluate(() => { const R = window.__DOC__.__data.Reponses, k = R.id.length - 1; return { id: R.id[k], photos: JSON.stringify(R.Photos[k]), envoi: R.Photos_envoi[k], desc: R.Description[k] }; });
  console.log('ENREGISTRÉ :', R.id, '| colonne Photos (formule, non écrite) :', R.photos, '| colonne d\'envoi :', R.envoi.split(' ').map(x => x.replace(/:([0-9a-f]{40})$/, ':<sha1 ok>')).join(' '));
  // 3. mise à jour du dossier : pièces gardées, nouvelle pièce ajoutée
  doc = await page.evaluate(() => window.__DOC__);
  await page.unrouteAll({ behavior: 'ignoreErrors' }); await route();
  await page.goto('file://' + __C.racine + '/v2/saisie/index.html'); await page.waitForTimeout(1500);
  await page.evaluate(id => ouvrirDepuisListe(id), R.id); await page.waitForTimeout(1200);
  console.log('MISE À JOUR, PIÈCES :', await vignettes());
  await browser.close();
})();
