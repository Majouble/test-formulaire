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
  const ROLES_CRITERES = ["Academie", "Departement", "Statut_public_prive", "Libelle_nature", "Type", "Region_academique"];
  const NOMS_CRITERES = { Academie: "Académie", Departement: "Département", Statut_public_prive: "Public / privé", Libelle_nature: "Nature", Type: "Type", Region_academique: "Région académique" };
  const PREFIXE_PAGE = "Formulaire ";
  const URL_SAISIE_V2 = /\/v2\/saisie\/?(index\.html)?(\?.*)?$/i;

  /* ---------- Référentiel : valeurs des critères possibles ---------- */
  // { table, cols: {colId: {label, ref}}, roles: {role: colId}, valeurs: {colId: [{v, n}]} } ou { absent } / { erreur }
  async function lireReferentiel(general, config) {
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

  window.Repartition = {
    PREFIXE_PAGE, URL_SAISIE_V2, ROLES_CRITERES,
    lireReferentiel, libelleCritere, criteres, criteresAjoutables, enregistrerCriteres,
    perimetreObjet, nettoyer, memePerimetre, resumePerimetre, nomPage,
    lireAgents, optionsVue, lirePages, agentDePage,
  };
})();
