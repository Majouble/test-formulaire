#!/usr/bin/env node
/* Assemble le kit de secours : un seul fichier HTML qui fonctionne sans réseau.
   Contenu : le widget de saisie (v2/saisie/index.html) avec le socle et le thème intégrés,
   le « Grist hors ligne » (v2/secours/grist-hors-ligne.js) à la place de grist-plugin-api.js,
   le lecteur de documents .grist (sql.js, licence MIT) et un document de démonstration.
   Usage : node outils/construire-secours.js  →  v2/secours/kit-secours.html  */
"use strict";
const fs = require("fs"), path = require("path");
const racine = path.resolve(__dirname, "..");
const lire = p => fs.readFileSync(path.join(racine, p), "utf8");
const enScript = code => code.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");

let html = lire("v2/saisie/index.html");
const socle = lire("v2/commun/socle.js"), theme = lire("v2/commun/theme.js");
const version = (socle.match(/VERSION\s*=\s*"([^"]+)"/) || [])[1] || "?";
const sqljs = lire("v2/secours/vendor/sql-wasm.js");
const wasm = fs.readFileSync(path.join(racine, "v2/secours/vendor/sql-wasm.wasm")).toString("base64");
const demo = JSON.parse(lire("v2/secours/demo.json")).tables;
const shim = lire("v2/secours/grist-hors-ligne.js");

const remplacer = (motif, par, quoi) => {
  if (!motif.test(html)) throw new Error(`introuvable dans le widget de saisie : ${quoi}`);
  html = html.replace(motif, () => par);
};
remplacer(/<script src="https:\/\/docs\.getgrist\.com\/grist-plugin-api\.js"><\/script>/, [
  `<!-- Kit de secours : construit le ${new Date().toLocaleString("fr-FR")} par outils/construire-secours.js — ne pas modifier à la main -->`,
  `<script>/* sql.js ${JSON.parse(fs.readFileSync(path.join(racine, "v2/secours/vendor/package-version.json"), "utf8")).version} — https://github.com/sql-js/sql.js — licence MIT */\n${enScript(sqljs)}</script>`,
  `<script>window.__KIT_SQLJS_WASM__="${wasm}";</script>`,
  `<script>window.__KIT_WIDGET_VERSION__=${JSON.stringify(version)};window.__KIT_DEMO__=${enScript(JSON.stringify(demo))};</script>`,
  `<script>\n${enScript(shim)}\n</script>`,
].join("\n"), "grist-plugin-api.js");
remplacer(/<script src="\.\.\/commun\/theme\.js"><\/script>/, `<script>\n${enScript(theme)}\n</script>`, "theme.js");
remplacer(/<script src="\.\.\/commun\/socle\.js"><\/script>/, `<script>\n${enScript(socle)}\n</script>`, "socle.js");
html = html.replace(/<title>([^<]*)<\/title>/, (_, t) => `<title>Mode secours — ${t}</title>`);
if (/<script[^>]+src="https?:/i.test(html)) throw new Error("une ressource en ligne reste chargée par le kit");

const sortie = path.join(racine, "v2/secours/kit-secours.html");
fs.writeFileSync(sortie, html);
console.log(`Kit de secours écrit : ${path.relative(racine, sortie)} (${(html.length / 1048576).toFixed(2)} Mo, widget ${version})`);
