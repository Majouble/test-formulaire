/* PRISME — widget de saisie, domaines/agent/affichage.js
   Domaine : la personne connectée : profil, créneau du planning, prise de service, périmètre — affichage (page et
   événements).
   Chargé par saisie/index.html dans l'ordre : fondations, composants, domaines, demarrage.js. Les fichiers partagent
   leurs noms (scripts classiques, sans import) : au chargement, un fichier ne fait que définir. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : afficherChangementCreneau, htmlEmargement, basculerService, afficherBandeauPerimetre,
     brancherEvenementsAgent.
   Utilise :
     fondations/etat : etatSaisie.
     domaines/agent/regles : heureCourte, messageErreurEmargement, resumePerimetre, signatureCreneau, texteCreneau.
     domaines/agent/donnees : ecrireEmargement, lireEmargementAgent, majCreneau.
     domaines/dossier/affichage : majListeDossiers.
   Modifie etatSaisie : erreurEmargement, voirToutPerimetre. */
// Redessine le bandeau de périmètre, et la liste des dossiers si le créneau ou le périmètre a changé
function afficherChangementCreneau(redessiner, avant, creneauRetenu) {
  if (redessiner && avant !== signatureCreneau(creneauRetenu, etatSaisie.perimetreBrut)) {
    afficherBandeauPerimetre();
    majListeDossiers();
  } else if (redessiner) afficherBandeauPerimetre();
}
function htmlEmargement() {
  if (!etatSaisie.emargementsDispo || etatSaisie.agentPage == null || etatSaisie.modeEtab) return "";
  const depuis = etatSaisie.emargementOuvert ? (Date.now() / 1000 - etatSaisie.emargementOuvert.debut) / 3600 : 0;
  return (
    ` <span class="emargement${etatSaisie.emargementOuvert ? " en-service" : ""}">` +
    (etatSaisie.emargementOuvert
      ? `en service depuis ${heureCourte(etatSaisie.emargementOuvert.debut)}${depuis > 14 ? " (oubli de fin de service ?)" : ""} <button type="button" class="lien" id="btn-service">Je termine mon service</button>`
      : `<button type="button" class="lien" id="btn-service">Je prends mon service</button>`) +
    (etatSaisie.erreurEmargement ? ` <span class="err-emargement">${esc(etatSaisie.erreurEmargement)}</span>` : "") +
    `</span>`
  );
}
async function basculerService() {
  const nomTableEmargements = window.Socle.general(etatSaisie.socleConfig).emargements || "Emargements",
    maintenant = Date.now() / 1000;
  etatSaisie.erreurEmargement = "";
  try {
    await ecrireEmargement(nomTableEmargements, maintenant);
  } catch (erreur) {
    etatSaisie.erreurEmargement = messageErreurEmargement(erreur);
  }
  await lireEmargementAgent();
  afficherBandeauPerimetre();
}
function afficherBandeauPerimetre() {
  const bandeau = $("bandeau-perimetre");
  if (!bandeau) return;
  const resume = resumePerimetre();
  if (etatSaisie.modeEtab || (!resume && !etatSaisie.libellePage)) {
    bandeau.hidden = true;
    return;
  }
  bandeau.hidden = false;
  const creneauTexte = texteCreneau(),
    propre =
      etatSaisie.creneauPage &&
      !etatSaisie.creneauPage.horsChamp &&
      String(etatSaisie.creneauPage.affectation.perimetre || "").trim();
  bandeau.innerHTML =
    [
      etatSaisie.libellePage ? `<strong>${esc(etatSaisie.libellePage)}</strong>` : "",
      creneauTexte ? esc(creneauTexte) : "",
      resume
        ? `${propre ? "périmètre du créneau" : "périmètre"} : ${esc(resume)}`
        : etatSaisie.agentPage != null
          ? "tous les établissements"
          : "",
    ]
      .filter(Boolean)
      .join(" · ") +
    (resume
      ? ` <button type="button" class="lien" id="btn-voir-tout">${etatSaisie.voirToutPerimetre ? "Revenir à mon périmètre" : "Voir tous les signalements"}</button>`
      : "");
  bandeau.insertAdjacentHTML("beforeend", htmlEmargement());
  const boutonVoirTout = $("btn-voir-tout");
  if (boutonVoirTout)
    boutonVoirTout.addEventListener("click", () => {
      etatSaisie.voirToutPerimetre = !etatSaisie.voirToutPerimetre;
      afficherBandeauPerimetre();
      majListeDossiers();
    });
  const boutonService = $("btn-service");
  if (boutonService) boutonService.addEventListener("click", basculerService);
}

// Événements de la page traités ici ; appelé une fois par demarrage.js
function brancherEvenementsAgent() {
  setInterval(() => {
    if (!document.hidden && etatSaisie.agentPage != null) majCreneau(true).catch(() => {});
  }, 60000);
}
