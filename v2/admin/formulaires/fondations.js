/* PRISME — administration, onglet « Formulaires » : formulaires/fondations.js
   Fondations : constantes (table Formulaires, parties, types de questions, couleurs), petits outils, état de
   l'onglet (etatFormulaires), messages.
   Chargé par admin/index.html dans l'ordre : fondations, donnees, formulaire-courant, colonnes-roles, apercu,
   mode-test, panneau-question, sites-esr, tableaux, gestion, description, saisie-etablissement, demarrage. Les
   fichiers partagent leurs noms (scripts classiques, sans import) : au chargement, un fichier ne fait que définir ;
   demarrage.js branche les événements et publie l'onglet. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : COLONNES_TABLE_FORMULAIRES, TABLES_EXCLUES, PARTIES_DEFAUT, ROLES, TYPES_QUESTIONNAIRE,
     COLONNES_COMMUNES, COLONNES_SERVICE_QUESTIONNAIRE, RESERVES_TABLEAU, actionsHistoriqueTableau, COULEURS,
     TYPES_QUESTIONS, esc, $, normaliser, typeBase, nouvelId, copie, maintenant, identifiant, lisible,
     estVideValeur, etatFormulaires, message.
   Utilise :
     donnees : colonnesDe.
     colonnes-roles : rolesEffectifs.
   Modifie etatFormulaires : minuterieMessage. */
/* Widget d'administration des formulaires
  Chaque formulaire est une ligne de la table « Formulaires » : Nom, Table (table des réponses),
  Brouillon (JSON, enregistré à chaque modification), Publie (JSON lu par le widget de saisie),
  Publie_le, Modifie_le. Les colonnes des questions sont créées dans la table des réponses dès
  l'ajout d'une question ; elles n'apparaissent dans les formulaires qu'à la publication.
  Format d'un bloc : { id, genre: "question" | "titre" | "info", section: "q" | "vd" | "va",
    colonne, texte, reglages: { libelle, aide, obligatoire, condition: { ref, op, valeurs }, affichage,
    court, min, max, couleur ("choix" | [{ cle, couleur }]), confidentiel, format, tableau: { table, lignes } } } */
const COLONNES_TABLE_FORMULAIRES = [
  { id: "Nom", type: "Text" },
  { id: "Table", type: "Text" },
  { id: "Brouillon", type: "Text" },
  { id: "Publie", type: "Text" },
  { id: "Publie_le", type: "DateTime:Europe/Paris" },
  { id: "Modifie_le", type: "DateTime:Europe/Paris" },
];
const TABLES_EXCLUES =
  /^(Formulaires|Config|Parametres|Utilisateurs|Config_.*|Colonnes_point|Sections_point|Tri_point|Points_situation|GristDoc.*|_grist.*)$/;
