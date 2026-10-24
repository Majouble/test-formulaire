/* =====================================================================
   Administration v2 — onglet « Référentiel » : sites de l'enseignement supérieur
   ---------------------------------------------------------------------
   Rapprochement des sites saisis en texte libre (anciens formulaires, « site hors référentiel ») avec le référentiel
   des sites stabilisé (export OAD, sites ajoutés à la main) :
   - source : une colonne texte de sites (sous-table d'une question tableau, rattachée au signalement par Dossier, ou
     colonne de la table des réponses) ; établissement lu sur le signalement ;
   - libellés regroupés par établissement (sans accents, casse ni ponctuation), avec leur nombre d'occurrences ;
   - site proposé parmi les sites de l'établissement (mots communs, « campus », « site », « bât. » ignorés) ;
   - validation : table Sites_correspondances (Etablissement, Libelle, Site, Occurrences, Statut = Validé / Écarté),
     lue par le widget de saisie (reprise du dernier état connu de chaque site) ;
   - « Compléter les saisies » : renseigne le site du référentiel sur les lignes des tableaux de sites qui n'ont qu'un
     libellé validé.
   ===================================================================== */
(function () {
  "use strict";
  const S = window.Socle;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const refId = v => typeof v === "number" ? v : (v && typeof v === "object" && "rowId" in v) ? v.rowId : (Array.isArray(v) && v[0] === "R") ? v[2] : null;
  const norm = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’']/g, " ").replace(/\s+/g, " ").trim();
  const VIDES = new Set(["campus", "site", "sites", "bat", "bati", "batiment", "batiments", "de", "du", "des", "la", "le", "les", "l", "d", "et", "a", "au", "aux", "sur", "en", "universite", "univ", "pole", "rue", "avenue", "av", "bd", "boulevard"]);
  const mots = s => new Set(norm(s).replace(/[^a-z0-9]+/g, " ").split(" ").filter(w => w.length > 1 && !VIDES.has(w)));
  const TABLE_ALIAS = "Sites_correspondances";

  let racine = null, meta = null, etat = null, filtre = "a_traiter", choixSource = "", choixRef = "";
  try { const p = JSON.parse(localStorage.getItem("socle-v2-sites") || "{}"); choixSource = p.source || ""; choixRef = p.ref || ""; } catch (_) { /* stockage indisponible */ }
  const memoriser = () => { try { localStorage.setItem("socle-v2-sites", JSON.stringify({ source: choixSource, ref: choixRef })); } catch (_) { /* stockage indisponible */ } };

  /* ---------- tables : réponses (et leur établissement), sources de libellés, référentiels de sites ---------- */
  function contexte(config) {
    const g = S.general(config), reps = S.espaces(g).map(e => e.reponses).filter(t => meta[t]);
    const etabDe = rep => { const c = Object.values(meta[rep].colonnes).find(x => x.colId === "Etablissement") || null; return c ? { col: c.colId, table: S.cibleRef(c.type) } : null; };
    const sources = [];
    for (const rep of reps) {
      const e = etabDe(rep); if (!e) continue;
      // colonnes texte de sites dans la table des réponses
      Object.values(meta[rep].colonnes).filter(c => /^Text/.test(c.type) && !c.isFormula && /site|batiment|campus/i.test(c.colId) && !/detail|json/i.test(c.colId))
        .forEach(c => sources.push({ cle: `${rep}.${c.colId}`, libelle: `${rep} › ${c.label || c.colId}`, table: rep, col: c.colId, rep, viaDossier: null, etab: e }));
      // sous-tables rattachées aux réponses (question tableau) : colonnes texte de nom de site
      for (const [t, tm] of Object.entries(meta)) {
        if (t === rep || t.startsWith("_grist")) continue;
        const d = Object.values(tm.colonnes).find(c => c.type === `Ref:${rep}` && c.colId !== "Version"); if (!d) continue;
        Object.values(tm.colonnes).filter(c => /^Text/.test(c.type) && !c.isFormula && /site|nom|libre|batiment/i.test(c.colId) && !/^Dossier_|Ligne_id/.test(c.colId))
          .forEach(c => sources.push({ cle: `${t}.${c.colId}`, libelle: `${t} › ${c.label || c.colId}`, table: t, col: c.colId, rep, viaDossier: d.colId, etab: e }));
      }
    }
    const etabTables = new Set(sources.map(s => s.etab.table));
    const refs = Object.entries(meta).filter(([t, tm]) => !t.startsWith("_grist") && !reps.includes(t) && t !== TABLE_ALIAS
      && Object.values(tm.colonnes).some(c => etabTables.has(S.cibleRef(c.type))) && !Object.values(tm.colonnes).some(c => reps.includes(S.cibleRef(c.type))))
      .map(([t, tm]) => ({ table: t, etabCol: Object.values(tm.colonnes).find(c => etabTables.has(S.cibleRef(c.type))).colId,
        nomCol: (Object.values(tm.colonnes).find(c => /^(nom|libelle|denomination|intitule)/i.test(c.colId) && /^Text/.test(c.type)) || Object.values(tm.colonnes).find(c => /^Text/.test(c.type)) || {}).colId }))
      .filter(r => r.nomCol).sort((a, b) => (/site/i.test(b.table) ? 1 : 0) - (/site/i.test(a.table) ? 1 : 0));
    return { sources, refs };
  }

  async function analyser(config) {
    meta = await S.lireMeta();
    const ctx = contexte(config);
    const source = ctx.sources.find(s => s.cle === choixSource) || ctx.sources.find(s => /libre|nom_du_site/i.test(s.col)) || ctx.sources[0] || null;
    const ref = ctx.refs.find(r => r.table === choixRef) || ctx.refs[0] || null;
    if (!source || !ref) return { ctx, source, ref, groupes: [] };
    const [ts, trep, tref, talias] = await Promise.all([grist.docApi.fetchTable(source.table), grist.docApi.fetchTable(source.rep), grist.docApi.fetchTable(ref.table),
      meta[TABLE_ALIAS] ? grist.docApi.fetchTable(TABLE_ALIAS) : null]);
    const idxRep = new Map(trep.id.map((id, i) => [id, i])), etabRep = id => { const i = idxRep.get(id); return i === undefined ? null : refId(trep[source.etab.col][i]); };
    // établissements : nom lisible
    let nomsEtab = new Map();
    try { const te = await grist.docApi.fetchTable(source.etab.table), cn = Object.keys(te).find(k => /^(nom|etablissement|libelle|denomination)$/i.test(k)) || Object.keys(te).find(k => k !== "id" && (te[k] || []).some(x => typeof x === "string"));
      nomsEtab = new Map(te.id.map((id, i) => [id, String(cn ? te[cn][i] ?? "" : id)])); } catch (_) { /* identifiants seuls */ }
    // sites du référentiel, par établissement
    const sitesDe = new Map();
    tref.id.forEach((id, i) => { const e = refId(tref[ref.etabCol][i]); if (!e) return; if (!sitesDe.has(e)) sitesDe.set(e, []); sitesDe.get(e).push({ id, nom: String(tref[ref.nomCol][i] ?? "") }); });
    // correspondances existantes
    const alias = new Map();
    if (talias) talias.id.forEach((id, i) => alias.set(`${refId(talias.Etablissement[i]) || 0}|${norm(talias.Libelle[i])}`, { id, site: refId(talias.Site[i]), statut: String(talias.Statut[i] || "") }));
    // libellés saisis, regroupés par établissement
    const groupes = new Map();
    ts.id.forEach((id, i) => {
      const lib = String(ts[source.col][i] ?? "").trim(); if (!lib) return;
      const e = source.viaDossier ? etabRep(refId(ts[source.viaDossier][i])) : refId(ts[source.etab.col][i]); if (!e) return;
      const k = `${e}|${norm(lib)}`;
      if (!groupes.has(k)) groupes.set(k, { cle: k, etab: e, libelle: lib, n: 0 });
      groupes.get(k).n++;
    });
    const liste = [...groupes.values()].map(gp => {
      const sites = sitesDe.get(gp.etab) || [], m = mots(gp.libelle);
      const notes = sites.map(s => { const n = mots(s.nom), communs = [...m].filter(w => n.has(w)).length;
        return { s, score: communs ? communs / Math.max(1, Math.min(m.size, n.size)) : (norm(s.nom) && norm(gp.libelle).includes(norm(s.nom)) ? 0.8 : 0) }; })
        .sort((a, b) => b.score - a.score);
      const a = alias.get(gp.cle);
      return { ...gp, nomEtab: nomsEtab.get(gp.etab) || `Établissement ${gp.etab}`, sites, alias: a || null,
        propose: a && a.site ? a.site : (notes[0] && notes[0].score >= 0.5 ? notes[0].s.id : null), score: notes[0] ? notes[0].score : 0 };
    }).sort((x, y) => x.nomEtab.localeCompare(y.nomEtab, "fr") || y.n - x.n);
    return { ctx, source, ref, groupes: liste };
  }

  /* ---------- rendu ---------- */
  function dessiner() {
    if (!racine) return;
    if (!etat) { racine.innerHTML = `<h2>Sites de l'enseignement supérieur</h2><p class="aide">Analyse des sites saisis…</p>`; return; }
    const { ctx, source, ref } = etat;
    const statutDe = gp => gp.alias ? (/cart/i.test(gp.alias.statut) ? "ecarte" : /valid/i.test(gp.alias.statut) ? "valide" : "a_traiter") : "a_traiter";
    const visibles = etat.groupes.filter(gp => filtre === "tous" || statutDe(gp) === filtre);
    const n = k => etat.groupes.filter(gp => statutDe(gp) === k).length;
    racine.innerHTML = `<h2>Sites de l'enseignement supérieur : rapprochement des libellés saisis</h2>
      <p class="aide">Les sites saisis en texte libre (anciens formulaires, « site hors référentiel ») sont rattachés à un site du référentiel stabilisé. Les correspondances validées
        (table ${TABLE_ALIAS}) servent à la reprise du dernier état connu de chaque site dans le formulaire par site, et à compléter les saisies.</p>
      ${!ctx.sources.length ? `<p class="vide">Aucune colonne de sites saisis en texte libre n'a été trouvée (sous-table d'une question tableau ou colonne « site » de la table des réponses).</p>`
        : !ctx.refs.length ? `<p class="vide">Aucun référentiel des sites : une table dont une colonne renvoie vers le référentiel des établissements (le modèle de formulaire « Enseignement supérieur par site » la crée).</p>` : `
      <div class="sites-outils">
        <label>Libellés saisis <select id="si-source">${ctx.sources.map(s => `<option value="${esc(s.cle)}"${source && s.cle === source.cle ? " selected" : ""}>${esc(s.libelle)}</option>`).join("")}</select></label>
        <label>Référentiel des sites <select id="si-ref">${ctx.refs.map(r => `<option value="${esc(r.table)}"${ref && r.table === ref.table ? " selected" : ""}>${esc(r.table)} (${esc(r.nomCol)})</option>`).join("")}</select></label>
        <label>Afficher <select id="si-filtre">${[["a_traiter", `à traiter (${n("a_traiter")})`], ["valide", `validés (${n("valide")})`], ["ecarte", `écartés (${n("ecarte")})`], ["tous", "tous"]].map(([v, l]) => `<option value="${v}"${filtre === v ? " selected" : ""}>${l}</option>`).join("")}</select></label>
      </div>
      <div class="boutons" style="margin-top:0">
        <button class="primaire" id="si-valider">Valider la sélection</button>
        <button class="secondaire" id="si-ecarter">Écarter la sélection</button>
        <button class="secondaire" id="si-completer" title="Renseigne le site du référentiel sur les lignes des tableaux de sites qui n'ont qu'un libellé validé">Compléter les saisies</button>
        <span class="statut" id="si-statut" role="status"></span></div>
      ${visibles.length ? `<div class="sites-defile"><table class="sites-table"><thead><tr><th><input type="checkbox" id="si-tout" aria-label="Tout sélectionner"></th><th>Établissement</th><th>Libellé saisi</th><th>Site du référentiel</th><th>Statut</th></tr></thead><tbody>
        ${visibles.map(gp => `<tr data-cle="${esc(gp.cle)}"><td><input type="checkbox" class="si-coche"${statutDe(gp) === "a_traiter" && gp.propose ? " checked" : ""}></td>
          <td>${esc(gp.nomEtab)}</td><td><strong>${esc(gp.libelle)}</strong> <span class="aide">× ${gp.n}</span></td>
          <td><select class="si-site"><option value="">— aucun (hors référentiel)</option>${gp.sites.map(s => `<option value="${s.id}"${s.id === gp.propose ? " selected" : ""}>${esc(s.nom)}</option>`).join("")}</select>
            ${!gp.alias && gp.propose ? ` <span class="pastille reco">proposé</span>` : ""}${!gp.sites.length ? ` <span class="aide">aucun site de cet établissement au référentiel</span>` : ""}</td>
          <td>${statutDe(gp) === "valide" ? `<span class="pastille ok">validé</span>` : statutDe(gp) === "ecarte" ? `<span class="pastille">écarté</span>` : `<span class="pastille manque">à traiter</span>`}</td></tr>`).join("")}
      </tbody></table></div>` : `<p class="vide">Rien ${filtre === "a_traiter" ? "à traiter" : "à afficher"}.</p>`}`}`;
    lier();
  }
  const dire = (t, err) => { const s = $("si-statut"); if (s) { s.textContent = t; s.className = `statut${err ? " err" : " ok"}`; } };
  function lier() {
    const sel = (id, f) => { const e = $(id); if (e) e.addEventListener("change", f); };
    sel("si-source", e => { choixSource = e.target.value; memoriser(); relancer(); });
    sel("si-ref", e => { choixRef = e.target.value; memoriser(); relancer(); });
    sel("si-filtre", e => { filtre = e.target.value; dessiner(); });
    sel("si-tout", e => racine.querySelectorAll(".si-coche").forEach(c => { c.checked = e.target.checked; }));
    racine.querySelectorAll(".si-site").forEach(s => s.addEventListener("change", () => { s.closest("tr").querySelector(".si-coche").checked = true; }));
    const b = (id, f) => { const e = $(id); if (e) e.addEventListener("click", f); };
    b("si-valider", () => ecrire("Validé")); b("si-ecarter", () => ecrire("Écarté")); b("si-completer", completer);
  }

  /* ---------- écritures ---------- */
  async function tableAlias() {
    if (meta[TABLE_ALIAS]) return;
    const etab = etat.source.etab.table;
    await grist.docApi.applyUserActions([["AddTable", TABLE_ALIAS, [["Etablissement", `Ref:${etab}`], ["Libelle", "Text"], ["Site", `Ref:${etat.ref.table}`], ["Occurrences", "Int"], ["Statut", "Choice"]]
      .map(([id, type]) => ({ id, type, isFormula: false }))]]);
    await grist.docApi.applyUserActions([["ModifyColumn", TABLE_ALIAS, "Statut", { widgetOptions: JSON.stringify({ choices: ["À valider", "Validé", "Écarté"], choiceOptions: { "Validé": { fillColor: "#B8FEC9" }, "Écarté": { fillColor: "#EEEEEE" } } }) }]]);
    meta = await S.lireMeta();
  }
  async function ecrire(statut) {
    const lignes = [...racine.querySelectorAll("tbody tr")].filter(tr => tr.querySelector(".si-coche").checked);
    if (!lignes.length) { dire("Cochez au moins une ligne.", true); return; }
    try {
      await tableAlias();
      const acts = [];
      let sansSite = 0;
      for (const tr of lignes) {
        const gp = etat.groupes.find(x => x.cle === tr.dataset.cle); if (!gp) continue;
        const site = +tr.querySelector(".si-site").value || 0;
        if (statut === "Validé" && !site) { sansSite++; continue; }
        const f = { Etablissement: gp.etab, Libelle: gp.libelle, Site: statut === "Validé" ? site : (site || 0), Occurrences: gp.n, Statut: statut };
        acts.push(gp.alias ? ["UpdateRecord", TABLE_ALIAS, gp.alias.id, f] : ["AddRecord", TABLE_ALIAS, null, f]);
      }
      for (let k = 0; k < acts.length; k += 400) await grist.docApi.applyUserActions(acts.slice(k, k + 400));
      await relancer();
      dire(`${acts.length} correspondance(s) ${statut === "Validé" ? "validée(s)" : "écartée(s)"}.${sansSite ? ` ${sansSite} ligne(s) sans site choisi, laissée(s) de côté.` : ""}`);
    } catch (e) { dire(`Écriture refusée par Grist (${e.message || e}).`, true); }
  }
  // lignes des tableaux de sites (formulaires publiés) : site vide, libellé validé → site du référentiel
  async function completer() {
    try {
      const cfg = await S.lireConfig(), g = S.general(cfg), tf = await grist.docApi.fetchTable(g.formulaires || "Formulaires");
      const reglages = [];
      tf.id.forEach((_, i) => { let c = null; try { c = JSON.parse(tf.Publie[i] || "null"); } catch (_) { c = null; }
        ((c && c.blocs) || []).forEach(b => { const t = b.reglages && b.reglages.tableau; if (t && t.table && t.sites && t.sites.site && t.sites.libre) reglages.push({ rep: tf.Table[i], ...t }); }); });
      if (!reglages.length) { dire("Aucun tableau de sites dans les formulaires publiés.", true); return; }
      const talias = await grist.docApi.fetchTable(TABLE_ALIAS), alias = new Map();
      talias.id.forEach((_, i) => { if (/valid/i.test(String(talias.Statut[i] || "")) && refId(talias.Site[i])) alias.set(`${refId(talias.Etablissement[i]) || 0}|${norm(talias.Libelle[i])}`, refId(talias.Site[i])); });
      let n = 0;
      for (const r of reglages) {
        const ts = await grist.docApi.fetchTable(r.table), trep = await grist.docApi.fetchTable(r.rep), idx = new Map(trep.id.map((id, i) => [id, i]));
        const cD = Object.values(meta[r.table].colonnes).find(c => c.colId === "Dossier") ? "Dossier" : null; if (!cD || !trep.Etablissement) continue;
        const acts = [];
        ts.id.forEach((id, i) => {
          if (refId(ts[r.sites.site][i])) return;
          const lib = String(ts[r.sites.libre][i] ?? "").trim(); if (!lib) return;
          const k = idx.get(refId(ts[cD][i])), e = k === undefined ? null : refId(trep.Etablissement[k]);
          const s = alias.get(`${e || 0}|${norm(lib)}`); if (s) acts.push(["UpdateRecord", r.table, id, { [r.sites.site]: s }]);
        });
        for (let k = 0; k < acts.length; k += 400) await grist.docApi.applyUserActions(acts.slice(k, k + 400));
        n += acts.length;
      }
      dire(`${n} ligne(s) de tableaux de sites complétée(s) avec le site du référentiel.`);
    } catch (e) { dire(`Échec : ${e.message || e}`, true); }
  }

  async function relancer() {
    try { const cfg = await S.lireConfig(); etat = cfg ? await analyser(cfg) : null; } catch (e) { etat = null; racine.innerHTML = `<h2>Sites de l'enseignement supérieur</h2><p class="statut err">Analyse impossible : ${esc(e.message || e)}</p>`; return; }
    dessiner();
  }
  async function afficher() {
    racine = $("ref-sites"); if (!racine) return;
    etat = null; dessiner(); await relancer();
  }
  window.OngletSitesESR = { afficher };
})();
