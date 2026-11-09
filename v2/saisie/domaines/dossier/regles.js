/* PRISME — widget de saisie, domaines/dossier/regles.js
   Domaine : les dossiers : versions, liste et filtres, ouverture, navigation, historique, reprise, plusieurs jours
   — règles (calculs, sans page ni Grist).
   Chargé par saisie/index.html dans l'ordre : fondations, composants, domaines, demarrage.js. Les fichiers partagent
   leurs noms (scripts classiques, sans import) : au chargement, un fichier ne fait que définir. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : decisionLigneCliquee, jourDesFaits, comparerVersions, calculerVersions, auteurDe,
     reinitialiserEtatCreation, diagnostiquerFaitsAnterieurs, jourCalendaire, jourFaits, jourDuFormulaire,
     jourDeLaVersion, libelleDossier, calculerDossiersInit, construireIndexRecherche, versionDuJour,
     lignesPrecedentes, VIDE_FILTRE, RENSEIGNE_FILTRE, CHAMPS_ETAB_FILTRE, MAX_VALEURS_FILTRE, derniereDe,
     champsFiltrables, typeChamp, valeursDossier, champDe, filtreEffectif, filtreActif, passeUn, passeFiltre,
     dossiersFiltres, resumeFiltre, valeursDisponibles, actualiserChampsFiltre, voisins, UN_JOUR, MAX_JOURS,
     LIMITE_FUTUR_JOURS, estWeekEnd, joursEntre, erreurJours, versionsDe, dossierDuJourPourSite, dossierDuJour,
     dernierJourAvecSignalement, joursDejaSignales, planifierSerie, texteSerie, jourDuDossierOuvert,
     joursReportSansDossier, erreurReportJours, entreesHistorique, JOURS_EN_COURS, cartesAffichees,
     compterVersionsParDossier, dossierClos, dossiersEnCours, propositionsDeReprise.
   Utilise :
     fondations/configuration : colonnesEtab.
     fondations/outils : colonneDe, dateFr, egal, formateur, idDossierDe, jourCle, jourCourt, lisible, listeQualif,
       pluriel, refId, sansAccents, secondes, texteComparable, typeBase, valeurLigne, valeurLocale.
     fondations/etat : etatSaisie, idsCreesIci.
     composants/date-faits : lireDateFaits.
     composants/champs : valeurOuNull.
     composants/tableaux-structure : lireTableauJson.
     composants/tableaux-enregistrement : texteErreursTableaux.
     domaines/agent/regles : dansPerimetre, perimetreActif.
     domaines/formulaire/regles : textesValeur, varianteSaisie.
     domaines/etablissement/regles : etabDeLigne, nomEtabLigne, texteEtabBrut.
     domaines/enregistrement/regles : MOTIF_MOBILISATION, NATURE, ajouterMobilisation, dateParGrist, formatValeur,
       jourDeMobilisation, memeSite, seulementModifies.
     domaines/visas/regles : aViserParMoi.
     domaines/sites-esr/regles : formulaireParSite, modeRepriseSites.
   Modifie etatSaisie : cacheDernieres, derniere, dossierId, doublonConfirme, filtres, indexRecherche, initiale,
     listeChampsFiltre, qualifTouchee, sitesAutoPour, versions. */
// Décide quoi faire de la ligne cliquée : dossier visé et action (ignorer, relire, saisie en cours, ouvrir)
function decisionLigneCliquee(rec) {
  const ligneCourante = etatSaisie.enregistrements.find((ligne) => ligne.id === rec.id) || rec;
  const idDossier = idDossierDe(ligneCourante);
  const renvoi = rec.id === etatSaisie.dernierCurseur;
  // même signalement : un simple renvoi (après une modification de la table) est déjà traité par onRecords,
  // qui rafraîchit le dossier ouvert ; seul un clic sur une autre ligne du même dossier le relit
  if (idDossier === etatSaisie.dossierId)
    return { idDossier, action: renvoi ? "ignorer-renvoi-meme-dossier" : "relire" };
  // Ligne tout juste créée par une autre vue : Grist a pu y décaler le curseur lors de l'insertion.
  const creeeAilleurs =
    (etatSaisie.idsNouveaux.has(rec.id) || !etatSaisie.enregistrements.some((ligne) => ligne.id === rec.id)) &&
    !idsCreesIci.has(rec.id);
  if (creeeAilleurs) return { idDossier, action: "ignorer" };
  if (renvoi) return { idDossier, action: "ignorer" }; // curseur inchangé, mais le widget affiche autre chose (nouveau signalement, menu)
  // Vrai déplacement du curseur : on ne l'applique pas si une saisie est en cours, pour ne rien perdre
  if (etatSaisie.modifie) return { idDossier, action: "saisie-en-cours" };
  return { idDossier, action: "ouvrir" };
}
/* Ordre des versions : par date des faits (colonne associée « Date des faits »), puis par date de saisie,
   puis par ordre de création. Une version sans date des faits est classée à sa date de saisie.
   La dernière version est donc celle qui décrit les faits les plus récents ; une version saisie tard
   pour des faits plus anciens prend sa place dans l'historique sans devenir la dernière. */
