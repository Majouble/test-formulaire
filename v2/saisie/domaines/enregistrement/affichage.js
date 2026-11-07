/* PRISME — widget de saisie, domaines/enregistrement/affichage.js
   Domaine : l'enregistrement : contrôles, écriture d'une version, description automatique, doublons — affichage
   (page et événements).
   Chargé par saisie/index.html dans l'ordre : fondations, composants, domaines, demarrage.js. Les fichiers partagent
   leurs noms (scripts classiques, sans import) : au chargement, un fichier ne fait que définir. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : lireReponsesSaisies, lireReponsesPourDescription, lieuDoublon, verifierDoublons, lireIdentiteSaisie,
     majEtatDescription, majDescriptionAuto, evaluerDescriptionManuelle, majApercuAuto, valeursSaisies,
     signalerChampsManquants, enregistrerSignalement, afficherErreurSaisie, afficherErreurDateFaits,
     afficherDoublonBloquant, controlerAvantEnregistrement, afficherConfidentielsEnregistres,
     afficherCorrectionEnregistree, enregistrerCorrection, afficherMiseAJourVide, demanderConfirmationConflit,
     afficherMiseAJourEnregistree, enregistrerMiseAJour, afficherCreationEnregistree, enregistrerCreation,
     rienASignaler, planifierMarques, majMarquesModif, confirmer, cacherConfirmation,
     brancherEvenementsEnregistrement.
   Utilise :
     fondations/configuration : colonnesEtab.
     fondations/outils : colonneDe, listeQualif, refId, secondes, statut, typeBase, valeurLigne.
     fondations/etat : etatSaisie.
     fondations/grist : enFile.
     composants/date-faits : dateFaitsFuture, initialiserDateFaits, lireDateFaits.
     composants/champs : boolRepondu, estVide, horsBornes, lireChamps, lireUnChamp.
     composants/conditions-formules : appliquerConditions, formuleConnue, majFormulesEnDirect, questionVisible,
       valeurFormuleEnDirect.
     composants/tableaux-structure : tableaux.
     composants/tableaux-enregistrement : confidentielsModifies, finConfidentiels, synchroniserTableaux,
       texteErreursTableaux.
     domaines/formulaire/regles : commentaireActive, qualificationRetourNormale.
     domaines/formulaire/affichage : cocherQualif, lireQualificationInitiale, majCouleur.
     domaines/etablissement/donnees : etablissementPourCreation.
     domaines/etablissement/affichage : afficherEtablissement.
     domaines/dossier/regles : auteurDe, dossierDuJour, jourDesFaits, jourDuFormulaire, texteSerie.
     domaines/dossier/affichage : abandonAccepte, allerNouveau, erreurPlusieursJours, joursSuivants, ouvrirDossier,
       preparerNouveauSignalement.
     domaines/enregistrement/regles : MOTIF_MOBILISATION, aucuneMiseAJour, champsACorriger, champsCreation,
       champsModifiesParRapportADerniere, champsNouvelleVersion, cleDoublon, commentaireComplet,
       conseilEchecEnregistrement, descriptionGeneree, doublonAConfirmer, doublonsDuJour,
       erreurColonneEtablissement, erreurDateFaitsSaisie, erreurDossierAffiche, erreurPrerequisEcriture,
       extraitDescription, fusionnerAvecVersionRecente, jourDeMobilisation, manquantsDeBase, mentionMobilisation,
       nouvelleVersionDevientDerniere, qualificationVide, seulementModifies, signalementEnCoursRas,
       texteAutomatique, valeursAEnregistrer.
     domaines/enregistrement/donnees : ecrireCorrection, ecrireCreation, ecrireNouvelleVersion, placerCurseurGrist,
       reprendreSurJours, synchroniserTableauxEtPurger.
     domaines/sites-esr/affichage : controleSites.
     demarrage : montrerVue.
   Modifie etatSaisie : descriptionManuelle, doublonConfirme, minuterieMarques, modifie, selectionAttendue. */
