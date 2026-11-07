/* =====================================================================
   Socle v2 — logo PRISME des widgets
   ---------------------------------------------------------------------
   PRISME : Plateforme de recueil d'information et de suivi multi-échelle.
   Logo = prisme qui décompose un faisceau en quatre rais effilés (les quatre échelles de suivi : national, académie,
   département, établissement), suivi du mot « PRISME », centré sur l'axe des rais et collé à la sortie de la lumière.
   Couleurs des rais : profondes en thème clair, vives en thème sombre (variables --prisme-r1 à --prisme-r4). Une page le réclame par un élément vide
   <span class="prisme-logo"></span> : ce script le remplit au chargement, et aussi quand l'élément arrive plus tard
   (page construite par le code, ex. tableau de bord). SocleMarque.poser(selecteur, variante) le place au début d'un
   élément qui n'existe pas encore (et le repose si l'élément est reconstruit).

   Variantes (attribut data-variante sur l'élément) :
     - « bloc » (défaut) : prisme + PRISME + filet vertical + développé sur deux lignes ; le développé se replie
                     sous 640 px de large (widget étroit, téléphone) et reste dans l'infobulle ;
     - « compact » : prisme + PRISME seulement ; le développé est dans l'infobulle et le nom accessible ;
     - « spectre » : PRISME souligné d'un filet aux quatre couleurs, développé sur une ligne en dessous ;
     - « centre »  : version centrée pour les écrans d'accueil (kit de secours, page vide, à propos).
   Couleur : bleu France en thème clair, bleu éclairci en thème sombre (commun/theme.js) ; hauteur réglable par
   la variable CSS --prisme-logo-h (22px par défaut, celle du prisme en variante bloc et compact).
   Usage : bloc dans les en-têtes (administration, saisie, tableau de bord, cartographie, réintégration) ; compact
   dans les barres d'outils chargées (point de situation, tableau de A à Z, référentiel des sites, extractions) ;
   centre sur la mise en route du kit de secours.
   Le kit de secours (barre dans une racine fantôme) prend les règles par SocleMarque.css() et remplit par
   SocleMarque.remplir(racine).
   ===================================================================== */
