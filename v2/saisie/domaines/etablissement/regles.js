/* PRISME — widget de saisie, domaines/etablissement/regles.js
   Domaine : l'établissement : référentiel (et sa copie locale), fiche, mail et lien d'accès, correction — règles
   (calculs, sans page ni Grist).
   Chargé par saisie/index.html dans l'ordre : fondations, composants, domaines, demarrage.js. Les fichiers partagent
   leurs noms (scripts classiques, sans import) : au chargement, un fichier ne fait que définir. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : MESSAGE, ORIGINE, RECONNAISSANCE_ETAB, calculerColonnesEtabReconnues, reconnaitreColonnesEtab,
     appliquerColonnesForcees, ROLES_FICHE, colonneChampFiche, valeurChampFiche, libelleChampFiche, valeursEtab,
     REGIONS_ACADEMIQUES, cleAcademie, REGION_PAR_ACADEMIE, colonneRegion, regionAcademique, CHAMPS_NOUVEL_ETAB,
     etabDe, cleTexteEtab, etabParTexte, trouverColNomReponses, texteEtabBrut, etabDeLigne, nomEtabLigne,
     calculerDiagnosticSignalements, calculerCibleEtab, decisionTableEtab, alerteLiensEtab, lienEtabAcompleter,
     calculerIndexEtabs, calculerModeEtab, calculerTexteAlerteStructure, infoSection, calculerRattachementSection,
     colRattachement, rattachementDe, versEtablissement, nomEtabId, extraireUrl, nettoieMail, construireMailto,
     etabParUai, etablissementDuFormulaire, lieuDe, campagnesDeLEtab.
   Utilise :
     fondations/configuration : COLONNES_ETAB_DEFAUT, ETAB, TABLE_ETAB_DEFAUT, colonnesEtab.
     fondations/outils : celluleRemplie, colonneDe, lisible, normColonne, refId, sansAccents, valeurLigne.
     fondations/etat : etatSaisie.
     domaines/formulaire/regles : reconnaitreColonnesSignalement, varianteSaisie.
     domaines/etablissement/donnees : liensDemandes, lireMetaColonnesEtab.
   Modifie etatSaisie : colNomReponses, colonnesParContenu, colonnesReconnues, composanteChoisie, etabsIndexTexte,
     indexTexteEtabs, sectionCalculee. */
