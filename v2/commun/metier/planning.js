/* =====================================================================
   PRISME — règles métier : équipe et planning
   ---------------------------------------------------------------------
   Tables (noms dans la clé « general » de Config) :
     Agents : la fiche de chaque agent (nom, adresse, téléphone, équipe, fonction habituelle) ; la fonction réelle se
       règle par créneau dans le planning. Ses colonnes sont décrites dans admin/metier/agents.js.
     Creneaux : créneaux nommés de chaque jour (Debut et Fin datés : un créneau de nuit finit le lendemain).
     Affectations : un agent sur un créneau, avec sa fonction et son périmètre pour ce créneau
       (Perimetre : JSON { <colonne du référentiel>: [valeurs] } ; vide = tous les établissements).
       Champ : EN et/ou ESR, les formulaires sur lesquels l'agent est mobilisé pendant le créneau (vide = les deux).
       Le périmètre n'est pas fixé sur la fiche : il change d'un créneau à l'autre.
     Emargements : prises et fins de service.
   Liste des fonctions et modèles de journée : clé « planning » de Config.
   Chargé par chaque page, après commun/socle.js.

   Définit (sur window.Socle) : PLANNING_DEFAUT, reglagesPlanning, COLONNES_CRENEAUX, colonnesAffectations,
     colonnesEmargements, lireEmargements, champsDe, lirePlanning, affectationsEnCours.
   Utilise (window.Socle) : CHAMPS, choix, formuleAuteur, listeChoix.
   Utilise aussi : Donnees (lecture et écriture du document).
   ===================================================================== */
