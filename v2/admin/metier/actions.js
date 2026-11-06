/* =====================================================================
   PRISME — règles métier : suivi des actions (onglet Actions, en kanban)
   ---------------------------------------------------------------------
   Une ligne par action dans la table Actions. Colonnes du kanban (statuts) réglables : clé « actions » de Config.
   Chargé par la page d'administration seulement, après commun/socle.js et commun/metier/.

   Définit (sur window.Socle) : ACTIONS_DEFAUT, STATUTS_ACTION, PRIORITES_ACTION, reglagesActions, optionsStatuts,
     colonnesActions, lireActions.
   Utilise (window.Socle) : choix, json.
   Utilise aussi : Donnees (lecture et écriture du document).
   ===================================================================== */
(function () {
  "use strict";

  const { choix, json } = window.Socle;

  // Suivi des actions (onglet Actions de l'administration, en kanban) : une ligne par action.
  // Colonnes du kanban (statuts) réglables : clé « actions » de Config ; « clos » = la colonne qui termine une action
  // (heure de réalisation notée, plus de retard). Ordre : position manuelle dans la colonne. Archivee : rangée dans les archives.
  const ACTIONS_DEFAUT = {
    statuts: [
      { nom: "À faire", couleur: "#6a6af4", emoji: "", clos: false },
      { nom: "En cours", couleur: "#d68a00", emoji: "", clos: false },
      { nom: "Fait", couleur: "#18753c", emoji: "", clos: true },
    ],
    cartes: { priorite: true, description: true, echeance: true, responsable: true, creation: false },
  };
  const STATUTS_ACTION = ACTIONS_DEFAUT.statuts.map((statut) => statut.nom);
  const PRIORITES_ACTION = ["Haute", "Moyenne", "Basse"];
  function reglagesActions(config) {
    const reglages = (config && config.valeurs && config.valeurs.actions) || {};
    const statuts = (
      Array.isArray(reglages.statuts) && reglages.statuts.length >= 2 ? reglages.statuts : ACTIONS_DEFAUT.statuts
    )
      .map((statut) => ({
        nom: String(statut.nom || ""),
        couleur: statut.couleur || "#94a3b8",
        emoji: String(statut.emoji || ""),
        clos: !!statut.clos,
      }))
      .filter((statut) => statut.nom);
    if (!statuts.some((statut) => statut.clos)) statuts[statuts.length - 1].clos = true;
    return { statuts, cartes: { ...ACTIONS_DEFAUT.cartes, ...(reglages.cartes || {}) } };
  }
  // Options de la colonne Choice Statut : choix et couleurs des colonnes du kanban
  const optionsStatuts = (statuts) =>
    json({
      choices: statuts.map((statut) => statut.nom),
      choiceOptions: Object.fromEntries(
        statuts.map((statut) => [statut.nom, { fillColor: statut.couleur, textColor: "#ffffff" }]),
      ),
    });
  function colonnesActions(reglagesGeneraux, config) {
    return [
      { id: "Titre", type: "Text" },
      { id: "Description", type: "Text" },
      { id: "Statut", type: "Choice", widgetOptions: optionsStatuts(reglagesActions(config).statuts) },
      { id: "Priorite", type: "Choice", widgetOptions: choix(PRIORITES_ACTION) },
      { id: "Responsable", type: `Ref:${reglagesGeneraux.agents}` },
      { id: "Echeance", type: "Date" },
      { id: "Cree_par", type: "Text", formula: "user.Email" },
      { id: "Cree_le", type: "DateTime:Europe/Paris", formula: "NOW()" },
      { id: "Fait_le", type: "DateTime:Europe/Paris" },
      { id: "Ordre", type: "Numeric" },
      { id: "Archivee", type: "Bool" },
    ];
  }
  async function lireActions(reglagesGeneraux) {
    let table;
    table = await Donnees.lireSiPresente(reglagesGeneraux.actions || "Actions");
    if (!table) return null;
    const cellule = (colonne, ligne) => (table[colonne] || [])[ligne];
    return (table.id || []).map((id, i) => ({
      id,
      titre: String(cellule("Titre", i) || ""),
      description: String(cellule("Description", i) || ""),
      statut: String(cellule("Statut", i) || ""),
      priorite: PRIORITES_ACTION.includes(cellule("Priorite", i)) ? cellule("Priorite", i) : "Moyenne",
      responsable: cellule("Responsable", i) || null,
      echeance: cellule("Echeance", i) || null,
      creePar: String(cellule("Cree_par", i) || ""),
      creeLe: cellule("Cree_le", i) || null,
      faitLe: cellule("Fait_le", i) || null,
      ordre: typeof cellule("Ordre", i) === "number" ? cellule("Ordre", i) : null,
      archivee: !!cellule("Archivee", i),
    }));
  }

  Object.assign(window.Socle, {
    ACTIONS_DEFAUT,
    STATUTS_ACTION,
    PRIORITES_ACTION,
    reglagesActions,
    optionsStatuts,
    colonnesActions,
    lireActions,
  });
})();
