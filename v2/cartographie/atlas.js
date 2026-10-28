"use strict";
/* ---------------------------------------------------------------------------
   Atlas QGIS (format « Atlas QGIS par académie » du widget de cartographie)

   Tout ce qui décide du contenu est réglé dans un PROFIL, enregistré dans le document (table Config, clé « atlas ») :
   en-tête, tableau (colonnes, en-têtes, tri, nombre de lignes et critère), regroupement par établissement
   (qualification principale, valeurs exclues, jours de mobilisation), carte (fonds IGN, voile), et modèle QGIS.

   Modèle QGIS : par défaut atlas/atlas.qgs (fabriqué par atlas/construire_atlas.py) ; un profil peut porter son propre
   modèle (projet retouché dans QGIS puis déposé ici), enregistré en pièce jointe dans Config (clé « atlas_modele:<profil> »,
   colonne Fichier). Le widget n'y change que les variables (titre, date, service, nombre de lignes), le tableau des
   établissements s'il est réglé ici, et la visibilité des fonds IGN et du voile.

   Fichiers produits : signalements.geojson (un point par établissement, champs calculés + colonnes de la table
   regroupées), signalements_detail.geojson (un point par signalement, colonnes de la table telles quelles),
   academies.geojson, departements.geojson (Lambert-93), atlas.qgs, LISEZMOI.txt.

   Ce fichier s'appuie sur les variables du script principal (filteredRecords, socle, dvOnly, lastMappings, colTypes,
   metaT, metaC, mainTableId, toNumber, $…) : il est chargé après lui.
   --------------------------------------------------------------------------- */

const CLE_ATLAS = "atlas", PREFIXE_MODELE = "atlas_modele:", STOCKAGE_LOCAL = "socle-v2-atlas";
const SERVICE_DEFAUT = "HFDS/\nCentre ministériel de crise";

// Champs calculés par le widget pour chaque établissement : [nom, libellé, nature]
const CHAMPS_ATLAS = [
  ["Etablissement", "Établissement (nom court)", "texte"], ["Etiquette", "Étiquette (sigle + nom)", "texte"], ["UAI", "UAI", "texte"],
  ["Type_libelle", "Type (court)", "texte"], ["Categorie", "Catégorie (École, Collège, Lycée, Autre)", "texte"],
  ["Type_etablissement", "Type (référentiel)", "texte"], ["Nature", "Nature (référentiel)", "texte"],
  ["Commune", "Commune", "texte"], ["DSDEN", "DSDEN", "texte"], ["Academie", "Académie", "texte"],
  ["REP", "REP/REP+", "texte"], ["Internat", "Internat", "texte"],
  ["Region_academique", "Région académique", "texte"], ["Sigle", "Sigle de l'établissement", "texte"],
  ["Site", "Site (point par site)", "texte"], ["Nb_sites", "Nombre de sites touchés", "nombre"], ["Sites", "Sites touchés", "texte"],
  ["Nb_signalements", "Nombre de signalements", "nombre"], ["Nb_jours", "Jours concernés (durée)", "nombre"],
  ["Qualification_principale", "Qualification principale", "texte"], ["Qualifications", "Qualifications (toutes)", "texte"],
  ["Derniere_date", "Date du dernier signalement", "date"], ["Rang", "Rang dans la page", "nombre"],
  ["Jour", "Jour (point par jour ou par signalement)", "date"],
  ["Marque", "Marque (sous-table)", "texte"], ["Marque_nb", "Lignes de la sous-table", "nombre"], ["Marque_valeurs", "Valeurs de la sous-table", "texte"],
];
const AGREGATS = { liste: "valeurs distinctes", max: "maximum", min: "minimum", somme: "somme", derniere: "valeur la plus récente", nb: "nombre de lignes renseignées" };

/* Couleurs et formes des points (profil.symbologie) : une colonne au choix (champ calculé, colonne de la table ou du
   référentiel), les valeurs gardées, et pour chacune un libellé de légende, une couleur et une forme (marqueurs simples
   de QGIS). Le champ « Categorie » de chaque point reçoit le libellé ; le widget réécrit la symbologie catégorisée du
   modèle QGIS en conséquence. Sans réglage : catégories du scolaire (École, Collège, Lycée, Autre). */
const FORMES = { circle: "cercle", square: "carré", triangle: "triangle", diamond: "losange", star: "étoile", pentagon: "pentagone", hexagon: "hexagone", cross_fill: "croix" };
const PALETTE_SYMBO = ["#000091", "#e1000f", "#18753c", "#b34000", "#6a6af4", "#a558a0", "#009081", "#c3992a", "#d1336a", "#666666"];
const SYMBO_SCOLAIRE = { champ: "Categorie", titre: "Établissements signalés", items: [
  { valeur: "École", libelle: "Écoles", couleur: "#f2c12e", forme: "circle", garder: true }, { valeur: "Collège", libelle: "Collèges", couleur: "#d1336a", forme: "circle", garder: true },
  { valeur: "Lycée", libelle: "Lycées", couleur: "#5f59c6", forme: "circle", garder: true }, { valeur: "Autre", libelle: "Autres", couleur: "#4cbf62", forme: "circle", garder: true }],
  autres: { garder: true, libelle: "Autres", couleur: "#4cbf62", forme: "circle" } };
// réglage des couleurs et formes d'un profil (profils antérieurs : catégories du scolaire, filtre des catégories repris)
function symbologieDe(P) {
  if (P.symbologie && P.symbologie.champ) return { titre: "", items: [], ...P.symbologie, autres: { garder: true, libelle: "Autres", couleur: "#999999", forme: "circle", ...(P.symbologie.autres || {}) } };
  const s = copie(SYMBO_SCOLAIRE), cats = ((P.filtre || {}).categories) || [];
  if (cats.length) { s.items.forEach(it => { it.garder = cats.includes(it.valeur); }); s.autres.garder = cats.includes("Autre"); }
  return s;
}
// Régions académiques : académies de chaque région (outre-mer : une académie par région)
const REGIONS_ACADEMIQUES = {
  "Auvergne-Rhône-Alpes": ["Clermont-Ferrand", "Grenoble", "Lyon"], "Bourgogne-Franche-Comté": ["Besançon", "Dijon"], "Bretagne": ["Rennes"],
  "Centre-Val de Loire": ["Orléans-Tours"], "Corse": ["Corse"], "Grand Est": ["Nancy-Metz", "Reims", "Strasbourg"], "Hauts-de-France": ["Amiens", "Lille"],
  "Île-de-France": ["Créteil", "Paris", "Versailles"], "Normandie": ["Normandie"], "Nouvelle-Aquitaine": ["Bordeaux", "Limoges", "Poitiers"],
  "Occitanie": ["Montpellier", "Toulouse"], "Pays de la Loire": ["Nantes"], "Provence-Alpes-Côte d'Azur": ["Aix-Marseille", "Nice"],
  "Guadeloupe": ["Guadeloupe"], "Martinique": ["Martinique"], "Guyane": ["Guyane"], "La Réunion": ["La Réunion"], "Mayotte": ["Mayotte"] };
const regionDe = aca => Object.keys(REGIONS_ACADEMIQUES).find(r => REGIONS_ACADEMIQUES[r].includes(aca)) || "";

const PROFIL_DEFAUT = {
  titre: "", service: SERVICE_DEFAUT,
  lignes: 22, critere: "signalements", tri: "geo", tableauWidget: true,
  colonnes: [
    { champ: "DSDEN", titre: "DSDEN" }, { champ: "Commune", titre: "Commune" }, { champ: "UAI", titre: "UAI" },
    { champ: "Type_libelle", titre: "Type" }, { champ: "Etablissement", titre: "Établissement" },
    { champ: "Qualification_principale", titre: "Qualification" }, { champ: "Nb_jours", titre: "Jours de mobilisation" },
  ],
  principale: "frequente", exclues: ["RAS"], exclureTout: false, jours: "auto",
  fondsIgn: true, voile: true,
  resolution: 150,   // dpi des fonds (images) dans le PDF ; les textes restent du texte
  encarts: true, encartsMax: 3, encartsMin: 4, encartsEcart: 6,
  etiquettes: 5, etiquettesPlacees: true, etiquettesVoisins: true,
  decoupage: "auto", seuilIllisible: 20,   // pages : par académie, par département, ou automatique (académies illisibles découpées)
  // établissements retenus : catégories (vide = toutes), qualifications (vide = toutes ; s'applique aux signalements),
  // seuils sur le nombre de signalements et les jours de mobilisation
  filtre: { categories: [], qualifs: [], minSignalements: 1, minJours: 0 },
  // marques : losange accolé au point pour les établissements ayant des lignes dans une sous-table (question tableau),
  // coloré selon une colonne de cette sous-table ; « inclure » retient aussi ces établissements hors du filtre de qualification
  marques: { table: "", colonne: "", titre: "", inclure: true },
  // un point par établissement (défaut), par établissement et par jour, ou par signalement ; une page par jour en option
  regroupement: "etablissement", pagesParJour: true,
  // point par site : sous-table des sites (question tableau dont une colonne renvoie vers un référentiel des sites)
  sites: { table: "" },
  symbologie: null,   // null : catégories du scolaire (voir symbologieDe)
};
/* Réglages prêts à l'emploi : appliqués au profil affiché (à enregistrer ensuite sous le nom voulu). « symbo » : colonne
   de la symbologie ; les valeurs sont proposées à partir des données (couleurs de Grist pour une liste de choix). */
const PREREGLAGES = {
  scolaire: { libelle: "Scolaire : établissements par académie", aide: "Le réglage d'origine : écoles, collèges et lycées, une page par académie.",
    profil: { regroupement: "etablissement", decoupage: "auto", symbologie: null, critere: "signalements", tri: "geo", lignes: 22,
      colonnes: PROFIL_DEFAUT.colonnes } },
  sup_sites: { libelle: "Supérieur : un point par site, par région académique", aide: "Un point par site touché (référentiel des sites), couleur selon la qualification du site, une page par région académique.",
    profil: { regroupement: "site", decoupage: "region", symbo: "Qualification_principale", symboTitre: "Sites signalés", critere: "signalements", tri: "rang", lignes: 22,
      colonnes: [{ champ: "Academie", titre: "Académie" }, { champ: "Sigle", titre: "Établissement" }, { champ: "Site", titre: "Site" }, { champ: "Commune", titre: "Commune" },
        { champ: "Qualification_principale", titre: "Qualification" }, { champ: "Nb_signalements", titre: "Signal." }, { champ: "Derniere_date", titre: "Dernier signalement" }] } },
  sup_etab: { libelle: "Supérieur : un point par établissement, par région académique", aide: "Un point par établissement, couleur selon son type (référentiel), nombre de sites touchés.",
    profil: { regroupement: "etablissement", decoupage: "region", symbo: "Type_etablissement", symboTitre: "Établissements signalés", critere: "signalements", tri: "rang", lignes: 22,
      colonnes: [{ champ: "Academie", titre: "Académie" }, { champ: "Commune", titre: "Commune" }, { champ: "Etablissement", titre: "Établissement" }, { champ: "Nb_sites", titre: "Sites" },
        { champ: "Qualification_principale", titre: "Qualification" }, { champ: "Nb_signalements", titre: "Signal." }, { champ: "Derniere_date", titre: "Dernier signalement" }] } },
  tous_risques: { libelle: "Tous risques et menaces : France entière", aide: "Une page France entière (métropole, outre-mer en encarts), couleur selon la qualification ; à adapter à la colonne qui décrit le risque ou la menace.",
    profil: { regroupement: "etablissement", decoupage: "france", symbo: "Qualification_principale", symboTitre: "Points signalés", critere: "recent", tri: "rang", lignes: 25, encartsMax: 3,
      colonnes: [{ champ: "Region_academique", titre: "Région académique" }, { champ: "Commune", titre: "Commune" }, { champ: "Etiquette", titre: "Établissement" },
        { champ: "Qualification_principale", titre: "Qualification" }, { champ: "Nb_signalements", titre: "Signal." }, { champ: "Nb_jours", titre: "Jours" }, { champ: "Derniere_date", titre: "Dernier signalement" }] } },
};
const copie = o => JSON.parse(JSON.stringify(o));

/* ---------- utilitaires ---------- */
let zipLoading = null;
function loadJSZip() {
  if (window.JSZip) return Promise.resolve(window.JSZip);
  if (!zipLoading) zipLoading = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    s.onload = () => window.JSZip ? res(window.JSZip) : rej(new Error("bibliothèque absente"));
    s.onerror = () => { zipLoading = null; rej(new Error("impossible de charger la bibliothèque ZIP (réseau bloqué ?)")); };
    document.head.appendChild(s);
  });
  return zipLoading;
}
const sansAccents = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const xmlTexte = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const htmlTexte = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const texteCellule = v => Array.isArray(v) ? v.filter(x => x !== "L").join(", ") : v == null ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
// date en secondes (Grist), objet Date ou texte ISO → secondes
const secondesDe = d => typeof d === "number" ? d : d instanceof Date ? d.getTime() / 1000 : typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d) ? Date.parse(d) / 1000 : null;
const jourDe = d => { const t = secondesDe(d); return t ? new Date(t * 1000).toISOString().slice(0, 10) : ""; };