(function () {
  "use strict";
  const NOM = "PRISME";
  const DEVELOPPE = "Plateforme de recueil d’information et de suivi multi-échelle";
  const VARIANTES = ["bloc", "compact", "spectre", "centre"];

  // rais effilés : chaque rai s'élargit en s'éloignant du prisme ; couleurs par classe (profondes en clair, vives en sombre)
  const SVG =
    '<svg viewBox="0 0 36 24" aria-hidden="true" focusable="false">' +
    '<path d="M0 14.6 7.8 11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity=".55"/>' +
    '<path d="M7.8 11 19.1 12.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity=".4"/>' +
    '<path d="M13 2.2 24 21H2Z" fill="currentColor" fill-opacity=".1" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>' +
    '<path class="prisme-r1" d="M19.1 12.5 35 5.45 35 7.55Z"/>' +
    '<path class="prisme-r2" d="M19.1 12.5 35 9.95 35 12.05Z"/>' +
    '<path class="prisme-r3" d="M19.1 12.5 35 14.45 35 16.55Z"/>' +
    '<path class="prisme-r4" d="M19.1 12.5 35 18.95 35 21.05Z"/>' +
    "</svg>";
  const FILET = '<span class="prisme-logo-filet" aria-hidden="true"><i></i><i></i><i></i><i></i></span>';

  const POLICE = 'system-ui, -apple-system, "Segoe UI", Marianne, Arial, sans-serif';
  const CSS = [
    // commun
    ".prisme-logo { --prisme-logo-h: 22px; --prisme-texte: #3a3a3a; display: inline-flex; align-items: center; gap: 5px; flex: none;",
    " vertical-align: middle; margin-right: .55em; color: #000091; line-height: 1; white-space: nowrap; user-select: none; }",
    ".prisme-logo:empty { display: none; }",
    ".prisme-logo svg { height: var(--prisme-logo-h); width: calc(var(--prisme-logo-h) * 1.5); display: block; flex: none; }",
    // rais : couleurs profondes en thème clair (contraste fort sur fond blanc), vives en thème sombre
    ".prisme-logo { --prisme-r1: #b3000c; --prisme-r2: #c45f00; --prisme-r3: #15703a; --prisme-r4: #3434c4; }",
    ".prisme-r1 { fill: var(--prisme-r1); } .prisme-r2 { fill: var(--prisme-r2); } .prisme-r3 { fill: var(--prisme-r3); } .prisme-r4 { fill: var(--prisme-r4); }",
    `.prisme-logo-mot { font: 800 calc(var(--prisme-logo-h) * .68)/1 ${POLICE}; letter-spacing: .09em; text-transform: none; color: inherit; }`,
    `.prisme-logo-dev { font: 500 max(10px, calc(var(--prisme-logo-h) * .45))/1.15 ${POLICE}; color: var(--prisme-texte); letter-spacing: 0; text-transform: none; }`,
    ".prisme-logo-txt { display: flex; flex-direction: column; }",
    ".prisme-logo-filet { display: flex; height: 2px; border-radius: 1px; overflow: hidden; }",
    ".prisme-logo-filet i { flex: 1; } .prisme-logo-filet i:nth-child(1) { background: var(--prisme-r1); } .prisme-logo-filet i:nth-child(2) { background: var(--prisme-r2); }",
    " .prisme-logo-filet i:nth-child(3) { background: var(--prisme-r3); } .prisme-logo-filet i:nth-child(4) { background: var(--prisme-r4); }",
    // bloc et compact : mot collé à la sortie de la lumière, majuscules centrées sur l'axe des rais (y = 13,25 sur 24) ;
    // sans text-box (Firefox), le mot reste centré sur la hauteur du prisme
    '.prisme-logo[data-variante="bloc"], .prisme-logo[data-variante="compact"] { gap: calc(var(--prisme-logo-h) * .1); }',
    '@supports (text-box: trim-both cap alphabetic) { .prisme-logo[data-variante="bloc"] > .prisme-logo-mot, .prisme-logo[data-variante="compact"] > .prisme-logo-mot {',
    " text-box: trim-both cap alphabetic; position: relative; top: calc(var(--prisme-logo-h) * .052); } }",
    // bloc : filet vertical + développé sur deux lignes
    '.prisme-logo[data-variante="bloc"] .prisme-logo-sep { width: 1px; align-self: stretch; min-height: calc(var(--prisme-logo-h) * 1.1);',
    " background: currentColor; opacity: .35; margin: 0 calc(var(--prisme-logo-h) * .25); }",
    '@media (max-width: 640px) { .prisme-logo[data-variante="bloc"] .prisme-logo-sep, .prisme-logo[data-variante="bloc"] .prisme-logo-dev { display: none; } }',
    // spectre : mot, filet aux quatre couleurs, développé sur une ligne
    '.prisme-logo[data-variante="spectre"] { --prisme-logo-h: 30px; gap: 7px; }',
    '.prisme-logo[data-variante="spectre"] .prisme-logo-txt { gap: 3px; }',
    '.prisme-logo[data-variante="spectre"] .prisme-logo-mot { font-size: calc(var(--prisme-logo-h) * .5); }',
    '.prisme-logo[data-variante="spectre"] .prisme-logo-dev { font-size: max(10px, calc(var(--prisme-logo-h) * .33)); }',
    // centre : écran d'accueil
    '.prisme-logo[data-variante="centre"] { --prisme-logo-h: 96px; display: flex; flex-direction: column; gap: 14px; margin: 0 auto; text-align: center; white-space: normal; }',
    '.prisme-logo[data-variante="centre"] svg { margin-left: calc(var(--prisme-logo-h) * .1); }',
    '.prisme-logo[data-variante="centre"] .prisme-logo-mot { font-size: calc(var(--prisme-logo-h) * .46); letter-spacing: .1em; margin-left: .1em; }',
    '.prisme-logo[data-variante="centre"] .prisme-logo-filet { width: calc(var(--prisme-logo-h) * .75); height: 3px; }',
    '.prisme-logo[data-variante="centre"] .prisme-logo-dev { font-size: max(12px, calc(var(--prisme-logo-h) * .16)); line-height: 1.35; max-width: 22em; }',
    // thème sombre, impression
    ':root[data-theme="dark"] .prisme-logo { color: #8585f6; --prisme-texte: #cecece;',
    " --prisme-r1: #e1000f; --prisme-r2: #ff9940; --prisme-r3: #27a658; --prisme-r4: #6a6af4; }",
    ':root[data-theme="dark"] .prisme-logo[data-variante="bloc"] .prisme-logo-sep { opacity: .45; }',
    '@media print { .prisme-logo:not([data-variante="centre"]) { display: none; } }',
  ].join("\n");

  const mot = `<span class="prisme-logo-mot">${NOM}</span>`;
  const dev = (deuxLignes) =>
    `<span class="prisme-logo-dev">${
      deuxLignes ? "Plateforme de recueil d’information<br>et de suivi multi-échelle" : DEVELOPPE
    }</span>`;
  const GABARITS = {
    compact: () => SVG + mot,
    bloc: () => SVG + mot + '<span class="prisme-logo-sep" aria-hidden="true"></span>' + dev(true),
    spectre: () => SVG + `<span class="prisme-logo-txt">${mot}${FILET}${dev(false)}</span>`,
    centre: () => SVG + mot + FILET + dev(true),
  };

  function remplir(el) {
    if (!el || el.dataset.prismeOk) return;
    el.dataset.prismeOk = "1";
    const variante = VARIANTES.includes(el.dataset.variante) ? el.dataset.variante : "bloc";
    el.dataset.variante = variante;
    el.innerHTML = GABARITS[variante]();
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", `${NOM} — ${DEVELOPPE}`);
    const v = window.Socle && window.Socle.VERSION;
    el.title = `${NOM} — ${DEVELOPPE}` + (v ? `\nversion ${v}` : "");
  }
  const nouveau = (variante) => {
    const s = document.createElement("span");
    s.className = "prisme-logo";
    if (variante) s.dataset.variante = variante;
    return s;
  };
  function toutRemplir(racine) {
    (racine || document).querySelectorAll(".prisme-logo:not([data-prisme-ok])").forEach(remplir);
  }

  // logo au début du premier élément qui correspond au sélecteur, dès qu'il existe ; reposé si la page est reconstruite
  const attentes = [];
  function poser(selecteur, variante) {
    const essayer = () => {
      const cible = document.querySelector(selecteur);
      if (!cible || cible.querySelector(":scope > .prisme-logo")) return;
      const s = nouveau(variante);
      cible.insertBefore(s, cible.firstChild);
      remplir(s);
    };
    attentes.push(essayer);
    essayer();
  }

  const style = document.createElement("style");
  style.id = "prisme-logo-style";
  style.textContent = CSS;
  (document.head || document.documentElement).appendChild(style);

  const demarrer = () => {
    toutRemplir();
    new MutationObserver(() => {
      toutRemplir();
      attentes.forEach((f) => f());
    }).observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", demarrer);
  else demarrer();

  window.SocleMarque = { svg: () => SVG, css: () => CSS, poser, remplir: toutRemplir, nom: NOM, developpe: DEVELOPPE };
})();
