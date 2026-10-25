/* =====================================================================
   Socle v2 — moteur du contrôle qualité des signalements (« À vérifier »)
   ---------------------------------------------------------------------
   Commun à l'onglet « À vérifier » de l'administration et au widget « Référentiel des sites » :
   analyse des tables des réponses (doublons, sections ou composantes choisies au lieu de l'établissement, établissement
   absent, sans coordonnées ou hors périmètre, qualification manquante, saisie d'essai), statuts (clé « qualite » de
   Config : vérifié / corrigé) et corrections (rattachement d'un dossier à un autre établissement).
   API : QualiteMoteur.analyser() → { espaces, le, config } ; TYPES ; GRAVITES ; statuts(config) ; marquer(liste, s, note) ;
         rattacher(etat, liste, versId?) ; dateFr(iso) ; genreSection(...).
   ===================================================================== */
(function () {
  "use strict";
  const S = window.Socle;
  const refId = v => typeof v === "number" ? v : (v && typeof v === "object" && "rowId" in v) ? v.rowId : (Array.isArray(v) && v[0] === "R") ? v[2] : null;
  const texte = v => v == null ? "" : Array.isArray(v) ? (v[0] === "L" ? v.slice(1) : v).join(", ") : String(v);
  const MAJ = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  let config = null;

  /* ---------- types d'anomalies : ordre d'affichage, gravité, explication ---------- */
  const TYPES = {
    section: { titre: "Section ou composante choisie au lieu de l'établissement", gravite: 3,
      aide: "SEGPA, SEP, SGT ou SES font partie d'un collège ou d'un lycée ; IUT, INSPÉ, écoles internes, sites et campus font partie d'une université ou d'un établissement (colonne Rattachement du référentiel) : le signalement doit porter sur l'établissement, sinon il est compté à part (et souvent deux fois)." },
    doublon: { titre: "Doublons probables", gravite: 3,
      aide: "Plusieurs dossiers pour le même établissement le même jour (une section compte pour son établissement) : les chiffres et la carte comptent l'établissement plusieurs fois. Si les faits sont bien distincts, marquez « vérifié »." },
    dossier: { titre: "Dossier sur plusieurs établissements", gravite: 3,
      aide: "Une version du dossier porte sur un autre établissement que le dossier : elle n'est comptée nulle part correctement." },
    sans_etab: { titre: "Établissement absent", gravite: 3, aide: "Signalement sans établissement : il n'apparaît ni dans les comptes par académie ni sur la carte." },
    voisin: { titre: "Doublons possibles (jours voisins)", gravite: 2,
      aide: "Même établissement, à un jour d'écart, avec une description très proche : souvent la même affaire saisie deux fois." },
    sans_coord: { titre: "Établissement sans coordonnées", gravite: 2, aide: "Sans latitude ni longitude, l'établissement manque sur la carte et dans l'atlas." },
    hors_perimetre: { titre: "Établissement hors des académies couvertes", gravite: 2,
      aide: "Souvent un homonyme choisi dans une autre académie (« Collège Jean Moulin »…). Vérifiez la commune." },
    sans_qualif: { titre: "Qualification manquante", gravite: 2, aide: "La dernière version n'a pas de qualification : elle échappe aux comptes et aux filtres." },
    essai: { titre: "Saisie d'essai ou description vide", gravite: 1, aide: "Description vide, très courte ou de test (« test », « xxx »…)." },
  };
  const GRAVITES = { 3: ["haute", "Haute"], 2: ["moyenne", "Moyenne"], 1: ["basse", "Basse"] };

  /* ---------- sections d'établissement : règles communes au widget de saisie (socle) ---------- */
  const genreSection = (...a) => S.genreSection(...a);

  /* ---------- lecture et analyse d'un champ (table des réponses + référentiel) ---------- */
  async function texteRef(type, ids) {
    const cible = S.cibleRef(type); if (!cible) return null;
    try { const t = await grist.docApi.fetchTable(cible), c = Object.keys(t).find(k => k !== "id" && k !== "manualSort" && (t[k] || []).some(x => typeof x === "string"));
      const lib = new Map(t.id.map((id, i) => [id, c ? t[c][i] : String(id)])); return v => lib.get(refId(v)) || ""; } catch (_) { return null; }
  }
  async function analyserEspace(e, meta, g) {
    const tMeta = meta[e.reponses]; if (!tMeta) return null;
    const assoc = e.reponses === g.reponses ? ((config.valeurs.roles || {}).reponses || {}) : {};
    const rr = S.resoudreRoles("reponses", tMeta, { reponses: e.reponses, referentiel: e.referentiel }, assoc, {});
    const c = r => rr[r] && rr[r].col;
    const colEtab = c("Etablissement"), refTable = colEtab ? S.cibleRef(tMeta.colonnes[colEtab].type) : null;
    const t = await grist.docApi.fetchTable(e.reponses);
    const v = (col, i) => col ? (t[col] || [])[i] : null;
    // référentiel : établissements cités, leurs sections et voisins
    let ref = null, rc = {};
    if (refTable && meta[refTable]) {
      const assocRef = e.referentiel === g.referentiel ? ((config.valeurs.roles || {}).referentiel || {}) : {};
      const rf = S.resoudreRoles("referentiel", meta[refTable], { reponses: e.reponses, referentiel: refTable }, assocRef, {});
      ["Nom", "UAI", "Type", "Libelle_nature", "Commune", "Academie", "Latitude", "Longitude"].forEach(k => { if (rf[k] && rf[k].col) rc[k] = rf[k].col; });
      ref = await grist.docApi.fetchTable(refTable);
      // référentiel ESR : composantes et sites rattachés à leur établissement (colonne Rattachement), niveau
      const cR = Object.values(meta[refTable].colonnes).find(x => x.type === `Ref:${refTable}` && /rattach|parent/i.test(x.colId));
      if (cR) rc.Rattachement = cR.colId;
      if (meta[refTable].colonnes.Niveau) rc.Niveau = "Niveau";
      const lireAca = rc.Academie && /^Ref:/.test(meta[refTable].colonnes[rc.Academie].type) ? await texteRef(meta[refTable].colonnes[rc.Academie].type) : null;
      ref.__aca = lireAca;
    }
    const idxRef = new Map(ref ? ref.id.map((id, i) => [id, i]) : []);
    const etabInfo = new Map();
    const info = id => {
      if (id == null) return null;
      if (etabInfo.has(id)) return etabInfo.get(id);
      const i = idxRef.get(id); let x = null;
      if (i !== undefined) {
        const val = k => rc[k] ? ref[rc[k]][i] : null;
        const lat = +val("Latitude"), lon = +val("Longitude");
        x = { id, nom: texte(val("Nom")), uai: texte(val("UAI")).trim(), type: texte(val("Type")), nature: texte(val("Libelle_nature")), commune: texte(val("Commune")),
          aca: ref.__aca ? ref.__aca(val("Academie")) : texte(val("Academie")), lat: isFinite(lat) && lat ? lat : null, lon: isFinite(lon) && lon ? lon : null };
        x.section = genreSection(x.nature, x.type, x.nom);
        x.rattId = rc.Rattachement ? refId(ref[rc.Rattachement][i]) : null;
        if (x.rattId && x.rattId !== id && !x.section) x.section = texte(val("Niveau")) || "Composante";
      }
      etabInfo.set(id, x); return x;
    };
    // établissement de rattachement d'une section : candidats voisins (grille de 0,01°) ou de la même commune
    let grille = null;
    const parent = x => {
      if (!x || !x.section || !ref) return null;
      if (x.parent !== undefined) return x.parent;
      if (x.rattId) {   // composante : établissement de rattachement (en remontant les composantes de composantes)
        const vus = new Set([x.id]); let p = info(x.rattId);
        while (p && p.rattId && !vus.has(p.rattId) && info(p.rattId)) { vus.add(p.id); p = info(p.rattId); }
        x.parent = p && p.id !== x.id ? p : null; x.parentDistance = null; return x.parent;
      }
      if (!grille && rc.Latitude && rc.Longitude) {
        grille = new Map();
        ref.id.forEach((id, i) => { const lat = +ref[rc.Latitude][i], lon = +ref[rc.Longitude][i]; if (!lat || !lon) return;
          const k = `${Math.floor(lat * 100)}|${Math.floor(lon * 100)}`; if (!grille.has(k)) grille.set(k, []); grille.get(k).push(id); });
      }
      const ids = [];
      if (x.lat != null && grille) {
        const la = Math.floor(x.lat * 100), lo = Math.floor(x.lon * 100);
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) (grille.get(`${la + a}|${lo + b}`) || []).forEach(id => ids.push(id));
      } else if (rc.Commune) ref.id.forEach((id, i) => { if (MAJ(ref[rc.Commune][i]) === MAJ(x.commune)) ids.push(id); });
      const r = S.rattachementSection(x, ids.map(info));
      x.parent = r ? r.etab : null; x.parentDistance = r ? r.distance : null;
      return x.parent;
    };

    // dossiers : versions regroupées par dossier (Dossier, sinon la ligne elle-même)
    const typeFaits = c("Date_faits") ? tMeta.colonnes[c("Date_faits")].type : "";
    const jourDe = s => { if (typeof s !== "number") return ""; const d = new Date(s * 1000);
      return /^DateTime/.test(typeFaits) || !typeFaits ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : d.toISOString().slice(0, 10); };
    const lignes = t.id.map((id, i) => ({ id, i, etab: refId(v(colEtab, i)), dossier: refId(v(c("Dossier"), i)) || id, dv: v(c("Derniere_version"), i),
      qualif: texte(v(c("Qualification"), i)).trim(), desc: texte(v(c("Description"), i)).trim(), faits: v(c("Date_faits"), i), cree: v(c("Cree_le"), i),
      site: c("Site") ? MAJ(v(c("Site"), i)) : "", auteur: texte(v(c("Auteur"), i)) }));
    const dossiers = new Map();
    lignes.forEach(l => { if (!dossiers.has(l.dossier)) dossiers.set(l.dossier, []); dossiers.get(l.dossier).push(l); });
    const fiches = [];
    for (const [id, ls] of dossiers) {
      ls.sort((a, b) => (a.cree || 0) - (b.cree || 0) || a.id - b.id);
      const initiale = ls.find(l => l.id === id) || ls[0], derniere = ls.find(l => l.dv === true) || ls[ls.length - 1];
      fiches.push({ id, lignes: ls, initiale, derniere, etab: initiale.etab, jour: jourDe(derniere.faits || initiale.faits || derniere.cree), site: derniere.site || initiale.site });
    }
    const anomalies = [], ajouter = (type, dossiersEnCause, titre, detail, extra = {}) => {
      const ids = [...new Set(dossiersEnCause.map(f => f.id))].sort((a, b) => a - b);
      anomalies.push({ type, gravite: extra.gravite || TYPES[type].gravite, espace: e, cle: `${type}|${e.reponses}|${ids.join(",")}`, fiches: dossiersEnCause, titre, detail, ...extra });
    };
    const libEtab = x => x ? `${x.nom || "?"}${x.uai ? ` (${x.uai})` : ""}${x.commune ? ` — ${x.commune}` : ""}` : "établissement inconnu";
    const academies = new Set((g.academies || []).map(a => MAJ(a)));
    for (const f of fiches) {
      const x = info(f.etab);
      if (!colEtab) break;
      if (f.etab == null) { ajouter("sans_etab", [f], "Signalement sans établissement", ""); continue; }
      // versions sur un autre établissement que le dossier
      const autres = f.lignes.filter(l => l.etab != null && l.etab !== f.etab);
      if (autres.length) ajouter("dossier", [f], `Dossier sur ${libEtab(x)}`, `${autres.length} version(s) sur ${[...new Set(autres.map(l => libEtab(info(l.etab))))].join(", ")}.`);
      if (x && x.section) {
        const p = parent(x);
        ajouter("section", [f], `${x.section} : ${libEtab(x)}`, p ? `Établissement de rattachement${x.rattId ? "" : " probable"} : ${libEtab(p)}${x.parentDistance != null ? ` (à ${Math.round(x.parentDistance)} m)` : ""}.` : "Aucun établissement de rattachement trouvé à proximité : à corriger à la main.",
          { action: p ? { genre: "rattacher", vers: p.id, libelle: `Rattacher à ${p.nom || p.uai}` } : null });
      }
      if (x && (x.lat == null || x.lon == null)) ajouter("sans_coord", [f], libEtab(x), "Latitude ou longitude manquante dans le référentiel.");
      if (x && academies.size && x.aca && !academies.has(MAJ(x.aca))) ajouter("hors_perimetre", [f], libEtab(x), `Académie : ${x.aca}.`);
      if (c("Qualification") && !f.derniere.qualif) ajouter("sans_qualif", [f], libEtab(x), "Dernière version sans qualification.");
      if (c("Description")) { const d = f.derniere.desc;
        if (!d || d.length < 8 || /^(test|essai|xx+|aa+|azert|qsd|bla|toto)\b/i.test(d)) ajouter("essai", [f], libEtab(x), d ? `Description : « ${d.slice(0, 60)} »` : "Description vide."); }
    }
    // doublons : même établissement effectif (section → établissement), même jour, même site
    const effectif = f => { const x = info(f.etab); const p = x && x.section ? parent(x) : null; return p ? p.id : f.etab; };
    const groupes = new Map();
    fiches.filter(f => f.etab != null && f.jour).forEach(f => { const k = `${effectif(f)}|${f.jour}|${f.site}`; if (!groupes.has(k)) groupes.set(k, []); groupes.get(k).push(f); });
    for (const gr of groupes.values()) {
      if (gr.length < 2) continue;
      const avecSection = gr.some(f => (info(f.etab) || {}).section);
      ajouter("doublon", gr, `${gr.length} dossiers pour ${libEtab(info(effectif(gr[0])))} le ${dateFr(gr[0].jour)}`,
        avecSection ? "Dont une section de l'établissement : l'établissement est compté deux fois." : "Même établissement, même jour.", {});
    }
    // jours voisins : même établissement effectif, un jour d'écart, descriptions proches
    const parEtab = new Map();
    fiches.filter(f => f.etab != null && f.jour).forEach(f => { const k = effectif(f); if (!parEtab.has(k)) parEtab.set(k, []); parEtab.get(k).push(f); });
    for (const l of parEtab.values()) {
      if (l.length < 2) continue;
      l.sort((a, b) => a.jour.localeCompare(b.jour));
      for (let a = 0; a < l.length; a++) for (let b = a + 1; b < l.length; b++) {
        const ecart = (Date.parse(l[b].jour) - Date.parse(l[a].jour)) / 86400000;
        if (ecart > 1) break;
        if (ecart !== 1) continue;
        const sim = similarite(l[a].derniere.desc, l[b].derniere.desc);
        if (sim >= 0.6) ajouter("voisin", [l[a], l[b]], `${libEtab(info(effectif(l[a])))} : ${dateFr(l[a].jour)} et ${dateFr(l[b].jour)}`, `Descriptions semblables à ${Math.round(sim * 100)} %.`);
      }
    }
    return { espace: e, anomalies, nbDossiers: fiches.length, colonnes: { etab: colEtab, rr, tMeta, rc, refTable }, info, libEtab };
  }
  function similarite(a, b) {
    const m = s => new Set(MAJ(s).split(" ").filter(w => w.length > 2));
    const x = m(a), y = m(b); if (!x.size || !y.size) return 0;
    const communs = [...x].filter(w => y.has(w)).length; return communs / (x.size + y.size - communs);
  }
  const dateFr = iso => iso ? new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }) : "date inconnue";

  async function analyser() {
    config = await S.lireConfig();
    if (!config) return { erreur: "La table Config est absente : lancez d'abord l'installation." };
    const g = S.general(config), meta = await S.lireMeta(), res = [];
    for (const e of S.espaces(g)) { const r = await analyserEspace(e, meta, g); if (r) res.push(r); }
    return { espaces: res, le: Date.now(), config };
  }


  /* ---------- statuts et corrections ---------- */
  const statuts = cfg => (((cfg || config) && (cfg || config).valeurs.qualite) || {}).statuts || {};
  // marque des anomalies vérifiées (s = "ok"), corrigées (s = "corrige") ou les rouvre (s = null) ; renvoie la Config relue
  async function marquer(liste, s, note) {
    config = await S.lireConfig();
    const q = { ...((config.valeurs.qualite) || {}) }, st = { ...(q.statuts || {}) };
    liste.forEach(a => { if (s) st[a.cle] = { s, le: Math.round(Date.now() / 1000), ...(note ? { note } : {}) }; else delete st[a.cle]; });
    await S.ecrireConfig("qualite", { ...q, statuts: st });
    config = await S.lireConfig();
    return config;
  }
  /* Rattachement : toutes les versions des dossiers en cause passent sur l'établissement visé (celui de l'action proposée,
     ou versId) ; les colonnes recopiées du référentiel (non formules) suivent. Renvoie le nombre de lignes modifiées. */
  async function rattacher(etat, liste, versId) {
    const acts = [];
    for (const a of liste) {
      const vers = versId || (a.action && a.action.genre === "rattacher" ? a.action.vers : null); if (!vers) continue;
      const esp = etat.espaces.find(x => x.espace === a.espace || x.espace.reponses === a.espace.reponses), C = esp.colonnes, y = esp.info(vers) || {};
      const copies = {};
      for (const [role, cleRef] of [["Nom", "nom"], ["UAI", "uai"], ["Type", "type"], ["Commune", "commune"]]) {
        const col = C.rr[role] && C.rr[role].col, m = col && C.tMeta.colonnes[col];
        if (m && !m.isFormula && /^(Text|Choice)$/.test(m.type) && col !== C.etab) copies[col] = y[cleRef];
      }
      a.fiches.forEach(f => f.lignes.filter(l => l.etab === f.etab || l.etab == null).forEach(l => acts.push(["UpdateRecord", esp.espace.reponses, l.id, { [C.etab]: vers, ...copies }])));
    }
    if (acts.length) await grist.docApi.applyUserActions(acts);
    return acts.length;
  }
  window.QualiteMoteur = { analyser, TYPES, GRAVITES, statuts, marquer, rattacher, dateFr, genreSection };
})();
