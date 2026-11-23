// 2.62.0-alpha.53 à .56 : cartes animées du tableau de bord (histogramme des dates : .56) — une image par date des colonnes (lecture, curseur, vitesse),
// jours sans signalement sautés, dernier état connu ou carte vide, samedis et dimanches écartés, cumul (valeurs distinctes
// comptées une fois), classes calculées sur toute la période, forte hausse ; carte des établissements (points) animée ;
// exports « Vidéo MP4 » (H.264, fichier MP4 non fragmenté) et « GIF animé » vérifiés par ffprobe ; réglages dans l'atelier.
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const { execSync } = require('child_process');
const { docDurees, publier } = require('./run148');

// 48 établissements fictifs dans 8 académies, signalés du lundi 2 au vendredi 20 novembre 2026 (vague qui se déplace
// du nord vers le sud), un seul signalement le samedi 7, rien le dimanche 8 ni le week-end des 14 et 15
const ACADEMIES = [['Lille', 50.6, 3.1], ['Amiens', 49.9, 2.3], ['Reims', 49.3, 4.0], ['Versailles', 48.8, 2.1], ['Orléans-Tours', 47.4, 1.7], ['Lyon', 45.8, 4.8], ['Montpellier', 43.6, 3.9], ['Aix-Marseille', 43.3, 5.4]];
function docAnim() {
  const doc = docDurees(), D = doc.__data, Et = D.Etablissements;
  const etabs = [];
  ACADEMIES.forEach(([aca, lat, lon], a) => { for (let n = 0; n < 6; n++) {
    const id = 101 + a * 6 + n; etabs.push({ id, aca, rang: a, n });
    for (const k of Object.keys(Et)) Et[k].push(({ id, UAI: `0${a}${n}0000${String.fromCharCode(65 + n)}`, Nom: `Collège ${aca} ${n + 1}`, Type: 'Collège', Commune: aca, Academie: aca,
      Departement: '', Latitude: lat + n * 0.12, Longitude: lon + n * 0.15 })[k] ?? '');
  } });
  const R = { id: [], Date_faits: [], Cree_le: [], Nature: [], Qualification: [], Description: [], Etablissement: [], Dossier: [], Derniere_version: [], Nom_etablissement: [], Commune: [], Academie: [], Type_etablissement: [] };
  const aj = (e, jour, q) => { const id = R.id.length + 1, t = Date.UTC(2026, 10, jour) / 1000;
    R.id.push(id); R.Date_faits.push(t); R.Cree_le.push(t + 9 * 3600); R.Nature.push('Nouveau signalement'); R.Qualification.push(q); R.Description.push('…');
    R.Etablissement.push(e.id); R.Dossier.push(id); R.Derniere_version.push(true); R.Nom_etablissement.push(`Collège ${e.aca}`); R.Commune.push(e.aca); R.Academie.push(e.aca); R.Type_etablissement.push('Collège'); };
  const jours = [2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 16, 17, 18, 19, 20];
  jours.forEach((j, r) => etabs.forEach(e => {
    const ecart = r - e.rang * 1.6;                                  // la vague atteint l'académie de rang a vers le jour 1,6 × a
    if (ecart >= 0 && ecart < 4 && e.n < 6 - Math.abs(Math.round(ecart * 2 - 3))) aj(e, j, ecart < 1 ? 'Fermeture' : 'Perturbation');   // montée puis descente
  }));
  aj(etabs[0], 7, 'Perturbation');                                   // samedi 7 : un seul signalement
  aj(etabs[0], 2, 'Perturbation');                                   // deux signalements le même jour pour un établissement : compté une fois
  D.Reponses = R;
  return doc;
}
const carte = (id, titre, anim, en) => ({ id, type: 'cross', title: titre, measure: { agg: 'distinct', col: 'Etablissement' }, rows: en === 'points' ? { col: 'Etablissement' } : { col: 'Academie', grain: 'aca_norm' },
  cols: { col: 'Date_faits', grain: 'jour' }, conds: [], view: 'chart', chart: en || 'map', top: 0, anim });
