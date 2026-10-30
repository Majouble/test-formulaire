/* =====================================================================
   Moteur du point de situation (v2) : lecture des champs, conditions, tri, assemblage, rendu HTML et Word.
   Partagé par le widget du point de situation et l'aperçu de l'administration. Fonctions globales.
   ===================================================================== */
/* ===================== Assemblage du point de situation (commun widget / n8n) =====================
   Entrée : une « source » qui sait lire les tables Grist :
     source.table(nom)  -> { lignes: [{id, Col: valeur…}], parId: Map }   (valeurs déjà décodées)
     source.types(nom)  -> { Col: "Ref:Table" | "Text" | … }
   Configuration (tables du document) :
     Colonnes_point : Ordre, Titre, Contenu, Largeur, Couleur, Fusionner, Tableaux, Actif
     Sections_point : Ordre, Titre, Condition, Actif
     Réglages       : table, dossier, date, dateFaits, nature, tri, depuis, dernierPoint, academie, champAcademie
*/
const DEFAUT_COLONNES = [
  { Ordre: 1, Titre: "Académie", Contenu: "**{Etablissement.Academie}**\n{Etablissement.Departement}", Largeur: 14, Couleur: "17877A", Fusionner: true, Tableaux: "", Actif: true },
  { Ordre: 2, Titre: "Établissement", Contenu: "**{Etablissement.Nom}**\n{Etablissement.Commune}\n{nouveau}", Largeur: 30, Couleur: "17877A", Fusionner: false, Tableaux: "", Actif: true },
  { Ordre: 3, Titre: "Actions", Contenu: "{Qualification}", Largeur: 14, Couleur: "B2C6BD", Fusionner: false, Tableaux: "", Actif: true },
  { Ordre: 4, Titre: "Suites", Contenu: "{Suites}", Largeur: 10, Couleur: "B2C6BD", Fusionner: false, Tableaux: "", Actif: true },
  { Ordre: 5, Titre: "Synthèse", Contenu: "{Description|sans_entete}", Largeur: 32, Couleur: "17877A", Fusionner: false, Tableaux: "", Actif: true },
];
const DEFAUT_SECTIONS = [
  { Ordre: 1, Titre: "Violences signalées", Condition: "Violences = Oui", Actif: true },
  { Ordre: 2, Titre: "Etat des mobilisations", Condition: "", Actif: true },
];
const DEFAUT_TRI = "Etablissement.Academie, Etablissement.Departement, Etablissement.Nom";

