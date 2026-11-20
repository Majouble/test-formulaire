# Signalements Grist — version 2

Ce dossier contient la version de développement des widgets v2. La version figée pour la production est dans `prod/` (même contenu, adresses `…/prod/…`), mise à jour seulement lors d'une publication. La version 1 (`index.html` à la racine du dépôt) reste en service tant que les documents MEN et ESR n'ont pas basculé.

| Widget | Production (version figée) | Développement (bouge à chaque mise à jour) |
| --- | --- | --- |
| Administration | `https://majouble.github.io/test-formulaire/prod/admin/` | `https://majouble.github.io/test-formulaire/v2/admin/` |
| Saisie | `https://majouble.github.io/test-formulaire/prod/saisie/` | `https://majouble.github.io/test-formulaire/v2/saisie/` |
| Point de situation | `https://majouble.github.io/test-formulaire/prod/point-situation/` | `https://majouble.github.io/test-formulaire/v2/point-situation/` |
| Tableau de bord | `https://majouble.github.io/test-formulaire/prod/tableau-de-bord/` | `https://majouble.github.io/test-formulaire/v2/tableau-de-bord/` |
| Cartographie | `https://majouble.github.io/test-formulaire/prod/cartographie/` | `https://majouble.github.io/test-formulaire/v2/cartographie/` |
| Référentiel des sites | `https://majouble.github.io/test-formulaire/prod/sites/` | `https://majouble.github.io/test-formulaire/v2/sites/` |
| Réintégration du mode secours | `https://majouble.github.io/test-formulaire/prod/reintegration/` | `https://majouble.github.io/test-formulaire/v2/reintegration/` |
| Tableau des signalements de A à Z (aussi dans le kit) | `https://majouble.github.io/test-formulaire/prod/secours/liste.html` | `https://majouble.github.io/test-formulaire/v2/secours/liste.html` |
| Fiche établissement (en développement) | — | `https://majouble.github.io/test-formulaire/v2/fiche/` |
| Kit de secours (fichier à enregistrer sur les postes) | `https://majouble.github.io/test-formulaire/prod/secours/kit-secours.html` | `https://majouble.github.io/test-formulaire/v2/secours/kit-secours.html` |
| Version 1 | `https://majouble.github.io/test-formulaire/` | — |

Un document de production n'utilise que des adresses `…/prod/…` ; un document de test, des adresses `…/v2/…`. Ne pas mélanger les deux dans un même document : l'administration crée les pages (saisie, tableau de bord, cartographie, établissements) à côté d'elle-même, donc dans le même dossier.

## Mise en production

