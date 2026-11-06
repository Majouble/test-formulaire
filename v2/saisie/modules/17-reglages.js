/* PRISME — widget de saisie, module 17/34 : Réglages du formulaire (table Parametres) : bornes des nombres, options, panneau ⚙.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* ---------- Réglages : lus et enregistrés dans la table Parametres ---------- */
/* ---------- Limites des nombres : description de la colonne > réglage de la question > réglage général ---------- */
const questionsNumeriques = () =>
  [...etatSaisie.defsQuestions, ...etatSaisie.defsDep, ...etatSaisie.defsAca].filter(
    (question) => !question.formule && ["Numeric", "Int"].includes(typeBase(question.type)),
  );
const nombreOuNul = (valeur) =>
  valeur === "" || valeur == null || isNaN(parseFloat(String(valeur).replace(",", ".")))
    ? null
    : parseFloat(String(valeur).replace(",", "."));
function bornesDe(question) {
  const reglageBornes = ((etatSaisie.optionsAuto && etatSaisie.optionsAuto.bornes) || {})[question.colId] || {};
  const min =
    question.min ??
    nombreOuNul(reglageBornes.min) ??
    (etatSaisie.optionsAuto && etatSaisie.optionsAuto.nombresPositifs ? 0 : null);
  return { min, max: question.max ?? nombreOuNul(reglageBornes.max) };
}
// Reporte les limites sur les champs (attributs min / max des flèches du champ nombre)
function appliquerBornes() {
  for (const question of questionsNumeriques()) {
    const { min, max } = bornesDe(question);
    document
      .querySelectorAll(`[data-champ$="-${question.colId}"] :is(input[type="number"], input.nombre-fr)`)
      .forEach((champNombre) => {
        if (min != null) champNombre.min = min;
        else champNombre.removeAttribute("min");
        if (max != null) champNombre.max = max;
        else champNombre.removeAttribute("max");
      });
  }
}
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
$("cfg-positifs").addEventListener("change", () => {
  document.querySelectorAll('#cfg-bornes input[data-borne="min"]').forEach((i) => {
    i.placeholder = $("cfg-positifs").checked ? "0" : "aucun";
  });
});
function lireBornesConfig() {
  const bornes = {};
  document.querySelectorAll("#cfg-bornes input[data-col]").forEach((i) => {
    const nombre = nombreOuNul(i.value);
    if (nombre == null) return;
    (bornes[i.dataset.col] = bornes[i.dataset.col] || {})[i.dataset.borne] = nombre;
  });
  return bornes;
}
/* Description réglée dans l'administration des formulaires (« Réglages propres à ce formulaire ») :
   ces réglages remplacent ceux de ⚙ (table Parametres) pour la description et le résumé des mises à jour.
   Le format de chaque question vient de ses réglages dans le formulaire, celui des champs d'un tableau de descTableau. */
const CLES_DESCRIPTION = [
  "actif",
  "format",
  "separateur",
  "puce",
  "entete",
  "qualification",
  "questions",
  "mobilisation",
  "formatsType",
  "formatsQuestion",
  "formatsTableau",
];
function descriptionDuFormulaire() {
  const reglagesFormulaire =
    etatSaisie.formulaireActif && etatSaisie.formulaireActif.conf && etatSaisie.formulaireActif.conf.description;
  if (!reglagesFormulaire || !reglagesFormulaire.perso) return null;
  const reglages = { formatsQuestion: {}, formatsTableau: {} };
  for (const k of CLES_DESCRIPTION)
    if (k in reglagesFormulaire && reglagesFormulaire[k] != null) reglages[k] = reglagesFormulaire[k];
  for (const bloc of etatSaisie.formulaireActif.conf.blocs || []) {
    const reglagesTableau = bloc.reglages && bloc.reglages.descTableau;
    if (bloc.colonne && reglagesTableau && typeof reglagesTableau === "object" && Object.keys(reglagesTableau).length)
      reglages.formatsTableau[bloc.colonne] = reglagesTableau;
  }
  return reglages;
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
    } catch (_) {}
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
  let tables = [];
  try {
    tables = (await grist.docApi.listTables()).filter((nomTable) => !nomTable.startsWith("_grist"));
  } catch (_) {}
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
    anciens = JSON.parse((etatSaisie.ligneParametres && etatSaisie.ligneParametres[PARAMETRES.colonne]) || "{}") || {};
  } catch (_) {}
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
