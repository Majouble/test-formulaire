/* =====================================================================
   Socle v2 — menu déroulant des champs à valeurs proposées
   ---------------------------------------------------------------------
   Définit : window.MenuDeroulant = { ameliorer(champ), activer(racine), css() }.
   Utilise : rien d'autre que le DOM ; les valeurs viennent du <datalist> que le champ désigne par son attribut « list ».

   Les widgets proposent des valeurs dans un champ texte (valeur d'un filtre, équipe, département, établissement de
   test…) par un <input list="…"> et son <datalist>. Le menu natif du navigateur est peu visible (rien n'indique qu'une
   liste existe, aucune flèche dans certains navigateurs) : ce script le remplace par un vrai menu déroulant.
     - Le champ reçoit une flèche ▾ à droite (dessinée dans son fond : la mise en page ne bouge pas).
     - Un clic dans le champ ou sur la flèche ouvre la liste complète ; la frappe la filtre (sans accents ni casse) ;
       flèches haut et bas, Entrée pour choisir, Échap pour fermer. La saisie libre reste possible.
     - Champ à plusieurs valeurs : attribut data-separateur (ex. data-separateur=";") ; la frappe filtre sur la valeur
       en cours, le choix l'ajoute à la suite (« a ; b »), les valeurs déjà prises ne sont plus proposées.
     - Le libellé d'une <option> (ex. « 12 établissements ») s'affiche en petit à droite de la valeur.
     - Le choix déclenche les événements input et change du champ : le code du widget n'a rien à changer.
   Les champs arrivés plus tard (pages construites par le code, listes redessinées) sont pris en charge au fil de l'eau ;
   le contenu du <datalist> est relu à chaque ouverture (liste remplie pendant la frappe, ex. établissement de test).
   Le menu est un seul élément flottant posé sur <body>, au-dessus de tout, refermé au défilement.
   ===================================================================== */
