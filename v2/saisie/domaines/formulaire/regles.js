/* PRISME — widget de saisie, domaines/formulaire/regles.js
   Domaine : le formulaire de la page : choix du formulaire publié, questions, variantes EN / ESR, couleurs — règles
   (calculs, sans page ni Grist).
   Chargé par saisie/index.html dans l'ordre : fondations, composants, domaines, demarrage.js. Les fichiers partagent
   leurs noms (scripts classiques, sans import) : au chargement, un fichier ne fait que définir. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : commentaireActive, FICHE_DEFAUT, PRESETS, confSaisie, versionSaisie, varianteSaisie, appliquerModele,
     champWidget, avecRegles, defsDe, retenirFormulairePublie, calculerFormulaireActif, signatureDuFormulaire,
     reperesDepuisReglages, defDepuisBloc, PARTIES_DEFAUT, partiesDe, defsDepuisFormulaire, ROLES_SIGNALEMENT,
     reconnaitreColonnesSignalement, calculerAlerteStructureIllisible, calculerAlerteAutresFormulaires,
     calculerRolesColonnes, calculerAlerteFormulaireNonPublie, calculerAlertesColonnesEssentielles,
     calculerAlerteHorloge, calculerChoixQualification, calculerChampsVersion,
     calculerAlertesConditionsIntrouvables, stylePastille, carteOuiNon, CLES_DESCRIPTION, descriptionDuFormulaire,
     COULEURS_NOMMEES, hexVersRvb, versHex, teinteClaire, couleurNommee, nombreRegle, lireRegleCouleur,
     construireReglesCouleur, libelleDepuisCache, textesValeur, couleurDe, valeurLisible, couleurLigne,
     retourNormale, qualificationRetourNormale.
   Utilise :
     fondations/configuration : ETAB, TABLE_ETAB_DEFAUT.
     fondations/outils : celluleRemplie, colonneDe, dateFr, lisible, normColonne, sansGuillemets, secondes,
       texteComparable, typeBase.
     fondations/etat : etatSaisie.
     composants/champs : lireBorne.
     composants/conditions-formules : lireCondition, resoudreColonne.
     composants/recherche-etablissement : SOURCES.
     composants/tableaux-structure : lireRepereTableau.
     domaines/formulaire/donnees : cacheLibelles, libelleRef.
     domaines/dossier/regles : derniereDe.
     domaines/enregistrement/regles : dateParGrist.
   Modifie etatSaisie : decorsQ, reglesCouleur. */
