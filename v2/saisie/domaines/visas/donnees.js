/* PRISME — widget de saisie, domaines/visas/donnees.js
   Domaine : les visas départementaux et académiques — données (lectures et écritures du document).
   Chargé par saisie/index.html dans l'ordre : fondations, composants, domaines, demarrage.js. Les fichiers partagent
   leurs noms (scripts classiques, sans import) : au chargement, un fichier ne fait que définir. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : ecrireVerdict, ecrireVisa. */
// Écrit le verdict choisi sur la ligne
async function ecrireVerdict(ligneId, colId, valeur) {
  await grist.getTable().update({ id: ligneId, fields: { [colId]: valeur } });
}
// Écrit les champs du visa sur la ligne
async function ecrireVisa(ligneId, fields) {
  await grist.getTable().update({ id: ligneId, fields });
}
