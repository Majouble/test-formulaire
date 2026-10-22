import sys
from qgis.core import QgsApplication, QgsProject
QgsApplication.setPrefixPath("/usr", True); app = QgsApplication([], False); app.initQgis()
p = QgsProject.instance(); print("lu", p.read(sys.argv[1])); lay = p.layoutManager().layouts()[0]
print("dpi", lay.renderContext().dpi(), "pdfTextFormat", lay.customProperty("pdfTextFormat"), "défaut projet", p.labelingEngineSettings().defaultTextRenderFormat(), "pages", lay.atlas().updateFeatures())
app.exitQgis()
