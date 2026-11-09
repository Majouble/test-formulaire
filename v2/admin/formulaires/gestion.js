/* PRISME — administration, onglet « Formulaires » : formulaires/gestion.js
   Formulaires : choix, création (table des réponses, référentiel), duplication, publication, suppression, colonnes
   de service.
   Chargé par admin/index.html dans l'ordre : fondations, donnees, formulaire-courant, colonnes-roles, apercu,
   mode-test, panneau-question, sites-esr, tableaux, gestion, description, saisie-etablissement, demarrage. Les
   fichiers partagent leurs noms (scripts classiques, sans import) : au chargement, un fichier ne fait que définir ;
   demarrage.js branche les événements et publie l'onglet. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : remplirChoixFormulaire, brancherEvenementsGestion, ouvrirNouveau, majChoixTable, majInfoReferentiel,
     creerTableReponses, publier, supprimerFormulaire, ajouterColonneService, devinerTableEtablissements,
     referentielDe, colonneUaiDe, colonneNomDe, analyserReferentiel, appliquerReferentiel.
   Utilise :
     fondations : $, COLONNES_COMMUNES, COLONNES_SERVICE_QUESTIONNAIRE, copie, esc, etatFormulaires, identifiant,
       maintenant, message, normaliser, nouvelId.
     donnees : actions, ajouterColonne, colonnesDe, creerLigneFormulaire, creerTableFormulaires, lireFormulaires,
       lireMeta.
     formulaire-courant : blocs, charger, sauver.
     colonnes-roles : ORDRE_ROLES, ROLE_PAR_ID, colonneEtablissementDe, metaCourante, rolesEffectifs.
     apercu : choisir, dessinerApercu, etapeExistantes, ouvrirMenu.
     mode-test : basculerTest, trouverColonneEtablissement.
     panneau-question : dessinerPanneau, majCopieLiens.
     sites-esr : installerModeleSites.
     saisie-etablissement : PRESETS, espaceCourant, lirePagesSaisie.
   Modifie etatFormulaires : courant, duplication, meta. */
/* =========================================================
 Formulaires : choix, création, duplication, publication
 ========================================================= */
