/* PRISME — widget de saisie, module 28/34 : Signalement : création, puis mise à jour par nouvelle version.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* =========================================================
   Signalement : création, puis mise à jour par nouvelle version
   ========================================================= */
async function remplirFormulaire() {
  const ref = etatSaisie.derniere || etatSaisie.initiale;
  etatSaisie.versionAffichee = ref ? { ...ref } : null;
  $("description").value = (ref ? val(ref, "Description") : "") ?? "";
  $("site").value = (ref && col("Site") ? val(ref, "Site") : "") ?? "";
  cocherQualif(ref ? val(ref, "Qualification") : "");
  // Mise à jour : un dossier par jour ; les nouveautés sont datées par défaut du jour du dossier
  const precedente = ref && col("Date_faits") ? val(ref, "Date_faits") : null;
  initialiserDateFaits(secondes(precedente) != null ? precedente : null);
  delete $("aide-date-faits").dataset.base;
  $("aide-date-faits").classList.remove("alerte-faits");
  $("aide-date-faits").textContent =
    secondes(precedente) != null
      ? `Jour de ce signalement. Pour un autre jour, créez un nouveau signalement (« Autres actions › Reporter sur d'autres jours »).`
      : aideFaitsDefaut();
  reinitialiserJours();
  majAideJours();
  await remplirChamps("q", etatSaisie.defsQuestions, (d) => (ref ? ref[d.colId] : null));
  // formulaire par site : la qualification suit les sites tant qu'elle leur correspond
  if (sitesCtrl()) {
    const dq = qualifDesSites(),
      q0 = plusGrave(listeQualif(lireQualificationInitiale()));
    etatSaisie.qualifTouchee = !!(q0 && dq && dq.plusGrave && q0 !== dq.plusGrave);
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
  const marquer = (el, vide) => {
    if (!el) return;
    if (vide) {
      el.setAttribute("aria-invalid", "true");
      el.setAttribute("aria-describedby", "statut-signalement");
      invalides.push(el);
    } else {
      el.removeAttribute("aria-invalid");
    }
  };
  if (!etatSaisie.dossierId && !etatSaisie.modeEtab && !etatSaisie.etabCourant)
    marquer($("nom"), !$("nom").value.trim());
  const q = lireQualificationInitiale();
  const premierChoix = $("qualifs-initiales").querySelector("input");
  marquer(premierChoix, !q || (Array.isArray(q) && !q.length));
  for (const def of etatSaisie.defsQuestions) {
    if (!def.obligatoire || def.formule) continue;
    const bloc = document.querySelector(`[data-champ="q-${def.colId}"]`);
    if (!bloc || bloc.hidden) continue;
    const el = bloc.querySelector("input, select, textarea");
    marquer(el, typeBase(def.type) === "Bool" ? !boolRepondu("q", def) : estVide(def, lireUnChamp("q", def)));
  }
  for (const def of etatSaisie.defsQuestions) {
    // nombres hors bornes ([positif], [min], [max])
    const bloc = document.querySelector(`[data-champ="q-${def.colId}"]`);
    const v = bloc && !bloc.hidden ? lireUnChamp("q", def) : null;
    if (typeof v === "number" && horsBornes(def, v)) marquer(bloc.querySelector("input"), true);
  }
  for (const def of etatSaisie.defsQuestions) {
    // lignes incomplètes des questions « tableau »
    const c = def.tableau && tableaux[`q-${def.colId}`];
    if (!c || !c.verifier().length) continue;
    c.montrerErreurs = true;
    c.majLignes();
    const el = c.el.querySelector(
      ".ligne-rep.incomplete .en-erreur input, .ligne-rep.incomplete .en-erreur select, .ligne-rep.incomplete .en-erreur textarea, .ligne-rep.incomplete .en-erreur summary",
    );
    if (el) invalides.push(el);
  }
  marquer($("description"), !$("description").value.trim());
  if (invalides.length) invalides[0].focus();
}
// Un champ corrigé perd son marquage d'erreur
$("form-signalement").addEventListener(
  "input",
  (ev) => ev.target.removeAttribute && ev.target.removeAttribute("aria-invalid"),
);
$("form-signalement").addEventListener("change", (ev) => {
  const g = ev.target.closest && ev.target.closest(".choix-groupe");
  (g ? g.querySelectorAll("[aria-invalid]") : [ev.target]).forEach(
    (el) => el.removeAttribute && el.removeAttribute("aria-invalid"),
  );
});

$("form-signalement").addEventListener("submit", (ev) => {
  ev.preventDefault();
  enFile(() => enregistrerSignalement(false));
});
$("btn-corriger").addEventListener("click", () => enFile(() => enregistrerSignalement(true)));
// Entrée dans un champ d'une ligne ne doit pas enregistrer le signalement par accident :
// l'enregistrement se fait par le bouton (Entrée ou Espace quand il a le focus).
$("form-signalement").addEventListener("keydown", (ev) => {
  const el = ev.target;
  if (ev.key === "Enter" && el.tagName === "INPUT" && !["button", "submit", "checkbox", "radio"].includes(el.type))
    ev.preventDefault();
});

/* Enregistrement d'un signalement, en quatre temps : contrôles de la saisie, puis correction de la dernière version,
   mise à jour (nouvelle version du dossier) ou création ; en cas d'échec, message et conseil selon les droits. */
async function enregistrerSignalement(correction = false) {
  const saisie = controlerAvantEnregistrement(correction);
  if (!saisie) return;
  const { valeurs, jours } = saisie;
  const btn = $("btn-signalement");
  btn.setAttribute("aria-disabled", "true");
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
  } catch (e) {
    statut(
      "statut-signalement",
      `Échec de l'enregistrement. ${e.message || e}.${conseilEchecEnregistrement(e, correction)}`,
      "err",
    );
  } finally {
    btn.removeAttribute("aria-disabled");
    $("btn-corriger").removeAttribute("aria-disabled");
  }
}

