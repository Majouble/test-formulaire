import sys, os, time
from qgis.core import QgsApplication, QgsProject, QgsLayoutExporter, QgsRasterLayer, QgsLayoutRenderContext, Qgis
from qgis.PyQt.QtGui import QPainter
QgsApplication.setPrefixPath("/usr", True); app = QgsApplication([], False); app.initQgis()
projet, sortie, dpi, multiply, relief = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4] == "1", sys.argv[5] == "1"
p = QgsProject.instance(); p.read(projet)
for l in list(p.mapLayers().values()):
    if l.providerType() == "wms":
        nom = "relief.tif" if "Relief" in l.name() else "plan.tif"
        l.setDataSource(os.path.abspath(nom), l.name(), "gdal")
        if "Relief" in l.name():
            l.setBlendMode(QPainter.CompositionMode_Multiply if multiply else QPainter.CompositionMode_SourceOver)
            p.layerTreeRoot().findLayer(l.id()).setItemVisibilityChecked(relief)
lay = p.layoutManager().layouts()[0]; at = lay.atlas()
s = QgsLayoutExporter.PdfExportSettings(); s.dpi = dpi; s.simplifyGeometries = True
if len(sys.argv) > 6: s.textRenderFormat = Qgis.TextRenderFormat.AlwaysText
t = time.time(); r = QgsLayoutExporter.exportToPdf(at, sortie, s)
print(os.path.basename(sortie), r[0], round(os.path.getsize(sortie) / 1e6, 2), "Mo", round(time.time() - t, 1), "s", "pages", at.count())
app.exitQgis()
