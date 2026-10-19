# Construit le projet QGIS « atlas des signalements par académie » (modèle de la cellule ministérielle de veille et d'alerte).
# Usage : QT_QPA_PLATFORM=offscreen python3.12 construire_atlas.py <dossier contenant signalements/academies/departements.geojson> [demo]
# Contours : Lambert-93 (EPSG:2154), coordonnées en mètres entiers, pour éviter toute reprojection à l'affichage.
import os, sys
from urllib.parse import quote
from qgis.core import (QgsApplication, QgsProject, QgsCoordinateReferenceSystem, QgsVectorLayer, QgsRasterLayer, QgsRectangle,
    QgsFillSymbol, QgsMarkerSymbol, QgsRendererCategory, QgsCategorizedSymbolRenderer, QgsRuleBasedRenderer, QgsSymbolLayer, QgsProperty,
    QgsPalLayerSettings, QgsTextFormat, QgsTextBufferSettings, QgsVectorLayerSimpleLabeling, QgsPrintLayout, QgsLayoutItemPage,
    QgsLayoutItemLabel, QgsLayoutItemMap, QgsLayoutItemLegend, QgsLayoutItemScaleBar, QgsLayoutItemAttributeTable, QgsLayoutFrame,
    QgsLayoutTableColumn, QgsLayoutMultiFrame, QgsLayoutPoint, QgsLayoutSize, QgsUnitTypes, QgsExpressionContextUtils, QgsLayerTree,
    QgsLayoutExporter, QgsLegendStyle, Qgis, QgsSingleSymbolRenderer, QgsLayoutMeasurement)
from qgis.core import QgsInvertedPolygonRenderer
from qgis.PyQt.QtGui import QColor, QFont, QPainter
from qgis.PyQt.QtCore import Qt

QgsApplication.setPrefixPath("/usr", True)
app = QgsApplication([], False); app.initQgis()
D = os.path.abspath(sys.argv[1]); DEMO = len(sys.argv) > 2 and sys.argv[2] == "demo"
p = QgsProject.instance(); p.clear()
p.setFileName(os.path.join(D, "atlas.qgs"))
p.setCrs(QgsCoordinateReferenceSystem("EPSG:2154"))
p.writeEntryBool("Paths", "/Absolute", False)
p.setTitle("Atlas des signalements par académie")

MARINE, ORANGE = "#000091", "#c3551e"
COULEURS = [("École", "#f2c12e"), ("Collège", "#d1336a"), ("Lycée", "#5f59c6"), ("Autre", "#4cbf62")]
DANS_PAGE = '@atlas_pagename IS NULL OR "Academie" IS NULL OR "Academie" = @atlas_pagename'   # hors atlas (canevas) et légende : tous les points

def couche(f, nom):
    l = QgsVectorLayer(os.path.join(D, f), nom, "ogr"); assert l.isValid(), f; return l
sig = couche("signalements.geojson", "signalements")
aca = couche("academies.geojson", "academies")
dep = couche("departements.geojson", "Départements")
rep = couche("academies.geojson", "academies (repérage)")
voile = couche("academies.geojson", "voile hors académie")
terres = couche("academies.geojson", "fond uni (sans connexion)")

def xyz(nom, couche_ign, style, fmt="image/png"):
    url = ("https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=" + couche_ign + "&STYLE=" + style +
           "&TILEMATRIXSET=PM&FORMAT=" + fmt + "&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}")
    return QgsRasterLayer("type=xyz&url=" + quote(url, safe=":/{}") + "&zmin=0&zmax=18", nom, "wms")
relief = xyz("Relief IGN (estompage)", "ELEVATION.ELEVATIONGRIDCOVERAGE.SHADOW", "estompage_grayscale")
plan = xyz("Plan IGN", "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", "normal")
# fond du modèle : plan IGN pâli, estompage par-dessus en mode « produit » (le relief assombrit le plan sans le masquer)
if plan.renderer():
    plan.renderer().setOpacity(0.5); plan.hueSaturationFilter().setSaturation(-45)
if relief.renderer():
    relief.renderer().setOpacity(0.55)
relief.setBlendMode(QPainter.CompositionMode_Multiply)

