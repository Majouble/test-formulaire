/* PRISME — widget de saisie, module 24/34 : Filtre des signalements et navigation d'une fiche à l'autre.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : VIDE_FILTRE, RENSEIGNE_FILTRE, CHAMPS_ETAB_FILTRE, MAX_VALEURS_FILTRE, derniereDe, champsFiltrables,
     typeChamp, valeursDossier, champDe, filtreEffectif, filtreActif, passeUn, passeFiltre, dossiersFiltres,
     resumeFiltre, sauverFiltre, restaurerFiltre, valeursDisponibles, actualiserChampsFiltre, majFiltre,
     appliquerFiltre, remplirPanneauFiltre, ouvrirPanneauFiltre, fermerPanneauFiltre, voisins, majNavigation,
     allerA, afficherOptionsDossiers, menuOuvert, fermerMenuDossiers, optionsMenu, focusOption, ouvrirMenuDossiers,
     choisirOption.
   Utilise :
     02 utilitaires : colonnesEtab.
     03 variantes : refId.
     04 date-faits : secondes, valeurLocale.
     05 etat : colonneDe, etabDeLigne, etatSaisie.
     06 grist : enFile.
     09 dossier : comparerVersions, ouvrirDossier.
     10 champs : typeBase.
     12 conditions-formules : normaliser.
     15 onglets : passerEnCreation.
     18 liste-dossiers : afficherResultatsRecherche, fermerRecherche, libelleDossier, majListeDossiers.
     23 couleurs : bandeCouleur, textesValeur.
     31 autocompletion : sansAccent.
     34 parcours : cacherConfirmation.
   Modifie etatSaisie : cacheDernieres, filtreOuvert, filtres, listeChampsFiltre, minuterieContient, posNav. */
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
    const colonneDossier = colonneDe("Dossier");
    etatSaisie.cacheDernieres = new Map();
    for (const enregistrement of etatSaisie.enregistrements) {
      const identifiantDossier = refId(colonneDossier && enregistrement[colonneDossier]) || enregistrement.id,
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
      : [{ cle: normaliser(valeurEtablissement), libelle: String(valeurEtablissement) }];
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
        cle: normaliser(texte),
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
  const texteContient = normaliser(filtre.contient || "");
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
function sauverFiltre() {
  Outils.stockage.ecrireJSON(`signalements-filtres:${etatSaisie.tableId || ""}`, etatSaisie.filtres);
}
function restaurerFiltre() {
  try {
    const filtres = Outils.stockage.lireJSON(`signalements-filtres:${etatSaisie.tableId || ""}`, []);
    if (Array.isArray(filtres))
      etatSaisie.filtres = filtres
        .filter((filtreMemorise) => filtreMemorise && typeof filtreMemorise.colonne === "string")
        .map((filtreMemorise) => ({
          colonne: filtreMemorise.colonne,
          valeurs: Array.isArray(filtreMemorise.valeurs) ? filtreMemorise.valeurs : [],
          libelles: filtreMemorise.libelles || {},
          contient: filtreMemorise.contient || "",
        }));
  } catch (_) {
    // filtres mémorisés illisibles : aucun filtre
  }
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
  const ordre = ((champ.def && champ.def.opts && champ.def.opts.choices) || []).map(normaliser);
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
function majFiltre() {
  actualiserChampsFiltre();
  // Pastilles des filtres
  $("filtres-actifs").innerHTML = etatSaisie.filtres
    .map(
      (filtre, i) =>
        `<span class="puce-filtre${filtreEffectif(filtre) ? "" : " inactive"}">` +
        `<button type="button" class="puce-libelle" data-i="${i}" aria-expanded="${etatSaisie.filtreOuvert === filtre}" aria-controls="panneau-filtre" title="${esc(resumeFiltre(filtre))}">${esc(resumeFiltre(filtre, true))} ▾</button>` +
        `<button type="button" class="puce-retirer" data-i="${i}" aria-label="Retirer le filtre ${esc(champDe(filtre) ? champDe(filtre).libelle : "")}">×</button></span>`,
    )
    .join("");
  $("filtre-tout-effacer").hidden = etatSaisie.filtres.length < 2;
  // Liste des colonnes encore disponibles pour un nouveau filtre
  const selecteurAjout = $("filtre-ajout");
  if (document.activeElement !== selecteurAjout) {
    const pris = new Set(etatSaisie.filtres.map((filtre) => filtre.colonne));
    const dispo = etatSaisie.listeChampsFiltre.filter(
      (champ) =>
        !pris.has(champ.cle) &&
        (champ.groupe === "Questions supplémentaires" ||
          champ.groupe === "Signalement" ||
          etatSaisie.dossiersInit.some((dossier) => valeursDossier(dossier, champ).length)),
    );
    const groupes = [...new Set(dispo.map((champ) => champ.groupe))];
    selecteurAjout.innerHTML =
      `<option value="">${etatSaisie.filtres.length ? "+ Ajouter un filtre" : "Filtrer par…"}</option>` +
      groupes
        .map(
          (groupe) =>
            `<optgroup label="${esc(groupe)}">${dispo
              .filter((champ) => champ.groupe === groupe)
              .map((champ) => `<option value="${esc(champ.cle)}">${esc(champ.libelle)}</option>`)
              .join("")}</optgroup>`,
        )
        .join("");
    selecteurAjout.value = "";
    selecteurAjout.hidden = !dispo.length;
  }
  if (etatSaisie.filtreOuvert && !etatSaisie.filtres.includes(etatSaisie.filtreOuvert)) fermerPanneauFiltre();
  else if (etatSaisie.filtreOuvert) remplirPanneauFiltre(false);
  majNavigation();
}
function appliquerFiltre() {
  sauverFiltre();
  etatSaisie.posNav = null;
  majListeDossiers();
  if (!$("resultats-signalements").hidden) afficherResultatsRecherche();
}
/* ---------- Panneau des valeurs d'un filtre (cases à cocher, appliquées aussitôt) ---------- */
function remplirPanneauFiltre(reconstruire = true) {
  const filtre = etatSaisie.filtreOuvert,
    champ = filtre && champDe(filtre);
  if (!champ) return;
  const { entrees, vides, renseignes, trop } = valeursDisponibles(filtre);
  const typeDeBase = typeChamp(champ);
  const texteLibre = typeDeBase === "Text" || typeDeBase === "Any";
  if (reconstruire) {
    $("pf-titre").textContent = champ.libelle;
    $("pf-cherche").value = "";
    $("pf-contient").value = filtre.contient || "";
  }
  $("pf-cherche").hidden = entrees.length <= 8;
  $("pf-bloc-contient").hidden = !texteLibre;
  const texteRecherche = sansAccent($("pf-cherche").value.trim());
  const coche = (k) => (filtre.valeurs.includes(k) ? " checked" : "");
  const ligne = (k, libelle, nombre, cls = "") =>
    `<label class="pf-valeur${cls}" data-cle-texte="${esc(sansAccent(libelle))}"><input type="checkbox" value="${esc(k)}" data-libelle="${esc(libelle)}"${coche(k)}>` +
    `<span>${esc(libelle)}</span><small>${nombre}</small></label>`;
  const special =
    ligne(RENSEIGNE_FILTRE, "(renseigné)", renseignes, " special") + ligne(VIDE_FILTRE, "(vide)", vides, " special");
  $("pf-valeurs").innerHTML =
    (entrees.map(([k, decompte]) => ligne(k, decompte.libelle, decompte.n)).join("") ||
      `<p class="pf-note">Aucune valeur saisie pour l'instant.</p>`) +
    special +
    (trop
      ? `<p class="pf-note">Seules les ${MAX_VALEURS_FILTRE} valeurs les plus fréquentes sont listées${texteLibre ? " : utilisez « Contient » pour les autres" : ""}.</p>`
      : "");
  if (texteRecherche)
    $("pf-valeurs")
      .querySelectorAll(".pf-valeur:not(.special)")
      .forEach((etiquette) => {
        etiquette.hidden = !etiquette.dataset.cleTexte.includes(texteRecherche);
      });
}
function ouvrirPanneauFiltre(filtre, bouton) {
  fermerRecherche();
  etatSaisie.filtreOuvert = filtre;
  const panneau = $("panneau-filtre");
  panneau.hidden = false;
  remplirPanneauFiltre(true);
  const barre = $("barre-filtre").getBoundingClientRect(),
    rectangleBouton = bouton ? bouton.getBoundingClientRect() : barre;
  panneau.style.left =
    Math.max(0, Math.min(rectangleBouton.left - barre.left, barre.width - panneau.offsetWidth)) + "px";
  document
    .querySelectorAll(".puce-libelle")
    .forEach((boutonPuce) =>
      boutonPuce.setAttribute("aria-expanded", String(+boutonPuce.dataset.i === etatSaisie.filtres.indexOf(filtre))),
    );
  const cible = !$("pf-cherche").hidden ? $("pf-cherche") : panneau.querySelector(".pf-valeur input") || $("pf-ok");
  cible.focus();
}
function fermerPanneauFiltre(rendreFocus) {
  if (!etatSaisie.filtreOuvert) return;
  const i = etatSaisie.filtres.indexOf(etatSaisie.filtreOuvert);
  etatSaisie.filtreOuvert = null;
  $("panneau-filtre").hidden = true;
  document.querySelectorAll(".puce-libelle").forEach((boutonPuce) => boutonPuce.setAttribute("aria-expanded", "false"));
  if (rendreFocus) {
    const boutonPuce = document.querySelector(`.puce-libelle[data-i="${i}"]`);
    (boutonPuce || $("filtre-ajout")).focus();
  }
}
$("pf-valeurs").addEventListener("change", (evenement) => {
  const caseCochee = evenement.target,
    filtre = etatSaisie.filtreOuvert;
  if (!filtre || !caseCochee.matches('input[type="checkbox"]')) return;
  filtre.valeurs = filtre.valeurs.filter((k) => k !== caseCochee.value);
  if (caseCochee.checked) {
    filtre.valeurs.push(caseCochee.value);
    filtre.libelles[caseCochee.value] = caseCochee.dataset.libelle;
  }
  appliquerFiltre();
});
$("pf-cherche").addEventListener("input", () => remplirPanneauFiltre(false));
$("pf-contient").addEventListener("input", () => {
  clearTimeout(etatSaisie.minuterieContient);
  etatSaisie.minuterieContient = setTimeout(() => {
    if (etatSaisie.filtreOuvert) {
      etatSaisie.filtreOuvert.contient = $("pf-contient").value;
      appliquerFiltre();
    }
  }, 250);
});
$("pf-aucune").addEventListener("click", () => {
  if (!etatSaisie.filtreOuvert) return;
  etatSaisie.filtreOuvert.valeurs = [];
  etatSaisie.filtreOuvert.contient = "";
  $("pf-contient").value = "";
  appliquerFiltre();
});
// Tout cocher : toutes les valeurs listées (celles que la recherche du panneau laisse visibles),
// sans « (renseigné) » ni « (vide) »
$("pf-tout").addEventListener("click", () => {
  const filtre = etatSaisie.filtreOuvert;
  if (!filtre) return;
  $("pf-valeurs")
    .querySelectorAll(".pf-valeur:not(.special):not([hidden]) input")
    .forEach((caseCochee) => {
      if (!filtre.valeurs.includes(caseCochee.value)) {
        filtre.valeurs.push(caseCochee.value);
        filtre.libelles[caseCochee.value] = caseCochee.dataset.libelle;
      }
    });
  appliquerFiltre();
});
$("pf-ok").addEventListener("click", () => fermerPanneauFiltre(true));
$("panneau-filtre").addEventListener("keydown", (evenement) => {
  if (evenement.key === "Escape") {
    evenement.preventDefault();
    evenement.stopPropagation();
    fermerPanneauFiltre(true);
  } else if (evenement.key === "Enter" && evenement.target.matches("#pf-cherche, #pf-contient")) {
    evenement.preventDefault();
    fermerPanneauFiltre(true);
  }
});
document.addEventListener("mousedown", (evenement) => {
  if (
    etatSaisie.filtreOuvert &&
    !$("panneau-filtre").contains(evenement.target) &&
    !evenement.target.closest(".puce-libelle")
  )
    fermerPanneauFiltre(false);
});
$("filtres-actifs").addEventListener("click", (evenement) => {
  const bouton = evenement.target.closest("button[data-i]");
  if (!bouton) return;
  const filtre = etatSaisie.filtres[+bouton.dataset.i];
  if (bouton.classList.contains("puce-retirer")) {
    if (etatSaisie.filtreOuvert === filtre) fermerPanneauFiltre(false);
    etatSaisie.filtres.splice(+bouton.dataset.i, 1);
    appliquerFiltre();
    $("filtre-ajout").focus();
  } else if (etatSaisie.filtreOuvert === filtre) fermerPanneauFiltre(false);
  else ouvrirPanneauFiltre(filtre, bouton);
});
$("filtre-ajout").addEventListener("change", () => {
  const cle = $("filtre-ajout").value;
  if (!cle) return;
  etatSaisie.listeChampsFiltre = champsFiltrables();
  const filtre = { colonne: cle, valeurs: [], libelles: {}, contient: "" };
  // Un signalement est affiché : le filtre reprend d'emblée sa valeur (« même catégorie »)
  const champ = champDe(filtre);
  if (champ && etatSaisie.dossierId && etatSaisie.initiale) {
    const valeursDuDossier = valeursDossier(etatSaisie.initiale, champ);
    if (valeursDuDossier.length)
      valeursDuDossier.forEach((valeur) => {
        filtre.valeurs.push(valeur.cle);
        filtre.libelles[valeur.cle] = valeur.libelle;
      });
    else filtre.valeurs.push(VIDE_FILTRE);
  }
  etatSaisie.filtres.push(filtre);
  $("filtre-ajout").blur();
  appliquerFiltre();
  const boutonPuce = document.querySelector(`.puce-libelle[data-i="${etatSaisie.filtres.length - 1}"]`);
  if (!filtre.valeurs.length) ouvrirPanneauFiltre(filtre, boutonPuce);
  else if (boutonPuce) boutonPuce.focus();
});
$("filtre-tout-effacer").addEventListener("click", () => {
  fermerPanneauFiltre(false);
  etatSaisie.filtres = [];
  appliquerFiltre();
  $("filtre-ajout").focus();
});
// Voisins du signalement affiché ; s'il ne fait pas (ou plus) partie de la liste, ceux de la place qu'il occupait
function voisins(liste, i) {
  if (i >= 0) return [liste[i - 1] || null, liste[i + 1] || null];
  if (etatSaisie.posNav == null) return [liste[liste.length - 1] || null, liste[0] || null];
  const k = Math.min(etatSaisie.posNav, liste.length);
  return [liste[k - 1] || null, liste[k] || null];
}
function majNavigation() {
  const liste = dossiersFiltres(),
    i = liste.findIndex((dossier) => dossier.id === etatSaisie.dossierId);
  if (i >= 0) etatSaisie.posNav = i;
  $("nav-fiches").hidden = !liste.length || (!etatSaisie.dossierId && !filtreActif());
  $("nav-position").textContent = i >= 0 ? `${i + 1} / ${liste.length}` : `– / ${liste.length}`;
  $("nav-position").title =
    i >= 0 ? "" : etatSaisie.dossierId ? "Le signalement affiché ne correspond pas au filtre" : "";
  const [precedent, suivant] = voisins(liste, i);
  $("nav-prec").disabled = !precedent;
  $("nav-suiv").disabled = !suivant;
  $("nav-prec").title = precedent ? `Précédent : ${libelleDossier(precedent).titre} (touche ←)` : "Début de la liste";
  $("nav-suiv").title = suivant ? `Suivant : ${libelleDossier(suivant).titre} (touche →)` : "Fin de la liste";
}
function allerA(sens) {
  const liste = dossiersFiltres(),
    i = liste.findIndex((dossier) => dossier.id === etatSaisie.dossierId);
  const cible = voisins(liste, i)[sens < 0 ? 0 : 1];
  if (!cible) return;
  if (
    (etatSaisie.modifie || etatSaisie.modifieVisa) &&
    !confirm("La saisie en cours n'est pas enregistrée. L'abandonner pour ouvrir un autre signalement ?")
  )
    return;
  cacherConfirmation();
  enFile(async () => {
    try {
      await grist.setCursorPos({ rowId: cible.id });
    } catch (_) {
      // placer le curseur de Grist est un confort : sans effet si Grist le refuse
    }
    await ouvrirDossier(cible.id, true);
  });
}
$("nav-prec").addEventListener("click", () => allerA(-1));
$("nav-suiv").addEventListener("click", () => allerA(1));
document.addEventListener("keydown", (evenement) => {
  if (
    (evenement.key !== "ArrowLeft" && evenement.key !== "ArrowRight") ||
    evenement.defaultPrevented ||
    evenement.ctrlKey ||
    evenement.metaKey ||
    evenement.altKey ||
    evenement.shiftKey
  )
    return;
  const cibleClavier = evenement.target;
  if (
    cibleClavier &&
    (cibleClavier.isContentEditable ||
      /^(INPUT|TEXTAREA|SELECT)$/.test(cibleClavier.tagName) ||
      (cibleClavier.closest && cibleClavier.closest('[role="tablist"], [role="listbox"], .choix-groupe')))
  )
    return;
  if ($("nav-fiches").hidden || etatSaisie.vue !== "saisie" || menuOuvert() || etatSaisie.filtreOuvert) return;
  evenement.preventDefault();
  allerA(evenement.key === "ArrowLeft" ? -1 : 1);
});

function afficherOptionsDossiers() {
  const texteRecherche = sansAccent($("recherche-dossiers").value.trim());
  const visibles = texteRecherche
    ? dossiersFiltres().filter((dossier) => {
        const intitule = libelleDossier(dossier);
        return sansAccent(`${intitule.titre} ${intitule.detail}`).includes(texteRecherche);
      })
    : dossiersFiltres();
  const courant = etatSaisie.dossiersInit.find((dossier) => dossier.id === etatSaisie.dossierId);
  $("options-dossiers").innerHTML =
    `<li role="option" tabindex="-1" data-id="" aria-selected="${!courant}">Nouveau signalement</li>` +
    (visibles.length
      ? visibles
          .map((dossier) => {
            const intitule = libelleDossier(dossier);
            return `<li role="option" tabindex="-1" data-id="${dossier.id}" aria-selected="${dossier.id === etatSaisie.dossierId}"${bandeCouleur(dossier)}>${esc(intitule.titre)}<small>${esc(intitule.detail)}</small></li>`;
          })
          .join("")
      : `<li class="vide" style="cursor:default;color:var(--gris)">Aucun signalement ne correspond</li>`);
}
$("recherche-dossiers").addEventListener("input", afficherOptionsDossiers);

function menuOuvert() {
  return $("btn-dossiers").getAttribute("aria-expanded") === "true";
}
function fermerMenuDossiers(rendreFocus) {
  if (!menuOuvert()) return;
  $("liste-dossiers").hidden = true;
  $("btn-dossiers").setAttribute("aria-expanded", "false");
  if (rendreFocus) $("btn-dossiers").focus();
}
const optionsMenu = () => [...$("options-dossiers").querySelectorAll('[role="option"][data-id]')];
function focusOption(i) {
  const options = optionsMenu();
  if (!options.length) return;
  options[Math.max(0, Math.min(i, options.length - 1))].focus();
}
function ouvrirMenuDossiers(focusPremier) {
  afficherOptionsDossiers();
  $("liste-dossiers").hidden = false;
  $("btn-dossiers").setAttribute("aria-expanded", "true");
  if (!$("recherche-dossiers").hidden) $("recherche-dossiers").focus();
  else if (focusPremier) {
    // Au clavier : focus sur le signalement affiché, sinon sur la première entrée
    const options = optionsMenu();
    const i = options.findIndex((option) => option.getAttribute("aria-selected") === "true");
    focusOption(i >= 0 ? i : 0);
  }
}
function choisirOption(optionListe) {
  fermerMenuDossiers(true);
  enFile(async () => {
    const id = optionListe.dataset.id ? +optionListe.dataset.id : null;
    if (!id) {
      await passerEnCreation();
      return;
    }
    try {
      await grist.setCursorPos({ rowId: id });
    } catch (_) {
      // placer le curseur de Grist est un confort : sans effet si Grist le refuse
    }
    await ouvrirDossier(id, true);
  });
}
// ev.detail === 0 : « clic » produit au clavier (Entrée ou Espace sur le bouton)
$("btn-dossiers").addEventListener("click", (evenement) => {
  if (menuOuvert()) fermerMenuDossiers(false);
  else ouvrirMenuDossiers(evenement.detail === 0);
});
$("btn-dossiers").addEventListener("keydown", (evenement) => {
  if (evenement.key === "ArrowDown" || evenement.key === "ArrowUp") {
    evenement.preventDefault();
    ouvrirMenuDossiers(true);
  }
});
$("options-dossiers").addEventListener("click", (evenement) => {
  const optionListe = evenement.target.closest('[role="option"][data-id]');
  if (optionListe) choisirOption(optionListe);
});
$("options-dossiers").addEventListener("keydown", (evenement) => {
  const options = optionsMenu();
  const i = options.indexOf(document.activeElement);
  if (evenement.key === "ArrowDown") {
    evenement.preventDefault();
    focusOption(i + 1);
  } else if (evenement.key === "ArrowUp") {
    evenement.preventDefault();
    if (i <= 0 && !$("recherche-dossiers").hidden) $("recherche-dossiers").focus();
    else focusOption(i - 1);
  } else if (evenement.key === "Home") {
    evenement.preventDefault();
    focusOption(0);
  } else if (evenement.key === "End") {
    evenement.preventDefault();
    focusOption(options.length - 1);
  } else if (evenement.key === "Enter" || evenement.key === " ") {
    evenement.preventDefault();
    if (i >= 0) choisirOption(options[i]);
  } else if (evenement.key === "Tab") fermerMenuDossiers(false);
});
// Depuis le champ de filtre : flèche bas vers la liste, Entrée ouvre le premier résultat
$("recherche-dossiers").addEventListener("keydown", (evenement) => {
  if (evenement.key === "ArrowDown") {
    evenement.preventDefault();
    focusOption(0);
  } else if (evenement.key === "Enter") {
    evenement.preventDefault();
    const premier = optionsMenu().find((option) => option.dataset.id); // premier signalement filtré
    if (premier) choisirOption(premier);
  }
});
document.addEventListener("click", (evenement) => {
  if (!$("menu-dossiers").contains(evenement.target)) fermerMenuDossiers(false);
});
document.addEventListener("keydown", (evenement) => {
  if (evenement.key === "Escape" && menuOuvert()) {
    evenement.preventDefault();
    fermerMenuDossiers(true);
  }
});
