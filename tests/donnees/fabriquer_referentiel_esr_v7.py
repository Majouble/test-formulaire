# Fabrique referentiel_esr_v7_essai.xlsx : petit classeur fictif au format v7 du référentiel ESR (règle des 3 questions)
# Mêmes identifiants que referentiel_esr_essai.xlsx (ancien format), pour essayer le passage de l'un à l'autre.
# Usage : python3 fabriquer_referentiel_esr_v7.py   (nécessite openpyxl)
import os, openpyxl
ici = os.path.dirname(os.path.abspath(__file__))
E = ['Établissement ID', 'Établissement', 'Sigle', 'Autres noms', 'Niveau', 'Établissement de rattachement', 'Membre de', "Type d'établissement", 'Périmètre',
     'Ministère de tutelle', 'Secteur', 'Groupe', 'SIREN', 'Identifiant(s) UAI', 'Académie', 'Commune', 'Siège', 'Latitude', 'Longitude', 'État', 'Commentaire', 'Libellé consolidé (liste déroulante)']
etabs = [
  ['ETAB-0001', 'Université de Rennes', 'UR', 'Rennes 1 | Beaulieu | Villejean', 'Établissement', None, None, 'Établissement public expérimental', 'Public tutelle MESRE',
   'Enseignement supérieur et recherche', 'public', None, '193509361', '0350936C', 'Rennes', 'Rennes', 'SITE-0001', 48.1167, -1.6389, 'Actif', None, 'Université de Rennes (UR)'],
  ['ETAB-0002', 'Université Rennes 2', None, 'Rennes 2 | Haute-Bretagne', 'Établissement', None, None, 'Université', 'Public tutelle MESRE',
   'Enseignement supérieur et recherche', 'public', None, '193509379', '0350937D', 'Rennes', 'Rennes', 'SITE-0004', 48.1190, -1.7020, 'Actif', None, 'Université Rennes 2'],
  ['ETAB-0003', 'Sciences Po Rennes', 'IEP Rennes', "IEP de Rennes | Institut d'études politiques de Rennes", 'Établissement', None, 'ETAB-0001', 'École publique (hors EPSCP)', 'Public tutelle MESRE',
   'Enseignement supérieur et recherche', 'public', None, '193509601', '0350960X', 'Rennes', 'Rennes', 'SITE-0007', 48.1159, -1.6608, 'Actif', None, 'Sciences Po Rennes (IEP Rennes)'],
  ['ETAB-0004', 'IUT de Rennes', 'IUT', 'IUT Beaulieu', 'Composante interne', 'ETAB-0001', None, 'IUT', 'Public tutelle MESRE',
   None, 'public', None, '193509361', None, 'Rennes', 'Rennes', None, None, None, 'Actif', None, 'IUT de Rennes – Université de Rennes'],
  ['ETAB-0006', "École supérieure d'ingénieurs de Rennes", 'ESIR', None, 'Composante interne', 'ETAB-0001', None, "École d'ingénieurs", 'Public tutelle MESRE',
   None, 'public', None, '193509361', '0352480F', 'Rennes', 'Rennes', None, None, None, 'Actif', 'Règle des 3 questions : Règle 2 : fait partie de Université de Rennes (même SIREN)', "École supérieure d'ingénieurs de Rennes (ESIR)"],
  ['ETAB-0007', 'Institut Mines-Télécom', 'IMT', None, 'Établissement', None, None, 'Grand établissement', 'Public autres tutelles',
   'Économie et finances', 'public', None, '130006356', '0912424R', 'Versailles', 'Palaiseau', None, 48.71, 2.20, 'Actif', None, 'Institut Mines-Télécom (IMT)'],
  ['ETAB-0008', 'IMT Atlantique', None, None, 'Composante interne', 'ETAB-0007', None, "École d'ingénieurs", 'Public autres tutelles',
   None, 'public', None, '130006356', '0442852L', 'Nantes', 'Brest', None, None, None, 'Actif', 'Règle des 3 questions : Règle 2 : fait partie de Institut Mines-Télécom (SIREN de la personne morale)', 'IMT Atlantique'],
  ['ETAB-0009', 'Institut Mines-Télécom Business School', 'IMT-BS', None, 'Composante interne', 'ETAB-0007', None, "École de commerce", 'Public autres tutelles',
   None, 'public', None, '130006356', '0912255G', 'Versailles', 'Évry-Courcouronnes', None, None, None, 'Actif', None, 'Institut Mines-Télécom Business School'],
  ['ETAB-A0001', 'Lycée Chateaubriand', None, 'Lycée général Chateaubriand', 'Établissement', None, None, 'Lycée avec formations supérieures (EPLE)', 'Public Éducation nationale',
   'Éducation nationale', 'public', None, '193500000', '0350710G', 'Rennes', 'Rennes', 'SITE-A0001', 48.1220, -1.6600, 'Actif', None, 'Lycée Chateaubriand'],
]
S = ['Site ID', 'Nom du site', 'Établissement ID', 'Composante concernée', 'Autres noms', 'Campus', 'Statut', 'Actif', 'Source', 'Adresse', 'Code postal', 'Commune', 'Académie',
     'Latitude', 'Longitude', 'Précision des coordonnées', 'Commentaire']
