/* PRISME — widget de saisie, module 30/34 : Visas départementaux et académiques.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : sansAccentBas, classerNiveau, chargerProfil, chargerProfilViseur, lieuDe, statutDe, peutViser,
     aViserParMoi, majBandeauVisa, lireVeille, majBandeauVeille, campagnesDeLEtab, majBandeauCampagne,
     qualificationRetourNormale, rienASignaler, remplirVisas, champVerdict, activerVerdictRapide,
     enregistrerVerdict, enregistrerVisa.
   Utilise :
     01 configuration : ETAB, UTILISATEURS.
     02 utilitaires : colonnesEtab.
     03 variantes : lisible, statut.
     04 date-faits : dateFr, secondes.
     05 etat : etabDeLigne, etatSaisie, valeurLigne.
     06 grist : enFile.
     09 dossier : cocherQualif, lireChoix, ouvrirDossier.
     10 champs : egal, lireChamps, norm, remplirChamps, typeBase.
     13 coherence : seulementModifies.
     15 onglets : afficherOnglet, passerEnCreation.
     16 description : majEtatDescription.
     24 filtres-navigation : derniereDe.
     25 plusieurs-jours : dossierDuJour.
     26 sites-esr : retourNormale.
     28 enregistrement : enregistrerSignalement.
     34 parcours : abandonAccepte, afficherCartes, cacherConfirmation, montrerVue.
   Modifie etatSaisie : dernierVeille, descriptionManuelle, fileVisa, modifie, modifieVisa, monNiveau,
     monPerimetreVisa, nbCartes, reglageValidation, vigilancesPage. */
/* =========================================================
   Visas : portent sur la dernière version, jamais recopiés dans les suivis
   ========================================================= */
