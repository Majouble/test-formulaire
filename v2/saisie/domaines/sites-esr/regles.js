/* PRISME — widget de saisie, domaines/sites-esr/regles.js
   Domaine : le formulaire par site (enseignement supérieur) — règles (calculs, sans page ni Grist).
   Chargé par saisie/index.html dans l'ordre : fondations, composants, domaines, demarrage.js. Les fichiers partagent
   leurs noms (scripts classiques, sans import) : au chargement, un fichier ne fait que définir. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : sitesDeLEtablissement, formulaireParSite, modeRepriseSites, rangGravite, plusGrave, texteQualifSite,
     dernierEtatSites, qualifDesSites, ecartQualification, messagesControleSites.
   Utilise :
     fondations/outils : colonneDe, idDossierDe, listeQualif, refId, secondes, valeurLigne.
     fondations/etat : etatSaisie.
     composants/date-faits : lireDateFaits.
     composants/tableaux-structure : lireTableauJson.
     domaines/formulaire/regles : retourNormale.
     domaines/dossier/regles : comparerVersions, jourDeLaVersion, jourDuFormulaire.
     domaines/sites-esr/affichage : sitesCtrl. */
/* Sites proposés pour un établissement : les siens (ou, pour une composante, ceux qui la concernent) ; une composante ou un
   site sans site propre au référentiel reprend ceux de son établissement de rattachement. Le site déjà choisi reste. */
function sitesDeLEtablissement(definitionSite, idEtablissement, optionsSites, choisi) {
  if (definitionSite._inactifs && definitionSite._inactifs.size)
    optionsSites = optionsSites.filter((option) => !definitionSite._inactifs.has(option.id) || option.id === choisi);
  const sitesEtablissement = optionsSites.filter(
    (option) =>
      definitionSite._siteEtab.get(option.id) === idEtablissement ||
      (definitionSite._siteComp && definitionSite._siteComp.get(option.id) === idEtablissement) ||
      option.id === choisi,
  );
  const idParent = definitionSite._parent && definitionSite._parent.get(idEtablissement);
  const sitesRetenus =
    !idParent || sitesEtablissement.some((option) => option.id !== choisi)
      ? sitesEtablissement
      : optionsSites.filter((option) => definitionSite._siteEtab.get(option.id) === idParent || option.id === choisi);
  // dossier ouvert depuis une composante : ses sites d'abord
  const idComposante =
    etatSaisie.composanteChoisie && definitionSite._siteComp ? etatSaisie.composanteChoisie.id : null;
  return idComposante
    ? [
        ...sitesRetenus.filter((option) => definitionSite._siteComp.get(option.id) === idComposante),
        ...sitesRetenus.filter((option) => definitionSite._siteComp.get(option.id) !== idComposante),
      ]
    : sitesRetenus;
}
const formulaireParSite = () => etatSaisie.defsQuestions.some((question) => question.tableau && question.tableau.sites);
// reprise du dernier état des sites (réglage du tableau des sites) : "auto", "bouton" ou "non" (par défaut)
const modeRepriseSites = () => {
  const questionSites = etatSaisie.defsQuestions.find((question) => question.tableau && question.tableau.sites);
  if (!questionSites) return null;
  const reglageReprise = questionSites.tableau.sites.reprise;
  return reglageReprise === true || reglageReprise === "auto" ? "auto" : reglageReprise === "bouton" ? "bouton" : "non";
};
// rang de gravité d'une qualification : 0 = la plus grave (premier choix) ; retour à la normale en dernier
function rangGravite(qualification) {
  if (!qualification) return 1e9;
  if (retourNormale().has(String(qualification).trim().toUpperCase())) return 1e6;
  const i = etatSaisie.choix.indexOf(qualification);
  return i < 0 ? 5e5 : i;
}
const plusGrave = (liste) => [...liste].filter(Boolean).sort((a, b) => rangGravite(a) - rangGravite(b))[0] || null;
const texteQualifSite = (valeur) => listeQualif(valeur).join(", ");
/* Sites à reprendre pour un nouveau signalement (2.50) : ceux du dossier de l'établissement mis à jour le plus récemment,
   dans sa dernière version, et eux seuls (un site absent de ce dossier, signalé plus tôt dans un autre, n'est plus repris).
   dossierChoisi : signalement précis choisi par l'agent (« Reprendre » dans la proposition). */
