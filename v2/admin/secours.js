/* =====================================================================
   Administration v2 — onglet « Installation », carte « Mode secours »
   ---------------------------------------------------------------------
   - Télécharger le kit de secours (secours/kit-secours.html, publié à côté de l'administration) : fichier à
     enregistrer sur les postes ou dans le dossier partagé ; sa version est comparée à celle du socle.
   - Télécharger le relais n8n (secours/relais-n8n.json) préréglé pour ce document : adresse de l'API et
     identifiant du document, clé du kit tirée au hasard (affichée une fois, jamais enregistrée dans le document,
     que des liens d'établissement peuvent lire), chemin du webhook propre au document. Reste à saisir dans n8n
     la clé d'API Grist.
   - Créer la page « Réintégration du mode secours » (widget reintegration/, accès complet).
   ===================================================================== */
(function () {
  "use strict";
  const S = window.Socle;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const statut = (t, type) => { const e = $("sec-statut"); if (e) { e.textContent = t || ""; e.className = `statut ${type || ""}`; } };
  const adresse = chemin => { try { return new URL(chemin, location.href).href; } catch (_) { return chemin; } };
  const URL_REINT = /\/reintegration\/?(index\.html)?(\?.*)?$/i;
  let pagesReint = [];

  function telecharger(nom, contenu, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(contenu instanceof Blob ? contenu : new Blob([contenu], { type })); a.download = nom;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }
  async function lire(chemin) {
    const r = await fetch(adresse(chemin), { cache: "no-store" });
    if (!r.ok) throw new Error(`${chemin} introuvable (HTTP ${r.status}) : le kit n'est peut-être pas encore publié à cette adresse`);
    return r.text();
  }
  // « Kit de secours 2.32.0 (27/10/2026), construit le 27/10/2026 15:40:00 par … »
  const infosKit = html => { const m = html.match(/<!-- Kit de secours (.+?), construit le (.+?) par /); return m ? { version: m[1], construit: m[2] } : null; };
  const numero = v => String(v || "").split(" ")[0];

  async function telechargerKit() {
    statut("Téléchargement du kit…");
    try {
      const html = await lire("../secours/kit-secours.html"), k = infosKit(html);
      if (!k) throw new Error("le fichier reçu n'est pas le kit de secours");
      const nom = `kit-secours-${numero(k.version)}.html`;
      telecharger(nom, html, "text/html;charset=utf-8");
      const ecart = numero(k.version) !== numero(S.VERSION);
      statut(`« ${nom} » téléchargé (${(html.length / 1048576).toFixed(1)} Mo, construit le ${k.construit}).${ecart ? ` Attention : le kit est en version ${numero(k.version)}, l'administration en ${numero(S.VERSION)} — il sera à jour à la prochaine publication.` : ""}`, ecart ? "err" : "ok");
    } catch (e) { statut(`Téléchargement impossible : ${e.message || e}`, "err"); }
  }

  function cleAleatoire() {
    const a = new Uint8Array(24); crypto.getRandomValues(a);
    return Array.from(a, x => "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"[x % 56]).join("");
  }
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16); }));
  async function telechargerRelais() {
    statut("Préparation du relais…");
    try {
      const w = JSON.parse(await lire("../secours/relais-n8n.json"));
      let api = "", doc = "";
      try { const j = await grist.docApi.getAccessToken({ readOnly: true }); const m = String(j.baseUrl || "").match(/^(.*\/api)\/docs\/([^/?#]+)/); if (m) { api = m[1]; doc = m[2]; } } catch (_) {}
      if (!doc) throw new Error("adresse du document indisponible (accès complet nécessaire)");
      const config = await S.lireConfig(), g = S.general(config), cle = cleAleatoire();
      const chemin = `secours-${doc.slice(0, 8).toLowerCase()}`;
      const noeud = w.nodes.find(n => n.name === "Lecture de Grist"), webhook = w.nodes.find(n => n.type === "n8n-nodes-base.webhook");
      if (!noeud || !webhook) throw new Error("workflow inattendu");
      let js = noeud.parameters.jsCode;
      const regler = (nom, val) => { const re = new RegExp(`const ${nom} = '[^']*';`); if (!re.test(js)) throw new Error(`réglage ${nom} introuvable`); js = js.replace(re, `const ${nom} = '${val.replace(/'/g, "\\'")}';`); };
      regler("CLE_KIT", cle); regler("API_GRIST", api); regler("DOC", doc);
      noeud.parameters.jsCode = js;
      webhook.parameters.path = chemin; webhook.webhookId = uuid();
      w.name = `Relais du mode secours — ${g.situation || doc}`;
      telecharger(`relais-secours-${doc.slice(0, 8)}.json`, JSON.stringify(w, null, 2), "application/json");
      $("sec-relais").hidden = false;
      $("sec-relais").innerHTML = `<p><b>À noter maintenant</b> (la clé n'est enregistrée nulle part dans le document) :</p>
        <ul><li>Adresse du relais, à saisir dans les réglages du kit : <code>https://&lt;votre n8n&gt;/webhook/${esc(chemin)}</code></li>
        <li>Clé du relais : <code id="sec-cle">${esc(cle)}</code> <button class="secondaire" id="sec-copier">Copier</button></li></ul>
        <p class="aide">Dans n8n : importer le fichier, ouvrir le nœud « Lecture de Grist » et remplacer <code>cle-api-grist</code> par la clé d'API Grist d'un compte qui a accès à ce document, puis activer le workflow.
        Les exécutions réussies ne sont pas enregistrées (réglage du workflow). Un nouveau téléchargement tire une nouvelle clé.</p>`;
      $("sec-copier").addEventListener("click", async () => { try { await navigator.clipboard.writeText(cle); statut("Clé copiée.", "ok"); } catch (_) { const r = document.createRange(); r.selectNodeContents($("sec-cle")); getSelection().removeAllRanges(); getSelection().addRange(r); statut("Clé sélectionnée : Ctrl+C pour la copier."); } });
      statut("Relais téléchargé, préréglé pour ce document.", "ok");
    } catch (e) { statut(`Préparation du relais impossible : ${e.message || e}`, "err"); }
  }

  async function lirePagesReint() {
    try {
      const [sec, vues] = await Promise.all([grist.docApi.fetchTable("_grist_Views_section"), grist.docApi.fetchTable("_grist_Views")]);
      pagesReint = sec.id.map((id, i) => {
        if (sec.parentKey[i] !== "custom") return null;
        let cv = {}; try { const o = JSON.parse(sec.options[i] || "{}") || {}; cv = typeof o.customView === "string" ? JSON.parse(o.customView || "{}") : (o.customView || {}); } catch (_) { cv = {}; }
        if (!URL_REINT.test(cv.url || "")) return null;
        const v = vues.id.indexOf(sec.parentId[i]);
        return { section: id, nom: v >= 0 ? String(vues.name[v] || "") : "" };
      }).filter(Boolean);
    } catch (_) { pagesReint = []; }
  }
  async function creerPageReint() {
    const g = S.general(await S.lireConfig());
    const T = await grist.docApi.fetchTable("_grist_Tables"), ref = T.id[T.tableId.indexOf(g.reponses)];
    if (ref == null) throw new Error(`table ${g.reponses} introuvable`);
    const res = await grist.docApi.applyUserActions([["CreateViewSection", ref, 0, "custom", null, null]]);
    const rv = (res && res.retValues && res.retValues[0]) || {};
    if (!rv.sectionRef) throw new Error("Grist n'a pas indiqué la vue créée");
    const sec = await grist.docApi.fetchTable("_grist_Views_section"), i = sec.id.indexOf(rv.sectionRef);
    let op = {}; try { op = JSON.parse((i >= 0 && sec.options[i]) || "{}") || {}; } catch (_) { op = {}; }
    let url = adresse("../reintegration/"); if (!/^https?:/.test(url)) url = "https://majouble.github.io/test-formulaire/v2/reintegration/";
    op.customView = JSON.stringify({ mode: "url", url, access: "full", widgetOptions: {} });
    const nom = "Réintégration du mode secours";
    await grist.docApi.applyUserActions([["UpdateRecord", "_grist_Views_section", rv.sectionRef, { options: JSON.stringify(op), title: "" }],
      ...(rv.viewRef ? [["UpdateRecord", "_grist_Views", rv.viewRef, { name: nom }]] : [])]);
    await lirePagesReint();
    return nom;
  }
  function dessinerPage() {
    const z = $("sec-page"); if (!z) return;
    z.innerHTML = pagesReint.length ? `<span class="pastille ok">Page : ${pagesReint.map(p => `« ${esc(p.nom)} »`).join(", ")}</span>`
      : `<button class="secondaire" id="sec-creer-page" title="Page Grist avec le widget de réintégration (accès complet)">Créer la page de réintégration</button>`;
    if ($("sec-creer-page")) $("sec-creer-page").addEventListener("click", async () => {
      try { const nom = await creerPageReint(); dessinerPage(); statut(`Page « ${nom} » créée. À ranger parmi les pages réservées aux propriétaires (onglet Accès).`, "ok"); }
      catch (e) { statut(`Création de la page refusée par Grist : ${e.message || e}`, "err"); }
    });
  }

  function monter() {
    const z = $("carte-secours"); if (!z) return;
    z.innerHTML = `<h2>Mode secours</h2>
      <p class="aide">En cas de panne réseau, le kit de secours fait tourner le formulaire, le tableau de bord et le tableau des signalements sans Grist, sur une copie du document,
        à plusieurs postes reliés par un dossier partagé. Les saisies sont ensuite réintégrées dans Grist. Pendant que Grist est accessible, un poste en mode veille tient les copies à jour grâce au relais n8n.</p>
      <ol class="aide">
        <li>Télécharger le kit et l'enregistrer dans le dossier partagé de la cellule (et, si possible, sur chaque poste). Le retélécharger après chaque mise à jour du socle.</li>
        <li>Facultatif : télécharger le relais n8n, l'importer dans n8n, puis régler le relais dans le kit du poste de veille (Réglages › Relais n8n).</li>
        <li>Après une panne : exporter les saisies depuis un kit, puis les réintégrer depuis la page de réintégration.</li>
      </ol>
      <div class="boutons">
        <button class="primaire" id="sec-kit">Télécharger le kit de secours</button>
        <button class="secondaire" id="sec-n8n">Télécharger le relais n8n</button>
        <span id="sec-page"></span>
      </div>
      <span class="statut" id="sec-statut" role="status"></span>
      <div id="sec-relais" hidden style="margin-top:8px"></div>`;
    $("sec-kit").addEventListener("click", telechargerKit);
    $("sec-n8n").addEventListener("click", telechargerRelais);
    lirePagesReint().then(dessinerPage);
  }
  monter();
  window.CarteSecours = { telechargerKit, telechargerRelais, creerPageReint };
})();
