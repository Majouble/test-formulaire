/* =====================================================================
   Administration v2 — onglet « Point de situation »
   Règle le contenu du point de situation : en-tête, tableaux (sections et conditions), colonnes, tris.
   Clé « point_situation » de Config : { brouillon, publie, publie_le, modifie_le }.
   Le brouillon s'enregistre au fil des modifications ; le widget du point de situation n'applique que la version publiée.
   ===================================================================== */
(function () {
  "use strict";
  const S = window.Socle;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const copie = o => JSON.parse(JSON.stringify(o));

  // Valeurs par défaut : celles du widget du point de situation
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
  const SENS = ["A→Z", "Z→A", "Liste", "Ordre des choix"];
  const OPTIONS_EN_TETE = [["bandeau", "Bandeau", "Mouvements sociaux"], ["perimetre_court", "Périmètre (bandeau)", "EN"], ["perimetre_long", "Périmètre (titre)", "ENSEIGNEMENT SUPÉRIEUR"]];
  const OPTIONS_AVANCEES = [["table", "Table des signalements"], ["dossier", "Colonne dossier (version initiale)"], ["date", "Date de saisie (dernière version, mention « nouveau »)"],
    ["dateFaits", "Date des faits (période « Signalements depuis »)"], ["nature", "Nature (nouveau signalement / mise à jour)"], ["champAcademie", "Champ de l'académie (liste « Académie »)"],
    ["modeleTable", "Table du modèle Word"], ["modeleColonne", "Colonne (pièce jointe) du modèle Word"]];

  let config = null, ps = null, brouillon = null, defauts = {}, champs = [], anciennes = null, cible = null, minuterie = null, demarre = false;

  function statut(t, type) { const e = $("ps-statut"); e.textContent = t || ""; e.className = `statut ${type || ""}`; }

  async function charger() {
    const meta = await S.lireMeta();
    config = await S.lireConfig(meta);
    if (!config) { $("ps-contenu").innerHTML = `<p class="statut err">La table Config n'existe pas : terminez d'abord l'installation.</p>`; return false; }
    defauts = await S.reglagesPointParDefaut(meta, config);
    ps = config.valeurs.point_situation || {};
    brouillon = copie(ps.brouillon || ps.publie || DEFAUT);
    for (const k of ["options", "sections", "colonnes", "tri"]) if (!brouillon[k]) brouillon[k] = copie(DEFAUT[k]);
    // champs utilisables dans les contenus, conditions et tris (colonnes des réponses, et à travers les références)
    const g = S.general(config), t = meta[defauts.table] || meta[g.reponses];
    champs = [];
    if (t) for (const c of Object.values(t.colonnes)) {
      champs.push(c.colId);
      const cibleRef = S.cibleRef(c.type);
      if (cibleRef && meta[cibleRef] && cibleRef !== t.tableId) for (const c2 of Object.values(meta[cibleRef].colonnes)) champs.push(`${c.colId}.${c2.colId}`);
    }
    // anciennes tables de configuration (documents v1) : proposées à l'import
    anciennes = ["Colonnes_point", "Sections_point", "Tri_point"].filter(n => meta[n]);
    return true;
  }

  /* ---------- Enregistrement ---------- */
  function sauverPlusTard() {
    clearTimeout(minuterie); statut("Modifications non enregistrées…");
    minuterie = setTimeout(sauverBrouillon, 700);
    dessinerEtat();
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
    const titres = brouillon.sections.filter(x => x.Actif !== false).map(x => x.Titre);
    if (!titres.length) { statut("Ajoutez au moins un tableau actif avant de publier.", "err"); return; }
    if (!brouillon.sections.some(x => x.Actif !== false && !String(x.Condition || "").trim())
        && !confirm("Aucun tableau sans condition : les signalements qui ne remplissent aucune condition n'apparaîtront pas. Publier quand même ?")) return;
    try {
      ps = { ...ps, brouillon: copie(brouillon), publie: copie(brouillon), publie_le: Date.now() / 1000, modifie_le: Date.now() / 1000 };
      await S.ecrireConfig("point_situation", ps);
      statut("Configuration publiée : actualisez le point de situation pour l'appliquer.", "ok"); dessinerEtat();
    } catch (e) { statut(`Publication impossible : ${e.message || e}`, "err"); }
  }
  const egalPublie = () => !!ps.publie && JSON.stringify(ps.publie) === JSON.stringify(brouillon);

  /* ---------- Import des anciennes tables (documents v1) ---------- */
  async function importer() {
    if (!confirm("Remplacer le brouillon par la configuration des tables Colonnes_point, Sections_point et Tri_point (et des réglages de la table Parametres) ?")) return;
    const lire = async n => { try { const t = await grist.docApi.fetchTable(n); return t.id.map((id, i) => Object.fromEntries(Object.keys(t).filter(k => k !== "id" && k !== "manualSort").map(k => [k, t[k][i]]))); } catch (_) { return null; } };
    const tri = a => (a || []).slice().sort((x, y) => (x.Ordre ?? 1e9) - (y.Ordre ?? 1e9));
    const sans = (l, cles) => l.map(r => Object.fromEntries(cles.map(k => [k, r[k] ?? (k === "Actif" ? true : "")])));
    const [c, s, t] = await Promise.all(["Colonnes_point", "Sections_point", "Tri_point"].map(lire));
    if (c) brouillon.colonnes = sans(tri(c), ["Titre", "Contenu", "Largeur", "Couleur", "Fusionner", "Tableaux", "Actif"]);
    if (s) brouillon.sections = sans(tri(s), ["Titre", "Condition", "Actif"]);
    if (t) brouillon.tri = sans(tri(t), ["Champ", "Sens", "Valeurs", "Actif"]);
    try {
      const p = await grist.docApi.fetchTable("Parametres"), v = (p.Reglages_point_situation || []).find(x => x && String(x).trim());
      if (v) { const o = JSON.parse(v); brouillon.options = Object.fromEntries(Object.entries(o).filter(([k]) => k !== "tri")); }
    } catch (_) { /* pas de réglages */ }
    dessiner(); await sauverBrouillon();
    statut("Configuration importée dans le brouillon : vérifiez-la, puis publiez.", "ok");
  }

  /* ---------- Emplacement du modèle Word (colonne pièce jointe de Config) ---------- */
  async function preparerModele() {
    try {
      const meta = await S.lireMeta(), acts = [];
      if (!meta[S.TABLE_CONFIG].colonnes.Fichier) acts.push(["AddColumn", S.TABLE_CONFIG, "Fichier", { type: "Attachments", isFormula: false }]);
      const cfg = await S.lireConfig(meta);
      if (!cfg.ids.modele_point_situation) acts.push(["AddRecord", S.TABLE_CONFIG, null, { Cle: "modele_point_situation", Valeur: JSON.stringify({ role: "Modèle Word du point de situation (pièce jointe dans la colonne Fichier)" }) }]);
      if (acts.length) await grist.docApi.applyUserActions(acts);
      statut("Emplacement prêt : dans Grist, ouvrez « Données brutes › Config », ligne « modele_point_situation », et déposez le modèle .docx dans la cellule Fichier.", "ok");
    } catch (e) { statut(`Préparation impossible : ${e.message || e}`, "err"); }
  }

  /* ---------- Affichage ---------- */
  function dessinerEtat() {
    const e = $("ps-etat");
    if (!e) return;
    const pub = ps.publie_le ? new Date(ps.publie_le * 1000).toLocaleString("fr-FR") : null;
    e.className = `pastille ${!ps.publie ? "manque" : egalPublie() ? "ok" : "reco"}`;
    e.textContent = !ps.publie ? "Jamais publié" : egalPublie() ? `Publié le ${pub}` : `Brouillon modifié (publié le ${pub})`;
  }
  const fleches = (liste, i) => `<span class="ps-outils">
      <button type="button" class="ps-mini" data-act="haut" data-liste="${liste}" data-i="${i}" title="Monter" ${i === 0 ? "disabled" : ""}>↑</button>
      <button type="button" class="ps-mini" data-act="bas" data-liste="${liste}" data-i="${i}" title="Descendre" ${i === brouillon[liste].length - 1 ? "disabled" : ""}>↓</button>
      <button type="button" class="ps-mini danger" data-act="retirer" data-liste="${liste}" data-i="${i}" title="Retirer">×</button></span>`;
  const champTexte = (liste, i, cle, valeur, attrs = "") => `<input type="text" data-liste="${liste}" data-i="${i}" data-cle="${cle}" value="${esc(valeur)}" ${attrs}>`;
  const caseActif = (liste, i, r) => `<label class="ps-case"><input type="checkbox" data-liste="${liste}" data-i="${i}" data-cle="Actif" ${r.Actif !== false ? "checked" : ""}> actif</label>`;

  function dessiner() {
    const o = brouillon.options, titres = brouillon.sections.map(x => x.Titre).filter(Boolean);
    const largeur = brouillon.colonnes.filter(c => c.Actif !== false).reduce((s, c) => s + (Number(c.Largeur) || 0), 0);
    $("ps-contenu").innerHTML = `
    <section class="carte">
      <div class="ps-tete"><h2>Point de situation</h2><span id="ps-etat"></span><span style="flex:1"></span>
        ${anciennes.length ? `<button class="secondaire" id="ps-importer" title="Reprendre la configuration des tables ${anciennes.join(", ")}">Importer la configuration actuelle</button>` : ""}
        ${ps.publie && !egalPublie() ? `<button class="secondaire" id="ps-annuler">Revenir à la version publiée</button>` : ""}
        <button class="primaire" id="ps-publier">Publier</button></div>
      <p class="aide">Le brouillon s'enregistre au fil de vos modifications ; le widget du point de situation n'applique que la version publiée.</p>
    </section>

    <section class="carte"><h2>En-tête</h2>
      <div class="grille">${OPTIONS_EN_TETE.map(([k, l, ph]) => `<label class="champ"><span>${l}</span><input type="text" data-opt="${k}" value="${esc(o[k] || "")}" placeholder="${esc(ph)}"></label>`).join("")}</div>
    </section>

    <section class="carte"><h2>Tableaux</h2>
      <p class="aide">Chaque signalement va dans le premier tableau dont la condition est vraie ; une condition vide prend tout le reste. Exemples : <code>Violences = Oui</code>, <code>Interpellations &gt; 0</code>, <code>Qualification contient blocage et Etablissement.Academie = Lille</code>.</p>
      ${brouillon.sections.map((r, i) => `<div class="ps-ligne">
        <span class="ps-num">${i + 1}</span>
        <div class="ps-champs"><label class="ps-mini-lib">Titre ${champTexte("sections", i, "Titre", r.Titre)}</label>
          <label class="ps-mini-lib">Condition ${champTexte("sections", i, "Condition", r.Condition, 'placeholder="vide = tous les autres signalements" class="ps-cible"')}</label></div>
        ${caseActif("sections", i, r)}${fleches("sections", i)}</div>`).join("")}
      <button class="secondaire" data-act="ajouter" data-liste="sections">+ Ajouter un tableau</button>
    </section>

    <section class="carte"><h2>Colonnes</h2>
      <p class="aide">Contenu : texte libre avec des champs entre accolades, sur plusieurs lignes si besoin (cliquez sur un champ ci-dessous pour l'insérer). <code>{nouveau}</code> ajoute la mention « Nouveau signalement ». Filtres : <code>{Description|sans_entete}</code>, <code>|majuscules</code>, <code>|date</code>, <code>|heure</code>. <code>**gras**</code> et <code>==surligné==</code> sont reproduits dans Word. Largeur totale des colonnes actives : <b>${largeur}</b> (proportions).</p>
      ${brouillon.colonnes.map((r, i) => {
        const tabs = String(r.Tableaux || "").split(/\n|;/).map(x => x.trim()).filter(Boolean);
        return `<div class="ps-ligne ps-col">
        <span class="ps-num">${i + 1}</span>
        <div class="ps-champs">
          <div class="ps-rang"><label class="ps-mini-lib" style="flex:2">Titre ${champTexte("colonnes", i, "Titre", r.Titre)}</label>
            <label class="ps-mini-lib" style="width:90px">Largeur <input type="number" min="1" data-liste="colonnes" data-i="${i}" data-cle="Largeur" value="${esc(r.Largeur ?? "")}"></label>
            <label class="ps-mini-lib" style="width:70px">En-tête <input type="color" data-liste="colonnes" data-i="${i}" data-cle="Couleur" value="#${esc(/^[0-9a-f]{6}$/i.test(r.Couleur || "") ? r.Couleur : "17877A")}"></label>
            <label class="ps-case"><input type="checkbox" data-liste="colonnes" data-i="${i}" data-cle="Fusionner" ${r.Fusionner ? "checked" : ""}> fusionner</label></div>
          <label class="ps-mini-lib">Contenu <textarea rows="2" class="ps-cible" data-liste="colonnes" data-i="${i}" data-cle="Contenu">${esc(r.Contenu || "")}</textarea></label>
          ${titres.length > 1 ? `<div class="ps-mini-lib">Tableaux (aucun = tous) <div class="puces-ps">${titres.map(t => `<button type="button" class="puce-ps${tabs.includes(t) ? " on" : ""}" data-act="tableau" data-i="${i}" data-titre="${esc(t)}">${esc(t)}</button>`).join("")}</div></div>` : ""}
        </div>${caseActif("colonnes", i, r)}${fleches("colonnes", i)}</div>`;
      }).join("")}
      <button class="secondaire" data-act="ajouter" data-liste="colonnes">+ Ajouter une colonne</button>
    </section>

    <section class="carte"><h2>Tri des signalements</h2>
      <p class="aide">Dans chaque tableau, du premier critère au dernier. « Liste » : les valeurs listées (une par ligne) passent d'abord dans l'ordre donné. « Ordre des choix » reprend l'ordre défini dans la colonne Grist.</p>
      ${brouillon.tri.map((r, i) => `<div class="ps-ligne">
        <span class="ps-num">${i + 1}</span>
        <div class="ps-champs"><div class="ps-rang">
          <label class="ps-mini-lib" style="flex:2">Champ ${champTexte("tri", i, "Champ", r.Champ, 'list="ps-liste-champs" class="ps-cible"')}</label>
          <label class="ps-mini-lib" style="flex:1">Sens <select data-liste="tri" data-i="${i}" data-cle="Sens">${SENS.map(x => `<option ${x === (r.Sens || "A→Z") ? "selected" : ""}>${x}</option>`).join("")}</select></label></div>
          ${r.Sens === "Liste" ? `<label class="ps-mini-lib">Valeurs, une par ligne <textarea rows="3" data-liste="tri" data-i="${i}" data-cle="Valeurs">${esc(r.Valeurs || "")}</textarea></label>` : ""}
        </div>${caseActif("tri", i, r)}${fleches("tri", i)}</div>`).join("")}
      <button class="secondaire" data-act="ajouter" data-liste="tri">+ Ajouter un critère de tri</button>
      <datalist id="ps-liste-champs">${champs.map(c => `<option value="${esc(c)}">`).join("")}</datalist>
    </section>

    <section class="carte"><h2>Champs disponibles</h2>
      <p class="aide">Cliquez pour insérer le champ dans la dernière zone de contenu, de condition ou de tri utilisée.</p>
      <div class="puces-ps">${["nouveau", ...champs].map(c => `<button type="button" class="puce-ps" data-act="inserer" data-champ="${esc(c)}">${esc(c)}</button>`).join("")}</div>
    </section>

    <section class="carte"><details><summary><b>Réglages avancés</b> (table, colonnes, modèle Word)</summary>
      <p class="aide">Laissez vide pour la valeur déduite du socle (indiquée en grisé).</p>
      <div class="grille">${OPTIONS_AVANCEES.map(([k, l]) => `<label class="champ"><span>${l}</span><input type="text" data-opt="${k}" value="${esc(o[k] || "")}" placeholder="${esc(defauts[k] || "")}"></label>`).join("")}</div>
      <div class="boutons"><button class="secondaire" id="ps-modele">Préparer l'emplacement du modèle Word</button></div>
    </details></section>`;
    dessinerEtat();
    $("ps-publier").addEventListener("click", publier);
    if ($("ps-importer")) $("ps-importer").addEventListener("click", importer);
    if ($("ps-annuler")) $("ps-annuler").addEventListener("click", async () => { brouillon = copie(ps.publie); dessiner(); await sauverBrouillon(); });
    $("ps-modele").addEventListener("click", preparerModele);
  }

  /* ---------- Événements (délégués sur l'onglet) ---------- */
  function liaison() {
    const zone = $("ps-contenu");
    zone.addEventListener("focusin", ev => { if (ev.target.classList && ev.target.classList.contains("ps-cible")) cible = ev.target; });
    zone.addEventListener("input", ev => {
      const t = ev.target;
      if (t.dataset.opt) { brouillon.options[t.dataset.opt] = t.value.trim(); if (!brouillon.options[t.dataset.opt]) delete brouillon.options[t.dataset.opt]; sauverPlusTard(); return; }
      if (!t.dataset.liste || !t.dataset.cle) return;
      const r = brouillon[t.dataset.liste][+t.dataset.i], k = t.dataset.cle;
      if (t.type === "checkbox") r[k] = t.checked;
      else if (t.type === "number") r[k] = t.value === "" ? null : Number(t.value);
      else if (t.type === "color") r[k] = t.value.replace("#", "").toUpperCase();
      else r[k] = t.value;
      sauverPlusTard();
      // le titre d'un tableau sert aux colonnes ; le sens « Liste » fait apparaître ses valeurs : on redessine à la sortie du champ
    });
    zone.addEventListener("change", ev => {
      const t = ev.target;
      if ((t.dataset.liste === "sections" && t.dataset.cle === "Titre") || (t.dataset.liste === "tri" && t.dataset.cle === "Sens") || t.type === "checkbox") dessinerEnGardantPosition();
    });
    zone.addEventListener("click", ev => {
      const b = ev.target.closest("[data-act]");
      if (!b) return;
      const act = b.dataset.act, liste = b.dataset.liste, i = +b.dataset.i;
      if (act === "ajouter") {
        brouillon[liste].push(liste === "sections" ? { Titre: "Nouveau tableau", Condition: "", Actif: true }
          : liste === "colonnes" ? { Titre: "Nouvelle colonne", Contenu: "", Largeur: 10, Couleur: "B2C6BD", Fusionner: false, Tableaux: "", Actif: true }
          : { Champ: "", Sens: "A→Z", Valeurs: "", Actif: true });
      } else if (act === "retirer") {
        if (!confirm("Retirer cet élément ?")) return;
        brouillon[liste].splice(i, 1);
      } else if (act === "haut" || act === "bas") {
        const j = act === "haut" ? i - 1 : i + 1, l = brouillon[liste];
        [l[i], l[j]] = [l[j], l[i]];
      } else if (act === "tableau") {
        const r = brouillon.colonnes[i], t = b.dataset.titre;
        const tabs = String(r.Tableaux || "").split(/\n|;/).map(x => x.trim()).filter(Boolean);
        r.Tableaux = (tabs.includes(t) ? tabs.filter(x => x !== t) : [...tabs, t]).join("\n");
      } else if (act === "inserer") {
        if (!cible || !document.body.contains(cible)) { statut("Cliquez d'abord dans une zone de contenu, de condition ou de tri.", "err"); return; }
        const champ = cible.tagName === "TEXTAREA" || cible.dataset.cle === "Contenu" ? `{${b.dataset.champ}}` : b.dataset.champ;
        if (cible.dataset.cle === "Champ") cible.value = champ;
        else { const p = cible.selectionStart ?? cible.value.length; cible.value = cible.value.slice(0, p) + champ + cible.value.slice(cible.selectionEnd ?? p); cible.selectionStart = cible.selectionEnd = p + champ.length; }
        cible.dispatchEvent(new Event("input", { bubbles: true })); cible.focus();
        return;
      } else return;
      dessinerEnGardantPosition(); sauverPlusTard();
    });
  }
  function dessinerEnGardantPosition() { const y = window.scrollY; dessiner(); window.scrollTo(0, y); }

  async function afficher() {
    if (!demarre) { demarre = true; liaison(); }
    try { if (await charger()) dessiner(); }
    catch (e) { $("ps-contenu").innerHTML = `<p class="statut err">Lecture impossible : ${esc(e.message || e)}</p>`; }
  }
  window.OngletPointSituation = { afficher };
})();