// sigle (EE, EM, CLG, LPO, LGT, LP…) et catégorie (couleur du point) d'après la nature ou le type de l'établissement
function natureCourte(nature, type) {
  const n = sansAccents(`${nature || ""} ${type || ""}`).toUpperCase();
  const court = /MATERNELLE/.test(n) ? "EM" : /ECOLE|PRIMAIRE|ELEMENTAIRE/.test(n) ? "EE" : /COLLEGE/.test(n) ? "CLG" : /EREA/.test(n) ? "EREA"
    : /POLYVALENT/.test(n) ? "LPO" : /PROFESSIONNEL/.test(n) ? "LP" : /GENERAL ET TECHNO|GENERAL|LGT/.test(n) ? "LGT" : /TECHNO/.test(n) ? "LT" : /LYCEE/.test(n) ? "LYC" : "";
  const categorie = ["EE", "EM"].includes(court) ? "École" : court === "CLG" ? "Collège" : /^L|EREA/.test(court) ? "Lycée" : "Autre";
  const libelle = { EE: "École (élém.)", EM: "École (mat.)", CLG: "Collège", LPO: "Lycée (LPO)", LGT: "Lycée (LGT)", LP: "Lycée (LP)", LT: "Lycée (LT)", LYC: "Lycée", EREA: "EREA" }[court] || String(type || nature || "");
  return { court, categorie, libelle };
}
// « Collège Jules Ferry » → « JULES FERRY » (le sigle dit déjà le type)
function nomCourt(nom) {
  return sansAccents(String(nom || "").replace(/^\s*(ecole|école|college|collège|lycée|lycee|groupe scolaire|erea)(\s+(élémentaire|elementaire|maternelle|primaire|polyvalent|professionnel|général|general|technologique|et|des métiers|d'application|publique?|privée?))*\s+/i, "")).toUpperCase().trim();
}

/* ---------- colonnes de la table ---------- */
// Colonnes propres à la table de réponses (sans celles recopiées du référentiel ni les colonnes techniques)
function colonnesTable() {
  const ajoutees = new Set((socle && socle.ajoutees) || []), cles = new Set();
  (lastRecords || []).forEach(r => Object.keys(r).forEach(k => cles.add(k)));
  const libelles = {};
  if (metaT && metaC && mainTableId) {
    const t = metaT.id[metaT.tableId.indexOf(mainTableId)];
    metaC.id.forEach((_, i) => { if (metaC.parentId[i] === t) libelles[metaC.colId[i]] = metaC.label[i] || metaC.colId[i]; });
  }
  return [...cles].filter(k => k !== "id" && k !== "manualSort" && !k.startsWith("gristHelper_") && !ajoutees.has(k))
    .map(k => ({ col: k, libelle: libelles[k] || k, type: colTypes[k] || "" }));
}
// colonnes du référentiel des établissements recopiées sur chaque réponse (Etab_…) : proposées pour le tableau et les couleurs
function colonnesRef() {
  const tech = new Set([socle && socle.auto && socle.auto.Latitude, socle && socle.auto && socle.auto.Longitude].filter(Boolean));
  return ((socle && socle.ajoutees) || []).filter(c => !tech.has(c) && !/^(manualSort|gristHelper_|uuid$|lien$)/i.test(c)).map(col => ({ col, libelle: libelleRef(col), type: colTypes[col] || "" }));
}
function libelleRef(col) { return String(col).replace(/^Etab_/, "").replace(/_+/g, " ").trim(); }
// nom du champ exporté pour une colonne de la table (préfixé s'il porte le nom d'un champ calculé)
const nomExport = col => CHAMPS_ATLAS.some(c => c[0] === col) || ["Date", "Qualification", "Dossier", "grist_id"].includes(col) ? `Table_${col}` : col;
const agregatParDefaut = type => /^(Int|Numeric)/.test(type) ? "max" : /^Date/.test(type) ? "derniere" : type === "Bool" ? "nb" : "liste";
// choix d'une colonne Choice / ChoiceList, dans l'ordre réglé dans Grist
function choixColonne(col) {
  if (!col || !metaT || !metaC || !mainTableId) return [];
  const t = metaT.id[metaT.tableId.indexOf(mainTableId)];
  const i = metaC.id.findIndex((_, k) => metaC.parentId[k] === t && metaC.colId[k] === col);
  try { return i < 0 ? [] : (JSON.parse(metaC.widgetOptions[i] || "{}").choices || []); } catch (_) { return []; }
}

/* ---------- sous-tables (questions tableau) : tables dont une colonne référence la table des réponses ---------- */
let sousTablesAtlas = [];
// référentiels des sites (table visée par une colonne Référence d'une sous-table, avec Latitude / Longitude) : table → { idx, nom(j), lat(j), lon(j), commune(j) }
const refSitesAtlas = new Map();
const normAtlas = t => sansAccents(t).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
async function chargerSousTables() {
  try {
    if (!mainTableId || !grist.docApi) return (sousTablesAtlas = []);
    await loadMeta(true);
    const parId = new Map(metaT.id.map((id, i) => [id, metaT.tableId[i]])), res = new Map();
    metaC.id.forEach((_, i) => {
      const t = parId.get(metaC.parentId[i]);
      // lien vers le dossier : la colonne Dossier de préférence (Version, si elle existe, désigne la version)
      if (t && t !== mainTableId && !t.startsWith("_grist") && metaC.type[i] === `Ref:${mainTableId}` && metaC.colId[i] !== "Version" && (!res.has(t) || metaC.colId[i] === "Dossier")) res.set(t, metaC.colId[i]);
    });
    sousTablesAtlas = [];
    for (const [table, ref] of res) {
      const tid = metaT.id[metaT.tableId.indexOf(table)];
      const colonnes = metaC.id.map((_, i) => i).filter(i => metaC.parentId[i] === tid && !["id", "manualSort", ref, "Ligne_id", "Ordre", "Version", "Mouvement", "Etat_actuel", "Date_version"].includes(metaC.colId[i]) && !metaC.colId[i].startsWith("gristHelper_"))
        .map(i => { let o = {}; try { o = JSON.parse(metaC.widgetOptions[i] || "{}"); } catch (_) { o = {}; }
          return { col: metaC.colId[i], libelle: metaC.label[i] || metaC.colId[i], type: metaC.type[i], choix: o.choices || [], couleurs: Object.fromEntries(Object.entries(o.choiceOptions || {}).filter(([, x]) => x && x.fillColor).map(([v, x]) => [v, x.fillColor])) }; });
      let data = null; try { data = await grist.docApi.fetchTable(table); } catch (_) { data = null; }
      if (!data) continue;
      // tableau des sites : colonne vers un référentiel des sites (table avec Latitude / Longitude), nom libre, qualification du site
      const colsDe = t2 => { const id2 = metaT.id[metaT.tableId.indexOf(t2)]; return metaC.id.map((_, i) => i).filter(i => metaC.parentId[i] === id2).map(i => ({ col: metaC.colId[i], type: metaC.type[i] })); };
      const coordsDe = t2 => { const cs = colsDe(t2), f = re => (cs.find(c => re.test(c.col)) || {}).col;
        return { lat: f(/^lat(itude)?$/i), lon: f(/^(lon|lng|longitude)$/i), nom: f(/^(nom|libelle|denomination|intitule)$/i) || (cs.find(c => /^Text/.test(c.type) && !/^(site_?id|uai|code)/i.test(c.col)) || {}).col, commune: f(/^(commune|ville)$/i) }; };
      const siteCol = colonnes.find(c => /^Ref:/.test(c.type) && c.type !== `Ref:${mainTableId}` && (() => { const k = coordsDe(c.type.slice(4)); return k.lat && k.lon; })());
      const siteRef = siteCol ? { col: siteCol.col, table: siteCol.type.slice(4) } : null;
      if (siteRef && !refSitesAtlas.has(siteRef.table)) {
        try { const t2 = await grist.docApi.fetchTable(siteRef.table), k = coordsDe(siteRef.table), v = (c, j) => c && t2[c] ? t2[c][j] : null;
          refSitesAtlas.set(siteRef.table, { idx: new Map(t2.id.map((id, j) => [id, j])), nom: j => texteCellule(v(k.nom, j)), lat: j => toNumber(v(k.lat, j)), lon: j => toNumber(v(k.lon, j)), commune: j => texteCellule(v(k.commune, j)) }); }
        catch (_) { /* référentiel des sites illisible : sites placés sur leur établissement */ }
      }
      const libre = (colonnes.find(c => /^Text/.test(c.type) && /libre|hors_?ref/i.test(c.col)) || (siteRef ? null : colonnes.find(c => /^Text/.test(c.type) && /(^|_)(nom_du_)?site/i.test(c.col))) || {}).col || null;
      const qualif = (colonnes.find(c => /^Choice/.test(c.type) && /qualif/i.test(c.col)) || {}).col || null;
      sousTablesAtlas.push({ table, ref, colonnes, data, siteRef, libre, qualif, estSites: !!(siteRef || libre) });
    }
  } catch (_) { sousTablesAtlas = []; }
  return sousTablesAtlas;
}

/* ---------- lieu des lignes d'une sous-table ----------
   Une ligne peut citer son propre établissement : colonne de référence vers le référentiel (la plus sûre), colonne UAI
   (retrouvée dans le référentiel), ou colonnes Latitude / Longitude. Renvoie i → { lat, lon, uai, nom, commune, type,
   nature, aca, dep } ou null (la ligne vaut alors pour l'établissement de la réponse) ; .mode décrit la méthode. */
function localisateurSous(ST) {
  const aucun = Object.assign(() => null, { mode: "" });
  if (!ST) return aucun;
  const cols = Object.keys(ST.data), typeDe = c => (ST.colonnes.find(x => x.col === c) || {}).type || "";
  const ref = socle && socle.refData ? socle.refData : null, R = (socle && socle.refRoles) || {};
  const depuisRef = j => {
    if (j === undefined || !ref || !R.Latitude || !R.Longitude) return null;
    const lat = toNumber(ref[R.Latitude][j]), lon = toNumber(ref[R.Longitude][j]); if (isNaN(lat) || isNaN(lon)) return null;
    const v = k => R[k] ? texteCellule(ref[R[k]][j]) : "";
    return { lat, lon, uai: v("UAI").trim(), nom: v("Nom"), commune: v("Commune"), type: v("Type"), nature: v("Libelle_nature"), aca: v("Academie"), dep: v("Departement") };
  };
  // 1. référence vers le référentiel
  const colRef = ref && socle.referentiel ? cols.find(c => typeDe(c) === `Ref:${socle.referentiel}`) : null;
  if (colRef) {
    const idx = new Map(ref.id.map((id, j) => [id, j]));
    return Object.assign(i => { const v = ST.data[colRef][i], id = typeof v === "number" ? v : refIdOf(v); return id ? depuisRef(idx.get(id)) : null; },
      { mode: `colonne « ${colRef} » (référence au référentiel)` });
  }
  // 2. UAI retrouvée dans le référentiel
  const colUai = cols.find(c => /^(etab_)?(code_)?uai$/i.test(c));
  if (colUai && ref && R.UAI) {
    const parUai = new Map(ref.id.map((_, j) => [texteCellule(ref[R.UAI][j]).trim().toUpperCase(), j]));
    return Object.assign(i => depuisRef(parUai.get(texteCellule(ST.data[colUai][i]).trim().toUpperCase())), { mode: `colonne « ${colUai} » (UAI)` });
  }
  // 3. coordonnées dans la sous-table
  const colLat = cols.find(c => /^(etab_)?lat(itude)?$/i.test(c)), colLon = cols.find(c => /^(etab_)?(lon|lng|longitude)$/i.test(c));
  if (colLat && colLon) {
    const colNom = cols.find(c => /^(etab_)?(nom|etablissement|nom_etablissement)$/i.test(c));
    return Object.assign(i => { const lat = toNumber(ST.data[colLat][i]), lon = toNumber(ST.data[colLon][i]); if (isNaN(lat) || isNaN(lon)) return null;
      return { lat, lon, uai: colUai ? texteCellule(ST.data[colUai][i]).trim() : "", nom: colNom ? texteCellule(ST.data[colNom][i]) : "" }; },
      { mode: `colonnes « ${colLat} » / « ${colLon} »` });
  }
  return aucun;
}

/* ---------- lignes d'une sous-table rattachées à chaque réponse ----------
   Sous-table historisée (colonne Version) : chaque version de la réponse a sa copie des lignes (retraits exclus) ;
   lignes sans version (antérieures à l'historique) : rattachées au dossier, comme une sous-table simple.
   uniques : une ligne du tableau vue dans plusieurs versions ne compte qu'une fois (sa version la plus récente). */
function indexSous(ST, R) {
  const lignesDe = new Map(), lignesDeVersion = new Map(), avecVersions = !!(ST && ST.data.Version);
  if (ST) ST.data.id.forEach((id, i) => {
    if (avecVersions && ST.data.Mouvement && ST.data.Mouvement[i] === "Retrait") return;
    const ver = avecVersions ? refIdOf(ST.data.Version[i]) || (typeof ST.data.Version[i] === "number" ? ST.data.Version[i] : 0) : 0;
    if (ver) { if (!lignesDeVersion.has(ver)) lignesDeVersion.set(ver, []); lignesDeVersion.get(ver).push(i); return; }
    const v = ST.data[ST.ref][i], k = typeof v === "number" ? v : refIdOf(v); if (k) { if (!lignesDe.has(k)) lignesDe.set(k, []); lignesDe.get(k).push(i); } });
  const parDossier = r => (R.Dossier && refIdOf(r[R.Dossier])) || r.id;
  const sousDe = r => !ST ? [] : lignesDeVersion.has(r.id) ? lignesDeVersion.get(r.id)
    : [...new Set([...(lignesDe.get(r.id) || []), ...(parDossier(r) !== r.id ? (lignesDe.get(parDossier(r)) || []) : [])])];
  const uniques = set => { if (!avecVersions || !ST.data.Ligne_id) return [...set];
    const m = new Map(); for (const i of set) { const k = ST.data.Ligne_id[i] || `#${i}`, p = m.get(k);
      if (p === undefined || (refIdOf(ST.data.Version[i]) || 0) > (refIdOf(ST.data.Version[p]) || 0)) m.set(k, i); }
    return [...m.values()]; };
  return { sousDe, uniques, avecVersions };
}
// site d'une ligne de la sous-table des sites : site du référentiel (nom, coordonnées), ancien nom resté en texte, ou nom libre
function siteDeLigne(SS, i) {
  if (!SS) return null;
  const v = SS.siteRef ? SS.data[SS.siteRef.col][i] : null, id = typeof v === "number" ? v : refIdOf(v);
  const ref = SS.siteRef ? refSitesAtlas.get(SS.siteRef.table) : null, j = id && ref ? ref.idx.get(id) : undefined;
  if (j !== undefined) { const lat = ref.lat(j), lon = ref.lon(j);
    return { cle: `s${id}`, nom: ref.nom(j) || `Site ${id}`, lat: Math.abs(lat) <= 90 ? lat : NaN, lon: Math.abs(lon) <= 180 ? lon : NaN, commune: ref.commune(j) }; }
  const nom = (typeof v === "string" ? v : "").trim() || (SS.libre ? texteCellule(SS.data[SS.libre][i]).trim() : "");
  return nom ? { cle: `l${normAtlas(nom)}`, nom, lat: NaN, lon: NaN, commune: "" } : null;
}

/* ---------- données : un point par établissement, un point par signalement ---------- */
function signalementsAtlas(profil) {
  const P = { ...PROFIL_DEFAUT, ...profil };
  const G = window.Geo, panel = lastMappings || {}, manuel = !!(panel.Latitude && panel.Longitude);
  const cols = manuel ? panel : (socle ? socle.auto : panel);
  if (!cols.Latitude || !cols.Longitude) throw new Error("L'atlas place les établissements par leurs coordonnées : associez Latitude et Longitude, ou utilisez une table du socle.");
  // « tous » : toutes les versions (jours de mobilisation) ; « recs » : dernière version seulement si la case est cochée
  let tous = filteredRecords(), recs = tous; if (socle && socle.dv && dvOnly) recs = recs.filter(r => r[socle.dv]);
  const cles = new Set(); tous.forEach(r => Object.keys(r).forEach(k => cles.add(k)));
  const trouve = (...noms) => noms.find(n => n && cles.has(n)) || null;
  const motif = re => [...cles].find(k => re.test(k)) || null;
  const R = (socle && socle.champs) || {};   // rôles du socle d'abord, puis noms usuels, puis motifs
  const C = { nom: trouve(cols.Nom, "Nom_etablissement", "Etab_Nom", "Nom"), uai: trouve(socle && socle.uai, "UAI", "Etab_UAI"),
    commune: trouve(R.Commune, "Commune", "Etab_Commune") || motif(/^(etab_)?(nom_|libelle_)?commune$/i),
    dep: trouve(R.Departement, "Departement", "Etab_Departement") || motif(/^(etab_)?(libelle_)?departement$/i),
    aca: trouve(R.Academie, "Academie", "Etab_Academie", "Academie_carte") || motif(/^(etab_)?(libelle_)?academie$/i),
    type: trouve(R.Type, "Type", "Etab_Type", "Type_etablissement", "Etab_Type_etablissement") || motif(/^(etab_)?type_?(d_)?etab/i),
    nature: trouve(R.Libelle_nature, "Libelle_nature", "Etab_Libelle_nature") || motif(/libelle_?nature/i),
    rep: motif(/education_prioritaire|^(etab_)?rep(_rep_plus)?$/i), internat: motif(/hebergement|internat/i),
    sigle: trouve("Sigle", "Etab_Sigle") || motif(/^(etab_)?sigle$/i),
    qualif: (socle && socle.qualif) || trouve("Qualification"), faits: trouve(R.Date_faits, "Date_faits"), cree: trouve(R.Cree_le, "Cree_le") };
  // jours de mobilisation : colonne choisie, colonne reconnue (« auto »), ou calcul
  C.jours = P.jours === "calcul" ? null : P.jours && P.jours !== "auto" ? (cles.has(P.jours) ? P.jours : null) : motif(/jours?_de_mobilisation|^nb_?(de_)?jours/i);
  const exclues = new Set((P.exclues || []).map(x => String(x).trim().toUpperCase()).filter(Boolean));
  const ordre = choixColonne(C.qualif);
  const dateDe = r => (C.faits && secondesDe(r[C.faits])) || (C.cree && secondesDe(r[C.cree])) || null;
  const qualifsDe = r => C.qualif ? texteCellule(r[C.qualif]).split(", ").map(q => q.trim()).filter(Boolean) : [];
  const estExclu = r => { const q = qualifsDe(r); return q.length > 0 && q.every(x => exclues.has(x.toUpperCase())); };
  // filtre du profil sur les qualifications : seuls les signalements qui en portent une comptent
  const F = { categories: [], qualifs: [], minSignalements: 1, minJours: 0, ...(P.filtre || {}) };
  // sous-table des marques : lignes rattachées à chaque réponse (par son identifiant ou celui de son dossier)
  const M = { table: "", colonne: "", titre: "", inclure: true, ...(P.marques || {}) };
  const ST = M.table ? sousTablesAtlas.find(t => t.table === M.table) : null;
  const { sousDe, uniques, avecVersions } = indexSous(ST, R);
  // point par site : sous-table des sites (choisie dans le profil, sinon la première reconnue)
  const SS = sousTablesAtlas.find(t => t.table === ((P.sites || {}).table || "") && t.estSites) || sousTablesAtlas.find(t => t.estSites) || null;
  const IS = SS === ST ? { sousDe, uniques } : indexSous(SS, R);
  // lignes de la sous-table qui citent leur propre établissement (référence au référentiel, UAI ou coordonnées) : points à part
  const lieuSous = localisateurSous(ST);
  // réponse retenue seulement pour sa sous-table (filtre de qualification) : pas de point à elle si ses lignes citent d'autres établissements
  const horsFiltre = new Set();
  if (F.qualifs.length) {
    const garde = r => { if (qualifsDe(r).some(q => F.qualifs.includes(q))) return true;
      if (ST && M.inclure && sousDe(r).length > 0) { horsFiltre.add(r.id); return true; } return false; };
    tous = tous.filter(garde); recs = recs.filter(garde);
  }
  // période (date des faits, à défaut de saisie), bornes comprises
  if (F.debut || F.fin) { const dansPeriode = r => { const d = jourDe(dateDe(r)); return !!d && (!F.debut || d >= F.debut) && (!F.fin || d <= F.fin); }; tous = tous.filter(dansPeriode); recs = recs.filter(dansPeriode); }
  const REG = ["jour", "aucun", "site"].includes(P.regroupement) ? P.regroupement : "etablissement";
  if (REG === "site" && !SS) throw new Error("Un point par site : aucune sous-table de sites (question tableau dont une colonne renvoie vers le référentiel des sites, ou colonne « site hors référentiel »).");
  const SY = symbologieDe(P);
  const cleDe = r => { const lat = toNumber(r[cols.Latitude]), lon = toNumber(r[cols.Longitude]); if (isNaN(lat) || isNaN(lon)) return null;
    return (C.uai ? texteCellule(r[C.uai]).trim() : "") || `${lat.toFixed(5)},${lon.toFixed(5)}`; };
  // colonnes de la table recopiées dans les deux couches (détail : telles quelles ; établissement : regroupées)
  // colonnes du référentiel des établissements utilisées par le profil (tableau, couleurs) : exportées comme celles de la table
  const refUtilisees = [...new Set([...(P.colonnes || []).map(c => c.champ), SY.champ].filter(c => c && c.startsWith("ref:")).map(c => c.slice(4)))].filter(c => cles.has(c));
  const tableCols = [...colonnesTable().filter(c => ![cols.Latitude, cols.Longitude, socle && socle.etabCol].includes(c.col)),
    ...refUtilisees.map(col => ({ col, libelle: libelleRef(col), type: colTypes[col] || "" }))];
  const agregatDe = col => { const c = (P.colonnes || []).find(x => x.champ === "col:" + col || x.champ === "ref:" + col); return (c && c.agregat) || agregatParDefaut(colTypes[col] || ""); };
  const valeurExport = (col, v) => /^Date/.test(colTypes[col] || "") ? jourDe(v) : typeof v === "number" || typeof v === "boolean" ? v : texteCellule(v);

  // jours de mobilisation par établissement, sur toutes les versions
  const joursEtab = new Map();
  for (const r of tous) {
    const k = cleDe(r); if (!k) continue;
    if (!joursEtab.has(k)) joursEtab.set(k, { jours: new Set(), max: null });
    const j = joursEtab.get(k), v = C.jours ? toNumber(r[C.jours]) : NaN;
    if (!isNaN(v) && (j.max === null || v > j.max)) j.max = v;
    const d = dateDe(r); if (d && !estExclu(r)) j.jours.add(jourDe(d));
  }
  // champs d'un établissement : x = { nom, uai, commune, type, nature, aca, dep, rep, internat } (textes bruts)
  const propsEtab = (x, lat, lon) => {
    const lieu = G ? G.localiser(lat, lon) : null;
    const academie = (G && x.aca && G.acaKey(x.aca)) || (lieu && lieu.academie) || x.aca || "";
    const depCode = (G && x.uai && G.depFromUai(x.uai)) || (lieu && lieu.dep) || "";
    const depNom = (G && G.DEP_NAMES[depCode]) || x.dep || (lieu && lieu.departement) || "";
    // scolaire : sigle du type + nom court en capitales (« CLG JULES FERRY ») ; autres (supérieur…) : sigle, sinon nom tel quel
    const n = natureCourte(x.nature || "", x.type || ""), scolaire = !!n.court, nom = scolaire ? nomCourt(x.nom || "") : String(x.nom || "").trim(), intern = x.internat;
    const sigle = String(x.sigle || "").trim();
    return { Etiquette: scolaire ? `${n.court} ${nom}`.trim() : (sigle || nom), Etablissement: nom, Sigle: sigle || nom, Type_court: n.court, Type_libelle: n.libelle, Categorie: n.categorie,
      Type_etablissement: x.type || "", Nature: x.nature || "",
      UAI: x.uai || "", Commune: x.commune || "", DSDEN: depCode ? `${depCode} - ${depNom}` : depNom, Dep: depCode || "", Academie: academie, Region_academique: regionDe(academie),
      REP: (x.rep || "").trim() || "-", Internat: intern === true || intern === 1 || /^(1|oui|o|true|vrai)$/i.test(texteCellule(intern).trim()) ? "Oui" : "-" };
  };
  const xEtab = (r, uai) => ({ nom: C.nom ? texteCellule(r[C.nom]) : "", uai, commune: C.commune ? texteCellule(r[C.commune]) : "",
    type: C.type ? texteCellule(r[C.type]) : "", nature: C.nature ? texteCellule(r[C.nature]) : "", aca: C.aca ? texteCellule(r[C.aca]) : "",
    dep: C.dep ? texteCellule(r[C.dep]) : "", rep: C.rep ? texteCellule(r[C.rep]) : "", internat: C.internat ? r[C.internat] : null, sigle: C.sigle ? texteCellule(r[C.sigle]) : "" });
  const etabProps = (r, lat, lon, uai) => propsEtab(xEtab(r, uai), lat, lon);
  // sites (sous-table des sites) : qualification de la ligne (à défaut, celle du signalement), clé du site
  const qualifsLigne = (i, r) => SS && SS.qualif ? texteCellule(SS.data[SS.qualif][i]).split(", ").map(q => q.trim()).filter(Boolean) : qualifsDe(r);
  const cleSite = (s, r) => s.cle.startsWith("s") ? s.cle : `${cleDe(r) || ""}|${s.cle}`;
  const joursSite = new Map();
  if (REG === "site") for (const r of tous) {
    const d = dateDe(r); if (!d) continue;
    for (const i of IS.sousDe(r)) { const s = siteDeLigne(SS, i); if (!s) continue; const q = qualifsLigne(i, r);
      if (q.length && q.every(x => exclues.has(x.toUpperCase()))) continue;
      const k = cleSite(s, r); if (!joursSite.has(k)) joursSite.set(k, new Set()); joursSite.get(k).add(jourDe(d)); }
  }
  const parSite = new Map();
  const parSous = new Map();
  const parEtab = new Map(), detail = [];
  for (const r of recs) {
    const lat = toNumber(r[cols.Latitude]), lon = toNumber(r[cols.Longitude]);
    if (isNaN(lat) || isNaN(lon)) continue;
    const exclu = estExclu(r);
    const uai = C.uai ? texteCellule(r[C.uai]).trim() : "", cle = cleDe(r), dr = dateDe(r);
    // sous-table : lignes sur l'établissement de la réponse (marque accolée au point) ou sur un autre établissement (point propre)
    const memes = [];
    for (const i of sousDe(r)) {
      const l = lieuSous(i), k = l ? (l.uai || `${l.lat.toFixed(5)},${l.lon.toFixed(5)}`) : null;
      if (!l || k === cle) { memes.push(i); continue; }
      const sk = REG === "aucun" ? `${k}|s${i}` : REG === "jour" ? `${k}|${jourDe(dr)}` : k;
      if (!parSous.has(sk)) parSous.set(sk, { cle: k, lat: l.lat, lon: l.lon, sous: new Set(), parents: new Set(), date: null, jour: REG === "etablissement" ? null : jourDe(dr), props: propsEtab(l, l.lat, l.lon) });
      const x = parSous.get(sk); x.sous.add(i); x.parents.add(nomCourt(C.nom ? texteCellule(r[C.nom]) : ""));
      if (typeof dr === "number" && (!x.date || dr > x.date)) x.date = dr;
    }
    if ((exclu && P.exclureTout) || (horsFiltre.has(r.id) && !memes.length)) continue;
    if (REG === "site") {
      // un point par site : chaque ligne de la sous-table des sites, sur le site du référentiel (à défaut, sur l'établissement)
      const d = dateDe(r);
      for (const i of IS.sousDe(r)) {
        const st = siteDeLigne(SS, i); if (!st) continue;
        const q = qualifsLigne(i, r), ex = q.length > 0 && q.every(x => exclues.has(x.toUpperCase()));
        if (ex && P.exclureTout) continue;
        const k = cleSite(st, r), place = !isNaN(st.lat) && !isNaN(st.lon);
        if (!parSite.has(k)) parSite.set(k, { cle: k, lat: place ? st.lat : lat, lon: place ? st.lon : lon, uai, place, nom: st.nom, commune: st.commune, r0: r, reps: new Set(), qualifs: new Map(), date: null, lignes: [] });
        const g = parSite.get(k); g.reps.add(r.id); g.lignes.push({ r, d });
        if (!ex) q.forEach(x => { const o = g.qualifs.get(x) || { n: 0, date: 0 }; o.n++; if (typeof d === "number" && d > o.date) o.date = d; g.qualifs.set(x, o); });
        if (typeof d === "number" && (!g.date || d > g.date)) { g.date = d; g.r0 = r; }
      }
    }
    // groupe : l'établissement, l'établissement un jour donné, ou la ligne elle-même
    const gk = REG === "aucun" ? `${cle}|r${r.id}` : REG === "jour" ? `${cle}|${jourDe(dr)}` : cle;
    if (!parEtab.has(gk)) parEtab.set(gk, { cle, lat, lon, uai, n: 0, qualifs: new Map(), date: null, jour: REG === "etablissement" ? null : jourDe(dr), lignes: [], sous: new Set(), props: etabProps(r, lat, lon, uai) });
    const e = parEtab.get(gk); e.n++;
    memes.forEach(i => e.sous.add(i));
    const qs = qualifsDe(r), d = dateDe(r);
    e.lignes.push({ r, d });
    if (!exclu) qs.forEach(q => { const x = e.qualifs.get(q) || { n: 0, date: 0 }; x.n++; if (typeof d === "number" && d > x.date) x.date = d; e.qualifs.set(q, x); });
    if (typeof d === "number" && (!e.date || d > e.date)) e.date = d;
    const brut = {}; tableCols.forEach(c => { brut[nomExport(c.col)] = valeurExport(c.col, r[c.col]); });
    detail.push({ cle, type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] }, properties: { ...e.props, ...brut,
      Qualification: qs[0] || "", Qualifications: qs.join(", "), Date: jourDe(d), Dossier: R.Dossier ? texteCellule(r[R.Dossier]) : "",
      Nb_jours: C.jours && !isNaN(toNumber(r[C.jours])) ? toNumber(r[C.jours]) : null, grist_id: r.id } });
  }
  const rangQualif = q => { const i = ordre.indexOf(q); return i < 0 ? 1e6 : i; };
  const triQualif = { frequente: (a, b) => b[1].n - a[1].n || b[1].date - a[1].date,
    recente: (a, b) => b[1].date - a[1].date || b[1].n - a[1].n,
    ordre: (a, b) => rangQualif(a[0]) - rangQualif(b[0]) || b[1].n - a[1].n }[P.principale] || ((a, b) => b[1].n - a[1].n);
  const regrouper = (col, lignes) => {
    const ag = agregatDe(col), vals = lignes.map(x => ({ v: x.r[col], d: x.d || 0 })).filter(x => x.v !== null && x.v !== undefined && x.v !== "" && !(Array.isArray(x.v) && x.v.length <= 1));
    if (ag === "nb") return vals.filter(x => x.v !== false).length;
    if (!vals.length) return null;
    if (ag === "derniere") return valeurExport(col, vals.slice().sort((a, b) => b.d - a.d)[0].v);
    if (["max", "min", "somme"].includes(ag)) {
      const n = vals.map(x => secondesDe(x.v) ?? toNumber(x.v)).filter(x => !isNaN(x));
      if (!n.length) return null;
      const res = ag === "somme" ? n.reduce((t, x) => t + x, 0) : Math[ag](...n);
      return /^Date/.test(colTypes[col] || "") ? jourDe(res) : +res.toFixed(6);
    }
    return [...new Set(vals.flatMap(x => texteCellule(x.v).split(", ")).map(s => s.trim()).filter(Boolean))].join(", ");
  };
  // marque de l'établissement : valeur de la colonne choisie (la première dans l'ordre des choix de Grist, sinon la plus
  // fréquente) parmi ses lignes de la sous-table ; sans colonne, le titre de la marque
  const colM = ST && M.colonne ? ST.colonnes.find(c => c.col === M.colonne) : null;
  const marqueDe = e => {
    if (!ST || !e.sous.size) return { Marque: null, Marque_nb: 0, Marque_valeurs: "" };
    e = { ...e, sous: new Set(uniques(e.sous)) };
    const vals = [...e.sous].flatMap(i => colM ? texteCellule(ST.data[colM.col][i]).split(", ").map(x => x.trim()).filter(Boolean) : []);
    const compte = new Map(); vals.forEach(v => compte.set(v, (compte.get(v) || 0) + 1));
    const rang = v => { const k = colM ? colM.choix.indexOf(v) : -1; return k < 0 ? 1e6 : k; };
    const principale = [...compte.entries()].sort((a, b) => rang(a[0]) - rang(b[0]) || b[1] - a[1] || a[0].localeCompare(b[0], "fr"))[0];
    return { Marque: colM ? (principale ? principale[0] : "Non précisé") : (M.titre || "Oui"), Marque_nb: e.sous.size, Marque_valeurs: [...compte.keys()].join(", ") };
  };
  // sites touchés d'un établissement (sous-table des sites) : nombre et noms
  const sitesDe = lignes => { if (!SS) return { Nb_sites: null, Sites: "" };
    // sites revenus à la normale (qualification ignorée, RAS…) : pas comptés
    const m = new Map(); lignes.forEach(({ r }) => IS.sousDe(r).forEach(i => { const st = siteDeLigne(SS, i), q = qualifsLigne(i, r);
      if (st && !m.has(st.cle) && !(q.length && q.every(x => exclues.has(x.toUpperCase())))) m.set(st.cle, st.nom); }));
    return { Nb_sites: m.size, Sites: [...m.values()].sort((a, b) => a.localeCompare(b, "fr")).join(", ") }; };
  const features = [];
  if (REG !== "site") for (const e of parEtab.values()) {
    const principale = [...e.qualifs.entries()].sort((a, b) => triQualif(a, b) || a[0].localeCompare(b[0], "fr"))[0];
    const regroupees = {}; tableCols.forEach(c => { regroupees[nomExport(c.col)] = regrouper(c.col, e.lignes); });
    const j = joursEtab.get(e.cle);
    features.push({ _cle: e.cle, type: "Feature", geometry: { type: "Point", coordinates: [e.lon, e.lat] }, properties: { ...e.props, ...regroupees,
      Nb_signalements: e.n, Qualification_principale: principale ? principale[0] : "", Qualifications: [...e.qualifs.keys()].join(", "),
      Nb_jours: j ? (j.max !== null ? j.max : j.jours.size || null) : null, Site: "", ...sitesDe(e.lignes),
      Derniere_date: e.date ? jourDe(e.date) : "", Jour: e.jour, Couche: "principale", Signale_par: "", ...marqueDe(e) } });
  }
  // un point par site : champs de l'établissement, lieu (académie, département, commune) d'après le site
  for (const g of parSite.values()) {
    const principale = [...g.qualifs.entries()].sort((a, b) => triQualif(a, b) || a[0].localeCompare(b[0], "fr"))[0];
    const regroupees = {}; tableCols.forEach(c => { regroupees[nomExport(c.col)] = regrouper(c.col, g.lignes); });
    // site placé : commune du référentiel des sites (sinon vide : celle de l'établissement serait trompeuse)
    const x = xEtab(g.r0, g.uai), pe = propsEtab(g.place ? { ...x, uai: "", aca: "", dep: "", commune: g.commune } : x, g.lat, g.lon);
    const jours = joursSite.get(g.cle);
    features.push({ _cle: g.cle, _etab: cleDe(g.r0), type: "Feature", geometry: { type: "Point", coordinates: [g.lon, g.lat] }, properties: { ...pe, ...regroupees, UAI: g.uai,
      Site: g.nom, Etiquette: `${g.nom}${pe.Sigle && pe.Sigle !== g.nom ? ` (${pe.Sigle})` : ""}`, Nb_sites: 1, Sites: g.nom,
      Nb_signalements: g.reps.size, Qualification_principale: principale ? principale[0] : "", Qualifications: [...g.qualifs.keys()].join(", "),
      Nb_jours: jours ? jours.size || null : null, Derniere_date: g.date ? jourDe(g.date) : "", Jour: null, Couche: "principale", Signale_par: "",
      Marque: null, Marque_nb: 0, Marque_valeurs: "" } });
  }
  // établissements cités dans la sous-table (hors établissement de la réponse) : couche à part, mêmes champs de page
  const sousFeatures = [...parSous.values()].map(x => ({ type: "Feature", geometry: { type: "Point", coordinates: [x.lon, x.lat] }, properties: { ...x.props,
    Nb_signalements: uniques(x.sous).length, Qualification_principale: "", Qualifications: "", Nb_jours: null, Derniere_date: x.date ? jourDe(x.date) : "", Jour: x.jour,
    Couche: "sous-table", Signale_par: [...x.parents].filter(Boolean).join(", "), ...marqueDe(x) } }));
  // couleurs et formes (symbologie du profil) : catégorie de chaque point ; valeurs non gardées écartées
  const champSym = /^(col|ref):/.test(SY.champ) ? nomExport(SY.champ.slice(4)) : SY.champ;
  const classer = p => {
    const vals = texteCellule(p[champSym]).split(", ").map(x => x.trim()).filter(Boolean);
    const it = SY.items.find(x => x.garder !== false && vals.includes(String(x.valeur)));
    if (it) return it;
    if (SY.items.some(x => vals.includes(String(x.valeur)))) return null;   // valeur listée mais écartée
    return SY.autres.garder !== false ? SY.autres : null;
  };
  const avantFiltre = features.length, valeursSym = new Map();
  for (let i = features.length - 1; i >= 0; i--) {
    const p = features[i].properties;
    texteCellule(p[champSym]).split(", ").map(x => x.trim()).filter(Boolean).forEach(v => valeursSym.set(v, (valeursSym.get(v) || 0) + 1));
    const it = classer(p);
    if (!it || p.Nb_signalements < (+F.minSignalements || 1) || (p.Nb_jours || 0) < (+F.minJours || 0)) { features.splice(i, 1); continue; }
    p.Categorie = String(it.libelle || it.valeur || "Autres");
  }
  // légende : libellés dans l'ordre de la liste, puis « autres » ; seulement ceux qui ont des points
  const presents = new Set(features.map(f => f.properties.Categorie)), categories = [];
  [...SY.items.filter(x => x.garder !== false), SY.autres].forEach(it => { const l = String(it.libelle || it.valeur || "Autres");
    if (presents.has(l) && !categories.some(c => c.libelle === l)) categories.push({ libelle: l, couleur: it.couleur || "#666666", forme: FORMES[it.forme] ? it.forme : "circle" }); });
  // établissements d'origine des points par site : leur détail reste dans signalements_detail
  const clesRetenues = new Set(features.flatMap(f => [f._cle, f._etab].filter(Boolean))); features.forEach(f => { delete f._cle; delete f._etab; });
  for (let i = detail.length - 1; i >= 0; i--) { if (!clesRetenues.has(detail[i].cle)) detail.splice(i, 1); else delete detail[i].cle; }
  if (!features.length && !sousFeatures.length) throw new Error(avantFiltre ? `Aucun point ne passe le filtre du profil (${avantFiltre} avant filtre).` : REG === "site" ? "Aucun site localisé à mettre dans l'atlas (sous-table des sites vide pour ces signalements ?)." : "Aucun établissement localisé à mettre dans l'atlas.");
  // Rang dans l'académie selon le critère du profil : le tableau garde les N premiers
  const cmp = {
    signalements: (a, b) => b.Nb_signalements - a.Nb_signalements || (b.Nb_jours || 0) - (a.Nb_jours || 0) || String(b.Derniere_date).localeCompare(String(a.Derniere_date)),
    jours: (a, b) => (b.Nb_jours || 0) - (a.Nb_jours || 0) || b.Nb_signalements - a.Nb_signalements || String(b.Derniere_date).localeCompare(String(a.Derniere_date)),
    recent: (a, b) => String(b.Derniere_date).localeCompare(String(a.Derniere_date)) || b.Nb_signalements - a.Nb_signalements,
  }[P.critere] || ((a, b) => b.Nb_signalements - a.Nb_signalements);
  const parAca = new Map();
  for (const f of [...features, ...sousFeatures]) { const k = `${f.properties.Academie || ""}|${f.properties.Couche}`; if (!parAca.has(k)) parAca.set(k, []); parAca.get(k).push(f.properties); }
  for (const l of parAca.values()) { l.sort((a, b) => cmp(a, b) || a.Etablissement.localeCompare(b.Etablissement, "fr")); l.forEach((p, i) => { p.Rang = i + 1; }); }
  return { fc: { type: "FeatureCollection", name: "signalements", features }, detail: { type: "FeatureCollection", name: "signalements_detail", features: detail },
    sous: { type: "FeatureCollection", name: "sous_table", features: sousFeatures },
    infos: { jours: C.jours, qualif: C.qualif, ordre, tableCols, avantFiltre, marques: ST ? { table: ST.table, colonne: colM, titre: M.titre, lieu: lieuSous.mode } : null,
      symbologie: { ...SY, categories, valeurs: valeursSym }, sites: SS ? { table: SS.table, siteRef: SS.siteRef, libre: SS.libre, qualif: SS.qualif } : null, regroupement: REG } };
}

/* ---------- encarts de zoom : zones denses et place libre sur la carte ----------
   Reprend la mise en page du modèle intégré : carte principale de 198 × 134 mm en (6, 56), emprise de l'atlas = rectangle
   de l'académie ajusté aux proportions de la carte puis agrandi de 6 % (mode « Auto » de QGIS), Lambert-93.
   Une zone dense = des établissements de l'académie à moins de « écart » mm les uns des autres sur le papier (de proche
   en proche), au moins « min » ; l'encart (60 × 44 mm) la montre assez grossie pour les séparer, et se place là où il
   cache le moins : peu de points, peu de surface de l'académie, loin de l'échelle et des autres encarts. */
const CARTE_MM = { x: 6, y: 56, l: 198, h: 134, marge: 0.06 }, ENCART_MM = { l: 60, h: 44 }, ECHELLE_MM = { x: 150, y: 176, l: 52, h: 14 };
const OUTRE_MER = new Set(["Guadeloupe", "Martinique", "Guyane", "La Réunion", "Mayotte"]);
// page « France entière » : encarts fixes de l'outre-mer dans la colonne de gauche de la carte (mêmes valeurs que OM_* du modèle)
const OM_MM = [0, 1, 2, 3, 4].map(k => ({ x: 7, y: 57 + k * 26.4, l: 27, h: 24.5 }));
const estFrance = pg => pg && pg.properties && pg.properties.type === "france";
// échelle de la carte : en bas à droite, en haut à droite sur la page France entière (la Corse occupe le bas)
const echelleDe = pg => estFrance(pg) ? { ...ECHELLE_MM, y: 58 } : ECHELLE_MM;
// Lambert-93 (EPSG:2154) : conique conforme sécante, GRS80
function versL93(lon, lat) {
  const a = 6378137, e = 0.0818191910428158, rad = Math.PI / 180, l0 = 3 * rad, p0 = 46.5 * rad, p1 = 44 * rad, p2 = 49 * rad;
  const m = p => Math.cos(p) / Math.sqrt(1 - e * e * Math.sin(p) ** 2);
  const t = p => Math.tan(Math.PI / 4 - p / 2) / ((1 - e * Math.sin(p)) / (1 + e * Math.sin(p))) ** (e / 2);
  const n = (Math.log(m(p1)) - Math.log(m(p2))) / (Math.log(t(p1)) - Math.log(t(p2))), F = m(p1) / (n * t(p1) ** n);
  const r0 = a * F * t(p0) ** n, r = a * F * t(lat * rad) ** n, th = n * (lon * rad - l0);
  return [700000 + r * Math.sin(th), 6600000 + r0 - r * Math.cos(th)];
}
// Emprise de la page d'une académie sur la carte principale (mode « Auto » de QGIS) et mètres par mm de papier
function emprisePage(aca) {
  const anneaux = aca.geometry.type === "Polygon" ? aca.geometry.coordinates : aca.geometry.coordinates.flat();
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  anneaux.forEach(an => an.forEach(([x, y]) => { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y); }));
  const ratio = CARTE_MM.l / CARTE_MM.h;
  if ((x2 - x1) / (y2 - y1) < ratio) { const d = (ratio * (y2 - y1) - (x2 - x1)) / 2; x1 -= d; x2 += d; } else { const d = ((x2 - x1) / ratio - (y2 - y1)) / 2; y1 -= d; y2 += d; }
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, w = (x2 - x1) * (1 + CARTE_MM.marge), h = (y2 - y1) * (1 + CARTE_MM.marge);
  return { E: { x1: cx - w / 2, y1: cy - h / 2, x2: cx + w / 2, y2: cy + h / 2 }, k: w / CARTE_MM.l, anneaux };
}
function calculerEncarts(features, academies, opts) {
  const max = Math.max(0, Math.min(3, opts.max | 0)), minEtab = Math.max(2, opts.min | 0), ecart = Math.max(1, +opts.ecart || 6);
  const zones = [], zoomDe = new Map();   // zoomDe : point (feature) → numéro d'encart
  if (!max) return { zones, zoomDe };
  const pts = features.map(f => { const [x, y] = versL93(f.geometry.coordinates[0], f.geometry.coordinates[1]); return { f, x, y, aca: f.properties.Academie }; });
  // pages : académies ou départements (champ Page de chaque établissement)
  pts.forEach(p => { p.aca = p.f.properties.Page; });
  for (const aca of academies.features) {
    const page = aca.properties.cle || aca.properties.nom;
    if (OUTRE_MER.has(aca.properties.academie || page) || !pts.some(p => p.aca === page)) continue;
    const { E, k, anneaux } = emprisePage(aca);   // emprise de la page, mètres par mm
    const papier = (x, y) => [CARTE_MM.x + (x - E.x1) / k, CARTE_MM.y + (E.y2 - y) / k];
    const jourPage = aca.properties.jour;   // page d'un jour : seuls les points de ce jour sont dessinés
    const visibles = pts.filter(p => p.x >= E.x1 && p.x <= E.x2 && p.y >= E.y1 && p.y <= E.y2 && (jourPage == null || (p.f.properties.Jour || "") === jourPage)).map(p => ({ ...p, pp: papier(p.x, p.y) }));
    const dePage = visibles.filter(p => p.aca === page);
    // grappes de proche en proche (distance sur le papier), redécoupées si elles sont trop étendues pour un encart
    const grappes = (liste, seuil, niveau) => {
      const parent = liste.map((_, i) => i), racine = i => parent[i] === i ? i : (parent[i] = racine(parent[i]));
      for (let i = 0; i < liste.length; i++) for (let j = i + 1; j < liste.length; j++)
        if (Math.hypot(liste[i].pp[0] - liste[j].pp[0], liste[i].pp[1] - liste[j].pp[1]) < seuil) parent[racine(i)] = racine(j);
      const g = new Map(); liste.forEach((p, i) => { const r = racine(i); if (!g.has(r)) g.set(r, []); g.get(r).push(p); });
      const res = [];
      for (const membres of g.values()) {
        if (membres.length < minEtab) continue;
        const bx = membres.map(p => p.pp[0]), by = membres.map(p => p.pp[1]);
        const bw = Math.max(...bx) - Math.min(...bx), bh = Math.max(...by) - Math.min(...by);
        // grossissement possible (la grappe entière dans l'encart) et grossissement utile (écarter les points voisins d'environ 8 mm)
        const z = Math.min((ENCART_MM.l - 16) / Math.max(bw, 2), (ENCART_MM.h - 10) / Math.max(bh, 2));
        const proches = membres.map((p, i) => Math.min(...membres.filter((_, j) => j !== i).map(q => Math.hypot(p.pp[0] - q.pp[0], p.pp[1] - q.pp[1])))).sort((u, v) => u - v);
        const zUtile = Math.min(25, 8 / Math.max(proches[Math.floor(proches.length / 2)], 0.3));
        if ((z < 2 || z < 0.7 * zUtile) && niveau < 3) { const sous = grappes(membres, seuil * 0.6, niveau + 1); if (sous.length) { res.push(...sous); continue; } }
        res.push({ membres, z: Math.max(2, Math.min(25, z)), cx: (Math.max(...bx) + Math.min(...bx)) / 2, cy: (Math.max(...by) + Math.min(...by)) / 2 });
      }
      return res;
    };
    const choisies = grappes(dePage, ecart, 0).sort((a, b) => b.membres.length - a.membres.length).slice(0, max);
    if (!choisies.length) continue;
    // grille d'occupation (2 mm) sur la carte : points et leur étiquette, surface de l'académie, échelle, cadres des zones
    const pas = 2, nx = Math.ceil(CARTE_MM.l / pas), ny = Math.ceil(CARTE_MM.h / pas), poids = new Float64Array(nx * ny);
    const ajouter = (x, y, l, hh, v) => { for (let j = Math.max(0, Math.floor((y - CARTE_MM.y) / pas)); j < Math.min(ny, Math.ceil((y + hh - CARTE_MM.y) / pas)); j++)
      for (let i = Math.max(0, Math.floor((x - CARTE_MM.x) / pas)); i < Math.min(nx, Math.ceil((x + l - CARTE_MM.x) / pas)); i++) poids[j * nx + i] += v; };
    visibles.forEach(p => ajouter(p.pp[0] - 2, p.pp[1] - 2, p.aca === page ? 26 : 18, 4, p.aca === page ? 4 : 1));
    // surface de l'académie : balayage ligne par ligne (règle pair-impair)
    const bords = []; anneaux.forEach(an => { for (let i = 0; i < an.length - 1; i++) bords.push([papier(...an[i]), papier(...an[i + 1])]); });
    for (let j = 0; j < ny; j++) {
      const yc = CARTE_MM.y + (j + 0.5) * pas, xs = [];
      bords.forEach(([[ax, ay], [bx, by]]) => { if ((ay > yc) !== (by > yc)) xs.push(ax + (yc - ay) * (bx - ax) / (by - ay)); });
      xs.sort((u, v) => u - v);
      for (let q = 0; q + 1 < xs.length; q += 2) ajouter(xs[q], yc - pas / 2, xs[q + 1] - xs[q], pas, 0.35);
    }
    const ech = echelleDe(aca); ajouter(ech.x, ech.y, ech.l, ech.h, 1e4);
    if (estFrance(aca)) OM_MM.forEach(o => ajouter(o.x - 1, o.y - 1, o.l + 2, o.h + 2, 1e4));   // encarts de l'outre-mer
    choisies.forEach(c => { const zl = ENCART_MM.l / c.z, zh = ENCART_MM.h / c.z; ajouter(c.cx - zl / 2 - 3, c.cy - zh / 2 - 3, zl + 6, zh + 6, 30); });
    choisies.forEach((c, n) => {
      // somme des poids sous chaque position possible (tableau des sommes cumulées), plus un peu de distance à la zone
      const S = new Float64Array((nx + 1) * (ny + 1));
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) S[(j + 1) * (nx + 1) + i + 1] = poids[j * nx + i] + S[j * (nx + 1) + i + 1] + S[(j + 1) * (nx + 1) + i] - S[j * (nx + 1) + i];
      const cw = Math.ceil(ENCART_MM.l / pas), ch = Math.ceil(ENCART_MM.h / pas);
      let best = null;
      for (let j = 1; j + ch < ny; j++) for (let i = 1; i + cw < nx; i++) {
        const somme = S[(j + ch) * (nx + 1) + i + cw] - S[j * (nx + 1) + i + cw] - S[(j + ch) * (nx + 1) + i] + S[j * (nx + 1) + i];
        const px = CARTE_MM.x + i * pas, py = CARTE_MM.y + j * pas;
        const score = somme + 0.02 * Math.hypot(px + ENCART_MM.l / 2 - c.cx, py + ENCART_MM.h / 2 - c.cy);
        if (!best || score < best.score) best = { score, px, py };
      }
      if (!best) return;
      ajouter(best.px - 3, best.py - 3, ENCART_MM.l + 6, ENCART_MM.h + 6, 1e4);   // les encarts suivants l'évitent
      // emprise de l'encart (Lambert-93) : centrée sur la grappe, grossie z fois
      const mx = E.x1 + (c.cx - CARTE_MM.x) * k, my = E.y2 - (c.cy - CARTE_MM.y) * k, demiL = ENCART_MM.l / 2 * k / c.z, demiH = ENCART_MM.h / 2 * k / c.z;
      const num = n + 1, cle = `${page}#${num}`;
      c.membres.forEach(p => zoomDe.set(p.f, num));
      zones.push({ type: "Feature", geometry: { type: "Polygon", coordinates: [[[mx - demiL, my - demiH], [mx + demiL, my - demiH], [mx + demiL, my + demiH], [mx - demiL, my + demiH], [mx - demiL, my - demiH]].map(q => q.map(v => Math.round(v)))] },
        properties: { cle, page, num, nb: c.membres.length, px: Math.round(best.px * 10) / 10, py: Math.round(best.py * 10) / 10, pw: ENCART_MM.l, ph: ENCART_MM.h,
          xmin: Math.round(mx - demiL), xmax: Math.round(mx + demiL), ymin: Math.round(my - demiH), ymax: Math.round(my + demiH), zoom: Math.round(c.z * 10) / 10 } });
    });
  }
  return { zones, zoomDe };
}

