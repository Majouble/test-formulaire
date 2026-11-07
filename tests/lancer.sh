#!/bin/sh
# Lance la suite actuelle (ou les scénarios donnés : sh lancer.sh saisie-segpa pieces-jointes) et résume les erreurs de page.
# Prérequis : Node 18+, « npm install » dans ce dossier, puis « npx playwright install chromium » (ou CHROMIUM=…).
cd "$(dirname "$0")"
SUITE="atlas-export atlas-export-colonnes-renommees atlas-export-jours-mobilisation atlas-export-derniere-version atlas-profils planning-mobilisation-groupee atlas-profils-regroupement-par-jour installation-colonnes-de-suivi planning-vue-grille equipe-et-planning-fonctions atlas-etablissements-sous-table a-verifier-anomalies saisie-segpa question-tableau-historisee installation-historiser-sous-table sites-esr-reprise-dernier-etat admin-rapprochement-sites admin-changer-modele-formulaire referentiel-esr-import-classeur admin-relier-referentiel-sites referentiel-sites-widget sites-esr-cas-du-terrain referentiel-site-hors-referentiel referentiel-fiche-etablissement referentiel-esr-ecoles-ingenieurs referentiel-sites-a-verifier referentiel-sites-modification-par-lot referentiel-sites-corriger-saisies referentiel-sites-corriger-saisies-colonne-ref sites-esr-site-obligatoire sites-esr-reprise-reglable rapprochement-sites-anciens-noms sites-desactives referentiel-sites-recherche-adresse sites-esr-sites-mis-de-cote secours-kit-deux-postes secours-mode-veille admin-carte-mode-secours secours-formules-de-suivi atlas-superieur-tous-risques a-verifier-modifier-supprimer admin-renommer-table-question-tableau pieces-jointes pieces-jointes-liens-etablissement atlas-national-superieur validation-et-campagnes referentiel-effectifs veille-meteo tableau-de-bord-ordre-colonnes acces-referentiel-sites extractions-widget tableau-de-bord-barres-empilees logo-prisme tableau-de-bord-series-inversees a-verifier-rattacher-dossier sites-esr-suppression-site extractions-colonnes-numeriques extractions-filtres-multiples admin-reglages-saisie saisie-diagnostic saisie-previsionnel"
[ $# -gt 0 ] && SUITE="$*"
mkdir -p sorties/journaux
echec=0
for t in $SUITE; do
  if timeout 300 node "$t.spec.js" > "sorties/journaux/$t.txt" 2>&1 && ! grep -q "PAGEERROR\|Error:" "sorties/journaux/$t.txt"; then
    echo "ok      $t"
  else
    echo "ÉCHEC   $t  (voir sorties/journaux/$t.txt)"; echec=1
  fi
done
exit $echec
