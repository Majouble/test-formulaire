/* PRISME — widget de saisie, module 14/31 : Onglets, affichage du dossier, en-tête.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* =========================================================
   Onglets, modes et en-tête
   ========================================================= */
function afficherOnglet(nom) {
  ["signalement", "historique", "visas"].forEach((n) => {
    $(`onglet-${n}`).setAttribute("aria-selected", String(n === nom));
    $(`onglet-${n}`).tabIndex = n === nom ? 0 : -1; // seul l'onglet actif est dans l'ordre de tabulation
    $(`panneau-${n}`).hidden = n !== nom;
  });
}
// Clavier : flèches gauche/droite, Début et Fin passent d'un onglet visible à l'autre
$("onglets").addEventListener("keydown", (ev) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(ev.key)) return;
  const visibles = [...$("onglets").querySelectorAll('[role="tab"]')].filter((t) => !t.hidden);
  const i = visibles.indexOf(document.activeElement);
  if (i < 0) return;
  ev.preventDefault();
  const j =
    ev.key === "Home"
      ? 0
      : ev.key === "End"
        ? visibles.length - 1
        : (i + (ev.key === "ArrowRight" ? 1 : -1) + visibles.length) % visibles.length;
  const cible = visibles[j];
  afficherOnglet(cible.id.replace("onglet-", ""));
  cible.focus();
});
["signalement", "historique", "visas"].forEach((n) =>
  $(`onglet-${n}`).addEventListener("click", () => afficherOnglet(n)),
);

async function passerEnCreation() {
  etatSaisie.dossierId = null;
  etatSaisie.versions = [];
  etatSaisie.initiale = null;
  etatSaisie.derniere = null;
  etatSaisie.doublonConfirme = null; // chaque nouveau signalement demande sa propre confirmation
  etatSaisie.qualifTouchee = false; // formulaire par site : qualification déduite des sites
  etatSaisie.sitesAutoPour = null; // formulaire par site : reprise automatique des sites connus
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
  $("bloc-commentaire").hidden = !(afficherCommentaire() && col("Commentaire"));
  $("btn-nouveau").hidden = false;
  $("onglets").hidden = false;
  $("nb-suivis").textContent = Math.max(0, etatSaisie.versions.length - 1);

  const qDerniere = listeQualif(val(etatSaisie.derniere, "Qualification"));
  const qList = qDerniere.length ? qDerniere : listeQualif(val(etatSaisie.initiale, "Qualification"));
  $("titre").textContent = `${etatSaisie.etabCourant ? etatSaisie.etabCourant[E.nom] : "Signalement"} `;
  qList.forEach((q) => {
    const p = document.createElement("span");
    p.className = "pastille";
    p.textContent = q;
    p.title = "Qualification actuelle";
    styleChoix(p, q);
    $("titre").appendChild(p);
  });
  const stV = !etatSaisie.modeEtab ? statutDe(etatSaisie.derniere) : "";
  if (stV) {
    const sv = (window.Socle.STATUTS_VALIDATION || []).find((x) => x.nom === stV) || {},
      p = document.createElement("span");
    p.className = "pastille pastille-statut";
    p.textContent = stV;
    p.title = "Statut de validation (visas)";
    if (sv.fond) {
      p.style.setProperty("--c-bg", sv.fond);
      p.style.setProperty("--c", sv.texte);
    }
    $("titre").appendChild(p);
  }
  const dInit = val(etatSaisie.initiale, "Date");
  const d = secondes(dInit) != null ? `, créé le ${dateFr(dInit, etatSaisie.metaDate)}` : "";
  const n = etatSaisie.versions.length - 1;
  const site = col("Site") ? String(val(etatSaisie.derniere, "Site") || "").trim() : "";
  $("sous-titre").textContent =
    `${d ? "Signalé" + d.replace(/^, créé/, "") : `Dossier n° ${etatSaisie.dossierId}`}${site ? ` · site « ${site} »` : ""} · ${n === 0 ? "aucune mise à jour" : n === 1 ? "1 mise à jour" : n + " mises à jour"}.`;
  afficherEtablissement();
  afficherHistorique();
  majListeDossiers();
  majModeSaisie();
}

// Premier champ à remplir après l'établissement : la qualification, sinon la première question
// visible, et en dernier recours la description (qui est en bas du formulaire)
function focusPremiereQuestion() {
  const qualif = $("qualifs-initiales").querySelector("input:checked") || $("qualifs-initiales").querySelector("input");
  const question = [...$("questions").querySelectorAll("[data-champ]")].find((b) => !b.hidden);
  const cible = qualif || (question && question.querySelector("input, select, textarea")) || $("description");
  cible.focus({ preventScroll: true });
  const bloc = cible.closest("fieldset, .champ") || cible;
  if (bloc.scrollIntoView) bloc.scrollIntoView({ block: "center" });
}
// Nouveau signalement : on repart du haut du formulaire

$("btn-nouveau").addEventListener("click", () => allerNouveau());

$("btn-effacer").addEventListener("click", () =>
  enFile(async () => {
    fermer();
    if (etatSaisie.dossierId && etatSaisie.initiale) {
      await remplirFormulaire();
      statut("statut-signalement", "Corrections annulées.");
    } else await passerEnCreation();
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
function avertirFaitsAnterieurs() {
  const aide = $("aide-date-faits");
  if (!aide.dataset.base) aide.dataset.base = aide.textContent;
  const nouvelle = lireDateFaits(),
    ref = etatSaisie.derniere && jourDesFaits(etatSaisie.derniere);
  // une série « plusieurs jours » qui va jusqu'à l'étape la plus récente (ou au-delà) la remplace : pas d'avertissement
  const finSerie = joursSuivants().slice(-1)[0];
  const anterieur =
    etatSaisie.dossierId &&
    etatSaisie.derniere &&
    nouvelle != null &&
    ref != null &&
    jourFaits(nouvelle) < jourFaits(ref) &&
    !(finSerie != null && jourCle(finSerie) >= jourCle(ref));
  const autreJourDossier =
    etatSaisie.dossierId &&
    etatSaisie.derniere &&
    nouvelle != null &&
    ref != null &&
    jourFaits(nouvelle) !== jourFaits(ref) &&
    !anterieur;
  const futur = !anterieur && !autreJourDossier && dateFaitsFuture();
  aide.textContent = autreJourDossier
    ? `Ce signalement concerne le ${jourCourt(ref)}. Pour un autre jour, créez plutôt un nouveau signalement (« Autres actions › Reporter sur d'autres jours ») : un dossier par jour.`
    : anterieur
      ? `Faits antérieurs à ceux de l'étape la plus récente (${dateFr(ref, { ...(etatSaisie.metaFaits || {}), type: (etatSaisie.metaFaits && etatSaisie.metaFaits.type) || "Date" })}) : cette étape sera rangée à sa date dans l'historique, mais ne deviendra pas la dernière étape du dossier.`
      : futur
        ? `Faits à venir : l'étape sera datée du ${jourCourt(lireDateFaits())}, postérieur à aujourd'hui.`
        : aide.dataset.base;
  aide.classList.toggle("alerte-faits", !!anterieur || futur || !!autreJourDossier);
  majAideJours();
}
$("description").addEventListener("input", () => appliquerConditions("q", etatSaisie.defsQuestions));
$("qualifs-initiales").addEventListener("change", () => appliquerConditions("q", etatSaisie.defsQuestions));
