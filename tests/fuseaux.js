#!/usr/bin/env node
/* Contrôle des fuseaux horaires : PRISME affiche toutes les dates et heures à l'heure de Paris, quel que soit le
   fuseau du poste (un agent de La Réunion ou de Guyane voit les mêmes heures qu'un agent parisien).

   Chaque scénario est lancé deux fois EN MÊME TEMPS : navigateur à l'heure de Paris, et navigateur à l'heure d'un
   autre fuseau (Indian/Reunion par défaut). Les deux journaux doivent être identiques, heures et dates comprises ;
   seuls sont neutralisés les identifiants aléatoires, les secondes et les durées mesurées.

   Usage, depuis tests/ :
     node fuseaux.js                       toute la suite
     node fuseaux.js saisie-segpa pieces-jointes          quelques scénarios
     FUSEAU=America/Cayenne node fuseaux.js
   Variables : CHROMIUM, PARALLELE (paires de scénarios simultanées, 3 par défaut). */
"use strict";
const fs = require("fs"),
  path = require("path"),
  { spawn } = require("child_process");

const ICI = __dirname;
const AUTRE = process.env.FUSEAU || "Indian/Reunion";
const SORTIE = path.join(ICI, "sorties", "fuseaux");
const SUITE = fs
  .readFileSync(path.join(ICI, "lancer.sh"), "utf8")
  .match(/^SUITE="([^"]+)"/m)[1]
  .split(/\s+/);
const SEQUENTIELS = new Set(
  fs
    .readdirSync(ICI)
    .filter(
      (f) =>
        /\.spec\.js$/.test(f) &&
        /\b(87|88)\d\d\b|relais-local|faux-grist-api|createServer/.test(fs.readFileSync(path.join(ICI, f), "utf8")),
    )
    .map((f) => f.slice(0, -8)),
);

// ce qui varie entre deux exécutions simultanées, sans rapport avec le fuseau
const REMPLACEMENTS = [
  [/("_id":")[^"]+"/g, '$1<ID>"'],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<UUID>"],
  [/\b1\d{12}\b/g, "<N13>"],
  [/\b1[6-9]\d{8}(\.\d+)?\b/g, "<EPOCH>"],
  [/\b(\d{1,2}:\d{2}):\d{2}\b/g, "$1:<SS>"],
  [/\b\d+(\.\d+)? ?ms\b/g, "<N> ms"],
  [/(\.jpe?g \(|photo d'origine : )\d+ Ko/gi, "$1<N> Ko"],
  [/\bposte \d+\b/g, "poste <N>"],
  [/(Clé du relais : )\S+/g, "$1<CLÉ>"],
  [/(prisme-veille-)\d+/g, "$1<N>"],
  [/\bil y a \d+ (s|min|secondes?|minutes?|heures?)\b/g, "il y a <N> $1"],
];
const normaliser = (t) =>
  t
    .split("\n")
    .filter((l) => !l.startsWith("CONSOLE "))
    .map((l) => REMPLACEMENTS.reduce((s, [m, r]) => s.replace(m, r), l).replace(/\s+$/, ""));

function lancer(scenario, fuseau, dossier) {
  return new Promise((fin) => {
    fs.mkdirSync(dossier, { recursive: true });
    const sortie = fs.createWriteStream(path.join(dossier, `${scenario}.txt`));
    const env = {
      ...process.env,
      TZ: "Europe/Paris",
      FUSEAU_NAVIGATEUR: fuseau,
      SORTIES: path.join(dossier, "fichiers"),
    };
    const p = spawn(process.execPath, ["-r", "./fuseau-navigateur.js", `${scenario}.spec.js`], { cwd: ICI, env });
    const minuterie = setTimeout(() => p.kill("SIGKILL"), 300000);
    p.stdout.pipe(sortie);
    p.stderr.pipe(sortie);
    p.on("close", (code) => {
      clearTimeout(minuterie);
      sortie.end(() => fin(code));
    });
  });
}
const paire = (s) =>
  Promise.all([lancer(s, "Europe/Paris", path.join(SORTIE, "Paris")), lancer(s, AUTRE, path.join(SORTIE, "autre"))]);

(async () => {
  const demandes = process.argv.slice(2);
  const scenarios = demandes.length ? demandes : SUITE;
  const file = scenarios.filter((s) => !SEQUENTIELS.has(s));
  const travailleur = async () => {
    while (file.length) await paire(file.shift());
  };
  await Promise.all(Array.from({ length: Number(process.env.PARALLELE) || 3 }, travailleur));
  // scénarios à serveur local : un fuseau après l'autre (même port) ; heures comparées à la minute près
  for (const s of scenarios.filter((x) => SEQUENTIELS.has(x))) {
    await lancer(s, "Europe/Paris", path.join(SORTIE, "Paris"));
    await lancer(s, AUTRE, path.join(SORTIE, "autre"));
  }
  let ecarts = 0;
  for (const s of scenarios) {
    const a = normaliser(fs.readFileSync(path.join(SORTIE, "Paris", `${s}.txt`), "utf8")),
      b = normaliser(fs.readFileSync(path.join(SORTIE, "autre", `${s}.txt`), "utf8"));
    const diff = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++)
      if (a[i] !== b[i])
        diff.push(
          `    ligne ${i + 1}\n      Paris : ${(a[i] ?? "").slice(0, 260)}\n      ${AUTRE} : ${(b[i] ?? "").slice(0, 260)}`,
        );
    if (diff.length) {
      ecarts++;
      console.log(`ÉCART   ${s}  (${diff.length} ligne(s))\n${diff.slice(0, 3).join("\n")}`);
    } else console.log(`ok      ${s}`);
  }
  console.log(
    ecarts
      ? `\n${ecarts} scénario(s) affichent autre chose à l'heure de ${AUTRE}.`
      : `\nAffichage identique à l'heure de Paris et de ${AUTRE}.`,
  );
  process.exit(ecarts ? 1 : 0);
})();
