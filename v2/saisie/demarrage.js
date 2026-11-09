/* PRISME — widget de saisie, demarrage.js
   Démarrage : vues (accueil, saisie), bandeaux, branchement des événements de la page puis de Grist. Chargé en
   dernier.
   Chargé par saisie/index.html dans l'ordre : fondations, composants, domaines, demarrage.js. Les fichiers partagent
   leurs noms (scripts classiques, sans import) : au chargement, un fichier ne fait que définir. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : brancherGrist, signalerErreurChargement, montrerVue, brancherEvenementsDemarrage.
   Utilise :
     fondations/etat : etatSaisie.
     fondations/grist : ACTIVITE, COLONNES, OPTIONS, enFile, mesurerArriveeEnvoi, traiterEnvoi.
     fondations/reglages : brancherEvenementsReglages.
     composants/nombres : brancherEvenementsNombres.
     composants/conditions-formules : brancherEvenementsConditionsFormules.
     composants/recherche-etablissement : brancherEvenementsRechercheEtablissement.
     composants/onglets : brancherEvenementsOnglets, fermerMenuActions, majModeSaisie.
     composants/tableaux-enregistrement : brancherEvenementsTableauxEnregistrement.
     domaines/agent/affichage : brancherEvenementsAgent.
     domaines/formulaire/affichage : brancherEvenementsFormulaire.
     domaines/etablissement/affichage : brancherEvenementsEtablissement.
     domaines/dossier/regles : decisionLigneCliquee.
     domaines/dossier/affichage : afficherCartes, afficherDossierOuvert, afficherSaisieEnCours,
       brancherEvenementsDossier, ouvrirDossier, preparerNouveauSignalement.
     domaines/enregistrement/affichage : brancherEvenementsEnregistrement, cacherConfirmation.
     domaines/visas/affichage : brancherEvenementsVisas.
     domaines/sites-esr/affichage : brancherEvenementsSitesEsr.
   Modifie etatSaisie : curseurInitialVu, dernierCurseur, envoiEnAttente, vue. */
/* Branchement sur Grist : appelé par le dernier module (34-parcours.js), une fois TOUS les modules chargés.
   Grist peut envoyer les lignes dès ce branchement ; le navigateur traiterait alors cet envoi entre deux fichiers
   si le branchement était fait ici, avant que les modules suivants (visas, parcours…) soient définis. */
function brancherGrist() {
  grist.ready({ requiredAccess: "full", columns: COLONNES });
  grist.onRecords((lignesRecues, mappingsRecus) => {
    const arrive = mesurerArriveeEnvoi(lignesRecues);
    const dejaPrevu = !!etatSaisie.envoiEnAttente;
    etatSaisie.envoiEnAttente = { recs: lignesRecues, m: mappingsRecus, arrive };
    if (dejaPrevu) {
      ACTIVITE.regroupes++;
      return;
    }
    return enFile(async () => {
      const { recs: lignesRecues, m: mappingsRecus, arrive } = etatSaisie.envoiEnAttente;
      etatSaisie.envoiEnAttente = null;
      const debutTraitement = performance.now();
      try {
        await traiterEnvoi(lignesRecues, mappingsRecus);
      } finally {
        arrive.ms = performance.now() - debutTraitement;
      }
    });
  }, OPTIONS);
  grist.onRecord(
    (rec) =>
      enFile(async () => {
        ACTIVITE.curseur++;
        if (!rec || (!etatSaisie.mappings && !Object.keys(etatSaisie.colsParDefaut).length)) return;
        const premiereSelection = !etatSaisie.curseurInitialVu;
        etatSaisie.curseurInitialVu = true;
        const { idDossier, action } = decisionLigneCliquee(rec);
        etatSaisie.dernierCurseur = rec.id;
        if (action === "ignorer-renvoi-meme-dossier") {
          ACTIVITE.curseurIgnores++;
          return;
        }
        if (action === "relire") {
          await ouvrirDossier(idDossier);
          return;
        }
        if (action === "ignorer") return;
        if (action === "saisie-en-cours") {
          afficherSaisieEnCours();
          return;
        }
        await ouvrirDossier(idDossier);
        afficherDossierOuvert(premiereSelection, idDossier);
      }),
    OPTIONS,
  );
  grist.onNewRecord(() =>
    enFile(async () => {
      const renvoi = etatSaisie.dernierCurseur === "new";
      etatSaisie.dernierCurseur = "new";
      if (!etatSaisie.dossierId) return; // déjà sur un nouveau signalement : rien à réinitialiser
      if (renvoi || etatSaisie.modifie) return; // simple renvoi, ou saisie en cours à préserver
      await preparerNouveauSignalement();
    }),
  );
}
function signalerErreurChargement(erreur, contexte) {
  const message = `${contexte} : ${(erreur && erreur.message) || erreur}${
    erreur && erreur.stack
      ? ` [${String(erreur.stack)
          .split("\n")
          .slice(0, 3)
          .map((ligneTrace) => ligneTrace.trim())
          .join(" ← ")}]`
      : ""
  }`;
  console.error("Formulaire :", contexte, erreur);
  if (etatSaisie.erreursChargement.includes(message)) return;
  etatSaisie.erreursChargement.push(message);
  const zoneAlerte = $("alerte");
  if (zoneAlerte) {
    zoneAlerte.textContent = `${zoneAlerte.hidden ? "" : zoneAlerte.textContent + " "}Le formulaire n'a pas pu se charger entièrement (${message}). Copiez ce message pour l'administrateur du document ; « ⚙ Diagnostic » reste accessible.`;
    zoneAlerte.hidden = false;
  }
  const boutonConfig = $("btn-config");
  if (boutonConfig && !etatSaisie.modeEtab) boutonConfig.hidden = false;
}
// un signalement dont les faits datent de moins de 7 jours est « en cours » (sauf s'il est clos)
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

// Événements de la page traités ici ; appelé une fois par demarrage.js
function brancherEvenementsDemarrage() {
  window.addEventListener("error", (evenement) => {
    if (evenement.error && !etatSaisie.referentielLu) signalerErreurChargement(evenement.error, "erreur");
  });
  window.addEventListener("unhandledrejection", (evenement) => {
    if (!etatSaisie.referentielLu) signalerErreurChargement(evenement.reason, "erreur");
  });
}

/* Démarrage, une fois tous les fichiers chargés : les événements de la page sont branchés dans cet ordre (deux
   écouteurs du même événement s'exécutent dans l'ordre où ils ont été branchés), puis l'accueil s'affiche et Grist
   est branché en dernier (voir brancherGrist). */
brancherEvenementsReglages();
brancherEvenementsConditionsFormules();
brancherEvenementsOnglets();
brancherEvenementsTableauxEnregistrement();
brancherEvenementsRechercheEtablissement();
brancherEvenementsNombres();
brancherEvenementsAgent();
brancherEvenementsFormulaire();
brancherEvenementsDossier();
brancherEvenementsEtablissement();
brancherEvenementsEnregistrement();
brancherEvenementsSitesEsr();
brancherEvenementsVisas();
brancherEvenementsDemarrage();
montrerVue("accueil");
// tout le code du widget est chargé : branchement sur Grist (voir 06-grist.js)
brancherGrist();
