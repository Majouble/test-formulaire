#!/usr/bin/env node
/* Numéro de version dans les adresses des fichiers du widget, pour que les navigateurs prennent la version publiée.
   GitHub Pages laisse les navigateurs garder chaque fichier 10 minutes : sans numéro, une page peut mêler l'ancienne
   et la nouvelle version.
   - pages de v2/ (sauf le kit de secours, autonome) : scripts et feuilles de style locaux appelés avec ?v=<version> ;
   - v2/version.json : version publiée, lue sans cache par le socle au chargement (commun/socle.js) ; une page plus
     ancienne se recharge alors une fois avec ?v=<version>.
   À lancer après chaque changement de VERSION (commun/socle.js) ; outils/publier-prod.sh le lance aussi.
   Usage : node outils/versionner.js [--verifier]  (--verifier : n'écrit rien, échoue si une page n'est pas à jour) */
"use strict";
const fs = require("fs"), path = require("path");
const racine = path.resolve(__dirname, ".."), v2 = path.join(racine, "v2");
const VERSION = (fs.readFileSync(path.join(v2, "commun/socle.js"), "utf8").match(/const VERSION = "([^"]+)"/) || [])[1];
if (!VERSION) { console.error("VERSION introuvable dans v2/commun/socle.js"); process.exit(1); }
const num = VERSION.split(" ")[0], verifier = process.argv.includes("--verifier");
const pages = [];
(function parcourir(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) {
  const p = path.join(d, f.name);
  if (f.isDirectory()) { if (f.name !== "vendor") parcourir(p); }
  else if (f.name.endsWith(".html") && f.name !== "kit-secours.html") pages.push(p);
} })(v2);
// <script src="…"> et <link … href="…"> locaux (ni http, ni //, ni data:) : ?v=<version>
const RE = /(<(?:script|link)\b[^>]*?\s(?:src|href)=")((?!https?:|\/\/|data:|#)[^"?#]+\.(?:js|css))(?:\?v=[^"#]*)?(")/g;
let changees = 0, ecarts = [];
for (const p of pages) {
  const avant = fs.readFileSync(p, "utf8"), apres = avant.replace(RE, (_, a, f, z) => `${a}${f}?v=${num}${z}`);
  if (apres !== avant) { if (verifier) ecarts.push(path.relative(racine, p)); else { fs.writeFileSync(p, apres); changees++; } }
}
const json = JSON.stringify({ version: VERSION }, null, 1) + "\n", fj = path.join(v2, "version.json");
const jsonAJour = fs.existsSync(fj) && fs.readFileSync(fj, "utf8") === json;
if (verifier) {
  if (!jsonAJour) ecarts.push("v2/version.json");
  if (ecarts.length) { console.error(`Version ${num} absente de : ${ecarts.join(", ")} — lancer node outils/versionner.js`); process.exit(1); }
  console.log(`Pages et version.json à jour (${num}).`);
} else {
  if (!jsonAJour) fs.writeFileSync(fj, json);
  console.log(`Version ${num} : ${changees} page(s) mise(s) à jour sur ${pages.length}, version.json ${jsonAJour ? "inchangé" : "écrit"}.`);
}
