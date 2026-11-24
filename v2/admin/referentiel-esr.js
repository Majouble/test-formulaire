/* =====================================================================
   Administration v2 — onglet « Référentiel » : référentiel de l'enseignement supérieur (classeur Excel)
   ---------------------------------------------------------------------
   Import du classeur consolidé des établissements, composantes et sites de l'ESR, lu dans le navigateur.
   Deux formats : v7 (onglets « Établissements », « Sites », « Lignes retirées », règle des 3 questions appliquée dans
   le classeur) et l'ancien format (« Etablissements_ESR », « Campus et sites », « Sites base mouvements »,
   « Lignes fusionnées »).
   - établissements et composantes internes → référentiel des établissements choisi (par défaut celui du champ ESR) ;
     rapprochement par identifiant ETAB-xxxx (ETAB-A…, ETAB-L…, ETAB-N… compris), puis UAI, puis nom ;
     « Établissement de rattachement » → colonne Rattachement (référence vers la même table), écrite pour les
     composantes et effacée pour les lignes de niveau « Établissement » ; « Membre de » → liste de références
     (EPE, IEP rattachés, périmètres partiels) ; « Siège » → référence vers le référentiel des sites ;
   - sites → référentiel des sites (repris s'il existe, sinon Referentiel_sites créée) ; rapprochement par
     identifiant SITE-xxxx, puis établissement et nom ; l'établissement d'un site est toujours la personne morale,
     la composante va dans « Composante concernée » ;
   - sites saisis dans la base d'octobre → table Sites_correspondances (libellé saisi → site, « Validé ») ;
   - lignes retirées (ou fusionnées) : la ligne existante est marquée (colonnes État et Remplacé par) et, sur option,
     les références qui y renvoient (signalements, sites…) sont reportées sur l'établissement qui la remplace.
   Le widget n'applique aucune règle de classement : la règle des 3 questions (une personne morale = un
   établissement) est appliquée dans le classeur. L'ancienne règle « une école d'ingénieurs compte pour un
   établissement » (clé regles_esr) est abandonnée depuis la 2.56.
   Rien n'est supprimé, une cellule vide du classeur n'efface rien, une colonne formule n'est jamais écrite.
   Les établissements sans coordonnées prennent celles d'un de leurs sites situé dans leur commune.
   Bilan affiché avant toute écriture ; réimporter une version corrigée du classeur met à jour sans doublon.
   Format v8 (2.62) : en plus,
   - établissements : Nom court, Ministère de contrat ou de reconnaissance, Périmètre, Statut juridique, Domaine ;
   - sites : Actif, Nom d'usage, Voie, Numéro, Occupants (liste de références vers les établissements et composantes),
     Remplacé par (site qui remplace un site fusionné ou fermé) ; références vers un site fusionné (signalements, sièges,
     correspondances…) reportées sur le site qui le remplace, sur option ; colonnes formules « Nom calculé »
     (« Site de <Commune> – <nom d'usage> », nom court de l'établissement pour un monosite, à défaut la voie) et
     « Libellé » (nom calculé + composantes présentes, rangées par effectif, 4 au plus), créées si absentes ;
   - tables annexes, créées si absentes et tenues à jour : Liaisons_sites (site – composante ; les liaisons d'origine
     « Unité Atlas », dérivées, sont remplacées à chaque import), Unites_Atlas (UAI de l'Atlas → établissement,
     composante, site), Confirmations_sites (site confirmé en revue), Effectifs (UAI, année, effectif) ; formules
     d'effectif (dernière année) par unité, par site et par établissement ou composante.
   ===================================================================== */