// Contrôles avant d'écrire : champs obligatoires, dates, établissement du dossier, doublons, sites. Affiche le
// message et renvoie null si l'enregistrement ne peut pas se faire ; sinon { valeurs, jours } (valeurs des colonnes,
// jours suivants où reporter les faits).
function controlerAvantEnregistrement(correction) {
  // Correction : sauf si l'utilisateur l'a changée, la date des faits reste celle de la version corrigée
  // (le formulaire propose la date du jour, qui ne vaut que pour une nouvelle mise à jour).
  if (correction && etatSaisie.derniere && col("Date_faits") && !etatSaisie.dateFaitsTouchee) {
    const d = val(etatSaisie.derniere, "Date_faits");
    if (secondes(d) != null) {
      initialiserDateFaits(d);
      majDescriptionAuto();
    }
  }
  if (!col("Etablissement")) {
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
  if (col("Date_faits") && !$("date-faits").value) manquants.push("la date des faits");
  if (col("Date_faits") && dateFaitsFuture() && !S().faitsFuturs) {
    statut("statut-signalement", "La date des faits ne peut pas être postérieure à aujourd'hui.", "err");
    $("date-faits").setAttribute("aria-invalid", "true");
    $("date-faits").focus();
    return null;
  }
  if (
    col("Date_faits") &&
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
  if (col("Description")) valeurs[col("Description")] = $("description").value.trim();
  if (col("Site")) valeurs[col("Site")] = $("site").value.trim();
  if (col("Date_faits")) valeurs[col("Date_faits")] = lireDateFaits();
  if (col("Qualification"))
    valeurs[col("Qualification")] = Array.isArray(qualif) ? (qualif.length ? ["L", ...qualif] : null) : qualif;

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
    etatSaisie.etabCourant.id !== refId(val(etatSaisie.initiale, "Etablissement"))
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
        const pb = $("proposition-encours").querySelector("button");
        if (pb) {
          pb.scrollIntoView({ block: "center" });
          pb.focus({ preventScroll: true });
        }
        return null;
      }
      statut(
        "statut-signalement",
        "Un signalement existe déjà pour cet établissement ce jour-là : ouvrez-le pour le mettre à jour, ou confirmez qu'il s'agit de faits distincts (encadré orange).",
        "err",
      );
      const b = $("alerte-doublon").querySelector("button");
      if (b) b.focus();
      return null;
    }
  }
  const btn = $("btn-signalement");
  if (btn.getAttribute("aria-disabled") === "true") return null; // enregistrement déjà en cours
  if (!controleSites()) {
    const f = $("qualifs-initiales").closest("fieldset");
    f.scrollIntoView({ block: "center" });
    return null;
  }
  if (correction && !(etatSaisie.dossierId && etatSaisie.initiale && etatSaisie.derniere)) {
    statut("statut-signalement", "Ouvrez d'abord un signalement à corriger.", "err");
    return null;
  }
  if (etatSaisie.dossierId && !correction && !col("Dossier")) {
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
    col("Date_faits") &&
    valeurs[col("Date_faits")] !== undefined &&
    !egal(valeurs[col("Date_faits")], secondes(etatSaisie.derniere[col("Date_faits")]))
  )
    fields[col("Date_faits")] = valeurs[col("Date_faits")];
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
  const com = col("Commentaire") ? commentaireComplet() : "";
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
  const faitsNouveaux = col("Date_faits") ? lireDateFaits() : null,
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
    [col("Etablissement")]: refId(val(etatSaisie.initiale, "Etablissement")), // l'établissement du dossier, et lui seul
    ...(col("Dossier") ? { [col("Dossier")]: etatSaisie.dossierId } : {}),
  };
  if (col("Date") && !dateParGrist()) fields[col("Date")] = Date.now() / 1000;
  if (col("Nature")) fields[col("Nature")] = NATURE.suivi;
  if (col("Commentaire")) fields[col("Commentaire")] = com;
  const id = idDe(
    await etape("Création de la nouvelle version", etatSaisie.tableId || "réponses", () => table.create({ fields })),
  );
  if (id) idsCreesIci.add(id);
  const serie =
    id && jours.length
      ? await reprendreSurJours(refId(val(etatSaisie.initiale, "Etablissement")), valeurs, jours, faitsNouveaux)
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
    `Étape ${etatSaisie.versions.length + 1} du dossier n° ${etatSaisie.dossierId}${etatSaisie.etabCourant ? " (" + etatSaisie.etabCourant[E.nom] + ")" : ""}.` +
      texteSerie(serie) +
      texteErreursTableaux(errT),
  );
  if (id) {
    try {
      await grist.setCursorPos({ rowId: id });
    } catch (_) {}
  }
}

