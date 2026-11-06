/* PRISME — widget de saisie, module 12/34 : Questions conditionnelles et formules calculées en direct.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : normaliser, resoudreColonne, FORMULE_SIMPLE, formuleCalculable, formuleEtab, valeurFormuleEnDirect,
     formuleConnue, majFormulesEnDirect, questionVisible, nombreDe, calculerFormule, valeurColonneEnDirect,
     valeurPourCondition, conditionRemplie, evaluerCondition, afficherDiagnostic.
   Utilise :
     01 configuration : ETAB.
     05 etat : colonneDe, etabDe, etatSaisie.
     09 dossier : lireQualificationInitiale.
     10 champs : lireUnChamp, typeBase.
     13 coherence : formatValeur.
     16 description : etablissementDuFormulaire.
     19 tableaux : lireTableauJson, tableaux. */
/* ---------- Questions conditionnelles ---------- */
// Valeur courante d'une colonne dont dépend une condition (questions, mais aussi description
// et qualification du formulaire principal).
const normaliser = (texte) =>
  String(texte ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Retrouve la colonne visée par une condition : d'abord parmi les questions du formulaire, puis la
// qualification et la description, puis n'importe quelle colonne de la table (valeur de la dernière version).
function resoudreColonne(referenceColonne, questions) {
  const referenceNormalisee = normaliser(referenceColonne);
  const trouve = (liste) =>
    liste.find((definition) => definition.colId === referenceColonne) ||
    liste.find(
      (definition) =>
        normaliser(definition.colId) === referenceNormalisee || normaliser(definition.libelle) === referenceNormalisee,
    );
  const questionTrouvee = trouve(questions);
  if (questionTrouvee) return { genre: "question", def: questionTrouvee };
  const tous = Object.values(etatSaisie.metaSig);
  const autre = trouve(tous);
  if (!autre) return null;
  if (autre.colId === colonneDe("Qualification")) return { genre: "qualification", def: autre };
  if (autre.colId === colonneDe("Description")) return { genre: "description", def: autre };
  return { genre: "colonne", def: autre };
}

/* ---------- Formules simples calculées en direct ----------
   Une colonne formule n'est recalculée par Grist qu'après enregistrement. Si sa formule est une
   expression arithmétique simple sur d'autres colonnes (ex. « $Blesses + $Hospitalises »), le widget la
   calcule lui-même à partir des réponses en cours de saisie. Opérations acceptées : + - * / et
   parenthèses, nombres et références $Colonne. Toute autre formule garde sa dernière valeur enregistrée.
   Le calcul ne porte que sur quelques champs : aucun coût perceptible. */
const FORMULE_SIMPLE = /^[\s$\w.,+\-*/()]+$/;
function formuleCalculable(definition) {
  const formule = ((definition && definition.texteFormule) || "").trim().replace(/^return\s+/, "");
  if (!definition || !definition.formule || !formule || !FORMULE_SIMPLE.test(formule) || !/\$\w/.test(formule))
    return null;
  // Une fois retirés les références $Colonne et les nombres, il ne doit rester que des opérateurs :
  // un nom de fonction (max, SUM, len…) ou tout autre mot rend la formule non calculable ici.
  const reste = formule.replace(/\$\w+/g, " ").replace(/\d+(?:[.,]\d+)?/g, " ");
  return /^[\s+\-*/()]*$/.test(reste) ? formule : null;
}
/* Formule qui lit une colonne de la fiche de l'établissement (ex. « $Etablissement_ESR.Effectif ») :
   le widget a déjà cette fiche, il donne donc la valeur dès que l'établissement est choisi. */
function formuleEtab(definition) {
  const formule = ((definition && definition.formule && definition.texteFormule) || "")
    .trim()
    .replace(/^return\s+/, "");
  const correspondance = formule.match(/^\$(\w+)\.(\w+)$/);
  if (!correspondance) return null;
  const definitionReference = etatSaisie.metaSig[correspondance[1]];
  const versEtab =
    correspondance[1] === colonneDe("Etablissement") ||
    (definitionReference && (definitionReference.type || "") === `Ref:${ETAB.table}`);
  return versEtab ? correspondance[2] : null;
}
// Valeur d'une question formule pendant la saisie ; undefined si le widget ne sait pas la calculer
function valeurFormuleEnDirect(definition, prefix = "q", questions = etatSaisie.defsQuestions) {
  const colonneEtab = formuleEtab(definition);
  if (colonneEtab) {
    const etablissement = etabDe(etablissementDuFormulaire());
    const valeur = etablissement ? etablissement[colonneEtab] : null;
    return valeur === undefined || (valeur && typeof valeur === "object") ? null : valeur;
  }
  if (formuleCalculable(definition)) return valeurColonneEnDirect(definition.colId, prefix, questions);
  return undefined;
}
const formuleConnue = (definition) =>
  !!definition.formule && (!!formuleEtab(definition) || !!formuleCalculable(definition));
// Affichage en direct des questions formules calculables
function majFormulesEnDirect() {
  for (const question of etatSaisie.defsQuestions) {
    if (!formuleConnue(question)) continue;
    const champFormule = document.getElementById(`q-${question.colId}`),
      valeurDirecte = valeurFormuleEnDirect(question);
    if (champFormule && valeurDirecte !== undefined) champFormule.textContent = formatValeur(question, valeurDirecte);
  }
}
const questionVisible = (prefix, question) => {
  const bloc = document.querySelector(`[data-champ="${prefix}-${question.colId}"]`);
  return !!bloc && !bloc.hidden;
};
function nombreDe(valeur) {
  if (typeof valeur === "boolean") return valeur ? 1 : 0;
  if (valeur == null || valeur === "") return 0; // réponse vide : comptée comme 0, comme dans Grist
  const nombre = typeof valeur === "number" ? valeur : parseFloat(String(valeur).replace(",", "."));
  return isNaN(nombre) ? 0 : nombre;
}
function calculerFormule(formule, lire, profondeur = 0) {
  // Analyse descendante : expression → terme (+|- terme)* ; terme → facteur (*|/ facteur)*
  const jetons = formule.match(/\$\w+|\d+(?:[.,]\d+)?|[+\-*/()]/g) || [];
  let i = 0;
  const facteur = () => {
    const j = jetons[i++];
    if (j === "(") {
      const valeurEntreParentheses = expression();
      i++;
      return valeurEntreParentheses;
    }
    if (j === "-") return -facteur();
    if (j && j[0] === "$") return lire(j.slice(1), profondeur);
    return nombreDe(j);
  };
  const terme = () => {
    let produit = facteur();
    while (jetons[i] === "*" || jetons[i] === "/") {
      const operateur = jetons[i++];
      const facteurSuivant = facteur();
      produit = operateur === "*" ? produit * facteurSuivant : facteurSuivant ? produit / facteurSuivant : 0;
    }
    return produit;
  };
  const expression = () => {
    let somme = terme();
    while (jetons[i] === "+" || jetons[i] === "-") {
      const operateur = jetons[i++];
      const termeSuivant = terme();
      somme = operateur === "+" ? somme + termeSuivant : somme - termeSuivant;
    }
    return somme;
  };
  return expression();
}
// Valeur actuelle d'une colonne, pour le calcul : réponse en cours si c'est une question du formulaire,
// formule simple recalculée si c'en est une, sinon dernière valeur enregistrée
function valeurColonneEnDirect(colId, prefix, questions, profondeur = 0) {
  const definitionColonne = questions.find((question) => question.colId === colId) || etatSaisie.metaSig[colId];
  if (!definitionColonne) return 0;
  const formule = formuleCalculable(definitionColonne);
  if (formule && profondeur < 5)
    return calculerFormule(
      formule,
      (identifiantColonne, profondeurAppel) =>
        valeurColonneEnDirect(identifiantColonne, prefix, questions, profondeurAppel + 1),
      profondeur,
    );
  if (colId === colonneDe("Qualification") && prefix === "q") return nombreDe(lireQualificationInitiale());
  if (!definitionColonne.formule && questions.includes(definitionColonne)) {
    const bloc = document.querySelector(`[data-champ="${prefix}-${colId}"]`);
    if (bloc && !bloc.hidden) return nombreDe(lireUnChamp(prefix, definitionColonne));
    if (bloc && bloc.hidden) return 0;
  }
  const ligneVersion = etatSaisie.derniere || etatSaisie.initiale;
  return nombreDe(ligneVersion ? ligneVersion[colId] : null);
}

function valeurPourCondition(prefix, questions, cond) {
  const cible = resoudreColonne(cond.ref, questions);
  if (!cible) return null;
  const definition = cible.def;
  const formule = formuleCalculable(definition);
  if (formule)
    return calculerFormule(formule, (identifiantColonne, profondeurAppel) =>
      valeurColonneEnDirect(identifiantColonne, prefix, questions, profondeurAppel + 1),
    );
  if (typeBase(definition.type) === "Bool" && cible.genre === "colonne") {
    const ligneVersionBool = etatSaisie.derniere || etatSaisie.initiale;
    return !!(ligneVersionBool && ligneVersionBool[definition.colId]);
  }
  if (cible.genre === "qualification" && prefix === "q") return lireQualificationInitiale();
  if (cible.genre === "description" && prefix === "q") return $("description").value.trim();
  if (cible.genre === "question" && definition.formule) {
    const ligneVersionFormule = etatSaisie.derniere || etatSaisie.initiale;
    return ligneVersionFormule ? ligneVersionFormule[definition.colId] : null;
  }
  if (cible.genre === "question" && definition.tableau) {
    // tableau : nombre de lignes saisies
    const controleur = tableaux[`${prefix}-${definition.colId}`];
    return controleur ? controleur.lignesValides().length : lireTableauJson(lireUnChamp(prefix, definition)).length;
  }
  if (cible.genre === "question") {
    const bloc = document.querySelector(`[data-champ="${prefix}-${definition.colId}"]`);
    if (bloc && bloc.hidden) return null; // question elle-même masquée : considérée comme sans réponse
    const valeurChamp = lireUnChamp(prefix, definition);
    // Référence : on compare avec le texte affiché, pas avec le numéro de ligne
    const typeColonne = typeBase(definition.type);
    if (typeColonne === "Ref")
      return valeurChamp ? (definition._labels && definition._labels.get(valeurChamp)) || String(valeurChamp) : null;
    if (typeColonne === "RefList" && Array.isArray(valeurChamp))
      return [
        "L",
        ...valeurChamp
          .slice(1)
          .map(
            (numeroReference) =>
              (definition._labels && definition._labels.get(numeroReference)) || String(numeroReference),
          ),
      ];
    return valeurChamp;
  }
  // Colonne hors formulaire : valeur de la version affichée (ou vide pour un nouveau signalement)
  const ligneVersion = etatSaisie.derniere || etatSaisie.initiale;
  return ligneVersion ? ligneVersion[definition.colId] : null;
}

function conditionRemplie(prefix, questions, cond) {
  if (!cond) return true;
  return evaluerCondition(valeurPourCondition(prefix, questions, cond), cond);
}
function evaluerCondition(valeur, cond) {
  // Nombre comparé à Oui / Non : « Oui » = supérieur à 0 (ex. [si Nb de blessés = Oui])
  if ((cond.op === "=" || cond.op === "!=") && typeof valeur === "number") {
    const valeursCondition = (cond.valeurs || []).map(normaliser),
      oui = ["oui", "vrai", "true"],
      non = ["non", "faux", "false"];
    if (
      valeursCondition.length &&
      valeursCondition.every((valeurNormalisee) => oui.includes(valeurNormalisee) || non.includes(valeurNormalisee))
    ) {
      const correspond =
        (valeursCondition.some((valeurNormalisee) => oui.includes(valeurNormalisee)) && valeur > 0) ||
        (valeursCondition.some((valeurNormalisee) => non.includes(valeurNormalisee)) && valeur <= 0);
      return cond.op === "!=" ? !correspond : correspond;
    }
  }
  // Comparaisons numériques
  if ([">", ">=", "<", "<="].includes(cond.op)) {
    const nombreSaisi = typeof valeur === "number" ? valeur : parseFloat(String(valeur ?? "").replace(",", "."));
    const nombreCondition = parseFloat(String((cond.valeurs || [])[0] ?? "").replace(",", "."));
    if (isNaN(nombreSaisi) || isNaN(nombreCondition)) return false;
    return cond.op === ">"
      ? nombreSaisi > nombreCondition
      : cond.op === ">="
        ? nombreSaisi >= nombreCondition
        : cond.op === "<"
          ? nombreSaisi < nombreCondition
          : nombreSaisi <= nombreCondition;
  }
  let liste, renseignee;
  if (typeof valeur === "boolean") {
    liste = valeur ? ["oui", "vrai", "true", "1"] : ["non", "faux", "false", "0"];
    renseignee = valeur;
  } else if (Array.isArray(valeur)) {
    liste = valeur[0] === "L" ? valeur.slice(1) : valeur;
    renseignee = liste.length > 0;
  } else {
    liste = valeur == null || valeur === "" ? [] : [String(valeur)];
    renseignee = liste.length > 0;
  }
  if (cond.op === "vide") return !renseignee;
  if (cond.op === "rempli") return !!renseignee;
  // Égalité : sans tenir compte des majuscules, des accents ni des espaces superflus
  const valeurs = liste.map(normaliser);
  const candidates = [...(cond.valeurs || []), ...(cond.brut ? [cond.brut] : [])];
  const trouve = candidates.some((candidate) => valeurs.includes(normaliser(candidate)));
  return cond.op === "!=" ? !trouve : trouve;
}

// Affiche ou masque les questions conditionnelles. Plusieurs passes, pour qu'une question
// conditionnée par une autre question elle-même conditionnelle suive correctement.
function afficherDiagnostic() {
  if (!$("diagnostic-conditions").open) return;
  const questions = etatSaisie.defsQuestions;
  const lignes = questions
    .filter((question) => question.condition)
    .map((question) => {
      const cible = resoudreColonne(question.condition.ref, questions);
      const bloc = document.querySelector(`[data-champ="q-${question.colId}"]`);
      const valeurCondition = cible ? valeurPourCondition("q", questions, question.condition) : undefined;
      const valeurAffichee =
        valeurCondition === undefined
          ? "—"
          : valeurCondition === null || valeurCondition === ""
            ? "(vide)"
            : Array.isArray(valeurCondition)
              ? (valeurCondition[0] === "L" ? valeurCondition.slice(1) : valeurCondition).join(", ") || "(vide)"
              : typeof valeurCondition === "boolean"
                ? valeurCondition
                  ? "coché"
                  : "non coché"
                : String(valeurCondition);
      const origine = !cible
        ? `<span class="ko">introuvable</span>`
        : `${esc(cible.def.libelle || cible.def.colId)} <small>(${esc(cible.def.colId)}${
            formuleCalculable(cible.def)
              ? ", formule calculée en direct"
              : cible.def.formule
                ? ", formule : valeur enregistrée, mise à jour après enregistrement"
                : cible.genre === "colonne"
                  ? ", hors formulaire : valeur enregistrée"
                  : ""
          })</small>`;
      const indicateurVisibilite =
        bloc && !bloc.hidden ? `<span class="ok">affichée</span>` : `<span class="ko">masquée</span>`;
      return `<tr><td>${esc(question.libelle)}</td><td><code>[si ${esc(question.condition.texte)}]</code></td><td>${origine}</td><td>${esc(valeurAffichee)}</td><td>${indicateurVisibilite}</td></tr>`;
    });
  $("diag-lignes").innerHTML = lignes.join("") || `<tr><td colspan="5">Aucune question conditionnelle.</td></tr>`;
}
$("diagnostic-conditions").addEventListener("toggle", afficherDiagnostic);
