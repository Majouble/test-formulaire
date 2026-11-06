/* PRISME — widget de saisie, module 34/34 : Parcours : accueil, vue de saisie, bandeaux, démarrage du widget.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : JOURS_EN_COURS, montrerVue, abandonAccepte, allerNouveau, ouvrirDepuisListe, afficherCartes,
     dossierClos, majModeSaisie, fermerMenuActions, basculerClos, planifierMarques, majMarquesModif, resumeEtabHtml,
     majResumeEtab, dossiersEnCours, majProposition, confirmer, cacherConfirmation.
   Utilise :
     02 utilitaires : colonnesEtab.
     03 variantes : CHAMPS_NOUVEL_ETAB, refId, reglagesSaisie, statut.
     04 date-faits : dateFr, faitsAvecHeure, secondes.
     05 etat : colonneDe, etatSaisie, texteEtabBrut, valeurLigne.
     06 grist : brancherGrist, enFile.
     09 dossier : comparerVersions, jourDesFaits, lireQualificationInitiale, listeQualif, ouvrirDossier.
     10 champs : lireUnChamp.
     15 onglets : afficherDossier, afficherOnglet, focusPremiereQuestion, passerEnCreation.
     16 description : MOTIF_MOBILISATION, cleDoublon, jourDeLaVersion, jourDuFormulaire, jourFaits, memeReponse,
       verifierDoublons.
     18 liste-dossiers : construireIndexRecherche, surligneMots.
     23 couleurs : bandeCouleur.
     24 filtres-navigation : filtreActif, passeFiltre.
     25 plusieurs-jours : ouvrirReport, versionsDe.
     26 sites-esr : formulaireParSite, modeRepriseSites.
     27 reprise : reprendreReponses.
     30 visas : aViserParMoi, majBandeauCampagne, majBandeauVeille, majBandeauVisa, statutDe.
     31 autocompletion : fermer, sansAccent.
   Modifie etatSaisie : creerEtabOuvert, doublonConfirme, ficheDepliee, ficheEtabId, indexRecherche,
     minuterieMarques, modifie, modifieVisa, nbCartes, propositionMasquee, vue. */
/* =========================================================
   Parcours : accueil (nouveau / retrouver), vue de saisie, bandeau de mode,
   étapes, marques « modifié », proposition du signalement en cours, confirmation
   ========================================================= */
const JOURS_EN_COURS = 7; // un signalement dont les faits datent de moins de 7 jours est « en cours » (sauf s'il est clos)
function montrerVue(vue) {
  etatSaisie.vue = vue;
  $("accueil").hidden = vue !== "accueil";
  $("vue-saisie").hidden = vue !== "saisie";
  document.body.classList.toggle("vue-accueil", vue === "accueil");
  document.body.classList.toggle("vue-saisie", vue === "saisie");
  fermerMenuActions();
  if (vue === "accueil") {
    cacherConfirmation();
    afficherCartes();
  }
  majModeSaisie();
}
function abandonAccepte() {
  if (!(etatSaisie.modifie || etatSaisie.modifieVisa)) return true;
  if (!confirm("La saisie en cours n'est pas enregistrée. L'abandonner ?")) return false;
  etatSaisie.modifie = etatSaisie.modifieVisa = false;
  return true;
}
function allerNouveau() {
  if (!abandonAccepte()) return;
  enFile(async () => {
    cacherConfirmation();
    etatSaisie.creerEtabOuvert = false;
    etatSaisie.propositionMasquee = null;
    grist.setCursorPos({ rowId: "new" }).catch(() => {});
    await passerEnCreation();
    montrerVue("saisie");
    window.scrollTo(0, 0);
    if (etatSaisie.modeEtab) focusPremiereQuestion();
    else $("nom").focus({ preventScroll: true });
  });
}
function ouvrirDepuisListe(id) {
  if (etatSaisie.dossierId !== id && !abandonAccepte()) return;
  enFile(async () => {
    cacherConfirmation();
    etatSaisie.modifie = etatSaisie.modifieVisa = false;
    try {
      await grist.setCursorPos({ rowId: id });
    } catch (_) {
      // placer le curseur de Grist est un confort : sans effet si Grist le refuse
    }
    await ouvrirDossier(id, true);
    if (etatSaisie.dossierId === id) {
      montrerVue("saisie");
      window.scrollTo(0, 0);
      if (etatSaisie.fileVisa && !$("onglet-visas").hidden) afficherOnglet("visas");
    }
  });
}
$("porte-nouveau").addEventListener("click", allerNouveau);
$("porte-retrouver").addEventListener("click", () => {
  $("titre-liste").closest(".liste-accueil").scrollIntoView({ block: "start" });
  $("recherche-signalements").focus({ preventScroll: true });
});
$("btn-retour-liste").addEventListener("click", () => {
  if (!abandonAccepte()) return;
  montrerVue("accueil");
  window.scrollTo(0, 0);
});

