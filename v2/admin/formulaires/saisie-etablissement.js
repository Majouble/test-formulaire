/* PRISME — administration, onglet « Formulaires » : formulaires/saisie-etablissement.js
   Réglages de la saisie : version (EN ou ESR) et présentation, panneau « Établissement » (annuaires, fiche), pages
   de saisie.
   Chargé par admin/index.html dans l'ordre : fondations, donnees, formulaire-courant, colonnes-roles, apercu,
   mode-test, panneau-question, sites-esr, tableaux, gestion, description, saisie-etablissement, demarrage. Les
   fichiers partagent leurs noms (scripts classiques, sans import) : au chargement, un fichier ne fait que définir ;
   demarrage.js branche les événements et publie l'onglet. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : tableEtablissements, colonnesEtabProposees, sourceColonneEtablissement, libelleColonneEtablissement,
     valeurLisible, familleQuestion, FAMILLES, moduleRepartition, lirePagesSaisie, estEnseignementSuperieur,
     allerPagesAgents, groupePageHtml, lierPages, FICHE_DEFAUT, PRESETS, SOURCES_ANNUAIRE, ENTETES,
     ROLES_ETABLISSEMENT, ROLES_FICHE, confSaisie, espaceCourant, versionFormulaire, saisieEffective, majSaisie,
     appliquerModele, identiteExemple, groupeVersionHtml, modeleCourant, changerModele, lierVersion,
     optionsSourceFiche, groupesEtablissementHtml, lierEtablissement.
   Utilise :
     fondations : $, RESERVES_TABLEAU, copie, esc, etatFormulaires, message, nouvelId, typeBase.
     donnees : colonnesDe.
     formulaire-courant : blocs, libelleQuestion, sauver.
     apercu : choisir, dessinerApercu.
     mode-test : devinerColonnesEtablissement, majEtablissementTest.
     panneau-question : dessinerPanneau.
     sites-esr : installerModeleSites.
   Modifie etatFormulaires : pagesSaisie. */
/* =========================================================
 Référentiel des établissements et données de la fiche
 ========================================================= */
// Table visée par la colonne Etablissement de la table des réponses
const tableEtablissements = () => {
  const colonneEtablissement = etatFormulaires.meta.Etablissement;
  const correspondance = colonneEtablissement && String(colonneEtablissement.type || "").match(/^Ref:(.+)$/);
  return correspondance ? correspondance[1] : null;
};
const colonnesEtabProposees = (identifiantTable) =>
  identifiantTable
    ? Object.values(colonnesDe(identifiantTable))
        .filter(
          (colonne) =>
            colonne.colId !== "id" &&
            !/^(manualSort|UUID)$/.test(colonne.colId) &&
            !colonne.colId.startsWith("gristHelper"),
        )
        .sort((colonneA, colonneB) => colonneA.pos - colonneB.pos)
    : [];
// Colonne de la fiche lue par une formule « $Etablissement.Colonne » (null pour une autre formule)
function sourceColonneEtablissement(colonne) {
  const correspondance = String((colonne && colonne.texteFormule) || "")
    .trim()
    .replace(/^return\s+/, "")
    .match(/^\$(\w+)\.(\w+)$/);
  if (!correspondance) return null;
  const colonneReference = etatFormulaires.meta[correspondance[1]];
  return correspondance[1] === "Etablissement" ||
    (colonneReference && tableEtablissements() && colonneReference.type === `Ref:${tableEtablissements()}`)
    ? correspondance[2]
    : null;
}
const libelleColonneEtablissement = (identifiantSource) => {
  const colonne = colonnesDe(tableEtablissements() || "")[identifiantSource];
  return colonne ? colonne.libelle : identifiantSource;
};
// Valeur affichée (comme dans le widget de saisie)
function valeurLisible(colonne, valeur) {
  if (valeur == null || valeur === "") return "";
  const typeDeBase = typeBase(colonne && colonne.type);
  if (typeDeBase === "Bool" || typeof valeur === "boolean") return valeur ? "Oui" : "Non";
  if (Array.isArray(valeur)) return (valeur[0] === "L" ? valeur.slice(1) : valeur).join(", ");
  if (typeDeBase === "Date" && typeof valeur === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valeur))
    return valeur.split("-").reverse().join("/");
  if (typeDeBase === "Date" && typeof valeur === "number")
    return new Date(valeur * 1000).toLocaleDateString("fr-FR", { timeZone: "UTC" });
  if (typeof valeur === "number") return valeur.toLocaleString("fr-FR");
  return String(valeur);
}
function familleQuestion(colonne) {
  const typeDeBase = typeBase(colonne && colonne.type);
  if (typeDeBase === "Numeric" || typeDeBase === "Int") return "nombre";
  if (typeDeBase === "Date" || typeDeBase === "DateTime") return "date";
  if (typeDeBase === "Choice" || typeDeBase === "ChoiceList") return "choix";
  if (typeDeBase === "Bool") return "case";
  if (typeDeBase === "Ref" || typeDeBase === "RefList") return "reference";
  return "texte";
}
const FAMILLES = {
  nombre: "Nombres",
  date: "Dates",
  choix: "Choix",
  case: "Oui / Non",
  reference: "Références",
  texte: "Textes",
};

