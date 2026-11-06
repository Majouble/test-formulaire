/* PRISME — widget de saisie, module 28/34 : Signalement : création, puis mise à jour par nouvelle version.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : remplirFormulaire, signalerChampsManquants, enregistrerSignalement, controlerAvantEnregistrement,
     enregistrerCorrection, enregistrerMiseAJour, enregistrerCreation, conseilEchecEnregistrement.
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
  if (!colonneDe("Etablissement")) {
    statut(
      "statut-signalement",
      `Colonne de l'établissement introuvable dans la table « ${etatSaisie.tableId || "?"} » : voir ⚙ Réglages › « Colonnes et référentiel utilisés ».`,
      "err",
    );
    return null;
  }
  const manquants = [];
  if (!etatSaisie.dossierId && !etatSaisie.modeEtab && !etatSaisie.etabCourant && !$("nom").value.trim())
    manquants.push("l'établissement");
  if (!$("description").value.trim()) manquants.push("la description");
  if (colonneDe("Date_faits") && !$("date-faits").value) manquants.push("la date des faits");
  if (colonneDe("Date_faits") && dateFaitsFuture() && !reglagesSaisie().faitsFuturs) {
    statut("statut-signalement", "La date des faits ne peut pas être postérieure à aujourd'hui.", "err");
    $("date-faits").setAttribute("aria-invalid", "true");
    $("date-faits").focus();
    return null;
  }
  if (
    colonneDe("Date_faits") &&
    lireDateFaits() != null &&
    lireDateFaits() > Date.now() / 1000 + LIMITE_FUTUR_JOURS * UN_JOUR
  ) {
    statut("statut-signalement", "La date des faits est à plus d'un an : vérifiez-la.", "err");
    $("date-faits").setAttribute("aria-invalid", "true");
    $("date-faits").focus();
    return null;
  }
  const erreurJours = !correction ? erreurPlusieursJours() : "";
  if (erreurJours) {
    statut("statut-signalement", erreurJours, "err");
    $("date-fin").focus();
    return null;
  }
  const jours = correction ? [] : joursSuivants();
  const reponses = lireChamps("q", etatSaisie.defsQuestions, manquants);
  const qualif = lireQualificationInitiale();
  if (!qualif || (Array.isArray(qualif) && !qualif.length)) manquants.push("la qualification");
  if (manquants.length) {
    statut("statut-signalement", `Renseignez ${manquants.join(", ")}.`, "err");
    signalerChampsManquants();
    return null;
  }

  const valeurs = { ...reponses };
  if (colonneDe("Description")) valeurs[colonneDe("Description")] = $("description").value.trim();
  if (colonneDe("Site")) valeurs[colonneDe("Site")] = $("site").value.trim();
  if (colonneDe("Date_faits")) valeurs[colonneDe("Date_faits")] = lireDateFaits();
  if (colonneDe("Qualification"))
    valeurs[colonneDe("Qualification")] = Array.isArray(qualif) ? (qualif.length ? ["L", ...qualif] : null) : qualif;

  if (etatSaisie.dossierId && !etatSaisie.initiale) {
    statut(
      "statut-signalement",
      "Le signalement affiché n'est plus disponible. Rechargez le widget avant d'enregistrer.",
      "err",
    );
    return null;
  }
  // Mise à jour : l'établissement affiché doit être celui du dossier
  if (
    etatSaisie.dossierId &&
    etatSaisie.initiale &&
    etatSaisie.etabCourant &&
    etatSaisie.etabCourant.id !== refId(valeurLigne(etatSaisie.initiale, "Etablissement"))
  ) {
    statut(
      "statut-signalement",
      "L'établissement affiché ne correspond pas à celui du signalement ouvert : enregistrement annulé. Rouvrez le signalement depuis le menu.",
      "err",
    );
    return null;
  }
  if (!correction && !etatSaisie.dossierId) {
    verifierDoublons();
    if (doublonsDuJour().length && etatSaisie.doublonConfirme !== cleDoublon()) {
      if (document.body.classList.contains("proposition-visible")) {
        statut(
          "statut-signalement",
          "Un signalement est déjà en cours pour cet établissement : actualisez-le, ou répondez « Non, c'est un autre événement » dans l'encadré orange de l'étape 1.",
          "err",
        );
        const boutonProposition = $("proposition-encours").querySelector("button");
        if (boutonProposition) {
          boutonProposition.scrollIntoView({ block: "center" });
          boutonProposition.focus({ preventScroll: true });
        }
        return null;
      }
      statut(
        "statut-signalement",
        "Un signalement existe déjà pour cet établissement ce jour-là : ouvrez-le pour le mettre à jour, ou confirmez qu'il s'agit de faits distincts (encadré orange).",
        "err",
      );
      const boutonDoublon = $("alerte-doublon").querySelector("button");
      if (boutonDoublon) boutonDoublon.focus();
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
  if (correction && !(etatSaisie.dossierId && etatSaisie.initiale && etatSaisie.derniere)) {
    statut("statut-signalement", "Ouvrez d'abord un signalement à corriger.", "err");
    return null;
  }
  if (etatSaisie.dossierId && !correction && !colonneDe("Dossier")) {
    statut(
      "statut-signalement",
      "Mise à jour impossible : aucune colonne « Dossier » n'est associée au widget. Ajoutez à la table une colonne « Dossier » " +
        "de type Référence vers cette même table, puis associez-la dans le panneau du widget (ou corrigez la dernière version).",
      "err",
    );
    return null;
  }
  return { valeurs, jours };
}

// Correction : la dernière version est modifiée sur place
async function enregistrerCorrection(table, valeurs) {
  // Correction : la dernière version est modifiée sur place ; aucune nouvelle ligne, donc aucun message Tchap.
  // L'établissement, le dossier, la nature et la date de saisie ne changent pas.
  const fields = seulementModifies(etatSaisie.champsVersion, valeurs, etatSaisie.derniere);
  if (
    colonneDe("Date_faits") &&
    valeurs[colonneDe("Date_faits")] !== undefined &&
    !egal(valeurs[colonneDe("Date_faits")], secondes(etatSaisie.derniere[colonneDe("Date_faits")]))
  )
    fields[colonneDe("Date_faits")] = valeurs[colonneDe("Date_faits")];
  if (!Object.keys(fields).length && confidentielsModifies()) {
    const errT = await synchroniserTableaux(etatSaisie.dossierId, false);
    finConfidentiels();
    etatSaisie.modifie = false;
    statut(
      "statut-signalement",
      "Données confidentielles enregistrées (aucune nouvelle étape)." + texteErreursTableaux(errT),
      errT.length ? "err" : "ok",
    );
    return;
  }
  if (!Object.keys(fields).length) {
    statut("statut-signalement", "Aucune modification à corriger.", "err");
    return;
  }
  await etape("Correction de la dernière version", etatSaisie.tableId || "réponses", () =>
    table.update({ id: etatSaisie.derniere.id, fields }),
  );
  Object.assign(etatSaisie.derniere, fields);
  etatSaisie.modifie = false;
  const errT = [
    ...(await synchroniserTableaux(etatSaisie.dossierId, true, etatSaisie.derniere.id)),
    ...(await purgerSitesSupprimes(etatSaisie.dossierId)),
  ];
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
    statut(
      "statut-signalement",
      "Données confidentielles enregistrées (aucune nouvelle étape)." + texteErreursTableaux(errT),
      errT.length ? "err" : "ok",
    );
    return;
  }
  // La nouvelle version devient-elle la dernière (faits les plus récents) ? Sinon la table dédiée garde ses lignes.
  const faitsNouveaux = colonneDe("Date_faits") ? lireDateFaits() : null,
    faitsDerniere = etatSaisie.derniere ? jourDesFaits(etatSaisie.derniere) : null;
  const devientDerniere = faitsNouveaux == null || faitsDerniere == null || faitsNouveaux >= faitsDerniere;
  if (!change && !jours.length && !(afficherCommentaire() && $("commentaire").value.trim())) {
    statut(
      "statut-signalement",
      afficherCommentaire()
        ? "Modifiez au moins une réponse ou ajoutez un commentaire."
        : "Modifiez au moins une réponse avant de mettre à jour.",
      "err",
    );
    return;
  }
  const fusion = fusionnerAvecVersionRecente(valeurs);
  if (
    fusion.conflits.length &&
    !confirm(
      `Une mise à jour de ce dossier a été enregistrée pendant votre saisie${auteurDe(etatSaisie.derniere)}.\n\n` +
        `Vous avez tous deux modifié : ${fusion.conflits.join(", ")}.\n\nOK : enregistrer vos réponses pour ces questions (les autres apports de votre collègue sont conservés).\nAnnuler : revenir au formulaire.`,
    )
  )
    return;
  Object.assign(valeurs, fusion.valeurs);
  const fields = {
    ...valeurs,
    [colonneDe("Etablissement")]: refId(valeurLigne(etatSaisie.initiale, "Etablissement")), // l'établissement du dossier, et lui seul
    ...(colonneDe("Dossier") ? { [colonneDe("Dossier")]: etatSaisie.dossierId } : {}),
  };
  if (colonneDe("Date") && !dateParGrist()) fields[colonneDe("Date")] = Date.now() / 1000;
  if (colonneDe("Nature")) fields[colonneDe("Nature")] = NATURE.suivi;
  if (colonneDe("Commentaire")) fields[colonneDe("Commentaire")] = com;
  const id = idDe(
    await etape("Création de la nouvelle version", etatSaisie.tableId || "réponses", () => table.create({ fields })),
  );
  if (id) idsCreesIci.add(id);
  const serie =
    id && jours.length
      ? await reprendreSurJours(refId(valeurLigne(etatSaisie.initiale, "Etablissement")), valeurs, jours, faitsNouveaux)
      : null;
  etatSaisie.modifie = false;
  $("commentaire").value = "";
  const errT = id
    ? [
        ...(await synchroniserTableaux(etatSaisie.dossierId, devientDerniere, id)),
        ...(await purgerSitesSupprimes(etatSaisie.dossierId)),
      ]
    : [];
  finConfidentiels();
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
  if (id) {
    try {
      await grist.setCursorPos({ rowId: id });
    } catch (_) {
      // placer le curseur de Grist est un confort : sans effet si Grist le refuse
    }
  }
}

// Création : premier signalement d'un dossier
async function enregistrerCreation(table, valeurs, jours) {
  const etabId = await etablissementPourCreation();
  if (!etabId) throw new Error("établissement introuvable");
  const fields = { ...valeurs, [colonneDe("Etablissement")]: etabId };
  if (colonneDe("Date") && !dateParGrist()) fields[colonneDe("Date")] = Date.now() / 1000;
  if (colonneDe("Nature")) fields[colonneDe("Nature")] = NATURE.initial;
  const id = idDe(
    await etape("Création du signalement", etatSaisie.tableId || "réponses", () => table.create({ fields })),
  );
  if (id) idsCreesIci.add(id);
  if (id && colonneDe("Dossier"))
    await etape("Rattachement du signalement à son propre dossier", etatSaisie.tableId || "réponses", () =>
      table.update({ id, fields: { [colonneDe("Dossier")]: id } }),
    );
  const serie = id && jours.length ? await reprendreSurJours(etabId, valeurs, jours, lireDateFaits()) : null;
  etatSaisie.modifie = false;
  etatSaisie.selectionAttendue = id;
  const errT = id ? await synchroniserTableaux(id, true, id) : [];
  finConfidentiels();
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
  try {
    await grist.setCursorPos({ rowId: id });
  } catch (_) {
    // placer le curseur de Grist est un confort : sans effet si Grist le refuse
  }
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
