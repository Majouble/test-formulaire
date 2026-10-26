// Mode secours : kit hors ligne (v2/secours/kit-secours.html) sur deux postes reliés par un dossier partagé
// (simulé sur disque), saisie et mise à jour croisées, rechargement, exports ; puis réintégration dans Grist
// (v2/reintegration/) : numéros et références remappés, heure de saisie gardée, second passage sans doublon.
// Copies en couches : complément (réponses de Grist et Config « secours ») déposé dans le dossier, saisies déjà
// réintégrées écartées ; nouveau poste qui prend d'office la base et le complément du dossier.
// Prérequis : node ../outils/construire-secours.js
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const { docSites } = require('./run78');
const KIT = 'file://' + __C.racine + '/v2/secours/kit-secours.html';
const PARTAGE = path.join(__C.sorties, 'secours-partage'); fs.rmSync(PARTAGE, { recursive: true, force: true }); fs.mkdirSync(PARTAGE, { recursive: true });

async function poste(browser, nom, pageIdx, source = 'demo') {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 1300 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log(`[${nom}] PAGEERROR`, e.message)); page.on('dialog', d => d.accept());
  // dossier partagé simulé : mêmes méthodes que le dossier choisi dans Edge (showDirectoryPicker), fichiers sur disque
  await page.exposeFunction('nodeListe', () => fs.readdirSync(PARTAGE));
  await page.exposeFunction('nodeLire', n => { const p = path.join(PARTAGE, n); return fs.existsSync(p) ? { b64: fs.readFileSync(p).toString('base64'), mod: Math.floor(fs.statSync(p).mtimeMs) } : null; });
  await page.exposeFunction('nodeEcrire', (n, s) => { fs.writeFileSync(path.join(PARTAGE, n), s); return true; });
  await page.addInitScript(() => {
    const fichier = n => ({ kind: 'file', name: n,
      async getFile() { const r = await window.nodeLire(n); if (!r) throw new DOMException('absent', 'NotFoundError'); return new File([Uint8Array.from(atob(r.b64), c => c.charCodeAt(0))], n, { lastModified: r.mod }); },
      async createWritable() { let buf = ''; return { async write(s) { buf += s; }, async close() { await window.nodeEcrire(n, buf); } }; } });
    window.__dossierSimule = nom => ({ kind: 'directory', name: nom, async queryPermission() { return 'granted'; }, async requestPermission() { return 'granted'; },
      async *entries() { for (const f of await window.nodeListe()) yield [f, fichier(f)]; },
      async getFileHandle(n, o) { if (!(o && o.create) && !(await window.nodeLire(n))) throw new DOMException('absent', 'NotFoundError'); return fichier(n); } });
  });
  await page.goto(KIT); await page.waitForTimeout(700);
  console.log(`[${nom}] fenêtre :`, await page.textContent('#kit-secours h2'));
  await page.fill('#kit-secours #agent', nom); await page.locator('#kit-secours #agent').dispatchEvent('change');
  if (source === 'demo') { await page.click('#kit-secours [data-a=demo]'); await page.waitForTimeout(300); }
  else { await page.evaluate(() => window.__KIT__.connecter(window.__dossierSimule('partage'))); await page.waitForTimeout(800);
    console.log(`[${nom}] copies prises d'office :`, (await page.innerText('#kit-secours section:nth-of-type(3)')).replace(/\s+/g, ' ').slice(0, 260)); }
  console.log(`[${nom}] pages :`, (await page.$$eval('#kit-secours #page option', l => l.map(o => o.textContent))).join(' | '));
  await page.selectOption('#kit-secours #page', { index: pageIdx });
  await Promise.all([page.waitForNavigation(), page.click('#kit-secours [data-a=commencer]')]); await page.waitForTimeout(1300);
  await page.evaluate(() => window.__KIT__.connecter(window.__dossierSimule('partage'))); await page.waitForTimeout(400);
  console.log(`[${nom}] bandeau :`, (await page.textContent('#kit-secours .barre')).replace(/\s+/g, ' ').trim());
  return page;
}
const cartes = page => page.$$eval('#cartes-signalements li', l => l.map(x => x.innerText.replace(/\s+/g, ' ').trim().slice(0, 90)));