# --- symbologie
dep_sym = QgsFillSymbol.createSimple({"color": "0,0,0,0", "outline_color": "90,95,168,255", "outline_width": "0.35", "outline_style": "dash"})
dep.setRenderer(QgsSingleSymbolRenderer(dep_sym))
# académie de la page : trait épais ; les autres : trait fin (hors atlas, toutes en trait épais)
ra = QgsRuleBasedRenderer.Rule(None)
ra1 = QgsRuleBasedRenderer.Rule(QgsFillSymbol.createSimple({"color": "0,0,0,0", "outline_color": "45,46,127,255", "outline_width": "1.1", "joinstyle": "round"}), 0, 0, '@atlas_pagename IS NULL OR "nom" = @atlas_pagename', "Académie")
ra2 = QgsRuleBasedRenderer.Rule(QgsFillSymbol.createSimple({"color": "0,0,0,0", "outline_color": "45,46,127,160", "outline_width": "0.4"}), 0, 0, "ELSE", "Académies voisines")
ra2.setIsElse(True); ra.appendChild(ra1); ra.appendChild(ra2)
aca.setRenderer(QgsRuleBasedRenderer(ra))
terres.setRenderer(QgsSingleSymbolRenderer(QgsFillSymbol.createSimple({"color": "241,240,234,255", "outline_style": "no"})))
# voile blanc léger hors de l'académie de la page : elle ressort, les voisines restent lisibles
rv = QgsRuleBasedRenderer.Rule(None)
rv.appendChild(QgsRuleBasedRenderer.Rule(QgsFillSymbol.createSimple({"color": "255,255,255,85", "outline_style": "no"}), 0, 0, '@atlas_pagename IS NULL OR "nom" = @atlas_pagename', "Académie de la page"))
voile.setRenderer(QgsInvertedPolygonRenderer(QgsRuleBasedRenderer(rv)))
racine = QgsRuleBasedRenderer.Rule(None)
r1 = QgsRuleBasedRenderer.Rule(QgsFillSymbol.createSimple({"color": "0,0,145,255", "outline_color": "255,255,255,255", "outline_width": "0.15"}), 0, 0, '"nom" = @atlas_pagename', "Académie de la page")
r2 = QgsRuleBasedRenderer.Rule(QgsFillSymbol.createSimple({"color": "214,218,232,255", "outline_color": "255,255,255,255", "outline_width": "0.15"}), 0, 0, "ELSE", "Autres académies")
r2.setIsElse(True); racine.appendChild(r1); racine.appendChild(r2)
rep.setRenderer(QgsRuleBasedRenderer(racine))

cats = []
for nom, c in COULEURS:
    s = QgsMarkerSymbol.createSimple({"name": "circle", "color": c, "outline_color": "255,255,255,255", "outline_width": "0.4", "size": "3.2"})
    rgb = ",".join(str(v) for v in QColor(c).getRgb()[:3])
    # établissements des académies voisines : affichés, plus petits et atténués (comme sur le modèle)
    s.symbolLayer(0).setDataDefinedProperty(QgsSymbolLayer.PropertySize, QgsProperty.fromExpression(f"CASE WHEN {DANS_PAGE} THEN 3.2 ELSE 2.4 END"))
    s.symbolLayer(0).setDataDefinedProperty(QgsSymbolLayer.PropertyFillColor, QgsProperty.fromExpression(f"CASE WHEN {DANS_PAGE} THEN '{rgb},255' ELSE '{rgb},120' END"))
    s.symbolLayer(0).setDataDefinedProperty(QgsSymbolLayer.PropertyStrokeColor, QgsProperty.fromExpression(f"CASE WHEN {DANS_PAGE} THEN '255,255,255,255' ELSE '255,255,255,120' END"))
    cats.append(QgsRendererCategory(nom, s, {"École": "Écoles", "Collège": "Collèges", "Lycée": "Lycées", "Autre": "Autres"}[nom]))
