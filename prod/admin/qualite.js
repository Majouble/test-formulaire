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

  const Q = window.QualiteMoteur, TYPES = Q.TYPES, GRAVITES = Q.GRAVITES, dateFr = Q.dateFr, genreSection = Q.genreSection;

  let racine = null, config = null, etat = null, filtre = { type: "", statut: "a_traiter", espace: "" }, enCours = false;
  try { filtre = { ...filtre, ...JSON.parse(localStorage.getItem("socle-v2-qualite") || "{}") }; } catch (_) { /* stockage indisponible */ }
  const memoriser = () => { try { localStorage.setItem("socle-v2-qualite", JSON.stringify(filtre)); } catch (_) { /* stockage indisponible */ } };
  const statuts = () => ((config && config.valeurs.qualite) || {}).statuts || {};

  const analyser = async () => { const r = await Q.analyser(); if (r.config) config = r.config; return r; };

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
        Corrigez avec l'action proposée, ou marquez « vérifié » ce qui est correct : l'anomalie ne revient pas tant que les dossiers en cause ne changent pas.
        Pour corriger sur place (placer un établissement, modifier sa fiche, la qualification ou la description d'un dossier, rattacher un dossier à un autre établissement) :
        widget « Référentiel des sites », vue « À vérifier » (mêmes anomalies, mêmes statuts).</p>
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
    $("qa-relancer").addEventListener("click", () => { if (S.viderCacheLecture) S.viderCacheLecture(); relancer(); });
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
      config = await Q.marquer(liste, s, note); dessiner();
      dire(s ? `${liste.length} anomalie(s) ${s === "corrige" ? "corrigée(s)" : "marquée(s) vérifiée(s)"}.` : "Anomalie rouverte.");
    } catch (e) { dire(`Écriture refusée par Grist (${e.message || e}).`, true); }
  }
  // rattachement d'une section : toutes les versions du dossier passent sur l'établissement proposé ; les colonnes
  // recopiées du référentiel (non formules) sont mises à jour avec lui
  async function corriger(liste) {
    try {
      const n = await Q.rattacher(etat, liste); if (!n) return;
      await marquer(liste, "corrige", "rattaché à l'établissement");
      await relancer(`${liste.length} signalement(s) rattaché(s) à leur établissement (${n} ligne(s) modifiée(s)).`);
    } catch (e) { dire(`Correction refusée par Grist (${e.message || e}).`, true); }
  }

  async function relancer(message) {
    if (enCours) return; enCours = true;
    try { etat = await analyser(); } catch (e) { etat = { erreur: `Analyse impossible : ${e.message || e}` }; }
    enCours = false; dessiner(); if (message) dire(message);
  }
  async function afficher() {
    racine = $("qualite"); etat = null; dessiner();
    if (S.viderCacheLecture) S.viderCacheLecture();   // corrections faites ailleurs (widget des sites, formulaires) : relues
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