1. Dans `v2/commun/socle.js`, passer `VERSION` à un numéro sans `alpha` (par exemple `2.0.1 (jj/mm/aaaa)`). À chaque changement de `VERSION`, même en test, lancer `node outils/versionner.js` : les pages appellent leurs scripts avec `?v=<version>` et `v2/version.json` donne la version publiée (une page plus ancienne en cache se recharge d'elle-même ; l'essai `run125` échoue si on l'oublie).
2. Lancer `sh outils/publier-prod.sh` : le dossier `prod/` est recréé à partir de `v2/` (refus si la version contient `alpha`, `beta` ou `dev`).
3. Valider et pousser ; GitHub Pages publie en une à deux minutes.
4. Dans chaque document de production, vider le cache (Ctrl+F5) et vérifier le numéro de version dans l'administration.
5. Reprendre le développement dans `v2/` avec une version de test (`2.0.2-alpha.1`…).

Bascule d'un document v1 vers la v2 : exporter le document en sauvegarde (.grist), ajouter la page d'administration `…/prod/admin/`, installer, importer le référentiel, configurer l'équipe et les accès, puis remplacer l'adresse des widgets de saisie par `…/prod/saisie/`. La liste de vérification à cocher avant la bascule est dans le projet (« Socle v2 — liste de vérification avant production »).

## Organisation

```
v2/                      développement (prod/ = copie figée, voir « Mise en production »)
├── README.md            ce fichier
├── commun/socle.js      code partagé : lecture de Config, rôles, plan d'installation
├── commun/theme.js      thème clair ou sombre de tous les widgets (data-theme sur <html>)
├── commun/marque.js     logo PRISME en haut à gauche de tous les widgets (variantes bloc, compact, spectre, centre)
├── commun/menu-deroulant.js  menu déroulant des champs à valeurs proposées (<input list> + <datalist>), dans tous les widgets
├── commun/filtres-colonnes.js  moteur des filtres de colonnes (condition, portée ou comptage avec seuil, versions, combinaison), pour les Extractions et la Fiche établissement
├── commun/geo.js        fond de carte commun : départements et académies (Lambert-93, encarts), placement d'un point latitude / longitude
├── saisie/              formulaire de saisie
├── admin/               administration : installation.js, configuration.js, referentiel.js, equipe.js, planning.js, pages-agents.js (onglet Équipe, Pages de saisie), actions.js, acces.js, liens.js, campagnes.js (onglet Établissements, carte Campagnes), effectifs.js (onglet Référentiel, carte Effectifs), structurel.js (onglet Référentiel, carte « Données demandées aux services »), partenaires.js (onglet Accès, carte « Partenaires : DSDEN, rectorats… »), veille.js (onglet Veille), validation.js (onglet Validation), repartition.js (partagé Équipe / Formulaires), formulaires.js (+ formulaires.css), secours.js (carte « Mode secours » : kit, relais, page de réintégration)
├── point-situation/     production du point de situation
├── cartographie/        carte et export cartographique (reprise du widget « Export cartographique ») ; atlas/ : projet QGIS de l'atlas par académie et contours
├── tableau-de-bord/     tableau de bord : tableau.js (module partagé, édition dans l'administration, lecture dans le widget)
├── secours/             mode secours sans réseau : grist-hors-ligne.js (Grist simulé, mode veille), relais-n8n.json (relais à importer dans n8n), kit-secours.html (assemblé par outils/construire-secours.js), liste.html (tableau des signalements de A à Z), demo.json, vendor/ (sql.js, MIT)
├── reintegration/       réintégration dans Grist des saisies du mode secours
├── extractions/        widget « Extractions » : une ligne par établissement, filtres, export Excel (page créée depuis l'onglet Tableau de bord)
├── fiche/              widget « Fiche établissement » : une page A4 par établissement, tuiles et badges réglables (options du widget, clés « fiche », « filtres » et « modeles »), filtres rapides et avancés, modèles de sélection, impression (synthèse en page 1 puis détail, ou tuiles détaillées ; fiche seule ou sélection) ; fiche-moteur.js : calcul des tuiles et de la sélection, sans affichage
├── veille/              relais-vigilance-n8n.json : workflow n8n Météo-France → table Vigilances (onglet Veille)
└── modeles/             exemples de configuration à importer (à venir)
```

## Règles

1. Un widget ne lit jamais une colonne par son nom en dur : il passe par un rôle (voir le contrat du socle).
2. Un réglage commun au document s'écrit dans la table `Config`, sous la clé de son module. Un réglage propre à une page (formulaire, périmètre, libellé) reste dans les options du widget de cette page.
3. Un module ne dépend que du socle, jamais d'un autre module.
4. Chaque widget affiche son numéro de version dans son panneau de diagnostic. Le numéro (`VERSION` de `commun/socle.js`) est incrémenté à chaque mise à jour publiée.

## Architecture

### Principe

Les widgets sont des pages statiques (HTML et JavaScript, sans serveur propre) affichées dans un document Grist par des widgets personnalisés. Ils lisent et écrivent le document par l'API des widgets (`grist-plugin-api.js`) ; tout ce qu'ils savent du document passe par le socle (`commun/socle.js`). Une situation = un document Grist ; un document de production n'utilise que les adresses `…/prod/…`.

### Le socle (`commun/socle.js`, `window.Socle`)

- **Config** : seule table au nom fixe (`Cle`, `Valeur` en JSON, `Modifie_le`). Chaque module y range ses réglages sous sa clé (tableau ci-dessous). `lireConfig()`, `ecrireConfig(cle, valeur)`, `general(config)` (réglages généraux complétés par `DEFAUTS_GENERAL`).
- **Rôles** : un widget ne lit jamais une colonne par son nom ; il demande la colonne qui joue un rôle (`resoudreRoles("reponses" | "referentiel", meta, ctx, associations)`). Les rôles (`ROLES`) décrivent ce qu'ils acceptent, les motifs de reconnaissance et, au besoin, comment créer la colonne (type, formule). Une association choisie dans l'onglet Installation (clé `roles`) prime sur la reconnaissance.
- **Espaces** : un champ (EN, ESR) = une table de réponses, un référentiel et ses formulaires (`espaces(general)`) ; un document peut en suivre deux.
- **Formules du socle** : dernière version d'un dossier, description marquée (`Description_Word_`), état le plus grave, jours de mobilisation, auteur, liens d'invité et d'établissement, reprise des éléments réservés d'une version à la suivante.
- **Plan d'installation** : ce qui manque au document (tables, colonnes, formules), proposé par l'onglet Installation, jamais appliqué sans accord ; rien n'est renommé ni supprimé.
- **Copie du schéma** (clé `schema`) : les liens d'établissement ne lisent pas les métadonnées de Grist ; la copie est rafraîchie à la publication d'un formulaire, à l'adaptation d'une question et à l'application des règles d'accès.

### Tables du socle

| Table (nom par défaut) | Rôle | Créée par |
| --- | --- | --- |
| `Config` | Réglages de tous les modules | Installation |
| `Reponses` | Une ligne par version de signalement ; `Dossier` renvoie à la première saisie | Installation (nom réglable) |
| `Etablissements` | Référentiel ; clé `UUID` et `Lien` des établissements ; `Donnees_maj_le` et `Donnees_maj_par` : date et auteur de la dernière modification d'une donnée demandée aux services (formules d'initialisation) | Installation, onglet Référentiel |
| `Referentiel_sites`, `Sites_correspondances` | Sites du supérieur ; libellés saisis rapprochés d'un site | Import du classeur ESR, widget Référentiel des sites |
| `Verifications` | File de vérification du référentiel (un point par regard humain ; colonne `Action` en JSON : ce qui est écrit quand on accepte) | Import de l'onglet « Import – vérifications » du classeur `File_de_verification.xlsx` ; traitée dans le widget Référentiel des sites, onglet « File de vérification » |
| `Formulaires` | Brouillon et version publiée de chaque formulaire (JSON) | Installation |
| Tables des questions tableau | Lignes d'un tableau (sites…), historisées par version (`Dossier`, `Version`, `Ligne_id`, `Mouvement`) | Onglet Formulaires |
| `Agents`, `Creneaux`, `Affectations`, `Emargements` | Équipe, planning, émargement | Onglet Équipe |
| `Actions` | Suivi des actions de la cellule | Onglet Actions |
| `Vigilances`, `Vigilances_journal` | Veille météo, écrites par le relais n8n | Onglet Veille |
| `Administration`, `Cellule` | Tables vides qui portent les pages réservées (règles d'accès) | Installation |
| `Partenaires` | Partenaires ouverts par lien (nom, clé, lien, actif) ; colonne `Fiche` : leurs réglages, filtres et modèles de la fiche établissement (JSON) ; colonne `Lecture_seule` (case) : lien d'affichage seul, sans réglages ni enregistrement ; colonne `Academies` (liste) : périmètre académique, seules les lignes des tables ouvertes dont la colonne `Academie` y figure (vide : toutes) | Onglet Accès, carte « Partenaires » |

### Clés de Config

| Clé | Module | Contenu |
| --- | --- | --- |
| `general` | Installation | Situation, préréglage, académies, tables, qualifications de retour à la normale, second champ |
| `roles` | Installation | Associations colonne → rôle choisies à la main |
| `schema` | Socle | Copie des colonnes lue par les liens d'établissement |
| `annuaire_en`, `referentiel_esr`, `effectifs` | Référentiel | Réglages et trace des imports (`regles_esr`, règle des écoles d'ingénieurs, abandonnée en 2.56 : n'est plus lue) |
| `planning`, `repartition` | Équipe | Fonctions, modèles de journée ; critères de périmètre |
| `partenaires` | Accès | Tables ouvertes en lecture aux partenaires (`tables`) ; durée de validité de leurs liens (`duree`, 30 jours par défaut) |
| `schema_partenaires` | Accès (écrite), Fiche établissement (lue) | Copie des colonnes des tables ouvertes aux partenaires et de `Partenaires` (Grist cache ses métadonnées aux liens) ; seule ligne de Config lisible d'un partenaire |
| `liens`, `campagnes`, `acces_invites` | Établissements, Équipe | Mise en place des liens, publipostage, campagnes ; durée des liens invités |
| `validation` | Validation | Circuits de visas |
| `structurel` | Référentiel (carte « Données demandées aux services ») | Par référentiel : colonnes demandées aux services et droit de l'établissement sur chacune (`masquee`, `lecture`, `modification`), échelons qui les renseignent |
| `veille` | Veille | Seuil, phénomènes suivis |
| `actions` | Actions | Colonnes du kanban |
| `point_situation`, `tableau_de_bord`, `extractions`, `resume_auto` | Sorties, saisie | Brouillon et version publiée de chaque sortie ; description automatique |
| `qualite` | À vérifier | Statuts des anomalies (vérifiée, corrigée) |
| `secours` | Réintégration | Saisies hors ligne déjà réintégrées, correspondances de numéros |
| `fiche` | Fiche établissement | Modèles de sélection partagés avec tout le document (`modeles` : nom et filtres) ; la présentation de la fiche reste dans les options de chaque page |

### Accès

Les règles d'accès Grist sont générées par l'onglet Accès (`admin/acces.js`), repérées par le mémo « Socle v2 », et réappliquées à la publication d'un formulaire quand elles ne correspondent plus. Attributs utilisateur : `Agent` (compte Grist, par adresse), `Invite` (lien d'invité, par clé), un attribut par groupe de liens d'établissement (`Etab`), `Partenaire` (lien de partenaire, par clé : lecture seule des tables ouvertes aux partenaires, sa ligne de `Partenaires` pour ses réglages de fiche). Le détail des profils est dans le guide de l'administrateur.

