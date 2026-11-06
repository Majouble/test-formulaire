/* PRISME — widget de saisie, module 29/31 : Nombres saisis avec séparateur de milliers.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* =========================================================
   Nombres saisis avec séparateur de milliers (« 12 500 »)
   ---------------------------------------------------------
   Un champ nombre du navigateur ne peut pas afficher d'espaces : chaque champ nombre des questions (et des
   lignes de tableau) devient un champ texte qui met en forme la saisie au fil de la frappe. Sa propriété
   value renvoie toujours le nombre brut (« 12500 », « 12.5 »), si bien que la lecture des réponses, les
   bornes, les conditions et l'enregistrement fonctionnent comme avant. Flèches haut / bas : +1 / −1.
   ========================================================= */
const ESPACE_MILLIERS = " ";
const PROTO_VALEUR = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
function formaterSaisieNombre(s, entier) {
  s = String(s ?? "").replace(/[^\d,.-]/g, "");
  const negatif = s.startsWith("-");
  s = s.replace(/-/g, "");
  const [ent, ...dec] = s.split(/[.,]/);
  const groupes = ent.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ESPACE_MILLIERS);
  return (negatif ? "-" : "") + groupes + (!entier && dec.length ? "," + dec.join("") : "");
}
function nombreBrut(affiche) {
  const s = String(affiche ?? "")
    .replace(/\s/g, "")
    .replace(",", ".");
  return /^-?(\d+(\.\d*)?|\.\d+)$/.test(s) ? s.replace(/\.$/, "") : "";
}
function champNombreFr(el) {
  if (el.dataset.nombreFr) return;
  const entier = el.step === "1";
  const initial = PROTO_VALEUR.get.call(el);
  el.dataset.nombreFr = "1";
  el.type = "text";
  el.inputMode = entier ? "numeric" : "decimal";
  el.autocomplete = "off";
  el.classList.add("nombre-fr");
  Object.defineProperty(el, "value", {
    configurable: true,
    get() {
      return nombreBrut(PROTO_VALEUR.get.call(this));
    },
    set(v) {
      const n = v === "" || v == null ? NaN : Number(String(v).replace(",", "."));
      PROTO_VALEUR.set.call(
        this,
        isNaN(n) ? String(v ?? "") : formaterSaisieNombre(String(n).replace(".", ","), entier),
      );
    },
  });
  el.value = initial;
  el.addEventListener(
    "input",
    () => {
      const avant = PROTO_VALEUR.get.call(el),
        pos = el.selectionStart ?? avant.length;
      const utiles = avant.slice(0, pos).replace(/[^\d,.-]/g, "").length; // caractères utiles avant le curseur
      const apres = formaterSaisieNombre(avant, entier);
      if (apres === avant) return;
      PROTO_VALEUR.set.call(el, apres);
      let k = 0,
        i = 0;
      while (i < apres.length && k < utiles) {
        if (/[\d,-]/.test(apres[i])) k++;
        i++;
      }
      el.setSelectionRange(i, i);
    },
    true,
  ); // avant les autres écouteurs : ils lisent déjà la valeur mise en forme
  el.addEventListener("keydown", (ev) => {
    if (ev.key !== "ArrowUp" && ev.key !== "ArrowDown") return;
    ev.preventDefault();
    incrementerNombre(el, ev.key === "ArrowUp" ? 1 : -1);
  });
  // Petites flèches haut / bas à droite du champ (comme un champ nombre), avec répétition si on maintient le clic
  const zone = document.createElement("span");
  zone.className = "zone-nombre";
  el.parentNode.insertBefore(zone, el);
  zone.appendChild(el);
  zone.insertAdjacentHTML(
    "beforeend",
    `<span class="fleches-nombre" aria-hidden="true">` +
      `<button type="button" tabindex="-1" data-pas="1" title="Augmenter">▲</button><button type="button" tabindex="-1" data-pas="-1" title="Diminuer">▼</button></span>`,
  );
  zone.querySelectorAll("[data-pas]").forEach((b) => {
    let attente = null,
      repete = null;
    const stop = () => {
      clearTimeout(attente);
      clearInterval(repete);
      attente = repete = null;
    };
    b.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      if (el.disabled || el.readOnly) return;
      el.focus();
      const pas = +b.dataset.pas;
      incrementerNombre(el, pas);
      attente = setTimeout(() => {
        repete = setInterval(() => incrementerNombre(el, pas), 70);
      }, 400);
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach((t) => b.addEventListener(t, stop));
  });
}
function incrementerNombre(el, pas) {
  const n = parseFloat(el.value) || 0;
  let v = n + pas;
  const min = el.getAttribute("min"),
    max = el.getAttribute("max");
  if (min !== null && min !== "" && v < +min) v = +min;
  if (max !== null && max !== "" && v > +max) v = +max;
  if (v === n && el.value !== "") return;
  el.value = v;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}
// Champs concernés : questions, visas et lignes de tableau (pas les réglages ni la quantité de lignes à ajouter)
const CIBLE_NOMBRE = 'input[type="number"]:not(.qte):not([data-borne]):not([disabled])';
function convertirNombres(racine) {
  if (racine.matches && racine.matches(CIBLE_NOMBRE) && !racine.closest("#config")) champNombreFr(racine);
  if (racine.querySelectorAll)
    racine.querySelectorAll(CIBLE_NOMBRE).forEach((el) => {
      if (!el.closest("#config")) champNombreFr(el);
    });
}
new MutationObserver((muts) => {
  for (const m of muts) m.addedNodes.forEach((n) => n.nodeType === 1 && convertirNombres(n));
}).observe(document.body, { childList: true, subtree: true });
convertirNombres(document.body);
