/* PRISME — widget de saisie, domaines/dossier/donnees.js
   Domaine : les dossiers : versions, liste et filtres, ouverture, navigation, historique, reprise, plusieurs jours
   — données (lectures et écritures du document).
   Chargé par saisie/index.html dans l'ordre : fondations, composants, domaines, demarrage.js. Les fichiers partagent
   leurs noms (scripts classiques, sans import) : au chargement, un fichier ne fait que définir. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : ecrireClos.
   Utilise :
     fondations/outils : colonneDe. */
// Écrit l'état clos ou rouvert sur la ligne
async function ecrireClos(ligneId, clore) {
  await grist.getTable().update({ id: ligneId, fields: { [colonneDe("Clos")]: clore } });
}
