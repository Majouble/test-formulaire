/* PRISME — widget de saisie, module 19/34 : Questions « tableau » : plusieurs lignes dans une même question ; structure, lecture et contrôle.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : tableaux, RESERVES_TABLEAU, nouvelIdLigne, videSous, lireTableauJson, colonnesDeTable,
     evaluerConditionLigne, zoneSousChamp, pastillesPossibles, texteSousValeur, syntheseTableau, TYPES_DECOMPTE,
     decomptable, modeSous, estQualifSous, valeursLigneTableau, texteAutoLigne, texteTableauDescription,
     versionDuJour, lignesPrecedentes, lignesExemple, Tableau.
   Utilise :
     02 utilitaires : normColonne.
     03 variantes : refId, varianteSaisie.
     04 date-faits : dateFr, secondes.
     05 etat : etatSaisie, valeurLigne.
     06 grist : avecRegles, lireMeta, metaColonnes.
     10 champs : horsBornes, lireUnChamp, optionsReference, typeBase.
     12 conditions-formules : evaluerCondition, resoudreColonne, texteComparable.
     16 description : famille, preparerRefSite.
     26 sites-esr : reprendreSitesAuto. */
/* =========================================================
   Questions « tableau » : plusieurs lignes dans une même question (ex. une ligne par blessé)
   ---------------------------------------------------------
   - Dans la table des signalements, une colonne texte porte le repère [tableau NomDeTable] : elle
     conserve, pour chaque version, la liste des lignes au format JSON (sans les champs confidentiels).
   - Les champs de chaque ligne sont les colonnes de la table NomDeTable (type, choix, libellé et
     repères de description : *, [si …], [liste], [boutons], [positif], [min], [max], [confidentiel]).
     Sont ignorées : les colonnes formules, Dossier (référence vers les signalements), Ligne_id, Ordre.
   - Table historisée (colonne Version, référence vers la table des signalements) : chaque version du signalement
     écrit sa propre copie des lignes (Dossier, Version, Ligne_id, Ordre, Mouvement + les champs). Mouvement compare
     à la version précédente du dossier : Ajout, Modification, Inchangée, ou Retrait (ligne retirée, recopiée avec ses
     dernières valeurs). Une correction de version réécrit les lignes de cette version. Stock = colonne formule
     Etat_actuel (lignes de la version la plus récente, hors retraits) ; flux = Mouvement par Date_version.
   - Table sans colonne Version (ancienne) : réécrite pour le dossier à partir de sa dernière version, une ligne Grist
     par ligne saisie (Dossier, Ligne_id, Ordre + les champs) ; aucun historique.
   - Les champs [confidentiel] ne sont enregistrés que dans NomDeTable (protégeables par une règle
     d'accès de colonne), jamais dans la colonne JSON, l'historique ni la description.
   ========================================================= */
