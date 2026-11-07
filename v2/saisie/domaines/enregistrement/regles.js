/* PRISME — widget de saisie, domaines/enregistrement/regles.js
   Domaine : l'enregistrement : contrôles, écriture d'une version, description automatique, doublons — règles
   (calculs, sans page ni Grist).
   Chargé par saisie/index.html dans l'ordre : fondations, composants, domaines, demarrage.js. Les fichiers partagent
   leurs noms (scripts classiques, sans import) : au chargement, un fichier ne fait que définir. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : NATURE, fusionnerAvecVersionRecente, seulementModifies, formatValeur, SEPARATEURS, joindre,
     memeReponse, mettreEnForme, element, calculerModifications, modificationsSaisies, texteAutomatique,
     commentaireComplet, FAMILLES, famille, formatPour, questionsDescription, construireElements,
     elementsDescription, MOTIF_MOBILISATION, ordinal, dateParGrist, cleSite, memeSite, calculerDoublonsDuJour,
     doublonsDuJour, cleDoublon, extraitDescription, jourDeMobilisation, mentionMobilisation, qualificationRas,
     signalementEnCoursRas, ajouterMobilisation, identiteDe, identiteDuFormulaire, enTeteDescription,
     elementsTableau, descriptionGeneree, texteSousValeur, syntheseTableau, TYPES_DECOMPTE, decomptable, modeSous,
     estQualifSous, valeursLigneTableau, texteAutoLigne, texteTableauDescription, erreurColonneEtablissement,
     manquantsDeBase, erreurDateFaitsSaisie, qualificationVide, valeursAEnregistrer, erreurDossierAffiche,
     doublonAConfirmer, erreurPrerequisEcriture, champsACorriger, nouvelleVersionDevientDerniere, aucuneMiseAJour,
     champsNouvelleVersion, champsCreation, conseilEchecEnregistrement, champsModifiesParRapportADerniere.
   Utilise :
     fondations/configuration : ETAB, OPTIONS_DEFAUT.
     fondations/outils : colonneDe, dateFr, egal, idDossierDe, listeQualif, refId, secondes, texteComparable,
       typeBase, valeurLigne.
     fondations/etat : etatSaisie.
     composants/date-faits : lireDateFaits.
     composants/champs : estVide, valeurOuNull.
     composants/conditions-formules : evaluerConditionLigne, formuleConnue.
     composants/pieces-jointes : piecesJointes.
     composants/tableaux-structure : lireTableauJson, videSous.
     domaines/formulaire/regles : appliquerModele, varianteSaisie.
     domaines/formulaire/affichage : lireQualificationInitiale.
     domaines/etablissement/regles : etablissementDuFormulaire, valeursEtab.
     domaines/dossier/regles : LIMITE_FUTUR_JOURS, UN_JOUR, comparerVersions, jourCalendaire, jourDeLaVersion,
       jourDuFormulaire, jourFaits, lignesPrecedentes, versionDuJour.
     domaines/enregistrement/affichage : lireIdentiteSaisie, lireReponsesPourDescription, lireReponsesSaisies.
   Modifie etatSaisie : optionsAuto. */