sig.setRenderer(QgsCategorizedSymbolRenderer("Categorie", cats))
lab = QgsPalLayerSettings()
lab.fieldName = '"Etiquette"'; lab.isExpression = True
tf = QgsTextFormat(); f = QFont("DejaVu Sans"); f.setBold(True); tf.setFont(f); tf.setSize(6.5); tf.setColor(QColor("#1d1d4f"))
b = QgsTextBufferSettings(); b.setEnabled(True); b.setSize(0.8); b.setColor(QColor("white")); tf.setBuffer(b)
lab.setFormat(tf); lab.placement = Qgis.LabelPlacement.OrderedPositionsAroundPoint; lab.dist = 1.0
P = getattr(QgsPalLayerSettings, "Property", QgsPalLayerSettings)   # énumération déplacée selon les versions de QGIS
ddl = lab.dataDefinedProperties()
ddl.setProperty(P.Color, QgsProperty.fromExpression(f"CASE WHEN {DANS_PAGE} THEN '29,29,79,255' ELSE '105,105,130,255' END"))
ddl.setProperty(P.Bold, QgsProperty.fromExpression(f"CASE WHEN {DANS_PAGE} THEN 1 ELSE 0 END"))
ddl.setProperty(P.Size, QgsProperty.fromExpression(f"CASE WHEN {DANS_PAGE} THEN 6.5 ELSE 5.5 END"))
ddl.setProperty(P.Priority, QgsProperty.fromExpression(f"CASE WHEN {DANS_PAGE} THEN 9 ELSE 3 END"))
lab.setDataDefinedProperties(ddl)
sig.setLabeling(QgsVectorLayerSimpleLabeling(lab)); sig.setLabelsEnabled(True)

for l in (terres, plan, relief, dep, voile, aca, rep, sig): p.addMapLayer(l, False)
arbre = p.layerTreeRoot()
for l in (sig, aca, voile, dep): arbre.addLayer(l)
fonds = arbre.addGroup("Fonds de carte")
for l in (relief, plan, terres): fonds.addLayer(l)   # les fonds IGN demandent une connexion internet (Géoplateforme)
g = arbre.addGroup("Carte de repérage"); g.addLayer(rep); g.setItemVisibilityChecked(False)

# --- variables du projet (remplacées par le widget de cartographie à l'export)
QgsExpressionContextUtils.setProjectVariable(p, "atlas_titre", "Trafic de drogue aux abords des établissements" if DEMO else "@@TITRE@@")
QgsExpressionContextUtils.setProjectVariable(p, "atlas_date", "oct. 2026" if DEMO else "@@DATE@@")
QgsExpressionContextUtils.setProjectVariable(p, "atlas_service", "MENJS/SG/HFDS/\nCellule ministérielle\nde veille et d'alerte" if DEMO else "@@SERVICE@@")
# nombre d'établissements dans le tableau (les plus signalés de l'académie) ; 0 = tous, sur des pages supplémentaires
QgsExpressionContextUtils.setProjectVariable(p, "atlas_lignes", "22" if DEMO else "@@LIGNES@@")

# --- mise en page A4 portrait
lay = QgsPrintLayout(p); lay.initializeDefaults(); lay.setName("Atlas par académie")
lay.pageCollection().page(0).setPageSize("A4", QgsLayoutItemPage.Portrait)
MM = QgsUnitTypes.LayoutMillimeters
def place(it, x, y, w, h): it.attemptMove(QgsLayoutPoint(x, y, MM)); it.attemptResize(QgsLayoutSize(w, h, MM))
def texte(t, x, y, w, h, taille, couleur="#161616", gras=False, ha=Qt.AlignLeft, fond=None, cadre=None, nom=None):
    it = QgsLayoutItemLabel(lay); it.setText(t)
    fmt = QgsTextFormat(); fo = QFont("DejaVu Sans"); fo.setBold(gras); fmt.setFont(fo); fmt.setSize(taille); fmt.setColor(QColor(couleur)); it.setTextFormat(fmt)
    it.setHAlign(ha); it.setVAlign(Qt.AlignVCenter); it.setMarginX(1.5); it.setMarginY(0)
    if fond: it.setBackgroundEnabled(True); it.setBackgroundColor(QColor(fond))
    if cadre: it.setFrameEnabled(True); it.setFrameStrokeColor(QColor(cadre)); it.setFrameStrokeWidth(QgsLayoutMeasurement(0.5, MM))
    if nom: it.setId(nom)
    lay.addLayoutItem(it); place(it, x, y, w, h); return it

texte("[% @atlas_service %]", 6, 5, 48, 17, 7.5, nom="service")
texte("[% @atlas_titre %]", 56, 6, 116, 9, 10.5, "#ffffff", True, Qt.AlignHCenter, fond=MARINE, nom="titre")
texte("[% @atlas_date %]", 174, 6, 30, 9, 10.5, ORANGE, True, Qt.AlignHCenter, cadre=ORANGE, nom="date")

