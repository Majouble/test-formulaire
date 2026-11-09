/* PRISME — administration, onglet « Formulaires » : formulaires/donnees.js
   Données : lectures de la structure du document et de la table Formulaires, écritures (tables, colonnes, lignes de
   Formulaires).
   Chargé par admin/index.html dans l'ordre : fondations, donnees, formulaire-courant, colonnes-roles, apercu,
   mode-test, panneau-question, sites-esr, tableaux, gestion, description, saisie-etablissement, demarrage. Les
   fichiers partagent leurs noms (scripts classiques, sans import) : au chargement, un fichier ne fait que définir ;
   demarrage.js branche les événements et publie l'onglet. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : lireMeta, colonnesDe, lireFormulaires, creerTableFormulaires, actions, ecrireStructure, ajouterColonne,
     modifierColonne, retirerColonneDeTable, renommerTable, renommerLibelleColonne, creerTableLignes,
     modifierLigneFormulaire, creerLigneFormulaire, lireValeursColonne, creerColonne.
   Utilise :
     fondations : COLONNES_TABLE_FORMULAIRES, TABLES_EXCLUES, etatFormulaires, identifiant.
     colonnes-roles : metaCourante.
   Modifie etatFormulaires : formulaires, meta, metaTables, tables. */
/* ---------- lecture de Grist ---------- */
async function lireMeta() {
  etatFormulaires.metaTables = await Promise.all([Donnees.lire("_grist_Tables"), Donnees.lire("_grist_Tables_column")]);
  const [tablesGrist] = etatFormulaires.metaTables;
  etatFormulaires.tables = tablesGrist.tableId.filter(
    (identifiantTable) =>
      identifiantTable && !TABLES_EXCLUES.test(identifiantTable) && !identifiantTable.startsWith("_grist"),
  );
}
function colonnesDe(table) {
  const [tablesGrist, colonnesGrist] = etatFormulaires.metaTables;
  const idTable = tablesGrist.id[tablesGrist.tableId.indexOf(table)];
  if (idTable == null) return {};
  const colonnes = {};
  for (let i = 0; i < colonnesGrist.id.length; i++) {
    if (colonnesGrist.parentId[i] !== idTable) continue;
    const colId = colonnesGrist.colId[i];
    if (colId === "manualSort" || colId.startsWith("gristHelper")) continue;
    let options = {};
    try {
      options = JSON.parse(colonnesGrist.widgetOptions[i] || "{}");
    } catch (_) {}
    colonnes[colId] = {
      colId,
      libelle: colonnesGrist.label[i] || colId,
      type: colonnesGrist.type[i],
      opts: options,
      description: (colonnesGrist.description && colonnesGrist.description[i]) || "",
      formule: !!(colonnesGrist.isFormula && colonnesGrist.isFormula[i] && colonnesGrist.formula[i]),
      texteFormule: (colonnesGrist.isFormula && colonnesGrist.isFormula[i] && colonnesGrist.formula[i]) || "",
      pos: colonnesGrist.parentPos ? colonnesGrist.parentPos[i] : i,
      ref: colonnesGrist.id[i],
    };
    // pièces jointes calculées depuis une colonne d'envoi (formulePiecesJointes) : question ordinaire pour l'administration
    const correspondancePj =
      /^Attachments/.test(colonnesGrist.type[i]) &&
      colonnes[colId].formule &&
      /\(\$(\w+) or ""\)\.split\(\)/.exec(colonnes[colId].texteFormule);
    if (correspondancePj) {
      colonnes[colId].formule = false;
      colonnes[colId].pjEnvoi = correspondancePj[1];
    }
  }
  return colonnes;
}
async function lireFormulaires() {
  try {
    const donneesFormulaires = await Donnees.lire(etatFormulaires.tableFormulaires);
    etatFormulaires.formulaires = donneesFormulaires.id.map((id, i) => ({
      id,
      nom: donneesFormulaires.Nom ? String(donneesFormulaires.Nom[i] ?? "") : `Formulaire ${id}`,
      table: donneesFormulaires.Table ? String(donneesFormulaires.Table[i] ?? "") : "",
      brouillon: donneesFormulaires.Brouillon ? donneesFormulaires.Brouillon[i] : "",
      publie: donneesFormulaires.Publie ? donneesFormulaires.Publie[i] : "",
      publieLe: donneesFormulaires.Publie_le ? donneesFormulaires.Publie_le[i] : null,
      type: donneesFormulaires.Type ? String(donneesFormulaires.Type[i] || "etablissement") : "etablissement",
      widget: donneesFormulaires.Widget ? String(donneesFormulaires.Widget[i] || "") : "",
    }));
    return true;
  } catch (_) {
    etatFormulaires.formulaires = [];
    return false;
  }
}
async function creerTableFormulaires() {
  await Donnees.ecrire([
    [
      "AddTable",
      etatFormulaires.tableFormulaires,
      COLONNES_TABLE_FORMULAIRES.map((colonne) => ({ id: colonne.id, type: colonne.type, isFormula: false })),
    ],
  ]);
}
const actions = (actionsGrist) => Donnees.ecrire(actionsGrist);
/* ---------- écritures dans le document : structure (tables, colonnes) et table Formulaires ----------
   Une écriture de structure est suivie d'une relecture de la structure (lireMeta). */
