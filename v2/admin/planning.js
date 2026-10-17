/* =====================================================================
   Administration v2 — onglet « Planning » : créneaux de la cellule et affectations
   ---------------------------------------------------------------------
   - Creneaux : créneaux nommés de chaque jour (Matin 8 h–13 h…), créés un par un ou à partir des modèles de journée.
   - Affectations : un agent sur un créneau, avec sa fonction (opérateur, rédacteur…) et, si besoin, un périmètre
     propre au créneau ; vide = périmètre de sa fiche. La page de saisie de l'agent applique le périmètre du créneau en cours.
   - Cellule du jour, semaine en grille, suivi individuel (créneaux et heures par agent).
   - Réglages (clé « planning » de Config) : liste des fonctions, modèles de journée.
   Heures : celles du navigateur (la cellule travaille à l'heure de Paris).
   ===================================================================== */
(function () {
  "use strict";
  const S = window.Socle, R = window.Repartition;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

  let config, general, ref, agents, planning, reglages, racine;
  let lundi = null;          // premier jour de la semaine affichée (AAAA-MM-JJ)
  let edition = null;        // créneau en cours de modification
  let suivi = null;          // agent dont le détail est affiché
  let reglagesEdites = null; // copie des réglages en cours de modification

  /* ---------- Dates (heure locale) ---------- */
  const pad = n => String(n).padStart(2, "0");
  const isoLocal = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dateDe = iso => { const [y, m, j] = iso.split("-").map(Number); return new Date(y, m - 1, j); };
  const plusJours = (iso, n) => { const d = dateDe(iso); d.setDate(d.getDate() + n); return isoLocal(d); };
  const lundiDe = iso => { const d = dateDe(iso); return plusJours(iso, -((d.getDay() + 6) % 7)); };
  const aujourdhui = () => isoLocal(new Date());
  const dateGrist = iso => { const [y, m, j] = iso.split("-").map(Number); return Date.UTC(y, m - 1, j) / 1000; };
  const isoDeGrist = sec => new Date(sec * 1000).toISOString().slice(0, 10);
  const instant = (iso, hhmm) => { const [h, mi] = String(hhmm || "0:0").split(":").map(Number); const d = dateDe(iso); d.setHours(h || 0, mi || 0, 0, 0); return d.getTime() / 1000; };
  const hhmm = sec => { const d = new Date(sec * 1000); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const heure = sec => { const d = new Date(sec * 1000); return `${d.getHours()} h${d.getMinutes() ? ` ${pad(d.getMinutes())}` : ""}`; };
  const plage = c => c.debut && c.fin ? `${heure(c.debut)}–${heure(c.fin)}` : "horaires à préciser";
  const jourCourt = iso => { const d = dateDe(iso); return `${JOURS[d.getDay()].slice(0, 3)}. ${d.getDate()}`; };
  const jourLong = iso => { const d = dateDe(iso); return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`; };
  const duree = h => { const t = Math.round(h * 60); return `${Math.floor(t / 60)} h${t % 60 ? ` ${pad(t % 60)}` : ""}`; };
  const jourDuCreneau = c => c.date ? isoDeGrist(c.date) : (c.debut ? isoLocal(new Date(c.debut * 1000)) : "");
  const heures = c => c.debut && c.fin && c.fin > c.debut ? (c.fin - c.debut) / 3600 : 0;
  // Fin avant début : le créneau finit le lendemain (créneau de nuit)
  const bornes = (iso, debut, fin) => { const d = instant(iso, debut); let f = instant(iso, fin); if (f <= d) f = instant(plusJours(iso, 1), fin); return [d, f]; };

  /* ---------- Lecture ---------- */
  const T = () => ({ creneaux: general.creneaux || "Creneaux", affectations: general.affectations || "Affectations", agents: general.agents || "Agents" });
  async function charger() {
    config = await S.lireConfig();
    general = S.general(config);
    reglages = S.reglagesPlanning(config);
    ref = await R.lireReferentiel(general, config);
    agents = await R.lireAgents(general, ref);
    planning = await S.lirePlanning(general);
  }
  const agentDe = id => (agents || []).find(a => a.id === id) || null;
  const creneauxDu = iso => planning.creneaux.filter(c => jourDuCreneau(c) === iso);
  const affectationsDe = cId => planning.affectations.filter(a => a.creneau === cId);
  const fonctionDeSaisie = nom => !!(reglages.fonctions.find(f => f.nom === nom) || {}).saisie;
  const perimetreAff = a => {   // { perimetre, propre } : propre = défini pour le créneau
    const ag = agentDe(a.agent);
    if (String(a.perimetre || "").trim()) return { perimetre: R.perimetreObjet(ref, a.perimetre), propre: true };
    return { perimetre: ag ? ag.perimetre : {}, propre: false };
  };
  const resume = p => R.resumePerimetre(p) || "tous les établissements";

  /* ---------- Rendu ---------- */
  function dessiner() {
    if (!config) { racine.innerHTML = `<div class="bandeau alerte">La table Config est absente : lancez d'abord l'installation.</div>`; return; }
    if (agents === null || planning === null) {
      const manque = [agents === null ? T().agents : null, planning === null ? `${T().creneaux} et ${T().affectations}` : null].filter(Boolean).join(", ");
      racine.innerHTML = `<div class="bandeau info">Tables à créer : ${esc(manque)}.</div>
        <section class="carte"><h2>Planning de la cellule</h2>
        <p class="aide">Des créneaux nommés pour chaque jour (matin, après-midi, astreinte…), et pour chacun les agents présents, avec leur fonction et leur périmètre. La page de saisie d'un agent applique le périmètre du créneau en cours.</p>
        <div class="boutons"><button class="primaire" id="pl-creer-tables">Créer les tables du planning</button><span class="statut" id="pl-statut"></span></div></section>`;
      $("pl-creer-tables").addEventListener("click", creerTables);
      return;
    }
    racine.innerHTML = `${carteDuJour()}${carteSemaine()}${edition ? carteEdition() : ""}${carteSuivi()}${carteReglages()}`;
    lier();
  }

  // Alertes de couverture d'un créneau : aucune fonction de saisie ; valeurs du premier critère sans agent de saisie
  function alertesCreneau(c) {
    const affs = affectationsDe(c.id), saisie = affs.filter(a => fonctionDeSaisie(a.fonction));
    const out = [];
    if (!affs.length) return ["aucun agent affecté"];
    if (!saisie.length) out.push("aucun agent de saisie");
    const crit = R.criteres(ref, config), c0 = crit[0];
    if (c0 && saisie.length) {
      const perims = saisie.map(a => perimetreAff(a).perimetre);
      if (!perims.some(p => !(p[c0] || []).length)) {
        const sans = ref.valeurs[c0].map(x => x.v).filter(v => !perims.some(p => (p[c0] || []).includes(v)));
        if (sans.length) out.push(`${R.libelleCritere(ref, c0).toLowerCase()} sans agent de saisie : ${sans.join(", ")}`);
      }
    }
    return out;
  }
  function ligneAgent(a, avecTel) {
    const ag = agentDe(a.agent), p = perimetreAff(a);
    return `<li><strong>${esc(ag ? ag.nom : `agent n° ${a.agent}`)}</strong> · ${esc(a.fonction || "fonction ?")} · <span class="${p.propre ? "pl-propre" : ""}" title="${p.propre ? "Périmètre propre à ce créneau" : "Périmètre de la fiche de l'agent"}">${esc(resume(p.perimetre))}</span>${avecTel && ag && ag.telephone ? ` · ${esc(ag.telephone)}` : ""}${ag && !ag.actif ? ` <span class="pastille manque">inactif</span>` : ""}</li>`;
  }
  function carteDuJour() {
    const iso = aujourdhui(), t = Date.now() / 1000, cs = creneauxDu(iso);
    const html = cs.map(c => {
      const etat = c.debut <= t && t < c.fin ? `<span class="pastille ok">en cours</span>` : t < c.debut ? `<span class="pastille">à venir</span>` : `<span class="pastille">terminé</span>`;
      const al = alertesCreneau(c);
      return `<div class="pl-jour-creneau${c.debut <= t && t < c.fin ? " en-cours" : ""}"><div><strong>${esc(c.nom)}</strong> ${esc(plage(c))} ${etat}
        <button type="button" class="lien" data-editer="${c.id}">modifier</button></div>
        <ul>${affectationsDe(c.id).map(a => ligneAgent(a, true)).join("")}</ul>
        ${al.map(x => `<p class="avert">${esc(x)}</p>`).join("")}</div>`;
    }).join("");
    return `<section class="carte"><h2>Cellule du jour — ${esc(jourLong(iso))}</h2>
      ${cs.length ? `${html}<p class="aide">Périmètre <span class="pl-propre">surligné</span> : propre au créneau ; sinon, celui de la fiche de l'agent.</p>` : `<p class="vide">Aucun créneau aujourd'hui.</p>`}</section>`;
  }
  function carteSemaine() {
    const jours = [...Array(7)].map((_, i) => plusJours(lundi, i)), dim = jours[6], d0 = dateDe(lundi), d6 = dateDe(dim);
    const titre = `Semaine du ${d0.getDate()}${d0.getMonth() !== d6.getMonth() ? ` ${MOIS[d0.getMonth()]}` : ""} au ${d6.getDate()} ${MOIS[d6.getMonth()]} ${d6.getFullYear()}`;
    const cols = jours.map(iso => {
      const cs = creneauxDu(iso);
      return `<div class="pl-col${iso === aujourdhui() ? " auj" : ""}"><div class="pl-col-tete">${esc(jourCourt(iso))}</div>
        ${cs.map(c => { const affs = affectationsDe(c.id), al = alertesCreneau(c);
          return `<button type="button" class="pl-creneau${edition && edition.id === c.id ? " choisi" : ""}${al.length ? " alerte" : ""}" data-editer="${c.id}" title="${esc(al.join(" ; "))}">
            <span class="pl-c-nom">${esc(c.nom)}</span><span class="pl-c-h">${esc(plage(c))}</span>
            ${affs.map(a => { const ag = agentDe(a.agent); return `<span class="pl-c-ag">${esc(ag ? ag.nom : "?")} <small>${esc(a.fonction)}</small></span>`; }).join("") || `<span class="pl-c-vide">personne</span>`}</button>`; }).join("")}
        <button type="button" class="pl-ajout" data-nouveau="${iso}">+ créneau</button></div>`;
    }).join("");
    const modeles = reglages.modeles;
    const choixModele = iso => { const we = [0, 6].includes(dateDe(iso).getDay()); const def = modeles.find(m => S.norm(m.nom).includes(we ? "week" : "semaine")) || (we ? null : modeles[0]);
      return `<label class="pl-modele"><span>${esc(jourCourt(iso))}</span><select data-modele-jour="${iso}"><option value="">—</option>${modeles.map((m, i) => `<option value="${i}"${def === m && !creneauxDu(iso).length ? " selected" : ""}>${esc(m.nom)}</option>`).join("")}</select></label>`; };
    return `<section class="carte"><div class="pl-barre"><h2>${esc(titre)}</h2>
        <button type="button" class="secondaire petit" id="pl-prec" aria-label="Semaine précédente">◀</button>
        <button type="button" class="secondaire petit" id="pl-auj">Cette semaine</button>
        <button type="button" class="secondaire petit" id="pl-suiv" aria-label="Semaine suivante">▶</button></div>
      <div class="pl-grille">${cols}</div>
      <details class="pl-outils"><summary>Remplir la semaine</summary>
        <p class="aide">Créer les créneaux d'un modèle de journée (réglages en bas de page) pour chaque jour choisi. Un créneau de même nom déjà présent ce jour-là n'est pas recréé.</p>
        ${modeles.length ? `<div class="pl-modeles">${jours.map(choixModele).join("")}</div>
          <div class="boutons"><button class="primaire" id="pl-appliquer-modeles">Créer les créneaux</button></div>` : `<p class="vide">Aucun modèle de journée.</p>`}
        <p class="aide" style="margin-top:12px">Ou reprendre la semaine précédente : ses créneaux et ses affectations sont recopiés sur les jours de cette semaine qui n'ont encore aucun créneau.</p>
        <div class="boutons"><button class="secondaire" id="pl-copier">Copier la semaine précédente</button></div></details>
      <p class="statut" id="pl-statut" role="status"></p></section>`;
  }

  function carteEdition() {
    const e = edition, crit = R.criteres(ref, config);
    const dispo = agents.filter(a => a.actif && !e.affectations.some(x => x.agent === a.id));
    const lignes = e.affectations.map((a, i) => {
      const ag = agentDe(a.agent), propre = a.perimetre !== null;
      const fonctionsListe = [...reglages.fonctions.map(f => f.nom), ...(a.fonction && !reglages.fonctions.some(f => f.nom === a.fonction) ? [a.fonction] : [])];
      return `<div class="pl-aff" data-i="${i}">
        <div class="pl-aff-haut"><strong>${esc(ag ? ag.nom : "?")}</strong>
          <select data-champ="fonction" aria-label="Fonction de ${esc(ag ? ag.nom : "")}">${fonctionsListe.map(n => `<option${n === a.fonction ? " selected" : ""}>${esc(n)}</option>`).join("")}</select>
          <label class="pl-case"><input type="checkbox" data-champ="propre"${propre ? " checked" : ""}> périmètre propre au créneau</label>
          <button type="button" class="pl-mini danger" data-retirer="${i}" title="Retirer du créneau" aria-label="Retirer ${esc(ag ? ag.nom : "")}">×</button></div>
        ${propre ? (crit.length ? crit.map(c => `<div class="eq-crit-lib">${esc(R.libelleCritere(ref, c))}</div><div class="eq-puces">${ref.valeurs[c].map(x => {
            const on = (a.perimetre[c] || []).includes(x.v);
            return `<button type="button" class="eq-puce${on ? " on" : ""}" data-col="${esc(c)}" data-val="${esc(x.v)}" aria-pressed="${on}">${esc(x.v)}</button>`; }).join("")}</div>`).join("") : `<p class="vide">Aucun critère de répartition (onglet Équipe).</p>`)
          + `<small class="aide">${esc(resume(a.perimetre))}</small>`
          : `<small class="aide">Périmètre de la fiche : ${esc(resume(ag ? ag.perimetre : {}))}</small>`}
      </div>`;
    }).join("");
    return `<section class="carte" id="pl-edition"><h2>${e.id ? `Créneau « ${esc(e.nom)} »` : "Nouveau créneau"} — ${esc(jourLong(e.jour))}</h2>
      <div class="pl-champs">
        <label class="champ"><span>Nom</span><input type="text" id="pl-nom" value="${esc(e.nom)}" placeholder="Matin, astreinte…"></label>
        <label class="champ"><span>Début</span><input type="time" id="pl-debut" value="${esc(e.debut)}"></label>
        <label class="champ"><span>Fin</span><small>Avant le début : finit le lendemain.</small><input type="time" id="pl-fin" value="${esc(e.fin)}"></label>
        <label class="champ pl-note"><span>Note</span><input type="text" id="pl-note-c" value="${esc(e.note)}"></label>
      </div>
      <div class="eq-lib">Agents (${e.affectations.length})</div>
      ${lignes || `<p class="vide">Personne pour l'instant.</p>`}
      <div class="pl-ajout-agent">${dispo.length ? `<select id="pl-agent"><option value="">+ affecter un agent…</option>${dispo.map(a => `<option value="${a.id}">${esc(a.nom)} (${esc(a.fonction || "?")})</option>`).join("")}</select>` : `<span class="vide">Tous les agents actifs sont affectés.</span>`}
        <small class="aide">Un agent absent de la liste se crée dans l'onglet Équipe.</small></div>
      <div class="boutons"><button class="primaire" id="pl-enregistrer">${e.id ? "Enregistrer le créneau" : "Créer le créneau"}</button>
        <button class="secondaire" id="pl-fermer">Fermer</button>
        ${e.id ? `<button class="secondaire danger" id="pl-supprimer">Supprimer le créneau…</button>` : ""}
        <span class="statut" id="pl-edition-statut" role="status"></span></div></section>`;
  }

  function carteSuivi() {
    const t = Date.now() / 1000, jours = new Set([...Array(7)].map((_, i) => plusJours(lundi, i)));
    const parAgent = new Map();
    const parId = new Map(planning.creneaux.map(c => [c.id, c]));
    for (const a of planning.affectations) {
      const c = parId.get(a.creneau); if (!c) continue;
      if (!parAgent.has(a.agent)) parAgent.set(a.agent, []);
      parAgent.get(a.agent).push({ a, c });
    }
    const lignes = agents.filter(ag => ag.actif || parAgent.has(ag.id)).map(ag => {
      const l = parAgent.get(ag.id) || [], sem = l.filter(x => jours.has(jourDuCreneau(x.c)));
      const faits = l.filter(x => x.c.fin <= t), prochain = l.filter(x => x.c.fin > t).sort((x, y) => x.c.debut - y.c.debut)[0];
      return `<tr data-suivi="${ag.id}" class="eq-ligne${suivi === ag.id ? " choisi" : ""}" tabindex="0"><td><strong>${esc(ag.nom)}</strong></td><td>${esc(ag.fonction)}</td>
        <td>${sem.length}</td><td>${duree(sem.reduce((n, x) => n + heures(x.c), 0))}</td>
        <td>${faits.length} · ${duree(faits.reduce((n, x) => n + heures(x.c), 0))}</td>
        <td>${prochain ? `${esc(jourCourt(jourDuCreneau(prochain.c)))} ${esc(prochain.c.nom)} (${esc(heure(prochain.c.debut))})` : `<span class="vide">—</span>`}</td></tr>`;
    }).join("");
    let detail = "";
    const ag = suivi != null ? agentDe(suivi) : null;
    if (ag) {
      const l = (parAgent.get(ag.id) || []).sort((x, y) => (y.c.debut || 0) - (x.c.debut || 0));
      detail = `<div class="pl-detail"><h3>${esc(ag.nom)} — ${l.length} créneau${l.length > 1 ? "x" : ""}, ${duree(l.reduce((n, x) => n + heures(x.c), 0))}</h3>
        ${l.length ? `<table><thead><tr><th>Jour</th><th>Créneau</th><th>Fonction</th><th>Périmètre</th><th>Durée</th></tr></thead><tbody>
          ${l.map(({ a, c }) => { const p = perimetreAff(a); return `<tr${c.fin <= t ? "" : ` class="avenir"`}><td>${esc(jourLong(jourDuCreneau(c)))}</td><td>${esc(c.nom)} ${esc(plage(c))}</td><td>${esc(a.fonction)}</td>
            <td><span class="${p.propre ? "pl-propre" : ""}">${esc(resume(p.perimetre))}</span></td><td>${duree(heures(c))}</td></tr>`; }).join("")}</tbody></table>` : `<p class="vide">Aucun créneau.</p>`}</div>`;
    }
    return `<section class="carte"><h2>Suivi individuel</h2>
      <p class="aide">Créneaux et heures prévus au planning, par agent. « Effectués » compte les créneaux terminés. Cliquez sur un agent pour le détail.</p>
      <table class="eq-table"><thead><tr><th>Agent</th><th>Fonction habituelle</th><th>Créneaux (semaine affichée)</th><th>Heures (semaine)</th><th>Effectués</th><th>Prochain créneau</th></tr></thead><tbody>${lignes}</tbody></table>
      ${detail}</section>`;
  }

  function carteReglages() {
    const r = reglagesEdites || JSON.parse(JSON.stringify(reglages));
    reglagesEdites = r;
    return `<section class="carte"><details id="pl-reglages"${reglagesOuverts ? " open" : ""}><summary><strong>Réglages : fonctions et modèles de journée</strong></summary>
      <div class="eq-lib" style="margin-top:8px">Fonctions dans la cellule</div>
      <p class="aide">« Saisit » : les agents de cette fonction ont une page de saisie (cochée d'office dans l'onglet Formulaires) et comptent pour la couverture des créneaux.</p>
      ${r.fonctions.map((f, i) => `<div class="pl-reg-ligne" data-fonction="${i}"><input type="text" data-champ="nom" value="${esc(f.nom)}" aria-label="Nom de la fonction">
        <label class="pl-case"><input type="checkbox" data-champ="saisie"${f.saisie ? " checked" : ""}> saisit</label>
        <button type="button" class="pl-mini danger" data-suppr-fonction="${i}" aria-label="Supprimer la fonction">×</button></div>`).join("")}
      <button type="button" class="lien" id="pl-plus-fonction">+ fonction</button>
      <div class="eq-lib" style="margin-top:14px">Modèles de journée</div>
      ${r.modeles.map((m, i) => `<div class="pl-reg-modele" data-modele="${i}"><div class="pl-reg-ligne"><input type="text" data-champ="nom" value="${esc(m.nom)}" aria-label="Nom du modèle">
          <button type="button" class="pl-mini danger" data-suppr-modele="${i}" aria-label="Supprimer le modèle">×</button></div>
        ${m.creneaux.map((c, j) => `<div class="pl-reg-ligne pl-reg-creneau" data-creneau="${j}"><input type="text" data-champ="nom" value="${esc(c.nom)}" aria-label="Nom du créneau">
          <input type="time" data-champ="debut" value="${esc(c.debut)}" aria-label="Début"><input type="time" data-champ="fin" value="${esc(c.fin)}" aria-label="Fin">
          <button type="button" class="pl-mini danger" data-suppr-creneau="${j}" aria-label="Supprimer le créneau">×</button></div>`).join("")}
        <button type="button" class="lien" data-plus-creneau="${i}">+ créneau</button></div>`).join("")}
      <button type="button" class="lien" id="pl-plus-modele">+ modèle</button>
      <div class="boutons"><button class="primaire" id="pl-reg-enregistrer">Enregistrer les réglages</button><span class="statut" id="pl-reg-statut" role="status"></span></div>
      </details></section>`;
  }
  let reglagesOuverts = false;

  /* ---------- Événements ---------- */
  function lier() {
    racine.querySelectorAll("[data-editer]").forEach(b => b.addEventListener("click", () => ouvrir(+b.dataset.editer)));
    racine.querySelectorAll("[data-nouveau]").forEach(b => b.addEventListener("click", () => {
      edition = { id: null, jour: b.dataset.nouveau, nom: "", debut: "08:00", fin: "13:00", note: "", affectations: [], origine: [] };
      dessiner(); $("pl-edition").scrollIntoView({ block: "nearest" }); $("pl-nom").focus();
    }));
    $("pl-prec").addEventListener("click", () => { lundi = plusJours(lundi, -7); dessiner(); });
    $("pl-suiv").addEventListener("click", () => { lundi = plusJours(lundi, 7); dessiner(); });
    $("pl-auj").addEventListener("click", () => { lundi = lundiDe(aujourdhui()); dessiner(); });
    if ($("pl-appliquer-modeles")) $("pl-appliquer-modeles").addEventListener("click", appliquerModeles);
    $("pl-copier").addEventListener("click", copierSemaine);
    racine.querySelectorAll("[data-suivi]").forEach(tr => {
      const f = () => { suivi = suivi === +tr.dataset.suivi ? null : +tr.dataset.suivi; dessiner(); };
      tr.addEventListener("click", f); tr.addEventListener("keydown", e => { if (e.key === "Enter") f(); });
    });
    if (edition) lierEdition();
    lierReglages();
  }
  function ouvrir(id) {
    const c = planning.creneaux.find(x => x.id === id);
    if (!c) return;
    const affs = affectationsDe(id).map(a => ({ id: a.id, agent: a.agent, fonction: a.fonction, note: a.note,
      perimetre: String(a.perimetre || "").trim() ? R.perimetreObjet(ref, a.perimetre) : null }));
    edition = { id, jour: jourDuCreneau(c), nom: c.nom, debut: c.debut ? hhmm(c.debut) : "", fin: c.fin ? hhmm(c.fin) : "", note: c.note,
      affectations: affs, origine: JSON.parse(JSON.stringify(affs)) };
    if (!lundi || jourDuCreneau(c) < lundi || jourDuCreneau(c) > plusJours(lundi, 6)) lundi = lundiDe(jourDuCreneau(c));
    dessiner(); $("pl-edition").scrollIntoView({ block: "nearest" });
  }
  function lierEdition() {
    const e = edition, lire = () => { e.nom = $("pl-nom").value; e.debut = $("pl-debut").value; e.fin = $("pl-fin").value; e.note = $("pl-note-c").value; };
    ["pl-nom", "pl-debut", "pl-fin", "pl-note-c"].forEach(id => $(id).addEventListener("input", lire));
    const zone = $("pl-edition");
    zone.addEventListener("change", ev => {
      const d = ev.target.closest(".pl-aff"); if (!d) return;
      const a = e.affectations[+d.dataset.i];
      if (ev.target.dataset.champ === "fonction") a.fonction = ev.target.value;
      if (ev.target.dataset.champ === "propre") { lire(); const ag = agentDe(a.agent); a.perimetre = ev.target.checked ? JSON.parse(JSON.stringify(ag ? ag.perimetre : {})) : null; dessiner(); }
    });
    zone.addEventListener("click", ev => {
      const p = ev.target.closest(".eq-puce"), d = ev.target.closest(".pl-aff");
      if (p && d) {
        const a = e.affectations[+d.dataset.i], c = p.dataset.col, v = p.dataset.val, l = a.perimetre[c] || [];
        a.perimetre[c] = l.includes(v) ? l.filter(x => x !== v) : [...l, v];
        if (!a.perimetre[c].length) delete a.perimetre[c];
        lire(); dessiner(); return;
      }
      const r = ev.target.closest("[data-retirer]");
      if (r) { lire(); e.affectations.splice(+r.dataset.retirer, 1); dessiner(); }
    });
    if ($("pl-agent")) $("pl-agent").addEventListener("change", ev => {
      const ag = agentDe(+ev.target.value); if (!ag) return;
      lire(); e.affectations.push({ id: null, agent: ag.id, fonction: ag.fonction || (reglages.fonctions[0] || {}).nom || "", note: "", perimetre: null });
      dessiner();
    });
    $("pl-fermer").addEventListener("click", () => { edition = null; dessiner(); });
    $("pl-enregistrer").addEventListener("click", () => { lire(); enregistrerCreneau(); });
    if ($("pl-supprimer")) $("pl-supprimer").addEventListener("click", supprimerCreneau);
  }
  function lierReglages() {
    const det = $("pl-reglages"), r = reglagesEdites;
    det.addEventListener("toggle", () => { reglagesOuverts = det.open; });
    det.addEventListener("input", ev => {
      const t = ev.target, f = t.closest("[data-fonction]"), m = t.closest("[data-modele]"), c = t.closest("[data-creneau]");
      if (f) { const x = r.fonctions[+f.dataset.fonction]; if (t.dataset.champ === "nom") x.nom = t.value; if (t.dataset.champ === "saisie") x.saisie = t.checked; return; }
      if (m && c) { r.modeles[+m.dataset.modele].creneaux[+c.dataset.creneau][t.dataset.champ] = t.value; return; }
      if (m && t.dataset.champ === "nom") r.modeles[+m.dataset.modele].nom = t.value;
    });
    det.addEventListener("change", ev => { const t = ev.target, f = t.closest("[data-fonction]"); if (f && t.dataset.champ === "saisie") r.fonctions[+f.dataset.fonction].saisie = t.checked; });
    det.addEventListener("click", ev => {
      const t = ev.target.closest("button"); if (!t) return;
      const m = t.closest("[data-modele]");
      if (t.id === "pl-plus-fonction") r.fonctions.push({ nom: "", saisie: false });
      else if (t.dataset.supprFonction != null) r.fonctions.splice(+t.dataset.supprFonction, 1);
      else if (t.id === "pl-plus-modele") r.modeles.push({ nom: "Nouveau modèle", creneaux: [{ nom: "Journée", debut: "09:00", fin: "18:00" }] });
      else if (t.dataset.supprModele != null) r.modeles.splice(+t.dataset.supprModele, 1);
      else if (t.dataset.plusCreneau != null) r.modeles[+t.dataset.plusCreneau].creneaux.push({ nom: "", debut: "08:00", fin: "13:00" });
      else if (t.dataset.supprCreneau != null && m) r.modeles[+m.dataset.modele].creneaux.splice(+t.dataset.supprCreneau, 1);
      else if (t.id === "pl-reg-enregistrer") { enregistrerReglages(); return; }
      else return;
      dessiner();
    });
  }
  const dire = (id, t, err) => { const st = $(id); if (st) { st.textContent = t; st.className = `statut${err ? " err" : " ok"}`; } };
  const maintenant = () => Date.now() / 1000;
  async function actions(acts) { if (acts.length) return grist.docApi.applyUserActions(acts); }
  async function recharger() { planning = await S.lirePlanning(general); dessiner(); }

  /* ---------- Écritures ---------- */
  const champsAff = (a, creneauId) => ({ Creneau: creneauId, Agent: a.agent, Fonction: a.fonction,
    Perimetre: a.perimetre === null ? "" : JSON.stringify(R.nettoyer(a.perimetre)), Note: a.note || "", Modifie_le: maintenant() });
  async function enregistrerCreneau() {
    const e = edition;
    if (!e.nom.trim()) { dire("pl-edition-statut", "Donnez un nom au créneau.", true); $("pl-nom").focus(); return; }
    if (!e.debut || !e.fin) { dire("pl-edition-statut", "Indiquez le début et la fin.", true); return; }
    const [debut, fin] = bornes(e.jour, e.debut, e.fin);
    const champs = { Date: dateGrist(e.jour), Nom: e.nom.trim(), Debut: debut, Fin: fin, Note: e.note.trim() };
    try {
      let id = e.id;
      if (!id) { const res = await actions([["AddRecord", T().creneaux, null, champs]]); id = res.retValues[0]; }
      else await actions([["UpdateRecord", T().creneaux, id, champs]]);
      const avant = new Map(e.origine.map(a => [a.id, a])), gardes = new Set(e.affectations.filter(a => a.id).map(a => a.id));
      const acts = [
        ...e.origine.filter(a => !gardes.has(a.id)).map(a => ["RemoveRecord", T().affectations, a.id]),
        ...e.affectations.filter(a => !a.id).map(a => ["AddRecord", T().affectations, null, champsAff(a, id)]),
        ...e.affectations.filter(a => a.id && JSON.stringify(a) !== JSON.stringify(avant.get(a.id))).map(a => ["UpdateRecord", T().affectations, a.id, champsAff(a, id)]),
      ];
      await actions(acts);
      edition = null; await recharger();
      dire("pl-statut", `Créneau « ${champs.Nom} » du ${jourLong(e.jour)} enregistré.`);
    } catch (err) { dire("pl-edition-statut", `Enregistrement refusé par Grist (${err.message || err}).`, true); }
  }
  async function supprimerCreneau() {
    const e = edition, n = e.origine.length;
    if (!confirm(`Supprimer le créneau « ${e.nom} » du ${jourLong(e.jour)}${n ? ` et ses ${n} affectation(s)` : ""} ?`)) return;
    try {
      await actions([...e.origine.map(a => ["RemoveRecord", T().affectations, a.id]), ["RemoveRecord", T().creneaux, e.id]]);
      edition = null; await recharger(); dire("pl-statut", "Créneau supprimé.");
    } catch (err) { dire("pl-edition-statut", `Suppression refusée par Grist (${err.message || err}).`, true); }
  }
  async function appliquerModeles() {
    const acts = [];
    racine.querySelectorAll("[data-modele-jour]").forEach(sel => {
      if (sel.value === "") return;
      const iso = sel.dataset.modeleJour, m = reglages.modeles[+sel.value], deja = new Set(creneauxDu(iso).map(c => S.norm(c.nom)));
      for (const c of m.creneaux) {
        if (!c.nom || deja.has(S.norm(c.nom))) continue;
        const [d, f] = bornes(iso, c.debut, c.fin);
        acts.push(["AddRecord", T().creneaux, null, { Date: dateGrist(iso), Nom: c.nom, Debut: d, Fin: f, Note: "" }]);
      }
    });
    if (!acts.length) { dire("pl-statut", "Aucun créneau à créer (jours sans modèle, ou créneaux déjà présents)."); return; }
    try { await actions(acts); await recharger(); dire("pl-statut", `${acts.length} créneau(x) créé(s). Affectez maintenant les agents.`); }
    catch (err) { dire("pl-statut", `Création refusée par Grist (${err.message || err}).`, true); }
  }
  async function copierSemaine() {
    const jours = [...Array(7)].map((_, i) => plusJours(lundi, i)).filter(iso => !creneauxDu(iso).length);
    const sources = jours.flatMap(iso => creneauxDu(plusJours(iso, -7)).map(c => ({ c, iso })));
    if (!sources.length) { dire("pl-statut", "Rien à copier : la semaine précédente n'a pas de créneau sur les jours encore vides.", true); return; }
    try {
      const res = await actions(sources.map(({ c, iso }) => { const [d, f] = bornes(iso, hhmm(c.debut), hhmm(c.fin));
        return ["AddRecord", T().creneaux, null, { Date: dateGrist(iso), Nom: c.nom, Debut: d, Fin: f, Note: c.note }]; }));
      const ids = res.retValues;
      const affs = sources.flatMap(({ c }, k) => affectationsDe(c.id).filter(a => { const ag = agentDe(a.agent); return ag && ag.actif; })
        .map(a => ["AddRecord", T().affectations, null, { Creneau: ids[k], Agent: a.agent, Fonction: a.fonction, Perimetre: a.perimetre || "", Note: a.note, Modifie_le: maintenant() }]));
      await actions(affs);
      await recharger();
      dire("pl-statut", `${sources.length} créneau(x) et ${affs.length} affectation(s) recopiés de la semaine précédente.`);
    } catch (err) { dire("pl-statut", `Copie refusée par Grist (${err.message || err}).`, true); }
  }
  async function enregistrerReglages() {
    const r = reglagesEdites;
    r.fonctions = r.fonctions.map(f => ({ nom: f.nom.trim(), saisie: !!f.saisie })).filter(f => f.nom);
    r.modeles = r.modeles.map(m => ({ nom: m.nom.trim(), creneaux: m.creneaux.map(c => ({ nom: c.nom.trim(), debut: c.debut, fin: c.fin })).filter(c => c.nom && c.debut && c.fin) })).filter(m => m.nom);
    if (!r.fonctions.length) { dire("pl-reg-statut", "Gardez au moins une fonction.", true); return; }
    const noms = r.fonctions.map(f => S.norm(f.nom));
    if (noms.some((n, i) => noms.indexOf(n) !== i)) { dire("pl-reg-statut", "Deux fonctions portent le même nom.", true); return; }
    try {
      const meta = await S.lireMeta(), choix = JSON.stringify({ choices: r.fonctions.map(f => f.nom) }), acts = [];
      for (const t of [T().agents, T().affectations]) {
        const c = meta[t] && meta[t].colonnes.Fonction;
        if (!c || !/^Choice/.test(c.type)) continue;
        let o = {}; try { o = JSON.parse(c.widgetOptions || "{}") || {}; } catch (_) { o = {}; }
        acts.push(["ModifyColumn", t, "Fonction", { widgetOptions: JSON.stringify({ ...o, choices: JSON.parse(choix).choices }) }]);
      }
      await actions([S.actionConfig(config, "planning", r), ...acts]);
      config = await S.lireConfig(); reglages = S.reglagesPlanning(config); reglagesEdites = null;
      dessiner(); dire("pl-reg-statut", "Réglages enregistrés.");
    } catch (err) { dire("pl-reg-statut", `Enregistrement refusé par Grist (${err.message || err}).`, true); }
  }
  async function creerTables() {
    const meta = await S.lireMeta(), plan = S.planInstallation(meta, config);
    const noms = [T().agents, T().creneaux, T().affectations];
    const etapes = plan.etapes.filter(e => noms.some(n => e.id === `table-${n}` || e.id === `cols-${n}`));
    const res = await S.appliquer(etapes), ko = res.find(r => !r.ok);
    if (ko) { dire("pl-statut", `Création refusée par Grist (${ko.erreur}).`, true); return; }
    await charger(); dessiner();
  }

  async function afficher() {
    racine = $("planning");
    racine.innerHTML = `<div class="bandeau info">Lecture du planning…</div>`;
    try { await charger(); } catch (e) { racine.innerHTML = `<div class="bandeau alerte">Lecture impossible : ${esc(e.message || e)}</div>`; return; }
    if (!lundi) lundi = lundiDe(aujourdhui());
    if (edition && edition.id && !planning.creneaux.some(c => c.id === edition.id)) edition = null;
    dessiner();
  }
  window.OngletPlanning = { afficher };
})();
