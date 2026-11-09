/* =====================================================================
   PRISME — règles métier : circuit de validation (onglet Validation de l'administration)
   ---------------------------------------------------------------------
   Viseurs : agents (compte Grist ou lien d'invité) dont Echelon_visa est renseigné. Un viseur départemental pose le visa
   départemental sur les établissements des départements de Visa_departements ; un viseur académique, le visa académique
   sur ceux des académies de Visa_academies (et, si le réglage le permet, le visa départemental) ; liste vide = tous.
   Réglages par table de réponses : clé « validation » de Config = { tables: { <table>: { actif, echelons: "dep_aca" | "aca",
   verdict_dep, verdict_aca (colonnes Choix des parties de visa), favorables: [valeurs], aca_vise_dep, colonne } } }.
   Statut du dossier : colonne formule (Statut_validation), calculée sur la dernière version ; une mise à jour du dossier
   crée une nouvelle version, sans visa : le dossier repart dans la file du premier échelon.
   Chargé par chaque page, après commun/socle.js.

   Définit (sur window.Socle) : ECHELONS_VISA, COLONNES_VISEURS, STATUTS_VALIDATION, STATUT, COLONNE_STATUT,
     MARQUE_STATUT, estFavorable, reglagesValidation, optionsStatutValidation, formuleStatutValidation,
     statutValidation, viseurCouvre.
   Utilise (window.Socle) : json.
   ===================================================================== */
(function () {
  "use strict";

  const { json } = window.Socle;

  const ECHELONS_VISA = ["Départemental", "Académique"];
  const COLONNES_VISEURS = [
    { id: "Echelon_visa", type: "Choice", widgetOptions: json({ choices: ECHELONS_VISA }) },
    { id: "Visa_departements", type: "ChoiceList" },
    { id: "Visa_academies", type: "ChoiceList" },
  ];
  const STATUTS_VALIDATION = [
    { nom: "À viser (département)", fond: "#FEECC2", texte: "#716043", echelon: "Départemental" },
    { nom: "À viser (académie)", fond: "#E8EDFF", texte: "#000091", echelon: "Académique" },
    { nom: "À revoir", fond: "#FFE9E6", texte: "#CE0500" },
    { nom: "Validé", fond: "#B8FEC9", texte: "#18753C" },
  ];
  const STATUT = {
    dep: STATUTS_VALIDATION[0].nom,
    aca: STATUTS_VALIDATION[1].nom,
    revoir: STATUTS_VALIDATION[2].nom,
    valide: STATUTS_VALIDATION[3].nom,
  };
  const COLONNE_STATUT = "Statut_validation";
  const MARQUE_STATUT = "# Statut de validation (socle v2.41)";
  const FAVORABLE = /favorable|valid|accord|conforme|^ok$|^oui$|vis[ée]/i;
  const DEFAVORABLE = /d[ée]favorable|non|refus|revoir|incomplet/i;
  const estFavorable = (avis) => FAVORABLE.test(String(avis || "")) && !DEFAVORABLE.test(String(avis || ""));
  // Réglage d'une table (null si le circuit n'y est pas actif)
  function reglagesValidation(config, table) {
    const tables = config && config.valeurs && config.valeurs.validation && config.valeurs.validation.tables;
    const reglages = tables && table && tables[table];
    if (!reglages || !reglages.actif) return null;
    return {
      echelons: reglages.echelons === "aca" ? "aca" : "dep_aca",
      verdict_dep: reglages.verdict_dep || "",
      verdict_aca: reglages.verdict_aca || "",
      favorables: Array.isArray(reglages.favorables) ? reglages.favorables.map(String) : [],
      aca_vise_dep: reglages.aca_vise_dep !== false,
      colonne: reglages.colonne || COLONNE_STATUT,
    };
  }
  const optionsStatutValidation = () =>
    json({
      choices: STATUTS_VALIDATION.map((statut) => statut.nom),
      choiceOptions: Object.fromEntries(
        STATUTS_VALIDATION.map((statut) => [statut.nom, { fillColor: statut.fond, textColor: statut.texte }]),
      ),
    });
  // Formule du statut d'après les réglages de la table et ses colonnes associées (colonnes.Derniere_version)
  function formuleStatutValidation(reglages, colonnes) {
    const colonneDerniereVersion = colonnes && colonnes.Derniere_version,
      colonneVerdictDepartement = reglages.echelons === "dep_aca" && reglages.verdict_dep;
    return [
      `${MARQUE_STATUT} — réglé dans l'onglet Validation de l'administration`,
      ...(colonneDerniereVersion ? [`if not $${colonneDerniereVersion}:`, `  return None`] : []),
      `FAVORABLES = ${JSON.stringify(reglages.favorables)}`,
      `def avis(v):`,
      `  v = " ".join(str(x) for x in v) if isinstance(v, (list, tuple)) else str(v or "")`,
      `  v = v.strip()`,
      `  if not v:`,
      `    return None`,
      `  return "ok" if v in FAVORABLES else "ko"`,
      reglages.verdict_aca ? `aca = avis($${reglages.verdict_aca})` : `aca = None`,
      colonneVerdictDepartement ? `dep = avis($${reglages.verdict_dep})` : `dep = "ok"`,
      `if aca == "ok":`,
      `  return ${JSON.stringify(STATUT.valide)}`,
      `if aca == "ko" or dep == "ko":`,
      `  return ${JSON.stringify(STATUT.revoir)}`,
      `if dep == "ok":`,
      `  return ${JSON.stringify(STATUT.aca)}`,
      `return ${JSON.stringify(STATUT.dep)}`,
    ].join("\n");
  }
  // Statut attendu calculé en JavaScript (mêmes règles que la formule) : pour les contrôles et les essais
  function statutValidation(reglages, ligne) {
    const avis = (valeur) => {
      const texte = (
        Array.isArray(valeur)
          ? valeur.filter((element) => element !== "L").join(" ")
          : String(valeur == null ? "" : valeur)
      ).trim();
      return !texte ? null : reglages.favorables.includes(texte) ? "ok" : "ko";
    };
    const avisAcademie = reglages.verdict_aca ? avis(ligne[reglages.verdict_aca]) : null,
      avisDepartement =
        reglages.echelons === "dep_aca" && reglages.verdict_dep ? avis(ligne[reglages.verdict_dep]) : "ok";
    return avisAcademie === "ok"
      ? STATUT.valide
      : avisAcademie === "ko" || avisDepartement === "ko"
        ? STATUT.revoir
        : avisDepartement === "ok"
          ? STATUT.aca
          : STATUT.dep;
  }
  // Le viseur ({ echelon, departements, academies }) peut-il viser cet établissement à cet échelon (« dep » | « aca ») ?
  function viseurCouvre(viseur, echelonVisa, departement, academie, reglages) {
    if (!viseur || !viseur.echelon) return false;
    const dans = (liste, valeur) => !liste || !liste.length || liste.includes(String(valeur || ""));
    if (echelonVisa === "aca") return viseur.echelon === "Académique" && dans(viseur.academies, academie);
    if (viseur.echelon === "Départemental") return dans(viseur.departements, departement);
    return viseur.echelon === "Académique" && (!reglages || reglages.aca_vise_dep) && dans(viseur.academies, academie);
  }

  Object.assign(window.Socle, {
    ECHELONS_VISA,
    COLONNES_VISEURS,
    STATUTS_VALIDATION,
    STATUT,
    COLONNE_STATUT,
    MARQUE_STATUT,
    estFavorable,
    reglagesValidation,
    optionsStatutValidation,
    formuleStatutValidation,
    statutValidation,
    viseurCouvre,
  });
})();
