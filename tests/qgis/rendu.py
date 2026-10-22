import sys, time
from qgis.core import QgsApplication, QgsProject, QgsLayoutExporter
QgsApplication.setPrefixPath("/usr", True); app = QgsApplication([], False); app.initQgis()
t = time.time(); p = QgsProject.instance(); assert p.read(sys.argv[1]); print("lecture", round(time.time() - t, 2), "s")
print({l.name(): (l.isValid(), l.crs().authid()) for l in p.mapLayers().values()})
lay = p.layoutManager().layouts()[0]; at = lay.atlas()
print("pages", at.updateFeatures()); at.beginRender()
for i in range(at.count()):
    at.seekTo(i)
    if at.nameForPage(i) == sys.argv[3]:
        t = time.time(); s = QgsLayoutExporter.ImageExportSettings(); s.dpi = 100
        print("rendu", at.nameForPage(i), QgsLayoutExporter(lay).exportToImage(sys.argv[2], s), round(time.time() - t, 2), "s")
at.endRender(); app.exitQgis()
