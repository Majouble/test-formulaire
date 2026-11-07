/* PRISME — widget de saisie, module 05/34 : État du widget et périmètre de la page (agent, académies, départements).
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : etatSaisie, colonneDe, valeurLigne, idDossierDe, champWidget, lirePlanningCreneau, choisirCreneauAgent,
     calculerPerimetreCreneau, signatureCreneau, afficherChangementCreneau, majCreneau, lireEmargementAgent,
     htmlEmargement, ecrireEmargement, messageErreurEmargement, basculerService, heureCourte, texteCreneau,
     perimetre, perimetreActif, dansPerimetre, resumePerimetre, afficherBandeauPerimetre, etabDe, cleTexteEtab,
     etabParTexte, trouverColNomReponses, texteEtabBrut, etabDeLigne, nomEtabLigne.
   Utilise :
     02 utilitaires : colonnesEtab, normColonne, sansAccents.
     03 variantes : refId, varianteSaisie.
     18 liste-dossiers : majListeDossiers. */
/* =========================================================
   État du widget
   ---------------------------------------------------------
   Tout ce qui change pendant l'utilisation de la page est rangé dans etatSaisie. Une modification s'écrit
   « etatSaisie.nom = … » : chercher ce texte montre tous les endroits qui la font. Les variables sont groupées
   par module (celui qui les définit) ; « posée par le module NN » : valeur initiale calculée au chargement de ce module.
   ========================================================= */
