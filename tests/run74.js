// Onglet « À vérifier » : sections (SEGPA), doublons, établissements, qualifications, saisies d'essai
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const src = fs.readFileSync('run27.js', 'utf8'); const mkDoc = eval('(' + src.slice(src.indexOf('(sansDep) =>'), src.indexOf('\n};\n') + 2) + ')');
(async () => {
  const doc = mkDoc(false), E = doc.__data.Etablissements, R = doc.__data.Reponses, T = doc._grist_Tables, C = doc._grist_Tables_column;
  const ajCol = (table, col, ty) => { const tr = T.id[T.tableId.indexOf(table)], n = Math.max(...C.id) + 1; for (const k of Object.keys(C)) C[k].push(k === 'id' ? n : k === 'parentId' ? tr : k === 'colId' || k === 'label' ? col : k === 'type' ? ty : k === 'isFormula' ? false : (typeof C[k][0] === 'number' ? 0 : typeof C[k][0] === 'boolean' ? false : '')); };
  ajCol('Reponses', 'Date_faits', 'Date');
  const J = 1760918400;   // 20/10/2025
  R.Date_faits = R.id.map((_, i) => J + (i % 2) * 86400);
  const ajE = (o) => { for (const c of Object.keys(E)) { if (c === 'id') E.id.push(Math.max(...E.id) + 1); else E[c].push(c in o ? o[c] : (typeof E[c][0] === 'number' ? 0 : '')); } return E.id[E.id.length - 1]; };
  console.log('Jean Moulin :', E.Nom[0], E.Latitude[0], E.Longitude[0], E.Commune[0], E.Academie[0]);
  const segpa = ajE({ UAI: '0750001S', Nom: 'SEGPA Collège Jean Moulin', Type: 'Collège', Libelle_nature: "SECTION D'ENSEIGNEMENT GENERAL ET PROFESSIONNEL ADAPTE", Commune: E.Commune[0], Academie: E.Academie[0], Departement: E.Departement[0], Latitude: E.Latitude[0] + 0.0004, Longitude: E.Longitude[0] + 0.0003 });
  const isole = ajE({ UAI: '0999999X', Nom: 'SEGPA Collège Perdu', Type: 'Collège', Libelle_nature: "SECTION D'ENSEIGNEMENT GENERAL ET PROFESSIONNEL ADAPTE", Commune: 'Nulle-Part', Academie: E.Academie[0], Latitude: 45.0, Longitude: 3.0 });
  const sansGps = ajE({ UAI: '0750002Z', Nom: 'École sans GPS', Type: 'Ecole', Libelle_nature: 'ECOLE ELEMENTAIRE', Commune: E.Commune[0], Academie: E.Academie[0], Latitude: null, Longitude: null });
  const ajR = (o) => { const id = Math.max(...R.id) + 1; for (const c of Object.keys(R)) { if (c === 'id') R.id.push(id); else R[c].push(c in o ? o[c] : c === 'Dossier' ? id : c === 'Derniere_version' ? true : c === 'Description' ? 'Blocage du portail par une trentaine d élèves' : null); } return id; };
  ajR({ Etablissement: segpa, Date_faits: J, Qualification: ['L', 'Blocage'] });          // SEGPA le même jour qu'un dossier de Jean Moulin
  ajR({ Etablissement: isole, Date_faits: J, Qualification: ['L', 'Blocage'] });
  ajR({ Etablissement: sansGps, Date_faits: J, Qualification: ['L', 'Intrusion'], Description: 'test' });
  ajR({ Etablissement: null, Date_faits: J, Qualification: ['L', 'Intrusion'] });
  ajR({ Etablissement: 2, Date_faits: J + 3 * 86400, Qualification: null });
  console.log('réponses :', R.id.length, '| Jean Moulin :', R.id.filter((_, i) => R.Etablissement[i] === 1).map(id => id + '@' + R.Date_faits[R.id.indexOf(id)]).join(' '));
  const browser = await chromium.launch({ executablePath: __C.chromium }); const page = await browser.newPage({ viewport: { width: 1200, height: 1600 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => { console.log('DIALOG', d.message()); d.accept(); });
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await page.goto('file://' + __C.racine + '/v2/admin/index.html'); await page.waitForTimeout(5500);
  console.log('BADGE AVANT OUVERTURE :', (await page.textContent('nav button[data-onglet=qualite]')).trim());
  await page.click('nav button[data-onglet=qualite]'); await page.waitForTimeout(1500);
  console.log('ONGLET :', (await page.textContent('nav button[data-onglet=qualite]')).trim());
  console.log('GROUPES :', await page.$$eval('#qualite .qa-groupe h3', l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim()).join(' | ')));
  console.log('ITEMS :\n ' + (await page.$$eval('#qualite .qa-item', l => l.map(x => x.querySelector('.qa-tete').textContent.replace(/\s+/g, ' ').trim() + ' — ' + ((x.querySelector('.qa-detail') || {}).textContent || '') + ' [' + [...x.querySelectorAll('button')].map(b => b.textContent.trim()).join(' / ') + ']'))).join('\n '));
  await page.screenshot({ path: __C.sorties + '/qa-74.png', fullPage: true });
  // corriger la SEGPA
  await page.click('#qualite .qa-item:has-text("SEGPA Collège Jean Moulin") [data-corriger]'); await page.waitForTimeout(1500);
  console.log('APRÈS CORRECTION :', await page.textContent('#qa-statut-msg'), '| Reponses SEGPA →', await page.evaluate(s => { const R = window.__DOC__.__data.Reponses; return R.id.filter((_, i) => R.Etablissement[i] === s).length; }, segpa));
  console.log('GROUPES :', await page.$$eval('#qualite .qa-groupe h3', l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim()).join(' | ')));
  // vérifié sur un doublon
  await page.click('#qualite .qa-item:has-text("dossiers pour") [data-verifie]'); await page.waitForTimeout(800);
  console.log('APRÈS VÉRIFIÉ :', await page.textContent('#qa-statut-msg'), '| badge', (await page.textContent('nav button[data-onglet=qualite]')).trim());
  console.log('CONFIG qualite :', await page.evaluate(() => { const d = window.__DOC__.__data.Config; return JSON.stringify(Object.keys(d)) + ' ' + d.Cle.map((c, i) => c === 'qualite' ? JSON.stringify(Object.fromEntries(Object.keys(d).map(k => [k, d[k][i]]))) : '').filter(Boolean).join(' ; '); }));
  await page.selectOption('#qa-statut', 'traites'); await page.waitForTimeout(200);
  console.log('TRAITÉS :', await page.$$eval('#qualite .qa-item', l => l.map(x => x.querySelector('.qa-tete').textContent.trim() + ' ' + x.querySelector('.qa-actions').textContent.replace(/\s+/g, ' ').trim()).join(' || ')));
  await browser.close();
})();
