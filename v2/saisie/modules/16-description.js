/* PRISME — widget de saisie, module 16/34 : Description automatique, résumé des modifications, jour de mobilisation, doublons.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : PARAMETRES, OPTIONS_DEFAUT, SEPARATEURS, joindre, memeReponse, mettreEnForme, element,
     modificationsSaisies, texteAutomatique, commentaireComplet, FAMILLES, famille, formatPour,
     questionsDescription, elementsDescription, MOTIF_MOBILISATION, ordinal, jourCalendaire, preparerRefSite,
     sitesDeLEtablissement, etablissementDuFormulaire, dateParGrist, jourFaits, jourDuFormulaire, jourDeLaVersion,
     cleSite, memeSite, doublonsDuJour, cleDoublon, extraitDescription, lieuDoublon, verifierDoublons,
     jourDeMobilisation, mentionMobilisation, qualificationRas, signalementEnCoursRas, ajouterMobilisation,
     identiteDuFormulaire, enTeteDescription, elementsTableau, descriptionGeneree, majEtatDescription,
     majDescriptionAuto, evaluerDescriptionManuelle, majApercuAuto.
   Utilise :
     01 configuration : ETAB.
     03 variantes : appliquerModele, refId, reglagesSaisie, statut, valeursEtab.
     04 date-faits : formateur, lireDateFaits, secondes.
     05 etat : colonneDe, etatSaisie, valeurLigne.
     06 grist : enFile, metaColonnes.
     07 formulaires : lireTableReference.
     09 dossier : comparerVersions, lireQualificationInitiale, listeQualif, ouvrirDossier.
     10 champs : egal, estVide, lireChamps, norm, typeBase.
     12 conditions-formules : formuleConnue, majFormulesEnDirect, normaliser, questionVisible,
       valeurFormuleEnDirect.
     13 coherence : appliquerConditions, formatValeur.
     19 tableaux : estQualifSous, lignesPrecedentes, lireTableauJson, texteTableauDescription, versionDuJour.
     23 couleurs : majCouleur.
   Modifie etatSaisie : descriptionManuelle, doublonConfirme, optionsAuto. */
// Mise à jour : résumé automatique des réponses modifiées, ajouté au commentaire à l'enregistrement.
// Il est affiché en aperçu au-dessus du commentaire, sans être mélangé au texte saisi : on peut ainsi
// choisir n'importe quel format (valeur seule, sur une seule ligne…) sans risque de confusion.
// Les réglages sont ceux du widget (panneau de configuration de Grist), communs à tous les utilisateurs.
// Réglages du résumé : une colonne texte de la table Parametres (première ligne), au format JSON.
const PARAMETRES = { table: "Parametres", colonne: "Resume_auto" };
const OPTIONS_DEFAUT = {
  actif: true,
  format: "libelle",
  separateur: "ligne",
  puce: "",
  longueur: 200,
  position: "avant",
  qualification: true,
  description: false,
  questions: true,
  mobilisation: true,
  entete: true,
  nombresPositifs: false,
  bornes: {},
};
const SEPARATEURS = { ligne: "\n", pv: " ; ", virgule: ", ", barre: " / ", espace: " ", point: ". " };

// Assemble les éléments avec le séparateur choisi. Avec le point, chaque élément devient une phrase :
// son éventuel point final est retiré avant l'assemblage (pas de « .. »), et le texte se termine par un point.
function joindre(elements, options = etatSaisie.optionsAuto) {
  const liste = elements.filter((fragment) => String(fragment).trim());
  if (options.separateur !== "point") return liste.join(SEPARATEURS[options.separateur] ?? "\n");
  if (!liste.length) return "";
  const texte = liste.map((fragment) => String(fragment).trim().replace(/\.+$/, "")).join(". ");
  return /[.!?…]$/.test(texte) ? texte : texte + ".";
}
etatSaisie.optionsAuto = { ...OPTIONS_DEFAUT };

// Comparaison tolérante aux écarts de forme sans changement réel de valeur
function memeReponse(question, reponseA, reponseB) {
  const typeColonne = typeBase(question.type);
  const normaliserReponse = (valeur) => {
    valeur = norm(question, valeur);
    if (valeur == null) return typeColonne === "Bool" ? false : null;
    if (Array.isArray(valeur) && valeur[0] === "L") return ["L", ...valeur.slice(1).map(String).sort()];
    if (typeColonne === "DateTime") {
      const nombreSecondes = secondes(valeur);
      return nombreSecondes == null ? null : Math.floor(nombreSecondes / 60);
    }
    if (typeColonne === "Date") {
      const nombreSecondes = secondes(valeur);
      return nombreSecondes == null ? null : Math.floor(nombreSecondes / 86400);
    }
    if (typeof valeur === "string") return valeur.trim();
    return valeur;
  };
  return egal(normaliserReponse(reponseA), normaliserReponse(reponseB));
}

