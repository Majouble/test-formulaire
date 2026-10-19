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
from qgis.core import QgsInvertedPolygonRenderer, QgsPointDisplacementRenderer
from qgis.PyQt.QtGui import QColor, QFont, QPainter
from qgis.PyQt.QtCore import Qt, QSizeF

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
det = couche("signalements_detail.geojson", "signalements_detail")   # un point par signalement, hors mise en page
zones = couche("zones.geojson", "zones")   # zones denses calculées par le widget : cadres sur la carte et encarts de zoom
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
# voile gris hors de l'académie de la page : elle ressort, les voisines restent lisibles (opacité réglable dans la symbologie)
rv = QgsRuleBasedRenderer.Rule(None)
rv.appendChild(QgsRuleBasedRenderer.Rule(QgsFillSymbol.createSimple({"color": "95,95,110,95", "outline_style": "no"}), 0, 0, '@atlas_pagename IS NULL OR "nom" = @atlas_pagename', "Académie de la page"))
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
# --- étiquettes : deux règles. Établissements de l'académie : jamais supprimées (chevauchement accepté en dernier recours),
# avec un trait de rappel quand l'étiquette est déplacée ; masquées sur la carte principale dans une zone d'encart (l'encart
# les montre). Académies voisines : plus petites, grises, retirées si elles gênent.
from qgis.core import QgsRuleBasedLabeling, QgsSimpleLineCallout
P = getattr(QgsPalLayerSettings, "Property", QgsPalLayerSettings)   # énumération déplacée selon les versions de QGIS
# taille des étiquettes (pt) : variable du projet atlas_etiquette (réglée par le widget) ; voisines 1 pt plus petites.
# Noms longs coupés à 26 caractères. Position : celle calculée par le widget (champs Lx/Ly sur la carte, Ex/Ey dans
# l'encart, alignements La/Lv et Ea/Ev), avec un trait de rappel quand l'étiquette est écartée de son point ;
# à défaut (champ vide), placement automatique de QGIS autour du point.
POS = lambda carte, encart: f"CASE WHEN @map_id = 'carte' THEN attribute(@feature, '{carte}') WHEN @map_id LIKE 'encart%' THEN attribute(@feature, '{encart}') END"
def etiquettes(taille, couleur, gras, priorite, chevauchement, montrer=None, positions=False):
    lab = QgsPalLayerSettings(); lab.fieldName = '"Etiquette"'; lab.isExpression = True
    lab.autoWrapLength = 26; lab.useMaxLineLengthForAutoWrap = True
    tf = QgsTextFormat(); f = QFont("DejaVu Sans"); f.setBold(gras); tf.setFont(f); tf.setSize(taille); tf.setColor(QColor(couleur))
    b = QgsTextBufferSettings(); b.setEnabled(True); b.setSize(0.8); b.setColor(QColor("white")); tf.setBuffer(b)
    lab.setFormat(tf); lab.placement = Qgis.LabelPlacement.OrderedPositionsAroundPoint; lab.dist = 1.0; lab.priority = priorite
    ps = lab.placementSettings(); ps.setOverlapHandling(chevauchement); ps.setAllowDegradedPlacement(True); lab.setPlacementSettings(ps)
    co = QgsSimpleLineCallout(); co.setEnabled(True); co.setMinimumLength(1.5); co.setDrawCalloutToAllParts(False)
    co.lineSymbol().setColor(QColor(couleur)); co.lineSymbol().setWidth(0.2); lab.setCallout(co)
    ddl = lab.dataDefinedProperties()
    ddl.setProperty(P.Size, QgsProperty.fromExpression(f"coalesce(to_real(@atlas_etiquette), 5.5) - {0 if gras else 1}"))
    if montrer: ddl.setProperty(P.Show, QgsProperty.fromExpression(montrer))
    if positions:
        for prop, carte, encart in ((P.PositionX, "Lx", "Ex"), (P.PositionY, "Ly", "Ey"), (P.Hali, "La", "Ea"), (P.Vali, "Lv", "Ev")):
            ddl.setProperty(prop, QgsProperty.fromExpression(POS(carte, encart)))
    lab.setDataDefinedProperties(ddl)
    return lab