(function () {
  "use strict";

  const { CHAMPS, choix, formuleAuteur, listeChoix } = window.Socle;

  // fonctions : une ligne du tableau du planning chacune, dans cet ordre ; ligne: false = non affichée ; saisie: page de saisie
  const PLANNING_DEFAUT = {
    fonctions: [
      { nom: "Coordinateur", saisie: false, ligne: true },
      { nom: "Opérateur", saisie: true, ligne: true },
      { nom: "Rédacteur", saisie: false, ligne: true },
    ],
    modeles: [
      {
        nom: "Semaine",
        creneaux: [
          { nom: "Matin", debut: "08:00", fin: "13:00" },
          { nom: "Après-midi", debut: "13:00", fin: "19:00" },
        ],
      },
      { nom: "Week-end", creneaux: [{ nom: "Journée", debut: "09:00", fin: "18:00" }] },
    ],
  };
  function reglagesPlanning(config) {
    const reglages = (config && config.valeurs && config.valeurs.planning) || {};
    return {
      fonctions: (Array.isArray(reglages.fonctions) && reglages.fonctions.length
        ? reglages.fonctions
        : PLANNING_DEFAUT.fonctions
      ).map((fonction) => ({
        nom: String(fonction.nom || ""),
        saisie: !!fonction.saisie,
        ligne: fonction.ligne !== false,
        code: String(fonction.code || "")
          .toUpperCase()
          .replace(/[^A-Z]/g, "")
          .slice(0, 2),
      })),
      modeles: Array.isArray(reglages.modeles) ? reglages.modeles : PLANNING_DEFAUT.modeles,
    };
  }
  const COLONNES_CRENEAUX = [
    { id: "Date", type: "Date" },
    { id: "Nom", type: "Text" },
    { id: "Debut", type: "DateTime:Europe/Paris" },
    { id: "Fin", type: "DateTime:Europe/Paris" },
    { id: "Note", type: "Text" },
  ];
  function colonnesAffectations(reglagesGeneraux, config) {
    return [
      { id: "Creneau", type: `Ref:${reglagesGeneraux.creneaux}` },
      { id: "Agent", type: `Ref:${reglagesGeneraux.agents}` },
      {
        id: "Fonction",
        type: "Choice",
        widgetOptions: choix(reglagesPlanning(config).fonctions.map((fonction) => fonction.nom)),
      },
      { id: "Perimetre", type: "Text" },
      { id: "Champ", type: "ChoiceList", widgetOptions: choix(CHAMPS.map((champ) => champ.id)) },
      { id: "Note", type: "Text" },
      { id: "Modifie_le", type: "DateTime:Europe/Paris" },
    ];
  }
  // Émargement : une ligne par prise de service (Debut) ; Fin remplie à la fin du service.
  // Auteur : adresse du compte Grist qui a créé la ligne (formule d'initialisation user.Email), non falsifiable.
  function colonnesEmargements(reglagesGeneraux) {
    return [
      { id: "Agent", type: `Ref:${reglagesGeneraux.agents}` },
      { id: "Creneau", type: `Ref:${reglagesGeneraux.creneaux}` },
      { id: "Debut", type: "DateTime:Europe/Paris" },
      { id: "Fin", type: "DateTime:Europe/Paris" },
      { id: "Auteur", type: "Text", formula: formuleAuteur(reglagesGeneraux) },
      { id: "Note", type: "Text" },
    ];
  }
  // Émargements lus en une fois : [{ id, agent, creneau, debut, fin, auteur, note }] ; null si la table n'existe pas
  async function lireEmargements(reglagesGeneraux) {
    let table;
    table = await Donnees.lireSiPresente(reglagesGeneraux.emargements || "Emargements");
    if (!table) return null;
    const cellule = (colonne, ligne) => (table[colonne] || [])[ligne];
    return (table.id || [])
      .map((id, i) => ({
        id,
        agent: cellule("Agent", i),
        creneau: cellule("Creneau", i) || null,
        debut: cellule("Debut", i) || null,
        fin: cellule("Fin", i) || null,
        auteur: String(cellule("Auteur", i) || ""),
        note: String(cellule("Note", i) || ""),
      }))
      .sort((a, b) => (a.debut || 0) - (b.debut || 0));
  }
  // Champs couverts par une affectation : vide = les deux
  const champsDe = (affectation) => {
    const champs = (affectation && affectation.champ) || [];
    return champs.length ? champs : CHAMPS.map((champ) => champ.id);
  };
  // Planning lu en une fois : { creneaux: [{id, date, nom, debut, fin, note}], affectations: [{id, creneau, agent, fonction, perimetre(texte), note}] }
  // null si les tables n'existent pas.
  async function lirePlanning(reglagesGeneraux) {
    let creneaux, affectations;
    try {
      [creneaux, affectations] = await Promise.all([
        Donnees.lire(reglagesGeneraux.creneaux),
        Donnees.lire(reglagesGeneraux.affectations),
      ]);
    } catch (_) {
      return null;
    }
    const cellule = (table, colonne, ligne) => (table[colonne] || [])[ligne];
    return {
      creneaux: (creneaux.id || [])
        .map((id, i) => ({
          id,
          date: cellule(creneaux, "Date", i),
          nom: String(cellule(creneaux, "Nom", i) || ""),
          debut: cellule(creneaux, "Debut", i),
          fin: cellule(creneaux, "Fin", i),
          note: String(cellule(creneaux, "Note", i) || ""),
        }))
        .sort((a, b) => (a.debut || 0) - (b.debut || 0)),
      affectations: (affectations.id || []).map((id, i) => ({
        id,
        creneau: cellule(affectations, "Creneau", i),
        agent: cellule(affectations, "Agent", i),
        fonction: String(cellule(affectations, "Fonction", i) || ""),
        perimetre: cellule(affectations, "Perimetre", i) || "",
        champ: listeChoix(cellule(affectations, "Champ", i)),
        note: String(cellule(affectations, "Note", i) || ""),
      })),
    };
  }
  // Affectations en cours d'un agent à un instant (secondes, maintenant par défaut) : [{ affectation, creneau }]
  function affectationsEnCours(planning, agentId, instant = Date.now() / 1000) {
    if (!planning || agentId == null) return [];
    const parId = new Map(planning.creneaux.map((creneau) => [creneau.id, creneau]));
    return planning.affectations
      .filter((affectation) => affectation.agent === agentId)
      .map((affectation) => ({ affectation: affectation, creneau: parId.get(affectation.creneau) }))
      .filter((enCours) => enCours.creneau && enCours.creneau.debut <= instant && instant < enCours.creneau.fin);
  }

  Object.assign(window.Socle, {
    PLANNING_DEFAUT,
    reglagesPlanning,
    COLONNES_CRENEAUX,
    colonnesAffectations,
    colonnesEmargements,
    lireEmargements,
    champsDe,
    lirePlanning,
    affectationsEnCours,
  });
})();