// Message proposé à l'envoi du lien (s'ouvre dans la messagerie de l'agent)
const MESSAGE = {
  objet: (etab) => `Signalement concernant ${etab} : accès à votre formulaire`,
  corps: (etab, lien) =>
    `Bonjour,

Un espace de suivi des signalements a été ouvert pour ${etab}. Il vous permet de consulter, compléter et suivre vos signalements :

${lien}

Ce lien est propre à votre établissement : merci de ne pas le diffuser en dehors de l'équipe de direction.

Cordialement,`,
};
const ORIGINE = { EN: "Annuaire EN", ESR: "Annuaire ESR", manuel: "Manuel" };
const RECONNAISSANCE_ETAB = {
  uai: {
    motifs: [/^uai$/, /(^|_)(uai|rne)(_|$)/, /^code_etab/, /identifiant.*etab/],
    sauf: /tutelle|siege|rattach|parent/,
  },
  nom: {
    motifs: [
      /^nom$/,
      /appellation/,
      /^(nom|libelle|denomination|intitule)_(de_l_|de_|d_)?etab/,
      /denomination|raison_sociale/,
      /^(nom|libelle|intitule)(_|$)/,
      /^etablissement$/,
      /etablissement/,
    ],
    sauf: /commune|ville|academi|departement|region|contact|responsable|chef|direct|president|type|sigle|uai|rne|tutelle|mail|code|^id/,
  },
  commune: {
    motifs: [/^(nom_|libelle_)?(de_la_)?commune$/, /commune/, /ville|localite/],
    sauf: /code|insee|^id|postal/,
  },
  type: {
    motifs: [/^type$/, /^type_(d_)?etab/, /^type/, /nature|categorie|typologie/],
    sauf: /code|^id|contrat/,
  },
  academie: { motifs: [/^(nom_|libelle_)?(de_l_)?academie$/, /academie/], sauf: /code|^id|region/ },
  departement: { motifs: [/^(nom_|libelle_)?(du_)?departement$/, /departement/], sauf: /code|^id|numero/ },
  mail: { motifs: [/^(mail|courriel|e_?mail)$/, /mail|courriel/], sauf: /annuaire|contact_2|secondaire/ },
};
// Calcule les colonnes reconnues de la table des établissements (nom des champs → colonne, et ceux trouvés par le contenu)
function calculerColonnesEtabReconnues(donneesTable, meta) {
  const colonnesCourantes = { ...colonnesEtab };
  const trouvees = {};
  const parContenu = [];
  const colonnes = Object.keys(donneesTable).filter(
    (colonne) => colonne !== "id" && colonne !== "manualSort" && !colonne.startsWith("gristHelper"),
  );
  const noms = (colonne) =>
    [normColonne(colonne), normColonne(meta && meta[colonne] && meta[colonne].libelle)].filter(Boolean);
  const pris = new Set(Object.values(COLONNES_ETAB_DEFAUT).filter((colonne) => colonnes.includes(colonne)));
  const texte = (colonne) => {
    const valeursNonVides = (donneesTable[colonne] || []).filter((valeur) => valeur != null && valeur !== "");
    return valeursNonVides.length
      ? valeursNonVides.filter((valeur) => typeof valeur === "string").length / valeursNonVides.length
      : 0;
  };
  const uaiContenu = (colonne) => {
    const valeursTexte = (donneesTable[colonne] || []).filter((valeur) => typeof valeur === "string" && valeur.trim());
    return valeursTexte.length
      ? valeursTexte.filter((valeur) => /^\d{7}[a-z]$/i.test(valeur.trim())).length / valeursTexte.length
      : 0;
  };
  for (const [k, reconnaissance] of Object.entries(RECONNAISSANCE_ETAB)) {
    if (colonnes.includes(colonnesCourantes[k])) continue;
    let trouve = null;
    for (const motif of reconnaissance.motifs) {
      const cands = colonnes.filter(
        (colonne) =>
          !pris.has(colonne) &&
          noms(colonne).some((nomNormalise) => motif.test(nomNormalise) && !reconnaissance.sauf.test(nomNormalise)),
      );
      if (cands.length) {
        trouve = cands.sort((a, b) => texte(b) - texte(a))[0];
        break;
      }
    }
    if (!trouve && k === "uai")
      trouve =
        colonnes
          .filter((colonne) => !pris.has(colonne))
          .map((colonne) => [colonne, uaiContenu(colonne)])
          .filter(([, proportionUai]) => proportionUai >= 0.6)
          .sort((a, b) => b[1] - a[1])
          .map(([colonne]) => colonne)[0] || null;
    // Nom introuvable par son intitulé : la colonne texte aux valeurs les plus longues et les plus variées
    if (!trouve && k === "nom") {
      const score = (colonne) => {
        const valeursTexte = (donneesTable[colonne] || []).filter(
          (valeur) => typeof valeur === "string" && /[a-z]/i.test(valeur),
        );
        return valeursTexte.length < (donneesTable.id || []).length * 0.6
          ? 0
          : (new Set(valeursTexte).size / valeursTexte.length) *
              (valeursTexte.reduce((somme, valeur) => somme + valeur.length, 0) / valeursTexte.length);
      };
      trouve =
        colonnes
          .filter(
            (colonne) =>
              !pris.has(colonne) &&
              colonne !== colonnesCourantes.cle &&
              colonne !== colonnesCourantes.lien &&
              !/uuid|lien|mail|url/i.test(colonne),
          )
          .map((colonne) => [colonne, score(colonne)])
          .filter(([, noteColonne]) => noteColonne > 4)
          .sort((a, b) => b[1] - a[1])
          .map(([colonne]) => colonne)[0] || null;
    }
    if (trouve && !noms(trouve).some((nomNormalise) => reconnaissance.motifs.some((motif) => motif.test(nomNormalise))))
      parContenu.push(k);
    if (trouve) {
      colonnesCourantes[k] = trouve;
      pris.add(trouve);
      trouvees[k] = trouve;
    }
  }
  return { trouvees, parContenu };
}
async function reconnaitreColonnesEtab(donneesTable) {
  Object.assign(colonnesEtab, COLONNES_ETAB_DEFAUT);
  etatSaisie.colonnesReconnues = {};
  etatSaisie.colonnesParContenu = new Set();
  const meta = await lireMetaColonnesEtab();
  const { trouvees, parContenu } = calculerColonnesEtabReconnues(donneesTable, meta);
  Object.assign(colonnesEtab, trouvees);
  Object.assign(etatSaisie.colonnesReconnues, trouvees);
  parContenu.forEach((k) => etatSaisie.colonnesParContenu.add(k));
}
function appliquerColonnesForcees() {
  const colonnesForcees = varianteSaisie().colonnes || {};
  for (const k of ["nom", "uai", "commune", "type", "academie", "departement", "mail"]) {
    if (
      colonnesForcees[k] &&
      etatSaisie.colsEtab.includes(colonnesForcees[k]) &&
      colonnesEtab[k] !== colonnesForcees[k]
    ) {
      colonnesEtab[k] = colonnesForcees[k];
      etatSaisie.colonnesReconnues[k] = colonnesForcees[k];
      etatSaisie.colonnesParContenu.delete(k);
    }
  }
}
// Champs de la fiche : rôle (« @nom », « @commune »… selon les colonnes reconnues), « @region » (déduite de l'académie), ou colonne du référentiel
const ROLES_FICHE = {
  nom: "Établissement",
  uai: "UAI",
  type: "Type",
  commune: "Commune",
  academie: "Académie",
  departement: "Département",
  mail: "Mail",
  region: "Région académique",
};
function colonneChampFiche(cle) {
  cle = String(cle || "");
  if (cle === "@region") return colonneRegion();
  return cle.startsWith("@") ? colonnesEtab[cle.slice(1)] || null : cle;
}
function valeurChampFiche(etablissement, cle) {
  if (cle === "@region") return regionAcademique(etablissement);
  const colonne = colonneChampFiche(cle),
    valeur = colonne ? etablissement[colonne] : null;
  if (valeur == null || typeof valeur === "object") return "";
  if (typeof valeur === "boolean") return valeur ? "Oui" : "Non";
  return typeof valeur === "number" ? valeur.toLocaleString("fr-FR") : valeur;
}
const libelleChampFiche = (cle) => (String(cle).startsWith("@") ? ROLES_FICHE[cle.slice(1)] || cle.slice(1) : cle);
// Valeurs disponibles pour le modèle d'en-tête : rôles (nom, commune, uai…), région, et toute colonne du référentiel
function valeursEtab(etablissement) {
  const valeurs = {};
  for (const colonne of etatSaisie.colsEtab) {
    const valeur = etablissement[colonne];
    if (valeur != null && typeof valeur !== "object") valeurs[colonne] = valeur;
  }
  for (const k of Object.keys(ROLES_FICHE)) {
    const colonne = colonnesEtab[k];
    if (k !== "region" && colonne && etablissement[colonne] != null && typeof etablissement[colonne] !== "object")
      valeurs[k] = etablissement[colonne];
  }
  valeurs.region = regionAcademique(etablissement);
  return valeurs;
}
/* Région académique : colonne du référentiel si elle existe (Region_academique, « Région académique (siège) »…),
   sinon déduite de l'académie (13 régions académiques métropolitaines et 5 d'outre-mer). */
