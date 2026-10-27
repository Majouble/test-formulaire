// Mode veille du kit de secours : relais (code du workflow n8n exécuté par relais-local.js) et faux Grist (faux-grist-api.js).
// Poste A en veille : réglage et test du relais, premières copies (base, empreinte, dossiers), mise en route sans rien déposer
// à la main ; copie précédente gardée ; copie anormalement vide refusée puis écrite à la demande ; intervalle et plage
// horaire ; base qui change (nouvelle empreinte, rechargement d'office) ; panne de Grist puis du relais, passage en mode
// secours, saisie, retour du réseau signalé. Poste B sans relais : copies du dossier prises d'office, clé « secours ».
// Prérequis : node ../outils/construire-secours.js
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const { docSites } = require('./run78');
const fauxGrist = require('./faux-grist-api'), relaisLocal = require('./relais-local');
const { installer } = require('./dossier-simule');
const KIT = 'file://' + __C.racine + '/v2/secours/kit-secours.html';
const PARTAGE = path.join(__C.sorties, 'veille-partage'); fs.rmSync(PARTAGE, { recursive: true, force: true }); fs.mkdirSync(PARTAGE, { recursive: true });
const pause = ms => new Promise(r => setTimeout(r, ms));
const fichiers = () => fs.readdirSync(PARTAGE).sort().join(', ');
const lignesCopie = () => { const j = JSON.parse(fs.readFileSync(path.join(PARTAGE, 'instantane-dossiers.json'))); return j.tables.Reponses.records.length; };
const vieillir = (f, h) => { const t = (Date.now() - h * 3600e3) / 1000; fs.utimesSync(path.join(PARTAGE, f), t, t); };