// Parties du formulaire : rôle q (formulaire de signalement, plusieurs parties possibles), vd / va (onglet Visas)
const PARTIES_DEFAUT = [
  { id: "q", nom: "Signalement", role: "q" },
  { id: "vd", nom: "Visa départemental", role: "vd" },
  { id: "va", nom: "Visa académique", role: "va" },
];
const ROLES = { q: "formulaire", vd: "onglet Visas, échelon départemental", va: "onglet Visas, échelon académique" };
const TYPES_QUESTIONNAIRE = { etablissement: "Questionnaire établissement" };
const COLONNES_COMMUNES = ["Etablissement", "Site", "Date_faits", "Qualification", "Description"];
// Colonnes de service d'un questionnaire établissement (contrôlées dans le panneau « Formulaire »)
const COLONNES_SERVICE_QUESTIONNAIRE = [
  {
    id: "Dossier",
    lib: "Dossier",
    aide: "Relie les mises à jour à leur signalement : sans elle, chaque enregistrement crée un nouveau dossier.",
    info: (table) => ({ type: `Ref:${table}`, isFormula: false, label: "Dossier" }),
  },
  {
    id: "Nature",
    lib: "Nature",
    aide: "« Nouveau signalement » ou « Mise à jour ».",
    info: () => ({
      type: "Choice",
      isFormula: false,
      widgetOptions: JSON.stringify({ choices: ["Nouveau signalement", "Mise à jour"] }),
    }),
  },
  {
    id: "Date",
    lib: "Date de saisie",
    aide: "Remplie par le serveur de Grist (formule d'initialisation NOW()).",
    info: () => ({ type: "DateTime:Europe/Paris", isFormula: false, formula: "NOW()", label: "Date de saisie" }),
  },
  {
    id: "Auteur",
    lib: "Auteur",
    aide: "Adresse de la personne qui enregistre (formule d'initialisation user.Email).",
    info: () => ({ type: "Text", isFormula: false, formula: "user.Email" }),
  },
  {
    id: "Commentaire",
    lib: "Commentaire",
    aide: "Résumé des changements d'une mise à jour.",
    info: () => ({ type: "Text", isFormula: false }),
  },
  {
    id: "Clos",
    lib: "Clos",
    aide: "Permet de clore un signalement terminé (menu « Autres actions » du formulaire).",
    info: () => ({ type: "Bool", isFormula: false, label: "Clos" }),
  },
  {
    id: "Site",
    lib: "Site / bâtiment",
    aide: "Version enseignement supérieur : site, campus ou bâtiment concerné.",
    info: () => ({ type: "Text", isFormula: false, label: "Site / bâtiment" }),
  },
];
const RESERVES_TABLEAU = ["id", "manualSort", "Dossier", "Ligne_id", "Ordre", "Version", "Mouvement"];
// colonnes d'historique d'une sous-table (une ligne par version et par ligne saisie), absentes de la table tid
function actionsHistoriqueTableau(table, colDos) {
  const roles = Object.fromEntries(
    Object.entries(rolesEffectifs())
      .filter(([, identifiantColonne]) => identifiantColonne)
      .map(([k, identifiantColonne]) => [k, { col: identifiantColonne }]),
  );
  const existantes = colonnesDe(table) || {};
  return window.Socle.colonnesHistoriqueTableau(table, etatFormulaires.courant.table, colDos || "Dossier", roles)
    .filter((colonne) => !existantes[colonne.id])
    .map((colonne) => [
      "AddColumn",
      table,
      colonne.id,
      {
        type: colonne.type,
        isFormula: !!colonne.isFormula,
        formula: colonne.formula || "",
        ...(colonne.widgetOptions ? { widgetOptions: colonne.widgetOptions } : {}),
        label: colonne.id,
      },
    ]);
}
const COULEURS = {
  rouge: "#ce0500",
  orange: "#e4794a",
  jaune: "#f5c400",
  vert: "#18753c",
  bleu: "#000091",
  violet: "#6a1b9a",
  gris: "#777777",
};
const TYPES_QUESTIONS = [
  { cle: "court", nom: "Texte court", icone: "Aa", type: "Text", reglages: { court: true } },
  { cle: "long", nom: "Texte long", icone: "¶", type: "Text" },
  { cle: "nombre", nom: "Nombre", icone: "12", type: "Int" },
  { cle: "choix", nom: "Choix unique", icone: "◉", type: "Choice", choix: ["Option 1", "Option 2"] },
  { cle: "multi", nom: "Choix multiple", icone: "☑", type: "ChoiceList", choix: ["Option 1", "Option 2"] },
  { cle: "bool", nom: "Oui / Non", icone: "⇄", type: "Bool" },
  { cle: "date", nom: "Date", icone: "▤", type: "Date" },
  { cle: "pj", nom: "Pièces jointes (photos, documents)", icone: "📎", type: "Attachments" },
  { cle: "tableau", nom: "Tableau (lignes)", icone: "▦", type: "Text" },
  { cle: "etab", nom: "Donnée de la fiche établissement", icone: "É", etab: true },
  { cle: "titre", nom: "Titre de section", icone: "H", decor: "titre" },
  { cle: "info", nom: "Texte d'information", icone: "i", decor: "info" },
];

