/* =====================================================================
   Administration v2 — répartition du travail (partagé par les onglets Équipe et Formulaires)
   ---------------------------------------------------------------------
   - Équipe : table Agents du socle (nom, adresse, rôle, téléphone, périmètre, actif).
   - Périmètre : { <colonne du référentiel>: [valeurs] } ; un établissement en fait partie s'il remplit
     chaque critère utilisé. Les critères proposés pour le document sont dans la clé « repartition » de Config.
   - Pages de saisie : vues personnalisées dont les options portent le formulaire, l'agent et le périmètre.
   ===================================================================== */
(function () {
  "use strict";
  const S = () => window.Socle;
  const MAX_VALEURS_CRITERE = 200;      // au-delà, une colonne n'est pas proposée comme critère
  const ROLES_CRITERES = ["Academie", "Departement", "Nom_circonscription", "Statut_public_prive", "Libelle_nature", "Type", "Region_academique"];
  const NOMS_CRITERES = { Academie: "Académie", Departement: "Département", Nom_circonscription: "Circonscription", Statut_public_prive: "Public / privé", Libelle_nature: "Nature", Type: "Type", Region_academique: "Région académique" };
  const PREFIXE_PAGE = "Formulaire ";
  const URL_SAISIE_V2 = /\/(v2|prod)\/saisie\/?(index\.html)?(\?.*)?$/i;   // v2 (développement) ou prod (version figée)

  /* ---------- Référentiel : valeurs des critères possibles ---------- */
  // { table, cols: {colId: {label, ref}}, roles: {role: colId}, valeurs: {colId: [{v, n}]} } ou { absent } / { erreur }
  // Valeurs des critères du référentiel : calcul coûteux sur un gros référentiel, gardé 5 min tant que la table n'est pas modifiée
  const memoRef = new Map();
  S().surEcriture(cibles => { for (const k of [...memoRef.keys()]) if (!cibles.size || cibles.has(k.split("|")[0]) || [...cibles].some(c => c.startsWith("_grist"))) memoRef.delete(k); });
  async function lireReferentiel(general, config) {
    const cle = [general.referentiel, general.reponses, JSON.stringify((config && config.valeurs.roles && config.valeurs.roles.referentiel) || {}), JSON.stringify(general.academies || [])].join("|");
    const m = memoRef.get(cle);
    if (m && Date.now() - m.t < 300000) return m.p;
    const p = lireReferentielSansCache(general, config);
    memoRef.set(cle, { t: Date.now(), p });
    p.then(r => { if (!r || r.erreur) memoRef.delete(cle); }, () => memoRef.delete(cle));
    return p;
  }
  async function lireReferentielSansCache(general, config) {
    const table = general.referentiel;
    try {
      const meta = await S().lireMeta(), tMeta = meta[table];
      if (!tMeta) return { table, absent: true };
      const roles = S().resoudreRoles("referentiel", tMeta, { reponses: general.reponses, referentiel: table },
        ((config && config.valeurs.roles && config.valeurs.roles.referentiel) || {}), {});
      const t = await grist.docApi.fetchTable(table), valeurs = {}, cols = {};
      for (const c of Object.values(tMeta.colonnes)) {
        if (!/^(Text|Choice|Ref)$/.test(c.type.split(":")[0]) || !t[c.colId]) continue;
        let affiche = v => v;
        const cible = S().cibleRef(c.type);
        if (cible) {   // référence : on répartit sur le libellé affiché de la ligne visée
          try {
            const tc = await grist.docApi.fetchTable(cible), cTexte = Object.keys(tc).find(k => k !== "id" && k !== "manualSort" && (tc[k] || []).some(x => typeof x === "string"));
            const lib = new Map(tc.id.map((id, i) => [id, cTexte ? tc[cTexte][i] : String(id)]));
            affiche = v => lib.get(v);
          } catch (_) { continue; }
        }
        const compte = new Map();
        for (const brut of t[c.colId]) { const v = affiche(brut); if (typeof v === "string" && v.trim()) compte.set(v.trim(), (compte.get(v.trim()) || 0) + 1); }
        if (!compte.size || compte.size > MAX_VALEURS_CRITERE) continue;
        cols[c.colId] = { label: c.label || c.colId, ref: !!cible };
        valeurs[c.colId] = [...compte.entries()].map(([v, n]) => ({ v, n })).sort((a, b) => a.v.localeCompare(b.v, "fr"));
      }
      // Académies : l'ordre et la liste de l'onglet Installation priment quand elles sont renseignées
      const cAca = roles.Academie && roles.Academie.col;
      if (cAca && valeurs[cAca] && (general.academies || []).length) {
        const n = new Map(valeurs[cAca].map(x => [x.v, x.n]));
        valeurs[cAca] = general.academies.map(a => ({ v: a, n: n.get(a) || 0 }));
      }
      return { table, cols, valeurs, roles: Object.fromEntries(Object.entries(roles).filter(([, r]) => r.col).map(([k, r]) => [k, r.col])) };
    } catch (e) { return { table, erreur: e.message || String(e) }; }
  }
  function libelleCritere(ref, colId) {
    const role = ref && Object.entries(ref.roles || {}).find(([, c]) => c === colId);
    return role && NOMS_CRITERES[role[0]] ? NOMS_CRITERES[role[0]] : ((ref && ref.cols && ref.cols[colId] && ref.cols[colId].label) || colId);
  }
  // Critères retenus pour le document (par défaut : l'académie)
  function criteres(ref, config) {
    const enr = config && config.valeurs.repartition && config.valeurs.repartition.criteres;
    const dispo = c => ref && ref.valeurs && ref.valeurs[c];
    if (Array.isArray(enr) && enr.length) return enr.filter(dispo);
    const aca = ref && ref.roles && ref.roles.Academie;
    return aca && dispo(aca) ? [aca] : [];
  }
  // Critères que l'on peut ajouter : rôles connus d'abord, puis les autres colonnes
  function criteresAjoutables(ref, config) {
    const dispo = Object.keys((ref && ref.valeurs) || {}), deja = criteres(ref, config), roles = (ref && ref.roles) || {};
    const ordre = [...ROLES_CRITERES.map(r => roles[r]).filter(c => c && dispo.includes(c)), ...dispo.filter(c => !Object.values(roles).includes(c))];
    return [...new Set(ordre)].filter(c => !deja.includes(c));
  }
  async function enregistrerCriteres(config, liste) {
    await S().ecrireConfig("repartition", { ...((config && config.valeurs.repartition) || {}), criteres: liste });
    return S().lireConfig();
  }

  /* ---------- Périmètres ---------- */
  // Ancien format (liste d'académies) → { colonne académie: liste } ; texte JSON accepté
  function perimetreObjet(ref, p) {
    if (typeof p === "string") { try { p = p.trim() ? JSON.parse(p) : {}; } catch (_) { p = {}; } }
    if (Array.isArray(p)) { const aca = (ref && ref.roles && ref.roles.Academie) || "Academie"; return p.length ? { [aca]: [...p] } : {}; }
    return p && typeof p === "object" ? JSON.parse(JSON.stringify(p)) : {};
  }
  const nettoyer = p => Object.fromEntries(Object.entries(p || {}).filter(([, v]) => Array.isArray(v) && v.length));
  const memePerimetre = (a, b) => {
    const tri = p => JSON.stringify(Object.entries(nettoyer(p)).sort(([x], [y]) => x.localeCompare(y)).map(([k, v]) => [k, [...v].sort()]));
    return tri(a) === tri(b);
  };
  const resumePerimetre = p => Object.values(nettoyer(p)).map(v => v.join(", ")).join(" – ");
  const nomPage = (nom, perimetre) => { const r = resumePerimetre(perimetre); return `${PREFIXE_PAGE}${String(nom || "").trim()}${r ? ` (${r})` : ""}`; };

  /* ---------- Équipe (table Agents) ---------- */
  // null si la table n'existe pas ; sinon [{ id, nom, email, fonction, telephone, actif }]
  // Ancienne colonne Role (alpha.10) : Saisie → Opérateur, Coordination → Coordinateur, si Fonction est vide.
  const FONCTION_ANCIEN_ROLE = { Saisie: "Opérateur", Coordination: "Coordinateur", Lecture: "" };
  async function lireAgents(general, ref) {
    const table = general.agents || "Agents";
    let t;
    try { t = await grist.docApi.fetchTable(table); } catch (_) { return null; }
    const col = (k, i) => (t[k] || [])[i];
    return (t.id || []).map((id, i) => ({
      id, nom: String(col("Nom", i) || "").trim(), email: String(col("Email", i) || "").trim(),
      fonction: String(col("Fonction", i) || "").trim() || FONCTION_ANCIEN_ROLE[String(col("Role", i) || "").trim()] || "",
      telephone: String(col("Telephone", i) || "").trim(), actif: col("Actif", i) !== false,
      champsAcces: t.Champs_acces ? S().listeChoix(col("Champs_acces", i)) : null,   // null : colonne absente
      cle: String(col("Cle_acces", i) || "").trim(), pageSaisie: col("Page_saisie", i) || null,   // invité : accès par lien
      lienAcces: typeof col("Lien_acces", i) === "string" ? col("Lien_acces", i) : "", invitesPossibles: !!t.Cle_acces,
      lienExpire: col("Lien_expire_le", i) || null, lienValide: t.Lien_valide ? col("Lien_valide", i) === true : null,
    })).sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  }

  /* ---------- Pages de saisie ---------- */
  function optionsVue(brut) {
    let o = {}, cv = {};
    try { o = JSON.parse(brut || "{}") || {}; } catch (_) { o = {}; }
    try { cv = typeof o.customView === "string" ? JSON.parse(o.customView || "{}") || {} : (o.customView || {}); } catch (_) { cv = {}; }
    return { o, cv };
  }
  // Vues personnalisées qui affichent un formulaire de saisie ; null si les métadonnées sont illisibles
  async function lirePages() {
    try {
      const [s, v, t] = await Promise.all([grist.docApi.fetchTable("_grist_Views_section"), grist.docApi.fetchTable("_grist_Views"), grist.docApi.fetchTable("_grist_Tables")]);
      return s.id.map((id, i) => {
        if (s.parentKey[i] !== "custom" || !s.parentId[i]) return null;
        const { cv } = optionsVue(s.options[i]), url = cv.url || (cv.widgetDef && cv.widgetDef.url) || "";
        const wo = cv.widgetOptions || {};
        if (!/signalement|\/saisie\/?/i.test(url) && !("formulaire" in wo)) return null;
        if (wo.etablissements) return null;   // page des établissements (accès par lien) : onglet Établissements
        const vi = v.id.indexOf(s.parentId[i]);
        return { sectionRef: id, viewRef: s.parentId[i], page: vi >= 0 ? String(v.name[vi] || "") : "", table: t.tableId[t.id.indexOf(s.tableRef[i])] || "",
          url, access: cv.access || "", formulaire: wo.formulaire || null, unique: URL_SAISIE_V2.test(url), esr: /signalement-esr/i.test(url),
          perimetre: wo.perimetre || {}, libelle: wo.libelle || "", agent: wo.agent || null };
      }).filter(Boolean);
    } catch (_) { return null; }
  }
  // Agent d'une page : identifiant mémorisé dans la page, sinon même nom
  function agentDePage(page, agents) {
    if (!agents) return null;
    if (page.agent != null) { const a = agents.find(x => x.id === page.agent); if (a) return a; }
    const n = S().norm(page.libelle || page.page.replace(/^Formulaire\s+/i, "").replace(/\s*\(.*\)\s*$/, ""));
    return n ? agents.find(x => S().norm(x.nom) === n) || null : null;
  }

  /* ---------- Accès des établissements par lien (onglets Établissements et Accès) ---------- */
  // Formulaires d'établissement publiés : [{ id, nom, table, conf }]
  async function lireFormulairesPublies(general) {
    let t;
    try { t = await grist.docApi.fetchTable(general.formulaires); } catch (_) { return []; }
    return (t.id || []).map((id, i) => {
      let conf = null, brouillon = null;
      try { conf = t.Publie && t.Publie[i] ? JSON.parse(t.Publie[i]) : null; } catch (_) { conf = null; }
      try { brouillon = t.Brouillon && t.Brouillon[i] ? JSON.parse(t.Brouillon[i]) : null; } catch (_) { brouillon = null; }
      // blocs du formulaire publié et du brouillon : une question tableau ajoutée (et sa table) est couverte
      // par les règles d'accès dès sa création, sans attendre la publication
      const blocsTableaux = [...((conf && conf.blocs) || []), ...((brouillon && brouillon.blocs) || [])].filter(b => b && b.reglages && b.reglages.tableau && b.reglages.tableau.table);
      return { id, nom: String((t.Nom || [])[i] || ""), table: String((t.Table || [])[i] || ""), conf, blocsTableaux, type: String((t.Type || [])[i] || "etablissement") };
    }).filter(f => f.conf && f.table);
  }
  // Un groupe par référentiel visé par les formulaires d'établissement : clé UUID, colonne Lien, attribut utilisateur
  // (« Etab » pour le premier, « Etab_<table> » ensuite) et paramètre de lien du même nom (?Etab_=<clé>).
  const LIEN = { cle: "UUID", lien: "Lien" };
  function groupesLiens(meta, config, general, formulaires) {
    const assoc = (config && config.valeurs.roles && config.valeurs.roles.reponses) || {}, parTable = new Map();
    for (const f of formulaires.filter(x => x.type === "etablissement" && meta[x.table])) {
      const rr = S().resoudreRoles("reponses", meta[f.table], { reponses: f.table, referentiel: general.referentiel }, f.table === general.reponses ? assoc : {}, {});
      const col = rr.Etablissement && rr.Etablissement.col, cible = col ? S().cibleRef(meta[f.table].colonnes[col].type) : null;
      if (!cible || !meta[cible]) continue;
      if (!parTable.has(cible)) parTable.set(cible, { table: cible, formulaires: [] });
      parTable.get(cible).formulaires.push({ ...f, colEtab: col });
    }
    const liste = [...parTable.values()].sort((a, b) => (b.table === general.referentiel) - (a.table === general.referentiel) || a.table.localeCompare(b.table));
    liste.forEach((g, k) => {
      g.attribut = k === 0 ? "Etab" : `Etab_${g.table}`;
      const cols = meta[g.table].colonnes;
      g.cle = cols[LIEN.cle] ? LIEN.cle : null; g.lien = cols[LIEN.lien] ? LIEN.lien : null;
      g.formuleLien = g.lien ? cols[LIEN.lien].formula : "";
    });
    return liste;
  }
  // Tables que lit le widget de saisie ouvert par un lien : réponses, référentiel, sous-tables (tableaux), listes de choix
  function tablesPubliques(meta, general, groupes) {
    const out = new Set(), technique = new Set([general.agents, general.creneaux, general.affectations, general.emargements, general.actions, S().TABLE_CONFIG, general.formulaires]);
    for (const g of groupes) {
      out.add(g.table);
      for (const f of g.formulaires) {
        out.add(f.table);
        (f.blocsTableaux || f.conf.blocs || []).forEach(b => { const st = b && b.reglages && b.reglages.tableau && b.reglages.tableau.table; if (st && meta[st]) out.add(st); });
        Object.values(meta[f.table].colonnes).forEach(c => { const x = S().cibleRef(c.type) || (/^RefList:(.+)$/.exec(c.type) || [])[1]; if (x && meta[x] && !technique.has(x)) out.add(x); });
      }
    }
    return [...out];
  }
  // Copie des colonnes lue par le widget de saisie quand les règles d'accès cachent les métadonnées de Grist
  // (établissements par lien, agents invités, et agents dont les droits ne couvrent pas tout le document) :
  // tables de tous les formulaires publiés, leurs sous-tables, listes de choix et référentiels.
  async function majSchemaPublic(meta, config, general, formulaires) {
    const groupes = groupesLiens(meta, config, general, formulaires);
    const tous = formulaires.filter(f => meta[f.table]).map(f => ({ ...f, colEtab: null }));
    const tables = new Set(tablesPubliques(meta, general, [...groupes, { table: general.referentiel, formulaires: tous }].filter(g => meta[g.table] || g.formulaires.length)));
    if (!meta[general.referentiel]) tables.delete(general.referentiel);
    return tables.size ? S().majSchemaPublic([...tables].filter(t => meta[t])) : false;
  }
  const formuleLien = (attribut, page) => `SELF_HYPERLINK(${page ? `page=${page}, ` : ""}LinkKey_${attribut}=$${LIEN.cle})${S().STYLE_LIEN}`;
  const ancienneFormuleLien = (attribut, page) => `SELF_HYPERLINK(${page ? `page=${page}, ` : ""}LinkKey_${attribut}=$${LIEN.cle})`;
  // Pages des établissements : vues personnalisées dont l'option « etablissements » nomme le référentiel
  async function lirePagesEtab() {
    try {
      const [s, v] = await Promise.all([grist.docApi.fetchTable("_grist_Views_section"), grist.docApi.fetchTable("_grist_Views")]);
      return s.id.map((id, i) => {
        if (s.parentKey[i] !== "custom" || !s.parentId[i]) return null;
        const { cv } = optionsVue(s.options[i]), wo = cv.widgetOptions || {};
        if (!wo.etablissements) return null;
        const vi = v.id.indexOf(s.parentId[i]);
        return { sectionRef: id, viewRef: s.parentId[i], page: vi >= 0 ? String(v.name[vi] || "") : "", referentiel: wo.etablissements, formulaire: wo.formulaire || "", url: cv.url || "" };
      }).filter(Boolean);
    } catch (_) { return null; }
  }

  window.Repartition = {
    PREFIXE_PAGE, URL_SAISIE_V2, ROLES_CRITERES,
    lireReferentiel, libelleCritere, criteres, criteresAjoutables, enregistrerCriteres,
    perimetreObjet, nettoyer, memePerimetre, resumePerimetre, nomPage,
    lireAgents, optionsVue, lirePages, agentDePage,
    LIEN, lireFormulairesPublies, groupesLiens, formuleLien, ancienneFormuleLien, lirePagesEtab, tablesPubliques, majSchemaPublic,
  };
})();
