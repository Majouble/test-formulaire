/* PRISME — widget de saisie, module 07/34 : Formulaires construits dans l'administration : socle, rôles des colonnes, questions.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : lireSocleSaisie, reglagesDansConfig, lireFormulaires, choisirFormulaire, reperesDepuisReglages,
     defDepuisBloc, PARTIES_DEFAUT, partiesDe, NOMS_VISA, appliquerNomsParties, defsDepuisFormulaire, decorHtml,
     verifierFormulairePublie, ROLES_SIGNALEMENT, celluleRemplie, reconnaitreColonnesSignalement, VERSION_WIDGET,
     remplirActivite, remplirDiagnostic, signalerErreurChargement, chargerConfiguration, chargerConfigurationEtapes,
     determinerTableEtab, alerteLiensEtab, majAlertePageEtab, finaliserReferentiel, apresChargementEtabs,
     cacheTables, lireTableSQL, lireTableRapide, lireTableReference, tableDepuisEnregistrements, libellesTable,
     resoudreRefsEtab, rafraichirEtabs.
   Utilise :
     01 configuration : CLE_TABLE_ETAB, ETAB, TABLE_ETAB_DEFAUT, afficherCommentaire.
     02 utilitaires : colonnesEtab, normColonne.
     03 variantes : appliquerVersion, colonneChampFiche, colonneRegion, refId, reglagesSaisie.
     04 date-faits : faitsAvecHeure.
     05 etat : colonneDe, etabDeLigne, etatSaisie, majCreneau, texteEtabBrut, trouverColNomReponses, valeurLigne.
     06 grist : ACTIVITE, avecRegles, completerPjCopie, defsDe, enFile, lireMeta, metaColonnes.
     08 referentiel-local : DUREE_CACHE_REFERENTIEL, chargerEtabs, oublierCacheReferentiel.
     09 dossier : afficherChoix, rafraichir.
     10 champs : rendreChamps, typeBase.
     12 conditions-formules : normaliser, resoudreColonne.
     13 coherence : appliquerConditions.
     14 etablissement : afficherEtablissement.
     15 onglets : afficherDossier, passerEnCreation.
     16 description : PARAMETRES, dateParGrist.
     17 reglages : appliquerBornes, appliquerOptions, chargerReglages.
     18 liste-dossiers : majListeDossiers.
     23 couleurs : construireReglesCouleur, majCouleur.
     24 filtres-navigation : restaurerFiltre.
     25 plusieurs-jours : aideFaitsDefaut.
     26 sites-esr : formulaireParSite, placerQualification.
     28 enregistrement : remplirFormulaire.
     30 visas : activerVerdictRapide, chargerProfil, chargerProfilViseur, lireVeille, majBandeauVeille.
   Modifie etatSaisie : TABLE_FORMULAIRES, agentPage, alerteHorloge, alerteTableRef, champsVersion, choix,
     colsParDefaut, couleurs, decorsQ, defsAca, defsDep, defsQuestions, dernierControleFormulaire, etabCourant,
     formulaireActif, formulairesDispo, indexRecherche, jetonSQL, libellePage, metaDate, metaFaits, metaSig,
     modifie, modifieVisa, pageEtab, perimetreBrut, perimetreFiche, promesseMeta, qualifMultiple, referentielLu,
     rolesAdmin, signatureFormulaire, socleConfig, socleGeneral, sqlRefuse, tableId, versionPage. */
/* =========================================================
   Formulaires construits dans le widget d'administration (table « Formulaires »)
   ---------------------------------------------------------
   Une ligne par formulaire : Nom, Table, Brouillon (JSON), Publie (JSON). Le widget de saisie lit la version
   publiée du formulaire choisi pour cette page (réglage ⚙, enregistré avec la page), sinon le premier formulaire
   publié pour sa table. Sans formulaire publié : fonctionnement d'origine (associations « Questions supplémentaires »
   et repères dans les descriptions de colonnes).
   Les réglages de chaque question sont traduits en repères ([si …], [couleur …], * …) : tout le moteur existant s'applique.
   ========================================================= */
etatSaisie.socleGeneral = { ...window.Socle.DEFAUTS_GENERAL };
async function lireSocleSaisie() {
  try {
    etatSaisie.socleConfig = await window.Socle.lireConfig();
  } catch (_) {
    etatSaisie.socleConfig = null;
  }
  etatSaisie.socleGeneral = window.Socle.general(etatSaisie.socleConfig);
  etatSaisie.TABLE_FORMULAIRES = etatSaisie.socleGeneral.formulaires || "Formulaires";
}
// Réglages communs du widget (description automatique, table du référentiel) : clé « resume_auto » de Config,
// sinon l'ancienne table Parametres (documents pas encore installés)
const reglagesDansConfig = () => !!etatSaisie.socleConfig;
async function lireFormulaires() {
  try {
    const tableFormulaires = await Donnees.lire(etatSaisie.TABLE_FORMULAIRES);
    return tableFormulaires.id.map((id, i) => ({
      id,
      nom: String(tableFormulaires.Nom ? (tableFormulaires.Nom[i] ?? "") : ""),
      table: String(tableFormulaires.Table ? (tableFormulaires.Table[i] ?? "") : ""),
      publie: tableFormulaires.Publie ? tableFormulaires.Publie[i] : null,
    }));
  } catch (_) {
    return [];
  }
}
async function choisirFormulaire() {
  etatSaisie.formulairesDispo = (await lireFormulaires()).filter(
    (formulaire) => formulaire.table === etatSaisie.tableId,
  );
  let voulu = null;
  try {
    voulu = grist.getOption ? await grist.getOption("formulaire") : null;
  } catch (_) {
    // option absente ou page ouverte hors de Grist : formulaire par défaut
  }
  try {
    etatSaisie.versionPage = grist.getOption ? await grist.getOption("version") : null;
  } catch (_) {
    etatSaisie.versionPage = null;
  }
  try {
    etatSaisie.perimetreBrut = grist.getOption ? await grist.getOption("perimetre") : null;
  } catch (_) {
    etatSaisie.perimetreBrut = null;
  }
  try {
    etatSaisie.libellePage = grist.getOption ? (await grist.getOption("libelle")) || "" : "";
  } catch (_) {
    etatSaisie.libellePage = "";
  }
  try {
    etatSaisie.agentPage = grist.getOption ? await grist.getOption("agent") : null;
  } catch (_) {
    etatSaisie.agentPage = null;
  }
  try {
    etatSaisie.pageEtab = grist.getOption ? (await grist.getOption("etablissements")) || null : null;
  } catch (_) {
    etatSaisie.pageEtab = null;
  }
  majAlertePageEtab();
  if (etatSaisie.agentPage != null && typeof etatSaisie.agentPage !== "number")
    etatSaisie.agentPage = Number(etatSaisie.agentPage) || null;
  etatSaisie.perimetreFiche = etatSaisie.perimetreBrut;
  const publies = etatSaisie.formulairesDispo.filter(
    (formulaire) => typeof formulaire.publie === "string" && formulaire.publie.trim(),
  );
  const formulaireRetenu = (voulu && publies.find((formulaire) => formulaire.nom === voulu)) || publies[0] || null;
  let configuration = null;
  if (formulaireRetenu) {
    try {
      configuration = JSON.parse(formulaireRetenu.publie);
    } catch (_) {
      configuration = null;
    }
  }
  etatSaisie.formulaireActif =
    formulaireRetenu && configuration && Array.isArray(configuration.blocs)
      ? { ...formulaireRetenu, conf: configuration }
      : null;
  etatSaisie.signatureFormulaire = formulaireRetenu ? `${formulaireRetenu.nom}|${formulaireRetenu.publie}` : "";
  await majCreneau(false);
  return etatSaisie.formulaireActif;
}
// Réglages d'une question → repères de description (même syntaxe que la saisie manuelle)
function reperesDepuisReglages(reglages) {
  const reperes = [];
  if (reglages.obligatoire) reperes.push("*");
  const condition = reglages.condition;
  if (condition && condition.ref) {
    const valeursCondition = (condition.valeurs || []).join(", ");
    if (condition.op === "rempli") reperes.push(`[si ${condition.ref} n'est pas vide]`);
    else if (condition.op === "vide") reperes.push(`[si ${condition.ref} est vide]`);
    else if (valeursCondition) reperes.push(`[si ${condition.ref} ${condition.op || "="} ${valeursCondition}]`);
  }
  if (reglages.affichage === "liste") reperes.push("[liste]");
  if (reglages.affichage === "boutons") reperes.push("[boutons]");
  if (reglages.affichage === "case") reperes.push("[case]");
  if (reglages.min != null && reglages.min !== "") reperes.push(`[min ${reglages.min}]`);
  if (reglages.max != null && reglages.max !== "") reperes.push(`[max ${reglages.max}]`);
  if (reglages.confidentiel) reperes.push("[confidentiel]");
  if (reglages.tableau && reglages.tableau.table)
    reperes.push(
      `[tableau ${reglages.tableau.table}${reglages.tableau.lignes ? " lignes=" + reglages.tableau.lignes : ""}]`,
    );
  if (reglages.couleur === "choix") reperes.push("[couleur]");
  else if (Array.isArray(reglages.couleur) && reglages.couleur.length)
    reperes.push(
      `[couleur ${reglages.couleur
        .filter((couleurChoix) => couleurChoix && couleurChoix.cle && couleurChoix.couleur)
        .map((couleurChoix) => `${couleurChoix.cle}=${couleurChoix.couleur}`)
        .join(", ")}]`,
    );
  if (reglages.aide) reperes.push(reglages.aide);
  return reperes.join(" ");
}
function defDepuisBloc(bloc) {
  const meta = etatSaisie.metaSig[bloc.colonne];
  if (!meta) return null;
  const reglages = bloc.reglages || {};
  const question = avecRegles({
    ...meta,
    libelle: reglages.libelle || meta.libelle,
    description: reperesDepuisReglages(reglages),
  });
  question.court = !!reglages.court;
  if (question.tableau && reglages.tableau && reglages.tableau.sites) question.tableau.sites = reglages.tableau.sites; // tableau des sites (formulaire par site)
  if (reglages.format && reglages.format !== "defaut") question.formatDescription = reglages.format;
  // pièces jointes compatibles avec les liens d'établissement : colonne Pièces jointes en formule, calculée à partir
  // d'une colonne texte d'envoi (« numéro:empreinte ») que le formulaire remplit (voir PJ)
  if (typeBase(question.type) === "Attachments" && question.formule) {
    const correspondance = /\(\$(\w+) or ""\)\.split\(\)/.exec(question.texteFormule || "");
    if (correspondance && etatSaisie.metaSig[correspondance[1]]) {
      question.pjEnvoi = correspondance[1];
      question.formule = false;
    }
  }
  question.depuisFormulaire = true;
  return question;
}
// Parties du formulaire : { id, nom, role: q | vd | va, titre (affiché en tête de partie) }
const PARTIES_DEFAUT = [
  { id: "q", nom: "Signalement", role: "q" },
  { id: "vd", nom: "Visa départemental", role: "vd" },
  { id: "va", nom: "Visa académique", role: "va" },
];
const partiesDe = (configurationFormulaire) =>
  configurationFormulaire && Array.isArray(configurationFormulaire.parties) && configurationFormulaire.parties.length
    ? configurationFormulaire.parties
    : PARTIES_DEFAUT;
