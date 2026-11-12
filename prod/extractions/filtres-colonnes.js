/* =====================================================================
   Extractions — filtres de colonnes (moteur)
   ---------------------------------------------------------------------
   Définit : window.FiltresColonnes = { OPERATEURS, PORTEES, MESURES, COMPARAISONS, VERSIONS, COMBINAISONS,
             nouveau(), reprendre(f), actif(f), sansValeur(op), avecColonneMesure(mesure), libelle(f, nomColonne),
             evaluer(f, lignes, ctx), combiner(combinaison, formule, resultats), erreurFormule(formule, n) }.
   Utilise : rien ; le widget fournit le contexte ctx = { texte(col, r), elements(col, r), nombre(col, r),
             jour(r), estDate(col), estDerniere(r) }.

   Un filtre se lit en trois temps, sur les lignes d'un regroupement (un établissement) dans la période :
     1. versions prises en compte : toutes, ou seulement la dernière version de chaque dossier ;
     2. condition sur la ligne, comme dans le tableau de bord : colonne, opérateur, valeur (sans colonne : toutes
        les lignes) ;
     3. portée : la condition est vraie au moins une fois, jamais, à chaque fois, ou un comptage sur les lignes qui la
        vérifient (nombre de jours, nombre de valeurs distinctes, somme, moyenne, minimum, maximum d'une colonne)
        comparé à un seuil (« nombre de jours ≥ 4 »).
   Les filtres se combinent : tous (ET, « en cascade »), au moins un (OU, « autonomes »), ou formule « 1 ET (2 OU 3) ».
   Valeur « a ; b » : l'une ou l'autre (est égal à, est l'une des valeurs, contient), aucune (est différent de, ne
   contient pas). Reprise des filtres enregistrés avant la 2.55 (opérateurs contient, egal, exclut, rempli, vide).
   ===================================================================== */
