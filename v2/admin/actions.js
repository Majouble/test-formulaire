/* =====================================================================
   Administration v2 — onglet « Actions » : suivi des actions de la cellule, en kanban
   ---------------------------------------------------------------------
   Inspiré du widget « Grist Project Manager » (isaytoo), en version simplifiée pour les coordinateurs :
   trois colonnes (À faire, En cours, Fait), glisser-déposer d'une colonne à l'autre, création et modification
   dans une fenêtre (titre, description, priorité, responsable choisi dans l'équipe, échéance).
   Table Actions du socle. Pas de notification ni d'actions types.
   ===================================================================== */
(function () {
  "use strict";
  const S = window.Socle, R = window.Repartition;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const COLONNES = [
    { statut: "À faire", couleur: "#6a6af4" },
    { statut: "En cours", couleur: "#d68a00" },
    { statut: "Fait", couleur: "#18753c" },
  ];
  const ORDRE_PRIO = { Haute: 0, Moyenne: 1, Basse: 2 };

  let config, general, agents, actions, racine;
  let filtreResp = "", recherche = "", masquerAnciennes = true;
  let edition = null;      // action ouverte dans la fenêtre : { id|null, titre, description, statut, priorite, responsable, echeance }
  let glisse = null;       // id de l'action déplacée

  const table = () => general.actions || "Actions";
  // Dates : Echeance est une date Grist (secondes à minuit UTC)
  const isoDeDate = sec => sec ? new Date(sec * 1000).toISOString().slice(0, 10) : "";
  const dateDeIso = iso => { if (!iso) return null; const [y, m, j] = iso.split("-").map(Number); return Date.UTC(y, m - 1, j) / 1000; };
  const aujourdhuiUTC = () => { const d = new Date(); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 1000; };
  const dateCourte = sec => new Date(sec * 1000).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
  const enRetard = a => a.statut !== "Fait" && a.echeance && a.echeance < aujourdhuiUTC();
  const pourAujourdhui = a => a.statut !== "Fait" && a.echeance === aujourdhuiUTC();
  const nomAgent = id => { const a = (agents || []).find(x => x.id === id); return a ? a.nom : ""; };
  const initiales = nom => String(nom || "").split(/[\s-]+/).filter(Boolean).slice(0, 2).map(x => x[0].toUpperCase()).join("");

  async function charger() {
    config = await S.lireConfig();
    general = S.general(config);
    agents = (await R.lireAgents(general, null)) || [];
    actions = await S.lireActions(general);
  }

  /* ---------- Rendu ---------- */
  function filtrees() {
    const q = S.norm(recherche), limite = Date.now() / 1000 - 7 * 86400;
    return actions.filter(a => (!filtreResp || (filtreResp === "aucun" ? !a.responsable : String(a.responsable) === filtreResp))
      && (!q || S.norm(`${a.titre} ${a.description} ${nomAgent(a.responsable)}`).includes(q))
      && !(masquerAnciennes && a.statut === "Fait" && a.faitLe && a.faitLe < limite));
  }
  const trier = (l, statut) => statut === "Fait"
    ? l.sort((a, b) => (b.faitLe || 0) - (a.faitLe || 0))
    : l.sort((a, b) => (ORDRE_PRIO[a.priorite] - ORDRE_PRIO[b.priorite]) || ((a.echeance || 9e12) - (b.echeance || 9e12)) || a.id - b.id);

  function dessiner() {
    if (!config) { racine.innerHTML = `<div class="bandeau alerte">La table Config est absente : lancez d'abord l'installation.</div>`; return; }
    if (actions === null) {
      racine.innerHTML = `<div class="ak-vide-table"><p>La table ${esc(table())} n'existe pas encore.</p>
        <button class="primaire" id="ak-creer-table">Créer la table ${esc(table())}</button><p class="statut" id="ak-statut"></p></div>`;
      $("ak-creer-table").addEventListener("click", creerTable);
      return;
    }
    const l = filtrees(), ouvertes = actions.filter(a => a.statut !== "Fait");
    const stats = [
      ["À faire", actions.filter(a => a.statut === "À faire").length, ""],
      ["En cours", actions.filter(a => a.statut === "En cours").length, ""],
      ["En retard", ouvertes.filter(enRetard).length, "retard"],
      ["Faites aujourd'hui", actions.filter(a => a.statut === "Fait" && a.faitLe && a.faitLe >= new Date().setHours(0, 0, 0, 0) / 1000).length, "fait"],
    ];
    const respOpts = agents.filter(a => a.actif || actions.some(x => x.responsable === a.id));
    racine.innerHTML = `
      <div class="ak-barre">
        <button class="primaire" id="ak-nouvelle">+ Nouvelle action</button>
        <input type="search" id="ak-recherche" placeholder="Rechercher…" value="${esc(recherche)}" aria-label="Rechercher une action">
        <select id="ak-resp" aria-label="Filtrer par responsable"><option value="">Tous les responsables</option><option value="aucun"${filtreResp === "aucun" ? " selected" : ""}>Sans responsable</option>
          ${respOpts.map(a => `<option value="${a.id}"${filtreResp === String(a.id) ? " selected" : ""}>${esc(a.nom)}</option>`).join("")}</select>
        <label class="ak-case"><input type="checkbox" id="ak-anciennes"${masquerAnciennes ? " checked" : ""}> masquer les actions faites depuis plus de 7 jours</label>
        <span class="ak-stats">${stats.map(([lib, n, cls]) => `<span class="ak-stat ${cls}${n && cls === "retard" ? " actif" : ""}"><strong>${n}</strong> ${esc(lib)}</span>`).join("")}</span>
      </div>
      <div class="ak-tableau">${COLONNES.map(c => {
        const cartes = trier(l.filter(a => a.statut === c.statut), c.statut);
        return `<section class="ak-col" data-statut="${esc(c.statut)}" style="--c:${c.couleur}">
          <header class="ak-col-tete"><span class="ak-point"></span>${esc(c.statut)} <span class="ak-nb">${cartes.length}</span>
            <button type="button" class="ak-plus" data-ajout="${esc(c.statut)}" title="Nouvelle action « ${esc(c.statut)} »" aria-label="Nouvelle action ${esc(c.statut)}">+</button></header>
          <div class="ak-cartes" data-statut="${esc(c.statut)}">${cartes.map(carte).join("") || `<p class="ak-vide">Aucune action</p>`}</div>
        </section>`;
      }).join("")}</div>
      <p class="statut" id="ak-statut" role="status"></p>
      ${fenetre()}`;
    lier();
  }
  function carte(a) {
    const resp = nomAgent(a.responsable), retard = enRetard(a), jour = pourAujourdhui(a);
    return `<article class="ak-carte prio-${S.norm(a.priorite)}${retard ? " retard" : ""}" draggable="true" data-id="${a.id}" tabindex="0" aria-label="${esc(a.titre)}">
      <div class="ak-carte-tete"><span class="ak-titre">${esc(a.titre) || "<em>Sans titre</em>"}</span>
        ${a.priorite !== "Moyenne" ? `<span class="ak-prio prio-${S.norm(a.priorite)}">${esc(a.priorite)}</span>` : ""}</div>
      ${a.description ? `<p class="ak-desc">${esc(a.description.length > 140 ? `${a.description.slice(0, 140)}…` : a.description)}</p>` : ""}
      <div class="ak-carte-pied">
        ${a.echeance ? `<span class="ak-date${retard ? " retard" : jour ? " jour" : ""}">📅 ${esc(dateCourte(a.echeance))}${retard ? " · en retard" : jour ? " · aujourd'hui" : ""}</span>` : `<span></span>`}
        ${a.statut === "Fait" && a.faitLe ? `<span class="ak-date">✓ ${esc(new Date(a.faitLe * 1000).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }))}</span>` : ""}
        ${resp ? `<span class="ak-resp" title="${esc(resp)}">${esc(initiales(resp))}</span>` : `<span class="ak-resp vide" title="Sans responsable">?</span>`}
      </div></article>`;
  }
  function fenetre() {
    if (!edition) return "";
    const e = edition, respOpts = agents.filter(a => a.actif || a.id === e.responsable);
    return `<div class="ak-voile" id="ak-voile"><div class="ak-fenetre" role="dialog" aria-modal="true" aria-labelledby="ak-f-titre">
      <h2 id="ak-f-titre">${e.id ? "Modifier l'action" : "Nouvelle action"}</h2>
      <label class="champ"><span>Titre</span><input type="text" id="ak-titre" value="${esc(e.titre)}" placeholder="Rappeler le proviseur du lycée…"></label>
      <label class="champ"><span>Description</span><textarea id="ak-description" rows="4">${esc(e.description)}</textarea></label>
      <div class="ak-grille">
        <label class="champ"><span>Statut</span><select id="ak-statut-f">${S.STATUTS_ACTION.map(x => `<option${x === e.statut ? " selected" : ""}>${esc(x)}</option>`).join("")}</select></label>
        <label class="champ"><span>Priorité</span><select id="ak-priorite">${S.PRIORITES_ACTION.map(x => `<option${x === e.priorite ? " selected" : ""}>${esc(x)}</option>`).join("")}</select></label>
        <label class="champ"><span>Responsable</span><select id="ak-responsable"><option value="">—</option>${respOpts.map(a => `<option value="${a.id}"${a.id === e.responsable ? " selected" : ""}>${esc(a.nom)}${a.fonction ? ` (${esc(a.fonction)})` : ""}</option>`).join("")}</select></label>
        <label class="champ"><span>Échéance</span><input type="date" id="ak-echeance" value="${esc(isoDeDate(e.echeance))}"></label>
      </div>
      ${e.id && e.creePar ? `<p class="aide">Créée par ${esc(e.creePar)}${e.creeLe ? ` le ${esc(new Date(e.creeLe * 1000).toLocaleString("fr-FR"))}` : ""}.</p>` : ""}
      <div class="boutons"><button class="primaire" id="ak-enregistrer">${e.id ? "Enregistrer" : "Créer l'action"}</button>
        <button class="secondaire" id="ak-annuler">Annuler</button>
        ${e.id ? `<button class="secondaire danger" id="ak-supprimer">${e.confirmerSuppression ? "Confirmer la suppression" : "Supprimer"}</button>` : ""}
        <span class="statut" id="ak-f-statut" role="status"></span></div>
    </div></div>`;
  }

  /* ---------- Événements ---------- */
  function lier() {
    $("ak-nouvelle").addEventListener("click", () => ouvrir(null, "À faire"));
    racine.querySelectorAll("[data-ajout]").forEach(b => b.addEventListener("click", () => ouvrir(null, b.dataset.ajout)));
    $("ak-recherche").addEventListener("input", ev => { recherche = ev.target.value; const pos = ev.target.selectionStart; dessiner(); const r = $("ak-recherche"); r.focus(); r.setSelectionRange(pos, pos); });
    $("ak-resp").addEventListener("change", ev => { filtreResp = ev.target.value; dessiner(); });
    $("ak-anciennes").addEventListener("change", ev => { masquerAnciennes = ev.target.checked; dessiner(); });
    racine.querySelectorAll(".ak-carte").forEach(c => {
      c.addEventListener("click", () => ouvrir(+c.dataset.id));
      c.addEventListener("keydown", ev => { if (ev.key === "Enter") ouvrir(+c.dataset.id); });
      c.addEventListener("dragstart", ev => { glisse = +c.dataset.id; c.classList.add("glisse"); ev.dataTransfer.effectAllowed = "move"; try { ev.dataTransfer.setData("text/plain", c.dataset.id); } catch (_) { /* navigateur */ } });
      c.addEventListener("dragend", () => { c.classList.remove("glisse"); racine.querySelectorAll(".ak-cartes").forEach(z => z.classList.remove("survol")); });
    });
    racine.querySelectorAll(".ak-cartes").forEach(z => {
      z.addEventListener("dragover", ev => { ev.preventDefault(); z.classList.add("survol"); });
      z.addEventListener("dragleave", () => z.classList.remove("survol"));
      z.addEventListener("drop", ev => { ev.preventDefault(); z.classList.remove("survol"); const id = glisse || +ev.dataTransfer.getData("text/plain"); glisse = null; if (id) deplacer(id, z.dataset.statut); });
    });
    if (edition) lierFenetre();
  }
  function ouvrir(id, statut) {
    const a = id ? actions.find(x => x.id === id) : null;
    edition = a ? { ...a } : { id: null, titre: "", description: "", statut: statut || "À faire", priorite: "Moyenne", responsable: null, echeance: null };
    dessiner();
    $("ak-titre").focus();
  }
  function lireFenetre() {
    Object.assign(edition, { titre: $("ak-titre").value, description: $("ak-description").value, statut: $("ak-statut-f").value,
      priorite: $("ak-priorite").value, responsable: +$("ak-responsable").value || null, echeance: dateDeIso($("ak-echeance").value) });
  }
  function lierFenetre() {
    const fermer = () => { edition = null; dessiner(); };
    $("ak-annuler").addEventListener("click", fermer);
    $("ak-voile").addEventListener("click", ev => { if (ev.target.id === "ak-voile") fermer(); });
    $("ak-voile").addEventListener("keydown", ev => { if (ev.key === "Escape") fermer(); });
    $("ak-enregistrer").addEventListener("click", () => { lireFenetre(); enregistrer(); });
    $("ak-titre").addEventListener("keydown", ev => { if (ev.key === "Enter") { lireFenetre(); enregistrer(); } });
    if ($("ak-supprimer")) $("ak-supprimer").addEventListener("click", () => {
      lireFenetre();
      if (!edition.confirmerSuppression) { edition.confirmerSuppression = true; dessiner(); return; }
      supprimer();
    });
  }
  const dire = (id, t, err) => { const st = $(id); if (st) { st.textContent = t; st.className = `statut${err ? " err" : " ok"}`; } };

  /* ---------- Écritures ---------- */
  const champsStatut = (statut, avant) => ({ Statut: statut, Fait_le: statut === "Fait" ? (avant === "Fait" ? undefined : Date.now() / 1000) : null });
  async function enregistrer() {
    const e = edition;
    if (!e.titre.trim()) { dire("ak-f-statut", "Donnez un titre à l'action.", true); $("ak-titre").focus(); return; }
    const avant = e.id ? (actions.find(x => x.id === e.id) || {}).statut : null;
    const st = champsStatut(e.statut, avant);
    const champs = { Titre: e.titre.trim(), Description: e.description.trim(), Priorite: e.priorite, Responsable: e.responsable || 0, Echeance: e.echeance,
      Statut: st.Statut, ...(st.Fait_le !== undefined ? { Fait_le: st.Fait_le } : {}) };
    try {
      await grist.docApi.applyUserActions([e.id ? ["UpdateRecord", table(), e.id, champs] : ["AddRecord", table(), null, champs]]);
      edition = null; actions = await S.lireActions(general); dessiner();
      dire("ak-statut", e.id ? "Action enregistrée." : "Action créée.");
    } catch (err) { dire("ak-f-statut", `Enregistrement refusé par Grist (${err.message || err}).`, true); }
  }
  async function deplacer(id, statut) {
    const a = actions.find(x => x.id === id);
    if (!a || a.statut === statut) return;
    const st = champsStatut(statut, a.statut);
    a.statut = statut; if (st.Fait_le !== undefined) a.faitLe = st.Fait_le;
    dessiner();   // affichage immédiat
    try { await grist.docApi.applyUserActions([["UpdateRecord", table(), id, { Statut: statut, ...(st.Fait_le !== undefined ? { Fait_le: st.Fait_le } : {}) }]]); }
    catch (err) { dire("ak-statut", `Déplacement refusé par Grist (${err.message || err}).`, true); }
    actions = await S.lireActions(general); dessiner();
  }
  async function supprimer() {
    try { await grist.docApi.applyUserActions([["RemoveRecord", table(), edition.id]]); edition = null; actions = await S.lireActions(general); dessiner(); dire("ak-statut", "Action supprimée."); }
    catch (err) { dire("ak-f-statut", `Suppression refusée par Grist (${err.message || err}).`, true); }
  }
  async function creerTable() {
    const meta = await S.lireMeta(), plan = S.planInstallation(meta, config);
    const etapes = plan.etapes.filter(e => e.id === `table-${table()}` || e.id === `cols-${table()}` || (!meta[general.agents] && e.id === `table-${general.agents}`));
    if (!meta[general.agents] && !etapes.some(e => e.id === `table-${general.agents}`)) { dire("ak-statut", "Créez d'abord l'équipe (onglet Équipe).", true); return; }
    const res = await S.appliquer(etapes.sort((a, b) => (a.id === `table-${general.agents}` ? -1 : b.id === `table-${general.agents}` ? 1 : 0)));
    const ko = res.find(r => !r.ok);
    if (ko) { dire("ak-statut", `Création refusée par Grist (${ko.erreur}).`, true); return; }
    await charger(); dessiner();
  }

  // Actualisation périodique (autre coordinateur) quand l'onglet est visible et qu'aucune fenêtre n'est ouverte
  setInterval(async () => {
    if (!racine || racine.hidden || edition || document.hidden || actions === null) return;
    try { const l = await S.lireActions(general); if (JSON.stringify(l) !== JSON.stringify(actions)) { actions = l; dessiner(); } } catch (_) { /* réseau */ }
  }, 30000);

  async function afficher() {
    racine = $("onglet-actions");
    racine.innerHTML = `<div class="bandeau info" style="margin:16px">Lecture des actions…</div>`;
    try { await charger(); } catch (e) { racine.innerHTML = `<div class="bandeau alerte">Lecture impossible : ${esc(e.message || e)}</div>`; return; }
    dessiner();
  }
  window.OngletActions = { afficher };
})();
