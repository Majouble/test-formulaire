/* PRISME — widget de saisie, module 27/34 : Nouveau signalement : reprise des réponses d'un jour précédent.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* ---------- nouveau signalement : reprendre les réponses du signalement d'un jour précédent ---------- */
async function reprendreReponses(d) {
  const der = [...versionsDe(d)].sort(comparerVersions).pop();
  if (!der) return;
  cocherQualif(val(der, "Qualification"));
  if (col("Site") && val(der, "Site")) $("site").value = val(der, "Site");
  // pièces jointes : propres à chaque jour, jamais reprises d'un signalement précédent
  await remplirChamps("q", etatSaisie.defsQuestions, (def) =>
    typeBase(def.type) === "Attachments" ? null : der[def.colId],
  );
  // formulaire par site : le tableau des sites reprend les sites du signalement choisi, dans leur dernier état,
  // sauf reprise désactivée (réglage du tableau des sites) : il part vide
  let cs = sitesCtrl(),
    nbSites = null;
  if (cs && cs.sites.reprise === "non") {
    cs.lignes = [];
    cs.retires = [];
    cs.supprimes = [];
    cs.dessiner();
    cs = null;
  } else if (cs) nbSites = reprendreEtatSites(cs, refId(val(der, "Etablissement")), undefined, d);
  if (cs) {
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
    cs
      ? `Dernier état connu repris : ${nbSites} site${nbSites > 1 ? "s" : ""} (autres réponses : dossier n° ${d}, ${jourCourt(jourDesFaits(der))}). Confirmez ou modifiez chaque site, puis enregistrez ce nouveau signalement.`
      : `Réponses reprises du dossier n° ${d} (${jourCourt(jourDesFaits(der))}) : modifiez ce qui a changé, puis enregistrez ce nouveau signalement.`,
    "ok",
  );
  focusPremiereQuestion();
}
