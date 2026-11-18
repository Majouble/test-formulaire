/* =====================================================================
   Fiche établissement — moteur (calcul des tuiles, sans affichage)
   ---------------------------------------------------------------------
   Définit : window.FicheMoteur = { CONFIG_VIDE, TUILE_VIDE, MODES, normaliserConfig(c), tablesNecessaires(config, schema),
             verifierConfig(config, schema), creerLecteur(schema, tables), preparer(config, lecteur, ctx),
             construireFiche(config, lecteur, etabId, base), dimensionsRapides, compterValeurs, passeRapides,
             selectionner(config, lecteur, etat, FiltresColonnes, base), sourcesFiltres(config), jourISO, texteJour, estDate }.
   Utilise : rien ; les filtres avancés reçoivent le moteur FiltresColonnes en paramètre (commun/filtres-colonnes.js).
   Fonctionne aussi sous Node pour les essais (module.exports).

   Une fiche montre UN établissement du référentiel. Elle est faite de badges (appartenance à une liste, oui ou non)
   et de tuiles rangées par blocs. Chaque tuile lit UNE table, n'importe laquelle, et n'en garde que les lignes de
   l'établissement ; les couches vont du plus synthétique au plus détaillé :
     1. synthèse : un chiffre ou une valeur (nombre de lignes, de jours, d'épisodes, somme, dernière valeur) et une légende ;
     2. ventilation (facultative) : décompte par valeur d'une colonne, ou comparaison de colonnes numériques
        (une ligne par établissement, une colonne par thème) ; en liste ou en barres ;
     3. détail (facultatif) : les lignes, les plus récentes d'abord, avec les colonnes choisies ;
     4. source et date de mise à jour.
   Rattachement d'une ligne à l'établissement (« lien ») : colonne Référence (ou liste de références) vers le référentiel,
   ou colonne texte comparée à la clé du référentiel (l'UAI, par exemple) ; lien vide = la table est le référentiel.

   Configuration (options du widget, clé « fiche ») :
     referentiel : { table, titre, details: [colonnes], libelles: [colonnes affichées « Libellé : valeur »], cle }
     nouveau     : "point" (lignes saisies après le dernier point de situation) ou "" (aucun repère)
     filtresRapides : [colonnes du référentiel proposées comme filtres rapides] ; filtrerBadges : badges proposés aussi
     impression  : "synthese" (page 1 : toutes les tuiles en synthèse ; pages suivantes : leur détail) , "seule" (la page de synthèse seulement) ou "complet" (tuiles détaillées)
     badges      : [{ libelle, table, lien, colonne, affichage }]
                   affichage « oui_non » : allumé si l'établissement est dans la table (colonne vide) ou si la colonne est vraie ;
                   affichage « valeur » : « Libellé : valeur de la colonne » (Label CVL : Niv 3), éteint si la valeur est vide
                   couleurs : [{ valeur, couleur }] — première règle dont la valeur correspond (« Oui », « Non », « Niv 3 »,
                   « vide ») ; sans règle : bleu si allumé, contour gris si éteint
     tuiles      : [{ titre, bloc, largeur 1-3, table, lien, filtre: { colonne, valeurs, exclure },
                      filtresSup: [{ colonne, valeurs, exclure }] (filtres supplémentaires, tous appliqués), parDossier, date,
                      saisie, depuis, synthese: { mode, colonne, unite, legende, ignorer (« a ; b », valeur la plus récente),
                      ignorerMemeJour }, ventilation, ventilationColonnes: [colonnes],
                      ventilationAffichage ("liste" | "barres"), ventilationExclure (« a ; b » : valeurs retirées de la
                      ventilation par valeur, des barres et de {ventilation}/{principal}), detail: [colonnes],
                      limite, source, restreint, masquerSiVide (tuile omise quand elle est vide) }]
   ===================================================================== */