/* ---------- lecture des champs, y compris à travers les références (Etablissement.Academie) ---------- */
async function creerLecteur(source, tableBase) {
  const manquants = new Set(), alias = {}, cacheNoms = {};
  // correspondance « nom écrit » -> identifiant de colonne : identifiant exact, sinon identifiant ou libellé
  // sans tenir compte des accents ni des majuscules (« Grève » -> Greve)
  async function nomsDe(t) {
    if (!cacheNoms[t]) {
      const ty = await source.types(t), lb = source.libelles ? await source.libelles(t) : {}, m = new Map();
      for (const c of Object.keys(ty)) if (!m.has(normal(c))) m.set(normal(c), c);
      for (const [c, l] of Object.entries(lb || {})) if (l && !m.has(normal(l))) m.set(normal(l), c);
      cacheNoms[t] = m;
    }
    return cacheNoms[t];
  }
  async function resoudre(t, morceau) {
    const ty = await source.types(t);
    if (morceau in ty || morceau === "id") return morceau;
    return (await nomsDe(t)).get(normal(morceau)) || morceau;
  }
  async function prechargerChemin(chemin) {
    let t = tableBase;
    const morceaux = chemin.split("."), reel = [];
    for (const brut of morceaux.slice(0, -1)) {
      const morceau = await resoudre(t, brut.trim()); reel.push(morceau);
      const type = (await source.types(t))[morceau] || "";
      const cible = (type.match(/^Ref(?:List)?:(.+)$/) || [])[1];
      if (!cible) { manquants.add(chemin); return; }
      await source.table(cible); t = cible;
    }
    const der = await resoudre(t, morceaux[morceaux.length - 1].trim()), types = await source.types(t);
    reel.push(der); alias[chemin] = reel.join(".");
    if (!(der in types) && der !== "id") manquants.add(chemin);
    // le champ final est lui-même une référence : charger la table visée pour afficher son libellé
    const cibleFinale = ((types[der] || "").match(/^Ref(?:List)?:(.+)$/) || [])[1];
    if (cibleFinale) await source.table(cibleFinale);
  }
  // lecture synchrone une fois les tables chargées
  const cacheTypes = {}, cacheAff = {};
  async function preparer(chemins) {
    for (const c of new Set(chemins)) if (c) await prechargerChemin(c);
    for (const t of [...Object.keys(source._charge || {}), tableBase]) {
      cacheTypes[t] = await source.types(t);
      cacheAff[t] = source.affichage ? await source.affichage(t) : {};
    }
  }
  // valeur affichée d'une colonne Référence : colonne d'affichage de Grist, sinon colonne visible, sinon premier texte
  function afficher(t, col, val, ligne) {
    // pièces jointes : leur nombre (les fichiers restent dans Grist)
    if (/^Attachments/.test((cacheTypes[t] || {})[col] || "")) { const l = Array.isArray(val) ? val.filter(x => typeof x === "number") : []; return l.length ? `${l.length} pièce${l.length > 1 ? "s" : ""} jointe${l.length > 1 ? "s" : ""}` : ""; }
    const cible = (((cacheTypes[t] || {})[col] || "").match(/^Ref(?:List)?:(.+)$/) || [])[1];
    if (!cible) return val;
    const inf = (cacheAff[t] || {})[col] || {};
    if (inf.display && ligne && ligne[inf.display] != null && ligne[inf.display] !== "") return ligne[inf.display];
    const tb = source._charge[cible];
    if (!tb) return val;
    const vis = inf.visible || Object.entries(cacheTypes[cible] || {}).find(([c, ty]) => !/^gristHelper|^manualSort$/.test(c) && /^(Text|Choice)/.test(ty))?.[0];
    const un = id => { const r = tb.parId.get(id); return r ? afficher(cible, vis, r[vis], r) : ""; };
    return Array.isArray(val) ? val.map(un) : (val ? un(val) : "");
  }
  function lire(ligne, chemin) {
    let t = tableBase, v = ligne;
    const morceaux = (alias[chemin] || chemin).split(".");
    for (let i = 0; i < morceaux.length; i++) {
      if (v == null) return "";
      const val = v[morceaux[i]];
      if (i === morceaux.length - 1) return afficher(t, morceaux[i], val, v);
      const type = (cacheTypes[t] || {})[morceaux[i]] || "";
      const cible = (type.match(/^Ref(?:List)?:(.+)$/) || [])[1];
      if (!cible) return "";
      const tb = source._charge[cible];
      if (Array.isArray(val)) return val.map(id => { const r = tb.parId.get(id); return r ? afficher(cible, morceaux[i + 1], r[morceaux[i + 1]], r) : null; }).filter(x => x != null); // RefList : un niveau
      v = tb.parId.get(val); t = cible;
    }
    return v;
  }
  // liste des choix Grist de la colonne visée par un chemin (pour « Ordre des choix »)
  function choix(chemin) {
    let t = tableBase; const m = (alias[chemin] || chemin).split(".");
    for (let i = 0; i < m.length - 1; i++) {
      const cible = (((cacheTypes[t] || {})[m[i]] || "").match(/^Ref(?:List)?:(.+)$/) || [])[1];
      if (!cible) return [];
      t = cible;
    }
    let col = m[m.length - 1];
    const inf = (cacheAff[t] || {})[col] || {};
    if (inf.choices && inf.choices.length) return inf.choices;
    // référence : ordre des lignes de la table visée
    const cible = (((cacheTypes[t] || {})[col] || "").match(/^Ref(?:List)?:(.+)$/) || [])[1];
    if (cible && source._charge[cible]) {
      const tb = source._charge[cible], vis = inf.visible || Object.entries(cacheTypes[cible] || {}).find(([c, ty]) => !/^gristHelper|^manualSort$/.test(c) && /^(Text|Choice)/.test(ty))?.[0];
      return [...tb.lignes].sort((a, b) => (a.manualSort ?? a.id) - (b.manualSort ?? b.id)).map(r => r[vis]);
    }
    return [];
  }
  return { preparer, lire, choix, manquants };
}

