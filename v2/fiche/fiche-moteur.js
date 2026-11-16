/* =====================================================================
   Fiche établissement — moteur (calcul des tuiles, sans affichage)
   ---------------------------------------------------------------------
   Définit : window.FicheMoteur = { CONFIG_VIDE, TUILE_VIDE, MODES, normaliserConfig(c), tablesNecessaires(config, schema),
             verifierConfig(config, schema), creerLecteur(schema, tables), construireFiche(config, lecteur, etabId, ctx),
             jourISO(v, type), texteJour(iso) }.
   Utilise : rien (fonctionne aussi sous Node pour les essais : module.exports).

   Une fiche montre UN établissement du référentiel. Elle est faite de badges (appartenance à une liste, oui ou non)
   et de tuiles rangées par blocs. Chaque tuile lit UNE table, n'importe laquelle, et n'en garde que les lignes de
   l'établissement ; les couches vont du plus synthétique au plus détaillé :
     1. synthèse : un chiffre ou une valeur (nombre de lignes, de jours, d'épisodes, somme, dernière valeur) et une légende ;
     2. ventilation (facultative) : décompte par valeur d'une colonne ;
     3. détail (facultatif) : les lignes, les plus récentes d'abord, avec les colonnes choisies ;
     4. source et date de mise à jour.
   Rattachement d'une ligne à l'établissement (« lien ») : colonne Référence (ou liste de références) vers le référentiel,
   ou colonne texte comparée à la clé du référentiel (l'UAI, par exemple) ; lien vide = la table est le référentiel.

   Configuration (options du widget, clé « fiche ») :
     referentiel : { table, titre, details: [colonnes], cle }
     nouveau     : "point" (lignes saisies après le dernier point de situation) ou "" (aucun repère)
     badges      : [{ libelle, table, lien, colonne }]   colonne vide = présence de l'établissement dans la table
     tuiles      : [{ titre, bloc, largeur 1-3, table, lien, filtre: { colonne, valeurs, exclure }, parDossier, date,
                      saisie, depuis, synthese: { mode, colonne, unite, legende }, ventilation, detail: [colonnes],
                      limite, source, restreint }]
   ===================================================================== */
