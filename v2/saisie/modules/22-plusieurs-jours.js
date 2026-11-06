/* PRISME — widget de saisie, module 22/31 : Faits sur plusieurs jours, report sur d'autres jours.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
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
const jourCle = (t) => new Date(t * 1000).toISOString().slice(0, 10); // colonne Date : minuit UTC
const jourCourt = (t) =>
  new Date(t * 1000).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  });
const aideFaitsDefaut = () =>
  S().faitsFuturs
    ? "Aujourd'hui par défaut. Modifiez-la si les faits sont antérieurs, ou à venir (fermeture annoncée…)."
    : "Aujourd'hui par défaut. Modifiez-la si les faits signalés sont antérieurs.";
const plusieursJoursActif = () =>
  !!col("Date_faits") && S().plusieursJours && !faitsAvecHeure() && $("plusieurs-jours").checked;
const estWeekEnd = (t) => [0, 6].includes(new Date(t * 1000).getUTCDay());
// Jours du « du » au « au » inclus (dates AAAA-MM-JJ), en secondes au format Grist
function joursEntre(debut, fin, ouvres) {
  if (!debut || !fin || fin < debut) return [];
  const res = [];
  for (let t = Date.parse(debut + "T00:00:00Z") / 1000, n = 0; jourCle(t) <= fin && n < 400; t += UN_JOUR, n++)
    if (!(ouvres && estWeekEnd(t))) res.push(t);
  return res;
}
// « Plusieurs jours » du formulaire : jours suivant la date des faits, jusqu'à « Jusqu'au »
function joursSuivants() {
  if (!plusieursJoursActif()) return [];
  const debut = lireDateFaits(),
    fin = $("date-fin").value;
  return debut == null ? [] : joursEntre(jourCle(debut + UN_JOUR), fin, $("jours-ouvres").checked);
}
function erreurJours(l, total, fin, debutCle) {
  if (!fin) return "Indiquez le dernier jour.";
  if (fin <= debutCle) return "Le dernier jour doit suivre le premier.";
  if (total > MAX_JOURS) return `${total} jours : ${MAX_JOURS} au plus en une fois.`;
  if (!l.length) return "Aucun jour ouvré dans cette période.";
  if (!S().faitsFuturs && l.some((t) => jourCle(t) > valeurLocale(new Date(), false)))
    return "Les jours postérieurs à aujourd'hui ne sont pas admis pour ce formulaire.";
  return "";
}
function erreurPlusieursJours() {
  if (!plusieursJoursActif()) return "";
  const debut = lireDateFaits();
  if (debut == null) return "";
  const e = erreurJours(joursSuivants(), joursSuivants().length + 1, $("date-fin").value, jourCle(debut));
  return e ? `Plusieurs jours : ${e.charAt(0).toLowerCase()}${e.slice(1)}` : "";
}
// Lignes d'un dossier ; signalement d'un établissement pour un jour donné (hors dossier ouvert)
const versionsDe = (d) => {
  const cD = col("Dossier");
  return etatSaisie.enregistrements.filter((l) => (refId(cD && l[cD]) || l.id) === d);
};
function dossierDuJour(etabId, t) {
  if (!etabId) return null;
  const k = jourFaits(t),
    cD = col("Dossier"),
    par = new Map();
  for (const l of etatSaisie.enregistrements) {
    if (refId(val(l, "Etablissement")) !== etabId) continue;
    const d = refId(cD && l[cD]) || l.id;
    if (d === etatSaisie.dossierId) continue;
    if (!par.has(d)) par.set(d, []);
    par.get(d).push(l);
  }
  for (const [d, ls] of par) {
    if (!ls.some((l) => jourDeLaVersion(l) === k)) continue;
    const der = [...ls].sort(comparerVersions).pop();
    if (col("Site") && !memeSite($("site").value, val(der, "Site"))) continue; // autre site du même établissement
    return { d, derniere: der };
  }
  return null;
}
function majAideJours() {
  if ($("bloc-plusieurs-jours").hidden) return;
  const actif = $("plusieurs-jours").checked,
    a = $("aide-jours"),
    sug = $("suggestion-jours");
  $("bloc-jusquau").hidden = !actif;
  const etabId = etablissementDuFormulaire(),
    choisi = lireDateFaits();
  // mise à jour d'un dossier alors que l'établissement a des signalements les jours suivants : proposer de les mettre à jour aussi
  sug.hidden = true;
  if (!actif && etatSaisie.dossierId && etabId && choisi != null) {
    let fin = null;
    for (let t = choisi + UN_JOUR, n = 0; n < MAX_JOURS; t += UN_JOUR, n++) {
      if (dossierDuJour(etabId, t)) fin = t;
      else if (!estWeekEnd(t)) break;
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
    a.hidden = true;
    return;
  }
  const err = erreurPlusieursJours(),
    l = joursSuivants();
  a.hidden = false;
  a.classList.toggle("err", !!err);
  if (err) {
    a.textContent = err;
    return;
  }
  const deja = l.filter((t) => dossierDuJour(etabId, t));
  a.textContent =
    `${l.length + 1} signalements, un par jour : ${[choisi, ...l].map(jourCourt).join(", ")}${etatSaisie.dossierId ? " (le premier est cette mise à jour)" : ""}.` +
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
  if (col("Description")) valeurs[col("Description")] = $("description").value.trim();
  if (col("Site")) valeurs[col("Site")] = $("site").value.trim();
  if (col("Qualification"))
    valeurs[col("Qualification")] = Array.isArray(qualif) ? (qualif.length ? ["L", ...qualif] : null) : qualif;
  return valeurs;
}
// Un signalement par jour : nouveau dossier, ou mise à jour du signalement que l'établissement a déjà ce jour-là
async function reprendreSurJours(etabId, valeurs, jours, origine) {
  const table = grist.getTable(),
    cD = col("Description"),
    cF = col("Date_faits"),
    cDos = col("Dossier");
  const creer = [],
    completer = [],
    inchanges = [];
  for (const t of jours) {
    const v = { ...valeurs, [cF]: t };
    if (cD && typeof v[cD] === "string" && etatSaisie.optionsAuto.mobilisation && MOTIF_MOBILISATION.test(v[cD]))
      v[cD] = ajouterMobilisation(v[cD], etatSaisie.optionsAuto, jourDeMobilisation(t, jours));
    const f = { ...v, [col("Etablissement")]: etabId };
    if (col("Date") && !dateParGrist()) f[col("Date")] = Date.now() / 1000;
    const ex = dossierDuJour(etabId, t);
    if (ex) {
      const { [cF]: _, ...sansDate } = v;
      if (!Object.keys(seulementModifies(etatSaisie.champsVersion, sansDate, ex.derniere)).length) {
        inchanges.push(t);
        continue;
      }
      if (cDos) f[cDos] = ex.d;
      if (col("Nature")) f[col("Nature")] = NATURE.suivi;
      if (col("Commentaire"))
        f[col("Commentaire")] = origine != null ? `Reprise du signalement du ${jourCourt(origine)}.` : "";
      completer.push({ t, d: ex.d, fields: f });
    } else {
      if (col("Nature")) f[col("Nature")] = NATURE.initial;
      creer.push({ t, fields: f });
    }
  }
  const ids = (r) =>
    (Array.isArray(r) ? r : [r])
      .map((x) => (x && typeof x === "object" ? x.id : x))
      .filter((x) => typeof x === "number");
  let nouveaux = [];
  if (creer.length) {
    nouveaux = ids(
      await etape("Création des signalements des jours suivants", etatSaisie.tableId || "réponses", () =>
        table.create(creer.map((x) => ({ fields: x.fields }))),
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
        table.create(completer.map((x) => ({ fields: x.fields }))),
      ),
    )).forEach((id) => idsCreesIci.add(id));
  // questions « tableau » : chaque dossier reçoit ses lignes dans la table dédiée (avec la version créée)
  const errT = [];
  for (const d of nouveaux) errT.push(...(await synchroniserTableaux(d, true, d)));
  for (const [k, x] of completer.entries())
    errT.push(...(await synchroniserTableaux(x.d, true, idsCompletes[k] || null)));
  return {
    jours,
    crees: nouveaux.length,
    joursCrees: creer.map((x) => x.t),
    completes: completer.map((x) => x.t),
    inchanges,
    errT,
  };
}
const pluriel = (n, s, p) => `${n} ${n > 1 ? p : s}`;
const texteSerie = (r) =>
  !r
    ? ""
    : " " +
      [
        r.crees
          ? `${pluriel(r.crees, "signalement créé", "signalements créés")} (${r.joursCrees.map(jourCourt).join(", ")})`
          : "",
        r.completes.length
          ? `${pluriel(r.completes.length, "signalement existant mis à jour", "signalements existants mis à jour")} (${r.completes.map(jourCourt).join(", ")})`
          : "",
        r.inchanges.length ? `déjà à jour : ${r.inchanges.map(jourCourt).join(", ")}` : "",
      ]
        .filter(Boolean)
        .join(" ; ") +
      "." +
      texteErreursTableaux(r.errT || []);

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
  const l = joursReport().filter((t) => jourCle(t) !== jourDossier);
  if (fin < debut) return "Le dernier jour doit suivre le premier.";
  return erreurJours(l, l.length, fin, jourCle(Date.parse(debut + "T00:00:00Z") / 1000 - UN_JOUR));
}
function majAideReport() {
  const a = $("rep-aide"),
    err = erreurReport();
  a.classList.toggle("err", !!err);
  if (err) {
    a.textContent = err;
    return;
  }
  const jourDossier =
    etatSaisie.derniere && jourDesFaits(etatSaisie.derniere) != null
      ? jourCle(jourDesFaits(etatSaisie.derniere))
      : null;
  const l = joursReport().filter((t) => jourCle(t) !== jourDossier),
    etabId = refId(val(etatSaisie.initiale, "Etablissement"));
  const deja = l.filter((t) => dossierDuJour(etabId, t));
  a.textContent =
    `${pluriel(l.length, "jour", "jours")} : ${l.map(jourCourt).join(", ")}.` +
    (deja.length
      ? ` Déjà signalé${deja.length > 1 ? "s" : ""} ces jours-là, mis à jour : ${deja.map(jourCourt).join(", ")}.`
      : "") +
    (etatSaisie.modifie
      ? " Vos modifications non enregistrées sont reprises dans ces signalements (ce dossier-ci reste inchangé)."
      : "");
}
function ouvrirReport() {
  if (!etatSaisie.dossierId || !etatSaisie.derniere || !etatSaisie.initiale) return;
  const ref = jourDesFaits(etatSaisie.derniere) ?? Date.parse(valeurLocale(new Date(), false) + "T00:00:00Z") / 1000;
  $("rep-debut").value = $("rep-fin").value = jourCle(ref + UN_JOUR);
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
    const err = erreurReport();
    if (err) {
      statut("rep-statut", err, "err");
      return;
    }
    const jourDossier = jourDesFaits(etatSaisie.derniere) != null ? jourCle(jourDesFaits(etatSaisie.derniere)) : null;
    const jours = joursReport().filter((t) => jourCle(t) !== jourDossier);
    $("rep-ok").disabled = true;
    try {
      const r = await reprendreSurJours(
        refId(val(etatSaisie.initiale, "Etablissement")),
        valeursSaisies([]),
        jours,
        jourDesFaits(etatSaisie.derniere),
      );
      $("dlg-reporter").close();
      const t = texteSerie(r).trim();
      statut("statut-signalement", t, r.errT.length ? "err" : "ok");
      confirmer("Signalement reporté", `${t.charAt(0).toUpperCase()}${t.slice(1)}`);
    } catch (e) {
      statut("rep-statut", `Échec : ${e.message || e}`, "err");
    } finally {
      $("rep-ok").disabled = false;
    }
  }),
);
