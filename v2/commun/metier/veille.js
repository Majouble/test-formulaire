/* =====================================================================
   PRISME — règles métier : veille des vigilances météorologiques (onglet Veille)
   ---------------------------------------------------------------------
   Le relais n8n (veille/relais-vigilance-n8n.json, téléchargé préréglé depuis l'onglet Veille) lit la carte de vigilance
   de Météo-France (API DonneesPubliquesVigilance, clé gardée dans n8n) et réécrit la table Vigilances : une ligne par
   département, phénomène et échéance (aujourd'hui, demain) en jaune, orange ou rouge. Chaque changement est ajouté au
   journal. Réglages (seuil, phénomènes suivis) : clé « veille » de Config.
   Chargé par chaque page, après commun/socle.js.

   Définit (sur window.Socle) : PHENOMENES_VIGILANCE, COULEURS_VIGILANCE, ECHEANCES_VIGILANCE, COLONNES_VIGILANCES,
     COLONNES_VIGILANCES_JOURNAL, reglagesVeille, lireVigilances.
   Utilise (window.Socle) : DEFAUTS_GENERAL, json.
   Utilise aussi : Donnees (lecture et écriture du document).
   ===================================================================== */
(function () {
  "use strict";

  const { DEFAUTS_GENERAL, json } = window.Socle;

  const PHENOMENES_VIGILANCE = {
    1: "Vent violent",
    2: "Pluie-inondation",
    3: "Orages",
    4: "Crues",
    5: "Neige-verglas",
    6: "Canicule",
    7: "Grand froid",
    8: "Avalanches",
    9: "Vagues-submersion",
  };
  const COULEURS_VIGILANCE = [
    { niveau: 1, nom: "Vert", fond: "#31AA35", texte: "#FFFFFF" },
    { niveau: 2, nom: "Jaune", fond: "#FFF600", texte: "#3A3A00" },
    { niveau: 3, nom: "Orange", fond: "#FFB82B", texte: "#3A2400" },
    { niveau: 4, nom: "Rouge", fond: "#CC0000", texte: "#FFFFFF" },
  ];
  const ECHEANCES_VIGILANCE = ["Aujourd'hui", "Demain"];
  const optionsCouleurs = () =>
    json({
      choices: COULEURS_VIGILANCE.map((couleur) => couleur.nom),
      choiceOptions: Object.fromEntries(
        COULEURS_VIGILANCE.map((couleur) => [couleur.nom, { fillColor: couleur.fond, textColor: couleur.texte }]),
      ),
    });
  const COLONNES_VIGILANCES = [
    { id: "Departement_code", type: "Text" },
    { id: "Departement", type: "Text" },
    { id: "Phenomene", type: "Text" },
    { id: "Couleur", type: "Choice", widgetOptions: optionsCouleurs() },
    { id: "Niveau", type: "Int" },
    { id: "Echeance", type: "Choice", widgetOptions: json({ choices: ECHEANCES_VIGILANCE }) },
    { id: "Debut", type: "DateTime:Europe/Paris" },
    { id: "Fin", type: "DateTime:Europe/Paris" },
    { id: "Mise_a_jour", type: "DateTime:Europe/Paris" },
    { id: "Littoral", type: "Bool" },
  ];
  const COLONNES_VIGILANCES_JOURNAL = [
    { id: "Le", type: "DateTime:Europe/Paris" },
    { id: "Departement_code", type: "Text" },
    { id: "Departement", type: "Text" },
    { id: "Phenomene", type: "Text" },
    { id: "Echeance", type: "Choice", widgetOptions: json({ choices: ECHEANCES_VIGILANCE }) },
    { id: "Avant", type: "Choice", widgetOptions: optionsCouleurs() },
    { id: "Apres", type: "Choice", widgetOptions: optionsCouleurs() },
    { id: "Niveau", type: "Int" },
  ];
  function reglagesVeille(config) {
    const reglages = (config && config.valeurs && config.valeurs.veille) || {};
    return {
      seuil: [2, 3, 4].includes(reglages.seuil) ? reglages.seuil : 3,
      phenomenes: Array.isArray(reglages.phenomenes) ? reglages.phenomenes : [],
    };
  }
  async function lireVigilances(reglagesGeneraux) {
    const table = await Donnees.lireSiPresente(
      (reglagesGeneraux && reglagesGeneraux.vigilances) || DEFAUTS_GENERAL.vigilances,
    );
    if (!table) return null;
    const cellule = (colonne, ligne) => (table[colonne] || [])[ligne];
    return (table.id || []).map((id, i) => ({
      id,
      code: String(cellule("Departement_code", i) || ""),
      departement: String(cellule("Departement", i) || ""),
      phenomene: String(cellule("Phenomene", i) || ""),
      niveau: Number(cellule("Niveau", i)) || 0,
      couleur: String(cellule("Couleur", i) || ""),
      echeance: String(cellule("Echeance", i) || ""),
      debut: cellule("Debut", i) || null,
      fin: cellule("Fin", i) || null,
      maj: cellule("Mise_a_jour", i) || null,
      littoral: !!cellule("Littoral", i),
    }));
  }

  Object.assign(window.Socle, {
    PHENOMENES_VIGILANCE,
    COULEURS_VIGILANCE,
    ECHEANCES_VIGILANCE,
    COLONNES_VIGILANCES,
    COLONNES_VIGILANCES_JOURNAL,
    reglagesVeille,
    lireVigilances,
  });
})();
