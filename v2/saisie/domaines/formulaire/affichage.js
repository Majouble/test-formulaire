/* PRISME — widget de saisie, domaines/formulaire/affichage.js
   Domaine : le formulaire de la page : choix du formulaire publié, questions, variantes EN / ESR, couleurs —
   affichage (page et événements).
   Chargé par saisie/index.html dans l'ordre : fondations, composants, domaines, demarrage.js. Les fichiers partagent
   leurs noms (scripts classiques, sans import) : au chargement, un fichier ne fait que définir. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : appliquerVersion, NOMS_VISA, appliquerNomsParties, decorHtml, relancerChargementConfiguration,
     remplirPageDepuisStructure, construireQuestionsPage, dessinerChampsPage, appliquerReglagesPage,
     afficherAlertes, afficherReferentielQuandPret, styleChoix, afficherChoix, lireChoix, lireChoixMulti,
     lireQualificationInitiale, cocherQualif, focusPremiereQuestion, remplirChoixFormulaire,
     rafraichirApresLibellesReference, valeursEnCours, majCouleur, brancherEvenementsFormulaire.
   Utilise :
     fondations/outils : colonneDe, jourCle, listeQualif, statut.
     fondations/etat : etatSaisie.
     fondations/grist : enFile.
     fondations/reglages : appliquerOptions.
     composants/date-faits : aideFaitsDefaut, faitsAvecHeure, lireDateFaits.
     composants/nombres : appliquerBornes.
     composants/champs : lireUnChamp, rendreChamps.
     composants/conditions-formules : appliquerConditions.
     composants/recherche-etablissement : fermerSuggestions.
     domaines/formulaire/regles : calculerAlerteHorloge, calculerChampsVersion, calculerChoixQualification,
       commentaireActive, construireReglesCouleur, couleurDe, defsDe, defsDepuisFormulaire, partiesDe, teinteClaire,
       textesValeur, valeurLisible, varianteSaisie.
     domaines/formulaire/donnees : chargerConfiguration, lireChoixFormulaire, verifierFormulairePublie.
     domaines/etablissement/regles : CHAMPS_NOUVEL_ETAB, appliquerColonnesForcees.
     domaines/etablissement/affichage : apresChargementEtabs, finaliserReferentiel.
     domaines/dossier/regles : UN_JOUR.
     domaines/dossier/affichage : allerNouveau, avertirFaitsAnterieurs, majListeDossiers, majProposition,
       preparerNouveauSignalement, rafraichir, remplirFormulaire, restaurerFiltre.
     domaines/enregistrement/affichage : majDescriptionAuto, verifierDoublons.
     domaines/visas/affichage : activerVerdictRapide.
     domaines/sites-esr/regles : formulaireParSite.
     domaines/sites-esr/affichage : placerQualification.
     domaines/veille/donnees : lireVeille.
     domaines/veille/affichage : majBandeauVeille.
   Modifie etatSaisie : alerteHorloge, champsVersion, choix, couleurs, dateFaitsTouchee, decorsQ, defsAca, defsDep,
     defsQuestions, metaDate, metaFaits, modifie, modifieVisa, qualifMultiple. */