const NOMS_VISA = {};
function appliquerNomsParties() {
  for (const [role, id] of [
    ["vd", "form-visa-dep"],
    ["va", "form-visa-aca"],
  ]) {
    const formulaireVisa = $(id);
    if (!formulaireVisa) continue;
    const titre = formulaireVisa.querySelector("h2"),
      boutonEnvoi = formulaireVisa.querySelector('button[type="submit"]');
    if (!NOMS_VISA[role]) NOMS_VISA[role] = { titre: titre.textContent, bouton: boutonEnvoi.textContent };
    const partie = etatSaisie.formulaireActif
      ? partiesDe(etatSaisie.formulaireActif.conf).find((partieCandidate) => partieCandidate.role === role)
      : null;
    titre.textContent = partie && partie.nom ? partie.nom : NOMS_VISA[role].titre;
    boutonEnvoi.textContent = partie && partie.nom ? `Enregistrer : ${partie.nom}` : NOMS_VISA[role].bouton;
  }
}
// Questions d'une section (q, vd, va) selon le formulaire publié ; null = pas de formulaire
function defsDepuisFormulaire(section, cleMapping, alertes) {
  if (!etatSaisie.formulaireActif) return null;
  const parties = partiesDe(etatSaisie.formulaireActif.conf).filter((partie) => partie.role === section);
  const roleDe = (bloc) =>
    (partiesDe(etatSaisie.formulaireActif.conf).find((partie) => partie.id === (bloc.section || "q")) || {}).role ||
    "q";
  const blocs = [];
  for (const partie of parties) {
    const dans = etatSaisie.formulaireActif.conf.blocs.filter(
      (bloc) => (bloc.section || "q") === partie.id && roleDe(bloc) === section,
    );
    if (section === "q" && partie.titre && partie.nom) blocs.push({ genre: "titre", texte: partie.nom });
    blocs.push(...dans);
  }
  let questionsSection = [];
  const decors = { avant: {}, fin: [] };
  let enAttente = [];
  for (const bloc of blocs) {
    if (bloc.genre === "titre" || bloc.genre === "info") {
      enAttente.push(bloc);
      continue;
    }
    const question = defDepuisBloc(bloc);
    if (!question) {
      alertes.push(
        `Formulaire « ${etatSaisie.formulaireActif.nom} » : la colonne « ${bloc.colonne} » n'existe plus dans la table ${etatSaisie.tableId}.`,
      );
      continue;
    }
    if (enAttente.length) {
      decors.avant[question.colId] = enAttente;
      enAttente = [];
    }
    questionsSection.push(question);
  }
  decors.fin = enAttente;
  // Association « Questions supplémentaires » remplie sur cette page : seulement ces questions, dans cet ordre
  const restreint =
    etatSaisie.mappings && Array.isArray(etatSaisie.mappings[cleMapping]) && etatSaisie.mappings[cleMapping].length
      ? etatSaisie.mappings[cleMapping]
      : null;
  if (restreint) {
    questionsSection = restreint
      .map(
        (colonne) =>
          questionsSection.find((question) => question.colId === colonne) ||
          (etatSaisie.metaSig[colonne] ? avecRegles(etatSaisie.metaSig[colonne]) : null),
      )
      .filter(Boolean);
    decors.avant = {};
    decors.fin = [];
  }
  if (section === "q") etatSaisie.decorsQ = decors;
  return questionsSection;
}
function decorHtml(bloc) {
  return bloc.genre === "titre"
    ? `<h3 class="titre-section">${esc(bloc.texte || "")}</h3>`
    : `<p class="info-formulaire">${esc(bloc.texte || "").replace(/\n/g, "<br>")}</p>`;
}
// Publication d'une nouvelle version pendant que le widget est ouvert : relue au plus toutes les 30 s
async function verifierFormulairePublie() {
  if (
    !etatSaisie.tableId ||
    Date.now() - etatSaisie.dernierControleFormulaire < 30000 ||
    etatSaisie.modifie ||
    etatSaisie.modifieVisa
  )
    return;
  etatSaisie.dernierControleFormulaire = Date.now();
  const avant = etatSaisie.signatureFormulaire;
  const liste = (await lireFormulaires()).filter((formulaire) => formulaire.table === etatSaisie.tableId);
  let voulu = null;
  try {
    voulu = grist.getOption ? await grist.getOption("formulaire") : null;
  } catch (_) {
    // option absente ou page ouverte hors de Grist : formulaire par défaut
  }
  const publies = liste.filter((formulaire) => typeof formulaire.publie === "string" && formulaire.publie.trim());
  const formulaireRetenu = (voulu && publies.find((formulaire) => formulaire.nom === voulu)) || publies[0] || null;
  const sig = formulaireRetenu ? `${formulaireRetenu.nom}|${formulaireRetenu.publie}` : "";
  if (sig !== avant)
    enFile(async () => {
      await chargerConfiguration();
      await rafraichir();
    });
}

