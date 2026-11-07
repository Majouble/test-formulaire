/* PRISME — widget de saisie, domaines/agent/regles.js
   Domaine : la personne connectée : profil, créneau du planning, prise de service, périmètre — règles (calculs,
   sans page ni Grist).
   Chargé par saisie/index.html dans l'ordre : fondations, composants, domaines, demarrage.js. Les fichiers partagent
   leurs noms (scripts classiques, sans import) : au chargement, un fichier ne fait que définir. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : choisirCreneauAgent, calculerPerimetreCreneau, signatureCreneau, messageErreurEmargement, heureCourte,
     texteCreneau, perimetre, perimetreActif, dansPerimetre, resumePerimetre.
   Utilise :
     fondations/configuration : colonnesEtab.
     fondations/outils : sansAccents.
     fondations/etat : etatSaisie.
     domaines/formulaire/regles : champWidget. */
// Choisit le créneau en cours de l'agent, de préférence dans le champ de ce formulaire
function choisirCreneauAgent(planning) {
  const enCours = window.Socle.affectationsEnCours(planning, etatSaisie.agentPage),
    champFormulaire = champWidget();
  // de préférence une affectation qui couvre le champ de ce formulaire
  const dansChamp = enCours.find(
    (affectationEnCours) =>
      !champFormulaire || window.Socle.champsDe(affectationEnCours.affectation).includes(champFormulaire),
  );
  return dansChamp || (enCours[0] ? { ...enCours[0], horsChamp: true } : null);
}
// Calcule le périmètre porté par le créneau retenu (celui de la fiche s'il est hors champ ou absent)
function calculerPerimetreCreneau(creneauRetenu) {
  let perimetreAffectation = etatSaisie.perimetreFiche;
  if (creneauRetenu && !creneauRetenu.horsChamp) {
    try {
      perimetreAffectation = String(creneauRetenu.affectation.perimetre || "").trim()
        ? JSON.parse(creneauRetenu.affectation.perimetre)
        : {};
    } catch (_) {
      perimetreAffectation = {};
    }
  }
  return perimetreAffectation;
}
// Calcule la signature (affectation, périmètre) qui sert à détecter un changement de créneau
function signatureCreneau(creneau, perimetreBrut) {
  return JSON.stringify([creneau && creneau.affectation.id, perimetreBrut]);
}
// Compose le message d'erreur d'émargement affiché à l'agent
function messageErreurEmargement(erreur) {
  return /ACL|access|accès|denied|refus/i.test(String((erreur && erreur.message) || erreur))
    ? `émargement refusé : seul ${etatSaisie.libellePage || "l'agent de cette page"} peut émarger ici, avec son propre compte`
    : `émargement impossible (${erreur.message || erreur})`;
}
const heureCourte = (sec) => {
  const parties = Outils.dates.parties(sec);
  return `${parties.heures} h${parties.minutes ? ` ${String(parties.minutes).padStart(2, "0")}` : ""}`;
};
function texteCreneau() {
  if (etatSaisie.agentPage == null) return "";
  if (!etatSaisie.creneauPage) return "hors créneau";
  const creneau = etatSaisie.creneauPage.creneau,
    affectation = etatSaisie.creneauPage.affectation;
  return (
    `${creneau.nom} ${heureCourte(creneau.debut)}–${heureCourte(creneau.fin)}${affectation.fonction ? `, ${affectation.fonction.toLowerCase()}` : ""}` +
    (etatSaisie.creneauPage.horsChamp
      ? ` ${window.Socle.champsDe(affectation).join(" et ")} (pas ${champWidget()} sur ce créneau)`
      : "")
  );
}
function perimetre() {
  if (etatSaisie.modeEtab || !etatSaisie.perimetreBrut) return {};
  const perimetreBrut = Array.isArray(etatSaisie.perimetreBrut)
    ? etatSaisie.perimetreBrut.length
      ? { [colonnesEtab.academie]: etatSaisie.perimetreBrut }
      : {}
    : etatSaisie.perimetreBrut;
  return Object.fromEntries(
    Object.entries(perimetreBrut || {}).filter(
      ([colonne, valeurs]) =>
        Array.isArray(valeurs) && valeurs.length && (!etatSaisie.etabs.length || etatSaisie.colsEtab.includes(colonne)),
    ),
  );
}
const perimetreActif = () => !etatSaisie.voirToutPerimetre && Object.keys(perimetre()).length > 0;
function dansPerimetre(etablissement) {
  if (!etablissement) return true; // établissement inconnu du référentiel : jamais masqué
  for (const [colonne, valeursAutorisees] of Object.entries(perimetre())) {
    const valeurEtablissement = etablissement[colonne];
    if (
      !valeursAutorisees.some(
        (valeurAutorisee) =>
          sansAccents(String(valeurAutorisee)) === sansAccents(String(valeurEtablissement ?? "").trim()),
      )
    )
      return false;
  }
  return true;
}
const resumePerimetre = () =>
  Object.values(perimetre())
    .map((valeurs) => valeurs.join(", "))
    .join(" – ");
