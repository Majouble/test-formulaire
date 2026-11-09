/* Outil de relecture du code (lancé à la main, pas par les widgets). */
/* Deux scripts sont-ils identiques au renommage près des liaisons locales ?
   usage : node equivalence.js avant.js apres.js  → « identiques » ou la première différence */
const fs = require("fs");
const espree = require("espree"),
  scope = require("eslint-scope");
function forme(fichier) {
  const src = fs.readFileSync(fichier, "utf8");
  const ast = espree.parse(src, { ecmaVersion: "latest", range: true });
  const sm = scope.analyze(ast, { ecmaVersion: 2022 });
  const parNoeud = new Map();
  for (const s of sm.scopes)
    for (const v of s.variables)
      if (v.defs.length) {
        for (const id of v.identifiers) parNoeud.set(id, v);
        for (const r of v.references) parNoeud.set(r.identifier, v);
      }
  const numeros = new Map();
  const sortie = [];
  (function ecrire(n) {
    if (n === null || typeof n !== "object") {
      sortie.push(JSON.stringify(n));
      return;
    }
    if (Array.isArray(n)) {
      sortie.push("[");
      n.forEach(ecrire);
      sortie.push("]");
      return;
    }
    if (n.type === "Identifier") {
      const v = parNoeud.get(n);
      if (v) {
        if (!numeros.has(v)) numeros.set(v, numeros.size);
        sortie.push(`#${numeros.get(v)}`);
      } else sortie.push(`@${n.name}`);
      return;
    }
    sortie.push(`(${n.type}`);
    for (const k of Object.keys(n).sort()) {
      if (["range", "start", "end", "loc", "raw", "shorthand", "type"].includes(k)) continue;
      if (n.type === "Property" && k === "key" && !n.computed) {
        sortie.push(`key=${n.key.name ?? JSON.stringify(n.key.value)}`);
        continue;
      }
      sortie.push(k + "=");
      ecrire(n[k]);
    }
    sortie.push(")");
  })(ast);
  return sortie;
}
const a = forme(process.argv[2]),
  b = forme(process.argv[3]);
const i = a.findIndex((x, k) => x !== b[k]);
if (i < 0 && a.length === b.length) console.log("identiques");
else {
  console.log(
    "DIFFÉRENCE à l'élément",
    i,
    ":",
    a.slice(Math.max(0, i - 8), i + 4).join(" "),
    " ≠ ",
    b.slice(Math.max(0, i - 8), i + 4).join(" "),
  );
  process.exit(1);
}