// Met une valeur au format choisi : sur une seule ligne, abrégée si une longueur maximale est fixée
function mettreEnForme(texte, options = etatSaisie.optionsAuto) {
  let texteFormate = String(texte ?? "")
    .replace(/\s+/g, " ")
    .trim();
  const max = +options.longueur || 0;
  if (max > 0 && texteFormate.length > max) texteFormate = texteFormate.slice(0, max - 1) + "…";
  return texteFormate;
}
function element(libelle, valeur, options = etatSaisie.optionsAuto) {
  const valeurFormatee = mettreEnForme(valeur, options);
  return `${options.puce || ""}${options.format === "valeur" ? valeurFormatee : `${libelle} : ${valeurFormatee}`}`;
}

// Réponses modifiées par rapport à la version précédente : [{ libelle, valeur }]
function modificationsSaisies() {
  const ligneReference = etatSaisie.derniere || etatSaisie.initiale;
  const modifications = [];
  const defQ = etatSaisie.metaSig[colonneDe("Qualification")];
  if (defQ && etatSaisie.optionsAuto.qualification) {
    const saisie = lireQualificationInitiale();
    const apres = Array.isArray(saisie) ? saisie : saisie ? [saisie] : [];
    const avant = listeQualif(ligneReference ? valeurLigne(ligneReference, "Qualification") : "");
    if (apres.length && JSON.stringify([...apres].map(String).sort()) !== JSON.stringify([...avant].map(String).sort()))
      modifications.push({ libelle: defQ.libelle || "Qualification", valeur: apres.join(", ") });
  }
  const defD = etatSaisie.metaSig[colonneDe("Description")];
  if (defD && etatSaisie.optionsAuto.description) {
    const nouvelle = $("description").value.trim();
    const avant = String((ligneReference ? valeurLigne(ligneReference, "Description") : "") ?? "").trim();
    if (nouvelle.replace(/\s+/g, " ") !== avant.replace(/\s+/g, " "))
      modifications.push({ libelle: defD.libelle || "Description", valeur: nouvelle || "(vide)" });
  }
  if (etatSaisie.optionsAuto.questions) {
    const valeurs = lireChamps("q", etatSaisie.defsQuestions, []); // questions visibles uniquement
    for (const question of etatSaisie.defsQuestions) {
      if (question.formule && formuleConnue(question) && !question.confidentiel && questionVisible("q", question)) {
        const valeurDirecte = valeurFormuleEnDirect(question),
          avant = ligneReference ? ligneReference[question.colId] : null;
        if (valeurDirecte != null && valeurDirecte !== "" && String(valeurDirecte) !== String(avant ?? ""))
          modifications.push({ libelle: question.libelle, valeur: formatValeur(question, valeurDirecte) });
        continue;
      }
      if (question.formule || question.confidentiel || !(question.colId in valeurs)) continue;
      const nouvelle = valeurs[question.colId];
      if (memeReponse(question, nouvelle, ligneReference ? ligneReference[question.colId] : null)) continue;
      modifications.push({
        libelle: question.libelle,
        valeur:
          estVide(question, nouvelle) && typeBase(question.type) !== "Bool"
            ? "(vide)"
            : question.tableau
              ? texteTableauDescription(question, lireTableauJson(nouvelle))
              : formatValeur(question, nouvelle),
      });
    }
  }
  return modifications;
}

function texteAutomatique(options = etatSaisie.optionsAuto, modifs = modificationsSaisies()) {
  if (!options.actif) return "";
  return joindre(
    modifs.map((modification) => element(modification.libelle, modification.valeur, options)),
    options,
  );
}

// Commentaire final : résumé automatique et texte saisi, dans l'ordre choisi
function commentaireComplet() {
  const auto = texteAutomatique();
  const libre = $("commentaire").value.trim();
  const sep = SEPARATEURS[etatSaisie.optionsAuto.separateur] ?? "\n";
  const parties = etatSaisie.optionsAuto.position === "apres" ? [libre, auto] : [auto, libre];
  return parties.filter(Boolean).join(sep);
}

