// Tableau de bord : abscisse et séries inversables (« abscisse : colonnes du tableau, séries : lignes ») — une courbe par
// ligne du tableau ; comptes sans ligne à 0 (la courbe ne s'interrompt plus) ; clic sur un point : détail de la bonne case
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docSites } = require('./run78');
(async () => {
  const doc = docSites(), C = doc.__data.Config;
  const bloc = (id, swap) => ({ id, type: 'cross', title: id, measure: { agg: 'distinct', col: 'Etablissement' }, rows: { col: 'Nature' }, cols: { col: 'Qualification' }, conds: [], view: 'chart', chart: 'line', stack: 'group', top: 0, ...(swap ? { swap: '1' } : {}) });
  const blocs = { name: 'Tableau de bord', filters: [], blocks: [bloc('normal', false), bloc('inverse', true)] };
  const i = C.Cle.indexOf('tableau_de_bord');
  if (i >= 0) C.Valeur[i] = JSON.stringify({ publie: blocs, brouillon: blocs });
  else { C.id.push(Math.max(...C.id) + 1); C.Cle.push('tableau_de_bord'); C.Valeur.push(JSON.stringify({ publie: blocs, brouillon: blocs })); if (C.Modifie_le) C.Modifie_le.push(null); }
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const page = await browser.newPage({ viewport: { width: 1300, height: 1100 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};window.__OPTS__={};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + fs.readFileSync('mock-saisie.js') }));
  await page.goto('file://' + __C.racine + '/v2/tableau-de-bord/index.html'); await page.waitForTimeout(1800);
  for (const k of [0, 1]) {
    const r = await page.$eval(`[data-card="${k}"]`, card => {
      const svg = card.querySelector('svg'); if (!svg) return null;
      const courbes = [...svg.querySelectorAll('path[fill="none"]')].map(p => (p.getAttribute('d').match(/[ML]/g) || []).join(''));
      const abscisse = [...svg.querySelectorAll('text')].filter(t => !t.classList.contains('val') && !/^\d/.test(t.textContent.trim())).map(t => t.textContent.trim()).filter(Boolean);
      const legende = [...card.querySelectorAll('.legend span, .leg span, .legende span, [class*=leg] span')].map(x => x.textContent.trim()).filter(Boolean);
      return { courbes, abscisse: [...new Set(abscisse)], legende: [...new Set(legende)] };
    });
    console.log(k ? 'INVERSÉ' : 'NORMAL', '| abscisse :', r.abscisse.join(', '), '| séries :', r.legende.join(', '), '| tracés :', r.courbes.join(' / '));
  }
  // clic sur le premier point de la première courbe du graphique inversé : détail de la case (ligne, colonne)
  await page.click('[data-card="1"] svg circle[r="4"]'); await page.waitForTimeout(800);
  console.log('DÉTAIL :', (await page.$eval('#drill', e => e.innerText.replace(/\s+/g, ' ').slice(0, 160))));
  await browser.close();
})();
