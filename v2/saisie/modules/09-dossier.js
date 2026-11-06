/* PRISME — widget de saisie, module 09/31 : Données du dossier et qualification initiale.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* =========================================================
   Données du dossier (à partir des lignes déjà reçues)
   ========================================================= */
/* Ordre des versions : par date des faits (colonne associée « Date des faits »), puis par date de saisie,
   puis par ordre de création. Une version sans date des faits est classée à sa date de saisie.
   La dernière version est donc celle qui décrit les faits les plus récents ; une version saisie tard
   pour des faits plus anciens prend sa place dans l'historique sans devenir la dernière. */
function jourDesFaits(l) {
  const f = col("Date_faits") ? secondes(l[col("Date_faits")]) : null;
  return f != null ? f : secondes(col("Date") ? l[col("Date")] : null);
}
function comparerVersions(a, b) {
  const fa = jourDesFaits(a) ?? Infinity,
    fb = jourDesFaits(b) ?? Infinity;
  if (fa !== fb) return fa - fb;
  const sa = secondes(col("Date") ? a[col("Date")] : null) ?? Infinity,
    sb = secondes(col("Date") ? b[col("Date")] : null) ?? Infinity;
  return sa - sb || a.id - b.id;
}
function calculerVersions() {
  const cD = col("Dossier");
  const lignes = enregistrements.filter((l) => (refId(cD && l[cD]) || l.id) === dossierId);
  lignes.sort(comparerVersions);
  versions = lignes;
  initiale = lignes.find((l) => l.id === dossierId) || lignes[0] || null;
  derniere = lignes[lignes.length - 1] || null;
}

async function rafraichir() {
  verifierFormulairePublie().catch(() => {});
  if (selectionAttendue && enregistrements.some((l) => l.id === selectionAttendue)) {
    const id = selectionAttendue;
    selectionAttendue = null;
    const r = enregistrements.find((l) => l.id === id);
    await ouvrirDossier(refId(col("Dossier") && r[col("Dossier")]) || id, true);
    return;
  }
  majListeDossiers();
  if (!dossierId) return;
  calculerVersions();
  if (!initiale) {
    await passerEnCreation();
    return;
  }
  if (!modifie) await remplirFormulaire();
  if (!modifieVisa) await remplirVisas();
  afficherDossier();
}

let demandeAffichage = 0;
async function ouvrirDossier(d, force) {
  const demande = ++demandeAffichage; // un clic plus récent annule celui-ci
  const meme = d === dossierId && !force;
  // Dossier encore absent des données reçues (ligne en cours de création ailleurs) : on ne change rien,
  // pour ne jamais associer le formulaire affiché à un autre dossier.
  const avant = { dossierId, versions, initiale, derniere };
  dossierId = d;
  calculerVersions();
  if (!initiale) {
    ({ dossierId, versions, initiale, derniere } = avant);
    return;
  }
  if (!meme) {
    modifie = modifieVisa = false;
    ["statut-signalement", "statut-dep", "statut-aca"].forEach((s) => statut(s, ""));
  }
  // Le référentiel n'est relu que si l'établissement du dossier y est inconnu (sinon, on se contente
  // du cache : un établissement sans mail ni lien est un cas normal, pas une raison de tout recharger).
  const e0 = etabDeLigne(initiale),
    idE = refId(val(initiale, "Etablissement"));
  // établissement inconnu : relu seulement s'il a pu être créé depuis la dernière lecture (numéro plus grand que
  // tous ceux connus), et pas plus d'une fois par minute (une référence invalide ne doit pas relancer la lecture)
  if (!e0 && etabsCharges && idE && idE > idEtabMax && Date.now() - dernierChargementEtabs > 60000) {
    await rafraichirEtabs(true);
    if (demande !== demandeAffichage) return;
  }
  etabCourant = etabDeLigne(initiale);
  if (!meme || !modifie) await remplirFormulaire();
  if (demande !== demandeAffichage) return;
  if (!meme || !modifieVisa) await remplirVisas();
  if (demande !== demandeAffichage) return;
  afficherDossier();
}

/* =========================================================
   Qualification initiale
   ========================================================= */
function styleChoix(el, v, carte) {
  const c = (carte || couleurs)[v] || {};
  el.style.setProperty("--c", c.fillColor ? c.textColor || "#161616" : "var(--bleu)");
  el.style.setProperty("--c-bg", c.fillColor || "var(--bleu-clair)");
}
// Décode une valeur de qualification, qu'elle arrive encodée par Grist (["L", ...]), déjà sous
// forme de tableau, ou comme simple chaîne à choix unique.
function listeQualif(v) {
  if (Array.isArray(v)) return v[0] === "L" ? v.slice(1) : v;
  return v ? [v] : [];
}
function estiloPastille(v) {
  const c = couleurs[v] || {};
  return `--c:${c.fillColor ? c.textColor || "#161616" : "var(--bleu)"};--c-bg:${c.fillColor || "var(--bleu-clair)"}`;
}
function afficherChoix(conteneurId, nom) {
  const cont = $(conteneurId);
  const avant = listeQualif(qualifMultiple ? lireChoixMulti(nom) : lireChoix(nom));
  cont.innerHTML = "";
  if (!choix.length) {
    cont.innerHTML = `<input type="text" data-libre="${nom}" aria-label="Qualification">`;
    cont.querySelector("input").value = avant.join(", ");
    cont.querySelector("input").addEventListener("input", () => {
      modifie = true;
    });
    return;
  }
  const multi = nom === "qualif-initiale" && qualifMultiple;
  choix.forEach((v) => {
    const lab = document.createElement("label");
    lab.className = "choix";
    styleChoix(lab, v);
    lab.innerHTML = `<input type="${multi ? "checkbox" : "radio"}" name="${nom}" value="${esc(v)}"><span>${esc(v)}</span>`;
    const inp = lab.querySelector("input");
    inp.checked = avant.includes(v);
    inp.addEventListener("change", () => {
      modifie = true;
    });
    cont.appendChild(lab);
  });
}
function lireChoix(nom) {
  const r = document.querySelector(`input[name="${nom}"]:checked`);
  if (r) return r.value;
  const l = document.querySelector(`[data-libre="${nom}"]`);
  return l ? l.value.trim() : "";
}
function lireChoixMulti(nom) {
  return [...document.querySelectorAll(`input[name="${nom}"]:checked`)].map((x) => x.value);
}
// Valeur de la qualification initiale telle que choisie dans le formulaire : une chaîne à choix
// unique, ou un tableau si la colonne accepte plusieurs valeurs.
function lireQualificationInitiale() {
  if (!choix.length) {
    const l = document.querySelector('[data-libre="qualif-initiale"]');
    return l ? l.value.trim() : "";
  }
  return qualifMultiple ? lireChoixMulti("qualif-initiale") : lireChoix("qualif-initiale");
}
function cocherQualif(v) {
  const liste = listeQualif(v);
  if (qualifMultiple) {
    document.querySelectorAll('input[name="qualif-initiale"]').forEach((x) => (x.checked = liste.includes(x.value)));
  } else {
    document
      .querySelectorAll('input[name="qualif-initiale"]')
      .forEach((x) => (x.checked = x.value === (liste[0] ?? "")));
  }
  const l = document.querySelector('[data-libre="qualif-initiale"]');
  if (l) l.value = liste.join(", ");
}