/* ---------- Format de chaque élément : par question, sinon par type de colonne, sinon général ---------- */
const FAMILLES = {
  nombre: "Nombres",
  date: "Dates",
  choix: "Choix",
  case: "Cases à cocher",
  reference: "Références",
  texte: "Textes",
};
function famille(definition) {
  const typeColonne = typeBase(definition && definition.type);
  if (typeColonne === "Numeric" || typeColonne === "Int") return "nombre";
  if (typeColonne === "Date" || typeColonne === "DateTime") return "date";
  if (typeColonne === "Choice" || typeColonne === "ChoiceList") return "choix";
  if (typeColonne === "Bool") return "case";
  if (typeColonne === "Ref" || typeColonne === "RefList") return "reference";
  return "texte";
}
function formatPour(definition, options = etatSaisie.optionsAuto) {
  if (definition && definition.formatDescription) return definition.formatDescription;
  const parQuestion = definition && (options.formatsQuestion || {})[definition.colId];
  if (parQuestion && parQuestion !== "defaut") return parQuestion;
  const parType = definition && !definition.tableau && (options.formatsType || {})[famille(definition)];
  if (parType && parType !== "defaut") return parType;
  return options.format;
}
// Questions concernées par la description : qualification puis questions supplémentaires
function questionsDescription() {
  const definitionQualification = etatSaisie.metaSig[colonneDe("Qualification")];
  return [
    ...(definitionQualification
      ? [{ ...definitionQualification, libelle: definitionQualification.libelle || "Qualification" }]
      : []),
    ...etatSaisie.defsQuestions.filter((question) => !question.formule || formuleConnue(question)),
  ];
}

function elementsDescription(options = etatSaisie.optionsAuto) {
  const items = [];
  const defQ = etatSaisie.metaSig[colonneDe("Qualification")];
  if (options.qualification && defQ) {
    const qualification = lireQualificationInitiale();
    const qualifications = Array.isArray(qualification) ? qualification : qualification ? [qualification] : [];
    const avecFleche = etatSaisie.defsQuestions.some(
      (question) => question.tableau && (question._sousDefs || []).some(estQualifSous),
    );
    const avant = avecFleche && versionDuJour() ? listeQualif(valeurLigne(etatSaisie.derniere, "Qualification")) : [];
    const change =
      avant.length &&
      qualifications.length &&
      JSON.stringify([...avant].map(String).sort()) !== JSON.stringify([...qualifications].map(String).sort());
    if (qualifications.length)
      items.push({
        libelle: defQ.libelle || "Qualification",
        valeur: change ? `${avant.join(", ")} → ==${qualifications.join(", ")}==` : qualifications.join(", "),
        def: defQ,
      });
  }
  if (options.questions) {
    const valeurs = lireChamps("q", etatSaisie.defsQuestions, []); // questions visibles uniquement
    for (const question of etatSaisie.defsQuestions) {
      if (question.formule && formuleConnue(question) && !question.confidentiel && questionVisible("q", question)) {
        const valeurDirecte = valeurFormuleEnDirect(question);
        if (valeurDirecte != null && valeurDirecte !== "")
          items.push({ libelle: question.libelle, valeur: formatValeur(question, valeurDirecte), def: question });
        continue;
      }
      if (question.formule || question.confidentiel || !(question.colId in valeurs)) continue;
      const valeurSaisie = valeurs[question.colId];
      if (estVide(question, valeurSaisie)) continue; // question sans réponse : ignorée
      if (typeBase(question.type) === "Bool" && !valeurSaisie) continue; // case non cochée : ignorée
      items.push({
        libelle: question.libelle,
        valeur: question.tableau
          ? texteTableauDescription(question, lireTableauJson(valeurSaisie), options, lignesPrecedentes(question))
          : formatValeur(question, valeurSaisie),
        def: question,
      });
    }
  }
  return items;
}

/* ---------- Jour de mobilisation ----------
   Nombre de jours calendaires distincts où l'établissement a fait l'objet d'une saisie (signalement
   initial ou mise à jour, tous dossiers confondus), en comptant aujourd'hui, jour de l'enregistrement.
   Le jour est déterminé dans le fuseau horaire de la colonne Date. Seules les lignes visibles par
   l'utilisateur sont prises en compte (règles d'accès). */
const MOTIF_MOBILISATION = /\s*\(\d+(?:er|e) jour de mobilisation\)\s*$/;
const ordinal = (rang) => (rang === 1 ? "1er" : `${rang}e`);
function jourCalendaire(sec) {
  const fuseauHoraire = /^Date$/.test((etatSaisie.metaDate && etatSaisie.metaDate.type) || "")
    ? "UTC"
    : Outils.dates.FUSEAU;
  return formateur(`jour|${fuseauHoraire || ""}`, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: fuseauHoraire,
  }).format(new Date(sec * 1000));
}
/* Colonne Référence vers un référentiel des sites (table qui renvoie elle-même vers le référentiel des établissements) :
   rattachement de chaque site à son établissement et à sa composante, commune, mots-clés, sites désactivés, et
   établissement de rattachement des composantes. Renvoie true si la colonne désigne bien un site. */