// La zone « Commentaire de mise à jour » n'est pas affichée dans le formulaire.
// Le résumé automatique des modifications reste enregistré dans la colonne Commentaire (si elle est associée).
const commentaireActive = () => !!varianteSaisie().commentaire;
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
// Champ de ce formulaire (EN, ESR) : un agent mobilisé sur l'autre champ pendant le créneau en est averti
const champWidget = () => {
  try {
    return (window.Socle.CHAMPS.find((champ) => champ.version === varianteSaisie().version) || {}).id || "";
  } catch (_) {
    return "";
  }
};
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
// Retient le formulaire publié voulu par la page, sinon le premier formulaire publié (null si aucun)
function retenirFormulairePublie(formulaires, voulu) {
  const publies = formulaires.filter((formulaire) => typeof formulaire.publie === "string" && formulaire.publie.trim());
  return (voulu && publies.find((formulaire) => formulaire.nom === voulu)) || publies[0] || null;
}
// Calcule le formulaire actif (formulaire retenu et sa configuration publiée), null si la configuration est inutilisable
function calculerFormulaireActif(formulaireRetenu) {
  let configuration = null;
  if (formulaireRetenu) {
    try {
      configuration = JSON.parse(formulaireRetenu.publie);
    } catch (_) {
      configuration = null;
    }
  }
  return formulaireRetenu && configuration && Array.isArray(configuration.blocs)
    ? { ...formulaireRetenu, conf: configuration }
    : null;
}
// Calcule la signature (nom et contenu publié) d'un formulaire retenu, vide s'il n'y en a pas
function signatureDuFormulaire(formulaireRetenu) {
  return formulaireRetenu ? `${formulaireRetenu.nom}|${formulaireRetenu.publie}` : "";
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
// Calcule l'alerte « structure illisible » (null si la structure est lisible)
function calculerAlerteStructureIllisible() {
  return Object.keys(etatSaisie.metaSig).length
    ? null
    : "La structure du document n'est pas lisible depuis cette page. Responsable du document : ouvrez l'onglet « Établissements » de l'administration (ou republiez le formulaire) pour la mettre à disposition des liens d'accès.";
}
// Calcule l'alerte qui liste les formulaires publiés pour d'autres tables (null s'il n'y en a pas)
function calculerAlerteAutresFormulaires(formulaires) {
  const autres = formulaires.filter(
    (formulaire) =>
      formulaire.table &&
      formulaire.table !== etatSaisie.tableId &&
      typeof formulaire.publie === "string" &&
      formulaire.publie.trim(),
  );
  return autres.length
    ? `Ce widget est relié à la table « ${etatSaisie.tableId} », pour laquelle aucun formulaire n'est publié. ` +
        `Formulaire${autres.length > 1 ? "s" : ""} publié${autres.length > 1 ? "s" : ""} : ${autres.map((formulaire) => `« ${formulaire.nom} » (table ${formulaire.table})`).join(", ")}. ` +
        `Dans le panneau de droite de Grist, onglet « Données source », choisissez la table du formulaire voulu.`
    : null;
}
// Calcule les rôles de colonnes (reconnus, associés dans l'administration, associés dans le socle) et leurs alertes
function calculerRolesColonnes() {
  const alertes = [];
  // Colonnes non associées dans le panneau de Grist : reconnues d'après leur identifiant, leur libellé et leur type
  const colsParDefaut = reconnaitreColonnesSignalement(etatSaisie.metaSig);
  // Colonnes associées dans l'administration (« Colonnes de la table des réponses ») : elles priment sur la reconnaissance
  const rolesAdmin = {};
  const rolesAssocies = etatSaisie.formulaireActif && etatSaisie.formulaireActif.conf.roles;
  if (rolesAssocies && typeof rolesAssocies === "object") {
    for (const [role, colonne] of Object.entries(rolesAssocies)) {
      if (colonne === "") {
        rolesAdmin[role] = "";
        delete colsParDefaut[role];
      } else if (typeof colonne === "string" && etatSaisie.metaSig[colonne]) {
        rolesAdmin[role] = colonne;
        colsParDefaut[role] = colonne;
      } else if (typeof colonne === "string")
        alertes.push(
          `La colonne « ${colonne} » associée dans l'administration des formulaires n'existe plus dans la table « ${etatSaisie.tableId} » : choisissez-en une autre (panneau « Formulaire » › « Colonnes de la table des réponses »), puis publiez.`,
        );
    }
    // une colonne associée à un rôle n'en joue pas un autre par reconnaissance
    const imposees = new Set(Object.values(rolesAdmin).filter(Boolean));
    for (const role of Object.keys(colsParDefaut))
      if (!(role in rolesAdmin) && imposees.has(colsParDefaut[role])) delete colsParDefaut[role];
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
      if (role in rolesAdmin || typeof colonne !== "string" || !etatSaisie.metaSig[colonne]) continue;
      for (const k of Object.keys(colsParDefaut))
        if (k !== role && colsParDefaut[k] === colonne && !(k in rolesAdmin)) delete colsParDefaut[k];
      colsParDefaut[role] = colonne;
    }
  }
  return { colsParDefaut, rolesAdmin, alertes };
}
// Calcule l'alerte « formulaire jamais publié » et dit s'il faut retirer l'alerte « autres formulaires »
function calculerAlerteFormulaireNonPublie() {
  // Formulaire de cette table encore jamais publié : le dire plutôt que d'afficher l'ancien fonctionnement sans explication
  if (etatSaisie.formulaireActif) return { retirerAutres: false, alerte: null };
  const brouillons = etatSaisie.formulairesDispo.filter(
    (formulaire) => !(typeof formulaire.publie === "string" && formulaire.publie.trim()),
  );
  return {
    retirerAutres: brouillons.length > 0,
    alerte: brouillons.length
      ? `Le formulaire « ${brouillons[0].nom} » de la table « ${etatSaisie.tableId} » n'est pas encore publié : publiez-le dans l'administration des formulaires pour qu'il s'affiche ici.`
      : null,
  };
}
// Calcule les alertes sur les colonnes essentielles introuvables ou mal typées
function calculerAlertesColonnesEssentielles() {
  const alertes = [];
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
  return alertes;
}
// Calcule l'alerte sur la date de saisie fournie par l'horloge de l'ordinateur (vide si rien à signaler)
function calculerAlerteHorloge() {
  return colonneDe("Date") && etatSaisie.metaDate && !dateParGrist()
    ? `La date de saisie (« ${etatSaisie.metaDate.libelle || colonneDe("Date")} ») est fournie par l'horloge de chaque ordinateur : si l'une est déréglée, les dates seront fausses. ` +
        `Donnez-lui plutôt la formule d'initialisation NOW(), appliquée aux nouveaux enregistrements (Grist utilisera l'heure de son serveur).`
    : "";
}
// Calcule les choix, couleurs et mode (simple ou multiple) de la qualification d'après sa colonne
function calculerChoixQualification(metaQualification) {
  return {
    choix: (metaQualification && metaQualification.opts.choices) || [],
    couleurs: (metaQualification && metaQualification.opts.choiceOptions) || {},
    qualifMultiple: !!(metaQualification && (metaQualification.type || "").split(":")[0] === "ChoiceList"),
  };
}
// Calcule les champs versionnés de départ (description, site, qualification) dont l'historique retrace l'évolution
function calculerChampsVersion(metaQualification) {
  const champsVersion = [];
  if (colonneDe("Description") && etatSaisie.metaSig[colonneDe("Description")])
    champsVersion.push({ ...etatSaisie.metaSig[colonneDe("Description")], obligatoire: true, aide: "" });
  if (colonneDe("Site") && etatSaisie.metaSig[colonneDe("Site")])
    champsVersion.push({
      ...etatSaisie.metaSig[colonneDe("Site")],
      libelle: etatSaisie.metaSig[colonneDe("Site")].libelle || "Site / bâtiment",
      obligatoire: false,
      aide: "",
    });
  // Le type réel (Choice ou ChoiceList) est conservé, pour que le suivi propose le même mode de sélection.
  if (metaQualification)
    champsVersion.push({
      ...metaQualification,
      obligatoire: true,
      aide: "",
      type: etatSaisie.choix.length ? metaQualification.type : "Text",
    });
  return champsVersion;
}
// Calcule les alertes des conditions qui désignent une colonne introuvable (la question ne s'afficherait jamais)
function calculerAlertesConditionsIntrouvables() {
  const alertes = [];
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
  return alertes;
}
function stylePastille(choix) {
  const couleurChoix = etatSaisie.couleurs[choix] || {};
  return `--c:${couleurChoix.fillColor ? couleurChoix.textColor || "#161616" : "var(--bleu)"};--c-bg:${couleurChoix.fillColor || "var(--bleu-clair)"}`;
}
// Couleurs des boutons Oui / Non : celles du repère [couleur Oui=…, Non=…] s'il y en a un
function carteOuiNon(question) {
  const regleCouleur = lireRegleCouleur(question.description),
    carte = {};
  if (regleCouleur)
    for (const libelle of ["Oui", "Non"]) {
      const regle = regleCouleur.regles.find(
        (regleCandidate) =>
          (regleCandidate.type === "egal" && regleCandidate.valeur === texteComparable(libelle)) ||
          regleCandidate.type === "rempli",
      );
      const couleur = regle && regle.couleur,
        rvb = hexVersRvb(couleur);
      if (rvb)
        carte[libelle] = {
          fillColor: couleur,
          textColor: 0.299 * rvb[0] + 0.587 * rvb[1] + 0.114 * rvb[2] > 150 ? "#161616" : "#FFFFFF",
        };
    }
  return carte;
}
/* Description réglée dans l'administration des formulaires (« Réglages propres à ce formulaire ») :
   ces réglages remplacent les réglages communs (clé resume_auto de Config) pour la description et le résumé des mises à jour.
   Le format de chaque question vient de ses réglages dans le formulaire, celui des champs d'un tableau de descTableau. */
