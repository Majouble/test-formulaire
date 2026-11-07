/* PRISME — widget de saisie, composants/date-faits.js
   Composant : champ de la date des faits.
   Chargé par saisie/index.html dans l'ordre : fondations, composants, domaines, demarrage.js. Les fichiers partagent
   leurs noms (scripts classiques, sans import) : au chargement, un fichier ne fait que définir. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : faitsAvecHeure, initialiserDateFaits, lireDateFaits, dateFaitsFuture, aideFaitsDefaut.
   Utilise :
     fondations/outils : secondes, valeurLocale.
     fondations/etat : etatSaisie.
     domaines/formulaire/regles : varianteSaisie.
   Modifie etatSaisie : dateFaitsTouchee. */
const faitsAvecHeure = () => $("date-faits").type === "datetime-local";
function initialiserDateFaits(valeur) {
  etatSaisie.dateFaitsTouchee = false;
  const secondesFaits = secondes(valeur);
  if (secondesFaits == null) {
    $("date-faits").value = valeurLocale(new Date(), faitsAvecHeure());
    return;
  }
  // colonne Date : minuit UTC ; colonne DateTime : instant exact
  $("date-faits").value = faitsAvecHeure()
    ? valeurLocale(new Date(secondesFaits * 1000), true)
    : new Date(secondesFaits * 1000).toISOString().slice(0, 10);
}
function lireDateFaits() {
  // secondes au format Grist, ou null
  const valeurChamp = $("date-faits").value;
  if (!valeurChamp) return null;
  return faitsAvecHeure()
    ? Outils.dates.depuisChamp(valeurChamp) / 1000
    : Date.parse(valeurChamp + "T00:00:00Z") / 1000;
}
function dateFaitsFuture() {
  const valeurChamp = $("date-faits").value;
  if (!valeurChamp) return false;
  return valeurChamp.slice(0, 10) > valeurLocale(new Date(), false);
}
const aideFaitsDefaut = () =>
  varianteSaisie().faitsFuturs
    ? "Aujourd'hui par défaut. Modifiez-la si les faits sont antérieurs, ou à venir (fermeture annoncée…)."
    : "Aujourd'hui par défaut. Modifiez-la si les faits signalés sont antérieurs.";
