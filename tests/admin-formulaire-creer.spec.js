// Administration › Formulaires : créer un nouveau formulaire (boîte « Nouveau », nouvelle table, référentiel), liste, aperçu initial, document écrit
const o = require('./admin-formulaires-outils');
(async () => {
  const { browser, page } = await o.ouvrir(o.doc0());
  await page.waitForSelector('#choix-formulaire option', { state: 'attached' });
  const liste = () => page.$$eval('#choix-formulaire option', l => l.map(x => x.textContent + (x.selected ? ' ✓' : '')).join(' | '));
  console.log('LISTE AVANT :', await liste());
  await page.click('#btn-nouveau'); await page.waitForSelector('#dlg-nouveau[open]');
  console.log('BOÎTE :', await o.texte(page, '#dlg-titre'), '| modèle :', await page.$eval('#nf-modele', e => e.value || '(vierge)'), '| table :', await page.$eval('#nf-table', e => e.value));
  console.log('TABLES PROPOSÉES :', await page.$$eval('#nf-table option', l => l.map(x => x.value).join(', ')), '| RÉFÉRENTIELS :', await page.$$eval('#nf-etab option', l => l.map(x => x.value).join(', ')));
  // validation sans nom : refusée par le champ obligatoire
  await page.click('#nf-valider'); await page.waitForTimeout(300);
  console.log('SANS NOM : boîte ouverte =', await page.$eval('#dlg-nouveau', d => d.open), '| liste :', await liste());
  await page.fill('#nf-nom', 'Intrusions');
  console.log('NOUVELLE TABLE (proposée) :', await page.isVisible('#nf-bloc-nouvelle'), await page.$eval('#nf-nouvelle', e => JSON.stringify(e.value)));
  await page.selectOption('#nf-table', '__nouvelle__'); await page.waitForSelector('#nf-bloc-nouvelle', { state: 'visible' });
  console.log('NOUVELLE TABLE (après choix) :', await page.$eval('#nf-nouvelle', e => JSON.stringify(e.value)), '| référentiel visible :', await page.isVisible('#nf-etab'), '| options :', await page.isVisible('#nf-bloc-options'));
  await page.fill('#nf-nouvelle', 'Intrusions_rep');
  await page.selectOption('#nf-etab', 'Etablissements');
  console.log('RÉFÉRENTIEL :', await page.$eval('#nf-etab', e => e.value), '| site :', await page.isChecked('#nf-site'), '| clos :', await page.isChecked('#nf-clos'), '| import :', await page.isChecked('#nf-import'));
  await page.click('#nf-valider');
  await page.waitForFunction(() => document.querySelector('#choix-formulaire').selectedOptions[0].textContent === 'Intrusions');
  await page.waitForFunction(() => /Intrusions_rep/.test(document.querySelector('#infos').textContent));
  await page.waitForTimeout(800);
  console.log('LISTE APRÈS :', await liste());
  console.log('EN-TÊTE :', await o.texte(page, '#infos'), '| état :', await o.texte(page, '#etat-publi'));
  console.log('APERÇU :', await o.texte(page, '#apercu'));
  console.log('PANNEAU :', await o.texte(page, '#panneau'));
  const f = await o.ligneF(page, 'Intrusions');
  console.log('FORMULAIRES :', JSON.stringify({ Nom: f.Nom, Table: f.Table, Type: f.Type, Publie: f.Publie, brouillon_blocs: f.Brouillon.blocs, parties: f.Brouillon.parties, roles: f.Brouillon.roles, autres: Object.keys(f.Brouillon).join(',') }));
  console.log('TABLES :', await page.evaluate(() => window.__DOC__._grist_Tables.tableId.join(', ')));
  console.log('COLONNES Intrusions_rep :', JSON.stringify(await o.colonnes(page, 'Intrusions_rep')));
  const lignes = await page.evaluate(() => Object.keys(window.__DOC__.__data.Formulaires).map(k => k + '=' + window.__DOC__.__data.Formulaires[k].length).join(' '));
  console.log('NB LIGNES Formulaires :', lignes);
  // second formulaire sur une table existante, référentiel par défaut
  await page.click('#btn-nouveau'); await page.waitForSelector('#dlg-nouveau[open]');
  await page.fill('#nf-nom', 'Sur existante'); await page.selectOption('#nf-table', 'Reponses'); await page.waitForTimeout(300);
  console.log('TABLE EXISTANTE : référentiel proposé =', await page.$eval('#nf-etab', e => e.value), '| info :', await page.$eval('#nf-etab-info', e => e.hidden ? '(masquée)' : e.innerText), '| bloc nouvelle visible :', await page.isVisible('#nf-bloc-nouvelle'));
  // nom déjà pris
  await page.fill('#nf-nom', 'Signalements'); await page.click('#nf-valider'); await page.waitForTimeout(800);
  console.log('NOM PRIS : boîte ouverte =', await page.$eval('#dlg-nouveau', d => d.open), '| erreur :', await o.texte(page, '#nf-erreur'));
  await page.click('#nf-annuler'); await page.waitForTimeout(300);
  console.log('ANNULÉ : boîte ouverte =', await page.$eval('#dlg-nouveau', d => d.open), '| liste :', await liste());
  await browser.close();
})();