### Dépendances extérieures

Bibliothèques chargées à la demande, en version figée : JSZip, Leaflet (cdnjs) ; PizZip, docxtemplater, ExcelJS, shp-write (jsDelivr) ; API des widgets Grist (docs.getgrist.com). Services : Géoplateforme de l'IGN (fonds de carte, géocodage), Overpass (OpenStreetMap), portails open data de l'éducation nationale et de l'enseignement supérieur ; par les relais n8n : API Météo-France, Tchap (Matrix).

### Tests

Scénarios Playwright avec un Grist simulé (`tests/mock.js`, `tests/fakeapi.js`) : voir `tests/README.md`. Lancer `sh tests/lancer.sh` avant chaque publication.

### Documentation utilisateur

Les guides (fiche établissement, guide de l'agent, guide de l'administrateur, fiches réflexes, glossaire, dossier de sécurité) sont tenus hors du dépôt, dans les documents partagés de l'équipe. Toute évolution visible d'un écran est à reporter dans le guide concerné.

## Décisions (15/10/2026)

- Un dossier = un établissement (et un site) un jour donné. La dernière version est la plus récente par date de saisie, puis par numéro de ligne.
- « RAS » est la qualification de retour à la normale, dans tous les documents.
- Un document Grist par situation, dupliqué depuis le modèle.
- Une page par agent, chacune avec son périmètre d'académies.

