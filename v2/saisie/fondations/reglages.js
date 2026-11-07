/* PRISME — widget de saisie, fondations/reglages.js
   Lecture des réglages communs (Config, sinon table Parametres) et panneau ⚙ de diagnostic de la page.
   Chargé par saisie/index.html dans l'ordre : fondations, composants, domaines, demarrage.js. Les fichiers partagent
   leurs noms (scripts classiques, sans import) : au chargement, un fichier ne fait que définir. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : reglagesDansConfig, VERSION_WIDGET, remplirActivite, colonnesReferentielUtilisees, remplirDiagnostic,
     PARAMETRES, appliquerOptions, chargerReglages, ouvrirConfig, brancherEvenementsReglages.
   Utilise :
     fondations/configuration : ETAB, OPTIONS_DEFAUT, colonnesEtab.
     fondations/outils : celluleRemplie, colonneDe, refId.
     fondations/etat : etatSaisie.
     fondations/grist : ACTIVITE, enFile, lireSocleSaisie.
     composants/nombres : appliquerBornes.
     domaines/formulaire/regles : descriptionDuFormulaire.
     domaines/etablissement/regles : calculerDiagnosticSignalements.
     domaines/etablissement/donnees : chargerEtabs, ecrireRattachementEtabs, oublierCacheReferentiel.
     domaines/dossier/affichage : rafraichir.
     domaines/enregistrement/affichage : majApercuAuto, majDescriptionAuto.
   Modifie etatSaisie : colsParametres, indexRecherche, ligneParametres, optionsAuto, optionsParametres. */
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
// colonnes du référentiel des établissements reconnues, et colonnes indispensables absentes
function colonnesReferentielUtilisees() {
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
    .map((k) => `${LIB_COL[k]} → ${esc(colonnesEtab[k])}`);
  const absentes = ["nom", "uai"].filter((k) => !etatSaisie.colsEtab.includes(colonnesEtab[k])).map((k) => LIB_COL[k]);
  return (
    (utilisees.length ? ` ; colonnes utilisées : ${utilisees.join(", ")}` : "") +
    (absentes.length ? ` ; <span style="color:var(--erreur)">non trouvée(s) : ${absentes.join(", ")}</span>` : "")
  );
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
    <p style="margin:0 0 4px">Référentiel : <b>${esc(ETAB.table)}</b> (${esc(ETAB.origineTable || "table par défaut")})${colonnesReferentielUtilisees()}, ${etatSaisie.etabs.length} établissement(s) lus${avec.length ? ` ; ${avec.length - perdus.length} signalement(s) sur ${avec.length} y retrouvent leur établissement` : ` ; <span style="color:var(--erreur)">aucune des ${etatSaisie.enregistrements.length} ligne(s) reçues par le widget ne porte un établissement valide</span>`}.</p>
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
// Réglages communs à tous les formulaires (description automatique, nombres, table de recherche forcée) : modifiés
// dans l'administration (onglets Formulaires et Installation), lus ici. Clé « resume_auto » de Config ; documents pas
// encore installés : une colonne texte de la table Parametres (première ligne), au format JSON.
const PARAMETRES = { table: "Parametres", colonne: "Resume_auto" };
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

// Panneau ⚙ : diagnostic de la page (les réglages se font dans l'administration)
function ouvrirConfig() {
  remplirDiagnostic();
  $("config").hidden = false;
  if ($("config").scrollIntoView) $("config").scrollIntoView({ block: "start" });
}

// Événements de la page traités ici ; appelé une fois par demarrage.js
function brancherEvenementsReglages() {
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
  $("cfg-fermer").addEventListener("click", () => {
    $("config").hidden = true;
  });
  $("btn-config").addEventListener("click", () => {
    if ($("config").hidden) ouvrirConfig();
    else $("config").hidden = true;
  });
}
