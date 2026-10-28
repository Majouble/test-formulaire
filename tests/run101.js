// Kit de secours : formules de suivi recalculées pour les lignes du mode secours (dernière version du dossier, état le plus
// grave, jours de mobilisation — formules du socle et variante MESRE), et reprises par le tableau de bord.
// Prérequis : node ../outils/construire-secours.js
const __C = require('./chemins');
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const { docSites } = require('./run78');
const KIT = 'file://' + __C.racine + '/v2/secours/kit-secours.html';

const ENTETES = ['import datetime', 'def jour(r):', '  d = r.Date_faits or r.Cree_le', '  return d.date() if isinstance(d, datetime.datetime) else d',
  'def qualifs(r):', '  q = r.Qualification', '  liste = list(q) if isinstance(q, (list, tuple)) else ([q] if q else [])',
  '  return [str(x).strip() for x in liste if str(x).strip() and str(x).strip().upper() != "RAS"]'];
const F = {   // textes produits par le socle (installation) et formule de dernière version du document MESRE
  Etat_plus_grave: [...ENTETES, '# du plus grave au moins grave : à ajuster si l\'ordre des choix change', 'ORDRE = ["Blocage total","Blocage partiel","Rassemblement"]', 'j = jour(rec)',
    'if not $Etablissement or not j:', '  return None', 'vus = {}', 'for r in Reponses.lookupRecords(Etablissement=$Etablissement):', '  d = jour(r)', '  if d and d <= j:',
    '    for q in qualifs(r):', '      vus[q] = max(vus.get(q, d), d)', 'if not vus:', '  return None', 'def rang(item):', '  q, d = item',
    '  return (ORDRE.index(q) if q in ORDRE else len(ORDRE), -d.toordinal(), q)', 'return sorted(vus.items(), key=rang)[0][0]'].join('\n'),
  Nb_jours_mobilisation: [...ENTETES, 'j = jour(rec)', 'if not $Etablissement or not j or not qualifs(rec):', '  return None',
    'jours = {jour(r) for r in Reponses.lookupRecords(Etablissement=$Etablissement) if qualifs(r)}', 'return len([d for d in jours if d and d <= j])'].join('\n'),
  Derniere_version_esr: ['def cle(r):', '  saisie = r.Cree_le.timestamp() if r.Cree_le else 0', '  if r.Date_faits:', '    faits = r.Date_faits.toordinal()', '  else:',
    '    faits = r.Cree_le.date().toordinal() if r.Cree_le else 0', '  return (faits, saisie, r.id)', '', 'dossier = $Dossier.id or $id',
    'versions = list(Reponses.lookupRecords(Dossier=dossier)) or [rec]', 'return max(versions, key=cle).id == $id'].join('\n'),
};
function base() {
  const d = docSites(), T = d._grist_Tables, C = d._grist_Tables_column, R = d.__data.Reponses, ref = T.id[T.tableId.indexOf('Reponses')];
  const ajout = (id, type, formule) => { const n = Math.max(...C.id) + 1; for (const k of Object.keys(C)) C[k].push(k === 'id' ? n : k === 'parentId' ? ref : k === 'colId' || k === 'label' ? id : k === 'type' ? type : k === 'isFormula' ? true : k === 'formula' ? formule : ''); R[id] = R.id.map(() => null); };
  ajout('Etat_plus_grave', 'Choice', F.Etat_plus_grave); ajout('Nb_jours_mobilisation', 'Int', F.Nb_jours_mobilisation); ajout('Derniere_version_esr', 'Bool', F.Derniere_version_esr);
  // valeurs « de Grist » pour les lignes existantes : toutes en dernière version (le jeu d'essai n'a qu'une version par dossier ou presque)
  R.Derniere_version_esr = R.id.map(() => true);
  // tableau de bord publié : nombre de lignes, et lignes en dernière version par état le plus grave
  const tdb = JSON.parse(fs.readFileSync(path.join(__C.donnees, 'doc_tdb.json'))).__data.Config, Cf = d.__data.Config;
  const v = JSON.parse(tdb.Valeur[tdb.Cle.indexOf('tableau_de_bord')]); if (!v.publie) v.publie = v.brouillon;
  Cf.id.push(Math.max(...Cf.id) + 1); Cf.Cle.push('tableau_de_bord'); Cf.Valeur.push(JSON.stringify(v)); if (Cf.Modifie_le) Cf.Modifie_le.push(0);
  const tables = {}; for (const [k, x] of Object.entries(d)) if (k.startsWith('_grist_')) tables[k] = x; Object.assign(tables, d.__data);
  return { format: 'kit-secours-instantane', version: 1, tables };
}

