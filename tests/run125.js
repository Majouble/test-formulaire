// 2.60 : version publiée — pages appelant leurs scripts avec ?v=<version>, version.json à jour ; une page plus ancienne
// que la version publiée se recharge une fois avec ?v=<version> (servie en http, comme sur GitHub Pages)
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { docSites } = require('./run78');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6XqXcEAAAAASUVORK5CYII=', 'base64');
(async () => {
  console.log('VÉRIFICATION :', execFileSync('node', [path.join(__C.racine, 'outils/versionner.js'), '--verifier']).toString().trim());
  const VERSION = JSON.parse(fs.readFileSync(path.join(__C.racine, 'v2/version.json'))).version;
  const browser = await chromium.launch({ executablePath: __C.chromium });
  for (const publiee of [VERSION, '9.9.9 (01/01/2030)']) {
    const doc = docSites(), p = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    p.on('pageerror', e => console.log('PAGEERROR', e.message));
    const charges = [], navigations = [];
    p.on('framenavigated', f => { if (f === p.mainFrame()) navigations.push(f.url().replace('http://widget.test', '')); });
    await p.route('**/leaflet.min.js', r => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync('node_modules/leaflet/dist/leaflet.js') }));
    await p.route('**/leaflet.min.css', r => r.fulfill({ contentType: 'text/css', body: fs.readFileSync('node_modules/leaflet/dist/leaflet.css') }));
    await p.route(/data\.geopf\.fr/, r => r.fulfill({ contentType: 'image/png', body: PNG }));
    await p.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
    await p.route('http://widget.test/**', r => {
      const u = new URL(r.request().url()), f = path.join(__C.racine, decodeURIComponent(u.pathname).replace(/\/$/, '/index.html'));
      if (u.pathname.endsWith('/version.json')) return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: publiee }) });
      if (/\.(js|css)$/.test(u.pathname)) charges.push(u.pathname.split('/').slice(-2).join('/') + u.search);
      if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: '' });
      r.fulfill({ contentType: f.endsWith('.html') ? 'text/html' : f.endsWith('.css') ? 'text/css' : 'text/javascript', body: fs.readFileSync(f) });
    });
    await p.goto('http://widget.test/v2/sites/?doc=essai'); await p.waitForTimeout(2500);
    console.log(`PUBLIÉE ${publiee.split(' ')[0]} : navigations ${navigations.join(' → ')} | version affichée ${await p.textContent('#version')} | socle chargé ${charges.filter(c => c.startsWith('commun/socle.js')).join(', ')}`);
    await p.close();
  }
  await browser.close();
})();
