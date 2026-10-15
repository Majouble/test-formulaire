/* =====================================================================
   Administration v2 — onglet « Point de situation »
   Éditeur guidé (tableaux et conditions, colonnes et leurs lignes, tris) avec aperçu en direct, calculé par le
   même moteur que le widget du point de situation (commun/point-moteur.js) sur les signalements du document.
   Clé « point_situation » de Config : { brouillon, publie, publie_le, modifie_le }.
   ===================================================================== */
(function () {
  "use strict";
  const S = window.Socle;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const copie = o => JSON.parse(JSON.stringify(o));
  const norm = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

  const DEFAUT = {
    options: {},
    sections: [
      { Titre: "Violences signalées", Condition: "Violences = Oui", Actif: true },
      { Titre: "Etat des mobilisations", Condition: "", Actif: true },
    ],
    colonnes: [
      { Titre: "Académie", Contenu: "**{Etablissement.Academie}**\n{Etablissement.Departement}", Largeur: 14, Couleur: "17877A", Fusionner: true, Tableaux: "", Actif: true },
      { Titre: "Établissement", Contenu: "**{Etablissement.Nom}**\n{Etablissement.Commune}\n{nouveau}", Largeur: 30, Couleur: "17877A", Fusionner: false, Tableaux: "", Actif: true },
      { Titre: "Actions", Contenu: "{Qualification}", Largeur: 14, Couleur: "B2C6BD", Fusionner: false, Tableaux: "", Actif: true },
      { Titre: "Suites", Contenu: "{Suites}", Largeur: 10, Couleur: "B2C6BD", Fusionner: false, Tableaux: "", Actif: true },
      { Titre: "Synthèse", Contenu: "{Description|sans_entete}", Largeur: 32, Couleur: "17877A", Fusionner: false, Tableaux: "", Actif: true },
    ],
    tri: [
      { Champ: "Etablissement.Academie", Sens: "A→Z", Valeurs: "", Actif: true },
      { Champ: "Etablissement.Departement", Sens: "A→Z", Valeurs: "", Actif: true },
      { Champ: "Etablissement.Nom", Sens: "A→Z", Valeurs: "", Actif: true },
    ],
  };
  const SENS = [["A→Z", "croissant (A → Z)"], ["Z→A", "décroissant (Z → A)"], ["Liste", "selon une liste de valeurs"], ["Ordre des choix", "ordre des choix de la colonne"]];
  const OPERATEURS = [["=", "est"], ["!=", "n'est pas"], ["contient", "contient"], ["ne contient pas", "ne contient pas"], [">", "est supérieur à"], ["<", "est inférieur à"],
    ["n'est pas vide", "est renseigné"], ["est vide", "est vide"]];
  const SANS_VALEUR = new Set(["n'est pas vide", "est vide"]);
  const STYLES = [["", "normal"], ["**", "gras"], ["==", "surligné"]];
  const FILTRES_LIB = [["", "tel quel"], ["sans_entete", "sans l'en-tête"], ["majuscules", "en majuscules"], ["date", "date seule"], ["heure", "heure seule"]];
  const OPTIONS_EN_TETE = [["bandeau", "Bandeau", "Mouvements sociaux"], ["perimetre_court", "Périmètre (bandeau)", "EN"], ["perimetre_long", "Périmètre (titre)", "ENSEIGNEMENT SUPÉRIEUR"]];
  const OPTIONS_AVANCEES = [["table", "Table des signalements"], ["dossier", "Colonne dossier (version initiale)"], ["date", "Date de saisie (dernière version, mention « nouveau »)"],
    ["dateFaits", "Date des faits (période)"], ["nature", "Nature (nouveau signalement / mise à jour)"], ["champAcademie", "Champ de l'académie (filtre de l'aperçu et du widget)"],
    ["modeleTable", "Table du modèle Word"], ["modeleColonne", "Colonne (pièce jointe) du modèle Word"]];

  let config = null, ps = null, brouillon = null, defauts = {}, anciennes = [], demarre = false, minuterie = null, minuterieApercu = null;
  let champs = [];            // [{ chemin, libelle, groupe, type }]
  let donnees = null;         // { source, lecteur, lignes } : signalements du document, pour l'aperçu et les valeurs proposées
  const valeursCache = new Map();
  let apercuReglages = { periode: "tout", academie: "" }, dernierPoint = null;
  const modeLibre = new Set();   // « sections:2 », « colonnes:0 » : éléments affichés en saisie libre

  const statut = (t, type) => { const e = $("ps-statut"); if (e) { e.textContent = t || ""; e.className = `statut ${type || ""}`; } };

  /* ======================= Chargement ======================= */
  async function charger() {
    const meta = await S.lireMeta();
    config = await S.lireConfig(meta);
    if (!config) { $("ps-editeur").innerHTML = `<p class="statut err">La table Config n'existe pas : terminez d'abord l'installation.</p>`; return false; }
    defauts = await S.reglagesPointParDefaut(meta, config);
    ps = config.valeurs.point_situation || {};
    brouillon = copie(ps.brouillon || ps.publie || DEFAUT);
    for (const k of ["options", "sections", "colonnes", "tri"]) if (!brouillon[k]) brouillon[k] = copie(DEFAUT[k]);
    for (const c of brouillon.colonnes) c.Tableaux = listeTableaux(c).join(", ");   // séparateur lu par le moteur
    anciennes = ["Colonnes_point", "Sections_point", "Tri_point"].filter(n => meta[n]);
    // champs proposés : colonnes des signalements, et colonnes des tables visées par leurs références
    const table = brouillon.options.table || defauts.table, t = meta[table];
    champs = [];
    if (t) {
      const lib = c => c.label && c.label !== c.colId ? c.label : c.colId.replace(/_/g, " ");
      const technique = c => /^(manualSort|gristHelper)/.test(c.colId);
      for (const c of Object.values(t.colonnes)) if (!technique(c)) champs.push({ chemin: c.colId, libelle: lib(c), groupe: "Signalement", type: c.type });
      for (const c of Object.values(t.colonnes)) {
        const cible = S.cibleRef(c.type);
        if (!cible || !meta[cible] || cible === table) continue;
        for (const c2 of Object.values(meta[cible].colonnes)) if (!technique(c2))
          champs.push({ chemin: `${c.colId}.${c2.colId}`, libelle: lib(c2), groupe: lib(c), type: c2.type });
      }
    }
    await chargerDonnees();
    return true;
  }
  async function chargerDonnees() {
    valeursCache.clear();
    const table = brouillon.options.table || defauts.table;
    try {
      const source = creerSource(), base = await source.table(table), lecteur = await creerLecteur(source, table);
      await lecteur.preparer(champs.map(c => c.chemin));
      donnees = { source, lecteur, lignes: base.lignes };
    } catch (e) { donnees = null; console.warn(e); }
  }
  // valeurs présentes dans les signalements pour un champ (et choix de la colonne), pour les propositions
  function valeursDe(chemin) {
    if (!chemin || !donnees) return [];
    if (valeursCache.has(chemin)) return valeursCache.get(chemin);
    const compte = new Map(), ajouter = v => { const s = String(v ?? "").trim(); if (s) compte.set(s, (compte.get(s) || 0) + 1); };
    for (const r of donnees.lignes) {
      const v = donnees.lecteur.lire(r, chemin);
      if (Array.isArray(v)) v.forEach(ajouter); else if (v === true) ajouter("Oui"); else if (v === false) ajouter("Non");
      else if (!(v instanceof Date) && typeof v !== "object") ajouter(v);
    }
    let choix = []; try { choix = donnees.lecteur.choix(chemin) || []; } catch (_) {}
    const liste = [...new Set([...choix.map(String), ...[...compte.keys()].sort((a, b) => compte.get(b) - compte.get(a))])].slice(0, 200);
    const info = champs.find(c => c.chemin === chemin);
    if (info && info.type === "Bool" && !liste.length) liste.push("Oui", "Non");
    valeursCache.set(chemin, liste);
    return liste;
  }

  /* ======================= Enregistrement ======================= */
  function modifie(structure) {
    clearTimeout(minuterie); statut("Modifications non enregistrées…");
    minuterie = setTimeout(sauverBrouillon, 700);
    if (structure) dessinerEditeur(); else dessinerEtat();
    planifierApercu();
  }
  async function sauverBrouillon() {
    clearTimeout(minuterie);
    try {
      ps = { ...ps, brouillon: copie(brouillon), modifie_le: Date.now() / 1000 };
      await S.ecrireConfig("point_situation", ps);
      statut("Brouillon enregistré.", "ok"); dessinerEtat();
    } catch (e) { statut(`Brouillon non enregistré : ${e.message || e}`, "err"); }
  }
  async function publier() {
    clearTimeout(minuterie);
    if (!brouillon.sections.some(x => x.Actif !== false)) { statut("Ajoutez au moins un tableau actif avant de publier.", "err"); return; }
    if (dernierPoint && dernierPoint.horsSection && !confirm(`${dernierPoint.horsSection} signalement(s) n'entrent dans aucun tableau et n'apparaîtront pas. Publier quand même ?`)) return;
    try {
      ps = { ...ps, brouillon: copie(brouillon), publie: copie(brouillon), publie_le: Date.now() / 1000, modifie_le: Date.now() / 1000 };
      await S.ecrireConfig("point_situation", ps);
      statut("Configuration publiée : actualisez le widget du point de situation pour l'appliquer.", "ok"); dessinerEditeur();
    } catch (e) { statut(`Publication impossible : ${e.message || e}`, "err"); }
  }
  const egalPublie = () => !!ps.publie && JSON.stringify(ps.publie) === JSON.stringify(brouillon);

  async function importer() {
    if (!confirm("Remplacer le brouillon par la configuration des tables Colonnes_point, Sections_point et Tri_point (et des réglages de la table Parametres) ?")) return;
    const lire = async n => { try { const t = await grist.docApi.fetchTable(n); return t.id.map((id, i) => Object.fromEntries(Object.keys(t).filter(k => k !== "id" && k !== "manualSort").map(k => [k, t[k][i]]))); } catch (_) { return null; } };
    const ordre = a => (a || []).slice().sort((x, y) => (x.Ordre ?? 1e9) - (y.Ordre ?? 1e9));
    const garder = (l, cles) => l.map(r => Object.fromEntries(cles.map(k => [k, r[k] ?? (k === "Actif" ? true : "")])));
    const [c, s, t] = await Promise.all(["Colonnes_point", "Sections_point", "Tri_point"].map(lire));
    if (c) brouillon.colonnes = garder(ordre(c), ["Titre", "Contenu", "Largeur", "Couleur", "Fusionner", "Tableaux", "Actif"]);
    if (s) brouillon.sections = garder(ordre(s), ["Titre", "Condition", "Actif"]);
    if (t) brouillon.tri = garder(ordre(t), ["Champ", "Sens", "Valeurs", "Actif"]);
    try {
      const p = await grist.docApi.fetchTable("Parametres"), v = (p.Reglages_point_situation || []).find(x => x && String(x).trim());
      if (v) brouillon.options = Object.fromEntries(Object.entries(JSON.parse(v)).filter(([k]) => k !== "tri"));
    } catch (_) { /* pas de réglages */ }
    modifie(true); await sauverBrouillon();
    statut("Configuration importée dans le brouillon : vérifiez-la avec l'aperçu, puis publiez.", "ok");
  }
  async function preparerModele() {
    try {
      const meta = await S.lireMeta(), acts = [];
      if (!meta[S.TABLE_CONFIG].colonnes.Fichier) acts.push(["AddColumn", S.TABLE_CONFIG, "Fichier", { type: "Attachments", isFormula: false }]);
      const cfg = await S.lireConfig(meta);
      if (!cfg.ids.modele_point_situation) acts.push(["AddRecord", S.TABLE_CONFIG, null, { Cle: "modele_point_situation", Valeur: JSON.stringify({ role: "Modèle Word du point de situation (pièce jointe dans la colonne Fichier)" }) }]);
      if (acts.length) await grist.docApi.applyUserActions(acts);
      statut("Emplacement prêt : dans Grist, « Données brutes › Config », ligne « modele_point_situation », déposez le modèle .docx dans la cellule Fichier.", "ok");
    } catch (e) { statut(`Préparation impossible : ${e.message || e}`, "err"); }
  }

  /* ======================= Conditions : texte ⇄ clauses ======================= */
  function versClauses(texte) {
    const t = String(texte || "").trim();
    if (!t) return [];
    const morceaux = t.split(/\s+(et|ou)\s+/i), res = [];
    for (let i = 0; i < morceaux.length; i += 2) {
      const a = analyserCondition(morceaux[i]);
      if (!a) return null;
      const connu = champs.find(c => c.chemin === a.chemin) || champs.find(c => norm(c.chemin) === norm(a.chemin) || norm(c.libelle) === norm(a.chemin));
      res.push({ lien: i ? morceaux[i - 1].toLowerCase() : "et", chemin: connu ? connu.chemin : a.chemin, op: a.op, val: a.brut });
    }
    return res;
  }
  const versTexte = clauses => clauses.filter(c => c.chemin).map((c, i) => `${i ? ` ${c.lien} ` : ""}${`${c.chemin} ${c.op}${SANS_VALEUR.has(c.op) ? "" : ` ${c.val || ""}`}`.trimEnd()}`).join("");

  /* ======================= Contenu d'une colonne : texte ⇄ lignes ======================= */
  function versLignes(contenu) {
    if (!String(contenu || "")) return [];
    return String(contenu).split(/\n|\\n/).map(l => {
      const m = l.match(/^(\*\*|==)?\{([^{}|]+?)(?:\|([^{}]+))?\}(\*\*|==)?$/);
      if (m && (m[1] || "") === (m[4] || "")) {
        if (m[2].trim() === "nouveau") return { type: "nouveau" };
        return { type: "champ", chemin: m[2].trim(), style: m[1] || "", filtre: (m[3] || "").trim() };
      }
      return { type: "texte", texte: l };
    });
  }
  const versContenu = lignes => lignes.map(l => l.type === "nouveau" ? "{nouveau}" : l.type === "texte" ? l.texte
    : `${l.style || ""}{${l.chemin}${l.filtre ? `|${l.filtre}` : ""}}${l.style || ""}`).join("\n");
  const listeTableaux = c => String(c.Tableaux || "").split(/,|\n|;/).map(x => x.trim()).filter(Boolean);

  /* ======================= Rendu de l'éditeur ======================= */
  function optionsChamps(choisi, avecVide = true) {
    const groupes = [...new Set(champs.map(c => c.groupe))];
    const inconnu = choisi && !champs.some(c => c.chemin === choisi) ? `<option value="${esc(choisi)}" selected>${esc(choisi)} (introuvable)</option>` : "";
    return (avecVide ? `<option value="">— choisir un champ —</option>` : "") + inconnu + groupes.map(g => `<optgroup label="${esc(g)}">${champs.filter(c => c.groupe === g)
      .map(c => `<option value="${esc(c.chemin)}" ${c.chemin === choisi ? "selected" : ""}>${esc(c.groupe === "Signalement" ? c.libelle : `${c.groupe} › ${c.libelle}`)}</option>`).join("")}</optgroup>`).join("");
  }
  const libelleChamp = ch => { const c = champs.find(x => x.chemin === ch); return c ? (c.groupe === "Signalement" ? c.libelle : `${c.groupe} › ${c.libelle}`) : ch; };
  const outils = (liste, i, n) => `<span class="ps-outils">
      <button type="button" class="ps-mini" data-act="haut" data-liste="${liste}" data-i="${i}" title="Monter" ${i === 0 ? "disabled" : ""}>↑</button>
      <button type="button" class="ps-mini" data-act="bas" data-liste="${liste}" data-i="${i}" title="Descendre" ${i === n - 1 ? "disabled" : ""}>↓</button>
      <button type="button" class="ps-mini danger" data-act="retirer" data-liste="${liste}" data-i="${i}" title="Retirer">×</button></span>`;
  const interrupteur = (liste, i, actif) => `<label class="ps-actif" title="Inclure dans le point"><input type="checkbox" data-liste="${liste}" data-i="${i}" data-cle="Actif" ${actif !== false ? "checked" : ""}> actif</label>`;
  const compte = i => { if (!dernierPoint) return ""; const s = dernierPoint.parSection[i]; return s == null ? "" : `<span class="pastille ${s ? "ok" : ""}">${s} signalement${s > 1 ? "s" : ""}</span>`; };

  function htmlSection(r, i) {
    const cle = `sections:${i}`, clauses = versClauses(r.Condition), libre = modeLibre.has(cle) || clauses === null;
    const corps = libre
      ? `<input type="text" data-liste="sections" data-i="${i}" data-cle="Condition" value="${esc(r.Condition || "")}" placeholder="vide = tous les autres signalements">
         ${clauses === null ? `<small class="ps-note err">Condition non reconnue par l'assistant : modifiez-la ici.</small>` : ""}`
      : `${clauses.length ? clauses.map((c, k) => `<div class="ps-clause">
            ${k ? `<select class="ps-lien" data-clause="${k}" data-i="${i}" data-cc="lien"><option value="et" ${c.lien === "et" ? "selected" : ""}>et</option><option value="ou" ${c.lien === "ou" ? "selected" : ""}>ou</option></select>` : `<span class="ps-lien-1">si</span>`}
            <select data-clause="${k}" data-i="${i}" data-cc="chemin">${optionsChamps(c.chemin)}</select>
            <select data-clause="${k}" data-i="${i}" data-cc="op">${OPERATEURS.map(([v, l]) => `<option value="${esc(v)}" ${v === c.op ? "selected" : ""}>${l}</option>`).join("")}</select>
            ${SANS_VALEUR.has(c.op) ? "" : `<input type="text" data-clause="${k}" data-i="${i}" data-cc="val" value="${esc(c.val)}" list="ps-v-${i}-${k}" placeholder="valeur">
              <datalist id="ps-v-${i}-${k}">${valeursDe(c.chemin).map(v => `<option value="${esc(v)}">`).join("")}</datalist>`}
            <button type="button" class="ps-mini danger" data-act="clause-retirer" data-i="${i}" data-k="${k}" title="Retirer la condition">×</button></div>`).join("")
          : `<p class="ps-note">${i === brouillon.sections.length - 1 ? "Sans condition : reçoit tous les signalements qui ne sont pas déjà dans un tableau." : "Sans condition : ce tableau prend tous les signalements restants ; les tableaux suivants resteront vides."}</p>`}
         <button type="button" class="ps-lienbtn" data-act="clause-ajouter" data-i="${i}">+ condition</button>`;
    return `<div class="ps-bloc${r.Actif === false ? " inactif" : ""}">
      <div class="ps-bloc-tete"><span class="ps-num">${i + 1}</span>
        <input type="text" class="ps-titre" data-liste="sections" data-i="${i}" data-cle="Titre" value="${esc(r.Titre || "")}" placeholder="Titre du tableau" aria-label="Titre du tableau">
        ${compte(i)}${interrupteur("sections", i, r.Actif)}${outils("sections", i, brouillon.sections.length)}</div>
      <div class="ps-bloc-corps">${corps}
        <button type="button" class="ps-lienbtn discret" data-act="libre" data-cle-libre="${cle}">${libre ? "Assistant" : "Saisie libre"}</button></div></div>`;
  }

  function htmlColonne(r, i) {
    const cle = `colonnes:${i}`, libre = modeLibre.has(cle), lignes = versLignes(r.Contenu), tabs = listeTableaux(r);
    const titres = brouillon.sections.map(s => s.Titre).filter(Boolean);
    const corps = libre
      ? `<textarea rows="3" data-liste="colonnes" data-i="${i}" data-cle="Contenu">${esc(r.Contenu || "")}</textarea>
         <small class="ps-note">Champs entre accolades, <code>{nouveau}</code>, filtres <code>|sans_entete</code> <code>|majuscules</code> <code>|date</code> <code>|heure</code>, <code>**gras**</code>, <code>==surligné==</code>.</small>`
      : `${lignes.map((l, k) => `<div class="ps-clause">
            <span class="ps-ligne-n">${k + 1}</span>
            ${l.type === "champ" ? `<select data-ligne="${k}" data-i="${i}" data-lc="chemin">${optionsChamps(l.chemin, false)}</select>
              <select data-ligne="${k}" data-i="${i}" data-lc="style">${STYLES.map(([v, t]) => `<option value="${v}" ${v === (l.style || "") ? "selected" : ""}>${t}</option>`).join("")}</select>
              <select data-ligne="${k}" data-i="${i}" data-lc="filtre">${FILTRES_LIB.map(([v, t]) => `<option value="${v}" ${v === (l.filtre || "") ? "selected" : ""}>${t}</option>`).join("")}</select>`
            : l.type === "nouveau" ? `<span class="ps-badge">Mention « Nouveau signalement » (si nouveau depuis le dernier point)</span>`
            : `<input type="text" data-ligne="${k}" data-i="${i}" data-lc="texte" value="${esc(l.texte)}" placeholder="texte libre (peut contenir des {champs})">`}
            <span class="ps-outils"><button type="button" class="ps-mini" data-act="ligne-haut" data-i="${i}" data-k="${k}" ${k === 0 ? "disabled" : ""}>↑</button>
            <button type="button" class="ps-mini" data-act="ligne-bas" data-i="${i}" data-k="${k}" ${k === lignes.length - 1 ? "disabled" : ""}>↓</button>
            <button type="button" class="ps-mini danger" data-act="ligne-retirer" data-i="${i}" data-k="${k}">×</button></span></div>`).join("")}
         <div class="ps-ajouts"><span>Ajouter une ligne :</span>
           <select data-act-select="ligne-ajouter" data-i="${i}">${optionsChamps("", true).replace("— choisir un champ —", "un champ…")}</select>
           <button type="button" class="ps-lienbtn" data-act="ligne-nouveau" data-i="${i}">mention « Nouveau »</button>
           <button type="button" class="ps-lienbtn" data-act="ligne-texte" data-i="${i}">texte libre</button></div>`;
    return `<div class="ps-bloc${r.Actif === false ? " inactif" : ""}">
      <div class="ps-bloc-tete"><span class="ps-num">${i + 1}</span>
        <input type="text" class="ps-titre" data-liste="colonnes" data-i="${i}" data-cle="Titre" value="${esc(r.Titre || "")}" placeholder="Titre de la colonne" aria-label="Titre de la colonne">
        <label class="ps-petit" title="Largeur relative">larg. <input type="number" min="1" data-liste="colonnes" data-i="${i}" data-cle="Largeur" value="${esc(r.Largeur ?? 10)}"></label>
        <input type="color" title="Couleur de l'en-tête" data-liste="colonnes" data-i="${i}" data-cle="Couleur" value="#${esc(/^[0-9a-f]{6}$/i.test(r.Couleur || "") ? r.Couleur : "17877A")}">
        ${interrupteur("colonnes", i, r.Actif)}${outils("colonnes", i, brouillon.colonnes.length)}</div>
      <div class="ps-bloc-corps">${corps}
        <div class="ps-options-col">
          <label class="ps-petit"><input type="checkbox" data-liste="colonnes" data-i="${i}" data-cle="Fusionner" ${r.Fusionner ? "checked" : ""}> fusionner les cellules identiques qui se suivent</label>
          ${titres.length > 1 ? `<span class="ps-petit">Tableaux :</span>${titres.map(t => `<button type="button" class="puce-ps${tabs.includes(t) ? " on" : ""}" data-act="tableau" data-i="${i}" data-titre="${esc(t)}">${esc(t)}</button>`).join("")}<span class="ps-petit">${tabs.length ? "" : "(tous)"}</span>` : ""}
        </div>
        <button type="button" class="ps-lienbtn discret" data-act="libre" data-cle-libre="${cle}">${libre ? "Assistant" : "Saisie libre"}</button></div></div>`;
  }

  function htmlTri(r, i) {
    const vals = String(r.Valeurs || "").split(/\n|;/).map(x => x.trim()).filter(Boolean);
    const dispo = r.Sens === "Liste" ? valeursDe(r.Champ).filter(v => !vals.some(x => norm(x) === norm(v))) : [];
    return `<div class="ps-bloc${r.Actif === false ? " inactif" : ""}">
      <div class="ps-bloc-tete"><span class="ps-num">${i + 1}</span>
        <select data-liste="tri" data-i="${i}" data-cle="Champ">${optionsChamps(r.Champ)}</select>
        <select data-liste="tri" data-i="${i}" data-cle="Sens">${SENS.map(([v, l]) => `<option value="${v}" ${v === (r.Sens || "A→Z") ? "selected" : ""}>${l}</option>`).join("")}</select>
        ${interrupteur("tri", i, r.Actif)}${outils("tri", i, brouillon.tri.length)}</div>
      ${r.Sens === "Liste" ? `<div class="ps-bloc-corps"><span class="ps-petit">Ordre imposé (les autres valeurs suivent par ordre alphabétique) :</span>
        <div class="puces-ps">${vals.map((v, k) => `<span class="puce-ps on">${k + 1}. ${esc(v)}
          <button type="button" data-act="val-haut" data-i="${i}" data-k="${k}" title="Avancer" ${k === 0 ? "disabled" : ""}>‹</button><button type="button" data-act="val-retirer" data-i="${i}" data-k="${k}" title="Retirer">×</button></span>`).join("")}</div>
        ${dispo.length ? `<div class="puces-ps"><span class="ps-petit">Ajouter :</span>${dispo.slice(0, 40).map(v => `<button type="button" class="puce-ps" data-act="val-ajouter" data-i="${i}" data-val="${esc(v)}">+ ${esc(v)}</button>`).join("")}</div>` : ""}</div>` : ""}
    </div>`;
  }

  function dessinerEtat() {
    const e = $("ps-etat"); if (!e) return;
    const pub = ps.publie_le ? new Date(ps.publie_le * 1000).toLocaleString("fr-FR") : null;
    e.className = `pastille ${!ps.publie ? "manque" : egalPublie() ? "ok" : "reco"}`;
    e.textContent = !ps.publie ? "Jamais publié" : egalPublie() ? `Publié le ${pub}` : `Brouillon modifié (publié le ${pub})`;
    const a = $("ps-annuler"); if (a) a.hidden = !(ps.publie && !egalPublie());
  }
  function dessinerEditeur() {
    const y = window.scrollY, o = brouillon.options;
    const larg = brouillon.colonnes.filter(c => c.Actif !== false).reduce((s, c) => s + (Number(c.Largeur) || 0), 0);
    $("ps-editeur").innerHTML = `
    <section class="carte ps-entete-carte">
      <div class="ps-tete"><h2>Point de situation</h2><span id="ps-etat"></span><span style="flex:1"></span>
        ${anciennes.length ? `<button class="secondaire" id="ps-importer" title="Reprendre la configuration des tables ${anciennes.join(", ")}">Importer la configuration actuelle</button>` : ""}
        <button class="secondaire" id="ps-annuler" hidden>Revenir à la version publiée</button>
        <button class="primaire" id="ps-publier">Publier</button></div>
      <p class="aide">Le brouillon s'enregistre au fil de vos modifications et l'aperçu se met à jour en direct ; le widget du point de situation n'applique que la version publiée.</p>
    </section>
    <section class="carte"><h2>En-tête</h2>
      <div class="grille">${OPTIONS_EN_TETE.map(([k, l, ph]) => `<label class="champ"><span>${l}</span><input type="text" data-opt="${k}" value="${esc(o[k] || "")}" placeholder="${esc(ph)}"></label>`).join("")}</div>
    </section>
    <section class="carte"><h2>Tableaux</h2>
      <p class="aide">Chaque signalement va dans le premier tableau dont les conditions sont remplies. Laissez le dernier tableau sans condition pour recueillir tous les autres.</p>
      ${brouillon.sections.map(htmlSection).join("")}
      <button class="secondaire" data-act="ajouter" data-liste="sections">+ Ajouter un tableau</button>
    </section>
    <section class="carte"><h2>Colonnes</h2>
      <p class="aide">Chaque colonne affiche une ou plusieurs lignes : un champ (en gras, surligné…), la mention « Nouveau signalement », ou du texte. Largeur totale : <b>${larg}</b> (proportions).</p>
      ${brouillon.colonnes.map(htmlColonne).join("")}
      <button class="secondaire" data-act="ajouter" data-liste="colonnes">+ Ajouter une colonne</button>
    </section>
    <section class="carte"><h2>Ordre des signalements</h2>
      <p class="aide">Dans chaque tableau, du premier critère au dernier.</p>
      ${brouillon.tri.map(htmlTri).join("")}
      <button class="secondaire" data-act="ajouter" data-liste="tri">+ Ajouter un critère</button>
    </section>
    <section class="carte"><details><summary><b>Réglages avancés</b> (table, colonnes techniques, modèle Word)</summary>
      <p class="aide">Laissez vide pour la valeur déduite du socle (indiquée en grisé).</p>
      <div class="grille">${OPTIONS_AVANCEES.map(([k, l]) => `<label class="champ"><span>${l}</span><input type="text" data-opt="${k}" value="${esc(o[k] || "")}" placeholder="${esc(defauts[k] || "")}"></label>`).join("")}</div>
      <div class="boutons"><button class="secondaire" id="ps-modele">Préparer l'emplacement du modèle Word</button></div>
    </details></section>`;
    dessinerEtat();
    $("ps-publier").addEventListener("click", publier);
    if ($("ps-importer")) $("ps-importer").addEventListener("click", importer);
    $("ps-annuler").addEventListener("click", () => { brouillon = copie(ps.publie); modifie(true); });
    $("ps-modele").addEventListener("click", preparerModele);
    window.scrollTo(0, y);
  }

  /* ======================= Aperçu en direct ======================= */
  function planifierApercu() { clearTimeout(minuterieApercu); minuterieApercu = setTimeout(calculerApercu, 350); }
  async function calculerApercu() {
    const zone = $("ps-apercu-page"), info = $("ps-apercu-info");
    if (!zone) return;
    if (!donnees) { zone.innerHTML = `<p class="vide">Signalements illisibles : vérifiez la table des signalements (réglages avancés).</p>`; return; }
    const o = { ...defauts, ...Object.fromEntries(Object.entries(brouillon.options).filter(([, v]) => v !== "" && v != null)) };
    const jour = new Date(); jour.setHours(0, 0, 0, 0);
    const depuis = apercuReglages.periode === "jour" ? jour : apercuReglages.periode === "7j" ? new Date(jour.getTime() - 6 * 864e5) : null;
    const cfg = { reglages: { ...o, depuis, dernierPoint: jour, academie: apercuReglages.academie },
      colonnes: brouillon.colonnes.map((c, i) => ({ ...c, Ordre: i + 1 })), sections: brouillon.sections.map((s, i) => ({ ...s, Ordre: i + 1 })),
      tri: brouillon.tri.map((t, i) => ({ ...t, Ordre: i + 1 })) };
    try {
      const point = await assemblerPoint(donnees.source, cfg);
      // nombre de signalements par tableau, dans l'ordre de l'éditeur (tableaux inactifs : pas de nombre)
      const parTitre = new Map(point.sections.map(s => [s, s.rows.length]));
      const actives = brouillon.sections.map((s, i) => ({ s, i })).filter(x => x.s.Actif !== false);
      dernierPoint = { horsSection: point.horsSection, parSection: {} };
      actives.forEach((x, k) => { const sec = point.sections[k]; dernierPoint.parSection[x.i] = sec ? parTitre.get(sec) : 0; });
      document.querySelectorAll("#ps-editeur .ps-bloc-tete .pastille").forEach(e => e.remove());
      brouillon.sections.forEach((s, i) => {
        const tete = document.querySelector(`#ps-editeur input.ps-titre[data-liste="sections"][data-i="${i}"]`);
        if (tete && dernierPoint.parSection[i] != null) tete.insertAdjacentHTML("afterend", compte(i));
      });
      const n = new Date(), aca = apercuReglages.academie;
      zone.innerHTML = `<article class="page"><div class="entete"><div class="logo">MINISTÈRE<br>DE L'ÉDUCATION<br>NATIONALE</div>
        <div class="bandeau">${esc(o.bandeau || "Mouvements sociaux")}<br>${esc(o.perimetre_court || "EN")}</div>
        <div>Point de situation n°…<br>${esc(n.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }))}</div></div>
        <h1>ESSENTIEL ${esc((o.perimetre_long || "ENSEIGNEMENT SUPÉRIEUR") + (aca ? " – ACADÉMIE DE " + aca.toUpperCase() : ""))}</h1>${sectionsHTML(point)}</article>`;
      const msgs = [`${point.nb} signalement(s) dans l'aperçu.`];
      if (point.horsSection) msgs.push(`⚠ ${point.horsSection} n'entrent dans aucun tableau.`);
      if (point.manquants.length) msgs.push(`⚠ Champs introuvables : ${point.manquants.join(", ")}.`);
      info.textContent = msgs.join(" "); info.className = `ps-note ${point.horsSection || point.manquants.length ? "err" : ""}`;
      // académies proposées au filtre de l'aperçu
      const sel = $("ps-ap-academie");
      if (sel && sel.options.length <= 1) {
        const acas = valeursDe(o.champAcademie).sort((a, b) => a.localeCompare(b, "fr"));
        sel.innerHTML = `<option value="">Toutes les académies</option>` + acas.map(a => `<option>${esc(a)}</option>`).join("");
      }
    } catch (e) { zone.innerHTML = `<p class="statut err">Aperçu impossible : ${esc(e.message || e)}</p>`; }
  }

  /* ======================= Événements ======================= */
  function liaison() {
    const ed = $("ps-editeur");
    ed.addEventListener("input", ev => {
      const t = ev.target, i = +t.dataset.i;
      if (t.dataset.opt) { const v = t.value.trim(); if (v) brouillon.options[t.dataset.opt] = v; else delete brouillon.options[t.dataset.opt]; modifie(false); return; }
      if (t.dataset.cc) {   // clause de condition
        if (t.tagName === "SELECT") return;
        const cl = versClauses(brouillon.sections[i].Condition) || []; cl[+t.dataset.clause][t.dataset.cc] = t.value;
        brouillon.sections[i].Condition = versTexte(cl); modifie(false); return;
      }
      if (t.dataset.lc) {   // ligne de contenu
        if (t.tagName === "SELECT") return;
        const l = versLignes(brouillon.colonnes[i].Contenu); l[+t.dataset.ligne][t.dataset.lc] = t.value;
        brouillon.colonnes[i].Contenu = versContenu(l); modifie(false); return;
      }
      if (!t.dataset.liste || !t.dataset.cle || t.tagName === "SELECT" || t.type === "checkbox") return;
      const r = brouillon[t.dataset.liste][i], k = t.dataset.cle;
      r[k] = t.type === "number" ? (t.value === "" ? null : Number(t.value)) : t.type === "color" ? t.value.replace("#", "").toUpperCase() : t.value;
      modifie(false);
    });
    ed.addEventListener("change", ev => {
      const t = ev.target, i = +t.dataset.i;
      if (t.dataset.cc && t.tagName === "SELECT") {
        const cl = versClauses(brouillon.sections[i].Condition) || [], c = cl[+t.dataset.clause];
        c[t.dataset.cc] = t.value;
        if (t.dataset.cc === "chemin") { c.val = ""; if (!SANS_VALEUR.has(c.op) && !c.op) c.op = "="; }
        brouillon.sections[i].Condition = versTexte(cl); modifie(true); return;
      }
      if (t.dataset.lc && t.tagName === "SELECT") {
        const l = versLignes(brouillon.colonnes[i].Contenu); l[+t.dataset.ligne][t.dataset.lc] = t.value;
        brouillon.colonnes[i].Contenu = versContenu(l); modifie(true); return;
      }
      if (t.dataset.actSelect === "ligne-ajouter" && t.value) {
        const l = versLignes(brouillon.colonnes[i].Contenu).filter(x => !(x.type === "texte" && !x.texte));
        l.push({ type: "champ", chemin: t.value, style: "", filtre: "" });
        brouillon.colonnes[i].Contenu = versContenu(l); modifie(true); return;
      }
      if (t.dataset.liste && t.dataset.cle && (t.tagName === "SELECT" || t.type === "checkbox")) {
        const r = brouillon[t.dataset.liste][i]; r[t.dataset.cle] = t.type === "checkbox" ? t.checked : t.value;
        modifie(true); return;
      }
      if (t.dataset.liste === "sections" && t.dataset.cle === "Titre") {   // un titre de tableau renommé : suivi dans les colonnes
        modifie(true);
      }
    });
    ed.addEventListener("click", ev => {
      const b = ev.target.closest("[data-act]");
      if (!b || b.tagName === "SELECT") return;
      const act = b.dataset.act, liste = b.dataset.liste, i = +b.dataset.i, k = +b.dataset.k;
      const lignes = () => versLignes(brouillon.colonnes[i].Contenu), poser = l => { brouillon.colonnes[i].Contenu = versContenu(l); };
      const clauses = () => versClauses(brouillon.sections[i].Condition) || [];
      switch (act) {
        case "ajouter": brouillon[liste].push(liste === "sections" ? { Titre: "Nouveau tableau", Condition: "", Actif: true }
          : liste === "colonnes" ? { Titre: "Nouvelle colonne", Contenu: "", Largeur: 10, Couleur: "B2C6BD", Fusionner: false, Tableaux: "", Actif: true }
          : { Champ: "", Sens: "A→Z", Valeurs: "", Actif: true }); break;
        case "retirer": if (!confirm("Retirer cet élément ?")) return; brouillon[liste].splice(i, 1); modeLibre.clear(); break;
        case "haut": case "bas": { const j = act === "haut" ? i - 1 : i + 1, l = brouillon[liste]; [l[i], l[j]] = [l[j], l[i]]; modeLibre.clear(); break; }
        case "libre": { const c = b.dataset.cleLibre; modeLibre.has(c) ? modeLibre.delete(c) : modeLibre.add(c); dessinerEditeur(); return; }
        case "clause-ajouter": {   // nouvelle condition, sur la qualification par défaut : il reste à choisir la valeur
          const cl = clauses(), q = champs.find(c => /qualif/i.test(c.chemin)) || champs[0];
          if (!q) return;
          cl.push({ lien: "et", chemin: q.chemin, op: "=", val: "" }); brouillon.sections[i].Condition = versTexte(cl); break; }
        case "clause-retirer": { const cl = clauses(); cl.splice(k, 1); brouillon.sections[i].Condition = versTexte(cl); break; }
        case "ligne-haut": case "ligne-bas": { const l = lignes(), j = act === "ligne-haut" ? k - 1 : k + 1; [l[k], l[j]] = [l[j], l[k]]; poser(l); break; }
        case "ligne-retirer": { const l = lignes(); l.splice(k, 1); poser(l); break; }
        case "ligne-nouveau": { const l = lignes().filter(x => !(x.type === "texte" && !x.texte)); l.push({ type: "nouveau" }); poser(l); break; }
        case "ligne-texte": { const l = lignes(); l.push({ type: "texte", texte: "" }); poser(l); break; }
        case "tableau": { const r = brouillon.colonnes[i], t = b.dataset.titre, tabs = listeTableaux(r);
          r.Tableaux = (tabs.includes(t) ? tabs.filter(x => x !== t) : [...tabs, t]).join(", "); break; }
        case "val-ajouter": case "val-retirer": case "val-haut": {
          const r = brouillon.tri[i], v = String(r.Valeurs || "").split(/\n|;/).map(x => x.trim()).filter(Boolean);
          if (act === "val-ajouter") v.push(b.dataset.val); else if (act === "val-retirer") v.splice(k, 1); else [v[k - 1], v[k]] = [v[k], v[k - 1]];
          r.Valeurs = v.join("\n"); break; }
        default: return;
      }
      modifie(true);
    });
  }

  async function afficher() {
    if (!demarre) {
      demarre = true;
      $("point-situation").innerHTML = `<div class="ps-mise">
        <div id="ps-editeur"><p class="vide">Lecture…</p></div>
        <aside class="ps-apercu" aria-label="Aperçu du point de situation">
          <div class="ps-apercu-barre"><b>Aperçu en direct</b>
            <select id="ps-ap-periode" aria-label="Période"><option value="tout">Tous les signalements</option><option value="jour">Depuis aujourd'hui</option><option value="7j">7 derniers jours</option></select>
            <select id="ps-ap-academie" aria-label="Académie"><option value="">Toutes les académies</option></select>
            <button class="secondaire" id="ps-ap-actualiser" title="Relire les signalements du document">↻</button></div>
          <p id="ps-apercu-info" class="ps-note"></p>
          <div id="ps-apercu-page"></div>
        </aside></div>
        <p class="statut" id="ps-statut" role="status"></p>`;
      liaison();
      $("ps-ap-periode").addEventListener("change", e => { apercuReglages.periode = e.target.value; calculerApercu(); });
      $("ps-ap-academie").addEventListener("change", e => { apercuReglages.academie = e.target.value; calculerApercu(); });
      $("ps-ap-actualiser").addEventListener("click", async () => { await chargerDonnees(); dessinerEditeur(); calculerApercu(); });
    }
    try { if (await charger()) { dessinerEditeur(); calculerApercu(); } }
    catch (e) { $("ps-editeur").innerHTML = `<p class="statut err">Lecture impossible : ${esc(e.message || e)}</p>`; }
  }
  window.OngletPointSituation = { afficher };
})();