(function () {
  "use strict";

  const MODES = [
    ["nombre", "Nombre de lignes"], ["jours", "Nombre de jours (colonne date)"], ["episodes", "Nombre d'épisodes (jours consécutifs)"],
    ["somme", "Somme d'une colonne"], ["valeur", "Valeur la plus récente d'une colonne"],
  ];
  const TUILE_VIDE = {
    titre: "Nouvelle tuile", bloc: "", largeur: 1, table: "", lien: "", filtre: { colonne: "", valeurs: "", exclure: false },
    parDossier: "", date: "", saisie: "", depuis: "", synthese: { mode: "nombre", colonne: "", unite: "", legende: "" },
    ventilation: "", detail: [], limite: 15, source: "", restreint: false,
  };
  const CONFIG_VIDE = { referentiel: { table: "", titre: "", details: [], cle: "" }, nouveau: "point", badges: [], tuiles: [] };

  const copie = x => JSON.parse(JSON.stringify(x));
  const norm = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const cibleRef = t => (/^Ref(?:List)?:(.+)$/.exec(String(t || "")) || [])[1] || null;
  const nombreFr = n => Number(n).toLocaleString("fr-FR", { maximumFractionDigits: 2 });

  // complète une configuration enregistrée (ou partielle) avec les valeurs par défaut
  function normaliserConfig(c) {
    const out = { ...copie(CONFIG_VIDE), ...(c && typeof c === "object" ? copie(c) : {}) };
    out.referentiel = { ...CONFIG_VIDE.referentiel, ...(out.referentiel || {}) };
    if (!Array.isArray(out.referentiel.details)) out.referentiel.details = [];
    out.badges = (Array.isArray(out.badges) ? out.badges : []).map(b => ({ libelle: "", table: "", lien: "", colonne: "", ...b }));
    out.tuiles = (Array.isArray(out.tuiles) ? out.tuiles : []).map(t => ({
      ...copie(TUILE_VIDE), ...t,
      filtre: { ...TUILE_VIDE.filtre, ...(t.filtre || {}) },
      synthese: { ...TUILE_VIDE.synthese, ...(t.synthese || {}) },
      detail: Array.isArray(t.detail) ? t.detail.filter(Boolean) : [],
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
    return { colonne, lignes, ligne, texte, elements, existe: t => !!tables[t] };
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
    const legende = [...String(t.synthese.legende || "").matchAll(/\{([^{}]+)\}/g)].map(m => m[1].trim()).filter(x => !["nombre", "jours", "episodes"].includes(x));
    return [t.lien, t.filtre.colonne, t.parDossier, t.date, t.saisie, t.synthese.colonne, t.ventilation, ...t.detail, ...legende].filter(Boolean);
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
    });
    c.tuiles.forEach(t => {
      const tab = t.table || r.table;
      if (!schema[tab]) { alertes.push(`Tuile « ${t.titre} » : table introuvable ${tab || "(aucune)"}.`); return; }
      colonnesTuile(t).forEach(col => { if (!existe(tab, col)) alertes.push(`Tuile « ${t.titre} » : colonne introuvable ${col}.`); });
      if (["jours", "episodes"].includes(t.synthese.mode) && !t.date) alertes.push(`Tuile « ${t.titre} » : le nombre de jours demande une colonne date.`);
      if (["somme", "valeur"].includes(t.synthese.mode) && !t.synthese.colonne) alertes.push(`Tuile « ${t.titre} » : choisissez la colonne de la synthèse.`);
      const lien = t.lien && (schema[tab] || []).find(x => x.colId === t.lien);
      if (lien && !cibleRef(lien.type) && !r.cle) alertes.push(`Tuile « ${t.titre} » : le lien ${t.lien} n'est pas une référence ; indiquez la clé du référentiel (UAI…).`);
    });
    return alertes;
  }

  /* ---------- lignes d'une table rattachées à l'établissement ---------- */
  function lignesEtab(lecteur, refTable, cleRef, etab, table, lien) {
    if (!table || (table === refTable && !lien)) return etab ? [etab] : [];
    const tout = lecteur.lignes(table), info = lecteur.colonne(table, lien);
    if (!info || !etab) return [];
    if (cibleRef(info.type) === refTable) {
      return /^RefList:/.test(info.type) ? tout.filter(l => Array.isArray(l[lien]) && l[lien].slice(1).includes(etab.id)) : tout.filter(l => l[lien] === etab.id);
    }
    const cle = norm(cleRef ? lecteur.texte(refTable, cleRef, etab[cleRef]) : "");
    if (!cle) return [];
    return tout.filter(l => lecteur.elements(table, lien, l[lien]).some(x => norm(x) === cle));
  }
  const vrai = v => v === true || (typeof v === "number" && v !== 0) || (typeof v === "string" && v.trim() !== "" && !["non", "false", "0", "faux"].includes(norm(v)));

  /* ---------- une tuile ---------- */
  function calculerTuile(t, lecteur, ctx) {
    const tab = t.table || ctx.refTable;
    const typeDe = c => (lecteur.colonne(tab, c) || {}).type || "";
    const brut = (l, c) => l[c];
    let lignes = lignesEtab(lecteur, ctx.refTable, ctx.cle, ctx.etab, tab, t.lien);

    // filtre sur une colonne : valeurs « a ; b », gardées ou exclues
    if (t.filtre.colonne && String(t.filtre.valeurs).trim()) {
      const vals = new Set(String(t.filtre.valeurs).split(";").map(norm).filter(Boolean));
      lignes = lignes.filter(l => lecteur.elements(tab, t.filtre.colonne, l[t.filtre.colonne]).some(x => vals.has(norm(x))) !== !!t.filtre.exclure);
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

    const jours = t.date ? [...new Set(lignes.map(l => jourISO(l[t.date], typeDe(t.date))).filter(Boolean))].sort() : [];
    let episodes = 0;
    jours.forEach((j, i) => { if (i === 0 || (Date.parse(j) - Date.parse(jours[i - 1])) > 86400000) episodes++; });
    const nombre = col => lignes.reduce((s, l) => s + (Number(l[col]) || 0), 0);
    const premiere = lignes[0] || null;
    const valeurDe = col => premiere ? lecteur.texte(tab, col, premiere[col]) : "";

    // couche 1 : synthèse
    const s = t.synthese, unite = s.unite ? ` ${s.unite}` : "";
    let grand;
    if (s.mode === "jours") grand = `${jours.length}${unite}`;
    else if (s.mode === "episodes") grand = `${episodes}${unite}`;
    else if (s.mode === "somme") grand = `${nombreFr(nombre(s.colonne))}${unite}`;
    else if (s.mode === "valeur") grand = premiere ? `${valeurDe(s.colonne) || "—"}${unite}` : "—";
    else grand = `${lignes.length}${unite}`;
    const legende = String(s.legende || "").replace(/\{([^{}]+)\}/g, (m, c) => {
      c = c.trim();
      if (c === "nombre") return String(lignes.length);
      if (c === "jours") return String(jours.length);
      if (c === "episodes") return String(episodes);
      return valeurDe(c);
    }).trim();
    if (!periode && jours.length && s.mode !== "valeur") periode = jours.length === 1 ? `Le ${texteJour(jours[0])}` : `Du ${texteJour(jours[0])} au ${texteJour(jours[jours.length - 1])}`;

    // repère « nouveau » : saisie (ou date) postérieure au dernier point de situation
    const colNouveau = t.saisie || t.date;
    const estNouvelle = l => ctx.marque != null && colNouveau && typeof l[colNouveau] === "number" && l[colNouveau] > ctx.marque;

    // couche 2 : ventilation par valeur
    let ventilation = [];
    if (t.ventilation) {
      const comptes = new Map();
      for (const l of lignes) {
        const vals = lecteur.elements(tab, t.ventilation, l[t.ventilation]);
        for (const v of vals.length ? vals : ["(vide)"]) comptes.set(v, (comptes.get(v) || 0) + (s.mode === "somme" ? Number(l[s.colonne]) || 0 : 1));
      }
      ventilation = [...comptes].map(([valeur, n]) => ({ valeur, n, texte: nombreFr(n) })).sort((x, y) => y.n - x.n || x.valeur.localeCompare(y.valeur, "fr"));
    }
    // couche 3 : détail des lignes
    const limite = Math.max(1, Number(t.limite) || 15);
    const detail = t.detail.length ? lignes.slice(0, limite).map(l => ({ cellules: t.detail.map(c => lecteur.texte(tab, c, l[c])), nouveau: estNouvelle(l) })) : [];

    // couche 4 : date de mise à jour (la plus récente des saisies, sinon des dates)
    const colMaj = t.saisie || t.date;
    const maj = colMaj && premiere ? lignes.reduce((m, l) => (typeof l[colMaj] === "number" && l[colMaj] > (m[colMaj] ?? -Infinity)) ? l : m, premiere) : null;

    return {
      titre: t.titre, largeur: t.largeur, restreint: !!t.restreint, source: t.source,
      grand, legende, periode, vide: lignes.length === 0,
      nouveaux: lignes.filter(estNouvelle).length,
      ventilation, colonnesDetail: t.detail.map(c => (lecteur.colonne(tab, c) || {}).label || c),
      detail, reste: t.detail.length ? Math.max(0, lignes.length - limite) : 0,
      maj: maj ? lecteur.texte(tab, colMaj, maj[colMaj]) : "",
      couches: 2 + (ventilation.length ? 1 : 0) + (detail.length ? 1 : 0),
    };
  }

  /* ---------- la fiche ----------
     ctx : { maintenant (secondes), marque (secondes, dernier point de situation) } */
  function construireFiche(config, lecteur, etabId, ctx = {}) {
    const c = normaliserConfig(config), r = c.referentiel;
    const etab = r.table ? lecteur.ligne(r.table, etabId) : null;
    if (!etab) return null;
    const contexte = { refTable: r.table, cle: r.cle, etab, maintenant: ctx.maintenant || Date.now() / 1000, marque: c.nouveau === "point" ? ctx.marque ?? null : null };
    const badges = c.badges.map(b => {
      const tab = b.table || r.table, lignes = lignesEtab(lecteur, r.table, r.cle, etab, tab, b.table ? b.lien : "");
      const actif = b.colonne ? lignes.some(l => vrai(l[b.colonne])) : lignes.length > 0;
      return { libelle: b.libelle || b.colonne || tab, actif };
    });
    const blocs = [];
    c.tuiles.forEach(t => {
      const nom = t.bloc || "";
      let bloc = blocs.find(b => b.titre === nom);
      if (!bloc) blocs.push(bloc = { titre: nom, tuiles: [] });
      bloc.tuiles.push(calculerTuile(t, lecteur, contexte));
    });
    return {
      id: etab.id,
      titre: r.titre ? lecteur.texte(r.table, r.titre, etab[r.titre]) : `Établissement ${etab.id}`,
      details: r.details.map(col => lecteur.texte(r.table, col, etab[col])).filter(Boolean),
      badges, blocs,
    };
  }

  const api = { CONFIG_VIDE, TUILE_VIDE, MODES, normaliserConfig, tablesNecessaires, verifierConfig, creerLecteur, construireFiche, jourISO, texteJour, estDate };
  if (typeof window !== "undefined") window.FicheMoteur = api;
  if (typeof module !== "undefined") module.exports = api;
})();
