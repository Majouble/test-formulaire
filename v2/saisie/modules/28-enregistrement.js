/* PRISME — widget de saisie, module 28/34 : Signalement : création, puis mise à jour par nouvelle version.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : remplirFormulaire, signalerChampsManquants, enregistrerSignalement, erreurColonneEtablissement,
     manquantsDeBase, erreurDateFaitsSaisie, qualificationVide, valeursAEnregistrer, erreurDossierAffiche,
     doublonAConfirmer, erreurPrerequisEcriture, afficherErreurSaisie, afficherErreurDateFaits,
     afficherDoublonBloquant, controlerAvantEnregistrement, champsACorriger, ecrireCorrection,
     synchroniserTableauxEtPurger, afficherConfidentielsEnregistres, afficherCorrectionEnregistree,
     enregistrerCorrection, nouvelleVersionDevientDerniere, aucuneMiseAJour, champsNouvelleVersion,
     ecrireNouvelleVersion, afficherMiseAJourVide, demanderConfirmationConflit, afficherMiseAJourEnregistree,
     placerCurseurGrist, enregistrerMiseAJour, champsCreation, ecrireCreation, afficherCreationEnregistree,
     enregistrerCreation, conseilEchecEnregistrement.
   Utilise :
     01 configuration : ETAB, NATURE, afficherCommentaire.
     02 utilitaires : colonnesEtab.
     03 variantes : etape, idDe, refId, reglagesSaisie, statut.
     04 date-faits : dateFaitsFuture, initialiserDateFaits, lireDateFaits, secondes.
     05 etat : colonneDe, etatSaisie, valeurLigne.
     06 grist : enFile, idsCreesIci.
     09 dossier : cocherQualif, jourDesFaits, lireQualificationInitiale, listeQualif.
     10 champs : boolRepondu, egal, estVide, horsBornes, lireChamps, lireUnChamp, remplirChamps, typeBase.
     13 coherence : appliquerConditions, auteurDe, fusionnerAvecVersionRecente, seulementModifies.
     14 etablissement : afficherEtablissement, etablissementPourCreation.
     16 description : cleDoublon, commentaireComplet, dateParGrist, doublonsDuJour, evaluerDescriptionManuelle,
       majApercuAuto, majDescriptionAuto, verifierDoublons.
     19 tableaux : tableaux.
     21 tableaux-enregistrement : confidentielsModifies, finConfidentiels, purgerSitesSupprimes,
       synchroniserTableaux, texteErreursTableaux.
     23 couleurs : majCouleur.
     25 plusieurs-jours : LIMITE_FUTUR_JOURS, UN_JOUR, aideFaitsDefaut, erreurPlusieursJours, joursSuivants,
       majAideJours, reinitialiserJours, reprendreSurJours, texteSerie.
     26 sites-esr : controleSites, majQualifDeduite, plusGrave, qualifDesSites, sitesCtrl.
     34 parcours : confirmer.
   Modifie etatSaisie : modifie, qualifTouchee, selectionAttendue, versionAffichee. */
/* =========================================================
   Signalement : création, puis mise à jour par nouvelle version
   ========================================================= */