/* ---------- étiquettes placées à l'avance (carte principale et encarts) ----------
   Pour chaque carte, les étiquettes des établissements de l'académie sont posées une à une (les plus signalés d'abord) :
   d'abord contre le point, sinon de plus en plus loin dans 16 directions, à la première place libre (ni autre étiquette,
   ni point, ni encart, ni échelle, dans le cadre). QGIS les pose là et trace un trait de rappel vers le point quand
   l'étiquette en est écartée. Estimation de la taille du texte : DejaVu Sans gras, coupure à 26 caractères. */
function lignesEtiquette(t) {
  const lignes = []; let l = "";
  String(t || "").split(/\s+/).filter(Boolean).forEach(m => { if (l && (l + " " + m).length > 26) { lignes.push(l); l = m; } else l = l ? `${l} ${m}` : m; });
  if (l) lignes.push(l); return lignes.length ? lignes : [""];
}
// Sans place libre : l'étiquette est retirée (champ Lh / Eh), sauf pour les établissements protégés (ceux du tableau),
// qui gardent leur meilleure place même en chevauchant.
function placerEtiquettes(features, academies, zones, taille, protege) {
  const MM = taille * 0.3528, carW = MM * 0.66, ligneH = MM * 1.25, tampon = 0.5;
  const boite = t => { const l = lignesEtiquette(t); return { w: Math.max(...l.map(x => x.length)) * carW + 2 * tampon, h: l.length * ligneH + 2 * tampon }; };
  const chevauche = (a, b) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
  const pts = features.map(f => { const [x, y] = versL93(f.geometry.coordinates[0], f.geometry.coordinates[1]); return { f, x, y }; });
  // une carte : cadre papier, emprise, étiquettes à poser, obstacles fixes ; écrit les champs (préfixe L ou E)
  const poser = (cadre, E, k, aPoser, obstacles, prefixe, base) => {
    const papier = (x, y) => [cadre.x + (x - E.x1) / k, cadre.y + (E.y2 - y) / k];
    const dedans = base.filter(p => p.x >= E.x1 && p.x <= E.x2 && p.y >= E.y1 && p.y <= E.y2);
    const occupes = [...obstacles, ...dedans.flatMap(p => { const [u, v] = papier(p.x, p.y);
      const b = [{ x1: u - 1.7, y1: v - 1.7, x2: u + 1.7, y2: v + 1.7, point: p }];
      if (p.f.properties.Marque && p.f.properties.Couche !== "sous-table") b.push({ x1: u + 0.4, y1: v - 3.4, x2: u + 3.4, y2: v - 0.4, point: p });   // losange accolé
      return b; })];
    const directions = [...Array(16)].map((_, i) => i * Math.PI / 8);
    aPoser.sort((a, b) => (a.f.properties.Rang || 1e9) - (b.f.properties.Rang || 1e9));
    for (const p of aPoser) {
      const [u, v] = papier(p.x, p.y), b = boite(p.f.properties.Etiquette);
      const candidats = [];
      // contre le point : à droite, à gauche, au-dessus, au-dessous, puis en diagonale
      [[1.6, 0, "Left", "Half"], [-1.6, 0, "Right", "Half"], [0, -1.8, "Center", "Bottom"], [0, 1.8, "Center", "Top"], [1.3, -1.3, "Left", "Bottom"], [-1.3, -1.3, "Right", "Bottom"], [1.3, 1.3, "Left", "Top"], [-1.3, 1.3, "Right", "Top"]]
        .forEach(([dx, dy, ha, va]) => candidats.push({ ax: u + dx, ay: v + dy, ha, va, d: 0 }));
      for (const d of [5, 8, 11, 15, 20, 26, 33]) directions.forEach(t => {
        const c = Math.cos(t), s = Math.sin(t), ha = c > 0.35 ? "Left" : c < -0.35 ? "Right" : "Center", va = s > 0.35 ? "Top" : s < -0.35 ? "Bottom" : "Half";
        candidats.push({ ax: u + d * c, ay: v + d * s, ha, va, d });
      });
      let meilleur = null;
      for (const c of candidats) {
        const x1 = c.ha === "Left" ? c.ax : c.ha === "Right" ? c.ax - b.w : c.ax - b.w / 2, y1 = c.va === "Top" ? c.ay : c.va === "Bottom" ? c.ay - b.h : c.ay - b.h / 2;
        const r = { x1, y1, x2: x1 + b.w, y2: y1 + b.h };
        const hors = r.x1 < cadre.x + 0.5 || r.y1 < cadre.y + 0.5 || r.x2 > cadre.x + cadre.l - 0.5 || r.y2 > cadre.y + cadre.h - 0.5;
        const conflits = occupes.filter(o => o.point !== p && chevauche(o, r)).length;
        const cout = c.d + (hors ? 500 : 0) + conflits * 200;
        if (!meilleur || cout < meilleur.cout) meilleur = { ...c, r, cout };
        if (!hors && !conflits) break;   // candidats rangés du plus proche au plus loin : la première place libre suffit
      }
      const P = p.f.properties;
      if (meilleur.cout >= 200 && !protege(P)) { P[prefixe + "h"] = 1; continue; }
      occupes.push(meilleur.r);
      P[prefixe + "x"] = Math.round(E.x1 + (meilleur.ax - cadre.x) * k); P[prefixe + "y"] = Math.round(E.y2 - (meilleur.ay - cadre.y) * k);
      P[prefixe + "a"] = meilleur.ha; P[prefixe + "v"] = meilleur.va;
    }
  };
  const zonesDe = new Map(); zones.forEach(z => { const pg = z.properties.page; if (!zonesDe.has(pg)) zonesDe.set(pg, []); zonesDe.get(pg).push(z.properties); });
  for (const aca of academies.features) {
    const page = aca.properties.cle || aca.properties.nom; if (OUTRE_MER.has(aca.properties.academie || page)) continue;
    const dePage = pts.filter(p => (p.f.properties.Page || p.f.properties.Academie) === page); if (!dePage.length) continue;
    const { E, k } = emprisePage(aca), zs = zonesDe.get(page) || [];
    const jourPage = aca.properties.jour, base = pts.filter(p => jourPage == null || (p.f.properties.Jour || "") === jourPage);
    // carte principale : sans les établissements montrés dans un encart ; les encarts et l'échelle sont des obstacles
    const ech = echelleDe(aca), obst = [{ x1: ech.x, y1: ech.y, x2: ech.x + ech.l, y2: ech.y + ech.h },
      ...zs.map(z => ({ x1: z.px - 1, y1: z.py - 1, x2: z.px + z.pw + 1, y2: z.py + z.ph + 1 })),
      ...(estFrance(aca) ? OM_MM.map(o => ({ x1: o.x - 1, y1: o.y - 1, x2: o.x + o.l + 1, y2: o.y + o.h + 1 })) : [])];
    // points hors de la carte principale (outre-mer de la page France entière) : étiquettes placées par QGIS dans leur encart
    poser(CARTE_MM, E, k, dePage.filter(p => !p.f.properties.Zoom && p.x >= E.x1 && p.x <= E.x2 && p.y >= E.y1 && p.y <= E.y2), obst, "L", base);
    // encarts : les établissements de l'académie qui tombent dans l'emprise de l'encart
    zs.forEach(z => {
      const Ez = { x1: z.xmin, y1: z.ymin, x2: z.xmax, y2: z.ymax };
      const dans = dePage.filter(p => p.x >= Ez.x1 && p.x <= Ez.x2 && p.y >= Ez.y1 && p.y <= Ez.y2 && p.f.properties.Ex == null);
      poser({ x: z.px, y: z.py, l: z.pw, h: z.ph }, Ez, (Ez.x2 - Ez.x1) / z.pw, dans, [{ x1: z.px, y1: z.py, x2: z.px + 5.5, y2: z.py + 5.5 }], "E", base);
    });
  }
}