// Contrôle régulier : une publication modifie la table Formulaires, qui n'envoie aucun signal au widget
// (seule la table liée en envoie). Le widget la relit donc toutes les 30 secondes environ, et dès que
// la page redevient visible ; jamais pendant une saisie en cours (voir verifierFormulairePublie).
setInterval(() => {
  if (!document.hidden) verifierFormulairePublie().catch(() => {});
}, 31000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) verifierFormulairePublie().catch(() => {});
});

/* ---------- Rôles des colonnes de la table des réponses ----------
   Sans association dans le panneau de Grist, chaque rôle (établissement, dossier, date des faits…) prend la colonne
   du même identifiant, sinon une colonne d'identifiant ou de libellé approchant et de type compatible :
   « Etablissement_ESR » (référence), « Date des faits », « Qualification du signalement »… */
const ROLES_SIGNALEMENT = [
  ["Dossier", [/(^|_)dossier(_|$)/, /signalement_?initial/], (colonne, idTable) => colonne.type === `Ref:${idTable}`],
  [
    "Etablissement",
    [/etablissement/, /(^|_)etab(_|$)/, /structure|universite|ecole|college|lycee/],
    (colonne, idTable) => /^Ref:/.test(colonne.type) && colonne.type !== `Ref:${idTable}`,
  ],
  [
    "Date_faits",
    [/faits?(_|$)/, /date_?(de_?l_?)?evenement/],
    (colonne) => /^(Date|DateTime)/.test(colonne.type) && !colonne.formule,
  ],
  [
    "Date",
    [/^date_?(de_?)?(saisie|creation|version)/, /cree_?le|horodat|creation/, /^date$/],
    (colonne) => /^(DateTime|Date)/.test(colonne.type),
  ],
  [
    "Qualification",
    [/qualif/, /categorie_?(du_?)?(signalement|evenement)/, /type_?(d_?)?evenement/],
    (colonne) => /^(Choice|ChoiceList|Text)/.test(colonne.type) && !colonne.formule,
  ],
  [
    "Description",
    [/^description/, /description/, /recit|resume_?des_?faits/],
    (colonne) => /^Text/.test(colonne.type) && !colonne.formule,
  ],
  [
    "Nature",
    [/^nature$/, /nature_?(du_?)?(signalement|version|saisie)/],
    (colonne) => /^(Choice|Text)/.test(colonne.type) && !colonne.formule,
  ],
  ["Commentaire", [/^commentaire/, /commentaire/], (colonne) => /^Text/.test(colonne.type) && !colonne.formule],
  ["Auteur", [/^auteur/, /saisi_?par|redacteur|createur/], () => true],
  ["Site", [/^site/, /batiment|campus/], (colonne) => /^(Text|Choice)/.test(colonne.type) && !colonne.formule],
  ["Clos", [/^clos/, /cloture|termine/], (colonne) => colonne.type === "Bool" && !colonne.formule],
];
// Cellule renseignée (une référence vide arrive sous la forme ["R", table, 0])
const celluleRemplie = (valeur) =>
  valeur != null &&
  valeur !== "" &&
  valeur !== 0 &&
  valeur !== false &&
  !(
    Array.isArray(valeur) && (valeur[0] === "L" ? valeur.length <= 1 : valeur[0] === "R" ? !valeur[2] : !valeur.length)
  );
function reconnaitreColonnesSignalement(meta, tid = etatSaisie.tableId, lignes = etatSaisie.enregistrements) {
  const colonnesParRole = {},
    pris = new Set(),
    colonnes = Object.values(meta || {}).filter(
      (colonne) =>
        colonne &&
        colonne.colId &&
        colonne.colId !== "id" &&
        colonne.colId !== "manualSort" &&
        !colonne.colId.startsWith("gristHelper"),
    );
  const noms = (colonne) => [normColonne(colonne.colId), normColonne(colonne.libelle)].filter(Boolean);
  const remplie = (colId) => (lignes || []).some((ligne) => celluleRemplie(ligne[colId]));
  // colonnes des questions du formulaire publié (tableau « Détail des sites »…) : jamais prises pour un rôle par approximation
  const questions = new Set(
    etatSaisie.formulaireActif && tid === etatSaisie.tableId
      ? (etatSaisie.formulaireActif.conf.blocs || []).map((bloc) => bloc.colonne).filter(Boolean)
      : [],
  );
  // 1) identifiant exact et type compatible ; 2) identifiant ou libellé approchant (premier motif qui trouve une colonne,
  //    la colonne remplie d'abord). Une colonne d'identifiant exact mais entièrement vide, ajoutée après coup alors que
  //    les signalements sont saisis ailleurs (« Etablissement » vide à côté de « Etablissement_ESR »), cède la place à
  //    une colonne approchante remplie.
  const exacts = new Set();
  for (const [role, , estCompatible] of ROLES_SIGNALEMENT) {
    const colonne = (meta || {})[role];
    if (colonne && estCompatible(colonne, tid)) {
      colonnesParRole[role] = role;
      pris.add(role);
      exacts.add(role);
    }
  }
  for (const [role, motifs, estCompatible] of ROLES_SIGNALEMENT) {
    if (colonnesParRole[role] && (!lignes || !lignes.length || remplie(colonnesParRole[role]))) continue;
    let choix = null;
    for (const motif of motifs) {
      const cands = colonnes.filter(
        (colonne) =>
          !pris.has(colonne.colId) &&
          !questions.has(colonne.colId) &&
          estCompatible(colonne, tid) &&
          noms(colonne).some((nomNormalise) => motif.test(nomNormalise)),
      );
      if (!cands.length) continue;
      // date de saisie : la colonne remplie par Grist (NOW()) d'abord
      if (role === "Date")
        cands.sort((a, b) => (/NOW\(\)/.test(b.texteFormule) ? 1 : 0) - (/NOW\(\)/.test(a.texteFormule) ? 1 : 0));
      const pleine = cands.find((colonne) => remplie(colonne.colId));
      if (exacts.has(role)) {
        if (pleine) {
          choix = pleine;
          break;
        }
        continue;
      } // n'écarter l'identifiant exact que pour une colonne remplie
      choix = pleine || cands[0];
      break;
    }
    if (choix) {
      if (colonnesParRole[role]) pris.delete(colonnesParRole[role]);
      colonnesParRole[role] = choix.colId;
      pris.add(choix.colId);
    }
  }
  return colonnesParRole;
}