// Bandeau, liseré de la version, colonnes du référentiel imposées par le formulaire
function appliquerVersion() {
  const reglages = varianteSaisie();
  $("marque-app").textContent = reglages.marque;
  document.body.classList.toggle("version-esr", reglages.version === "esr");
  appliquerColonnesForcees();
}
const NOMS_VISA = {};
function appliquerNomsParties() {
  for (const [role, id] of [
    ["vd", "form-visa-dep"],
    ["va", "form-visa-aca"],
  ]) {
    const formulaireVisa = $(id);
    if (!formulaireVisa) continue;
    const titre = formulaireVisa.querySelector("h2"),
      boutonEnvoi = formulaireVisa.querySelector('button[type="submit"]');
    if (!NOMS_VISA[role]) NOMS_VISA[role] = { titre: titre.textContent, bouton: boutonEnvoi.textContent };
    const partie = etatSaisie.formulaireActif
      ? partiesDe(etatSaisie.formulaireActif.conf).find((partieCandidate) => partieCandidate.role === role)
      : null;
    titre.textContent = partie && partie.nom ? partie.nom : NOMS_VISA[role].titre;
    boutonEnvoi.textContent = partie && partie.nom ? `Enregistrer : ${partie.nom}` : NOMS_VISA[role].bouton;
  }
}
function decorHtml(bloc) {
  return bloc.genre === "titre"
    ? `<h3 class="titre-section">${esc(bloc.texte || "")}</h3>`
    : `<p class="info-formulaire">${esc(bloc.texte || "").replace(/\n/g, "<br>")}</p>`;
}
// Recharge la configuration et les dossiers (dans la file des traitements)
function relancerChargementConfiguration() {
  enFile(async () => {
    await chargerConfiguration();
    await rafraichir();
  });
}
// Remplit la page d'après la structure : libellés, blocs masqués, date des faits, qualification ; renvoie la colonne de qualification
function remplirPageDepuisStructure() {
  document.querySelectorAll("[data-libelle]").forEach((elementLibelle) => {
    if (!elementLibelle.dataset.defaut) elementLibelle.dataset.defaut = elementLibelle.textContent;
    const metaColonne = etatSaisie.metaSig[colonneDe(elementLibelle.dataset.libelle)];
    elementLibelle.textContent = (metaColonne && metaColonne.libelle) || elementLibelle.dataset.defaut;
  });
  etatSaisie.metaDate = etatSaisie.metaSig[colonneDe("Date")] || null;
  etatSaisie.alerteHorloge = calculerAlerteHorloge();
  $("bloc-commentaire").hidden = !(commentaireActive() && colonneDe("Commentaire"));
  etatSaisie.metaFaits = etatSaisie.metaSig[colonneDe("Date_faits")] || null;
  $("bloc-date-faits").hidden = !colonneDe("Date_faits");
  $("bloc-site").hidden = !colonneDe("Site");
  appliquerVersion();
  $("date-faits").type =
    etatSaisie.metaFaits && (etatSaisie.metaFaits.type || "").startsWith("DateTime") ? "datetime-local" : "date";
  $("bloc-plusieurs-jours").hidden = !(colonneDe("Date_faits") && varianteSaisie().plusieursJours && !faitsAvecHeure());
  if (!$("aide-date-faits").dataset.base) $("aide-date-faits").textContent = aideFaitsDefaut();
  const metaQualification = etatSaisie.metaSig[colonneDe("Qualification")];
  const { choix, couleurs, qualifMultiple } = calculerChoixQualification(metaQualification);
  etatSaisie.choix = choix;
  etatSaisie.couleurs = couleurs;
  etatSaisie.qualifMultiple = qualifMultiple;
  afficherChoix("qualifs-initiales", "qualif-initiale");
  return metaQualification;
}
// Construit les définitions des questions (formulaire, visas), les champs versionnés, les couleurs et le filtre
function construireQuestionsPage(alertes, metaQualification) {
  etatSaisie.decorsQ = { avant: {}, fin: [] };
  appliquerNomsParties();
  etatSaisie.defsQuestions = defsDepuisFormulaire("q", "Questions", alertes) || defsDe("Questions");
  etatSaisie.defsDep = defsDepuisFormulaire("vd", "Questions_dep", alertes) || defsDe("Questions_dep");
  if (formulaireParSite()) $("bloc-site").hidden = true; // les sites se saisissent dans le tableau des sites
  etatSaisie.defsAca = defsDepuisFormulaire("va", "Questions_aca", alertes) || defsDe("Questions_aca");
  // Champs versionnés : ce dont l'historique retrace l'évolution d'une version à l'autre.
  etatSaisie.champsVersion = calculerChampsVersion(metaQualification);
  etatSaisie.defsQuestions.forEach((question) => etatSaisie.champsVersion.push(question));
  construireReglesCouleur(alertes);
  restaurerFiltre();
}
// Dessine les champs des questions et des visas
function dessinerChampsPage() {
  rendreChamps($("questions"), "q", etatSaisie.defsQuestions, () => {
    etatSaisie.modifie = true;
  });
  placerQualification();
  appliquerConditions("q", etatSaisie.defsQuestions);
  rendreChamps($("champs-dep"), "vd", etatSaisie.defsDep, () => {
    etatSaisie.modifieVisa = true;
  });
  rendreChamps($("champs-aca"), "va", etatSaisie.defsAca, () => {
    etatSaisie.modifieVisa = true;
  });
  activerVerdictRapide("vd", etatSaisie.defsDep, "statut-dep-rapide");
  activerVerdictRapide("va", etatSaisie.defsAca, "statut-aca-rapide");
}
// Applique à la page la veille, les options et les bornes tirées des réglages
function appliquerReglagesPage() {
  lireVeille().then(() => {
    if (etatSaisie.vue === "accueil") majBandeauVeille();
  });
  appliquerOptions(etatSaisie.optionsParametres);
  appliquerBornes();
}
// Affiche les alertes de la page
function afficherAlertes(alertes) {
  $("alerte").textContent = alertes.join(" ");
  $("alerte").hidden = !alertes.length;
}
// Affiche le référentiel s'il arrive vite, sinon complète la page à son arrivée
async function afficherReferentielQuandPret(pEtabs, alertes) {
  // Référentiel : si la lecture est rapide (cas d'un établissement venu par son lien, une seule ligne),
  // on l'attend brièvement pour éviter tout clignotement ; sinon le formulaire s'affiche sans lui
  // et se complète à son arrivée.
  const rapide = await Promise.race([
    pEtabs.then(() => true),
    new Promise((resoudre) => setTimeout(() => resoudre(false), 250)),
  ]);
  if (rapide) finaliserReferentiel(await pEtabs, alertes);
  else {
    $("sous-titre").textContent = "Chargement du référentiel des établissements…";
    pEtabs.then((erreurReferentiel) =>
      enFile(async () => {
        finaliserReferentiel(erreurReferentiel, alertes);
        await apresChargementEtabs();
      }),
    );
  }
}
function styleChoix(etiquetteChoix, choix, carte) {
  const couleurChoix = (carte || etatSaisie.couleurs)[choix] || {};
  etiquetteChoix.style.setProperty("--c", couleurChoix.fillColor ? couleurChoix.textColor || "#161616" : "var(--bleu)");
  etiquetteChoix.style.setProperty("--c-bg", couleurChoix.fillColor || "var(--bleu-clair)");
}
function afficherChoix(conteneurId, nom) {
  const cont = $(conteneurId);
  const avant = listeQualif(etatSaisie.qualifMultiple ? lireChoixMulti(nom) : lireChoix(nom));
  cont.innerHTML = "";
  if (!etatSaisie.choix.length) {
    cont.innerHTML = `<input type="text" data-libre="${nom}" aria-label="Qualification">`;
    cont.querySelector("input").value = avant.join(", ");
    cont.querySelector("input").addEventListener("input", () => {
      etatSaisie.modifie = true;
    });
    return;
  }
  const multi = nom === "qualif-initiale" && etatSaisie.qualifMultiple;
  etatSaisie.choix.forEach((choix) => {
    const lab = document.createElement("label");
    lab.className = "choix";
    styleChoix(lab, choix);
    lab.innerHTML = `<input type="${multi ? "checkbox" : "radio"}" name="${nom}" value="${esc(choix)}"><span>${esc(choix)}</span>`;
    const inp = lab.querySelector("input");
    inp.checked = avant.includes(choix);
    inp.addEventListener("change", () => {
      etatSaisie.modifie = true;
    });
    cont.appendChild(lab);
  });
}
function lireChoix(nom) {
  const boutonCoche = document.querySelector(`input[name="${nom}"]:checked`);
  if (boutonCoche) return boutonCoche.value;
  const champLibre = document.querySelector(`[data-libre="${nom}"]`);
  return champLibre ? champLibre.value.trim() : "";
}
function lireChoixMulti(nom) {
  return [...document.querySelectorAll(`input[name="${nom}"]:checked`)].map((bouton) => bouton.value);
}
// Valeur de la qualification initiale telle que choisie dans le formulaire : une chaîne à choix
// unique, ou un tableau si la colonne accepte plusieurs valeurs.
function lireQualificationInitiale() {
  if (!etatSaisie.choix.length) {
    const champLibre = document.querySelector('[data-libre="qualif-initiale"]');
    return champLibre ? champLibre.value.trim() : "";
  }
  return etatSaisie.qualifMultiple ? lireChoixMulti("qualif-initiale") : lireChoix("qualif-initiale");
}
function cocherQualif(valeur) {
  const liste = listeQualif(valeur);
  if (etatSaisie.qualifMultiple) {
    document
      .querySelectorAll('input[name="qualif-initiale"]')
      .forEach((bouton) => (bouton.checked = liste.includes(bouton.value)));
  } else {
    document
      .querySelectorAll('input[name="qualif-initiale"]')
      .forEach((bouton) => (bouton.checked = bouton.value === (liste[0] ?? "")));
  }
  const champLibre = document.querySelector('[data-libre="qualif-initiale"]');
  if (champLibre) champLibre.value = liste.join(", ");
}
// Premier champ à remplir après l'établissement : la qualification, sinon la première question
// visible, et en dernier recours la description (qui est en bas du formulaire)
function focusPremiereQuestion() {
  const qualif = $("qualifs-initiales").querySelector("input:checked") || $("qualifs-initiales").querySelector("input");
  const question = [...$("questions").querySelectorAll("[data-champ]")].find((blocQuestion) => !blocQuestion.hidden);
  const cible = qualif || (question && question.querySelector("input, select, textarea")) || $("description");
  cible.focus({ preventScroll: true });
  const bloc = cible.closest("fieldset, .champ") || cible;
  if (bloc.scrollIntoView) bloc.scrollIntoView({ block: "center" });
}
async function remplirChoixFormulaire() {
  const selecteurFormulaire = $("cfg-formulaire");
  const { voulu, liste } = await lireChoixFormulaire();
  selecteurFormulaire.innerHTML =
    `<option value="">Automatique (premier formulaire publié pour la table ${esc(etatSaisie.tableId || "")})</option>` +
    liste
      .map(
        (formulaire) =>
          `<option value="${esc(formulaire.nom)}"${formulaire.nom === voulu ? " selected" : ""}${formulaire.publie ? "" : " disabled"}>${esc(formulaire.nom)}${formulaire.publie ? "" : " (jamais publié)"}</option>`,
      )
      .join("");
  selecteurFormulaire.value = voulu || "";
  $("cfg-formulaire-info").textContent =
    (etatSaisie.formulaireActif
      ? `Affiché actuellement : « ${etatSaisie.formulaireActif.nom} ». `
      : "Aucun formulaire publié pour cette table : questions issues des associations du widget. ") +
    "Ce choix est enregistré avec la page (il suit la page dupliquée). Il nécessite un widget ouvert depuis une adresse (pas le Custom Widget Builder, dont les options contiennent le code).";
}
// Rafraîchit la liste des signalements et la couleur une fois les libellés chargés
function rafraichirApresLibellesReference() {
  enFile(async () => {
    majListeDossiers();
    majCouleur();
  });
}
function valeursEnCours(regleCouleur) {
  if (regleCouleur.genre === "qualification") return listeQualif(lireQualificationInitiale()).filter(Boolean);
  if (regleCouleur.def.colId === colonneDe("Date_faits") && !$("bloc-date-faits").hidden) {
    const secondesDateFaits = lireDateFaits();
    return secondesDateFaits == null ? [] : [String(secondesDateFaits)];
  }
  const enregistrementReference = etatSaisie.derniere || etatSaisie.initiale;
  if (regleCouleur.genre === "question" && !regleCouleur.def.formule) {
    const bloc = document.querySelector(`[data-champ="q-${regleCouleur.def.colId}"]`);
    if (!bloc || bloc.hidden) return [];
    return textesValeur(regleCouleur.def, lireUnChamp("q", regleCouleur.def));
  }
  return textesValeur(
    regleCouleur.def,
    enregistrementReference ? enregistrementReference[regleCouleur.def.colId] : null,
  );
}
function majCouleur() {
  let couleurActive = null;
  for (const regleCouleur of etatSaisie.reglesCouleur) {
    couleurActive = couleurDe(regleCouleur, valeursEnCours(regleCouleur));
    if (couleurActive) break;
  }
  const corps = document.body,
    legende = $("legende-teinte");
  corps.classList.toggle("teinte", !!couleurActive);
  if (couleurActive) {
    corps.style.setProperty("--teinte", couleurActive.fond);
    corps.style.setProperty("--fond", teinteClaire(couleurActive.fond, 0.09));
    corps.style.setProperty("--teinte-moyenne", teinteClaire(couleurActive.fond, 0.22));
    legende.textContent = `${couleurActive.def.libelle || couleurActive.def.colId} : ${valeurLisible(couleurActive.def, couleurActive.valeur)}`;
  } else ["--teinte", "--fond", "--teinte-moyenne"].forEach((propriete) => corps.style.removeProperty(propriete));
  legende.hidden = !couleurActive;
}

