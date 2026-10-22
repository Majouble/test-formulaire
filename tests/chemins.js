// Chemins des scénarios : dépôt, données d'essai, sorties (captures, exports), navigateur.
// CHROMIUM : chemin d'un Chromium déjà installé (sinon celui de Playwright) ; SORTIES : dossier des sorties.
const path = require("path"), fs = require("fs");
const ici = __dirname, racine = path.resolve(ici, ".."), donnees = path.join(ici, "donnees");
const sorties = process.env.SORTIES || path.join(ici, "sorties");
for (const d of [sorties, path.join(sorties, "atlas2"), path.join(sorties, "poids")]) fs.mkdirSync(d, { recursive: true });
process.chdir(ici);   // mock.js, fakeapi.js, run27.js… sont lus depuis ce dossier
module.exports = { ici, racine, donnees, sorties, chromium: process.env.CHROMIUM || undefined };
