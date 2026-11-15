// 2.61 : File de vérification, acceptation en masse — tous les points applicables du filtre, toutes pages confondues,
// écrits par lots de 150 avec l'avancement
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docFv } = require('./run124');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6XqXcEAAAAASUVORK5CYII=', 'base64');
(async () => {
  const doc = docFv(), V = doc.__data.Verifications;
  // 320 points « Valider un site proposé » (SITE-0005) et 20 « Vérifier l'existence du site » (SITE-0004)
  for (let k = 0; k < 340; k++) {
    const id = Math.max(...V.id) + 1, site = k < 320;
    for (const c of Object.keys(V)) V[c].push(c === 'id' ? id : c === 'Verif_ID' ? `VERIF-M${k}` : c === 'Priorite' ? '4 – Faible impact' : c === 'Famille' ? 'Site'
      : c === 'Type' ? (site ? 'Valider un site proposé' : "Vérifier l'existence du site") : c === 'Objet' ? 'Site' : c === 'Objet_ID' ? (site ? 'SITE-0005' : 'SITE-0004')
      : c === 'Statut' ? 'À traiter' : c === 'Traitement_suggere' ? 'Académie / établissement (campagne)'
      : c === 'Action' ? JSON.stringify(site ? { op: 'maj', objet: 'site', id: 'SITE-0005', champ: 'Statut', valeur: 'Validé' } : { op: 'maj', objet: 'site', id: 'SITE-0004', champ: 'Actif', valeur: false })
      : c === 'Date' || c === 'Sensible' ? null : '');
  }
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const p = await browser.newPage({ viewport: { width: 1300, height: 1100 } });
  p.on('pageerror', e => console.log('PAGEERROR', e.message)); p.on('dialog', d => { console.log('CONFIRMATION :', d.message().replace(/\n+/g, ' | ')); d.accept(); });
  await p.route('**/leaflet.min.js', r => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync('node_modules/leaflet/dist/leaflet.js') }));
  await p.route('**/leaflet.min.css', r => r.fulfill({ contentType: 'text/css', body: fs.readFileSync('node_modules/leaflet/dist/leaflet.css') }));
  await p.route(/data\.geopf\.fr/, r => r.fulfill({ contentType: 'image/png', body: PNG }));
  await p.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};window.__FORMULES_STRICTES__=true;` + fs.readFileSync('mock.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await p.goto('file://' + __C.racine + '/v2/sites/index.html'); await p.waitForTimeout(3000);
  await p.click('[data-vue=fv]'); await p.waitForTimeout(800);
  await p.selectOption('#vue-fv [data-fvf=grouper]', ''); await p.selectOption('#vue-fv [data-fvf=type]', 'Valider un site proposé'); await p.waitForTimeout(300);
  console.log('AFFICHÉS :', await p.$$eval('#vue-fv .fv-item', l => l.length), '| bouton :', await p.textContent('#vue-fv [data-fv-global=filtre]'));
  const messages = []; const suivre = setInterval(async () => { try { const t = await p.textContent('#fv-msg'); if (t && !messages.includes(t)) messages.push(t); } catch (_) { /* page occupée */ } }, 150);
  await p.click('#vue-fv [data-fv-global=filtre]'); await p.waitForTimeout(6000); clearInterval(suivre);
  console.log('AVANCEMENT :', messages.filter(m => /lot/.test(m)).join(' / '));
  console.log('FIN :', await p.textContent('#fv-msg'));
  console.log('ÉTAT :', await p.evaluate(() => { const V = window.__DOC__.__data.Verifications, n = {}; V.id.forEach((_, i) => { if (/^VERIF-M/.test(V.Verif_ID[i])) { const k = `${V.Type[i]}:${V.Decision[i] || '-'}/${V.Statut[i]}`; n[k] = (n[k] || 0) + 1; } }); return JSON.stringify(n); }),
    '| écritures :', await p.evaluate(() => window.__LOG__.length));
  console.log('BOUTON APRÈS :', await p.$('#vue-fv [data-fv-global=filtre]') ? await p.textContent('#vue-fv [data-fv-global=filtre]') : '(aucun)', '| compteur', await p.textContent('#badge-fv'));
  await browser.close();
})();