sites = [
  ['SITE-0001', 'Campus Beaulieu', 'ETAB-0001', None, 'Beaulieu bat 12', 'CAMP-001', 'Validé', True, 'OAD', '263 av. Leclerc', '35042', 'Rennes', 'Rennes', 48.1167, -1.6389, 'Source du site', None],
  ['SITE-0002', 'Campus Villejean', 'ETAB-0001', None, None, None, 'Validé', True, 'OAD', '2 av. Prof. Léon Bernard', '35043', 'Rennes', 'Rennes', 48.1201, -1.6950, 'Source du site', None],
  ['SITE-0003', 'IUT Beaulieu', 'ETAB-0001', 'ETAB-0004', None, 'CAMP-001', 'Proposé', True, 'Implantations MESR (données 2017)', '3 rue du Clos Courtel', '35042', 'Rennes', 'Rennes', 48.1210, -1.6355, 'Implantation MESR (adresse)', None],
  ['SITE-0004', 'Campus Villejean Rennes 2', 'ETAB-0002', None, None, None, 'Validé', True, 'OAD', 'place Recteur Henri Le Moal', '35043', 'Rennes', 'Rennes', 48.1190, -1.7020, 'Source du site', None],
  ['SITE-0006', 'Saint-Malo', 'ETAB-0002', None, 'Campus de Saint-Malo', None, 'Proposé', True, 'Saisie', None, '35400', 'Saint-Malo', 'Rennes', 48.6493, -2.0257, 'Centre de la commune', None],
  ['SITE-0007', 'Sciences Po Rennes – centre', 'ETAB-0003', None, None, None, 'Validé', True, 'OAD', '104 bd de la Duchesse Anne', '35700', 'Rennes', 'Rennes', 48.1159, -1.6608, 'Source du site', None],
  ['SITE-0008', 'ESIR Beaulieu', 'ETAB-0001', 'ETAB-0006', None, 'CAMP-001', 'Validé', True, 'OAD', '263 av. Leclerc', '35042', 'Rennes', 'Rennes', 48.1172, -1.6380, 'Source du site', None],
  ['SITE-0009', 'Campus de Brest', 'ETAB-0007', 'ETAB-0008', None, None, 'Validé', True, 'OAD', 'Technopôle Brest-Iroise', '29280', 'Plouzané', 'Rennes', 48.3590, -4.5700, 'Source du site', None],
  ['SITE-R0001', 'Site de Cesson-Sévigné', 'ETAB-0007', 'ETAB-0008', 'IMT Atlantique - Campus de Rennes', None, 'Proposé', True, 'Règle des 3 questions (ancienne ligne ETAB-0010)', None, None, 'Cesson-Sévigné', 'Rennes', 48.1210, -1.6280, 'Commune', None],
  ['SITE-A0001', 'Lycée Chateaubriand', 'ETAB-A0001', None, None, None, 'Validé', True, 'Atlas', '136 bd de Vitré', '35700', 'Rennes', 'Rennes', 48.1220, -1.6600, 'Adresse', None],
]
R = ['Établissement ID', 'Établissement', 'Niveau avant', 'Résultat', 'État', 'Remplacé par', 'Remplacé par (nom)', 'Motif', 'Sites']
retirees = [
  ['ETAB-0005', 'Campus de Saint-Malo', 'Site ou campus', 'Converti en site', 'Retiré', 'ETAB-0002', 'Université Rennes 2', 'Ligne « Site ou campus » : convertie en site de son établissement', '1 site(s) transféré(s) à la tête'],
  ['ETAB-0010', 'IMT Atlantique - Campus de Rennes', 'Site ou campus', 'Converti en site', 'Retiré', 'ETAB-0007', 'Institut Mines-Télécom', 'Ligne « Site ou campus » : convertie en site de son établissement', 'nouveau site SITE-R0001'],
]
wb = openpyxl.Workbook(); wb.active.title = "Mode d'emploi"; wb.active.append(['Référentiel d’essai v7 (fictif)'])
for nom, ent, lignes in [('Synthèse', ['Indicateur', 'Valeur'], [['Établissements', 6]]), ('Établissements', E, etabs), ('Sites', S, sites), ('Lignes retirées', R, retirees)]:
  ws = wb.create_sheet(nom); ws.append(ent); [ws.append(l) for l in lignes]
wb.save(os.path.join(ici, 'referentiel_esr_v7_essai.xlsx'))
