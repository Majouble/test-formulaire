/* PRISME — widget de saisie, module 15/34 : Onglets, affichage du dossier, en-tête.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : afficherOnglet, reinitialiserEtatCreation, preparerNouveauSignalement, afficherDossier,
     focusPremiereQuestion, diagnostiquerFaitsAnterieurs, avertirFaitsAnterieurs.
   Utilise :
     01 configuration : commentaireActive.
     02 utilitaires : colonnesEtab.
     03 variantes : CHAMPS_NOUVEL_ETAB, statut.
     04 date-faits : dateFaitsFuture, dateFr, initialiserDateFaits, lireDateFaits, secondes.
     05 etat : colonneDe, etatSaisie, valeurLigne.
     06 grist : enFile.
     07 formulaires : rafraichirEtabs.
     09 dossier : cocherQualif, jourDesFaits, listeQualif, styleChoix.
     10 champs : remplirChamps.
     13 coherence : appliquerConditions.
     14 etablissement : afficherEtablissement.
     16 description : jourFaits, majDescriptionAuto, verifierDoublons.
     18 liste-dossiers : majListeDossiers.
     23 couleurs : majCouleur.
     25 plusieurs-jours : UN_JOUR, aideFaitsDefaut, jourCle, jourCourt, joursSuivants, majAideJours,
       reinitialiserJours.
     26 sites-esr : majQualifDeduite.
     28 enregistrement : remplirFormulaire.
     29 historique : afficherHistorique.
     30 visas : statutDe.
     31 autocompletion : fermerSuggestions.
     34 parcours : allerNouveau, majModeSaisie, majProposition.
   Modifie etatSaisie : dateFaitsTouchee, derniere, descriptionManuelle, dossierId, doublonConfirme, etabCourant,
     initiale, ligneAnnuaire, modifie, modifieVisa, qualifTouchee, sitesAutoPour, versions. */
/* =========================================================
   Onglets, modes et en-tête
   ========================================================= */
function afficherOnglet(nom) {
  ["signalement", "historique", "visas"].forEach((onglet) => {
    $(`onglet-${onglet}`).setAttribute("aria-selected", String(onglet === nom));
    $(`onglet-${onglet}`).tabIndex = onglet === nom ? 0 : -1; // seul l'onglet actif est dans l'ordre de tabulation
    $(`panneau-${onglet}`).hidden = onglet !== nom;
  });
}
// Clavier : flèches gauche/droite, Début et Fin passent d'un onglet visible à l'autre
$("onglets").addEventListener("keydown", (evenement) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(evenement.key)) return;
  const visibles = [...$("onglets").querySelectorAll('[role="tab"]')].filter((onglet) => !onglet.hidden);
  const i = visibles.indexOf(document.activeElement);
  if (i < 0) return;
  evenement.preventDefault();
  const j =
    evenement.key === "Home"
      ? 0
      : evenement.key === "End"
        ? visibles.length - 1
        : (i + (evenement.key === "ArrowRight" ? 1 : -1) + visibles.length) % visibles.length;
  const cible = visibles[j];
  afficherOnglet(cible.id.replace("onglet-", ""));
  cible.focus();
});
["signalement", "historique", "visas"].forEach((onglet) =>
  $(`onglet-${onglet}`).addEventListener("click", () => afficherOnglet(onglet)),
);

// Remet à zéro l'état du dossier courant pour un nouveau signalement
function reinitialiserEtatCreation() {
  etatSaisie.dossierId = null;
  etatSaisie.versions = [];
  etatSaisie.initiale = null;
  etatSaisie.derniere = null;
  etatSaisie.doublonConfirme = null; // chaque nouveau signalement demande sa propre confirmation
  etatSaisie.qualifTouchee = false; // formulaire par site : qualification déduite des sites
  etatSaisie.sitesAutoPour = null; // formulaire par site : reprise automatique des sites connus
}
async function preparerNouveauSignalement() {
  reinitialiserEtatCreation();
  queueMicrotask(() => {
    if (typeof majQualifDeduite === "function") majQualifDeduite();
  });
  rafraichirEtabs(false); // sans attendre : sert seulement à la recherche d'établissement
  etatSaisie.etabCourant = etatSaisie.modeEtab ? etatSaisie.etabs[0] || null : null;
  etatSaisie.ligneAnnuaire = null;
  ["nom", ...CHAMPS_NOUVEL_ETAB, "description", "site"].forEach((k) => {
    $(k).value = "";
    $(k).classList.remove("auto");
  });
  $("mail").dataset.saisi = "";
  cocherQualif("");
  initialiserDateFaits(null);
  delete $("aide-date-faits").dataset.base;
  $("aide-date-faits").classList.remove("alerte-faits");
  $("aide-date-faits").textContent = aideFaitsDefaut();
  reinitialiserJours();
  await remplirChamps("q", etatSaisie.defsQuestions, () => null);
  appliquerConditions("q", etatSaisie.defsQuestions);
  etatSaisie.descriptionManuelle = false;
  majDescriptionAuto();
  $("commentaire").value = "";
  $("bloc-commentaire").hidden = true;
  etatSaisie.modifie = etatSaisie.modifieVisa = false;
  $("titre").textContent = "Nouveau signalement";
  $("sous-titre").textContent = etatSaisie.modeEtab ? "" : "Identifiez l'établissement par son nom ou son UAI.";
  $("btn-signalement").textContent = "Enregistrer le signalement";
  $("btn-corriger").hidden = true;
  $("aide-correction").hidden = true;
  $("btn-effacer").textContent = "Effacer";
  $("btn-nouveau").hidden = true;
  $("onglets").hidden = true;
  majListeDossiers();
  majModeSaisie();
  afficherOnglet("signalement");
  afficherEtablissement();
  majCouleur();
}

