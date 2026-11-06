/* PRISME — widget de saisie, module 16/31 : Réglages du formulaire (table Parametres) : bornes des nombres, options, panneau ⚙.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* ---------- Réglages : lus et enregistrés dans la table Parametres ---------- */
/* ---------- Limites des nombres : description de la colonne > réglage de la question > réglage général ---------- */
const questionsNumeriques = () =>
  [...defsQuestions, ...defsDep, ...defsAca].filter((d) => !d.formule && ["Numeric", "Int"].includes(typeBase(d.type)));
const nombreOuNul = (x) =>
  x === "" || x == null || isNaN(parseFloat(String(x).replace(",", ".")))
    ? null
    : parseFloat(String(x).replace(",", "."));
function bornesDe(def) {
  const r = ((optionsAuto && optionsAuto.bornes) || {})[def.colId] || {};
  const min = def.min ?? nombreOuNul(r.min) ?? (optionsAuto && optionsAuto.nombresPositifs ? 0 : null);
  return { min, max: def.max ?? nombreOuNul(r.max) };
}
// Reporte les limites sur les champs (attributs min / max des flèches du champ nombre)
function appliquerBornes() {
  for (const def of questionsNumeriques()) {
    const { min, max } = bornesDe(def);
    document
      .querySelectorAll(`[data-champ$="-${def.colId}"] :is(input[type="number"], input.nombre-fr)`)
      .forEach((el) => {
        if (min != null) el.min = min;
        else el.removeAttribute("min");
        if (max != null) el.max = max;
        else el.removeAttribute("max");
      });
  }
}
function remplirBornesConfig() {
  const o = optionsAuto,
    qs = questionsNumeriques();
  $("cfg-bornes").innerHTML =
    qs
      .map((d) => {
        const r = (o.bornes || {})[d.colId] || {};
        const cellule = (cle, fixe) =>
          fixe != null
            ? `<input type="number" value="${fixe}" disabled title="Fixé par la description de la colonne">`
            : `<input type="number" step="any" data-col="${esc(d.colId)}" data-borne="${cle}" value="${r[cle] ?? ""}" aria-label="${cle === "min" ? "Minimum" : "Maximum"} de ${esc(d.libelle)}"` +
              `${cle === "min" ? ` placeholder="${o.nombresPositifs ? "0" : "aucun"}"` : ` placeholder="aucun"`}>`;
        return `<tr><td>${esc(d.libelle)}</td><td>${cellule("min", d.min)}</td><td>${cellule("max", d.max)}</td></tr>`;
      })
      .join("") || `<tr><td class="note" colspan="3">Aucune question numérique associée.</td></tr>`;
}
$("cfg-positifs").addEventListener("change", () => {
  document.querySelectorAll('#cfg-bornes input[data-borne="min"]').forEach((i) => {
    i.placeholder = $("cfg-positifs").checked ? "0" : "aucun";
  });
});
function lireBornesConfig() {
  const res = {};
  document.querySelectorAll("#cfg-bornes input[data-col]").forEach((i) => {
    const v = nombreOuNul(i.value);
    if (v == null) return;
    (res[i.dataset.col] = res[i.dataset.col] || {})[i.dataset.borne] = v;
  });
  return res;
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
let optionsParametres = null;
function descriptionDuFormulaire() {
  const d = formulaireActif && formulaireActif.conf && formulaireActif.conf.description;
  if (!d || !d.perso) return null;
  const res = { formatsQuestion: {}, formatsTableau: {} };
  for (const k of CLES_DESCRIPTION) if (k in d && d[k] != null) res[k] = d[k];
  for (const b of formulaireActif.conf.blocs || []) {
    const t = b.reglages && b.reglages.descTableau;
    if (b.colonne && t && typeof t === "object" && Object.keys(t).length) res.formatsTableau[b.colonne] = t;
  }
  return res;
}
// Enregistrement de ⚙ : quand le formulaire a ses propres réglages, ceux de la description commune restent inchangés
function garderDescriptionCommune(o) {
  if (!descriptionDuFormulaire()) return o;
  for (const k of CLES_DESCRIPTION) {
    if (optionsParametres && k in optionsParametres) o[k] = optionsParametres[k];
    else delete o[k];
  }
  return o;
}
function appliquerOptions(o) {
  optionsParametres = o || null;
  optionsAuto = { ...OPTIONS_DEFAUT, ...(o || {}), ...(descriptionDuFormulaire() || {}), description: false };
  appliquerBornes();
  majDescriptionAuto();
  majApercuAuto();
}
async function chargerReglages() {
  ligneParametres = null;
  colsParametres = [];
  if (!socleConfig) {
    try {
      await lireSocleSaisie();
    } catch (_) {}
  }
  if (reglagesDansConfig()) {
    const v = socleConfig.valeurs.resume_auto;
    ligneParametres = { id: null, [PARAMETRES.colonne]: v ? JSON.stringify(v) : "" };
    colsParametres = [PARAMETRES.colonne];
    appliquerOptions(v || null);
    return;
  }
  try {
    const t = await Donnees.lire(PARAMETRES.table);
    colsParametres = Object.keys(t);
    if (t.id.length) {
      ligneParametres = {};
      colsParametres.forEach((c) => (ligneParametres[c] = t[c][0]));
    }
  } catch (_) {
    /* table absente ou illisible (établissement) : réglages par défaut */
  }
  let o = null;
  const brutReglages = ligneParametres && ligneParametres[PARAMETRES.colonne];
  if (typeof brutReglages === "string" && brutReglages.trim()) {
    try {
      o = JSON.parse(brutReglages);
    } catch (e) {
      console.warn("Réglages du résumé illisibles", e);
    }
  }
  appliquerOptions(o);
}
async function remplirChoixTable() {
  const sel = $("cfg-table-etab");
  let tables = [];
  try {
    tables = (await grist.docApi.listTables()).filter((t) => !t.startsWith("_grist"));
  } catch (_) {}
  const choisie = optionsAuto[CLE_TABLE_ETAB] || "";
  sel.innerHTML =
    `<option value="">Automatique (table visée par la colonne Établissement)</option>` +
    tables.map((t) => `<option value="${esc(t)}"${t === choisie ? " selected" : ""}>${esc(t)}</option>`).join("");
  sel.value = choisie;
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
    .filter((k) => colsEtab.includes(E[k]))
    .map((k) => `${LIB_COL[k]} → ${E[k]}`);
  const absentes = ["nom", "uai"].filter((k) => !colsEtab.includes(E[k])).map((k) => LIB_COL[k]);
  $("cfg-table-etab-info").textContent =
    `Table utilisée actuellement : ${ETAB.table} (${ETAB.origineTable || "table par défaut"}), ${etabs.length} établissement(s).` +
    (utilisees.length ? ` Colonnes utilisées : ${utilisees.join(", ")}.` : "") +
    (absentes.length ? ` Non trouvée(s) : ${absentes.join(", ")}.` : "");
}
function ouvrirConfig() {
  const o = optionsAuto;
  remplirChoixTable();
  $("cfg-actif").checked = !!o.actif;
  $("cfg-format").value = o.format;
  $("cfg-separateur").value = o.separateur;
  $("cfg-puce").value = o.puce || "";
  $("cfg-qualification").checked = !!o.qualification;
  $("cfg-questions").checked = !!o.questions;
  $("cfg-mobilisation").checked = !!o.mobilisation;
  $("cfg-entete").checked = !!o.entete;
  const choixFormat = (valeur, avecExclure) =>
    [
      ["defaut", "Par défaut"],
      ["valeur", "Valeur seule"],
      ["libelle", "Libellé : valeur"],
      ...(avecExclure ? [["exclure", "Ne pas inclure"]] : []),
    ]
      .map(([v, t]) => `<option value="${v}"${v === (valeur || "defaut") ? " selected" : ""}>${t}</option>`)
      .join("");
  const questions = questionsDescription();
  const familles = [...new Set(questions.map(famille))];
  $("cfg-types").innerHTML =
    familles
      .map(
        (f) =>
          `<tr><td>${FAMILLES[f]}</td><td><select data-famille="${f}" aria-label="Format des ${FAMILLES[f].toLowerCase()}">${choixFormat((o.formatsType || {})[f])}</select></td></tr>`,
      )
      .join("") || `<tr><td class="note">Aucune question associée.</td></tr>`;
  $("cfg-par-question").innerHTML =
    questions
      .map(
        (d) =>
          `<tr><td>${esc(d.libelle)} <small class="note">(${d.tableau ? "tableau" : FAMILLES[famille(d)].toLowerCase()})</small></td>
     <td><select data-col="${esc(d.colId)}" aria-label="Format de ${esc(d.libelle)}">${
       d.tableau
         ? [
             ["defaut", "En-tête : libellé et nombre"],
             ["valeur", "En-tête : nombre seul"],
             ["exclure", "Sans en-tête (lignes seules)"],
           ]
             .map(
               ([v, t]) =>
                 `<option value="${v}"${v === (((o.formatsQuestion || {})[d.colId] === "libelle" ? "defaut" : (o.formatsQuestion || {})[d.colId]) || "defaut") ? " selected" : ""}>${t}</option>`,
             )
             .join("")
         : choixFormat((o.formatsQuestion || {})[d.colId], true)
     }</select></td></tr>` +
          (d.tableau
            ? d._sousDefs
              ? d._sousDefs
                  .map((s) =>
                    s.confidentiel
                      ? `<tr class="sous-reglage"><td>↳ ${esc(s.libelle || s.colId)}</td><td class="note">Confidentiel : jamais inclus</td></tr>`
                      : `<tr class="sous-reglage"><td>↳ ${esc(s.libelle || s.colId)}</td><td><select data-tableau="${esc(d.colId)}" data-sous="${esc(s.colId)}" aria-label="${esc(d.libelle)} : ${esc(s.libelle || s.colId)}, dans la ligne de chaque élément">${(s.auto
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
                            ([v, t]) =>
                              `<option value="${v}"${v === modeSous(d, s, o).ligne ? " selected" : ""}>${t}</option>`,
                          )
                          .join("")}</select>${
                          decomptable(s)
                            ? ` <label class="case case-decompte"><input type="checkbox" data-tableau="${esc(d.colId)}" data-sous="${esc(s.colId)}"${modeSous(d, s, o).decompte ? " checked" : ""}> ${
                                ["Numeric", "Int"].includes(typeBase(s.type)) ? "Somme en tête" : "Décompte en tête"
                              }</label>`
                            : ""
                        }</td></tr>`,
                  )
                  .join("")
              : `<tr class="sous-reglage"><td colspan="2" class="note">↳ Colonnes de la table « ${esc(d.tableau.table)} » en cours de chargement : rouvrez les réglages.</td></tr>`
            : ""),
      )
      .join("") || `<tr><td class="note">Aucune question associée.</td></tr>`;
  document
    .querySelectorAll("#cfg-types select, #cfg-par-question select, #cfg-par-question input")
    .forEach((sel) => sel.addEventListener("change", majExempleConfig));
  $("cfg-positifs").checked = !!o.nombresPositifs;
  remplirChoixFormulaire();
  remplirVersionConfig();
  remplirDiagnostic();
  remplirBornesConfig();
  const descForm = !!descriptionDuFormulaire();
  $("cfg-bloc-description").hidden = descForm;
  $("cfg-desc-formulaire").hidden = !descForm;
  if (descForm)
    $("cfg-desc-formulaire").textContent =
      `La description automatique du formulaire « ${formulaireActif.nom} » est réglée dans l'administration des formulaires (champ Description, « Réglages propres à ce formulaire »). Les réglages ci-dessous ne la concernent pas.`;
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
    longueur: optionsAuto.longueur,
    position: optionsAuto.position,
    qualification: $("cfg-qualification").checked,
    description: false,
    questions: $("cfg-questions").checked,
    mobilisation: $("cfg-mobilisation").checked,
    entete: $("cfg-entete").checked,
    formatsType: Object.fromEntries(
      [...document.querySelectorAll("#cfg-types select")].map((s) => [s.dataset.famille, s.value]),
    ),
    formatsQuestion: Object.fromEntries(
      [...document.querySelectorAll("#cfg-par-question select[data-col]")].map((s) => [s.dataset.col, s.value]),
    ),
    formatsTableau: [...document.querySelectorAll("#cfg-par-question select[data-tableau]")].reduce((acc, s) => {
      const c = document.querySelector(
        `#cfg-par-question input[data-tableau="${CSS.escape(s.dataset.tableau)}"][data-sous="${CSS.escape(s.dataset.sous)}"]`,
      );
      (acc[s.dataset.tableau] = acc[s.dataset.tableau] || {})[s.dataset.sous] = {
        ligne: s.value,
        decompte: !!(c && c.checked),
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
  const o = lireConfig();
  const exemple = (d) =>
    d.tableau
      ? texteTableauDescription(d, lignesExemple(d), o) || "(aucune ligne)"
      : {
          nombre: "20",
          date: dateCourteExemple(),
          case: "Oui",
          reference: "Collège Jean Rostand",
          choix: (d.opts && (d.opts.choices || [])[0]) || "Oui",
          texte: "texte saisi",
        }[famille(d)];
  const qDef = metaSig[col("Qualification")];
  let items = questionsDescription()
    .filter((d) => (d.colId === (qDef && qDef.colId) ? o.qualification : o.questions))
    .map((d) => ({ libelle: d.libelle, valeur: exemple(d), def: d }));
  if (!items.length)
    items = [
      o.qualification && { libelle: "Qualification", valeur: "Intrusion" },
      o.questions && { libelle: "Nombre d'élèves", valeur: "20" },
    ].filter(Boolean);
  $("cfg-exemple").textContent = o.actif
    ? descriptionGeneree(o, items, 3, identiteExemple()) || "(aucun élément inclus)"
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
    anciens = JSON.parse((ligneParametres && ligneParametres[PARAMETRES.colonne]) || "{}") || {};
  } catch (_) {}
  const o = garderDescriptionCommune({ ...anciens, ...lireConfig() });
  if (!o[CLE_TABLE_ETAB]) delete o[CLE_TABLE_ETAB];
  const tableAvant = ETAB.table;
  if (!reglagesDansConfig() && !colsParametres.includes(PARAMETRES.colonne)) {
    statut(
      "cfg-statut",
      `Créez d'abord une colonne texte « ${PARAMETRES.colonne} » dans la table « ${PARAMETRES.table} ».`,
      "err",
    );
    return;
  }
  const fields = { [PARAMETRES.colonne]: JSON.stringify(o) };
  if (reglagesDansConfig()) {
    try {
      await window.Socle.ecrireConfig("resume_auto", o);
      await lireSocleSaisie();
      await chargerReglages();
      statut("cfg-statut", "Réglages enregistrés (clé resume_auto de Config).", "ok");
      if ((o[CLE_TABLE_ETAB] || null) !== (tableAvant === TABLE_ETAB_DEFAUT ? null : tableAvant)) {
        await determinerTableEtab();
        await rafraichirEtabs(true);
      }
      await rafraichir();
    } catch (e) {
      statut("cfg-statut", `Échec : ${e.message || e}`, "err");
    }
    return;
  }
  try {
    const table = grist.getTable(PARAMETRES.table);
    if (ligneParametres) await table.update({ id: ligneParametres.id, fields });
    else await table.create({ fields });
    await chargerReglages();
    await determinerTableEtab();
    if (ETAB.table !== tableAvant) {
      etabCourant = null;
      enFile(async () => {
        await chargerConfiguration();
        await rafraichir();
      });
    }
    statut("cfg-statut", "Réglages enregistrés.", "ok");
    setTimeout(() => {
      $("config").hidden = true;
    }, 800);
  } catch (e) {
    statut(
      "cfg-statut",
      `Échec : ${e.message || e}. Vos droits ne permettent peut-être pas de modifier la table ${PARAMETRES.table}.`,
      "err",
    );
  }
});
