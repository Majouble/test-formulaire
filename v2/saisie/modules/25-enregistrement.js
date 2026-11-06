/* PRISME — widget de saisie, module 25/31 : Signalement : création, puis mise à jour par nouvelle version.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* =========================================================
   Signalement : création, puis mise à jour par nouvelle version
   ========================================================= */
// Le formulaire reflète toujours l'état courant, c'est-à-dire la dernière version enregistrée.
let versionAffichee = null; // copie de la version sur laquelle l'agent travaille
async function remplirFormulaire() {
  const ref = derniere || initiale;
  versionAffichee = ref ? { ...ref } : null;
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
  await remplirChamps("q", defsQuestions, (d) => (ref ? ref[d.colId] : null));
  // formulaire par site : la qualification suit les sites tant qu'elle leur correspond
  if (sitesCtrl()) {
    const dq = qualifDesSites(),
      q0 = plusGrave(listeQualif(lireQualificationInitiale()));
    qualifTouchee = !!(q0 && dq && dq.plusGrave && q0 !== dq.plusGrave);
    majQualifDeduite();
  }
  $("commentaire").value = "";
  appliquerConditions("q", defsQuestions);
  evaluerDescriptionManuelle();
  majApercuAuto();
  majCouleur();
  modifie = false;
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
  if (!dossierId && !modeEtab && !etabCourant) marquer($("nom"), !$("nom").value.trim());
  const q = lireQualificationInitiale();
  const premierChoix = $("qualifs-initiales").querySelector("input");
  marquer(premierChoix, !q || (Array.isArray(q) && !q.length));
  for (const def of defsQuestions) {
    if (!def.obligatoire || def.formule) continue;
    const bloc = document.querySelector(`[data-champ="q-${def.colId}"]`);
    if (!bloc || bloc.hidden) continue;
    const el = bloc.querySelector("input, select, textarea");
    marquer(el, typeBase(def.type) === "Bool" ? !boolRepondu("q", def) : estVide(def, lireUnChamp("q", def)));
  }
  for (const def of defsQuestions) {
    // nombres hors bornes ([positif], [min], [max])
    const bloc = document.querySelector(`[data-champ="q-${def.colId}"]`);
    const v = bloc && !bloc.hidden ? lireUnChamp("q", def) : null;
    if (typeof v === "number" && horsBornes(def, v)) marquer(bloc.querySelector("input"), true);
  }
  for (const def of defsQuestions) {
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

async function enregistrerSignalement(correction = false) {
  // Correction : sauf si l'utilisateur l'a changée, la date des faits reste celle de la version corrigée
  // (le formulaire propose la date du jour, qui ne vaut que pour une nouvelle mise à jour).
  if (correction && derniere && col("Date_faits") && !dateFaitsTouchee) {
    const d = val(derniere, "Date_faits");
    if (secondes(d) != null) {
      initialiserDateFaits(d);
      majDescriptionAuto();
    }
  }
  if (!col("Etablissement")) {
    statut(
      "statut-signalement",
      `Colonne de l'établissement introuvable dans la table « ${tableId || "?"} » : voir ⚙ Réglages › « Colonnes et référentiel utilisés ».`,
      "err",
    );
    return;
  }
  const manquants = [];
  if (!dossierId && !modeEtab && !etabCourant && !$("nom").value.trim()) manquants.push("l'établissement");
  if (!$("description").value.trim()) manquants.push("la description");
  if (col("Date_faits") && !$("date-faits").value) manquants.push("la date des faits");
  if (col("Date_faits") && dateFaitsFuture() && !S().faitsFuturs) {
    statut("statut-signalement", "La date des faits ne peut pas être postérieure à aujourd'hui.", "err");
    $("date-faits").setAttribute("aria-invalid", "true");
    $("date-faits").focus();
    return;
  }
  if (
    col("Date_faits") &&
    lireDateFaits() != null &&
    lireDateFaits() > Date.now() / 1000 + LIMITE_FUTUR_JOURS * UN_JOUR
  ) {
    statut("statut-signalement", "La date des faits est à plus d'un an : vérifiez-la.", "err");
    $("date-faits").setAttribute("aria-invalid", "true");
    $("date-faits").focus();
    return;
  }
  const erreurJours = !correction ? erreurPlusieursJours() : "";
  if (erreurJours) {
    statut("statut-signalement", erreurJours, "err");
    $("date-fin").focus();
    return;
  }
  const jours = correction ? [] : joursSuivants();
  const reponses = lireChamps("q", defsQuestions, manquants);
  const qualif = lireQualificationInitiale();
  if (!qualif || (Array.isArray(qualif) && !qualif.length)) manquants.push("la qualification");
  if (manquants.length) {
    statut("statut-signalement", `Renseignez ${manquants.join(", ")}.`, "err");
    signalerChampsManquants();
    return;
  }

  const valeurs = { ...reponses };
  if (col("Description")) valeurs[col("Description")] = $("description").value.trim();
  if (col("Site")) valeurs[col("Site")] = $("site").value.trim();
  if (col("Date_faits")) valeurs[col("Date_faits")] = lireDateFaits();
  if (col("Qualification"))
    valeurs[col("Qualification")] = Array.isArray(qualif) ? (qualif.length ? ["L", ...qualif] : null) : qualif;

  if (dossierId && !initiale) {
    statut(
      "statut-signalement",
      "Le signalement affiché n'est plus disponible. Rechargez le widget avant d'enregistrer.",
      "err",
    );
    return;
  }
  // Mise à jour : l'établissement affiché doit être celui du dossier
  if (dossierId && initiale && etabCourant && etabCourant.id !== refId(val(initiale, "Etablissement"))) {
    statut(
      "statut-signalement",
      "L'établissement affiché ne correspond pas à celui du signalement ouvert : enregistrement annulé. Rouvrez le signalement depuis le menu.",
      "err",
    );
    return;
  }
  if (!correction && !dossierId) {
    verifierDoublons();
    if (doublonsDuJour().length && doublonConfirme !== cleDoublon()) {
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
        return;
      }
      statut(
        "statut-signalement",
        "Un signalement existe déjà pour cet établissement ce jour-là : ouvrez-le pour le mettre à jour, ou confirmez qu'il s'agit de faits distincts (encadré orange).",
        "err",
      );
      const b = $("alerte-doublon").querySelector("button");
      if (b) b.focus();
      return;
    }
  }
  const btn = $("btn-signalement");
  if (btn.getAttribute("aria-disabled") === "true") return; // enregistrement déjà en cours
  if (!controleSites()) {
    const f = $("qualifs-initiales").closest("fieldset");
    f.scrollIntoView({ block: "center" });
    return;
  }
  if (correction && !(dossierId && initiale && derniere)) {
    statut("statut-signalement", "Ouvrez d'abord un signalement à corriger.", "err");
    return;
  }
  if (dossierId && !correction && !col("Dossier")) {
    statut(
      "statut-signalement",
      "Mise à jour impossible : aucune colonne « Dossier » n'est associée au widget. Ajoutez à la table une colonne « Dossier » " +
        "de type Référence vers cette même table, puis associez-la dans le panneau du widget (ou corrigez la dernière version).",
      "err",
    );
    return;
  }
  btn.setAttribute("aria-disabled", "true");
  $("btn-corriger").setAttribute("aria-disabled", "true");
  try {
    const table = grist.getTable();
    if (correction && versionAffichee && derniere && versionAffichee.id !== derniere.id) {
      statut(
        "statut-signalement",
        `Une nouvelle version de ce dossier a été enregistrée pendant votre correction${auteurDe(derniere)}. Rouvrez le dossier pour partir de la version la plus récente.`,
        "err",
      );
      return;
    }
    if (correction) {
      // Correction : la dernière version est modifiée sur place ; aucune nouvelle ligne, donc aucun message Tchap.
      // L'établissement, le dossier, la nature et la date de saisie ne changent pas.
      const fields = seulementModifies(champsVersion, valeurs, derniere);
      if (
        col("Date_faits") &&
        valeurs[col("Date_faits")] !== undefined &&
        !egal(valeurs[col("Date_faits")], secondes(derniere[col("Date_faits")]))
      )
        fields[col("Date_faits")] = valeurs[col("Date_faits")];
      if (!Object.keys(fields).length && confidentielsModifies()) {
        const errT = await synchroniserTableaux(dossierId, false);
        finConfidentiels();
        modifie = false;
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
      await etape("Correction de la dernière version", tableId || "réponses", () =>
        table.update({ id: derniere.id, fields }),
      );
      Object.assign(derniere, fields);
      modifie = false;
      const errT = [
        ...(await synchroniserTableaux(dossierId, true, derniere.id)),
        ...(await purgerSitesSupprimes(dossierId)),
      ];
      statut(
        "statut-signalement",
        "Dernière étape corrigée (aucune nouvelle étape créée)." + texteErreursTableaux(errT),
        errT.length ? "err" : "ok",
      );
      confirmer(
        "Dernière étape corrigée",
        `La dernière étape du dossier n° ${dossierId} a été corrigée ; aucune nouvelle étape n'a été créée (pas de nouveau message Tchap).` +
          texteErreursTableaux(errT),
      );
    } else if (dossierId && initiale) {
      // Mise à jour : on n'écrase jamais la version précédente, on ajoute une nouvelle ligne
      // rattachée au signalement initial par la colonne Dossier.
      const com = col("Commentaire") ? commentaireComplet() : "";
      const change = Object.keys(seulementModifies(champsVersion, valeurs, derniere)).length > 0;
      // Seules des données confidentielles ont changé : pas de nouvelle version (ni de message Tchap)
      if (!change && confidentielsModifies()) {
        const errT = await synchroniserTableaux(dossierId, false);
        finConfidentiels();
        modifie = false;
        statut(
          "statut-signalement",
          "Données confidentielles enregistrées (aucune nouvelle étape)." + texteErreursTableaux(errT),
          errT.length ? "err" : "ok",
        );
        return;
      }
      // La nouvelle version devient-elle la dernière (faits les plus récents) ? Sinon la table dédiée garde ses lignes.
      const faitsNouveaux = col("Date_faits") ? lireDateFaits() : null,
        faitsDerniere = derniere ? jourDesFaits(derniere) : null;
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
          `Une mise à jour de ce dossier a été enregistrée pendant votre saisie${auteurDe(derniere)}.\n\n` +
            `Vous avez tous deux modifié : ${fusion.conflits.join(", ")}.\n\nOK : enregistrer vos réponses pour ces questions (les autres apports de votre collègue sont conservés).\nAnnuler : revenir au formulaire.`,
        )
      )
        return;
      Object.assign(valeurs, fusion.valeurs);
      const fields = {
        ...valeurs,
        [col("Etablissement")]: refId(val(initiale, "Etablissement")), // l'établissement du dossier, et lui seul
        ...(col("Dossier") ? { [col("Dossier")]: dossierId } : {}),
      };
      if (col("Date") && !dateParGrist()) fields[col("Date")] = Date.now() / 1000;
      if (col("Nature")) fields[col("Nature")] = NATURE.suivi;
      if (col("Commentaire")) fields[col("Commentaire")] = com;
      const id = idDe(
        await etape("Création de la nouvelle version", tableId || "réponses", () => table.create({ fields })),
      );
      if (id) idsCreesIci.add(id);
      const serie =
        id && jours.length
          ? await reprendreSurJours(refId(val(initiale, "Etablissement")), valeurs, jours, faitsNouveaux)
          : null;
      modifie = false;
      $("commentaire").value = "";
      const errT = id
        ? [...(await synchroniserTableaux(dossierId, devientDerniere, id)), ...(await purgerSitesSupprimes(dossierId))]
        : [];
      finConfidentiels();
      statut(
        "statut-signalement",
        "Mise à jour enregistrée : une nouvelle étape a été ajoutée." + texteSerie(serie) + texteErreursTableaux(errT),
        errT.length ? "err" : "ok",
      );
      confirmer(
        "Mise à jour enregistrée",
        `Étape ${versions.length + 1} du dossier n° ${dossierId}${etabCourant ? " (" + etabCourant[E.nom] + ")" : ""}.` +
          texteSerie(serie) +
          texteErreursTableaux(errT),
      );
      if (id) {
        try {
          await grist.setCursorPos({ rowId: id });
        } catch (_) {}
      }
    } else {
      const etabId = await etablissementPourCreation();
      if (!etabId) throw new Error("établissement introuvable");
      const fields = { ...valeurs, [col("Etablissement")]: etabId };
      if (col("Date") && !dateParGrist()) fields[col("Date")] = Date.now() / 1000;
      if (col("Nature")) fields[col("Nature")] = NATURE.initial;
      const id = idDe(await etape("Création du signalement", tableId || "réponses", () => table.create({ fields })));
      if (id) idsCreesIci.add(id);
      if (id && col("Dossier"))
        await etape("Rattachement du signalement à son propre dossier", tableId || "réponses", () =>
          table.update({ id, fields: { [col("Dossier")]: id } }),
        );
      const serie = id && jours.length ? await reprendreSurJours(etabId, valeurs, jours, lireDateFaits()) : null;
      modifie = false;
      selectionAttendue = id;
      const errT = id ? await synchroniserTableaux(id, true, id) : [];
      finConfidentiels();
      statut(
        "statut-signalement",
        (modeEtab
          ? "Signalement enregistré."
          : "Signalement enregistré. Vous pouvez transmettre le lien à l'établissement.") +
          texteSerie(serie) +
          texteErreursTableaux(errT),
        errT.length ? "err" : "ok",
      );
      confirmer(
        "Signalement enregistré",
        `Dossier n° ${id} créé${etabCourant ? " pour " + etabCourant[E.nom] : ""}.` +
          texteSerie(serie) +
          (modeEtab ? "" : " Vous pouvez transmettre le lien d'accès à l'établissement.") +
          texteErreursTableaux(errT),
        !modeEtab,
      );
      try {
        await grist.setCursorPos({ rowId: id });
      } catch (_) {}
      afficherEtablissement();
    }
  } catch (e) {
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
    statut("statut-signalement", `Échec de l'enregistrement. ${e.message || e}.${conseil}`, "err");
  } finally {
    btn.removeAttribute("aria-disabled");
    $("btn-corriger").removeAttribute("aria-disabled");
  }
}