async function preparerRefSite(definitionSite) {
  try {
    const cible = definitionSite.type.split(":")[1];
    if (!cible || cible === ETAB.table || cible === etatSaisie.tableId) return false;
    // référentiel des établissements : celui de la recherche, ou celui que vise la colonne Établissement du formulaire
    const metaEtablissement = colonneDe("Etablissement") && etatSaisie.metaSig[colonneDe("Etablissement")],
      visee = metaEtablissement && ((metaEtablissement.type || "").match(/^Ref:(.+)$/) || [])[1];
    const colonnesCible = Object.values((await metaColonnes(cible)) || {}),
      versEtab = colonnesCible.filter(
        (colonne) => colonne.type === `Ref:${ETAB.table}` || (visee && colonne.type === `Ref:${visee}`),
      );
    const colonneEtablissement =
        versEtab.find((colonne) => colonne.colId === "Etablissement") ||
        versEtab.find((colonne) => !/compos/i.test(colonne.colId)),
      colonneComposante = versEtab.find((colonne) => colonne !== colonneEtablissement && /compos/i.test(colonne.colId));
    if (!colonneEtablissement) return false;
    const tableReference = await lireTableReference(cible);
    definitionSite._siteEtab = new Map(
      tableReference.id.map((id, i) => [id, refId(tableReference[colonneEtablissement.colId][i])]),
    );
    if (colonneComposante)
      definitionSite._siteComp = new Map(
        tableReference.id.map((id, i) => [id, refId(tableReference[colonneComposante.colId][i])]),
      );
    // mots-clés des sites (Mots_cles, Autres_noms…) : retrouvent le site quand l'agent tape un autre nom
    const colonnesMotsCles = colonnesCible
      .filter(
        (colonne) => /^Text/.test(colonne.type || "") && /^(mots?_?cles?|autres?_noms?|alias)/i.test(colonne.colId),
      )
      .map((colonne) => colonne.colId);
    definitionSite._motsSite = new Map(
      tableReference.id.map((id, i) => [
        id,
        colonnesMotsCles
          .map((identifiantColonne) => tableReference[identifiantColonne] && tableReference[identifiantColonne][i])
          .filter((motCle) => typeof motCle === "string" && motCle.trim())
          .join(" | "),
      ]),
    );
    const colonneCommune = colonnesCible.find((colonne) => /^commune$/i.test(colonne.colId));
    if (colonneCommune)
      definitionSite._communeSite = new Map(
        tableReference.id.map((id, i) => [id, String(tableReference[colonneCommune.colId][i] ?? "")]),
      );
    // sites désactivés (colonne Actif décochée) : plus proposés, sauf sur une ligne qui y renvoie déjà
    const colonneActif = colonnesCible.find((colonne) => /^actif$/i.test(colonne.colId) && colonne.type === "Bool");
    if (colonneActif)
      definitionSite._inactifs = new Set(
        tableReference.id.filter((id, i) => tableReference[colonneActif.colId][i] === false),
      );
    // composante (IUT, école interne…) : ses propres sites, sinon ceux de son établissement de rattachement
    const colonneParent = Object.values((await metaColonnes(ETAB.table)) || {}).find(
      (colonne) => colonne.type === `Ref:${ETAB.table}` && /rattach|parent/i.test(colonne.colId),
    );
    if (colonneParent) {
      const tableEtablissements = await lireTableReference(ETAB.table);
      definitionSite._parent = new Map(
        tableEtablissements.id.map((id, i) => [id, refId(tableEtablissements[colonneParent.colId][i])]),
      );
    }
    return true;
  } catch (_) {
    return false;
  } // illisible : menu de tous les sites
}
/* Sites proposés pour un établissement : les siens (ou, pour une composante, ceux qui la concernent) ; une composante ou un
   site sans site propre au référentiel reprend ceux de son établissement de rattachement. Le site déjà choisi reste. */
