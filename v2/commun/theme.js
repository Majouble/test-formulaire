/* =====================================================================
   Socle v2 — thème clair ou sombre des widgets
   ---------------------------------------------------------------------
   Pose data-theme="light" | "dark" sur <html> ; les feuilles de style des widgets en tirent leurs couleurs
   (variables CSS, valeurs sombres inspirées du DSFR : fonds gris très foncés, texte clair, bleu France éclairci).
   Ordre de décision :
     1. choix de la personne (localStorage « socle-v2-theme » : auto | light | dark), commun à tous les widgets du socle ;
     2. thème de Grist transmis au widget (color-scheme posé sur <html>, ou couleurs --grist-theme-*) ;
     3. réglage du navigateur ou du système (prefers-color-scheme).
   Chargé tôt dans <head> : pas d'éclair de mauvais thème au chargement.
   ===================================================================== */
(function () {
  "use strict";
  const CLE = "socle-v2-theme";
  const html = document.documentElement;
  const media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  const lireChoix = () => { try { const v = localStorage.getItem(CLE); return v === "light" || v === "dark" ? v : "auto"; } catch (_) { return "auto"; } };
  // luminance relative d'une couleur CSS (rgb(), #hex) ; null si illisible
  function luminance(c) {
    c = String(c || "").trim(); if (!c) return null;
    let r, g, b, m;
    if ((m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c))) {
      const h = m[1].length === 3 ? m[1].split("").map(x => x + x).join("") : m[1];
      [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
    } else if ((m = /rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/i.exec(c))) [r, g, b] = [m[1], m[2], m[3]].map(Number);
    else return null;
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }
  // thème transmis par Grist : color-scheme en style en ligne, sinon couleur de texte ou de fond du thème Grist
  function themeGrist() {
    const cs = (html.style.colorScheme || html.style.getPropertyValue("color-scheme") || "").toLowerCase();
    if (/dark/.test(cs)) return "dark";
    if (/light/.test(cs)) return "light";
    const st = getComputedStyle(html);
    for (const v of ["--grist-theme-page-bg", "--grist-theme-bg", "--grist-theme-page-panels-main-panel-bg", "--grist-theme-widget-bg"]) {
      const l = luminance(st.getPropertyValue(v)); if (l !== null) return l < 0.45 ? "dark" : "light";
    }
    for (const v of ["--grist-theme-text", "--grist-theme-text-light"]) {
      const l = luminance(st.getPropertyValue(v)); if (l !== null) return l > 0.55 ? "dark" : "light";
    }
    return null;
  }
  function calculer() {
    const choix = lireChoix(); if (choix !== "auto") return choix;
    return themeGrist() || (media && media.matches ? "dark" : "light");
  }
  function appliquer() {
    const t = calculer();
    if (html.getAttribute("data-theme") !== t) html.setAttribute("data-theme", t);
    document.dispatchEvent(new CustomEvent("socle-theme", { detail: t }));
  }
  // menus déroulants, cases et barres de défilement du navigateur assortis au thème (prime sur un style en ligne de Grist)
  const st = document.createElement("style");
  st.id = "socle-theme";
  st.textContent = ':root[data-theme="light"] { color-scheme: light !important; } :root[data-theme="dark"] { color-scheme: dark !important; }';
  (document.head || html).appendChild(st);
  appliquer();
  if (media) (media.addEventListener ? media.addEventListener("change", appliquer) : media.addListener(appliquer));
  // Grist peut transmettre son thème après le chargement (style en ligne sur <html>, feuille de variables dans <head>)
  let enCours = false;
  const observer = new MutationObserver(() => { if (enCours) return; enCours = true; requestAnimationFrame(() => { enCours = false; appliquer(); }); });
  const surveiller = () => {
    observer.observe(html, { attributes: true, attributeFilter: ["style", "class"] });
    if (document.head) observer.observe(document.head, { childList: true, subtree: true, characterData: true });
  };
  surveiller();
  window.addEventListener("storage", e => { if (e.key === CLE) appliquer(); });
  window.SocleTheme = {
    choix: lireChoix,
    actuel: () => html.getAttribute("data-theme"),
    choisir(v) { try { if (v === "light" || v === "dark") localStorage.setItem(CLE, v); else localStorage.removeItem(CLE); } catch (_) { /* stockage indisponible */ } appliquer(); },
    // bouton ◐ : automatique → clair → sombre → automatique
    bouton(el) {
      const libelles = { auto: "Thème : automatique (Grist, navigateur)", light: "Thème : clair", dark: "Thème : sombre" };
      const maj = () => { const c = lireChoix(); el.textContent = c === "auto" ? "◐" : c === "dark" ? "☾" : "☀"; el.title = `${libelles[c]} — cliquer pour changer`; el.setAttribute("aria-label", el.title); };
      el.addEventListener("click", () => { const c = lireChoix(); this.choisir(c === "auto" ? "light" : c === "light" ? "dark" : "auto"); maj(); });
      maj();
    },
  };
})();
