# Tests des widgets du socle v2

Scénarios Playwright qui ouvrent les widgets (`v2/…`) dans Chromium avec un **faux Grist en mémoire** (`mock.js`, `fakeapi.js`, `mock-saisie.js`) et des documents d'essai (`donnees/`). Ils affichent ce qu'ils observent (comptes, textes, contenus écrits dans le document) et enregistrent des captures dans `sorties/`. Aucune donnée réelle : les documents d'essai sont fictifs.

## Lancer

```sh
cd tests
npm install
npx playwright install chromium     # ou : CHROMIUM=/chemin/vers/chromium
node verifier.js                    # toute la suite, comparée aux journaux de référence
node verifier.js run74 run76        # quelques scénarios
```

## Non-régression : `verifier.js`

Chaque scénario affiche ce qu'il observe : textes affichés, comptes, contenus écrits dans le document. `verifier.js` lance la suite, retire de ces journaux ce qui change d'une exécution à l'autre (heures, dates, horodatages, identifiants aléatoires, durées) et les compare aux journaux de référence de `references/`. Un scénario est en **échec** s'il produit une erreur de page ou s'arrête, en **écart** si ce qu'il observe diffère de la référence : c'est un changement de comportement, voulu ou non.

Quand un changement est voulu, on vérifie l'écart puis on enregistre la nouvelle référence : `node verifier.js --maj run74`. Le commit montre alors, dans `references/`, exactement ce qui a changé à l'écran ou dans le document.

`run99` (mode veille) enchaîne des étapes chronométrées qui se chevauchent : son déroulé varie d'une exécution à l'autre. Ses écarts sont affichés (« instable ») sans compter comme échec ; il est à réécrire avec des attentes explicites.

Les scénarios qui ouvrent un serveur local (ports 87xx) passent l'un après l'autre ; les autres en parallèle (`PARALLELE=4` par défaut). Les scénarios du planning (`run68`, `run71`, `run72`) figent la date au 21/10/2026, semaine du planning d'essai.

`lancer.sh` reste disponible : il lance la suite sans comparaison et ne signale que les erreurs de page.

