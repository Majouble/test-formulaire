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
let TABLE_FORMULAIRES = "Formulaires";   // remplacé au démarrage par la clé « general » de Config
const COLS_FORMULAIRES = [
  { id: "Nom", type: "Text" }, { id: "Table", type: "Text" }, { id: "Brouillon", type: "Text" },
  { id: "Publie", type: "Text" }, { id: "Publie_le", type: "DateTime:Europe/Paris" }, { id: "Modifie_le", type: "DateTime:Europe/Paris" },
];
const TABLES_EXCLUES = /^(Formulaires|Config|Parametres|Utilisateurs|Config_.*|Colonnes_point|Sections_point|Tri_point|Points_situation|GristDoc.*|_grist.*)$/;
// Parties du formulaire : rôle q (formulaire de signalement, plusieurs parties possibles), vd / va (onglet Visas)
const PARTIES_DEFAUT = [{ id: "q", nom: "Signalement", role: "q" }, { id: "vd", nom: "Visa départemental", role: "vd" }, { id: "va", nom: "Visa académique", role: "va" }];
const ROLES = { q: "formulaire", vd: "onglet Visas, échelon départemental", va: "onglet Visas, échelon académique" };
const TYPES_QUESTIONNAIRE = { etablissement: "Questionnaire établissement" };
const COMMUNS = ["Etablissement", "Site", "Date_faits", "Qualification", "Description"];
// Colonnes de service d'un questionnaire établissement (contrôlées dans le panneau « Formulaire »)
const COLS_QUESTIONNAIRE = [
  { id: "Dossier", lib: "Dossier", aide: "Relie les mises à jour à leur signalement : sans elle, chaque enregistrement crée un nouveau dossier.", info: tid => ({ type: `Ref:${tid}`, isFormula: false, label: "Dossier" }) },
  { id: "Nature", lib: "Nature", aide: "« Nouveau signalement » ou « Mise à jour ».", info: () => ({ type: "Choice", isFormula: false, widgetOptions: JSON.stringify({ choices: ["Nouveau signalement", "Mise à jour"] }) }) },
  { id: "Date", lib: "Date de saisie", aide: "Remplie par le serveur de Grist (formule d'initialisation NOW()).", info: () => ({ type: "DateTime:Europe/Paris", isFormula: false, formula: "NOW()", label: "Date de saisie" }) },
  { id: "Auteur", lib: "Auteur", aide: "Adresse de la personne qui enregistre (formule d'initialisation user.Email).", info: () => ({ type: "Text", isFormula: false, formula: "user.Email" }) },
  { id: "Commentaire", lib: "Commentaire", aide: "Résumé des changements d'une mise à jour.", info: () => ({ type: "Text", isFormula: false }) },
  { id: "Clos", lib: "Clos", aide: "Permet de clore un signalement terminé (menu « Autres actions » du formulaire).", info: () => ({ type: "Bool", isFormula: false, label: "Clos" }) },
  { id: "Site", lib: "Site / bâtiment", aide: "Version enseignement supérieur : site, campus ou bâtiment concerné.", info: () => ({ type: "Text", isFormula: false, label: "Site / bâtiment" }) },
];
const RESERVES_TABLEAU = ["id", "manualSort", "Dossier", "Ligne_id", "Ordre", "Version", "Mouvement"];
// colonnes d'historique d'une sous-table (une ligne par version et par ligne saisie), absentes de la table tid
function actionsHistoriqueTableau(tid, colDos) {
  const roles = Object.fromEntries(Object.entries(rolesEffectifs()).filter(([, c]) => c).map(([k, c]) => [k, { col: c }]));
  const existantes = colonnesDe(tid) || {};
  return window.Socle.colonnesHistoriqueTableau(tid, courant.table, colDos || "Dossier", roles).filter(c => !existantes[c.id])
    .map(c => ["AddColumn", tid, c.id, { type: c.type, isFormula: !!c.isFormula, formula: c.formula || "", ...(c.widgetOptions ? { widgetOptions: c.widgetOptions } : {}), label: c.id }]);
}
const COULEURS = { rouge: "#ce0500", orange: "#e4794a", jaune: "#f5c400", vert: "#18753c", bleu: "#000091", violet: "#6a1b9a", gris: "#777777" };
const TYPES = [
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
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const normaliser = t => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’']/g, " ").replace(/\s+/g, " ").trim();
const typeBase = t => (t || "Any").split(":")[0];
const nouvelId = () => "b" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const copie = o => JSON.parse(JSON.stringify(o));
const maintenant = () => Date.now() / 1000;
function identifiant(libelle, existants) {
  let base = String(libelle || "Question").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "Question";
  if (/^\d/.test(base)) base = "Q_" + base;
  base = base.charAt(0).toUpperCase() + base.slice(1);
  let id = base, n = 2;
  const pris = new Set([...existants].map(x => x.toLowerCase()));
  while (pris.has(id.toLowerCase())) id = `${base}_${n++}`;
  return id;
}
const lisible = v => v !== undefined && !(Array.isArray(v) && v[0] === "C");
function estVideValeur(v) {
  if (v == null || v === "" || v === false) return true;
  if (Array.isArray(v)) return v[0] === "L" ? v.length <= 1 : !v.length;
  if (typeof v === "string") return !v.trim() || v.trim() === "[]";
  return false;
}

/* ---------- état ---------- */
let formulaires = [];       // lignes de la table Formulaires
let courant = null;         // { id, nom, table, conf: { blocs }, publie }
let meta = {};              // colonnes de la table du formulaire courant
let metaTables = null;      // [tables, colonnes] de Grist
let tables = [];
let choisi = null;          // id du bloc sélectionné
let modeTest = false;
let simulations = {};       // valeurs simulées des colonnes hors formulaire (mode test)
let accesOk = true;

/* ---------- lecture de Grist ---------- */
async function lireMeta() {
  metaTables = await Promise.all([grist.docApi.fetchTable("_grist_Tables"), grist.docApi.fetchTable("_grist_Tables_column")]);
  const [t] = metaTables;
  tables = t.tableId.filter(x => x && !TABLES_EXCLUES.test(x) && !x.startsWith("_grist"));
}
function colonnesDe(tid) {
  const [t, c] = metaTables;
  const ref = t.id[t.tableId.indexOf(tid)];
  if (ref == null) return {};
  const res = {};
  for (let i = 0; i < c.id.length; i++) {
    if (c.parentId[i] !== ref) continue;
    const colId = c.colId[i];
    if (colId === "manualSort" || colId.startsWith("gristHelper")) continue;
    let opts = {};
    try { opts = JSON.parse(c.widgetOptions[i] || "{}"); } catch (_) {}
    res[colId] = { colId, libelle: c.label[i] || colId, type: c.type[i], opts, description: (c.description && c.description[i]) || "",
      formule: !!(c.isFormula && c.isFormula[i] && c.formula[i]), texteFormule: (c.isFormula && c.isFormula[i] && c.formula[i]) || "", pos: c.parentPos ? c.parentPos[i] : i, ref: c.id[i] };
    // pièces jointes calculées depuis une colonne d'envoi (formulePiecesJointes) : question ordinaire pour l'administration
    const pj = /^Attachments/.test(c.type[i]) && res[colId].formule && /\(\$(\w+) or ""\)\.split\(\)/.exec(res[colId].texteFormule);
    if (pj) { res[colId].formule = false; res[colId].pjEnvoi = pj[1]; }
  }
  return res;
}
async function lireFormulaires() {
  try {
    const t = await grist.docApi.fetchTable(TABLE_FORMULAIRES);
    formulaires = t.id.map((id, i) => ({ id, nom: t.Nom ? String(t.Nom[i] ?? "") : `Formulaire ${id}`, table: t.Table ? String(t.Table[i] ?? "") : "",
      brouillon: t.Brouillon ? t.Brouillon[i] : "", publie: t.Publie ? t.Publie[i] : "", publieLe: t.Publie_le ? t.Publie_le[i] : null,
      type: t.Type ? String(t.Type[i] || "etablissement") : "etablissement", widget: t.Widget ? String(t.Widget[i] || "") : "" }));
    return true;
  } catch (_) { formulaires = []; return false; }
}
async function creerTableFormulaires() {
  await grist.docApi.applyUserActions([["AddTable", TABLE_FORMULAIRES, COLS_FORMULAIRES.map(c => ({ id: c.id, type: c.type, isFormula: false }))]]);
}
const actions = a => grist.docApi.applyUserActions(a);

/* ---------- reprise des repères écrits dans les descriptions (formulaires existants) ---------- */
const sansGuillemets = v => String(v).trim().replace(/^["'«“‘\s]+|["'»”’\s]+$/g, "").trim();
function lireReperes(txt) {
  txt = String(txt || "").trim();
  const r = {};
  if (txt.startsWith("*")) r.obligatoire = true;
  let m = txt.match(/\[\s*si\s+([^\]]+)\]/i);
  if (m) {
    const corps = m[1].trim(); let e;
    if ((e = corps.match(/^(.+?)\s*(!=|≠|>=|<=|=|>|<)\s*(.+)$/)) || (e = corps.match(/^([^:]+?)\s*(:)\s*(.+)$/)))
      r.condition = { ref: sansGuillemets(e[1]), op: e[2] === "≠" ? "!=" : e[2] === ":" ? "=" : e[2], valeurs: e[3].split(/\s*,\s*/).map(sansGuillemets).filter(Boolean) };
    else if ((e = corps.match(/^(.+?)\s+(?:n['’]est\s+pas\s+vide|non\s+vide|est\s+renseign[ée]e?|renseign[ée]e?)$/i))) r.condition = { ref: sansGuillemets(e[1]), op: "rempli", valeurs: [] };
    else if ((e = corps.match(/^(.+?)\s+(?:est\s+)?vide$/i))) r.condition = { ref: sansGuillemets(e[1]), op: "vide", valeurs: [] };
    else r.condition = { ref: sansGuillemets(corps), op: "rempli", valeurs: [] };
  }
  if (/\[liste\]/i.test(txt)) r.affichage = "liste";
  if (/\[boutons\]/i.test(txt)) r.affichage = "boutons";
  if (/\[case\]/i.test(txt)) r.affichage = "case";
  if (/\[\s*(positif|positive)\s*\]/i.test(txt)) r.min = 0;
  if ((m = txt.match(/\[\s*min(?:imum)?\s*(-?[\d.,]+)\s*\]/i))) r.min = parseFloat(m[1].replace(",", "."));
  if ((m = txt.match(/\[\s*max(?:imum)?\s*(-?[\d.,]+)\s*\]/i))) r.max = parseFloat(m[1].replace(",", "."));
  if (/\[\s*confidentiel(le)?\s*\]/i.test(txt)) r.confidentiel = true;
  if ((m = txt.match(/\[\s*tableau\s+([^\]\s]+)(?:\s+lignes?\s*[=:]\s*([^\]]+?))?\s*\]/i))) r.tableau = { table: m[1], lignes: m[2] ? sansGuillemets(m[2]) : null };
  if ((m = txt.match(/\[\s*couleurs?\b([^\]]*)\]/i))) {
    const regles = m[1].split(/\s*;\s*|\s*,\s*(?!\d+\s*[=:])/).map(p => { const k = p.lastIndexOf("="); return k > 0 ? { cle: p.slice(0, k).trim(), couleur: p.slice(k + 1).trim() } : null; }).filter(Boolean);
    r.couleur = regles.length ? regles : "choix";
  }
  if ((m = txt.match(/\[\s*ordre\s*(\d+)\s*\]/i))) r.ordre = +m[1];
  if (/\[\s*(court|une\s+ligne)\s*\]/i.test(txt)) r.court = true;
  if (/\[\s*auto(matique)?\s*\]/i.test(txt)) r.auto = true;
  if (/\[\s*(masqu[ée]e?|cach[ée]e?|invisible)\s*\]/i.test(txt)) r.masque = true;
  r.aide = txt.replace(/^\*\s*/, "").replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
  return r;
}

/* ---------- conditions (mêmes règles que le widget de saisie) ---------- */
function evaluerCondition(v, cond) {
  if ((cond.op === "=" || cond.op === "!=") && typeof v === "number") {
    const c = (cond.valeurs || []).map(normaliser), oui = ["oui", "vrai", "true"], non = ["non", "faux", "false"];
    if (c.length && c.every(x => oui.includes(x) || non.includes(x))) {
      const res = (c.some(x => oui.includes(x)) && v > 0) || (c.some(x => non.includes(x)) && v <= 0);
      return cond.op === "!=" ? !res : res;
    }
  }
  if ([">", ">=", "<", "<="].includes(cond.op)) {
    const x = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
    const y = parseFloat(String((cond.valeurs || [])[0] ?? "").replace(",", "."));
    if (isNaN(x) || isNaN(y)) return false;
    return cond.op === ">" ? x > y : cond.op === ">=" ? x >= y : cond.op === "<" ? x < y : x <= y;
  }
  let liste, renseignee;
  if (typeof v === "boolean") { liste = v ? ["oui", "vrai", "true", "1"] : ["non", "faux", "false", "0"]; renseignee = v; }
  else if (Array.isArray(v)) { liste = v; renseignee = liste.length > 0; }
  else { liste = (v == null || v === "") ? [] : [String(v)]; renseignee = liste.length > 0; }
  if (cond.op === "vide") return !renseignee;
  if (cond.op === "rempli") return !!renseignee;
  const valeurs = liste.map(normaliser);
  const trouve = (cond.valeurs || []).some(x => valeurs.includes(normaliser(x)));
  return cond.op === "!=" ? !trouve : trouve;
}
function colonneDeRef(ref) {
  if (!ref) return null;
  if (meta[ref]) return meta[ref];
  const n = normaliser(ref);
  return Object.values(meta).find(c => normaliser(c.colId) === n || normaliser(c.libelle) === n) || null;
}
const OPS_LIB = { "=": "=", "!=": "≠", ">": ">", ">=": "≥", "<": "<", "<=": "≤", rempli: "est renseigné", vide: "est vide" };
function texteCondition(c) {
  const col = colonneDeRef(c.ref), nom = col ? (libelleQuestion(col.colId) || col.libelle) : c.ref;
  if (c.op === "rempli" || c.op === "vide") return `${nom} ${OPS_LIB[c.op]}`;
  return `${nom} ${OPS_LIB[c.op] || c.op} ${(c.valeurs || []).join(" ou ")}`;
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
const normColonne = t => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const ROLES_COLONNES = [   // ordre de reconnaissance (identique au widget de saisie)
  { id: "Dossier", lib: "Dossier", aide: "Référence vers cette même table : relie les mises à jour à leur signalement.", motifs: [/(^|_)dossier(_|$)/, /signalement_?initial/], ok: (c, t) => c.type === `Ref:${t}` },
  { id: "Etablissement", lib: "Établissement", requis: true, aide: "Référence vers le référentiel des établissements.", motifs: [/etablissement/, /(^|_)etab(_|$)/, /structure|universite|ecole|college|lycee/], ok: (c, t) => /^Ref:/.test(c.type) && c.type !== `Ref:${t}` },
  { id: "Date_faits", lib: "Date des faits", aide: "Jour des faits signalés.", motifs: [/faits?(_|$)/, /date_?(de_?l_?)?evenement/], ok: c => /^(Date|DateTime)/.test(c.type) && !c.formule },
  { id: "Date", lib: "Date de saisie", aide: "Remplie par Grist (formule d'initialisation NOW()).", motifs: [/^date_?(de_?)?(saisie|creation|version)/, /cree_?le|horodat|creation/, /^date$/], ok: c => /^(DateTime|Date)/.test(c.type) },
  { id: "Qualification", lib: "Qualification", requis: true, aide: "Choix proposés à l'étape 2.", motifs: [/qualif/, /categorie_?(du_?)?(signalement|evenement)/, /type_?(d_?)?evenement/], ok: c => /^(Choice|ChoiceList|Text)/.test(c.type) && !c.formule },
  { id: "Description", lib: "Description", requis: true, aide: "Texte rédigé à l'étape 3.", motifs: [/^description/, /description/, /recit|resume_?des_?faits/], ok: c => /^Text/.test(c.type) && !c.formule },
  { id: "Nature", lib: "Nature", aide: "« Nouveau signalement » ou « Mise à jour ».", motifs: [/^nature$/, /nature_?(du_?)?(signalement|version|saisie)/], ok: c => /^(Choice|Text)/.test(c.type) && !c.formule },
  { id: "Commentaire", lib: "Commentaire de mise à jour", aide: "Résumé des changements d'une mise à jour.", motifs: [/^commentaire/, /commentaire/], ok: c => /^Text/.test(c.type) && !c.formule },
  { id: "Auteur", lib: "Auteur", aide: "Adresse de la personne qui enregistre (formule d'initialisation user.Email).", motifs: [/^auteur/, /saisi_?par|redacteur|createur/], ok: () => true },
  { id: "Site", lib: "Site / bâtiment", aide: "Site, campus ou bâtiment concerné (étape 1).", motifs: [/^site/, /batiment|campus/], ok: c => /^(Text|Choice)/.test(c.type) && !c.formule },
  { id: "Clos", lib: "Clos", aide: "Case « signalement terminé » (menu « Autres actions »).", motifs: [/^clos/, /cloture|termine/], ok: c => c.type === "Bool" && !c.formule },
];
const ROLE_DEF = Object.fromEntries(ROLES_COLONNES.map(r => [r.id, r]));
const ORDRE_ROLES = ["Etablissement", "Site", "Date_faits", "Qualification", "Description", "Dossier", "Nature", "Date", "Commentaire", "Auteur", "Clos"];
let metaBrut = {};                 // colonnes réelles de la table du formulaire courant
const remplissage = new Map();     // table -> colonnes renseignées sur au moins une ligne
const celluleRemplie = v => v != null && v !== "" && v !== 0 && v !== false && !(Array.isArray(v) && (v[0] === "L" ? v.length <= 1 : !v.length));
// Reconnaissance d'après les noms : mêmes règles que le widget de saisie (colonne remplie préférée, colonnes des
// questions jamais prises, rôles imposés conservés)
function reconnaitreRoles(brut, tid, remplies, exclues, imposes) {
  const res = { ...(imposes || {}) }, pris = new Set(Object.values(res).filter(Boolean));
  const cols = Object.values(brut || {}).filter(c => c && c.colId && c.colId !== "id" && c.colId !== "manualSort" && !c.colId.startsWith("gristHelper"));
  const noms = c => [normColonne(c.colId), normColonne(c.libelle)].filter(Boolean);
  const remplie = id => !!(remplies && remplies.has(id)), exacts = new Set();
  for (const r of ROLES_COLONNES) { if (r.id in res) continue; const c = (brut || {})[r.id]; if (c && !pris.has(r.id) && r.ok(c, tid)) { res[r.id] = r.id; pris.add(r.id); exacts.add(r.id); } }
  for (const r of ROLES_COLONNES) {
    if (r.id in res && !exacts.has(r.id)) continue;
    if (exacts.has(r.id) && (!remplies || !remplies.size || remplie(r.id))) continue;
    let choix = null;
    for (const m of r.motifs) {
      const cands = cols.filter(c => !pris.has(c.colId) && !(exclues && exclues.has(c.colId)) && r.ok(c, tid) && noms(c).some(n => m.test(n)));
      if (!cands.length) continue;
      if (r.id === "Date") cands.sort((a, b) => (/NOW\(\)/.test(b.texteFormule) ? 1 : 0) - (/NOW\(\)/.test(a.texteFormule) ? 1 : 0));
      const pleine = cands.find(c => remplie(c.colId));
      if (exacts.has(r.id)) { if (pleine) { choix = pleine; break; } continue; }
      choix = pleine || cands[0]; break;
    }
    if (choix) { if (res[r.id]) pris.delete(res[r.id]); res[r.id] = choix.colId; pris.add(choix.colId); }
  }
  return res;
}
const colonnesQuestions = () => new Set(blocs().filter(b => b.genre === "question").map(b => b.colonne));
// Rôles réglés dans ce formulaire (une colonne disparue depuis n'est plus retenue)
function rolesReglesValides() {
  const s = (courant && courant.conf.roles) || {}, res = {};
  for (const [r, c] of Object.entries(s)) if (ROLE_DEF[r] && (c === "" || metaBrut[c])) res[r] = c;
  return res;
}
// Association effective : rôles réglés, sinon colonne proposée, sinon "" (aucune)
function rolesSocle() {
  const res = {};
  if (!courant || courant.table !== socleGeneral.reponses) return res;
  const r = (socleConfig && socleConfig.valeurs.roles && socleConfig.valeurs.roles.reponses) || {};
  for (const [k, c] of Object.entries(r)) { const id = k === "Cree_le" ? "Date" : k; if (ROLE_DEF[id] && metaBrut[c]) res[id] = c; }
  return res;
}
function rolesEffectifs() {
  if (!courant || courant.type !== "etablissement") return {};
  const p = reconnaitreRoles(metaBrut, courant.table, remplissage.get(courant.table), colonnesQuestions(), { ...rolesSocle(), ...rolesReglesValides() });
  return Object.fromEntries(ORDRE_ROLES.map(r => [r, p[r] || ""]));
}
const roleRegle = r => r in rolesReglesValides();
// Colonne de l'établissement d'une table quelconque (création d'un formulaire sur une table existante…)
function colEtabDe(tid) {
  if (courant && tid === courant.table && courant.type === "etablissement") return rolesEffectifs().Etablissement || null;
  return reconnaitreRoles(colonnesDe(tid), tid, remplissage.get(tid)).Etablissement || null;
}
const colEtab = () => (meta.Etablissement && meta.Etablissement.colId) || "Etablissement";
function metaCourante() {
  metaBrut = colonnesDe(courant.table);
  const res = { ...metaBrut };
  if (courant.type !== "etablissement") return res;
  const roles = rolesEffectifs(), regles = rolesReglesValides();
  for (const [r, c] of Object.entries(roles)) {
    if (c === r || (!c && !(r in regles))) continue;   // même identifiant, ou rien de mieux que la colonne de ce nom
    delete res[r];
    if (c && metaBrut[c]) Object.defineProperty(res, r, { value: metaBrut[c], enumerable: false, configurable: true, writable: true });
  }
  return res;
}
// Colonnes renseignées de la table (lecture unique à l'ouverture du formulaire) : la proposition préfère une colonne
// remplie à une colonne vide du même nom
async function lireRemplissage(tid) {
  if (!tid || remplissage.has(tid)) return;
  try {
    const t = await grist.docApi.fetchTable(tid);
    remplissage.set(tid, new Set(Object.keys(t).filter(c => c !== "id" && (t[c] || []).some(celluleRemplie))));
  } catch (_) { remplissage.set(tid, new Set()); }
  if (courant && courant.table === tid) {
    const avant = JSON.stringify(Object.keys(meta).concat(Object.values(rolesEffectifs())));
    meta = metaCourante();
    if (JSON.stringify(Object.keys(meta).concat(Object.values(rolesEffectifs()))) !== avant) { dessinerApercu(); dessinerPanneau(); majEtat(); }
  }
}
function groupeColonnesHtml() {
  if (courant.type !== "etablissement") return "";
  const roles = rolesEffectifs(), te = tableEtab(), questions = colonnesQuestions();
  const cols = Object.values(metaBrut).filter(c => c.colId !== "id").sort((a, b) => a.pos - b.pos);
  const service = new Set(COLS_QUESTIONNAIRE.map(x => x.id));
  const manquants = ORDRE_ROLES.filter(r => ROLE_DEF[r].requis && !roles[r]);
  const proposes = ORDRE_ROLES.filter(r => roles[r] && !roleRegle(r));
  const ligne = r => {
    const d = ROLE_DEF[r], v = roles[r];
    const compat = cols.filter(c => (d.ok(c, courant.table) && !questions.has(c.colId)) || c.colId === v);
    const autreRole = id => ORDRE_ROLES.find(k => k !== r && roles[k] === id);
    const opts = `<option value=""${v ? "" : " selected"}>— aucune —</option>` + compat.map(c => { const a = autreRole(c.colId);
      return `<option value="${esc(c.colId)}"${c.colId === v ? " selected" : ""}>${esc(c.libelle)}${c.libelle !== c.colId ? ` (${esc(c.colId)})` : ""}${a ? ` — déjà : ${esc(ROLE_DEF[a].lib.toLowerCase())}` : ""}</option>`; }).join("");
    const etat = !v ? (d.requis ? '<span class="avert" style="display:inline;padding:0 4px">obligatoire</span>' : "")
      : roleRegle(r) ? "" : '<span class="note" style="display:inline">proposée</span>';
    const ajout = !v && service.has(r) && !metaBrut[r] ? ` <button type="button" class="ajout-lien" data-ajout-col="${r}">Créer la colonne</button>` : "";
    return `<li><label for="role-${r}" style="display:block;font-weight:600">${esc(d.lib)} ${etat}${ajout}</label>
      <select id="role-${r}" data-role-col="${r}" style="margin:2px 0 0;width:100%">${opts}</select><small>${esc(d.aide)}</small></li>`;
  };
  return `<div class="groupe"><div class="t">Colonnes de la table des réponses</div>
    <p class="note" style="margin:0 0 6px">Colonne de la table <b>${esc(courant.table)}</b> utilisée pour chaque rôle, par ce formulaire et le widget de saisie.
      ${proposes.length ? `Les colonnes marquées « proposée » ont été reconnues d'après leur nom : vérifiez-les ; elles seront confirmées à la publication.` : ""}</p>
    ${manquants.length ? `<p class="avert" style="margin:0 0 6px">À associer avant de publier : ${manquants.map(r => esc(ROLE_DEF[r].lib)).join(", ")}.</p>` : ""}
    ${proposes.length ? `<button type="button" class="secondaire petit" id="roles-confirmer" style="margin-bottom:6px">Confirmer les colonnes proposées</button>` : ""}
    <ul class="liste-cols">${ORDRE_ROLES.map(ligne).join("")}</ul>
    <p class="note" style="margin:6px 0 0">Référentiel des établissements : table <b>${esc(te || "?")}</b>.</p></div>`;
}
function lierRoles(p) {
  p.querySelectorAll("[data-role-col]").forEach(sel => sel.addEventListener("change", () => {
    const r = sel.dataset.roleCol, v = sel.value, roles = courant.conf.roles = { ...(courant.conf.roles || {}) };
    // une colonne ne joue qu'un rôle : celui qu'elle avait passe à « aucune »
    for (const [k, c] of Object.entries(rolesEffectifs())) if (k !== r && v && c === v) roles[k] = "";
    roles[r] = v;
    meta = metaCourante(); sauver(); dessinerApercu(); dessinerPanneau();
  }));
  const b = $("roles-confirmer");
  if (b) b.addEventListener("click", () => { courant.conf.roles = rolesEffectifs(); meta = metaCourante(); sauver(); dessinerPanneau(); message("Colonnes confirmées (brouillon).", "ok"); });
}

/* ---------- formulaire courant ---------- */
const blocs = () => courant ? courant.conf.blocs : [];
const blocDe = id => blocs().find(b => b.id === id) || null;
function libelleQuestion(colId) {
  const b = blocs().find(x => x.genre === "question" && x.colonne === colId);
  return (b && b.reglages && b.reglages.libelle) || (meta[colId] && meta[colId].libelle) || colId;
}
function charger(f) {
  let conf = null;
  for (const src of [f.brouillon, f.publie]) { if (!conf && typeof src === "string" && src.trim()) { try { conf = JSON.parse(src); } catch (_) {} } }
  if (!conf || !Array.isArray(conf.blocs)) conf = { blocs: [] };
  courant = { id: f.id, nom: f.nom, table: f.table, type: f.type || "etablissement", conf, publie: f.publie || "", publieLe: f.publieLe, widget: f.widget || "" };
  meta = metaCourante(); lireRemplissage(f.table);
  choisi = null; simulations = {}; testLignes = {}; modeApercu = "nouveau"; etabsTest = null; etabTest = null;
  const ids = new Set(parties().map(x => x.id)), premiere = parties().find(x => x.role === "q").id;
  conf.blocs.forEach(b => { if (!ids.has(b.section || "q")) b.section = premiere; });
}
let minuterie = null, enregistrementEnCours = Promise.resolve();
function sauver() {   // brouillon enregistré automatiquement, 400 ms après la dernière modification
  majEtat();
  clearTimeout(minuterie);
  minuterie = setTimeout(() => {
    const json = JSON.stringify(courant.conf), id = courant.id;
    enregistrementEnCours = enregistrementEnCours.then(() => actions([["UpdateRecord", TABLE_FORMULAIRES, id, { Brouillon: json, Modifie_le: maintenant() }]]))
      .then(() => { const f = formulaires.find(x => x.id === id); if (f) f.brouillon = json; })
      .catch(e => message(`Brouillon non enregistré : ${e.message || e}`, "err"));
  }, 400);
}
function parties() {
  if (!courant) return [];
  if (!Array.isArray(courant.conf.parties) || !courant.conf.parties.length) courant.conf.parties = copie(PARTIES_DEFAUT);
  const l = courant.conf.parties;
  return [...l.filter(x => x.role === "q"), ...l.filter(x => x.role === "vd"), ...l.filter(x => x.role === "va")];
}
const partieDe = id => parties().find(x => x.id === id) || parties()[0];
const communsActifs = () => courant && courant.type === "etablissement" && !!meta.Etablissement;
function differences() {
  if (!courant) return 0;
  let pub = [], pubParties = PARTIES_DEFAUT, pubDesc = null, pubSaisie = null, pubRoles = null;
  try { if (courant.publie) { const c = JSON.parse(courant.publie); pub = c.blocs || []; pubDesc = c.description || null; pubSaisie = c.saisie || null; pubRoles = c.roles || null; if (Array.isArray(c.parties) && c.parties.length) pubParties = c.parties; } } catch (_) {}
  const ecartParties = (JSON.stringify(pubParties) !== JSON.stringify(courant.conf.parties || PARTIES_DEFAUT) ? 1 : 0)
    + (JSON.stringify(pubDesc) !== JSON.stringify(courant.conf.description || null) ? 1 : 0)
    + (JSON.stringify(pubSaisie) !== JSON.stringify(courant.conf.saisie || null) ? 1 : 0)
    + (courant.type === "etablissement" && JSON.stringify(pubRoles) !== JSON.stringify(rolesEffectifs()) ? 1 : 0);
  const a = new Map(pub.map(b => [b.id, JSON.stringify(b)])), n = blocs();
  let d = Math.abs(pub.length - n.length);
  n.forEach((b, i) => { if (a.get(b.id) !== JSON.stringify(b) || (pub[i] && pub[i].id !== b.id)) d++; });
  return d + ecartParties;
}
function majEtat() {
  const el = $("etat-publi");
  if (!courant) { el.textContent = ""; el.className = "etat-publi"; return; }
  const d = differences();
  if (!courant.publie) { el.textContent = "Jamais publié"; el.className = "etat-publi brouillon"; }
  else if (d) { el.textContent = `Brouillon · ${d} modification${d > 1 ? "s" : ""} non publiée${d > 1 ? "s" : ""}`; el.className = "etat-publi brouillon"; }
  else { el.textContent = "Publié, à jour"; el.className = "etat-publi a-jour"; }
  $("btn-publier").disabled = !!courant.publie && !d;
  const nbq = blocs().filter(b => b.genre === "question").length;
  $("infos").innerHTML = `${esc(TYPES_QUESTIONNAIRE[courant.type] || "Questionnaire")} · table <b>${esc(courant.table)}</b> · ${nbq} question${nbq > 1 ? "s" : ""}`;
}
let minuterieMsg = null;
function message(t, type) {
  let el = $("msg-global");
  if (!el) { el = document.createElement("div"); el.id = "msg-global"; el.className = "bandeau bandeau-msg"; el.setAttribute("role", "status"); $("apercu").prepend(el); }
  el.textContent = t; el.style.background = type === "ok" ? "#e6f4ea" : ""; el.style.color = type === "ok" ? "var(--ok)" : "";
  clearTimeout(minuterieMsg);
  if (type === "ok") minuterieMsg = setTimeout(() => el.remove(), 4000);
}

/* =========================================================
   Aperçu
   ========================================================= */
function valeurParDefaut() { return null; }
function champHtml(b) {
  const r = b.reglages || {}, c = meta[b.colonne];
  if (!c) return `<p class="avert">La colonne « ${esc(b.colonne)} » n'existe plus dans la table ${esc(courant.table)}.</p>`;
  const id = `ap-${b.colonne}`, t = typeBase(c.type), ch = c.opts.choices || [], couleurs = c.opts.choiceOptions || {};
  const lib = esc(r.libelle || c.libelle);
  const titre = `${lib}${r.obligatoire ? ' <span class="req">*</span>' : ""}${r.condition && r.condition.ref ? `<span class="pastille-cond">si ${esc(texteCondition(r.condition))}</span>` : ""}` +
    `${r.confidentiel ? '<span class="pastille-autre">confidentiel</span>' : ""}`;
  const aide = r.aide ? `<span class="aide">${esc(r.aide)}</span>` : "";
  const style = v => { const o = couleurs[v] || {}; return o.fillColor ? `--c:${o.textColor || "#161616"};--c-bg:${o.fillColor}` : ""; };
  const enBoutons = (t === "Choice" && ch.length && r.affichage !== "liste" && (r.affichage === "boutons" || ch.length <= 5)) || (t === "Bool" && r.affichage !== "case");
  const dis = modeTest ? "" : " tabindex=\"-1\"";
  if (c.formule) {
    const src = sourceEtab(c), v = modeTest ? valeurFormuleTest(c) : undefined;
    const contenu = modeTest ? (v === undefined ? "Valeur calculée par Grist à l'enregistrement" : v == null || v === "" ? "—" : valeurLisible(c, v))
      : src ? `Repris de la fiche établissement : ${libelleColEtab(src)}` : `Calculé par Grist : ${c.texteFormule}`;
    return `<div class="champ"><label>${titre}${aide}</label><div class="lecture" data-formule="${esc(b.colonne)}">${esc(contenu)}</div></div>`;
  }
  if (r.tableau && r.tableau.table && modeTest) return `<div class="champ"><label>${titre}${aide}</label><div class="tableau-test" data-tab="${esc(b.colonne)}">${tableauTestHtml(b)}</div></div>`;
  if (r.tableau && r.tableau.table) {
    const sc = sousColonnes(r.tableau.table).filter(x => !x.r.masque);
    return `<div class="champ"><label>${titre}${aide}</label><div class="tableau-apercu"><strong>Une ligne par élément</strong> · table « ${esc(r.tableau.table)} »` +
      `<div class="cols">${sc.map(x => `<span>${esc(x.libelle)}</span>`).join("") || "<em>aucune colonne : ajoutez-en dans le panneau</em>"}</div>` +
      `<button type="button" class="secondaire petit"${dis}>+ Ajouter</button>${r.tableau.lignes ? ` <small class="note">Nombre de lignes suivant « ${esc(libelleQuestion(r.tableau.lignes))} »</small>` : ""}</div></div>`;
  }
  if (enBoutons) {
    const opts = t === "Bool" ? [["true", "Oui"], ["false", "Non"]] : ch.map(x => [x, x]);
    return `<fieldset class="champ"><legend>${titre}${aide}</legend><div class="choix-groupe${t === "Bool" ? " choix-oui-non" : ""}">${opts.map(([v, l]) =>
      `<label class="choix" style="${t === "Bool" ? "" : style(v)}"><input type="radio" name="${id}" value="${esc(v)}"${dis}><span>${esc(l)}</span></label>`).join("")}</div></fieldset>`;
  }
  if (t === "Bool") return `<div class="champ"><label class="case"><input type="checkbox" name="${id}"${dis}> ${lib}</label>${aide}</div>`;
  if (t === "Choice") return `<div class="champ"><label for="${id}">${titre}${aide}</label><select id="${id}" name="${id}"${dis}><option value="">Choisir…</option>${ch.map(x => `<option>${esc(x)}</option>`).join("")}</select></div>`;
  if (t === "ChoiceList") return `<fieldset class="champ"><legend>${titre}${aide}</legend><div class="coches">${ch.map(x => `<label><input type="checkbox" name="${id}" value="${esc(x)}"${dis}> ${esc(x)}</label>`).join("")}</div></fieldset>`;
  if (t === "Numeric" || t === "Int") return `<div class="champ"><label for="${id}">${titre}${aide}</label><input type="number" id="${id}" name="${id}"${r.min != null && r.min !== "" ? ` min="${esc(r.min)}"` : ""}${dis}></div>`;
  if (t === "Date") return `<div class="champ"><label for="${id}">${titre}${aide}</label><input type="date" id="${id}" name="${id}"${dis}></div>`;
  if (t === "DateTime") return `<div class="champ"><label for="${id}">${titre}${aide}</label><input type="datetime-local" id="${id}" name="${id}"${dis}></div>`;
  if (t === "Ref" || t === "RefList") return `<div class="champ"><label for="${id}">${titre}${aide}</label><select id="${id}" name="${id}"${dis}><option>Choisir…</option></select></div>`;
  if (t === "Attachments") return `<div class="champ"><label>${titre}${aide}</label><div class="pj-apercu" style="display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border:1px dashed var(--bleu,#000091);border-radius:6px;color:var(--bleu,#000091);font-weight:600">📎 Ajouter des photos ou des fichiers</div>
    <div class="note" style="margin-top:4px">Photos de la galerie ou de l'appareil photo, PDF, documents bureautiques ; envoyés dans les pièces jointes du document Grist.</div></div>`;
  if (r.court) return `<div class="champ"><label for="${id}">${titre}${aide}</label><input type="text" id="${id}" name="${id}"${dis}></div>`;
  return `<div class="champ"><label for="${id}">${titre}${aide}</label><textarea id="${id}" name="${id}" style="min-height:70px"${dis}></textarea></div>`;
}
function typeAffiche(b) {
  if (b.genre === "titre") return "Titre";
  if (b.genre === "info") return "Information";
  const c = meta[b.colonne], r = b.reglages || {};
  if (!c) return "Colonne absente";
  if (c.formule) return sourceEtab(c) ? "Donnée établissement" : "Formule";
  if (r.tableau) return "Tableau";
  return ({ Text: r.court ? "Texte court" : "Texte long", Int: "Nombre entier", Numeric: "Nombre décimal", Choice: "Choix unique", ChoiceList: "Choix multiple",
    Bool: "Oui / Non", Date: "Date", DateTime: "Date et heure", Ref: "Référence", RefList: "Références", Attachments: "Pièces jointes" })[typeBase(c.type)] || typeBase(c.type);
}
function blocHtml(b) {
  const contenu = b.genre === "titre" ? `<h3 class="titre-section">${esc(b.texte || "Titre de section")}</h3>`
    : b.genre === "info" ? `<p class="info-formulaire">${esc(b.texte || "Texte d'information").replace(/\n/g, "<br>")}</p>` : champHtml(b);
  const nom = b.genre === "question" ? libelleQuestion(b.colonne) : (b.texte || typeAffiche(b));
  return `<div class="bloc${b.id === choisi && !modeTest ? " choisi" : ""}" data-bloc="${b.id}" draggable="${!modeTest}" tabindex="${modeTest ? -1 : 0}" aria-label="${esc(typeAffiche(b))} : ${esc(nom)}">` +
    `<span class="etiq-type">${esc(typeAffiche(b))}</span><span class="poignee" aria-hidden="true">⋮⋮</span>` +
    (modeTest ? "" : `<span class="outils"><button type="button" data-act="haut" title="Monter" aria-label="Monter">↑</button><button type="button" data-act="bas" title="Descendre" aria-label="Descendre">↓</button>` +
      `<button type="button" data-act="dupliquer" title="Dupliquer" aria-label="Dupliquer">⧉</button><button type="button" data-act="retirer" title="Retirer du formulaire" aria-label="Retirer du formulaire">✕</button></span>`) +
    `${contenu}</div>`;
}
const insertion = (section, index) => modeTest ? "" : `<div class="insertion" data-section="${section}" data-index="${index}"><button type="button" data-ajout>+ Ajouter une question</button></div>`;
function communHtml(colId) {
  const c = meta[colId]; if (!c) return "";
  const dis = modeTest ? "" : ' tabindex="-1"';
  let h = "";
  const rechercheTest = lib => `<label for="test-etab">${lib}<span class="aide">Test : recherche dans la table ${esc(tableEtab() || "des établissements")}. Les données de la fiche et la description suivent l'établissement choisi.</span></label>` +
    `<input type="text" id="test-etab" list="test-etab-liste" autocomplete="off" placeholder="${etabsTest ? "Nom ou UAI" : "Chargement du référentiel…"}" value="${esc(etabTest ? libelleEtabTest(etabTest) : "")}"><datalist id="test-etab-liste"></datalist>`;
  if (colId === "Etablissement" && majApercu()) h = `<div class="champ"><div class="resume-etab"><span id="test-resume-etab">${resumeEtabTestHtml()}</span><span class="faux-lien">Voir la fiche</span></div></div>` +
    (modeTest ? `<div class="champ">${rechercheTest("Établissement du dossier (pour le test)")}</div>` : "");
  else if (colId === "Etablissement" && modeTest) h = `<div class="champ">${rechercheTest('Nom ou UAI <span class="req">*</span>')}<dl class="identite" id="test-fiche"${etabTest ? "" : " hidden"}>${ficheTestHtml()}</dl></div>`;
  else if (colId === "Etablissement") h = `<div class="champ"><label>Nom ou UAI <span class="req">*</span><span class="aide">Recherche par nom ou UAI dans la table ${esc(tableEtab() || "des établissements")}, puis complétion automatique (type, commune, académie, département) ; création dans le référentiel si besoin.</span></label><input type="text" placeholder="Nom ou UAI"${dis} disabled></div>`;
  else if (colId === "Site") h = `<div class="champ"><label for="test-site">${esc(c.libelle && c.libelle !== "Site" ? c.libelle : "Site / bâtiment")}<span class="aide">Facultatif : campus, site ou bâtiment concerné.</span></label><input type="text" id="test-site"${dis} ${modeTest ? "" : "disabled"}></div>`;
  else if (colId === "Date_faits") { const o = saisieEff();
    h = `<div class="champ"><label>${esc(c.libelle)} <span class="req">*</span><span class="aide">Aujourd'hui par défaut.${o.faitsFuturs ? " Peut être à venir (fermeture annoncée…)." : " Jamais postérieure à aujourd'hui."}</span></label><input type="date"${dis}>` +
      (o.plusieursJours && typeBase(c.type) === "Date" ? `<label class="case" style="margin-top:6px"><input type="checkbox"${dis} ${modeTest ? "" : "disabled"}> Les faits s'étendent sur plusieurs jours (un signalement par jour)</label>` : "") + `</div>`; }
  else if (colId === "Qualification") {
    const ch = c.opts.choices || [], co = c.opts.choiceOptions || {};
    h = `<fieldset class="champ"><legend>${esc(c.libelle)} <span class="req">*</span></legend><div class="choix-groupe">${ch.map(x => { const o = co[x] || {};
      return `<label class="choix" style="${o.fillColor ? `--c:${o.textColor || "#161616"};--c-bg:${o.fillColor}` : ""}"><input type="radio" name="ap-Qualification" value="${esc(x)}"${dis}><span>${esc(x)}</span></label>`; }).join("")}</div></fieldset>`;
  } else if (colId === "Description") {
    const perso = !!(courant.conf.description && courant.conf.description.perso), o = optionsDescription();
    const aideD = !o.actif ? "Saisie libre : le pré-remplissage est désactivé." : `Rédigée automatiquement à partir des réponses ci-dessus ; l'agent peut la compléter ou la modifier. Réglages ${perso ? "propres à ce formulaire" : "communs (⚙ du widget de saisie)"}.`;
    h = `<div class="champ"><label${modeTest ? ' for="test-description"' : ""}>${esc(c.libelle)} <span class="req">*</span><span class="aide">${esc(aideD)}</span></label>` +
      (modeTest ? `<textarea id="test-description" style="min-height:90px"></textarea><div class="etat-desc-test" id="etat-desc-test"></div>`
        : `<div class="exemple-desc">${esc(exempleDescription() || "(aucun élément inclus)")}</div>`) + `</div>`;
  }
  const id = `commun:${colId}`;
  return `<div class="bloc commun${choisi === id && !modeTest ? " choisi" : ""}" data-commun="${id}" tabindex="${modeTest ? -1 : 0}" aria-label="Champ commun : ${esc(c.libelle)}"><span class="etiq-type">Champ commun</span>${h}</div>`;
}
/* ---------- bandeau et étapes, comme dans le widget de saisie ---------- */
let modeApercu = "nouveau";   // situation montrée par l'aperçu : nouveau signalement ou mise à jour d'un dossier
const majApercu = () => communsActifs() && modeApercu === "maj";
const etapeHtml = (n, texte) => `<h3 class="etape"><span class="num-etape" aria-hidden="true">${n}</span>${esc(texte)}</h3>`;
function enteteApercuHtml() {
  const maj = majApercu();
  return `<div class="barre-apercu${saisieEff().version === "esr" ? " version-esr" : ""}"><span>Situation montrée :</span><div class="seg2" role="group" aria-label="Situation montrée par l'aperçu">` +
    `<button type="button" data-mode-apercu="nouveau" aria-pressed="${!maj}">Nouveau signalement</button><button type="button" data-mode-apercu="maj" aria-pressed="${maj}">Mise à jour d'un dossier</button></div>` +
    `<span class="marque-apercu" id="marque-apercu" title="Bandeau du formulaire">${esc(saisieEff().marque)}</span></div>` +
    `<div class="entete-apercu${maj ? " maj" : ""}">${maj ? `<p class="etiquette-mode">Mise à jour · dossier n° 12</p>` : ""}` +
    `<h1>${maj ? esc(etabTest ? nomEtab(etabTest) : "Établissement du dossier") : "Nouveau signalement"}</h1>` +
    (maj ? `<p class="sous-titre-apercu">Signalé le ${new Date().toLocaleDateString("fr-FR")} · 2 mises à jour.</p>` : "") +
    `<p class="phrase-mode">${maj ? "Modifiez uniquement ce qui a changé : votre enregistrement s'ajoute comme nouvelle étape, l'état précédent reste dans l'historique."
      : "Trois étapes : l'établissement, les faits, puis la description. Un dossier sera créé à l'enregistrement."}</p></div>`;
}
function envoiHtml() {
  const maj = majApercu();
  return `<div class="envoi-apercu"><button type="button" class="primaire" disabled tabindex="-1">${maj ? "Enregistrer la mise à jour" : "Enregistrer le signalement"}</button>` +
    (maj && meta.Clos ? `<span class="note">Menu « Autres actions » : corriger ou annuler la dernière étape, clore le signalement.</span>` : "") + `</div>`;
}
function dessinerApercu() {
  const ap = $("apercu");
  if (!courant) { dessinerAccueil(); return; }
  const html = [], ps = parties(), qs = ps.filter(x => x.role === "q"), etapes = communsActifs();
  ap.classList.toggle("maj-apercu", majApercu());
  if (etapes) html.push(enteteApercuHtml());
  ps.forEach(p => {
    const s = p.id, liste = blocs().map((b, i) => ({ b, i })).filter(x => (x.b.section || "q") === s);
    if (p.role !== "q" && !liste.length && modeTest) return;
    const choisiP = choisi === `partie:${s}` && !modeTest;
    let h = `<div class="feuille${p.role !== "q" ? " visa" : ""}${etapes && p.role === "q" ? " cadre" : ""}${etapes && p === qs[0] ? " premiere" : ""}${choisiP ? " partie-choisie" : ""}" data-section-feuille="${s}">
      <h2 class="titre-partie"${modeTest ? "" : ` data-partie="${s}" tabindex="0" title="Régler la partie"`}>${esc(p.nom)} <small>${esc(ROLES[p.role])}${p.role === "q" && p.titre ? " · titre affiché" : ""}</small>${modeTest ? "" : ' <span class="crayon" aria-hidden="true">✎</span>'}</h2>`;
    if (etapes && p === qs[0]) h += etapeHtml(1, majApercu() ? "Établissement" : "Quel établissement est concerné ?") + communHtml("Etablissement") + communHtml("Site")
      + etapeHtml(2, "Les faits") + ["Date_faits", "Qualification"].map(communHtml).join("");
    if (p.role === "q" && p.titre && p.nom) h += `<h3 class="titre-section titre-partie-q">${esc(p.nom)}</h3>`;   // titre de partie affiché dans le formulaire
    if (!liste.length) h += modeTest ? "" : `<div class="vide-section">${p.role === "q" ? "Aucune question dans cette partie." : "Aucune question de visa."}<br><button type="button" class="secondaire petit" data-ajout data-section="${s}" data-index="${blocs().length}">+ Ajouter une question</button></div>`;
    else liste.forEach(({ b, i }, k) => { h += insertion(s, i) + blocHtml(b); if (k === liste.length - 1) h += insertion(s, i + 1); });
    if (etapes && p === qs[qs.length - 1]) h += etapeHtml(3, "Description et envoi") + communHtml("Description") +
      (majApercu() && saisieEff().commentaire && meta.Commentaire ? `<div class="champ"><label${modeTest ? ' for="test-commentaire"' : ""}>Commentaire de mise à jour<span class="aide">Ce qui s'est passé depuis l'étape précédente</span></label><textarea id="test-commentaire" style="min-height:50px"${modeTest ? "" : ' tabindex="-1" disabled'}></textarea></div>` : "")
      + envoiHtml();
    html.push(h + "</div>");
    if (p === qs[qs.length - 1] && !modeTest) html.push(`<div class="ajout-partie"><button type="button" class="ajout-lien" id="btn-ajout-partie">+ Ajouter une partie au formulaire</button></div>`);
  });
  const msg = $("msg-global");
  ap.innerHTML = html.join("");
  if (msg) ap.prepend(msg);
  if (modeTest) { appliquerTest(); const s = $("test-site"); if (s) s.value = siteTest; }
  majEtat();
}
function dessinerAccueil() {
  $("apercu").innerHTML = `<div class="accueil"><h2>Aucun formulaire</h2>
    <p class="note">Un formulaire rassemble les questions affichées par le widget de saisie pour une table de réponses. Ses questions créent automatiquement les colonnes de cette table.</p>
    ${accesOk ? `<button type="button" class="primaire" id="btn-premier">+ Créer un premier formulaire</button>` : ""}</div>`;
  const b = $("btn-premier"); if (b) b.addEventListener("click", () => ouvrirNouveau(false));
  $("panneau").innerHTML = "";
  majEtat();
}

/* ---------- mode test ---------- */
function valeurTest(colId) {
  const b = blocs().find(x => x.genre === "question" && x.colonne === colId);
  const c = meta[colId];
  if (!b && communsActifs() && colId === "Qualification") { const q = document.querySelector('input[name="ap-Qualification"]:checked'); return q ? q.value : null; }
  if (c && c.formule) { const v = valeurFormuleTest(c); if (v !== undefined) return v; }
  if (!b || !c) return simulations[colId] ?? null;
  if (b.reglages && b.reglages.tableau) return (testLignes[colId] || []).filter(l => Object.values(l).some(v => !estVideValeur(v))).length;
  const bloc = document.querySelector(`[data-bloc="${b.id}"]`);
  if (bloc && bloc.classList.contains("masque-test")) return null;
  if (b.reglages && b.reglages.tableau) return 0;
  const t = typeBase(c.type), nom = `ap-${colId}`;
  if (t === "Bool") { const r = document.querySelector(`input[name="${nom}"]:checked`); return r ? (r.type === "checkbox" ? r.checked : r.value === "true") : null; }
  if (t === "ChoiceList") return [...document.querySelectorAll(`input[name="${nom}"]:checked`)].map(x => x.value);
  const r = document.querySelector(`input[type=radio][name="${nom}"]:checked`); if (r) return r.value;
  const el = document.querySelector(`[name="${nom}"]:not([type=radio])`);
  if (!el || el.value === "") return null;
  return (t === "Int" || t === "Numeric") ? parseFloat(el.value) : el.value;
}
function appliquerTest() {
  ajusterTableauxTest();
  for (let passe = 0; passe < 3; passe++) {
    for (const b of blocs()) {
      const c = b.reglages && b.reglages.condition;
      const el = document.querySelector(`[data-bloc="${b.id}"]`);
      if (!el) continue;
      let visible = true;
      if (c && c.ref) { const col = colonneDeRef(c.ref); visible = evaluerCondition(valeurTest(col ? col.colId : c.ref), c); }
      el.classList.toggle("masque-test", !visible);
    }
  }
  majFormulesTest();
  majDescriptionTest();
}
function refsExternes() {
  const dansForm = new Set(blocs().filter(b => b.genre === "question").map(b => b.colonne));
  if (communsActifs()) dansForm.add("Qualification");
  const res = new Map();
  for (const b of blocs()) {
    const c = b.reglages && b.reglages.condition;
    if (!c || !c.ref) continue;
    const col = colonneDeRef(c.ref);
    if (col && !dansForm.has(col.colId)) res.set(col.colId, col);
  }
  return [...res.values()];
}
function dessinerPanneauTest() {
  const ext = refsExternes();
  $("panneau").innerHTML = `<h2>Mode test</h2><p class="sous">Répondez dans l'aperçu : les questions conditionnelles apparaissent comme dans le widget de saisie. Rien n'est enregistré.</p>` +
    (communsActifs() ? `<p class="note">Choisissez un établissement à l'étape 1 : les données de sa fiche s'affichent et la description se rédige au fil de vos réponses.</p>` : "") +
    (ext.length ? `<div class="groupe simul"><div class="t">Valeurs simulées</div><p class="note" style="margin:0 0 8px">Colonnes utilisées dans des conditions mais absentes du formulaire (par exemple la qualification).</p>` +
      ext.map(c => {
        const t = typeBase(c.type), ch = c.opts.choices || [], v = simulations[c.colId];
        const ctl = ch.length ? `<select data-simul="${esc(c.colId)}"><option value="">(vide)</option>${ch.map(x => `<option${x === v ? " selected" : ""}>${esc(x)}</option>`).join("")}</select>`
          : t === "Bool" ? `<select data-simul="${esc(c.colId)}"><option value="">(vide)</option><option value="true"${v === true ? " selected" : ""}>Oui</option><option value="false"${v === false ? " selected" : ""}>Non</option></select>`
          : `<input type="text" data-simul="${esc(c.colId)}" value="${esc(v ?? "")}">`;
        return `<label class="l">${esc(c.libelle)}</label>${ctl}`;
      }).join("") + `</div>` : "") +
    `<div class="pied-panneau"><button type="button" class="secondaire petit" id="btn-fin-test">Revenir à l'édition</button></div>`;
  $("panneau").querySelectorAll("[data-simul]").forEach(el => el.addEventListener("input", () => {
    const col = meta[el.dataset.simul], t = typeBase(col.type);
    simulations[el.dataset.simul] = el.value === "" ? null : t === "Bool" ? el.value === "true" : (t === "Int" || t === "Numeric") ? parseFloat(el.value) : el.value;
    appliquerTest();
  }));
  $("btn-fin-test").addEventListener("click", basculerTest);
}
/* ---------- tableau en mode test : lignes saisissables, nombre de lignes suivant une question ---------- */
let testLignes = {};
// Champs d'une table de tableau, dans l'ordre de saisie : [ordre N] d'abord, puis l'ordre des colonnes de Grist
const sousColonnes = tid => Object.values(colonnesDe(tid)).filter(x => !x.formule && !RESERVES_TABLEAU.includes(x.colId) && !(courant && x.type === `Ref:${courant.table}`))
  .map(x => ({ ...x, r: lireReperes(x.description) }))
  .sort((a, c) => ((a.r.ordre ?? 1e9) - (c.r.ordre ?? 1e9)) || a.pos - c.pos);
function visibleDansLigne(sc, cols, ligne) {
  const cd = sc.r.condition; if (!cd || !cd.ref) return true;
  const n = normaliser(cd.ref), cible = cols.find(x => x.colId === cd.ref || normaliser(x.colId) === n || normaliser(x.libelle) === n);
  return cible ? evaluerCondition(ligne[cible.colId] ?? null, cd) : true;
}
// Aperçu simplifié d'un champ [auto] : « Libellé : valeur » des autres champs de la ligne (hors confidentiels)
function texteAutoTest(cols, l) {
  return cols.filter(c => !c.r.auto && !c.r.confidentiel && visibleDansLigne(c, cols, l)).map(c => {
    const v = l[c.colId]; if (estVideValeur(v)) return "";
    return `${c.libelle} : ${Array.isArray(v) ? v.join(", ") : v === true ? "Oui" : v === false ? "Non" : v}`;
  }).filter(Boolean).join(" — ");
}
function tableauTestHtml(b) {
  const cols = sousColonnes(b.reglages.tableau.table).filter(x => !x.r.masque), lignes = testLignes[b.colonne] || (testLignes[b.colonne] = []);
  const attendu = b.reglages.tableau.lignes ? valeurTest(b.reglages.tableau.lignes) : null;
  const ctl = (c, k, v) => {
    const t = typeBase(c.type), ch = c.opts.choices || [], att = `data-k="${k}" data-sc="${esc(c.colId)}"`;
    // choix unique : boutons ronds comme les pastilles du widget de saisie ([liste] : menu déroulant)
    if (t === "Choice" && !/\[liste\]/i.test(c.description || "")) return `<div class="coches" role="radiogroup">${ch.map(x => `<label><input type="radio" name="t-${esc(b.colonne)}-${k}-${esc(c.colId)}" ${att} value="${esc(x)}"${x === v ? " checked" : ""}> ${esc(x)}</label>`).join("")}</div>`;
    if (t === "Choice") return `<select ${att}><option value="">Choisir…</option>${ch.map(x => `<option${x === v ? " selected" : ""}>${esc(x)}</option>`).join("")}</select>`;
    if (t === "ChoiceList") return `<div class="coches">${ch.map(x => `<label><input type="checkbox" ${att} value="${esc(x)}"${(v || []).includes(x) ? " checked" : ""}> ${esc(x)}</label>`).join("")}</div>`;
    if (t === "Bool") return `<select ${att}><option value="">—</option><option value="true"${v === true ? " selected" : ""}>Oui</option><option value="false"${v === false ? " selected" : ""}>Non</option></select>`;
    if (t === "Int" || t === "Numeric") return `<input type="number" ${att} value="${v ?? ""}">`;
    if (t === "Date") return `<input type="date" ${att} value="${esc(v || "")}">`;
    if (c.r.auto) return `<input type="text" ${att} value="${esc(texteAutoTest(cols, lignes[k]))}" readonly title="Aperçu : dans le formulaire, l'agent peut modifier ce texte">`;
    return `<input type="text" ${att} value="${esc(v || "")}">`;
  };
  return `${lignes.map((l, k) => `<div class="ligne-test"><span class="num-test">${k + 1}</span>${cols.filter(c => visibleDansLigne(c, cols, l)).map(c =>
      `<label class="sc-test"><span>${esc(c.libelle)}${c.r.obligatoire ? ' <span class="req">*</span>' : ""}${c.r.auto ? ' <small class="note">(auto)</small>' : ""}</span>${ctl(c, k, l[c.colId])}</label>`).join("")}
      <button type="button" class="icone" data-tab-act="suppr" data-k="${k}" aria-label="Supprimer la ligne ${k + 1}">✕</button></div>`).join("") || `<p class="note" style="margin:0 0 8px">Aucune ligne.</p>`}
    <div class="pied-test"><button type="button" class="secondaire petit" data-tab-act="ajout">+ Ajouter</button>
      <span class="note">${lignes.length} ligne${lignes.length > 1 ? "s" : ""}${attendu != null ? ` · ${attendu || 0} indiqué${(attendu || 0) > 1 ? "s" : ""} dans « ${esc(libelleQuestion(b.reglages.tableau.lignes))} »` : ""}</span></div>`;
}
function redessinerTableauTest(colId) {
  const b = blocs().find(x => x.colonne === colId), el = document.querySelector(`[data-tab="${CSS.escape(colId)}"]`);
  if (b && el) el.innerHTML = tableauTestHtml(b);
}
function ajusterTableauxTest() {   // même règle que le widget de saisie : ajout de lignes vides, retrait des seules lignes vides
  for (const b of blocs()) {
    const t = b.reglages && b.reglages.tableau; if (!t || !t.lignes) continue;
    const v = valeurTest(t.lignes), n = typeof v === "number" && v > 0 ? Math.min(200, Math.floor(v)) : 0;
    const l = testLignes[b.colonne] || (testLignes[b.colonne] = []);
    if (l.dernierN === n) continue;   // seul un changement du nombre ajuste les lignes (l'ajout à la main reste possible)
    l.dernierN = n;
    const avant = l.length;
    while (l.length < n) l.push({});
    while (l.length > n && !Object.values(l[l.length - 1]).some(x => !estVideValeur(x))) l.pop();
    if (l.length !== avant) redessinerTableauTest(b.colonne);
  }
}
function clicTableauTest(ev) {
  const a = ev.target.closest("[data-tab-act]"); if (!a) return;
  const colId = a.closest("[data-tab]").dataset.tab, l = testLignes[colId] || (testLignes[colId] = []);
  if (a.dataset.tabAct === "ajout") l.push({}); else l.splice(+a.dataset.k, 1);
  redessinerTableauTest(colId); appliquerTest();
}
function saisieTableauTest(ev) {
  const el = ev.target.closest("[data-sc]"); if (!el) return false;
  const colId = el.closest("[data-tab]").dataset.tab, k = +el.dataset.k, sc = el.dataset.sc, l = testLignes[colId][k];
  const c = sousColonnes(blocs().find(x => x.colonne === colId).reglages.tableau.table).find(x => x.colId === sc), t = typeBase(c.type);
  if (t === "ChoiceList") l[sc] = [...el.closest(".sc-test").querySelectorAll("input:checked")].map(x => x.value);
  else if (t === "Bool") l[sc] = el.value === "" ? null : el.value === "true";
  else if (t === "Int" || t === "Numeric") l[sc] = el.value === "" ? null : parseFloat(el.value);
  else l[sc] = el.value;
  if (ev.type === "change") { redessinerTableauTest(colId); const n = document.querySelector(`[data-tab="${CSS.escape(colId)}"] [data-k="${k}"][data-sc="${CSS.escape(sc)}"]`); if (n && n.type !== "checkbox") n.focus(); }
  return true;
}
function basculerTest() {
  modeTest = !modeTest;
  testLignes = {}; descTestManuelle = false; siteTest = "";
  if (modeTest && communsActifs() && !etabsTest) chargerEtabsTest().then(() => { const i = $("test-etab"); if (i) i.placeholder = "Nom ou UAI"; });
  $("btn-tester").setAttribute("aria-pressed", String(modeTest));
  $("btn-tester").textContent = modeTest ? "✎ Éditer" : "▶ Tester";
  $("app").classList.toggle("test", modeTest);
  fermerMenu();
  dessinerApercu();
  if (modeTest) dessinerPanneauTest(); else dessinerPanneau();
}
$("apercu").addEventListener("input", ev => {
  if (!modeTest) return;
  if (ev.target.id === "test-description") { descTestManuelle = true; majDescriptionTest(); return; }
  if (ev.target.id === "test-etab") { chercherEtabTest(ev.target.value); return; }
  if (ev.target.id === "test-site") siteTest = ev.target.value;
  saisieTableauTest(ev); appliquerTest();
});
$("apercu").addEventListener("change", ev => {
  if (!modeTest || ev.target.id === "test-description" || ev.target.id === "test-etab") return;
  saisieTableauTest(ev); appliquerTest();
});

/* =========================================================
   Sélection, déplacement, outils des blocs
   ========================================================= */
$("apercu").addEventListener("click", ev => {
  if (!courant) return;
  const ma = ev.target.closest("[data-mode-apercu]");
  if (ma) { modeApercu = ma.dataset.modeApercu; testLignes = {}; descTestManuelle = false; dessinerApercu(); return; }
  if (ev.target.closest("#btn-desc-auto")) { descTestManuelle = false; majDescriptionTest(); return; }
  if (modeTest) { clicTableauTest(ev); return; }
  if (ev.target.closest("#btn-ajout-partie")) { ajouterPartie(); return; }
  const tp = ev.target.closest("[data-partie]");
  if (tp) { choisir(`partie:${tp.dataset.partie}`); return; }
  const cm = ev.target.closest("[data-commun]");
  if (cm) { choisir(cm.dataset.commun); return; }
  const aj = ev.target.closest("[data-ajout]");
  if (aj) { const ins = aj.closest(".insertion") || aj; ouvrirMenu(ins.dataset.section || aj.dataset.section, +(ins.dataset.index ?? aj.dataset.index), aj); return; }
  const outil = ev.target.closest("[data-act]");
  const bloc = ev.target.closest(".bloc");
  // Clic dans un espace vide de l'aperçu : retour aux réglages du formulaire
  if (!bloc) { if (choisi && !ev.target.closest("button, a, input, select, textarea, label, .insertion, [data-section-feuille] h3")) choisir(null); return; }
  ev.preventDefault();
  const id = bloc.dataset.bloc;
  if (outil) { agir(outil.dataset.act, id); return; }
  choisir(id);
});
$("apercu").addEventListener("keydown", ev => {
  if (modeTest) return;
  if (ev.target.dataset && (ev.target.dataset.partie || ev.target.dataset.commun) && (ev.key === "Enter" || ev.key === " ")) {
    ev.preventDefault(); choisir(ev.target.dataset.partie ? `partie:${ev.target.dataset.partie}` : ev.target.dataset.commun); return;
  }
  const bloc = ev.target.classList && ev.target.classList.contains("bloc") && ev.target.dataset.bloc ? ev.target : null;
  if (!bloc) return;
  if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); choisir(bloc.dataset.bloc); }
  else if (ev.altKey && (ev.key === "ArrowUp" || ev.key === "ArrowDown")) { ev.preventDefault(); agir(ev.key === "ArrowUp" ? "haut" : "bas", bloc.dataset.bloc); }
  else if (ev.key === "Delete") { ev.preventDefault(); agir("retirer", bloc.dataset.bloc); }
});
function choisir(id) {
  choisi = id;
  document.querySelectorAll(".bloc").forEach(b => b.classList.toggle("choisi", (b.dataset.bloc || b.dataset.commun) === id));
  document.querySelectorAll("[data-section-feuille]").forEach(f => f.classList.toggle("partie-choisie", id === `partie:${f.dataset.sectionFeuille}`));
  dessinerPanneau();
}
function deplacer(id, versIndex, section) {
  const liste = blocs(), i = liste.findIndex(b => b.id === id);
  if (i < 0) return;
  const [b] = liste.splice(i, 1);
  if (section) b.section = section;
  liste.splice(Math.max(0, Math.min(liste.length, versIndex > i ? versIndex - 1 : versIndex)), 0, b);
  sauver(); dessinerApercu();
  const el = document.querySelector(`[data-bloc="${id}"]`); if (el) el.focus();
}
function agir(act, id) {
  const liste = blocs(), i = liste.findIndex(b => b.id === id), b = liste[i];
  if (!b) return;
  const s = b.section || "q";
  const memeSection = liste.map((x, k) => ({ x, k })).filter(o => (o.x.section || "q") === s);
  const pos = memeSection.findIndex(o => o.x.id === id);
  if (act === "haut" && pos > 0) deplacer(id, memeSection[pos - 1].k);
  else if (act === "bas" && pos < memeSection.length - 1) deplacer(id, memeSection[pos + 1].k + 1);
  else if (act === "dupliquer") dupliquerBloc(b, i);
  else if (act === "retirer") retirerBloc(b);
}
async function dupliquerBloc(b, i) {
  const n = copie(b); n.id = nouvelId();
  if (b.genre === "question") {
    // une question ne peut pas partager sa colonne : la copie crée une nouvelle colonne de même type
    const c = meta[b.colonne]; if (!c) return;
    const lib = `${libelleQuestion(b.colonne)} (copie)`;
    try {
      n.colonne = await creerColonne(courant.table, lib, c.type, c.opts); n.reglages = { ...n.reglages, libelle: lib };
      // question tableau : la copie a sa propre table, de même structure (sinon les deux questions partageraient leurs lignes et leurs champs)
      if (b.reglages && b.reglages.tableau && b.reglages.tableau.table) n.reglages.tableau = { ...b.reglages.tableau, table: await copierSousTable(b.reglages.tableau.table) };
    } catch (e) { message(`Copie impossible : ${e.message || e}`, "err"); return; }
  }
  blocs().splice(i + 1, 0, n);
  choisi = n.id; sauver(); dessinerApercu(); dessinerPanneau();
  if (n.reglages && n.reglages.tableau && n.reglages.tableau.table) { message(`Question copiée avec sa propre table, ${n.reglages.tableau.table} (mêmes champs, sans les lignes).`, "ok"); reglesApresTableau(n.reglages.tableau.table); }
}
// Nouvelle table de même structure que la sous-table d'une question tableau (colonnes, libellés, choix, réglages) ; renvoie son nom
async function copierSousTable(src) {
  const [T, C] = await Promise.all([grist.docApi.fetchTable("_grist_Tables"), grist.docApi.fetchTable("_grist_Tables_column")]);
  const ref = T.id[T.tableId.indexOf(src)]; if (!ref) throw new Error(`table ${src} introuvable`);
  const idx = C.id.map((_, i) => i).filter(i => C.parentId[i] === ref && C.colId[i] !== "manualSort" && !String(C.colId[i]).startsWith("gristHelper"));
  const nomT = identifiant(`${src} copie`, tables.concat(T.tableId));
  const v = (k, i) => (C[k] || [])[i];
  const simples = idx.filter(i => !v("isFormula", i)), formules = idx.filter(i => v("isFormula", i));
  await actions([["AddTable", nomT, simples.map(i => ({ id: v("colId", i), type: v("type", i), isFormula: false, formula: v("formula", i) || "" }))]]);
  await actions([
    ...formules.map(i => ["AddColumn", nomT, v("colId", i), { type: v("type", i), isFormula: true, formula: v("formula", i) || "" }]),
    ...idx.map(i => ["ModifyColumn", nomT, v("colId", i), { label: v("label", i) || v("colId", i), widgetOptions: v("widgetOptions", i) || "", description: v("description", i) || "", untieColIdFromLabel: true }]),
  ]);
  await lireMeta();
  return nomT;
}
function retirerBloc(b) {
  const lib = b.genre === "question" ? `« ${libelleQuestion(b.colonne)} »` : "ce bloc";
  const dependantes = blocs().filter(x => x.reglages && x.reglages.condition && colonneDeRef(x.reglages.condition.ref) && colonneDeRef(x.reglages.condition.ref).colId === b.colonne && b.genre === "question");
  if (!confirm(`Retirer ${lib} du formulaire ?${b.genre === "question" ? "\nLa colonne et ses réponses restent dans la table." : ""}${dependantes.length ? `\n${dependantes.length} question(s) dépendent de celle-ci : leur condition restera à corriger.` : ""}`)) return;
  courant.conf.blocs = blocs().filter(x => x.id !== b.id);
  if (choisi === b.id) choisi = null;
  sauver(); dessinerApercu(); dessinerPanneau();
}
// Glisser-déposer
let glisse = null;
$("apercu").addEventListener("dragstart", ev => {
  const b = ev.target.closest && ev.target.closest(".bloc"); if (!b || modeTest) return;
  glisse = b.dataset.bloc; b.classList.add("glisse"); ev.dataTransfer.effectAllowed = "move";
  try { ev.dataTransfer.setData("text/plain", glisse); } catch (_) {}
});
$("apercu").addEventListener("dragend", () => { glisse = null; document.querySelectorAll(".glisse, .depot-avant, .depot-apres").forEach(e => e.classList.remove("glisse", "depot-avant", "depot-apres")); });
function cibleDepot(ev) {
  const b = ev.target.closest && ev.target.closest(".bloc");
  if (b && b.dataset.bloc !== glisse) { const r = b.getBoundingClientRect(); return { el: b, apres: ev.clientY > r.top + r.height / 2 }; }
  const f = ev.target.closest && ev.target.closest("[data-section-feuille]");
  return f ? { feuille: f } : null;
}
$("apercu").addEventListener("dragover", ev => {
  if (!glisse) return;
  const c = cibleDepot(ev); if (!c) return;
  ev.preventDefault();
  document.querySelectorAll(".depot-avant, .depot-apres").forEach(e => e.classList.remove("depot-avant", "depot-apres"));
  if (c.el) c.el.classList.add(c.apres ? "depot-apres" : "depot-avant");
});
$("apercu").addEventListener("drop", ev => {
  if (!glisse) return;
  const c = cibleDepot(ev); if (!c) return;
  ev.preventDefault();
  if (c.el) {
    const cible = blocDe(c.el.dataset.bloc), k = blocs().indexOf(cible);
    deplacer(glisse, k + (c.apres ? 1 : 0), cible.section || "q");
  } else if (c.feuille) deplacer(glisse, blocs().length, c.feuille.dataset.sectionFeuille);
});

/* =========================================================
   Ajout d'un bloc
   ========================================================= */
let menuCtx = null;
function fermerMenu() { $("menu-ajout").hidden = true; document.querySelectorAll(".insertion.ouverte").forEach(e => e.classList.remove("ouverte")); menuCtx = null; }
function placerMenu(ancre) {
  const m = $("menu-ajout"), r = ancre.getBoundingClientRect();
  m.hidden = false;
  const l = Math.max(10, Math.min(window.innerWidth - m.offsetWidth - 10, r.left + r.width / 2 - m.offsetWidth / 2));
  let t = r.bottom + 6; if (t + m.offsetHeight > window.innerHeight - 10) t = Math.max(10, r.top - m.offsetHeight - 6);
  m.style.left = l + "px"; m.style.top = t + "px";
}
function ouvrirMenu(section, index, ancre) {
  menuCtx = { section: section || "q", index: isNaN(index) ? blocs().length : index, ancre };
  const ins = ancre.closest(".insertion"); if (ins) ins.classList.add("ouverte");
  const m = $("menu-ajout");
  m.innerHTML = `<h4>Ajouter</h4><div class="types">${TYPES.filter(t => !t.etab || (communsActifs() && tableEtab())).map(t => `<button type="button" data-type="${t.cle}"><b>${t.icone}</b>${esc(t.nom)}</button>`).join("")}</div>
    <div class="lien-existante"><button type="button" class="ajout-lien" data-type="existante">↳ Utiliser des colonnes existantes de la table…</button></div>`;
  placerMenu(ancre);
  m.querySelector("button").focus();
}
$("menu-ajout").addEventListener("click", ev => {
  const b = ev.target.closest("button"); if (!b || !menuCtx) return;
  if (b.dataset.type === "existante") return etapeExistantes();
  if (b.dataset.type === "etab") return etapeEtab();
  if (b.dataset.type) return etapeLibelle(TYPES.find(t => t.cle === b.dataset.type));
  if (b.dataset.menu === "annuler") return fermerMenu();
});
$("menu-ajout").addEventListener("keydown", ev => { if (ev.key === "Escape") { ev.preventDefault(); const a = menuCtx && menuCtx.ancre; fermerMenu(); if (a) a.focus(); } });
document.addEventListener("mousedown", ev => { if (!$("menu-ajout").hidden && !$("menu-ajout").contains(ev.target) && !ev.target.closest("[data-ajout]")) fermerMenu(); });
function etapeLibelle(type) {
  const m = $("menu-ajout");
  const decor = !!type.decor;
  m.innerHTML = `<h4>${esc(type.nom)}</h4><form class="etape2" id="form-etape2">
    <label for="e2-texte">${decor ? (type.decor === "titre" ? "Titre" : "Texte") : "Intitulé de la question"}</label>
    ${type.decor === "info" ? `<textarea id="e2-texte" required></textarea>` : `<input type="text" id="e2-texte" required autocomplete="off">`}
    ${type.cle === "tableau" ? `<label for="e2-table-choix">Table des lignes<span class="aide">Une ligne par élément saisi (par exemple un blessé, un site).</span></label>
      <select id="e2-table-choix" style="margin-bottom:8px"><option value="__nouvelle__">+ Créer une nouvelle table</option>${tablesPourTableau().map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join("")}</select>
      <div id="e2-bloc-nouvelle"><label for="e2-table">Nom de la nouvelle table</label><input type="text" id="e2-table" autocomplete="off"></div>
      <p class="note" id="e2-table-info" style="margin:0 0 6px" hidden></p>` : ""}
    ${!decor ? `<p class="note" style="margin:0 0 6px">Une colonne « ${esc(typeAffiche({ genre: "question", colonne: "", reglages: {} }) && type.nom)} » sera créée dans la table ${esc(courant.table)}.</p>` : ""}
    <p class="statut err" id="e2-erreur" role="alert"></p>
    <div class="actions-menu"><button type="button" class="secondaire" data-menu="annuler">Annuler</button><button type="submit" class="primaire">Ajouter</button></div></form>`;
  placerMenu(menuCtx.ancre);
  const champ = $("e2-texte"); champ.focus();
  if (type.cle === "tableau") champ.addEventListener("input", () => { if (!$("e2-table").dataset.touche) $("e2-table").value = identifiant(champ.value, []); });
  if ($("e2-table-choix")) $("e2-table-choix").addEventListener("change", () => {
    const v = $("e2-table-choix").value, info = $("e2-table-info");
    $("e2-erreur").textContent = "";
    $("e2-bloc-nouvelle").hidden = v !== "__nouvelle__";
    info.hidden = v === "__nouvelle__";
    if (v !== "__nouvelle__") { const a = analyserTableLignes(v); info.innerHTML = a.html; info.classList.toggle("avert", !!a.erreur); }
    placerMenu(menuCtx.ancre);
  });
  if ($("e2-table")) $("e2-table").addEventListener("input", () => { $("e2-table").dataset.touche = "1"; });
  $("form-etape2").addEventListener("submit", async ev => {
    ev.preventDefault();
    const texte = champ.value.trim(); if (!texte) return;
    const btn = ev.submitter || m.querySelector("button[type=submit]"); btn.disabled = true;
    const existante = $("e2-table-choix") && $("e2-table-choix").value !== "__nouvelle__" ? $("e2-table-choix").value : null;
    try { await ajouterBloc(type, texte, $("e2-table") ? $("e2-table").value.trim() : "", existante); fermerMenu(); }
    catch (e) { $("e2-erreur").textContent = `Échec : ${e.message || e}`; btn.disabled = false; }
  });
}
async function creerColonne(table, libelle, type, opts, formule) {
  const existants = Object.keys(colonnesDe(table));
  const colId = identifiant(libelle, existants);
  const info = { type, label: libelle, isFormula: !!formule, untieColIdFromLabel: true };
  if (formule) info.formula = formule;
  if (opts && Object.keys(opts).length) info.widgetOptions = JSON.stringify(opts);
  const res = await actions([["AddColumn", table, colId, info]]);
  const rv = res && res.retValues && res.retValues[0];
  await lireMeta();
  meta = metaCourante();
  return (rv && rv.colId) || colId;
}
/* Pièces jointes et liens d'établissement : Grist n'accepte qu'un utilisateur à accès restreint (lien d'établissement)
   place dans une cellule un fichier envoyé dans la même session que lui ; le formulaire envoie les fichiers par l'API
   (autre session). La cellule Pièces jointes est donc une formule : elle reprend les numéros écrits par le formulaire
   dans la colonne d'envoi, en vérifiant pour chacun l'empreinte SHA-1 du contenu (fileIdent de Grist) : seul celui qui a
   le fichier en main peut le joindre, impossible d'afficher la pièce d'un autre établissement en devinant son numéro. */
const formulePiecesJointes = envoi => [
  `# Pièces jointes envoyées par le formulaire (colonne ${envoi} : « numéro:empreinte » de chaque fichier).`,
  "# Seuls les fichiers dont l'empreinte (SHA-1 du contenu) correspond sont retenus.",
  "ids = []",
  `for x in ($${envoi} or "").split():`,
  "  n, _, h = x.partition(':')",
  "  a = _grist_Attachments.lookupOne(id=int(n)) if n.isdigit() else None",
  "  if a and len(h) >= 40 and (a.fileIdent or '').startswith(h) and a.id not in ids:",
  "    ids.append(a.id)",
  "return ids"].join("\n");
// Copie des colonnes lue par les liens d'établissement (clé « schema » de Config) : à rafraîchir dès qu'une colonne
// publiée change de nature (sinon le formulaire ouvert par lien écrit encore dans l'ancienne colonne)
async function majCopieLiens() {
  try { const S = window.Socle, cfg = await S.lireConfig(), g = S.general(cfg); return await R.majSchemaPublic(await S.lireMeta(), cfg, g, await R.lireFormulairesPublies(g)); }
  catch (_) { return false; /* copie pour les liens : facultative */ }
}
// Question Pièces jointes déjà créée en colonne simple : passe en formule avec sa colonne d'envoi (pièces déjà jointes reprises)
async function adapterPiecesJointes(b) {
  const c = meta[b.colonne]; if (!c || c.formule || c.pjEnvoi || typeBase(c.type) !== "Attachments") return;
  if (!confirm(`Rendre la question « ${libelleQuestion(b.colonne)} » utilisable par les liens d'établissement ?\n\nUne colonne « ${c.libelle} (envoi) » est ajoutée ; la colonne des pièces jointes devient une formule qui la lit. Les pièces déjà jointes sont conservées.`)) return;
  try {
    const envoi = await creerColonne(courant.table, `${c.libelle} (envoi)`, "Text", null);
    const [t, att] = await Promise.all([grist.docApi.fetchTable(courant.table), grist.docApi.fetchTable("_grist_Attachments")]);
    const ident = new Map(att.id.map((id, i) => [id, String((att.fileIdent || [])[i] || "").replace(/\..*$/, "")]));
    const ids = [], vals = [];
    t.id.forEach((id, i) => { const v = t[b.colonne][i], l = Array.isArray(v) ? v.slice(1).filter(n => typeof n === "number") : [];
      if (l.length) { ids.push(id); vals.push(l.map(n => `${n}:${ident.get(n) || ""}`).join(" ")); } });
    const acts = [];
    if (ids.length) acts.push(["BulkUpdateRecord", courant.table, ids, { [envoi]: vals }]);
    acts.push(["ModifyColumn", courant.table, b.colonne, { isFormula: true, formula: formulePiecesJointes(envoi) }]);
    await actions(acts); await lireMeta(); meta = metaCourante(); dessinerApercu(); dessinerPanneau();
    await majCopieLiens();
    message(`Question « ${libelleQuestion(b.colonne)} » adaptée aux liens d'établissement (colonne ${envoi} ajoutée${ids.length ? `, ${ids.length} réponse(s) reprise(s)` : ""}). Les formulaires déjà ouverts doivent être rechargés.`, "ok");
  } catch (e) { message(`Adaptation refusée par Grist (${e.message || e}).`, "err"); }
}
async function ajouterBloc(type, texte, nomTable, tableExistante) {
  const ctx = menuCtx;
  const b = { id: nouvelId(), section: ctx.section };
  if (type.decor) { b.genre = type.decor; b.texte = texte; }
  else if (type.cle === "tableau" && tableExistante) {
    const a = analyserTableLignes(tableExistante);
    if (a.erreur) throw new Error(a.erreur);
    // colonnes de liaison manquantes : dossier (référence vers la table des réponses), identifiant et ordre des lignes
    const acts = [];
    if (!a.colDossier) acts.push(["AddColumn", tableExistante, "Dossier", { type: `Ref:${courant.table}`, isFormula: false, label: "Dossier" }]);
    if (!a.ligne) acts.push(["AddColumn", tableExistante, "Ligne_id", { type: "Text", isFormula: false }]);
    if (!a.ordre) acts.push(["AddColumn", tableExistante, "Ordre", { type: "Int", isFormula: false }]);
    if (acts.length) { await actions(acts); await lireMeta(); }
    // historique : une ligne par version (Version, Mouvement, Etat_actuel, Date_version)
    const hist = actionsHistoriqueTableau(tableExistante, a.colDossier || "Dossier");
    if (hist.length) { await actions(hist); await lireMeta(); acts.push(...hist); }
    b.genre = "question";
    b.colonne = await creerColonne(courant.table, texte, "Text", null);
    b.reglages = { libelle: texte, tableau: { table: tableExistante } };
    const r = await reprendreLignesExistantes(tableExistante, b.colonne, a.colDossier || "Dossier");
    setTimeout(() => message(`Question tableau créée sur la table ${tableExistante}${acts.length ? ` (colonne${acts.length > 1 ? "s" : ""} ajoutée${acts.length > 1 ? "s" : ""} : ${acts.map(x => x[2]).join(", ")})` : ""}.` +
      (r.lignes ? ` ${r.lignes} ligne${r.lignes > 1 ? "s" : ""} existante${r.lignes > 1 ? "s" : ""} reprise${r.lignes > 1 ? "s" : ""} dans ${r.dossiers} dossier${r.dossiers > 1 ? "s" : ""}.` : ""), "ok"), 0);
  }
  else if (type.cle === "tableau") {
    const nomT = identifiant(nomTable || texte, tables.concat(Object.keys(meta)));
    await actions([["AddTable", nomT, [{ id: "Dossier", type: `Ref:${courant.table}`, isFormula: false }, { id: "Ligne_id", type: "Text", isFormula: false }, { id: "Ordre", type: "Int", isFormula: false }]]]);
    await lireMeta();
    const hist = actionsHistoriqueTableau(nomT, "Dossier");   // historique : une ligne par version et par ligne saisie
    if (hist.length) { await actions(hist); await lireMeta(); }
    b.genre = "question";
    b.colonne = await creerColonne(courant.table, texte, "Text", null);
    b.reglages = { libelle: texte, tableau: { table: nomT } };
  } else if (type.cle === "pj") {
    // pièces jointes : colonne texte d'envoi (remplie par le formulaire) + colonne Pièces jointes en formule, qui ne
    // retient que les fichiers dont le formulaire prouve l'envoi (empreinte) : compatible avec les liens d'établissement
    b.genre = "question";
    const envoi = await creerColonne(courant.table, `${texte} (envoi)`, "Text", null);
    b.colonne = await creerColonne(courant.table, texte, "Attachments", null, formulePiecesJointes(envoi));
    b.reglages = { libelle: texte };
  } else {
    b.genre = "question";
    const opts = type.choix ? { choices: type.choix, choiceOptions: {} } : null;
    b.colonne = await creerColonne(courant.table, texte, type.type, opts);
    b.reglages = { libelle: texte, ...(type.reglages || {}) };
  }
  blocs().splice(Math.min(ctx.index, blocs().length), 0, b);
  choisi = b.id; sauver(); dessinerApercu(); dessinerPanneau();
  // question tableau : sa table reçoit tout de suite les règles d'accès du socle (une fois le brouillon enregistré)
  if (b.reglages && b.reglages.tableau && b.reglages.tableau.table) reglesApresTableau(b.reglages.tableau.table);
  const el = document.querySelector(`[data-bloc="${b.id}"]`); if (el) { el.scrollIntoView({ block: "center" }); }
  if (type.choix || type.cle === "tableau") { const p = $("panneau").querySelector(type.choix ? ".choix-edit input[type=text]" : "#sc-nouveau-lib"); if (p) p.focus(); }
  else { const p = $("pa-libelle"); if (p) p.focus(); }
}
// Donnée de la fiche établissement : colonne formule « $Etablissement.Colonne » dans la table des réponses
function etapeEtab() {
  const m = $("menu-ajout"), te = tableEtab(), cols = colonnesEtabProposees(te);
  const deja = new Set(blocs().filter(b => b.genre === "question" && meta[b.colonne]).map(b => sourceEtab(meta[b.colonne])).filter(Boolean));
  m.innerHTML = `<h4>Donnée de la fiche établissement</h4><form class="etape2" id="form-etape2">
    <label for="e2-col">Information de la fiche<span class="aide">Table ${esc(te)}, à laquelle renvoie la colonne Etablissement.</span></label>
    <select id="e2-col">${cols.map(c => `<option value="${esc(c.colId)}">${esc(c.libelle)}${c.libelle !== c.colId ? ` (${esc(c.colId)})` : ""}${deja.has(c.colId) ? " — déjà dans le formulaire" : ""}</option>`).join("")}</select>
    <label for="e2-texte">Intitulé affiché dans le formulaire</label><input type="text" id="e2-texte" required autocomplete="off">
    <p class="note" style="margin:0 0 6px">Une colonne formule <code>$${esc(colEtab())}.…</code> sera créée dans la table ${esc(courant.table)} : la valeur s'affiche dès que l'établissement est choisi, sans saisie, et peut entrer dans la description automatique.</p>
    <p class="statut err" id="e2-erreur" role="alert"></p>
    <div class="actions-menu"><button type="button" class="secondaire" data-menu="annuler">Annuler</button><button type="submit" class="primaire"${cols.length ? "" : " disabled"}>Ajouter</button></div></form>`;
  placerMenu(menuCtx.ancre);
  const sel = $("e2-col"), champ = $("e2-texte");
  const remplir = () => { if (!champ.dataset.touche) champ.value = (cols.find(c => c.colId === sel.value) || {}).libelle || ""; };
  remplir(); sel.focus();
  sel.addEventListener("change", remplir);
  champ.addEventListener("input", () => { champ.dataset.touche = "1"; });
  $("form-etape2").addEventListener("submit", async ev => {
    ev.preventDefault();
    const texte = champ.value.trim(); if (!texte || !sel.value) return;
    const btn = m.querySelector("button[type=submit]"); btn.disabled = true;
    try { await ajouterBlocEtab(sel.value, texte); fermerMenu(); }
    catch (e) { $("e2-erreur").textContent = `Échec : ${e.message || e}`; btn.disabled = false; }
  });
}
async function ajouterBlocEtab(src, texte) {
  const ctx = menuCtx, cs = colonnesDe(tableEtab())[src] || {};
  const opts = ["Choice", "ChoiceList"].includes(typeBase(cs.type)) ? cs.opts : null;
  const colId = await creerColonne(courant.table, texte, cs.type || "Any", opts, `$${colEtab()}.${src}`);
  const b = { id: nouvelId(), section: ctx.section, genre: "question", colonne: colId, reglages: { libelle: texte } };
  blocs().splice(Math.min(ctx.index, blocs().length), 0, b);
  choisi = b.id; sauver(); dessinerApercu(); dessinerPanneau();
  // question tableau : sa table reçoit tout de suite les règles d'accès du socle (une fois le brouillon enregistré)
  if (b.reglages && b.reglages.tableau && b.reglages.tableau.table) reglesApresTableau(b.reglages.tableau.table);
  const el = document.querySelector(`[data-bloc="${b.id}"]`); if (el) el.scrollIntoView({ block: "center" });
}
function etapeExistantes() {
  const m = $("menu-ajout");
  const pris = new Set(blocs().filter(b => b.genre === "question").map(b => b.colonne));
  const deRole = new Set(Object.values(rolesEffectifs()).filter(Boolean));
  const communs = { test: id => deRole.has(id) || /^(Etablissement|Description|Qualification|Date|Date_faits|Dossier|Nature|Commentaire|Auteur|Site|Clos)$/.test(id) };
  const libres = Object.values(meta).filter(c => !pris.has(c.colId) && c.colId !== "id" && !(communsActifs() && communs.test(c.colId))).sort((a, b) => a.pos - b.pos);
  m.innerHTML = `<h4>Colonnes existantes de ${esc(courant.table)}</h4>
    ${libres.length ? `<div class="liste-existantes">${libres.map(c => `<label><input type="checkbox" value="${esc(c.colId)}"${communs.test(c.colId) || c.formule ? "" : ""}> ${esc(c.libelle)} <small>${esc(typeBase(c.type))}${c.formule ? ", formule" : ""}${communs.test(c.colId) ? ", champ commun" : ""}</small></label>`).join("")}</div>
    <p class="note" style="margin:0 0 6px">Les repères déjà écrits dans leur description ([si …], *, [couleur]…) sont repris dans les réglages.</p>` : `<p class="note">Toutes les colonnes sont déjà dans le formulaire.</p>`}
    <div class="actions-menu"><button type="button" class="secondaire" data-menu="annuler">Annuler</button>${libres.length ? `<button type="button" class="primaire" id="btn-ajout-existantes">Ajouter</button>` : ""}</div>`;
  placerMenu(menuCtx.ancre);
  const b = $("btn-ajout-existantes");
  if (b) b.addEventListener("click", () => {
    const ids = [...m.querySelectorAll("input:checked")].map(x => x.value);
    ajouterExistantes(ids, menuCtx.section, menuCtx.index);
    fermerMenu();
  });
}
function blocDepuisColonne(c, section) {
  const r = lireReperes(c.description);
  return { id: nouvelId(), genre: "question", section, colonne: c.colId, reglages: { libelle: c.libelle, ...r } };
}
function ajouterExistantes(ids, section, index) {
  const nouveaux = ids.map(id => meta[id]).filter(Boolean).map(c => blocDepuisColonne(c, section));
  blocs().splice(Math.min(index, blocs().length), 0, ...nouveaux);
  if (nouveaux[0]) choisi = nouveaux[0].id;
  sauver(); dessinerApercu(); dessinerPanneau();
}

/* =========================================================
   Panneau de réglages
   ========================================================= */
// Panneau de droite ; quand un élément est choisi, un lien ramène aux réglages du formulaire
function dessinerPanneau() {
  dessinerPanneauBase();
  if (modeTest || !courant || !choisi) return;
  const p = $("panneau");
  if (!p.firstElementChild || p.querySelector("#pn-retour")) return;
  p.insertAdjacentHTML("afterbegin", `<button type="button" class="lien-retour" id="pn-retour">← Réglages du formulaire</button>`);
  $("pn-retour").addEventListener("click", () => choisir(null));
}
// Échap : retour aux réglages du formulaire (sauf dans un champ de saisie ou un menu ouvert)
document.addEventListener("keydown", ev => {
  if (ev.key !== "Escape" || !choisi || modeTest || $("formulaires").hidden || !$("menu-ajout").hidden) return;
  if (ev.target.closest && ev.target.closest("input, select, textarea, dialog")) return;
  choisir(null);
});
function dessinerPanneauBase() {
  const p = $("panneau");
  if (modeTest) return dessinerPanneauTest();
  const b = blocDe(choisi);
  if (!courant) { p.innerHTML = ""; return; }
  if (String(choisi).startsWith("partie:")) return panneauPartie(partieDe(choisi.slice(7)));
  if (String(choisi).startsWith("commun:")) return panneauCommun(choisi.slice(7));
  if (!b) {
    p.innerHTML = `<h2>${esc(courant.nom)}</h2><p class="sous">table ${esc(courant.table)}${courant.publieLe ? ` · publié le ${new Date(courant.publieLe * 1000).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}` : " · jamais publié"}</p>
      <div class="vide-panneau"><p>Cliquez sur une question de l'aperçu pour la régler.</p><ul>
        <li>« + Ajouter une question » apparaît au survol, entre deux blocs.</li>
        <li>Glissez un bloc par sa poignée ⋮⋮ pour le déplacer (ou Alt + ↑ / ↓ au clavier).</li>
        <li>Les modifications sont enregistrées en brouillon : les formulaires des pages ne changent qu'au clic sur « Publier ».</li></ul></div>
      <div class="groupe"><div class="t">Formulaire</div><label class="l" for="pf-nom">Nom</label><input type="text" id="pf-nom" value="${esc(courant.nom)}">
      <button type="button" class="danger" id="pf-supprimer">Supprimer ce formulaire…</button></div>${groupeVersionHtml()}${groupePageHtml()}${groupeColonnesHtml()}`;
    lierVersion(p);
    lierPages(p);
    p.querySelectorAll("[data-ajout-col]").forEach(x => x.addEventListener("click", () => ajouterColonneService(x.dataset.ajoutCol)));
    lierRoles(p);
    $("pf-nom").addEventListener("change", async () => {
      const v = $("pf-nom").value.trim(); if (!v) return;
      try { await actions([["UpdateRecord", TABLE_FORMULAIRES, courant.id, { Nom: v }]]); courant.nom = v; const f = formulaires.find(x => x.id === courant.id); if (f) f.nom = v; remplirChoixFormulaire(); message("Nom enregistré. Les pages qui avaient choisi ce formulaire par son nom devront le choisir à nouveau.", "ok"); }
      catch (e) { message(`Nom non enregistré : ${e.message || e}`, "err"); }
    });
    $("pf-supprimer").addEventListener("click", supprimerFormulaire);
    return;
  }
  if (b.genre !== "question") return panneauDecor(b);
  const c = meta[b.colonne], r = b.reglages = b.reglages || {};
  if (c && c.formule) return panneauFormule(b, c);
  if (!c) { p.innerHTML = `<h2>Colonne absente</h2><p class="avert">La colonne « ${esc(b.colonne)} » n'existe plus dans la table.</p><div class="pied-panneau"><button type="button" class="danger" id="pa-retirer">Retirer du formulaire</button></div>`; $("pa-retirer").addEventListener("click", () => retirerBloc(b)); return; }
  const t = typeBase(c.type);
  const choixPossibles = (t === "Choice" || t === "ChoiceList") && !r.tableau;
  const nombre = t === "Int" || t === "Numeric";
  p.innerHTML = `<h2>${esc(r.libelle || c.libelle)}</h2><p class="sous">${esc(typeAffiche(b))} · <span id="pa-nb-rep">…</span></p>
    <label class="l" for="pa-libelle">Libellé</label><input type="text" id="pa-libelle" value="${esc(r.libelle || c.libelle)}">
    <label class="l" for="pa-aide">Aide affichée sous la question</label><textarea id="pa-aide">${esc(r.aide || "")}</textarea>
    <span class="ident" title="Identifiant de la colonne dans Grist, fixé à la création">colonne : ${esc(c.colId)}</span>
    <label class="l" for="pa-section" style="margin-top:8px">Partie du formulaire</label>
    <select id="pa-section">${optionsParties(b.section)}</select>

    <div class="groupe"><div class="t">Saisie</div>
      ${!r.tableau ? `<label class="interrupteur">Réponse obligatoire <input type="checkbox" id="pa-oblig"${r.obligatoire ? " checked" : ""}></label>` : `<label class="interrupteur">Au moins une ligne obligatoire <input type="checkbox" id="pa-oblig"${r.obligatoire ? " checked" : ""}></label>`}
      ${t === "Text" && !r.tableau ? `<label class="l">Zone de saisie</label><div class="seg2" role="group"><button type="button" data-court="1" aria-pressed="${!!r.court}">Une ligne</button><button type="button" data-court="0" aria-pressed="${!r.court}">Plusieurs lignes</button></div>` : ""}
      ${nombre ? `<label class="l">Type de nombre</label><div class="seg2" role="group"><button type="button" data-num="Int" aria-pressed="${t === "Int"}">Entier</button><button type="button" data-num="Numeric" aria-pressed="${t === "Numeric"}">Décimal</button></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div><label class="l" for="pa-min">Minimum</label><input type="number" id="pa-min" value="${r.min ?? ""}" placeholder="aucun"></div><div><label class="l" for="pa-max">Maximum</label><input type="number" id="pa-max" value="${r.max ?? ""}" placeholder="aucun"></div></div>` : ""}
      ${t === "Choice" ? `<label class="l" for="pa-affichage">Affichage</label><select id="pa-affichage"><option value="">Automatique (boutons jusqu'à 5 choix)</option><option value="boutons"${r.affichage === "boutons" ? " selected" : ""}>Boutons</option><option value="liste"${r.affichage === "liste" ? " selected" : ""}>Liste déroulante</option></select>` : ""}
      ${t === "Bool" ? `<label class="l" for="pa-affichage">Affichage</label><select id="pa-affichage"><option value="">Boutons Oui / Non</option><option value="case"${r.affichage === "case" ? " selected" : ""}>Case à cocher</option></select>` : ""}
    </div>
    ${choixPossibles ? `<div class="groupe"><div class="t">Choix proposés</div><div id="pa-choix"></div><button type="button" class="ajout-lien" id="pa-ajout-choix">+ Ajouter un choix</button>
      <p class="note" style="margin:6px 0 0">Les choix et leurs couleurs sont enregistrés tout de suite dans la colonne Grist. Renommer un choix met à jour les réponses déjà saisies.</p></div>` : ""}
    ${r.tableau ? `<div class="groupe"><div class="t">Table des lignes</div>
      <div class="ligne-sc"><input type="text" id="pa-table-nom" value="${esc(r.tableau.table)}" aria-label="Nom de la table des lignes" style="flex:1">
        <button type="button" class="secondaire petit" id="pa-table-renommer">Renommer la table</button></div>
      <p class="note" style="margin:4px 0 0">Renomme la table dans Grist (lignes, références et formules suivent) et dans tous les formulaires qui l'utilisent, brouillons et versions publiées.</p></div>
      <div class="groupe"><div class="t">Champs de chaque ligne (table ${esc(r.tableau.table)})</div><div id="pa-sous"></div>
      <div class="sous-col"><div class="ligne-sc"><input type="text" id="sc-nouveau-lib" placeholder="Nouveau champ (ex. Fonction)"><select id="sc-nouveau-type" style="width:auto;margin:0">
        <option value="Choice">Choix unique</option><option value="ChoiceList">Choix multiple</option><option value="Text">Texte</option><option value="Int">Nombre</option><option value="Bool">Oui / Non</option><option value="Date">Date</option></select>
        <button type="button" class="secondaire petit" id="sc-ajouter">Ajouter</button></div></div>
      <label class="l" for="pa-lignes">Nombre de lignes fixé par</label><select id="pa-lignes"><option value="">— (lignes ajoutées à la main)</option>${
        blocs().filter(x => x.genre === "question" && meta[x.colonne] && ["Int", "Numeric"].includes(typeBase(meta[x.colonne].type))).map(x => `<option value="${esc(x.colonne)}"${r.tableau.lignes === x.colonne ? " selected" : ""}>${esc(libelleQuestion(x.colonne))}</option>`).join("")}</select></div>` : ""}

    ${r.tableau ? groupeSitesHtml(b) : ""}
    ${t === "Attachments" ? `<div class="groupe"><div class="t">Pièces jointes</div>${c && c.pjEnvoi
      ? `<p class="note" style="margin:0">Utilisable par tous, liens d'établissement compris : le formulaire écrit dans la colonne « ${esc((meta[c.pjEnvoi] || {}).libelle || c.pjEnvoi)} » et ne sont retenus que les fichiers qu'il a envoyés (empreinte vérifiée).</p>`
      : `<p class="note" style="margin:0 0 6px">Les liens d'établissement ne peuvent pas joindre de fichier à cette question (Grist : « cannot access attachment »).</p><button type="button" class="secondaire petit" id="pa-pj-adapter">Rendre utilisable par les liens d'établissement</button>`}</div>` : ""}
    <div class="groupe"><div class="t">Affichage conditionnel</div><div id="pa-condition"></div></div>
    ${!r.tableau && t !== "Text" && t !== "Ref" && t !== "RefList" && t !== "Attachments" ? `<div class="groupe"><div class="t">Couleur du formulaire</div><div id="pa-couleur"></div></div>` : ""}
    <div class="groupe"><div class="t">Données et diffusion</div>
      <label class="interrupteur">Confidentiel (exclu de la description automatique) <input type="checkbox" id="pa-conf"${r.confidentiel ? " checked" : ""}></label>
      <label class="l" for="pa-format">Dans la description automatique</label>
      <select id="pa-format">${choixFormatQuestion(b).map(([v, l]) => `<option value="${v}"${(r.format || "defaut") === v ? " selected" : ""}>${l}</option>`).join("")}</select>
    </div>
    <div class="pied-panneau"><button type="button" class="danger" id="pa-retirer">Retirer du formulaire</button><button type="button" class="danger" id="pa-supprimer" disabled>Supprimer la colonne…</button></div>`;
  // champs simples
  const lier = (id, ev, f) => { const el = $(id); if (el) el.addEventListener(ev, f); };
  lier("pa-libelle", "input", e => { r.libelle = e.target.value; p.querySelector("h2").textContent = e.target.value || c.libelle; majBloc(b); sauver(); });
  lier("pa-aide", "input", e => { r.aide = e.target.value.trim(); majBloc(b); sauver(); });
  lier("pa-section", "change", e => { deplacer(b.id, blocs().length, e.target.value); choisir(b.id); });
  lier("pa-oblig", "change", e => { r.obligatoire = e.target.checked; majBloc(b); sauver(); });
  lier("pa-conf", "change", e => { r.confidentiel = e.target.checked; majBloc(b); sauver(); });
  lier("pa-format", "change", e => { r.format = e.target.value === "defaut" ? undefined : e.target.value; sauver(); });
  lier("pa-affichage", "change", e => { r.affichage = e.target.value || undefined; majBloc(b); sauver(); });
  lier("pa-min", "input", e => { r.min = e.target.value === "" ? undefined : parseFloat(e.target.value); sauver(); });
  lier("pa-max", "input", e => { r.max = e.target.value === "" ? undefined : parseFloat(e.target.value); sauver(); });
  lier("pa-lignes", "change", e => { r.tableau.lignes = e.target.value || null; majBloc(b); sauver(); });
  lier("pa-table-renommer", "click", () => renommerTableTableau(b, $("pa-table-nom").value));
  lier("pa-pj-adapter", "click", () => adapterPiecesJointes(b));
  lier("pa-table-nom", "keydown", e => { if (e.key === "Enter") { e.preventDefault(); renommerTableTableau(b, e.target.value); } });
  p.querySelectorAll("[data-court]").forEach(x => x.addEventListener("click", () => { r.court = x.dataset.court === "1"; dessinerPanneau(); majBloc(b); sauver(); }));
  p.querySelectorAll("[data-num]").forEach(x => x.addEventListener("click", () => changerTypeNombre(b, x.dataset.num)));
  lier("pa-retirer", "click", () => retirerBloc(b));
  lier("pa-supprimer", "click", () => supprimerColonne(b));
  if (choixPossibles) dessinerChoix(b);
  if (r.tableau) { dessinerSousColonnes(b); lierSites(b); }
  dessinerCondition(b);
  if ($("pa-couleur")) dessinerCouleur(b);
  compterReponses(b);
}
/* ---------- Tableau des sites (formulaire par site, enseignement supérieur) ----------
   reglages.tableau.sites = { site, libre, qualif, historique: [{ colonne, libre, site, qualif }], alias, avecRas, reprise } :
   une ligne par site ; reprise du dernier état connu de chaque site (reprise : "non" par défaut, "bouton" ou "auto") ; qualification de l'établissement déduite du
   site le plus grave (conf.saisie.qualificationEnBas). Voir le widget de saisie. */
// reprise du dernier état des sites : "auto" (ancien réglage true), "bouton" (à la demande), "non" (par défaut)
const modeReprise = st => st && (st.reprise === true || st.reprise === "auto") ? "auto" : st && st.reprise === "bouton" ? "bouton" : "non";
function groupeSitesHtml(b) {
  const r = b.reglages, st = r.tableau.sites, cols = Object.values(colonnesDe(r.tableau.table)).filter(c => !c.formule && !RESERVES_TABLEAU.includes(c.colId) && c.type !== `Ref:${courant.table}`);
  const opt = (filtre, sel) => `<option value="">—</option>${cols.filter(filtre).map(c => `<option value="${esc(c.colId)}"${sel === c.colId ? " selected" : ""}>${esc(c.libelle)}</option>`).join("")}`;
  const h = (st && st.historique && st.historique[0]) || {};
  const autres = Object.values(meta).filter(c => /^Text/.test(c.type) && c.colId !== b.colonne && !blocs().some(x => x.colonne === c.colId && x.id === b.id));
  return `<div class="groupe"><div class="t">Tableau des sites</div>
    <label class="interrupteur">Une ligne par site (formulaire par site) <input type="checkbox" id="pa-sites"${st ? " checked" : ""}></label>
    ${st && (!st.site || !/^Ref:/.test((colonnesDe(r.tableau.table)[st.site] || {}).type || "")) ? (() => { const rs = referentielSitesDuFormulaire(); return rs
      ? `<p class="note" style="margin:6px 0">Ce tableau n'a pas de colonne qui renvoie vers le référentiel des sites : les sites ne sont reconnus que par leur nom saisi. <button type="button" class="secondaire petit" id="pa-site-relier">Relier au référentiel des sites</button><br><span class="aide">Ajoute à ${esc(r.tableau.table)} une colonne « Site » (liste des sites de l'établissement, table ${esc(rs)}) ; la colonne de texte reste pour les sites hors référentiel. Les noms déjà saisis se rattachent ensuite dans l'onglet Référentiel (« Compléter les saisies »).</span></p>`
      : `<p class="note" style="margin:6px 0">Aucun référentiel des sites dans le document : importez le classeur du référentiel ESR (onglet Référentiel) pour proposer la liste des sites de chaque établissement.</p>`; })() : ""}
    ${st && st.site && /^Ref:/.test((colonnesDe(r.tableau.table)[st.site] || {}).type || "") && !st.libre
      ? `<p class="note" style="margin:6px 0">Les agents ne peuvent choisir qu'un site de la liste. <button type="button" class="secondaire petit" id="pa-site-libre-creer">Accepter les noms hors référentiel</button><br><span class="aide">Ajoute à ${esc(r.tableau.table)} une colonne « Site hors référentiel » : dans le formulaire, le champ du site propose la liste (recherche par nom et par mots-clés) et accepte un nom tapé librement.</span></p>` : ""}
    ${st ? `<label class="l" for="pa-site-ref">Site (référentiel des sites)</label><select id="pa-site-ref">${opt(c => /^(Ref|Text)/.test(c.type), st.site)}</select>
      <label class="l" for="pa-site-libre">Site hors référentiel (texte libre)</label><select id="pa-site-libre">${opt(c => /^Text/.test(c.type), st.libre)}</select>
      <label class="l" for="pa-site-qualif">Qualification du site</label><select id="pa-site-qualif">${opt(c => /^Choice/.test(c.type), st.qualif)}</select>
      <label class="l" for="pa-site-hist">Reprendre aussi l'historique de la question</label><select id="pa-site-hist"><option value="">— (aucune)</option>${autres.map(c => `<option value="${esc(c.colId)}"${h.colonne === c.colId ? " selected" : ""}>${esc(libelleQuestion(c.colId))}</option>`).join("")}</select>
      ${h.colonne ? `<div class="ligne-sc"><input type="text" id="pa-site-hist-libre" value="${esc(h.libre || "")}" placeholder="champ du nom (ex. Nom_du_site)" style="flex:1"><input type="text" id="pa-site-hist-qualif" value="${esc(h.qualif || "")}" placeholder="champ de qualification" style="flex:1"></div>` : ""}
      <label class="l" for="pa-site-alias">Table des correspondances (libellé saisi → site)</label><input type="text" id="pa-site-alias" value="${esc(st.alias || "Sites_correspondances")}">
      <label class="l" for="pa-site-reprise">Nouveau dossier : reprise du dernier état des sites déjà signalés pour l'établissement</label>
      <select id="pa-site-reprise">${[["non", "désactivée : le tableau part vide"], ["bouton", "à la demande : bouton « Reprendre leur dernier état »"], ["auto", "automatique : une ligne par site connu dès l'établissement choisi"]].map(([v, l]) => `<option value="${v}"${modeReprise(st) === v ? " selected" : ""}>${l}</option>`).join("")}</select>
      ${modeReprise(st) !== "non" ? `<label class="interrupteur">Reprise : une ligne par site connu, y compris ceux revenus à la normale <input type="checkbox" id="pa-site-ras"${st.avecRas !== false ? " checked" : ""}></label>` : ""}
      <label class="interrupteur">Qualification de l'établissement en bas, déduite du site le plus grave <input type="checkbox" id="pa-qualif-bas"${confSaisie().qualificationEnBas !== false ? " checked" : ""}></label>
      ${controleSitesHtml(b)}
      <p class="note" style="margin:6px 0 0">${modeReprise(st) === "non" ? "Nouveau dossier : le tableau des sites part vide, l'agent saisit les sites concernés ce jour-là (la reprise d'un signalement précédent ne reprend pas les sites)."
        : modeReprise(st) === "auto" ? "Nouveau dossier : dès l'établissement choisi, le tableau se remplit d'une ligne par site déjà signalé, à son dernier état (toutes les versions précédentes de l'établissement et la question d'historique choisie) ; l'agent confirme ou modifie chaque site encore perturbé et ajoute les nouveaux."
        : "Nouveau dossier : le tableau des sites part vide ; si l'établissement a déjà des sites signalés, un bouton « Reprendre leur dernier état » le remplit à la demande (toutes les versions précédentes de l'établissement et la question d'historique choisie)."} La qualification de l'établissement suit le site le plus grave (ordre des choix de Qualification, du plus grave au moins grave) ; une incohérence est signalée avant l'enregistrement.</p>` : ""}
  </div>`;
}
/* Contrôle du paramétrage du tableau des sites : chaque point attendu, vérifié sur la structure du document.
   Le widget de saisie filtre les sites par établissement quand la colonne du site renvoie vers une table des sites
   dont une colonne renvoie vers le référentiel des établissements visé par la colonne Établissement du formulaire. */
function controleSitesHtml(b) {
  const r = b.reglages, st = r.tableau.sites, t = r.tableau.table, cols = colonnesDe(t), etab = tableEtab() || referentielDe(courant.table);
  const verifs = [], ok = (etat, txt) => verifs.push({ etat, txt });
  const versEtab = tid => Object.values(colonnesDe(tid) || {}).filter(c => /^Ref:/.test(c.type) && c.type !== `Ref:${courant.table}`).map(c => window.Socle.cibleRef(c.type));
  ok(etab ? "ok" : "err", etab ? `Établissement du formulaire : référentiel « ${etab} » (colonne Établissement de ${courant.table}).` : `La colonne Établissement de ${courant.table} n'est pas une référence vers un référentiel des établissements.`);
  ok(Object.keys(cols).length ? "ok" : "err", Object.keys(cols).length ? `Sous-table « ${t} »${cols.Dossier ? "" : " — colonne Dossier absente"}.` : `Sous-table « ${t} » introuvable.`);
  const cs = st.site && cols[st.site], cible = cs && window.Socle.cibleRef(cs.type);
  if (!cs) ok("err", "Aucune colonne du site choisie (« Site (référentiel des sites) »).");
  else if (!cible) ok("err", `Colonne du site « ${cs.libelle} » : colonne de texte, sans liste de sites. Utilisez « Relier au référentiel des sites ».`);
  else if (!colonnesDe(cible) || !Object.keys(colonnesDe(cible)).length) ok("err", `Colonne du site « ${cs.libelle} » : elle renvoie vers « ${cible} », table introuvable.`);
  else if (etab && !versEtab(cible).includes(etab)) ok("err", `Colonne du site « ${cs.libelle} » : elle renvoie vers « ${cible} », dont aucune colonne ne renvoie vers « ${etab} »${versEtab(cible).length ? ` (elle renvoie vers « ${versEtab(cible).join(" », « ")} »)` : ""} : les sites ne peuvent pas être filtrés par établissement, le formulaire les propose tous. Réimportez le classeur ESR vers « ${etab} », ou changez la référence de la colonne Etablissement de « ${cible} » dans Grist.`);
  else ok("ok", `Colonne du site « ${cs.libelle} » → table « ${cible} », reliée à « ${etab} » : seuls les sites de l'établissement sont proposés, avec recherche par nom, mot-clé et commune.`);
  const cl = st.libre && cols[st.libre];
  ok(cl && /^Text/.test(cl.type) ? "ok" : "warn", cl && /^Text/.test(cl.type) ? `Site hors référentiel : « ${cl.libelle} » (un nom absent de la liste est accepté, dans le même champ).` : "Pas de colonne hors référentiel : seuls les sites de la liste sont acceptés (bouton « Accepter les noms hors référentiel »).");
  const cq = st.qualif && cols[st.qualif];
  ok(cq && /^Choice/.test(cq.type) ? "ok" : "err", cq && /^Choice/.test(cq.type) ? `Qualification du site : « ${cq.libelle} » (${((cq.opts || {}).choices || []).join(", ") || "choix à définir"}).` : "Aucune colonne de qualification du site (type Choix).");
  const doubles = Object.values(cols).filter(c => c.colId !== st.site && /^Ref:/.test(c.type) && window.Socle.cibleRef(c.type) !== courant.table && etab && versEtab(window.Socle.cibleRef(c.type)).includes(etab));
  if (doubles.length) ok("warn", `Colonne${doubles.length > 1 ? "s" : ""} ${doubles.map(c => c.libelle !== c.colId ? `« ${c.libelle} » (${c.colId})` : `« ${c.colId} »`).join(", ")} : elle désigne aussi un site, en double ; le formulaire l'écarte. Supprimez-la dans Grist si elle ne sert pas.`);
  const d = differences();
  ok(!courant.publie ? "err" : d ? "warn" : "ok", !courant.publie ? "Formulaire jamais publié : cliquez sur « Publier »." : d ? `${d} modification${d > 1 ? "s" : ""} non publiée${d > 1 ? "s" : ""} : cliquez sur « Publier » pour que le formulaire en tienne compte.` : "Formulaire publié, à jour.");
  const ic = { ok: "✓", warn: "!", err: "✗" }, coul = { ok: "var(--ok, #18753c)", warn: "var(--warn, #b34000)", err: "var(--err, #b42318)" };
  return `<div class="controle-sites" style="margin:8px 0;padding:6px 8px;border:1px solid var(--trait, #ddd);border-radius:4px"><div style="font-weight:600;margin-bottom:4px">Contrôle du paramétrage</div>
    <ul style="list-style:none;margin:0;padding:0;font-size:12px">${verifs.map(v => `<li style="margin:3px 0;display:flex;gap:6px"><span style="color:${coul[v.etat]};font-weight:700;min-width:12px" aria-label="${v.etat === "ok" ? "correct" : v.etat === "warn" ? "à vérifier" : "à corriger"}">${ic[v.etat]}</span><span>${esc(v.txt)}</span></li>`).join("")}</ul></div>`;
}
// Référentiel des sites du formulaire : table « …site… » qui renvoie vers le référentiel des établissements (import ESR, modèle par site)
function referentielSitesDuFormulaire() {
  const etab = tableEtab() || referentielDe(courant.table); if (!etab) return null;
  return metaTables[0].tableId.find(t => /site/i.test(t) && !/signal|correspond/i.test(t) && Object.values(colonnesDe(t)).some(c => c.type === `Ref:${etab}`)
    && !Object.values(colonnesDe(t)).some(c => c.type === `Ref:${courant.table}`)) || null;
}
function lierSites(b) {
  const r = b.reglages, maj = () => { majBloc(b); sauver(); };
  const lib = $("pa-site-libre-creer");
  if (lib) lib.addEventListener("click", async () => {
    const t = r.tableau.table; if (!r.tableau.sites) return;
    lib.disabled = true;
    try {
      const id = identifiant("Site_libre", Object.keys(colonnesDe(t)));
      await actions([["AddColumn", t, id, { type: "Text", isFormula: false, label: "Site hors référentiel", untieColIdFromLabel: true }]]);
      await lireMeta();
      r.tableau.sites.libre = id; maj(); dessinerPanneau();
      message(`Colonne « ${id} » ajoutée à ${t} : le champ du site accepte maintenant un nom hors référentiel. Publiez le formulaire.`, "ok");
      reglesApresTableau(t);
    } catch (e) { lib.disabled = false; message(`Échec : ${e.message || e}`, "err"); }
  });
  const rel = $("pa-site-relier");
  if (rel) rel.addEventListener("click", async () => {
    const rs = referentielSitesDuFormulaire(), t = r.tableau.table; if (!rs || !r.tableau.sites) return;
    rel.disabled = true;
    try {
      const id = identifiant("Site", Object.keys(colonnesDe(t)));
      await actions([["AddColumn", t, id, { type: `Ref:${rs}`, isFormula: false, label: "Site", untieColIdFromLabel: true }]]);
      await lireMeta();
      const avant = r.tableau.sites.site;   // ancienne colonne du site en texte : devient la colonne « hors référentiel »
      if (avant && !r.tableau.sites.libre) r.tableau.sites.libre = avant;
      r.tableau.sites.site = id; maj(); dessinerPanneau();
      message(`Colonne « ${id} » ajoutée à ${t} (référence vers ${rs}). Publiez le formulaire pour proposer la liste des sites.`, "ok");
      reglesApresTableau(t);
    } catch (e) { rel.disabled = false; message(`Échec : ${e.message || e}`, "err"); }
  });
  const deviner = () => { const cols = Object.values(colonnesDe(r.tableau.table)), t = (re, f) => (cols.find(c => f(c) && re.test(c.colId)) || cols.find(f) || {}).colId || null;
    return { site: t(/site/i, c => /^Ref:/.test(c.type) && c.type !== `Ref:${courant.table}` && c.colId !== "Version"), libre: t(/libre|nom/i, c => /^Text/.test(c.type) && !RESERVES_TABLEAU.includes(c.colId)), qualif: t(/qualif/i, c => /^Choice/.test(c.type)), historique: [], alias: "Sites_correspondances" }; };
  const sw = $("pa-sites"); if (sw) sw.addEventListener("change", () => { if (sw.checked) r.tableau.sites = deviner(); else delete r.tableau.sites; maj(); dessinerPanneau(); });
  const st = r.tableau.sites; if (!st) return;
  [["pa-site-ref", "site"], ["pa-site-libre", "libre"], ["pa-site-qualif", "qualif"]].forEach(([id, k]) => { const e = $(id); if (e) e.addEventListener("change", () => { st[k] = e.value || null; maj(); }); });
  const hi = $("pa-site-hist"); if (hi) hi.addEventListener("change", () => { st.historique = hi.value ? [{ colonne: hi.value, libre: "Nom_du_site", qualif: "Qualification" }] : []; maj(); dessinerPanneau(); });
  [["pa-site-hist-libre", "libre"], ["pa-site-hist-qualif", "qualif"]].forEach(([id, k]) => { const e = $(id); if (e) e.addEventListener("input", () => { if (st.historique[0]) st.historique[0][k] = e.value.trim(); sauver(); }); });
  const al = $("pa-site-alias"); if (al) al.addEventListener("input", () => { st.alias = al.value.trim() || "Sites_correspondances"; sauver(); });
  const rp = $("pa-site-reprise"); if (rp) rp.addEventListener("change", () => { st.reprise = rp.value; maj(); dessinerPanneau(); });
  const ras = $("pa-site-ras"); if (ras) ras.addEventListener("change", () => { st.avecRas = ras.checked; maj(); });
  const qb = $("pa-qualif-bas"); if (qb) qb.addEventListener("change", () => { majSaisie(c => { c.qualificationEnBas = qb.checked; }); dessinerApercu(); });
}
const optionsParties = sel => parties().map(x => `<option value="${esc(x.id)}"${(sel || "q") === x.id ? " selected" : ""}>${esc(x.nom)}${x.role === "q" ? "" : " (visa)"}</option>`).join("");
function ajouterPartie() {
  const nom = prompt("Nom de la nouvelle partie :", "Nouvelle partie"); if (!nom || !nom.trim()) return;
  const l = courant.conf.parties || (courant.conf.parties = copie(PARTIES_DEFAUT));
  const p = { id: "p" + Date.now().toString(36), nom: nom.trim(), role: "q", titre: true };
  const dernQ = l.map(x => x.role).lastIndexOf("q");
  l.splice(dernQ + 1, 0, p);
  choisi = `partie:${p.id}`; sauver(); dessinerApercu(); dessinerPanneau();
}
function panneauPartie(pt) {
  const p = $("panneau"), qs = parties().filter(x => x.role === "q"), k = qs.indexOf(pt);
  const n = blocs().filter(b => (b.section || "q") === pt.id).length;
  p.innerHTML = `<h2>Partie : ${esc(pt.nom)}</h2><p class="sous">${esc(ROLES[pt.role])} · ${n} bloc${n > 1 ? "s" : ""}</p>
    <label class="l" for="pp-nom">Nom</label><input type="text" id="pp-nom" value="${esc(pt.nom)}">
    ${pt.role === "q" ? `<label class="interrupteur">Afficher le nom en titre dans le formulaire <input type="checkbox" id="pp-titre"${pt.titre ? " checked" : ""}></label>
      <div style="display:flex;gap:8px;margin-top:8px"><button type="button" class="secondaire petit" id="pp-haut"${k <= 0 ? " disabled" : ""}>↑ Monter</button><button type="button" class="secondaire petit" id="pp-bas"${k >= qs.length - 1 ? " disabled" : ""}>↓ Descendre</button></div>`
      : `<p class="note">Ce nom remplace « ${pt.role === "vd" ? "Échelon départemental" : "Échelon académique"} » dans l'onglet Visas du widget de saisie. Les questions de cette partie ne sont visibles que des échelons concernés.</p>`}
    <div class="pied-panneau">${pt.role === "q" && qs.length > 1 ? `<button type="button" class="danger" id="pp-suppr">Supprimer la partie…</button>` : "<span></span>"}</div>`;
  $("pp-nom").addEventListener("input", e => { pt.nom = e.target.value; p.querySelector("h2").textContent = `Partie : ${pt.nom}`; const h = document.querySelector(`[data-partie="${pt.id}"]`); if (h) h.firstChild.textContent = pt.nom + " "; sauver(); });
  const t = $("pp-titre"); if (t) t.addEventListener("change", e => { pt.titre = e.target.checked; sauver(); dessinerApercu(); });
  const bouger = d => { const l = courant.conf.parties, i = l.indexOf(pt), cible = l.indexOf(qs[k + d]); [l[i], l[cible]] = [l[cible], l[i]]; sauver(); dessinerApercu(); dessinerPanneau(); };
  if ($("pp-haut")) $("pp-haut").addEventListener("click", () => bouger(-1));
  if ($("pp-bas")) $("pp-bas").addEventListener("click", () => bouger(1));
  if ($("pp-suppr")) $("pp-suppr").addEventListener("click", () => {
    const dest = qs[k === 0 ? 1 : k - 1];
    if (n && !confirm(`Supprimer la partie « ${pt.nom} » ? Ses ${n} bloc(s) rejoindront la partie « ${dest.nom} ».`)) return;
    blocs().forEach(b => { if ((b.section || "q") === pt.id) b.section = dest.id; });
    courant.conf.parties = courant.conf.parties.filter(x => x !== pt);
    choisi = null; sauver(); dessinerApercu(); dessinerPanneau();
  });
}
function panneauCommun(colId) {
  const p = $("panneau"), c = meta[colId];
  if (colId === "Description") return panneauDescription();
  const textes = {
    Site: "Site, campus ou bâtiment concerné, en saisie libre et facultative. Il est repris dans l'en-tête de la description automatique et dans le repérage des doublons (même établissement, même site, même date des faits).",
    Etablissement: `Recherche de l'établissement par son nom ou son UAI (${courant.type === "etablissement" && saisieEff().annuaires.length ? "référentiel du document, puis annuaires en ligne cochés ci-dessous" : "référentiel du document"}), complétion automatique de ses informations, mail et lien d'accès. Le premier enregistrement crée le signalement ; les suivants en créent des mises à jour (versions).`,
    Date_faits: "Jour des faits signalés, aujourd'hui par défaut. Sert au classement des versions, au décompte des jours de mobilisation et au point de situation.",
    Description: "Rédigée automatiquement à partir des réponses ; son format se règle dans ⚙ Réglages du widget de saisie, et pour chaque question dans « Données et diffusion ».",
    Qualification: "Qualification du signalement, obligatoire. Ses choix et leurs couleurs se règlent ici.",
  };
  p.innerHTML = `<h2>${esc(c ? c.libelle : colId)}</h2><p class="sous">Champ commun du questionnaire établissement · colonne ${esc(colId)}</p><p class="note">${esc(textes[colId] || "")}</p>
    ${colId === "Qualification" && c ? `<div class="groupe"><div class="t">Choix proposés</div><div id="pa-choix"></div><button type="button" class="ajout-lien" id="pa-ajout-choix">+ Ajouter un choix</button></div>
      <div class="groupe"><div class="t">Couleur du formulaire</div><label class="interrupteur">Colorer le formulaire selon la qualification <input type="checkbox" id="pq-couleur"${/\[\s*couleurs?\b/i.test(c.description) ? " checked" : ""}></label>
      <p class="note" style="margin:0">Enregistré tout de suite dans la colonne (repère [couleur]). Donnez une couleur à chaque choix ci-dessus (carré de couleur).</p></div>` : ""}
    ${colId === "Etablissement" ? `<div class="groupe"><div class="t">Référentiel</div><p class="note" style="margin:0 0 8px">Table <b>${esc(tableEtab() || "?")}</b> (référence de la colonne Etablissement).</p>
      <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px"><select id="pc-ref" aria-label="Autre référentiel" style="margin:0">${tables.filter(t => t !== courant.table && t !== TABLE_FORMULAIRES).map(t => `<option value="${esc(t)}"${t === tableEtab() ? " selected" : ""}>${esc(t)}</option>`).join("")}</select>
        <button type="button" class="secondaire petit" id="pc-ref-ok">Changer</button></div><p class="note" id="pc-ref-info" style="margin:0 0 8px"></p>
      ${tableEtab() ? `<button type="button" class="secondaire petit" id="pc-ajout-etab">+ Afficher une donnée de la fiche…</button><p class="note" style="margin:6px 0 0">Effectif, région académique, tutelle… : affichée en lecture seule dès que l'établissement est choisi, et reprise dans la description si besoin.</p>` : ""}</div>
      ${groupesEtabHtml()}` : ""}`;
  if (colId === "Etablissement") lierEtab(p);
  if ($("pc-ref")) {
    const majInfo = async () => {
      const v = $("pc-ref").value, i = $("pc-ref-info");
      if (v === tableEtab()) { i.textContent = ""; $("pc-ref-ok").disabled = true; return; }
      i.textContent = "Vérification…"; const a = await analyserReferentiel(courant.table, v);
      if ($("pc-ref").value !== v) return;
      i.textContent = a.erreur || a.texte; i.classList.toggle("avert", !!a.erreur); $("pc-ref-ok").disabled = !!a.erreur;
    };
    $("pc-ref-ok").disabled = true;
    $("pc-ref").addEventListener("change", majInfo);
    $("pc-ref-ok").addEventListener("click", async () => {
      const a = await analyserReferentiel(courant.table, $("pc-ref").value);
      if (a.erreur) { $("pc-ref-info").textContent = a.erreur; return; }
      if (!confirm(`Rattacher le formulaire au référentiel « ${$("pc-ref").value} » ?\n${a.texte}`)) return;
      try { await appliquerReferentiel(courant.table, a); meta = metaCourante(); etabsTest = null; etabTest = null; colsEtabTest = {}; dessinerApercu(); dessinerPanneau(); message(`Référentiel des établissements : ${a.cible}.`, "ok"); }
      catch (e) { message(`Changement refusé : ${e.message || e}`, "err"); }
    });
  }
  if ($("pc-ajout-etab")) $("pc-ajout-etab").addEventListener("click", () => {
    const q = parties().find(x => x.role === "q"), premier = blocs().findIndex(x => (x.section || "q") === q.id);
    const ancre = document.querySelector(`[data-section-feuille="${q.id}"] [data-ajout]`) || $("pc-ajout-etab");
    ouvrirMenu(q.id, premier < 0 ? blocs().length : premier, ancre); etapeEtab();
  });
  if (colId === "Qualification" && c) {
    dessinerChoix({ id: "commun:Qualification", genre: "commun", colonne: "Qualification" });
    $("pq-couleur").addEventListener("change", async e => {
      const sans = c.description.replace(/\[\s*couleurs?\b[^\]]*\]\s*/ig, "").trim();
      try { await actions([["ModifyColumn", courant.table, meta.Qualification.colId, { description: e.target.checked ? `[couleur] ${sans}`.trim() : sans }]]); await lireMeta(); meta = metaCourante(); }
      catch (err) { message(`Réglage refusé : ${err.message || err}`, "err"); }
    });
  }
}
function panneauDecor(b) {
  const p = $("panneau");
  p.innerHTML = `<h2>${b.genre === "titre" ? "Titre de section" : "Texte d'information"}</h2><p class="sous">Bloc d'affichage, sans colonne ni réponse.</p>
    <label class="l" for="pd-texte">${b.genre === "titre" ? "Titre" : "Texte"}</label>
    ${b.genre === "titre" ? `<input type="text" id="pd-texte" value="${esc(b.texte || "")}">` : `<textarea id="pd-texte" style="min-height:110px">${esc(b.texte || "")}</textarea>`}
    <label class="l" for="pd-section">Partie du formulaire</label>
    <select id="pd-section">${optionsParties(b.section)}</select>
    <div class="pied-panneau"><button type="button" class="danger" id="pd-retirer">Retirer du formulaire</button></div>`;
  $("pd-texte").addEventListener("input", e => { b.texte = e.target.value; majBloc(b); sauver(); });
  $("pd-section").addEventListener("change", e => { deplacer(b.id, blocs().length, e.target.value); choisir(b.id); });
  $("pd-retirer").addEventListener("click", () => retirerBloc(b));
}
function majBloc(b) {   // redessine un seul bloc de l'aperçu (sans perdre la saisie du panneau)
  const el = document.querySelector(`[data-bloc="${b.id}"]`);
  if (!el) return;
  const tmp = document.createElement("div"); tmp.innerHTML = blocHtml(b);
  el.replaceWith(tmp.firstElementChild);
  majEtat();
}
async function compterReponses(b) {
  const el = $("pa-nb-rep"); if (!el) return;
  try {
    const t = await grist.docApi.fetchTable(courant.table);
    const n = (t[b.colonne] || []).filter(v => lisible(v) && !estVideValeur(v)).length;
    if (!$("pa-nb-rep")) return;
    el.textContent = `${n} réponse${n > 1 ? "s" : ""} enregistrée${n > 1 ? "s" : ""}`;
    const s = $("pa-supprimer");
    if (s) { s.disabled = n > 0; s.title = n > 0 ? "La colonne contient des réponses : elle ne peut pas être supprimée d'ici" : "Supprimer définitivement la colonne vide"; }
    b._reponses = n;
  } catch (_) { el.textContent = "réponses non lisibles"; }
}

/* ---------- choix et couleurs ---------- */
function dessinerChoix(b) {
  const c = meta[b.colonne], ch = c.opts.choices || [], co = c.opts.choiceOptions || {};
  $("pa-choix").innerHTML = ch.map((x, i) => {
    const f = (co[x] || {}).fillColor;
    return `<div class="choix-edit" data-i="${i}"><button type="button" class="icone" data-ch="haut" aria-label="Monter ${esc(x)}" ${i === 0 ? "disabled" : ""}>↑</button>
      <input type="color" value="${f || "#ffffff"}" aria-label="Couleur de ${esc(x)}" title="${f ? "Couleur du choix" : "Sans couleur (cliquez pour en choisir une)"}">
      <input type="text" value="${esc(x)}" aria-label="Choix ${i + 1}">
      ${f ? `<button type="button" class="icone" data-ch="sans" title="Retirer la couleur" aria-label="Retirer la couleur de ${esc(x)}">◌</button>` : ""}
      <button type="button" class="icone" data-ch="suppr" aria-label="Supprimer le choix ${esc(x)}">✕</button></div>`;
  }).join("") || `<p class="note">Aucun choix.</p>`;
  $("pa-choix").querySelectorAll(".choix-edit").forEach(div => {
    const i = +div.dataset.i, ancien = ch[i];
    div.querySelector("input[type=text]").addEventListener("change", e => renommerChoix(b, ancien, e.target.value.trim()));
    div.querySelector("input[type=color]").addEventListener("change", e => modifierOptions(b, o => { o.choiceOptions = o.choiceOptions || {}; o.choiceOptions[ancien] = { ...(o.choiceOptions[ancien] || {}), fillColor: e.target.value, textColor: texteSur(e.target.value) }; }));
    div.querySelectorAll("[data-ch]").forEach(btn => btn.addEventListener("click", () => {
      if (btn.dataset.ch === "suppr") { if (confirm(`Supprimer le choix « ${ancien} » ? Les réponses déjà saisies le conservent, mais il ne sera plus proposé.`)) modifierOptions(b, o => { o.choices = (o.choices || []).filter(x => x !== ancien); if (o.choiceOptions) delete o.choiceOptions[ancien]; }); }
      else if (btn.dataset.ch === "sans") modifierOptions(b, o => { if (o.choiceOptions) delete o.choiceOptions[ancien]; });
      else if (btn.dataset.ch === "haut" && i > 0) modifierOptions(b, o => { const l = o.choices; [l[i - 1], l[i]] = [l[i], l[i - 1]]; });
    }));
  });
  $("pa-ajout-choix").onclick = () => {
    const nom = prompt("Nouveau choix :"); if (!nom || !nom.trim()) return;
    modifierOptions(b, o => { o.choices = [...(o.choices || []), nom.trim()]; });
  };
}
function texteSur(hex) {
  const m = String(hex).match(/^#?([0-9a-f]{6})$/i); if (!m) return "#161616";
  const [r, g, bl] = [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * bl > 150 ? "#161616" : "#FFFFFF";
}
async function modifierOptions(b, f, table) {
  const tid = table || courant.table, cols = colonnesDe(tid), c = cols[b.colonne || b];
  const o = copie(c.opts || {}); f(o);
  try {
    await actions([["ModifyColumn", tid, c.colId, { widgetOptions: JSON.stringify(o) }]]);
    await lireMeta(); meta = metaCourante();
    if (typeof b === "object" && b.genre === "commun") { dessinerApercu(); dessinerPanneau(); }
    else if (typeof b === "object") { majBloc(b); dessinerPanneau(); } else dessinerPanneau();
  } catch (e) { message(`Modification refusée : ${e.message || e}`, "err"); }
}
async function renommerChoix(b, ancien, nouveau) {
  if (!nouveau || nouveau === ancien) return;
  const c = meta[b.colonne];
  if ((c.opts.choices || []).includes(nouveau)) {
    if (!(c.opts.choices || []).includes(ancien)) return;   // renommage déjà fait (événement répété)
    message(`Le choix « ${nouveau} » existe déjà.`, "err"); dessinerPanneau(); return;
  }
  const o = copie(c.opts);
  o.choices = o.choices.map(x => x === ancien ? nouveau : x);
  if (o.choiceOptions && o.choiceOptions[ancien]) { o.choiceOptions[nouveau] = o.choiceOptions[ancien]; delete o.choiceOptions[ancien]; }
  try {
    // RenameChoices met aussi à jour les réponses déjà enregistrées (versions récentes de Grist)
    try { await actions([["RenameChoices", courant.table, c.colId, { [ancien]: nouveau }]]); }
    catch (_) { message("Ancien choix conservé dans les réponses déjà saisies (version de Grist sans renommage des choix).", "err"); }
    await actions([["ModifyColumn", courant.table, c.colId, { widgetOptions: JSON.stringify(o) }]]);
    // les conditions qui citaient l'ancien choix suivent
    for (const x of blocs()) { const cd = x.reglages && x.reglages.condition; if (cd && colonneDeRef(cd.ref) === c) cd.valeurs = (cd.valeurs || []).map(v => v === ancien ? nouveau : v); }
    sauver();
    await lireMeta(); meta = metaCourante(); dessinerApercu(); dessinerPanneau();
  } catch (e) { message(`Renommage refusé : ${e.message || e}`, "err"); }
}
async function changerTypeNombre(b, type) {
  const c = meta[b.colonne];
  if (typeBase(c.type) === type) return;
  if ((b._reponses || 0) > 0 && type === "Int" && !confirm("Passer en nombre entier arrondit les valeurs décimales déjà saisies. Continuer ?")) return;
  try { await actions([["ModifyColumn", courant.table, c.colId, { type }]]); await lireMeta(); meta = metaCourante(); majBloc(b); dessinerPanneau(); }
  catch (e) { message(`Changement de type refusé : ${e.message || e}`, "err"); }
}

/* ---------- condition construite avec des menus ---------- */
function dessinerCondition(b) {
  const r = b.reglages, cd = r.condition || null, el = $("pa-condition");
  const autres = blocs().filter(x => x.genre === "question" && x.id !== b.id && meta[x.colonne] && !(x.reglages && x.reglages.tableau));
  const horsForm = Object.values(meta).filter(c => !autres.some(x => x.colonne === c.colId) && c.colId !== b.colonne && c.colId !== "id").sort((a, c2) => a.pos - c2.pos);
  const ref = cd ? (colonneDeRef(cd.ref) || {}).colId : "";
  el.innerHTML = `<div class="condition"><label class="l" for="pc-col">Afficher cette question si</label>
    <select id="pc-col"><option value="">— toujours affichée —</option>
      ${autres.length ? `<optgroup label="Questions du formulaire">${autres.map(x => `<option value="${esc(x.colonne)}"${ref === x.colonne ? " selected" : ""}>${esc(libelleQuestion(x.colonne))}</option>`).join("")}</optgroup>` : ""}
      <optgroup label="Autres colonnes de la table">${horsForm.map(c => `<option value="${esc(c.colId)}"${ref === c.colId ? " selected" : ""}>${esc(c.libelle)}</option>`).join("")}</optgroup></select>
    <div id="pc-suite"></div></div>`;
  $("pc-col").addEventListener("change", e => {
    r.condition = e.target.value ? { ref: e.target.value, op: "=", valeurs: [] } : undefined;
    const c = meta[e.target.value];
    if (c && !["Choice", "ChoiceList", "Bool"].includes(typeBase(c.type))) r.condition.op = "rempli";
    if (c && typeBase(c.type) === "Bool") r.condition.valeurs = ["Oui"];
    majBloc(b); sauver(); dessinerCondition(b);
  });
  if (!cd || !ref) return;
  const c = meta[ref], t = typeBase(c.type);
  const ops = ["Choice", "ChoiceList"].includes(t) ? [["=", "est l'un de"], ["!=", "n'est pas"], ["rempli", "est renseigné"], ["vide", "est vide"]]
    : t === "Bool" ? [["=", "est"]]
    : ["Int", "Numeric"].includes(t) ? [["rempli", "est renseigné"], ["vide", "est vide"], [">", "est supérieur à"], [">=", "est au moins"], ["<", "est inférieur à"], ["<=", "est au plus"], ["=", "est égal à"], ["!=", "est différent de"]]
    : [["rempli", "est renseigné"], ["vide", "est vide"], ["=", "est égal à"], ["!=", "est différent de"]];
  let valeurs = "";
  if (cd.op !== "rempli" && cd.op !== "vide") {
    if (["Choice", "ChoiceList"].includes(t)) valeurs = `<div class="valeurs-c">${(c.opts.choices || []).map(x => `<label><input type="checkbox" value="${esc(x)}"${(cd.valeurs || []).includes(x) ? " checked" : ""}> ${esc(x)}</label>`).join("")}</div>`;
    else if (t === "Bool") valeurs = `<select id="pc-bool"><option${(cd.valeurs || [])[0] !== "Non" ? " selected" : ""}>Oui</option><option${(cd.valeurs || [])[0] === "Non" ? " selected" : ""}>Non</option></select>`;
    else valeurs = `<input type="${["Int", "Numeric"].includes(t) ? "number" : "text"}" id="pc-val" value="${esc((cd.valeurs || []).join(", "))}" placeholder="valeur">`;
  }
  $("pc-suite").innerHTML = `<select id="pc-op">${ops.map(([v, l]) => `<option value="${v}"${cd.op === v ? " selected" : ""}>${l}</option>`).join("")}</select>${valeurs}
    ${cd.ref && !blocs().some(x => x.colonne === ref) ? `<p class="note" style="margin:4px 0 0">Colonne hors formulaire : sa valeur est celle déjà enregistrée (dernière version du signalement).</p>` : ""}`;
  $("pc-op").addEventListener("change", e => { cd.op = e.target.value; if (cd.op === "rempli" || cd.op === "vide") cd.valeurs = []; majBloc(b); sauver(); dessinerCondition(b); });
  $("pc-suite").querySelectorAll(".valeurs-c input").forEach(x => x.addEventListener("change", () => {
    cd.valeurs = [...$("pc-suite").querySelectorAll(".valeurs-c input:checked")].map(i => i.value); majBloc(b); sauver();
  }));
  if ($("pc-bool")) $("pc-bool").addEventListener("change", e => { cd.valeurs = [e.target.value]; majBloc(b); sauver(); });
  if ($("pc-val")) $("pc-val").addEventListener("input", e => { cd.valeurs = e.target.value.split(/\s*,\s*/).filter(Boolean); majBloc(b); sauver(); });
}

/* ---------- couleur du formulaire selon la réponse ---------- */
function dessinerCouleur(b) {
  const r = b.reglages, c = meta[b.colonne], t = typeBase(c.type), el = $("pa-couleur");
  if (t === "Choice" || t === "ChoiceList") {
    el.innerHTML = `<label class="interrupteur">Colorer le formulaire selon la réponse <input type="checkbox" id="pk-choix"${r.couleur === "choix" ? " checked" : ""}></label>
      <p class="note" style="margin:0">Couleurs prises dans les choix ci-dessus. Plusieurs réponses : la première dans l'ordre des choix l'emporte.</p>`;
    $("pk-choix").addEventListener("change", e => { r.couleur = e.target.checked ? "choix" : undefined; sauver(); });
    return;
  }
  const regles = Array.isArray(r.couleur) ? r.couleur : [];
  const OPS = t === "Bool" ? [["Oui", "si Oui"], ["Non", "si Non"]] : t === "Date" || t === "DateTime" ? [["renseigné", "si renseignée"], ["vide", "si vide"]]
    : [[">", "au-delà de"], [">=", "à partir de"], ["<", "en dessous de"], ["<=", "jusqu'à"], ["=", "égal à"]];
  const decoupe = cle => { const m = String(cle).match(/^(>=|<=|>|<|=)?\s*(.*)$/); return t === "Bool" || t === "Date" || t === "DateTime" ? [cle, ""] : [m[1] || "=", m[2]]; };
  el.innerHTML = regles.map((x, i) => { const [op, v] = decoupe(x.cle); const hex = COULEURS[normaliser(x.couleur)] || x.couleur;
    return `<div class="choix-edit" data-i="${i}"><select class="pk-op" style="width:auto;margin:0">${OPS.map(([o, l]) => `<option value="${o}"${o === op ? " selected" : ""}>${l}</option>`).join("")}</select>
      ${t === "Bool" || t === "Date" || t === "DateTime" ? "" : `<input type="number" class="pk-val" value="${esc(v)}" style="width:80px;margin:0">`}
      <input type="color" class="pk-coul" value="${/^#[0-9a-f]{6}$/i.test(hex) ? hex : "#ce0500"}" aria-label="Couleur"><button type="button" class="icone pk-suppr" aria-label="Supprimer">✕</button></div>`; }).join("") +
    `<button type="button" class="ajout-lien" id="pk-ajout">+ Ajouter ${t === "Bool" || t === "Date" || t === "DateTime" ? "une couleur" : "un seuil"}</button>
     <p class="note" style="margin:4px 0 0">La première règle qui s'applique l'emporte.</p>`;
  const relire = () => {
    r.couleur = [...el.querySelectorAll(".choix-edit")].map(d => {
      const op = d.querySelector(".pk-op").value, v = d.querySelector(".pk-val") ? d.querySelector(".pk-val").value : "";
      const cle = t === "Bool" || t === "Date" || t === "DateTime" ? op : (op === "=" ? v : `${op}${v}`);
      return { cle, couleur: d.querySelector(".pk-coul").value };
    }).filter(x => x.cle !== "" && x.cle !== ">" && x.cle !== "<");
    if (!r.couleur.length) r.couleur = undefined;
    sauver();
  };
  el.querySelectorAll("select, input").forEach(x => x.addEventListener("change", relire));
  el.querySelectorAll(".pk-suppr").forEach(x => x.addEventListener("click", () => { x.closest(".choix-edit").remove(); relire(); dessinerCouleur(b); }));
  $("pk-ajout").addEventListener("click", () => { r.couleur = [...regles, { cle: t === "Bool" ? "Oui" : t === "Date" || t === "DateTime" ? "renseigné" : ">0", couleur: "#ce0500" }]; sauver(); dessinerCouleur(b); });
}

/* ---------- champs d'une question « tableau » (colonnes de la table liée) ---------- */
function reglagesSousColonne(desc) {
  const r = lireReperes(desc);
  return { ordre: r.ordre ?? null, court: !!r.court, auto: !!r.auto, masque: !!r.masque, obligatoire: !!r.obligatoire, confidentiel: !!r.confidentiel, condition: r.condition ? `${r.condition.ref}${r.condition.op === "rempli" ? " n'est pas vide" : r.condition.op === "vide" ? " est vide" : ` ${r.condition.op} ${(r.condition.valeurs || []).join(", ")}`}` : "", aide: r.aide, autres: (desc.match(/\[(liste|boutons|positif|min[^\]]*|max[^\]]*|couleur[^\]]*)\]/gi) || []).join(" ") };
}
function descriptionSousColonne(s) {
  return [s.obligatoire ? "*" : "", s.ordre != null ? `[ordre ${s.ordre}]` : "", s.court ? "[court]" : "", s.auto ? "[auto]" : "", s.masque ? "[masqué]" : "", s.condition ? `[si ${s.condition}]` : "", s.autres || "",
    s.confidentiel ? "[confidentiel]" : "", s.aide || ""].filter(Boolean).join(" ");
}
function dessinerSousColonnes(b) {
  const tid = b.reglages.tableau.table, cols = sousColonnes(tid);
  const el = $("pa-sous");
  if (!Object.keys(colonnesDe(tid)).length) { el.innerHTML = `<p class="avert">La table « ${esc(tid)} » est introuvable.</p>`; return; }
  const noms = { Choice: "Choix unique", ChoiceList: "Choix multiple", Text: "Texte", Int: "Nombre", Numeric: "Nombre", Bool: "Oui / Non", Date: "Date", DateTime: "Date et heure" };
  el.innerHTML = cols.map((c, i) => { const s = reglagesSousColonne(c.description), t = typeBase(c.type);
    return `<div class="sous-col${s.masque ? " masque-sc" : ""}" data-col="${esc(c.colId)}"><div class="ligne-sc"><span class="ordre-sc">`
      + `<button type="button" class="icone sc-monter" data-sens="-1"${i === 0 ? " disabled" : ""} aria-label="Monter le champ ${esc(c.libelle)}" title="Monter">↑</button>`
      + `<button type="button" class="icone sc-descendre" data-sens="1"${i === cols.length - 1 ? " disabled" : ""} aria-label="Descendre le champ ${esc(c.libelle)}" title="Descendre">↓</button></span>`
      + `<input type="text" class="sc-lib" value="${esc(c.libelle)}" aria-label="Libellé du champ"><small class="note" style="white-space:nowrap">${esc(noms[t] || t)}</small>
      <button type="button" class="icone sc-suppr" aria-label="Supprimer le champ ${esc(c.libelle)}">✕</button></div>
      ${t === "Choice" || t === "ChoiceList" ? `<input type="text" class="choix-sc" value="${esc((c.opts.choices || []).join(", "))}" aria-label="Choix, séparés par des virgules" placeholder="Choix, séparés par des virgules">` : ""}
      <div class="opts"><label title="Le champ n'apparaît pas dans le formulaire ; ses valeurs restent dans la table"><input type="checkbox" class="sc-masque"${s.masque ? " checked" : ""}> masqué</label><label><input type="checkbox" class="sc-oblig"${s.obligatoire ? " checked" : ""}> obligatoire</label><label><input type="checkbox" class="sc-conf"${s.confidentiel ? " checked" : ""}> confidentiel</label>${t === "Text" ? `<label><input type="checkbox" class="sc-court"${s.court ? " checked" : ""}> sur une seule ligne</label><label title="Rempli à partir des autres champs de la ligne (modifiable par l'agent)"><input type="checkbox" class="sc-auto"${s.auto ? " checked" : ""}> texte automatique</label>` : ""}</div>
      <input type="text" class="cond-sc" value="${esc(s.condition)}" placeholder="Afficher si… (ex. Catégorie = Personnel)" aria-label="Condition d'affichage du champ"></div>`; }).join("") ||
    `<p class="note">Aucun champ pour l'instant.</p>`;
  el.querySelectorAll(".sous-col").forEach(div => {
    const colId = div.dataset.col, c = colonnesDe(tid)[colId];
    const majDesc = async () => {
      const s = reglagesSousColonne(c.description);
      s.obligatoire = div.querySelector(".sc-oblig").checked; s.confidentiel = div.querySelector(".sc-conf").checked; s.condition = div.querySelector(".cond-sc").value.trim();
      const ct = div.querySelector(".sc-court"); if (ct) s.court = ct.checked;
      const au = div.querySelector(".sc-auto"); if (au) s.auto = au.checked;
      s.masque = div.querySelector(".sc-masque").checked;
      try { await actions([["ModifyColumn", tid, colId, { description: descriptionSousColonne(s) }]]); await lireMeta(); majBloc(b); }
      catch (e) { message(`Réglage refusé : ${e.message || e}`, "err"); }
    };
    div.querySelector(".sc-oblig").addEventListener("change", majDesc);
    div.querySelector(".sc-conf").addEventListener("change", majDesc);
    div.querySelector(".sc-masque").addEventListener("change", majDesc);
    if (div.querySelector(".sc-court")) div.querySelector(".sc-court").addEventListener("change", majDesc);
    if (div.querySelector(".sc-auto")) div.querySelector(".sc-auto").addEventListener("change", majDesc);
    // Monter / descendre : toutes les colonnes de la table reçoivent leur numéro [ordre N]
    div.querySelectorAll("[data-sens]").forEach(btn => btn.addEventListener("click", async () => {
      const liste = sousColonnes(tid), i = liste.findIndex(x => x.colId === colId), j = i + +btn.dataset.sens;
      if (i < 0 || j < 0 || j >= liste.length) return;
      [liste[i], liste[j]] = [liste[j], liste[i]];
      try {
        await actions(liste.map((x, n) => ["ModifyColumn", tid, x.colId, { description: descriptionSousColonne({ ...reglagesSousColonne(x.description), ordre: n + 1 }) }]));
        await lireMeta(); majBloc(b); dessinerSousColonnes(b);
        const nb = $("pa-sous").querySelector(`.sous-col[data-col="${CSS.escape(colId)}"] [data-sens="${btn.dataset.sens}"]`);
        const f = nb && !nb.disabled ? nb : $("pa-sous").querySelector(`.sous-col[data-col="${CSS.escape(colId)}"] .sc-lib`); if (f) f.focus();
      } catch (e) { message(`Déplacement refusé : ${e.message || e}`, "err"); }
    }));
    div.querySelector(".cond-sc").addEventListener("change", majDesc);
    div.querySelector(".sc-lib").addEventListener("change", async e => {
      try { await actions([["ModifyColumn", tid, colId, { untieColIdFromLabel: true }], ["ModifyColumn", tid, colId, { label: e.target.value.trim() || c.libelle }]]); await lireMeta(); majBloc(b); }
      catch (err) { message(`Renommage refusé : ${err.message || err}`, "err"); }
    });
    const ch = div.querySelector(".choix-sc");
    if (ch) ch.addEventListener("change", e => modifierOptions(colId, o => { o.choices = e.target.value.split(/\s*,\s*/).filter(Boolean); }, tid));
    div.querySelector(".sc-suppr").addEventListener("click", async () => {
      if (!confirm(`Supprimer le champ « ${c.libelle} » de la table ${tid} ? Les valeurs déjà saisies dans cette colonne seront perdues.`)) return;
      try { await actions([["RemoveColumn", tid, colId]]); await lireMeta(); majBloc(b); dessinerPanneau(); }
      catch (err) { message(`Suppression refusée : ${err.message || err}`, "err"); }
    });
  });
  $("sc-ajouter").onclick = async () => {
    const lib = $("sc-nouveau-lib").value.trim(), type = $("sc-nouveau-type").value; if (!lib) { $("sc-nouveau-lib").focus(); return; }
    try {
      const existants = Object.keys(colonnesDe(tid));
      const colId = identifiant(lib, existants);
      const info = { type, label: lib, isFormula: false, untieColIdFromLabel: true };
      if (type === "Choice" || type === "ChoiceList") info.widgetOptions = JSON.stringify({ choices: ["Option 1", "Option 2"] });
      await actions([["AddColumn", tid, colId, info]]);
      await lireMeta(); majBloc(b); dessinerPanneau();
      const n = $("panneau").querySelector(`.sous-col[data-col="${colId}"] .choix-sc`) || $("sc-nouveau-lib"); if (n) n.focus();
    } catch (e) { message(`Champ non créé : ${e.message || e}`, "err"); }
  };
}

/* ---------- suppression de colonne (vide uniquement) ---------- */
async function supprimerColonne(b) {
  const c = meta[b.colonne]; if (!c) return;
  const t = await grist.docApi.fetchTable(courant.table);
  if (!c.formule && (t[c.colId] || []).some(v => !estVideValeur(v))) { message("La colonne contient des réponses : elle ne peut pas être supprimée d'ici.", "err"); return; }
  const autres = formulaires.filter(f => f.id !== courant.id && f.table === courant.table && String(f.brouillon || f.publie || "").includes(`"colonne":"${c.colId}"`));
  if (!confirm(`Supprimer définitivement la colonne « ${c.libelle} » (${c.colId}) de la table ${courant.table} ?${autres.length ? `\nElle est aussi utilisée par : ${autres.map(f => f.nom).join(", ")}.` : ""}`)) return;
  try {
    courant.conf.blocs = blocs().filter(x => x.id !== b.id); choisi = null; sauver();
    await actions([["RemoveColumn", courant.table, c.colId]]); await lireMeta(); meta = metaCourante();
    dessinerApercu(); dessinerPanneau(); message("Colonne supprimée.", "ok");
  } catch (e) { message(`Suppression refusée : ${e.message || e}`, "err"); }
}

/* =========================================================
   Formulaires : choix, création, duplication, publication
   ========================================================= */
function remplirChoixFormulaire() {
  const sel = $("choix-formulaire");
  sel.innerHTML = formulaires.length ? formulaires.map(f => `<option value="${f.id}"${courant && f.id === courant.id ? " selected" : ""}>${esc(f.nom)}</option>`).join("") : `<option value="">(aucun formulaire)</option>`;
  sel.disabled = !formulaires.length;
  $("btn-dupliquer").disabled = $("btn-tester").disabled = !courant;
}
$("choix-formulaire").addEventListener("change", e => {
  const f = formulaires.find(x => x.id === +e.target.value); if (!f) return;
  if (modeTest) basculerTest();
  charger(f); remplirChoixFormulaire(); dessinerApercu(); dessinerPanneau();
});
let duplication = false;
function ouvrirNouveau(dupliquer) {
  duplication = dupliquer;
  $("dlg-titre").textContent = dupliquer ? `Dupliquer « ${courant.nom} »` : "Nouveau formulaire";
  $("nf-nom").value = dupliquer ? `${courant.nom} (copie)` : "";
  $("nf-table").innerHTML = `<option value="__nouvelle__">+ Créer une nouvelle table…</option>` + tables.map(t => `<option${courant && t === courant.table ? " selected" : ""}>${esc(t)}</option>`).join("");
  if (!courant) $("nf-table").value = tables.includes(socleGeneral.reponses) ? socleGeneral.reponses : "__nouvelle__";
  const devine = tables.includes(socleGeneral.referentiel) ? socleGeneral.referentiel : devinerTableEtab();
  $("nf-etab").innerHTML = (tables.includes("Etablissements") ? "" : `<option value="__creer__">+ Créer une table « Etablissements »</option>`) +
    tables.map(t => `<option value="${esc(t)}"${t === devine ? " selected" : ""}>${esc(t)}</option>`).join("");
  if (devine === "__creer__") $("nf-etab").value = "__creer__";
  $("nf-etab").dataset.devine = $("nf-etab").value;
  $("nf-bloc-table").hidden = $("nf-bloc-type").hidden = dupliquer; majChoixTable();
  if (dupliquer) $("nf-bloc-nouvelle").hidden = $("nf-bloc-import").hidden = $("nf-bloc-etab").hidden = $("nf-bloc-options").hidden = true;
  $("nf-bloc-modele").hidden = dupliquer; $("nf-modele").value = "";
  $("nf-valider").textContent = dupliquer ? "Dupliquer" : "Créer";
  $("nf-erreur").textContent = "";
  $("dlg-nouveau").showModal(); $("nf-nom").focus(); $("nf-nom").select();
}
$("nf-annuler").addEventListener("click", () => $("dlg-nouveau").close());
function majChoixTable() {
  const nouvelle = $("nf-table").value === "__nouvelle__";
  $("nf-bloc-nouvelle").hidden = $("nf-bloc-options").hidden = !nouvelle; $("nf-bloc-import").hidden = nouvelle;
  $("nf-bloc-etab").hidden = false;
  const actuel = nouvelle ? null : referentielDe($("nf-table").value);
  $("nf-etab").value = actuel && [...$("nf-etab").options].some(o => o.value === actuel) ? actuel : ($("nf-etab").dataset.devine || $("nf-etab").value);
  majInfoReferentiel();
  if (nouvelle && !$("nf-nouvelle").value) $("nf-nouvelle").value = identifiant($("nf-nom").value || "Reponses", metaTables ? metaTables[0].tableId : []);
}
$("nf-table").addEventListener("change", majChoixTable);
$("nf-etab").addEventListener("change", majInfoReferentiel);
let analyseRef = null;
async function majInfoReferentiel() {
  const info = $("nf-etab-info"), t = $("nf-table").value;
  analyseRef = null;
  if (t === "__nouvelle__" || duplication) { info.hidden = true; return; }
  info.hidden = false; info.classList.remove("avert"); info.textContent = "Vérification…";
  const a = await analyserReferentiel(t, $("nf-etab").value);
  if ($("nf-table").value !== t) return;
  analyseRef = a; info.textContent = a.erreur || a.texte; info.classList.toggle("avert", !!a.erreur);
}
$("nf-nom").addEventListener("input", () => { if ($("nf-table").value === "__nouvelle__" && !$("nf-nouvelle").dataset.touche) $("nf-nouvelle").value = identifiant($("nf-nom").value || "Reponses", metaTables[0].tableId); });
$("nf-nouvelle").addEventListener("input", () => { $("nf-nouvelle").dataset.touche = "1"; });
// Table de réponses d'un questionnaire établissement (et référentiel des établissements s'il manque)
async function creerTableReponses(nom, opts = {}) {
  const tid = identifiant(nom, metaTables[0].tableId);
  let te = opts.etab && opts.etab !== "__creer__" && metaTables[0].tableId.includes(opts.etab) ? opts.etab : "Etablissements";
  if (!metaTables[0].tableId.includes(te))
    await actions([["AddTable", "Etablissements", ["Nom", "UAI", "Type", "Academie", "Departement", "Commune", "Mail"].map(id => ({ id, type: "Text", isFormula: false }))
      .concat([{ id: "UUID", type: "Text", isFormula: false, formula: "UUID()" }])]]);
  await actions([["AddTable", tid, [
    { id: "Etablissement", type: `Ref:${te}`, isFormula: false },
    ...(opts.site ? [{ id: "Site", type: "Text", isFormula: false }] : []),
    { id: "Date_faits", type: "Date", isFormula: false },
    { id: "Qualification", type: "Choice", isFormula: false },
    { id: "Description", type: "Text", isFormula: false },
    { id: "Nature", type: "Choice", isFormula: false },
    { id: "Date", type: "DateTime:Europe/Paris", isFormula: false, formula: "NOW()" },   // formule d'initialisation : heure du serveur
    { id: "Commentaire", type: "Text", isFormula: false },
    { id: "Auteur", type: "Text", isFormula: false, formula: "user.Email" },
    ...(opts.clos ? [{ id: "Clos", type: "Bool", isFormula: false }] : []),
  ]]]);
  await actions([
    ["AddColumn", tid, "Dossier", { type: `Ref:${tid}`, isFormula: false, label: "Dossier" }],
    // identifiants détachés des libellés d'abord : sans cela, Grist renommerait Date_faits, Date, Site d'après le libellé
    ...["Date_faits", "Date", ...(opts.site ? ["Site"] : [])].map(c => ["ModifyColumn", tid, c, { untieColIdFromLabel: true }]),
    ["ModifyColumn", tid, "Date_faits", { label: "Date des faits" }],
    ["ModifyColumn", tid, "Date", { label: "Date de saisie" }],
    ["ModifyColumn", tid, "Qualification", { widgetOptions: JSON.stringify({ choices: ["Catégorie 1", "Catégorie 2"], choiceOptions: {} }) }],
    ["ModifyColumn", tid, "Nature", { widgetOptions: JSON.stringify({ choices: ["Nouveau signalement", "Mise à jour"] }) }],
    ...(opts.site ? [["ModifyColumn", tid, "Site", { label: "Site / bâtiment" }]] : []),
  ]);
  await lireMeta();
  return tid;
}
$("form-nouveau").addEventListener("submit", async ev => {
  ev.preventDefault();
  const nom = $("nf-nom").value.trim(); if (!nom) return;
  if (formulaires.some(f => f.nom === nom)) { $("nf-erreur").textContent = "Un formulaire porte déjà ce nom."; return; }
  try {
    if (!(await lireFormulaires())) { await creerTableFormulaires(); await lireMeta(); }
    if (!colonnesDe(TABLE_FORMULAIRES).Type) { await actions([["AddColumn", TABLE_FORMULAIRES, "Type", { type: "Text", isFormula: false }]]); await lireMeta(); }
    let table = duplication ? courant.table : $("nf-table").value;
    const type = duplication ? courant.type : $("nf-type").value;
    if (table === "__nouvelle__") {
      const n = $("nf-nouvelle").value.trim(); if (!n) { $("nf-erreur").textContent = "Indiquez le nom de la nouvelle table."; return; }
      table = await creerTableReponses(n, { etab: $("nf-etab").value, site: $("nf-site").checked && $("nf-modele").value !== "esr-sites", clos: $("nf-clos").checked });
    } else if (!duplication && type === "etablissement") {
      // table existante : référentiel choisi (colonne Etablissement créée, ou rattachée à un autre référentiel)
      const a = await analyserReferentiel(table, $("nf-etab").value);
      if (a.erreur) { $("nf-erreur").textContent = a.erreur; return; }
      await appliquerReferentiel(table, a);
    }
    const conf = duplication ? copie(courant.conf) : { blocs: [] };
    if (duplication) conf.blocs.forEach(b => { b.id = nouvelId(); });
    const res = await actions([["AddRecord", TABLE_FORMULAIRES, null, { Nom: nom, Table: table, Type: type, Brouillon: JSON.stringify(conf), Modifie_le: maintenant() }]]);
    const id = res && res.retValues && res.retValues[0];
    await lireFormulaires();
    const f = formulaires.find(x => x.id === id) || formulaires[formulaires.length - 1];
    $("dlg-nouveau").close();
    charger(f); remplirChoixFormulaire(); dessinerApercu(); dessinerPanneau();
    if (!duplication && !$("nf-bloc-import").hidden && $("nf-import").checked && Object.values(meta).some(c => c.colId !== "id" && !COMMUNS.concat(["Dossier", "Nature", "Date", "Commentaire", "Auteur", "Clos"]).includes(c.colId))) {
      const ancre = document.querySelector("[data-ajout]"); if (ancre) { ouvrirMenu("q", 0, ancre); etapeExistantes(); }
    }
    if (!duplication && $("nf-modele").value === "esr-sites") { const r = await installerModeleSites(); message(`Formulaire « enseignement supérieur par site » créé : ${r}. Vérifiez les choix de qualification (du plus grave au moins grave), puis publiez.`, "ok"); return; }
    message(duplication ? "Formulaire dupliqué (mêmes colonnes, même table). Publiez-le pour l'utiliser sur une page." : "Formulaire créé.", "ok");
  } catch (e) { $("nf-erreur").textContent = `Échec : ${e.message || e}`; }
});
/* ---------- Modèle « Enseignement supérieur par site » ----------
   Sur le formulaire qui vient d'être créé : référentiel des sites (repris s'il existe : table « …site… » qui renvoie
   vers le référentiel des établissements, sinon Referentiel_sites créée), table des correspondances (libellé saisi →
   site), sous-table historisée Sites_signales (Site, Site_libre, Qualification du site, Precisions), question tableau
   « Sites concernés » réglée en tableau des sites, qualification de l'établissement en bas, déduite des sites. */
async function installerModeleSites() {
  const rep = courant.table, etab = tableEtab() || referentielDe(rep) || "Etablissements", faits = [];
  const existe = t => metaTables[0].tableId.includes(t);
  // référentiel des sites
  let ref = metaTables[0].tableId.find(t => /site/i.test(t) && !/signal|correspond/i.test(t) && Object.values(colonnesDe(t)).some(c => c.type === `Ref:${etab}`) && !Object.values(colonnesDe(t)).some(c => c.type === `Ref:${rep}`));
  if (!ref) {
    ref = identifiant("Referentiel_sites", metaTables[0].tableId);
    await actions([["AddTable", ref, [["Site_id", "Text"], ["Nom", "Text"], ["Etablissement", `Ref:${etab}`], ["Commune", "Text"], ["Latitude", "Numeric"], ["Longitude", "Numeric"], ["Source", "Choice"], ["Actif", "Bool"]]
      .map(([id, type]) => ({ id, type, isFormula: false }))]]);
    await actions([["ModifyColumn", ref, "Source", { widgetOptions: JSON.stringify({ choices: ["OAD", "Manuel"] }) }]]);
    faits.push(`référentiel des sites ${ref} créé (à alimenter : export OAD, sites saisis à la main)`);
  } else faits.push(`référentiel des sites : ${ref}`);
  // qualifications : celles de la table des réponses (choix d'attente remplacés par une proposition)
  await lireMeta(); meta = metaCourante();
  const cq = rolesEffectifs().Qualification || "Qualification", oq = (meta[cq] && meta[cq].opts) || {};
  let choixQ = Array.isArray(oq.choices) ? oq.choices : [];
  if (!choixQ.length || choixQ.every(x => /^Catégorie \d+$/.test(x))) {
    choixQ = ["Blocage total", "Blocage partiel", "Occupation", "Rassemblement", "RAS"];
    if (meta[cq]) await actions([["ModifyColumn", rep, cq, { widgetOptions: JSON.stringify({ ...oq, choices: choixQ }) }]]);
    faits.push("qualifications proposées (du plus grave au moins grave) : " + choixQ.join(", "));
  }
  const optsQ = JSON.stringify({ choices: choixQ, choiceOptions: oq.choiceOptions || {} });
  // correspondances
  if (!existe("Sites_correspondances")) {
    await actions([["AddTable", "Sites_correspondances", [["Etablissement", `Ref:${etab}`], ["Libelle", "Text"], ["Site", `Ref:${ref}`], ["Occurrences", "Int"], ["Statut", "Choice"]]
      .map(([id, type]) => ({ id, type, isFormula: false }))]]);
    await actions([["ModifyColumn", "Sites_correspondances", "Statut", { widgetOptions: JSON.stringify({ choices: ["À valider", "Validé", "Écarté"], choiceOptions: { "Validé": { fillColor: "#B8FEC9" }, "Écarté": { fillColor: "#EEEEEE" } } }) }]]);
    faits.push("table Sites_correspondances créée");
  }
  // sous-table des sites
  await lireMeta();
  const st = identifiant("Sites_signales", metaTables[0].tableId);
  await actions([["AddTable", st, [{ id: "Dossier", type: `Ref:${rep}`, isFormula: false }, { id: "Ligne_id", type: "Text", isFormula: false }, { id: "Ordre", type: "Int", isFormula: false },
    { id: "Site", type: `Ref:${ref}`, isFormula: false }, { id: "Site_libre", type: "Text", isFormula: false }, { id: "Qualification", type: "Choice", isFormula: false }, { id: "Precisions", type: "Text", isFormula: false }]]]);
  // identifiants détachés des libellés d'abord : sans cela, Grist renommerait Site_libre, Qualification… d'après le libellé
  await actions([...["Site", "Site_libre", "Qualification", "Precisions"].map(c => ["ModifyColumn", st, c, { untieColIdFromLabel: true }]),
    ["ModifyColumn", st, "Site", { label: "Site" }], ["ModifyColumn", st, "Site_libre", { label: "Site hors référentiel", description: "[court]" }],
    ["ModifyColumn", st, "Qualification", { label: "Qualification du site", widgetOptions: optsQ, description: "*" }], ["ModifyColumn", st, "Precisions", { label: "Précisions" }]]);
  await lireMeta();
  const hist = actionsHistoriqueTableau(st, "Dossier"); if (hist.length) { await actions(hist); await lireMeta(); }
  faits.push(`sous-table ${st} (historisée)`);
  // question tableau des sites, qualification en bas
  meta = metaCourante();
  const colonne = await creerColonne(rep, "Sites concernés", "Text", null);
  blocs().push({ id: nouvelId(), section: "q", genre: "question", colonne,
    reglages: { libelle: "Sites concernés", tableau: { table: st, sites: { site: "Site", libre: "Site_libre", qualif: "Qualification", historique: [], alias: "Sites_correspondances" } } } });
  courant.conf.saisie = { ...(courant.conf.saisie || {}), version: "esr", qualificationEnBas: true };
  sauver(); dessinerApercu(); dessinerPanneau();
  reglesApresTableau(st);
  return faits.join(" ; ");
}
$("btn-nouveau").addEventListener("click", () => ouvrirNouveau(false));
$("btn-dupliquer").addEventListener("click", () => courant && ouvrirNouveau(true));
$("btn-tester").addEventListener("click", () => courant && basculerTest());
async function reglesApresTableau(table) {
  clearTimeout(minuterie);
  const json = JSON.stringify(courant.conf), id = courant.id;
  enregistrementEnCours = enregistrementEnCours.then(() => actions([["UpdateRecord", TABLE_FORMULAIRES, id, { Brouillon: json, Modifie_le: maintenant() }]]));
  try { await enregistrementEnCours; } catch (_) { return; }
  let acces = { etat: "" };
  try { if (window.OngletAcces && window.OngletAcces.reappliquerSiBesoin) acces = await window.OngletAcces.reappliquerSiBesoin(); } catch (e) { acces = { etat: "refusees", texte: String(e.message || e) }; }
  if (acces.etat === "reappliquees") message(`Table ${table} : règles d'accès du socle appliquées.`, "ok");
  else if (["incomplet", "refusees", "illisibles"].includes(acces.etat)) message(`Table ${table} : ${acces.texte}`, "err");
}
$("btn-publier").addEventListener("click", publier);
/* ---------- renommer la table d'une question tableau ----------
   RenameTable de Grist (lignes, colonnes Référence et formules suivent), puis le nom est remplacé dans tous les formulaires
   (brouillons et versions publiées : réglages.tableau.table) et dans les réglages de Config qui le citent (profils de
   l'atlas : sous-table des marques, sous-table des sites). Identifiant Grist : lettres sans accents, chiffres et « _ »,
   commençant par une majuscule. */
const idTable = s => { let x = String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  if (/^[0-9]/.test(x)) x = "T_" + x; return x ? x.charAt(0).toUpperCase() + x.slice(1) : ""; };
async function renommerTableTableau(b, saisi) {
  const ancien = b.reglages.tableau.table, voulu = idTable(saisi);
  if (!voulu) { message("Donnez un nom à la table (lettres, chiffres, « _ »).", "err"); return; }
  if (voulu === ancien) { if ($("pa-table-nom")) $("pa-table-nom").value = ancien; return; }
  if (tables.includes(voulu)) { message(`La table « ${voulu} » existe déjà dans le document : choisissez un autre nom.`, "err"); return; }
  const autres = formulaires.filter(f => [f.brouillon, f.publie].some(j => String(j || "").includes(`"table":"${ancien}"`))).map(f => f.nom);
  if (!confirm(`Renommer la table « ${ancien} » en « ${voulu} » ?\n\nDans Grist : lignes, références et formules suivent.\nFormulaires mis à jour (brouillon et version publiée) : ${autres.join(", ") || courant.nom}.\n\nLes widgets ouverts ailleurs (saisie, cartographie) sont à recharger.`)) return;
  try {
    await clearTimeout(minuterie); await enregistrementEnCours;   // brouillon en attente : écrit avant
    const avant = new Set(tables);
    await actions([["RenameTable", ancien, voulu]]);
    await lireMeta();
    const nouveau = tables.includes(voulu) ? voulu : (tables.find(x => !avant.has(x)) || voulu);   // nom éventuellement ajusté par Grist
    // formulaires : réglages.tableau.table, brouillons et versions publiées
    const remplacer = j => { if (!j) return j; let c; try { c = JSON.parse(j); } catch (_) { return j; }
      let n = 0; (c.blocs || []).forEach(x => { if (x.reglages && x.reglages.tableau && x.reglages.tableau.table === ancien) { x.reglages.tableau.table = nouveau; n++; } });
      return n ? JSON.stringify(c) : j; };
    courant.conf.blocs.forEach(x => { if (x.reglages && x.reglages.tableau && x.reglages.tableau.table === ancien) x.reglages.tableau.table = nouveau; });
    const acts = [];
    for (const f of formulaires) {
      const br = f.id === courant.id ? JSON.stringify(courant.conf) : remplacer(f.brouillon), pu = remplacer(f.publie);
      if (br !== f.brouillon || pu !== f.publie) { acts.push(["UpdateRecord", TABLE_FORMULAIRES, f.id, { Brouillon: br, Publie: pu }]); f.brouillon = br; f.publie = pu; }
      if (f.id === courant.id) courant.publie = pu;
    }
    // Config : profils de l'atlas (marques.table, sites.table) et tout autre réglage dont une clé « table » vaut l'ancien nom
    try {
      const S = window.Socle, cfg = await S.lireConfig();
      if (cfg) for (const [cle, val] of Object.entries(cfg.valeurs || {})) {
        if (!val || typeof val !== "object") continue;
        let n = 0; const marcher = o => { if (Array.isArray(o)) o.forEach(marcher); else if (o && typeof o === "object") for (const k of Object.keys(o)) { if (k === "table" && o[k] === ancien) { o[k] = nouveau; n++; } else marcher(o[k]); } };
        const copieVal = JSON.parse(JSON.stringify(val)); marcher(copieVal);
        if (n) acts.push(S.actionConfig(cfg, cle, copieVal));
      }
    } catch (_) { /* sans Config : formulaires seulement */ }
    if (acts.length) await actions(acts);
    meta = metaCourante(); dessinerApercu(); dessinerPanneau(); majEtat();
    message(`Table renommée « ${nouveau} »${autres.length ? ` ; formulaire(s) mis à jour : ${autres.join(", ")}` : ""}. Rechargez les widgets ouverts ailleurs.`, "ok");
  } catch (e) { message(`Renommage refusé par Grist (${e.message || e}).`, "err"); if ($("pa-table-nom")) $("pa-table-nom").value = ancien; }
}
async function publier() {
  if (!courant) return;
  if (courant.type === "etablissement") {
    const roles = rolesEffectifs(), manq = ORDRE_ROLES.filter(r => ROLE_DEF[r].requis && !roles[r]);
    if (manq.length) { message(`Publication impossible : associez une colonne à ${manq.map(r => ROLE_DEF[r].lib.toLowerCase()).join(", ")} (panneau « Formulaire » › « Colonnes de la table des réponses »).`, "err"); choisir(null); return; }
    courant.conf.roles = roles;   // colonnes proposées confirmées par la publication
  }
  const manquantes = blocs().filter(b => b.genre === "question" && !meta[b.colonne]);
  if (manquantes.length && !confirm(`${manquantes.length} question(s) renvoient à une colonne absente et seront ignorées. Publier quand même ?`)) return;
  const conf = copie(courant.conf);
  // document à deux champs : la version du formulaire est fixée d'après sa table (le widget n'a plus à la deviner)
  if (!(conf.saisie && PRESETS[conf.saisie.version]) && espaceCourant() && window.Socle.espaces(window.Socle.general(socleConfig)).length > 1) conf.saisie = { ...(conf.saisie || {}), version: espaceCourant().version };
  const json = JSON.stringify(conf);
  try {
    // les libellés modifiés passent aussi dans Grist (en-têtes de colonnes), sans changer les identifiants
    const acts = [];
    for (const b of blocs()) {
      const c = meta[b.colonne];
      if (b.genre === "question" && c && b.reglages && b.reglages.libelle && b.reglages.libelle !== c.libelle)
        acts.push(["ModifyColumn", courant.table, c.colId, { untieColIdFromLabel: true }], ["ModifyColumn", courant.table, c.colId, { label: b.reglages.libelle }]);
    }
    acts.push(["UpdateRecord", TABLE_FORMULAIRES, courant.id, { Publie: json, Brouillon: json, Publie_le: maintenant() }]);
    await actions(acts);
    courant.publie = json; courant.publieLe = maintenant();
    const f = formulaires.find(x => x.id === courant.id); if (f) { f.publie = json; f.brouillon = json; f.publieLe = courant.publieLe; }
    await lireMeta(); meta = metaCourante();
    dessinerApercu(); dessinerPanneau();
    await lirePagesSaisie(); dessinerPanneau();
    await majCopieLiens();
    // règles d'accès du socle : réappliquées si le formulaire publié les a rendues incomplètes (nouvelle sous-table…)
    let acces = { etat: "", texte: "" };
    try { if (window.OngletAcces && window.OngletAcces.reappliquerSiBesoin) acces = await window.OngletAcces.reappliquerSiBesoin(); } catch (_) { /* facultatif */ }
    const suite = acces.texte ? ` ${acces.texte}` : "";
    const alerteAcces = ["incomplet", "refusees"].includes(acces.etat);
    const sansPage = pagesSaisie && !pagesSaisie.some(x => x.table === courant.table);
    message((sansPage ? "Formulaire publié. Aucune page de Grist ne l'affiche encore : créez les pages des agents dans Équipe › Pages de saisie."
      : "Formulaire publié : les pages qui l'affichent le prennent en compte dans les 30 secondes (ou au rechargement).") + suite, alerteAcces ? "err" : sansPage ? "" : "ok");
  } catch (e) { message(`Publication refusée : ${e.message || e}`, "err"); }
}
async function supprimerFormulaire() {
  if (!confirm(`Supprimer le formulaire « ${courant.nom} » ?\nSes colonnes et les réponses restent dans la table ${courant.table} ; les pages qui l'affichaient reviendront aux questions associées dans le widget.`)) return;
  try {
    await actions([["RemoveRecord", TABLE_FORMULAIRES, courant.id]]);
    await lireFormulaires(); courant = null;
    if (formulaires[0]) charger(formulaires[0]);
    remplirChoixFormulaire(); dessinerApercu(); dessinerPanneau();
  } catch (e) { message(`Suppression refusée : ${e.message || e}`, "err"); }
}

/* =========================================================
   Référentiel des établissements et données de la fiche
   ========================================================= */
// Table visée par la colonne Etablissement de la table des réponses
const tableEtab = () => { const c = meta.Etablissement; const m = c && String(c.type || "").match(/^Ref:(.+)$/); return m ? m[1] : null; };
const colonnesEtabProposees = te => te ? Object.values(colonnesDe(te)).filter(c => c.colId !== "id" && !/^(manualSort|UUID)$/.test(c.colId) && !c.colId.startsWith("gristHelper")).sort((a, b) => a.pos - b.pos) : [];
// Colonne de la fiche lue par une formule « $Etablissement.Colonne » (null pour une autre formule)
function sourceEtab(c) {
  const m = String((c && c.texteFormule) || "").trim().replace(/^return\s+/, "").match(/^\$(\w+)\.(\w+)$/);
  if (!m) return null;
  const ref = meta[m[1]];
  return m[1] === "Etablissement" || (ref && tableEtab() && ref.type === `Ref:${tableEtab()}`) ? m[2] : null;
}
const libelleColEtab = src => { const c = colonnesDe(tableEtab() || "")[src]; return c ? c.libelle : src; };
// Valeur affichée (comme dans le widget de saisie)
function valeurLisible(c, v) {
  if (v == null || v === "") return "";
  const t = typeBase(c && c.type);
  if (t === "Bool" || typeof v === "boolean") return v ? "Oui" : "Non";
  if (Array.isArray(v)) return (v[0] === "L" ? v.slice(1) : v).join(", ");
  if (t === "Date" && typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v.split("-").reverse().join("/");
  if (t === "Date" && typeof v === "number") return new Date(v * 1000).toLocaleDateString("fr-FR", { timeZone: "UTC" });
  if (typeof v === "number") return v.toLocaleString("fr-FR");
  return String(v);
}
function famille(c) {
  const t = typeBase(c && c.type);
  if (t === "Numeric" || t === "Int") return "nombre";
  if (t === "Date" || t === "DateTime") return "date";
  if (t === "Choice" || t === "ChoiceList") return "choix";
  if (t === "Bool") return "case";
  if (t === "Ref" || t === "RefList") return "reference";
  return "texte";
}
const FAMILLES = { nombre: "Nombres", date: "Dates", choix: "Choix", case: "Oui / Non", reference: "Références", texte: "Textes" };

/* ---------- mode test : établissement choisi dans le référentiel ---------- */
let etabsTest = null, etabTest = null, colsEtabTest = {}, siteTest = "", descTestManuelle = false;
function trouverColEtab(m, motifs, sauf) {
  const l = Object.values(m), cle = c => normaliser(`${c.colId} ${c.libelle}`).replace(/[^a-z0-9]+/g, "_");
  for (const mo of motifs) { const c = l.find(x => mo.test(cle(x)) && !(sauf && sauf.test(cle(x)))); if (c) return c.colId; }
  return null;
}
async function chargerEtabsTest() {
  const te = tableEtab(); etabsTest = [];
  if (!te) return;
  try {
    const t = await grist.docApi.fetchTable(te), cols = Object.keys(t).filter(c => c !== "manualSort");
    etabsTest = t.id.map((id, i) => { const r = {}; cols.forEach(c => { r[c] = t[c][i]; }); return r; });
    const m = colonnesDe(te);
    devinerColsEtab();
  } catch (_) { etabsTest = []; }
}
function devinerColsEtab() {   // colonnes du référentiel reconnues d'après leur identifiant ou leur libellé
  const m = colonnesDe(tableEtab() || "");
  colsEtabTest = {
    nom: m.Nom ? "Nom" : trouverColEtab(m, [/(^|_)nom(_|$)/, /appellation|denomination|libelle|intitule/, /etablissement/], /commune|ville|academi|departement|region|type|sigle|uai|tutelle|mail/),
    uai: m.UAI ? "UAI" : trouverColEtab(m, [/(^|_)(uai|rne)(_|$)/, /uai|rne/], /tutelle|siege|parent/),
    commune: m.Commune ? "Commune" : trouverColEtab(m, [/commune|ville|localite/], /code|insee|postal/),
    type: m.Type ? "Type" : trouverColEtab(m, [/^type/, /(^|_)type(_|$)/, /nature|categorie|typologie/], /code|contrat/),
    academie: m.Academie ? "Academie" : trouverColEtab(m, [/academie/], /code|region/),
    departement: m.Departement ? "Departement" : trouverColEtab(m, [/departement/], /code|numero/),
    mail: m.Mail ? "Mail" : trouverColEtab(m, [/mail|courriel/], /annuaire/),
    region: trouverColEtab(m, [/region_?academique/, /region/], /code/),
    };
}
const colRole = k => (confSaisie().colonnes || {})[k] || colsEtabTest[k] || null;   // colonne imposée par le formulaire, sinon reconnue
const nomEtab = e => String((colRole("nom") && e[colRole("nom")]) || `Établissement n° ${e.id}`);
const libelleEtabTest = e => `${nomEtab(e)}${colsEtabTest.uai && e[colsEtabTest.uai] ? ` — ${e[colsEtabTest.uai]}` : ""}`;
function chercherEtabTest(q) {
  const liste = $("test-etab-liste"); if (!liste || !etabsTest) return;
  const exact = etabsTest.find(e => libelleEtabTest(e) === q);
  if (exact) { etabTest = exact; majEtabTest(); return; }
  if (etabTest && !q.trim()) { etabTest = null; majEtabTest(); }
  const n = normaliser(q);
  const res = n.length < 2 ? [] : etabsTest.filter(e => normaliser(`${nomEtab(e)} ${colsEtabTest.uai ? e[colsEtabTest.uai] || "" : ""}`).includes(n)).slice(0, 30);
  liste.innerHTML = res.map(e => `<option value="${esc(libelleEtabTest(e))}"></option>`).join("");
}
function resumeEtabTestHtml() {
  const e = etabTest, com = e && colsEtabTest.commune ? e[colsEtabTest.commune] : "";
  return e ? `<b>${esc(nomEtab(e))}</b>${com ? ` <span class="meta">· ${esc(com)}</span>` : ""}` : `<b>Établissement du dossier</b> <span class="meta">· choisi au signalement initial</span>`;
}
function majEtabTest() {   // établissement de test choisi : résumé, titre (mise à jour), données de la fiche, description
  const r = $("test-resume-etab"); if (r) r.innerHTML = resumeEtabTestHtml();
  const fi = $("test-fiche"); if (fi) { fi.hidden = !etabTest; fi.innerHTML = ficheTestHtml(); }
  const h = document.querySelector(".entete-apercu.maj h1"); if (h) h.textContent = etabTest ? nomEtab(etabTest) : "Établissement du dossier";
  appliquerTest();
}
// Valeur d'une colonne formule en mode test ; undefined si l'aperçu ne sait pas la calculer
function valeurFormuleTest(c) {
  const src = sourceEtab(c);
  if (src) { const v = etabTest ? etabTest[src] : null; return v && typeof v === "object" && !Array.isArray(v) ? null : (v ?? null); }
  const f = String(c.texteFormule || "").trim().replace(/^return\s+/, "");
  if (!/^[\s$\w.,+\-*/()]+$/.test(f) || !/\$\w/.test(f) || !/^[\s+\-*/()]*$/.test(f.replace(/\$\w+/g, " ").replace(/\d+(?:[.,]\d+)?/g, " "))) return undefined;
  let manque = false;
  const expr = f.replace(/\$(\w+)/g, (_, x) => { const v = x === c.colId ? null : valeurTest(x); if (typeof v !== "number") manque = true; return `(${Number(v) || 0})`; });
  if (manque) return null;
  try { const r = Function(`"use strict"; return (${expr.replace(/,/g, ".")});`)(); return Number.isFinite(r) ? Math.round(r * 1e6) / 1e6 : null; } catch (_) { return null; }
}
function majFormulesTest() {
  document.querySelectorAll("[data-formule]").forEach(el => {
    const c = meta[el.dataset.formule]; if (!c) return;
    const v = valeurFormuleTest(c);
    el.textContent = v === undefined ? "Valeur calculée par Grist à l'enregistrement" : v == null || v === "" ? "—" : valeurLisible(c, v);
  });
}

/* =========================================================
   Description automatique : réglages communs (table Parametres) ou propres au formulaire
   ---------------------------------------------------------
   conf.description = { perso: true, actif, format, separateur, puce, entete, qualification, questions, mobilisation, formatsType } ;
   le format de chaque question reste dans ses réglages (reglages.format), celui des champs d'un tableau dans
   reglages.descTableau = { colonne: { ligne, decompte } }. Le widget de saisie applique ces réglages à la place
   de ceux de ⚙ quand perso est vrai.
   ========================================================= */
const DESC_DEFAUT = { actif: true, format: "libelle", separateur: "ligne", puce: "", entete: true, qualification: true, questions: true, mobilisation: true, formatsType: {}, formatsQuestion: {}, formatsTableau: {} };
const CLES_DESC = ["actif", "format", "separateur", "puce", "entete", "qualification", "questions", "mobilisation", "formatsType"];
const SEPARATEURS = { ligne: "\n", pv: " ; ", virgule: ", ", barre: " / ", espace: " ", point: ". " };
let reglagesCommuns = null;
async function lireReglagesCommuns() {
  if (socleConfig && socleConfig.valeurs.resume_auto) { reglagesCommuns = socleConfig.valeurs.resume_auto; return; }
  try { const t = await grist.docApi.fetchTable("Parametres"); const v = t.Resume_auto && t.Resume_auto[0]; reglagesCommuns = v ? JSON.parse(v) : {}; }
  catch (_) { reglagesCommuns = socleConfig ? {} : null; }
}
const descPerso = () => !!(courant && courant.conf.description && courant.conf.description.perso);
function optionsDescription() {
  const communs = { ...DESC_DEFAUT, ...(reglagesCommuns || {}) };
  if (!descPerso()) return communs;
  const d = courant.conf.description, o = { ...communs, formatsQuestion: {}, formatsTableau: {} };
  for (const k of CLES_DESC) if (k in d) o[k] = copie(d[k]);
  for (const b of blocs()) { const t = b.reglages && b.reglages.descTableau; if (b.colonne && t && Object.keys(t).length) o.formatsTableau[b.colonne] = t; }
  return o;
}
function joindreDesc(el, o) {
  const l = el.filter(e => String(e).trim());
  if (o.separateur !== "point") return l.join(SEPARATEURS[o.separateur] ?? "\n");
  if (!l.length) return "";
  const t = l.map(e => String(e).trim().replace(/\.+$/, "")).join(". ");
  return /[.!?…]$/.test(t) ? t : t + ".";
}
function formatPourItem(m, o) {
  const r = (m.b && m.b.reglages) || {};
  if (r.format && r.format !== "defaut") return r.format;
  const q = m.c && (o.formatsQuestion || {})[m.c.colId]; if (q && q !== "defaut") return q;
  const t = m.c && !m.tableau && (o.formatsType || {})[famille(m.c)]; if (t && t !== "defaut") return t;
  return o.format;
}
// Champs d'un tableau dans la description (mêmes règles que le widget de saisie)
const decomptable = d => ["Choice", "ChoiceList", "Bool", "Ref", "RefList", "Numeric", "Int"].includes(typeBase(d.type));
function modeSousAdmin(b, d, o) {
  const m = ((o.formatsTableau || {})[b.colonne] || {})[d.colId];
  const ligne = m && ["defaut", "libelle", "valeur", "exclure"].includes(m.ligne) ? m.ligne : "defaut";
  if (!m && estQualifSous(d)) return { ligne, decompte: true };   // qualification d'une ligne : décompte en tête par défaut
  return { ligne, decompte: !!(m && m.decompte && decomptable(d)) };
}
const estQualifSous = d => !!d && typeBase(d.type) === "Choice" && (/qualif/i.test(d.colId) || /qualif/i.test(d.libelle || ""));
function texteTableauAdmin(b, lignesBrutes, o) {
  const tous = sousColonnes(b.reglages.tableau.table).filter(x => !x.r.masque), sous = tous.filter(d => !d.r.confidentiel);
  const vis = (l, d) => visibleDansLigne(d, tous, l);
  const lignes = lignesBrutes.filter(l => tous.some(d => vis(l, d) && !estVideValeur(l[d.colId])));
  if (!lignes.length) return "";
  const parts = [];
  for (const d of sous.filter(d => modeSousAdmin(b, d, o).decompte)) {
    const t = typeBase(d.type);
    if (t === "Numeric" || t === "Int") { const v = lignes.filter(l => vis(l, d) && typeof l[d.colId] === "number").map(l => l[d.colId]); if (v.length) parts.push(`${d.libelle} : ${v.reduce((a, x) => a + x, 0).toLocaleString("fr-FR")}`); continue; }
    const compte = new Map();
    for (const l of lignes) { if (!vis(l, d) || estVideValeur(l[d.colId])) continue; const v = l[d.colId]; for (const x of Array.isArray(v) ? v : [valeurLisible(d, v)]) compte.set(x, (compte.get(x) || 0) + 1); }
    const ordre = d.opts.choices || [], rang = x => { const i = ordre.indexOf(x); return i < 0 ? 1e9 : i; };
    if (compte.size) parts.push(`${d.libelle} : ${[...compte].sort((a, c) => rang(a[0]) - rang(c[0])).map(([x, n]) => `${x} ${n}`).join(", ")}`);
  }
  const tete = sous.some(estQualifSous) ? `${lignes.length}${parts.length ? ` — ${parts.join(" ; ")}` : ""}` : `${lignes.length}${parts.length ? ` (${parts.join(" ; ")})` : ""}`;
  const fmtGen = d => { const f = (o.formatsType || {})[famille(d)]; return f && f !== "defaut" ? f : o.format; };
  const valeurs = l => sous.filter(d => !d.r.auto && modeSousAdmin(b, d, o).ligne !== "exclure" && vis(l, d)).map(d => {
    const m = modeSousAdmin(b, d, o).ligne, avecLib = m === "libelle" || (m === "defaut" && fmtGen(d) !== "valeur"), txt = valeurLisible(d, l[d.colId]);
    if (!avecLib && typeBase(d.type) === "Bool") return l[d.colId] ? d.libelle : "";
    return txt ? (avecLib ? `${d.libelle} : ${txt}` : txt) : "";
  }).filter(Boolean);
  const autos = sous.filter(d => d.r.auto && modeSousAdmin(b, d, o).ligne !== "exclure");
  if (!autos.length && !sous.some(d => !d.r.auto && modeSousAdmin(b, d, o).ligne !== "exclure")) return tete;
  const det = lignes.map((l, k) => {
    const repris = autos.filter(d => vis(l, d)).map(d => String(l[d.colId] ?? "").trim() || texteAutoTest(tous, l)).filter(Boolean).join(" — ");
    const v = repris ? [repris] : valeurs(l);
    return v.length ? `${k + 1}. ${v.join(" — ")}` : "";
  }).filter(Boolean);
  return [tete, ...det].join("\n");
}
function elementsTableauAdmin(m, fmt, o) {
  const [tete = "", ...lignes] = String(m.valeur ?? "").split(/\s*\n\s*/).filter(Boolean);
  let enTete = "";
  if (fmt === "exclure") enTete = tete.replace(/^\d+\s*(—\s*)?/, "").replace(/^\((.*)\)$/, "$1");
  else if (tete) enTete = fmt === "valeur" ? tete : `${m.libelle} : ${tete}`;
  return [enTete, ...lignes].filter(Boolean).map(x => `${o.puce || ""}${x}`);
}
// En-tête : version ESR (table avec Site) « **Nom** (site) », sinon « **Nom**, **Commune** »
function enTeteAdmin(ident) {
  return String(ident.nom || "").trim() ? appliquerModele(saisieEff().entete, ident) : "";
}
const estRas = q => !!q && String(q).trim().toUpperCase() === "RAS";
function descriptionTexte(o, items, ident, jour, qualif) {
  if (!o.actif) return "";
  const corps = joindreDesc(items.flatMap(m => {
    const fmt = formatPourItem(m, o);
    if (m.tableau) return elementsTableauAdmin(m, fmt, o);
    if (fmt === "exclure") return [];
    const v = String(m.valeur ?? "").replace(/\s*\n\s*/g, " ").trim();
    return [`${o.puce || ""}${fmt === "valeur" ? v : `${m.libelle} : ${v}`}`];
  }), o);
  const tete = o.entete ? enTeteAdmin(ident) : "";
  let texte = tete && corps ? `${tete} : ${corps}` : (tete || corps);
  if (o.mobilisation && !estRas(qualif)) texte += `${o.separateur === "ligne" && texte ? "\n" : texte ? " " : ""}(${jour === 1 ? "1er" : jour + "e"} jour de mobilisation)`;
  return texte;
}
// Questions du formulaire de signalement qui peuvent entrer dans la description (hors visas)
function questionsDesc() {
  const roles = new Map(parties().map(p => [p.id, p.role]));
  return blocs().filter(b => b.genre === "question" && meta[b.colonne] && roles.get(b.section || "q") === "q")
    .map(b => ({ b, c: meta[b.colonne], r: b.reglages || {} }));
}
function itemsDescriptionTest(o) {
  const items = [], q = valeurTest("Qualification");
  if (o.qualification && meta.Qualification && q) items.push({ libelle: meta.Qualification.libelle || "Qualification", valeur: q, c: meta.Qualification });
  if (o.questions) for (const { b, c, r } of questionsDesc()) {
    const el = document.querySelector(`[data-bloc="${b.id}"]`);
    if (r.confidentiel || !el || el.classList.contains("masque-test")) continue;
    if (r.tableau && r.tableau.table) { const t = texteTableauAdmin(b, testLignes[b.colonne] || [], o); if (t) items.push({ libelle: r.libelle || c.libelle, valeur: t, b, c, tableau: true }); continue; }
    const v = valeurTest(b.colonne);
    if (v === undefined || estVideValeur(v)) continue;
    items.push({ libelle: r.libelle || c.libelle, valeur: valeurLisible(c, v), b, c });
  }
  return items;
}
function majDescriptionTest() {
  const ta = $("test-description"), etat = $("etat-desc-test"); if (!ta) return;
  const o = optionsDescription();
  if (!o.actif) { etat.textContent = "Pré-remplissage désactivé : la description se saisit librement."; return; }
  if (!descTestManuelle) ta.value = descriptionTexte(o, itemsDescriptionTest(o),
    etabTest ? { ...valeursEtabTest(etabTest), site: siteTest.trim() } : { nom: "", site: siteTest.trim() }, 1, valeurTest("Qualification"));
  etat.innerHTML = descTestManuelle ? `✎ Texte modifié à la main : il ne suit plus les réponses. <button type="button" class="ajout-lien" id="btn-desc-auto">Reprendre le texte automatique</button>`
    : "↻ Rédigé automatiquement : le texte suit les réponses du formulaire.";
}
// Exemple avec des réponses fictives (panneau et aperçu en édition)
function lignesExempleAdmin(b) {
  return [0, 1].map(k => {
    const l = {};
    for (const d of sousColonnes(b.reglages.tableau.table)) {
      const t = typeBase(d.type), ch = d.opts.choices || [];
      if (d.r.auto) continue;
      if (t === "Choice") l[d.colId] = ch[k % Math.max(ch.length, 1)] || "Oui";
      else if (t === "ChoiceList") l[d.colId] = ch.length ? [ch[k % ch.length]] : null;
      else if (t === "Bool") l[d.colId] = k === 0;
      else if (t === "Int" || t === "Numeric") l[d.colId] = k + 1;
      else if (t === "Date") l[d.colId] = new Date().toISOString().slice(0, 10);
      else l[d.colId] = k === 0 ? "texte saisi" : "autre texte";
    }
    return l;
  });
}
function exempleDescription(o = optionsDescription()) {
  if (!courant) return "";
  if (!o.actif) return "(pré-remplissage désactivé : la description se saisit librement)";
  const q = meta.Qualification, items = [];
  if (o.qualification && q) items.push({ libelle: q.libelle || "Qualification", valeur: (q.opts.choices || [])[0] || "Intrusion", c: q });
  if (o.questions) for (const { b, c, r } of questionsDesc()) {
    if (r.confidentiel) continue;
    if (r.tableau && r.tableau.table) { const t = texteTableauAdmin(b, lignesExempleAdmin(b), o); if (t) items.push({ libelle: r.libelle || c.libelle, valeur: t, b, c, tableau: true }); continue; }
    const v = c.formule ? (sourceEtab(c) ? (famille(c) === "nombre" ? 12500 : `${r.libelle || c.libelle} de la fiche`) : 3)
      : ({ nombre: 20, date: new Date().toISOString().slice(0, 10), case: true, choix: (c.opts.choices || [])[0] || "Oui", reference: "élément lié", texte: "texte saisi" })[famille(c)];
    items.push({ libelle: r.libelle || c.libelle, valeur: valeurLisible(c, typeBase(c.type) === "ChoiceList" ? [v] : v), b, c });
  }
  return descriptionTexte(o, items, identiteExemple(), 3, q && (q.opts.choices || [])[0]) || "(aucun élément inclus)";
}
// Choix du format d'une question dans la description (panneau de la question et panneau Description)
function choixFormatQuestion(b) {
  const r = (b && b.reglages) || {}, defaut = descPerso() ? "Par défaut (réglage du formulaire)" : "Par défaut (réglage du widget de saisie)";
  return r.tableau ? [["defaut", defaut], ["libelle", "En-tête : libellé et nombre"], ["valeur", "En-tête : nombre seul"], ["exclure", "Sans en-tête (lignes seules)"]]
    : [["defaut", defaut], ["libelle", "Libellé : valeur"], ["valeur", "Valeur seule"], ["exclure", "Ne pas inclure"]];
}
function panneauDescription() {
  const p = $("panneau"), c = meta.Description, perso = descPerso(), o = optionsDescription(), d = courant.conf.description;
  const sel = (id, opts, v, lib) => `<label class="l" for="${id}">${lib}</label><select id="${id}">${opts.map(([k, l]) => `<option value="${k}"${k === v ? " selected" : ""}>${l}</option>`).join("")}</select>`;
  const inter = (cle, lib) => `<label class="interrupteur">${lib} <input type="checkbox" data-desc="${cle}"${o[cle] ? " checked" : ""}></label>`;
  const qs = questionsDesc();
  const familles = [...new Set(qs.filter(x => !x.r.tableau).map(x => famille(x.c)))];
  const optFmt = v => [["defaut", "Par défaut"], ["libelle", "Libellé : valeur"], ["valeur", "Valeur seule"]].map(([k, l]) => `<option value="${k}"${k === (v || "defaut") ? " selected" : ""}>${l}</option>`).join("");
  const ligneQ = ({ b, c, r }) => {
    if (r.confidentiel) return `<div class="reglage-q"><div><span>${esc(r.libelle || c.libelle)}</span><small class="note" style="margin:0">confidentielle : jamais incluse</small></div></div>`;
    let h = `<div class="reglage-q"><div><span>${esc(r.libelle || c.libelle)}${c.formule ? ' <small class="note">(fiche)</small>' : ""}</span><select data-format-q="${esc(b.id)}" aria-label="Format de ${esc(r.libelle || c.libelle)}">${
      choixFormatQuestion(b).map(([v, l]) => `<option value="${v}"${(r.format || "defaut") === v ? " selected" : ""}>${v === "defaut" ? "Par défaut" : l}</option>`).join("")}</select></div>`;
    if (perso && r.tableau && r.tableau.table) h += sousColonnes(r.tableau.table).filter(x => !x.r.masque).map(sc => {
      if (sc.r.confidentiel) return `<div class="sous-reglage"><span>↳ ${esc(sc.libelle)}</span><small>confidentiel : jamais inclus</small></div>`;
      const m = modeSousAdmin(b, sc, o), opts = sc.r.auto ? [["defaut", "Reprendre ce texte"], ["exclure", "Ne pas l'utiliser"]] : [["defaut", "Par défaut"], ["libelle", "Libellé : valeur"], ["valeur", "Valeur seule"], ["exclure", "Ne pas inclure"]];
      return `<div class="sous-reglage"><span>↳ ${esc(sc.libelle)}</span><span style="display:flex;gap:6px;align-items:center">${decomptable(sc) ? `<label><input type="checkbox" data-dt-dec="${esc(b.id)}" data-sc="${esc(sc.colId)}"${m.decompte ? " checked" : ""}> ${["Int", "Numeric"].includes(typeBase(sc.type)) ? "somme" : "décompte"} en tête</label>` : ""}` +
        `<select data-dt-ligne="${esc(b.id)}" data-sc="${esc(sc.colId)}" aria-label="${esc(sc.libelle)} dans chaque ligne">${opts.map(([k, l]) => `<option value="${k}"${k === m.ligne ? " selected" : ""}>${l}</option>`).join("")}</select></span></div>`;
    }).join("");
    return h + `</div>`;
  };
  p.innerHTML = `<h2>${esc(c ? c.libelle : "Description")}</h2><p class="sous">Champ commun · colonne Description</p>
    <p class="note">Rédigée automatiquement à partir des réponses ; l'agent peut la compléter ou la modifier avant d'enregistrer.</p>
    <div class="groupe"><div class="t">Réglages de la description automatique</div>
      <div class="seg2" role="group" aria-label="Origine des réglages"><button type="button" data-perso="0" aria-pressed="${!perso}">Communs (⚙ du widget)</button><button type="button" data-perso="1" aria-pressed="${perso}">Propres à ce formulaire</button></div>
      ${perso ? `${inter("actif", "Pré-remplir la description")}
        <div class="grille2"><div>${sel("pd-format", [["libelle", "Libellé : valeur"], ["valeur", "Valeur seule"]], o.format, "Contenu de chaque élément")}</div>
        <div>${sel("pd-separateur", [["ligne", "Retour à la ligne"], ["pv", "Point-virgule"], ["virgule", "Virgule"], ["barre", "Barre oblique"], ["espace", "Espace"], ["point", "Point"]], o.separateur, "Séparateur")}</div></div>
        <label class="l" for="pd-puce">Puce devant chaque élément</label><input type="text" id="pd-puce" maxlength="4" placeholder="Aucune" value="${esc(o.puce || "")}">
        ${inter("entete", meta.Site ? "Commencer par le nom de l'établissement (et le site)" : "Commencer par le nom de l'établissement et sa commune")}
        ${inter("qualification", "Inclure la qualification")}
        ${inter("questions", "Inclure les questions du formulaire")}
        ${inter("mobilisation", "Terminer par le jour de mobilisation")}`
      : `<p class="note" style="margin:0">Ce formulaire suit les réglages ⚙ du widget de saisie, communs à tous les formulaires du document (clé resume_auto de Config)${reglagesCommuns === null ? " — table illisible ou absente : réglages par défaut" : ""}.
         Choisissez « Propres à ce formulaire » pour les régler ici : ils partent des réglages communs actuels et s'appliquent à la publication.</p>`}
    </div>
    ${perso && familles.length ? `<div class="groupe"><div class="t">Format par type de question</div>${familles.map(f => `<div class="reglage-q"><div><span>${FAMILLES[f]}</span><select data-famille="${f}" aria-label="Format des ${FAMILLES[f].toLowerCase()}">${optFmt((o.formatsType || {})[f])}</select></div></div>`).join("")}</div>` : ""}
    <div class="groupe"><div class="t">Question par question</div>${qs.map(ligneQ).join("") || `<p class="note" style="margin:0">Aucune question dans le formulaire.</p>`}
      <p class="note" style="margin:6px 0 0">Prioritaire sur le format par type. Les champs d'un tableau se règlent ici avec les réglages propres au formulaire.</p></div>
    ${groupeEnteteHtml()}
    <div class="groupe"><div class="t">Exemple</div><div class="exemple-desc" id="pd-exemple"></div>
      <p class="note" style="margin:6px 0 0">Avec des réponses fictives. En mode ▶ Tester, la description suit vos réponses.</p></div>`;
  const maj = () => { sauver(); $("pd-exemple").textContent = exempleDescription(); const ex = document.querySelector('[data-commun="commun:Description"] .exemple-desc'); if (ex) ex.textContent = exempleDescription(); };
  $("pd-exemple").textContent = exempleDescription();
  lierEntete(p, maj);
  p.querySelectorAll("[data-perso]").forEach(x => x.addEventListener("click", () => {
    const oui = x.dataset.perso === "1";
    if (oui && !d) { const base = optionsDescription(); courant.conf.description = { perso: true }; for (const k of CLES_DESC) courant.conf.description[k] = copie(base[k]); }
    else if (d) d.perso = oui;
    sauver(); dessinerApercu(); panneauDescription();
  }));
  const dd = () => courant.conf.description;
  p.querySelectorAll("[data-desc]").forEach(x => x.addEventListener("change", () => { dd()[x.dataset.desc] = x.checked; maj(); }));
  [["pd-format", "format"], ["pd-separateur", "separateur"]].forEach(([id, k]) => { const el = $(id); if (el) el.addEventListener("change", () => { dd()[k] = el.value; maj(); }); });
  if ($("pd-puce")) $("pd-puce").addEventListener("input", e => { dd().puce = e.target.value; maj(); });
  p.querySelectorAll("[data-famille]").forEach(x => x.addEventListener("change", () => { const f = dd().formatsType = { ...(dd().formatsType || {}) }; if (x.value === "defaut") delete f[x.dataset.famille]; else f[x.dataset.famille] = x.value; maj(); }));
  p.querySelectorAll("[data-format-q]").forEach(x => x.addEventListener("change", () => { const b = blocDe(x.dataset.formatQ); b.reglages.format = x.value === "defaut" ? undefined : x.value; maj(); }));
  const majSous = (bid, sc) => {
    const b = blocDe(bid), t = b.reglages.descTableau = b.reglages.descTableau || {};
    const ligne = p.querySelector(`[data-dt-ligne="${CSS.escape(bid)}"][data-sc="${CSS.escape(sc)}"]`).value, dec = p.querySelector(`[data-dt-dec="${CSS.escape(bid)}"][data-sc="${CSS.escape(sc)}"]`);
    const v = { ligne, decompte: !!(dec && dec.checked) };
    // réglage par défaut : retiré ; sauf la qualification, dont le décompte est actif par défaut (le décocher doit être retenu)
    const qualif = estQualifSous(sousColonnes(b.reglages.tableau.table).find(x => x.colId === sc));
    if (v.ligne === "defaut" && v.decompte === qualif) delete t[sc]; else t[sc] = v;
    if (!Object.keys(t).length) delete b.reglages.descTableau;
    maj();
  };
  p.querySelectorAll("[data-dt-ligne]").forEach(x => x.addEventListener("change", () => majSous(x.dataset.dtLigne, x.dataset.sc)));
  p.querySelectorAll("[data-dt-dec]").forEach(x => x.addEventListener("change", () => majSous(x.dataset.dtDec, x.dataset.sc)));
}

/* ---------- panneau d'une question formule (donnée de la fiche ou calcul) ---------- */
function panneauFormule(b, c) {
  const p = $("panneau"), r = b.reglages, src = sourceEtab(c), te = tableEtab(), colsE = colonnesEtabProposees(te);
  const calculable = !src && valeurFormuleTestPossible(c);
  p.innerHTML = `<h2>${esc(r.libelle || c.libelle)}</h2><p class="sous">${src ? "Donnée de la fiche établissement" : "Colonne formule"} · lecture seule, sans saisie</p>
    <label class="l" for="pa-libelle">Libellé</label><input type="text" id="pa-libelle" value="${esc(r.libelle || c.libelle)}">
    <label class="l" for="pa-aide">Aide affichée sous la question</label><textarea id="pa-aide">${esc(r.aide || "")}</textarea>
    <span class="ident" title="Identifiant de la colonne dans Grist">colonne : ${esc(c.colId)}</span>
    <label class="l" for="pa-section" style="margin-top:8px">Partie du formulaire</label><select id="pa-section">${optionsParties(b.section)}</select>
    <div class="groupe"><div class="t">Valeur affichée</div>
      ${src ? `<label class="l" for="pa-source">Information de la fiche (table ${esc(te)})</label><select id="pa-source">${colsE.map(x => `<option value="${esc(x.colId)}"${x.colId === src ? " selected" : ""}>${esc(x.libelle)}</option>`).join("")}</select>
        <p class="note" style="margin:0">Formule <code>${esc(c.texteFormule)}</code>. Le formulaire l'affiche dès que l'établissement est choisi ; Grist la tient à jour si la fiche change.</p>`
      : `<p class="note" style="margin:0">Formule <code>${esc(c.texteFormule)}</code>. ${calculable ? "Le formulaire la calcule en direct à partir des réponses." : "Le formulaire affiche la valeur enregistrée, recalculée par Grist."}</p>`}
    </div>
    <div class="groupe"><div class="t">Affichage conditionnel</div><div id="pa-condition"></div></div>
    <div class="groupe"><div class="t">Données et diffusion</div>
      <label class="interrupteur">Confidentiel (exclu de la description automatique) <input type="checkbox" id="pa-conf"${r.confidentiel ? " checked" : ""}></label>
      <label class="l" for="pa-format">Dans la description automatique</label>
      <select id="pa-format">${choixFormatQuestion(b).map(([v, l]) => `<option value="${v}"${(r.format || "defaut") === v ? " selected" : ""}>${l}</option>`).join("")}</select>
    </div>
    <div class="pied-panneau"><button type="button" class="danger" id="pa-retirer">Retirer du formulaire</button><button type="button" class="danger" id="pa-supprimer">Supprimer la colonne…</button></div>`;
  $("pa-libelle").addEventListener("input", e => { r.libelle = e.target.value; p.querySelector("h2").textContent = e.target.value || c.libelle; majBloc(b); sauver(); });
  $("pa-aide").addEventListener("input", e => { r.aide = e.target.value.trim(); majBloc(b); sauver(); });
  $("pa-section").addEventListener("change", e => { deplacer(b.id, blocs().length, e.target.value); choisir(b.id); });
  $("pa-conf").addEventListener("change", e => { r.confidentiel = e.target.checked; majBloc(b); sauver(); });
  $("pa-format").addEventListener("change", e => { r.format = e.target.value === "defaut" ? undefined : e.target.value; sauver(); });
  $("pa-retirer").addEventListener("click", () => retirerBloc(b));
  $("pa-supprimer").addEventListener("click", () => supprimerColonne(b));
  if ($("pa-source")) $("pa-source").addEventListener("change", async e => {
    const cs = colonnesDe(te)[e.target.value] || {}, ref = (String(c.texteFormule).match(/^\s*(?:return\s+)?\$(\w+)\./) || [])[1] || colEtab();
    const info = { formula: `$${ref}.${e.target.value}`, type: cs.type || "Any" };
    if (["Choice", "ChoiceList"].includes(typeBase(cs.type))) info.widgetOptions = JSON.stringify(cs.opts || {});
    try { await actions([["ModifyColumn", courant.table, c.colId, info]]); await lireMeta(); meta = metaCourante(); majBloc(b); dessinerPanneau(); }
    catch (err) { message(`Modification refusée : ${err.message || err}`, "err"); }
  });
  dessinerCondition(b);
}
const valeurFormuleTestPossible = c => { const f = String(c.texteFormule || "").trim().replace(/^return\s+/, ""); return /^[\s$\w.,+\-*/()]+$/.test(f) && /\$\w/.test(f) && /^[\s+\-*/()]*$/.test(f.replace(/\$\w+/g, " ").replace(/\d+(?:[.,]\d+)?/g, " ")); };

/* ---------- colonnes de service du questionnaire (panneau « Formulaire ») ---------- */
async function ajouterColonneService(id) {
  const x = COLS_QUESTIONNAIRE.find(y => y.id === id); if (!x || metaBrut[id]) return;
  try {
    await actions([["AddColumn", courant.table, id, x.info(courant.table)]]);
    if (courant.conf.roles && courant.conf.roles[id] === "") { courant.conf.roles[id] = id; sauver(); }
    await lireMeta(); meta = metaCourante();
    dessinerApercu(); dessinerPanneau(); message(`Colonne « ${x.lib} » ajoutée à la table ${courant.table}.`, "ok");
  } catch (e) { message(`Colonne non ajoutée : ${e.message || e}`, "err"); }
}
// Référentiel proposé à la création : table « établissements » avec une colonne UAI, sinon « Etablissements »
function devinerTableEtab() {
  // tables visées par une colonne Etablissement existante d'abord (référentiel déjà utilisé), puis celles qui ont une colonne UAI
  const [, c] = metaTables, refs = new Map();
  c.colId.forEach((x, i) => { const m = /^Etablissement/.test(x) && String(c.type[i]).match(/^Ref:(.+)$/); if (m) refs.set(m[1], (refs.get(m[1]) || 0) + 1); });
  const avecUai = t => Object.values(colonnesDe(t)).some(x => /(^|[^a-z])(uai|rne)([^a-z]|$)/i.test(`${x.colId} ${x.libelle}`));
  const cand = tables.filter(t => /etab/.test(normaliser(t).replace(/[^a-z]/g, "")) && avecUai(t)).sort((a, b) => (refs.get(b) || 0) - (refs.get(a) || 0));
  return cand[0] || (tables.includes("Etablissements") ? "Etablissements" : "__creer__");
}


/* =========================================================
   Page de saisie : création d'une page Grist avec le widget de saisie déjà réglé
   ---------------------------------------------------------
   « CreateViewSection » (action de Grist utilisée par « Ajouter une page ») crée une page avec une vue
   personnalisée reliée à la table du formulaire ; ses options (customView) reçoivent l'adresse du widget,
   l'accès complet et le formulaire présélectionné (option « formulaire » lue par grist.getOption).
   ========================================================= */
let pagesSaisie = null;   // vues personnalisées du document qui affichent un formulaire de saisie
const R = window.Repartition;
const optionsVue = R.optionsVue;
async function lirePagesSaisie() { pagesSaisie = await R.lirePages(); }
const estEsr = () => !!meta.Site || (!!tableEtab() && tableEtab() !== "Etablissements");
// Adresse proposée pour le widget de saisie : la v2, à côté de cette administration (…/v2/saisie/)
const URL_SAISIE_V2 = R.URL_SAISIE_V2;
function urlWidgetProposee() {
  const deja = (pagesSaisie || []).map(x => x.url).find(u => URL_SAISIE_V2.test(u || ""));
  if (deja) return deja;
  try { return new URL("../saisie/", location.href).href; } catch (_) { return "https://majouble.github.io/test-formulaire/prod/saisie/"; }
}
// Pages de saisie des agents : gérées dans Équipe › Pages de saisie (admin/pages-agents.js, une page par agent et par
// formulaire publié) ; ici, un résumé pour le formulaire affiché et un raccourci.
const allerPagesAgents = () => { const b = document.querySelector('nav button[data-onglet="onglet-equipe"]'); if (b) b.click(); window.OngletEquipeGroupe.afficher("pages"); };
function groupePageHtml() {
  if (courant.type !== "etablissement") return "";
  return `<div class="groupe"><div class="t">Pages de saisie des agents</div><p class="note" id="pf-pages" style="margin:0 0 8px">Lecture…</p>
    <button type="button" class="secondaire petit" id="pf-pages-aller">Gérer les pages des agents →</button></div>`;
}
async function lierPages(p) {
  const b = p.querySelector("#pf-pages-aller"); if (!b) return;
  b.addEventListener("click", allerPagesAgents);
  const z = p.querySelector("#pf-pages");
  try {
    await window.PagesAgents.charger();
    const r = window.PagesAgents.resume(courant.nom);
    if (!courant.publie) { z.textContent = "Publiez le formulaire : chaque agent pourra alors avoir sa page de saisie (Équipe › Pages de saisie)."; return; }
    z.textContent = [`${r.aJour} page${r.aJour > 1 ? "s" : ""} à jour`, r.aCreer ? `${r.aCreer} à créer` : "", r.aMaj ? `${r.aMaj} à mettre à jour` : ""].filter(Boolean).join(" · ") + ". Une page par agent ; elle applique le périmètre de son créneau en cours.";
  } catch (_) { z.textContent = "Pages des agents : voir Équipe › Pages de saisie."; }
}

/* =========================================================
   Spécificités de la saisie (version établissements scolaires / enseignement supérieur)
   ---------------------------------------------------------
   conf.saisie = { version: "en" | "esr", marque, annuaires, entete, colonnes, fiche, recherche, pastilles, commentaire } :
   lu par le widget de saisie unique (widget-signalements.html). Les réglages absents reprennent ceux de la version ;
   mêmes valeurs par défaut que le widget (PRESETS).
   ========================================================= */
const FICHE_DEFAUT = [["@nom", "Établissement"], ["@uai", "UAI"], ["@type", "Type"], ["@commune", "Commune"], ["@academie", "Académie"], ["@departement", "Département"]];
const PRESETS = {
  en: { libelle: "Établissements scolaires", marque: "Établissements scolaires", annuaires: ["en", "esr"], entete: "**{nom}**, **{commune}**",
        pastilles: "auto", commentaire: false, fiche: FICHE_DEFAUT.map(([col, lib]) => ({ col, lib })), recherche: [], colonnes: {}, faitsFuturs: true, plusieursJours: true },
  esr: { libelle: "Enseignement supérieur et recherche", marque: "Enseignement supérieur et recherche", annuaires: [], entete: "**{nom}** ({site})",
        pastilles: "toujours", commentaire: false, fiche: [...FICHE_DEFAUT.slice(0, 5), ["@region", "Région académique"], FICHE_DEFAUT[5]].map(([col, lib]) => ({ col, lib })),
        recherche: [], colonnes: {}, faitsFuturs: true, plusieursJours: true },
};
const SOURCES_ANNUAIRE = [{ cle: "en", nom: "Annuaire de l'éducation nationale" }, { cle: "esr", nom: "Établissements de l'enseignement supérieur (data.enseignementsup-recherche)" }];
const ENTETES = [["**{nom}**, **{commune}**", "Nom, commune"], ["**{nom}** ({site})", "Nom (site)"], ["**{nom}** ({commune})", "Nom (commune)"], ["**{nom}**", "Nom seul"], ["**{nom}** ({uai})", "Nom (UAI)"]];
const ROLES_ETAB = { nom: "Nom", uai: "UAI", commune: "Commune", type: "Type", academie: "Académie", departement: "Département", mail: "Mail" };
const ROLES_FICHE = { ...ROLES_ETAB, nom: "Établissement", region: "Région académique" };
const confSaisie = () => (courant && courant.conf.saisie) || {};
// version : réglée dans le formulaire, sinon celle du champ dont c'est la table (document à deux champs), sinon devinée
const espaceCourant = () => { try { return courant && window.Socle.espaceDeTable(window.Socle.general(socleConfig), courant.table); } catch (_) { return null; } };
const versionForm = () => PRESETS[confSaisie().version] ? confSaisie().version : espaceCourant() ? espaceCourant().version : (estEsr() ? "esr" : "en");
function saisieEff() {
  const v = versionForm(), c = confSaisie(), r = { ...copie(PRESETS[v]), version: v };
  if (typeof c.marque === "string" && c.marque.trim()) r.marque = c.marque.trim();
  if (Array.isArray(c.annuaires)) r.annuaires = c.annuaires;
  if (typeof c.entete === "string" && c.entete.trim()) r.entete = c.entete;
  if (c.pastilles) r.pastilles = c.pastilles;
  if (typeof c.commentaire === "boolean") r.commentaire = c.commentaire;
  if (typeof c.faitsFuturs === "boolean") r.faitsFuturs = c.faitsFuturs;
  if (typeof c.plusieursJours === "boolean") r.plusieursJours = c.plusieursJours;
  if (Array.isArray(c.fiche) && c.fiche.length) r.fiche = c.fiche;
  if (Array.isArray(c.recherche)) r.recherche = c.recherche;
  if (c.colonnes) r.colonnes = c.colonnes;
  return r;
}
// Modifie conf.saisie (la version est toujours écrite : le widget n'a plus à la deviner)
function majSaisie(f) {
  courant.conf.saisie = { ...confSaisie(), version: versionForm() };
  f(courant.conf.saisie);
  sauver();
}
// Même règle que le widget de saisie : les morceaux vides disparaissent (gras vide, parenthèses vides, virgule ou tiret orphelins)
function appliquerModele(modele, v) {
  let t = String(modele || "").replace(/\{([\w-]+)\}/g, (_, k) => String(v[k] ?? "").replace(/\s+/g, " ").trim());
  for (let i = 0; i < 3; i++) t = t.replace(/\*\*\s*\*\*/g, "").replace(/\(\s*\)|\[\s*\]/g, "")
    .replace(/\s*[,;·]\s*(?=$|[,;·])/g, "").replace(/\s+[–—-]\s*(?=$|[,;·–—-])/g, "").replace(/^\s*[,;·–—-]\s*/, "");
  return t.replace(/\s+([,;])/g, "$1").replace(/\s{2,}/g, " ").trim();
}
const identiteExemple = () => versionForm() === "esr"
  ? { nom: "Université de Rennes", commune: "Rennes", site: "Campus de Beaulieu", uai: "0352480A", academie: "Rennes", region: "Bretagne", departement: "Ille-et-Vilaine", type: "Université" }
  : { nom: "Collège Jean Rostand", commune: "Draguignan", site: "", uai: "0830001A", academie: "Nice", region: "Provence-Alpes-Côte d'Azur", departement: "Var", type: "Collège" };
// Région académique : colonne du référentiel, sinon déduite de l'académie (comme le widget de saisie)
const REGIONS_ACADEMIQUES = {
  "Auvergne-Rhône-Alpes": ["Clermont-Ferrand", "Grenoble", "Lyon"], "Bourgogne-Franche-Comté": ["Besançon", "Dijon"], "Bretagne": ["Rennes"],
  "Centre-Val de Loire": ["Orléans-Tours"], "Corse": ["Corse"], "Grand Est": ["Nancy-Metz", "Reims", "Strasbourg"], "Hauts-de-France": ["Amiens", "Lille"],
  "Île-de-France": ["Créteil", "Paris", "Versailles"], "Normandie": ["Normandie", "Caen", "Rouen"], "Nouvelle-Aquitaine": ["Bordeaux", "Limoges", "Poitiers"],
  "Occitanie": ["Montpellier", "Toulouse"], "Pays de la Loire": ["Nantes"], "Provence-Alpes-Côte d'Azur": ["Aix-Marseille", "Nice"],
  "Guadeloupe": ["Guadeloupe"], "Martinique": ["Martinique"], "Guyane": ["Guyane"], "La Réunion": ["La Réunion", "Réunion"], "Mayotte": ["Mayotte"],
};
const cleAcademie = a => normaliser(a).replace(/^academie\s+(de\s+la\s+|de\s+|d\s+)?/, "").replace(/[^a-z]+/g, " ").trim();
const REGION_PAR_ACADEMIE = new Map(Object.entries(REGIONS_ACADEMIQUES).flatMap(([r, l]) => l.map(a => [cleAcademie(a), r])));
function regionTest(e) {
  const c = colsEtabTest.region, v = c ? e[c] : null;
  if (v != null && v !== "" && typeof v !== "object") return String(v);
  return REGION_PAR_ACADEMIE.get(cleAcademie(colRole("academie") ? e[colRole("academie")] : "")) || "";
}
function valeursEtabTest(e) {
  const v = {};
  for (const [k, x] of Object.entries(e)) if (x != null && typeof x !== "object") v[k] = x;
  for (const k of Object.keys(ROLES_ETAB)) { const c = colRole(k); if (c && e[c] != null && typeof e[c] !== "object") v[k] = e[c]; }
  v.nom = nomEtab(e); v.region = regionTest(e);
  return v;
}
function ficheTestHtml() {
  if (!etabTest) return "";
  const e = etabTest;
  return saisieEff().fiche.map(f => {
    const cle = String(f.col || ""), lib = f.lib || (cle.startsWith("@") ? ROLES_FICHE[cle.slice(1)] : libelleColEtab(cle));
    let v = cle === "@region" ? regionTest(e) : e[cle.startsWith("@") ? colRole(cle.slice(1)) : cle];
    if (v == null || v === "" || typeof v === "object") return "";
    return `<dt>${esc(lib)}</dt><dd>${esc(valeurLisible({ type: typeof v === "number" ? "Numeric" : "Text" }, v))}</dd>`;
  }).join("");
}

/* ---------- panneau « Formulaire » : version et présentation ---------- */
function groupeVersionHtml() {
  if (courant.type !== "etablissement") return "";
  const o = saisieEff(), fixe = !!PRESETS[confSaisie().version], c = confSaisie();
  const parSite = modeleCourant() === "esr-sites";
  return `<div class="groupe"><div class="t">Modèle du formulaire</div>
    <div class="seg2" role="group" aria-label="Modèle du formulaire"><button type="button" data-modele="" aria-pressed="${!parSite}">Standard</button><button type="button" data-modele="esr-sites" aria-pressed="${parSite}">Enseignement supérieur par site</button></div>
    <p class="note" style="margin:0 0 4px">${parSite ? "Une ligne par site (reprise du dernier état connu de chaque site réglable, désactivée par défaut), qualification de l'établissement en bas, déduite du site le plus grave. Revenir au modèle standard garde la question des sites comme un tableau ordinaire (rien n'est supprimé)."
      : "« Enseignement supérieur par site » : une question tableau existante qui a un site et une qualification devient le tableau des sites ; sinon la question « Sites concernés » est créée, avec ses tables (référentiel des sites, correspondances, sous-table historisée)."}</p>
    <span class="statut" id="pv-modele-statut" role="status"></span>
  </div>
  <div class="groupe"><div class="t">Version et présentation</div>
    <div class="seg2" role="group" aria-label="Version du formulaire">${Object.entries(PRESETS).map(([k, p]) => `<button type="button" data-version="${k}" aria-pressed="${o.version === k}">${esc(p.libelle)}</button>`).join("")}</div>
    <p class="note" style="margin:0 0 8px">${fixe ? "" : "Déduite de la table, à confirmer. "}Choisir une version reprend ses réglages : bandeau, annuaires en ligne, en-tête de la description, fiche de l'établissement, choix multiples des tableaux.</p>
    <label class="l" for="pv-marque">Texte du bandeau</label><input type="text" id="pv-marque" value="${esc(c.marque || "")}" placeholder="${esc(PRESETS[o.version].marque)}">
    <label class="l" for="pv-pastilles">Choix multiples dans les tableaux</label>
    <select id="pv-pastilles"><option value="toujours"${o.pastilles === "toujours" ? " selected" : ""}>Toujours en pastilles</option><option value="auto"${o.pastilles !== "toujours" ? " selected" : ""}>Pastilles jusqu'à 8 choix, puis liste déroulante</option></select>
    <label class="interrupteur">Commentaire de mise à jour, saisi par l'agent <input type="checkbox" id="pv-commentaire"${o.commentaire ? " checked" : ""}${meta.Commentaire ? "" : " disabled"}></label>
    ${meta.Commentaire ? "" : `<p class="note" style="margin:0">Nécessite la colonne Commentaire (voir « Colonnes du questionnaire »).</p>`}
    <label class="interrupteur">Date des faits à venir admise (fermeture annoncée…) <input type="checkbox" id="pv-futurs"${o.faitsFuturs ? " checked" : ""}></label>
    <label class="interrupteur">Faits sur plusieurs jours (un signalement par jour) <input type="checkbox" id="pv-jours"${o.plusieursJours ? " checked" : ""}></label>
  </div>`;
}
// modèle d'un formulaire : « esr-sites » dès qu'une question tableau est réglée en tableau des sites
const modeleCourant = () => blocs().some(b => b.reglages && b.reglages.tableau && b.reglages.tableau.sites) ? "esr-sites" : "";
async function changerModele(v) {
  if (v === modeleCourant()) return;
  const st = $("pv-modele-statut"), dire = (t, err) => { if (st) { st.textContent = t; st.className = `statut${err ? " err" : " ok"}`; } };
  try {
    if (!v) {   // retour au modèle standard : réglages des sites retirés, la question reste un tableau ordinaire
      if (!confirm("Revenir au modèle standard ? La question des sites reste un tableau ordinaire (sans reprise du dernier état ni qualification déduite) ; aucune donnée n'est supprimée.")) return;
      blocs().forEach(b => { if (b.reglages && b.reglages.tableau) delete b.reglages.tableau.sites; });
      courant.conf.saisie = { ...(courant.conf.saisie || {}) }; delete courant.conf.saisie.qualificationEnBas;
      sauver(); dessinerApercu(); dessinerPanneau(); message("Modèle standard : pensez à publier.", "ok"); return;
    }
    // une question tableau dont la table a un site (référence ou texte) et une qualification : elle devient le tableau des sites
    const cand = blocs().filter(b => b.genre === "question" && b.reglages && b.reglages.tableau && b.reglages.tableau.table).map(b => {
      const cols = Object.values(colonnesDe(b.reglages.tableau.table)), t = (re, f) => (cols.find(c => f(c) && re.test(c.colId)) || cols.find(f) || {}).colId || null;
      return { b, site: t(/site/i, c => /^Ref:/.test(c.type) && c.type !== `Ref:${courant.table}` && c.colId !== "Version"),
        libre: t(/site|libre|nom/i, c => /^Text/.test(c.type) && !c.formule && !RESERVES_TABLEAU.includes(c.colId)), qualif: t(/qualif/i, c => /^Choice/.test(c.type) && !c.formule) };
    }).filter(x => (x.site || x.libre) && x.qualif);
    if (cand.length) {
      const x = cand[0];
      x.b.reglages.tableau.sites = { site: x.site, libre: x.libre, qualif: x.qualif, historique: [], alias: "Sites_correspondances" };
      courant.conf.saisie = { ...(courant.conf.saisie || {}), version: "esr", qualificationEnBas: true };
      sauver(); dessinerApercu(); choisir(x.b.id);
      message(`Modèle « enseignement supérieur par site » : la question « ${libelleQuestion(x.b.colonne)} » devient le tableau des sites (site : ${x.site || "—"}, hors référentiel : ${x.libre || "—"}, qualification : ${x.qualif}). Vérifiez ses réglages, puis publiez.`, "ok");
      return;
    }
    // un autre formulaire de la même table a déjà sa question des sites : même question, mêmes données
    for (const f of formulaires) {
      if (f.id === courant.id || f.table !== courant.table) continue;
      let c = null; try { c = JSON.parse(f.publie || f.brouillon || "null"); } catch (_) { c = null; }
      const b = c && (c.blocs || []).find(x => x.reglages && x.reglages.tableau && x.reglages.tableau.sites && meta[x.colonne]);
      if (!b) continue;
      const nb = JSON.parse(JSON.stringify(b)); nb.id = nouvelId(); nb.section = "q";
      blocs().push(nb);
      courant.conf.saisie = { ...(courant.conf.saisie || {}), version: "esr", qualificationEnBas: true };
      sauver(); dessinerApercu(); choisir(nb.id);
      message(`Modèle « enseignement supérieur par site » : question « ${libelleQuestion(nb.colonne)} » reprise du formulaire « ${f.nom} » (même table, mêmes données). Publiez pour l'utiliser.`, "ok");
      return;
    }
    dire("Création des tables et de la question des sites…");
    const r = await installerModeleSites();
    message(`Modèle « enseignement supérieur par site » : ${r}. Vérifiez les choix de qualification (du plus grave au moins grave), puis publiez.`, "ok");
  } catch (e) { dire(`Échec : ${e.message || e}`, true); }
}
function lierVersion(p) {
  p.querySelectorAll("[data-modele]").forEach(x => x.addEventListener("click", () => changerModele(x.dataset.modele)));
  p.querySelectorAll("[data-version]").forEach(x => x.addEventListener("click", () => {
    const c = confSaisie();
    if (c.version === x.dataset.version) return;
    // la nouvelle version reprend ses réglages ; colonnes du référentiel, recherche et commentaire sont conservés
    courant.conf.saisie = { version: x.dataset.version, ...(c.colonnes ? { colonnes: c.colonnes } : {}), ...(c.recherche ? { recherche: c.recherche } : {}),
      ...(typeof c.commentaire === "boolean" ? { commentaire: c.commentaire } : {}) };
    sauver(); dessinerApercu(); dessinerPanneau();
  }));
  const m = $("pv-marque");
  if (m) m.addEventListener("input", () => { majSaisie(c => { const v = m.value.trim(); if (v) c.marque = v; else delete c.marque; }); const a = $("marque-apercu"); if (a) a.textContent = saisieEff().marque; });
  if ($("pv-pastilles")) $("pv-pastilles").addEventListener("change", e => majSaisie(c => { c.pastilles = e.target.value; }));
  if ($("pv-commentaire")) $("pv-commentaire").addEventListener("change", e => { majSaisie(c => { c.commentaire = e.target.checked; }); dessinerApercu(); });
  [["pv-futurs", "faitsFuturs"], ["pv-jours", "plusieursJours"]].forEach(([id, k]) => { if ($(id)) $(id).addEventListener("change", e => { majSaisie(c => { c[k] = e.target.checked; }); dessinerApercu(); }); });
}

/* ---------- panneau « Établissement » : annuaires, colonnes du référentiel, fiche, recherche ---------- */
function optionsSourceFiche(sel) {
  const cols = colonnesEtabProposees(tableEtab());
  return `<optgroup label="Rôles reconnus">${Object.entries(ROLES_FICHE).map(([k, l]) => `<option value="@${k}"${sel === "@" + k ? " selected" : ""}>${esc(l)}${k === "region" ? " (colonne ou déduite de l'académie)" : ""}</option>`).join("")}</optgroup>` +
    `<optgroup label="Colonnes de ${esc(tableEtab() || "la table")}">${cols.map(c => `<option value="${esc(c.colId)}"${sel === c.colId ? " selected" : ""}>${esc(c.libelle)}</option>`).join("")}</optgroup>`;
}
function groupesEtabHtml() {
  const te = tableEtab(); if (!te) return "";
  const o = saisieEff(), c = confSaisie(), cols = colonnesEtabProposees(te);
  if (!colsEtabTest.nom && !colsEtabTest.uai) devinerColsEtab();
  const texte = cols.filter(x => ["Text", "Choice", "Any"].includes(typeBase(x.type)));
  return `<div class="groupe"><div class="t">Annuaires en ligne</div>
      <p class="note" style="margin:0 0 6px">Consultés quand l'établissement n'est pas dans le référentiel ; celui qui est choisi y est alors ajouté.</p>
      ${SOURCES_ANNUAIRE.map(x => `<label class="interrupteur">${esc(x.nom)} <input type="checkbox" data-annuaire="${x.cle}"${o.annuaires.includes(x.cle) ? " checked" : ""}></label>`).join("")}
      ${o.annuaires.length ? "" : `<p class="note" style="margin:0">Aucun : la recherche porte uniquement sur la table ${esc(te)}.</p>`}</div>
    <div class="groupe"><div class="t">Colonnes du référentiel</div>
      <p class="note" style="margin:0 0 6px">« Automatique » : le widget reconnaît la colonne d'après son nom ou, pour l'UAI, son contenu.</p>
      ${Object.entries(ROLES_ETAB).map(([k, l]) => `<div class="reglage-q"><div><span>${esc(l)}</span><select data-role-col="${k}" aria-label="Colonne ${esc(l)}">` +
        `<option value="">Automatique${colsEtabTest[k] ? ` (${esc(libelleColEtab(colsEtabTest[k]))})` : ""}</option>${cols.map(x => `<option value="${esc(x.colId)}"${(c.colonnes || {})[k] === x.colId ? " selected" : ""}>${esc(x.libelle)}</option>`).join("")}</select></div></div>`).join("")}</div>
    <div class="groupe"><div class="t">Fiche de l'établissement</div>
      <p class="note" style="margin:0 0 6px">Informations affichées par « Voir la fiche », dans cet ordre ; les champs texte sont modifiables par « Corriger la fiche ».</p>
      <div id="pe-fiche">${o.fiche.map((f, i) => `<div class="fiche-edit" data-i="${i}">
        <span class="ordre-sc" style="display:inline-flex;flex-direction:column"><button type="button" class="icone" data-fiche="haut"${i === 0 ? " disabled" : ""} aria-label="Monter">↑</button><button type="button" class="icone" data-fiche="bas"${i === o.fiche.length - 1 ? " disabled" : ""} aria-label="Descendre">↓</button></span>
        <input type="text" class="pe-lib" value="${esc(f.lib || "")}" aria-label="Libellé affiché" placeholder="Libellé"><select class="pe-col" aria-label="Information">${optionsSourceFiche(f.col)}</select>
        <button type="button" class="icone" data-fiche="suppr" aria-label="Retirer ${esc(f.lib || f.col)}">✕</button></div>`).join("")}</div>
      <button type="button" class="ajout-lien" id="pe-ajout">+ Ajouter une information</button>
      ${Array.isArray(c.fiche) ? ` · <button type="button" class="ajout-lien" id="pe-defaut">Revenir à la fiche de la version</button>` : ""}</div>
    <div class="groupe"><div class="t">Recherche aussi dans</div>
      <p class="note" style="margin:0 0 6px">Le nom, la commune et l'UAI sont toujours consultés${versionForm() === "esr" ? ", ainsi que Sigle et Noms_rencontres_dans_les_sources s'ils existent" : ""}.</p>
      <div class="liste-choix-cols">${texte.map(x => `<label class="interrupteur">${esc(x.libelle)} <input type="checkbox" data-recherche="${esc(x.colId)}"${o.recherche.includes(x.colId) ? " checked" : ""}></label>`).join("") || `<p class="note">Aucune colonne texte.</p>`}</div></div>`;
}
function lierEtab(p) {
  const redessiner = () => { dessinerPanneau(); if (modeTest) majEtabTest(); };
  p.querySelectorAll("[data-annuaire]").forEach(x => x.addEventListener("change", () => {
    majSaisie(c => { c.annuaires = [...p.querySelectorAll("[data-annuaire]:checked")].map(i => i.dataset.annuaire); }); redessiner();
  }));
  p.querySelectorAll("[data-role-col]").forEach(x => x.addEventListener("change", () => {
    majSaisie(c => { const m = { ...(c.colonnes || {}) }; if (x.value) m[x.dataset.roleCol] = x.value; else delete m[x.dataset.roleCol]; if (Object.keys(m).length) c.colonnes = m; else delete c.colonnes; });
    if (modeTest) majEtabTest();
  }));
  p.querySelectorAll("[data-recherche]").forEach(x => x.addEventListener("change", () => {
    majSaisie(c => { c.recherche = [...p.querySelectorAll("[data-recherche]:checked")].map(i => i.dataset.recherche); });
  }));
  const lire = () => [...p.querySelectorAll("#pe-fiche .fiche-edit")].map(d => ({ col: d.querySelector(".pe-col").value, lib: d.querySelector(".pe-lib").value.trim() }));
  const ecrire = l => { majSaisie(c => { c.fiche = l; }); redessiner(); };
  p.querySelectorAll("#pe-fiche .fiche-edit").forEach(d => {
    d.querySelector(".pe-lib").addEventListener("change", () => majSaisie(c => { c.fiche = lire(); }));
    d.querySelector(".pe-col").addEventListener("change", e => {
      const l = lire(), i = +d.dataset.i, v = e.target.value;
      l[i].lib = v.startsWith("@") ? ROLES_FICHE[v.slice(1)] : libelleColEtab(v);   // libellé repris de l'information choisie
      ecrire(l);
    });
    d.querySelectorAll("[data-fiche]").forEach(b => b.addEventListener("click", () => {
      const l = lire(), i = +d.dataset.i, a = b.dataset.fiche;
      if (a === "suppr") { l.splice(i, 1); if (!l.length) { majSaisie(c => { delete c.fiche; }); redessiner(); return; } }
      else { const j = a === "haut" ? i - 1 : i + 1; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; }
      ecrire(l);
    }));
  });
  if ($("pe-ajout")) $("pe-ajout").addEventListener("click", () => {
    const l = lire(), pris = new Set(l.map(x => x.col)), libre = colonnesEtabProposees(tableEtab()).find(x => !pris.has(x.colId));
    l.push(libre ? { col: libre.colId, lib: libre.libelle } : { col: "@mail", lib: "Mail" }); ecrire(l);
  });
  if ($("pe-defaut")) $("pe-defaut").addEventListener("click", () => { majSaisie(c => { delete c.fiche; }); redessiner(); });
}

/* ---------- panneau « Description » : en-tête ---------- */
function groupeEnteteHtml() {
  const o = saisieEff(), connu = ENTETES.some(([m]) => m === o.entete), ex = identiteExemple();
  return `<div class="groupe"><div class="t">En-tête de la description</div>
    <label class="l" for="pd-entete">Format${descPerso() || optionsDescription().entete ? "" : " (l'en-tête est désactivé dans les réglages)"}</label>
    <select id="pd-entete">${ENTETES.map(([m, l]) => `<option value="${esc(m)}"${o.entete === m ? " selected" : ""}>${esc(l)} : ${esc(appliquerModele(m, ex).replace(/\*\*/g, ""))}</option>`).join("")}<option value="__perso__"${connu ? "" : " selected"}>Personnalisé…</option></select>
    <input type="text" id="pd-entete-perso" value="${esc(o.entete)}" spellcheck="false" aria-label="Modèle d'en-tête"${connu ? " hidden" : ""}>
    <p class="note" style="margin:0">Repères : {nom}, {commune}, {uai}, {type}, {academie}, {departement}, {region}, {site}, ou l'identifiant d'une colonne du référentiel, par exemple {Sigle}. ** met en gras ; un repère vide disparaît avec ses parenthèses ou sa virgule.</p></div>`;
}
function lierEntete(p, maj) {
  const sel = $("pd-entete"), perso = $("pd-entete-perso"); if (!sel) return;
  const ecrire = v => { majSaisie(c => { if (v && v !== PRESETS[versionForm()].entete) c.entete = v; else delete c.entete; }); maj(); };
  sel.addEventListener("change", () => {
    if (sel.value === "__perso__") { perso.hidden = false; perso.focus(); return; }
    perso.hidden = true; perso.value = sel.value; ecrire(sel.value);
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
  const prises = new Set([courant.table, tableEtab(), TABLE_FORMULAIRES].filter(Boolean));
  return tables.filter(t => !prises.has(t)).sort((a, b) => a.localeCompare(b, "fr"));
}
function analyserTableLignes(tid) {
  const cols = colonnesDe(tid), l = Object.values(cols);
  const ref = `Ref:${courant.table}`;
  const d = cols.Dossier;
  let erreur = "";
  if (d && d.type !== ref) erreur = `Sa colonne « Dossier » renvoie vers ${String(d.type).replace(/^Ref:/, "la table ")} et non vers ${courant.table} : renommez-la dans Grist, ou choisissez une autre table.`;
  const colDossier = d && d.type === ref ? "Dossier" : ((l.find(c => c.type === ref) || {}).colId || null);
  const ligne = !!cols.Ligne_id, ordre = !!cols.Ordre;
  const autres = blocs().filter(b => b.reglages && b.reglages.tableau && b.reglages.tableau.table === tid).map(b => libelleQuestion(b.colonne));
  if (!erreur && autres.length) erreur = `Elle est déjà utilisée par la question « ${autres[0]} » de ce formulaire.`;
  const champs = sousColonnes(tid).filter(c => c.colId !== colDossier);
  const manquantes = [!colDossier && "Dossier (référence vers " + courant.table + ")", !ligne && "Ligne_id", !ordre && "Ordre"].filter(Boolean);
  const html = erreur ? esc(erreur) : [
    `Champs de chaque ligne : ${champs.length ? champs.map(c => esc(c.libelle)).join(", ") : "aucun pour l'instant (ajoutez-les ensuite dans le panneau)"}.`,
    colDossier ? `Lien vers le dossier : colonne ${esc(colDossier)}.` : "",
    manquantes.length ? `Colonne${manquantes.length > 1 ? "s" : ""} ajoutée${manquantes.length > 1 ? "s" : ""} à la table : ${esc(manquantes.join(", "))}.` : "",
    colDossier ? "Les lignes déjà rattachées à un dossier seront reprises dans ses réponses." : "",
  ].filter(Boolean).join(" ");
  return { erreur, colDossier, ligne, ordre, html };
}
async function reprendreLignesExistantes(tid, colJson, colDos) {
  const t = await grist.docApi.fetchTable(tid), rep = await grist.docApi.fetchTable(courant.table);
  if (!t[colDos]) return { lignes: 0, dossiers: 0 };
  const champs = sousColonnes(tid).filter(c => c.colId !== colDos && !c.r.confidentiel);   // confidentiels : restent dans la table seulement
  const num = v => typeof v === "number" ? v : (Array.isArray(v) && v[0] === "R" ? v[2] : 0);
  const parDossier = new Map(), acts = [];
  t.id.forEach((id, i) => {
    const d = num(t[colDos][i]); if (!d) return;
    let lid = t.Ligne_id ? t.Ligne_id[i] : null;
    if (!lid) { lid = "l" + id.toString(36) + Math.random().toString(36).slice(2, 8); acts.push(["UpdateRecord", tid, id, { Ligne_id: lid }]); }
    const o = { _id: lid };
    for (const c of champs) {
      let v = t[c.colId] ? t[c.colId][i] : null;
      if (Array.isArray(v) && v[0] === "L") v = v.slice(1);
      if (v === "" || v == null || (Array.isArray(v) && !v.length) || (typeBase(c.type) === "Ref" && !v)) continue;
      o[c.colId] = v;
    }
    if (!parDossier.has(d)) parDossier.set(d, []);
    parDossier.get(d).push({ o, rang: t.Ordre && t.Ordre[i] != null ? t.Ordre[i] : 1e9, id });
  });
  // dernière étape de chaque dossier : faits les plus récents, puis saisie la plus récente, puis numéro de ligne
  const cle = i => [rep.Date_faits ? +rep.Date_faits[i] || 0 : 0, rep.Date ? +rep.Date[i] || 0 : 0, rep.id[i]];
  const plus = (x, y) => x[0] !== y[0] ? x[0] > y[0] : x[1] !== y[1] ? x[1] > y[1] : x[2] > y[2];
  const derniere = new Map();
  rep.id.forEach((id, i) => { const d = num(rep.Dossier ? rep.Dossier[i] : 0) || id; const p = derniere.get(d); if (p == null || plus(cle(i), cle(p))) derniere.set(d, i); });
  let lignes = 0, dossiers = 0;
  for (const [d, l] of parDossier) {
    const i = derniere.get(d); if (i == null) continue;
    l.sort((a, b) => (a.rang - b.rang) || (a.id - b.id));
    acts.push(["UpdateRecord", courant.table, rep.id[i], { [colJson]: JSON.stringify(l.map(x => x.o)) }]);
    lignes += l.length; dossiers++;
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
const referentielDe = tid => { const id = colEtabDe(tid), c = id && colonnesDe(tid)[id]; const m = c && String(c.type).match(/^Ref:(.+)$/); return m ? m[1] : null; };
function colUaiDe(tid) {
  const m = colonnesDe(tid);
  return m.UAI ? "UAI" : trouverColEtab(m, [/(^|_)(uai|rne)(_|$)/, /uai|rne/], /tutelle|siege|parent/);
}
function colNomDe(tid) {
  const m = colonnesDe(tid);
  return m.Nom ? "Nom" : trouverColEtab(m, [/(^|_)nom(_|$)/, /appellation|denomination|libelle|intitule/], /commune|ville|academi|departement|region|type|sigle|uai/);
}
async function analyserReferentiel(tid, choix) {
  const creer = choix === "__creer__", cible = creer ? "Etablissements" : choix;
  const cols = colonnesDe(tid), colE = colEtabDe(tid), c = colE ? cols[colE] : (cols.Etablissement || null), actuelle = referentielDe(tid);
  if (c && !actuelle) return { erreur: `La colonne ${c.colId} de ${tid} n'est pas une référence (type ${c.type}) : changez son type dans Grist.`, texte: "" };
  if (!c) return { tid, cible, creer, action: "creer", texte: `Une colonne Etablissement (référence vers ${cible}) sera ajoutée à la table ${tid}.` };
  const col = c.colId;
  if (actuelle === cible) return { tid, cible, action: "rien", texte: `Référentiel actuel de la table ${tid}${col !== "Etablissement" ? ` (colonne ${col})` : ""}.` };
  const rep = await grist.docApi.fetchTable(tid);
  const lignes = rep.id.map((id, i) => ({ id, e: rep[col][i] })).filter(x => x.e);
  if (!lignes.length) return { tid, cible, creer, col, action: "changer", maj: [], texte: `La table ${tid} passera du référentiel ${actuelle} à ${cible} (aucun signalement à rattacher).` };
  if (creer) return { erreur: `${lignes.length} signalement(s) sont rattachés à ${actuelle} : choisissez un référentiel existant qui contient leurs établissements.`, texte: "" };
  const uA = colUaiDe(actuelle), uC = colUaiDe(cible);
  if (!uA || !uC) return { erreur: `Colonne UAI introuvable dans ${!uA ? actuelle : cible} : impossible de retrouver les établissements des ${lignes.length} signalement(s) déjà saisis.`, texte: "" };
  const [ta, tc] = await Promise.all([grist.docApi.fetchTable(actuelle), grist.docApi.fetchTable(cible)]);
  const cle = v => String(v ?? "").trim().toUpperCase();
  const uaiAncien = new Map(ta.id.map((id, i) => [id, cle(ta[uA][i])]));
  const parUai = new Map(); tc.id.forEach((id, i) => { const k = cle(tc[uC][i]); if (k && !parUai.has(k)) parUai.set(k, id); });
  const nA = colNomDe(actuelle), nomAncien = id => { const i = ta.id.indexOf(id); return i >= 0 && nA ? ta[nA][i] : `n° ${id}`; };
  const maj = [], absents = new Map();
  for (const l of lignes) {
    const u = uaiAncien.get(l.e), n = u ? parUai.get(u) : null;
    if (n) maj.push([l.id, n]); else absents.set(l.e, `${nomAncien(l.e)}${u ? ` (${u})` : " (sans UAI)"}`);
  }
  if (absents.size) return { erreur: `${absents.size} établissement(s) des signalements déjà saisis sont introuvables dans ${cible} par leur UAI : ${[...absents.values()].slice(0, 5).join(", ")}${absents.size > 5 ? "…" : ""}. Ajoutez-les à ${cible}, ou gardez le référentiel ${actuelle}.`, texte: "" };
  return { tid, cible, col, action: "changer", maj, texte: `La table ${tid} passera du référentiel ${actuelle} à ${cible} : ${maj.length} signalement(s) rattachés d'après leur UAI, tous retrouvés.` };
}
async function appliquerReferentiel(tid, a) {
  if (!a || a.action === "rien") return;
  if (a.creer && !metaTables[0].tableId.includes("Etablissements"))
    await actions([["AddTable", "Etablissements", ["Nom", "UAI", "Type", "Academie", "Departement", "Commune", "Mail"].map(id => ({ id, type: "Text", isFormula: false }))
      .concat([{ id: "UUID", type: "Text", isFormula: false, formula: "UUID()" }])]]);
  if (a.action === "creer") await actions([["AddColumn", tid, "Etablissement", { type: `Ref:${a.cible}`, isFormula: false, label: "Établissement" }]]);
  else {
    const col = a.col || "Etablissement";
    const acts = [["ModifyColumn", tid, col, { type: `Ref:${a.cible}` }], ...(a.maj || []).map(([id, e]) => ["UpdateRecord", tid, id, { [col]: e }])];
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
let socleConfig = null, socleGeneral = { ...window.Socle.DEFAUTS_GENERAL }, demarre = false;
async function lireSocle() {
  try { socleConfig = await window.Socle.lireConfig(); } catch (_) { socleConfig = null; }
  socleGeneral = window.Socle.general(socleConfig);
  TABLE_FORMULAIRES = socleGeneral.formulaires || "Formulaires";
}
async function afficher() {
  if (demarre) { await lireSocle(); await lirePagesSaisie(); if (courant) dessinerPanneau(); return; }
  demarre = true;
  await lireSocle();
  try {
    await lireMeta();
    await Promise.all([lireFormulaires(), lireReglagesCommuns(), lirePagesSaisie()]);
    if (formulaires.length) charger(formulaires[0]);
    remplirChoixFormulaire(); dessinerApercu(); dessinerPanneau();
  } catch (e) {
    accesOk = false;
    $("apercu").innerHTML = `<div class="accueil"><h2>Accès insuffisant</h2><p class="note">Ce widget doit être réglé sur « Accès complet » au document (panneau de droite, « Accès »). ${esc(e.message || e)}</p></div>`;
  }
}
// Une autre personne a modifié la table des formulaires (ou la structure) : relecture si rien n'est sélectionné
grist.onRecords(() => {}, { includeColumns: "normal" });
window.OngletFormulaires = { afficher };

})();
