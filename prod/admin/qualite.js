/* =====================================================================
   Administration v2 — onglet « À vérifier » : contrôle qualité des signalements
   ---------------------------------------------------------------------
   Analyse les tables des réponses (chaque champ suivi) et liste les anomalies, de la plus grave à la moins grave :
   - section d'établissement (SEGPA, SEP, SGT, SES) choisie au lieu de l'établissement : rattachement proposé
     à l'établissement voisin (même adresse ou presque, type attendu), en un clic ou pour toutes d'un coup ;
   - doublons probables : même établissement (une section comptant pour son établissement), même jour et même site,
     dans des dossiers différents ; ou à un jour d'écart avec une description proche ;
   - versions d'un dossier sur un autre établissement que le dossier ;
   - établissement absent, sans coordonnées (absent de la carte et de l'atlas), hors des académies couvertes ;
   - qualification manquante sur la dernière version ; description d'essai ou vide.
   Chaque anomalie peut être marquée « vérifiée » (elle ne revient pas tant que les dossiers en cause ne changent pas)
   ou corrigée par l'action proposée. Statuts dans la clé « qualite » de Config.
   ===================================================================== */
(function () {
  "use strict";
  const S = window.Socle;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const refId = v => typeof v === "number" ? v : (v && typeof v === "object" && "rowId" in v) ? v.rowId : (Array.isArray(v) && v[0] === "R") ? v[2] : null;
  const texte = v => v == null ? "" : Array.isArray(v) ? (v[0] === "L" ? v.slice(1) : v).join(", ") : String(v);
  const MAJ = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();

  /* ---------- types d'anomalies : ordre d'affichage, gravité, explication ---------- */
  const TYPES = {
    section: { titre: "Section ou composante choisie au lieu de l'établissement", gravite: 3,
      aide: "SEGPA, SEP, SGT ou SES font partie d'un collège ou d'un lycée ; IUT, INSPÉ, écoles internes, sites et campus font partie d'une université ou d'un établissement (colonne Rattachement du référentiel) : le signalement doit porter sur l'établissement, sinon il est compté à part (et souvent deux fois)." },
    doublon: { titre: "Doublons probables", gravite: 3,
      aide: "Plusieurs dossiers pour le même établissement le même jour (une section compte pour son établissement) : les chiffres et la carte comptent l'établissement plusieurs fois. Si les faits sont bien distincts, marquez « vérifié »." },
    dossier: { titre: "Dossier sur plusieurs établissements", gravite: 3,
      aide: "Une version du dossier porte sur un autre établissement que le dossier : elle n'est comptée nulle part correctement." },
    sans_etab: { titre: "Établissement absent", gravite: 3, aide: "Signalement sans établissement : il n'apparaît ni dans les comptes par académie ni sur la carte." },
    voisin: { titre: "Doublons possibles (jours voisins)", gravite: 2,
      aide: "Même établissement, à un jour d'écart, avec une description très proche : souvent la même affaire saisie deux fois." },
    sans_coord: { titre: "Établissement sans coordonnées", gravite: 2, aide: "Sans latitude ni longitude, l'établissement manque sur la carte et dans l'atlas." },
    hors_perimetre: { titre: "Établissement hors des académies couvertes", gravite: 2,
      aide: "Souvent un homonyme choisi dans une autre académie (« Collège Jean Moulin »…). Vérifiez la commune." },
    sans_qualif: { titre: "Qualification manquante", gravite: 2, aide: "La dernière version n'a pas de qualification : elle échappe aux comptes et aux filtres." },
    essai: { titre: "Saisie d'essai ou description vide", gravite: 1, aide: "Description vide, très courte ou de test (« test », « xxx »…)." },
  };
  const GRAVITES = { 3: ["haute", "Haute"], 2: ["moyenne", "Moyenne"], 1: ["basse", "Basse"] };

  let racine = null, config = null, etat = null, filtre = { type: "", statut: "a_traiter", espace: "" }, enCours = false;
  try { filtre = { ...filtre, ...JSON.parse(localStorage.getItem("socle-v2-qualite") || "{}") }; } catch (_) { /* stockage indisponible */ }
  const memoriser = () => { try { localStorage.setItem("socle-v2-qualite", JSON.stringify(filtre)); } catch (_) { /* stockage indisponible */ } };
  const statuts = () => ((config && config.valeurs.qualite) || {}).statuts || {};

  /* ---------- sections d'établissement : règles communes au widget de saisie (socle) ---------- */
  const genreSection = (...a) => S.genreSection(...a);

  /* ---------- lecture et analyse d'un champ (table des réponses + référentiel) ---------- */
  async function texteRef(type, ids) {
    const cible = S.cibleRef(type); if (!cible) return null;
    try { const t = await grist.docApi.fetchTable(cible), c = Object.keys(t).find(k => k !== "id" && k !== "manualSort" && (t[k] || []).some(x => typeof x === "string"));
      const lib = new Map(t.id.map((id, i) => [id, c ? t[c][i] : String(id)])); return v => lib.get(refId(v)) || ""; } catch (_) { return null; }
  }
  async function analyserEspace(e, meta, g) {
    const tMeta = meta[e.reponses]; if (!tMeta) return null;
    const assoc = e.reponses === g.reponses ? ((config.valeurs.roles || {}).reponses || {}) : {};
    const rr = S.resoudreRoles("reponses", tMeta, { reponses: e.reponses, referentiel: e.referentiel }, assoc, {});
    const c = r => rr[r] && rr[r].col;
    const colEtab = c("Etablissement"), refTable = colEtab ? S.cibleRef(tMeta.colonnes[colEtab].type) : null;
    const t = await grist.docApi.fetchTable(e.reponses);
    const v = (col, i) => col ? (t[col] || [])[i] : null;
    // référentiel : établissements cités, leurs sections et voisins
    let ref = null, rc = {};
    if (refTable && meta[refTable]) {
      const assocRef = e.referentiel === g.referentiel ? ((config.valeurs.roles || {}).referentiel || {}) : {};
      const rf = S.resoudreRoles("referentiel", meta[refTable], { reponses: e.reponses, referentiel: refTable }, assocRef, {});
      ["Nom", "UAI", "Type", "Libelle_nature", "Commune", "Academie", "Latitude", "Longitude"].forEach(k => { if (rf[k] && rf[k].col) rc[k] = rf[k].col; });
      ref = await grist.docApi.fetchTable(refTable);
      // référentiel ESR : composantes et sites rattachés à leur établissement (colonne Rattachement), niveau
      const cR = Object.values(meta[refTable].colonnes).find(x => x.type === `Ref:${refTable}` && /rattach|parent/i.test(x.colId));
      if (cR) rc.Rattachement = cR.colId;
      if (meta[refTable].colonnes.Niveau) rc.Niveau = "Niveau";
      const lireAca = rc.Academie && /^Ref:/.test(meta[refTable].colonnes[rc.Academie].type) ? await texteRef(meta[refTable].colonnes[rc.Academie].type) : null;
      ref.__aca = lireAca;
    }
    const idxRef = new Map(ref ? ref.id.map((id, i) => [id, i]) : []);
    const etabInfo = new Map();
    const info = id => {
      if (id == null) return null;
      if (etabInfo.has(id)) return etabInfo.get(id);
      const i = idxRef.get(id); let x = null;
      if (i !== undefined) {
        const val = k => rc[k] ? ref[rc[k]][i] : null;
        const lat = +val("Latitude"), lon = +val("Longitude");
        x = { id, nom: texte(val("Nom")), uai: texte(val("UAI")).trim(), type: texte(val("Type")), nature: texte(val("Libelle_nature")), commune: texte(val("Commune")),
          aca: ref.__aca ? ref.__aca(val("Academie")) : texte(val("Academie")), lat: isFinite(lat) && lat ? lat : null, lon: isFinite(lon) && lon ? lon : null };
        x.section = genreSection(x.nature, x.type, x.nom);
        x.rattId = rc.Rattachement ? refId(ref[rc.Rattachement][i]) : null;
        if (x.rattId && x.rattId !== id && !x.section) x.section = texte(val("Niveau")) || "Composante";
      }
      etabInfo.set(id, x); return x;
    };
    // établissement de rattachement d'une section : candidats voisins (grille de 0,01°) ou de la même commune
    let grille = null;
    const parent = x => {
      if (!x || !x.section || !ref) return null;
      if (x.parent !== undefined) return x.parent;
      if (x.rattId) {   // composante : établissement de rattachement (en remontant les composantes de composantes)
        const vus = new Set([x.id]); let p = info(x.rattId);
        while (p && p.rattId && !vus.has(p.rattId) && info(p.rattId)) { vus.add(p.id); p = info(p.rattId); }
        x.parent = p && p.id !== x.id ? p : null; x.parentDistance = null; return x.parent;
      }
      if (!grille && rc.Latitude && rc.Longitude) {
        grille = new Map();
        ref.id.forEach((id, i) => { const lat = +ref[rc.Latitude][i], lon = +ref[rc.Longitude][i]; if (!lat || !lon) return;
          const k = `${Math.floor(lat * 100)}|${Math.floor(lon * 100)}`; if (!grille.has(k)) grille.set(k, []); grille.get(k).push(id); });
      }
      const ids = [];
      if (x.lat != null && grille) {
        const la = Math.floor(x.lat * 100), lo = Math.floor(x.lon * 100);
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) (grille.get(`${la + a}|${lo + b}`) || []).forEach(id => ids.push(id));
      } else if (rc.Commune) ref.id.forEach((id, i) => { if (MAJ(ref[rc.Commune][i]) === MAJ(x.commune)) ids.push(id); });
      const r = S.rattachementSection(x, ids.map(info));
      x.parent = r ? r.etab : null; x.parentDistance = r ? r.distance : null;
      return x.parent;
    };

    // dossiers : versions regroupées par dossier (Dossier, sinon la ligne elle-même)
    const typeFaits = c("Date_faits") ? tMeta.colonnes[c("Date_faits")].type : "";
    const jourDe = s => { if (typeof s !== "number") return ""; const d = new Date(s * 1000);
      return /^DateTime/.test(typeFaits) || !typeFaits ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : d.toISOString().slice(0, 10); };
    const lignes = t.id.map((id, i) => ({ id, i, etab: refId(v(colEtab, i)), dossier: refId(v(c("Dossier"), i)) || id, dv: v(c("Derniere_version"), i),
      qualif: texte(v(c("Qualification"), i)).trim(), desc: texte(v(c("Description"), i)).trim(), faits: v(c("Date_faits"), i), cree: v(c("Cree_le"), i),
      site: c("Site") ? MAJ(v(c("Site"), i)) : "", auteur: texte(v(c("Auteur"), i)) }));
    const dossiers = new Map();
    lignes.forEach(l => { if (!dossiers.has(l.dossier)) dossiers.set(l.dossier, []); dossiers.get(l.dossier).push(l); });
    const fiches = [];
    for (const [id, ls] of dossiers) {
      ls.sort((a, b) => (a.cree || 0) - (b.cree || 0) || a.id - b.id);
      const initiale = ls.find(l => l.id === id) || ls[0], derniere = ls.find(l => l.dv === true) || ls[ls.length - 1];
      fiches.push({ id, lignes: ls, initiale, derniere, etab: initiale.etab, jour: jourDe(derniere.faits || initiale.faits || derniere.cree), site: derniere.site || initiale.site });
    }
    const anomalies = [], ajouter = (type, dossiersEnCause, titre, detail, extra = {}) => {
      const ids = [...new Set(dossiersEnCause.map(f => f.id))].sort((a, b) => a - b);
      anomalies.push({ type, gravite: extra.gravite || TYPES[type].gravite, espace: e, cle: `${type}|${e.reponses}|${ids.join(",")}`, fiches: dossiersEnCause, titre, detail, ...extra });
    };
    const libEtab = x => x ? `${x.nom || "?"}${x.uai ? ` (${x.uai})` : ""}${x.commune ? ` — ${x.commune}` : ""}` : "établissement inconnu";
    const academies = new Set((g.academies || []).map(a => MAJ(a)));
    for (const f of fiches) {
      const x = info(f.etab);
      if (!colEtab) break;
      if (f.etab == null) { ajouter("sans_etab", [f], "Signalement sans établissement", ""); continue; }
      // versions sur un autre établissement que le dossier
      const autres = f.lignes.filter(l => l.etab != null && l.etab !== f.etab);
      if (autres.length) ajouter("dossier", [f], `Dossier sur ${libEtab(x)}`, `${autres.length} version(s) sur ${[...new Set(autres.map(l => libEtab(info(l.etab))))].join(", ")}.`);
      if (x && x.section) {
        const p = parent(x);
        ajouter("section", [f], `${x.section} : ${libEtab(x)}`, p ? `Établissement de rattachement${x.rattId ? "" : " probable"} : ${libEtab(p)}${x.parentDistance != null ? ` (à ${Math.round(x.parentDistance)} m)` : ""}.` : "Aucun établissement de rattachement trouvé à proximité : à corriger à la main.",
          { action: p ? { genre: "rattacher", vers: p.id, libelle: `Rattacher à ${p.nom || p.uai}` } : null });
      }
      if (x && (x.lat == null || x.lon == null)) ajouter("sans_coord", [f], libEtab(x), "Latitude ou longitude manquante dans le référentiel.");
      if (x && academies.size && x.aca && !academies.has(MAJ(x.aca))) ajouter("hors_perimetre", [f], libEtab(x), `Académie : ${x.aca}.`);
      if (c("Qualification") && !f.derniere.qualif) ajouter("sans_qualif", [f], libEtab(x), "Dernière version sans qualification.");
      if (c("Description")) { const d = f.derniere.desc;
        if (!d || d.length < 8 || /^(test|essai|xx+|aa+|azert|qsd|bla|toto)\b/i.test(d)) ajouter("essai", [f], libEtab(x), d ? `Description : « ${d.slice(0, 60)} »` : "Description vide."); }
    }
    // doublons : même établissement effectif (section → établissement), même jour, même site
    const effectif = f => { const x = info(f.etab); const p = x && x.section ? parent(x) : null; return p ? p.id : f.etab; };
    const groupes = new Map();
    fiches.filter(f => f.etab != null && f.jour).forEach(f => { const k = `${effectif(f)}|${f.jour}|${f.site}`; if (!groupes.has(k)) groupes.set(k, []); groupes.get(k).push(f); });
    for (const gr of groupes.values()) {
      if (gr.length < 2) continue;
      const avecSection = gr.some(f => (info(f.etab) || {}).section);
      ajouter("doublon", gr, `${gr.length} dossiers pour ${libEtab(info(effectif(gr[0])))} le ${dateFr(gr[0].jour)}`,
        avecSection ? "Dont une section de l'établissement : l'établissement est compté deux fois." : "Même établissement, même jour.", {});
    }
    // jours voisins : même établissement effectif, un jour d'écart, descriptions proches
    const parEtab = new Map();
    fiches.filter(f => f.etab != null && f.jour).forEach(f => { const k = effectif(f); if (!parEtab.has(k)) parEtab.set(k, []); parEtab.get(k).push(f); });
    for (const l of parEtab.values()) {
      if (l.length < 2) continue;
      l.sort((a, b) => a.jour.localeCompare(b.jour));
      for (let a = 0; a < l.length; a++) for (let b = a + 1; b < l.length; b++) {
        const ecart = (Date.parse(l[b].jour) - Date.parse(l[a].jour)) / 86400000;
        if (ecart > 1) break;
        if (ecart !== 1) continue;
        const sim = similarite(l[a].derniere.desc, l[b].derniere.desc);
        if (sim >= 0.6) ajouter("voisin", [l[a], l[b]], `${libEtab(info(effectif(l[a])))} : ${dateFr(l[a].jour)} et ${dateFr(l[b].jour)}`, `Descriptions semblables à ${Math.round(sim * 100)} %.`);
      }
    }
    return { espace: e, anomalies, nbDossiers: fiches.length, colonnes: { etab: colEtab, rr, tMeta, rc, refTable }, info, libEtab };
  }
  function similarite(a, b) {
    const m = s => new Set(MAJ(s).split(" ").filter(w => w.length > 2));
    const x = m(a), y = m(b); if (!x.size || !y.size) return 0;
    const communs = [...x].filter(w => y.has(w)).length; return communs / (x.size + y.size - communs);
  }
  const dateFr = iso => iso ? new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }) : "date inconnue";

  async function analyser() {
    config = await S.lireConfig();
    if (!config) return { erreur: "La table Config est absente : lancez d'abord l'installation." };
    const g = S.general(config), meta = await S.lireMeta(), res = [];
    for (const e of S.espaces(g)) { const r = await analyserEspace(e, meta, g); if (r) res.push(r); }
    return { espaces: res, le: Date.now() };
  }

  /* ---------- rendu ---------- */
  const statutDe = a => (statuts()[a.cle] || {}).s || "";
  function visibles() {
    return etat.espaces.filter(x => !filtre.espace || x.espace.reponses === filtre.espace).flatMap(x => x.anomalies)
      .filter(a => !filtre.type || a.type === filtre.type)
      .filter(a => filtre.statut === "tous" || (filtre.statut === "traites" ? !!statutDe(a) : !statutDe(a)));
  }
  function compteATraiter() { return etat && etat.espaces ? etat.espaces.flatMap(x => x.anomalies).filter(a => !statutDe(a)).length : 0; }
  function majBadge() {
    const b = document.querySelector('nav button[data-onglet="qualite"]'); if (!b) return;
    const n = compteATraiter(); b.innerHTML = `À vérifier${n ? ` <span class="qa-badge">${n}</span>` : ""}`;
  }
  function dessiner() {
    if (!etat) { racine.innerHTML = `<div class="bandeau info">Analyse des signalements…</div>`; return; }
    if (etat.erreur) { racine.innerHTML = `<div class="bandeau alerte">${esc(etat.erreur)}</div>`; return; }
    majBadge();
    const toutes = etat.espaces.flatMap(x => x.anomalies), liste = visibles();
    const parType = Object.keys(TYPES).map(k => ({ k, l: liste.filter(a => a.type === k) })).filter(x => x.l.length);
    const nbType = k => toutes.filter(a => a.type === k && (filtre.statut === "tous" || (filtre.statut === "traites" ? !!statutDe(a) : !statutDe(a)))).length;
    const sectionsCorrigibles = liste.filter(a => a.type === "section" && a.action && !statutDe(a));
    racine.innerHTML = `<section class="carte">
      <h2>À vérifier</h2>
      <p class="aide">Contrôle des signalements enregistrés : sections ou composantes choisies au lieu de l'établissement, doublons, établissements mal identifiés, champs manquants.
        Corrigez avec l'action proposée, ou marquez « vérifié » ce qui est correct : l'anomalie ne revient pas tant que les dossiers en cause ne changent pas.</p>
      <div class="qa-outils">
        ${etat.espaces.length > 1 ? `<label>Champ <select id="qa-espace"><option value="">tous</option>${etat.espaces.map(x => `<option value="${esc(x.espace.reponses)}"${filtre.espace === x.espace.reponses ? " selected" : ""}>${esc(x.espace.libelle || x.espace.champ)}</option>`).join("")}</select></label>` : ""}
        <label>Contrôle <select id="qa-type"><option value="">tous</option>${Object.entries(TYPES).map(([k, t]) => `<option value="${k}"${filtre.type === k ? " selected" : ""}>${esc(t.titre)} (${nbType(k)})</option>`).join("")}</select></label>
        <label>Statut <select id="qa-statut">${[["a_traiter", "à traiter"], ["traites", "vérifiés ou corrigés"], ["tous", "tous"]].map(([v, l]) => `<option value="${v}"${filtre.statut === v ? " selected" : ""}>${l}</option>`).join("")}</select></label>
        <button type="button" class="secondaire" id="qa-relancer">Relancer l'analyse</button>
        <span class="aide">${etat.espaces.map(x => `${x.nbDossiers} dossier(s)${etat.espaces.length > 1 ? ` (${esc(x.espace.libelle || x.espace.champ)})` : ""}`).join(", ")} analysés à ${new Date(etat.le).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}.</span>
      </div>
      ${sectionsCorrigibles.length > 1 ? `<div class="qa-lot"><button type="button" class="primaire" id="qa-tout-rattacher">Rattacher les ${sectionsCorrigibles.length} sections et composantes à leur établissement</button>
        <span class="aide">Chaque dossier passe sur l'établissement proposé, toutes versions comprises. Vérifiez la liste avant.</span></div>` : ""}
      <span class="statut" id="qa-statut-msg" role="status"></span>
      ${parType.length ? parType.map(({ k, l }) => `<div class="qa-groupe"><h3>${esc(TYPES[k].titre)} <span class="pastille">${l.length}</span></h3>
          <p class="aide">${esc(TYPES[k].aide)}</p>
          <ul class="qa-liste">${l.sort((a, b) => b.gravite - a.gravite).map(carteAnomalie).join("")}</ul></div>`).join("")
        : `<p class="vide">${filtre.statut === "a_traiter" ? "Rien à vérifier." : "Aucune anomalie."}</p>`}
    </section>`;
    lier();
  }
  function carteAnomalie(a) {
    const st = statuts()[a.cle], g = GRAVITES[a.gravite];
    const fiches = a.fiches.map(f => { const d = f.derniere;
      return `<li>Dossier n° ${f.id} · ${esc(dateFr(f.jour))}${d.qualif ? ` · ${esc(d.qualif)}` : ""}${d.auteur ? ` · <span class="aide">${esc(d.auteur)}</span>` : ""}${d.desc ? `<br><span class="qa-extrait">${esc(d.desc.slice(0, 160))}${d.desc.length > 160 ? "…" : ""}</span>` : ""}</li>`; }).join("");
    return `<li class="qa-item${st ? " traite" : ""}" data-cle="${esc(a.cle)}">
      <div class="qa-tete"><span class="pastille qa-${g[0]}">${g[1]}</span> <strong>${esc(a.titre)}</strong></div>
      ${a.detail ? `<div class="qa-detail">${esc(a.detail)}</div>` : ""}
      <ul class="qa-fiches">${fiches}</ul>
      <div class="qa-actions">
        ${st ? `<span class="pastille ok">${st.s === "corrige" ? "corrigé" : "vérifié"} le ${new Date(st.le * 1000).toLocaleDateString("fr-FR")}</span>${st.note ? ` <span class="aide">${esc(st.note)}</span>` : ""} <button type="button" class="lien-btn" data-rouvrir>Rouvrir</button>`
          : `${a.action ? `<button type="button" class="primaire petit" data-corriger>${esc(a.action.libelle)}</button>` : ""}
             <button type="button" class="secondaire petit" data-verifie>${a.type === "doublon" || a.type === "voisin" ? "Faits distincts : vérifié" : "Vérifié, c'est correct"}</button>`}
      </div></li>`;
  }
  function lier() {
    const sel = (id, k) => { if ($(id)) $(id).addEventListener("change", e => { filtre[k] = e.target.value; memoriser(); dessiner(); }); };
    sel("qa-espace", "espace"); sel("qa-type", "type"); sel("qa-statut", "statut");
    $("qa-relancer").addEventListener("click", () => relancer());
    if ($("qa-tout-rattacher")) $("qa-tout-rattacher").addEventListener("click", async () => {
      const l = visibles().filter(a => a.type === "section" && a.action && !statutDe(a));
      if (!confirm(`Rattacher ${l.length} signalement(s) à l'établissement proposé ?`)) return;
      await corriger(l);
    });
    racine.querySelectorAll(".qa-item").forEach(li => {
      const a = etat.espaces.flatMap(x => x.anomalies).find(x => x.cle === li.dataset.cle); if (!a) return;
      const b = (s, fn) => { const x = li.querySelector(s); if (x) x.addEventListener("click", fn); };
      b("[data-verifie]", () => marquer([a], "ok"));
      b("[data-rouvrir]", () => marquer([a], null));
      b("[data-corriger]", () => corriger([a]));
    });
  }
  const dire = (t, err) => { const s = $("qa-statut-msg"); if (s) { s.textContent = t; s.className = `statut${err ? " err" : " ok"}`; } };

  /* ---------- écritures ---------- */
  async function marquer(liste, s, note) {
    try {
      config = await S.lireConfig();
      const q = { ...((config.valeurs.qualite) || {}) }, st = { ...(q.statuts || {}) };
      liste.forEach(a => { if (s) st[a.cle] = { s, le: Math.round(Date.now() / 1000), ...(note ? { note } : {}) }; else delete st[a.cle]; });
      await S.ecrireConfig("qualite", { ...q, statuts: st });
      config = await S.lireConfig(); dessiner();
      dire(s ? `${liste.length} anomalie(s) ${s === "corrige" ? "corrigée(s)" : "marquée(s) vérifiée(s)"}.` : "Anomalie rouverte.");
    } catch (e) { dire(`Écriture refusée par Grist (${e.message || e}).`, true); }
  }
  // rattachement d'une section : toutes les versions du dossier passent sur l'établissement proposé ; les colonnes
  // recopiées du référentiel (non formules) sont mises à jour avec lui
  async function corriger(liste) {
    const acts = [];
    for (const a of liste) {
      if (!a.action || a.action.genre !== "rattacher") continue;
      const esp = etat.espaces.find(x => x.espace === a.espace), C = esp.colonnes, y = esp.info(a.action.vers);
      const copies = {};
      for (const [role, cleRef] of [["Nom", "nom"], ["UAI", "uai"], ["Type", "type"], ["Commune", "commune"]]) {
        const col = C.rr[role] && C.rr[role].col, m = col && C.tMeta.colonnes[col];
        if (m && !m.isFormula && /^(Text|Choice)$/.test(m.type)) copies[col] = y[cleRef];
      }
      a.fiches.forEach(f => f.lignes.filter(l => l.etab === f.etab).forEach(l => acts.push(["UpdateRecord", a.espace.reponses, l.id, { [C.etab]: a.action.vers, ...copies }])));
    }
    if (!acts.length) return;
    try {
      await grist.docApi.applyUserActions(acts);
      await marquer(liste, "corrige", "rattaché à l'établissement");
      await relancer(`${liste.length} signalement(s) rattaché(s) à leur établissement (${acts.length} ligne(s) modifiée(s)).`);
    } catch (e) { dire(`Correction refusée par Grist (${e.message || e}).`, true); }
  }

  async function relancer(message) {
    if (enCours) return; enCours = true;
    try { etat = await analyser(); } catch (e) { etat = { erreur: `Analyse impossible : ${e.message || e}` }; }
    enCours = false; dessiner(); if (message) dire(message);
  }
  async function afficher() {
    racine = $("qualite"); etat = null; dessiner();
    while (enCours) await new Promise(r => setTimeout(r, 200));   // analyse d'arrière-plan en cours : on l'attend
    await relancer();
  }
  // compte affiché sur l'onglet dès l'ouverture de l'administration (analyse en arrière-plan, sans rendu)
  async function compter() {
    if (etat || enCours) return;
    try { enCours = true; const r = await analyser(); if (!etat) etat = r; } catch (_) { /* compté à l'ouverture de l'onglet */ } finally { enCours = false; }
    if (etat && !etat.erreur) majBadge();
  }
  window.OngletQualite = { afficher, compter, genreSection };
})();
