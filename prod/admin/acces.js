/* =====================================================================
   Administration v2 — onglet « Accès » : règles d'accès Grist générées depuis l'équipe et le planning
   ---------------------------------------------------------------------
   Choix retenus (17/10/2026) :
   - les propriétaires du document ont tous les droits (équipe, planning, configuration) ;
   - un agent actif de l'équipe saisit sur les formulaires de son champ (EN, ESR) s'il est mobilisé sur ce champ
     au planning, 7 jours avant ou après aujourd'hui (colonne formule Agents.Champs_acces) ; il lit le reste ;
   - une personne absente de l'équipe (ou inactive) ne voit rien ;
   - accès des établissements par lien (link key, mis en place dans l'onglet Établissements) : attribut « Etab »
     (clé du lien → ligne du référentiel) ; l'établissement lit et complète ses seuls signalements, sans les visas
     ni l'auteur, voit sa seule ligne du référentiel (sans clé ni lien) et lit les réglages et formulaires.
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
  // « Tous les autres » écrit en toutes lettres. Grist ajoute ses propres règles après la règle par défaut
  // (éditeurs et propriétaires : tout ; lecteurs : lecture) : une condition vide n'y est donc jamais la dernière,
  // et sa page « Règles d'accès » la refuse (« Condition cannot be blank »). Aucune règle du socle n'a de condition vide.
  const NON_PROPRIETAIRE = "user.Access != OWNER";
  // Identité d'agent : compte Grist (attribut « Agent », par adresse) ou lien d'agent invité (attribut « Invite », par clé)
  const INVITE = S.INVITE.attribut;
  let avecInvites = false;   // colonne Agents.Cle_acces présente
  let invitesExpirent = false;   // colonne Agents.Lien_valide présente : lien d'invité limité dans le temps
  const agentSi = build => avecInvites ? `(${build(`user.${ATTRIBUT}`)}) or (user.LinkKey.${INVITE}${invitesExpirent ? ` and user.${INVITE}.${S.INVITE.valide}` : ""} and ${build(`user.${INVITE}`)})` : build(`user.${ATTRIBUT}`);
  const membre = () => agentSi(u => `${u}.Actif`);

  let config, general, meta, agents, formulaires, groupes, acl, racine;

  /* ---------- Lecture ---------- */
  async function charger() {
    config = await S.lireConfig();
    general = S.general(config);
    meta = await S.lireMeta();
    agents = await R.lireAgents(general, null);
    formulaires = await R.lireFormulairesPublies(general);
    groupes = R.groupesLiens(meta, config, general, formulaires).filter(g => g.cle);   // accès par lien : clés en place
    acl = await lireAcl();
    avecInvites = !!(meta[general.agents] && meta[general.agents].colonnes[S.INVITE.cle]);
    invitesExpirent = !!(avecInvites && meta[general.agents].colonnes[S.INVITE.valide]);
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
      (f.blocsTableaux || f.conf.blocs || []).forEach(b => { const st = b && b.reglages && b.reglages.tableau && b.reglages.tableau.table; if (st) ajouter(st, ch, f); });
      const cols = meta[f.table] ? Object.values(meta[f.table].colonnes) : [];
      cols.forEach(c => { const cible = S.cibleRef(c.type); if (cible && cible !== f.table && /etab|site|referentiel/i.test(`${c.colId} ${cible}`)) referentiels.add(cible); });
    }
    if (meta[general.referentiel]) referentiels.add(general.referentiel);
    (groupes || []).forEach(g => referentiels.add(g.table));
    [...saisie.keys()].forEach(t => referentiels.delete(t));
    return { saisie, referentiels: [...referentiels].filter(t => meta[t]) };
  }
  const condChamps = champs => {
    return agentSi(u => { const l = [...champs].sort().map(ch => `"${ch}" in ${u}.Champs_acces`); return `${u}.Actif and ${l.length > 1 ? `(${l.join(" or ")})` : l[0]}`; });
  };
  // [{ tableId, colIds, regles: [{ aclFormula, permissionsText, memo }], description }]
  function reglesProposees() {
    const { saisie, referentiels } = tablesGerees(), out = [];
    out.push({ tableId: "*", colIds: "*", titre: "Toutes les autres tables (réglages, équipe, planning…)", regles: [
      // structure (tables, colonnes, formules) : propriétaires seulement. Forme exacte de Grist pour la case
      // « Autoriser les éditeurs à modifier la structure » décochée (rangée par Grist sur la règle par défaut)
      { aclFormula: NON_PROPRIETAIRE, permissionsText: "-S", memo: `${MEMO} — structure réservée aux propriétaires` },
      { aclFormula: PROPRIETAIRE, permissionsText: "+CRUD", memo: `${MEMO} — propriétaires : tous les droits` },
      { aclFormula: membre(), permissionsText: "+R-CUD", memo: `${MEMO} — équipe : lecture seule` },
      { aclFormula: NON_PROPRIETAIRE, permissionsText: "-CRUD", memo: `${MEMO} — réservé aux agents actifs de l'équipe de la cellule (onglet Équipe)` },
    ], lignes: ["Propriétaires : tous les droits.", "Agents actifs de l'équipe : lecture seule.", "Autres personnes : aucun accès.",
      "Structure (tables, colonnes, formules) : propriétaires seulement — case « Autoriser les éditeurs à modifier la structure » décochée."] });
    // Page « Cellule » : les pages rangées dessous ne sont visibles que des propriétaires et des agents connectés par leur compte
    if (meta[S.TABLE_CELLULE]) out.push({ tableId: S.TABLE_CELLULE, colIds: "*", titre: `${S.TABLE_CELLULE} — pages de la cellule`, regles: [
      { aclFormula: PROPRIETAIRE, permissionsText: "+CRUD", memo: `${MEMO} — propriétaires : pages de la cellule` },
      { aclFormula: `user.${ATTRIBUT}.Actif`, permissionsText: "+R-CUD", memo: `${MEMO} — agents connectés : pages de la cellule` },
      { aclFormula: NON_PROPRIETAIRE, permissionsText: "-CRUD", memo: `${MEMO} — pages de la cellule invisibles des invités et des établissements` },
    ], lignes: ["Propriétaires et agents actifs connectés par leur compte : la page « Cellule » et toutes les pages rangées dessous.",
      "Invités et établissements (liens) : ces pages n'apparaissent pas ; ils ne voient que leur page."] });
    // Page d'administration : portée par la table Administration, invisible de tous sauf des propriétaires
    if (meta[S.TABLE_ADMIN]) out.push({ tableId: S.TABLE_ADMIN, colIds: "*", titre: `${S.TABLE_ADMIN} — page d'administration`, regles: [
      { aclFormula: PROPRIETAIRE, permissionsText: "+CRUD", memo: `${MEMO} — propriétaires : administration` },
      { aclFormula: NON_PROPRIETAIRE, permissionsText: "-CRUD", memo: `${MEMO} — administration invisible des agents, invités et établissements` },
    ], lignes: ["Propriétaires seulement : la page d'administration, liée à cette table, n'apparaît pas aux agents, aux invités ni aux établissements."] });
    for (const [t, x] of saisie) {
      const ch = [...x.champs].sort().join(" ou ");
      out.push({ tableId: t, colIds: "*", titre: `${t} — signalements ${ch} (${[...x.formulaires].join(", ")})`, regles: [
        { aclFormula: PROPRIETAIRE, permissionsText: "+CRUD", memo: `${MEMO} — propriétaires : tous les droits` },
        { aclFormula: condChamps(x.champs), permissionsText: "+CRU-D", memo: `${MEMO} — saisie : agents mobilisés ${ch} au planning (7 jours avant ou après)` },
        { aclFormula: membre(), permissionsText: "+R-CUD", memo: `${MEMO} — saisie réservée aux agents mobilisés ${ch} au planning ; lecture pour le reste de l'équipe` },
      ], lignes: [`Agents mobilisés ${ch} au planning (7 jours avant ou après) : lecture, ajout et modification ; pas de suppression.`,
        "Autres agents actifs de l'équipe : lecture seule.", "Autres personnes : aucun accès."] });
    }
    for (const t of referentiels) {
      out.push({ tableId: t, colIds: "*", titre: `${t} — référentiel`, regles: [
        { aclFormula: PROPRIETAIRE, permissionsText: "+CRUD", memo: `${MEMO} — propriétaires : tous les droits` },
        { aclFormula: agentSi(u => `${u}.Actif and ${u}.Champs_acces`), permissionsText: "+CRU-D", memo: `${MEMO} — ajout d'établissements : agents mobilisés au planning` },
      ], lignes: ["Agents mobilisés au planning (EN ou ESR) : lecture, ajout et modification (établissement absent de l'annuaire…).",
        "Autres agents actifs : lecture seule.", "Autres personnes : aucun accès."] });
    }
    // Émargement : chacun crée, lit et complète ses propres lignes ; les propriétaires voient tout
    const tE = general.emargements || "Emargements";
    if (meta[tE]) out.push({ tableId: tE, colIds: "*", titre: `${tE} — émargement`, regles: [
      { aclFormula: PROPRIETAIRE, permissionsText: "+CRUD", memo: `${MEMO} — propriétaires : tous les droits` },
      { aclFormula: agentSi(u => `${u}.Actif and rec.Agent == ${u}.id and newRec.Agent == ${u}.id`), permissionsText: "+CRU-D", memo: `${MEMO} — émargement : chacun pour soi` },
      { aclFormula: membre(), permissionsText: "-CRUD", memo: `${MEMO} — émargement : chaque agent ne voit et ne modifie que le sien` },
    ], lignes: ["Agent actif : il émarge pour lui-même et voit ses propres émargements ; pas de suppression.",
      "Les autres émargements ne lui sont pas visibles (données personnelles).", "Propriétaires : tous les émargements, avec correction possible."] });
    if (avecInvites) out.push({ tableId: general.agents, colIds: [S.INVITE.cle, S.INVITE.lien].filter(c => meta[general.agents].colonnes[c]).sort().join(","), titre: `${general.agents} — clés et liens des invités`, regles: [
      { aclFormula: PROPRIETAIRE, permissionsText: "+RU", memo: `${MEMO} — propriétaires : clés et liens des invités` },
      { aclFormula: NON_PROPRIETAIRE, permissionsText: "-RU", memo: `${MEMO} — clés et liens des invités réservés aux propriétaires` },
    ], lignes: ["Clé et lien personnel des agents invités : lisibles par les propriétaires seulement (le lien vaut mot de passe)."] });
    reglesEtablissements(out);
    return out;
  }

  /* ---------- Accès des établissements par lien ---------- */
  const condEtab = g => `user.${g.attribut} and user.LinkKey.${g.attribut}`;
  const COL_ACCES = "Etablissement_acces";   // sous-tables : établissement du signalement parent (les règles ne suivent pas les références)
  const PARTIES = [{ id: "q", role: "q" }, { id: "vd", role: "vd" }, { id: "va", role: "va" }];
  // Colonnes masquées aux établissements : questions de visa (parties « vd » et « va » : ni lecture ni écriture)
  // et auteur (lecture seulement : sa formule d'initialisation doit pouvoir s'écrire quand l'établissement saisit)
  function colonnesMasquees(f) {
    const parties = Array.isArray(f.conf.parties) && f.conf.parties.length ? f.conf.parties : PARTIES, cols = meta[f.table].colonnes, visas = new Set();
    (f.conf.blocs || []).forEach(b => { const p = parties.find(x => x.id === (b.section || "q")); if (p && p.role !== "q" && b.colonne && cols[b.colonne]) visas.add(b.colonne); });
    const rr = S.resoudreRoles("reponses", meta[f.table], { reponses: f.table, referentiel: general.referentiel }, {}, {});
    return { visas: [...visas].sort(), auteur: rr.Auteur && rr.Auteur.col && !visas.has(rr.Auteur.col) ? rr.Auteur.col : null };
  }
  // Sous-tables (tableaux) d'un formulaire : { table, parent (colonne Ref vers la table des réponses), acces (colonne d'aide présente ?) }
  function sousTables(f) {
    const out = [];
    (f.blocsTableaux || f.conf.blocs || []).forEach(b => {
      const st = b && b.reglages && b.reglages.tableau && b.reglages.tableau.table;
      if (!st || !meta[st] || out.some(x => x.table === st)) return;
      const parent = Object.values(meta[st].colonnes).find(c => c.type === `Ref:${f.table}`);
      if (parent) out.push({ table: st, parent: parent.colId, acces: !!meta[st].colonnes[COL_ACCES] });
    });
    return out;
  }
  function reglesEtablissements(out) {
    if (!groupes || !groupes.length) return;
    const entree = (t, colIds) => out.find(p => p.tableId === t && p.colIds === colIds);
    const ajouterEn = (t, colIds, titre, regles, lignes, avant) => {
      let e = entree(t, colIds);
      if (!e) { e = { tableId: t, colIds, titre, regles: [], lignes: [] }; out.push(e); }
      if (avant) { e.regles.unshift(...regles); e.lignes.unshift(...lignes); } else { e.regles.push(...regles); e.lignes.push(...lignes); }
      return e;
    };
    const lecture = new Set([S.TABLE_CONFIG, general.formulaires]);
    for (const g of groupes) {
      const E = condEtab(g), qui = `établissement (lien ${g.attribut}_)`;
      const signalements = (t, col) => [
        { aclFormula: `${E} and rec.${col} != user.${g.attribut}.id`, permissionsText: "-CRUD", memo: `${MEMO} — ${qui} : signalements des autres établissements invisibles` },
        { aclFormula: `${E} and newRec.${col} != user.${g.attribut}.id`, permissionsText: "-CU", memo: `${MEMO} — ${qui} : saisie pour son seul établissement` },
        { aclFormula: E, permissionsText: "+CRU-D", memo: `${MEMO} — ${qui} : ses signalements, ajout et mise à jour` },
      ];
      for (const f of g.formulaires) {
        ajouterEn(f.table, "*", `${f.table} — signalements`, signalements(f.table, f.colEtab),
          [`Établissement ouvert par son lien : ses seuls signalements (lecture, ajout, mise à jour ; pas de suppression).`]);
        const { visas, auteur } = colonnesMasquees(f);
        if (visas.length) ajouterEn(f.table, visas.join(","), `${f.table} — visas (${visas.join(", ")})`,
          [{ aclFormula: E, permissionsText: "-RU", memo: `${MEMO} — ${qui} : visas réservés à la cellule` }],
          ["Établissement ouvert par son lien : ni lecture ni modification des visas."]);
        if (auteur) ajouterEn(f.table, auteur, `${f.table} — auteur (${auteur})`,
          [{ aclFormula: E, permissionsText: "-R", memo: `${MEMO} — ${qui} : adresse de l'auteur illisible` }],
          ["Établissement ouvert par son lien : adresse de l'auteur illisible."]);
        for (const st of sousTables(f)) ajouterEn(st.table, "*", `${st.table} — lignes des tableaux du formulaire`, signalements(st.table, COL_ACCES),
          [`Établissement ouvert par son lien : les lignes de ses signalements (colonne ${COL_ACCES}${st.acces ? "" : ", ajoutée à l'application"}).`]).sousTable = { ...st, formule: `$${st.parent}.${f.colEtab}`, type: `Ref:${g.table}` };
        // tables visées par les questions (listes de choix) : lecture
        Object.values(meta[f.table].colonnes).forEach(c => { const x = S.cibleRef(c.type) || (/^RefList:(.+)$/.exec(c.type) || [])[1]; if (x && x !== f.table && x !== g.table && meta[x] && x !== general.agents) lecture.add(x); });
      }
      ajouterEn(g.table, "*", `${g.table} — référentiel`, [{ aclFormula: `${E} and rec.id == user.${g.attribut}.id`, permissionsText: "+R-CUD", memo: `${MEMO} — ${qui} : sa seule ligne` }],
        ["Établissement ouvert par son lien : sa seule ligne, en lecture."]);
      ajouterEn(g.table, [R.LIEN.cle, R.LIEN.lien].sort().join(","), `${g.table} — clé et lien d'accès`, [{ aclFormula: E, permissionsText: "-RU", memo: `${MEMO} — ${qui} : clé et lien illisibles` }],
        ["Établissement ouvert par son lien : clé et lien illisibles (le widget passe ainsi en mode établissement)."]);
    }
    groupes.forEach(g => lecture.delete(g.table));
    const tous = groupes.map(condEtab), cond = tous.length > 1 ? tous.map(c => `(${c})`).join(" or ") : tous[0];
    for (const t of lecture) if (meta[t]) ajouterEn(t, "*", `${t} — lecture pour les établissements`,
      [{ aclFormula: cond, permissionsText: "+R-CUD", memo: `${MEMO} — établissements (lien) : lecture, pour le formulaire` }],
      ["Établissement ouvert par son lien : lecture (réglages, formulaires, listes de choix)."]);
  }
  const attributsProposes = () => [{ name: ATTRIBUT, tableId: general.agents, lookupColId: "Email", charId: "Email" },
    ...(avecInvites ? [{ name: INVITE, tableId: general.agents, lookupColId: S.INVITE.cle, charId: `LinkKey.${INVITE}` }] : []),
    ...(groupes || []).map(g => ({ name: g.attribut, tableId: g.table, lookupColId: R.LIEN.cle, charId: `LinkKey.${g.attribut}` }))];
  const estAttributSocle = r => { try { const n = JSON.parse(r.userAttributes).name; return n === ATTRIBUT || n === S.INVITE.attribut || /^Etab(_|$)/.test(n); } catch (_) { return false; } };

  // Règles en place qui seront remplacées : tables gérées (toutes colonnes), règle par défaut, attribut « Agent »
  function aRemplacer(propose) {
    if (!acl) return [];
    // tables gérées : toutes leurs règles ; règles spéciales (*SPECIAL) : seulement celles que le socle propose (SchemaEdit)
    const tables = new Set(propose.filter(p => p.tableId !== "*SPECIAL").map(p => p.tableId));
    const speciales = new Set(propose.filter(p => p.tableId === "*SPECIAL").map(p => p.colIds));
    return acl.regles.filter(r => {
      const res = acl.ressources.get(r.resource);
      if (!res) return false;
      if (r.userAttributes) return estAttributSocle(r);
      if (r.memo.startsWith(MEMO)) return true;   // règle du socle, où qu'elle soit (ex. *SPECIAL:SchemaEdit de la 2.0.1)
      if (res.tableId === "*SPECIAL") return speciales.has(res.colIds);
      return tables.has(res.tableId);
    });
  }
  // Les règles du document correspondent-elles exactement à la proposition ?
  function aJour(propose) {
    if (!acl) return false;
    const enPlace = acl.regles.filter(r => r.userAttributes && estAttributSocle(r)).map(r => JSON.parse(r.userAttributes));
    const voulus = attributsProposes();
    if (enPlace.length !== voulus.length || !voulus.every(v => enPlace.some(a => a.name === v.name && a.tableId === v.tableId && a.lookupColId === v.lookupColId && a.charId === v.charId))) return false;
    if (propose.some(p => p.sousTable && !p.sousTable.acces)) return false;
    // pas de règle du socle restée sur une ressource qui n'est plus proposée (anciennes colonnes masquées…)
    const cles = new Set(propose.map(p => `${p.tableId}|${p.colIds}`));
    if (acl.regles.some(r => { const x = acl.ressources.get(r.resource); return x && !r.userAttributes && r.memo.startsWith(MEMO) && !cles.has(`${x.tableId}|${x.colIds}`); })) return false;
    return propose.every(p => {
      const res = [...acl.ressources.values()].filter(x => x.tableId === p.tableId && x.colIds === p.colIds);
      const regles = acl.regles.filter(r => !r.userAttributes && res.some(x => x.id === r.resource));
      return regles.length === p.regles.length && regles.every((r, i) => r.aclFormula === p.regles[i].aclFormula && r.permissionsText === p.regles[i].permissionsText);
    });
  }

  /* ---------- Contrôle des règles comme la page « Règles d'accès » de Grist ----------
     Grist range la permission S de la règle par défaut dans « modifier la structure », ajoute ses règles
     intégrées après la règle par défaut et après la structure, et refuse une condition vide qui n'est pas
     la dernière d'un ensemble (« Condition cannot be blank »). */
  const bits = t => { t = String(t || "").trim(); if (t === "all") return { plus: "CRUDS", moins: "" }; if (t === "none") return { plus: "", moins: "CRUDS" };
    const p = /\+([A-Z]*)/.exec(t), m = /-([A-Z]*)/.exec(t); return { plus: p ? p[1] : "", moins: m ? m[1] : "" }; };
  function problemesGrist() {
    if (!acl) return [];
    const parRes = new Map();
    acl.regles.forEach(r => { if (r.userAttributes) return; const res = acl.ressources.get(r.resource); if (!res || !res.tableId) return;
      if (!parRes.has(res.id)) parRes.set(res.id, { res, l: [] }); parRes.get(res.id).l.push(r); });
    const out = [];
    for (const { res, l } of parRes.values()) {
      const nom = res.tableId === "*" ? "Règles par défaut" : res.tableId === "*SPECIAL" ? `Règle spéciale ${res.colIds}` : `${res.tableId}${res.colIds !== "*" ? ` (colonnes ${res.colIds})` : ""}`;
      if (res.tableId === "*" && res.colIds === "*") {
        // deux ensembles, chacun suivi des règles intégrées de Grist : toute condition vide y est refusée
        l.forEach(r => { if (r.aclFormula.trim()) return; const b = bits(r.permissionsText);
          if (b.plus.replace("S", "") || b.moins.replace("S", "")) out.push({ nom, r, ou: "règles par défaut" });
          if (b.plus.includes("S") || b.moins.includes("S")) out.push({ nom, r, ou: "modification de la structure" }); });
      } else if (!(res.tableId === "*SPECIAL" && res.colIds === "SchemaEdit")) {
        l.forEach((r, i) => { if (!r.aclFormula.trim() && i < l.length - 1 && r.permissionsText.trim()) out.push({ nom, r, ou: "" }); });
      }
      if (res.tableId === "*SPECIAL" && res.colIds === "SchemaEdit") l.forEach(r => out.push({ nom, r, ou: "ressource inconnue du serveur Grist" }));
    }
    return out;
  }
  function bandeauProblemes() {
    const p = problemesGrist(); if (!p.length) return "";
    return `<div class="bandeau alerte"><strong>La page « Règles d'accès » de Grist refusera d'enregistrer ces règles</strong> (condition vide qui n'est pas la dernière de son ensemble) :
      <ul style="margin:6px 0 0">${p.map(x => `<li>${esc(x.nom)}${x.ou ? ` › ${esc(x.ou)}` : ""} : <code>${esc(x.r.aclFormula || "condition vide")}</code> <code>${esc(x.r.permissionsText)}</code>${x.r.memo ? ` <small>(${esc(x.r.memo)})</small>` : ""}</li>`).join("")}</ul>
      ${p.some(x => x.r.memo.startsWith(MEMO)) ? "« Appliquer les règles » ci-dessous les remplace par des règles valides." : "Ce ne sont pas des règles du socle : corrigez-les dans Grist (donnez-leur une condition, par exemple <code>user.Access != OWNER</code>)."}</div>`;
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
      ${bandeauProblemes()}
      ${carteQui()}
      ${cartePages()}
      ${carteRegles(propose, remplacees, ok, sansFormule)}
      ${carteActuelles(remplacees)}
      ${carteAFaire()}`;
    lier();
  }

  function carteQui() {
    const lignes = (agents || []).map(a => {
      const champs = a.champsAcces || [];
      const droits = !a.actif ? `<span class="pastille">inactif : aucun accès</span>`
        : !a.email && !a.cle ? `<span class="pastille manque">sans adresse : aucun accès</span>`
        : champs.length ? `<span class="pastille ok">saisie ${esc(champs.join(" et "))}</span>${champs.length < S.CHAMPS.length ? ` <span class="pastille">lecture ${esc(S.CHAMPS.map(c => c.id).filter(c => !champs.includes(c)).join(", "))}</span>` : ""}`
        : `<span class="pastille">lecture seule (aucun créneau à 7 jours)</span>`;
      return `<tr${a.actif ? "" : ` class="inactif"`}><td><strong>${esc(a.nom)}</strong>${a.cle ? ` <span class="pastille reco">invité</span>` : ""}</td><td>${a.email ? esc(a.email) : a.cle ? "lien personnel" : "—"}</td><td>${droits}</td></tr>`;
    }).join("");
    return `<section class="carte"><h2>Qui aura accès à quoi</h2>
      <p class="aide">D'après l'équipe et le planning. Un agent saisit sur les formulaires d'un champ (EN, ESR) s'il y est mobilisé sur un créneau entre 7 jours avant et 7 jours après aujourd'hui ; Grist recalcule ces champs environ toutes les heures et à chaque modification du planning. Les personnes absentes de l'équipe ne voient rien ; les propriétaires du document voient et modifient tout.</p>
      ${agents && agents.length ? `<table class="eq-table"><thead><tr><th>Agent</th><th>Adresse (compte Grist)</th><th>Droits</th></tr></thead><tbody>${lignes}</tbody></table>` : `<p class="vide">Aucun agent dans l'équipe.</p>`}
      ${agents && agents.some(a => a.champsAcces === null) ? `<p class="avert">Champs non calculés : ajoutez la colonne Champs_acces (bandeau ci-dessus).</p>` : ""}</section>`;
  }

  function carteRegles(propose, remplacees, ok, sansFormule) {
    return `<section class="carte"><h2>Règles proposées</h2>
      <p class="aide">Attribut utilisateur « ${ATTRIBUT} » : la ligne de la table ${esc(general.agents)} dont l'adresse (colonne Email) est celle du compte Grist connecté.${avecInvites ? ` Attribut « ${INVITE} » : la ligne de ${esc(general.agents)} dont la clé (${esc(S.INVITE.cle)}) est celle du lien d'un agent invité (paramètre ${INVITE}_) ; l'invité a les droits d'un agent.` : ""}${(groupes || []).map(g => ` Attribut « ${esc(g.attribut)} » : la ligne de ${esc(g.table)} dont la clé (${esc(R.LIEN.cle)}) est celle du lien (paramètre ${esc(g.attribut)}_).`).join("")}</p>
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
        ${avecInvites && (agents || []).some(a => a.cle) ? `<li>Agents invités (lien personnel) : comme pour les établissements, le document doit être partagé publiquement en <strong>Éditeur</strong> ; testez le lien dans une fenêtre de navigation privée.</li>` : ""}
        <li>${(groupes || []).length ? `Accès des établissements par lien : vérifiez avec un compte qui n'est ni propriétaire ni dans l'équipe, en ouvrant un lien de l'onglet Établissements ; ouvrez ensuite le partage public du document en <strong>Éditeur</strong> (bouton « Partager » de Grist).`
          : "Accès des établissements par lien personnel : à mettre en place dans l'onglet Établissements (clés, page, publipostage) ; les règles s'ajoutent ensuite ici."}</li>
      </ol></section>`;
  }

  /* ---------- Événements et écritures ---------- */
  const dire = (t, err) => { const st = $("ac-statut"); if (st) { st.textContent = t; st.className = `statut${err ? " err" : " ok"}`; } };
  /* ---------- Pages visibles par les liens ----------
     Grist masque une page qui contient une table illisible, ainsi que toutes les pages rangées dessous.
     Page « Cellule » (table Cellule, illisible des liens) : tout le reste y est rangé, sauf les pages
     ouvertes par les liens (page des établissements, pages de saisie des invités). */
  let pagesDoc = null;
  async function lirePagesDoc() {
    try {
      const [p, v, s, t] = await Promise.all(["_grist_Pages", "_grist_Views", "_grist_Views_section", "_grist_Tables"].map(x => grist.docApi.fetchTable(x)));
      const tref = n => t.id[t.tableId.indexOf(n)];
      const optionsDe = i => { try { const o = JSON.parse(s.options[i] || "{}") || {}; return typeof o.customView === "string" ? JSON.parse(o.customView || "{}") : (o.customView || {}); } catch (_) { return {}; } };
      const invites = new Set((agents || []).filter(a => a.cle && a.pageSaisie).map(a => a.pageSaisie));
      const liste = p.id.map((id, i) => {
        const viewRef = p.viewRef[i], secs = s.id.map((_, k) => k).filter(k => s.parentId[k] === viewRef);
        return { id, viewRef, pagePos: Number((p.pagePos || [])[i]) || i, indentation: Number((p.indentation || [])[i]) || 0,
          nom: String(v.name[v.id.indexOf(viewRef)] || ""),
          cellule: secs.some(k => s.tableRef[k] === tref(S.TABLE_CELLULE)),
          lien: secs.some(k => { const cv = optionsDe(k); return cv.widgetOptions && cv.widgetOptions.etablissements; }) || invites.has(viewRef) };
      }).sort((a, b) => a.pagePos - b.pagePos);
      const c = liste.findIndex(x => x.cellule);
      liste.forEach(x => { x.sousCellule = false; });
      if (c >= 0) for (let i = c + 1; i < liste.length && liste[i].indentation > liste[c].indentation; i++) liste[i].sousCellule = true;
      return liste;
    } catch (_) { return null; }
  }
  function cartePages() {
    if (!pagesDoc) return "";
    const exposees = pagesDoc.filter(x => !x.cellule && !x.lien && !x.sousCellule), liens = pagesDoc.filter(x => x.lien);
    const enPlace = pagesDoc.some(x => x.cellule) && !exposees.length && liens.every(x => !x.sousCellule);
    return `<section class="carte"><h2>Pages visibles par les liens</h2>
      <p class="aide">Un établissement ou un invité ouvre sa page seule, sans la liste des pages (lien « page seule »). Pour qu'aucune autre page ne lui reste accessible, elles sont rangées sous une page « Cellule », liée à une table qu'il ne peut pas lire : Grist masque alors cette page et tout ce qu'elle contient. Les données restent de toute façon filtrées par les règles ci-dessous.</p>
      ${enPlace ? `<p class="statut ok">Pages rangées : ${liens.length > 1 ? `seules ${liens.map(x => `« ${esc(x.nom)} »`).join(", ")} restent visibles` : liens.length ? `seule « ${esc(liens[0].nom)} » reste visible` : "aucune page n'est visible"} des liens.</p>`
        : `<p>${exposees.length ? `Visibles par les liens aujourd'hui : ${exposees.map(x => `« ${esc(x.nom)} »`).join(", ")}.` : ""}
          ${liens.some(x => x.sousCellule) ? ` À sortir de « Cellule » (pages ouvertes par les liens) : ${liens.filter(x => x.sousCellule).map(x => `« ${esc(x.nom)} »`).join(", ")}.` : ""}</p>
          <div class="boutons"><button class="primaire" id="ac-pages">Ranger les pages sous « Cellule »</button><span class="statut" id="ac-pages-statut" role="status"></span></div>`}
      <p class="aide">Les pages créées ensuite (nouvel agent, nouveau tableau de bord…) se placent en bas de la liste : revenez ici pour les ranger. Appliquez ensuite les règles (table ${esc(S.TABLE_CELLULE)}).</p></section>`;
  }
  async function rangerPages() {
    const st = m => { const e = $("ac-pages-statut"); if (e) e.textContent = m; };
    $("ac-pages").disabled = true; st("Rangement…");
    try {
      if (!meta[S.TABLE_CELLULE]) { await grist.docApi.applyUserActions([["AddTable", S.TABLE_CELLULE, [{ id: "Note", type: "Text", isFormula: false }]]]); meta = await S.lireMeta(); }
      if (!pagesDoc.some(x => x.cellule)) {
        const res = await grist.docApi.applyUserActions([["CreateViewSection", meta[S.TABLE_CELLULE].ref, 0, "record", null, null]]);
        const rv = (res && res.retValues && res.retValues[0]) || {};
        if (rv.viewRef) await grist.docApi.applyUserActions([["UpdateRecord", "_grist_Views", rv.viewRef, { name: "Cellule" }], ...(rv.sectionRef ? [["UpdateRecord", "_grist_Views_section", rv.sectionRef, { title: "Pages réservées à la cellule" }]] : [])]);
      }
      pagesDoc = await lirePagesDoc();
      const cel = pagesDoc.find(x => x.cellule), liens = pagesDoc.filter(x => x.lien), autres = pagesDoc.filter(x => x !== cel && !x.lien);
      const ordre = [...liens.map(x => ({ x, ind: 0 })), { x: cel, ind: 0 }];
      let prec = 0;
      for (const x of autres) { const ind = Math.max(1, Math.min(x.indentation + 1, prec + 1)); ordre.push({ x, ind }); prec = ind; }
      await grist.docApi.applyUserActions([["BulkUpdateRecord", "_grist_Pages", ordre.map(o => o.x.id), { pagePos: ordre.map((_, i) => i + 1), indentation: ordre.map(o => o.ind) }]]);
      await charger(); pagesDoc = await lirePagesDoc(); dessiner();
      dire(`Pages rangées sous « Cellule »${aJour(reglesProposees()) ? "." : " : appliquez maintenant les règles pour que la table Cellule soit illisible des liens."}`);
    } catch (e) { $("ac-pages").disabled = false; st(`Refusé par Grist (${e.message || e}).`); }
  }

  function lier() {
    if ($("ac-pages")) $("ac-pages").addEventListener("click", rangerPages);
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
    $("ac-appliquer").disabled = true; dire("Application des règles…");
    try {
      await appliquerRegles();
      await charger(); dessiner();
      dire("Règles appliquées. Vérifiez-les avec « Voir en tant que » dans la page Règles d'accès de Grist.");
    } catch (e) {
      await charger(); dessiner();
      dire(`Règles refusées par Grist (${e.message || e}). Seul un propriétaire peut modifier les règles d'accès.`, true);
    }
  }
  // Écrit les règles proposées (sans interface) ; lève une erreur si Grist refuse
  async function appliquerRegles() {
    const propose = reglesProposees();
    {
      // 0. sous-tables : colonne d'aide (établissement du signalement parent), lue par les règles
      const aides = propose.filter(p => p.sousTable && !p.sousTable.acces);
      if (aides.length) await grist.docApi.applyUserActions(aides.map(p => ["AddColumn", p.tableId, COL_ACCES, { type: p.sousTable.type, isFormula: true, formula: p.sousTable.formule }]));
      // 1. ressources manquantes
      const trouver = (t, c) => [...acl.ressources.values()].find(x => x.tableId === t && x.colIds === c);
      const manquantes = propose.filter(p => !trouver(p.tableId, p.colIds));
      if (manquantes.length) await grist.docApi.applyUserActions(manquantes.map(p => ["AddRecord", "_grist_ACLResources", null, { tableId: p.tableId, colIds: p.colIds }]));
      acl = await lireAcl();
      // 2. règles : suppression des anciennes, ajout des nouvelles (attribut utilisateur en tête)
      const ids = aRemplacer(propose).map(r => r.id);
      let pos = Math.max(0, ...acl.regles.filter(r => !ids.includes(r.id)).map(r => r.rulePos).filter(Number.isFinite)) + 1;
      const defaut = trouver("*", "*");
      const ajouts = attributsProposes().map(a => ["AddRecord", "_grist_ACLRules", null, { resource: defaut.id, userAttributes: JSON.stringify(a), rulePos: pos++, aclFormula: "", permissionsText: "", memo: "" }]);
      for (const p of propose) {
        const res = trouver(p.tableId, p.colIds);
        p.regles.forEach(r => ajouts.push(["AddRecord", "_grist_ACLRules", null, { resource: res.id, aclFormula: r.aclFormula, permissionsText: r.permissionsText, memo: r.memo, rulePos: pos++ }]));
      }
      // ressource « *SPECIAL:SchemaEdit » écrite par la 2.0.1 : Grist ne la connaît que dans sa page, pas sur le serveur
      const restantes = new Set(acl.regles.filter(r => !ids.includes(r.id)).map(r => r.resource));
      const fantomes = [...acl.ressources.values()].filter(x => x.tableId === "*SPECIAL" && x.colIds === "SchemaEdit" && !restantes.has(x.id)).map(x => x.id);
      await grist.docApi.applyUserActions([...(ids.length ? [["BulkRemoveRecord", "_grist_ACLRules", ids]] : []), ...ajouts,
        ...(fantomes.length ? [["BulkRemoveRecord", "_grist_ACLResources", fantomes]] : [])]);
      await R.majSchemaPublic(meta, config, general, formulaires);
    }
  }
  // Après la publication d'un formulaire (nouvelle sous-table, nouvelles questions de visa…) : si les règles du socle
  // sont en place mais ne correspondent plus, elles sont réappliquées. Rien n'est fait si le document n'utilise pas
  // ces règles. Renvoie { etat: "sans-regles" | "a-jour" | "reappliquees" | "illisibles" | "incomplet" | "refusees", texte }.
  async function reappliquerSiBesoin() {
    try { await charger(); } catch (e) { return { etat: "illisibles", texte: "" }; }
    if (acl === null) return { etat: "illisibles", texte: "Si le document utilise les règles d'accès du socle, un propriétaire doit les réappliquer (onglet Accès)." };
    const enPlace = acl.regles.some(r => r.memo.startsWith(MEMO) || (r.userAttributes && estAttributSocle(r)));
    if (!enPlace) return { etat: "sans-regles", texte: "" };
    if (aJour(reglesProposees())) return { etat: "a-jour", texte: "Règles d'accès à jour." };
    if (!meta[general.agents] || !meta[general.agents].colonnes.Champs_acces) return { etat: "incomplet", texte: "Les règles d'accès ne correspondent plus au formulaire : réappliquez-les dans l'onglet Accès." };
    try {
      await appliquerRegles();
      await charger(); if (racine && !racine.hidden) dessiner();
      return { etat: "reappliquees", texte: "Règles d'accès réappliquées pour tenir compte du formulaire." };
    } catch (e) { return { etat: "refusees", texte: `Les règles d'accès n'ont pas pu être réappliquées (${e.message || e}) : faites-le dans l'onglet Accès.` }; }
  }
  function retirer() {
    const socle = acl.regles.filter(r => r.memo.startsWith(MEMO) || (r.userAttributes && estAttributSocle(r)));
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
    try { await charger(); pagesDoc = await lirePagesDoc(); } catch (e) { racine.innerHTML = `<div class="bandeau alerte">Lecture impossible : ${esc(e.message || e)}</div>`; return; }
    dessiner();
  }
  window.OngletAcces = { afficher, reappliquerSiBesoin };
})();