// ⚙ : ce que le widget utilise réellement (utile pour comprendre un affichage inattendu)
const VERSION_WIDGET = `v2 · ${window.Socle.VERSION}`;
function remplirActivite() {
  const activite = ACTIVITE,
    min = Math.max(1, (Date.now() - activite.debut) / 60000),
    fait = activite.envois.filter((envoi) => envoi.ms != null);
  const recents = activite.envois.filter((envoi) => Date.now() - envoi.t < 60000).length,
    dernier = activite.envois[activite.envois.length - 1];
  const moy = fait.length ? fait.reduce((somme, envoi) => somme + envoi.ms, 0) / fait.length : 0,
    max = fait.reduce((maximum, envoi) => Math.max(maximum, envoi.ms), 0);
  const formaterDuree = (millisecondes) => `${Math.round(millisecondes)} ms`;
  const lectures = Donnees.compteurs()
    .lectures.map(
      (lecture) =>
        `<li>${esc(lecture.table)} : ${lecture.nombre} fois, ${formaterDuree(lecture.ms / lecture.nombre)} en moyenne (au plus ${formaterDuree(lecture.max)})</li>`,
    )
    .join("");
  $("cfg-activite").innerHTML =
    `<p style="margin:0 0 4px">Depuis l'ouverture du widget (${Math.round(min)} min) :</p><ul style="margin:0;padding-left:18px">
    <li>Grist a envoyé la table <b>${activite.envois.length}</b> fois (${recents} dans la dernière minute, ${(activite.envois.length / min).toFixed(1)} par minute en moyenne)${dernier ? `, la dernière fois <b>${dernier.lignes}</b> lignes × ${dernier.colonnes} colonnes` : ""}${activite.regroupes ? ` ; ${activite.regroupes} envoi(s) rapprochés regroupés` : ""}.</li>
    <li>Traitement de ces envois par le widget : <b>${formaterDuree(moy)}</b> en moyenne, au plus ${formaterDuree(max)}.</li>
    <li>Ligne sélectionnée renvoyée par Grist : ${activite.curseur} fois (${activite.curseurIgnores} simples renvois sans effet).</li>
    <li>Tâches longues du widget (plus de 50 ms) : ${activite.longues}, ${formaterDuree(activite.dureeLongues)} au total${activite.longues ? ` (${formaterDuree(activite.dureeLongues / min)} par minute)` : ""}.</li>
    <li>Référentiel : ${etatSaisie.referentielDuCache ? `copie conservée dans ce navigateur (lue sur le serveur le ${Outils.dates.dateHeure(etatSaisie.referentielDuCache, { dateStyle: "short", timeStyle: "short" })}, relue automatiquement après 24 h) <button type="button" class="lien-texte" id="btn-relire-ref">Relire le référentiel maintenant</button>` : "lu sur le serveur à l'ouverture"}.</li>
    ${etatSaisie.sqlRefuse ? `<li>Lecture rapide (SQL) indisponible : ${esc(etatSaisie.sqlRefuse)} ; lecture habituelle utilisée.</li>` : ""}
    ${lectures ? `<li>Lectures dans Grist :<ul style="margin:0;padding-left:16px">${lectures}</ul></li>` : ""}</ul>
    <p style="margin:4px 0 0">Si la page est lente alors que ces temps restent faibles, le temps passe dans Grist (préparation et envoi de la table, calcul des formules) plutôt que dans le widget.</p>`;
}
$("btn-activite").addEventListener("click", remplirActivite);
$("cfg-activite").addEventListener("click", async (evenement) => {
  if (evenement.target.id !== "btn-relire-ref") return;
  evenement.target.disabled = true;
  evenement.target.textContent = "Lecture en cours…";
  await oublierCacheReferentiel();
  await chargerEtabs(false);
  enFile(async () => {
    etatSaisie.indexRecherche = null;
    await rafraichir();
  });
  remplirActivite();
});
function remplirDiagnostic() {
  remplirActivite();
  const LIB = {
    Etablissement: "Établissement",
    Dossier: "Dossier",
    Date_faits: "Date des faits",
    Date: "Date de saisie",
    Qualification: "Qualification",
    Description: "Description",
    Nature: "Nature",
    Commentaire: "Commentaire",
    Auteur: "Auteur",
    Site: "Site / bâtiment",
    Clos: "Clos",
  };
  const rempli = celluleRemplie;
  const ligne = (k) => {
    const colonne = colonneDe(k),
      metaColonne = colonne && etatSaisie.metaSig[colonne],
      origine =
        etatSaisie.mappings && typeof etatSaisie.mappings[k] === "string"
          ? "associée dans le panneau de Grist"
          : etatSaisie.rolesAdmin[k]
            ? "associée dans l'administration"
            : "reconnue d'après son nom";
    // lignes renseignées et exemple de valeur reçue (une référence invalide arrive sous forme de texte, par exemple)
    const valeursRecues = colonne
      ? etatSaisie.enregistrements.map((enregistrement) => enregistrement[colonne]).filter(rempli)
      : [];
    const exemple = valeursRecues.length ? JSON.stringify(valeursRecues[valeursRecues.length - 1]).slice(0, 60) : "";
    const refsInvalides =
      k === "Etablissement" && valeursRecues.length
        ? valeursRecues.filter((valeur) => refId(valeur) == null).length
        : 0;
    return `<li>${LIB[k]} : ${
      colonne
        ? `<b>${esc(colonne)}</b>${metaColonne ? ` <span class="note">(${esc(String(metaColonne.type).replace(/^Ref:/, "référence vers "))}, ${origine})</span>` : ""}` +
          ` — renseignée sur ${valeursRecues.length} ligne${valeursRecues.length > 1 ? "s" : ""} sur ${etatSaisie.enregistrements.length}${exemple ? `, par exemple ${esc(exemple)}` : ""}` +
          (refsInvalides
            ? ` <span style="color:var(--erreur)">· ${refsInvalides} valeur(s) qui ne sont pas des références valides (cellules en rouge dans Grist)</span>`
            : "")
        : `<span style="color:var(--erreur)">non trouvée</span>`
    }</li>`;
  };
  const avec = etatSaisie.enregistrements.filter(
      (enregistrement) => refId(valeurLigne(enregistrement, "Etablissement")) || texteEtabBrut(enregistrement),
    ),
    perdus = avec.filter((enregistrement) => !etabDeLigne(enregistrement));
  const ecartees = Object.keys(LIB).filter(
    (k) =>
      colonneDe(k) &&
      colonneDe(k) !== k &&
      etatSaisie.metaSig[k] &&
      !(etatSaisie.mappings && typeof etatSaisie.mappings[k] === "string") &&
      !etatSaisie.enregistrements.some((enregistrement) => celluleRemplie(enregistrement[k])),
  );
  const colonneEtablissement = colonneDe("Etablissement"),
    refOk =
      colonneEtablissement &&
      etatSaisie.metaSig[colonneEtablissement] &&
      etatSaisie.metaSig[colonneEtablissement].type === `Ref:${ETAB.table}`;
  const aRattacher = refOk
    ? etatSaisie.enregistrements.filter(
        (enregistrement) => texteEtabBrut(enregistrement) && etabDeLigne(enregistrement),
      )
    : [];
  const textes = etatSaisie.enregistrements.filter((enregistrement) => texteEtabBrut(enregistrement)).length;
  $("cfg-diagnostic").innerHTML =
    `<p style="margin:0 0 4px">Widget : version du ${esc(VERSION_WIDGET)} · table des réponses <b>${esc(etatSaisie.tableId || "?")}</b> · formulaire ${etatSaisie.formulaireActif ? `« ${esc(etatSaisie.formulaireActif.nom)} » (publié)` : "<b>aucun formulaire publié</b> pour cette table"}.</p>
    <p style="margin:0 0 4px">Référentiel : <b>${esc(ETAB.table)}</b> (${esc(ETAB.origineTable || "table par défaut")}), ${etatSaisie.etabs.length} établissement(s) lus${avec.length ? ` ; ${avec.length - perdus.length} signalement(s) sur ${avec.length} y retrouvent leur établissement` : ` ; <span style="color:var(--erreur)">aucune des ${etatSaisie.enregistrements.length} ligne(s) reçues par le widget ne porte un établissement valide</span>`}.</p>
    <ul style="margin:0;padding-left:18px">${Object.keys(LIB).map(ligne).join("")}</ul>
    ${ecartees.length ? `<p style="margin:8px 0 4px">Colonne${ecartees.length > 1 ? "s" : ""} ${ecartees.map((k) => `« ${esc(k)} »`).join(", ")} de la table « ${esc(etatSaisie.tableId)} » ignorée${ecartees.length > 1 ? "s" : ""} car vide${ecartees.length > 1 ? "s" : ""} : les signalements sont lus dans ${ecartees.map((k) => `« ${esc(colonneDe(k))} »`).join(", ")}. Vous pouvez ${ecartees.length > 1 ? "les" : "la"} supprimer dans Grist si personne ne s'en sert.</p>` : ""}
    ${
      textes
        ? `<p style="margin:8px 0 4px">${textes} signalement(s) portent l'établissement sous forme de texte (cellules en rouge dans Grist) : le widget affiche ce texte, mais ces signalements ne sont pas reliés à la fiche de l'établissement (point de situation, filtres).
      ${
        aRattacher.length
          ? `${aRattacher.length} d'entre eux correspondent à un établissement de « ${esc(ETAB.table)} » par leur nom ou leur UAI.</p>
      <button type="button" class="secondaire" id="btn-rattacher-etabs">Rattacher ${aRattacher.length} signalement(s) à leur établissement</button>`
          : refOk
            ? "Aucun ne correspond exactement à un nom ou un UAI du référentiel : corrigez-les dans Grist.</p>"
            : `La colonne « ${esc(colonneEtablissement || "?")} » doit être une référence vers « ${esc(ETAB.table)} » pour les rattacher.</p>`
      }`
        : ""
    }`;
  const boutonRattacher = $("btn-rattacher-etabs");
  if (boutonRattacher)
    boutonRattacher.addEventListener("click", async () => {
      if (
        !confirm(
          `Remplacer le texte de ${aRattacher.length} cellule(s) « ${colonneEtablissement} » par la référence vers l'établissement correspondant de « ${ETAB.table} » ?`,
        )
      )
        return;
      boutonRattacher.disabled = true;
      boutonRattacher.textContent = "Rattachement…";
      try {
        const acts = aRattacher.map((enregistrement) => [
          "UpdateRecord",
          etatSaisie.tableId,
          enregistrement.id,
          { [colonneEtablissement]: etabDeLigne(enregistrement).id },
        ]);
        for (let k = 0; k < acts.length; k += 400) await Donnees.ecrire(acts.slice(k, k + 400));
        boutonRattacher.textContent = `${aRattacher.length} signalement(s) rattachés`;
      } catch (erreur) {
        boutonRattacher.disabled = false;
        boutonRattacher.textContent = "Réessayer le rattachement";
        alert(`Rattachement impossible : ${erreur.message || erreur}`);
      }
    });
}