async function remplirFormulaire() {
  const versionReference = etatSaisie.derniere || etatSaisie.initiale;
  etatSaisie.versionAffichee = versionReference ? { ...versionReference } : null;
  $("description").value = (versionReference ? valeurLigne(versionReference, "Description") : "") ?? "";
  $("site").value = (versionReference && colonneDe("Site") ? valeurLigne(versionReference, "Site") : "") ?? "";
  cocherQualif(versionReference ? valeurLigne(versionReference, "Qualification") : "");
  // Mise à jour : un dossier par jour ; les nouveautés sont datées par défaut du jour du dossier
  const precedente = versionReference && colonneDe("Date_faits") ? valeurLigne(versionReference, "Date_faits") : null;
  initialiserDateFaits(secondes(precedente) != null ? precedente : null);
  delete $("aide-date-faits").dataset.base;
  $("aide-date-faits").classList.remove("alerte-faits");
  $("aide-date-faits").textContent =
    secondes(precedente) != null
      ? `Jour de ce signalement. Pour un autre jour, créez un nouveau signalement (« Autres actions › Reporter sur d'autres jours »).`
      : aideFaitsDefaut();
  reinitialiserJours();
  majAideJours();
  await remplirChamps("q", etatSaisie.defsQuestions, (question) =>
    versionReference ? versionReference[question.colId] : null,
  );
  // formulaire par site : la qualification suit les sites tant qu'elle leur correspond
  if (sitesCtrl()) {
    const syntheseSites = qualifDesSites(),
      qualificationActuelle = plusGrave(listeQualif(lireQualificationInitiale()));
    etatSaisie.qualifTouchee = !!(
      qualificationActuelle &&
      syntheseSites &&
      syntheseSites.plusGrave &&
      qualificationActuelle !== syntheseSites.plusGrave
    );
    majQualifDeduite();
  }
  $("commentaire").value = "";
  appliquerConditions("q", etatSaisie.defsQuestions);
  evaluerDescriptionManuelle();
  majApercuAuto();
  majCouleur();
  etatSaisie.modifie = false;
}

// Marque les champs obligatoires vides (aria-invalid) et place le focus sur le premier
function signalerChampsManquants() {
  const invalides = [];
  const marquer = (champ, vide) => {
    if (!champ) return;
    if (vide) {
      champ.setAttribute("aria-invalid", "true");
      champ.setAttribute("aria-describedby", "statut-signalement");
      invalides.push(champ);
    } else {
      champ.removeAttribute("aria-invalid");
    }
  };
  if (!etatSaisie.dossierId && !etatSaisie.modeEtab && !etatSaisie.etabCourant)
    marquer($("nom"), !$("nom").value.trim());
  const qualification = lireQualificationInitiale();
  const premierChoix = $("qualifs-initiales").querySelector("input");
  marquer(premierChoix, !qualification || (Array.isArray(qualification) && !qualification.length));
  for (const question of etatSaisie.defsQuestions) {
    if (!question.obligatoire || question.formule) continue;
    const bloc = document.querySelector(`[data-champ="q-${question.colId}"]`);
    if (!bloc || bloc.hidden) continue;
    const champSaisie = bloc.querySelector("input, select, textarea");
    marquer(
      champSaisie,
      typeBase(question.type) === "Bool" ? !boolRepondu("q", question) : estVide(question, lireUnChamp("q", question)),
    );
  }
  for (const question of etatSaisie.defsQuestions) {
    // nombres hors bornes ([positif], [min], [max])
    const bloc = document.querySelector(`[data-champ="q-${question.colId}"]`);
    const valeur = bloc && !bloc.hidden ? lireUnChamp("q", question) : null;
    if (typeof valeur === "number" && horsBornes(question, valeur)) marquer(bloc.querySelector("input"), true);
  }
  for (const question of etatSaisie.defsQuestions) {
    // lignes incomplètes des questions « tableau »
    const controleurTableau = question.tableau && tableaux[`q-${question.colId}`];
    if (!controleurTableau || !controleurTableau.verifier().length) continue;
    controleurTableau.montrerErreurs = true;
    controleurTableau.majLignes();
    const champEnErreur = controleurTableau.el.querySelector(
      ".ligne-rep.incomplete .en-erreur input, .ligne-rep.incomplete .en-erreur select, .ligne-rep.incomplete .en-erreur textarea, .ligne-rep.incomplete .en-erreur summary",
    );
    if (champEnErreur) invalides.push(champEnErreur);
  }
  marquer($("description"), !$("description").value.trim());
  if (invalides.length) invalides[0].focus();
}
// Un champ corrigé perd son marquage d'erreur
$("form-signalement").addEventListener(
  "input",
  (evenement) => evenement.target.removeAttribute && evenement.target.removeAttribute("aria-invalid"),
);
$("form-signalement").addEventListener("change", (evenement) => {
  const groupeChoix = evenement.target.closest && evenement.target.closest(".choix-groupe");
  (groupeChoix ? groupeChoix.querySelectorAll("[aria-invalid]") : [evenement.target]).forEach(
    (champ) => champ.removeAttribute && champ.removeAttribute("aria-invalid"),
  );
});

