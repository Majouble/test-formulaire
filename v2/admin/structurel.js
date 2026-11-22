/* =====================================================================
   Administration v2 — onglet « Référentiel », carte « Données demandées aux services » (2.62.0-alpha.34)
   ---------------------------------------------------------------------
   Données structurelles dont le national ne dispose pas (référent sûreté, dernier exercice PPMS, internat…) :
   des colonnes du référentiel que les départements et les académies complètent depuis l'onglet « Compléments » du
   widget de saisie. Pour chaque référentiel du document :
   - les colonnes demandées et ce qu'en fait l'établissement ouvert par son lien (masquée, lecture, modification) ;
     les colonnes remplies par l'import de l'annuaire, les formules et la clé ou le lien d'accès ne sont pas proposés ;
   - les échelons qui les renseignent (viseurs départementaux, académiques, dans leur périmètre : onglet Validation) ;
   - le taux de remplissage de chaque colonne ;
   - deux colonnes du référentiel datent et signent chaque modification (Socle.STRUCTUREL : formules d'initialisation
     recalculées quand une colonne demandée change) ; elles sont créées ou mises à jour à l'enregistrement.
   Réglages : clé « structurel » de Config ({ tables: { <référentiel>: { colonnes, echelons } } }) ; l'enregistrement
   réapplique les règles d'accès du socle si elles sont en place (onglet Accès).
   Définit : window.OngletStructurel = { afficher }. Utilise : Socle (commun/socle.js), OngletAcces (facultatif).
   ===================================================================== */