/* =========================================================
 Page de saisie : création d'une page Grist avec le widget de saisie déjà réglé
 ---------------------------------------------------------
 « CreateViewSection » (action de Grist utilisée par « Ajouter une page ») crée une page avec une vue
 personnalisée reliée à la table du formulaire ; ses options (customView) reçoivent l'adresse du widget,
 l'accès complet et le formulaire présélectionné (option « formulaire » lue par grist.getOption).
 ========================================================= */
const moduleRepartition = window.Repartition;
async function lirePagesSaisie() {
  etatFormulaires.pagesSaisie = await moduleRepartition.lirePages();
}
const estEnseignementSuperieur = () =>
  !!etatFormulaires.meta.Site || (!!tableEtablissements() && tableEtablissements() !== "Etablissements");
// Adresse proposée pour le widget de saisie : la v2, à côté de cette administration (…/v2/saisie/)
// Pages de saisie des agents : gérées dans Équipe › Pages de saisie (admin/pages-agents.js, une page par agent et par
// formulaire publié) ; ici, un résumé pour le formulaire affiché et un raccourci.
const allerPagesAgents = () => {
  const bouton = document.querySelector('nav button[data-onglet="onglet-equipe"]');
  if (bouton) bouton.click();
  window.OngletEquipeGroupe.afficher("pages");
};
function groupePageHtml() {
  if (etatFormulaires.courant.type !== "etablissement") return "";
  return `<div class="groupe"><div class="t">Pages de saisie des agents</div><p class="note" id="pf-pages" style="margin:0 0 8px">Lecture…</p>
  <button type="button" class="secondaire petit" id="pf-pages-aller">Gérer les pages des agents →</button></div>`;
}
async function lierPages(panneau) {
  const boutonAller = panneau.querySelector("#pf-pages-aller");
  if (!boutonAller) return;
  boutonAller.addEventListener("click", allerPagesAgents);
  const zoneResume = panneau.querySelector("#pf-pages");
  try {
    await window.PagesAgents.charger();
    const resume = window.PagesAgents.resume(etatFormulaires.courant.nom);
    if (!etatFormulaires.courant.publie) {
      zoneResume.textContent =
        "Publiez le formulaire : chaque agent pourra alors avoir sa page de saisie (Équipe › Pages de saisie).";
      return;
    }
    zoneResume.textContent =
      [
        `${resume.aJour} page${resume.aJour > 1 ? "s" : ""} à jour`,
        resume.aCreer ? `${resume.aCreer} à créer` : "",
        resume.aMaj ? `${resume.aMaj} à mettre à jour` : "",
      ]
        .filter(Boolean)
        .join(" · ") + ". Une page par agent ; elle applique le périmètre de son créneau en cours.";
  } catch (_) {
    zoneResume.textContent = "Pages des agents : voir Équipe › Pages de saisie.";
  }
}

/* =========================================================
 Spécificités de la saisie (version établissements scolaires / enseignement supérieur)
 ---------------------------------------------------------
 conf.saisie = { version: "en" | "esr", marque, annuaires, entete, colonnes, fiche, recherche, pastilles, commentaire } :
 lu par le widget de saisie unique (widget-signalements.html). Les réglages absents reprennent ceux de la version ;
 mêmes valeurs par défaut que le widget (PRESETS).
 ========================================================= */