const tableaux = {}; // identifiant du champ → contrôleur
const RESERVES_TABLEAU = ["id", "manualSort", "Ligne_id", "Ordre", "Version", "Mouvement"];
const nouvelIdLigne = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const videSous = (valeur) => valeur == null || valeur === "" || (Array.isArray(valeur) && !valeur.length);
function lireTableauJson(texteJson) {
  if (!texteJson || typeof texteJson !== "string") return [];
  try {
    const lignes = JSON.parse(texteJson);
    return Array.isArray(lignes) ? lignes.filter((ligne) => ligne && typeof ligne === "object") : [];
  } catch (_) {
    return [];
  }
}
// Colonnes d'une table, dans l'ordre de Grist
async function colonnesDeTable(tid) {
  const [tables, metaColonnesBrutes] = await lireMeta();
  const tRef = tables.id[tables.tableId.indexOf(tid)];
  if (tRef == null) return null;
  const colonnes = [];
  for (let i = 0; i < metaColonnesBrutes.id.length; i++) {
    if (metaColonnesBrutes.parentId[i] !== tRef) continue;
    let options = {};
    try {
      options = JSON.parse(metaColonnesBrutes.widgetOptions[i] || "{}");
    } catch (_) {
      // options illisibles : valeurs par défaut
    }
    const visible = metaColonnesBrutes.visibleCol ? metaColonnesBrutes.visibleCol[i] : 0;
    colonnes.push({
      colId: metaColonnesBrutes.colId[i],
      libelle: metaColonnesBrutes.label[i],
      type: metaColonnesBrutes.type[i],
      opts: options,
      description: (metaColonnesBrutes.description && metaColonnesBrutes.description[i]) || "",
      formule: !!(metaColonnesBrutes.isFormula && metaColonnesBrutes.isFormula[i] && metaColonnesBrutes.formula[i]),
      colAffichee: visible ? metaColonnesBrutes.colId[metaColonnesBrutes.id.indexOf(visible)] : null,
      pos: metaColonnesBrutes.parentPos ? metaColonnesBrutes.parentPos[i] : i,
    });
  }
  return colonnes.sort((a, b) => a.pos - b.pos);
}
function evaluerConditionLigne(cond, sousDefs, valeurs) {
  const referenceNormalisee = texteComparable(cond.ref);
  const colonneCondition =
    sousDefs.find((sousDefinition) => sousDefinition.colId === cond.ref) ||
    sousDefs.find(
      (sousDefinition) =>
        texteComparable(sousDefinition.colId) === referenceNormalisee ||
        texteComparable(sousDefinition.libelle) === referenceNormalisee,
    );
  if (!colonneCondition) return true; // colonne inconnue : le champ reste affiché
  const valeur = valeurs[colonneCondition.colId];
  return evaluerCondition(Array.isArray(valeur) ? ["L", ...valeur] : valeur, cond);
}
// Rangement d'un champ dans la ligne : en tête (champs courts), sur sa propre ligne (choix multiples), ou en bas (textes)
function zoneSousChamp(sousDefinition) {
  const typeColonne = typeBase(sousDefinition.type),
    choix = (sousDefinition.opts && sousDefinition.opts.choices) || [];
  if (typeColonne === "ChoiceList" || typeColonne === "RefList") return "large";
  // choix unique en pastilles (plus de 5 options) : sur sa propre ligne, comme les choix multiples
  if (
    typeColonne === "Choice" &&
    choix.length &&
    sousDefinition.forcer !== "liste" &&
    !(sousDefinition.forcer === "boutons" || choix.length <= 5) &&
    pastillesPossibles(sousDefinition)
  )
    return "large";
  if (["Choice", "Bool", "Numeric", "Int", "Date", "DateTime", "Ref"].includes(typeColonne)) return "tete";
  return "texte";
}
const pastillesPossibles = (sousDefinition) => {
  const choix = (sousDefinition.opts && sousDefinition.opts.choices) || [];
  if (sousDefinition.forcer === "liste") return false;
  if (sousDefinition.forcer === "boutons") return true;
  if (varianteSaisie().pastilles === "toujours") return true; // toujours des pastilles, quel que soit le nombre de choix ([liste] pour un menu déroulant)
  return choix.length <= 8 && choix.join("").length <= 70; // au-delà : menu déroulant
};
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
// Version précédente du dossier, si elle est du même jour (un nouveau dossier chaque jour) : base de comparaison
function versionDuJour() {
  if (!etatSaisie.dossierId || !etatSaisie.derniere) return false;
  const secondesDate = secondes(valeurLigne(etatSaisie.derniere, "Date"));
  if (secondesDate == null) return true;
  const jour = (date) => date.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });
  return jour(new Date(secondesDate * 1000)) === jour(new Date());
}
const lignesPrecedentes = (questionTableau) =>
  questionTableau.tableau && versionDuJour() ? lireTableauJson(etatSaisie.derniere[questionTableau.colId]) : null;
function lignesExemple(questionTableau) {
  // deux lignes fictives pour l'exemple des réglages
  return [0, 1].map((k) => {
    const ligneExemple = {};
    for (const sousDefinition of questionTableau._sousDefs || []) {
      const typeColonne = typeBase(sousDefinition.type),
        choix = (sousDefinition.opts && sousDefinition.opts.choices) || [];
      if (typeColonne === "Choice") ligneExemple[sousDefinition.colId] = choix[k % Math.max(choix.length, 1)] || "Oui";
      else if (typeColonne === "ChoiceList")
        ligneExemple[sousDefinition.colId] = choix.length ? [choix[k % choix.length]] : null;
      else if (typeColonne === "Bool") ligneExemple[sousDefinition.colId] = k === 0;
      else if (typeColonne === "Numeric" || typeColonne === "Int") ligneExemple[sousDefinition.colId] = k + 1;
      else if (typeColonne === "Date" || typeColonne === "DateTime")
        ligneExemple[sousDefinition.colId] = Math.floor(Date.now() / 86400000) * 86400;
      else if (typeColonne === "Ref" || typeColonne === "RefList") ligneExemple[sousDefinition.colId] = null;
      else ligneExemple[sousDefinition.colId] = k === 0 ? "texte saisi" : "autre texte";
    }
    return ligneExemple;
  });
}