function dernierEtatSites(controleur, etabId, avecRas, dossierChoisi = null) {
  const reglagesSites = controleur.sites,
    jour = jourDuFormulaire(),
    limite = colonneDe("Date_faits") && lireDateFaits() != null ? lireDateFaits() : Date.now() / 1000;
  const versions = etatSaisie.enregistrements.filter(
    (ligne) =>
      refId(valeurLigne(ligne, "Etablissement")) === etabId &&
      jourDeLaVersion(ligne) !== jour &&
      (secondes(colonneDe("Date_faits") ? valeurLigne(ligne, "Date_faits") : valeurLigne(ligne, "Date")) ?? 0) <
        limite + 86400,
  );
  const parDossier = new Map();
  versions.forEach((ligne) => {
    const dossierId = idDossierDe(ligne);
    if (!parDossier.has(dossierId)) parDossier.set(dossierId, []);
    parDossier.get(dossierId).push(ligne);
  });
  // lignes d'une version : la question elle-même, puis les questions des formulaires précédents (historique)
  const lignesDe = (ligne) => {
    const lignesSites = lireTableauJson(ligne[controleur.def.colId]).map((ligneJson) => {
      const { _id, ...valeursSite } = ligneJson;
      return valeursSite;
    });
    for (const historique of reglagesSites.historique)
      for (const ligneHistorique of lireTableauJson(ligne[historique.colonne]))
        lignesSites.push(controleur.vueHistorique(historique, ligneHistorique));
    return lignesSites;
  };
  const quandDe = (ligne) =>
    secondes(valeurLigne(ligne, "Date")) ?? secondes(colonneDe("Date_faits") ? valeurLigne(ligne, "Date_faits") : null);
  // dossier le plus récemment mis à jour (date de saisie de sa version la plus récente), puis sa dernière version
  let choisi = null;
  for (const [dossierId, lignesDuDossier] of parDossier) {
    if (dossierChoisi && dossierId !== dossierChoisi) continue; // signalement choisi dans la proposition de reprise
    const maj = Math.max(...lignesDuDossier.map((ligne) => quandDe(ligne) ?? 0)),
      der = [...lignesDuDossier].sort(comparerVersions).pop(),
      id = Math.max(...lignesDuDossier.map((ligne) => ligne.id));
    if (!choisi || maj > choisi.maj || (maj === choisi.maj && id > choisi.id)) choisi = { maj, der, id };
  }
  if (!choisi) return [];
  const der = choisi.der,
    quand = quandDe(der),
    dernier = new Map();
  for (const valeursSite of lignesDe(der)) {
    const k = controleur.cleSite(etabId, valeursSite);
    if (k)
      dernier.set(k, {
        cle: k,
        valeurs: valeursSite,
        qualif: reglagesSites.qualif ? texteQualifSite(valeursSite[reglagesSites.qualif]) : "",
        quand,
      });
  }
  const retour = retourNormale();
  const normal = (etatSite) =>
    !!etatSite.qualif &&
    listeQualif(etatSite.qualif).every((qualification) => retour.has(String(qualification).trim().toUpperCase()));
  // site désactivé depuis au référentiel (fermé, fusionné) : plus repris s'il est revenu à la normale
  const dSite =
      reglagesSites.site && controleur.sousDefs.find((sousQuestion) => sousQuestion.colId === reglagesSites.site),
    inactif = (etatSite) =>
      !!(dSite && dSite._inactifs && etatSite.cle.startsWith("s") && dSite._inactifs.has(+etatSite.cle.slice(1)));
  return [...dernier.values()]
    .filter((etatSite) => (avecRas || !normal(etatSite)) && !(inactif(etatSite) && normal(etatSite)))
    .map((etatSite) => ({ ...etatSite, normal: normal(etatSite) }));
}
function qualifDesSites() {
  const controleur = sitesCtrl();
  if (!controleur || !controleur.sites.qualif) return null;
  const qualifications = controleur
    .lignesValides()
    .flatMap((ligne) => listeQualif(ligne.valeurs[controleur.sites.qualif]));
  return { nb: controleur.lignesValides().length, plusGrave: plusGrave(qualifications) };
}
// Écart entre la qualification choisie et la plus grave des sites (valeur vraie s'il y a un écart)
function ecartQualification(syntheseSites, actuel) {
  return syntheseSites.plusGrave && actuel && actuel !== syntheseSites.plusGrave;
}
// Messages du contrôle avant enregistrement : qualification incohérente avec les sites, sites repris ni confirmés ni modifiés
function messagesControleSites(controleur, syntheseSites, actuel) {
  const messages = [];
  if (syntheseSites && syntheseSites.nb && syntheseSites.plusGrave && actuel !== syntheseSites.plusGrave)
    messages.push(
      `La qualification de l'établissement (${actuel || "aucune"}) ne correspond pas à celle du site le plus grave (${syntheseSites.plusGrave}).`,
    );
  const enAttente = controleur.lignes.filter(
    (ligne) => ligne._repris && ligne._repris.etat === "a_confirmer" && !controleur.ligneVide(ligne),
  ).length;
  if (enAttente)
    messages.push(
      `${enAttente} site${enAttente > 1 ? "s" : ""} repris du dernier état connu ${enAttente > 1 ? "n'ont été" : "n'a été"} ni confirmé${enAttente > 1 ? "s" : ""} ni modifié${enAttente > 1 ? "s" : ""}.`,
    );
  return messages;
}