(function () {
  "use strict";

  const MODES = [
    ["nombre", "Nombre de lignes"], ["jours", "Nombre de jours (colonne date)"], ["episodes", "Nombre d'épisodes (jours consécutifs)"],
    ["somme", "Somme d'une colonne"], ["total", "Total des colonnes comparées (ventilation par colonnes)"], ["valeur", "Valeur la plus récente d'une colonne"],
  ];
  const TUILE_VIDE = {
    titre: "Nouvelle tuile", bloc: "", largeur: 1, table: "", lien: "", filtre: { colonne: "", valeurs: "", exclure: false }, filtresSup: [],
    parDossier: "", date: "", saisie: "", depuis: "", synthese: { mode: "nombre", colonne: "", unite: "", legende: "", ignorer: "", ignorerMemeJour: true },
    ventilation: "", ventilationExclure: "", ventilationColonnes: [], ventilationAffichage: "liste", detail: [], limite: 15, source: "", restreint: false, masquerSiVide: false,
  };
  const CONFIG_VIDE = { referentiel: { table: "", titre: "", details: [], libelles: [], cle: "" }, nouveau: "point", impression: "synthese", filtresRapides: [], filtrerBadges: false, badges: [], tuiles: [] };

  const copie = x => JSON.parse(JSON.stringify(x));
  const norm = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  /* comparaison d'une valeur saisie dans les réglages (couleur de badge, filtre, valeurs à ignorer ou exclues) avec
     celle d'une cellule : sans accents ni majuscules, sans blancs (retours à la ligne, espaces insécables, doubles
     espaces — un champ texte retire les retours à la ligne d'une valeur collée) ni guillemets autour ou dedans */
  const cleVal = s => norm(s).replace(/[\s"'«»“”‘’]+/g, "");
  const cibleRef = t => (/^Ref(?:List)?:(.+)$/.exec(String(t || "")) || [])[1] || null;
  const nombreFr = n => Number(n).toLocaleString("fr-FR", { maximumFractionDigits: 2 });

  // complète une configuration enregistrée (ou partielle) avec les valeurs par défaut
  function normaliserConfig(c) {
    const out = { ...copie(CONFIG_VIDE), ...(c && typeof c === "object" ? copie(c) : {}) };
    out.referentiel = { ...CONFIG_VIDE.referentiel, ...(out.referentiel || {}) };
    if (!Array.isArray(out.referentiel.details)) out.referentiel.details = [];
    if (!Array.isArray(out.referentiel.libelles)) out.referentiel.libelles = [];
    if (!Array.isArray(out.filtresRapides)) out.filtresRapides = [];
    out.badges = (Array.isArray(out.badges) ? out.badges : []).map(b => ({ libelle: "", table: "", lien: "", colonne: "", affichage: "oui_non", ...b,
      couleurs: (Array.isArray(b.couleurs) ? b.couleurs : []).map(x => ({ valeur: "", couleur: "vert", ...x })) }));
    out.tuiles = (Array.isArray(out.tuiles) ? out.tuiles : []).map(t => ({
      ...copie(TUILE_VIDE), ...t,
      filtre: { ...TUILE_VIDE.filtre, ...(t.filtre || {}) },
      filtresSup: (Array.isArray(t.filtresSup) ? t.filtresSup : []).map(f => ({ ...TUILE_VIDE.filtre, ...(f || {}) })),
      synthese: { ...TUILE_VIDE.synthese, ...(t.synthese || {}) },
      detail: Array.isArray(t.detail) ? t.detail.filter(Boolean) : [],
      ventilationColonnes: Array.isArray(t.ventilationColonnes) ? t.ventilationColonnes.filter(Boolean) : [],
      largeur: Math.min(3, Math.max(1, Number(t.largeur) || 1)),
    }));
    return out;
  }

  /* ---------- dates : Date = minuit UTC (jour tel quel), Date et heure = heure de Paris ---------- */
  const fmtJourParis = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });
  const fmtHeureParis = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });
  function jourISO(v, type) {
    if (v == null || v === "") return "";
    if (typeof v === "number") return type === "Date" ? new Date(v * 1000).toISOString().slice(0, 10) : fmtJourParis.format(new Date(v * 1000));
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v)) || /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(v));
    if (!m) return "";
    return m[1].length === 4 ? `${m[1]}-${m[2]}-${m[3]}` : `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  const texteJour = iso => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "";
  const estDate = type => type === "Date" || /^DateTime/.test(type || "");

  /* ---------- lecture des valeurs ----------
     schema : { table: [{ colId, label, type, visibleCol }] } (Socle.instantaneSchema) ;
     tables : { table: colonnes à la façon de fetchTable ({ id: [], Col: [] }) } */
  const TRI = new Intl.Collator("fr").compare;
  function creerLecteur(schema, tables) {
    const cacheLignes = {}, cacheParId = {};
    const colonne = (t, c) => (schema[t] || []).find(x => x.colId === c) || null;
    function lignes(t) {
      if (!cacheLignes[t]) {
        const d = tables[t];
        cacheLignes[t] = !d ? [] : d.id.map((id, i) => { const l = { id }; for (const k of Object.keys(d)) if (k !== "id") l[k] = d[k][i]; return l; });
      }
      return cacheLignes[t];
    }
    function ligne(t, id) {
      if (!cacheParId[t]) cacheParId[t] = new Map(lignes(t).map(l => [l.id, l]));
      return cacheParId[t].get(id) || null;
    }
    // colonne affichée d'une référence : colonne choisie dans Grist, sinon première colonne texte de la table visée
    function visible(info) {
      const cible = cibleRef(info.type);
      if (info.visibleCol) return info.visibleCol;
      const c = (schema[cible] || []).find(x => /^(Text|Choice)/.test(x.type));
      return c ? c.colId : null;
    }
    function elements(t, c, v) {
      const info = colonne(t, c) || { type: "" };
      if (Array.isArray(v)) {
        if (v[0] === "E") return [];
        const items = v[0] === "L" ? v.slice(1) : v;
        if (/^RefList:/.test(info.type)) return items.map(id => texteRef(info, id)).filter(Boolean);
        return items.map(x => String(x)).filter(Boolean);
      }
      const s = texte(t, c, v);
      return s ? [s] : [];
    }
    function texteRef(info, id) {
      const cible = cibleRef(info.type), vis = visible(info), l = ligne(cible, id);
      if (!l) return id ? String(id) : "";
      return vis ? texte(cible, vis, l[vis]) : String(id);
    }
    function texte(t, c, v) {
      if (v == null || v === "") return "";
      const info = colonne(t, c) || { type: "" };
      if (Array.isArray(v)) return elements(t, c, v).join(", ");
      if (/^Ref:/.test(info.type)) return v ? texteRef(info, v) : "";
      if (info.type === "Date" && typeof v === "number") return texteJour(jourISO(v, "Date"));
      if (/^DateTime/.test(info.type) && typeof v === "number") return `${texteJour(jourISO(v))} ${fmtHeureParis.format(new Date(v * 1000)).replace(":", " h ")}`;
      if (info.type === "Bool" || typeof v === "boolean") return v ? "Oui" : "Non";
      if (typeof v === "number") return nombreFr(v);
      return String(v);
    }
    return { colonne, lignes, ligne, texte, elements, existe: t => !!tables[t], schema };
  }

  /* ---------- tables à charger : celles des tuiles et des badges, le référentiel, les cibles des références ---------- */
  function tablesNecessaires(config, schema) {
    const c = normaliserConfig(config), out = new Set();
    const ajouter = t => {
      if (!t || out.has(t) || !schema[t]) return;
      out.add(t);
      for (const col of schema[t]) { const cible = cibleRef(col.type); if (cible && schema[cible] && !out.has(cible)) out.add(cible); }
    };
    ajouter(c.referentiel.table);
    c.badges.forEach(b => ajouter(b.table));
    c.tuiles.forEach(t => ajouter(t.table));
    if (c.nouveau === "point" && schema.Points_situation) out.add("Points_situation");
    return [...out];
  }

  // colonnes citées par une tuile, pour signaler celles qui n'existent pas (ou plus)
  function colonnesTuile(t) {
    const legende = [...String(t.synthese.legende || "").matchAll(/\{([^{}]+)\}/g)].map(m => m[1].trim()).filter(x => !["nombre", "jours", "episodes", "total", "principal"].includes(x) && !/^ventilation\b/.test(x));
    return [t.lien, t.filtre.colonne, ...(t.filtresSup || []).map(f => f.colonne), t.parDossier, t.date, t.saisie, t.synthese.colonne, t.ventilation, ...t.ventilationColonnes, ...t.detail, ...legende].filter(Boolean);
  }
  function verifierConfig(config, schema) {
    const c = normaliserConfig(config), alertes = [];
    const existe = (t, col) => col === "id" || (schema[t] || []).some(x => x.colId === col);
    const r = c.referentiel;
    if (!r.table) alertes.push("Choisissez la table des établissements (référentiel).");
    else if (!schema[r.table]) alertes.push(`Table des établissements introuvable : ${r.table}.`);
    else [r.titre, r.cle, ...r.details].filter(Boolean).forEach(col => { if (!existe(r.table, col)) alertes.push(`Référentiel : colonne introuvable ${col}.`); });
    c.badges.forEach((b, i) => {
      const t = b.table || r.table, nom = b.libelle || `badge ${i + 1}`;
      if (!schema[t]) alertes.push(`Badge « ${nom} » : table introuvable ${t}.`);
      else [b.lien, b.colonne].filter(Boolean).forEach(col => { if (!existe(t, col)) alertes.push(`Badge « ${nom} » : colonne introuvable ${col}.`); });
      if (b.affichage === "valeur" && !b.colonne) alertes.push(`Badge « ${nom} » : choisissez la colonne dont la valeur s'affiche.`);
    });
    c.tuiles.forEach(t => {
      const tab = t.table || r.table;
      if (!schema[tab]) { alertes.push(`Tuile « ${t.titre} » : table introuvable ${tab || "(aucune)"}.`); return; }
      colonnesTuile(t).forEach(col => { if (!existe(tab, col)) alertes.push(`Tuile « ${t.titre} » : colonne introuvable ${col}.`); });
      if (["jours", "episodes"].includes(t.synthese.mode) && !t.date) alertes.push(`Tuile « ${t.titre} » : le nombre de jours demande une colonne date.`);
      if (["somme", "valeur"].includes(t.synthese.mode) && !t.synthese.colonne) alertes.push(`Tuile « ${t.titre} » : choisissez la colonne de la synthèse.`);
      if (t.synthese.mode === "total" && !t.ventilationColonnes.length) alertes.push(`Tuile « ${t.titre} » : le total demande des colonnes à comparer (ventilation par colonnes).`);
      const lien = t.lien && (schema[tab] || []).find(x => x.colId === t.lien);
      if (lien && !cibleRef(lien.type) && !r.cle) alertes.push(`Tuile « ${t.titre} » : le lien ${t.lien} n'est pas une référence ; indiquez la clé du référentiel (UAI…).`);
    });
    return alertes;
  }

  /* ---------- lignes d'une table rattachées à l'établissement ----------
     Index construit une fois par table et par lien (puis réutilisé pour chaque établissement) :
     référence vers le référentiel → numéro de ligne ; sinon texte normalisé comparé à la clé (UAI…). */
  function creerRattacheur(lecteur, refTable, cleRef) {
    const index = new Map();
    const cleDe = etab => norm(cleRef ? lecteur.texte(refTable, cleRef, etab[cleRef]) : "");
    function indexer(table, lien) {
      const k = table + "|" + lien;
      if (index.has(k)) return index.get(k);
      const info = lecteur.colonne(table, lien), m = new Map();
      const parRef = !!info && cibleRef(info.type) === refTable;
      const ajouter = (cle, l) => { if (cle === "" || cle == null) return; const a = m.get(cle); if (a) a.push(l); else m.set(cle, [l]); };
      if (info) for (const l of lecteur.lignes(table)) {
        if (parRef) { const v = l[lien]; (Array.isArray(v) ? v.slice(1) : [v]).forEach(id => ajouter(id, l)); }
        else lecteur.elements(table, lien, l[lien]).forEach(x => ajouter(norm(x), l));
      }
      const entree = { parRef, m };
      index.set(k, entree);
      return entree;
    }
    return function lignesEtab(etab, table, lien) {
      if (!etab) return [];
      if (!table || (table === refTable && !lien)) return [etab];
      const { parRef, m } = indexer(table, lien);
      return m.get(parRef ? etab.id : cleDe(etab)) || [];
    };
  }
  const vrai = v => v === true || (typeof v === "number" && v !== 0) || (typeof v === "string" && v.trim() !== "" && !["non", "false", "0", "faux"].includes(norm(v)));

  /* ---------- lignes d'une tuile pour un établissement : rattachement, filtre, période, une par dossier, tri ---------- */
  function lignesTuile(t, lecteur, ctx) {
    const tab = t.table || ctx.refTable;
    const typeDe = c => (lecteur.colonne(tab, c) || {}).type || "";
    const brut = (l, c) => l[c];
    let lignes = [...ctx.rattacher(ctx.etab, tab, t.lien)];

    // filtres sur des colonnes (le premier, puis les supplémentaires, tous appliqués) : valeurs « a ; b », gardées ou exclues
    for (const f of [t.filtre, ...(t.filtresSup || [])]) {
      if (!f || !f.colonne || !String(f.valeurs ?? "").trim()) continue;
      const vals = new Set(String(f.valeurs).split(";").map(cleVal).filter(Boolean));
      lignes = lignes.filter(l => lecteur.elements(tab, f.colonne, l[f.colonne]).some(x => vals.has(cleVal(x))) !== !!f.exclure);
    }
    // période : à partir d'une date (AAAA-MM-JJ) ou des N derniers jours
    let periode = "";
    if (t.date && String(t.depuis).trim()) {
      const d = String(t.depuis).trim();
      const seuil = /^\d+$/.test(d) ? fmtJourParis.format(new Date(ctx.maintenant * 1000 - Number(d) * 86400000)) : jourISO(d);
      if (seuil) {
        lignes = lignes.filter(l => jourISO(l[t.date], typeDe(t.date)) >= seuil);
        periode = /^\d+$/.test(d) ? `${d} derniers jours` : `Depuis le ${texteJour(seuil)}`;
      }
    }
    // tri : les plus récentes d'abord (date, puis saisie, puis numéro de ligne)
    const cleTri = l => [Number(t.date ? brut(l, t.date) : 0) || 0, Number(t.saisie ? brut(l, t.saisie) : 0) || 0, l.id];
    const plusRecente = (a, b) => { const x = cleTri(a), y = cleTri(b); for (let k = 0; k < 3; k++) if (x[k] !== y[k]) return x[k] > y[k]; return false; };
    // une ligne par dossier : sa version la plus récente
    if (t.parDossier) {
      const par = new Map();
      for (const l of lignes) { const k = l[t.parDossier] || l.id, p = par.get(k); if (!p || plusRecente(l, p)) par.set(k, l); }
      lignes = [...par.values()];
    }
    lignes.sort((a, b) => plusRecente(a, b) ? -1 : plusRecente(b, a) ? 1 : 0);
    return { tab, typeDe, lignes, periode };
  }

  /* ---------- une tuile ---------- */
  function calculerTuile(t, lecteur, ctx) {
    const choisies = lignesTuile(t, lecteur, ctx), { tab, typeDe, lignes } = choisies;
    let periode = choisies.periode;
    const jours = t.date ? [...new Set(lignes.map(l => jourISO(l[t.date], typeDe(t.date))).filter(Boolean))].sort() : [];
    let episodes = 0;
    jours.forEach((j, i) => { if (i === 0 || (Date.parse(j) - Date.parse(jours[i - 1])) > 86400000) episodes++; });
    const nombre = col => lignes.reduce((s, l) => s + (Number(l[col]) || 0), 0);
    const premiere = lignes[0] || null;
    // valeur la plus récente : en sautant les valeurs ignorées (« Retour à la normale ; RAS »), cherchée parmi les lignes
    // du jour le plus récent (réglage par défaut) pour ne pas ressortir un état ancien ; à défaut, la plus récente
    const ignorees = new Set(String(t.synthese.ignorer || "").split(";").map(cleVal).filter(Boolean));
    let ligneValeur = premiere;
    if (t.synthese.mode === "valeur" && ignorees.size && premiere && t.synthese.colonne) {
      const jour0 = t.date ? jourISO(premiere[t.date], typeDe(t.date)) : "";
      const candidates = t.synthese.ignorerMemeJour !== false && jour0 ? lignes.filter(l => jourISO(l[t.date], typeDe(t.date)) === jour0) : lignes;
      ligneValeur = candidates.find(l => !ignorees.has(cleVal(lecteur.texte(tab, t.synthese.colonne, l[t.synthese.colonne])))) || premiere;
    }
    const valeurDe = col => { const l = col === t.synthese.colonne ? ligneValeur : premiere; return l ? lecteur.texte(tab, col, l[col]) : ""; };

    const s = t.synthese, unite = s.unite ? ` ${s.unite}` : "";
    // couche 2 : ventilation, calculée d'abord (la synthèse et la légende peuvent s'en servir)
    //  - par colonnes : une barre par colonne numérique choisie (Moyens, Climat, Parcoursup…), somme sur les lignes ;
    //  - par valeur : décompte des valeurs d'une colonne (ou somme de la colonne de synthèse si elle est en « somme »).
    // part : pourcentage du total des colonnes, ou du nombre de lignes (une ligne peut porter plusieurs valeurs)
    let ventilation = [], baseParts = 0;
    if (t.ventilationColonnes.length) {
      ventilation = t.ventilationColonnes.map(c => ({ valeur: (lecteur.colonne(tab, c) || {}).label || c, n: nombre(c) }));
      baseParts = ventilation.reduce((x, v) => x + v.n, 0);
    } else if (t.ventilation) {
      const comptes = new Map(), exclues = new Set(String(t.ventilationExclure || "").split(";").map(cleVal).filter(Boolean));
      for (const l of lignes) {
        const vals = lecteur.elements(tab, t.ventilation, l[t.ventilation]);
        // valeur nulle d'une colonne numérique (0 blessé…) : rien à décompter (sinon « 1 0 »)
        for (const v of vals.length ? vals : ["(vide)"]) if (!exclues.has(cleVal(v)) && !/^0+([.,]0+)?$/.test(String(v).trim())) comptes.set(v, (comptes.get(v) || 0) + (s.mode === "somme" ? Number(l[s.colonne]) || 0 : 1));
      }
      ventilation = [...comptes].map(([valeur, n]) => ({ valeur, n }));
      baseParts = s.mode === "somme" ? nombre(s.colonne) : lignes.length;
    }
    ventilation = ventilation.map(v => ({ ...v, texte: nombreFr(v.n), part: baseParts > 0 ? Math.round(v.n / baseParts * 100) : 0 }))
      .sort((x, y) => y.n - x.n || TRI(x.valeur, y.valeur));
    const total = t.ventilationColonnes.reduce((x, c) => x + nombre(c), 0);
    const principal = ventilation.length && ventilation[0].n > 0 ? `${ventilation[0].valeur} (${ventilation[0].part} %)` : "";

    // couche 1 : synthèse
    let grand;
    if (s.mode === "jours") grand = `${jours.length}${unite}`;
    else if (s.mode === "episodes") grand = `${episodes}${unite}`;
    else if (s.mode === "somme") grand = lignes.length ? `${nombreFr(nombre(s.colonne))}${unite}` : "—";   // aucune ligne : pas de donnée, pas zéro
    else if (s.mode === "total") grand = lignes.length ? `${nombreFr(total)}${unite}` : "—";
    else if (s.mode === "valeur") grand = premiere ? `${valeurDe(s.colonne) || "—"}${unite}` : "—";
    else grand = `${lignes.length}${unite}`;
    let trous = 0, remplis = 0;   // légende dont tous les trous sont vides : non affichée (« Thème principal : » seul)
    let legende = String(s.legende || "").replace(/\{([^{}]+)\}/g, (m, c) => {
      const v = valeurTrou(c.trim());
      trous++; if (v !== "") remplis++;
      return v;
    }).trim();
    if (trous && !remplis) legende = "";
    function valeurTrou(c) {
      if (c === "nombre") return String(lignes.length);
      if (c === "jours") return String(jours.length);
      if (c === "episodes") return String(episodes);
      if (c === "total") return nombreFr(total);
      if (c === "principal") return principal;
      // {ventilation} : « 2 A, 3 B et 1 C » (ventilation de la tuile, plus grandes valeurs d'abord, sans les zéros ni « (vide) ») ;
      // {ventilation:2} : les 2 premières seulement, le reste regroupé (« et 1 autre »)
      const mv = /^ventilation(?:\s*:\s*(\d+))?$/.exec(c);
      if (mv) {
        const l = ventilation.filter(v => v.n > 0 && v.valeur !== "(vide)"), max = mv[1] ? Math.max(1, Number(mv[1])) : l.length;
        const parts = l.slice(0, max).map(v => `${v.texte} ${v.valeur}`), reste = l.slice(max).reduce((x, v) => x + v.n, 0);
        if (reste > 0) parts.push(`${nombreFr(reste)} autre${reste > 1 ? "s" : ""}`);
        return parts.length > 1 ? parts.slice(0, -1).join(", ") + " et " + parts[parts.length - 1] : parts.join("");
      }
      return valeurDe(c);
    }
    if (!periode && jours.length && s.mode !== "valeur") periode = jours.length === 1 ? `Le ${texteJour(jours[0])}` : `Du ${texteJour(jours[0])} au ${texteJour(jours[jours.length - 1])}`;

    // repère « nouveau » : saisie (ou date) postérieure au dernier point de situation
    const colNouveau = t.saisie || t.date;
    const estNouvelle = l => ctx.marque != null && colNouveau && typeof l[colNouveau] === "number" && l[colNouveau] > ctx.marque;

    // couche 3 : détail des lignes
    const limite = Math.max(1, Number(t.limite) || 15);
    const detail = t.detail.length ? lignes.slice(0, limite).map(l => ({ cellules: t.detail.map(c => lecteur.texte(tab, c, l[c])), nouveau: estNouvelle(l) })) : [];

    // couche 4 : date de mise à jour (la plus récente des saisies, sinon des dates)
    const colMaj = t.saisie || t.date;
    const maj = colMaj && premiere ? lignes.reduce((m, l) => (typeof l[colMaj] === "number" && l[colMaj] > (m[colMaj] ?? -Infinity)) ? l : m, premiere) : null;

    return {
      titre: t.titre, largeur: t.largeur, restreint: !!t.restreint, source: t.source,
      // vide : aucune ligne, ou valeur la plus récente non renseignée (point de vigilance sans texte…)
      grand, legende, periode, vide: lignes.length === 0 || (s.mode === "valeur" && !valeurDe(s.colonne)),
      nouveaux: lignes.filter(estNouvelle).length,
      ventilation, barres: t.ventilationAffichage === "barres", colonnesDetail: t.detail.map(c => (lecteur.colonne(tab, c) || {}).label || c),
      detail, reste: t.detail.length ? Math.max(0, lignes.length - limite) : 0,
      maj: maj ? lecteur.texte(tab, colMaj, maj[colMaj]) : "",
      couches: 2 + (ventilation.length ? 1 : 0) + (detail.length ? 1 : 0),
    };
  }

  /* ---------- contexte commun à toutes les fiches d'un même chargement ----------
     ctx : { maintenant (secondes), marque (secondes, dernier point de situation), rattacher (index, réutilisé) } */
  function preparer(config, lecteur, ctx = {}) {
    const c = normaliserConfig(config), r = c.referentiel;
    return {
      config: c, refTable: r.table, cle: r.cle,
      maintenant: ctx.maintenant || Date.now() / 1000,
      marque: c.nouveau === "point" ? ctx.marque ?? null : null,
      rattacher: ctx.rattacher || creerRattacheur(lecteur, r.table, r.cle),
    };
  }
  // badge d'un établissement : { actif, valeurs, valeur } (valeurs : textes distincts de la colonne en mode « valeur »)
  function lireBadge(b, etab, base, lecteur) {
    const tab = b.table || base.refTable, lignes = base.rattacher(etab, tab, b.table ? b.lien : "");
    let r;
    if (b.affichage === "valeur") {
      const valeurs = b.colonne ? [...new Set(lignes.flatMap(l => lecteur.elements(tab, b.colonne, l[b.colonne])).filter(Boolean))] : [];
      r = { actif: valeurs.length > 0, valeurs, valeur: valeurs.join(", ") };
    } else {
      const actif = b.colonne ? lignes.some(l => vrai(l[b.colonne])) : lignes.length > 0;
      r = { actif, valeurs: [actif ? "Oui" : "Non"], valeur: "" };
    }
    // couleur : première règle dont la valeur est l'une des valeurs du badge (« vide » : badge éteint)
    const regle = (b.couleurs || []).find(c => { const v = cleVal(c.valeur); return v && (v === "vide" ? !r.actif : r.valeurs.some(x => cleVal(x) === v)); });
    return { ...r, couleur: regle ? regle.couleur : "" };
  }

  /* ---------- la fiche d'un établissement ---------- */
  function construireFiche(config, lecteur, etabId, ctx = {}) {
    const base = ctx.config ? ctx : preparer(config, lecteur, ctx), c = base.config, r = c.referentiel;
    const etab = r.table ? lecteur.ligne(r.table, etabId) : null;
    if (!etab) return null;
    const contexte = { ...base, etab };
    const badges = c.badges.map(b => ({ libelle: b.libelle || b.colonne || b.table || r.table, affichage: b.affichage, ...lireBadge(b, etab, base, lecteur) }));
    const blocs = [];
    c.tuiles.forEach(t => {
      const nom = t.bloc || "";
      const tuile = calculerTuile(t, lecteur, contexte);
      if (t.masquerSiVide && tuile.vide) return;   // tuile affichée seulement si elle est renseignée (bloc omis s'il reste vide)
      let bloc = blocs.find(b => b.titre === nom);
      if (!bloc) blocs.push(bloc = { titre: nom, tuiles: [] });
      bloc.tuiles.push(tuile);
    });
    return {
      id: etab.id,
      titre: titreEtab(etab, lecteur, r),
      // sous le nom : valeur seule, ou « Libellé : valeur » pour les colonnes cochées « avec libellé »
      details: r.details.map(col => { const v = lecteur.texte(r.table, col, etab[col]);
        return v && r.libelles.includes(col) ? `${(lecteur.colonne(r.table, col) || {}).label || col} : ${v}` : v; }).filter(Boolean),
      badges, blocs,
    };
  }
  const titreEtab = (etab, lecteur, r) => r.titre ? lecteur.texte(r.table, r.titre, etab[r.titre]) : `Établissement ${etab.id}`;

  /* =====================================================================
     Sélection d'établissements : filtres rapides, puis filtres avancés
     etat : { rapides: { dimension: [valeurs retenues] }, avances: [filtre], combinaison, formule }
     - filtres rapides (comme le tableau de bord) : colonnes du référentiel choisies dans les réglages, et badges
       (Oui / Non) ; un établissement passe s'il a l'une des valeurs retenues de chaque dimension filtrée ;
     - filtres avancés (moteur des Extractions, FiltresColonnes) : chaque filtre porte sur les lignes d'une tuile
       (source = numéro de la tuile : rattachement, filtre, période et dossiers de la tuile) ou sur la ligne du
       référentiel (source vide) ; condition, portée ou comptage, puis combinaison ET / OU / formule.
     ===================================================================== */
  const VIDE = "(vide)";
  function dimensionsRapides(config, lecteur, base) {
    const c = normaliserConfig(config), r = c.referentiel, out = [];
    c.filtresRapides.forEach(col => {
      const info = lecteur.colonne(r.table, col);
      if (info) out.push({ id: "col:" + col, libelle: info.label || col, valeurs: e => { const v = lecteur.elements(r.table, col, e[col]); return v.length ? v : [VIDE]; } });
    });
    if (c.filtrerBadges) c.badges.forEach((b, i) => out.push({ id: "badge:" + i, libelle: b.libelle || `Badge ${i + 1}`, valeurs: e => { const v = lireBadge(b, e, base, lecteur).valeurs; return v.length ? v : [VIDE]; } }));
    return out;
  }
  // décompte des valeurs d'une dimension parmi des établissements (pour la liste à cocher)
  function compterValeurs(dimension, etabs) {
    const n = new Map();
    etabs.forEach(e => dimension.valeurs(e).forEach(v => n.set(v, (n.get(v) || 0) + 1)));
    return [...n].sort((a, b) => b[1] - a[1] || TRI(String(a[0]), String(b[0]))).map(([valeur, nombre]) => ({ valeur, nombre }));
  }
  function passeRapides(etab, dims, rapides, sauf) {
    for (const d of dims) {
      const retenues = rapides[d.id];
      if (!retenues || d.id === sauf) continue;
      if (!d.valeurs(etab).some(v => retenues.includes(v))) return false;
    }
    return true;
  }
  // contexte de lecture des lignes pour FiltresColonnes
  function contexteFiltre(lecteur, tab, colDate) {
    const typeDe = c => (lecteur.colonne(tab, c) || {}).type || "";
    return {
      texte: (c, l) => lecteur.texte(tab, c, l[c]),
      elements: (c, l) => lecteur.elements(tab, c, l[c]),
      nombre: (c, l) => { const v = l[c]; if (typeof v === "number") return v; if (typeof v === "boolean") return v ? 1 : 0; const n = Number(String(lecteur.texte(tab, c, v)).replace(/\s/g, "").replace(",", ".")); return String(v ?? "").trim() !== "" && Number.isFinite(n) ? n : NaN; },
      jour: (l, c) => jourISO(l[c || colDate], typeDe(c || colDate)),
      estDate: c => estDate(typeDe(c)),
      estDerniere: () => true,   // la tuile garde déjà, si elle le demande, une ligne par dossier
    };
  }
  // source d'un filtre : nom de table (vide = référentiel) ; avant la 2.62.0-alpha.8, numéro de tuile
  function sourceDe(f, sources, config) {
    const v = f.source == null ? "" : String(f.source);
    if (/^\d+$/.test(v) && !sources.some(x => x.source === v)) { const t = config.tuiles[Number(v)]; return sources.find(x => x.table === (t && (t.table || config.referentiel.table))) || null; }
    return sources.find(x => x.source === v) || null;
  }
  /* Période de la sélection (comme les Extractions) : dates fixes (du, au) ou les N derniers jours (relative : un
     modèle « bloqués ces 7 derniers jours » reste juste le lendemain). Elle restreint les lignes lues par chaque
     filtre, d'après la colonne date de sa table ; seule (sans filtre), elle retient les établissements qui ont au
     moins une ligne dans la période dans la première table à dossiers (les signalements). */
  function bornesPeriode(periode, maintenant) {
    const p = periode || {};
    if (p.mode === "jours" && Number(p.jours) > 0) {
      const t = (maintenant || Date.now() / 1000) * 1000;
      return { du: fmtJourParis.format(new Date(t - (Number(p.jours) - 1) * 86400000)), au: fmtJourParis.format(new Date(t)) };
    }
    if (p.mode === "dates" && (p.du || p.au)) return { du: jourISO(p.du) || "", au: jourISO(p.au) || "" };
    return null;
  }
  function lignesDansPeriode(lignes, src, lecteur, bornes) {
    if (!bornes || !src.date) return lignes;
    const type = (lecteur.colonne(src.table, src.date) || {}).type;
    return lignes.filter(l => { const j = jourISO(l[src.date], type); return j && (!bornes.du || j >= bornes.du) && (!bornes.au || j <= bornes.au); });
  }
  function passeAvances(etab, etat, FC, lecteur, base) {
    const avances = etat.avances || [], bornes = bornesPeriode(etat.periode, base.maintenant);
    const sources = base.sources || (base.sources = sourcesFiltres(base.config, lecteur.schema));
    if (!avances.some(FC.actif)) {
      if (!bornes) return true;
      const src = sources.find(x => x.dossier && x.date) || sources.find(x => x.source !== "" && x.date);
      return !src || lignesDansPeriode(base.rattacher(etab, src.table, src.lien), src, lecteur, bornes).length > 0;
    }
    const resultats = avances.map(f => {
      if (!FC.actif(f)) return undefined;
      const src = sourceDe(f, sources, base.config);
      if (!src) return undefined;
      // toutes les lignes de l'établissement dans la table (dans la période), comme dans les Extractions
      const lignes = src.source === "" ? [etab] : lignesDansPeriode(base.rattacher(etab, src.table, src.lien), src, lecteur, bornes);
      const ctxF = contexteFiltre(lecteur, src.table, src.date);
      if (f.versions === "derniere" && src.dossier) {
        const dernieres = new Map();
        for (const l of lignes) { const k = l[src.dossier] || l.id, p = dernieres.get(k);
          if (!p || (Number(l[src.date]) || 0) > (Number(p[src.date]) || 0) || ((Number(l[src.date]) || 0) === (Number(p[src.date]) || 0) && l.id > p.id)) dernieres.set(k, l); }
        const garde = new Set(dernieres.values());
        ctxF.estDerniere = l => garde.has(l);
      }
      return FC.evaluer(src.dossier ? f : { ...f, versions: "toutes" }, lignes, ctxF).ok;
    });
    return FC.combiner(etat.combinaison || "cascade", etat.formule || "", resultats);
  }
  // établissements retenus, rangés par nom
  function selectionner(config, lecteur, etat, FC, base) {
    const r = base.config.referentiel, dims = dimensionsRapides(config, lecteur, base), rapides = (etat && etat.rapides) || {};
    return lecteur.lignes(r.table)
      .filter(e => passeRapides(e, dims, rapides) && (!FC || passeAvances(e, etat || {}, FC, lecteur, base)))
      .map(e => ({ id: e.id, titre: titreEtab(e, lecteur, r) }))
      .sort((a, b) => TRI(a.titre, b.titre));
  }
  // tables dont les colonnes peuvent servir aux filtres avancés : référentiel (source vide) et table de chaque tuile
  /* Tables proposées aux filtres de sélection : le référentiel, puis chaque table rattachée aux établissements
     (celles des tuiles et des badges, et toute table qui a une référence vers le référentiel ou une colonne
     portant la clé). Pour chacune : lien, colonne date (nombre de jours) et colonne dossier (dernière version),
     repris d'une tuile qui lit la table, sinon devinés. */
  function sourcesFiltres(config, schema) {
    const c = normaliserConfig(config), r = c.referentiel, out = [{ source: "", libelle: "Établissement (référentiel)", table: r.table, lien: "", date: "", dossier: "" }];
    if (!schema || !r.table) return out;
    const cols = t => schema[t] || [];
    const deviner = t => {
      const tuile = c.tuiles.find(x => (x.table || r.table) === t && x.lien);
      const lien = tuile ? tuile.lien : ((cols(t).find(x => cibleRef(x.type) === r.table) || cols(t).find(x => r.cle && x.colId === r.cle) || {}).colId || "");
      const date = (tuile && (tuile.date || tuile.saisie)) || (cols(t).find(x => estDate(x.type)) || {}).colId || "";
      const dossier = (tuile && tuile.parDossier) || (cols(t).find(x => cibleRef(x.type) === t && /dossier/i.test(x.colId)) || {}).colId || "";
      const titres = c.tuiles.filter(x => (x.table || r.table) === t).map(x => x.titre);
      return { source: t, table: t, lien, date, dossier, libelle: titres.length ? `${t} (${titres.join(", ")})` : t };
    };
    const candidates = [...new Set([...c.tuiles.map(x => x.table), ...c.badges.map(x => x.table), ...Object.keys(schema)].filter(t => t && t !== r.table && schema[t]))];
    for (const t of candidates) { const s = deviner(t); if (s.lien) out.push(s); }
    return out;
  }

  const api = { CONFIG_VIDE, TUILE_VIDE, MODES, cleVal, normaliserConfig, tablesNecessaires, verifierConfig, creerLecteur, preparer, construireFiche,
    dimensionsRapides, compterValeurs, passeRapides, passeAvances, bornesPeriode, selectionner, sourcesFiltres, titreEtab, jourISO, texteJour, estDate };
  if (typeof window !== "undefined") window.FicheMoteur = api;
  if (typeof module !== "undefined") module.exports = api;
})();