class Tableau {
  constructor(definition, prefix, conteneur, surChangement) {
    Object.assign(this, {
      def: definition,
      prefix,
      el: conteneur,
      surChangement,
      id: `${prefix}-${definition.colId}`,
      lignes: [],
      sousDefs: [],
      pret: false,
      erreur: "",
      confLisible: true,
      montrerErreurs: false,
    });
    this.ecouter();
    this.promesse = this.preparer();
  }
  async preparer() {
    const tid = this.def.tableau.table;
    let colonnesTable = null;
    try {
      colonnesTable = await colonnesDeTable(tid);
    } catch (erreur) {
      console.warn("PRISME saisie : table de la question « tableau » illisible", erreur);
    }
    if (!colonnesTable) {
      this.erreur = `Table « ${tid} » introuvable : vérifiez le repère [tableau ${tid}] dans la description de la colonne « ${this.def.libelle} ».`;
      this.dessiner();
      return;
    }
    this.table = tid;
    this.colDossier =
      (
        colonnesTable.find((colonne) => colonne.colId === "Dossier") ||
        colonnesTable.find((colonne) => colonne.type === `Ref:${etatSaisie.tableId}` && colonne.colId !== "Version") ||
        {}
      ).colId || null;
    this.colLigne = colonnesTable.some((colonne) => colonne.colId === "Ligne_id") ? "Ligne_id" : null;
    this.colOrdre = colonnesTable.some((colonne) => colonne.colId === "Ordre") ? "Ordre" : null;
    // historique : une copie des lignes par version (colonne Version vers la table des signalements)
    this.colVersion = colonnesTable.some(
      (colonne) => colonne.colId === "Version" && colonne.type === `Ref:${etatSaisie.tableId}`,
    )
      ? "Version"
      : null;
    this.colMouvement =
      this.colVersion && colonnesTable.some((colonne) => colonne.colId === "Mouvement") ? "Mouvement" : null;
    this.sousDefs = colonnesTable
      .filter(
        (colonne) =>
          !colonne.formule &&
          !RESERVES_TABLEAU.includes(colonne.colId) &&
          colonne.colId !== this.colDossier &&
          !colonne.colId.startsWith("gristHelper"),
      )
      .map(avecRegles)
      .filter((sousDefinition) => !sousDefinition.masque); // [masqué] : colonne absente du formulaire (sa valeur dans la table est conservée)
    // [ordre N] : les champs numérotés d'abord, dans cet ordre, puis les autres dans l'ordre des colonnes de Grist
    this.ordonne = this.sousDefs.some((sousDefinition) => sousDefinition.ordre != null);
    if (this.ordonne)
      this.sousDefs = this.sousDefs
        .map((sousDefinition, i) => [sousDefinition, i])
        .sort((a, b) => (a[0].ordre ?? 1e9) - (b[0].ordre ?? 1e9) || a[1] - b[1])
        .map(([sousDefinition]) => sousDefinition);
    for (const sousDefinition of this.sousDefs)
      if (["Ref", "RefList"].includes(typeBase(sousDefinition.type))) {
        try {
          sousDefinition._options = await optionsReference({ ...sousDefinition });
        } catch (_) {
          sousDefinition._options = [];
        }
      }
    // tableau des sites : colonne du site (référence au référentiel des sites, ou identifiant texte), nom hors
    // référentiel, qualification du site ; historique d'autres questions (anciens formulaires) pour la reprise
    const reglageSites = this.def.tableau && this.def.tableau.sites,
      colonneSiExiste = (identifiantColonne) =>
        identifiantColonne && colonnesTable.some((colonne) => colonne.colId === identifiantColonne)
          ? identifiantColonne
          : null;
    /* colonne renommée par Grist d'après son libellé (Site_libre → Site_hors_referentiel, Qualification →
 Qualification_du_site : tables créées par les versions 2.14.0 à 2.14.2) : retrouvée par son type et son nom */
    const parNom = (motif, motifType) =>
      (
        colonnesTable.find(
          (colonne) =>
            !RESERVES_TABLEAU.includes(colonne.colId) &&
            motifType.test(colonne.type || "") &&
            motif.test(normColonne(`${colonne.colId} ${colonne.libelle || ""}`)),
        ) || {}
      ).colId || null;
    const sSite = reglageSites && (colonneSiExiste(reglageSites.site) || parNom(/(^|_)site/, /^Ref:/)),
      sLibre =
        reglageSites && reglageSites.libre
          ? colonneSiExiste(reglageSites.libre) || parNom(/libre|hors_referentiel/, /^Text/)
          : null; // « — » dans l'administration : pas de nom libre
    const sQualif = reglageSites && (colonneSiExiste(reglageSites.qualif) || parNom(/qualif/, /^Choice/));
    this.sites =
      reglageSites && (sSite || sLibre)
        ? {
            site: sSite,
            libre: sLibre,
            qualif: sQualif,
            avecRas: reglageSites.avecRas !== false, // reprise du dernier état des sites : "auto" (ancien réglage true), "bouton" (à la demande), "non" (par défaut)
            reprise:
              reglageSites.reprise === true || reglageSites.reprise === "auto"
                ? "auto"
                : reglageSites.reprise === "bouton"
                  ? "bouton"
                  : "non",
            historique: Array.isArray(reglageSites.historique)
              ? reglageSites.historique.filter((repere) => repere && repere.colonne)
              : [],
            alias: reglageSites.alias || "Sites_correspondances",
          }
        : null;
    this.alias = new Map();
    this.aliasParSite = new Map();
    // colonnes qui désignent un site du référentiel (table des sites reliée aux établissements) : sites de l'établissement
    // du formulaire seulement, champ de recherche (nom, mots-clés, commune) au lieu d'un menu de tous les sites
    for (const sousDefinition of this.sousDefs)
      if (typeBase(sousDefinition.type) === "Ref") await preparerRefSite(sousDefinition);
    if (this.sites && this.sites.site) {
      // tableau des sites : une autre colonne de site (créée en double) est écartée du formulaire
      const enDouble = this.sousDefs.filter(
        (sousDefinition) => sousDefinition._siteEtab && sousDefinition.colId !== this.sites.site,
      );
      if (enDouble.length) {
        this.sousDefs = this.sousDefs.filter((sousDefinition) => !enDouble.includes(sousDefinition));
        this.doublons = enDouble.map((sousDefinition) =>
          sousDefinition.libelle && sousDefinition.libelle !== sousDefinition.colId
            ? `${sousDefinition.libelle} (${sousDefinition.colId})`
            : sousDefinition.colId,
        );
      }
    }
    if (this.sites) {
      // correspondances validées : libellé saisi (par établissement) → site du référentiel
      try {
        const metaAlias = await metaColonnes(this.sites.alias);
        if (metaAlias && metaAlias.Libelle && metaAlias.Site) {
          const tableAlias = await Donnees.lire(this.sites.alias);
          tableAlias.id.forEach((id, i) => {
            if (/cart/i.test(String((tableAlias.Statut || [])[i] || ""))) return;
            const idSite = refId(tableAlias.Site[i]);
            if (!idSite) return;
            this.alias.set(
              `${refId((tableAlias.Etablissement || [])[i]) || 0}|${texteComparable(tableAlias.Libelle[i])}`,
              idSite,
            );
            if (!this.aliasParSite.has(idSite)) this.aliasParSite.set(idSite, []);
            this.aliasParSite.get(idSite).push(String(tableAlias.Libelle[i] ?? ""));
          });
        }
      } catch (_) {
        /* sans correspondances */
      }
    }
    const manque = [
      !this.colDossier && "Dossier (référence vers la table des signalements)",
      !this.colLigne && "Ligne_id (texte)",
    ].filter(Boolean);
    this.avertissement = manque.length
      ? `Table « ${tid} » : ajoutez la colonne ${manque.join(" et la colonne ")} pour qu'elle soit tenue à jour.`
      : "";
    if (this.doublons)
      this.avertissement = [
        this.avertissement,
        `Colonne${this.doublons.length > 1 ? "s" : ""} « ${this.doublons.join(" », « ")} » de la table « ${tid} » écartée${this.doublons.length > 1 ? "s" : ""} du formulaire : elle désigne aussi un site, en double avec « ${(this.sousDefs.find((sousDefinition) => sousDefinition.colId === this.sites.site) || {}).libelle || this.sites.site} » (voir l'administration des formulaires).`,
      ]
        .filter(Boolean)
        .join(" ");
    this.autos = this.sousDefs.filter(
      (sousDefinition) => sousDefinition.auto && typeBase(sousDefinition.type) === "Text",
    );
    // site du référentiel et nom libre réunis en un seul champ (le nom libre seulement si le tableau des sites a sa colonne)
    this.combo = !!(
      this.sites &&
      this.sites.site &&
      this.sites.libre &&
      this.sousDefs.some((sousDefinition) => sousDefinition.colId === this.sites.site && sousDefinition._siteEtab)
    );
    this.def._sousDefs = this.sousDefs;
    this.pret = true;
    this.dessiner();
    if (this.sites) setTimeout(reprendreSitesAuto, 0);
  }
  // ----- nombre de lignes piloté par une colonne nombre : lignes= du repère, sinon colonne de la condition [si …]
  colonneNombre() {
    const referenceColonne =
      (this.def.tableau && this.def.tableau.lignes) || (this.def.condition && this.def.condition.ref);
    if (!referenceColonne) return null;
    const questions =
      this.prefix === "q" ? etatSaisie.defsQuestions : this.prefix === "vd" ? etatSaisie.defsDep : etatSaisie.defsAca;
    const colonneCible = resoudreColonne(referenceColonne, questions);
    return colonneCible && ["Numeric", "Int"].includes(typeBase(colonneCible.def.type)) ? colonneCible : null;
  }
  nombreAttendu() {
    const colonneCible = this.colonneNombre();
    if (!colonneCible) return null;
    let valeur = null;
    if (colonneCible.genre === "question" && !colonneCible.def.formule) {
      const bloc = document.querySelector(`[data-champ="${this.prefix}-${colonneCible.def.colId}"]`);
      valeur = bloc && !bloc.hidden ? lireUnChamp(this.prefix, colonneCible.def) : null;
    } else {
      const ligneVersion = etatSaisie.derniere || etatSaisie.initiale;
      valeur = ligneVersion ? ligneVersion[colonneCible.def.colId] : null;
    }
    return typeof valeur === "number" && valeur > 0 ? Math.min(200, Math.floor(valeur)) : 0;
  }
  // Ajoute des lignes vides jusqu'au nombre indiqué ; en cas de baisse, ne retire que des lignes vides
  ajuster() {
    if (!this.pret) return;
    const nombre = this.nombreAttendu();
    if (nombre == null || nombre === this.dernierN) return;
    this.dernierN = nombre;
    let change = false;
    while (this.lignes.length < nombre) {
      this.lignes.push({ _id: nouvelIdLigne(), valeurs: {} });
      change = true;
    }
    while (this.lignes.length > nombre && this.ligneVide(this.lignes[this.lignes.length - 1])) {
      this.lignes.pop();
      change = true;
    }
    if (change) this.dessiner();
    else this.majLignes();
  }
  // ----- état
  visible(ligne, sousDefinition) {
    return !sousDefinition.condition || evaluerConditionLigne(sousDefinition.condition, this.sousDefs, ligne.valeurs);
  }
  ligneVide(ligne) {
    return this.sousDefs.every(
      (sousDefinition) => !this.visible(ligne, sousDefinition) || videSous(ligne.valeurs[sousDefinition.colId]),
    );
  }
  lignesValides() {
    return this.lignes.filter((ligne) => !this.ligneVide(ligne));
  }
  valeur() {
    // JSON enregistré dans la colonne de la version (sans champs confidentiels ni champs masqués)
    const lignesJson = this.lignesValides().map((ligne) => {
      const ligneJson = { _id: ligne._id };
      for (const sousDefinition of this.sousDefs)
        if (
          !sousDefinition.confidentiel &&
          this.visible(ligne, sousDefinition) &&
          !videSous(ligne.valeurs[sousDefinition.colId])
        )
          ligneJson[sousDefinition.colId] = ligne.valeurs[sousDefinition.colId];
      return ligneJson;
    });
    return lignesJson.length ? JSON.stringify(lignesJson) : "";
  }
  async charger(json, dossier) {
    await this.promesse;
    const valeursConfidentielles = await this.lireConfidentiels(dossier);
    this.lignes = lireTableauJson(json).map((ligneJson) => {
      const { _id, ...valeurs } = ligneJson;
      const id = _id || nouvelIdLigne();
      return {
        _id: id,
        valeurs: { ...valeurs, ...(valeursConfidentielles.get(id) || {}) },
        ...(this.sites && dossier ? { _fixe: true } : {}),
      };
    });
    this.lignes.forEach((ligne) => this.initAuto(ligne));
    this.montrerErreurs = false;
    this.confModifie = false;
    this.dernierN = undefined;
    this.supprimes = [];
    this.dessiner();
  }
  async lireConfidentiels(dossier) {
    const valeursParLigne = new Map();
    const confs = this.sousDefs.filter((sousDefinition) => sousDefinition.confidentiel);
    this.confLisible = true;
    if (!dossier || !confs.length || !this.colDossier || !this.colLigne) return valeursParLigne;
    try {
      const tableGrist = await Donnees.lire(this.table);
      if (confs.some((sousDefinition) => !(sousDefinition.colId in tableGrist))) this.confLisible = false;
      // table historisée : les lignes de la version la plus récente qui en a (sinon les lignes sans version)
      const duDossier = tableGrist.id
        .map((_, i) => i)
        .filter((i) => refId(tableGrist[this.colDossier][i]) === dossier || tableGrist[this.colDossier][i] === dossier);
      const vDe = (i) =>
        this.colVersion && tableGrist[this.colVersion] ? refId(tableGrist[this.colVersion][i]) || 0 : 0;
      const vMax = Math.max(0, ...duDossier.map(vDe));
      tableGrist.id.forEach((id, i) => {
        if (refId(tableGrist[this.colDossier][i]) !== dossier && tableGrist[this.colDossier][i] !== dossier) return;
        if (
          vDe(i) !== vMax ||
          (this.colMouvement && tableGrist[this.colMouvement] && tableGrist[this.colMouvement][i] === "Retrait")
        )
          return;
        const valeursLigne = {};
        for (const sousDefinition of confs) {
          const valeurBrute = tableGrist[sousDefinition.colId] ? tableGrist[sousDefinition.colId][i] : undefined;
          if (valeurBrute === undefined || (Array.isArray(valeurBrute) && valeurBrute[0] === "C")) {
            this.confLisible = false;
            continue;
          }
          valeursLigne[sousDefinition.colId] = this.depuisGrist(sousDefinition, valeurBrute);
        }
        valeursParLigne.set(tableGrist[this.colLigne][i], valeursLigne);
      });
    } catch (_) {
      this.confLisible = false;
    }
    return valeursParLigne;
  }
  depuisGrist(sousDefinition, valeurGrist) {
    const typeColonne = typeBase(sousDefinition.type);
    if (Array.isArray(valeurGrist) && valeurGrist[0] === "L") return valeurGrist.slice(1);
    if (typeColonne === "Ref") return valeurGrist || null;
    return valeurGrist === "" ? null : valeurGrist;
  }
  versGrist(sousDefinition, valeur) {
    const typeColonne = typeBase(sousDefinition.type);
    if (videSous(valeur)) return typeColonne === "Bool" ? false : typeColonne === "Ref" ? 0 : null;
    if (typeColonne === "ChoiceList" || typeColonne === "RefList") return ["L", ...valeur];
    if (typeColonne === "Ref") return +valeur || 0;
    return valeur;
  }
  // ----- contrôles
  verifier() {
    // messages des lignes incomplètes (sans rien marquer)
    const messages = [];
    this.lignes.forEach((ligne, k) => {
      if (this.ligneVide(ligne)) return;
      const problemes = this.sousDefs
        .filter((sousDefinition) => this.visible(ligne, sousDefinition) && this.erreurChamp(ligne, sousDefinition))
        .map((sousDefinition) => sousDefinition.libelle || sousDefinition.colId);
      if (problemes.length) messages.push(`ligne ${k + 1} : ${problemes.join(", ")}`);
    });
    return messages;
  }
  erreurChamp(ligne, sousDefinition) {
    const valeur = ligne.valeurs[sousDefinition.colId];
    // site obligatoire : un nom hors référentiel (colonne du nom libre) le renseigne aussi
    const libre = sousDefinition._siteEtab && this.colLibre(sousDefinition),
      parLibre = libre && !videSous(ligne.valeurs[libre]);
    if (
      sousDefinition.obligatoire &&
      videSous(valeur) &&
      !parLibre &&
      !(sousDefinition.confidentiel && !this.confLisible)
    )
      return "À préciser";
    if (typeof valeur === "number" && horsBornes(sousDefinition, valeur))
      return `Valeur ${horsBornes(sousDefinition, valeur)} attendue`;
    return "";
  }
  marquer() {
    this.montrerErreurs = true;
    this.majLignes();
    const ligneIncomplete = this.el.querySelector(".ligne-rep.incomplete");
    if (ligneIncomplete) {
      ligneIncomplete.scrollIntoView({ block: "center" });
      const champIncomplet = ligneIncomplete.querySelector(
        "[aria-invalid] input, [aria-invalid], input, select, textarea",
      );
      if (champIncomplet) champIncomplet.focus();
    }
  }
}
