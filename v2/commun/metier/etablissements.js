/* =====================================================================
   PRISME — règles métier : sections d'établissement et régions académiques
   ---------------------------------------------------------------------
   Sections d'établissement (SEGPA, SEP, SGT, SES). Elles ont leur propre UAI dans l'annuaire mais font partie d'un collège ou d'un lycée : un signalement doit porter
   sur l'établissement. genreSection : genre d'après le libellé de nature, le type ou le nom (null : établissement).
   rattachementSection : établissement de rattachement probable parmi des candidats { id, nom, type, nature, commune,
   lat, lon } — le plus proche (moins de 500 m) du type attendu, nom voisin en prime ; sans coordonnées, même commune
   et nom voisin. Renvoie { etab, distance } ou null.
   Régions académiques : regionDeAcademie(académie) → région académique (comparaison sans accents ni majuscules).
   Chargé par chaque page, après commun/socle.js.

   Définit (sur window.Socle) : genreSection, rattachementSection, REGIONS_ACADEMIQUES, regionDeAcademie.
   Utilise (window.Socle) : normaliser.
   ===================================================================== */
(function () {
  "use strict";

  const { normaliser } = window.Socle;

  const enMajuscules = (texte) =>
    String(texte || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, " ")
      .trim();
  function genreSection(nature, type, nom) {
    const tout = `${enMajuscules(nature)} | ${enMajuscules(type)}`,
      nomMajuscules = enMajuscules(nom);
    if (
      /SECTION D ENSEIGNEMENT GENERAL ET PROFESSIONNEL ADAPTE|\bSEGPA\b/.test(tout) ||
      /\bSEGPA\b/.test(nomMajuscules)
    )
      return "SEGPA";
    if (/SECTION D EDUCATION SPECIALISEE|\bSES\b/.test(tout) || /^SES\b/.test(nomMajuscules)) return "SES";
    if (/SECTION D ENSEIGNEMENT PROFESSIONNEL|\bSEP\b/.test(tout) || /^SEP\b/.test(nomMajuscules)) return "SEP";
    if (/SECTION D ENSEIGNEMENT GENERAL ET TECHNOLOGIQUE|\bSGT\b/.test(tout) || /^SGT\b/.test(nomMajuscules))
      return "SGT";
    return null;
  }
  const PARENT_SECTION = {
    SEGPA: /COLLEGE|\bCLG\b/,
    SES: /COLLEGE|\bCLG\b/,
    SEP: /LYCEE|\bLPO?\b|\bLGT\b/,
    SGT: /LYCEE|\bLPO?\b|\bLGT\b/,
  };
  const MOTS_VIDES_SECTION = new Set([
    "SEGPA",
    "SEP",
    "SGT",
    "SES",
    "SECTION",
    "D",
    "DE",
    "DU",
    "DES",
    "LA",
    "LE",
    "LES",
    "L",
    "ET",
    "ENSEIGNEMENT",
    "GENERAL",
    "PROFESSIONNEL",
    "ADAPTE",
    "TECHNOLOGIQUE",
    "EDUCATION",
    "SPECIALISEE",
    "COLLEGE",
    "CLG",
    "LYCEE",
    "LP",
    "LPO",
    "LGT",
    "PUBLIC",
    "PRIVE",
    "POLYVALENT",
    "PROFESSIONNELLE",
    "AU",
    "AUX",
  ]);
  const motsSection = (texte) =>
    new Set(
      enMajuscules(texte)
        .split(" ")
        .filter((mot) => mot.length > 1 && !MOTS_VIDES_SECTION.has(mot)),
    );
  const distanceEnMetres = (pointA, pointB) => {
    const radiansParDegre = Math.PI / 180,
      ecartEstOuest = (pointB.lon - pointA.lon) * Math.cos(((pointA.lat + pointB.lat) / 2) * radiansParDegre),
      ecartNordSud = pointB.lat - pointA.lat;
    return Math.hypot(ecartEstOuest, ecartNordSud) * 111195;
  };
  function rattachementSection(etablissement, candidats) {
    const genre =
      etablissement &&
      (etablissement.section || genreSection(etablissement.nature, etablissement.type, etablissement.nom));
    if (!genre) return null;
    const attendu = PARENT_SECTION[genre],
      mots = motsSection(etablissement.nom),
      geo = etablissement.lat != null && etablissement.lon != null;
    let meilleur = null;
    for (const candidat of candidats) {
      if (!candidat || candidat.id === etablissement.id || genreSection(candidat.nature, candidat.type, candidat.nom))
        continue;
      const distance =
        geo && candidat.lat != null && candidat.lon != null ? distanceEnMetres(etablissement, candidat) : null;
      if (
        distance != null
          ? distance > 500
          : enMajuscules(candidat.commune) !== enMajuscules(etablissement.commune) ||
            !enMajuscules(etablissement.commune)
      )
        continue;
      const typeOk = attendu.test(enMajuscules(`${candidat.type} ${candidat.nature} ${candidat.nom}`)),
        communs = [...motsSection(candidat.nom)].filter((mot) => mots.has(mot)).length;
      if (distance == null && !communs) continue;
      const score = (distance == null ? 300 : distance) - communs * 150 - (typeOk ? 400 : 0);
      if ((typeOk || communs) && (!meilleur || score < meilleur.score))
        meilleur = { etab: candidat, distance: distance, score };
    }
    return meilleur ? { etab: meilleur.etab, distance: meilleur.distance } : null;
  }

  /* ---------- Régions académiques ---------- */
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
  const REGION_PAR_ACADEMIE = new Map(
    Object.entries(REGIONS_ACADEMIQUES).flatMap(([region, academies]) =>
      academies.map((academie) => [normaliser(academie), region]),
    ),
  );
  const regionDeAcademie = (academie) => REGION_PAR_ACADEMIE.get(normaliser(academie)) || "";

  Object.assign(window.Socle, {
    genreSection,
    rattachementSection,
    REGIONS_ACADEMIQUES,
    regionDeAcademie,
  });
})();