(function () {
  "use strict";
  const S = window.Socle;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // rôles du référentiel remplis par l'import de l'annuaire (onglet Référentiel) : une modification serait écrasée
  const ROLES_ANNUAIRE = ["UAI", "Nom", "Type", "Commune", "Academie", "Departement", "Mail", "Statut_public_prive", "Libelle_nature", "Nom_circonscription", "Latitude", "Longitude"];
  const ECHELONS = [["dep", "Département, dans son périmètre"], ["aca", "Académie, dans son périmètre"]];
  const TYPES = [["Text", "Texte"], ["Int", "Nombre entier"], ["Numeric", "Nombre décimal"], ["Choice", "Liste de choix"], ["Bool", "Case à cocher"], ["Date", "Date"]];

  let config, general, meta, racine, referentiels = [];
  const brouillons = {};   // réglage en cours de modification, par référentiel

  /* ---------- Lecture ---------- */
  async function charger() {
    config = await S.lireConfig();
    general = S.general(config);
    meta = await S.lireMeta();
    referentiels = [];
    for (const e of S.espaces(general)) {
      const t = e.referentiel;
      if (!meta[t] || referentiels.some(x => x.table === t)) continue;
      let donnees = null;
      try { donnees = await grist.docApi.fetchTable(t); } catch (_) { donnees = null; }
      const roles = S.resoudreRoles("referentiel", meta[t], { reponses: e.reponses, referentiel: t }, {}, {});
      const annuaire = new Set(ROLES_ANNUAIRE.map(r => roles[r] && roles[r].col).filter(Boolean));
      referentiels.push({ table: t, libelle: e.libelle || t, donnees, annuaire });
    }
  }
  function reglage(t) {
    if (brouillons[t]) return brouillons[t];
    return S.reglagesStructurel(config, t) || { colonnes: {}, echelons: ["dep", "aca"] };
  }
  // colonnes proposables : ni formule, ni clé ou lien d'accès, ni colonne de mise à jour, ni colonne de l'annuaire
  function colonnesDe(ref) {
    const exclues = new Set([S.STRUCTUREL.le, S.STRUCTUREL.par, "manualSort"]);
    return Object.values(meta[ref.table].colonnes)
      .filter(c => !c.isFormula && !exclues.has(c.colId) && !/^(uuid|lien|cle|cle_acces)$/i.test(c.colId) && !/^Attachments/.test(c.type))
      .map(c => ({ ...c, annuaire: ref.annuaire.has(c.colId) }));
  }
  function remplissage(ref, col) {
    const v = ref.donnees && ref.donnees[col];
    if (!v || !v.length) return null;
    const n = v.filter(x => x !== null && x !== "" && !(Array.isArray(x) && x.length <= 1)).length;
    return Math.round(100 * n / v.length);
  }

  /* ---------- Rendu ---------- */
  function dessiner() {
    if (!config) { racine.innerHTML = `<h2>Données demandées aux services</h2><p class="vide">La table Config est absente : lancez d'abord l'installation.</p>`; return; }
    if (!referentiels.length) { racine.innerHTML = `<h2>Données demandées aux services</h2><p class="vide">Aucun référentiel des établissements dans le document.</p>`; return; }
    racine.innerHTML = `<h2>Données demandées aux services</h2>
      <p class="aide">Données structurelles dont le national ne dispose pas : les départements et les académies les complètent depuis l'onglet « Compléments » du widget de saisie, pour les établissements qui ont un signalement.
        Elles restent dans le référentiel : elles valent pour toutes les situations et se retrouvent dans la fiche établissement. Chaque modification est datée et signée (colonnes ${esc(S.STRUCTUREL.le)} et ${esc(S.STRUCTUREL.par)}).</p>
      ${referentiels.map(blocReferentiel).join("")}`;
    lier();
  }
  function blocReferentiel(ref, k) {
    const r = reglage(ref.table), cols = colonnesDe(ref), nb = Object.keys(r.colonnes).length;
    const ligne = c => {
      const dem = c.colId in r.colonnes, p = remplissage(ref, c.colId);
      return `<tr${c.annuaire ? ' class="st-annuaire"' : ""}><td>${esc(c.label)} <code>${esc(c.colId)}</code></td>
        <td><input type="checkbox" data-st-col="${esc(c.colId)}" aria-label="${esc(c.label)} demandée"${dem ? " checked" : ""}${c.annuaire ? " disabled" : ""}></td>
        <td>${c.annuaire ? `<span class="aide">annuaire</span>` : `<select data-st-droit="${esc(c.colId)}" aria-label="${esc(c.label)}, droit de l'établissement"${dem ? "" : " disabled"}>${S.DROITS_ETAB_STRUCTUREL.map(([v, l]) => `<option value="${v}"${(r.colonnes[c.colId] || "masquee") === v ? " selected" : ""}>${l}</option>`).join("")}</select>`}</td>
        <td class="va-n">${p == null ? "—" : `${p} %`}</td></tr>`;
    };
    return `<section class="st-ref" data-st-ref="${k}"><h3>${esc(ref.libelle)} <small>(table ${esc(ref.table)})</small></h3>
      <p class="aide">${nb ? `${nb} donnée${nb > 1 ? "s" : ""} demandée${nb > 1 ? "s" : ""}.` : "Aucune donnée demandée pour l'instant."} « Établissement » : ce que fait l'établissement ouvert par son lien (masquée : il ne la voit pas ; lecture ; modification : il peut la corriger lui-même).</p>
      <div class="st-defile"><table class="va-table st-table"><thead><tr><th>Colonne du référentiel</th><th>Demandée</th><th>Établissement</th><th class="va-n">Renseignée</th></tr></thead>
        <tbody>${cols.filter(c => !c.annuaire).map(ligne).join("")}${cols.filter(c => c.annuaire).map(ligne).join("")}</tbody></table></div>
      <div class="champ"><span class="va-titre">Qui les renseigne</span>
        ${ECHELONS.map(([e, l]) => `<label class="va-case"><input type="checkbox" data-st-echelon="${e}"${r.echelons.includes(e) ? " checked" : ""}> ${esc(l)}</label>`).join("")}
        <small>Viseurs de l'onglet Validation (échelon et périmètre). Les propriétaires et les agents mobilisés au planning peuvent toujours les renseigner.</small></div>
      <details class="st-ajout"><summary>Ajouter une information au référentiel</summary>
        <div class="boutons"><label>Nom <input type="text" data-st-nouv placeholder="ex. Référent sûreté"></label>
          <label>Type <select data-st-type>${TYPES.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select></label>
          <button type="button" class="secondaire" data-st-act="ajouter">Ajouter la colonne</button></div>
        <p class="aide">La colonne est créée vide dans « ${esc(ref.table)} », puis cochée comme demandée. Pour une liste de choix, les choix se règlent ensuite dans Grist.</p></details>
      <div class="boutons"><button class="primaire" data-st-act="enregistrer">Enregistrer${brouillons[ref.table] ? " (modifications en cours)" : ""}</button>
        <span class="statut" id="st-statut-${k}" role="status"></span></div></section>`;
  }

  /* ---------- Écritures ---------- */
  const dire = (k, t, err) => { const st = $(`st-statut-${k}`); if (st) { st.textContent = t; st.className = `statut${err ? " err" : " ok"}`; } };
  // colonnes de mise à jour : formules d'initialisation recalculées quand une colonne demandée change. Grist refuse
  // recalcDeps dans AddColumn / ModifyColumn (« AssertionError ») : colonnes créées d'abord, puis formule posée sur leur
  // métadonnée (_grist_Tables_column), comme le fait Grist lui-même (même procédé que la file de vérification des sites)
  async function poserColonnesMaj(t, colonnes) {
    const defs = [[S.STRUCTUREL.le, "DateTime:Europe/Paris", "Données mises à jour le", "NOW()"], [S.STRUCTUREL.par, "Text", "Données mises à jour par", S.formuleAuteurStructurel(general)]];
    const ajouts = defs.filter(([c]) => !meta[t].colonnes[c]).map(([colId, type, label]) => ["AddColumn", t, colId, { type, isFormula: false, label, untieColIdFromLabel: true }]);
    if (ajouts.length) { await grist.docApi.applyUserActions(ajouts); meta = await S.lireMeta(); }
    const cm = meta[t].colonnes, deps = colonnes.map(c => cm[c] && cm[c].ref).filter(Boolean);
    await grist.docApi.applyUserActions(defs.filter(([c]) => cm[c] && !cm[c].isFormula).map(([c, , , formula]) =>
      ["UpdateRecord", "_grist_Tables_column", cm[c].ref, { formula: deps.length ? formula : "", recalcWhen: 0, recalcDeps: deps.length ? ["L", ...deps] : null }]));
  }
  async function enregistrer(k) {
    const ref = referentiels[k], r = reglage(ref.table);
    try {
      const v = (config.valeurs.structurel && typeof config.valeurs.structurel === "object") ? config.valeurs.structurel : {};
      await S.ecrireConfig("structurel", { ...v, tables: { ...(v.tables || {}), [ref.table]: r } });
      const cols = Object.keys(r.colonnes);
      if (cols.length || meta[ref.table].colonnes[S.STRUCTUREL.le]) await poserColonnesMaj(ref.table, cols);
      delete brouillons[ref.table];
      let acces = { texte: "" };
      try { if (window.OngletAcces && window.OngletAcces.reappliquerSiBesoin) acces = await window.OngletAcces.reappliquerSiBesoin(); } catch (_) { /* facultatif */ }
      await recharger();
      dire(k, `Enregistré : ${cols.length} donnée${cols.length > 1 ? "s" : ""} demandée${cols.length > 1 ? "s" : ""}.${acces.texte ? ` ${acces.texte}` : ""}`);
    } catch (e) { dire(k, `Échec : ${e.message || e}`, true); }
  }
  async function ajouterColonne(k, sec) {
    const ref = referentiels[k], champ = sec.querySelector("[data-st-nouv]"), lib = champ.value.trim(), type = sec.querySelector("[data-st-type]").value;
    if (!lib) { champ.focus(); return; }
    let cid = S.norm(lib).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^(\d)/, "C_$1") || "Information";
    cid = cid.charAt(0).toUpperCase() + cid.slice(1);
    while (meta[ref.table].colonnes[cid]) cid += "_2";
    try {
      await grist.docApi.applyUserActions([["AddColumn", ref.table, cid, { type, isFormula: false, label: lib, untieColIdFromLabel: true }]]);
      const r = { ...reglage(ref.table) }; r.colonnes = { ...r.colonnes, [cid]: "masquee" }; brouillons[ref.table] = r;
      await recharger();
      dire(k, `Colonne « ${lib} » créée et cochée : enregistrez pour la demander aux services.`);
    } catch (e) { dire(k, `Colonne non créée : ${e.message || e}`, true); }
  }
  function lier() {
    racine.querySelectorAll("[data-st-ref]").forEach(sec => {
      const k = +sec.dataset.stRef, t = referentiels[k].table;
      const maj = fn => { const r = { ...reglage(t), colonnes: { ...reglage(t).colonnes } }; fn(r); brouillons[t] = r; dessiner(); };
      sec.querySelectorAll("[data-st-col]").forEach(c => c.addEventListener("change", () => maj(r => {
        if (c.checked) r.colonnes[c.dataset.stCol] = r.colonnes[c.dataset.stCol] || "masquee"; else delete r.colonnes[c.dataset.stCol];
      })));
      sec.querySelectorAll("[data-st-droit]").forEach(s => s.addEventListener("change", () => maj(r => { r.colonnes[s.dataset.stDroit] = s.value; })));
      sec.querySelectorAll("[data-st-echelon]").forEach(c => c.addEventListener("change", () => maj(r => {
        r.echelons = ECHELONS.map(([e]) => e).filter(e => sec.querySelector(`[data-st-echelon="${e}"]`).checked);
      })));
      sec.querySelector("[data-st-act=enregistrer]").addEventListener("click", () => enregistrer(k));
      sec.querySelector("[data-st-act=ajouter]").addEventListener("click", () => ajouterColonne(k, sec));
    });
  }

  async function recharger() { await charger(); dessiner(); }
  async function afficher() {
    racine = $("ref-structurel");
    if (!racine) return;
    try { await recharger(); }
    catch (e) { racine.innerHTML = `<h2>Données demandées aux services</h2><p class="avert">Lecture impossible : ${esc(e.message || e)}</p>`; }
  }
  window.OngletStructurel = { afficher };
})();