regles = QgsRuleBasedLabeling.Rule(None)
r_page = QgsRuleBasedLabeling.Rule(etiquettes(6.5, "#1d1d4f", True, 9, Qgis.LabelOverlapHandling.AllowOverlapIfRequired,
    "NOT (@map_id = 'carte' AND coalesce(attribute(@feature, 'Zoom'), 0) > 0) AND coalesce(" + POS("Lh", "Eh") + ", 0) = 0", positions=True), 0, 0, DANS_PAGE, "Académie de la page")
r_voisins = QgsRuleBasedLabeling.Rule(etiquettes(5.5, "#696982", False, 3, Qgis.LabelOverlapHandling.PreventOverlap), 0, 0, "ELSE", "Académies voisines")
r_voisins.setIsElse(True); regles.appendChild(r_page); regles.appendChild(r_voisins)
sig.setLabeling(QgsRuleBasedLabeling(regles)); sig.setLabelsEnabled(True)

# --- zones d'encart : cadre pointillé numéroté, sur la carte principale seulement (pas dans les encarts eux-mêmes)
ZONE_PAGE = "@map_id = 'carte' AND \"page\" = @atlas_pagename"
rz = QgsRuleBasedRenderer.Rule(None)
rz.appendChild(QgsRuleBasedRenderer.Rule(QgsFillSymbol.createSimple({"color": "0,0,0,0", "outline_color": "0,0,145,255", "outline_width": "0.45", "outline_style": "dash"}), 0, 0, ZONE_PAGE, "Zone d'encart"))
zones.setRenderer(QgsRuleBasedRenderer(rz))
lz = QgsPalLayerSettings(); lz.fieldName = '"num"'; lz.isExpression = True
tz = QgsTextFormat(); fz = QFont("DejaVu Sans"); fz.setBold(True); tz.setFont(fz); tz.setSize(7); tz.setColor(QColor("white"))
from qgis.core import QgsTextBackgroundSettings
bg = QgsTextBackgroundSettings(); bg.setEnabled(True); bg.setFillColor(QColor("#000091")); bg.setStrokeColor(QColor("#000091")); bg.setSize(QSizeF(0.6, 0.3)); tz.setBackground(bg)
lz.setFormat(tz); lz.placement = Qgis.LabelPlacement.OverPoint
pz = lz.placementSettings(); pz.setOverlapHandling(Qgis.LabelOverlapHandling.AllowOverlapIfRequired); lz.setPlacementSettings(pz)
dz = lz.dataDefinedProperties()
dz.setProperty(P.PositionX, QgsProperty.fromExpression("x_min($geometry)")); dz.setProperty(P.PositionY, QgsProperty.fromExpression("y_max($geometry)"))
dz.setProperty(P.Hali, QgsProperty.fromValue("Left")); dz.setProperty(P.Vali, QgsProperty.fromValue("Top"))
dz.setProperty(P.Show, QgsProperty.fromExpression(ZONE_PAGE)); lz.setDataDefinedProperties(dz); lz.priority = 10
zones.setLabeling(QgsVectorLayerSimpleLabeling(lz)); zones.setLabelsEnabled(True)

# détail : points superposés d'un même établissement écartés en cercle ; à catégoriser par « Qualification » dans QGIS
ds = QgsMarkerSymbol.createSimple({"name": "circle", "color": "0,0,145,255", "outline_color": "255,255,255,255", "outline_width": "0.3", "size": "2.4"})
dr = QgsPointDisplacementRenderer("Etiquette"); dr.setEmbeddedRenderer(QgsSingleSymbolRenderer(ds)); dr.setTolerance(1.5); det.setRenderer(dr)
for l in (terres, plan, relief, dep, voile, aca, rep, sig, det, zones): p.addMapLayer(l, False)
arbre = p.layerTreeRoot()
arbre.addLayer(zones)
arbre.addLayer(det).setItemVisibilityChecked(False)
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
QgsExpressionContextUtils.setProjectVariable(p, "atlas_etiquette", "5")

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
# titre sur deux lignes au besoin
texte("[% @atlas_titre %]", 56, 5, 116, 12, 10, "#ffffff", True, Qt.AlignHCenter, fond=MARINE, nom="titre")
texte("[% @atlas_date %]", 174, 5, 30, 12, 10.5, ORANGE, True, Qt.AlignHCenter, cadre=ORANGE, nom="date")

