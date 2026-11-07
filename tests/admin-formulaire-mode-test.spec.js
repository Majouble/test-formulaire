// Administration › Formulaires : mode test (« ▶ Tester »), questions conditionnelles qui apparaissent / disparaissent,
// choix contenant une virgule et condition sur un texte contenant une virgule (comportement actuel figé)
const o = require('./admin-formulaires-outils');
(async () => {
  const { browser, page } = await o.ouvrir(o.doc0());
  await page.waitForSelector('#choix-formulaire option', { state: 'attached' });
  const bloc = lib => page.locator('#apercu .bloc:not(.commun)', { hasText: lib }).first();
  const condition = async (lib, col) => { await bloc(lib).click(); await page.selectOption('#pc-col', col); await page.waitForSelector('#pc-op'); };
  // préparation (mode édition) : une question à choix dont un choix contient une virgule, et quatre questions conditionnelles
  await o.ajouter(page, 'choix', 'Nature des faits');
  page.reponsesPrompt.push('Intrusion, effraction', 'Violence');
  await page.click('#pa-ajout-choix'); await o.calme(page); await page.click('#pa-ajout-choix'); await o.calme(page);
  await o.ajouter(page, 'court', 'Lieu'); await o.ajouter(page, 'bool', 'Police prévenue');
  await o.ajouter(page, 'long', 'Détail violence'); await o.ajouter(page, 'long', 'Détail intrusion'); await o.ajouter(page, 'long', 'Détail lieu'); await o.ajouter(page, 'long', 'Suites police'); await o.ajouter(page, 'long', 'Détail intrusion ou violence');
  await condition('Détail violence', 'Nature_des_faits'); await page.check('.valeurs-c input[value="Violence"]');
  await condition('Détail intrusion', 'Nature_des_faits'); await page.check('.valeurs-c input[value="Intrusion, effraction"]');
  await condition('Détail lieu', 'Lieu'); await page.selectOption('#pc-op', '='); await page.fill('#pc-val', 'Salle 1, Salle 2');
  await condition('Suites police', 'Police_prevenue');
  await condition('Détail intrusion ou violence', 'Nature_des_faits'); await page.check('.valeurs-c input[value="Violence"]'); await page.check('.valeurs-c input[value="Intrusion, effraction"]');
  await o.calme(page);
  const brouillon = (await o.ligneF(page, 'Signalements')).Brouillon.blocs.filter(b => b.reglages && b.reglages.condition);
  console.log('CONDITIONS POSÉES :'); brouillon.forEach(b => console.log(' ', b.reglages.libelle, '->', JSON.stringify(b.reglages.condition)));
  console.log('PASTILLES DE CONDITION :', await page.$$eval('#apercu .pastille-cond', l => l.map(e => e.textContent).join(' ; ')));
  // mode test
  const ecrit = () => page.evaluate(() => JSON.stringify(window.__DOC__.__data.Formulaires.Brouillon));
  const avant = await ecrit();
  await page.click('#btn-tester'); await page.waitForSelector('#app.test');
  console.log('BOUTON :', await o.texte(page, '#btn-tester'), '| aria-pressed =', await page.getAttribute('#btn-tester', 'aria-pressed'));
  console.log('PANNEAU :', await o.texte(page, '#panneau'));
  console.log('OUTILS D\'ÉDITION PRÉSENTS :', await page.locator('#apercu [data-ajout], #apercu .outils').count());
  const visibles = async t => console.log(t.padEnd(44), '| visibles :', await page.$$eval('#apercu .bloc:not(.commun):not(.masque-test)', l => l.map(b => b.getAttribute('aria-label').replace(/^[^:]*: /, '')).join(' / ')));
  await visibles('DÉBUT');
  const repondre = async v => { await page.locator('label.choix', { hasText: new RegExp('^\\s*' + v + '\\s*$') }).click(); await page.waitForTimeout(150); };
  await repondre('Violence'); await visibles('NATURE = Violence');
  await repondre('Intrusion, effraction'); await visibles('NATURE = Intrusion, effraction (choix à virgule)');
  await repondre('Option 1'); await visibles('NATURE = Option 1');
  await page.fill('#apercu input[type=text]:not(#test-etab) >> nth=0', 'Salle 1'); await visibles('LIEU = Salle 1');
  await page.fill('#apercu input[type=text]:not(#test-etab) >> nth=0', 'Salle 2'); await visibles('LIEU = Salle 2');
  await page.fill('#apercu input[type=text]:not(#test-etab) >> nth=0', 'Salle 1, Salle 2'); await visibles('LIEU = Salle 1, Salle 2 (saisie avec virgule)');
  await page.locator('label.choix', { hasText: /Oui/ }).first().click().catch(() => {}); await page.waitForTimeout(150);
  await visibles('POLICE PRÉVENUE = Oui');
  await repondre('Violence');
  console.log('DESCRIPTION :', await page.$eval('#test-description', e => e.value).catch(() => '(absente)'));
  console.log('BROUILLON MODIFIÉ PAR LE TEST :', (await ecrit()) !== avant);
  await page.click('#btn-fin-test'); await page.waitForSelector('#app:not(.test)');
  console.log('RETOUR ÉDITION :', await o.texte(page, '#btn-tester'), '| outils présents :', await page.locator('#apercu [data-ajout]').count() > 0, '| masqués restants :', await page.locator('#apercu .masque-test').count());
  await browser.close();
})();