$("form-signalement").addEventListener("submit", (evenement) => {
  evenement.preventDefault();
  enFile(() => enregistrerSignalement(false));
});
$("btn-corriger").addEventListener("click", () => enFile(() => enregistrerSignalement(true)));
// Entrée dans un champ d'une ligne ne doit pas enregistrer le signalement par accident :
// l'enregistrement se fait par le bouton (Entrée ou Espace quand il a le focus).
$("form-signalement").addEventListener("keydown", (evenement) => {
  const champ = evenement.target;
  if (
    evenement.key === "Enter" &&
    champ.tagName === "INPUT" &&
    !["button", "submit", "checkbox", "radio"].includes(champ.type)
  )
    evenement.preventDefault();
});

/* Enregistrement d'un signalement, en quatre temps : contrôles de la saisie, puis correction de la dernière version,
   mise à jour (nouvelle version du dossier) ou création ; en cas d'échec, message et conseil selon les droits. */
async function enregistrerSignalement(correction = false) {
  const saisie = controlerAvantEnregistrement(correction);
  if (!saisie) return;
  const { valeurs, jours } = saisie;
  const boutonEnregistrer = $("btn-signalement");
  boutonEnregistrer.setAttribute("aria-disabled", "true");
  $("btn-corriger").setAttribute("aria-disabled", "true");
  try {
    const table = grist.getTable();
    if (
      correction &&
      etatSaisie.versionAffichee &&
      etatSaisie.derniere &&
      etatSaisie.versionAffichee.id !== etatSaisie.derniere.id
    ) {
      statut(
        "statut-signalement",
        `Une nouvelle version de ce dossier a été enregistrée pendant votre correction${auteurDe(etatSaisie.derniere)}. Rouvrez le dossier pour partir de la version la plus récente.`,
        "err",
      );
      return;
    }
    if (correction) await enregistrerCorrection(table, valeurs);
    else if (etatSaisie.dossierId && etatSaisie.initiale) await enregistrerMiseAJour(table, valeurs, jours);
    else await enregistrerCreation(table, valeurs, jours);
  } catch (erreur) {
    statut(
      "statut-signalement",
      `Échec de l'enregistrement. ${erreur.message || erreur}.${conseilEchecEnregistrement(erreur, correction)}`,
      "err",
    );
  } finally {
    boutonEnregistrer.removeAttribute("aria-disabled");
    $("btn-corriger").removeAttribute("aria-disabled");
  }
}