loc = QgsLayoutItemMap(lay); loc.setId("reperage"); lay.addLayoutItem(loc); place(loc, 6, 24, 36, 32)
loc.setLayers([rep]); loc.setKeepLayerSet(True); loc.setCrs(QgsCoordinateReferenceSystem("EPSG:2154"))
loc.zoomToExtent(QgsRectangle(90000, 6040000, 1250000, 7120000)); loc.setFrameEnabled(True); loc.setBackgroundColor(QColor("#ffffff"))
# Outre-mer : chaque territoire dans sa projection officielle (UTM locale), nord en haut ; en Lambert-93 ils seraient
# fortement tournés, loin du méridien central. Carte principale et carte de repérage suivent l'académie de la page.
CRS_PAGE = ("CASE WHEN @atlas_pagename IN ('Guadeloupe', 'Martinique') THEN 'EPSG:5490' WHEN @atlas_pagename = 'Guyane' THEN 'EPSG:2972' "
            "WHEN @atlas_pagename = 'La Réunion' THEN 'EPSG:2975' WHEN @atlas_pagename = 'Mayotte' THEN 'EPSG:4471' ELSE 'EPSG:2154' END")
OUTRE_MER = "@atlas_pagename IN ('Guadeloupe', 'Martinique', 'Guyane', 'La Réunion', 'Mayotte')"
from qgis.core import QgsLayoutObject
loc.dataDefinedProperties().setProperty(QgsLayoutObject.MapCrs, QgsProperty.fromExpression(CRS_PAGE))
# repérage outre-mer : le territoire et ses abords (carré centré, 1,6 fois sa plus grande dimension)
G_PAGE = f"transform(@atlas_geometry, 'EPSG:2154', {CRS_PAGE})"
def bord(fixe, axe, signe):
    centre = f"{axe}(centroid(@g))"; demi = "max(bounds_width(@g), bounds_height(@g)) * 0.8"
    return QgsProperty.fromExpression(f"CASE WHEN {OUTRE_MER} THEN with_variable('g', {G_PAGE}, {centre} {signe} {demi}) ELSE {fixe} END")
for prop, fixe, axe, signe in ((QgsLayoutObject.MapXMin, 90000, "x", "-"), (QgsLayoutObject.MapXMax, 1250000, "x", "+"),
                               (QgsLayoutObject.MapYMin, 6040000, "y", "-"), (QgsLayoutObject.MapYMax, 7120000, "y", "+")):
    loc.dataDefinedProperties().setProperty(prop, bord(fixe, axe, signe))
texte("Académie :", 46, 25, 76, 9, 14, "#9a9a9a", True, nom="academie_etiquette")
texte("[% @atlas_pagename %]", 46, 35, 76, 14, 19, MARINE, True, nom="academie_nom")

carte = QgsLayoutItemMap(lay); carte.setId("carte"); lay.addLayoutItem(carte); place(carte, 6, 56, 198, 134)
carte.setCrs(QgsCoordinateReferenceSystem("EPSG:2154")); carte.zoomToExtent(QgsRectangle(800000, 6200000, 1080000, 6420000))
carte.setAtlasDriven(True); carte.setAtlasScalingMode(QgsLayoutItemMap.Auto); carte.setAtlasMargin(0.06); carte.setFrameEnabled(True)
carte.dataDefinedProperties().setProperty(QgsLayoutObject.MapCrs, QgsProperty.fromExpression(CRS_PAGE))

leg = QgsLayoutItemLegend(lay); leg.setId("legende"); lay.addLayoutItem(leg)
leg.setTitle("Légende :"); leg.setLinkedMap(carte); leg.setAutoUpdateModel(False); leg.setWrapString("|")
arbre_leg = leg.model().rootGroup(); arbre_leg.removeAllChildren()   # arbre propre à la légende (enregistré dans le projet)
for l, titre in ((sig, "Établissements signalés|(atténués : académies voisines)"), (dep, "Départements"), (aca, "Académie")):
    arbre_leg.addLayer(l).setCustomProperty("legend/title-label", titre)   # titre dans la légende, sans renommer la couche