// Événements de la page traités ici ; appelé une fois par demarrage.js
function brancherEvenementsFormulaire() {
  // Contrôle régulier : une publication modifie la table Formulaires, qui n'envoie aucun signal au widget
  // (seule la table liée en envoie). Le widget la relit donc toutes les 30 secondes environ, et dès que
  // la page redevient visible ; jamais pendant une saisie en cours (voir verifierFormulairePublie).
  setInterval(() => {
    if (!document.hidden) verifierFormulairePublie().catch(() => {});
  }, 31000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) verifierFormulairePublie().catch(() => {});
  });
  // Nouveau signalement : on repart du haut du formulaire

  $("btn-nouveau").addEventListener("click", () => allerNouveau());
  $("btn-effacer").addEventListener("click", () =>
    enFile(async () => {
      fermerSuggestions();
      if (etatSaisie.dossierId && etatSaisie.initiale) {
        await remplirFormulaire();
        statut("statut-signalement", "Corrections annulées.");
      } else await preparerNouveauSignalement();
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
  $("cfg-formulaire").addEventListener("change", async () => {
    try {
      await grist.setOption("formulaire", $("cfg-formulaire").value || null);
      statut("cfg-statut", "Formulaire de la page enregistré.", "ok");
      enFile(async () => {
        await chargerConfiguration();
        await rafraichir();
      });
    } catch (erreur) {
      statut("cfg-statut", `Choix non enregistré : ${erreur.message || erreur}`, "err");
    }
  });
}
