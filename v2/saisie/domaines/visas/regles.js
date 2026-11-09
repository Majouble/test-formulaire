/* PRISME — widget de saisie, domaines/visas/regles.js
   Domaine : les visas départementaux et académiques — règles (calculs, sans page ni Grist).
   Chargé par saisie/index.html dans l'ordre : fondations, composants, domaines, demarrage.js. Les fichiers partagent
   leurs noms (scripts classiques, sans import) : au chargement, un fichier ne fait que définir. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : classerNiveau, statutDe, peutViser, aViserParMoi, echelonsAffichables, champVerdict.
   Utilise :
     fondations/outils : sansAccents, typeBase.
     fondations/etat : etatSaisie.
     domaines/etablissement/regles : lieuDe.
     domaines/dossier/regles : derniereDe. */
function classerNiveau(valeur) {
  const texteSansAccent = sansAccents(valeur);
  if (texteSansAccent.includes("region")) return "region"; // avant "academie" : "région académique" contient aussi "academie"
  if (texteSansAccent.includes("departement")) return "departement";
  if (texteSansAccent.includes("academie")) return "academie";
  return null;
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
// Échelons de visa à afficher (montrerDep, montrerAca) selon le profil, le périmètre du viseur et les questions lisibles
function echelonsAffichables(questionsVisaDep, questionsVisaAca) {
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
  return { montrerDep, montrerAca };
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
