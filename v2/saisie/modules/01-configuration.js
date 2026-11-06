/* PRISME — widget de saisie, module 01/31 : Configuration : référentiel des établissements, identifiants de colonnes, constantes.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* =========================================================
   CONFIGURATION
   ========================================================= */

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

// Identification de la personne connectée, pour n'afficher que le geste de validation qui la concerne.
// La règle d'accès sur cette table doit ne renvoyer QUE la ligne de la personne connectée
// (ex. : "user.Email == rec.Mail → Lecture"), sans quoi le widget ne peut pas déterminer un niveau unique.
const UTILISATEURS = {
  table: "Utilisateurs",
  colonnes: {
    region: "Region_academique",
    academie: "Academie",
    departement: "Departement",
    niveau: "Niveau_acces",
    nom: "Nom",
    prenom: "Prenom",
    fonction: "Fonction",
    mail: "Mail",
  },
};

// Message proposé à l'envoi du lien (s'ouvre dans la messagerie de l'agent)
const MESSAGE = {
  objet: (etab) => `Signalement concernant ${etab} : accès à votre formulaire`,
  corps: (etab, lien) =>
    `Bonjour,

Un espace de suivi des signalements a été ouvert pour ${etab}. Il vous permet de consulter, compléter et suivre vos signalements :

${lien}

Ce lien est propre à votre établissement : merci de ne pas le diffuser en dehors de l'équipe de direction.

Cordialement,`,
};

const ORIGINE = { EN: "Annuaire EN", ESR: "Annuaire ESR", manuel: "Manuel" };

// Modèle à table unique : chaque ligne est une version d'un signalement.
const NATURE = { initial: "Nouveau signalement", suivi: "Mise à jour" };

// La zone « Commentaire de mise à jour » n'est pas affichée dans le formulaire.
// Le résumé automatique des modifications reste enregistré dans la colonne Commentaire (si elle est associée).
const afficherCommentaire = () => !!S().commentaire;

// Recherche : référentiel du document, complété si le formulaire le prévoit par les annuaires en ligne
// (API OpenDataSoft v2.1). Clé du réglage ⚙ « Référentiel des établissements » dans la table Parametres :
const CLE_TABLE_ETAB = "tableEtablissementsESR";
const TABLE_ETAB_DEFAUT = "Etablissements";
const COLONNES_RECHERCHE_EN_PLUS = ["Sigle", "Noms_rencontres_dans_les_sources", "Libelle_consolide", "Mots_cles"]; // ignorées si absentes
const MIN_CARACTERES = 2;
const NB_RESULTATS = 15;
const NB_RESULTATS_ANNUAIRE = 8,
  MIN_CARACTERES_ANNUAIRE = 3;
const SOURCES = [
  {
    cle: "en",
    etiquette: "EN",
    nom: "Annuaire de l'éducation nationale",
    url: "https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-annuaire-education/records",
    champs: {
      nom: "nom_etablissement",
      uai: "identifiant_de_l_etablissement",
      type: "type_etablissement",
      academie: "libelle_academie",
      departement: "libelle_departement",
      commune: "nom_commune",
      mail: "mail",
    },
  },
  {
    cle: "esr",
    etiquette: "ESR",
    nom: "Principaux établissements de l'enseignement supérieur", // pas de mail dans ce jeu de données
    url: "https://data.enseignementsup-recherche.gouv.fr/api/explore/v2.1/catalog/datasets/fr-esr-principaux-etablissements-enseignement-superieur/records",
    champs: {
      nom: "uo_lib",
      uai: "uai",
      type: "type_d_etablissement",
      academie: "aca_nom",
      departement: "dep_nom",
      commune: "com_nom",
    },
  },
];
