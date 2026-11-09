/* PRISME — administration, onglet « Formulaires » : formulaires/tableaux.js
   Questions « tableau » : table existante reprise comme table des lignes, renommage de la table d'une question
   tableau.
   Chargé par admin/index.html dans l'ordre : fondations, donnees, formulaire-courant, colonnes-roles, apercu,
   mode-test, panneau-question, sites-esr, tableaux, gestion, description, saisie-etablissement, demarrage. Les
   fichiers partagent leurs noms (scripts classiques, sans import) : au chargement, un fichier ne fait que définir ;
   demarrage.js branche les événements et publie l'onglet. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : identifiantTable, remplacerTableDansConfiguration, remplacerTableDansReglage,
     renommerTableEtReferences, renommerTableTableau, tablesPourTableau, analyserTableLignes,
     reprendreLignesExistantes.
   Utilise :
     fondations : $, esc, etatFormulaires, message, typeBase.
     donnees : actions, colonnesDe, renommerTable.
     formulaire-courant : blocs, libelleQuestion, majEtat.
     colonnes-roles : metaCourante.
     apercu : dessinerApercu.
     mode-test : sousColonnes.
     panneau-question : dessinerPanneau.
     saisie-etablissement : tableEtablissements.
   Modifie etatFormulaires : meta. */
/* ---------- renommer la table d'une question tableau ----------
 RenameTable de Grist (lignes, colonnes Référence et formules suivent), puis le nom est remplacé dans tous les formulaires
 (brouillons et versions publiées : réglages.tableau.table) et dans les réglages de Config qui le citent (profils de
 l'atlas : sous-table des marques, sous-table des sites). Identifiant Grist : lettres sans accents, chiffres et « _ »,
 commençant par une majuscule. */
