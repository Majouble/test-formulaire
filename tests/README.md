# Tests des widgets du socle v2

Scénarios Playwright qui ouvrent les widgets (`v2/…`) dans Chromium avec un **faux Grist en mémoire** (`mock.js`, `fakeapi.js`, `mock-saisie.js`) et des documents d'essai (`donnees/`). Ils affichent ce qu'ils observent (comptes, textes, contenus écrits dans le document) et enregistrent des captures dans `sorties/`. Aucune donnée réelle : les documents d'essai sont fictifs.

## Lancer

```sh
cd tests
npm install
npx playwright install chromium     # ou : CHROMIUM=/chemin/vers/chromium
node verifier.js                    # toute la suite, comparée aux journaux de référence
node verifier.js saisie-segpa pieces-jointes   # quelques scénarios
```

## Non-régression : `verifier.js`

Chaque scénario affiche ce qu'il observe : textes affichés, comptes, contenus écrits dans le document. `verifier.js` lance la suite, retire de ces journaux ce qui change d'une exécution à l'autre (heures, dates, horodatages, identifiants aléatoires, durées) et les compare aux journaux de référence de `references/`. Un scénario est en **échec** s'il produit une erreur de page ou s'arrête, en **écart** si ce qu'il observe diffère de la référence : c'est un changement de comportement, voulu ou non.

Quand un changement est voulu, on vérifie l'écart puis on enregistre la nouvelle référence : `node verifier.js --maj saisie-segpa`. Le commit montre alors, dans `references/`, exactement ce qui a changé à l'écran ou dans le document.

`secours-mode-veille` enchaîne des étapes chronométrées qui se chevauchent : son déroulé varie d'une exécution à l'autre. Ses écarts sont affichés (« instable ») sans compter comme échec ; il est à réécrire avec des attentes explicites.

Les scénarios qui ouvrent un serveur local (ports 87xx) passent l'un après l'autre ; les autres en parallèle (`PARALLELE=4` par défaut). Les scénarios du planning (`planning-mobilisation-groupee`, `planning-vue-grille`, `equipe-et-planning-fonctions`) figent la date au 21/10/2026, semaine du planning d'essai.

## Fuseaux horaires : `fuseaux.js`

PRISME affiche toutes les dates et heures à l'heure de Paris, quel que soit le fuseau du poste. `fuseaux.js` lance chaque scénario deux fois en même temps, le navigateur réglé à l'heure de Paris puis à celle d'un autre fuseau (La Réunion par défaut, `FUSEAU=America/Cayenne` pour la Guyane), et vérifie que les deux journaux sont identiques, heures et dates comprises. Le scénario lui-même (Node) reste à l'heure de Paris, pour que les données d'essai soient les mêmes (`fuseau-navigateur.js`, préchargé). Les scénarios à serveur local passent l'un après l'autre : leurs heures peuvent différer d'une minute.

`lancer.sh` reste disponible : il lance la suite sans comparaison et ne signale que les erreurs de page.

Les scénarios de l'atlas (`atlas-…`) exportent un zip ; pour vérifier le rendu QGIS : `QT_QPA_PLATFORM=offscreen python3.12 qgis/rendu.py <dossier>/atlas.qgs page.png Versailles` (PyQGIS 3.34). `qgis/poids_pdf.py` mesure le poids du PDF selon la résolution ; `PYTHON=python3.12 sh qgis/refaire_modele.sh` reconstruit le modèle QGIS intégré (python3.12 : l'interpréteur qui a PyQGIS).

## Suite actuelle

Un fichier `nom.spec.js` par scénario, nommé d'après ce qu'il vérifie ; son journal de référence est `references/nom.txt`. Un scénario peut reprendre le document d'essai d'un autre (`require('./sites-esr-reprise-dernier-etat.spec')`).

