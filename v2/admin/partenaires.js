/* =====================================================================
   Administration v2 — onglet « Accès », carte « Partenaires : DSDEN, rectorats… » (2.62.0-alpha.37)
   ---------------------------------------------------------------------
   Un partenaire est aussi un service : un lien commun par DSDEN, rectorat ou autre organisme, sans compte Grist, pour
   consulter la fiche établissement et le tableau de bord, et compléter les fiches (données demandées aux services,
   éléments réservés d'un dossier) des établissements de son périmètre. Ligne de la table Partenaires :
   - échelon (Départemental + Departements, Académique + Academies, National : tout le document ; liste vide : rien) ;
   - lien à échéance (Lien_expire_le, Lien_valide), nouveau lien (nouvelle clé), prolongation ;
   - création par lot depuis le référentiel (« DSDEN <département> », « Rectorat <académie> »), liens en CSV ;
   - pages des partenaires : fiche établissement (option « partenaires » du widget Fiche, réglée dans le widget),
     compléments (widget de saisie, option « partenaires ») et tableau de bord (copie d'une page existante) ;
   - préparation du document : colonnes de la table Partenaires (les partenaires déjà là deviennent « Académique » avec
     leurs académies, ou « National »), colonnes d'aide « _nom » des références de département ou d'académie, colonnes
     formules Departement et Academie des tables rattachées à un établissement et des tableaux.
   Règles d'accès : onglet Accès (perimPart, reglesPartenairesServices). Réglages : clé « partenaires » de Config (tables,
   duree). Définit : window.OngletPartenaires = { afficher }. Utilise : Socle, Repartition, OngletAcces (facultatif).
   ===================================================================== */
