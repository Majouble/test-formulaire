/* =====================================================================
   Tableau de bord v2 — module partagé (administration : édition ; widget : lecture)
   Ce fichier monte un tableau de bord dans une page ; son code est dans modules/ (voir ORDRE_DES_MODULES).
   Reprise du tableau de bord v1. Contexte fourni par la page hôte :
   { mode: "edition" | "lecture", table, abonner(cb), configuration(), enregistrer(config) }
   ===================================================================== */
(function () {
  // adresse de ce fichier : pour charger le fond de carte commun s'il manque (page hôte plus ancienne, en cache)
  const ICI = (document.currentScript && document.currentScript.src) || location.href;
  const BALISAGE =
    '<div class="tdb-header">\n  <div class="bar">\n    <h1>Tableau de bord</h1>\n    <span class="sub" id="source">En attente des donn\u00e9es Grist\u2026</span>\n    <span class="sp"></span>\n    <button class="edit-only" id="saveCfg" title="T\u00e9l\u00e9charger la configuration des blocs (fichier .json)">Sauvegarder la configuration</button>\n    <button class="edit-only" id="loadCfg" title="Recharger une configuration sauvegard\u00e9e">Restaurer\u2026</button>\n    <button class="edit-only" id="findCfg" title="Chercher les configurations enregistr\u00e9es dans les autres widgets de ce document">R\u00e9cup\u00e9rer d\'un autre widget\u2026</button>\n    <input type="file" id="cfgFile" accept=".json,application/json" style="display:none">\n    <button class="edit-only" id="addTile">+ Chiffre cl\u00e9</button>\n    <button class="edit-only" id="addCross">+ Tableau crois\u00e9</button>\n    <button class="edit-only ghost" id="openAll" title="D\u00e9plier les r\u00e9glages de tous les blocs">Tout d\u00e9plier</button>\n    <button class="edit-only ghost" id="closeAll" title="Replier les r\u00e9glages de tous les blocs">Tout replier</button>\n    <button class="view-only" id="exportWord" title="Tous les blocs dans un document Word : chiffres cl\u00e9s, graphiques et tableaux">Exporter en Word</button>\n    <button class="primary" id="toggleEdit">Modifier le tableau de bord</button>\n  </div>\n  <div id="quickBar" class="view-only quickbar" role="toolbar" aria-label="Filtres rapides"></div>\n</div>\n<div class="tdb-main">\n  <div id="globalBox"></div>\n  <div id="messages"></div>\n  <div id="recover"></div>\n  <div class="tiles" id="tiles"></div>\n  <div id="blocks" style="display:grid;gap:12px"></div>\n  <p class="hint" id="diag"></p>\n</div>\n<div id="tip"></div>\n<div id="qpop" class="qpop" hidden></div>\n<div id="drill" class="drill-overlay" hidden></div>';
  // Modules du tableau de bord (tableau-de-bord/modules/NN-nom.js), construits dans cet ordre à chaque affichage d'un
  // tableau : chacun reçoit tableauDeBord (état du tableau affiché et fonctions des modules précédents) et y ajoute
  // les siennes. Chaque fichier de module s'enregistre dans TableauDeBord.modules ; il est chargé après ce fichier.
  const ORDRE_DES_MODULES = [
    "outils",
    "donnees",
    "fond-de-carte",
    "conditions",
    "references",
    "sources",
    "configuration",
    "rendu",
    "graphiques",
    "evenements",
    "export-word",
    "filtres-rapides",
    "detail",
    "source-des-blocs",
    "grist",
  ];
  const modules = {};

  function monter(RACINE, CTX) {
    if (!window.Geo) {
      // fond de carte absent de la page (commun/geo-fond.js puis commun/geo.js) : chargé ici, puis le tableau de bord est monté
      let module = null;
      const charger = (chemin) =>
        new Promise((ok, echec) => {
          const s = document.createElement("script");
          s.src = new URL(chemin, ICI).href;
          s.onload = ok;
          s.onerror = () => echec(s.src);
          document.head.appendChild(s);
        });
      (window.GEO_FOND ? Promise.resolve() : charger("../commun/geo-fond.js"))
        .then(() => charger("../commun/geo.js"))
        .then(() => {
          module = monter(RACINE, CTX);
        })
        .catch((adresse) => {
          RACINE.innerHTML = `<p style="margin:16px;color:#b42318">Fond de carte introuvable (${adresse}) : rechargez la page.</p>`;
        });
      return { remplacer: (c) => module && module.remplacer(c), configuration: () => module && module.configuration() };
    }
    RACINE.innerHTML = BALISAGE;
    if (CTX.mode === "edition" && CTX.atelier) {
      // atelier : tableau de bord et panneau de réglages côte à côte
      RACINE.classList.add("atelier");
      const main = RACINE.querySelector(".tdb-main"),
        cadre = document.createElement("div");
      cadre.className = "atelier-cadre";
      main.parentNode.insertBefore(cadre, main);
      cadre.appendChild(main);
      cadre.insertAdjacentHTML("beforeend", `<aside id="studio" class="studio" aria-label="Réglages du bloc"></aside>`);
      RACINE.insertAdjacentHTML(
        "beforeend",
        `<div id="fenetre" class="fenetre" hidden><div class="fenetre-boite" role="dialog" aria-modal="true" aria-labelledby="fenetreTitre">
        <div class="fenetre-tete"><h2 id="fenetreTitre"></h2><button class="ghost" data-act="st-fermer-fenetre" title="Fermer">✕</button></div><div id="fenetreCorps"></div></div></div>`,
      );
    }

    // l'objet partagé par les modules : état du tableau de bord affiché et fonctions des modules
    const tableauDeBord = { racine: RACINE, contexte: CTX };
    for (const nom of ORDRE_DES_MODULES) {
      const construire = modules[nom];
      if (!construire)
        throw new Error(`Tableau de bord : module « ${nom} » absent de la page (balise <script> manquante)`);
      construire(tableauDeBord);
    }

    // ce que la page hôte peut demander au tableau de bord
    const { $ } = Outils;
    return {
      remplacer(c) {
        tableauDeBord.config = JSON.parse(JSON.stringify(c));
        tableauDeBord.configLoaded = true;
        tableauDeBord.render();
      },
      configuration: () => tableauDeBord.config,
      // actions de la barre de l'administration (atelier)
      action(nom) {
        if (nom === "ajouter") tableauDeBord.ouvrirFenetre("ajouter");
        else if (nom === "reglages") tableauDeBord.ouvrirFenetre("reglages");
        else if (nom === "sauvegarder") $("saveCfg").click();
        else if (nom === "restaurer") $("loadCfg").click();
        else if (nom === "recuperer") $("findCfg").click();
      },
    };
  }
  window.TableauDeBord = { monter, modules };
})();
