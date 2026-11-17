// 2.62 : Fiche établissement — impression « synthèse en page 1, détail ensuite » (comme la maquette) : toutes les
// tuiles en synthèse sur la première page A4, le détail des tuiles qui en ont sur les pages suivantes (diffusion
// restreinte respectée) ; mise en page « tuiles détaillées » ; impression de la sélection, une fiche après l'autre.
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docFiche, CONFIG } = require('./run127');

const pages = f => (fs.readFileSync(f, 'latin1').match(/\/Type\s*\/Page(?!s)/g) || []).length;
(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const p = await browser.newPage({ viewport: { width: 1000, height: 1200 } });
  p.on('pageerror', e => console.log('PAGEERROR', e.message)); p.on('dialog', d => d.accept());
  await p.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(docFiche())};` + fs.readFileSync('mock.js')
    + `;grist.ready=()=>{};grist.onOptions=cb=>setTimeout(()=>cb(${JSON.stringify({ fiche: CONFIG })}),50);grist.setOptions=async()=>{};`
    + `grist.onRecord=cb=>{window.__REC=cb;};grist.setCursorPos=async()=>{};grist.selectedTable={getTableId:async()=>'Etablissements'};` }));
  await p.goto('file://' + __C.racine + '/v2/fiche/index.html'); await p.waitForTimeout(1000);
  await p.evaluate(() => window.__REC({ id: 1 })); await p.waitForTimeout(300);

  console.log('MISE EN PAGE PROPOSÉE :', await p.$eval('#miseEnPage', s => s.value), '| classe :', await p.evaluate(() => document.body.className));
  console.log('ANNEXE À L\'ÉCRAN :', await p.$eval('.annexe', n => getComputedStyle(n).display));
  await p.click('[data-tuile="0"]'); await p.waitForTimeout(150);   // une tuile ouverte à l'écran ne change pas la page de synthèse

  await p.emulateMedia({ media: 'print' });
  console.log('IMPRESSION SYNTHÈSE : détails dans les tuiles', await p.$$eval('.tuile .detail', l => l.filter(d => getComputedStyle(d).display !== 'none').length),
    '| renvois', await p.$$eval('.tuile .renvoi', l => l.filter(d => getComputedStyle(d).display !== 'none').length),
    '| annexe', await p.$eval('.annexe', n => getComputedStyle(n).display + ' / ' + getComputedStyle(n).breakBefore));
  console.log('ANNEXE :', JSON.stringify(await p.$$eval('.annexe-tuile h4', l => l.map(h => h.textContent.replace(/\s+/g, ' ').trim()))));
  console.log('ANNEXE, BÂTI RESTREINT :', await p.$eval('.annexe-tuile.restreint .note-restreint', n => getComputedStyle(n).display), await p.$eval('.annexe-tuile.restreint .contenu-restreint', n => getComputedStyle(n).display));
  console.log('ANNEXE, LIGNE NOUVELLE :', await p.$eval('.annexe tr.nouveau', r => r.textContent.replace(/\s+/g, ' ').trim()));
  await p.pdf({ path: __C.sorties + '/fiche-130-synthese.pdf', format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' } });
  console.log('PDF SYNTHÈSE : pages', pages(__C.sorties + '/fiche-130-synthese.pdf'));

  await p.emulateMedia({ media: 'screen' });
  await p.selectOption('#miseEnPage', 'complet'); await p.emulateMedia({ media: 'print' });
  console.log('IMPRESSION DÉTAILLÉE : détails dans les tuiles', await p.$$eval('.tuile .detail', l => l.filter(d => getComputedStyle(d).display !== 'none').length), '/', await p.$$eval('.tuile', l => l.length),
    '| annexe', await p.$eval('.annexe', n => getComputedStyle(n).display));
  await p.pdf({ path: __C.sorties + '/fiche-130-complet.pdf', format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' } });
  console.log('PDF DÉTAILLÉ : pages', pages(__C.sorties + '/fiche-130-complet.pdf'));
  await p.emulateMedia({ media: 'screen' });

  // sélection : deux fiches, chacune synthèse puis annexe
  await p.selectOption('#miseEnPage', 'synthese');
  await p.evaluate(() => { window.print = () => {}; });
  await p.click('#imprimerSelection'); await p.waitForTimeout(200);
  await p.emulateMedia({ media: 'print' });
  console.log('LOT : fiches', await p.$$eval('#lot .fiche-lot', l => l.length), '| annexes', await p.$$eval('#lot .annexe', l => l.length));
  // synthèse de chaque fiche ajustée à la largeur utile d'une A4 (186 mm ≈ 703 px), pas à celle de la fenêtre
  await p.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  console.log('LOT, LARGEUR DES SYNTHÈSES (px) :', JSON.stringify(await p.$$eval('#lot .page-synthese', l => l.map(e => Math.round(e.getBoundingClientRect().width)))));
  await p.pdf({ path: __C.sorties + '/fiche-130-lot.pdf', format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' } });
  console.log('PDF LOT : pages', pages(__C.sorties + '/fiche-130-lot.pdf'));
  // « synthèse seulement » : une page par établissement, ni annexe ni renvoi
  await p.evaluate(() => { const s = document.getElementById('miseEnPage'); s.value = 'seule'; s.dispatchEvent(new Event('change')); document.getElementById('imprimerSelection').click(); window.dispatchEvent(new Event('beforeprint')); });
  console.log('SYNTHÈSE SEULE : annexes', await p.$$eval('#lot .annexe', l => l.filter(n => getComputedStyle(n).display !== 'none').length), '| renvoi', await p.$eval('#lot .note-detail', n => getComputedStyle(n).display));
  await p.pdf({ path: __C.sorties + '/fiche-130-seule.pdf', format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' } });
  console.log('PDF SYNTHÈSES SEULES : pages', pages(__C.sorties + '/fiche-130-seule.pdf'));
  await browser.close();
})();