// Lit dans la page les réponses utiles au résumé des modifications (qualification, description, champs, formules en direct)
function lireReponsesSaisies() {
  const defQ = etatSaisie.metaSig[colonneDe("Qualification")];
  const reponses = { qualification: undefined, description: undefined, valeurs: null, directes: new Map() };
  if (defQ && etatSaisie.optionsAuto.qualification) reponses.qualification = lireQualificationInitiale();
  const defD = etatSaisie.metaSig[colonneDe("Description")];
  if (defD && etatSaisie.optionsAuto.description) reponses.description = $("description").value.trim();
  if (etatSaisie.optionsAuto.questions) {
    reponses.valeurs = lireChamps("q", etatSaisie.defsQuestions, []); // questions visibles uniquement
    for (const question of etatSaisie.defsQuestions)
      if (question.formule && formuleConnue(question) && !question.confidentiel && questionVisible("q", question))
        reponses.directes.set(question.colId, valeurFormuleEnDirect(question));
  }
  return reponses;
}
// Lit dans la page les réponses utiles à la description (qualification saisie, champs, valeurs de formules en direct)
function lireReponsesPourDescription(options) {
  const defQ = etatSaisie.metaSig[colonneDe("Qualification")];
  const reponses = { qualification: undefined, valeurs: null, directes: new Map() };
  if (options.qualification && defQ) reponses.qualification = lireQualificationInitiale();
  if (options.questions) {
    reponses.valeurs = lireChamps("q", etatSaisie.defsQuestions, []); // questions visibles uniquement
    for (const question of etatSaisie.defsQuestions)
      if (question.formule && formuleConnue(question) && !question.confidentiel && questionVisible("q", question))
        reponses.directes.set(question.colId, valeurFormuleEnDirect(question));
  }
  return reponses;
}
const lieuDoublon = () => {
  const site = colonneDe("Site") ? $("site").value.trim() : "";
  return site ? ` (site « ${esc(site)} »)` : "";
};
function verifierDoublons() {
  const bloc = $("alerte-doublon");
  const liste = doublonsDuJour();
  if (!liste.length) {
    bloc.hidden = true;
    bloc.innerHTML = "";
    return;
  }
  const jour = jourDuFormulaire(),
    confirme = etatSaisie.doublonConfirme === cleDoublon();
  bloc.hidden = false;
  bloc.classList.toggle("confirme", confirme);
  const items = liste
    .map((doublon) => {
      const qualifications = listeQualif(valeurLigne(doublon.derniere, "Qualification")).join(", ");
      const suivis = doublon.nb > 1 ? ` — ${doublon.nb - 1} mise${doublon.nb > 2 ? "s" : ""} à jour` : "";
      const site = colonneDe("Site") ? String(valeurLigne(doublon.derniere, "Site") || "").trim() : "";
      return `<li><strong>Dossier n° ${doublon.dossier}</strong>${site ? ` — site « ${esc(site)} »` : ""}${qualifications ? ` (${esc(qualifications)})` : ""}${suivis}<br>
      <span class="extrait">${esc(extraitDescription(doublon.derniere))}</span><br>
      <button type="button" class="secondaire petit" data-ouvrir-dossier="${doublon.dossier}">Ouvrir ce signalement pour le mettre à jour</button></li>`;
    })
    .join("");
  bloc.innerHTML = confirme
    ? `Un signalement existe déjà pour cet établissement${lieuDoublon()} le ${esc(jour)}. Vous avez confirmé qu'il s'agit d'un <strong>nouveau signalement distinct</strong>.
       <div class="actions-doublon"><button type="button" class="lien-texte" id="btn-annuler-doublon">Revenir sur ce choix</button></div>`
    : `<strong>⚠ ${liste.length > 1 ? `${liste.length} signalements existent` : "Un signalement existe"} déjà pour cet établissement${lieuDoublon()} le ${esc(jour)}.</strong>
       S'il s'agit des mêmes faits, mettez plutôt à jour le signalement existant (la saisie en cours sera abandonnée) :
       <ul>${items}</ul>
       <div class="actions-doublon"><button type="button" class="lien-texte" id="btn-confirmer-doublon">Non, il s'agit de faits distincts : créer un nouveau signalement</button></div>`;
}
// Établissement et commune du formulaire : établissement connu, ou établissement choisi dans l'annuaire
// (ou saisi à la main) en cours de création
// Lit dans la page le site et les champs d'établissement saisis
function lireIdentiteSaisie() {
  return {
    site: colonneDe("Site") ? $("site").value.trim() : "",
    nom: $("nom").value.trim(),
    uai: $("uai").value.trim(),
    type: $("type").value.trim(),
    academie: $("academie").value.trim(),
    departement: $("departement").value.trim(),
  };
}
function majEtatDescription() {
  const bloc = $("etat-description"),
    actif = !!etatSaisie.optionsAuto.actif;
  bloc.hidden = !actif;
  if (!actif) {
    $("apercu-generee").hidden = true;
    return;
  }
  bloc.classList.toggle("manuel", etatSaisie.descriptionManuelle);
  $("etat-description-texte").textContent = etatSaisie.descriptionManuelle
    ? "✎ Texte modifié à la main : il ne suit plus les réponses du formulaire."
    : "↻ Rédigé automatiquement : le texte suit les réponses du formulaire.";
  $("etat-description-actions").hidden = !etatSaisie.descriptionManuelle;
  if (!etatSaisie.descriptionManuelle) {
    $("apercu-generee").hidden = true;
    $("btn-voir-auto").setAttribute("aria-expanded", "false");
    $("btn-voir-auto").textContent = "Voir le texte automatique";
  } else if (!$("apercu-generee").hidden) $("apercu-generee").textContent = descriptionGeneree();
}
function majDescriptionAuto() {
  majFormulesEnDirect();
  majEtatDescription();
  if (!etatSaisie.optionsAuto.actif) return;
  if (etatSaisie.descriptionManuelle) {
    // Texte modifié à la main : on ne touche qu'à la mention de mobilisation si elle y figure déjà
    const texteManuel = $("description").value;
    if (etatSaisie.optionsAuto.mobilisation && MOTIF_MOBILISATION.test(texteManuel)) {
      const maj = signalementEnCoursRas()
        ? texteManuel.replace(MOTIF_MOBILISATION, "")
        : texteManuel.replace(
            /\(\d+(?:er|e) jour de mobilisation\)(\s*)$/,
            `${mentionMobilisation(jourDeMobilisation())}$1`,
          );
      if (maj !== texteManuel) $("description").value = maj;
    }
    return;
  }
  $("description").value = descriptionGeneree();
}
// Au chargement d'une version : la description est considérée comme automatique si elle correspond
// exactement à ce que produiraient les réponses, et comme modifiée à la main sinon.
function evaluerDescriptionManuelle() {
  const actuelle = $("description").value.trim();
  const sansMention = (texte) => texte.replace(MOTIF_MOBILISATION, "").trim();
  etatSaisie.descriptionManuelle =
    !!actuelle && etatSaisie.optionsAuto.actif && sansMention(actuelle) !== sansMention(descriptionGeneree().trim());
  majDescriptionAuto();
}
function majApercuAuto() {
  if (!etatSaisie.dossierId || !colonneDe("Commentaire")) {
    $("apercu-auto").hidden = true;
    return;
  }
  const auto = texteAutomatique();
  $("apercu-auto").hidden = false;
  $("apercu-auto").classList.toggle("vide", !auto);
  $("apercu-texte").textContent =
    auto ||
    (etatSaisie.optionsAuto.actif
      ? "Aucune réponse modifiée pour l'instant : modifiez la qualification, la description ou une question, le résumé s'écrira ici."
      : "Résumé automatique désactivé (administration, onglet Formulaires, panneau Description).");
}
// Réponses du formulaire, au format enregistré (sans établissement, dossier ni date)
function valeursSaisies(manquants = []) {
  const valeurs = { ...lireChamps("q", etatSaisie.defsQuestions, manquants) },
    qualif = lireQualificationInitiale();
  if (colonneDe("Description")) valeurs[colonneDe("Description")] = $("description").value.trim();
  if (colonneDe("Site")) valeurs[colonneDe("Site")] = $("site").value.trim();
  if (colonneDe("Qualification"))
    valeurs[colonneDe("Qualification")] = Array.isArray(qualif) ? (qualif.length ? ["L", ...qualif] : null) : qualif;
  return valeurs;
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
// Affiche que seules des données confidentielles ont été enregistrées
function afficherConfidentielsEnregistres(erreursTableaux) {
  statut(
    "statut-signalement",
    "Données confidentielles enregistrées (aucune nouvelle étape)." + texteErreursTableaux(erreursTableaux),
    erreursTableaux.length ? "err" : "ok",
  );
}
// Affiche le résultat d'une correction : message d'état, puis confirmation
function afficherCorrectionEnregistree(erreursTableaux) {
  statut(
    "statut-signalement",
    "Dernière étape corrigée (aucune nouvelle étape créée)." + texteErreursTableaux(erreursTableaux),
    erreursTableaux.length ? "err" : "ok",
  );
  confirmer(
    "Dernière étape corrigée",
    `La dernière étape du dossier n° ${etatSaisie.dossierId} a été corrigée ; aucune nouvelle étape n'a été créée (pas de nouveau message Tchap).` +
      texteErreursTableaux(erreursTableaux),
  );
}
// Correction : la dernière version est modifiée sur place
async function enregistrerCorrection(table, valeurs) {
  // Correction : la dernière version est modifiée sur place ; aucune nouvelle ligne, donc aucun message Tchap.
  // L'établissement, le dossier, la nature et la date de saisie ne changent pas.
  const fields = champsACorriger(valeurs);
  if (!Object.keys(fields).length && confidentielsModifies()) {
    const erreursTableaux = await synchroniserTableaux(etatSaisie.dossierId, false);
    finConfidentiels();
    etatSaisie.modifie = false;
    afficherConfidentielsEnregistres(erreursTableaux);
    return;
  }
  if (!Object.keys(fields).length) {
    afficherErreurSaisie("Aucune modification à corriger.");
    return;
  }
  await ecrireCorrection(table, etatSaisie.derniere.id, fields);
  Object.assign(etatSaisie.derniere, fields);
  etatSaisie.modifie = false;
  const erreursTableaux = await synchroniserTableauxEtPurger(true, etatSaisie.derniere.id);
  afficherCorrectionEnregistree(erreursTableaux);
}
// Affiche qu'il n'y a rien à enregistrer pour la mise à jour
function afficherMiseAJourVide() {
  afficherErreurSaisie(
    commentaireActive()
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
function afficherMiseAJourEnregistree(serie, erreursTableaux) {
  statut(
    "statut-signalement",
    "Mise à jour enregistrée : une nouvelle étape a été ajoutée." +
      texteSerie(serie) +
      texteErreursTableaux(erreursTableaux),
    erreursTableaux.length ? "err" : "ok",
  );
  confirmer(
    "Mise à jour enregistrée",
    `Étape ${etatSaisie.versions.length + 1} du dossier n° ${etatSaisie.dossierId}${etatSaisie.etabCourant ? " (" + etatSaisie.etabCourant[colonnesEtab.nom] + ")" : ""}.` +
      texteSerie(serie) +
      texteErreursTableaux(erreursTableaux),
  );
}
// Mise à jour : nouvelle version rattachée au dossier
async function enregistrerMiseAJour(table, valeurs, jours) {
  // Mise à jour : on n'écrase jamais la version précédente, on ajoute une nouvelle ligne
  // rattachée au signalement initial par la colonne Dossier.
  const com = colonneDe("Commentaire") ? commentaireComplet() : "";
  const change = Object.keys(seulementModifies(etatSaisie.champsVersion, valeurs, etatSaisie.derniere)).length > 0;
  // Seules des données confidentielles ont changé : pas de nouvelle version (ni de message Tchap)
  if (!change && confidentielsModifies()) {
    const erreursTableaux = await synchroniserTableaux(etatSaisie.dossierId, false);
    finConfidentiels();
    etatSaisie.modifie = false;
    afficherConfidentielsEnregistres(erreursTableaux);
    return;
  }
  // La nouvelle version devient-elle la dernière (faits les plus récents) ? Sinon la table dédiée garde ses lignes.
  const faitsNouveaux = colonneDe("Date_faits") ? lireDateFaits() : null,
    faitsDerniere = etatSaisie.derniere ? jourDesFaits(etatSaisie.derniere) : null;
  const devientDerniere = nouvelleVersionDevientDerniere(faitsNouveaux, faitsDerniere);
  if (aucuneMiseAJour(change, jours, commentaireActive() && $("commentaire").value.trim())) {
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
  const erreursTableaux = id ? await synchroniserTableauxEtPurger(devientDerniere, id) : [];
  finConfidentiels();
  afficherMiseAJourEnregistree(serie, erreursTableaux);
  if (id) await placerCurseurGrist(id);
}
// Affiche le résultat d'une création : message d'état, puis confirmation
function afficherCreationEnregistree(id, serie, erreursTableaux) {
  statut(
    "statut-signalement",
    (etatSaisie.modeEtab
      ? "Signalement enregistré."
      : "Signalement enregistré. Vous pouvez transmettre le lien à l'établissement.") +
      texteSerie(serie) +
      texteErreursTableaux(erreursTableaux),
    erreursTableaux.length ? "err" : "ok",
  );
  confirmer(
    "Signalement enregistré",
    `Dossier n° ${id} créé${etatSaisie.etabCourant ? " pour " + etatSaisie.etabCourant[colonnesEtab.nom] : ""}.` +
      texteSerie(serie) +
      (etatSaisie.modeEtab ? "" : " Vous pouvez transmettre le lien d'accès à l'établissement.") +
      texteErreursTableaux(erreursTableaux),
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
  const erreursTableaux = id ? await synchroniserTableaux(id, true, id) : [];
  finConfidentiels();
  afficherCreationEnregistree(id, serie, erreursTableaux);
  await placerCurseurGrist(id);
  afficherEtablissement();
}
async function rienASignaler() {
  const qualification = qualificationRetourNormale();
  if (!qualification) {
    alert("Le formulaire ne propose pas de qualification « RAS » : utilisez « Nouveau signalement ».");
    return;
  }
  if (!abandonAccepte()) return;
  // un dossier de ce jour existe déjà (un dossier par jour) : il est mis à jour en retour à la normale ; sinon, nouveau dossier
  const duJour =
    etatSaisie.modeEtab && etatSaisie.etabs && etatSaisie.etabs[0]
      ? dossierDuJour(etatSaisie.etabs[0].id, Date.now() / 1000)
      : null;
  await enFile(async () => {
    cacherConfirmation();
    if (duJour) await ouvrirDossier(duJour.d, true);
    else await preparerNouveauSignalement();
    montrerVue("saisie");
  });
  if (duJour && etatSaisie.dossierId !== duJour.d) return;
  await enFile(async () => {
    cocherQualif(qualification);
    $("description").value = "Rien à signaler.";
    etatSaisie.descriptionManuelle = true;
    majEtatDescription();
    etatSaisie.modifie = true;
    await enregistrerSignalement();
  });
}
function planifierMarques() {
  clearTimeout(etatSaisie.minuterieMarques);
  etatSaisie.minuterieMarques = setTimeout(majMarquesModif, 0);
}
function majMarquesModif() {
  document
    .querySelectorAll("#form-signalement .modifie")
    .forEach((champModifie) => champModifie.classList.remove("modifie"));
  const recap = $("recap-modifs");
  if (!etatSaisie.dossierId || !etatSaisie.derniere) {
    recap.hidden = true;
    return;
  }
  const reponsesLues = new Map();
  for (const question of etatSaisie.defsQuestions) {
    if (question.formule) continue;
    const bloc = document.querySelector(`[data-champ="q-${question.colId}"]`);
    if (!bloc || bloc.hidden) continue;
    reponsesLues.set(question.colId, lireUnChamp("q", question));
  }
  const modifs = champsModifiesParRapportADerniere(
    colonneDe("Qualification") ? lireQualificationInitiale() : null,
    $("site").value,
    reponsesLues,
    $("description").value,
  );
  const noms = [];
  for (const modif of modifs) {
    const cible =
      modif.cle === "qualification"
        ? $("qualifs-initiales").closest("fieldset")
        : modif.cle === "site"
          ? $("bloc-site")
          : modif.cle === "description"
            ? $("description").closest(".champ")
            : document.querySelector(`[data-champ="${modif.cle}"]`);
    if (cible) cible.classList.add("modifie");
    noms.push(modif.nom);
  }
  recap.hidden = false;
  recap.classList.toggle("avec", noms.length > 0);
  recap.textContent = noms.length
    ? `${noms.length} modification${noms.length > 1 ? "s" : ""} depuis l'étape précédente : ${noms.join(", ")}.`
    : "Aucune modification pour l'instant : modifiez ce qui a changé.";
}
// ---------- Confirmation après enregistrement
function confirmer(titre, texte, avecLien) {
  const blocConfirmation = $("confirmation");
  blocConfirmation.innerHTML = `<div class="conf-tete"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M7 12.5l3.2 3.2L17 9"></path></svg>
    <strong>${esc(titre)}</strong></div><p>${esc(texte)}</p>
    <div class="conf-actions"><button type="button" class="primaire petit" data-conf="liste">Revenir à la liste</button>
      <button type="button" class="secondaire petit" data-conf="nouveau">Nouveau signalement</button>
      ${avecLien ? `<button type="button" class="secondaire petit" data-conf="lien">Transmettre le lien à l'établissement</button>` : ""}
      <button type="button" class="lien-texte" data-conf="fermer">Continuer sur ce signalement</button></div>`;
  blocConfirmation.hidden = false;
  if (etatSaisie.vue === "saisie") {
    blocConfirmation.scrollIntoView({ block: "start" });
    blocConfirmation.focus({ preventScroll: true });
  }
}
function cacherConfirmation() {
  const blocConfirmation = $("confirmation");
  if (blocConfirmation && !blocConfirmation.hidden) {
    blocConfirmation.hidden = true;
    blocConfirmation.innerHTML = "";
  }
}

// Événements de la page traités ici ; appelé une fois par demarrage.js
function brancherEvenementsEnregistrement() {
  $("alerte-doublon").addEventListener("click", (evenement) => {
    const bouton = evenement.target.closest("button");
    if (!bouton) return;
    if (bouton.dataset.ouvrirDossier) {
      const id = +bouton.dataset.ouvrirDossier;
      enFile(async () => {
        try {
          await grist.setCursorPos({ rowId: id });
        } catch (_) {
          // placer le curseur de Grist est un confort : sans effet si Grist le refuse
        }
        await ouvrirDossier(id, true);
        verifierDoublons();
      });
    } else if (bouton.id === "btn-confirmer-doublon") {
      etatSaisie.doublonConfirme = cleDoublon();
      verifierDoublons();
      statut("statut-signalement", "");
    } else if (bouton.id === "btn-annuler-doublon") {
      etatSaisie.doublonConfirme = null;
      verifierDoublons();
    }
  });
  $("btn-voir-auto").addEventListener("click", () => {
    const ouvrir = $("apercu-generee").hidden;
    $("apercu-generee").hidden = !ouvrir;
    $("btn-voir-auto").setAttribute("aria-expanded", String(ouvrir));
    $("btn-voir-auto").textContent = ouvrir ? "Masquer le texte automatique" : "Voir le texte automatique";
    if (ouvrir) $("apercu-generee").textContent = descriptionGeneree();
  });
  $("description").addEventListener("input", () => {
    etatSaisie.descriptionManuelle = true;
    majEtatDescription();
  });
  $("btn-regenerer").addEventListener("click", () => {
    etatSaisie.descriptionManuelle = false;
    majDescriptionAuto();
    appliquerConditions("q", etatSaisie.defsQuestions);
    majApercuAuto();
  });
  ["input", "change"].forEach((evt) =>
    $("form-signalement").addEventListener(evt, (evenement) => {
      const id = evenement.target && evenement.target.id;
      if (id === "commentaire") return;
      if (id !== "description") majDescriptionAuto();
      majApercuAuto();
      majCouleur();
    }),
  );
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
  ["input", "change", "click"].forEach((typeEvenement) =>
    $("form-signalement").addEventListener(typeEvenement, (evenement) => {
      planifierMarques();
      if (typeEvenement !== "click" && evenement.isTrusted) cacherConfirmation();
    }),
  );
  $("confirmation").addEventListener("click", (evenement) => {
    const bouton = evenement.target.closest("[data-conf]");
    if (!bouton) return;
    const action = bouton.dataset.conf;
    if (action === "liste") {
      if (abandonAccepte()) montrerVue("accueil");
    } else if (action === "nouveau") allerNouveau();
    else if (action === "lien") {
      cacherConfirmation();
      $("bloc-contact").open = true;
      $("bloc-contact").scrollIntoView({ block: "center" });
      ($("btn-envoyer").offsetParent ? $("btn-envoyer") : $("lien")).focus();
    } else cacherConfirmation();
  });
}
