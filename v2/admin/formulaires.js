/* =====================================================================
   Administration v2 — onglet « Formulaires »
   Reprise de l'administration v1 des formulaires, branchée sur le socle (Config, rôles).
   ===================================================================== */
(function () {
  /* =========================================================
   Widget d'administration des formulaires
   ---------------------------------------------------------
   Chaque formulaire est une ligne de la table « Formulaires » : Nom, Table (table des réponses),
   Brouillon (JSON, enregistré à chaque modification), Publie (JSON lu par le widget de saisie),
   Publie_le, Modifie_le. Les colonnes des questions sont créées dans la table des réponses dès
   l'ajout d'une question ; elles n'apparaissent dans les formulaires qu'à la publication.
   Format d'un bloc : { id, genre: "question" | "titre" | "info", section: "q" | "vd" | "va",
     colonne, texte, reglages: { libelle, aide, obligatoire, condition: { ref, op, valeurs }, affichage,
     court, min, max, couleur ("choix" | [{ cle, couleur }]), confidentiel, format, tableau: { table, lignes } } }
   ========================================================= */
  let TABLE_FORMULAIRES = "Formulaires"; // remplacé au démarrage par la clé « general » de Config
  const COLONNES_TABLE_FORMULAIRES = [
    { id: "Nom", type: "Text" },
    { id: "Table", type: "Text" },
    { id: "Brouillon", type: "Text" },
    { id: "Publie", type: "Text" },
    { id: "Publie_le", type: "DateTime:Europe/Paris" },
    { id: "Modifie_le", type: "DateTime:Europe/Paris" },
  ];
  const TABLES_EXCLUES =
    /^(Formulaires|Config|Parametres|Utilisateurs|Config_.*|Colonnes_point|Sections_point|Tri_point|Points_situation|GristDoc.*|_grist.*)$/;
  // Parties du formulaire : rôle q (formulaire de signalement, plusieurs parties possibles), vd / va (onglet Visas)
  const PARTIES_DEFAUT = [
    { id: "q", nom: "Signalement", role: "q" },
    { id: "vd", nom: "Visa départemental", role: "vd" },
    { id: "va", nom: "Visa académique", role: "va" },
  ];
  const ROLES = { q: "formulaire", vd: "onglet Visas, échelon départemental", va: "onglet Visas, échelon académique" };
  const TYPES_QUESTIONNAIRE = { etablissement: "Questionnaire établissement" };
  const COLONNES_COMMUNES = ["Etablissement", "Site", "Date_faits", "Qualification", "Description"];
  // Colonnes de service d'un questionnaire établissement (contrôlées dans le panneau « Formulaire »)
  const COLONNES_SERVICE_QUESTIONNAIRE = [
    {
      id: "Dossier",
      lib: "Dossier",
      aide: "Relie les mises à jour à leur signalement : sans elle, chaque enregistrement crée un nouveau dossier.",
      info: (tid) => ({ type: `Ref:${tid}`, isFormula: false, label: "Dossier" }),
    },
    {
      id: "Nature",
      lib: "Nature",
      aide: "« Nouveau signalement » ou « Mise à jour ».",
      info: () => ({
        type: "Choice",
        isFormula: false,
        widgetOptions: JSON.stringify({ choices: ["Nouveau signalement", "Mise à jour"] }),
      }),
    },
    {
      id: "Date",
      lib: "Date de saisie",
      aide: "Remplie par le serveur de Grist (formule d'initialisation NOW()).",
      info: () => ({ type: "DateTime:Europe/Paris", isFormula: false, formula: "NOW()", label: "Date de saisie" }),
    },
    {
      id: "Auteur",
      lib: "Auteur",
      aide: "Adresse de la personne qui enregistre (formule d'initialisation user.Email).",
      info: () => ({ type: "Text", isFormula: false, formula: "user.Email" }),
    },
    {
      id: "Commentaire",
      lib: "Commentaire",
      aide: "Résumé des changements d'une mise à jour.",
      info: () => ({ type: "Text", isFormula: false }),
    },
    {
      id: "Clos",
      lib: "Clos",
      aide: "Permet de clore un signalement terminé (menu « Autres actions » du formulaire).",
      info: () => ({ type: "Bool", isFormula: false, label: "Clos" }),
    },
    {
      id: "Site",
      lib: "Site / bâtiment",
      aide: "Version enseignement supérieur : site, campus ou bâtiment concerné.",
      info: () => ({ type: "Text", isFormula: false, label: "Site / bâtiment" }),
    },
  ];
  const RESERVES_TABLEAU = ["id", "manualSort", "Dossier", "Ligne_id", "Ordre", "Version", "Mouvement"];
  // colonnes d'historique d'une sous-table (une ligne par version et par ligne saisie), absentes de la table tid
  function actionsHistoriqueTableau(tid, colDos) {
    const roles = Object.fromEntries(
      Object.entries(rolesEffectifs())
        .filter(([, identifiantColonne]) => identifiantColonne)
        .map(([k, identifiantColonne]) => [k, { col: identifiantColonne }]),
    );
    const existantes = colonnesDe(tid) || {};
    return window.Socle.colonnesHistoriqueTableau(tid, courant.table, colDos || "Dossier", roles)
      .filter((colonne) => !existantes[colonne.id])
      .map((colonne) => [
        "AddColumn",
        tid,
        colonne.id,
        {
          type: colonne.type,
          isFormula: !!colonne.isFormula,
          formula: colonne.formula || "",
          ...(colonne.widgetOptions ? { widgetOptions: colonne.widgetOptions } : {}),
          label: colonne.id,
        },
      ]);
  }
  const COULEURS = {
    rouge: "#ce0500",
    orange: "#e4794a",
    jaune: "#f5c400",
    vert: "#18753c",
    bleu: "#000091",
    violet: "#6a1b9a",
    gris: "#777777",
  };
  const TYPES_QUESTIONS = [
    { cle: "court", nom: "Texte court", icone: "Aa", type: "Text", reglages: { court: true } },
    { cle: "long", nom: "Texte long", icone: "¶", type: "Text" },
    { cle: "nombre", nom: "Nombre", icone: "12", type: "Int" },
    { cle: "choix", nom: "Choix unique", icone: "◉", type: "Choice", choix: ["Option 1", "Option 2"] },
    { cle: "multi", nom: "Choix multiple", icone: "☑", type: "ChoiceList", choix: ["Option 1", "Option 2"] },
    { cle: "bool", nom: "Oui / Non", icone: "⇄", type: "Bool" },
    { cle: "date", nom: "Date", icone: "▤", type: "Date" },
    { cle: "pj", nom: "Pièces jointes (photos, documents)", icone: "📎", type: "Attachments" },
    { cle: "tableau", nom: "Tableau (lignes)", icone: "▦", type: "Text" },
    { cle: "etab", nom: "Donnée de la fiche établissement", icone: "É", etab: true },
    { cle: "titre", nom: "Titre de section", icone: "H", decor: "titre" },
    { cle: "info", nom: "Texte d'information", icone: "i", decor: "info" },
  ];

  /* ---------- outils ---------- */
  const { esc, $ } = Outils;
  const normaliser = (texte) =>
    String(texte ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[’']/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const typeBase = (typeColonne) => (typeColonne || "Any").split(":")[0];
  const nouvelId = () => "b" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const copie = (objet) => JSON.parse(JSON.stringify(objet));
  const maintenant = () => Date.now() / 1000;
  function identifiant(libelle, existants) {
    let base =
      String(libelle || "Question")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^A-Za-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 40) || "Question";
    if (/^\d/.test(base)) base = "Q_" + base;
    base = base.charAt(0).toUpperCase() + base.slice(1);
    let id = base,
      numero = 2;
    const pris = new Set([...existants].map((existant) => existant.toLowerCase()));
    while (pris.has(id.toLowerCase())) id = `${base}_${numero++}`;
    return id;
  }
  const lisible = (valeur) => valeur !== undefined && !(Array.isArray(valeur) && valeur[0] === "C");
  function estVideValeur(valeur) {
    if (valeur == null || valeur === "" || valeur === false) return true;
    if (Array.isArray(valeur)) return valeur[0] === "L" ? valeur.length <= 1 : !valeur.length;
    if (typeof valeur === "string") return !valeur.trim() || valeur.trim() === "[]";
    return false;
  }

  /* ---------- état ---------- */
  let formulaires = []; // lignes de la table Formulaires
  let courant = null; // { id, nom, table, conf: { blocs }, publie }
  let meta = {}; // colonnes de la table du formulaire courant
  let metaTables = null; // [tables, colonnes] de Grist
  let tables = [];
  let choisi = null; // id du bloc sélectionné
  let modeTest = false;
  let simulations = {}; // valeurs simulées des colonnes hors formulaire (mode test)
  let accesOk = true;

  /* ---------- lecture de Grist ---------- */
  async function lireMeta() {
    metaTables = await Promise.all([Donnees.lire("_grist_Tables"), Donnees.lire("_grist_Tables_column")]);
    const [tablesGrist] = metaTables;
    tables = tablesGrist.tableId.filter(
      (identifiantTable) =>
        identifiantTable && !TABLES_EXCLUES.test(identifiantTable) && !identifiantTable.startsWith("_grist"),
    );
  }
  function colonnesDe(tid) {
    const [tablesGrist, colonnesGrist] = metaTables;
    const ref = tablesGrist.id[tablesGrist.tableId.indexOf(tid)];
    if (ref == null) return {};
    const res = {};
    for (let i = 0; i < colonnesGrist.id.length; i++) {
      if (colonnesGrist.parentId[i] !== ref) continue;
      const colId = colonnesGrist.colId[i];
      if (colId === "manualSort" || colId.startsWith("gristHelper")) continue;
      let opts = {};
      try {
        opts = JSON.parse(colonnesGrist.widgetOptions[i] || "{}");
      } catch (_) {}
      res[colId] = {
        colId,
        libelle: colonnesGrist.label[i] || colId,
        type: colonnesGrist.type[i],
        opts,
        description: (colonnesGrist.description && colonnesGrist.description[i]) || "",
        formule: !!(colonnesGrist.isFormula && colonnesGrist.isFormula[i] && colonnesGrist.formula[i]),
        texteFormule: (colonnesGrist.isFormula && colonnesGrist.isFormula[i] && colonnesGrist.formula[i]) || "",
        pos: colonnesGrist.parentPos ? colonnesGrist.parentPos[i] : i,
        ref: colonnesGrist.id[i],
      };
      // pièces jointes calculées depuis une colonne d'envoi (formulePiecesJointes) : question ordinaire pour l'administration
      const correspondancePj =
        /^Attachments/.test(colonnesGrist.type[i]) &&
        res[colId].formule &&
        /\(\$(\w+) or ""\)\.split\(\)/.exec(res[colId].texteFormule);
      if (correspondancePj) {
        res[colId].formule = false;
        res[colId].pjEnvoi = correspondancePj[1];
      }
    }
    return res;
  }
  async function lireFormulaires() {
    try {
      const donneesFormulaires = await Donnees.lire(TABLE_FORMULAIRES);
      formulaires = donneesFormulaires.id.map((id, i) => ({
        id,
        nom: donneesFormulaires.Nom ? String(donneesFormulaires.Nom[i] ?? "") : `Formulaire ${id}`,
        table: donneesFormulaires.Table ? String(donneesFormulaires.Table[i] ?? "") : "",
        brouillon: donneesFormulaires.Brouillon ? donneesFormulaires.Brouillon[i] : "",
        publie: donneesFormulaires.Publie ? donneesFormulaires.Publie[i] : "",
        publieLe: donneesFormulaires.Publie_le ? donneesFormulaires.Publie_le[i] : null,
        type: donneesFormulaires.Type ? String(donneesFormulaires.Type[i] || "etablissement") : "etablissement",
        widget: donneesFormulaires.Widget ? String(donneesFormulaires.Widget[i] || "") : "",
      }));
      return true;
    } catch (_) {
      formulaires = [];
      return false;
    }
  }
  async function creerTableFormulaires() {
    await Donnees.ecrire([
      [
        "AddTable",
        TABLE_FORMULAIRES,
        COLONNES_TABLE_FORMULAIRES.map((colonne) => ({ id: colonne.id, type: colonne.type, isFormula: false })),
      ],
    ]);
  }
  const actions = (actionsGrist) => Donnees.ecrire(actionsGrist);

  /* ---------- reprise des repères écrits dans les descriptions (formulaires existants) ---------- */
  // Lecture et évaluation des conditions : règles communes avec le widget de saisie (commun/metier/formulaire.js)
  const { sansGuillemets } = Socle;
  function lireReperes(txt) {
    txt = String(txt || "").trim();
    const reperes = {};
    if (txt.startsWith("*")) reperes.obligatoire = true;
    // condition « [si … ] » : forme enregistrée dans le brouillon { ref, op, valeurs }
    const condition = Socle.lireConditionRepere(txt);
    if (condition) reperes.condition = { ref: condition.ref, op: condition.op, valeurs: condition.valeurs || [] };
    let correspondance;
    if (/\[liste\]/i.test(txt)) reperes.affichage = "liste";
    if (/\[boutons\]/i.test(txt)) reperes.affichage = "boutons";
    if (/\[case\]/i.test(txt)) reperes.affichage = "case";
    if (/\[\s*(positif|positive)\s*\]/i.test(txt)) reperes.min = 0;
    if ((correspondance = txt.match(/\[\s*min(?:imum)?\s*(-?[\d.,]+)\s*\]/i)))
      reperes.min = parseFloat(correspondance[1].replace(",", "."));
    if ((correspondance = txt.match(/\[\s*max(?:imum)?\s*(-?[\d.,]+)\s*\]/i)))
      reperes.max = parseFloat(correspondance[1].replace(",", "."));
    if (/\[\s*confidentiel(le)?\s*\]/i.test(txt)) reperes.confidentiel = true;
    if ((correspondance = txt.match(/\[\s*tableau\s+([^\]\s]+)(?:\s+lignes?\s*[=:]\s*([^\]]+?))?\s*\]/i)))
      reperes.tableau = {
        table: correspondance[1],
        lignes: correspondance[2] ? sansGuillemets(correspondance[2]) : null,
      };
    if ((correspondance = txt.match(/\[\s*couleurs?\b([^\]]*)\]/i))) {
      const regles = correspondance[1]
        .split(/\s*;\s*|\s*,\s*(?!\d+\s*[=:])/)
        .map((morceau) => {
          const k = morceau.lastIndexOf("=");
          return k > 0 ? { cle: morceau.slice(0, k).trim(), couleur: morceau.slice(k + 1).trim() } : null;
        })
        .filter(Boolean);
      reperes.couleur = regles.length ? regles : "choix";
    }
    if ((correspondance = txt.match(/\[\s*ordre\s*(\d+)\s*\]/i))) reperes.ordre = +correspondance[1];
    if (/\[\s*(court|une\s+ligne)\s*\]/i.test(txt)) reperes.court = true;
    if (/\[\s*auto(matique)?\s*\]/i.test(txt)) reperes.auto = true;
    if (/\[\s*(masqu[ée]e?|cach[ée]e?|invisible)\s*\]/i.test(txt)) reperes.masque = true;
    reperes.aide = txt
      .replace(/^\*\s*/, "")
      .replace(/\[[^\]]*\]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    return reperes;
  }

  /* ---------- conditions ---------- */
  const evaluerCondition = (valeur, condition) => Socle.evaluerCondition(valeur, condition);

  function colonneDeRef(ref) {
    if (!ref) return null;
    if (meta[ref]) return meta[ref];
    const referenceNormalisee = normaliser(ref);
    return (
      Object.values(meta).find(
        (colonne) =>
          normaliser(colonne.colId) === referenceNormalisee || normaliser(colonne.libelle) === referenceNormalisee,
      ) || null
    );
  }
  const LIBELLES_OPERATEURS = {
    "=": "=",
    "!=": "≠",
    ">": ">",
    ">=": "≥",
    "<": "<",
    "<=": "≤",
    rempli: "est renseigné",
    vide: "est vide",
  };
  function texteCondition(condition) {
    const col = colonneDeRef(condition.ref),
      nom = col ? libelleQuestion(col.colId) || col.libelle : condition.ref;
    if (condition.op === "rempli" || condition.op === "vide") return `${nom} ${LIBELLES_OPERATEURS[condition.op]}`;
    return `${nom} ${LIBELLES_OPERATEURS[condition.op] || condition.op} ${(condition.valeurs || []).join(" ou ")}`;
  }

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
  let metaColonnesReelles = {}; // colonnes réelles de la table du formulaire courant
  const colonnesRenseignees = new Map(); // table -> colonnes renseignées sur au moins une ligne
  const celluleRemplie = (valeur) =>
    valeur != null &&
    valeur !== "" &&
    valeur !== 0 &&
    valeur !== false &&
    !(Array.isArray(valeur) && (valeur[0] === "L" ? valeur.length <= 1 : !valeur.length));
  // Reconnaissance d'après les noms : mêmes règles que le widget de saisie (colonne remplie préférée, colonnes des
  // questions jamais prises, rôles imposés conservés)
  function reconnaitreRoles(brut, tid, remplies, exclues, imposes) {
    const res = { ...(imposes || {}) },
      pris = new Set(Object.values(res).filter(Boolean));
    const cols = Object.values(brut || {}).filter(
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
      if (role.id in res) continue;
      const colonne = (brut || {})[role.id];
      if (colonne && !pris.has(role.id) && role.ok(colonne, tid)) {
        res[role.id] = role.id;
        pris.add(role.id);
        exacts.add(role.id);
      }
    }
    for (const role of ROLES_COLONNES) {
      if (role.id in res && !exacts.has(role.id)) continue;
      if (exacts.has(role.id) && (!remplies || !remplies.size || remplie(role.id))) continue;
      let choix = null;
      for (const motif of role.motifs) {
        const cands = cols.filter(
          (colonne) =>
            !pris.has(colonne.colId) &&
            !(exclues && exclues.has(colonne.colId)) &&
            role.ok(colonne, tid) &&
            noms(colonne).some((nom) => motif.test(nom)),
        );
        if (!cands.length) continue;
        if (role.id === "Date")
          cands.sort(
            (candidatA, candidatB) =>
              (/NOW\(\)/.test(candidatB.texteFormule) ? 1 : 0) - (/NOW\(\)/.test(candidatA.texteFormule) ? 1 : 0),
          );
        const pleine = cands.find((candidat) => remplie(candidat.colId));
        if (exacts.has(role.id)) {
          if (pleine) {
            choix = pleine;
            break;
          }
          continue;
        }
        choix = pleine || cands[0];
        break;
      }
      if (choix) {
        if (res[role.id]) pris.delete(res[role.id]);
        res[role.id] = choix.colId;
        pris.add(choix.colId);
      }
    }
    return res;
  }
  const colonnesQuestions = () =>
    new Set(
      blocs()
        .filter((bloc) => bloc.genre === "question")
        .map((bloc) => bloc.colonne),
    );
  // Rôles réglés dans ce formulaire (une colonne disparue depuis n'est plus retenue)
  function rolesReglesValides() {
    const rolesConf = (courant && courant.conf.roles) || {},
      res = {};
    for (const [role, identifiantColonne] of Object.entries(rolesConf))
      if (ROLE_PAR_ID[role] && (identifiantColonne === "" || metaColonnesReelles[identifiantColonne]))
        res[role] = identifiantColonne;
    return res;
  }
  // Association effective : rôles réglés, sinon colonne proposée, sinon "" (aucune)
  function rolesSocle() {
    const res = {};
    if (!courant || courant.table !== socleGeneral.reponses) return res;
    const rolesReponses = (socleConfig && socleConfig.valeurs.roles && socleConfig.valeurs.roles.reponses) || {};
    for (const [k, identifiantColonne] of Object.entries(rolesReponses)) {
      const id = k === "Cree_le" ? "Date" : k;
      if (ROLE_PAR_ID[id] && metaColonnesReelles[identifiantColonne]) res[id] = identifiantColonne;
    }
    return res;
  }
  function rolesEffectifs() {
    if (!courant || courant.type !== "etablissement") return {};
    const rolesReconnus = reconnaitreRoles(
      metaColonnesReelles,
      courant.table,
      colonnesRenseignees.get(courant.table),
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
  function colonneEtablissementDe(tid) {
    if (courant && tid === courant.table && courant.type === "etablissement")
      return rolesEffectifs().Etablissement || null;
    return reconnaitreRoles(colonnesDe(tid), tid, colonnesRenseignees.get(tid)).Etablissement || null;
  }
  const colonneEtablissement = () => (meta.Etablissement && meta.Etablissement.colId) || "Etablissement";
  function metaCourante() {
    metaColonnesReelles = colonnesDe(courant.table);
    const res = { ...metaColonnesReelles };
    if (courant.type !== "etablissement") return res;
    const roles = rolesEffectifs(),
      regles = rolesReglesValides();
    for (const [role, identifiantColonne] of Object.entries(roles)) {
      if (identifiantColonne === role || (!identifiantColonne && !(role in regles))) continue; // même identifiant, ou rien de mieux que la colonne de ce nom
      delete res[role];
      if (identifiantColonne && metaColonnesReelles[identifiantColonne])
        Object.defineProperty(res, role, {
          value: metaColonnesReelles[identifiantColonne],
          enumerable: false,
          configurable: true,
          writable: true,
        });
    }
    return res;
  }
  // Colonnes renseignées de la table (lecture unique à l'ouverture du formulaire) : la proposition préfère une colonne
  // remplie à une colonne vide du même nom
  async function lireRemplissage(tid) {
    if (!tid || colonnesRenseignees.has(tid)) return;
    try {
      const donnees = await Donnees.lire(tid);
      colonnesRenseignees.set(
        tid,
        new Set(
          Object.keys(donnees).filter(
            (identifiantColonne) =>
              identifiantColonne !== "id" && (donnees[identifiantColonne] || []).some(celluleRemplie),
          ),
        ),
      );
    } catch (_) {
      colonnesRenseignees.set(tid, new Set());
    }
    if (courant && courant.table === tid) {
      const avant = JSON.stringify(Object.keys(meta).concat(Object.values(rolesEffectifs())));
      meta = metaCourante();
      if (JSON.stringify(Object.keys(meta).concat(Object.values(rolesEffectifs()))) !== avant) {
        dessinerApercu();
        dessinerPanneau();
        majEtat();
      }
    }
  }
  function groupeColonnesHtml() {
    if (courant.type !== "etablissement") return "";
    const roles = rolesEffectifs(),
      tableEtablissement = tableEtablissements(),
      questions = colonnesQuestions();
    const cols = Object.values(metaColonnesReelles)
      .filter((colonne) => colonne.colId !== "id")
      .sort((colonneA, colonneB) => colonneA.pos - colonneB.pos);
    const service = new Set(COLONNES_SERVICE_QUESTIONNAIRE.map((colonne) => colonne.id));
    const manquants = ORDRE_ROLES.filter((role) => ROLE_PAR_ID[role].requis && !roles[role]);
    const proposes = ORDRE_ROLES.filter((role) => roles[role] && !roleRegle(role));
    const ligne = (role) => {
      const definitionRole = ROLE_PAR_ID[role],
        identifiantChoisi = roles[role];
      const compat = cols.filter(
        (colonne) =>
          (definitionRole.ok(colonne, courant.table) && !questions.has(colonne.colId)) ||
          colonne.colId === identifiantChoisi,
      );
      const autreRole = (id) => ORDRE_ROLES.find((k) => k !== role && roles[k] === id);
      const opts =
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
        !identifiantChoisi && service.has(role) && !metaColonnesReelles[role]
          ? ` <button type="button" class="ajout-lien" data-ajout-col="${role}">Créer la colonne</button>`
          : "";
      return `<li><label for="role-${role}" style="display:block;font-weight:600">${esc(definitionRole.lib)} ${etat}${ajout}</label>
      <select id="role-${role}" data-role-col="${role}" style="margin:2px 0 0;width:100%">${opts}</select><small>${esc(definitionRole.aide)}</small></li>`;
    };
    return `<div class="groupe"><div class="t">Colonnes de la table des réponses</div>
    <p class="note" style="margin:0 0 6px">Colonne de la table <b>${esc(courant.table)}</b> utilisée pour chaque rôle, par ce formulaire et le widget de saisie.
      ${proposes.length ? `Les colonnes marquées « proposée » ont été reconnues d'après leur nom : vérifiez-les ; elles seront confirmées à la publication.` : ""}</p>
    ${manquants.length ? `<p class="avert" style="margin:0 0 6px">À associer avant de publier : ${manquants.map((role) => esc(ROLE_PAR_ID[role].lib)).join(", ")}.</p>` : ""}
    ${proposes.length ? `<button type="button" class="secondaire petit" id="roles-confirmer" style="margin-bottom:6px">Confirmer les colonnes proposées</button>` : ""}
    <ul class="liste-cols">${ORDRE_ROLES.map(ligne).join("")}</ul>
    <p class="note" style="margin:6px 0 0">Référentiel des établissements : table <b>${esc(tableEtablissement || "?")}</b>.</p></div>`;
  }
  function lierRoles(panneau) {
    panneau.querySelectorAll("[data-role-col]").forEach((sel) =>
      sel.addEventListener("change", () => {
        const role = sel.dataset.roleCol,
          identifiantSelectionne = sel.value,
          roles = (courant.conf.roles = { ...(courant.conf.roles || {}) });
        // une colonne ne joue qu'un rôle : celui qu'elle avait passe à « aucune »
        for (const [k, identifiantColonne] of Object.entries(rolesEffectifs()))
          if (k !== role && identifiantSelectionne && identifiantColonne === identifiantSelectionne) roles[k] = "";
        roles[role] = identifiantSelectionne;
        meta = metaCourante();
        sauver();
        dessinerApercu();
        dessinerPanneau();
      }),
    );
    const bouton = $("roles-confirmer");
    if (bouton)
      bouton.addEventListener("click", () => {
        courant.conf.roles = rolesEffectifs();
        meta = metaCourante();
        sauver();
        dessinerPanneau();
        message("Colonnes confirmées (brouillon).", "ok");
      });
  }

  /* ---------- formulaire courant ---------- */
  const blocs = () => (courant ? courant.conf.blocs : []);
  const blocDe = (id) => blocs().find((bloc) => bloc.id === id) || null;
  function libelleQuestion(colId) {
    const bloc = blocs().find((candidat) => candidat.genre === "question" && candidat.colonne === colId);
    return (bloc && bloc.reglages && bloc.reglages.libelle) || (meta[colId] && meta[colId].libelle) || colId;
  }
  function charger(formulaire) {
    let conf = null;
    for (const src of [formulaire.brouillon, formulaire.publie]) {
      if (!conf && typeof src === "string" && src.trim()) {
        try {
          conf = JSON.parse(src);
        } catch (_) {}
      }
    }
    if (!conf || !Array.isArray(conf.blocs)) conf = { blocs: [] };
    courant = {
      id: formulaire.id,
      nom: formulaire.nom,
      table: formulaire.table,
      type: formulaire.type || "etablissement",
      conf,
      publie: formulaire.publie || "",
      publieLe: formulaire.publieLe,
      widget: formulaire.widget || "",
    };
    meta = metaCourante();
    lireRemplissage(formulaire.table);
    choisi = null;
    simulations = {};
    testLignes = {};
    modeApercu = "nouveau";
    etablissementsTest = null;
    etablissementTest = null;
    const ids = new Set(parties().map((partie) => partie.id)),
      premiere = parties().find((partie) => partie.role === "q").id;
    conf.blocs.forEach((bloc) => {
      if (!ids.has(bloc.section || "q")) bloc.section = premiere;
    });
  }
  let minuterie = null,
    enregistrementEnCours = Promise.resolve();
  function sauver() {
    // brouillon enregistré automatiquement, 400 ms après la dernière modification
    majEtat();
    clearTimeout(minuterie);
    minuterie = setTimeout(() => {
      const json = JSON.stringify(courant.conf),
        id = courant.id;
      enregistrementEnCours = enregistrementEnCours
        .then(() => actions([["UpdateRecord", TABLE_FORMULAIRES, id, { Brouillon: json, Modifie_le: maintenant() }]]))
        .then(() => {
          const formulaire = formulaires.find((candidat) => candidat.id === id);
          if (formulaire) formulaire.brouillon = json;
        })
        .catch((erreur) => message(`Brouillon non enregistré : ${erreur.message || erreur}`, "err"));
    }, 400);
  }
  function parties() {
    if (!courant) return [];
    if (!Array.isArray(courant.conf.parties) || !courant.conf.parties.length)
      courant.conf.parties = copie(PARTIES_DEFAUT);
    const listeParties = courant.conf.parties;
    return [
      ...listeParties.filter((partie) => partie.role === "q"),
      ...listeParties.filter((partie) => partie.role === "vd"),
      ...listeParties.filter((partie) => partie.role === "va"),
    ];
  }
  const partieDe = (id) => parties().find((partie) => partie.id === id) || parties()[0];
  const communsActifs = () => courant && courant.type === "etablissement" && !!meta.Etablissement;
  function differences() {
    if (!courant) return 0;
    let pub = [],
      pubParties = PARTIES_DEFAUT,
      pubDesc = null,
      pubSaisie = null,
      pubRoles = null;
    try {
      if (courant.publie) {
        const confPubliee = JSON.parse(courant.publie);
        pub = confPubliee.blocs || [];
        pubDesc = confPubliee.description || null;
        pubSaisie = confPubliee.saisie || null;
        pubRoles = confPubliee.roles || null;
        if (Array.isArray(confPubliee.parties) && confPubliee.parties.length) pubParties = confPubliee.parties;
      }
    } catch (_) {}
    const ecartParties =
      (JSON.stringify(pubParties) !== JSON.stringify(courant.conf.parties || PARTIES_DEFAUT) ? 1 : 0) +
      (JSON.stringify(pubDesc) !== JSON.stringify(courant.conf.description || null) ? 1 : 0) +
      (JSON.stringify(pubSaisie) !== JSON.stringify(courant.conf.saisie || null) ? 1 : 0) +
      (courant.type === "etablissement" && JSON.stringify(pubRoles) !== JSON.stringify(rolesEffectifs()) ? 1 : 0);
    const publiesParId = new Map(pub.map((bloc) => [bloc.id, JSON.stringify(bloc)])),
      blocsCourants = blocs();
    let ecartsBlocs = Math.abs(pub.length - blocsCourants.length);
    blocsCourants.forEach((bloc, i) => {
      if (publiesParId.get(bloc.id) !== JSON.stringify(bloc) || (pub[i] && pub[i].id !== bloc.id)) ecartsBlocs++;
    });
    return ecartsBlocs + ecartParties;
  }
  function majEtat() {
    const indicateurEtat = $("etat-publi");
    if (!courant) {
      indicateurEtat.textContent = "";
      indicateurEtat.className = "etat-publi";
      return;
    }
    const nombreEcarts = differences();
    if (!courant.publie) {
      indicateurEtat.textContent = "Jamais publié";
      indicateurEtat.className = "etat-publi brouillon";
    } else if (nombreEcarts) {
      indicateurEtat.textContent = `Brouillon · ${nombreEcarts} modification${nombreEcarts > 1 ? "s" : ""} non publiée${nombreEcarts > 1 ? "s" : ""}`;
      indicateurEtat.className = "etat-publi brouillon";
    } else {
      indicateurEtat.textContent = "Publié, à jour";
      indicateurEtat.className = "etat-publi a-jour";
    }
    $("btn-publier").disabled = !!courant.publie && !nombreEcarts;
    const nbq = blocs().filter((bloc) => bloc.genre === "question").length;
    $("infos").innerHTML =
      `${esc(TYPES_QUESTIONNAIRE[courant.type] || "Questionnaire")} · table <b>${esc(courant.table)}</b> · ${nbq} question${nbq > 1 ? "s" : ""}`;
  }
  let minuterieMessage = null;
  function message(texte, type) {
    let bandeau = $("msg-global");
    if (!bandeau) {
      bandeau = document.createElement("div");
      bandeau.id = "msg-global";
      bandeau.className = "bandeau bandeau-msg";
      bandeau.setAttribute("role", "status");
      $("apercu").prepend(bandeau);
    }
    bandeau.textContent = texte;
    bandeau.style.background = type === "ok" ? "#e6f4ea" : "";
    bandeau.style.color = type === "ok" ? "var(--ok)" : "";
    clearTimeout(minuterieMessage);
    if (type === "ok") minuterieMessage = setTimeout(() => bandeau.remove(), 4000);
  }

  /* =========================================================
   Aperçu
   ========================================================= */
  function champHtml(bloc) {
    const reglages = bloc.reglages || {},
      colonne = meta[bloc.colonne];
    if (!colonne)
      return `<p class="avert">La colonne « ${esc(bloc.colonne)} » n'existe plus dans la table ${esc(courant.table)}.</p>`;
    const id = `ap-${bloc.colonne}`,
      typeColonne = typeBase(colonne.type),
      choixPossibles = colonne.opts.choices || [],
      couleurs = colonne.opts.choiceOptions || {};
    const lib = esc(reglages.libelle || colonne.libelle);
    const titre =
      `${lib}${reglages.obligatoire ? ' <span class="req">*</span>' : ""}${reglages.condition && reglages.condition.ref ? `<span class="pastille-cond">si ${esc(texteCondition(reglages.condition))}</span>` : ""}` +
      `${reglages.confidentiel ? '<span class="pastille-autre">confidentiel</span>' : ""}`;
    const aide = reglages.aide ? `<span class="aide">${esc(reglages.aide)}</span>` : "";
    const style = (valeur) => {
      const couleur = couleurs[valeur] || {};
      return couleur.fillColor ? `--c:${couleur.textColor || "#161616"};--c-bg:${couleur.fillColor}` : "";
    };
    const enBoutons =
      (typeColonne === "Choice" &&
        choixPossibles.length &&
        reglages.affichage !== "liste" &&
        (reglages.affichage === "boutons" || choixPossibles.length <= 5)) ||
      (typeColonne === "Bool" && reglages.affichage !== "case");
    const dis = modeTest ? "" : ' tabindex="-1"';
    if (colonne.formule) {
      const src = sourceColonneEtablissement(colonne),
        valeurFormule = modeTest ? valeurFormuleTest(colonne) : undefined;
      const contenu = modeTest
        ? valeurFormule === undefined
          ? "Valeur calculée par Grist à l'enregistrement"
          : valeurFormule == null || valeurFormule === ""
            ? "—"
            : valeurLisible(colonne, valeurFormule)
        : src
          ? `Repris de la fiche établissement : ${libelleColonneEtablissement(src)}`
          : `Calculé par Grist : ${colonne.texteFormule}`;
      return `<div class="champ"><label>${titre}${aide}</label><div class="lecture" data-formule="${esc(bloc.colonne)}">${esc(contenu)}</div></div>`;
    }
    if (reglages.tableau && reglages.tableau.table && modeTest)
      return `<div class="champ"><label>${titre}${aide}</label><div class="tableau-test" data-tab="${esc(bloc.colonne)}">${tableauTestHtml(bloc)}</div></div>`;
    if (reglages.tableau && reglages.tableau.table) {
      const champsTableau = sousColonnes(reglages.tableau.table).filter((champ) => !champ.r.masque);
      return (
        `<div class="champ"><label>${titre}${aide}</label><div class="tableau-apercu"><strong>Une ligne par élément</strong> · table « ${esc(reglages.tableau.table)} »` +
        `<div class="cols">${champsTableau.map((champ) => `<span>${esc(champ.libelle)}</span>`).join("") || "<em>aucune colonne : ajoutez-en dans le panneau</em>"}</div>` +
        `<button type="button" class="secondaire petit"${dis}>+ Ajouter</button>${reglages.tableau.lignes ? ` <small class="note">Nombre de lignes suivant « ${esc(libelleQuestion(reglages.tableau.lignes))} »</small>` : ""}</div></div>`
      );
    }
    if (enBoutons) {
      const opts =
        typeColonne === "Bool"
          ? [
              ["true", "Oui"],
              ["false", "Non"],
            ]
          : choixPossibles.map((choix) => [choix, choix]);
      return `<fieldset class="champ"><legend>${titre}${aide}</legend><div class="choix-groupe${typeColonne === "Bool" ? " choix-oui-non" : ""}">${opts
        .map(
          ([valeur, libelle]) =>
            `<label class="choix" style="${typeColonne === "Bool" ? "" : style(valeur)}"><input type="radio" name="${id}" value="${esc(valeur)}"${dis}><span>${esc(libelle)}</span></label>`,
        )
        .join("")}</div></fieldset>`;
    }
    if (typeColonne === "Bool")
      return `<div class="champ"><label class="case"><input type="checkbox" name="${id}"${dis}> ${lib}</label>${aide}</div>`;
    if (typeColonne === "Choice")
      return `<div class="champ"><label for="${id}">${titre}${aide}</label><select id="${id}" name="${id}"${dis}><option value="">Choisir…</option>${choixPossibles.map((choix) => `<option>${esc(choix)}</option>`).join("")}</select></div>`;
    if (typeColonne === "ChoiceList")
      return `<fieldset class="champ"><legend>${titre}${aide}</legend><div class="coches">${choixPossibles.map((choix) => `<label><input type="checkbox" name="${id}" value="${esc(choix)}"${dis}> ${esc(choix)}</label>`).join("")}</div></fieldset>`;
    if (typeColonne === "Numeric" || typeColonne === "Int")
      return `<div class="champ"><label for="${id}">${titre}${aide}</label><input type="number" id="${id}" name="${id}"${reglages.min != null && reglages.min !== "" ? ` min="${esc(reglages.min)}"` : ""}${dis}></div>`;
    if (typeColonne === "Date")
      return `<div class="champ"><label for="${id}">${titre}${aide}</label><input type="date" id="${id}" name="${id}"${dis}></div>`;
    if (typeColonne === "DateTime")
      return `<div class="champ"><label for="${id}">${titre}${aide}</label><input type="datetime-local" id="${id}" name="${id}"${dis}></div>`;
    if (typeColonne === "Ref" || typeColonne === "RefList")
      return `<div class="champ"><label for="${id}">${titre}${aide}</label><select id="${id}" name="${id}"${dis}><option>Choisir…</option></select></div>`;
    if (typeColonne === "Attachments")
      return `<div class="champ"><label>${titre}${aide}</label><div class="pj-apercu" style="display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border:1px dashed var(--bleu,#000091);border-radius:6px;color:var(--bleu,#000091);font-weight:600">📎 Ajouter des photos ou des fichiers</div>
    <div class="note" style="margin-top:4px">Photos de la galerie ou de l'appareil photo, PDF, documents bureautiques ; envoyés dans les pièces jointes du document Grist.</div></div>`;
    if (reglages.court)
      return `<div class="champ"><label for="${id}">${titre}${aide}</label><input type="text" id="${id}" name="${id}"${dis}></div>`;
    return `<div class="champ"><label for="${id}">${titre}${aide}</label><textarea id="${id}" name="${id}" style="min-height:70px"${dis}></textarea></div>`;
  }
  function typeAffiche(bloc) {
    if (bloc.genre === "titre") return "Titre";
    if (bloc.genre === "info") return "Information";
    const colonne = meta[bloc.colonne],
      reglages = bloc.reglages || {};
    if (!colonne) return "Colonne absente";
    if (colonne.formule) return sourceColonneEtablissement(colonne) ? "Donnée établissement" : "Formule";
    if (reglages.tableau) return "Tableau";
    return (
      {
        Text: reglages.court ? "Texte court" : "Texte long",
        Int: "Nombre entier",
        Numeric: "Nombre décimal",
        Choice: "Choix unique",
        ChoiceList: "Choix multiple",
        Bool: "Oui / Non",
        Date: "Date",
        DateTime: "Date et heure",
        Ref: "Référence",
        RefList: "Références",
        Attachments: "Pièces jointes",
      }[typeBase(colonne.type)] || typeBase(colonne.type)
    );
  }
  function blocHtml(bloc) {
    const contenu =
      bloc.genre === "titre"
        ? `<h3 class="titre-section">${esc(bloc.texte || "Titre de section")}</h3>`
        : bloc.genre === "info"
          ? `<p class="info-formulaire">${esc(bloc.texte || "Texte d'information").replace(/\n/g, "<br>")}</p>`
          : champHtml(bloc);
    const nom = bloc.genre === "question" ? libelleQuestion(bloc.colonne) : bloc.texte || typeAffiche(bloc);
    return (
      `<div class="bloc${bloc.id === choisi && !modeTest ? " choisi" : ""}" data-bloc="${bloc.id}" draggable="${!modeTest}" tabindex="${modeTest ? -1 : 0}" aria-label="${esc(typeAffiche(bloc))} : ${esc(nom)}">` +
      `<span class="etiq-type">${esc(typeAffiche(bloc))}</span><span class="poignee" aria-hidden="true">⋮⋮</span>` +
      (modeTest
        ? ""
        : `<span class="outils"><button type="button" data-act="haut" title="Monter" aria-label="Monter">↑</button><button type="button" data-act="bas" title="Descendre" aria-label="Descendre">↓</button>` +
          `<button type="button" data-act="dupliquer" title="Dupliquer" aria-label="Dupliquer">⧉</button><button type="button" data-act="retirer" title="Retirer du formulaire" aria-label="Retirer du formulaire">✕</button></span>`) +
      `${contenu}</div>`
    );
  }
  const insertion = (section, index) =>
    modeTest
      ? ""
      : `<div class="insertion" data-section="${section}" data-index="${index}"><button type="button" data-ajout>+ Ajouter une question</button></div>`;
  function communHtml(colId) {
    const colonne = meta[colId];
    if (!colonne) return "";
    const dis = modeTest ? "" : ' tabindex="-1"';
    let html = "";
    const rechercheTest = (lib) =>
      `<label for="test-etab">${lib}<span class="aide">Test : recherche dans la table ${esc(tableEtablissements() || "des établissements")}. Les données de la fiche et la description suivent l'établissement choisi.</span></label>` +
      `<input type="text" id="test-etab" list="test-etab-liste" autocomplete="off" placeholder="${etablissementsTest ? "Nom ou UAI" : "Chargement du référentiel…"}" value="${esc(etablissementTest ? libelleEtablissementTest(etablissementTest) : "")}"><datalist id="test-etab-liste"></datalist>`;
    if (colId === "Etablissement" && majApercu())
      html =
        `<div class="champ"><div class="resume-etab"><span id="test-resume-etab">${resumeEtablissementTestHtml()}</span><span class="faux-lien">Voir la fiche</span></div></div>` +
        (modeTest ? `<div class="champ">${rechercheTest("Établissement du dossier (pour le test)")}</div>` : "");
    else if (colId === "Etablissement" && modeTest)
      html = `<div class="champ">${rechercheTest('Nom ou UAI <span class="req">*</span>')}<dl class="identite" id="test-fiche"${etablissementTest ? "" : " hidden"}>${ficheTestHtml()}</dl></div>`;
    else if (colId === "Etablissement")
      html = `<div class="champ"><label>Nom ou UAI <span class="req">*</span><span class="aide">Recherche par nom ou UAI dans la table ${esc(tableEtablissements() || "des établissements")}, puis complétion automatique (type, commune, académie, département) ; création dans le référentiel si besoin.</span></label><input type="text" placeholder="Nom ou UAI"${dis} disabled></div>`;
    else if (colId === "Site")
      html = `<div class="champ"><label for="test-site">${esc(colonne.libelle && colonne.libelle !== "Site" ? colonne.libelle : "Site / bâtiment")}<span class="aide">Facultatif : campus, site ou bâtiment concerné.</span></label><input type="text" id="test-site"${dis} ${modeTest ? "" : "disabled"}></div>`;
    else if (colId === "Date_faits") {
      const saisie = saisieEffective();
      html =
        `<div class="champ"><label>${esc(colonne.libelle)} <span class="req">*</span><span class="aide">Aujourd'hui par défaut.${saisie.faitsFuturs ? " Peut être à venir (fermeture annoncée…)." : " Jamais postérieure à aujourd'hui."}</span></label><input type="date"${dis}>` +
        (saisie.plusieursJours && typeBase(colonne.type) === "Date"
          ? `<label class="case" style="margin-top:6px"><input type="checkbox"${dis} ${modeTest ? "" : "disabled"}> Les faits s'étendent sur plusieurs jours (un signalement par jour)</label>`
          : "") +
        `</div>`;
    } else if (colId === "Qualification") {
      const choixPossibles = colonne.opts.choices || [],
        optionsChoix = colonne.opts.choiceOptions || {};
      html = `<fieldset class="champ"><legend>${esc(colonne.libelle)} <span class="req">*</span></legend><div class="choix-groupe">${choixPossibles
        .map((choix) => {
          const optionChoix = optionsChoix[choix] || {};
          return `<label class="choix" style="${optionChoix.fillColor ? `--c:${optionChoix.textColor || "#161616"};--c-bg:${optionChoix.fillColor}` : ""}"><input type="radio" name="ap-Qualification" value="${esc(choix)}"${dis}><span>${esc(choix)}</span></label>`;
        })
        .join("")}</div></fieldset>`;
    } else if (colId === "Description") {
      const perso = !!(courant.conf.description && courant.conf.description.perso),
        reglagesDescription = optionsDescription();
      const aideD = !reglagesDescription.actif
        ? "Saisie libre : le pré-remplissage est désactivé."
        : `Rédigée automatiquement à partir des réponses ci-dessus ; l'agent peut la compléter ou la modifier. Réglages ${perso ? "propres à ce formulaire" : "communs à tous les formulaires"}.`;
      html =
        `<div class="champ"><label${modeTest ? ' for="test-description"' : ""}>${esc(colonne.libelle)} <span class="req">*</span><span class="aide">${esc(aideD)}</span></label>` +
        (modeTest
          ? `<textarea id="test-description" style="min-height:90px"></textarea><div class="etat-desc-test" id="etat-desc-test"></div>`
          : `<div class="exemple-desc">${esc(exempleDescription() || "(aucun élément inclus)")}</div>`) +
        `</div>`;
    }
    const id = `commun:${colId}`;
    return `<div class="bloc commun${choisi === id && !modeTest ? " choisi" : ""}" data-commun="${id}" tabindex="${modeTest ? -1 : 0}" aria-label="Champ commun : ${esc(colonne.libelle)}"><span class="etiq-type">Champ commun</span>${html}</div>`;
  }
  /* ---------- bandeau et étapes, comme dans le widget de saisie ---------- */
  let modeApercu = "nouveau"; // situation montrée par l'aperçu : nouveau signalement ou mise à jour d'un dossier
  const majApercu = () => communsActifs() && modeApercu === "maj";
  const etapeHtml = (numero, texte) =>
    `<h3 class="etape"><span class="num-etape" aria-hidden="true">${numero}</span>${esc(texte)}</h3>`;
  function enteteApercuHtml() {
    const maj = majApercu();
    return (
      `<div class="barre-apercu${saisieEffective().version === "esr" ? " version-esr" : ""}"><span>Situation montrée :</span><div class="seg2" role="group" aria-label="Situation montrée par l'aperçu">` +
      `<button type="button" data-mode-apercu="nouveau" aria-pressed="${!maj}">Nouveau signalement</button><button type="button" data-mode-apercu="maj" aria-pressed="${maj}">Mise à jour d'un dossier</button></div>` +
      `<span class="marque-apercu" id="marque-apercu" title="Bandeau du formulaire">${esc(saisieEffective().marque)}</span></div>` +
      `<div class="entete-apercu${maj ? " maj" : ""}">${maj ? `<p class="etiquette-mode">Mise à jour · dossier n° 12</p>` : ""}` +
      `<h1>${maj ? esc(etablissementTest ? nomEtablissement(etablissementTest) : "Établissement du dossier") : "Nouveau signalement"}</h1>` +
      (maj ? `<p class="sous-titre-apercu">Signalé le ${Outils.dates.date(Date.now())} · 2 mises à jour.</p>` : "") +
      `<p class="phrase-mode">${
        maj
          ? "Modifiez uniquement ce qui a changé : votre enregistrement s'ajoute comme nouvelle étape, l'état précédent reste dans l'historique."
          : "Trois étapes : l'établissement, les faits, puis la description. Un dossier sera créé à l'enregistrement."
      }</p></div>`
    );
  }
  function envoiHtml() {
    const maj = majApercu();
    return (
      `<div class="envoi-apercu"><button type="button" class="primaire" disabled tabindex="-1">${maj ? "Enregistrer la mise à jour" : "Enregistrer le signalement"}</button>` +
      (maj && meta.Clos
        ? `<span class="note">Menu « Autres actions » : corriger ou annuler la dernière étape, clore le signalement.</span>`
        : "") +
      `</div>`
    );
  }
  function dessinerApercu() {
    const apercu = $("apercu");
    if (!courant) {
      dessinerAccueil();
      return;
    }
    const html = [],
      listeParties = parties(),
      partiesQuestions = listeParties.filter((partie) => partie.role === "q"),
      etapes = communsActifs();
    apercu.classList.toggle("maj-apercu", majApercu());
    if (etapes) html.push(enteteApercuHtml());
    listeParties.forEach((partie) => {
      const idPartie = partie.id,
        liste = blocs()
          .map((bloc, i) => ({ b: bloc, i }))
          .filter((entree) => (entree.b.section || "q") === idPartie);
      if (partie.role !== "q" && !liste.length && modeTest) return;
      const choisiP = choisi === `partie:${idPartie}` && !modeTest;
      let htmlFeuille = `<div class="feuille${partie.role !== "q" ? " visa" : ""}${etapes && partie.role === "q" ? " cadre" : ""}${etapes && partie === partiesQuestions[0] ? " premiere" : ""}${choisiP ? " partie-choisie" : ""}" data-section-feuille="${idPartie}">
      <h2 class="titre-partie"${modeTest ? "" : ` data-partie="${idPartie}" tabindex="0" title="Régler la partie"`}>${esc(partie.nom)} <small>${esc(ROLES[partie.role])}${partie.role === "q" && partie.titre ? " · titre affiché" : ""}</small>${modeTest ? "" : ' <span class="crayon" aria-hidden="true">✎</span>'}</h2>`;
      if (etapes && partie === partiesQuestions[0])
        htmlFeuille +=
          etapeHtml(1, majApercu() ? "Établissement" : "Quel établissement est concerné ?") +
          communHtml("Etablissement") +
          communHtml("Site") +
          etapeHtml(2, "Les faits") +
          ["Date_faits", "Qualification"].map(communHtml).join("");
      if (partie.role === "q" && partie.titre && partie.nom)
        htmlFeuille += `<h3 class="titre-section titre-partie-q">${esc(partie.nom)}</h3>`; // titre de partie affiché dans le formulaire
      if (!liste.length)
        htmlFeuille += modeTest
          ? ""
          : `<div class="vide-section">${partie.role === "q" ? "Aucune question dans cette partie." : "Aucune question de visa."}<br><button type="button" class="secondaire petit" data-ajout data-section="${idPartie}" data-index="${blocs().length}">+ Ajouter une question</button></div>`;
      else
        liste.forEach(({ b: bloc, i }, k) => {
          htmlFeuille += insertion(idPartie, i) + blocHtml(bloc);
          if (k === liste.length - 1) htmlFeuille += insertion(idPartie, i + 1);
        });
      if (etapes && partie === partiesQuestions[partiesQuestions.length - 1])
        htmlFeuille +=
          etapeHtml(3, "Description et envoi") +
          communHtml("Description") +
          (majApercu() && saisieEffective().commentaire && meta.Commentaire
            ? `<div class="champ"><label${modeTest ? ' for="test-commentaire"' : ""}>Commentaire de mise à jour<span class="aide">Ce qui s'est passé depuis l'étape précédente</span></label><textarea id="test-commentaire" style="min-height:50px"${modeTest ? "" : ' tabindex="-1" disabled'}></textarea></div>`
            : "") +
          envoiHtml();
      html.push(htmlFeuille + "</div>");
      if (partie === partiesQuestions[partiesQuestions.length - 1] && !modeTest)
        html.push(
          `<div class="ajout-partie"><button type="button" class="ajout-lien" id="btn-ajout-partie">+ Ajouter une partie au formulaire</button></div>`,
        );
    });
    const msg = $("msg-global");
    apercu.innerHTML = html.join("");
    if (msg) apercu.prepend(msg);
    if (modeTest) {
      appliquerTest();
      const champSite = $("test-site");
      if (champSite) champSite.value = siteTest;
    }
    majEtat();
  }
  function dessinerAccueil() {
    $("apercu").innerHTML = `<div class="accueil"><h2>Aucun formulaire</h2>
    <p class="note">Un formulaire rassemble les questions affichées par le widget de saisie pour une table de réponses. Ses questions créent automatiquement les colonnes de cette table.</p>
    ${accesOk ? `<button type="button" class="primaire" id="btn-premier">+ Créer un premier formulaire</button>` : ""}</div>`;
    const bouton = $("btn-premier");
    if (bouton) bouton.addEventListener("click", () => ouvrirNouveau(false));
    $("panneau").innerHTML = "";
    majEtat();
  }

  /* ---------- mode test ---------- */
  function valeurTest(colId) {
    const blocQuestion = blocs().find((candidat) => candidat.genre === "question" && candidat.colonne === colId);
    const colonne = meta[colId];
    if (!blocQuestion && communsActifs() && colId === "Qualification") {
      const radioQualification = document.querySelector('input[name="ap-Qualification"]:checked');
      return radioQualification ? radioQualification.value : null;
    }
    if (colonne && colonne.formule) {
      const valeurFormule = valeurFormuleTest(colonne);
      if (valeurFormule !== undefined) return valeurFormule;
    }
    if (!blocQuestion || !colonne) return simulations[colId] ?? null;
    if (blocQuestion.reglages && blocQuestion.reglages.tableau)
      return (testLignes[colId] || []).filter((ligne) => Object.values(ligne).some((valeur) => !estVideValeur(valeur)))
        .length;
    const bloc = document.querySelector(`[data-bloc="${blocQuestion.id}"]`);
    if (bloc && bloc.classList.contains("masque-test")) return null;
    if (blocQuestion.reglages && blocQuestion.reglages.tableau) return 0;
    const typeColonne = typeBase(colonne.type),
      nom = `ap-${colId}`;
    if (typeColonne === "Bool") {
      const entreeCochee = document.querySelector(`input[name="${nom}"]:checked`);
      return entreeCochee
        ? entreeCochee.type === "checkbox"
          ? entreeCochee.checked
          : entreeCochee.value === "true"
        : null;
    }
    if (typeColonne === "ChoiceList")
      return [...document.querySelectorAll(`input[name="${nom}"]:checked`)].map((caseCochee) => caseCochee.value);
    const radioCoche = document.querySelector(`input[type=radio][name="${nom}"]:checked`);
    if (radioCoche) return radioCoche.value;
    const champ = document.querySelector(`[name="${nom}"]:not([type=radio])`);
    if (!champ || champ.value === "") return null;
    return typeColonne === "Int" || typeColonne === "Numeric" ? parseFloat(champ.value) : champ.value;
  }
  function appliquerTest() {
    ajusterTableauxTest();
    for (let passe = 0; passe < 3; passe++) {
      for (const bloc of blocs()) {
        const condition = bloc.reglages && bloc.reglages.condition;
        const elementBloc = document.querySelector(`[data-bloc="${bloc.id}"]`);
        if (!elementBloc) continue;
        let visible = true;
        if (condition && condition.ref) {
          const col = colonneDeRef(condition.ref);
          visible = evaluerCondition(valeurTest(col ? col.colId : condition.ref), condition);
        }
        elementBloc.classList.toggle("masque-test", !visible);
      }
    }
    majFormulesTest();
    majDescriptionTest();
  }
  function refsExternes() {
    const dansForm = new Set(
      blocs()
        .filter((bloc) => bloc.genre === "question")
        .map((bloc) => bloc.colonne),
    );
    if (communsActifs()) dansForm.add("Qualification");
    const res = new Map();
    for (const bloc of blocs()) {
      const condition = bloc.reglages && bloc.reglages.condition;
      if (!condition || !condition.ref) continue;
      const col = colonneDeRef(condition.ref);
      if (col && !dansForm.has(col.colId)) res.set(col.colId, col);
    }
    return [...res.values()];
  }
  function dessinerPanneauTest() {
    const ext = refsExternes();
    $("panneau").innerHTML =
      `<h2>Mode test</h2><p class="sous">Répondez dans l'aperçu : les questions conditionnelles apparaissent comme dans le widget de saisie. Rien n'est enregistré.</p>` +
      (communsActifs()
        ? `<p class="note">Choisissez un établissement à l'étape 1 : les données de sa fiche s'affichent et la description se rédige au fil de vos réponses.</p>`
        : "") +
      (ext.length
        ? `<div class="groupe simul"><div class="t">Valeurs simulées</div><p class="note" style="margin:0 0 8px">Colonnes utilisées dans des conditions mais absentes du formulaire (par exemple la qualification).</p>` +
          ext
            .map((colonne) => {
              const typeColonne = typeBase(colonne.type),
                choixPossibles = colonne.opts.choices || [],
                valeurSimulee = simulations[colonne.colId];
              const ctl = choixPossibles.length
                ? `<select data-simul="${esc(colonne.colId)}"><option value="">(vide)</option>${choixPossibles.map((choix) => `<option${choix === valeurSimulee ? " selected" : ""}>${esc(choix)}</option>`).join("")}</select>`
                : typeColonne === "Bool"
                  ? `<select data-simul="${esc(colonne.colId)}"><option value="">(vide)</option><option value="true"${valeurSimulee === true ? " selected" : ""}>Oui</option><option value="false"${valeurSimulee === false ? " selected" : ""}>Non</option></select>`
                  : `<input type="text" data-simul="${esc(colonne.colId)}" value="${esc(valeurSimulee ?? "")}">`;
              return `<label class="l">${esc(colonne.libelle)}</label>${ctl}`;
            })
            .join("") +
          `</div>`
        : "") +
      `<div class="pied-panneau"><button type="button" class="secondaire petit" id="btn-fin-test">Revenir à l'édition</button></div>`;
    $("panneau")
      .querySelectorAll("[data-simul]")
      .forEach((champ) =>
        champ.addEventListener("input", () => {
          const col = meta[champ.dataset.simul],
            typeColonne = typeBase(col.type);
          simulations[champ.dataset.simul] =
            champ.value === ""
              ? null
              : typeColonne === "Bool"
                ? champ.value === "true"
                : typeColonne === "Int" || typeColonne === "Numeric"
                  ? parseFloat(champ.value)
                  : champ.value;
          appliquerTest();
        }),
      );
    $("btn-fin-test").addEventListener("click", basculerTest);
  }
  /* ---------- tableau en mode test : lignes saisissables, nombre de lignes suivant une question ---------- */
  let testLignes = {};
  // Champs d'une table de tableau, dans l'ordre de saisie : [ordre N] d'abord, puis l'ordre des colonnes de Grist
  const sousColonnes = (tid) =>
    Object.values(colonnesDe(tid))
      .filter(
        (colonne) =>
          !colonne.formule &&
          !RESERVES_TABLEAU.includes(colonne.colId) &&
          !(courant && colonne.type === `Ref:${courant.table}`),
      )
      .map((colonne) => ({ ...colonne, r: lireReperes(colonne.description) }))
      .sort(
        (colonneA, colonneB) => (colonneA.r.ordre ?? 1e9) - (colonneB.r.ordre ?? 1e9) || colonneA.pos - colonneB.pos,
      );
  function visibleDansLigne(champ, cols, ligne) {
    const condition = champ.r.condition;
    if (!condition || !condition.ref) return true;
    const refNormalisee = normaliser(condition.ref),
      cible = cols.find(
        (colonne) =>
          colonne.colId === condition.ref ||
          normaliser(colonne.colId) === refNormalisee ||
          normaliser(colonne.libelle) === refNormalisee,
      );
    return cible ? evaluerCondition(ligne[cible.colId] ?? null, condition) : true;
  }
  // Aperçu simplifié d'un champ [auto] : « Libellé : valeur » des autres champs de la ligne (hors confidentiels)
  function texteAutoTest(cols, ligne) {
    return cols
      .filter((champ) => !champ.r.auto && !champ.r.confidentiel && visibleDansLigne(champ, cols, ligne))
      .map((champ) => {
        const valeur = ligne[champ.colId];
        if (estVideValeur(valeur)) return "";
        return `${champ.libelle} : ${Array.isArray(valeur) ? valeur.join(", ") : valeur === true ? "Oui" : valeur === false ? "Non" : valeur}`;
      })
      .filter(Boolean)
      .join(" — ");
  }
  function tableauTestHtml(bloc) {
    const cols = sousColonnes(bloc.reglages.tableau.table).filter((champ) => !champ.r.masque),
      lignes = testLignes[bloc.colonne] || (testLignes[bloc.colonne] = []);
    const attendu = bloc.reglages.tableau.lignes ? valeurTest(bloc.reglages.tableau.lignes) : null;
    const ctl = (champ, k, valeur) => {
      const typeColonne = typeBase(champ.type),
        choixPossibles = champ.opts.choices || [],
        att = `data-k="${k}" data-sc="${esc(champ.colId)}"`;
      // choix unique : boutons ronds comme les pastilles du widget de saisie ([liste] : menu déroulant)
      if (typeColonne === "Choice" && !/\[liste\]/i.test(champ.description || ""))
        return `<div class="coches" role="radiogroup">${choixPossibles.map((choix) => `<label><input type="radio" name="t-${esc(bloc.colonne)}-${k}-${esc(champ.colId)}" ${att} value="${esc(choix)}"${choix === valeur ? " checked" : ""}> ${esc(choix)}</label>`).join("")}</div>`;
      if (typeColonne === "Choice")
        return `<select ${att}><option value="">Choisir…</option>${choixPossibles.map((choix) => `<option${choix === valeur ? " selected" : ""}>${esc(choix)}</option>`).join("")}</select>`;
      if (typeColonne === "ChoiceList")
        return `<div class="coches">${choixPossibles.map((choix) => `<label><input type="checkbox" ${att} value="${esc(choix)}"${(valeur || []).includes(choix) ? " checked" : ""}> ${esc(choix)}</label>`).join("")}</div>`;
      if (typeColonne === "Bool")
        return `<select ${att}><option value="">—</option><option value="true"${valeur === true ? " selected" : ""}>Oui</option><option value="false"${valeur === false ? " selected" : ""}>Non</option></select>`;
      if (typeColonne === "Int" || typeColonne === "Numeric")
        return `<input type="number" ${att} value="${valeur ?? ""}">`;
      if (typeColonne === "Date") return `<input type="date" ${att} value="${esc(valeur || "")}">`;
      if (champ.r.auto)
        return `<input type="text" ${att} value="${esc(texteAutoTest(cols, lignes[k]))}" readonly title="Aperçu : dans le formulaire, l'agent peut modifier ce texte">`;
      return `<input type="text" ${att} value="${esc(valeur || "")}">`;
    };
    return `${
      lignes
        .map(
          (ligne, k) => `<div class="ligne-test"><span class="num-test">${k + 1}</span>${cols
            .filter((champ) => visibleDansLigne(champ, cols, ligne))
            .map(
              (champ) =>
                `<label class="sc-test"><span>${esc(champ.libelle)}${champ.r.obligatoire ? ' <span class="req">*</span>' : ""}${champ.r.auto ? ' <small class="note">(auto)</small>' : ""}</span>${ctl(champ, k, ligne[champ.colId])}</label>`,
            )
            .join("")}
      <button type="button" class="icone" data-tab-act="suppr" data-k="${k}" aria-label="Supprimer la ligne ${k + 1}">✕</button></div>`,
        )
        .join("") || `<p class="note" style="margin:0 0 8px">Aucune ligne.</p>`
    }
    <div class="pied-test"><button type="button" class="secondaire petit" data-tab-act="ajout">+ Ajouter</button>
      <span class="note">${lignes.length} ligne${lignes.length > 1 ? "s" : ""}${attendu != null ? ` · ${attendu || 0} indiqué${(attendu || 0) > 1 ? "s" : ""} dans « ${esc(libelleQuestion(bloc.reglages.tableau.lignes))} »` : ""}</span></div>`;
  }
  function redessinerTableauTest(colId) {
    const bloc = blocs().find((candidat) => candidat.colonne === colId),
      zoneTableau = document.querySelector(`[data-tab="${CSS.escape(colId)}"]`);
    if (bloc && zoneTableau) zoneTableau.innerHTML = tableauTestHtml(bloc);
  }
  function ajusterTableauxTest() {
    // même règle que le widget de saisie : ajout de lignes vides, retrait des seules lignes vides
    for (const bloc of blocs()) {
      const reglagesTableau = bloc.reglages && bloc.reglages.tableau;
      if (!reglagesTableau || !reglagesTableau.lignes) continue;
      const valeurLignes = valeurTest(reglagesTableau.lignes),
        nombreLignes =
          typeof valeurLignes === "number" && valeurLignes > 0 ? Math.min(200, Math.floor(valeurLignes)) : 0;
      const lignes = testLignes[bloc.colonne] || (testLignes[bloc.colonne] = []);
      if (lignes.dernierN === nombreLignes) continue; // seul un changement du nombre ajuste les lignes (l'ajout à la main reste possible)
      lignes.dernierN = nombreLignes;
      const avant = lignes.length;
      while (lignes.length < nombreLignes) lignes.push({});
      while (
        lignes.length > nombreLignes &&
        !Object.values(lignes[lignes.length - 1]).some((valeur) => !estVideValeur(valeur))
      )
        lignes.pop();
      if (lignes.length !== avant) redessinerTableauTest(bloc.colonne);
    }
  }
  function clicTableauTest(evenement) {
    const boutonAction = evenement.target.closest("[data-tab-act]");
    if (!boutonAction) return;
    const colId = boutonAction.closest("[data-tab]").dataset.tab,
      lignes = testLignes[colId] || (testLignes[colId] = []);
    if (boutonAction.dataset.tabAct === "ajout") lignes.push({});
    else lignes.splice(+boutonAction.dataset.k, 1);
    redessinerTableauTest(colId);
    appliquerTest();
  }
  function saisieTableauTest(evenement) {
    const controle = evenement.target.closest("[data-sc]");
    if (!controle) return false;
    const colId = controle.closest("[data-tab]").dataset.tab,
      k = +controle.dataset.k,
      identifiantChamp = controle.dataset.sc,
      ligne = testLignes[colId][k];
    const colonne = sousColonnes(blocs().find((candidat) => candidat.colonne === colId).reglages.tableau.table).find(
        (candidat) => candidat.colId === identifiantChamp,
      ),
      typeColonne = typeBase(colonne.type);
    if (typeColonne === "ChoiceList")
      ligne[identifiantChamp] = [...controle.closest(".sc-test").querySelectorAll("input:checked")].map(
        (caseCochee) => caseCochee.value,
      );
    else if (typeColonne === "Bool") ligne[identifiantChamp] = controle.value === "" ? null : controle.value === "true";
    else if (typeColonne === "Int" || typeColonne === "Numeric")
      ligne[identifiantChamp] = controle.value === "" ? null : parseFloat(controle.value);
    else ligne[identifiantChamp] = controle.value;
    if (evenement.type === "change") {
      redessinerTableauTest(colId);
      const champRedessine = document.querySelector(
        `[data-tab="${CSS.escape(colId)}"] [data-k="${k}"][data-sc="${CSS.escape(identifiantChamp)}"]`,
      );
      if (champRedessine && champRedessine.type !== "checkbox") champRedessine.focus();
    }
    return true;
  }
  function basculerTest() {
    modeTest = !modeTest;
    testLignes = {};
    descriptionTestManuelle = false;
    siteTest = "";
    if (modeTest && communsActifs() && !etablissementsTest)
      chargerEtablissementsTest().then(() => {
        const i = $("test-etab");
        if (i) i.placeholder = "Nom ou UAI";
      });
    $("btn-tester").setAttribute("aria-pressed", String(modeTest));
    $("btn-tester").textContent = modeTest ? "✎ Éditer" : "▶ Tester";
    $("app").classList.toggle("test", modeTest);
    fermerMenu();
    dessinerApercu();
    if (modeTest) dessinerPanneauTest();
    else dessinerPanneau();
  }
  $("apercu").addEventListener("input", (evenement) => {
    if (!modeTest) return;
    if (evenement.target.id === "test-description") {
      descriptionTestManuelle = true;
      majDescriptionTest();
      return;
    }
    if (evenement.target.id === "test-etab") {
      chercherEtablissementTest(evenement.target.value);
      return;
    }
    if (evenement.target.id === "test-site") siteTest = evenement.target.value;
    saisieTableauTest(evenement);
    appliquerTest();
  });
  $("apercu").addEventListener("change", (evenement) => {
    if (!modeTest || evenement.target.id === "test-description" || evenement.target.id === "test-etab") return;
    saisieTableauTest(evenement);
    appliquerTest();
  });

  /* =========================================================
   Sélection, déplacement, outils des blocs
   ========================================================= */
  $("apercu").addEventListener("click", (evenement) => {
    if (!courant) return;
    const boutonMode = evenement.target.closest("[data-mode-apercu]");
    if (boutonMode) {
      modeApercu = boutonMode.dataset.modeApercu;
      testLignes = {};
      descriptionTestManuelle = false;
      dessinerApercu();
      return;
    }
    if (evenement.target.closest("#btn-desc-auto")) {
      descriptionTestManuelle = false;
      majDescriptionTest();
      return;
    }
    if (modeTest) {
      clicTableauTest(evenement);
      return;
    }
    if (evenement.target.closest("#btn-ajout-partie")) {
      ajouterPartie();
      return;
    }
    const titrePartie = evenement.target.closest("[data-partie]");
    if (titrePartie) {
      choisir(`partie:${titrePartie.dataset.partie}`);
      return;
    }
    const champCommun = evenement.target.closest("[data-commun]");
    if (champCommun) {
      choisir(champCommun.dataset.commun);
      return;
    }
    const boutonAjout = evenement.target.closest("[data-ajout]");
    if (boutonAjout) {
      const ins = boutonAjout.closest(".insertion") || boutonAjout;
      ouvrirMenu(
        ins.dataset.section || boutonAjout.dataset.section,
        +(ins.dataset.index ?? boutonAjout.dataset.index),
        boutonAjout,
      );
      return;
    }
    const outil = evenement.target.closest("[data-act]");
    const bloc = evenement.target.closest(".bloc");
    // Clic dans un espace vide de l'aperçu : retour aux réglages du formulaire
    if (!bloc) {
      if (
        choisi &&
        !evenement.target.closest("button, a, input, select, textarea, label, .insertion, [data-section-feuille] h3")
      )
        choisir(null);
      return;
    }
    evenement.preventDefault();
    const id = bloc.dataset.bloc;
    if (outil) {
      agir(outil.dataset.act, id);
      return;
    }
    choisir(id);
  });
  $("apercu").addEventListener("keydown", (evenement) => {
    if (modeTest) return;
    if (
      evenement.target.dataset &&
      (evenement.target.dataset.partie || evenement.target.dataset.commun) &&
      (evenement.key === "Enter" || evenement.key === " ")
    ) {
      evenement.preventDefault();
      choisir(
        evenement.target.dataset.partie ? `partie:${evenement.target.dataset.partie}` : evenement.target.dataset.commun,
      );
      return;
    }
    const bloc =
      evenement.target.classList && evenement.target.classList.contains("bloc") && evenement.target.dataset.bloc
        ? evenement.target
        : null;
    if (!bloc) return;
    if (evenement.key === "Enter" || evenement.key === " ") {
      evenement.preventDefault();
      choisir(bloc.dataset.bloc);
    } else if (evenement.altKey && (evenement.key === "ArrowUp" || evenement.key === "ArrowDown")) {
      evenement.preventDefault();
      agir(evenement.key === "ArrowUp" ? "haut" : "bas", bloc.dataset.bloc);
    } else if (evenement.key === "Delete") {
      evenement.preventDefault();
      agir("retirer", bloc.dataset.bloc);
    }
  });
  function choisir(id) {
    choisi = id;
    document
      .querySelectorAll(".bloc")
      .forEach((bloc) => bloc.classList.toggle("choisi", (bloc.dataset.bloc || bloc.dataset.commun) === id));
    document
      .querySelectorAll("[data-section-feuille]")
      .forEach((feuille) =>
        feuille.classList.toggle("partie-choisie", id === `partie:${feuille.dataset.sectionFeuille}`),
      );
    dessinerPanneau();
  }
  function deplacer(id, versIndex, section) {
    const liste = blocs(),
      i = liste.findIndex((candidat) => candidat.id === id);
    if (i < 0) return;
    const [bloc] = liste.splice(i, 1);
    if (section) bloc.section = section;
    liste.splice(Math.max(0, Math.min(liste.length, versIndex > i ? versIndex - 1 : versIndex)), 0, bloc);
    sauver();
    dessinerApercu();
    const elementBloc = document.querySelector(`[data-bloc="${id}"]`);
    if (elementBloc) elementBloc.focus();
  }
  function agir(act, id) {
    const liste = blocs(),
      i = liste.findIndex((candidat) => candidat.id === id),
      bloc = liste[i];
    if (!bloc) return;
    const section = bloc.section || "q";
    const memeSection = liste
      .map((blocParcouru, k) => ({ x: blocParcouru, k }))
      .filter((entree) => (entree.x.section || "q") === section);
    const pos = memeSection.findIndex((entree) => entree.x.id === id);
    if (act === "haut" && pos > 0) deplacer(id, memeSection[pos - 1].k);
    else if (act === "bas" && pos < memeSection.length - 1) deplacer(id, memeSection[pos + 1].k + 1);
    else if (act === "dupliquer") dupliquerBloc(bloc, i);
    else if (act === "retirer") retirerBloc(bloc);
  }
  async function dupliquerBloc(bloc, i) {
    const blocCopie = copie(bloc);
    blocCopie.id = nouvelId();
    if (bloc.genre === "question") {
      // une question ne peut pas partager sa colonne : la copie crée une nouvelle colonne de même type
      const colonne = meta[bloc.colonne];
      if (!colonne) return;
      const lib = `${libelleQuestion(bloc.colonne)} (copie)`;
      try {
        blocCopie.colonne = await creerColonne(courant.table, lib, colonne.type, colonne.opts);
        blocCopie.reglages = { ...blocCopie.reglages, libelle: lib };
        // question tableau : la copie a sa propre table, de même structure (sinon les deux questions partageraient leurs lignes et leurs champs)
        if (bloc.reglages && bloc.reglages.tableau && bloc.reglages.tableau.table)
          blocCopie.reglages.tableau = {
            ...bloc.reglages.tableau,
            table: await copierSousTable(bloc.reglages.tableau.table),
          };
      } catch (erreur) {
        message(`Copie impossible : ${erreur.message || erreur}`, "err");
        return;
      }
    }
    blocs().splice(i + 1, 0, blocCopie);
    choisi = blocCopie.id;
    sauver();
    dessinerApercu();
    dessinerPanneau();
    if (blocCopie.reglages && blocCopie.reglages.tableau && blocCopie.reglages.tableau.table) {
      message(
        `Question copiée avec sa propre table, ${blocCopie.reglages.tableau.table} (mêmes champs, sans les lignes).`,
        "ok",
      );
      reglesApresTableau(blocCopie.reglages.tableau.table);
    }
  }
  // Nouvelle table de même structure que la sous-table d'une question tableau (colonnes, libellés, choix, réglages) ; renvoie son nom
  async function copierSousTable(src) {
    const [tablesGrist, colonnesGrist] = await Promise.all([
      Donnees.lire("_grist_Tables"),
      Donnees.lire("_grist_Tables_column"),
    ]);
    const ref = tablesGrist.id[tablesGrist.tableId.indexOf(src)];
    if (!ref) throw new Error(`table ${src} introuvable`);
    const idx = colonnesGrist.id
      .map((_, i) => i)
      .filter(
        (i) =>
          colonnesGrist.parentId[i] === ref &&
          colonnesGrist.colId[i] !== "manualSort" &&
          !String(colonnesGrist.colId[i]).startsWith("gristHelper"),
      );
    const nomT = identifiant(`${src} copie`, tables.concat(tablesGrist.tableId));
    const cellule = (k, i) => (colonnesGrist[k] || [])[i];
    const simples = idx.filter((i) => !cellule("isFormula", i)),
      formules = idx.filter((i) => cellule("isFormula", i));
    await actions([
      [
        "AddTable",
        nomT,
        simples.map((i) => ({
          id: cellule("colId", i),
          type: cellule("type", i),
          isFormula: false,
          formula: cellule("formula", i) || "",
        })),
      ],
    ]);
    await actions([
      ...formules.map((i) => [
        "AddColumn",
        nomT,
        cellule("colId", i),
        { type: cellule("type", i), isFormula: true, formula: cellule("formula", i) || "" },
      ]),
      ...idx.map((i) => [
        "ModifyColumn",
        nomT,
        cellule("colId", i),
        {
          label: cellule("label", i) || cellule("colId", i),
          widgetOptions: cellule("widgetOptions", i) || "",
          description: cellule("description", i) || "",
          untieColIdFromLabel: true,
        },
      ]),
    ]);
    await lireMeta();
    return nomT;
  }
  function retirerBloc(bloc) {
    const lib = bloc.genre === "question" ? `« ${libelleQuestion(bloc.colonne)} »` : "ce bloc";
    const dependantes = blocs().filter(
      (autreBloc) =>
        autreBloc.reglages &&
        autreBloc.reglages.condition &&
        colonneDeRef(autreBloc.reglages.condition.ref) &&
        colonneDeRef(autreBloc.reglages.condition.ref).colId === bloc.colonne &&
        bloc.genre === "question",
    );
    if (
      !confirm(
        `Retirer ${lib} du formulaire ?${bloc.genre === "question" ? "\nLa colonne et ses réponses restent dans la table." : ""}${dependantes.length ? `\n${dependantes.length} question(s) dépendent de celle-ci : leur condition restera à corriger.` : ""}`,
      )
    )
      return;
    courant.conf.blocs = blocs().filter((autreBloc) => autreBloc.id !== bloc.id);
    if (choisi === bloc.id) choisi = null;
    sauver();
    dessinerApercu();
    dessinerPanneau();
  }
  // Glisser-déposer
  let blocGlisse = null;
  $("apercu").addEventListener("dragstart", (evenement) => {
    const bloc = evenement.target.closest && evenement.target.closest(".bloc");
    if (!bloc || modeTest) return;
    blocGlisse = bloc.dataset.bloc;
    bloc.classList.add("glisse");
    evenement.dataTransfer.effectAllowed = "move";
    try {
      evenement.dataTransfer.setData("text/plain", blocGlisse);
    } catch (_) {}
  });
  $("apercu").addEventListener("dragend", () => {
    blocGlisse = null;
    document
      .querySelectorAll(".glisse, .depot-avant, .depot-apres")
      .forEach((element) => element.classList.remove("glisse", "depot-avant", "depot-apres"));
  });
  function cibleDepot(evenement) {
    const bloc = evenement.target.closest && evenement.target.closest(".bloc");
    if (bloc && bloc.dataset.bloc !== blocGlisse) {
      const rectangle = bloc.getBoundingClientRect();
      return { el: bloc, apres: evenement.clientY > rectangle.top + rectangle.height / 2 };
    }
    const feuille = evenement.target.closest && evenement.target.closest("[data-section-feuille]");
    return feuille ? { feuille: feuille } : null;
  }
  $("apercu").addEventListener("dragover", (evenement) => {
    if (!blocGlisse) return;
    const depot = cibleDepot(evenement);
    if (!depot) return;
    evenement.preventDefault();
    document
      .querySelectorAll(".depot-avant, .depot-apres")
      .forEach((element) => element.classList.remove("depot-avant", "depot-apres"));
    if (depot.el) depot.el.classList.add(depot.apres ? "depot-apres" : "depot-avant");
  });
  $("apercu").addEventListener("drop", (evenement) => {
    if (!blocGlisse) return;
    const depot = cibleDepot(evenement);
    if (!depot) return;
    evenement.preventDefault();
    if (depot.el) {
      const cible = blocDe(depot.el.dataset.bloc),
        k = blocs().indexOf(cible);
      deplacer(blocGlisse, k + (depot.apres ? 1 : 0), cible.section || "q");
    } else if (depot.feuille) deplacer(blocGlisse, blocs().length, depot.feuille.dataset.sectionFeuille);
  });

  /* =========================================================
   Ajout d'un bloc
   ========================================================= */
  let menuContextuel = null;
  function fermerMenu() {
    $("menu-ajout").hidden = true;
    document.querySelectorAll(".insertion.ouverte").forEach((insertion) => insertion.classList.remove("ouverte"));
    menuContextuel = null;
  }
  function placerMenu(ancre) {
    const menu = $("menu-ajout"),
      rectangle = ancre.getBoundingClientRect();
    menu.hidden = false;
    const gauche = Math.max(
      10,
      Math.min(window.innerWidth - menu.offsetWidth - 10, rectangle.left + rectangle.width / 2 - menu.offsetWidth / 2),
    );
    let haut = rectangle.bottom + 6;
    if (haut + menu.offsetHeight > window.innerHeight - 10) haut = Math.max(10, rectangle.top - menu.offsetHeight - 6);
    menu.style.left = gauche + "px";
    menu.style.top = haut + "px";
  }
  function ouvrirMenu(section, index, ancre) {
    menuContextuel = { section: section || "q", index: isNaN(index) ? blocs().length : index, ancre };
    const ins = ancre.closest(".insertion");
    if (ins) ins.classList.add("ouverte");
    const menu = $("menu-ajout");
    menu.innerHTML = `<h4>Ajouter</h4><div class="types">${TYPES_QUESTIONS.filter(
      (type) => !type.etab || (communsActifs() && tableEtablissements()),
    )
      .map((type) => `<button type="button" data-type="${type.cle}"><b>${type.icone}</b>${esc(type.nom)}</button>`)
      .join("")}</div>
    <div class="lien-existante"><button type="button" class="ajout-lien" data-type="existante">↳ Utiliser des colonnes existantes de la table…</button></div>`;
    placerMenu(ancre);
    menu.querySelector("button").focus();
  }
  $("menu-ajout").addEventListener("click", (evenement) => {
    const bouton = evenement.target.closest("button");
    if (!bouton || !menuContextuel) return;
    if (bouton.dataset.type === "existante") return etapeExistantes();
    if (bouton.dataset.type === "etab") return etapeEtablissement();
    if (bouton.dataset.type) return etapeLibelle(TYPES_QUESTIONS.find((type) => type.cle === bouton.dataset.type));
    if (bouton.dataset.menu === "annuler") return fermerMenu();
  });
  $("menu-ajout").addEventListener("keydown", (evenement) => {
    if (evenement.key === "Escape") {
      evenement.preventDefault();
      const ancre = menuContextuel && menuContextuel.ancre;
      fermerMenu();
      if (ancre) ancre.focus();
    }
  });
  document.addEventListener("mousedown", (evenement) => {
    if (
      !$("menu-ajout").hidden &&
      !$("menu-ajout").contains(evenement.target) &&
      !evenement.target.closest("[data-ajout]")
    )
      fermerMenu();
  });
  function etapeLibelle(type) {
    const menu = $("menu-ajout");
    const decor = !!type.decor;
    menu.innerHTML = `<h4>${esc(type.nom)}</h4><form class="etape2" id="form-etape2">
    <label for="e2-texte">${decor ? (type.decor === "titre" ? "Titre" : "Texte") : "Intitulé de la question"}</label>
    ${type.decor === "info" ? `<textarea id="e2-texte" required></textarea>` : `<input type="text" id="e2-texte" required autocomplete="off">`}
    ${
      type.cle === "tableau"
        ? `<label for="e2-table-choix">Table des lignes<span class="aide">Une ligne par élément saisi (par exemple un blessé, un site).</span></label>
      <select id="e2-table-choix" style="margin-bottom:8px"><option value="__nouvelle__">+ Créer une nouvelle table</option>${tablesPourTableau()
        .map((identifiantTable) => `<option value="${esc(identifiantTable)}">${esc(identifiantTable)}</option>`)
        .join("")}</select>
      <div id="e2-bloc-nouvelle"><label for="e2-table">Nom de la nouvelle table</label><input type="text" id="e2-table" autocomplete="off"></div>
      <p class="note" id="e2-table-info" style="margin:0 0 6px" hidden></p>`
        : ""
    }
    ${!decor ? `<p class="note" style="margin:0 0 6px">Une colonne « ${esc(typeAffiche({ genre: "question", colonne: "", reglages: {} }) && type.nom)} » sera créée dans la table ${esc(courant.table)}.</p>` : ""}
    <p class="statut err" id="e2-erreur" role="alert"></p>
    <div class="actions-menu"><button type="button" class="secondaire" data-menu="annuler">Annuler</button><button type="submit" class="primaire">Ajouter</button></div></form>`;
    placerMenu(menuContextuel.ancre);
    const champ = $("e2-texte");
    champ.focus();
    if (type.cle === "tableau")
      champ.addEventListener("input", () => {
        if (!$("e2-table").dataset.touche) $("e2-table").value = identifiant(champ.value, []);
      });
    if ($("e2-table-choix"))
      $("e2-table-choix").addEventListener("change", () => {
        const tableChoisie = $("e2-table-choix").value,
          info = $("e2-table-info");
        $("e2-erreur").textContent = "";
        $("e2-bloc-nouvelle").hidden = tableChoisie !== "__nouvelle__";
        info.hidden = tableChoisie === "__nouvelle__";
        if (tableChoisie !== "__nouvelle__") {
          const analyse = analyserTableLignes(tableChoisie);
          info.innerHTML = analyse.html;
          info.classList.toggle("avert", !!analyse.erreur);
        }
        placerMenu(menuContextuel.ancre);
      });
    if ($("e2-table"))
      $("e2-table").addEventListener("input", () => {
        $("e2-table").dataset.touche = "1";
      });
    $("form-etape2").addEventListener("submit", async (evenement) => {
      evenement.preventDefault();
      const texte = champ.value.trim();
      if (!texte) return;
      const btn = evenement.submitter || menu.querySelector("button[type=submit]");
      btn.disabled = true;
      const existante =
        $("e2-table-choix") && $("e2-table-choix").value !== "__nouvelle__" ? $("e2-table-choix").value : null;
      try {
        await ajouterBloc(type, texte, $("e2-table") ? $("e2-table").value.trim() : "", existante);
        fermerMenu();
      } catch (erreur) {
        $("e2-erreur").textContent = `Échec : ${erreur.message || erreur}`;
        btn.disabled = false;
      }
    });
  }
  async function creerColonne(table, libelle, type, opts, formule) {
    const existants = Object.keys(colonnesDe(table));
    const colId = identifiant(libelle, existants);
    const info = { type, label: libelle, isFormula: !!formule, untieColIdFromLabel: true };
    if (formule) info.formula = formule;
    if (opts && Object.keys(opts).length) info.widgetOptions = JSON.stringify(opts);
    const res = await actions([["AddColumn", table, colId, info]]);
    const retour = res && res.retValues && res.retValues[0];
    await lireMeta();
    meta = metaCourante();
    return (retour && retour.colId) || colId;
  }
  /* Pièces jointes et liens d'établissement : Grist n'accepte qu'un utilisateur à accès restreint (lien d'établissement)
   place dans une cellule un fichier envoyé dans la même session que lui ; le formulaire envoie les fichiers par l'API
   (autre session). La cellule Pièces jointes est donc une formule : elle reprend les numéros écrits par le formulaire
   dans la colonne d'envoi, en vérifiant pour chacun l'empreinte SHA-1 du contenu (fileIdent de Grist) : seul celui qui a
   le fichier en main peut le joindre, impossible d'afficher la pièce d'un autre établissement en devinant son numéro. */
  const formulePiecesJointes = (envoi) =>
    [
      `# Pièces jointes envoyées par le formulaire (colonne ${envoi} : « numéro:empreinte » de chaque fichier).`,
      "# Seuls les fichiers dont l'empreinte (SHA-1 du contenu) correspond sont retenus.",
      "ids = []",
      `for x in ($${envoi} or "").split():`,
      "  n, _, h = x.partition(':')",
      "  a = _grist_Attachments.lookupOne(id=int(n)) if n.isdigit() else None",
      "  if a and len(h) >= 40 and (a.fileIdent or '').startswith(h) and a.id not in ids:",
      "    ids.append(a.id)",
      "return ids",
    ].join("\n");
  // Copie des colonnes lue par les liens d'établissement (clé « schema » de Config) : à rafraîchir dès qu'une colonne
  // publiée change de nature (sinon le formulaire ouvert par lien écrit encore dans l'ancienne colonne)
  async function majCopieLiens() {
    try {
      const cfg = await Socle.lireConfig(),
        general = Socle.general(cfg);
      return await moduleRepartition.majSchemaPublic(
        await Socle.lireMeta(),
        cfg,
        general,
        await moduleRepartition.lireFormulairesPublies(general),
      );
    } catch (_) {
      return false; /* copie pour les liens : facultative */
    }
  }
  // Question Pièces jointes déjà créée en colonne simple : passe en formule avec sa colonne d'envoi (pièces déjà jointes reprises)
  async function adapterPiecesJointes(bloc) {
    const colonne = meta[bloc.colonne];
    if (!colonne || colonne.formule || colonne.pjEnvoi || typeBase(colonne.type) !== "Attachments") return;
    if (
      !confirm(
        `Rendre la question « ${libelleQuestion(bloc.colonne)} » utilisable par les liens d'établissement ?\n\nUne colonne « ${colonne.libelle} (envoi) » est ajoutée ; la colonne des pièces jointes devient une formule qui la lit. Les pièces déjà jointes sont conservées.`,
      )
    )
      return;
    try {
      const envoi = await creerColonne(courant.table, `${colonne.libelle} (envoi)`, "Text", null);
      const [donneesTable, att] = await Promise.all([Donnees.lire(courant.table), Donnees.lire("_grist_Attachments")]);
      const ident = new Map(att.id.map((id, i) => [id, String((att.fileIdent || [])[i] || "").replace(/\..*$/, "")]));
      const ids = [],
        vals = [];
      donneesTable.id.forEach((id, i) => {
        const valeur = donneesTable[bloc.colonne][i],
          numeros = Array.isArray(valeur) ? valeur.slice(1).filter((numero) => typeof numero === "number") : [];
        if (numeros.length) {
          ids.push(id);
          vals.push(numeros.map((numero) => `${numero}:${ident.get(numero) || ""}`).join(" "));
        }
      });
      const acts = [];
      if (ids.length) acts.push(["BulkUpdateRecord", courant.table, ids, { [envoi]: vals }]);
      acts.push([
        "ModifyColumn",
        courant.table,
        bloc.colonne,
        { isFormula: true, formula: formulePiecesJointes(envoi) },
      ]);
      await actions(acts);
      await lireMeta();
      meta = metaCourante();
      dessinerApercu();
      dessinerPanneau();
      await majCopieLiens();
      message(
        `Question « ${libelleQuestion(bloc.colonne)} » adaptée aux liens d'établissement (colonne ${envoi} ajoutée${ids.length ? `, ${ids.length} réponse(s) reprise(s)` : ""}). Les formulaires déjà ouverts doivent être rechargés.`,
        "ok",
      );
    } catch (erreur) {
      message(`Adaptation refusée par Grist (${erreur.message || erreur}).`, "err");
    }
  }
  async function ajouterBloc(type, texte, nomTable, tableExistante) {
    const ctx = menuContextuel;
    const bloc = { id: nouvelId(), section: ctx.section };
    if (type.decor) {
      bloc.genre = type.decor;
      bloc.texte = texte;
    } else if (type.cle === "tableau" && tableExistante) {
      const analyse = analyserTableLignes(tableExistante);
      if (analyse.erreur) throw new Error(analyse.erreur);
      // colonnes de liaison manquantes : dossier (référence vers la table des réponses), identifiant et ordre des lignes
      const acts = [];
      if (!analyse.colDossier)
        acts.push([
          "AddColumn",
          tableExistante,
          "Dossier",
          { type: `Ref:${courant.table}`, isFormula: false, label: "Dossier" },
        ]);
      if (!analyse.ligne) acts.push(["AddColumn", tableExistante, "Ligne_id", { type: "Text", isFormula: false }]);
      if (!analyse.ordre) acts.push(["AddColumn", tableExistante, "Ordre", { type: "Int", isFormula: false }]);
      if (acts.length) {
        await actions(acts);
        await lireMeta();
      }
      // historique : une ligne par version (Version, Mouvement, Etat_actuel, Date_version)
      const hist = actionsHistoriqueTableau(tableExistante, analyse.colDossier || "Dossier");
      if (hist.length) {
        await actions(hist);
        await lireMeta();
        acts.push(...hist);
      }
      bloc.genre = "question";
      bloc.colonne = await creerColonne(courant.table, texte, "Text", null);
      bloc.reglages = { libelle: texte, tableau: { table: tableExistante } };
      const reprise = await reprendreLignesExistantes(tableExistante, bloc.colonne, analyse.colDossier || "Dossier");
      setTimeout(
        () =>
          message(
            `Question tableau créée sur la table ${tableExistante}${acts.length ? ` (colonne${acts.length > 1 ? "s" : ""} ajoutée${acts.length > 1 ? "s" : ""} : ${acts.map((action) => action[2]).join(", ")})` : ""}.` +
              (reprise.lignes
                ? ` ${reprise.lignes} ligne${reprise.lignes > 1 ? "s" : ""} existante${reprise.lignes > 1 ? "s" : ""} reprise${reprise.lignes > 1 ? "s" : ""} dans ${reprise.dossiers} dossier${reprise.dossiers > 1 ? "s" : ""}.`
                : ""),
            "ok",
          ),
        0,
      );
    } else if (type.cle === "tableau") {
      const nomT = identifiant(nomTable || texte, tables.concat(Object.keys(meta)));
      await actions([
        [
          "AddTable",
          nomT,
          [
            { id: "Dossier", type: `Ref:${courant.table}`, isFormula: false },
            { id: "Ligne_id", type: "Text", isFormula: false },
            { id: "Ordre", type: "Int", isFormula: false },
          ],
        ],
      ]);
      await lireMeta();
      const hist = actionsHistoriqueTableau(nomT, "Dossier"); // historique : une ligne par version et par ligne saisie
      if (hist.length) {
        await actions(hist);
        await lireMeta();
      }
      bloc.genre = "question";
      bloc.colonne = await creerColonne(courant.table, texte, "Text", null);
      bloc.reglages = { libelle: texte, tableau: { table: nomT } };
    } else if (type.cle === "pj") {
      // pièces jointes : colonne texte d'envoi (remplie par le formulaire) + colonne Pièces jointes en formule, qui ne
      // retient que les fichiers dont le formulaire prouve l'envoi (empreinte) : compatible avec les liens d'établissement
      bloc.genre = "question";
      const envoi = await creerColonne(courant.table, `${texte} (envoi)`, "Text", null);
      bloc.colonne = await creerColonne(courant.table, texte, "Attachments", null, formulePiecesJointes(envoi));
      bloc.reglages = { libelle: texte };
    } else {
      bloc.genre = "question";
      const opts = type.choix ? { choices: type.choix, choiceOptions: {} } : null;
      bloc.colonne = await creerColonne(courant.table, texte, type.type, opts);
      bloc.reglages = { libelle: texte, ...(type.reglages || {}) };
    }
    blocs().splice(Math.min(ctx.index, blocs().length), 0, bloc);
    choisi = bloc.id;
    sauver();
    dessinerApercu();
    dessinerPanneau();
    // question tableau : sa table reçoit tout de suite les règles d'accès du socle (une fois le brouillon enregistré)
    if (bloc.reglages && bloc.reglages.tableau && bloc.reglages.tableau.table)
      reglesApresTableau(bloc.reglages.tableau.table);
    const element = document.querySelector(`[data-bloc="${bloc.id}"]`);
    if (element) {
      element.scrollIntoView({ block: "center" });
    }
    if (type.choix || type.cle === "tableau") {
      const champ = $("panneau").querySelector(type.choix ? ".choix-edit input[type=text]" : "#sc-nouveau-lib");
      if (champ) champ.focus();
    } else {
      const champ = $("pa-libelle");
      if (champ) champ.focus();
    }
  }
  // Donnée de la fiche établissement : colonne formule « $Etablissement.Colonne » dans la table des réponses
  function etapeEtablissement() {
    const menu = $("menu-ajout"),
      tableEtablissement = tableEtablissements(),
      cols = colonnesEtabProposees(tableEtablissement);
    const deja = new Set(
      blocs()
        .filter((bloc) => bloc.genre === "question" && meta[bloc.colonne])
        .map((bloc) => sourceColonneEtablissement(meta[bloc.colonne]))
        .filter(Boolean),
    );
    menu.innerHTML = `<h4>Donnée de la fiche établissement</h4><form class="etape2" id="form-etape2">
    <label for="e2-col">Information de la fiche<span class="aide">Table ${esc(tableEtablissement)}, à laquelle renvoie la colonne Etablissement.</span></label>
    <select id="e2-col">${cols.map((colonne) => `<option value="${esc(colonne.colId)}">${esc(colonne.libelle)}${colonne.libelle !== colonne.colId ? ` (${esc(colonne.colId)})` : ""}${deja.has(colonne.colId) ? " — déjà dans le formulaire" : ""}</option>`).join("")}</select>
    <label for="e2-texte">Intitulé affiché dans le formulaire</label><input type="text" id="e2-texte" required autocomplete="off">
    <p class="note" style="margin:0 0 6px">Une colonne formule <code>$${esc(colonneEtablissement())}.…</code> sera créée dans la table ${esc(courant.table)} : la valeur s'affiche dès que l'établissement est choisi, sans saisie, et peut entrer dans la description automatique.</p>
    <p class="statut err" id="e2-erreur" role="alert"></p>
    <div class="actions-menu"><button type="button" class="secondaire" data-menu="annuler">Annuler</button><button type="submit" class="primaire"${cols.length ? "" : " disabled"}>Ajouter</button></div></form>`;
    placerMenu(menuContextuel.ancre);
    const sel = $("e2-col"),
      champ = $("e2-texte");
    const remplir = () => {
      if (!champ.dataset.touche)
        champ.value = (cols.find((colonne) => colonne.colId === sel.value) || {}).libelle || "";
    };
    remplir();
    sel.focus();
    sel.addEventListener("change", remplir);
    champ.addEventListener("input", () => {
      champ.dataset.touche = "1";
    });
    $("form-etape2").addEventListener("submit", async (evenement) => {
      evenement.preventDefault();
      const texte = champ.value.trim();
      if (!texte || !sel.value) return;
      const btn = menu.querySelector("button[type=submit]");
      btn.disabled = true;
      try {
        await ajouterBlocEtablissement(sel.value, texte);
        fermerMenu();
      } catch (erreur) {
        $("e2-erreur").textContent = `Échec : ${erreur.message || erreur}`;
        btn.disabled = false;
      }
    });
  }
  async function ajouterBlocEtablissement(src, texte) {
    const ctx = menuContextuel,
      colonneSource = colonnesDe(tableEtablissements())[src] || {};
    const opts = ["Choice", "ChoiceList"].includes(typeBase(colonneSource.type)) ? colonneSource.opts : null;
    const colId = await creerColonne(
      courant.table,
      texte,
      colonneSource.type || "Any",
      opts,
      `$${colonneEtablissement()}.${src}`,
    );
    const bloc = {
      id: nouvelId(),
      section: ctx.section,
      genre: "question",
      colonne: colId,
      reglages: { libelle: texte },
    };
    blocs().splice(Math.min(ctx.index, blocs().length), 0, bloc);
    choisi = bloc.id;
    sauver();
    dessinerApercu();
    dessinerPanneau();
    // question tableau : sa table reçoit tout de suite les règles d'accès du socle (une fois le brouillon enregistré)
    if (bloc.reglages && bloc.reglages.tableau && bloc.reglages.tableau.table)
      reglesApresTableau(bloc.reglages.tableau.table);
    const element = document.querySelector(`[data-bloc="${bloc.id}"]`);
    if (element) element.scrollIntoView({ block: "center" });
  }
  function etapeExistantes() {
    const menu = $("menu-ajout");
    const pris = new Set(
      blocs()
        .filter((bloc) => bloc.genre === "question")
        .map((bloc) => bloc.colonne),
    );
    const deRole = new Set(Object.values(rolesEffectifs()).filter(Boolean));
    const communs = {
      test: (id) =>
        deRole.has(id) ||
        /^(Etablissement|Description|Qualification|Date|Date_faits|Dossier|Nature|Commentaire|Auteur|Site|Clos)$/.test(
          id,
        ),
    };
    const libres = Object.values(meta)
      .filter(
        (colonne) =>
          !pris.has(colonne.colId) && colonne.colId !== "id" && !(communsActifs() && communs.test(colonne.colId)),
      )
      .sort((colonneA, colonneB) => colonneA.pos - colonneB.pos);
    menu.innerHTML = `<h4>Colonnes existantes de ${esc(courant.table)}</h4>
    ${
      libres.length
        ? `<div class="liste-existantes">${libres.map((colonne) => `<label><input type="checkbox" value="${esc(colonne.colId)}"${communs.test(colonne.colId) || colonne.formule ? "" : ""}> ${esc(colonne.libelle)} <small>${esc(typeBase(colonne.type))}${colonne.formule ? ", formule" : ""}${communs.test(colonne.colId) ? ", champ commun" : ""}</small></label>`).join("")}</div>
    <p class="note" style="margin:0 0 6px">Les repères déjà écrits dans leur description ([si …], *, [couleur]…) sont repris dans les réglages.</p>`
        : `<p class="note">Toutes les colonnes sont déjà dans le formulaire.</p>`
    }
    <div class="actions-menu"><button type="button" class="secondaire" data-menu="annuler">Annuler</button>${libres.length ? `<button type="button" class="primaire" id="btn-ajout-existantes">Ajouter</button>` : ""}</div>`;
    placerMenu(menuContextuel.ancre);
    const bouton = $("btn-ajout-existantes");
    if (bouton)
      bouton.addEventListener("click", () => {
        const ids = [...menu.querySelectorAll("input:checked")].map((caseACocher) => caseACocher.value);
        ajouterExistantes(ids, menuContextuel.section, menuContextuel.index);
        fermerMenu();
      });
  }
  function blocDepuisColonne(colonne, section) {
    const reperes = lireReperes(colonne.description);
    return {
      id: nouvelId(),
      genre: "question",
      section,
      colonne: colonne.colId,
      reglages: { libelle: colonne.libelle, ...reperes },
    };
  }
  function ajouterExistantes(ids, section, index) {
    const nouveaux = ids
      .map((id) => meta[id])
      .filter(Boolean)
      .map((colonne) => blocDepuisColonne(colonne, section));
    blocs().splice(Math.min(index, blocs().length), 0, ...nouveaux);
    if (nouveaux[0]) choisi = nouveaux[0].id;
    sauver();
    dessinerApercu();
    dessinerPanneau();
  }

  /* =========================================================
   Panneau de réglages
   ========================================================= */
  // Panneau de droite ; quand un élément est choisi, un lien ramène aux réglages du formulaire
  function dessinerPanneau() {
    dessinerPanneauBase();
    if (modeTest || !courant || !choisi) return;
    const panneau = $("panneau");
    if (!panneau.firstElementChild || panneau.querySelector("#pn-retour")) return;
    panneau.insertAdjacentHTML(
      "afterbegin",
      `<button type="button" class="lien-retour" id="pn-retour">← Réglages du formulaire</button>`,
    );
    $("pn-retour").addEventListener("click", () => choisir(null));
  }
  // Échap : retour aux réglages du formulaire (sauf dans un champ de saisie ou un menu ouvert)
  document.addEventListener("keydown", (evenement) => {
    if (evenement.key !== "Escape" || !choisi || modeTest || $("formulaires").hidden || !$("menu-ajout").hidden) return;
    if (evenement.target.closest && evenement.target.closest("input, select, textarea, dialog")) return;
    choisir(null);
  });
  function dessinerPanneauBase() {
    const panneau = $("panneau");
    if (modeTest) return dessinerPanneauTest();
    const bloc = blocDe(choisi);
    if (!courant) {
      panneau.innerHTML = "";
      return;
    }
    if (String(choisi).startsWith("partie:")) return panneauPartie(partieDe(choisi.slice(7)));
    if (String(choisi).startsWith("commun:")) return panneauCommun(choisi.slice(7));
    if (!bloc) {
      panneau.innerHTML = `<h2>${esc(courant.nom)}</h2><p class="sous">table ${esc(courant.table)}${courant.publieLe ? ` · publié le ${Outils.dates.dateHeure(courant.publieLe, { dateStyle: "short", timeStyle: "short" })}` : " · jamais publié"}</p>
      <div class="vide-panneau"><p>Cliquez sur une question de l'aperçu pour la régler.</p><ul>
        <li>« + Ajouter une question » apparaît au survol, entre deux blocs.</li>
        <li>Glissez un bloc par sa poignée ⋮⋮ pour le déplacer (ou Alt + ↑ / ↓ au clavier).</li>
        <li>Les modifications sont enregistrées en brouillon : les formulaires des pages ne changent qu'au clic sur « Publier ».</li></ul></div>
      <div class="groupe"><div class="t">Formulaire</div><label class="l" for="pf-nom">Nom</label><input type="text" id="pf-nom" value="${esc(courant.nom)}">
      <button type="button" class="danger" id="pf-supprimer">Supprimer ce formulaire…</button></div>${groupeVersionHtml()}${groupePageHtml()}${groupeColonnesHtml()}`;
      lierVersion(panneau);
      lierPages(panneau);
      panneau
        .querySelectorAll("[data-ajout-col]")
        .forEach((bouton) => bouton.addEventListener("click", () => ajouterColonneService(bouton.dataset.ajoutCol)));
      lierRoles(panneau);
      $("pf-nom").addEventListener("change", async () => {
        const nouveauNom = $("pf-nom").value.trim();
        if (!nouveauNom) return;
        try {
          await actions([["UpdateRecord", TABLE_FORMULAIRES, courant.id, { Nom: nouveauNom }]]);
          courant.nom = nouveauNom;
          const formulaire = formulaires.find((candidat) => candidat.id === courant.id);
          if (formulaire) formulaire.nom = nouveauNom;
          remplirChoixFormulaire();
          message(
            "Nom enregistré. Les pages qui avaient choisi ce formulaire par son nom devront le choisir à nouveau.",
            "ok",
          );
        } catch (erreur) {
          message(`Nom non enregistré : ${erreur.message || erreur}`, "err");
        }
      });
      $("pf-supprimer").addEventListener("click", supprimerFormulaire);
      return;
    }
    if (bloc.genre !== "question") return panneauDecor(bloc);
    const colonne = meta[bloc.colonne],
      reglages = (bloc.reglages = bloc.reglages || {});
    if (colonne && colonne.formule) return panneauFormule(bloc, colonne);
    if (!colonne) {
      panneau.innerHTML = `<h2>Colonne absente</h2><p class="avert">La colonne « ${esc(bloc.colonne)} » n'existe plus dans la table.</p><div class="pied-panneau"><button type="button" class="danger" id="pa-retirer">Retirer du formulaire</button></div>`;
      $("pa-retirer").addEventListener("click", () => retirerBloc(bloc));
      return;
    }
    const type = typeBase(colonne.type);
    const choixPossibles = (type === "Choice" || type === "ChoiceList") && !reglages.tableau;
    const nombre = type === "Int" || type === "Numeric";
    panneau.innerHTML = `<h2>${esc(reglages.libelle || colonne.libelle)}</h2><p class="sous">${esc(typeAffiche(bloc))} · <span id="pa-nb-rep">…</span></p>
    <label class="l" for="pa-libelle">Libellé</label><input type="text" id="pa-libelle" value="${esc(reglages.libelle || colonne.libelle)}">
    <label class="l" for="pa-aide">Aide affichée sous la question</label><textarea id="pa-aide">${esc(reglages.aide || "")}</textarea>
    <span class="ident" title="Identifiant de la colonne dans Grist, fixé à la création">colonne : ${esc(colonne.colId)}</span>
    <label class="l" for="pa-section" style="margin-top:8px">Partie du formulaire</label>
    <select id="pa-section">${optionsParties(bloc.section)}</select>

    <div class="groupe"><div class="t">Saisie</div>
      ${!reglages.tableau ? `<label class="interrupteur">Réponse obligatoire <input type="checkbox" id="pa-oblig"${reglages.obligatoire ? " checked" : ""}></label>` : `<label class="interrupteur">Au moins une ligne obligatoire <input type="checkbox" id="pa-oblig"${reglages.obligatoire ? " checked" : ""}></label>`}
      ${type === "Text" && !reglages.tableau ? `<label class="l">Zone de saisie</label><div class="seg2" role="group"><button type="button" data-court="1" aria-pressed="${!!reglages.court}">Une ligne</button><button type="button" data-court="0" aria-pressed="${!reglages.court}">Plusieurs lignes</button></div>` : ""}
      ${
        nombre
          ? `<label class="l">Type de nombre</label><div class="seg2" role="group"><button type="button" data-num="Int" aria-pressed="${type === "Int"}">Entier</button><button type="button" data-num="Numeric" aria-pressed="${type === "Numeric"}">Décimal</button></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div><label class="l" for="pa-min">Minimum</label><input type="number" id="pa-min" value="${reglages.min ?? ""}" placeholder="aucun"></div><div><label class="l" for="pa-max">Maximum</label><input type="number" id="pa-max" value="${reglages.max ?? ""}" placeholder="aucun"></div></div>`
          : ""
      }
      ${type === "Choice" ? `<label class="l" for="pa-affichage">Affichage</label><select id="pa-affichage"><option value="">Automatique (boutons jusqu'à 5 choix)</option><option value="boutons"${reglages.affichage === "boutons" ? " selected" : ""}>Boutons</option><option value="liste"${reglages.affichage === "liste" ? " selected" : ""}>Liste déroulante</option></select>` : ""}
      ${type === "Bool" ? `<label class="l" for="pa-affichage">Affichage</label><select id="pa-affichage"><option value="">Boutons Oui / Non</option><option value="case"${reglages.affichage === "case" ? " selected" : ""}>Case à cocher</option></select>` : ""}
    </div>
    ${
      choixPossibles
        ? `<div class="groupe"><div class="t">Choix proposés</div><div id="pa-choix"></div><button type="button" class="ajout-lien" id="pa-ajout-choix">+ Ajouter un choix</button>
      <p class="note" style="margin:6px 0 0">Les choix et leurs couleurs sont enregistrés tout de suite dans la colonne Grist. Renommer un choix met à jour les réponses déjà saisies.</p></div>`
        : ""
    }
    ${
      reglages.tableau
        ? `<div class="groupe"><div class="t">Table des lignes</div>
      <div class="ligne-sc"><input type="text" id="pa-table-nom" value="${esc(reglages.tableau.table)}" aria-label="Nom de la table des lignes" style="flex:1">
        <button type="button" class="secondaire petit" id="pa-table-renommer">Renommer la table</button></div>
      <p class="note" style="margin:4px 0 0">Renomme la table dans Grist (lignes, références et formules suivent) et dans tous les formulaires qui l'utilisent, brouillons et versions publiées.</p></div>
      <div class="groupe"><div class="t">Champs de chaque ligne (table ${esc(reglages.tableau.table)})</div><div id="pa-sous"></div>
      <div class="sous-col"><div class="ligne-sc"><input type="text" id="sc-nouveau-lib" placeholder="Nouveau champ (ex. Fonction)"><select id="sc-nouveau-type" style="width:auto;margin:0">
        <option value="Choice">Choix unique</option><option value="ChoiceList">Choix multiple</option><option value="Text">Texte</option><option value="Int">Nombre</option><option value="Bool">Oui / Non</option><option value="Date">Date</option></select>
        <button type="button" class="secondaire petit" id="sc-ajouter">Ajouter</button></div></div>
      <label class="l" for="pa-lignes">Nombre de lignes fixé par</label><select id="pa-lignes"><option value="">— (lignes ajoutées à la main)</option>${blocs()
        .filter(
          (bloc) =>
            bloc.genre === "question" &&
            meta[bloc.colonne] &&
            ["Int", "Numeric"].includes(typeBase(meta[bloc.colonne].type)),
        )
        .map(
          (bloc) =>
            `<option value="${esc(bloc.colonne)}"${reglages.tableau.lignes === bloc.colonne ? " selected" : ""}>${esc(libelleQuestion(bloc.colonne))}</option>`,
        )
        .join("")}</select></div>`
        : ""
    }

    ${reglages.tableau ? groupeSitesHtml(bloc) : ""}
    ${
      type === "Attachments"
        ? `<div class="groupe"><div class="t">Pièces jointes</div>${
            colonne && colonne.pjEnvoi
              ? `<p class="note" style="margin:0">Utilisable par tous, liens d'établissement compris : le formulaire écrit dans la colonne « ${esc((meta[colonne.pjEnvoi] || {}).libelle || colonne.pjEnvoi)} » et ne sont retenus que les fichiers qu'il a envoyés (empreinte vérifiée).</p>`
              : `<p class="note" style="margin:0 0 6px">Les liens d'établissement ne peuvent pas joindre de fichier à cette question (Grist : « cannot access attachment »).</p><button type="button" class="secondaire petit" id="pa-pj-adapter">Rendre utilisable par les liens d'établissement</button>`
          }</div>`
        : ""
    }
    <div class="groupe"><div class="t">Affichage conditionnel</div><div id="pa-condition"></div></div>
    ${!reglages.tableau && type !== "Text" && type !== "Ref" && type !== "RefList" && type !== "Attachments" ? `<div class="groupe"><div class="t">Couleur du formulaire</div><div id="pa-couleur"></div></div>` : ""}
    <div class="groupe"><div class="t">Données et diffusion</div>
      <label class="interrupteur">Confidentiel (exclu de la description automatique) <input type="checkbox" id="pa-conf"${reglages.confidentiel ? " checked" : ""}></label>
      <label class="l" for="pa-format">Dans la description automatique</label>
      <select id="pa-format">${choixFormatQuestion(bloc)
        .map(
          ([valeur, libelle]) =>
            `<option value="${valeur}"${(reglages.format || "defaut") === valeur ? " selected" : ""}>${libelle}</option>`,
        )
        .join("")}</select>
    </div>
    <div class="pied-panneau"><button type="button" class="danger" id="pa-retirer">Retirer du formulaire</button><button type="button" class="danger" id="pa-supprimer" disabled>Supprimer la colonne…</button></div>`;
    // champs simples
    const lier = (id, evenement, ecouteur) => {
      const element = $(id);
      if (element) element.addEventListener(evenement, ecouteur);
    };
    lier("pa-libelle", "input", (evenement) => {
      reglages.libelle = evenement.target.value;
      panneau.querySelector("h2").textContent = evenement.target.value || colonne.libelle;
      majBloc(bloc);
      sauver();
    });
    lier("pa-aide", "input", (evenement) => {
      reglages.aide = evenement.target.value.trim();
      majBloc(bloc);
      sauver();
    });
    lier("pa-section", "change", (evenement) => {
      deplacer(bloc.id, blocs().length, evenement.target.value);
      choisir(bloc.id);
    });
    lier("pa-oblig", "change", (evenement) => {
      reglages.obligatoire = evenement.target.checked;
      majBloc(bloc);
      sauver();
    });
    lier("pa-conf", "change", (evenement) => {
      reglages.confidentiel = evenement.target.checked;
      majBloc(bloc);
      sauver();
    });
    lier("pa-format", "change", (evenement) => {
      reglages.format = evenement.target.value === "defaut" ? undefined : evenement.target.value;
      sauver();
    });
    lier("pa-affichage", "change", (evenement) => {
      reglages.affichage = evenement.target.value || undefined;
      majBloc(bloc);
      sauver();
    });
    lier("pa-min", "input", (evenement) => {
      reglages.min = evenement.target.value === "" ? undefined : parseFloat(evenement.target.value);
      sauver();
    });
    lier("pa-max", "input", (evenement) => {
      reglages.max = evenement.target.value === "" ? undefined : parseFloat(evenement.target.value);
      sauver();
    });
    lier("pa-lignes", "change", (evenement) => {
      reglages.tableau.lignes = evenement.target.value || null;
      majBloc(bloc);
      sauver();
    });
    lier("pa-table-renommer", "click", () => renommerTableTableau(bloc, $("pa-table-nom").value));
    lier("pa-pj-adapter", "click", () => adapterPiecesJointes(bloc));
    lier("pa-table-nom", "keydown", (evenement) => {
      if (evenement.key === "Enter") {
        evenement.preventDefault();
        renommerTableTableau(bloc, evenement.target.value);
      }
    });
    panneau.querySelectorAll("[data-court]").forEach((bouton) =>
      bouton.addEventListener("click", () => {
        reglages.court = bouton.dataset.court === "1";
        dessinerPanneau();
        majBloc(bloc);
        sauver();
      }),
    );
    panneau
      .querySelectorAll("[data-num]")
      .forEach((bouton) => bouton.addEventListener("click", () => changerTypeNombre(bloc, bouton.dataset.num)));
    lier("pa-retirer", "click", () => retirerBloc(bloc));
    lier("pa-supprimer", "click", () => supprimerColonne(bloc));
    if (choixPossibles) dessinerChoix(bloc);
    if (reglages.tableau) {
      dessinerSousColonnes(bloc);
      lierSites(bloc);
    }
    dessinerCondition(bloc);
    if ($("pa-couleur")) dessinerCouleur(bloc);
    compterReponses(bloc);
  }
  /* ---------- Tableau des sites (formulaire par site, enseignement supérieur) ----------
   reglages.tableau.sites = { site, libre, qualif, historique: [{ colonne, libre, site, qualif }], alias, avecRas, reprise } :
   une ligne par site ; reprise du dernier état connu de chaque site (reprise : "non" par défaut, "bouton" ou "auto") ; qualification de l'établissement déduite du
   site le plus grave (conf.saisie.qualificationEnBas). Voir le widget de saisie. */
  // reprise du dernier état des sites : "auto" (ancien réglage true), "bouton" (à la demande), "non" (par défaut)
  const modeReprise = (reglagesSites) =>
    reglagesSites && (reglagesSites.reprise === true || reglagesSites.reprise === "auto")
      ? "auto"
      : reglagesSites && reglagesSites.reprise === "bouton"
        ? "bouton"
        : "non";
  function groupeSitesHtml(bloc) {
    const reglages = bloc.reglages,
      reglagesSites = reglages.tableau.sites,
      cols = Object.values(colonnesDe(reglages.tableau.table)).filter(
        (colonne) =>
          !colonne.formule && !RESERVES_TABLEAU.includes(colonne.colId) && colonne.type !== `Ref:${courant.table}`,
      );
    const opt = (filtre, sel) =>
      `<option value="">—</option>${cols
        .filter(filtre)
        .map(
          (colonne) =>
            `<option value="${esc(colonne.colId)}"${sel === colonne.colId ? " selected" : ""}>${esc(colonne.libelle)}</option>`,
        )
        .join("")}`;
    const historique = (reglagesSites && reglagesSites.historique && reglagesSites.historique[0]) || {};
    const autres = Object.values(meta).filter(
      (colonne) =>
        /^Text/.test(colonne.type) &&
        colonne.colId !== bloc.colonne &&
        !blocs().some((autreBloc) => autreBloc.colonne === colonne.colId && autreBloc.id === bloc.id),
    );
    return `<div class="groupe"><div class="t">Tableau des sites</div>
    <label class="interrupteur">Une ligne par site (formulaire par site) <input type="checkbox" id="pa-sites"${reglagesSites ? " checked" : ""}></label>
    ${
      reglagesSites &&
      (!reglagesSites.site || !/^Ref:/.test((colonnesDe(reglages.tableau.table)[reglagesSites.site] || {}).type || ""))
        ? (() => {
            const referentielSites = referentielSitesDuFormulaire();
            return referentielSites
              ? `<p class="note" style="margin:6px 0">Ce tableau n'a pas de colonne qui renvoie vers le référentiel des sites : les sites ne sont reconnus que par leur nom saisi. <button type="button" class="secondaire petit" id="pa-site-relier">Relier au référentiel des sites</button><br><span class="aide">Ajoute à ${esc(reglages.tableau.table)} une colonne « Site » (liste des sites de l'établissement, table ${esc(referentielSites)}) ; la colonne de texte reste pour les sites hors référentiel. Les noms déjà saisis se rattachent ensuite dans l'onglet Référentiel (« Compléter les saisies »).</span></p>`
              : `<p class="note" style="margin:6px 0">Aucun référentiel des sites dans le document : importez le classeur du référentiel ESR (onglet Référentiel) pour proposer la liste des sites de chaque établissement.</p>`;
          })()
        : ""
    }
    ${
      reglagesSites &&
      reglagesSites.site &&
      /^Ref:/.test((colonnesDe(reglages.tableau.table)[reglagesSites.site] || {}).type || "") &&
      !reglagesSites.libre
        ? `<p class="note" style="margin:6px 0">Les agents ne peuvent choisir qu'un site de la liste. <button type="button" class="secondaire petit" id="pa-site-libre-creer">Accepter les noms hors référentiel</button><br><span class="aide">Ajoute à ${esc(reglages.tableau.table)} une colonne « Site hors référentiel » : dans le formulaire, le champ du site propose la liste (recherche par nom et par mots-clés) et accepte un nom tapé librement.</span></p>`
        : ""
    }
    ${
      reglagesSites
        ? `<label class="l" for="pa-site-ref">Site (référentiel des sites)</label><select id="pa-site-ref">${opt((colonne) => /^(Ref|Text)/.test(colonne.type), reglagesSites.site)}</select>
      <label class="l" for="pa-site-libre">Site hors référentiel (texte libre)</label><select id="pa-site-libre">${opt((colonne) => /^Text/.test(colonne.type), reglagesSites.libre)}</select>
      <label class="l" for="pa-site-qualif">Qualification du site</label><select id="pa-site-qualif">${opt((colonne) => /^Choice/.test(colonne.type), reglagesSites.qualif)}</select>
      <label class="l" for="pa-site-hist">Reprendre aussi l'historique de la question</label><select id="pa-site-hist"><option value="">— (aucune)</option>${autres.map((colonne) => `<option value="${esc(colonne.colId)}"${historique.colonne === colonne.colId ? " selected" : ""}>${esc(libelleQuestion(colonne.colId))}</option>`).join("")}</select>
      ${historique.colonne ? `<div class="ligne-sc"><input type="text" id="pa-site-hist-libre" value="${esc(historique.libre || "")}" placeholder="champ du nom (ex. Nom_du_site)" style="flex:1"><input type="text" id="pa-site-hist-qualif" value="${esc(historique.qualif || "")}" placeholder="champ de qualification" style="flex:1"></div>` : ""}
      <label class="l" for="pa-site-alias">Table des correspondances (libellé saisi → site)</label><input type="text" id="pa-site-alias" value="${esc(reglagesSites.alias || "Sites_correspondances")}">
      <label class="l" for="pa-site-reprise">Nouveau dossier : reprise du dernier état des sites déjà signalés pour l'établissement</label>
      <select id="pa-site-reprise">${[
        ["non", "désactivée : le tableau part vide"],
        ["bouton", "à la demande : bouton « Reprendre leur dernier état »"],
        ["auto", "automatique : une ligne par site connu dès l'établissement choisi"],
      ]
        .map(
          ([valeur, libelle]) =>
            `<option value="${valeur}"${modeReprise(reglagesSites) === valeur ? " selected" : ""}>${libelle}</option>`,
        )
        .join("")}</select>
      ${modeReprise(reglagesSites) !== "non" ? `<label class="interrupteur">Reprise : une ligne par site connu, y compris ceux revenus à la normale <input type="checkbox" id="pa-site-ras"${reglagesSites.avecRas !== false ? " checked" : ""}></label>` : ""}
      <label class="interrupteur">Qualification de l'établissement en bas, déduite du site le plus grave <input type="checkbox" id="pa-qualif-bas"${confSaisie().qualificationEnBas !== false ? " checked" : ""}></label>
      ${controleSitesHtml(bloc)}
      <p class="note" style="margin:6px 0 0">${
        modeReprise(reglagesSites) === "non"
          ? "Nouveau dossier : le tableau des sites part vide, l'agent saisit les sites concernés ce jour-là (la reprise d'un signalement précédent ne reprend pas les sites)."
          : modeReprise(reglagesSites) === "auto"
            ? "Nouveau dossier : dès l'établissement choisi, le tableau se remplit d'une ligne par site déjà signalé, à son dernier état (toutes les versions précédentes de l'établissement et la question d'historique choisie) ; l'agent confirme ou modifie chaque site encore perturbé et ajoute les nouveaux."
            : "Nouveau dossier : le tableau des sites part vide ; si l'établissement a déjà des sites signalés, un bouton « Reprendre leur dernier état » le remplit à la demande (toutes les versions précédentes de l'établissement et la question d'historique choisie)."
      } La qualification de l'établissement suit le site le plus grave (ordre des choix de Qualification, du plus grave au moins grave) ; une incohérence est signalée avant l'enregistrement.</p>`
        : ""
    }
  </div>`;
  }
  /* Contrôle du paramétrage du tableau des sites : chaque point attendu, vérifié sur la structure du document.
   Le widget de saisie filtre les sites par établissement quand la colonne du site renvoie vers une table des sites
   dont une colonne renvoie vers le référentiel des établissements visé par la colonne Établissement du formulaire. */
  function controleSitesHtml(bloc) {
    const reglages = bloc.reglages,
      reglagesSites = reglages.tableau.sites,
      identifiantTable = reglages.tableau.table,
      cols = colonnesDe(identifiantTable),
      etab = tableEtablissements() || referentielDe(courant.table);
    const verifs = [],
      ajouterVerification = (etat, txt) => verifs.push({ etat, txt });
    const versEtab = (tid) =>
      Object.values(colonnesDe(tid) || {})
        .filter((colonne) => /^Ref:/.test(colonne.type) && colonne.type !== `Ref:${courant.table}`)
        .map((colonne) => window.Socle.cibleRef(colonne.type));
    ajouterVerification(
      etab ? "ok" : "err",
      etab
        ? `Établissement du formulaire : référentiel « ${etab} » (colonne Établissement de ${courant.table}).`
        : `La colonne Établissement de ${courant.table} n'est pas une référence vers un référentiel des établissements.`,
    );
    ajouterVerification(
      Object.keys(cols).length ? "ok" : "err",
      Object.keys(cols).length
        ? `Sous-table « ${identifiantTable} »${cols.Dossier ? "" : " — colonne Dossier absente"}.`
        : `Sous-table « ${identifiantTable} » introuvable.`,
    );
    const colonneSite = reglagesSites.site && cols[reglagesSites.site],
      cible = colonneSite && window.Socle.cibleRef(colonneSite.type);
    if (!colonneSite) ajouterVerification("err", "Aucune colonne du site choisie (« Site (référentiel des sites) »).");
    else if (!cible)
      ajouterVerification(
        "err",
        `Colonne du site « ${colonneSite.libelle} » : colonne de texte, sans liste de sites. Utilisez « Relier au référentiel des sites ».`,
      );
    else if (!colonnesDe(cible) || !Object.keys(colonnesDe(cible)).length)
      ajouterVerification(
        "err",
        `Colonne du site « ${colonneSite.libelle} » : elle renvoie vers « ${cible} », table introuvable.`,
      );
    else if (etab && !versEtab(cible).includes(etab))
      ajouterVerification(
        "err",
        `Colonne du site « ${colonneSite.libelle} » : elle renvoie vers « ${cible} », dont aucune colonne ne renvoie vers « ${etab} »${versEtab(cible).length ? ` (elle renvoie vers « ${versEtab(cible).join(" », « ")} »)` : ""} : les sites ne peuvent pas être filtrés par établissement, le formulaire les propose tous. Réimportez le classeur ESR vers « ${etab} », ou changez la référence de la colonne Etablissement de « ${cible} » dans Grist.`,
      );
    else
      ajouterVerification(
        "ok",
        `Colonne du site « ${colonneSite.libelle} » → table « ${cible} », reliée à « ${etab} » : seuls les sites de l'établissement sont proposés, avec recherche par nom, mot-clé et commune.`,
      );
    const colonneLibre = reglagesSites.libre && cols[reglagesSites.libre];
    ajouterVerification(
      colonneLibre && /^Text/.test(colonneLibre.type) ? "ok" : "warn",
      colonneLibre && /^Text/.test(colonneLibre.type)
        ? `Site hors référentiel : « ${colonneLibre.libelle} » (un nom absent de la liste est accepté, dans le même champ).`
        : "Pas de colonne hors référentiel : seuls les sites de la liste sont acceptés (bouton « Accepter les noms hors référentiel »).",
    );
    const colonneQualif = reglagesSites.qualif && cols[reglagesSites.qualif];
    ajouterVerification(
      colonneQualif && /^Choice/.test(colonneQualif.type) ? "ok" : "err",
      colonneQualif && /^Choice/.test(colonneQualif.type)
        ? `Qualification du site : « ${colonneQualif.libelle} » (${((colonneQualif.opts || {}).choices || []).join(", ") || "choix à définir"}).`
        : "Aucune colonne de qualification du site (type Choix).",
    );
    const doubles = Object.values(cols).filter(
      (colonne) =>
        colonne.colId !== reglagesSites.site &&
        /^Ref:/.test(colonne.type) &&
        window.Socle.cibleRef(colonne.type) !== courant.table &&
        etab &&
        versEtab(window.Socle.cibleRef(colonne.type)).includes(etab),
    );
    if (doubles.length)
      ajouterVerification(
        "warn",
        `Colonne${doubles.length > 1 ? "s" : ""} ${doubles.map((colonne) => (colonne.libelle !== colonne.colId ? `« ${colonne.libelle} » (${colonne.colId})` : `« ${colonne.colId} »`)).join(", ")} : elle désigne aussi un site, en double ; le formulaire l'écarte. Supprimez-la dans Grist si elle ne sert pas.`,
      );
    const nombreDifferences = differences();
    ajouterVerification(
      !courant.publie ? "err" : nombreDifferences ? "warn" : "ok",
      !courant.publie
        ? "Formulaire jamais publié : cliquez sur « Publier »."
        : nombreDifferences
          ? `${nombreDifferences} modification${nombreDifferences > 1 ? "s" : ""} non publiée${nombreDifferences > 1 ? "s" : ""} : cliquez sur « Publier » pour que le formulaire en tienne compte.`
          : "Formulaire publié, à jour.",
    );
    const icones = { ok: "✓", warn: "!", err: "✗" },
      coul = { ok: "var(--ok, #18753c)", warn: "var(--warn, #b34000)", err: "var(--err, #b42318)" };
    return `<div class="controle-sites" style="margin:8px 0;padding:6px 8px;border:1px solid var(--trait, #ddd);border-radius:4px"><div style="font-weight:600;margin-bottom:4px">Contrôle du paramétrage</div>
    <ul style="list-style:none;margin:0;padding:0;font-size:12px">${verifs.map((verif) => `<li style="margin:3px 0;display:flex;gap:6px"><span style="color:${coul[verif.etat]};font-weight:700;min-width:12px" aria-label="${verif.etat === "ok" ? "correct" : verif.etat === "warn" ? "à vérifier" : "à corriger"}">${icones[verif.etat]}</span><span>${esc(verif.txt)}</span></li>`).join("")}</ul></div>`;
  }
  // Référentiel des sites du formulaire : table « …site… » qui renvoie vers le référentiel des établissements (import ESR, modèle par site)
  function referentielSitesDuFormulaire() {
    const etab = tableEtablissements() || referentielDe(courant.table);
    if (!etab) return null;
    return (
      metaTables[0].tableId.find(
        (identifiantTable) =>
          /site/i.test(identifiantTable) &&
          !/signal|correspond/i.test(identifiantTable) &&
          Object.values(colonnesDe(identifiantTable)).some((colonne) => colonne.type === `Ref:${etab}`) &&
          !Object.values(colonnesDe(identifiantTable)).some((colonne) => colonne.type === `Ref:${courant.table}`),
      ) || null
    );
  }
  function lierSites(bloc) {
    const reglages = bloc.reglages,
      maj = () => {
        majBloc(bloc);
        sauver();
      };
    const lib = $("pa-site-libre-creer");
    if (lib)
      lib.addEventListener("click", async () => {
        const identifiantTable = reglages.tableau.table;
        if (!reglages.tableau.sites) return;
        lib.disabled = true;
        try {
          const id = identifiant("Site_libre", Object.keys(colonnesDe(identifiantTable)));
          await actions([
            [
              "AddColumn",
              identifiantTable,
              id,
              { type: "Text", isFormula: false, label: "Site hors référentiel", untieColIdFromLabel: true },
            ],
          ]);
          await lireMeta();
          reglages.tableau.sites.libre = id;
          maj();
          dessinerPanneau();
          message(
            `Colonne « ${id} » ajoutée à ${identifiantTable} : le champ du site accepte maintenant un nom hors référentiel. Publiez le formulaire.`,
            "ok",
          );
          reglesApresTableau(identifiantTable);
        } catch (erreur) {
          lib.disabled = false;
          message(`Échec : ${erreur.message || erreur}`, "err");
        }
      });
    const rel = $("pa-site-relier");
    if (rel)
      rel.addEventListener("click", async () => {
        const referentielSites = referentielSitesDuFormulaire(),
          identifiantTable = reglages.tableau.table;
        if (!referentielSites || !reglages.tableau.sites) return;
        rel.disabled = true;
        try {
          const id = identifiant("Site", Object.keys(colonnesDe(identifiantTable)));
          await actions([
            [
              "AddColumn",
              identifiantTable,
              id,
              { type: `Ref:${referentielSites}`, isFormula: false, label: "Site", untieColIdFromLabel: true },
            ],
          ]);
          await lireMeta();
          const avant = reglages.tableau.sites.site; // ancienne colonne du site en texte : devient la colonne « hors référentiel »
          if (avant && !reglages.tableau.sites.libre) reglages.tableau.sites.libre = avant;
          reglages.tableau.sites.site = id;
          maj();
          dessinerPanneau();
          message(
            `Colonne « ${id} » ajoutée à ${identifiantTable} (référence vers ${referentielSites}). Publiez le formulaire pour proposer la liste des sites.`,
            "ok",
          );
          reglesApresTableau(identifiantTable);
        } catch (erreur) {
          rel.disabled = false;
          message(`Échec : ${erreur.message || erreur}`, "err");
        }
      });
    const deviner = () => {
      const cols = Object.values(colonnesDe(reglages.tableau.table)),
        trouverColonne = (motif, filtre) =>
          (cols.find((colonne) => filtre(colonne) && motif.test(colonne.colId)) || cols.find(filtre) || {}).colId ||
          null;
      return {
        site: trouverColonne(
          /site/i,
          (colonne) =>
            /^Ref:/.test(colonne.type) && colonne.type !== `Ref:${courant.table}` && colonne.colId !== "Version",
        ),
        libre: trouverColonne(
          /libre|nom/i,
          (colonne) => /^Text/.test(colonne.type) && !RESERVES_TABLEAU.includes(colonne.colId),
        ),
        qualif: trouverColonne(/qualif/i, (colonne) => /^Choice/.test(colonne.type)),
        historique: [],
        alias: "Sites_correspondances",
      };
    };
    const interrupteur = $("pa-sites");
    if (interrupteur)
      interrupteur.addEventListener("change", () => {
        if (interrupteur.checked) reglages.tableau.sites = deviner();
        else delete reglages.tableau.sites;
        maj();
        dessinerPanneau();
      });
    const reglagesSites = reglages.tableau.sites;
    if (!reglagesSites) return;
    [
      ["pa-site-ref", "site"],
      ["pa-site-libre", "libre"],
      ["pa-site-qualif", "qualif"],
    ].forEach(([id, k]) => {
      const element = $(id);
      if (element)
        element.addEventListener("change", () => {
          reglagesSites[k] = element.value || null;
          maj();
        });
    });
    const menuHistorique = $("pa-site-hist");
    if (menuHistorique)
      menuHistorique.addEventListener("change", () => {
        reglagesSites.historique = menuHistorique.value
          ? [{ colonne: menuHistorique.value, libre: "Nom_du_site", qualif: "Qualification" }]
          : [];
        maj();
        dessinerPanneau();
      });
    [
      ["pa-site-hist-libre", "libre"],
      ["pa-site-hist-qualif", "qualif"],
    ].forEach(([id, k]) => {
      const element = $(id);
      if (element)
        element.addEventListener("input", () => {
          if (reglagesSites.historique[0]) reglagesSites.historique[0][k] = element.value.trim();
          sauver();
        });
    });
    const champAlias = $("pa-site-alias");
    if (champAlias)
      champAlias.addEventListener("input", () => {
        reglagesSites.alias = champAlias.value.trim() || "Sites_correspondances";
        sauver();
      });
    const menuReprise = $("pa-site-reprise");
    if (menuReprise)
      menuReprise.addEventListener("change", () => {
        reglagesSites.reprise = menuReprise.value;
        maj();
        dessinerPanneau();
      });
    const ras = $("pa-site-ras");
    if (ras)
      ras.addEventListener("change", () => {
        reglagesSites.avecRas = ras.checked;
        maj();
      });
    const caseQualifBas = $("pa-qualif-bas");
    if (caseQualifBas)
      caseQualifBas.addEventListener("change", () => {
        majSaisie((reglagesSaisie) => {
          reglagesSaisie.qualificationEnBas = caseQualifBas.checked;
        });
        dessinerApercu();
      });
  }
  const optionsParties = (sel) =>
    parties()
      .map(
        (partie) =>
          `<option value="${esc(partie.id)}"${(sel || "q") === partie.id ? " selected" : ""}>${esc(partie.nom)}${partie.role === "q" ? "" : " (visa)"}</option>`,
      )
      .join("");
  function ajouterPartie() {
    const nom = prompt("Nom de la nouvelle partie :", "Nouvelle partie");
    if (!nom || !nom.trim()) return;
    const listeParties = courant.conf.parties || (courant.conf.parties = copie(PARTIES_DEFAUT));
    const nouvellePartie = { id: "p" + Date.now().toString(36), nom: nom.trim(), role: "q", titre: true };
    const dernQ = listeParties.map((partie) => partie.role).lastIndexOf("q");
    listeParties.splice(dernQ + 1, 0, nouvellePartie);
    choisi = `partie:${nouvellePartie.id}`;
    sauver();
    dessinerApercu();
    dessinerPanneau();
  }
  function panneauPartie(partie) {
    const panneau = $("panneau"),
      partiesQuestions = parties().filter((autrePartie) => autrePartie.role === "q"),
      k = partiesQuestions.indexOf(partie);
    const nombreBlocs = blocs().filter((bloc) => (bloc.section || "q") === partie.id).length;
    panneau.innerHTML = `<h2>Partie : ${esc(partie.nom)}</h2><p class="sous">${esc(ROLES[partie.role])} · ${nombreBlocs} bloc${nombreBlocs > 1 ? "s" : ""}</p>
    <label class="l" for="pp-nom">Nom</label><input type="text" id="pp-nom" value="${esc(partie.nom)}">
    ${
      partie.role === "q"
        ? `<label class="interrupteur">Afficher le nom en titre dans le formulaire <input type="checkbox" id="pp-titre"${partie.titre ? " checked" : ""}></label>
      <div style="display:flex;gap:8px;margin-top:8px"><button type="button" class="secondaire petit" id="pp-haut"${k <= 0 ? " disabled" : ""}>↑ Monter</button><button type="button" class="secondaire petit" id="pp-bas"${k >= partiesQuestions.length - 1 ? " disabled" : ""}>↓ Descendre</button></div>`
        : `<p class="note">Ce nom remplace « ${partie.role === "vd" ? "Échelon départemental" : "Échelon académique"} » dans l'onglet Visas du widget de saisie. Les questions de cette partie ne sont visibles que des échelons concernés.</p>`
    }
    <div class="pied-panneau">${partie.role === "q" && partiesQuestions.length > 1 ? `<button type="button" class="danger" id="pp-suppr">Supprimer la partie…</button>` : "<span></span>"}</div>`;
    $("pp-nom").addEventListener("input", (evenement) => {
      partie.nom = evenement.target.value;
      panneau.querySelector("h2").textContent = `Partie : ${partie.nom}`;
      const entete = document.querySelector(`[data-partie="${partie.id}"]`);
      if (entete) entete.firstChild.textContent = partie.nom + " ";
      sauver();
    });
    const caseTitre = $("pp-titre");
    if (caseTitre)
      caseTitre.addEventListener("change", (evenement) => {
        partie.titre = evenement.target.checked;
        sauver();
        dessinerApercu();
      });
    const bouger = (decalage) => {
      const listeParties = courant.conf.parties,
        i = listeParties.indexOf(partie),
        cible = listeParties.indexOf(partiesQuestions[k + decalage]);
      [listeParties[i], listeParties[cible]] = [listeParties[cible], listeParties[i]];
      sauver();
      dessinerApercu();
      dessinerPanneau();
    };
    if ($("pp-haut")) $("pp-haut").addEventListener("click", () => bouger(-1));
    if ($("pp-bas")) $("pp-bas").addEventListener("click", () => bouger(1));
    if ($("pp-suppr"))
      $("pp-suppr").addEventListener("click", () => {
        const dest = partiesQuestions[k === 0 ? 1 : k - 1];
        if (
          nombreBlocs &&
          !confirm(
            `Supprimer la partie « ${partie.nom} » ? Ses ${nombreBlocs} bloc(s) rejoindront la partie « ${dest.nom} ».`,
          )
        )
          return;
        blocs().forEach((bloc) => {
          if ((bloc.section || "q") === partie.id) bloc.section = dest.id;
        });
        courant.conf.parties = courant.conf.parties.filter((autrePartie) => autrePartie !== partie);
        choisi = null;
        sauver();
        dessinerApercu();
        dessinerPanneau();
      });
  }
  function panneauCommun(colId) {
    const panneau = $("panneau"),
      colonne = meta[colId];
    if (colId === "Description") return panneauDescription();
    const textes = {
      Site: "Site, campus ou bâtiment concerné, en saisie libre et facultative. Il est repris dans l'en-tête de la description automatique et dans le repérage des doublons (même établissement, même site, même date des faits).",
      Etablissement: `Recherche de l'établissement par son nom ou son UAI (${courant.type === "etablissement" && saisieEffective().annuaires.length ? "référentiel du document, puis annuaires en ligne cochés ci-dessous" : "référentiel du document"}), complétion automatique de ses informations, mail et lien d'accès. Le premier enregistrement crée le signalement ; les suivants en créent des mises à jour (versions).`,
      Date_faits:
        "Jour des faits signalés, aujourd'hui par défaut. Sert au classement des versions, au décompte des jours de mobilisation et au point de situation.",
      Description:
        "Rédigée automatiquement à partir des réponses ; son format se règle en cliquant sur la description de l'aperçu, et pour chaque question dans « Données et diffusion ».",
      Qualification: "Qualification du signalement, obligatoire. Ses choix et leurs couleurs se règlent ici.",
    };
    panneau.innerHTML = `<h2>${esc(colonne ? colonne.libelle : colId)}</h2><p class="sous">Champ commun du questionnaire établissement · colonne ${esc(colId)}</p><p class="note">${esc(textes[colId] || "")}</p>
    ${
      colId === "Qualification" && colonne
        ? `<div class="groupe"><div class="t">Choix proposés</div><div id="pa-choix"></div><button type="button" class="ajout-lien" id="pa-ajout-choix">+ Ajouter un choix</button></div>
      <div class="groupe"><div class="t">Couleur du formulaire</div><label class="interrupteur">Colorer le formulaire selon la qualification <input type="checkbox" id="pq-couleur"${/\[\s*couleurs?\b/i.test(colonne.description) ? " checked" : ""}></label>
      <p class="note" style="margin:0">Enregistré tout de suite dans la colonne (repère [couleur]). Donnez une couleur à chaque choix ci-dessus (carré de couleur).</p></div>`
        : ""
    }
    ${
      colId === "Etablissement"
        ? `<div class="groupe"><div class="t">Référentiel</div><p class="note" style="margin:0 0 8px">Table <b>${esc(tableEtablissements() || "?")}</b> (référence de la colonne Etablissement).</p>
      <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px"><select id="pc-ref" aria-label="Autre référentiel" style="margin:0">${tables
        .filter((identifiantTable) => identifiantTable !== courant.table && identifiantTable !== TABLE_FORMULAIRES)
        .map(
          (identifiantTable) =>
            `<option value="${esc(identifiantTable)}"${identifiantTable === tableEtablissements() ? " selected" : ""}>${esc(identifiantTable)}</option>`,
        )
        .join("")}</select>
        <button type="button" class="secondaire petit" id="pc-ref-ok">Changer</button></div><p class="note" id="pc-ref-info" style="margin:0 0 8px"></p>
      ${tableEtablissements() ? `<button type="button" class="secondaire petit" id="pc-ajout-etab">+ Afficher une donnée de la fiche…</button><p class="note" style="margin:6px 0 0">Effectif, région académique, tutelle… : affichée en lecture seule dès que l'établissement est choisi, et reprise dans la description si besoin.</p>` : ""}</div>
      ${groupesEtablissementHtml()}`
        : ""
    }`;
    if (colId === "Etablissement") lierEtablissement(panneau);
    if ($("pc-ref")) {
      const majInfo = async () => {
        const tableChoisie = $("pc-ref").value,
          i = $("pc-ref-info");
        if (tableChoisie === tableEtablissements()) {
          i.textContent = "";
          $("pc-ref-ok").disabled = true;
          return;
        }
        i.textContent = "Vérification…";
        const analyse = await analyserReferentiel(courant.table, tableChoisie);
        if ($("pc-ref").value !== tableChoisie) return;
        i.textContent = analyse.erreur || analyse.texte;
        i.classList.toggle("avert", !!analyse.erreur);
        $("pc-ref-ok").disabled = !!analyse.erreur;
      };
      $("pc-ref-ok").disabled = true;
      $("pc-ref").addEventListener("change", majInfo);
      $("pc-ref-ok").addEventListener("click", async () => {
        const analyse = await analyserReferentiel(courant.table, $("pc-ref").value);
        if (analyse.erreur) {
          $("pc-ref-info").textContent = analyse.erreur;
          return;
        }
        if (!confirm(`Rattacher le formulaire au référentiel « ${$("pc-ref").value} » ?\n${analyse.texte}`)) return;
        try {
          await appliquerReferentiel(courant.table, analyse);
          meta = metaCourante();
          etablissementsTest = null;
          etablissementTest = null;
          colonnesEtablissementTest = {};
          dessinerApercu();
          dessinerPanneau();
          message(`Référentiel des établissements : ${analyse.cible}.`, "ok");
        } catch (erreur) {
          message(`Changement refusé : ${erreur.message || erreur}`, "err");
        }
      });
    }
    if ($("pc-ajout-etab"))
      $("pc-ajout-etab").addEventListener("click", () => {
        const partieQuestions = parties().find((partie) => partie.role === "q"),
          premier = blocs().findIndex((bloc) => (bloc.section || "q") === partieQuestions.id);
        const ancre =
          document.querySelector(`[data-section-feuille="${partieQuestions.id}"] [data-ajout]`) || $("pc-ajout-etab");
        ouvrirMenu(partieQuestions.id, premier < 0 ? blocs().length : premier, ancre);
        etapeEtablissement();
      });
    if (colId === "Qualification" && colonne) {
      dessinerChoix({ id: "commun:Qualification", genre: "commun", colonne: "Qualification" });
      $("pq-couleur").addEventListener("change", async (evenement) => {
        const sans = colonne.description.replace(/\[\s*couleurs?\b[^\]]*\]\s*/gi, "").trim();
        try {
          await actions([
            [
              "ModifyColumn",
              courant.table,
              meta.Qualification.colId,
              { description: evenement.target.checked ? `[couleur] ${sans}`.trim() : sans },
            ],
          ]);
          await lireMeta();
          meta = metaCourante();
        } catch (err) {
          message(`Réglage refusé : ${err.message || err}`, "err");
        }
      });
    }
  }
  function panneauDecor(bloc) {
    const panneau = $("panneau");
    panneau.innerHTML = `<h2>${bloc.genre === "titre" ? "Titre de section" : "Texte d'information"}</h2><p class="sous">Bloc d'affichage, sans colonne ni réponse.</p>
    <label class="l" for="pd-texte">${bloc.genre === "titre" ? "Titre" : "Texte"}</label>
    ${bloc.genre === "titre" ? `<input type="text" id="pd-texte" value="${esc(bloc.texte || "")}">` : `<textarea id="pd-texte" style="min-height:110px">${esc(bloc.texte || "")}</textarea>`}
    <label class="l" for="pd-section">Partie du formulaire</label>
    <select id="pd-section">${optionsParties(bloc.section)}</select>
    <div class="pied-panneau"><button type="button" class="danger" id="pd-retirer">Retirer du formulaire</button></div>`;
    $("pd-texte").addEventListener("input", (evenement) => {
      bloc.texte = evenement.target.value;
      majBloc(bloc);
      sauver();
    });
    $("pd-section").addEventListener("change", (evenement) => {
      deplacer(bloc.id, blocs().length, evenement.target.value);
      choisir(bloc.id);
    });
    $("pd-retirer").addEventListener("click", () => retirerBloc(bloc));
  }
  function majBloc(bloc) {
    // redessine un seul bloc de l'aperçu (sans perdre la saisie du panneau)
    const element = document.querySelector(`[data-bloc="${bloc.id}"]`);
    if (!element) return;
    const tmp = document.createElement("div");
    tmp.innerHTML = blocHtml(bloc);
    element.replaceWith(tmp.firstElementChild);
    majEtat();
  }
  async function compterReponses(bloc) {
    const element = $("pa-nb-rep");
    if (!element) return;
    try {
      const donneesTable = await Donnees.lire(courant.table);
      const nombre = (donneesTable[bloc.colonne] || []).filter(
        (valeur) => lisible(valeur) && !estVideValeur(valeur),
      ).length;
      if (!$("pa-nb-rep")) return;
      element.textContent = `${nombre} réponse${nombre > 1 ? "s" : ""} enregistrée${nombre > 1 ? "s" : ""}`;
      const boutonSupprimer = $("pa-supprimer");
      if (boutonSupprimer) {
        boutonSupprimer.disabled = nombre > 0;
        boutonSupprimer.title =
          nombre > 0
            ? "La colonne contient des réponses : elle ne peut pas être supprimée d'ici"
            : "Supprimer définitivement la colonne vide";
      }
      bloc._reponses = nombre;
    } catch (_) {
      element.textContent = "réponses non lisibles";
    }
  }

  /* ---------- choix et couleurs ---------- */
  function dessinerChoix(bloc) {
    const colonne = meta[bloc.colonne],
      choix = colonne.opts.choices || [],
      optionsChoix = colonne.opts.choiceOptions || {};
    $("pa-choix").innerHTML =
      choix
        .map((texteChoix, i) => {
          const couleur = (optionsChoix[texteChoix] || {}).fillColor;
          return `<div class="choix-edit" data-i="${i}"><button type="button" class="icone" data-ch="haut" aria-label="Monter ${esc(texteChoix)}" ${i === 0 ? "disabled" : ""}>↑</button>
      <input type="color" value="${couleur || "#ffffff"}" aria-label="Couleur de ${esc(texteChoix)}" title="${couleur ? "Couleur du choix" : "Sans couleur (cliquez pour en choisir une)"}">
      <input type="text" value="${esc(texteChoix)}" aria-label="Choix ${i + 1}">
      ${couleur ? `<button type="button" class="icone" data-ch="sans" title="Retirer la couleur" aria-label="Retirer la couleur de ${esc(texteChoix)}">◌</button>` : ""}
      <button type="button" class="icone" data-ch="suppr" aria-label="Supprimer le choix ${esc(texteChoix)}">✕</button></div>`;
        })
        .join("") || `<p class="note">Aucun choix.</p>`;
    $("pa-choix")
      .querySelectorAll(".choix-edit")
      .forEach((div) => {
        const i = +div.dataset.i,
          ancien = choix[i];
        div
          .querySelector("input[type=text]")
          .addEventListener("change", (evenement) => renommerChoix(bloc, ancien, evenement.target.value.trim()));
        div.querySelector("input[type=color]").addEventListener("change", (evenement) =>
          modifierOptions(bloc, (options) => {
            options.choiceOptions = options.choiceOptions || {};
            options.choiceOptions[ancien] = {
              ...(options.choiceOptions[ancien] || {}),
              fillColor: evenement.target.value,
              textColor: texteSur(evenement.target.value),
            };
          }),
        );
        div.querySelectorAll("[data-ch]").forEach((btn) =>
          btn.addEventListener("click", () => {
            if (btn.dataset.ch === "suppr") {
              if (
                confirm(
                  `Supprimer le choix « ${ancien} » ? Les réponses déjà saisies le conservent, mais il ne sera plus proposé.`,
                )
              )
                modifierOptions(bloc, (options) => {
                  options.choices = (options.choices || []).filter((texteChoix) => texteChoix !== ancien);
                  if (options.choiceOptions) delete options.choiceOptions[ancien];
                });
            } else if (btn.dataset.ch === "sans")
              modifierOptions(bloc, (options) => {
                if (options.choiceOptions) delete options.choiceOptions[ancien];
              });
            else if (btn.dataset.ch === "haut" && i > 0)
              modifierOptions(bloc, (options) => {
                const liste = options.choices;
                [liste[i - 1], liste[i]] = [liste[i], liste[i - 1]];
              });
          }),
        );
      });
    $("pa-ajout-choix").onclick = () => {
      const nom = prompt("Nouveau choix :");
      if (!nom || !nom.trim()) return;
      modifierOptions(bloc, (options) => {
        options.choices = [...(options.choices || []), nom.trim()];
      });
    };
  }
  function texteSur(hex) {
    const correspondance = String(hex).match(/^#?([0-9a-f]{6})$/i);
    if (!correspondance) return "#161616";
    const [rouge, vert, bleu] = [0, 2, 4].map((i) => parseInt(correspondance[1].slice(i, i + 2), 16));
    return 0.299 * rouge + 0.587 * vert + 0.114 * bleu > 150 ? "#161616" : "#FFFFFF";
  }
  async function modifierOptions(blocOuColonne, modifier, table) {
    const tid = table || courant.table,
      cols = colonnesDe(tid),
      colonne = cols[blocOuColonne.colonne || blocOuColonne];
    const options = copie(colonne.opts || {});
    modifier(options);
    try {
      await actions([["ModifyColumn", tid, colonne.colId, { widgetOptions: JSON.stringify(options) }]]);
      await lireMeta();
      meta = metaCourante();
      if (typeof blocOuColonne === "object" && blocOuColonne.genre === "commun") {
        dessinerApercu();
        dessinerPanneau();
      } else if (typeof blocOuColonne === "object") {
        majBloc(blocOuColonne);
        dessinerPanneau();
      } else dessinerPanneau();
    } catch (erreur) {
      message(`Modification refusée : ${erreur.message || erreur}`, "err");
    }
  }
  async function renommerChoix(bloc, ancien, nouveau) {
    if (!nouveau || nouveau === ancien) return;
    const colonne = meta[bloc.colonne];
    if ((colonne.opts.choices || []).includes(nouveau)) {
      if (!(colonne.opts.choices || []).includes(ancien)) return; // renommage déjà fait (événement répété)
      message(`Le choix « ${nouveau} » existe déjà.`, "err");
      dessinerPanneau();
      return;
    }
    const options = copie(colonne.opts);
    options.choices = options.choices.map((texteChoix) => (texteChoix === ancien ? nouveau : texteChoix));
    if (options.choiceOptions && options.choiceOptions[ancien]) {
      options.choiceOptions[nouveau] = options.choiceOptions[ancien];
      delete options.choiceOptions[ancien];
    }
    try {
      // RenameChoices met aussi à jour les réponses déjà enregistrées (versions récentes de Grist)
      try {
        await actions([["RenameChoices", courant.table, colonne.colId, { [ancien]: nouveau }]]);
      } catch (_) {
        message(
          "Ancien choix conservé dans les réponses déjà saisies (version de Grist sans renommage des choix).",
          "err",
        );
      }
      await actions([["ModifyColumn", courant.table, colonne.colId, { widgetOptions: JSON.stringify(options) }]]);
      // les conditions qui citaient l'ancien choix suivent
      for (const bloc of blocs()) {
        const condition = bloc.reglages && bloc.reglages.condition;
        if (condition && colonneDeRef(condition.ref) === colonne)
          condition.valeurs = (condition.valeurs || []).map((valeur) => (valeur === ancien ? nouveau : valeur));
      }
      sauver();
      await lireMeta();
      meta = metaCourante();
      dessinerApercu();
      dessinerPanneau();
    } catch (erreur) {
      message(`Renommage refusé : ${erreur.message || erreur}`, "err");
    }
  }
  async function changerTypeNombre(bloc, type) {
    const colonne = meta[bloc.colonne];
    if (typeBase(colonne.type) === type) return;
    if (
      (bloc._reponses || 0) > 0 &&
      type === "Int" &&
      !confirm("Passer en nombre entier arrondit les valeurs décimales déjà saisies. Continuer ?")
    )
      return;
    try {
      await actions([["ModifyColumn", courant.table, colonne.colId, { type }]]);
      await lireMeta();
      meta = metaCourante();
      majBloc(bloc);
      dessinerPanneau();
    } catch (erreur) {
      message(`Changement de type refusé : ${erreur.message || erreur}`, "err");
    }
  }

  /* ---------- condition construite avec des menus ---------- */
  function dessinerCondition(bloc) {
    const reglages = bloc.reglages,
      condition = reglages.condition || null,
      element = $("pa-condition");
    const autres = blocs().filter(
      (autreBloc) =>
        autreBloc.genre === "question" &&
        autreBloc.id !== bloc.id &&
        meta[autreBloc.colonne] &&
        !(autreBloc.reglages && autreBloc.reglages.tableau),
    );
    const horsForm = Object.values(meta)
      .filter(
        (colonne) =>
          !autres.some((autreBloc) => autreBloc.colonne === colonne.colId) &&
          colonne.colId !== bloc.colonne &&
          colonne.colId !== "id",
      )
      .sort((colonneA, colonneB) => colonneA.pos - colonneB.pos);
    const ref = condition ? (colonneDeRef(condition.ref) || {}).colId : "";
    element.innerHTML = `<div class="condition"><label class="l" for="pc-col">Afficher cette question si</label>
    <select id="pc-col"><option value="">— toujours affichée —</option>
      ${autres.length ? `<optgroup label="Questions du formulaire">${autres.map((autreBloc) => `<option value="${esc(autreBloc.colonne)}"${ref === autreBloc.colonne ? " selected" : ""}>${esc(libelleQuestion(autreBloc.colonne))}</option>`).join("")}</optgroup>` : ""}
      <optgroup label="Autres colonnes de la table">${horsForm.map((colonne) => `<option value="${esc(colonne.colId)}"${ref === colonne.colId ? " selected" : ""}>${esc(colonne.libelle)}</option>`).join("")}</optgroup></select>
    <div id="pc-suite"></div></div>`;
    $("pc-col").addEventListener("change", (evenement) => {
      reglages.condition = evenement.target.value ? { ref: evenement.target.value, op: "=", valeurs: [] } : undefined;
      const colonneChoisie = meta[evenement.target.value];
      if (colonneChoisie && !["Choice", "ChoiceList", "Bool"].includes(typeBase(colonneChoisie.type)))
        reglages.condition.op = "rempli";
      if (colonneChoisie && typeBase(colonneChoisie.type) === "Bool") reglages.condition.valeurs = ["Oui"];
      majBloc(bloc);
      sauver();
      dessinerCondition(bloc);
    });
    if (!condition || !ref) return;
    const colonneRef = meta[ref],
      type = typeBase(colonneRef.type);
    const ops = ["Choice", "ChoiceList"].includes(type)
      ? [
          ["=", "est l'un de"],
          ["!=", "n'est pas"],
          ["rempli", "est renseigné"],
          ["vide", "est vide"],
        ]
      : type === "Bool"
        ? [["=", "est"]]
        : ["Int", "Numeric"].includes(type)
          ? [
              ["rempli", "est renseigné"],
              ["vide", "est vide"],
              [">", "est supérieur à"],
              [">=", "est au moins"],
              ["<", "est inférieur à"],
              ["<=", "est au plus"],
              ["=", "est égal à"],
              ["!=", "est différent de"],
            ]
          : [
              ["rempli", "est renseigné"],
              ["vide", "est vide"],
              ["=", "est égal à"],
              ["!=", "est différent de"],
            ];
    let valeurs = "";
    if (condition.op !== "rempli" && condition.op !== "vide") {
      if (["Choice", "ChoiceList"].includes(type))
        valeurs = `<div class="valeurs-c">${(colonneRef.opts.choices || []).map((texteChoix) => `<label><input type="checkbox" value="${esc(texteChoix)}"${(condition.valeurs || []).includes(texteChoix) ? " checked" : ""}> ${esc(texteChoix)}</label>`).join("")}</div>`;
      else if (type === "Bool")
        valeurs = `<select id="pc-bool"><option${(condition.valeurs || [])[0] !== "Non" ? " selected" : ""}>Oui</option><option${(condition.valeurs || [])[0] === "Non" ? " selected" : ""}>Non</option></select>`;
      else
        valeurs = `<input type="${["Int", "Numeric"].includes(type) ? "number" : "text"}" id="pc-val" value="${esc((condition.valeurs || []).join(", "))}" placeholder="valeur">`;
    }
    $("pc-suite").innerHTML =
      `<select id="pc-op">${ops.map(([valeur, libelle]) => `<option value="${valeur}"${condition.op === valeur ? " selected" : ""}>${libelle}</option>`).join("")}</select>${valeurs}
    ${condition.ref && !blocs().some((autreBloc) => autreBloc.colonne === ref) ? `<p class="note" style="margin:4px 0 0">Colonne hors formulaire : sa valeur est celle déjà enregistrée (dernière version du signalement).</p>` : ""}`;
    $("pc-op").addEventListener("change", (evenement) => {
      condition.op = evenement.target.value;
      if (condition.op === "rempli" || condition.op === "vide") condition.valeurs = [];
      majBloc(bloc);
      sauver();
      dessinerCondition(bloc);
    });
    $("pc-suite")
      .querySelectorAll(".valeurs-c input")
      .forEach((caseACocher) =>
        caseACocher.addEventListener("change", () => {
          condition.valeurs = [...$("pc-suite").querySelectorAll(".valeurs-c input:checked")].map((i) => i.value);
          majBloc(bloc);
          sauver();
        }),
      );
    if ($("pc-bool"))
      $("pc-bool").addEventListener("change", (evenement) => {
        condition.valeurs = [evenement.target.value];
        majBloc(bloc);
        sauver();
      });
    if ($("pc-val"))
      $("pc-val").addEventListener("input", (evenement) => {
        condition.valeurs = evenement.target.value.split(/\s*,\s*/).filter(Boolean);
        majBloc(bloc);
        sauver();
      });
  }

  /* ---------- couleur du formulaire selon la réponse ---------- */
  function dessinerCouleur(bloc) {
    const reglages = bloc.reglages,
      colonne = meta[bloc.colonne],
      type = typeBase(colonne.type),
      element = $("pa-couleur");
    if (type === "Choice" || type === "ChoiceList") {
      element.innerHTML = `<label class="interrupteur">Colorer le formulaire selon la réponse <input type="checkbox" id="pk-choix"${reglages.couleur === "choix" ? " checked" : ""}></label>
      <p class="note" style="margin:0">Couleurs prises dans les choix ci-dessus. Plusieurs réponses : la première dans l'ordre des choix l'emporte.</p>`;
      $("pk-choix").addEventListener("change", (evenement) => {
        reglages.couleur = evenement.target.checked ? "choix" : undefined;
        sauver();
      });
      return;
    }
    const regles = Array.isArray(reglages.couleur) ? reglages.couleur : [];
    const OPS =
      type === "Bool"
        ? [
            ["Oui", "si Oui"],
            ["Non", "si Non"],
          ]
        : type === "Date" || type === "DateTime"
          ? [
              ["renseigné", "si renseignée"],
              ["vide", "si vide"],
            ]
          : [
              [">", "au-delà de"],
              [">=", "à partir de"],
              ["<", "en dessous de"],
              ["<=", "jusqu'à"],
              ["=", "égal à"],
            ];
    const decoupe = (cle) => {
      const correspondance = String(cle).match(/^(>=|<=|>|<|=)?\s*(.*)$/);
      return type === "Bool" || type === "Date" || type === "DateTime"
        ? [cle, ""]
        : [correspondance[1] || "=", correspondance[2]];
    };
    element.innerHTML =
      regles
        .map((regle, i) => {
          const [operateur, valeur] = decoupe(regle.cle);
          const hex = COULEURS[normaliser(regle.couleur)] || regle.couleur;
          return `<div class="choix-edit" data-i="${i}"><select class="pk-op" style="width:auto;margin:0">${OPS.map(([symbole, libelle]) => `<option value="${symbole}"${symbole === operateur ? " selected" : ""}>${libelle}</option>`).join("")}</select>
      ${type === "Bool" || type === "Date" || type === "DateTime" ? "" : `<input type="number" class="pk-val" value="${esc(valeur)}" style="width:80px;margin:0">`}
      <input type="color" class="pk-coul" value="${/^#[0-9a-f]{6}$/i.test(hex) ? hex : "#ce0500"}" aria-label="Couleur"><button type="button" class="icone pk-suppr" aria-label="Supprimer">✕</button></div>`;
        })
        .join("") +
      `<button type="button" class="ajout-lien" id="pk-ajout">+ Ajouter ${type === "Bool" || type === "Date" || type === "DateTime" ? "une couleur" : "un seuil"}</button>
     <p class="note" style="margin:4px 0 0">La première règle qui s'applique l'emporte.</p>`;
    const relire = () => {
      reglages.couleur = [...element.querySelectorAll(".choix-edit")]
        .map((ligne) => {
          const operateur = ligne.querySelector(".pk-op").value,
            valeur = ligne.querySelector(".pk-val") ? ligne.querySelector(".pk-val").value : "";
          const cle =
            type === "Bool" || type === "Date" || type === "DateTime"
              ? operateur
              : operateur === "="
                ? valeur
                : `${operateur}${valeur}`;
          return { cle, couleur: ligne.querySelector(".pk-coul").value };
        })
        .filter((regle) => regle.cle !== "" && regle.cle !== ">" && regle.cle !== "<");
      if (!reglages.couleur.length) reglages.couleur = undefined;
      sauver();
    };
    element.querySelectorAll("select, input").forEach((champ) => champ.addEventListener("change", relire));
    element.querySelectorAll(".pk-suppr").forEach((bouton) =>
      bouton.addEventListener("click", () => {
        bouton.closest(".choix-edit").remove();
        relire();
        dessinerCouleur(bloc);
      }),
    );
    $("pk-ajout").addEventListener("click", () => {
      reglages.couleur = [
        ...regles,
        {
          cle: type === "Bool" ? "Oui" : type === "Date" || type === "DateTime" ? "renseigné" : ">0",
          couleur: "#ce0500",
        },
      ];
      sauver();
      dessinerCouleur(bloc);
    });
  }

  /* ---------- champs d'une question « tableau » (colonnes de la table liée) ---------- */
  function reglagesSousColonne(desc) {
    const reperes = lireReperes(desc);
    return {
      ordre: reperes.ordre ?? null,
      court: !!reperes.court,
      auto: !!reperes.auto,
      masque: !!reperes.masque,
      obligatoire: !!reperes.obligatoire,
      confidentiel: !!reperes.confidentiel,
      condition: reperes.condition
        ? `${reperes.condition.ref}${reperes.condition.op === "rempli" ? " n'est pas vide" : reperes.condition.op === "vide" ? " est vide" : ` ${reperes.condition.op} ${(reperes.condition.valeurs || []).join(", ")}`}`
        : "",
      aide: reperes.aide,
      autres: (desc.match(/\[(liste|boutons|positif|min[^\]]*|max[^\]]*|couleur[^\]]*)\]/gi) || []).join(" "),
    };
  }
  function descriptionSousColonne(reglages) {
    return [
      reglages.obligatoire ? "*" : "",
      reglages.ordre != null ? `[ordre ${reglages.ordre}]` : "",
      reglages.court ? "[court]" : "",
      reglages.auto ? "[auto]" : "",
      reglages.masque ? "[masqué]" : "",
      reglages.condition ? `[si ${reglages.condition}]` : "",
      reglages.autres || "",
      reglages.confidentiel ? "[confidentiel]" : "",
      reglages.aide || "",
    ]
      .filter(Boolean)
      .join(" ");
  }
  function dessinerSousColonnes(bloc) {
    const tid = bloc.reglages.tableau.table,
      cols = sousColonnes(tid);
    const element = $("pa-sous");
    if (!Object.keys(colonnesDe(tid)).length) {
      element.innerHTML = `<p class="avert">La table « ${esc(tid)} » est introuvable.</p>`;
      return;
    }
    const noms = {
      Choice: "Choix unique",
      ChoiceList: "Choix multiple",
      Text: "Texte",
      Int: "Nombre",
      Numeric: "Nombre",
      Bool: "Oui / Non",
      Date: "Date",
      DateTime: "Date et heure",
    };
    element.innerHTML =
      cols
        .map((colonne, i) => {
          const reglages = reglagesSousColonne(colonne.description),
            type = typeBase(colonne.type);
          return (
            `<div class="sous-col${reglages.masque ? " masque-sc" : ""}" data-col="${esc(colonne.colId)}"><div class="ligne-sc"><span class="ordre-sc">` +
            `<button type="button" class="icone sc-monter" data-sens="-1"${i === 0 ? " disabled" : ""} aria-label="Monter le champ ${esc(colonne.libelle)}" title="Monter">↑</button>` +
            `<button type="button" class="icone sc-descendre" data-sens="1"${i === cols.length - 1 ? " disabled" : ""} aria-label="Descendre le champ ${esc(colonne.libelle)}" title="Descendre">↓</button></span>` +
            `<input type="text" class="sc-lib" value="${esc(colonne.libelle)}" aria-label="Libellé du champ"><small class="note" style="white-space:nowrap">${esc(noms[type] || type)}</small>
      <button type="button" class="icone sc-suppr" aria-label="Supprimer le champ ${esc(colonne.libelle)}">✕</button></div>
      ${type === "Choice" || type === "ChoiceList" ? `<input type="text" class="choix-sc" value="${esc((colonne.opts.choices || []).join(", "))}" aria-label="Choix, séparés par des virgules" placeholder="Choix, séparés par des virgules">` : ""}
      <div class="opts"><label title="Le champ n'apparaît pas dans le formulaire ; ses valeurs restent dans la table"><input type="checkbox" class="sc-masque"${reglages.masque ? " checked" : ""}> masqué</label><label><input type="checkbox" class="sc-oblig"${reglages.obligatoire ? " checked" : ""}> obligatoire</label><label><input type="checkbox" class="sc-conf"${reglages.confidentiel ? " checked" : ""}> confidentiel</label>${type === "Text" ? `<label><input type="checkbox" class="sc-court"${reglages.court ? " checked" : ""}> sur une seule ligne</label><label title="Rempli à partir des autres champs de la ligne (modifiable par l'agent)"><input type="checkbox" class="sc-auto"${reglages.auto ? " checked" : ""}> texte automatique</label>` : ""}</div>
      <input type="text" class="cond-sc" value="${esc(reglages.condition)}" placeholder="Afficher si… (ex. Catégorie = Personnel)" aria-label="Condition d'affichage du champ"></div>`
          );
        })
        .join("") || `<p class="note">Aucun champ pour l'instant.</p>`;
    element.querySelectorAll(".sous-col").forEach((div) => {
      const colId = div.dataset.col,
        colonne = colonnesDe(tid)[colId];
      const majDesc = async () => {
        const reglages = reglagesSousColonne(colonne.description);
        reglages.obligatoire = div.querySelector(".sc-oblig").checked;
        reglages.confidentiel = div.querySelector(".sc-conf").checked;
        reglages.condition = div.querySelector(".cond-sc").value.trim();
        const caseCourt = div.querySelector(".sc-court");
        if (caseCourt) reglages.court = caseCourt.checked;
        const caseAuto = div.querySelector(".sc-auto");
        if (caseAuto) reglages.auto = caseAuto.checked;
        reglages.masque = div.querySelector(".sc-masque").checked;
        try {
          await actions([["ModifyColumn", tid, colId, { description: descriptionSousColonne(reglages) }]]);
          await lireMeta();
          majBloc(bloc);
        } catch (erreur) {
          message(`Réglage refusé : ${erreur.message || erreur}`, "err");
        }
      };
      div.querySelector(".sc-oblig").addEventListener("change", majDesc);
      div.querySelector(".sc-conf").addEventListener("change", majDesc);
      div.querySelector(".sc-masque").addEventListener("change", majDesc);
      if (div.querySelector(".sc-court")) div.querySelector(".sc-court").addEventListener("change", majDesc);
      if (div.querySelector(".sc-auto")) div.querySelector(".sc-auto").addEventListener("change", majDesc);
      // Monter / descendre : toutes les colonnes de la table reçoivent leur numéro [ordre N]
      div.querySelectorAll("[data-sens]").forEach((btn) =>
        btn.addEventListener("click", async () => {
          const liste = sousColonnes(tid),
            i = liste.findIndex((colonneListe) => colonneListe.colId === colId),
            j = i + +btn.dataset.sens;
          if (i < 0 || j < 0 || j >= liste.length) return;
          [liste[i], liste[j]] = [liste[j], liste[i]];
          try {
            await actions(
              liste.map((colonneListe, numero) => [
                "ModifyColumn",
                tid,
                colonneListe.colId,
                {
                  description: descriptionSousColonne({
                    ...reglagesSousColonne(colonneListe.description),
                    ordre: numero + 1,
                  }),
                },
              ]),
            );
            await lireMeta();
            majBloc(bloc);
            dessinerSousColonnes(bloc);
            const nouveauBouton = $("pa-sous").querySelector(
              `.sous-col[data-col="${CSS.escape(colId)}"] [data-sens="${btn.dataset.sens}"]`,
            );
            const cibleFocus =
              nouveauBouton && !nouveauBouton.disabled
                ? nouveauBouton
                : $("pa-sous").querySelector(`.sous-col[data-col="${CSS.escape(colId)}"] .sc-lib`);
            if (cibleFocus) cibleFocus.focus();
          } catch (erreur) {
            message(`Déplacement refusé : ${erreur.message || erreur}`, "err");
          }
        }),
      );
      div.querySelector(".cond-sc").addEventListener("change", majDesc);
      div.querySelector(".sc-lib").addEventListener("change", async (evenement) => {
        try {
          await actions([
            ["ModifyColumn", tid, colId, { untieColIdFromLabel: true }],
            ["ModifyColumn", tid, colId, { label: evenement.target.value.trim() || colonne.libelle }],
          ]);
          await lireMeta();
          majBloc(bloc);
        } catch (err) {
          message(`Renommage refusé : ${err.message || err}`, "err");
        }
      });
      const champChoix = div.querySelector(".choix-sc");
      if (champChoix)
        champChoix.addEventListener("change", (evenement) =>
          modifierOptions(
            colId,
            (options) => {
              options.choices = evenement.target.value.split(/\s*,\s*/).filter(Boolean);
            },
            tid,
          ),
        );
      div.querySelector(".sc-suppr").addEventListener("click", async () => {
        if (
          !confirm(
            `Supprimer le champ « ${colonne.libelle} » de la table ${tid} ? Les valeurs déjà saisies dans cette colonne seront perdues.`,
          )
        )
          return;
        try {
          await actions([["RemoveColumn", tid, colId]]);
          await lireMeta();
          majBloc(bloc);
          dessinerPanneau();
        } catch (err) {
          message(`Suppression refusée : ${err.message || err}`, "err");
        }
      });
    });
    $("sc-ajouter").onclick = async () => {
      const lib = $("sc-nouveau-lib").value.trim(),
        type = $("sc-nouveau-type").value;
      if (!lib) {
        $("sc-nouveau-lib").focus();
        return;
      }
      try {
        const existants = Object.keys(colonnesDe(tid));
        const colId = identifiant(lib, existants);
        const info = { type, label: lib, isFormula: false, untieColIdFromLabel: true };
        if (type === "Choice" || type === "ChoiceList")
          info.widgetOptions = JSON.stringify({ choices: ["Option 1", "Option 2"] });
        await actions([["AddColumn", tid, colId, info]]);
        await lireMeta();
        majBloc(bloc);
        dessinerPanneau();
        const champ = $("panneau").querySelector(`.sous-col[data-col="${colId}"] .choix-sc`) || $("sc-nouveau-lib");
        if (champ) champ.focus();
      } catch (erreur) {
        message(`Champ non créé : ${erreur.message || erreur}`, "err");
      }
    };
  }

  /* ---------- suppression de colonne (vide uniquement) ---------- */
  async function supprimerColonne(bloc) {
    const colonne = meta[bloc.colonne];
    if (!colonne) return;
    const donneesTable = await Donnees.lire(courant.table);
    if (!colonne.formule && (donneesTable[colonne.colId] || []).some((valeur) => !estVideValeur(valeur))) {
      message("La colonne contient des réponses : elle ne peut pas être supprimée d'ici.", "err");
      return;
    }
    const autres = formulaires.filter(
      (formulaire) =>
        formulaire.id !== courant.id &&
        formulaire.table === courant.table &&
        String(formulaire.brouillon || formulaire.publie || "").includes(`"colonne":"${colonne.colId}"`),
    );
    if (
      !confirm(
        `Supprimer définitivement la colonne « ${colonne.libelle} » (${colonne.colId}) de la table ${courant.table} ?${autres.length ? `\nElle est aussi utilisée par : ${autres.map((formulaire) => formulaire.nom).join(", ")}.` : ""}`,
      )
    )
      return;
    try {
      courant.conf.blocs = blocs().filter((autreBloc) => autreBloc.id !== bloc.id);
      choisi = null;
      sauver();
      await actions([["RemoveColumn", courant.table, colonne.colId]]);
      await lireMeta();
      meta = metaCourante();
      dessinerApercu();
      dessinerPanneau();
      message("Colonne supprimée.", "ok");
    } catch (erreur) {
      message(`Suppression refusée : ${erreur.message || erreur}`, "err");
    }
  }

  /* =========================================================
   Formulaires : choix, création, duplication, publication
   ========================================================= */
  function remplirChoixFormulaire() {
    const sel = $("choix-formulaire");
    sel.innerHTML = formulaires.length
      ? formulaires
          .map(
            (formulaire) =>
              `<option value="${formulaire.id}"${courant && formulaire.id === courant.id ? " selected" : ""}>${esc(formulaire.nom)}</option>`,
          )
          .join("")
      : `<option value="">(aucun formulaire)</option>`;
    sel.disabled = !formulaires.length;
    $("btn-dupliquer").disabled = $("btn-tester").disabled = !courant;
  }
  $("choix-formulaire").addEventListener("change", (evenement) => {
    const formulaire = formulaires.find((candidat) => candidat.id === +evenement.target.value);
    if (!formulaire) return;
    if (modeTest) basculerTest();
    charger(formulaire);
    remplirChoixFormulaire();
    dessinerApercu();
    dessinerPanneau();
  });
  let duplication = false;
  function ouvrirNouveau(dupliquer) {
    duplication = dupliquer;
    $("dlg-titre").textContent = dupliquer ? `Dupliquer « ${courant.nom} »` : "Nouveau formulaire";
    $("nf-nom").value = dupliquer ? `${courant.nom} (copie)` : "";
    $("nf-table").innerHTML =
      `<option value="__nouvelle__">+ Créer une nouvelle table…</option>` +
      tables
        .map(
          (identifiantTable) =>
            `<option${courant && identifiantTable === courant.table ? " selected" : ""}>${esc(identifiantTable)}</option>`,
        )
        .join("");
    if (!courant) $("nf-table").value = tables.includes(socleGeneral.reponses) ? socleGeneral.reponses : "__nouvelle__";
    const devine = tables.includes(socleGeneral.referentiel) ? socleGeneral.referentiel : devinerTableEtablissements();
    $("nf-etab").innerHTML =
      (tables.includes("Etablissements")
        ? ""
        : `<option value="__creer__">+ Créer une table « Etablissements »</option>`) +
      tables
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
  $("nf-annuler").addEventListener("click", () => $("dlg-nouveau").close());
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
      $("nf-nouvelle").value = identifiant($("nf-nom").value || "Reponses", metaTables ? metaTables[0].tableId : []);
  }
  $("nf-table").addEventListener("change", majChoixTable);
  $("nf-etab").addEventListener("change", majInfoReferentiel);
  async function majInfoReferentiel() {
    const info = $("nf-etab-info"),
      identifiantTable = $("nf-table").value;
    if (identifiantTable === "__nouvelle__" || duplication) {
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
  $("nf-nom").addEventListener("input", () => {
    if ($("nf-table").value === "__nouvelle__" && !$("nf-nouvelle").dataset.touche)
      $("nf-nouvelle").value = identifiant($("nf-nom").value || "Reponses", metaTables[0].tableId);
  });
  $("nf-nouvelle").addEventListener("input", () => {
    $("nf-nouvelle").dataset.touche = "1";
  });
  // Table de réponses d'un questionnaire établissement (et référentiel des établissements s'il manque)
  async function creerTableReponses(nom, opts = {}) {
    const tid = identifiant(nom, metaTables[0].tableId);
    let tableEtablissement =
      opts.etab && opts.etab !== "__creer__" && metaTables[0].tableId.includes(opts.etab)
        ? opts.etab
        : "Etablissements";
    if (!metaTables[0].tableId.includes(tableEtablissement))
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
        tid,
        [
          { id: "Etablissement", type: `Ref:${tableEtablissement}`, isFormula: false },
          ...(opts.site ? [{ id: "Site", type: "Text", isFormula: false }] : []),
          { id: "Date_faits", type: "Date", isFormula: false },
          { id: "Qualification", type: "Choice", isFormula: false },
          { id: "Description", type: "Text", isFormula: false },
          { id: "Nature", type: "Choice", isFormula: false },
          { id: "Date", type: "DateTime:Europe/Paris", isFormula: false, formula: "NOW()" }, // formule d'initialisation : heure du serveur
          { id: "Commentaire", type: "Text", isFormula: false },
          { id: "Auteur", type: "Text", isFormula: false, formula: "user.Email" },
          ...(opts.clos ? [{ id: "Clos", type: "Bool", isFormula: false }] : []),
        ],
      ],
    ]);
    await actions([
      ["AddColumn", tid, "Dossier", { type: `Ref:${tid}`, isFormula: false, label: "Dossier" }],
      // identifiants détachés des libellés d'abord : sans cela, Grist renommerait Date_faits, Date, Site d'après le libellé
      ...["Date_faits", "Date", ...(opts.site ? ["Site"] : [])].map((identifiantColonne) => [
        "ModifyColumn",
        tid,
        identifiantColonne,
        { untieColIdFromLabel: true },
      ]),
      ["ModifyColumn", tid, "Date_faits", { label: "Date des faits" }],
      ["ModifyColumn", tid, "Date", { label: "Date de saisie" }],
      [
        "ModifyColumn",
        tid,
        "Qualification",
        { widgetOptions: JSON.stringify({ choices: ["Catégorie 1", "Catégorie 2"], choiceOptions: {} }) },
      ],
      [
        "ModifyColumn",
        tid,
        "Nature",
        { widgetOptions: JSON.stringify({ choices: ["Nouveau signalement", "Mise à jour"] }) },
      ],
      ...(opts.site ? [["ModifyColumn", tid, "Site", { label: "Site / bâtiment" }]] : []),
    ]);
    await lireMeta();
    return tid;
  }
  $("form-nouveau").addEventListener("submit", async (evenement) => {
    evenement.preventDefault();
    const nom = $("nf-nom").value.trim();
    if (!nom) return;
    if (formulaires.some((formulaire) => formulaire.nom === nom)) {
      $("nf-erreur").textContent = "Un formulaire porte déjà ce nom.";
      return;
    }
    try {
      if (!(await lireFormulaires())) {
        await creerTableFormulaires();
        await lireMeta();
      }
      if (!colonnesDe(TABLE_FORMULAIRES).Type) {
        await actions([["AddColumn", TABLE_FORMULAIRES, "Type", { type: "Text", isFormula: false }]]);
        await lireMeta();
      }
      let table = duplication ? courant.table : $("nf-table").value;
      const type = duplication ? courant.type : $("nf-type").value;
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
      } else if (!duplication && type === "etablissement") {
        // table existante : référentiel choisi (colonne Etablissement créée, ou rattachée à un autre référentiel)
        const analyse = await analyserReferentiel(table, $("nf-etab").value);
        if (analyse.erreur) {
          $("nf-erreur").textContent = analyse.erreur;
          return;
        }
        await appliquerReferentiel(table, analyse);
      }
      const conf = duplication ? copie(courant.conf) : { blocs: [] };
      if (duplication)
        conf.blocs.forEach((bloc) => {
          bloc.id = nouvelId();
        });
      const res = await actions([
        [
          "AddRecord",
          TABLE_FORMULAIRES,
          null,
          { Nom: nom, Table: table, Type: type, Brouillon: JSON.stringify(conf), Modifie_le: maintenant() },
        ],
      ]);
      const id = res && res.retValues && res.retValues[0];
      await lireFormulaires();
      const formulaire = formulaires.find((candidat) => candidat.id === id) || formulaires[formulaires.length - 1];
      $("dlg-nouveau").close();
      charger(formulaire);
      remplirChoixFormulaire();
      dessinerApercu();
      dessinerPanneau();
      if (
        !duplication &&
        !$("nf-bloc-import").hidden &&
        $("nf-import").checked &&
        Object.values(meta).some(
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
      if (!duplication && $("nf-modele").value === "esr-sites") {
        const resume = await installerModeleSites();
        message(
          `Formulaire « enseignement supérieur par site » créé : ${resume}. Vérifiez les choix de qualification (du plus grave au moins grave), puis publiez.`,
          "ok",
        );
        return;
      }
      message(
        duplication
          ? "Formulaire dupliqué (mêmes colonnes, même table). Publiez-le pour l'utiliser sur une page."
          : "Formulaire créé.",
        "ok",
      );
    } catch (erreur) {
      $("nf-erreur").textContent = `Échec : ${erreur.message || erreur}`;
    }
  });
  /* ---------- Modèle « Enseignement supérieur par site » ----------
   Sur le formulaire qui vient d'être créé : référentiel des sites (repris s'il existe : table « …site… » qui renvoie
   vers le référentiel des établissements, sinon Referentiel_sites créée), table des correspondances (libellé saisi →
   site), sous-table historisée Sites_signales (Site, Site_libre, Qualification du site, Precisions), question tableau
   « Sites concernés » réglée en tableau des sites, qualification de l'établissement en bas, déduite des sites. */
  async function installerModeleSites() {
    const rep = courant.table,
      etab = tableEtablissements() || referentielDe(rep) || "Etablissements",
      faits = [];
    const existe = (identifiantTable) => metaTables[0].tableId.includes(identifiantTable);
    // référentiel des sites
    let ref = metaTables[0].tableId.find(
      (identifiantTable) =>
        /site/i.test(identifiantTable) &&
        !/signal|correspond/i.test(identifiantTable) &&
        Object.values(colonnesDe(identifiantTable)).some((colonne) => colonne.type === `Ref:${etab}`) &&
        !Object.values(colonnesDe(identifiantTable)).some((colonne) => colonne.type === `Ref:${rep}`),
    );
    if (!ref) {
      ref = identifiant("Referentiel_sites", metaTables[0].tableId);
      await actions([
        [
          "AddTable",
          ref,
          [
            ["Site_id", "Text"],
            ["Nom", "Text"],
            ["Etablissement", `Ref:${etab}`],
            ["Commune", "Text"],
            ["Latitude", "Numeric"],
            ["Longitude", "Numeric"],
            ["Source", "Choice"],
            ["Actif", "Bool"],
          ].map(([id, type]) => ({ id, type, isFormula: false })),
        ],
      ]);
      await actions([
        ["ModifyColumn", ref, "Source", { widgetOptions: JSON.stringify({ choices: ["OAD", "Manuel"] }) }],
      ]);
      faits.push(`référentiel des sites ${ref} créé (à alimenter : export OAD, sites saisis à la main)`);
    } else faits.push(`référentiel des sites : ${ref}`);
    // qualifications : celles de la table des réponses (choix d'attente remplacés par une proposition)
    await lireMeta();
    meta = metaCourante();
    const colonneQualification = rolesEffectifs().Qualification || "Qualification",
      optionsQualification = (meta[colonneQualification] && meta[colonneQualification].opts) || {};
    let choixQ = Array.isArray(optionsQualification.choices) ? optionsQualification.choices : [];
    if (!choixQ.length || choixQ.every((choix) => /^Catégorie \d+$/.test(choix))) {
      choixQ = ["Blocage total", "Blocage partiel", "Occupation", "Rassemblement", "RAS"];
      if (meta[colonneQualification])
        await actions([
          [
            "ModifyColumn",
            rep,
            colonneQualification,
            { widgetOptions: JSON.stringify({ ...optionsQualification, choices: choixQ }) },
          ],
        ]);
      faits.push("qualifications proposées (du plus grave au moins grave) : " + choixQ.join(", "));
    }
    const optsQ = JSON.stringify({ choices: choixQ, choiceOptions: optionsQualification.choiceOptions || {} });
    // correspondances
    if (!existe("Sites_correspondances")) {
      await actions([
        [
          "AddTable",
          "Sites_correspondances",
          [
            ["Etablissement", `Ref:${etab}`],
            ["Libelle", "Text"],
            ["Site", `Ref:${ref}`],
            ["Occurrences", "Int"],
            ["Statut", "Choice"],
          ].map(([id, type]) => ({ id, type, isFormula: false })),
        ],
      ]);
      await actions([
        [
          "ModifyColumn",
          "Sites_correspondances",
          "Statut",
          {
            widgetOptions: JSON.stringify({
              choices: ["À valider", "Validé", "Écarté"],
              choiceOptions: { Validé: { fillColor: "#B8FEC9" }, Écarté: { fillColor: "#EEEEEE" } },
            }),
          },
        ],
      ]);
      faits.push("table Sites_correspondances créée");
    }
    // sous-table des sites
    await lireMeta();
    const tableSites = identifiant("Sites_signales", metaTables[0].tableId);
    await actions([
      [
        "AddTable",
        tableSites,
        [
          { id: "Dossier", type: `Ref:${rep}`, isFormula: false },
          { id: "Ligne_id", type: "Text", isFormula: false },
          { id: "Ordre", type: "Int", isFormula: false },
          { id: "Site", type: `Ref:${ref}`, isFormula: false },
          { id: "Site_libre", type: "Text", isFormula: false },
          { id: "Qualification", type: "Choice", isFormula: false },
          { id: "Precisions", type: "Text", isFormula: false },
        ],
      ],
    ]);
    // identifiants détachés des libellés d'abord : sans cela, Grist renommerait Site_libre, Qualification… d'après le libellé
    await actions([
      ...["Site", "Site_libre", "Qualification", "Precisions"].map((identifiantColonne) => [
        "ModifyColumn",
        tableSites,
        identifiantColonne,
        { untieColIdFromLabel: true },
      ]),
      ["ModifyColumn", tableSites, "Site", { label: "Site" }],
      ["ModifyColumn", tableSites, "Site_libre", { label: "Site hors référentiel", description: "[court]" }],
      [
        "ModifyColumn",
        tableSites,
        "Qualification",
        { label: "Qualification du site", widgetOptions: optsQ, description: "*" },
      ],
      ["ModifyColumn", tableSites, "Precisions", { label: "Précisions" }],
    ]);
    await lireMeta();
    const hist = actionsHistoriqueTableau(tableSites, "Dossier");
    if (hist.length) {
      await actions(hist);
      await lireMeta();
    }
    faits.push(`sous-table ${tableSites} (historisée)`);
    // question tableau des sites, qualification en bas
    meta = metaCourante();
    const colonne = await creerColonne(rep, "Sites concernés", "Text", null);
    blocs().push({
      id: nouvelId(),
      section: "q",
      genre: "question",
      colonne,
      reglages: {
        libelle: "Sites concernés",
        tableau: {
          table: tableSites,
          sites: {
            site: "Site",
            libre: "Site_libre",
            qualif: "Qualification",
            historique: [],
            alias: "Sites_correspondances",
          },
        },
      },
    });
    courant.conf.saisie = { ...(courant.conf.saisie || {}), version: "esr", qualificationEnBas: true };
    sauver();
    dessinerApercu();
    dessinerPanneau();
    reglesApresTableau(tableSites);
    return faits.join(" ; ");
  }
  $("btn-nouveau").addEventListener("click", () => ouvrirNouveau(false));
  $("btn-dupliquer").addEventListener("click", () => courant && ouvrirNouveau(true));
  $("btn-tester").addEventListener("click", () => courant && basculerTest());
  async function reglesApresTableau(table) {
    clearTimeout(minuterie);
    const json = JSON.stringify(courant.conf),
      id = courant.id;
    enregistrementEnCours = enregistrementEnCours.then(() =>
      actions([["UpdateRecord", TABLE_FORMULAIRES, id, { Brouillon: json, Modifie_le: maintenant() }]]),
    );
    try {
      await enregistrementEnCours;
    } catch (_) {
      return;
    }
    let acces = { etat: "" };
    try {
      if (window.OngletAcces && window.OngletAcces.reappliquerSiBesoin)
        acces = await window.OngletAcces.reappliquerSiBesoin();
    } catch (erreur) {
      acces = { etat: "refusees", texte: String(erreur.message || erreur) };
    }
    if (acces.etat === "reappliquees") message(`Table ${table} : règles d'accès du socle appliquées.`, "ok");
    else if (["incomplet", "refusees", "illisibles"].includes(acces.etat))
      message(`Table ${table} : ${acces.texte}`, "err");
  }
  $("btn-publier").addEventListener("click", publier);
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
    if (tables.includes(voulu)) {
      message(`La table « ${voulu} » existe déjà dans le document : choisissez un autre nom.`, "err");
      return;
    }
    const autres = formulaires
      .filter((formulaire) =>
        [formulaire.brouillon, formulaire.publie].some((j) => String(j || "").includes(`"table":"${ancien}"`)),
      )
      .map((formulaire) => formulaire.nom);
    if (
      !confirm(
        `Renommer la table « ${ancien} » en « ${voulu} » ?\n\nDans Grist : lignes, références et formules suivent.\nFormulaires mis à jour (brouillon et version publiée) : ${autres.join(", ") || courant.nom}.\n\nLes widgets ouverts ailleurs (saisie, cartographie) sont à recharger.`,
      )
    )
      return;
    try {
      await clearTimeout(minuterie);
      await enregistrementEnCours; // brouillon en attente : écrit avant
      const avant = new Set(tables);
      await actions([["RenameTable", ancien, voulu]]);
      await lireMeta();
      const nouveau = tables.includes(voulu)
        ? voulu
        : tables.find((identifiantTable) => !avant.has(identifiantTable)) || voulu; // nom éventuellement ajusté par Grist
      // formulaires : réglages.tableau.table, brouillons et versions publiées
      const remplacer = (j) => {
        if (!j) return j;
        let conf;
        try {
          conf = JSON.parse(j);
        } catch (_) {
          return j;
        }
        let nombre = 0;
        (conf.blocs || []).forEach((bloc) => {
          if (bloc.reglages && bloc.reglages.tableau && bloc.reglages.tableau.table === ancien) {
            bloc.reglages.tableau.table = nouveau;
            nombre++;
          }
        });
        return nombre ? JSON.stringify(conf) : j;
      };
      courant.conf.blocs.forEach((bloc) => {
        if (bloc.reglages && bloc.reglages.tableau && bloc.reglages.tableau.table === ancien)
          bloc.reglages.tableau.table = nouveau;
      });
      const acts = [];
      for (const formulaire of formulaires) {
        const brouillon = formulaire.id === courant.id ? JSON.stringify(courant.conf) : remplacer(formulaire.brouillon),
          publie = remplacer(formulaire.publie);
        if (brouillon !== formulaire.brouillon || publie !== formulaire.publie) {
          acts.push(["UpdateRecord", TABLE_FORMULAIRES, formulaire.id, { Brouillon: brouillon, Publie: publie }]);
          formulaire.brouillon = brouillon;
          formulaire.publie = publie;
        }
        if (formulaire.id === courant.id) courant.publie = publie;
      }
      // Config : profils de l'atlas (marques.table, sites.table) et tout autre réglage dont une clé « table » vaut l'ancien nom
      try {
        const cfg = await Socle.lireConfig();
        if (cfg)
          for (const [cle, val] of Object.entries(cfg.valeurs || {})) {
            if (!val || typeof val !== "object") continue;
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
            const copieVal = JSON.parse(JSON.stringify(val));
            marcher(copieVal);
            if (nombre) acts.push(Socle.actionConfig(cfg, cle, copieVal));
          }
      } catch (_) {
        /* sans Config : formulaires seulement */
      }
      if (acts.length) await actions(acts);
      meta = metaCourante();
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
  async function publier() {
    if (!courant) return;
    if (courant.type === "etablissement") {
      const roles = rolesEffectifs(),
        manq = ORDRE_ROLES.filter((role) => ROLE_PAR_ID[role].requis && !roles[role]);
      if (manq.length) {
        message(
          `Publication impossible : associez une colonne à ${manq.map((role) => ROLE_PAR_ID[role].lib.toLowerCase()).join(", ")} (panneau « Formulaire » › « Colonnes de la table des réponses »).`,
          "err",
        );
        choisir(null);
        return;
      }
      courant.conf.roles = roles; // colonnes proposées confirmées par la publication
    }
    const manquantes = blocs().filter((bloc) => bloc.genre === "question" && !meta[bloc.colonne]);
    if (
      manquantes.length &&
      !confirm(
        `${manquantes.length} question(s) renvoient à une colonne absente et seront ignorées. Publier quand même ?`,
      )
    )
      return;
    const conf = copie(courant.conf);
    // document à deux champs : la version du formulaire est fixée d'après sa table (le widget n'a plus à la deviner)
    if (
      !(conf.saisie && PRESETS[conf.saisie.version]) &&
      espaceCourant() &&
      window.Socle.espaces(window.Socle.general(socleConfig)).length > 1
    )
      conf.saisie = { ...(conf.saisie || {}), version: espaceCourant().version };
    const json = JSON.stringify(conf);
    try {
      // les libellés modifiés passent aussi dans Grist (en-têtes de colonnes), sans changer les identifiants
      const acts = [];
      for (const bloc of blocs()) {
        const colonne = meta[bloc.colonne];
        if (
          bloc.genre === "question" &&
          colonne &&
          bloc.reglages &&
          bloc.reglages.libelle &&
          bloc.reglages.libelle !== colonne.libelle
        )
          acts.push(
            ["ModifyColumn", courant.table, colonne.colId, { untieColIdFromLabel: true }],
            ["ModifyColumn", courant.table, colonne.colId, { label: bloc.reglages.libelle }],
          );
      }
      acts.push([
        "UpdateRecord",
        TABLE_FORMULAIRES,
        courant.id,
        { Publie: json, Brouillon: json, Publie_le: maintenant() },
      ]);
      await actions(acts);
      courant.publie = json;
      courant.publieLe = maintenant();
      const formulaire = formulaires.find((candidat) => candidat.id === courant.id);
      if (formulaire) {
        formulaire.publie = json;
        formulaire.brouillon = json;
        formulaire.publieLe = courant.publieLe;
      }
      await lireMeta();
      meta = metaCourante();
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
      const sansPage = pagesSaisie && !pagesSaisie.some((page) => page.table === courant.table);
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
        `Supprimer le formulaire « ${courant.nom} » ?\nSes colonnes et les réponses restent dans la table ${courant.table} ; les pages qui l'affichaient reviendront aux questions associées dans le widget.`,
      )
    )
      return;
    try {
      await actions([["RemoveRecord", TABLE_FORMULAIRES, courant.id]]);
      await lireFormulaires();
      courant = null;
      if (formulaires[0]) charger(formulaires[0]);
      remplirChoixFormulaire();
      dessinerApercu();
      dessinerPanneau();
    } catch (erreur) {
      message(`Suppression refusée : ${erreur.message || erreur}`, "err");
    }
  }

  /* =========================================================
   Référentiel des établissements et données de la fiche
   ========================================================= */
  // Table visée par la colonne Etablissement de la table des réponses
  const tableEtablissements = () => {
    const colonneEtablissement = meta.Etablissement;
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
    const ref = meta[correspondance[1]];
    return correspondance[1] === "Etablissement" ||
      (ref && tableEtablissements() && ref.type === `Ref:${tableEtablissements()}`)
      ? correspondance[2]
      : null;
  }
  const libelleColonneEtablissement = (src) => {
    const colonne = colonnesDe(tableEtablissements() || "")[src];
    return colonne ? colonne.libelle : src;
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

  /* ---------- mode test : établissement choisi dans le référentiel ---------- */
  let etablissementsTest = null,
    etablissementTest = null,
    colonnesEtablissementTest = {},
    siteTest = "",
    descriptionTestManuelle = false;
  function trouverColonneEtablissement(colonnes, motifs, sauf) {
    const listeColonnes = Object.values(colonnes),
      cle = (colonne) => normaliser(`${colonne.colId} ${colonne.libelle}`).replace(/[^a-z0-9]+/g, "_");
    for (const motif of motifs) {
      const colonneTrouvee = listeColonnes.find(
        (candidate) => motif.test(cle(candidate)) && !(sauf && sauf.test(cle(candidate))),
      );
      if (colonneTrouvee) return colonneTrouvee.colId;
    }
    return null;
  }
  async function chargerEtablissementsTest() {
    const identifiantTable = tableEtablissements();
    etablissementsTest = [];
    if (!identifiantTable) return;
    try {
      const donneesTable = await Donnees.lire(identifiantTable),
        cols = Object.keys(donneesTable).filter((identifiantColonne) => identifiantColonne !== "manualSort");
      etablissementsTest = donneesTable.id.map((id, i) => {
        const ligne = {};
        cols.forEach((identifiantColonne) => {
          ligne[identifiantColonne] = donneesTable[identifiantColonne][i];
        });
        return ligne;
      });
      devinerColonnesEtablissement();
    } catch (_) {
      etablissementsTest = [];
    }
  }
  function devinerColonnesEtablissement() {
    // colonnes du référentiel reconnues d'après leur identifiant ou leur libellé
    const colonnes = colonnesDe(tableEtablissements() || "");
    colonnesEtablissementTest = {
      nom: colonnes.Nom
        ? "Nom"
        : trouverColonneEtablissement(
            colonnes,
            [/(^|_)nom(_|$)/, /appellation|denomination|libelle|intitule/, /etablissement/],
            /commune|ville|academi|departement|region|type|sigle|uai|tutelle|mail/,
          ),
      uai: colonnes.UAI
        ? "UAI"
        : trouverColonneEtablissement(colonnes, [/(^|_)(uai|rne)(_|$)/, /uai|rne/], /tutelle|siege|parent/),
      commune: colonnes.Commune
        ? "Commune"
        : trouverColonneEtablissement(colonnes, [/commune|ville|localite/], /code|insee|postal/),
      type: colonnes.Type
        ? "Type"
        : trouverColonneEtablissement(
            colonnes,
            [/^type/, /(^|_)type(_|$)/, /nature|categorie|typologie/],
            /code|contrat/,
          ),
      academie: colonnes.Academie ? "Academie" : trouverColonneEtablissement(colonnes, [/academie/], /code|region/),
      departement: colonnes.Departement
        ? "Departement"
        : trouverColonneEtablissement(colonnes, [/departement/], /code|numero/),
      mail: colonnes.Mail ? "Mail" : trouverColonneEtablissement(colonnes, [/mail|courriel/], /annuaire/),
      region: trouverColonneEtablissement(colonnes, [/region_?academique/, /region/], /code/),
    };
  }
  const colonneDuRole = (k) => (confSaisie().colonnes || {})[k] || colonnesEtablissementTest[k] || null; // colonne imposée par le formulaire, sinon reconnue
  const nomEtablissement = (etablissement) =>
    String((colonneDuRole("nom") && etablissement[colonneDuRole("nom")]) || `Établissement n° ${etablissement.id}`);
  const libelleEtablissementTest = (etablissement) =>
    `${nomEtablissement(etablissement)}${colonnesEtablissementTest.uai && etablissement[colonnesEtablissementTest.uai] ? ` — ${etablissement[colonnesEtablissementTest.uai]}` : ""}`;
  function chercherEtablissementTest(recherche) {
    const liste = $("test-etab-liste");
    if (!liste || !etablissementsTest) return;
    const exact = etablissementsTest.find((etablissement) => libelleEtablissementTest(etablissement) === recherche);
    if (exact) {
      etablissementTest = exact;
      majEtablissementTest();
      return;
    }
    if (etablissementTest && !recherche.trim()) {
      etablissementTest = null;
      majEtablissementTest();
    }
    const rechercheNormalisee = normaliser(recherche);
    const res =
      rechercheNormalisee.length < 2
        ? []
        : etablissementsTest
            .filter((etablissement) =>
              normaliser(
                `${nomEtablissement(etablissement)} ${colonnesEtablissementTest.uai ? etablissement[colonnesEtablissementTest.uai] || "" : ""}`,
              ).includes(rechercheNormalisee),
            )
            .slice(0, 30);
    liste.innerHTML = res
      .map((etablissement) => `<option value="${esc(libelleEtablissementTest(etablissement))}"></option>`)
      .join("");
  }
  function resumeEtablissementTestHtml() {
    const etablissement = etablissementTest,
      com = etablissement && colonnesEtablissementTest.commune ? etablissement[colonnesEtablissementTest.commune] : "";
    return etablissement
      ? `<b>${esc(nomEtablissement(etablissement))}</b>${com ? ` <span class="meta">· ${esc(com)}</span>` : ""}`
      : `<b>Établissement du dossier</b> <span class="meta">· choisi au signalement initial</span>`;
  }
  function majEtablissementTest() {
    // établissement de test choisi : résumé, titre (mise à jour), données de la fiche, description
    const resume = $("test-resume-etab");
    if (resume) resume.innerHTML = resumeEtablissementTestHtml();
    const fiche = $("test-fiche");
    if (fiche) {
      fiche.hidden = !etablissementTest;
      fiche.innerHTML = ficheTestHtml();
    }
    const titre = document.querySelector(".entete-apercu.maj h1");
    if (titre) titre.textContent = etablissementTest ? nomEtablissement(etablissementTest) : "Établissement du dossier";
    appliquerTest();
  }
  // Valeur d'une colonne formule en mode test ; undefined si l'aperçu ne sait pas la calculer
  function valeurFormuleTest(colonne) {
    const src = sourceColonneEtablissement(colonne);
    if (src) {
      const valeur = etablissementTest ? etablissementTest[src] : null;
      return valeur && typeof valeur === "object" && !Array.isArray(valeur) ? null : (valeur ?? null);
    }
    const formule = String(colonne.texteFormule || "")
      .trim()
      .replace(/^return\s+/, "");
    if (
      !/^[\s$\w.,+\-*/()]+$/.test(formule) ||
      !/\$\w/.test(formule) ||
      !/^[\s+\-*/()]*$/.test(formule.replace(/\$\w+/g, " ").replace(/\d+(?:[.,]\d+)?/g, " "))
    )
      return undefined;
    let manque = false;
    const expr = formule.replace(/\$(\w+)/g, (_, identifiantColonne) => {
      const valeur = identifiantColonne === colonne.colId ? null : valeurTest(identifiantColonne);
      if (typeof valeur !== "number") manque = true;
      return `(${Number(valeur) || 0})`;
    });
    if (manque) return null;
    try {
      const resultat = Function(`"use strict"; return (${expr.replace(/,/g, ".")});`)();
      return Number.isFinite(resultat) ? Math.round(resultat * 1e6) / 1e6 : null;
    } catch (_) {
      return null;
    }
  }
  function majFormulesTest() {
    document.querySelectorAll("[data-formule]").forEach((element) => {
      const colonne = meta[element.dataset.formule];
      if (!colonne) return;
      const valeur = valeurFormuleTest(colonne);
      element.textContent =
        valeur === undefined
          ? "Valeur calculée par Grist à l'enregistrement"
          : valeur == null || valeur === ""
            ? "—"
            : valeurLisible(colonne, valeur);
    });
  }

  /* =========================================================
   Description automatique : réglages communs (clé resume_auto de Config, autrefois table Parametres) ou propres au formulaire
   ---------------------------------------------------------
   conf.description = { perso: true, actif, format, separateur, puce, entete, qualification, questions, mobilisation, formatsType } ;
   le format de chaque question reste dans ses réglages (reglages.format), celui des champs d'un tableau dans
   reglages.descTableau = { colonne: { ligne, decompte } }. Le widget de saisie applique ces réglages à la place
   des réglages communs quand perso est vrai. Les réglages communs se modifient dans le panneau Description (mode
   « Communs ») et s'enregistrent pour tous les formulaires, sans publication.
   ========================================================= */
  const DESCRIPTION_DEFAUT = {
    actif: true,
    format: "libelle",
    separateur: "ligne",
    puce: "",
    entete: true,
    qualification: true,
    questions: true,
    mobilisation: true,
    formatsType: {},
    formatsQuestion: {},
    formatsTableau: {},
  };
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
  ];
  const SEPARATEURS = { ligne: "\n", pv: " ; ", virgule: ", ", barre: " / ", espace: " ", point: ". " };
  let reglagesCommuns = null;
  async function lireReglagesCommuns() {
    if (socleConfig && socleConfig.valeurs.resume_auto) {
      reglagesCommuns = socleConfig.valeurs.resume_auto;
      return;
    }
    try {
      const donneesTable = await Donnees.lire("Parametres");
      const texteJson = donneesTable.Resume_auto && donneesTable.Resume_auto[0];
      reglagesCommuns = texteJson ? JSON.parse(texteJson) : {};
    } catch (_) {
      reglagesCommuns = socleConfig ? {} : null;
    }
  }
  /* Réglages communs modifiés dans le panneau Description, pas encore enregistrés (null : aucune modification).
     Ils s'appliquent à tous les formulaires sans réglages propres, dès l'enregistrement (clé resume_auto de Config). */
  let brouillonCommuns = null;
  function demarrerBrouillonCommuns() {
    if (!brouillonCommuns) {
      const actuels = { ...DESCRIPTION_DEFAUT, ...(reglagesCommuns || {}) };
      brouillonCommuns = {};
      for (const k of [...CLES_DESCRIPTION, "formatsTableau"])
        brouillonCommuns[k] = copie(actuels[k] ?? DESCRIPTION_DEFAUT[k]);
    }
    return brouillonCommuns;
  }
  async function enregistrerReglagesCommuns() {
    if (!brouillonCommuns) return;
    const valeur = { ...(reglagesCommuns || {}), ...brouillonCommuns, description: false };
    await window.Socle.ecrireConfig("resume_auto", valeur);
    if (socleConfig && socleConfig.valeurs) socleConfig.valeurs.resume_auto = valeur;
    reglagesCommuns = valeur;
    brouillonCommuns = null;
  }
  const descriptionPropre = () => !!(courant && courant.conf.description && courant.conf.description.perso);
  function optionsDescription() {
    const communs = { ...DESCRIPTION_DEFAUT, ...(reglagesCommuns || {}), ...(brouillonCommuns || {}) };
    if (!descriptionPropre()) return communs;
    const reglagesPropres = courant.conf.description,
      options = { ...communs, formatsQuestion: {}, formatsTableau: {} };
    for (const k of CLES_DESCRIPTION) if (k in reglagesPropres) options[k] = copie(reglagesPropres[k]);
    for (const bloc of blocs()) {
      const reglagesTableau = bloc.reglages && bloc.reglages.descTableau;
      if (bloc.colonne && reglagesTableau && Object.keys(reglagesTableau).length)
        options.formatsTableau[bloc.colonne] = reglagesTableau;
    }
    return options;
  }
  function joindreDescription(elements, options) {
    const elementsNonVides = elements.filter((element) => String(element).trim());
    if (options.separateur !== "point") return elementsNonVides.join(SEPARATEURS[options.separateur] ?? "\n");
    if (!elementsNonVides.length) return "";
    const texte = elementsNonVides.map((element) => String(element).trim().replace(/\.+$/, "")).join(". ");
    return /[.!?…]$/.test(texte) ? texte : texte + ".";
  }
  function formatPourItem(item, options) {
    const reglagesBloc = (item.b && item.b.reglages) || {};
    if (reglagesBloc.format && reglagesBloc.format !== "defaut") return reglagesBloc.format;
    const formatQuestion = item.c && (options.formatsQuestion || {})[item.c.colId];
    if (formatQuestion && formatQuestion !== "defaut") return formatQuestion;
    const formatType = item.c && !item.tableau && (options.formatsType || {})[familleQuestion(item.c)];
    if (formatType && formatType !== "defaut") return formatType;
    return options.format;
  }
  // Champs d'un tableau dans la description (mêmes règles que le widget de saisie)
  const champDecomptable = (sousColonne) =>
    ["Choice", "ChoiceList", "Bool", "Ref", "RefList", "Numeric", "Int"].includes(typeBase(sousColonne.type));
  function modeChampTableau(bloc, sousColonne, options) {
    const reglagesSousColonne = ((options.formatsTableau || {})[bloc.colonne] || {})[sousColonne.colId];
    const ligne =
      reglagesSousColonne && ["defaut", "libelle", "valeur", "exclure"].includes(reglagesSousColonne.ligne)
        ? reglagesSousColonne.ligne
        : "defaut";
    if (!reglagesSousColonne && estQualifSous(sousColonne)) return { ligne, decompte: true }; // qualification d'une ligne : décompte en tête par défaut
    return {
      ligne,
      decompte: !!(reglagesSousColonne && reglagesSousColonne.decompte && champDecomptable(sousColonne)),
    };
  }
  const estQualifSous = (sousColonne) =>
    !!sousColonne &&
    typeBase(sousColonne.type) === "Choice" &&
    (/qualif/i.test(sousColonne.colId) || /qualif/i.test(sousColonne.libelle || ""));
  function texteTableauAdmin(bloc, lignesBrutes, options) {
    const tous = sousColonnes(bloc.reglages.tableau.table).filter((sousColonne) => !sousColonne.r.masque),
      sous = tous.filter((sousColonne) => !sousColonne.r.confidentiel);
    const vis = (ligne, sousColonne) => visibleDansLigne(sousColonne, tous, ligne);
    const lignes = lignesBrutes.filter((ligne) =>
      tous.some((sousColonne) => vis(ligne, sousColonne) && !estVideValeur(ligne[sousColonne.colId])),
    );
    if (!lignes.length) return "";
    const parts = [];
    for (const sousColonne of sous.filter((colonne) => modeChampTableau(bloc, colonne, options).decompte)) {
      const typeDeBase = typeBase(sousColonne.type);
      if (typeDeBase === "Numeric" || typeDeBase === "Int") {
        const nombres = lignes
          .filter((ligne) => vis(ligne, sousColonne) && typeof ligne[sousColonne.colId] === "number")
          .map((ligne) => ligne[sousColonne.colId]);
        if (nombres.length)
          parts.push(
            `${sousColonne.libelle} : ${nombres.reduce((cumul, nombre) => cumul + nombre, 0).toLocaleString("fr-FR")}`,
          );
        continue;
      }
      const compte = new Map();
      for (const ligne of lignes) {
        if (!vis(ligne, sousColonne) || estVideValeur(ligne[sousColonne.colId])) continue;
        const valeur = ligne[sousColonne.colId];
        for (const reponse of Array.isArray(valeur) ? valeur : [valeurLisible(sousColonne, valeur)])
          compte.set(reponse, (compte.get(reponse) || 0) + 1);
      }
      const ordre = sousColonne.opts.choices || [],
        rang = (reponse) => {
          const i = ordre.indexOf(reponse);
          return i < 0 ? 1e9 : i;
        };
      if (compte.size)
        parts.push(
          `${sousColonne.libelle} : ${[...compte]
            .sort((entreeA, entreeB) => rang(entreeA[0]) - rang(entreeB[0]))
            .map(([reponse, nombre]) => `${reponse} ${nombre}`)
            .join(", ")}`,
        );
    }
    const tete = sous.some(estQualifSous)
      ? `${lignes.length}${parts.length ? ` — ${parts.join(" ; ")}` : ""}`
      : `${lignes.length}${parts.length ? ` (${parts.join(" ; ")})` : ""}`;
    const fmtGen = (sousColonne) => {
      const format = (options.formatsType || {})[familleQuestion(sousColonne)];
      return format && format !== "defaut" ? format : options.format;
    };
    const valeurs = (ligne) =>
      sous
        .filter(
          (sousColonne) =>
            !sousColonne.r.auto &&
            modeChampTableau(bloc, sousColonne, options).ligne !== "exclure" &&
            vis(ligne, sousColonne),
        )
        .map((sousColonne) => {
          const modeLigne = modeChampTableau(bloc, sousColonne, options).ligne,
            avecLib = modeLigne === "libelle" || (modeLigne === "defaut" && fmtGen(sousColonne) !== "valeur"),
            txt = valeurLisible(sousColonne, ligne[sousColonne.colId]);
          if (!avecLib && typeBase(sousColonne.type) === "Bool")
            return ligne[sousColonne.colId] ? sousColonne.libelle : "";
          return txt ? (avecLib ? `${sousColonne.libelle} : ${txt}` : txt) : "";
        })
        .filter(Boolean);
    const autos = sous.filter(
      (sousColonne) => sousColonne.r.auto && modeChampTableau(bloc, sousColonne, options).ligne !== "exclure",
    );
    if (
      !autos.length &&
      !sous.some(
        (sousColonne) => !sousColonne.r.auto && modeChampTableau(bloc, sousColonne, options).ligne !== "exclure",
      )
    )
      return tete;
    const det = lignes
      .map((ligne, k) => {
        const repris = autos
          .filter((sousColonne) => vis(ligne, sousColonne))
          .map((sousColonne) => String(ligne[sousColonne.colId] ?? "").trim() || texteAutoTest(tous, ligne))
          .filter(Boolean)
          .join(" — ");
        const valeursLigne = repris ? [repris] : valeurs(ligne);
        return valeursLigne.length ? `${k + 1}. ${valeursLigne.join(" — ")}` : "";
      })
      .filter(Boolean);
    return [tete, ...det].join("\n");
  }
  function elementsTableauAdmin(item, fmt, options) {
    const [tete = "", ...lignes] = String(item.valeur ?? "")
      .split(/\s*\n\s*/)
      .filter(Boolean);
    let enTete = "";
    if (fmt === "exclure") enTete = tete.replace(/^\d+\s*(—\s*)?/, "").replace(/^\((.*)\)$/, "$1");
    else if (tete) enTete = fmt === "valeur" ? tete : `${item.libelle} : ${tete}`;
    return [enTete, ...lignes].filter(Boolean).map((ligne) => `${options.puce || ""}${ligne}`);
  }
  // En-tête : version ESR (table avec Site) « **Nom** (site) », sinon « **Nom**, **Commune** »
  function enteteDescriptionAdmin(ident) {
    return String(ident.nom || "").trim() ? appliquerModele(saisieEffective().entete, ident) : "";
  }
  const estRienASignaler = (qualification) => !!qualification && String(qualification).trim().toUpperCase() === "RAS";
  function descriptionTexte(options, items, ident, jour, qualif) {
    if (!options.actif) return "";
    const corps = joindreDescription(
      items.flatMap((item) => {
        const fmt = formatPourItem(item, options);
        if (item.tableau) return elementsTableauAdmin(item, fmt, options);
        if (fmt === "exclure") return [];
        const valeur = String(item.valeur ?? "")
          .replace(/\s*\n\s*/g, " ")
          .trim();
        return [`${options.puce || ""}${fmt === "valeur" ? valeur : `${item.libelle} : ${valeur}`}`];
      }),
      options,
    );
    const tete = options.entete ? enteteDescriptionAdmin(ident) : "";
    let texte = tete && corps ? `${tete} : ${corps}` : tete || corps;
    if (options.mobilisation && !estRienASignaler(qualif))
      texte += `${options.separateur === "ligne" && texte ? "\n" : texte ? " " : ""}(${jour === 1 ? "1er" : jour + "e"} jour de mobilisation)`;
    return texte;
  }
  // Questions du formulaire de signalement qui peuvent entrer dans la description (hors visas)
  function questionsDescription() {
    const roles = new Map(parties().map((partie) => [partie.id, partie.role]));
    return blocs()
      .filter((bloc) => bloc.genre === "question" && meta[bloc.colonne] && roles.get(bloc.section || "q") === "q")
      .map((bloc) => ({ b: bloc, c: meta[bloc.colonne], r: bloc.reglages || {} }));
  }
  function itemsDescriptionTest(options) {
    const items = [],
      qualification = valeurTest("Qualification");
    if (options.qualification && meta.Qualification && qualification)
      items.push({
        libelle: meta.Qualification.libelle || "Qualification",
        valeur: qualification,
        c: meta.Qualification,
      });
    if (options.questions)
      for (const { b: bloc, c: colonne, r: reglages } of questionsDescription()) {
        const element = document.querySelector(`[data-bloc="${bloc.id}"]`);
        if (reglages.confidentiel || !element || element.classList.contains("masque-test")) continue;
        if (reglages.tableau && reglages.tableau.table) {
          const texte = texteTableauAdmin(bloc, testLignes[bloc.colonne] || [], options);
          if (texte)
            items.push({
              libelle: reglages.libelle || colonne.libelle,
              valeur: texte,
              b: bloc,
              c: colonne,
              tableau: true,
            });
          continue;
        }
        const valeur = valeurTest(bloc.colonne);
        if (valeur === undefined || estVideValeur(valeur)) continue;
        items.push({
          libelle: reglages.libelle || colonne.libelle,
          valeur: valeurLisible(colonne, valeur),
          b: bloc,
          c: colonne,
        });
      }
    return items;
  }
  function majDescriptionTest() {
    const zoneDescription = $("test-description"),
      etat = $("etat-desc-test");
    if (!zoneDescription) return;
    const options = optionsDescription();
    if (!options.actif) {
      etat.textContent = "Pré-remplissage désactivé : la description se saisit librement.";
      return;
    }
    if (!descriptionTestManuelle)
      zoneDescription.value = descriptionTexte(
        options,
        itemsDescriptionTest(options),
        etablissementTest
          ? { ...valeursEtablissementTest(etablissementTest), site: siteTest.trim() }
          : { nom: "", site: siteTest.trim() },
        1,
        valeurTest("Qualification"),
      );
    etat.innerHTML = descriptionTestManuelle
      ? `✎ Texte modifié à la main : il ne suit plus les réponses. <button type="button" class="ajout-lien" id="btn-desc-auto">Reprendre le texte automatique</button>`
      : "↻ Rédigé automatiquement : le texte suit les réponses du formulaire.";
  }
  // Exemple avec des réponses fictives (panneau et aperçu en édition)
  function lignesExempleAdmin(bloc) {
    return [0, 1].map((k) => {
      const ligne = {};
      for (const sousColonne of sousColonnes(bloc.reglages.tableau.table)) {
        const typeDeBase = typeBase(sousColonne.type),
          choix = sousColonne.opts.choices || [];
        if (sousColonne.r.auto) continue;
        if (typeDeBase === "Choice") ligne[sousColonne.colId] = choix[k % Math.max(choix.length, 1)] || "Oui";
        else if (typeDeBase === "ChoiceList")
          ligne[sousColonne.colId] = choix.length ? [choix[k % choix.length]] : null;
        else if (typeDeBase === "Bool") ligne[sousColonne.colId] = k === 0;
        else if (typeDeBase === "Int" || typeDeBase === "Numeric") ligne[sousColonne.colId] = k + 1;
        else if (typeDeBase === "Date") ligne[sousColonne.colId] = Outils.dates.aujourdhui();
        else ligne[sousColonne.colId] = k === 0 ? "texte saisi" : "autre texte";
      }
      return ligne;
    });
  }
  function exempleDescription(options = optionsDescription()) {
    if (!courant) return "";
    if (!options.actif) return "(pré-remplissage désactivé : la description se saisit librement)";
    const colonneQualification = meta.Qualification,
      items = [];
    if (options.qualification && colonneQualification)
      items.push({
        libelle: colonneQualification.libelle || "Qualification",
        valeur: (colonneQualification.opts.choices || [])[0] || "Intrusion",
        c: colonneQualification,
      });
    if (options.questions)
      for (const { b: bloc, c: colonne, r: reglages } of questionsDescription()) {
        if (reglages.confidentiel) continue;
        if (reglages.tableau && reglages.tableau.table) {
          const texte = texteTableauAdmin(bloc, lignesExempleAdmin(bloc), options);
          if (texte)
            items.push({
              libelle: reglages.libelle || colonne.libelle,
              valeur: texte,
              b: bloc,
              c: colonne,
              tableau: true,
            });
          continue;
        }
        const valeur = colonne.formule
          ? sourceColonneEtablissement(colonne)
            ? familleQuestion(colonne) === "nombre"
              ? 12500
              : `${reglages.libelle || colonne.libelle} de la fiche`
            : 3
          : {
              nombre: 20,
              date: Outils.dates.aujourdhui(),
              case: true,
              choix: (colonne.opts.choices || [])[0] || "Oui",
              reference: "élément lié",
              texte: "texte saisi",
            }[familleQuestion(colonne)];
        items.push({
          libelle: reglages.libelle || colonne.libelle,
          valeur: valeurLisible(colonne, typeBase(colonne.type) === "ChoiceList" ? [valeur] : valeur),
          b: bloc,
          c: colonne,
        });
      }
    return (
      descriptionTexte(
        options,
        items,
        identiteExemple(),
        3,
        colonneQualification && (colonneQualification.opts.choices || [])[0],
      ) || "(aucun élément inclus)"
    );
  }
  // Choix du format d'une question dans la description (panneau de la question et panneau Description)
  function choixFormatQuestion(bloc) {
    const reglages = (bloc && bloc.reglages) || {},
      defaut = descriptionPropre() ? "Par défaut (réglage du formulaire)" : "Par défaut (réglages communs)";
    return reglages.tableau
      ? [
          ["defaut", defaut],
          ["libelle", "En-tête : libellé et nombre"],
          ["valeur", "En-tête : nombre seul"],
          ["exclure", "Sans en-tête (lignes seules)"],
        ]
      : [
          ["defaut", defaut],
          ["libelle", "Libellé : valeur"],
          ["valeur", "Valeur seule"],
          ["exclure", "Ne pas inclure"],
        ];
  }
  function panneauDescription() {
    const panneau = $("panneau"),
      colonneDescription = meta.Description,
      perso = descriptionPropre(),
      options = optionsDescription(),
      reglagesPropres = courant.conf.description,
      // réglages communs : modifiables ici dès que le document a sa table Config
      communsModifiables = !!socleConfig;
    const sel = (id, opts, valeurChoisie, lib) =>
      `<label class="l" for="${id}">${lib}</label><select id="${id}">${opts.map(([k, libelle]) => `<option value="${k}"${k === valeurChoisie ? " selected" : ""}>${libelle}</option>`).join("")}</select>`;
    const inter = (cle, lib) =>
      `<label class="interrupteur">${lib} <input type="checkbox" data-desc="${cle}"${options[cle] ? " checked" : ""}></label>`;
    const questions = questionsDescription();
    const familles = [
      ...new Set(questions.filter((question) => !question.r.tableau).map((question) => familleQuestion(question.c))),
    ];
    const optFmt = (valeur) =>
      [
        ["defaut", "Par défaut"],
        ["libelle", "Libellé : valeur"],
        ["valeur", "Valeur seule"],
      ]
        .map(
          ([k, libelle]) => `<option value="${k}"${k === (valeur || "defaut") ? " selected" : ""}>${libelle}</option>`,
        )
        .join("");
    const ligneQ = ({ b: bloc, c: colonne, r: reglages }) => {
      if (reglages.confidentiel)
        return `<div class="reglage-q"><div><span>${esc(reglages.libelle || colonne.libelle)}</span><small class="note" style="margin:0">confidentielle : jamais incluse</small></div></div>`;
      let html = `<div class="reglage-q"><div><span>${esc(reglages.libelle || colonne.libelle)}${colonne.formule ? ' <small class="note">(fiche)</small>' : ""}</span><select data-format-q="${esc(bloc.id)}" aria-label="Format de ${esc(reglages.libelle || colonne.libelle)}">${choixFormatQuestion(
        bloc,
      )
        .map(
          ([valeurOption, libelleOption]) =>
            `<option value="${valeurOption}"${(reglages.format || "defaut") === valeurOption ? " selected" : ""}>${valeurOption === "defaut" ? "Par défaut" : libelleOption}</option>`,
        )
        .join("")}</select></div>`;
      if ((perso || communsModifiables) && reglages.tableau && reglages.tableau.table)
        html += sousColonnes(reglages.tableau.table)
          .filter((sousColonne) => !sousColonne.r.masque)
          .map((sousColonne) => {
            if (sousColonne.r.confidentiel)
              return `<div class="sous-reglage"><span>↳ ${esc(sousColonne.libelle)}</span><small>confidentiel : jamais inclus</small></div>`;
            const mode = modeChampTableau(bloc, sousColonne, options),
              opts = sousColonne.r.auto
                ? [
                    ["defaut", "Reprendre ce texte"],
                    ["exclure", "Ne pas l'utiliser"],
                  ]
                : [
                    ["defaut", "Par défaut"],
                    ["libelle", "Libellé : valeur"],
                    ["valeur", "Valeur seule"],
                    ["exclure", "Ne pas inclure"],
                  ];
            return (
              `<div class="sous-reglage"><span>↳ ${esc(sousColonne.libelle)}</span><span style="display:flex;gap:6px;align-items:center">${champDecomptable(sousColonne) ? `<label><input type="checkbox" data-dt-dec="${esc(bloc.id)}" data-sc="${esc(sousColonne.colId)}"${mode.decompte ? " checked" : ""}> ${["Int", "Numeric"].includes(typeBase(sousColonne.type)) ? "somme" : "décompte"} en tête</label>` : ""}` +
              `<select data-dt-ligne="${esc(bloc.id)}" data-sc="${esc(sousColonne.colId)}" aria-label="${esc(sousColonne.libelle)} dans chaque ligne">${opts.map(([k, libelleOption]) => `<option value="${k}"${k === mode.ligne ? " selected" : ""}>${libelleOption}</option>`).join("")}</select></span></div>`
            );
          })
          .join("");
      return html + `</div>`;
    };
    panneau.innerHTML = `<h2>${esc(colonneDescription ? colonneDescription.libelle : "Description")}</h2><p class="sous">Champ commun · colonne Description</p>
    <p class="note">Rédigée automatiquement à partir des réponses ; l'agent peut la compléter ou la modifier avant d'enregistrer.</p>
    <div class="groupe"><div class="t">Réglages de la description automatique</div>
      <div class="seg2" role="group" aria-label="Origine des réglages"><button type="button" data-perso="0" aria-pressed="${!perso}">Communs à tous les formulaires</button><button type="button" data-perso="1" aria-pressed="${perso}">Propres à ce formulaire</button></div>
      ${
        perso || communsModifiables
          ? `${
              perso
                ? ""
                : `<p class="note" style="margin:0 0 8px">Réglages communs à tous les formulaires qui n'ont pas leurs propres réglages (clé resume_auto de Config). Ils s'appliquent dès leur enregistrement, sans publication.</p>`
            }${inter("actif", "Pré-remplir la description")}
        <div class="grille2"><div>${sel(
          "pd-format",
          [
            ["libelle", "Libellé : valeur"],
            ["valeur", "Valeur seule"],
          ],
          options.format,
          "Contenu de chaque élément",
        )}</div>
        <div>${sel(
          "pd-separateur",
          [
            ["ligne", "Retour à la ligne"],
            ["pv", "Point-virgule"],
            ["virgule", "Virgule"],
            ["barre", "Barre oblique"],
            ["espace", "Espace"],
            ["point", "Point"],
          ],
          options.separateur,
          "Séparateur",
        )}</div></div>
        <label class="l" for="pd-puce">Puce devant chaque élément</label><input type="text" id="pd-puce" maxlength="4" placeholder="Aucune" value="${esc(options.puce || "")}">
        ${inter("entete", meta.Site ? "Commencer par le nom de l'établissement (et le site)" : "Commencer par le nom de l'établissement et sa commune")}
        ${inter("qualification", "Inclure la qualification")}
        ${inter("questions", "Inclure les questions du formulaire")}
        ${inter("mobilisation", "Terminer par le jour de mobilisation")}`
          : `<p class="note" style="margin:0">Ce formulaire suit les réglages communs du document. Ils se modifient ici une fois la table Config créée (onglet Installation) ; en attendant, réglages par défaut.
         Choisissez « Propres à ce formulaire » pour les régler pour ce formulaire seulement : ils partent des réglages communs actuels et s'appliquent à la publication.</p>`
      }
      ${
        !perso && communsModifiables
          ? `<div class="actions" style="margin-top:8px"><button type="button" class="primaire petit" id="pd-communs-ok"${brouillonCommuns ? "" : " disabled"}>Enregistrer pour tous les formulaires</button>
        <span class="statut" id="pd-communs-statut" role="status">${brouillonCommuns ? "Modifications non enregistrées." : ""}</span></div>`
          : ""
      }
    </div>
    ${(perso || communsModifiables) && familles.length ? `<div class="groupe"><div class="t">Format par type de question</div>${familles.map((cleFamille) => `<div class="reglage-q"><div><span>${FAMILLES[cleFamille]}</span><select data-famille="${cleFamille}" aria-label="Format des ${FAMILLES[cleFamille].toLowerCase()}">${optFmt((options.formatsType || {})[cleFamille])}</select></div></div>`).join("")}</div>` : ""}
    <div class="groupe"><div class="t">Question par question</div>${questions.map(ligneQ).join("") || `<p class="note" style="margin:0">Aucune question dans le formulaire.</p>`}
      <p class="note" style="margin:6px 0 0">Prioritaire sur le format par type. Le format de chaque question est enregistré avec le formulaire ; celui des champs d'un tableau suit l'origine des réglages choisie plus haut.</p></div>
    ${groupeEnteteHtml()}
    <div class="groupe"><div class="t">Exemple</div><div class="exemple-desc" id="pd-exemple"></div>
      <p class="note" style="margin:6px 0 0">Avec des réponses fictives. En mode ▶ Tester, la description suit vos réponses.</p></div>`;
    // formulaireModifie : le changement porte sur le formulaire (enregistré en brouillon), pas sur les réglages communs
    const maj = (formulaireModifie = perso) => {
      if (formulaireModifie) sauver();
      else if ($("pd-communs-ok")) {
        $("pd-communs-ok").disabled = false;
        statutCommuns("Modifications non enregistrées.");
      }
      $("pd-exemple").textContent = exempleDescription();
      const exemple = document.querySelector('[data-commun="commun:Description"] .exemple-desc');
      if (exemple) exemple.textContent = exempleDescription();
    };
    $("pd-exemple").textContent = exempleDescription();
    lierEntete(panneau, () => maj(true));
    const statutCommuns = (texte, type) => {
      const zone = $("pd-communs-statut");
      if (!zone) return;
      zone.textContent = texte || "";
      zone.className = `statut ${type || ""}`;
    };
    if ($("pd-communs-ok"))
      $("pd-communs-ok").addEventListener("click", async () => {
        $("pd-communs-ok").disabled = true;
        try {
          await enregistrerReglagesCommuns();
          statutCommuns(
            "Réglages communs enregistrés : ils s'appliquent aux pages de saisie à leur prochaine lecture.",
            "ok",
          );
          dessinerApercu();
        } catch (erreur) {
          $("pd-communs-ok").disabled = false;
          statutCommuns(`Échec : ${erreur.message || erreur}`, "err");
        }
      });
    panneau.querySelectorAll("[data-perso]").forEach((bouton) =>
      bouton.addEventListener("click", () => {
        const oui = bouton.dataset.perso === "1";
        if (oui && !reglagesPropres) {
          const base = optionsDescription();
          courant.conf.description = { perso: true };
          for (const k of CLES_DESCRIPTION) courant.conf.description[k] = copie(base[k]);
        } else if (reglagesPropres) reglagesPropres.perso = oui;
        sauver();
        dessinerApercu();
        panneauDescription();
      }),
    );
    const reglagesActifs = () => (perso ? courant.conf.description : demarrerBrouillonCommuns());
    panneau.querySelectorAll("[data-desc]").forEach((caseACocher) =>
      caseACocher.addEventListener("change", () => {
        reglagesActifs()[caseACocher.dataset.desc] = caseACocher.checked;
        maj();
      }),
    );
    [
      ["pd-format", "format"],
      ["pd-separateur", "separateur"],
    ].forEach(([id, k]) => {
      const champ = $(id);
      if (champ)
        champ.addEventListener("change", () => {
          reglagesActifs()[k] = champ.value;
          maj();
        });
    });
    if ($("pd-puce"))
      $("pd-puce").addEventListener("input", (evenement) => {
        reglagesActifs().puce = evenement.target.value;
        maj();
      });
    panneau.querySelectorAll("[data-famille]").forEach((menu) =>
      menu.addEventListener("change", () => {
        const formatsType = (reglagesActifs().formatsType = { ...(reglagesActifs().formatsType || {}) });
        if (menu.value === "defaut") delete formatsType[menu.dataset.famille];
        else formatsType[menu.dataset.famille] = menu.value;
        maj();
      }),
    );
    panneau.querySelectorAll("[data-format-q]").forEach((menu) =>
      menu.addEventListener("change", () => {
        const bloc = blocDe(menu.dataset.formatQ);
        bloc.reglages.format = menu.value === "defaut" ? undefined : menu.value;
        maj(true);
      }),
    );
    // champs d'un tableau : dans le formulaire (réglages propres) ou dans les réglages communs, par colonne de la question
    const majSous = (bid, identifiantSousColonne) => {
      const bloc = blocDe(bid),
        communs = perso ? null : demarrerBrouillonCommuns();
      if (communs) communs.formatsTableau = { ...(communs.formatsTableau || {}) };
      const reglagesTableau = perso
        ? (bloc.reglages.descTableau = bloc.reglages.descTableau || {})
        : (communs.formatsTableau[bloc.colonne] = { ...(communs.formatsTableau[bloc.colonne] || {}) });
      const ligne = panneau.querySelector(
          `[data-dt-ligne="${CSS.escape(bid)}"][data-sc="${CSS.escape(identifiantSousColonne)}"]`,
        ).value,
        dec = panneau.querySelector(
          `[data-dt-dec="${CSS.escape(bid)}"][data-sc="${CSS.escape(identifiantSousColonne)}"]`,
        );
      const reglage = { ligne, decompte: !!(dec && dec.checked) };
      // réglage par défaut : retiré ; sauf la qualification, dont le décompte est actif par défaut (le décocher doit être retenu)
      const qualif = estQualifSous(
        sousColonnes(bloc.reglages.tableau.table).find((sousColonne) => sousColonne.colId === identifiantSousColonne),
      );
      if (reglage.ligne === "defaut" && reglage.decompte === qualif) delete reglagesTableau[identifiantSousColonne];
      else reglagesTableau[identifiantSousColonne] = reglage;
      if (!Object.keys(reglagesTableau).length) {
        if (perso) delete bloc.reglages.descTableau;
        else delete communs.formatsTableau[bloc.colonne];
      }
      maj();
    };
    panneau
      .querySelectorAll("[data-dt-ligne]")
      .forEach((menu) => menu.addEventListener("change", () => majSous(menu.dataset.dtLigne, menu.dataset.sc)));
    panneau
      .querySelectorAll("[data-dt-dec]")
      .forEach((caseACocher) =>
        caseACocher.addEventListener("change", () => majSous(caseACocher.dataset.dtDec, caseACocher.dataset.sc)),
      );
  }

  /* ---------- panneau d'une question formule (donnée de la fiche ou calcul) ---------- */
  function panneauFormule(bloc, colonne) {
    const panneau = $("panneau"),
      reglages = bloc.reglages,
      src = sourceColonneEtablissement(colonne),
      identifiantTable = tableEtablissements(),
      colsE = colonnesEtabProposees(identifiantTable);
    const calculable = !src && valeurFormuleTestPossible(colonne);
    panneau.innerHTML = `<h2>${esc(reglages.libelle || colonne.libelle)}</h2><p class="sous">${src ? "Donnée de la fiche établissement" : "Colonne formule"} · lecture seule, sans saisie</p>
    <label class="l" for="pa-libelle">Libellé</label><input type="text" id="pa-libelle" value="${esc(reglages.libelle || colonne.libelle)}">
    <label class="l" for="pa-aide">Aide affichée sous la question</label><textarea id="pa-aide">${esc(reglages.aide || "")}</textarea>
    <span class="ident" title="Identifiant de la colonne dans Grist">colonne : ${esc(colonne.colId)}</span>
    <label class="l" for="pa-section" style="margin-top:8px">Partie du formulaire</label><select id="pa-section">${optionsParties(bloc.section)}</select>
    <div class="groupe"><div class="t">Valeur affichée</div>
      ${
        src
          ? `<label class="l" for="pa-source">Information de la fiche (table ${esc(identifiantTable)})</label><select id="pa-source">${colsE.map((colonne) => `<option value="${esc(colonne.colId)}"${colonne.colId === src ? " selected" : ""}>${esc(colonne.libelle)}</option>`).join("")}</select>
        <p class="note" style="margin:0">Formule <code>${esc(colonne.texteFormule)}</code>. Le formulaire l'affiche dès que l'établissement est choisi ; Grist la tient à jour si la fiche change.</p>`
          : `<p class="note" style="margin:0">Formule <code>${esc(colonne.texteFormule)}</code>. ${calculable ? "Le formulaire la calcule en direct à partir des réponses." : "Le formulaire affiche la valeur enregistrée, recalculée par Grist."}</p>`
      }
    </div>
    <div class="groupe"><div class="t">Affichage conditionnel</div><div id="pa-condition"></div></div>
    <div class="groupe"><div class="t">Données et diffusion</div>
      <label class="interrupteur">Confidentiel (exclu de la description automatique) <input type="checkbox" id="pa-conf"${reglages.confidentiel ? " checked" : ""}></label>
      <label class="l" for="pa-format">Dans la description automatique</label>
      <select id="pa-format">${choixFormatQuestion(bloc)
        .map(
          ([valeurOption, libelleOption]) =>
            `<option value="${valeurOption}"${(reglages.format || "defaut") === valeurOption ? " selected" : ""}>${libelleOption}</option>`,
        )
        .join("")}</select>
    </div>
    <div class="pied-panneau"><button type="button" class="danger" id="pa-retirer">Retirer du formulaire</button><button type="button" class="danger" id="pa-supprimer">Supprimer la colonne…</button></div>`;
    $("pa-libelle").addEventListener("input", (evenement) => {
      reglages.libelle = evenement.target.value;
      panneau.querySelector("h2").textContent = evenement.target.value || colonne.libelle;
      majBloc(bloc);
      sauver();
    });
    $("pa-aide").addEventListener("input", (evenement) => {
      reglages.aide = evenement.target.value.trim();
      majBloc(bloc);
      sauver();
    });
    $("pa-section").addEventListener("change", (evenement) => {
      deplacer(bloc.id, blocs().length, evenement.target.value);
      choisir(bloc.id);
    });
    $("pa-conf").addEventListener("change", (evenement) => {
      reglages.confidentiel = evenement.target.checked;
      majBloc(bloc);
      sauver();
    });
    $("pa-format").addEventListener("change", (evenement) => {
      reglages.format = evenement.target.value === "defaut" ? undefined : evenement.target.value;
      sauver();
    });
    $("pa-retirer").addEventListener("click", () => retirerBloc(bloc));
    $("pa-supprimer").addEventListener("click", () => supprimerColonne(bloc));
    if ($("pa-source"))
      $("pa-source").addEventListener("change", async (evenement) => {
        const colonneSource = colonnesDe(identifiantTable)[evenement.target.value] || {},
          ref = (String(colonne.texteFormule).match(/^\s*(?:return\s+)?\$(\w+)\./) || [])[1] || colonneEtablissement();
        const info = { formula: `$${ref}.${evenement.target.value}`, type: colonneSource.type || "Any" };
        if (["Choice", "ChoiceList"].includes(typeBase(colonneSource.type)))
          info.widgetOptions = JSON.stringify(colonneSource.opts || {});
        try {
          await actions([["ModifyColumn", courant.table, colonne.colId, info]]);
          await lireMeta();
          meta = metaCourante();
          majBloc(bloc);
          dessinerPanneau();
        } catch (err) {
          message(`Modification refusée : ${err.message || err}`, "err");
        }
      });
    dessinerCondition(bloc);
  }
  const valeurFormuleTestPossible = (colonne) => {
    const formule = String(colonne.texteFormule || "")
      .trim()
      .replace(/^return\s+/, "");
    return (
      /^[\s$\w.,+\-*/()]+$/.test(formule) &&
      /\$\w/.test(formule) &&
      /^[\s+\-*/()]*$/.test(formule.replace(/\$\w+/g, " ").replace(/\d+(?:[.,]\d+)?/g, " "))
    );
  };

  /* ---------- colonnes de service du questionnaire (panneau « Formulaire ») ---------- */
  async function ajouterColonneService(id) {
    const colonneService = COLONNES_SERVICE_QUESTIONNAIRE.find((colonne) => colonne.id === id);
    if (!colonneService || metaColonnesReelles[id]) return;
    try {
      await actions([["AddColumn", courant.table, id, colonneService.info(courant.table)]]);
      if (courant.conf.roles && courant.conf.roles[id] === "") {
        courant.conf.roles[id] = id;
        sauver();
      }
      await lireMeta();
      meta = metaCourante();
      dessinerApercu();
      dessinerPanneau();
      message(`Colonne « ${colonneService.lib} » ajoutée à la table ${courant.table}.`, "ok");
    } catch (erreur) {
      message(`Colonne non ajoutée : ${erreur.message || erreur}`, "err");
    }
  }
  // Référentiel proposé à la création : table « établissements » avec une colonne UAI, sinon « Etablissements »
  function devinerTableEtablissements() {
    // tables visées par une colonne Etablissement existante d'abord (référentiel déjà utilisé), puis celles qui ont une colonne UAI
    const [, metaColonnes] = metaTables,
      refs = new Map();
    metaColonnes.colId.forEach((identifiantColonne, i) => {
      const correspondance =
        /^Etablissement/.test(identifiantColonne) && String(metaColonnes.type[i]).match(/^Ref:(.+)$/);
      if (correspondance) refs.set(correspondance[1], (refs.get(correspondance[1]) || 0) + 1);
    });
    const avecUai = (identifiantTable) =>
      Object.values(colonnesDe(identifiantTable)).some((colonne) =>
        /(^|[^a-z])(uai|rne)([^a-z]|$)/i.test(`${colonne.colId} ${colonne.libelle}`),
      );
    const cand = tables
      .filter(
        (identifiantTable) =>
          /etab/.test(normaliser(identifiantTable).replace(/[^a-z]/g, "")) && avecUai(identifiantTable),
      )
      .sort((tableA, tableB) => (refs.get(tableB) || 0) - (refs.get(tableA) || 0));
    return cand[0] || (tables.includes("Etablissements") ? "Etablissements" : "__creer__");
  }

  /* =========================================================
   Page de saisie : création d'une page Grist avec le widget de saisie déjà réglé
   ---------------------------------------------------------
   « CreateViewSection » (action de Grist utilisée par « Ajouter une page ») crée une page avec une vue
   personnalisée reliée à la table du formulaire ; ses options (customView) reçoivent l'adresse du widget,
   l'accès complet et le formulaire présélectionné (option « formulaire » lue par grist.getOption).
   ========================================================= */
  let pagesSaisie = null; // vues personnalisées du document qui affichent un formulaire de saisie
  const moduleRepartition = window.Repartition;
  async function lirePagesSaisie() {
    pagesSaisie = await moduleRepartition.lirePages();
  }
  const estEnseignementSuperieur = () =>
    !!meta.Site || (!!tableEtablissements() && tableEtablissements() !== "Etablissements");
  // Adresse proposée pour le widget de saisie : la v2, à côté de cette administration (…/v2/saisie/)
  // Pages de saisie des agents : gérées dans Équipe › Pages de saisie (admin/pages-agents.js, une page par agent et par
  // formulaire publié) ; ici, un résumé pour le formulaire affiché et un raccourci.
  const allerPagesAgents = () => {
    const bouton = document.querySelector('nav button[data-onglet="onglet-equipe"]');
    if (bouton) bouton.click();
    window.OngletEquipeGroupe.afficher("pages");
  };
  function groupePageHtml() {
    if (courant.type !== "etablissement") return "";
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
      const resume = window.PagesAgents.resume(courant.nom);
      if (!courant.publie) {
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
      fiche: FICHE_DEFAUT.map(([col, lib]) => ({ col, lib })),
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
      fiche: [...FICHE_DEFAUT.slice(0, 5), ["@region", "Région académique"], FICHE_DEFAUT[5]].map(([col, lib]) => ({
        col,
        lib,
      })),
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
  const confSaisie = () => (courant && courant.conf.saisie) || {};
  // version : réglée dans le formulaire, sinon celle du champ dont c'est la table (document à deux champs), sinon devinée
  const espaceCourant = () => {
    try {
      return courant && window.Socle.espaceDeTable(window.Socle.general(socleConfig), courant.table);
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
    courant.conf.saisie = { ...confSaisie(), version: versionFormulaire() };
    modifier(courant.conf.saisie);
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
  // Région académique : colonne du référentiel, sinon déduite de l'académie (comme le widget de saisie)
  const REGIONS_ACADEMIQUES = {
    "Auvergne-Rhône-Alpes": ["Clermont-Ferrand", "Grenoble", "Lyon"],
    "Bourgogne-Franche-Comté": ["Besançon", "Dijon"],
    Bretagne: ["Rennes"],
    "Centre-Val de Loire": ["Orléans-Tours"],
    Corse: ["Corse"],
    "Grand Est": ["Nancy-Metz", "Reims", "Strasbourg"],
    "Hauts-de-France": ["Amiens", "Lille"],
    "Île-de-France": ["Créteil", "Paris", "Versailles"],
    Normandie: ["Normandie", "Caen", "Rouen"],
    "Nouvelle-Aquitaine": ["Bordeaux", "Limoges", "Poitiers"],
    Occitanie: ["Montpellier", "Toulouse"],
    "Pays de la Loire": ["Nantes"],
    "Provence-Alpes-Côte d'Azur": ["Aix-Marseille", "Nice"],
    Guadeloupe: ["Guadeloupe"],
    Martinique: ["Martinique"],
    Guyane: ["Guyane"],
    "La Réunion": ["La Réunion", "Réunion"],
    Mayotte: ["Mayotte"],
  };
  const cleAcademie = (academie) =>
    normaliser(academie)
      .replace(/^academie\s+(de\s+la\s+|de\s+|d\s+)?/, "")
      .replace(/[^a-z]+/g, " ")
      .trim();
  const REGION_PAR_ACADEMIE = new Map(
    Object.entries(REGIONS_ACADEMIQUES).flatMap(([region, academies]) =>
      academies.map((academie) => [cleAcademie(academie), region]),
    ),
  );
  function regionTest(etablissement) {
    const colonneRegion = colonnesEtablissementTest.region,
      valeur = colonneRegion ? etablissement[colonneRegion] : null;
    if (valeur != null && valeur !== "" && typeof valeur !== "object") return String(valeur);
    return (
      REGION_PAR_ACADEMIE.get(cleAcademie(colonneDuRole("academie") ? etablissement[colonneDuRole("academie")] : "")) ||
      ""
    );
  }
  function valeursEtablissementTest(etablissement) {
    const valeurs = {};
    for (const [k, valeur] of Object.entries(etablissement))
      if (valeur != null && typeof valeur !== "object") valeurs[k] = valeur;
    for (const k of Object.keys(ROLES_ETABLISSEMENT)) {
      const colonne = colonneDuRole(k);
      if (colonne && etablissement[colonne] != null && typeof etablissement[colonne] !== "object")
        valeurs[k] = etablissement[colonne];
    }
    valeurs.nom = nomEtablissement(etablissement);
    valeurs.region = regionTest(etablissement);
    return valeurs;
  }
  function ficheTestHtml() {
    if (!etablissementTest) return "";
    const etablissement = etablissementTest;
    return saisieEffective()
      .fiche.map((champFiche) => {
        const cle = String(champFiche.col || ""),
          lib = champFiche.lib || (cle.startsWith("@") ? ROLES_FICHE[cle.slice(1)] : libelleColonneEtablissement(cle));
        let valeur =
          cle === "@region"
            ? regionTest(etablissement)
            : etablissement[cle.startsWith("@") ? colonneDuRole(cle.slice(1)) : cle];
        if (valeur == null || valeur === "" || typeof valeur === "object") return "";
        return `<dt>${esc(lib)}</dt><dd>${esc(valeurLisible({ type: typeof valeur === "number" ? "Numeric" : "Text" }, valeur))}</dd>`;
      })
      .join("");
  }

  /* ---------- panneau « Formulaire » : version et présentation ---------- */
  function groupeVersionHtml() {
    if (courant.type !== "etablissement") return "";
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
    <label class="interrupteur">Commentaire de mise à jour, saisi par l'agent <input type="checkbox" id="pv-commentaire"${reglagesEffectifs.commentaire ? " checked" : ""}${meta.Commentaire ? "" : " disabled"}></label>
    ${meta.Commentaire ? "" : `<p class="note" style="margin:0">Nécessite la colonne Commentaire (voir « Colonnes du questionnaire »).</p>`}
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
      dire = (texte, err) => {
        if (statut) {
          statut.textContent = texte;
          statut.className = `statut${err ? " err" : " ok"}`;
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
        courant.conf.saisie = { ...(courant.conf.saisie || {}) };
        delete courant.conf.saisie.qualificationEnBas;
        sauver();
        dessinerApercu();
        dessinerPanneau();
        message("Modèle standard : pensez à publier.", "ok");
        return;
      }
      // une question tableau dont la table a un site (référence ou texte) et une qualification : elle devient le tableau des sites
      const cand = blocs()
        .filter(
          (bloc) => bloc.genre === "question" && bloc.reglages && bloc.reglages.tableau && bloc.reglages.tableau.table,
        )
        .map((bloc) => {
          const cols = Object.values(colonnesDe(bloc.reglages.tableau.table)),
            trouverColonne = (motif, filtre) =>
              (cols.find((colonne) => filtre(colonne) && motif.test(colonne.colId)) || cols.find(filtre) || {}).colId ||
              null;
          return {
            b: bloc,
            site: trouverColonne(
              /site/i,
              (colonne) =>
                /^Ref:/.test(colonne.type) && colonne.type !== `Ref:${courant.table}` && colonne.colId !== "Version",
            ),
            libre: trouverColonne(
              /site|libre|nom/i,
              (colonne) => /^Text/.test(colonne.type) && !colonne.formule && !RESERVES_TABLEAU.includes(colonne.colId),
            ),
            qualif: trouverColonne(/qualif/i, (colonne) => /^Choice/.test(colonne.type) && !colonne.formule),
          };
        })
        .filter((candidat) => (candidat.site || candidat.libre) && candidat.qualif);
      if (cand.length) {
        const candidat = cand[0];
        candidat.b.reglages.tableau.sites = {
          site: candidat.site,
          libre: candidat.libre,
          qualif: candidat.qualif,
          historique: [],
          alias: "Sites_correspondances",
        };
        courant.conf.saisie = { ...(courant.conf.saisie || {}), version: "esr", qualificationEnBas: true };
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
      for (const autreFormulaire of formulaires) {
        if (autreFormulaire.id === courant.id || autreFormulaire.table !== courant.table) continue;
        let configuration = null;
        try {
          configuration = JSON.parse(autreFormulaire.publie || autreFormulaire.brouillon || "null");
        } catch (_) {
          configuration = null;
        }
        const blocSites =
          configuration &&
          (configuration.blocs || []).find(
            (bloc) => bloc.reglages && bloc.reglages.tableau && bloc.reglages.tableau.sites && meta[bloc.colonne],
          );
        if (!blocSites) continue;
        const copieBloc = JSON.parse(JSON.stringify(blocSites));
        copieBloc.id = nouvelId();
        copieBloc.section = "q";
        blocs().push(copieBloc);
        courant.conf.saisie = { ...(courant.conf.saisie || {}), version: "esr", qualificationEnBas: true };
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
        courant.conf.saisie = {
          version: bouton.dataset.version,
          ...(reglagesFormulaire.colonnes ? { colonnes: reglagesFormulaire.colonnes } : {}),
          ...(reglagesFormulaire.recherche ? { recherche: reglagesFormulaire.recherche } : {}),
          ...(typeof reglagesFormulaire.commentaire === "boolean"
            ? { commentaire: reglagesFormulaire.commentaire }
            : {}),
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
  function optionsSourceFiche(sel) {
    const cols = colonnesEtabProposees(tableEtablissements());
    return (
      `<optgroup label="Rôles reconnus">${Object.entries(ROLES_FICHE)
        .map(
          ([k, libelle]) =>
            `<option value="@${k}"${sel === "@" + k ? " selected" : ""}>${esc(libelle)}${k === "region" ? " (colonne ou déduite de l'académie)" : ""}</option>`,
        )
        .join("")}</optgroup>` +
      `<optgroup label="Colonnes de ${esc(tableEtablissements() || "la table")}">${cols.map((colonne) => `<option value="${esc(colonne.colId)}"${sel === colonne.colId ? " selected" : ""}>${esc(colonne.libelle)}</option>`).join("")}</optgroup>`
    );
  }
  function groupesEtablissementHtml() {
    const identifiantTable = tableEtablissements();
    if (!identifiantTable) return "";
    const reglagesEffectifs = saisieEffective(),
      reglagesFormulaire = confSaisie(),
      cols = colonnesEtabProposees(identifiantTable);
    if (!colonnesEtablissementTest.nom && !colonnesEtablissementTest.uai) devinerColonnesEtablissement();
    const texte = cols.filter((colonne) => ["Text", "Choice", "Any"].includes(typeBase(colonne.type)));
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
            `<option value="">Automatique${colonnesEtablissementTest[k] ? ` (${esc(libelleColonneEtablissement(colonnesEtablissementTest[k]))})` : ""}</option>${cols.map((colonne) => `<option value="${esc(colonne.colId)}"${(reglagesFormulaire.colonnes || {})[k] === colonne.colId ? " selected" : ""}>${esc(colonne.libelle)}</option>`).join("")}</select></div></div>`,
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
      if (modeTest) majEtablissementTest();
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
        if (modeTest) majEtablissementTest();
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

  /* ---------- panneau « Description » : en-tête ---------- */
  function groupeEnteteHtml() {
    const reglagesEffectifs = saisieEffective(),
      connu = ENTETES.some(([modele]) => modele === reglagesEffectifs.entete),
      exemple = identiteExemple();
    return `<div class="groupe"><div class="t">En-tête de la description</div>
    <label class="l" for="pd-entete">Format${descriptionPropre() || optionsDescription().entete ? "" : " (l'en-tête est désactivé dans les réglages)"}</label>
    <select id="pd-entete">${ENTETES.map(([modele, libelle]) => `<option value="${esc(modele)}"${reglagesEffectifs.entete === modele ? " selected" : ""}>${esc(libelle)} : ${esc(appliquerModele(modele, exemple).replace(/\*\*/g, ""))}</option>`).join("")}<option value="__perso__"${connu ? "" : " selected"}>Personnalisé…</option></select>
    <input type="text" id="pd-entete-perso" value="${esc(reglagesEffectifs.entete)}" spellcheck="false" aria-label="Modèle d'en-tête"${connu ? " hidden" : ""}>
    <p class="note" style="margin:0">Repères : {nom}, {commune}, {uai}, {type}, {academie}, {departement}, {region}, {site}, ou l'identifiant d'une colonne du référentiel, par exemple {Sigle}. ** met en gras ; un repère vide disparaît avec ses parenthèses ou sa virgule.</p></div>`;
  }
  function lierEntete(panneau, maj) {
    const sel = $("pd-entete"),
      perso = $("pd-entete-perso");
    if (!sel) return;
    const ecrire = (valeur) => {
      majSaisie((saisie) => {
        if (valeur && valeur !== PRESETS[versionFormulaire()].entete) saisie.entete = valeur;
        else delete saisie.entete;
      });
      maj();
    };
    sel.addEventListener("change", () => {
      if (sel.value === "__perso__") {
        perso.hidden = false;
        perso.focus();
        return;
      }
      perso.hidden = true;
      perso.value = sel.value;
      ecrire(sel.value);
    });
    perso.addEventListener("input", () => ecrire(perso.value));
  }

  /* =========================================================
   Question « tableau » sur une table existante
   ---------------------------------------------------------
   La table reçoit, si elles manquent, ses colonnes de liaison : Dossier (référence vers la table des réponses),
   Ligne_id et Ordre. Ses lignes déjà rattachées à un dossier sont reprises dans la réponse (format JSON) de la
   dernière étape de ce dossier : sans cela, la prochaine mise à jour du dossier les retirerait de la table.
   ========================================================= */
  function tablesPourTableau() {
    const prises = new Set([courant.table, tableEtablissements(), TABLE_FORMULAIRES].filter(Boolean));
    return tables
      .filter((identifiantTable) => !prises.has(identifiantTable))
      .sort((tableA, tableB) => tableA.localeCompare(tableB, "fr"));
  }
  function analyserTableLignes(tid) {
    const cols = colonnesDe(tid),
      listeColonnes = Object.values(cols);
    const ref = `Ref:${courant.table}`;
    const colonneDossier = cols.Dossier;
    let erreur = "";
    if (colonneDossier && colonneDossier.type !== ref)
      erreur = `Sa colonne « Dossier » renvoie vers ${String(colonneDossier.type).replace(/^Ref:/, "la table ")} et non vers ${courant.table} : renommez-la dans Grist, ou choisissez une autre table.`;
    const colDossier =
      colonneDossier && colonneDossier.type === ref
        ? "Dossier"
        : (listeColonnes.find((colonne) => colonne.type === ref) || {}).colId || null;
    const ligne = !!cols.Ligne_id,
      ordre = !!cols.Ordre;
    const autres = blocs()
      .filter((bloc) => bloc.reglages && bloc.reglages.tableau && bloc.reglages.tableau.table === tid)
      .map((bloc) => libelleQuestion(bloc.colonne));
    if (!erreur && autres.length) erreur = `Elle est déjà utilisée par la question « ${autres[0]} » de ce formulaire.`;
    const champs = sousColonnes(tid).filter((colonne) => colonne.colId !== colDossier);
    const manquantes = [
      !colDossier && "Dossier (référence vers " + courant.table + ")",
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
  async function reprendreLignesExistantes(tid, colJson, colDos) {
    const donneesTable = await Donnees.lire(tid),
      rep = await Donnees.lire(courant.table);
    if (!donneesTable[colDos]) return { lignes: 0, dossiers: 0 };
    const champs = sousColonnes(tid).filter((colonne) => colonne.colId !== colDos && !colonne.r.confidentiel); // confidentiels : restent dans la table seulement
    const num = (valeur) =>
      typeof valeur === "number" ? valeur : Array.isArray(valeur) && valeur[0] === "R" ? valeur[2] : 0;
    const parDossier = new Map(),
      acts = [];
    donneesTable.id.forEach((id, i) => {
      const numeroDossier = num(donneesTable[colDos][i]);
      if (!numeroDossier) return;
      let lid = donneesTable.Ligne_id ? donneesTable.Ligne_id[i] : null;
      if (!lid) {
        lid = "l" + id.toString(36) + Math.random().toString(36).slice(2, 8);
        acts.push(["UpdateRecord", tid, id, { Ligne_id: lid }]);
      }
      const ligneJson = { _id: lid };
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
    const cle = (i) => [rep.Date_faits ? +rep.Date_faits[i] || 0 : 0, rep.Date ? +rep.Date[i] || 0 : 0, rep.id[i]];
    const plus = (cleA, cleB) =>
      cleA[0] !== cleB[0] ? cleA[0] > cleB[0] : cleA[1] !== cleB[1] ? cleA[1] > cleB[1] : cleA[2] > cleB[2];
    const derniere = new Map();
    rep.id.forEach((id, i) => {
      const numeroDossier = num(rep.Dossier ? rep.Dossier[i] : 0) || id;
      const indexRetenu = derniere.get(numeroDossier);
      if (indexRetenu == null || plus(cle(i), cle(indexRetenu))) derniere.set(numeroDossier, i);
    });
    let lignes = 0,
      dossiers = 0;
    for (const [numeroDossier, lignesDossier] of parDossier) {
      const i = derniere.get(numeroDossier);
      if (i == null) continue;
      lignesDossier.sort((ligneA, ligneB) => ligneA.rang - ligneB.rang || ligneA.id - ligneB.id);
      acts.push([
        "UpdateRecord",
        courant.table,
        rep.id[i],
        { [colJson]: JSON.stringify(lignesDossier.map((ligne) => ligne.o)) },
      ]);
      lignes += lignesDossier.length;
      dossiers++;
    }
    for (let k = 0; k < acts.length; k += 400) await actions(acts.slice(k, k + 400));
    return { lignes, dossiers };
  }

  /* =========================================================
   Référentiel des établissements d'une table de réponses
   ---------------------------------------------------------
   La colonne Etablissement (référence) désigne le référentiel. Pour en changer alors que des signalements sont déjà
   saisis, chaque signalement est rattaché à la ligne du nouveau référentiel qui a le même UAI ; le changement est
   refusé si un seul établissement n'y est pas retrouvé (aucune réponse n'est détachée de son établissement).
   ========================================================= */
  const referentielDe = (tid) => {
    const id = colonneEtablissementDe(tid),
      colonne = id && colonnesDe(tid)[id];
    const correspondance = colonne && String(colonne.type).match(/^Ref:(.+)$/);
    return correspondance ? correspondance[1] : null;
  };
  function colonneUaiDe(tid) {
    const colonnes = colonnesDe(tid);
    return colonnes.UAI
      ? "UAI"
      : trouverColonneEtablissement(colonnes, [/(^|_)(uai|rne)(_|$)/, /uai|rne/], /tutelle|siege|parent/);
  }
  function colonneNomDe(tid) {
    const colonnes = colonnesDe(tid);
    return colonnes.Nom
      ? "Nom"
      : trouverColonneEtablissement(
          colonnes,
          [/(^|_)nom(_|$)/, /appellation|denomination|libelle|intitule/],
          /commune|ville|academi|departement|region|type|sigle|uai/,
        );
  }
  async function analyserReferentiel(tid, choix) {
    const creer = choix === "__creer__",
      cible = creer ? "Etablissements" : choix;
    const cols = colonnesDe(tid),
      colE = colonneEtablissementDe(tid),
      colonneEtablissement = colE ? cols[colE] : cols.Etablissement || null,
      actuelle = referentielDe(tid);
    if (colonneEtablissement && !actuelle)
      return {
        erreur: `La colonne ${colonneEtablissement.colId} de ${tid} n'est pas une référence (type ${colonneEtablissement.type}) : changez son type dans Grist.`,
        texte: "",
      };
    if (!colonneEtablissement)
      return {
        tid,
        cible,
        creer,
        action: "creer",
        texte: `Une colonne Etablissement (référence vers ${cible}) sera ajoutée à la table ${tid}.`,
      };
    const col = colonneEtablissement.colId;
    if (actuelle === cible)
      return {
        tid,
        cible,
        action: "rien",
        texte: `Référentiel actuel de la table ${tid}${col !== "Etablissement" ? ` (colonne ${col})` : ""}.`,
      };
    const rep = await Donnees.lire(tid);
    const lignes = rep.id.map((id, i) => ({ id, e: rep[col][i] })).filter((ligne) => ligne.e);
    if (!lignes.length)
      return {
        tid,
        cible,
        creer,
        col,
        action: "changer",
        maj: [],
        texte: `La table ${tid} passera du référentiel ${actuelle} à ${cible} (aucun signalement à rattacher).`,
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
    const maj = [],
      absents = new Map();
    for (const ligne of lignes) {
      const uai = uaiAncien.get(ligne.e),
        idCible = uai ? parUai.get(uai) : null;
      if (idCible) maj.push([ligne.id, idCible]);
      else absents.set(ligne.e, `${nomAncien(ligne.e)}${uai ? ` (${uai})` : " (sans UAI)"}`);
    }
    if (absents.size)
      return {
        erreur: `${absents.size} établissement(s) des signalements déjà saisis sont introuvables dans ${cible} par leur UAI : ${[...absents.values()].slice(0, 5).join(", ")}${absents.size > 5 ? "…" : ""}. Ajoutez-les à ${cible}, ou gardez le référentiel ${actuelle}.`,
        texte: "",
      };
    return {
      tid,
      cible,
      col,
      action: "changer",
      maj,
      texte: `La table ${tid} passera du référentiel ${actuelle} à ${cible} : ${maj.length} signalement(s) rattachés d'après leur UAI, tous retrouvés.`,
    };
  }
  async function appliquerReferentiel(tid, analyse) {
    if (!analyse || analyse.action === "rien") return;
    if (analyse.creer && !metaTables[0].tableId.includes("Etablissements"))
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
        ["AddColumn", tid, "Etablissement", { type: `Ref:${analyse.cible}`, isFormula: false, label: "Établissement" }],
      ]);
    else {
      const col = analyse.col || "Etablissement";
      const acts = [
        ["ModifyColumn", tid, col, { type: `Ref:${analyse.cible}` }],
        ...(analyse.maj || []).map(([id, idEtablissement]) => ["UpdateRecord", tid, id, { [col]: idEtablissement }]),
      ];
      for (let k = 0; k < acts.length; k += 400) await actions(acts.slice(k, k + 400));
    }
    await lireMeta();
  }

  /* =========================================================
   Démarrage
   ========================================================= */
  /* =========================================================
   Démarrage : à la première ouverture de l'onglet (administration v2)
   ========================================================= */
  let socleConfig = null,
    socleGeneral = { ...window.Socle.DEFAUTS_GENERAL },
    demarre = false;
  async function lireSocle() {
    try {
      socleConfig = await window.Socle.lireConfig();
    } catch (_) {
      socleConfig = null;
    }
    socleGeneral = window.Socle.general(socleConfig);
    TABLE_FORMULAIRES = socleGeneral.formulaires || "Formulaires";
  }
  async function afficher() {
    if (demarre) {
      await lireSocle();
      await lirePagesSaisie();
      if (courant) dessinerPanneau();
      return;
    }
    demarre = true;
    await lireSocle();
    try {
      await lireMeta();
      await Promise.all([lireFormulaires(), lireReglagesCommuns(), lirePagesSaisie()]);
      if (formulaires.length) charger(formulaires[0]);
      remplirChoixFormulaire();
      dessinerApercu();
      dessinerPanneau();
    } catch (erreur) {
      accesOk = false;
      $("apercu").innerHTML =
        `<div class="accueil"><h2>Accès insuffisant</h2><p class="note">Ce widget doit être réglé sur « Accès complet » au document (panneau de droite, « Accès »). ${esc(erreur.message || erreur)}</p></div>`;
    }
  }
  // Une autre personne a modifié la table des formulaires (ou la structure) : relecture si rien n'est sélectionné
  grist.onRecords(() => {}, { includeColumns: "normal" });
  window.OngletFormulaires = { afficher };
})();
