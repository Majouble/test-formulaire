/* =====================================================================
   Administration v2 — onglet « Tableau de bord »
   Le tableau de bord s'y modifie en direct sur les signalements du document (module tableau-de-bord/tableau.js,
   en mode édition). Clé « tableau_de_bord » de Config : { brouillon, publie, publie_le, modifie_le }.
   Le widget du tableau de bord n'affiche que la version publiée.
   ===================================================================== */
(function () {
  "use strict";
  const S = window.Socle;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let td = {}, module = null, table = null, recharger = null, minuterie = null, pages = [];
  const URL_TDB = /\/tableau-de-bord\/?(index\.html)?(\?.*)?$/i;

  /* ---------- Page dédiée : vue Grist affichant le widget du tableau de bord ---------- */
  const optionsVue = brut => { let o = {}, cv = {}; try { o = JSON.parse(brut || "{}") || {}; } catch (_) {} try { cv = typeof o.customView === "string" ? JSON.parse(o.customView || "{}") || {} : (o.customView || {}); } catch (_) {} return { o, cv }; };
  async function lirePages() {
    const [sec, vues] = await Promise.all([grist.docApi.fetchTable("_grist_Views_section"), grist.docApi.fetchTable("_grist_Views")]);
    pages = sec.id.map((id, i) => {
      if (sec.parentKey[i] !== "custom") return null;
      const { cv } = optionsVue(sec.options[i]);
      if (!URL_TDB.test(cv.url || "")) return null;
      const v = vues.id.indexOf(sec.parentId[i]);
      return { section: id, vue: sec.parentId[i], nom: v >= 0 ? vues.name[v] : "" };
    }).filter(Boolean);
  }
  function dessinerPages() {
    const z = $("tdb-pages");
    z.innerHTML = pages.length
      ? `Page${pages.length > 1 ? "s" : ""} dédiée${pages.length > 1 ? "s" : ""} : ${pages.map(p => `« ${esc(p.nom)} »`).join(", ")}
         <button class="lien" id="tdb-page-autre">+ une autre page</button>`
      : `<button class="secondaire" id="tdb-page-creer">Créer la page dédiée</button>`;
    const go = () => creerPage();
    if ($("tdb-page-creer")) $("tdb-page-creer").addEventListener("click", go);
    if ($("tdb-page-autre")) $("tdb-page-autre").addEventListener("click", go);
  }
  async function creerPage() {
    const nom = (prompt("Nom de la page du tableau de bord :", pages.length ? "Tableau de bord (2)" : "Tableau de bord") || "").trim();
    if (!nom) return;
    try {
      const T = await grist.docApi.fetchTable("_grist_Tables"), ref = T.id[T.tableId.indexOf(table)];
      if (ref == null) throw new Error(`table ${table} introuvable`);
      const res = await grist.docApi.applyUserActions([["CreateViewSection", ref, 0, "custom", null, null]]);
      const rv = (res && res.retValues && res.retValues[0]) || {};
      if (!rv.sectionRef) throw new Error("Grist n'a pas indiqué la vue créée");
      const sec = await grist.docApi.fetchTable("_grist_Views_section"), i = sec.id.indexOf(rv.sectionRef);
      const { o, cv } = optionsVue(i >= 0 ? sec.options[i] : "");
      let url; try { url = new URL("../tableau-de-bord/", location.href).href; } catch (_) { url = "https://majouble.github.io/test-formulaire/v2/tableau-de-bord/"; }
      if (!/^https?:/.test(url)) url = "https://majouble.github.io/test-formulaire/v2/tableau-de-bord/";
      o.customView = JSON.stringify({ ...cv, mode: "url", url, access: "full", widgetOptions: {} });
      const acts = [["UpdateRecord", "_grist_Views_section", rv.sectionRef, { options: JSON.stringify(o), title: "" }]];
      if (rv.viewRef) acts.push(["UpdateRecord", "_grist_Views", rv.viewRef, { name: nom }]);
      await grist.docApi.applyUserActions(acts);
      await lirePages(); dessinerPages();
      statut(`Page « ${nom} » créée : elle apparaît dans la liste des pages de Grist, à gauche.${td.publie ? "" : " Publiez le tableau de bord pour qu'elle l'affiche."}`, "ok");
    } catch (e) { statut(`Création de la page refusée par Grist : ${e.message || e}`, "err"); }
  }

  const statut = (t, type) => { const e = $("tdb-statut"); e.textContent = t || ""; e.className = `statut ${type || ""}`; };
  const egalPublie = () => !!td.publie && !!td.brouillon && JSON.stringify(td.publie) === JSON.stringify(td.brouillon);
  function dessinerEtat() {
    const e = $("tdb-etat"), pub = td.publie_le ? new Date(td.publie_le * 1000).toLocaleString("fr-FR") : null;
    e.className = `pastille ${!td.publie ? "manque" : egalPublie() || !td.brouillon ? "ok" : "reco"}`;
    e.textContent = !td.publie ? "Jamais publié" : egalPublie() || !td.brouillon ? `Publié le ${pub}` : `Brouillon modifié (publié le ${pub})`;
    $("tdb-annuler").hidden = !(td.publie && td.brouillon && !egalPublie());
  }
  async function ecrire() { await S.ecrireConfig("tableau_de_bord", td); }
  function enregistrer(config) {   // appelé par le module à chaque modification
    td = { ...td, brouillon: JSON.parse(JSON.stringify(config)), modifie_le: Date.now() / 1000 };
    dessinerEtat(); statut("Modifications non enregistrées…");
    clearTimeout(minuterie);
    return new Promise(res => { minuterie = setTimeout(async () => {
      try { await ecrire(); statut("Brouillon enregistré.", "ok"); } catch (e) { statut(`Brouillon non enregistré : ${e.message || e}`, "err"); }
      res();
    }, 500); });
  }
  async function publier() {
    clearTimeout(minuterie);
    const c = module ? module.configuration() : td.brouillon;
    if (!c || !c.blocks || !c.blocks.length) { statut("Le tableau de bord est vide : ajoutez au moins un bloc.", "err"); return; }
    td = { ...td, brouillon: JSON.parse(JSON.stringify(c)), publie: JSON.parse(JSON.stringify(c)), publie_le: Date.now() / 1000 };
    try {
      await ecrire(); dessinerEtat();
      statut(pages.length ? "Tableau de bord publié : les pages dédiées l'affichent dans la minute." : "Tableau de bord publié. Créez maintenant sa page dédiée.", "ok");
      if (!pages.length && confirm("Tableau de bord publié. Créer maintenant sa page dédiée dans le document ?")) await creerPage();
    }
    catch (e) { statut(`Publication impossible : ${e.message || e}`, "err"); }
  }
  // lignes de la table des signalements, au format attendu par le module (une ligne = un objet)
  async function lignes() {
    const t = await grist.docApi.fetchTable(table), cols = Object.keys(t).filter(k => k !== "id");
    return t.id.map((id, i) => { const r = { id }; cols.forEach(c => { r[c] = t[c][i]; }); return r; });
  }

  async function afficher() {
    const zone = $("onglet-tdb");
    if (module) { try { if (recharger) await recharger(); } catch (_) {} return; }
    const config = await S.lireConfig();
    if (!config) { zone.innerHTML = `<p class="statut err" style="margin:16px">La table Config n'existe pas : terminez d'abord l'installation.</p>`; return; }
    td = config.valeurs.tableau_de_bord || {};
    table = S.general(config).reponses;
    zone.innerHTML = `<div class="tdb-barre-admin">
        <b>Tableau de bord</b><span id="tdb-etat"></span><span style="flex:1"></span>
        <span class="statut" id="tdb-statut" role="status"></span>
        <span id="tdb-pages" class="tdb-pages"></span>
        <button class="secondaire" id="tdb-recharger" title="Relire les signalements du document">↻ Données</button>
        <button class="secondaire" id="tdb-annuler" hidden>Revenir à la version publiée</button>
        <button class="primaire" id="tdb-publier">Publier</button></div>
      <p class="tdb-aide">Modifiez les blocs ci-dessous : le brouillon s'enregistre au fil de l'eau, sur les signalements de la table <b>${esc(table)}</b>. Le widget du tableau de bord n'affiche que la version publiée.
        Pour reprendre un tableau de bord existant (document v1), utilisez « Récupérer d'un autre widget… ».</p>
      <div id="tableau-de-bord"></div>`;
    dessinerEtat();
    try { await lirePages(); } catch (_) { pages = []; }
    dessinerPages();
    $("tdb-publier").addEventListener("click", publier);
    $("tdb-annuler").addEventListener("click", async () => {
      if (!confirm("Abandonner les modifications non publiées ?")) return;
      td = { ...td, brouillon: JSON.parse(JSON.stringify(td.publie)) }; await ecrire(); module.remplacer(td.publie); dessinerEtat();
    });
    $("tdb-recharger").addEventListener("click", () => recharger && recharger());
    module = window.TableauDeBord.monter($("tableau-de-bord"), {
      mode: "edition", table,
      abonner: async cb => { recharger = async () => cb(await lignes()); await recharger(); },
      configuration: () => td.brouillon || td.publie || null,
      enregistrer,
    });
  }
  window.OngletTableauDeBord = { afficher };
})();