/* ---------- outils ---------- */
const { esc, $ } = Outils;
// Texte comparable : sans accents ni majuscules, apostrophes et espaces ramenés à une espace (règle commune)
const normaliser = Socle.texteComparable;
const typeBase = (typeColonne) => (typeColonne || "Any").split(":")[0];
const nouvelId = () => "b" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const copie = (objet) => JSON.parse(JSON.stringify(objet));
const maintenant = () => Date.now() / 1000;
function identifiant(libelle, existants) {
  let base =
    String(libelle || "Question")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "Question";
  if (/^\d/.test(base)) base = "Q_" + base;
  base = base.charAt(0).toUpperCase() + base.slice(1);
  let id = base,
    numero = 2;
  const pris = new Set([...existants].map((existant) => existant.toLowerCase()));
  while (pris.has(id.toLowerCase())) id = `${base}_${numero++}`;
  return id;
}
const lisible = (valeur) => valeur !== undefined && !(Array.isArray(valeur) && valeur[0] === "C");
function estVideValeur(valeur) {
  if (valeur == null || valeur === "" || valeur === false) return true;
  if (Array.isArray(valeur)) return valeur[0] === "L" ? valeur.length <= 1 : !valeur.length;
  if (typeof valeur === "string") return !valeur.trim() || valeur.trim() === "[]";
  return false;
}

/* ---------- état ----------
   Tout ce qui change pendant l'utilisation de l'onglet est rangé dans etatFormulaires. Une modification s'écrit
   « etatFormulaires.nom = … » : chercher ce texte montre tous les endroits qui la font. */
const etatFormulaires = {
  tableFormulaires: "Formulaires", // remplacé au démarrage par la clé « general » de Config
  formulaires: [], // lignes de la table Formulaires
  courant: null, // { id, nom, table, conf: { blocs }, publie }
  meta: {}, // colonnes de la table du formulaire courant
  metaTables: null, // [tables, colonnes] de Grist
  tables: [],
  choisi: null, // id du bloc sélectionné
  modeTest: false,
  simulations: {}, // valeurs simulées des colonnes hors formulaire (mode test)
  accesOk: true,
  metaColonnesReelles: {}, // colonnes réelles de la table du formulaire courant
  minuterie: null,
  enregistrementEnCours: Promise.resolve(),
  minuterieMessage: null,
  modeApercu: "nouveau", // situation montrée par l'aperçu : nouveau signalement ou mise à jour d'un dossier
  testLignes: {},
  // Glisser-déposer
  blocGlisse: null,
  menuContextuel: null,
  duplication: false,
  etablissementsTest: null,
  etablissementTest: null,
  colonnesEtablissementTest: {},
  siteTest: "",
  descriptionTestManuelle: false,
  reglagesCommuns: null,
  brouillonCommuns: null,
  pagesSaisie: null, // vues personnalisées du document qui affichent un formulaire de saisie
  socleConfig: null,
  socleGeneral: null, // valeur posée au chargement, plus bas
  demarre: false,
};
function message(texte, type) {
  let bandeau = $("msg-global");
  if (!bandeau) {
    bandeau = document.createElement("div");
    bandeau.id = "msg-global";
    bandeau.className = "bandeau bandeau-msg";
    bandeau.setAttribute("role", "status");
    $("apercu").prepend(bandeau);
  }
  bandeau.textContent = texte;
  bandeau.style.background = type === "ok" ? "#e6f4ea" : "";
  bandeau.style.color = type === "ok" ? "var(--ok)" : "";
  clearTimeout(etatFormulaires.minuterieMessage);
  if (type === "ok") etatFormulaires.minuterieMessage = setTimeout(() => bandeau.remove(), 4000);
}