const FICHE_DEFAUT = [
  ["@nom", "Établissement"],
  ["@uai", "UAI"],
  ["@type", "Type"],
  ["@commune", "Commune"],
  ["@academie", "Académie"],
  ["@departement", "Département"],
];
const PRESETS = {
  en: {
    libelle: "Établissements scolaires",
    marque: "Établissements scolaires",
    annuaires: ["en", "esr"],
    entete: "**{nom}**, **{commune}**",
    pastilles: "auto",
    commentaire: false,
    fiche: FICHE_DEFAUT.map(([colonne, libelle]) => ({ col: colonne, lib: libelle })),
    recherche: [],
    colonnes: {},
    faitsFuturs: true,
    plusieursJours: true,
  },
  esr: {
    libelle: "Enseignement supérieur et recherche",
    marque: "Enseignement supérieur et recherche",
    annuaires: [],
    entete: "**{nom}** ({site})",
    pastilles: "toujours",
    commentaire: false,
    fiche: [...FICHE_DEFAUT.slice(0, 5), ["@region", "Région académique"], FICHE_DEFAUT[5]].map(
      ([colonne, libelle]) => ({
        col: colonne,
        lib: libelle,
      }),
    ),
    recherche: [],
    colonnes: {},
    faitsFuturs: true,
    plusieursJours: true,
  },
};
const SOURCES_ANNUAIRE = [
  { cle: "en", nom: "Annuaire de l'éducation nationale" },
  { cle: "esr", nom: "Établissements de l'enseignement supérieur (data.enseignementsup-recherche)" },
];
const ENTETES = [
  ["**{nom}**, **{commune}**", "Nom, commune"],
  ["**{nom}** ({site})", "Nom (site)"],
  ["**{nom}** ({commune})", "Nom (commune)"],
  ["**{nom}**", "Nom seul"],
  ["**{nom}** ({uai})", "Nom (UAI)"],
];
const ROLES_ETABLISSEMENT = {
  nom: "Nom",
  uai: "UAI",
  commune: "Commune",
  type: "Type",
  academie: "Académie",
  departement: "Département",
  mail: "Mail",
};
const ROLES_FICHE = { ...ROLES_ETABLISSEMENT, nom: "Établissement", region: "Région académique" };
const confSaisie = () => (etatFormulaires.courant && etatFormulaires.courant.conf.saisie) || {};
// version : réglée dans le formulaire, sinon celle du champ dont c'est la table (document à deux champs), sinon devinée
const espaceCourant = () => {
  try {
    return (
      etatFormulaires.courant &&
      window.Socle.espaceDeTable(window.Socle.general(etatFormulaires.socleConfig), etatFormulaires.courant.table)
    );
  } catch (_) {
    return null;
  }
};
const versionFormulaire = () =>
  PRESETS[confSaisie().version]
    ? confSaisie().version
    : espaceCourant()
      ? espaceCourant().version
      : estEnseignementSuperieur()
        ? "esr"
        : "en";