function jourDesFaits(ligne) {
  const jourFaits = colonneDe("Date_faits") ? secondes(ligne[colonneDe("Date_faits")]) : null;
  return jourFaits != null ? jourFaits : secondes(colonneDe("Date") ? ligne[colonneDe("Date")] : null);
}
function comparerVersions(versionA, versionB) {
  const jourFaitsA = jourDesFaits(versionA) ?? Infinity,
    jourFaitsB = jourDesFaits(versionB) ?? Infinity;
  if (jourFaitsA !== jourFaitsB) return jourFaitsA - jourFaitsB;
  const dateSaisieA = secondes(colonneDe("Date") ? versionA[colonneDe("Date")] : null) ?? Infinity,
    dateSaisieB = secondes(colonneDe("Date") ? versionB[colonneDe("Date")] : null) ?? Infinity;
  return dateSaisieA - dateSaisieB || versionA.id - versionB.id;
}
function calculerVersions() {
  const lignes = etatSaisie.enregistrements.filter((ligne) => idDossierDe(ligne) === etatSaisie.dossierId);
  lignes.sort(comparerVersions);
  etatSaisie.versions = lignes;
  etatSaisie.initiale = lignes.find((ligne) => ligne.id === etatSaisie.dossierId) || lignes[0] || null;
  etatSaisie.derniere = lignes[lignes.length - 1] || null;
}
const auteurDe = (ligne) => {
  const auteur = ligne && colonneDe("Auteur") ? valeurLigne(ligne, "Auteur") : "";
  return auteur ? ` (par ${auteur})` : "";
};
// Remet à zéro l'état du dossier courant pour un nouveau signalement
function reinitialiserEtatCreation() {
  etatSaisie.dossierId = null;
  etatSaisie.versions = [];
  etatSaisie.initiale = null;
  etatSaisie.derniere = null;
  etatSaisie.doublonConfirme = null; // chaque nouveau signalement demande sa propre confirmation
  etatSaisie.qualifTouchee = false; // formulaire par site : qualification déduite des sites
  etatSaisie.sitesAutoPour = null; // formulaire par site : reprise automatique des sites connus
}
// Détermine si les faits saisis sont antérieurs, d'un autre jour que le dossier, ou à venir
function diagnostiquerFaitsAnterieurs(nouvelle, jourDerniereVersion, finSerie, faitsFuturs) {
  const anterieur =
    etatSaisie.dossierId &&
    etatSaisie.derniere &&
    nouvelle != null &&
    jourDerniereVersion != null &&
    jourFaits(nouvelle) < jourFaits(jourDerniereVersion) &&
    !(finSerie != null && jourCle(finSerie) >= jourCle(jourDerniereVersion));
  const autreJourDossier =
    etatSaisie.dossierId &&
    etatSaisie.derniere &&
    nouvelle != null &&
    jourDerniereVersion != null &&
    jourFaits(nouvelle) !== jourFaits(jourDerniereVersion) &&
    !anterieur;
  const futur = !anterieur && !autreJourDossier && faitsFuturs;
  return { anterieur, autreJourDossier, futur };
}
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
function libelleDossier(ligne) {
  const dateSignalement =
    secondes(valeurLigne(ligne, "Date")) != null
      ? dateFr(valeurLigne(ligne, "Date"), { ...(etatSaisie.metaDate || {}), type: "Date" })
      : "";
  const texte = String(valeurLigne(ligne, "Description") || "").slice(0, 60);
  const etab = etatSaisie.modeEtab ? "" : nomEtabLigne(ligne);
  return {
    titre: etab || `Signalement n° ${ligne.id}`,
    detail: `${dateSignalement ? "du " + dateSignalement + " — " : ""}${texte}`,
  };
}
// Calcule les versions initiales des dossiers du périmètre, triées de la plus récente à la plus ancienne
function calculerDossiersInit() {
  return etatSaisie.enregistrements
    .filter((ligne) => idDossierDe(ligne) === ligne.id)
    .filter((ligne) => !perimetreActif() || dansPerimetre(etabDeLigne(ligne)))
    .sort((a, b) => (secondes(valeurLigne(b, "Date")) ?? 0) - (secondes(valeurLigne(a, "Date")) ?? 0));
}
function construireIndexRecherche() {
  const dernieres = new Map();
  for (const ligne of etatSaisie.enregistrements) {
    const idDossier = idDossierDe(ligne),
      derniereVersion = dernieres.get(idDossier);
    if (!derniereVersion || comparerVersions(derniereVersion, ligne) < 0) dernieres.set(idDossier, ligne);
  }
  etatSaisie.indexRecherche = etatSaisie.dossiersInit.map((ligne) => {
    const etablissement = etabDeLigne(ligne) || {},
      der = dernieres.get(ligne.id) || ligne;
    const texte = [
      etablissement[colonnesEtab.nom] || texteEtabBrut(ligne),
      etablissement[colonnesEtab.commune],
      etablissement[colonnesEtab.uai],
      etablissement[colonnesEtab.academie],
      etablissement[colonnesEtab.departement],
      colonneDe("Site") ? valeurLigne(der, "Site") : "",
      `n° ${ligne.id}`,
      String(ligne.id),
      valeurLigne(ligne, "Description"),
      der !== ligne ? valeurLigne(der, "Description") : "",
      listeQualif(valeurLigne(der, "Qualification")).join(" "),
    ]
      .filter((valeur) => valeur != null && typeof valeur !== "object")
      .join(" ")
      .replace(/\*\*|==/g, "");
    return { l: ligne, der, e: etablissement, cle: sansAccents(texte) };
  });
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
/* ---------- Filtre des signalements et navigation d'une fiche à l'autre ----------
   Plusieurs filtres possibles (combinés par ET ; plusieurs valeurs d'un même filtre combinées par OU).
   Chaque filtre porte sur l'état actuel de chaque dossier (sa dernière version) ou sur son établissement.
   Il s'applique à la barre de recherche, à la liste « Signalements » et aux flèches de navigation,
   et il est mémorisé sur ce poste (par table). Les flèches ‹ › (ou les touches ← → hors d'un champ
   de saisie) passent au signalement précédent ou suivant dans l'ordre de la liste. */
const VIDE_FILTRE = "∅",
  RENSEIGNE_FILTRE = "✱";
const CHAMPS_ETAB_FILTRE = [
  ["academie", "Académie"],
  ["departement", "Département"],
  ["type", "Type d'établissement"],
  ["commune", "Commune"],
];
const MAX_VALEURS_FILTRE = 60;
function derniereDe(dossier) {
  if (!etatSaisie.cacheDernieres) {
    etatSaisie.cacheDernieres = new Map();
    for (const enregistrement of etatSaisie.enregistrements) {
      const identifiantDossier = idDossierDe(enregistrement),
        derniereVersion = etatSaisie.cacheDernieres.get(identifiantDossier);
      if (!derniereVersion || comparerVersions(derniereVersion, enregistrement) < 0)
        etatSaisie.cacheDernieres.set(identifiantDossier, enregistrement);
    }
  }
  return etatSaisie.cacheDernieres.get(dossier.id) || dossier;
}
// Colonnes proposées : qualification et dates, toutes les questions supplémentaires (quel que soit leur type),
// les visas (agents), l'établissement (agents), puis les autres colonnes à valeurs fermées de la table.
function champsFiltrables() {
  const champs = [],
    vus = new Set();
  const ajouter = (definitionColonne, groupe) => {
    if (!definitionColonne || vus.has(definitionColonne.colId)) return;
    vus.add(definitionColonne.colId);
    champs.push({
      cle: "c:" + definitionColonne.colId,
      libelle: definitionColonne.libelle || definitionColonne.colId,
      groupe,
      def: definitionColonne,
    });
  };
  ["Qualification", "Date_faits", "Date", "Nature"].forEach((k) =>
    ajouter(colonneDe(k) && etatSaisie.metaSig[colonneDe(k)], "Signalement"),
  );
  etatSaisie.defsQuestions
    .filter((definitionColonne) => !definitionColonne.tableau)
    .forEach((definitionColonne) => ajouter(definitionColonne, "Questions supplémentaires"));
  if (!etatSaisie.modeEtab)
    [...etatSaisie.defsDep, ...etatSaisie.defsAca].forEach((definitionColonne) => ajouter(definitionColonne, "Visas"));
  if (!etatSaisie.modeEtab)
    for (const [k, libelle] of CHAMPS_ETAB_FILTRE)
      if (colonnesEtab[k] && etatSaisie.colsEtab.includes(colonnesEtab[k]))
        champs.push({ cle: "e:" + k, libelle: libelle, groupe: "Établissement" });
  const exclus = new Set(
    [
      colonneDe("Dossier"),
      colonneDe("Etablissement"),
      colonneDe("Description"),
      colonneDe("Commentaire"),
      "id",
      "manualSort",
    ].filter(Boolean),
  );
  const fermes = ["Choice", "ChoiceList", "Bool", "Ref", "RefList", "Date", "DateTime"];
  for (const definitionColonne of Object.values(etatSaisie.metaSig))
    if (
      !exclus.has(definitionColonne.colId) &&
      !definitionColonne.colId.startsWith("gristHelper") &&
      fermes.includes(typeBase(definitionColonne.type))
    )
      ajouter(definitionColonne, "Autres colonnes");
  return champs;
}
const typeChamp = (champ) => (champ.def ? typeBase(champ.def.type) : "Text");
function valeursDossier(dossier, champ) {
  if (champ.cle.startsWith("e:")) {
    const valeurEtablissement = (etabDeLigne(dossier) || {})[colonnesEtab[champ.cle.slice(2)]];
    return valeurEtablissement == null || valeurEtablissement === "" || typeof valeurEtablissement === "object"
      ? []
      : [{ cle: texteComparable(valeurEtablissement), libelle: String(valeurEtablissement) }];
  }
  const definitionColonne = champ.def,
    valeurBrute = derniereDe(dossier)[definitionColonne.colId],
    typeDeBase = typeBase(definitionColonne.type);
  if (typeDeBase === "Date" || typeDeBase === "DateTime") {
    const secondesValeur = secondes(valeurBrute);
    if (secondesValeur == null) return [];
    const dateValeur = new Date(secondesValeur * 1000),
      j = typeDeBase === "Date" ? dateValeur.toISOString().slice(0, 10) : valeurLocale(dateValeur, false);
    return [{ cle: j, libelle: j.split("-").reverse().join("/") }];
  }
  if ((typeDeBase === "Numeric" || typeDeBase === "Int") && typeof valeurBrute === "number")
    return [{ cle: String(valeurBrute), libelle: valeurBrute.toLocaleString("fr-FR") }];
  return textesValeur(definitionColonne, valeurBrute)
    .filter((texte) => String(texte).trim())
    .map((texte) => {
      const texteNettoye = String(texte)
        .replace(/\*\*|==/g, "")
        .replace(/\s+/g, " ")
        .trim();
      return {
        cle: texteComparable(texte),
        libelle: texteNettoye.length > 70 ? texteNettoye.slice(0, 68) + "…" : texteNettoye,
      };
    });
}
const champDe = (filtre) => etatSaisie.listeChampsFiltre.find((champ) => champ.cle === filtre.colonne) || null;
const filtreEffectif = (filtre) => !!(champDe(filtre) && (filtre.valeurs.length || (filtre.contient || "").trim()));
const filtreActif = () => etatSaisie.filtres.some(filtreEffectif);
function passeUn(filtre, dossier) {
  if (!filtreEffectif(filtre)) return true;
  const valeursDuDossier = valeursDossier(dossier, champDe(filtre));
  if (
    filtre.valeurs.some((k) =>
      k === VIDE_FILTRE
        ? !valeursDuDossier.length
        : k === RENSEIGNE_FILTRE
          ? valeursDuDossier.length > 0
          : valeursDuDossier.some((valeur) => valeur.cle === k),
    )
  )
    return true;
  const texteContient = texteComparable(filtre.contient || "");
  return !!texteContient && valeursDuDossier.some((valeur) => valeur.cle.includes(texteContient));
}
const passeFiltre = (dossier, sauf) =>
  etatSaisie.filtres.every((filtre) => filtre === sauf || passeUn(filtre, dossier));
const dossiersFiltres = () =>
  filtreActif() ? etatSaisie.dossiersInit.filter((dossier) => passeFiltre(dossier)) : etatSaisie.dossiersInit;
function resumeFiltre(filtre, court) {
  const champ = champDe(filtre);
  const noms = filtre.valeurs.map((k) =>
    k === VIDE_FILTRE ? "(vide)" : k === RENSEIGNE_FILTRE ? "(renseigné)" : filtre.libelles[k] || k,
  );
  if ((filtre.contient || "").trim()) noms.push(`contient « ${filtre.contient.trim()} »`);
  const texteValeurs = !noms.length
    ? "toutes les valeurs"
    : court && noms.length > 2
      ? `${noms.slice(0, 2).join(" ou ")} + ${noms.length - 2}`
      : noms.join(" ou ");
  return `${champ ? champ.libelle : "?"} : ${texteValeurs}`;
}
// Valeurs d'un filtre avec leur nombre de signalements, compté en tenant compte des AUTRES filtres
function valeursDisponibles(filtre) {
  const champ = champDe(filtre),
    compte = new Map();
  let vides = 0,
    renseignes = 0;
  for (const dossier of etatSaisie.dossiersInit) {
    if (!passeFiltre(dossier, filtre)) continue;
    const valeursDuDossier = valeursDossier(dossier, champ);
    if (valeursDuDossier.length) renseignes++;
    else vides++;
    new Map(valeursDuDossier.map((valeur) => [valeur.cle, valeur.libelle])).forEach((libelle, cle) => {
      const decompteValeur = compte.get(cle) || { libelle, n: 0 };
      decompteValeur.n++;
      compte.set(cle, decompteValeur);
    });
  }
  filtre.valeurs.forEach((k) => {
    if (k !== VIDE_FILTRE && k !== RENSEIGNE_FILTRE && !compte.has(k))
      compte.set(k, { libelle: filtre.libelles[k] || k, n: 0 });
  });
  const typeDeBase = typeChamp(champ);
  const ordre = ((champ.def && champ.def.opts && champ.def.opts.choices) || []).map(texteComparable);
  let entrees = [...compte.entries()];
  const trop = entrees.length > MAX_VALEURS_FILTRE;
  if (trop)
    entrees = entrees
      .sort((a, b) => b[1].n - a[1].n)
      .filter((entree, i) => i < MAX_VALEURS_FILTRE || filtre.valeurs.includes(entree[0]));
  entrees.sort(([cleA, a], [cleB, b]) => {
    if (typeDeBase === "Date" || typeDeBase === "DateTime") return cleB.localeCompare(cleA); // jours les plus récents d'abord
    if (typeDeBase === "Numeric" || typeDeBase === "Int") return parseFloat(cleA) - parseFloat(cleB);
    const rangA = ordre.indexOf(cleA),
      rangB = ordre.indexOf(cleB);
    if (rangA !== rangB && (rangA >= 0 || rangB >= 0)) return (rangA < 0 ? 1e9 : rangA) - (rangB < 0 ? 1e9 : rangB);
    return a.libelle.localeCompare(b.libelle, "fr");
  });
  return { entrees, vides, renseignes, trop };
}
// Recalcule la liste des champs filtrables et retire les filtres portant sur une colonne disparue
function actualiserChampsFiltre() {
  etatSaisie.listeChampsFiltre = champsFiltrables();
  // Filtre sur une colonne disparue (associations modifiées) : retiré
  if (Object.keys(etatSaisie.metaSig).length)
    etatSaisie.filtres = etatSaisie.filtres.filter(
      (filtre) => champDe(filtre) || (filtre.colonne.startsWith("e:") && !etatSaisie.etabsCharges),
    );
}
// Voisins du signalement affiché ; s'il ne fait pas (ou plus) partie de la liste, ceux de la place qu'il occupait
function voisins(liste, i) {
  if (i >= 0) return [liste[i - 1] || null, liste[i + 1] || null];
  if (etatSaisie.posNav == null) return [liste[liste.length - 1] || null, liste[0] || null];
  const k = Math.min(etatSaisie.posNav, liste.length);
  return [liste[k - 1] || null, liste[k] || null];
}
const UN_JOUR = 86400,
  MAX_JOURS = 31,
  LIMITE_FUTUR_JOURS = 366;
const estWeekEnd = (jourEnSecondes) => [0, 6].includes(new Date(jourEnSecondes * 1000).getUTCDay());
// Jours du « du » au « au » inclus (dates AAAA-MM-JJ), en secondes au format Grist
function joursEntre(debut, fin, ouvres) {
  if (!debut || !fin || fin < debut) return [];
  const jours = [];
  for (
    let jourEnSecondes = Date.parse(debut + "T00:00:00Z") / 1000, compteur = 0;
    jourCle(jourEnSecondes) <= fin && compteur < 400;
    jourEnSecondes += UN_JOUR, compteur++
  )
    if (!(ouvres && estWeekEnd(jourEnSecondes))) jours.push(jourEnSecondes);
  return jours;
}
function erreurJours(joursAVerifier, total, fin, debutCle) {
  if (!fin) return "Indiquez le dernier jour.";
  if (fin <= debutCle) return "Le dernier jour doit suivre le premier.";
  if (total > MAX_JOURS) return `${total} jours : ${MAX_JOURS} au plus en une fois.`;
  if (!joursAVerifier.length) return "Aucun jour ouvré dans cette période.";
  if (!varianteSaisie().faitsFuturs && joursAVerifier.some((jour) => jourCle(jour) > valeurLocale(new Date(), false)))
    return "Les jours postérieurs à aujourd'hui ne sont pas admis pour ce formulaire.";
  return "";
}
// Lignes d'un dossier ; signalement d'un établissement pour un jour donné (hors dossier ouvert)
const versionsDe = (dossierId) => {
  return etatSaisie.enregistrements.filter((ligne) => idDossierDe(ligne) === dossierId);
};
// Dossier de l'établissement qui a un signalement ce jour-là (hors dossier ouvert, même site que celui saisi), ou null
function dossierDuJourPourSite(etabId, jourEnSecondes, siteSaisi) {
  if (!etabId) return null;
  const k = jourFaits(jourEnSecondes),
    parDossier = new Map();
  for (const ligne of etatSaisie.enregistrements) {
    if (refId(valeurLigne(ligne, "Etablissement")) !== etabId) continue;
    const dossierId = idDossierDe(ligne);
    if (dossierId === etatSaisie.dossierId) continue;
    if (!parDossier.has(dossierId)) parDossier.set(dossierId, []);
    parDossier.get(dossierId).push(ligne);
  }
  for (const [dossierId, lignesDuDossier] of parDossier) {
    if (!lignesDuDossier.some((ligne) => jourDeLaVersion(ligne) === k)) continue;
    const der = [...lignesDuDossier].sort(comparerVersions).pop();
    if (colonneDe("Site") && !memeSite(siteSaisi, valeurLigne(der, "Site"))) continue; // autre site du même établissement
    return { d: dossierId, derniere: der };
  }
  return null;
}
// Lit le site saisi dans le formulaire, puis cherche le dossier du jour
function dossierDuJour(etabId, jourEnSecondes) {
  return dossierDuJourPourSite(etabId, jourEnSecondes, colonneDe("Site") ? $("site").value : null);
}
// Dernier jour consécutif (week-ends passés) après le jour choisi où l'établissement a un signalement, ou null
function dernierJourAvecSignalement(etabId, choisi, siteSaisi) {
  let fin = null;
  for (
    let jourEnSecondes = choisi + UN_JOUR, compteur = 0;
    compteur < MAX_JOURS;
    jourEnSecondes += UN_JOUR, compteur++
  ) {
    if (dossierDuJourPourSite(etabId, jourEnSecondes, siteSaisi)) fin = jourEnSecondes;
    else if (!estWeekEnd(jourEnSecondes)) break;
  }
  return fin;
}
// Jours parmi ceux donnés où l'établissement a déjà un signalement (même site que celui saisi)
function joursDejaSignales(etabId, jours, siteSaisi) {
  return jours.filter((jour) => dossierDuJourPourSite(etabId, jour, siteSaisi));
}
// Règle : pour chaque jour, ce qu'il faut créer (nouveau dossier), compléter (mise à jour du dossier du jour) ou laisser
function planifierSerie(etabId, valeurs, jours, origine, siteSaisi) {
  const colonneDescription = colonneDe("Description"),
    colonneDateFaits = colonneDe("Date_faits"),
    colonneDossier = colonneDe("Dossier");
  const creer = [],
    completer = [],
    inchanges = [];
  for (const jourEnSecondes of jours) {
    const valeursDuJour = { ...valeurs, [colonneDateFaits]: jourEnSecondes };
    if (
      colonneDescription &&
      typeof valeursDuJour[colonneDescription] === "string" &&
      etatSaisie.optionsAuto.mobilisation &&
      MOTIF_MOBILISATION.test(valeursDuJour[colonneDescription])
    )
      valeursDuJour[colonneDescription] = ajouterMobilisation(
        valeursDuJour[colonneDescription],
        etatSaisie.optionsAuto,
        jourDeMobilisation(jourEnSecondes, jours),
      );
    const champsAEnregistrer = { ...valeursDuJour, [colonneDe("Etablissement")]: etabId };
    if (colonneDe("Date") && !dateParGrist()) champsAEnregistrer[colonneDe("Date")] = Date.now() / 1000;
    const dossierExistant = dossierDuJourPourSite(etabId, jourEnSecondes, siteSaisi);
    if (dossierExistant) {
      const { [colonneDateFaits]: _, ...sansDate } = valeursDuJour;
      if (!Object.keys(seulementModifies(etatSaisie.champsVersion, sansDate, dossierExistant.derniere)).length) {
        inchanges.push(jourEnSecondes);
        continue;
      }
      if (colonneDossier) champsAEnregistrer[colonneDossier] = dossierExistant.d;
      if (colonneDe("Nature")) champsAEnregistrer[colonneDe("Nature")] = NATURE.suivi;
      if (colonneDe("Commentaire"))
        champsAEnregistrer[colonneDe("Commentaire")] =
          origine != null ? `Reprise du signalement du ${jourCourt(origine)}.` : "";
      completer.push({ t: jourEnSecondes, d: dossierExistant.d, fields: champsAEnregistrer });
    } else {
      if (colonneDe("Nature")) champsAEnregistrer[colonneDe("Nature")] = NATURE.initial;
      creer.push({ t: jourEnSecondes, fields: champsAEnregistrer });
    }
  }
  return { creer, completer, inchanges };
}
const texteSerie = (resultat) =>
  !resultat
    ? ""
    : " " +
      [
        resultat.crees
          ? `${pluriel(resultat.crees, "signalement créé", "signalements créés")} (${resultat.joursCrees.map(jourCourt).join(", ")})`
          : "",
        resultat.completes.length
          ? `${pluriel(resultat.completes.length, "signalement existant mis à jour", "signalements existants mis à jour")} (${resultat.completes.map(jourCourt).join(", ")})`
          : "",
        resultat.inchanges.length ? `déjà à jour : ${resultat.inchanges.map(jourCourt).join(", ")}` : "",
      ]
        .filter(Boolean)
        .join(" ; ") +
      "." +
      texteErreursTableaux(resultat.errT || []);
/* ---------- Prévisionnel : version saisie avant le jour de ses faits ----------
   Un dossier créé pour des faits à venir reste marqué « prévisionnel » une fois le jour venu : on voit ainsi que ses
   informations datent d'avant les faits, et si une mise à jour a été saisie depuis. Déduit des colonnes Date (date de
   saisie) et Date_faits, sans colonne supplémentaire. */
const colonneAvecHeure = (metaColonne) => !!(metaColonne && String(metaColonne.type || "").startsWith("DateTime"));
// Jour (AAAA-MM-JJ, heure de Paris) d'une valeur de colonne Date (minuit UTC) ou DateTime (instant), null si vide
function jourDeValeur(valeur, metaColonne) {
  const valeurEnSecondes = secondes(valeur);
  if (valeurEnSecondes == null) return null;
  return colonneAvecHeure(metaColonne) ? Outils.dates.jour(valeurEnSecondes * 1000) : jourCle(valeurEnSecondes);
}
const jourFaitsVersion = (ligne) =>
  colonneDe("Date_faits") ? jourDeValeur(ligne[colonneDe("Date_faits")], etatSaisie.metaFaits) : null;
const jourSaisieVersion = (ligne) =>
  colonneDe("Date") ? jourDeValeur(ligne[colonneDe("Date")], etatSaisie.metaDate) : null;
function versionPrevisionnelle(ligne) {
  const jourFaits = jourFaitsVersion(ligne),
    jourSaisie = jourSaisieVersion(ligne);
  return !!(jourFaits && jourSaisie && jourSaisie < jourFaits);
}
// Dossier prévisionnel : { saisie, faits, miseAJour } (jours AAAA-MM-JJ), null si aucune version n'a été saisie à l'avance
function etatPrevisionnelDossier(versions) {
  const prevue = (versions || []).find(versionPrevisionnelle);
  if (!prevue) return null;
  const jourFaits = jourFaitsVersion(prevue);
  const joursSaisieDepuis = versions
    .map(jourSaisieVersion)
    .filter((jourSaisie) => jourSaisie && jourSaisie >= jourFaits)
    .sort();
  return { saisie: jourSaisieVersion(prevue), faits: jourFaits, miseAJour: joursSaisieDepuis.pop() || null };
}
// Texte du bandeau « Prévisionnel » (vide : pas de bandeau). jourFaitsSaisi : date des faits du formulaire en cours
function texteBandeauPrevisionnel(dossierPrevisionnel, jourFaitsSaisi, aujourdhui) {
  const court = (cle) => jourCourt(Date.parse(`${cle}T00:00:00Z`) / 1000);
  if (dossierPrevisionnel) {
    const debut = `Prévisionnel : dossier créé le ${court(dossierPrevisionnel.saisie)} pour des faits prévus le ${court(dossierPrevisionnel.faits)}`;
    if (dossierPrevisionnel.faits > aujourdhui) return `${debut}.`;
    return dossierPrevisionnel.miseAJour
      ? `${debut}, mis à jour le ${court(dossierPrevisionnel.miseAJour)}.`
      : `${debut}, sans mise à jour depuis : ces informations n'ont pas été confirmées le jour des faits.`;
  }
  if (jourFaitsSaisi && jourFaitsSaisi > aujourdhui)
    return `Prévisionnel : faits prévus le ${court(jourFaitsSaisi)}. Le dossier restera marqué comme créé en prévisionnel.`;
  return "";
}
// Jour (clé AAAA-MM-JJ) des faits du dossier ouvert, ou null
function jourDuDossierOuvert() {
  return etatSaisie.derniere && jourDesFaits(etatSaisie.derniere) != null
    ? jourCle(jourDesFaits(etatSaisie.derniere))
    : null;
}
// Jours à reporter : les jours demandés, sauf celui du dossier ouvert
function joursReportSansDossier(jours, jourDossier) {
  return jours.filter((jour) => jourCle(jour) !== jourDossier);
}
// Message d'erreur du report sur d'autres jours (vide si la période convient)
function erreurReportJours(debut, fin, jours, jourDossier) {
  if (!debut) return "Indiquez le premier jour.";
  const joursAReporter = joursReportSansDossier(jours, jourDossier);
  if (fin < debut) return "Le dernier jour doit suivre le premier.";
  return erreurJours(
    joursAReporter,
    joursAReporter.length,
    fin,
    jourCle(Date.parse(debut + "T00:00:00Z") / 1000 - UN_JOUR),
  );
}
// Entrées de l'historique, de la plus ancienne à la plus récente : date, faits, qualification, auteur, changements
// d'une version à la précédente, commentaire
function entreesHistorique(versions, champsVersion) {
  const etat = {};
  champsVersion.forEach(
    (champVersion) => (etat[champVersion.colId] = valeurOuNull(champVersion, etatSaisie.initiale[champVersion.colId])),
  );
  return versions.map((version) => {
    const changements = [];
    if (version !== etatSaisie.initiale)
      for (const champVersion of champsVersion) {
        const valeur = valeurOuNull(champVersion, version[champVersion.colId]);
        if (egal(valeur, etat[champVersion.colId])) continue;
        changements.push({
          libelle: champVersion.libelle,
          avant: formatValeur(champVersion, etat[champVersion.colId]),
          apres: formatValeur(champVersion, valeur),
        });
        etat[champVersion.colId] = valeur;
      }
    return {
      date: valeurLigne(version, "Date"),
      faits: colonneDe("Date_faits") ? valeurLigne(version, "Date_faits") : null,
      qualification: listeQualif(valeurLigne(version, "Qualification")),
      auteur: lisible(valeurLigne(version, "Auteur")) ? valeurLigne(version, "Auteur") : null,
      changements,
      commentaire:
        version === etatSaisie.initiale
          ? ["Signalement initial", valeurLigne(version, "Commentaire")].filter(Boolean).join("\n")
          : valeurLigne(version, "Commentaire"),
    };
  });
}
const JOURS_EN_COURS = 7;
// ---------- Liste des signalements de l'accueil (cartes)
// Cartes à afficher : mots de la recherche, dossiers à viser ou tous (base0), après filtre, recherche et tri (plus récents d'abord)
function cartesAffichees(index, recherche) {
  const mots = sansAccents(recherche).split(/\s+/).filter(Boolean);
  const base0 = etatSaisie.fileVisa ? index.filter((entree) => aViserParMoi(entree.l)) : index;
  const base = filtreActif() ? base0.filter((entree) => passeFiltre(entree.l)) : base0;
  const trouves = mots.length ? base.filter((entree) => mots.every((mot) => entree.cle.includes(mot))) : base;
  const activite = (entree) => secondes(valeurLigne(entree.der, "Date")) ?? jourDesFaits(entree.der) ?? 0;
  const tries = [...trouves].sort((a, b) => activite(b) - activite(a) || b.l.id - a.l.id);
  return { mots, base0, trouves, tries };
}
// Nombre de versions (lignes) de chaque dossier, par identifiant de dossier
function compterVersionsParDossier() {
  const nombreVersionsParDossier = new Map();
  for (const ligne of etatSaisie.enregistrements) {
    const dossierId = idDossierDe(ligne);
    nombreVersionsParDossier.set(dossierId, (nombreVersionsParDossier.get(dossierId) || 0) + 1);
  }
  return nombreVersionsParDossier;
}
// ---------- Bandeau de mode (nouveau / mise à jour / clos) et menu « Autres actions »
const dossierClos = () =>
  !!(colonneDe("Clos") && etatSaisie.dossierId && etatSaisie.derniere && valeurLigne(etatSaisie.derniere, "Clos"));
function dossiersEnCours(etabId) {
  if (!etabId) return [];
  const derniereParDossier = new Map(),
    nombreVersionsParDossier = new Map();
  for (const ligne of etatSaisie.enregistrements) {
    if (refId(valeurLigne(ligne, "Etablissement")) !== etabId) continue;
    const dossierId = idDossierDe(ligne);
    nombreVersionsParDossier.set(dossierId, (nombreVersionsParDossier.get(dossierId) || 0) + 1);
    const derniereConnue = derniereParDossier.get(dossierId);
    if (!derniereConnue || comparerVersions(derniereConnue, ligne) < 0) derniereParDossier.set(dossierId, ligne);
  }
  const limite = Date.now() / 1000 - JOURS_EN_COURS * 86400;
  return [...derniereParDossier]
    .filter(
      ([, ligne]) =>
        !(colonneDe("Clos") && valeurLigne(ligne, "Clos")) &&
        ((jourDesFaits(ligne) ?? 0) >= limite || (secondes(valeurLigne(ligne, "Date")) ?? 0) >= limite),
    )
    .map(([dossierId, ligne]) => ({
      d: dossierId,
      l: ligne,
      n: nombreVersionsParDossier.get(dossierId) || 1,
      initiale: etatSaisie.enregistrements.find((enregistrement) => enregistrement.id === dossierId) || ligne,
    }))
    .sort((a, b) => comparerVersions(b.l, a.l));
}
// Propositions de reprise pour l'établissement courant : signalements en cours, ceux du jour du formulaire (memeJour),
// les autres (avant), et masquer si rien n'est à reprendre des jours précédents (formulaire par site, reprise désactivée)
function propositionsDeReprise(jour) {
  const enCreation =
    !etatSaisie.dossierId &&
    etatSaisie.etabCourant &&
    !etatSaisie.reaffectation &&
    etatSaisie.propositionMasquee !== etatSaisie.etabCourant.id;
  const liste = enCreation ? dossiersEnCours(etatSaisie.etabCourant.id) : [];
  const memeJour = liste.filter((dossierPropose) =>
      versionsDe(dossierPropose.d).some((version) => jourDeLaVersion(version) === jour),
    ),
    avant = liste.filter((dossierPropose) => !memeJour.includes(dossierPropose));
  const masquer = !memeJour.length && formulaireParSite() && modeRepriseSites() === "non";
  return { liste, memeJour, avant, masquer };
}
