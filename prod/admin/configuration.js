/* =====================================================================
   Administration v2 — onglet « Installation », carte « Sauvegarder ou reprendre une configuration »
   ---------------------------------------------------------------------
   Export : un fichier JSON qui réunit ce qui fait un document « paramétré », sans les signalements :
   - les clés de Config (réglages généraux, rôles, répartition, planning, actions, tableaux de bord,
     point de situation, publipostage…), sauf les copies techniques (schema) ;
   - les formulaires (brouillon et version publiée) ;
   - la structure des tables de réponses et de leurs sous-tables (colonnes, types, formules, réglages) ;
   - en option, l'équipe (noms, adresses, fonctions, téléphones).
   Import : analyse d'abord le fichier (ce qui sera créé, remplacé ou laissé), puis applique les éléments cochés :
   tables et colonnes manquantes (jamais de suppression ni de changement de type), clés de Config, formulaires, équipe.
   Ne sont pas repris : les signalements, le référentiel (import de l'annuaire), les clés d'accès des établissements,
   les règles d'accès (onglet Accès), les pages de Grist, le modèle Word du point de situation (pièce jointe).
   ===================================================================== */
(function () {
  "use strict";
  const S = window.Socle;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const FORMAT = "socle-signalements-configuration";
  const CLES_EXCLUES = new Set(["schema", "modele_point_situation"]);
  const NOMS_CLES = {
    general: "Réglages généraux (situation, académies, noms des tables)", roles: "Rôles des colonnes", repartition: "Critères de répartition",
    planning: "Planning (fonctions, modèles de journée)", actions: "Suivi des actions (colonnes du kanban)", tableau_de_bord: "Tableaux de bord",
    point_situation: "Point de situation", resume_auto: "Description automatique", liens: "Publipostage (message, filtres)", annuaire_en: "Import de l'annuaire",
  };
  const CHAMPS_FORM = ["Nom", "Table", "Type", "Brouillon", "Publie", "Widget"];
  const CHAMPS_AGENT = ["Nom", "Email", "Telephone", "Actif"];
  let analyse = null;   // { fichier, cles, formulaires, tables, equipe }

  const statut = (t, type) => { const e = $("cfg-statut"); e.textContent = t || ""; e.className = `statut ${type || ""}`; };
  const jolie = v => JSON.stringify(v);

  /* ---------- Export ---------- */
  // tables de réponses et sous-tables (tableaux) des formulaires, et table des réponses du socle
  function tablesDesFormulaires(formulaires, general, meta) {
    const out = new Set(window.Socle.espaces(general).flatMap(e => [e.reponses, e.referentiel]));
    formulaires.forEach(f => {
      if (f.Table) out.add(f.Table);
      for (const brut of [f.Publie, f.Brouillon]) {
        let c = null; try { c = brut ? JSON.parse(brut) : null; } catch (_) { c = null; }
        ((c && c.blocs) || []).forEach(b => { const st = b && b.reglages && b.reglages.tableau && b.reglages.tableau.table; if (st) out.add(st); });
      }
    });
    return [...out].filter(t => meta[t]);
  }
  async function lireFormulaires(general) {
    try {
      const t = await grist.docApi.fetchTable(general.formulaires);
      return (t.id || []).map((id, i) => Object.fromEntries([["id", id], ...CHAMPS_FORM.map(c => [c, t[c] ? t[c][i] ?? null : null])]));
    } catch (_) { return []; }
  }
  async function lireEquipe(general) {
    try {
      const t = await grist.docApi.fetchTable(general.agents);
      return (t.id || []).map((_, i) => Object.fromEntries(CHAMPS_AGENT.filter(c => t[c]).map(c => [c, t[c][i] ?? null])));
    } catch (_) { return null; }
  }
  async function exporter() {
    statut("Préparation du fichier…");
    try {
      const meta = await S.lireMeta(), config = await S.lireConfig(meta);
      if (!config) { statut("La table Config n'existe pas : rien à exporter.", "err"); return; }
      const general = S.general(config);
      const cles = Object.fromEntries(Object.entries(config.valeurs).filter(([k]) => !CLES_EXCLUES.has(k)));
      const formulaires = (await lireFormulaires(general)).map(f => { const { id, ...r } = f; return r; });
      const tables = await S.instantaneSchema(tablesDesFormulaires(formulaires, general, meta));
      const fichier = { format: FORMAT, version: 1, socle: S.VERSION, exporte_le: new Date().toISOString(), situation: general.situation || "",
        config: cles, formulaires, structure: { tables } };
      if ($("cfg-equipe").checked) { const e = await lireEquipe(general); if (e) fichier.equipe = e; }
      const texte = JSON.stringify(fichier, null, 2);
      const nom = `configuration-${(general.situation || "socle").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "socle"}-${new Date().toISOString().slice(0, 10)}.json`;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([texte], { type: "application/json" })); a.download = nom;
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
      $("cfg-sortie").value = texte;
      statut(`Fichier « ${nom} » : ${Object.keys(cles).length} réglage(s), ${formulaires.length} formulaire(s), ${Object.keys(tables).length} table(s)${fichier.equipe ? `, ${fichier.equipe.length} agent(s)` : ""}. Si le téléchargement ne démarre pas : « Afficher pour copier ».`, "ok");
    } catch (e) { statut(`Export impossible : ${e.message || e}`, "err"); }
  }

  /* ---------- Import : analyse ---------- */
  async function analyser(texte) {
    let f;
    try { f = JSON.parse(texte); } catch (e) { statut(`Fichier illisible : ce n'est pas un JSON valide (${e.message}).`, "err"); return; }
    if (!f || f.format !== FORMAT) { statut("Ce fichier n'est pas une configuration exportée par l'administration du socle.", "err"); return; }
    const meta = await S.lireMeta(), config = await S.lireConfig(meta);
    if (!config) { statut("Appliquez d'abord l'installation (table Config) : la configuration s'importe dans un document installé.", "err"); return; }
    const general = S.general(config);
    const cles = Object.entries(f.config || {}).filter(([k]) => !CLES_EXCLUES.has(k)).map(([k, v]) => {
      const actuelle = config.valeurs[k];
      return { cle: k, valeur: v, etat: actuelle === undefined ? "nouveau" : jolie(actuelle) === jolie(v) ? "identique" : "remplace" };
    });
    const existants = await lireFormulaires(general);
    const formulaires = (f.formulaires || []).filter(x => x && x.Nom).map(x => {
      const e = existants.find(y => S.norm(y.Nom) === S.norm(x.Nom));
      return { valeur: x, id: e ? e.id : null, etat: !e ? "nouveau" : CHAMPS_FORM.every(c => (e[c] ?? null) === (x[c] ?? null)) ? "identique" : "remplace" };
    });
    const tables = Object.entries((f.structure && f.structure.tables) || {}).map(([t, cols]) => {
      const m = meta[t];
      if (!m) return { table: t, creer: true, cols, manquantes: cols, conflits: [] };
      const manquantes = cols.filter(c => !m.colonnes[c.colId]);
      const conflits = cols.filter(c => m.colonnes[c.colId] && m.colonnes[c.colId].type !== c.type).map(c => `${c.colId} (${m.colonnes[c.colId].type} ici, ${c.type} dans le fichier)`);
      return { table: t, creer: false, cols, manquantes, conflits };
    });
    let equipe = null;
    if (Array.isArray(f.equipe)) {
      const actuels = (await lireEquipe(general)) || [], adresses = new Set(actuels.map(a => S.norm(a.Email || "")).filter(Boolean)), noms = new Set(actuels.map(a => S.norm(a.Nom || "")));
      equipe = f.equipe.filter(a => a && a.Nom).map(a => ({ valeur: a, nouveau: !(a.Email ? adresses.has(S.norm(a.Email)) : noms.has(S.norm(a.Nom))) }));
    }
    analyse = { fichier: f, general, cles, formulaires, tables, equipe, agentsAbsents: !meta[general.agents] };
    dessinerAnalyse();
  }
  const pastille = etat => etat === "nouveau" ? `<span class="pastille ok">nouveau</span>` : etat === "remplace" ? `<span class="pastille reco">remplace l'actuel</span>` : `<span class="pastille">identique</span>`;
  function dessinerAnalyse() {
    const a = analyse, f = a.fichier, z = $("cfg-analyse");
    const ligne = (id, coche, titre, detail) => `<label class="etape"><input type="checkbox" data-cfg="${esc(id)}"${coche ? " checked" : ""}><span><strong>${titre}</strong>${detail ? `<br><span class="detail">${detail}</span>` : ""}</span></label>`;
    const tablesUtiles = a.tables.filter(t => t.manquantes.length || t.conflits.length);
    z.innerHTML = `<p class="aide">Fichier exporté le ${esc(new Date(f.exporte_le).toLocaleString("fr-FR"))} (socle ${esc(f.socle || "?")})${f.situation ? `, situation « ${esc(f.situation)} »` : ""}. Cochez ce qu'il faut reprendre ; rien n'est supprimé.</p>
      ${tablesUtiles.length || a.tables.length ? `<div class="groupe">Structure</div>${a.tables.map(t => t.creer
          ? ligne(`t:${t.table}`, true, `Créer la table ${esc(t.table)}`, `${t.cols.length} colonne(s) : ${t.cols.map(c => esc(c.colId)).join(", ")}`)
          : t.manquantes.length ? ligne(`t:${t.table}`, true, `Compléter la table ${esc(t.table)}`, `Colonnes ajoutées : ${t.manquantes.map(c => esc(c.colId)).join(", ")}${t.conflits.length ? `<br>Types différents, laissés tels quels : ${t.conflits.map(esc).join(", ")}` : ""}`)
          : `<div class="etape"><span class="pastille">identique</span><span>Table ${esc(t.table)} : toutes les colonnes existent${t.conflits.length ? ` (types différents, laissés tels quels : ${t.conflits.map(esc).join(", ")})` : ""}.</span></div>`).join("")}` : ""}
      ${a.cles.length ? `<div class="groupe">Réglages (table Config)</div>${a.cles.map(c => ligne(`c:${c.cle}`, c.etat !== "identique", `${esc(NOMS_CLES[c.cle] || c.cle)} ${pastille(c.etat)}`,
          c.cle === "general" && c.etat === "remplace" ? "Attention : remplace aussi la liste des académies et les noms des tables de ce document." : "")).join("")}` : ""}
      ${a.formulaires.length ? `<div class="groupe">Formulaires</div>${a.formulaires.map((x, i) => ligne(`f:${i}`, x.etat !== "identique", `« ${esc(x.valeur.Nom)} » (table ${esc(x.valeur.Table)}) ${pastille(x.etat)}`,
          x.valeur.Publie ? "Brouillon et version publiée." : "Brouillon seulement (jamais publié).")).join("")}` : ""}
      ${a.equipe ? `<div class="groupe">Équipe</div>${a.agentsAbsents ? `<p class="avert">La table de l'équipe n'existe pas encore : appliquez d'abord l'installation.</p>` : ligne("e", a.equipe.some(x => x.nouveau),
          `Ajouter ${a.equipe.filter(x => x.nouveau).length} agent(s) absent(s) de l'équipe`, `${a.equipe.length} dans le fichier ; ceux déjà présents (même adresse) ne sont pas modifiés.`)}` : ""}
      <div class="boutons"><button class="primaire" id="cfg-appliquer">Importer la sélection</button><button class="secondaire" id="cfg-annuler">Annuler</button></div>`;
    z.hidden = false;
    $("cfg-appliquer").addEventListener("click", appliquer);
    $("cfg-annuler").addEventListener("click", () => { analyse = null; z.hidden = true; z.innerHTML = ""; statut(""); });
  }

  /* ---------- Import : application ---------- */
  const coche = id => { const c = document.querySelector(`#cfg-analyse [data-cfg="${CSS.escape(id)}"]`); return !!(c && c.checked); };
  const estRef = c => /^Ref(List)?:/.test(c.type || "");
  const infoCol = c => {
    const o = { type: c.type || "Any", isFormula: !!c.isFormula, formula: c.formula || "", label: c.label || c.colId, untieColIdFromLabel: true };
    if (c.widgetOptions) o.widgetOptions = c.widgetOptions;
    if (c.description) o.description = c.description;
    return o;
  };
  async function appliquer() {
    const a = analyse, journal = [], erreurs = [];
    $("cfg-appliquer").disabled = true; statut("Import en cours…");
    const essayer = async (libelle, fn) => { try { await fn(); journal.push(libelle); } catch (e) { erreurs.push(`${libelle} : ${e.message || e}`); } };
    // 1. structure : tables d'abord (colonnes simples), puis références et formules (les tables visées doivent exister)
    const tables = a.tables.filter(t => t.manquantes.length && coche(`t:${t.table}`));
    for (const t of tables.filter(x => x.creer)) {
      const simples = t.cols.filter(c => !estRef(c) && !c.isFormula);
      await essayer(`table ${t.table} créée`, () => grist.docApi.applyUserActions([["AddTable", t.table, (simples.length ? simples : [{ colId: "A", type: "Text" }]).map(c => ({ id: c.colId, ...infoCol(c) }))]]));
    }
    for (const t of tables) {
      const reste = t.creer ? t.cols.filter(c => estRef(c) || c.isFormula) : t.manquantes;
      // colonnes simples d'abord, formules ensuite (elles peuvent lire les premières)
      const ordre = [...reste.filter(c => !c.isFormula), ...reste.filter(c => c.isFormula)];
      for (const c of ordre) await essayer(`${t.table}.${c.colId}`, () => grist.docApi.applyUserActions([["AddColumn", t.table, c.colId, infoCol(c)]]));
    }
    // colonne affichée des références (ex. le nom de l'établissement plutôt que son numéro de ligne)
    try {
      const refs = tables.flatMap(t => t.cols.filter(c => estRef(c) && c.visibleCol && (t.creer || t.manquantes.includes(c))).map(c => ({ t: t.table, c })));
      if (refs.length) {
        const [T, C] = await Promise.all([grist.docApi.fetchTable("_grist_Tables"), grist.docApi.fetchTable("_grist_Tables_column")]);
        const idCol = (tid, col) => { const r = T.id[T.tableId.indexOf(tid)]; const i = C.id.findIndex((_, k) => C.parentId[k] === r && C.colId[k] === col); return i >= 0 ? C.id[i] : null; };
        for (const { t, c } of refs) {
          const cible = c.type.replace(/^Ref(List)?:/, ""), ref = idCol(t, c.colId), vis = idCol(cible, c.visibleCol);
          if (ref && vis) await essayer(`affichage de ${t}.${c.colId}`, () => grist.docApi.applyUserActions([
            ["SetDisplayFormula", t, null, ref, `$${c.colId}.${c.visibleCol}`], ["ModifyColumn", t, c.colId, { visibleCol: vis }]]));
        }
      }
    } catch (_) { /* affichage des références : facultatif */ }
    // 2. réglages (Config)
    for (const c of a.cles) if (coche(`c:${c.cle}`)) await essayer(`réglage « ${NOMS_CLES[c.cle] || c.cle} »`, () => S.ecrireConfig(c.cle, c.valeur));
    // 3. formulaires
    const tF = a.general.formulaires;
    for (const [i, x] of a.formulaires.entries()) {
      if (!coche(`f:${i}`)) continue;
      const champs = Object.fromEntries(CHAMPS_FORM.filter(k => x.valeur[k] !== undefined).map(k => [k, x.valeur[k]]));
      champs.Modifie_le = Date.now() / 1000; if (champs.Publie) champs.Publie_le = Date.now() / 1000;
      await essayer(`formulaire « ${x.valeur.Nom} »`, () => grist.docApi.applyUserActions([x.id ? ["UpdateRecord", tF, x.id, champs] : ["AddRecord", tF, null, champs]]));
    }
    // 4. équipe
    if (a.equipe && !a.agentsAbsents && coche("e")) {
      const nouveaux = a.equipe.filter(x => x.nouveau).map(x => x.valeur);
      if (nouveaux.length) await essayer(`${nouveaux.length} agent(s)`, () => grist.docApi.applyUserActions(nouveaux.map(v => ["AddRecord", a.general.agents, null, { ...v, Actif: v.Actif !== false }])));
    }
    analyse = null; $("cfg-analyse").hidden = true; $("cfg-analyse").innerHTML = "";
    $("cfg-suite").hidden = false;
    $("cfg-suite").innerHTML = `<div class="groupe">Résultat</div><ul class="journal">${journal.map(t => `<li>${esc(t)}</li>`).join("")}${erreurs.map(t => `<li class="err">${esc(t)}</li>`).join("")}</ul>
      <div class="groupe">Ensuite</div><ol class="cfg-ensuite">
        <li>Ici, « Relire le document » : l'installation propose ce qui manque encore au socle.</li>
        <li>Référentiel : importer l'annuaire (ou le référentiel ESR).</li>
        <li>Formulaires : vérifier, publier si besoin, et créer les pages de saisie de l'équipe.</li>
        <li>Établissements : clés, liens et page des établissements ; Accès : appliquer les règles.</li>
        <li>Tableau de bord et point de situation : créer leurs pages ; redéposer le modèle Word du point de situation.</li>
      </ol>`;
    statut(erreurs.length ? `Import terminé avec ${erreurs.length} erreur(s) (détail ci-dessous).` : "Import terminé.", erreurs.length ? "err" : "ok");
    const relire = $("btn-relire"); if (relire) relire.click();
  }

  /* ---------- Carte ---------- */
  function monter() {
    const z = $("carte-configuration"); if (!z) return;
    z.innerHTML = `<h2>Sauvegarder ou reprendre une configuration</h2>
      <p class="aide">Un fichier réunit le paramétrage du document, sans les signalements : réglages (Config), formulaires, structure des tables de réponses et, en option, l'équipe.
        Il sert de sauvegarde avant une modification importante, et à monter une nouvelle cellule : installer le socle dans un document vierge, puis importer le fichier.</p>
      <div class="boutons">
        <button class="primaire" id="cfg-exporter">Exporter la configuration</button>
        <label class="etape" style="border:0;padding:0"><input type="checkbox" id="cfg-equipe"><span>avec l'équipe (noms, adresses, fonctions)</span></label>
        <button class="secondaire" id="cfg-voir">Afficher pour copier</button>
        <span style="flex:1"></span>
        <button class="secondaire" id="cfg-importer">Importer un fichier…</button>
        <input type="file" id="cfg-fichier" accept=".json,application/json" hidden>
        <button class="secondaire" id="cfg-coller-btn" title="Si le choix de fichier est bloqué : coller le contenu du fichier">Coller…</button>
      </div>
      <span class="statut" id="cfg-statut" role="status"></span>
      <textarea id="cfg-sortie" rows="6" readonly hidden style="width:100%;margin-top:8px;font-family:monospace;font-size:12px"></textarea>
      <div id="cfg-coller" hidden style="margin-top:8px"><textarea id="cfg-coller-texte" rows="6" style="width:100%;font-family:monospace;font-size:12px" placeholder="Collez ici le contenu du fichier de configuration"></textarea>
        <div class="boutons"><button class="primaire" id="cfg-coller-ok">Analyser</button></div></div>
      <div id="cfg-analyse" hidden></div>
      <div id="cfg-suite" hidden></div>`;
    $("cfg-exporter").addEventListener("click", exporter);
    $("cfg-voir").addEventListener("click", async () => { if (!$("cfg-sortie").value) await exporter(); const o = $("cfg-sortie"); o.hidden = false; o.select(); });
    $("cfg-importer").addEventListener("click", () => { $("cfg-fichier").value = ""; $("cfg-fichier").click(); });
    $("cfg-fichier").addEventListener("change", async e => { const f = e.target.files && e.target.files[0]; if (!f) return; $("cfg-suite").hidden = true; await analyser(await f.text()); });
    $("cfg-coller-btn").addEventListener("click", () => { $("cfg-coller").hidden = !$("cfg-coller").hidden; });
    $("cfg-coller-ok").addEventListener("click", async () => { $("cfg-suite").hidden = true; await analyser($("cfg-coller-texte").value); });
  }
  monter();
  window.CarteConfiguration = { exporter, analyser };
})();
