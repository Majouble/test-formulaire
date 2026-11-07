/* PRISME — widget de saisie, composants/nombres.js
   Composant : nombres saisis avec séparateur de milliers.
   Chargé par saisie/index.html dans l'ordre : fondations, composants, domaines, demarrage.js. Les fichiers partagent
   leurs noms (scripts classiques, sans import) : au chargement, un fichier ne fait que définir. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : questionsNumeriques, nombreOuNul, bornesDe, appliquerBornes, ESPACE_MILLIERS, PROTO_VALEUR,
     formaterSaisieNombre, nombreBrut, champNombreFr, incrementerNombre, CIBLE_NOMBRE, convertirNombres,
     brancherEvenementsNombres.
   Utilise :
     fondations/outils : typeBase.
     fondations/etat : etatSaisie. */
/* ---------- Limites des nombres : description de la colonne ou réglage de la question dans le formulaire, sinon
   réglages communs (administration, onglet Installation : limites anciennes par question, valeurs négatives) ---------- */
const questionsNumeriques = () =>
  [...etatSaisie.defsQuestions, ...etatSaisie.defsDep, ...etatSaisie.defsAca].filter(
    (question) => !question.formule && ["Numeric", "Int"].includes(typeBase(question.type)),
  );
const nombreOuNul = (valeur) =>
  valeur === "" || valeur == null || isNaN(parseFloat(String(valeur).replace(",", ".")))
    ? null
    : parseFloat(String(valeur).replace(",", "."));
function bornesDe(question) {
  const reglageBornes = ((etatSaisie.optionsAuto && etatSaisie.optionsAuto.bornes) || {})[question.colId] || {};
  const min =
    question.min ??
    nombreOuNul(reglageBornes.min) ??
    (etatSaisie.optionsAuto && etatSaisie.optionsAuto.nombresPositifs ? 0 : null);
  return { min, max: question.max ?? nombreOuNul(reglageBornes.max) };
}
// Reporte les limites sur les champs (attributs min / max des flèches du champ nombre)
function appliquerBornes() {
  for (const question of questionsNumeriques()) {
    const { min, max } = bornesDe(question);
    document
      .querySelectorAll(`[data-champ$="-${question.colId}"] :is(input[type="number"], input.nombre-fr)`)
      .forEach((champNombre) => {
        if (min != null) champNombre.min = min;
        else champNombre.removeAttribute("min");
        if (max != null) champNombre.max = max;
        else champNombre.removeAttribute("max");
      });
  }
}
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

// Événements de la page traités ici ; appelé une fois par demarrage.js
function brancherEvenementsNombres() {
  new MutationObserver((muts) => {
    for (const mutation of muts)
      mutation.addedNodes.forEach((noeud) => noeud.nodeType === 1 && convertirNombres(noeud));
  }).observe(document.body, { childList: true, subtree: true });
  convertirNombres(document.body);
}
