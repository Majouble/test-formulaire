/* PRISME — widget de saisie, domaines/veille/donnees.js
   Domaine : le bandeau des vigilances météo — données (lectures et écritures du document).
   Chargé par saisie/index.html dans l'ordre : fondations, composants, domaines, demarrage.js. Les fichiers partagent
   leurs noms (scripts classiques, sans import) : au chargement, un fichier ne fait que définir. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : lireVeille.
   Utilise :
     fondations/etat : etatSaisie.
   Modifie etatSaisie : dernierVeille, vigilancesPage. */
async function lireVeille() {
  etatSaisie.dernierVeille = Date.now();
  try {
    etatSaisie.vigilancesPage = await window.Socle.lireVigilances(etatSaisie.socleGeneral);
  } catch (_) {
    etatSaisie.vigilancesPage = null;
  }
}