(function () {
  "use strict";
  const MAX = 300;                 // valeurs affichées au plus (la frappe affine)
  const LARGEUR_FLECHE = 24;       // zone cliquable de la flèche, à droite du champ (px)
  const normaliser = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const STYLE = `
input.md-champ, .md-chevron { padding-right: ${LARGEUR_FLECHE}px !important;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23888' stroke-width='1.6'/%3E%3C/svg%3E") !important;
  background-repeat: no-repeat !important; background-position: right 8px center !important; background-size: 10px 6px !important; }
.md-liste { position: fixed; z-index: 10000; margin: 0; padding: 3px 0; list-style: none; overflow: auto; max-height: 260px;
  background: var(--md-fond, #fff); color: var(--md-texte, #1e1e1e); border: 1px solid var(--md-bord, #b8b8b8); border-radius: 4px;
  box-shadow: 0 4px 14px rgba(0,0,0,.18); font: 13px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif; }
.md-liste li { padding: 4px 9px; cursor: pointer; display: flex; gap: 10px; justify-content: space-between; white-space: nowrap; }
.md-liste li[aria-selected=true], .md-liste li:hover { background: var(--md-survol, #e3e8f8); }
.md-liste li .md-detail { color: var(--md-gris, #6a6a6a); font-size: 11px; }
.md-liste li.md-etat { cursor: default; color: var(--md-gris, #6a6a6a); font-style: italic; background: none; }
html[data-theme=dark] .md-liste { --md-fond: #1e1e1e; --md-texte: #e6e6e6; --md-bord: #4a4a4a; --md-survol: #2c3a5c; --md-gris: #a8a8a8; }`;

  let liste = null, champ = null;   // menu flottant (unique) et champ auquel il est attaché

  // ---------- valeurs ----------
  function valeursDuChamp(c) {
    const dl = c.dataset.menuListe && document.getElementById(c.dataset.menuListe);
    if (!dl) return [];
    return [...dl.querySelectorAll("option")].map(o => ({ valeur: o.value, detail: o.label && o.label !== o.value ? o.label : (o.textContent.trim() !== o.value ? o.textContent.trim() : "") }))
      .filter(v => v.valeur !== "");
  }
  // valeur multiple « a ; b ; c » : morceaux déjà pris et morceau en cours de frappe ; un dernier morceau qui est déjà
  // une valeur proposée compte comme pris (le choix suivant s'ajoute à la suite au lieu de le remplacer)
  function decouper(c) {
    const sep = c.dataset.separateur;
    if (!sep) return { pris: [], enCours: c.value };
    const morceaux = c.value.split(sep), pris = morceaux.slice(0, -1).map(x => x.trim()).filter(Boolean);
    const dernier = morceaux[morceaux.length - 1], n = normaliser(dernier);
    if (n && valeursDuChamp(c).some(v => normaliser(v.valeur) === n)) return { pris: [...pris, dernier.trim()], enCours: "" };
    return { pris, enCours: dernier };
  }

  // ---------- ouverture, fermeture ----------
  function ouvrir(c, tout) {
    if (!liste) { liste = document.createElement("ul"); liste.className = "md-liste"; liste.id = "md-liste"; liste.setAttribute("role", "listbox"); document.body.append(liste); }
    champ = c;
    const { pris, enCours } = decouper(c), q = tout ? "" : normaliser(enCours);
    const dejaPris = new Set(pris.map(normaliser));
    const toutes = valeursDuChamp(c).filter(v => !dejaPris.has(normaliser(v.valeur)));
    const retenues = q ? toutes.filter(v => normaliser(v.valeur).includes(q) || normaliser(v.detail).includes(q)) : toutes;
    const echapper = s => String(s).replace(/[&<>"]/g, x => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[x]));
    liste.innerHTML = retenues.slice(0, MAX).map((v, i) => `<li role="option" id="md-o${i}" data-valeur="${echapper(v.valeur)}" aria-selected="false"><span>${echapper(v.valeur)}</span>${v.detail ? `<span class="md-detail">${echapper(v.detail)}</span>` : ""}</li>`).join("")
      + (retenues.length > MAX ? `<li class="md-etat" aria-disabled="true">… ${retenues.length - MAX} autres : tapez pour affiner</li>` : "")
      + (!retenues.length ? `<li class="md-etat" aria-disabled="true">${toutes.length ? "Aucune valeur ne correspond (saisie libre possible)" : "Aucune valeur proposée"}</li>` : "");
    placer();
    liste.hidden = false;
    c.setAttribute("aria-expanded", "true"); c.setAttribute("aria-controls", "md-liste");
  }
  function placer() {
    const r = champ.getBoundingClientRect(), bas = window.innerHeight - r.bottom, haut = r.top;
    liste.style.left = Math.max(4, Math.min(r.left, window.innerWidth - Math.max(r.width, 180) - 4)) + "px";
    liste.style.minWidth = Math.max(r.width, 180) + "px";
    liste.style.maxWidth = Math.max(r.width, Math.min(480, window.innerWidth - 8)) + "px";
    const enHaut = bas < 160 && haut > bas;   // pas la place en dessous : au-dessus du champ
    liste.style.maxHeight = Math.min(260, (enHaut ? haut : bas) - 8) + "px";
    liste.style.top = enHaut ? "" : (r.bottom + 2) + "px";
    liste.style.bottom = enHaut ? (window.innerHeight - r.top + 2) + "px" : "";
  }
  function fermer() {
    if (liste) liste.hidden = true;
    if (champ) { champ.setAttribute("aria-expanded", "false"); champ.removeAttribute("aria-activedescendant"); }
    champ = null;
  }
  const ouvert = c => liste && !liste.hidden && champ === c;

  // ---------- choix ----------
  function choisir(c, valeur) {
    const sep = c.dataset.separateur;
    if (sep) { const { pris } = decouper(c); c.value = [...pris, valeur].join(` ${sep} `); }
    else c.value = valeur;
    fermer();
    c.dispatchEvent(new Event("input", { bubbles: true }));
    c.dispatchEvent(new Event("change", { bubbles: true }));
    c.focus();
  }
  function deplacer(pas) {
    const lis = [...liste.querySelectorAll("li[role=option]")];
    if (!lis.length) return;
    const i = lis.findIndex(x => x.getAttribute("aria-selected") === "true");
    const j = Math.max(0, Math.min(lis.length - 1, i < 0 ? (pas > 0 ? 0 : lis.length - 1) : i + pas));
    lis.forEach((x, k) => x.setAttribute("aria-selected", String(k === j)));
    lis[j].scrollIntoView({ block: "nearest" });
    champ.setAttribute("aria-activedescendant", lis[j].id);
  }

  // ---------- champs ----------
  function ameliorer(c) {
    if (!c || c.dataset.menuListe || !c.getAttribute("list")) return;
    c.dataset.menuListe = c.getAttribute("list");
    c.removeAttribute("list");                     // plus de menu natif
    c.classList.add("md-champ");
    c.setAttribute("role", "combobox"); c.setAttribute("aria-autocomplete", "list"); c.setAttribute("aria-expanded", "false");
    c.setAttribute("autocomplete", "off");
    if (!c.title) c.title = "Choisir dans la liste ou saisir une valeur";
  }
  function activer(racine) {
    (racine || document).querySelectorAll("input[list]").forEach(ameliorer);
  }
  const dansFleche = (c, ev) => ev.clientX >= c.getBoundingClientRect().right - LARGEUR_FLECHE;

  // ---------- événements (délégués : valent pour les champs ajoutés plus tard) ----------
  function brancher() {
    const st = document.createElement("style"); st.id = "menu-deroulant-style"; st.textContent = STYLE; document.head.append(st);
    activer(document);
    new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => {
      if (n.nodeType !== 1) return;
      if (n.matches("input[list]")) ameliorer(n); else if (n.querySelector("input[list]")) activer(n);
    }))).observe(document.body, { childList: true, subtree: true });
    document.addEventListener("mousedown", ev => {
      const li = ev.target.closest && ev.target.closest(".md-liste li[role=option]");
      if (li) { ev.preventDefault(); choisir(champ, li.dataset.valeur); return; }
      const c = ev.target.closest && ev.target.closest("input.md-champ");
      if (!c || c.disabled || c.readOnly) return;
      if (ouvert(c) && dansFleche(c, ev)) { ev.preventDefault(); fermer(); return; }   // la flèche referme
      if (!ouvert(c)) setTimeout(() => ouvrir(c, true), 0);
    }, true);
    document.addEventListener("input", ev => {
      const c = ev.target;
      if (!c.classList || !c.classList.contains("md-champ") || ev.isTrusted === false) return;
      setTimeout(() => { if (document.activeElement === c) ouvrir(c, false); }, 0);   // après le code du widget (liste remplie à la frappe)
    });
    document.addEventListener("keydown", ev => {
      const c = ev.target;
      if (!c.classList || !c.classList.contains("md-champ")) return;
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
        ev.preventDefault();
        if (!ouvert(c)) ouvrir(c, ev.altKey || !decouper(c).enCours.trim());
        deplacer(ev.key === "ArrowDown" ? 1 : -1);
      } else if (ev.key === "Enter" && ouvert(c)) {
        const li = liste.querySelector("li[aria-selected=true]");
        if (li) { ev.preventDefault(); choisir(c, li.dataset.valeur); } else fermer();
      } else if (ev.key === "Escape" && ouvert(c)) { ev.preventDefault(); ev.stopPropagation(); fermer(); }
      else if (ev.key === "Tab") fermer();
    }, true);
    document.addEventListener("focusout", ev => { if (ev.target === champ) setTimeout(() => { if (champ && document.activeElement !== champ) fermer(); }, 150); });
    window.addEventListener("scroll", ev => { if (champ && !(liste && liste.contains(ev.target))) fermer(); }, true);
    window.addEventListener("resize", fermer);
  }
  if (document.body) brancher(); else document.addEventListener("DOMContentLoaded", brancher);

  window.MenuDeroulant = { ameliorer, activer, css: () => STYLE };
})();
