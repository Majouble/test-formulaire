/* PRISME — widget de saisie, domaines/visas/affichage.js
   Domaine : les visas départementaux et académiques — affichage (page et événements).
   Chargé par saisie/index.html dans l'ordre : fondations, composants, domaines, demarrage.js. Les fichiers partagent
   leurs noms (scripts classiques, sans import) : au chargement, un fichier ne fait que définir. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : majBandeauVisa, remplirVisas, activerVerdictRapide, enregistrerVerdict, enregistrerVisa,
     brancherEvenementsVisas.
   Utilise :
     fondations/outils : dateFr, egal, lisible, secondes, statut, valeurLigne.
     fondations/etat : etatSaisie.
     fondations/grist : enFile.
     composants/champs : lireChamps, remplirChamps, valeurOuNull.
     composants/onglets : afficherOnglet.
     domaines/formulaire/affichage : lireChoix.
     domaines/dossier/affichage : afficherCartes.
     domaines/enregistrement/regles : seulementModifies.
     domaines/visas/regles : aViserParMoi, champVerdict, echelonsAffichables.
     domaines/visas/donnees : ecrireVerdict, ecrireVisa.
   Modifie etatSaisie : fileVisa, modifieVisa, nbCartes. */
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
  const { montrerDep, montrerAca } = echelonsAffichables(questionsVisaDep, questionsVisaAca);
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
        egal(
          valeurOuNull(questionVerdict, encours),
          valeurOuNull(questionVerdict, etatSaisie.derniere[questionVerdict.colId]),
        );
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
    egal(
      valeurOuNull(questionVerdict, valeurChoisie),
      valeurOuNull(questionVerdict, etatSaisie.derniere[questionVerdict.colId]),
    )
  )
    return;
  statut(statutId, "Enregistrement…");
  try {
    await ecrireVerdict(etatSaisie.derniere.id, questionVerdict.colId, valeurChoisie);
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
    await ecrireVisa(etatSaisie.derniere.id, fields);
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

// Événements de la page traités ici ; appelé une fois par demarrage.js
function brancherEvenementsVisas() {
  $("form-visa-dep").addEventListener("submit", (evenement) => {
    evenement.preventDefault();
    enFile(() => enregistrerVisa("vd", etatSaisie.defsDep, "statut-dep"));
  });
  $("form-visa-aca").addEventListener("submit", (evenement) => {
    evenement.preventDefault();
    enFile(() => enregistrerVisa("va", etatSaisie.defsAca, "statut-aca"));
  });
}