(async () => {
  const fichier = path.join(__C.sorties, 'base-formules.json'); fs.writeFileSync(fichier, JSON.stringify(base()));
  const browser = await chromium.launch({ executablePath: __C.chromium });
  const p = await (await browser.newContext({ viewport: { width: 1200, height: 1200 } })).newPage();
  p.on('pageerror', e => console.log('PAGEERROR', e.message)); p.on('dialog', d => d.accept());
  await p.goto(KIT); await p.waitForTimeout(600);
  await p.fill('#kit-secours #agent', 'Alice'); await p.locator('#kit-secours #agent').dispatchEvent('change');
  await p.setInputFiles('#kit-secours #fichier-base', fichier); await p.waitForTimeout(500);
  await p.selectOption('#kit-secours #page', { index: 2 });
  await Promise.all([p.waitForNavigation(), p.click('#kit-secours [data-a=commencer]')]); await p.waitForTimeout(1500);
  const S = p.frameLocator('iframe[data-vue=saisie]');
  const tdbLignes = async () => { await p.click('#kit-secours .onglet[data-v=tableau]'); await p.waitForTimeout(1200); const t = (await p.frameLocator('iframe[data-vue=tableau]').locator('body').innerText()).match(/(\d+) lignes/); await p.click('#kit-secours .onglet[data-v=saisie]'); await p.waitForTimeout(300); return t ? +t[1] : '?'; };
  console.log('TABLEAU DE BORD avant :', await tdbLignes(), 'lignes');
  // nouveau signalement (sites repris : qualification déduite), puis mise à jour du même dossier
  await S.locator('#porte-nouveau').click(); await p.waitForTimeout(300);
  await S.locator('#nom').fill('Jean Moulin'); await p.waitForTimeout(700); await S.locator('#liste [role=option]').first().click(); await p.waitForTimeout(700);
  await S.locator('#description').fill('Signalement hors ligne'); await S.locator('#btn-signalement').click(); await p.waitForTimeout(1200);
  const etat = () => p.evaluate(() => { const t = window.__KIT__.K.doc.Reponses; return t.id.map((id, i) => ({ id, dossier: t.Dossier[i], etab: t.Etablissement[i], q: t.Qualification[i], dv: t.Derniere_version[i], dvEsr: t.Derniere_version_esr[i], grave: t.Etat_plus_grave[i], jours: t.Nb_jours_mobilisation[i], desc: t.Description[i] })); });
  let e = await etat(); const n = e.find(x => x.desc === 'Signalement hors ligne');
  console.log('NOUVEAU :', JSON.stringify(n));
  console.log('TABLEAU DE BORD après le nouveau :', await tdbLignes(), 'lignes');
  await S.locator('#btn-retour-liste').click().catch(() => {}); await p.waitForTimeout(400);
  await S.locator('#cartes-signalements li:has-text("Signalement hors ligne")').first().click(); await p.waitForTimeout(900);
  await S.locator('#description').fill('Mise à jour hors ligne'); await S.locator('#btn-signalement').click(); await p.waitForTimeout(1200);
  e = await etat();
  console.log('DOSSIER après la mise à jour :', JSON.stringify(e.filter(x => x.dossier === n.id).map(x => ({ desc: x.desc, dv: x.dv, dvEsr: x.dvEsr, grave: x.grave, jours: x.jours }))));
  console.log('LIGNES EXISTANTES inchangées (dossiers sans ligne du mode secours) :', e.filter(x => x.id < 1e12 && x.dossier !== n.id).every(x => x.dvEsr === true));
  console.log('TABLEAU DE BORD après la mise à jour :', await tdbLignes(), 'lignes');
  await browser.close();
})();