/* ---------- pages de l'atlas : une par académie, ou une par département quand l'académie est illisible ----------
   « auto » : chaque académie est d'abord mise en page entière (encarts, étiquettes) ; si plus d'une étiquette sur cinq
   (seuil réglable) n'a pas trouvé de place malgré les encarts, l'académie est découpée en départements (ceux qui ont
   des établissements retenus), et ses pages sont refaites. « departement » : découpage de toutes les académies de
   métropole qui ont plusieurs départements concernés. Chaque établissement reçoit le champ Page (clé de sa page) et son
   rang dans la page ; pages.geojson (Lambert-93) est la couverture de l'atlas. */
const nomAcad = a => `Académie ${/^[AEIOUÉ]/.test(a) ? "d'" : "de "}${a}`;
function preparerPages(features, acasJson, depsJson, P, lignes) {
  const cmp = {
    signalements: (a, b) => b.Nb_signalements - a.Nb_signalements || (b.Nb_jours || 0) - (a.Nb_jours || 0) || String(b.Derniere_date).localeCompare(String(a.Derniere_date)),
    jours: (a, b) => (b.Nb_jours || 0) - (a.Nb_jours || 0) || b.Nb_signalements - a.Nb_signalements || String(b.Derniere_date).localeCompare(String(a.Derniere_date)),
    recent: (a, b) => String(b.Derniere_date).localeCompare(String(a.Derniere_date)) || b.Nb_signalements - a.Nb_signalements,
  }[P.critere] || ((a, b) => b.Nb_signalements - a.Nb_signalements);
  // pages : une académie, un département, une région académique (ses académies réunies), la France métropolitaine ;
  // « academies » : liste des académies de la page (|A|B|), lue par le modèle QGIS (contours en trait épais, repérage)
  const pageAca = a => ({ type: "Feature", geometry: a.geometry, properties: { cle: a.properties.nom, type: "academie", academie: a.properties.nom, academies: `|${a.properties.nom}|`, dep: null,
    titre: a.properties.nom, surtitre: "Académie :" } });
  const pageDep = (d, aca) => ({ type: "Feature", geometry: d.geometry, properties: { cle: `${aca} – ${d.properties.code} ${d.properties.nom}`, type: "departement", academie: aca, academies: `|${aca}|`, dep: d.properties.code,
    titre: d.properties.nom, surtitre: `${aca} — département ${d.properties.code} :` } });
  const reunir = acas => ({ type: "MultiPolygon", coordinates: acas.flatMap(a => a.geometry.type === "Polygon" ? [a.geometry.coordinates] : a.geometry.coordinates) });
  const pageGroupe = (cle, type, titre, surtitre, acas) => acas.length === 1 && type === "region" && OUTRE_MER.has(acas[0].properties.nom) ? pageAca(acas[0])
    : { type: "Feature", geometry: reunir(acas), properties: { cle, type, academie: null, academies: `|${acas.map(a => a.properties.nom).join("|")}|`, dep: null, titre, surtitre } };
  // une page par jour (points par jour ou par signalement) : chaque page de base est déclinée sur les jours où elle a des points
  const parJour = ["jour", "aucun"].includes(P.regroupement) && P.pagesParJour !== false;
  const libelleJour = j => j ? new Date(j + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "date inconnue";
  const dansBase = (pg, p) => String(pg.properties.academies || `|${pg.properties.academie}|`).includes(`|${p.Academie}|`) && (!pg.properties.dep || pg.properties.dep === p.Dep);
  const decliner = bases => !parJour ? bases : bases.flatMap(pg => [...new Set(features.filter(f => dansBase(pg, f.properties)).map(f => f.properties.Jour || ""))].sort()
    .map(j => ({ ...pg, properties: { ...pg.properties, cle: `${pg.properties.cle} · ${j || "sans date"}`, jour: j, jour_libelle: libelleJour(j) } })))
    .sort((a, b) => a.properties.jour.localeCompare(b.properties.jour));   // tri stable : par jour, puis dans l'ordre des académies
  const academiesUtiles = acasJson.features.filter(a => features.some(f => f.properties.Academie === a.properties.nom));
  const depsDe = aca => depsJson.features.filter(d => d.properties.academie === aca && features.some(f => f.properties.Academie === aca && f.properties.Dep === d.properties.code));
  const proteges = lignes || 22;
  // met en page un ensemble de pages : rattachement, rang, encarts, étiquettes ; renvoie la part d'étiquettes sans place par page
  const evaluer = pages => {
    features.forEach(f => {
      const p = f.properties, jourOk = x => x.properties.jour == null || x.properties.jour === (p.Jour || "");
      const pg = pages.find(x => dansBase(x, p) && jourOk(x)) || pages.find(x => String(x.properties.academies || "").includes(`|${p.Academie}|`) && jourOk(x));
      p.Page = pg ? pg.properties.cle : p.Academie;
      ["Zoom", "Lx", "Ly", "La", "Lv", "Lh", "Ex", "Ey", "Ea", "Ev", "Eh"].forEach(c => { p[c] = null; });
    });
    // rang dans la page, par couche (établissements signalés, établissements cités dans la sous-table)
    const parPage = new Map(), parCouche = new Map();
    features.forEach(f => { const k = f.properties.Page, kc = `${k}|${f.properties.Couche || ""}`;
      if (!parPage.has(k)) parPage.set(k, []); parPage.get(k).push(f.properties);
      if (!parCouche.has(kc)) parCouche.set(kc, []); parCouche.get(kc).push(f.properties); });
    for (const l of parCouche.values()) { l.sort((a, b) => cmp(a, b) || a.Etablissement.localeCompare(b.Etablissement, "fr")); l.forEach((p, i) => { p.Rang = i + 1; }); }
    const fc = { features: pages };
    const enc = P.encarts !== false ? calculerEncarts(features, fc, { max: P.encartsMax, min: P.encartsMin, ecart: P.encartsEcart }) : { zones: [], zoomDe: new Map() };
    features.forEach(f => { f.properties.Zoom = enc.zoomDe.get(f) || null; });
    if (P.etiquettesPlacees !== false) placerEtiquettes(features, fc, enc.zones, +P.etiquettes || 5, pr => (pr.Rang || 1e9) <= proteges);
    const sansPlace = new Map();
    for (const [k, l] of parPage) sansPlace.set(k, l.filter(p => p.Lh === 1 || p.Eh === 1).length / l.length);
    return { enc, sansPlace };
  };
  // points de chaque page : tous (Nb_etablissements, filtre de l'atlas), signalés (Nb_signales) et cités dans la sous-table (Nb_cites)
  const compter = pgs => pgs.forEach(pg => { const l = features.filter(f => f.properties.Page === pg.properties.cle), c = l.filter(f => f.properties.Couche === "sous-table").length;
    Object.assign(pg.properties, { Nb_etablissements: l.length, Nb_signales: l.length - c, Nb_cites: c }); });
  // France métropolitaine (une page) et territoires d'outre-mer concernés ; régions académiques ayant des points
  if (P.decoupage === "national" || P.decoupage === "region" || P.decoupage === "france") {
    let bases;
    if (P.decoupage === "france") {
      // France entière : emprise de la métropole (carte principale), académies d'outre-mer comprises dans la page (encarts)
      const metro = acasJson.features.filter(a => !OUTRE_MER.has(a.properties.nom)), pg = pageGroupe("France entière", "france", "France entière", "Territoire :", metro);
      pg.properties.academies = `|${acasJson.features.map(a => a.properties.nom).join("|")}|`;
      bases = [pg];
    } else if (P.decoupage === "national") {
      const metro = acasJson.features.filter(a => !OUTRE_MER.has(a.properties.nom));
      bases = [...(academiesUtiles.some(a => !OUTRE_MER.has(a.properties.nom)) ? [pageGroupe("France métropolitaine", "national", "France métropolitaine", "Territoire :", metro)] : []),
        ...academiesUtiles.filter(a => OUTRE_MER.has(a.properties.nom)).map(pageAca)];
    } else {
      bases = Object.entries(REGIONS_ACADEMIQUES).map(([reg, noms]) => [reg, acasJson.features.filter(a => noms.includes(a.properties.nom))])
        .filter(([, acas]) => acas.some(a => academiesUtiles.includes(a))).map(([reg, acas]) => pageGroupe(reg, "region", reg, "Région académique :", acas));
    }
    const pages = decliner(bases), res = evaluer(pages);
    compter(pages);
    return { pages, enc: res.enc, decoupees: [] };
  }
  let pages = decliner(academiesUtiles.map(pageAca)), decoupees = [];
  const decoupable = a => !OUTRE_MER.has(a.properties.nom) && depsDe(a.properties.nom).length > 1;
  if (P.decoupage === "departement") decoupees = academiesUtiles.filter(decoupable).map(a => a.properties.nom);
  else if (P.decoupage !== "academie") {
    const essai = evaluer(pages), seuil = Math.max(0, Math.min(1, (+P.seuilIllisible || 20) / 100));
    // académie illisible : au moins une de ses pages (un jour donné, le cas échéant) au-delà du seuil
    decoupees = academiesUtiles.filter(a => decoupable(a) && pages.some(pg => pg.properties.academie === a.properties.nom && (essai.sansPlace.get(pg.properties.cle) || 0) > seuil)).map(a => a.properties.nom);
    if (!decoupees.length) { compter(pages); return { pages, enc: essai.enc, decoupees }; }
  }
  pages = decliner(academiesUtiles.flatMap(a => decoupees.includes(a.properties.nom) ? depsDe(a.properties.nom).map(d => pageDep(d, a.properties.nom)) : [pageAca(a)]));
  const res = evaluer(pages);
  compter(pages);
  return { pages, enc: res.enc, decoupees };
}

/* ---------- marques : catégories de la couche « marques » (une par valeur, couleurs de Grist) et titre de légende ---------- */
const PALETTE_MARQUES = ["#c81e1e", "#2e8540", "#9a6fb0", "#e08a00", "#0063cb", "#7d4e5b", "#009081", "#666666"];
function poserMarques(qgs, fc, m) {
  const blocRenderer = /(<renderer-v2 [^>]*attr="Marque"[^>]*>)([\s\S]*?)(<\/renderer-v2>)/;
  const valeurs = m ? [...new Set(fc.features.map(f => f.properties.Marque).filter(v => v != null && v !== ""))] : [];
  const choix = m && m.colonne ? m.colonne.choix : [];
  valeurs.sort((a, b) => ((choix.indexOf(a) + 1) || 1e6) - ((choix.indexOf(b) + 1) || 1e6) || a.localeCompare(b, "fr"));
  const rgba = h => { const x = String(h || "").replace("#", ""); return x.length >= 6 ? `${parseInt(x.slice(0, 2), 16)},${parseInt(x.slice(2, 4), 16)},${parseInt(x.slice(4, 6), 16)},255` : null; };
  qgs = qgs.replace(blocRenderer, (tout, debut, corps, fin) => {
    // symbole modèle « 0 » : élément complet, sous-symboles compris (balises <symbol> imbriquées)
    const cat = (/<category [^>]*\/>/.exec(corps) || [])[0], debutSym = corps.search(/<symbol [^>]*name="0"/);
    let sym = null;
    if (debutSym >= 0) { const re = /<symbol[\s>]|<\/symbol>/g; re.lastIndex = debutSym; let n = 0, m;
      while ((m = re.exec(corps))) { n += m[0] === "</symbol>" ? -1 : 1; if (!n) { sym = corps.slice(debutSym, m.index + 9); break; } } }
    if (!cat || !sym) return tout;
    const cats = valeurs.map((v, i) => cat.replace(/value="[^"]*"/, `value="${xmlTexte(v)}"`).replace(/label="[^"]*"/, `label="${xmlTexte(v)}"`).replace(/symbol="\d+"/, `symbol="${i}"`).replace(/uuid="[^"]*"/, `uuid="{marque-${i}}"`)).join("");
    const syms = valeurs.map((v, i) => sym.replace(/name="0"/, `name="${i}"`).replace(/name="@0@/g, `name="@${i}@`).split("200,30,30,255").join(rgba((m.colonne && m.colonne.couleurs[v]) || PALETTE_MARQUES[i % PALETTE_MARQUES.length]))).join("");
    return debut + corps.replace(/<categories>[\s\S]*?<\/categories>/, `<categories>${cats}</categories>`).replace(/<symbols>[\s\S]*?<\/symbols>/, `<symbols>${syms}</symbols>`) + fin;
  });
  // légende : titre de la marque, ou entrée retirée (et couche décochée) sans marque
  if (valeurs.length) return qgs.split("@@MARQUES_TITRE@@").join(xmlTexte(m.titre || (m.colonne ? m.colonne.libelle : m.table)));
  qgs = qgs.replace(/<layer-tree-layer [^>]*name="marques"[^>]*>(?:(?!<\/layer-tree-layer>)[\s\S])*?@@MARQUES_TITRE@@[\s\S]*?<\/layer-tree-layer>/, "");
  return cocherCouches(qgs, t => /name="marques"/.test(t), false);
}

/* ---------- couleurs et formes des points : catégories de la couche « signalements » (champ Categorie) ----------
   Le symbole de la première catégorie du modèle sert de patron (taille, contour, atténuation hors page) : sa couleur et sa
   forme sont remplacées pour chaque catégorie du profil. Titre de la légende : celui du profil. */
function poserCategories(qgs, categories, titre) {
  const blocRenderer = /(<renderer-v2 [^>]*attr="Categorie"[^>]*>)([\s\S]*?)(<\/renderer-v2>)/;
  const rgb = h => { const x = String(h || "").replace("#", ""); return x.length >= 6 ? `${parseInt(x.slice(0, 2), 16)},${parseInt(x.slice(2, 4), 16)},${parseInt(x.slice(4, 6), 16)}` : "102,102,102"; };
  let applique = false;
  if (categories.length) qgs = qgs.replace(blocRenderer, (tout, debut, corps, fin) => {
    const cat = (/<category [^>]*\/>/.exec(corps) || [])[0], debutSym = corps.search(/<symbol [^>]*name="0"/);
    let sym = null;
    if (debutSym >= 0) { const re = /<symbol[\s>]|<\/symbol>/g; re.lastIndex = debutSym; let n = 0, m;
      while ((m = re.exec(corps))) { n += m[0] === "</symbol>" ? -1 : 1; if (!n) { sym = corps.slice(debutSym, m.index + 9); break; } } }
    if (!cat || !sym) return tout;
    // couleur du patron : celle de sa couche de symbole (« r,g,b,a »), reprise aussi dans les expressions d'atténuation
    // (ordre des attributs variable selon l'enregistrement de QGIS : options repérées par leur nom, quel que soit l'ordre)
    const optColor = /<Option\b[^>]*\bname="color"[^>]*>/.exec(sym), modele = optColor ? (/\bvalue="(\d+,\d+,\d+),\d+"/.exec(optColor[0]) || [])[1] : null;
    const cats = categories.map((c, i) => cat.replace(/value="[^"]*"/, `value="${xmlTexte(c.libelle)}"`).replace(/label="[^"]*"/, `label="${xmlTexte(c.libelle)}"`)
      .replace(/symbol="\d+"/, `symbol="${i}"`).replace(/uuid="[^"]*"/, `uuid="{categorie-${i}}"`).replace(/render="false"/, 'render="true"')).join("");
    const syms = categories.map((c, i) => {
      let x = sym.replace(/name="0"/, `name="${i}"`).replace(/name="@0@/g, `name="@${i}@`);
      if (modele) x = x.split(modele).join(rgb(c.couleur));
      // forme du marqueur simple (option « name » non vide de la couche de symbole)
      return x.replace(/<Option\b[^>]*\bname="name"[^>]*\/>/g, o => /\bvalue="[a-z_]+"/.test(o) ? o.replace(/\bvalue="[a-z_]+"/, `value="${c.forme}"`) : o)
        .replace(/(<prop k="name" v=")([a-z_]+)(")/, `$1${c.forme}$3`);
    }).join("");
    applique = true;
    return debut + corps.replace(/<categories>[\s\S]*?<\/categories>/, `<categories>${cats}</categories>`).replace(/<symbols>[\s\S]*?<\/symbols>/, `<symbols>${syms}</symbols>`) + fin;
  });
  // titre de la couche dans la légende
  if (titre) qgs = qgs.replace(/<Option\b[^>]*\bname="legend\/title-label"[^>]*\/>/g, o => o.replace('value="Établissements signalés"', `value="${xmlTexte(titre)}"`));
  return { qgs, applique };
}
/* Pages de plusieurs académies (région académique, France métropolitaine) : les règles du modèle qui comparent une académie
   à celle de la page (contours épais, carte de repérage) acceptent aussi les académies listées dans le champ « academies ». */
function poserAcademiesPage(qgs) {
  if (qgs.includes("attribute(@atlas_feature, 'academies')")) return qgs;   // modèle déjà à jour
  const ancien = "&quot;nom&quot; = coalesce(attribute(@atlas_feature, 'academie'), @atlas_pagename)";
  const nouveau = "(&quot;nom&quot; = coalesce(attribute(@atlas_feature, 'academie'), @atlas_pagename) OR strpos(coalesce(attribute(@atlas_feature, 'academies'), ''), '|' || &quot;nom&quot; || '|') &gt; 0)";
  return qgs.split(ancien).join(nouveau);
}
// Compte en bas de carte : « sites signalés » au lieu d'« établissements signalés » pour un point par site
function poserUnite(qgs, unite) {
  if (unite !== "site") return qgs;
  return qgs.split("établissements signalés").join("sites signalés").split("établissement signalé").join("site signalé");
}

/* ---------- projet QGIS ---------- */
// PDF léger : résolution d'export des mises en page (dpi des images : fonds IGN, voile) et textes exportés comme du texte
// (propriété pdfTextFormat de la mise en page, reprise par la fenêtre d'export de QGIS ; réglage par défaut du projet aussi)
const resolutionPdf = P => [100, 150, 200, 300].includes(+P.resolution) ? +P.resolution : 150;
function poserExportPdf(qgs, dpi) {
  qgs = qgs.replace(/(<Layout\s[^>]*?printResolution=")\d+(")/g, `$1${dpi}$2`)
    .replace(/(<PAL[\s>][\s\S]*?<TextFormat type="int">)\d(<\/TextFormat>)/, "$11$2");
  // propriété de la mise en page : dans son dernier bloc <customproperties> avant <Atlas
  return qgs.replace(/<Layout\s[\s\S]*?<\/Layout>/g, lay => {
    if (/name="pdfTextFormat"/.test(lay)) return lay.replace(/<Option ([^>]*name="pdfTextFormat"[^>]*)\/>/, (m, a) => `<Option ${a.replace(/value="\d+"/, 'value="1"')}/>`);
    const fin = lay.lastIndexOf("<Atlas"), debut = fin < 0 ? -1 : lay.lastIndexOf("<customproperties", fin);
    if (debut < 0) return lay;
    const bloc = lay.slice(debut, fin), opt = '<Option type="int" value="1" name="pdfTextFormat"/>';
    const nouveau = /<customproperties\s*\/>/.test(bloc) ? bloc.replace(/<customproperties\s*\/>/, `<customproperties><Option type="Map">${opt}</Option></customproperties>`)
      : bloc.replace(/(<customproperties>\s*<Option type="Map">)/, `$1${opt}`);
    return lay.slice(0, debut) + nouveau + lay.slice(fin);
  });
}
// Variables du projet (titre, date…) : remplacées ou ajoutées, quel que soit le modèle
function poserVariables(qgs, vars) {
  return qgs.replace(/<Variables>([\s\S]*?)<\/Variables>/, (bloc, corps) => {
    const lire = tag => { const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(corps); return m ? [...m[1].matchAll(/<value>([\s\S]*?)<\/value>/g)].map(x => x[1]) : []; };
    const noms = lire("variableNames"), valeurs = lire("variableValues");
    Object.entries(vars).forEach(([k, v]) => { const i = noms.indexOf(k); if (i >= 0) valeurs[i] = xmlTexte(v); else { noms.push(k); valeurs.push(xmlTexte(v)); } });
    const liste = (tag, l) => `<${tag} type="QStringList">${l.map(x => `<value>${x}</value>`).join("")}</${tag}>`;
    return `<Variables>${liste("variableNames", noms)}${liste("variableValues", valeurs)}</Variables>`;
  });
}
// Largeurs des colonnes : selon la longueur des en-têtes et des valeurs, ramenées aux 198 mm du cadre
function largeursColonnes(colonnes, features) {
  const MM_PAR_CAR = 1.3, MARGE = 1.6, CADRE = 198;
  // besoin : en-tête (gras) ou 9e décile des valeurs ; le surplus éventuel va aux colonnes de texte long, pas aux nombres
  const valeurs = colonnes.map(c => {
    const longueurs = features.map(f => String(f.properties[c.nom] ?? "").length).sort((a, b) => a - b);
    return Math.min(42, longueurs.length ? longueurs[Math.floor(longueurs.length * 0.9)] : 0) * MM_PAR_CAR;
  });
  const besoin = colonnes.map((c, i) => Math.max(Math.min(c.titre.length, 30) * 1.12 * MM_PAR_CAR, valeurs[i], 4 * MM_PAR_CAR));
  const dispo = CADRE - MARGE * colonnes.length, total = besoin.reduce((t, x) => t + x, 0);
  let l;
  if (total >= dispo) l = besoin.map(b => b * dispo / total);
  else { const poids = valeurs.map(v => v > 6 * MM_PAR_CAR ? v : 0), somme = poids.reduce((t, x) => t + x, 0) || 1;
    l = besoin.map((b, i) => b + (dispo - total) * (somme === 1 && !poids.some(Boolean) ? 1 / besoin.length : poids[i] / somme)); }
  return l.map(x => Math.max(8, Math.floor(x * 10) / 10));
}
const colonneXml = (c, largeur, ordre = 0) => `<column heading="${xmlTexte(c.titre)}" attribute="${xmlTexte(c.nom)}" sortByRank="0" hAlignment="1" sortOrder="${ordre}" vAlignment="128" width="${largeur}"><backgroundColor alpha="0" blue="0" red="0" green="0"/></column>`;
// Tableau des établissements (table attributaire de la couche « signalements ») : colonnes et tri du profil
function poserTableau(qgs, colonnes, largeurs, tri) {
  const affichees = colonnes.map((c, i) => colonneXml(c, largeurs[i])).join("");
  const triXml = (tri === "rang" ? [{ nom: "Rang", titre: "Rang" }] : [{ nom: "DSDEN", titre: "DSDEN" }, { nom: "Commune", titre: "Commune" }, { nom: "Etablissement", titre: "Etablissement" }])
    .map(c => colonneXml(c, 0)).join("");
  let trouve = 0;
  const res = qgs.replace(/<LayoutMultiFrame [^>]*vectorLayerSource="[^"]*signalements\.geojson"[^>]*>[\s\S]*?<\/LayoutMultiFrame>/g, bloc => {
    trouve++;
    return bloc.replace(/<displayColumns>[\s\S]*?<\/displayColumns>|<displayColumns\/>/, `<displayColumns>${affichees}</displayColumns>`)
      .replace(/<sortColumns>[\s\S]*?<\/sortColumns>|<sortColumns\/>/, `<sortColumns>${triXml}</sortColumns>`);
  });
  return { qgs: res, trouve };
}
// Coche ou décoche des couches de l'arbre des couches (par nom, ou par fournisseur pour les fonds en ligne)
function cocherCouches(qgs, test, coche) {
  return qgs.replace(/<layer-tree-layer [^>]*>/g, t => test(t) ? t.replace(/checked="Qt::(Un)?[Cc]hecked"/, `checked="Qt::${coche ? "Checked" : "Unchecked"}"`) : t);
}
// Vérifie qu'un modèle déposé utilise les fichiers et les champs de l'export
function verifierModele(qgs, champsConnus) {
  const alertes = [];
  if (!/<qgis[\s>]/.test(qgs)) return { ok: false, alertes: ["Ce fichier n'est pas un projet QGIS (.qgs non compressé)."] };
  const sources = [...qgs.matchAll(/<datasource>([^<]*\.geojson)[^<]*<\/datasource>/g)].map(m => m[1]);
  if (!sources.some(s => /(^|[\\/])signalements\.geojson$/.test(s))) alertes.push("Le modèle n'utilise pas « signalements.geojson » : la carte ne montrera pas les données exportées.");
  const absolus = sources.filter(s => !/^\.\.?\//.test(s));
  if (absolus.length) alertes.push(`Chemins absolus dans le modèle (${absolus.slice(0, 3).join(", ")}) : enregistrez le projet avec des chemins relatifs (Projet › Propriétés › Général).`);
  // champs cités : attributs de champ (tableaux, symbologie, étiquettes) et noms entre guillemets dans les expressions
  const utilises = new Set(), estChamp = x => /^[A-Za-z_]\w*$/.test(x);
  for (const m of qgs.matchAll(/\s(?:attribute|attr|fieldName|classificationAttribute)="([^"]+)"/g)) if (estChamp(m[1])) utilises.add(m[1]);
  const expressions = [...qgs.matchAll(/\s(?:expression|featureFilter|filterExpression|pageNameExpression|sortKey|filter|fieldName)="([^"]*)"/g), ...qgs.matchAll(/<Option[^>]*name="expression"[^>]*value="([^"]*)"/g), ...qgs.matchAll(/<rule [^>]*filter="([^"]*)"/g)].map(m => m[1]);
  expressions.forEach(e => { for (const m of e.matchAll(/&quot;([A-Za-z_]\w*)&quot;/g)) utilises.add(m[1]); });
  const inconnus = [...utilises].filter(c => !champsConnus.has(c));
  if (inconnus.length) alertes.push(`Champs utilisés par le modèle et absents de l'export : ${inconnus.slice(0, 12).join(", ")}${inconnus.length > 12 ? "…" : ""}.`);
  return { ok: true, alertes };
}
const CHAMPS_CONTOURS = ["nom", "departements", "code", "dsden", "academie", "Nb_etablissements",
  "cle", "page", "num", "nb", "Nb_signales", "Nb_cites", "px", "py", "pw", "ph", "xmin", "xmax", "ymin", "ymax", "zoom",   // zones d'encart
  "Zoom", "Lx", "Ly", "La", "Lv", "Lh", "Ex", "Ey", "Ea", "Ev", "Eh",
  "Page", "Dep", "ordre", "titre", "surtitre", "type", "dep", "academies", "jour", "jour_libelle"];                                      // pages de l'atlas                          // positions d'étiquettes

async function lireFichierAtlas(f) {
  const r = await fetch(new URL(`atlas/${f}`, location.href).href);
  if (!r.ok) throw new Error(`fichier ${f} introuvable (${r.status})`);
  return r.text();
}

// Modèle déposé d'avant les points propres de la sous-table : couche « marques » lue dans signalements.geojson.
// Elle passe à marques.geojson, son losange n'est décalé que pour Decale = 1, et elle reçoit les étiquettes du modèle intégré.
async function majCoucheMarques(qgs, modele) {
  const re = /<maplayer [^>]*>(?:(?!<\/maplayer>)[\s\S])*?<\/maplayer>/g;
  const bloc = [...qgs.matchAll(re)].map(m => m[0]).find(b => /attr="Marque"/.test(b));
  if (!bloc) return { qgs, note: modele ? "Le modèle QGIS déposé n'a pas de couche « marques » : les établissements cités dans la sous-table ne sont pas dessinés. Repartez du modèle intégré, reportez-y vos retouches et déposez-le à nouveau." : "" };
  if (/<datasource>[^<]*marques\.geojson/.test(bloc)) return { qgs, note: "" };
  const id = (/<id>([^<]+)<\/id>/.exec(bloc) || [])[1];
  let nouveau = bloc.replace(/(<datasource>[^<]*?)signalements\.geojson/, "$1marques.geojson")
    .replace(/value="translate\(\$geometry, ([^"]*?)\)"/, (m, args) => `value="CASE WHEN &quot;Decale&quot; = 0 THEN $geometry ELSE translate($geometry, ${args}) END"`);
  // étiquettes : celles de la couche « marques » du modèle intégré
  if (!/<labeling[\s>]/.test(nouveau)) {
    try {
      const integre = await lireFichierAtlas("atlas.qgs");
      const ref = [...integre.matchAll(re)].map(m => m[0]).find(b => /attr="Marque"/.test(b)) || "";
      const lab = (/<labeling [^>]*>[\s\S]*?<\/labeling>/.exec(ref) || [])[0];
      if (lab) nouveau = nouveau.replace(/labelsEnabled="0"/, 'labelsEnabled="1"').replace(/<\/renderer-v2>/, `</renderer-v2>\n      ${lab}`);
    } catch (_) { /* sans étiquettes */ }
  }
  qgs = qgs.replace(bloc, () => nouveau);
  // arbre des couches et légende : même source
  if (id) qgs = qgs.replace(new RegExp(`(<layer-tree-layer [^>]*id="${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*source=")[^"]*signalements\\.geojson"`, "g"), "$1./marques.geojson\"");
  return { qgs, note: "" };
}

