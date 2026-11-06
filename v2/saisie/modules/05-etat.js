/* PRISME — widget de saisie, module 05/31 : État du widget et périmètre de la page (agent, académies, départements).
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
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

  // ---------- module 13 : Établissement : identification, mail et lien d'accès
  ligneAnnuaire: null, // sans objet dans la version ESR (pas de recherche dans les annuaires en ligne)
  sectionGardee: null,
  sectionCalculee: { id: null, r: null },
  /* Composante (IUT, INSPÉ, école interne…) ou site / campus du référentiel de l'enseignement supérieur (colonne
  Rattachement) : le dossier s'ouvre sur l'établissement de rattachement, pour que l'établissement ne soit pas compté
  deux fois ; la composante est rappelée, reprise dans la question « site » et ses sites sont proposés en premier. */
  composanteChoisie: null,

  // ---------- module 14 : Onglets, affichage du dossier, en-tête
  dateFaitsTouchee: false, // la date a-t-elle été changée à la main depuis l'ouverture du formulaire ?

  // ---------- module 15 : Description automatique, résumé des modifications, jour de mobilisation, doublons
  ligneParametres: null,
  colsParametres: [],
  optionsAuto: null, // posée par le module 15
  /* ---------- Description rédigée à partir des réponses ---------- */
  // Tant que l'utilisateur n'a pas modifié la description à la main, elle suit les réponses.
  // Dès qu'il la modifie, elle n'est plus réécrite ; le bouton « Régénérer » la recalcule à la demande.
  descriptionManuelle: false,
  /* ---------- Repérage des doublons ----------
  À la création, si l'établissement a déjà un signalement (un dossier) dont une version porte sur le même
  jour des faits, le formulaire le signale et propose de l'ouvrir pour le mettre à jour plutôt que d'en créer
  un second. La création reste possible après confirmation explicite. */
  doublonConfirme: null, // clé « établissement|jour » confirmée par l'utilisateur

  // ---------- module 16 : Réglages du formulaire (table Parametres) : bornes des nombres, options, panneau ⚙
  optionsParametres: null,

  // ---------- module 17 : Menu et recherche des signalements
  // Menu des signalements, dessiné par le widget. Il rend la sélection possible sans « Sélectionner par » :
  // un widget lié est recouvert par Grist dès qu'aucune ligne n'est sélectionnée, ce qui empêcherait
  // toute création quand la vue est vide ou filtrée.
  dossiersInit: [],
  /* ---------- Barre de recherche des signalements ----------
  Cherche dans tous les dossiers visibles : établissement, commune, UAI, académie, n° de dossier, et le texte
  de la version initiale comme de la dernière version. Tous les mots tapés doivent être présents (sans accents). */
  indexRecherche: null,

  // ---------- module 20 : Couleur du formulaire selon une réponse
  reglesCouleur: [],

  // ---------- module 21 : Filtre des signalements et navigation d'une fiche à l'autre
  // Plusieurs filtres, combinés par ET ; dans un même filtre, plusieurs valeurs combinées par OU.
  // Chaque filtre : { colonne, valeurs: [clés], libelles: { clé: texte }, contient: "" }
  filtres: [],
  listeChampsFiltre: [],
  posNav: null,
  cacheDernieres: null,
  filtreOuvert: null,
  minuterieContient: null,

  // ---------- module 23 : Formulaire par site (enseignement supérieur)
  /* « Une ligne par site connu » : nouveau dossier d'un établissement déjà signalé, le tableau des sites se remplit seul
  du dernier état connu de chaque site (sites revenus à la normale compris, sauf réglage contraire). Reprise
  réglable (reglages.tableau.sites.reprise) : "auto", "bouton" (proposée par un bouton), "non" (désactivée, par défaut :
  le tableau part vide, rien n'est proposé ; une reprise d'un signalement précédent ne reprend pas les sites). Refait si
  l'établissement change tant qu'aucune ligne n'a été touchée. */
  sitesAutoPour: null,
  qualifTouchee: false,

  // ---------- module 25 : Signalement : création, puis mise à jour par nouvelle version
  // Le formulaire reflète toujours l'état courant, c'est-à-dire la dernière version enregistrée.
  versionAffichee: null, // copie de la version sur laquelle l'agent travaille

  // ---------- module 27 : Visas départementaux et académiques
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

  // ---------- module 28 : Recherche d'établissement (autocomplétion)
  resultats: [],
  index: -1,
  minuterie: null,
  requete: 0,

  // ---------- module 30 : Corriger l'établissement d'un signalement
  reaffectation: false,
  etabPropose: null,
  dossierCorrection: undefined,
  // ---------- Fiche de l'établissement
  champsFiche: [], // [cle (rôle ou colonne), libellé, colonne]

  // ---------- module 31 : Parcours : accueil, vue de saisie, bandeaux, démarrage du widget
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
const col = (cle) =>
  etatSaisie.mappings && typeof etatSaisie.mappings[cle] === "string"
    ? etatSaisie.mappings[cle]
    : etatSaisie.colsParDefaut[cle] || null;
