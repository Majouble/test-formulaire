// Analyse du code des widgets (ESLint) : npm run analyse
// Les widgets sont des pages classiques (pas de modules) : chaque fichier publie ce qu'il partage sur window
// (Socle, Geo, OngletPlanning…). Les noms partagés sont déclarés ci-dessous, pour que l'analyse signale
// toute autre variable globale, presque toujours une faute de frappe.
"use strict";
const js = require("@eslint/js");
const globals = require("globals");
const html = require("eslint-plugin-html");

const PARTAGES = [
  // API Grist (grist-plugin-api.js) et bibliothèques tierces
  "grist", "L", "PizZip", "docxtemplater", "initSqlJs",
  // modules du socle et des widgets (window.*)
  "Socle", "SocleTheme", "SocleMarque", "Geo", "FicheEtab", "QualiteMoteur", "QualiteEdition", "PointMoteur",
  "Repartition", "PagesAgents", "TableauDeBord", "CarteSecours", "CarteConfiguration", "Atlas",
  "OngletAcces", "OngletActions", "OngletCampagnes", "OngletEffectifs", "OngletEquipe", "OngletEquipeGroupe",
  "OngletFormulaires", "OngletLiens", "OngletPlanning", "OngletPointSituation", "OngletQualite",
  "OngletReferentiel", "OngletReferentielESR", "OngletSitesESR", "OngletTableauDeBord", "OngletValidation", "OngletVeille",
];

module.exports = [
  { ignores: ["v2/secours/kit-secours.html", "**/vendor/**", "node_modules/**", "tests/**", "prod/**", "index.html"] },
  js.configs.recommended,
  {
    files: ["v2/**/*.js", "v2/**/*.html"],
    plugins: { html },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: { ...globals.browser, ...Object.fromEntries(PARTAGES.map(n => [n, "readonly"])) },
    },
    rules: {
      // « const { id, ...reste } = ligne » : on nomme ce qu'on écarte, c'est voulu
      "no-unused-vars": ["warn", { args: "none", caughtErrors: "none", ignoreRestSiblings: true }],
      // retirer les caractères de contrôle d'un texte (noms de fichiers, XML Word) est voulu
      "no-control-regex": "off",
      "no-empty": ["warn", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["outils/**/*.js"],
    languageOptions: { ecmaVersion: "latest", sourceType: "commonjs", globals: globals.node },
  },
];
