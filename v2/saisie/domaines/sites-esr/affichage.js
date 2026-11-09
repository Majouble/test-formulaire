/* PRISME — widget de saisie, domaines/sites-esr/affichage.js
   Domaine : le formulaire par site (enseignement supérieur) — affichage (page et événements).
   Chargé par saisie/index.html dans l'ordre : fondations, composants, domaines, demarrage.js. Les fichiers partagent
   leurs noms (scripts classiques, sans import) : au chargement, un fichier ne fait que définir. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : sitesCtrl, reprendreEtatSites, reprendreSitesAuto, placerQualification, majQualifDeduite,
     confirmerControleSites, controleSites, brancherEvenementsSitesEsr.
   Utilise :
     fondations/outils : listeQualif, refId.
     fondations/etat : etatSaisie.
     composants/tableaux-structure : controleursTableau, nouvelIdLigne, videSous.
     domaines/formulaire/regles : varianteSaisie.
     domaines/formulaire/affichage : cocherQualif, lireQualificationInitiale.
     domaines/sites-esr/regles : dernierEtatSites, ecartQualification, formulaireParSite, messagesControleSites,
       plusGrave, qualifDesSites.
   Modifie etatSaisie : modifie, qualifTouchee, sitesAutoPour. */
/* ---------- Formulaire par site (enseignement supérieur) ----------
   Tableau des sites (réglage « sites » d'une question tableau) : chaque ligne est un site, avec sa qualification.
   - Reprise (2.50) : les sites du dossier de l'établissement mis à jour le plus récemment (jours antérieurs), dans sa
     dernière version, et eux seuls ; ceux revenus à la normale sont repris pour mémoire (sauf réglage contraire).
     Un site ne se retire pas d'un dossier : il passe en RAS (bouton « RAS » à la place de la suppression, pour les sites
     du dossier et les sites repris). Site saisi à tort : bouton « Supprimer » (🗑), qui l'efface de toutes les étapes
     du dossier à l'enregistrement (purgerSitesSupprimes).
   - Qualification de l'établissement : en bas du formulaire, déduite du site le plus grave (ordre des choix de la
     colonne Qualification, du plus grave au moins grave) ; contrôle de cohérence avant l'enregistrement. */
