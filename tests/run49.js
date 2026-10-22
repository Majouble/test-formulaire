const __C = require('./chemins');
const { chromium } = require('playwright'); const fs=require('fs');
const src = fs.readFileSync('run27.js','utf8'); const mkDoc = eval('('+src.slice(src.indexOf('(sansDep) =>'), src.indexOf('\n};\n')+2)+')');
(async()=>{
 const browser = await chromium.launch({executablePath: __C.chromium});
 const doc = mkDoc(false);
 for (const scheme of ['dark','light']) {
  for (const [nom, url, opts] of [['saisie','saisie/index.html',{formulaire:'Signalements'}],['tdb','tableau-de-bord/index.html',{}],['carte','cartographie/index.html',{}],['ps','point-situation/index.html',{}]]) {
   const page = await browser.newPage({viewport:{width:1000,height:900}, colorScheme: scheme});
   page.on('pageerror', e=>console.log('PAGEERROR',nom,e.message));
   await page.route('**/leaflet.min.js', r=>r.abort()); await page.route('**/leaflet.min.css', r=>r.abort());
   await page.route('**/grist-plugin-api.js', r=>r.fulfill({contentType:'text/javascript', body:`window.__DOC__=${JSON.stringify(doc)};window.__OPTS__=${JSON.stringify(opts)};`+fs.readFileSync('mock.js')+fs.readFileSync('fakeapi.js')+fs.readFileSync('mock-saisie.js')}));
   await page.goto('file://' + __C.racine + '/prod/'+url); await page.waitForTimeout(2000);
   if (nom==='saisie') { await page.click('#porte-nouveau').catch(()=>{}); await page.waitForTimeout(500); }
   await page.screenshot({path:`th-${scheme}-${nom}.png`});
   await page.close();
  }
 }
 await browser.close();
})();
