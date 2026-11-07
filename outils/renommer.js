/* Outil de relecture du code (lancé à la main, pas par les widgets). */
/* Renommage sûr de liaisons (variables, paramètres, fonctions) d'un script classique.
   usage : node renommer.js fichier.js spec.txt   (spec : « ligne:colonne ancien nouveau » ou « ligne ancien nouveau »)
   Les propriétés abrégées ({ a }) gardent leur clé : { a: nouveau }. Écrit le fichier en place. */
const fs = require("fs");
const espree = require("espree"),
  scope = require("eslint-scope");
const [fichier, specFichier] = process.argv.slice(2);
const src = fs.readFileSync(fichier, "utf8");
const ast = espree.parse(src, { ecmaVersion: "latest", loc: true, range: true });
const sm = scope.analyze(ast, { ecmaVersion: 2022 });
const parents = new Map();
(function marquer(n, p) {
  if (!n || typeof n.type !== "string") return;
  parents.set(n, p);
  for (const k of Object.keys(n)) {
    if (k === "parent") continue;
    const v = n[k];
    if (Array.isArray(v)) v.forEach((x) => x && typeof x.type === "string" && marquer(x, n));
    else if (v && typeof v.type === "string") marquer(v, n);
  }
})(ast, null);
const variables = [];
for (const s of sm.scopes) for (const v of s.variables) if (v.defs.length) variables.push({ v, s });
const spec = fs
  .readFileSync(specFichier, "utf8")
  .split("\n")
  .map((l) => l.replace(/#.*/, "").trim())
  .filter(Boolean);
const remplacements = [],
  erreurs = [];
const vus = new Set();
for (const ligne of spec) {
  const [pos, ancien, nouveau] = ligne.split(/\s+/);
  const [l, c] = pos.split(":").map(Number);
  const cand = variables.filter(
    ({ v }) =>
      v.name === ancien &&
      v.identifiers.some((id) => id.loc.start.line === l && (c == null || id.loc.start.column === c)),
  );
  if (cand.length !== 1) {
    erreurs.push(`${ligne} : ${cand.length} liaison(s) trouvée(s)`);
    continue;
  }
  const { v, s } = cand[0];
  if (vus.has(v)) {
    erreurs.push(`${ligne} : déjà renommée`);
    continue;
  }
  vus.add(v);
  // conflit : le nouveau nom est-il déjà visible depuis une référence, ou déclaré dans la même portée ?
  if (s.variables.some((w) => w !== v && w.name === nouveau))
    erreurs.push(`${ligne} : « ${nouveau} » existe déjà dans la même portée`);
  const ids = new Set([...v.identifiers, ...v.references.map((r) => r.identifier)]);
  for (const r of v.references) {
    for (let p = r.from; p; p = p.upper) {
      const w = p.set.get(nouveau);
      if (w && w !== v) {
        erreurs.push(`${ligne} : « ${nouveau} » capturerait ${w.name} (ligne ${r.identifier.loc.start.line})`);
        break;
      }
      if (p === s) break;
    }
  }
  // et à l'inverse : une référence existante à « nouveau » passerait-elle sous cette liaison ?
  for (const sc of sm.scopes)
    for (const r of sc.references) {
      if (r.identifier.name !== nouveau) continue;
      let dans = false;
      for (let p = sc; p; p = p.upper)
        if (p === s) {
          dans = true;
          break;
        }
      if (
        dans &&
        (!r.resolved || r.resolved.scope !== s) &&
        !(
          r.resolved &&
          (() => {
            for (let p = sc; p && p !== s; p = p.upper) if (p.set.get(nouveau) === r.resolved) return true;
            return false;
          })()
        )
      )
        erreurs.push(`${ligne} : la référence à « ${nouveau} » ligne ${r.identifier.loc.start.line} serait capturée`);
    }
  for (const id of ids) {
    const p = parents.get(id);
    let abrege =
      p &&
      p.type === "Property" &&
      p.shorthand &&
      (p.value === id || (p.value.type === "AssignmentPattern" && p.value.left === id));
    if (p && p.type === "AssignmentPattern") {
      const pp = parents.get(p);
      if (pp && pp.type === "Property" && pp.shorthand && pp.value === p) abrege = true;
    }
    remplacements.push({ debut: id.range[0], fin: id.range[1], texte: abrege ? `${ancien}: ${nouveau}` : nouveau });
  }
}
if (erreurs.length) {
  console.error(erreurs.join("\n"));
  process.exit(1);
}
remplacements.sort((a, b) => b.debut - a.debut);
const uniques = remplacements.filter((r, i, t) => i === 0 || r.debut !== t[i - 1].debut);
let out = src;
for (const r of uniques) out = out.slice(0, r.debut) + r.texte + out.slice(r.fin);
fs.writeFileSync(fichier, out);
console.log(`${vus.size} liaisons renommées, ${uniques.length} occurrences`);
