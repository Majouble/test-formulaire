/* PRISME — widget de saisie, composants/onglets.js
   Composant : onglets, en-tête et menu de la vue de saisie.
   Chargé par saisie/index.html dans l'ordre : fondations, composants, domaines, demarrage.js. Les fichiers partagent
   leurs noms (scripts classiques, sans import) : au chargement, un fichier ne fait que définir. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : afficherOnglet, afficherDossier, majModeSaisie, fermerMenuActions, brancherEvenementsOnglets.
   Utilise :
     fondations/configuration : colonnesEtab.
     fondations/outils : colonneDe, dateFr, listeQualif, secondes, valeurLigne.
     fondations/etat : etatSaisie.
     composants/date-faits : faitsAvecHeure.
     domaines/formulaire/regles : commentaireActive, varianteSaisie.
     domaines/formulaire/affichage : styleChoix.
     domaines/etablissement/affichage : afficherEtablissement.
     domaines/dossier/regles : dossierClos.
     domaines/dossier/affichage : afficherHistorique, majListeDossiers.
     domaines/enregistrement/affichage : majMarquesModif.
     domaines/visas/regles : statutDe. */
function afficherOnglet(nom) {
  ["signalement", "historique", "visas"].forEach((onglet) => {
    $(`onglet-${onglet}`).setAttribute("aria-selected", String(onglet === nom));
    $(`onglet-${onglet}`).tabIndex = onglet === nom ? 0 : -1; // seul l'onglet actif est dans l'ordre de tabulation
    $(`panneau-${onglet}`).hidden = onglet !== nom;
  });
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
  $("act-reporter").hidden = !(maj && colonneDe("Date_faits") && varianteSaisie().plusieursJours && !faitsAvecHeure());
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

// Événements de la page traités ici ; appelé une fois par demarrage.js
function brancherEvenementsOnglets() {
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
}
