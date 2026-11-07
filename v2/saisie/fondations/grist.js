/* PRISME — widget de saisie, fondations/grist.js
   Liaison avec Grist : file d'attente des traitements, structure du document, mesure d'activité.
   Chargé par saisie/index.html dans l'ordre : fondations, composants, domaines, demarrage.js. Les fichiers partagent
   leurs noms (scripts classiques, sans import) : au chargement, un fichier ne fait que définir. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : ecrireEtape, COLONNES, enFile, OPTIONS, ACTIVITE, traiterEnvoi, lireMeta, metaDeSecours, metaColonnes,
     mesurerArriveeEnvoi, lireSocleSaisie, cacheTables, lireTableSQL, lireTableRapide, lireTableReference,
     tableDepuisEnregistrements, libellesTable, colonnesDeTable.
   Utilise :
     fondations/outils : texteComparable, typeBase.
     fondations/etat : etatSaisie.
     domaines/formulaire/donnees : chargerConfiguration.
     domaines/dossier/affichage : rafraichir.
     demarrage : signalerErreurChargement.
   Modifie etatSaisie : TABLE_FORMULAIRES, enregistrements, file, idsNouveaux, idsPrecedents, jetonSQL, mappings,
     metaCopie, promesseMeta, signatureMappings, socleConfig, socleGeneral, sqlRefuse. */
// Exécute une écriture en précisant, en cas de refus, quelle étape et quelle table sont en cause
async function ecrireEtape(libelle, table, action) {
  try {
    return await action();
  } catch (erreur) {
    const message = (erreur && erreur.message) || String(erreur);
    const acl = /access rules|blocked/i.test(message);
    // pièces jointes : structure vue par le lien d'établissement pas à jour (copie des colonnes) ou question non adaptée
    const indicationPiecesJointes = /formula column|cannot access attachment/i.test(message)
      ? " — Pièces jointes : la responsable ou le responsable du document doit ouvrir l'administration, onglet « Formulaires », vérifier que la question Pièces jointes est « adaptée aux liens d'établissement », puis republier le formulaire ; rechargez ensuite cette page."
      : "";
    const erreurEtape = new Error(
      `${libelle} (table « ${table} ») : ${acl ? "refusé par les règles d'accès" : message}${indicationPiecesJointes}`,
    );
    erreurEtape.acl = acl;
    erreurEtape.table = table;
    throw erreurEtape;
  }
}
const COLONNES = [
  {
    name: "Clos",
    title: "Clos (signalement terminé)",
    type: "Bool",
    optional: true,
    description:
      "Case cochée sur la dernière étape quand la situation est terminée (« Autres actions › Clore le signalement »).",
  },
  { name: "Etablissement", title: "Établissement (référence)", type: "Ref", optional: true },
  { name: "Description", title: "Description du signalement", type: "Text", optional: true },
  { name: "Qualification", title: "Qualification", type: "Choice,ChoiceList,Text", optional: true },
  { name: "Date", title: "Date de la version", type: "DateTime,Date", optional: true },
  {
    name: "Date_faits",
    title: "Date des faits",
    type: "Date,DateTime",
    optional: true,
    description:
      "Jour des faits signalés (aujourd'hui par défaut). Sert au décompte des jours de mobilisation et au classement dans le point de situation.",
  },
  { name: "Dossier", title: "Dossier (référence vers cette même table)", type: "Ref", optional: true },
  { name: "Nature", title: "Nature (Nouveau signalement / Mise à jour)", type: "Choice,Text", optional: true },
  { name: "Commentaire", title: "Commentaire de suivi", type: "Text", optional: true },
  {
    name: "Site",
    title: "Site / bâtiment",
    type: "Text",
    optional: true,
    description:
      "Saisi à la main dans le bloc Établissement. Sert aussi au repérage des doublons : même établissement, même site, même date des faits.",
  },
  { name: "Auteur", title: "Auteur (formule user.Email)", optional: true },
  {
    name: "Questions",
    title: "Questions supplémentaires",
    optional: true,
    allowMultiple: true,
    description: "Questions posées dans le signalement initial et reprises dans chaque suivi.",
  },
  {
    name: "Questions_dep",
    title: "Visa départemental",
    optional: true,
    allowMultiple: true,
    description: "Colonnes renseignées par l'échelon départemental (invisibles pour l'établissement).",
  },
  {
    name: "Questions_aca",
    title: "Visa académique",
    optional: true,
    allowMultiple: true,
    description: "Colonnes renseignées par l'échelon académique (invisibles pour l'établissement).",
  },
];
// Pas de onEditOptions ni d'options de widget : dans le Custom Widget Builder, ce bouton ouvre
// l'éditeur de code et les options du widget contiennent le code lui-même. Les réglages sont
// donc stockés dans la table Parametres (voir PARAMETRES).