## Décisions (17/10/2026)

- L'équipe de la cellule est une table du socle, `Agents` (onglet Équipe) : nom, adresse, téléphone, actif. La fonction (opérateur, rédacteur, coordinateur…, liste réglable dans l'onglet Planning, clé `planning` de Config) se choisit par créneau sur le planning, pas sur la fiche. Pas de niveau d'accès, pas de périmètre sur la fiche.
- Le planning (onglet Planning) : tables `Creneaux` (créneaux nommés de chaque jour, début et fin datés) et `Affectations` (agent, fonction, champ EN et/ou ESR, et périmètre pour le créneau ; périmètre vide = tous les établissements). Le périmètre se règle créneau par créneau ; à défaut, le dernier périmètre de l'agent est proposé.
- Les lignes du tableau sont les fonctions des réglages (ordre, ligne affichée ou non, fonction qui saisit) ; renommer une fonction met à jour l'équipe et le planning.
- Le champ (EN, ESR) dit sur quels formulaires l'agent est mobilisé : l'onglet Formulaires coche d'office les agents mobilisés sur le champ du formulaire ; la page de saisie de l'autre champ prévient l'agent pendant le créneau. Les règles d'accès s'appuieront dessus.
- Affichage : une colonne par jour, une ligne par fonction, le nom des agents mobilisés dans chaque case ; en tête, le nombre de personnes mobilisées par jour et les créneaux du jour. Modèles de journée et copie de la semaine précédente pour remplir vite ; cellule du jour ; suivi individuel des créneaux et des heures.
- Une page de saisie par agent qui saisit (« Formulaire Alice »), créée depuis l'onglet Formulaires, sans périmètre fixe. Pendant un créneau où l'agent est mobilisé, la page applique le périmètre du créneau (relu chaque minute) ; hors créneau, tous les établissements.

- Règles d'accès (onglet Accès, propriétaires seulement) : attribut utilisateur « Agent » (table Agents, par adresse). Propriétaires : tout. Agent actif mobilisé sur un champ (EN, ESR) au planning, 7 jours avant ou après aujourd'hui (formule `Agents.Champs_acces`) : saisie (lecture, ajout, modification, sans suppression) sur les tables des formulaires de ce champ et sur le référentiel. Autres agents actifs : lecture seule. Personnes absentes de l'équipe : aucun accès. Les règles portent le mémo « Socle v2 — … » ; les appliquer remplace celles des tables gérées et la règle par défaut, sans toucher aux autres tables. L'accès des établissements par lien viendra avec le publipostage.

- Émargement : table `Emargements` (agent, créneau, début, fin, auteur = adresse du compte Grist, notée par Grist à la création). Bouton « Je prends mon service / Je termine mon service » dans le bandeau de la page de saisie de l'agent. Onglet Planning : émargé ou non dans la cellule du jour, heures prévues / émargées dans le suivi individuel, clôture des services restés ouverts. Règles d'accès : chaque agent ne voit et ne modifie que ses propres émargements. Traitement de données personnelles à inscrire au registre.

