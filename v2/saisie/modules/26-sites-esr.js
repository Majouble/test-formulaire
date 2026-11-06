/* PRISME — widget de saisie, module 26/34 : Formulaire par site (enseignement supérieur).
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* ---------- Formulaire par site (enseignement supérieur) ----------
   Tableau des sites (réglage « sites » d'une question tableau) : chaque ligne est un site, avec sa qualification.
   - Reprise (2.50) : les sites du dossier de l'établissement mis à jour le plus récemment (jours antérieurs), dans sa
     dernière version, et eux seuls ; ceux revenus à la normale sont repris pour mémoire (sauf réglage contraire).
     Un site ne se retire pas d'un dossier : il passe en RAS (bouton « RAS » à la place de la suppression, pour les sites
     du dossier et les sites repris). Site saisi à tort : bouton « Supprimer » (🗑), qui l'efface de toutes les étapes
     du dossier à l'enregistrement (purgerSitesSupprimes).
   - Qualification de l'établissement : en bas du formulaire, déduite du site le plus grave (ordre des choix de la
     colonne Qualification, du plus grave au moins grave) ; contrôle de cohérence avant l'enregistrement. */
const sitesCtrl = () => controleursTableau("q").find((controleur) => controleur.sites && controleur.pret) || null;
const formulaireParSite = () => etatSaisie.defsQuestions.some((question) => question.tableau && question.tableau.sites);
// reprise du dernier état des sites (réglage du tableau des sites) : "auto", "bouton" ou "non" (par défaut)
const modeRepriseSites = () => {
  const questionSites = etatSaisie.defsQuestions.find((question) => question.tableau && question.tableau.sites);
  if (!questionSites) return null;
  const reglageReprise = questionSites.tableau.sites.reprise;
  return reglageReprise === true || reglageReprise === "auto" ? "auto" : reglageReprise === "bouton" ? "bouton" : "non";
};
const retourNormale = () =>
  new Set(
    (etatSaisie.socleGeneral.retour_normale && etatSaisie.socleGeneral.retour_normale.length
      ? etatSaisie.socleGeneral.retour_normale
      : ["RAS"]
    ).map((qualification) => String(qualification).trim().toUpperCase()),
  );
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
    colonneDossier = colonneDe("Dossier"),
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
    const dossierId = refId(colonneDossier && ligne[colonneDossier]) || ligne.id;
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
// préremplit le tableau des sites ; renvoie le nombre de sites repris
function reprendreEtatSites(controleur, etabId, avecRas = controleur.sites.avecRas !== false, dossier = null) {
  const etats = dernierEtatSites(controleur, etabId, avecRas, dossier),
    reglagesSites = controleur.sites;
  controleur.retires = [];
  controleur.supprimes = [];
  controleur.lignes = etats.map((etatSite) => {
    const valeursReprises = {};
    for (const sousQuestion of controleur.sousDefs)
      if (!sousQuestion.confidentiel && !videSous(etatSite.valeurs[sousQuestion.colId]))
        valeursReprises[sousQuestion.colId] = Array.isArray(etatSite.valeurs[sousQuestion.colId])
          ? [...etatSite.valeurs[sousQuestion.colId]]
          : etatSite.valeurs[sousQuestion.colId];
    if (reglagesSites.site && etatSite.cle.startsWith("s") && !refId(valeursReprises[reglagesSites.site])) {
      valeursReprises[reglagesSites.site] = +etatSite.cle.slice(1);
      if (reglagesSites.libre) delete valeursReprises[reglagesSites.libre];
    } // libellé rattaché au référentiel
    // site revenu à la normale : repris pour mémoire (une ligne par site connu), sans confirmation à donner
    return {
      _id: nouvelIdLigne(),
      valeurs: valeursReprises,
      _fixe: true,
      _repris: { qualif: etatSite.qualif, quand: etatSite.quand, etat: etatSite.normal ? "normal" : "a_confirmer" },
    };
  });
  controleur.lignes.forEach((ligne) => controleur.initAuto(ligne));
  controleur.dessiner();
  return etats.length;
}
function reprendreSitesAuto() {
  const controleur = sitesCtrl();
  if (!controleur || etatSaisie.dossierId || !etatSaisie.etabCourant || etatSaisie.modeEtab) return;
  const etablissementId = etatSaisie.etabCourant.id;
  if (etatSaisie.sitesAutoPour === etablissementId) return;
  const intactes = controleur.lignes.every(
    (ligne) => controleur.ligneVide(ligne) || (ligne._repris && !["modifie", "confirme"].includes(ligne._repris.etat)),
  );
  if (!intactes) return;
  etatSaisie.sitesAutoPour = etablissementId;
  if (controleur.sites.reprise === "non") {
    controleur.offreReprise = null;
    controleur.noteAuto = "";
    return;
  }
  if (controleur.sites.reprise === "bouton") {
    // reprise automatique désactivée (administration) : le tableau reste vide, la reprise est proposée par un bouton
    const nombreSitesProposes = dernierEtatSites(controleur, etablissementId, controleur.sites.avecRas).length;
    controleur.offreReprise = nombreSitesProposes ? { etab: etablissementId, n: nombreSitesProposes } : null;
    controleur.dessiner();
    return;
  }
  const nombreSitesRepris = reprendreEtatSites(controleur, etablissementId);
  controleur.noteAuto = nombreSitesRepris
    ? `${nombreSitesRepris} site${nombreSitesRepris > 1 ? "s" : ""} du dernier signalement de cet établissement, dans leur dernier état : confirmez ou modifiez ceux qui ne sont pas revenus à la normale, ajoutez les nouveaux.`
    : "";
  controleur.dessiner();
  etatSaisie.qualifTouchee = false;
  majQualifDeduite();
}
// qualification en bas (après les sites), et mention de la qualification déduite des sites
function placerQualification() {
  const fieldsetQualification = $("qualifs-initiales").closest("fieldset"),
    enBas = formulaireParSite() && reglagesSaisie().qualificationEnBas !== false;
  if (enBas) $("questions").after(fieldsetQualification);
  else $("bloc-date-faits").after(fieldsetQualification);
  fieldsetQualification.classList.toggle("qualif-deduite", enBas);
  let paragrapheQualification = $("qualif-sites");
  if (!paragrapheQualification) {
    paragrapheQualification = document.createElement("p");
    paragrapheQualification.id = "qualif-sites";
    paragrapheQualification.className = "aide qualif-sites";
    paragrapheQualification.setAttribute("aria-live", "polite");
    fieldsetQualification.appendChild(paragrapheQualification);
  }
  paragrapheQualification.hidden = !enBas;
  if (enBas) majQualifDeduite();
}
function qualifDesSites() {
  const controleur = sitesCtrl();
  if (!controleur || !controleur.sites.qualif) return null;
  const qualifications = controleur
    .lignesValides()
    .flatMap((ligne) => listeQualif(ligne.valeurs[controleur.sites.qualif]));
  return { nb: controleur.lignesValides().length, plusGrave: plusGrave(qualifications) };
}
function majQualifDeduite() {
  const paragrapheQualification = $("qualif-sites");
  if (!paragrapheQualification || paragrapheQualification.hidden) return;
  const syntheseSites = qualifDesSites();
  if (!syntheseSites || !syntheseSites.nb) {
    paragrapheQualification.textContent = "Déduite des sites : renseignez d'abord les sites et leur qualification.";
    paragrapheQualification.classList.remove("alerte-faits");
    return;
  }
  if (syntheseSites.plusGrave && !etatSaisie.qualifTouchee)
    cocherQualif(etatSaisie.qualifMultiple ? [syntheseSites.plusGrave] : syntheseSites.plusGrave);
  const actuel = plusGrave(listeQualif(lireQualificationInitiale()));
  const ecart = syntheseSites.plusGrave && actuel && actuel !== syntheseSites.plusGrave;
  paragrapheQualification.innerHTML = syntheseSites.plusGrave
    ? `Qualification la plus grave des sites : <strong>${esc(syntheseSites.plusGrave)}</strong>${ecart ? ` — différente de celle choisie (${esc(actuel)}) : vérifiez avant d'enregistrer. <button type="button" class="lien-texte" id="btn-qualif-sites">Reprendre ${esc(syntheseSites.plusGrave)}</button>` : etatSaisie.qualifTouchee ? "" : " (reprise automatiquement)"}`
    : "Aucun site n'a de qualification.";
  paragrapheQualification.classList.toggle("alerte-faits", !!ecart);
  const boutonReprendre = $("btn-qualif-sites");
  if (boutonReprendre)
    boutonReprendre.addEventListener("click", () => {
      etatSaisie.qualifTouchee = false;
      majQualifDeduite();
      etatSaisie.modifie = true;
    });
}
$("qualifs-initiales").addEventListener("change", () => {
  etatSaisie.qualifTouchee = true;
  majQualifDeduite();
});
// avant l'enregistrement : qualification incohérente avec les sites, sites repris ni confirmés ni modifiés
function controleSites() {
  const controleur = sitesCtrl();
  if (!controleur) return true;
  const msgs = [],
    syntheseSites = qualifDesSites(),
    actuel = plusGrave(listeQualif(lireQualificationInitiale()));
  if (syntheseSites && syntheseSites.nb && syntheseSites.plusGrave && actuel !== syntheseSites.plusGrave)
    msgs.push(
      `La qualification de l'établissement (${actuel || "aucune"}) ne correspond pas à celle du site le plus grave (${syntheseSites.plusGrave}).`,
    );
  const enAttente = controleur.lignes.filter(
    (ligne) => ligne._repris && ligne._repris.etat === "a_confirmer" && !controleur.ligneVide(ligne),
  ).length;
  if (enAttente)
    msgs.push(
      `${enAttente} site${enAttente > 1 ? "s" : ""} repris du dernier état connu ${enAttente > 1 ? "n'ont été" : "n'a été"} ni confirmé${enAttente > 1 ? "s" : ""} ni modifié${enAttente > 1 ? "s" : ""}.`,
    );
  return !msgs.length || confirm(`${msgs.join("\n\n")}\n\nEnregistrer quand même ?`);
}