const CLES_DESCRIPTION = [
  "actif",
  "format",
  "separateur",
  "puce",
  "entete",
  "qualification",
  "questions",
  "mobilisation",
  "formatsType",
  "formatsQuestion",
  "formatsTableau",
];
function descriptionDuFormulaire() {
  const reglagesFormulaire =
    etatSaisie.formulaireActif && etatSaisie.formulaireActif.conf && etatSaisie.formulaireActif.conf.description;
  if (!reglagesFormulaire || !reglagesFormulaire.perso) return null;
  const reglages = { formatsQuestion: {}, formatsTableau: {} };
  for (const k of CLES_DESCRIPTION)
    if (k in reglagesFormulaire && reglagesFormulaire[k] != null) reglages[k] = reglagesFormulaire[k];
  for (const bloc of etatSaisie.formulaireActif.conf.blocs || []) {
    const reglagesTableau = bloc.reglages && bloc.reglages.descTableau;
    if (bloc.colonne && reglagesTableau && typeof reglagesTableau === "object" && Object.keys(reglagesTableau).length)
      reglages.formatsTableau[bloc.colonne] = reglagesTableau;
  }
  return reglages;
}
/* ---------- Couleur du formulaire selon une réponse ----------
   Repère [couleur] dans la description d'une colonne (qualification, question, ou toute autre colonne) :
   le formulaire prend la couleur du choix sélectionné, telle que définie dans Grist (couleur de fond du choix).
   [couleur Blocage=rouge, Intrusion=#e4794a] impose les couleurs (utile pour une case à cocher : [couleur Oui=rouge]).
   Plusieurs colonnes marquées : la qualification d'abord, puis les questions dans l'ordre du formulaire.
   Plusieurs valeurs cochées : la première dans l'ordre des choix de la colonne (placez les plus graves en tête). */