etatSaisie.file = Promise.resolve();
// une erreur pendant le chargement (référentiel pas encore prêt) est affichée ; ensuite, seulement dans la console
const enFile = (traitement) => {
  etatSaisie.file = etatSaisie.file.then(traitement).catch((erreur) => {
    console.warn(erreur);
    if (typeof etatSaisie.referentielLu !== "undefined" && !etatSaisie.referentielLu)
      signalerErreurChargement(erreur, "traitement");
  });
  return etatSaisie.file;
};
const OPTIONS = { keepEncoded: true, expandRefs: false, includeColumns: "normal" };
// lignes créées par ce widget-ci
/* Mesure de l'activité (⚙ › « Activité du widget ») : envois de Grist, temps de traitement, lectures.
   Sert à savoir si une lenteur vient du widget ou de Grist. */
const ACTIVITE = {
  debut: Date.now(),
  envois: [],
  regroupes: 0,
  curseur: 0,
  curseurIgnores: 0,
  longues: 0,
  dureeLongues: 0,
};
// lectures du document : comptées par Donnees (Donnees.compteurs())
(() => {
  try {
    new PerformanceObserver((liste) => {
      for (const entree of liste.getEntries()) {
        ACTIVITE.longues++;
        ACTIVITE.dureeLongues += entree.duration;
      }
    }).observe({ type: "longtask", buffered: true });
  } catch (_) {
    // mesure des tâches longues indisponible dans ce navigateur
  }
})();
async function traiterEnvoi(lignesRecues, associations) {
  etatSaisie.mappings = associations;
  etatSaisie.enregistrements = lignesRecues || [];
  const ids = new Set(etatSaisie.enregistrements.map((enregistrement) => enregistrement.id));
  etatSaisie.idsNouveaux = etatSaisie.idsPrecedents
    ? new Set([...ids].filter((i) => !etatSaisie.idsPrecedents.has(i)))
    : new Set();
  etatSaisie.idsPrecedents = ids;
  const signature = JSON.stringify(associations);
  if (signature !== etatSaisie.signatureMappings) {
    etatSaisie.signatureMappings = signature;
    await chargerConfiguration();
  }
  await rafraichir();
}
function lireMeta() {
  if (!etatSaisie.promesseMeta)
    etatSaisie.promesseMeta = Promise.all([Donnees.lire("_grist_Tables"), Donnees.lire("_grist_Tables_column")]).catch(
      async (erreur) => {
        const metaSecours = await metaDeSecours();
        if (!metaSecours) throw erreur;
        return metaSecours;
      },
    );
  return etatSaisie.promesseMeta;
}
async function metaDeSecours() {
  try {
    const tableConfig = await Donnees.lire("Config"),
      i = (tableConfig.Cle || []).indexOf("schema");
    const sch = i >= 0 && tableConfig.Valeur[i] ? JSON.parse(tableConfig.Valeur[i]) : null;
    if (!sch || !sch.tables) return null;
    const tables = { id: [], tableId: [] },
      tableColonnes = {
        id: [],
        parentId: [],
        colId: [],
        label: [],
        type: [],
        widgetOptions: [],
        isFormula: [],
        formula: [],
        description: [],
        visibleCol: [],
        parentPos: [],
      };
    let compteurColonnes = 0;
    Object.entries(sch.tables).forEach(([tid, liste], k) => {
      tables.id.push(k + 1);
      tables.tableId.push(tid);
      const base = compteurColonnes;
      liste.forEach((colonne, j) => {
        compteurColonnes++;
        tableColonnes.id.push(compteurColonnes);
        tableColonnes.parentId.push(k + 1);
        tableColonnes.colId.push(colonne.colId);
        tableColonnes.label.push(colonne.label || colonne.colId);
        tableColonnes.type.push(colonne.type || "Any");
        tableColonnes.widgetOptions.push(colonne.widgetOptions || "");
        tableColonnes.isFormula.push(!!colonne.isFormula);
        tableColonnes.formula.push(colonne.formula || "");
        tableColonnes.description.push(colonne.description || "");
        tableColonnes.parentPos.push(j + 1);
        tableColonnes.visibleCol.push(0);
      });
      liste.forEach((colonne, j) => {
        if (colonne.visibleCol) {
          const indexColonneAffichee = liste.findIndex((autreColonne) => autreColonne.colId === colonne.visibleCol);
          if (indexColonneAffichee >= 0) tableColonnes.visibleCol[base + j] = base + indexColonneAffichee + 1;
        }
      });
    });
    etatSaisie.metaCopie = true;
    return [tables, tableColonnes];
  } catch (_) {
    return null;
  }
}
async function metaColonnes(tid) {
  const [tables, colonnesGrist] = await lireMeta();
  const tRef = tables.id[tables.tableId.indexOf(tid)];
  if (tRef == null) return null;
  const resultat = {};
  for (let i = 0; i < colonnesGrist.id.length; i++) {
    if (colonnesGrist.parentId[i] !== tRef) continue;
    let options = {};
    try {
      options = JSON.parse(colonnesGrist.widgetOptions[i] || "{}");
    } catch (_) {
      // options illisibles : valeurs par défaut
    }
    const visible = colonnesGrist.visibleCol ? colonnesGrist.visibleCol[i] : 0;
    resultat[colonnesGrist.colId[i]] = {
      colId: colonnesGrist.colId[i],
      libelle: colonnesGrist.label[i],
      type: colonnesGrist.type[i],
      opts: options,
      description: (colonnesGrist.description && colonnesGrist.description[i]) || "",
      formule: !!(colonnesGrist.isFormula && colonnesGrist.isFormula[i] && colonnesGrist.formula[i]),
      texteFormule: (colonnesGrist.formula && colonnesGrist.formula[i]) || "",
      colAffichee: visible ? colonnesGrist.colId[colonnesGrist.id.indexOf(visible)] : null,
    };
  }
  return resultat;
}
// Enregistre l'arrivée d'un envoi de lignes dans la mesure d'activité et renvoie son relevé
function mesurerArriveeEnvoi(lignesRecues) {
  const arrive = {
    t: Date.now(),
    lignes: (lignesRecues || []).length,
    colonnes: lignesRecues && lignesRecues[0] ? Object.keys(lignesRecues[0]).length : 0,
    ms: null,
  };
  ACTIVITE.envois.push(arrive);
  if (ACTIVITE.envois.length > 300) ACTIVITE.envois.shift();
  return arrive;
}
async function lireSocleSaisie() {
  try {
    etatSaisie.socleConfig = await window.Socle.lireConfig();
  } catch (_) {
    etatSaisie.socleConfig = null;
  }
  etatSaisie.socleGeneral = window.Socle.general(etatSaisie.socleConfig);
  etatSaisie.TABLE_FORMULAIRES = etatSaisie.socleGeneral.formulaires || "Formulaires";
}
/* Colonnes Référence du référentiel (ex. Académie → table des académies) : Grist transmet le numéro de ligne.
   Le widget le remplace par le nom lu dans la table visée (colonne Nom / Libellé / Intitulé si elle existe,
   sinon la colonne affichée dans Grist), pour la fiche, la recherche et les filtres. */
