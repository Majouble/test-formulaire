/* PRISME — administration, onglet « Formulaires » : formulaires/demarrage.js
   Démarrage : lecture du socle, première ouverture de l'onglet, branchement des événements, interface de l'onglet
   (window.OngletFormulaires).
   Chargé par admin/index.html dans l'ordre : fondations, donnees, formulaire-courant, colonnes-roles, apercu,
   mode-test, panneau-question, sites-esr, tableaux, gestion, description, saisie-etablissement, demarrage. Les
   fichiers partagent leurs noms (scripts classiques, sans import) : au chargement, un fichier ne fait que définir ;
   demarrage.js branche les événements et publie l'onglet. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : lireSocle, afficher.
   Utilise :
     fondations : $, esc, etatFormulaires.
     donnees : lireFormulaires, lireMeta.
     formulaire-courant : charger.
     apercu : brancherEvenementsApercu, brancherEvenementsMenuAjout, dessinerApercu.
     panneau-question : brancherEvenementsPanneau, dessinerPanneau.
     gestion : brancherEvenementsGestion, remplirChoixFormulaire.
     description : lireReglagesCommuns.
     saisie-etablissement : lirePagesSaisie.
   Modifie etatFormulaires : accesOk, demarre, socleConfig, socleGeneral, tableFormulaires. */
/* =========================================================
 Démarrage
 ========================================================= */
/* =========================================================
 Démarrage : à la première ouverture de l'onglet (administration v2)
 ========================================================= */
etatFormulaires.socleGeneral = { ...window.Socle.DEFAUTS_GENERAL };
async function lireSocle() {
  try {
    etatFormulaires.socleConfig = await window.Socle.lireConfig();
  } catch (_) {
    etatFormulaires.socleConfig = null;
  }
  etatFormulaires.socleGeneral = window.Socle.general(etatFormulaires.socleConfig);
  etatFormulaires.tableFormulaires = etatFormulaires.socleGeneral.formulaires || "Formulaires";
}
async function afficher() {
  if (etatFormulaires.demarre) {
    await lireSocle();
    await lirePagesSaisie();
    if (etatFormulaires.courant) dessinerPanneau();
    return;
  }
  etatFormulaires.demarre = true;
  await lireSocle();
  try {
    await lireMeta();
    await Promise.all([lireFormulaires(), lireReglagesCommuns(), lirePagesSaisie()]);
    if (etatFormulaires.formulaires.length) charger(etatFormulaires.formulaires[0]);
    remplirChoixFormulaire();
    dessinerApercu();
    dessinerPanneau();
  } catch (erreur) {
    etatFormulaires.accesOk = false;
    $("apercu").innerHTML =
      `<div class="accueil"><h2>Accès insuffisant</h2><p class="note">Ce widget doit être réglé sur « Accès complet » au document (panneau de droite, « Accès »). ${esc(erreur.message || erreur)}</p></div>`;
  }
}
// Événements de l'onglet : branchés une fois, dans l'ordre où ils l'étaient au chargement
brancherEvenementsApercu();
brancherEvenementsMenuAjout();
brancherEvenementsPanneau();
brancherEvenementsGestion();
// Une autre personne a modifié la table des formulaires (ou la structure) : relecture si rien n'est sélectionné
grist.onRecords(() => {}, { includeColumns: "normal" });
window.OngletFormulaires = { afficher };