- Suivi des actions (onglet Actions, coordinateurs) : kanban inspiré du widget Grist Project Manager (isaytoo). Colonnes réglables (nom, couleur, emoji, ordre, colonne de clôture ; clé `actions` de Config, choix et couleurs de la colonne `Statut` synchronisés), ajout rapide de colonne ; regroupement par statut, priorité ou responsable ; glisser-déposer entre colonnes et, en tri manuel, dans la colonne (`Ordre`) ; tris A→Z, Z→A, échéance, priorité, création ; filtres (recherche, responsable, priorité, en retard) ; colonnes repliables, cartes dépliables, champs des cartes réglables ; archives (`Archivee`) avec restauration ; fenêtre de création, modification, duplication, suppression. Ni notification, ni actions types.

- Cartographie (widget `cartographie/`, page créée depuis l'onglet Tableau de bord) : reprise du widget « Export cartographique » (formats GeoJSON, KML, GPX, CSV avec WKT, Shapefile ; choix des colonnes ; filtres par valeur et par période ; une entité par établissement avec nb_lignes et dates premier / dernier / nb_jours ; ajout des autres établissements d'une table de référence avec la colonne concerne pour calculer un taux). Sur la table des signalements du socle, chaque ligne reçoit les colonnes de son établissement (coordonnées, UAI, commune, académie…) : rien à régler dans le panneau ; option « dernière version de chaque dossier » ; carte Leaflet sur fond Plan IGN, points colorés selon une colonne (qualification par défaut, couleurs des choix Grist), fiche au clic. Le panneau de Grist (Latitude, Longitude ou Géométrie) reste prioritaire pour une autre table. Quand le référentiel n'a pas de colonne Département ou Académie, l'export reçoit `Departement_carte` et `Academie_carte`, déduits des coordonnées. Sans accès à Leaflet ou aux tuiles IGN (réseau filtré), les points s'affichent sur le fond de carte du socle.

- Répartition des cartes (17/10) : les cartes par département ou par académie (aplats de couleur) restent dans le tableau de bord ; le tableau de bord gagne le graphique « Carte des établissements (points) » (un point par établissement, taille et couleur selon la valeur, encart agrandi pour Paris et la petite couronne, détail au clic, image dans Word), sur le même fond embarqué, sans service extérieur. La cartographie sert à l'export et à l'analyse fine sur fond IGN. Le fond de carte et les correspondances département / académie sont dans `commun/geo.js`, partagé par les deux widgets.

- Colonnes de l'établissement (17/10) : l'installation ajoute à la table des réponses des colonnes formules recopiées du référentiel : `UAI`, `Nom_etablissement`, `Commune`, `Departement`, `Academie`, `Latitude`, `Longitude` (`$Etablissement.UAI`…, selon les colonnes du référentiel). Elles servent aux lignes par UAI et aux cartes du tableau de bord, et rendent les exports CSV lisibles. Document déjà installé : étape « Ajouter à Reponses les colonnes de l'établissement » de l'onglet Installation, ou bandeau de l'onglet Tableau de bord. La carte des établissements lit les coordonnées sur la table elle-même quand les lignes sont l'UAI ; la cartographie reprend ces colonnes sans les dupliquer.