// Message si la colonne de l'établissement n'est pas associée (vide sinon)
function erreurColonneEtablissement() {
  return colonneDe("Etablissement")
    ? ""
    : `Colonne de l'établissement introuvable dans la table « ${etatSaisie.tableId || "?"} » : voir ⚙ Réglages › « Colonnes et référentiel utilisés ».`;
}
// Libellés des informations de base absentes : établissement, description, date des faits (valeurs lues dans le formulaire)
function manquantsDeBase(nom, description, dateFaits) {
  const manquants = [];
  if (!etatSaisie.dossierId && !etatSaisie.modeEtab && !etatSaisie.etabCourant && !nom.trim())
    manquants.push("l'établissement");
  if (!description.trim()) manquants.push("la description");
  if (colonneDe("Date_faits") && !dateFaits) manquants.push("la date des faits");
  return manquants;
}
// Message si la date des faits est postérieure à aujourd'hui (non admis) ou à plus d'un an (vide sinon)
function erreurDateFaitsSaisie(dateFuture, dateFaits) {
  if (colonneDe("Date_faits") && dateFuture && !reglagesSaisie().faitsFuturs)
    return "La date des faits ne peut pas être postérieure à aujourd'hui.";
  if (colonneDe("Date_faits") && dateFaits != null && dateFaits > Date.now() / 1000 + LIMITE_FUTUR_JOURS * UN_JOUR)
    return "La date des faits est à plus d'un an : vérifiez-la.";
  return "";
}
// Vrai si aucune qualification n'est choisie
function qualificationVide(qualif) {
  return !qualif || (Array.isArray(qualif) && !qualif.length);
}
// Valeurs des colonnes à enregistrer, d'après les réponses et les champs lus dans le formulaire
function valeursAEnregistrer(reponses, description, site, dateFaits, qualif) {
  const valeurs = { ...reponses };
  if (colonneDe("Description")) valeurs[colonneDe("Description")] = description.trim();
  if (colonneDe("Site")) valeurs[colonneDe("Site")] = site.trim();
  if (colonneDe("Date_faits")) valeurs[colonneDe("Date_faits")] = dateFaits;
  if (colonneDe("Qualification"))
    valeurs[colonneDe("Qualification")] = Array.isArray(qualif) ? (qualif.length ? ["L", ...qualif] : null) : qualif;
  return valeurs;
}
// Message si le dossier affiché n'est plus disponible ou n'est pas celui de l'établissement affiché (vide sinon)
function erreurDossierAffiche() {
  if (etatSaisie.dossierId && !etatSaisie.initiale)
    return "Le signalement affiché n'est plus disponible. Rechargez le widget avant d'enregistrer.";
  // Mise à jour : l'établissement affiché doit être celui du dossier
  if (
    etatSaisie.dossierId &&
    etatSaisie.initiale &&
    etatSaisie.etabCourant &&
    etatSaisie.etabCourant.id !== refId(valeurLigne(etatSaisie.initiale, "Etablissement"))
  )
    return "L'établissement affiché ne correspond pas à celui du signalement ouvert : enregistrement annulé. Rouvrez le signalement depuis le menu.";
  return "";
}
// Vrai si des signalements du même jour existent et que l'utilisateur n'a pas confirmé qu'il s'agit de faits distincts
function doublonAConfirmer(nombreDoublons, confirme, cleCourante) {
  return nombreDoublons && confirme !== cleCourante;
}
// Message si l'écriture est impossible : correction sans dossier ouvert, mise à jour sans colonne « Dossier » (vide sinon)
function erreurPrerequisEcriture(correction) {
  if (correction && !(etatSaisie.dossierId && etatSaisie.initiale && etatSaisie.derniere))
    return "Ouvrez d'abord un signalement à corriger.";
  if (etatSaisie.dossierId && !correction && !colonneDe("Dossier"))
    return (
      "Mise à jour impossible : aucune colonne « Dossier » n'est associée au widget. Ajoutez à la table une colonne « Dossier » " +
      "de type Référence vers cette même table, puis associez-la dans le panneau du widget (ou corrigez la dernière version)."
    );
  return "";
}
// Affiche un message d'erreur de saisie
function afficherErreurSaisie(message) {
  statut("statut-signalement", message, "err");
}
// Affiche l'erreur sur la date des faits, marque le champ et lui donne le focus
function afficherErreurDateFaits(message) {
  afficherErreurSaisie(message);
  $("date-faits").setAttribute("aria-invalid", "true");
  $("date-faits").focus();
}
// Affiche le blocage « signalement déjà existant » et place le focus sur le bouton à utiliser
function afficherDoublonBloquant() {
  if (document.body.classList.contains("proposition-visible")) {
    afficherErreurSaisie(
      "Un signalement est déjà en cours pour cet établissement : actualisez-le, ou répondez « Non, c'est un autre événement » dans l'encadré orange de l'étape 1.",
    );
    const boutonProposition = $("proposition-encours").querySelector("button");
    if (boutonProposition) {
      boutonProposition.scrollIntoView({ block: "center" });
      boutonProposition.focus({ preventScroll: true });
    }
    return;
  }
  afficherErreurSaisie(
    "Un signalement existe déjà pour cet établissement ce jour-là : ouvrez-le pour le mettre à jour, ou confirmez qu'il s'agit de faits distincts (encadré orange).",
  );
  const boutonDoublon = $("alerte-doublon").querySelector("button");
  if (boutonDoublon) boutonDoublon.focus();
}
// Contrôles avant d'écrire : champs obligatoires, dates, établissement du dossier, doublons, sites. Affiche le
// message et renvoie null si l'enregistrement ne peut pas se faire ; sinon { valeurs, jours } (valeurs des colonnes,
// jours suivants où reporter les faits).
function controlerAvantEnregistrement(correction) {
  // Correction : sauf si l'utilisateur l'a changée, la date des faits reste celle de la version corrigée
  // (le formulaire propose la date du jour, qui ne vaut que pour une nouvelle mise à jour).
  if (correction && etatSaisie.derniere && colonneDe("Date_faits") && !etatSaisie.dateFaitsTouchee) {
    const dateFaitsPrecedente = valeurLigne(etatSaisie.derniere, "Date_faits");
    if (secondes(dateFaitsPrecedente) != null) {
      initialiserDateFaits(dateFaitsPrecedente);
      majDescriptionAuto();
    }
  }
  const erreurColonne = erreurColonneEtablissement();
  if (erreurColonne) {
    afficherErreurSaisie(erreurColonne);
    return null;
  }
  const manquants = manquantsDeBase($("nom").value, $("description").value, $("date-faits").value);
  const erreurDate = erreurDateFaitsSaisie(colonneDe("Date_faits") && dateFaitsFuture(), lireDateFaits());
  if (erreurDate) {
    afficherErreurDateFaits(erreurDate);
    return null;
  }
  const erreurJours = !correction ? erreurPlusieursJours() : "";
  if (erreurJours) {
    afficherErreurSaisie(erreurJours);
    $("date-fin").focus();
    return null;
  }
  const jours = correction ? [] : joursSuivants();
  const reponses = lireChamps("q", etatSaisie.defsQuestions, manquants);
  const qualif = lireQualificationInitiale();
  if (qualificationVide(qualif)) manquants.push("la qualification");
  if (manquants.length) {
    afficherErreurSaisie(`Renseignez ${manquants.join(", ")}.`);
    signalerChampsManquants();
    return null;
  }

  const valeurs = valeursAEnregistrer(reponses, $("description").value, $("site").value, lireDateFaits(), qualif);

  const erreurDossier = erreurDossierAffiche();
  if (erreurDossier) {
    afficherErreurSaisie(erreurDossier);
    return null;
  }
  if (!correction && !etatSaisie.dossierId) {
    verifierDoublons();
    if (doublonAConfirmer(doublonsDuJour().length, etatSaisie.doublonConfirme, cleDoublon())) {
      afficherDoublonBloquant();
      return null;
    }
  }
  const boutonEnregistrer = $("btn-signalement");
  if (boutonEnregistrer.getAttribute("aria-disabled") === "true") return null; // enregistrement déjà en cours
  if (!controleSites()) {
    const fieldsetQualification = $("qualifs-initiales").closest("fieldset");
    fieldsetQualification.scrollIntoView({ block: "center" });
    return null;
  }
  const erreurPrerequis = erreurPrerequisEcriture(correction);
  if (erreurPrerequis) {
    afficherErreurSaisie(erreurPrerequis);
    return null;
  }
  return { valeurs, jours };
}

