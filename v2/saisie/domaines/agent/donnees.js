/* PRISME — widget de saisie, domaines/agent/donnees.js
   Domaine : la personne connectée : profil, créneau du planning, prise de service, périmètre — données (lectures et
   écritures du document).
   Chargé par saisie/index.html dans l'ordre : fondations, composants, domaines, demarrage.js. Les fichiers partagent
   leurs noms (scripts classiques, sans import) : au chargement, un fichier ne fait que définir. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : UTILISATEURS, lirePlanningCreneau, majCreneau, lireEmargementAgent, ecrireEmargement, chargerProfil,
     chargerProfilViseur.
   Utilise :
     fondations/etat : etatSaisie.
     domaines/agent/regles : calculerPerimetreCreneau, choisirCreneauAgent, signatureCreneau.
     domaines/agent/affichage : afficherChangementCreneau.
     domaines/visas/regles : classerNiveau.
   Modifie etatSaisie : creneauPage, emargementOuvert, emargementsDispo, monNiveau, monPerimetreVisa, perimetreBrut,
     reglageValidation. */
// Identification de la personne connectée, pour n'afficher que le geste de validation qui la concerne.
// La règle d'accès sur cette table doit ne renvoyer QUE la ligne de la personne connectée
// (ex. : "user.Email == rec.Mail → Lecture"), sans quoi le widget ne peut pas déterminer un niveau unique.
const UTILISATEURS = {
  table: "Utilisateurs",
  colonnes: {
    region: "Region_academique",
    academie: "Academie",
    departement: "Departement",
    niveau: "Niveau_acces",
    nom: "Nom",
    prenom: "Prenom",
    fonction: "Fonction",
    mail: "Mail",
  },
};
// Lit le planning du socle (null si illisible)
async function lirePlanningCreneau() {
  let planning = null;
  try {
    planning = await window.Socle.lirePlanning(etatSaisie.socleGeneral);
  } catch (_) {
    planning = null;
  }
  return planning;
}
async function majCreneau(redessiner) {
  if (etatSaisie.agentPage == null) {
    etatSaisie.creneauPage = null;
    return;
  }
  const planning = await lirePlanningCreneau();
  const creneauRetenu = choisirCreneauAgent(planning);
  const avant = signatureCreneau(etatSaisie.creneauPage, etatSaisie.perimetreBrut);
  const perimetreAffectation = calculerPerimetreCreneau(creneauRetenu);
  etatSaisie.creneauPage = creneauRetenu;
  etatSaisie.perimetreBrut = perimetreAffectation;
  await lireEmargementAgent();
  afficherChangementCreneau(redessiner, avant, creneauRetenu);
}
async function lireEmargementAgent() {
  if (etatSaisie.agentPage == null) {
    etatSaisie.emargementsDispo = false;
    etatSaisie.emargementOuvert = null;
    return;
  }
  let emargements = null;
  try {
    emargements = await window.Socle.lireEmargements(etatSaisie.socleGeneral);
  } catch (_) {
    emargements = null;
  }
  etatSaisie.emargementsDispo = emargements !== null;
  etatSaisie.emargementOuvert =
    (emargements || [])
      .filter((emargement) => emargement.agent === etatSaisie.agentPage && emargement.debut && !emargement.fin)
      .pop() || null;
}
// Écrit l'émargement : fin de service si un émargement est ouvert, sinon prise de service
async function ecrireEmargement(nomTableEmargements, maintenant) {
  if (etatSaisie.emargementOuvert)
    await Donnees.ecrire([["UpdateRecord", nomTableEmargements, etatSaisie.emargementOuvert.id, { Fin: maintenant }]]);
  else
    await Donnees.ecrire([
      [
        "AddRecord",
        nomTableEmargements,
        null,
        {
          Agent: etatSaisie.agentPage,
          Creneau: (etatSaisie.creneauPage && etatSaisie.creneauPage.creneau.id) || 0,
          Debut: maintenant,
        },
      ],
    ]);
}
async function chargerProfil() {
  etatSaisie.monNiveau = null;
  try {
    const tableUtilisateurs = await Donnees.lire(UTILISATEURS.table);
    const nomsColonnes = Object.keys(tableUtilisateurs);
    const colonnesUtilisateurs = UTILISATEURS.colonnes;
    if (
      !nomsColonnes.includes(colonnesUtilisateurs.mail) ||
      !nomsColonnes.includes(colonnesUtilisateurs.niveau) ||
      tableUtilisateurs.id.length !== 1
    )
      return;
    const ligneUtilisateur = {};
    nomsColonnes.forEach((nomColonne) => (ligneUtilisateur[nomColonne] = tableUtilisateurs[nomColonne][0]));
    etatSaisie.monNiveau = classerNiveau(ligneUtilisateur[colonnesUtilisateurs.niveau]);
  } catch (erreur) {
    console.warn("Table Utilisateurs illisible", erreur);
  }
}
async function chargerProfilViseur() {
  etatSaisie.monPerimetreVisa = null;
  try {
    etatSaisie.reglageValidation = window.Socle.reglagesValidation(etatSaisie.socleConfig, etatSaisie.tableId);
  } catch (_) {
    etatSaisie.reglageValidation = null;
  }
  if (etatSaisie.agentPage == null) return;
  try {
    const tableAgents = await Donnees.lire(etatSaisie.socleGeneral.agents || "Agents"),
      i = tableAgents.id.indexOf(etatSaisie.agentPage);
    if (i < 0 || !tableAgents.Echelon_visa) return;
    const ech = String(tableAgents.Echelon_visa[i] || ""),
      niveau = ech === "Départemental" ? "departement" : ech === "Académique" ? "academie" : null;
    if (!niveau) return;
    etatSaisie.monNiveau = niveau;
    etatSaisie.monPerimetreVisa = {
      echelon: ech,
      departements: window.Socle.listeChoix((tableAgents.Visa_departements || [])[i]),
      academies: window.Socle.listeChoix((tableAgents.Visa_academies || [])[i]),
    };
  } catch (_) {
    /* table Agents illisible : ancien fonctionnement */
  }
}
