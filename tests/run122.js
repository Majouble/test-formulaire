// Menu déroulant (2.54, commun/menu-deroulant.js) : les champs à valeurs proposées ont une flèche ▾ et une vraie liste
// (plus le menu natif du navigateur, peu visible) — valeur d'un filtre de colonne des Extractions (plusieurs valeurs
// « a ; b »), valeur d'une condition du tableau de bord (« est l'une des valeurs » : plusieurs), site du formulaire
// (flèche = liste complète des sites de l'établissement) ; filtrage à la frappe, clavier, choix qui met à jour le widget
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docValidation } = require('./run108');
const { docSites } = require('./run78');
const liste = page => page.$$eval('.md-liste:not([hidden]) li', l => l.map(x => x.textContent.trim().replace(/\s+/g, ' ')).join(' | ')).catch(() => '(fermée)');
const ouverte = page => page.$eval('.md-liste', e => !e.hidden).catch(() => false);
const fleche = async (page, sel) => { const b = await page.$eval(sel, e => { const r = e.getBoundingClientRect(); return { x: r.right - 10, y: r.top + r.height / 2 }; }); await page.mouse.click(b.x, b.y); };
(async () => {
  const browser = await chromium.launch({ executablePath: __C.chromium });

  // 1. Extractions : valeur d'un filtre de colonne
  {
    const doc = docValidation();
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.on('pageerror', e => console.log('PAGEERROR', e.message));
    await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js')
      + `;window.__OPTS={};grist.ready=()=>{};grist.onOptions=cb=>setTimeout(()=>cb(null),50);grist.setOptions=o=>{window.__OPTS=JSON.parse(JSON.stringify(o));};grist.docApi.listTables=async()=>window.__DOC__._grist_Tables.tableId.slice();` }));
    await page.goto('file://' + __C.racine + '/v2/extractions/index.html'); await page.waitForTimeout(1500);
    await page.selectOption('#filtresCol [data-i="0"] select.col', 'Qualification'); await page.waitForTimeout(150);
    const champ = '#filtresCol [data-i="0"] input[data-champ=val]';
    console.log('EXTRACTIONS, champ amélioré :', await page.$eval(champ, e => `${e.className} · role=${e.getAttribute('role')} · list natif=${e.hasAttribute('list')}`));
    await page.click(champ); await page.waitForTimeout(150);
    console.log('CLIC → LISTE :', await liste(page));
    await page.keyboard.type('fer'); await page.waitForTimeout(150);
    console.log('FRAPPE « fer » :', await liste(page));
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
    console.log('ENTRÉE → valeur :', await page.inputValue(champ), '| résultat :', await page.textContent('#compte'), '| liste ouverte :', await ouverte(page));
    await page.keyboard.type(' ; '); await page.waitForTimeout(150);
    console.log('APRÈS « ; » (valeur déjà prise retirée) :', await liste(page));
    await page.click('.md-liste li[role=option] >> text=Perturbé'); await page.waitForTimeout(200);
    console.log('CLIC → valeur :', await page.inputValue(champ), '| résultat :', await page.textContent('#compte'));
    await page.keyboard.press('Escape');
    await fleche(page, champ); await page.waitForTimeout(150);
    console.log('FLÈCHE → liste ouverte :', await ouverte(page)); await fleche(page, champ); await page.waitForTimeout(150);
    console.log('FLÈCHE de nouveau → liste ouverte :', await ouverte(page));
    await page.close();
  }

  // 2. Tableau de bord (onglet de l'administration) : valeur d'un filtre commun
  {
    const doc = docSites(), C = doc.__data.Config;
    const blocs = { name: 'Tableau de bord', filters: [], blocks: [{ id: 'c1', type: 'tile', title: 'Signalements', measure: { agg: 'count' }, conds: [] }] };
    const i = C.Cle.indexOf('tableau_de_bord');
    if (i >= 0) C.Valeur[i] = JSON.stringify({ publie: blocs, brouillon: blocs });
    else { C.id.push(Math.max(...C.id) + 1); C.Cle.push('tableau_de_bord'); C.Valeur.push(JSON.stringify({ publie: blocs, brouillon: blocs })); if (C.Modifie_le) C.Modifie_le.push(null); }
    const page = await browser.newPage({ viewport: { width: 1300, height: 1100 } });
    page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => d.accept());
    await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
    await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(1200);
    await page.click('nav button[data-onglet=onglet-tdb]'); await page.waitForTimeout(2500);
    await page.click('[data-act=st-reglages] >> nth=0'); await page.waitForTimeout(600);
    await page.click('[data-act=addcond][data-scope=g]'); await page.waitForTimeout(500);
    await page.selectOption('[data-scope=g][data-ci="0"][data-f=col]', 'Nature'); await page.waitForTimeout(500);
    const val = '[data-scope=g][data-ci="0"][data-f=val]';
    console.log('TABLEAU DE BORD, champ amélioré :', await page.$eval(val, e => `${e.className} · list natif=${e.hasAttribute('list')}`));
    await page.click(val); await page.waitForTimeout(150);
    console.log('CLIC → LISTE :', await liste(page));
    await page.keyboard.press('Escape');
    await page.selectOption('[data-scope=g][data-ci="0"][data-f=op]', 'in'); await page.waitForTimeout(500);
    console.log('« est l\'une des valeurs » : séparateur =', await page.$eval(val, e => e.dataset.separateur));
    await page.click(val); await page.waitForTimeout(150);
    await page.click('.md-liste li[role=option] >> nth=0'); await page.waitForTimeout(400);
    await page.click(val); await page.waitForTimeout(150);
    await page.click('.md-liste li[role=option] >> nth=0'); await page.waitForTimeout(600);
    console.log('DEUX CHOIX → valeur :', await page.inputValue(val));
    await page.close();
  }

  // 3. Formulaire : site d'un établissement (liste complète par la flèche)
  {
    const doc = docSites();
    const page = await browser.newPage({ viewport: { width: 1100, height: 1300 } });
    page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => d.accept());
    await page.clock.setSystemTime(new Date('2026-10-23T10:00:00+02:00'));
    await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};window.__OPTS__=${JSON.stringify({ formulaire: 'Signalements', libelle: 'Alice' })};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + fs.readFileSync('mock-saisie.js') }));
    await page.goto('file://' + __C.racine + '/v2/saisie/index.html'); await page.waitForTimeout(1500);
    await page.click('#porte-nouveau'); await page.waitForTimeout(400);
    await page.fill('#nom', 'Jean Moulin'); await page.waitForTimeout(700); await page.click('#liste [role=option] >> nth=0'); await page.waitForTimeout(600);
    let site = '.ligne-rep .site-txt:not([disabled])';
    if (!(await page.$(site))) { await page.click('[data-action=ajouter], .ajouter-ligne').catch(() => {}); await page.waitForTimeout(400); }
    site = (await page.$$('.ligne-rep .site-txt:not([disabled])')).length ? '.ligne-rep .site-txt:not([disabled]) >> nth=-1' : site;
    console.log('FORMULAIRE, flèche sur le champ du site :', await page.$eval(site, e => e.classList.contains('md-chevron')));
    await page.fill(site, 'campus'); await page.waitForTimeout(200);
    const sugg = () => page.$$eval('.site-sugg:not([hidden]) li[role=option] .nom', l => l.map(x => x.textContent).join(' | ')).catch(() => '(fermée)');
    console.log('FRAPPE « campus » :', await sugg());
    await fleche(page, site); await page.waitForTimeout(200);
    console.log('FLÈCHE → LISTE COMPLÈTE :', await sugg());
    await fleche(page, site); await page.waitForTimeout(200);
    console.log('FLÈCHE de nouveau → fermée :', await page.$eval('.site-sugg', e => e.hidden));
    await page.close();
  }
  await browser.close();
})();