// Modèle à table unique : chaque ligne est une version d'un signalement.
const NATURE = { initial: "Nouveau signalement", suivi: "Mise à jour" };
// Ne garde que les champs dont la valeur diffère de la ligne de référence
// Une version est arrivée depuis l'ouverture du formulaire : on garde les réponses que l'agent a changées,
// et pour les autres celles de la version la plus récente (l'apport du collègue n'est pas effacé).
function fusionnerAvecVersionRecente(valeurs) {
  const resultat = { valeurs: {}, conflits: [], recuperes: [] };
  if (!etatSaisie.versionAffichee || !etatSaisie.derniere || etatSaisie.versionAffichee.id === etatSaisie.derniere.id)
    return resultat;
  const definitions = [...etatSaisie.champsVersion, ...etatSaisie.defsQuestions],
    definitionDe = (identifiantColonne) =>
      definitions.find((definition) => definition.colId === identifiantColonne) || { type: "Any" };
  const pareil = (identifiantColonne, ancienneValeur, nouvelleValeur) =>
    egal(
      valeurOuNull(definitionDe(identifiantColonne), ancienneValeur),
      valeurOuNull(definitionDe(identifiantColonne), nouvelleValeur),
    );
  for (const [identifiantColonne, valeur] of Object.entries(valeurs)) {
    const avant = etatSaisie.versionAffichee[identifiantColonne],
      recent = etatSaisie.derniere[identifiantColonne];
    const moi = !pareil(identifiantColonne, valeur, avant),
      lui = !pareil(identifiantColonne, recent, avant);
    if (!moi && lui) {
      resultat.valeurs[identifiantColonne] = recent;
      resultat.recuperes.push(definitionDe(identifiantColonne).libelle || identifiantColonne);
    } else if (moi && lui && !pareil(identifiantColonne, valeur, recent))
      resultat.conflits.push(definitionDe(identifiantColonne).libelle || identifiantColonne);
  }
  return resultat;
}
function seulementModifies(definitions, valeurs, ligne) {
  const resultat = {};
  for (const [identifiantColonne, valeur] of Object.entries(valeurs)) {
    const definitionColonne = definitions.find((definition) => definition.colId === identifiantColonne) || {
      type: "Any",
    };
    if (
      !egal(
        valeurOuNull(definitionColonne, valeur),
        valeurOuNull(definitionColonne, ligne ? ligne[identifiantColonne] : null),
      )
    )
      resultat[identifiantColonne] = valeur;
  }
  return resultat;
}
function formatValeur(definition, valeur) {
  if (estVide(definition, valeur)) return "—";
  if (definition.tableau) return syntheseTableau(definition._sousDefs || [], lireTableauJson(valeur), true);
  const typeColonne = typeBase(definition.type);
  if (typeColonne === "Bool") return valeur ? "Oui" : "Non";
  if (typeColonne === "Date" || typeColonne === "DateTime") return dateFr(valeur, definition);
  if (typeColonne === "Numeric" || typeColonne === "Int")
    return typeof valeur === "number" ? valeur.toLocaleString("fr-FR") : String(valeur);
  if (typeColonne === "Ref") return (definition._labels && definition._labels.get(valeur)) || `n° ${valeur}`;
  if (typeColonne === "Attachments") return piecesJointes.texte(valeur);
  if (Array.isArray(valeur) && valeur[0] === "L") {
    const elementsListe = valeur.slice(1);
    return (
      typeColonne === "RefList"
        ? elementsListe.map(
            (numeroReference) =>
              (definition._labels && definition._labels.get(numeroReference)) || `n° ${numeroReference}`,
          )
        : elementsListe
    ).join(", ");
  }
  const texte = String(valeur);
  return texte.length > 160 ? texte.slice(0, 157) + "…" : texte;
}
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
    valeur = valeurOuNull(question, valeur);
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
// Calcule les réponses modifiées par rapport à la ligne de référence d'après les réponses saisies : [{ libelle, valeur }]
function calculerModifications(saisies, ligneReference) {
  const modifications = [];
  const defQ = etatSaisie.metaSig[colonneDe("Qualification")];
  if (defQ && etatSaisie.optionsAuto.qualification) {
    const saisie = saisies.qualification;
    const apres = Array.isArray(saisie) ? saisie : saisie ? [saisie] : [];
    const avant = listeQualif(ligneReference ? valeurLigne(ligneReference, "Qualification") : "");
    if (apres.length && JSON.stringify([...apres].map(String).sort()) !== JSON.stringify([...avant].map(String).sort()))
      modifications.push({ libelle: defQ.libelle || "Qualification", valeur: apres.join(", ") });
  }
  const defD = etatSaisie.metaSig[colonneDe("Description")];
  if (defD && etatSaisie.optionsAuto.description) {
    const nouvelle = saisies.description;
    const avant = String((ligneReference ? valeurLigne(ligneReference, "Description") : "") ?? "").trim();
    if (nouvelle.replace(/\s+/g, " ") !== avant.replace(/\s+/g, " "))
      modifications.push({ libelle: defD.libelle || "Description", valeur: nouvelle || "(vide)" });
  }
  if (etatSaisie.optionsAuto.questions) {
    const valeurs = saisies.valeurs;
    for (const question of etatSaisie.defsQuestions) {
      if (saisies.directes.has(question.colId)) {
        const valeurDirecte = saisies.directes.get(question.colId),
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
// Réponses modifiées par rapport à la version précédente : [{ libelle, valeur }]
function modificationsSaisies() {
  const ligneReference = etatSaisie.derniere || etatSaisie.initiale;
  return calculerModifications(lireReponsesSaisies(), ligneReference);
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
// Construit les éléments de la description [{ libelle, valeur, def }] d'après les réponses lues et les options
function construireElements(reponses, options) {
  const items = [];
  const defQ = etatSaisie.metaSig[colonneDe("Qualification")];
  if (options.qualification && defQ) {
    const qualification = reponses.qualification;
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
    const valeurs = reponses.valeurs;
    for (const question of etatSaisie.defsQuestions) {
      if (reponses.directes.has(question.colId)) {
        const valeurDirecte = reponses.directes.get(question.colId);
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
function elementsDescription(options = etatSaisie.optionsAuto) {
  return construireElements(lireReponsesPourDescription(options), options);
}
/* ---------- Jour de mobilisation ----------
   Nombre de jours calendaires distincts où l'établissement a fait l'objet d'une saisie (signalement
   initial ou mise à jour, tous dossiers confondus), en comptant aujourd'hui, jour de l'enregistrement.
   Le jour est déterminé dans le fuseau horaire de la colonne Date. Seules les lignes visibles par
   l'utilisateur sont prises en compte (règles d'accès). */
const MOTIF_MOBILISATION = /\s*\(\d+(?:er|e) jour de mobilisation\)\s*$/;
const ordinal = (rang) => (rang === 1 ? "1er" : `${rang}e`);
// Jour calendaire d'une date des faits : une colonne Date est à minuit UTC, on la lit donc en UTC
/* Date de saisie : si la colonne a une formule (formule d'initialisation NOW() « à la création »,
   ou colonne formule), c'est Grist qui la remplit avec l'heure de son serveur, et le widget n'envoie rien.
   Sinon, le widget écrit l'heure de l'ordinateur, qui peut être fausse si son horloge est déréglée. */
const dateParGrist = () => !!(etatSaisie.metaDate && String(etatSaisie.metaDate.texteFormule || "").trim());
// Site comparé sans accents, majuscules, ponctuation ni mots « bâtiment / bât. / site / campus »
const cleSite = (texteSite) =>
  texteComparable(texteSite)
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
// Calcule les dossiers du même établissement, du même jour et du même site que celui du formulaire
function calculerDoublonsDuJour(etabId, jour, siteSaisi) {
  const parDossier = new Map();
  for (const ligne of etatSaisie.enregistrements) {
    if (refId(valeurLigne(ligne, "Etablissement")) !== etabId) continue;
    const idDossierLigne = idDossierDe(ligne);
    if (!parDossier.has(idDossierLigne)) parDossier.set(idDossierLigne, []);
    parDossier.get(idDossierLigne).push(ligne);
  }
  const doublons = [];
  for (const [idDossier, lignes] of parDossier) {
    if (!lignes.some((ligne) => jourDeLaVersion(ligne) === jour)) continue;
    const derniere = [...lignes].sort(comparerVersions).pop();
    if (colonneDe("Site") && !memeSite(siteSaisi, valeurLigne(derniere, "Site"))) continue; // autre site du même établissement
    doublons.push({ dossier: idDossier, derniere, nb: lignes.length });
  }
  return doublons;
}
function doublonsDuJour() {
  if (etatSaisie.dossierId) return [];
  const etabId = etablissementDuFormulaire();
  if (!etabId) return [];
  return calculerDoublonsDuJour(etabId, jourDuFormulaire(), $("site").value);
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
// Calcule l'identité du formulaire : établissement connu, sinon valeurs saisies
function identiteDe(saisie) {
  const etablissement = etatSaisie.etabCourant || (etatSaisie.modeEtab ? etatSaisie.etabs[0] : null);
  const site = saisie.site;
  if (etablissement) return { ...valeursEtab(etablissement), site };
  return {
    nom: saisie.nom,
    commune: (etatSaisie.ligneAnnuaire && etatSaisie.ligneAnnuaire.commune) || "",
    site,
    uai: saisie.uai,
    type: saisie.type,
    academie: saisie.academie,
    departement: saisie.departement,
  };
}
function identiteDuFormulaire() {
  return identiteDe(lireIdentiteSaisie());
}
// En-tête : modèle du formulaire (« **{nom}**, **{commune}** », « **{nom}** ({site})»…), en gras au format Markdown
function enTeteDescription(ident) {
  return String(ident.nom || "").trim() ? appliquerModele(varianteSaisie().entete, ident) : "";
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
function texteSousValeur(sousDefinition, valeur) {
  if (videSous(valeur)) return "";
  const typeColonne = typeBase(sousDefinition.type);
  if (typeColonne === "Bool") return valeur ? "Oui" : "Non";
  if (typeColonne === "Ref")
    return ((sousDefinition._options || []).find((option) => option.id === +valeur) || {}).libelle || `n° ${valeur}`;
  if (typeColonne === "RefList")
    return valeur
      .map(
        (numeroReference) =>
          ((sousDefinition._options || []).find((option) => option.id === +numeroReference) || {}).libelle ||
          `n° ${numeroReference}`,
      )
      .join(", ");
  if (Array.isArray(valeur)) return valeur.join(", ");
  if (typeColonne === "Date" || typeColonne === "DateTime") return dateFr(valeur, sousDefinition);
  if (typeof valeur === "number") return valeur.toLocaleString("fr-FR");
  return String(valeur);
}
// Synthèse : nombre de lignes, et répartition selon les colonnes à choix (hors confidentielles)
function syntheseTableau(sousDefs, lignes, court) {
  const nombreLignes = lignes.length;
  if (!nombreLignes) return "";
  const parts = [];
  for (const sousDefinition of sousDefs
    .filter((colonne) => !colonne.confidentiel && ["Choice", "ChoiceList", "Bool"].includes(typeBase(colonne.type)))
    .slice(0, 3)) {
    const compte = new Map();
    for (const ligne of lignes) {
      if (
        sousDefinition.condition &&
        !evaluerConditionLigne(sousDefinition.condition, sousDefs, ligne.valeurs || ligne)
      )
        continue;
      const valeur = (ligne.valeurs || ligne)[sousDefinition.colId];
      for (const reponse of Array.isArray(valeur)
        ? valeur
        : videSous(valeur)
          ? []
          : [typeBase(sousDefinition.type) === "Bool" ? (valeur ? "Oui" : "Non") : valeur])
        compte.set(reponse, (compte.get(reponse) || 0) + 1);
    }
    if (!compte.size) continue;
    const ordre = (sousDefinition.opts && sousDefinition.opts.choices) || [];
    const rang = (valeurChoix) => {
      const i = ordre.indexOf(valeurChoix);
      return i < 0 ? 1e9 : i;
    };
    parts.push(
      `${sousDefinition.libelle || sousDefinition.colId} : ${[...compte]
        .sort((a, b) => rang(a[0]) - rang(b[0]))
        .map(([valeurChoix, effectif]) => `${valeurChoix} ${effectif}`)
        .join(", ")}`,
    );
  }
  return court
    ? `${nombreLignes}${parts.length ? ` (${parts.join(" ; ")})` : ""}`
    : [`Total : ${nombreLignes}`, ...parts].join(" · ");
}
/* ---------- Description automatique d'une question « tableau » ----------
   Pour chaque colonne de la table (réglage ⚙ « Format question par question ») :
   dans la ligne de chaque élément : « Libellé : valeur », « Valeur seule », ou rien (« Par défaut » suit le
   format de la question) ; et, en option, un décompte en tête (somme pour un nombre).
   Les colonnes [confidentiel] ne sont jamais incluses. */
const TYPES_DECOMPTE = ["Choice", "ChoiceList", "Bool", "Ref", "RefList"];
const decomptable = (sousDefinition) =>
  TYPES_DECOMPTE.includes(typeBase(sousDefinition.type)) || ["Numeric", "Int"].includes(typeBase(sousDefinition.type));
// Réglage d'une colonne : dans la ligne de chaque élément (format), et décompte en tête (ou somme pour un nombre)
function modeSous(questionTableau, sousDefinition, options = etatSaisie.optionsAuto) {
  const reglageSousChamp = ((options.formatsTableau || {})[questionTableau.colId] || {})[sousDefinition.colId];
  const anciens = {
    detail: { ligne: "defaut", decompte: false },
    decompte: { ligne: "exclure", decompte: true },
    les2: { ligne: "defaut", decompte: true },
    exclure: { ligne: "exclure", decompte: false },
  }; // réglages précédents
  const reglageNormalise =
    typeof reglageSousChamp === "string"
      ? anciens[reglageSousChamp]
      : reglageSousChamp && typeof reglageSousChamp === "object"
        ? reglageSousChamp
        : null;
  const ligne =
    reglageNormalise && ["defaut", "libelle", "valeur", "exclure"].includes(reglageNormalise.ligne)
      ? reglageNormalise.ligne
      : "defaut";
  if (!reglageNormalise && estQualifSous(sousDefinition)) return { ligne, decompte: true }; // qualification : décompte en tête sauf réglage contraire
  return { ligne, decompte: !!(reglageNormalise && reglageNormalise.decompte && decomptable(sousDefinition)) };
}
// Champ « qualification » d'une ligne de tableau (ex. qualification de chaque site) : choix unique nommé Qualification…
const estQualifSous = (sousDefinition) =>
  !!sousDefinition &&
  typeBase(sousDefinition.type) === "Choice" &&
  (/qualif/i.test(sousDefinition.colId) || /qualif/i.test(sousDefinition.libelle || ""));
// Valeurs d'une ligne de tableau mises en forme selon les réglages de la description automatique
function valeursLigneTableau(questionTableau, ligne, options = etatSaisie.optionsAuto) {
  const tous = questionTableau._sousDefs || [];
  const vis = (sousDefinition) =>
    !sousDefinition.condition || evaluerConditionLigne(sousDefinition.condition, tous, ligne);
  const formatGeneral = (sousDefinition) => {
    const formatFamille = (options.formatsType || {})[famille(sousDefinition)];
    return formatFamille && formatFamille !== "defaut" ? formatFamille : options.format;
  };
  const libelleDe = (sousDefinition) => {
    const modeLigne = modeSous(questionTableau, sousDefinition, options).ligne;
    return modeLigne === "libelle" || (modeLigne === "defaut" && formatGeneral(sousDefinition) !== "valeur");
  };
  return tous
    .filter(
      (sousDefinition) =>
        !sousDefinition.confidentiel &&
        !sousDefinition.auto &&
        modeSous(questionTableau, sousDefinition, options).ligne !== "exclure" &&
        vis(sousDefinition),
    )
    .map((sousDefinition) => {
      const texteValeur = texteSousValeur(sousDefinition, ligne[sousDefinition.colId]),
        avecLibelle = libelleDe(sousDefinition);
      // oui / non sans libellé : le libellé seul quand c'est « Oui », rien sinon
      if (!avecLibelle && typeBase(sousDefinition.type) === "Bool")
        return ligne[sousDefinition.colId] ? sousDefinition.libelle || sousDefinition.colId : "";
      return texteValeur
        ? avecLibelle
          ? `${sousDefinition.libelle || sousDefinition.colId} : ${texteValeur}`
          : texteValeur
        : "";
    })
    .filter(Boolean);
}
// Texte proposé pour un champ [auto] d'une ligne
const texteAutoLigne = (questionTableau, ligne, options = etatSaisie.optionsAuto) =>
  valeursLigneTableau(questionTableau, ligne, options).join(" — ");
/* Évolution depuis la version précédente du dossier (même jour) : chaque décompte en tête reçoit l'écart entre
   parenthèses (« RAS 19 (−1) ») ; la qualification d'une ligne qui a changé est écrite « Blocage → ==RAS== »
   (== : surlignage dans Word, soulignement dans Tchap). Les lignes sont retrouvées d'une version à l'autre par leur
   identifiant, sinon par le premier champ texte (nom du site…). */
function texteTableauDescription(questionTableau, lignesBrutes, options = etatSaisie.optionsAuto, avantBrutes = null) {
  const tous = questionTableau._sousDefs || [],
    sous = tous.filter((sousDefinition) => !sousDefinition.confidentiel);
  const vis = (ligne, sousDefinition) =>
    !sousDefinition.condition || evaluerConditionLigne(sousDefinition.condition, tous, ligne);
  const nonVide = (ligne) =>
    tous.some((sousDefinition) => vis(ligne, sousDefinition) && !videSous(ligne[sousDefinition.colId]));
  const lignes = lignesBrutes.map((ligneBrute) => ligneBrute.valeurs || ligneBrute).filter(nonVide);
  if (!lignes.length) return "";
  const avant = Array.isArray(avantBrutes)
    ? avantBrutes.map((ligneBrute) => ligneBrute.valeurs || ligneBrute).filter(nonVide)
    : null;
  const sousDefinitionQualification = sous.find(estQualifSous);
  const ecart = (valeurApres, valeurAvant) => {
    const ecartBrut = valeurApres - valeurAvant;
    return ecartBrut ? ` (${ecartBrut > 0 ? "+" : "−"}${Math.abs(ecartBrut).toLocaleString("fr-FR")})` : "";
  };
  const parts = [];
  for (const sousDefinition of sous.filter((colonne) => modeSous(questionTableau, colonne, options).decompte)) {
    const typeColonne = typeBase(sousDefinition.type),
      libelle = sousDefinition.libelle || sousDefinition.colId;
    if (typeColonne === "Numeric" || typeColonne === "Int") {
      const somme = (lignesACompter) =>
        lignesACompter
          .filter((ligne) => vis(ligne, sousDefinition) && typeof ligne[sousDefinition.colId] === "number")
          .map((ligne) => ligne[sousDefinition.colId]);
      const valeursApres = somme(lignes),
        valeursAvant = avant ? somme(avant) : [];
      if (valeursApres.length || valeursAvant.length) {
        const sommeApres = valeursApres.reduce((cumul, valeur) => cumul + valeur, 0),
          sommeAvant = valeursAvant.reduce((cumul, valeur) => cumul + valeur, 0);
        parts.push(`${libelle} : ${sommeApres.toLocaleString("fr-FR")}${avant ? ecart(sommeApres, sommeAvant) : ""}`);
      }
      continue;
    }
    const compter = (lignesACompter) => {
      const compte = new Map();
      for (const ligne of lignesACompter) {
        if (!vis(ligne, sousDefinition) || videSous(ligne[sousDefinition.colId])) continue;
        const valeur = ligne[sousDefinition.colId];
        const items = Array.isArray(valeur)
          ? valeur.map((valeurItem) =>
              typeColonne === "RefList" ? texteSousValeur({ ...sousDefinition, type: "Ref" }, valeurItem) : valeurItem,
            )
          : [texteSousValeur(sousDefinition, valeur)];
        for (const intitule of items) compte.set(intitule, (compte.get(intitule) || 0) + 1);
      }
      return compte;
    };
    const compte = compter(lignes),
      compteAvant = avant ? compter(avant) : new Map();
    if (!compte.size && !compteAvant.size) continue;
    const ordre = (sousDefinition.opts && sousDefinition.opts.choices) || [];
    const rang = (intitule) => {
      const i = ordre.indexOf(intitule);
      return i < 0 ? 1e9 : i;
    };
    const cles = [...new Set([...compte.keys(), ...compteAvant.keys()])].sort((a, b) => rang(a) - rang(b));
    parts.push(
      `${libelle} : ${cles.map((intitule) => `${intitule} ${compte.get(intitule) || 0}${avant ? ecart(compte.get(intitule) || 0, compteAvant.get(intitule) || 0) : ""}`).join(", ")}`,
    );
  }
  // tableau avec une qualification : « 22 — Qualification : Blocage 1 (+1), RAS 19 (−1) » (pas de parenthèses imbriquées)
  const tete = sousDefinitionQualification
    ? `${lignes.length}${parts.length ? ` — ${parts.join(" ; ")}` : ""}`
    : `${lignes.length}${parts.length ? ` (${parts.join(" ; ")})` : ""}`;
  const det = sous.filter(
    (sousDefinition) => !sousDefinition.auto && modeSous(questionTableau, sousDefinition, options).ligne !== "exclure",
  );
  // Champ [auto] utilisé : la ligne reprend son texte (éventuellement retouché par l'agent)
  const autos = sous.filter(
    (sousDefinition) => sousDefinition.auto && modeSous(questionTableau, sousDefinition, options).ligne !== "exclure",
  );
  if (!det.length && !autos.length) return tete;
  // qualification précédente d'une ligne, quand elle a changé
  const dNom = sous.find((sousDefinition) => typeBase(sousDefinition.type) === "Text" && !sousDefinition.auto);
  const nomDe = (ligne) => (dNom ? texteComparable(ligne[dNom.colId]) : "");
  const passage = (ligne) => {
    if (!avant || !sousDefinitionQualification) return null;
    const ligneAvant =
      avant.find((ligneAnterieure) => ligne._id && ligneAnterieure._id === ligne._id) ||
      (nomDe(ligne) ? avant.find((ligneAnterieure) => nomDe(ligneAnterieure) === nomDe(ligne)) : null);
    if (
      !ligneAvant ||
      String(ligneAvant[sousDefinitionQualification.colId] ?? "") ===
        String(ligne[sousDefinitionQualification.colId] ?? "")
    )
      return null;
    return (
      texteSousValeur(sousDefinitionQualification, ligneAvant[sousDefinitionQualification.colId]) ||
      "Sans qualification"
    );
  };
  // La flèche prend la place de la qualification dans le texte de la ligne : la nouvelle (texte automatique à jour)
  // ou l'ancienne (texte retouché par l'agent, resté sur l'ancienne qualification) ; la plus longue est cherchée d'abord
  // (« Blocage partiel » avant « Blocage »). Introuvable : la flèche est ajoutée en fin de ligne.
  const avecFleche = (texteLigne, ligne) => {
    const ancienneQualification = passage(ligne);
    if (!ancienneQualification) return texteLigne;
    const nouvelleQualification =
        texteSousValeur(sousDefinitionQualification, ligne[sousDefinitionQualification.colId]) || "Sans qualification",
      fleche = `${ancienneQualification} → ==${nouvelleQualification}==`;
    for (const qualificationCherchee of [ancienneQualification, nouvelleQualification].sort(
      (qualificationA, qualificationB) => qualificationB.length - qualificationA.length,
    )) {
      const motif = new RegExp(
        `(^|[\\s—:(,;])${qualificationCherchee.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`,
        "u",
      );
      if (motif.test(texteLigne)) return texteLigne.replace(motif, (correspondance, avant) => `${avant}${fleche}`);
    }
    return `${texteLigne} — ${fleche}`;
  };
  const lignesTxt = lignes
    .map((ligne, k) => {
      const repris = autos
        .filter((sousDefinition) => vis(ligne, sousDefinition))
        .map((sousDefinition) => String(ligne[sousDefinition.colId] ?? "").trim())
        .filter(Boolean)
        .join(" — ");
      const valeursLigne = repris ? [repris] : valeursLigneTableau(questionTableau, ligne, options);
      return valeursLigne.length ? `${k + 1}. ${avecFleche(valeursLigne.join(" — "), ligne)}` : "";
    })
    .filter(Boolean);
  return [tete, ...lignesTxt].join("\n");
}
// Message si la colonne de l'établissement n'est pas associée (vide sinon)
function erreurColonneEtablissement() {
  return colonneDe("Etablissement")
    ? ""
    : `Colonne de l'établissement introuvable dans la table « ${etatSaisie.tableId || "?"} » : voir ⚙ Réglages › « Colonnes et référentiel utilisés ».`;
}
// Libellés des informations de base absentes : établissement, description, date des faits (valeurs lues dans le formulaire)
function manquantsDeBase(nom, description, dateFaits) {
  const manquants = [];
  if (!etatSaisie.dossierId && !etatSaisie.modeEtab && !etatSaisie.etabCourant && !nom.trim())
    manquants.push("l'établissement");
  if (!description.trim()) manquants.push("la description");
  if (colonneDe("Date_faits") && !dateFaits) manquants.push("la date des faits");
  return manquants;
}
// Message si la date des faits est postérieure à aujourd'hui (non admis) ou à plus d'un an (vide sinon)
function erreurDateFaitsSaisie(dateFuture, dateFaits) {
  if (colonneDe("Date_faits") && dateFuture && !varianteSaisie().faitsFuturs)
    return "La date des faits ne peut pas être postérieure à aujourd'hui.";
  if (colonneDe("Date_faits") && dateFaits != null && dateFaits > Date.now() / 1000 + LIMITE_FUTUR_JOURS * UN_JOUR)
    return "La date des faits est à plus d'un an : vérifiez-la.";
  return "";
}
// Vrai si aucune qualification n'est choisie
function qualificationVide(qualif) {
  return !qualif || (Array.isArray(qualif) && !qualif.length);
}
// Valeurs des colonnes à enregistrer, d'après les réponses et les champs lus dans le formulaire
function valeursAEnregistrer(reponses, description, site, dateFaits, qualif) {
  const valeurs = { ...reponses };
  if (colonneDe("Description")) valeurs[colonneDe("Description")] = description.trim();
  if (colonneDe("Site")) valeurs[colonneDe("Site")] = site.trim();
  if (colonneDe("Date_faits")) valeurs[colonneDe("Date_faits")] = dateFaits;
  if (colonneDe("Qualification"))
    valeurs[colonneDe("Qualification")] = Array.isArray(qualif) ? (qualif.length ? ["L", ...qualif] : null) : qualif;
  return valeurs;
}
// Message si le dossier affiché n'est plus disponible ou n'est pas celui de l'établissement affiché (vide sinon)
function erreurDossierAffiche() {
  if (etatSaisie.dossierId && !etatSaisie.initiale)
    return "Le signalement affiché n'est plus disponible. Rechargez le widget avant d'enregistrer.";
  // Mise à jour : l'établissement affiché doit être celui du dossier
  if (
    etatSaisie.dossierId &&
    etatSaisie.initiale &&
    etatSaisie.etabCourant &&
    etatSaisie.etabCourant.id !== refId(valeurLigne(etatSaisie.initiale, "Etablissement"))
  )
    return "L'établissement affiché ne correspond pas à celui du signalement ouvert : enregistrement annulé. Rouvrez le signalement depuis le menu.";
  return "";
}
// Vrai si des signalements du même jour existent et que l'utilisateur n'a pas confirmé qu'il s'agit de faits distincts
function doublonAConfirmer(nombreDoublons, confirme, cleCourante) {
  return nombreDoublons && confirme !== cleCourante;
}
// Message si l'écriture est impossible : correction sans dossier ouvert, mise à jour sans colonne « Dossier » (vide sinon)
function erreurPrerequisEcriture(correction) {
  if (correction && !(etatSaisie.dossierId && etatSaisie.initiale && etatSaisie.derniere))
    return "Ouvrez d'abord un signalement à corriger.";
  if (etatSaisie.dossierId && !correction && !colonneDe("Dossier"))
    return (
      "Mise à jour impossible : aucune colonne « Dossier » n'est associée au widget. Ajoutez à la table une colonne « Dossier » " +
      "de type Référence vers cette même table, puis associez-la dans le panneau du widget (ou corrigez la dernière version)."
    );
  return "";
}
// Champs de la dernière version à corriger : réponses modifiées, plus la date des faits si elle change
function champsACorriger(valeurs) {
  const fields = seulementModifies(etatSaisie.champsVersion, valeurs, etatSaisie.derniere);
  if (
    colonneDe("Date_faits") &&
    valeurs[colonneDe("Date_faits")] !== undefined &&
    !egal(valeurs[colonneDe("Date_faits")], secondes(etatSaisie.derniere[colonneDe("Date_faits")]))
  )
    fields[colonneDe("Date_faits")] = valeurs[colonneDe("Date_faits")];
  return fields;
}
// Vrai si la nouvelle version porte les faits les plus récents du dossier (sinon la table dédiée garde ses lignes)
function nouvelleVersionDevientDerniere(faitsNouveaux, faitsDerniere) {
  return faitsNouveaux == null || faitsDerniere == null || faitsNouveaux >= faitsDerniere;
}
// Vrai s'il n'y a rien à enregistrer pour une mise à jour : ni réponse modifiée, ni jour suivant, ni commentaire
function aucuneMiseAJour(change, jours, commentaireSaisi) {
  return !change && !jours.length && !commentaireSaisi;
}
// Champs de la nouvelle version : réponses, établissement du dossier, dossier, date de saisie, nature, commentaire
function champsNouvelleVersion(valeurs, com) {
  const fields = {
    ...valeurs,
    [colonneDe("Etablissement")]: refId(valeurLigne(etatSaisie.initiale, "Etablissement")), // l'établissement du dossier, et lui seul
    ...(colonneDe("Dossier") ? { [colonneDe("Dossier")]: etatSaisie.dossierId } : {}),
  };
  if (colonneDe("Date") && !dateParGrist()) fields[colonneDe("Date")] = Date.now() / 1000;
  if (colonneDe("Nature")) fields[colonneDe("Nature")] = NATURE.suivi;
  if (colonneDe("Commentaire")) fields[colonneDe("Commentaire")] = com;
  return fields;
}
// Champs du premier signalement d'un dossier : réponses, établissement, date de saisie, nature
function champsCreation(valeurs, etabId) {
  const fields = { ...valeurs, [colonneDe("Etablissement")]: etabId };
  if (colonneDe("Date") && !dateParGrist()) fields[colonneDe("Date")] = Date.now() / 1000;
  if (colonneDe("Nature")) fields[colonneDe("Nature")] = NATURE.initial;
  return fields;
}
// Conseil ajouté au message d'échec quand Grist refuse l'écriture (règles d'accès)
function conseilEchecEnregistrement(erreur, correction) {
  let conseil = "";
  if (erreur.acl && erreur.table === ETAB.table)
    conseil =
      " Cet établissement n'est pas encore dans le référentiel et vos droits ne permettent pas de l'y ajouter : " +
      (varianteSaisie().annuaires.length
        ? "importez-le via la mise à jour de l'annuaire, ou autorisez la création dans la table des établissements."
        : "ajoutez-le au référentiel (table des établissements), ou autorisez la création dans cette table.");
  else if (erreur.acl && correction)
    conseil =
      " Vos droits ne permettent pas de modifier cette version : vérifiez la règle d'accès qui autorise la correction (mise à jour de la dernière version).";
  else if (erreur.acl)
    conseil =
      " Vérifiez les conditions de création de votre règle d'accès : elles portent sur l'ensemble des valeurs " +
      "envoyées par le widget (établissement, date, nature, qualification…), pas seulement sur la cellule saisie.";
  return conseil;
}
// Champs modifiés par rapport à la dernière version, dans l'ordre : qualification, site, questions, description.
// Chaque élément : { cle: "qualification" | "site" | "description" | "q-" suivi de l'identifiant de colonne de la question, nom }.
// reponsesLues : réponses lues pour les questions affichées (identifiant de colonne → valeur).
function champsModifiesParRapportADerniere(qualification, site, reponsesLues, description) {
  const modifs = [];
  const tri = (valeur) => listeQualif(valeur).map(String).sort().join("|");
  if (colonneDe("Qualification") && tri(qualification) !== tri(valeurLigne(etatSaisie.derniere, "Qualification")))
    modifs.push({
      cle: "qualification",
      nom: (etatSaisie.metaSig[colonneDe("Qualification")] || {}).libelle || "Qualification",
    });
  if (colonneDe("Site") && site.trim() !== String(valeurLigne(etatSaisie.derniere, "Site") || "").trim())
    modifs.push({ cle: "site", nom: "Site / bâtiment" });
  for (const question of etatSaisie.defsQuestions) {
    if (question.formule) continue;
    if (!reponsesLues.has(question.colId)) continue;
    if (!memeReponse(question, reponsesLues.get(question.colId), etatSaisie.derniere[question.colId]))
      modifs.push({ cle: `q-${question.colId}`, nom: question.libelle || question.colId });
  }
  const sansMention = (texte) =>
    String(texte || "")
      .replace(MOTIF_MOBILISATION, "")
      .replace(/\s+/g, " ")
      .trim();
  if (
    colonneDe("Description") &&
    sansMention(description) !== sansMention(valeurLigne(etatSaisie.derniere, "Description"))
  )
    modifs.push({ cle: "description", nom: "Description" });
  return modifs;
}
