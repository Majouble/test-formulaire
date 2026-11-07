/* PRISME — widget de saisie, fondations/reglages.js
   Réglages du formulaire (table Parametres) et panneau ⚙.
   Chargé par saisie/index.html dans l'ordre : fondations, composants, domaines, demarrage.js. Les fichiers partagent
   leurs noms (scripts classiques, sans import) : au chargement, un fichier ne fait que définir. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : remplirVersionConfig, reglagesDansConfig, VERSION_WIDGET, remplirActivite, remplirDiagnostic,
     PARAMETRES, remplirBornesConfig, lireBornesConfig, garderDescriptionCommune, appliquerOptions, chargerReglages,
     remplirChoixTable, ouvrirConfig, lireConfig, dateCourteExemple, majExempleConfig, lignesExemple,
     brancherEvenementsReglages.
   Utilise :
     fondations/configuration : CLE_TABLE_ETAB, ETAB, OPTIONS_DEFAUT, TABLE_ETAB_DEFAUT, colonnesEtab.
     fondations/outils : celluleRemplie, colonneDe, refId, statut, typeBase.
     fondations/etat : etatSaisie.
     fondations/grist : ACTIVITE, enFile, lireSocleSaisie, listerTablesDuDocument.
     composants/nombres : appliquerBornes, nombreOuNul, questionsNumeriques.
     domaines/formulaire/regles : CLES_DESCRIPTION, PRESETS, appliquerModele, confSaisie, descriptionDuFormulaire,
       identiteExemple, varianteSaisie.
     domaines/formulaire/donnees : chargerConfiguration.
     domaines/formulaire/affichage : remplirChoixFormulaire.
     domaines/etablissement/regles : calculerDiagnosticSignalements.
     domaines/etablissement/donnees : chargerEtabs, determinerTableEtab, ecrireRattachementEtabs,
       oublierCacheReferentiel, rafraichirEtabs.
     domaines/dossier/affichage : rafraichir.
     domaines/enregistrement/regles : FAMILLES, decomptable, descriptionGeneree, famille, modeSous,
       questionsDescription, texteTableauDescription.
     domaines/enregistrement/affichage : majApercuAuto, majDescriptionAuto.
   Modifie etatSaisie : colsParametres, etabCourant, indexRecherche, ligneParametres, optionsAuto,
     optionsParametres, versionPage. */