/* Tables lues seulement pour des libellés ou des listes de choix (académies, nomenclatures…) : gardées 10 minutes.
   Une grande table peut demander plusieurs secondes au serveur ; plusieurs colonnes qui la visent ne la relisent pas. */
const cacheTables = new Map();
async function lireTableSQL(tid) {
  if (etatSaisie.sqlRefuse) throw new Error(etatSaisie.sqlRefuse);
  if (!grist.docApi.getAccessToken) {
    etatSaisie.sqlRefuse = "jeton d'accès indisponible";
    throw new Error(etatSaisie.sqlRefuse);
  }
  if (!etatSaisie.jetonSQL || Date.now() > etatSaisie.jetonSQL.expire) {
    const j = await grist.docApi.getAccessToken({ readOnly: true });
    etatSaisie.jetonSQL = { ...j, expire: Date.now() + Math.max(30, Math.min(Number(j.ttl) || 300, 600) - 20) * 1000 };
  }
  const meta = await metaColonnes(tid);
  if (!meta) throw new Error("table inconnue");
  const colonnes = Object.keys(meta).filter(
    (colonne) => colonne !== "id" && colonne !== "manualSort" && !colonne.startsWith("gristHelper"),
  );
  const sql = `SELECT id${colonnes.map((colonne) => `, "${colonne.replace(/"/g, '""')}"`).join("")} FROM "${tid.replace(/"/g, '""')}"`;
  const debut = performance.now();
  const reponse = await fetch(
    `${etatSaisie.jetonSQL.baseUrl}/sql?q=${encodeURIComponent(sql)}&auth=${encodeURIComponent(etatSaisie.jetonSQL.token)}`,
  );
  if (reponse.status === 401 || reponse.status === 403) {
    etatSaisie.sqlRefuse = `lecture SQL refusée (${reponse.status})`;
    throw new Error(etatSaisie.sqlRefuse);
  }
  if (!reponse.ok) throw new Error(`lecture SQL : erreur ${reponse.status}`);
  const lignesRecues = (await reponse.json()).records || [];
  // valeurs telles que les donnerait fetchTable : cases à cocher en booléens, listes au format ["L", …]
  const conv = colonnes.map((colonne) => {
    const typeColonne = typeBase(meta[colonne].type);
    if (typeColonne === "Bool") return (valeur) => (valeur == null ? valeur : !!valeur);
    if (typeColonne === "ChoiceList" || typeColonne === "RefList" || typeColonne === "Attachments")
      return (valeur) => {
        if (typeof valeur !== "string" || !valeur.startsWith("[")) return valeur;
        try {
          return ["L", ...JSON.parse(valeur)];
        } catch (_) {
          return valeur;
        }
      };
    return (valeur) => valeur;
  });
  const tableLue = { id: lignesRecues.map((enregistrement) => enregistrement.fields.id) };
  colonnes.forEach((colonne, k) => {
    tableLue[colonne] = lignesRecues.map((enregistrement) => conv[k](enregistrement.fields[colonne]));
  });
  Donnees.noterLecture(`${tid} (SQL)`, debut);
  return tableLue;
}
const lireTableRapide = (tid) =>
  lireTableSQL(tid).catch((erreur) => {
    if (!etatSaisie.sqlRefuse) console.warn(`Lecture SQL de ${tid} impossible`, erreur);
    return Donnees.lire(tid);
  });
function lireTableReference(tid) {
  const entreeCache = cacheTables.get(tid);
  if (entreeCache && Date.now() - entreeCache.t < 600000) return entreeCache.p;
  // la table des réponses est déjà reçue du widget : pas de relecture
  const promesseTable =
    tid === etatSaisie.tableId && etatSaisie.enregistrements.length
      ? Promise.resolve(tableDepuisEnregistrements())
      : lireTableRapide(tid);
  cacheTables.set(tid, { t: Date.now(), p: promesseTable });
  promesseTable.catch(() => cacheTables.delete(tid));
  return promesseTable;
}
function tableDepuisEnregistrements() {
  const colonnes = new Set(["id"]);
  for (const enregistrement of etatSaisie.enregistrements.slice(0, 50))
    Object.keys(enregistrement).forEach((k) => colonnes.add(k));
  const table = {};
  for (const colonne of colonnes)
    table[colonne] = etatSaisie.enregistrements.map((enregistrement) => enregistrement[colonne]);
  return table;
}
async function libellesTable(tid, colAffichee) {
  const tableReference = await lireTableReference(tid);
  const colonnes = Object.keys(tableReference).filter(
    (colonne) => colonne !== "id" && colonne !== "manualSort" && !colonne.startsWith("gristHelper"),
  );
  const texte = (colonne) =>
    (tableReference[colonne] || []).some((valeur) => typeof valeur === "string" && valeur.trim());
  const colonneLibelle =
    colonnes.find(
      (colonne) => /^(nom|libelle|intitule)(_|$)/.test(texteComparable(colonne).replace(/ /g, "_")) && texte(colonne),
    ) ||
    (colAffichee && tableReference[colAffichee] ? colAffichee : null) ||
    colonnes.find(texte);
  return new Map(
    tableReference.id.map((id, i) => [id, colonneLibelle ? String(tableReference[colonneLibelle][i] ?? "") : ""]),
  );
}
// Colonnes d'une table, dans l'ordre de Grist
async function colonnesDeTable(tid) {
  const [tables, metaColonnesBrutes] = await lireMeta();
  const tRef = tables.id[tables.tableId.indexOf(tid)];
  if (tRef == null) return null;
  const colonnes = [];
  for (let i = 0; i < metaColonnesBrutes.id.length; i++) {
    if (metaColonnesBrutes.parentId[i] !== tRef) continue;
    let options = {};
    try {
      options = JSON.parse(metaColonnesBrutes.widgetOptions[i] || "{}");
    } catch (_) {
      // options illisibles : valeurs par défaut
    }
    const visible = metaColonnesBrutes.visibleCol ? metaColonnesBrutes.visibleCol[i] : 0;
    colonnes.push({
      colId: metaColonnesBrutes.colId[i],
      libelle: metaColonnesBrutes.label[i],
      type: metaColonnesBrutes.type[i],
      opts: options,
      description: (metaColonnesBrutes.description && metaColonnesBrutes.description[i]) || "",
      formule: !!(metaColonnesBrutes.isFormula && metaColonnesBrutes.isFormula[i] && metaColonnesBrutes.formula[i]),
      colAffichee: visible ? metaColonnesBrutes.colId[metaColonnesBrutes.id.indexOf(visible)] : null,
      pos: metaColonnesBrutes.parentPos ? metaColonnesBrutes.parentPos[i] : i,
    });
  }
  return colonnes.sort((a, b) => a.pos - b.pos);
}
