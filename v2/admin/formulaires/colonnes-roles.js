/* PRISME — administration, onglet « Formulaires » : formulaires/colonnes-roles.js
   Colonnes de la table des réponses et leur rôle (établissement, dossier, date des faits…) : reconnaissance,
   réglage, panneau « Colonnes ».
   Chargé par admin/index.html dans l'ordre : fondations, donnees, formulaire-courant, colonnes-roles, apercu,
   mode-test, panneau-question, sites-esr, tableaux, gestion, description, saisie-etablissement, demarrage. Les
   fichiers partagent leurs noms (scripts classiques, sans import) : au chargement, un fichier ne fait que définir ;
   demarrage.js branche les événements et publie l'onglet. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : nomColonneComparable, ROLES_COLONNES, ROLE_PAR_ID, ORDRE_ROLES, colonnesRenseignees, celluleRemplie,
     reconnaitreRoles, colonnesQuestions, rolesReglesValides, rolesSocle, rolesEffectifs, roleRegle,
     colonneEtablissementDe, colonneEtablissement, metaCourante, lireRemplissage, groupeColonnesHtml, lierRoles.
   Utilise :
     fondations : $, COLONNES_SERVICE_QUESTIONNAIRE, esc, etatFormulaires, message.
     donnees : colonnesDe.
     formulaire-courant : blocs, majEtat, sauver.
     apercu : dessinerApercu.
     panneau-question : dessinerPanneau.
     saisie-etablissement : tableEtablissements.
   Modifie etatFormulaires : meta, metaColonnesReelles. */
/* =========================================================
 Colonnes de la table des réponses et leur rôle
 ---------------------------------------------------------
 Chaque rôle (établissement, dossier, date des faits…) est associé à une colonne dans le panneau « Formulaire »
 (groupe « Colonnes de la table des réponses ») : association enregistrée avec le formulaire (conf.roles) et publiée
 avec lui ; le widget de saisie l'applique telle quelle. Tant qu'un rôle n'est pas réglé, la colonne reconnue
 d'après son nom est proposée (la même reconnaissance que le widget de saisie).
 Dans l'administration, meta.Etablissement, meta.Site… désignent la colonne associée au rôle, quel que soit son
 identifiant réel (Etablissement_ESR…) : ces alias ne sont pas énumérables (Object.values(meta) liste les colonnes réelles).
 ========================================================= */
