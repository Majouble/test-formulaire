// Analyse du code des widgets (ESLint) : npm run analyse
// Les widgets sont des pages classiques (pas de modules) : chaque fichier publie ce qu'il partage sur window
// (Socle, Geo, OngletPlanning…). Les noms partagés sont déclarés ci-dessous, pour que l'analyse signale
// toute autre variable globale, presque toujours une faute de frappe.
"use strict";
const js = require("@eslint/js");
const globals = require("globals");
const html = require("eslint-plugin-html");
const espree = require("espree");
const fs = require("fs");
const path = require("path");

// Modules de la saisie (v2/saisie/modules/) : un seul script découpé en fichiers, chargés dans l'ordre ; ce que
// chacun déclare au premier niveau est visible des autres. Ces noms sont relevés ici dans les fichiers eux-mêmes.
const MODULES_SAISIE = path.join(__dirname, "v2/saisie/modules");
function nomsDePremierNiveau(fichier) {
  const ast = espree.parse(fs.readFileSync(fichier, "utf8"), { ecmaVersion: "latest" });
  const noms = (p) =>
    !p
      ? []
      : p.type === "Identifier"
        ? [p.name]
        : p.type === "ObjectPattern"
          ? p.properties.flatMap((x) => noms(x.value || x.argument))
          : p.type === "ArrayPattern"
            ? p.elements.flatMap(noms)
            : p.type === "AssignmentPattern"
              ? noms(p.left)
              : p.type === "RestElement"
                ? noms(p.argument)
                : [];
  return ast.body.flatMap((st) =>
    st.type === "VariableDeclaration"
      ? st.declarations.flatMap((d) => noms(d.id))
      : st.id && (st.type === "FunctionDeclaration" || st.type === "ClassDeclaration")
        ? [st.id.name]
        : [],
  );
}
const NOMS_SAISIE = fs.existsSync(MODULES_SAISIE)
  ? fs
      .readdirSync(MODULES_SAISIE)
      .filter((f) => f.endsWith(".js"))
      .flatMap((f) => nomsDePremierNiveau(path.join(MODULES_SAISIE, f)))
  : [];

const PARTAGES = [
  // API Grist (grist-plugin-api.js) et bibliothèques tierces
  "grist",
  "L",
  "PizZip",
  "docxtemplater",
  "initSqlJs",
  // modules du socle et des widgets (window.*)
  "Outils",
  "Donnees",
  "Socle",
  "SocleTheme",
  "SocleMarque",
  "Geo",
  "FicheEtab",
  "QualiteMoteur",
  "QualiteEdition",
  "PointMoteur",
  "Repartition",
  "PagesAgents",
  "TableauDeBord",
  "CarteSecours",
  "CarteConfiguration",
  "Atlas",
  "OngletAcces",
  "OngletActions",
  "OngletCampagnes",
  "OngletEffectifs",
  "OngletEquipe",
  "OngletEquipeGroupe",
  "OngletFormulaires",
  "OngletLiens",
  "OngletPlanning",
  "OngletPointSituation",
  "OngletQualite",
  "OngletReferentiel",
  "OngletReferentielESR",
  "OngletSitesESR",
  "OngletTableauDeBord",
  "OngletValidation",
  "OngletVeille",
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
      globals: { ...globals.browser, ...Object.fromEntries(PARTAGES.map((n) => [n, "readonly"])) },
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
    files: ["v2/saisie/modules/*.js"],
    languageOptions: { globals: Object.fromEntries(NOMS_SAISIE.map((n) => [n, "writable"])) },
    rules: {
      // chaque module déclare ce que les autres utilisent : ni « redéclaration », ni « inutilisé » au premier niveau
      "no-redeclare": ["error", { builtinGlobals: false }],
      "no-unused-vars": ["warn", { vars: "local", args: "none", caughtErrors: "none", ignoreRestSiblings: true }],
    },
  },
  {
    files: ["outils/**/*.js"],
    languageOptions: { ecmaVersion: "latest", sourceType: "commonjs", globals: globals.node },
  },
];