const sitesCtrl = () => controleursTableau("q").find((controleur) => controleur.sites && controleur.pret) || null;
// préremplit le tableau des sites ; renvoie le nombre de sites repris
function reprendreEtatSites(controleur, etabId, avecRas = controleur.sites.avecRas !== false, dossier = null) {
  const etats = dernierEtatSites(controleur, etabId, avecRas, dossier),
    reglagesSites = controleur.sites;
  controleur.retires = [];
  controleur.supprimes = [];
  controleur.lignes = etats.map((etatSite) => {
    const valeursReprises = {};
    for (const sousQuestion of controleur.sousDefs)
      if (!sousQuestion.confidentiel && !videSous(etatSite.valeurs[sousQuestion.colId]))
        valeursReprises[sousQuestion.colId] = Array.isArray(etatSite.valeurs[sousQuestion.colId])
          ? [...etatSite.valeurs[sousQuestion.colId]]
          : etatSite.valeurs[sousQuestion.colId];
    if (reglagesSites.site && etatSite.cle.startsWith("s") && !refId(valeursReprises[reglagesSites.site])) {
      valeursReprises[reglagesSites.site] = +etatSite.cle.slice(1);
      if (reglagesSites.libre) delete valeursReprises[reglagesSites.libre];
    } // libellé rattaché au référentiel
    // site revenu à la normale : repris pour mémoire (une ligne par site connu), sans confirmation à donner
    return {
      _id: nouvelIdLigne(),
      valeurs: valeursReprises,
      _fixe: true,
      _repris: { qualif: etatSite.qualif, quand: etatSite.quand, etat: etatSite.normal ? "normal" : "a_confirmer" },
    };
  });
  controleur.lignes.forEach((ligne) => controleur.initAuto(ligne));
  controleur.dessiner();
  return etats.length;
}
function reprendreSitesAuto() {
  const controleur = sitesCtrl();
  if (!controleur || etatSaisie.dossierId || !etatSaisie.etabCourant || etatSaisie.modeEtab) return;
  const etablissementId = etatSaisie.etabCourant.id;
  if (etatSaisie.sitesAutoPour === etablissementId) return;
  const intactes = controleur.lignes.every(
    (ligne) => controleur.ligneVide(ligne) || (ligne._repris && !["modifie", "confirme"].includes(ligne._repris.etat)),
  );
  if (!intactes) return;
  etatSaisie.sitesAutoPour = etablissementId;
  if (controleur.sites.reprise === "non") {
    controleur.offreReprise = null;
    controleur.noteAuto = "";
    return;
  }
  if (controleur.sites.reprise === "bouton") {
    // reprise automatique désactivée (administration) : le tableau reste vide, la reprise est proposée par un bouton
    const nombreSitesProposes = dernierEtatSites(controleur, etablissementId, controleur.sites.avecRas).length;
    controleur.offreReprise = nombreSitesProposes ? { etab: etablissementId, n: nombreSitesProposes } : null;
    controleur.dessiner();
    return;
  }
  const nombreSitesRepris = reprendreEtatSites(controleur, etablissementId);
  controleur.noteAuto = nombreSitesRepris
    ? `${nombreSitesRepris} site${nombreSitesRepris > 1 ? "s" : ""} du dernier signalement de cet établissement, dans leur dernier état : confirmez ou modifiez ceux qui ne sont pas revenus à la normale, ajoutez les nouveaux.`
    : "";
  controleur.dessiner();
  etatSaisie.qualifTouchee = false;
  majQualifDeduite();
}
// qualification en bas (après les sites), et mention de la qualification déduite des sites
function placerQualification() {
  const fieldsetQualification = $("qualifs-initiales").closest("fieldset"),
    enBas = formulaireParSite() && varianteSaisie().qualificationEnBas !== false;
  if (enBas) $("questions").after(fieldsetQualification);
  else $("bloc-date-faits").after(fieldsetQualification);
  fieldsetQualification.classList.toggle("qualif-deduite", enBas);
  let paragrapheQualification = $("qualif-sites");
  if (!paragrapheQualification) {
    paragrapheQualification = document.createElement("p");
    paragrapheQualification.id = "qualif-sites";
    paragrapheQualification.className = "aide qualif-sites";
    paragrapheQualification.setAttribute("aria-live", "polite");
    fieldsetQualification.appendChild(paragrapheQualification);
  }
  paragrapheQualification.hidden = !enBas;
  if (enBas) majQualifDeduite();
}
function majQualifDeduite() {
  const paragrapheQualification = $("qualif-sites");
  if (!paragrapheQualification || paragrapheQualification.hidden) return;
  const syntheseSites = qualifDesSites();
  if (!syntheseSites || !syntheseSites.nb) {
    paragrapheQualification.textContent = "Déduite des sites : renseignez d'abord les sites et leur qualification.";
    paragrapheQualification.classList.remove("alerte-faits");
    return;
  }
  if (syntheseSites.plusGrave && !etatSaisie.qualifTouchee)
    cocherQualif(etatSaisie.qualifMultiple ? [syntheseSites.plusGrave] : syntheseSites.plusGrave);
  const actuel = plusGrave(listeQualif(lireQualificationInitiale()));
  const ecart = ecartQualification(syntheseSites, actuel);
  paragrapheQualification.innerHTML = syntheseSites.plusGrave
    ? `Qualification la plus grave des sites : <strong>${esc(syntheseSites.plusGrave)}</strong>${ecart ? ` — différente de celle choisie (${esc(actuel)}) : vérifiez avant d'enregistrer. <button type="button" class="lien-texte" id="btn-qualif-sites">Reprendre ${esc(syntheseSites.plusGrave)}</button>` : etatSaisie.qualifTouchee ? "" : " (reprise automatiquement)"}`
    : "Aucun site n'a de qualification.";
  paragrapheQualification.classList.toggle("alerte-faits", !!ecart);
  const boutonReprendre = $("btn-qualif-sites");
  if (boutonReprendre)
    boutonReprendre.addEventListener("click", () => {
      etatSaisie.qualifTouchee = false;
      majQualifDeduite();
      etatSaisie.modifie = true;
    });
}
// Demande confirmation à l'utilisateur avec les messages du contrôle
function confirmerControleSites(messages) {
  return confirm(`${messages.join("\n\n")}\n\nEnregistrer quand même ?`);
}
// avant l'enregistrement : qualification incohérente avec les sites, sites repris ni confirmés ni modifiés
function controleSites() {
  const controleur = sitesCtrl();
  if (!controleur) return true;
  const syntheseSites = qualifDesSites(),
    actuel = plusGrave(listeQualif(lireQualificationInitiale()));
  const messages = messagesControleSites(controleur, syntheseSites, actuel);
  return !messages.length || confirmerControleSites(messages);
}

// Événements de la page traités ici ; appelé une fois par demarrage.js
function brancherEvenementsSitesEsr() {
  $("qualifs-initiales").addEventListener("change", () => {
    etatSaisie.qualifTouchee = true;
    majQualifDeduite();
  });
}