const val = (ligne, cle) => (ligne && col(cle) ? ligne[col(cle)] : null);
// Champ de ce formulaire (EN, ESR) : un agent mobilisé sur l'autre champ pendant le créneau en est averti
const champWidget = () => {
  try {
    return (window.Socle.CHAMPS.find((c) => c.version === S().version) || {}).id || "";
  } catch (_) {
    return "";
  }
};
async function majCreneau(redessiner) {
  if (etatSaisie.agentPage == null) {
    etatSaisie.creneauPage = null;
    return;
  }
  let pl = null;
  try {
    pl = await window.Socle.lirePlanning(etatSaisie.socleGeneral);
  } catch (_) {
    pl = null;
  }
  const enCours = window.Socle.affectationsEnCours(pl, etatSaisie.agentPage),
    ch = champWidget();
  // de préférence une affectation qui couvre le champ de ce formulaire
  const dansChamp = enCours.find((e) => !ch || window.Socle.champsDe(e.affectation).includes(ch));
  const x = dansChamp || (enCours[0] ? { ...enCours[0], horsChamp: true } : null);
  const avant = JSON.stringify([
    etatSaisie.creneauPage && etatSaisie.creneauPage.affectation.id,
    etatSaisie.perimetreBrut,
  ]);
  let p = etatSaisie.perimetreFiche;
  if (x && !x.horsChamp) {
    try {
      p = String(x.affectation.perimetre || "").trim() ? JSON.parse(x.affectation.perimetre) : {};
    } catch (_) {
      p = {};
    }
  }
  etatSaisie.creneauPage = x;
  etatSaisie.perimetreBrut = p;
  await lireEmargementAgent();
  if (redessiner && avant !== JSON.stringify([x && x.affectation.id, etatSaisie.perimetreBrut])) {
    afficherBandeauPerimetre();
    majListeDossiers();
  } else if (redessiner) afficherBandeauPerimetre();
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
  let l = null;
  try {
    l = await window.Socle.lireEmargements(etatSaisie.socleGeneral);
  } catch (_) {
    l = null;
  }
  etatSaisie.emargementsDispo = l !== null;
  etatSaisie.emargementOuvert =
    (l || []).filter((e) => e.agent === etatSaisie.agentPage && e.debut && !e.fin).pop() || null;
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
async function basculerService() {
  const t = window.Socle.general(etatSaisie.socleConfig).emargements || "Emargements",
    maintenant = Date.now() / 1000;
  etatSaisie.erreurEmargement = "";
  try {
    if (etatSaisie.emargementOuvert)
      await Donnees.ecrire([["UpdateRecord", t, etatSaisie.emargementOuvert.id, { Fin: maintenant }]]);
    else
      await Donnees.ecrire([
        [
          "AddRecord",
          t,
          null,
          {
            Agent: etatSaisie.agentPage,
            Creneau: (etatSaisie.creneauPage && etatSaisie.creneauPage.creneau.id) || 0,
            Debut: maintenant,
          },
        ],
      ]);
  } catch (e) {
    etatSaisie.erreurEmargement = /ACL|access|accès|denied|refus/i.test(String((e && e.message) || e))
      ? `émargement refusé : seul ${etatSaisie.libellePage || "l'agent de cette page"} peut émarger ici, avec son propre compte`
      : `émargement impossible (${e.message || e})`;
  }
  await lireEmargementAgent();
  afficherBandeauPerimetre();
}
const heureCourte = (sec) => {
  const p = Outils.dates.parties(sec);
  return `${p.heures} h${p.minutes ? ` ${String(p.minutes).padStart(2, "0")}` : ""}`;
};
function texteCreneau() {
  if (etatSaisie.agentPage == null) return "";
  if (!etatSaisie.creneauPage) return "hors créneau";
  const c = etatSaisie.creneauPage.creneau,
    a = etatSaisie.creneauPage.affectation;
  return (
    `${c.nom} ${heureCourte(c.debut)}–${heureCourte(c.fin)}${a.fonction ? `, ${a.fonction.toLowerCase()}` : ""}` +
    (etatSaisie.creneauPage.horsChamp
      ? ` ${window.Socle.champsDe(a).join(" et ")} (pas ${champWidget()} sur ce créneau)`
      : "")
  );
}
function perimetre() {
  if (etatSaisie.modeEtab || !etatSaisie.perimetreBrut) return {};
  const p = Array.isArray(etatSaisie.perimetreBrut)
    ? etatSaisie.perimetreBrut.length
      ? { [E.academie]: etatSaisie.perimetreBrut }
      : {}
    : etatSaisie.perimetreBrut;
  return Object.fromEntries(
    Object.entries(p || {}).filter(
      ([c, v]) => Array.isArray(v) && v.length && (!etatSaisie.etabs.length || etatSaisie.colsEtab.includes(c)),
    ),
  );
}
const perimetreActif = () => !etatSaisie.voirToutPerimetre && Object.keys(perimetre()).length > 0;
function dansPerimetre(e) {
  if (!e) return true; // établissement inconnu du référentiel : jamais masqué
  for (const [c, vals] of Object.entries(perimetre())) {
    const v = e[c];
    if (!vals.some((x) => sansAccent(String(x)) === sansAccent(String(v ?? "").trim()))) return false;
  }
  return true;
}
const resumePerimetre = () =>
  Object.values(perimetre())
    .map((v) => v.join(", "))
    .join(" – ");
function afficherBandeauPerimetre() {
  const b = $("bandeau-perimetre");
  if (!b) return;
  const r = resumePerimetre();
  if (etatSaisie.modeEtab || (!r && !etatSaisie.libellePage)) {
    b.hidden = true;
    return;
  }
  b.hidden = false;
  const cr = texteCreneau(),
    propre =
      etatSaisie.creneauPage &&
      !etatSaisie.creneauPage.horsChamp &&
      String(etatSaisie.creneauPage.affectation.perimetre || "").trim();
  b.innerHTML =
    [
      etatSaisie.libellePage ? `<strong>${esc(etatSaisie.libellePage)}</strong>` : "",
      cr ? esc(cr) : "",
      r
        ? `${propre ? "périmètre du créneau" : "périmètre"} : ${esc(r)}`
        : etatSaisie.agentPage != null
          ? "tous les établissements"
          : "",
    ]
      .filter(Boolean)
      .join(" · ") +
    (r
      ? ` <button type="button" class="lien" id="btn-voir-tout">${etatSaisie.voirToutPerimetre ? "Revenir à mon périmètre" : "Voir tous les signalements"}</button>`
      : "");
  b.insertAdjacentHTML("beforeend", htmlEmargement());
  const btn = $("btn-voir-tout");
  if (btn)
    btn.addEventListener("click", () => {
      etatSaisie.voirToutPerimetre = !etatSaisie.voirToutPerimetre;
      afficherBandeauPerimetre();
      majListeDossiers();
    });
  const bs = $("btn-service");
  if (bs) bs.addEventListener("click", basculerService);
}
const etabDe = (id) => etatSaisie.indexEtabs.get(id) || null;
const cleTexteEtab = (t) =>
  String(t ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
function etabParTexte(t) {
  if (etatSaisie.etabsIndexTexte !== etatSaisie.etabs) {
    etatSaisie.etabsIndexTexte = etatSaisie.etabs;
    etatSaisie.indexTexteEtabs = new Map();
    for (const e of etatSaisie.etabs)
      for (const c of [E.uai, E.nom]) {
        const k = c && cleTexteEtab(e[c]);
        if (k && !etatSaisie.indexTexteEtabs.has(k)) etatSaisie.indexTexteEtabs.set(k, e);
      }
  }
  return etatSaisie.indexTexteEtabs.get(cleTexteEtab(t)) || null;
}
function trouverColNomReponses() {
  const cE = col("Etablissement");
  etatSaisie.colNomReponses = null;
  if (!cE) return;
  const cands = Object.values(etatSaisie.metaSig)
    .map((c) => ({
      c,
      m: String(c.texteFormule || "")
        .trim()
        .replace(/^return\s+/, "")
        .match(/^\$(\w+)\.(\w+)$/),
    }))
    .filter((x) => x.c.formule && x.m && x.m[1] === cE && !/^(Ref|RefList|Bool|Int|Numeric|Date)/.test(x.c.type || ""));
  const score = (x) =>
    (x.m[2] === E.nom ? 4 : 0) +
    (/^(nom|appellation|denomination|libelle|etablissement)/.test(normColonne(x.m[2])) ? 2 : 0) +
    (/^(nom|etablissement)/.test(normColonne(`${x.c.colId}`)) ? 1 : 0) -
    (/uai|commune|academ|depart|type|mail|lien|uuid|region/.test(normColonne(x.m[2])) ? 5 : 0);
  const meilleur = cands.sort((a, b) => score(b) - score(a))[0];
  if (meilleur && score(meilleur) > 0) etatSaisie.colNomReponses = meilleur.c.colId;
}
const texteEtabBrut = (l) => {
  const n = etatSaisie.colNomReponses && l ? l[etatSaisie.colNomReponses] : null;
  if (typeof n === "string" && n.trim()) return n.trim();
  const v = val(l, "Etablissement");
  return typeof v === "string" && v.trim() ? v.trim() : "";
};
const etabDeLigne = (l) => {
  const v = val(l, "Etablissement"),
    id = refId(v);
  return id ? etabDe(id) : typeof v === "string" ? etabParTexte(v) : null;
};
// nom affiché d'un signalement : établissement du référentiel, sinon le texte saisi dans la cellule
const nomEtabLigne = (l) => (etabDeLigne(l) || {})[E.nom] || texteEtabBrut(l);
