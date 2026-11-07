/* PRISME — widget de saisie, fondations/configuration.js
   Configuration : référentiel des établissements, identifiants de colonnes, constantes.
   Chargé par saisie/index.html dans l'ordre : fondations, composants, domaines, demarrage.js. Les fichiers partagent
   leurs noms (scripts classiques, sans import) : au chargement, un fichier ne fait que définir. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : ETAB, CLE_TABLE_ETAB, TABLE_ETAB_DEFAUT, colonnesEtab, COLONNES_ETAB_DEFAUT, OPTIONS_DEFAUT. */
// Référentiel des établissements (table du document). Identifiants de colonnes Grist.
const ETAB = {
  table: "Etablissements", // remplacée au chargement : réglage « Référentiel des établissements », sinon table visée par la colonne Établissement
  colonnes: {
    uai: "UAI",
    nom: "Nom",
    type: "Type",
    academie: "Academie",
    departement: "Departement",
    commune: "Commune",
    mail: "Mail",
    mailAnnuaire: "Mail_annuaire", // valeur de l'annuaire, gérée par le widget de mise à jour
    origine: "Origine", // Annuaire EN / Annuaire ESR / Manuel
    present: "Dans_annuaire", // Booléen
    cle: "UUID", // formule d'initialisation UUID() ; masquée aux établissements par les règles d'accès
    lien: "Lien", // formule SELF_HYPERLINK(page=…, LinkKey_…=$UUID)
  },
};
// Recherche : référentiel du document, complété si le formulaire le prévoit par les annuaires en ligne
// (API OpenDataSoft v2.1). Clé du réglage ⚙ « Référentiel des établissements » dans la table Parametres :
const CLE_TABLE_ETAB = "tableEtablissementsESR";
const TABLE_ETAB_DEFAUT = "Etablissements";
const colonnesEtab = ETAB.colonnes;
/* Reconnaissance des colonnes du référentiel : si une colonne attendue (Nom, UAI, Commune…) n'existe pas
   sous cet identifiant, le widget cherche une colonne équivalente d'après son identifiant ou son libellé
   (« Appellation officielle », « Numéro UAI », « Nom de l'établissement », « Code RNE »…), ou, pour l'UAI,
   d'après son contenu (7 chiffres + 1 lettre). */
const COLONNES_ETAB_DEFAUT = { ...ETAB.colonnes };
const OPTIONS_DEFAUT = {
  actif: true,
  format: "libelle",
  separateur: "ligne",
  puce: "",
  longueur: 200,
  position: "avant",
  qualification: true,
  description: false,
  questions: true,
  mobilisation: true,
  entete: true,
  nombresPositifs: false,
  bornes: {},
};
