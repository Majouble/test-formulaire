#!/bin/sh
# Fige la version de développement (v2/) dans prod/, l'adresse utilisée par les documents en production.
# Les adresses de secours écrites en dur (…/test-formulaire/v2/…) sont réécrites vers …/prod/.
# Usage, depuis la racine du dépôt : sh outils/publier-prod.sh
set -e
cd "$(dirname "$0")/.."
[ -f v2/commun/socle.js ] || { echo "v2/ introuvable" >&2; exit 1; }
version=$(sed -n 's/.*const VERSION = "\([^"]*\)".*/\1/p' v2/commun/socle.js)
case "$version" in *alpha*|*beta*|*dev*) echo "Version « $version » : une version de test ne part pas en production." >&2; exit 1;; esac
rm -rf prod
cp -R v2 prod
grep -rl "test-formulaire/v2/" prod | while read -r f; do
  sed -i.bak 's#test-formulaire/v2/#test-formulaire/prod/#g' "$f" && rm -f "$f.bak"
done
{
  echo "# Signalements Grist — production ($version)"
  echo
  echo "Copie figée de \`v2/\`, produite par \`outils/publier-prod.sh\`. Ne pas modifier ce dossier à la main :"
  echo "les changements se font dans \`v2/\`, puis on republie."
  echo
  sed '1d' v2/README.md | sed 's#test-formulaire/v2/#test-formulaire/prod/#g'
} > prod/README.md
echo "prod/ = $version"
echo "Après le commit : git tag -a v${version%% *} -m \"Production $version\" && git push --tags   (retour arrière : sh outils/revenir-prod.sh <version>)"
