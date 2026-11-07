/* PRISME — widget de saisie, fondations/etat.js
   État du widget : l'objet etatSaisie, seul endroit où vit ce qui change pendant l'utilisation.
   Chargé par saisie/index.html dans l'ordre : fondations, composants, domaines, demarrage.js. Les fichiers partagent
   leurs noms (scripts classiques, sans import) : au chargement, un fichier ne fait que définir. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : etatSaisie, idsCreesIci. */
const etatSaisie = {
  // ---------- outils de base (fondations/outils.js) : accès aux colonnes, valeurs Grist, dates au format des colonnes
  colonnesReconnues: {},
  colonnesParContenu: new Set(), // clé → colonne retenue quand elle diffère de l'identifiant par défaut

  // ---------- variante du formulaire, établissements scolaires ou enseignement supérieur (domaines/formulaire)
  versionPage: null, // option « version » de la page (administration, onglet Installation), utilisée quand le formulaire publié ne fixe pas la version

  // ---------- état général du widget et périmètre de la page : agent, académies, départements (tous les domaines)
  mappings: null,
  signatureMappings: null,
  tableId: null,
  enregistrements: [], // toutes les lignes visibles de la table (valeurs encodées)
  etabs: [], // lignes visibles de la table Etablissements
  colsEtab: [],
  alerteStructure: "",
  modeEtab: false, // true = accès par lien d'établissement
  pageEtab: null, // option « etablissements » : page ouverte par les liens des établissements (référentiel visé)
  referentielLu: false, // le référentiel a été lu (modeEtab est alors connu)
  dossierId: null, // null = création
  versions: [],
  initiale: null,
  derniere: null,
  etabCourant: null, // ligne Etablissements du dossier ou choisie à la création
  selectionAttendue: null, // ligne créée par le widget, à ouvrir dès qu'elle arrive
  modifie: false,
  modifieVisa: false,
  choix: [],
  couleurs: {},
  qualifMultiple: false,
  metaSig: {},
  metaDate: null,
  metaFaits: null,
  defsQuestions: [],
  defsDep: [],
  defsAca: [],
  champsVersion: [],
  colsParDefaut: {}, // colonne de même nom, pour un formulaire de l'administration (voir col())
  indexEtabs: new Map(),
  rolesAdmin: {}, // rôle -> colonne associée dans l'administration (formulaire publié)
  /* ---------- Périmètre de la page (réglé dans l'administration, « Pages de saisie par agent ») ----------
  perimetre = { colonne du référentiel: [valeurs] } : un établissement en fait partie s'il remplit chaque critère.
  Ancien format : liste d'académies. Le périmètre répartit le travail ; il ne restreint pas l'accès. */
  perimetreBrut: null,
  libellePage: "",
  voirToutPerimetre: false,
  /* Planning (Équipe › Planning de l'administration) : pendant un créneau où l'agent de la page est affecté, le périmètre
  du créneau s'applique (vide = tous les établissements). Hors créneau : périmètre des options de la page (vide pour
  les pages créées depuis l'équipe, donc tous les établissements). Relu chaque minute. */
  agentPage: null,
  perimetreFiche: null,
  creneauPage: null, // creneauPage : { creneau, affectation, horsChamp }
  /* Émargement (table Emargements du socle) : « Je prends mon service » crée une ligne (agent de la page, créneau en cours,
  heure de début) ; « Je termine » remplit l'heure de fin. L'auteur est noté par Grist (adresse du compte connecté) et,
  avec les règles d'accès du socle, seul l'agent lui-même peut émarger. */
  emargementsDispo: false,
  emargementOuvert: null,
  erreurEmargement: "",
  /* Établissement d'un signalement. Une cellule en rouge dans Grist (texte qui ne correspond à aucune ligne du référentiel,
  par exemple après conversion d'une colonne texte en référence) arrive sous forme de texte : l'établissement est alors
  retrouvé d'après son nom ou son UAI. */
  indexTexteEtabs: null,
  etabsIndexTexte: null,
  // Nom provisoire, avant la lecture du référentiel (qui peut prendre plusieurs secondes) : colonne formule de la table
  // des réponses qui reprend le nom (« Nom » = $Etablissement.Nom), sinon le texte de la cellule (référence invalide)
  colNomReponses: null,

  // ---------- liaison avec Grist : colonnes, réception des lignes, file d'attente (fondations/grist.js, demarrage.js)
  file: null, // sérialise les traitements asynchrones ; posée par fondations/grist.js
  idsPrecedents: null, // lignes connues avant le dernier envoi de Grist
  idsNouveaux: new Set(), // lignes apparues lors du dernier envoi
  // Envois rapprochés de Grist (plusieurs enregistrements à la suite) : seul le plus récent est traité
  envoiEnAttente: null,
  // Grist renvoie la ligne du curseur à chaque modification de la table, même si le curseur n'a pas bougé
  // (par exemple quand une autre vue enregistre un signalement). Seul un vrai déplacement du curseur doit
  // changer le signalement affiché : un simple renvoi ne fait que rafraîchir le signalement déjà ouvert,
  // et ne touche jamais à un formulaire en cours de saisie.
  dernierCurseur: null, // identifiant de la dernière ligne reçue, ou "new" pour la ligne d'ajout
  promesseMeta: null, // réinitialisée à chaque nouvelle configuration
  // Métadonnées illisibles (accès par lien d'établissement : les règles d'accès cachent les tables _grist_) :
  // copie des colonnes utiles rangée par l'administration dans la clé « schema » de Config, au même format.
  metaCopie: false,

  // ---------- formulaire publié : socle, rôles des colonnes, questions (domaines/formulaire, fondations/grist.js)
  TABLE_FORMULAIRES: "Formulaires", // remplacé par la clé « general » de Config
  /* ---------- Socle v2 : Config, tables et règles communes ---------- */
  socleConfig: null,
  socleGeneral: null, // posée par fondations/grist.js (lireSocleSaisie)
  formulaireActif: null,
  signatureFormulaire: "",
  decorsQ: { avant: {}, fin: [] },
  formulairesDispo: [],
  dernierControleFormulaire: 0,
  /* Filet de sécurité : une erreur pendant le chargement ne doit pas laisser un formulaire vide et sans « ⚙ Diagnostic ».
  Le message est affiché (à transmettre à l'administrateur) et les réglages restent ouverts. */
  erreursChargement: [],
  // Table des établissements : 1) choisie dans les réglages ; 2) table visée par la colonne « Établissement »
  // associée au widget ; 3) par défaut « Etablissements ».
  alerteTableRef: "",
  alerteHorloge: "", // conseil technique, affiché aux agents seulement
  /* Lecture rapide d'une table par l'API SQL de Grist : lue directement dans la base du document, sans passer par le
  moteur de calcul (qui traite les demandes une par une : une grande table y fait attendre toutes les autres).
  Refusée quand l'utilisateur n'a pas un accès complet (lien d'établissement, règles d'accès) : lecture habituelle. */
  jetonSQL: null,
  sqlRefuse: "",
  dernierChargementEtabs: 0,
  idEtabMax: 0,

  // ---------- copie du référentiel des établissements gardée dans le navigateur (domaines/etablissement/donnees.js)
  referentielDuCache: null, // date de la copie utilisée, ou null (lecture du serveur)
  etabsCharges: false,
  promesseEtabs: null,

  // ---------- dossier ouvert et qualification initiale (domaines/dossier)
  demandeAffichage: 0,

  // ---------- établissement : identification, mail et lien d'accès (domaines/etablissement)
  ligneAnnuaire: null, // sans objet dans la version ESR (pas de recherche dans les annuaires en ligne)
  sectionGardee: null,
  sectionCalculee: { id: null, r: null },
  /* Composante (IUT, INSPÉ, école interne…) ou site / campus du référentiel de l'enseignement supérieur (colonne
  Rattachement) : le dossier s'ouvre sur l'établissement de rattachement, pour que l'établissement ne soit pas compté
  deux fois ; la composante est rappelée, reprise dans la question « site » et ses sites sont proposés en premier. */
  composanteChoisie: null,

  // ---------- onglets, affichage du dossier, en-tête (composants/onglets.js, domaines/dossier)
  dateFaitsTouchee: false, // la date a-t-elle été changée à la main depuis l'ouverture du formulaire ?

  // ---------- description automatique, résumé des modifications, jour de mobilisation, doublons (domaines/enregistrement)
  ligneParametres: null,
  colsParametres: [],
  optionsAuto: null, // posée par fondations/reglages.js (appliquerOptions)
  /* ---------- Description rédigée à partir des réponses ---------- */
  // Tant que l'utilisateur n'a pas modifié la description à la main, elle suit les réponses.
  // Dès qu'il la modifie, elle n'est plus réécrite ; le bouton « Régénérer » la recalcule à la demande.
  descriptionManuelle: false,
  /* ---------- Repérage des doublons ----------
  À la création, si l'établissement a déjà un signalement (un dossier) dont une version porte sur le même
  jour des faits, le formulaire le signale et propose de l'ouvrir pour le mettre à jour plutôt que d'en créer
  un second. La création reste possible après confirmation explicite. */
  doublonConfirme: null, // clé « établissement|jour » confirmée par l'utilisateur

  // ---------- réglages communs lus (fondations/reglages.js) : options de la description, limites des nombres
  optionsParametres: null,

  // ---------- liste et recherche des signalements (domaines/dossier)
  // Menu des signalements, dessiné par le widget. Il rend la sélection possible sans « Sélectionner par » :
  // un widget lié est recouvert par Grist dès qu'aucune ligne n'est sélectionnée, ce qui empêcherait
  // toute création quand la vue est vide ou filtrée.
  dossiersInit: [],
  /* ---------- Barre de recherche des signalements ----------
  Cherche dans tous les dossiers visibles : établissement, commune, UAI, académie, n° de dossier, et le texte
  de la version initiale comme de la dernière version. Tous les mots tapés doivent être présents (sans accents). */
  indexRecherche: null,

  // ---------- couleur du formulaire selon une réponse (domaines/formulaire)
  reglesCouleur: [],

  // ---------- filtres de la liste et navigation d'une fiche à l'autre (domaines/dossier)
  // Plusieurs filtres, combinés par ET ; dans un même filtre, plusieurs valeurs combinées par OU.
  // Chaque filtre : { colonne, valeurs: [clés], libelles: { clé: texte }, contient: "" }
  filtres: [],
  listeChampsFiltre: [],
  posNav: null,
  cacheDernieres: null,
  filtreOuvert: null,
  minuterieContient: null,

  // ---------- formulaire par site, enseignement supérieur (domaines/sites-esr)
  /* « Une ligne par site connu » : nouveau dossier d'un établissement déjà signalé, le tableau des sites se remplit seul
  du dernier état connu de chaque site (sites revenus à la normale compris, sauf réglage contraire). Reprise
  réglable (reglages.tableau.sites.reprise) : "auto", "bouton" (proposée par un bouton), "non" (désactivée, par défaut :
  le tableau part vide, rien n'est proposé ; une reprise d'un signalement précédent ne reprend pas les sites). Refait si
  l'établissement change tant qu'aucune ligne n'a été touchée. */
  sitesAutoPour: null,
  qualifTouchee: false,

  // ---------- enregistrement : création, puis mise à jour par nouvelle version (domaines/enregistrement)
  // Le formulaire reflète toujours l'état courant, c'est-à-dire la dernière version enregistrée.
  versionAffichee: null, // copie de la version sur laquelle l'agent travaille

  // ---------- visas départementaux et académiques (domaines/visas)
  monNiveau: null, // niveau : "departement" | "academie" | "region" | null
  /* Viseur (onglet Validation de l'administration, 2.41) : l'agent de la page porte un échelon (Départemental, Académique)
  et un périmètre de visa (départements, académies ; vide = tous) ; il prime sur l'ancienne table Utilisateurs.
  reglageValidation : circuit de la table (null s'il n'est pas actif) ; la colonne de statut est une formule de Grist. */
  monPerimetreVisa: null,
  reglageValidation: null,
  fileVisa: false,
  /* Veille (onglet Veille de l'administration, 2.43) : vigilances météo au-dessus du seuil, rappelées aux agents sur l'accueil.
  Les établissements n'y ont pas accès (table illisible par leur lien) : rien ne s'affiche pour eux. */
  vigilancesPage: null,
  dernierVeille: 0,

  // ---------- recherche d'établissement, saisie semi-automatique (composants/recherche-etablissement.js)
  resultats: [],
  index: -1,
  minuterie: null,
  requete: 0,

  // ---------- correction de l'établissement d'un signalement (domaines/etablissement/affichage.js)
  reaffectation: false,
  etabPropose: null,
  dossierCorrection: undefined,
  // ---------- Fiche de l'établissement
  champsFiche: [], // [cle (rôle ou colonne), libellé, colonne]

  // ---------- parcours : accueil, vue de saisie, bandeaux (demarrage.js, domaines/dossier, domaines/etablissement)
  vue: "accueil",
  nbCartes: 30,
  ficheDepliee: false,
  ficheEtabId: null,
  creerEtabOuvert: false,
  propositionMasquee: null,
  curseurInitialVu: false,
  // ---------- Marques « modifié » et récapitulatif (mise à jour)
  minuterieMarques: null,
};
const idsCreesIci = new Set();
etatSaisie.socleGeneral = { ...window.Socle.DEFAUTS_GENERAL };
