# Signalements Grist — version 2

Ce dossier contient la version 2 des widgets. La version 1 (`index.html` à la racine du dépôt) reste en service tant que les documents MEN et ESR n'ont pas basculé.

| Adresse | Version | Usage |
| --- | --- | --- |
| `https://majouble.github.io/test-formulaire/` | v1 | Documents en production (ne pas modifier pendant la refonte) |
| `https://majouble.github.io/test-formulaire/v2/saisie/` | v2 | Formulaire de saisie : Config, rôles, périmètre de la page, fusion des mises à jour concurrentes (en test) |
| `https://majouble.github.io/test-formulaire/v2/admin/` | v2 | Administration : onglets Installation, Référentiel (annuaire EN) et Formulaires en test ; point de situation et tableau de bord à venir |
| `https://majouble.github.io/test-formulaire/v2/point-situation/` | v2 | Production du point de situation (à venir) |
| `https://majouble.github.io/test-formulaire/v2/tableau-de-bord/` | v2 | Tableau de bord (à venir) |

## Organisation

```
v2/
├── README.md            ce fichier
├── commun/socle.js      code partagé : lecture de Config, rôles, plan d'installation
├── saisie/              formulaire de saisie
├── admin/               administration : installation.js, referentiel.js, formulaires.js (+ formulaires.css)
├── point-situation/     production du point de situation
├── tableau-de-bord/     tableau de bord
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
- La configuration des formulaires, du point de situation et du tableau de bord se fait dans l'administration.

## Tester l'installation

1. Créer un document Grist vierge.
2. Ajouter une page avec un widget « Personnalisé », lié à n'importe quelle table.
3. Adresse : `https://majouble.github.io/test-formulaire/v2/admin/`, accès « complet au document ».
4. Vérifier les actions proposées, puis « Appliquer la sélection ».
