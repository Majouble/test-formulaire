/* PRISME — widget de saisie, module 06/34 : Liaison avec Grist (colonnes, réception des lignes) et lecture de la configuration.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : COLONNES, enFile, OPTIONS, idsCreesIci, ACTIVITE, traiterEnvoi, lireMeta, metaDeSecours, idColonne,
     colonneEnvoiPj, completerPjCopie, metaColonnes, sansGuillemets, lireCondition, lireBorne, lireRepereTableau,
     avecRegles, defsDe, mesurerArriveeEnvoi, decisionLigneCliquee, afficherSaisieEnCours, afficherDossierOuvert,
     brancherGrist.
   Utilise :
     03 variantes : statut.
     05 etat : etatSaisie, idDossierDe.
     07 formulaires : chargerConfiguration, signalerErreurChargement.
     09 dossier : ouvrirDossier, rafraichir.
     10 champs : typeBase.
     15 onglets : preparerNouveauSignalement.
     34 parcours : cacherConfirmation, montrerVue.
   Modifie etatSaisie : curseurInitialVu, dernierCurseur, enregistrements, envoiEnAttente, file, idsNouveaux,
     idsPrecedents, mappings, metaCopie, promesseMeta, signatureMappings. */
/* =========================================================
   Grist
   ========================================================= */
const COLONNES = [
  {
    name: "Clos",
    title: "Clos (signalement terminé)",
    type: "Bool",
    optional: true,
    description:
      "Case cochée sur la dernière étape quand la situation est terminée (« Autres actions › Clore le signalement »).",
  },
  { name: "Etablissement", title: "Établissement (référence)", type: "Ref", optional: true },
  { name: "Description", title: "Description du signalement", type: "Text", optional: true },
  { name: "Qualification", title: "Qualification", type: "Choice,ChoiceList,Text", optional: true },
  { name: "Date", title: "Date de la version", type: "DateTime,Date", optional: true },
  {
    name: "Date_faits",
    title: "Date des faits",
    type: "Date,DateTime",
    optional: true,
    description:
      "Jour des faits signalés (aujourd'hui par défaut). Sert au décompte des jours de mobilisation et au classement dans le point de situation.",
  },
  { name: "Dossier", title: "Dossier (référence vers cette même table)", type: "Ref", optional: true },
  { name: "Nature", title: "Nature (Nouveau signalement / Mise à jour)", type: "Choice,Text", optional: true },
  { name: "Commentaire", title: "Commentaire de suivi", type: "Text", optional: true },
  {
    name: "Site",
    title: "Site / bâtiment",
    type: "Text",
    optional: true,
    description:
      "Saisi à la main dans le bloc Établissement. Sert aussi au repérage des doublons : même établissement, même site, même date des faits.",
  },
  { name: "Auteur", title: "Auteur (formule user.Email)", optional: true },
  {
    name: "Questions",
    title: "Questions supplémentaires",
    optional: true,
    allowMultiple: true,
    description: "Questions posées dans le signalement initial et reprises dans chaque suivi.",
  },
  {
    name: "Questions_dep",
    title: "Visa départemental",
    optional: true,
    allowMultiple: true,
    description: "Colonnes renseignées par l'échelon départemental (invisibles pour l'établissement).",
  },
  {
    name: "Questions_aca",
    title: "Visa académique",
    optional: true,
    allowMultiple: true,
    description: "Colonnes renseignées par l'échelon académique (invisibles pour l'établissement).",
  },
];

// Pas de onEditOptions ni d'options de widget : dans le Custom Widget Builder, ce bouton ouvre
// l'éditeur de code et les options du widget contiennent le code lui-même. Les réglages sont
// donc stockés dans la table Parametres (voir PARAMETRES).

etatSaisie.file = Promise.resolve();
// une erreur pendant le chargement (référentiel pas encore prêt) est affichée ; ensuite, seulement dans la console
const enFile = (traitement) => {
  etatSaisie.file = etatSaisie.file.then(traitement).catch((erreur) => {
    console.warn(erreur);
    if (typeof etatSaisie.referentielLu !== "undefined" && !etatSaisie.referentielLu)
      signalerErreurChargement(erreur, "traitement");
  });
  return etatSaisie.file;
};

