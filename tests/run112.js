// Règles d'accès : le référentiel des sites (visé par la sous-table des sites du formulaire ESR) et les correspondances
// des sites sont modifiables par les agents mobilisés au planning — compte Grist ou lien d'invité —, comme le référentiel
// des établissements (avant : règle « équipe : lecture seule », ajout de site refusé dans le widget de géolocalisation)
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docSites } = require('./run78');
// document des sites (formulaire ESR à tableau des sites) + équipe et planning (Agents, Creneaux, Affectations)
function docComplet() {
  const doc = docSites(), P = JSON.parse(fs.readFileSync(__C.donnees + '/doc_planning.json'));
  const T = doc._grist_Tables, C = doc._grist_Tables_column, TP = P._grist_Tables, CP = P._grist_Tables_column;
  for (const t of ['Agents', 'Creneaux', 'Affectations']) {
    const ancien = TP.id[TP.tableId.indexOf(t)], nouveau = Math.max(...T.id) + 1; T.id.push(nouveau); T.tableId.push(t);
    CP.id.forEach((_, i) => { if (CP.parentId[i] !== ancien) return; const n = Math.max(...C.id) + 1; Object.keys(C).forEach(k => C[k].push(k === 'id' ? n : k === 'parentId' ? nouveau : CP[k] ? CP[k][i] : (typeof C[k][0] === 'number' ? 0 : typeof C[k][0] === 'boolean' ? false : ''))); });
    doc.__data[t] = P.__data[t];
  }
  return doc;
}
(async () => {
  const doc = docComplet();
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const page = await browser.newPage({ viewport: { width: 1300, height: 1300 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => d.accept());
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(1200);
  await page.click('nav button[data-onglet=acces]'); await page.waitForTimeout(2000);
  const t = await page.$eval('#acces', e => e.innerText);
  console.log('TABLES DES RÈGLES :', (t.match(/[^\n]*— (référentiel|signalements|lignes)[^\n]*/g) || []).map(x => x.trim()).join(' || ') || t.slice(0, 800));
  const sites = await page.evaluate(() => [...document.querySelectorAll('#acces *')].filter(e => /Referentiel_sites — référentiel/.test(e.textContent) && e.children.length < 3).map(e => e.closest('section, details, li, div').innerText.replace(/\s+/g, ' ').slice(0, 400))[0] || '');
  console.log('RÉFÉRENTIEL DES SITES :', sites || '(absent)');
  await browser.close();
})();