async function construireAtlas(name) {
  const P = AtlasUI.profilCourant();
  if ((P.marques || {}).table) await chargerSousTables();
  const { fc, detail, sous, infos } = signalementsAtlas(P), JSZip = await loadJSZip();
  // tous les points de la carte (établissements signalés et établissements cités dans la sous-table) : pages, encarts, étiquettes
  const tousPoints = [...fc.features, ...sous.features];
  const modele = await AtlasUI.modeleCourant();          // { texte, origine } ou null (modèle intégré)
  const [qgsBase, acas, deps] = await Promise.all([modele ? Promise.resolve(modele.texte) : lireFichierAtlas("atlas.qgs"), lireFichierAtlas("academies.geojson"), lireFichierAtlas("departements.geojson")]);
  const lignes = Math.max(0, Math.min(5000, parseInt(P.lignes, 10) || 0));
  // pages (académies ou départements), rangs, encarts et étiquettes
  const acasJson = JSON.parse(acas), depsJson = JSON.parse(deps);
  const sansPage = [...new Set(tousPoints.map(f => f.properties.Academie))].filter(k => !acasJson.features.some(a => a.properties.nom === k));
  const { pages, enc, decoupees } = preparerPages(tousPoints, acasJson, depsJson, P, lignes);
  acasJson.features.forEach(a => { a.properties.Nb_etablissements = tousPoints.filter(f => f.properties.Academie === a.properties.nom).length; });
  const pagesFc = { type: "FeatureCollection", name: "pages", crs: { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::2154" } },
    features: pages.map((pg, i) => ({ type: "Feature", geometry: pg.geometry, properties: { ...pg.properties, ordre: i + 1 } })) };
  const vide = { type: "Feature", geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }, properties: { cle: "", page: "", num: 0, nb: 0, px: 0, py: 0, pw: 0, ph: 0, xmin: 0, xmax: 1, ymin: 0, ymax: 1, zoom: 1 } };
  const zonesFc = { type: "FeatureCollection", name: "zones", crs: { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::2154" } }, features: enc.zones.length ? enc.zones : [vide] };
  let projet = poserVariables(qgsBase.replace("@@TITRE@@", "").replace("@@DATE@@", "").replace("@@SERVICE@@", "").replace("@@LIGNES@@", "22"),
    { atlas_titre: P.titre || "Signalements", atlas_date: $("atlasDate").value.trim(), atlas_service: P.service || "", atlas_lignes: String(lignes), atlas_etiquette: String(+P.etiquettes || 5) });
  const notes = [];
  if (P.decoupage === "france" && !/id="om1"/.test(qgsBase))
    notes.push("Le modèle QGIS déposé n'a pas les encarts de l'outre-mer (page France entière) : les points d'outre-mer figurent au tableau mais pas sur la carte. Repartez du modèle intégré, reportez-y vos retouches et déposez-le à nouveau.");
  if (modele && !/pages\.geojson/.test(qgsBase) && decoupees.length)
    notes.push(`Le modèle QGIS déposé date d'avant les pages départementales : il garde une page par académie (${decoupees.join(", ")} restent illisibles). Repartez du modèle intégré (« Revenir au modèle intégré »), reportez-y vos retouches et déposez-le à nouveau.`);
  if (P.tableauWidget !== false) {
    const colonnes = (P.colonnes || []).map(c => ({ nom: /^(col|ref):/.test(c.champ) ? nomExport(c.champ.slice(4)) : c.champ, titre: c.titre || c.champ.replace(/^(col|ref):/, "") }))
      .filter(c => c.nom);
    if (colonnes.length) {
      const r = poserTableau(projet, colonnes, largeursColonnes(colonnes, fc.features), P.tri);
      projet = r.qgs; if (!r.trouve) notes.push("Aucun tableau du modèle n'utilise la couche « signalements » : colonnes du profil non appliquées.");
    }
  }
  // modèle antérieur à 2.3.1 : pages choisies par aggregate('signalements', …), qui casse si la couche est renommée
  projet = projet.split("array_length(array_filter(aggregate('signalements', 'array_agg', &quot;Academie&quot;), @element = @atlas_pagename))")
    .join("coalesce(attribute(@atlas_feature, 'Nb_etablissements'), 0)");
  // (les valeurs d'attributs peuvent contenir « > » : on cible directement l'attribut featureFilter de l'élément Atlas)
  projet = projet.replace(/(<Atlas\s[^]*?featureFilter=")([^"]*)(")/, (m, a, v, b) => /aggregate\(/.test(v) ? `${a}coalesce(&quot;Nb_etablissements&quot;, 0) &gt; 0${b}` : m);
  // couche des marques : losanges accolés aux établissements signalés (Decale = 1) et établissements cités (Decale = 0)
  const marquesFc = { type: "FeatureCollection", name: "marques", features: [
    ...fc.features.filter(f => f.properties.Marque).map(f => ({ ...f, properties: { ...f.properties, Decale: 1 } })),
    ...sous.features.map(f => ({ ...f, properties: { ...f.properties, Decale: 0 } }))] };
  if (!marquesFc.features.length) marquesFc.features.push({ type: "Feature", geometry: { type: "Point", coordinates: [-60, -60] }, properties: { Decale: 1, Page: "—", Couche: "vide", Marque: null } });
  const maj = await majCoucheMarques(projet, modele);
  projet = maj.qgs; if (maj.note && marquesFc.features.some(f => f.properties.Couche === "sous-table")) notes.push(maj.note);
  projet = poserMarques(projet, marquesFc, infos.marques);
  // couleurs et formes des points, titre de la légende ; pages de plusieurs académies ; unité du compte (sites)
  const SYM = infos.symbologie, pc = poserCategories(projet, SYM.categories, SYM.titre || (infos.regroupement === "site" ? "Sites signalés" : ""));
  projet = pc.qgs; if (!pc.applique && SYM.categories.length) notes.push("Le modèle QGIS n'a pas de symbologie catégorisée sur le champ Categorie pour la couche « signalements » : couleurs et formes du profil non appliquées.");
  projet = poserUnite(poserAcademiesPage(projet), infos.regroupement);
  projet = cocherCouches(projet, t => /providerKey="wms"/.test(t), P.fondsIgn !== false);
  projet = poserExportPdf(projet, resolutionPdf(P));
  // étiquettes des établissements voisins (autres académies ou départements) : règle d'étiquetage activée ou non
  projet = projet.replace(/<rule ([^>]*description="(?:Académies voisines|Établissements voisins[^"]*)"[^>]*)>/g, (m, attrs) => {
    const a = attrs.replace(/\s*active="[01]"/, ""); return P.etiquettesVoisins === false ? `<rule ${a} active="0">` : `<rule ${a}>`; });
  projet = cocherCouches(projet, t => /name="voile hors académie"/.test(t), P.voile !== false);
  const nb = new Set(tousPoints.map(f => f.properties.Academie)).size, unite = infos.regroupement === "site" ? "site(s)" : "établissement(s)";
  const champTable = c => /^(col|ref):/.test(c.champ) ? `${nomExport(c.champ.slice(4))} (${AGREGATS[c.agregat || agregatParDefaut(colTypes[c.champ.slice(4)] || "")]})` : c.champ;
  const SYMB = infos.symbologie;
  const lisezmoi = [`Atlas des signalements — ${fc.features.length} ${unite}, ${nb} académie(s), ${pages.length} page(s).`,
    `Profil : « ${AtlasUI.nomProfil()} » ; modèle QGIS : ${modele ? modele.origine : "modèle intégré au widget"}.`, "",
    "1. Dézippez le dossier (les fichiers doivent rester ensemble).", "2. Ouvrez atlas.qgs dans QGIS (3.34 ou plus récent).",
    "3. Projet › Mises en page › « Atlas par académie ».", "4. Atlas › Exporter l'atlas en PDF : une page par territoire ayant des signalements.", "",
    "Réglages du profil",
    `- Tableau : ${lignes ? `les ${lignes} premiers points de chaque page` : "tous les points (pages supplémentaires si besoin)"}, classés par ${{ signalements: "nombre de signalements", jours: "nombre de jours concernés", recent: "date du dernier signalement" }[P.critere] || P.critere} (champ Rang), triés ${P.tri === "rang" ? "par rang" : "par DSDEN, commune, établissement"}.`,
    `- Couleurs et formes : selon « ${SYMB.champ.replace(/^(col|ref):/, "")} » (champ Categorie = libellé de la légende) : ${SYMB.categories.map(c => `${c.libelle} (${FORMES[c.forme] || c.forme}, ${c.couleur})`).join(" ; ") || "aucune catégorie"}${SYMB.items.some(x => x.garder === false) || SYMB.autres.garder === false ? ` ; écartées : ${[...SYMB.items.filter(x => x.garder === false).map(x => x.valeur), ...(SYMB.autres.garder === false ? ["autres valeurs"] : [])].join(", ")}` : ""}.`,
    P.tableauWidget !== false ? `- Colonnes : ${(P.colonnes || []).map(c => `${c.titre || c.champ} = ${champTable(c)}`).join(" ; ")}.` : "- Colonnes : celles du modèle QGIS.",
    `- Qualification principale : ${{ frequente: "la plus fréquente, à égalité la plus récente", recente: "la plus récente", ordre: "la première dans l'ordre des choix de la colonne dans Grist" }[P.principale]}.`,
    `- Valeurs ignorées${P.exclureTout ? " (signalements écartés de l'atlas)" : " (pour la qualification principale et les jours)"} : ${(P.exclues || []).join(", ") || "aucune"}.`,
    `- Jours concernés (Nb_jours) : ${infos.regroupement === "site" ? "jours distincts où le site figure dans un signalement non ignoré, toutes versions" : infos.jours ? `valeur la plus haute de la colonne « ${infos.jours} », toutes versions` : "jours distincts (date des faits, à défaut de saisie) ayant un signalement non ignoré, toutes versions"}.`,
    `- Fonds IGN : ${P.fondsIgn !== false ? "cochés" : "décochés (à cocher dans le groupe « Fonds de carte »)"} ; voile gris hors du territoire de la page : ${P.voile !== false ? "oui" : "non"}.`,
    `- PDF : fonds à ${resolutionPdf(P)} dpi (Mise en page › Exporter les paramètres › Résolution d'export), textes exportés comme du texte (sélectionnables, plus légers). Pour un fichier encore plus léger : 100 dpi dans le profil.`,
    `- Encarts de zoom : ${P.encarts !== false ? `${enc.zones.length} sur l'ensemble des pages (au plus ${P.encartsMax} par page, zones d'au moins ${P.encartsMin} établissements à moins de ${P.encartsEcart} mm sur la carte) ; couche « zones », cadres pointillés numérotés` : "non"}.`,
    `- Points retenus : ${fc.features.length} sur ${infos.avantFiltre}${(() => { const F = { categories: [], qualifs: [], minSignalements: 1, minJours: 0, ...(P.filtre || {}) };
      const l = [F.qualifs.length ? `qualifications ${F.qualifs.join(", ")}` : "", F.minSignalements > 1 ? `au moins ${F.minSignalements} signalements` : "", F.minJours > 0 ? `au moins ${F.minJours} jours concernés` : ""].filter(Boolean);
      return l.length ? ` (${l.join(" ; ")})` : ""; })()}.`,
    `- Sous-table : ${infos.marques ? `table « ${infos.marques.table} »${infos.marques.colonne ? `, couleur selon « ${infos.marques.colonne.libelle} »` : ""} — ${fc.features.filter(f => f.properties.Marque).length} établissement(s) signalé(s) marqué(s) (losange en haut à droite du point) ; ${sous.features.length} établissement(s) cité(s) dans la sous-table, avec leur propre point (losange) et leur étiquette${infos.marques.lieu ? `, localisés par la ${infos.marques.lieu}` : " (aucune colonne de la sous-table ne désigne un établissement : référence au référentiel, UAI ou Latitude/Longitude)"}. Couche « marques » (marques.geojson : Decale = 1 losange accolé, 0 point propre ; champs Marque, Marque_nb, Marque_valeurs, Signale_par). Pages, encarts et étiquettes tiennent compte des deux couches` : "aucune"}.`,
    `- Étiquettes : ${+P.etiquettes || 5} pt (variable atlas_etiquette)${P.etiquettesPlacees !== false ? " ; placées par le widget (champs Lx/Ly sur la carte, Ex/Ey dans les encarts, traits de rappel), retirées faute de place sauf pour les établissements du tableau (Lh/Eh = 1)" : " ; placement automatique de QGIS"}.`,
    `- Points : ${{ etablissement: "un par établissement", site: `un par site (sous-table « ${infos.sites ? infos.sites.table : "?"} »${infos.sites && infos.sites.siteRef ? `, coordonnées de « ${infos.sites.siteRef.table} », à défaut celles de l'établissement` : ", placés sur leur établissement"})`, jour: "un par établissement et par jour", aucun: "un par signalement" }[infos.regroupement || "etablissement"]}${P.regroupement && P.regroupement !== "etablissement" && P.pagesParJour !== false ? ", une page par jour (date en haut à droite)" : ""}${(P.filtre || {}).debut || (P.filtre || {}).fin ? ` ; période ${(P.filtre || {}).debut || "…"} → ${(P.filtre || {}).fin || "…"}` : ""}.`,
    `- Pages : ${pages.length} (${pages.filter(p => p.properties.type === "departement").length} départementales)${decoupees.length ? ` ; académies découpées en départements : ${decoupees.join(", ")}` : ""} ; découpage ${{ france: "une page France entière (métropole, outre-mer en encarts)", national: "France métropolitaine, plus une page par territoire d'outre-mer concerné", region: "par région académique", academie: "par académie", departement: "par département", auto: `automatique (plus de ${+P.seuilIllisible || 20} % d'étiquettes sans place)` }[P.decoupage || "auto"]}.`,
    ...(sansPage.length ? [`- Académie non reconnue (établissements sans page) : ${sansPage.map(x => x || "(vide)").join(", ")}.`] : []),
    ...notes.map(n => "- " + n), "",
    "Variables du projet (Projet › Propriétés › Variables) : atlas_titre, atlas_date, atlas_service, atlas_lignes (0 = tous).",
    "Si les fonds IGN restent blancs ou si la carte met longtemps à s'afficher, QGIS n'atteint pas internet :",
    "Préférences › Options › Réseau › cocher « Utiliser un proxy pour l'accès web », type « DefaultProxy », puis redémarrer QGIS.", "",
    "Couches de points",
    `- signalements : un point par ${infos.regroupement === "site" ? "site" : "établissement"} (carte et tableau). Champs calculés : ` + CHAMPS_ATLAS.map(c => c[0]).join(", ") + ".",
    `  Colonnes de la table, regroupées par établissement : ${infos.tableCols.map(c => `${nomExport(c.col)} (${AGREGATS[agregatDeProfil(P, c)]})`).join(", ") || "aucune"}.`,
    "- signalements_detail (décochée) : un point par signalement, avec toutes les colonnes de la table telles quelles,",
    "  plus Qualification, Date et Nb_jours de la ligne. Pratique pour symboliser par qualification, gravité, etc.", "",
    "Garder vos retouches QGIS : enregistrez le projet retouché (chemins relatifs) puis déposez-le dans le widget comme modèle du profil.",
    "Les exports suivants le réutiliseront ; seuls les variables, le tableau (si le profil le règle) et les fonds/voile sont modifiés.", "",
    "Sources : signalements (Grist) ; contours IGN Admin Express (Licence ouverte, via france-geojson) ; fonds IGN Géoplateforme."].join("\r\n");
  // points en Lambert-93, comme les contours : les positions d'étiquettes (Lx/Ly…) sont dans le système de la couche
  const enL93 = c => ({ ...c, crs: { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::2154" } },
    features: c.features.map(f => ({ ...f, geometry: { type: "Point", coordinates: versL93(f.geometry.coordinates[0], f.geometry.coordinates[1]).map(v => Math.round(v * 10) / 10) } })) });
  const fcL93 = enL93(fc), detailL93 = enL93(detail), marquesL93 = enL93(marquesFc);
  const zip = new JSZip(), dossier = zip.folder(name);
  dossier.file("atlas.qgs", projet); dossier.file("signalements.geojson", JSON.stringify(fcL93)); dossier.file("signalements_detail.geojson", JSON.stringify(detailL93));
  dossier.file("marques.geojson", JSON.stringify(marquesL93));
  dossier.file("zones.geojson", JSON.stringify(zonesFc)); dossier.file("pages.geojson", JSON.stringify(pagesFc));
  dossier.file("academies.geojson", JSON.stringify(acasJson)); dossier.file("departements.geojson", deps); dossier.file("LISEZMOI.txt", lisezmoi);
  return { name: name + ".zip", blob: await zip.generateAsync({ type: "blob", compression: "DEFLATE" }) };
}
const agregatDeProfil = (P, c) => { const x = (P.colonnes || []).find(k => k.champ === "col:" + c.col || k.champ === "ref:" + c.col); return (x && x.agregat) || agregatParDefaut(c.type); };
// couleurs des choix d'une colonne de la table dans Grist (liste de choix) : { valeur: "#rrggbb" }
function couleursChoix(col) {
  if (!col || !metaT || !metaC || !mainTableId) return {};
  const t = metaT.id[metaT.tableId.indexOf(mainTableId)], i = metaC.id.findIndex((_, k) => metaC.parentId[k] === t && metaC.colId[k] === col);
  try { const o = i < 0 ? {} : JSON.parse(metaC.widgetOptions[i] || "{}"); return Object.fromEntries(Object.entries(o.choiceOptions || {}).filter(([, x]) => x && x.fillColor).map(([v, x]) => [v, x.fillColor])); } catch (_) { return {}; }
}
/* Valeurs proposées pour les couleurs et formes : celles des points (toutes gardées le temps du calcul), dans l'ordre des
   choix de Grist pour une liste de choix (qualification…), sinon de la plus fréquente à la plus rare ; couleurs de Grist,
   sinon une palette. Les valeurs déjà réglées gardent leur réglage. */
function proposerValeurs(P, champ, existants) {
  if (champ === "Categorie") return copie(SYMBO_SCOLAIRE.items);
  let vals = new Map();
  try { const essai = { ...P, symbologie: { champ, items: [], autres: { garder: true } }, filtre: { ...(P.filtre || {}), minSignalements: 1, minJours: 0 } };
    vals = signalementsAtlas(essai).infos.symbologie.valeurs; } catch (_) { vals = new Map(); }
  const qualif = champ === "Qualification_principale" || champ === "Qualifications";
  // point par site : qualification du site, colonne de la sous-table des sites (ordre et couleurs de ses choix)
  const SS = P.regroupement === "site" ? (sousTablesAtlas.find(t => t.table === ((P.sites || {}).table || "") && t.estSites) || sousTablesAtlas.find(t => t.estSites)) : null;
  const cs = qualif && SS && SS.qualif ? SS.colonnes.find(c => c.col === SS.qualif) : null;
  const col = qualif ? ((socle && socle.qualif) || "Qualification") : /^col:/.test(champ) ? champ.slice(4) : null;
  const ordre = cs ? cs.choix : col ? choixColonne(col) : [], couleurs = cs ? cs.couleurs : col ? couleursChoix(col) : {};
  const liste = [...vals.keys()].sort((a, b) => ((ordre.indexOf(a) + 1) || 1e6) - ((ordre.indexOf(b) + 1) || 1e6) || vals.get(b) - vals.get(a) || a.localeCompare(b, "fr"));
  const deja = new Map((existants || []).map(x => [String(x.valeur), x]));
  const res = [...(existants || [])];
  liste.filter(v => !deja.has(v)).forEach(v => res.push({ valeur: v, libelle: v, couleur: couleurs[v] || PALETTE_SYMBO[res.length % PALETTE_SYMBO.length], forme: "circle", garder: true }));
  return res;
}

/* ---------- profils : lecture, enregistrement, formulaire ---------- */
const AtlasUI = (() => {
  let etat = { actif: "Par défaut", profils: { "Par défaut": copie(PROFIL_DEFAUT) } };
  let config = null, ecritureDoc = false, modifie = false, modeleLocal = null, modeleCache = {};
  let nomSaisi = null;   // nom de profil tapé et pas encore enregistré (gardé quand le formulaire se redessine)
  const el = id => document.getElementById(id);
  const statut = (t, cls = "") => { const s = el("atlasStatut"); if (s) { s.textContent = t; s.className = "hint " + cls; } };

  function lireLocal() { try { return JSON.parse(localStorage.getItem(STOCKAGE_LOCAL) || "null"); } catch (_) { return null; } }
  function ecrireLocal() { try { localStorage.setItem(STOCKAGE_LOCAL, JSON.stringify({ etat })); } catch (_) { /* stockage indisponible */ } }

  async function charger() {
    const S = window.Socle;
    try { config = S && grist.docApi ? await S.lireConfig() : null; } catch (_) { config = null; }
    ecritureDoc = !!config;
    const doc = config && config.valeurs[CLE_ATLAS];
    const local = lireLocal();
    if (doc && doc.profils && Object.keys(doc.profils).length) etat = { actif: doc.actif in doc.profils ? doc.actif : Object.keys(doc.profils)[0], profils: doc.profils };
    else if (local && local.etat && local.etat.profils) etat = local.etat;
    else if (local) {   // anciens réglages de ce navigateur (2.0.11 à 2.0.14)
      const p = copie(PROFIL_DEFAUT);
      if (local.titre) p.titre = local.titre; if (local.service) p.service = local.service;
      if (Number.isInteger(local.lignes)) p.lignes = local.lignes; if (local.ign === false) p.fondsIgn = false;
      etat.profils["Par défaut"] = p;
    }
    // titre par défaut : la situation suivie (Config › general)
    const p = etat.profils[etat.actif];
    if (p && !p.titre && config && S) { const g = S.general(config); if (g && g.situation) p.titre = g.situation; }
  }
  const profilCourant = () => ({ ...copie(PROFIL_DEFAUT), ...etat.profils[etat.actif] });
  const nomProfil = () => etat.actif;

  async function enregistrer(nom) {
    nom = String(nom || "").trim(); if (!nom) { statut("Donnez un nom au profil.", "err"); return; }
    lireFormulaire();
    const p = etat.profils[etat.actif];
    if (nom !== etat.actif) { etat.profils[nom] = copie(p); etat.actif = nom; }
    ecrireLocal();
    if (!ecritureDoc) { modifie = false; dessiner(); statut("Profil gardé dans ce navigateur (le document n'a pas de table Config).", "warn"); return; }
    try {
      await window.Socle.ecrireConfig(CLE_ATLAS, { actif: etat.actif, profils: etat.profils, maj: new Date().toISOString() });
      config = await window.Socle.lireConfig(); modifie = false; dessiner();
      statut(`Profil « ${nom} » enregistré dans le document.`, "ok");
    } catch (e) { modifie = false; dessiner(); statut(`Profil gardé dans ce navigateur seulement : enregistrement dans le document refusé (${e.message}).`, "warn"); }
  }
  async function supprimer() {
    if (Object.keys(etat.profils).length <= 1) { statut("Il faut garder au moins un profil.", "err"); return; }
    const nom = etat.actif; delete etat.profils[nom]; etat.actif = Object.keys(etat.profils)[0];
    ecrireLocal();
    try {
      if (ecritureDoc) {
        const acts = [window.Socle.actionConfig(config, CLE_ATLAS, { actif: etat.actif, profils: etat.profils, maj: new Date().toISOString() })];
        const idModele = config.ids[PREFIXE_MODELE + nom]; if (idModele) acts.push(["RemoveRecord", window.Socle.TABLE_CONFIG || "Config", idModele]);
        await grist.docApi.applyUserActions(acts); config = await window.Socle.lireConfig();
      }
      statut(`Profil « ${nom} » supprimé.`, "ok");
    } catch (e) { statut(`Suppression gardée dans ce navigateur seulement (${e.message}).`, "warn"); }
    modifie = false; dessiner();
  }

  /* modèle QGIS du profil : pièce jointe dans Config (clé atlas_modele:<profil>, colonne Fichier) */
  async function telechargerPieceJointe(id) {
    const jeton = await grist.docApi.getAccessToken({ readOnly: true });
    const r = await fetch(`${jeton.baseUrl}/attachments/${id}/download?auth=${jeton.token}`);
    if (!r.ok) throw new Error(`pièce jointe illisible (${r.status})`);
    return r.text();
  }
  function idModeleDoc() {
    const id = config && config.ids[PREFIXE_MODELE + etat.actif];
    return id ? (modeleCache[etat.actif + ":id"] = id) : null;
  }
  async function modeleCourant() {
    if (modeleLocal) return { texte: modeleLocal.texte, origine: `fichier « ${modeleLocal.nom} » (cet export seulement)` };
    const ligne = idModeleDoc(); if (!ligne) return null;
    if (modeleCache[etat.actif]) return modeleCache[etat.actif];
    const t = await grist.docApi.fetchTable(window.Socle.TABLE_CONFIG || "Config");
    const i = t.id.indexOf(ligne), pj = i >= 0 && t.Fichier ? t.Fichier[i] : null;
    const ids = Array.isArray(pj) ? pj.filter(x => typeof x === "number") : [];
    if (!ids.length) return null;
    const texte = await telechargerPieceJointe(ids[ids.length - 1]);
    return (modeleCache[etat.actif] = { texte, origine: `modèle du profil « ${etat.actif} » (enregistré dans le document)` });
  }
  async function deposerModele(fichier) {
    const texte = await fichier.text();
    const v = verifierModele(texte, champsConnus());
    if (!v.ok) { statut(v.alertes.join(" "), "err"); return; }
    if (!ecritureDoc) { modeleLocal = { nom: fichier.name, texte }; dessiner(); statut("Modèle utilisé pour cet export (le document n'a pas de table Config pour le garder). " + v.alertes.join(" "), v.alertes.length ? "warn" : "ok"); return; }
    try {
      const S = window.Socle, T = S.TABLE_CONFIG || "Config";
      const jeton = await grist.docApi.getAccessToken({ readOnly: false });
      const form = new FormData(); form.append("upload", new Blob([texte], { type: "application/xml" }), fichier.name.replace(/\.qgz$/i, ".qgs"));
      const r = await fetch(`${jeton.baseUrl}/attachments?auth=${jeton.token}`, { method: "POST", body: form, headers: { "X-Requested-With": "XMLHttpRequest" } });
      if (!r.ok) throw new Error(`envoi refusé (${r.status})`);
      const [idPj] = await r.json();
      const meta = await S.lireMeta(); const acts = [];
      if (meta[T] && !meta[T].colonnes.Fichier) acts.push(["AddColumn", T, "Fichier", { type: "Attachments", isFormula: false }]);
      const cle = PREFIXE_MODELE + etat.actif, id = config.ids[cle];
      const valeur = JSON.stringify({ role: `Modèle QGIS de l'atlas, profil « ${etat.actif} » (pièce jointe dans la colonne Fichier)`, fichier: fichier.name, depose_le: new Date().toISOString() }, null, 2);
      acts.push(id ? ["UpdateRecord", T, id, { Valeur: valeur, Fichier: ["L", idPj] }] : ["AddRecord", T, null, { Cle: cle, Valeur: valeur, Fichier: ["L", idPj] }]);
      await grist.docApi.applyUserActions(acts);
      config = await S.lireConfig(); delete modeleCache[etat.actif]; modeleLocal = null; dessiner();
      statut(`Modèle « ${fichier.name} » enregistré pour le profil « ${etat.actif} ». ` + v.alertes.join(" "), v.alertes.length ? "warn" : "ok");
    } catch (e) {
      modeleLocal = { nom: fichier.name, texte }; dessiner();
      statut(`Modèle utilisé pour cet export seulement : enregistrement dans le document refusé (${e.message}). ` + v.alertes.join(" "), "warn");
    }
  }
  async function retirerModele() {
    if (modeleLocal) { modeleLocal = null; dessiner(); statut("Fichier de modèle retiré : retour au modèle du profil ou au modèle intégré.", "ok"); return; }
    const id = idModeleDoc(); if (!id) return;
    try { await grist.docApi.applyUserActions([["RemoveRecord", window.Socle.TABLE_CONFIG || "Config", id]]); config = await window.Socle.lireConfig(); delete modeleCache[etat.actif]; dessiner(); statut("Modèle du profil retiré : retour au modèle intégré.", "ok"); }
    catch (e) { statut(`Impossible de retirer le modèle (${e.message}).`, "err"); }
  }
  function champsConnus() {
    const s = new Set([...CHAMPS_ATLAS.map(c => c[0]), "Type_court", "Qualification", "Qualifications", "Date", "Dossier", "grist_id", "Decale", "Couche", "Signale_par", ...CHAMPS_CONTOURS]);
    colonnesTable().forEach(c => s.add(nomExport(c.col))); colonnesRef().forEach(c => s.add(nomExport(c.col)));
    ["fid", "id", "Layer"].forEach(x => s.add(x));
    return s;
  }

  /* formulaire */
  const optionsChamp = (val) => {
    const calc = CHAMPS_ATLAS.map(([k, lib]) => `<option value="${k}"${val === k ? " selected" : ""}>${htmlTexte(lib)}</option>`).join("");
    const table = colonnesTable().map(c => `<option value="col:${htmlTexte(c.col)}"${val === "col:" + c.col ? " selected" : ""}>${htmlTexte(c.libelle)}</option>`).join("");
    const ref = colonnesRef().map(c => `<option value="ref:${htmlTexte(c.col)}"${val === "ref:" + c.col ? " selected" : ""}>${htmlTexte(c.libelle)}</option>`).join("");
    const manquant = val && /^(col|ref):/.test(val) && ![...colonnesTable().map(c => "col:" + c.col), ...colonnesRef().map(c => "ref:" + c.col)].includes(val) ? `<option value="${htmlTexte(val)}" selected>${htmlTexte(val.slice(4))} (absente)</option>` : "";
    return `<optgroup label="Calculés pour chaque point">${calc}</optgroup><optgroup label="Colonnes de la table (regroupées)">${table}${manquant}</optgroup>${ref ? `<optgroup label="Colonnes du référentiel des établissements">${ref}</optgroup>` : ""}`;
  };
  function ligneColonne(c, i, n) {
    const estTable = /^(col|ref):/.test(c.champ);
    const ag = c.agregat || (estTable ? agregatParDefaut(colTypes[c.champ.slice(4)] || "") : "");
    return `<div class="atlas-col" data-i="${i}">
      <select data-k="champ" aria-label="Champ de la colonne ${i + 1}">${optionsChamp(c.champ)}</select>
      <input type="text" data-k="titre" value="${htmlTexte(c.titre || "")}" aria-label="En-tête de la colonne ${i + 1}" placeholder="en-tête">
      ${estTable ? `<select data-k="agregat" aria-label="Regroupement de la colonne ${i + 1}">${Object.entries(AGREGATS).map(([k, l]) => `<option value="${k}"${k === ag ? " selected" : ""}>${l}</option>`).join("")}</select>` : `<span class="hint atlas-col-vide"></span>`}
      <button type="button" data-a="haut" title="Monter" aria-label="Monter la colonne ${i + 1}"${i === 0 ? " disabled" : ""}>↑</button>
      <button type="button" data-a="bas" title="Descendre" aria-label="Descendre la colonne ${i + 1}"${i === n - 1 ? " disabled" : ""}>↓</button>
      <button type="button" data-a="suppr" title="Retirer" aria-label="Retirer la colonne ${i + 1}">✕</button></div>`;
  }
  function dessiner() {
    const P = profilCourant();
    el("atlasProfil").innerHTML = Object.keys(etat.profils).map(n => `<option${n === etat.actif ? " selected" : ""}>${htmlTexte(n)}</option>`).join("");
    el("atlasProfilNom").value = nomSaisi != null ? nomSaisi : etat.actif;
    el("atlasTitre").value = P.titre || ""; el("atlasService").value = P.service || "";
    el("atlasLignes").value = P.lignes; el("atlasCritere").value = P.critere; el("atlasTri").value = P.tri;
    el("atlasTableauWidget").checked = P.tableauWidget !== false;
    el("atlasColonnes").innerHTML = (P.colonnes || []).map((c, i, a) => ligneColonne(c, i, a.length)).join("");
    el("atlasColonnesBloc").style.display = P.tableauWidget !== false ? "" : "none";
    el("atlasPrincipale").value = P.principale; el("atlasExclues").value = (P.exclues || []).join(", "); el("atlasExclureTout").checked = !!P.exclureTout;
    const cols = colonnesTable();
    el("atlasJours").innerHTML = `<option value="auto">reconnue automatiquement (« Nb de jours de mobilisation »…), sinon calcul</option><option value="calcul">calcul : jours distincts signalés</option>`
      + cols.filter(c => /^(Int|Numeric|Any)/.test(c.type) || !c.type).map(c => `<option value="${htmlTexte(c.col)}">colonne « ${htmlTexte(c.libelle)} »</option>`).join("");
    el("atlasJours").value = [...el("atlasJours").options].some(o => o.value === P.jours) ? P.jours : "auto";
    el("atlasIgn").checked = P.fondsIgn !== false; el("atlasVoile").checked = P.voile !== false; el("atlasResolution").value = String(resolutionPdf(P));
    el("atlasEncarts").checked = P.encarts !== false; el("atlasEncartsMax").value = P.encartsMax; el("atlasEncartsMin").value = P.encartsMin; el("atlasEncartsEcart").value = P.encartsEcart;
    el("atlasEncartsBloc").style.display = P.encarts !== false ? "" : "none";
    el("atlasDecoupage").value = P.decoupage || "auto"; el("atlasSeuil").value = P.seuilIllisible; el("atlasSeuilBloc").style.display = (P.decoupage || "auto") === "auto" ? "" : "none";
    el("atlasEtiquettes").value = P.etiquettes; el("atlasVoisins").checked = P.etiquettesVoisins !== false;
    const M = { table: "", colonne: "", titre: "", inclure: true, ...(P.marques || {}) };
    el("atlasMarqueTable").innerHTML = `<option value="">aucune</option>` + sousTablesAtlas.map(t => `<option value="${htmlTexte(t.table)}"${t.table === M.table ? " selected" : ""}>${htmlTexte(t.table)} (${t.data.id.length} ligne${t.data.id.length > 1 ? "s" : ""})</option>`).join("")
      + (M.table && !sousTablesAtlas.some(t => t.table === M.table) ? `<option value="${htmlTexte(M.table)}" selected>${htmlTexte(M.table)} (introuvable)</option>` : "");
    const st = sousTablesAtlas.find(t => t.table === M.table);
    el("atlasMarqueColonne").innerHTML = `<option value="">une seule couleur</option>` + (st ? st.colonnes.filter(c => /^(Choice|ChoiceList|Text|Bool)/.test(c.type)).map(c => `<option value="${htmlTexte(c.col)}"${c.col === M.colonne ? " selected" : ""}>${htmlTexte(c.libelle)}</option>`).join("") : "");
    el("atlasMarqueTitre").value = M.titre; el("atlasMarqueInclure").checked = M.inclure !== false;
    el("atlasMarqueBloc").style.display = M.table ? "" : "none"; el("atlasPlacees").checked = P.etiquettesPlacees !== false;
    const lieu = localisateurSous(st);
    el("atlasMarqueLieu").textContent = !st ? "" : lieu.mode
      ? `Chaque ligne est placée sur l'établissement qu'elle cite (${lieu.mode}) : point et étiquette propres, comptés dans les pages, les encarts et le placement des étiquettes. Une ligne sur l'établissement de la réponse, ou sans établissement, donne un losange accolé à son point.`
      : "Aucune colonne de la sous-table ne désigne un établissement (référence au référentiel, UAI ou Latitude/Longitude) : un losange en haut à droite du point de la réponse.";
    const F = { categories: [], qualifs: [], minSignalements: 1, minJours: 0, ...(P.filtre || {}) };
    // couleurs et formes des points
    const SY = symbologieDe(P);
    el("atlasSymChamp").innerHTML = optionsChamp(SY.champ); el("atlasSymTitre").value = SY.titre || "";
    el("atlasSymTitre").placeholder = (P.regroupement === "site" ? "Sites signalés" : "Établissements signalés");
    const formes = f => Object.entries(FORMES).map(([k, l]) => `<option value="${k}"${k === (f || "circle") ? " selected" : ""}>${l}</option>`).join("");
    const ligneSym = (it, i, n) => `<div class="atlas-sym${i === "autres" ? " autres" : ""}" data-i="${i}">
      <input type="checkbox" data-s="garder"${it.garder !== false ? " checked" : ""} aria-label="Garder ${i === "autres" ? "les autres valeurs" : htmlTexte(it.valeur)}">
      <span class="val" title="${htmlTexte(i === "autres" ? "valeurs absentes de la liste" : it.valeur)}">${i === "autres" ? "<i>autres valeurs</i>" : htmlTexte(it.valeur)}</span>
      <input type="text" data-s="libelle" value="${htmlTexte(it.libelle || "")}" placeholder="libellé dans la légende" aria-label="Libellé de légende">
      <input type="color" data-s="couleur" value="${/^#[0-9a-f]{6}$/i.test(it.couleur || "") ? it.couleur : "#666666"}" aria-label="Couleur">
      <select data-s="forme" aria-label="Forme">${formes(it.forme)}</select>
      ${i === "autres" ? "<span></span><span></span><span></span>" : `<button type="button" data-sa="haut" aria-label="Monter"${i === 0 ? " disabled" : ""}>↑</button><button type="button" data-sa="bas" aria-label="Descendre"${i === n - 1 ? " disabled" : ""}>↓</button><button type="button" data-sa="suppr" aria-label="Retirer">✕</button>`}</div>`;
    el("atlasSymItems").innerHTML = SY.items.map((it, i, a) => ligneSym(it, i, a.length)).join("") + ligneSym(SY.autres, "autres", 0);
    // point par site : sous-tables de sites reconnues
    const tablesSites = sousTablesAtlas.filter(t => t.estSites), PS = { table: "", ...(P.sites || {}) };
    el("atlasSitesTable").innerHTML = tablesSites.length ? tablesSites.map(t => `<option value="${htmlTexte(t.table)}"${t.table === PS.table ? " selected" : ""}>${htmlTexte(t.table)}${t.siteRef ? ` (sites de ${htmlTexte(t.siteRef.table)})` : ""}</option>`).join("") : `<option value="">aucune sous-table de sites</option>`;
    el("atlasSitesBloc").style.display = P.regroupement === "site" ? "" : "none";
    const ts = tablesSites.find(t => t.table === PS.table) || tablesSites[0];
    el("atlasSitesAide").textContent = P.regroupement !== "site" ? "" : !ts ? "Aucune sous-table de sites : il faut une question tableau dont une colonne renvoie vers le référentiel des sites (ou une colonne « site hors référentiel »)."
      : `Un point par site cité dans « ${ts.table} »${ts.siteRef ? `, placé selon les coordonnées de « ${ts.siteRef.table} » (à défaut, sur son établissement)` : ", placé sur son établissement"} ; couleur et classement selon ${ts.qualif ? `la qualification du site (« ${ts.qualif} »)` : "la qualification du signalement"}. Académie et département : ceux du lieu du site.`;
    const prChoisi = el("atlasPrereglage").value;
    el("atlasPrereglage").innerHTML = Object.entries(PREREGLAGES).map(([k, x]) => `<option value="${k}"${k === prChoisi ? " selected" : ""}>${htmlTexte(x.libelle)}</option>`).join("");
    el("atlasPrereglageAide").textContent = (PREREGLAGES[el("atlasPrereglage").value] || {}).aide || "";
    const vq = valeursQualif();
    el("atlasFiltreQualif").innerHTML = vq.length ? `<span>Qualifications :</span>` + vq.map(q => `<label><input type="checkbox" data-qualif="${htmlTexte(q)}"${F.qualifs.includes(q) ? " checked" : ""}> ${htmlTexte(q)}</label>`).join("") + `<span class="hint">aucune cochée = toutes</span>` : "";
    el("atlasMinSig").value = F.minSignalements; el("atlasMinJours").value = F.minJours;
    el("atlasDebut").value = F.debut || ""; el("atlasFin").value = F.fin || "";
    el("atlasRegroupement").value = P.regroupement || "etablissement"; el("atlasParJour").checked = P.pagesParJour !== false;
    el("atlasParJourBloc").style.display = ["jour", "aucun"].includes(P.regroupement) ? "" : "none";
    compterPlusTard();
    const ordre = choixColonne((socle && socle.qualif) || "Qualification");
    el("atlasOrdreAide").textContent = ordre.length ? `Ordre actuel : ${ordre.join(" › ")}.` : "La colonne de qualification n'a pas de liste de choix.";
    const id = idModeleDoc();
    el("atlasModeleEtat").textContent = modeleLocal ? `Fichier « ${modeleLocal.nom} », pour cet export seulement.` : id ? `Modèle QGIS propre au profil, enregistré dans le document (${(config.valeurs[PREFIXE_MODELE + etat.actif] || {}).fichier || "atlas.qgs"}).` : "Modèle intégré au widget.";
    el("atlasModeleRetirer").style.display = modeleLocal || id ? "" : "none";
    el("atlasModifie").style.display = modifie ? "" : "none";
  }
  function lireFormulaire() {
    const p = etat.profils[etat.actif] = { ...profilCourant() };
    p.titre = el("atlasTitre").value; p.service = el("atlasService").value;
    p.lignes = Math.max(0, parseInt(el("atlasLignes").value, 10) || 0); p.critere = el("atlasCritere").value; p.tri = el("atlasTri").value;
    p.tableauWidget = el("atlasTableauWidget").checked;
    p.colonnes = [...el("atlasColonnes").querySelectorAll(".atlas-col")].map(d => {
      const c = { champ: d.querySelector('[data-k="champ"]').value, titre: d.querySelector('[data-k="titre"]').value };
      const ag = d.querySelector('[data-k="agregat"]'); if (ag && /^(col|ref):/.test(c.champ)) c.agregat = ag.value;
      return c;
    });
    p.principale = el("atlasPrincipale").value; p.exclues = el("atlasExclues").value.split(/[,;]/).map(s => s.trim()).filter(Boolean);
    p.exclureTout = el("atlasExclureTout").checked; p.jours = el("atlasJours").value;
    p.fondsIgn = el("atlasIgn").checked; p.voile = el("atlasVoile").checked; p.resolution = +el("atlasResolution").value || 150;
    p.decoupage = el("atlasDecoupage").value; p.seuilIllisible = Math.max(0, Math.min(100, parseInt(el("atlasSeuil").value, 10) || 20));
    p.etiquettesVoisins = el("atlasVoisins").checked;
    p.marques = { table: el("atlasMarqueTable").value, colonne: el("atlasMarqueColonne").value, titre: el("atlasMarqueTitre").value, inclure: el("atlasMarqueInclure").checked };
    p.etiquettes = Math.max(3, Math.min(9, parseFloat(el("atlasEtiquettes").value) || 5)); p.etiquettesPlacees = el("atlasPlacees").checked;
    // couleurs et formes : lues dans le formulaire (le filtre des catégories est remplacé par les valeurs gardées)
    const lit = d => ({ garder: d.querySelector('[data-s="garder"]').checked, libelle: d.querySelector('[data-s="libelle"]').value, couleur: d.querySelector('[data-s="couleur"]').value, forme: d.querySelector('[data-s="forme"]').value });
    const SYa = symbologieDe(p);
    const items = [...el("atlasSymItems").querySelectorAll('.atlas-sym:not(.autres)')].map(d => ({ valeur: (SYa.items[+d.dataset.i] || {}).valeur, ...lit(d) })).filter(x => x.valeur != null);
    const dAutres = el("atlasSymItems").querySelector(".atlas-sym.autres");
    p.symbologie = { champ: el("atlasSymChamp").value || SYa.champ, titre: el("atlasSymTitre").value, items, autres: dAutres ? lit(dAutres) : SYa.autres };
    p.sites = { table: el("atlasSitesTable").value || "" };
    p.filtre = { categories: [],
      qualifs: [...el("atlasFiltreQualif").querySelectorAll("input:checked")].map(b => b.dataset.qualif),
      minSignalements: Math.max(1, parseInt(el("atlasMinSig").value, 10) || 1), minJours: Math.max(0, parseInt(el("atlasMinJours").value, 10) || 0),
      debut: el("atlasDebut").value || "", fin: el("atlasFin").value || "" };
    p.regroupement = el("atlasRegroupement").value; p.pagesParJour = el("atlasParJour").checked;
    p.encarts = el("atlasEncarts").checked; p.encartsMax = Math.max(1, Math.min(3, parseInt(el("atlasEncartsMax").value, 10) || 3));
    p.encartsMin = Math.max(2, parseInt(el("atlasEncartsMin").value, 10) || 4); p.encartsEcart = Math.max(1, Math.min(30, parseFloat(el("atlasEncartsEcart").value) || 6));
    ecrireLocal();
  }
  const changer = () => { lireFormulaire(); modifie = true; el("atlasModifie").style.display = ""; compterPlusTard(); };
  // valeurs de qualification proposées au filtre : choix de la colonne dans Grist, sinon valeurs rencontrées
  function valeursQualif() {
    const col = (socle && socle.qualif) || "Qualification", choix = choixColonne(col);
    const v = new Set(); (lastRecords || []).forEach(r => texteCellule(r[col]).split(", ").forEach(x => { if (x.trim()) v.add(x.trim()); }));
    return [...choix, ...[...v].filter(x => !choix.includes(x)).sort((a, b) => a.localeCompare(b, "fr"))];
  }
  // nombre d'établissements retenus par le profil (recalculé un instant après chaque changement)
  let minuteur = null;
  function compterPlusTard() {
    clearTimeout(minuteur);
    minuteur = setTimeout(() => {
      const c = el("atlasCompte"); if (!c) return;
      try { const r = signalementsAtlas(profilCourant()); const n = r.fc.features.length, a = new Set(r.fc.features.map(f => f.properties.Academie)).size, u = r.infos.regroupement === "site" ? "site" : "établissement";
        c.textContent = `— ${n} ${u}${n > 1 ? "s" : ""} sur ${r.infos.avantFiltre}, ${a} académie${a > 1 ? "s" : ""}`; }
      catch (e) { c.textContent = "— " + e.message; }
    }, 300);
  }
  let branche = false;
  function brancher() {
    if (branche) return; branche = true;
    const box = el("atlasBox");
    box.addEventListener("input", e => { if (e.target.closest("#atlasProfilBloc") || e.target.id === "atlasDate" || e.target.id === "atlasModeleFichier") return; changer(); });
    box.addEventListener("change", e => {
      if (e.target.closest("#atlasProfilBloc") || e.target.id === "atlasDate" || e.target.id === "atlasModeleFichier") return;
      changer();
      // un champ changé : en-tête proposé, regroupement par défaut ; tableau réglé ici ou non
      // colonne des couleurs changée : valeurs proposées d'après les données
      if (e.target.id === "atlasSymChamp") { const p = etat.profils[etat.actif]; p.symbologie = { ...p.symbologie, champ: e.target.value, items: proposerValeurs(p, e.target.value, []) }; dessiner(); return; }
      if (e.target.id === "atlasPrereglage") { el("atlasPrereglageAide").textContent = (PREREGLAGES[e.target.value] || {}).aide || ""; return; }
      if (e.target.dataset.k === "champ" || e.target.id === "atlasTableauWidget" || e.target.id === "atlasEncarts" || e.target.id === "atlasDecoupage" || e.target.id === "atlasMarqueTable" || e.target.id === "atlasRegroupement" || e.target.id === "atlasSitesTable") {
        const d = e.target.closest(".atlas-col");
        if (d) { const p = etat.profils[etat.actif], c = p.colonnes[+d.dataset.i], o = e.target.selectedOptions[0];
          c.titre = (o ? o.textContent : c.champ).replace(/\s*\(.*\)$/, ""); delete c.agregat; }
        dessiner();
      }
    });
    el("atlasColonnes").addEventListener("click", e => {
      const b = e.target.closest("button[data-a]"); if (!b) return;
      lireFormulaire();
      const p = etat.profils[etat.actif], i = +b.closest(".atlas-col").dataset.i, l = p.colonnes;
      if (b.dataset.a === "suppr") l.splice(i, 1);
      else { const j = b.dataset.a === "haut" ? i - 1 : i + 1; if (j >= 0 && j < l.length) [l[i], l[j]] = [l[j], l[i]]; }
      modifie = true; dessiner();
    });
    el("atlasSymItems").addEventListener("click", e => {
      const b = e.target.closest("button[data-sa]"); if (!b) return;
      lireFormulaire();
      const l = etat.profils[etat.actif].symbologie.items, i = +b.closest(".atlas-sym").dataset.i;
      if (b.dataset.sa === "suppr") l.splice(i, 1);
      else { const j = b.dataset.sa === "haut" ? i - 1 : i + 1; if (j >= 0 && j < l.length) [l[i], l[j]] = [l[j], l[i]]; }
      modifie = true; dessiner();
    });
    el("atlasSymProposer").addEventListener("click", () => {
      lireFormulaire(); const p = etat.profils[etat.actif], n0 = p.symbologie.items.length;
      p.symbologie.items = proposerValeurs(p, p.symbologie.champ, p.symbologie.items);
      modifie = true; dessiner(); statut(p.symbologie.items.length > n0 ? `${p.symbologie.items.length - n0} valeur(s) ajoutée(s).` : "Toutes les valeurs présentes sont déjà dans la liste.", "ok");
    });
    el("atlasAppliquerPrereglage").addEventListener("click", () => {
      const pr = PREREGLAGES[el("atlasPrereglage").value]; if (!pr) return;
      lireFormulaire();
      const p = etat.profils[etat.actif], { symbo, symboTitre, ...reste } = copie(pr.profil);
      Object.assign(p, reste);
      p.symbologie = symbo ? { champ: symbo, titre: symboTitre || "", items: proposerValeurs(p, symbo, []), autres: { garder: true, libelle: "Autres", couleur: "#999999", forme: "circle" } } : null;
      if (p.regroupement === "site" && !sousTablesAtlas.some(t => t.estSites)) statut("Ce réglage place un point par site, mais aucune sous-table de sites n'a été trouvée : choisissez un autre regroupement.", "warn");
      else statut(`Réglage « ${pr.libelle} » appliqué au profil affiché : vérifiez-le, puis enregistrez (sous un nouveau nom pour garder l'ancien profil).`, "ok");
      modifie = true; dessiner();
    });
    el("atlasAjouterCol").addEventListener("click", () => { lireFormulaire(); etat.profils[etat.actif].colonnes.push({ champ: "Nb_signalements", titre: "Nombre de signalements" }); modifie = true; dessiner(); });
    el("atlasProfil").addEventListener("change", e => { lireFormulaire(); etat.actif = e.target.value; nomSaisi = null; modeleLocal = null; modifie = false; ecrireLocal(); dessiner(); statut(""); });
    el("atlasProfilNom").addEventListener("input", () => { nomSaisi = el("atlasProfilNom").value; });
    el("atlasEnregistrer").addEventListener("click", () => { const n = el("atlasProfilNom").value; nomSaisi = null; enregistrer(n); });
    el("atlasSupprimer").addEventListener("click", supprimer);
    el("atlasModeleFichier").addEventListener("change", async e => { const f = e.target.files[0]; e.target.value = ""; if (f) await deposerModele(f); });
    el("atlasModeleRetirer").addEventListener("click", retirerModele);
    el("atlasModeleTelecharger").addEventListener("click", async () => {
      try { const m = await modeleCourant(), t = m ? m.texte : await lireFichierAtlas("atlas.qgs");
        const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([t], { type: "application/xml" })); a.download = "atlas.qgs"; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      } catch (e) { statut(e.message, "err"); }
    });
  }
  let pret = null;
  async function init() {
    if (!el("atlasDate").value) el("atlasDate").value = new Date().toLocaleDateString("fr-FR", { month: "short", year: "numeric" });
    brancher();
    if (!pret) pret = Promise.all([charger(), chargerSousTables()]).catch(e => statut("Profils illisibles : " + e.message, "err"));
    await pret; dessiner();
  }
  return { init, profilCourant: () => { if (el("atlasProfil") && el("atlasProfil").options.length) lireFormulaire(); return profilCourant(); }, nomProfil, modeleCourant, dessiner };
})();
function initAtlas() { AtlasUI.init(); }