function signalerErreurChargement(erreur, contexte) {
  const message = `${contexte} : ${(erreur && erreur.message) || erreur}${
    erreur && erreur.stack
      ? ` [${String(erreur.stack)
          .split("\n")
          .slice(0, 3)
          .map((ligneTrace) => ligneTrace.trim())
          .join(" ← ")}]`
      : ""
  }`;
  console.error("Formulaire :", contexte, erreur);
  if (etatSaisie.erreursChargement.includes(message)) return;
  etatSaisie.erreursChargement.push(message);
  const zoneAlerte = $("alerte");
  if (zoneAlerte) {
    zoneAlerte.textContent = `${zoneAlerte.hidden ? "" : zoneAlerte.textContent + " "}Le formulaire n'a pas pu se charger entièrement (${message}). Copiez ce message pour l'administrateur du document ; « ⚙ Réglages » reste accessible.`;
    zoneAlerte.hidden = false;
  }
  const boutonConfig = $("btn-config");
  if (boutonConfig && !etatSaisie.modeEtab) boutonConfig.hidden = false;
}
window.addEventListener("error", (evenement) => {
  if (evenement.error && !etatSaisie.referentielLu) signalerErreurChargement(evenement.error, "erreur");
});
window.addEventListener("unhandledrejection", (evenement) => {
  if (!etatSaisie.referentielLu) signalerErreurChargement(evenement.reason, "erreur");
});
async function chargerConfiguration() {
  try {
    await chargerConfigurationEtapes();
  } catch (erreur) {
    signalerErreurChargement(erreur, "chargement de la configuration");
  }
}
async function chargerConfigurationEtapes() {
  const alertes = [];
  await lireSocleSaisie();
  etatSaisie.metaSig = {};
  // Toutes les lectures partent en même temps : le temps d'attente est celui de la plus longue,
  // et non plus leur somme. Le référentiel, le plus lourd, est attendu à part (voir plus bas).
  etatSaisie.promesseMeta = null;
  lireMeta().catch(() => {});
  const pProfil = chargerProfil();
  const pReglages = chargerReglages();
  try {
    etatSaisie.tableId = await grist.getTable().getTableId();
    etatSaisie.metaSig = (await metaColonnes(etatSaisie.tableId).catch(() => null)) || {};
    if (etatSaisie.metaCopie) await completerPjCopie(etatSaisie.tableId, etatSaisie.metaSig);
    if (!Object.keys(etatSaisie.metaSig).length)
      alertes.push(
        "La structure du document n'est pas lisible depuis cette page. Responsable du document : ouvrez l'onglet « Établissements » de l'administration (ou republiez le formulaire) pour la mettre à disposition des liens d'accès.",
      );
    await choisirFormulaire();
    // Aucun formulaire publié pour la table liée : on indique ceux qui existent, et la table à choisir
    if (!etatSaisie.formulaireActif) {
      const autres = (await lireFormulaires()).filter(
        (formulaire) =>
          formulaire.table &&
          formulaire.table !== etatSaisie.tableId &&
          typeof formulaire.publie === "string" &&
          formulaire.publie.trim(),
      );
      if (autres.length)
        alertes.unshift(
          `Ce widget est relié à la table « ${etatSaisie.tableId} », pour laquelle aucun formulaire n'est publié. ` +
            `Formulaire${autres.length > 1 ? "s" : ""} publié${autres.length > 1 ? "s" : ""} : ${autres.map((formulaire) => `« ${formulaire.nom} » (table ${formulaire.table})`).join(", ")}. ` +
            `Dans le panneau de droite de Grist, onglet « Données source », choisissez la table du formulaire voulu.`,
        );
    }
    // Colonnes non associées dans le panneau de Grist : reconnues d'après leur identifiant, leur libellé et leur type
    etatSaisie.colsParDefaut = reconnaitreColonnesSignalement(etatSaisie.metaSig);
    // Colonnes associées dans l'administration (« Colonnes de la table des réponses ») : elles priment sur la reconnaissance
    etatSaisie.rolesAdmin = {};
    const rolesAssocies = etatSaisie.formulaireActif && etatSaisie.formulaireActif.conf.roles;
    if (rolesAssocies && typeof rolesAssocies === "object") {
      for (const [role, colonne] of Object.entries(rolesAssocies)) {
        if (colonne === "") {
          etatSaisie.rolesAdmin[role] = "";
          delete etatSaisie.colsParDefaut[role];
        } else if (typeof colonne === "string" && etatSaisie.metaSig[colonne]) {
          etatSaisie.rolesAdmin[role] = colonne;
          etatSaisie.colsParDefaut[role] = colonne;
        } else if (typeof colonne === "string")
          alertes.push(
            `La colonne « ${colonne} » associée dans l'administration des formulaires n'existe plus dans la table « ${etatSaisie.tableId} » : choisissez-en une autre (panneau « Formulaire » › « Colonnes de la table des réponses »), puis publiez.`,
          );
      }
      // une colonne associée à un rôle n'en joue pas un autre par reconnaissance
      const imposees = new Set(Object.values(etatSaisie.rolesAdmin).filter(Boolean));
      for (const role of Object.keys(etatSaisie.colsParDefaut))
        if (!(role in etatSaisie.rolesAdmin) && imposees.has(etatSaisie.colsParDefaut[role]))
          delete etatSaisie.colsParDefaut[role];
    }
    // Associations du socle (clé « roles » de Config) pour les rôles que le formulaire ne règle pas
    if (etatSaisie.tableId === etatSaisie.socleGeneral.reponses) {
      const rolesSocle =
        (etatSaisie.socleConfig &&
          etatSaisie.socleConfig.valeurs.roles &&
          etatSaisie.socleConfig.valeurs.roles.reponses) ||
        {};
      for (const [roleBrut, colonne] of Object.entries(rolesSocle)) {
        const role = roleBrut === "Cree_le" ? "Date" : roleBrut;
        if (role in etatSaisie.rolesAdmin || typeof colonne !== "string" || !etatSaisie.metaSig[colonne]) continue;
        for (const k of Object.keys(etatSaisie.colsParDefaut))
          if (k !== role && etatSaisie.colsParDefaut[k] === colonne && !(k in etatSaisie.rolesAdmin))
            delete etatSaisie.colsParDefaut[k];
        etatSaisie.colsParDefaut[role] = colonne;
      }
    }
    trouverColNomReponses();
    // Formulaire de cette table encore jamais publié : le dire plutôt que d'afficher l'ancien fonctionnement sans explication
    if (!etatSaisie.formulaireActif) {
      const brouillons = etatSaisie.formulairesDispo.filter(
        (formulaire) => !(typeof formulaire.publie === "string" && formulaire.publie.trim()),
      );
      if (brouillons.length) {
        const i = alertes.findIndex((alerte) => alerte.startsWith("Ce widget est relié à la table"));
        if (i >= 0) alertes.splice(i, 1);
      }
      if (brouillons.length)
        alertes.unshift(
          `Le formulaire « ${brouillons[0].nom} » de la table « ${etatSaisie.tableId} » n'est pas encore publié : publiez-le dans l'administration des formulaires pour qu'il s'affiche ici.`,
        );
    }
    let essentiels = [
      ["Etablissement", "l'établissement (référence vers le référentiel)"],
      ["Description", "la description"],
      ["Qualification", "la qualification"],
    ].filter(([k]) => !colonneDe(k));
    if (!colonneDe("Etablissement")) {
      const proche = Object.values(etatSaisie.metaSig).find(
        (colonne) =>
          /etablissement|(^|_)etab(_|$)|uai/.test(normColonne(`${colonne.colId} ${colonne.libelle}`)) &&
          !/^Ref:/.test(colonne.type),
      );
      if (proche) essentiels = essentiels.filter(([k]) => k !== "Etablissement");
      if (proche)
        alertes.push(
          `La colonne « ${proche.libelle || proche.colId} » (${proche.colId}) est de type ${String(proche.type).split(":")[0]} : pour relier chaque signalement à son établissement, elle doit être de type Référence vers le référentiel (par exemple Etablissement_ESR). Dans Grist : en-tête de la colonne › Options de la colonne › Type : Référence.`,
        );
    }
    if (essentiels.length)
      alertes.push(
        `Colonne${essentiels.length > 1 ? "s" : ""} introuvable${essentiels.length > 1 ? "s" : ""} dans la table « ${etatSaisie.tableId} » : ${essentiels.map((colonneEssentielle) => colonneEssentielle[1]).join(", ")}. ` +
          `Associez-la${essentiels.length > 1 ? "s" : ""} dans l'administration des formulaires (panneau « Formulaire » › « Colonnes de la table des réponses »), puis publiez.`,
      );
  } catch (erreur) {
    console.warn("Métadonnées illisibles", erreur);
  }
  await determinerTableEtab(); // après les rôles : la colonne de l'établissement désigne le référentiel
  const pEtabs = chargerEtabs(true).then(
    () => null,
    (erreur) => erreur,
  );

  document.querySelectorAll("[data-libelle]").forEach((elementLibelle) => {
    if (!elementLibelle.dataset.defaut) elementLibelle.dataset.defaut = elementLibelle.textContent;
    const metaColonne = etatSaisie.metaSig[colonneDe(elementLibelle.dataset.libelle)];
    elementLibelle.textContent = (metaColonne && metaColonne.libelle) || elementLibelle.dataset.defaut;
  });
  etatSaisie.metaDate = etatSaisie.metaSig[colonneDe("Date")] || null;
  etatSaisie.alerteHorloge = "";
  if (colonneDe("Date") && etatSaisie.metaDate && !dateParGrist())
    etatSaisie.alerteHorloge =
      `La date de saisie (« ${etatSaisie.metaDate.libelle || colonneDe("Date")} ») est fournie par l'horloge de chaque ordinateur : si l'une est déréglée, les dates seront fausses. ` +
      `Donnez-lui plutôt la formule d'initialisation NOW(), appliquée aux nouveaux enregistrements (Grist utilisera l'heure de son serveur).`;
  $("bloc-commentaire").hidden = !(afficherCommentaire() && colonneDe("Commentaire"));
  etatSaisie.metaFaits = etatSaisie.metaSig[colonneDe("Date_faits")] || null;
  $("bloc-date-faits").hidden = !colonneDe("Date_faits");
  $("bloc-site").hidden = !colonneDe("Site");
  appliquerVersion();
  $("date-faits").type =
    etatSaisie.metaFaits && (etatSaisie.metaFaits.type || "").startsWith("DateTime") ? "datetime-local" : "date";
  $("bloc-plusieurs-jours").hidden = !(colonneDe("Date_faits") && reglagesSaisie().plusieursJours && !faitsAvecHeure());
  if (!$("aide-date-faits").dataset.base) $("aide-date-faits").textContent = aideFaitsDefaut();
  const metaQualification = etatSaisie.metaSig[colonneDe("Qualification")];
  etatSaisie.choix = (metaQualification && metaQualification.opts.choices) || [];
  etatSaisie.couleurs = (metaQualification && metaQualification.opts.choiceOptions) || {};
  etatSaisie.qualifMultiple = !!(metaQualification && (metaQualification.type || "").split(":")[0] === "ChoiceList");
  afficherChoix("qualifs-initiales", "qualif-initiale");

  etatSaisie.decorsQ = { avant: {}, fin: [] };
  appliquerNomsParties();
  etatSaisie.defsQuestions = defsDepuisFormulaire("q", "Questions", alertes) || defsDe("Questions");
  etatSaisie.defsDep = defsDepuisFormulaire("vd", "Questions_dep", alertes) || defsDe("Questions_dep");
  if (formulaireParSite()) $("bloc-site").hidden = true; // les sites se saisissent dans le tableau des sites
  etatSaisie.defsAca = defsDepuisFormulaire("va", "Questions_aca", alertes) || defsDe("Questions_aca");
  // Champs versionnés : ce dont l'historique retrace l'évolution d'une version à l'autre.
  etatSaisie.champsVersion = [];
  if (colonneDe("Description") && etatSaisie.metaSig[colonneDe("Description")])
    etatSaisie.champsVersion.push({ ...etatSaisie.metaSig[colonneDe("Description")], obligatoire: true, aide: "" });
  if (colonneDe("Site") && etatSaisie.metaSig[colonneDe("Site")])
    etatSaisie.champsVersion.push({
      ...etatSaisie.metaSig[colonneDe("Site")],
      libelle: etatSaisie.metaSig[colonneDe("Site")].libelle || "Site / bâtiment",
      obligatoire: false,
      aide: "",
    });
  // Le type réel (Choice ou ChoiceList) est conservé, pour que le suivi propose le même mode de sélection.
  if (metaQualification)
    etatSaisie.champsVersion.push({
      ...metaQualification,
      obligatoire: true,
      aide: "",
      type: etatSaisie.choix.length ? metaQualification.type : "Text",
    });
  etatSaisie.defsQuestions.forEach((question) => etatSaisie.champsVersion.push(question));
  construireReglesCouleur(alertes);
  restaurerFiltre();

  rendreChamps($("questions"), "q", etatSaisie.defsQuestions, () => {
    etatSaisie.modifie = true;
  });
  placerQualification();
  appliquerConditions("q", etatSaisie.defsQuestions);
  rendreChamps($("champs-dep"), "vd", etatSaisie.defsDep, () => {
    etatSaisie.modifieVisa = true;
  });
  rendreChamps($("champs-aca"), "va", etatSaisie.defsAca, () => {
    etatSaisie.modifieVisa = true;
  });
  activerVerdictRapide("vd", etatSaisie.defsDep, "statut-dep-rapide");
  activerVerdictRapide("va", etatSaisie.defsAca, "statut-aca-rapide");

  await Promise.all([pProfil, pReglages]);
  await chargerProfilViseur();
  lireVeille().then(() => {
    if (etatSaisie.vue === "accueil") majBandeauVeille();
  });
  appliquerOptions(etatSaisie.optionsParametres);
  appliquerBornes();
  // Conditions qui désignent une colonne introuvable : la question ne pourrait jamais s'afficher
  for (const question of [...etatSaisie.defsQuestions, ...etatSaisie.defsDep, ...etatSaisie.defsAca]) {
    if (
      question.condition &&
      !resoudreColonne(question.condition.ref, [
        ...etatSaisie.defsQuestions,
        ...etatSaisie.defsDep,
        ...etatSaisie.defsAca,
      ])
    )
      alertes.push(
        `La question « ${question.libelle} » dépend de « ${question.condition.ref} », qui ne correspond à aucune colonne (identifiant ou libellé) : elle ne s'affichera jamais.`,
      );
  }
  $("alerte").textContent = alertes.join(" ");
  $("alerte").hidden = !alertes.length;

  // Référentiel : si la lecture est rapide (cas d'un établissement venu par son lien, une seule ligne),
  // on l'attend brièvement pour éviter tout clignotement ; sinon le formulaire s'affiche sans lui
  // et se complète à son arrivée.
  const rapide = await Promise.race([
    pEtabs.then(() => true),
    new Promise((resoudre) => setTimeout(() => resoudre(false), 250)),
  ]);
  if (rapide) finaliserReferentiel(await pEtabs, alertes);
  else {
    $("sous-titre").textContent = "Chargement du référentiel des établissements…";
    pEtabs.then((erreurReferentiel) =>
      enFile(async () => {
        finaliserReferentiel(erreurReferentiel, alertes);
        await apresChargementEtabs();
      }),
    );
  }
  if (!etatSaisie.dossierId) await passerEnCreation();
  majCouleur();
}

