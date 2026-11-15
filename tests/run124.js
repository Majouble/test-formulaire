// Widget « Référentiel des sites », onglet « File de vérification » : filtres, acceptation en lot (composante interne,
// ligne retirée avec report des références, position), valeur choisie (Modifier), siège choisi dans le bandeau,
// fait à la main, refus, report ; formules de déclenchement « Vérifié par » et Date
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docSites } = require('./run78');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6XqXcEAAAAASUVORK5CYII=', 'base64');
function docFv() {
  const doc = docSites(), T = doc._grist_Tables, C = doc._grist_Tables_column, D = doc.__data;
  const ajCol = (nom, c, ty, wo = '') => { const tr = T.id[T.tableId.indexOf(nom)], n = Math.max(...C.id) + 1; for (const k of Object.keys(C)) C[k].push(k === 'id' ? n : k === 'parentId' ? tr : k === 'colId' || k === 'label' ? c : k === 'type' ? ty : k === 'widgetOptions' ? wo : k === 'isFormula' ? false : (typeof C[k][0] === 'number' ? 0 : typeof C[k][0] === 'boolean' ? false : '')); };
  const table = (nom, cols, data) => { const tid = Math.max(...T.id) + 1; for (const k of Object.keys(T)) T[k].push(k === 'id' ? tid : k === 'tableId' ? nom : (typeof T[k][0] === 'number' ? 0 : '')); cols.forEach(([c, ty, wo]) => ajCol(nom, c, ty, wo)); D[nom] = data; };
  const E = D.Etablissements;
  for (const k of Object.keys(E)) E[k].push(k === 'id' ? 4 : k === 'Nom' ? 'École test' : k === 'Academie' ? 'Rennes' : k === 'Latitude' ? 48.1 : k === 'Longitude' ? -1.6 : null);
  [['Etablissement_ID', 'Text'], ['Niveau', 'Choice', JSON.stringify({ choices: ['Établissement'] })], ['Rattachement', 'Ref:Etablissements'], ['Etat', 'Text'],
   ['Perimetre', 'Choice', JSON.stringify({ choices: ['Privé – reconnaissance à vérifier', "Privé reconnu par l'État", 'Privé non reconnu'] })]].forEach(([c, ty, wo]) => ajCol('Etablissements', c, ty, wo));
  Object.assign(E, { Etablissement_ID: ['ETAB-0001', 'ETAB-0002', 'ETAB-0003', 'ETAB-0004'], Niveau: ['Établissement', 'Établissement', 'Établissement', 'Établissement'], Rattachement: [0, 0, 0, 0], Etat: ['', '', '', ''], Perimetre: ['', 'Privé – reconnaissance à vérifier', '', ''] });
  const S = D.Referentiel_sites;
  [['Composante', 'Ref:Etablissements'], ['Latitude', 'Numeric'], ['Longitude', 'Numeric'], ['Statut', 'Choice', JSON.stringify({ choices: ['Validé', 'Proposé'] })], ['Actif', 'Bool']].forEach(([c, ty, wo]) => ajCol('Referentiel_sites', c, ty, wo));
  S.id.push(6, 7); S.Site_id = ['SITE-0001', 'SITE-0002', 'SITE-0003', 'SITE-0004', 'SITE-0005', 'SITE-0006', 'SITE-0007']; S.Nom.push('Antenne commune', 'Site école test'); S.Etablissement.push(2, 4);
  Object.assign(S, { Composante: [0, 0, 0, 0, 0, 4, 0], Latitude: [48.1, 48.1, 48.0, 48.1, 48.8, 48.8, 48.1], Longitude: [-1.6, -1.6, -1.5, -1.6, 2.4, 2.4, -1.6], Statut: ['Validé', 'Validé', 'Validé', 'Validé', 'Proposé', 'Validé', 'Validé'], Actif: [true, true, true, true, true, true, true] });
  D.Reponses.Etablissement[D.Reponses.Etablissement.length - 1] = 4;   // un signalement sur la ligne qui sera retirée
  const V = [
    ['VERIF-1', '2 – Fort impact', 'Composante', 'Passer en composante interne', 'Établissement', 'ETAB-0003', 'Ecole Jules Ferry', '', 'Vitry', 'Niveau = Composante interne ; rattachement = ETAB-0001', 'Niveau, Établissement de rattachement', 'Règle 2', 'National', 'À traiter', { op: 'composante', id: 'ETAB-0003', parent: 'ETAB-0001' }],
    ['VERIF-2', '2 – Fort impact', 'Établissement', 'Retirer la ligne (fusionné)', 'Établissement', 'ETAB-0004', 'École test', '', '', 'Remplacé par ETAB-0002 – Lycée Romain Rolland', 'État = Retiré ; Remplacé par ; sites transférés', 'même SIREN', 'National', 'À traiter', { op: 'retirer', id: 'ETAB-0004', par: 'ETAB-0002', resultat: 'fusionné' }],
    ['VERIF-3', '3 – Impact moyen', 'Établissement', 'Désigner le siège', 'Établissement', 'ETAB-0001', 'Collège Jean Moulin', '', '', 'Choisir le site où se trouve la direction', 'Siège', 'site le plus proche : SITE-0002', 'National', 'À traiter', { op: 'siege', id: 'ETAB-0001', site: null, suggestion: 'SITE-0002' }],
    ['VERIF-4', '4 – Faible impact', 'Site', 'Placer le site', 'Site', 'SITE-0003', 'Site Villejean', '', '', 'Coordonnées proposées (48.12345, -1.70123)', 'Latitude / Longitude', '', 'Académie / établissement (campagne)', 'À traiter', { op: 'position', objet: 'site', id: 'SITE-0003', lat: 48.12345, lon: -1.70123 }],
    ['VERIF-5', '4 – Faible impact', 'Établissement', 'Confirmer le périmètre', 'Établissement', 'ETAB-0002', 'Lycée Romain Rolland', '', '', 'Privé – reconnaissance à vérifier', 'Périmètre', '', 'National', 'À traiter', { op: 'maj', objet: 'etab', id: 'ETAB-0002', champ: 'Périmètre', valeur: null }],
    ['VERIF-6', '4 – Faible impact', 'Composante', 'Créer une composante', 'UAI', '0312837R', '', '', '', 'Créer la composante', 'Création + liaison', 'Sites : SITE-0001', 'National', 'À traiter', null],
    ['VERIF-7', '4 – Faible impact', 'Site', "Vérifier l'existence du site", 'Site', 'SITE-0004', 'Site Lorient', '', '', 'Désactiver le site si non confirmé', 'Actif = FALSE si refus', '', 'Académie / établissement (campagne)', 'À traiter', { op: 'maj', objet: 'site', id: 'SITE-0004', champ: 'Actif', valeur: false }],
    ['VERIF-8', '4 – Faible impact', 'Site', 'Valider un site proposé', 'Site', 'SITE-0005', 'Campus Ivry', '', '', 'Passer en Validé', 'Statut = Validé', '', 'Académie / établissement (campagne)', 'À traiter', { op: 'maj', objet: 'site', id: 'SITE-0005', champ: 'Statut', valeur: 'Validé' }],
    ['VERIF-10', '3 – Impact moyen', 'Campus', 'Valider un campus', 'Campus', 'CAMP-0001', 'Campus de Rennes', '', 'Rennes', 'Créer « Campus de Rennes » (2 sites, 12.5 ha) – nom à préciser', 'Création du campus + rattachement des sites', 'Zone IGN', 'National', 'À traiter', { op: 'campus', id: 'CAMP-0001', nom: 'Campus de Rennes', nomAPreciser: true, type: 'Grand campus', commune: 'Rennes', lat: 48.11, lon: -1.64, surface: 12.5, sites: ['SITE-0001', 'SITE-0002'] }],
    ['VERIF-9', '5 – Correction automatique', 'Nommage', 'Nom de site', 'Site', 'SITE-0001', 'Campus centre', '', '', 'Campus Centre', 'Nom du site', '', 'Acceptation en lot', 'Traité', null],
  ];
  const cols = ['Verif_ID', 'Priorite', 'Famille', 'Type', 'Objet', 'Objet_ID', 'Libelle', 'Etablissement', 'Commune', 'Proposition', 'Effet_si_accepte', 'Preuve', 'Traitement_suggere', 'Statut', 'Action'];
  const data = { id: V.map((_, i) => i + 1) }; cols.forEach((c, k) => { data[c] = V.map(v => k === 14 ? (v[k] ? JSON.stringify(v[k]) : '') : v[k]); });
  Object.assign(data, { Decision: V.map((_, i) => i === 9 ? 'Accepter' : ''), Valeur_retenue: V.map(() => ''), Commentaire: V.map(() => ''), Verifie_par: V.map((_, i) => i === 9 ? 'Validation en lot' : ''), Date: V.map(() => null), Sensible: V.map(() => null) });
  table('Verifications', [...cols.map(c => [c, c === 'Statut' ? 'Choice' : 'Text', c === 'Statut' ? JSON.stringify({ choices: ['À traiter', 'En cours', 'Traité'] }) : '']),
    ['Decision', 'Choice', JSON.stringify({ choices: ['Accepter', 'Refuser', 'Modifier', 'Reporter'] })], ['Valeur_retenue', 'Text'], ['Commentaire', 'Text'], ['Verifie_par', 'Text'], ['Date', 'Date'], ['Sensible', 'Bool']], data);
  return doc;
}
(async () => {
  const doc = docFv();
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const p = await browser.newPage({ viewport: { width: 1300, height: 1300 } });
  p.on('pageerror', e => console.log('PAGEERROR', e.message)); p.on('dialog', d => { console.log('CONFIRMATION :', d.message().replace(/\n+/g, ' | ')); d.accept(); });
  await p.route('**/leaflet.min.js', r => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync('node_modules/leaflet/dist/leaflet.js') }));
  await p.route('**/leaflet.min.css', r => r.fulfill({ contentType: 'text/css', body: fs.readFileSync('node_modules/leaflet/dist/leaflet.css') }));
  await p.route(/data\.geopf\.fr/, r => r.fulfill({ contentType: 'image/png', body: PNG }));
  await p.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};window.__FORMULES_STRICTES__=true;` + fs.readFileSync('mock.js') + `;grist.onRecords=()=>{};grist.getOption=async()=>null;` }));
  await p.goto('file://' + __C.racine + '/v2/sites/index.html'); await p.waitForTimeout(3000);
  console.log('COMPTEUR :', await p.textContent('#badge-fv'));
  await p.click('[data-vue=fv]'); await p.waitForTimeout(800);
  const liste = () => p.$$eval('#vue-fv .fv-item', l => l.map(li => li.querySelector('.fv-tete strong').textContent + ' [' + [...li.querySelectorAll('button')].map(b => b.textContent.trim()).join('/') + (li.querySelector('.fv-coche') ? ', cochable' : '') + ']').join(' | '));
  console.log('LISTE :', await liste());
  console.log('ACADÉMIES :', await p.$$eval('#vue-fv [data-fvf=acad] option', l => l.map(o => o.textContent).join(', ')));
  // filtre : application d'un clic
  await p.selectOption('#vue-fv [data-fvf=mode]', 'auto'); await p.waitForTimeout(300);
  console.log('FILTRE « applicable » :', (await p.$$eval('#vue-fv .fv-item', l => l.length)), 'point(s)');
  // 1. lot : composante, ligne retirée, position
  for (const v of ['VERIF-1', 'VERIF-2', 'VERIF-4']) await p.check(`#vue-fv .fv-item:has-text("${v}") .fv-coche`);
  await p.waitForTimeout(200);
  await p.click('#vue-fv [data-fv-global=lot]'); await p.waitForTimeout(2500);
  console.log('APRÈS LOT :', await p.textContent('#fv-msg'));
  const etat = () => p.evaluate(() => { const D = window.__DOC__.__data, E = D.Etablissements, S = D.Referentiel_sites, R = D.Reponses, V = D.Verifications;
    return { etab: E.id.map((id, i) => `${id}:${E.Niveau[i]}/r${E.Rattachement[i] || 0}/${E.Etat[i] || '-'}/rp${(E.Remplace_par || [])[i] || 0}/s${(E.Siege || [])[i] || 0}/${E.Perimetre[i] || '-'}`).join(' '),
      sites: S.id.map((id, i) => `${id}:e${S.Etablissement[i]}c${S.Composante[i] || 0}${S.Actif[i] ? '' : '(inactif)'}${S.Statut[i] === 'Validé' ? '' : '(' + S.Statut[i] + ')'}@${S.Latitude[i]},${S.Longitude[i]}`).join(' '),
      signalement: R.Etablissement[R.Etablissement.length - 1],
      verif: V.id.map((id, i) => `${V.Verif_ID[i]}:${V.Decision[i] || '-'}/${V.Statut[i]}${V.Valeur_retenue[i] ? '/' + V.Valeur_retenue[i] : ''}`).join(' ') }; });
  console.log('ÉTAT :', JSON.stringify(await etat(), null, 1));
  // 2. périmètre à choisir : valeur retenue → Modifier
  await p.selectOption('#vue-fv [data-fvf=mode]', ''); await p.waitForTimeout(300);
  const it = v => `#vue-fv .fv-item:has-text("${v}")`;
  await p.selectOption(`${it('VERIF-5')} [data-fvl=valeur]`, "Privé reconnu par l'État"); await p.waitForTimeout(300);
  await p.click(`${it('VERIF-5')} [data-fv=accepter]`); await p.waitForTimeout(1500);
  console.log('PÉRIMÈTRE :', await p.textContent('#fv-msg'));
  // 2 bis. campus au nom à préciser : nom saisi, table des campus et colonne Campus des sites créées
  console.log('CAMPUS, BOUTONS :', await p.$$eval(`${it('VERIF-10')} button`, l => l.map(b => b.textContent.trim()).join('/')));
  await p.click(`${it('VERIF-10')} [data-fv=accepter]`); await p.waitForTimeout(1200);
  console.log('CAMPUS SANS NOM :', await p.textContent('#fv-msg'));
  await p.fill(`${it('VERIF-10')} [data-fvl=valeur]`, 'Campus Beaulieu'); await p.press(`${it('VERIF-10')} [data-fvl=valeur]`, 'Tab'); await p.waitForTimeout(300);
  await p.click(`${it('VERIF-10')} [data-fv=accepter]`); await p.waitForTimeout(1500);
  console.log('CAMPUS :', await p.textContent('#fv-msg'), '|', await p.evaluate(() => { const D = window.__DOC__.__data, Cp = D.Campus, S = D.Referentiel_sites, C = window.__DOC__._grist_Tables_column;
    const ty = C.type[C.colId.findIndex((c, i) => c === 'Campus' && C.type[i].startsWith('Ref'))];
    return `table Campus : ${Cp.id.map((id, i) => `${id}:${Cp.Campus_ID[i]}/${Cp.Nom[i]}/${Cp.Type[i]}/${Cp.Surface_ha[i]}`).join(' ')} ; sites.Campus (${ty}) : ${S.id.map((id, i) => `${id}→${S.Campus[i] || 0}`).join(' ')}`; }));
  // 3. siège : ouvrir, choisir le site dans le bandeau
  await p.click(`${it('VERIF-3')} [data-fv=ouvrir] >> nth=0`); await p.waitForTimeout(1000);
  console.log('VUE OUVERTE :', await p.evaluate(() => ['etab', 'fv'].filter(v => !document.getElementById('vue-' + v).hidden).join(',')), '|', (await p.textContent('#qa-retour')).replace(/\s+/g, ' ').slice(0, 160));
  console.log('SITES PROPOSÉS :', await p.$$eval('#qa-retour [data-fvb=site] option', l => l.map(o => (o.selected ? '*' : '') + o.textContent).join(' | ')));
  await p.selectOption('#qa-retour [data-fvb=site]', { label: 'SITE-0003 – Site Villejean' }).catch(async () => p.selectOption('#qa-retour [data-fvb=site]', { index: 2 }));
  await p.click('#qa-retour [data-fvb=siege]'); await p.waitForTimeout(2000);
  console.log('APRÈS SIÈGE : vue', await p.evaluate(() => ['etab', 'fv'].filter(v => !document.getElementById('vue-' + v).hidden).join(',')), '|', await p.textContent('#fv-msg'));
  // 4. fait à la main, refus, report
  await p.fill(`${it('VERIF-6')} [data-fvl=commentaire]`, 'Composante créée : ETAB-0005'); await p.click(`${it('VERIF-6')} [data-fv=fait]`); await p.waitForTimeout(1200);
  await p.click(`${it('VERIF-7')} [data-fv=refuser]`); await p.waitForTimeout(1200);
  await p.click(`${it('VERIF-8')} [data-fv=reporter]`); await p.waitForTimeout(1200);
  console.log('RESTE À TRAITER :', await liste(), '| compteur', await p.textContent('#badge-fv'));
  await p.selectOption('#vue-fv [data-fvf=etat]', 'reportes'); await p.waitForTimeout(300);
  console.log('REPORTÉS :', await liste());
  console.log('ÉTAT FINAL :', JSON.stringify(await etat(), null, 1));
  console.log('COLONNES :', await p.evaluate(() => { const D = window.__DOC__, C = D._grist_Tables_column, T = D._grist_Tables, tr = T.id[T.tableId.indexOf('Verifications')];
    return C.id.map((id, i) => C.parentId[i] === tr && ['Verifie_par', 'Date', 'Decision', 'Commentaire'].includes(C.colId[i]) ? `${C.colId[i]}=${C.formula[i] || '-'}${C.recalcDeps && C.recalcDeps[i] ? ' deps ' + JSON.stringify(C.recalcDeps[i]) : ''}` : null).filter(Boolean).join(' | '); }),
    '| commentaire VERIF-6 :', await p.evaluate(() => { const V = window.__DOC__.__data.Verifications; return V.Commentaire[5]; }));
  await p.screenshot({ path: __C.sorties + '/fv-124.png', fullPage: true });
  await browser.close();
})();