const etatSaisie = {
  // ---------- module 02 : Outils de base : accès aux colonnes, valeurs Grist, dates au format des colonnes
  colonnesReconnues: {},
  colonnesParContenu: new Set(), // clé → colonne retenue quand elle diffère de l'identifiant par défaut

  // ---------- module 03 : Spécificités du formulaire : établissements scolaires ou enseignement supérieur
  versionPage: null, // option « version » de la page (⚙), utilisée quand le formulaire publié ne fixe pas la version

  // ---------- module 05 : État du widget et périmètre de la page (agent, académies, départements)
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

  // ---------- module 06 : Liaison avec Grist (colonnes, réception des lignes) et lecture de la configuration
  file: null, // sérialise les traitements asynchrones ; posée par le module 06
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

  // ---------- module 07 : Formulaires construits dans l'administration : socle, rôles des colonnes, questions
  TABLE_FORMULAIRES: "Formulaires", // remplacé par la clé « general » de Config
  /* ---------- Socle v2 : Config, tables et règles communes ---------- */
  socleConfig: null,
  socleGeneral: null, // posée par le module 07
  formulaireActif: null,
  signatureFormulaire: "",
  decorsQ: { avant: {}, fin: [] },
  formulairesDispo: [],
  dernierControleFormulaire: 0,
  /* Filet de sécurité : une erreur pendant le chargement ne doit pas laisser un formulaire vide et sans « ⚙ Réglages ».
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

  // ---------- module 08 : Référentiel des établissements conservé dans le navigateur
  referentielDuCache: null, // date de la copie utilisée, ou null (lecture du serveur)
  etabsCharges: false,
  promesseEtabs: null,

  // ---------- module 09 : Données du dossier et qualification initiale
  demandeAffichage: 0,

  // ---------- module 14 : Établissement : identification, mail et lien d'accès
  ligneAnnuaire: null, // sans objet dans la version ESR (pas de recherche dans les annuaires en ligne)
  sectionGardee: null,
  sectionCalculee: { id: null, r: null },
  /* Composante (IUT, INSPÉ, école interne…) ou site / campus du référentiel de l'enseignement supérieur (colonne
  Rattachement) : le dossier s'ouvre sur l'établissement de rattachement, pour que l'établissement ne soit pas compté
  deux fois ; la composante est rappelée, reprise dans la question « site » et ses sites sont proposés en premier. */
  composanteChoisie: null,

  // ---------- module 15 : Onglets, affichage du dossier, en-tête
  dateFaitsTouchee: false, // la date a-t-elle été changée à la main depuis l'ouverture du formulaire ?

  // ---------- module 16 : Description automatique, résumé des modifications, jour de mobilisation, doublons
  ligneParametres: null,
  colsParametres: [],
  optionsAuto: null, // posée par le module 16
  /* ---------- Description rédigée à partir des réponses ---------- */
  // Tant que l'utilisateur n'a pas modifié la description à la main, elle suit les réponses.
  // Dès qu'il la modifie, elle n'est plus réécrite ; le bouton « Régénérer » la recalcule à la demande.
  descriptionManuelle: false,
  /* ---------- Repérage des doublons ----------
  À la création, si l'établissement a déjà un signalement (un dossier) dont une version porte sur le même
  jour des faits, le formulaire le signale et propose de l'ouvrir pour le mettre à jour plutôt que d'en créer
  un second. La création reste possible après confirmation explicite. */
  doublonConfirme: null, // clé « établissement|jour » confirmée par l'utilisateur

  // ---------- module 17 : Réglages du formulaire (table Parametres) : bornes des nombres, options, panneau ⚙
  optionsParametres: null,

  // ---------- module 18 : Menu et recherche des signalements
  // Menu des signalements, dessiné par le widget. Il rend la sélection possible sans « Sélectionner par » :
  // un widget lié est recouvert par Grist dès qu'aucune ligne n'est sélectionnée, ce qui empêcherait
  // toute création quand la vue est vide ou filtrée.
  dossiersInit: [],
  /* ---------- Barre de recherche des signalements ----------
  Cherche dans tous les dossiers visibles : établissement, commune, UAI, académie, n° de dossier, et le texte
  de la version initiale comme de la dernière version. Tous les mots tapés doivent être présents (sans accents). */
  indexRecherche: null,

  // ---------- module 23 : Couleur du formulaire selon une réponse
  reglesCouleur: [],

  // ---------- module 24 : Filtre des signalements et navigation d'une fiche à l'autre
  // Plusieurs filtres, combinés par ET ; dans un même filtre, plusieurs valeurs combinées par OU.
  // Chaque filtre : { colonne, valeurs: [clés], libelles: { clé: texte }, contient: "" }
  filtres: [],
  listeChampsFiltre: [],
  posNav: null,
  cacheDernieres: null,
  filtreOuvert: null,
  minuterieContient: null,

  // ---------- module 26 : Formulaire par site (enseignement supérieur)
  /* « Une ligne par site connu » : nouveau dossier d'un établissement déjà signalé, le tableau des sites se remplit seul
  du dernier état connu de chaque site (sites revenus à la normale compris, sauf réglage contraire). Reprise
  réglable (reglages.tableau.sites.reprise) : "auto", "bouton" (proposée par un bouton), "non" (désactivée, par défaut :
  le tableau part vide, rien n'est proposé ; une reprise d'un signalement précédent ne reprend pas les sites). Refait si
  l'établissement change tant qu'aucune ligne n'a été touchée. */
  sitesAutoPour: null,
  qualifTouchee: false,

  // ---------- module 28 : Signalement : création, puis mise à jour par nouvelle version
  // Le formulaire reflète toujours l'état courant, c'est-à-dire la dernière version enregistrée.
  versionAffichee: null, // copie de la version sur laquelle l'agent travaille

  // ---------- module 30 : Visas départementaux et académiques
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

  // ---------- module 31 : Recherche d'établissement (autocomplétion)
  resultats: [],
  index: -1,
  minuterie: null,
  requete: 0,

  // ---------- module 33 : Corriger l'établissement d'un signalement
  reaffectation: false,
  etabPropose: null,
  dossierCorrection: undefined,
  // ---------- Fiche de l'établissement
  champsFiche: [], // [cle (rôle ou colonne), libellé, colonne]

  // ---------- module 34 : Parcours : accueil, vue de saisie, bandeaux, démarrage du widget
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

// Colonne associée dans le panneau de Grist ; à défaut, pour un formulaire de l'administration, la colonne de même nom
const colonneDe = (cle) =>
  etatSaisie.mappings && typeof etatSaisie.mappings[cle] === "string"
    ? etatSaisie.mappings[cle]
    : etatSaisie.colsParDefaut[cle] || null;
const valeurLigne = (ligne, cle) => (ligne && colonneDe(cle) ? ligne[colonneDe(cle)] : null);
// Identifiant du dossier d'une ligne de signalement : la référence Dossier, sinon la ligne elle-même (première version)
const idDossierDe = (ligne) => refId(colonneDe("Dossier") && ligne[colonneDe("Dossier")]) || ligne.id;
// Champ de ce formulaire (EN, ESR) : un agent mobilisé sur l'autre champ pendant le créneau en est averti
const champWidget = () => {
  try {
    return (window.Socle.CHAMPS.find((champ) => champ.version === varianteSaisie().version) || {}).id || "";
  } catch (_) {
    return "";
  }
};
// Lit le planning du socle (null si illisible)
async function lirePlanningCreneau() {
  let planning = null;
  try {
    planning = await window.Socle.lirePlanning(etatSaisie.socleGeneral);
  } catch (_) {
    planning = null;
  }
  return planning;
}
// Choisit le créneau en cours de l'agent, de préférence dans le champ de ce formulaire
function choisirCreneauAgent(planning) {
  const enCours = window.Socle.affectationsEnCours(planning, etatSaisie.agentPage),
    champFormulaire = champWidget();
  // de préférence une affectation qui couvre le champ de ce formulaire
  const dansChamp = enCours.find(
    (affectationEnCours) =>
      !champFormulaire || window.Socle.champsDe(affectationEnCours.affectation).includes(champFormulaire),
  );
  return dansChamp || (enCours[0] ? { ...enCours[0], horsChamp: true } : null);
}
// Calcule le périmètre porté par le créneau retenu (celui de la fiche s'il est hors champ ou absent)
function calculerPerimetreCreneau(creneauRetenu) {
  let perimetreAffectation = etatSaisie.perimetreFiche;
  if (creneauRetenu && !creneauRetenu.horsChamp) {
    try {
      perimetreAffectation = String(creneauRetenu.affectation.perimetre || "").trim()
        ? JSON.parse(creneauRetenu.affectation.perimetre)
        : {};
    } catch (_) {
      perimetreAffectation = {};
    }
  }
  return perimetreAffectation;
}
// Calcule la signature (affectation, périmètre) qui sert à détecter un changement de créneau
function signatureCreneau(creneau, perimetreBrut) {
  return JSON.stringify([creneau && creneau.affectation.id, perimetreBrut]);
}
// Redessine le bandeau de périmètre, et la liste des dossiers si le créneau ou le périmètre a changé
function afficherChangementCreneau(redessiner, avant, creneauRetenu) {
  if (redessiner && avant !== signatureCreneau(creneauRetenu, etatSaisie.perimetreBrut)) {
    afficherBandeauPerimetre();
    majListeDossiers();
  } else if (redessiner) afficherBandeauPerimetre();
}
async function majCreneau(redessiner) {
  if (etatSaisie.agentPage == null) {
    etatSaisie.creneauPage = null;
    return;
  }
  const planning = await lirePlanningCreneau();
  const creneauRetenu = choisirCreneauAgent(planning);
  const avant = signatureCreneau(etatSaisie.creneauPage, etatSaisie.perimetreBrut);
  const perimetreAffectation = calculerPerimetreCreneau(creneauRetenu);
  etatSaisie.creneauPage = creneauRetenu;
  etatSaisie.perimetreBrut = perimetreAffectation;
  await lireEmargementAgent();
  afficherChangementCreneau(redessiner, avant, creneauRetenu);
}
setInterval(() => {
  if (!document.hidden && etatSaisie.agentPage != null) majCreneau(true).catch(() => {});
}, 60000);
async function lireEmargementAgent() {
  if (etatSaisie.agentPage == null) {
    etatSaisie.emargementsDispo = false;
    etatSaisie.emargementOuvert = null;
    return;
  }
  let emargements = null;
  try {
    emargements = await window.Socle.lireEmargements(etatSaisie.socleGeneral);
  } catch (_) {
    emargements = null;
  }
  etatSaisie.emargementsDispo = emargements !== null;
  etatSaisie.emargementOuvert =
    (emargements || [])
      .filter((emargement) => emargement.agent === etatSaisie.agentPage && emargement.debut && !emargement.fin)
      .pop() || null;
}
function htmlEmargement() {
  if (!etatSaisie.emargementsDispo || etatSaisie.agentPage == null || etatSaisie.modeEtab) return "";
  const depuis = etatSaisie.emargementOuvert ? (Date.now() / 1000 - etatSaisie.emargementOuvert.debut) / 3600 : 0;
  return (
    ` <span class="emargement${etatSaisie.emargementOuvert ? " en-service" : ""}">` +
    (etatSaisie.emargementOuvert
      ? `en service depuis ${heureCourte(etatSaisie.emargementOuvert.debut)}${depuis > 14 ? " (oubli de fin de service ?)" : ""} <button type="button" class="lien" id="btn-service">Je termine mon service</button>`
      : `<button type="button" class="lien" id="btn-service">Je prends mon service</button>`) +
    (etatSaisie.erreurEmargement ? ` <span class="err-emargement">${esc(etatSaisie.erreurEmargement)}</span>` : "") +
    `</span>`
  );
}
// Écrit l'émargement : fin de service si un émargement est ouvert, sinon prise de service
async function ecrireEmargement(nomTableEmargements, maintenant) {
  if (etatSaisie.emargementOuvert)
    await Donnees.ecrire([["UpdateRecord", nomTableEmargements, etatSaisie.emargementOuvert.id, { Fin: maintenant }]]);
  else
    await Donnees.ecrire([
      [
        "AddRecord",
        nomTableEmargements,
        null,
        {
          Agent: etatSaisie.agentPage,
          Creneau: (etatSaisie.creneauPage && etatSaisie.creneauPage.creneau.id) || 0,
          Debut: maintenant,
        },
      ],
    ]);
}
// Compose le message d'erreur d'émargement affiché à l'agent
function messageErreurEmargement(erreur) {
  return /ACL|access|accès|denied|refus/i.test(String((erreur && erreur.message) || erreur))
    ? `émargement refusé : seul ${etatSaisie.libellePage || "l'agent de cette page"} peut émarger ici, avec son propre compte`
    : `émargement impossible (${erreur.message || erreur})`;
}
async function basculerService() {
  const nomTableEmargements = window.Socle.general(etatSaisie.socleConfig).emargements || "Emargements",
    maintenant = Date.now() / 1000;
  etatSaisie.erreurEmargement = "";
  try {
    await ecrireEmargement(nomTableEmargements, maintenant);
  } catch (erreur) {
    etatSaisie.erreurEmargement = messageErreurEmargement(erreur);
  }
  await lireEmargementAgent();
  afficherBandeauPerimetre();
}
const heureCourte = (sec) => {
  const parties = Outils.dates.parties(sec);
  return `${parties.heures} h${parties.minutes ? ` ${String(parties.minutes).padStart(2, "0")}` : ""}`;
};
function texteCreneau() {
  if (etatSaisie.agentPage == null) return "";
  if (!etatSaisie.creneauPage) return "hors créneau";
  const creneau = etatSaisie.creneauPage.creneau,
    affectation = etatSaisie.creneauPage.affectation;
  return (
    `${creneau.nom} ${heureCourte(creneau.debut)}–${heureCourte(creneau.fin)}${affectation.fonction ? `, ${affectation.fonction.toLowerCase()}` : ""}` +
    (etatSaisie.creneauPage.horsChamp
      ? ` ${window.Socle.champsDe(affectation).join(" et ")} (pas ${champWidget()} sur ce créneau)`
      : "")
  );
}
function perimetre() {
  if (etatSaisie.modeEtab || !etatSaisie.perimetreBrut) return {};
  const perimetreBrut = Array.isArray(etatSaisie.perimetreBrut)
    ? etatSaisie.perimetreBrut.length
      ? { [colonnesEtab.academie]: etatSaisie.perimetreBrut }
      : {}
    : etatSaisie.perimetreBrut;
  return Object.fromEntries(
    Object.entries(perimetreBrut || {}).filter(
      ([colonne, valeurs]) =>
        Array.isArray(valeurs) && valeurs.length && (!etatSaisie.etabs.length || etatSaisie.colsEtab.includes(colonne)),
    ),
  );
}
const perimetreActif = () => !etatSaisie.voirToutPerimetre && Object.keys(perimetre()).length > 0;
function dansPerimetre(etablissement) {
  if (!etablissement) return true; // établissement inconnu du référentiel : jamais masqué
  for (const [colonne, valeursAutorisees] of Object.entries(perimetre())) {
    const valeurEtablissement = etablissement[colonne];
    if (
      !valeursAutorisees.some(
        (valeurAutorisee) =>
          sansAccents(String(valeurAutorisee)) === sansAccents(String(valeurEtablissement ?? "").trim()),
      )
    )
      return false;
  }
  return true;
}
const resumePerimetre = () =>
  Object.values(perimetre())
    .map((valeurs) => valeurs.join(", "))
    .join(" – ");
function afficherBandeauPerimetre() {
  const bandeau = $("bandeau-perimetre");
  if (!bandeau) return;
  const resume = resumePerimetre();
  if (etatSaisie.modeEtab || (!resume && !etatSaisie.libellePage)) {
    bandeau.hidden = true;
    return;
  }
  bandeau.hidden = false;
  const creneauTexte = texteCreneau(),
    propre =
      etatSaisie.creneauPage &&
      !etatSaisie.creneauPage.horsChamp &&
      String(etatSaisie.creneauPage.affectation.perimetre || "").trim();
  bandeau.innerHTML =
    [
      etatSaisie.libellePage ? `<strong>${esc(etatSaisie.libellePage)}</strong>` : "",
      creneauTexte ? esc(creneauTexte) : "",
      resume
        ? `${propre ? "périmètre du créneau" : "périmètre"} : ${esc(resume)}`
        : etatSaisie.agentPage != null
          ? "tous les établissements"
          : "",
    ]
      .filter(Boolean)
      .join(" · ") +
    (resume
      ? ` <button type="button" class="lien" id="btn-voir-tout">${etatSaisie.voirToutPerimetre ? "Revenir à mon périmètre" : "Voir tous les signalements"}</button>`
      : "");
  bandeau.insertAdjacentHTML("beforeend", htmlEmargement());
  const boutonVoirTout = $("btn-voir-tout");
  if (boutonVoirTout)
    boutonVoirTout.addEventListener("click", () => {
      etatSaisie.voirToutPerimetre = !etatSaisie.voirToutPerimetre;
      afficherBandeauPerimetre();
      majListeDossiers();
    });
  const boutonService = $("btn-service");
  if (boutonService) boutonService.addEventListener("click", basculerService);
}
const etabDe = (id) => etatSaisie.indexEtabs.get(id) || null;
const cleTexteEtab = (texteEtablissement) =>
  sansAccents(texteEtablissement)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
function etabParTexte(texteEtablissement) {
  if (etatSaisie.etabsIndexTexte !== etatSaisie.etabs) {
    etatSaisie.etabsIndexTexte = etatSaisie.etabs;
    etatSaisie.indexTexteEtabs = new Map();
    for (const etablissement of etatSaisie.etabs)
      for (const colonne of [colonnesEtab.uai, colonnesEtab.nom]) {
        const k = colonne && cleTexteEtab(etablissement[colonne]);
        if (k && !etatSaisie.indexTexteEtabs.has(k)) etatSaisie.indexTexteEtabs.set(k, etablissement);
      }
  }
  return etatSaisie.indexTexteEtabs.get(cleTexteEtab(texteEtablissement)) || null;
}
function trouverColNomReponses() {
  const colonneEtablissement = colonneDe("Etablissement");
  etatSaisie.colNomReponses = null;
  if (!colonneEtablissement) return;
  const cands = Object.values(etatSaisie.metaSig)
    .map((colonne) => ({
      c: colonne,
      m: String(colonne.texteFormule || "")
        .trim()
        .replace(/^return\s+/, "")
        .match(/^\$(\w+)\.(\w+)$/),
    }))
    .filter(
      (candidate) =>
        candidate.c.formule &&
        candidate.m &&
        candidate.m[1] === colonneEtablissement &&
        !/^(Ref|RefList|Bool|Int|Numeric|Date)/.test(candidate.c.type || ""),
    );
  const score = (candidate) =>
    (candidate.m[2] === colonnesEtab.nom ? 4 : 0) +
    (/^(nom|appellation|denomination|libelle|etablissement)/.test(normColonne(candidate.m[2])) ? 2 : 0) +
    (/^(nom|etablissement)/.test(normColonne(`${candidate.c.colId}`)) ? 1 : 0) -
    (/uai|commune|academ|depart|type|mail|lien|uuid|region/.test(normColonne(candidate.m[2])) ? 5 : 0);
  const meilleur = cands.sort((a, b) => score(b) - score(a))[0];
  if (meilleur && score(meilleur) > 0) etatSaisie.colNomReponses = meilleur.c.colId;
}
const texteEtabBrut = (ligne) => {
  const nomReponse = etatSaisie.colNomReponses && ligne ? ligne[etatSaisie.colNomReponses] : null;
  if (typeof nomReponse === "string" && nomReponse.trim()) return nomReponse.trim();
  const valeur = valeurLigne(ligne, "Etablissement");
  return typeof valeur === "string" && valeur.trim() ? valeur.trim() : "";
};
const etabDeLigne = (ligne) => {
  const valeur = valeurLigne(ligne, "Etablissement"),
    id = refId(valeur);
  return id ? etabDe(id) : typeof valeur === "string" ? etabParTexte(valeur) : null;
};
// nom affiché d'un signalement : établissement du référentiel, sinon le texte saisi dans la cellule
const nomEtabLigne = (ligne) => (etabDeLigne(ligne) || {})[colonnesEtab.nom] || texteEtabBrut(ligne);
