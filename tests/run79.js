// Admin : rapprochement des sites saisis (Référentiel), modèle de formulaire « Enseignement supérieur par site »
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docSites } = require('./run78');
(async () => {
  const doc = docSites(), T = doc._grist_Tables, C = doc._grist_Tables_column, D = doc.__data;
  // anciens sites saisis à la main (octobre) : sous-table Sites (Dossier → Reponses, Nom_du_site)
  const tid = Math.max(...T.id) + 1; for (const k of Object.keys(T)) T[k].push(k === 'id' ? tid : k === 'tableId' ? 'Sites' : (typeof T[k][0] === 'number' ? 0 : ''));
  for (const [c, ty] of [['Dossier', 'Ref:Reponses'], ['Nom_du_site', 'Text'], ['Qualification', 'Choice']]) { const n = Math.max(...C.id) + 1; for (const k of Object.keys(C)) C[k].push(k === 'id' ? n : k === 'parentId' ? tid : k === 'colId' || k === 'label' ? c : k === 'type' ? ty : k === 'isFormula' ? false : (typeof C[k][0] === 'number' ? 0 : typeof C[k][0] === 'boolean' ? false : '')); }
  D.Sites = { id: [1, 2, 3, 4, 5], Dossier: [3, 3, 4, 4, 1], Nom_du_site: ['Campus Beaulieu bat 12', 'Annexe Rue Dupont', 'campus beaulieu, bât. 12', 'Villejean', 'Bâtiment Ivry'], Qualification: ['Blocage total', 'Rassemblement', 'Blocage total', 'Rassemblement', 'RAS'] };
  // le dossier 1 est celui de l'établissement 1 aussi ; on rattache le 5e libellé à l'établissement 2 (dossier 2)
  D.Sites.Dossier[4] = 2;
  const browser = await chromium.launch({ executablePath: __C.chromium }); const page = await browser.newPage({ viewport: { width: 1300, height: 1500 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => d.accept());
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(1200);
  await page.click('nav button[data-onglet=referentiel]'); await page.waitForTimeout(1800);
  console.log('SOURCES :', await page.$$eval('#si-source option', o => o.map(x => x.textContent).join(' | ')));
  await page.selectOption('#si-source', 'Sites.Nom_du_site'); await page.waitForTimeout(1200);
  console.log('RÉFÉRENTIELS :', await page.$$eval('#si-ref option', o => o.map(x => x.textContent).join(' | ')));
  console.log('LIGNES :\n  ' + (await page.$$eval('#ref-sites tbody tr', l => l.map(tr => [...tr.querySelectorAll('td')].slice(1).map(td => td.querySelector('select') ? (td.querySelector('select').selectedOptions[0] || {}).textContent : td.textContent.replace(/\s+/g, ' ').trim()).join(' · ') + (tr.querySelector('.si-coche').checked ? ' [coché]' : ''))).then(a => a.join('\n  '))));
  // Villejean : proposé ? choisir à la main si besoin
  await page.click('#si-valider'); await page.waitForTimeout(1200);
  console.log('VALIDER :', await page.textContent('#si-statut'));
  console.log('CORRESPONDANCES :', await page.evaluate(() => { const t = window.__DOC__.__data.Sites_correspondances; return t.id.map((id, i) => `${t.Etablissement[i]}|${t.Libelle[i]}→${t.Site[i]}(${t.Statut[i]})`).join('  '); }));
  await page.selectOption('#si-filtre', 'tous'); await page.waitForTimeout(200);
  console.log('À TRAITER restant :', await page.$eval('#si-filtre option[value=a_traiter]', o => o.textContent));
  // modèle de formulaire
  await page.click('nav button[data-onglet=formulaires]'); await page.waitForTimeout(1500);
  await page.click('#btn-nouveau'); await page.waitForTimeout(300);
  await page.fill('#nf-nom', 'ESR par site'); await page.selectOption('#nf-modele', 'esr-sites');
  await page.selectOption('#nf-table', '__nouvelle__'); await page.waitForTimeout(200); await page.fill('#nf-nouvelle', 'Reponses_ESR');
  await page.click('#nf-valider'); await page.waitForTimeout(3000);
  console.log('MESSAGE :', (await page.$$eval('.message, #message, [role=status]', l => l.map(x => x.textContent.trim()).filter(Boolean).join(' | '))).slice(0, 500));
  console.log('TABLES :', await page.evaluate(() => window.__DOC__._grist_Tables.tableId.filter(t => /site|Reponses_ESR|correspond/i.test(t)).join(', ')));
  console.log('COLONNES Sites_signales :', await page.evaluate(() => { const T = window.__DOC__._grist_Tables, C = window.__DOC__._grist_Tables_column, t = T.id[T.tableId.indexOf('Sites_signales')]; return C.id.map((_, i) => i).filter(i => C.parentId[i] === t).map(i => `${C.colId[i]}:${C.type[i]}`).join(', '); }));
  console.log('BROUILLON :', await page.evaluate(() => { const F = window.__DOC__.__data.Formulaires, i = F.Nom.indexOf('ESR par site'); const c = JSON.parse(F.Brouillon[i]); return JSON.stringify({ saisie: c.saisie, blocs: c.blocs.map(b => ({ colonne: b.colonne, tableau: b.reglages.tableau })) }); }));
  await page.click('.bloc:has-text("Sites concernés")').catch(() => {}); await page.waitForTimeout(500);
  console.log('PANNEAU sites :', (await page.textContent('#panneau').catch(() => '')).replace(/\s+/g, ' ').match(/Tableau des sites.{0,300}/));
  await page.screenshot({ path: __C.sorties + '/run79.png', fullPage: true });
  await browser.close();
})();