loc = QgsLayoutItemMap(lay); loc.setId("reperage"); lay.addLayoutItem(loc); place(loc, 6, 24, 36, 32)
loc.setLayers([rep]); loc.setKeepLayerSet(True); loc.setCrs(QgsCoordinateReferenceSystem("EPSG:2154"))
loc.zoomToExtent(QgsRectangle(90000, 6040000, 1250000, 7120000)); loc.setFrameEnabled(True); loc.setBackgroundColor(QColor("#ffffff"))
texte("Académie :", 46, 26, 80, 9, 15, "#9a9a9a", True, nom="academie_etiquette")
texte("[% @atlas_pagename %]", 46, 36, 156, 14, 22, MARINE, True, nom="academie_nom")

carte = QgsLayoutItemMap(lay); carte.setId("carte"); lay.addLayoutItem(carte); place(carte, 6, 56, 198, 134)
carte.setCrs(QgsCoordinateReferenceSystem("EPSG:2154")); carte.zoomToExtent(QgsRectangle(800000, 6200000, 1080000, 6420000))
carte.setAtlasDriven(True); carte.setAtlasScalingMode(QgsLayoutItemMap.Auto); carte.setAtlasMargin(0.06); carte.setFrameEnabled(True)

leg = QgsLayoutItemLegend(lay); leg.setId("legende"); lay.addLayoutItem(leg)
leg.setTitle("Légende :"); leg.setLinkedMap(carte); leg.setAutoUpdateModel(False); leg.setWrapString("|")
arbre_leg = leg.model().rootGroup(); arbre_leg.removeAllChildren()   # arbre propre à la légende (enregistré dans le projet)
for l, titre in ((sig, "Établissements signalés|(atténués : académies voisines)"), (dep, "Départements"), (aca, "Académie")):
    arbre_leg.addLayer(l).setCustomProperty("legend/title-label", titre)   # titre dans la légende, sans renommer la couche
leg.setBackgroundEnabled(True); leg.setBackgroundColor(QColor(255, 255, 255, 225)); leg.setFrameEnabled(True)
for st, taille, gr in ((QgsLegendStyle.Title, 8, True), (QgsLegendStyle.Group, 7, False), (QgsLegendStyle.Subgroup, 7, False), (QgsLegendStyle.SymbolLabel, 7, False)):
    s = leg.style(st); fo = QFont("DejaVu Sans"); fo.setBold(gr); tfo = s.textFormat(); tfo.setFont(fo); tfo.setSize(taille); s.setTextFormat(tfo); leg.setStyle(st, s)
leg.setSymbolWidth(4); leg.setSymbolHeight(3.5); leg.adjustBoxSize(); place(leg, 9, 61, 46, 40); leg.setResizeToContents(True)

ech = QgsLayoutItemScaleBar(lay); ech.setId("echelle"); lay.addLayoutItem(ech); ech.setLinkedMap(carte); ech.setStyle("Single Box")
ech.applyDefaultSize(QgsUnitTypes.DistanceKilometers); ech.setUnits(QgsUnitTypes.DistanceKilometers); ech.setUnitLabel("km"); ech.setNumberOfSegments(2); ech.setNumberOfSegmentsLeft(0)
fe = QgsTextFormat(); fe.setFont(QFont("DejaVu Sans")); fe.setSize(7); ech.setTextFormat(fe)
from qgis.core import QgsScaleBarSettings
ech.setSegmentSizeMode(QgsScaleBarSettings.SegmentSizeFitWidth); ech.setMinimumBarWidth(18); ech.setMaximumBarWidth(36)
ech.setBackgroundEnabled(True); ech.setBackgroundColor(QColor(255, 255, 255, 200)); ech.refresh(); place(ech, 152, 178, 48, 10)
texte("Sources : signalements (Grist) ; IGN Admin Express ; fond IGN Géoplateforme", 6, 190.5, 104, 4, 5.5, "#666666", nom="sources")
# compte des établissements de l'académie, et rappel quand le tableau n'en montre qu'une partie
NB = "array_length(array_filter(aggregate('signalements', 'array_agg', \"Academie\"), @element = @atlas_pagename))"
texte("[% with_variable('n', " + NB + ", CASE WHEN to_int(@atlas_lignes) > 0 AND @n > to_int(@atlas_lignes) "
      "THEN @n || ' établissements signalés — le tableau présente les ' || @atlas_lignes || ' plus signalés' "
      "ELSE @n || CASE WHEN @n > 1 THEN ' établissements signalés' ELSE ' établissement signalé' END END) %]",
      110, 190.5, 94, 4, 6, MARINE, True, Qt.AlignRight, nom="compte")

