// Administration › Formulaires : ajouter des questions de plusieurs types, régler libellé / obligatoire / nombre / choix,
// titre et texte d'information, déplacer (boutons et Alt+flèches), condition d'affichage
const o = require('./admin-formulaires-outils');
(async () => {
  const { browser, page } = await o.ouvrir(o.doc0());
  await page.waitForSelector('#choix-formulaire option', { state: 'attached' });
  const panneau = async t => console.log(t, '| PANNEAU :', (await o.texte(page, '#panneau')).replace(/^← Réglages du formulaire \| /, ''));
  const ordre = () => page.$$eval('#apercu [data-section-feuille="q"] .bloc', l => l.map(b => b.getAttribute('aria-label')).join(' / '));
  const bloc = lib => page.locator('#apercu .bloc', { hasText: lib }).first();
  console.log('MENU D\'AJOUT :'); await page.$$eval('[data-section-feuille="q"] [data-ajout]', l => l[l.length - 1].click());
  console.log(await o.texte(page, '#menu-ajout')); await page.keyboard.press('Escape');
  await page.click('#menu-ajout [data-menu=annuler]', { timeout: 500 }).catch(() => {});
  // texte court
  await o.ajouter(page, 'court', 'Nom du témoin'); await panneau('TEXTE COURT');
  await page.fill('#pa-libelle', 'Témoin principal'); await page.press('#pa-libelle', 'Tab');
  await page.check('#pa-oblig'); await o.calme(page);
  console.log('LIBELLÉ + OBLIGATOIRE : aperçu =', await o.texte(page, '#apercu .bloc.choisi'), '| panneau titre =', await o.texte(page, '#panneau h2'));
  // choix unique avec ses choix (prompt pour l'ajout, renommage, suppression)
  await o.ajouter(page, 'choix', 'Nature des faits');
  page.reponsesPrompt.push('Intrusion', 'Autre');
  await page.click('#pa-ajout-choix'); await o.calme(page); await page.click('#pa-ajout-choix'); await o.calme(page);
  await page.fill('#pa-choix .choix-edit >> nth=0 >> input[type=text]', 'Violence'); await page.press('#pa-choix .choix-edit >> nth=0 >> input[type=text]', 'Tab'); await o.calme(page);
  await page.click('#pa-choix .choix-edit >> nth=1 >> [data-ch=suppr]'); await o.calme(page);
  await page.selectOption('#pa-affichage', 'liste'); await o.calme(page);
  console.log('CHOIX :', await page.$$eval('#pa-choix .choix-edit input[type=text]', l => l.map(x => x.value).join(' | ')));
  // nombre avec minimum et maximum
  await o.ajouter(page, 'nombre', 'Nombre de blessés');
  await page.fill('#pa-min', '0'); await page.press('#pa-min', 'Tab'); await page.fill('#pa-max', '50'); await page.press('#pa-max', 'Tab'); await o.calme(page);
  console.log('NOMBRE : min =', await page.inputValue('#pa-min'), '| max =', await page.inputValue('#pa-max'), '| type :', await page.$$eval('[data-num]', l => l.map(b => b.textContent + '=' + b.getAttribute('aria-pressed')).join(' ')));
  await page.click('[data-num=Numeric]'); await o.calme(page); await page.click('[data-num=Int]'); await o.calme(page);
  // oui / non, titre, texte d'information
  await o.ajouter(page, 'bool', 'Police prévenue'); await o.ajouter(page, 'titre', 'Suites données'); await o.ajouter(page, 'info', "Merci de joindre le rapport\nau dossier.");
  await o.ajouter(page, 'long', 'Précisions');
  console.log('APERÇU :', await o.texte(page, '#apercu'));
  console.log('ORDRE :', await ordre());
  // déplacement : bouton « Monter », puis Alt + ↓ au clavier
  await bloc('Police prévenue').hover(); await bloc('Police prévenue').locator('[data-act=haut]').click(); await o.calme(page);
  console.log('APRÈS MONTER Police prévenue :', await ordre());
  await bloc('Témoin principal').focus(); await page.keyboard.press('Alt+ArrowDown'); await o.calme(page);
  console.log('APRÈS Alt+↓ Témoin principal :', await ordre());
  // condition : Précisions s'affiche si Nature des faits est « Intrusion »
  await bloc('Précisions').click(); await page.selectOption('#pc-col', 'Nature_des_faits'); await page.waitForSelector('#pc-op');
  console.log('CONDITION (opérateurs) :', await page.$$eval('#pc-op option', l => l.map(x => x.value + '=' + x.textContent).join(' | ')), '| valeurs :', await page.$$eval('.valeurs-c label', l => l.map(x => x.textContent.trim()).join(' | ')));
  await page.check('.valeurs-c input[value="Intrusion"]'); await o.calme(page);
  console.log('APERÇU Précisions :', await o.texte(page, '#apercu .bloc.choisi'));
  // second type de condition : nombre
  await bloc('Nombre de blessés').click(); await page.selectOption('#pc-col', 'Nature_des_faits'); await page.selectOption('#pc-op', '!='); await page.check('.valeurs-c input[value="Violence"]'); await o.calme(page);
  await bloc('Suites données').click(); await o.calme(page); console.log('PANNEAU TITRE :', await o.texte(page, '#panneau'));
  await o.calme(page);
  const f = await o.ligneF(page, 'Signalements');
  console.log('BROUILLON :'); f.Brouillon.blocs.forEach(b => console.log(' ', JSON.stringify({ genre: b.genre, colonne: b.colonne, section: b.section, texte: b.texte, reglages: b.reglages })));
  console.log('PUBLIÉ INCHANGÉ :', JSON.stringify(f.Publie.blocs));
  const cols = (await o.colonnes(page, 'Reponses')).filter(c => !['Date_faits', 'Cree_le', 'Nature', 'Qualification', 'Description', 'Etablissement', 'Dossier', 'Derniere_version'].includes(c.colId));
  console.log('COLONNES CRÉÉES :'); cols.forEach(c => console.log(' ', JSON.stringify(c)));
  await browser.close();
})();