leg.setBackgroundEnabled(True); leg.setBackgroundColor(QColor("#ffffff")); leg.setFrameEnabled(True)
leg.setFrameStrokeColor(QColor("#c8c8d8")); leg.setFrameStrokeWidth(QgsLayoutMeasurement(0.25, MM))
for st, taille, gr in ((QgsLegendStyle.Title, 7.5, True), (QgsLegendStyle.Group, 6.5, False), (QgsLegendStyle.Subgroup, 6.5, False), (QgsLegendStyle.SymbolLabel, 6.5, False)):
    s = leg.style(st); fo = QFont("DejaVu Sans"); fo.setBold(gr); tfo = s.textFormat(); tfo.setFont(fo); tfo.setSize(taille); s.setTextFormat(tfo); leg.setStyle(st, s)
# légende dans l'en-tête, à droite du nom de l'académie : elle ne cache jamais la carte. Taille fixe, deux colonnes ;
# un titre trop long se coupe avec « | » (ex. « Établissements signalés|(atteintes aux personnes) »)
for st, haut in ((QgsLegendStyle.Title, None), (QgsLegendStyle.Group, 1.6), (QgsLegendStyle.Subgroup, 1.6), (QgsLegendStyle.Symbol, 1.1), (QgsLegendStyle.SymbolLabel, 1.1)):
    s = leg.style(st)
    if haut is not None: s.setMargin(QgsLegendStyle.Top, haut)
    else: s.setMargin(QgsLegendStyle.Bottom, 1.5)
    leg.setStyle(st, s)
leg.setColumnCount(2); leg.setSplitLayer(True); leg.setEqualColumnWidth(False); leg.setColumnSpace(3); leg.setBoxSpace(1.5)
leg.setSymbolWidth(3.5); leg.setSymbolHeight(2.8); leg.setResizeToContents(False); place(leg, 124, 21, 80, 34)

ech = QgsLayoutItemScaleBar(lay); ech.setId("echelle"); lay.addLayoutItem(ech); ech.setLinkedMap(carte); ech.setStyle("Single Box")
ech.applyDefaultSize(QgsUnitTypes.DistanceKilometers); ech.setUnits(QgsUnitTypes.DistanceKilometers); ech.setUnitLabel("km"); ech.setNumberOfSegments(2); ech.setNumberOfSegmentsLeft(0)
fe = QgsTextFormat(); fe.setFont(QFont("DejaVu Sans")); fe.setSize(7); ech.setTextFormat(fe)
from qgis.core import QgsScaleBarSettings
ech.setSegmentSizeMode(QgsScaleBarSettings.SegmentSizeFitWidth); ech.setMinimumBarWidth(18); ech.setMaximumBarWidth(36)
ech.setBackgroundEnabled(True); ech.setBackgroundColor(QColor(255, 255, 255, 200)); ech.refresh(); place(ech, 152, 178, 48, 10)
# --- encarts de zoom (jusqu'à 3 par page) : position, taille et emprise lues dans zones.geojson (calculées par le widget,
# sur une partie peu chargée de la carte) ; hors page et exclus de l'export quand la page en a moins
from qgis.core import QgsLayoutObject, QgsLayoutItemMap as _M
for k in (1, 2, 3):
    zone = f"get_feature('{zones.id()}', 'cle', @atlas_pagename || '#{k}')"   # couche désignée par son identifiant : renommable
    absent = f"{zone} IS NULL"
    val = lambda champ, defaut: QgsProperty.fromExpression(f"coalesce(attribute({zone}, '{champ}'), {defaut})")
    enc = QgsLayoutItemMap(lay); enc.setId(f"encart{k}"); lay.addLayoutItem(enc); place(enc, 230, 60 + 50 * k, 60, 44)
    enc.setCrs(QgsCoordinateReferenceSystem("EPSG:2154")); enc.zoomToExtent(QgsRectangle(800000, 6200000, 900000, 6270000))
    enc.setFrameEnabled(True); enc.setFrameStrokeColor(QColor("#000091")); enc.setFrameStrokeWidth(QgsLayoutMeasurement(0.6, MM)); enc.setBackgroundColor(QColor("#ffffff"))
    dd = enc.dataDefinedProperties()
    for prop, champ, defaut in ((QgsLayoutObject.PositionX, "px", 230), (QgsLayoutObject.PositionY, "py", 60), (QgsLayoutObject.ItemWidth, "pw", 60), (QgsLayoutObject.ItemHeight, "ph", 44),
                                (QgsLayoutObject.MapXMin, "xmin", 800000), (QgsLayoutObject.MapXMax, "xmax", 900000), (QgsLayoutObject.MapYMin, "ymin", 6200000), (QgsLayoutObject.MapYMax, "ymax", 6270000)):
        dd.setProperty(prop, val(champ, defaut))
    dd.setProperty(QgsLayoutObject.ExcludeFromExports, QgsProperty.fromExpression(absent)); enc.setDataDefinedProperties(dd)
    num = texte(str(k), 230, 60 + 50 * k, 4.5, 4.5, 7, "#ffffff", True, Qt.AlignHCenter, fond="#000091", nom=f"encart{k}_numero")
    dn = num.dataDefinedProperties()
    dn.setProperty(QgsLayoutObject.PositionX, val("px", 230)); dn.setProperty(QgsLayoutObject.PositionY, val("py", 60))
    dn.setProperty(QgsLayoutObject.ExcludeFromExports, QgsProperty.fromExpression(absent)); num.setDataDefinedProperties(dn)