const OPTIONS = { keepEncoded: true, expandRefs: false, includeColumns: "normal" };

const idsCreesIci = new Set(); // lignes créées par ce widget-ci
/* Mesure de l'activité (⚙ › « Activité du widget ») : envois de Grist, temps de traitement, lectures.
   Sert à savoir si une lenteur vient du widget ou de Grist. */
const ACTIVITE = {
  debut: Date.now(),
  envois: [],
  regroupes: 0,
  curseur: 0,
  curseurIgnores: 0,
  longues: 0,
  dureeLongues: 0,
};
// lectures du document : comptées par Donnees (Donnees.compteurs())
(() => {
  try {
    new PerformanceObserver((liste) => {
      for (const entree of liste.getEntries()) {
        ACTIVITE.longues++;
        ACTIVITE.dureeLongues += entree.duration;
      }
    }).observe({ type: "longtask", buffered: true });
  } catch (_) {
    // mesure des tâches longues indisponible dans ce navigateur
  }
})();
async function traiterEnvoi(recs, associations) {
  etatSaisie.mappings = associations;
  etatSaisie.enregistrements = recs || [];
  const ids = new Set(etatSaisie.enregistrements.map((enregistrement) => enregistrement.id));
  etatSaisie.idsNouveaux = etatSaisie.idsPrecedents
    ? new Set([...ids].filter((i) => !etatSaisie.idsPrecedents.has(i)))
    : new Set();
  etatSaisie.idsPrecedents = ids;
  const sig = JSON.stringify(associations);
  if (sig !== etatSaisie.signatureMappings) {
    etatSaisie.signatureMappings = sig;
    await chargerConfiguration();
  }
  await rafraichir();
}

/* =========================================================
   Configuration : lue une fois, relue si les associations changent
   ========================================================= */
