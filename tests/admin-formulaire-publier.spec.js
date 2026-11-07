// Administration › Formulaires : publier (état, colonne Publie, Publie_le), puis modifier le brouillon (état « modifié depuis la publication »)
const o = require('./admin-formulaires-outils');
(async () => {
  const { browser, page } = await o.ouvrir(o.doc0());
  await page.waitForSelector('#choix-formulaire option', { state: 'attached' });
  const etat = async t => console.log(t, '| ÉTAT :', await o.texte(page, '#etat-publi'), '| classe :', await page.getAttribute('#etat-publi', 'class'), '| Publier désactivé :', await page.isDisabled('#btn-publier'));
  console.log('FORMULAIRE EXISTANT'); await etat('Signalements');
  // nouveau formulaire sur une nouvelle table, avec une question dont le libellé change
  await page.click('#btn-nouveau'); await page.waitForSelector('#dlg-nouveau[open]');
  await page.fill('#nf-nom', 'Publication'); await page.selectOption('#nf-table', '__nouvelle__'); await page.fill('#nf-nouvelle', 'Publication_rep'); await page.selectOption('#nf-etab', 'Etablissements');
  await page.click('#nf-valider'); await page.waitForFunction(() => /Publication_rep/.test(document.querySelector('#infos').textContent)); await o.calme(page);
  await o.ajouter(page, 'court', 'Observations');
  await page.fill('#pa-libelle', 'Remarques du directeur'); await page.press('#pa-libelle', 'Tab'); await o.calme(page);
  await etat('AVANT PUBLICATION');
  const pages = async t => { await page.click('#panneau button:has-text("Réglages du formulaire")', { timeout: 800 }).catch(() => {}); await o.calme(page); console.log(t, ':', (await o.texte(page, '#panneau')).replace(/^.*PAGES DE SAISIE DES AGENTS \| /, '').replace(/ \| COLONNES DE LA TABLE.*$/, '').slice(0, 250)); };
  let f = await o.ligneF(page, 'Publication');
  console.log('AVANT : Publie =', f.Publie, '| Publie_le =', f.Publie_le ?? null, '| blocs du brouillon =', f.Brouillon.blocs.length);
  await pages('PANNEAU AVANT (pages de saisie)');
  await page.click('#btn-publier'); await page.waitForFunction(() => /à jour/.test(document.querySelector('#etat-publi').textContent)); await o.calme(page);
  await etat('APRÈS PUBLICATION');
  console.log('MESSAGE :', await o.texte(page, '#msg-global').catch(() => '(aucun)'));
  f = await o.ligneF(page, 'Publication');
  console.log('PUBLIE : parties =', f.Publie.parties.map(p => p.id + ':' + p.role).join(','), '| roles =', JSON.stringify(f.Publie.roles));
  console.log('PUBLIE : blocs =', JSON.stringify(f.Publie.blocs.map(b => ({ genre: b.genre, colonne: b.colonne, section: b.section, reglages: b.reglages }))));
  console.log('PUBLIE = BROUILLON :', JSON.stringify(f.Publie) === JSON.stringify(f.Brouillon), '| Publie_le renseigné :', typeof f.Publie_le === 'number' && f.Publie_le > 0);
  console.log('EN-TÊTE DE COLONNE (libellé publié) :', await page.evaluate(() => { const D = window.__DOC__, C = D._grist_Tables_column; const k = C.colId.indexOf('Observations'); const k2 = C.colId.indexOf('Remarques_du_directeur'); return 'Observations@' + k + ' Remarques_du_directeur@' + k2 + (C.label ? ' label=' + (C.label[k >= 0 ? k : k2]) : ''); }));
  await pages('PANNEAU APRÈS (pages de saisie)');
  // modifier le brouillon : 1 modification, puis 2
  await o.ajouter(page, 'bool', 'Police prévenue'); await o.calme(page);
  await etat('APRÈS AJOUT D\'UNE QUESTION');
  f = await o.ligneF(page, 'Publication');
  console.log('BROUILLON blocs =', f.Brouillon.blocs.length, '| PUBLIE blocs =', f.Publie.blocs.length);
  await page.fill('#pa-libelle', 'Police alertée'); await page.press('#pa-libelle', 'Tab'); await o.calme(page);
  await etat('APRÈS CHANGEMENT DE LIBELLÉ');
  // publier à nouveau
  await page.click('#btn-publier'); await page.waitForFunction(() => /à jour/.test(document.querySelector('#etat-publi').textContent)); await o.calme(page);
  f = await o.ligneF(page, 'Publication');
  await etat('REPUBLIÉ'); console.log('PUBLIE blocs =', f.Publie.blocs.map(b => b.reglages.libelle).join(' / '));
  // retour sur le formulaire d'origine (publié, à jour : bouton inactif)
  await page.selectOption('#choix-formulaire', { label: 'Signalements' }); await o.calme(page);
  await etat('RETOUR SUR Signalements');
  await browser.close();
})();
