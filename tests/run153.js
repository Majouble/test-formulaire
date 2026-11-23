// 2.62.0-alpha.57 et .58 (comptage en établissements) : graphique « Élèves concernés » du tableau de bord — carte à cercles proportionnels (parts par
// qualification), compteur, carrés et histogramme animés par date ; un établissement compte une fois par date avec sa
// qualification la plus grave ; qualifications comptées réglables ; clic sur une académie ; exports MP4 (images
// intermédiaires) et GIF ; image dans Word ; réglages et modèle de bloc dans l'atelier.
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const { execSync } = require('child_process');
const { publier } = require('./run148');
const { docAnim } = require('./run152');

// effectif fictif de chaque établissement (colonne Effectif des réponses, comme la formule recopiée du référentiel)
function docEleves() {
  const doc = docAnim(), T = doc._grist_Tables, C = doc._grist_Tables_column, R = doc.__data.Reponses;
  const tr = T.id[T.tableId.indexOf('Reponses')], n = Math.max(...C.id) + 1;
  for (const k of Object.keys(C)) C[k].push(k === 'id' ? n : k === 'parentId' ? tr : k === 'colId' || k === 'label' ? 'Effectif' : k === 'type' ? 'Numeric' : k === 'isFormula' ? true : (typeof C[k][0] === 'number' ? 0 : typeof C[k][0] === 'boolean' ? false : ''));
  R.Effectif = R.Etablissement.map(e => e >= 101 ? 300 + ((e - 101) % 6) * 120 : 500);
  // un établissement signalé deux fois le même jour (perturbation puis fermeture) : compté une fois, en fermeture
  const i = R.id.length + 1, j = R.Date_faits.findIndex((_, k) => R.Qualification[k] === 'Perturbation');
  for (const c of Object.keys(R)) R[c].push(c === 'id' ? i : c === 'Dossier' ? i : c === 'Qualification' ? 'Fermeture' : c === 'Cree_le' ? R.Cree_le[j] + 3600 : R[c][j]);
  return doc;
}
// calcul attendu, à part : élèves par date, qualification la plus grave du jour, qualifications comptées
function attendu(doc, jour, retenues, aca, parEtab) {
  const R = doc.__data.Reponses, rang = ['Fermeture', 'Fonctionnement dégradé', 'Perturbation'], m = new Map();
  R.id.forEach((_, k) => {
    if (new Date(R.Date_faits[k] * 1000).toISOString().slice(0, 10) !== jour || R.Qualification[k] === 'RAS' || (aca && R.Academie[k] !== aca)) return;
    const e = R.Etablissement[k], x = m.get(e); if (!x || rang.indexOf(R.Qualification[k]) < rang.indexOf(x.q)) m.set(e, { q: R.Qualification[k], eff: R.Effectif[k] });
  });
  let s = 0; m.forEach(x => { if (retenues.includes(x.q)) s += parEtab ? 1 : x.eff; }); return s;
}
const BLOC = (id, eleves, anim) => ({ id, type: 'cross', title: 'Élèves concernés', measure: { agg: 'count' }, rows: { col: 'Academie', grain: 'aca_norm' },
  cols: { col: 'Date_faits', grain: 'jour' }, conds: [], view: 'chart', chart: 'eleves', top: 0, eleves, anim });