function lireMeta() {
  if (!etatSaisie.promesseMeta)
    etatSaisie.promesseMeta = Promise.all([Donnees.lire("_grist_Tables"), Donnees.lire("_grist_Tables_column")]).catch(
      async (erreur) => {
        const metaSecours = await metaDeSecours();
        if (!metaSecours) throw erreur;
        return metaSecours;
      },
    );
  return etatSaisie.promesseMeta;
}
async function metaDeSecours() {
  try {
    const tableConfig = await Donnees.lire("Config"),
      i = (tableConfig.Cle || []).indexOf("schema");
    const sch = i >= 0 && tableConfig.Valeur[i] ? JSON.parse(tableConfig.Valeur[i]) : null;
    if (!sch || !sch.tables) return null;
    const tables = { id: [], tableId: [] },
      tableColonnes = {
        id: [],
        parentId: [],
        colId: [],
        label: [],
        type: [],
        widgetOptions: [],
        isFormula: [],
        formula: [],
        description: [],
        visibleCol: [],
        parentPos: [],
      };
    let compteurColonnes = 0;
    Object.entries(sch.tables).forEach(([tid, liste], k) => {
      tables.id.push(k + 1);
      tables.tableId.push(tid);
      const base = compteurColonnes;
      liste.forEach((colonne, j) => {
        compteurColonnes++;
        tableColonnes.id.push(compteurColonnes);
        tableColonnes.parentId.push(k + 1);
        tableColonnes.colId.push(colonne.colId);
        tableColonnes.label.push(colonne.label || colonne.colId);
        tableColonnes.type.push(colonne.type || "Any");
        tableColonnes.widgetOptions.push(colonne.widgetOptions || "");
        tableColonnes.isFormula.push(!!colonne.isFormula);
        tableColonnes.formula.push(colonne.formula || "");
        tableColonnes.description.push(colonne.description || "");
        tableColonnes.parentPos.push(j + 1);
        tableColonnes.visibleCol.push(0);
      });
      liste.forEach((colonne, j) => {
        if (colonne.visibleCol) {
          const indexColonneAffichee = liste.findIndex((autreColonne) => autreColonne.colId === colonne.visibleCol);
          if (indexColonneAffichee >= 0) tableColonnes.visibleCol[base + j] = base + indexColonneAffichee + 1;
        }
      });
    });
    etatSaisie.metaCopie = true;
    return [tables, tableColonnes];
  } catch (_) {
    return null;
  }
}
// Pièces jointes et copie des colonnes (liens d'établissement) : si la copie date d'avant l'adaptation d'une question
// Pièces jointes, la colonne y figure encore comme simple colonne alors qu'elle est devenue une formule. Les colonnes
// réelles de la table disent si sa colonne d'envoi existe : le formulaire écrit alors dans celle-ci.
function idColonne(libelle) {
  // identifiant donné par l'administration à une colonne créée (voir admin/formulaires.js)
  let identifiant = String(libelle || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  if (/^\d/.test(identifiant)) identifiant = "Q_" + identifiant;
  return identifiant ? identifiant.charAt(0).toUpperCase() + identifiant.slice(1) : "";
}
function colonneEnvoiPj(metaColonne, colonnesTable) {
  const bas = (valeur) => String(valeur).toLowerCase(),
    autres = colonnesTable.filter((colonne) => colonne !== metaColonne.colId);
  const pref = bas(`${metaColonne.colId}_envoi`);
  const parPrefixe = autres.find((colonne) => bas(colonne).startsWith(pref));
  if (parPrefixe) return parPrefixe;
  const base = idColonne(`${metaColonne.libelle} (envoi)`);
  if (!base) return null;
  const motif = new RegExp(`^${base.replace(/[^A-Za-z0-9_]/g, "")}(_\\d+)?$`, "i");
  return autres.find((colonne) => motif.test(colonne) && bas(colonne) !== bas(metaColonne.colId)) || null;
}
async function completerPjCopie(tid, meta) {
  const colonnesPiecesJointes = Object.values(meta).filter(
    (metaColonne) => typeBase(metaColonne.type) === "Attachments" && !metaColonne.formule,
  );
  if (!colonnesPiecesJointes.length) return;
  let colonnesTable;
  try {
    colonnesTable = Object.keys((await Donnees.lire(tid)) || {});
  } catch (_) {
    return;
  }
  for (const metaColonne of colonnesPiecesJointes) {
    const envoi = colonneEnvoiPj(metaColonne, colonnesTable);
    if (!envoi) continue;
    metaColonne.formule = true;
    metaColonne.texteFormule = `for x in ($${envoi} or "").split():`;
    if (!meta[envoi])
      meta[envoi] = {
        colId: envoi,
        libelle: `${metaColonne.libelle} (envoi)`,
        type: "Text",
        opts: {},
        description: "",
        formule: false,
        texteFormule: "",
        colAffichee: null,
      };
  }
}
async function metaColonnes(tid) {
  const [tables, colonnesGrist] = await lireMeta();
  const tRef = tables.id[tables.tableId.indexOf(tid)];
  if (tRef == null) return null;
  const resultat = {};
  for (let i = 0; i < colonnesGrist.id.length; i++) {
    if (colonnesGrist.parentId[i] !== tRef) continue;
    let options = {};
    try {
      options = JSON.parse(colonnesGrist.widgetOptions[i] || "{}");
    } catch (_) {
      // options illisibles : valeurs par défaut
    }
    const visible = colonnesGrist.visibleCol ? colonnesGrist.visibleCol[i] : 0;
    resultat[colonnesGrist.colId[i]] = {
      colId: colonnesGrist.colId[i],
      libelle: colonnesGrist.label[i],
      type: colonnesGrist.type[i],
      opts: options,
      description: (colonnesGrist.description && colonnesGrist.description[i]) || "",
      formule: !!(colonnesGrist.isFormula && colonnesGrist.isFormula[i] && colonnesGrist.formula[i]),
      texteFormule: (colonnesGrist.formula && colonnesGrist.formula[i]) || "",
      colAffichee: visible ? colonnesGrist.colId[colonnesGrist.id.indexOf(visible)] : null,
    };
  }
  return resultat;
}

// La description de la colonne Grist porte les réglages de la question :
//   *                     la réponse est obligatoire
//   [si Autre_col = A, B] n'afficher que si Autre_col vaut A ou B
//   [si Autre_col != A]   n'afficher que si Autre_col ne vaut pas A
//   [si Autre_col]        n'afficher que si Autre_col est renseignée (ou [si Autre_col n'est pas vide]) ;
//                         [si Autre_col vide] (ou [si Autre_col est vide]) pour l'inverse
//   [liste] / [boutons]   forcer une liste déroulante ou des boutons pour un choix
//   [case]                oui / non : simple case à cocher au lieu des boutons Oui / Non
//   [positif]             nombre : pas de valeur négative ; [min 1] / [max 500] pour d'autres bornes
//   [tableau Table]       colonne texte : saisie en plusieurs lignes, champs = colonnes de la table Table
//   [ordre 1]             champ d'une table de tableau : position dans chaque ligne (1 = en haut)
//   [auto]                champ texte d'une table de tableau : rempli automatiquement à partir des autres champs
//                         de la ligne (mêmes réglages que la description automatique), modifiable
//   [masqué]              colonne d'une table de tableau absente du formulaire (valeur conservée dans la table)
//   [court]               texte sur une seule ligne (au lieu d'une zone de plusieurs lignes)
//   [confidentiel]        exclue de la description automatique (et, dans une table de tableau, de la colonne JSON)
//   [couleur]             le formulaire prend la couleur du choix sélectionné (couleurs des choix dans Grist) ;
//                         [couleur Blocage=rouge, Intrusion=#e4794a] pour imposer les couleurs ;
//                         [couleur >50=rouge, >10=orange] seuils ; [couleur renseigné=rouge] / [couleur vide=gris]
// Le reste du texte devient l'aide affichée sous la question.
// La colonne peut être désignée par son identifiant (Type_incident) ou par son libellé (Type d'incident).
// Opérateurs : = != ≠ > >= < <=, « vide », ou rien (= renseignée). Plusieurs valeurs séparées par des virgules.
// Guillemets droits, typographiques ou français autour d'une valeur : ignorés
const sansGuillemets = (valeur) =>
  String(valeur)
    .trim()
    .replace(/^["'«“‘\s]+|["'»”’\s]+$/g, "")
    .trim();
function lireCondition(texte) {
  const correspondanceSi = texte.match(/\[\s*si\s+([^\]]+)\]/i);
  if (!correspondanceSi) return null;
  const corps = correspondanceSi[1].trim();
  let correspondance;
  // « : » est accepté à la place de « = » quand aucun autre opérateur n'est présent
  if (
    (correspondance = corps.match(/^(.+?)\s*(!=|≠|>=|<=|=|>|<)\s*(.+)$/)) ||
    (correspondance = corps.match(/^([^:]+?)\s*(:)\s*(.+)$/))
  )
    return {
      ref: sansGuillemets(correspondance[1]),
      op: correspondance[2] === "≠" ? "!=" : correspondance[2] === ":" ? "=" : correspondance[2],
      brut: sansGuillemets(correspondance[3]), // valeur entière, pour un choix qui contient lui-même une virgule
      valeurs: correspondance[3]
        .split(/\s*,\s*/)
        .map(sansGuillemets)
        .filter(Boolean),
      texte: corps,
    };
  // « n'est pas vide », « non vide », « renseigné(e) » : la colonne doit être remplie
  if (
    (correspondance = corps.match(
      /^(.+?)\s+(?:n['’]est\s+pas\s+vide|non\s+vide|est\s+renseign[ée]e?|renseign[ée]e?)$/i,
    ))
  )
    return { ref: sansGuillemets(correspondance[1]), op: "rempli", texte: corps };
  if ((correspondance = corps.match(/^(.+?)\s+(?:est\s+)?vide$/i)))
    return { ref: sansGuillemets(correspondance[1]), op: "vide", texte: corps };
  return { ref: sansGuillemets(corps), op: "rempli", texte: corps };
}
// Bornes d'un nombre : [positif] (0 ou plus), [min 1], [max 500]
function lireBorne(descriptionColonne, mot) {
  const correspondance = descriptionColonne.match(
    new RegExp(`\\[\\s*${mot}(?:imum)?\\s*(-?\\d+(?:[.,]\\d+)?)\\s*\\]`, "i"),
  );
  return correspondance ? parseFloat(correspondance[1].replace(",", ".")) : null;
}
// [tableau Blesses] ou [tableau Blesses lignes=Nb de blessés] (colonne nombre qui fixe le nombre de lignes)
function lireRepereTableau(descriptionColonne) {
  const correspondance = descriptionColonne.match(/\[\s*tableau\s+([^\]\s]+)(?:\s+lignes?\s*[=:]\s*([^\]]+?))?\s*\]/i);
  return correspondance
    ? { table: correspondance[1], lignes: correspondance[2] ? sansGuillemets(correspondance[2]) : null }
    : null;
}
const avecRegles = (question) => {
  const descriptionColonne = (question.description || "").trim();
  const min = /\[\s*(positif|positive|non\s+n[ée]gatif)\s*\]/i.test(descriptionColonne)
    ? 0
    : lireBorne(descriptionColonne, "min");
  const forcer = /\[liste\]/i.test(descriptionColonne)
    ? "liste"
    : /\[boutons\]/i.test(descriptionColonne)
      ? "boutons"
      : null;
  return {
    ...question,
    obligatoire: descriptionColonne.startsWith("*"),
    condition: lireCondition(descriptionColonne),
    forcer,
    caseACocher: /\[case\]/i.test(descriptionColonne), // [case] : garder la simple case à cocher pour un booléen
    tableau: lireRepereTableau(descriptionColonne),
    confidentiel: /\[\s*confidentiel(le)?\s*\]/i.test(descriptionColonne),
    min,
    max: lireBorne(descriptionColonne, "max"),
    auto: /\[\s*auto(matique)?\s*\]/i.test(descriptionColonne),
    masque: /\[\s*(masqu[ée]e?|cach[ée]e?|invisible)\s*\]/i.test(descriptionColonne),
    ordre:
      (descriptionColonne.match(/\[\s*ordre\s*(\d+)\s*\]/i) || [])[1] != null
        ? +descriptionColonne.match(/\[\s*ordre\s*(\d+)\s*\]/i)[1]
        : null,
    court: !!question.court || /\[\s*(court|une\s+ligne)\s*\]/i.test(descriptionColonne),
    aide: descriptionColonne
      .replace(/^\*\s*/, "")
      .replace(/\[\s*ordre\s*\d+\s*\]/gi, "")
      .replace(/\[\s*auto(matique)?\s*\]/gi, "")
      .replace(/\[\s*(masqu[ée]e?|cach[ée]e?|invisible)\s*\]/gi, "")
      .replace(/\[\s*(court|une\s+ligne)\s*\]/gi, "")
      .replace(/\[\s*si\s+[^\]]+\]/gi, "")
      .replace(/\[(liste|boutons|case)\]/gi, "")
      .replace(/\[\s*(positif|positive|non\s+n[ée]gatif|min(?:imum)?\s*-?[\d.,]+|max(?:imum)?\s*-?[\d.,]+)\s*\]/gi, "")
      .replace(/\[\s*couleurs?\b[^\]]*\]/gi, "")
      .replace(/\[\s*tableau\s+[^\]]*\]/gi, "")
      .replace(/\[\s*confidentiel(le)?\s*\]/gi, "")
      .trim(),
  };
};
const defsDe = (cle) =>
  etatSaisie.mappings
    ? (etatSaisie.mappings[cle] || [])
        .map((colonne) => etatSaisie.metaSig[colonne])
        .filter(Boolean)
        .map(avecRegles)
    : [];