// ⚙ : version de la page
function remplirVersionConfig() {
  const configurationFormulaire = confSaisie(),
    selecteurVersion = $("cfg-version");
  selecteurVersion.value = PRESETS[etatSaisie.versionPage] ? etatSaisie.versionPage : "";
  selecteurVersion.disabled = !!PRESETS[configurationFormulaire.version];
  $("cfg-version-info").textContent = PRESETS[configurationFormulaire.version]
    ? `Fixée par le formulaire « ${etatSaisie.formulaireActif.nom} » dans l'administration des formulaires : ${PRESETS[configurationFormulaire.version].libelle}.`
    : `Version appliquée : ${PRESETS[varianteSaisie().version].libelle}. « Automatique » la déduit de la table (colonne Site, ou référentiel autre que « Etablissements » : enseignement supérieur). Enregistré avec la page.`;
  $("cfg-entete-texte").textContent =
    `Commencer par l'établissement, par exemple « ${appliquerModele(varianteSaisie().entete, identiteExemple())} : »`;
}
// Réglages communs du widget (description automatique, table du référentiel) : clé « resume_auto » de Config,
// sinon l'ancienne table Parametres (documents pas encore installés)
const reglagesDansConfig = () => !!etatSaisie.socleConfig;
// ⚙ : ce que le widget utilise réellement (utile pour comprendre un affichage inattendu)
const VERSION_WIDGET = `v2 · ${window.Socle.VERSION}`;
function remplirActivite() {
  const activite = ACTIVITE,
    min = Math.max(1, (Date.now() - activite.debut) / 60000),
    fait = activite.envois.filter((envoi) => envoi.ms != null);
  const recents = activite.envois.filter((envoi) => Date.now() - envoi.t < 60000).length,
    dernier = activite.envois[activite.envois.length - 1];
  const moy = fait.length ? fait.reduce((somme, envoi) => somme + envoi.ms, 0) / fait.length : 0,
    max = fait.reduce((maximum, envoi) => Math.max(maximum, envoi.ms), 0);
  const formaterDuree = (millisecondes) => `${Math.round(millisecondes)} ms`;
  const lectures = Donnees.compteurs()
    .lectures.map(
      (lecture) =>
        `<li>${esc(lecture.table)} : ${lecture.nombre} fois, ${formaterDuree(lecture.ms / lecture.nombre)} en moyenne (au plus ${formaterDuree(lecture.max)})</li>`,
    )
    .join("");
  $("cfg-activite").innerHTML =
    `<p style="margin:0 0 4px">Depuis l'ouverture du widget (${Math.round(min)} min) :</p><ul style="margin:0;padding-left:18px">
    <li>Grist a envoyé la table <b>${activite.envois.length}</b> fois (${recents} dans la dernière minute, ${(activite.envois.length / min).toFixed(1)} par minute en moyenne)${dernier ? `, la dernière fois <b>${dernier.lignes}</b> lignes × ${dernier.colonnes} colonnes` : ""}${activite.regroupes ? ` ; ${activite.regroupes} envoi(s) rapprochés regroupés` : ""}.</li>
    <li>Traitement de ces envois par le widget : <b>${formaterDuree(moy)}</b> en moyenne, au plus ${formaterDuree(max)}.</li>
    <li>Ligne sélectionnée renvoyée par Grist : ${activite.curseur} fois (${activite.curseurIgnores} simples renvois sans effet).</li>
    <li>Tâches longues du widget (plus de 50 ms) : ${activite.longues}, ${formaterDuree(activite.dureeLongues)} au total${activite.longues ? ` (${formaterDuree(activite.dureeLongues / min)} par minute)` : ""}.</li>
    <li>Référentiel : ${etatSaisie.referentielDuCache ? `copie conservée dans ce navigateur (lue sur le serveur le ${Outils.dates.dateHeure(etatSaisie.referentielDuCache, { dateStyle: "short", timeStyle: "short" })}, relue automatiquement après 24 h) <button type="button" class="lien-texte" id="btn-relire-ref">Relire le référentiel maintenant</button>` : "lu sur le serveur à l'ouverture"}.</li>
    ${etatSaisie.sqlRefuse ? `<li>Lecture rapide (SQL) indisponible : ${esc(etatSaisie.sqlRefuse)} ; lecture habituelle utilisée.</li>` : ""}
    ${lectures ? `<li>Lectures dans Grist :<ul style="margin:0;padding-left:16px">${lectures}</ul></li>` : ""}</ul>
    <p style="margin:4px 0 0">Si la page est lente alors que ces temps restent faibles, le temps passe dans Grist (préparation et envoi de la table, calcul des formules) plutôt que dans le widget.</p>`;
}
function remplirDiagnostic() {
  remplirActivite();
  const LIB = {
    Etablissement: "Établissement",
    Dossier: "Dossier",
    Date_faits: "Date des faits",
    Date: "Date de saisie",
    Qualification: "Qualification",
    Description: "Description",
    Nature: "Nature",
    Commentaire: "Commentaire",
    Auteur: "Auteur",
    Site: "Site / bâtiment",
    Clos: "Clos",
  };
  const rempli = celluleRemplie;
  const ligne = (k) => {
    const colonne = colonneDe(k),
      metaColonne = colonne && etatSaisie.metaSig[colonne],
      origine =
        etatSaisie.mappings && typeof etatSaisie.mappings[k] === "string"
          ? "associée dans le panneau de Grist"
          : etatSaisie.rolesAdmin[k]
            ? "associée dans l'administration"
            : "reconnue d'après son nom";
    // lignes renseignées et exemple de valeur reçue (une référence invalide arrive sous forme de texte, par exemple)
    const valeursRecues = colonne
      ? etatSaisie.enregistrements.map((enregistrement) => enregistrement[colonne]).filter(rempli)
      : [];
    const exemple = valeursRecues.length ? JSON.stringify(valeursRecues[valeursRecues.length - 1]).slice(0, 60) : "";
    const refsInvalides =
      k === "Etablissement" && valeursRecues.length
        ? valeursRecues.filter((valeur) => refId(valeur) == null).length
        : 0;
    return `<li>${LIB[k]} : ${
      colonne
        ? `<b>${esc(colonne)}</b>${metaColonne ? ` <span class="note">(${esc(String(metaColonne.type).replace(/^Ref:/, "référence vers "))}, ${origine})</span>` : ""}` +
          ` — renseignée sur ${valeursRecues.length} ligne${valeursRecues.length > 1 ? "s" : ""} sur ${etatSaisie.enregistrements.length}${exemple ? `, par exemple ${esc(exemple)}` : ""}` +
          (refsInvalides
            ? ` <span style="color:var(--erreur)">· ${refsInvalides} valeur(s) qui ne sont pas des références valides (cellules en rouge dans Grist)</span>`
            : "")
        : `<span style="color:var(--erreur)">non trouvée</span>`
    }</li>`;
  };
  const { avec, perdus, ecartees, colonneEtablissement, refOk, aRattacher, textes } =
    calculerDiagnosticSignalements(LIB);
  $("cfg-diagnostic").innerHTML =
    `<p style="margin:0 0 4px">Widget : version du ${esc(VERSION_WIDGET)} · table des réponses <b>${esc(etatSaisie.tableId || "?")}</b> · formulaire ${etatSaisie.formulaireActif ? `« ${esc(etatSaisie.formulaireActif.nom)} » (publié)` : "<b>aucun formulaire publié</b> pour cette table"}.</p>
    <p style="margin:0 0 4px">Référentiel : <b>${esc(ETAB.table)}</b> (${esc(ETAB.origineTable || "table par défaut")}), ${etatSaisie.etabs.length} établissement(s) lus${avec.length ? ` ; ${avec.length - perdus.length} signalement(s) sur ${avec.length} y retrouvent leur établissement` : ` ; <span style="color:var(--erreur)">aucune des ${etatSaisie.enregistrements.length} ligne(s) reçues par le widget ne porte un établissement valide</span>`}.</p>
    <ul style="margin:0;padding-left:18px">${Object.keys(LIB).map(ligne).join("")}</ul>
    ${ecartees.length ? `<p style="margin:8px 0 4px">Colonne${ecartees.length > 1 ? "s" : ""} ${ecartees.map((k) => `« ${esc(k)} »`).join(", ")} de la table « ${esc(etatSaisie.tableId)} » ignorée${ecartees.length > 1 ? "s" : ""} car vide${ecartees.length > 1 ? "s" : ""} : les signalements sont lus dans ${ecartees.map((k) => `« ${esc(colonneDe(k))} »`).join(", ")}. Vous pouvez ${ecartees.length > 1 ? "les" : "la"} supprimer dans Grist si personne ne s'en sert.</p>` : ""}
    ${
      textes
        ? `<p style="margin:8px 0 4px">${textes} signalement(s) portent l'établissement sous forme de texte (cellules en rouge dans Grist) : le widget affiche ce texte, mais ces signalements ne sont pas reliés à la fiche de l'établissement (point de situation, filtres).
      ${
        aRattacher.length
          ? `${aRattacher.length} d'entre eux correspondent à un établissement de « ${esc(ETAB.table)} » par leur nom ou leur UAI.</p>
      <button type="button" class="secondaire" id="btn-rattacher-etabs">Rattacher ${aRattacher.length} signalement(s) à leur établissement</button>`
          : refOk
            ? "Aucun ne correspond exactement à un nom ou un UAI du référentiel : corrigez-les dans Grist.</p>"
            : `La colonne « ${esc(colonneEtablissement || "?")} » doit être une référence vers « ${esc(ETAB.table)} » pour les rattacher.</p>`
      }`
        : ""
    }`;
  const boutonRattacher = $("btn-rattacher-etabs");
  if (boutonRattacher)
    boutonRattacher.addEventListener("click", async () => {
      if (
        !confirm(
          `Remplacer le texte de ${aRattacher.length} cellule(s) « ${colonneEtablissement} » par la référence vers l'établissement correspondant de « ${ETAB.table} » ?`,
        )
      )
        return;
      boutonRattacher.disabled = true;
      boutonRattacher.textContent = "Rattachement…";
      try {
        await ecrireRattachementEtabs(aRattacher, colonneEtablissement);
        boutonRattacher.textContent = `${aRattacher.length} signalement(s) rattachés`;
      } catch (erreur) {
        boutonRattacher.disabled = false;
        boutonRattacher.textContent = "Réessayer le rattachement";
        alert(`Rattachement impossible : ${erreur.message || erreur}`);
      }
    });
}
// Mise à jour : résumé automatique des réponses modifiées, ajouté au commentaire à l'enregistrement.
// Il est affiché en aperçu au-dessus du commentaire, sans être mélangé au texte saisi : on peut ainsi
// choisir n'importe quel format (valeur seule, sur une seule ligne…) sans risque de confusion.
// Les réglages sont ceux du widget (panneau de configuration de Grist), communs à tous les utilisateurs.
// Réglages du résumé : une colonne texte de la table Parametres (première ligne), au format JSON.
const PARAMETRES = { table: "Parametres", colonne: "Resume_auto" };
function remplirBornesConfig() {
  const options = etatSaisie.optionsAuto,
    questions = questionsNumeriques();
  $("cfg-bornes").innerHTML =
    questions
      .map((question) => {
        const reglageBornes = (options.bornes || {})[question.colId] || {};
        const cellule = (cle, fixe) =>
          fixe != null
            ? `<input type="number" value="${fixe}" disabled title="Fixé par la description de la colonne">`
            : `<input type="number" step="any" data-col="${esc(question.colId)}" data-borne="${cle}" value="${reglageBornes[cle] ?? ""}" aria-label="${cle === "min" ? "Minimum" : "Maximum"} de ${esc(question.libelle)}"` +
              `${cle === "min" ? ` placeholder="${options.nombresPositifs ? "0" : "aucun"}"` : ` placeholder="aucun"`}>`;
        return `<tr><td>${esc(question.libelle)}</td><td>${cellule("min", question.min)}</td><td>${cellule("max", question.max)}</td></tr>`;
      })
      .join("") || `<tr><td class="note" colspan="3">Aucune question numérique associée.</td></tr>`;
}
function lireBornesConfig() {
  const bornes = {};
  document.querySelectorAll("#cfg-bornes input[data-col]").forEach((i) => {
    const nombre = nombreOuNul(i.value);
    if (nombre == null) return;
    (bornes[i.dataset.col] = bornes[i.dataset.col] || {})[i.dataset.borne] = nombre;
  });
  return bornes;
}
// Enregistrement de ⚙ : quand le formulaire a ses propres réglages, ceux de la description commune restent inchangés
function garderDescriptionCommune(options) {
  if (!descriptionDuFormulaire()) return options;
  for (const k of CLES_DESCRIPTION) {
    if (etatSaisie.optionsParametres && k in etatSaisie.optionsParametres) options[k] = etatSaisie.optionsParametres[k];
    else delete options[k];
  }
  return options;
}
function appliquerOptions(options) {
  etatSaisie.optionsParametres = options || null;
  etatSaisie.optionsAuto = {
    ...OPTIONS_DEFAUT,
    ...(options || {}),
    ...(descriptionDuFormulaire() || {}),
    description: false,
  };
  appliquerBornes();
  majDescriptionAuto();
  majApercuAuto();
}
async function chargerReglages() {
  etatSaisie.ligneParametres = null;
  etatSaisie.colsParametres = [];
  if (!etatSaisie.socleConfig) {
    try {
      await lireSocleSaisie();
    } catch (erreur) {
      console.warn("PRISME saisie : configuration du document illisible, réglages par défaut", erreur);
    }
  }
  if (reglagesDansConfig()) {
    const reglageResume = etatSaisie.socleConfig.valeurs.resume_auto;
    etatSaisie.ligneParametres = { id: null, [PARAMETRES.colonne]: reglageResume ? JSON.stringify(reglageResume) : "" };
    etatSaisie.colsParametres = [PARAMETRES.colonne];
    appliquerOptions(reglageResume || null);
    return;
  }
  try {
    const tableParametres = await Donnees.lire(PARAMETRES.table);
    etatSaisie.colsParametres = Object.keys(tableParametres);
    if (tableParametres.id.length) {
      etatSaisie.ligneParametres = {};
      etatSaisie.colsParametres.forEach(
        (colonne) => (etatSaisie.ligneParametres[colonne] = tableParametres[colonne][0]),
      );
    }
  } catch (_) {
    /* table absente ou illisible (établissement) : réglages par défaut */
  }
  let optionsLues = null;
  const brutReglages = etatSaisie.ligneParametres && etatSaisie.ligneParametres[PARAMETRES.colonne];
  if (typeof brutReglages === "string" && brutReglages.trim()) {
    try {
      optionsLues = JSON.parse(brutReglages);
    } catch (erreur) {
      console.warn("Réglages du résumé illisibles", erreur);
    }
  }
  appliquerOptions(optionsLues);
}
async function remplirChoixTable() {
  const menuTable = $("cfg-table-etab");
  const tables = (await listerTablesDuDocument()).filter((nomTable) => !nomTable.startsWith("_grist"));
  const choisie = etatSaisie.optionsAuto[CLE_TABLE_ETAB] || "";
  menuTable.innerHTML =
    `<option value="">Automatique (table visée par la colonne Établissement)</option>` +
    tables
      .map(
        (nomTable) =>
          `<option value="${esc(nomTable)}"${nomTable === choisie ? " selected" : ""}>${esc(nomTable)}</option>`,
      )
      .join("");
  menuTable.value = choisie;
  const LIB_COL = {
    nom: "nom",
    uai: "UAI",
    commune: "commune",
    type: "type",
    academie: "académie",
    departement: "département",
    mail: "mail",
  };
  const utilisees = Object.keys(LIB_COL)
    .filter((k) => etatSaisie.colsEtab.includes(colonnesEtab[k]))
    .map((k) => `${LIB_COL[k]} → ${colonnesEtab[k]}`);
  const absentes = ["nom", "uai"].filter((k) => !etatSaisie.colsEtab.includes(colonnesEtab[k])).map((k) => LIB_COL[k]);
  $("cfg-table-etab-info").textContent =
    `Table utilisée actuellement : ${ETAB.table} (${ETAB.origineTable || "table par défaut"}), ${etatSaisie.etabs.length} établissement(s).` +
    (utilisees.length ? ` Colonnes utilisées : ${utilisees.join(", ")}.` : "") +
    (absentes.length ? ` Non trouvée(s) : ${absentes.join(", ")}.` : "");
}
function ouvrirConfig() {
  const options = etatSaisie.optionsAuto;
  remplirChoixTable();
  $("cfg-actif").checked = !!options.actif;
  $("cfg-format").value = options.format;
  $("cfg-separateur").value = options.separateur;
  $("cfg-puce").value = options.puce || "";
  $("cfg-qualification").checked = !!options.qualification;
  $("cfg-questions").checked = !!options.questions;
  $("cfg-mobilisation").checked = !!options.mobilisation;
  $("cfg-entete").checked = !!options.entete;
  const choixFormat = (valeur, avecExclure) =>
    [
      ["defaut", "Par défaut"],
      ["valeur", "Valeur seule"],
      ["libelle", "Libellé : valeur"],
      ...(avecExclure ? [["exclure", "Ne pas inclure"]] : []),
    ]
      .map(
        ([valeurOption, libelleOption]) =>
          `<option value="${valeurOption}"${valeurOption === (valeur || "defaut") ? " selected" : ""}>${libelleOption}</option>`,
      )
      .join("");
  const questions = questionsDescription();
  const familles = [...new Set(questions.map(famille))];
  $("cfg-types").innerHTML =
    familles
      .map(
        (nomFamille) =>
          `<tr><td>${FAMILLES[nomFamille]}</td><td><select data-famille="${nomFamille}" aria-label="Format des ${FAMILLES[nomFamille].toLowerCase()}">${choixFormat((options.formatsType || {})[nomFamille])}</select></td></tr>`,
      )
      .join("") || `<tr><td class="note">Aucune question associée.</td></tr>`;
  $("cfg-par-question").innerHTML =
    questions
      .map(
        (question) =>
          `<tr><td>${esc(question.libelle)} <small class="note">(${question.tableau ? "tableau" : FAMILLES[famille(question)].toLowerCase()})</small></td>
     <td><select data-col="${esc(question.colId)}" aria-label="Format de ${esc(question.libelle)}">${
       question.tableau
         ? [
             ["defaut", "En-tête : libellé et nombre"],
             ["valeur", "En-tête : nombre seul"],
             ["exclure", "Sans en-tête (lignes seules)"],
           ]
             .map(
               ([valeurOption, libelleOption]) =>
                 `<option value="${valeurOption}"${valeurOption === (((options.formatsQuestion || {})[question.colId] === "libelle" ? "defaut" : (options.formatsQuestion || {})[question.colId]) || "defaut") ? " selected" : ""}>${libelleOption}</option>`,
             )
             .join("")
         : choixFormat((options.formatsQuestion || {})[question.colId], true)
     }</select></td></tr>` +
          (question.tableau
            ? question._sousDefs
              ? question._sousDefs
                  .map((sousColonne) =>
                    sousColonne.confidentiel
                      ? `<tr class="sous-reglage"><td>↳ ${esc(sousColonne.libelle || sousColonne.colId)}</td><td class="note">Confidentiel : jamais inclus</td></tr>`
                      : `<tr class="sous-reglage"><td>↳ ${esc(sousColonne.libelle || sousColonne.colId)}</td><td><select data-tableau="${esc(question.colId)}" data-sous="${esc(sousColonne.colId)}" aria-label="${esc(question.libelle)} : ${esc(sousColonne.libelle || sousColonne.colId)}, dans la ligne de chaque élément">${(sousColonne.auto
                          ? [
                              ["defaut", "Reprendre ce texte pour chaque ligne"],
                              ["exclure", "Ne pas l'utiliser (ligne recomposée)"],
                            ]
                          : [
                              ["defaut", "Par défaut (format général)"],
                              ["libelle", "Libellé : valeur"],
                              ["valeur", "Valeur seule"],
                              ["exclure", "Ne pas inclure"],
                            ]
                        )
                          .map(
                            ([valeurOption, libelleOption]) =>
                              `<option value="${valeurOption}"${valeurOption === modeSous(question, sousColonne, options).ligne ? " selected" : ""}>${libelleOption}</option>`,
                          )
                          .join("")}</select>${
                          decomptable(sousColonne)
                            ? ` <label class="case case-decompte"><input type="checkbox" data-tableau="${esc(question.colId)}" data-sous="${esc(sousColonne.colId)}"${modeSous(question, sousColonne, options).decompte ? " checked" : ""}> ${
                                ["Numeric", "Int"].includes(typeBase(sousColonne.type))
                                  ? "Somme en tête"
                                  : "Décompte en tête"
                              }</label>`
                            : ""
                        }</td></tr>`,
                  )
                  .join("")
              : `<tr class="sous-reglage"><td colspan="2" class="note">↳ Colonnes de la table « ${esc(question.tableau.table)} » en cours de chargement : rouvrez les réglages.</td></tr>`
            : ""),
      )
      .join("") || `<tr><td class="note">Aucune question associée.</td></tr>`;
  document
    .querySelectorAll("#cfg-types select, #cfg-par-question select, #cfg-par-question input")
    .forEach((menuFormat) => menuFormat.addEventListener("change", majExempleConfig));
  $("cfg-positifs").checked = !!options.nombresPositifs;
  remplirChoixFormulaire();
  remplirVersionConfig();
  remplirDiagnostic();
  remplirBornesConfig();
  const descForm = !!descriptionDuFormulaire();
  $("cfg-bloc-description").hidden = descForm;
  $("cfg-desc-formulaire").hidden = !descForm;
  if (descForm)
    $("cfg-desc-formulaire").textContent =
      `La description automatique du formulaire « ${etatSaisie.formulaireActif.nom} » est réglée dans l'administration des formulaires (champ Description, « Réglages propres à ce formulaire »). Les réglages ci-dessous ne la concernent pas.`;
  statut("cfg-statut", "");
  majExempleConfig();
  $("config").hidden = false;
  if ($("config").scrollIntoView) $("config").scrollIntoView({ block: "start" });
}
function lireConfig() {
  return {
    actif: $("cfg-actif").checked,
    format: $("cfg-format").value,
    separateur: $("cfg-separateur").value,
    puce: $("cfg-puce").value,
    longueur: etatSaisie.optionsAuto.longueur,
    position: etatSaisie.optionsAuto.position,
    qualification: $("cfg-qualification").checked,
    description: false,
    questions: $("cfg-questions").checked,
    mobilisation: $("cfg-mobilisation").checked,
    entete: $("cfg-entete").checked,
    formatsType: Object.fromEntries(
      [...document.querySelectorAll("#cfg-types select")].map((menu) => [menu.dataset.famille, menu.value]),
    ),
    formatsQuestion: Object.fromEntries(
      [...document.querySelectorAll("#cfg-par-question select[data-col]")].map((menu) => [
        menu.dataset.col,
        menu.value,
      ]),
    ),
    formatsTableau: [...document.querySelectorAll("#cfg-par-question select[data-tableau]")].reduce((acc, menu) => {
      const caseDecompte = document.querySelector(
        `#cfg-par-question input[data-tableau="${CSS.escape(menu.dataset.tableau)}"][data-sous="${CSS.escape(menu.dataset.sous)}"]`,
      );
      (acc[menu.dataset.tableau] = acc[menu.dataset.tableau] || {})[menu.dataset.sous] = {
        ligne: menu.value,
        decompte: !!(caseDecompte && caseDecompte.checked),
      };
      return acc;
    }, {}),
    nombresPositifs: $("cfg-positifs").checked,
    bornes: lireBornesConfig(),
    [CLE_TABLE_ETAB]: $("cfg-table-etab").value || undefined,
  };
}
const dateCourteExemple = () => Outils.dates.date(Date.now());
function majExempleConfig() {
  const options = lireConfig();
  const exemple = (question) =>
    question.tableau
      ? texteTableauDescription(question, lignesExemple(question), options) || "(aucune ligne)"
      : {
          nombre: "20",
          date: dateCourteExemple(),
          case: "Oui",
          reference: "Collège Jean Rostand",
          choix: (question.opts && (question.opts.choices || [])[0]) || "Oui",
          texte: "texte saisi",
        }[famille(question)];
  const qDef = etatSaisie.metaSig[colonneDe("Qualification")];
  let items = questionsDescription()
    .filter((question) => (question.colId === (qDef && qDef.colId) ? options.qualification : options.questions))
    .map((question) => ({ libelle: question.libelle, valeur: exemple(question), def: question }));
  if (!items.length)
    items = [
      options.qualification && { libelle: "Qualification", valeur: "Intrusion" },
      options.questions && { libelle: "Nombre d'élèves", valeur: "20" },
    ].filter(Boolean);
  $("cfg-exemple").textContent = options.actif
    ? descriptionGeneree(options, items, 3, identiteExemple()) || "(aucun élément inclus)"
    : "(pré-remplissage désactivé : la description se saisit librement)";
}
function lignesExemple(questionTableau) {
  // deux lignes fictives pour l'exemple des réglages
  return [0, 1].map((k) => {
    const ligneExemple = {};
    for (const sousDefinition of questionTableau._sousDefs || []) {
      const typeColonne = typeBase(sousDefinition.type),
        choix = (sousDefinition.opts && sousDefinition.opts.choices) || [];
      if (typeColonne === "Choice") ligneExemple[sousDefinition.colId] = choix[k % Math.max(choix.length, 1)] || "Oui";
      else if (typeColonne === "ChoiceList")
        ligneExemple[sousDefinition.colId] = choix.length ? [choix[k % choix.length]] : null;
      else if (typeColonne === "Bool") ligneExemple[sousDefinition.colId] = k === 0;
      else if (typeColonne === "Numeric" || typeColonne === "Int") ligneExemple[sousDefinition.colId] = k + 1;
      else if (typeColonne === "Date" || typeColonne === "DateTime")
        ligneExemple[sousDefinition.colId] = Math.floor(Date.now() / 86400000) * 86400;
      else if (typeColonne === "Ref" || typeColonne === "RefList") ligneExemple[sousDefinition.colId] = null;
      else ligneExemple[sousDefinition.colId] = k === 0 ? "texte saisi" : "autre texte";
    }
    return ligneExemple;
  });
}

