/* =====================================================================
   Socle v2 — logo PRISME des widgets
   ---------------------------------------------------------------------
   Petit logo (prisme qui décompose un faisceau en quatre couleurs, suivi du mot « PRISME »), posé en haut à
   gauche de chaque widget. Une page le réclame par un élément vide <span class="prisme-logo"></span> : ce script
   le remplit au chargement, et aussi quand l'élément arrive plus tard (page construite par le code, ex. tableau de
   bord). SocleMarque.poser(selecteur) le place au début d'un élément qui n'existe pas encore (et le repose si
   l'élément est reconstruit).
   Couleur : bleu France en thème clair, bleu éclairci en thème sombre (commun/theme.js) ; hauteur réglable par
   la variable CSS --prisme-logo-h (22px par défaut).
   ===================================================================== */
(function () {
  "use strict";
  const SVG = '<svg viewBox="0 0 36 24" aria-hidden="true" focusable="false">'
    + '<path d="M0 14.6 7.8 11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity=".55"/>'
    + '<path d="M7.8 11 19.1 12.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity=".4"/>'
    + '<path d="M13 2.2 24 21H2Z" fill="currentColor" fill-opacity=".1" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>'
    + '<g stroke-width="1.8" stroke-linecap="round">'
    + '<path d="M19.1 12.5 35 6.5" stroke="#e1000f"/>'
    + '<path d="M19.1 12.5 35 11" stroke="#ff9940"/>'
    + '<path d="M19.1 12.5 35 15.5" stroke="#27a658"/>'
    + '<path d="M19.1 12.5 35 20" stroke="#6a6af4"/>'
    + '</g></svg>';
  const CSS = '.prisme-logo { --prisme-logo-h: 22px; display: inline-flex; align-items: center; gap: 5px; flex: none;'
    + ' vertical-align: middle; margin-right: .55em; color: #000091; line-height: 1; white-space: nowrap; user-select: none; }'
    + ' .prisme-logo:empty { display: none; }'
    + ' .prisme-logo svg { height: var(--prisme-logo-h); width: calc(var(--prisme-logo-h) * 1.5); display: block; }'
    + ' .prisme-logo-mot { font: 800 calc(var(--prisme-logo-h) * .68)/1 system-ui, -apple-system, "Segoe UI", Marianne, Arial, sans-serif;'
    + ' letter-spacing: .09em; text-transform: none; color: inherit; }'
    + ' :root[data-theme="dark"] .prisme-logo { color: #8585f6; }'
    + ' @media print { .prisme-logo { display: none; } }';

  function remplir(el) {
    if (!el || el.dataset.prismeOk) return;
    el.dataset.prismeOk = "1";
    el.innerHTML = SVG + '<span class="prisme-logo-mot">PRISME</span>';
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", "PRISME");
    const v = window.Socle && window.Socle.VERSION;
    el.title = v ? `PRISME — version ${v}` : "PRISME";
  }
  const nouveau = () => { const s = document.createElement("span"); s.className = "prisme-logo"; return s; };
  function toutRemplir(racine) { (racine || document).querySelectorAll(".prisme-logo:not([data-prisme-ok])").forEach(remplir); }

  // logo au début du premier élément qui correspond au sélecteur, dès qu'il existe ; reposé si la page est reconstruite
  const attentes = [];
  function poser(selecteur) {
    const essayer = () => {
      const cible = document.querySelector(selecteur);
      if (!cible || cible.querySelector(":scope > .prisme-logo")) return;
      const s = nouveau(); cible.insertBefore(s, cible.firstChild); remplir(s);
    };
    attentes.push(essayer); essayer();
  }

  const style = document.createElement("style");
  style.id = "prisme-logo-style";
  style.textContent = CSS;
  (document.head || document.documentElement).appendChild(style);

  const demarrer = () => {
    toutRemplir();
    new MutationObserver(() => {
      toutRemplir();
      attentes.forEach(f => f());
    }).observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", demarrer);
  else demarrer();

  window.SocleMarque = { svg: () => SVG, poser, remplir: toutRemplir };
})();
