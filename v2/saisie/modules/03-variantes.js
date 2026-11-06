/* PRISME — widget de saisie, module 03/31 : Spécificités du formulaire : établissements scolaires ou enseignement supérieur.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* =========================================================
   Spécificités du formulaire (version établissements scolaires / enseignement supérieur)
   ---------------------------------------------------------
   Réglées formulaire par formulaire dans l'administration des formulaires : conf.saisie du formulaire publié =
   { version: "en" | "esr", marque, annuaires: ["en", "esr"], entete (modèle « **{nom}**, **{commune}** »…),
     colonnes: { nom, uai, commune, type, academie, departement, mail } (colonnes du référentiel imposées),
     fiche: [{ col: "@nom" | "@region" | colonne du référentiel, lib }], recherche: [colonnes], pastilles: "toujours" | "auto",
     commentaire: booléen }. Les réglages absents reprennent ceux de la version.
   Sans formulaire publié (ou sans version) : version choisie dans ⚙ pour la page, sinon d'après le nom du fichier
   (anciens widget-signalement-esr.html / widget-signalement-sans-commentaire.html), sinon d'après la table
   (colonne Site, ou référentiel autre que « Etablissements » : enseignement supérieur).
   ========================================================= */
const FICHE_DEFAUT = [
  ["@nom", "Établissement"],
  ["@uai", "UAI"],
  ["@type", "Type"],
  ["@commune", "Commune"],
  ["@academie", "Académie"],
  ["@departement", "Département"],
];
const PRESETS = {
  en: {
    libelle: "Établissements scolaires",
    marque: "Établissements scolaires",
    annuaires: ["en", "esr"],
    entete: "**{nom}**, **{commune}**",
    pastilles: "auto",
    commentaire: false,
    fiche: FICHE_DEFAUT.map(([col, lib]) => ({ col, lib })),
    recherche: [],
    colonnes: {},
    faitsFuturs: true,
    plusieursJours: true,
  },
  esr: {
    libelle: "Enseignement supérieur et recherche",
    marque: "Enseignement supérieur et recherche",
    annuaires: [],
    entete: "**{nom}** ({site})",
    pastilles: "toujours",
    commentaire: false,
    fiche: [...FICHE_DEFAUT.slice(0, 5), ["@region", "Région académique"], FICHE_DEFAUT[5]].map(([col, lib]) => ({
      col,
      lib,
    })),
    recherche: [],
    colonnes: {},
    faitsFuturs: true,
    plusieursJours: true,
  },
};
let versionPage = null; // option « version » de la page (⚙), utilisée quand le formulaire publié ne fixe pas la version
const confSaisie = () =>
  (typeof formulaireActif !== "undefined" && formulaireActif && formulaireActif.conf && formulaireActif.conf.saisie) ||
  {};