function afficherDossier() {
  $("alerte-doublon").hidden = true;
  $("btn-signalement").textContent = "Enregistrer la mise à jour";
  $("btn-corriger").hidden = false;
  $("aide-correction").hidden = false;
  $("btn-effacer").textContent = "Revenir à l'état actuel";
  $("bloc-commentaire").hidden = !(commentaireActive() && colonneDe("Commentaire"));
  $("btn-nouveau").hidden = false;
  $("onglets").hidden = false;
  $("nb-suivis").textContent = Math.max(0, etatSaisie.versions.length - 1);

  const qDerniere = listeQualif(valeurLigne(etatSaisie.derniere, "Qualification"));
  const qList = qDerniere.length ? qDerniere : listeQualif(valeurLigne(etatSaisie.initiale, "Qualification"));
  $("titre").textContent = `${etatSaisie.etabCourant ? etatSaisie.etabCourant[colonnesEtab.nom] : "Signalement"} `;
  qList.forEach((qualification) => {
    const pastille = document.createElement("span");
    pastille.className = "pastille";
    pastille.textContent = qualification;
    pastille.title = "Qualification actuelle";
    styleChoix(pastille, qualification);
    $("titre").appendChild(pastille);
  });
  const stV = !etatSaisie.modeEtab ? statutDe(etatSaisie.derniere) : "";
  if (stV) {
    const styleStatut =
        (window.Socle.STATUTS_VALIDATION || []).find((statutValidation) => statutValidation.nom === stV) || {},
      pastilleStatut = document.createElement("span");
    pastilleStatut.className = "pastille pastille-statut";
    pastilleStatut.textContent = stV;
    pastilleStatut.title = "Statut de validation (visas)";
    if (styleStatut.fond) {
      pastilleStatut.style.setProperty("--c-bg", styleStatut.fond);
      pastilleStatut.style.setProperty("--c", styleStatut.texte);
    }
    $("titre").appendChild(pastilleStatut);
  }
  const dInit = valeurLigne(etatSaisie.initiale, "Date");
  const texteCreation = secondes(dInit) != null ? `, créé le ${dateFr(dInit, etatSaisie.metaDate)}` : "";
  const nombreMisesAJour = etatSaisie.versions.length - 1;
  const site = colonneDe("Site") ? String(valeurLigne(etatSaisie.derniere, "Site") || "").trim() : "";
  $("sous-titre").textContent =
    `${texteCreation ? "Signalé" + texteCreation.replace(/^, créé/, "") : `Dossier n° ${etatSaisie.dossierId}`}${site ? ` · site « ${site} »` : ""} · ${nombreMisesAJour === 0 ? "aucune mise à jour" : nombreMisesAJour === 1 ? "1 mise à jour" : nombreMisesAJour + " mises à jour"}.`;
  afficherEtablissement();
  afficherHistorique();
  majListeDossiers();
  majModeSaisie();
}

// Premier champ à remplir après l'établissement : la qualification, sinon la première question
// visible, et en dernier recours la description (qui est en bas du formulaire)
function focusPremiereQuestion() {
  const qualif = $("qualifs-initiales").querySelector("input:checked") || $("qualifs-initiales").querySelector("input");
  const question = [...$("questions").querySelectorAll("[data-champ]")].find((blocQuestion) => !blocQuestion.hidden);
  const cible = qualif || (question && question.querySelector("input, select, textarea")) || $("description");
  cible.focus({ preventScroll: true });
  const bloc = cible.closest("fieldset, .champ") || cible;
  if (bloc.scrollIntoView) bloc.scrollIntoView({ block: "center" });
}
// Nouveau signalement : on repart du haut du formulaire

