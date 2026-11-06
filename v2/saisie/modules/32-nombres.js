/* PRISME — widget de saisie, module 32/34 : Nombres saisis avec séparateur de milliers.
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
function formaterSaisieNombre(texte, entier) {
  texte = String(texte ?? "").replace(/[^\d,.-]/g, "");
  const negatif = texte.startsWith("-");
  texte = texte.replace(/-/g, "");
  const [ent, ...dec] = texte.split(/[.,]/);
  const groupes = ent.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ESPACE_MILLIERS);
  return (negatif ? "-" : "") + groupes + (!entier && dec.length ? "," + dec.join("") : "");
}
function nombreBrut(affiche) {
  const texteNombre = String(affiche ?? "")
    .replace(/\s/g, "")
    .replace(",", ".");
  return /^-?(\d+(\.\d*)?|\.\d+)$/.test(texteNombre) ? texteNombre.replace(/\.$/, "") : "";
}
function champNombreFr(champ) {
  if (champ.dataset.nombreFr) return;
  const entier = champ.step === "1";
  const initial = PROTO_VALEUR.get.call(champ);
  champ.dataset.nombreFr = "1";
  champ.type = "text";
  champ.inputMode = entier ? "numeric" : "decimal";
  champ.autocomplete = "off";
  champ.classList.add("nombre-fr");
  Object.defineProperty(champ, "value", {
    configurable: true,
    get() {
      return nombreBrut(PROTO_VALEUR.get.call(this));
    },
    set(valeur) {
      const nombre = valeur === "" || valeur == null ? NaN : Number(String(valeur).replace(",", "."));
      PROTO_VALEUR.set.call(
        this,
        isNaN(nombre) ? String(valeur ?? "") : formaterSaisieNombre(String(nombre).replace(".", ","), entier),
      );
    },
  });
  champ.value = initial;
  champ.addEventListener(
    "input",
    () => {
      const avant = PROTO_VALEUR.get.call(champ),
        pos = champ.selectionStart ?? avant.length;
      const utiles = avant.slice(0, pos).replace(/[^\d,.-]/g, "").length; // caractères utiles avant le curseur
      const apres = formaterSaisieNombre(avant, entier);
      if (apres === avant) return;
      PROTO_VALEUR.set.call(champ, apres);
      let k = 0,
        i = 0;
      while (i < apres.length && k < utiles) {
        if (/[\d,-]/.test(apres[i])) k++;
        i++;
      }
      champ.setSelectionRange(i, i);
    },
    true,
  ); // avant les autres écouteurs : ils lisent déjà la valeur mise en forme
  champ.addEventListener("keydown", (evenement) => {
    if (evenement.key !== "ArrowUp" && evenement.key !== "ArrowDown") return;
    evenement.preventDefault();
    incrementerNombre(champ, evenement.key === "ArrowUp" ? 1 : -1);
  });
  // Petites flèches haut / bas à droite du champ (comme un champ nombre), avec répétition si on maintient le clic
  const zone = document.createElement("span");
  zone.className = "zone-nombre";
  champ.parentNode.insertBefore(zone, champ);
  zone.appendChild(champ);
  zone.insertAdjacentHTML(
    "beforeend",
    `<span class="fleches-nombre" aria-hidden="true">` +
      `<button type="button" tabindex="-1" data-pas="1" title="Augmenter">▲</button><button type="button" tabindex="-1" data-pas="-1" title="Diminuer">▼</button></span>`,
  );
  zone.querySelectorAll("[data-pas]").forEach((boutonFleche) => {
    let attente = null,
      repete = null;
    const stop = () => {
      clearTimeout(attente);
      clearInterval(repete);
      attente = repete = null;
    };
    boutonFleche.addEventListener("pointerdown", (evenement) => {
      evenement.preventDefault();
      if (champ.disabled || champ.readOnly) return;
      champ.focus();
      const pas = +boutonFleche.dataset.pas;
      incrementerNombre(champ, pas);
      attente = setTimeout(() => {
        repete = setInterval(() => incrementerNombre(champ, pas), 70);
      }, 400);
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach((typeEvenement) =>
      boutonFleche.addEventListener(typeEvenement, stop),
    );
  });
}
function incrementerNombre(champ, pas) {
  const valeurActuelle = parseFloat(champ.value) || 0;
  let nouvelleValeur = valeurActuelle + pas;
  const min = champ.getAttribute("min"),
    max = champ.getAttribute("max");
  if (min !== null && min !== "" && nouvelleValeur < +min) nouvelleValeur = +min;
  if (max !== null && max !== "" && nouvelleValeur > +max) nouvelleValeur = +max;
  if (nouvelleValeur === valeurActuelle && champ.value !== "") return;
  champ.value = nouvelleValeur;
  champ.dispatchEvent(new Event("input", { bubbles: true }));
  champ.dispatchEvent(new Event("change", { bubbles: true }));
}
// Champs concernés : questions, visas et lignes de tableau (pas les réglages ni la quantité de lignes à ajouter)
const CIBLE_NOMBRE = 'input[type="number"]:not(.qte):not([data-borne]):not([disabled])';
function convertirNombres(racine) {
  if (racine.matches && racine.matches(CIBLE_NOMBRE) && !racine.closest("#config")) champNombreFr(racine);
  if (racine.querySelectorAll)
    racine.querySelectorAll(CIBLE_NOMBRE).forEach((champ) => {
      if (!champ.closest("#config")) champNombreFr(champ);
    });
}
new MutationObserver((muts) => {
  for (const mutation of muts) mutation.addedNodes.forEach((noeud) => noeud.nodeType === 1 && convertirNombres(noeud));
}).observe(document.body, { childList: true, subtree: true });
convertirNombres(document.body);
