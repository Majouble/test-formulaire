/* =====================================================================
   Administration v2 — onglet « Accès » : règles d'accès Grist générées depuis l'équipe et le planning
   ---------------------------------------------------------------------
   Choix retenus (17/10/2026) :
   - les propriétaires du document ont tous les droits (équipe, planning, configuration) ;
   - un agent actif de l'équipe saisit sur les formulaires de son champ (EN, ESR) s'il est mobilisé sur ce champ
     au planning, 7 jours avant ou après aujourd'hui (colonne formule Agents.Champs_acces) ; il lit le reste ;
   - une personne absente de l'équipe (ou inactive) ne voit rien ;
   - l'accès des établissements par lien (link key) viendra plus tard.
   Les règles s'appuient sur l'attribut utilisateur « Agent » (table Agents, rapprochée par adresse).
   Elles portent un mémo « Socle v2 — … » (affiché par Grist en cas de refus) qui permet de les retrouver :
   appliquer remplace les règles des tables gérées et la règle par défaut ; les autres tables ne sont pas touchées.
   Seul un propriétaire peut lire et modifier les règles d'accès.
   ===================================================================== */
(function () {
  "use strict";
  const S = window.Socle, R = window.Repartition;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const MEMO = "Socle v2";
  const ATTRIBUT = "Agent";
  const PROPRIETAIRE = "user.Access == OWNER";
  const MEMBRE = `user.${ATTRIBUT}.Actif`;

  let config, general, meta, agents, formulaires, acl, racine;

  /* ---------- Lecture ---------- */
  async function charger() {
    config = await S.lireConfig();
    general = S.general(config);
    meta = await S.lireMeta();
    agents = await R.lireAgents(general, null);
    formulaires = await lireFormulaires();
    acl = await lireAcl();
  }
  async function lireFormulaires() {
    let t;
    try { t = await grist.docApi.fetchTable(general.formulaires); } catch (_) { return []; }
    return (t.id || []).map((id, i) => {
      let conf = null;
      try { conf = t.Publie && t.Publie[i] ? JSON.parse(t.Publie[i]) : null; } catch (_) { conf = null; }
      return { id, nom: String((t.Nom || [])[i] || ""), table: String((t.Table || [])[i] || ""), conf, type: String((t.Type || [])[i] || "etablissement") };
    }).filter(f => f.conf && f.table);
  }
  // null si les règles ne sont pas lisibles (non propriétaire)
  async function lireAcl() {
    try {
      const [res, regles] = await Promise.all([grist.docApi.fetchTable("_grist_ACLResources"), grist.docApi.fetchTable("_grist_ACLRules")]);
      const ressources = new Map((res.id || []).map((id, i) => [id, { id, tableId: res.tableId[i], colIds: res.colIds[i] }]));
      const v = (k, i) => (regles[k] || [])[i];
      return {
        ressources,
        regles: (regles.id || []).map((id, i) => ({ id, resource: v("resource", i), aclFormula: String(v("aclFormula", i) || ""),
          permissionsText: String(v("permissionsText", i) || ""), rulePos: Number(v("rulePos", i) || 0), memo: String(v("memo", i) || ""),
          userAttributes: String(v("userAttributes", i) || "") })).sort((a, b) => a.rulePos - b.rulePos),
      };
    } catch (_) { return null; }
  }

  /* ---------- Règles proposées ---------- */
  const champDe = f => (S.CHAMPS.find(c => c.version === ((f.conf.saisie && f.conf.saisie.version) || general.preset)) || S.CHAMPS[0]).id;
  // Tables de saisie (et leurs sous-tables) avec les champs qui y saisissent ; référentiels qu'elles visent
  function tablesGerees() {
    const saisie = new Map(), referentiels = new Set();
    const ajouter = (t, ch, f) => { if (!t || !meta[t]) return; if (!saisie.has(t)) saisie.set(t, { champs: new Set(), formulaires: new Set() }); saisie.get(t).champs.add(ch); saisie.get(t).formulaires.add(f.nom); };
    for (const f of formulaires) {
      const ch = champDe(f);
      ajouter(f.table, ch, f);
      (f.conf.blocs || []).forEach(b => { const st = b && b.reglages && b.reglages.tableau && b.reglages.tableau.table; if (st) ajouter(st, ch, f); });
      const cols = meta[f.table] ? Object.values(meta[f.table].colonnes) : [];
      cols.forEach(c => { const cible = S.cibleRef(c.type); if (cible && cible !== f.table && /etab|site|referentiel/i.test(`${c.colId} ${cible}`)) referentiels.add(cible); });
    }
    if (meta[general.referentiel]) referentiels.add(general.referentiel);
    [...saisie.keys()].forEach(t => referentiels.delete(t));
    return { saisie, referentiels: [...referentiels].filter(t => meta[t]) };
  }
  const condChamps = champs => {
    const l = [...champs].sort().map(ch => `"${ch}" in user.${ATTRIBUT}.Champs_acces`);
    return `${MEMBRE} and ${l.length > 1 ? `(${l.join(" or ")})` : l[0]}`;
  };
  // [{ tableId, colIds, regles: [{ aclFormula, permissionsText, memo }], description }]
  function reglesProposees() {
    const { saisie, referentiels } = tablesGerees(), out = [];
    out.push({ tableId: "*", colIds: "*", titre: "Toutes les autres tables (réglages, équipe, planning…)", regles: [
      { aclFormula: PROPRIETAIRE, permissionsText: "+CRUDS", memo: `${MEMO} — propriétaires : tous les droits` },
      { aclFormula: MEMBRE, permissionsText: "+R-CUDS", memo: `${MEMO} — équipe : lecture seule` },
      { aclFormula: "", permissionsText: "-CRUDS", memo: `${MEMO} — réservé aux agents actifs de l'équipe de la cellule (onglet Équipe)` },
    ], lignes: ["Propriétaires : tous les droits, y compris la structure.", "Agents actifs de l'équipe : lecture seule.", "Autres personnes : aucun accès."] });
    for (const [t, x] of saisie) {
      const ch = [...x.champs].sort().join(" ou ");
      out.push({ tableId: t, colIds: "*", titre: `${t} — signalements ${ch} (${[...x.formulaires].join(", ")})`, regles: [
        { aclFormula: PROPRIETAIRE, permissionsText: "+CRUD", memo: `${MEMO} — propriétaires : tous les droits` },
        { aclFormula: condChamps(x.champs), permissionsText: "+CRU-D", memo: `${MEMO} — saisie : agents mobilisés ${ch} au planning (7 jours avant ou après)` },
        { aclFormula: MEMBRE, permissionsText: "+R-CUD", memo: `${MEMO} — saisie réservée aux agents mobilisés ${ch} au planning ; lecture pour le reste de l'équipe` },
      ], lignes: [`Agents mobilisés ${ch} au planning (7 jours avant ou après) : lecture, ajout et modification ; pas de suppression.`,
        "Autres agents actifs de l'équipe : lecture seule.", "Autres personnes : aucun accès."] });
    }
    for (const t of referentiels) {
      out.push({ tableId: t, colIds: "*", titre: `${t} — référentiel`, regles: [
        { aclFormula: PROPRIETAIRE, permissionsText: "+CRUD", memo: `${MEMO} — propriétaires : tous les droits` },
        { aclFormula: `${MEMBRE} and user.${ATTRIBUT}.Champs_acces`, permissionsText: "+CRU-D", memo: `${MEMO} — ajout d'établissements : agents mobilisés au planning` },
      ], lignes: ["Agents mobilisés au planning (EN ou ESR) : lecture, ajout et modification (établissement absent de l'annuaire…).",
        "Autres agents actifs : lecture seule.", "Autres personnes : aucun accès."] });
    }
    return out;
  }
  const attributProposé = () => ({ name: ATTRIBUT, tableId: general.agents, lookupColId: "Email", charId: "Email" });

  // Règles en place qui seront remplacées : tables gérées (toutes colonnes), règle par défaut, attribut « Agent »
  function aRemplacer(propose) {
    if (!acl) return [];
    const tables = new Set(propose.map(p => p.tableId));
    return acl.regles.filter(r => {
      const res = acl.ressources.get(r.resource);
      if (!res) return false;
      if (r.userAttributes) { try { return JSON.parse(r.userAttributes).name === ATTRIBUT; } catch (_) { return false; } }
      return tables.has(res.tableId);
    });
  }
  // Les règles du document correspondent-elles exactement à la proposition ?
  function aJour(propose) {
    if (!acl) return false;
    const attr = acl.regles.find(r => r.userAttributes && (() => { try { const a = JSON.parse(r.userAttributes); return a.name === ATTRIBUT && a.tableId === general.agents && a.lookupColId === "Email"; } catch (_) { return false; } })());
    if (!attr) return false;
    return propose.every(p => {
      const res = [...acl.ressources.values()].filter(x => x.tableId === p.tableId);
      const regles = acl.regles.filter(r => !r.userAttributes && res.some(x => x.id === r.resource));
      return regles.length === p.regles.length && regles.every((r, i) => r.aclFormula === p.regles[i].aclFormula && r.permissionsText === p.regles[i].permissionsText);
    });
  }

  /* ---------- Rendu ---------- */
  function dessiner() {
    if (!config) { racine.innerHTML = `<div class="bandeau alerte">La table Config est absente : lancez d'abord l'installation.</div>`; return; }
    const tAgents = meta[general.agents];
    if (!tAgents || !meta[general.affectations]) {
      racine.innerHTML = `<div class="bandeau info">Les règles d'accès s'appuient sur l'équipe et le planning : créez-les d'abord (onglets Équipe et Planning).</div>`;
      return;
    }
    const sansFormule = !tAgents.colonnes.Champs_acces;
    const propose = reglesProposees(), remplacees = aRemplacer(propose), ok = aJour(propose);
    racine.innerHTML = `
      ${acl === null ? `<div class="bandeau alerte">Les règles d'accès de ce document ne sont pas lisibles : seul un propriétaire du document peut les consulter et les appliquer.</div>` : ""}
      ${sansFormule ? `<div class="bandeau alerte">Il manque la colonne ${esc(general.agents)}.Champs_acces, qui calcule les champs de chaque agent d'après le planning.
        <button class="primaire" id="ac-formule" style="margin-left:8px">Ajouter la colonne</button></div>` : ""}
      ${acl !== null ? `<div class="bandeau ${ok ? "ok" : "info"}">${ok ? "Les règles d'accès du socle sont en place et à jour." : "Les règles d'accès du socle ne sont pas appliquées, ou ont changé : voir ci-dessous."}</div>` : ""}
      ${carteQui()}
      ${carteRegles(propose, remplacees, ok, sansFormule)}
      ${carteActuelles(remplacees)}
      ${carteAFaire()}`;
    lier();
  }

  function carteQui() {
    const lignes = (agents || []).map(a => {
      const champs = a.champsAcces || [];
      const droits = !a.actif ? `<span class="pastille">inactif : aucun accès</span>`
        : !a.email ? `<span class="pastille manque">sans adresse : aucun accès</span>`
        : champs.length ? `<span class="pastille ok">saisie ${esc(champs.join(" et "))}</span>${champs.length < S.CHAMPS.length ? ` <span class="pastille">lecture ${esc(S.CHAMPS.map(c => c.id).filter(c => !champs.includes(c)).join(", "))}</span>` : ""}`
        : `<span class="pastille">lecture seule (aucun créneau à 7 jours)</span>`;
      return `<tr${a.actif ? "" : ` class="inactif"`}><td><strong>${esc(a.nom)}</strong></td><td>${a.email ? esc(a.email) : "—"}</td><td>${esc(a.fonction)}</td><td>${droits}</td></tr>`;
    }).join("");
    return `<section class="carte"><h2>Qui aura accès à quoi</h2>
      <p class="aide">D'après l'équipe et le planning. Un agent saisit sur les formulaires d'un champ (EN, ESR) s'il y est mobilisé sur un créneau entre 7 jours avant et 7 jours après aujourd'hui ; Grist recalcule ces champs environ toutes les heures et à chaque modification du planning. Les personnes absentes de l'équipe ne voient rien ; les propriétaires du document voient et modifient tout.</p>
      ${agents && agents.length ? `<table class="eq-table"><thead><tr><th>Agent</th><th>Adresse (compte Grist)</th><th>Fonction habituelle</th><th>Droits</th></tr></thead><tbody>${lignes}</tbody></table>` : `<p class="vide">Aucun agent dans l'équipe.</p>`}
      ${agents && agents.some(a => a.champsAcces === null) ? `<p class="avert">Champs non calculés : ajoutez la colonne Champs_acces (bandeau ci-dessus).</p>` : ""}</section>`;
  }

  function carteRegles(propose, remplacees, ok, sansFormule) {
    return `<section class="carte"><h2>Règles proposées</h2>
      <p class="aide">Attribut utilisateur « ${ATTRIBUT} » : la ligne de la table ${esc(general.agents)} dont l'adresse (colonne Email) est celle du compte Grist connecté.</p>
      ${propose.map(p => `<div class="ac-table"><strong>${esc(p.titre)}</strong><ul>${p.lignes.map(l => `<li>${esc(l)}</li>`).join("")}</ul>
        <details><summary>Formules Grist</summary><table class="ac-formules"><tbody>${p.regles.map(r => `<tr><td><code>${esc(r.aclFormula || "Tous les autres")}</code></td><td><code>${esc(r.permissionsText)}</code></td></tr>`).join("")}</tbody></table></details></div>`).join("")}
      ${!formulaires.length ? `<p class="avert">Aucun formulaire publié : seules la règle par défaut et le référentiel sont proposés. Publiez les formulaires puis revenez ici.</p>` : ""}
      <div class="boutons">
        <button class="primaire" id="ac-appliquer">${ok ? "Réappliquer les règles" : "Appliquer les règles"}</button>
        ${acl && acl.regles.some(r => r.memo.startsWith(MEMO)) ? `<button class="secondaire" id="ac-retirer">Retirer les règles du socle…</button>` : ""}
        <span class="statut" id="ac-statut" role="status"></span></div>
      <div id="ac-confirmation" class="ac-confirmation" hidden></div>
      ${remplacees.length ? `<p class="aide">${remplacees.length} règle(s) en place sur ces tables seront remplacées (détail ci-dessous). Les règles des autres tables ne sont pas modifiées.</p>` : ""}</section>`;
  }

  function carteActuelles(remplacees) {
    if (!acl) return "";
    const ids = new Set(remplacees.map(r => r.id)), parRes = new Map();
    // (la ressource sans table est l'ancienne règle par défaut de Grist, ignorée par Grist lui-même)
    acl.regles.forEach(r => { const res = acl.ressources.get(r.resource); if (!res || !res.tableId) return; if (!parRes.has(r.resource)) parRes.set(r.resource, []); parRes.get(r.resource).push(r); });
    const blocs = [...parRes.entries()].map(([rid, l]) => {
      const res = acl.ressources.get(rid) || { tableId: "?", colIds: "?" };
      const nom = res.tableId === "*" ? "Règle par défaut" : res.tableId === "*SPECIAL" ? `Règle spéciale ${res.colIds}` : `${res.tableId}${res.colIds !== "*" ? ` (colonnes ${res.colIds})` : ""}`;
      return `<div class="ac-table"><strong>${esc(nom)}</strong><table class="ac-formules"><tbody>${l.map(r => `<tr class="${ids.has(r.id) ? "remplacee" : ""}">
        <td>${r.userAttributes ? `attribut utilisateur <code>${esc(r.userAttributes)}</code>` : `<code>${esc(r.aclFormula || "Tous les autres")}</code>`}</td>
        <td><code>${esc(r.permissionsText)}</code></td><td><small>${esc(r.memo)}</small></td><td>${ids.has(r.id) ? `<span class="pastille reco">remplacée</span>` : ""}</td></tr>`).join("")}</tbody></table></div>`;
    }).join("");
    return `<section class="carte"><details${acl.regles.length && !remplacees.length ? "" : " open"}><summary><strong>Règles actuellement en place (${[...parRes.values()].reduce((n, l) => n + l.length, 0)})</strong></summary>
      ${blocs || `<p class="vide">Aucune règle : tous les collaborateurs du document ont les droits que leur donne le partage (propriétaire, éditeur, lecteur).</p>`}</details></section>`;
  }

  function carteAFaire() {
    const emails = (agents || []).filter(a => a.actif && a.email).map(a => a.email);
    return `<section class="carte"><h2>À faire dans Grist</h2>
      <ol class="ac-etapes">
        <li><strong>Partager le document</strong> (bouton « Partager » de Grist) avec chaque agent de l'équipe, en <strong>Éditeur</strong> : les règles ne font que restreindre les droits du partage.
          ${emails.length ? `<div class="ac-copie"><textarea id="ac-emails" rows="2" readonly>${esc(emails.join(", "))}</textarea><button class="secondaire" id="ac-copier">Copier les adresses</button></div>` : ""}</li>
        <li>Les personnes hors équipe peuvent rester invitées : elles ne verront rien. Ajoutez-les à l'équipe pour leur ouvrir la lecture.</li>
        <li>Le compte utilisé par n8n (clé d'API) doit être <strong>propriétaire</strong> du document, ou figurer dans l'équipe avec les bons créneaux, pour continuer à lire et écrire.</li>
        <li>Vérifier : page « Règles d'accès » de Grist, bouton « Voir en tant que », en choisissant un agent.</li>
        <li>L'accès des établissements par lien personnel viendra avec le publipostage.</li>
      </ol></section>`;
  }

  /* ---------- Événements et écritures ---------- */
  const dire = (t, err) => { const st = $("ac-statut"); if (st) { st.textContent = t; st.className = `statut${err ? " err" : " ok"}`; } };
  function lier() {
    if ($("ac-formule")) $("ac-formule").addEventListener("click", ajouterFormule);
    if ($("ac-appliquer")) $("ac-appliquer").addEventListener("click", appliquer);
    if ($("ac-retirer")) $("ac-retirer").addEventListener("click", retirer);
    if ($("ac-copier")) $("ac-copier").addEventListener("click", async () => {
      const t = $("ac-emails"); t.select();
      try { await navigator.clipboard.writeText(t.value); } catch (_) { try { document.execCommand("copy"); } catch (_) { /* sélection laissée */ } }
      $("ac-copier").textContent = "Adresses copiées";
    });
  }
  async function ajouterFormule() {
    const plan = S.planInstallation(meta, config), e = plan.etapes.find(x => x.id === `formule-${general.agents}`);
    if (e) { const [r] = await S.appliquer([e]); if (!r.ok) { dire(`Ajout de la colonne refusé par Grist (${r.erreur}).`, true); return; } }
    await charger(); dessiner();
  }
  // Confirmation dans la page (pas de boîte de dialogue : certains navigateurs les bloquent dans les widgets)
  function confirmer(texte, libelle, action) {
    const z = $("ac-confirmation");
    z.hidden = false;
    z.innerHTML = `<p>${esc(texte)}</p><div class="boutons"><button class="primaire" id="ac-oui">${esc(libelle)}</button><button class="secondaire" id="ac-non">Annuler</button></div>`;
    $("ac-non").addEventListener("click", () => { z.hidden = true; z.innerHTML = ""; dire(""); });
    $("ac-oui").addEventListener("click", () => { z.hidden = true; action().catch(e => dire(`Erreur : ${e.message || e}`, true)); });
    z.scrollIntoView({ block: "nearest" });
  }
  function appliquer() {
    if (acl === null) { dire("Impossible : les règles d'accès ne sont lisibles et modifiables que par un propriétaire du document. Vérifiez votre rôle dans le partage du document.", true); return; }
    if (!meta[general.agents] || !meta[general.agents].colonnes.Champs_acces) { dire("Ajoutez d'abord la colonne Champs_acces (bouton « Ajouter la colonne » dans le bandeau en haut de l'onglet).", true); return; }
    const remplacees = aRemplacer(reglesProposees());
    confirmer(`Appliquer les règles d'accès du socle ?${remplacees.length ? ` ${remplacees.length} règle(s) en place sur ces tables seront remplacées.` : ""} Les personnes absentes de l'équipe ne verront plus rien ; vérifiez ensuite avec « Voir en tant que ».`,
      "Oui, appliquer les règles", executerApplication);
  }
  async function executerApplication() {
    const propose = reglesProposees();
    $("ac-appliquer").disabled = true; dire("Application des règles…");
    try {
      // 1. ressources manquantes
      const trouver = (t, c) => [...acl.ressources.values()].find(x => x.tableId === t && x.colIds === c);
      const manquantes = propose.filter(p => !trouver(p.tableId, p.colIds));
      if (manquantes.length) await grist.docApi.applyUserActions(manquantes.map(p => ["AddRecord", "_grist_ACLResources", null, { tableId: p.tableId, colIds: p.colIds }]));
      acl = await lireAcl();
      // 2. règles : suppression des anciennes, ajout des nouvelles (attribut utilisateur en tête)
      const ids = aRemplacer(propose).map(r => r.id);
      let pos = Math.max(0, ...acl.regles.filter(r => !ids.includes(r.id)).map(r => r.rulePos).filter(Number.isFinite)) + 1;
      const defaut = trouver("*", "*");
      const ajouts = [["AddRecord", "_grist_ACLRules", null, { resource: defaut.id, userAttributes: JSON.stringify(attributProposé()), rulePos: pos++, aclFormula: "", permissionsText: "", memo: "" }]];
      for (const p of propose) {
        const res = trouver(p.tableId, p.colIds);
        p.regles.forEach(r => ajouts.push(["AddRecord", "_grist_ACLRules", null, { resource: res.id, aclFormula: r.aclFormula, permissionsText: r.permissionsText, memo: r.memo, rulePos: pos++ }]));
      }
      await grist.docApi.applyUserActions([...(ids.length ? [["BulkRemoveRecord", "_grist_ACLRules", ids]] : []), ...ajouts]);
      await charger(); dessiner();
      dire("Règles appliquées. Vérifiez-les avec « Voir en tant que » dans la page Règles d'accès de Grist.");
    } catch (e) {
      await charger(); dessiner();
      dire(`Règles refusées par Grist (${e.message || e}). Seul un propriétaire peut modifier les règles d'accès.`, true);
    }
  }
  function retirer() {
    const socle = acl.regles.filter(r => r.memo.startsWith(MEMO) || (r.userAttributes && (() => { try { return JSON.parse(r.userAttributes).name === ATTRIBUT; } catch (_) { return false; } })()));
    confirmer(`Retirer les ${socle.length} règle(s) du socle ? Les droits redeviendront ceux du partage du document (éditeurs : tout ; lecteurs : lecture).`,
      "Oui, retirer les règles", () => executerRetrait(socle));
  }
  async function executerRetrait(socle) {
    try {
      await grist.docApi.applyUserActions([["BulkRemoveRecord", "_grist_ACLRules", socle.map(r => r.id)]]);
      await charger(); dessiner(); dire("Règles du socle retirées.");
    } catch (e) { dire(`Retrait refusé par Grist (${e.message || e}).`, true); }
  }

  async function afficher() {
    racine = $("acces");
    racine.innerHTML = `<div class="bandeau info">Lecture des règles d'accès…</div>`;
    try { await charger(); } catch (e) { racine.innerHTML = `<div class="bandeau alerte">Lecture impossible : ${esc(e.message || e)}</div>`; return; }
    dessiner();
  }
  window.OngletAcces = { afficher };
})();
