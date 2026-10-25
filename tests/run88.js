// Widget « Référentiel des sites » : vue « À vérifier » (moteur commun), corrections sur place
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docSites } = require('./run78');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6XqXcEAAAAASUVORK5CYII=', 'base64');
(async () => {
  const doc = docSites(), D = doc.__data, E = D.Etablissements, R = D.Reponses;
  E.Latitude[2] = null; E.Longitude[2] = null;   // École Jules Ferry : sans coordonnées
  const id = Math.max(...R.id) + 1;
  for (const k of Object.keys(R)) R[k].push(k === 'id' ? id : k === 'Etablissement' ? 3 : k === 'Dossier' ? id : k === 'Derniere_version' ? true : k === 'Qualification' ? null : k === 'Nature' ? 'Nouveau signalement' : k === 'Description' ? 'test' : k === 'Date_faits' ? Date.UTC(2026, 9, 23) / 1000 : k === 'Cree_le' ? Date.UTC(2026, 9, 23, 9) / 1000 : (typeof R[k][0] === 'string' ? '' : null));
  const browser = await chromium.launch({ executablePath: __C.chromium }); const page = await browser.newPage({ viewport: { width: 1300, height: 950 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('dialog', d => d.accept());
  await page.route('**/leaflet.min.js', r => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync('node_modules/leaflet/dist/leaflet.js') }));
  await page.route('**/leaflet.min.css', r => r.fulfill({ contentType: 'text/css', body: fs.readFileSync('node_modules/leaflet/dist/leaflet.css') }));
  await page.route(/data\.geopf\.fr/, r => r.fulfill({ contentType: 'image/png', body: PNG }));
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};` + fs.readFileSync('mock.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await page.goto('file://' + __C.racine + '/v2/sites/index.html'); await page.waitForTimeout(2500);
  console.log('BADGE :', await page.textContent('#badge-qa'));
  await page.click('[data-vue=qa]'); await page.waitForTimeout(400);
  const items = () => page.$$eval('.qa-item', l => l.map(x => x.querySelector('strong').textContent + ' [' + [...x.querySelectorAll('[data-qa]')].map(b => b.textContent.trim()).join(' / ') + ']').join('\n   '));
  console.log('LISTE :\n  ', await items());
  // établissement sans coordonnées : placé sur la carte
  await page.selectOption('#qa-type', 'sans_coord'); await page.waitForTimeout(200);
  await page.click('.qa-item [data-qa=corriger]'); await page.waitForTimeout(500);
  console.log('VUE :', await page.$eval('#vue-etab', e => !e.hidden), '| bandeau :', (await page.textContent('#qa-retour')).replace(/\s+/g, ' ').slice(0, 140), '| fiche :', await page.textContent('.fiche strong'));
  await page.click('[data-placer-etab]'); await page.waitForTimeout(200);
  const box = await page.$eval('#carte', e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.click(box.x, box.y); await page.waitForTimeout(700);
  console.log('PLACÉ :', await page.textContent('#statut'), '|', await page.evaluate(() => { const E = window.__DOC__.__data.Etablissements; return `${E.Latitude[2]}, ${E.Longitude[2]}`; }));
  await page.click('[data-qr=corrige]'); await page.waitForTimeout(800);
  console.log('RETOUR LISTE :', await page.$eval('#vue-qa', e => !e.hidden), '| badge', await page.textContent('#badge-qa'));
  // saisie d'essai : description et qualification corrigées sur place
  await page.selectOption('#qa-type', 'essai'); await page.waitForTimeout(200);
  console.log('ESSAIS :', await items());
  await page.click('.qa-item:has-text("Ecole Jules Ferry") [data-qa=corriger]'); await page.waitForTimeout(300);
  console.log('ÉDITION :', (await page.textContent('#vue-qa')).replace(/\s+/g, ' ').slice(0, 260));
  await page.fill('.qa-dossier [data-champ=d]', 'Rassemblement de 40 étudiants devant le bâtiment principal');
  await page.selectOption('.qa-dossier [data-champ=q]', 'Rassemblement');
  await page.click('.qa-dossier [data-ed=enregistrer]'); await page.waitForTimeout(1200);
  console.log('APRÈS ENREGISTREMENT :', (await page.textContent('#vue-qa')).replace(/\s+/g, ' ').slice(0, 160));
  console.log('RÉPONSE :', await page.evaluate(id => { const R = window.__DOC__.__data.Reponses, i = R.id.indexOf(id); return `${R.Qualification[i]} | ${R.Description[i]}`; }, id));
  // rattacher un dossier à un autre établissement
  await page.click('#qa-liste'); await page.selectOption('#qa-type', 'sans_qualif').catch(() => {}); await page.selectOption('#qa-type', ''); await page.waitForTimeout(200);
  await page.click('.qa-item [data-qa=corriger] >> nth=0'); await page.waitForTimeout(300);
  const dossierAvant = await page.$eval('.qa-dossier', e => e.dataset.dossier).catch(() => null);
  if (dossierAvant && await page.$('.qa-dossier [data-champ=e]')) {
    await page.fill('.qa-dossier [data-champ=e]', 'romain'); await page.waitForTimeout(200);
    await page.click('.qa-dossier .resultats li[data-etab]'); await page.click('.qa-dossier [data-ed=rattacher]'); await page.waitForTimeout(1200);
    console.log('RATTACHEMENT :', await page.textContent('#qa-msg'), '|', await page.evaluate(d => { const R = window.__DOC__.__data.Reponses; return R.id.filter((x, i) => (R.Dossier[i] || x) === +d).map(x => R.Etablissement[R.id.indexOf(x)]).join(','); }, dossierAvant));
  } else console.log('RATTACHEMENT : pas de dossier éditable', dossierAvant);
  // correction faite hors de la vue « À vérifier » : l'analyse se met à jour au retour
  await page.click('#qa-liste').catch(() => {}); await page.selectOption('#qa-type', ''); await page.selectOption('#qa-statut', 'a_traiter'); await page.waitForTimeout(200);
  const avant = await page.$$eval('.qa-item', l => l.length), badgeAvant = await page.textContent('#badge-qa');
  await page.click('[data-vue=etab]'); await page.fill('#etab-q', 'romain'); await page.waitForTimeout(200); await page.click('#etab-res li >> nth=0'); await page.waitForTimeout(300);
  await page.evaluate(() => grist.docApi.applyUserActions([['UpdateRecord', 'Reponses', 2, { Qualification: null }]]));   // nouvelle anomalie, écrite ailleurs
  await page.waitForTimeout(2500);
  console.log('BADGE MIS À JOUR :', badgeAvant, '→', await page.textContent('#badge-qa'));
  await page.click('[data-vue=qa]'); await page.waitForTimeout(800);
  console.log('LISTE MISE À JOUR :', avant, '→', await page.$$eval('.qa-item', l => l.length));
  console.log('STATUTS (Config) :', await page.evaluate(() => { const C = window.__DOC__.__data.Config, i = C.Cle.indexOf('qualite'); return i < 0 ? '∅' : Object.values(JSON.parse(C.Valeur[i]).statuts).map(x => x.s + (x.note ? ' (' + x.note + ')' : '')).join(', '); }));
  await page.screenshot({ path: __C.sorties + '/run88.png' });
  await browser.close();
})();