(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });
  // poste A : nouveau signalement (sites repris du dernier état connu)
  const A = await poste(browser, 'Alice Martin', 0);
  await A.click('#porte-nouveau'); await A.waitForTimeout(300);
  await A.fill('#nom', 'Jean Moulin'); await A.waitForTimeout(700); await A.click('#liste [role=option] >> nth=0'); await A.waitForTimeout(700);
  await A.fill('#description', 'Saisie en mode secours par Alice'); await A.click('#btn-signalement'); await A.waitForTimeout(1200);
  console.log('[A] confirmation :', (await A.textContent('#confirmation')).replace(/\s+/g, ' ').trim().slice(0, 90));
  const fA = fs.readdirSync(PARTAGE); console.log('[A] dossier partagé :', fA.join(', '));
  const jA = JSON.parse(fs.readFileSync(path.join(PARTAGE, fA[0])));
  console.log('[A] journal :', jA.entrees.map(e => e.actions.map(a => `${a[0]} ${a[1]}`).join('+')).join(' ; '), '| Cree_le écrit :', 'Cree_le' in jA.entrees[0].actions[0][3]);
  // poste B (formulaire sans périmètre) : voit la saisie de A et la met à jour
  const B = await poste(browser, 'Bob Durand', 2);
  console.log('[B] signalements :', (await cartes(B)).length, '|', (await cartes(B))[0]);
  await B.click('#cartes-signalements li:has-text("Jean Moulin") >> nth=0'); await B.waitForTimeout(1000);
  await B.fill('#description', 'Mise à jour par Bob'); await B.click('#btn-signalement'); await B.waitForTimeout(1200);
  console.log('[B] statut :', (await B.textContent('#statut-signalement')).trim());
  await A.evaluate(() => window.__KIT__.lireDossier()); await A.waitForTimeout(600);
  const idA = jA.entrees[0].actions[0][2];
  console.log('[A] versions du dossier :', JSON.stringify(await A.evaluate(id => { const t = window.__KIT__.K.doc.Reponses; return t.id.map((x, i) => [t.Nature[i], t.Description[i]]).filter((_, i) => t.Dossier[i] === id); }, idA)));
  // rechargement : journaux rejoués
  await A.reload(); await A.waitForTimeout(1500);
  console.log('[A] après rechargement, lignes du mode secours :', await A.evaluate(() => window.__KIT__.K.doc.Reponses.id.filter(i => i >= 1e12).length));
  // exports
  await A.evaluate(() => window.__KIT__.connecter(window.__dossierSimule('partage'))); await A.waitForTimeout(400);
  await A.click('#kit-secours [data-a=exports]'); await A.waitForTimeout(200);
  const [dl] = await Promise.all([A.waitForEvent('download'), A.click('#kit-secours [data-a=exp-consolide]')]);
  const consolide = path.join(__C.sorties, 'secours-consolide.json'); await dl.saveAs(consolide);
  const [dc] = await Promise.all([A.waitForEvent('download'), A.click('#kit-secours [data-a=exp-csv]')]);
  console.log('[A] CSV :', dc.suggestedFilename(), '|', fs.readFileSync(await dc.path(), 'utf8').split('\r\n')[1].slice(0, 120));
  // réintégration dans le document Grist (faux Grist)
  const doc = docSites();
  const R = await browser.newPage({ viewport: { width: 1100, height: 1300 } });
  R.on('pageerror', e => console.log('[Grist] PAGEERROR', e.message)); R.on('dialog', d => d.accept());
  await R.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js') }));
  await R.goto('file://' + __C.racine + '/v2/reintegration/index.html'); await R.waitForTimeout(700);
  await R.setInputFiles('#fichiers', consolide); await R.waitForTimeout(400);
  console.log('[Grist] aperçu :', (await R.innerText('#resume')).replace(/\s+/g, ' ').slice(0, 220));
  await R.check('#sauvegarde'); await R.click('#btn-appliquer'); await R.waitForTimeout(1500);
  console.log('[Grist] bilan :', (await R.innerText('#bilan')).replace(/\s+/g, ' '));
  console.log('[Grist] réponses :', JSON.stringify(await R.evaluate(() => { const t = window.__DOC__.__data.Reponses; return t.id.map((id, i) => [id, t.Dossier[i], t.Description[i], new Date(t.Cree_le[i] * 1000).toISOString().slice(0, 16)]).slice(-2); })));
  console.log('[Grist] sites (dossier, version) :', JSON.stringify(await R.evaluate(() => { const t = window.__DOC__.__data.Sites_signales; return [...new Set(t.id.map((_, i) => `${t.Dossier[i]}/${t.Version[i]}`))]; })));
  await R.setInputFiles('#fichiers', consolide); await R.waitForTimeout(400);
  console.log('[Grist] second passage :', (await R.innerText('#resume')).replace(/\s+/g, ' '));
  await R.screenshot({ path: path.join(__C.sorties, 'reintegration.png'), fullPage: true });
  // copies en couches : base (document d'avant la panne, ancienne) et complément (Grist après la réintégration)
  fs.writeFileSync(path.join(PARTAGE, 'instantane-base.json'), JSON.stringify({ format: 'kit-secours-instantane', version: 1,
    tables: Object.fromEntries([...Object.entries(doc).filter(([k]) => k.startsWith('_grist_')), ...Object.entries(docSites().__data)]) }));
  const ilYa = (Date.now() - 3600e3) / 1000; fs.utimesSync(path.join(PARTAGE, 'instantane-base.json'), ilYa, ilYa);
  const D = await R.evaluate(() => window.__DOC__.__data);
  fs.writeFileSync(path.join(PARTAGE, 'instantane-dossiers.json'), JSON.stringify({ format: 'kit-secours-instantane', version: 1, complement: true, genere_le: new Date().toISOString(),
    tables: { Reponses: D.Reponses, Sites_signales: { records: D.Sites_signales.id.map((id, i) => ({ id, fields: Object.fromEntries(Object.keys(D.Sites_signales).filter(c => c !== 'id').map(c => [c, D.Sites_signales[c][i]])) })) }, Config: D.Config } }));
  await A.evaluate(() => window.__KIT__.tic()); await A.waitForTimeout(800);
  const etat = p => p.evaluate(() => { const K = window.__KIT__.K, t = K.doc.Reponses; return JSON.stringify({ lignesSecours: t.id.filter(i => i >= 1e12).length, reintegrees: K.reintegrees.size, saisieAlice: t.Description.filter(d => d === 'Saisie en mode secours par Alice').length, sitesDossier8: K.doc.Sites_signales.Dossier.filter(d => d === 8).length }); });
  console.log('[A] après le complément :', await etat(A));
  console.log('[A] bandeau :', (await A.textContent('#kit-secours .barre')).replace(/\s+/g, ' ').trim());
  // poste C : rien de chargé à la main, base et complément pris dans le dossier
  const Cl = await poste(browser, 'Claire Petit', 2, 'dossier');
  console.log('[C] état :', await etat(Cl), '| signalements :', (await cartes(Cl)).length);
  await browser.close();
})();
