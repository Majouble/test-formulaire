/* PRISME — widget de saisie, domaines/etablissement/affichage.js
   Domaine : l'établissement : référentiel (et sa copie locale), fiche, mail et lien d'accès, correction — affichage
   (page et événements).
   Chargé par saisie/index.html dans l'ordre : fondations, composants, domaines, demarrage.js. Les fichiers partagent
   leurs noms (scripts classiques, sans import) : au chargement, un fichier ne fait que définir. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : majAlertePageEtab, finaliserReferentiel, apresChargementEtabs, alerterSection, alerterRattachement,
     afficherEtablissement, carteHtml, majBoutonEnvoi, lireSaisieNouvelEtab, majBandeauCampagne,
     majBoutonsCorrection, quitterReaffectation, proposerRattachement, resumeEtabHtml, majResumeEtab,
     brancherEvenementsEtablissement.
   Utilise :
     fondations/configuration : ETAB, colonnesEtab.
     fondations/outils : colonneDe, lisible, secondes, statut, typeBase, valeurLigne.
     fondations/etat : etatSaisie.
     fondations/grist : enFile, metaColonnes.
     composants/recherche-etablissement : fermerSuggestions.
     composants/onglets : afficherDossier.
     domaines/formulaire/regles : varianteSaisie.
     domaines/etablissement/regles : CHAMPS_NOUVEL_ETAB, alerteLiensEtab, calculerRattachementSection,
       campagnesDeLEtab, colonneChampFiche, construireMailto, etabDe, etabDeLigne, etabParUai, extraireUrl,
       infoSection, libelleChampFiche, nettoieMail, rattachementDe, valeurChampFiche.
     domaines/etablissement/donnees : completerLienEtab, creerEtabDepuisSuggestion.
     domaines/dossier/affichage : majListeDossiers, majProposition, remplirFormulaire.
     domaines/enregistrement/affichage : majDescriptionAuto, rienASignaler, verifierDoublons.
     domaines/sites-esr/affichage : reprendreSitesAuto.
   Modifie etatSaisie : champsFiche, creerEtabOuvert, dossierCorrection, etabCourant, etabPropose, ficheDepliee,
     ficheEtabId, ligneAnnuaire, modifie, reaffectation, referentielLu, sectionGardee. */