function remplirChoixFormulaire() {
  const selecteur = $("choix-formulaire");
  selecteur.innerHTML = etatFormulaires.formulaires.length
    ? etatFormulaires.formulaires
        .map(
          (formulaire) =>
            `<option value="${formulaire.id}"${etatFormulaires.courant && formulaire.id === etatFormulaires.courant.id ? " selected" : ""}>${esc(formulaire.nom)}</option>`,
        )
        .join("")
    : `<option value="">(aucun formulaire)</option>`;
  selecteur.disabled = !etatFormulaires.formulaires.length;
  $("btn-dupliquer").disabled = $("btn-tester").disabled = !etatFormulaires.courant;
}
// Événements du choix, de la création, de la duplication, du test et de la publication d'un formulaire ; appelé une fois au démarrage
function brancherEvenementsGestion() {
  $("choix-formulaire").addEventListener("change", (evenement) => {
    const formulaire = etatFormulaires.formulaires.find((candidat) => candidat.id === +evenement.target.value);
    if (!formulaire) return;
    if (etatFormulaires.modeTest) basculerTest();
    charger(formulaire);
    remplirChoixFormulaire();
    dessinerApercu();
    dessinerPanneau();
  });
  $("nf-annuler").addEventListener("click", () => $("dlg-nouveau").close());
  $("nf-table").addEventListener("change", majChoixTable);
  $("nf-etab").addEventListener("change", majInfoReferentiel);
  $("nf-nom").addEventListener("input", () => {
    if ($("nf-table").value === "__nouvelle__" && !$("nf-nouvelle").dataset.touche)
      $("nf-nouvelle").value = identifiant($("nf-nom").value || "Reponses", etatFormulaires.metaTables[0].tableId);
  });
  $("nf-nouvelle").addEventListener("input", () => {
    $("nf-nouvelle").dataset.touche = "1";
  });
  $("form-nouveau").addEventListener("submit", async (evenement) => {
    evenement.preventDefault();
    const nom = $("nf-nom").value.trim();
    if (!nom) return;
    if (etatFormulaires.formulaires.some((formulaire) => formulaire.nom === nom)) {
      $("nf-erreur").textContent = "Un formulaire porte déjà ce nom.";
      return;
    }
    try {
      if (!(await lireFormulaires())) {
        await creerTableFormulaires();
        await lireMeta();
      }
      if (!colonnesDe(etatFormulaires.tableFormulaires).Type) {
        await ajouterColonne(etatFormulaires.tableFormulaires, "Type", { type: "Text", isFormula: false });
      }
      let table = etatFormulaires.duplication ? etatFormulaires.courant.table : $("nf-table").value;
      const type = etatFormulaires.duplication ? etatFormulaires.courant.type : $("nf-type").value;
      if (table === "__nouvelle__") {
        const nomTable = $("nf-nouvelle").value.trim();
        if (!nomTable) {
          $("nf-erreur").textContent = "Indiquez le nom de la nouvelle table.";
          return;
        }
        table = await creerTableReponses(nomTable, {
          etab: $("nf-etab").value,
          site: $("nf-site").checked && $("nf-modele").value !== "esr-sites",
          clos: $("nf-clos").checked,
        });
      } else if (!etatFormulaires.duplication && type === "etablissement") {
        // table existante : référentiel choisi (colonne Etablissement créée, ou rattachée à un autre référentiel)
        const analyse = await analyserReferentiel(table, $("nf-etab").value);
        if (analyse.erreur) {
          $("nf-erreur").textContent = analyse.erreur;
          return;
        }
        await appliquerReferentiel(table, analyse);
      }
      const configuration = etatFormulaires.duplication ? copie(etatFormulaires.courant.conf) : { blocs: [] };
      if (etatFormulaires.duplication)
        configuration.blocs.forEach((bloc) => {
          bloc.id = nouvelId();
        });
      const id = await creerLigneFormulaire({
        Nom: nom,
        Table: table,
        Type: type,
        Brouillon: JSON.stringify(configuration),
        Modifie_le: maintenant(),
      });
      await lireFormulaires();
      const formulaire =
        etatFormulaires.formulaires.find((candidat) => candidat.id === id) ||
        etatFormulaires.formulaires[etatFormulaires.formulaires.length - 1];
      $("dlg-nouveau").close();
      charger(formulaire);
      remplirChoixFormulaire();
      dessinerApercu();
      dessinerPanneau();
      if (
        !etatFormulaires.duplication &&
        !$("nf-bloc-import").hidden &&
        $("nf-import").checked &&
        Object.values(etatFormulaires.meta).some(
          (colonne) =>
            colonne.colId !== "id" &&
            !COLONNES_COMMUNES.concat(["Dossier", "Nature", "Date", "Commentaire", "Auteur", "Clos"]).includes(
              colonne.colId,
            ),
        )
      ) {
        const ancre = document.querySelector("[data-ajout]");
        if (ancre) {
          ouvrirMenu("q", 0, ancre);
          etapeExistantes();
        }
      }
      if (!etatFormulaires.duplication && $("nf-modele").value === "esr-sites") {
        const resume = await installerModeleSites();
        message(
          `Formulaire « enseignement supérieur par site » créé : ${resume}. Vérifiez les choix de qualification (du plus grave au moins grave), puis publiez.`,
          "ok",
        );
        return;
      }
      message(
        etatFormulaires.duplication
          ? "Formulaire dupliqué (mêmes colonnes, même table). Publiez-le pour l'utiliser sur une page."
          : "Formulaire créé.",
        "ok",
      );
    } catch (erreur) {
      $("nf-erreur").textContent = `Échec : ${erreur.message || erreur}`;
    }
  });
  $("btn-nouveau").addEventListener("click", () => ouvrirNouveau(false));
  $("btn-dupliquer").addEventListener("click", () => etatFormulaires.courant && ouvrirNouveau(true));
  $("btn-tester").addEventListener("click", () => etatFormulaires.courant && basculerTest());
  $("btn-publier").addEventListener("click", publier);
}
function ouvrirNouveau(dupliquer) {
  etatFormulaires.duplication = dupliquer;
  $("dlg-titre").textContent = dupliquer ? `Dupliquer « ${etatFormulaires.courant.nom} »` : "Nouveau formulaire";
  $("nf-nom").value = dupliquer ? `${etatFormulaires.courant.nom} (copie)` : "";
  $("nf-table").innerHTML =
    `<option value="__nouvelle__">+ Créer une nouvelle table…</option>` +
    etatFormulaires.tables
      .map(
        (identifiantTable) =>
          `<option${etatFormulaires.courant && identifiantTable === etatFormulaires.courant.table ? " selected" : ""}>${esc(identifiantTable)}</option>`,
      )
      .join("");
  if (!etatFormulaires.courant)
    $("nf-table").value = etatFormulaires.tables.includes(etatFormulaires.socleGeneral.reponses)
      ? etatFormulaires.socleGeneral.reponses
      : "__nouvelle__";
  const devine = etatFormulaires.tables.includes(etatFormulaires.socleGeneral.referentiel)
    ? etatFormulaires.socleGeneral.referentiel
    : devinerTableEtablissements();
  $("nf-etab").innerHTML =
    (etatFormulaires.tables.includes("Etablissements")
      ? ""
      : `<option value="__creer__">+ Créer une table « Etablissements »</option>`) +
    etatFormulaires.tables
      .map(
        (identifiantTable) =>
          `<option value="${esc(identifiantTable)}"${identifiantTable === devine ? " selected" : ""}>${esc(identifiantTable)}</option>`,
      )
      .join("");
  if (devine === "__creer__") $("nf-etab").value = "__creer__";
  $("nf-etab").dataset.devine = $("nf-etab").value;
  $("nf-bloc-table").hidden = $("nf-bloc-type").hidden = dupliquer;
  majChoixTable();
  if (dupliquer)
    $("nf-bloc-nouvelle").hidden =
      $("nf-bloc-import").hidden =
      $("nf-bloc-etab").hidden =
      $("nf-bloc-options").hidden =
        true;
  $("nf-bloc-modele").hidden = dupliquer;
  $("nf-modele").value = "";
  $("nf-valider").textContent = dupliquer ? "Dupliquer" : "Créer";
  $("nf-erreur").textContent = "";
  $("dlg-nouveau").showModal();
  $("nf-nom").focus();
  $("nf-nom").select();
}
function majChoixTable() {
  const nouvelle = $("nf-table").value === "__nouvelle__";
  $("nf-bloc-nouvelle").hidden = $("nf-bloc-options").hidden = !nouvelle;
  $("nf-bloc-import").hidden = nouvelle;
  $("nf-bloc-etab").hidden = false;
  const actuel = nouvelle ? null : referentielDe($("nf-table").value);
  $("nf-etab").value =
    actuel && [...$("nf-etab").options].some((option) => option.value === actuel)
      ? actuel
      : $("nf-etab").dataset.devine || $("nf-etab").value;
  majInfoReferentiel();
  if (nouvelle && !$("nf-nouvelle").value)
    $("nf-nouvelle").value = identifiant(
      $("nf-nom").value || "Reponses",
      etatFormulaires.metaTables ? etatFormulaires.metaTables[0].tableId : [],
    );
}
async function majInfoReferentiel() {
  const info = $("nf-etab-info"),
    identifiantTable = $("nf-table").value;
  if (identifiantTable === "__nouvelle__" || etatFormulaires.duplication) {
    info.hidden = true;
    return;
  }
  info.hidden = false;
  info.classList.remove("avert");
  info.textContent = "Vérification…";
  const analyse = await analyserReferentiel(identifiantTable, $("nf-etab").value);
  if ($("nf-table").value !== identifiantTable) return;
  info.textContent = analyse.erreur || analyse.texte;
  info.classList.toggle("avert", !!analyse.erreur);
}
// Table de réponses d'un questionnaire établissement (et référentiel des établissements s'il manque)
async function creerTableReponses(nom, options = {}) {
  const nouvelleTable = identifiant(nom, etatFormulaires.metaTables[0].tableId);
  let tableEtablissement =
    options.etab && options.etab !== "__creer__" && etatFormulaires.metaTables[0].tableId.includes(options.etab)
      ? options.etab
      : "Etablissements";
  if (!etatFormulaires.metaTables[0].tableId.includes(tableEtablissement))
    await actions([
      [
        "AddTable",
        "Etablissements",
        ["Nom", "UAI", "Type", "Academie", "Departement", "Commune", "Mail"]
          .map((id) => ({ id, type: "Text", isFormula: false }))
          .concat([{ id: "UUID", type: "Text", isFormula: false, formula: "UUID()" }]),
      ],
    ]);
  await actions([
    [
      "AddTable",
      nouvelleTable,
      [
        { id: "Etablissement", type: `Ref:${tableEtablissement}`, isFormula: false },
        ...(options.site ? [{ id: "Site", type: "Text", isFormula: false }] : []),
        { id: "Date_faits", type: "Date", isFormula: false },
        { id: "Qualification", type: "Choice", isFormula: false },
        { id: "Description", type: "Text", isFormula: false },
        { id: "Nature", type: "Choice", isFormula: false },
        { id: "Date", type: "DateTime:Europe/Paris", isFormula: false, formula: "NOW()" }, // formule d'initialisation : heure du serveur
        { id: "Commentaire", type: "Text", isFormula: false },
        { id: "Auteur", type: "Text", isFormula: false, formula: "user.Email" },
        ...(options.clos ? [{ id: "Clos", type: "Bool", isFormula: false }] : []),
      ],
    ],
  ]);
  await actions([
    ["AddColumn", nouvelleTable, "Dossier", { type: `Ref:${nouvelleTable}`, isFormula: false, label: "Dossier" }],
    // identifiants détachés des libellés d'abord : sans cela, Grist renommerait Date_faits, Date, Site d'après le libellé
    ...["Date_faits", "Date", ...(options.site ? ["Site"] : [])].map((identifiantColonne) => [
      "ModifyColumn",
      nouvelleTable,
      identifiantColonne,
      { untieColIdFromLabel: true },
    ]),
    ["ModifyColumn", nouvelleTable, "Date_faits", { label: "Date des faits" }],
    ["ModifyColumn", nouvelleTable, "Date", { label: "Date de saisie" }],
    [
      "ModifyColumn",
      nouvelleTable,
      "Qualification",
      { widgetOptions: JSON.stringify({ choices: ["Catégorie 1", "Catégorie 2"], choiceOptions: {} }) },
    ],
    [
      "ModifyColumn",
      nouvelleTable,
      "Nature",
      { widgetOptions: JSON.stringify({ choices: ["Nouveau signalement", "Mise à jour"] }) },
    ],
    ...(options.site ? [["ModifyColumn", nouvelleTable, "Site", { label: "Site / bâtiment" }]] : []),
  ]);
  await lireMeta();
  return nouvelleTable;
}
async function publier() {
  if (!etatFormulaires.courant) return;
  if (etatFormulaires.courant.type === "etablissement") {
    const roles = rolesEffectifs(),
      rolesManquants = ORDRE_ROLES.filter((role) => ROLE_PAR_ID[role].requis && !roles[role]);
    if (rolesManquants.length) {
      message(
        `Publication impossible : associez une colonne à ${rolesManquants.map((role) => ROLE_PAR_ID[role].lib.toLowerCase()).join(", ")} (panneau « Formulaire » › « Colonnes de la table des réponses »).`,
        "err",
      );
      choisir(null);
      return;
    }
    etatFormulaires.courant.conf.roles = roles; // colonnes proposées confirmées par la publication
  }
  const manquantes = blocs().filter((bloc) => bloc.genre === "question" && !etatFormulaires.meta[bloc.colonne]);
  if (
    manquantes.length &&
    !confirm(
      `${manquantes.length} question(s) renvoient à une colonne absente et seront ignorées. Publier quand même ?`,
    )
  )
    return;
  const configuration = copie(etatFormulaires.courant.conf);
  // document à deux champs : la version du formulaire est fixée d'après sa table (le widget n'a plus à la deviner)
  if (
    !(configuration.saisie && PRESETS[configuration.saisie.version]) &&
    espaceCourant() &&
    window.Socle.espaces(window.Socle.general(etatFormulaires.socleConfig)).length > 1
  )
    configuration.saisie = { ...(configuration.saisie || {}), version: espaceCourant().version };
  const json = JSON.stringify(configuration);
  try {
    // les libellés modifiés passent aussi dans Grist (en-têtes de colonnes), sans changer les identifiants
    const listeActions = [];
    for (const bloc of blocs()) {
      const colonne = etatFormulaires.meta[bloc.colonne];
      if (
        bloc.genre === "question" &&
        colonne &&
        bloc.reglages &&
        bloc.reglages.libelle &&
        bloc.reglages.libelle !== colonne.libelle
      )
        listeActions.push(
          ["ModifyColumn", etatFormulaires.courant.table, colonne.colId, { untieColIdFromLabel: true }],
          ["ModifyColumn", etatFormulaires.courant.table, colonne.colId, { label: bloc.reglages.libelle }],
        );
    }
    listeActions.push([
      "UpdateRecord",
      etatFormulaires.tableFormulaires,
      etatFormulaires.courant.id,
      { Publie: json, Brouillon: json, Publie_le: maintenant() },
    ]);
    await actions(listeActions);
    etatFormulaires.courant.publie = json;
    etatFormulaires.courant.publieLe = maintenant();
    const formulaire = etatFormulaires.formulaires.find((candidat) => candidat.id === etatFormulaires.courant.id);
    if (formulaire) {
      formulaire.publie = json;
      formulaire.brouillon = json;
      formulaire.publieLe = etatFormulaires.courant.publieLe;
    }
    await lireMeta();
    etatFormulaires.meta = metaCourante();
    dessinerApercu();
    dessinerPanneau();
    await lirePagesSaisie();
    dessinerPanneau();
    await majCopieLiens();
    // règles d'accès du socle : réappliquées si le formulaire publié les a rendues incomplètes (nouvelle sous-table…)
    let acces = { etat: "", texte: "" };
    try {
      if (window.OngletAcces && window.OngletAcces.reappliquerSiBesoin)
        acces = await window.OngletAcces.reappliquerSiBesoin();
    } catch (_) {
      /* facultatif */
    }
    const suite = acces.texte ? ` ${acces.texte}` : "";
    const alerteAcces = ["incomplet", "refusees"].includes(acces.etat);
    const sansPage =
      etatFormulaires.pagesSaisie &&
      !etatFormulaires.pagesSaisie.some((page) => page.table === etatFormulaires.courant.table);
    message(
      (sansPage
        ? "Formulaire publié. Aucune page de Grist ne l'affiche encore : créez les pages des agents dans Équipe › Pages de saisie."
        : "Formulaire publié : les pages qui l'affichent le prennent en compte dans les 30 secondes (ou au rechargement).") +
        suite,
      alerteAcces ? "err" : sansPage ? "" : "ok",
    );
  } catch (erreur) {
    message(`Publication refusée : ${erreur.message || erreur}`, "err");
  }
}
async function supprimerFormulaire() {
  if (
    !confirm(
      `Supprimer le formulaire « ${etatFormulaires.courant.nom} » ?\nSes colonnes et les réponses restent dans la table ${etatFormulaires.courant.table} ; les pages qui l'affichaient reviendront aux questions associées dans le widget.`,
    )
  )
    return;
  try {
    await actions([["RemoveRecord", etatFormulaires.tableFormulaires, etatFormulaires.courant.id]]);
    await lireFormulaires();
    etatFormulaires.courant = null;
    if (etatFormulaires.formulaires[0]) charger(etatFormulaires.formulaires[0]);
    remplirChoixFormulaire();
    dessinerApercu();
    dessinerPanneau();
  } catch (erreur) {
    message(`Suppression refusée : ${erreur.message || erreur}`, "err");
  }
}