texte("Sources : signalements (Grist) ; IGN Admin Express ; fond IGN Géoplateforme", 6, 190.5, 104, 4, 5.5, "#666666", nom="sources")
# compte des établissements de l'académie, et rappel quand le tableau n'en montre qu'une partie
# nombre d'établissements de la page : champ Nb_etablissements des académies, écrit par le widget
NB = "coalesce(attribute(@atlas_feature, 'Nb_etablissements'), 0)"
texte("[% with_variable('n', " + NB + ", CASE WHEN to_int(@atlas_lignes) > 0 AND @n > to_int(@atlas_lignes) "
      "THEN @n || ' établissements signalés — le tableau présente les ' || @atlas_lignes || ' plus signalés' "
      "ELSE @n || CASE WHEN @n > 1 THEN ' établissements signalés' ELSE ' établissement signalé' END END) %]",
      110, 190.5, 94, 4, 6, MARINE, True, Qt.AlignRight, nom="compte")

tab = QgsLayoutItemAttributeTable.create(lay); tab.setVectorLayer(sig)
cols = []
# colonnes facultatives (REP… Nb_jours) : le widget retire celles qui ne sont pas cochées et donne la place restante
# à « Établissement » (largeurs en mm ; garder les mêmes valeurs dans COLONNES_ATLAS du widget)
for champ, titre, largeur in (("DSDEN", "DSDEN", 36), ("Commune", "Commune", 24), ("UAI", "UAI", 16), ("Type_libelle", "Type", 19), ("Etablissement", "Établissement", 44),
                              ("REP", "REP/REP+", 18), ("Internat", "Internat ?", 14), ("Qualification_principale", "Qualification", 26),
                              ("Nb_signalements", "Signal.", 12), ("Nb_jours", "Jours de mobilisation", 30)):
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
# pages : académies ayant au moins un établissement retenu (champ écrit par le widget ; aucune référence au nom
# d'une couche, qu'on peut donc renommer librement dans QGIS)
atlas.setFilterFeatures(True); atlas.setFilterExpression("coalesce(\"Nb_etablissements\", 0) > 0")
atlas.setFilenameExpression("'atlas_' || \"nom\"")
p.layoutManager().addLayout(lay)
assert p.write(), "écriture du projet impossible"
print("carte :", carte.sizeWithUnits().height(), "| table :", cad.positionWithUnits().y())
print("projet écrit :", p.fileName(), "| pages d'atlas :", atlas.updateFeatures())
# chemins de secours (couverture de l'atlas, table, légende) : relatifs eux aussi, pour un projet déplaçable
# (selon la version de QGIS, le chemin relatif écrit peut être « ../fichier » quand le projet n'existait pas encore : on normalise)
import re
txt = re.sub(r'(?:\.\./|\./|' + re.escape(D) + r'/)((?:academies|departements|signalements_detail|signalements|zones)\.geojson)', r'./\1', open(p.fileName(), encoding="utf-8").read())
open(p.fileName(), "w", encoding="utf-8").write(txt)

if DEMO:   # rendu de contrôle (sans fond IGN hors ligne)
    atlas.beginRender(); atlas.first()
    ex = QgsLayoutExporter(lay); s = QgsLayoutExporter.ImageExportSettings(); s.dpi = 110
    print("png :", ex.exportToImage(os.path.join(D, "controle.png"), s))
    atlas.endRender()
app.exitQgis()
