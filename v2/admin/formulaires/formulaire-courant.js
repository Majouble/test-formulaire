/* PRISME — administration, onglet « Formulaires » : formulaires/formulaire-courant.js
   Formulaire en cours d'édition : blocs et parties, enregistrement du brouillon, écarts avec la version publiée,
   repères écrits dans les descriptions et conditions.
   Chargé par admin/index.html dans l'ordre : fondations, donnees, formulaire-courant, colonnes-roles, apercu,
   mode-test, panneau-question, sites-esr, tableaux, gestion, description, saisie-etablissement, demarrage. Les
   fichiers partagent leurs noms (scripts classiques, sans import) : au chargement, un fichier ne fait que définir ;
   demarrage.js branche les événements et publie l'onglet. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : sansGuillemets, lireReperes, evaluerCondition, colonneDeRef, LIBELLES_OPERATEURS, texteCondition,
     blocs, blocDe, libelleQuestion, charger, sauver, parties, partieDe, communsActifs, differences, majEtat.
   Utilise :
     fondations : $, PARTIES_DEFAUT, TYPES_QUESTIONNAIRE, copie, esc, etatFormulaires, maintenant, message,
       normaliser.
     donnees : actions.
     colonnes-roles : lireRemplissage, metaCourante, rolesEffectifs.
   Modifie etatFormulaires : choisi, courant, enregistrementEnCours, etablissementTest, etablissementsTest, meta,
     minuterie, modeApercu, simulations, testLignes. */
/* ---------- reprise des repères écrits dans les descriptions (formulaires existants) ---------- */
// Lecture et évaluation des conditions : règles communes avec le widget de saisie (commun/metier/formulaire.js)
const { sansGuillemets } = Socle;
function lireReperes(texte) {
  texte = String(texte || "").trim();
  const reperes = {};
  if (texte.startsWith("*")) reperes.obligatoire = true;
  // condition « [si … ] » : forme enregistrée dans le brouillon { ref, op, valeurs }
  const condition = Socle.lireConditionRepere(texte);
  if (condition) reperes.condition = { ref: condition.ref, op: condition.op, valeurs: condition.valeurs || [] };
  let correspondance;
  if (/\[liste\]/i.test(texte)) reperes.affichage = "liste";
  if (/\[boutons\]/i.test(texte)) reperes.affichage = "boutons";
  if (/\[case\]/i.test(texte)) reperes.affichage = "case";
  if (/\[\s*(positif|positive)\s*\]/i.test(texte)) reperes.min = 0;
  if ((correspondance = texte.match(/\[\s*min(?:imum)?\s*(-?[\d.,]+)\s*\]/i)))
    reperes.min = parseFloat(correspondance[1].replace(",", "."));
  if ((correspondance = texte.match(/\[\s*max(?:imum)?\s*(-?[\d.,]+)\s*\]/i)))
    reperes.max = parseFloat(correspondance[1].replace(",", "."));
  if (/\[\s*confidentiel(le)?\s*\]/i.test(texte)) reperes.confidentiel = true;
  if ((correspondance = texte.match(/\[\s*tableau\s+([^\]\s]+)(?:\s+lignes?\s*[=:]\s*([^\]]+?))?\s*\]/i)))
    reperes.tableau = {
      table: correspondance[1],
      lignes: correspondance[2] ? sansGuillemets(correspondance[2]) : null,
    };
  if ((correspondance = texte.match(/\[\s*couleurs?\b([^\]]*)\]/i))) {
    const regles = correspondance[1]
      .split(/\s*;\s*|\s*,\s*(?!\d+\s*[=:])/)
      .map((morceau) => {
        const k = morceau.lastIndexOf("=");
        return k > 0 ? { cle: morceau.slice(0, k).trim(), couleur: morceau.slice(k + 1).trim() } : null;
      })
      .filter(Boolean);
    reperes.couleur = regles.length ? regles : "choix";
  }
  if ((correspondance = texte.match(/\[\s*ordre\s*(\d+)\s*\]/i))) reperes.ordre = +correspondance[1];
  if (/\[\s*(court|une\s+ligne)\s*\]/i.test(texte)) reperes.court = true;
  if (/\[\s*auto(matique)?\s*\]/i.test(texte)) reperes.auto = true;
  if (/\[\s*(masqu[ée]e?|cach[ée]e?|invisible)\s*\]/i.test(texte)) reperes.masque = true;
  reperes.aide = texte
    .replace(/^\*\s*/, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return reperes;
}

