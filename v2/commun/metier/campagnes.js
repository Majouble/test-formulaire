/* =====================================================================
   PRISME — règles métier : campagnes de sollicitation des établissements (onglet Établissements)
   ---------------------------------------------------------------------
   Clé « campagnes » de Config = { liste: [{ id, nom, referentiel, crit: { colonne: [valeurs] }, recherche, avecMail,
   mode: "une" | "quotidienne", debut (secondes), fin (secondes | null), close, message: { objet, corps } }] }.
   Un établissement visé a répondu s'il a enregistré un signalement (ou « Rien à signaler ») depuis le lancement
   (mode « une »), ou ce jour-là (mode « quotidienne »).
   Chargé par chaque page, après commun/socle.js.

   Définit (sur window.Socle) : MODES_CAMPAGNE, campagnes, campagneEnCours, valeursCellule, campagneVise, jourParis,
     reponseCompte.
   Utilise (window.Socle) : normaliser.
   ===================================================================== */
(function () {
  "use strict";

  const { normaliser } = window.Socle;

  const MODES_CAMPAGNE = { une: "Une réponse attendue", quotidienne: "Une réponse attendue chaque jour" };
  const campagnes = (config) =>
    ((config && config.valeurs && config.valeurs.campagnes && config.valeurs.campagnes.liste) || []).filter(
      (campagne) => campagne && campagne.id,
    );
  const campagneEnCours = (campagne, instant = Date.now() / 1000) =>
    !!campagne &&
    !campagne.close &&
    (!campagne.debut || campagne.debut <= instant) &&
    (!campagne.fin || instant <= campagne.fin);
  const valeursCellule = (valeur) =>
    (Array.isArray(valeur) ? (valeur[0] === "L" ? valeur.slice(1) : valeur) : [valeur])
      .map((element) => (element == null ? "" : String(element).trim()))
      .filter(Boolean);
  // L'établissement (ligne du référentiel { colonne: valeur }) est-il visé par la campagne ? colonnes : { nom, uai, commune, mail }
  function campagneVise(campagne, ligne, colonnes) {
    if (!campagne || !ligne) return false;
    for (const [colonne, valeurs] of Object.entries(campagne.crit || {}))
      if (
        Array.isArray(valeurs) &&
        valeurs.length &&
        !valeursCellule(ligne[colonne]).some((valeur) => valeurs.includes(valeur))
      )
        return false;
    if (campagne.avecMail && colonnes && colonnes.mail && !String(ligne[colonnes.mail] || "").trim()) return false;
    const recherche = normaliser(campagne.recherche || "");
    if (recherche && colonnes) {
      const texte = normaliser(
        [colonnes.nom, colonnes.uai, colonnes.commune]
          .filter(Boolean)
          .map((colonne) => ligne[colonne])
          .join(" "),
      );
      if (!texte.includes(recherche)) return false;
    }
    return true;
  }
  // Jour civil à Paris (AAAA-MM-JJ) d'un instant en secondes
  const formatJour = new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const jourParis = (secondes) =>
    secondes == null || secondes === "" ? "" : formatJour.format(new Date(Number(secondes) * 1000));
  // Réponse attendue : saisie (en secondes) qui compte pour la campagne, le jour donné (AAAA-MM-JJ, mode quotidien)
  function reponseCompte(campagne, saisie, jour) {
    if (saisie == null || saisie === "" || (campagne.debut && saisie < campagne.debut)) return false;
    return campagne.mode === "quotidienne" ? jourParis(saisie) === (jour || jourParis(Date.now() / 1000)) : true;
  }

  Object.assign(window.Socle, {
    MODES_CAMPAGNE,
    campagnes,
    campagneEnCours,
    valeursCellule,
    campagneVise,
    jourParis,
    reponseCompte,
  });
})();