const REGIONS_ACADEMIQUES = {
  "Auvergne-Rhône-Alpes": ["Clermont-Ferrand", "Grenoble", "Lyon"],
  "Bourgogne-Franche-Comté": ["Besançon", "Dijon"],
  Bretagne: ["Rennes"],
  "Centre-Val de Loire": ["Orléans-Tours"],
  Corse: ["Corse"],
  "Grand Est": ["Nancy-Metz", "Reims", "Strasbourg"],
  "Hauts-de-France": ["Amiens", "Lille"],
  "Île-de-France": ["Créteil", "Paris", "Versailles"],
  Normandie: ["Normandie", "Caen", "Rouen"],
  "Nouvelle-Aquitaine": ["Bordeaux", "Limoges", "Poitiers"],
  Occitanie: ["Montpellier", "Toulouse"],
  "Pays de la Loire": ["Nantes"],
  "Provence-Alpes-Côte d'Azur": ["Aix-Marseille", "Nice"],
  Guadeloupe: ["Guadeloupe"],
  Martinique: ["Martinique"],
  Guyane: ["Guyane"],
  "La Réunion": ["La Réunion", "Réunion"],
  Mayotte: ["Mayotte"],
};
const cleAcademie = (academie) =>
  String(academie || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^academie\s+(de\s+la\s+|de\s+|d['’]\s*)?/, "")
    .replace(/[^a-z]+/g, " ")
    .trim();
const REGION_PAR_ACADEMIE = new Map(
  Object.entries(REGIONS_ACADEMIQUES).flatMap(([region, academies]) =>
    academies.map((academie) => [cleAcademie(academie), region]),
  ),
);
function colonneRegion() {
  const minusculesSansAccents = (colonne) =>
    String(colonne)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  return (
    etatSaisie.colsEtab.find((colonne) => /^region_?academique/.test(minusculesSansAccents(colonne))) ||
    etatSaisie.colsEtab.find((colonne) => /region/.test(minusculesSansAccents(colonne))) ||
    null
  );
}
function regionAcademique(etablissement) {
  if (!etablissement) return "";
  const colonne = colonneRegion(),
    valeur = colonne ? etablissement[colonne] : null;
  if (valeur != null && valeur !== "" && typeof valeur !== "object") return String(valeur);
  return REGION_PAR_ACADEMIE.get(cleAcademie(etablissement[colonnesEtab.academie])) || "";
}
const CHAMPS_NOUVEL_ETAB = ["type", "uai", "academie", "departement"];
const etabDe = (id) => etatSaisie.indexEtabs.get(id) || null;
const cleTexteEtab = (texteEtablissement) =>
  sansAccents(texteEtablissement)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
function etabParTexte(texteEtablissement) {
  if (etatSaisie.etabsIndexTexte !== etatSaisie.etabs) {
    etatSaisie.etabsIndexTexte = etatSaisie.etabs;
    etatSaisie.indexTexteEtabs = new Map();
    for (const etablissement of etatSaisie.etabs)
      for (const colonne of [colonnesEtab.uai, colonnesEtab.nom]) {
        const k = colonne && cleTexteEtab(etablissement[colonne]);
        if (k && !etatSaisie.indexTexteEtabs.has(k)) etatSaisie.indexTexteEtabs.set(k, etablissement);
      }
  }
  return etatSaisie.indexTexteEtabs.get(cleTexteEtab(texteEtablissement)) || null;
}
function trouverColNomReponses() {
  const colonneEtablissement = colonneDe("Etablissement");
  etatSaisie.colNomReponses = null;
  if (!colonneEtablissement) return;
  const cands = Object.values(etatSaisie.metaSig)
    .map((colonne) => ({
      c: colonne,
      m: String(colonne.texteFormule || "")
        .trim()
        .replace(/^return\s+/, "")
        .match(/^\$(\w+)\.(\w+)$/),
    }))
    .filter(
      (candidate) =>
        candidate.c.formule &&
        candidate.m &&
        candidate.m[1] === colonneEtablissement &&
        !/^(Ref|RefList|Bool|Int|Numeric|Date)/.test(candidate.c.type || ""),
    );
  const score = (candidate) =>
    (candidate.m[2] === colonnesEtab.nom ? 4 : 0) +
    (/^(nom|appellation|denomination|libelle|etablissement)/.test(normColonne(candidate.m[2])) ? 2 : 0) +
    (/^(nom|etablissement)/.test(normColonne(`${candidate.c.colId}`)) ? 1 : 0) -
    (/uai|commune|academ|depart|type|mail|lien|uuid|region/.test(normColonne(candidate.m[2])) ? 5 : 0);
  const meilleur = cands.sort((a, b) => score(b) - score(a))[0];
  if (meilleur && score(meilleur) > 0) etatSaisie.colNomReponses = meilleur.c.colId;
}
const texteEtabBrut = (ligne) => {
  const nomReponse = etatSaisie.colNomReponses && ligne ? ligne[etatSaisie.colNomReponses] : null;
  if (typeof nomReponse === "string" && nomReponse.trim()) return nomReponse.trim();
  const valeur = valeurLigne(ligne, "Etablissement");
  return typeof valeur === "string" && valeur.trim() ? valeur.trim() : "";
};
const etabDeLigne = (ligne) => {
  const valeur = valeurLigne(ligne, "Etablissement"),
    id = refId(valeur);
  return id ? etabDe(id) : typeof valeur === "string" ? etabParTexte(valeur) : null;
};
// nom affiché d'un signalement : établissement du référentiel, sinon le texte saisi dans la cellule
const nomEtabLigne = (ligne) => (etabDeLigne(ligne) || {})[colonnesEtab.nom] || texteEtabBrut(ligne);
// Calcule le diagnostic : signalements avec établissement, colonnes écartées, référence valide, signalements à rattacher
function calculerDiagnosticSignalements(LIB) {
  const avec = etatSaisie.enregistrements.filter(
      (enregistrement) => refId(valeurLigne(enregistrement, "Etablissement")) || texteEtabBrut(enregistrement),
    ),
    perdus = avec.filter((enregistrement) => !etabDeLigne(enregistrement));
  const ecartees = Object.keys(LIB).filter(
    (k) =>
      colonneDe(k) &&
      colonneDe(k) !== k &&
      etatSaisie.metaSig[k] &&
      !(etatSaisie.mappings && typeof etatSaisie.mappings[k] === "string") &&
      !etatSaisie.enregistrements.some((enregistrement) => celluleRemplie(enregistrement[k])),
  );
  const colonneEtablissement = colonneDe("Etablissement"),
    refOk =
      colonneEtablissement &&
      etatSaisie.metaSig[colonneEtablissement] &&
      etatSaisie.metaSig[colonneEtablissement].type === `Ref:${ETAB.table}`;
  const aRattacher = refOk
    ? etatSaisie.enregistrements.filter(
        (enregistrement) => texteEtabBrut(enregistrement) && etabDeLigne(enregistrement),
      )
    : [];
  const textes = etatSaisie.enregistrements.filter((enregistrement) => texteEtabBrut(enregistrement)).length;
  return { avec, perdus, ecartees, colonneEtablissement, refOk, aRattacher, textes };
}
// Calcule la colonne de l'établissement (associée ou reconnue) et la table qu'elle vise (null si aucune)
function calculerCibleEtab(metaTable, tid) {
  const colonneEtablissement =
    colonneDe("Etablissement") || reconnaitreColonnesSignalement(metaTable, tid).Etablissement || null; // sans association : colonne reconnue (Etablissement, Etablissement_ESR…)
  const cible =
    (metaTable &&
      colonneEtablissement &&
      metaTable[colonneEtablissement] &&
      ((metaTable[colonneEtablissement].type || "").match(/^Ref:(.+)$/) || [])[1]) ||
    null;
  return { colonneEtablissement, cible };
}
// Décide de la table du référentiel (choisie, visée par la colonne, ou par défaut), son origine et le message d'alerte
function decisionTableEtab(choisie, cible, colonneEtablissement) {
  if (choisie)
    return {
      table: choisie,
      origine: "choisie dans les réglages",
      alerte:
        cible && cible !== choisie
          ? `La recherche porte sur la table « ${choisie} », mais la colonne « ${colonneEtablissement} » renvoie vers la table « ${cible} » : ` +
            `les signalements seraient rattachés à la mauvaise ligne. Dans Grist, faites pointer la colonne « ${colonneEtablissement} » vers « ${choisie} » (type Référence), ou revenez au réglage automatique.`
          : "",
    };
  if (cible) return { table: cible, origine: `table visée par la colonne « ${colonneEtablissement} »`, alerte: "" };
  return { table: TABLE_ETAB_DEFAUT, origine: "table par défaut", alerte: "" };
}
// Signalements dont la référence ne correspond à aucune ligne du référentiel lu (autre table visée, réglage ⚙ forcé…)
function alerteLiensEtab() {
  if (!colonneDe("Etablissement") || !etatSaisie.etabs.length || !etatSaisie.enregistrements.length) return "";
  const avec = etatSaisie.enregistrements.filter(
    (enregistrement) => refId(valeurLigne(enregistrement, "Etablissement")) || texteEtabBrut(enregistrement),
  );
  const perdus = avec.filter((enregistrement) => !etabDeLigne(enregistrement));
  return perdus.length > avec.length / 2
    ? `${perdus.length} signalement(s) sur ${avec.length} renvoient à des établissements absents de la table « ${ETAB.table} » : la colonne « ${colonneDe("Etablissement")} » vise sans doute une autre table. Vérifiez ⚙ Réglages › « Colonnes et référentiel utilisés ».`
    : "";
}
// Dit si le lien d'accès de l'établissement reste à lire (référentiel venu du cache, lien absent et pas déjà demandé)
function lienEtabAcompleter(etablissement) {
  return !(
    !etatSaisie.referentielDuCache ||
    !etablissement ||
    liensDemandes.has(etablissement.id) ||
    !(colonnesEtab.lien in etablissement) ||
    (etablissement[colonnesEtab.lien] != null && etablissement[colonnesEtab.lien] !== "")
  );
}
// Calcule les lignes d'établissements, leur index par identifiant, le plus grand identifiant et la liste des colonnes
function calculerIndexEtabs(tableReferentiel) {
  const colonnes = Object.keys(tableReferentiel);
  const etabs = tableReferentiel.id.map((id, i) => {
    const ligne = {};
    colonnes.forEach((colonne) => (ligne[colonne] = tableReferentiel[colonne][i]));
    return ligne;
  });
  const indexEtabs = new Map(etabs.map((etablissement) => [etablissement.id, etablissement]));
  const idEtabMax = etabs.reduce((idMax, etablissement) => Math.max(idMax, etablissement.id), 0);
  return { colonnes, etabs, indexEtabs, idEtabMax };
}
// Détermine le mode établissement : une seule ligne visible et sa clé illisible (absente ou censurée)
function calculerModeEtab(colonnes) {
  // Mode établissement : une seule ligne est visible (celle de l'établissement du lien), et sa clé
  // n'est pas lisible — soit la colonne est absente du schéma transmis, soit sa valeur est censurée
  // par une règle d'accès de colonne (cas le plus courant : le rôle « colonne » sur UUID/Lien).
  const uneSeuleLigne = etatSaisie.etabs.length === 1;
  const cleLisible =
    uneSeuleLigne && colonnes.includes(colonnesEtab.cle) && lisible(etatSaisie.etabs[0][colonnesEtab.cle]);
  return uneSeuleLigne && !cleLisible;
}
// Calcule le texte d'alerte sur la structure du référentiel (colonnes devinées ou introuvables)
function calculerTexteAlerteStructure(colonnes) {
  const colsLisibles = colonnes
    .filter((colonne) => colonne !== "id" && colonne !== "manualSort" && !colonne.startsWith("gristHelper"))
    .join(", ");
  const devinees = [...etatSaisie.colonnesParContenu].filter((k) => ["nom", "uai"].includes(k));
  return [
    !etatSaisie.modeEtab && devinees.length
      ? `Dans la table « ${ETAB.table} », ${devinees.map((k) => `la colonne « ${colonnesEtab[k]} » est utilisée comme ${k === "nom" ? "nom de l'établissement" : "UAI"}`).join(" et ")}, d'après son contenu. Renommez-la « ${devinees.map((k) => (k === "nom" ? "Nom" : "UAI")).join(" » / « ")} » si ce n'est pas la bonne.`
      : "",
    !etatSaisie.modeEtab && !colonnes.includes(colonnesEtab.nom)
      ? `Aucune colonne de nom d'établissement reconnue dans la table « ${ETAB.table} »${colonnes.includes(colonnesEtab.uai) ? "" : " (ni d'UAI)"} : la recherche porte sur toutes ses colonnes texte. Nommez la colonne du nom « Nom »${colonnes.includes(colonnesEtab.uai) ? "" : " et celle de l'UAI « UAI »"} pour une recherche fiable. Colonnes trouvées : ${colsLisibles}.`
      : "",
    !etatSaisie.modeEtab && !colonnes.includes(colonnesEtab.cle)
      ? `Colonne « ${colonnesEtab.cle} » introuvable dans ${ETAB.table} : les liens d'accès des établissements n'existent pas encore. Mise en place : administration, onglet Établissements.${colonnes.includes(colonnesEtab.nom) ? ` Colonnes trouvées : ${colsLisibles}.` : ""}`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}
/* Section d'établissement (SEGPA, SEP, SGT, SES) choisie à la création : le signalement doit porter sur
   l'établissement ; celui de rattachement probable (même adresse ou presque) est proposé en un clic. */
function infoSection(etablissement) {
  if (!etablissement) return null;
  const trouverColonneParMotif = (motif) => (etatSaisie.colsEtab || []).find((k) => motif.test(k));
  const cNat = trouverColonneParMotif(/libelle_?nature|^nature/i),
    cLat = trouverColonneParMotif(/^(etab_)?lat(itude)?$/i),
    cLon = trouverColonneParMotif(/^(etab_)?(lon|lng|longitude)$/i);
  const texteSimple = (valeur) => (valeur == null || typeof valeur === "object" ? "" : String(valeur));
  const lat = cLat ? +etablissement[cLat] : NaN,
    lon = cLon ? +etablissement[cLon] : NaN;
  return {
    id: etablissement.id,
    ligne: etablissement,
    nom: texteSimple(etablissement[colonnesEtab.nom]),
    type: texteSimple(etablissement[colonnesEtab.type]),
    nature: cNat ? texteSimple(etablissement[cNat]) : "",
    commune: texteSimple(etablissement[colonnesEtab.commune]),
    lat: isFinite(lat) && lat ? lat : null,
    lon: isFinite(lon) && lon ? lon : null,
  };
}
// Calcule (avec cache dans etatSaisie.sectionCalculee) l'établissement de rattachement proposé pour une section
function calculerRattachementSection(section, genre) {
  if (etatSaisie.sectionCalculee.id !== section.id) {
    const cLat = (etatSaisie.colsEtab || []).find((k) => /^(etab_)?lat(itude)?$/i.test(k));
    const proches = etatSaisie.etabs
      .filter(
        (autreEtablissement) =>
          autreEtablissement.id !== section.id &&
          (section.lat == null || !cLat || Math.abs(+autreEtablissement[cLat] - section.lat) < 0.01),
      )
      .map(infoSection);
    etatSaisie.sectionCalculee = {
      id: section.id,
      r: Socle.rattachementSection({ ...section, section: genre }, proches),
    };
  }
  return etatSaisie.sectionCalculee.r;
}
const colRattachement = () =>
  (etatSaisie.colsEtab || []).find((k) =>
    /^(rattachement|etablissement_de_rattachement|etablissement_parent)$/i.test(k),
  ) || null;
function rattachementDe(composante) {
  const colonneRattachement = colRattachement();
  if (!composante || !colonneRattachement) return null;
  const vus = new Set([composante.id]);
  let etablissementParent = etabDe(refId(composante[colonneRattachement]));
  while (
    etablissementParent &&
    !vus.has(etablissementParent.id) &&
    refId(etablissementParent[colonneRattachement]) &&
    etabDe(refId(etablissementParent[colonneRattachement]))
  ) {
    vus.add(etablissementParent.id);
    etablissementParent = etabDe(refId(etablissementParent[colonneRattachement]));
  } // composante d'une composante
  return etablissementParent && etablissementParent.id !== composante.id ? etablissementParent : null;
}
function versEtablissement(composante) {
  const etablissementParent = rattachementDe(composante);
  etatSaisie.composanteChoisie = etablissementParent ? composante : null;
  return etablissementParent || composante;
}
const nomEtabId = (id) => {
  const etablissement = etabDe(id);
  return etablissement ? String(etablissement[colonnesEtab.nom] ?? "") : "";
};
// SELF_HYPERLINK renvoie « URL » ou « libellé URL » : on garde l'adresse
const extraireUrl = (texte) => {
  const adresses = String(texte ?? "").match(/https?:\/\/\S+/g);
  return adresses ? adresses[adresses.length - 1] : "";
};
const nettoieMail = (valeur) => (typeof valeur === "string" ? valeur.trim() : "");
// Calcule le lien mailto (objet et corps d'après les modèles de message) pour le mail, le lien et le nom donnés
function construireMailto(mail, lien, nomEtab) {
  // message réglé dans l'administration (onglet Établissements, clé « liens » de Config), sinon message par défaut
  const messageConfigure =
      etatSaisie.socleConfig && etatSaisie.socleConfig.valeurs.liens && etatSaisie.socleConfig.valeurs.liens.message,
    etablissement = etatSaisie.etabCourant || {};
  const remplir = (modele) =>
    String(modele).replace(/\{(nom|uai|commune|lien|situation)\}/g, (_, k) =>
      k === "nom"
        ? nomEtab || ""
        : k === "lien"
          ? lien
          : k === "situation"
            ? (etatSaisie.socleConfig &&
                etatSaisie.socleConfig.valeurs.general &&
                etatSaisie.socleConfig.valeurs.general.situation) ||
              ""
            : String(etablissement[colonnesEtab[k]] ?? ""),
    );
  const objet = messageConfigure && messageConfigure.objet ? remplir(messageConfigure.objet) : MESSAGE.objet(nomEtab),
    corps = messageConfigure && messageConfigure.corps ? remplir(messageConfigure.corps) : MESSAGE.corps(nomEtab, lien);
  return `mailto:${encodeURIComponent(mail)}?subject=${encodeURIComponent(objet)}&body=${encodeURIComponent(corps)}`;
}
function etabParUai(uai) {
  const uaiNormalise = (uai || "").trim().toUpperCase();
  return uaiNormalise
    ? etatSaisie.etabs.find(
        (etablissement) => String(etablissement[colonnesEtab.uai] || "").toUpperCase() === uaiNormalise,
      ) || null
    : null;
}
function etablissementDuFormulaire() {
  if (etatSaisie.initiale) return refId(valeurLigne(etatSaisie.initiale, "Etablissement"));
  if (etatSaisie.modeEtab) return etatSaisie.etabs[0] ? etatSaisie.etabs[0].id : null;
  return etatSaisie.etabCourant ? etatSaisie.etabCourant.id : null; // établissement pas encore dans le référentiel : aucune ligne
}
// Département et académie de l'établissement d'une ligne (référentiel, à défaut colonnes recopiées de la table des réponses)
function lieuDe(ligne) {
  const ligneEtablissement = (ligne && etabDeLigne(ligne)) || {},
    donneesLigne = ligne || {};
  return {
    dep: String(
      (colonnesEtab.departement && ligneEtablissement[colonnesEtab.departement]) || donneesLigne.Departement || "",
    ),
    aca: String((colonnesEtab.academie && ligneEtablissement[colonnesEtab.academie]) || donneesLigne.Academie || ""),
  };
}
/* Campagnes (onglet Établissements de l'administration) : la page d'un établissement ouverte par son lien affiche la
   campagne qui le vise et propose « Rien à signaler », qui enregistre un signalement en retour à la normale. */
function campagnesDeLEtab() {
  if (!etatSaisie.modeEtab || !etatSaisie.etabs || !etatSaisie.etabs[0] || !etatSaisie.socleConfig || !Socle.campagnes)
    return [];
  const colonnesEtablissement = {
    nom: colonnesEtab.nom,
    uai: colonnesEtab.uai,
    commune: colonnesEtab.commune,
    mail: colonnesEtab.mail,
  };
  return Socle.campagnes(etatSaisie.socleConfig).filter(
    (campagne) =>
      Socle.campagneEnCours(campagne) &&
      (!campagne.referentiel || campagne.referentiel === ETAB.table) &&
      Socle.campagneVise(campagne, etatSaisie.etabs[0], colonnesEtablissement),
  );
}
