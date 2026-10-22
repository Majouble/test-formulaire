#!/bin/sh
# Remet prod/ (adresse des documents en production) dans l'état d'une version publiée, sans toucher à v2/.
# Usage, depuis la racine du dépôt : sh outils/revenir-prod.sh 2.12.0   (versions : git tag -l "v*")
# Puis : git commit -m "Retour de prod à 2.12.0" && git push   (GitHub Pages met quelques minutes à suivre).
# Pour revenir ensuite à la dernière version : sh outils/publier-prod.sh
set -e
cd "$(dirname "$0")/.."
[ -n "$1" ] || { echo "Usage : sh outils/revenir-prod.sh <version>   (ex. 2.12.0)" >&2; git tag -l "v*" >&2; exit 1; }
tag="v${1#v}"
git rev-parse -q --verify "refs/tags/$tag" >/dev/null || { echo "Étiquette $tag introuvable. Versions disponibles :" >&2; git tag -l "v*" >&2; exit 1; }
git rm -rq --cached prod >/dev/null 2>&1 || true
rm -rf prod
git checkout "$tag" -- prod
version=$(sed -n 's/.*const VERSION = "\([^"]*\)".*/\1/p' prod/commun/socle.js)
echo "prod/ = $version (depuis $tag) — à valider : git commit -m \"Retour de prod à ${tag#v}\" && git push"
