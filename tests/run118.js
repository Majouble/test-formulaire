// Formulaire par site (ESR), 2.50 :
// 1. reprise limitée au dernier dossier de l'établissement (mis à jour le plus récemment), dans sa dernière version ;
//    les sites de dossiers plus anciens ne reviennent plus ; ceux en RAS sont repris pour mémoire ;
// 2. suppression d'un site saisi à tort dans un dossier : à l'enregistrement, il disparaît de toutes les étapes du
//    dossier (colonne de la question) et de la table dédiée (toutes versions) ; un autre site du même dossier reste ;
// 3. le lendemain, la reprise ne propose plus le site supprimé.
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs');
const { docSites } = require('./run78');
async function ouvrir(browser, doc, jour, opts) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1400 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  page.on('dialog', d => { console.log('DIALOG :', d.message().replace(/\n+/g, ' | ').slice(0, 200)); d.accept(); });
  await page.clock.setSystemTime(new Date(jour));
  await page.route('**/grist-plugin-api.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.__DOC__=${JSON.stringify(doc)};window.__OPTS__=${JSON.stringify(opts)};` + fs.readFileSync('mock.js') + fs.readFileSync('fakeapi.js') + fs.readFileSync('mock-saisie.js') }));
  await page.goto('file://' + __C.racine + '/v2/saisie/index.html'); await page.waitForTimeout(1500);
  return page;
}
const sitesRepris = page => page.$$eval('.ligne-rep', l => l.map(x => { const t = x.querySelector('.site-txt'); return (t ? t.value : '?') + ' [' + ((x.querySelector('.repris strong') || {}).textContent || '') + ']'; }).join(' | ') || '(aucun)');
(async () => {
  const opts = { formulaire: 'Signalements', libelle: 'Alice', perimetre: { Academie: ['Versailles'] } };
  const browser = await chromium.launch({ executablePath: __C.chromium });
  let doc = docSites();
  // dossier du 22/10 : première étape site 3 (Villejean) + site 2 (Beaulieu) ; deuxième étape site 4 (Lorient, saisi à tort) + site 2
  { const R = doc.__data.Reponses, ids = R.id.filter((_, i) => /"_id":"[ef]"/.test(R.Detail_des_sites[i]));
    R.Detail_des_sites[R.id.indexOf(ids[0])] = JSON.stringify([{ _id: 'e', Site: 3, Qualification: 'Rassemblement' }, { _id: 'g', Site: 2, Qualification: 'Blocage partiel' }]);
    R.Detail_des_sites[R.id.indexOf(ids[1])] = JSON.stringify([{ _id: 'f', Site: 4, Qualification: 'Blocage total' }, { _id: 'g', Site: 2, Qualification: 'Blocage partiel' }]);
    const S = doc.__data.Sites_signales; let n = 0;
    const aj = (d, v, lid, site, q, m) => { S.id.push(++n); S.Dossier.push(d); S.Version.push(v); S.Ligne_id.push(lid); S.Ordre.push(1); S.Mouvement.push(m); S.Site.push(site); S.Site_libre.push(''); S.Qualification.push(q); S.Precisions.push(''); };
    aj(ids[0], ids[0], 'e', 3, 'Rassemblement', 'Ajout'); aj(ids[0], ids[0], 'g', 2, 'Blocage partiel', 'Ajout');
    aj(ids[0], ids[1], 'e', 3, 'Rassemblement', 'Retrait'); aj(ids[0], ids[1], 'f', 4, 'Blocage total', 'Ajout'); aj(ids[0], ids[1], 'g', 2, 'Blocage partiel', 'Inchangée');
    doc.__d3 = ids; }
  const d3 = doc.__d3[0];

  // 1. reprise : seuls les sites de la dernière version du dossier du 22/10 (Lorient, Beaulieu) ; ni Campus centre, ni Villejean, ni les anciens libellés
  let page = await ouvrir(browser, doc, '2026-10-23T10:00:00+02:00', opts);
  await page.click('#porte-nouveau'); await page.waitForTimeout(400);
  await page.fill('#nom', 'Jean Moulin'); await page.waitForTimeout(700); await page.click('#liste [role=option] >> nth=0'); await page.waitForTimeout(600);
  console.log('REPRISE (avant suppression) :', await sitesRepris(page));
  console.log('NOTE :', await page.$eval('.lignes-rep', e => (e.parentElement.querySelector('.note') || {}).textContent || '(aucune)'));
  // reprise d'un signalement choisi dans la proposition : ses propres sites
  const prop = await page.$$eval('#proposition-encours [data-reprendre]', l => l.map(b => b.textContent.trim() + ' #' + b.dataset.reprendre).join(' | '));
  console.log('PROPOSITION :', prop);
  const d2 = await page.evaluate(() => { const R = window.__DOC__.__data.Reponses; return R.id.find((id, i) => /"_id":"c"/.test(R.Detail_des_sites[i]) && R.Dossier[i] === id); });
  if (await page.$(`#proposition-encours [data-reprendre="${d2}"]`)) {
    await page.click(`#proposition-encours [data-reprendre="${d2}"]`); await page.waitForTimeout(800);
    console.log(`REPRISE DU DOSSIER CHOISI (${d2}, 21/10) :`, await sitesRepris(page));
  }
  await page.close();

  // 2. suppression de Lorient dans le dossier du 22/10, puis mise à jour
  page = await ouvrir(browser, doc, '2026-10-23T10:00:00+02:00', opts);
  await page.evaluate(id => ouvrirDepuisListe(id), d3); await page.waitForTimeout(1500);
  console.log('DOSSIER OUVERT :', await sitesRepris(page));
  console.log('BOUTONS (ligne 1) :', await page.$$eval('.ligne-rep >> nth=0', l => [...l[0].querySelectorAll('.actions-ligne button')].map(b => b.dataset.action).join(', ')).catch(async () => await page.$eval('.ligne-rep', e => [...e.querySelectorAll('.actions-ligne button')].map(b => b.dataset.action).join(', '))));
  await page.click('.ligne-rep >> nth=0 >> [data-action=supprimer-site]'); await page.waitForTimeout(300);
  console.log('APRÈS 🗑 :', await sitesRepris(page), '| note :', await page.$eval('.note.supprimes', e => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => '(aucune)'));
  // annuler puis refaire
  await page.click('[data-action=annuler-supprimes]'); await page.waitForTimeout(200);
  console.log('APRÈS ANNULATION :', await sitesRepris(page));
  await page.click('.ligne-rep >> nth=0 >> [data-action=supprimer-site]'); await page.waitForTimeout(300);
  await page.fill('#commentaire', 'Lorient saisi par erreur').catch(() => {});
  await page.click('#btn-signalement'); await page.waitForTimeout(2000);
  console.log('STATUT :', (await page.textContent('#statut-signalement')).trim());
  const etat = await page.evaluate(id => { const D = window.__DOC__.__data, R = D.Reponses, S = D.Sites_signales;
    return { versions: R.id.map((x, i) => R.Dossier[i] === id ? `${x}: ${R.Detail_des_sites[i]}` : null).filter(Boolean),
      table: S.id.map((x, i) => S.Dossier[i] === id ? `v${S.Version[i]} ${S.Ligne_id[i]} site ${S.Site[i]} ${S.Mouvement[i]}` : null).filter(Boolean) }; }, d3);
  console.log('ÉTAPES DU DOSSIER :\n  ' + etat.versions.join('\n  '));
  console.log('TABLE DÉDIÉE :\n  ' + etat.table.join('\n  '));
  console.log('LORIENT ENCORE PRÉSENT ?', etat.versions.some(v => /"Site":4/.test(v)) || etat.table.some(t => / site 4 /.test(t)));
  doc = await page.evaluate(() => window.__DOC__);
  await page.close();

  // 3. le lendemain : la reprise propose Beaulieu seul (dernier dossier mis à jour), plus Lorient
  page = await ouvrir(browser, doc, '2026-10-24T10:00:00+02:00', opts);
  await page.click('#porte-nouveau'); await page.waitForTimeout(400);
  await page.fill('#nom', 'Jean Moulin'); await page.waitForTimeout(700); await page.click('#liste [role=option] >> nth=0'); await page.waitForTimeout(600);
  console.log('REPRISE (lendemain) :', await sitesRepris(page));
  await page.close();
  await browser.close();
})();