const sansAccentBas = (texte) =>
  String(texte ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
function classerNiveau(valeur) {
  const texteSansAccent = sansAccentBas(valeur);
  if (texteSansAccent.includes("region")) return "region"; // avant "academie" : "région académique" contient aussi "academie"
  if (texteSansAccent.includes("departement")) return "departement";
  if (texteSansAccent.includes("academie")) return "academie";
  return null;
}
async function chargerProfil() {
  etatSaisie.monNiveau = null;
  try {
    const tableUtilisateurs = await Donnees.lire(UTILISATEURS.table);
    const nomsColonnes = Object.keys(tableUtilisateurs);
    const colonnesUtilisateurs = UTILISATEURS.colonnes;
    if (
      !nomsColonnes.includes(colonnesUtilisateurs.mail) ||
      !nomsColonnes.includes(colonnesUtilisateurs.niveau) ||
      tableUtilisateurs.id.length !== 1
    )
      return;
    const ligneUtilisateur = {};
    nomsColonnes.forEach((nomColonne) => (ligneUtilisateur[nomColonne] = tableUtilisateurs[nomColonne][0]));
    etatSaisie.monNiveau = classerNiveau(ligneUtilisateur[colonnesUtilisateurs.niveau]);
  } catch (erreur) {
    console.warn("Table Utilisateurs illisible", erreur);
  }
}

async function chargerProfilViseur() {
  etatSaisie.monPerimetreVisa = null;
  try {
    etatSaisie.reglageValidation = window.Socle.reglagesValidation(etatSaisie.socleConfig, etatSaisie.tableId);
  } catch (_) {
    etatSaisie.reglageValidation = null;
  }
  if (etatSaisie.agentPage == null) return;
  try {
    const tableAgents = await Donnees.lire(etatSaisie.socleGeneral.agents || "Agents"),
      i = tableAgents.id.indexOf(etatSaisie.agentPage);
    if (i < 0 || !tableAgents.Echelon_visa) return;
    const ech = String(tableAgents.Echelon_visa[i] || ""),
      niveau = ech === "Départemental" ? "departement" : ech === "Académique" ? "academie" : null;
    if (!niveau) return;
    etatSaisie.monNiveau = niveau;
    etatSaisie.monPerimetreVisa = {
      echelon: ech,
      departements: window.Socle.listeChoix((tableAgents.Visa_departements || [])[i]),
      academies: window.Socle.listeChoix((tableAgents.Visa_academies || [])[i]),
    };
  } catch (_) {
    /* table Agents illisible : ancien fonctionnement */
  }
}
// Département et académie de l'établissement d'une ligne (référentiel, à défaut colonnes recopiées de la table des réponses)
function lieuDe(ligne) {
  const ligneEtablissement = (ligne && etabDeLigne(ligne)) || {},
    donneesLigne = ligne || {};
  return {
    dep: String(
      (colonnesEtab.departement && ligneEtablissement[colonnesEtab.departement]) || donneesLigne.Departement || "",
    ),
    aca: String((colonnesEtab.academie && ligneEtablissement[colonnesEtab.academie]) || donneesLigne.Academie || ""),
  };
}
const statutDe = (ligne) =>
  etatSaisie.reglageValidation && ligne ? String(ligne[etatSaisie.reglageValidation.colonne] || "") : "";
// Le viseur de la page peut-il viser ce dossier à cet échelon (« dep » | « aca ») ? Sans profil de viseur : les règles d'accès décident.
function peutViser(echelonVisa, ligne = etatSaisie.initiale) {
  if (!etatSaisie.monPerimetreVisa) return true;
  const { dep, aca } = lieuDe(ligne);
  return window.Socle.viseurCouvre(
    etatSaisie.monPerimetreVisa,
    echelonVisa,
    dep,
    aca,
    etatSaisie.reglageValidation || { aca_vise_dep: true },
  );
}
// Dossier (ligne initiale) en attente du visa de ce viseur, dans son périmètre
function aViserParMoi(ligne) {
  if (!etatSaisie.monPerimetreVisa || !etatSaisie.reglageValidation) return false;
  const statutDossier = statutDe(derniereDe(ligne));
  return (
    (statutDossier === Socle.STATUT.dep && peutViser("dep", ligne)) ||
    (statutDossier === Socle.STATUT.aca && peutViser("aca", ligne))
  );
}
function majBandeauVisa() {
  const bandeau = $("bandeau-visa");
  if (!bandeau) return;
  if (!etatSaisie.monPerimetreVisa || !etatSaisie.reglageValidation || etatSaisie.modeEtab) {
    bandeau.hidden = true;
    etatSaisie.fileVisa = false;
    return;
  }
  const nombreAViser = (etatSaisie.indexRecherche || []).filter((entree) => aViserParMoi(entree.l)).length,
    perimetreViseur = etatSaisie.monPerimetreVisa;
  const zone = perimetreViseur.echelon === "Départemental" ? perimetreViseur.departements : perimetreViseur.academies;
  bandeau.hidden = false;
  bandeau.innerHTML = `<span class="grand">${nombreAViser ? `${nombreAViser} dossier${nombreAViser > 1 ? "s" : ""} à viser` : "Aucun dossier à viser"}</span>
    <span>visa ${perimetreViseur.echelon === "Départemental" ? "départemental" : "académique"} · ${esc(zone.length ? zone.join(", ") : "tout le document")}</span>
    <button type="button" class="secondaire petit" id="btn-file-visa">${etatSaisie.fileVisa ? "Afficher tous les signalements" : nombreAViser ? "Afficher la file" : "Afficher la file (vide)"}</button>`;
  $("btn-file-visa").addEventListener("click", () => {
    etatSaisie.fileVisa = !etatSaisie.fileVisa;
    etatSaisie.nbCartes = 30;
    afficherCartes();
  });
}
async function lireVeille() {
  etatSaisie.dernierVeille = Date.now();
  try {
    etatSaisie.vigilancesPage = await window.Socle.lireVigilances(etatSaisie.socleGeneral);
  } catch (_) {
    etatSaisie.vigilancesPage = null;
  }
}
function majBandeauVeille() {
  const bandeau = $("bandeau-veille");
  if (!bandeau) return;
  if (Date.now() - etatSaisie.dernierVeille > 600000) lireVeille().then(majBandeauVeille); // relue toutes les 10 minutes
  if (etatSaisie.modeEtab || !etatSaisie.vigilancesPage) {
    bandeau.hidden = true;
    return;
  }
  const reglagesVeille = Socle.reglagesVeille(etatSaisie.socleConfig),
    groupes = new Map();
  for (const vigilance of etatSaisie.vigilancesPage) {
    if (
      vigilance.niveau < reglagesVeille.seuil ||
      (reglagesVeille.phenomenes.length && !reglagesVeille.phenomenes.includes(vigilance.phenomene))
    )
      continue;
    const k = `${vigilance.niveau}|${vigilance.echeance === "Demain" ? 1 : 0}|${vigilance.phenomene}`;
    if (!groupes.has(k)) groupes.set(k, { v: vigilance, deps: [] });
    if (!groupes.get(k).deps.includes(vigilance.departement)) groupes.get(k).deps.push(vigilance.departement);
  }
  if (!groupes.size) {
    bandeau.hidden = true;
    return;
  }
  const pastille = ["", "🟢", "🟡", "🟠", "🔴"];
  bandeau.hidden = false;
  bandeau.innerHTML =
    [...groupes.entries()]
      .sort((entreeA, entreeB) => entreeB[0].localeCompare(entreeA[0]))
      .slice(0, 4)
      .map(
        ([, groupe]) =>
          `<p>${pastille[groupe.v.niveau] || ""} <strong>Vigilance ${esc(String(groupe.v.couleur).toLowerCase())} ${esc(groupe.v.phenomene.toLowerCase())}</strong> ${groupe.v.echeance === "Demain" ? "demain" : "aujourd'hui"} : ${esc(groupe.deps.slice(0, 8).join(", "))}${groupe.deps.length > 8 ? ` et ${groupe.deps.length - 8} autres` : ""}</p>`,
      )
      .join("") + (groupes.size > 4 ? `<p>… et ${groupes.size - 4} autre(s) vigilance(s).</p>` : "");
}
/* Campagnes (onglet Établissements de l'administration) : la page d'un établissement ouverte par son lien affiche la
   campagne qui le vise et propose « Rien à signaler », qui enregistre un signalement en retour à la normale. */
function campagnesDeLEtab() {
  if (!etatSaisie.modeEtab || !etatSaisie.etabs || !etatSaisie.etabs[0] || !etatSaisie.socleConfig || !Socle.campagnes)
    return [];
  const colonnesEtablissement = {
    nom: colonnesEtab.nom,
    uai: colonnesEtab.uai,
    commune: colonnesEtab.commune,
    mail: colonnesEtab.mail,
  };
  return Socle.campagnes(etatSaisie.socleConfig).filter(
    (campagne) =>
      Socle.campagneEnCours(campagne) &&
      (!campagne.referentiel || campagne.referentiel === ETAB.table) &&
      Socle.campagneVise(campagne, etatSaisie.etabs[0], colonnesEtablissement),
  );
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
// Valeur de qualification « retour à la normale » proposée par le formulaire (RAS par défaut)
function qualificationRetourNormale() {
  const valeursRetourNormale = retourNormale(),
    trouve = (etatSaisie.choix || []).find((choix) => valeursRetourNormale.has(String(choix).trim().toUpperCase()));
  return trouve || (etatSaisie.choix && etatSaisie.choix.length ? null : "RAS");
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
    else await passerEnCreation();
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

async function remplirVisas() {
  // Un bloc n'est affiché que si les règles d'accès laissent lire ses colonnes
  const visibles = (questions, prefix) =>
    questions.filter((question) => {
      const accessible =
        etatSaisie.derniere && lisible(etatSaisie.derniere[question.colId]) && question.colId in etatSaisie.derniere;
      const bloc = document.querySelector(`[data-champ="${prefix}-${question.colId}"]`);
      if (bloc) {
        bloc.hidden = !accessible;
        bloc.dataset.masqueAcces = accessible ? "0" : "1";
      }
      return accessible;
    });
  const questionsVisaDep = visibles(etatSaisie.defsDep, "vd"),
    questionsVisaAca = visibles(etatSaisie.defsAca, "va");
  // Un profil identifié dans « Utilisateurs » décide du périmètre : département → son échelon
  // seulement ; académie et région académique → les deux échelons. Sans profil reconnu (ex. le
  // propriétaire du document), on retombe sur ce que les règles d'accès laissent lire.
  let montrerDep = questionsVisaDep.length > 0;
  let montrerAca = questionsVisaAca.length > 0 && (!etatSaisie.monNiveau || etatSaisie.monNiveau !== "departement");
  // Viseur de l'onglet Validation : son échelon, sur les établissements de son périmètre seulement
  if (etatSaisie.monPerimetreVisa) {
    montrerDep =
      montrerDep &&
      (!etatSaisie.reglageValidation || etatSaisie.reglageValidation.echelons === "dep_aca") &&
      peutViser("dep");
    montrerAca = montrerAca && peutViser("aca");
  }
  $("form-visa-dep").hidden = !montrerDep;
  $("form-visa-aca").hidden = !montrerAca;
  $("onglet-visas").hidden = !(montrerDep || montrerAca);
  if ($("onglet-visas").hidden && !$("panneau-visas").hidden) afficherOnglet("signalement");

  // Profil identifié : n'afficher que le geste de validation (le toggle), rien d'autre du bloc.
  [
    ["form-visa-dep", etatSaisie.defsDep, "vd", montrerDep],
    ["form-visa-aca", etatSaisie.defsAca, "va", montrerAca],
  ].forEach(([formId, questions, prefix, montrer]) => {
    $(formId).classList.toggle("mode-toggle", !!etatSaisie.monNiveau);
    if (!etatSaisie.monNiveau || !montrer) return;
    const prim = champVerdict(questions);
    questions.forEach((question) => {
      const bloc = document.querySelector(`[data-champ="${prefix}-${question.colId}"]`);
      if (bloc && question !== prim) bloc.hidden = true;
    });
  });
  await remplirChamps("vd", questionsVisaDep, (question) => etatSaisie.derniere[question.colId]);
  await remplirChamps("va", questionsVisaAca, (question) => etatSaisie.derniere[question.colId]);
  if (etatSaisie.derniere) {
    const dateSaisie = valeurLigne(etatSaisie.derniere, "Date");
    $("note-visa").textContent =
      `Les visas portent sur la version la plus récente du signalement` +
      (secondes(dateSaisie) != null
        ? ` (${etatSaisie.derniere === etatSaisie.initiale ? "signalement initial" : "suivi"} du ${dateFr(dateSaisie, etatSaisie.metaDate)})`
        : "") +
      `. Tout nouveau suivi devra être visé à nouveau.`;
  }
  etatSaisie.modifieVisa = false;
}

// Le premier champ « Choix » du visa (typiquement Favorable / À revoir / Défavorable) est traité
// comme un verdict : cliquer dessus l'enregistre aussitôt, sans passer par le bouton « Enregistrer »,
// pour que l'agent du département ou de l'académie puisse valider en un geste. Les autres champs du
// bloc (observations, etc.) restent soumis par le bouton habituel.
function champVerdict(questions) {
  return questions.find(
    (question) =>
      !question.formule &&
      typeBase(question.type) === "Choice" &&
      (question.opts.choices || []).length &&
      (question.opts.choices || []).length <= 5,
  );
}

function activerVerdictRapide(prefix, questions, statutId) {
  const questionVerdict = champVerdict(questions);
  if (!questionVerdict) return;
  const id = `${prefix}-${questionVerdict.colId}`;
  const bloc = document.querySelector(`[data-champ="${id}"]`);
  if (!bloc) return;
  bloc.classList.add("bloc-verdict");
  if (!bloc.querySelector(".aide-verdict")) {
    const paragrapheAide = document.createElement("p");
    paragrapheAide.className = "aide-verdict";
    paragrapheAide.textContent = "Cliquer sur une valeur l'enregistre immédiatement.";
    bloc.insertBefore(paragrapheAide, bloc.querySelector(".choix-groupe"));
  }
  // À la souris, un clic sur une valeur l'enregistre aussitôt. Au clavier, les flèches parcourent les
  // valeurs sans rien enregistrer (sinon chaque valeur intermédiaire serait écrite) : Entrée valide.
  let pointeur = false;
  bloc.addEventListener("pointerdown", () => {
    pointeur = true;
  });
  bloc.querySelectorAll(`input[name="${id}"]`).forEach((choixRadio) => {
    choixRadio.addEventListener("change", () => {
      if (pointeur) {
        pointeur = false;
        enFile(() => enregistrerVerdict(questionVerdict, id, statutId));
        return;
      }
      const encours = lireChoix(id);
      const deja =
        etatSaisie.derniere &&
        egal(norm(questionVerdict, encours), norm(questionVerdict, etatSaisie.derniere[questionVerdict.colId]));
      statut(statutId, deja ? "" : `« ${encours} » sélectionné, non enregistré : appuyez sur Entrée pour valider.`);
    });
    choixRadio.addEventListener("keydown", (evenement) => {
      if (evenement.key !== "Enter") return;
      evenement.preventDefault(); // pas d'envoi implicite du formulaire de visa
      enFile(() => enregistrerVerdict(questionVerdict, id, statutId));
    });
  });
  const aide = bloc.querySelector(".aide-verdict");
  if (aide)
    aide.textContent =
      "Un clic sur une valeur l'enregistre immédiatement. Au clavier : flèches pour choisir, Entrée pour valider.";
}

async function enregistrerVerdict(questionVerdict, id, statutId) {
  if (!etatSaisie.derniere) return;
  const valeurChoisie = lireChoix(id);
  if (
    !valeurChoisie ||
    egal(norm(questionVerdict, valeurChoisie), norm(questionVerdict, etatSaisie.derniere[questionVerdict.colId]))
  )
    return;
  statut(statutId, "Enregistrement…");
  try {
    await grist.getTable().update({ id: etatSaisie.derniere.id, fields: { [questionVerdict.colId]: valeurChoisie } });
    etatSaisie.derniere[questionVerdict.colId] = valeurChoisie; // évite qu'« Enregistrer » ne renvoie inutilement cette même valeur
    statut(statutId, `Visa enregistré : ${valeurChoisie}.`, "ok");
  } catch (erreur) {
    statut(
      statutId,
      `Échec : ${erreur.message || erreur}. Vérifiez que ce visa relève bien de votre échelon et porte sur la dernière version.`,
      "err",
    );
  }
}

async function enregistrerVisa(prefix, questions, statutId) {
  if (!etatSaisie.derniere) return;
  const manquants = [];
  const valeurs = lireChamps(prefix, questions, manquants);
  if (manquants.length) {
    statut(statutId, `Renseignez ${manquants.join(", ")}.`, "err");
    return;
  }
  const fields = seulementModifies(questions, valeurs, etatSaisie.derniere);
  if (!Object.keys(fields).length) {
    statut(statutId, "Aucune modification à enregistrer.");
    return;
  }
  try {
    await grist.getTable().update({ id: etatSaisie.derniere.id, fields });
    etatSaisie.modifieVisa = false;
    statut(statutId, "Visa enregistré.", "ok");
  } catch (erreur) {
    statut(
      statutId,
      `Échec : ${erreur.message || erreur}. Vérifiez que ce visa relève bien de votre échelon et porte sur la dernière version.`,
      "err",
    );
  }
}
$("form-visa-dep").addEventListener("submit", (evenement) => {
  evenement.preventDefault();
  enFile(() => enregistrerVisa("vd", etatSaisie.defsDep, "statut-dep"));
});
$("form-visa-aca").addEventListener("submit", (evenement) => {
  evenement.preventDefault();
  enFile(() => enregistrerVisa("va", etatSaisie.defsAca, "statut-aca"));
});
