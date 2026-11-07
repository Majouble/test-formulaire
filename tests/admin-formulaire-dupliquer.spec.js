// Administration › Formulaires : dupliquer un formulaire (boîte « Dupliquer », nom, même table, brouillon copié, rien de publié)
const o = require('./admin-formulaires-outils');
(async () => {
  const { browser, page } = await o.ouvrir(o.doc0());
  await page.waitForSelector('#choix-formulaire option', { state: 'attached' });
  const liste = () => page.$$eval('#choix-formulaire option', l => l.map(x => x.textContent + (x.selected ? ' ✓' : '')).join(' | '));
  const sans = b => JSON.stringify(b, (k, v) => k === 'id' ? undefined : v);
  // formulaire source : deux questions dont une conditionnelle, un titre, publié
  await o.ajouter(page, 'choix', 'Nature des faits');
  page.reponsesPrompt.push('Intrusion');
  await page.click('#pa-ajout-choix'); await o.calme(page);
  await o.ajouter(page, 'titre', 'Détails'); await o.ajouter(page, 'long', 'Précisions');
  await page.click('#pa-oblig'); await page.selectOption('#pc-col', 'Nature_des_faits'); await page.check('.valeurs-c input[value="Intrusion"]'); await o.calme(page);
  await page.click('#btn-publier'); await page.waitForFunction(() => /à jour/.test(document.querySelector('#etat-publi').textContent)); await o.calme(page);
  const src = await o.ligneF(page, 'Signalements');
  console.log('SOURCE :', await liste(), '|', await o.texte(page, '#infos'), '|', await o.texte(page, '#etat-publi'));
  const tablesAvant = await page.evaluate(() => window.__DOC__._grist_Tables.tableId.join(','));
  const colsAvant = JSON.stringify(await o.colonnes(page, 'Reponses'));
  // boîte de duplication
  await page.click('#btn-dupliquer'); await page.waitForSelector('#dlg-nouveau[open]');
  console.log('BOÎTE :', await o.texte(page, '#dlg-titre'), '| nom proposé :', await page.inputValue('#nf-nom'), '| bouton :', await o.texte(page, '#nf-valider'));
  console.log('CHAMPS VISIBLES :', await page.evaluate(() => ['nf-bloc-modele', 'nf-bloc-type', 'nf-bloc-table', 'nf-bloc-nouvelle', 'nf-bloc-etab', 'nf-bloc-options', 'nf-bloc-import'].filter(i => !document.getElementById(i).hidden).join(', ') || '(aucun)'));
  // nom déjà pris
  await page.fill('#nf-nom', 'Signalements'); await page.click('#nf-valider'); await page.waitForTimeout(600);
  console.log('NOM PRIS : boîte ouverte =', await page.$eval('#dlg-nouveau', d => d.open), '| erreur :', await o.texte(page, '#nf-erreur'));
  await page.fill('#nf-nom', 'Signalements intrusion'); await page.click('#nf-valider');
  await page.waitForFunction(() => document.querySelector('#choix-formulaire').selectedOptions[0].textContent === 'Signalements intrusion'); await o.calme(page);
  console.log('LISTE APRÈS :', await liste());
  console.log('NOUVEAU :', await o.texte(page, '#infos'), '|', await o.texte(page, '#etat-publi'), '| Publier désactivé :', await page.isDisabled('#btn-publier'));
  console.log('MESSAGE :', await o.texte(page, '#msg-global').catch(() => '(aucun)'));
  console.log('APERÇU :', (await o.texte(page, '#apercu')).replace(/^.*?\| Qualification \* /, '… Qualification * ').replace(/ \| 3 \| Description.*$/, ''));
  const cop = await o.ligneF(page, 'Signalements intrusion'), ori = await o.ligneF(page, 'Signalements');
  console.log('COPIE : Table =', cop.Table, '| Type =', cop.Type, '| Publie =', cop.Publie, '| Publie_le =', cop.Publie_le ?? null);
  console.log('BROUILLON COPIÉ = BROUILLON SOURCE (hors identifiants) :', sans(cop.Brouillon) === sans(ori.Brouillon), '| identifiants de blocs distincts :', cop.Brouillon.blocs.every(b => !ori.Brouillon.blocs.some(x => x.id === b.id)));
  cop.Brouillon.blocs.forEach(b => console.log(' ', JSON.stringify({ genre: b.genre, colonne: b.colonne, texte: b.texte, reglages: b.reglages })));
  console.log('SOURCE INCHANGÉE (Publie = Brouillon) :', sans(ori.Publie) === sans(ori.Brouillon), '| TABLES INCHANGÉES :', tablesAvant === await page.evaluate(() => window.__DOC__._grist_Tables.tableId.join(',')), '| COLONNES INCHANGÉES :', colsAvant === JSON.stringify(await o.colonnes(page, 'Reponses')));
  console.log('PARTIES / RÔLES COPIÉS :', sans(cop.Brouillon.parties) === sans(ori.Brouillon.parties), sans(cop.Brouillon.roles) === sans(ori.Brouillon.roles));
  // la copie est indépendante : modifier la copie ne touche pas la source
  await o.ajouter(page, 'bool', 'Police prévenue'); await o.calme(page);
  console.log('APRÈS MODIFICATION DE LA COPIE : copie =', (await o.ligneF(page, 'Signalements intrusion')).Brouillon.blocs.length, 'blocs | source =', (await o.ligneF(page, 'Signalements')).Brouillon.blocs.length, 'blocs |', await o.texte(page, '#etat-publi'));
  await browser.close();
})();