// Page des établissements ouverte par un compte de la cellule (propriétaire, agent) : tout le référentiel est visible,
// pas de préremplissage ; un établissement, lui, arrive par son lien et ne voit que sa ligne.
function majAlertePageEtab() {
  const alerte = $("alerte-page-etab");
  if (!alerte) return;
  if (!etatSaisie.pageEtab || !etatSaisie.referentielLu || etatSaisie.modeEtab) {
    alerte.hidden = true;
    return;
  }
  const sansCle = !(etatSaisie.colsEtab || []).includes(colonnesEtab.cle);
  alerte.innerHTML = `<strong>Page des établissements, vue avec votre compte</strong> : vous voyez tous les établissements, le formulaire n'est donc pas prérempli.
    Un établissement arrive par son lien personnel et ne voit que sa fiche. Pour le vérifier, ouvrez un lien dans une <strong>fenêtre de navigation privée</strong> (sans être connecté à Grist).
    ${sansCle ? `<br><span style="color:var(--erreur)">Les liens n'existent pas encore dans ${esc(ETAB.table)} (colonne « ${esc(colonnesEtab.cle)} » absente) : administration, onglet Établissements, terminer la mise en place.</span>` : ""}`;
  alerte.hidden = false;
}
function finaliserReferentiel(erreur, alertes) {
  etatSaisie.referentielLu = true;
  majAlertePageEtab();
  const liste = [...alertes];
  const liens = alerteLiensEtab();
  if (liens && !etatSaisie.modeEtab) liste.push(liens);
  if (etatSaisie.alerteTableRef && !etatSaisie.modeEtab) liste.push(etatSaisie.alerteTableRef);
  if (erreur)
    liste.push(
      /access|acc[eè]s|blocked|denied|refus|permission/i.test(String(erreur.message || erreur))
        ? `Accès refusé à la table « ${ETAB.table} ». Si vous êtes arrivé par un lien personnel, il n'est plus valable (lien renouvelé ou expiré, agent retiré de l'équipe) : demandez un nouveau lien à la cellule.`
        : `Table « ${ETAB.table} » inaccessible (${erreur.message || erreur}).`,
    );
  $("alerte").textContent = liste.join(" ");
  $("alerte").hidden = !liste.length;
  $("btn-config").hidden = etatSaisie.modeEtab;
  // Points techniques (horloge, structure du référentiel) : utiles à l'administrateur seulement, dans les réglages
  const techniques = etatSaisie.modeEtab
    ? []
    : [etatSaisie.alerteHorloge, !erreur && etatSaisie.alerteStructure].filter(Boolean);
  $("cfg-alertes").innerHTML = techniques.length
    ? `<strong>Points techniques à vérifier</strong>${techniques.map((texte) => `<p style="margin:6px 0 0">${esc(texte)}</p>`).join("")}`
    : "";
  $("cfg-alertes").hidden = !techniques.length;
  $("btn-config").classList.toggle("a-signaler", techniques.length > 0);
  $("btn-config").title = techniques.length
    ? `${techniques.length} point(s) technique(s) à vérifier dans le diagnostic`
    : "Diagnostic de la page";
}
// Le référentiel vient d'arriver : on complète ce qui en dépend, sans perdre une saisie en cours
async function apresChargementEtabs() {
  if (etatSaisie.dossierId && etatSaisie.initiale) {
    etatSaisie.etabCourant = etabDeLigne(etatSaisie.initiale);
    if (!etatSaisie.modifie) await remplirFormulaire(); // réévalue aussi la description (en-tête établissement)
    afficherDossier();
  } else {
    if (etatSaisie.modeEtab) etatSaisie.etabCourant = etatSaisie.etabs[0] || null;
    if (!etatSaisie.modifie)
      $("sous-titre").textContent = etatSaisie.modeEtab ? "" : "Identifiez l'établissement par son nom ou son UAI.";
    afficherEtablissement();
    majListeDossiers();
  }
}
function alerterSection(etablissement) {
  const bloc = $("alerte-section");
  const section = etablissement && Socle && Socle.genreSection ? infoSection(etablissement) : null,
    genre = section ? Socle.genreSection(section.nature, section.type, section.nom) : null;
  if (!genre || etatSaisie.sectionGardee === section.id) {
    bloc.hidden = !(genre && etatSaisie.sectionGardee === section.id);
    if (bloc.hidden) bloc.innerHTML = "";
    return;
  }
  const rattachementPropose = calculerRattachementSection(section, genre);
  bloc.innerHTML = `<strong>⚠ Vous avez choisi une ${esc(genre)}</strong>, section rattachée à un ${genre === "SEP" || genre === "SGT" ? "lycée" : "collège"} :
    le signalement doit porter sur l'établissement, sinon il est compté à part (et souvent deux fois).
    ${
      rattachementPropose
        ? `<div class="actions-doublon"><button type="button" class="lien-texte" id="btn-choisir-rattachement">Choisir ${esc(rattachementPropose.etab.nom || "l'établissement")}${rattachementPropose.etab.commune ? ` (${esc(rattachementPropose.etab.commune)})` : ""} à la place</button>
      <button type="button" class="lien-texte" id="btn-garder-section">Garder la ${esc(genre)}</button></div>`
        : `<div class="extrait">Établissement de rattachement introuvable à proximité : recherchez-le par son nom. <button type="button" class="lien-texte" id="btn-garder-section">Garder la ${esc(genre)}</button></div>`
    }`;
  bloc.classList.remove("confirme");
  bloc.hidden = false;
  if (rattachementPropose)
    $("btn-choisir-rattachement").addEventListener("click", () => {
      etatSaisie.etabCourant = rattachementPropose.etab.ligne;
      etatSaisie.ligneAnnuaire = null;
      etatSaisie.modifie = true;
      afficherEtablissement();
    });
  $("btn-garder-section").addEventListener("click", () => {
    etatSaisie.sectionGardee = section.id;
    bloc.classList.add("confirme");
    bloc.innerHTML = `${esc(genre)} conservée à votre demande.`;
  });
}
function alerterRattachement() {
  const bandeau = $("alerte-rattachement");
  if (!bandeau) return;
  const composante = etatSaisie.composanteChoisie,
    etablissementParent = composante && rattachementDe(composante);
  if (
    !composante ||
    !etablissementParent ||
    !etatSaisie.etabCourant ||
    etablissementParent.id !== etatSaisie.etabCourant.id ||
    etatSaisie.dossierId ||
    etatSaisie.modeEtab
  ) {
    bandeau.hidden = true;
    bandeau.innerHTML = "";
    return;
  }
  const niveau = String(composante.Niveau || ""),
    quoi = /site|campus/i.test(niveau) ? "un site rattaché" : "une composante rattachée";
  bandeau.innerHTML = `<strong>${esc(composante[colonnesEtab.nom])}</strong> est ${quoi} à <strong>${esc(etablissementParent[colonnesEtab.nom])}</strong> : le dossier est ouvert sur l'établissement,
    pour qu'il ne soit pas compté deux fois. Précisez la composante ou son site dans le signalement.`;
  bandeau.hidden = false;
  const colonneSite = colonneDe("Site"),
    champSite = colonneSite && $(`q-${colonneSite}`);
  if (champSite && /^(INPUT|TEXTAREA)$/.test(champSite.tagName) && !champSite.value.trim()) {
    champSite.value = String(composante[colonnesEtab.nom] ?? "");
    champSite.dispatchEvent(new Event("input", { bubbles: true }));
  }
}
function afficherEtablissement() {
  queueMicrotask(majDescriptionAuto); // le jour de mobilisation dépend de l'établissement
  queueMicrotask(verifierDoublons);
  const creation = !etatSaisie.dossierId;
  const connu = !!etatSaisie.etabCourant;
  $("bloc-recherche").hidden = !(creation && !etatSaisie.modeEtab && !connu);
  $("btn-changer-etab").hidden = !(creation && !etatSaisie.modeEtab && connu);
  if (typeof majBoutonsCorrection === "function") majBoutonsCorrection();
  $("carte-etab").innerHTML = connu ? carteHtml(etatSaisie.etabCourant) : "";
  alerterSection(creation && connu && !etatSaisie.modeEtab ? etatSaisie.etabCourant : null);
  alerterRattachement();
  if (creation && connu) setTimeout(reprendreSitesAuto, 0);
  majResumeEtab();
  majProposition();

  // Contact et lien : réservés aux agents
  $("bloc-contact").hidden = etatSaisie.modeEtab || !(connu || etatSaisie.ligneAnnuaire || $("nom").value.trim());
  if (etatSaisie.modeEtab) return;
  const mailEnregistre = connu ? nettoieMail(etatSaisie.etabCourant[colonnesEtab.mail]) : "";
  const mailAnnuaire = connu
    ? nettoieMail(etatSaisie.etabCourant[colonnesEtab.mailAnnuaire])
    : nettoieMail($("mail").dataset.saisi);
  if (document.activeElement !== $("mail"))
    $("mail").value = connu ? mailEnregistre || mailAnnuaire : $("mail").dataset.saisi || "";
  const aide = $("aide-mail");
  if (connu && !mailEnregistre && mailAnnuaire) {
    aide.innerHTML =
      "Adresse issue de l'annuaire. Cliquez sur « Enregistrer » pour la conserver comme adresse de l'établissement.";
    aide.hidden = false;
  } else if (connu && mailAnnuaire && mailEnregistre !== mailAnnuaire) {
    aide.innerHTML = `Adresse de l'annuaire : <strong>${esc(mailAnnuaire)}</strong> <button type="button" class="lien-texte" id="btn-mail-annuaire">utiliser celle-ci</button>`;
    aide.hidden = false;
    $("btn-mail-annuaire").addEventListener("click", () => {
      $("mail").value = mailAnnuaire;
      majBoutonEnvoi();
    });
  } else if (!connu && mailAnnuaire) {
    aide.textContent = "Adresse issue de l'annuaire, enregistrée avec l'établissement.";
    aide.hidden = false;
  } else aide.hidden = true;
  $("btn-mail").hidden = !connu;
  if (connu) completerLienEtab(etatSaisie.etabCourant);
  const lien =
    connu && lisible(etatSaisie.etabCourant[colonnesEtab.lien])
      ? extraireUrl(etatSaisie.etabCourant[colonnesEtab.lien])
      : "";
  $("lien").value = lien;
  $("lien").placeholder = connu
    ? `Lien absent : vérifiez les formules des colonnes ${colonnesEtab.cle} et ${colonnesEtab.lien}`
    : "Disponible après l'enregistrement du signalement";
  $("btn-copier").disabled = !lien;
  majBoutonEnvoi();
  const aMail = !!$("mail").value.trim();
  $("resume-contact").textContent =
    `(${aMail ? "mail renseigné" : "pas de mail"}, ${lien ? "lien disponible" : "lien indisponible"})`;
}
function carteHtml(etablissement) {
  return varianteSaisie()
    .fiche.map((champFiche) => [
      champFiche.lib || libelleChampFiche(champFiche.col),
      valeurChampFiche(etablissement, champFiche.col),
    ])
    .filter(([, valeur]) => valeur != null && valeur !== "")
    .map(([libelle, valeur]) => `<dt>${esc(libelle)}</dt><dd>${esc(valeur)}</dd>`)
    .join("");
}
function majBoutonEnvoi() {
  const boutonEnvoi = $("btn-envoyer");
  const lien = $("lien").value,
    mail = $("mail").value.trim();
  const nomEtab = etatSaisie.etabCourant ? etatSaisie.etabCourant[colonnesEtab.nom] : $("nom").value.trim();
  if (!lien || !mail) {
    boutonEnvoi.setAttribute("aria-disabled", "true");
    boutonEnvoi.removeAttribute("href");
    boutonEnvoi.title = !mail ? "Renseignez le mail de l'établissement" : "Le lien n'est pas encore disponible";
    return;
  }
  boutonEnvoi.removeAttribute("aria-disabled");
  boutonEnvoi.title = "";
  boutonEnvoi.href = construireMailto(mail, lien, nomEtab);
}
// Lit dans la page les champs de l'établissement à créer (uai brut et valeurs nettoyées)
function lireSaisieNouvelEtab() {
  return {
    uaiBrut: $("uai").value,
    uai: $("uai").value.trim().toUpperCase(),
    nom: $("nom").value.trim(),
    type: $("type").value.trim(),
    academie: $("academie").value.trim(),
    departement: $("departement").value.trim(),
    mail: $("mail").value.trim(),
  };
}
function majBandeauCampagne() {
  const bandeau = $("bandeau-campagne");
  if (!bandeau) return;
  const campagnesVisees = campagnesDeLEtab();
  if (!campagnesVisees.length) {
    bandeau.hidden = true;
    return;
  }
  const saisies = etatSaisie.enregistrements
    .map((ligne) => secondes(valeurLigne(ligne, "Date")))
    .filter((saisie) => saisie != null);
  const attente = campagnesVisees.filter(
    (campagne) => !saisies.some((saisie) => Socle.reponseCompte(campagne, saisie)),
  );
  bandeau.hidden = false;
  bandeau.classList.toggle("ok", !attente.length);
  if (!attente.length) {
    bandeau.innerHTML = `<p>✓ ${campagnesVisees.length > 1 ? "Vos réponses sont enregistrées" : `Votre réponse à « ${esc(campagnesVisees[0].nom)} » est enregistrée`}${campagnesVisees.some((campagne) => campagne.mode === "quotidienne") ? " pour aujourd'hui" : ""}. Merci.</p>`;
    return;
  }
  const campagneEnAttente = attente[0],
    jour = campagneEnAttente.mode === "quotidienne";
  bandeau.innerHTML = `<p><span class="grand">Réponse attendue${jour ? " aujourd'hui" : ""} : « ${esc(campagneEnAttente.nom)} ».</span>
    Signalez tout événement concernant votre établissement ; s'il n'y a rien à signaler, répondez en un clic.</p>
    <button type="button" class="primaire" id="btn-rien-a-signaler">Rien à signaler</button>`;
  $("btn-rien-a-signaler").addEventListener("click", rienASignaler);
}
function majBoutonsCorrection() {
  if (etatSaisie.dossierCorrection !== etatSaisie.dossierId) {
    // autre signalement ouvert (ou nouveau) : on referme les corrections en cours
    etatSaisie.dossierCorrection = etatSaisie.dossierId;
    etatSaisie.reaffectation = false;
    etatSaisie.etabPropose = null;
    $("bloc-rattacher").hidden = true;
    $("bloc-fiche").hidden = true;
  }
  const connu = !!etatSaisie.etabCourant,
    dossier = !!etatSaisie.dossierId;
  $("btn-rattacher").hidden = !(dossier && !etatSaisie.modeEtab && connu && !etatSaisie.reaffectation);
  $("btn-corriger-fiche").hidden = !(
    !etatSaisie.modeEtab &&
    connu &&
    !etatSaisie.reaffectation &&
    $("bloc-fiche").hidden
  );
  if (etatSaisie.reaffectation) {
    $("bloc-recherche").hidden = false;
  }
  majResumeEtab();
  $("bloc-reaffectation").hidden = !etatSaisie.reaffectation;
}
function quitterReaffectation() {
  etatSaisie.reaffectation = false;
  etatSaisie.etabPropose = null;
  $("nom").value = "";
  fermerSuggestions();
  $("bloc-rattacher").hidden = true;
  statut("statut-rattacher", "");
  afficherEtablissement();
}
// Choix dans la liste en mode rattachement : demande de confirmation
function proposerRattachement(resultat) {
  fermerSuggestions();
  const existant = (resultat.ligne && etabDe(resultat.ligne.id)) || resultat.ligne || etabParUai(resultat.uai);
  if (existant && etatSaisie.etabCourant && existant.id === etatSaisie.etabCourant.id) {
    statut("statut-rattacher", "C'est déjà l'établissement de ce signalement.", "err");
    $("bloc-rattacher").hidden = false;
    $("btn-rattacher-ok").hidden = true;
    return;
  }
  etatSaisie.etabPropose = existant || { suggestion: resultat };
  const nomNouveau = existant ? existant[colonnesEtab.nom] : resultat.nom,
    uaiNouveau = existant ? existant[colonnesEtab.uai] : resultat.uai;
  const nombreVersions = etatSaisie.versions.length;
  $("rattacher-texte").innerHTML =
    `Rattacher le dossier n° ${etatSaisie.dossierId} (${nombreVersions} version${nombreVersions > 1 ? "s" : ""}) à <strong>${esc(nomNouveau || "")}</strong>${uaiNouveau ? ` (${esc(uaiNouveau)})` : ""}` +
    ` au lieu de <strong>${esc(etatSaisie.etabCourant ? etatSaisie.etabCourant[colonnesEtab.nom] : "")}</strong> ?` +
    (existant ? "" : " Cet établissement sera ajouté au référentiel.");
  $("btn-rattacher-ok").hidden = false;
  statut("statut-rattacher", "");
  $("bloc-rattacher").hidden = false;
  $("btn-rattacher-ok").focus();
}
// ---------- Établissement : résumé d'une ligne, fiche dépliable, création sur demande, signalement en cours
function resumeEtabHtml(ligneEtablissement) {
  const reste = [
    ligneEtablissement[colonnesEtab.type],
    ligneEtablissement[colonnesEtab.commune],
    ligneEtablissement[colonnesEtab.uai],
  ]
    .filter((valeur) => valeur && typeof valeur !== "object")
    .map((valeur) => esc(valeur))
    .join(" · ");
  return `<strong>${esc(ligneEtablissement[colonnesEtab.nom] || "")}</strong>${reste ? ` <span class="meta">· ${reste}</span>` : ""}`;
}
function majResumeEtab() {
  const connu = !!etatSaisie.etabCourant;
  if (!connu || etatSaisie.etabCourant.id !== etatSaisie.ficheEtabId) {
    etatSaisie.ficheDepliee = false;
    etatSaisie.ficheEtabId = connu ? etatSaisie.etabCourant.id : null;
  }
  $("resume-etab").hidden = !connu;
  if (connu) $("resume-etab-texte").innerHTML = resumeEtabHtml(etatSaisie.etabCourant);
  $("carte-etab").hidden = !connu || !etatSaisie.ficheDepliee;
  $("btn-voir-fiche").setAttribute("aria-expanded", String(etatSaisie.ficheDepliee));
  $("btn-voir-fiche").textContent = etatSaisie.ficheDepliee ? "Masquer la fiche" : "Voir la fiche";
  const creationVisible =
    !etatSaisie.reaffectation &&
    (etatSaisie.creerEtabOuvert || !!etatSaisie.ligneAnnuaire || CHAMPS_NOUVEL_ETAB.some((k) => $(k).value.trim()));
  $("bloc-nouvel-etab").hidden = !creationVisible;
  $("btn-creer-etab").hidden = etatSaisie.reaffectation || creationVisible || etatSaisie.modeEtab;
}