/* ---------- mise en forme des valeurs ---------- */
function texteValeur(v) {
  if (v == null || v === false) return "";
  if (v === true) return "Oui";
  if (Array.isArray(v)) return v.map(texteValeur).filter(Boolean).join(", ");
  if (v instanceof Date) return v.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
  return String(v);
}
const FILTRES = {
  sans_entete: s => s.replace(/^\s*\*\*[^*]+\*\*\s*,\s*\*\*[^*]+\*\*\s*:\s*/, "").replace(/^(==|\*\*)?(\p{Ll})/u, (m, a, l) => (a || "") + l.toUpperCase()),
  majuscules: s => s.toUpperCase(),
  date: s => s.split(" ")[0],
  heure: s => (s.split(" ")[1] || "").replace(":", "h"),
};
// "**{Etablissement.Nom}**\n{Etablissement.Commune}" -> texte balisé (** gras, == surligné), lignes vides retirées
function remplir(modele, ligne, lecteur, extra) {
  const lignes = String(modele || "").split(/\n|\\n/).map(l => l.replace(/\{([^{}|]+)(?:\|([^{}]+))?\}/g, (m, chemin, filtres) => {
    chemin = chemin.trim();
    let s = chemin in extra ? extra[chemin] : texteValeur(lecteur.lire(ligne, chemin));
    for (const f of (filtres || "").split("|").map(x => x.trim()).filter(Boolean)) if (FILTRES[f]) s = FILTRES[f](s);
    return s;
  }));
  return lignes.filter(l => l.replace(/\*\*|==/g, "").trim()).join("\n");
}
/* Texte balisé -> lignes de segments [{t, g, s}] (g : gras, s : mis en évidence).
   Les ==…== peuvent venir de deux sources qui se chevauchent (ajouts repérés par la formule de la description, et
   changements de qualification écrits par le widget : « RAS → ==Blocage== »), et un ajout peut couvrir plusieurs lignes.
   Chaque « == » ouvre donc (après une espace, un retour à la ligne ou le début) ou ferme (après un caractère) une mise en
   évidence imbriquable ; une fermeture sans ouverture en cours compte comme une ouverture ; « ==== » ne laisse rien ouvert.
   La mise en évidence se poursuit d'une ligne à l'autre ; le gras reste limité à sa ligne. */
function segmentsLignes(texte) {
  const lignes = []; let out = [], g = false, prof = 0, buf = "";
  const pousser = () => { if (buf) { out.push({ t: buf, g, s: prof > 0 }); buf = ""; } };
  texte = String(texte ?? "");
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i], d = texte.slice(i, i + 2);
    if (c === "\n") { pousser(); lignes.push(out); out = []; g = false; continue; }
    if (d === "**") { pousser(); g = !g; i++; continue; }
    if (d === "==") {
      pousser();
      const avant = i > 0 ? texte[i - 1] : " ";
      if (avant === "=") { if (prof > 0) prof--; }          // second « == » collé au précédent
      else if (/\s/.test(avant)) prof++;                     // « … ==mot » : ouverture
      else prof > 0 ? prof-- : prof++;                       // « mot== » : fermeture
      i++; continue;
    }
    buf += c;
  }
  pousser(); lignes.push(out); return lignes;
}
function segments(texte) { return segmentsLignes(texte).flat(); }   // texte d'une seule ligne

