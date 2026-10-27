// Formulaire par site : sites repris dans un nouveau signalement laissés de côté (pas d'information nouvelle), remis,
// non enregistrés dans le signalement du jour, de nouveau proposés ensuite à leur dernier état
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docSites } = require('./run78');
(async () => {
  let doc = docSites();
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const ouvrir = async () => {
    const page = await browser.newPage({ viewport: { width: 1100, height: 1400 } });
    page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => { console.log('DIALOG :', d.message().replace(/\n+/g, ' | ').slice(0, 160)); d.accept(); });
    await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};window.__OPTS__=${JSON.stringify({ formulaire: 'Signalements' })};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + fs.readFileSync('mock-saisie.js') }));
    await page.goto('file://' + __C.racine + '/v2/saisie/index.html'); await page.waitForTimeout(1500);
    await page.click('#porte-nouveau'); await page.waitForTimeout(300);
    await page.fill('#nom', 'Jean Moulin'); await page.waitForTimeout(700); await page.click('#liste [role=option] >> nth=0'); await page.waitForTimeout(700);
    return page;
  };
  const lignes = p => p.$$eval('.ligne-rep', l => l.map(x => `${x.querySelector('.site-txt').value}${x.querySelector('[data-action=retirer-repris]') ? ' ✕' : ''}`).join(' | '));
  let page = await ouvrir();
  console.log('REPRIS :', await lignes(page));
  const retirer = async nom => { await page.click(`.ligne-rep:has(.site-txt[value="${nom}"]) [data-action=retirer-repris]`).catch(async () => {
    const k = await page.$$eval('.ligne-rep', (l, n) => l.findIndex(x => x.querySelector('.site-txt').value === n), nom); await page.click(`.ligne-rep >> nth=${k} >> [data-action=retirer-repris]`); }); await page.waitForTimeout(200); };
  await retirer('Site Lorient'); await retirer('Campus centre');
  console.log('APRÈS RETRAIT :', await lignes(page), '| NOTE :', await page.$eval('.retires', e => e.innerText.replace(/\s+/g, ' ')).catch(() => '(aucune)'));
  await page.click('[data-action=remettre-retires]'); await page.waitForTimeout(200);
  console.log('APRÈS « Remettre » :', await lignes(page));
  await retirer('Site Lorient'); await retirer('Campus centre');
  // les sites encore perturbés : confirmés ; enregistrement
  for (const b of await page.$$('[data-action=confirmer-site]')) await b.click().catch(() => {});
  await page.fill('#description', 'Point du jour'); await page.click('#btn-signalement'); await page.waitForTimeout(1500);
  console.log('STATUT :', (await page.textContent('#statut-signalement')).trim().slice(0, 100));
  doc = await page.evaluate(() => window.__DOC__);
  const R = doc.__data.Reponses, n = R.id[R.id.length - 1];
  console.log('ENREGISTRÉ (dossier', n + ') :', JSON.parse(R.Detail_des_sites[R.id.length - 1] || '[]').map(o => `${o.Site}/${o.Qualification}`).join(' ; '));
  const S = doc.__data.Sites_signales; console.log('SOUS-TABLE du dossier :', S.id.map((id, i) => i).filter(i => (S.Dossier[i] && S.Dossier[i][2] || S.Dossier[i]) === n).map(i => `${S.Site[i]}/${S.Qualification[i]}`).join(' ; '));
  await page.close();
  // signalement suivant : les sites laissés de côté sont de nouveau proposés, à leur dernier état
  page = await ouvrir();
  console.log('SIGNALEMENT SUIVANT, REPRIS :', await page.$$eval('.ligne-rep', l => l.map(x => `${x.querySelector('.site-txt').value} [${((x.querySelector('.repris') || {}).textContent || '').replace(/\s+/g, ' ').trim()}]`).join(' | ')));
  await browser.close();
})();