function sitesDeLEtablissement(definitionSite, idEtablissement, optionsSites, choisi) {
  if (definitionSite._inactifs && definitionSite._inactifs.size)
    optionsSites = optionsSites.filter((option) => !definitionSite._inactifs.has(option.id) || option.id === choisi);
  const sitesEtablissement = optionsSites.filter(
    (option) =>
      definitionSite._siteEtab.get(option.id) === idEtablissement ||
      (definitionSite._siteComp && definitionSite._siteComp.get(option.id) === idEtablissement) ||
      option.id === choisi,
  );
  const idParent = definitionSite._parent && definitionSite._parent.get(idEtablissement);
  const sitesRetenus =
    !idParent || sitesEtablissement.some((option) => option.id !== choisi)
      ? sitesEtablissement
      : optionsSites.filter((option) => definitionSite._siteEtab.get(option.id) === idParent || option.id === choisi);
  // dossier ouvert depuis une composante : ses sites d'abord
  const idComposante =
    etatSaisie.composanteChoisie && definitionSite._siteComp ? etatSaisie.composanteChoisie.id : null;
  return idComposante
    ? [
        ...sitesRetenus.filter((option) => definitionSite._siteComp.get(option.id) === idComposante),
        ...sitesRetenus.filter((option) => definitionSite._siteComp.get(option.id) !== idComposante),
      ]
    : sitesRetenus;
}
function etablissementDuFormulaire() {
  if (etatSaisie.initiale) return refId(valeurLigne(etatSaisie.initiale, "Etablissement"));
  if (etatSaisie.modeEtab) return etatSaisie.etabs[0] ? etatSaisie.etabs[0].id : null;
  return etatSaisie.etabCourant ? etatSaisie.etabCourant.id : null; // établissement pas encore dans le référentiel : aucune ligne
}
// Jour calendaire d'une date des faits : une colonne Date est à minuit UTC, on la lit donc en UTC
/* Date de saisie : si la colonne a une formule (formule d'initialisation NOW() « à la création »,
   ou colonne formule), c'est Grist qui la remplit avec l'heure de son serveur, et le widget n'envoie rien.
   Sinon, le widget écrit l'heure de l'ordinateur, qui peut être fausse si son horloge est déréglée. */
const dateParGrist = () => !!(etatSaisie.metaDate && String(etatSaisie.metaDate.texteFormule || "").trim());

function jourFaits(sec) {
  const fuseauHoraire =
    etatSaisie.metaFaits && (etatSaisie.metaFaits.type || "").startsWith("DateTime") ? Outils.dates.FUSEAU : "UTC";
  return formateur(`jour|${fuseauHoraire || ""}`, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: fuseauHoraire,
  }).format(new Date(sec * 1000));
}
function jourDuFormulaire() {
  return colonneDe("Date_faits") && lireDateFaits() != null
    ? jourFaits(lireDateFaits())
    : jourCalendaire(Date.now() / 1000);
}
function jourDeLaVersion(ligne) {
  const secondesFaits = colonneDe("Date_faits") ? secondes(valeurLigne(ligne, "Date_faits")) : null;
  if (secondesFaits != null) return jourFaits(secondesFaits);
  const secondesSaisie = secondes(valeurLigne(ligne, "Date"));
  return secondesSaisie != null ? jourCalendaire(secondesSaisie) : null;
}
// Site comparé sans accents, majuscules, ponctuation ni mots « bâtiment / bât. / site / campus »
const cleSite = (texteSite) =>
  normaliser(texteSite)
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(batiment|bat|site|campus|le|la|les|de|du|des)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
function memeSite(siteA, siteB) {
  const cleA = cleSite(siteA),
    cleB = cleSite(siteB);
  if (!cleA || !cleB) return true; // site non renseigné d'un côté : l'établissement suffit pour alerter
  // mêmes mots significatifs, dans n'importe quel ordre (« bât. 12, campus de Beaulieu » = « Campus de Beaulieu, bâtiment 12 »)
  const motsA = cleA.split(" "),
    motsB = cleB.split(" "),
    [court, long] = motsA.length <= motsB.length ? [motsA, motsB] : [motsB, motsA];
  return cleA === cleB || court.every((mot) => long.includes(mot));
}
function doublonsDuJour() {
  if (etatSaisie.dossierId) return [];
  const etabId = etablissementDuFormulaire();
  if (!etabId) return [];
  const jour = jourDuFormulaire(),
    colonneDossier = colonneDe("Dossier"),
    parDossier = new Map();
  for (const ligne of etatSaisie.enregistrements) {
    if (refId(valeurLigne(ligne, "Etablissement")) !== etabId) continue;
    const idDossierLigne = refId(colonneDossier && ligne[colonneDossier]) || ligne.id;
    if (!parDossier.has(idDossierLigne)) parDossier.set(idDossierLigne, []);
    parDossier.get(idDossierLigne).push(ligne);
  }
  const doublons = [];
  for (const [idDossier, lignes] of parDossier) {
    if (!lignes.some((ligne) => jourDeLaVersion(ligne) === jour)) continue;
    const derniere = [...lignes].sort(comparerVersions).pop();
    if (colonneDe("Site") && !memeSite($("site").value, valeurLigne(derniere, "Site"))) continue; // autre site du même établissement
    doublons.push({ dossier: idDossier, derniere, nb: lignes.length });
  }
  return doublons;
}
const cleDoublon = () =>
  `${etablissementDuFormulaire()}|${jourDuFormulaire()}|${colonneDe("Site") ? cleSite($("site").value) : ""}`;