tab = QgsLayoutItemAttributeTable.create(lay); tab.setVectorLayer(sig)
cols = []
for champ, titre, largeur in (("DSDEN", "DSDEN", 40), ("Commune", "Commune", 24), ("UAI", "UAI", 16), ("Type_libelle", "Type", 19), ("Etablissement", "Établissement", 44), ("REP", "REP/REP+", 18), ("Internat", "Internat ?", 14), ("Nb_signalements", "Signal.", 12)):
    c = QgsLayoutTableColumn(titre); c.setAttribute(champ); c.setWidth(largeur); cols.append(c)
tab.setColumns(cols)
tri = []
for champ in ("DSDEN", "Commune", "Etablissement"):
    c = QgsLayoutTableColumn(champ); c.setAttribute(champ); c.setSortOrder(Qt.AscendingOrder); tri.append(c)
tab.setSortColumns(tri)
# « Rang » : rang de l'établissement dans son académie, du plus signalé au moins signalé (calculé par le widget)
tab.setFilterFeatures(True); tab.setFeatureFilter('"Academie" = @atlas_pagename AND (to_int(@atlas_lignes) <= 0 OR "Rang" <= to_int(@atlas_lignes))')
tab.setMaximumNumberOfFeatures(5000)
fh = QgsTextFormat(); fo = QFont("DejaVu Sans"); fo.setBold(True); fh.setFont(fo); fh.setSize(7); fh.setColor(QColor(MARINE)); tab.setHeaderTextFormat(fh)
fc = QgsTextFormat(); fc.setFont(QFont("DejaVu Sans")); fc.setSize(6.5); fc.setColor(QColor("#161616")); tab.setContentTextFormat(fc)
tab.setShowGrid(True); tab.setHorizontalGrid(True); tab.setVerticalGrid(False); tab.setGridStrokeWidth(0.1); tab.setGridColor(QColor("#c8c8c8")); tab.setCellMargin(0.8)
tab.setResizeMode(QgsLayoutMultiFrame.ExtendToNextPage)
cad = QgsLayoutFrame(lay, tab); place(cad, 6, 196, 198, 96); tab.addFrame(cad); lay.addMultiFrame(tab)

atlas = lay.atlas(); atlas.setCoverageLayer(aca); atlas.setEnabled(True); atlas.setHideCoverage(False)
atlas.setPageNameExpression('"nom"'); atlas.setSortFeatures(True); atlas.setSortExpression('"nom"')
atlas.setFilterFeatures(True); atlas.setFilterExpression("aggregate('signalements', 'count', \"UAI\", \"Academie\" = attribute(@parent, 'nom')) > 0")
atlas.setFilenameExpression("'atlas_' || \"nom\"")
p.layoutManager().addLayout(lay)
assert p.write(), "écriture du projet impossible"
print("carte :", carte.sizeWithUnits().height(), "| table :", cad.positionWithUnits().y())
print("projet écrit :", p.fileName(), "| pages d'atlas :", atlas.updateFeatures())
# chemins de secours (couverture de l'atlas, table, légende) : relatifs eux aussi, pour un projet déplaçable
# (selon la version de QGIS, le chemin relatif écrit peut être « ../fichier » quand le projet n'existait pas encore : on normalise)
import re
txt = re.sub(r'(?:\.\./|\./|' + re.escape(D) + r'/)((?:academies|departements|signalements)\.geojson)', r'./\1', open(p.fileName(), encoding="utf-8").read())
open(p.fileName(), "w", encoding="utf-8").write(txt)

if DEMO:   # rendu de contrôle (sans fond IGN hors ligne)
    atlas.beginRender(); atlas.first()
    ex = QgsLayoutExporter(lay); s = QgsLayoutExporter.ImageExportSettings(); s.dpi = 110
    print("png :", ex.exportToImage(os.path.join(D, "controle.png"), s))
    atlas.endRender()
app.exitQgis()