/* ---------- colonnes de service du questionnaire (panneau « Formulaire ») ---------- */
async function ajouterColonneService(id) {
  const colonneService = COLONNES_SERVICE_QUESTIONNAIRE.find((colonne) => colonne.id === id);
  if (!colonneService || etatFormulaires.metaColonnesReelles[id]) return;
  try {
    await actions([
      ["AddColumn", etatFormulaires.courant.table, id, colonneService.info(etatFormulaires.courant.table)],
    ]);
    if (etatFormulaires.courant.conf.roles && etatFormulaires.courant.conf.roles[id] === "") {
      etatFormulaires.courant.conf.roles[id] = id;
      sauver();
    }
    await lireMeta();
    etatFormulaires.meta = metaCourante();
    dessinerApercu();
    dessinerPanneau();
    message(`Colonne « ${colonneService.lib} » ajoutée à la table ${etatFormulaires.courant.table}.`, "ok");
  } catch (erreur) {
    message(`Colonne non ajoutée : ${erreur.message || erreur}`, "err");
  }
}
// Référentiel proposé à la création : table « établissements » avec une colonne UAI, sinon « Etablissements »
function devinerTableEtablissements() {
  // tables visées par une colonne Etablissement existante d'abord (référentiel déjà utilisé), puis celles qui ont une colonne UAI
  const [, metaColonnes] = etatFormulaires.metaTables,
    nombreColonnesParTable = new Map();
  metaColonnes.colId.forEach((identifiantColonne, i) => {
    const correspondance =
      /^Etablissement/.test(identifiantColonne) && String(metaColonnes.type[i]).match(/^Ref:(.+)$/);
    if (correspondance)
      nombreColonnesParTable.set(correspondance[1], (nombreColonnesParTable.get(correspondance[1]) || 0) + 1);
  });
  const avecUai = (identifiantTable) =>
    Object.values(colonnesDe(identifiantTable)).some((colonne) =>
      /(^|[^a-z])(uai|rne)([^a-z]|$)/i.test(`${colonne.colId} ${colonne.libelle}`),
    );
  const tablesCandidates = etatFormulaires.tables
    .filter(
      (identifiantTable) =>
        /etab/.test(normaliser(identifiantTable).replace(/[^a-z]/g, "")) && avecUai(identifiantTable),
    )
    .sort((tableA, tableB) => (nombreColonnesParTable.get(tableB) || 0) - (nombreColonnesParTable.get(tableA) || 0));
  return tablesCandidates[0] || (etatFormulaires.tables.includes("Etablissements") ? "Etablissements" : "__creer__");
}