// Événements de la page traités ici ; appelé une fois par demarrage.js
function brancherEvenementsReglages() {
  $("cfg-version").addEventListener("change", async () => {
    try {
      await grist.setOption("version", $("cfg-version").value || null);
      etatSaisie.versionPage = $("cfg-version").value || null;
      statut("cfg-statut", "Version de la page enregistrée.", "ok");
      enFile(async () => {
        await chargerConfiguration();
        await rafraichir();
        remplirVersionConfig();
      });
    } catch (erreur) {
      statut("cfg-statut", `Choix non enregistré : ${erreur.message || erreur}`, "err");
    }
  });
  $("btn-activite").addEventListener("click", remplirActivite);
  $("cfg-activite").addEventListener("click", async (evenement) => {
    if (evenement.target.id !== "btn-relire-ref") return;
    evenement.target.disabled = true;
    evenement.target.textContent = "Lecture en cours…";
    await oublierCacheReferentiel();
    await chargerEtabs(false);
    enFile(async () => {
      etatSaisie.indexRecherche = null;
      await rafraichir();
    });
    remplirActivite();
  });
  $("cfg-positifs").addEventListener("change", () => {
    document.querySelectorAll('#cfg-bornes input[data-borne="min"]').forEach((i) => {
      i.placeholder = $("cfg-positifs").checked ? "0" : "aucun";
    });
  });
  [
    "cfg-actif",
    "cfg-format",
    "cfg-separateur",
    "cfg-puce",
    "cfg-qualification",
    "cfg-questions",
    "cfg-mobilisation",
    "cfg-entete",
  ].forEach((id) => {
    $(id).addEventListener("input", majExempleConfig);
    $(id).addEventListener("change", majExempleConfig);
  });
  $("cfg-annuler").addEventListener("click", () => {
    $("config").hidden = true;
  });
  $("btn-config").addEventListener("click", () => {
    if ($("config").hidden) ouvrirConfig();
    else $("config").hidden = true;
  });
  $("cfg-enregistrer").addEventListener("click", async () => {
    let anciens = {};
    try {
      anciens =
        JSON.parse((etatSaisie.ligneParametres && etatSaisie.ligneParametres[PARAMETRES.colonne]) || "{}") || {};
    } catch (_) {
      // anciens réglages illisibles : ils sont remplacés
    }
    const options = garderDescriptionCommune({ ...anciens, ...lireConfig() });
    if (!options[CLE_TABLE_ETAB]) delete options[CLE_TABLE_ETAB];
    const tableAvant = ETAB.table;
    if (!reglagesDansConfig() && !etatSaisie.colsParametres.includes(PARAMETRES.colonne)) {
      statut(
        "cfg-statut",
        `Créez d'abord une colonne texte « ${PARAMETRES.colonne} » dans la table « ${PARAMETRES.table} ».`,
        "err",
      );
      return;
    }
    const fields = { [PARAMETRES.colonne]: JSON.stringify(options) };
    if (reglagesDansConfig()) {
      try {
        await window.Socle.ecrireConfig("resume_auto", options);
        await lireSocleSaisie();
        await chargerReglages();
        statut("cfg-statut", "Réglages enregistrés (clé resume_auto de Config).", "ok");
        if ((options[CLE_TABLE_ETAB] || null) !== (tableAvant === TABLE_ETAB_DEFAUT ? null : tableAvant)) {
          await determinerTableEtab();
          await rafraichirEtabs(true);
        }
        await rafraichir();
      } catch (erreur) {
        statut("cfg-statut", `Échec : ${erreur.message || erreur}`, "err");
      }
      return;
    }
    try {
      const table = grist.getTable(PARAMETRES.table);
      if (etatSaisie.ligneParametres) await table.update({ id: etatSaisie.ligneParametres.id, fields });
      else await table.create({ fields });
      await chargerReglages();
      await determinerTableEtab();
      if (ETAB.table !== tableAvant) {
        etatSaisie.etabCourant = null;
        enFile(async () => {
          await chargerConfiguration();
          await rafraichir();
        });
      }
      statut("cfg-statut", "Réglages enregistrés.", "ok");
      setTimeout(() => {
        $("config").hidden = true;
      }, 800);
    } catch (erreur) {
      statut(
        "cfg-statut",
        `Échec : ${erreur.message || erreur}. Vos droits ne permettent peut-être pas de modifier la table ${PARAMETRES.table}.`,
        "err",
      );
    }
  });
}
