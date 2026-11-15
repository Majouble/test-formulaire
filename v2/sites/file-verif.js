/* =====================================================================
   Widget « Référentiel des sites » — onglet « File de vérification »
   ---------------------------------------------------------------------
   Traite la table des vérifications du référentiel (classeur File_de_verification.xlsx, onglet « Import – vérifications »,
   importé dans une table « Verifications ») : un point = un regard humain sur un établissement, un site, un campus…
   - table reconnue à ses colonnes (Vérif ID, Objet ID, Statut ; Décision, Valeur retenue, Commentaire, Action…) ;
   - filtres : priorité, famille, type, traitement suggéré, académie (lue sur l'établissement concerné), état
     (à traiter, reportés, traités), mode d'application, texte ; compteur des points à traiter sur l'onglet ;
   - « Ouvrir » : l'établissement ou le site dans la vue « Établissements et sites » (carte, fiche), avec un bandeau
     pour décider sans revenir à la liste ;
   - décisions : Accepter / Refuser / Modifier (valeur retenue saisie) / Reporter ; Statut « Traité » (sauf Reporter) écrit
     si la colonne n'est pas une formule ; « Vérifié par » (user.Name) et la date sont des formules de déclenchement
     sur la décision, posées par le widget à la première décision ;
   - colonne « Action » (JSON, fabriquée avec la file) : ce qui est appliqué au référentiel quand on accepte :
       composante    { id, parent }            Niveau = Composante interne, Établissement de rattachement = parent
       rattachement  { id, parent }            Établissement de rattachement
       retirer       { id, par, resultat }     État « Retiré : …, remplacé par … », Remplacé par, références reportées
                                               (signalements, sites, Membre de, composantes…) sur la ligne qui la remplace
       siege         { id, site?, suggestion } Siège (site choisi dans le bandeau si l'action n'en désigne pas)
       position      { objet, id, lat?, lon? } Latitude / Longitude (clic sur la carte si l'action n'en donne pas)
       maj           { objet, id, champ, valeur } un champ ; la valeur retenue, si elle est saisie, l'emporte
       uai           { id, uai }               UAI ajouté à la liste de l'établissement
       confirmer     { id }                    rien à écrire (le référentiel porte déjà la proposition)
     Sans action (création de composante, campus, nommage…) : « Fait à la main » enregistre seulement la décision.
   - « Accepter la sélection » : points applicables sans saisie, cochés sur la page, avec un aperçu avant écriture.
   API : FileVerif.monter(hote) ; FileVerif.recharger() ; hote = { zone, badge, S, ctx(), sites(), relire(), ouvrirEtab(id),
         ouvrirSite(id), bandeau() → élément, placer(rappel), versFile(), dire(texte, classe) }.
   ===================================================================== */
