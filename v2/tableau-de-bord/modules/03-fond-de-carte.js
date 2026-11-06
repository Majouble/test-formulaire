/* PRISME — tableau de bord, module 03/15 : Fond de carte : départements et académies.
   Publie sur tableauDeBord : geoT, numOf, UNKNOWN, rowHead, rowDim, GEO_T, GEO_GRAINS.
   Utilise (tableauDeBord.) : EMPTY, labelOf.
   tableauDeBord et l'ordre des modules : voir tableau-de-bord/tableau.js. */

TableauDeBord.modules["fond-de-carte"] = function (tableauDeBord) {
  const { DEP_ACA, depKey, acaKey, depFromUai } = window.Geo;
  // fonctions de ce module utilisées ailleurs : disponibles dès maintenant (déclarations remontées)
  Object.assign(tableauDeBord, { geoT, numOf });
  // =============================================================================
  // Fond de carte embarqué : départements et académies (Lambert-93 ; Outre-mer et petite couronne en encarts)
  // =============================================================================
  // fond, noms et correspondances : socle (commun/geo-fond.js et commun/geo.js)

  const UNKNOWN = "(non reconnu)";
  // libellé des lignes d'un tableau croisé : « Département », « Académie » quand la valeur est rattachée
  const GEO_HEAD = {
    dep_uai: ["Département", "d'après l'UAI"],
    dep_norm: ["Département", ""],
    aca_uai: ["Académie", "d'après l'UAI"],
    aca_dep: ["Académie", "d'après le département"],
    aca_norm: ["Académie", ""],
  };
  const rowHead = (col, grain) => (GEO_HEAD[grain] ? GEO_HEAD[grain][0] : tableauDeBord.labelOf(col));
  const rowDim = (col, grain) =>
    GEO_HEAD[grain]
      ? `${GEO_HEAD[grain][0].toLowerCase()}${GEO_HEAD[grain][1] ? " (" + GEO_HEAD[grain][1] + " « " + tableauDeBord.labelOf(col) + " »)" : ""}`
      : tableauDeBord.labelOf(col);
  const GEO_T = {
    dep_uai: "dep_uai",
    aca_uai: "aca_uai",
    aca_dep: "aca_dep",
    dep_norm: "dep_norm",
    aca_norm: "aca_norm",
  };
  const GEO_GRAINS = [
    ["", "valeurs telles quelles"],
    ["dep_norm", "département (code ou nom)"],
    ["aca_norm", "académie (nom)"],
    ["dep_uai", "département déduit de l'UAI"],
    ["aca_uai", "académie déduite de l'UAI"],
    ["aca_dep", "académie déduite du département"],
  ];
  function geoT(tf, t) {
    if (t === null || t === undefined || t === "") return tableauDeBord.EMPTY;
    const k =
      tf === "dep_uai"
        ? depFromUai(t)
        : tf === "aca_uai"
          ? DEP_ACA[depFromUai(t)]
          : tf === "aca_dep"
            ? DEP_ACA[depKey(t)]
            : tf === "dep_norm"
              ? depKey(t)
              : acaKey(t);
    return k || UNKNOWN;
  }

  function numOf(v) {
    if (typeof v === "number") return v;
    if (typeof v === "boolean") return v ? 1 : 0;
    if (v === null || v === undefined || v === "") return NaN;
    const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
    return n;
  }
  // constantes de ce module utilisées ailleurs
  Object.assign(tableauDeBord, { UNKNOWN, rowHead, rowDim, GEO_T, GEO_GRAINS });
};
