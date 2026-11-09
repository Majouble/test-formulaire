/* PRISME — widget de saisie, composants/recherche-etablissement.js
   Composant : recherche d'établissement (autocomplétion dans le référentiel et les annuaires).
   Chargé par saisie/index.html dans l'ordre : fondations, composants, domaines, demarrage.js. Les fichiers partagent
   leurs noms (scripts classiques, sans import) : au chargement, un fichier ne fait que définir. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : COLONNES_RECHERCHE_EN_PLUS, MIN_CARACTERES, NB_RESULTATS, NB_RESULTATS_ANNUAIRE,
     MIN_CARACTERES_ANNUAIRE, SOURCES, champNom, liste, odsq, clauses, appeler, interroger, sourcesActives,
     rechercheLocale, libelleEtabDeRepli, rechercher, afficherResultats, etat, ouvrirSuggestions, fermerSuggestions,
     surligner, choisir, brancherEvenementsRechercheEtablissement.
   Utilise :
     fondations/configuration : colonnesEtab.
     fondations/outils : sansAccents.
     fondations/etat : etatSaisie.
     domaines/agent/regles : dansPerimetre, perimetre, perimetreActif.
     domaines/formulaire/regles : varianteSaisie.
     domaines/formulaire/affichage : focusPremiereQuestion.
     domaines/etablissement/regles : CHAMPS_NOUVEL_ETAB, etabDe, etabParUai, rattachementDe, versEtablissement.
     domaines/etablissement/affichage : afficherEtablissement, proposerRattachement.
   Modifie etatSaisie : composanteChoisie, etabCourant, index, ligneAnnuaire, minuterie, modifie, requete,
     resultats. */
const COLONNES_RECHERCHE_EN_PLUS = ["Sigle", "Noms_rencontres_dans_les_sources", "Libelle_consolide", "Mots_cles"];
// ignorées si absentes
const MIN_CARACTERES = 2;
const NB_RESULTATS = 15;
const NB_RESULTATS_ANNUAIRE = 8,
  MIN_CARACTERES_ANNUAIRE = 3;
const SOURCES = [
  {
    cle: "en",
    etiquette: "EN",
    nom: "Annuaire de l'éducation nationale",
    url: "https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-annuaire-education/records",
    champs: {
      nom: "nom_etablissement",
      uai: "identifiant_de_l_etablissement",
      type: "type_etablissement",
      academie: "libelle_academie",
      departement: "libelle_departement",
      commune: "nom_commune",
      mail: "mail",
    },
  },
  {
    cle: "esr",
    etiquette: "ESR",
    nom: "Principaux établissements de l'enseignement supérieur", // pas de mail dans ce jeu de données
    url: "https://data.enseignementsup-recherche.gouv.fr/api/explore/v2.1/catalog/datasets/fr-esr-principaux-etablissements-enseignement-superieur/records",
    champs: {
      nom: "uo_lib",
      uai: "uai",
      type: "type_d_etablissement",
      academie: "aca_nom",
      departement: "dep_nom",
      commune: "com_nom",
    },
  },
];
const champNom = $("nom"),
  liste = $("liste");