- Accès des établissements par lien (17/10, onglet Établissements) : clé secrète par établissement (colonne `UUID` du référentiel, formule d'initialisation `UUID()`, clés manquantes générées en un clic) et lien (`Lien` = `SELF_HYPERLINK(page=<page des établissements>, LinkKey_Etab=$UUID)`, soit `…/p/<n>?Etab_=<clé>`). Page « Signalement — établissements » créée avec le widget de saisie (option `etablissements`), ignorée par l'équipe et les pages d'agents. Règles (onglet Accès, avec les autres) : attribut « Etab » (clé du lien → ligne du référentiel) ; l'établissement lit, crée et met à jour ses seuls signalements, sans les visas (ni lecture ni écriture) ni l'adresse de l'auteur ; il voit sa seule ligne du référentiel, sans clé ni lien, et lit Config, Formulaires et les listes de choix ; les sous-tables reçoivent une colonne `Etablissement_acces` (les règles ne suivent pas les références). Le widget passe de lui-même en mode établissement (« Vos signalements »). Ensuite : test avec un compte hors équipe, puis partage public du document en Éditeur. Publipostage : filtres par colonne du référentiel (par défaut académie, département, circonscription, type, public / privé, nature ; « + Ajouter un filtre » pour les autres colonnes, choix gardé dans la clé `liens` de Config ; toutes les colonnes texte ou liste de choix du référentiel, sans plafond de valeurs ; au-delà de 30 valeurs, saisie avec suggestions), message modifiable (clé `liens` de Config, repris par le bouton ✉ des pages de saisie), fichier CSV (UAI, nom, commune, adresse, lien, objet, message) pour une fusion Word / Outlook ou n8n, nouvelle clé pour révoquer un lien. Une personne ouverte par un lien ne peut pas lire les métadonnées de Grist (tables `_grist_…`) : le widget de saisie lit alors une copie des colonnes utiles (réponses, référentiel, sous-tables, listes de choix) rangée dans la clé `schema` de Config, rafraîchie à la publication d'un formulaire, à l'ouverture de l'onglet Établissements et à l'application des règles d'accès (18/10). À la publication d'un formulaire, si les règles du socle sont en place mais ne correspondent plus (nouvelle sous-table d'une question tableau, nouvelle question de visa…), elles sont réappliquées d'office (propriétaire seulement ; sinon, message renvoyant à l'onglet Accès).

- Circonscription (18/10) : rôle `Nom_circonscription` du référentiel (colonne créée par l'installation, remplie par l'import de l'annuaire, champ `nom_circonscription` ; créée aussi à l'import si elle manque), critère de répartition et filtre du publipostage.

- Plusieurs tableaux de bord (18/10) : clé `tableau_de_bord` de Config = `{ tableaux: [{ id, nom, table, brouillon, publie, publie_le }] }` (l'ancienne forme à un seul tableau est reprise comme premier tableau, qui reste aussi recopié en tête de la clé). Onglet Tableau de bord : liste déroulante du tableau à modifier, « + Nouveau » (nom, table des signalements, reprise facultative des blocs), « Renommer, table… », suppression. Chaque page dédiée porte l'option `tableau` (identifiant) ; une page sans option affiche le premier tableau.

- Atelier du tableau de bord (18/10) : dans l'administration, le tableau de bord s'affiche tel que le lecteur le verra ; un clic sur un bloc ouvre ses réglages dans un panneau à droite (onglets Données, Présentation, Détail ; monter, descendre, dupliquer, supprimer). Fenêtres « + Ajouter un bloc » (chiffre clé, tableau, barres, histogramme, courbe, anneau, carte par territoire, carte des établissements, chacun préréglé) et « ⚙ Réglages du tableau » (nom, Word, filtres rapides, filtres communs). Une seule barre : tableau choisi, ajout, réglages, état, Publier, menu « ⋯ » (nouveau tableau, renommer, pages de Grist, relire, revenir à la version publiée, sauvegarder, restaurer, récupérer d'un widget v1). Le widget de lecture est inchangé.

- Export et import de la configuration (18/10, onglet Installation, carte « Sauvegarder ou reprendre une configuration ») : fichier JSON `socle-signalements-configuration` avec les clés de Config (sauf `schema` et le modèle Word), les formulaires (brouillon et version publiée), la structure des tables de réponses et de leurs sous-tables (colonnes, types, formules, réglages, colonne affichée des références) et, en option, l'équipe. Import dans un document installé : analyse (créé, remplacé, identique), puis application des éléments cochés ; jamais de suppression ni de changement de type. Non repris : signalements, référentiel, clés d'accès, règles d'accès, pages, modèle Word. « Coller… » remplace le choix de fichier s'il est bloqué.

- Agents invités (18/10) : pour un agent qui ne peut pas se connecter à Grist avec son adresse, fiche Équipe « Invité : accès par lien personnel ». Colonnes Agents `Cle_acces` (clé), `Page_saisie` (sa page de saisie, tenue à jour) et `Lien_acces` (`SELF_HYPERLINK(page=$Page_saisie, LinkKey_Invite=$Cle_acces)`). Règles (onglet Accès) : attribut « Invite » (clé du lien → ligne d'Agents) ; partout où les règles disent « agent actif », elles acceptent l'agent connecté par son adresse ou par son lien (saisie selon le planning, émargement pour lui seul) ; clé et lien lisibles par les propriétaires seulement. Auteur des signalements et des émargements : formule d'initialisation qui écrit « Invité : <nom> » pour un invité (au lieu de l'adresse anonyme). « Nouvelle clé » ou décocher l'option retire le lien. La copie des colonnes (clé `schema`) couvre désormais tous les formulaires publiés. Durée de validité des liens d'invités (clé `acces_invites` de Config, onglet Équipe : 24 heures par défaut, 3, 7, 30 jours ou sans limite) : colonnes `Lien_expire_le` et `Lien_valide` (formule, recalculée par Grist au moins toutes les heures) ; les règles exigent un lien valide. « Nouveau lien » (par agent, dans la liste ou la fiche) et « Nouveau lien pour tous les invités » remplacent les clés ; « Prolonger » garde le lien.

- Éléments réservés aux services (18/11, 2.62.0-alpha.33) : un formulaire peut avoir une partie de rôle « r » (une au plus, bouton « + Partie réservée aux services » de l'onglet Formulaires) : questions que seuls les services renseignent (appréciation de la DSDEN, moyens engagés, éléments transmis par les forces de l'ordre…), jamais visibles de l'établissement. Elles s'affichent dans l'onglet « Compléments » du widget de saisie, portent sur la dernière version du dossier (comme les visas) et sont reprises dans chaque nouvelle version par une formule d'initialisation posée à la publication (marque `# Reprise des éléments réservés`), y compris quand l'établissement publie un suivi. La partie dit quels échelons les renseignent (`echelons` : `dep`, `aca`) ; règles d'accès : modification par les propriétaires, les agents mobilisés au planning et les viseurs de ces échelons dans leur périmètre (onglet Validation), lecture pour le reste de l'équipe ; établissements : lecture fermée, écriture laissée ouverte parce que Grist applique les règles à la formule d'initialisation (comme pour l'auteur) ; partenaires : ni lecture ni écriture.

- Données structurelles demandées aux services (18/11, 2.62.0-alpha.34) : des colonnes du référentiel (référent sûreté, dernier exercice PPMS, internat…) que les départements et les académies complètent depuis l'onglet « Compléments » de la saisie, pour l'établissement du dossier ouvert. Elles restent dans le référentiel (valables pour toutes les situations, reprises par la fiche établissement) ; les colonnes remplies par l'import de l'annuaire ne sont pas proposées. Réglage par colonne de ce qu'en fait l'établissement (masquée, lecture, modification de sa ligne) ; règles d'accès : modification par les propriétaires, les agents mobilisés et les viseurs des échelons cochés dans leur périmètre. Chaque modification est datée et signée par Grist (`Donnees_maj_le`, `Donnees_maj_par`, formules d'initialisation recalculées quand une colonne demandée change, posées sur la métadonnée de la colonne puisque Grist refuse `recalcDeps` dans `AddColumn` / `ModifyColumn`).


- Partenaires = services (18/11, 2.62.0-alpha.37, remplace les accès de service des 2.62.0-alpha.35 et .36) : un partenaire de la table Partenaires est un organisme (DSDEN, rectorat, préfecture…) avec un lien commun à échéance et un périmètre par échelon (`Echelon` : Départemental + `Departements`, Académique + `Academies`, National : tout le document ; liste vide : rien). Son lien ouvre la fiche établissement ; il consulte aussi le tableau de bord et la page des compléments (widget de saisie avec l'option `partenaires` : ni création ni mise à jour de signalement, dossier ouvert sur l'onglet Compléments), où il complète les fiches de ses établissements : données demandées aux services et éléments réservés d'un dossier (échelons de la partie, ou national). Le circuit de visa est laissé de côté : les partenaires ne visent pas. Règles d'accès (dès que la colonne `Echelon` existe) : lecture des signalements, tableaux, référentiels et tables ouvertes limitée au périmètre ; réglages et formulaires lisibles ; toute autre table fermée ; clés et liens des établissements, visas, statut et auteur illisibles. Le périmètre en noms se compare à une colonne de texte, ou à la colonne d'aide `<colonne>_nom` d'une référence (table des académies) ; « Préparer le document » (carte « Partenaires : DSDEN, rectorats… », onglet Accès) ajoute ces colonnes, les colonnes `Departement` et `Academie` des tables de la fiche et des tableaux, et les colonnes de la table Partenaires (les partenaires déjà là deviennent « Académique » ou « National »). Création par lot (« DSDEN … », « Rectorat … »), pages des partenaires, liens en CSV.

- Demandes de compléments (20/11, 2.62.0-alpha.41) : pour obtenir vite des compléments des académies sur une liste d'établissements, la sélection se fait avec les filtres des widgets Extractions ou Fiche établissement (bouton « Demander des compléments… », propriétaires), sans nouvel écran de sélection. Une demande (clé `demandes` de Config, illisible des établissements) porte sur des données de l'établissement (colonnes demandées aux services) et/ou les éléments réservés du dernier signalement ; les droits d'écriture restent ceux des données demandées et des éléments réservés (échelons, périmètre). Les partenaires la voient à l'accueil de leur page des compléments, limitée à leur périmètre ; la cellule suit l'avancement dans l'onglet Établissements. Première forme des « campagnes vers les partenaires » de la cible ci-dessous : à reprendre dans la table `Campagnes` le moment venu.

## Cible : un document par académie (réflexion du 20/11/2026, non réalisée)

Pour la version la plus aboutie de PRISME, en vue du déploiement local. Rien de ce qui suit n'est encore codé ; les choix faits d'ici là doivent rester compatibles avec cette cible.

- **Principe d'homogénéité** : national, académique et départemental utilisent les mêmes outils, à des échelles différentes. Ce qui change d'un échelon à l'autre, c'est le périmètre (posé par les règles d'accès), pas l'écran. Les écrans de suivi calculent sur ce que l'utilisateur peut lire : donnés à une DSDEN, ils donnent ses chiffres sans code propre.
- **Trois familles de fonctions** :
  - **configurer** (formulaires, référentiel, accès, équipe, installation) : un seul modèle, pour que les données restent comparables ;
  - **piloter** (établissements et liens, publipostage, campagnes, compléments) : chaque échelon sur son périmètre ;
  - **consulter** (fiche établissement, tableau de bord) : chaque échelon sur son périmètre.

  La DSDEN voit les mêmes onglets de pilotage que la cellule, avec les mêmes mots et les mêmes gestes : widget d'administration en « mode pilotage », sans les onglets ni les boutons qui modifient la structure, plutôt qu'une seconde interface.
- **30 documents, un par académie**. Dans un document académique, deux échelons : le rectorat (cellule, propriétaire, toute l'administration) et les DSDEN (partenaires, lien, périmètre départemental), plus les établissements (lien). Les liens « Rectorat » n'y ont plus de raison d'être. Le document national est une instance comme les autres : même kit de widgets, périmètre France, partenaires éventuels = rectorats, données remontées des 30 documents (pas de saisie).
- **Trois flux entre le national et les académies** : vers le bas, le modèle (formulaires, référentiel, tableaux de bord : export / import de configuration, document modèle) et les demandes (campagnes, demandes de précision) ; vers le haut, les données (signalements, compléments) pour le tableau de bord et le point de situation nationaux.
- **Campagnes** : à terme dans une table `Campagnes` plutôt que dans Config (une ligne se dépose par automatisation dans chacun des 30 documents ; un partenaire peut écrire une ligne sans toucher aux réglages). Colonnes : échelon et périmètre, auteur, qui répond (établissements ou partenaires), ce qui est attendu (signalement, données demandées, éléments réservés), cible par critères, mode, dates, message. Chacun lit les campagnes qui touchent son périmètre et gère celles de son échelon. Chaque échelon sollicite l'échelon du dessous avec le même geste ; chez celui qui répond, file de travail sur le modèle du bandeau des visas.
- **Liens des établissements** : la DSDEN les lit dans son département (publipostage et relance). Une saisie faite avec le lien d'un établissement ne se distingue pas de celle de l'établissement.
- **Questions ouvertes** :
  1. remontée des données : recopie continue vers un document national (n8n…), cellule nationale membre des 30 documents, ou les deux ;
  2. liberté des académies : socle commun verrouillé (questions, colonnes qui remontent) et ajouts locaux libres qui ne remontent pas (recommandé) ;
  3. action du national dans un document académique : comptes membres des 30 documents ou dépôt automatique seulement.
- **Ordre envisagé** : mode pilotage des DSDEN et table `Campagnes` dans un document académique (indépendants des questions ouvertes), puis campagnes vers les partenaires, puis demande de précision, puis visas.

## Journal des versions

Les notes de version (une par version publiée, de la 2.0 à aujourd'hui) sont dans [`CHANGELOG.md`](CHANGELOG.md) : y ajouter la note de chaque nouvelle version, à la fin du fichier.

## Tester l'installation

Pour vérifier ce que voit un établissement ou un invité, ouvrir son lien dans une fenêtre de navigation privée : connecté avec un compte propriétaire, on voit tout le référentiel et le formulaire n'est pas prérempli.

1. Créer un document Grist vierge.
2. Ajouter une page avec un widget « Personnalisé », lié à n'importe quelle table.
3. Adresse : `https://majouble.github.io/test-formulaire/v2/admin/`, accès « complet au document ».
4. Vérifier les actions proposées, puis « Appliquer la sélection ». L'installation crée notamment la table `Administration` et la colonne `Auteur` des signalements.
5. Cliquer sur « Créer la page protégée » (bandeau de l'onglet Installation) : la page « Administration » est liée à la table `Administration`, que les règles d'accès réservent aux propriétaires. Ouvrir cette page, supprimer la page d'origine, puis appliquer les règles (onglet Accès). Les agents, les invités et les établissements ne voient plus l'administration.