// Champs de la dernière version à corriger : réponses modifiées, plus la date des faits si elle change
function champsACorriger(valeurs) {
  const fields = seulementModifies(etatSaisie.champsVersion, valeurs, etatSaisie.derniere);
  if (
    colonneDe("Date_faits") &&
    valeurs[colonneDe("Date_faits")] !== undefined &&
    !egal(valeurs[colonneDe("Date_faits")], secondes(etatSaisie.derniere[colonneDe("Date_faits")]))
  )
    fields[colonneDe("Date_faits")] = valeurs[colonneDe("Date_faits")];
  return fields;
}
// Écrit la correction sur la dernière version
async function ecrireCorrection(table, ligneId, fields) {
  await etape("Correction de la dernière version", etatSaisie.tableId || "réponses", () =>
    table.update({ id: ligneId, fields }),
  );
}
// Écrit les lignes des tableaux du dossier (avec la version donnée), puis purge les sites supprimés ; renvoie les erreurs
async function synchroniserTableauxEtPurger(devientDerniere, ligneId) {
  return [
    ...(await synchroniserTableaux(etatSaisie.dossierId, devientDerniere, ligneId)),
    ...(await purgerSitesSupprimes(etatSaisie.dossierId)),
  ];
}
// Affiche que seules des données confidentielles ont été enregistrées
function afficherConfidentielsEnregistres(errT) {
  statut(
    "statut-signalement",
    "Données confidentielles enregistrées (aucune nouvelle étape)." + texteErreursTableaux(errT),
    errT.length ? "err" : "ok",
  );
}
// Affiche le résultat d'une correction : message d'état, puis confirmation
function afficherCorrectionEnregistree(errT) {
  statut(
    "statut-signalement",
    "Dernière étape corrigée (aucune nouvelle étape créée)." + texteErreursTableaux(errT),
    errT.length ? "err" : "ok",
  );
  confirmer(
    "Dernière étape corrigée",
    `La dernière étape du dossier n° ${etatSaisie.dossierId} a été corrigée ; aucune nouvelle étape n'a été créée (pas de nouveau message Tchap).` +
      texteErreursTableaux(errT),
  );
}
// Correction : la dernière version est modifiée sur place
async function enregistrerCorrection(table, valeurs) {
  // Correction : la dernière version est modifiée sur place ; aucune nouvelle ligne, donc aucun message Tchap.
  // L'établissement, le dossier, la nature et la date de saisie ne changent pas.
  const fields = champsACorriger(valeurs);
  if (!Object.keys(fields).length && confidentielsModifies()) {
    const errT = await synchroniserTableaux(etatSaisie.dossierId, false);
    finConfidentiels();
    etatSaisie.modifie = false;
    afficherConfidentielsEnregistres(errT);
    return;
  }
  if (!Object.keys(fields).length) {
    afficherErreurSaisie("Aucune modification à corriger.");
    return;
  }
  await ecrireCorrection(table, etatSaisie.derniere.id, fields);
  Object.assign(etatSaisie.derniere, fields);
  etatSaisie.modifie = false;
  const errT = await synchroniserTableauxEtPurger(true, etatSaisie.derniere.id);
  afficherCorrectionEnregistree(errT);
}

