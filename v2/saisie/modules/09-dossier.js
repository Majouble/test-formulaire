/* PRISME — widget de saisie, module 09/34 : Données du dossier et qualification initiale.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : jourDesFaits, comparerVersions, calculerVersions, rafraichir, ouvrirDossier, styleChoix, listeQualif,
     estiloPastille, afficherChoix, lireChoix, lireChoixMulti, lireQualificationInitiale, cocherQualif.
   Utilise :
     03 variantes : refId, statut.
     04 date-faits : secondes.
     05 etat : colonneDe, etabDeLigne, etatSaisie, valeurLigne.
     07 formulaires : rafraichirEtabs, verifierFormulairePublie.
     15 onglets : afficherDossier, passerEnCreation.
     18 liste-dossiers : majListeDossiers.
     28 enregistrement : remplirFormulaire.
     30 visas : remplirVisas.
   Modifie etatSaisie : demandeAffichage, derniere, dossierId, etabCourant, initiale, modifie, modifieVisa,
     selectionAttendue, versions. */
/* =========================================================
   Données du dossier (à partir des lignes déjà reçues)
   ========================================================= */
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
  const colonneDossier = colonneDe("Dossier");
  const lignes = etatSaisie.enregistrements.filter(
    (ligne) => (refId(colonneDossier && ligne[colonneDossier]) || ligne.id) === etatSaisie.dossierId,
  );
  lignes.sort(comparerVersions);
  etatSaisie.versions = lignes;
  etatSaisie.initiale = lignes.find((ligne) => ligne.id === etatSaisie.dossierId) || lignes[0] || null;
  etatSaisie.derniere = lignes[lignes.length - 1] || null;
}

async function rafraichir() {
  verifierFormulairePublie().catch(() => {});
  if (
    etatSaisie.selectionAttendue &&
    etatSaisie.enregistrements.some((ligne) => ligne.id === etatSaisie.selectionAttendue)
  ) {
    const id = etatSaisie.selectionAttendue;
    etatSaisie.selectionAttendue = null;
    const ligneAttendue = etatSaisie.enregistrements.find((ligne) => ligne.id === id);
    await ouvrirDossier(refId(colonneDe("Dossier") && ligneAttendue[colonneDe("Dossier")]) || id, true);
    return;
  }
  majListeDossiers();
  if (!etatSaisie.dossierId) return;
  calculerVersions();
  if (!etatSaisie.initiale) {
    await passerEnCreation();
    return;
  }
  if (!etatSaisie.modifie) await remplirFormulaire();
  if (!etatSaisie.modifieVisa) await remplirVisas();
  afficherDossier();
}

async function ouvrirDossier(idDossier, force) {
  const demande = ++etatSaisie.demandeAffichage; // un clic plus récent annule celui-ci
  const meme = idDossier === etatSaisie.dossierId && !force;
  // Dossier encore absent des données reçues (ligne en cours de création ailleurs) : on ne change rien,
  // pour ne jamais associer le formulaire affiché à un autre dossier.
  const avant = {
    dossierId: etatSaisie.dossierId,
    versions: etatSaisie.versions,
    initiale: etatSaisie.initiale,
    derniere: etatSaisie.derniere,
  };
  etatSaisie.dossierId = idDossier;
  calculerVersions();
  if (!etatSaisie.initiale) {
    ({
      dossierId: etatSaisie.dossierId,
      versions: etatSaisie.versions,
      initiale: etatSaisie.initiale,
      derniere: etatSaisie.derniere,
    } = avant);
    return;
  }
  if (!meme) {
    etatSaisie.modifie = etatSaisie.modifieVisa = false;
    ["statut-signalement", "statut-dep", "statut-aca"].forEach((idStatut) => statut(idStatut, ""));
  }
  // Le référentiel n'est relu que si l'établissement du dossier y est inconnu (sinon, on se contente
  // du cache : un établissement sans mail ni lien est un cas normal, pas une raison de tout recharger).
  const etablissementInitial = etabDeLigne(etatSaisie.initiale),
    idE = refId(valeurLigne(etatSaisie.initiale, "Etablissement"));
  // établissement inconnu : relu seulement s'il a pu être créé depuis la dernière lecture (numéro plus grand que
  // tous ceux connus), et pas plus d'une fois par minute (une référence invalide ne doit pas relancer la lecture)
  if (
    !etablissementInitial &&
    etatSaisie.etabsCharges &&
    idE &&
    idE > etatSaisie.idEtabMax &&
    Date.now() - etatSaisie.dernierChargementEtabs > 60000
  ) {
    await rafraichirEtabs(true);
    if (demande !== etatSaisie.demandeAffichage) return;
  }
  etatSaisie.etabCourant = etabDeLigne(etatSaisie.initiale);
  if (!meme || !etatSaisie.modifie) await remplirFormulaire();
  if (demande !== etatSaisie.demandeAffichage) return;
  if (!meme || !etatSaisie.modifieVisa) await remplirVisas();
  if (demande !== etatSaisie.demandeAffichage) return;
  afficherDossier();
}

