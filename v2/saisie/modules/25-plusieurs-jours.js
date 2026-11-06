/* PRISME — widget de saisie, module 25/34 : Faits sur plusieurs jours, report sur d'autres jours.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : UN_JOUR, MAX_JOURS, LIMITE_FUTUR_JOURS, jourCle, jourCourt, aideFaitsDefaut, plusieursJoursActif,
     estWeekEnd, joursEntre, joursSuivants, erreurJours, erreurPlusieursJours, versionsDe, dossierDuJour,
     majAideJours, reinitialiserJours, valeursSaisies, reprendreSurJours, pluriel, texteSerie, joursReport,
     erreurReport, majAideReport, ouvrirReport.
   Utilise :
     01 configuration : NATURE.
     03 variantes : etape, refId, reglagesSaisie, statut.
     04 date-faits : faitsAvecHeure, lireDateFaits, valeurLocale.
     05 etat : colonneDe, etatSaisie, valeurLigne.
     06 grist : enFile, idsCreesIci.
     09 dossier : comparerVersions, jourDesFaits, lireQualificationInitiale.
     10 champs : lireChamps.
     13 coherence : seulementModifies.
     15 onglets : avertirFaitsAnterieurs.
     16 description : MOTIF_MOBILISATION, ajouterMobilisation, dateParGrist, etablissementDuFormulaire,
       jourDeLaVersion, jourDeMobilisation, jourFaits, memeSite.
     21 tableaux-enregistrement : synchroniserTableaux, texteErreursTableaux.
     34 parcours : confirmer.
   Modifie etatSaisie : modifie. */
/* =========================================================
   Faits sur plusieurs jours (fermeture d'un campus du lundi au vendredi…) — un dossier par jour
   ---------------------------------------------------------
   Comme pour le reste du suivi, chaque jour a son propre signalement (dossier) ; ses mises à jour ne portent que sur
   les nouveautés de ce jour. « Plusieurs jours » crée donc, en plus de l'enregistrement habituel, un signalement par
   jour suivant (jusqu'au jour indiqué, jours ouvrés seulement si demandé). Un jour qui a déjà un signalement pour
   l'établissement (même site) en reçoit une mise à jour, si quelque chose change. Le jour de mobilisation de la
   description est recalculé pour chaque jour. Colonnes Date seulement (pas Date et heure).
   « Autres actions › Reporter sur d'autres jours » fait de même à partir d'un dossier ouvert, sans le modifier.
   ========================================================= */
const UN_JOUR = 86400,
  MAX_JOURS = 31,
  LIMITE_FUTUR_JOURS = 366;
const jourCle = (jourEnSecondes) => new Date(jourEnSecondes * 1000).toISOString().slice(0, 10); // colonne Date : minuit UTC
const jourCourt = (jourEnSecondes) =>
  new Date(jourEnSecondes * 1000).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  });
const aideFaitsDefaut = () =>
  reglagesSaisie().faitsFuturs
    ? "Aujourd'hui par défaut. Modifiez-la si les faits sont antérieurs, ou à venir (fermeture annoncée…)."
    : "Aujourd'hui par défaut. Modifiez-la si les faits signalés sont antérieurs.";
