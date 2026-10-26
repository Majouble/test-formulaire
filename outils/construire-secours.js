#!/usr/bin/env node
/* Assemble le kit de secours : un seul fichier HTML qui fonctionne sans réseau.
   - une coquille : bandeau du mode secours, « Grist hors ligne » (v2/secours/grist-hors-ligne.js), lecteur des
     documents .grist (sql.js, licence MIT) et document de démonstration ;
   - trois vues, chacune dans son cadre, avec le code des widgets intégré : saisie (v2/saisie), tableau de bord
     (v2/tableau-de-bord) et tableau des signalements de A à Z (v2/secours/liste.html). Chaque cadre reçoit son
     objet « grist » de la coquille, à la place de grist-plugin-api.js.
   Usage : node outils/construire-secours.js  →  v2/secours/kit-secours.html  */
"use strict";
const fs = require("fs"), path = require("path");
const racine = path.resolve(__dirname, "..");
const lire = p => fs.readFileSync(path.join(racine, p), "utf8");
const enScript = code => code.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");

// widget → page autonome : scripts et feuilles de style locaux intégrés, API Grist fournie par la coquille
function vue(chemin) {
  const dossier = path.dirname(chemin);
  let html = lire(chemin);
  const api = /<script src="https:\/\/docs\.getgrist\.com\/grist-plugin-api\.js"><\/script>/;
  if (!api.test(html)) throw new Error(`${chemin} : grist-plugin-api.js introuvable`);
  // fichiers produits par le widget (blob:) : téléchargés par la coquille, qui garde leur nom
  html = html.replace(api, () => `<script>window.grist = parent.__kitGrist(window.frameElement && window.frameElement.dataset.vue);
(function () { const clic = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.hasAttribute("download") && /^(blob|data):/.test(this.href) && parent.__kitTelecharger) {
      const nom = this.getAttribute("download") || "fichier"; fetch(this.href).then(r => r.blob()).then(b => parent.__kitTelecharger(b, nom)); return;
    }
    return clic.call(this);
  }; })();</script>`);
  html = html.replace(/<script src="(\.\.?\/[^"]+|[\w.-]+\.js)"><\/script>/g, (_, src) => `<script>\n${enScript(lire(path.join(dossier, src)))}\n</script>`);
  html = html.replace(/<link rel="stylesheet" href="([\w.-]+\.css)">/g, (_, href) => `<style>\n${lire(path.join(dossier, href))}\n</style>`);
  const reste = html.match(/<script[^>]+src="https?:[^"]+"|<link[^>]+href="https?:[^"]+"/i);
  if (reste) throw new Error(`${chemin} : ressource en ligne restante (${reste[0]})`);
  return html;
}
const vues = { saisie: vue("v2/saisie/index.html"), tableau: vue("v2/tableau-de-bord/index.html"), liste: vue("v2/secours/liste.html") };

const socle = lire("v2/commun/socle.js");
const version = (socle.match(/VERSION\s*=\s*"([^"]+)"/) || [])[1] || "?";
const versionSql = JSON.parse(lire("v2/secours/vendor/package-version.json")).version;
const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mode secours — signalements</title>
<!-- Kit de secours ${version}, construit le ${new Date().toLocaleString("fr-FR")} par outils/construire-secours.js — ne pas modifier à la main -->
<style>
  html, body { height: 100%; margin: 0; }
  body { display: flex; flex-direction: column; background: #f4f5f7; }
  #kit-secours { flex: none; }
  #kit-vues { flex: 1; position: relative; min-height: 0; }
  #kit-vues iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: #fff; }
  #kit-vues iframe[hidden] { display: none; }
</style>
<script>/* sql.js ${versionSql} — https://github.com/sql-js/sql.js — licence MIT */
${enScript(lire("v2/secours/vendor/sql-wasm.js"))}</script>
<script>window.__KIT_SQLJS_WASM__="${fs.readFileSync(path.join(racine, "v2/secours/vendor/sql-wasm.wasm")).toString("base64")}";</script>
<script>window.__KIT_WIDGET_VERSION__=${JSON.stringify(version)};
window.__KIT_DEMO__=${enScript(JSON.stringify(JSON.parse(lire("v2/secours/demo.json")).tables))};
window.__KIT_VUES__=${enScript(JSON.stringify(vues))};</script>
<script>
${enScript(lire("v2/secours/grist-hors-ligne.js"))}
</script>
</head>
<body></body>
</html>
`;
const sortie = path.join(racine, "v2/secours/kit-secours.html");
fs.writeFileSync(sortie, html);
console.log(`Kit de secours écrit : ${path.relative(racine, sortie)} (${(html.length / 1048576).toFixed(2)} Mo, widgets ${version} : ${Object.keys(vues).join(", ")})`);