(function () {
  "use strict";
  const OPERATEURS = [
    ["eq", "est égal à"], ["ne", "est différent de"], ["in", "est l'une des valeurs"], ["contains", "contient"], ["ncontains", "ne contient pas"],
    ["gt", ">"], ["ge", "≥"], ["lt", "<"], ["le", "≤"],
    ["empty", "est vide"], ["nempty", "n'est pas vide"], ["true", "est coché / Oui"], ["false", "n'est pas coché / Non"],
  ];
  const PORTEES = [["une", "au moins une fois"], ["jamais", "jamais"], ["toutes", "à chaque fois"], ["compter", "compter…"]];
  const MESURES = [["jours", "nombre de jours"], ["distinct", "nombre de valeurs distinctes de"], ["sum", "somme de"],
    ["avg", "moyenne de"], ["min", "minimum de"], ["max", "maximum de"]];
  const COMPARAISONS = [["ge", "≥"], ["gt", ">"], ["eq", "="], ["le", "≤"], ["lt", "<"]];
  const VERSIONS = [["toutes", "toutes les versions"], ["derniere", "dernière version de chaque dossier"]];
  const COMBINAISONS = [["cascade", "en cascade : tous les filtres (ET)"], ["autonome", "autonomes : au moins un filtre (OU)"], ["formule", "combinaison personnalisée…"]];
  const SANS_VALEUR = new Set(["empty", "nempty", "true", "false"]);

  const normaliser = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const libelleDe = (liste, id) => (liste.find(x => x[0] === id) || liste[0])[1];
  const sansValeur = op => SANS_VALEUR.has(op);
  const avecColonneMesure = m => m !== "jours";

  function nouveau() { return { col: "", op: "contains", val: "", portee: "une", mesure: "jours", colMesure: "", cmp: "ge", seuil: "", versions: "toutes" }; }
  // filtre enregistré (toute version) → filtre complet ; reprise des opérateurs d'avant la 2.55
  function reprendre(f) {
    const o = Object.assign(nouveau(), f || {});
    if (o.texte !== undefined && f.val === undefined) {
      const t = String(o.texte || "");
      const ancien = { contient: ["contains", "une"], egal: [t.includes(";") ? "in" : "eq", "une"], exclut: ["contains", "jamais"],
        rempli: ["nempty", "une"], vide: ["nempty", "jamais"] }[o.op];
      if (ancien) { o.op = ancien[0]; o.portee = ancien[1]; }
      o.val = t;
    }
    delete o.texte;
    if (!OPERATEURS.some(x => x[0] === o.op)) o.op = "contains";
    if (!PORTEES.some(x => x[0] === o.portee)) o.portee = "une";
    return o;
  }
  const conditionComplete = f => !!f.col && (sansValeur(f.op) || String(f.val ?? "").trim() !== "");
  const comptageComplet = f => f.portee === "compter" && String(f.seuil ?? "").trim() !== "" && Number.isFinite(Number(String(f.seuil).replace(",", ".")))
    && (!avecColonneMesure(f.mesure) || !!f.colMesure);
  // filtre pris en compte : une condition complète, ou un comptage complet (qui peut porter sur toutes les lignes)
  const actif = f => f.portee === "compter" ? comptageComplet(f) && (!f.col || conditionComplete(f)) : conditionComplete(f);

  function libelle(f, nom) {
    const cond = f.col ? `« ${nom(f.col)} » ${libelleDe(OPERATEURS, f.op)}${sansValeur(f.op) ? "" : ` « ${String(f.val).trim()} »`}` : "toutes les lignes";
    const portee = f.portee === "compter"
      ? `${libelleDe(MESURES, f.mesure)}${avecColonneMesure(f.mesure) ? ` « ${nom(f.colMesure)} »` : ""} ${libelleDe(COMPARAISONS, f.cmp)} ${f.seuil}`
      : libelleDe(PORTEES, f.portee);
    return `${cond}, ${portee}${f.versions === "derniere" ? " (dernière version de chaque dossier)" : ""}`;
  }

  // ---------- condition sur une ligne (même lecture que le tableau de bord) ----------
  function nombreDe(s) { const n = Number(String(s).replace(/\s/g, "").replace(",", ".")); return String(s).trim() !== "" && Number.isFinite(n) ? n : NaN; }
  function comparer(a, b) {   // nombres si possible, dates ISO ou texte sinon
    const x = typeof a === "number" ? a : nombreDe(a), y = nombreDe(b);
    if (!isNaN(x) && !isNaN(y)) return x - y;
    return normaliser(a).localeCompare(normaliser(b), "fr");
  }
  function verifieLigne(f, r, ctx) {
    if (!f.col) return true;
    const elements = ctx.elements(f.col, r).map(normaliser), texte = normaliser(ctx.texte(f.col, r));
    const vide = !texte && !elements.length;
    // « a ; b » : l'une ou l'autre valeur (est égal à, contient) ; aucune des deux (est différent de, ne contient pas)
    const alt = String(f.val ?? "").split(";").map(normaliser).filter(Boolean);
    const egal = alt.some(a => elements.includes(a) || texte === a), contient = alt.some(a => texte.includes(a));
    switch (f.op) {
      case "empty": return vide;
      case "nempty": return !vide;
      case "true": case "false": { const t = ["oui", "vrai", "true", "yes", "x", "1"].includes(texte) || ctx.nombre(f.col, r) > 0; return f.op === "true" ? t : !t; }
      case "eq": case "in": return egal;
      case "ne": return !egal;
      case "contains": return contient;
      case "ncontains": return !contient;
      default: {      // gt ge lt le : nombre, date (jour de la colonne) ou texte
        if (vide) return false;
        const a = ctx.estDate(f.col) ? ctx.jour(r, f.col) : (isNaN(ctx.nombre(f.col, r)) ? ctx.texte(f.col, r) : ctx.nombre(f.col, r));
        const d = comparer(a, f.val);
        return f.op === "gt" ? d > 0 : f.op === "ge" ? d >= 0 : f.op === "lt" ? d < 0 : d <= 0;
      }
    }
  }

  // ---------- filtre sur un regroupement : { ok, valeur } (valeur : résultat du comptage, sinon null) ----------
  function evaluer(f, lignes, ctx) {
    const prises = f.versions === "derniere" ? lignes.filter(r => ctx.estDerniere(r)) : lignes;
    const vraies = prises.filter(r => verifieLigne(f, r, ctx));
    if (f.portee === "jamais") return { ok: !vraies.length, valeur: null };
    if (f.portee === "toutes") return { ok: prises.length > 0 && vraies.length === prises.length, valeur: null };
    if (f.portee !== "compter") return { ok: vraies.length > 0, valeur: null };
    let valeur;
    if (f.mesure === "jours") valeur = new Set(vraies.map(r => ctx.jour(r)).filter(Boolean)).size;
    else if (f.mesure === "distinct") { const s = new Set(); vraies.forEach(r => ctx.elements(f.colMesure, r).forEach(e => { if (String(e).trim()) s.add(normaliser(e)); })); valeur = s.size; }
    else {
      const n = vraies.map(r => ctx.nombre(f.colMesure, r)).filter(x => !isNaN(x));
      valeur = f.mesure === "sum" ? n.reduce((a, b) => a + b, 0) : !n.length ? NaN
        : f.mesure === "avg" ? n.reduce((a, b) => a + b, 0) / n.length : f.mesure === "min" ? Math.min(...n) : Math.max(...n);
    }
    const s = nombreDe(f.seuil), d = valeur - s;
    const ok = !isNaN(valeur) && (f.cmp === "gt" ? d > 0 : f.cmp === "eq" ? Math.abs(d) < 1e-9 : f.cmp === "le" ? d <= 0 : f.cmp === "lt" ? d < 0 : d >= 0);
    return { ok, valeur };
  }

  // ---------- combinaison : formule « 1 ET (2 OU NON 3) » (numéros des filtres actifs, F1 = 1) ----------
  function analyser(src, n) {
    const jetons = String(src || "").toUpperCase().replace(/\bF(\d+)/g, "$1").match(/\d+|\(|\)|ET|AND|&&?|OU|OR|\|\|?|NON|NOT|!|\S/g) || [];
    let i = 0;
    const voir = () => jetons[i], prendre = () => jetons[i++];
    const estEt = t => ["ET", "AND", "&", "&&"].includes(t), estOu = t => ["OU", "OR", "|", "||"].includes(t), estNon = t => ["NON", "NOT", "!"].includes(t);
    function primaire() {
      const t = prendre();
      if (t === undefined) throw new Error("formule incomplète");
      if (t === "(") { const e = ou(); if (prendre() !== ")") throw new Error("parenthèse non fermée"); return e; }
      if (estNon(t)) return { non: primaire() };
      if (/^\d+$/.test(t)) { const k = +t; if (k < 1 || k > n) throw new Error(`le filtre ${k} n'existe pas`); return { k }; }
      throw new Error(`« ${t} » inattendu`);
    }
    function et() { let a = primaire(); while (estEt(voir())) { prendre(); a = { et: [a, primaire()] }; } return a; }
    function ou() { let a = et(); while (estOu(voir())) { prendre(); a = { ou: [a, et()] }; } return a; }
    if (!jetons.length) throw new Error("formule vide");
    const arbre = ou();
    if (i < jetons.length) throw new Error(`« ${jetons[i]} » inattendu`);
    return arbre;
  }
  function erreurFormule(src, n) { try { analyser(src, n); return ""; } catch (e) { return e.message; } }
  // resultats : tableau de booléens, rangé par numéro de filtre (resultats[k - 1] pour Fk ; undefined = filtre inactif)
  function combiner(combinaison, formule, resultats) {
    const actifs = resultats.filter(x => x !== undefined);
    if (!actifs.length) return true;
    if (combinaison === "autonome") return actifs.some(Boolean);
    if (combinaison === "formule" && !erreurFormule(formule, resultats.length)) {
      const calcul = a => a.non ? !calcul(a.non) : a.et ? calcul(a.et[0]) && calcul(a.et[1]) : a.ou ? calcul(a.ou[0]) || calcul(a.ou[1])
        : resultats[a.k - 1] === undefined ? true : resultats[a.k - 1];   // filtre incomplet : sans effet
      return calcul(analyser(formule, resultats.length));
    }
    return actifs.every(Boolean);   // cascade, ou formule à corriger (en attendant : tous les filtres)
  }

  window.FiltresColonnes = { OPERATEURS, PORTEES, MESURES, COMPARAISONS, VERSIONS, COMBINAISONS,
    nouveau, reprendre, actif, sansValeur, avecColonneMesure, libelle, evaluer, combiner, erreurFormule };
})();