const nomColonneComparable = (texte) =>
  String(texte ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
const ROLES_COLONNES = [
  // ordre de reconnaissance (identique au widget de saisie)
  {
    id: "Dossier",
    lib: "Dossier",
    aide: "Référence vers cette même table : relie les mises à jour à leur signalement.",
    motifs: [/(^|_)dossier(_|$)/, /signalement_?initial/],
    ok: (colonne, identifiantTable) => colonne.type === `Ref:${identifiantTable}`,
  },
  {
    id: "Etablissement",
    lib: "Établissement",
    requis: true,
    aide: "Référence vers le référentiel des établissements.",
    motifs: [/etablissement/, /(^|_)etab(_|$)/, /structure|universite|ecole|college|lycee/],
    ok: (colonne, identifiantTable) => /^Ref:/.test(colonne.type) && colonne.type !== `Ref:${identifiantTable}`,
  },
  {
    id: "Date_faits",
    lib: "Date des faits",
    aide: "Jour des faits signalés.",
    motifs: [/faits?(_|$)/, /date_?(de_?l_?)?evenement/],
    ok: (colonne) => /^(Date|DateTime)/.test(colonne.type) && !colonne.formule,
  },
  {
    id: "Date",
    lib: "Date de saisie",
    aide: "Remplie par Grist (formule d'initialisation NOW()).",
    motifs: [/^date_?(de_?)?(saisie|creation|version)/, /cree_?le|horodat|creation/, /^date$/],
    ok: (colonne) => /^(DateTime|Date)/.test(colonne.type),
  },
  {
    id: "Qualification",
    lib: "Qualification",
    requis: true,
    aide: "Choix proposés à l'étape 2.",
    motifs: [/qualif/, /categorie_?(du_?)?(signalement|evenement)/, /type_?(d_?)?evenement/],
    ok: (colonne) => /^(Choice|ChoiceList|Text)/.test(colonne.type) && !colonne.formule,
  },
  {
    id: "Description",
    lib: "Description",
    requis: true,
    aide: "Texte rédigé à l'étape 3.",
    motifs: [/^description/, /description/, /recit|resume_?des_?faits/],
    ok: (colonne) => /^Text/.test(colonne.type) && !colonne.formule,
  },
  {
    id: "Nature",
    lib: "Nature",
    aide: "« Nouveau signalement » ou « Mise à jour ».",
    motifs: [/^nature$/, /nature_?(du_?)?(signalement|version|saisie)/],
    ok: (colonne) => /^(Choice|Text)/.test(colonne.type) && !colonne.formule,
  },
  {
    id: "Commentaire",
    lib: "Commentaire de mise à jour",
    aide: "Résumé des changements d'une mise à jour.",
    motifs: [/^commentaire/, /commentaire/],
    ok: (colonne) => /^Text/.test(colonne.type) && !colonne.formule,
  },
  {
    id: "Auteur",
    lib: "Auteur",
    aide: "Adresse de la personne qui enregistre (formule d'initialisation user.Email).",
    motifs: [/^auteur/, /saisi_?par|redacteur|createur/],
    ok: () => true,
  },
  {
    id: "Site",
    lib: "Site / bâtiment",
    aide: "Site, campus ou bâtiment concerné (étape 1).",
    motifs: [/^site/, /batiment|campus/],
    ok: (colonne) => /^(Text|Choice)/.test(colonne.type) && !colonne.formule,
  },
  {
    id: "Clos",
    lib: "Clos",
    aide: "Case « signalement terminé » (menu « Autres actions »).",
    motifs: [/^clos/, /cloture|termine/],
    ok: (colonne) => colonne.type === "Bool" && !colonne.formule,
  },
];
const ROLE_PAR_ID = Object.fromEntries(ROLES_COLONNES.map((role) => [role.id, role]));
const ORDRE_ROLES = [
  "Etablissement",
  "Site",
  "Date_faits",
  "Qualification",
  "Description",
  "Dossier",
  "Nature",
  "Date",
  "Commentaire",
  "Auteur",
  "Clos",
];
const colonnesRenseignees = new Map(); // table -> colonnes renseignées sur au moins une ligne
const celluleRemplie = (valeur) =>
  valeur != null &&
  valeur !== "" &&
  valeur !== 0 &&
  valeur !== false &&
  !(Array.isArray(valeur) && (valeur[0] === "L" ? valeur.length <= 1 : !valeur.length));
// Reconnaissance d'après les noms : mêmes règles que le widget de saisie (colonne remplie préférée, colonnes des
// questions jamais prises, rôles imposés conservés)
function reconnaitreRoles(brut, table, remplies, exclues, imposes) {
  const rolesTrouves = { ...(imposes || {}) },
    pris = new Set(Object.values(rolesTrouves).filter(Boolean));
  const colonnes = Object.values(brut || {}).filter(
    (colonne) =>
      colonne &&
      colonne.colId &&
      colonne.colId !== "id" &&
      colonne.colId !== "manualSort" &&
      !colonne.colId.startsWith("gristHelper"),
  );
  const noms = (colonne) =>
    [nomColonneComparable(colonne.colId), nomColonneComparable(colonne.libelle)].filter(Boolean);
  const remplie = (id) => !!(remplies && remplies.has(id)),
    exacts = new Set();
  for (const role of ROLES_COLONNES) {
    if (role.id in rolesTrouves) continue;
    const colonne = (brut || {})[role.id];
    if (colonne && !pris.has(role.id) && role.ok(colonne, table)) {
      rolesTrouves[role.id] = role.id;
      pris.add(role.id);
      exacts.add(role.id);
    }
  }
  for (const role of ROLES_COLONNES) {
    if (role.id in rolesTrouves && !exacts.has(role.id)) continue;
    if (exacts.has(role.id) && (!remplies || !remplies.size || remplie(role.id))) continue;
    let choix = null;
    for (const motif of role.motifs) {
      const candidats = colonnes.filter(
        (colonne) =>
          !pris.has(colonne.colId) &&
          !(exclues && exclues.has(colonne.colId)) &&
          role.ok(colonne, table) &&
          noms(colonne).some((nom) => motif.test(nom)),
      );
      if (!candidats.length) continue;
      if (role.id === "Date")
        candidats.sort(
          (candidatA, candidatB) =>
            (/NOW\(\)/.test(candidatB.texteFormule) ? 1 : 0) - (/NOW\(\)/.test(candidatA.texteFormule) ? 1 : 0),
        );
      const pleine = candidats.find((candidat) => remplie(candidat.colId));
      if (exacts.has(role.id)) {
        if (pleine) {
          choix = pleine;
          break;
        }
        continue;
      }
      choix = pleine || candidats[0];
      break;
    }
    if (choix) {
      if (rolesTrouves[role.id]) pris.delete(rolesTrouves[role.id]);
      rolesTrouves[role.id] = choix.colId;
      pris.add(choix.colId);
    }
  }
  return rolesTrouves;
}
const colonnesQuestions = () =>
  new Set(
    blocs()
      .filter((bloc) => bloc.genre === "question")
      .map((bloc) => bloc.colonne),
  );
// Rôles réglés dans ce formulaire (une colonne disparue depuis n'est plus retenue)
function rolesReglesValides() {
  const rolesConf = (etatFormulaires.courant && etatFormulaires.courant.conf.roles) || {},
    rolesValides = {};
  for (const [role, identifiantColonne] of Object.entries(rolesConf))
    if (ROLE_PAR_ID[role] && (identifiantColonne === "" || etatFormulaires.metaColonnesReelles[identifiantColonne]))
      rolesValides[role] = identifiantColonne;
  return rolesValides;
}
// Association effective : rôles réglés, sinon colonne proposée, sinon "" (aucune)
function rolesSocle() {
  const roles = {};
  if (!etatFormulaires.courant || etatFormulaires.courant.table !== etatFormulaires.socleGeneral.reponses) return roles;
  const rolesReponses =
    (etatFormulaires.socleConfig &&
      etatFormulaires.socleConfig.valeurs.roles &&
      etatFormulaires.socleConfig.valeurs.roles.reponses) ||
    {};
  for (const [k, identifiantColonne] of Object.entries(rolesReponses)) {
    const id = k === "Cree_le" ? "Date" : k;
    if (ROLE_PAR_ID[id] && etatFormulaires.metaColonnesReelles[identifiantColonne]) roles[id] = identifiantColonne;
  }
  return roles;
}
function rolesEffectifs() {
  if (!etatFormulaires.courant || etatFormulaires.courant.type !== "etablissement") return {};
  const rolesReconnus = reconnaitreRoles(
    etatFormulaires.metaColonnesReelles,
    etatFormulaires.courant.table,
    colonnesRenseignees.get(etatFormulaires.courant.table),
    colonnesQuestions(),
    {
      ...rolesSocle(),
      ...rolesReglesValides(),
    },
  );
  return Object.fromEntries(ORDRE_ROLES.map((role) => [role, rolesReconnus[role] || ""]));
}
const roleRegle = (role) => role in rolesReglesValides();
// Colonne de l'établissement d'une table quelconque (création d'un formulaire sur une table existante…)
function colonneEtablissementDe(table) {
  if (
    etatFormulaires.courant &&
    table === etatFormulaires.courant.table &&
    etatFormulaires.courant.type === "etablissement"
  )
    return rolesEffectifs().Etablissement || null;
  return reconnaitreRoles(colonnesDe(table), table, colonnesRenseignees.get(table)).Etablissement || null;
}
const colonneEtablissement = () =>
  (etatFormulaires.meta.Etablissement && etatFormulaires.meta.Etablissement.colId) || "Etablissement";
function metaCourante() {
  etatFormulaires.metaColonnesReelles = colonnesDe(etatFormulaires.courant.table);
  const metaColonnes = { ...etatFormulaires.metaColonnesReelles };
  if (etatFormulaires.courant.type !== "etablissement") return metaColonnes;
  const roles = rolesEffectifs(),
    regles = rolesReglesValides();
  for (const [role, identifiantColonne] of Object.entries(roles)) {
    if (identifiantColonne === role || (!identifiantColonne && !(role in regles))) continue; // même identifiant, ou rien de mieux que la colonne de ce nom
    delete metaColonnes[role];
    if (identifiantColonne && etatFormulaires.metaColonnesReelles[identifiantColonne])
      Object.defineProperty(metaColonnes, role, {
        value: etatFormulaires.metaColonnesReelles[identifiantColonne],
        enumerable: false,
        configurable: true,
        writable: true,
      });
  }
  return metaColonnes;
}
// Colonnes renseignées de la table (lecture unique à l'ouverture du formulaire) : la proposition préfère une colonne
// remplie à une colonne vide du même nom
async function lireRemplissage(table) {
  if (!table || colonnesRenseignees.has(table)) return;
  try {
    const donnees = await Donnees.lire(table);
    colonnesRenseignees.set(
      table,
      new Set(
        Object.keys(donnees).filter(
          (identifiantColonne) =>
            identifiantColonne !== "id" && (donnees[identifiantColonne] || []).some(celluleRemplie),
        ),
      ),
    );
  } catch (_) {
    colonnesRenseignees.set(table, new Set());
  }
  if (etatFormulaires.courant && etatFormulaires.courant.table === table) {
    const avant = JSON.stringify(Object.keys(etatFormulaires.meta).concat(Object.values(rolesEffectifs())));
    etatFormulaires.meta = metaCourante();
    if (JSON.stringify(Object.keys(etatFormulaires.meta).concat(Object.values(rolesEffectifs()))) !== avant) {
      dessinerApercu();
      dessinerPanneau();
      majEtat();
    }
  }
}
function groupeColonnesHtml() {
  if (etatFormulaires.courant.type !== "etablissement") return "";
  const roles = rolesEffectifs(),
    tableEtablissement = tableEtablissements(),
    questions = colonnesQuestions();
  const colonnes = Object.values(etatFormulaires.metaColonnesReelles)
    .filter((colonne) => colonne.colId !== "id")
    .sort((colonneA, colonneB) => colonneA.pos - colonneB.pos);
  const service = new Set(COLONNES_SERVICE_QUESTIONNAIRE.map((colonne) => colonne.id));
  const manquants = ORDRE_ROLES.filter((role) => ROLE_PAR_ID[role].requis && !roles[role]);
  const proposes = ORDRE_ROLES.filter((role) => roles[role] && !roleRegle(role));
  const ligne = (role) => {
    const definitionRole = ROLE_PAR_ID[role],
      identifiantChoisi = roles[role];
    const compat = colonnes.filter(
      (colonne) =>
        (definitionRole.ok(colonne, etatFormulaires.courant.table) && !questions.has(colonne.colId)) ||
        colonne.colId === identifiantChoisi,
    );
    const autreRole = (id) => ORDRE_ROLES.find((k) => k !== role && roles[k] === id);
    const optionsHtml =
      `<option value=""${identifiantChoisi ? "" : " selected"}>— aucune —</option>` +
      compat
        .map((colonne) => {
          const roleDejaPris = autreRole(colonne.colId);
          return `<option value="${esc(colonne.colId)}"${colonne.colId === identifiantChoisi ? " selected" : ""}>${esc(colonne.libelle)}${colonne.libelle !== colonne.colId ? ` (${esc(colonne.colId)})` : ""}${roleDejaPris ? ` — déjà : ${esc(ROLE_PAR_ID[roleDejaPris].lib.toLowerCase())}` : ""}</option>`;
        })
        .join("");
    const etat = !identifiantChoisi
      ? definitionRole.requis
        ? '<span class="avert" style="display:inline;padding:0 4px">obligatoire</span>'
        : ""
      : roleRegle(role)
        ? ""
        : '<span class="note" style="display:inline">proposée</span>';
    const ajout =
      !identifiantChoisi && service.has(role) && !etatFormulaires.metaColonnesReelles[role]
        ? ` <button type="button" class="ajout-lien" data-ajout-col="${role}">Créer la colonne</button>`
        : "";
    return `<li><label for="role-${role}" style="display:block;font-weight:600">${esc(definitionRole.lib)} ${etat}${ajout}</label>
    <select id="role-${role}" data-role-col="${role}" style="margin:2px 0 0;width:100%">${optionsHtml}</select><small>${esc(definitionRole.aide)}</small></li>`;
  };
  return `<div class="groupe"><div class="t">Colonnes de la table des réponses</div>
  <p class="note" style="margin:0 0 6px">Colonne de la table <b>${esc(etatFormulaires.courant.table)}</b> utilisée pour chaque rôle, par ce formulaire et le widget de saisie.
    ${proposes.length ? `Les colonnes marquées « proposée » ont été reconnues d'après leur nom : vérifiez-les ; elles seront confirmées à la publication.` : ""}</p>
  ${manquants.length ? `<p class="avert" style="margin:0 0 6px">À associer avant de publier : ${manquants.map((role) => esc(ROLE_PAR_ID[role].lib)).join(", ")}.</p>` : ""}
  ${proposes.length ? `<button type="button" class="secondaire petit" id="roles-confirmer" style="margin-bottom:6px">Confirmer les colonnes proposées</button>` : ""}
  <ul class="liste-cols">${ORDRE_ROLES.map(ligne).join("")}</ul>
  <p class="note" style="margin:6px 0 0">Référentiel des établissements : table <b>${esc(tableEtablissement || "?")}</b>.</p></div>`;
}
function lierRoles(panneau) {
  panneau.querySelectorAll("[data-role-col]").forEach((selecteur) =>
    selecteur.addEventListener("change", () => {
      const role = selecteur.dataset.roleCol,
        identifiantSelectionne = selecteur.value,
        roles = (etatFormulaires.courant.conf.roles = { ...(etatFormulaires.courant.conf.roles || {}) });
      // une colonne ne joue qu'un rôle : celui qu'elle avait passe à « aucune »
      for (const [k, identifiantColonne] of Object.entries(rolesEffectifs()))
        if (k !== role && identifiantSelectionne && identifiantColonne === identifiantSelectionne) roles[k] = "";
      roles[role] = identifiantSelectionne;
      etatFormulaires.meta = metaCourante();
      sauver();
      dessinerApercu();
      dessinerPanneau();
    }),
  );
  const bouton = $("roles-confirmer");
  if (bouton)
    bouton.addEventListener("click", () => {
      etatFormulaires.courant.conf.roles = rolesEffectifs();
      etatFormulaires.meta = metaCourante();
      sauver();
      dessinerPanneau();
      message("Colonnes confirmées (brouillon).", "ok");
    });
}