$("btn-nouveau").addEventListener("click", () => allerNouveau());

$("btn-effacer").addEventListener("click", () =>
  enFile(async () => {
    fermerSuggestions();
    if (etatSaisie.dossierId && etatSaisie.initiale) {
      await remplirFormulaire();
      statut("statut-signalement", "Corrections annulées.");
    } else await preparerNouveauSignalement();
  }),
);

["nom", ...CHAMPS_NOUVEL_ETAB, "description", "site"].forEach((k) =>
  $(k).addEventListener("input", () => {
    etatSaisie.modifie = true;
  }),
);
$("site").addEventListener("input", () => {
  verifierDoublons();
});
$("date-faits").addEventListener("change", () => {
  etatSaisie.dateFaitsTouchee = true;
  etatSaisie.modifie = true;
  majDescriptionAuto();
  avertirFaitsAnterieurs();
  verifierDoublons();
  majProposition();
});
$("plusieurs-jours").addEventListener("change", () => {
  etatSaisie.modifie = true;
  if ($("plusieurs-jours").checked && !$("date-fin").value && lireDateFaits() != null)
    $("date-fin").value = jourCle(lireDateFaits() + UN_JOUR);
  avertirFaitsAnterieurs();
  if ($("plusieurs-jours").checked) $("date-fin").focus();
});
["date-fin", "jours-ouvres"].forEach((id) =>
  $(id).addEventListener("change", () => {
    etatSaisie.modifie = true;
    avertirFaitsAnterieurs();
  }),
);
// Détermine si les faits saisis sont antérieurs, d'un autre jour que le dossier, ou à venir
function diagnostiquerFaitsAnterieurs(nouvelle, jourDerniereVersion, finSerie, faitsFuturs) {
  const anterieur =
    etatSaisie.dossierId &&
    etatSaisie.derniere &&
    nouvelle != null &&
    jourDerniereVersion != null &&
    jourFaits(nouvelle) < jourFaits(jourDerniereVersion) &&
    !(finSerie != null && jourCle(finSerie) >= jourCle(jourDerniereVersion));
  const autreJourDossier =
    etatSaisie.dossierId &&
    etatSaisie.derniere &&
    nouvelle != null &&
    jourDerniereVersion != null &&
    jourFaits(nouvelle) !== jourFaits(jourDerniereVersion) &&
    !anterieur;
  const futur = !anterieur && !autreJourDossier && faitsFuturs;
  return { anterieur, autreJourDossier, futur };
}
function avertirFaitsAnterieurs() {
  const aide = $("aide-date-faits");
  if (!aide.dataset.base) aide.dataset.base = aide.textContent;
  const nouvelle = lireDateFaits(),
    jourDerniereVersion = etatSaisie.derniere && jourDesFaits(etatSaisie.derniere);
  // une série « plusieurs jours » qui va jusqu'à l'étape la plus récente (ou au-delà) la remplace : pas d'avertissement
  const finSerie = joursSuivants().slice(-1)[0];
  const { anterieur, autreJourDossier, futur } = diagnostiquerFaitsAnterieurs(
    nouvelle,
    jourDerniereVersion,
    finSerie,
    dateFaitsFuture(),
  );
  aide.textContent = autreJourDossier
    ? `Ce signalement concerne le ${jourCourt(jourDerniereVersion)}. Pour un autre jour, créez plutôt un nouveau signalement (« Autres actions › Reporter sur d'autres jours ») : un dossier par jour.`
    : anterieur
      ? `Faits antérieurs à ceux de l'étape la plus récente (${dateFr(jourDerniereVersion, { ...(etatSaisie.metaFaits || {}), type: (etatSaisie.metaFaits && etatSaisie.metaFaits.type) || "Date" })}) : cette étape sera rangée à sa date dans l'historique, mais ne deviendra pas la dernière étape du dossier.`
      : futur
        ? `Faits à venir : l'étape sera datée du ${jourCourt(lireDateFaits())}, postérieur à aujourd'hui.`
        : aide.dataset.base;
  aide.classList.toggle("alerte-faits", !!anterieur || futur || !!autreJourDossier);
  majAideJours();
}
$("description").addEventListener("input", () => appliquerConditions("q", etatSaisie.defsQuestions));
$("qualifs-initiales").addEventListener("change", () => appliquerConditions("q", etatSaisie.defsQuestions));
