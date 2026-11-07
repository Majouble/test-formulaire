/* PRISME — widget de saisie, domaines/formulaire/donnees.js
   Domaine : le formulaire de la page : choix du formulaire publié, questions, variantes EN / ESR, couleurs —
   données (lectures et écritures du document).
   Chargé par saisie/index.html dans l'ordre : fondations, composants, domaines, demarrage.js. Les fichiers partagent
   leurs noms (scripts classiques, sans import) : au chargement, un fichier ne fait que définir. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : lireFormulaires, listerFormulairesDeLaTable, lireOptionFormulaireVoulu, lireOptionsPageGrist,
     choisirFormulaire, verifierFormulairePublie, chargerConfiguration, lancerLecturesConfiguration,
     lireStructureTableReponses, lireAlerteAutresFormulaires, attendreProfilEtReglages, chargerConfigurationEtapes,
     cacheLibelles, libellesDemandes, chargerLibellesReference, libelleRef.
   Utilise :
     fondations/etat : etatSaisie.
     fondations/grist : lireMeta, lireSocleSaisie, metaColonnes.
     fondations/reglages : chargerReglages.
     composants/champs : optionsReference.
     composants/pieces-jointes : completerPjCopie.
     domaines/agent/donnees : chargerProfil, chargerProfilViseur, majCreneau.
     domaines/formulaire/regles : calculerAlerteAutresFormulaires, calculerAlerteFormulaireNonPublie,
       calculerAlerteStructureIllisible, calculerAlertesColonnesEssentielles, calculerAlertesConditionsIntrouvables,
       calculerFormulaireActif, calculerRolesColonnes, libelleDepuisCache, retenirFormulairePublie,
       signatureDuFormulaire.
     domaines/formulaire/affichage : afficherAlertes, afficherReferentielQuandPret, appliquerReglagesPage,
       construireQuestionsPage, dessinerChampsPage, majCouleur, rafraichirApresLibellesReference,
       relancerChargementConfiguration, remplirPageDepuisStructure.
     domaines/etablissement/regles : trouverColNomReponses.
     domaines/etablissement/donnees : chargerEtabs, determinerTableEtab.
     domaines/etablissement/affichage : majAlertePageEtab.
     domaines/dossier/affichage : preparerNouveauSignalement.
     demarrage : signalerErreurChargement.
   Modifie etatSaisie : agentPage, colsParDefaut, dernierControleFormulaire, formulaireActif, formulairesDispo,
     libellePage, metaSig, pageEtab, perimetreBrut, perimetreFiche, promesseMeta, rolesAdmin, signatureFormulaire,
     tableId, versionPage. */
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
// Lit les formulaires de la table des réponses de cette page
async function listerFormulairesDeLaTable() {
  return (await lireFormulaires()).filter((formulaire) => formulaire.table === etatSaisie.tableId);
}
// Lit l'option « formulaire » de la page (null si absente ou hors de Grist)
async function lireOptionFormulaireVoulu() {
  let voulu = null;
  try {
    voulu = grist.getOption ? await grist.getOption("formulaire") : null;
  } catch (_) {
    // option absente ou page ouverte hors de Grist : formulaire par défaut
  }
  return voulu;
}
// Lit les autres options de la page (version, périmètre, libellé, agent, établissements) dans l'état
async function lireOptionsPageGrist() {
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
}
async function choisirFormulaire() {
  etatSaisie.formulairesDispo = await listerFormulairesDeLaTable();
  const voulu = await lireOptionFormulaireVoulu();
  await lireOptionsPageGrist();
  majAlertePageEtab();
  if (etatSaisie.agentPage != null && typeof etatSaisie.agentPage !== "number")
    etatSaisie.agentPage = Number(etatSaisie.agentPage) || null;
  etatSaisie.perimetreFiche = etatSaisie.perimetreBrut;
  const formulaireRetenu = retenirFormulairePublie(etatSaisie.formulairesDispo, voulu);
  etatSaisie.formulaireActif = calculerFormulaireActif(formulaireRetenu);
  etatSaisie.signatureFormulaire = signatureDuFormulaire(formulaireRetenu);
  await majCreneau(false);
  return etatSaisie.formulaireActif;
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
  const liste = await listerFormulairesDeLaTable();
  const voulu = await lireOptionFormulaireVoulu();
  const formulaireRetenu = retenirFormulairePublie(liste, voulu);
  const signature = signatureDuFormulaire(formulaireRetenu);
  if (signature !== avant) relancerChargementConfiguration();
}
async function chargerConfiguration() {
  try {
    await chargerConfigurationEtapes();
  } catch (erreur) {
    signalerErreurChargement(erreur, "chargement de la configuration");
  }
}
// Lance les lectures qui partent en même temps (structure du document, profil, réglages) et renvoie leurs promesses
function lancerLecturesConfiguration() {
  etatSaisie.metaSig = {};
  // Toutes les lectures partent en même temps : le temps d'attente est celui de la plus longue,
  // et non plus leur somme. Le référentiel, le plus lourd, est attendu à part (voir plus bas).
  etatSaisie.promesseMeta = null;
  lireMeta().catch(() => {});
  const pProfil = chargerProfil();
  const pReglages = chargerReglages();
  return { pProfil, pReglages };
}
// Lit la table liée au widget et la structure de ses colonnes
async function lireStructureTableReponses() {
  etatSaisie.tableId = await grist.getTable().getTableId();
  etatSaisie.metaSig = (await metaColonnes(etatSaisie.tableId).catch(() => null)) || {};
  if (etatSaisie.metaCopie) await completerPjCopie(etatSaisie.tableId, etatSaisie.metaSig);
}
// Lit les formulaires des autres tables quand aucun n'est publié pour la table liée, et alerte s'il en existe
async function lireAlerteAutresFormulaires(alertes) {
  // Aucun formulaire publié pour la table liée : on indique ceux qui existent, et la table à choisir
  if (!etatSaisie.formulaireActif) {
    const alerteAutres = calculerAlerteAutresFormulaires(await lireFormulaires());
    if (alerteAutres) alertes.unshift(alerteAutres);
  }
}
// Attend les lectures du profil et des réglages, puis lit le profil du viseur
async function attendreProfilEtReglages(pProfil, pReglages) {
  await Promise.all([pProfil, pReglages]);
  await chargerProfilViseur();
}
async function chargerConfigurationEtapes() {
  const alertes = [];
  await lireSocleSaisie();
  const { pProfil, pReglages } = lancerLecturesConfiguration();
  try {
    await lireStructureTableReponses();
    const alerteStructure = calculerAlerteStructureIllisible();
    if (alerteStructure) alertes.push(alerteStructure);
    await choisirFormulaire();
    await lireAlerteAutresFormulaires(alertes);
    const roles = calculerRolesColonnes();
    etatSaisie.colsParDefaut = roles.colsParDefaut;
    etatSaisie.rolesAdmin = roles.rolesAdmin;
    alertes.push(...roles.alertes);
    trouverColNomReponses();
    const nonPublie = calculerAlerteFormulaireNonPublie();
    if (nonPublie.retirerAutres) {
      const i = alertes.findIndex((alerte) => alerte.startsWith("Ce widget est relié à la table"));
      if (i >= 0) alertes.splice(i, 1);
    }
    if (nonPublie.alerte) alertes.unshift(nonPublie.alerte);
    alertes.push(...calculerAlertesColonnesEssentielles());
  } catch (erreur) {
    console.warn("Métadonnées illisibles", erreur);
  }
  await determinerTableEtab(); // après les rôles : la colonne de l'établissement désigne le référentiel
  const pEtabs = chargerEtabs(true).then(
    () => null,
    (erreur) => erreur,
  );

  const metaQualification = remplirPageDepuisStructure();
  construireQuestionsPage(alertes, metaQualification);
  dessinerChampsPage();

  await attendreProfilEtReglages(pProfil, pReglages);
  appliquerReglagesPage();
  alertes.push(...calculerAlertesConditionsIntrouvables());
  afficherAlertes(alertes);

  await afficherReferentielQuandPret(pEtabs, alertes);
  if (!etatSaisie.dossierId) await preparerNouveauSignalement();
  majCouleur();
}
// Libellés des colonnes Référence (lus une fois, à la demande)
const cacheLibelles = new Map(),
  libellesDemandes = new Set();
// Lit les options de la colonne Référence dans le document et remplit le cache des libellés
function chargerLibellesReference(definitionColonne) {
  return optionsReference({ ...definitionColonne }).then((options) => {
    cacheLibelles.set(definitionColonne.colId, new Map(options.map((option) => [option.id, option.libelle])));
  });
}
function libelleRef(definitionColonne, id) {
  const connu = libelleDepuisCache(definitionColonne, id);
  if (connu) return connu.libelle;
  if (!libellesDemandes.has(definitionColonne.colId) && /^Ref(List)?:/.test(definitionColonne.type || "")) {
    libellesDemandes.add(definitionColonne.colId);
    chargerLibellesReference(definitionColonne)
      .then(rafraichirApresLibellesReference)
      .catch(() => {});
  }
  return `n° ${id}`;
}