function versionSaisie() {
  const c = confSaisie();
  if (PRESETS[c.version]) return c.version;
  if (PRESETS[versionPage]) return versionPage;
  const f = decodeURIComponent(location.pathname || "").toLowerCase();
  if (/signalement-esr/.test(f)) return "esr";
  if (/signalement-sans-commentaire|widget-signalement\.html$/.test(f)) return "en";
  // document à deux champs (MEN et MESRE) : la table de réponses dit le champ
  try {
    const e = window.Socle.espaceDeTable(socleGeneral, tableId);
    if (e && window.Socle.espaces(socleGeneral).length > 1) return e.version;
  } catch (_) {
    /* socle indisponible */
  }
  return col("Site") || (ETAB.table && ETAB.table !== TABLE_ETAB_DEFAUT) ? "esr" : "en";
}
function S() {
  const v = versionSaisie(),
    c = confSaisie(),
    r = { ...PRESETS[v], version: v };
  if (typeof c.marque === "string" && c.marque.trim()) r.marque = c.marque.trim();
  if (Array.isArray(c.annuaires)) r.annuaires = c.annuaires.filter((x) => SOURCES.some((y) => y.cle === x));
  if (typeof c.entete === "string" && c.entete.trim()) r.entete = c.entete;
  if (c.pastilles === "toujours" || c.pastilles === "auto") r.pastilles = c.pastilles;
  if (typeof c.commentaire === "boolean") r.commentaire = c.commentaire;
  if (typeof c.faitsFuturs === "boolean") r.faitsFuturs = c.faitsFuturs;
  if (typeof c.plusieursJours === "boolean") r.plusieursJours = c.plusieursJours;
  if (Array.isArray(c.fiche) && c.fiche.length) r.fiche = c.fiche.filter((x) => x && x.col);
  if (Array.isArray(c.recherche)) r.recherche = c.recherche.filter(Boolean);
  if (c.colonnes && typeof c.colonnes === "object") r.colonnes = c.colonnes;
  if (typeof c.qualificationEnBas === "boolean") r.qualificationEnBas = c.qualificationEnBas; // formulaire par site : qualification déduite, en bas
  return r;
}
// Bandeau, liseré de la version, colonnes du référentiel imposées par le formulaire
function appliquerVersion() {
  const o = S();
  $("marque-app").textContent = o.marque;
  document.body.classList.toggle("version-esr", o.version === "esr");
  appliquerColonnesForcees();
}
function appliquerColonnesForcees() {
  const c = S().colonnes || {};
  for (const k of ["nom", "uai", "commune", "type", "academie", "departement", "mail"]) {
    if (c[k] && colsEtab.includes(c[k]) && E[k] !== c[k]) {
      E[k] = c[k];
      colonnesReconnues[k] = c[k];
      colonnesParContenu.delete(k);
    }
  }
}
// Champs de la fiche : rôle (« @nom », « @commune »… selon les colonnes reconnues), « @region » (déduite de l'académie), ou colonne du référentiel
const ROLES_FICHE = {
  nom: "Établissement",
  uai: "UAI",
  type: "Type",
  commune: "Commune",
  academie: "Académie",
  departement: "Département",
  mail: "Mail",
  region: "Région académique",
};
function colonneChampFiche(cle) {
  cle = String(cle || "");
  if (cle === "@region") return colonneRegion();
  return cle.startsWith("@") ? E[cle.slice(1)] || null : cle;
}
function valeurChampFiche(e, cle) {
  if (cle === "@region") return regionAcademique(e);
  const c = colonneChampFiche(cle),
    v = c ? e[c] : null;
  if (v == null || typeof v === "object") return "";
  if (typeof v === "boolean") return v ? "Oui" : "Non";
  return typeof v === "number" ? v.toLocaleString("fr-FR") : v;
}
const libelleChampFiche = (cle) => (String(cle).startsWith("@") ? ROLES_FICHE[cle.slice(1)] || cle.slice(1) : cle);
// Valeurs disponibles pour le modèle d'en-tête : rôles (nom, commune, uai…), région, et toute colonne du référentiel
function valeursEtab(e) {
  const v = {};
  for (const c of colsEtab) {
    const x = e[c];
    if (x != null && typeof x !== "object") v[c] = x;
  }
  for (const k of Object.keys(ROLES_FICHE)) {
    const c = E[k];
    if (k !== "region" && c && e[c] != null && typeof e[c] !== "object") v[k] = e[c];
  }
  v.region = regionAcademique(e);
  return v;
}
// « **{nom}**, **{commune}** » → « **Collège Jean Rostand**, **Draguignan** » ; les morceaux vides disparaissent
// (gras vide, parenthèses vides, virgule ou tiret orphelins)
function appliquerModele(modele, v) {
  let t = String(modele || "").replace(/\{([\w-]+)\}/g, (_, k) =>
    String(v[k] ?? "")
      .replace(/\s+/g, " ")
      .trim(),
  );
  for (let i = 0; i < 3; i++)
    t = t
      .replace(/\*\*\s*\*\*/g, "")
      .replace(/\(\s*\)|\[\s*\]/g, "")
      .replace(/\s*[,;·]\s*(?=$|[,;·])/g, "")
      .replace(/\s+[–—-]\s*(?=$|[,;·–—-])/g, "")
      .replace(/^\s*[,;·–—-]\s*/, "");
  return t
    .replace(/\s+([,;])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}
const identiteExemple = () =>
  S().version === "esr"
    ? {
        nom: "Université de Rennes",
        commune: "Rennes",
        site: "Campus de Beaulieu",
        uai: "0352480A",
        academie: "Rennes",
        region: "Bretagne",
        departement: "Ille-et-Vilaine",
      }
    : {
        nom: "Collège Jean Rostand",
        commune: "Draguignan",
        site: "",
        uai: "0830001A",
        academie: "Nice",
        region: "Provence-Alpes-Côte d'Azur",
        departement: "Var",
      };
// ⚙ : version de la page
function remplirVersionConfig() {
  const c = confSaisie(),
    sel = $("cfg-version");
  sel.value = PRESETS[versionPage] ? versionPage : "";
  sel.disabled = !!PRESETS[c.version];
  $("cfg-version-info").textContent = PRESETS[c.version]
    ? `Fixée par le formulaire « ${formulaireActif.nom} » dans l'administration des formulaires : ${PRESETS[c.version].libelle}.`
    : `Version appliquée : ${PRESETS[S().version].libelle}. « Automatique » la déduit de la table (colonne Site, ou référentiel autre que « Etablissements » : enseignement supérieur). Enregistré avec la page.`;
  $("cfg-entete-texte").textContent =
    `Commencer par l'établissement, par exemple « ${appliquerModele(S().entete, identiteExemple())} : »`;
}
$("cfg-version").addEventListener("change", async () => {
  try {
    await grist.setOption("version", $("cfg-version").value || null);
    versionPage = $("cfg-version").value || null;
    statut("cfg-statut", "Version de la page enregistrée.", "ok");
    enFile(async () => {
      await chargerConfiguration();
      await rafraichir();
      remplirVersionConfig();
    });
  } catch (e) {
    statut("cfg-statut", `Choix non enregistré : ${e.message || e}`, "err");
  }
});

/* Région académique : colonne du référentiel si elle existe (Region_academique, « Région académique (siège) »…),
   sinon déduite de l'académie (13 régions académiques métropolitaines et 5 d'outre-mer). */
const REGIONS_ACADEMIQUES = {
  "Auvergne-Rhône-Alpes": ["Clermont-Ferrand", "Grenoble", "Lyon"],
  "Bourgogne-Franche-Comté": ["Besançon", "Dijon"],
  Bretagne: ["Rennes"],
  "Centre-Val de Loire": ["Orléans-Tours"],
  Corse: ["Corse"],
  "Grand Est": ["Nancy-Metz", "Reims", "Strasbourg"],
  "Hauts-de-France": ["Amiens", "Lille"],
  "Île-de-France": ["Créteil", "Paris", "Versailles"],
  Normandie: ["Normandie", "Caen", "Rouen"],
  "Nouvelle-Aquitaine": ["Bordeaux", "Limoges", "Poitiers"],
  Occitanie: ["Montpellier", "Toulouse"],
  "Pays de la Loire": ["Nantes"],
  "Provence-Alpes-Côte d'Azur": ["Aix-Marseille", "Nice"],
  Guadeloupe: ["Guadeloupe"],
  Martinique: ["Martinique"],
  Guyane: ["Guyane"],
  "La Réunion": ["La Réunion", "Réunion"],
  Mayotte: ["Mayotte"],
};
const cleAcademie = (a) =>
  String(a || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^academie\s+(de\s+la\s+|de\s+|d['’]\s*)?/, "")
    .replace(/[^a-z]+/g, " ")
    .trim();
const REGION_PAR_ACADEMIE = new Map(
  Object.entries(REGIONS_ACADEMIQUES).flatMap(([r, l]) => l.map((a) => [cleAcademie(a), r])),
);
function colonneRegion() {
  const n = (c) =>
    String(c)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  return colsEtab.find((c) => /^region_?academique/.test(n(c))) || colsEtab.find((c) => /region/.test(n(c))) || null;
}
function regionAcademique(e) {
  if (!e) return "";
  const c = colonneRegion(),
    v = c ? e[c] : null;
  if (v != null && v !== "" && typeof v !== "object") return String(v);
  return REGION_PAR_ACADEMIE.get(cleAcademie(e[E.academie])) || "";
}
const CHAMPS_NOUVEL_ETAB = ["type", "uai", "academie", "departement"];
function statut(id, txt, type) {
  const el = $(id);
  el.textContent = txt;
  el.className = "statut " + (type || "");
}
const lisible = (v) => v !== undefined && !(Array.isArray(v) && v[0] === "C"); // cellule non censurée par les règles d'accès
// keepEncoded transforme une Référence simple en ['R', tableId, rowId] : on en extrait l'identifiant numérique.
const refId = (v) => (Array.isArray(v) && v[0] === "R" ? v[2] : typeof v === "number" ? v : null);
const idDe = (res) => res && (res.id ?? (Array.isArray(res) ? res[0]?.id : null));
// Exécute une écriture en précisant, en cas de refus, quelle étape et quelle table sont en cause
async function etape(libelle, table, action) {
  try {
    return await action();
  } catch (e) {
    const msg = (e && e.message) || String(e);
    const acl = /access rules|blocked/i.test(msg);
    // pièces jointes : structure vue par le lien d'établissement pas à jour (copie des colonnes) ou question non adaptée
    const pj = /formula column|cannot access attachment/i.test(msg)
      ? " — Pièces jointes : la responsable ou le responsable du document doit ouvrir l'administration, onglet « Formulaires », vérifier que la question Pièces jointes est « adaptée aux liens d'établissement », puis republier le formulaire ; rechargez ensuite cette page."
      : "";
    const err = new Error(`${libelle} (table « ${table} ») : ${acl ? "refusé par les règles d'accès" : msg}${pj}`);
    err.acl = acl;
    err.table = table;
    throw err;
  }
}

// Dates : formes Grist et format de la colonne