const COULEURS_NOMMEES = {
  rouge: "#ce0500",
  orange: "#e4794a",
  jaune: "#f5c400",
  vert: "#18753c",
  bleu: "#000091",
  violet: "#6a1b9a",
  rose: "#e18b9f",
  gris: "#777777",
  noir: "#161616",
  marron: "#8a4b00",
  brun: "#8a4b00",
  turquoise: "#009081",
};
function hexVersRvb(codeHex) {
  const correspondanceCode = String(codeHex || "")
    .trim()
    .match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!correspondanceCode) return null;
  const hexLong =
    correspondanceCode[1].length === 3
      ? [...correspondanceCode[1]].map((caractere) => caractere + caractere).join("")
      : correspondanceCode[1];
  return [0, 2, 4].map((i) => parseInt(hexLong.slice(i, i + 2), 16));
}
const versHex = (composantes) =>
  "#" + composantes.map((composante) => Math.round(composante).toString(16).padStart(2, "0")).join("");
function teinteClaire(codeHex, part) {
  // mélange avec du blanc : part = proportion de la couleur
  const composantes = hexVersRvb(codeHex);
  return composantes ? versHex(composantes.map((composante) => composante * part + 255 * (1 - part))) : null;
}
function couleurNommee(texte) {
  const texteCouleur = sansGuillemets(texte);
  if (COULEURS_NOMMEES[texteComparable(texteCouleur)]) return COULEURS_NOMMEES[texteComparable(texteCouleur)];
  const composantes = hexVersRvb(texteCouleur);
  return composantes ? versHex(composantes) : null;
}
/* Règles d'un repère [couleur …], dans l'ordre où elles sont écrites (la première qui s'applique l'emporte) :
     Blocage=rouge          valeur exacte
     >50=rouge, >=10=orange comparaison (nombres ; pour une date : >0 = date renseignée, ou >2026-09-01, <01/10/2026)
     renseigné=rouge        n'importe quelle valeur (aussi : rempli, non vide, *)
     vide=gris              aucune valeur */
