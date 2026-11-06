/* PRISME — widget de saisie, module 27/34 : Nouveau signalement : reprise des réponses d'un jour précédent.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* ---------- nouveau signalement : reprendre les réponses du signalement d'un jour précédent ---------- */
async function reprendreReponses(dossierId) {
  const der = [...versionsDe(dossierId)].sort(comparerVersions).pop();
  if (!der) return;
  cocherQualif(valeurLigne(der, "Qualification"));
  if (colonneDe("Site") && valeurLigne(der, "Site")) $("site").value = valeurLigne(der, "Site");
  // pièces jointes : propres à chaque jour, jamais reprises d'un signalement précédent
  await remplirChamps("q", etatSaisie.defsQuestions, (question) =>
    typeBase(question.type) === "Attachments" ? null : der[question.colId],
  );
  // formulaire par site : le tableau des sites reprend les sites du signalement choisi, dans leur dernier état,
  // sauf reprise désactivée (réglage du tableau des sites) : il part vide
  let controleurSites = sitesCtrl(),
    nbSites = null;
  if (controleurSites && controleurSites.sites.reprise === "non") {
    controleurSites.lignes = [];
    controleurSites.retires = [];
    controleurSites.supprimes = [];
    controleurSites.dessiner();
    controleurSites = null;
  } else if (controleurSites)
    nbSites = reprendreEtatSites(controleurSites, refId(valeurLigne(der, "Etablissement")), undefined, dossierId);
  if (controleurSites) {
    etatSaisie.qualifTouchee = false;
    majQualifDeduite();
  }
  appliquerConditions("q", etatSaisie.defsQuestions);
  etatSaisie.descriptionManuelle = false;
  majDescriptionAuto();
  if (typeof majCouleur === "function") majCouleur();
  etatSaisie.modifie = true;
  etatSaisie.propositionMasquee = etatSaisie.etabCourant ? etatSaisie.etabCourant.id : null;
  majProposition();
  statut(
    "statut-signalement",
    controleurSites
      ? `Dernier état connu repris : ${nbSites} site${nbSites > 1 ? "s" : ""} (autres réponses : dossier n° ${dossierId}, ${jourCourt(jourDesFaits(der))}). Confirmez ou modifiez chaque site, puis enregistrez ce nouveau signalement.`
      : `Réponses reprises du dossier n° ${dossierId} (${jourCourt(jourDesFaits(der))}) : modifiez ce qui a changé, puis enregistrez ce nouveau signalement.`,
    "ok",
  );
  focusPremiereQuestion();
}