/* ---------- conditions de section : « Violences = Oui », « Interpellations > 0 et Suites contient plainte » ---------- */
function normal(v) { return String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim(); }
// « Champ opérateur valeur » ; le champ peut être un identifiant (Greve) ou un libellé (Grève), avec des espaces
function analyserCondition(c) {
  const m = String(c).replace(/[’‘]/g, "'").match(/^\s*(.+?)\s*(?:(!=|≠|>=|<=|=|>|<)|\s(ne contient pas|contient|n'est pas vide|est vide|non vide|vide))\s*(.*)$/iu);
  if (!m) return null;
  let op = (m[2] || m[3]).toLowerCase();
  if (op === "≠") op = "!="; if (op === "non vide") op = "n'est pas vide"; if (op === "vide") op = "est vide";
  return { chemin: m[1].trim().replace(/^["'«“]\s*|\s*["'»”]$/g, ""), op, brut: m[4] || "" };
}
const morceauxCondition = cond => String(cond || "").split(/\s+ou\s+/i).flatMap(b => b.split(/\s+et\s+/i)).map(analyserCondition).filter(Boolean);
function testerCondition(cond, ligne, lecteur) {
  if (!cond || !cond.trim()) return true;
  return cond.split(/\s+ou\s+/i).some(bloc => bloc.split(/\s+et\s+/i).every(c => {
    const a = analyserCondition(c);
    if (!a) return false;
    const { chemin, op, brut } = a, v = lecteur.lire(ligne, chemin), attendu = normal(brut.replace(/^["'«“]\s*|\s*["'»”]$/g, ""));
    const vals = Array.isArray(v) ? v.map(normal) : [normal(v === true ? "oui" : v === false ? "non" : v instanceof Date ? v.toISOString() : v)];
    const vide = vals.every(x => !x || x === "non" || x === "0");
    const oui = x => ["oui", "vrai", "true", "1"].includes(x);
    switch (op) {
      case "=": return oui(attendu) ? vals.some(oui) : (attendu === "non" ? vide : vals.includes(attendu));
      case "!=": return oui(attendu) ? !vals.some(oui) : !vals.includes(attendu);
      case ">": return Number(v) > Number(brut); case "<": return Number(v) < Number(brut);
      case ">=": return Number(v) >= Number(brut); case "<=": return Number(v) <= Number(brut);
      case "contient": return vals.some(x => x.includes(attendu));
      case "ne contient pas": return !vals.some(x => x.includes(attendu));
      case "est vide": return vide;
      case "n'est pas vide": return !vide;
    }
    return false;
  }));
}

/* ---------- surlignage des changements depuis le dernier point ----------
   La formule de la description (Description_Word_) marque ce qu'apporte chaque version par rapport à la précédente :
   entre deux points, seule la dernière mise à jour ressortirait, et une mise à jour déjà diffusée ressortirait encore.
   Ici, chaque cellule est comparée mot à mot à ce qu'elle était dans la version du dossier en vigueur au dernier
   point (dernière version saisie avant lui) : seuls les mots ajoutés depuis sont surlignés. */
const JETONS_PS = /\*\*|\n|[^\S\n]+|[\p{L}\p{N}_]+|[^\p{L}\p{N}_\s]/gu;
const BORD_PS = " \t,.;:!?)(«»\"'’-–—";
const sansMarques = s => String(s ?? "").replace(/==/g, "");
function marquerAjouts(avant, apres) {
  const a = String(avant).match(JETONS_PS) || [], b = String(apres).match(JETONS_PS) || [];
  if (!b.length) return "";
  if (a.length * b.length > 4e6) return apres;   // texte démesuré : pas de surlignage plutôt qu'un calcul trop long
  // plus longue sous-suite commune, puis jetons de « b » absents de « a »
  const n = a.length, m = b.length, L = new Uint32Array((n + 1) * (m + 1)), w = m + 1;
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    L[i * w + j] = a[i] === b[j] ? L[(i + 1) * w + j + 1] + 1 : Math.max(L[(i + 1) * w + j], L[i * w + j + 1]);
  const ajoute = new Array(m).fill(true);
  for (let i = 0, j = 0; i < n && j < m;) {
    if (a[i] === b[j]) { ajoute[j] = false; i++; j++; }
    else if (L[(i + 1) * w + j] >= L[i * w + j + 1]) i++; else j++;
  }
  // regroupement : une suite de jetons ajoutés est entourée de ==, ponctuation et espaces en bordure laissés dehors,
  // ** (gras) et retours à la ligne coupent la suite
  const sortie = []; let groupe = [];
  const fermer = () => {
    if (!groupe.length) return;
    const t = groupe.join(""); groupe = [];
    let d = 0, f = t.length;
    while (d < f && BORD_PS.includes(t[d])) d++;
    while (f > d && BORD_PS.includes(t[f - 1])) f--;
    sortie.push(d < f ? `${t.slice(0, d)}==${t.slice(d, f)}==${t.slice(f)}` : t);
  };
  b.forEach((x, j) => {
    if (x === "**" || x === "\n" || !ajoute[j]) { fermer(); sortie.push(x); }
    else groupe.push(x);
  });
  fermer();
  return sortie.join("");
}

/* ---------- assemblage ---------- */
function actifs(liste) { return liste.filter(x => x.Actif !== false && x.Actif !== 0).sort((a, b) => (Number(a.Ordre) || 0) - (Number(b.Ordre) || 0)); }
function cleTri(v) { return v instanceof Date ? v.getTime() : typeof v === "number" ? v : normal(texteValeur(v)); }
/* Règles de tri : texte « Champ, Champ desc, Champ [Valeur 1; Valeur 2], Champ [choix] »
   ou table Tri_point : Ordre, Champ, Sens (A→Z, Z→A, Liste, Ordre des choix), Valeurs (une par ligne), Actif */
function lireRegles(texte, table) {
  if (table && table.length) return actifs(table).filter(r => String(r.Champ || "").trim()).map(r => {
    const sens = normal(r.Sens);
    const valeurs = String(r.Valeurs || "").split(/\n|;/).map(normal).filter(Boolean);
    return { c: String(r.Champ).trim(), desc: /z.*a|desc|decroissant/.test(sens), choix: /choix/.test(sens), valeurs: /liste|valeur|perso/.test(sens) || (valeurs.length && !/choix/.test(sens)) ? valeurs : null };
  });
  const regles = [], re = /\s*([^,\[]+?)\s*(\[([^\]]*)\])?\s*(desc)?\s*(?:,|$)/gi;
  let m;
  while ((m = re.exec(String(texte))) && m[0]) {
    const [c, sens] = m[1].trim().split(/\s+/);
    if (!c) continue;
    const liste = m[3] != null ? m[3].split(";").map(normal).filter(Boolean) : null;
    regles.push({ c, desc: /^desc/i.test(sens || m[4] || ""), choix: !!liste && liste.length === 1 && liste[0] === "choix", valeurs: liste && !(liste.length === 1 && liste[0] === "choix") ? liste : null });
  }
  return regles;
}
// rang d'une valeur dans une liste imposée ; les valeurs absentes de la liste passent après, par ordre alphabétique
function rangValeur(v, valeurs) {
  const items = (Array.isArray(v) ? v : [v]).map(x => normal(texteValeur(x))).filter(Boolean);
  if (!items.length) return valeurs.length + 1;
  return Math.min(...items.map(x => { const i = valeurs.indexOf(x); return i < 0 ? valeurs.length : i; }));
}
function comparer(a, b, desc) { if (a < b) return desc ? 1 : -1; if (a > b) return desc ? -1 : 1; return 0; }

async function assemblerPoint(sources, cfg) {
  const R = cfg.reglages || {};
  const nomTable = R.table || "Reponses", colDossier = R.dossier || "Dossier", colDate = R.date || "Cree_le", colNature = R.nature || "Nature";
  const colonnes = actifs(cfg.colonnes && cfg.colonnes.length ? cfg.colonnes : DEFAUT_COLONNES);
  const sections = actifs(cfg.sections && cfg.sections.length ? cfg.sections : DEFAUT_SECTIONS);
  const tri = lireRegles(R.tri || DEFAUT_TRI, cfg.tri);

  const chemins = [colDossier, colDate, colNature, ...tri.map(t => t.c)];
  for (const col of colonnes) for (const m of String(col.Contenu || "").matchAll(/\{([^{}|]+)(?:\|[^{}]+)?\}/g)) if (m[1].trim() !== "nouveau") chemins.push(m[1].trim());
  for (const s of sections) for (const a of morceauxCondition(s.Condition)) chemins.push(a.chemin);
  if (R.champAcademie) chemins.push(R.champAcademie);

  // plusieurs sources possibles (point national : un document par région académique)
  const depuis = R.depuis ? new Date(R.depuis) : null, marque = R.dernierPoint ? new Date(R.dernierPoint) : null;
  // surlignage : « point » = ce qui a changé depuis le dernier point (défaut) ; « version » = marques des colonnes (dernière mise à jour)
  const depuisPoint = R.surlignage !== "version" && marque instanceof Date && !isNaN(marque);
  const manquants = new Set();
  let lignes = [];
  for (const source of (Array.isArray(sources) ? sources : [sources])) {
    const base = await source.table(nomTable), lec = await creerLecteur(source, nomTable);
    // date des faits : réglage « dateFaits », sinon colonne Date_faits si elle existe, sinon date de saisie
    const typesBase = await source.types(nomTable);
    const colFaits = R.dateFaits || (typesBase.Date_faits ? "Date_faits" : colDate);
    await lec.preparer([...chemins, colFaits]); lec.manquants.forEach(m => manquants.add(m));
    // une ligne par dossier : sa dernière version = faits les plus récents, puis saisie la plus récente, puis ordre de création
    const derniere = new Map(), versions = new Map();
    const cle = r => {
      const saisie = r[colDate] instanceof Date ? r[colDate].getTime() : 0;
      return [r[colFaits] instanceof Date ? r[colFaits].getTime() : saisie, saisie, r.id];
    };
    const plusRecente = (x, y) => x[0] !== y[0] ? x[0] > y[0] : x[1] !== y[1] ? x[1] > y[1] : x[2] > y[2];
    // Étapes datées d'un jour à venir (faits annoncés, reprise sur plusieurs jours) : pas encore dans le point.
    // Colonne Date : minuit UTC, lue en UTC ; colonne Date et heure : jour à Paris.
    const jourParis = x => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(x);
    const jourDe = x => x.getUTCHours() === 0 && x.getUTCMinutes() === 0 && x.getUTCSeconds() === 0 ? x.toISOString().slice(0, 10) : jourParis(x);
    const aujourdhui = jourParis(new Date());
    for (const r of base.lignes) {
      if (r[colFaits] instanceof Date && jourDe(r[colFaits]) > aujourdhui) continue;
      const d = r[colDossier] || r.id, k = cle(r), p = derniere.get(d);
      if (!p || plusRecente(k, p.k)) derniere.set(d, { r, k });
      if (!versions.has(d)) versions.set(d, []);
      versions.get(d).push({ r, k });
    }
    // version du dossier en vigueur au dernier point : la plus récente parmi celles saisies avant lui
    const auDernierPoint = d => {
      let best = null;
      for (const v of versions.get(d) || []) if (v.r[colDate] instanceof Date && v.r[colDate] <= marque && (!best || plusRecente(v.k, best.k))) best = v;
      return best ? best.r : null;
    };
    for (const [d, { r }] of derniere.entries()) {
      const quand = r[colFaits] instanceof Date ? r[colFaits] : r[colDate];   // versions sans date des faits : date de saisie
      if (depuis && quand instanceof Date && quand < depuis) continue;
      if (R.academie && texteValeur(lec.lire(r, R.champAcademie || "Etablissement.Academie")) !== R.academie) continue;
      lignes.push({ r, lec, ref: depuisPoint ? auDernierPoint(d) : undefined });
    }
  }
  // listes de valeurs « ordre des choix » : prises dans la configuration de la colonne Grist
  for (const t of tri) if (t.choix) {
    const l = lignes.find(x => x.lec.choix(t.c).length);
    t.valeurs = l ? l.lec.choix(t.c).map(normal) : [];
  }
  lignes.sort((a, b) => {
    for (const { c, desc, valeurs } of tri) {
      const va = a.lec.lire(a.r, c), vb = b.lec.lire(b.r, c);
      if (valeurs) {   // ordre imposé ; les valeurs non listées passent après, par ordre alphabétique
        const ra = rangValeur(va, valeurs), rb = rangValeur(vb, valeurs);
        const d = comparer(ra, rb, desc); if (d) return d;
        if (ra < valeurs.length) continue;   // même valeur listée : on passe au critère suivant
      }
      const d = comparer(cleTri(va), cleTri(vb), valeurs ? false : desc); if (d) return d;
    }
    return a.r.id - b.r.id;
  });

  // répartition : chaque ligne va dans la première section dont la condition est vraie
  const restantes = new Set(lignes);
  const sortie = sections.map(sec => {
    const cols = colonnes.filter(c => !String(c.Tableaux || "").trim() || String(c.Tableaux).split(",").map(normal).includes(normal(sec.Titre)));
    const lignesSec = lignes.filter(x => restantes.has(x) && testerCondition(sec.Condition, x.r, x.lec));
    lignesSec.forEach(x => restantes.delete(x));
    const MENTION = "\u0001nouveau\u0001";
    const rows = lignesSec.map(({ r, lec, ref }) => {
      const nouveau = marque && r[colDate] instanceof Date && r[colDate] > marque && r[colNature] === "Nouveau signalement";
      const extra = { nouveau: nouveau ? MENTION : "" };
      let vals = cols.map(c => remplir(c.Contenu, r, lec, extra));
      if (depuisPoint) {
        // dossier connu au dernier point et modifié depuis : mots ajoutés ; sinon (inchangé, ou nouveau dossier) : rien de surligné
        if (ref && ref !== r) { const avant = cols.map(c => remplir(c.Contenu, ref, lec, extra)); vals = vals.map((v, i) => marquerAjouts(sansMarques(avant[i]), sansMarques(v))); }
        else vals = vals.map(sansMarques);
      }
      return vals.map(v => v.split(MENTION).join("==**Nouveau signalement**=="));
    });
    return { titre: sec.Titre, colonnes: cols, rows };
  });
  return { sections: sortie, nb: lignes.length, horsSection: restantes.size, manquants: [...manquants] };
}

/* ---------- rendu HTML (aperçu) ---------- */
function echap(s) { return String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function clair(hex) { const h = String(hex || "17877A").replace("#", ""); const [r, g, b] = [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)); return (0.299 * r + 0.587 * g + 0.114 * b) > 150; }
function celluleHTML(txt) {
  return segmentsLignes(txt).map(l => l.map(s => { let t = echap(s.t); if (s.g) t = `<strong>${t}</strong>`; if (s.s) t = `<mark style="background-color:#FFFF00">${t}</mark>`; return t; }).join("")).join("<br>");
}
function portees(sec) {   // fusion verticale : nombre de lignes couvertes par chaque cellule
  return sec.colonnes.map((c, j) => sec.rows.map((row, i) => {
    if (!c.Fusionner) return 1;
    if (i > 0 && sec.rows[i - 1][j] === row[j] && row[j] !== "") return 0;
    let n = 1; while (i + n < sec.rows.length && sec.rows[i + n][j] === row[j] && row[j] !== "") n++; return n;
  }));
}
function sectionsHTML(point) {
  return point.sections.map((sec, k) => {
    const tot = sec.colonnes.reduce((s, c) => s + (Number(c.Largeur) || 10), 0), p = portees(sec);
    const tete = `<h2>${k + 1}. ${echap(sec.titre)}</h2>`;
    if (!sec.rows.length) return tete + '<p class="vide">Aucun signalement.</p>';
    return tete + `<table><colgroup>${sec.colonnes.map(c => `<col style="width:${((Number(c.Largeur) || 10) / tot * 100).toFixed(1)}%">`).join("")}</colgroup>
      <thead><tr>${sec.colonnes.map(c => `<th scope="col" style="background:#${String(c.Couleur || "17877A").replace("#", "")};color:${clair(c.Couleur) ? "#161616" : "#fff"}">${echap(c.Titre)}</th>`).join("")}</tr></thead>
      <tbody>${sec.rows.map((row, i) => `<tr>${row.map((v, j) => p[j][i] === 0 ? "" : `<td${p[j][i] > 1 ? ` rowspan="${p[j][i]}"` : ""}>${celluleHTML(v)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  }).join("");
}

/* ---------- rendu WordprocessingML (inséré dans le modèle via {@corps}) ---------- */
const LARGEUR_TABLE = 10828;
function xmlEsc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function runs(txt, blanc, segs) {
  return (segs || segments(txt)).map(s => `<w:r><w:rPr><w:rFonts w:ascii="Marianne" w:hAnsi="Marianne"/>${s.g ? "<w:b/><w:bCs/>" : ""}${blanc ? '<w:color w:val="FFFFFF"/>' : ""}<w:sz w:val="18"/><w:szCs w:val="18"/>${s.s ? '<w:highlight w:val="yellow"/>' : ""}</w:rPr><w:t xml:space="preserve">${xmlEsc(s.t)}</w:t></w:r>`).join("");
}
function paras(txt, blanc) {
  return segmentsLignes(txt).map(l => `<w:p><w:pPr><w:spacing w:before="20" w:after="20"/><w:jc w:val="left"/></w:pPr>${runs("", blanc, l)}</w:p>`).join("");
}
const BORD = '<w:tcBorders><w:top w:val="single" w:sz="8" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="8" w:space="0" w:color="auto"/><w:bottom w:val="single" w:sz="8" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="8" w:space="0" w:color="auto"/></w:tcBorders>';
function sectionsXML(point, styleTitre) {
  return point.sections.map(sec => {
    const titre = `<w:p><w:pPr><w:pStyle w:val="${styleTitre}"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:spacing w:before="240" w:after="120" w:line="240" w:lineRule="auto"/><w:rPr><w:color w:val="auto"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:pPr><w:r><w:rPr><w:color w:val="auto"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t xml:space="preserve">${xmlEsc(sec.titre)}</w:t></w:r></w:p>`;
    if (!sec.rows.length) return titre + `<w:p>${runs("Aucun signalement.")}</w:p>`;
    const tot = sec.colonnes.reduce((s, c) => s + (Number(c.Largeur) || 10), 0);
    const w = sec.colonnes.map(c => Math.round((Number(c.Largeur) || 10) / tot * LARGEUR_TABLE)), p = portees(sec);
    const cell = (j, contenu, fond, fusion, blanc) => `<w:tc><w:tcPr><w:tcW w:w="${w[j]}" w:type="dxa"/>${fusion || ""}${BORD}${fond ? `<w:shd w:val="clear" w:color="auto" w:fill="${fond}"/>` : ""}<w:tcMar><w:left w:w="70" w:type="dxa"/><w:right w:w="70" w:type="dxa"/></w:tcMar><w:vAlign w:val="${fond ? "center" : "top"}"/></w:tcPr>${paras(contenu, blanc)}</w:tc>`;
    const tete = `<w:tr><w:trPr><w:tblHeader/><w:trHeight w:val="600"/></w:trPr>${sec.colonnes.map((c, j) => { const f = String(c.Couleur || "17877A").replace("#", ""); return cell(j, `**${c.Titre}**`, f, "", !clair(f)); }).join("")}</w:tr>`;
    const corps = sec.rows.map((row, i) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${row.map((v, j) => {
      const n = p[j][i];
      return cell(j, n === 0 ? "" : v, null, n === 0 ? '<w:vMerge/>' : (n > 1 ? '<w:vMerge w:val="restart"/>' : ""));
    }).join("")}</w:tr>`).join("");
    return titre + `<w:tbl><w:tblPr><w:tblW w:w="${LARGEUR_TABLE}" w:type="dxa"/><w:tblInd w:w="-719" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr><w:tblGrid>${w.map(x => `<w:gridCol w:w="${x}"/>`).join("")}</w:tblGrid>${tete}${corps}</w:tbl><w:p/>`;
  }).join("");
}

// Source Grist : tables décodées + types de colonnes
function creerSource() {
  let meta = null, aff = null, libs = null;
  const src = { _charge: {} };
  async function lireMeta() {
    if (meta) return;
    const t = await grist.docApi.fetchTable("_grist_Tables"), c = await grist.docApi.fetchTable("_grist_Tables_column");
    const noms = {}, colId = {}; t.id.forEach((id, i) => noms[id] = t.tableId[i]); c.id.forEach((id, i) => colId[id] = c.colId[i]);
    meta = {}; aff = {}; libs = {};
    c.id.forEach((id, i) => {
      const tb = noms[c.parentId[i]];
      (meta[tb] = meta[tb] || {})[c.colId[i]] = c.type[i];
      (libs[tb] = libs[tb] || {})[c.colId[i]] = (c.label || [])[i] || "";
      let choices = [];
      try { choices = JSON.parse((c.widgetOptions || [])[i] || "{}").choices || []; } catch (e) { /* options illisibles */ }
      (aff[tb] = aff[tb] || {})[c.colId[i]] = { display: colId[(c.displayCol || [])[i]] || null, visible: colId[(c.visibleCol || [])[i]] || null, choices };
    });
  }
  src.types = async nom => { await lireMeta(); return meta[nom] || {}; };
  src.affichage = async nom => { await lireMeta(); return aff[nom] || {}; };
  src.libelles = async nom => { await lireMeta(); return libs[nom] || {}; };
  src.table = async nom => {
    if (!src._charge[nom]) {
      const brut = await grist.docApi.fetchTable(nom), ty = await src.types(nom);
      const lignes = brut.id.map((id, i) => {
        const r = { id };
        for (const k in brut) {
          let v = brut[k][i];
          if (Array.isArray(v) && v[0] === "L") v = v.slice(1);
          else if (typeof v === "number" && /^(Date|DateTime)/.test(ty[k] || "")) v = new Date(v * 1000);
          r[k] = v;
        }
        return r;
      });
      src._charge[nom] = { lignes, parId: new Map(lignes.map(r => [r.id, r])) };
    }
    return src._charge[nom];
  };
  return src;
}
