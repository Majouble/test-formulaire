const __C = require('./chemins');
const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{
 const browser = await chromium.launch({executablePath: __C.chromium}); const page = await browser.newPage({viewport:{width:1300,height:900}});
 page.on('pageerror', e=>console.log('PAGEERROR',e.message)); page.on('dialog', d=>d.accept());
 await page.route('**/grist-plugin-api.js', r=>r.fulfill({contentType:'text/javascript', body:`window.__DOC__=${fs.readFileSync('${__C.donnees + '/'}blank.json')};`+fs.readFileSync('mock.js')+fs.readFileSync('fakeapi.js')+`;grist.onRecords=()=>{};grist.getOption=async()=>null;`}));
 await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(400);
 await page.click('#btn-appliquer'); await page.waitForTimeout(500);
 await page.click('nav button[data-onglet=formulaires]'); await page.waitForTimeout(600);
 await page.click('#btn-nouveau'); await page.fill('#nf-nom','F'); await page.click('#nf-valider'); await page.waitForTimeout(600);
 const titre = async()=> (await page.textContent('#panneau h2'));
 const sel = async()=>{ await page.click('[data-commun]'); await page.waitForTimeout(200); return titre(); };
 console.log('1 choisi:', await sel()); await page.click('#pn-retour'); await page.waitForTimeout(200); console.log('  retour lien →', await titre());
 console.log('2 choisi:', await sel()); await page.mouse.click(60, 600); await page.waitForTimeout(200); console.log('  clic vide →', await titre());
 console.log('3 choisi:', await sel()); await page.keyboard.press('Escape'); await page.waitForTimeout(200); console.log('  Échap →', await titre());
 await sel(); await page.screenshot({path:'retour.png', clip:{x:900,y:80,width:400,height:200}});
 await browser.close();
})();