// Vrai si la nouvelle version porte les faits les plus récents du dossier (sinon la table dédiée garde ses lignes)
function nouvelleVersionDevientDerniere(faitsNouveaux, faitsDerniere) {
  return faitsNouveaux == null || faitsDerniere == null || faitsNouveaux >= faitsDerniere;
}
// Vrai s'il n'y a rien à enregistrer pour une mise à jour : ni réponse modifiée, ni jour suivant, ni commentaire
function aucuneMiseAJour(change, jours, commentaireSaisi) {
  return !change && !jours.length && !commentaireSaisi;
}
// Champs de la nouvelle version : réponses, établissement du dossier, dossier, date de saisie, nature, commentaire
function champsNouvelleVersion(valeurs, com) {
  const fields = {
    ...valeurs,
    [colonneDe("Etablissement")]: refId(valeurLigne(etatSaisie.initiale, "Etablissement")), // l'établissement du dossier, et lui seul
    ...(colonneDe("Dossier") ? { [colonneDe("Dossier")]: etatSaisie.dossierId } : {}),
  };
  if (colonneDe("Date") && !dateParGrist()) fields[colonneDe("Date")] = Date.now() / 1000;
  if (colonneDe("Nature")) fields[colonneDe("Nature")] = NATURE.suivi;
  if (colonneDe("Commentaire")) fields[colonneDe("Commentaire")] = com;
  return fields;
}
// Écrit la nouvelle version dans la table ; renvoie son identifiant
async function ecrireNouvelleVersion(table, fields) {
  const id = idDe(
    await etape("Création de la nouvelle version", etatSaisie.tableId || "réponses", () => table.create({ fields })),
  );
  if (id) idsCreesIci.add(id);
  return id;
}
// Affiche qu'il n'y a rien à enregistrer pour la mise à jour
function afficherMiseAJourVide() {
  afficherErreurSaisie(
    afficherCommentaire()
      ? "Modifiez au moins une réponse ou ajoutez un commentaire."
      : "Modifiez au moins une réponse avant de mettre à jour.",
  );
}
// Demande à l'utilisateur de trancher un conflit avec une mise à jour enregistrée pendant sa saisie ; vrai s'il confirme
function demanderConfirmationConflit(conflits) {
  return confirm(
    `Une mise à jour de ce dossier a été enregistrée pendant votre saisie${auteurDe(etatSaisie.derniere)}.\n\n` +
      `Vous avez tous deux modifié : ${conflits.join(", ")}.\n\nOK : enregistrer vos réponses pour ces questions (les autres apports de votre collègue sont conservés).\nAnnuler : revenir au formulaire.`,
  );
}
// Affiche le résultat d'une mise à jour : message d'état, puis confirmation
function afficherMiseAJourEnregistree(serie, errT) {
  statut(
    "statut-signalement",
    "Mise à jour enregistrée : une nouvelle étape a été ajoutée." + texteSerie(serie) + texteErreursTableaux(errT),
    errT.length ? "err" : "ok",
  );
  confirmer(
    "Mise à jour enregistrée",
    `Étape ${etatSaisie.versions.length + 1} du dossier n° ${etatSaisie.dossierId}${etatSaisie.etabCourant ? " (" + etatSaisie.etabCourant[colonnesEtab.nom] + ")" : ""}.` +
      texteSerie(serie) +
      texteErreursTableaux(errT),
  );
}
// Place le curseur de Grist sur la ligne
async function placerCurseurGrist(id) {
  try {
    await grist.setCursorPos({ rowId: id });
  } catch (_) {
    // placer le curseur de Grist est un confort : sans effet si Grist le refuse
  }
}
// Mise à jour : nouvelle version rattachée au dossier
async function enregistrerMiseAJour(table, valeurs, jours) {
  // Mise à jour : on n'écrase jamais la version précédente, on ajoute une nouvelle ligne
  // rattachée au signalement initial par la colonne Dossier.
  const com = colonneDe("Commentaire") ? commentaireComplet() : "";
  const change = Object.keys(seulementModifies(etatSaisie.champsVersion, valeurs, etatSaisie.derniere)).length > 0;
  // Seules des données confidentielles ont changé : pas de nouvelle version (ni de message Tchap)
  if (!change && confidentielsModifies()) {
    const errT = await synchroniserTableaux(etatSaisie.dossierId, false);
    finConfidentiels();
    etatSaisie.modifie = false;
    afficherConfidentielsEnregistres(errT);
    return;
  }
  // La nouvelle version devient-elle la dernière (faits les plus récents) ? Sinon la table dédiée garde ses lignes.
  const faitsNouveaux = colonneDe("Date_faits") ? lireDateFaits() : null,
    faitsDerniere = etatSaisie.derniere ? jourDesFaits(etatSaisie.derniere) : null;
  const devientDerniere = nouvelleVersionDevientDerniere(faitsNouveaux, faitsDerniere);
  if (aucuneMiseAJour(change, jours, afficherCommentaire() && $("commentaire").value.trim())) {
    afficherMiseAJourVide();
    return;
  }
  const fusion = fusionnerAvecVersionRecente(valeurs);
  if (fusion.conflits.length && !demanderConfirmationConflit(fusion.conflits)) return;
  Object.assign(valeurs, fusion.valeurs);
  const fields = champsNouvelleVersion(valeurs, com);
  const id = await ecrireNouvelleVersion(table, fields);
  const serie =
    id && jours.length
      ? await reprendreSurJours(refId(valeurLigne(etatSaisie.initiale, "Etablissement")), valeurs, jours, faitsNouveaux)
      : null;
  etatSaisie.modifie = false;
  $("commentaire").value = "";
  const errT = id ? await synchroniserTableauxEtPurger(devientDerniere, id) : [];
  finConfidentiels();
  afficherMiseAJourEnregistree(serie, errT);
  if (id) await placerCurseurGrist(id);
}

