# Fabrique referentiel_esr_essai.xlsx : petit classeur fictif au format du référentiel ESR consolidé (mêmes onglets, mêmes en-têtes)
# Usage : python3 fabriquer_referentiel_esr.py   (nécessite openpyxl)
import os, openpyxl
ici = os.path.dirname(os.path.abspath(__file__))
E = ['Établissement ID', 'Libellé consolidé (liste déroulante)', 'Mots-clés de recherche', 'Nom', 'Sigle', 'Niveau', 'Type', 'Établissement de rattachement',
     'Secteur', 'État', 'Académie', 'Département', 'Commune', 'Région académique (siège)', 'UAI', 'Identifiant Paysage', 'Wikidata', 'Sources',
     'Nb sites (validés OAD)', 'Nb sites proposés', 'Site(s) correspondant(s)', 'Effectif étudiants déclaré', 'Statut de la ligne', 'Points à vérifier', 'Nom (source)']
etabs = [
  ['ETAB-0001', 'Université de Rennes (UR)', 'Université de Rennes | UR | Rennes 1 | Beaulieu | Villejean', 'Université de Rennes', 'UR', 'Établissement', 'Université', None,
   'public', 'Actif', 'Rennes', 'Ille-et-Vilaine', 'Rennes', 'Bretagne', '0350936C', 'aB1cD', 'Q1', 'Bac à sable', 3, 0, None, '30000', 'Existante', None, 'Université de Rennes'],
  ['ETAB-0002', 'Université Rennes 2', 'Rennes 2 | Haute-Bretagne | Saint-Malo', 'Université Rennes 2', None, 'Établissement', 'Université', None,
   'public', 'Actif', 'Rennes', 'Ille-et-Vilaine', 'Rennes', 'Bretagne', '0350937D', 'eF2gH', None, 'Bac à sable', 2, 1, None, '20000', 'Existante', None, 'Rennes 2'],
  ['ETAB-0003', 'Sciences Po Rennes (IEP Rennes)', "Sciences Po Rennes | IEP de Rennes | Institut d'études politiques de Rennes | IEP-Rennes", 'Sciences Po Rennes', 'IEP Rennes', 'Établissement',
   'École publique (hors EPSCP)', None, 'public', 'Actif', 'Rennes', None, 'Rennes', 'Bretagne', '0350960X', 'iJ3kL', None, 'Paysage', 1, 0, None, None, 'Ajoutée (Paysage) – à valider', 'Fusion de ETAB-0099', 'Sciences Po Rennes'],
  ['ETAB-0004', 'IUT de Rennes – Université de Rennes', 'IUT de Rennes | IUT Beaulieu', 'IUT de Rennes', 'IUT', 'Composante interne', 'IUT', 'ETAB-0001 – Université de Rennes',
   'public', 'Actif', 'Rennes', None, 'Rennes', 'Bretagne', None, None, None, 'IUT', None, None, None, None, 'Ajoutée (IUT) – à valider', None, 'IUT de Rennes'],
  ['ETAB-0005', 'Campus de Saint-Malo – Université Rennes 2', 'Saint-Malo', 'Campus de Saint-Malo', None, 'Site ou campus', 'Campus ou site', 'ETAB-0002 – Université Rennes 2',
   'public', 'Actif', 'Rennes', None, 'Saint-Malo', 'Bretagne', None, None, None, 'Paysage', None, None, 'SITE-0006', None, 'Ajoutée (Paysage) – à valider', None, 'Campus de Saint-Malo'],
  ['ETAB-0006', "École supérieure d'ingénieurs de Rennes (ESIR)", 'ESIR', "École supérieure d'ingénieurs de Rennes", 'ESIR', 'Composante interne', "École d'ingénieurs interne", 'ETAB-0001 – Université de Rennes',
   'public', 'Actif', 'Rennes', None, 'Rennes', 'Bretagne', '0352480F', None, None, 'CTI', None, None, None, None, 'Existante', None, "École supérieure d'ingénieurs de Rennes"],
  ['ETAB-0007', 'Institut Mines-Télécom (IMT)', 'IMT', 'Institut Mines-Télécom, au périmètre des écoles IMT Atlantique, Lille Douai, Albi, Alès, Mines Saint-Étienne et Institut Mines-Télécom Business school', 'IMT', 'Établissement', 'Grand établissement', None,
   'public', 'Actif', 'Paris', None, 'Palaiseau', 'Île-de-France', '0912424R', None, None, 'PLF', None, None, None, None, 'Existante', None, 'Institut Mines-Télécom'],
  ['ETAB-0008', 'IMT Atlantique', 'IMT Atlantique', 'IMT Atlantique', None, 'Composante interne', "École d'ingénieurs interne", 'ETAB-0007 – Institut Mines-Télécom, au périmètre des écoles IMT Atlantique, Lille Douai, Albi, Alès, Mines Saint-Étienne et Institut Mines-Télécom Business school',
   'public', 'Actif', 'Nantes', None, 'Brest', 'Bretagne', '0442852L', None, None, 'CTI', None, None, None, None, 'Existante', None, 'IMT Atlantique'],
  ['ETAB-0009', 'Institut Mines-Télécom Business School', 'IMT-BS', 'Institut Mines-Télécom Business School', 'IMT-BS', 'Composante interne', 'Autre composante interne', 'ETAB-0007 – Institut Mines-Télécom, au périmètre des écoles IMT Atlantique, Lille Douai, Albi, Alès, Mines Saint-Étienne et Institut Mines-Télécom Business school',
   'public', 'Actif', 'Versailles', None, 'Évry-Courcouronnes', 'Île-de-France', '0912255G', None, None, 'Paysage', None, None, None, None, 'Existante', None, 'IMT Business School'],
  ['ETAB-0010', 'IMT Atlantique - Campus de Rennes', 'IMT Atlantique Rennes', 'IMT Atlantique - Campus de Rennes', None, 'Site ou campus', 'Campus ou site', 'ETAB-0007 – Institut Mines-Télécom, au périmètre des écoles IMT Atlantique, Lille Douai, Albi, Alès, Mines Saint-Étienne et Institut Mines-Télécom Business school',
   'public', 'Actif', 'Rennes', None, 'Cesson-Sévigné', 'Bretagne', None, None, None, 'Paysage', None, None, None, None, 'Ajoutée (Paysage) – à valider', None, 'IMT Atlantique - Campus de Rennes'],
]
S = ['Site ID', 'Établissement ID', 'Établissement', 'Composante concernée', 'Nom du site', 'Nom OAD', 'Autres noms', 'Statut', 'Source', 'Commune', 'Code postal', 'Académie',
     'Adresse', 'Latitude', 'Longitude', 'Précision des coordonnées', 'Implantation multi-occupants', 'Autres occupants', 'Surface (m²)', 'Remarque', 'Cité dans la base mouvements (oct. 2026)']