// Enregistre l'arrivée d'un envoi de lignes dans la mesure d'activité et renvoie son relevé
function mesurerArriveeEnvoi(recs) {
  const arrive = {
    t: Date.now(),
    lignes: (recs || []).length,
    colonnes: recs && recs[0] ? Object.keys(recs[0]).length : 0,
    ms: null,
  };
  ACTIVITE.envois.push(arrive);
  if (ACTIVITE.envois.length > 300) ACTIVITE.envois.shift();
  return arrive;
}
// Décide quoi faire de la ligne cliquée : dossier visé et action (ignorer, relire, saisie en cours, ouvrir)
function decisionLigneCliquee(rec) {
  const ligneCourante = etatSaisie.enregistrements.find((ligne) => ligne.id === rec.id) || rec;
  const idDossier = idDossierDe(ligneCourante);
  const renvoi = rec.id === etatSaisie.dernierCurseur;
  // même signalement : un simple renvoi (après une modification de la table) est déjà traité par onRecords,
  // qui rafraîchit le dossier ouvert ; seul un clic sur une autre ligne du même dossier le relit
  if (idDossier === etatSaisie.dossierId)
    return { idDossier, action: renvoi ? "ignorer-renvoi-meme-dossier" : "relire" };
  // Ligne tout juste créée par une autre vue : Grist a pu y décaler le curseur lors de l'insertion.
  const creeeAilleurs =
    (etatSaisie.idsNouveaux.has(rec.id) || !etatSaisie.enregistrements.some((ligne) => ligne.id === rec.id)) &&
    !idsCreesIci.has(rec.id);
  if (creeeAilleurs) return { idDossier, action: "ignorer" };
  if (renvoi) return { idDossier, action: "ignorer" }; // curseur inchangé, mais le widget affiche autre chose (nouveau signalement, menu)
  // Vrai déplacement du curseur : on ne l'applique pas si une saisie est en cours, pour ne rien perdre
  if (etatSaisie.modifie) return { idDossier, action: "saisie-en-cours" };
  return { idDossier, action: "ouvrir" };
}
// Affiche le message de saisie en cours non enregistrée
function afficherSaisieEnCours() {
  statut(
    "statut-signalement",
    "Saisie en cours non enregistrée : enregistrez-la ou cliquez sur « " +
      $("btn-effacer").textContent +
      " » avant d'ouvrir un autre signalement.",
    "err",
  );
}
// Après ouverture d'un autre signalement, masque la confirmation et passe à la vue de saisie
function afficherDossierOuvert(premiereSelection, idDossier) {
  if (!premiereSelection && etatSaisie.dossierId === idDossier) {
    cacherConfirmation();
    montrerVue("saisie");
  }
}
/* Branchement sur Grist : appelé par le dernier module (34-parcours.js), une fois TOUS les modules chargés.
   Grist peut envoyer les lignes dès ce branchement ; le navigateur traiterait alors cet envoi entre deux fichiers
   si le branchement était fait ici, avant que les modules suivants (visas, parcours…) soient définis. */
