#!/bin/sh
# Lance la suite actuelle (ou les scénarios donnés : sh lancer.sh run74 run76) et résume les erreurs de page.
# Prérequis : Node 18+, « npm install » dans ce dossier, puis « npx playwright install chromium » (ou CHROMIUM=…).
cd "$(dirname "$0")"
SUITE="run63 run64 run65 run66 run67 run68 run69 run70 run71 run72 run73 run74 run75 run76 run77 run78 run79"
[ $# -gt 0 ] && SUITE="$*"
mkdir -p sorties/journaux
echec=0
for t in $SUITE; do
  if timeout 300 node "$t.js" > "sorties/journaux/$t.txt" 2>&1 && ! grep -q "PAGEERROR\|Error:" "sorties/journaux/$t.txt"; then
    echo "ok      $t"
  else
    echo "ÉCHEC   $t  (voir sorties/journaux/$t.txt)"; echec=1
  fi
done
exit $echec
