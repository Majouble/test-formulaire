# Bibliothèques tierces (`vendor/`)

Les widgets n'appellent aucun serveur de bibliothèques extérieur (CDN) : chaque bibliothèque est copiée ici, telle que publiée, à une version figée. Le code tiers s'exécute dans les widgets avec l'accès au document Grist ; le garder dans le dépôt, c'est savoir exactement ce qui tourne, ne pas dépendre de la disponibilité d'un CDN en pleine crise, et ne rien révéler de l'usage de l'outil à un tiers.

**Ne jamais modifier ces fichiers** (ni les reformater : le dossier est exclu de Prettier et d'ESLint).

| Bibliothèque | Version | Licence | Fichiers | Utilisée par |
|---|---|---|---|---|
| [Leaflet](https://leafletjs.com) | 1.9.4 | BSD-2-Clause | `leaflet/leaflet.js`, `leaflet/leaflet.css`, `leaflet/images/` | cartographie, référentiel des sites |
| [PizZip](https://github.com/open-xml-templating/pizzip) | 3.3.0 | MIT ou GPL-3.0 | `pizzip/pizzip.min.js` | point de situation (Word) |
| [docxtemplater](https://docxtemplater.com) | 3.71.0 | MIT | `docxtemplater/docxtemplater.js` | point de situation (Word) |
| [ExcelJS](https://github.com/exceljs/exceljs) | 4.4.0 | MIT | `exceljs/exceljs.min.js` | extractions (Excel), chargée à la demande |
| [JSZip](https://stuk.github.io/jszip/) | 3.10.1 | MIT ou GPL-3.0 | `jszip/jszip.min.js` | atlas QGIS, import du référentiel ESR, chargée à la demande |
| [shp-write](https://github.com/mapbox/shp-write) | 0.4.3 | BSD-2-Clause | `shp-write/shpwrite.js` | cartographie (export Shapefile), chargée à la demande |
| [sql.js](https://github.com/sql-js/sql.js) | 1.15.2 | MIT | `sql.js/sql-wasm.js`, `sql.js/sql-wasm.wasm` | kit de secours (lecture des fichiers .grist), intégrée au kit |

Reste à héberger ici : **`grist-plugin-api.js`** (API des widgets Grist), encore chargée depuis `docs.getgrist.com`.

## Provenance et empreintes

Fichiers extraits des paquets du registre npm (`npm pack <paquet>@<version>`, intégrité du paquet contrôlée par npm), le 06/11/2026. Les empreintes ci-dessous permettent de vérifier qu'un fichier n'a pas changé : `openssl dgst -sha384 -binary <fichier> | base64`.

| Fichier | Empreinte SHA-384 |
|---|---|
| `leaflet/leaflet.js` | `cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH` |
| `leaflet/leaflet.css` | `sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H` |
| `pizzip/pizzip.min.js` | `ee32BT8n82GSJKvwbByiNvRG+cApXO5gx10T6Flu47+if/0WrJO+PTIcrunC/jqC` |
| `docxtemplater/docxtemplater.js` | `vWfcdrAp5URB91Dl1ZEOdtU8ATKIbRenHw8R8JCD/Ykv0YMKavU1i/E0pA7CJfut` |
| `exceljs/exceljs.min.js` | `Pqp51FUN2/qzfxZxBCtF0stpc9ONI6MYZpVqmo8m20SoaQCzf+arZvACkLkirlPz` |
| `jszip/jszip.min.js` | `+mbV2IY1Zk/X1p/nWllGySJSUN8uMs+gUAN10Or95UBH0fpj6GfKgPmgC5EXieXG` |
| `shp-write/shpwrite.js` | `OZN0ldIk+CMjlOe7C8oGHiN/KaZtlkin35SPz2uuvB0g5cY6RoecVzw2zuoFebQB` |
| `sql.js/sql-wasm.js` | `xT9kd8BCaJ6QIR2xaUGPFFe0H6o0Vzj8ANZG2XVd0UtJ/Xu3r3aTaB0h7tzXD0pE` |
| `sql.js/sql-wasm.wasm` | `90zH37JkYc7bMuJuISu5Ll8vpKj18cCIYEO9cukivceww6f/gIrUFUlQN66xoIzS` |

Contrôle croisé : les empreintes SHA-256 de `leaflet.js` et `leaflet.css` sont identiques à celles que publie le projet Leaflet pour la version 1.9.4 (page d'installation de leafletjs.com).

## Maintenance

- **Une fois par trimestre**, et à chaque alerte de sécurité : vérifier pour chaque bibliothèque s'il existe un avis de sécurité (page « Security » du projet sur GitHub, ou `npm audit` sur un projet qui la déclare).
- **Mettre à jour** : récupérer la nouvelle version par `npm pack`, remplacer les fichiers, mettre à jour ce tableau (version, empreintes), lancer la suite de non-régression (`tests/verifier.js`), puis noter le changement dans le CHANGELOG.
- **Ajouter une bibliothèque** : même démarche, et ne jamais la charger depuis une adresse extérieure.
