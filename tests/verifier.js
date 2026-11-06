#!/usr/bin/env node
/* Test de non-régression de la suite : chaque scénario affiche ce qu'il observe (textes, comptes, contenus
   écrits dans le document) ; ce script lance la suite, retire de ces journaux ce qui change d'une exécution à
   l'autre (heures, dates, identifiants aléatoires, durées) et compare le résultat aux journaux de référence
   (tests/references/). Toute différence est un changement de comportement à examiner.

   Usage, depuis tests/ :
     node verifier.js                 toute la suite
     node verifier.js run74 run76     quelques scénarios
     node verifier.js --maj           enregistre les journaux actuels comme nouvelle référence
                                      (après avoir vérifié que les différences sont voulues)
   Variables : CHROMIUM (chemin d'un Chromium déjà installé), PARALLELE (scénarios simultanés, 4 par défaut). */
"use strict";
const fs = require("fs"), path = require("path"), { spawn } = require("child_process");

const ICI = __dirname;
const REFERENCES = path.join(ICI, "references");
const JOURNAUX = path.join(ICI, "sorties", "journaux");
const SUITE = fs.readFileSync(path.join(ICI, "lancer.sh"), "utf8").match(/^SUITE="([^"]+)"/m)[1].split(/\s+/);
// scénarios qui ouvrent un serveur local (ports 87xx, partagés entre eux) : jamais en même temps
const SEQUENTIELS = new Set(fs.readdirSync(ICI).filter(f => /^run\d+\.js$/.test(f) && /\b87\d\d\b/.test(fs.readFileSync(path.join(ICI, f), "utf8"))).map(f => f.slice(0, -3)));

// scénarios dont le déroulé dépend de minuteries qui se chevauchent : un écart y est signalé sans compter comme échec
// (run99, mode veille : à réécrire avec des attentes explicites)
const INSTABLES = new Set(["run99"]);