// Recherche dans le référentiel du document (sans accents, tous les mots doivent être présents)
const odsq = (texte) => texte.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
function clauses(src, recherche) {
  const champsSource = src.champs;
  if (/^\d{7}[a-z]$/i.test(recherche)) return [`${champsSource.uai}="${recherche.toUpperCase()}"`];
  const texte = odsq(recherche);
  return [`search(${champsSource.nom}, ${champsSource.commune}, "${texte}")`, `search(*, "${texte}")`];
}
async function appeler(src, where) {
  const reponse = await fetch(`${src.url}?${new URLSearchParams({ where, limit: NB_RESULTATS_ANNUAIRE })}`);
  if (!reponse.ok) {
    let detail = "";
    try {
      detail = (await reponse.json()).message || "";
    } catch (_) {
      // réponse sans message lisible : message générique
    }
    throw new Error(`${src.etiquette} : HTTP ${reponse.status} ${detail}`);
  }
  return reponse.json();
}
async function interroger(src, recherche) {
  const champsSource = src.champs;
  let data = { results: [] };
  for (const where of clauses(src, recherche)) {
    data = await appeler(src, where);
    if (data.results && data.results.length) break;
  }
  return (data.results || []).map((rec) => ({
    source: src.etiquette,
    nom: rec[champsSource.nom],
    uai: rec[champsSource.uai],
    type: rec[champsSource.type],
    academie: rec[champsSource.academie],
    departement: rec[champsSource.departement],
    commune: rec[champsSource.commune],
    mail: champsSource.mail ? rec[champsSource.mail] : "",
  }));
}
const sourcesActives = () => SOURCES.filter((source) => varianteSaisie().annuaires.includes(source.cle));
function rechercheLocale(recherche) {
  const mots = sansAccents(recherche).split(/\s+/).filter(Boolean);
  if (!mots.length) return [];
  const colsRecherche = etatSaisie.colsEtab.includes(colonnesEtab.nom)
    ? [
        ...new Set([
          colonnesEtab.nom,
          colonnesEtab.commune,
          colonnesEtab.uai,
          ...COLONNES_RECHERCHE_EN_PLUS,
          ...varianteSaisie().recherche,
        ]),
      ]
    : etatSaisie.colsEtab.filter(
        (colonne) =>
          colonne !== "id" &&
          colonne !== "manualSort" &&
          !colonne.startsWith("gristHelper") &&
          colonne !== colonnesEtab.cle &&
          colonne !== colonnesEtab.lien,
      );
  // lignes fusionnées dans un autre établissement (référentiel ESR, colonne Etat) : plus proposées
  const trouves = etatSaisie.etabs.filter((ligneEtablissement) => {
    if (typeof ligneEtablissement.Etat === "string" && /^fusionn/i.test(ligneEtablissement.Etat.trim())) return false;
    const texte = sansAccents(
      colsRecherche
        .map((colonne) => ligneEtablissement[colonne])
        .filter((valeur) => valeur != null && typeof valeur !== "object")
        .join(" "),
    );
    return mots.every((mot) => texte.includes(mot));
  });
  // le nom (ou le sigle, le libellé consolidé) d'abord ; les mots-clés de recherche (anciens noms, villes…) ensuite
  const titre = (ligneEtablissement) =>
    sansAccents(
      [ligneEtablissement[colonnesEtab.nom], ligneEtablissement.Sigle, ligneEtablissement.Libelle_consolide]
        .filter((valeur) => typeof valeur === "string")
        .join(" "),
    );
  const note = (ligneEtablissement) => {
    const titreLigne = titre(ligneEtablissement);
    return mots.filter((mot) => titreLigne.includes(mot)).length * 2 + (titreLigne.startsWith(mots[0]) ? 1 : 0);
  };
  if (colsRecherche.includes("Mots_cles") || colsRecherche.includes("Libelle_consolide"))
    trouves.sort((a, b) => note(b) - note(a));
  const dedans = perimetreActif() ? trouves.filter(dansPerimetre) : trouves;
  const retenus = dedans.length ? dedans : trouves;
  return retenus.slice(0, NB_RESULTATS).map((ligneEtablissement) => ({
    source: "local",
    ligne: ligneEtablissement,
    nom: ligneEtablissement[colonnesEtab.nom] ?? libelleEtabDeRepli(ligneEtablissement),
    uai: ligneEtablissement[colonnesEtab.uai],
    type: ligneEtablissement[colonnesEtab.type],
    academie: ligneEtablissement[colonnesEtab.academie],
    departement: ligneEtablissement[colonnesEtab.departement],
    commune: ligneEtablissement[colonnesEtab.commune],
    mail: ligneEtablissement[colonnesEtab.mail],
    hors: perimetreActif() && !dedans.length,
  }));
}
// Sans colonne de nom reconnue : première valeur texte de la ligne
function libelleEtabDeRepli(ligneEtablissement) {
  const colonneTexte = etatSaisie.colsEtab.find(
    (colonne) =>
      colonne !== "id" &&
      colonne !== colonnesEtab.cle &&
      colonne !== colonnesEtab.lien &&
      typeof ligneEtablissement[colonne] === "string" &&
      ligneEtablissement[colonne].trim(),
  );
  return colonneTexte ? ligneEtablissement[colonneTexte] : `Ligne ${ligneEtablissement.id}`;
}
async function rechercher(recherche) {
  const id = ++etatSaisie.requete;
  const locaux = rechercheLocale(recherche),
    actives = recherche.length >= MIN_CARACTERES_ANNUAIRE ? sourcesActives() : [];
  if (!actives.length) {
    // référentiel seul
    etatSaisie.resultats = locaux;
    if (!etatSaisie.resultats.length)
      etat(
        `Aucun établissement du référentiel ne correspond. Vérifiez l'orthographe, essayez la commune ou l'UAI${sourcesActives().length ? " (au moins 3 caractères pour l'annuaire)" : ""}, ou cliquez sur « Établissement introuvable ? Le créer ».`,
      );
    else afficherResultats();
    return;
  }
  if (locaux.length) {
    etatSaisie.resultats = locaux;
    afficherResultats();
  } else etat("Recherche…");
  // L'annuaire en ligne complète la recherche (établissements pas encore dans le référentiel)
  const rep = await Promise.allSettled(actives.map((source) => interroger(source, recherche)));
  if (id !== etatSaisie.requete) return;
  const connus = new Set(locaux.map((resultatLocal) => String(resultatLocal.uai || "").toUpperCase()));
  // annuaire en ligne : filtré sur l'académie ou le département quand le périmètre en dépend
  const perimetreCourant = perimetreActif() ? perimetre() : {},
    filtres = [
      ["academie", colonnesEtab.academie],
      ["departement", colonnesEtab.departement],
    ].filter(([, colonnePerimetre]) => perimetreCourant[colonnePerimetre]);
  const distants = rep
    .flatMap((reponseSource) => (reponseSource.status === "fulfilled" ? reponseSource.value : []))
    .filter((resultatAnnuaire) => !connus.has(String(resultatAnnuaire.uai || "").toUpperCase()))
    .filter((resultatAnnuaire) =>
      filtres.every(
        ([k, colonnePerimetre]) =>
          !resultatAnnuaire[k] ||
          perimetreCourant[colonnePerimetre].some(
            (valeurPerimetre) => sansAccents(valeurPerimetre) === sansAccents(resultatAnnuaire[k]),
          ),
      ),
    );
  etatSaisie.resultats = [...locaux, ...distants];
  if (locaux.length && rep.every((reponseSource) => reponseSource.status === "rejected")) {
    afficherResultats();
    return;
  }
  rep
    .filter((reponseSource) => reponseSource.status === "rejected")
    .forEach((reponseSource) => console.warn("Autocomplétion :", reponseSource.reason));
  if (!etatSaisie.resultats.length) {
    etat(
      rep.every((reponseSource) => reponseSource.status === "rejected")
        ? `Annuaire injoignable (${(rep[0].reason && rep[0].reason.message) || "erreur réseau"}). Saisissez les informations à la main.`
        : "Aucun établissement trouvé. Vérifiez l'orthographe ou saisissez l'UAI, ou cliquez sur « Établissement introuvable ? Le créer ».",
    );
    return;
  }
  afficherResultats();
}
function afficherResultats() {
  etatSaisie.index = -1;
  liste.innerHTML = etatSaisie.resultats
    .map(
      (resultat, i) => `
    <li role="option" id="opt-${i}" data-i="${i}" aria-selected="false">
      <div class="nom">${esc(resultat.nom)}${resultat.hors ? '<span class="source hors">hors périmètre</span>' : ""}${!sourcesActives().length ? "" : resultat.source === "local" ? '<span class="source connu">référentiel</span>' : `<span class="source">${esc(resultat.source)}</span>`}</div>
      <div class="meta">${esc([resultat.uai, resultat.type, resultat.commune, resultat.academie].filter(Boolean).join(", "))}</div>
      ${resultat.ligne && rattachementDe(resultat.ligne) ? `<div class="meta">→ dossier ouvert sur ${esc(rattachementDe(resultat.ligne)[colonnesEtab.nom])}</div>` : ""}
    </li>`,
    )
    .join("");
  ouvrirSuggestions();
}
function etat(message) {
  liste.innerHTML = `<li class="etat" aria-disabled="true">${esc(message)}</li>`;
  etatSaisie.resultats = [];
  etatSaisie.index = -1;
  ouvrirSuggestions();
}
function ouvrirSuggestions() {
  liste.hidden = false;
  champNom.setAttribute("aria-expanded", "true");
}
function fermerSuggestions() {
  liste.hidden = true;
  champNom.setAttribute("aria-expanded", "false");
  etatSaisie.index = -1;
}
function surligner(i) {
  [...liste.querySelectorAll("[role=option]")].forEach((elementOption, k) => {
    elementOption.setAttribute("aria-selected", k === i);
    if (k === i) elementOption.scrollIntoView({ block: "nearest" });
  });
  etatSaisie.index = i;
  champNom.setAttribute("aria-activedescendant", i >= 0 ? `opt-${i}` : "");
}
function choisir(i) {
  const resultat = etatSaisie.resultats[i];
  if (!resultat) return;
  if (etatSaisie.reaffectation) {
    proposerRattachement(resultat);
    return;
  }
  fermerSuggestions();
  const existant = (resultat.ligne && etabDe(resultat.ligne.id)) || resultat.ligne || etabParUai(resultat.uai);
  etatSaisie.composanteChoisie = null;
  if (existant) {
    etatSaisie.etabCourant = versEtablissement(existant);
    etatSaisie.ligneAnnuaire = null;
  } else {
    etatSaisie.ligneAnnuaire = resultat;
    champNom.value = resultat.nom || "";
    CHAMPS_NOUVEL_ETAB.forEach((k) => {
      $(k).value = resultat[k] || "";
      $(k).classList.toggle("auto", !!resultat[k]);
    });
    $("mail").dataset.saisi = resultat.mail || "";
  }
  etatSaisie.modifie = true;
  afficherEtablissement();
  focusPremiereQuestion();
}