sites = [
  ['SITE-0001', 'ETAB-0001', 'Université de Rennes', None, 'Campus Beaulieu', 'Beaulieu', 'Beaulieu bat 12, Bâtiment 12', 'Validé', 'OAD', 'Rennes', '35042', 'Rennes', '263 av. Leclerc', 48.1167, -1.6389, 'Source du site', None, None, 120000, None, 'Beaulieu bât. 12'],
  ['SITE-0002', 'ETAB-0001', 'Université de Rennes', None, 'Campus Villejean', 'Villejean', None, 'Validé', 'OAD', 'Rennes', '35043', 'Rennes', '2 av. Prof. Léon Bernard', 48.1201, -1.6950, 'Source du site', 'MULTI-001', 'Université Rennes 2 (SITE-0004)', 90000, None, None],
  ['SITE-0003', 'ETAB-0001', 'Université de Rennes', 'ETAB-0004 – IUT de Rennes', 'IUT Beaulieu', None, None, 'Proposé', 'Implantations MESR (données 2017)', 'Rennes', '35042', 'Rennes', '3 rue du Clos Courtel', 48.1210, -1.6355, 'Implantation MESR (adresse)', None, None, None, None, None],
  ['SITE-0004', 'ETAB-0002', 'Université Rennes 2', None, 'Campus Villejean Rennes 2', None, None, 'Validé', 'OAD', 'Rennes', '35043', 'Rennes', 'place Recteur Henri Le Moal', 48.1190, -1.7020, 'Source du site', 'MULTI-001', 'Université de Rennes (SITE-0002)', 80000, None, None],
  ['SITE-0006', 'ETAB-0002', 'Université Rennes 2', None, 'Saint-Malo', None, None, 'Proposé', 'Saisie', 'Saint-Malo', '35400', 'Rennes', None, 48.6493, -2.0257, 'Centre de la commune', None, None, None, 'aucun site OAD proche', None],
  ['SITE-0007', 'ETAB-0003', 'Sciences Po Rennes', None, 'Sciences Po Rennes – centre', None, None, 'Validé', 'OAD', 'Rennes', '35700', 'Rennes', '104 bd de la Duchesse Anne', 48.1159, -1.6608, 'Source du site', None, None, 9000, None, None],
  ['SITE-0008', 'ETAB-0001', 'Université de Rennes', "ETAB-0006 – École supérieure d'ingénieurs de Rennes", 'ESIR Beaulieu', None, None, 'Validé', 'OAD', 'Rennes', '35042', 'Rennes', '263 av. Leclerc', 48.1172, -1.6380, 'Source du site', None, None, None, None, None],
  ['SITE-0009', 'ETAB-0007', 'Institut Mines-Télécom', 'ETAB-0008 – IMT Atlantique', 'Campus de Brest', None, None, 'Validé', 'OAD', 'Plouzané', '29280', 'Rennes', 'Technopôle Brest-Iroise', 48.3590, -4.5700, 'Source du site', None, None, None, None, None],
]
A = ['Établissement (saisie)', 'Site saisi', 'Académie', 'Établissement ID', 'Établissement (référentiel)', 'Site ID', 'Site(s) du référentiel', 'Rapprochement', 'Remarque']
alias = [
  ['Université de Rennes', 'Beaulieu bât. 12', 'Rennes', 'ETAB-0001', 'Université de Rennes', 'SITE-0001', 'Campus Beaulieu', 'Site existant', None],
  ['Université de Rennes', 'Campus Beaulieu bat 12', 'Rennes', 'ETAB-0001', 'Université de Rennes', 'SITE-0003', 'IUT Beaulieu', 'Site existant', 'déjà décidé dans Grist'],
  ['Rennes 2', 'Présidence', 'Rennes', 'ETAB-0002', 'Université Rennes 2', None, None, 'Établissement entier', 'Saisie visant tout l’établissement'],
]
F = ['Ligne supprimée', 'Nom', 'UAI', 'Commune', 'Sources', 'Fusionnée dans', 'Nom retenu', 'Motif']
fus = [['ETAB-0099', 'IEP-Rennes', None, 'Rennes', 'Patrimoine immobilier', 'ETAB-0003', 'Sciences Po Rennes', 'Doublon (même établissement)']]
wb = openpyxl.Workbook(); wb.active.title = 'Lisez-moi'; wb.active.append(["Référentiel d'essai (fictif)"])
for nom, ent, lignes in [('Etablissements_ESR', E, etabs), ('Liste déroulante', ['Libellé'], [[e[1]] for e in etabs]), ('Campus et sites', S, sites),
                         ('Sites base mouvements', A, alias), ('Lignes fusionnées', F, fus)]:
  ws = wb.create_sheet(nom); ws.append(ent); [ws.append(l) for l in lignes]
wb.save(os.path.join(ici, 'referentiel_esr_essai.xlsx'))