function saisieEffective() {
  const version = versionFormulaire(),
    reglagesFormulaire = confSaisie(),
    reglagesEffectifs = { ...copie(PRESETS[version]), version: version };
  if (typeof reglagesFormulaire.marque === "string" && reglagesFormulaire.marque.trim())
    reglagesEffectifs.marque = reglagesFormulaire.marque.trim();
  if (Array.isArray(reglagesFormulaire.annuaires)) reglagesEffectifs.annuaires = reglagesFormulaire.annuaires;
  if (typeof reglagesFormulaire.entete === "string" && reglagesFormulaire.entete.trim())
    reglagesEffectifs.entete = reglagesFormulaire.entete;
  if (reglagesFormulaire.pastilles) reglagesEffectifs.pastilles = reglagesFormulaire.pastilles;
  if (typeof reglagesFormulaire.commentaire === "boolean")
    reglagesEffectifs.commentaire = reglagesFormulaire.commentaire;
  if (typeof reglagesFormulaire.faitsFuturs === "boolean")
    reglagesEffectifs.faitsFuturs = reglagesFormulaire.faitsFuturs;
  if (typeof reglagesFormulaire.plusieursJours === "boolean")
    reglagesEffectifs.plusieursJours = reglagesFormulaire.plusieursJours;
  if (Array.isArray(reglagesFormulaire.fiche) && reglagesFormulaire.fiche.length)
    reglagesEffectifs.fiche = reglagesFormulaire.fiche;
  if (Array.isArray(reglagesFormulaire.recherche)) reglagesEffectifs.recherche = reglagesFormulaire.recherche;
  if (reglagesFormulaire.colonnes) reglagesEffectifs.colonnes = reglagesFormulaire.colonnes;
  return reglagesEffectifs;
}
// Modifie conf.saisie (la version est toujours écrite : le widget n'a plus à la deviner)
function majSaisie(modifier) {
  etatFormulaires.courant.conf.saisie = { ...confSaisie(), version: versionFormulaire() };
  modifier(etatFormulaires.courant.conf.saisie);
  sauver();
}
// Même règle que le widget de saisie : les morceaux vides disparaissent (gras vide, parenthèses vides, virgule ou tiret orphelins)
function appliquerModele(modele, valeurs) {
  let texte = String(modele || "").replace(/\{([\w-]+)\}/g, (_, k) =>
    String(valeurs[k] ?? "")
      .replace(/\s+/g, " ")
      .trim(),
  );
  for (let i = 0; i < 3; i++)
    texte = texte
      .replace(/\*\*\s*\*\*/g, "")
      .replace(/\(\s*\)|\[\s*\]/g, "")
      .replace(/\s*[,;·]\s*(?=$|[,;·])/g, "")
      .replace(/\s+[–—-]\s*(?=$|[,;·–—-])/g, "")
      .replace(/^\s*[,;·–—-]\s*/, "");
  return texte
    .replace(/\s+([,;])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}
const identiteExemple = () =>
  versionFormulaire() === "esr"
    ? {
        nom: "Université de Rennes",
        commune: "Rennes",
        site: "Campus de Beaulieu",
        uai: "0352480A",
        academie: "Rennes",
        region: "Bretagne",
        departement: "Ille-et-Vilaine",
        type: "Université",
      }
    : {
        nom: "Collège Jean Rostand",
        commune: "Draguignan",
        site: "",
        uai: "0830001A",
        academie: "Nice",
        region: "Provence-Alpes-Côte d'Azur",
        departement: "Var",
        type: "Collège",
      };

/* ---------- panneau « Formulaire » : version et présentation ---------- */
function groupeVersionHtml() {
  if (etatFormulaires.courant.type !== "etablissement") return "";
  const reglagesEffectifs = saisieEffective(),
    fixe = !!PRESETS[confSaisie().version],
    reglagesFormulaire = confSaisie();
  const parSite = modeleCourant() === "esr-sites";
  return `<div class="groupe"><div class="t">Modèle du formulaire</div>
  <div class="seg2" role="group" aria-label="Modèle du formulaire"><button type="button" data-modele="" aria-pressed="${!parSite}">Standard</button><button type="button" data-modele="esr-sites" aria-pressed="${parSite}">Enseignement supérieur par site</button></div>
  <p class="note" style="margin:0 0 4px">${
    parSite
      ? "Une ligne par site (reprise du dernier état connu de chaque site réglable, désactivée par défaut), qualification de l'établissement en bas, déduite du site le plus grave. Revenir au modèle standard garde la question des sites comme un tableau ordinaire (rien n'est supprimé)."
      : "« Enseignement supérieur par site » : une question tableau existante qui a un site et une qualification devient le tableau des sites ; sinon la question « Sites concernés » est créée, avec ses tables (référentiel des sites, correspondances, sous-table historisée)."
  }</p>
  <span class="statut" id="pv-modele-statut" role="status"></span>
</div>
<div class="groupe"><div class="t">Version et présentation</div>
  <div class="seg2" role="group" aria-label="Version du formulaire">${Object.entries(PRESETS)
    .map(
      ([k, reglagesVersion]) =>
        `<button type="button" data-version="${k}" aria-pressed="${reglagesEffectifs.version === k}">${esc(reglagesVersion.libelle)}</button>`,
    )
    .join("")}</div>
  <p class="note" style="margin:0 0 8px">${fixe ? "" : "Déduite de la table, à confirmer. "}Choisir une version reprend ses réglages : bandeau, annuaires en ligne, en-tête de la description, fiche de l'établissement, choix multiples des tableaux.</p>
  <label class="l" for="pv-marque">Texte du bandeau</label><input type="text" id="pv-marque" value="${esc(reglagesFormulaire.marque || "")}" placeholder="${esc(PRESETS[reglagesEffectifs.version].marque)}">
  <label class="l" for="pv-pastilles">Choix multiples dans les tableaux</label>
  <select id="pv-pastilles"><option value="toujours"${reglagesEffectifs.pastilles === "toujours" ? " selected" : ""}>Toujours en pastilles</option><option value="auto"${reglagesEffectifs.pastilles !== "toujours" ? " selected" : ""}>Pastilles jusqu'à 8 choix, puis liste déroulante</option></select>
  <label class="interrupteur">Commentaire de mise à jour, saisi par l'agent <input type="checkbox" id="pv-commentaire"${reglagesEffectifs.commentaire ? " checked" : ""}${etatFormulaires.meta.Commentaire ? "" : " disabled"}></label>
  ${etatFormulaires.meta.Commentaire ? "" : `<p class="note" style="margin:0">Nécessite la colonne Commentaire (voir « Colonnes du questionnaire »).</p>`}
  <label class="interrupteur">Date des faits à venir admise (fermeture annoncée…) <input type="checkbox" id="pv-futurs"${reglagesEffectifs.faitsFuturs ? " checked" : ""}></label>
  <label class="interrupteur">Faits sur plusieurs jours (un signalement par jour) <input type="checkbox" id="pv-jours"${reglagesEffectifs.plusieursJours ? " checked" : ""}></label>
</div>`;
}
// modèle d'un formulaire : « esr-sites » dès qu'une question tableau est réglée en tableau des sites
const modeleCourant = () =>
  blocs().some((bloc) => bloc.reglages && bloc.reglages.tableau && bloc.reglages.tableau.sites) ? "esr-sites" : "";
async function changerModele(modele) {
  if (modele === modeleCourant()) return;
  const statut = $("pv-modele-statut"),
    dire = (texte, erreur) => {
      if (statut) {
        statut.textContent = texte;
        statut.className = `statut${erreur ? " err" : " ok"}`;
      }
    };
  try {
    if (!modele) {
      // retour au modèle standard : réglages des sites retirés, la question reste un tableau ordinaire
      if (
        !confirm(
          "Revenir au modèle standard ? La question des sites reste un tableau ordinaire (sans reprise du dernier état ni qualification déduite) ; aucune donnée n'est supprimée.",
        )
      )
        return;
      blocs().forEach((bloc) => {
        if (bloc.reglages && bloc.reglages.tableau) delete bloc.reglages.tableau.sites;
      });
      etatFormulaires.courant.conf.saisie = { ...(etatFormulaires.courant.conf.saisie || {}) };
      delete etatFormulaires.courant.conf.saisie.qualificationEnBas;
      sauver();
      dessinerApercu();
      dessinerPanneau();
      message("Modèle standard : pensez à publier.", "ok");
      return;
    }
    // une question tableau dont la table a un site (référence ou texte) et une qualification : elle devient le tableau des sites
    const candidats = blocs()
      .filter(
        (bloc) => bloc.genre === "question" && bloc.reglages && bloc.reglages.tableau && bloc.reglages.tableau.table,
      )
      .map((bloc) => {
        const colonnes = Object.values(colonnesDe(bloc.reglages.tableau.table)),
          trouverColonne = (motif, filtre) =>
            (colonnes.find((colonne) => filtre(colonne) && motif.test(colonne.colId)) || colonnes.find(filtre) || {})
              .colId || null;
        return {
          b: bloc,
          site: trouverColonne(
            /site/i,
            (colonne) =>
              /^Ref:/.test(colonne.type) &&
              colonne.type !== `Ref:${etatFormulaires.courant.table}` &&
              colonne.colId !== "Version",
          ),
          libre: trouverColonne(
            /site|libre|nom/i,
            (colonne) => /^Text/.test(colonne.type) && !colonne.formule && !RESERVES_TABLEAU.includes(colonne.colId),
          ),
          qualif: trouverColonne(/qualif/i, (colonne) => /^Choice/.test(colonne.type) && !colonne.formule),
        };
      })
      .filter((candidat) => (candidat.site || candidat.libre) && candidat.qualif);
    if (candidats.length) {
      const candidat = candidats[0];
      candidat.b.reglages.tableau.sites = {
        site: candidat.site,
        libre: candidat.libre,
        qualif: candidat.qualif,
        historique: [],
        alias: "Sites_correspondances",
      };
      etatFormulaires.courant.conf.saisie = {
        ...(etatFormulaires.courant.conf.saisie || {}),
        version: "esr",
        qualificationEnBas: true,
      };
      sauver();
      dessinerApercu();
      choisir(candidat.b.id);
      message(
        `Modèle « enseignement supérieur par site » : la question « ${libelleQuestion(candidat.b.colonne)} » devient le tableau des sites (site : ${candidat.site || "—"}, hors référentiel : ${candidat.libre || "—"}, qualification : ${candidat.qualif}). Vérifiez ses réglages, puis publiez.`,
        "ok",
      );
      return;
    }
    // un autre formulaire de la même table a déjà sa question des sites : même question, mêmes données
    for (const autreFormulaire of etatFormulaires.formulaires) {
      if (autreFormulaire.id === etatFormulaires.courant.id || autreFormulaire.table !== etatFormulaires.courant.table)
        continue;
      let configuration = null;
      try {
        configuration = JSON.parse(autreFormulaire.publie || autreFormulaire.brouillon || "null");
      } catch (_) {
        configuration = null;
      }
      const blocSites =
        configuration &&
        (configuration.blocs || []).find(
          (bloc) =>
            bloc.reglages && bloc.reglages.tableau && bloc.reglages.tableau.sites && etatFormulaires.meta[bloc.colonne],
        );
      if (!blocSites) continue;
      const copieBloc = JSON.parse(JSON.stringify(blocSites));
      copieBloc.id = nouvelId();
      copieBloc.section = "q";
      blocs().push(copieBloc);
      etatFormulaires.courant.conf.saisie = {
        ...(etatFormulaires.courant.conf.saisie || {}),
        version: "esr",
        qualificationEnBas: true,
      };
      sauver();
      dessinerApercu();
      choisir(copieBloc.id);
      message(
        `Modèle « enseignement supérieur par site » : question « ${libelleQuestion(copieBloc.colonne)} » reprise du formulaire « ${autreFormulaire.nom} » (même table, mêmes données). Publiez pour l'utiliser.`,
        "ok",
      );
      return;
    }
    dire("Création des tables et de la question des sites…");
    const resume = await installerModeleSites();
    message(
      `Modèle « enseignement supérieur par site » : ${resume}. Vérifiez les choix de qualification (du plus grave au moins grave), puis publiez.`,
      "ok",
    );
  } catch (erreur) {
    dire(`Échec : ${erreur.message || erreur}`, true);
  }
}
function lierVersion(panneau) {
  panneau
    .querySelectorAll("[data-modele]")
    .forEach((bouton) => bouton.addEventListener("click", () => changerModele(bouton.dataset.modele)));
  panneau.querySelectorAll("[data-version]").forEach((bouton) =>
    bouton.addEventListener("click", () => {
      const reglagesFormulaire = confSaisie();
      if (reglagesFormulaire.version === bouton.dataset.version) return;
      // la nouvelle version reprend ses réglages ; colonnes du référentiel, recherche et commentaire sont conservés
      etatFormulaires.courant.conf.saisie = {
        version: bouton.dataset.version,
        ...(reglagesFormulaire.colonnes ? { colonnes: reglagesFormulaire.colonnes } : {}),
        ...(reglagesFormulaire.recherche ? { recherche: reglagesFormulaire.recherche } : {}),
        ...(typeof reglagesFormulaire.commentaire === "boolean" ? { commentaire: reglagesFormulaire.commentaire } : {}),
      };
      sauver();
      dessinerApercu();
      dessinerPanneau();
    }),
  );
  const champMarque = $("pv-marque");
  if (champMarque)
    champMarque.addEventListener("input", () => {
      majSaisie((saisie) => {
        const texte = champMarque.value.trim();
        if (texte) saisie.marque = texte;
        else delete saisie.marque;
      });
      const marqueApercu = $("marque-apercu");
      if (marqueApercu) marqueApercu.textContent = saisieEffective().marque;
    });
  if ($("pv-pastilles"))
    $("pv-pastilles").addEventListener("change", (evenement) =>
      majSaisie((saisie) => {
        saisie.pastilles = evenement.target.value;
      }),
    );
  if ($("pv-commentaire"))
    $("pv-commentaire").addEventListener("change", (evenement) => {
      majSaisie((saisie) => {
        saisie.commentaire = evenement.target.checked;
      });
      dessinerApercu();
    });
  [
    ["pv-futurs", "faitsFuturs"],
    ["pv-jours", "plusieursJours"],
  ].forEach(([id, k]) => {
    if ($(id))
      $(id).addEventListener("change", (evenement) => {
        majSaisie((saisie) => {
          saisie[k] = evenement.target.checked;
        });
        dessinerApercu();
      });
  });
}

/* ---------- panneau « Établissement » : annuaires, colonnes du référentiel, fiche, recherche ---------- */
function optionsSourceFiche(sourceChoisie) {
  const colonnes = colonnesEtabProposees(tableEtablissements());
  return (
    `<optgroup label="Rôles reconnus">${Object.entries(ROLES_FICHE)
      .map(
        ([k, libelle]) =>
          `<option value="@${k}"${sourceChoisie === "@" + k ? " selected" : ""}>${esc(libelle)}${k === "region" ? " (colonne ou déduite de l'académie)" : ""}</option>`,
      )
      .join("")}</optgroup>` +
    `<optgroup label="Colonnes de ${esc(tableEtablissements() || "la table")}">${colonnes.map((colonne) => `<option value="${esc(colonne.colId)}"${sourceChoisie === colonne.colId ? " selected" : ""}>${esc(colonne.libelle)}</option>`).join("")}</optgroup>`
  );
}
function groupesEtablissementHtml() {
  const identifiantTable = tableEtablissements();
  if (!identifiantTable) return "";
  const reglagesEffectifs = saisieEffective(),
    reglagesFormulaire = confSaisie(),
    colonnes = colonnesEtabProposees(identifiantTable);
  if (!etatFormulaires.colonnesEtablissementTest.nom && !etatFormulaires.colonnesEtablissementTest.uai)
    devinerColonnesEtablissement();
  const texte = colonnes.filter((colonne) => ["Text", "Choice", "Any"].includes(typeBase(colonne.type)));
  return `<div class="groupe"><div class="t">Annuaires en ligne</div>
    <p class="note" style="margin:0 0 6px">Consultés quand l'établissement n'est pas dans le référentiel ; celui qui est choisi y est alors ajouté.</p>
    ${SOURCES_ANNUAIRE.map((source) => `<label class="interrupteur">${esc(source.nom)} <input type="checkbox" data-annuaire="${source.cle}"${reglagesEffectifs.annuaires.includes(source.cle) ? " checked" : ""}></label>`).join("")}
    ${reglagesEffectifs.annuaires.length ? "" : `<p class="note" style="margin:0">Aucun : la recherche porte uniquement sur la table ${esc(identifiantTable)}.</p>`}</div>
  <div class="groupe"><div class="t">Colonnes du référentiel</div>
    <p class="note" style="margin:0 0 6px">« Automatique » : le widget reconnaît la colonne d'après son nom ou, pour l'UAI, son contenu.</p>
    ${Object.entries(ROLES_ETABLISSEMENT)
      .map(
        ([k, libelle]) =>
          `<div class="reglage-q"><div><span>${esc(libelle)}</span><select data-role-col="${k}" aria-label="Colonne ${esc(libelle)}">` +
          `<option value="">Automatique${etatFormulaires.colonnesEtablissementTest[k] ? ` (${esc(libelleColonneEtablissement(etatFormulaires.colonnesEtablissementTest[k]))})` : ""}</option>${colonnes.map((colonne) => `<option value="${esc(colonne.colId)}"${(reglagesFormulaire.colonnes || {})[k] === colonne.colId ? " selected" : ""}>${esc(colonne.libelle)}</option>`).join("")}</select></div></div>`,
      )
      .join("")}</div>
  <div class="groupe"><div class="t">Fiche de l'établissement</div>
    <p class="note" style="margin:0 0 6px">Informations affichées par « Voir la fiche », dans cet ordre ; les champs texte sont modifiables par « Corriger la fiche ».</p>
    <div id="pe-fiche">${reglagesEffectifs.fiche
      .map(
        (champFiche, i) => `<div class="fiche-edit" data-i="${i}">
      <span class="ordre-sc" style="display:inline-flex;flex-direction:column"><button type="button" class="icone" data-fiche="haut"${i === 0 ? " disabled" : ""} aria-label="Monter">↑</button><button type="button" class="icone" data-fiche="bas"${i === reglagesEffectifs.fiche.length - 1 ? " disabled" : ""} aria-label="Descendre">↓</button></span>
      <input type="text" class="pe-lib" value="${esc(champFiche.lib || "")}" aria-label="Libellé affiché" placeholder="Libellé"><select class="pe-col" aria-label="Information">${optionsSourceFiche(champFiche.col)}</select>
      <button type="button" class="icone" data-fiche="suppr" aria-label="Retirer ${esc(champFiche.lib || champFiche.col)}">✕</button></div>`,
      )
      .join("")}</div>
    <button type="button" class="ajout-lien" id="pe-ajout">+ Ajouter une information</button>
    ${Array.isArray(reglagesFormulaire.fiche) ? ` · <button type="button" class="ajout-lien" id="pe-defaut">Revenir à la fiche de la version</button>` : ""}</div>
  <div class="groupe"><div class="t">Recherche aussi dans</div>
    <p class="note" style="margin:0 0 6px">Le nom, la commune et l'UAI sont toujours consultés${versionFormulaire() === "esr" ? ", ainsi que Sigle et Noms_rencontres_dans_les_sources s'ils existent" : ""}.</p>
    <div class="liste-choix-cols">${texte.map((colonne) => `<label class="interrupteur">${esc(colonne.libelle)} <input type="checkbox" data-recherche="${esc(colonne.colId)}"${reglagesEffectifs.recherche.includes(colonne.colId) ? " checked" : ""}></label>`).join("") || `<p class="note">Aucune colonne texte.</p>`}</div></div>`;
}
function lierEtablissement(panneau) {
  const redessiner = () => {
    dessinerPanneau();
    if (etatFormulaires.modeTest) majEtablissementTest();
  };
  panneau.querySelectorAll("[data-annuaire]").forEach((caseACocher) =>
    caseACocher.addEventListener("change", () => {
      majSaisie((saisie) => {
        saisie.annuaires = [...panneau.querySelectorAll("[data-annuaire]:checked")].map((i) => i.dataset.annuaire);
      });
      redessiner();
    }),
  );
  panneau.querySelectorAll("[data-role-col]").forEach((menu) =>
    menu.addEventListener("change", () => {
      majSaisie((saisie) => {
        const colonnesImposees = { ...(saisie.colonnes || {}) };
        if (menu.value) colonnesImposees[menu.dataset.roleCol] = menu.value;
        else delete colonnesImposees[menu.dataset.roleCol];
        if (Object.keys(colonnesImposees).length) saisie.colonnes = colonnesImposees;
        else delete saisie.colonnes;
      });
      if (etatFormulaires.modeTest) majEtablissementTest();
    }),
  );
  panneau.querySelectorAll("[data-recherche]").forEach((caseACocher) =>
    caseACocher.addEventListener("change", () => {
      majSaisie((saisie) => {
        saisie.recherche = [...panneau.querySelectorAll("[data-recherche]:checked")].map((i) => i.dataset.recherche);
      });
    }),
  );
  const lire = () =>
    [...panneau.querySelectorAll("#pe-fiche .fiche-edit")].map((ligneEdition) => ({
      col: ligneEdition.querySelector(".pe-col").value,
      lib: ligneEdition.querySelector(".pe-lib").value.trim(),
    }));
  const ecrire = (fiche) => {
    majSaisie((saisie) => {
      saisie.fiche = fiche;
    });
    redessiner();
  };
  panneau.querySelectorAll("#pe-fiche .fiche-edit").forEach((ligneEdition) => {
    ligneEdition.querySelector(".pe-lib").addEventListener("change", () =>
      majSaisie((saisie) => {
        saisie.fiche = lire();
      }),
    );
    ligneEdition.querySelector(".pe-col").addEventListener("change", (evenement) => {
      const fiche = lire(),
        i = +ligneEdition.dataset.i,
        valeur = evenement.target.value;
      fiche[i].lib = valeur.startsWith("@") ? ROLES_FICHE[valeur.slice(1)] : libelleColonneEtablissement(valeur); // libellé repris de l'information choisie
      ecrire(fiche);
    });
    ligneEdition.querySelectorAll("[data-fiche]").forEach((bouton) =>
      bouton.addEventListener("click", () => {
        const fiche = lire(),
          i = +ligneEdition.dataset.i,
          action = bouton.dataset.fiche;
        if (action === "suppr") {
          fiche.splice(i, 1);
          if (!fiche.length) {
            majSaisie((saisie) => {
              delete saisie.fiche;
            });
            redessiner();
            return;
          }
        } else {
          const j = action === "haut" ? i - 1 : i + 1;
          if (j < 0 || j >= fiche.length) return;
          [fiche[i], fiche[j]] = [fiche[j], fiche[i]];
        }
        ecrire(fiche);
      }),
    );
  });
  if ($("pe-ajout"))
    $("pe-ajout").addEventListener("click", () => {
      const fiche = lire(),
        pris = new Set(fiche.map((champFiche) => champFiche.col)),
        libre = colonnesEtabProposees(tableEtablissements()).find((colonne) => !pris.has(colonne.colId));
      fiche.push(libre ? { col: libre.colId, lib: libre.libelle } : { col: "@mail", lib: "Mail" });
      ecrire(fiche);
    });
  if ($("pe-defaut"))
    $("pe-defaut").addEventListener("click", () => {
      majSaisie((saisie) => {
        delete saisie.fiche;
      });
      redessiner();
    });
}
