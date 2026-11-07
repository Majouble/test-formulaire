/* =====================================================================
   PRISME — règles métier : conditions d'affichage des questions
   ---------------------------------------------------------------------
   Une question peut n'être affichée que sous condition. La condition s'écrit comme un repère, dans la description
   de la colonne Grist ou, pour un formulaire construit dans l'administration, dans les réglages de la question
   (réécrits en repères pour la saisie) :
     [si Colonne = A, B]   la colonne vaut A ou B          [si Colonne != A]   elle ne vaut pas A
     [si Colonne > 10]     comparaison de nombres (>, >=, <, <=)
     [si Colonne]          elle est renseignée (ou « n'est pas vide », « renseigné »)
     [si Colonne vide]     elle est vide (ou « est vide »)
   « : » vaut « = » quand aucun autre opérateur n'est présent ; ≠ vaut != ; guillemets autour d'une valeur ignorés.
   Mêmes règles pour le widget de saisie et pour l'aperçu et le mode test de l'administration : un seul code.
   Chargé par chaque page qui en a besoin, après commun/socle.js.

   Définit (sur window.Socle) : sansGuillemets, texteComparable, lireConditionRepere, evaluerCondition.
   ===================================================================== */
(function () {
  "use strict";

  // Guillemets droits, typographiques ou français autour d'une valeur : ignorés
  const sansGuillemets = (valeur) =>
    String(valeur)
      .trim()
      .replace(/^["'«“‘\s]+|["'»”’\s]+$/g, "")
      .trim();
  // Texte comparable : sans accents ni majuscules, apostrophes et espaces multiples ramenés à une espace
  const texteComparable = (texte) =>
    String(texte ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[’']/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  /* Condition écrite dans un texte (« … [si Colonne = A, B] … ») → { ref, op, valeurs, brut, texte }, null sans repère.
     brut : la valeur entière, pour un choix qui contient lui-même une virgule (« Intrusion, effraction »). */
  function lireConditionRepere(texte) {
    const correspondanceSi = String(texte || "").match(/\[\s*si\s+([^\]]+)\]/i);
    if (!correspondanceSi) return null;
    const corps = correspondanceSi[1].trim();
    let correspondance;
    if (
      (correspondance = corps.match(/^(.+?)\s*(!=|≠|>=|<=|=|>|<)\s*(.+)$/)) ||
      (correspondance = corps.match(/^([^:]+?)\s*(:)\s*(.+)$/))
    )
      return {
        ref: sansGuillemets(correspondance[1]),
        op: correspondance[2] === "≠" ? "!=" : correspondance[2] === ":" ? "=" : correspondance[2],
        brut: sansGuillemets(correspondance[3]),
        valeurs: correspondance[3]
          .split(/\s*,\s*/)
          .map(sansGuillemets)
          .filter(Boolean),
        texte: corps,
      };
    if (
      (correspondance = corps.match(
        /^(.+?)\s+(?:n['’]est\s+pas\s+vide|non\s+vide|est\s+renseign[ée]e?|renseign[ée]e?)$/i,
      ))
    )
      return { ref: sansGuillemets(correspondance[1]), op: "rempli", texte: corps };
    if ((correspondance = corps.match(/^(.+?)\s+(?:est\s+)?vide$/i)))
      return { ref: sansGuillemets(correspondance[1]), op: "vide", texte: corps };
    return { ref: sansGuillemets(corps), op: "rempli", texte: corps };
  }

  /* La valeur d'une colonne remplit-elle la condition ? valeur : nombre, booléen, texte, liste (format Grist
     ["L", …] ou tableau simple), ou null. */
  function evaluerCondition(valeur, condition) {
    // Nombre comparé à Oui / Non : « Oui » = supérieur à 0 (ex. [si Nb de blessés = Oui])
    if ((condition.op === "=" || condition.op === "!=") && typeof valeur === "number") {
      const valeursCondition = (condition.valeurs || []).map(texteComparable),
        oui = ["oui", "vrai", "true"],
        non = ["non", "faux", "false"];
      if (
        valeursCondition.length &&
        valeursCondition.every((valeurNormalisee) => oui.includes(valeurNormalisee) || non.includes(valeurNormalisee))
      ) {
        const correspond =
          (valeursCondition.some((valeurNormalisee) => oui.includes(valeurNormalisee)) && valeur > 0) ||
          (valeursCondition.some((valeurNormalisee) => non.includes(valeurNormalisee)) && valeur <= 0);
        return condition.op === "!=" ? !correspond : correspond;
      }
    }
    // Comparaisons numériques
    if ([">", ">=", "<", "<="].includes(condition.op)) {
      const nombreSaisi = typeof valeur === "number" ? valeur : parseFloat(String(valeur ?? "").replace(",", "."));
      const nombreCondition = parseFloat(String((condition.valeurs || [])[0] ?? "").replace(",", "."));
      if (isNaN(nombreSaisi) || isNaN(nombreCondition)) return false;
      return condition.op === ">"
        ? nombreSaisi > nombreCondition
        : condition.op === ">="
          ? nombreSaisi >= nombreCondition
          : condition.op === "<"
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
    if (condition.op === "vide") return !renseignee;
    if (condition.op === "rempli") return !!renseignee;
    // Égalité : sans tenir compte des majuscules, des accents ni des espaces superflus. La valeur entière compte
    // aussi (brut, ou à défaut les valeurs rejointes) : un choix qui contient une virgule reste reconnu.
    const valeurs = liste.map(texteComparable);
    const entiere = condition.brut ?? (condition.valeurs || []).join(", ");
    const candidates = [...(condition.valeurs || []), ...(entiere ? [entiere] : [])];
    const trouve = candidates.some((candidate) => valeurs.includes(texteComparable(candidate)));
    return condition.op === "!=" ? !trouve : trouve;
  }

  Object.assign(window.Socle, { sansGuillemets, texteComparable, lireConditionRepere, evaluerCondition });
})();
