# Tests des widgets du socle v2

Scénarios Playwright qui ouvrent les widgets (`v2/…`) dans Chromium avec un **faux Grist en mémoire** (`mock.js`, `fakeapi.js`, `mock-saisie.js`) et des documents d'essai (`donnees/`). Ils affichent ce qu'ils observent (comptes, textes, contenus écrits dans le document) et enregistrent des captures dans `sorties/`. Aucune donnée réelle : les documents d'essai sont fictifs.

## Lancer

```sh
cd tests
npm install
npx playwright install chromium     # ou : CHROMIUM=/chemin/vers/chromium
sh lancer.sh                        # suite actuelle (run63 à run81)
sh lancer.sh run74 run76            # quelques scénarios
```

`lancer.sh` écrit la sortie de chaque scénario dans `sorties/journaux/` et signale un échec en cas d'erreur de page ou d'exception. `run68` dépend du jour : il vise les créneaux du jour dans le planning d'essai (semaine du 19/10/2026) et échoue un jour sans créneau. Les scénarios n'ont pas d'assertions : comparez les journaux avec la description de la version dans `v2/README.md`.

Les scénarios de l'atlas (run63 à run69, run73) exportent un zip ; pour vérifier le rendu QGIS : `QT_QPA_PLATFORM=offscreen python3.12 qgis/rendu.py <dossier>/atlas.qgs page.png Versailles` (PyQGIS 3.34). `qgis/poids_pdf.py` mesure le poids du PDF selon la résolution ; `PYTHON=python3.12 sh qgis/refaire_modele.sh` reconstruit le modèle QGIS intégré (python3.12 : l'interpréteur qui a PyQGIS).

## Suite actuelle

| Scénario | Ce qu'il vérifie |
|---|---|
| `run63` | Export « Atlas QGIS » du widget de cartographie |
| `run64` | Export « Atlas QGIS » du widget de cartographie |
| `run65` | Export « Atlas QGIS » du widget de cartographie |
| `run66` | Export « Atlas QGIS » du widget de cartographie |
| `run67` | 2.1 : profils d'atlas (Config), tableau libre, regroupement, modèle QGIS déposé |
| `run68` | Planning : mobilisation de plusieurs agents d'un coup (recherche + cases à cocher), lignes repliées |
| `run69` | 2.1 : profils d'atlas (Config), tableau libre, regroupement, modèle QGIS déposé |
| `run70` | Installation : colonnes Etat_plus_grave et Nb_jours_mobilisation proposées et créées |
| `run71` | Planning : vue Grille (saisie clavier, bloc, champ, coller Excel, enregistrement) |
| `run72` | Équipe et fonction habituelle des agents : liste (filtre, tri, modification en ligne, import), planning (filtre, tri, groupes, Espace) |
| `run73` | Atlas : établissements cités dans une sous-table (référence au référentiel) : points propres, pages, encarts, étiquettes |
| `run74` | Onglet « À vérifier » : sections (SEGPA), doublons, établissements, qualifications, saisies d'essai |
| `run75` | Saisie : SEGPA choisie à la création → alerte et bascule sur le collège |
| `run76` | Question tableau historisée : une copie des lignes par version, mouvements Ajout / Modification / Inchangée / Retrait |
| `run77` | Installation : étape « Historiser la sous-table » puis colonnes créées |
| `run78` | Formulaire par site (ESR) : reprise du dernier état connu de chaque site, qualification déduite en bas, contrôle de cohérence |
| `run79` | Admin : rapprochement des sites saisis (Référentiel), modèle de formulaire « Enseignement supérieur par site » |
| `run80` | Admin : changer le modèle d'un formulaire existant (standard ↔ enseignement supérieur par site) |
| `run81` | Référentiel : import du classeur du référentiel ESR (donnees/referentiel_esr_essai.xlsx, fictif, refait par donnees/fabriquer_referentiel_esr.py ; `CLASSEUR=…` pour essayer un vrai classeur), puis recherche et sites d'une composante dans le formulaire par site |

## Scénarios plus anciens

Écrits pour des versions antérieures (jusqu'à 2.0) : certains visent des écrans qui ont changé depuis et peuvent échouer. Utiles comme exemples de mise en place (documents d'essai, faux Grist).

| Scénario | Ce qu'il vérifiait |
|---|---|
| `run2` | — |
| `run3` | — |
| `run4` | — |
| `run5` | — |
| `run6` | — |
| `run7` | — |
| `run8` | — |
| `run9` | — |
| `run10` | — |
| `run11` | — |
| `run12` | — |
| `run13` | — |
| `run14` | — |
| `run15` | — |
| `run16` | — |
| `run17` | — |
| `run18` | — |
| `run19` | — |
| `run20` | — |
| `run21` | — |
| `run22` | — |
| `run23` | — |
| `run24` | — |
| `run25` | — |
| `run26` | — |
| `run27` | — |
| `run28` | — |
| `run29` | — |
| `run30` | — |
| `run31` | — |
| `run32` | — |
| `run33` | — |
| `run34` | — |
| `run35` | — |
| `run36` | — |
| `run37` | — |
| `run38` | — |
| `run39` | — |
| `run40` | — |
| `run41` | — |
| `run42` | — |
| `run43` | — |
| `run44` | — |
| `run45` | — |
| `run46` | — |
| `run47` | — |
| `run48` | — |
| `run49` | — |
| `run50` | — |
| `run51` | 2.0.1 : temps des onglets Équipe / Planning (référentiel de 68 000 lignes), installation (Auteur, Administration), |
| `run52` | — |
| `run53` | 2.0.2 : académies dans l'onglet Référentiel ; règles d'accès (anciennes règles à condition vide → bandeau, remplacement) |
| `run54` | — |
| `run55` | — |
| `run56` | 2.0.4 : second champ (MESRE) dans le même document |
| `run57` | — |
| `run58` | — |
| `run59` | — |
| `run60` | Onglet Équipe fusionné : sous-onglets Agents, Planning, Pages de saisie |
| `run61` | — |
| `run62` | Export « Atlas QGIS » du widget de cartographie |