function nombreRegle(texte) {
  const texteNettoye = String(texte).trim();
  let correspondance;
  if ((correspondance = texteNettoye.match(/^(\d{4})-(\d{2})-(\d{2})$/)))
    return Date.UTC(+correspondance[1], correspondance[2] - 1, +correspondance[3]) / 1000;
  if ((correspondance = texteNettoye.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)))
    return Date.UTC(+correspondance[3], correspondance[2] - 1, +correspondance[1]) / 1000;
  const nombre = parseFloat(texteNettoye.replace(/\s/g, "").replace(",", "."));
  return isNaN(nombre) ? null : nombre;
}
function lireRegleCouleur(description) {
  const correspondanceRepere = String(description || "").match(/\[\s*couleurs?\b([^\]]*)\]/i);
  if (!correspondanceRepere) return null;
  const regles = [];
  // séparateur « , » ou « ; » — sauf la virgule décimale d'un seuil (« >2,5=rouge »)
  for (const regleBrute of correspondanceRepere[1].split(/\s*;\s*|\s*,\s*(?!\d+\s*[=:])/)) {
    let k = regleBrute.lastIndexOf("=");
    if (k < 0) k = regleBrute.lastIndexOf(":");
    if (k <= 0) continue;
    const couleur = couleurNommee(regleBrute.slice(k + 1));
    if (!couleur) continue;
    const brut = sansGuillemets(regleBrute.slice(0, k)),
      cle = texteComparable(brut);
    let correspondanceComparaison;
    if (
      (correspondanceComparaison = brut.match(/^(>=|<=|!=|≠|≥|≤|>|<)\s*(.+)$/)) &&
      nombreRegle(correspondanceComparaison[2]) != null
    )
      regles.push({
        type: "cmp",
        op: { "≠": "!=", "≥": ">=", "≤": "<=" }[correspondanceComparaison[1]] || correspondanceComparaison[1],
        n: nombreRegle(correspondanceComparaison[2]),
        couleur,
      });
    else if (/^(renseigne|renseignee|rempli|remplie|non vide|n est pas vide|\*)$/.test(cle))
      regles.push({ type: "rempli", couleur });
    else if (/^(est )?vide$/.test(cle)) regles.push({ type: "vide", couleur });
    else regles.push({ type: "egal", valeur: cle, couleur });
  }
  return { regles };
}
function construireReglesCouleur(alertes) {
  etatSaisie.reglesCouleur = [];
  const vus = new Set();
  const ajouter = (definitionColonne, genre) => {
    if (!definitionColonne || vus.has(definitionColonne.colId)) return;
    const reglesLues = lireRegleCouleur(definitionColonne.description);
    if (!reglesLues) return;
    vus.add(definitionColonne.colId);
    etatSaisie.reglesCouleur.push({ def: definitionColonne, genre, regles: reglesLues.regles });
    const couleursGrist = Object.values((definitionColonne.opts && definitionColonne.opts.choiceOptions) || {}).some(
      (optionChoix) => optionChoix && hexVersRvb(optionChoix.fillColor),
    );
    if (!reglesLues.regles.length && !couleursGrist)
      alertes.push(
        `La colonne « ${definitionColonne.libelle || definitionColonne.colId} » porte le repère [couleur], mais ses choix n'ont pas de couleur dans Grist : ` +
          `donnez une couleur de fond à ses choix, ou indiquez-les dans le repère, par exemple [couleur Blocage=rouge, Tentative=orange].`,
      );
  };
  ajouter(etatSaisie.metaSig[colonneDe("Qualification")], "qualification");
  etatSaisie.defsQuestions.forEach((definitionColonne) => ajouter(definitionColonne, "question"));
  Object.values(etatSaisie.metaSig).forEach((definitionColonne) => ajouter(definitionColonne, "colonne"));
}
// Lit le libellé d'une référence dans les libellés de la colonne ou le cache ({ libelle }), null si le cache n'est pas rempli
function libelleDepuisCache(definitionColonne, id) {
  if (definitionColonne._labels && definitionColonne._labels.has(id))
    return { libelle: definitionColonne._labels.get(id) };
  const libellesColonne = cacheLibelles.get(definitionColonne.colId);
  if (libellesColonne) return { libelle: libellesColonne.get(id) || `n° ${id}` };
  return null;
}
// Valeur Grist -> textes affichés (une liste, pour les choix multiples)
function textesValeur(definitionColonne, valeur) {
  if (valeur == null || valeur === "" || !lisible(valeur)) return [];
  const typeDeBase = typeBase(definitionColonne.type);
  if (typeDeBase === "Bool") return [valeur ? "Oui" : "Non"];
  if (typeDeBase === "Date" || typeDeBase === "DateTime") {
    const secondesValeur = secondes(valeur);
    return secondesValeur == null ? [] : [String(secondesValeur)];
  }
  if (Array.isArray(valeur)) {
    if (valeur[0] === "L")
      return valeur
        .slice(1)
        .map((identifiant) =>
          typeDeBase === "RefList" ? libelleRef(definitionColonne, identifiant) : String(identifiant),
        );
    if (valeur[0] === "R") return valeur[2] ? [libelleRef(definitionColonne, valeur[2])] : [];
    return [];
  }
  if (typeDeBase === "Ref") return valeur ? [libelleRef(definitionColonne, valeur)] : [];
  return [String(valeur)];
}
function couleurDe(regleCouleur, textes) {
  const ordre = (regleCouleur.def.opts && regleCouleur.def.opts.choices) || [];
  const rang = (texte) => {
    const i = ordre.indexOf(texte);
    return i < 0 ? 1e9 : i;
  };
  const tries = [...textes].sort((a, b) => rang(a) - rang(b));
  const resultatCouleur = (fond, valeur) =>
    hexVersRvb(fond) ? { fond: versHex(hexVersRvb(fond)), valeur: valeur, def: regleCouleur.def } : null;
  if (regleCouleur.regles.length) {
    if (!textes.length) {
      const regleVide = regleCouleur.regles.find((regle) => regle.type === "vide");
      return regleVide ? resultatCouleur(regleVide.couleur, null) : null;
    }
    for (const regle of regleCouleur.regles)
      for (const texte of tries) {
        let regleApplicable = false;
        if (regle.type === "egal") regleApplicable = texteComparable(texte) === regle.valeur;
        else if (regle.type === "rempli") regleApplicable = true;
        else if (regle.type === "cmp") {
          const nombre = parseFloat(String(texte).replace(",", "."));
          regleApplicable =
            !isNaN(nombre) &&
            (regle.op === ">"
              ? nombre > regle.n
              : regle.op === ">="
                ? nombre >= regle.n
                : regle.op === "<"
                  ? nombre < regle.n
                  : regle.op === "<="
                    ? nombre <= regle.n
                    : nombre !== regle.n);
        }
        if (regleApplicable) return resultatCouleur(regle.couleur, texte);
      }
    return null;
  }
  for (const texte of tries) {
    const couleurTrouvee = resultatCouleur(
      (((regleCouleur.def.opts && regleCouleur.def.opts.choiceOptions) || {})[texte] || {}).fillColor,
      texte,
    );
    if (couleurTrouvee) return couleurTrouvee;
  }
  return null;
}
// Valeur montrée dans l'étiquette de couleur (date lisible, nombre à la française)
function valeurLisible(definitionColonne, valeur) {
  if (valeur == null) return "(vide)";
  const typeDeBase = typeBase(definitionColonne.type);
  if (typeDeBase === "Date" || typeDeBase === "DateTime")
    return dateFr(Number(valeur), { ...definitionColonne, type: definitionColonne.type || "Date" });
  if ((typeDeBase === "Numeric" || typeDeBase === "Int") && !isNaN(parseFloat(valeur)))
    return parseFloat(valeur).toLocaleString("fr-FR");
  return valeur;
}
function couleurLigne(dossier) {
  if (!etatSaisie.reglesCouleur.length) return null;
  const der = derniereDe(dossier);
  for (const regleCouleur of etatSaisie.reglesCouleur) {
    const couleurTrouvee = couleurDe(regleCouleur, textesValeur(regleCouleur.def, der[regleCouleur.def.colId]));
    if (couleurTrouvee) return couleurTrouvee;
  }
  return null;
}
const retourNormale = () =>
  new Set(
    (etatSaisie.socleGeneral.retour_normale && etatSaisie.socleGeneral.retour_normale.length
      ? etatSaisie.socleGeneral.retour_normale
      : ["RAS"]
    ).map((qualification) => String(qualification).trim().toUpperCase()),
  );
// Valeur de qualification « retour à la normale » proposée par le formulaire (RAS par défaut)
function qualificationRetourNormale() {
  const valeursRetourNormale = retourNormale(),
    trouve = (etatSaisie.choix || []).find((choix) => valeursRetourNormale.has(String(choix).trim().toUpperCase()));
  return trouve || (etatSaisie.choix && etatSaisie.choix.length ? null : "RAS");
}