(function () {
  "use strict";
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const cle = s => norm(s).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const refId = v => typeof v === "number" ? v : (v && typeof v === "object" && "rowId" in v) ? v.rowId : (Array.isArray(v) && v[0] === "R") ? v[2] : null;
  const nf = n => Number(n).toLocaleString("fr-FR");
  const COLS = { vid: /^verif_?id$/, priorite: /^priorite$/, famille: /^famille$/, type: /^type$/, objet: /^objet$/, objetId: /^objet_?id$/,
    libelle: /^libelle$/, etab: /^etablissement$/, commune: /^commune$/, proposition: /^proposition$/, effet: /^effet/, preuve: /^preuve$/,
    source: /^source$/, traitement: /^traitement/, sensible: /^sensible$/, statut: /^statut$/, decision: /^decision$/,
    valeur: /^valeur_?retenue$/, commentaire: /^commentaire$/, par: /^verifie_?par$/, date: /^date$/, action: /^action$/ };
  const OPS = { composante: "composante interne", rattachement: "rattachement", retirer: "ligne retirée", siege: "siège", position: "position",
    maj: "champ mis à jour", uai: "UAI ajouté", confirmer: "confirmation" };
  const PAGE = 40, CLE_FILTRES = "socle-v2-sites-fv";
  const FILTRES0 = { priorite: "", famille: "", type: "", traitement: "", acad: "", etat: "a_traiter", mode: "", q: "" };

  let H = null, fv = null, page = 0, enCours = false, chargement = null;
  const coches = new Set();
  let filtres = (() => { try { return { ...FILTRES0, ...JSON.parse(localStorage.getItem(CLE_FILTRES) || "{}") }; } catch (_) { return { ...FILTRES0 }; } })();
  const garderFiltres = () => { try { localStorage.setItem(CLE_FILTRES, JSON.stringify(filtres)); } catch (_) { /* stockage indisponible */ } };

  /* ---------- lecture ---------- */
  const colsDe = tm => {
    const out = {}, cs = Object.values(tm.colonnes);
    for (const [k, re] of Object.entries(COLS)) { const c = cs.find(x => re.test(cle(x.colId))) || cs.find(x => re.test(cle(x.label))); out[k] = c ? c.colId : null; }
    return out;
  };
  function trouverTable(meta) {
    const l = Object.keys(meta).filter(t => !t.startsWith("_grist")).map(t => ({ t, c: colsDe(meta[t]) })).filter(x => x.c.vid && x.c.objetId && x.c.statut);
    return l.sort((a, b) => Number(/verif/i.test(b.t)) - Number(/verif/i.test(a.t)))[0] || null;
  }
  const colCode = (t, re) => {
    const l = Object.keys(t).filter(k => k !== "id" && Array.isArray(t[k])).map(k => [k, t[k].filter(x => typeof x === "string" && re.test(x.trim())).length]).filter(x => x[1] > 0);
    return l.length ? l.sort((a, b) => b[1] - a[1])[0][0] : null;
  };
  async function index(ctx, meta) {
    const te = await grist.docApi.fetchTable(ctx.tEtab), I = { etab: new Map(), codeEtab: new Map(), nomE: new Map(), acadE: new Map(), site: new Map(), codeSite: new Map() };
    const kE = colCode(te, /^ETAB-[A-Z]{0,2}\d+$/);
    if (kE) te.id.forEach((rid, i) => { const k = String(te[kE][i] ?? "").trim(); if (k) { if (!I.etab.has(k)) I.etab.set(k, rid); I.codeEtab.set(rid, k); } });
    if (ctx.ce.nom && te[ctx.ce.nom]) te.id.forEach((rid, i) => I.nomE.set(rid, String(te[ctx.ce.nom][i] ?? "")));
    const ca = ctx.ce.academie;
    if (ca && te[ca]) {
      let lib = x => x == null ? "" : String(x);
      const cible = H.S.cibleRef((meta[ctx.tEtab].colonnes[ca] || {}).type);
      if (cible && meta[cible]) {
        const ta = await grist.docApi.fetchTable(cible), cn = Object.keys(ta).find(k => /^(nom|libelle|academie|intitule)/i.test(k)) || Object.keys(ta).find(k => k !== "id");
        const m = new Map(ta.id.map((r, i) => [r, String((ta[cn] || [])[i] ?? "")])); lib = x => m.get(refId(x)) || "";
      }
      te.id.forEach((rid, i) => I.acadE.set(rid, lib(te[ca][i])));
    }
    if (ctx.tSites && ctx.cols && ctx.cols.id) {
      const ts = await grist.docApi.fetchTable(ctx.tSites);
      ts.id.forEach((rid, i) => { const k = String((ts[ctx.cols.id] || [])[i] ?? "").trim(); if (k) { if (!I.site.has(k)) I.site.set(k, rid); I.codeSite.set(rid, k); } });
    }
    return I;
  }
  async function charger() {
    const ctx = H.ctx(); if (!ctx) return;
    const meta = await H.S.lireMeta(), tv = trouverTable(meta);
    if (!tv) { fv = { absente: true }; return; }
    const d = await grist.docApi.fetchTable(tv.t), c = tv.c;
    const v = (k, i) => c[k] && d[c[k]] ? d[c[k]][i] : null, txt = (k, i) => { const x = v(k, i); return x == null ? "" : String(x).trim(); };
    const lignes = d.id.map((rid, i) => {
      let action = null, erreur = null; const a = txt("action", i);
      if (a) { try { action = JSON.parse(a); if (!action || !OPS[action.op]) { action = null; erreur = "Action inconnue"; } } catch (_) { erreur = "Action illisible"; } }
      return { rid, vid: txt("vid", i), priorite: txt("priorite", i), famille: txt("famille", i), type: txt("type", i), objet: txt("objet", i), objetId: txt("objetId", i),
        libelle: txt("libelle", i), etab: txt("etab", i), commune: txt("commune", i), proposition: txt("proposition", i), effet: txt("effet", i), preuve: txt("preuve", i),
        source: txt("source", i), traitement: txt("traitement", i), sensible: v("sensible", i), statut: txt("statut", i), decision: txt("decision", i),
        valeur: txt("valeur", i), commentaire: txt("commentaire", i), par: txt("par", i), date: v("date", i), action, erreur };
    });
    const I = await index(ctx, meta), siteE = new Map(H.sites().map(s => [s.id, s.etab]));
    lignes.forEach(l => {
      const r = /^ETAB-/.test(l.objetId) ? I.etab.get(l.objetId) : /^SITE-/.test(l.objetId) ? siteE.get(I.site.get(l.objetId)) : null;
      l.acad = r != null ? I.acadE.get(r) || "" : "";
    });
    const tm = meta[tv.t], formule = k => !!(c[k] && tm.colonnes[c[k]] && (tm.colonnes[c[k]].isFormula || tm.colonnes[c[k]].formula));
    fv = { table: tv.t, cols: c, meta, lignes, idx: I, statutEcrit: !!c.statut && !formule("statut") };
  }

  /* ---------- état, mode, filtres ---------- */
  const etatDe = l => /^trait/.test(norm(l.statut)) ? "traites" : l.decision === "Reporter" ? "reportes" : "a_traiter";
  function modeDe(l) {
    const a = l.action; if (!a) return "main";
    if (a.op === "siege" && !a.site) return "saisie";
    if (a.op === "position" && (a.lat == null || a.lon == null)) return "saisie";
    if (a.op === "maj" && a.valeur == null && !l.valeur) return "saisie";
    return "auto";
  }
  const aTraiter = () => fv && fv.lignes ? fv.lignes.filter(l => etatDe(l) === "a_traiter").length : 0;
  function filtrer() {
    const q = norm(filtres.q).split(/\s+/).filter(Boolean);
    return fv.lignes.filter(l => (filtres.etat === "tous" || etatDe(l) === filtres.etat)
      && (!filtres.priorite || l.priorite === filtres.priorite) && (!filtres.famille || l.famille === filtres.famille) && (!filtres.type || l.type === filtres.type)
      && (!filtres.traitement || l.traitement === filtres.traitement) && (!filtres.acad || l.acad === filtres.acad) && (!filtres.mode || modeDe(l) === filtres.mode)
      && (!q.length || q.every(m => norm([l.vid, l.objetId, l.libelle, l.etab, l.commune, l.proposition, l.preuve].join(" ")).includes(m))))
      .sort((a, b) => a.priorite.localeCompare(b.priorite, "fr") || a.famille.localeCompare(b.famille, "fr") || a.type.localeCompare(b.type, "fr") || a.rid - b.rid);
  }
  const options = (k, base) => {
    const n = new Map(); base.forEach(l => { const v = l[k]; if (v) n.set(v, (n.get(v) || 0) + 1); });
    return [...n].sort((a, b) => a[0].localeCompare(b[0], "fr"));
  };

  /* ---------- affichage ---------- */
  // message dans la liste, et dans la vue « Établissements et sites » quand on y décide (bandeau)
  const dire = (t, cl) => { const p = document.getElementById("fv-msg"); if (p) { p.textContent = t; p.className = `statut ${cl || ""}`; } if (!p || H.zone.hidden) H.dire(t, cl); };
  function badge() { if (H.badge) H.badge.textContent = fv && fv.lignes ? (aTraiter() ? nf(aTraiter()) : "") : ""; }
  function selectHtml(k, libelle, opts, tous) {
    return `<label>${esc(libelle)} <select data-fvf="${k}"><option value="">${esc(tous || "Tous")}</option>${opts.map(([v, n]) => `<option value="${esc(v)}"${filtres[k] === v ? " selected" : ""}>${esc(v)}${n != null ? ` (${nf(n)})` : ""}</option>`).join("")}</select></label>`;
  }
  function champValeur(l) {
    const a = l.action;
    if (a && a.op !== "maj") return "";   // l'action dit tout : pas de valeur à saisir
    if (!a) return `<input type="text" data-fvl="valeur" value="${esc(l.valeur)}" placeholder="Valeur retenue (si Modifier)" aria-label="Valeur retenue ${esc(l.vid)}">`;
    const c = colChamp(a.objet === "site" ? H.ctx().tSites : H.ctx().tEtab, a.champ), ch = c && /^Choice/.test(c.type) ? choixDe(c) : null;
    const prop = a.valeur == null ? "" : typeof a.valeur === "boolean" ? (a.valeur ? "oui" : "non") : String(a.valeur), val = l.valeur || (ch ? prop : "");
    if (ch && ch.length) return `<select data-fvl="valeur" aria-label="${esc(a.champ)} retenu"><option value="">${esc(a.champ)} : choisir…</option>${[...new Set([...ch, ...(val ? [val] : [])])].map(x => `<option${x === val ? " selected" : ""}>${esc(x)}</option>`).join("")}</select>`;
    return `<input type="text" data-fvl="valeur" value="${esc(val)}" placeholder="${esc(a.champ)}${prop ? ` : ${esc(prop)} (proposé)` : " : à saisir"}" aria-label="${esc(a.champ)} retenu">`;
  }
  function boutons(l, dansBandeau) {
    const m = modeDe(l), a = l.action, ouvrable = /^(ETAB|SITE)-/.test(l.objetId) || /ETAB-[A-Z]{0,2}\d+/.test(l.proposition);
    const b = [];
    if (!dansBandeau && ouvrable) b.push(`<button type="button" class="lien" data-fv="ouvrir">Ouvrir</button>`);
    if (m === "auto" || (m === "saisie" && a.op === "maj")) b.push(`<button type="button" data-fv="accepter" title="Écrit dans le référentiel : ${esc(l.effet || OPS[a.op])}">Accepter et appliquer</button>`);
    else if (m === "saisie" && !dansBandeau) b.push(`<button type="button" data-fv="ouvrir" title="Choisir sur la carte ou dans la liste des sites">Ouvrir pour appliquer</button>`);
    else if (m === "main") b.push(`<button type="button" data-fv="fait" title="Enregistre seulement la décision : la modification se fait à la main">Fait à la main</button>`);
    b.push(`<button type="button" data-fv="refuser">Refuser</button>`, `<button type="button" data-fv="reporter">Reporter</button>`);
    return b.join("");
  }
  function itemHtml(l) {
    const m = modeDe(l), et = etatDe(l), g = /^1/.test(l.priorite) ? "haute" : /^2/.test(l.priorite) ? "moyenne" : "basse";
    return `<li class="qa-item fv-item${et === "traites" ? " traite" : ""}" data-rid="${l.rid}">
      <div class="fv-tete">${m === "auto" && et !== "traites" ? `<input type="checkbox" class="fv-coche" aria-label="Sélectionner ${esc(l.vid)}"${coches.has(l.rid) ? " checked" : ""}>` : ""}
        <span class="qa-g ${g}" title="${esc(l.priorite)}">${esc(l.priorite.split(/\s/)[0] || "?")}</span><strong>${esc(l.type)}</strong>
        <span class="meta">${esc(l.vid)} · ${esc(l.objetId)}${l.libelle ? ` – ${esc(l.libelle)}` : ""}${l.etab && l.etab !== l.libelle ? ` · ${esc(l.etab)}` : ""}${l.commune ? ` · ${esc(l.commune)}` : ""}${l.acad ? ` · ${esc(l.acad)}` : ""}</span>
        ${l.sensible ? `<span class="pastille warn">sensible</span>` : ""}${m === "main" ? `<span class="pastille">à la main</span>` : m === "saisie" ? `<span class="pastille reco">choix à faire</span>` : ""}</div>
      <div>${esc(l.proposition)}</div>
      <div class="meta">${l.effet ? `Effet : ${esc(l.effet)}` : ""}${l.preuve ? ` · ${esc(l.preuve)}` : ""}${l.source ? ` · ${esc(l.source)}` : ""}${l.erreur ? ` · <span class="qe-danger">${esc(l.erreur)}</span>` : ""}</div>
      ${et === "traites" ? `<div class="meta">Décision : <strong>${esc(l.decision || "—")}</strong>${l.valeur ? ` (${esc(l.valeur)})` : ""}${l.par ? ` · ${esc(l.par)}` : ""}${l.commentaire ? ` · ${esc(l.commentaire)}` : ""}</div>`
        : `<div class="outils fv-actions">${champValeur(l)}<input type="text" data-fvl="commentaire" value="${esc(l.commentaire)}" placeholder="Commentaire" aria-label="Commentaire ${esc(l.vid)}">${boutons(l, false)}</div>`}
    </li>`;
  }
  function dessiner() {
    const z = H.zone; if (!z) return;
    if (!fv) { z.innerHTML = `<p class="aide">Chargement de la file de vérification…</p>`; return; }
    if (fv.erreur) { z.innerHTML = `<p class="statut err">${esc(fv.erreur)}</p>`; return; }
    if (fv.absente) {
      z.innerHTML = `<p class="aide">Aucune table de vérification dans ce document. Importez l'onglet « Import – vérifications » du classeur <em>File_de_verification.xlsx</em>
        dans une table « Verifications » (colonnes Vérif ID, Objet ID, Statut, Décision, Valeur retenue, Commentaire, Action…), puis rouvrez cet onglet.</p>`;
      badge(); return;
    }
    const base = fv.lignes.filter(l => filtres.etat === "tous" || etatDe(l) === filtres.etat), l = filtrer(), nbPages = Math.max(1, Math.ceil(l.length / PAGE));
    page = Math.min(page, nbPages - 1);
    const vue = l.slice(page * PAGE, page * PAGE + PAGE), auto = vue.filter(x => modeDe(x) === "auto" && etatDe(x) !== "traites");
    for (const r of [...coches]) if (!l.some(x => x.rid === r)) coches.delete(r);
    const parEtat = { a_traiter: 0, reportes: 0, traites: 0 }; fv.lignes.forEach(x => parEtat[etatDe(x)]++);
    z.innerHTML = `<p class="aide">Points de la table <strong>${esc(fv.table)}</strong> : ${nf(parEtat.a_traiter)} à traiter, ${nf(parEtat.reportes)} reporté(s), ${nf(parEtat.traites)} traité(s).
        « Accepter et appliquer » écrit la proposition dans le référentiel ; « Ouvrir » montre l'établissement ou le site sur la carte.</p>
      <div class="sites-outils fv-filtres">
        <label>État <select data-fvf="etat">${[["a_traiter", "À traiter"], ["reportes", "Reportés"], ["traites", "Traités"], ["tous", "Tous"]].map(([v, t]) => `<option value="${v}"${filtres.etat === v ? " selected" : ""}>${t}</option>`).join("")}</select></label>
        ${selectHtml("priorite", "Priorité", options("priorite", base), "Toutes")}
        ${selectHtml("famille", "Famille", options("famille", base), "Toutes")}
        ${selectHtml("type", "Type", options("type", base.filter(x => !filtres.famille || x.famille === filtres.famille)))}
        ${selectHtml("traitement", "Traitement suggéré", options("traitement", base))}
        ${selectHtml("acad", "Académie", options("acad", base), "Toutes")}
        <label>Application <select data-fvf="mode">${[["", "Toutes"], ["auto", "Applicable d'un clic"], ["saisie", "Choix à faire"], ["main", "À la main"]].map(([v, t]) => `<option value="${v}"${filtres.mode === v ? " selected" : ""}>${t}</option>`).join("")}</select></label>
        <label>Texte <input type="search" data-fvf="q" value="${esc(filtres.q)}" placeholder="nom, identifiant, commune…"></label>
        <button type="button" class="lien" data-fv-global="raz">Effacer les filtres</button>
      </div>
      <p class="statut" id="fv-msg" role="status"></p>
      <div class="boutons fv-lot"><strong>${nf(l.length)} point(s)</strong>
        ${auto.length ? `<label><input type="checkbox" data-fv-global="tout"${auto.every(x => coches.has(x.rid)) ? " checked" : ""}> cocher les ${auto.length} applicables de la page</label>` : ""}
        <button type="button" data-fv-global="lot"${coches.size ? "" : " disabled"}>Accepter la sélection (${coches.size})</button>
        <button type="button" class="lien" data-fv-global="recharger">Relire la table</button></div>
      ${vue.length ? `<ul class="qa-liste fv-liste">${vue.map(itemHtml).join("")}</ul>` : `<p class="vide">Aucun point pour ces filtres.</p>`}
      ${nbPages > 1 ? `<div class="boutons"><button type="button" data-fv-page="-1"${page ? "" : " disabled"}>← Précédents</button> page ${page + 1} / ${nbPages} <button type="button" data-fv-page="1"${page < nbPages - 1 ? "" : " disabled"}>Suivants →</button></div>` : ""}`;
    lier(z);
    badge();
  }
  function lier(z) {
    z.querySelectorAll("[data-fvf]").forEach(e => e.addEventListener(e.tagName === "INPUT" ? "change" : "change", () => {
      filtres[e.dataset.fvf] = e.value; if (e.dataset.fvf === "famille") filtres.type = ""; page = 0; garderFiltres(); dessiner();
    }));
    z.querySelectorAll("[data-fv-page]").forEach(b => b.addEventListener("click", () => { page += +b.dataset.fvPage; dessiner(); z.scrollIntoView({ block: "start" }); }));
    z.querySelectorAll("[data-fv-global]").forEach(b => b.addEventListener(b.type === "checkbox" ? "change" : "click", async () => {
      const k = b.dataset.fvGlobal;
      if (k === "raz") { filtres = { ...FILTRES0 }; garderFiltres(); page = 0; dessiner(); }
      if (k === "recharger") { await recharger(); }
      if (k === "tout") { z.querySelectorAll(".fv-item").forEach(li => { const c = li.querySelector(".fv-coche"); if (c) { if (b.checked) coches.add(+li.dataset.rid); else coches.delete(+li.dataset.rid); } }); dessiner(); }
      if (k === "lot") await accepterLot();
    }));
    z.querySelectorAll(".fv-item").forEach(li => {
      const l = fv.lignes.find(x => x.rid === +li.dataset.rid); if (!l) return;
      const c = li.querySelector(".fv-coche"); if (c) c.addEventListener("change", () => { if (c.checked) coches.add(l.rid); else coches.delete(l.rid); const b = z.querySelector("[data-fv-global=lot]"); if (b) { b.disabled = !coches.size; b.textContent = `Accepter la sélection (${coches.size})`; } });
      lierItem(li, l, false);
    });
  }
  // champs et boutons d'un point (liste ou bandeau)
  function lierItem(racine, l, dansBandeau) {
    racine.querySelectorAll("[data-fvl]").forEach(e => e.addEventListener("change", async () => {
      const k = e.dataset.fvl, v = e.value.trim(); if (v === l[k]) return;
      try { await ecrire([["UpdateRecord", fv.table, l.rid, { [fv.cols[k] || await colonneTexte(k)]: v }]]); l[k] = v; }
      catch (err) { dire(`Non enregistré : ${err.message || err}`, "err"); }
    }));
    racine.querySelectorAll("[data-fv]").forEach(b => b.addEventListener("click", async () => {
      const k = b.dataset.fv, vals = {};
      racine.querySelectorAll("[data-fvl]").forEach(e => { vals[e.dataset.fvl] = e.value.trim(); });
      Object.assign(l, vals);
      if (k === "ouvrir") { ouvrir(l); return; }
      if (k === "accepter") await appliquer([l], {}, dansBandeau);
      else await decider(l, k === "fait" ? "Accepter" : k === "refuser" ? "Refuser" : "Reporter", dansBandeau);
    }));
  }

  /* ---------- écritures dans la table des vérifications ---------- */
  const ecrire = async acts => { for (let k = 0; k < acts.length; k += 400) await grist.docApi.applyUserActions(acts.slice(k, k + 400)); };
  const choixDe = c => { try { return (JSON.parse(c.widgetOptions || "{}").choices || []).map(String); } catch (_) { return []; } };
  async function etendreChoix(table, colId, valeurs) {
    const c = (await H.S.lireMeta())[table].colonnes[colId]; if (!c || !/^Choice/.test(c.type)) return;
    const ch = choixDe(c), manque = valeurs.filter(v => v != null && v !== "" && !ch.includes(String(v)));
    if (!manque.length) return;
    let wo = {}; try { wo = JSON.parse(c.widgetOptions || "{}"); } catch (_) { /* options illisibles */ }
    wo.choices = [...ch, ...manque.map(String)];
    await grist.docApi.applyUserActions([["ModifyColumn", table, colId, { widgetOptions: JSON.stringify(wo) }]]);
  }
  async function colonneTexte(k) {
    const def = { decision: ["Decision", "Décision"], valeur: ["Valeur_retenue", "Valeur retenue"], commentaire: ["Commentaire", "Commentaire"] }[k];
    await grist.docApi.applyUserActions([["AddColumn", fv.table, def[0], { type: "Text", isFormula: false, label: def[1], untieColIdFromLabel: true }]]);
    fv.meta = await H.S.lireMeta(); fv.cols = colsDe(fv.meta[fv.table]); return fv.cols[k];
  }
  // première décision : colonnes de décision, « Vérifié par » et date en formules de déclenchement sur la décision
  async function preparer() {
    if (fv.pret) return;
    for (const k of ["decision", "valeur", "commentaire"]) if (!fv.cols[k]) await colonneTexte(k);
    const t = fv.table, tm = fv.meta[t], dep = ["L", tm.colonnes[fv.cols.decision].ref], acts = [];
    const declencheur = (k, id, label, type, formule) => {
      const c = fv.cols[k] && tm.colonnes[fv.cols[k]];
      if (!c) acts.push(["AddColumn", t, id, { type, isFormula: false, label, formula: formule, recalcWhen: 0, recalcDeps: dep, untieColIdFromLabel: true }]);
      else if (!c.isFormula && !c.formula && (k === "par" ? /^(Text|Any)/.test(c.type) : /^Date/.test(c.type))) acts.push(["ModifyColumn", t, c.colId, { formula: formule, recalcWhen: 0, recalcDeps: dep }]);
    };
    declencheur("par", "Verifie_par", "Vérifié par", "Text", "user.Name");
    const cd = fv.cols.date && tm.colonnes[fv.cols.date];
    declencheur("date", "Date", "Date", "Date", cd && /^DateTime/.test(cd.type) ? "NOW()" : "TODAY()");
    if (acts.length) await grist.docApi.applyUserActions(acts);
    if (fv.cols.decision) await etendreChoix(t, fv.cols.decision, ["Accepter", "Refuser", "Modifier", "Reporter"]);
    if (fv.statutEcrit) await etendreChoix(t, fv.cols.statut, ["À traiter", "Traité"]);
    fv.meta = await H.S.lireMeta(); fv.cols = colsDe(fv.meta[t]);
    const c2 = fv.cols.date && fv.meta[t].colonnes[fv.cols.date];
    fv.dateEcrite = !!(c2 && !c2.isFormula && !c2.formula);   // colonne Date en texte : date écrite par le widget
    fv.pret = true;
  }
  function champsDecision(l, decision) {
    const c = fv.cols, f = { [c.decision]: decision };
    if (fv.statutEcrit) f[c.statut] = decision === "Reporter" ? (etatDe(l) === "traites" || !l.statut ? "À traiter" : l.statut) : "Traité";
    if (fv.dateEcrite) f[c.date] = new Date().toISOString().slice(0, 10);
    if (l.valeur && c.valeur && decision !== "Refuser" && decision !== "Reporter") f[c.valeur] = l.valeur;
    if (c.commentaire) f[c.commentaire] = l.commentaire || "";
    return f;
  }
  async function decider(l, decision, dansBandeau) {
    if (enCours) return; enCours = true;
    try {
      await preparer();
      if (decision === "Accepter" && l.valeur && l.action == null) decision = "Modifier";
      await ecrire([["UpdateRecord", fv.table, l.rid, champsDecision(l, decision)]]);
      coches.delete(l.rid); await apresEcriture(`${l.vid} : ${decision === "Reporter" ? "reporté" : decision === "Refuser" ? "refusé" : "décision enregistrée"}.`, dansBandeau, "ok");
    } catch (err) { dire(`Décision non enregistrée : ${err.message || err}`, "err"); }
    enCours = false;
  }
  async function apresEcriture(msg, dansBandeau, cl) {
    await charger(); if (dansBandeau) { const b = H.bandeau(); if (b) b.innerHTML = ""; H.versFile(); }
    dessiner(); dire(msg, cl);
  }

  /* ---------- application au référentiel ---------- */
  function colChamp(table, champ) {
    const tm = fv.meta[table]; if (!tm) return null; const k = cle(champ);
    return Object.values(tm.colonnes).find(c => !c.isFormula && (cle(c.colId) === k || cle(c.label) === k)) || null;
  }
  const colRe = (table, re, type) => { const tm = fv.meta[table]; return tm ? (Object.values(tm.colonnes).find(c => !c.isFormula && re.test(c.colId) && (!type || c.type === type)) || {}).colId || null : null; };
  // colonnes nécessaires aux actions choisies, créées si besoin (État, Remplacé par, Siège, Niveau, rattachement, champ d'une mise à jour)
  async function assurerColonnes(lignes) {
    const ctx = H.ctx(), tE = ctx.tEtab, acts = [], ops = new Set(lignes.map(l => l.action.op)), aj = (t, id, label, type) => acts.push(["AddColumn", t, id, { type, isFormula: false, label, untieColIdFromLabel: true }]);
    if (ops.has("retirer") && !ctx.ce.etat) aj(tE, "Etat", "État", "Text");
    if (ops.has("retirer") && !colRe(tE, /^remplace_?par$/i, `Ref:${tE}`)) aj(tE, "Remplace_par", "Remplacé par", `Ref:${tE}`);
    if ((ops.has("composante") || ops.has("rattachement")) && !ctx.ce.ratt) aj(tE, "Rattachement", "Établissement de rattachement", `Ref:${tE}`);
    if (ops.has("composante") && !ctx.ce.niveau) aj(tE, "Niveau", "Niveau", "Choice");
    if (ops.has("siege") && ctx.tSites && !colRe(tE, /^siege$/i, `Ref:${ctx.tSites}`)) aj(tE, "Siege", "Siège", `Ref:${ctx.tSites}`);
    for (const l of lignes) {
      const a = l.action; if (a.op !== "maj") continue;
      const t = a.objet === "site" ? ctx.tSites : tE;
      if (t && !colChamp(t, a.champ) && !acts.some(x => x[1] === t && cle(x[3].label) === cle(a.champ))) aj(t, cle(a.champ).replace(/^./, x => x.toUpperCase()), a.champ, typeof a.valeur === "boolean" ? "Bool" : "Text");
    }
    if (acts.length) { await grist.docApi.applyUserActions(acts); await H.relire(); fv.meta = await H.S.lireMeta(); }
  }
  const convertir = (c, v) => {
    if (!c) return v;
    if (c.type === "Bool") return typeof v === "boolean" ? v : !/^(non|faux|false|0|)$/i.test(String(v).trim());
    if (/^(Numeric|Int)$/.test(c.type)) { const n = parseFloat(String(v).replace(",", ".")); return isNaN(n) ? v : n; }
    return typeof v === "boolean" ? (v ? "Oui" : "Non") : v;
  };
  // actions Grist pour une liste de points ; surcharge : { site, lat, lon } choisis dans le bandeau
  async function preparerActions(lignes, surcharge = {}) {
    const ctx = H.ctx(), I = fv.idx, ce = ctx.ce, cs = ctx.cols || {}, tE = ctx.tEtab, tS = ctx.tSites;
    const rE = code => { const r = I.etab.get(code); if (r == null) throw new Error(`${code} absent du référentiel des établissements`); return r; };
    const rS = code => { const r = I.site.get(code); if (r == null) throw new Error(`${code} absent du référentiel des sites`); return r; };
    const champsE = new Map(), champsS = new Map(), vers = new Map(), choix = [], ok = [], erreurs = [];
    const maj = (m, rid, f) => m.set(rid, Object.assign(m.get(rid) || {}, f));
    const cRemp = colRe(tE, /^remplace_?par$/i, `Ref:${tE}`), cSiege = tS ? colRe(tE, /^siege$/i, `Ref:${tS}`) : null;
    for (const l of lignes) {
      const a = { ...l.action, ...surcharge };
      try {
        if (a.op === "composante" || a.op === "rattachement") {
          const r = rE(a.id), p = rE(a.parent); if (r === p) throw new Error("rattachement à soi-même");
          const f = { [ce.ratt]: p }; if (a.op === "composante" && ce.niveau) { f[ce.niveau] = "Composante interne"; choix.push([tE, ce.niveau, "Composante interne"]); }
          maj(champsE, r, f);
        } else if (a.op === "retirer") {
          const r = rE(a.id), p = rE(a.par); if (r === p) throw new Error("remplacée par elle-même");
          const nom = I.nomE.get(p) || "", f = { [ce.etat]: `Retiré : ${a.resultat ? a.resultat + ", " : ""}remplacé par ${a.par}${nom ? ` (${nom})` : ""}` };
          if (cRemp) f[cRemp] = p; maj(champsE, r, f); vers.set(r, p);
        } else if (a.op === "siege") {
          if (!cSiege) throw new Error("référentiel des sites absent");
          const s = typeof a.site === "number" ? a.site : a.site ? rS(a.site) : null; if (s == null) throw new Error("choisissez le site du siège");
          maj(champsE, rE(a.id), { [cSiege]: s });
        } else if (a.op === "position") {
          const lat = +a.lat, lon = +a.lon; if (a.lat == null || a.lon == null || isNaN(lat) || isNaN(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error("coordonnées à choisir sur la carte");
          if (a.objet === "site") { if (!cs.lat || !cs.lon) throw new Error("colonnes Latitude / Longitude absentes du référentiel des sites");
            maj(champsS, rS(a.id), { [cs.lat]: +lat.toFixed(6), [cs.lon]: +lon.toFixed(6), ...(cs.precision ? { [cs.precision]: surcharge.lat != null ? "Placé sur la carte" : "Coordonnées proposées (file de vérification)" } : {}) }); }
          else { if (!ce.lat || !ce.lon) throw new Error("colonnes Latitude / Longitude absentes du référentiel"); maj(champsE, rE(a.id), { [ce.lat]: +lat.toFixed(6), [ce.lon]: +lon.toFixed(6) }); }
        } else if (a.op === "maj") {
          const t = a.objet === "site" ? tS : tE, c = colChamp(t, a.champ); if (!c) throw new Error(`colonne « ${a.champ} » absente`);
          const v = l.valeur !== "" && l.valeur != null ? l.valeur : a.valeur; if (v == null || v === "") throw new Error(`choisissez la valeur de « ${a.champ} »`);
          const val = convertir(c, v); if (/^Choice/.test(c.type)) choix.push([t, c.colId, val]);
          maj(a.objet === "site" ? champsS : champsE, a.objet === "site" ? rS(a.id) : rE(a.id), { [c.colId]: val });
        } else if (a.op === "uai") {
          const c = colChamp(tE, "UAI") || colChamp(tE, "Identifiant(s) UAI"); if (!c) throw new Error("colonne UAI absente");
          const r = rE(a.id), d = await grist.docApi.fetchTable(tE), act = String((d[c.colId] || [])[d.id.indexOf(r)] ?? "").trim();
          const l2 = act.split(/\s*[,;|]\s*/).filter(Boolean); if (!l2.includes(a.uai)) maj(champsE, r, { [c.colId]: [...l2, a.uai].join(act.includes(";") ? "; " : ", ") });
        } else if (a.op === "confirmer") { rE(a.id); }
        ok.push(l);
      } catch (err) { erreurs.push({ l, msg: err.message || String(err) }); }
    }
    for (const [t, col, v] of choix) await etendreChoix(t, col, [v]);
    const acts = [...[...champsE].map(([r, f]) => ["UpdateRecord", tE, r, f]), ...[...champsS].map(([r, f]) => ["UpdateRecord", tS, r, f])];
    // références vers les lignes retirées : sites, signalements, composantes, Membre de… reportés sur la ligne qui les remplace
    let nRefs = 0;
    if (vers.size) {
      const refs = await window.References.chercher(fv.meta, tE, new Set(vers.keys()), { exclure: (t, c) => t === tE && c === cRemp });
      const ra = window.References.actions(refs, vers); nRefs = ra.length;
      // site dont la composante devient l'établissement lui-même : composante effacée
      if (tS && cs.comp) {
        const siteEtab = new Map(H.sites().map(s => [s.id, s.etab]));
        ra.filter(x => x[1] === tS && cs.etab in x[3]).forEach(x => siteEtab.set(x[2], x[3][cs.etab]));
        ra.forEach(x => { if (x[1] === tS && cs.comp in x[3] && x[3][cs.comp] === siteEtab.get(x[2])) x[3][cs.comp] = 0; });
      }
      acts.push(...ra);
    }
    return { acts, ok, erreurs, nRefs };
  }
  async function appliquer(lignes, surcharge, dansBandeau) {
    if (enCours) return; enCours = true;
    try {
      await preparer(); await assurerColonnes(lignes);
      const p = await preparerActions(lignes, surcharge);
      if (!p.ok.length) { dire(p.erreurs.map(e => `${e.l.vid} : ${e.msg}`).join(" ; "), "err"); enCours = false; return; }
      const dec = p.ok.map(l => {
        if (surcharge.site != null && fv.cols.valeur) l.valeur = fv.idx.codeSite.get(surcharge.site) || String(surcharge.site);
        if (surcharge.lat != null && fv.cols.valeur) l.valeur = `${(+surcharge.lat).toFixed(6)}, ${(+surcharge.lon).toFixed(6)}`;
        const modif = l.action.op === "maj" && l.valeur && String(l.valeur) !== String(l.action.valeur);
        return ["UpdateRecord", fv.table, l.rid, champsDecision(l, modif ? "Modifier" : "Accepter")];
      });
      await ecrire([...p.acts, ...dec]);
      p.ok.forEach(l => coches.delete(l.rid));
      await H.relire();
      await apresEcriture(`${nf(p.ok.length)} point(s) accepté(s) et appliqué(s)${p.nRefs ? `, ${nf(p.nRefs)} référence(s) reportée(s)` : ""}.`
        + (p.erreurs.length ? ` Non appliqués : ${p.erreurs.map(e => `${e.l.vid} (${e.msg})`).join(" ; ")}.` : ""), dansBandeau, p.erreurs.length ? "err" : "ok");
    } catch (err) { dire(`Non appliqué : ${err.message || err}`, "err"); }
    enCours = false;
  }
  async function accepterLot() {
    const l = fv.lignes.filter(x => coches.has(x.rid) && modeDe(x) === "auto" && etatDe(x) !== "traites"); if (!l.length) return;
    const n = new Map(); l.forEach(x => n.set(x.action.op, (n.get(x.action.op) || 0) + 1));
    const detail = [...n].map(([op, k]) => `${nf(k)} ${OPS[op]}`).join(", ");
    if (!confirm(`Accepter et appliquer ${nf(l.length)} point(s) : ${detail} ?\n\nLes modifications sont écrites dans le référentiel ; les références vers les lignes retirées sont reportées sur la ligne qui les remplace.`)) return;
    await appliquer(l, {}, false);
  }

  /* ---------- ouvrir un point dans la vue « Établissements et sites » ---------- */
  function ouvrir(l) {
    const I = fv.idx, a = l.action || {};
    let ok = /^SITE-/.test(l.objetId) && I.site.has(l.objetId) && H.ouvrirSite(I.site.get(l.objetId));
    // établissement du point ; ligne retirée (plus proposée) : celle qui la remplace, ou celle qu'indique la proposition
    if (!ok) for (const code of [l.objetId, a.par, a.parent, (/ETAB-[A-Z]{0,2}\d+/.exec(l.proposition) || [])[0]]) {
      if (code && I.etab.has(code) && H.ouvrirEtab(I.etab.get(code))) { ok = true; break; }
    }
    if (!ok) { dire(`${l.objetId} : introuvable dans le référentiel (autre référentiel, ou ligne pas encore importée).`, "err"); return; }
    bandeau(l);
  }
  function bandeau(l) {
    const z = H.bandeau(); if (!z) return;
    const a = l.action, I = fv.idx, m = modeDe(l);
    let extra = "";
    if (a && a.op === "siege" && etatDe(l) !== "traites") {
      const r = I.etab.get(a.id), ss = H.sites().filter(s => s.etab === r).sort((x, y) => (y.actif - x.actif) || x.nom.localeCompare(y.nom, "fr"));
      const sug = a.suggestion ? I.site.get(a.suggestion) : null;
      extra = ss.length ? `<div class="outils"><label>Siège <select data-fvb="site">${ss.map(s => `<option value="${s.id}"${s.id === sug ? " selected" : ""}>${esc(I.codeSite.get(s.id) || "")} – ${esc(s.nom)}${s.commune ? ` (${esc(s.commune)})` : ""}${s.actif ? "" : " [inactif]"}</option>`).join("")}</select></label>
        <button type="button" data-fvb="siege">Désigner comme siège et accepter</button></div>`
        : `<div class="aide">Aucun site rattaché à l'établissement : ajoutez le site de la direction ci-dessous (lieux IGN, OpenStreetMap, adresse ou clic sur la carte), puis rouvrez ce point.</div>`;
    }
    if (a && a.op === "position" && etatDe(l) !== "traites") extra = `<div class="outils"><button type="button" data-fvb="placer">${a.lat == null ? "Placer" : "Replacer"} d'un clic sur la carte et accepter</button>${a.lat != null ? `<span class="aide">ou acceptez les coordonnées proposées (${a.lat}, ${a.lon})</span>` : ""}</div>`;
    z.innerHTML = `<div class="qa-bandeau fv-bandeau" data-rid="${l.rid}"><strong>${esc(l.type)}</strong> — ${esc(l.vid)} · ${esc(l.objetId)}${l.libelle ? ` ${esc(l.libelle)}` : ""}<br>${esc(l.proposition)}
      ${l.preuve ? `<div class="aide">${esc(l.preuve)}</div>` : ""}${extra}
      ${etatDe(l) === "traites" ? `<div class="aide">Déjà traité : ${esc(l.decision)}${l.valeur ? ` (${esc(l.valeur)})` : ""}.</div>` : `<div class="outils">${(a && a.op === "maj") || m === "main" ? champValeur(l) : ""}<input type="text" data-fvl="commentaire" value="${esc(l.commentaire)}" placeholder="Commentaire" aria-label="Commentaire">${boutons(l, true)}</div>`}
      <div class="outils"><button type="button" class="lien" data-fvb="retour">← Retour à la file de vérification</button></div></div>`;
    lierItem(z.querySelector(".fv-bandeau"), l, true);
    z.querySelectorAll("[data-fvb]").forEach(b => b.addEventListener("click", async () => {
      const k = b.dataset.fvb;
      if (k === "retour") { z.innerHTML = ""; H.versFile(); return; }
      const com = z.querySelector("[data-fvl=commentaire]"); if (com) l.commentaire = com.value.trim();
      if (k === "siege") await appliquer([l], { site: +z.querySelector("[data-fvb=site]").value }, true);
      if (k === "placer") { H.dire(`Cliquez sur la carte pour placer ${l.objetId}.`); H.placer(q => appliquer([l], { lat: q.lat, lon: q.lng }, true)); }
    }));
  }

  /* ---------- montage ---------- */
  async function recharger() {
    if (chargement) return chargement;
    chargement = (async () => {
      try { await charger(); } catch (err) { fv = { erreur: `File de vérification illisible : ${err.message || err}` }; }
      chargement = null; dessiner();
    })();
    return chargement;
  }
  window.FileVerif = {
    monter(hote) { H = hote; return recharger(); },
    recharger,
    afficher() { if (!fv) recharger(); else dessiner(); },
    nombre: aTraiter,
  };
})();