function brancherGrist() {
  grist.ready({ requiredAccess: "full", columns: COLONNES });
  grist.onRecords((recs, mappingsRecus) => {
    const arrive = mesurerArriveeEnvoi(recs);
    const dejaPrevu = !!etatSaisie.envoiEnAttente;
    etatSaisie.envoiEnAttente = { recs, m: mappingsRecus, arrive };
    if (dejaPrevu) {
      ACTIVITE.regroupes++;
      return;
    }
    return enFile(async () => {
      const { recs, m: mappingsRecus, arrive } = etatSaisie.envoiEnAttente;
      etatSaisie.envoiEnAttente = null;
      const debutTraitement = performance.now();
      try {
        await traiterEnvoi(recs, mappingsRecus);
      } finally {
        arrive.ms = performance.now() - debutTraitement;
      }
    });
  }, OPTIONS);
  grist.onRecord(
    (rec) =>
      enFile(async () => {
        ACTIVITE.curseur++;
        if (!rec || (!etatSaisie.mappings && !Object.keys(etatSaisie.colsParDefaut).length)) return;
        const premiereSelection = !etatSaisie.curseurInitialVu;
        etatSaisie.curseurInitialVu = true;
        const { idDossier, action } = decisionLigneCliquee(rec);
        etatSaisie.dernierCurseur = rec.id;
        if (action === "ignorer-renvoi-meme-dossier") {
          ACTIVITE.curseurIgnores++;
          return;
        }
        if (action === "relire") {
          await ouvrirDossier(idDossier);
          return;
        }
        if (action === "ignorer") return;
        if (action === "saisie-en-cours") {
          afficherSaisieEnCours();
          return;
        }
        await ouvrirDossier(idDossier);
        afficherDossierOuvert(premiereSelection, idDossier);
      }),
    OPTIONS,
  );
  grist.onNewRecord(() =>
    enFile(async () => {
      const renvoi = etatSaisie.dernierCurseur === "new";
      etatSaisie.dernierCurseur = "new";
      if (!etatSaisie.dossierId) return; // déjà sur un nouveau signalement : rien à réinitialiser
      if (renvoi || etatSaisie.modifie) return; // simple renvoi, ou saisie en cours à préserver
      await preparerNouveauSignalement();
    }),
  );
}