/* =========================================================
   Qualification initiale
   ========================================================= */
function styleChoix(etiquetteChoix, choix, carte) {
  const couleurChoix = (carte || etatSaisie.couleurs)[choix] || {};
  etiquetteChoix.style.setProperty("--c", couleurChoix.fillColor ? couleurChoix.textColor || "#161616" : "var(--bleu)");
  etiquetteChoix.style.setProperty("--c-bg", couleurChoix.fillColor || "var(--bleu-clair)");
}
// Décode une valeur de qualification, qu'elle arrive encodée par Grist (["L", ...]), déjà sous
// forme de tableau, ou comme simple chaîne à choix unique.
function listeQualif(valeur) {
  if (Array.isArray(valeur)) return valeur[0] === "L" ? valeur.slice(1) : valeur;
  return valeur ? [valeur] : [];
}
function estiloPastille(choix) {
  const couleurChoix = etatSaisie.couleurs[choix] || {};
  return `--c:${couleurChoix.fillColor ? couleurChoix.textColor || "#161616" : "var(--bleu)"};--c-bg:${couleurChoix.fillColor || "var(--bleu-clair)"}`;
}
function afficherChoix(conteneurId, nom) {
  const cont = $(conteneurId);
  const avant = listeQualif(etatSaisie.qualifMultiple ? lireChoixMulti(nom) : lireChoix(nom));
  cont.innerHTML = "";
  if (!etatSaisie.choix.length) {
    cont.innerHTML = `<input type="text" data-libre="${nom}" aria-label="Qualification">`;
    cont.querySelector("input").value = avant.join(", ");
    cont.querySelector("input").addEventListener("input", () => {
      etatSaisie.modifie = true;
    });
    return;
  }
  const multi = nom === "qualif-initiale" && etatSaisie.qualifMultiple;
  etatSaisie.choix.forEach((choix) => {
    const lab = document.createElement("label");
    lab.className = "choix";
    styleChoix(lab, choix);
    lab.innerHTML = `<input type="${multi ? "checkbox" : "radio"}" name="${nom}" value="${esc(choix)}"><span>${esc(choix)}</span>`;
    const inp = lab.querySelector("input");
    inp.checked = avant.includes(choix);
    inp.addEventListener("change", () => {
      etatSaisie.modifie = true;
    });
    cont.appendChild(lab);
  });
}
function lireChoix(nom) {
  const boutonCoche = document.querySelector(`input[name="${nom}"]:checked`);
  if (boutonCoche) return boutonCoche.value;
  const champLibre = document.querySelector(`[data-libre="${nom}"]`);
  return champLibre ? champLibre.value.trim() : "";
}
function lireChoixMulti(nom) {
  return [...document.querySelectorAll(`input[name="${nom}"]:checked`)].map((bouton) => bouton.value);
}
// Valeur de la qualification initiale telle que choisie dans le formulaire : une chaîne à choix
// unique, ou un tableau si la colonne accepte plusieurs valeurs.
function lireQualificationInitiale() {
  if (!etatSaisie.choix.length) {
    const champLibre = document.querySelector('[data-libre="qualif-initiale"]');
    return champLibre ? champLibre.value.trim() : "";
  }
  return etatSaisie.qualifMultiple ? lireChoixMulti("qualif-initiale") : lireChoix("qualif-initiale");
}
function cocherQualif(valeur) {
  const liste = listeQualif(valeur);
  if (etatSaisie.qualifMultiple) {
    document
      .querySelectorAll('input[name="qualif-initiale"]')
      .forEach((bouton) => (bouton.checked = liste.includes(bouton.value)));
  } else {
    document
      .querySelectorAll('input[name="qualif-initiale"]')
      .forEach((bouton) => (bouton.checked = bouton.value === (liste[0] ?? "")));
  }
  const champLibre = document.querySelector('[data-libre="qualif-initiale"]');
  if (champLibre) champLibre.value = liste.join(", ");
}