async function determinerTableEtab() {
  etatSaisie.alerteTableRef = "";
  let choisie = null,
    cible = null,
    colonneEtablissement = null;
  try {
    const tid = await grist.getTable().getTableId(),
      metaTable = await metaColonnes(tid);
    colonneEtablissement =
      colonneDe("Etablissement") || reconnaitreColonnesSignalement(metaTable, tid).Etablissement || null; // sans association : colonne reconnue (Etablissement, Etablissement_ESR…)
    cible =
      (metaTable &&
        colonneEtablissement &&
        metaTable[colonneEtablissement] &&
        ((metaTable[colonneEtablissement].type || "").match(/^Ref:(.+)$/) || [])[1]) ||
      null;
  } catch (_) {
    /* métadonnées illisibles */
  }
  if (reglagesDansConfig()) {
    const reglagesResume = etatSaisie.socleConfig.valeurs.resume_auto;
    choisie = (reglagesResume && reglagesResume[CLE_TABLE_ETAB]) || null;
    if (
      !choisie &&
      etatSaisie.socleGeneral.referentiel &&
      (await metaColonnes(etatSaisie.socleGeneral.referentiel).catch(() => null))
    )
      choisie = etatSaisie.socleGeneral.referentiel;
  } else
    try {
      const tableParametres = await Donnees.lire(PARAMETRES.table);
      const brut = (tableParametres[PARAMETRES.colonne] || [])[0];
      if (typeof brut === "string" && brut.trim()) choisie = JSON.parse(brut)[CLE_TABLE_ETAB] || null;
    } catch (_) {
      /* pas de réglage lisible */
    }
  if (choisie) {
    ETAB.table = choisie;
    ETAB.origineTable = "choisie dans les réglages";
    if (cible && cible !== choisie)
      etatSaisie.alerteTableRef =
        `La recherche porte sur la table « ${choisie} », mais la colonne « ${colonneEtablissement} » renvoie vers la table « ${cible} » : ` +
        `les signalements seraient rattachés à la mauvaise ligne. Dans Grist, faites pointer la colonne « ${colonneEtablissement} » vers « ${choisie} » (type Référence), ou revenez au réglage automatique.`;
    return;
  }
  if (cible) {
    ETAB.table = cible;
    ETAB.origineTable = `table visée par la colonne « ${colonneEtablissement} »`;
    return;
  }
  ETAB.table = TABLE_ETAB_DEFAUT;
  ETAB.origineTable = "table par défaut";
}