/* =========================================================
 Référentiel des établissements d'une table de réponses
 ---------------------------------------------------------
 La colonne Etablissement (référence) désigne le référentiel. Pour en changer alors que des signalements sont déjà
 saisis, chaque signalement est rattaché à la ligne du nouveau référentiel qui a le même UAI ; le changement est
 refusé si un seul établissement n'y est pas retrouvé (aucune réponse n'est détachée de son établissement).
 ========================================================= */
const referentielDe = (table) => {
  const id = colonneEtablissementDe(table),
    colonne = id && colonnesDe(table)[id];
  const correspondance = colonne && String(colonne.type).match(/^Ref:(.+)$/);
  return correspondance ? correspondance[1] : null;
};
function colonneUaiDe(table) {
  const colonnes = colonnesDe(table);
  return colonnes.UAI
    ? "UAI"
    : trouverColonneEtablissement(colonnes, [/(^|_)(uai|rne)(_|$)/, /uai|rne/], /tutelle|siege|parent/);
}
function colonneNomDe(table) {
  const colonnes = colonnesDe(table);
  return colonnes.Nom
    ? "Nom"
    : trouverColonneEtablissement(
        colonnes,
        [/(^|_)nom(_|$)/, /appellation|denomination|libelle|intitule/],
        /commune|ville|academi|departement|region|type|sigle|uai/,
      );
}
async function analyserReferentiel(table, choix) {
  const creer = choix === "__creer__",
    cible = creer ? "Etablissements" : choix;
  const colonnes = colonnesDe(table),
    identifiantColonneEtablissement = colonneEtablissementDe(table),
    colonneEtablissement = identifiantColonneEtablissement
      ? colonnes[identifiantColonneEtablissement]
      : colonnes.Etablissement || null,
    actuelle = referentielDe(table);
  if (colonneEtablissement && !actuelle)
    return {
      erreur: `La colonne ${colonneEtablissement.colId} de ${table} n'est pas une référence (type ${colonneEtablissement.type}) : changez son type dans Grist.`,
      texte: "",
    };
  if (!colonneEtablissement)
    return {
      tid: table,
      cible,
      creer,
      action: "creer",
      texte: `Une colonne Etablissement (référence vers ${cible}) sera ajoutée à la table ${table}.`,
    };
  const identifiantColonne = colonneEtablissement.colId;
  if (actuelle === cible)
    return {
      tid: table,
      cible,
      action: "rien",
      texte: `Référentiel actuel de la table ${table}${identifiantColonne !== "Etablissement" ? ` (colonne ${identifiantColonne})` : ""}.`,
    };
  const donnees = await Donnees.lire(table);
  const lignes = donnees.id.map((id, i) => ({ id, e: donnees[identifiantColonne][i] })).filter((ligne) => ligne.e);
  if (!lignes.length)
    return {
      tid: table,
      cible,
      creer,
      col: identifiantColonne,
      action: "changer",
      maj: [],
      texte: `La table ${table} passera du référentiel ${actuelle} à ${cible} (aucun signalement à rattacher).`,
    };
  if (creer)
    return {
      erreur: `${lignes.length} signalement(s) sont rattachés à ${actuelle} : choisissez un référentiel existant qui contient leurs établissements.`,
      texte: "",
    };
  const colonneUaiActuelle = colonneUaiDe(actuelle),
    colonneUaiCible = colonneUaiDe(cible);
  if (!colonneUaiActuelle || !colonneUaiCible)
    return {
      erreur: `Colonne UAI introuvable dans ${!colonneUaiActuelle ? actuelle : cible} : impossible de retrouver les établissements des ${lignes.length} signalement(s) déjà saisis.`,
      texte: "",
    };
  const [donneesActuelles, donneesCible] = await Promise.all([Donnees.lire(actuelle), Donnees.lire(cible)]);
  const cle = (valeur) =>
    String(valeur ?? "")
      .trim()
      .toUpperCase();
  const uaiAncien = new Map(donneesActuelles.id.map((id, i) => [id, cle(donneesActuelles[colonneUaiActuelle][i])]));
  const parUai = new Map();
  donneesCible.id.forEach((id, i) => {
    const k = cle(donneesCible[colonneUaiCible][i]);
    if (k && !parUai.has(k)) parUai.set(k, id);
  });
  const colonneNomActuelle = colonneNomDe(actuelle),
    nomAncien = (id) => {
      const i = donneesActuelles.id.indexOf(id);
      return i >= 0 && colonneNomActuelle ? donneesActuelles[colonneNomActuelle][i] : `n° ${id}`;
    };
  const misesAJour = [],
    absents = new Map();
  for (const ligne of lignes) {
    const uai = uaiAncien.get(ligne.e),
      idCible = uai ? parUai.get(uai) : null;
    if (idCible) misesAJour.push([ligne.id, idCible]);
    else absents.set(ligne.e, `${nomAncien(ligne.e)}${uai ? ` (${uai})` : " (sans UAI)"}`);
  }
  if (absents.size)
    return {
      erreur: `${absents.size} établissement(s) des signalements déjà saisis sont introuvables dans ${cible} par leur UAI : ${[...absents.values()].slice(0, 5).join(", ")}${absents.size > 5 ? "…" : ""}. Ajoutez-les à ${cible}, ou gardez le référentiel ${actuelle}.`,
      texte: "",
    };
  return {
    tid: table,
    cible,
    col: identifiantColonne,
    action: "changer",
    maj: misesAJour,
    texte: `La table ${table} passera du référentiel ${actuelle} à ${cible} : ${misesAJour.length} signalement(s) rattachés d'après leur UAI, tous retrouvés.`,
  };
}
async function appliquerReferentiel(table, analyse) {
  if (!analyse || analyse.action === "rien") return;
  if (analyse.creer && !etatFormulaires.metaTables[0].tableId.includes("Etablissements"))
    await actions([
      [
        "AddTable",
        "Etablissements",
        ["Nom", "UAI", "Type", "Academie", "Departement", "Commune", "Mail"]
          .map((id) => ({ id, type: "Text", isFormula: false }))
          .concat([{ id: "UUID", type: "Text", isFormula: false, formula: "UUID()" }]),
      ],
    ]);
  if (analyse.action === "creer")
    await actions([
      ["AddColumn", table, "Etablissement", { type: `Ref:${analyse.cible}`, isFormula: false, label: "Établissement" }],
    ]);
  else {
    const identifiantColonne = analyse.col || "Etablissement";
    const listeActions = [
      ["ModifyColumn", table, identifiantColonne, { type: `Ref:${analyse.cible}` }],
      ...(analyse.maj || []).map(([id, idEtablissement]) => [
        "UpdateRecord",
        table,
        id,
        { [identifiantColonne]: idEtablissement },
      ]),
    ];
    for (let k = 0; k < listeActions.length; k += 400) await actions(listeActions.slice(k, k + 400));
  }
  await lireMeta();
}