// ---------- Liste des signalements de l'accueil (cartes)
function afficherCartes() {
  const listeCartes = $("cartes-signalements");
  if (!listeCartes) return;
  if (!etatSaisie.indexRecherche) construireIndexRecherche();
  $("titre-liste").textContent = etatSaisie.modeEtab ? "Vos signalements" : "Signalements";
  $("porte-nouveau-texte").textContent = etatSaisie.modeEtab
    ? "Un événement à signaler dans votre établissement."
    : "Un événement à signaler dans un établissement.";
  $("porte-retrouver-texte").textContent = etatSaisie.modeEtab
    ? "Consulter ou actualiser vos signalements."
    : "Consulter ou actualiser un signalement existant.";
  majBandeauVisa();
  majBandeauCampagne();
  majBandeauVeille();
  const recherche = $("recherche-signalements").value.trim(),
    mots = sansAccent(recherche).split(/\s+/).filter(Boolean);
  const base0 = etatSaisie.fileVisa
    ? etatSaisie.indexRecherche.filter((entree) => aViserParMoi(entree.l))
    : etatSaisie.indexRecherche;
  const base = filtreActif() ? base0.filter((entree) => passeFiltre(entree.l)) : base0;
  const trouves = mots.length ? base.filter((entree) => mots.every((mot) => entree.cle.includes(mot))) : base;
  const activite = (entree) => secondes(valeurLigne(entree.der, "Date")) ?? jourDesFaits(entree.der) ?? 0;
  const tries = [...trouves].sort((a, b) => activite(b) - activite(a) || b.l.id - a.l.id);
  const colonneDossier = colonneDe("Dossier"),
    nombreVersionsParDossier = new Map();
  for (const ligne of etatSaisie.enregistrements) {
    const dossierId = refId(colonneDossier && ligne[colonneDossier]) || ligne.id;
    nombreVersionsParDossier.set(dossierId, (nombreVersionsParDossier.get(dossierId) || 0) + 1);
  }
  const total = base0.length;
  $("titre-liste").textContent = etatSaisie.fileVisa ? "Dossiers à viser" : $("titre-liste").textContent;
  $("nb-liste").textContent = !total
    ? ""
    : trouves.length === total
      ? `${total} signalement${total > 1 ? "s" : ""}`
      : `${trouves.length} sur ${total}`;
  const styleQ = (qualification) => {
    const couleur = (etatSaisie.couleurs || {})[qualification] || {};
    return couleur.fillColor ? ` style="--c:${couleur.textColor || "#161616"};--c-bg:${couleur.fillColor}"` : "";
  };
  listeCartes.innerHTML =
    tries
      .slice(0, etatSaisie.nbCartes)
      .map((entree) => {
        const titre = etatSaisie.modeEtab
          ? `Signalement n° ${entree.l.id}`
          : entree.e[colonnesEtab.nom] || texteEtabBrut(entree.l) || `Signalement n° ${entree.l.id}`;
        const nombreVersions = nombreVersionsParDossier.get(entree.l.id) || 1,
          clos = !!(colonneDe("Clos") && valeurLigne(entree.der, "Clos"));
        const site = colonneDe("Site") ? String(valeurLigne(entree.der, "Site") || "").trim() : "";
        const dateSaisie =
          secondes(valeurLigne(entree.der, "Date")) != null
            ? dateFr(valeurLigne(entree.der, "Date"), { ...(etatSaisie.metaDate || {}), type: "Date" })
            : "";
        const dateFaitsTexte =
          !dateSaisie && secondes(valeurLigne(entree.der, "Date_faits")) != null
            ? dateFr(valeurLigne(entree.der, "Date_faits"), { type: "Date" })
            : "";
        const meta = [
          !etatSaisie.modeEtab && entree.e[colonnesEtab.commune],
          `n° ${entree.l.id}`,
          site && `site « ${site} »`,
          dateSaisie ? `dernière saisie le ${dateSaisie}` : dateFaitsTexte && `faits du ${dateFaitsTexte}`,
          nombreVersions > 1
            ? `${nombreVersions - 1} mise${nombreVersions > 2 ? "s" : ""} à jour`
            : "aucune mise à jour",
        ].filter((morceau) => morceau && typeof morceau !== "object");
        const extrait = String(valeurLigne(entree.der, "Description") || "")
          .replace(/\*\*|==/g, "")
          .replace(/\s+/g, " ")
          .slice(0, 140);
        const stC = !etatSaisie.modeEtab ? statutDe(entree.der) : "",
          svC = stC && (window.Socle.STATUTS_VALIDATION || []).find((statutValidation) => statutValidation.nom === stC);
        const qualifs =
          listeQualif(valeurLigne(entree.der, "Qualification"))
            .map((qualification) => `<span class="pastille"${styleQ(qualification)}>${esc(qualification)}</span>`)
            .join("") +
          (stC
            ? `<span class="pastille pastille-statut"${svC ? ` style="--c:${svC.texte};--c-bg:${svC.fond}"` : ""} title="Statut de validation">${esc(stC)}</span>`
            : "");
        return `<li><button type="button" class="carte-sig" data-id="${entree.l.id}"${bandeCouleur(entree.l)}>
      <span class="carte-corps"><span class="carte-titre"><strong>${surligneMots(titre, mots)}</strong>${qualifs}${clos ? '<span class="badge-clos">Clos</span>' : ""}</span>
      <span class="carte-meta">${esc(meta.join(" · "))}</span>${extrait ? `<span class="carte-extrait">${surligneMots(extrait, mots)}</span>` : ""}</span>
      <span class="carte-fleche" aria-hidden="true">›</span></button></li>`;
      })
      .join("") ||
    `<li class="vide">${total ? `Aucun signalement ne correspond${recherche ? ` à « ${esc(recherche)} »` : " au filtre"}.` : etatSaisie.fileVisa ? "Aucun dossier à viser dans votre périmètre." : "Aucun signalement pour l'instant."}</li>`;
  $("plus-cartes").hidden = tries.length <= etatSaisie.nbCartes;
}
$("cartes-signalements").addEventListener("click", (evenement) => {
  const carte = evenement.target.closest(".carte-sig");
  if (carte) ouvrirDepuisListe(+carte.dataset.id);
});
$("cartes-signalements").addEventListener("keydown", (evenement) => {
  if (evenement.key !== "ArrowDown" && evenement.key !== "ArrowUp") return;
  const cartes = [...$("cartes-signalements").querySelectorAll(".carte-sig")],
    i = cartes.indexOf(document.activeElement);
  if (i < 0) return;
  evenement.preventDefault();
  if (evenement.key === "ArrowUp" && i === 0) {
    $("recherche-signalements").focus();
    return;
  }
  const carteVoisine = cartes[Math.max(0, Math.min(cartes.length - 1, i + (evenement.key === "ArrowDown" ? 1 : -1)))];
  if (carteVoisine) carteVoisine.focus();
});
$("plus-cartes").addEventListener("click", () => {
  etatSaisie.nbCartes += 30;
  afficherCartes();
});