// Signalements dont la référence ne correspond à aucune ligne du référentiel lu (autre table visée, réglage ⚙ forcé…)
function alerteLiensEtab() {
  if (!colonneDe("Etablissement") || !etatSaisie.etabs.length || !etatSaisie.enregistrements.length) return "";
  const avec = etatSaisie.enregistrements.filter(
    (enregistrement) => refId(valeurLigne(enregistrement, "Etablissement")) || texteEtabBrut(enregistrement),
  );
  const perdus = avec.filter((enregistrement) => !etabDeLigne(enregistrement));
  return perdus.length > avec.length / 2
    ? `${perdus.length} signalement(s) sur ${avec.length} renvoient à des établissements absents de la table « ${ETAB.table} » : la colonne « ${colonneDe("Etablissement")} » vise sans doute une autre table. Vérifiez ⚙ Réglages › « Colonnes et référentiel utilisés ».`
    : "";
}
// Page des établissements ouverte par un compte de la cellule (propriétaire, agent) : tout le référentiel est visible,
// pas de préremplissage ; un établissement, lui, arrive par son lien et ne voit que sa ligne.
function majAlertePageEtab() {
  const alerte = $("alerte-page-etab");
  if (!alerte) return;
  if (!etatSaisie.pageEtab || !etatSaisie.referentielLu || etatSaisie.modeEtab) {
    alerte.hidden = true;
    return;
  }
  const sansCle = !(etatSaisie.colsEtab || []).includes(colonnesEtab.cle);
  alerte.innerHTML = `<strong>Page des établissements, vue avec votre compte</strong> : vous voyez tous les établissements, le formulaire n'est donc pas prérempli.
    Un établissement arrive par son lien personnel et ne voit que sa fiche. Pour le vérifier, ouvrez un lien dans une <strong>fenêtre de navigation privée</strong> (sans être connecté à Grist).
    ${sansCle ? `<br><span style="color:var(--erreur)">Les liens n'existent pas encore dans ${esc(ETAB.table)} (colonne « ${esc(colonnesEtab.cle)} » absente) : administration, onglet Établissements, terminer la mise en place.</span>` : ""}`;
  alerte.hidden = false;
}
function finaliserReferentiel(erreur, alertes) {
  etatSaisie.referentielLu = true;
  majAlertePageEtab();
  const liste = [...alertes];
  const liens = alerteLiensEtab();
  if (liens && !etatSaisie.modeEtab) liste.push(liens);
  if (etatSaisie.alerteTableRef && !etatSaisie.modeEtab) liste.push(etatSaisie.alerteTableRef);
  if (erreur)
    liste.push(
      /access|acc[eè]s|blocked|denied|refus|permission/i.test(String(erreur.message || erreur))
        ? `Accès refusé à la table « ${ETAB.table} ». Si vous êtes arrivé par un lien personnel, il n'est plus valable (lien renouvelé ou expiré, agent retiré de l'équipe) : demandez un nouveau lien à la cellule.`
        : `Table « ${ETAB.table} » inaccessible (${erreur.message || erreur}).`,
    );
  $("alerte").textContent = liste.join(" ");
  $("alerte").hidden = !liste.length;
  $("btn-config").hidden = etatSaisie.modeEtab;
  // Points techniques (horloge, structure du référentiel) : utiles à l'administrateur seulement, dans les réglages
  const techniques = etatSaisie.modeEtab
    ? []
    : [etatSaisie.alerteHorloge, !erreur && etatSaisie.alerteStructure].filter(Boolean);
  $("cfg-alertes").innerHTML = techniques.length
    ? `<strong>Points techniques à vérifier</strong>${techniques.map((texte) => `<p style="margin:6px 0 0">${esc(texte)}</p>`).join("")}`
    : "";
  $("cfg-alertes").hidden = !techniques.length;
  $("btn-config").classList.toggle("a-signaler", techniques.length > 0);
  $("btn-config").title = techniques.length
    ? `${techniques.length} point(s) technique(s) à vérifier dans les réglages`
    : "Réglages du formulaire";
}