// Création : premier signalement d'un dossier
async function enregistrerCreation(table, valeurs, jours) {
  const etabId = await etablissementPourCreation();
  if (!etabId) throw new Error("établissement introuvable");
  const fields = { ...valeurs, [col("Etablissement")]: etabId };
  if (col("Date") && !dateParGrist()) fields[col("Date")] = Date.now() / 1000;
  if (col("Nature")) fields[col("Nature")] = NATURE.initial;
  const id = idDe(
    await etape("Création du signalement", etatSaisie.tableId || "réponses", () => table.create({ fields })),
  );
  if (id) idsCreesIci.add(id);
  if (id && col("Dossier"))
    await etape("Rattachement du signalement à son propre dossier", etatSaisie.tableId || "réponses", () =>
      table.update({ id, fields: { [col("Dossier")]: id } }),
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
    `Dossier n° ${id} créé${etatSaisie.etabCourant ? " pour " + etatSaisie.etabCourant[E.nom] : ""}.` +
      texteSerie(serie) +
      (etatSaisie.modeEtab ? "" : " Vous pouvez transmettre le lien d'accès à l'établissement.") +
      texteErreursTableaux(errT),
    !etatSaisie.modeEtab,
  );
  try {
    await grist.setCursorPos({ rowId: id });
  } catch (_) {}
  afficherEtablissement();
}

// Conseil ajouté au message d'échec quand Grist refuse l'écriture (règles d'accès)
function conseilEchecEnregistrement(e, correction) {
  let conseil = "";
  if (e.acl && e.table === ETAB.table)
    conseil =
      " Cet établissement n'est pas encore dans le référentiel et vos droits ne permettent pas de l'y ajouter : " +
      (S().annuaires.length
        ? "importez-le via la mise à jour de l'annuaire, ou autorisez la création dans la table des établissements."
        : "ajoutez-le au référentiel (table des établissements), ou autorisez la création dans cette table.");
  else if (e.acl && correction)
    conseil =
      " Vos droits ne permettent pas de modifier cette version : vérifiez la règle d'accès qui autorise la correction (mise à jour de la dernière version).";
  else if (e.acl)
    conseil =
      " Vérifiez les conditions de création de votre règle d'accès : elles portent sur l'ensemble des valeurs " +
      "envoyées par le widget (établissement, date, nature, qualification…), pas seulement sur la cellule saisie.";
  return conseil;
}
