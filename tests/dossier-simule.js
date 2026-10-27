// Dossier partagé simulé pour les essais du kit de secours : mêmes méthodes que le dossier choisi dans Edge
// (showDirectoryPicker), fichiers lus et écrits sur disque (texte ou binaire). Usage :
//   await installer(page, dossier); … await page.evaluate(() => window.__KIT__.connecter(window.__dossierSimule("partage")));
const fs = require("fs"), path = require("path");
async function installer(page, dossier) {
  await page.exposeFunction("nodeListe", () => fs.readdirSync(dossier));
  await page.exposeFunction("nodeLire", n => { const p = path.join(dossier, n); return fs.existsSync(p) ? { b64: fs.readFileSync(p).toString("base64"), mod: Math.floor(fs.statSync(p).mtimeMs) } : null; });
  await page.exposeFunction("nodeEcrire", (n, b64) => { fs.writeFileSync(path.join(dossier, n), Buffer.from(b64, "base64")); return true; });
  await page.addInitScript(() => {
    const b64 = async blob => { const o = new Uint8Array(await blob.arrayBuffer()); let s = ""; for (let i = 0; i < o.length; i += 32768) s += String.fromCharCode.apply(null, o.subarray(i, i + 32768)); return btoa(s); };
    const fichier = n => ({ kind: "file", name: n,
      async getFile() { const r = await window.nodeLire(n); if (!r) throw new DOMException("absent", "NotFoundError"); return new File([Uint8Array.from(atob(r.b64), c => c.charCodeAt(0))], n, { lastModified: r.mod }); },
      async createWritable() { const parts = []; return { async write(x) { parts.push(x); }, async close() { await window.nodeEcrire(n, await b64(new Blob(parts))); } }; } });
    window.__dossierSimule = nom => ({ kind: "directory", name: nom, async queryPermission() { return "granted"; }, async requestPermission() { return "granted"; },
      async *entries() { for (const f of await window.nodeListe()) yield [f, fichier(f)]; },
      async getFileHandle(n, o) { if (!(o && o.create) && !(await window.nodeLire(n))) throw new DOMException("absent", "NotFoundError"); return fichier(n); } });
  });
}
module.exports = { installer };