// ---------- Bandeau de mode (nouveau / mise à jour / clos) et menu « Autres actions »
const dossierClos = () =>
  !!(colonneDe("Clos") && etatSaisie.dossierId && etatSaisie.derniere && valeurLigne(etatSaisie.derniere, "Clos"));
function majModeSaisie() {
  const maj = !!(etatSaisie.dossierId && etatSaisie.initiale),
    clos = maj && dossierClos(),
    corpsDocument = document.body;
  corpsDocument.classList.toggle("mode-nouveau", !maj);
  corpsDocument.classList.toggle("mode-maj", maj);
  corpsDocument.classList.toggle("mode-clos", clos);
  $("etiquette-mode").hidden = !maj;
  $("etiquette-mode").textContent = maj
    ? `Mise à jour · dossier n° ${etatSaisie.dossierId}${clos ? " · clos" : ""}`
    : "";
  $("phrase-mode").textContent = maj
    ? clos
      ? "Ce signalement est clos. Enregistrer une mise à jour le rouvre."
      : "Modifiez uniquement ce qui a changé : votre enregistrement s'ajoute comme nouvelle étape, l'état précédent reste dans l'historique."
    : etatSaisie.modeEtab
      ? "Décrivez les faits, puis enregistrez."
      : "Trois étapes : l'établissement, les faits, puis la description. Un dossier sera créé à l'enregistrement.";
  $("libelle-etape-etab").textContent =
    maj || etatSaisie.modeEtab ? "Établissement" : "Quel établissement est concerné ?";
  $("act-clore").hidden = !(maj && colonneDe("Clos"));
  $("act-reporter").hidden = !(maj && colonneDe("Date_faits") && reglagesSaisie().plusieursJours && !faitsAvecHeure());
  $("act-clore-titre").textContent = clos ? "Rouvrir le signalement" : "Clore le signalement";
  $("act-clore-texte").textContent = clos ? "La situation reprend" : "La situation est terminée";
  majMarquesModif();
}
function fermerMenuActions(rendreFocus) {
  if ($("liste-actions").hidden) return;
  $("liste-actions").hidden = true;
  $("btn-autres").setAttribute("aria-expanded", "false");
  if (rendreFocus) $("btn-autres").focus();
}
$("btn-autres").addEventListener("click", () => {
  const ouvrir = $("liste-actions").hidden;
  $("liste-actions").hidden = !ouvrir;
  $("btn-autres").setAttribute("aria-expanded", String(ouvrir));
  if (ouvrir) $("act-corriger").focus();
});
$("liste-actions").addEventListener("keydown", (evenement) => {
  const items = [...$("liste-actions").querySelectorAll('[role="menuitem"]')].filter(
      (elementMenu) => !elementMenu.hidden,
    ),
    i = items.indexOf(document.activeElement);
  if (evenement.key === "ArrowDown" || evenement.key === "ArrowUp") {
    evenement.preventDefault();
    const k = (i + (evenement.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[k].focus();
  } else if (evenement.key === "Escape") {
    evenement.preventDefault();
    fermerMenuActions(true);
  } else if (evenement.key === "Tab") fermerMenuActions(false);
});
document.addEventListener("click", (evenement) => {
  if (!$("menu-actions").contains(evenement.target)) fermerMenuActions(false);
});
$("act-corriger").addEventListener("click", () => {
  fermerMenuActions(false);
  $("btn-corriger").click();
});
$("act-annuler").addEventListener("click", () => {
  fermerMenuActions(false);
  $("btn-effacer").click();
});
$("act-reporter").addEventListener("click", () => {
  fermerMenuActions(false);
  ouvrirReport();
});
$("act-clore").addEventListener("click", () => {
  fermerMenuActions(false);
  enFile(basculerClos);
});
async function basculerClos() {
  if (!colonneDe("Clos") || !etatSaisie.derniere) return;
  const clore = !dossierClos();
  if (
    clore &&
    !confirm(
      "Clore ce signalement ? La situation sera considérée comme terminée ; une nouvelle mise à jour le rouvrira.",
    )
  )
    return;
  try {
    await grist.getTable().update({ id: etatSaisie.derniere.id, fields: { [colonneDe("Clos")]: clore } });
    etatSaisie.derniere[colonneDe("Clos")] = clore;
    etatSaisie.indexRecherche = null;
    afficherDossier();
    confirmer(
      clore ? "Signalement clos" : "Signalement rouvert",
      clore
        ? `Le dossier n° ${etatSaisie.dossierId} est clos. Un prochain événement dans cet établissement fera l'objet d'un nouveau signalement.`
        : `Le dossier n° ${etatSaisie.dossierId} est de nouveau en cours.`,
    );
  } catch (erreur) {
    statut("statut-signalement", `Échec : ${erreur.message || erreur}.`, "err");
  }
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
  const noms = [],
    marquer = (cible, nom) => {
      if (cible) cible.classList.add("modifie");
      noms.push(nom);
    };
  const tri = (valeur) => listeQualif(valeur).map(String).sort().join("|");
  if (
    colonneDe("Qualification") &&
    tri(lireQualificationInitiale()) !== tri(valeurLigne(etatSaisie.derniere, "Qualification"))
  )
    marquer(
      $("qualifs-initiales").closest("fieldset"),
      (etatSaisie.metaSig[colonneDe("Qualification")] || {}).libelle || "Qualification",
    );
  if (colonneDe("Site") && $("site").value.trim() !== String(valeurLigne(etatSaisie.derniere, "Site") || "").trim())
    marquer($("bloc-site"), "Site / bâtiment");
  for (const question of etatSaisie.defsQuestions) {
    if (question.formule) continue;
    const bloc = document.querySelector(`[data-champ="q-${question.colId}"]`);
    if (!bloc || bloc.hidden) continue;
    if (!memeReponse(question, lireUnChamp("q", question), etatSaisie.derniere[question.colId]))
      marquer(bloc, question.libelle || question.colId);
  }
  const sansMention = (texte) =>
    String(texte || "")
      .replace(MOTIF_MOBILISATION, "")
      .replace(/\s+/g, " ")
      .trim();
  if (
    colonneDe("Description") &&
    sansMention($("description").value) !== sansMention(valeurLigne(etatSaisie.derniere, "Description"))
  )
    marquer($("description").closest(".champ"), "Description");
  recap.hidden = false;
  recap.classList.toggle("avec", noms.length > 0);
  recap.textContent = noms.length
    ? `${noms.length} modification${noms.length > 1 ? "s" : ""} depuis l'étape précédente : ${noms.join(", ")}.`
    : "Aucune modification pour l'instant : modifiez ce qui a changé.";
}
["input", "change", "click"].forEach((typeEvenement) =>
  $("form-signalement").addEventListener(typeEvenement, (evenement) => {
    planifierMarques();
    if (typeEvenement !== "click" && evenement.isTrusted) cacherConfirmation();
  }),
);

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
$("btn-voir-fiche").addEventListener("click", () => {
  etatSaisie.ficheDepliee = !etatSaisie.ficheDepliee;
  majResumeEtab();
});
$("btn-creer-etab").addEventListener("click", () => {
  etatSaisie.creerEtabOuvert = true;
  fermer();
  majResumeEtab();
  if (!$("nom").value.trim()) $("nom").focus();
  else $("type").focus();
  statut("statut-signalement", "");
});
function dossiersEnCours(etabId) {
  if (!etabId) return [];
  const colonneDossier = colonneDe("Dossier"),
    dern = new Map(),
    nombreVersionsParDossier = new Map();
  for (const ligne of etatSaisie.enregistrements) {
    if (refId(valeurLigne(ligne, "Etablissement")) !== etabId) continue;
    const dossierId = refId(colonneDossier && ligne[colonneDossier]) || ligne.id;
    nombreVersionsParDossier.set(dossierId, (nombreVersionsParDossier.get(dossierId) || 0) + 1);
    const derniereConnue = dern.get(dossierId);
    if (!derniereConnue || comparerVersions(derniereConnue, ligne) < 0) dern.set(dossierId, ligne);
  }
  const limite = Date.now() / 1000 - JOURS_EN_COURS * 86400;
  return [...dern]
    .filter(
      ([, ligne]) =>
        !(colonneDe("Clos") && valeurLigne(ligne, "Clos")) &&
        ((jourDesFaits(ligne) ?? 0) >= limite || (secondes(valeurLigne(ligne, "Date")) ?? 0) >= limite),
    )
    .map(([dossierId, ligne]) => ({
      d: dossierId,
      l: ligne,
      n: nombreVersionsParDossier.get(dossierId) || 1,
      initiale: etatSaisie.enregistrements.find((enregistrement) => enregistrement.id === dossierId) || ligne,
    }))
    .sort((a, b) => comparerVersions(b.l, a.l));
}
function majProposition() {
  const bloc = $("proposition-encours");
  const enCreation =
    !etatSaisie.dossierId &&
    etatSaisie.etabCourant &&
    !etatSaisie.reaffectation &&
    etatSaisie.propositionMasquee !== etatSaisie.etabCourant.id;
  const liste = enCreation ? dossiersEnCours(etatSaisie.etabCourant.id) : [];
  bloc.hidden = !liste.length;
  document.body.classList.toggle("proposition-visible", liste.length > 0);
  if (!liste.length) {
    bloc.innerHTML = "";
    return;
  }
  const ligne = (dossierPropose) => {
    const debut = jourDesFaits(dossierPropose.initiale),
      qualificationsTexte = listeQualif(valeurLigne(dossierPropose.l, "Qualification")).join(", ");
    return `Dossier n° ${dossierPropose.d}${qualificationsTexte ? " · " + qualificationsTexte : ""}${debut != null ? " · du " + jourFaits(debut) : ""} · ${dossierPropose.n > 1 ? `${dossierPropose.n - 1} mise${dossierPropose.n > 2 ? "s" : ""} à jour` : "aucune mise à jour"}`;
  };
  // Un dossier par jour : celui du même jour s'actualise ; celui d'un jour précédent sert de point de départ
  const jour = jourDuFormulaire(),
    memeJour = liste.filter((dossierPropose) =>
      versionsDe(dossierPropose.d).some((version) => jourDeLaVersion(version) === jour),
    ),
    avant = liste.filter((dossierPropose) => !memeJour.includes(dossierPropose));
  // formulaire par site, reprise désactivée : rien à reprendre des jours précédents (seul le signalement du même jour est proposé)
  if (!memeJour.length && formulaireParSite() && modeRepriseSites() === "non") {
    bloc.hidden = true;
    bloc.innerHTML = "";
    document.body.classList.remove("proposition-visible");
    return;
  }
  bloc.innerHTML = memeJour.length
    ? `<p class="prop-titre">${memeJour.length > 1 ? `${memeJour.length} signalements existent` : "Un signalement existe"} déjà pour cet établissement ce jour-là</p>
      <ul>${memeJour
        .slice(0, 3)
        .map(
          (dossierPropose) => `<li><span>${esc(ligne(dossierPropose))}</span>
        <button type="button" class="maj-plein petit" data-actualiser="${dossierPropose.d}">Actualiser ce signalement</button></li>`,
        )
        .join("")}</ul>
      <p class="note">S'il s'agit des mêmes faits, actualisez-le plutôt que d'en créer un nouveau.</p>
      <button type="button" class="maj-contour petit" data-autre-evenement="1">Non, c'est un autre événement</button>`
    : `<p class="prop-titre">${avant.length > 1 ? `${avant.length} signalements récents` : "Un signalement récent"} pour cet établissement</p>
      <ul>${avant
        .slice(0, 3)
        .map(
          (dossierPropose) => `<li><span>${esc(ligne(dossierPropose))}</span>
        <button type="button" class="maj-plein petit" data-reprendre="${dossierPropose.d}">${formulaireParSite() ? "Reprendre ses sites" : "Reprendre ses réponses"}</button></li>`,
        )
        .join("")}</ul>
      <p class="note">Un signalement par jour : celui du ${esc(jour)} sera un nouveau dossier. ${
        formulaireParSite()
          ? "Si la situation continue, reprenez les sites du signalement choisi dans leur dernier état, puis confirmez ou modifiez chaque site."
          : "Si la situation continue, reprenez les réponses du précédent, puis modifiez ce qui a changé."
      }</p>
      <button type="button" class="maj-contour petit" data-autre-evenement="1">Partir d'un formulaire vide</button>`;
}
$("proposition-encours").addEventListener("click", (evenement) => {
  const bouton = evenement.target.closest("button");
  if (!bouton) return;
  if (bouton.dataset.actualiser) {
    etatSaisie.modifie = etatSaisie.modifieVisa = false;
    ouvrirDepuisListe(+bouton.dataset.actualiser);
  } else if (bouton.dataset.reprendre) enFile(() => reprendreReponses(+bouton.dataset.reprendre));
  else if (bouton.dataset.autreEvenement) {
    etatSaisie.propositionMasquee = etatSaisie.etabCourant ? etatSaisie.etabCourant.id : null;
    // vaut confirmation qu'il s'agit de faits distincts : l'alerte « même jour » ne redemande pas
    if (typeof cleDoublon === "function") {
      etatSaisie.doublonConfirme = cleDoublon();
      verifierDoublons();
    }
    majProposition();
    focusPremiereQuestion();
  }
});

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

montrerVue("accueil");

// tout le code du widget est chargé : branchement sur Grist (voir 06-grist.js)
brancherGrist();