// Événements de la page traités ici ; appelé une fois par demarrage.js
function brancherEvenementsEtablissement() {
  $("mail").addEventListener("input", () => {
    if (!etatSaisie.etabCourant) $("mail").dataset.saisi = $("mail").value;
    majBoutonEnvoi();
  });
  $("btn-mail").addEventListener("click", async () => {
    if (!etatSaisie.etabCourant) return;
    const mail = $("mail").value.trim();
    if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      statut("statut-signalement", "Adresse mail invalide.", "err");
      return;
    }
    try {
      await grist.getTable(ETAB.table).update({ id: etatSaisie.etabCourant.id, fields: { [colonnesEtab.mail]: mail } });
      etatSaisie.etabCourant[colonnesEtab.mail] = mail;
      statut("statut-signalement", "Mail de l'établissement enregistré.", "ok");
    } catch (erreur) {
      statut("statut-signalement", `Échec : ${erreur.message || erreur}`, "err");
    }
  });
  $("btn-copier").addEventListener("click", async () => {
    const champ = $("lien");
    try {
      await navigator.clipboard.writeText(champ.value);
    } catch (_) {
      champ.select();
      document.execCommand("copy");
    }
    $("btn-copier").textContent = "Copié";
    setTimeout(() => {
      $("btn-copier").textContent = "Copier";
    }, 1500);
  });
  $("btn-changer-etab").addEventListener("click", () => {
    etatSaisie.etabCourant = null;
    etatSaisie.ligneAnnuaire = null;
    ["nom", ...CHAMPS_NOUVEL_ETAB].forEach((k) => {
      $(k).value = "";
      $(k).classList.remove("auto");
    });
    $("mail").dataset.saisi = "";
    afficherEtablissement();
    $("nom").focus();
  });
  $("btn-rattacher").addEventListener("click", () => {
    etatSaisie.reaffectation = true;
    etatSaisie.etabPropose = null;
    $("bloc-fiche").hidden = true;
    $("nom").value = "";
    afficherEtablissement();
    $("nom").focus();
  });
  $("btn-reaffectation-annuler").addEventListener("click", () => {
    quitterReaffectation();
    $("btn-rattacher").focus();
  });
  $("btn-rattacher-annuler").addEventListener("click", () => {
    $("bloc-rattacher").hidden = true;
    etatSaisie.etabPropose = null;
    $("nom").focus();
  });
  $("btn-rattacher-ok").addEventListener("click", () =>
    enFile(async () => {
      if (!etatSaisie.etabPropose || !etatSaisie.dossierId) return;
      const boutonConfirmer = $("btn-rattacher-ok");
      boutonConfirmer.disabled = true;
      try {
        const nouvelId = etatSaisie.etabPropose.suggestion
          ? await creerEtabDepuisSuggestion(etatSaisie.etabPropose.suggestion)
          : etatSaisie.etabPropose.id;
        if (!nouvelId) throw new Error("établissement introuvable");
        const colonneEtablissement = colonneDe("Etablissement");
        await grist
          .getTable()
          .update(
            etatSaisie.versions.map((version) => ({ id: version.id, fields: { [colonneEtablissement]: nouvelId } })),
          );
        for (const version of etatSaisie.versions) version[colonneEtablissement] = nouvelId; // en attendant le retour de Grist
        etatSaisie.etabCourant = etabDe(nouvelId);
        quitterReaffectation();
        afficherDossier();
        majDescriptionAuto();
        statut(
          "statut-signalement",
          "Signalement rattaché au nouvel établissement. Si la description cite l'ancien nom, corrigez-la puis enregistrez.",
          "ok",
        );
      } catch (erreur) {
        statut(
          "statut-rattacher",
          `Échec : ${erreur.message || erreur}. Vos droits ne permettent peut-être pas de modifier ce signalement.`,
          "err",
        );
      } finally {
        boutonConfirmer.disabled = false;
      }
    }),
  );
  $("btn-corriger-fiche").addEventListener("click", async () => {
    if (!etatSaisie.etabCourant) return;
    let meta = {};
    try {
      meta = (await metaColonnes(ETAB.table)) || {};
    } catch (_) {
      // structure illisible (lien d'établissement, règles d'accès) : on continue sans
    }
    const vus = new Set();
    etatSaisie.champsFiche = [
      ["@nom", "Nom"],
      ...varianteSaisie().fiche.map((champFiche) => [
        champFiche.col,
        champFiche.lib || libelleChampFiche(champFiche.col),
      ]),
    ]
      .map(([k, libelle]) => [k.replace(/^@/, "").replace(/[^\w-]/g, "_"), libelle, colonneChampFiche(k)])
      .filter(([, , colonne]) => {
        if (!colonne || vus.has(colonne)) return false;
        vus.add(colonne);
        const metaColonne = meta[colonne];
        return (
          etatSaisie.colsEtab.includes(colonne) &&
          (!metaColonne || (!metaColonne.formule && ["Text", "Choice", "Any"].includes(typeBase(metaColonne.type))))
        );
      });
    if (!etatSaisie.champsFiche.length) {
      statut("statut-fiche", "Aucune colonne modifiable dans la fiche (colonnes formules ou références).", "err");
      $("bloc-fiche").hidden = false;
      return;
    }
    $("fiche-champs").innerHTML = etatSaisie.champsFiche
      .map(
        ([k, libelle, colonne]) =>
          `<div class="champ"><label for="fiche-${k}">${esc(libelle)}</label><input type="text" id="fiche-${k}" value="${esc(etatSaisie.etabCourant[colonne] ?? "")}"${colonne === colonnesEtab.uai ? ' maxlength="8"' : ""}></div>`,
      )
      .join("");
    statut("statut-fiche", "");
    $("bloc-fiche").hidden = false;
    etatSaisie.reaffectation = false;
    afficherEtablissement();
    $(`fiche-${etatSaisie.champsFiche[0][0]}`).focus();
  });
  $("btn-fiche-annuler").addEventListener("click", () => {
    $("bloc-fiche").hidden = true;
    afficherEtablissement();
    $("btn-corriger-fiche").focus();
  });
  $("btn-fiche-ok").addEventListener("click", () =>
    enFile(async () => {
      if (!etatSaisie.etabCourant) return;
      const fields = {};
      for (const [k, , colonne] of etatSaisie.champsFiche) {
        let valeur = $(`fiche-${k}`).value.trim();
        if (colonne === colonnesEtab.uai) valeur = valeur.toUpperCase();
        if (valeur !== String(etatSaisie.etabCourant[colonne] ?? "")) fields[colonne] = valeur;
      }
      if (!Object.keys(fields).length) {
        statut("statut-fiche", "Aucune modification.", "err");
        return;
      }
      if (colonnesEtab.nom in fields && !fields[colonnesEtab.nom]) {
        statut("statut-fiche", "Le nom ne peut pas être vide.", "err");
        return;
      }
      if (colonnesEtab.uai in fields && fields[colonnesEtab.uai]) {
        const autre = etabParUai(fields[colonnesEtab.uai]);
        if (autre && autre.id !== etatSaisie.etabCourant.id) {
          statut(
            "statut-fiche",
            `L'UAI ${fields[colonnesEtab.uai]} est déjà celui de « ${autre[colonnesEtab.nom]} ».`,
            "err",
          );
          return;
        }
      }
      try {
        await grist.getTable(ETAB.table).update({ id: etatSaisie.etabCourant.id, fields });
        Object.assign(etatSaisie.etabCourant, fields);
        $("bloc-fiche").hidden = true;
        if (etatSaisie.dossierId) afficherDossier();
        else afficherEtablissement();
        majDescriptionAuto();
        statut("statut-signalement", "Fiche de l'établissement corrigée (pour tous ses signalements).", "ok");
      } catch (erreur) {
        statut(
          "statut-fiche",
          `Échec : ${erreur.message || erreur}. Vos droits ne permettent peut-être pas de modifier le référentiel.`,
          "err",
        );
      }
    }),
  );
  $("btn-voir-fiche").addEventListener("click", () => {
    etatSaisie.ficheDepliee = !etatSaisie.ficheDepliee;
    majResumeEtab();
  });
  $("btn-creer-etab").addEventListener("click", () => {
    etatSaisie.creerEtabOuvert = true;
    fermerSuggestions();
    majResumeEtab();
    if (!$("nom").value.trim()) $("nom").focus();
    else $("type").focus();
    statut("statut-signalement", "");
  });
}
