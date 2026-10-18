# Signalements Grist — version 2

Ce dossier contient la version 2 des widgets. La version 1 (`index.html` à la racine du dépôt) reste en service tant que les documents MEN et ESR n'ont pas basculé.

| Adresse | Version | Usage |
| --- | --- | --- |
| `https://majouble.github.io/test-formulaire/` | v1 | Documents en production (ne pas modifier pendant la refonte) |
| `https://majouble.github.io/test-formulaire/v2/saisie/` | v2 | Formulaire de saisie : Config, rôles, périmètre de la page, fusion des mises à jour concurrentes (en test) |
| `https://majouble.github.io/test-formulaire/v2/admin/` | v2 | Administration : onglets Installation, Référentiel (annuaire EN), Équipe, Planning, Actions, Accès, Établissements (liens d'accès et publipostage), Formulaires, Point de situation et Tableau de bord en test |
| `https://majouble.github.io/test-formulaire/v2/point-situation/` | v2 | Production du point de situation, selon la configuration publiée dans l'administration (en test) |
| `https://majouble.github.io/test-formulaire/v2/tableau-de-bord/` | v2 | Tableau de bord en lecture, selon la version publiée dans l'administration (en test) |
| `https://majouble.github.io/test-formulaire/v2/cartographie/` | v2 | Cartographie : carte des signalements et export GeoJSON, KML, GPX, CSV (WKT), Shapefile (en test) |

## Organisation

```
v2/
├── README.md            ce fichier
├── commun/socle.js      code partagé : lecture de Config, rôles, plan d'installation
├── commun/geo.js        fond de carte commun : départements et académies (Lambert-93, encarts), placement d'un point latitude / longitude
├── saisie/              formulaire de saisie
├── admin/               administration : installation.js, referentiel.js, equipe.js, planning.js, actions.js, acces.js, liens.js, repartition.js (partagé Équipe / Formulaires), formulaires.js (+ formulaires.css)
├── point-situation/     production du point de situation
├── cartographie/        carte et export cartographique (reprise du widget « Export cartographique »)
├── tableau-de-bord/     tableau de bord : tableau.js (module partagé, édition dans l'administration, lecture dans le widget)
└── modeles/             exemples de configuration à importer (à venir)
```

## Règles

1. Un widget ne lit jamais une colonne par son nom en dur : il passe par un rôle (voir le contrat du socle).
2. Un réglage commun au document s'écrit dans la table `Config`, sous la clé de son module. Un réglage propre à une page (formulaire, périmètre, libellé) reste dans les options du widget de cette page.
3. Un module ne dépend que du socle, jamais d'un autre module.
4. Chaque widget affiche son numéro de version dans son panneau de diagnostic. Le numéro (`VERSION` de `commun/socle.js`) est incrémenté à chaque mise à jour publiée.

## Décisions (15/10/2026)

- Un dossier = un établissement (et un site) un jour donné. La dernière version est la plus récente par date de saisie, puis par numéro de ligne.
- « RAS » est la qualification de retour à la normale, dans tous les documents.
- Un document Grist par situation, dupliqué depuis le modèle.
- Une page par agent, chacune avec son périmètre d'académies.

## Décisions (17/10/2026)

- L'équipe de la cellule est une table du socle, `Agents` (onglet Équipe) : nom, adresse, fonction habituelle dans la cellule (`Fonction` : opérateur, rédacteur, coordinateur…, liste réglable dans l'onglet Planning, clé `planning` de Config), téléphone, actif. Pas de niveau d'accès, pas de périmètre sur la fiche.
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

- Accès des établissements par lien (17/10, onglet Établissements) : clé secrète par établissement (colonne `UUID` du référentiel, formule d'initialisation `UUID()`, clés manquantes générées en un clic) et lien (`Lien` = `SELF_HYPERLINK(page=<page des établissements>, LinkKey_Etab=$UUID)`, soit `…/p/<n>?Etab_=<clé>`). Page « Signalement — établissements » créée avec le widget de saisie (option `etablissements`), ignorée par l'équipe et les pages d'agents. Règles (onglet Accès, avec les autres) : attribut « Etab » (clé du lien → ligne du référentiel) ; l'établissement lit, crée et met à jour ses seuls signalements, sans les visas (ni lecture ni écriture) ni l'adresse de l'auteur ; il voit sa seule ligne du référentiel, sans clé ni lien, et lit Config, Formulaires et les listes de choix ; les sous-tables reçoivent une colonne `Etablissement_acces` (les règles ne suivent pas les références). Le widget passe de lui-même en mode établissement (« Vos signalements »). Ensuite : test avec un compte hors équipe, puis partage public du document en Éditeur. Publipostage : filtres par critère de répartition, message modifiable (clé `liens` de Config, repris par le bouton ✉ des pages de saisie), fichier CSV (UAI, nom, commune, adresse, lien, objet, message) pour une fusion Word / Outlook ou n8n, nouvelle clé pour révoquer un lien. Une personne ouverte par un lien ne peut pas lire les métadonnées de Grist (tables `_grist_…`) : le widget de saisie lit alors une copie des colonnes utiles (réponses, référentiel, sous-tables, listes de choix) rangée dans la clé `schema` de Config, rafraîchie à la publication d'un formulaire, à l'ouverture de l'onglet Établissements et à l'application des règles d'accès (18/10). À la publication d'un formulaire, si les règles du socle sont en place mais ne correspondent plus (nouvelle sous-table d'une question tableau, nouvelle question de visa…), elles sont réappliquées d'office (propriétaire seulement ; sinon, message renvoyant à l'onglet Accès).

## Tester l'installation

1. Créer un document Grist vierge.
2. Ajouter une page avec un widget « Personnalisé », lié à n'importe quelle table.
3. Adresse : `https://majouble.github.io/test-formulaire/v2/admin/`, accès « complet au document ».
4. Vérifier les actions proposées, puis « Appliquer la sélection ».