// Le référentiel vient d'arriver : on complète ce qui en dépend, sans perdre une saisie en cours
async function apresChargementEtabs() {
  if (etatSaisie.dossierId && etatSaisie.initiale) {
    etatSaisie.etabCourant = etabDeLigne(etatSaisie.initiale);
    if (!etatSaisie.modifie) await remplirFormulaire(); // réévalue aussi la description (en-tête établissement)
    afficherDossier();
  } else {
    if (etatSaisie.modeEtab) etatSaisie.etabCourant = etatSaisie.etabs[0] || null;
    if (!etatSaisie.modifie)
      $("sous-titre").textContent = etatSaisie.modeEtab ? "" : "Identifiez l'établissement par son nom ou son UAI.";
    afficherEtablissement();
    majListeDossiers();
  }
}

/* Colonnes Référence du référentiel (ex. Académie → table des académies) : Grist transmet le numéro de ligne.
   Le widget le remplace par le nom lu dans la table visée (colonne Nom / Libellé / Intitulé si elle existe,
   sinon la colonne affichée dans Grist), pour la fiche, la recherche et les filtres. */
/* Tables lues seulement pour des libellés ou des listes de choix (académies, nomenclatures…) : gardées 10 minutes.
   Une grande table peut demander plusieurs secondes au serveur ; plusieurs colonnes qui la visent ne la relisent pas. */
const cacheTables = new Map();
async function lireTableSQL(tid) {
  if (etatSaisie.sqlRefuse) throw new Error(etatSaisie.sqlRefuse);
  if (!grist.docApi.getAccessToken) {
    etatSaisie.sqlRefuse = "jeton d'accès indisponible";
    throw new Error(etatSaisie.sqlRefuse);
  }
  if (!etatSaisie.jetonSQL || Date.now() > etatSaisie.jetonSQL.expire) {
    const j = await grist.docApi.getAccessToken({ readOnly: true });
    etatSaisie.jetonSQL = { ...j, expire: Date.now() + Math.max(30, Math.min(Number(j.ttl) || 300, 600) - 20) * 1000 };
  }
  const meta = await metaColonnes(tid);
  if (!meta) throw new Error("table inconnue");
  const colonnes = Object.keys(meta).filter(
    (colonne) => colonne !== "id" && colonne !== "manualSort" && !colonne.startsWith("gristHelper"),
  );
  const sql = `SELECT id${colonnes.map((colonne) => `, "${colonne.replace(/"/g, '""')}"`).join("")} FROM "${tid.replace(/"/g, '""')}"`;
  const debut = performance.now();
  const reponse = await fetch(
    `${etatSaisie.jetonSQL.baseUrl}/sql?q=${encodeURIComponent(sql)}&auth=${encodeURIComponent(etatSaisie.jetonSQL.token)}`,
  );
  if (reponse.status === 401 || reponse.status === 403) {
    etatSaisie.sqlRefuse = `lecture SQL refusée (${reponse.status})`;
    throw new Error(etatSaisie.sqlRefuse);
  }
  if (!reponse.ok) throw new Error(`lecture SQL : erreur ${reponse.status}`);
  const recs = (await reponse.json()).records || [];
  // valeurs telles que les donnerait fetchTable : cases à cocher en booléens, listes au format ["L", …]
  const conv = colonnes.map((colonne) => {
    const typeColonne = typeBase(meta[colonne].type);
    if (typeColonne === "Bool") return (valeur) => (valeur == null ? valeur : !!valeur);
    if (typeColonne === "ChoiceList" || typeColonne === "RefList" || typeColonne === "Attachments")
      return (valeur) => {
        if (typeof valeur !== "string" || !valeur.startsWith("[")) return valeur;
        try {
          return ["L", ...JSON.parse(valeur)];
        } catch (_) {
          return valeur;
        }
      };
    return (valeur) => valeur;
  });
  const tableLue = { id: recs.map((enregistrement) => enregistrement.fields.id) };
  colonnes.forEach((colonne, k) => {
    tableLue[colonne] = recs.map((enregistrement) => conv[k](enregistrement.fields[colonne]));
  });
  Donnees.noterLecture(`${tid} (SQL)`, debut);
  return tableLue;
}
const lireTableRapide = (tid) =>
  lireTableSQL(tid).catch((erreur) => {
    if (!etatSaisie.sqlRefuse) console.warn(`Lecture SQL de ${tid} impossible`, erreur);
    return Donnees.lire(tid);
  });
function lireTableReference(tid) {
  const entreeCache = cacheTables.get(tid);
  if (entreeCache && Date.now() - entreeCache.t < 600000) return entreeCache.p;
  // la table des réponses est déjà reçue du widget : pas de relecture
  const promesseTable =
    tid === etatSaisie.tableId && etatSaisie.enregistrements.length
      ? Promise.resolve(tableDepuisEnregistrements())
      : lireTableRapide(tid);
  cacheTables.set(tid, { t: Date.now(), p: promesseTable });
  promesseTable.catch(() => cacheTables.delete(tid));
  return promesseTable;
}
function tableDepuisEnregistrements() {
  const colonnes = new Set(["id"]);
  for (const enregistrement of etatSaisie.enregistrements.slice(0, 50))
    Object.keys(enregistrement).forEach((k) => colonnes.add(k));
  const table = {};
  for (const colonne of colonnes)
    table[colonne] = etatSaisie.enregistrements.map((enregistrement) => enregistrement[colonne]);
  return table;
}
async function libellesTable(tid, colAffichee) {
  const tableReference = await lireTableReference(tid);
  const colonnes = Object.keys(tableReference).filter(
    (colonne) => colonne !== "id" && colonne !== "manualSort" && !colonne.startsWith("gristHelper"),
  );
  const texte = (colonne) =>
    (tableReference[colonne] || []).some((valeur) => typeof valeur === "string" && valeur.trim());
  const colonneLibelle =
    colonnes.find(
      (colonne) => /^(nom|libelle|intitule)(_|$)/.test(normaliser(colonne).replace(/ /g, "_")) && texte(colonne),
    ) ||
    (colAffichee && tableReference[colAffichee] ? colAffichee : null) ||
    colonnes.find(texte);
  return new Map(
    tableReference.id.map((id, i) => [id, colonneLibelle ? String(tableReference[colonneLibelle][i] ?? "") : ""]),
  );
}
async function resoudreRefsEtab() {
  let meta = null;
  try {
    meta = await metaColonnes(ETAB.table);
  } catch (_) {
    // structure illisible (lien d'établissement, règles d'accès) : on continue sans
  }
  if (!meta) return;
  const colsPerimetre =
    etatSaisie.perimetreBrut && !Array.isArray(etatSaisie.perimetreBrut) ? Object.keys(etatSaisie.perimetreBrut) : [];
  for (const colId of new Set(
    [
      ...Object.values(colonnesEtab),
      colonneRegion(),
      ...reglagesSaisie().fiche.map((champFiche) => colonneChampFiche(champFiche.col)),
      ...colsPerimetre,
    ].filter(Boolean),
  )) {
    const metaColonne = meta[colId];
    if (!metaColonne || typeBase(metaColonne.type) !== "Ref") continue;
    let libelles;
    try {
      libelles = await libellesTable(metaColonne.type.split(":")[1], metaColonne.colAffichee);
    } catch (_) {
      continue;
    } // table illisible : numéro conservé
    for (const etablissement of etatSaisie.etabs) {
      const valeur = etablissement[colId];
      if (typeof valeur === "number") etablissement[colId] = valeur ? libelles.get(valeur) || "" : "";
    }
  }
}

async function rafraichirEtabs(forcer) {
  if (!forcer && Date.now() - etatSaisie.dernierChargementEtabs < 600000) return; // grand référentiel : lecture coûteuse pour le serveur
  if (!forcer && etatSaisie.referentielDuCache && Date.now() - etatSaisie.referentielDuCache < DUREE_CACHE_REFERENTIEL)
    return; // copie du navigateur encore valable
  try {
    await chargerEtabs();
  } catch (erreur) {
    console.warn("Référentiel illisible", erreur);
  }
}