const BLOCS = [
  carte('jour', 'Établissements touchés par académie', { actif: true, vitesse: '125' }),
  carte('dernier', 'Dernier état connu, cumul', { actif: true, jours: 'dernier', cumul: 'cumul' }),
  carte('ouvres', 'Jours ouvrés, carte vide', { actif: true, jours: 'vides', weekend: true }),
  carte('points', 'Établissements (points)', { actif: true, vitesse: '125' }, 'points'),
  carte('fixe', 'Carte fixe (sans animation)', null),
];
const API = doc => `window.__DOC__=${JSON.stringify(doc)};window.__OPTS__={};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + fs.readFileSync('mock-saisie.js');

(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const page = await browser.newPage({ viewport: { width: 1300, height: 1400 }, acceptDownloads: true });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => d.accept());
  const doc = docAnim(); publier(doc, { name: 'Tableau de bord', filters: [], blocks: BLOCS });
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: API(doc) }));
  await page.goto('file://' + __C.racine + '/v2/tableau-de-bord/index.html'); await page.waitForTimeout(2200);

  const lecteur = k => page.evaluate(k => {
    const c = document.querySelector(`[data-card="${k}"]`), z = c && c.querySelector('[data-anim]');
    if (!z) return { present: false, notes: c ? [...c.querySelectorAll('.chart .hint')].map(p => p.textContent).join(' / ') : 'bloc absent' };
    const tips = [...c.querySelectorAll('svg [data-z][data-tip]')].map(e => e.getAttribute('data-tip').split('\u0001')).filter(([, v]) => v !== '0' && v !== '');
    return { present: true, dates: Number(z.querySelector('.anim-curseur').max) + 1, pos: Number(z.querySelector('.anim-curseur').value), date: z.querySelector('.anim-date').textContent,
      jour: (c.querySelector('.anim-jour') || {}).textContent, valeurs: tips.map(([a, v]) => `${a.replace(/^Académie (de |d')/, '')}=${v}`).join(' ; '),
      hausses: [...c.querySelectorAll('[data-zh]')].filter(e => e.getAttribute('opacity') === '1').length,
      cercles: [...c.querySelectorAll('circle[data-z]')].filter(e => Number(e.getAttribute('r')) > 0).length,
      notes: [...c.querySelectorAll('.chart .hint')].map(p => p.textContent).join(' / ') };
  }, k);
  const aller = (k, p) => page.$eval(`[data-card="${k}"] .anim-curseur`, (el, p) => { el.value = p; el.dispatchEvent(new Event('input', { bubbles: true })); }, p);

  // 1. carte du jour : 15 dates (samedi 7 compris, dimanche 8 sauté), date la plus récente affichée d'abord
  let L = await lecteur(0);
  console.log('JOUR, DÉPART :', L.dates, 'dates | position', L.pos, '|', L.date, '|', L.jour, '\n  ', L.valeurs);
  console.log('JOUR, NOTE :', L.notes);
  for (const [p, quoi] of [[0, 'lundi 2'], [5, 'samedi 7'], [9, 'jeudi 12'], [11, 'lundi 16 (Montpellier : de 0 à 4)']]) {
    await aller(0, p); await page.waitForTimeout(100); L = await lecteur(0);
    console.log(`JOUR, ${quoi} :`, L.date, '|', L.valeurs || '(rien)', '| fortes hausses :', L.hausses);
  }
  const legende = await page.$$eval('[data-card="0"] .legend span', l => l.map(s => s.textContent.trim()).join(' | '));
  console.log('JOUR, LÉGENDE (classes sur toute la période) :', legende);
  // lecture : 125 ms par date ; pause
  await aller(0, 0); await page.click('[data-card="0"] [data-act="anim-lecture"]'); await page.waitForTimeout(700);
  const enCours = await lecteur(0); await page.click('[data-card="0"] [data-act="anim-lecture"]');
  console.log('LECTURE 0,7 s :', enCours.pos > 2 ? `avancée à la position ${enCours.pos}` : `PAS D'AVANCÉE (${enCours.pos})`, '| bouton :', await page.$eval('[data-card="0"] .anim-bouton', b => b.textContent));
  await page.waitForTimeout(400); const apres = (await lecteur(0)).pos; await page.waitForTimeout(400);
  console.log('PAUSE :', (await lecteur(0)).pos === apres ? 'arrêtée' : 'CONTINUE');
  // lecture jusqu'au bout, puis la date affichée est gardée au rendu suivant (fenêtre redimensionnée)
  await aller(0, 12); await page.click('[data-card="0"] [data-act="anim-lecture"]'); await page.waitForTimeout(900);
  console.log('FIN DE LECTURE :', (await lecteur(0)).pos, '| bouton :', await page.$eval('[data-card="0"] .anim-bouton', b => b.textContent));
  await aller(0, 3); await page.setViewportSize({ width: 1250, height: 1400 }); await page.waitForTimeout(600);
  console.log('APRÈS UN RENDU :', (await lecteur(0)).date);

  // 1 bis. histogramme des dates (2.62.0-alpha.56) : une barre par date, date affichée foncée avec sa valeur, clic sur une date
  const histo = k => page.evaluate(k => { const c = document.querySelector(`[data-card="${k}"]`), h = c.querySelector('.anim-histo svg'); if (!h) return 'absent';
    const bars = [...h.querySelectorAll('[data-hp]')], cour = bars.findIndex(r => /ink/.test(r.style.fill)), pales = bars.filter(r => r.style.opacity === '0.3').length;
    return `${bars.length} barres | date affichée : barre ${cour} (${h.querySelector('[data-hv]').textContent}) | ${pales} pâles | grises : ${bars.filter(r => /axis/.test(r.style.fill)).length} | hauteurs : ${bars.map(r => Math.round(Number(r.getAttribute('height')))).join(' ')}`; }, k);
  await aller(0, 9); console.log('HISTO, jeudi 12 :', await histo(0));
  await page.click('[data-card="0"] [data-anim-p="3"]'); await page.waitForTimeout(150);
  console.log('HISTO, CLIC SUR LA 4e DATE :', (await lecteur(0)).date, '|', await histo(0));
  await aller(1, 6); console.log('HISTO, DERNIER ÉTAT + CUMUL, dimanche 8 :', await histo(1));
  await aller(0, 15);
  // 2. dernier état connu et cumul : 19 jours (dimanches compris), le dimanche 8 garde l'état du samedi 7
  L = await lecteur(1); console.log('DERNIER + CUMUL :', L.dates, 'dates |', L.date, '|', L.valeurs);
  await aller(1, 6); L = await lecteur(1); console.log('DERNIER, dimanche 8 :', L.date, '|', L.jour);
  await aller(1, 0); L = await lecteur(1); console.log('CUMUL, lundi 2 :', L.valeurs);
  // 3. jours ouvrés, carte vide : 15 jours du lundi au vendredi, samedi 7 écarté
  L = await lecteur(2); console.log('OUVRÉS :', L.dates, 'dates |', L.date);
  await aller(2, 5); L = await lecteur(2); console.log('OUVRÉS, position 5 :', L.date);
  // 4. points
  L = await lecteur(3); console.log('POINTS :', L.dates, 'dates |', L.date, '|', L.cercles, 'points visibles |', L.notes);
  await aller(3, 0); L = await lecteur(3); console.log('POINTS, lundi 2 :', L.cercles, 'points visibles');
  // 5. carte fixe : pas de lecteur
  L = await lecteur(4); console.log('FIXE :', L.present ? 'LECTEUR PRÉSENT' : 'pas de lecteur', '|', L.notes);
  await page.screenshot({ path: path.join(__C.sorties, 'run152-lecture.png'), fullPage: true });

  // 6. exports : GIF et MP4 de la carte du jour
  await aller(0, 11); await page.waitForTimeout(500);
  console.log('HISTO, lundi 16 :', await histo(0));
  await page.locator('[data-card="0"] .chart').screenshot({ path: path.join(__C.sorties, 'run152-hausse.png') });
  for (const [act, ext] of [['anim-gif', 'gif'], ['anim-mp4', 'mp4']]) {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.click(`[data-card="0"] [data-act="${act}"]`)]);
    const f = path.join(__C.sorties, `run152.${ext}`); await dl.saveAs(f);
    const msg = await page.$eval('#messages', m => m.textContent.trim());
    const pr = execSync(`ffprobe -v error -count_frames -show_entries format=duration,format_name:stream=codec_name,profile,width,height,nb_read_frames -of compact=p=0 "${f}"`).toString().trim().replace(/\n/g, ' ; ');
    console.log(`${ext.toUpperCase()} :`, dl.suggestedFilename(), '|', Math.round(fs.statSync(f).size / 1024), 'ko |', pr, '\n  ', msg);
    execSync(`ffmpeg -v error -y -i "${f}" -vf "select=eq(n\\,11)" -vframes 1 "${path.join(__C.sorties, `run152-${ext}-image12.png`)}"`);
  }
  if (fs.existsSync(path.join(__C.sorties, 'run152.mp4'))) {
    const atomes = execSync(`ffprobe -v trace "${path.join(__C.sorties, 'run152.mp4')}" 2>&1 | grep -o "type:'[a-z ]*'" | head -8`).toString().replace(/\n/g, ' ');
    console.log('MP4, BOÎTES :', atomes.trim(), '(moov avant mdat, pas de moof : fichier non fragmenté)');
  }
  console.log('APRÈS EXPORT :', (await lecteur(0)).date);

  // 7. Word : image de la date affichée (ligne « Jour : … » sous la carte)
  const [dw] = await Promise.all([page.waitForEvent('download'), page.click('[data-card="0"] [data-act="docx"]')]);
  const fw = path.join(__C.sorties, 'run152.docx'); await dw.saveAs(fw);
  console.log('WORD :', execSync(`unzip -l "${fw}" | grep -c "word/media/"`).toString().trim(), 'image(s)');

  // 8. atelier : réglages de l'animation (case, jours, samedis et dimanches, cumul, vitesse) ; activée : graphique seul
  const doc2 = docAnim(); publier(doc2, { name: 'Tableau de bord', filters: [], blocks: [{ ...BLOCS[4], view: 'both' }] });
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc2)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + fs.readFileSync('mock-saisie.js') + `;grist.getOption=async()=>null;` }));
  await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(1200);
  await page.click('nav button[data-onglet=onglet-tdb]'); await page.waitForTimeout(2500);
  await page.click('[data-card="0"] h2'); await page.waitForTimeout(400);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /^Présentation$/.test(x.textContent.trim())); if (b) b.click(); }); await page.waitForTimeout(400);
  const reglages = () => page.$$eval('.studio [data-k^="anim."]', l => l.map(x => x.dataset.k + '=' + (x.type === 'checkbox' ? x.checked : x.value)).join(' ; '));
  console.log('ATELIER, AVANT :', await reglages());
  await page.check('.studio [data-k="anim.actif"]'); await page.waitForTimeout(600);
  console.log('ATELIER, ACTIVÉE :', await reglages(), '| lecteur :', !!(await page.$('[data-card="0"] [data-anim]')));
  await page.selectOption('.studio [data-k="anim.jours"]', 'dernier'); await page.waitForTimeout(400);
  console.log('ATELIER, DERNIER ÉTAT :', (await lecteur(0)).dates, 'dates');
  await page.waitForTimeout(2500);
  const cfg = await page.evaluate(() => { const C = window.__DOC__.__data.Config, v = JSON.parse(C.Valeur[C.Cle.indexOf('tableau_de_bord')]); const t = (v.tableaux && v.tableaux[0]) || v; const b = (t.brouillon || t.publie).blocks[0]; return JSON.stringify({ anim: b.anim, view: b.view }); });
  console.log('BROUILLON ENREGISTRÉ :', cfg);
  await page.screenshot({ path: path.join(__C.sorties, 'run152-atelier.png'), fullPage: true });
  await browser.close();
})();