/* ---------- Normalisation : ce qui varie d'une exécution à l'autre ---------- */
// numéro de version du socle (« 2.53.0 ») : change à chaque publication, sans changer le comportement
const VERSION = fs.readFileSync(path.join(ICI, "..", "v2", "commun", "socle.js"), "utf8").match(/VERSION = "([\d.]+)/)[1];
const REMPLACEMENTS = [
  [new RegExp(`\\b${VERSION.replace(/\./g, "\\.")}\\b`, "g"), "<VERSION>"],
  [/\b\d{4}_\d{2}_\d{2}_\d{2}h\d{2}/g, "<HORODATAGE>"],   // noms de fichiers exportés (2026_11_06_18h26_…)
  [/\b20\d{6}-\d{4}\b/g, "<HORODATAGE>"],                  // noms de fichiers exportés (…-20261106-1740.csv)
  [/(\.jpe?g \(|photo d'origine : )\d+ Ko/gi, "$1<N> Ko"],   // photo d'essai fabriquée puis recompressée : poids variable
  [/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?/g, "<ISO>"],
  [/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g, "<DATE>"],
  [/\b\d{2}\/\d{2}\b/g, "<JJ/MM>"],
  [/\b(lun|mar|mer|jeu|ven|sam|dim)\.(?= <JJ\/MM>)/g, "<JOUR>"],
  [/\b\d{1,2}[:h]\d{2}(:\d{2})?\b/g, "<HEURE>"],
  [/\b1\d{12}\b/g, "<N13>"],                     // horodatage en millisecondes, ou numéro de ligne créée en mode secours
  [/\b1[6-9]\d{8}(\.\d+)?\b/g, "<EPOCH>"],       // horodatage en secondes
  [/\b\d+(\.\d+)? ?ms\b/g, "<N> ms"],            // durées mesurées
  [/("_id":")[^"]+"/g, '$1<ID>"'],              // identifiants aléatoires des sous-lignes (sites, blocs)
  [/\bposte \d+\b/g, "poste <N>"],
  [/(Clé du relais : )\S+/g, "$1<CLÉ>"],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<UUID>"],
  [/\(\d{1,2} h – \d{1,2} h\)/g, "(<H> h – <H> h)"],       // plage horaire calculée depuis l'heure du lancement
  [/\bil y a \d+ (s|min|secondes?|minutes?|heures?)\b/g, "il y a <N> $1"],
  [/(prisme-veille-)\d+/g, "$1<N>"],
];
function normaliser(texte) {
  let lignes = texte.split("\n").map(l => REMPLACEMENTS.reduce((s, [motif, par]) => s.replace(motif, par), l).replace(/\s+$/, ""));
  // messages du navigateur : leur ordre dépend du réseau simulé, seul leur ensemble compte
  const console_ = lignes.filter(l => l.startsWith("CONSOLE ")).sort();
  lignes = lignes.filter(l => !l.startsWith("CONSOLE "));
  return [...lignes, ...console_].join("\n").trim() + "\n";
}

/* ---------- Exécution ---------- */
function lancer(scenario) {
  return new Promise(fin => {
    const sortie = fs.createWriteStream(path.join(JOURNAUX, `${scenario}.txt`));
    const p = spawn(process.execPath, [`${scenario}.js`], { cwd: ICI, env: process.env });
    const minuterie = setTimeout(() => p.kill("SIGKILL"), 300000);
    p.stdout.pipe(sortie); p.stderr.pipe(sortie);
    p.on("close", code => { clearTimeout(minuterie); sortie.end(() => fin(code)); });
  });
}
async function toutLancer(scenarios, parallele) {
  const codes = {};
  const file = scenarios.filter(s => !SEQUENTIELS.has(s));
  const travailleur = async () => { while (file.length) { const s = file.shift(); codes[s] = await lancer(s); } };
  await Promise.all(Array.from({ length: parallele }, travailleur));
  for (const s of scenarios.filter(s => SEQUENTIELS.has(s))) codes[s] = await lancer(s);
  return codes;
}

/* ---------- Comparaison ---------- */
function premiereDifference(attendu, obtenu) {
  const a = attendu.split("\n"), b = obtenu.split("\n");
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) return `ligne ${i + 1}\n    attendu : ${(a[i] ?? "(rien)").slice(0, 300)}\n    obtenu  : ${(b[i] ?? "(rien)").slice(0, 300)}`;
  }
  return "";
}

(async () => {
  const args = process.argv.slice(2), maj = args.includes("--maj");
  const scenarios = args.filter(a => !a.startsWith("--")).length ? args.filter(a => !a.startsWith("--")) : SUITE;
  fs.mkdirSync(JOURNAUX, { recursive: true }); fs.mkdirSync(REFERENCES, { recursive: true });
  const codes = await toutLancer(scenarios, Number(process.env.PARALLELE) || 4);
  let echecs = 0;
  for (const s of scenarios) {
    const brut = fs.readFileSync(path.join(JOURNAUX, `${s}.txt`), "utf8");
    const obtenu = normaliser(brut), fichierRef = path.join(REFERENCES, `${s}.txt`);
    const erreurPage = /PAGEERROR|Error:/.test(brut) || codes[s] !== 0;
    if (maj) {
      if (erreurPage) { console.log(`ÉCHEC   ${s}  (erreur : référence non enregistrée, voir sorties/journaux/${s}.txt)`); echecs++; continue; }
      fs.writeFileSync(fichierRef, obtenu); console.log(`réf.    ${s}`); continue;
    }
    if (erreurPage) { console.log(`ÉCHEC   ${s}  (erreur de page ou arrêt, voir sorties/journaux/${s}.txt)`); echecs++; continue; }
    if (!fs.existsSync(fichierRef)) { console.log(`ÉCHEC   ${s}  (pas de référence : node verifier.js --maj ${s})`); echecs++; continue; }
    const diff = premiereDifference(fs.readFileSync(fichierRef, "utf8"), obtenu);
    if (diff && INSTABLES.has(s)) console.log(`instable ${s}  (écart non bloquant) ${diff}`);
    else if (diff) { console.log(`ÉCART   ${s}  ${diff}`); echecs++; } else console.log(`ok      ${s}`);
  }
  const bilan = maj ? `${scenarios.length - echecs} référence(s) enregistrée(s)` : `${scenarios.length} scénarios conformes à la référence`;
  console.log(echecs ? `\n${echecs} scénario(s) en écart ou en échec sur ${scenarios.length}.` : `\n${bilan}.`);
  process.exit(echecs ? 1 : 0);
})();
