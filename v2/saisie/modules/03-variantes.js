/* PRISME — widget de saisie, module 03/34 : Spécificités du formulaire : établissements scolaires ou enseignement supérieur.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : FICHE_DEFAUT, PRESETS, confSaisie, versionSaisie, varianteSaisie, appliquerVersion,
     appliquerColonnesForcees, ROLES_FICHE, colonneChampFiche, valeurChampFiche, libelleChampFiche, valeursEtab,
     appliquerModele, identiteExemple, remplirVersionConfig, REGIONS_ACADEMIQUES, cleAcademie, REGION_PAR_ACADEMIE,
     colonneRegion, regionAcademique, CHAMPS_NOUVEL_ETAB, statut, lisible, refId, idDe, ecrireEtape.
   Utilise :
     01 configuration : ETAB, SOURCES, TABLE_ETAB_DEFAUT.
     02 utilitaires : colonnesEtab.
     05 etat : colonneDe, etatSaisie.
     06 grist : enFile.
     07 formulaires : chargerConfiguration.
     09 dossier : rafraichir.
   Modifie etatSaisie : versionPage. */
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
    fiche: FICHE_DEFAUT.map(([colonne, libelle]) => ({ col: colonne, lib: libelle })),
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
    fiche: [...FICHE_DEFAUT.slice(0, 5), ["@region", "Région académique"], FICHE_DEFAUT[5]].map(
      ([colonne, libelle]) => ({
        col: colonne,
        lib: libelle,
      }),
    ),
    recherche: [],
    colonnes: {},
    faitsFuturs: true,
    plusieursJours: true,
  },
};
const confSaisie = () =>
  (typeof etatSaisie.formulaireActif !== "undefined" &&
    etatSaisie.formulaireActif &&
    etatSaisie.formulaireActif.conf &&
    etatSaisie.formulaireActif.conf.saisie) ||
  {};
