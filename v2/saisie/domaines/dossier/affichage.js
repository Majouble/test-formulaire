/* PRISME — widget de saisie, domaines/dossier/affichage.js
   Domaine : les dossiers : versions, liste et filtres, ouverture, navigation, historique, reprise, plusieurs jours
   — affichage (page et événements).
   Chargé par saisie/index.html dans l'ordre : fondations, composants, domaines, demarrage.js. Les fichiers partagent
   leurs noms (scripts classiques, sans import) : au chargement, un fichier ne fait que définir. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : afficherSaisieEnCours, afficherDossierOuvert, rafraichir, ouvrirDossier, preparerNouveauSignalement,
     avertirFaitsAnterieurs, majListeDossiers, surligneMots, afficherResultatsRecherche, fermerRecherche,
     ouvrirResultat, bandeCouleur, sauverFiltre, restaurerFiltre, majFiltre, appliquerFiltre, remplirPanneauFiltre,
     ouvrirPanneauFiltre, fermerPanneauFiltre, majNavigation, allerA, afficherOptionsDossiers, menuOuvert,
     fermerMenuDossiers, optionsMenu, focusOption, ouvrirMenuDossiers, choisirOption, plusieursJoursActif,
     joursSuivants, erreurPlusieursJours, majAideJours, reinitialiserJours, joursReport, erreurReport,
     majAideReport, ouvrirReport, reprendreReponses, remplirFormulaire, creerElementHistorique, afficherHistorique,
     abandonAccepte, allerNouveau, ouvrirDepuisListe, afficherCartes, confirmerCloture, basculerClos,
     majProposition, brancherEvenementsDossier.
   Utilise :
     fondations/configuration : colonnesEtab.
     fondations/outils : colonneDe, dateFr, idDossierDe, jourCle, jourCourt, listeQualif, pluriel, refId,
       sansAccents, secondes, statut, typeBase, valeurLigne, valeurLocale.
     fondations/etat : etatSaisie.
     fondations/grist : enFile.
     composants/date-faits : aideFaitsDefaut, dateFaitsFuture, faitsAvecHeure, initialiserDateFaits, lireDateFaits.
     composants/champs : cheminsRef, remplirChamps.
     composants/conditions-formules : appliquerConditions.
     composants/onglets : afficherDossier, afficherOnglet, fermerMenuActions, majModeSaisie.
     domaines/agent/affichage : afficherBandeauPerimetre.
     domaines/formulaire/regles : couleurLigne, stylePastille, varianteSaisie.
     domaines/formulaire/donnees : verifierFormulairePublie.
     domaines/formulaire/affichage : cocherQualif, focusPremiereQuestion, lireQualificationInitiale, majCouleur,
       styleChoix.
     domaines/etablissement/regles : CHAMPS_NOUVEL_ETAB, etabDeLigne, etablissementDuFormulaire, texteEtabBrut.
     domaines/etablissement/donnees : rafraichirEtabs.
     domaines/etablissement/affichage : afficherEtablissement, majBandeauCampagne.
     domaines/dossier/regles : MAX_VALEURS_FILTRE, RENSEIGNE_FILTRE, UN_JOUR, VIDE_FILTRE, actualiserChampsFiltre,
       calculerDossiersInit, calculerVersions, cartesAffichees, champDe, champsFiltrables, comparerVersions,
       compterVersionsParDossier, construireIndexRecherche, dernierJourAvecSignalement,
       diagnostiquerFaitsAnterieurs, dossierClos, dossiersFiltres, entreesHistorique, erreurJours,
       erreurReportJours, filtreActif, filtreEffectif, jourDesFaits, jourDuDossierOuvert, jourDuFormulaire,
       jourFaits, joursDejaSignales, joursEntre, joursReportSansDossier, libelleDossier, propositionsDeReprise,
       reinitialiserEtatCreation, resumeFiltre, texteSerie, typeChamp, valeursDisponibles, valeursDossier,
       versionsDe, voisins.
     domaines/dossier/donnees : ecrireClos.
     domaines/enregistrement/regles : cleDoublon.
     domaines/enregistrement/donnees : reprendreSurJours.
     domaines/enregistrement/affichage : cacherConfirmation, confirmer, evaluerDescriptionManuelle, majApercuAuto,
       majDescriptionAuto, valeursSaisies, verifierDoublons.
     domaines/visas/regles : statutDe.
     domaines/visas/affichage : majBandeauVisa, remplirVisas.
     domaines/sites-esr/regles : formulaireParSite, plusGrave, qualifDesSites.
     domaines/sites-esr/affichage : majQualifDeduite, reprendreEtatSites, sitesCtrl.
     domaines/veille/affichage : majBandeauVeille.
     demarrage : montrerVue.
   Modifie etatSaisie : cacheDernieres, creerEtabOuvert, demandeAffichage, descriptionManuelle, dossierId,
     dossiersInit, doublonConfirme, etabCourant, filtreOuvert, filtres, indexRecherche, ligneAnnuaire,
     listeChampsFiltre, minuterieContient, modifie, modifieVisa, nbCartes, posNav, propositionMasquee,
     qualifTouchee, selectionAttendue, versionAffichee. */