/* ---------- conditions ---------- */
const evaluerCondition = (valeur, condition) => Socle.evaluerCondition(valeur, condition);

function colonneDeRef(reference) {
  if (!reference) return null;
  if (etatFormulaires.meta[reference]) return etatFormulaires.meta[reference];
  const referenceNormalisee = normaliser(reference);
  return (
    Object.values(etatFormulaires.meta).find(
      (colonne) =>
        normaliser(colonne.colId) === referenceNormalisee || normaliser(colonne.libelle) === referenceNormalisee,
    ) || null
  );
}
const LIBELLES_OPERATEURS = {
  "=": "=",
  "!=": "≠",
  ">": ">",
  ">=": "≥",
  "<": "<",
  "<=": "≤",
  rempli: "est renseigné",
  vide: "est vide",
};
function texteCondition(condition) {
  const colonneCondition = colonneDeRef(condition.ref),
    nom = colonneCondition ? libelleQuestion(colonneCondition.colId) || colonneCondition.libelle : condition.ref;
  if (condition.op === "rempli" || condition.op === "vide") return `${nom} ${LIBELLES_OPERATEURS[condition.op]}`;
  return `${nom} ${LIBELLES_OPERATEURS[condition.op] || condition.op} ${(condition.valeurs || []).join(" ou ")}`;
}

/* ---------- formulaire courant ---------- */
const blocs = () => (etatFormulaires.courant ? etatFormulaires.courant.conf.blocs : []);
const blocDe = (id) => blocs().find((bloc) => bloc.id === id) || null;
function libelleQuestion(colId) {
  const bloc = blocs().find((candidat) => candidat.genre === "question" && candidat.colonne === colId);
  return (
    (bloc && bloc.reglages && bloc.reglages.libelle) ||
    (etatFormulaires.meta[colId] && etatFormulaires.meta[colId].libelle) ||
    colId
  );
}
function charger(formulaire) {
  let configuration = null;
  for (const texteJson of [formulaire.brouillon, formulaire.publie]) {
    if (!configuration && typeof texteJson === "string" && texteJson.trim()) {
      try {
        configuration = JSON.parse(texteJson);
      } catch (_) {}
    }
  }
  if (!configuration || !Array.isArray(configuration.blocs)) configuration = { blocs: [] };
  etatFormulaires.courant = {
    id: formulaire.id,
    nom: formulaire.nom,
    table: formulaire.table,
    type: formulaire.type || "etablissement",
    conf: configuration,
    publie: formulaire.publie || "",
    publieLe: formulaire.publieLe,
    widget: formulaire.widget || "",
  };
  etatFormulaires.meta = metaCourante();
  lireRemplissage(formulaire.table);
  etatFormulaires.choisi = null;
  etatFormulaires.simulations = {};
  etatFormulaires.testLignes = {};
  etatFormulaires.modeApercu = "nouveau";
  etatFormulaires.etablissementsTest = null;
  etatFormulaires.etablissementTest = null;
  const ids = new Set(parties().map((partie) => partie.id)),
    premiere = parties().find((partie) => partie.role === "q").id;
  configuration.blocs.forEach((bloc) => {
    if (!ids.has(bloc.section || "q")) bloc.section = premiere;
  });
}
function sauver() {
  // brouillon enregistré automatiquement, 400 ms après la dernière modification
  majEtat();
  clearTimeout(etatFormulaires.minuterie);
  etatFormulaires.minuterie = setTimeout(() => {
    const json = JSON.stringify(etatFormulaires.courant.conf),
      id = etatFormulaires.courant.id;
    etatFormulaires.enregistrementEnCours = etatFormulaires.enregistrementEnCours
      .then(() =>
        actions([
          ["UpdateRecord", etatFormulaires.tableFormulaires, id, { Brouillon: json, Modifie_le: maintenant() }],
        ]),
      )
      .then(() => {
        const formulaire = etatFormulaires.formulaires.find((candidat) => candidat.id === id);
        if (formulaire) formulaire.brouillon = json;
      })
      .catch((erreur) => message(`Brouillon non enregistré : ${erreur.message || erreur}`, "err"));
  }, 400);
}
function parties() {
  if (!etatFormulaires.courant) return [];
  if (!Array.isArray(etatFormulaires.courant.conf.parties) || !etatFormulaires.courant.conf.parties.length)
    etatFormulaires.courant.conf.parties = copie(PARTIES_DEFAUT);
  const listeParties = etatFormulaires.courant.conf.parties;
  return [
    ...listeParties.filter((partie) => partie.role === "q"),
    ...listeParties.filter((partie) => partie.role === "vd"),
    ...listeParties.filter((partie) => partie.role === "va"),
  ];
}
const partieDe = (id) => parties().find((partie) => partie.id === id) || parties()[0];
const communsActifs = () =>
  etatFormulaires.courant && etatFormulaires.courant.type === "etablissement" && !!etatFormulaires.meta.Etablissement;