function versionSaisie() {
  const configurationFormulaire = confSaisie();
  if (PRESETS[configurationFormulaire.version]) return configurationFormulaire.version;
  if (PRESETS[etatSaisie.versionPage]) return etatSaisie.versionPage;
  const chemin = decodeURIComponent(location.pathname || "").toLowerCase();
  if (/signalement-esr/.test(chemin)) return "esr";
  if (/signalement-sans-commentaire|widget-signalement\.html$/.test(chemin)) return "en";
  // document à deux champs (MEN et MESRE) : la table de réponses dit le champ
  try {
    const espace = window.Socle.espaceDeTable(etatSaisie.socleGeneral, etatSaisie.tableId);
    if (espace && window.Socle.espaces(etatSaisie.socleGeneral).length > 1) return espace.version;
  } catch (_) {
    /* socle indisponible */
  }
  return colonneDe("Site") || (ETAB.table && ETAB.table !== TABLE_ETAB_DEFAUT) ? "esr" : "en";
}
function varianteSaisie() {
  const versionActive = versionSaisie(),
    configurationFormulaire = confSaisie(),
    reglages = { ...PRESETS[versionActive], version: versionActive };
  if (typeof configurationFormulaire.marque === "string" && configurationFormulaire.marque.trim())
    reglages.marque = configurationFormulaire.marque.trim();
  if (Array.isArray(configurationFormulaire.annuaires))
    reglages.annuaires = configurationFormulaire.annuaires.filter((cleAnnuaire) =>
      SOURCES.some((source) => source.cle === cleAnnuaire),
    );
  if (typeof configurationFormulaire.entete === "string" && configurationFormulaire.entete.trim())
    reglages.entete = configurationFormulaire.entete;
  if (configurationFormulaire.pastilles === "toujours" || configurationFormulaire.pastilles === "auto")
    reglages.pastilles = configurationFormulaire.pastilles;
  if (typeof configurationFormulaire.commentaire === "boolean")
    reglages.commentaire = configurationFormulaire.commentaire;
  if (typeof configurationFormulaire.faitsFuturs === "boolean")
    reglages.faitsFuturs = configurationFormulaire.faitsFuturs;
  if (typeof configurationFormulaire.plusieursJours === "boolean")
    reglages.plusieursJours = configurationFormulaire.plusieursJours;
  if (Array.isArray(configurationFormulaire.fiche) && configurationFormulaire.fiche.length)
    reglages.fiche = configurationFormulaire.fiche.filter((champFiche) => champFiche && champFiche.col);
  if (Array.isArray(configurationFormulaire.recherche))
    reglages.recherche = configurationFormulaire.recherche.filter(Boolean);
  if (configurationFormulaire.colonnes && typeof configurationFormulaire.colonnes === "object")
    reglages.colonnes = configurationFormulaire.colonnes;
  if (typeof configurationFormulaire.qualificationEnBas === "boolean")
    reglages.qualificationEnBas = configurationFormulaire.qualificationEnBas; // formulaire par site : qualification déduite, en bas
  return reglages;
}
// Bandeau, liseré de la version, colonnes du référentiel imposées par le formulaire
function appliquerVersion() {
  const reglages = varianteSaisie();
  $("marque-app").textContent = reglages.marque;
  document.body.classList.toggle("version-esr", reglages.version === "esr");
  appliquerColonnesForcees();
}
function appliquerColonnesForcees() {
  const colonnesForcees = varianteSaisie().colonnes || {};
  for (const k of ["nom", "uai", "commune", "type", "academie", "departement", "mail"]) {
    if (
      colonnesForcees[k] &&
      etatSaisie.colsEtab.includes(colonnesForcees[k]) &&
      colonnesEtab[k] !== colonnesForcees[k]
    ) {
      colonnesEtab[k] = colonnesForcees[k];
      etatSaisie.colonnesReconnues[k] = colonnesForcees[k];
      etatSaisie.colonnesParContenu.delete(k);
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
  return cle.startsWith("@") ? colonnesEtab[cle.slice(1)] || null : cle;
}
function valeurChampFiche(etablissement, cle) {
  if (cle === "@region") return regionAcademique(etablissement);
  const colonne = colonneChampFiche(cle),
    valeur = colonne ? etablissement[colonne] : null;
  if (valeur == null || typeof valeur === "object") return "";
  if (typeof valeur === "boolean") return valeur ? "Oui" : "Non";
  return typeof valeur === "number" ? valeur.toLocaleString("fr-FR") : valeur;
}
const libelleChampFiche = (cle) => (String(cle).startsWith("@") ? ROLES_FICHE[cle.slice(1)] || cle.slice(1) : cle);
// Valeurs disponibles pour le modèle d'en-tête : rôles (nom, commune, uai…), région, et toute colonne du référentiel
function valeursEtab(etablissement) {
  const valeurs = {};
  for (const colonne of etatSaisie.colsEtab) {
    const valeur = etablissement[colonne];
    if (valeur != null && typeof valeur !== "object") valeurs[colonne] = valeur;
  }
  for (const k of Object.keys(ROLES_FICHE)) {
    const colonne = colonnesEtab[k];
    if (k !== "region" && colonne && etablissement[colonne] != null && typeof etablissement[colonne] !== "object")
      valeurs[k] = etablissement[colonne];
  }
  valeurs.region = regionAcademique(etablissement);
  return valeurs;
}
// « **{nom}**, **{commune}** » → « **Collège Jean Rostand**, **Draguignan** » ; les morceaux vides disparaissent
// (gras vide, parenthèses vides, virgule ou tiret orphelins)
function appliquerModele(modele, valeurs) {
  let texteModele = String(modele || "").replace(/\{([\w-]+)\}/g, (_, k) =>
    String(valeurs[k] ?? "")
      .replace(/\s+/g, " ")
      .trim(),
  );
  for (let i = 0; i < 3; i++)
    texteModele = texteModele
      .replace(/\*\*\s*\*\*/g, "")
      .replace(/\(\s*\)|\[\s*\]/g, "")
      .replace(/\s*[,;·]\s*(?=$|[,;·])/g, "")
      .replace(/\s+[–—-]\s*(?=$|[,;·–—-])/g, "")
      .replace(/^\s*[,;·–—-]\s*/, "");
  return texteModele
    .replace(/\s+([,;])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}
const identiteExemple = () =>
  varianteSaisie().version === "esr"
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
  const configurationFormulaire = confSaisie(),
    selecteurVersion = $("cfg-version");
  selecteurVersion.value = PRESETS[etatSaisie.versionPage] ? etatSaisie.versionPage : "";
  selecteurVersion.disabled = !!PRESETS[configurationFormulaire.version];
  $("cfg-version-info").textContent = PRESETS[configurationFormulaire.version]
    ? `Fixée par le formulaire « ${etatSaisie.formulaireActif.nom} » dans l'administration des formulaires : ${PRESETS[configurationFormulaire.version].libelle}.`
    : `Version appliquée : ${PRESETS[varianteSaisie().version].libelle}. « Automatique » la déduit de la table (colonne Site, ou référentiel autre que « Etablissements » : enseignement supérieur). Enregistré avec la page.`;
  $("cfg-entete-texte").textContent =
    `Commencer par l'établissement, par exemple « ${appliquerModele(varianteSaisie().entete, identiteExemple())} : »`;
}
$("cfg-version").addEventListener("change", async () => {
  try {
    await grist.setOption("version", $("cfg-version").value || null);
    etatSaisie.versionPage = $("cfg-version").value || null;
    statut("cfg-statut", "Version de la page enregistrée.", "ok");
    enFile(async () => {
      await chargerConfiguration();
      await rafraichir();
      remplirVersionConfig();
    });
  } catch (erreur) {
    statut("cfg-statut", `Choix non enregistré : ${erreur.message || erreur}`, "err");
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
const cleAcademie = (academie) =>
  String(academie || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^academie\s+(de\s+la\s+|de\s+|d['’]\s*)?/, "")
    .replace(/[^a-z]+/g, " ")
    .trim();
const REGION_PAR_ACADEMIE = new Map(
  Object.entries(REGIONS_ACADEMIQUES).flatMap(([region, academies]) =>
    academies.map((academie) => [cleAcademie(academie), region]),
  ),
);
function colonneRegion() {
  const minusculesSansAccents = (colonne) =>
    String(colonne)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  return (
    etatSaisie.colsEtab.find((colonne) => /^region_?academique/.test(minusculesSansAccents(colonne))) ||
    etatSaisie.colsEtab.find((colonne) => /region/.test(minusculesSansAccents(colonne))) ||
    null
  );
}
function regionAcademique(etablissement) {
  if (!etablissement) return "";
  const colonne = colonneRegion(),
    valeur = colonne ? etablissement[colonne] : null;
  if (valeur != null && valeur !== "" && typeof valeur !== "object") return String(valeur);
  return REGION_PAR_ACADEMIE.get(cleAcademie(etablissement[colonnesEtab.academie])) || "";
}
const CHAMPS_NOUVEL_ETAB = ["type", "uai", "academie", "departement"];
function statut(id, texte, type) {
  const zoneStatut = $(id);
  zoneStatut.textContent = texte;
  zoneStatut.className = "statut " + (type || "");
}
const lisible = (valeur) => valeur !== undefined && !(Array.isArray(valeur) && valeur[0] === "C"); // cellule non censurée par les règles d'accès
// keepEncoded transforme une Référence simple en ['R', tableId, rowId] : on en extrait l'identifiant numérique.
const refId = (valeur) =>
  Array.isArray(valeur) && valeur[0] === "R" ? valeur[2] : typeof valeur === "number" ? valeur : null;
const idDe = (resultat) => resultat && (resultat.id ?? (Array.isArray(resultat) ? resultat[0]?.id : null));
// Exécute une écriture en précisant, en cas de refus, quelle étape et quelle table sont en cause
async function ecrireEtape(libelle, table, action) {
  try {
    return await action();
  } catch (erreur) {
    const message = (erreur && erreur.message) || String(erreur);
    const acl = /access rules|blocked/i.test(message);
    // pièces jointes : structure vue par le lien d'établissement pas à jour (copie des colonnes) ou question non adaptée
    const indicationPiecesJointes = /formula column|cannot access attachment/i.test(message)
      ? " — Pièces jointes : la responsable ou le responsable du document doit ouvrir l'administration, onglet « Formulaires », vérifier que la question Pièces jointes est « adaptée aux liens d'établissement », puis republier le formulaire ; rechargez ensuite cette page."
      : "";
    const erreurEtape = new Error(
      `${libelle} (table « ${table} ») : ${acl ? "refusé par les règles d'accès" : message}${indicationPiecesJointes}`,
    );
    erreurEtape.acl = acl;
    erreurEtape.table = table;
    throw erreurEtape;
  }
}

// Dates : formes Grist et format de la colonne
