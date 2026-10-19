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
  ["Nb_signalements", "Nombre de signalements", "nombre"], ["Nb_jours", "Jours de mobilisation", "nombre"],
  ["Qualification_principale", "Qualification principale", "texte"], ["Qualifications", "Qualifications (toutes)", "texte"],
  ["Derniere_date", "Date du dernier signalement", "date"], ["Rang", "Rang dans l'académie", "nombre"],
];
const AGREGATS = { liste: "valeurs distinctes", max: "maximum", min: "minimum", somme: "somme", derniere: "valeur la plus récente", nb: "nombre de lignes renseignées" };

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

/* ---------- données : un point par établissement, un point par signalement ---------- */
function signalementsAtlas(profil) {
  const P = { ...PROFIL_DEFAUT, ...profil };
  const G = window.Geo, panel = lastMappings || {}, manuel = !!(panel.Latitude && panel.Longitude);
  const cols = manuel ? panel : (socle ? socle.auto : panel);
  if (!cols.Latitude || !cols.Longitude) throw new Error("L'atlas place les établissements par leurs coordonnées : associez Latitude et Longitude, ou utilisez une table du socle.");
  // « tous » : toutes les versions (jours de mobilisation) ; « recs » : dernière version seulement si la case est cochée
  const tous = filteredRecords(); let recs = tous; if (socle && socle.dv && dvOnly) recs = recs.filter(r => r[socle.dv]);
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
    qualif: (socle && socle.qualif) || trouve("Qualification"), faits: trouve(R.Date_faits, "Date_faits"), cree: trouve(R.Cree_le, "Cree_le") };
  // jours de mobilisation : colonne choisie, colonne reconnue (« auto »), ou calcul
  C.jours = P.jours === "calcul" ? null : P.jours && P.jours !== "auto" ? (cles.has(P.jours) ? P.jours : null) : motif(/jours?_de_mobilisation|^nb_?(de_)?jours/i);
  const exclues = new Set((P.exclues || []).map(x => String(x).trim().toUpperCase()).filter(Boolean));
  const ordre = choixColonne(C.qualif);
  const dateDe = r => (C.faits && secondesDe(r[C.faits])) || (C.cree && secondesDe(r[C.cree])) || null;
  const qualifsDe = r => C.qualif ? texteCellule(r[C.qualif]).split(", ").map(q => q.trim()).filter(Boolean) : [];
  const estExclu = r => { const q = qualifsDe(r); return q.length > 0 && q.every(x => exclues.has(x.toUpperCase())); };
  const cleDe = r => { const lat = toNumber(r[cols.Latitude]), lon = toNumber(r[cols.Longitude]); if (isNaN(lat) || isNaN(lon)) return null;
    return (C.uai ? texteCellule(r[C.uai]).trim() : "") || `${lat.toFixed(5)},${lon.toFixed(5)}`; };
  // colonnes de la table recopiées dans les deux couches (détail : telles quelles ; établissement : regroupées)
  const tableCols = colonnesTable().filter(c => ![cols.Latitude, cols.Longitude, socle && socle.etabCol].includes(c.col));
  const agregatDe = col => { const c = (P.colonnes || []).find(x => x.champ === "col:" + col); return (c && c.agregat) || agregatParDefaut(colTypes[col] || ""); };
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
  const etabProps = (r, lat, lon, uai) => {
    const lieu = G ? G.localiser(lat, lon) : null;
    const academie = (G && C.aca && G.acaKey(texteCellule(r[C.aca]))) || (lieu && lieu.academie) || texteCellule(C.aca ? r[C.aca] : "");
    const depCode = (G && uai && G.depFromUai(uai)) || (lieu && lieu.dep) || "";
    const depNom = (G && G.DEP_NAMES[depCode]) || (C.dep ? texteCellule(r[C.dep]) : "") || (lieu && lieu.departement) || "";
    const typeSource = C.type ? texteCellule(r[C.type]) : "", natureSource = C.nature ? texteCellule(r[C.nature]) : "";
    const n = natureCourte(natureSource, typeSource), nom = nomCourt(C.nom ? texteCellule(r[C.nom]) : ""), intern = C.internat ? r[C.internat] : null;
    return { Etiquette: `${n.court} ${nom}`.trim(), Etablissement: nom, Type_court: n.court, Type_libelle: n.libelle, Categorie: n.categorie,
      Type_etablissement: typeSource, Nature: natureSource,
      UAI: uai, Commune: C.commune ? texteCellule(r[C.commune]) : "", DSDEN: depCode ? `${depCode} - ${depNom}` : depNom, Academie: academie,
      REP: (C.rep && texteCellule(r[C.rep]).trim()) || "-", Internat: intern === true || intern === 1 || /^(1|oui|o|true|vrai)$/i.test(texteCellule(intern).trim()) ? "Oui" : "-" };
  };
  const parEtab = new Map(), detail = [];
  for (const r of recs) {
    const lat = toNumber(r[cols.Latitude]), lon = toNumber(r[cols.Longitude]);
    if (isNaN(lat) || isNaN(lon)) continue;
    const exclu = estExclu(r);
    if (exclu && P.exclureTout) continue;
    const uai = C.uai ? texteCellule(r[C.uai]).trim() : "", cle = cleDe(r);
    if (!parEtab.has(cle)) parEtab.set(cle, { cle, lat, lon, uai, n: 0, qualifs: new Map(), date: null, lignes: [], props: etabProps(r, lat, lon, uai) });
    const e = parEtab.get(cle); e.n++;
    const qs = qualifsDe(r), d = dateDe(r);
    e.lignes.push({ r, d });
    if (!exclu) qs.forEach(q => { const x = e.qualifs.get(q) || { n: 0, date: 0 }; x.n++; if (typeof d === "number" && d > x.date) x.date = d; e.qualifs.set(q, x); });
    if (typeof d === "number" && (!e.date || d > e.date)) e.date = d;
    const brut = {}; tableCols.forEach(c => { brut[nomExport(c.col)] = valeurExport(c.col, r[c.col]); });
    detail.push({ type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] }, properties: { ...e.props, ...brut,
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
  const features = [];
  for (const e of parEtab.values()) {
    const principale = [...e.qualifs.entries()].sort((a, b) => triQualif(a, b) || a[0].localeCompare(b[0], "fr"))[0];
    const regroupees = {}; tableCols.forEach(c => { regroupees[nomExport(c.col)] = regrouper(c.col, e.lignes); });
    const j = joursEtab.get(e.cle);
    features.push({ type: "Feature", geometry: { type: "Point", coordinates: [e.lon, e.lat] }, properties: { ...e.props, ...regroupees,
      Nb_signalements: e.n, Qualification_principale: principale ? principale[0] : "", Qualifications: [...e.qualifs.keys()].join(", "),
      Nb_jours: j ? (j.max !== null ? j.max : j.jours.size || null) : null,
      Derniere_date: e.date ? jourDe(e.date) : "" } });
  }
  if (!features.length) throw new Error("Aucun établissement localisé à mettre dans l'atlas.");
  // Rang dans l'académie selon le critère du profil : le tableau garde les N premiers
  const cmp = {
    signalements: (a, b) => b.Nb_signalements - a.Nb_signalements || (b.Nb_jours || 0) - (a.Nb_jours || 0) || String(b.Derniere_date).localeCompare(String(a.Derniere_date)),
    jours: (a, b) => (b.Nb_jours || 0) - (a.Nb_jours || 0) || b.Nb_signalements - a.Nb_signalements || String(b.Derniere_date).localeCompare(String(a.Derniere_date)),
    recent: (a, b) => String(b.Derniere_date).localeCompare(String(a.Derniere_date)) || b.Nb_signalements - a.Nb_signalements,
  }[P.critere] || ((a, b) => b.Nb_signalements - a.Nb_signalements);
  const parAca = new Map();
  for (const f of features) { const k = f.properties.Academie || ""; if (!parAca.has(k)) parAca.set(k, []); parAca.get(k).push(f.properties); }
  for (const l of parAca.values()) { l.sort((a, b) => cmp(a, b) || a.Etablissement.localeCompare(b.Etablissement, "fr")); l.forEach((p, i) => { p.Rang = i + 1; }); }
  return { fc: { type: "FeatureCollection", name: "signalements", features }, detail: { type: "FeatureCollection", name: "signalements_detail", features: detail },
    infos: { jours: C.jours, qualif: C.qualif, ordre, tableCols } };
}

/* ---------- projet QGIS ---------- */
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
const CHAMPS_CONTOURS = ["nom", "departements", "code", "dsden", "academie"];

async function lireFichierAtlas(f) {
  const r = await fetch(new URL(`atlas/${f}`, location.href).href);
  if (!r.ok) throw new Error(`fichier ${f} introuvable (${r.status})`);
  return r.text();
}

async function construireAtlas(name) {
  const P = AtlasUI.profilCourant();
  const { fc, detail, infos } = signalementsAtlas(P), JSZip = await loadJSZip();
  const modele = await AtlasUI.modeleCourant();          // { texte, origine } ou null (modèle intégré)
  const [qgsBase, acas, deps] = await Promise.all([modele ? Promise.resolve(modele.texte) : lireFichierAtlas("atlas.qgs"), lireFichierAtlas("academies.geojson"), lireFichierAtlas("departements.geojson")]);
  const lignes = Math.max(0, Math.min(5000, parseInt(P.lignes, 10) || 0));
  let projet = poserVariables(qgsBase.replace("@@TITRE@@", "").replace("@@DATE@@", "").replace("@@SERVICE@@", "").replace("@@LIGNES@@", "22"),
    { atlas_titre: P.titre || "Signalements", atlas_date: $("atlasDate").value.trim(), atlas_service: P.service || "", atlas_lignes: String(lignes) });
  const notes = [];
  if (P.tableauWidget !== false) {
    const colonnes = (P.colonnes || []).map(c => ({ nom: c.champ.startsWith("col:") ? nomExport(c.champ.slice(4)) : c.champ, titre: c.titre || c.champ.replace(/^col:/, "") }))
      .filter(c => c.nom);
    if (colonnes.length) {
      const r = poserTableau(projet, colonnes, largeursColonnes(colonnes, fc.features), P.tri);
      projet = r.qgs; if (!r.trouve) notes.push("Aucun tableau du modèle n'utilise la couche « signalements » : colonnes du profil non appliquées.");
    }
  }
  projet = cocherCouches(projet, t => /providerKey="wms"/.test(t), P.fondsIgn !== false);
  projet = cocherCouches(projet, t => /name="voile hors académie"/.test(t), P.voile !== false);
  const nb = new Set(fc.features.map(f => f.properties.Academie)).size;
  const champTable = c => c.champ.startsWith("col:") ? `${nomExport(c.champ.slice(4))} (${AGREGATS[c.agregat || agregatParDefaut(colTypes[c.champ.slice(4)] || "")]})` : c.champ;
  const lisezmoi = [`Atlas des signalements par académie — ${fc.features.length} établissement(s), ${nb} académie(s).`,
    `Profil : « ${AtlasUI.nomProfil()} » ; modèle QGIS : ${modele ? modele.origine : "modèle intégré au widget"}.`, "",
    "1. Dézippez le dossier (les fichiers doivent rester ensemble).", "2. Ouvrez atlas.qgs dans QGIS (3.34 ou plus récent).",
    "3. Projet › Mises en page › « Atlas par académie ».", "4. Atlas › Exporter l'atlas en PDF : une page par académie ayant des signalements.", "",
    "Réglages du profil",
    `- Tableau : ${lignes ? `les ${lignes} premiers établissements de chaque académie` : "tous les établissements (pages supplémentaires si besoin)"}, classés par ${{ signalements: "nombre de signalements", jours: "jours de mobilisation", recent: "date du dernier signalement" }[P.critere] || P.critere} (champ Rang), triés ${P.tri === "rang" ? "par rang" : "par DSDEN, commune, établissement"}.`,
    P.tableauWidget !== false ? `- Colonnes : ${(P.colonnes || []).map(c => `${c.titre || c.champ} = ${champTable(c)}`).join(" ; ")}.` : "- Colonnes : celles du modèle QGIS.",
    `- Qualification principale : ${{ frequente: "la plus fréquente, à égalité la plus récente", recente: "la plus récente", ordre: "la première dans l'ordre des choix de la colonne dans Grist" }[P.principale]}.`,
    `- Valeurs ignorées${P.exclureTout ? " (signalements écartés de l'atlas)" : " (pour la qualification principale et les jours)"} : ${(P.exclues || []).join(", ") || "aucune"}.`,
    `- Jours de mobilisation : ${infos.jours ? `valeur la plus haute de la colonne « ${infos.jours} », toutes versions` : "jours distincts (date des faits, à défaut de saisie) ayant un signalement non ignoré, toutes versions"}.`,
    `- Fonds IGN : ${P.fondsIgn !== false ? "cochés" : "décochés (à cocher dans le groupe « Fonds de carte »)"} ; voile gris hors académie : ${P.voile !== false ? "oui" : "non"}.`,
    ...notes.map(n => "- " + n), "",
    "Variables du projet (Projet › Propriétés › Variables) : atlas_titre, atlas_date, atlas_service, atlas_lignes (0 = tous).",
    "Si les fonds IGN restent blancs ou si la carte met longtemps à s'afficher, QGIS n'atteint pas internet :",
    "Préférences › Options › Réseau › cocher « Utiliser un proxy pour l'accès web », type « DefaultProxy », puis redémarrer QGIS.", "",
    "Couches de points",
    "- signalements : un point par établissement (carte et tableau). Champs calculés : " + CHAMPS_ATLAS.map(c => c[0]).join(", ") + ".",
    `  Colonnes de la table, regroupées par établissement : ${infos.tableCols.map(c => `${nomExport(c.col)} (${AGREGATS[agregatDeProfil(P, c)]})`).join(", ") || "aucune"}.`,
    "- signalements_detail (décochée) : un point par signalement, avec toutes les colonnes de la table telles quelles,",
    "  plus Qualification, Date et Nb_jours de la ligne. Pratique pour symboliser par qualification, gravité, etc.", "",
    "Garder vos retouches QGIS : enregistrez le projet retouché (chemins relatifs) puis déposez-le dans le widget comme modèle du profil.",
    "Les exports suivants le réutiliseront ; seuls les variables, le tableau (si le profil le règle) et les fonds/voile sont modifiés.", "",
    "Sources : signalements (Grist) ; contours IGN Admin Express (Licence ouverte, via france-geojson) ; fonds IGN Géoplateforme."].join("\r\n");
  const zip = new JSZip(), dossier = zip.folder(name);
  dossier.file("atlas.qgs", projet); dossier.file("signalements.geojson", JSON.stringify(fc)); dossier.file("signalements_detail.geojson", JSON.stringify(detail));
  dossier.file("academies.geojson", acas); dossier.file("departements.geojson", deps); dossier.file("LISEZMOI.txt", lisezmoi);
  return { name: name + ".zip", blob: await zip.generateAsync({ type: "blob", compression: "DEFLATE" }) };
}
const agregatDeProfil = (P, c) => { const x = (P.colonnes || []).find(k => k.champ === "col:" + c.col); return (x && x.agregat) || agregatParDefaut(c.type); };

/* ---------- profils : lecture, enregistrement, formulaire ---------- */
const AtlasUI = (() => {
  let etat = { actif: "Par défaut", profils: { "Par défaut": copie(PROFIL_DEFAUT) } };
  let config = null, ecritureDoc = false, modifie = false, modeleLocal = null, modeleCache = {};
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
    const s = new Set([...CHAMPS_ATLAS.map(c => c[0]), "Type_court", "Qualification", "Qualifications", "Date", "Dossier", "grist_id", ...CHAMPS_CONTOURS]);
    colonnesTable().forEach(c => s.add(nomExport(c.col)));
    ["fid", "id", "Layer"].forEach(x => s.add(x));
    return s;
  }

  /* formulaire */
  const optionsChamp = (val) => {
    const calc = CHAMPS_ATLAS.map(([k, lib]) => `<option value="${k}"${val === k ? " selected" : ""}>${htmlTexte(lib)}</option>`).join("");
    const table = colonnesTable().map(c => `<option value="col:${htmlTexte(c.col)}"${val === "col:" + c.col ? " selected" : ""}>${htmlTexte(c.libelle)}</option>`).join("");
    const manquant = val && val.startsWith("col:") && !colonnesTable().some(c => "col:" + c.col === val) ? `<option value="${htmlTexte(val)}" selected>${htmlTexte(val.slice(4))} (absente)</option>` : "";
    return `<optgroup label="Calculés par établissement">${calc}</optgroup><optgroup label="Colonnes de la table (regroupées)">${table}${manquant}</optgroup>`;
  };
  function ligneColonne(c, i, n) {
    const estTable = c.champ.startsWith("col:");
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
    el("atlasProfilNom").value = etat.actif;
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
    el("atlasIgn").checked = P.fondsIgn !== false; el("atlasVoile").checked = P.voile !== false;
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
      const ag = d.querySelector('[data-k="agregat"]'); if (ag && c.champ.startsWith("col:")) c.agregat = ag.value;
      return c;
    });
    p.principale = el("atlasPrincipale").value; p.exclues = el("atlasExclues").value.split(/[,;]/).map(s => s.trim()).filter(Boolean);
    p.exclureTout = el("atlasExclureTout").checked; p.jours = el("atlasJours").value;
    p.fondsIgn = el("atlasIgn").checked; p.voile = el("atlasVoile").checked;
    ecrireLocal();
  }
  const changer = () => { lireFormulaire(); modifie = true; el("atlasModifie").style.display = ""; };
  let branche = false;
  function brancher() {
    if (branche) return; branche = true;
    const box = el("atlasBox");
    box.addEventListener("input", e => { if (e.target.closest("#atlasProfilBloc") || e.target.id === "atlasDate" || e.target.id === "atlasModeleFichier") return; changer(); });
    box.addEventListener("change", e => {
      if (e.target.closest("#atlasProfilBloc") || e.target.id === "atlasDate" || e.target.id === "atlasModeleFichier") return;
      changer();
      // un champ changé : en-tête proposé, regroupement par défaut ; tableau réglé ici ou non
      if (e.target.dataset.k === "champ" || e.target.id === "atlasTableauWidget") {
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
    el("atlasAjouterCol").addEventListener("click", () => { lireFormulaire(); etat.profils[etat.actif].colonnes.push({ champ: "Nb_signalements", titre: "Nombre de signalements" }); modifie = true; dessiner(); });
    el("atlasProfil").addEventListener("change", e => { lireFormulaire(); etat.actif = e.target.value; modeleLocal = null; modifie = false; ecrireLocal(); dessiner(); statut(""); });
    el("atlasEnregistrer").addEventListener("click", () => enregistrer(el("atlasProfilNom").value));
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
    if (!pret) pret = charger().catch(e => statut("Profils illisibles : " + e.message, "err"));
    await pret; dessiner();
  }
  return { init, profilCourant: () => { if (el("atlasProfil") && el("atlasProfil").options.length) lireFormulaire(); return profilCourant(); }, nomProfil, modeleCourant, dessiner };
})();
function initAtlas() { AtlasUI.init(); }