Les scénarios de l'atlas (run63 à run69, run73, run102) exportent un zip ; pour vérifier le rendu QGIS : `QT_QPA_PLATFORM=offscreen python3.12 qgis/rendu.py <dossier>/atlas.qgs page.png Versailles` (PyQGIS 3.34). `qgis/poids_pdf.py` mesure le poids du PDF selon la résolution ; `PYTHON=python3.12 sh qgis/refaire_modele.sh` reconstruit le modèle QGIS intégré (python3.12 : l'interpréteur qui a PyQGIS).

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
| `run96` | Widget « Référentiel des sites » : recherche par adresse robuste (texte nettoyé, 3 caractères minimum, coordonnées hors limites ignorées, message du service affiché) |
| `run97` | Formulaire par site : sites repris laissés de côté dans un nouveau signalement (✕), remis, non enregistrés, de nouveau proposés ensuite |
| `run98` | Mode secours : kit hors ligne sur deux postes et un dossier partagé (saisie et mise à jour croisées, tableau de bord, tableau des signalements de A à Z et son .docx, rechargement, exports), copies en couches, puis réintégration dans Grist (renumérotation, références, sans doublon). Lancer d'abord `node ../outils/construire-secours.js` |
| `run99` | Mode veille : relais (code du workflow n8n, `relais-local.js`) et faux Grist (`faux-grist-api.js`) ; premières copies sans dépôt manuel, copie précédente, copie anormalement vide refusée, intervalle et plage horaire, nouvelle base, panne de Grist puis du relais, mode secours, retour du réseau, second poste |
| `run100` | Administration, carte « Mode secours » : téléchargement du kit (version), du relais n8n préréglé (API, document, clé aléatoire, chemin propre), page de réintégration ; widgets servis en http |
| `run105` | Pièces jointes : question « Pièces jointes » (administration, colonne simple adaptée aux liens d'établissement : colonne d'envoi + formule), photos et documents depuis le formulaire sur téléphone (photo lourde réduite, empreinte SHA-1), retrait, enregistrement dans la colonne d'envoi, mise à jour d'un dossier ; copie des colonnes pour les liens rafraîchie à l'adaptation |
| `run106` | Pièces jointes et liens d'établissement : métadonnées illisibles, copie des colonnes périmée ou à jour : le formulaire écrit dans la colonne d'envoi, jamais dans la colonne en formule (formules strictes) ; dossier rouvert par un lien : vignette, ouverture dans un onglet, téléchargement avec les paramètres du lien (Etab_=…) et un jeton non limité, jamais placé dans la page |
| `run107` | Atlas national appliqué au supérieur (85 établissements d'essai, `esr_essai.js`) : réglage « Tous risques », toutes les étiquettes gardées, pas d'abréviation scolaire devant les sigles, aucun point caché par un encart, tableau de 22 lignes |
| `run110` | 2.43 : veille météo — onglet Veille (carte, synthèse, établissements et élèves, campagne pré-ciblée, réglages, relais préréglé), relais n8n exécuté avec Météo-France, Grist et Tchap simulés, bandeau de vigilance de la saisie |
| `run111` | 2.44 : tableau de bord — ordre des colonnes d'un tableau croisé : par valeur, ordre des choix dans Grist, ordre personnalisé (flèches, enregistré dans le bloc, repris par les séries du graphique), retour à l'ordre par défaut |
| `run113` | 2.45 : widget « Extractions » — page créée depuis l'onglet Tableau de bord, réglages tirés des rôles du socle, filtres, modèle enregistré pour tout le document, export Excel |
| `run112` | 2.44.5 : règles d'accès — référentiel des sites (visé par la sous-table des sites) et correspondances des sites modifiables par les agents mobilisés (compte ou lien d'invité), comme le référentiel des établissements |
| `run114` | 2.45.1 : tableau de bord — barres horizontales empilées avec un nombre de valeurs distinctes (avant : forcées côte à côte) ; moyenne toujours côte à côte ; note du double compte seulement s'il a lieu (2.45.2) |
| `run115` | 2.46 : logo PRISME (`commun/marque.js`) — un seul logo, en haut à gauche : tableau de bord publié (barre construite par `tableau.js`), saisie sur ordinateur et téléphone, administration (pas de second logo dans l'onglet Tableau de bord) |
| `run109` | 2.42 : effectifs des établissements (carte Effectifs de l'onglet Référentiel) : jeux DEPP par UAI aux champs différents, second candidat pour la voie professionnelle, somme pour un lycée polyvalent, dernière rentrée, académies couvertes ; SIES par identifiant Paysage ; colonne Effectif recopiée dans les réponses |
| `run108` | 2.41 : circuit de validation (onglet Validation, viseurs, statut, règles d'accès par échelon et périmètre, file « à viser » de la saisie) et campagnes (lancement depuis le publipostage, suivi quotidien, relance CSV, « Rien à signaler » sur la page d'un établissement) |
| `run104` | Administration › Formulaires : renommer la table d'une question tableau (Grist, formulaires publiés et brouillons, profils d'atlas), nom déjà pris refusé, saisie dans la table renommée |
| `run103` | « À vérifier » : modifier une saisie sur place, supprimer une mise à jour (lignes de sites de cette version), supprimer un dossier entier, dans l'administration et le widget « Référentiel des sites » |
| `run102` | Atlas QGIS ouvert au supérieur et à tous les risques : un point par site (référentiel des sites), couleurs et formes libres (colonne au choix, valeurs gardées), pages par région académique, France métropolitaine et France entière (outre-mer en encarts), réglages prêts à l'emploi, colonne du référentiel |
| `run101` | Kit de secours : formules de suivi recalculées pour les lignes du mode secours (dernière version, état le plus grave, jours de mobilisation ; variante MESRE), tableau de bord à jour |
| `run95` | Sites désactivés du référentiel : écartés du rapprochement, de la reprise du dernier état (revenus à la normale) et des suggestions du formulaire |
| `run94` | Rapprochement des sites saisis dans une colonne référence aux sites (anciens noms) : administration et widget « Référentiel des sites » (tous les établissements, établissement choisi), avec le contexte des signalements (date des faits, qualification, description) |
| `run93` | Formulaire par site : reprise du dernier état des sites réglable — désactivée (par défaut, et pas de sites repris d'un signalement précédent), à la demande (bouton), automatique (ancien réglage) |
| `run92` | Formulaire par site : site obligatoire et nom hors référentiel, ancien nom resté en texte dans la colonne référence |
| `run91` | « Corriger les saisies » sur une colonne référence aux sites qui garde les anciens noms (run90 avec l'option `ref`) |
| `run90` | Widget « Référentiel des sites » : « Corriger les saisies » (sites tapés dans une sous-table, rattachés par lot, nouveau site, correspondances) |
| `run89` | Widget « Référentiel des sites » : modification par lot (homonymes, mots-clés, statut, renommage, désactivation) et fusion de doublons |
| `run88` | Widget « Référentiel des sites » : vue « À vérifier » (établissement placé, dossier corrigé, dossier rattaché) |
| `run87` | Référentiel ESR : une école d'ingénieurs compte pour un établissement (import du classeur, puis référentiel en place) |
| `run86` | Référentiel : fiche de l'établissement (effectif, tutelle, rattachement), ajout d'une information |
| `run85` | Référentiel : un site saisi hors référentiel devient un site du référentiel (nouveau site, correspondance, saisies complétées) |
| `run84` | Formulaire par site, cas du terrain : colonne du site en double, sans colonne hors référentiel, champ de recherche des sites ; contrôle du paramétrage dans l'administration |
| `run83` | Widget « Référentiel des sites » : établissement, carte, candidats IGN / OpenStreetMap / adresse (réponses simulées), ajout, placement, mots-clés, désactivation |
| `run82` | Admin : tableau des sites sans colonne vers le référentiel des sites, bouton « Relier au référentiel des sites » |
| `run81` | Référentiel : import du classeur du référentiel ESR (donnees/referentiel_esr_essai.xlsx, fictif, refait par donnees/fabriquer_referentiel_esr.py ; `CLASSEUR=…` pour essayer un vrai classeur), puis recherche et sites d'une composante dans le formulaire par site |
| `run116` | 2.46.1 : tableau de bord — abscisse et séries inversées (une courbe par ligne du tableau), comptes sans ligne à 0 (courbes continues), détail de la bonne case au clic sur un point |
| `run117` | 2.47 : « À vérifier » — rattacher un dossier à un autre (blocage le matin, occupation l'après-midi) : saisies devenues versions de la cible, une seule « Nouveau signalement », sites déplacés, doublon résolu |
| `run118` | 2.50 : formulaire par site — reprise limitée aux sites du dernier dossier (ou du signalement choisi) ; suppression d'un site saisi à tort (🗑, annulable) : effacé de toutes les étapes et de la table dédiée, plus repris le lendemain |
| `run119` | 2.51 : Extractions — colonnes d'identification numériques (Entier, Numérique, formule « Nombre de sites ») et dates en nombres et dates dans l'Excel ; tri numérique ; CSV à virgule décimale |
| `run120` | 2.52 : Extractions — filtres sur plusieurs colonnes (opérateurs), combinaison en cascade ou autonomes (sans doublon, colonne « Filtres vérifiés »), focus gardé à la saisie, reprise de l'ancien filtre unique, paramètres de l'Excel |

## Fichiers d'appui

| Fichier | Rôle |
|---|---|
| `chemins.js` | Chemins du dépôt, des données d'essai, des sorties et du navigateur |
| `mock.js`, `fakeapi.js`, `mock-saisie.js` | Faux Grist en mémoire (API des widgets) |
| `faux-grist-api.js`, `relais-local.js` | Faux Grist côté serveur et relais n8n exécuté localement (mode veille) |
| `dossier-simule.js` | Dossier partagé simulé (kit de secours) |
| `esr_essai.js` | Établissements d'enseignement supérieur fictifs (atlas) |
| `run27.js` | Ancien scénario de l'atlas : les scénarios run63 à run77 y prennent la fonction `mkDoc` (document d'essai) |