(async () => {
  const doc = docSites();
  { const C = doc.__data.Config; C.id.push(99); C.Cle.push('secours'); C.Valeur.push(JSON.stringify({ entrees: { 'deja-reintegree': { t: '2026-10-26T10:00:00Z' } } })); if (C.Modifie_le) C.Modifie_le.push(0); }
  const G = fauxGrist.creer({ doc, port: 8821 }); G.etat.reponsesEnPlus = 25;   // 32 réponses
  let R = relaisLocal.creer({ port: 8811, reglages: { CLE_KIT: 'clek', API_GRIST: G.url, DOC: G.id, CLE_GRIST: G.cle } });
  const browser = await chromium.launch({ executablePath: __C.chromium });

  // ---- poste A : mise en route en mode veille, sans aucun fichier déposé à la main
  const ctxA = await browser.newContext({ viewport: { width: 1250, height: 1100 } }), A = await ctxA.newPage();
  A.on('pageerror', e => console.log('[A] PAGEERROR', e.message)); A.on('dialog', d => d.accept());
  await installer(A, PARTAGE);
  await A.goto(KIT); await A.waitForTimeout(700);
  await A.fill('#kit-secours #agent', 'Veille cellule'); await A.locator('#kit-secours #agent').dispatchEvent('change');
  await A.fill('#kit-secours #relais-url', R.url); await A.fill('#kit-secours #relais-cle', 'mauvaise');
  await A.click('#kit-secours [data-a=relais-tester]'); await A.waitForTimeout(500);
  console.log('[A] test, mauvaise clé :', await A.textContent('#kit-secours #relais-etat'));
  await A.fill('#kit-secours #relais-cle', 'clek');
  await A.click('#kit-secours [data-a=relais-tester]'); await A.waitForTimeout(500);
  console.log('[A] test, bonne clé :', await A.textContent('#kit-secours #relais-etat'));
  await A.click('#kit-secours [data-a=relais-enregistrer]'); await A.waitForTimeout(200);
  await A.evaluate(() => window.__KIT__.connecter(window.__dossierSimule('partage'))); await A.waitForTimeout(400);
  await A.click('#kit-secours [data-a=veille-maintenant]'); await A.waitForTimeout(2500);
  console.log('[A] dossier partagé après « Faire les copies maintenant » :', fichiers());
  console.log('[A] réglages, copie :', (await A.innerText('#kit-secours section:nth-of-type(3)')).replace(/\s+/g, ' ').slice(0, 200));
  console.log('[A] pages proposées :', (await A.$$eval('#kit-secours #page option', l => l.map(o => o.textContent))).join(' | '));
  await A.selectOption('#kit-secours #page', { index: 2 });
  await Promise.all([A.waitForNavigation(), A.click('#kit-secours [data-a=commencer]')]); await A.waitForTimeout(1800);
  // un vrai dossier reste mémorisé par Edge ; le dossier simulé, non : il est reconnecté après chaque rechargement
  await A.evaluate(() => window.__KIT__.connecter(window.__dossierSimule('partage'))); await A.waitForTimeout(400);
  const bandeau = async () => (await A.textContent('#kit-secours .barre')).replace(/\s+/g, ' ').trim();
  const onglets = () => A.$$eval('#kit-secours .onglet', l => l.map(x => x.textContent + (x.classList.contains('actif') ? '*' : '')).join(' | '));
  console.log('[A] bandeau :', await bandeau());
  console.log('[A] onglets :', await onglets());
  const panneau = () => A.evaluate(() => document.querySelector('.kit-panneau').shadowRoot.querySelector('.page-veille').innerText.replace(/\s+/g, ' '));
  console.log('[A] onglet Veille :', (await panneau()).slice(0, 420));

  // ---- copie suivante : précédente gardée, base inchangée
  await A.evaluate(() => window.__KIT__.veilleTic(true)); await A.waitForTimeout(800);
  console.log('[A] 2e copie :', fichiers(), '| événement :', await A.evaluate(() => window.__KIT__.K.veille.evenements.slice(0, 3).map(e => e.txt).join(' / ')));

  // ---- garde-fou : copie anormalement vide refusée, puis écrite à la demande
  G.etat.reponsesEnPlus = 0;   // 7 réponses au lieu de 32
  await A.evaluate(() => window.__KIT__.veilleTic(true)); await A.waitForTimeout(800);
  console.log('[A] copie de 7 lignes : refus =', await A.evaluate(() => window.__KIT__.K.veille.refus && window.__KIT__.K.veille.refus.message), '| lignes en place :', lignesCopie());
  console.log('[A] bandeau :', await bandeau());
  await A.evaluate(() => document.querySelector('.kit-panneau').shadowRoot.querySelector('[data-a=ecrire-refus]').click()); await A.waitForTimeout(800);
  console.log('[A] après « Écrire quand même » : lignes en place :', lignesCopie(), '| précédente :', JSON.parse(fs.readFileSync(path.join(PARTAGE, 'instantane-dossiers.precedent.json'))).tables.Reponses.records.length);
  G.etat.reponsesEnPlus = 25;

  // ---- intervalle et plage horaire (copie non forcée)
  const appelsDossiers = () => R.appels.filter(x => x === 'dossiers').length;
  await A.evaluate(() => Object.assign(window.__KIT__.K.relais, { debut: 0, fin: 24, intervalle: 60 }));
  let n0 = appelsDossiers(); await A.evaluate(() => window.__KIT__.veilleTic()); await A.waitForTimeout(500);
  console.log('[A] copie récente, dans la plage : appel au relais ?', appelsDossiers() > n0);
  vieillir('instantane-dossiers.json', 2);
  n0 = appelsDossiers(); await A.evaluate(() => window.__KIT__.veilleTic()); await A.waitForTimeout(800);
  console.log('[A] copie de 2 h, dans la plage : appel au relais ?', appelsDossiers() > n0, '| lignes :', lignesCopie());
  const h = new Date().getHours(), hors = h < 22 ? { debut: h + 1, fin: h + 2 } : { debut: 0, fin: 1 };
  await A.evaluate(p => Object.assign(window.__KIT__.K.relais, p), hors); vieillir('instantane-dossiers.json', 2);
  n0 = appelsDossiers(); await A.evaluate(() => window.__KIT__.veilleTic()); await A.waitForTimeout(500);
  console.log(`[A] copie de 2 h, hors plage (${hors.debut} h – ${hors.fin} h) : appel au relais ?`, appelsDossiers() > n0, '| bandeau :', (await bandeau()).match(/Copies[^·]*·?[^·]*·? ?hors plage horaire|hors plage horaire/) ? 'hors plage signalé' : '?');
  await A.evaluate(() => Object.assign(window.__KIT__.K.relais, { debut: 0, fin: 24 }));

  // ---- la base change : nouvelle empreinte, base téléchargée, formulaire rechargé d'office en veille
  const avantEtabs = await A.evaluate(() => window.__KIT__.K.base.tables.Etablissements.id.length);
  G.etat.etabsEnPlus = 2;
  await A.evaluate(() => window.__KIT__.veilleTic(true)); await A.waitForTimeout(1200);
  console.log('[A] base :', await A.evaluate(() => window.__KIT__.K.veille.evenements.slice(0, 3).map(e => e.txt).join(' / ')));
  await A.evaluate(() => window.__KIT__.tic()); await A.waitForTimeout(1500);
  console.log('[A] établissements :', avantEtabs, '→', await A.evaluate(() => window.__KIT__.K.base.tables.Etablissements.id.length), '| sans rechargement de la page, dossier :', await A.evaluate(() => window.__KIT__.K.dirEtat), '|', await A.evaluate(() => window.__KIT__.K.veille.evenements[0].txt));
  await A.click('#kit-secours .onglet[data-v=liste]'); await A.waitForTimeout(1500);
  await A.frameLocator('iframe[data-vue=liste]').locator('#periode').selectOption('tout'); await A.waitForTimeout(800);
  console.log('[A] tableau des signalements après la nouvelle base :', (await A.frameLocator('iframe[data-vue=liste]').locator('#etat').innerText()).split('\n')[0]);
  await A.click('#kit-secours .onglet[data-v=veille]'); await A.waitForTimeout(300);

  // ---- panne de Grist (le relais répond 502), puis du relais : passage en mode secours
  G.etat.panne = true;
  for (let k = 0; k < 2; k++) { await A.evaluate(() => window.__KIT__.veilleTic(true)); await A.waitForTimeout(600); }
  console.log('[A] Grist en panne :', await bandeau());
  await R.fermer();
  await A.evaluate(() => window.__KIT__.veilleTic(true)); await A.waitForTimeout(600);
  console.log('[A] relais coupé :', await A.evaluate(() => window.__KIT__.K.veille.erreur));
  await A.evaluate(() => document.querySelector('.kit-panneau').shadowRoot.querySelector('[data-a=mode-secours]').click()); await A.waitForTimeout(1200);
  console.log('[A] après « Passer en mode secours » :', (await bandeau()).slice(0, 60), '| onglets :', await onglets());
  const S = A.frameLocator('iframe[data-vue=saisie]');
  await S.locator('#porte-nouveau').click(); await A.waitForTimeout(300);
  await S.locator('#nom').fill('Jean Moulin'); await A.waitForTimeout(700); await S.locator('#liste [role=option]').first().click(); await A.waitForTimeout(700);
  await S.locator('#description').fill('Saisie pendant la panne'); await S.locator('#btn-signalement').click(); await A.waitForTimeout(1200);
  console.log('[A] saisie en mode secours :', (await S.locator('#confirmation').innerText()).replace(/\s+/g, ' ').slice(0, 70), '| statut :', (await S.locator('#statut-signalement').innerText()).slice(0, 120), '| journal :', await A.evaluate(() => window.__KIT__.K.journal.length));

  // ---- retour du réseau : signalé dans le bandeau
  G.etat.panne = false;
  R = relaisLocal.creer({ port: 8811, reglages: { CLE_KIT: 'clek', API_GRIST: G.url, DOC: G.id, CLE_GRIST: G.cle } });
  await A.evaluate(() => { window.__KIT__.K.veille.ping = 0; return window.__KIT__.veilleTic(); }); await A.waitForTimeout(600);
  console.log('[A] retour du réseau :', (await bandeau()).match(/Grist répond de nouveau[^:]*: réintégrez les saisies/) ? 'signalé' : await bandeau());

  // ---- poste B, sans relais : copies du dossier prises d'office
  const B = await (await browser.newContext({ viewport: { width: 1200, height: 1000 } })).newPage();
  B.on('pageerror', e => console.log('[B] PAGEERROR', e.message)); B.on('dialog', d => d.accept());
  await installer(B, PARTAGE);
  await B.goto(KIT); await B.waitForTimeout(700);
  await B.fill('#kit-secours #agent', 'Agent B'); await B.locator('#kit-secours #agent').dispatchEvent('change');
  await B.evaluate(() => window.__KIT__.connecter(window.__dossierSimule('partage'))); await B.waitForTimeout(1200);
  await B.selectOption('#kit-secours #page', { index: 2 });
  await Promise.all([B.waitForNavigation(), B.click('#kit-secours [data-a=commencer]')]); await B.waitForTimeout(1800);
  await B.evaluate(() => window.__KIT__.connecter(window.__dossierSimule('partage'))); await B.waitForTimeout(800);
  console.log('[B] bandeau :', (await B.textContent('#kit-secours .barre')).replace(/\s+/g, ' ').trim().slice(0, 200));
  console.log('[B] état :', JSON.stringify(await B.evaluate(() => { const K = window.__KIT__.K; return { reponses: K.doc.Reponses.id.length, saisiesDuPosteA: K.doc.Reponses.Description.filter(d => d === 'Saisie pendant la panne').length, reintegrees: [...K.reintegrees], mode: K.mode, ecritPar: K.complement && K.complement.info.ecrit_par }; })));
  await A.screenshot({ path: path.join(__C.sorties, 'veille-A.png') });
  await browser.close(); await R.fermer(); await G.fermer();
})();
