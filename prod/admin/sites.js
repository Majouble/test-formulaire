/* =====================================================================
   Administration v2 — onglet « Référentiel » : sites de l'enseignement supérieur
   ---------------------------------------------------------------------
   Rapprochement des sites saisis en texte libre (anciens formulaires, « site hors référentiel ») avec le référentiel
   des sites stabilisé (export OAD, sites ajoutés à la main) :
   - source : une colonne texte de sites (sous-table d'une question tableau, rattachée au signalement par Dossier, ou
     colonne de la table des réponses), ou une colonne référence vers le référentiel des sites dont des cellules gardent
     un ancien nom (référence non résolue, en rouge dans Grist) ; établissement lu sur le signalement ;
   - libellés regroupés par établissement (sans accents, casse ni ponctuation), avec leur nombre d'occurrences ;
   - site proposé parmi les sites de l'établissement (mots communs, « campus », « site », « bât. » ignorés) ;
   - validation : table Sites_correspondances (Etablissement, Libelle, Site, Occurrences, Statut = Validé / Écarté),
     lue par le widget de saisie (reprise du dernier état connu de chaque site) ;
   - « Compléter les saisies » : renseigne le site du référentiel sur les lignes des tableaux de sites qui n'ont qu'un
     libellé validé ; dans une colonne référence aux sites, l'ancien nom est remplacé par le site (même colonne).
   Aussi affiché dans le widget « Référentiel des sites » (onglet « Corriger les saisies », tous les établissements) :
   OngletSitesESR.afficher({ racine, compact: true, apresEcriture }) — sans fiche d'établissement ni mots-clés.
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
  /* ---------- contexte des saisies : date des faits, qualification, description du signalement de chaque occurrence ----------
     Aide à décider du site : affiché sous chaque libellé (le plus récent, les autres repliés). Aussi utilisé par le widget. */
  const colDe = (tm, ...res) => { const cs = Object.values((tm && tm.colonnes) || {}); for (const re of res) { const c = cs.find(x => re.test(x.colId)); if (c) return c.colId; } return null; };
  function colsContexte(tmRep, tmSource) {
    return { date: colDe(tmRep, /^date_faits$/i, /^date.*fait/i, /^date$/i), cree: colDe(tmRep, /^cree_le$/i, /^date_saisie$/i),
      desc: colDe(tmRep, /^description$/i, /descri/i, /^commentaire/i), qualif: colDe(tmRep, /^qualification$/i, /^qualif/i), nature: colDe(tmRep, /^nature$/i),
      qualifSite: tmSource && tmSource !== tmRep ? colDe(tmSource, /^qualification/i, /qualif/i) : null };
  }
  const valTexte = v => Array.isArray(v) ? v.slice(1).join(", ") : v == null ? "" : String(v);
  // une occurrence : ligne k de la table des réponses (trep), ligne i de la table des saisies (ts)
  function occurrence(cols, trep, k, ts, i) {
    const g = (t, c, j) => c && t && t[c] && j !== undefined && j !== null ? t[c][j] : null;
    const d = g(trep, cols.date, k), c = g(trep, cols.cree, k);
    return { quand: typeof d === "number" ? d : typeof c === "number" ? c : 0, date: typeof d === "number" ? d : null,
      qualif: valTexte(g(ts, cols.qualifSite, i)) || valTexte(g(trep, cols.qualif, k)), desc: valTexte(g(trep, cols.desc, k)).trim(), nature: valTexte(g(trep, cols.nature, k)) };
  }
  const jour = s => new Date(s * 1000).toLocaleDateString("fr-FR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" });
  function contexteHtml(occs) {
    if (!occs || !occs.length) return "";
    const tri = occs.slice().sort((a, b) => b.quand - a.quand);
    const une = o => { const d = o.desc.length > 220 ? o.desc.slice(0, 220) + "…" : o.desc;
      return `<span class="si-ctx-date">${o.date ? jour(o.date) : "date inconnue"}</span>${o.qualif ? ` · ${esc(o.qualif)}` : ""}${o.nature && !/^nouveau/i.test(o.nature) ? ` · ${esc(o.nature)}` : ""}${d ? ` — <span title="${esc(o.desc)}">${esc(d)}</span>` : ""}`; };
    return `<div class="si-ctx aide">${une(tri[0])}${tri.length > 1 ? `<details><summary>${tri.length - 1} autre${tri.length > 2 ? "s" : ""} signalement${tri.length > 2 ? "s" : ""}</summary><ul>${tri.slice(1, 30).map(o => `<li>${une(o)}</li>`).join("")}${tri.length > 31 ? `<li>… (${tri.length - 31} de plus)</li>` : ""}</ul></details>` : ""}</div>`;
  }

  // ancien nom d'une référence non résolue : texte gardé par Grist dans la cellule
  const texteDe = v => typeof v === "string" ? v : Array.isArray(v) && typeof v[v.length - 1] === "string" ? v[v.length - 1] : "";

  let racine = null, opts = {}, meta = null, etat = null, filtre = "a_traiter", choixSource = "", choixRef = "", choixEtabMc = "";
  try { const p = JSON.parse(localStorage.getItem("socle-v2-sites") || "{}"); choixSource = p.source || ""; choixRef = p.ref || ""; } catch (_) { /* stockage indisponible */ }
  const memoriser = () => { try { localStorage.setItem("socle-v2-sites", JSON.stringify({ source: choixSource, ref: choixRef })); } catch (_) { /* stockage indisponible */ } };

  /* ---------- tables : réponses (et leur établissement), sources de libellés, référentiels de sites ---------- */
  function contexte(config) {
    const g = S.general(config), reps = S.espaces(g).map(e => e.reponses).filter(t => meta[t]);
    const etabDe = rep => { const c = Object.values(meta[rep].colonnes).find(x => x.colId === "Etablissement") || null; return c ? { col: c.colId, table: S.cibleRef(c.type) } : null; };
    const etabTables = new Set(reps.map(etabDe).filter(Boolean).map(e => e.table));
    const refs = Object.entries(meta).filter(([t, tm]) => !t.startsWith("_grist") && !reps.includes(t) && t !== TABLE_ALIAS
      && Object.values(tm.colonnes).some(c => etabTables.has(S.cibleRef(c.type))) && !Object.values(tm.colonnes).some(c => reps.includes(S.cibleRef(c.type))))
      .map(([t, tm]) => ({ table: t, etabCol: Object.values(tm.colonnes).find(c => etabTables.has(S.cibleRef(c.type))).colId,
        nomCol: (Object.values(tm.colonnes).find(c => /^(nom|libelle|denomination|intitule)/i.test(c.colId) && /^Text/.test(c.type)) || Object.values(tm.colonnes).find(c => /^Text/.test(c.type)) || {}).colId,
        autresCol: (Object.values(tm.colonnes).find(c => /^autres?_noms?|alias|noms_saisis/i.test(c.colId) && /^Text/.test(c.type)) || {}).colId || null,
        motsCol: (Object.values(tm.colonnes).find(c => /^mots?_?cles?$/i.test(c.colId) && /^Text/.test(c.type)) || {}).colId || null }))
      .filter(r => r.nomCol).sort((a, b) => (/site/i.test(b.table) ? 1 : 0) - (/site/i.test(a.table) ? 1 : 0));
    // colonnes de sites saisis : texte, ou référence vers un référentiel des sites (anciens noms restés en texte)
    const tRefs = new Set(refs.map(r => r.table)), versSites = c => /^Ref:/.test(c.type) && tRefs.has(S.cibleRef(c.type));
    const sources = [];
    const ajouter = (t, c, rep, viaDossier, e) => sources.push({ cle: `${t}.${c.colId}`, libelle: `${t} › ${c.label || c.colId}${versSites(c) ? " (référence aux sites)" : ""}`,
      table: t, col: c.colId, rep, viaDossier, etab: e, estRef: versSites(c), cible: versSites(c) ? S.cibleRef(c.type) : null });
    for (const rep of reps) {
      const e = etabDe(rep); if (!e) continue;
      // colonnes de sites dans la table des réponses
      Object.values(meta[rep].colonnes).filter(c => (/^Text/.test(c.type) || versSites(c)) && !c.isFormula && /site|batiment|campus/i.test(`${c.colId} ${c.label || ""}`) && !/detail|json/i.test(c.colId))
        .forEach(c => ajouter(rep, c, rep, null, e));
      // sous-tables rattachées aux réponses (question tableau) : colonnes de nom de site
      for (const [t, tm] of Object.entries(meta)) {
        if (t === rep || t.startsWith("_grist")) continue;
        const d = Object.values(tm.colonnes).find(c => c.type === `Ref:${rep}` && c.colId === "Dossier") || Object.values(tm.colonnes).find(c => c.type === `Ref:${rep}` && c.colId !== "Version"); if (!d) continue;
        Object.values(tm.colonnes).filter(c => (/^Text/.test(c.type) || versSites(c)) && !c.isFormula && /site|nom|libre|batiment/i.test(`${c.colId} ${c.label || ""}`) && !/^Dossier_|Ligne_id/.test(c.colId))
          .forEach(c => ajouter(t, c, rep, d.colId, e));
      }
    }
    // colonne référence aux sites d'abord : elle garde les anciens noms tant qu'ils ne sont pas rattachés
    sources.sort((a, b) => (b.estRef ? 1 : 0) - (a.estRef ? 1 : 0));
    return { sources, refs };
  }

  async function analyser(config) {
    meta = await S.lireMeta();
    const ctx = contexte(config);
    // nombre de lignes à rattacher par colonne (texte saisi ; ancien nom dans une colonne référence) : affiché dans la liste,
    // et première colonne qui en a, par défaut
    const tables = new Map();
    for (const x of ctx.sources) {
      try { if (!tables.has(x.table)) tables.set(x.table, await grist.docApi.fetchTable(x.table));
        x.nb = (tables.get(x.table)[x.col] || []).filter(v => (x.estRef ? typeof v !== "number" && texteDe(v).trim() : String(v ?? "").trim())).length; } catch (_) { x.nb = 0; }
      x.libelle = x.libelle.replace(/ — \d+ à rattacher$/, "") + (x.nb ? ` — ${x.nb} à rattacher` : "");
    }
    const source = ctx.sources.find(s => s.cle === choixSource) || ctx.sources.find(s => s.nb && s.estRef) || ctx.sources.find(s => s.nb && /libre|nom_du_site/i.test(s.col)) || ctx.sources.find(s => s.nb) || ctx.sources[0] || null;
    // colonne référence : son référentiel des sites, d'office
    const ref = (source && source.estRef && ctx.refs.find(r => r.table === source.cible)) || ctx.refs.find(r => r.table === choixRef) || ctx.refs[0] || null;
    const mc = ref ? await chargerMotsCles(ref) : null;
    // référentiel des établissements : celui du référentiel des sites, sinon celui du champ ESR, sinon le premier
    const g = S.general(config), esp = S.espaces(g);
    const tEtab = (ref && S.cibleRef(meta[ref.table].colonnes[ref.etabCol].type)) || (esp.find(e => e.champ === "ESR" && meta[e.referentiel]) || esp.find(e => meta[e.referentiel]) || {}).referentiel || null;
    const fe = tEtab && !opts.compact ? await chargerFiche(tEtab) : null;
    if (!source || !ref) return { ctx, source, ref, groupes: [], mc, fe };
    const [ts, trep, tref, talias] = await Promise.all([grist.docApi.fetchTable(source.table), grist.docApi.fetchTable(source.rep), grist.docApi.fetchTable(ref.table),
      meta[TABLE_ALIAS] ? grist.docApi.fetchTable(TABLE_ALIAS) : null]);
    const idxRep = new Map(trep.id.map((id, i) => [id, i])), etabRep = id => { const i = idxRep.get(id); return i === undefined ? null : refId(trep[source.etab.col][i]); };
    // établissements : nom lisible
    let nomsEtab = new Map();
    try { const te = await grist.docApi.fetchTable(source.etab.table), cn = Object.keys(te).find(k => /^(nom|etablissement|libelle|denomination)$/i.test(k)) || Object.keys(te).find(k => k !== "id" && (te[k] || []).some(x => typeof x === "string"));
      nomsEtab = new Map(te.id.map((id, i) => [id, String(cn ? te[cn][i] ?? "" : id)])); } catch (_) { /* identifiants seuls */ }
    // sites du référentiel, par établissement
    const sitesDe = new Map();
    // les autres noms du site (référentiel ESR : noms OAD, noms saisis par les opérateurs) comptent pour la proposition
    tref.id.forEach((id, i) => { const e = refId(tref[ref.etabCol][i]); if (!e) return; if (!sitesDe.has(e)) sitesDe.set(e, []);
      sitesDe.get(e).push({ id, nom: String(tref[ref.nomCol][i] ?? ""), autres: [ref.autresCol, ref.motsCol].filter(c => c && tref[c]).map(c => String(tref[c][i] ?? "")).filter(Boolean).join(", ") }); });
    // correspondances existantes
    const alias = new Map();
    if (talias) talias.id.forEach((id, i) => alias.set(`${refId(talias.Etablissement[i]) || 0}|${norm(talias.Libelle[i])}`, { id, site: refId(talias.Site[i]), statut: String(talias.Statut[i] || "") }));
    // libellés saisis, regroupés par établissement, avec le contexte de chaque occurrence
    const cols = colsContexte(meta[source.rep], meta[source.table]);
    const groupes = new Map();
    ts.id.forEach((id, i) => {
      const v = ts[source.col][i];
      if (source.estRef && typeof v === "number") return;   // déjà rattaché à un site du référentiel
      const lib = String(source.estRef ? texteDe(v) : (v ?? "")).trim(); if (!lib) return;
      const kRep = source.viaDossier ? idxRep.get(refId(ts[source.viaDossier][i])) : i;
      const e = source.viaDossier ? etabRep(refId(ts[source.viaDossier][i])) : refId(ts[source.etab.col][i]); if (!e) return;
      const k = `${e}|${norm(lib)}`;
      if (!groupes.has(k)) groupes.set(k, { cle: k, etab: e, libelle: lib, n: 0, occs: [] });
      const gp = groupes.get(k); gp.n++;
      gp.occs.push(occurrence(cols, source.viaDossier ? trep : ts, kRep, ts, i));
    });
    const liste = [...groupes.values()].map(gp => {
      const sites = sitesDe.get(gp.etab) || [], m = mots(gp.libelle);
      const noter = nom => { const n = mots(nom), communs = [...m].filter(w => n.has(w)).length;
        return communs ? communs / Math.max(1, Math.min(m.size, n.size)) : (norm(nom) && norm(gp.libelle).includes(norm(nom)) ? 0.8 : 0); };
      const notes = sites.map(s => ({ s, score: Math.max(noter(s.nom), norm(gp.libelle).length >= 5 && norm(s.autres).includes(norm(gp.libelle)) ? 0.9 : 0,
        ...String(s.autres || "").split(/\s*[,;|]\s*/).filter(x => x.length > 2).map(x => norm(x) === norm(gp.libelle) ? 1 : 0)) }))
        .sort((a, b) => b.score - a.score);
      const a = alias.get(gp.cle);
      return { ...gp, nomEtab: nomsEtab.get(gp.etab) || `Établissement ${gp.etab}`, sites, alias: a || null,
        propose: a && a.site ? a.site : (notes[0] && notes[0].score >= 0.5 ? notes[0].s.id : null), score: notes[0] ? notes[0].score : 0 };
    }).sort((x, y) => x.nomEtab.localeCompare(y.nomEtab, "fr") || y.n - x.n);
    return { ctx, source, ref, groupes: liste, mc, fe };
  }

  /* ---------- mots-clés des sites : autres noms sous lesquels un site est désigné (bâtiment, ancien nom, sigle…) ----------
     Colonne Mots_cles du référentiel des sites (créée à la demande), lue par le formulaire : taper un mot-clé propose le site. */
  async function chargerMotsCles(ref) {
    const tm = meta[ref.table], colMots = (Object.values(tm.colonnes).find(c => /^mots?_?cles?$/i.test(c.colId) && /^Text/.test(c.type) && !c.isFormula) || {}).colId || null;
    const tEtab = S.cibleRef(tm.colonnes[ref.etabCol].type);
    const [t, te] = await Promise.all([grist.docApi.fetchTable(ref.table), tEtab ? grist.docApi.fetchTable(tEtab).catch(() => null) : null]);
    let noms = new Map();
    if (te) { const cn = Object.keys(te).find(k => /^(nom|etablissement|libelle|denomination)$/i.test(k)) || Object.keys(te).find(k => k !== "id" && (te[k] || []).some(x => typeof x === "string"));
      noms = new Map(te.id.map((id, i) => [id, String(cn ? te[cn][i] ?? "" : id)])); }
    const sites = t.id.map((id, i) => ({ id, nom: String(t[ref.nomCol][i] ?? ""), etab: refId(t[ref.etabCol][i]),
      autres: ref.autresCol && t[ref.autresCol] ? String(t[ref.autresCol][i] ?? "") : "", mots: colMots && t[colMots] ? String(t[colMots][i] ?? "") : "" })).filter(x => x.etab);
    const etabs = [...new Set(sites.map(x => x.etab))].map(id => ({ id, nom: noms.get(id) || `Établissement ${id}`, n: sites.filter(x => x.etab === id).length }))
      .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
    return { table: ref.table, colMots, sites, etabs };
  }
  /* ---------- fiche de l'établissement : informations du référentiel modifiables (commun/fiche-etab.js) ---------- */
  const chargerFiche = tEtab => window.FicheEtab.charger(meta, tEtab);
  function ficheHtml(fe) {
    if (!fe) return "";
    const i = choixEtabMc ? fe.pos.get(+choixEtabMc) : undefined, nom = i !== undefined ? String(fe.t[fe.nomCol][i] ?? "") : "";
    return `<h3 style="font-size:14px;margin:20px 0 4px">Fiche de l'établissement</h3>
      <p class="aide">Informations du référentiel « ${esc(fe.table)} » (effectif, tutelle, type, rattachement…) et mots-clés de ses sites. Chaque modification est enregistrée aussitôt.</p>
      <div class="fe-recherche"><input type="search" id="si-fe-q" placeholder="Établissement : nom, sigle, ville, UAI…" value="${esc(nom)}" autocomplete="off" aria-label="Rechercher un établissement">
        <ul class="fe-res" id="si-fe-res" role="listbox" hidden></ul></div>
      <span class="statut" id="si-fe-statut" role="status"></span>
      ${i === undefined ? "" : window.FicheEtab.html(fe, +choixEtabMc, "si-fe-")}`;
  }
  function lierFiche() {
    const fe = etat && etat.fe, q = $("si-fe-q"); if (!fe || !q) return;
    const ul = $("si-fe-res"), st = $("si-fe-statut");
    const dire2 = (t, err) => { st.textContent = t; st.className = `statut${err ? " err" : " ok"}`; };
    const texte = fe.t.id.map((id, i) => [id, norm(fe.cols.filter(c => /^Text/.test(c.type) && /^(nom|etablissement|sigle|libelle|commune|uai|identifiant_s_uai|mots_cles)/i.test(c.colId)).map(c => fe.t[c.colId][i]).join(" "))]);
    const chercher = () => {
      const mots = norm(q.value).split(" ").filter(Boolean); if (!mots.length) { ul.hidden = true; return; }
      const res = texte.filter(([, t]) => mots.every(m => t.includes(m))).slice(0, 20);
      ul.innerHTML = res.length ? res.map(([id]) => { const i = fe.pos.get(id), lib = String(fe.t[fe.nomCol][i] ?? ""), n = etat.mc ? etat.mc.sites.filter(x => x.etab === id).length : 0;
        return `<li role="option" data-id="${id}">${esc(lib)}${etat.mc ? ` <span class="aide">· ${n} site${n > 1 ? "s" : ""}</span>` : ""}</li>`; }).join("") : `<li class="aide">Aucun établissement trouvé.</li>`;
      ul.hidden = false;
    };
    q.addEventListener("input", chercher);
    q.addEventListener("blur", () => setTimeout(() => { ul.hidden = true; }, 150));
    q.addEventListener("keydown", ev => { if (ev.key === "Enter") { const li = ul.querySelector("li[data-id]"); if (li) { ev.preventDefault(); choixEtabMc = li.dataset.id; dessiner(); } } });
    ul.addEventListener("mousedown", ev => { const li = ev.target.closest("li[data-id]"); if (li) { ev.preventDefault(); choixEtabMc = li.dataset.id; dessiner(); const z = $("si-fe-q"); if (z) z.scrollIntoView({ block: "nearest" }); } });
    window.FicheEtab.lier(racine, fe, +choixEtabMc, { prefixe: "si-fe-", dire: dire2,
      apresAjout: async (cid, lib) => { await relancer(); const s2 = $("si-fe-statut"); if (s2) { s2.textContent = `Information « ${lib} » ajoutée (colonne ${cid}).`; s2.className = "statut ok"; } } });
  }
  function motsClesHtml(mc) {
    if (!mc) return "";
    const e = choixEtabMc ? { id: +choixEtabMc } : null, liste = e ? mc.sites.filter(x => x.etab === e.id).sort((a, b) => a.nom.localeCompare(b.nom, "fr")) : [];
    if (mc.colMots && !e) return "";
    return `<h3 style="font-size:14px;margin:16px 0 4px">Mots-clés des sites${e && liste.length ? ` (${liste.length})` : ""}</h3>
      <p class="aide">Autres noms sous lesquels les agents désignent un site (bâtiment, ancien nom, sigle, rue…), séparés par des virgules. Dans le formulaire, taper un de ces mots propose le site.
        Les libellés validés ci-dessus servent aussi de mots-clés pour leur établissement.</p>
      ${!mc.colMots ? `<div class="boutons" style="margin-top:4px"><button class="secondaire" id="si-mc-creer">Créer la colonne Mots-clés dans ${esc(mc.table)}</button></div>` : `
      <span class="statut" id="si-mc-statut" role="status"></span>
      ${e && !liste.length ? `<p class="vide">Aucun site de cet établissement au référentiel (widget « Référentiel des sites » pour en ajouter).</p>` : ""}
      ${e && liste.length ? `<div class="sites-defile"><table class="sites-table"><thead><tr><th>Site</th><th>Autres noms (référentiel)</th><th>Mots-clés</th></tr></thead><tbody>
        ${liste.map(x => `<tr><td><strong>${esc(x.nom)}</strong></td><td class="aide">${esc(x.autres.length > 160 ? x.autres.slice(0, 160) + "…" : x.autres)}</td>
          <td><input type="text" class="si-mc" data-id="${x.id}" value="${esc(x.mots)}" placeholder="ex. bât. A, rue Dupont, ancien IUFM" style="width:100%;min-width:220px"></td></tr>`).join("")}
      </tbody></table></div>` : ""}`}`;
  }
  function lierMotsCles() {
    const c = $("si-mc-creer");
    if (c) c.addEventListener("click", async () => {
      c.disabled = true;
      try { await grist.docApi.applyUserActions([["AddColumn", etat.mc.table, "Mots_cles", { type: "Text", isFormula: false, label: "Mots-clés", untieColIdFromLabel: true }]]); await relancer(); }
      catch (e) { c.disabled = false; dire(`Colonne non créée (${e.message || e}).`, true); }
    });
    racine.querySelectorAll(".si-mc").forEach(inp => inp.addEventListener("change", async () => {
      const st = $("si-mc-statut"), v = inp.value.split(/\s*[,;|]\s*/).map(x => x.trim()).filter(Boolean).join(", ");
      try { await grist.docApi.applyUserActions([["UpdateRecord", etat.mc.table, +inp.dataset.id, { [etat.mc.colMots]: v || null }]]);
        inp.value = v; const x = etat.mc.sites.find(y => y.id === +inp.dataset.id); if (x) x.mots = v;
        if (st) { st.textContent = "Mots-clés enregistrés."; st.className = "statut ok"; } }
      catch (e) { if (st) { st.textContent = `Non enregistré (${e.message || e}).`; st.className = "statut err"; } }
    }));
  }

  /* ---------- rendu ---------- */
  function dessiner() {
    if (!racine) return;
    if (!etat) { racine.innerHTML = `${opts.compact ? "" : "<h2>Sites de l'enseignement supérieur</h2>"}<p class="aide">Analyse des sites saisis…</p>`; return; }
    const { ctx, source, ref } = etat;
    const statutDe = gp => gp.alias ? (/cart/i.test(gp.alias.statut) ? "ecarte" : /valid/i.test(gp.alias.statut) ? "valide" : "a_traiter") : "a_traiter";
    const visibles = etat.groupes.filter(gp => filtre === "tous" || statutDe(gp) === filtre);
    const n = k => etat.groupes.filter(gp => statutDe(gp) === k).length;
    racine.innerHTML = `${opts.compact ? "" : "<h2>Sites de l'enseignement supérieur : rapprochement des libellés saisis</h2>"}
      ${opts.compact ? `<details class="aide"><summary>Comment ça marche</summary>` : ""}<p class="aide">Les sites saisis en texte libre (anciens formulaires, « site hors référentiel ») ou restés en ancien nom dans une colonne référence aux sites (cellule rouge dans Grist) sont rattachés à un site du référentiel stabilisé. Les correspondances validées
        (table ${TABLE_ALIAS}) servent à la reprise du dernier état connu de chaque site dans le formulaire par site, et à compléter les saisies (dans une colonne référence, l'ancien nom est remplacé par le site).
        Un site saisi qui manque au référentiel y entre par « + Nouveau site du référentiel » (nom modifiable), ou en cochant les lignes puis « Créer les sites cochés dans le référentiel » :
        le site est créé pour l'établissement, la correspondance validée et les saisies complétées.</p>${opts.compact ? "</details>" : ""}
      ${!ctx.sources.length ? `<p class="vide">Aucune colonne de sites saisis n'a été trouvée (colonne texte ou référence aux sites, dans une sous-table d'une question tableau ou dans la table des réponses).</p>`
        : !ctx.refs.length ? `<p class="vide">Aucun référentiel des sites : une table dont une colonne renvoie vers le référentiel des établissements (le modèle de formulaire « Enseignement supérieur par site » la crée).</p>` : `
      <div class="sites-outils">
        <label>Libellés saisis <select id="si-source">${ctx.sources.map(s => `<option value="${esc(s.cle)}"${source && s.cle === source.cle ? " selected" : ""}>${esc(s.libelle)}</option>`).join("")}</select></label>
        <label>Référentiel des sites <select id="si-ref">${ctx.refs.map(r => `<option value="${esc(r.table)}"${ref && r.table === ref.table ? " selected" : ""}>${esc(r.table)} (${esc(r.nomCol)})</option>`).join("")}</select></label>
        <label>Afficher <select id="si-filtre">${[["a_traiter", `à traiter (${n("a_traiter")})`], ["valide", `validés (${n("valide")})`], ["ecarte", `écartés (${n("ecarte")})`], ["tous", "tous"]].map(([v, l]) => `<option value="${v}"${filtre === v ? " selected" : ""}>${l}</option>`).join("")}</select></label>
      </div>
      <div class="boutons" style="margin-top:0">
        <button class="primaire" id="si-valider">Valider la sélection</button>
        <button class="secondaire" id="si-ecarter">Écarter la sélection</button>
        <button class="secondaire" id="si-creer" title="Pour chaque ligne cochée sans site choisi : crée le site dans le référentiel (nom saisi), valide la correspondance et complète les saisies">Créer les sites cochés dans le référentiel</button>
        <button class="secondaire" id="si-completer" title="Renseigne le site du référentiel sur les lignes qui n'ont qu'un libellé validé (tableaux de sites, colonnes référence aux sites restées en ancien nom)">Compléter les saisies</button>
        <span class="statut" id="si-statut" role="status"></span></div>
      ${visibles.length ? `<div class="sites-defile"><table class="sites-table"><thead><tr><th><input type="checkbox" id="si-tout" aria-label="Tout sélectionner"></th>${opts.compact ? "" : "<th>Établissement</th>"}<th>Libellé saisi</th><th>Site du référentiel</th>${opts.compact ? "" : "<th>Statut</th>"}</tr></thead><tbody>
        ${visibles.map(gp => `<tr data-cle="${esc(gp.cle)}"><td><input type="checkbox" class="si-coche"${statutDe(gp) === "a_traiter" && gp.propose ? " checked" : ""}></td>
          ${opts.compact ? "" : `<td>${esc(gp.nomEtab)}</td>`}<td>${opts.compact ? `<div class="aide">${esc(gp.nomEtab)}</div>` : ""}<strong>${esc(gp.libelle)}</strong> <span class="aide">× ${gp.n}</span>${source.estRef ? ` <span class="pastille manque" title="Référence non résolue : ancien nom gardé en texte dans la cellule">ancien nom</span>` : ""}${contexteHtml(gp.occs)}</td>
          <td><select class="si-site"><option value="">— aucun (hors référentiel)</option>${gp.sites.map(s => `<option value="${s.id}"${s.id === gp.propose ? " selected" : ""}>${esc(s.nom)}</option>`).join("")}<option value="nouveau">+ Nouveau site du référentiel</option></select>
            <input type="text" class="si-nouveau" value="${esc(gp.libelle)}" aria-label="Nom du nouveau site" title="Nom du site créé dans le référentiel" hidden style="width:220px">
            ${!gp.alias && gp.propose ? ` <span class="pastille reco">proposé</span>` : ""}${!gp.sites.length ? ` <span class="aide">aucun site de cet établissement au référentiel</span>` : ""}
          ${opts.compact ? "" : "</td><td>"}${statutDe(gp) === "valide" ? ` <span class="pastille ok">validé</span>` : statutDe(gp) === "ecarte" ? ` <span class="pastille">écarté</span>` : opts.compact ? "" : `<span class="pastille manque">à traiter</span>`}</td></tr>`).join("")}
      </tbody></table></div>` : `<p class="vide">Rien ${filtre === "a_traiter" ? "à traiter" : "à afficher"}.</p>`}`}
      ${opts.compact ? "" : ficheHtml(etat.fe) + motsClesHtml(etat.mc)}`;
    lier(); if (!opts.compact) { lierFiche(); lierMotsCles(); }
  }
  const dire = (t, err) => { const s = $("si-statut"); if (s) { s.textContent = t; s.className = `statut${err ? " err" : " ok"}`; } };
  function lier() {
    const sel = (id, f) => { const e = $(id); if (e) e.addEventListener("change", f); };
    sel("si-source", e => { choixSource = e.target.value; memoriser(); relancer(); });
    sel("si-ref", e => { choixRef = e.target.value; memoriser(); relancer(); });
    sel("si-filtre", e => { filtre = e.target.value; dessiner(); });
    sel("si-tout", e => racine.querySelectorAll(".si-coche").forEach(c => { c.checked = e.target.checked; }));
    racine.querySelectorAll(".si-site").forEach(s => s.addEventListener("change", () => { const tr = s.closest("tr"); tr.querySelector(".si-coche").checked = true;
      const n = tr.querySelector(".si-nouveau"); n.hidden = s.value !== "nouveau"; if (!n.hidden) n.focus(); }));
    const b = (id, f) => { const e = $(id); if (e) e.addEventListener("click", f); };
    b("si-valider", () => ecrire("Validé")); b("si-ecarter", () => ecrire("Écarté"));
    b("si-completer", async () => { const n = await completer(); if (n) { await relancer(); dire(`${n} ligne(s) de saisie complétée(s) avec le site du référentiel.`); if (opts.apresEcriture) await opts.apresEcriture(); } });
    b("si-creer", () => {   // lignes cochées sans site : nouveau site, nom = libellé saisi (modifiable avant)
      const l = [...racine.querySelectorAll("tbody tr")].filter(tr => tr.querySelector(".si-coche").checked);
      if (!l.length) { dire("Cochez les lignes dont le site doit entrer dans le référentiel.", true); return; }
      l.forEach(tr => { const s = tr.querySelector(".si-site"); if (!s.value) { s.value = "nouveau"; tr.querySelector(".si-nouveau").hidden = false; } });
      ecrire("Validé");
    });
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
  /* Site saisi qui devient un site du référentiel : nouvelle ligne de la table des sites, rattachée à l'établissement,
     identifiant SITE-Mnnnn, statut « Validé », source « Saisie », actif ; deux libellés renommés pareil pour le même
     établissement donnent un seul site. Renvoie l'identifiant de ligne du site. */
  async function creerSite(etab, nom, deja) {
    const k = `${etab}|${norm(nom)}`; if (deja.has(k)) return deja.get(k);
    const r = etat.ref, tm = meta[r.table], cols = Object.values(tm.colonnes).filter(c => !c.isFormula), c = re => (cols.find(x => re.test(x.colId)) || {}).colId || null;
    const existant = (etat.mc && etat.mc.sites || []).find(x => x.etab === etab && norm(x.nom) === norm(nom));
    if (existant) { deja.set(k, existant.id); return existant.id; }
    const cId = c(/^site_?id$/i), cStatut = c(/^statut$/i), cSource = c(/^source$/i), cActif = (cols.find(x => /^actif$/i.test(x.colId) && x.type === "Bool") || {}).colId;
    const f = { [r.nomCol]: nom, [r.etabCol]: etab };
    if (cId) { const t = await grist.docApi.fetchTable(r.table), n = (t[cId] || []).map(v => (/^SITE-M(\d+)$/.exec(String(v || "")) || [])[1]).filter(Boolean).map(Number);
      f[cId] = `SITE-M${String(Math.max(0, ...n) + 1).padStart(4, "0")}`; }   // table relue : les sites créés juste avant comptent
    const acts = [];
    for (const [col, v] of [[cStatut, "Validé"], [cSource, "Saisie"]]) {
      if (!col) continue; f[col] = v;
      const m = tm.colonnes[col]; if (!/^Choice/.test(m.type)) continue;
      let o = {}; try { o = JSON.parse(m.widgetOptions || "{}") || {}; } catch (_) { o = {}; }
      const ch = Array.isArray(o.choices) ? o.choices : []; if (!ch.includes(v)) { o.choices = ch.concat([v]); m.widgetOptions = JSON.stringify(o); acts.push(["ModifyColumn", r.table, col, { widgetOptions: m.widgetOptions }]); }
    }
    if (cActif) f[cActif] = true;
    if (acts.length) await grist.docApi.applyUserActions(acts);
    const res = await grist.docApi.applyUserActions([["AddRecord", r.table, null, f]]);
    const id = res && res.retValues ? res.retValues[0] : null;
    deja.set(k, id); return id;
  }
  async function ecrire(statut) {
    const lignes = [...racine.querySelectorAll("tbody tr")].filter(tr => tr.querySelector(".si-coche").checked);
    if (!lignes.length) { dire("Cochez au moins une ligne.", true); return; }
    try {
      await tableAlias();
      const acts = [], crees = new Map();
      let sansSite = 0;
      for (const tr of lignes) {
        const gp = etat.groupes.find(x => x.cle === tr.dataset.cle); if (!gp) continue;
        let site = +tr.querySelector(".si-site").value || 0;
        if (statut === "Validé" && tr.querySelector(".si-site").value === "nouveau") {
          const nom = tr.querySelector(".si-nouveau").value.trim() || gp.libelle;
          site = await creerSite(gp.etab, nom, crees) || 0;
        }
        if (statut === "Validé" && !site) { sansSite++; continue; }
        const f = { Etablissement: gp.etab, Libelle: gp.libelle, Site: statut === "Validé" ? site : (site || 0), Occurrences: gp.n, Statut: statut };
        acts.push(gp.alias ? ["UpdateRecord", TABLE_ALIAS, gp.alias.id, f] : ["AddRecord", TABLE_ALIAS, null, f]);
      }
      for (let k = 0; k < acts.length; k += 400) await grist.docApi.applyUserActions(acts.slice(k, k + 400));
      // correspondances validées : les lignes qui portent ces libellés renvoient aussitôt vers leur site
      // (tableaux de sites ; colonne référence aux sites : l'ancien nom est remplacé par le site)
      const nCompletees = statut === "Validé" ? await completer(true) : 0;
      await relancer();
      if (opts.apresEcriture) await opts.apresEcriture();
      dire(`${acts.length} correspondance(s) ${statut === "Validé" ? "validée(s)" : "écartée(s)"}${crees.size ? `, ${crees.size} site(s) créé(s) dans le référentiel` : ""}${statut === "Validé" ? `, ${nCompletees} ligne(s) de saisie complétée(s)` : ""}.${sansSite ? ` ${sansSite} ligne(s) sans site choisi, laissée(s) de côté.` : ""}`);
    } catch (e) { dire(`Écriture refusée par Grist (${e.message || e}).`, true); }
  }
  // lignes des tableaux de sites (formulaires publiés) : site vide, libellé validé → site du référentiel
  async function completer(silencieux) {
    try {
      const cfg = await S.lireConfig(), g = S.general(cfg), tf = await grist.docApi.fetchTable(g.formulaires || "Formulaires");
      const reglages = [];
      tf.id.forEach((_, i) => { let c = null; try { c = JSON.parse(tf.Publie[i] || "null"); } catch (_) { c = null; }
        ((c && c.blocs) || []).forEach(b => { const t = b.reglages && b.reglages.tableau; if (t && t.table && t.sites && t.sites.site && t.sites.libre) reglages.push({ rep: tf.Table[i], ...t }); }); });
      // colonnes référence aux sites (même référentiel que la table des correspondances) : anciens noms à remplacer
      const tSitesAlias = meta[TABLE_ALIAS] && meta[TABLE_ALIAS].colonnes.Site ? S.cibleRef(meta[TABLE_ALIAS].colonnes.Site.type) : null;
      const sourcesRef = contexte(cfg).sources.filter(x => x.estRef && x.cible === tSitesAlias);
      if (!reglages.length && !sourcesRef.length) { if (!silencieux) dire("Aucun tableau de sites dans les formulaires publiés, ni colonne référence aux sites.", true); return 0; }
      if (!meta[TABLE_ALIAS]) { if (!silencieux) dire("Aucune correspondance validée pour l'instant.", true); return 0; }
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
      for (const src of sourcesRef) {
        const ts = await grist.docApi.fetchTable(src.table), trep = src.viaDossier ? await grist.docApi.fetchTable(src.rep) : ts, idx = new Map(trep.id.map((id, i) => [id, i]));
        const acts = [];
        ts.id.forEach((id, i) => {
          const v = ts[src.col][i]; if (typeof v === "number") return;
          const lib = texteDe(v).trim(); if (!lib) return;
          const k = src.viaDossier ? idx.get(refId(ts[src.viaDossier][i])) : i, e = k === undefined ? null : refId(trep[src.etab.col][k]);
          const s = alias.get(`${e || 0}|${norm(lib)}`); if (s) acts.push(["UpdateRecord", src.table, id, { [src.col]: s }]);
        });
        for (let k = 0; k < acts.length; k += 400) await grist.docApi.applyUserActions(acts.slice(k, k + 400));
        n += acts.length;
      }
      if (!silencieux) dire(`${n} ligne(s) de saisie complétée(s) avec le site du référentiel.`);
      return n;
    } catch (e) { if (!silencieux) dire(`Échec : ${e.message || e}`, true); return 0; }
  }

  async function relancer() {
    try { const cfg = await S.lireConfig(); etat = cfg ? await analyser(cfg) : null; } catch (e) { etat = null; racine.innerHTML = `${opts.compact ? "" : "<h2>Sites de l'enseignement supérieur</h2>"}<p class="statut err">Analyse impossible : ${esc(e.message || e)}</p>`; return; }
    dessiner();
  }
  async function afficher(o) {
    opts = o || {}; racine = opts.racine || $("ref-sites"); if (!racine) return;
    etat = null; dessiner(); await relancer();
  }
  window.OngletSitesESR = { afficher, colsContexte, occurrence, contexteHtml };
})();
