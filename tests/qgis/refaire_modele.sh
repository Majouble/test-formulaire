#!/bin/sh
# Reconstruit le modèle QGIS intégré (v2/cartographie/atlas/atlas.qgs) avec construire_atlas.py (PyQGIS 3.34, sans écran).
# Données d'exemple : qgis/modele/ (points, pages, zones) + contours du widget. Usage : sh tests/qgis/refaire_modele.sh
# PYTHON : interpréteur qui a PyQGIS (ex. PYTHON=python3.12) ; par défaut python3.
set -e
cd "$(dirname "$0")"
racine=$(cd ../.. && pwd); travail=$(mktemp -d)
cp modele/*.geojson "$travail/"
cp "$racine/v2/cartographie/atlas/academies.geojson" "$racine/v2/cartographie/atlas/departements.geojson" "$travail/"
QT_QPA_PLATFORM=offscreen ${PYTHON:-python3} "$racine/v2/cartographie/atlas/construire_atlas.py" "$travail"
cp "$travail/atlas.qgs" "$racine/v2/cartographie/atlas/atlas.qgs"
echo "Modèle écrit dans v2/cartographie/atlas/atlas.qgs (pensez à publier : sh outils/publier-prod.sh)"
