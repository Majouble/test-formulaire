/* =====================================================================
   Administration v2 — onglet « Référentiel » : import de l'annuaire de l'éducation nationale
   Source : jeu de données open data « fr-en-annuaire-education » (data.education.gouv.fr, API OpenDataSoft v2.1).
   Principe :
   - filtre sur les académies de la clé « general » de Config, puis sur les types d'établissements choisis ;
   - rapprochement par UAI : les lignes existantes sont mises à jour, les nouvelles ajoutées ;
   - rien n'est supprimé : les établissements saisis à la main et ceux sortis de l'annuaire sont conservés
     (des signalements peuvent y renvoyer).
   Réglages mémorisés dans la clé « annuaire_en » de Config.
   ===================================================================== */
(function () {
  "use strict";
  const S = window.Socle;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nf = n => Number(n || 0).toLocaleString("fr-FR");

  const API = "https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-annuaire-education";
  const ORIGINE = "Annuaire EN";
  // Champ de l'annuaire → rôle du référentiel
  const CHAMPS_ROLES = {
    UAI: "identifiant_de_l_etablissement", Nom: "nom_etablissement", Type: "type_etablissement",
    Commune: "nom_commune", Academie: "libelle_academie", Departement: "libelle_departement", Mail: "mail",
  };
  // Rôles facultatifs du socle, remplis si le champ existe dans le jeu de données
  const CHAMPS_ROLES_OPTION = {
    Statut_public_prive: "statut_public_prive", Libelle_nature: "libelle_nature", Nom_circonscription: "nom_circonscription", Latitude: "latitude", Longitude: "longitude",
  };
  const CHAMP_ETAT = "etat";                // « OUVERT » / « FERME » … (si présent dans le jeu de données)
  const TAILLE_LOT = 400;                   // lignes par envoi à Grist
  const TYPES_GRIST = { text: "Text", int: "Int", double: "Numeric", date: "Date", datetime: "DateTime:Europe/Paris", boolean: "Bool" };

  let champsJeu = null;     // [{ name, label, type }] du jeu de données
  let apercu = null;        // { types: [{ type, n }], academies: [{ academie, n }] }
  let analyse = null;       // résultat du rapprochement, avant import

  /* ---------- Accès à l'API open data ---------- */
  async function lireJson(url) {
    let r;
    try { r = await fetch(url); }
    catch (e) { throw new Error("Le site data.education.gouv.fr est injoignable depuis votre navigateur (réseau, pare-feu ou proxy)."); }
    if (!r.ok) {
      let detail = ""; try { detail = (await r.json()).message || ""; } catch (_) {}
      throw new Error(`L'API open data a répondu ${r.status}${detail ? ` : ${detail}` : ""}`);
    }
    return r.json();
  }
  const guillemets = v => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  function clauseWhere(academies, types, ouverts) {
    const c = [];
    if (academies.length) c.push(`(${academies.map(a => `${CHAMPS_ROLES.Academie}=${guillemets(a)}`).join(" OR ")})`);
    if (types && types.length) c.push(`(${types.map(t => `${CHAMPS_ROLES.Type}=${guillemets(t)}`).join(" OR ")})`);
    if (ouverts && champsJeu && champsJeu.some(f => f.name === CHAMP_ETAT)) c.push(`${CHAMP_ETAT}="OUVERT"`);
    return c.join(" AND ");
  }
  async function lireChampsJeu() {
    if (champsJeu) return champsJeu;
    const d = await lireJson(API);
    const fields = d.fields || (d.dataset && d.dataset.fields) || [];
    champsJeu = fields.map(f => ({ name: f.name, label: f.label || f.name, type: f.type }));
    const manquants = Object.values(CHAMPS_ROLES).filter(n => !champsJeu.some(f => f.name === n));
    if (manquants.length) throw new Error(`Le jeu de données a changé : champs introuvables ${manquants.join(", ")}.`);
    return champsJeu;
  }
  async function compterPar(champ, where) {
    const url = `${API}/records?select=${encodeURIComponent(`${champ}, count(*) as n`)}&group_by=${encodeURIComponent(champ)}`
      + `&limit=100${where ? `&where=${encodeURIComponent(where)}` : ""}`;
    const d = await lireJson(url);
    return (d.results || []).map(r => ({ valeur: r[champ], n: r.n })).sort((a, b) => b.n - a.n);
  }
  async function telecharger(where, champs) {
    const url = `${API}/exports/json?select=${encodeURIComponent(champs.join(","))}${where ? `&where=${encodeURIComponent(where)}` : ""}`;
    return lireJson(url);
  }

  /* ---------- Contexte Grist ---------- */
  async function contexte() {
    const meta = await S.lireMeta(), config = await S.lireConfig(meta);
    if (!config) throw new Error("La table Config n'existe pas : terminez d'abord l'installation.");
    const g = S.general(config), table = g.referentiel, tMeta = meta[table];
    if (!tMeta) throw new Error(`La table du référentiel « ${table} » n'existe pas : terminez d'abord l'installation.`);
    const roles = S.resoudreRoles("referentiel", tMeta, { reponses: g.reponses, referentiel: table },
      ((config.valeurs.roles || {}).referentiel) || {}, {});
    const reglages = config.valeurs.annuaire_en || {};
    return { meta, config, g, table, tMeta, roles, reglages };
  }

  /* ---------- Écran ---------- */
  function statut(texte, type) { const e = $("ref-statut"); e.textContent = texte || ""; e.className = `statut ${type || ""}`; }

  async function afficher() {
    statut("");
    let ctx;
    try { ctx = await contexte(); }
    catch (e) { $("ref-contexte").innerHTML = `<p class="statut err">${esc(e.message)}</p>`; $("ref-etape1").hidden = true; return; }
    $("ref-etape1").hidden = false;
    const { g, table, roles, reglages } = ctx;
    const manquants = ["UAI", "Nom", "Academie"].filter(r => !(roles[r] && roles[r].col));
    $("ref-contexte").innerHTML = `
      <p>Table cible : <strong>${esc(table)}</strong>.</p>
      ${manquants.length ? `<p class="statut err">Rôles introuvables dans ${esc(table)} : ${manquants.join(", ")}. Corrigez-les dans l'onglet Installation.</p>` : ""}
      ${reglages.derniere_mise_a_jour ? `<p class="aide">Dernier import : ${esc(new Date(reglages.derniere_mise_a_jour * 1000).toLocaleString("fr-FR"))}, ${nf(reglages.nb)} établissement(s) de l'annuaire.</p>` : ""}`;
    $("ref-ouverts").checked = reglages.ouverts_seulement !== false;
    dessinerAcademies(ctx);
    $("btn-ref-apercu").disabled = !!manquants.length;
  }

  /* ---------- Académies couvertes (clé « general » de Config) ----------
     Liste lue dans l'annuaire (orthographe exacte, nombre d'établissements ouverts) ; cases cochées = académies du document. */
  let academiesAnnuaire = null, academiesChoisies = null;
  async function dessinerAcademies(ctx) {
    const z = $("ref-academies-choix");
    if (academiesChoisies === null) academiesChoisies = new Set(ctx.g.academies || []);
    if (!academiesAnnuaire) {
      z.innerHTML = `<p class="aide">Lecture de la liste des académies dans l'annuaire…</p>`;
      try { academiesAnnuaire = (await compterPar(CHAMPS_ROLES.Academie, "")).filter(a => a.valeur).sort((a, b) => S.norm(a.valeur).localeCompare(S.norm(b.valeur))); }
      catch (e) { academiesAnnuaire = []; }
    }
    // académies enregistrées absentes de l'annuaire (orthographe) : affichées pour pouvoir les décocher
    const liste = [...academiesAnnuaire.map(a => ({ v: a.valeur, n: a.n })), ...[...academiesChoisies].filter(a => !academiesAnnuaire.some(x => x.valeur === a)).map(a => ({ v: a, n: null }))];
    const enregistrees = new Set(ctx.g.academies || []), modifie = liste.some(a => academiesChoisies.has(a.v) !== enregistrees.has(a.v));
    z.innerHTML = `<div class="groupe">Académies couvertes par le document</div>
      <p class="aide" style="margin:0 0 6px">Elles limitent l'import, les cartes et les critères de répartition. Aucune cochée = toute la France (environ 65 000 établissements).</p>
      ${liste.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:2px 12px">${liste.map((a, i) => `<label class="etape" style="padding:2px 0;border:0"><input type="checkbox" data-aca="${i}"${academiesChoisies.has(a.v) ? " checked" : ""}>
          <span>${esc(a.v)}${a.n != null ? ` <span class="pastille">${nf(a.n)}</span>` : ` <span class="pastille manque">absente de l'annuaire</span>`}</span></label>`).join("")}</div>`
        : `<p class="statut err">Annuaire injoignable : liste des académies indisponible.</p>`}
      <div class="boutons"><button class="secondaire" id="ref-aca-enregistrer"${modifie ? "" : " disabled"}>Enregistrer les académies</button>
        <button class="lien-btn" id="ref-aca-aucune" type="button">Tout décocher</button><span class="statut" id="ref-aca-statut" role="status"></span></div>`;
    z.querySelectorAll("[data-aca]").forEach(c => c.addEventListener("change", () => {
      const v = liste[+c.dataset.aca].v; if (c.checked) academiesChoisies.add(v); else academiesChoisies.delete(v);
      $("ref-aca-enregistrer").disabled = !liste.some(a => academiesChoisies.has(a.v) !== enregistrees.has(a.v));
    }));
    $("ref-aca-aucune").addEventListener("click", () => { academiesChoisies.clear(); dessinerAcademies(ctx); });
    $("ref-aca-enregistrer").addEventListener("click", async () => { if (await enregistrerAcademies()) { const c2 = await contexte(); dessinerAcademies(c2); } });
  }
  // Enregistre les académies cochées si elles diffèrent de Config ; renvoie true si c'est fait (ou rien à faire)
  async function enregistrerAcademies() {
    if (academiesChoisies === null) return true;
    const ctx = await contexte(), avant = ctx.g.academies || [];
    const ordre = academiesAnnuaire ? academiesAnnuaire.map(a => a.valeur) : [];
    const apres = [...academiesChoisies].sort((a, b) => (ordre.indexOf(a) + 1 || 999) - (ordre.indexOf(b) + 1 || 999));
    if (apres.length === avant.length && apres.every(a => avant.includes(a))) return true;
    try {
      await S.ecrireConfig("general", { ...((ctx.config.valeurs.general) || S.DEFAUTS_GENERAL), academies: apres });
      const st = $("ref-aca-statut"); if (st) { st.textContent = `Académies enregistrées (${apres.length || "toutes"}).`; st.className = "statut ok"; }
      return true;
    } catch (e) { statut(`Académies non enregistrées (${e.message || e}).`, "err"); return false; }
  }

  // Étape 1 : aperçu des volumes par type et par académie, sans rien télécharger d'autre
  async function etapeApercu() {
    statut("Interrogation de l'annuaire…"); $("btn-ref-apercu").disabled = true;
    try {
      if (!(await enregistrerAcademies())) { $("btn-ref-apercu").disabled = false; return; }
      const ctx = await contexte();
      await lireChampsJeu();
      const where = clauseWhere(ctx.g.academies, null, $("ref-ouverts").checked);
      const [types, academies] = await Promise.all([compterPar(CHAMPS_ROLES.Type, where), compterPar(CHAMPS_ROLES.Academie, where)]);
      apercu = { types, academies };
      const absentes = ctx.g.academies.filter(a => !academies.some(x => S.norm(x.valeur) === S.norm(a)));
      const deja = ctx.reglages.types;   // types retenus lors du dernier import
      $("ref-types").innerHTML = types.map((t, i) => `<label class="etape" style="padding:4px 0"><input type="checkbox" data-type="${i}"
          ${!deja || deja.includes(t.valeur) ? "checked" : ""}><span>${esc(t.valeur || "(sans type)")} <span class="pastille">${nf(t.n)}</span></span></label>`).join("");
      const dejaChamps = new Set(ctx.reglages.champs || []);
      const pris = new Set([...Object.values(CHAMPS_ROLES), ...Object.values(CHAMPS_ROLES_OPTION), CHAMP_ETAT]);
      $("ref-champs").innerHTML = champsJeu.filter(f => !pris.has(f.name) && TYPES_GRIST[f.type]).map(f =>
        `<label class="etape" style="padding:2px 0"><input type="checkbox" data-champ="${esc(f.name)}" ${dejaChamps.has(f.name) ? "checked" : ""}>
          <span>${esc(f.label)} <code>${esc(f.name)}</code></span></label>`).join("");
      $("ref-colonnes").innerHTML = tableauColonnes(ctx);
      $("ref-academies").innerHTML = academies.map(a => `<span class="pastille ok">${esc(a.valeur)} : ${nf(a.n)}</span>`).join(" ")
        + (absentes.length ? `<p class="statut err">Aucun établissement pour : ${absentes.map(esc).join(", ")}. Décochez-les dans la liste des académies ci-dessus.</p>` : "");
      $("ref-etape2").hidden = false; $("ref-etape3").hidden = true;
      statut("");
    } catch (e) { statut(e.message, "err"); }
    $("btn-ref-apercu").disabled = false;
  }

  // Colonnes remplies d'office : rôle du socle → colonne du référentiel ← champ de l'annuaire
  const LIBELLES_ROLES = { UAI: "UAI", Nom: "Nom", Type: "Type", Commune: "Commune", Academie: "Académie", Departement: "Département", Mail: "Courriel",
    Statut_public_prive: "Public / privé", Libelle_nature: "Nature (libellé)", Nom_circonscription: "Circonscription", Latitude: "Latitude", Longitude: "Longitude" };
  function tableauColonnes(ctx) {
    const col = r => ctx.roles[r] && ctx.roles[r].col;
    const ligne = (r, champ, oblig) => {
      const f = champsJeu.find(x => x.name === champ), c = col(r) || (ctx.tMeta.colonnes[r] ? r : null);
      const etat = !f ? `<span class="pastille manque">absent de l'annuaire</span>`
        : c ? `<span class="pastille ok">colonne ${esc(c)}</span>` : oblig ? `<span class="pastille manque">rôle introuvable</span>` : `<span class="pastille">créée : ${esc(r)}</span>`;
      return `<tr><td>${esc(LIBELLES_ROLES[r] || r)}</td><td><code>${esc(champ)}</code>${f && f.label ? ` <span class="aide">${esc(f.label)}</span>` : ""}</td><td>${etat}</td></tr>`;
    };
    const rg = col("Region_academique"), or = col("Origine");
    return `<table class="eq-table"><thead><tr><th>Information</th><th>Champ de l'annuaire</th><th>Colonne du référentiel</th></tr></thead><tbody>
      ${Object.entries(CHAMPS_ROLES).map(([r, c]) => ligne(r, c, true)).join("")}
      ${Object.entries(CHAMPS_ROLES_OPTION).map(([r, c]) => ligne(r, c, false)).join("")}
      <tr><td>Région académique</td><td><span class="aide">déduite de l'académie</span></td><td>${rg ? `<span class="pastille ok">colonne ${esc(rg)}</span>` : `<span class="pastille">non remplie (pas de colonne)</span>`}</td></tr>
      <tr><td>Origine</td><td><span class="aide">« ${esc(ORIGINE)} »</span></td><td>${or ? `<span class="pastille ok">colonne ${esc(or)}</span>` : `<span class="pastille">non remplie (pas de colonne)</span>`}</td></tr>
      ${$("ref-ouverts").checked ? `<tr><td colspan="3" class="aide">Établissements fermés exclus (champ <code>${CHAMP_ETAT}</code>).</td></tr>` : ""}
    </tbody></table>`;
  }

  const typesCoches = () => [...document.querySelectorAll("#ref-types input:checked")].map(c => apercu.types[+c.dataset.type].valeur);
  const champsCoches = () => [...document.querySelectorAll("#ref-champs input:checked")].map(c => c.dataset.champ);
  const nomColonne = champ => champ.charAt(0).toUpperCase() + champ.slice(1);   // statut_public_prive → Statut_public_prive

  // Valeur à écrire dans une colonne de référence : id de la ligne cible dont une colonne texte porte ce libellé
  async function resolveurRefs(ctx) {
    const caches = {};
    return async (colMeta, valeur) => {
      const cible = S.cibleRef(colMeta.type);
      if (!cible) return valeur;
      if (!caches[cible]) {
        const t = await grist.docApi.fetchTable(cible), index = new Map();
        for (const [col, vals] of Object.entries(t)) if (col !== "id" && Array.isArray(vals))
          vals.forEach((v, i) => { if (typeof v === "string" && !index.has(S.norm(v))) index.set(S.norm(v), t.id[i]); });
        caches[cible] = index;
      }
      return caches[cible].get(S.norm(valeur)) || null;
    };
  }

  // Étape 2 : téléchargement et rapprochement par UAI, sans rien écrire
  async function etapeAnalyse() {
    const types = typesCoches();
    if (!types.length) { statut("Cochez au moins un type d'établissement.", "err"); return; }
    statut("Téléchargement de l'annuaire…"); $("btn-ref-analyser").disabled = true;
    try {
      const ctx = await contexte();
      const extras = champsCoches();
      const col = r => ctx.roles[r] && ctx.roles[r].col;
      // rôles facultatifs sans colonne (ex. Nom_circonscription) : colonne créée à l'import, au nom du rôle
      const optionsNeuves = Object.entries(CHAMPS_ROLES_OPTION).filter(([r, champ]) => !col(r) && !ctx.tMeta.colonnes[r] && champsJeu.some(f => f.name === champ));
      optionsNeuves.forEach(([r]) => { ctx.roles[r] = { col: r }; });
      const options = Object.entries(CHAMPS_ROLES_OPTION).filter(([r, champ]) => col(r) && champsJeu.some(f => f.name === champ));
      const champs = [...Object.values(CHAMPS_ROLES), ...options.map(([, champ]) => champ), ...extras];
      const lignes = await telecharger(clauseWhere(ctx.g.academies, types, $("ref-ouverts").checked), champs);
      statut(`${nf(lignes.length)} établissements téléchargés, comparaison avec ${ctx.table}…`);

      // colonnes cibles : rôles résolus + colonnes supplémentaires (créées si besoin)
      const aCreer = [...optionsNeuves.map(([r, champ]) => ({ id: r, type: TYPES_GRIST[champsJeu.find(f => f.name === champ).type] || "Text" })),
        ...extras.filter(c => !ctx.tMeta.colonnes[nomColonne(c)] && !optionsNeuves.some(([r]) => r === nomColonne(c)))
          .map(c => ({ id: nomColonne(c), type: TYPES_GRIST[champsJeu.find(f => f.name === c).type] || "Text" }))];
      const cibles = [
        ...Object.entries(CHAMPS_ROLES).filter(([r]) => col(r)).map(([r, champ]) => ({ colonne: col(r), lire: l => l[champ] })),
        ...options.map(([r, champ]) => ({ colonne: col(r), lire: l => l[champ] })),
        ...(col("Region_academique") ? [{ colonne: col("Region_academique"), lire: l => S.regionDeAcademie(l[CHAMPS_ROLES.Academie]) }] : []),
        ...extras.map(c => ({ colonne: nomColonne(c), lire: l => l[c] })),
      ];
      const colOrigine = col("Origine");

      const existant = await grist.docApi.fetchTable(ctx.table);
      const colUai = col("UAI"), parUai = new Map();
      existant.id.forEach((id, i) => { const u = String(existant[colUai][i] || "").trim().toUpperCase(); if (u && !parUai.has(u)) parUai.set(u, i); });
      const ref = await resolveurRefs(ctx);
      const ajouts = [], majs = [], vus = new Set();
      let inchanges = 0, rattaches = 0, refsIntrouvables = 0;
      for (const l of lignes) {
        const uai = String(l[CHAMPS_ROLES.UAI] || "").trim().toUpperCase();
        if (!uai || vus.has(uai)) continue;
        vus.add(uai);
        const fields = {};
        for (const c of cibles) {
          let v = c.lire(l); if (v === undefined) v = null;
          const m = ctx.tMeta.colonnes[c.colonne];
          if (m && /^Ref:/.test(m.type) && v != null && v !== "") { const id = await ref(m, v); if (id == null) refsIntrouvables++; v = id; }
          fields[c.colonne] = v;
        }
        if (colOrigine) fields[colOrigine] = ORIGINE;
        const i = parUai.get(uai);
        if (i === undefined) { ajouts.push(fields); continue; }
        const diff = {};
        for (const [k, v] of Object.entries(fields)) {
          const avant = existant[k] ? existant[k][i] : undefined;
          if (!(avant === v || (avant == null && (v == null || v === "")) || (typeof avant === "number" && typeof v === "number" && Math.abs(avant - v) < 1e-9))) diff[k] = v;
        }
        if (colOrigine && existant[colOrigine] && existant[colOrigine][i] === "Manuel") rattaches++;
        if (Object.keys(diff).length) majs.push({ id: existant.id[i], fields: diff }); else inchanges++;
      }
      // Lignes de l'annuaire, dans le périmètre, qui n'y figurent plus : conservées, seulement comptées
      const acaDoc = new Set(ctx.g.academies.map(S.norm)), colAca = col("Academie");
      let sorties = 0;
      if (colOrigine) existant.id.forEach((id, i) => {
        const u = String(existant[colUai][i] || "").trim().toUpperCase();
        if (existant[colOrigine][i] === ORIGINE && u && !vus.has(u)
            && (!acaDoc.size || typeof existant[colAca][i] !== "string" || acaDoc.has(S.norm(existant[colAca][i])))) sorties++;
      });
      analyse = { ctx, types, extras, aCreer, ajouts, majs, inchanges, rattaches, sorties, refsIntrouvables, total: vus.size };
      $("ref-bilan").innerHTML = `<table><tbody>
        <tr><td>Établissements téléchargés</td><td><strong>${nf(analyse.total)}</strong></td></tr>
        <tr><td>À ajouter</td><td><strong>${nf(ajouts.length)}</strong></td></tr>
        <tr><td>À mettre à jour</td><td><strong>${nf(majs.length)}</strong>${rattaches ? ` (dont ${nf(rattaches)} saisis à la main, rattachés à l'annuaire)` : ""}</td></tr>
        <tr><td>Inchangés</td><td>${nf(inchanges)}</td></tr>
        <tr><td>Sortis de l'annuaire ou d'un type non retenu</td><td>${nf(sorties)} <span class="aide">(conservés)</span></td></tr>
        ${aCreer.length ? `<tr><td>Colonnes créées</td><td>${aCreer.map(c => `<code>${esc(c.id)}</code>`).join(" ")}</td></tr>` : ""}
        ${refsIntrouvables ? `<tr><td colspan="2" class="statut err">${nf(refsIntrouvables)} valeur(s) sans correspondance dans une colonne de référence : la cellule restera vide.</td></tr>` : ""}
      </tbody></table>`;
      $("ref-etape3").hidden = false;
      $("btn-ref-importer").disabled = !(ajouts.length || majs.length || aCreer.length);
      statut(ajouts.length || majs.length ? "" : "Le référentiel est déjà à jour.", ajouts.length || majs.length ? "" : "ok");
    } catch (e) { statut(e.message, "err"); }
    $("btn-ref-analyser").disabled = false;
  }

  // Étape 3 : écriture dans Grist, par lots
  async function etapeImport() {
    if (!analyse) return;
    const { ctx, aCreer, ajouts, majs } = analyse;
    $("btn-ref-importer").disabled = true;
    try {
      if (aCreer.length) await grist.docApi.applyUserActions(aCreer.map(c => ["AddColumn", ctx.table, c.id, { type: c.type, isFormula: false }]));
      const colonnes = [...new Set(ajouts.flatMap(f => Object.keys(f)))];
      for (let i = 0; i < ajouts.length; i += TAILLE_LOT) {
        const lot = ajouts.slice(i, i + TAILLE_LOT);
        statut(`Ajout : ${nf(Math.min(i + TAILLE_LOT, ajouts.length))} / ${nf(ajouts.length)}…`);
        await grist.docApi.applyUserActions([["BulkAddRecord", ctx.table, lot.map(() => null),
          Object.fromEntries(colonnes.map(c => [c, lot.map(f => f[c] === undefined ? null : f[c])]))]]);
      }
      for (let i = 0; i < majs.length; i += TAILLE_LOT) {
        const lot = majs.slice(i, i + TAILLE_LOT);
        statut(`Mise à jour : ${nf(Math.min(i + TAILLE_LOT, majs.length))} / ${nf(majs.length)}…`);
        await grist.docApi.applyUserActions(lot.map(m => ["UpdateRecord", ctx.table, m.id, m.fields]));
      }
      const config = await S.lireConfig();
      await grist.docApi.applyUserActions([S.actionConfig(config, "annuaire_en", {
        types: analyse.types, champs: analyse.extras, ouverts_seulement: $("ref-ouverts").checked,
        derniere_mise_a_jour: Date.now() / 1000, nb: analyse.total,
      })]);
      analyse = null; $("ref-etape3").hidden = true;
      await afficher();
      statut(`Import terminé : ${nf(ajouts.length)} ajout(s), ${nf(majs.length)} mise(s) à jour.`, "ok");
    } catch (e) { statut(`Import interrompu : ${e.message || e}. Relancez l'analyse : les lignes déjà écrites seront reconnues.`, "err"); }
  }

  $("btn-ref-apercu").addEventListener("click", etapeApercu);
  $("btn-ref-analyser").addEventListener("click", etapeAnalyse);
  $("btn-ref-importer").addEventListener("click", etapeImport);
  $("ref-ouverts").addEventListener("change", () => { $("ref-etape2").hidden = true; $("ref-etape3").hidden = true; });
  document.addEventListener("change", ev => { if (ev.target.closest && ev.target.closest("#ref-types, #ref-champs")) $("ref-etape3").hidden = true; });

  window.OngletReferentiel = { afficher };
})();