function differences() {
  if (!etatFormulaires.courant) return 0;
  let blocsPublies = [],
    pubParties = PARTIES_DEFAUT,
    pubDesc = null,
    pubSaisie = null,
    pubRoles = null;
  try {
    if (etatFormulaires.courant.publie) {
      const confPubliee = JSON.parse(etatFormulaires.courant.publie);
      blocsPublies = confPubliee.blocs || [];
      pubDesc = confPubliee.description || null;
      pubSaisie = confPubliee.saisie || null;
      pubRoles = confPubliee.roles || null;
      if (Array.isArray(confPubliee.parties) && confPubliee.parties.length) pubParties = confPubliee.parties;
    }
  } catch (_) {}
  const ecartParties =
    (JSON.stringify(pubParties) !== JSON.stringify(etatFormulaires.courant.conf.parties || PARTIES_DEFAUT) ? 1 : 0) +
    (JSON.stringify(pubDesc) !== JSON.stringify(etatFormulaires.courant.conf.description || null) ? 1 : 0) +
    (JSON.stringify(pubSaisie) !== JSON.stringify(etatFormulaires.courant.conf.saisie || null) ? 1 : 0) +
    (etatFormulaires.courant.type === "etablissement" && JSON.stringify(pubRoles) !== JSON.stringify(rolesEffectifs())
      ? 1
      : 0);
  const publiesParId = new Map(blocsPublies.map((bloc) => [bloc.id, JSON.stringify(bloc)])),
    blocsCourants = blocs();
  let ecartsBlocs = Math.abs(blocsPublies.length - blocsCourants.length);
  blocsCourants.forEach((bloc, i) => {
    if (publiesParId.get(bloc.id) !== JSON.stringify(bloc) || (blocsPublies[i] && blocsPublies[i].id !== bloc.id))
      ecartsBlocs++;
  });
  return ecartsBlocs + ecartParties;
}
function majEtat() {
  const indicateurEtat = $("etat-publi");
  if (!etatFormulaires.courant) {
    indicateurEtat.textContent = "";
    indicateurEtat.className = "etat-publi";
    return;
  }
  const nombreEcarts = differences();
  if (!etatFormulaires.courant.publie) {
    indicateurEtat.textContent = "Jamais publié";
    indicateurEtat.className = "etat-publi brouillon";
  } else if (nombreEcarts) {
    indicateurEtat.textContent = `Brouillon · ${nombreEcarts} modification${nombreEcarts > 1 ? "s" : ""} non publiée${nombreEcarts > 1 ? "s" : ""}`;
    indicateurEtat.className = "etat-publi brouillon";
  } else {
    indicateurEtat.textContent = "Publié, à jour";
    indicateurEtat.className = "etat-publi a-jour";
  }
  $("btn-publier").disabled = !!etatFormulaires.courant.publie && !nombreEcarts;
  const nombreQuestions = blocs().filter((bloc) => bloc.genre === "question").length;
  $("infos").innerHTML =
    `${esc(TYPES_QUESTIONNAIRE[etatFormulaires.courant.type] || "Questionnaire")} · table <b>${esc(etatFormulaires.courant.table)}</b> · ${nombreQuestions} question${nombreQuestions > 1 ? "s" : ""}`;
}