const identifiantTable = (texte) => {
  let nom = String(texte || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (/^[0-9]/.test(nom)) nom = "T_" + nom;
  return nom ? nom.charAt(0).toUpperCase() + nom.slice(1) : "";
};
/* Renommage de la table d'une question tableau : règles (sans page ni Grist) */
// Configuration d'un formulaire (JSON) dont les questions tableau visent l'ancienne table : réécrite vers la nouvelle
function remplacerTableDansConfiguration(json, ancien, nouveau) {
  if (!json) return json;
  let configuration;
  try {
    configuration = JSON.parse(json);
  } catch (_) {
    return json;
  }
  let nombre = 0;
  (configuration.blocs || []).forEach((bloc) => {
    if (bloc.reglages && bloc.reglages.tableau && bloc.reglages.tableau.table === ancien) {
      bloc.reglages.tableau.table = nouveau;
      nombre++;
    }
  });
  return nombre ? JSON.stringify(configuration) : json;
}
// Réglage de Config : copie où toute clé « table » qui vaut l'ancien nom vaut le nouveau ; null si rien ne change
function remplacerTableDansReglage(valeur, ancien, nouveau) {
  let nombre = 0;
  const marcher = (noeud) => {
    if (Array.isArray(noeud)) noeud.forEach(marcher);
    else if (noeud && typeof noeud === "object")
      for (const k of Object.keys(noeud)) {
        if (k === "table" && noeud[k] === ancien) {
          noeud[k] = nouveau;
          nombre++;
        } else marcher(noeud[k]);
      }
  };
  const copieValeur = JSON.parse(JSON.stringify(valeur));
  marcher(copieValeur);
  return nombre ? copieValeur : null;
}
/* Renommage de la table d'une question tableau : données. Renomme la table dans Grist, puis reporte le nouveau nom
   dans les formulaires (brouillons et versions publiées) et dans Config ; renvoie le nom retenu par Grist. */
async function renommerTableEtReferences(ancien, voulu) {
  await clearTimeout(etatFormulaires.minuterie);
  await etatFormulaires.enregistrementEnCours; // brouillon en attente : écrit avant
  const avant = new Set(etatFormulaires.tables);
  await renommerTable(ancien, voulu);
  const nouveau = etatFormulaires.tables.includes(voulu)
    ? voulu
    : etatFormulaires.tables.find((identifiantTable) => !avant.has(identifiantTable)) || voulu; // nom éventuellement ajusté par Grist
  // formulaires : réglages.tableau.table, brouillons et versions publiées
  etatFormulaires.courant.conf.blocs.forEach((bloc) => {
    if (bloc.reglages && bloc.reglages.tableau && bloc.reglages.tableau.table === ancien)
      bloc.reglages.tableau.table = nouveau;
  });
  const listeActions = [];
  for (const formulaire of etatFormulaires.formulaires) {
    const brouillon =
        formulaire.id === etatFormulaires.courant.id
          ? JSON.stringify(etatFormulaires.courant.conf)
          : remplacerTableDansConfiguration(formulaire.brouillon, ancien, nouveau),
      publie = remplacerTableDansConfiguration(formulaire.publie, ancien, nouveau);
    if (brouillon !== formulaire.brouillon || publie !== formulaire.publie) {
      listeActions.push([
        "UpdateRecord",
        etatFormulaires.tableFormulaires,
        formulaire.id,
        { Brouillon: brouillon, Publie: publie },
      ]);
      formulaire.brouillon = brouillon;
      formulaire.publie = publie;
    }
    if (formulaire.id === etatFormulaires.courant.id) etatFormulaires.courant.publie = publie;
  }
  // Config : profils de l'atlas (marques.table, sites.table) et tout autre réglage dont une clé « table » vaut l'ancien nom
  try {
    const configuration = await Socle.lireConfig();
    if (configuration)
      for (const [cle, valeur] of Object.entries(configuration.valeurs || {})) {
        if (!valeur || typeof valeur !== "object") continue;
        const nouvelleValeur = remplacerTableDansReglage(valeur, ancien, nouveau);
        if (nouvelleValeur) listeActions.push(Socle.actionConfig(configuration, cle, nouvelleValeur));
      }
  } catch (_) {
    /* sans Config : formulaires seulement */
  }
  if (listeActions.length) await actions(listeActions);
  return nouveau;
}
async function renommerTableTableau(bloc, saisi) {
  const ancien = bloc.reglages.tableau.table,
    voulu = identifiantTable(saisi);
  if (!voulu) {
    message("Donnez un nom à la table (lettres, chiffres, « _ »).", "err");
    return;
  }
  if (voulu === ancien) {
    if ($("pa-table-nom")) $("pa-table-nom").value = ancien;
    return;
  }
  if (etatFormulaires.tables.includes(voulu)) {
    message(`La table « ${voulu} » existe déjà dans le document : choisissez un autre nom.`, "err");
    return;
  }
  const autres = etatFormulaires.formulaires
    .filter((formulaire) =>
      [formulaire.brouillon, formulaire.publie].some((j) => String(j || "").includes(`"table":"${ancien}"`)),
    )
    .map((formulaire) => formulaire.nom);
  if (
    !confirm(
      `Renommer la table « ${ancien} » en « ${voulu} » ?\n\nDans Grist : lignes, références et formules suivent.\nFormulaires mis à jour (brouillon et version publiée) : ${autres.join(", ") || etatFormulaires.courant.nom}.\n\nLes widgets ouverts ailleurs (saisie, cartographie) sont à recharger.`,
    )
  )
    return;
  try {
    const nouveau = await renommerTableEtReferences(ancien, voulu);
    etatFormulaires.meta = metaCourante();
    dessinerApercu();
    dessinerPanneau();
    majEtat();
    message(
      `Table renommée « ${nouveau} »${autres.length ? ` ; formulaire(s) mis à jour : ${autres.join(", ")}` : ""}. Rechargez les widgets ouverts ailleurs.`,
      "ok",
    );
  } catch (erreur) {
    message(`Renommage refusé par Grist (${erreur.message || erreur}).`, "err");
    if ($("pa-table-nom")) $("pa-table-nom").value = ancien;
  }
}

/* =========================================================
 Question « tableau » sur une table existante
 ---------------------------------------------------------
 La table reçoit, si elles manquent, ses colonnes de liaison : Dossier (référence vers la table des réponses),
 Ligne_id et Ordre. Ses lignes déjà rattachées à un dossier sont reprises dans la réponse (format JSON) de la
 dernière étape de ce dossier : sans cela, la prochaine mise à jour du dossier les retirerait de la table.
 ========================================================= */
function tablesPourTableau() {
  const prises = new Set(
    [etatFormulaires.courant.table, tableEtablissements(), etatFormulaires.tableFormulaires].filter(Boolean),
  );
  return etatFormulaires.tables
    .filter((identifiantTable) => !prises.has(identifiantTable))
    .sort((tableA, tableB) => tableA.localeCompare(tableB, "fr"));
}
function analyserTableLignes(table) {
  const colonnes = colonnesDe(table),
    listeColonnes = Object.values(colonnes);
  const typeReference = `Ref:${etatFormulaires.courant.table}`;
  const colonneDossier = colonnes.Dossier;
  let erreur = "";
  if (colonneDossier && colonneDossier.type !== typeReference)
    erreur = `Sa colonne « Dossier » renvoie vers ${String(colonneDossier.type).replace(/^Ref:/, "la table ")} et non vers ${etatFormulaires.courant.table} : renommez-la dans Grist, ou choisissez une autre table.`;
  const colDossier =
    colonneDossier && colonneDossier.type === typeReference
      ? "Dossier"
      : (listeColonnes.find((colonne) => colonne.type === typeReference) || {}).colId || null;
  const ligne = !!colonnes.Ligne_id,
    ordre = !!colonnes.Ordre;
  const autres = blocs()
    .filter((bloc) => bloc.reglages && bloc.reglages.tableau && bloc.reglages.tableau.table === table)
    .map((bloc) => libelleQuestion(bloc.colonne));
  if (!erreur && autres.length) erreur = `Elle est déjà utilisée par la question « ${autres[0]} » de ce formulaire.`;
  const champs = sousColonnes(table).filter((colonne) => colonne.colId !== colDossier);
  const manquantes = [
    !colDossier && "Dossier (référence vers " + etatFormulaires.courant.table + ")",
    !ligne && "Ligne_id",
    !ordre && "Ordre",
  ].filter(Boolean);
  const html = erreur
    ? esc(erreur)
    : [
        `Champs de chaque ligne : ${champs.length ? champs.map((colonne) => esc(colonne.libelle)).join(", ") : "aucun pour l'instant (ajoutez-les ensuite dans le panneau)"}.`,
        colDossier ? `Lien vers le dossier : colonne ${esc(colDossier)}.` : "",
        manquantes.length
          ? `Colonne${manquantes.length > 1 ? "s" : ""} ajoutée${manquantes.length > 1 ? "s" : ""} à la table : ${esc(manquantes.join(", "))}.`
          : "",
        colDossier ? "Les lignes déjà rattachées à un dossier seront reprises dans ses réponses." : "",
      ]
        .filter(Boolean)
        .join(" ");
  return { erreur, colDossier, ligne, ordre, html };
}
async function reprendreLignesExistantes(table, colJson, colDos) {
  const donneesTable = await Donnees.lire(table),
    donneesReponses = await Donnees.lire(etatFormulaires.courant.table);
  if (!donneesTable[colDos]) return { lignes: 0, dossiers: 0 };
  const champs = sousColonnes(table).filter((colonne) => colonne.colId !== colDos && !colonne.r.confidentiel); // confidentiels : restent dans la table seulement
  const versNumero = (valeur) =>
    typeof valeur === "number" ? valeur : Array.isArray(valeur) && valeur[0] === "R" ? valeur[2] : 0;
  const parDossier = new Map(),
    listeActions = [];
  donneesTable.id.forEach((id, i) => {
    const numeroDossier = versNumero(donneesTable[colDos][i]);
    if (!numeroDossier) return;
    let identifiantLigne = donneesTable.Ligne_id ? donneesTable.Ligne_id[i] : null;
    if (!identifiantLigne) {
      identifiantLigne = "l" + id.toString(36) + Math.random().toString(36).slice(2, 8);
      listeActions.push(["UpdateRecord", table, id, { Ligne_id: identifiantLigne }]);
    }
    const ligneJson = { _id: identifiantLigne };
    for (const colonne of champs) {
      let valeur = donneesTable[colonne.colId] ? donneesTable[colonne.colId][i] : null;
      if (Array.isArray(valeur) && valeur[0] === "L") valeur = valeur.slice(1);
      if (
        valeur === "" ||
        valeur == null ||
        (Array.isArray(valeur) && !valeur.length) ||
        (typeBase(colonne.type) === "Ref" && !valeur)
      )
        continue;
      ligneJson[colonne.colId] = valeur;
    }
    if (!parDossier.has(numeroDossier)) parDossier.set(numeroDossier, []);
    parDossier.get(numeroDossier).push({
      o: ligneJson,
      rang: donneesTable.Ordre && donneesTable.Ordre[i] != null ? donneesTable.Ordre[i] : 1e9,
      id,
    });
  });
  // dernière étape de chaque dossier : faits les plus récents, puis saisie la plus récente, puis numéro de ligne
  const cle = (i) => [
    donneesReponses.Date_faits ? +donneesReponses.Date_faits[i] || 0 : 0,
    donneesReponses.Date ? +donneesReponses.Date[i] || 0 : 0,
    donneesReponses.id[i],
  ];
  const plus = (cleA, cleB) =>
    cleA[0] !== cleB[0] ? cleA[0] > cleB[0] : cleA[1] !== cleB[1] ? cleA[1] > cleB[1] : cleA[2] > cleB[2];
  const derniere = new Map();
  donneesReponses.id.forEach((id, i) => {
    const numeroDossier = versNumero(donneesReponses.Dossier ? donneesReponses.Dossier[i] : 0) || id;
    const indexRetenu = derniere.get(numeroDossier);
    if (indexRetenu == null || plus(cle(i), cle(indexRetenu))) derniere.set(numeroDossier, i);
  });
  let lignes = 0,
    dossiers = 0;
  for (const [numeroDossier, lignesDossier] of parDossier) {
    const i = derniere.get(numeroDossier);
    if (i == null) continue;
    lignesDossier.sort((ligneA, ligneB) => ligneA.rang - ligneB.rang || ligneA.id - ligneB.id);
    listeActions.push([
      "UpdateRecord",
      etatFormulaires.courant.table,
      donneesReponses.id[i],
      { [colJson]: JSON.stringify(lignesDossier.map((ligne) => ligne.o)) },
    ]);
    lignes += lignesDossier.length;
    dossiers++;
  }
  for (let k = 0; k < listeActions.length; k += 400) await actions(listeActions.slice(k, k + 400));
  return { lignes, dossiers };
}