// Champs du premier signalement d'un dossier : réponses, établissement, date de saisie, nature
function champsCreation(valeurs, etabId) {
  const fields = { ...valeurs, [colonneDe("Etablissement")]: etabId };
  if (colonneDe("Date") && !dateParGrist()) fields[colonneDe("Date")] = Date.now() / 1000;
  if (colonneDe("Nature")) fields[colonneDe("Nature")] = NATURE.initial;
  return fields;
}
// Écrit le premier signalement dans la table, puis le rattache à son propre dossier ; renvoie son identifiant
async function ecrireCreation(table, fields) {
  const id = idDe(
    await etape("Création du signalement", etatSaisie.tableId || "réponses", () => table.create({ fields })),
  );
  if (id) idsCreesIci.add(id);
  if (id && colonneDe("Dossier"))
    await etape("Rattachement du signalement à son propre dossier", etatSaisie.tableId || "réponses", () =>
      table.update({ id, fields: { [colonneDe("Dossier")]: id } }),
    );
  return id;
}
// Affiche le résultat d'une création : message d'état, puis confirmation
function afficherCreationEnregistree(id, serie, errT) {
  statut(
    "statut-signalement",
    (etatSaisie.modeEtab
      ? "Signalement enregistré."
      : "Signalement enregistré. Vous pouvez transmettre le lien à l'établissement.") +
      texteSerie(serie) +
      texteErreursTableaux(errT),
    errT.length ? "err" : "ok",
  );
  confirmer(
    "Signalement enregistré",
    `Dossier n° ${id} créé${etatSaisie.etabCourant ? " pour " + etatSaisie.etabCourant[colonnesEtab.nom] : ""}.` +
      texteSerie(serie) +
      (etatSaisie.modeEtab ? "" : " Vous pouvez transmettre le lien d'accès à l'établissement.") +
      texteErreursTableaux(errT),
    !etatSaisie.modeEtab,
  );
}
// Création : premier signalement d'un dossier
async function enregistrerCreation(table, valeurs, jours) {
  const etabId = await etablissementPourCreation();
  if (!etabId) throw new Error("établissement introuvable");
  const fields = champsCreation(valeurs, etabId);
  const id = await ecrireCreation(table, fields);
  const serie = id && jours.length ? await reprendreSurJours(etabId, valeurs, jours, lireDateFaits()) : null;
  etatSaisie.modifie = false;
  etatSaisie.selectionAttendue = id;
  const errT = id ? await synchroniserTableaux(id, true, id) : [];
  finConfidentiels();
  afficherCreationEnregistree(id, serie, errT);
  await placerCurseurGrist(id);
  afficherEtablissement();
}

// Conseil ajouté au message d'échec quand Grist refuse l'écriture (règles d'accès)
function conseilEchecEnregistrement(erreur, correction) {
  let conseil = "";
  if (erreur.acl && erreur.table === ETAB.table)
    conseil =
      " Cet établissement n'est pas encore dans le référentiel et vos droits ne permettent pas de l'y ajouter : " +
      (reglagesSaisie().annuaires.length
        ? "importez-le via la mise à jour de l'annuaire, ou autorisez la création dans la table des établissements."
        : "ajoutez-le au référentiel (table des établissements), ou autorisez la création dans cette table.");
  else if (erreur.acl && correction)
    conseil =
      " Vos droits ne permettent pas de modifier cette version : vérifiez la règle d'accès qui autorise la correction (mise à jour de la dernière version).";
  else if (erreur.acl)
    conseil =
      " Vérifiez les conditions de création de votre règle d'accès : elles portent sur l'ensemble des valeurs " +
      "envoyées par le widget (établissement, date, nature, qualification…), pas seulement sur la cellule saisie.";
  return conseil;
}