const plusieursJoursActif = () =>
  !!colonneDe("Date_faits") && reglagesSaisie().plusieursJours && !faitsAvecHeure() && $("plusieurs-jours").checked;
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
// « Plusieurs jours » du formulaire : jours suivant la date des faits, jusqu'à « Jusqu'au »
function joursSuivants() {
  if (!plusieursJoursActif()) return [];
  const debut = lireDateFaits(),
    fin = $("date-fin").value;
  return debut == null ? [] : joursEntre(jourCle(debut + UN_JOUR), fin, $("jours-ouvres").checked);
}
function erreurJours(joursAVerifier, total, fin, debutCle) {
  if (!fin) return "Indiquez le dernier jour.";
  if (fin <= debutCle) return "Le dernier jour doit suivre le premier.";
  if (total > MAX_JOURS) return `${total} jours : ${MAX_JOURS} au plus en une fois.`;
  if (!joursAVerifier.length) return "Aucun jour ouvré dans cette période.";
  if (!reglagesSaisie().faitsFuturs && joursAVerifier.some((jour) => jourCle(jour) > valeurLocale(new Date(), false)))
    return "Les jours postérieurs à aujourd'hui ne sont pas admis pour ce formulaire.";
  return "";
}
function erreurPlusieursJours() {
  if (!plusieursJoursActif()) return "";
  const debut = lireDateFaits();
  if (debut == null) return "";
  const messageErreur = erreurJours(joursSuivants(), joursSuivants().length + 1, $("date-fin").value, jourCle(debut));
  return messageErreur ? `Plusieurs jours : ${messageErreur.charAt(0).toLowerCase()}${messageErreur.slice(1)}` : "";
}
// Lignes d'un dossier ; signalement d'un établissement pour un jour donné (hors dossier ouvert)
const versionsDe = (dossierId) => {
  const colonneDossier = colonneDe("Dossier");
  return etatSaisie.enregistrements.filter(
    (ligne) => (refId(colonneDossier && ligne[colonneDossier]) || ligne.id) === dossierId,
  );
};
function dossierDuJour(etabId, jourEnSecondes) {
  if (!etabId) return null;
  const k = jourFaits(jourEnSecondes),
    colonneDossier = colonneDe("Dossier"),
    par = new Map();
  for (const ligne of etatSaisie.enregistrements) {
    if (refId(valeurLigne(ligne, "Etablissement")) !== etabId) continue;
    const dossierId = refId(colonneDossier && ligne[colonneDossier]) || ligne.id;
    if (dossierId === etatSaisie.dossierId) continue;
    if (!par.has(dossierId)) par.set(dossierId, []);
    par.get(dossierId).push(ligne);
  }
  for (const [dossierId, lignesDuDossier] of par) {
    if (!lignesDuDossier.some((ligne) => jourDeLaVersion(ligne) === k)) continue;
    const der = [...lignesDuDossier].sort(comparerVersions).pop();
    if (colonneDe("Site") && !memeSite($("site").value, valeurLigne(der, "Site"))) continue; // autre site du même établissement
    return { d: dossierId, derniere: der };
  }
  return null;
}
function majAideJours() {
  if ($("bloc-plusieurs-jours").hidden) return;
  const actif = $("plusieurs-jours").checked,
    aide = $("aide-jours"),
    sug = $("suggestion-jours");
  $("bloc-jusquau").hidden = !actif;
  const etabId = etablissementDuFormulaire(),
    choisi = lireDateFaits();
  // mise à jour d'un dossier alors que l'établissement a des signalements les jours suivants : proposer de les mettre à jour aussi
  sug.hidden = true;
  if (!actif && etatSaisie.dossierId && etabId && choisi != null) {
    let fin = null;
    for (
      let jourEnSecondes = choisi + UN_JOUR, compteur = 0;
      compteur < MAX_JOURS;
      jourEnSecondes += UN_JOUR, compteur++
    ) {
      if (dossierDuJour(etabId, jourEnSecondes)) fin = jourEnSecondes;
      else if (!estWeekEnd(jourEnSecondes)) break;
    }
    if (fin) {
      sug.hidden = false;
      sug.innerHTML = `Cet établissement a aussi des signalements les jours suivants, jusqu'au ${esc(jourCourt(fin))}. <button type="button" class="lien-texte" id="btn-jusqu-derniere">Leur appliquer aussi cette mise à jour</button>`;
      $("btn-jusqu-derniere").addEventListener("click", () => {
        $("plusieurs-jours").checked = true;
        $("date-fin").value = jourCle(fin);
        etatSaisie.modifie = true;
        avertirFaitsAnterieurs();
      });
    }
  }
  if (!actif) {
    aide.hidden = true;
    return;
  }
  const messageErreur = erreurPlusieursJours(),
    jours = joursSuivants();
  aide.hidden = false;
  aide.classList.toggle("err", !!messageErreur);
  if (messageErreur) {
    aide.textContent = messageErreur;
    return;
  }
  const deja = jours.filter((jour) => dossierDuJour(etabId, jour));
  aide.textContent =
    `${jours.length + 1} signalements, un par jour : ${[choisi, ...jours].map(jourCourt).join(", ")}${etatSaisie.dossierId ? " (le premier est cette mise à jour)" : ""}.` +
    (deja.length
      ? ` Déjà signalé${deja.length > 1 ? "s" : ""} ces jours-là, mis à jour : ${deja.map(jourCourt).join(", ")}.`
      : "");
}
function reinitialiserJours() {
  $("plusieurs-jours").checked = false;
  $("date-fin").value = "";
  $("jours-ouvres").checked = false;
  $("bloc-jusquau").hidden = true;
  $("aide-jours").hidden = true;
  $("suggestion-jours").hidden = true;
}
// Réponses du formulaire, au format enregistré (sans établissement, dossier ni date)
function valeursSaisies(manquants = []) {
  const valeurs = { ...lireChamps("q", etatSaisie.defsQuestions, manquants) },
    qualif = lireQualificationInitiale();
  if (colonneDe("Description")) valeurs[colonneDe("Description")] = $("description").value.trim();
  if (colonneDe("Site")) valeurs[colonneDe("Site")] = $("site").value.trim();
  if (colonneDe("Qualification"))
    valeurs[colonneDe("Qualification")] = Array.isArray(qualif) ? (qualif.length ? ["L", ...qualif] : null) : qualif;
  return valeurs;
}
// Un signalement par jour : nouveau dossier, ou mise à jour du signalement que l'établissement a déjà ce jour-là
async function reprendreSurJours(etabId, valeurs, jours, origine) {
  const table = grist.getTable(),
    colonneDescription = colonneDe("Description"),
    colonneDateFaits = colonneDe("Date_faits"),
    cDos = colonneDe("Dossier");
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
    const dossierExistant = dossierDuJour(etabId, jourEnSecondes);
    if (dossierExistant) {
      const { [colonneDateFaits]: _, ...sansDate } = valeursDuJour;
      if (!Object.keys(seulementModifies(etatSaisie.champsVersion, sansDate, dossierExistant.derniere)).length) {
        inchanges.push(jourEnSecondes);
        continue;
      }
      if (cDos) champsAEnregistrer[cDos] = dossierExistant.d;
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
  const ids = (reponse) =>
    (Array.isArray(reponse) ? reponse : [reponse])
      .map((valeur) => (valeur && typeof valeur === "object" ? valeur.id : valeur))
      .filter((valeur) => typeof valeur === "number");
  let nouveaux = [];
  if (creer.length) {
    nouveaux = ids(
      await etape("Création des signalements des jours suivants", etatSaisie.tableId || "réponses", () =>
        table.create(creer.map((jourACreer) => ({ fields: jourACreer.fields }))),
      ),
    );
    nouveaux.forEach((id) => idsCreesIci.add(id));
    if (cDos && nouveaux.length)
      await etape("Rattachement de chaque signalement à son propre dossier", etatSaisie.tableId || "réponses", () =>
        table.update(nouveaux.map((id) => ({ id, fields: { [cDos]: id } }))),
      );
  }
  let idsCompletes = [];
  if (completer.length)
    (idsCompletes = ids(
      await etape("Mise à jour des signalements des jours suivants", etatSaisie.tableId || "réponses", () =>
        table.create(completer.map((jourACompleter) => ({ fields: jourACompleter.fields }))),
      ),
    )).forEach((id) => idsCreesIci.add(id));
  // questions « tableau » : chaque dossier reçoit ses lignes dans la table dédiée (avec la version créée)
  const errT = [];
  for (const idNouveau of nouveaux) errT.push(...(await synchroniserTableaux(idNouveau, true, idNouveau)));
  for (const [k, jourACompleter] of completer.entries())
    errT.push(...(await synchroniserTableaux(jourACompleter.d, true, idsCompletes[k] || null)));
  return {
    jours,
    crees: nouveaux.length,
    joursCrees: creer.map((jourACreer) => jourACreer.t),
    completes: completer.map((jourACompleter) => jourACompleter.t),
    inchanges,
    errT,
  };
}
const pluriel = (nombre, singulier, formePlurielle) => `${nombre} ${nombre > 1 ? formePlurielle : singulier}`;
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

/* ---------- « Reporter sur d'autres jours » ---------- */
const joursReport = () => joursEntre($("rep-debut").value, $("rep-fin").value, $("rep-ouvres").checked);
function erreurReport() {
  const debut = $("rep-debut").value,
    fin = $("rep-fin").value;
  if (!debut) return "Indiquez le premier jour.";
  const jourDossier =
    etatSaisie.derniere && jourDesFaits(etatSaisie.derniere) != null
      ? jourCle(jourDesFaits(etatSaisie.derniere))
      : null;
  const joursAReporter = joursReport().filter((jour) => jourCle(jour) !== jourDossier);
  if (fin < debut) return "Le dernier jour doit suivre le premier.";
  return erreurJours(
    joursAReporter,
    joursAReporter.length,
    fin,
    jourCle(Date.parse(debut + "T00:00:00Z") / 1000 - UN_JOUR),
  );
}
function majAideReport() {
  const aide = $("rep-aide"),
    messageErreur = erreurReport();
  aide.classList.toggle("err", !!messageErreur);
  if (messageErreur) {
    aide.textContent = messageErreur;
    return;
  }
  const jourDossier =
    etatSaisie.derniere && jourDesFaits(etatSaisie.derniere) != null
      ? jourCle(jourDesFaits(etatSaisie.derniere))
      : null;
  const joursAReporter = joursReport().filter((jour) => jourCle(jour) !== jourDossier),
    etabId = refId(valeurLigne(etatSaisie.initiale, "Etablissement"));
  const deja = joursAReporter.filter((jour) => dossierDuJour(etabId, jour));
  aide.textContent =
    `${pluriel(joursAReporter.length, "jour", "jours")} : ${joursAReporter.map(jourCourt).join(", ")}.` +
    (deja.length
      ? ` Déjà signalé${deja.length > 1 ? "s" : ""} ces jours-là, mis à jour : ${deja.map(jourCourt).join(", ")}.`
      : "") +
    (etatSaisie.modifie
      ? " Vos modifications non enregistrées sont reprises dans ces signalements (ce dossier-ci reste inchangé)."
      : "");
}
function ouvrirReport() {
  if (!etatSaisie.dossierId || !etatSaisie.derniere || !etatSaisie.initiale) return;
  const jourReference =
    jourDesFaits(etatSaisie.derniere) ?? Date.parse(valeurLocale(new Date(), false) + "T00:00:00Z") / 1000;
  $("rep-debut").value = $("rep-fin").value = jourCle(jourReference + UN_JOUR);
  $("rep-ouvres").checked = false;
  statut("rep-statut", "");
  majAideReport();
  $("dlg-reporter").showModal();
  $("rep-fin").focus();
}
["rep-debut", "rep-fin", "rep-ouvres"].forEach((id) =>
  $(id).addEventListener("change", () => {
    if (id === "rep-debut" && $("rep-fin").value < $("rep-debut").value) $("rep-fin").value = $("rep-debut").value;
    majAideReport();
  }),
);
$("rep-annuler").addEventListener("click", () => $("dlg-reporter").close());
$("rep-ok").addEventListener("click", () =>
  enFile(async () => {
    const messageErreur = erreurReport();
    if (messageErreur) {
      statut("rep-statut", messageErreur, "err");
      return;
    }
    const jourDossier = jourDesFaits(etatSaisie.derniere) != null ? jourCle(jourDesFaits(etatSaisie.derniere)) : null;
    const jours = joursReport().filter((jour) => jourCle(jour) !== jourDossier);
    $("rep-ok").disabled = true;
    try {
      const resultat = await reprendreSurJours(
        refId(valeurLigne(etatSaisie.initiale, "Etablissement")),
        valeursSaisies([]),
        jours,
        jourDesFaits(etatSaisie.derniere),
      );
      $("dlg-reporter").close();
      const texteResume = texteSerie(resultat).trim();
      statut("statut-signalement", texteResume, resultat.errT.length ? "err" : "ok");
      confirmer("Signalement reporté", `${texteResume.charAt(0).toUpperCase()}${texteResume.slice(1)}`);
    } catch (erreur) {
      statut("rep-statut", `Échec : ${erreur.message || erreur}`, "err");
    } finally {
      $("rep-ok").disabled = false;
    }
  }),
);