// Affiche le message de saisie en cours non enregistrée
function afficherSaisieEnCours() {
  statut(
    "statut-signalement",
    "Saisie en cours non enregistrée : enregistrez-la ou cliquez sur « " +
      $("btn-effacer").textContent +
      " » avant d'ouvrir un autre signalement.",
    "err",
  );
}
// Après ouverture d'un autre signalement, masque la confirmation et passe à la vue de saisie
function afficherDossierOuvert(premiereSelection, idDossier) {
  if (!premiereSelection && etatSaisie.dossierId === idDossier) {
    cacherConfirmation();
    montrerVue("saisie");
  }
}
async function rafraichir() {
  verifierFormulairePublie().catch(() => {});
  if (
    etatSaisie.selectionAttendue &&
    etatSaisie.enregistrements.some((ligne) => ligne.id === etatSaisie.selectionAttendue)
  ) {
    const id = etatSaisie.selectionAttendue;
    etatSaisie.selectionAttendue = null;
    const ligneAttendue = etatSaisie.enregistrements.find((ligne) => ligne.id === id);
    await ouvrirDossier(idDossierDe(ligneAttendue), true);
    return;
  }
  majListeDossiers();
  if (!etatSaisie.dossierId) return;
  calculerVersions();
  if (!etatSaisie.initiale) {
    await preparerNouveauSignalement();
    return;
  }
  if (!etatSaisie.modifie) await remplirFormulaire();
  if (!etatSaisie.modifieVisa) await remplirVisas();
  afficherDossier();
}
async function ouvrirDossier(idDossier, force) {
  const demande = ++etatSaisie.demandeAffichage; // un clic plus récent annule celui-ci
  const meme = idDossier === etatSaisie.dossierId && !force;
  // Dossier encore absent des données reçues (ligne en cours de création ailleurs) : on ne change rien,
  // pour ne jamais associer le formulaire affiché à un autre dossier.
  const avant = {
    dossierId: etatSaisie.dossierId,
    versions: etatSaisie.versions,
    initiale: etatSaisie.initiale,
    derniere: etatSaisie.derniere,
  };
  etatSaisie.dossierId = idDossier;
  calculerVersions();
  if (!etatSaisie.initiale) {
    ({
      dossierId: etatSaisie.dossierId,
      versions: etatSaisie.versions,
      initiale: etatSaisie.initiale,
      derniere: etatSaisie.derniere,
    } = avant);
    return;
  }
  if (!meme) {
    etatSaisie.modifie = etatSaisie.modifieVisa = false;
    ["statut-signalement", "statut-dep", "statut-aca"].forEach((idStatut) => statut(idStatut, ""));
  }
  // Le référentiel n'est relu que si l'établissement du dossier y est inconnu (sinon, on se contente
  // du cache : un établissement sans mail ni lien est un cas normal, pas une raison de tout recharger).
  const etablissementInitial = etabDeLigne(etatSaisie.initiale),
    idE = refId(valeurLigne(etatSaisie.initiale, "Etablissement"));
  // établissement inconnu : relu seulement s'il a pu être créé depuis la dernière lecture (numéro plus grand que
  // tous ceux connus), et pas plus d'une fois par minute (une référence invalide ne doit pas relancer la lecture)
  if (
    !etablissementInitial &&
    etatSaisie.etabsCharges &&
    idE &&
    idE > etatSaisie.idEtabMax &&
    Date.now() - etatSaisie.dernierChargementEtabs > 60000
  ) {
    await rafraichirEtabs(true);
    if (demande !== etatSaisie.demandeAffichage) return;
  }
  etatSaisie.etabCourant = etabDeLigne(etatSaisie.initiale);
  if (!meme || !etatSaisie.modifie) await remplirFormulaire();
  if (demande !== etatSaisie.demandeAffichage) return;
  if (!meme || !etatSaisie.modifieVisa) await remplirVisas();
  if (demande !== etatSaisie.demandeAffichage) return;
  afficherDossier();
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
  majBandeauPrevisionnel();
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
// Bandeau « Prévisionnel » : dossier saisi avant le jour de ses faits, ou date des faits à venir dans la saisie en cours
function majBandeauPrevisionnel() {
  const bandeau = $("bandeau-previsionnel"),
    dossierPrevisionnel = etatSaisie.dossierId ? etatPrevisionnelDossier(etatSaisie.versions) : null,
    jourFaitsSaisi = colonneDe("Date_faits") && $("date-faits").value ? $("date-faits").value.slice(0, 10) : null;
  const texte = texteBandeauPrevisionnel(dossierPrevisionnel, jourFaitsSaisi, Outils.dates.aujourdhui());
  bandeau.textContent = texte;
  bandeau.hidden = !texte;
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
  majBandeauPrevisionnel();
}
function majListeDossiers() {
  $("menu-dossiers").hidden = true; // remplacé par la liste de l'accueil
  $("barre-recherche").hidden = false;
  etatSaisie.indexRecherche = null; // reconstruit à la prochaine frappe
  etatSaisie.cacheDernieres = null;
  etatSaisie.dossiersInit = calculerDossiersInit();
  majFiltre();
  if (!$("resultats-signalements").hidden) afficherResultatsRecherche();
  const courant = etatSaisie.dossiersInit.find((ligne) => ligne.id === etatSaisie.dossierId);
  const libelleCourant = courant ? libelleDossier(courant) : null;
  $("btn-dossiers").querySelector(".texte").textContent = libelleCourant
    ? `${libelleCourant.titre} — ${libelleCourant.detail}`
    : `${etatSaisie.modeEtab ? "Mes signalements" : "Signalements"} (${filtreActif() ? dossiersFiltres().length + " / " : ""}${etatSaisie.dossiersInit.length})`;
  $("recherche-dossiers").hidden = etatSaisie.dossiersInit.length < 8;
  // Le contenu de la liste n'est construit qu'à l'ouverture du menu : inutile de formater
  // des centaines de libellés à chaque changement de signalement.
  if ($("btn-dossiers").getAttribute("aria-expanded") === "true") afficherOptionsDossiers();
  if (etatSaisie.vue === "accueil") afficherCartes();
  afficherBandeauPerimetre();
}
function surligneMots(texte, mots) {
  // repérage sans accents, sur le texte d'origine (même longueur une fois normalisé), puis échappement morceau par morceau
  const brut = String(texte ?? "").normalize("NFC"),
    norm = [...brut].map((caractere) => sansAccents(caractere) || caractere).join("");
  if (norm.length !== brut.length) return esc(brut);
  const marques = new Array(brut.length).fill(false);
  for (const mot of mots) {
    if (mot.length < 2) continue;
    let i = norm.indexOf(mot);
    while (i >= 0) {
      for (let k = i; k < i + mot.length; k++) marques[k] = true;
      i = norm.indexOf(mot, i + mot.length);
    }
  }
  let html = "",
    dans = false;
  for (let k = 0; k < brut.length; k++) {
    if (marques[k] !== dans) {
      html += marques[k] ? "<mark>" : "</mark>";
      dans = marques[k];
    }
    html += esc(brut[k]);
  }
  return html + (dans ? "</mark>" : "");
}
function afficherResultatsRecherche() {
  etatSaisie.nbCartes = 30;
  afficherCartes();
}
function fermerRecherche() {
  $("resultats-signalements").hidden = true;
  $("recherche-signalements").setAttribute("aria-expanded", "false");
}
function ouvrirResultat(itemResultat) {
  const id = +itemResultat.dataset.id;
  if (!id) return;
  fermerRecherche();
  $("recherche-signalements").value = "";
  enFile(async () => {
    try {
      await grist.setCursorPos({ rowId: id });
    } catch (_) {
      // placer le curseur de Grist est un confort : sans effet si Grist le refuse
    }
    await ouvrirDossier(id, true);
  });
}
const bandeCouleur = (dossier) => {
  const couleurTrouvee = couleurLigne(dossier);
  return couleurTrouvee ? ` style="box-shadow: inset 4px 0 0 ${couleurTrouvee.fond}"` : "";
};
function sauverFiltre() {
  Outils.stockage.ecrireJSON(`signalements-filtres:${etatSaisie.tableId || ""}`, etatSaisie.filtres);
}
function restaurerFiltre() {
  try {
    const filtres = Outils.stockage.lireJSON(`signalements-filtres:${etatSaisie.tableId || ""}`, []);
    if (Array.isArray(filtres))
      etatSaisie.filtres = filtres
        .filter((filtreMemorise) => filtreMemorise && typeof filtreMemorise.colonne === "string")
        .map((filtreMemorise) => ({
          colonne: filtreMemorise.colonne,
          valeurs: Array.isArray(filtreMemorise.valeurs) ? filtreMemorise.valeurs : [],
          libelles: filtreMemorise.libelles || {},
          contient: filtreMemorise.contient || "",
        }));
  } catch (_) {
    // filtres mémorisés illisibles : aucun filtre
  }
}
function majFiltre() {
  actualiserChampsFiltre();
  // Pastilles des filtres
  $("filtres-actifs").innerHTML = etatSaisie.filtres
    .map(
      (filtre, i) =>
        `<span class="puce-filtre${filtreEffectif(filtre) ? "" : " inactive"}">` +
        `<button type="button" class="puce-libelle" data-i="${i}" aria-expanded="${etatSaisie.filtreOuvert === filtre}" aria-controls="panneau-filtre" title="${esc(resumeFiltre(filtre))}">${esc(resumeFiltre(filtre, true))} ▾</button>` +
        `<button type="button" class="puce-retirer" data-i="${i}" aria-label="Retirer le filtre ${esc(champDe(filtre) ? champDe(filtre).libelle : "")}">×</button></span>`,
    )
    .join("");
  $("filtre-tout-effacer").hidden = etatSaisie.filtres.length < 2;
  // Liste des colonnes encore disponibles pour un nouveau filtre
  const selecteurAjout = $("filtre-ajout");
  if (document.activeElement !== selecteurAjout) {
    const pris = new Set(etatSaisie.filtres.map((filtre) => filtre.colonne));
    const dispo = etatSaisie.listeChampsFiltre.filter(
      (champ) =>
        !pris.has(champ.cle) &&
        (champ.groupe === "Questions supplémentaires" ||
          champ.groupe === "Signalement" ||
          etatSaisie.dossiersInit.some((dossier) => valeursDossier(dossier, champ).length)),
    );
    const groupes = [...new Set(dispo.map((champ) => champ.groupe))];
    selecteurAjout.innerHTML =
      `<option value="">${etatSaisie.filtres.length ? "+ Ajouter un filtre" : "Filtrer par…"}</option>` +
      groupes
        .map(
          (groupe) =>
            `<optgroup label="${esc(groupe)}">${dispo
              .filter((champ) => champ.groupe === groupe)
              .map((champ) => `<option value="${esc(champ.cle)}">${esc(champ.libelle)}</option>`)
              .join("")}</optgroup>`,
        )
        .join("");
    selecteurAjout.value = "";
    selecteurAjout.hidden = !dispo.length;
  }
  if (etatSaisie.filtreOuvert && !etatSaisie.filtres.includes(etatSaisie.filtreOuvert)) fermerPanneauFiltre();
  else if (etatSaisie.filtreOuvert) remplirPanneauFiltre(false);
  majNavigation();
}
function appliquerFiltre() {
  sauverFiltre();
  etatSaisie.posNav = null;
  majListeDossiers();
  if (!$("resultats-signalements").hidden) afficherResultatsRecherche();
}
/* ---------- Panneau des valeurs d'un filtre (cases à cocher, appliquées aussitôt) ---------- */
function remplirPanneauFiltre(reconstruire = true) {
  const filtre = etatSaisie.filtreOuvert,
    champ = filtre && champDe(filtre);
  if (!champ) return;
  const { entrees, vides, renseignes, trop } = valeursDisponibles(filtre);
  const typeDeBase = typeChamp(champ);
  const texteLibre = typeDeBase === "Text" || typeDeBase === "Any";
  if (reconstruire) {
    $("pf-titre").textContent = champ.libelle;
    $("pf-cherche").value = "";
    $("pf-contient").value = filtre.contient || "";
  }
  $("pf-cherche").hidden = entrees.length <= 8;
  $("pf-bloc-contient").hidden = !texteLibre;
  const texteRecherche = sansAccents($("pf-cherche").value.trim());
  const coche = (k) => (filtre.valeurs.includes(k) ? " checked" : "");
  const ligne = (k, libelle, nombre, cls = "") =>
    `<label class="pf-valeur${cls}" data-cle-texte="${esc(sansAccents(libelle))}"><input type="checkbox" value="${esc(k)}" data-libelle="${esc(libelle)}"${coche(k)}>` +
    `<span>${esc(libelle)}</span><small>${nombre}</small></label>`;
  const special =
    ligne(RENSEIGNE_FILTRE, "(renseigné)", renseignes, " special") + ligne(VIDE_FILTRE, "(vide)", vides, " special");
  $("pf-valeurs").innerHTML =
    (entrees.map(([k, decompte]) => ligne(k, decompte.libelle, decompte.n)).join("") ||
      `<p class="pf-note">Aucune valeur saisie pour l'instant.</p>`) +
    special +
    (trop
      ? `<p class="pf-note">Seules les ${MAX_VALEURS_FILTRE} valeurs les plus fréquentes sont listées${texteLibre ? " : utilisez « Contient » pour les autres" : ""}.</p>`
      : "");
  if (texteRecherche)
    $("pf-valeurs")
      .querySelectorAll(".pf-valeur:not(.special)")
      .forEach((etiquette) => {
        etiquette.hidden = !etiquette.dataset.cleTexte.includes(texteRecherche);
      });
}
function ouvrirPanneauFiltre(filtre, bouton) {
  fermerRecherche();
  etatSaisie.filtreOuvert = filtre;
  const panneau = $("panneau-filtre");
  panneau.hidden = false;
  remplirPanneauFiltre(true);
  const barre = $("barre-filtre").getBoundingClientRect(),
    rectangleBouton = bouton ? bouton.getBoundingClientRect() : barre;
  panneau.style.left =
    Math.max(0, Math.min(rectangleBouton.left - barre.left, barre.width - panneau.offsetWidth)) + "px";
  document
    .querySelectorAll(".puce-libelle")
    .forEach((boutonPuce) =>
      boutonPuce.setAttribute("aria-expanded", String(+boutonPuce.dataset.i === etatSaisie.filtres.indexOf(filtre))),
    );
  const cible = !$("pf-cherche").hidden ? $("pf-cherche") : panneau.querySelector(".pf-valeur input") || $("pf-ok");
  cible.focus();
}
function fermerPanneauFiltre(rendreFocus) {
  if (!etatSaisie.filtreOuvert) return;
  const i = etatSaisie.filtres.indexOf(etatSaisie.filtreOuvert);
  etatSaisie.filtreOuvert = null;
  $("panneau-filtre").hidden = true;
  document.querySelectorAll(".puce-libelle").forEach((boutonPuce) => boutonPuce.setAttribute("aria-expanded", "false"));
  if (rendreFocus) {
    const boutonPuce = document.querySelector(`.puce-libelle[data-i="${i}"]`);
    (boutonPuce || $("filtre-ajout")).focus();
  }
}
function majNavigation() {
  const liste = dossiersFiltres(),
    i = liste.findIndex((dossier) => dossier.id === etatSaisie.dossierId);
  if (i >= 0) etatSaisie.posNav = i;
  $("nav-fiches").hidden = !liste.length || (!etatSaisie.dossierId && !filtreActif());
  $("nav-position").textContent = i >= 0 ? `${i + 1} / ${liste.length}` : `– / ${liste.length}`;
  $("nav-position").title =
    i >= 0 ? "" : etatSaisie.dossierId ? "Le signalement affiché ne correspond pas au filtre" : "";
  const [precedent, suivant] = voisins(liste, i);
  $("nav-prec").disabled = !precedent;
  $("nav-suiv").disabled = !suivant;
  $("nav-prec").title = precedent ? `Précédent : ${libelleDossier(precedent).titre} (touche ←)` : "Début de la liste";
  $("nav-suiv").title = suivant ? `Suivant : ${libelleDossier(suivant).titre} (touche →)` : "Fin de la liste";
}
function allerA(sens) {
  const liste = dossiersFiltres(),
    i = liste.findIndex((dossier) => dossier.id === etatSaisie.dossierId);
  const cible = voisins(liste, i)[sens < 0 ? 0 : 1];
  if (!cible) return;
  if (
    (etatSaisie.modifie || etatSaisie.modifieVisa) &&
    !confirm("La saisie en cours n'est pas enregistrée. L'abandonner pour ouvrir un autre signalement ?")
  )
    return;
  cacherConfirmation();
  enFile(async () => {
    try {
      await grist.setCursorPos({ rowId: cible.id });
    } catch (_) {
      // placer le curseur de Grist est un confort : sans effet si Grist le refuse
    }
    await ouvrirDossier(cible.id, true);
  });
}
function afficherOptionsDossiers() {
  const texteRecherche = sansAccents($("recherche-dossiers").value.trim());
  const visibles = texteRecherche
    ? dossiersFiltres().filter((dossier) => {
        const intitule = libelleDossier(dossier);
        return sansAccents(`${intitule.titre} ${intitule.detail}`).includes(texteRecherche);
      })
    : dossiersFiltres();
  const courant = etatSaisie.dossiersInit.find((dossier) => dossier.id === etatSaisie.dossierId);
  $("options-dossiers").innerHTML =
    `<li role="option" tabindex="-1" data-id="" aria-selected="${!courant}">Nouveau signalement</li>` +
    (visibles.length
      ? visibles
          .map((dossier) => {
            const intitule = libelleDossier(dossier);
            return `<li role="option" tabindex="-1" data-id="${dossier.id}" aria-selected="${dossier.id === etatSaisie.dossierId}"${bandeCouleur(dossier)}>${esc(intitule.titre)}<small>${esc(intitule.detail)}</small></li>`;
          })
          .join("")
      : `<li class="vide" style="cursor:default;color:var(--gris)">Aucun signalement ne correspond</li>`);
}
function menuOuvert() {
  return $("btn-dossiers").getAttribute("aria-expanded") === "true";
}
function fermerMenuDossiers(rendreFocus) {
  if (!menuOuvert()) return;
  $("liste-dossiers").hidden = true;
  $("btn-dossiers").setAttribute("aria-expanded", "false");
  if (rendreFocus) $("btn-dossiers").focus();
}
const optionsMenu = () => [...$("options-dossiers").querySelectorAll('[role="option"][data-id]')];
function focusOption(i) {
  const options = optionsMenu();
  if (!options.length) return;
  options[Math.max(0, Math.min(i, options.length - 1))].focus();
}
function ouvrirMenuDossiers(focusPremier) {
  afficherOptionsDossiers();
  $("liste-dossiers").hidden = false;
  $("btn-dossiers").setAttribute("aria-expanded", "true");
  if (!$("recherche-dossiers").hidden) $("recherche-dossiers").focus();
  else if (focusPremier) {
    // Au clavier : focus sur le signalement affiché, sinon sur la première entrée
    const options = optionsMenu();
    const i = options.findIndex((option) => option.getAttribute("aria-selected") === "true");
    focusOption(i >= 0 ? i : 0);
  }
}
function choisirOption(optionListe) {
  fermerMenuDossiers(true);
  enFile(async () => {
    const id = optionListe.dataset.id ? +optionListe.dataset.id : null;
    if (!id) {
      await preparerNouveauSignalement();
      return;
    }
    try {
      await grist.setCursorPos({ rowId: id });
    } catch (_) {
      // placer le curseur de Grist est un confort : sans effet si Grist le refuse
    }
    await ouvrirDossier(id, true);
  });
}
const plusieursJoursActif = () =>
  !!colonneDe("Date_faits") && varianteSaisie().plusieursJours && !faitsAvecHeure() && $("plusieurs-jours").checked;
// « Plusieurs jours » du formulaire : jours suivant la date des faits, jusqu'à « Jusqu'au »
function joursSuivants() {
  if (!plusieursJoursActif()) return [];
  const debut = lireDateFaits(),
    fin = $("date-fin").value;
  return debut == null ? [] : joursEntre(jourCle(debut + UN_JOUR), fin, $("jours-ouvres").checked);
}
function erreurPlusieursJours() {
  if (!plusieursJoursActif()) return "";
  const debut = lireDateFaits();
  if (debut == null) return "";
  const messageErreur = erreurJours(joursSuivants(), joursSuivants().length + 1, $("date-fin").value, jourCle(debut));
  return messageErreur ? `Plusieurs jours : ${messageErreur.charAt(0).toLowerCase()}${messageErreur.slice(1)}` : "";
}
function majAideJours() {
  if ($("bloc-plusieurs-jours").hidden) return;
  const actif = $("plusieurs-jours").checked,
    aide = $("aide-jours"),
    sug = $("suggestion-jours");
  $("bloc-jusquau").hidden = !actif;
  const etabId = etablissementDuFormulaire(),
    choisi = lireDateFaits();
  // mise à jour d'un dossier alors que l'établissement a des signalements les jours suivants : proposer de les mettre à jour aussi
  sug.hidden = true;
  if (!actif && etatSaisie.dossierId && etabId && choisi != null) {
    const fin = dernierJourAvecSignalement(etabId, choisi, colonneDe("Site") ? $("site").value : null);
    if (fin) {
      sug.hidden = false;
      sug.innerHTML = `Cet établissement a aussi des signalements les jours suivants, jusqu'au ${esc(jourCourt(fin))}. <button type="button" class="lien-texte" id="btn-jusqu-derniere">Leur appliquer aussi cette mise à jour</button>`;
      $("btn-jusqu-derniere").addEventListener("click", () => {
        $("plusieurs-jours").checked = true;
        $("date-fin").value = jourCle(fin);
        etatSaisie.modifie = true;
        avertirFaitsAnterieurs();
      });
    }
  }
  if (!actif) {
    aide.hidden = true;
    return;
  }
  const messageErreur = erreurPlusieursJours(),
    jours = joursSuivants();
  aide.hidden = false;
  aide.classList.toggle("err", !!messageErreur);
  if (messageErreur) {
    aide.textContent = messageErreur;
    return;
  }
  const deja = joursDejaSignales(etabId, jours, colonneDe("Site") ? $("site").value : null);
  aide.textContent =
    `${jours.length + 1} signalements, un par jour : ${[choisi, ...jours].map(jourCourt).join(", ")}${etatSaisie.dossierId ? " (le premier est cette mise à jour)" : ""}.` +
    (deja.length
      ? ` Déjà signalé${deja.length > 1 ? "s" : ""} ces jours-là, mis à jour : ${deja.map(jourCourt).join(", ")}.`
      : "");
}
function reinitialiserJours() {
  $("plusieurs-jours").checked = false;
  $("date-fin").value = "";
  $("jours-ouvres").checked = false;
  $("bloc-jusquau").hidden = true;
  $("aide-jours").hidden = true;
  $("suggestion-jours").hidden = true;
}
/* ---------- « Reporter sur d'autres jours » ---------- */
const joursReport = () => joursEntre($("rep-debut").value, $("rep-fin").value, $("rep-ouvres").checked);
function erreurReport() {
  const debut = $("rep-debut").value,
    fin = $("rep-fin").value;
  return erreurReportJours(debut, fin, joursReport(), jourDuDossierOuvert());
}
function majAideReport() {
  const aide = $("rep-aide"),
    messageErreur = erreurReport();
  aide.classList.toggle("err", !!messageErreur);
  if (messageErreur) {
    aide.textContent = messageErreur;
    return;
  }
  const joursAReporter = joursReportSansDossier(joursReport(), jourDuDossierOuvert()),
    etabId = refId(valeurLigne(etatSaisie.initiale, "Etablissement"));
  const deja = joursDejaSignales(etabId, joursAReporter, colonneDe("Site") ? $("site").value : null);
  aide.textContent =
    `${pluriel(joursAReporter.length, "jour", "jours")} : ${joursAReporter.map(jourCourt).join(", ")}.` +
    (deja.length
      ? ` Déjà signalé${deja.length > 1 ? "s" : ""} ces jours-là, mis à jour : ${deja.map(jourCourt).join(", ")}.`
      : "") +
    (etatSaisie.modifie
      ? " Vos modifications non enregistrées sont reprises dans ces signalements (ce dossier-ci reste inchangé)."
      : "");
}
function ouvrirReport() {
  if (!etatSaisie.dossierId || !etatSaisie.derniere || !etatSaisie.initiale) return;
  const jourReference =
    jourDesFaits(etatSaisie.derniere) ?? Date.parse(valeurLocale(new Date(), false) + "T00:00:00Z") / 1000;
  $("rep-debut").value = $("rep-fin").value = jourCle(jourReference + UN_JOUR);
  $("rep-ouvres").checked = false;
  statut("rep-statut", "");
  majAideReport();
  $("dlg-reporter").showModal();
  $("rep-fin").focus();
}
/* ---------- nouveau signalement : reprendre les réponses du signalement d'un jour précédent ---------- */
async function reprendreReponses(dossierId) {
  const der = [...versionsDe(dossierId)].sort(comparerVersions).pop();
  if (!der) return;
  cocherQualif(valeurLigne(der, "Qualification"));
  if (colonneDe("Site") && valeurLigne(der, "Site")) $("site").value = valeurLigne(der, "Site");
  // pièces jointes : propres à chaque jour, jamais reprises d'un signalement précédent
  await remplirChamps("q", etatSaisie.defsQuestions, (question) =>
    typeBase(question.type) === "Attachments" ? null : der[question.colId],
  );
  // formulaire par site : le tableau des sites reprend les sites du signalement choisi, dans leur dernier état,
  // sauf reprise désactivée (réglage du tableau des sites) : il part vide
  let controleurSites = sitesCtrl(),
    nbSites = null;
  if (controleurSites && controleurSites.sites.reprise === "non") {
    controleurSites.lignes = [];
    controleurSites.retires = [];
    controleurSites.supprimes = [];
    controleurSites.dessiner();
    controleurSites = null;
  } else if (controleurSites)
    nbSites = reprendreEtatSites(controleurSites, refId(valeurLigne(der, "Etablissement")), undefined, dossierId);
  if (controleurSites) {
    etatSaisie.qualifTouchee = false;
    majQualifDeduite();
  }
  appliquerConditions("q", etatSaisie.defsQuestions);
  etatSaisie.descriptionManuelle = false;
  majDescriptionAuto();
  if (typeof majCouleur === "function") majCouleur();
  etatSaisie.modifie = true;
  etatSaisie.propositionMasquee = etatSaisie.etabCourant ? etatSaisie.etabCourant.id : null;
  majProposition();
  statut(
    "statut-signalement",
    controleurSites
      ? `Dernier état connu repris : ${nbSites} site${nbSites > 1 ? "s" : ""} (autres réponses : dossier n° ${dossierId}, ${jourCourt(jourDesFaits(der))}). Confirmez ou modifiez chaque site, puis enregistrez ce nouveau signalement.`
      : `Réponses reprises du dossier n° ${dossierId} (${jourCourt(jourDesFaits(der))}) : modifiez ce qui a changé, puis enregistrez ce nouveau signalement.`,
    "ok",
  );
  focusPremiereQuestion();
}
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
  majBandeauPrevisionnel();
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
// Élément de liste (pastilles, changements, commentaire) d'une entrée de l'historique
function creerElementHistorique(entree) {
  const elementListe = document.createElement("li");
  if (entree.qualification.length) styleChoix(elementListe, entree.qualification[0]); // couleur du repère : première valeur
  const pastille =
    entree.qualification
      .map(
        (qualification) =>
          `<span class="pastille" style="${stylePastille(qualification)}">${esc(qualification)}</span>`,
      )
      .join(" ") + (entree.qualification.length ? " " : "");
  const qui = entree.auteur ? `, ${esc(entree.auteur)}` : "";
  const chg = entree.changements.length
    ? `<ul class="changements">${entree.changements
        .map(
          (changement) =>
            `<li><strong>${esc(changement.libelle)}</strong> : <span class="avant">${esc(changement.avant)}</span> → ${esc(changement.apres)}</li>`,
        )
        .join("")}</ul>`
    : "";
  elementListe.innerHTML = `<div>${pastille}<span class="quand">${secondes(entree.faits) != null ? `Faits du ${esc(dateFr(entree.faits, { ...(etatSaisie.metaFaits || {}), type: (etatSaisie.metaFaits && etatSaisie.metaFaits.type) || "Date" }))} — saisi le ` : ""}${esc(dateFr(entree.date, etatSaisie.metaDate) || "date inconnue")}${qui}</span></div>
                    ${chg}${entree.commentaire ? `<div class="texte">${esc(entree.commentaire)}</div>` : ""}`;
  return elementListe;
}
async function afficherHistorique() {
  await Promise.all(Object.values(cheminsRef));
  if (!etatSaisie.initiale) return;
  const entrees = entreesHistorique(etatSaisie.versions, etatSaisie.champsVersion);
  const listeChronologie = $("chrono");
  listeChronologie.innerHTML = "";
  entrees.reverse().forEach((entree) => {
    listeChronologie.appendChild(creerElementHistorique(entree));
  });
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
    await preparerNouveauSignalement();
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
  const recherche = $("recherche-signalements").value.trim();
  const { mots, base0, trouves, tries } = cartesAffichees(etatSaisie.indexRecherche, recherche);
  const nombreVersionsParDossier = compterVersionsParDossier();
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
// Demande à l'utilisateur de confirmer la clôture du signalement
function confirmerCloture() {
  return confirm(
    "Clore ce signalement ? La situation sera considérée comme terminée ; une nouvelle mise à jour le rouvrira.",
  );
}
async function basculerClos() {
  if (!colonneDe("Clos") || !etatSaisie.derniere) return;
  const clore = !dossierClos();
  if (clore && !confirmerCloture()) return;
  try {
    await ecrireClos(etatSaisie.derniere.id, clore);
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
function majProposition() {
  const bloc = $("proposition-encours");
  // Un dossier par jour : celui du même jour s'actualise ; celui d'un jour précédent sert de point de départ
  const jour = jourDuFormulaire();
  const { liste, memeJour, avant, masquer } = propositionsDeReprise(jour);
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
  // formulaire par site, reprise désactivée : rien à reprendre des jours précédents (seul le signalement du même jour est proposé)
  if (masquer) {
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

// Événements de la page traités ici ; appelé une fois par demarrage.js
function brancherEvenementsDossier() {
  $("description").addEventListener("input", () => appliquerConditions("q", etatSaisie.defsQuestions));
  $("qualifs-initiales").addEventListener("change", () => appliquerConditions("q", etatSaisie.defsQuestions));
  $("recherche-signalements").addEventListener("input", afficherResultatsRecherche);
  $("recherche-signalements").addEventListener("focus", () => {
    fermerPanneauFiltre(false);
    afficherResultatsRecherche();
  });
  $("recherche-signalements").addEventListener("keydown", (evenement) => {
    const premiere = $("cartes-signalements").querySelector(".carte-sig");
    if (evenement.key === "ArrowDown") {
      if (premiere) {
        evenement.preventDefault();
        premiere.focus();
      }
    } else if (evenement.key === "Enter") {
      evenement.preventDefault();
      if (premiere) ouvrirDepuisListe(+premiere.dataset.id);
    } else if (evenement.key === "Escape" && $("recherche-signalements").value) {
      evenement.preventDefault();
      $("recherche-signalements").value = "";
      afficherResultatsRecherche();
    }
  });
  $("resultats-signalements").addEventListener("mousedown", (evenement) => {
    const itemResultat = evenement.target.closest('[role="option"]');
    if (itemResultat) {
      evenement.preventDefault();
      ouvrirResultat(itemResultat);
    }
  });
  $("recherche-signalements").addEventListener("blur", () => setTimeout(fermerRecherche, 150));
  // Raccourci : « / » place le curseur dans la barre de recherche (hors saisie en cours)
  document.addEventListener("keydown", (evenement) => {
    if (evenement.key !== "/" || evenement.ctrlKey || evenement.metaKey || evenement.altKey) return;
    const cible = evenement.target,
      saisie = cible && (cible.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(cible.tagName));
    if (saisie || $("barre-recherche").hidden || etatSaisie.vue !== "accueil") return;
    evenement.preventDefault();
    $("recherche-signalements").focus();
  });
  $("pf-valeurs").addEventListener("change", (evenement) => {
    const caseCochee = evenement.target,
      filtre = etatSaisie.filtreOuvert;
    if (!filtre || !caseCochee.matches('input[type="checkbox"]')) return;
    filtre.valeurs = filtre.valeurs.filter((k) => k !== caseCochee.value);
    if (caseCochee.checked) {
      filtre.valeurs.push(caseCochee.value);
      filtre.libelles[caseCochee.value] = caseCochee.dataset.libelle;
    }
    appliquerFiltre();
  });
  $("pf-cherche").addEventListener("input", () => remplirPanneauFiltre(false));
  $("pf-contient").addEventListener("input", () => {
    clearTimeout(etatSaisie.minuterieContient);
    etatSaisie.minuterieContient = setTimeout(() => {
      if (etatSaisie.filtreOuvert) {
        etatSaisie.filtreOuvert.contient = $("pf-contient").value;
        appliquerFiltre();
      }
    }, 250);
  });
  $("pf-aucune").addEventListener("click", () => {
    if (!etatSaisie.filtreOuvert) return;
    etatSaisie.filtreOuvert.valeurs = [];
    etatSaisie.filtreOuvert.contient = "";
    $("pf-contient").value = "";
    appliquerFiltre();
  });
  // Tout cocher : toutes les valeurs listées (celles que la recherche du panneau laisse visibles),
  // sans « (renseigné) » ni « (vide) »
  $("pf-tout").addEventListener("click", () => {
    const filtre = etatSaisie.filtreOuvert;
    if (!filtre) return;
    $("pf-valeurs")
      .querySelectorAll(".pf-valeur:not(.special):not([hidden]) input")
      .forEach((caseCochee) => {
        if (!filtre.valeurs.includes(caseCochee.value)) {
          filtre.valeurs.push(caseCochee.value);
          filtre.libelles[caseCochee.value] = caseCochee.dataset.libelle;
        }
      });
    appliquerFiltre();
  });
  $("pf-ok").addEventListener("click", () => fermerPanneauFiltre(true));
  $("panneau-filtre").addEventListener("keydown", (evenement) => {
    if (evenement.key === "Escape") {
      evenement.preventDefault();
      evenement.stopPropagation();
      fermerPanneauFiltre(true);
    } else if (evenement.key === "Enter" && evenement.target.matches("#pf-cherche, #pf-contient")) {
      evenement.preventDefault();
      fermerPanneauFiltre(true);
    }
  });
  document.addEventListener("mousedown", (evenement) => {
    if (
      etatSaisie.filtreOuvert &&
      !$("panneau-filtre").contains(evenement.target) &&
      !evenement.target.closest(".puce-libelle")
    )
      fermerPanneauFiltre(false);
  });
  $("filtres-actifs").addEventListener("click", (evenement) => {
    const bouton = evenement.target.closest("button[data-i]");
    if (!bouton) return;
    const filtre = etatSaisie.filtres[+bouton.dataset.i];
    if (bouton.classList.contains("puce-retirer")) {
      if (etatSaisie.filtreOuvert === filtre) fermerPanneauFiltre(false);
      etatSaisie.filtres.splice(+bouton.dataset.i, 1);
      appliquerFiltre();
      $("filtre-ajout").focus();
    } else if (etatSaisie.filtreOuvert === filtre) fermerPanneauFiltre(false);
    else ouvrirPanneauFiltre(filtre, bouton);
  });
  $("filtre-ajout").addEventListener("change", () => {
    const cle = $("filtre-ajout").value;
    if (!cle) return;
    etatSaisie.listeChampsFiltre = champsFiltrables();
    const filtre = { colonne: cle, valeurs: [], libelles: {}, contient: "" };
    // Un signalement est affiché : le filtre reprend d'emblée sa valeur (« même catégorie »)
    const champ = champDe(filtre);
    if (champ && etatSaisie.dossierId && etatSaisie.initiale) {
      const valeursDuDossier = valeursDossier(etatSaisie.initiale, champ);
      if (valeursDuDossier.length)
        valeursDuDossier.forEach((valeur) => {
          filtre.valeurs.push(valeur.cle);
          filtre.libelles[valeur.cle] = valeur.libelle;
        });
      else filtre.valeurs.push(VIDE_FILTRE);
    }
    etatSaisie.filtres.push(filtre);
    $("filtre-ajout").blur();
    appliquerFiltre();
    const boutonPuce = document.querySelector(`.puce-libelle[data-i="${etatSaisie.filtres.length - 1}"]`);
    if (!filtre.valeurs.length) ouvrirPanneauFiltre(filtre, boutonPuce);
    else if (boutonPuce) boutonPuce.focus();
  });
  $("filtre-tout-effacer").addEventListener("click", () => {
    fermerPanneauFiltre(false);
    etatSaisie.filtres = [];
    appliquerFiltre();
    $("filtre-ajout").focus();
  });
  $("nav-prec").addEventListener("click", () => allerA(-1));
  $("nav-suiv").addEventListener("click", () => allerA(1));
  document.addEventListener("keydown", (evenement) => {
    if (
      (evenement.key !== "ArrowLeft" && evenement.key !== "ArrowRight") ||
      evenement.defaultPrevented ||
      evenement.ctrlKey ||
      evenement.metaKey ||
      evenement.altKey ||
      evenement.shiftKey
    )
      return;
    const cibleClavier = evenement.target;
    if (
      cibleClavier &&
      (cibleClavier.isContentEditable ||
        /^(INPUT|TEXTAREA|SELECT)$/.test(cibleClavier.tagName) ||
        (cibleClavier.closest && cibleClavier.closest('[role="tablist"], [role="listbox"], .choix-groupe')))
    )
      return;
    if ($("nav-fiches").hidden || etatSaisie.vue !== "saisie" || menuOuvert() || etatSaisie.filtreOuvert) return;
    evenement.preventDefault();
    allerA(evenement.key === "ArrowLeft" ? -1 : 1);
  });
  $("recherche-dossiers").addEventListener("input", afficherOptionsDossiers);
  // ev.detail === 0 : « clic » produit au clavier (Entrée ou Espace sur le bouton)
  $("btn-dossiers").addEventListener("click", (evenement) => {
    if (menuOuvert()) fermerMenuDossiers(false);
    else ouvrirMenuDossiers(evenement.detail === 0);
  });
  $("btn-dossiers").addEventListener("keydown", (evenement) => {
    if (evenement.key === "ArrowDown" || evenement.key === "ArrowUp") {
      evenement.preventDefault();
      ouvrirMenuDossiers(true);
    }
  });
  $("options-dossiers").addEventListener("click", (evenement) => {
    const optionListe = evenement.target.closest('[role="option"][data-id]');
    if (optionListe) choisirOption(optionListe);
  });
  $("options-dossiers").addEventListener("keydown", (evenement) => {
    const options = optionsMenu();
    const i = options.indexOf(document.activeElement);
    if (evenement.key === "ArrowDown") {
      evenement.preventDefault();
      focusOption(i + 1);
    } else if (evenement.key === "ArrowUp") {
      evenement.preventDefault();
      if (i <= 0 && !$("recherche-dossiers").hidden) $("recherche-dossiers").focus();
      else focusOption(i - 1);
    } else if (evenement.key === "Home") {
      evenement.preventDefault();
      focusOption(0);
    } else if (evenement.key === "End") {
      evenement.preventDefault();
      focusOption(options.length - 1);
    } else if (evenement.key === "Enter" || evenement.key === " ") {
      evenement.preventDefault();
      if (i >= 0) choisirOption(options[i]);
    } else if (evenement.key === "Tab") fermerMenuDossiers(false);
  });
  // Depuis le champ de filtre : flèche bas vers la liste, Entrée ouvre le premier résultat
  $("recherche-dossiers").addEventListener("keydown", (evenement) => {
    if (evenement.key === "ArrowDown") {
      evenement.preventDefault();
      focusOption(0);
    } else if (evenement.key === "Enter") {
      evenement.preventDefault();
      const premier = optionsMenu().find((option) => option.dataset.id); // premier signalement filtré
      if (premier) choisirOption(premier);
    }
  });
  document.addEventListener("click", (evenement) => {
    if (!$("menu-dossiers").contains(evenement.target)) fermerMenuDossiers(false);
  });
  document.addEventListener("keydown", (evenement) => {
    if (evenement.key === "Escape" && menuOuvert()) {
      evenement.preventDefault();
      fermerMenuDossiers(true);
    }
  });
  ["rep-debut", "rep-fin", "rep-ouvres"].forEach((id) =>
    $(id).addEventListener("change", () => {
      if (id === "rep-debut" && $("rep-fin").value < $("rep-debut").value) $("rep-fin").value = $("rep-debut").value;
      majAideReport();
    }),
  );
  $("rep-annuler").addEventListener("click", () => $("dlg-reporter").close());
  $("rep-ok").addEventListener("click", () =>
    enFile(async () => {
      const messageErreur = erreurReport();
      if (messageErreur) {
        statut("rep-statut", messageErreur, "err");
        return;
      }
      const jours = joursReportSansDossier(joursReport(), jourDuDossierOuvert());
      $("rep-ok").disabled = true;
      try {
        const resultat = await reprendreSurJours(
          refId(valeurLigne(etatSaisie.initiale, "Etablissement")),
          valeursSaisies([]),
          jours,
          jourDesFaits(etatSaisie.derniere),
        );
        $("dlg-reporter").close();
        const texteResume = texteSerie(resultat).trim();
        statut("statut-signalement", texteResume, resultat.errT.length ? "err" : "ok");
        confirmer("Signalement reporté", `${texteResume.charAt(0).toUpperCase()}${texteResume.slice(1)}`);
      } catch (erreur) {
        statut("rep-statut", `Échec : ${erreur.message || erreur}`, "err");
      } finally {
        $("rep-ok").disabled = false;
      }
    }),
  );
  $("commentaire").addEventListener("input", () => {
    etatSaisie.modifie = true;
  });
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
}
