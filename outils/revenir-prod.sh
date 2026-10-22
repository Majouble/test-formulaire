#!/bin/sh
# Remet prod/ (adresse des documents en production) dans l'état d'une version publiée, sans toucher à v2/.
# Usage, depuis la racine du dépôt : sh outils/revenir-prod.sh 2.12.0      (sh outils/revenir-prod.sh : liste des versions)
# La version est retrouvée dans l'historique de prod/ (étiquette v2.12.0 si elle existe, sinon le commit qui l'a publiée).
# Puis : git commit -m "Retour de prod à 2.12.0" && git push   (GitHub Pages met quelques minutes à suivre).
# Pour revenir ensuite à la dernière version : sh outils/publier-prod.sh
set -e
cd "$(dirname "$0")/.."
versions() { git log --format=%H -- prod/commun/socle.js | while read -r c; do
  v=$(git show "$c:prod/commun/socle.js" 2>/dev/null | sed -n 's/.*const VERSION = "\([0-9][0-9.]*\).*/\1/p'); [ -n "$v" ] && echo "$v $c"; done | awk '!vu[$1]++'; }
if [ -z "$1" ]; then echo "Versions publiées (la plus récente d'abord) :"; versions | awk '{print "  " $1 "  (" substr($2, 1, 7) ")"}'; exit 0; fi
v="${1#v}"
if git rev-parse -q --verify "refs/tags/v$v" >/dev/null; then ref="v$v"; else ref=$(versions | awk -v v="$v" '$1 == v { print $2; exit }'); fi
[ -n "$ref" ] || { echo "Version $v introuvable dans l'historique de prod/. Versions publiées :" >&2; versions | awk '{print "  " $1}' >&2; exit 1; }
git rm -rq --cached prod >/dev/null 2>&1 || true
rm -rf prod
git checkout "$ref" -- prod
echo "prod/ = $(sed -n 's/.*const VERSION = "\([^"]*\)".*/\1/p' prod/commun/socle.js) — à valider : git commit -m \"Retour de prod à $v\" && git push"