// Événements de la page traités ici ; appelé une fois par demarrage.js
function brancherEvenementsRechercheEtablissement() {
  champNom.addEventListener("input", () => {
    clearTimeout(etatSaisie.minuterie);
    CHAMPS_NOUVEL_ETAB.forEach((k) => $(k).classList.remove("auto"));
    afficherEtablissement();
    const recherche = champNom.value.trim();
    if (recherche.length < MIN_CARACTERES) {
      fermerSuggestions();
      return;
    }
    etatSaisie.minuterie = setTimeout(() => rechercher(recherche), sourcesActives().length ? 300 : 150);
  });
  champNom.addEventListener("keydown", (evenement) => {
    if (liste.hidden || !etatSaisie.resultats.length) return;
    if (evenement.key === "ArrowDown") {
      evenement.preventDefault();
      surligner(Math.min(etatSaisie.index + 1, etatSaisie.resultats.length - 1));
    } else if (evenement.key === "ArrowUp") {
      evenement.preventDefault();
      surligner(Math.max(etatSaisie.index - 1, 0));
    } else if (evenement.key === "Enter" && etatSaisie.index >= 0) {
      evenement.preventDefault();
      choisir(etatSaisie.index);
    } else if (evenement.key === "Escape") fermerSuggestions();
  });
  liste.addEventListener("mousedown", (evenement) => {
    const elementOption = evenement.target.closest("[role=option]");
    if (elementOption) {
      evenement.preventDefault();
      choisir(+elementOption.dataset.i);
    }
  });
  champNom.addEventListener("blur", () => setTimeout(fermerSuggestions, 150));
  CHAMPS_NOUVEL_ETAB.forEach((k) => $(k).addEventListener("input", () => $(k).classList.remove("auto")));
  $("uai").addEventListener("change", () => {
    const existant = etabParUai($("uai").value);
    if (existant) {
      etatSaisie.etabCourant = versEtablissement(existant);
      etatSaisie.ligneAnnuaire = null;
      afficherEtablissement();
    }
  });
}
