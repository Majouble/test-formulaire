/* =====================================================================
   Administration v2 — onglet « Actions » : suivi des actions de la cellule, en kanban
   ---------------------------------------------------------------------
   Inspiré du widget « Grist Project Manager » (isaytoo), vue kanban seulement, pour les coordinateurs :
   - colonnes réglables (nom, couleur, emoji, ordre, colonne de clôture) : clé « actions » de Config ;
     la colonne Choice Statut de la table suit ces réglages (choix et couleurs) ;
   - regroupement par statut, priorité ou responsable ; glisser-déposer d'une colonne à l'autre et, en tri
     manuel, à l'intérieur d'une colonne (colonne Ordre) ;
   - tris (manuel, A→Z, Z→A, échéance, priorité, date de création), filtres (recherche, responsable, priorité,
     en retard), colonnes repliables, cartes dépliables, champs affichés sur les cartes réglables ;
   - archives : une action close peut être archivée, puis restaurée ;
   - fenêtre de création et de modification (titre, description, statut, priorité, responsable, échéance),
     duplication, suppression.
   Pas de notification ni d'actions types. Préférences d'affichage propres à chaque navigateur (localStorage).
   ===================================================================== */
(function () {
  "use strict";
  const S = window.Socle, R = window.Repartition;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const COULEURS_PRIO = { Haute: "#ce0500", Moyenne: "#d68a00", Basse: "#6a6af4" };
  const ORDRE_PRIO = { Haute: 0, Moyenne: 1, Basse: 2 };
  const TRIS = [["manuel", "Manuel (glisser)"], ["alpha", "A → Z"], ["alpha-desc", "Z → A"], ["echeance", "Échéance"], ["priorite", "Priorité"], ["creation", "Date de création"]];
  const GROUPES = [["statut", "Statut"], ["priorite", "Priorité"], ["responsable", "Responsable"]];
  const CHAMPS_CARTE = [["priorite", "Priorité"], ["description", "Description"], ["echeance", "Échéance"], ["responsable", "Responsable"], ["creation", "Date de création"]];

  let config, general, agents, actions, reglages, racine, manquantes = [];
  // Préférences d'affichage (par navigateur)
  const PREF = "signalements-v2-actions";
  let vue = { groupe: "statut", tri: "manuel", replies: {}, masquerAnciennes: true };
  try { vue = { ...vue, ...JSON.parse(localStorage.getItem(PREF) || "{}") }; } catch (_) { /* stockage indisponible */ }
  const memoriser = () => { try { localStorage.setItem(PREF, JSON.stringify(vue)); } catch (_) { /* stockage indisponible */ } };
  // Filtres et état de la page
  let recherche = "", filtreResp = "", filtrePrio = "", filtreRetard = false, archives = false;
  const deplies = new Set();
  let edition = null;          // fenêtre d'une action
  let panneau = null;          // réglages des colonnes et des cartes en cours de modification
  let nouvelleColonne = null;  // saisie rapide d'une colonne en bout de tableau
  let glisse = null;           // id de l'action déplacée

  const table = () => general.actions || "Actions";
  const isoDeDate = sec => sec ? new Date(sec * 1000).toISOString().slice(0, 10) : "";
  const dateDeIso = iso => { if (!iso) return null; const [y, m, j] = iso.split("-").map(Number); return Date.UTC(y, m - 1, j) / 1000; };
  const aujourdhuiUTC = () => { const d = new Date(); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 1000; };
  const dateCourte = sec => new Date(sec * 1000).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
  const dateHeure = sec => new Date(sec * 1000).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const statutDef = nom => reglages.statuts.find(x => x.nom === nom) || null;
  const estClos = a => !!(statutDef(a.statut) || {}).clos;
  const enRetard = a => !estClos(a) && a.echeance && a.echeance < aujourdhuiUTC();
  const pourAujourdhui = a => !estClos(a) && a.echeance === aujourdhuiUTC();
  const agentDe = id => (agents || []).find(x => x.id === id) || null;
  const nomAgent = id => (agentDe(id) || {}).nom || "";
  const initiales = nom => String(nom || "").split(/[\s-]+/).filter(Boolean).slice(0, 2).map(x => x[0].toUpperCase()).join("");
  const cleOrdre = a => a.ordre != null ? a.ordre : a.id;
  const statutParDefaut = () => (reglages.statuts.find(x => !x.clos) || reglages.statuts[0]).nom;
  const statutClos = () => (reglages.statuts.find(x => x.clos) || reglages.statuts[reglages.statuts.length - 1]).nom;

  async function charger() {
    config = await S.lireConfig();
    general = S.general(config);
    reglages = S.reglagesActions(config);
    agents = (await R.lireAgents(general, null)) || [];
    actions = await S.lireActions(general);
    const meta = await S.lireMeta(), t = meta[table()];
    manquantes = t ? S.colonnesActions(general, config).map(c => c.id).filter(c => !t.colonnes[c]) : [];
  }

  /* ---------- Colonnes et filtres ---------- */
  function colonnes() {
    if (archives) return [{ cle: "archives", libelle: "Archives", couleur: "#94a3b8", emoji: "📦", champ: null }];
    if (vue.groupe === "priorite") return S.PRIORITES_ACTION.map(p => ({ cle: p, libelle: p, couleur: COULEURS_PRIO[p], champ: "priorite" }));
    if (vue.groupe === "responsable") {
      const ids = [...new Set(actions.filter(a => !a.archivee && a.responsable).map(a => a.responsable))];
      const liste = agents.filter(a => a.actif || ids.includes(a.id)).filter(a => ids.includes(a.id) || a.actif);
      return [{ cle: "", libelle: "Sans responsable", couleur: "#94a3b8", champ: "responsable" },
        ...liste.map(a => ({ cle: String(a.id), libelle: a.nom, couleur: "#000091", champ: "responsable" }))];
    }
    const cols = reglages.statuts.map(x => ({ cle: x.nom, libelle: x.nom, couleur: x.couleur, emoji: x.emoji, clos: x.clos, champ: "statut" }));
    const inconnus = [...new Set(actions.filter(a => !a.archivee && !statutDef(a.statut)).map(a => a.statut))];
    return [...cols, ...inconnus.map(n => ({ cle: n, libelle: n || "(sans statut)", couleur: "#94a3b8", champ: "statut", inconnu: true }))];
  }
  const valeurDe = (a, champ) => champ === "statut" ? a.statut : champ === "priorite" ? a.priorite : String(a.responsable || "");
  function filtrees() {
    const q = S.norm(recherche), limite = Date.now() / 1000 - 7 * 86400;
    return actions.filter(a => (archives ? a.archivee : !a.archivee)
      && (!filtreResp || (filtreResp === "aucun" ? !a.responsable : String(a.responsable) === filtreResp))
      && (!filtrePrio || a.priorite === filtrePrio)
      && (!filtreRetard || enRetard(a))
      && (!q || S.norm(`${a.titre} ${a.description} ${nomAgent(a.responsable)}`).includes(q))
      && !(!archives && vue.masquerAnciennes && estClos(a) && a.faitLe && a.faitLe < limite));
  }
  function trier(l) {
    const t = vue.tri, cmpTitre = (a, b) => a.titre.localeCompare(b.titre, "fr");
    const f = {
      manuel: (a, b) => cleOrdre(a) - cleOrdre(b),
      alpha: cmpTitre, "alpha-desc": (a, b) => -cmpTitre(a, b),
      echeance: (a, b) => (a.echeance || 9e12) - (b.echeance || 9e12) || cleOrdre(a) - cleOrdre(b),
      priorite: (a, b) => ORDRE_PRIO[a.priorite] - ORDRE_PRIO[b.priorite] || (a.echeance || 9e12) - (b.echeance || 9e12),
      creation: (a, b) => (b.creeLe || b.id) - (a.creeLe || a.id),
    }[t] || ((a, b) => cleOrdre(a) - cleOrdre(b));
    return l.slice().sort(f);
  }

  /* ---------- Rendu ---------- */
  function dessiner() {
    if (!config) { racine.innerHTML = `<div class="bandeau alerte" style="margin:16px">La table Config est absente : lancez d'abord l'installation.</div>`; return; }
    if (actions === null) {
      racine.innerHTML = `<div class="ak-vide-table"><p>La table ${esc(table())} n'existe pas encore.</p>
        <button class="primaire" id="ak-creer-table">Créer la table ${esc(table())}</button><p class="statut" id="ak-statut"></p></div>`;
      $("ak-creer-table").addEventListener("click", creerTable);
      return;
    }
    const l = filtrees(), ouvertes = actions.filter(a => !a.archivee && !estClos(a));
    const nbArchives = actions.filter(a => a.archivee).length;
    const debutJour = new Date().setHours(0, 0, 0, 0) / 1000;
    const respOpts = agents.filter(a => a.actif || actions.some(x => x.responsable === a.id));
    racine.innerHTML = `
      ${manquantes.length ? `<div class="bandeau alerte" style="margin:12px 16px 0">La table ${esc(table())} date d'une version antérieure (colonnes à ajouter : ${esc(manquantes.join(", "))}). <button class="primaire" id="ak-completer" style="margin-left:8px">Compléter la table</button></div>` : ""}
      <div class="ak-barre">
        <button class="primaire" id="ak-nouvelle">+ Nouvelle action</button>
        <input type="search" id="ak-recherche" placeholder="Rechercher…" value="${esc(recherche)}" aria-label="Rechercher une action">
        <label class="ak-lib">Grouper par <select id="ak-groupe">${GROUPES.map(([v, t]) => `<option value="${v}"${vue.groupe === v ? " selected" : ""}>${t}</option>`).join("")}</select></label>
        <label class="ak-lib">Trier <select id="ak-tri">${TRIS.map(([v, t]) => `<option value="${v}"${vue.tri === v ? " selected" : ""}>${t}</option>`).join("")}</select></label>
        <select id="ak-resp" aria-label="Filtrer par responsable"><option value="">Tous les responsables</option><option value="aucun"${filtreResp === "aucun" ? " selected" : ""}>Sans responsable</option>
          ${respOpts.map(a => `<option value="${a.id}"${filtreResp === String(a.id) ? " selected" : ""}>${esc(a.nom)}</option>`).join("")}</select>
        <select id="ak-prio" aria-label="Filtrer par priorité"><option value="">Toutes priorités</option>${S.PRIORITES_ACTION.map(p => `<option${filtrePrio === p ? " selected" : ""}>${p}</option>`).join("")}</select>
        <button class="secondaire petit${archives ? " actif" : ""}" id="ak-archives">📦 Archives (${nbArchives})</button>
        <button class="secondaire petit" id="ak-reglages">⚙ Colonnes et cartes</button>
      </div>
      <div class="ak-sous-barre">
        <span class="ak-stats">
          <span class="ak-stat"><strong>${ouvertes.length}</strong> ouvertes</span>
          <button type="button" class="ak-stat retard${ouvertes.some(enRetard) ? " actif" : ""}${filtreRetard ? " filtre" : ""}" id="ak-filtre-retard" title="Ne montrer que les actions en retard"><strong>${ouvertes.filter(enRetard).length}</strong> en retard</button>
          <span class="ak-stat"><strong>${ouvertes.filter(pourAujourdhui).length}</strong> pour aujourd'hui</span>
          <span class="ak-stat fait"><strong>${actions.filter(a => estClos(a) && a.faitLe && a.faitLe >= debutJour).length}</strong> closes aujourd'hui</span>
        </span>
        ${archives ? "" : `<label class="ak-case"><input type="checkbox" id="ak-anciennes"${vue.masquerAnciennes ? " checked" : ""}> masquer les actions closes depuis plus de 7 jours</label>`}
        ${filtreRetard || filtreResp || filtrePrio || recherche ? `<button type="button" class="lien" id="ak-effacer">Effacer les filtres</button>` : ""}
      </div>
      <div class="ak-tableau">${colonnes().map(c => colonneHtml(c, l)).join("")}${!archives && vue.groupe === "statut" ? ajoutColonneHtml() : ""}</div>
      <p class="statut" id="ak-statut" role="status"></p>
      ${fenetre()}${panneauHtml()}`;
    lier();
  }
  function colonneHtml(c, l) {
    const cartes = trier(l.filter(a => archives || valeurDe(a, c.champ) === c.cle));
    const titre = `${c.emoji ? `${esc(c.emoji)} ` : ""}${esc(c.libelle)}`;
    if (vue.replies[`${vue.groupe}:${c.cle}`] && !archives) return `<section class="ak-col repliee" style="--c:${c.couleur}" data-replier="${esc(c.cle)}" title="Déplier « ${esc(c.libelle)} »" tabindex="0">
      <span class="ak-col-vertical">${titre} (${cartes.length})</span></section>`;
    const plus = !archives ? `<button type="button" class="ak-plus" data-ajout="${esc(c.cle)}" title="Nouvelle action dans « ${esc(c.libelle)} »" aria-label="Nouvelle action dans ${esc(c.libelle)}">+</button>` : "";
    return `<section class="ak-col" style="--c:${c.couleur}">
      <header class="ak-col-tete"><span class="ak-point"></span><span class="ak-col-titre">${titre}${c.sous ? ` <small>${esc(c.sous)}</small>` : ""}${c.clos ? ` <small title="Colonne de clôture : l'heure de réalisation est notée">✓</small>` : ""}${c.inconnu ? ` <small title="Statut absent des réglages des colonnes">?</small>` : ""}</span>
        <span class="ak-nb">${cartes.length}</span>${plus}
        ${archives ? "" : `<button type="button" class="ak-plus" data-replier="${esc(c.cle)}" title="Replier la colonne" aria-label="Replier ${esc(c.libelle)}">⇄</button>`}</header>
      <div class="ak-cartes" data-champ="${esc(c.champ || "")}" data-cle="${esc(c.cle)}">${cartes.map(carte).join("") || `<p class="ak-vide">Aucune action</p>`}</div>
      ${plus ? `<button type="button" class="ak-ajout-bas" data-ajout="${esc(c.cle)}">+ Ajouter une action</button>` : ""}
    </section>`;
  }
  function ajoutColonneHtml() {
    if (!nouvelleColonne) return `<button type="button" class="ak-col-ajout" id="ak-col-ajout">+ Ajouter une colonne</button>`;
    return `<section class="ak-col ak-col-saisie"><label class="ak-lib">Nom<input type="text" id="ak-nc-nom" value="${esc(nouvelleColonne.nom)}" placeholder="À valider…"></label>
      <label class="ak-lib">Couleur <input type="color" id="ak-nc-couleur" value="${esc(nouvelleColonne.couleur)}"></label>
      <div class="boutons"><button class="primaire petit" id="ak-nc-ok">Ajouter</button><button class="secondaire petit" id="ak-nc-annuler">Annuler</button></div></section>`;
  }
  function carte(a) {
    const cd = reglages.cartes, resp = nomAgent(a.responsable), retard = enRetard(a), jour = pourAujourdhui(a), ouvert = deplies.has(a.id);
    const def = statutDef(a.statut);
    const desc = cd.description && a.description ? (ouvert || a.description.length <= 140 ? a.description : `${a.description.slice(0, 140)}…`) : "";
    return `<article class="ak-carte prio-${S.norm(a.priorite)}${retard ? " retard" : ""}" draggable="${archives ? "false" : "true"}" data-id="${a.id}" tabindex="0" aria-label="${esc(a.titre)}">
      <div class="ak-carte-tete"><span class="ak-titre">${esc(a.titre) || "<em>Sans titre</em>"}</span>
        <span class="ak-badges">${cd.priorite && a.priorite !== "Moyenne" ? `<span class="ak-prio prio-${S.norm(a.priorite)}">${esc(a.priorite)}</span>` : ""}
          ${vue.groupe !== "statut" || archives ? `<span class="ak-statut-b" style="--c:${(def || {}).couleur || "#94a3b8"}">${esc(a.statut || "—")}</span>` : ""}
          <button type="button" class="ak-deplier" data-deplier="${a.id}" title="${ouvert ? "Replier" : "Détails"}" aria-label="${ouvert ? "Replier" : "Détails"}">${ouvert ? "▴" : "▾"}</button></span></div>
      ${desc ? `<p class="ak-desc">${esc(desc)}</p>` : ""}
      <div class="ak-carte-pied">
        <span class="ak-dates">${cd.echeance && a.echeance ? `<span class="ak-date${retard ? " retard" : jour ? " jour" : ""}">📅 ${esc(dateCourte(a.echeance))}${retard ? " · en retard" : jour ? " · aujourd'hui" : ""}</span>` : ""}
          ${estClos(a) && a.faitLe ? `<span class="ak-date">✓ ${esc(dateHeure(a.faitLe))}</span>` : ""}
          ${cd.creation && a.creeLe ? `<span class="ak-date">créée ${esc(dateCourte(a.creeLe))}</span>` : ""}</span>
        ${cd.responsable ? (resp ? `<span class="ak-resp" title="${esc(resp)}">${esc(initiales(resp))}</span>` : `<span class="ak-resp vide" title="Sans responsable">?</span>`) : ""}
      </div>
      ${ouvert ? `<div class="ak-detail">
        ${a.description && !cd.description ? `<p class="ak-desc">${esc(a.description)}</p>` : ""}
        <div>Responsable : ${resp ? esc(resp) : "—"}${resp && agentDe(a.responsable) && agentDe(a.responsable).telephone ? ` · ${esc(agentDe(a.responsable).telephone)}` : ""}</div>
        <div>Créée ${a.creeLe ? `le ${esc(dateHeure(a.creeLe))}` : ""}${a.creePar ? ` par ${esc(a.creePar)}` : ""}</div>
        ${a.faitLe ? `<div>Close le ${esc(dateHeure(a.faitLe))}</div>` : ""}</div>` : ""}
      ${archives ? `<div class="ak-carte-actions"><button type="button" class="ak-mini" data-restaurer="${a.id}">♻ Restaurer</button></div>`
        : estClos(a) ? `<div class="ak-carte-actions"><button type="button" class="ak-mini" data-archiver="${a.id}">📦 Archiver</button></div>` : ""}
    </article>`;
  }
  function fenetre() {
    if (!edition) return "";
    const e = edition, respOpts = agents.filter(a => a.actif || a.id === e.responsable);
    const statuts = [...reglages.statuts.map(x => x.nom), ...(e.statut && !statutDef(e.statut) ? [e.statut] : [])];
    return `<div class="ak-voile" id="ak-voile"><div class="ak-fenetre" role="dialog" aria-modal="true" aria-labelledby="ak-f-titre">
      <h2 id="ak-f-titre">${e.id ? "Modifier l'action" : "Nouvelle action"}</h2>
      <label class="champ"><span>Titre</span><input type="text" id="ak-titre" value="${esc(e.titre)}" placeholder="Rappeler le proviseur du lycée…"></label>
      <label class="champ"><span>Description</span><textarea id="ak-description" rows="4">${esc(e.description)}</textarea></label>
      <div class="ak-grille">
        <label class="champ"><span>Statut</span><select id="ak-statut-f">${statuts.map(x => `<option${x === e.statut ? " selected" : ""}>${esc(x)}</option>`).join("")}</select></label>
        <label class="champ"><span>Priorité</span><select id="ak-priorite">${S.PRIORITES_ACTION.map(x => `<option${x === e.priorite ? " selected" : ""}>${esc(x)}</option>`).join("")}</select></label>
        <label class="champ"><span>Responsable</span><select id="ak-responsable"><option value="">—</option>${respOpts.map(a => `<option value="${a.id}"${a.id === e.responsable ? " selected" : ""}>${esc(a.nom)}</option>`).join("")}</select></label>
        <label class="champ"><span>Échéance</span><input type="date" id="ak-echeance" value="${esc(isoDeDate(e.echeance))}"></label>
      </div>
      ${e.id ? `<p class="aide">${e.creePar ? `Créée par ${esc(e.creePar)}` : "Créée"}${e.creeLe ? ` le ${esc(dateHeure(e.creeLe))}` : ""}${e.faitLe ? ` · close le ${esc(dateHeure(e.faitLe))}` : ""}${e.archivee ? " · archivée" : ""}.</p>` : ""}
      <div class="boutons"><button class="primaire" id="ak-enregistrer">${e.id ? "Enregistrer" : "Créer l'action"}</button>
        <button class="secondaire" id="ak-annuler">Annuler</button>
        ${e.id ? `<button class="secondaire" id="ak-dupliquer">Dupliquer</button>
          <button class="secondaire" id="ak-archiver-f">${e.archivee ? "Restaurer" : "Archiver"}</button>
          <button class="secondaire danger" id="ak-supprimer">${e.confirmerSuppression ? "Confirmer la suppression" : "Supprimer"}</button>` : ""}
        <span class="statut" id="ak-f-statut" role="status"></span></div>
    </div></div>`;
  }
  function panneauHtml() {
    if (!panneau) return "";
    const p = panneau, utilises = nom => actions.filter(a => a.statut === nom).length;
    return `<div class="ak-voile" id="ak-voile-reg"><div class="ak-fenetre large" role="dialog" aria-modal="true" aria-labelledby="ak-r-titre">
      <h2 id="ak-r-titre">Colonnes et cartes</h2>
      <div class="eq-lib">Colonnes du kanban (statuts)</div>
      <p class="aide">Dans l'ordre d'affichage. La colonne de clôture note l'heure de réalisation et arrête le décompte du retard. Renommer une colonne met à jour ses actions ; supprimer une colonne déplace ses actions vers la colonne choisie.</p>
      ${p.statuts.map((x, i) => `<div class="ak-reg-ligne" data-i="${i}">
        <button type="button" class="ak-mini" data-monter="${i}"${i ? "" : " disabled"} aria-label="Monter">↑</button>
        <button type="button" class="ak-mini" data-descendre="${i}"${i < p.statuts.length - 1 ? "" : " disabled"} aria-label="Descendre">↓</button>
        <input type="text" class="ak-emoji" data-champ="emoji" value="${esc(x.emoji)}" placeholder="🙂" maxlength="4" aria-label="Emoji">
        <input type="text" data-champ="nom" value="${esc(x.nom)}" aria-label="Nom de la colonne">
        <input type="color" data-champ="couleur" value="${esc(x.couleur)}" aria-label="Couleur">
        <label class="ak-case"><input type="radio" name="ak-clos" data-champ="clos"${x.clos ? " checked" : ""}> clôture</label>
        ${x.ancien ? `<small class="aide">${utilises(x.ancien)} action(s)</small>` : `<small class="aide">nouvelle</small>`}
        ${p.statuts.length > 2 ? `<button type="button" class="ak-mini danger" data-suppr="${i}" aria-label="Supprimer la colonne">×</button>` : ""}
      </div>`).join("")}
      ${p.supprimes.filter(x => utilises(x) > 0).map(x => `<div class="ak-reg-ligne supprimee">Colonne « ${esc(x)} » supprimée : ses ${utilises(x)} action(s) iront dans
        <select data-cible="${esc(x)}">${p.statuts.map(s => `<option${(p.cibles[x] || p.statuts[0].nom) === s.nom ? " selected" : ""}>${esc(s.nom)}</option>`).join("")}</select></div>`).join("")}
      <button type="button" class="lien" id="ak-reg-plus">+ Ajouter une colonne</button>
      <div class="eq-lib" style="margin-top:14px">Champs affichés sur les cartes</div>
      <div class="ak-champs-carte">${CHAMPS_CARTE.map(([k, t]) => `<label class="ak-case"><input type="checkbox" data-carte="${k}"${p.cartes[k] ? " checked" : ""}> ${t}</label>`).join("")}</div>
      <div class="boutons"><button class="primaire" id="ak-reg-enregistrer">Enregistrer</button><button class="secondaire" id="ak-reg-annuler">Annuler</button>
        <span class="statut" id="ak-reg-statut" role="status"></span></div>
    </div></div>`;
  }

  /* ---------- Événements ---------- */
  function lier() {
    const on = (id, ev, f) => { const el = $(id); if (el) el.addEventListener(ev, f); };
    on("ak-completer", "click", completerTable);
    on("ak-nouvelle", "click", () => ouvrir(null, {}));
    on("ak-recherche", "input", ev => { recherche = ev.target.value; const pos = ev.target.selectionStart; dessiner(); const r = $("ak-recherche"); r.focus(); r.setSelectionRange(pos, pos); });
    on("ak-groupe", "change", ev => { vue.groupe = ev.target.value; memoriser(); dessiner(); });
    on("ak-tri", "change", ev => { vue.tri = ev.target.value; memoriser(); dessiner(); });
    on("ak-resp", "change", ev => { filtreResp = ev.target.value; dessiner(); });
    on("ak-prio", "change", ev => { filtrePrio = ev.target.value; dessiner(); });
    on("ak-archives", "click", () => { archives = !archives; dessiner(); });
    on("ak-reglages", "click", ouvrirPanneau);
    on("ak-filtre-retard", "click", () => { filtreRetard = !filtreRetard; dessiner(); });
    on("ak-anciennes", "change", ev => { vue.masquerAnciennes = ev.target.checked; memoriser(); dessiner(); });
    on("ak-effacer", "click", () => { filtreRetard = false; filtreResp = ""; filtrePrio = ""; recherche = ""; dessiner(); });
    on("ak-col-ajout", "click", () => { nouvelleColonne = { nom: "", couleur: "#8b5cf6" }; dessiner(); $("ak-nc-nom").focus(); });
    on("ak-nc-annuler", "click", () => { nouvelleColonne = null; dessiner(); });
    on("ak-nc-ok", "click", ajouterColonneRapide);
    on("ak-nc-nom", "keydown", ev => { if (ev.key === "Enter") ajouterColonneRapide(); if (ev.key === "Escape") { nouvelleColonne = null; dessiner(); } });
    racine.querySelectorAll("[data-ajout]").forEach(b => b.addEventListener("click", () => {
      const champ = vue.groupe, v = b.dataset.ajout;
      ouvrir(null, champ === "statut" ? { statut: v } : champ === "priorite" ? { priorite: v } : { responsable: +v || null });
    }));
    racine.querySelectorAll("[data-replier]").forEach(b => {
      const f = ev => { ev.stopPropagation(); const k = `${vue.groupe}:${b.dataset.replier}`; vue.replies[k] = !vue.replies[k]; if (!vue.replies[k]) delete vue.replies[k]; memoriser(); dessiner(); };
      b.addEventListener("click", f);
      b.addEventListener("keydown", ev => { if (ev.key === "Enter") f(ev); });
    });
    racine.querySelectorAll(".ak-carte").forEach(c => {
      c.addEventListener("click", ev => { if (ev.target.closest("button")) return; ouvrir(+c.dataset.id); });
      c.addEventListener("keydown", ev => { if (ev.key === "Enter" && ev.target === c) ouvrir(+c.dataset.id); });
      c.addEventListener("dragstart", ev => { glisse = +c.dataset.id; c.classList.add("glisse"); ev.dataTransfer.effectAllowed = "move"; try { ev.dataTransfer.setData("text/plain", c.dataset.id); } catch (_) { /* navigateur */ } });
      c.addEventListener("dragend", () => { c.classList.remove("glisse"); nettoyerSurvol(); });
    });
    racine.querySelectorAll("[data-deplier]").forEach(b => b.addEventListener("click", ev => { ev.stopPropagation(); const id = +b.dataset.deplier; deplies.has(id) ? deplies.delete(id) : deplies.add(id); dessiner(); }));
    racine.querySelectorAll("[data-archiver]").forEach(b => b.addEventListener("click", ev => { ev.stopPropagation(); archiver(+b.dataset.archiver, true); }));
    racine.querySelectorAll("[data-restaurer]").forEach(b => b.addEventListener("click", ev => { ev.stopPropagation(); archiver(+b.dataset.restaurer, false); }));
    racine.querySelectorAll(".ak-cartes").forEach(z => {
      if (archives) return;
      z.addEventListener("dragover", ev => { ev.preventDefault(); z.classList.add("survol"); placerRepere(z, ev.clientY); });
      z.addEventListener("dragleave", ev => { if (!z.contains(ev.relatedTarget)) { z.classList.remove("survol"); const r = z.querySelector(".ak-repere"); if (r) r.remove(); } });
      z.addEventListener("drop", ev => {
        ev.preventDefault();
        const id = glisse || +ev.dataTransfer.getData("text/plain"), index = indexRepere(z);
        glisse = null; nettoyerSurvol();
        if (id) deplacer(id, z.dataset.champ, z.dataset.cle, index);
      });
    });
    if (edition) lierFenetre();
    if (panneau) lierPanneau();
  }
  // Repère d'insertion pendant le glisser (utile en tri manuel)
  function placerRepere(z, y) {
    if (vue.tri !== "manuel") return;
    let r = z.querySelector(".ak-repere");
    if (!r) { r = document.createElement("div"); r.className = "ak-repere"; }
    const cartes = [...z.querySelectorAll(".ak-carte:not(.glisse)")];
    const apres = cartes.find(c => { const b = c.getBoundingClientRect(); return y < b.top + b.height / 2; });
    if (apres) z.insertBefore(r, apres); else z.appendChild(r);
  }
  function indexRepere(z) {
    const r = z.querySelector(".ak-repere");
    if (!r) return null;
    return [...z.children].filter(x => x.classList.contains("ak-carte") && !x.classList.contains("glisse") || x === r).indexOf(r);
  }
  const nettoyerSurvol = () => racine.querySelectorAll(".ak-cartes").forEach(z => { z.classList.remove("survol"); const r = z.querySelector(".ak-repere"); if (r) r.remove(); });

  function ouvrir(id, defauts) {
    const a = id ? actions.find(x => x.id === id) : null;
    edition = a ? { ...a } : { id: null, titre: "", description: "", statut: statutParDefaut(), priorite: "Moyenne", responsable: null, echeance: null, ...defauts };
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
    $("ak-voile").addEventListener("mousedown", ev => { if (ev.target.id === "ak-voile") fermer(); });
    $("ak-voile").addEventListener("keydown", ev => { if (ev.key === "Escape") fermer(); });
    $("ak-enregistrer").addEventListener("click", () => { lireFenetre(); enregistrer(); });
    $("ak-titre").addEventListener("keydown", ev => { if (ev.key === "Enter") { lireFenetre(); enregistrer(); } });
    if ($("ak-dupliquer")) $("ak-dupliquer").addEventListener("click", () => { lireFenetre(); dupliquer(); });
    if ($("ak-archiver-f")) $("ak-archiver-f").addEventListener("click", () => { const e = edition; edition = null; archiver(e.id, !e.archivee); });
    if ($("ak-supprimer")) $("ak-supprimer").addEventListener("click", () => {
      lireFenetre();
      if (!edition.confirmerSuppression) { edition.confirmerSuppression = true; dessiner(); return; }
      supprimer();
    });
  }
  const dire = (id, t, err) => { const st = $(id); if (st) { st.textContent = t; st.className = `statut${err ? " err" : " ok"}`; } };
  const action = (...l) => grist.docApi.applyUserActions(l);
  async function relire() { actions = await S.lireActions(general); dessiner(); }

  /* ---------- Écritures : actions ---------- */
  // Passage dans / hors de la colonne de clôture : heure de réalisation notée ou effacée
  function champsStatut(nouveau, ancien) {
    const c1 = !!(statutDef(nouveau) || {}).clos, c0 = !!(statutDef(ancien) || {}).clos;
    return c1 && !c0 ? { Fait_le: Date.now() / 1000 } : !c1 && c0 ? { Fait_le: null } : {};
  }
  const ordreFin = statut => Math.max(0, ...actions.filter(a => a.statut === statut).map(cleOrdre)) + 1;
  async function enregistrer() {
    const e = edition;
    if (!e.titre.trim()) { dire("ak-f-statut", "Donnez un titre à l'action.", true); $("ak-titre").focus(); return; }
    const avant = e.id ? actions.find(x => x.id === e.id) : null;
    const champs = { Titre: e.titre.trim(), Description: e.description.trim(), Statut: e.statut, Priorite: e.priorite, Responsable: e.responsable || 0,
      Echeance: e.echeance, ...champsStatut(e.statut, avant ? avant.statut : null), ...(!avant || avant.statut !== e.statut ? { Ordre: ordreFin(e.statut) } : {}) };
    try {
      await action(e.id ? ["UpdateRecord", table(), e.id, champs] : ["AddRecord", table(), null, champs]);
      edition = null; await relire();
      dire("ak-statut", e.id ? "Action enregistrée." : "Action créée.");
    } catch (err) { dire("ak-f-statut", `Enregistrement refusé par Grist (${err.message || err}).`, true); }
  }
  async function dupliquer() {
    const e = edition;
    const champs = { Titre: `${e.titre.trim()} (copie)`, Description: e.description.trim(), Statut: statutParDefaut(), Priorite: e.priorite,
      Responsable: e.responsable || 0, Echeance: e.echeance, Ordre: ordreFin(statutParDefaut()) };
    try { await action(["AddRecord", table(), null, champs]); edition = null; await relire(); dire("ak-statut", "Action dupliquée."); }
    catch (err) { dire("ak-f-statut", `Duplication refusée par Grist (${err.message || err}).`, true); }
  }
  async function deplacer(id, champ, cle, index) {
    const a = actions.find(x => x.id === id);
    if (!a || !champ) return;
    const champs = {};
    if (champ === "statut" && a.statut !== cle) Object.assign(champs, { Statut: cle }, champsStatut(cle, a.statut));
    if (champ === "priorite" && a.priorite !== cle) champs.Priorite = cle;
    if (champ === "responsable" && String(a.responsable || "") !== cle) champs.Responsable = +cle || 0;
    // tri manuel : position entre les voisines de la colonne d'arrivée
    if (vue.tri === "manuel" && index != null) {
      const voisines = trier(filtrees().filter(x => x.id !== id && valeurDe(x, champ) === cle));
      const prec = voisines[index - 1], suiv = voisines[index];
      const o = prec && suiv ? (cleOrdre(prec) + cleOrdre(suiv)) / 2 : prec ? cleOrdre(prec) + 1 : suiv ? cleOrdre(suiv) - 1 : 1;
      if (o !== a.ordre) champs.Ordre = o;
    }
    if (!Object.keys(champs).length) return;
    // affichage immédiat, puis écriture
    if (champs.Statut) a.statut = champs.Statut;
    if (champs.Priorite) a.priorite = champs.Priorite;
    if ("Responsable" in champs) a.responsable = champs.Responsable || null;
    if ("Ordre" in champs) a.ordre = champs.Ordre;
    if ("Fait_le" in champs) a.faitLe = champs.Fait_le;
    dessiner();
    try { await action(["UpdateRecord", table(), id, champs]); dire("ak-statut", champs.Statut ? `« ${a.titre} » → ${champs.Statut}` : "Action déplacée."); }
    catch (err) { dire("ak-statut", `Déplacement refusé par Grist (${err.message || err}).`, true); }
    await relire();
  }
  async function archiver(id, oui) {
    try { await action(["UpdateRecord", table(), id, { Archivee: oui }]); await relire(); dire("ak-statut", oui ? "Action archivée (bouton « Archives » pour la retrouver)." : "Action restaurée."); }
    catch (err) { dire("ak-statut", `Refusé par Grist (${err.message || err}).`, true); }
  }
  async function supprimer() {
    try { await action(["RemoveRecord", table(), edition.id]); edition = null; await relire(); dire("ak-statut", "Action supprimée."); }
    catch (err) { dire("ak-f-statut", `Suppression refusée par Grist (${err.message || err}).`, true); }
  }

  /* ---------- Réglages des colonnes et des cartes ---------- */
  function ouvrirPanneau() {
    panneau = { statuts: reglages.statuts.map(x => ({ ...x, ancien: x.nom })), cartes: { ...reglages.cartes }, supprimes: [], cibles: {} };
    dessiner();
  }
  function lierPanneau() {
    const p = panneau, z = $("ak-voile-reg");
    const fermer = () => { panneau = null; dessiner(); };
    $("ak-reg-annuler").addEventListener("click", fermer);
    z.addEventListener("keydown", ev => { if (ev.key === "Escape") fermer(); });
    z.addEventListener("input", ev => {
      const l = ev.target.closest(".ak-reg-ligne[data-i]"), ch = ev.target.dataset.champ;
      if (l && ch && ch !== "clos") p.statuts[+l.dataset.i][ch] = ev.target.value;
    });
    z.addEventListener("change", ev => {
      const t = ev.target, l = t.closest(".ak-reg-ligne[data-i]");
      if (l && t.dataset.champ === "clos") p.statuts.forEach((x, i) => { x.clos = i === +l.dataset.i; });
      if (t.dataset.carte) p.cartes[t.dataset.carte] = t.checked;
      if (t.dataset.cible) p.cibles[t.dataset.cible] = t.value;
    });
    z.addEventListener("click", ev => {
      const b = ev.target.closest("button"); if (!b) return;
      const ech = (i, j) => { [p.statuts[i], p.statuts[j]] = [p.statuts[j], p.statuts[i]]; };
      if (b.dataset.monter != null) ech(+b.dataset.monter, +b.dataset.monter - 1);
      else if (b.dataset.descendre != null) ech(+b.dataset.descendre, +b.dataset.descendre + 1);
      else if (b.dataset.suppr != null) { const [x] = p.statuts.splice(+b.dataset.suppr, 1); if (x.ancien) p.supprimes.push(x.ancien); if (x.clos && p.statuts.length) p.statuts[p.statuts.length - 1].clos = true; }
      else if (b.id === "ak-reg-plus") p.statuts.splice(Math.max(0, p.statuts.findIndex(x => x.clos)), 0, { nom: "", couleur: "#8b5cf6", emoji: "", clos: false, ancien: null });
      else if (b.id === "ak-reg-enregistrer") { enregistrerReglages(); return; }
      else return;
      dessiner();
    });
  }
  async function ecrireReglages(statuts, cartes, renommages, deplacements) {
    const meta = await S.lireMeta(), acts = [];
    const nouveau = { statuts: statuts.map(({ nom, couleur, emoji, clos }) => ({ nom, couleur, emoji, clos })), cartes };
    for (const [ancien, nom] of renommages) actions.filter(a => a.statut === ancien).forEach(a => acts.push(["UpdateRecord", table(), a.id, { Statut: nom }]));
    for (const [ancien, cible] of deplacements) actions.filter(a => a.statut === ancien).forEach(a => acts.push(["UpdateRecord", table(), a.id, { Statut: cible }]));
    const col = meta[table()] && meta[table()].colonnes.Statut;
    if (col && /^Choice/.test(col.type)) {
      let o = {}; try { o = JSON.parse(col.widgetOptions || "{}") || {}; } catch (_) { o = {}; }
      acts.push(["ModifyColumn", table(), "Statut", { widgetOptions: JSON.stringify({ ...o, ...JSON.parse(S.optionsStatuts(nouveau.statuts)) }) }]);
    }
    await grist.docApi.applyUserActions([S.actionConfig(config, "actions", nouveau), ...acts]);
    config = await S.lireConfig(); reglages = S.reglagesActions(config);
  }
  async function enregistrerReglages() {
    const p = panneau;
    p.statuts.forEach(x => { x.nom = x.nom.trim(); });
    if (p.statuts.some(x => !x.nom)) { dire("ak-reg-statut", "Chaque colonne a besoin d'un nom.", true); return; }
    const noms = p.statuts.map(x => S.norm(x.nom));
    if (noms.some((n, i) => noms.indexOf(n) !== i)) { dire("ak-reg-statut", "Deux colonnes portent le même nom.", true); return; }
    if (p.statuts.length < 2) { dire("ak-reg-statut", "Gardez au moins deux colonnes.", true); return; }
    if (!p.statuts.some(x => x.clos)) p.statuts[p.statuts.length - 1].clos = true;
    const renommages = p.statuts.filter(x => x.ancien && x.ancien !== x.nom).map(x => [x.ancien, x.nom]);
    const deplacements = p.supprimes.map(x => [x, p.cibles[x] || p.statuts[0].nom]);
    try {
      await ecrireReglages(p.statuts, p.cartes, renommages, deplacements);
      panneau = null; await relire();
      dire("ak-statut", `Colonnes et cartes enregistrées.${renommages.length ? ` Renommage reporté : ${renommages.map(([a, b]) => `${a} → ${b}`).join(", ")}.` : ""}`);
    } catch (err) { dire("ak-reg-statut", `Enregistrement refusé par Grist (${err.message || err}).`, true); }
  }
  async function ajouterColonneRapide() {
    const nom = $("ak-nc-nom").value.trim(), couleur = $("ak-nc-couleur").value;
    if (!nom) { $("ak-nc-nom").focus(); return; }
    if (reglages.statuts.some(x => S.norm(x.nom) === S.norm(nom))) { dire("ak-statut", "Une colonne porte déjà ce nom.", true); return; }
    // insérée avant la colonne de clôture
    const l = reglages.statuts.slice(), i = l.findIndex(x => x.clos);
    l.splice(i < 0 ? l.length : i, 0, { nom, couleur, emoji: "", clos: false });
    try { await ecrireReglages(l, reglages.cartes, [], []); nouvelleColonne = null; dessiner(); dire("ak-statut", `Colonne « ${nom} » ajoutée.`); }
    catch (err) { dire("ak-statut", `Ajout refusé par Grist (${err.message || err}).`, true); }
  }

  /* ---------- Table ---------- */
  async function creerTable() {
    const meta = await S.lireMeta(), plan = S.planInstallation(meta, config);
    if (!meta[general.agents] && !plan.etapes.some(e => e.id === `table-${general.agents}`)) { dire("ak-statut", "Créez d'abord l'équipe (onglet Équipe).", true); return; }
    const etapes = plan.etapes.filter(e => e.id === `table-${general.agents}` || e.id === `table-${table()}` || e.id === `cols-${table()}`)
      .sort((a, b) => (a.id === `table-${general.agents}` ? -1 : b.id === `table-${general.agents}` ? 1 : 0));
    const ko = (await S.appliquer(etapes)).find(r => !r.ok);
    if (ko) { dire("ak-statut", `Création refusée par Grist (${ko.erreur}).`, true); return; }
    await charger(); dessiner();
  }
  async function completerTable() {
    const meta = await S.lireMeta(), e = S.planInstallation(meta, config).etapes.find(x => x.id === `cols-${table()}`);
    if (e) { const [r] = await S.appliquer([e]); if (!r.ok) { dire("ak-statut", `Refusé par Grist (${r.erreur}).`, true); return; } }
    await charger(); dessiner();
  }

  // Actualisation périodique (autre coordinateur) quand l'onglet est visible et qu'aucune fenêtre n'est ouverte
  setInterval(async () => {
    if (!racine || racine.hidden || edition || panneau || nouvelleColonne || glisse || document.hidden || actions === null) return;
    try { const l = await S.lireActions(general); if (JSON.stringify(l) !== JSON.stringify(actions)) { actions = l; dessiner(); } } catch (_) { /* réseau */ }
  }, 30000);

  async function afficher() {
    racine = $("onglet-actions");
    racine.innerHTML = `<div class="bandeau info" style="margin:16px">Lecture des actions…</div>`;
    try { await charger(); } catch (e) { racine.innerHTML = `<div class="bandeau alerte" style="margin:16px">Lecture impossible : ${esc(e.message || e)}</div>`; return; }
    dessiner();
  }
  window.OngletActions = { afficher };
})();