async function ecrireStructure(actionsGrist) {
  await actions(actionsGrist);
  await lireMeta();
}
const ajouterColonne = (table, colId, info) => ecrireStructure([["AddColumn", table, colId, info]]);
const modifierColonne = (table, colId, champs) => ecrireStructure([["ModifyColumn", table, colId, champs]]);
const retirerColonneDeTable = (table, colId) => ecrireStructure([["RemoveColumn", table, colId]]);
const renommerTable = (ancien, nouveau) => ecrireStructure([["RenameTable", ancien, nouveau]]);
// Libellé d'une colonne : l'identifiant est d'abord détaché du libellé, pour ne pas changer avec lui
const renommerLibelleColonne = (table, colId, libelle) =>
  ecrireStructure([
    ["ModifyColumn", table, colId, { untieColIdFromLabel: true }],
    ["ModifyColumn", table, colId, { label: libelle }],
  ]);
// Table des lignes d'une question tableau : chaque ligne renvoie à son dossier (Dossier), avec Ligne_id et Ordre
const creerTableLignes = (nom, tableReponses) =>
  ecrireStructure([
    [
      "AddTable",
      nom,
      [
        { id: "Dossier", type: `Ref:${tableReponses}`, isFormula: false },
        { id: "Ligne_id", type: "Text", isFormula: false },
        { id: "Ordre", type: "Int", isFormula: false },
      ],
    ],
  ]);
// Table Formulaires : modifier une ligne, en créer une (renvoie son identifiant)
const modifierLigneFormulaire = (id, champs) =>
  actions([["UpdateRecord", etatFormulaires.tableFormulaires, id, champs]]);
async function creerLigneFormulaire(champs) {
  const resultat = await actions([["AddRecord", etatFormulaires.tableFormulaires, null, champs]]);
  return resultat && resultat.retValues && resultat.retValues[0];
}
// Valeurs d'une colonne d'une table (liste vide si la colonne est absente ou illisible)
const lireValeursColonne = async (table, colId) => (await Donnees.lire(table))[colId] || [];
async function creerColonne(table, libelle, type, options, formule) {
  const existants = Object.keys(colonnesDe(table));
  const colId = identifiant(libelle, existants);
  const info = { type, label: libelle, isFormula: !!formule, untieColIdFromLabel: true };
  if (formule) info.formula = formule;
  if (options && Object.keys(options).length) info.widgetOptions = JSON.stringify(options);
  const resultat = await actions([["AddColumn", table, colId, info]]);
  const retour = resultat && resultat.retValues && resultat.retValues[0];
  await lireMeta();
  etatFormulaires.meta = metaCourante();
  return (retour && retour.colId) || colId;
}