(function () {
  "use strict";
  const S = window.Socle;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nf = n => Number(n || 0).toLocaleString("fr-FR");
  const refId = v => typeof v === "number" ? v : (v && typeof v === "object" && "rowId" in v) ? v.rowId : (Array.isArray(v) && v[0] === "R") ? v[2] : null;
  const sansAcc = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
  const cle = s => sansAcc(s).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const nomNorm = s => sansAcc(s).toLowerCase().replace(/[’']/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
  const vide = v => v == null || (typeof v === "string" && !v.trim());
  const idDe = (v, p) => { const m = new RegExp(`^${p}-[A-Z]{0,2}\\d+`).exec(String(v ?? "").trim()); return m ? m[0] : null; };   // ETAB-0001, ETAB-A0123, SITE-X1781…
  const LOT = 400;
  const ORIGINE = "Référentiel ESR";
  const TABLE_SITES = "Referentiel_sites", TABLE_ALIAS = "Sites_correspondances";
  // onglets : format v7 d'abord, puis l'ancien format
  const FEUILLES = { etab: ["Établissements", "Etablissements_ESR"], sites: ["Sites", "Campus et sites"], alias: ["Sites base mouvements"], fusions: ["Lignes retirées", "Lignes fusionnées"],
    liaisons: ["Liaisons"], unites: ["Unités Atlas"], confirmations: ["Confirmations"], effectifs: ["Effectifs"] };
  const nomsF = k => FEUILLES[k].map(n => `« ${n} »`).join(" ou ");

  // Colonnes reprises d'office (créées si besoin). role : rôle du socle à défaut d'une colonne du même nom.
  const CHAMPS_ETAB = [
    { entete: "Établissement ID", id: "Etablissement_ID", cleRef: true },
    { entete: "Libellé consolidé (liste déroulante)", id: "Libelle_consolide" },
    { entete: "Mots-clés de recherche", id: "Mots_cles" },
    { entete: "Nom", id: "Nom", role: "Nom" },
    { entete: "Sigle", id: "Sigle" },
    { entete: "Niveau", id: "Niveau", type: "Choice" },
    { entete: "Type", id: "Type", role: "Type" },
    { entete: "Établissement de rattachement", id: "Rattachement", ratt: true },
    { entete: "Groupe", id: "Groupe" },   // règle « une école d'ingénieurs = un établissement » : groupe ou université d'origine
    { entete: "Secteur", id: "Secteur", role: "Statut_public_prive" },
    { entete: "État", id: "Etat" },
    { entete: "Académie", id: "Academie", role: "Academie" },
    { entete: "Département", id: "Departement", role: "Departement" },
    { entete: "Commune", id: "Commune", role: "Commune" },
    { entete: "Région académique (siège)", id: "Region_academique", role: "Region_academique" },
    { entete: "UAI", id: "UAI", role: "UAI" },
    { entete: "Identifiant Paysage", id: "Identifiant_Paysage" },
    { entete: "Statut de la ligne", id: "Statut_ligne" },
    { entete: "Points à vérifier", id: "Points_a_verifier" },
    { entete: "Autres noms", id: "Autres_noms" },   // lue par la recherche d'établissement (saisie, référentiel des sites)
    { entete: "Membre de", id: "Membre_de", liste: true },   // EPE, IEP rattachés… (jamais « rattach » ni « parent » : ce n'est pas le parent)
    { entete: "Siège", id: "Siege", siege: true },
    { entete: "Ministère de tutelle", id: "Ministere_tutelle", type: "Choice" },
    { entete: "Ministère de contrat ou de reconnaissance", id: "Ministere_contrat", type: "Choice" },   // privé : contrat, EESPIG, reconnaissance, agrément (v8)
    { entete: "Périmètre", id: "Perimetre", type: "Choice" },
    { entete: "Statut juridique", id: "Statut_juridique", type: "Choice" },
    { entete: "Domaine", id: "Domaine", type: "Choice" },
    { entete: "Nom court", id: "Nom_court" },   // lu par les formules des sites (nom d'un monosite, libellé)
    { entete: "Commentaire", id: "Commentaire" },
  ];
  const CHAMPS_SITES = [
    { entete: "Site ID", id: "Site_id", cleRef: true },
    { entete: "Nom du site", id: "Nom", nom: true },
    { entete: "Établissement ID", id: "Etablissement", etab: true },
    { entete: "Composante concernée", id: "Composante", etab: true },
    { entete: "Autres noms", id: "Autres_noms" },
    { entete: "Statut", id: "Statut", type: "Choice" },
    { entete: "Source", id: "Source", type: "Choice" },
    { entete: "Commune", id: "Commune" },
    { entete: "Code postal", id: "Code_postal" },
    { entete: "Académie", id: "Academie" },
    { entete: "Adresse", id: "Adresse" },
    { entete: "Latitude", id: "Latitude", type: "Numeric" },
    { entete: "Longitude", id: "Longitude", type: "Numeric" },
    { entete: "Précision des coordonnées", id: "Precision_coordonnees" },
    { entete: "Implantation multi-occupants", id: "Multi_occupants" },
    { entete: "Autres occupants", id: "Autres_occupants" },
    { entete: "Actif", id: "Actif", type: "Bool" },
    { entete: "Nom d'usage", id: "Nom_usage" },
    { entete: "Voie", id: "Voie" },
    { entete: "Numéro", id: "Numero" },
    { entete: "Occupants", id: "Occupants", occ: true },   // autres établissements et composantes présents sur le site (v8)
    { entete: "Remplacé par", id: "Remplace_par", siteRef: true },   // site fusionné ou fermé → site qui le remplace (v8)
  ];
  // noms en clair (l'identifiant suffit) ; « Libellé » est une colonne formule du document (voir formulesSites)
  const SITES_IGNORES = ["Établissement", "Établissement (base des sites)", "Libellé"];
  // tables annexes du format v8 : feuille → table, colonnes (ref : etab | site), clé de rapprochement
  const ANNEXES = [
    { cle: "liaisons", table: "Liaisons_sites", titre: "Liaisons site – composante", feuille: "liaisons", cles: ["Site ID", "Composante ID", "Origine"], derivees: { col: "Origine", valeur: "Unité Atlas" },
      cols: [{ entete: "Site ID", id: "Site", ref: "site" }, { entete: "Composante ID", id: "Composante", ref: "etab" }, { entete: "Origine", id: "Origine", type: "Choice" }] },
    { cle: "unites", table: "Unites_Atlas", titre: "Unités de l'Atlas", feuille: "unites", cles: ["UAI"],
      cols: [{ entete: "UAI", id: "UAI" }, { entete: "Libellé Atlas", id: "Libelle_Atlas" }, { entete: "Catégorie Atlas", id: "Categorie_Atlas", type: "Choice" }, { entete: "Secteur", id: "Secteur", type: "Choice" },
        { entete: "Commune", id: "Commune" }, { entete: "UAI établissement (Atlas)", id: "UAI_etablissement_Atlas" }, { entete: "Établissement ID", id: "Etablissement", ref: "etab" },
        { entete: "Composante ID", id: "Composante", ref: "etab" }, { entete: "Site ID", id: "Site", ref: "site" }, { entete: "Méthode site", id: "Methode_site", type: "Choice" },
        { entete: "Décision", id: "Decision", type: "Choice" }, { entete: "Motif", id: "Motif" }, { entete: "Site à confirmer", id: "Site_a_confirmer", type: "Bool" },
        { entete: "Année de début", id: "Annee_debut", type: "Int" }, { entete: "Source", id: "Source" }] },
    { cle: "confirmations", table: "Confirmations_sites", titre: "Confirmations de site", feuille: "confirmations", cles: ["UAI", "Site ID"],
      cols: [{ entete: "UAI", id: "UAI" }, { entete: "Site ID", id: "Site", ref: "site" }, { entete: "Motif", id: "Motif" }, { entete: "Date", id: "Date", type: "Date" }] },
    { cle: "effectifs", table: "Effectifs", titre: "Effectifs", feuille: "effectifs", cles: ["UAI", "Année"],
      cols: [{ entete: "UAI", id: "UAI" }, { entete: "Année", id: "Annee", type: "Int" }, { entete: "Effectif", id: "Effectif", type: "Int" }] },
  ];

  let racine = null, classeur = null, nomFichier = "", choixTable = "", analyse = null, enCours = false;

  const optionsCochees = { etab: null, sites: null };   // en-têtes facultatifs cochés (null : colonnes déjà présentes)
  let reporter = true, reporterSites = true;

  /* ---------- Lecture du classeur : commun/tableur.js ---------- */
  const lireClasseur = fichier => window.Tableur.lireClasseur(fichier);

  /* ---------- Contexte Grist ---------- */
  async function contexte() {
    const meta = await S.lireMeta(), config = await S.lireConfig(meta);
    if (!config) throw new Error("La table Config n'existe pas : terminez d'abord l'installation.");
    const g = S.general(config), esp = S.espaces(g);
    const cibles = [...new Set(esp.map(e => e.referentiel))].filter(t => meta[t]);
    const parDefaut = (esp.find(e => e.champ === "ESR" && meta[e.referentiel]) || {}).referentiel || cibles[0] || null;
    return { meta, config, g, esp, cibles, parDefaut, reps: esp.map(e => e.reponses).filter(t => meta[t]) };
  }
  // Référentiel des sites existant : table « …site… » qui renvoie vers les établissements (comme le modèle par site)
  function tableSitesDe(ctx, etab) {
    return Object.keys(ctx.meta).find(t => !t.startsWith("_grist") && /site/i.test(t) && !/signal|correspond/i.test(t)
      && Object.values(ctx.meta[t].colonnes).some(c => c.type === `Ref:${etab}`) && !Object.values(ctx.meta[t].colonnes).some(c => ctx.reps.includes(S.cibleRef(c.type)))) || null;
  }

  /* ---------- Correspondance en-tête du classeur → colonne Grist ---------- */
  // colonne existante (même identifiant ou même libellé, sans accents ni ponctuation), sinon rôle, sinon à créer
  function colonneDe(tm, ch, roles, dejaPrises) {
    const cols = tm ? Object.values(tm.colonnes) : [];
    const libre = c => c && !dejaPrises.has(c.colId);
    let c = cols.find(x => libre(x) && (cle(x.colId) === cle(ch.entete) || cle(x.label) === cle(ch.entete)))
      || cols.find(x => libre(x) && cle(x.colId) === cle(ch.id))
      || (ch.role && roles[ch.role] && roles[ch.role].col && libre(tm.colonnes[roles[ch.role].col]) ? tm.colonnes[roles[ch.role].col] : null);
    return c || null;
  }
  let tableSitesCible = TABLE_SITES;   // pour le type de la colonne Siège
  const typeCreation = (ch, table) => ch.ratt ? `Ref:${table}` : ch.liste ? `RefList:${table}` : ch.siege ? `Ref:${tableSitesCible}` : ch.etab ? `Ref:${table}` : ch.type || "Text";
  function plan(tm, champs, entetes, options, roles, table, etabTable) {
    const prises = new Set(), lignes = [], creer = [];
    for (const ch of champs) {
      if (!entetes.includes(ch.entete)) continue;
      let c = colonneDe(tm, ch, roles, prises);
      if (ch.etab && tm) c = (c && c.type === `Ref:${etabTable}` ? c : null) || Object.values(tm.colonnes).find(x => !prises.has(x.colId) && x.type === `Ref:${etabTable}` && (ch.id === "Etablissement" ? !/compos/i.test(x.colId) : /compos/i.test(x.colId))) || null;
      if (ch.cleRef && !c && tm) c = null;   // colonne d'identifiant : détectée sur son contenu à l'analyse
      if (c && c.isFormula) { lignes.push({ ...ch, col: null, formule: c.colId }); prises.add(c.colId); continue; }
      if (c) { prises.add(c.colId); lignes.push({ ...ch, col: c.colId, meta: c }); continue; }
      const id = tm && tm.colonnes[ch.id] ? `${ch.id}_ESR` : ch.id;
      // Remplacé par (site → site) : créée après la table des sites, qu'elle désigne
      const m = { colId: id, type: ch.etab ? `Ref:${etabTable}` : ch.occ ? `RefList:${etabTable}` : ch.siteRef ? `Ref:${table}` : typeCreation(ch, table), label: ch.entete, isFormula: false, widgetOptions: "", differe: !!(ch.siege || ch.siteRef) };
      creer.push(m); prises.add(id); lignes.push({ ...ch, col: id, meta: m, cree: true });
    }
    const pris = new Set(champs.map(c => c.entete));
    const facultatifs = entetes.filter(h => !pris.has(h)).map(h => {
      const c = tm ? Object.values(tm.colonnes).find(x => !prises.has(x.colId) && (cle(x.colId) === cle(h) || cle(x.label) === cle(h))) : null;
      return { entete: h, existante: c ? c.colId : null, formule: !!(c && c.isFormula) };
    });
    for (const f of facultatifs) {
      if (f.formule || !(options ? options.includes(f.entete) : f.existante)) continue;
      if (f.existante) { prises.add(f.existante); lignes.push({ entete: f.entete, id: f.existante, col: f.existante, meta: tm.colonnes[f.existante] }); continue; }
      let id = cle(f.entete).replace(/^(\d)/, "C_$1"); id = id.charAt(0).toUpperCase() + id.slice(1);
      while ((tm && tm.colonnes[id]) || prises.has(id)) id += "_";
      const m = { colId: id, type: "Text", label: f.entete, isFormula: false, widgetOptions: "" };
      creer.push(m); prises.add(id); lignes.push({ entete: f.entete, id, col: id, meta: m, cree: true });
    }
    return { lignes, creer, facultatifs };
  }

  /* ---------- Conversion d'une valeur du classeur pour une colonne Grist ---------- */
  function choixDe(m) { try { return (JSON.parse(m.widgetOptions || "{}").choices) || []; } catch (_) { return []; } }
  function convertisseur(nouveauxChoix, resoudre) {
    return async (m, v) => {
      if (vide(v)) return undefined;
      const t = String(m.type || "Text").split(":")[0];
      if (t === "Int" || t === "Numeric") { const n = typeof v === "number" ? v : Number(String(v).replace(",", ".").replace(/\s/g, "")); return Number.isFinite(n) ? (t === "Int" ? Math.round(n) : n) : undefined; }
      if (t === "Bool") return typeof v === "boolean" ? v : /^(oui|vrai|true|1|x)$/i.test(String(v).trim());
      if (t === "Ref") { const id = await resoudre(m, v); return id || undefined; }
      if (t === "Date" || t === "DateTime") return typeof v === "number" ? v : undefined;
      const s = typeof v === "string" ? v.trim() : String(v);
      if (t === "Choice" || t === "ChoiceList") {
        const ch = choixDe(m).concat([...(nouveauxChoix.get(m.colId) || [])]), trouve = ch.find(x => nomNorm(x) === nomNorm(s));
        if (!trouve) { if (!nouveauxChoix.has(m.colId)) nouveauxChoix.set(m.colId, new Set()); nouveauxChoix.get(m.colId).add(s); }
        return t === "ChoiceList" ? ["L", trouve || s] : (trouve || s);
      }
      return s;
    };
  }
  // Référence par libellé : ligne de la table cible dont une colonne texte porte cette valeur
  function resolveurTexte() {
    const caches = {};
    return async (m, valeur) => {
      const cible = S.cibleRef(m.type); if (!cible) return null;
      if (!caches[cible]) {
        const t = await grist.docApi.fetchTable(cible), index = new Map();
        for (const [c, vals] of Object.entries(t)) if (c !== "id" && Array.isArray(vals)) vals.forEach((v, i) => { if (typeof v === "string" && !index.has(nomNorm(v))) index.set(nomNorm(v), t.id[i]); });
        caches[cible] = index;
      }
      return caches[cible].get(nomNorm(valeur)) || null;
    };
  }
  const memeValeur = (a, b) => {
    if (a === b) return true;
    if (vide(a) && vide(b)) return true;
    if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 1e-9;
    if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b);
    if (refId(a) != null && refId(a) === refId(b)) return true;
    return typeof a === "string" && typeof b === "string" && a.trim() === b.trim();
  };
  const colonneIdentifiants = (t, prefixe) => Object.keys(t).filter(c => c !== "id" && Array.isArray(t[c])).map(c => {
    const v = t[c].filter(x => typeof x === "string" && x.trim()); return [c, v.length ? v.filter(x => idDe(x, prefixe)).length / v.length : 0, v.length];
  }).filter(([, s, n]) => s >= 0.8 && n).sort((a, b) => b[1] - a[1]).map(([c]) => c)[0] || null;

  // en-têtes du format v7 → en-têtes historiques du classeur (même colonnes Grist, mêmes rapprochements)
  const EN_TETES_V7 = { "Établissement": "Nom", "Type d'établissement": "Type", "Identifiant(s) UAI": "UAI", "Région académique": "Région académique (siège)" };
  function renommerV7(f) {
    for (const [v7, ancien] of Object.entries(EN_TETES_V7)) {
      if (!f.entetes.includes(v7) || f.entetes.includes(ancien)) continue;
      f.entetes = f.entetes.map(h => h === v7 ? ancien : h);
      f.lignes.forEach(l => { l[ancien] = l[v7]; delete l[v7]; });
    }
  }
  const premierUai = v => String(v || "").trim().toUpperCase().split(/[\s,;|]+/)[0] || "";   // « 0350936C, 0352480F » : le premier

  /* ---------- Analyse (rien n'est écrit) ---------- */
  async function analyser() {
    const ctx = await contexte();
    const table = ctx.cibles.includes(choixTable) ? choixTable : ctx.parDefaut;
    if (!table) throw new Error("Aucun référentiel des établissements dans le document : terminez d'abord l'installation.");
    const [fE, fS, fA, fF] = await Promise.all([classeur.lireUne(FEUILLES.etab), classeur.lireUne(FEUILLES.sites), classeur.lireUne(FEUILLES.alias), classeur.lireUne(FEUILLES.fusions)]);
    if (!fE || !fE.entetes.includes("Établissement ID")) throw new Error(`Onglet ${nomsF("etab")} (avec la colonne « Établissement ID ») introuvable dans ce classeur. Onglets lus : ${classeur.noms.join(", ")}.`);
    tableSitesCible = tableSitesDe(ctx, table) || TABLE_SITES;
    if (fE.nom === "Établissements") renommerV7(fE);
    const tm = ctx.meta[table], esp = ctx.esp.find(e => e.referentiel === table) || {};
    const roles = S.resoudreRoles("referentiel", tm, { reponses: esp.reponses, referentiel: table }, table === ctx.g.referentiel ? ((ctx.config.valeurs.roles || {}).referentiel) || {} : {}, {});
    const existant = await grist.docApi.fetchTable(table);

    // colonnes : identifiant détecté sur le contenu si son nom diffère
    const colIdEx = colonneIdentifiants(existant, "ETAB");
    const pE = plan(tm, CHAMPS_ETAB.map(c => c.cleRef && colIdEx ? { ...c, id: colIdEx } : c), fE.entetes, optionsCochees.etab, roles, table, table);
    const champ = id => pE.lignes.find(l => l.id === id || (l.cleRef && id === "cle")) || null;
    const lCle = pE.lignes.find(l => l.cleRef), lRatt = pE.lignes.find(l => l.ratt);
    // coordonnées et origine : rôles, sinon colonnes créées
    const coord = r => { const c = roles[r] && roles[r].col; if (c && tm.colonnes[c] && !tm.colonnes[c].isFormula) return { col: c, meta: tm.colonnes[c] };
      if (c) return null; const m = { colId: r, type: "Numeric", label: r, isFormula: false, widgetOptions: "" }; pE.creer.push(m); return { col: r, meta: m, cree: true }; };
    const cLat = coord("Latitude"), cLon = coord("Longitude");
    const cOrig = roles.Origine && roles.Origine.col && !tm.colonnes[roles.Origine.col].isFormula ? { col: roles.Origine.col, meta: tm.colonnes[roles.Origine.col] } : null;

    // rapprochement des lignes existantes : identifiant, puis UAI, puis nom
    const colUai = (champ("UAI") || {}).col, colNoms = [(champ("Nom") || {}).col, (champ("Libelle_consolide") || {}).col, roles.Nom && roles.Nom.col].filter(c => c && existant[c]);
    const idx = { id: new Map(), uai: new Map(), nom: new Map() };
    existant.id.forEach((rid, i) => {
      const k = lCle && existant[lCle.col] ? idDe(existant[lCle.col][i], "ETAB") : null; if (k && !idx.id.has(k)) idx.id.set(k, rid);
      const u = colUai && existant[colUai] ? premierUai(existant[colUai][i]) : ""; if (u && !idx.uai.has(u)) idx.uai.set(u, rid);
      colNoms.forEach(c => { const n = nomNorm(existant[c][i]); if (n && !idx.nom.has(n)) idx.nom.set(n, rid); });
    });
    const pos = new Map(existant.id.map((rid, i) => [rid, i])), utilises = new Set();
    const lignes = fE.lignes.filter(l => idDe(l["Établissement ID"], "ETAB")).map(l => ({ l, id: idDe(l["Établissement ID"], "ETAB"), ex: null, mode: "" }));
    const essayer = (o, mode, k, carte) => { if (o.ex || !k) return; const rid = carte.get(k); if (rid != null && !utilises.has(rid)) { o.ex = rid; o.mode = mode; utilises.add(rid); } };
    lignes.forEach(o => essayer(o, "identifiant", o.id, idx.id));
    lignes.forEach(o => essayer(o, "UAI", premierUai(o.l.UAI), idx.uai));
    lignes.forEach(o => [o.l["Nom (source)"], o.l.Nom, o.l["Libellé consolidé (liste déroulante)"]].forEach(n => essayer(o, "nom", nomNorm(n), idx.nom)));
    const parId = new Map(lignes.map(o => [o.id, o]));

    // lignes fusionnées : ligne existante absorbée par un établissement conservé
    const absorbees = [];
    const retirees = !!(fF && fF.nom === "Lignes retirées");
    if (fF) for (const l of fF.lignes) {
      // v7 : Établissement ID, Établissement, Résultat, Remplacé par, Remplacé par (nom) ; ancien format : Ligne supprimée, Nom, Fusionnée dans, Nom retenu
      const sup = idDe(l["Ligne supprimée"] ?? l["Établissement ID"], "ETAB"), vers = idDe(l["Fusionnée dans"] ?? l["Remplacé par"], "ETAB"); if (!sup || !vers || !parId.has(vers)) continue;
      const o = { id: sup, ex: null }; essayer(o, "identifiant", sup, idx.id); essayer(o, "UAI", String(l.UAI || "").trim().toUpperCase(), idx.uai); if (!retirees) essayer(o, "nom", nomNorm(l.Nom), idx.nom);
      if (o.ex) absorbees.push({ ex: o.ex, sup, vers, nom: String(l["Nom retenu"] ?? l["Remplacé par (nom)"] ?? parId.get(vers).l.Nom ?? ""), resultat: String(l["Résultat"] || "") });
    }

    // sites (pour les coordonnées des établissements, puis leur propre import)
    const sitesL = fS ? fS.lignes.filter(l => idDe(l["Site ID"], "SITE")) : [];
    const sitesParId = new Map(sitesL.map(l => [idDe(l["Site ID"], "SITE"), l]));
    const sitesDeEtab = new Map();
    sitesL.forEach(l => { const comp = idDe(l["Composante concernée"], "ETAB"), e = idDe(l["Établissement ID"], "ETAB"), k = comp || e; if (!k) return;
      if (!sitesDeEtab.has(k)) sitesDeEtab.set(k, []); sitesDeEtab.get(k).push(l); });
    const num = v => { const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) && v !== null && v !== "" ? n : null; };
    function coordonneesDe(o) {
      const corr = String(o.l["Site(s) correspondant(s)"] || "").match(/SITE-[A-Z]{0,2}\d+/g) || [];
      for (const s of corr) { const l = sitesParId.get(s); if (l && num(l.Latitude) != null) return [num(l.Latitude), num(l.Longitude), l]; }
      const cands = (sitesDeEtab.get(o.id) || []).filter(l => num(l.Latitude) != null && num(l.Longitude) != null);
      const commune = nomNorm(o.l.Commune).replace(/\s\d+(e|er)$/, "");
      const note = l => (commune && nomNorm(l.Commune).startsWith(commune) ? 4 : 0) + (/valid/i.test(l.Statut || "") ? 1 : 0) + (/centre/i.test(l["Précision des coordonnées"] || "") ? 0 : 1);
      const meilleurs = cands.filter(l => cands.length === 1 || (commune && nomNorm(l.Commune).startsWith(commune))).sort((a, b) => note(b) - note(a));
      return meilleurs[0] ? [num(meilleurs[0].Latitude), num(meilleurs[0].Longitude), meilleurs[0]] : null;
    }

    // valeurs à écrire
    const nouveauxChoix = new Map(), conv = convertisseur(nouveauxChoix, resolveurTexte());
    const ajouts = [], majs = [], parMode = { identifiant: 0, UAI: 0, nom: 0 };
    let inchanges = 0, coordsCompletees = 0;
    for (const o of lignes) {
      const f = {};
      for (const c of pE.lignes) {
        if (!c.col || c.ratt || c.liste || c.siege) continue;
        const v = c.cleRef ? o.id : await conv(c.meta, o.l[c.entete]);
        if (v !== undefined) f[c.col] = v;
      }
      if (cLat && cLon) {
        const i = o.ex != null ? pos.get(o.ex) : -1, a = i >= 0 ? (existant[cLat.col] || [])[i] : null, b = i >= 0 ? (existant[cLon.col] || [])[i] : null;
        if ((vide(a) || a === 0) && (vide(b) || b === 0)) { const xy = coordonneesDe(o); if (xy) { f[cLat.col] = xy[0]; f[cLon.col] = xy[1]; coordsCompletees++; } }
      }
      o.ratt = lRatt && lRatt.col ? idDe(o.l[lRatt.entete], "ETAB") : null;
      o.rattTexte = lRatt && lRatt.col ? o.l[lRatt.entete] : null;
      // niveau « Établissement » : une personne morale n'a pas de rattachement (règle des 3 questions)
      o.rattEfface = !o.ratt && fE.entetes.includes("Niveau") && nomNorm(o.l.Niveau) === "etablissement";
      o.membres = String(o.l["Membre de"] ?? "").match(/ETAB-[A-Z]{0,2}\d+/g) || [];
      o.siege = idDe(o.l["Siège"], "SITE");
      if (o.ex == null) { if (cOrig) f[cOrig.col] = await conv(cOrig.meta, ORIGINE); ajouts.push({ o, f }); continue; }
      parMode[o.mode]++;
      const i = pos.get(o.ex), diff = {};
      for (const [k, v] of Object.entries(f)) if (!memeValeur(existant[k] ? existant[k][i] : undefined, v)) diff[k] = v;
      if (Object.keys(diff).length) majs.push({ o, id: o.ex, f: diff }); else inchanges++;
    }
    const absentes = existant.id.filter(rid => !utilises.has(rid) && !absorbees.some(a => a.ex === rid));
    const nomEx = rid => { const i = pos.get(rid); return colNoms.map(c => existant[c][i]).find(v => !vide(v)) || `ligne ${rid}`; };

    // références vers les lignes absorbées (signalements, sites, correspondances…)
    const references = absorbees.length ? await window.References.chercher(ctx.meta, table, new Set(absorbees.map(a => a.ex)),
      { exclure: (t, c) => t === table && !!lRatt && c === lRatt.col }) : [];

    // référentiel des sites
    let sites = null;
    if (sitesL.length) {
      const tS = tableSitesDe(ctx, table), tmS = tS ? ctx.meta[tS] : null;
      const exS = tS ? await grist.docApi.fetchTable(tS) : { id: [] };
      const colIdS = colonneIdentifiants(exS, "SITE");
      const pS = plan(tmS, CHAMPS_SITES.filter(c => !SITES_IGNORES.includes(c.entete)).map(c => c.cleRef && colIdS ? { ...c, id: colIdS } : c),
        fS.entetes.filter(h => !SITES_IGNORES.includes(h)), optionsCochees.sites, {}, tS || TABLE_SITES, table);
      const lS = id => pS.lignes.find(l => l.id === id || (l.cleRef && id === "cle") || (l.nom && id === "nom") || (l.etab && l.entete === "Établissement ID" && id === "etab")) || {};
      const cActif = tmS && tmS.colonnes.Actif && tmS.colonnes.Actif.type === "Bool" ? "Actif" : (!tmS ? "Actif" : null);
      if (!tmS && !pS.creer.some(c => c.colId === "Actif")) pS.creer.push({ colId: "Actif", type: "Bool", label: "Actif", isFormula: false, widgetOptions: "" });
      const kS = lS("cle").col, nS = lS("nom").col, eS = lS("etab").col;
      const idxS = new Map(), idxN = new Map(), posS = new Map(exS.id.map((rid, i) => [rid, i]));
      exS.id.forEach((rid, i) => { const k = kS && exS[kS] ? idDe(exS[kS][i], "SITE") : null; if (k && !idxS.has(k)) idxS.set(k, rid);
        const n = nS && exS[nS] && eS && exS[eS] ? `${refId(exS[eS][i])}|${nomNorm(exS[nS][i])}` : null; if (n && !idxN.has(n)) idxN.set(n, rid); });
      const prisS = new Set(), ajoutsS = [], majsS = [];
      let inchS = 0;
      const nvChoixS = new Map(), convS = convertisseur(nvChoixS, resolveurTexte());
      for (const l of sitesL) {
        const sid = idDe(l["Site ID"], "SITE"), eid = idDe(l["Établissement ID"], "ETAB"), oe = parId.get(eid);
        let ex = idxS.get(sid); if (ex != null && prisS.has(ex)) ex = null;
        if (ex == null && oe && oe.ex != null) { const r = idxN.get(`${oe.ex}|${nomNorm(l["Nom du site"])}`); if (r != null && !prisS.has(r)) ex = r; }
        if (ex != null) prisS.add(ex);
        const f = {}, refs = {}, occ = {}, remp = {};
        for (const c of pS.lignes) {
          if (!c.col) continue;
          // v8 : occupants (liste d'identifiants ETAB-…) et site qui remplace un site fusionné : résolus après l'écriture des sites
          if (c.occ) { const ids = [...new Set(String(l[c.entete] ?? "").match(/ETAB-[A-Z]{0,2}\d+/g) || [])]; if (ids.length) occ[c.col] = ids; continue; }
          if (c.siteRef) { const r = idDe(l[c.entete], "SITE"); if (r && r !== sid) remp[c.col] = r; continue; }
          if (c.etab) { const r = idDe(l[c.entete], "ETAB"); if (r) refs[c.col] = r; else if (c.entete === "Composante concernée" && fS.nom === "Sites" && idDe(l["Établissement ID"], "ETAB")) refs[c.col] = null; continue; }   // v7 : composante vide = aucune
          const v = c.cleRef ? sid : await convS(c.meta, l[c.entete]);
          if (v !== undefined) f[c.col] = v;
        }
        if (ex == null) { if (cActif && f[cActif] === undefined) f[cActif] = true; ajoutsS.push({ sid, f, refs, occ, remp }); continue; }
        const i = posS.get(ex), diff = {};
        for (const [k, v] of Object.entries(f)) if (!memeValeur(exS[k] ? exS[k][i] : undefined, v)) diff[k] = v;
        majsS.push({ sid, id: ex, f: diff, refs, occ, remp, avant: Object.fromEntries([...Object.keys(refs), ...Object.keys(occ), ...Object.keys(remp)].map(k => [k, exS[k] ? exS[k][i] : null])) });
      }
      // sites fusionnés ou fermés déjà dans Grist : références (signalements, sièges, correspondances…) à reporter
      const lRemp = pS.lignes.find(c => c.siteRef && c.col);
      const fusionnesS = lRemp ? majsS.filter(m => m.remp[lRemp.col]).map(m => ({ ex: m.id, sid: m.sid, vers: m.remp[lRemp.col] })) : [];
      const referencesS = tS && fusionnesS.length ? await window.References.chercher(ctx.meta, tS, new Set(fusionnesS.map(x => x.ex)), { exclure: (t, c) => t === tS && c === lRemp.col }) : [];
      sites = { table: tS || TABLE_SITES, cree: !tS, plan: pS, ajouts: ajoutsS, majs: majsS, nouveauxChoix: nvChoixS, cleCol: kS, ex: exS, fusionnes: fusionnesS, references: referencesS,
        occupants: [...ajoutsS, ...majsS].filter(x => Object.keys(x.occ).length).length,
        absents: exS.id.filter(rid => !prisS.has(rid)).map(rid => String(nS && exS[nS] ? exS[nS][posS.get(rid)] ?? "" : rid)) };
      inchS = majsS.filter(m => !Object.keys(m.f).length).length; sites.inchanges = inchS;
    }

    // correspondances (sites saisis dans la base d'octobre)
    let alias = null;
    if (fA && sites) {
      const exA = ctx.meta[TABLE_ALIAS] ? await grist.docApi.fetchTable(TABLE_ALIAS) : null, idxA = new Map();
      if (exA) exA.id.forEach((rid, i) => idxA.set(`${refId((exA.Etablissement || [])[i]) || 0}|${nomNorm((exA.Libelle || [])[i])}`, { rid, statut: String((exA.Statut || [])[i] || ""), site: refId((exA.Site || [])[i]) }));
      const lignesA = [], vus = new Set();
      let decides = 0;
      for (const l of fA.lignes) {
        const eid = idDe(l["Établissement ID"], "ETAB"), lib = String(l["Site saisi"] ?? "").trim(); if (!eid || !lib || !parId.has(eid)) continue;
        const sid = idDe(l["Site ID"], "SITE"), oe = parId.get(eid), k = `${eid}|${nomNorm(lib)}`; if (vus.has(k)) continue; vus.add(k);
        const deja = oe.ex != null ? idxA.get(`${oe.ex}|${nomNorm(lib)}`) : null;
        if (deja && /valid|cart/i.test(deja.statut)) { decides++; continue; }
        lignesA.push({ eid, lib, sid, statut: sid ? "Validé" : "Écarté", deja });
      }
      alias = { cree: !exA, lignes: lignesA, decides };
    }

    // tables annexes (format v8) : lues ici, écrites après les établissements et les sites
    const annexes = [];
    for (const def of ANNEXES) {
      const f = await classeur.lireUne(FEUILLES[def.feuille]); if (!f || !def.cles.every(h => f.entetes.includes(h))) continue;
      const lignesA = f.lignes.filter(l => def.cles.every(h => !vide(l[h])));
      annexes.push({ def, lignes: lignesA, existe: !!ctx.meta[def.table], avant: ctx.meta[def.table] ? (await grist.docApi.fetchTable(def.table)).id.length : 0 });
    }

    return { ctx, table, tm, plan: pE, cLat, cLon, lCle, lRatt, existant, lignes, parId, ajouts, majs, inchanges, parMode, coordsCompletees, absorbees, references,
      absentes: absentes.map(nomEx), nouveauxChoix, sites, alias, annexes,
      retirees, membres: lignes.filter(o => o.membres.length).length, sieges: lignes.filter(o => o.siege).length, stats: { etab: lignes.length, niveaux: lignes.reduce((a, o) => { const n = String(o.l.Niveau || "?"); a[n] = (a[n] || 0) + 1; return a; }, {}) } };
  }

  /* ---------- Rendu ---------- */
  function dessiner(message, type) {
    if (!racine) return;
    const a = analyse;
    const ligneT = (lib, val) => `<tr><td>${lib}</td><td>${val}</td></tr>`;
    const colonnes = (p, t) => p.creer.length ? `<p class="aide">Colonnes créées dans ${esc(t)} : ${p.creer.map(c => `<code>${esc(c.colId)}</code>`).join(" ")}</p>` : "";
    const formules = p => { const f = p.lignes.filter(l => l.formule); return f.length ? `<p class="aide">Colonnes formules laissées telles quelles : ${f.map(l => `<code>${esc(l.formule)}</code>`).join(" ")}</p>` : ""; };
    const facultatifs = (p, cleOpt) => p.facultatifs.length ? `<details class="esr-options"><summary>Autres colonnes du classeur (${p.facultatifs.length}) : cochées, elles sont reprises dans Grist</summary>
      <div class="esr-cases">${p.facultatifs.map(f => `<label><input type="checkbox" data-opt="${cleOpt}" value="${esc(f.entete)}"${f.formule ? " disabled" : ""}${(optionsCochees[cleOpt] ? optionsCochees[cleOpt].includes(f.entete) : f.existante) ? " checked" : ""}> ${esc(f.entete)}${f.existante ? ` <span class="aide">(${f.formule ? "formule" : "colonne existante"})</span>` : ""}</label>`).join("")}</div></details>` : "";
    racine.innerHTML = `<h2>Référentiel de l'enseignement supérieur (classeur)</h2>
      <p class="aide">Import du classeur consolidé des établissements, composantes et sites (onglets ${nomsF("etab")}, ${nomsF("sites")}, ${nomsF("alias")}, ${nomsF("fusions")}).
        Les lignes sont rapprochées par identifiant (ETAB-…, SITE-…), puis UAI, puis nom : les existantes sont mises à jour, les nouvelles ajoutées. Rien n'est supprimé, une cellule vide n'efface rien.
        Un bilan s'affiche avant toute écriture ; un classeur corrigé peut être réimporté.</p>
      <p class="aide esr-regle">Unité de compte : <strong>une personne morale = un établissement</strong> (règle des 3 questions, appliquée dans le classeur depuis la v7).
        Une composante interne (UFR, IUT, école interne d'une université, d'un INP ou de l'IMT…) est rattachée à sa personne morale ; ses sites restent ceux de la personne morale, la composante dans « Composante concernée ».
        Le rattachement est effacé sur les lignes de niveau « Établissement ».</p>
      <div class="esr-outils">
        <label>Classeur <input type="file" id="esr-fichier" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></label>
        ${a && a.ctx.cibles.length > 1 ? `<label>Référentiel des établissements <select id="esr-table">${a.ctx.cibles.map(t => `<option${t === a.table ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></label>` : ""}
      </div>
      ${nomFichier && !a && !message ? `<p class="aide">Lecture de ${esc(nomFichier)}…</p>` : ""}
      ${a ? `
      <h3 class="esr-titre">Établissements → ${esc(a.table)}</h3>
      <table class="eq-table esr-bilan"><tbody>
        ${ligneT("Lignes du classeur", `<strong>${nf(a.stats.etab)}</strong> <span class="aide">(${Object.entries(a.stats.niveaux).map(([k, n]) => `${esc(k)} : ${nf(n)}`).join(", ")})</span>`)}
        ${ligneT("À ajouter", `<strong>${nf(a.ajouts.length)}</strong>`)}
        ${ligneT("À mettre à jour", `<strong>${nf(a.majs.length)}</strong> <span class="aide">rapprochées : ${nf(a.parMode.identifiant)} par identifiant, ${nf(a.parMode.UAI)} par UAI, ${nf(a.parMode.nom)} par nom</span>`)}
        ${ligneT("Inchangées", nf(a.inchanges))}
        ${a.membres ? ligneT("Membre de", `${nf(a.membres)} établissement(s) membre(s) d'un regroupement (EPE, IEP rattaché…)`) : ""}
        ${a.sieges ? ligneT("Siège", `${nf(a.sieges)} établissement(s) avec un site désigné comme siège${a.sites ? "" : " <span class=\"aide\">(sans onglet des sites : seuls les sièges déjà dans Grist sont repris)</span>"}`) : ""}
        ${ligneT("Coordonnées reprises d'un site", `${nf(a.coordsCompletees)} <span class="aide">(établissements sans coordonnées : site de la même commune)</span>`)}
        ${a.absorbees.length ? ligneT(a.retirees ? "Lignes retirées" : "Lignes fusionnées", `${nf(a.absorbees.length)} ligne(s) existante(s) ${a.retirees ? "retirée(s) (devenues des sites ou fusionnées)" : "absorbée(s) par un autre établissement"} : marquées dans les colonnes État et Remplacé par, conservées.
          ${a.references.length ? `<br><label><input type="checkbox" id="esr-reporter"${reporter ? " checked" : ""}> reporter les ${nf(a.references.length)} référence(s) (signalements, sites…) sur l'établissement conservé</label>` : ""}`) : ""}
        ${a.absentes.length ? ligneT("Lignes absentes du classeur", `${nf(a.absentes.length)} <span class="aide">conservées : ${a.absentes.slice(0, 12).map(esc).join(" ; ")}${a.absentes.length > 12 ? " ; …" : ""}</span>`) : ""}
        ${a.nouveauxChoix.size ? ligneT("Choix ajoutés", [...a.nouveauxChoix].map(([c, s]) => `<code>${esc(c)}</code> : ${[...s].slice(0, 8).map(esc).join(", ")}${s.size > 8 ? "…" : ""}`).join("<br>")) : ""}
      </tbody></table>
      ${colonnes(a.plan, a.table)}${formules(a.plan)}${facultatifs(a.plan, "etab")}
      ${a.sites ? `<h3 class="esr-titre">Campus et sites → ${esc(a.sites.table)}${a.sites.cree ? " <span class=\"pastille reco\">table créée</span>" : ""}</h3>
      <table class="eq-table esr-bilan"><tbody>
        ${ligneT("Sites du classeur", `<strong>${nf(a.sites.ajouts.length + a.sites.majs.length)}</strong>`)}
        ${ligneT("À ajouter", `<strong>${nf(a.sites.ajouts.length)}</strong>`)}
        ${ligneT("Existants", `${nf(a.sites.majs.length)} <span class="aide">(dont ${nf(a.sites.inchanges)} sans changement de valeur)</span>`)}
        ${a.sites.occupants ? ligneT("Occupants", `${nf(a.sites.occupants)} site(s) avec d'autres établissements ou composantes occupants`) : ""}
        ${a.sites.fusionnes.length ? ligneT("Sites fusionnés ou fermés", `${nf(a.sites.fusionnes.length)} site(s) déjà dans Grist, remplacé(s) par un autre site (colonne Remplacé par)
          ${a.sites.references.length ? `<br><label><input type="checkbox" id="esr-reporter-sites"${reporterSites ? " checked" : ""}> reporter les ${nf(a.sites.references.length)} référence(s) (signalements, sièges, correspondances…) sur le site qui le remplace</label>` : ""}`) : ""}
        ${a.sites.absents.length ? ligneT("Sites absents du classeur", `${nf(a.sites.absents.length)} <span class="aide">conservés : ${a.sites.absents.slice(0, 12).map(esc).join(" ; ")}${a.sites.absents.length > 12 ? " ; …" : ""}</span>`) : ""}
      </tbody></table>${a.sites.cree ? "" : colonnes(a.sites.plan, a.sites.table)}${formules(a.sites.plan)}${facultatifs(a.sites.plan, "sites")}` : `<p class="aide">Pas d'onglet ${nomsF("sites")} : sites non importés.</p>`}
      ${a.alias ? `<h3 class="esr-titre">Sites saisis dans la base d'octobre → ${TABLE_ALIAS}${a.alias.cree ? " <span class=\"pastille reco\">table créée</span>" : ""}</h3>
        <p>${nf(a.alias.lignes.filter(l => l.statut === "Validé").length)} correspondance(s) libellé saisi → site, ${nf(a.alias.lignes.filter(l => l.statut !== "Validé").length)} saisie(s) visant l'établissement entier (écartées)${a.alias.decides ? `, ${nf(a.alias.decides)} déjà décidée(s) dans Grist (inchangées)` : ""}.</p>` : ""}
      ${a.annexes.length ? `<h3 class="esr-titre">Tables annexes (unités de l'Atlas, effectifs, liaisons)</h3>
      <table class="eq-table esr-bilan"><tbody>
        ${a.annexes.map(x => ligneT(`${esc(x.def.titre)} → ${esc(x.def.table)}${x.existe ? "" : " <span class=\"pastille reco\">table créée</span>"}`,
          `<strong>${nf(x.lignes.length)}</strong> ligne(s) dans le classeur${x.existe ? ` <span class="aide">(${nf(x.avant)} dans Grist ; rapprochées par ${x.def.cles.join(" + ")}${x.def.derivees ? ` ; liaisons « ${esc(x.def.derivees.valeur)} » recalculées : celles absentes du classeur sont retirées` : ""})</span>` : ""}`)).join("")}
      </tbody></table>
      <p class="aide">Colonnes formules créées si absentes : effectif de la dernière année par unité (Unites_Atlas), par site, par établissement ou composante ;
        « Nom calculé » et « Libellé » des sites (nom d'usage, nom court d'un monosite, voie ; composantes présentes rangées par effectif).</p>` : ""}
      <div class="boutons"><button class="primaire" id="esr-importer"${enCours ? " disabled" : ""}>Importer dans Grist</button><span class="statut${type ? ` ${type}` : ""}" id="esr-statut" role="status">${esc(message || "")}</span></div>`
      : message ? `<p class="statut ${type || ""}" id="esr-statut" role="status">${esc(message)}</p>` : ""}`;
    lier();
  }
  function lier() {
    const f = $("esr-fichier");
    if (f) f.addEventListener("change", async () => {
      const fichier = f.files && f.files[0]; if (!fichier) return;
      nomFichier = fichier.name; classeur = null; analyse = null; optionsCochees.etab = optionsCochees.sites = null; dessiner();
      try { classeur = await lireClasseur(fichier); } catch (e) { dessiner(e.message || String(e), "err"); return; }
      await relancer();
    });
    const t = $("esr-table"); if (t) t.addEventListener("change", () => { choixTable = t.value; optionsCochees.etab = optionsCochees.sites = null; relancer(); });
    const r = $("esr-reporter"); if (r) r.addEventListener("change", () => { reporter = r.checked; });
    const rs = $("esr-reporter-sites"); if (rs) rs.addEventListener("change", () => { reporterSites = rs.checked; });
    racine.querySelectorAll("[data-opt]").forEach(c => c.addEventListener("change", () => {
      const k = c.dataset.opt; optionsCochees[k] = [...racine.querySelectorAll(`[data-opt="${k}"]:checked`)].map(x => x.value);
      const ouverts = [...racine.querySelectorAll("details.esr-options")].map(d => d.open);
      relancer().then(() => racine.querySelectorAll("details.esr-options").forEach((d, i) => { if (ouverts[i]) d.open = true; }));
    }));
    const b = $("esr-importer"); if (b) b.addEventListener("click", importer);
  }
  async function relancer(message, type) {
    if (!classeur) { dessiner(message, type); return; }
    try { analyse = await analyser(); dessiner(message, type); }
    catch (e) { analyse = null; dessiner(e.message || String(e), "err"); }
  }
  const dire = (t, type) => { const s = $("esr-statut"); if (s) { s.textContent = t; s.className = `statut ${type || ""}`; } };

  /* ---------- Import ---------- */
  const actions = acts => grist.docApi.applyUserActions(acts);
  async function parLots(acts, quoi) {
    for (let k = 0; k < acts.length; k += LOT) { dire(`${quoi} : ${nf(Math.min(k + LOT, acts.length))} / ${nf(acts.length)}…`); await actions(acts.slice(k, k + LOT)); }
  }
  async function ajouterLignes(table, lignes, quoi) {
    const cols = [...new Set(lignes.flatMap(f => Object.keys(f)))];
    for (let k = 0; k < lignes.length; k += LOT) {
      const lot = lignes.slice(k, k + LOT);
      dire(`${quoi} : ${nf(Math.min(k + LOT, lignes.length))} / ${nf(lignes.length)}…`);
      await actions([["BulkAddRecord", table, lot.map(() => null), Object.fromEntries(cols.map(c => [c, lot.map(f => f[c] === undefined ? null : f[c])]))]]);
    }
  }
  async function etendreChoix(table, carte) {
    if (!carte.size) return;
    const meta = await S.lireMeta(), acts = [];
    for (const [c, s] of carte) {
      const m = meta[table] && meta[table].colonnes[c]; if (!m || !/^Choice/.test(m.type)) continue;
      let o = {}; try { o = JSON.parse(m.widgetOptions || "{}") || {}; } catch (_) { o = {}; }
      const ch = Array.isArray(o.choices) ? o.choices : [];
      acts.push(["ModifyColumn", table, c, { widgetOptions: JSON.stringify({ ...o, choices: ch.concat([...s].filter(x => !ch.includes(x))) }) }]);
    }
    if (acts.length) await actions(acts);
  }

  /* ---------- Tables annexes (format v8) ---------- */
  // date du classeur : numéro de série Excel, ou texte AAAA-MM-JJ → secondes (Date de Grist)
  const dateGrist = v => { if (typeof v === "number") return v > 1e7 ? v : Math.round((v - 25569) * 86400); const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? "")); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 1000 : null; };
  async function importerAnnexes(a, rowDe, siteDe, tSites) {
    const bilan = []; let creees = false;
    const etabInv = new Map([...rowDe].map(([k, r]) => [r, k])), siteInv = new Map([...siteDe].map(([k, r]) => [r, k]));
    for (const x of a.annexes) {
      const def = x.def, cols = def.cols.filter(c => c.ref !== "site" || tSites);
      const typeDe = c => c.ref === "etab" ? `Ref:${a.table}` : c.ref === "site" ? `Ref:${tSites}` : c.type || "Text";
      let meta = await S.lireMeta();
      if (!meta[def.table]) {
        await actions([["AddTable", def.table, cols.map(c => ({ id: c.id, type: typeDe(c), isFormula: false }))]]);
        await actions(cols.flatMap(c => [["ModifyColumn", def.table, c.id, { untieColIdFromLabel: true }], ["ModifyColumn", def.table, c.id, { label: c.entete }]]));
        creees = true;
      } else {
        const manq = cols.filter(c => !meta[def.table].colonnes[c.id]);
        if (manq.length) await actions(manq.map(c => ["AddColumn", def.table, c.id, { type: typeDe(c), label: c.entete, isFormula: false, untieColIdFromLabel: true }]));
      }
      meta = await S.lireMeta(); const tm = meta[def.table], choix = new Map();
      const ecrit = cols.filter(c => tm.colonnes[c.id] && !tm.colonnes[c.id].isFormula);
      const val = (c, v) => {
        if (c.ref === "etab") { const id = idDe(v, "ETAB"); return id ? rowDe.get(id) || 0 : 0; }
        if (c.ref === "site") { const id = idDe(v, "SITE"); return id ? siteDe.get(id) || 0 : 0; }
        if (vide(v)) return null;
        const t = c.type || "Text";
        if (t === "Int") { const n = typeof v === "number" ? v : Number(String(v).replace(",", ".").replace(/\s/g, "")); return Number.isFinite(n) ? Math.round(n) : null; }
        if (t === "Bool") return typeof v === "boolean" ? v : /^(oui|vrai|true|1|x)$/i.test(String(v).trim());
        if (t === "Date") return dateGrist(v);
        const s2 = typeof v === "string" ? v.trim() : String(v);
        if (t === "Choice") { if (!choix.has(c.id)) choix.set(c.id, new Set()); choix.get(c.id).add(s2); }
        return s2;
      };
      const ex = await grist.docApi.fetchTable(def.table), colDe = h => cols.find(c => c.entete === h);
      const cleEx = i => def.cles.map(h => { const c = colDe(h), v = c && ex[c.id] ? ex[c.id][i] : null;
        return !c ? "" : c.ref === "etab" ? etabInv.get(refId(v)) || "" : c.ref === "site" ? siteInv.get(refId(v)) || "" : String(v ?? "").trim(); }).join("|");
      const cleCl = l => def.cles.map(h => { const c = colDe(h); return !c ? "" : c.ref ? idDe(l[h], c.ref === "etab" ? "ETAB" : "SITE") || "" : String(l[h] ?? "").trim(); }).join("|");
      const idx = new Map(), pos = new Map(ex.id.map((rid, i) => [rid, i]));
      ex.id.forEach((rid, i) => { const k = cleEx(i); if (!idx.has(k)) idx.set(k, rid); });
      const vus = new Set(), ajouts = [], majs = [];
      for (const l of x.lignes) {
        const k = cleCl(l); if (vus.has(k)) continue; vus.add(k);
        const f = {};
        for (const c of ecrit) { if (!(c.entete in l)) continue; const v = val(c, l[c.entete]); if (v === null) continue; f[c.id] = v; }
        const rid = idx.get(k);
        if (rid == null) { ajouts.push(f); continue; }
        const i = pos.get(rid), diff = {};
        for (const [c, v] of Object.entries(f)) if (!memeValeur(ex[c] ? ex[c][i] : undefined, v)) diff[c] = v;
        if (Object.keys(diff).length) majs.push(["UpdateRecord", def.table, rid, diff]);
      }
      await etendreChoix(def.table, choix);
      await ajouterLignes(def.table, ajouts, def.titre); await parLots(majs, def.titre);
      // liaisons dérivées (origine « Unité Atlas ») absentes du classeur : retirées, elles se recalculent à chaque version
      let retirees = 0;
      if (def.derivees && ex[def.derivees.col]) {
        const rm = ex.id.filter((rid, i) => String(ex[def.derivees.col][i] ?? "") === def.derivees.valeur && !vus.has(cleEx(i)));
        for (let k = 0; k < rm.length; k += LOT) await actions([["BulkRemoveRecord", def.table, rm.slice(k, k + LOT)]]);
        retirees = rm.length;
      }
      bilan.push(`${def.table} : ${nf(ajouts.length)} ajoutée(s), ${nf(majs.length)} mise(s) à jour${retirees ? `, ${nf(retirees)} retirée(s)` : ""}`);
    }
    return { bilan, creees };
  }
  /* Colonnes formules (créées si absentes, jamais modifiées si elles existent) : effectifs de la dernière année et noms des sites */
  async function poserFormules(a, tSites) {
    const meta = await S.lireMeta(), acts = [], noms = [], E = a.table, tmE = meta[E], tmS = tSites ? meta[tSites] : null;
    const ajout = (t, id, label, type, formula) => { if (!meta[t] || meta[t].colonnes[id]) return; acts.push(["AddColumn", t, id, { type, label, isFormula: true, formula, untieColIdFromLabel: true }]); noms.push(`${t}.${id}`); };
    const colE = id => { const l = a.plan.lignes.find(x => x.id === id && x.col); return l && tmE.colonnes[l.col] ? l.col : (tmE.colonnes[id] ? id : null); };
    const colS = id => { if (!tmS) return null; const l = a.sites && a.sites.plan.lignes.find(x => x.id === id && x.col); return l && tmS.colonnes[l.col] ? l.col : (tmS.colonnes[id] ? id : null); };
    if (meta.Unites_Atlas && meta.Effectifs)
      ajout("Unites_Atlas", "Effectif", "Effectif (dernière année)", "Int", "r = Effectifs.lookupRecords(UAI=$UAI)\nreturn max(r, key=lambda x: x.Annee or 0).Effectif if r else None");
    const effU = !!(meta.Unites_Atlas && (meta.Unites_Atlas.colonnes.Effectif || noms.includes("Unites_Atlas.Effectif")));
    const niv = colE("Niveau");
    if (effU) {
      ajout(E, "Effectif_Atlas", "Effectif (Atlas, dernière année)", "Int", (niv ? `if $${niv} == "Composante interne":\n  return sum(u.Effectif or 0 for u in Unites_Atlas.lookupRecords(Composante=$id))\n` : "")
        + "return sum(u.Effectif or 0 for u in Unites_Atlas.lookupRecords(Etablissement=$id))");
      if (tmS) ajout(tSites, "Etudiants_Atlas", "Étudiants (Atlas, dernière année)", "Int", "return sum(u.Effectif or 0 for u in Unites_Atlas.lookupRecords(Site=$id))");
    }
    if (tmS) {
      const cE = colS("Etablissement"), cC = colS("Composante"), cO = colS("Occupants"), cCo = colS("Commune"), cU = colS("Nom_usage"), cV = colS("Voie"), cA = colS("Actif");
      const court = colE("Nom_court"), nom = colE("Nom"), sigle = colE("Sigle");
      if (cCo && cU && cV) {   // colonnes du format v8 : la formule n'est posée qu'une fois toutes présentes
        const monosite = cE && court ? `if not u and $${cE}${cC ? ` and not $${cC}` : ""}${cO ? ` and not $${cO}` : ""}:\n`
          + `  if len([s for s in ${tSites}.lookupRecords(${cE}=$${cE}.id)${cA ? ` if s.${cA}` : ""}]) == 1:\n    u = ($${cE}.${court} or "").strip()\n` : "";
        ajout(tSites, "Nom_calcule", "Nom calculé", "Text", [
          "import re", `c = ($${cCo} or "").strip()`,
          "if not c:\n  base = \"Site\"", "elif c.startswith(\"Le \"):\n  base = \"Site du \" + c[3:]", "elif c.startswith(\"Les \"):\n  base = \"Site des \" + c[4:]",
          "elif c[:2] in (\"L'\", u\"L\u2019\"):\n  base = \"Site de l'\" + c[2:]", "elif re.match(u\"[AEIOUYÀÂÄÉÈÊËÎÏÔÖÙÛÜ]\", c[0].upper()):\n  base = \"Site d'\" + c", "else:\n  base = \"Site de \" + c",
          `u = (${cU ? `$${cU}` : "\"\""} or "").strip()`, monosite.trimEnd(), cV ? `if not u:\n  u = ($${cV} or "").strip()` : "", "return base + (u\" \u2013 \" + u if u else \"\")"].filter(Boolean).join("\n"));
      }
      if (meta.Liaisons_sites && cE) {
        const nc = [court, sigle, nom].filter(Boolean).map(c => `c.${c}`).join(" or ") || "\"\"";
        ajout(tSites, "Libelle", "Libellé", "Text", [
          (tmS.colonnes.Nom_calcule || noms.includes(`${tSites}.Nom_calcule`)) ? "n = $Nom_calcule or \"\"" : `n = $${colS("Nom") || "Nom"} or ""`, "vus = set()", "parts = []",
          "for l in Liaisons_sites.lookupRecords(Site=$id):", "  c = l.Composante", "  if not c or c.id in vus:\n    continue", "  vus.add(c.id)",
          effU ? "  eff = sum(u.Effectif or 0 for u in Unites_Atlas.lookupRecords(Site=$id, Composante=c.id))" : "  eff = 0", "  parts.append((eff, c))",
          court ? `ec = ($${cE}.${court} or "").strip() if $${cE} else ""` : "ec = \"\"", "noms = []",
          "for eff, c in sorted(parts, key=lambda x: -x[0])[:4]:", `  x = (${nc} or "").strip()`, "  if x and x != ec and x not in noms:\n    noms.append(x)",
          "return n + (\" (\" + \" - \".join(noms) + \")\" if noms else \"\")"].join("\n"));
      }
    }
    if (acts.length) await actions(acts);
    return noms;
  }
  async function importer() {
    if (!analyse || enCours) return;
    enCours = true; const b = $("esr-importer"); if (b) b.disabled = true;
    const a = analyse, table = a.table;
    try {
      let tablesCreees = false;
      // 1. colonnes du référentiel des établissements
      const creerE = a.plan.creer.filter(c => !c.differe);   // Siège : créée après le référentiel des sites
      if (creerE.length) await actions(creerE.map(c => ["AddColumn", table, c.colId, { type: c.type, label: c.label, isFormula: false, untieColIdFromLabel: true }]));
      const niveau = a.plan.lignes.find(l => l.id === "Niveau" && l.cree);
      if (niveau && !a.nouveauxChoix.has(niveau.col)) a.nouveauxChoix.set(niveau.col, new Set(Object.keys(a.stats.niveaux)));
      await etendreChoix(table, a.nouveauxChoix);
      // 2. nouveaux établissements, puis identifiants de lignes
      await ajouterLignes(table, a.ajouts.map(x => x.f), "Établissements ajoutés");
      const colCle = a.lCle && a.lCle.col;
      const t2 = await grist.docApi.fetchTable(table), rowDe = new Map();
      if (colCle && t2[colCle]) t2.id.forEach((rid, i) => { const k = idDe(t2[colCle][i], "ETAB"); if (k && !rowDe.has(k)) rowDe.set(k, rid); });
      a.lignes.forEach(o => { if (o.ex != null) rowDe.set(o.id, o.ex); });
      const pos2 = new Map(t2.id.map((rid, i) => [rid, i]));
      // 3. mises à jour, rattachements, lignes absorbées
      const champs = new Map(a.majs.map(m => [m.id, { ...m.f }]));
      const champsDe = rid => { if (!champs.has(rid)) champs.set(rid, {}); return champs.get(rid); };
      if (a.lRatt && a.lRatt.col) {
        const m = (await S.lireMeta())[table].colonnes[a.lRatt.col], estRef = m && m.type === `Ref:${table}`;
        for (const o of a.lignes) {
          const rid = rowDe.get(o.id); if (rid == null) continue;
          const avant = t2[a.lRatt.col] ? t2[a.lRatt.col][pos2.get(rid)] : null;
          // école séparée de son groupe : rattachement effacé
          if (o.rattEfface) { if (estRef ? refId(avant) : !vide(avant)) champsDe(rid)[a.lRatt.col] = estRef ? 0 : null; continue; }
          const v = estRef ? (o.ratt ? rowDe.get(o.ratt) || null : null) : (vide(o.rattTexte) ? null : String(o.rattTexte));
          if (v == null) continue;
          if (!memeValeur(estRef ? refId(avant) : avant, v)) champsDe(rid)[a.lRatt.col] = v;
        }
      }
      // Membre de : liste de références (une cellule vide n'efface rien)
      const lMembre = a.plan.lignes.find(l => l.liste && l.col);
      if (lMembre) for (const o of a.lignes) {
        if (!o.membres.length) continue;
        const rid = rowDe.get(o.id); if (rid == null) continue;
        const ids = [...new Set(o.membres.map(m => rowDe.get(m)).filter(x => x != null && x !== rid))]; if (!ids.length) continue;
        const avant = t2[lMembre.col] ? t2[lMembre.col][pos2.get(rid)] : null, av = Array.isArray(avant) ? avant.slice(avant[0] === "L" ? 1 : 0) : [];
        if (av.length !== ids.length || av.some((x, k) => x !== ids[k])) champsDe(rid)[lMembre.col] = ["L", ...ids];
      }
      const colEtat = (a.plan.lignes.find(l => l.id === "Etat") || {}).col;
      let colRemp = null;
      if (a.absorbees.length) {
        const m = (await S.lireMeta())[table];
        colRemp = (Object.values(m.colonnes).find(c => c.type === `Ref:${table}` && /remplac/i.test(c.colId)) || {}).colId || null;
        if (!colRemp) { await actions([["AddColumn", table, "Remplace_par", { type: `Ref:${table}`, label: "Remplacé par", isFormula: false, untieColIdFromLabel: true }]]); colRemp = "Remplace_par"; }
      }
      for (const x of a.absorbees) {
        const f = champsDe(x.ex);
        if (colEtat) f[colEtat] = a.retirees ? `Retiré : ${x.resultat ? x.resultat.toLowerCase() + ", " : ""}remplacé par ${x.vers}${x.nom ? ` (${x.nom})` : ""}` : `Fusionnée dans ${x.vers}${x.nom ? ` (${x.nom})` : ""}`;
        if (colRemp && rowDe.get(x.vers) != null) f[colRemp] = rowDe.get(x.vers);
        if (colCle && vide(t2[colCle] && t2[colCle][pos2.get(x.ex)])) f[colCle] = x.sup;
      }
      await parLots([...champs].filter(([, f]) => Object.keys(f).length).map(([rid, f]) => ["UpdateRecord", table, rid, f]), "Établissements mis à jour");
      // 4. références vers les lignes absorbées
      let reportees = 0;
      if (reporter && a.references.length) {
        const vers = new Map(a.absorbees.map(x => [x.ex, rowDe.get(x.vers)]).filter(([, r]) => r != null));
        const acts = window.References.actions(a.references, vers);
        await parLots(acts, "Références reportées"); reportees = acts.length;
      }
      // 5. sites
      let nSitesA = 0, nSitesM = 0, reporteesS = 0;
      const siteDe = new Map();
      if (a.sites) {
        const s = a.sites;
        if (s.cree) {
          const d0 = s.plan.creer.filter(c => !c.differe), d1 = s.plan.creer.filter(c => c.differe);   // Remplacé par : vers la table elle-même, après sa création
          await actions([["AddTable", s.table, d0.map(c => ({ id: c.colId, type: c.type, isFormula: false }))]]);
          // libellés : identifiant détaché du libellé d'abord, sinon Grist renommerait la colonne
          await actions(d0.flatMap(c => [["ModifyColumn", s.table, c.colId, { untieColIdFromLabel: true }], ["ModifyColumn", s.table, c.colId, { label: c.label }]]));
          if (d1.length) await actions(d1.map(c => ["AddColumn", s.table, c.colId, { type: `Ref:${s.table}`, label: c.label, isFormula: false, untieColIdFromLabel: true }]));
          tablesCreees = true;
        } else if (s.plan.creer.length) await actions(s.plan.creer.map(c => ["AddColumn", s.table, c.colId, { type: c.type, label: c.label, isFormula: false, untieColIdFromLabel: true }]));
        await etendreChoix(s.table, s.nouveauxChoix);
        const avecRefs = (f, refs) => { const r = { ...f }; for (const [c, eid] of Object.entries(refs)) { const rid = eid === null ? null : rowDe.get(eid); if (rid != null) r[c] = rid; } return r; };
        await ajouterLignes(s.table, s.ajouts.map(x => avecRefs(x.f, x.refs)), "Sites ajoutés"); nSitesA = s.ajouts.length;
        const acts = [];
        for (const m of s.majs) {
          const f = { ...m.f };
          for (const [c, eid] of Object.entries(m.refs)) { const rid = eid === null ? 0 : rowDe.get(eid); if (rid != null && rid !== (refId(m.avant[c]) || 0)) f[c] = rid; }
          if (Object.keys(f).length) acts.push(["UpdateRecord", s.table, m.id, f]);
        }
        await parLots(acts, "Sites mis à jour"); nSitesM = acts.length;
        const tS = await grist.docApi.fetchTable(s.table), kS = (s.plan.lignes.find(l => l.cleRef) || {}).col;
        if (kS && tS[kS]) tS.id.forEach((rid, i) => { const k = idDe(tS[kS][i], "SITE"); if (k && !siteDe.has(k)) siteDe.set(k, rid); });
        // 5 a. occupants et site qui remplace (identifiants résolus maintenant que tous les sites existent)
        const posT = new Map(tS.id.map((rid, i) => [rid, i])), actsO = [];
        for (const x of [...s.ajouts, ...s.majs]) {
          const rid = siteDe.get(x.sid); if (rid == null) continue;
          const f = {}, i = posT.get(rid);
          for (const [c, ids] of Object.entries(x.occ || {})) {
            const v = [...new Set(ids.map(e => rowDe.get(e)).filter(r => r != null))]; if (!v.length) continue;
            const av = Array.isArray(tS[c] && tS[c][i]) ? tS[c][i].slice(tS[c][i][0] === "L" ? 1 : 0) : [];
            if (av.length !== v.length || av.some((r, k) => r !== v[k])) f[c] = ["L", ...v];
          }
          for (const [c, sid2] of Object.entries(x.remp || {})) { const r = siteDe.get(sid2); if (r != null && r !== rid && refId(tS[c] && tS[c][i]) !== r) f[c] = r; }
          if (Object.keys(f).length) actsO.push(["UpdateRecord", s.table, rid, f]);
        }
        await parLots(actsO, "Occupants et sites remplacés");
        // 5 b. références vers les sites fusionnés ou fermés → site qui les remplace
        if (reporterSites && s.references.length) {
          const vers = new Map(s.fusionnes.map(x => [x.ex, siteDe.get(x.vers)]).filter(([, r]) => r != null));
          const acts = window.References.actions(s.references, vers);
          await parLots(acts, "Références de sites reportées"); reporteesS = acts.length;
        }
      }
      // 5 bis. siège : référence vers le référentiel des sites (colonne créée au besoin)
      let nSieges = 0;
      if (a.sieges) {
        const tSites = a.sites ? a.sites.table : tableSitesDe(await contexte(), table);
        const meta = await S.lireMeta(), tm = meta[table];
        let cS = (a.plan.lignes.find(l => l.siege && l.col) || {}).col;
        if (cS && !tm.colonnes[cS] && tSites) await actions([["AddColumn", table, cS, { type: `Ref:${tSites}`, label: "Siège", isFormula: false, untieColIdFromLabel: true }]]);
        if (cS && tSites) {
          if (!siteDe.size) { const tS = await grist.docApi.fetchTable(tSites), kS = colonneIdentifiants(tS, "SITE"); if (kS) tS.id.forEach((rid, i) => { const k = idDe(tS[kS][i], "SITE"); if (k && !siteDe.has(k)) siteDe.set(k, rid); }); }
          const t3 = await grist.docApi.fetchTable(table), pos3 = new Map(t3.id.map((rid, i) => [rid, i])), acts = [];
          for (const o of a.lignes) {
            if (!o.siege) continue;
            const rid = rowDe.get(o.id), sid = siteDe.get(o.siege); if (rid == null || sid == null) continue;
            if (refId(t3[cS] ? t3[cS][pos3.get(rid)] : null) !== sid) acts.push(["UpdateRecord", table, rid, { [cS]: sid }]);
          }
          await parLots(acts, "Sièges"); nSieges = acts.length;
        }
      }
      // 6. correspondances
      let nAlias = 0;
      if (a.alias && a.alias.lignes.length) {
        const meta = await S.lireMeta();
        if (!meta[TABLE_ALIAS]) {
          await actions([["AddTable", TABLE_ALIAS, [["Etablissement", `Ref:${table}`], ["Libelle", "Text"], ["Site", `Ref:${a.sites.table}`], ["Occurrences", "Int"], ["Statut", "Choice"]].map(([id, type]) => ({ id, type, isFormula: false }))]]);
          await actions([["ModifyColumn", TABLE_ALIAS, "Statut", { widgetOptions: JSON.stringify({ choices: ["À valider", "Validé", "Écarté"], choiceOptions: { "Validé": { fillColor: "#B8FEC9" }, "Écarté": { fillColor: "#EEEEEE" } } }) }]]);
          tablesCreees = true;
        }
        const acts = [], ajouts = [];
        for (const l of a.alias.lignes) {
          const e = rowDe.get(l.eid); if (e == null) continue;
          const f = { Etablissement: e, Libelle: l.lib, Site: l.sid ? siteDe.get(l.sid) || 0 : 0, Statut: l.sid && siteDe.get(l.sid) ? "Validé" : "Écarté" };
          if (l.deja) acts.push(["UpdateRecord", TABLE_ALIAS, l.deja.rid, f]); else ajouts.push(f);
        }
        await parLots(acts, "Correspondances mises à jour"); await ajouterLignes(TABLE_ALIAS, ajouts, "Correspondances ajoutées");
        nAlias = acts.length + ajouts.length;
      }
      // 6 bis. tables annexes (unités de l'Atlas, effectifs, liaisons, confirmations) puis colonnes formules
      let bilanAnnexes = [], formulesPosees = [];
      if (a.annexes.length) {
        const tSites = a.sites ? a.sites.table : tableSitesDe(await contexte(), table);
        if (tSites && !siteDe.size) { const tS = await grist.docApi.fetchTable(tSites), kS = colonneIdentifiants(tS, "SITE"); if (kS) tS.id.forEach((rid, i) => { const k = idDe(tS[kS][i], "SITE"); if (k && !siteDe.has(k)) siteDe.set(k, rid); }); }
        const r = await importerAnnexes(a, rowDe, siteDe, tSites); bilanAnnexes = r.bilan; if (r.creees) tablesCreees = true;
        formulesPosees = await poserFormules(a, tSites);
      } else if (a.sites) formulesPosees = await poserFormules(a, a.sites.table);
      // 7. trace dans Config, règles d'accès des tables créées
      const config = await S.lireConfig();
      await actions([S.actionConfig(config, "referentiel_esr", { fichier: nomFichier, table, sites: a.sites ? a.sites.table : null, derniere_mise_a_jour: Date.now() / 1000,
        etablissements: a.stats.etab, ajoutes: a.ajouts.length, sites_importes: a.sites ? a.sites.ajouts.length + a.sites.majs.length : 0 })]);
      // Règles d'accès vérifiées après chaque import (tables et colonnes ajoutées), puis copie des colonnes lue par les
      // liens (établissements, agents invités) et les partenaires : sans elle, ces comptes travaillaient sur l'ancienne
      // structure du référentiel (2.62.0-alpha.61)
      let acces = "", accesErr = false;
      if (window.OngletAcces && window.OngletAcces.reappliquerSiBesoin) {
        try { const r = await window.OngletAcces.reappliquerSiBesoin(); if (r && ["incomplet", "refusees", "illisibles"].includes(r.etat)) { acces = ` Règles d'accès : ${r.texte}`; accesErr = true; } } catch (e) { acces = ` Règles d'accès non appliquées (${e.message || e}).`; accesErr = true; }
      }
      if (window.OngletAcces && window.OngletAcces.rafraichirCopies) {
        try { if (await window.OngletAcces.rafraichirCopies()) acces += " Copie des colonnes pour les liens et les invités mise à jour."; } catch (_) { /* rien */ }
      }
      if (S.viderCacheLecture) S.viderCacheLecture();
      const bilan = `Import terminé : ${nf(a.ajouts.length)} établissement(s) ajouté(s), ${nf(champs.size)} mis à jour${reportees ? `, ${nf(reportees)} référence(s) reportée(s)` : ""}${nSieges ? `, ${nf(nSieges)} siège(s)` : ""}`
        + (a.sites ? `, ${nf(nSitesA)} site(s) ajouté(s), ${nf(nSitesM)} mis à jour` : "") + (reporteesS ? `, ${nf(reporteesS)} référence(s) de site reportée(s)` : "") + (nAlias ? `, ${nf(nAlias)} correspondance(s)` : "") + "."
        + (bilanAnnexes.length ? ` Tables annexes : ${bilanAnnexes.join(" ; ")}.` : "") + (formulesPosees.length ? ` Formules créées : ${formulesPosees.join(", ")}.` : "") + acces;
      enCours = false;
      await relancer(bilan, accesErr ? "err" : "ok");
      if (window.OngletSitesESR) window.OngletSitesESR.afficher();
    } catch (e) {
      enCours = false;
      dire(`Import interrompu : ${e.message || e}. Relancez l'import : les lignes déjà écrites seront reconnues.`, "err");
      const b2 = $("esr-importer"); if (b2) b2.disabled = false;
    }
  }

  async function afficher() {
    racine = $("ref-esr"); if (!racine) return;
    if (classeur) { await relancer(); return; }
    let ctx = null;
    try { ctx = await contexte(); } catch (e) { racine.innerHTML = `<h2>Référentiel de l'enseignement supérieur (classeur)</h2><p class="statut err">${esc(e.message || e)}</p>`; return; }
    let info = "";
    const r = ctx.config.valeurs.referentiel_esr;
    if (r && r.derniere_mise_a_jour) info = `Dernier import : ${new Date(r.derniere_mise_a_jour * 1000).toLocaleString("fr-FR")}, ${r.fichier ? `« ${r.fichier} », ` : ""}${nf(r.etablissements)} ligne(s) dans ${r.table}.`;
    dessiner();
    if (info) racine.querySelector(".esr-outils").insertAdjacentHTML("afterend", `<p class="aide">${esc(info)}</p>`);
  }
  window.OngletReferentielESR = { afficher, lireClasseur, analyse: () => analyse };
})();
