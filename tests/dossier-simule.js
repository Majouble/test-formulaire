// Dossier partagé simulé pour les essais du kit de secours : mêmes méthodes que le dossier choisi dans Edge
// (showDirectoryPicker) — fichiers, sous-dossiers, suppression —, lus et écrits sur disque (texte ou binaire). Usage :
//   await installer(page, dossier); … await page.evaluate(() => window.__KIT__.connecter(window.__dossierSimule("partage")));
const fs = require("fs"), path = require("path");
async function installer(page, dossier) {
  const chemin = (sous, n) => { const p = path.join(dossier, sous || "", n || ""); if (!p.startsWith(dossier)) throw new Error("chemin hors du dossier"); return p; };
  await page.exposeFunction("nodeListe", sous => { const p = chemin(sous); return fs.existsSync(p) ? fs.readdirSync(p, { withFileTypes: true }).map(e => ({ n: e.name, d: e.isDirectory() })) : []; });
  await page.exposeFunction("nodeLire", (sous, n) => { const p = chemin(sous, n); return fs.existsSync(p) && fs.statSync(p).isFile() ? { b64: fs.readFileSync(p).toString("base64"), mod: Math.floor(fs.statSync(p).mtimeMs) } : null; });
  await page.exposeFunction("nodeEcrire", (sous, n, b64) => { fs.mkdirSync(chemin(sous), { recursive: true }); fs.writeFileSync(chemin(sous, n), Buffer.from(b64, "base64")); return true; });
  await page.exposeFunction("nodeDossier", (sous, n, creer) => { const p = chemin(sous, n); if (fs.existsSync(p)) return fs.statSync(p).isDirectory(); if (creer) { fs.mkdirSync(p, { recursive: true }); return true; } return false; });
  await page.exposeFunction("nodeSupprimer", (sous, n) => { const p = chemin(sous, n); if (!fs.existsSync(p)) return false; fs.rmSync(p, { recursive: true }); return true; });
  await page.addInitScript(() => {
    const b64 = async blob => { const o = new Uint8Array(await blob.arrayBuffer()); let s = ""; for (let i = 0; i < o.length; i += 32768) s += String.fromCharCode.apply(null, o.subarray(i, i + 32768)); return btoa(s); };
    const absent = () => new DOMException("absent", "NotFoundError");
    const fichier = (sous, n) => ({ kind: "file", name: n,
      async getFile() { const r = await window.nodeLire(sous, n); if (!r) throw absent(); return new File([Uint8Array.from(atob(r.b64), c => c.charCodeAt(0))], n, { lastModified: r.mod }); },
      async createWritable() { const parts = []; return { async write(x) { parts.push(x); }, async close() { await window.nodeEcrire(sous, n, await b64(new Blob(parts))); } }; } });
    const dossier = (sous, nom) => ({ kind: "directory", name: nom, async queryPermission() { return "granted"; }, async requestPermission() { return "granted"; },
      async *entries() { for (const e of await window.nodeListe(sous)) yield [e.n, e.d ? dossier(sous ? `${sous}/${e.n}` : e.n, e.n) : fichier(sous, e.n)]; },
      async getFileHandle(n, o) { if (!(o && o.create) && !(await window.nodeLire(sous, n))) throw absent(); return fichier(sous, n); },
      async getDirectoryHandle(n, o) { if (!(await window.nodeDossier(sous, n, !!(o && o.create)))) throw absent(); return dossier(sous ? `${sous}/${n}` : n, n); },
      async removeEntry(n) { if (!(await window.nodeSupprimer(sous, n))) throw absent(); } });
    window.__dossierSimule = nom => dossier("", nom);
  });
}
module.exports = { installer };