const API = doc => `window.__DOC__=${JSON.stringify(doc)};window.__OPTS__={};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + fs.readFileSync('mock-saisie.js');

(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const page = await browser.newPage({ viewport: { width: 1300, height: 1500 }, acceptDownloads: true });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => d.accept());
  const doc = docEleves();
  publier(doc, { name: 'Tableau de bord', filters: [], blocks: [BLOC('tous', {}, { vitesse: '500' }), BLOC('fermes', { qualifs: ['Fermeture'] }, {}), BLOC('etabs', { mesure: 'etablissements' }, {})] });
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: API(doc) }));
  await page.goto('file://' + __C.racine + '/v2/tableau-de-bord/index.html'); await page.waitForTimeout(2200);
  const lire = k => page.evaluate(k => { const c = document.querySelector(`[data-card="${k}"]`); if (!c || !c.querySelector('.el-total')) return { absent: c ? c.textContent.slice(0, 300) : 'bloc absent' };
    return { date: c.querySelector('.anim-date').textContent, total: c.querySelector('.el-total').textContent, sous: c.querySelector('.el-sous').textContent,
      parts: [...c.querySelectorAll('.el-parts span')].map(s => s.textContent.trim()).join(' | '), cercles: c.querySelectorAll('.el-cercles > circle[stroke]').length,
      carres: [...c.querySelectorAll('[data-carre]')].filter(r => !/q0/.test(r.style.fill)).length, unite: (c.querySelector('.el-unite') || {}).textContent,
      notes: [...c.querySelectorAll('.chart .hint')].map(p => p.textContent).join(' / ') }; }, k);
  const aller = async (k, p) => { await page.$eval(`[data-card="${k}"] .anim-curseur`, (el, p) => { el.value = p; el.dispatchEvent(new Event('input', { bubbles: true })); }, p); await page.waitForTimeout(700); };
  const num = s => Number(String(s).replace(/\D/g, ''));
  const TOUTES = ['Fermeture', 'Fonctionnement dégradé', 'Perturbation'];

  let L = await lire(0); console.log('DÉPART :', L.date, '|', L.total, L.sous, '\n  ', L.parts, '|', L.cercles, 'cercles |', L.carres, 'carrés |', L.unite, '\n  ', L.notes);
  for (const [p, j] of [[0, '2026-11-02'], [9, '2026-11-12'], [11, '2026-11-16']]) {
    await aller(0, p); L = await lire(0);
    const a = attendu(doc, j, TOUTES);
    console.log(`${j} :`, L.total, '| attendu', a, num(L.total) === a ? 'OK' : 'ÉCART', '|', L.parts, '|', L.cercles, 'cercles,', L.carres, 'carrés');
  }
  await aller(1, 9); L = await lire(1);
  console.log('FERMETURES SEULES, 12/11 :', L.total, '| attendu', attendu(doc, '2026-11-12', ['Fermeture']), num(L.total) === attendu(doc, '2026-11-12', ['Fermeture']) ? 'OK' : 'ÉCART', '|', L.parts);
  // comptage en établissements (2.62.0-alpha.58) : 1 par établissement, 1 carré = 1 établissement
  for (const [p, j] of [[9, '2026-11-12'], [11, '2026-11-16']]) {
    await aller(2, p); L = await lire(2); const a = attendu(doc, j, TOUTES, null, true);
    console.log(`ÉTABLISSEMENTS, ${j} :`, L.total, L.sous, '| attendu', a, num(L.total) === a ? 'OK' : 'ÉCART', '|', L.parts, '|', L.carres, 'carrés |', L.unite);
  }
  console.log('ÉTABLISSEMENTS, HISTOGRAMME ET NOTE :', await page.$eval('[data-card="2"] .anim-histo text:last-of-type', t => t.textContent), '|', (await lire(2)).notes.split(' / ')[0].slice(-120));
  await page.click('[data-card="2"] [data-zsel="Orléans-Tours"]'); await page.waitForTimeout(700); L = await lire(2);
  console.log('ÉTABLISSEMENTS, ORLÉANS-TOURS (16/11) :', L.total, '| attendu', attendu(doc, '2026-11-16', TOUTES, 'Orléans-Tours', true), '| infobulle :', await page.$eval('[data-card="2"] [data-zsel="Orléans-Tours"]', e => e.getAttribute('data-tip').replace('\u0001', ' → ')));
  await page.locator('[data-card="2"] .chart').screenshot({ path: path.join(__C.sorties, 'run153-etablissements.png') });
  // clic sur une académie, puis bouton France
  await page.click('[data-card="0"] [data-zsel="Orléans-Tours"]'); await page.waitForTimeout(700); L = await lire(0);
  console.log('CLIC ORLÉANS-TOURS (16/11) :', L.total, L.sous, '| attendu', attendu(doc, '2026-11-16', TOUTES, 'Orléans-Tours'), '|', L.carres, 'carrés |', L.unite);
  await aller(0, 10); L = await lire(0); console.log('ORLÉANS-TOURS, DATE SUIVANTE :', L.date, L.total, '| attendu', attendu(doc, '2026-11-13', TOUTES, 'Orléans-Tours'));
  await page.click('[data-card="0"] [data-act="el-france"]'); await page.waitForTimeout(700); L = await lire(0); console.log('FRANCE :', L.total, L.sous);
  // lecture : défilement du compteur pendant la transition
  await aller(0, 0); await page.click('[data-card="0"] [data-act="anim-lecture"]'); await page.waitForTimeout(700);
  const pendant = await page.$eval('[data-card="0"] .el-total', e => e.textContent); await page.waitForTimeout(800); await page.click('[data-card="0"] [data-act="anim-lecture"]');
  console.log('LECTURE :', (await lire(0)).date, '| compteur pendant la lecture :', pendant);
  await aller(0, 9); await page.locator('[data-card="0"] .chart').screenshot({ path: path.join(__C.sorties, 'run153-ecran.png') });

  // exports : MP4 (16 dates + 15 × 5 images intermédiaires à 500 ms par date) et GIF (une image par date)
  for (const [act, ext] of [['anim-mp4', 'mp4'], ['anim-gif', 'gif']]) {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 180000 }), page.click(`[data-card="0"] [data-act="${act}"]`)]);
    const f = path.join(__C.sorties, `run153.${ext}`); await dl.saveAs(f);
    console.log(`${ext.toUpperCase()} :`, Math.round(fs.statSync(f).size / 1024), 'ko |', execSync(`ffprobe -v error -count_frames -show_entries format=duration:stream=codec_name,width,height,nb_read_frames -of compact=p=0 "${f}"`).toString().trim().replace(/\n/g, ' ; '));
  }
  execSync(`ffmpeg -v error -y -i "${path.join(__C.sorties, 'run153.mp4')}" -vf "select=eq(n\\,48)" -vframes 1 "${path.join(__C.sorties, 'run153-mp4-image.png')}"`);
  execSync(`ffmpeg -v error -y -i "${path.join(__C.sorties, 'run153.gif')}" -vf "select=eq(n\\,9)" -vframes 1 "${path.join(__C.sorties, 'run153-gif-image.png')}"`);
  const [dw] = await Promise.all([page.waitForEvent('download'), page.click('[data-card="0"] [data-act="docx"]')]);
  const fw = path.join(__C.sorties, 'run153.docx'); await dw.saveAs(fw);
  console.log('WORD :', execSync(`unzip -l "${fw}" | grep -c "word/media/"`).toString().trim(), 'image(s), pas de graphique natif :', execSync(`unzip -l "${fw}" | grep -c "word/charts/" || true`).toString().trim());

  // atelier : modèle « Élèves concernés », réglages, qualifications comptées
  const doc2 = docEleves(); publier(doc2, { name: 'Tableau de bord', filters: [], blocks: [] });
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc2)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + fs.readFileSync('mock-saisie.js') + `;grist.getOption=async()=>null;` }));
  await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(1200);
  await page.click('nav button[data-onglet=onglet-tdb]'); await page.waitForTimeout(2500);
  await page.click('[data-act="st-ajouter"]'); await page.waitForTimeout(300); await page.click('[data-act="st-creer"][data-k="eleves"]'); await page.waitForTimeout(1200);
  L = await lire(0); console.log('MODÈLE CRÉÉ :', L.absent ? 'ÉCHEC ' + L.absent : `${L.date} | ${L.total} ${L.sous}`);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /^Présentation$/.test(x.textContent.trim())); if (b) b.click(); }); await page.waitForTimeout(400);
  console.log('RÉGLAGES :', await page.$$eval('.studio [data-k^="eleves."], .studio [data-elq]', l => l.map(x => (x.dataset.k || 'qualif ' + x.dataset.elq) + '=' + (x.type === 'checkbox' ? x.checked : x.value)).join(' ; ')));
  await page.selectOption('.studio [data-k="eleves.mesure"]', 'etablissements'); await page.waitForTimeout(800);
  L = await lire(0); console.log('MESURE ÉTABLISSEMENTS :', L.total, L.sous, '|', L.unite, '| réglage effectif :', (await page.$('.studio [data-k="eleves.effectif"]')) ? 'visible' : 'masqué');
  await page.selectOption('.studio [data-k="eleves.mesure"]', ''); await page.waitForTimeout(800);
  await page.uncheck('.studio [data-elq="Perturbation"]'); await page.waitForTimeout(800);
  L = await lire(0); console.log('SANS PERTURBATION :', L.date, L.total, '| attendu', attendu(doc2, '2026-11-20', ['Fermeture', 'Fonctionnement dégradé']), '|', L.parts);
  await page.waitForTimeout(2500);
  const cfg = await page.evaluate(() => { const C = window.__DOC__.__data.Config, v = JSON.parse(C.Valeur[C.Cle.indexOf('tableau_de_bord')]); const t = (v.tableaux && v.tableaux[0]) || v; const b = (t.brouillon || t.publie).blocks[0]; return JSON.stringify({ chart: b.chart, rows: b.rows, cols: b.cols, eleves: b.eleves, view: b.view }); });
  console.log('BROUILLON ENREGISTRÉ :', cfg);
  await page.click('[data-act="st-fermer"]'); await page.waitForTimeout(300);
  await page.click('[data-act="st-ajouter"]'); await page.waitForTimeout(300); await page.click('[data-act="st-creer"][data-k="etablissements"]'); await page.waitForTimeout(1200);
  L = await lire(1); console.log('MODÈLE « ÉTABLISSEMENTS CONCERNÉS » :', L.absent ? 'ÉCHEC' : `${L.total} ${L.sous} | ${L.unite}`, '| titre :', await page.$eval('[data-card="1"] h2', h => h.textContent));
  await page.screenshot({ path: path.join(__C.sorties, 'run153-atelier.png'), fullPage: true });
  await browser.close();
})();