(function () {
  "use strict";
  const S = window.Socle, R = window.Repartition, PART = S.PARTENAIRES;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const maintenant = () => Date.now() / 1000;
  const nouvelleCle = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join("");

  let config, general, meta, ref, formulaires, racine, reglage, brut = null, sections = null;
  const choix = { dep: true, aca: true };   // création : un partenaire par département, par académie

  /* ---------- Lecture ---------- */
  async function charger() {
    config = await S.lireConfig();
    general = S.general(config);
    meta = await S.lireMeta();
    reglage = S.reglagesPartenaires(config);
    formulaires = await R.lireFormulairesPublies(general).catch(() => []);
    ref = await R.lireReferentiel(general, config).catch(() => null);
    try { brut = meta[PART.table] ? await grist.docApi.fetchTable(PART.table) : null; } catch (_) { brut = null; }
    try {
      const [V, Sx] = await Promise.all([grist.docApi.fetchTable("_grist_Views"), grist.docApi.fetchTable("_grist_Views_section")]);
      sections = Sx.id.map((id, i) => { const { cv } = R.optionsVue(Sx.options[i]), k = V.id.indexOf(Sx.parentId[i]);
        return { id, vue: Sx.parentId[i], page: k >= 0 ? String(V.name[k] || "") : "", tableRef: Sx.tableRef ? Sx.tableRef[i] : 0, options: Sx.options[i], cv: cv || {}, url: (cv && (cv.url || (cv.widgetDef && cv.widgetDef.url))) || "" }; });
    } catch (_) { sections = []; }
  }
  const colsP = () => (meta[PART.table] || { colonnes: {} }).colonnes;
  const valeursRef = role => { const c = ref && ref.roles && ref.roles[role]; return c && ref.valeurs && ref.valeurs[c] ? ref.valeurs[c].map(x => x.v).filter(Boolean) : []; };
  const departements = () => valeursRef("Departement");
  const academies = () => (general.academies && general.academies.length) ? general.academies : valeursRef("Academie");
  function partenaires() {
    if (!brut) return [];
    const v = (k, i) => (brut[k] || [])[i];
    return brut.id.map((id, i) => {
      const ech = String(v(PART.echelon, i) || ""), lieux = ech === "Départemental" ? S.listeChoix(v(PART.departements, i)) : ech === "Académique" ? (v(PART.academies, i) || []).slice(1) : [];
      return { id, nom: String(v(PART.nom, i) || "").trim() || `Partenaire n° ${id}`, actif: v(PART.actif, i) !== false, echelon: ech, lieux,
        cle: String(v(PART.cle, i) || ""), lien: typeof v(PART.lien, i) === "string" ? v(PART.lien, i) : "", expire: v(PART.expire, i) || null };
    }).sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  }
  // académies d'une liste de références : numéros de ligne de la table visée, retrouvés par leur nom
  let cibleAcademies = null;   // { table, parNom: Map } quand Academies est une liste de références
  async function lireCibleAcademies() {
    cibleAcademies = null;
    const c = colsP()[PART.academies], t = c && /^RefList:/.test(c.type) ? c.type.slice(8) : null;
    if (!t || !meta[t]) return;
    const vis = Object.values(meta[t].colonnes).find(x => x.ref === c.visibleCol) || Object.values(meta[t].colonnes).find(x => /^(nom|libelle|academie)$/i.test(x.colId));
    try { const d = await grist.docApi.fetchTable(t); cibleAcademies = { table: t, parNom: new Map(d.id.map((id, k) => [String(vis ? d[vis.colId][k] : id), id])), noms: new Map(d.id.map((id, k) => [id, String(vis ? d[vis.colId][k] : id)])) }; } catch (_) { /* table illisible */ }
  }
  const nomAcademie = x => cibleAcademies && typeof x === "number" ? cibleAcademies.noms.get(x) || String(x) : String(x);
  function aCreer() {
    // déjà créé : un partenaire du même nom (« DSDEN … », « Rectorat … ») ; une préfecture sur la même académie n'en tient pas lieu
    const noms = new Set(partenaires().map(p => p.nom)), couvert = (ech, x) => noms.has(S.nomPartenaireLieu(ech, x));
    return [...(choix.dep ? departements().filter(x => !couvert("Départemental", x)).map(x => ({ echelon: "Départemental", lieu: x })) : []),
      ...(choix.aca ? academies().filter(x => !couvert("Académique", x)).map(x => ({ echelon: "Académique", lieu: x })) : [])];
  }

  /* ---------- Préparation du document ---------- */
  function sousTables() {
    const out = [];
    for (const f of formulaires || []) for (const b of (f.conf.blocs || [])) {
      const st = b && b.reglages && b.reglages.tableau && b.reglages.tableau.table;
      if (!st || !meta[st] || out.some(x => x.table === st)) continue;
      const cs = meta[st].colonnes, parent = (cs.Dossier && cs.Dossier.type === `Ref:${f.table}` && cs.Dossier) || Object.values(cs).find(c => c.type === `Ref:${f.table}` && c.colId !== "Version");
      if (parent) out.push({ table: st, parent: parent.colId, reponses: f.table });
    }
    return out;
  }
  function colonneNom(t, c) {
    const col = meta[t] && meta[t].colonnes[c], cible = col && S.cibleRef(col.type);
    if (!cible || !meta[cible]) return null;
    const cs = Object.values(meta[cible].colonnes), vis = cs.find(x => x.ref === col.visibleCol) || cs.find(x => /^(nom|libelle|academie|departement)$/i.test(x.colId));
    return vis ? { id: `${c}_nom`, formula: `$${c}.${vis.colId}` } : null;
  }
  function tablesPerimetre() {
    const l = new Set();
    for (const e of S.espaces(general)) [e.reponses, e.referentiel].forEach(t => meta[t] && l.add(t));
    reglage.tables.forEach(t => meta[t] && l.add(t));
    return [...l];
  }
  function preparations() {
    const acts = [], quoi = [];
    if (!meta[PART.table]) return { acts, quoi, sansTable: true };
    const cp = colsP();
    if (!cp[PART.echelon]) { acts.push(["AddColumn", PART.table, PART.echelon, { type: "Choice", isFormula: false, widgetOptions: JSON.stringify({ choices: S.ECHELONS_PARTENAIRE }), label: "Échelon", untieColIdFromLabel: true }]); quoi.push(`${PART.table}.${PART.echelon}`); }
    if (!cp[PART.departements]) { acts.push(["AddColumn", PART.table, PART.departements, { type: "ChoiceList", isFormula: false, widgetOptions: JSON.stringify({ choices: departements() }), label: "Départements", untieColIdFromLabel: true }]); quoi.push(`${PART.table}.${PART.departements}`); }
    if (!cp[PART.academies]) { acts.push(["AddColumn", PART.table, PART.academies, { type: "ChoiceList", isFormula: false, widgetOptions: JSON.stringify({ choices: academies() }), label: "Académies", untieColIdFromLabel: true }]); quoi.push(`${PART.table}.${PART.academies}`); }
    if (!cp[PART.expire]) { acts.push(["AddColumn", PART.table, PART.expire, { type: "DateTime:Europe/Paris", isFormula: false, label: "Lien valable jusqu'au", untieColIdFromLabel: true }]); quoi.push(`${PART.table}.${PART.expire}`); }
    if (!cp[PART.valide]) { acts.push(["AddColumn", PART.table, PART.valide, { type: "Bool", isFormula: true, formula: `bool($${PART.cle}) and (not $${PART.expire} or $${PART.expire} > NOW())`, label: "Lien valable", untieColIdFromLabel: true }]); quoi.push(`${PART.table}.${PART.valide}`); }
    // partenaires déjà là : « Académique » avec leurs académies, sinon « National » (comme avant : liste vide = tout)
    if (!cp[PART.echelon] && brut && brut.id.length) {
      const ech = brut.id.map((_, i) => { const a = (brut[PART.academies] || [])[i]; return Array.isArray(a) && a.length > 1 ? "Académique" : "National"; });
      acts.push(["BulkUpdateRecord", PART.table, brut.id, { [PART.echelon]: ech }]); quoi.push(`échelon des ${brut.id.length} partenaire${brut.id.length > 1 ? "s" : ""} existant${brut.id.length > 1 ? "s" : ""}`);
    }
    const texte = {};
    for (const t of tablesPerimetre()) {
      texte[t] = {};
      for (const c of ["Departement", "Academie"]) {
        const col = meta[t].colonnes[c]; if (!col) continue;
        if (!/^Ref(List)?:/.test(col.type)) { texte[t][c] = c; continue; }
        const aide = colonneNom(t, c);
        if (aide && !meta[t].colonnes[aide.id]) { acts.push(["AddColumn", t, aide.id, { type: "Any", isFormula: true, formula: aide.formula, label: `${c} (nom)`, untieColIdFromLabel: true }]); quoi.push(`${t}.${aide.id}`); }
        if (aide) texte[t][c] = aide.id;
      }
    }
    // tables rattachées à un établissement (données de la fiche) : département et académie repris de l'établissement
    const refs = new Set(S.espaces(general).map(e => e.referentiel));
    for (const t of tablesPerimetre().filter(x => !S.espaces(general).some(e => e.reponses === x || e.referentiel === x))) {
      const cs = meta[t].colonnes, lien = Object.values(cs).find(c => /^Ref:/.test(c.type) && refs.has(S.cibleRef(c.type)));
      if (!lien) continue;
      const src = texte[S.cibleRef(lien.type)] || {};
      for (const c of ["Departement", "Academie"]) if (!cs[c] && src[c]) { acts.push(["AddColumn", t, c, { type: "Any", isFormula: true, formula: `$${lien.colId}.${src[c]}`, label: c, untieColIdFromLabel: true }]); quoi.push(`${t}.${c}`); }
    }
    // tableaux : département et académie du signalement parent
    for (const st of sousTables()) {
      const cs = meta[st.table].colonnes, src = texte[st.reponses] || {};
      for (const c of ["Departement", "Academie"]) if (!cs[c] && src[c]) { acts.push(["AddColumn", st.table, c, { type: "Any", isFormula: true, formula: `$${st.parent}.${src[c]}`, label: c, untieColIdFromLabel: true }]); quoi.push(`${st.table}.${c}`); }
    }
    return { acts, quoi };
  }

  /* ---------- Pages des partenaires ---------- */
  const estSaisie = x => /\/saisie\/?(index\.html)?(\?|$)/.test(x.url), estTdb = x => /\/tableau-de-bord\/?(index\.html)?(\?|$)/.test(x.url), estFiche = x => /\/fiche\/?(index\.html)?(\?|$)/.test(x.url);
  const pourPartenaires = x => !!(x.cv.widgetOptions && x.cv.widgetOptions.partenaires === true);
  const pageFiche = () => (sections || []).find(x => estFiche(x) && pourPartenaires(x)) || null;
  const pagesComplements = () => (sections || []).filter(x => estSaisie(x) && pourPartenaires(x));
  const pageTdb = () => (sections || []).find(x => estTdb(x) && pourPartenaires(x)) || null;
  const formsEtab = () => (formulaires || []).filter(f => f.type === "etablissement" && meta[f.table]);
  async function creerPage(tableRef, options, nom) {
    const res = await grist.docApi.applyUserActions([["CreateViewSection", tableRef, 0, "custom", null, null]]);
    const rv = (res && res.retValues && res.retValues[0]) || {};
    if (!rv.sectionRef) throw new Error("Grist n'a pas indiqué la vue créée");
    await grist.docApi.applyUserActions([["UpdateRecord", "_grist_Views_section", rv.sectionRef, { options: JSON.stringify(options), title: nom }], ...(rv.viewRef ? [["UpdateRecord", "_grist_Views", rv.viewRef, { name: nom }]] : [])]);
  }
  // page de compléments (une par formulaire établissement publié) et page du tableau de bord (copie d'une page existante)
  async function creerPages() {
    const faites = [];
    const modeleSaisie = (sections || []).find(x => estSaisie(x) && !pourPartenaires(x));
    const url = (modeleSaisie && modeleSaisie.url) || (() => { try { const u = new URL("../saisie/", location.href).href; if (/^https?:/.test(u)) return u; } catch (_) {} return "https://majouble.github.io/test-formulaire/v2/saisie/"; })();
    for (const f of formsEtab()) {
      if (pagesComplements().some(x => x.cv.widgetOptions.formulaire === f.nom)) continue;
      const nom = formsEtab().length > 1 ? `Compléments ${f.nom} (partenaires)` : "Compléments (partenaires)";
      await creerPage(meta[f.table].ref, { customView: JSON.stringify({ mode: "url", url, access: "full", widgetOptions: { formulaire: f.nom, libelle: "Partenaires", partenaires: true } }) }, nom);
      faites.push(nom);
    }
    const modeleTdb = (sections || []).find(x => estTdb(x) && !pourPartenaires(x));
    if (!pageTdb() && modeleTdb) {
      const { o, cv } = R.optionsVue(modeleTdb.options);
      o.customView = JSON.stringify({ ...cv, widgetOptions: { ...(cv.widgetOptions || {}), partenaires: true } });
      await creerPage(modeleTdb.tableRef, o, "Tableau de bord (partenaires)");
      faites.push("Tableau de bord (partenaires)");
    }
    return faites;
  }

  /* ---------- Rendu ---------- */
  const dateCourte = t => new Date(t * 1000).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const libelleDuree = d => (S.DUREES_INVITE.find(x => x[0] === d) || S.DUREES_INVITE[0])[1];
  const finValidite = () => { const h = (S.DUREES_INVITE.find(x => x[0] === reglage.duree) || [])[2]; return h ? maintenant() + h * 3600 : null; };
  const etatLien = p => !p.cle ? `<span class="pastille manque">sans clé</span>`
    : p.expire && p.expire <= maintenant() ? `<span class="pastille manque">lien expiré</span>`
    : p.expire ? `<span class="pastille ok">jusqu'au ${esc(dateCourte(p.expire))}</span>` : `<span class="pastille">sans limite</span>`;
  const perimetre = p => p.echelon === "National" ? `<span class="pastille reco">tout le document</span>`
    : !p.echelon ? `<span class="pastille manque">échelon à choisir : aucun accès</span>`
    : p.lieux.length ? esc(p.lieux.map(nomAcademie).join(", ")) : `<span class="pastille manque">périmètre vide : aucun accès</span>`;
  function dessiner() {
    const titre = `<h2>Partenaires : DSDEN, rectorats…</h2>`;
    if (!config) { racine.innerHTML = `${titre}<p class="vide">La table Config est absente : lancez d'abord l'installation.</p>`; return; }
    const prep = preparations();
    if (prep.sansTable) { racine.innerHTML = `${titre}<p class="vide">Créez d'abord la table ${esc(PART.table)} (carte ci-dessus).</p>`; return; }
    const pl = partenaires(), nouv = prep.acts.length ? [] : aCreer(), pf = pageFiche(), pc = pagesComplements(), pt = pageTdb();
    const manquePages = formsEtab().some(f => !pc.some(x => x.cv.widgetOptions.formulaire === f.nom)) || (!pt && (sections || []).some(x => estTdb(x)));
    racine.innerHTML = `${titre}
      <p class="aide">Un lien commun par organisme (DSDEN, rectorat…), sans compte Grist. Il ouvre la fiche établissement ; le partenaire y trouve aussi le tableau de bord et la page des compléments,
        où il complète les fiches des établissements de son périmètre : données demandées aux services et éléments réservés d'un dossier. Il ne crée ni ne met à jour de signalement, et ne vise pas.
        Il ne lit que son périmètre (département, académie, ou tout le document pour un partenaire national). <strong>Le lien vaut mot de passe</strong> : « Nouveau lien » le remplace aussitôt.</p>
      ${prep.acts.length ? `<div class="bandeau info">Préparation du document : ${prep.quoi.map(esc).join(", ")}.
        <div class="boutons"><button class="primaire" data-pa-act="preparer">Préparer le document</button></div></div>` : ""}
      <div class="grille pa-reglages">
        <label class="champ"><span>Durée de validité des liens</span><small>À la création, au nouveau lien et à la prolongation.</small>
          <select id="pa-duree">${S.DUREES_INVITE.map(([v, l]) => `<option value="${v}"${v === reglage.duree ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
        <div class="champ"><span>Pages des partenaires</span>
          <small>Fiche : ${pf ? `« ${esc(pf.page)} »` : "aucune (widget Fiche établissement, ⚙ Réglages, « Page des partenaires »)"} ·
            Compléments : ${pc.length ? pc.map(x => `« ${esc(x.page)} »`).join(", ") : "aucune"} · Tableau de bord : ${pt ? `« ${esc(pt.page)} »` : "aucune"}</small>
          ${manquePages ? `<div class="boutons"><button class="secondaire" data-pa-act="pages">Créer les pages manquantes</button></div>` : ""}</div>
      </div>
      ${pl.length ? `<div class="pa-defile"><table class="va-table pa-table"><thead><tr><th>Partenaire</th><th>Échelon</th><th>Périmètre</th><th>Lien</th><th></th></tr></thead><tbody>
        ${pl.map(p => `<tr${p.actif ? "" : ' class="va-inactif"'}><td><strong>${esc(p.nom)}</strong>${p.actif ? "" : ` <span class="pastille">inactif</span>`}</td><td>${esc(p.echelon || "—")}</td><td>${perimetre(p)}</td>
          <td>${etatLien(p)}${p.lien && p.cle ? ` <button class="lien-btn" data-pa-copier="${esc(p.lien)}">Copier</button>` : ""}</td>
          <td><button class="lien-btn" data-pa-nouveau="${p.id}" title="Nouvelle clé : l'ancien lien cesse de fonctionner">Nouveau lien</button>
            ${reglage.duree !== "illimite" && colsP()[PART.expire] ? `<button class="lien-btn" data-pa-prolonger="${p.id}" title="Garde le même lien">Prolonger</button>` : ""}</td></tr>`).join("")}
        </tbody></table></div>` : `<p class="vide">Aucun partenaire pour l'instant.</p>`}
      ${prep.acts.length ? "" : `<div class="pa-creation"><strong>Créer des partenaires</strong>
        <label class="eq-case"><input type="checkbox" id="pa-dep"${choix.dep ? " checked" : ""}> un par département (DSDEN)</label>
        <label class="eq-case"><input type="checkbox" id="pa-aca"${choix.aca ? " checked" : ""}> un par académie (rectorat)</label>
        <p class="aide">${nouv.length ? `${nouv.length} à créer : ${esc(nouv.slice(0, 12).map(x => S.nomPartenaireLieu(x.echelon, x.lieu)).join(", "))}${nouv.length > 12 ? "…" : ""}.` : "Tous les départements et académies du référentiel ont leur partenaire."}
          Chaque lien est valable ${esc(libelleDuree(reglage.duree))}. Un autre organisme (préfecture, partenaire national…) s'ajoute à la main dans la table ${esc(PART.table)}.</p></div>`}
      <div class="boutons">
        ${prep.acts.length ? "" : `<button class="primaire" data-pa-act="creer"${nouv.length ? "" : " disabled"}>Créer ${nouv.length ? `${nouv.length} partenaire${nouv.length > 1 ? "s" : ""}` : "les partenaires"}</button>`}
        ${pl.length ? `<button class="secondaire" data-pa-act="csv">Télécharger les liens (CSV)</button>` : ""}
        <span class="statut" id="pa-statut" role="status"></span></div>
      <p class="aide">Après une création, un nouveau lien ou une préparation, appliquez les règles d'accès (carte suivante) si elles ne le sont pas d'elles-mêmes.</p>`;
    lier();
  }

  /* ---------- Écritures ---------- */
  const dire = (t, err) => { const st = $("pa-statut"); if (st) { st.textContent = t; st.className = `statut${err ? " err" : " ok"}`; } };
  async function reappliquer() {
    try { if (window.OngletAcces && window.OngletAcces.reappliquerSiBesoin) return (await window.OngletAcces.reappliquerSiBesoin()).texte || ""; } catch (_) { /* facultatif */ }
    return "";
  }
  async function creer() {
    const nouv = aCreer(); if (!nouv.length) return;
    dire(`Création de ${nouv.length} partenaire${nouv.length > 1 ? "s" : ""}…`);
    try {
      const fin = finValidite(), refAca = !!cibleAcademies, cp = colsP();
      const aca = x => refAca ? cibleAcademies.parNom.get(x.lieu) : x.lieu, manque = nouv.filter(x => x.echelon === "Académique" && refAca && aca(x) == null);
      if (manque.length) throw new Error(`académie introuvable dans ${cibleAcademies.table} : ${manque.map(x => x.lieu).join(", ")}`);
      await grist.docApi.applyUserActions([["BulkAddRecord", PART.table, nouv.map(() => null), {
        [PART.nom]: nouv.map(x => S.nomPartenaireLieu(x.echelon, x.lieu)), [PART.actif]: nouv.map(() => true), [PART.cle]: nouv.map(() => nouvelleCle()),
        [PART.echelon]: nouv.map(x => x.echelon),
        [PART.departements]: nouv.map(x => x.echelon === "Départemental" ? ["L", x.lieu] : null),
        [PART.academies]: nouv.map(x => x.echelon === "Académique" ? ["L", aca(x)] : null),
        ...(cp[PART.expire] ? { [PART.expire]: nouv.map(() => fin) } : {}),
      }]]);
      const acces = await reappliquer();
      await recharger();
      dire(`${nouv.length} partenaire${nouv.length > 1 ? "s" : ""} créé${nouv.length > 1 ? "s" : ""}.${acces ? ` ${acces}` : ""} Téléchargez les liens (CSV) pour les envoyer.`);
    } catch (e) { dire(`Échec : ${e.message || e}`, true); }
  }
  async function majLien(id, nouvelle) {
    const fin = finValidite(), f = { ...(nouvelle ? { [PART.cle]: nouvelleCle() } : {}), ...(colsP()[PART.expire] ? { [PART.expire]: fin } : {}) };
    try { await grist.docApi.applyUserActions([["UpdateRecord", PART.table, id, f]]); await recharger();
      dire(nouvelle ? `Nouveau lien créé${fin ? `, valable jusqu'au ${dateCourte(fin)}` : ""} : l'ancien ne fonctionne plus.` : `Lien prolongé${fin ? ` jusqu'au ${dateCourte(fin)}` : ""}.`); }
    catch (e) { dire(`Échec : ${e.message || e}`, true); }
  }
  function csv() {
    const l = [["Partenaire", "Échelon", "Périmètre", "Lien", "Valable jusqu'au"], ...partenaires().filter(p => p.actif && p.cle).map(p => [p.nom, p.echelon, p.echelon === "National" ? "tout le document" : p.lieux.map(nomAcademie).join(", "), p.lien || "", p.expire ? dateCourte(p.expire) : "sans limite"])];
    const texte = "﻿" + l.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([texte], { type: "text/csv;charset=utf-8" }));
    a.download = "liens-partenaires.csv"; document.body.appendChild(a); a.click(); a.remove();
    dire("Liens téléchargés : à transmettre à chaque partenaire par un canal sûr.");
  }
  function lier() {
    const on = (sel, fn) => { const b = racine.querySelector(sel); if (b) b.addEventListener("click", fn); };
    on("[data-pa-act=preparer]", async () => {
      try { await grist.docApi.applyUserActions(preparations().acts); if (S.oublierStructure) S.oublierStructure(); const acces = await reappliquer(); await recharger(); dire(`Document préparé.${acces ? ` ${acces}` : ""}`); }
      catch (e) { dire(`Échec : ${e.message || e}`, true); }
    });
    on("[data-pa-act=pages]", async () => {
      try { const l = await creerPages(); await recharger(); dire(l.length ? `Pages créées : ${l.join(", ")} (liste des pages de Grist, hors de « Cellule »).` : "Pages déjà en place."); }
      catch (e) { dire(`Pages non créées : ${e.message || e}`, true); }
    });
    on("[data-pa-act=creer]", creer);
    on("[data-pa-act=csv]", csv);
    $("pa-duree").addEventListener("change", async e => {
      try { await S.ecrireConfig("partenaires", { ...((config.valeurs && config.valeurs.partenaires) || {}), duree: e.target.value }); await recharger(); dire("Durée enregistrée."); }
      catch (err) { dire(`Échec : ${err.message || err}`, true); }
    });
    if ($("pa-dep")) $("pa-dep").addEventListener("change", e => { choix.dep = e.target.checked; dessiner(); });
    if ($("pa-aca")) $("pa-aca").addEventListener("change", e => { choix.aca = e.target.checked; dessiner(); });
    racine.querySelectorAll("[data-pa-nouveau]").forEach(b => b.addEventListener("click", () => majLien(+b.dataset.paNouveau, true)));
    racine.querySelectorAll("[data-pa-prolonger]").forEach(b => b.addEventListener("click", () => majLien(+b.dataset.paProlonger, false)));
    racine.querySelectorAll("[data-pa-copier]").forEach(b => b.addEventListener("click", async () => { try { await navigator.clipboard.writeText(b.dataset.paCopier); b.textContent = "Copié"; } catch (_) { dire(b.dataset.paCopier); } }));
  }

  async function recharger() { await charger(); await lireCibleAcademies(); dessiner(); }
  async function afficher() {
    racine = $("ac-partenaires");
    if (!racine) return;
    try { await recharger(); }
    catch (e) { racine.innerHTML = `<h2>Partenaires : DSDEN, rectorats…</h2><p class="avert">Lecture impossible : ${esc(e.message || e)}</p>`; }
  }
  window.OngletPartenaires = { afficher };
})();
