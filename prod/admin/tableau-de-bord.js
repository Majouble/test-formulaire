/* =====================================================================
   Administration v2 — onglet « Tableau de bord »
   Le tableau de bord s'y modifie en direct sur les signalements du document (module tableau-de-bord/tableau.js,
   en mode édition). Clé « tableau_de_bord » de Config : { tableaux: [{ id, nom, table, brouillon, publie, publie_le }] }
   (plusieurs tableaux de bord, ex. MEN et MESRE, chacun sur sa table). Le widget n'affiche que la version publiée
   du tableau nommé dans les options de sa page (option « tableau »), sinon du premier.
   ===================================================================== */
(function () {
  "use strict";
  const S = window.Socle;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let td = {}, module = null, table = null, recharger = null, minuterie = null, pages = [], pagesCarte = [];
  const URL_TDB = /\/tableau-de-bord\/?(index\.html)?(\?.*)?$/i;
  const URL_CARTE = /\/cartographie\/?(index\.html)?(\?.*)?$/i;
  const MODULES = {
    tdb: { dossier: "tableau-de-bord", nom: "Tableau de bord", re: URL_TDB },
    carte: { dossier: "cartographie", nom: "Cartographie", re: URL_CARTE },
  };

  /* ---------- Page dédiée : vue Grist affichant le widget du tableau de bord ---------- */
  const optionsVue = brut => { let o = {}, cv = {}; try { o = JSON.parse(brut || "{}") || {}; } catch (_) {} try { cv = typeof o.customView === "string" ? JSON.parse(o.customView || "{}") || {} : (o.customView || {}); } catch (_) {} return { o, cv }; };
  async function lirePages() {
    const [sec, vues] = await Promise.all([grist.docApi.fetchTable("_grist_Views_section"), grist.docApi.fetchTable("_grist_Views")]);
    const lire = re => sec.id.map((id, i) => {
      if (sec.parentKey[i] !== "custom") return null;
      const { cv } = optionsVue(sec.options[i]);
      if (!re.test(cv.url || "")) return null;
      const v = vues.id.indexOf(sec.parentId[i]);
      return { section: id, vue: sec.parentId[i], nom: v >= 0 ? vues.name[v] : "", tableau: (cv.widgetOptions || {}).tableau || null };
    }).filter(Boolean);
    pages = lire(URL_TDB); pagesCarte = lire(URL_CARTE);
  }
  function dessinerPages() {
    const z = $("tdb-pages"), mes = pagesDe(pages, td);
    z.innerHTML = (mes.length
      ? `<div class="tdb-menu-info">Page${mes.length > 1 ? "s" : ""} de ce tableau : ${mes.map(p => `« ${esc(p.nom)} »`).join(", ")}</div>
         <button role="menuitem" id="tdb-page-autre">Créer une autre page pour ce tableau</button>`
      : `<div class="tdb-menu-info">Aucune page n'affiche encore ce tableau.</div><button role="menuitem" id="tdb-page-creer">Créer la page dédiée</button>`)
      + (pagesCarte.length ? `<div class="tdb-menu-info">Cartographie : ${pagesCarte.map(p => `« ${esc(p.nom)} »`).join(", ")}</div><button role="menuitem" id="carte-page-autre">Créer une autre page Cartographie</button>`
        : `<button role="menuitem" id="carte-page-creer" title="Page Grist avec le widget de cartographie (carte et export GeoJSON, KML, GPX, CSV, Shapefile)">Créer la page Cartographie</button>`);
    const go = () => { fermerMenu(); creerPage("tdb"); }, goC = () => { fermerMenu(); creerPage("carte"); };
    if ($("tdb-page-creer")) $("tdb-page-creer").addEventListener("click", go);
    if ($("tdb-page-autre")) $("tdb-page-autre").addEventListener("click", go);
    if ($("carte-page-creer")) $("carte-page-creer").addEventListener("click", goC);
    if ($("carte-page-autre")) $("carte-page-autre").addEventListener("click", goC);
  }
  // Nom libre : « Tableau de bord », puis « Tableau de bord (2) »… (renommable ensuite dans Grist)
  async function creerPage(type = "tdb") {
    const m = MODULES[type], existantes = type === "tdb" ? pagesDe(pages, td) : pagesCarte;
    const base = type === "tdb" ? td.nom || m.nom : m.nom;
    const nom = existantes.length ? `${base} (${existantes.length + 1})` : base;
    try {
      const T = await grist.docApi.fetchTable("_grist_Tables"), ref = T.id[T.tableId.indexOf(table)];
      if (ref == null) throw new Error(`table ${table} introuvable`);
      const res = await grist.docApi.applyUserActions([["CreateViewSection", ref, 0, "custom", null, null]]);
      const rv = (res && res.retValues && res.retValues[0]) || {};
      if (!rv.sectionRef) throw new Error("Grist n'a pas indiqué la vue créée");
      const sec = await grist.docApi.fetchTable("_grist_Views_section"), i = sec.id.indexOf(rv.sectionRef);
      const { o, cv } = optionsVue(i >= 0 ? sec.options[i] : "");
      let url; try { url = new URL(`../${m.dossier}/`, location.href).href; } catch (_) { url = `https://majouble.github.io/test-formulaire/prod/${m.dossier}/`; }
      if (!/^https?:/.test(url)) url = `https://majouble.github.io/test-formulaire/prod/${m.dossier}/`;
      o.customView = JSON.stringify({ ...cv, mode: "url", url, access: "full", widgetOptions: type === "tdb" ? { tableau: td.id } : {} });
      const acts = [["UpdateRecord", "_grist_Views_section", rv.sectionRef, { options: JSON.stringify(o), title: "" }]];
      if (rv.viewRef) acts.push(["UpdateRecord", "_grist_Views", rv.viewRef, { name: nom }]);
      await grist.docApi.applyUserActions(acts);
      await lirePages(); dessinerPages();
      statut(`Page « ${nom} » créée : elle apparaît dans la liste des pages de Grist, à gauche (renommable dans Grist).${type === "tdb" && !td.publie ? " Publiez le tableau de bord pour qu'elle l'affiche." : ""}`, "ok");
    } catch (e) { statut(`Création de la page refusée par Grist : ${e.message || e}`, "err"); }
  }

  const statut = (t, type) => { const e = $("tdb-statut"); if (!e) return; e.textContent = t || ""; e.className = `statut ${type || ""}`; };
  const egalPublie = () => !!td.publie && !!td.brouillon && JSON.stringify(td.publie) === JSON.stringify(td.brouillon);
  function dessinerEtat() {
    const e = $("tdb-etat"), pub = td.publie_le ? new Date(td.publie_le * 1000).toLocaleString("fr-FR") : null;
    e.className = `pastille ${!td.publie ? "manque" : egalPublie() || !td.brouillon ? "ok" : "reco"}`;
    e.textContent = !td.publie ? "Jamais publié" : egalPublie() || !td.brouillon ? `Publié le ${pub}` : `Brouillon modifié (publié le ${pub})`;
    $("tdb-annuler").hidden = !(td.publie && td.brouillon && !egalPublie());
  }
  // Plusieurs tableaux de bord : liste dans la clé « tableau_de_bord » de Config ; td = tableau affiché
  let tableaux = [], general = null;
  async function ecrire() {
    const i = tableaux.findIndex(t => t.id === td.id);
    if (i >= 0) tableaux[i] = td; else tableaux.push(td);
    await S.ecrireConfig("tableau_de_bord", S.valeurTableauxDeBord(tableaux));
  }
  // enregistrement du brouillon, propre au tableau monté (un tableau démonté n'écrit plus rien dans un autre)
  function enregistreurPour(id) {
    return function enregistrer(config) {
      if (td.id !== id) return Promise.resolve();
      td = { ...td, brouillon: JSON.parse(JSON.stringify(config)), modifie_le: Date.now() / 1000 };
      dessinerEtat(); statut("Modifications non enregistrées…");
      clearTimeout(minuterie);
      return new Promise(res => { minuterie = setTimeout(async () => {
        if (td.id !== id) return res();
        try { await ecrire(); statut("Brouillon enregistré.", "ok"); } catch (e) { statut(`Brouillon non enregistré : ${e.message || e}`, "err"); }
        res();
      }, 500); });
    };
  }
  const pagesDe = (liste, t) => liste.filter(p => p.tableau === t.id || (!p.tableau && tableaux[0] && tableaux[0].id === t.id));
  async function publier() {
    clearTimeout(minuterie);
    const c = module ? module.configuration() : td.brouillon;
    if (!c || !c.blocks || !c.blocks.length) { statut("Le tableau de bord est vide : ajoutez au moins un bloc.", "err"); return; }
    td = { ...td, brouillon: JSON.parse(JSON.stringify(c)), publie: JSON.parse(JSON.stringify(c)), publie_le: Date.now() / 1000 };
    try {
      await ecrire(); dessinerEtat();
      statut(pagesDe(pages, td).length ? "Tableau de bord publié : ses pages l'affichent dans la minute." : "Tableau de bord publié. Créez maintenant sa page dédiée (bouton « Créer la page dédiée »).", "ok");
    }
    catch (e) { statut(`Publication impossible : ${e.message || e}`, "err"); }
  }
  // lignes de la table du tableau de bord, au format attendu par le module (une ligne = un objet)
  async function lignes() {
    const t = await grist.docApi.fetchTable(table), cols = Object.keys(t).filter(k => k !== "id");
    return t.id.map((id, i) => { const r = { id }; cols.forEach(c => { r[c] = t[c][i]; }); return r; });
  }
  // tables proposées : réponses du socle et tables des formulaires publiés
  async function tablesPossibles() {
    const meta = await S.lireMeta(), out = new Set([general.reponses]);
    try { const t = await grist.docApi.fetchTable(general.formulaires); (t.Table || []).forEach(x => { if (x && meta[x]) out.add(x); }); } catch (_) { /* pas de formulaires */ }
    return [...out].filter(x => meta[x]);
  }
  const nouvelId = () => `t${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

  async function afficher() {
    const zone = $("onglet-tdb");
    if (module) { try { if (recharger) await recharger(); } catch (_) {} return; }
    const config = await S.lireConfig();
    if (!config) { zone.innerHTML = `<p class="statut err" style="margin:16px">La table Config n'existe pas : terminez d'abord l'installation.</p>`; return; }
    general = S.general(config);
    tableaux = S.tableauxDeBord(config.valeurs.tableau_de_bord, general);
    if (!tableaux.length) tableaux = [{ id: "principal", nom: "Tableau de bord", table: general.reponses, brouillon: null, publie: null }];
    zone.innerHTML = `<div class="tdb-barre-admin">
        <select id="tdb-choix" title="Tableau de bord à modifier"></select>
        <button class="primaire" id="tdb-ajouter">+ Ajouter un bloc</button>
        <button class="secondaire" id="tdb-reglages" title="Nom, présentation dans Word, filtres rapides et filtres communs">⚙ Réglages du tableau</button>
        <span style="flex:1"></span>
        <span class="statut" id="tdb-statut" role="status"></span>
        <span id="tdb-etat"></span>
        <button class="primaire" id="tdb-publier">Publier</button>
        <span class="tdb-menu-ancre"><button class="secondaire" id="tdb-menu-btn" aria-haspopup="true" aria-expanded="false" title="Autres actions">⋯</button>
          <div class="tdb-menu" id="tdb-menu" hidden role="menu">
            <div class="tdb-menu-groupe">Tableaux de bord</div>
            <button role="menuitem" id="tdb-nouveau">Nouveau tableau de bord…</button>
            <button role="menuitem" id="tdb-gerer">Renommer, changer de table, supprimer…</button>
            <div class="tdb-menu-groupe">Pages de Grist</div>
            <div id="tdb-pages" class="tdb-pages"></div>
            <div class="tdb-menu-groupe">Données et versions</div>
            <button role="menuitem" id="tdb-recharger">Relire les signalements</button>
            <button role="menuitem" id="tdb-annuler" hidden>Revenir à la version publiée</button>
            <div class="tdb-menu-groupe">Configuration</div>
            <button role="menuitem" data-module="sauvegarder">Sauvegarder (fichier .json)</button>
            <button role="menuitem" data-module="restaurer">Restaurer un fichier…</button>
            <button role="menuitem" data-module="recuperer">Récupérer d'un autre widget (v1)…</button>
          </div></span></div>
      <div id="tdb-panneau" class="tdb-panneau" hidden></div>
      <p class="tdb-aide" id="tdb-aide"></p>
      <p class="tdb-aide" id="tdb-etab" hidden></p>
      <div id="tdb-zone"></div>`;
    proposerColonnesEtab(config);
    try { await lirePages(); } catch (_) { pages = []; }
    $("tdb-publier").addEventListener("click", publier);
    $("tdb-annuler").addEventListener("click", async () => {
      fermerMenu();
      if (!confirm("Abandonner les modifications non publiées ?")) return;
      td = { ...td, brouillon: JSON.parse(JSON.stringify(td.publie)) }; await ecrire(); module.remplacer(td.publie); dessinerEtat();
    });
    $("tdb-recharger").addEventListener("click", () => { fermerMenu(); if (recharger) recharger(); });
    $("tdb-choix").addEventListener("change", e => monterTableau(e.target.value));
    $("tdb-ajouter").addEventListener("click", () => module && module.action && module.action("ajouter"));
    $("tdb-reglages").addEventListener("click", () => module && module.action && module.action("reglages"));
    $("tdb-menu-btn").addEventListener("click", e => { e.stopPropagation(); const m = $("tdb-menu"); m.hidden = !m.hidden; $("tdb-menu-btn").setAttribute("aria-expanded", String(!m.hidden)); });
    $("tdb-menu").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; if (b.dataset.module && module) module.action(b.dataset.module); if (b.dataset.module || b.id === "tdb-nouveau" || b.id === "tdb-gerer") fermerMenu(); });
    document.addEventListener("click", e => { if (!e.target.closest(".tdb-menu-ancre")) fermerMenu(); });
    $("tdb-nouveau").addEventListener("click", () => panneau("nouveau"));
    $("tdb-gerer").addEventListener("click", () => panneau("gerer"));
    monterTableau(tableaux[0].id);
  }
  function fermerMenu() { const m = $("tdb-menu"); if (m && !m.hidden) { m.hidden = true; $("tdb-menu-btn").setAttribute("aria-expanded", "false"); } }
  function dessinerChoix() {
    $("tdb-choix").innerHTML = tableaux.map(t => `<option value="${esc(t.id)}"${t.id === td.id ? " selected" : ""}>${esc(t.nom)}${tableaux.length > 1 ? ` — ${esc(t.table)}` : ""}</option>`).join("");
  }
  // (re)monte le module sur le tableau choisi, dans un conteneur neuf (les écouteurs de l'ancien partent avec lui)
  function monterTableau(id) {
    clearTimeout(minuterie);
    td = tableaux.find(t => t.id === id) || tableaux[0];
    table = td.table || general.reponses;
    dessinerChoix(); dessinerEtat(); dessinerPages(); statut("");
    $("tdb-aide").innerHTML = `Cliquez sur un bloc pour le régler dans le panneau de droite. Signalements de la table <b>${esc(table)}</b> ; le brouillon s'enregistre au fil de l'eau, les pages n'affichent que la version publiée.`;
    const zone = $("tdb-zone"); zone.innerHTML = `<div id="tableau-de-bord"></div>`;
    recharger = null;
    module = window.TableauDeBord.monter($("tableau-de-bord"), {
      mode: "edition", table, atelier: true,
      abonner: async cb => { recharger = async () => cb(await lignes()); await recharger(); },
      configuration: () => td.brouillon || td.publie || null,
      enregistrer: enregistreurPour(td.id),
    });
  }
  // Panneau : nouveau tableau de bord, ou renommer / changer de table / supprimer
  async function panneau(mode) {
    const z = $("tdb-panneau"), tables = await tablesPossibles();
    const optTables = cur => tables.map(t => `<option value="${esc(t)}"${t === cur ? " selected" : ""}>${esc(t)}</option>`).join("");
    z.hidden = false;
    if (mode === "nouveau") {
      z.innerHTML = `<strong>Nouveau tableau de bord</strong>
        <label>Nom <input type="text" id="tdb-p-nom" placeholder="Tableau de bord MESRE"></label>
        <label>Table des signalements <select id="tdb-p-table">${optTables(table)}</select></label>
        <label><input type="checkbox" id="tdb-p-copie"> Reprendre les blocs de « ${esc(td.nom)} »</label>
        <button class="primaire" id="tdb-p-ok">Créer</button><button class="secondaire" id="tdb-p-annuler">Annuler</button>
        <span class="statut" id="tdb-p-statut"></span>`;
      $("tdb-p-nom").focus();
      $("tdb-p-ok").addEventListener("click", async () => {
        const nom = $("tdb-p-nom").value.trim();
        if (!nom) { $("tdb-p-statut").textContent = "Donnez un nom."; return; }
        if (tableaux.some(t => S.norm(t.nom) === S.norm(nom))) { $("tdb-p-statut").textContent = "Ce nom est déjà pris."; return; }
        const copie = $("tdb-p-copie").checked && module ? JSON.parse(JSON.stringify(module.configuration())) : null;
        if (copie) copie.name = nom;
        const t = { id: nouvelId(), nom, table: $("tdb-p-table").value, brouillon: copie, publie: null, publie_le: null, modifie_le: Date.now() / 1000 };
        tableaux.push(t); td = t;
        try { await ecrire(); } catch (e) { $("tdb-p-statut").textContent = `Enregistrement refusé : ${e.message || e}`; tableaux.pop(); return; }
        z.hidden = true; monterTableau(t.id);
        statut(`Tableau de bord « ${nom} » créé : composez-le, publiez-le, puis créez sa page dédiée.`, "ok");
      });
    } else {
      const pg = pagesDe(pages, td);
      z.innerHTML = `<strong>« ${esc(td.nom)} »</strong>
        <label>Nom <input type="text" id="tdb-p-nom" value="${esc(td.nom)}"></label>
        <label>Table des signalements <select id="tdb-p-table">${optTables(table)}</select></label>
        <button class="primaire" id="tdb-p-ok">Enregistrer</button><button class="secondaire" id="tdb-p-annuler">Fermer</button>
        ${tableaux.length > 1 ? `<button class="secondaire danger" id="tdb-p-suppr">Supprimer ce tableau de bord…</button>` : ""}
        <span class="statut" id="tdb-p-statut"></span>
        ${pg.length ? `<p class="aide">Pages qui l'affichent : ${pg.map(p => `« ${esc(p.nom)} »`).join(", ")}${tableaux[0].id === td.id ? " (et les pages sans réglage)" : ""}. Un changement de table s'applique aussi à ces pages : reliez-les à la nouvelle table dans Grist (panneau de droite, « Données source »).</p>` : ""}`;
      $("tdb-p-ok").addEventListener("click", async () => {
        const nom = $("tdb-p-nom").value.trim(), tbl = $("tdb-p-table").value;
        if (!nom) { $("tdb-p-statut").textContent = "Donnez un nom."; return; }
        if (tableaux.some(t => t.id !== td.id && S.norm(t.nom) === S.norm(nom))) { $("tdb-p-statut").textContent = "Ce nom est déjà pris."; return; }
        const autreTable = tbl !== td.table;
        td = { ...td, nom, table: tbl };
        try { await ecrire(); } catch (e) { $("tdb-p-statut").textContent = `Enregistrement refusé : ${e.message || e}`; return; }
        z.hidden = true;
        if (autreTable) monterTableau(td.id); else { dessinerChoix(); dessinerPages(); }
        statut("Réglages enregistrés.", "ok");
      });
      if ($("tdb-p-suppr")) $("tdb-p-suppr").addEventListener("click", () => {
        $("tdb-p-statut").innerHTML = `Supprimer « ${esc(td.nom)} » ? Ses pages dans Grist resteront (à supprimer dans Grist). <button class="secondaire danger" id="tdb-p-oui">Oui, supprimer</button>`;
        $("tdb-p-oui").addEventListener("click", async () => {
          const reste = tableaux.filter(t => t.id !== td.id);
          try { await S.ecrireConfig("tableau_de_bord", S.valeurTableauxDeBord(reste)); } catch (e) { $("tdb-p-statut").textContent = `Suppression refusée : ${e.message || e}`; return; }
          const nom = td.nom; tableaux = reste; z.hidden = true; monterTableau(tableaux[0].id);
          statut(`« ${nom} » supprimé.`, "ok");
        });
      });
    }
    $("tdb-p-annuler").addEventListener("click", () => { z.hidden = true; });
  }
  // Colonnes de l'établissement (UAI, nom, département, académie, coordonnées) absentes de la table des réponses : ajout en un clic
  async function proposerColonnesEtab(config) {
    const p = $("tdb-etab");
    try {
      const etape = S.planInstallation(await S.lireMeta(), config).etapes.find(e => e.id === "rep-etablissement");
      if (!etape) { p.hidden = true; return; }
      const cols = etape.actions.map(a => a[2]);
      p.innerHTML = `Pour des lignes par UAI, des cartes par département, académie ou établissement et des exports lisibles, la table <b>${esc(table)}</b> peut recopier les informations de l'établissement : ${cols.map(esc).join(", ")}.
        <button class="secondaire" id="tdb-etab-ajouter">Ajouter ces colonnes</button> <span class="statut" id="tdb-etab-statut"></span>`;
      p.hidden = false;
      $("tdb-etab-ajouter").addEventListener("click", async () => {
        const [r] = await S.appliquer([etape]);
        if (!r.ok) { $("tdb-etab-statut").textContent = `Ajout refusé par Grist (${r.erreur}).`; return; }
        p.hidden = true;
        if (recharger) await recharger();
      });
    } catch (_) { p.hidden = true; }
  }
  window.OngletTableauDeBord = { afficher };
})();