function extraitDescription(ligne) {
  const texte = String(valeurLigne(ligne, "Description") || "")
    .replace(/\*\*|==/g, "")
    .replace(/^[^:]{0,120}:\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  return texte.length > 140 ? texte.slice(0, 140) + "…" : texte;
}
const lieuDoublon = () => {
  const site = colonneDe("Site") ? $("site").value.trim() : "";
  return site ? ` (site « ${esc(site)} »)` : "";
};
function verifierDoublons() {
  const bloc = $("alerte-doublon");
  const liste = doublonsDuJour();
  if (!liste.length) {
    bloc.hidden = true;
    bloc.innerHTML = "";
    return;
  }
  const jour = jourDuFormulaire(),
    confirme = etatSaisie.doublonConfirme === cleDoublon();
  bloc.hidden = false;
  bloc.classList.toggle("confirme", confirme);
  const items = liste
    .map((doublon) => {
      const qualifications = listeQualif(valeurLigne(doublon.derniere, "Qualification")).join(", ");
      const suivis = doublon.nb > 1 ? ` — ${doublon.nb - 1} mise${doublon.nb > 2 ? "s" : ""} à jour` : "";
      const site = colonneDe("Site") ? String(valeurLigne(doublon.derniere, "Site") || "").trim() : "";
      return `<li><strong>Dossier n° ${doublon.dossier}</strong>${site ? ` — site « ${esc(site)} »` : ""}${qualifications ? ` (${esc(qualifications)})` : ""}${suivis}<br>
      <span class="extrait">${esc(extraitDescription(doublon.derniere))}</span><br>
      <button type="button" class="secondaire petit" data-ouvrir-dossier="${doublon.dossier}">Ouvrir ce signalement pour le mettre à jour</button></li>`;
    })
    .join("");
  bloc.innerHTML = confirme
    ? `Un signalement existe déjà pour cet établissement${lieuDoublon()} le ${esc(jour)}. Vous avez confirmé qu'il s'agit d'un <strong>nouveau signalement distinct</strong>.
       <div class="actions-doublon"><button type="button" class="lien-texte" id="btn-annuler-doublon">Revenir sur ce choix</button></div>`
    : `<strong>⚠ ${liste.length > 1 ? `${liste.length} signalements existent` : "Un signalement existe"} déjà pour cet établissement${lieuDoublon()} le ${esc(jour)}.</strong>
       S'il s'agit des mêmes faits, mettez plutôt à jour le signalement existant (la saisie en cours sera abandonnée) :
       <ul>${items}</ul>
       <div class="actions-doublon"><button type="button" class="lien-texte" id="btn-confirmer-doublon">Non, il s'agit de faits distincts : créer un nouveau signalement</button></div>`;
}
$("alerte-doublon").addEventListener("click", (evenement) => {
  const bouton = evenement.target.closest("button");
  if (!bouton) return;
  if (bouton.dataset.ouvrirDossier) {
    const id = +bouton.dataset.ouvrirDossier;
    enFile(async () => {
      try {
        await grist.setCursorPos({ rowId: id });
      } catch (_) {
        // placer le curseur de Grist est un confort : sans effet si Grist le refuse
      }
      await ouvrirDossier(id, true);
      verifierDoublons();
    });
  } else if (bouton.id === "btn-confirmer-doublon") {
    etatSaisie.doublonConfirme = cleDoublon();
    verifierDoublons();
    statut("statut-signalement", "");
  } else if (bouton.id === "btn-annuler-doublon") {
    etatSaisie.doublonConfirme = null;
    verifierDoublons();
  }
});

function jourDeMobilisation(cible, serie) {
  // cible : jour (secondes) d'une étape reprise ; serie : jours repris en même temps
  const etabId = etablissementDuFormulaire();
  const avecFaits = !!colonneDe("Date_faits");
  // jour du signalement en cours : la date des faits saisie, sinon aujourd'hui
  const courant =
    cible != null
      ? jourFaits(cible)
      : avecFaits && lireDateFaits() != null
        ? jourFaits(lireDateFaits())
        : jourCalendaire(Date.now() / 1000);
  // Seuls comptent les jours antérieurs ou égaux à celui du signalement en cours : des faits saisis
  // après coup pour une date passée ne sont pas numérotés d'après les jours qui les ont suivis.
  const cle = (j) => String(j).split(/\D+/).filter(Boolean).reverse().join("-"); // « 25/09/2026 » -> « 2026-09-25 »
  const limite = cle(courant);
  const jours = new Set([courant]);
  const ajouter = (j) => {
    if (cle(j) <= limite) jours.add(j);
  };
  if (etabId)
    for (const ligne of etatSaisie.enregistrements) {
      if (refId(valeurLigne(ligne, "Etablissement")) !== etabId) continue;
      if (colonneDe("Qualification") && qualificationRas(valeurLigne(ligne, "Qualification"))) continue; // jour « RAS » : non compté
      const secondesFaits = avecFaits ? secondes(valeurLigne(ligne, "Date_faits")) : null;
      if (secondesFaits != null) {
        ajouter(jourFaits(secondesFaits));
        continue;
      }
      const sec = secondes(valeurLigne(ligne, "Date")); // versions antérieures sans date des faits
      if (sec != null) ajouter(jourCalendaire(sec));
    }
  if (serie && !signalementEnCoursRas())
    for (const secondesJour of [lireDateFaits(), ...serie]) if (secondesJour != null) ajouter(jourFaits(secondesJour));
  return jours.size;
}
const mentionMobilisation = (rang) => `(${ordinal(rang)} jour de mobilisation)`;
// Qualification « RAS » (rien à signaler) : la ligne ne compte pas comme jour de mobilisation.
// Choix multiples : écartée seulement si « RAS » est son seul choix.
function qualificationRas(qualification) {
  const choixSaisis = Array.isArray(qualification)
    ? qualification.filter((valeur) => valeur !== "L")
    : qualification == null || qualification === ""
      ? []
      : [qualification];
  const retour = new Set(
    (etatSaisie.socleGeneral.retour_normale && etatSaisie.socleGeneral.retour_normale.length
      ? etatSaisie.socleGeneral.retour_normale
      : ["RAS"]
    ).map((motRetour) => String(motRetour).trim().toUpperCase()),
  );
  return (
    choixSaisis.length > 0 && choixSaisis.every((choixSaisi) => retour.has(String(choixSaisi).trim().toUpperCase()))
  );
}
const signalementEnCoursRas = () => !!colonneDe("Qualification") && qualificationRas(lireQualificationInitiale());
function ajouterMobilisation(texte, options = etatSaisie.optionsAuto, rang = jourDeMobilisation()) {
  const base = String(texte || "").replace(MOTIF_MOBILISATION, "");
  if (!options.mobilisation || signalementEnCoursRas()) return base; // signalement « RAS » : pas de mention
  const sep = options.separateur === "ligne" && base ? "\n" : base ? " " : "";
  return `${base}${sep}${mentionMobilisation(rang)}`;
}

// Établissement et commune du formulaire : établissement connu, ou établissement choisi dans l'annuaire
// (ou saisi à la main) en cours de création
function identiteDuFormulaire() {
  const etablissement = etatSaisie.etabCourant || (etatSaisie.modeEtab ? etatSaisie.etabs[0] : null);
  const site = colonneDe("Site") ? $("site").value.trim() : "";
  if (etablissement) return { ...valeursEtab(etablissement), site };
  return {
    nom: $("nom").value.trim(),
    commune: (etatSaisie.ligneAnnuaire && etatSaisie.ligneAnnuaire.commune) || "",
    site,
    uai: $("uai").value.trim(),
    type: $("type").value.trim(),
    academie: $("academie").value.trim(),
    departement: $("departement").value.trim(),
  };
}
// En-tête : modèle du formulaire (« **{nom}**, **{commune}** », « **{nom}** ({site})»…), en gras au format Markdown
function enTeteDescription(ident) {
  return String(ident.nom || "").trim() ? appliquerModele(reglagesSaisie().entete, ident) : "";
}

function elementsTableau(entree, fmt, options) {
  // Question « tableau » : l'en-tête (nombre et décomptes), puis une ligne par élément saisi ; chacun est un
  // élément de la description, séparé comme les autres questions. « Ne pas inclure » ne retire que l'en-tête.
  const [tete = "", ...lignes] = String(entree.valeur ?? "")
    .split(/\s*\n\s*/)
    .filter(Boolean);
  let enTete = "";
  if (fmt === "exclure")
    enTete = tete.replace(/^\d+\s*(—\s*)?/, "").replace(/^\((.*)\)$/, "$1"); // décomptes seuls
  else if (tete) enTete = fmt === "valeur" ? tete : `${entree.libelle} : ${tete}`;
  return [enTete, ...lignes].filter(Boolean).map((ligneTexte) => `${options.puce || ""}${ligneTexte}`);
}
function descriptionGeneree(
  options = etatSaisie.optionsAuto,
  items = elementsDescription(options),
  rangMobilisation,
  ident,
) {
  const corps = joindre(
    items.flatMap((entree) => {
      const fmt = formatPour(entree.def, options);
      if (entree.def && entree.def.tableau) return elementsTableau(entree, fmt, options);
      if (fmt === "exclure") return [];
      const valeurUneLigne = String(entree.valeur ?? "")
        .replace(/\s*\n\s*/g, " ")
        .trim();
      return [`${options.puce || ""}${fmt === "valeur" ? valeurUneLigne : `${entree.libelle} : ${valeurUneLigne}`}`];
    }),
    options,
  );
  const tete = options.entete ? enTeteDescription(ident || identiteDuFormulaire()) : "";
  const texte = tete && corps ? `${tete} : ${corps}` : tete || corps;
  return ajouterMobilisation(texte, options, rangMobilisation);
}

function majEtatDescription() {
  const bloc = $("etat-description"),
    actif = !!etatSaisie.optionsAuto.actif;
  bloc.hidden = !actif;
  if (!actif) {
    $("apercu-generee").hidden = true;
    return;
  }
  bloc.classList.toggle("manuel", etatSaisie.descriptionManuelle);
  $("etat-description-texte").textContent = etatSaisie.descriptionManuelle
    ? "✎ Texte modifié à la main : il ne suit plus les réponses du formulaire."
    : "↻ Rédigé automatiquement : le texte suit les réponses du formulaire.";
  $("etat-description-actions").hidden = !etatSaisie.descriptionManuelle;
  if (!etatSaisie.descriptionManuelle) {
    $("apercu-generee").hidden = true;
    $("btn-voir-auto").setAttribute("aria-expanded", "false");
    $("btn-voir-auto").textContent = "Voir le texte automatique";
  } else if (!$("apercu-generee").hidden) $("apercu-generee").textContent = descriptionGeneree();
}
$("btn-voir-auto").addEventListener("click", () => {
  const ouvrir = $("apercu-generee").hidden;
  $("apercu-generee").hidden = !ouvrir;
  $("btn-voir-auto").setAttribute("aria-expanded", String(ouvrir));
  $("btn-voir-auto").textContent = ouvrir ? "Masquer le texte automatique" : "Voir le texte automatique";
  if (ouvrir) $("apercu-generee").textContent = descriptionGeneree();
});

function majDescriptionAuto() {
  majFormulesEnDirect();
  majEtatDescription();
  if (!etatSaisie.optionsAuto.actif) return;
  if (etatSaisie.descriptionManuelle) {
    // Texte modifié à la main : on ne touche qu'à la mention de mobilisation si elle y figure déjà
    const texteManuel = $("description").value;
    if (etatSaisie.optionsAuto.mobilisation && MOTIF_MOBILISATION.test(texteManuel)) {
      const maj = signalementEnCoursRas()
        ? texteManuel.replace(MOTIF_MOBILISATION, "")
        : texteManuel.replace(
            /\(\d+(?:er|e) jour de mobilisation\)(\s*)$/,
            `${mentionMobilisation(jourDeMobilisation())}$1`,
          );
      if (maj !== texteManuel) $("description").value = maj;
    }
    return;
  }
  $("description").value = descriptionGeneree();
}

// Au chargement d'une version : la description est considérée comme automatique si elle correspond
// exactement à ce que produiraient les réponses, et comme modifiée à la main sinon.
function evaluerDescriptionManuelle() {
  const actuelle = $("description").value.trim();
  const sansMention = (texte) => texte.replace(MOTIF_MOBILISATION, "").trim();
  etatSaisie.descriptionManuelle =
    !!actuelle && etatSaisie.optionsAuto.actif && sansMention(actuelle) !== sansMention(descriptionGeneree().trim());
  majDescriptionAuto();
}

$("description").addEventListener("input", () => {
  etatSaisie.descriptionManuelle = true;
  majEtatDescription();
});
$("btn-regenerer").addEventListener("click", () => {
  etatSaisie.descriptionManuelle = false;
  majDescriptionAuto();
  appliquerConditions("q", etatSaisie.defsQuestions);
  majApercuAuto();
});

function majApercuAuto() {
  if (!etatSaisie.dossierId || !colonneDe("Commentaire")) {
    $("apercu-auto").hidden = true;
    return;
  }
  const auto = texteAutomatique();
  $("apercu-auto").hidden = false;
  $("apercu-auto").classList.toggle("vide", !auto);
  $("apercu-texte").textContent =
    auto ||
    (etatSaisie.optionsAuto.actif
      ? "Aucune réponse modifiée pour l'instant : modifiez la qualification, la description ou une question, le résumé s'écrira ici."
      : "Résumé automatique désactivé (bouton « ⚙ Réglages »).");
}
["input", "change"].forEach((evt) =>
  $("form-signalement").addEventListener(evt, (evenement) => {
    const id = evenement.target && evenement.target.id;
    if (id === "commentaire") return;
    if (id !== "description") majDescriptionAuto();
    majApercuAuto();
    majCouleur();
  }),
);