| Scénario | Ce qu'il vérifie |
|---|---|
| `atlas-export` | Export « Atlas QGIS » du widget de cartographie |
| `atlas-export-colonnes-renommees` | Export « Atlas QGIS » du widget de cartographie |
| `atlas-export-jours-mobilisation` | Export « Atlas QGIS » du widget de cartographie |
| `atlas-export-derniere-version` | Export « Atlas QGIS » du widget de cartographie |
| `atlas-profils` | 2.1 : profils d'atlas (Config), tableau libre, regroupement, modèle QGIS déposé |
| `planning-mobilisation-groupee` | Planning : mobilisation de plusieurs agents d'un coup (recherche + cases à cocher), lignes repliées |
| `atlas-profils-regroupement-par-jour` | 2.1 : profils d'atlas (Config), tableau libre, regroupement, modèle QGIS déposé |
| `installation-colonnes-de-suivi` | Installation : colonnes Etat_plus_grave et Nb_jours_mobilisation proposées et créées |
| `planning-vue-grille` | Planning : vue Grille (saisie clavier, bloc, champ, coller Excel, enregistrement) |
| `equipe-et-planning-fonctions` | Équipe et fonction habituelle des agents : liste (filtre, tri, modification en ligne, import), planning (filtre, tri, groupes, Espace) |
| `atlas-etablissements-sous-table` | Atlas : établissements cités dans une sous-table (référence au référentiel) : points propres, pages, encarts, étiquettes |
| `a-verifier-anomalies` | Onglet « À vérifier » : sections (SEGPA), doublons, établissements, qualifications, saisies d'essai |
| `saisie-segpa` | Saisie : SEGPA choisie à la création → alerte et bascule sur le collège |
| `saisie-diagnostic` | Saisie : bouton ⚙ Diagnostic (activité, colonnes et référentiel utilisés, questions conditionnelles), sans réglage modifiable |
| `saisie-previsionnel` | Saisie : bandeau vert « Prévisionnel » (dossier saisi avant le jour de ses faits, avec ou sans mise à jour depuis ; date des faits à venir pendant la saisie) |
| `question-tableau-historisee` | Question tableau historisée : une copie des lignes par version, mouvements Ajout / Modification / Inchangée / Retrait |
| `installation-historiser-sous-table` | Installation : étape « Historiser la sous-table » puis colonnes créées |
| `sites-esr-reprise-dernier-etat` | Formulaire par site (ESR) : reprise du dernier état connu de chaque site, qualification déduite en bas, contrôle de cohérence |
| `admin-rapprochement-sites` | Admin : rapprochement des sites saisis (Référentiel), modèle de formulaire « Enseignement supérieur par site » |
| `admin-changer-modele-formulaire` | Admin : changer le modèle d'un formulaire existant (standard ↔ enseignement supérieur par site) |
| `admin-reglages-saisie` | Admin : réglages de la saisie venus de son panneau ⚙ (nombres, limites et table forcée hérités, formulaire et version de chaque page, description automatique commune) ; « À vérifier » : version sur un autre établissement séparée en dossier à part |
| `referentiel-sites-recherche-adresse` | Widget « Référentiel des sites » : recherche par adresse robuste (texte nettoyé, 3 caractères minimum, coordonnées hors limites ignorées, message du service affiché) |
| `sites-esr-sites-mis-de-cote` | Formulaire par site : sites repris laissés de côté dans un nouveau signalement (✕), remis, non enregistrés, de nouveau proposés ensuite |
| `secours-kit-deux-postes` | Mode secours : kit hors ligne sur deux postes et un dossier partagé (saisie et mise à jour croisées, tableau de bord, tableau des signalements de A à Z et son .docx, rechargement, exports), copies en couches, puis réintégration dans Grist (renumérotation, références, sans doublon). Lancer d'abord `node ../outils/construire-secours.js` |
| `secours-mode-veille` | Mode veille : relais (code du workflow n8n, `relais-local.js`) et faux Grist (`faux-grist-api.js`) ; premières copies sans dépôt manuel, copie précédente, copie anormalement vide refusée, intervalle et plage horaire, nouvelle base, panne de Grist puis du relais, mode secours, retour du réseau, second poste |
| `admin-carte-mode-secours` | Administration, carte « Mode secours » : téléchargement du kit (version), du relais n8n préréglé (API, document, clé aléatoire, chemin propre), page de réintégration ; widgets servis en http |
| `pieces-jointes` | Pièces jointes : question « Pièces jointes » (administration, colonne simple adaptée aux liens d'établissement : colonne d'envoi + formule), photos et documents depuis le formulaire sur téléphone (photo lourde réduite, empreinte SHA-1), retrait, enregistrement dans la colonne d'envoi, mise à jour d'un dossier ; copie des colonnes pour les liens rafraîchie à l'adaptation |
| `pieces-jointes-liens-etablissement` | Pièces jointes et liens d'établissement : métadonnées illisibles, copie des colonnes périmée ou à jour : le formulaire écrit dans la colonne d'envoi, jamais dans la colonne en formule (formules strictes) ; dossier rouvert par un lien : vignette, ouverture dans un onglet, téléchargement avec les paramètres du lien (Etab_=…) et un jeton non limité, jamais placé dans la page |
| `atlas-national-superieur` | Atlas national appliqué au supérieur (85 établissements d'essai, `esr_essai.js`) : réglage « Tous risques », toutes les étiquettes gardées, pas d'abréviation scolaire devant les sigles, aucun point caché par un encart, tableau de 22 lignes |
| `veille-meteo` | 2.43 : veille météo — onglet Veille (carte, synthèse, établissements et élèves, campagne pré-ciblée, réglages, relais préréglé), relais n8n exécuté avec Météo-France, Grist et Tchap simulés, bandeau de vigilance de la saisie |
| `tableau-de-bord-ordre-colonnes` | 2.44 : tableau de bord — ordre des colonnes d'un tableau croisé : par valeur, ordre des choix dans Grist, ordre personnalisé (flèches, enregistré dans le bloc, repris par les séries du graphique), retour à l'ordre par défaut |
| `extractions-widget` | 2.45 : widget « Extractions » — page créée depuis l'onglet Tableau de bord, réglages tirés des rôles du socle, filtres, modèle enregistré pour tout le document, export Excel |
| `acces-referentiel-sites` | 2.44.5 : règles d'accès — référentiel des sites (visé par la sous-table des sites) et correspondances des sites modifiables par les agents mobilisés (compte ou lien d'invité), comme le référentiel des établissements |
| `tableau-de-bord-barres-empilees` | 2.45.1 : tableau de bord — barres horizontales empilées avec un nombre de valeurs distinctes (avant : forcées côte à côte) ; moyenne toujours côte à côte ; note du double compte seulement s'il a lieu (2.45.2) |
| `logo-prisme` | 2.46 : logo PRISME (`commun/marque.js`) — un seul logo, en haut à gauche : tableau de bord publié (barre construite par `tableau.js`), saisie sur ordinateur et téléphone, administration (pas de second logo dans l'onglet Tableau de bord) |
| `referentiel-effectifs` | 2.42 : effectifs des établissements (carte Effectifs de l'onglet Référentiel) : jeux DEPP par UAI aux champs différents, second candidat pour la voie professionnelle, somme pour un lycée polyvalent, dernière rentrée, académies couvertes ; SIES par identifiant Paysage ; colonne Effectif recopiée dans les réponses |
| `validation-et-campagnes` | 2.41 : circuit de validation (onglet Validation, viseurs, statut, règles d'accès par échelon et périmètre, file « à viser » de la saisie) et campagnes (lancement depuis le publipostage, suivi quotidien, relance CSV, « Rien à signaler » sur la page d'un établissement) |
| `admin-renommer-table-question-tableau` | Administration › Formulaires : renommer la table d'une question tableau (Grist, formulaires publiés et brouillons, profils d'atlas), nom déjà pris refusé, saisie dans la table renommée |
| `a-verifier-modifier-supprimer` | « À vérifier » : modifier une saisie sur place, supprimer une mise à jour (lignes de sites de cette version), supprimer un dossier entier, dans l'administration et le widget « Référentiel des sites » |
| `atlas-superieur-tous-risques` | Atlas QGIS ouvert au supérieur et à tous les risques : un point par site (référentiel des sites), couleurs et formes libres (colonne au choix, valeurs gardées), pages par région académique, France métropolitaine et France entière (outre-mer en encarts), réglages prêts à l'emploi, colonne du référentiel |
| `secours-formules-de-suivi` | Kit de secours : formules de suivi recalculées pour les lignes du mode secours (dernière version, état le plus grave, jours de mobilisation ; variante MESRE), tableau de bord à jour |
| `sites-desactives` | Sites désactivés du référentiel : écartés du rapprochement, de la reprise du dernier état (revenus à la normale) et des suggestions du formulaire |
| `rapprochement-sites-anciens-noms` | Rapprochement des sites saisis dans une colonne référence aux sites (anciens noms) : administration et widget « Référentiel des sites » (tous les établissements, établissement choisi), avec le contexte des signalements (date des faits, qualification, description) |
| `sites-esr-reprise-reglable` | Formulaire par site : reprise du dernier état des sites réglable — désactivée (par défaut, et pas de sites repris d'un signalement précédent), à la demande (bouton), automatique (ancien réglage) |
| `sites-esr-site-obligatoire` | Formulaire par site : site obligatoire et nom hors référentiel, ancien nom resté en texte dans la colonne référence |
| `referentiel-sites-corriger-saisies-colonne-ref` | « Corriger les saisies » sur une colonne référence aux sites qui garde les anciens noms (`referentiel-sites-corriger-saisies` avec l'option `ref`) |
| `referentiel-sites-corriger-saisies` | Widget « Référentiel des sites » : « Corriger les saisies » (sites tapés dans une sous-table, rattachés par lot, nouveau site, correspondances) |
| `referentiel-sites-modification-par-lot` | Widget « Référentiel des sites » : modification par lot (homonymes, mots-clés, statut, renommage, désactivation) et fusion de doublons |
| `referentiel-sites-a-verifier` | Widget « Référentiel des sites » : vue « À vérifier » (établissement placé, dossier corrigé, dossier rattaché) |
| `referentiel-esr-ecoles-ingenieurs` | Référentiel ESR : une école d'ingénieurs compte pour un établissement (import du classeur, puis référentiel en place) |
| `referentiel-fiche-etablissement` | Référentiel : fiche de l'établissement (effectif, tutelle, rattachement), ajout d'une information |
| `referentiel-site-hors-referentiel` | Référentiel : un site saisi hors référentiel devient un site du référentiel (nouveau site, correspondance, saisies complétées) |
| `sites-esr-cas-du-terrain` | Formulaire par site, cas du terrain : colonne du site en double, sans colonne hors référentiel, champ de recherche des sites ; contrôle du paramétrage dans l'administration |
| `referentiel-sites-widget` | Widget « Référentiel des sites » : établissement, carte, candidats IGN / OpenStreetMap / adresse (réponses simulées), ajout, placement, mots-clés, désactivation |
| `admin-relier-referentiel-sites` | Admin : tableau des sites sans colonne vers le référentiel des sites, bouton « Relier au référentiel des sites » |
| `referentiel-esr-import-classeur` | Référentiel : import du classeur du référentiel ESR (donnees/referentiel_esr_essai.xlsx, fictif, refait par donnees/fabriquer_referentiel_esr.py ; `CLASSEUR=…` pour essayer un vrai classeur), puis recherche et sites d'une composante dans le formulaire par site |
| `tableau-de-bord-series-inversees` | 2.46.1 : tableau de bord — abscisse et séries inversées (une courbe par ligne du tableau), comptes sans ligne à 0 (courbes continues), détail de la bonne case au clic sur un point |
| `a-verifier-rattacher-dossier` | 2.47 : « À vérifier » — rattacher un dossier à un autre (blocage le matin, occupation l'après-midi) : saisies devenues versions de la cible, une seule « Nouveau signalement », sites déplacés, doublon résolu |
| `sites-esr-suppression-site` | 2.50 : formulaire par site — reprise limitée aux sites du dernier dossier (ou du signalement choisi) ; suppression d'un site saisi à tort (🗑, annulable) : effacé de toutes les étapes et de la table dédiée, plus repris le lendemain |
| `extractions-colonnes-numeriques` | 2.51 : Extractions — colonnes d'identification numériques (Entier, Numérique, formule « Nombre de sites ») et dates en nombres et dates dans l'Excel ; tri numérique ; CSV à virgule décimale |
| `extractions-filtres-multiples` | 2.52 : Extractions — filtres sur plusieurs colonnes (opérateurs), combinaison en cascade ou autonomes (sans doublon, colonne « Filtres vérifiés »), focus gardé à la saisie, reprise de l'ancien filtre unique, paramètres de l'Excel |

## Fichiers d'appui

| Fichier | Rôle |
|---|---|
| `chemins.js` | Chemins du dépôt, des données d'essai, des sorties et du navigateur |
| `mock.js`, `fakeapi.js`, `mock-saisie.js` | Faux Grist en mémoire (API des widgets) |
| `faux-grist-api.js`, `relais-local.js` | Faux Grist côté serveur et relais n8n exécuté localement (mode veille) |
| `dossier-simule.js` | Dossier partagé simulé (kit de secours) |
| `esr_essai.js` | Établissements d'enseignement supérieur fictifs (atlas) |
| `atlas-document-essai.js` | Ancien scénario de l'atlas : les scénarios `atlas-…` y prennent la fonction `mkDoc` (document d'essai) |
