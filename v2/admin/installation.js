/* =====================================================================
   Administration v2 — onglet « Installation »
   Vérifie le socle, propose ce qui manque, enregistre les réglages généraux et les rôles.
   Dépend de ../commun/socle.js (window.Socle).
   ===================================================================== */
(function () {
  "use strict";
  const S = window.Socle;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  let meta = null, config = null, plan = null;
  const choixRoles = { reponses: {}, referentiel: {} };   // associations modifiées à l'écran, pas encore enregistrées

  $("version").textContent = `socle ${S.VERSION}`;

  function statut(id, texte, type) { const e = $(id); e.textContent = texte || ""; e.className = `statut ${type || ""}`; }

  async function charger() {
    statut("statut-actions", "");
    try {
      meta = await S.lireMeta();
      config = await S.lireConfig(meta);
      plan = S.planInstallation(meta, config);
    } catch (e) {
      $("bandeau").className = "bandeau alerte";
      $("bandeau").textContent = `Lecture impossible : ${e.message || e}. Le widget doit avoir l'accès complet au document (panneau de droite › « Accès complet au document »).`;
      return;
    }
    dessinerBandeau(); dessinerActions(); dessinerGeneral(); dessinerRoles(); dessinerRemarques();
    dessinerPageAdmin();
  }

  /* ---------- Page d'administration protégée ----------
     La page qui porte ce widget est visible de quiconque lit sa table. Liée à la table Administration
     (réservée aux propriétaires par les règles d'accès), elle disparaît pour les agents, les invités et les établissements. */
  const adresseAdmin = () => { try { const u = new URL("./", location.href); return u.href; } catch (_) { return ""; } };
  const estUrlAdmin = url => /\/admin\/?(index\.html)?(\?.*)?$/i.test(url || "");
  async function pagesAdmin() {
    const [s, v, t] = await Promise.all(["_grist_Views_section", "_grist_Views", "_grist_Tables"].map(x => grist.docApi.fetchTable(x)));
    return s.id.map((id, i) => {
      if (s.parentKey[i] !== "custom" || !s.parentId[i]) return null;
      let cv = {}; try { const o = JSON.parse(s.options[i] || "{}") || {}; cv = typeof o.customView === "string" ? JSON.parse(o.customView || "{}") : (o.customView || {}); } catch (_) { cv = {}; }
      const url = cv.url || (cv.widgetDef && cv.widgetDef.url) || "";
      if (!estUrlAdmin(url)) return null;
      const vi = v.id.indexOf(s.parentId[i]);
      return { sectionRef: id, viewRef: s.parentId[i], page: vi >= 0 ? String(v.name[vi] || "") : "", table: t.tableId[t.id.indexOf(s.tableRef[i])] || "" };
    }).filter(Boolean);
  }
  async function dessinerPageAdmin() {
    const z = $("page-admin"); if (!z) return;
    z.innerHTML = "";
    if (!meta || !meta[S.TABLE_ADMIN]) return;
    let pages; try { pages = await pagesAdmin(); } catch (_) { return; }
    const protegees = pages.filter(p => p.table === S.TABLE_ADMIN), autres = pages.filter(p => p.table !== S.TABLE_ADMIN);
    if (!autres.length) return;
    z.innerHTML = `<div class="bandeau alerte" style="margin-top:8px">
      ${protegees.length
        ? `La page « ${esc(protegees[0].page)} » est protégée. Supprimez l'ancienne page d'administration (${autres.map(p => `« ${esc(p.page)} », liée à ${esc(p.table)}`).join(", ")}) : clic droit sur son nom › Supprimer.`
        : `Cette page d'administration est liée à la table ${autres.map(p => esc(p.table)).filter((x, i, a) => a.indexOf(x) === i).join(", ")} : toute personne qui lit cette table la voit, y compris les invités et les établissements.
           <button class="primaire" id="btn-page-admin" style="margin-left:8px">Créer la page protégée</button>
           <span class="aide" style="display:block;margin-top:4px">Une page « Administration » est créée, liée à la table ${S.TABLE_ADMIN} que les règles d'accès réservent aux propriétaires. Ouvrez-la, puis supprimez celle-ci.</span>`}
      <span class="statut" id="page-admin-statut" role="status"></span></div>`;
    if ($("btn-page-admin")) $("btn-page-admin").addEventListener("click", creerPageAdmin);
  }
  async function creerPageAdmin() {
    const b = $("btn-page-admin"); b.disabled = true;
    try {
      const tref = meta[S.TABLE_ADMIN].ref;
      const res = await grist.docApi.applyUserActions([["CreateViewSection", tref, 0, "custom", null, null]]);
      const rv = (res && res.retValues && res.retValues[0]) || {};
      if (!rv.sectionRef) throw new Error("Grist n'a pas indiqué la vue créée");
      const sec = await grist.docApi.fetchTable("_grist_Views_section"), i = sec.id.indexOf(rv.sectionRef);
      let o = {}; try { o = JSON.parse((i >= 0 && sec.options[i]) || "{}") || {}; } catch (_) { o = {}; }
      o.customView = JSON.stringify({ mode: "url", url: adresseAdmin(), access: "full", widgetOptions: {} });
      await grist.docApi.applyUserActions([
        ["UpdateRecord", "_grist_Views_section", rv.sectionRef, { options: JSON.stringify(o), title: "Administration" }],
        ["UpdateRecord", "_grist_Views", rv.viewRef, { name: "Administration" }]]);
      statut("page-admin-statut", "Page « Administration » créée : ouvrez-la (liste des pages, à gauche), puis supprimez celle-ci. Appliquez ensuite les règles (onglet Accès).", "ok");
    } catch (e) { b.disabled = false; statut("page-admin-statut", `Création refusée par Grist (${e.message || e}).`, "err"); }
  }

  function dessinerBandeau() {
    const b = $("bandeau"), aFaire = plan.etapes.filter(e => e.coche).length, options = plan.etapes.length - aFaire;
    if (!config && !plan.etapes.some(e => e.id === "table-reponses")) {
      b.className = "bandeau info";
      b.textContent = "Document existant détecté : vérifiez les associations proposées ci-dessous avant d'appliquer.";
    } else if (!aFaire) {
      b.className = "bandeau ok";
      b.textContent = options ? `Le socle est complet. ${options} action facultative reste proposée.` : "Le socle est complet.";
    } else {
      b.className = "bandeau alerte";
      b.textContent = `${aFaire} action${aFaire > 1 ? "s" : ""} à appliquer pour compléter le socle.`;
    }
  }

  function dessinerActions() {
    const zone = $("liste-actions");
    if (!plan.etapes.length) { zone.innerHTML = `<p class="vide">Aucune action : tout est en place.</p>`; $("btn-appliquer").disabled = true; return; }
    $("btn-appliquer").disabled = false;
    const groupes = [...new Set(plan.etapes.map(e => e.groupe))];
    zone.innerHTML = groupes.map(g => `<div class="groupe">${esc(g)}</div>` + plan.etapes.map((e, i) => e.groupe !== g ? "" :
      `<label class="etape"><input type="checkbox" data-i="${i}" ${e.coche ? "checked" : ""}>
        <span><strong>${esc(e.titre)}</strong><br><span class="detail">${esc(e.detail)}</span></span></label>`).join("")).join("");
  }

  function optionsTables(sel, valeur) {
    const noms = Object.keys(meta).filter(t => !t.startsWith("_grist")).sort();
    if (valeur && !noms.includes(valeur)) noms.unshift(valeur);
    sel.innerHTML = noms.map(n => `<option ${n === valeur ? "selected" : ""}>${esc(n)}</option>`).join("")
      + (noms.includes(valeur) && meta[valeur] ? "" : "");
  }

  function dessinerGeneral() {
    const g = { ...plan.general, referentiel: plan.referentiel };
    $("g-situation").value = g.situation || "";
    $("g-preset").value = g.preset || "en";
    $("g-academies").value = (g.academies || []).join("\n");
    $("g-retour").value = (g.retour_normale || []).join(", ");
    optionsTables($("g-reponses"), g.reponses);
    optionsTables($("g-referentiel"), g.referentiel);
    const sansConfig = !config;
    $("btn-general").disabled = sansConfig;
    statut("statut-general", sansConfig ? "Appliquez d'abord la création de la table Config." : "");
  }

  function dessinerTableRoles(zone, famille, tableId, roles) {
    const tMeta = meta[tableId];
    if (!tMeta) { zone.innerHTML = `<p class="vide">Table « ${esc(tableId)} » absente : elle sera créée par l'installation.</p>`; return; }
    const ctx = { reponses: plan.general.reponses, referentiel: plan.referentiel };
    const lignes = S.ROLES[famille].map(def => {
      const r = roles[def.role] || {}, choisi = choixRoles[famille][def.role];
      const courant = choisi !== undefined ? choisi : (r.col || "");
      const compat = S.colonnesCompatibles(famille, def.role, tMeta, ctx);
      const opts = [`<option value="">— aucune —</option>`, ...compat.map(c => `<option ${c === courant ? "selected" : ""}>${esc(c)}</option>`)].join("");
      const pastille = choisi !== undefined ? `<span class="pastille reco">modifiée</span>`
        : r.col ? `<span class="pastille ${r.origine === "reconnaissance" ? "reco" : "ok"}">${esc(r.origine)}</span>`
        : def.obligatoire ? `<span class="pastille manque">à créer</span>` : `<span class="pastille">facultatif</span>`;
      return `<tr><td><strong>${esc(def.role)}</strong><br><span class="detail" style="color:var(--doux);font-size:12px">${esc(def.libelle)}</span></td>
        <td><select data-famille="${famille}" data-role="${esc(def.role)}">${opts}</select>${r.alerte ? `<div class="statut err">${esc(r.alerte)}</div>` : ""}</td>
        <td>${pastille}</td></tr>`;
    }).join("");
    zone.innerHTML = `<div class="groupe">${famille === "reponses" ? "Réponses" : "Référentiel"} · table ${esc(tableId)}</div>
      <table><thead><tr><th style="width:34%">Rôle</th><th>Colonne</th><th style="width:16%">Origine</th></tr></thead><tbody>${lignes}</tbody></table>`;
  }

  function dessinerRoles() {
    dessinerTableRoles($("roles-reponses"), "reponses", plan.general.reponses, plan.rolesRep);
    dessinerTableRoles($("roles-referentiel"), "referentiel", plan.referentiel, plan.rolesRef);
    $("btn-roles").disabled = !config;
    statut("statut-roles", !config ? "Appliquez d'abord la création de la table Config." : "");
  }

  function dessinerRemarques() {
    const items = [...plan.infos, ...((config && config.erreurs) || [])];
    if (meta.Table1 && !Object.keys(meta.Table1.colonnes).some(c => !/^[ABC]$/.test(c)))
      items.push("La table « Table1 » créée par Grist avec le document semble inutilisée : vous pouvez la supprimer.");
    $("carte-remarques").hidden = !items.length;
    $("remarques").innerHTML = items.map(t => `<li>${esc(t)}</li>`).join("");
  }

  /* ---------- Événements ---------- */
  $("btn-relire").addEventListener("click", () => { S.viderCacheLecture(); charger(); });

  $("btn-appliquer").addEventListener("click", async () => {
    const coches = [...document.querySelectorAll("#liste-actions input[type=checkbox]")].filter(c => c.checked).map(c => plan.etapes[+c.dataset.i]);
    if (!coches.length) { statut("statut-actions", "Aucune action cochée.", "err"); return; }
    const sensibles = coches.filter(e => e.groupe === "Règles métier");
    if (sensibles.length && !confirm(`${sensibles.map(e => e.titre).join("\n")}\n\nCette action modifie une règle métier sur des données existantes. Continuer ?`)) return;
    $("btn-appliquer").disabled = true; statut("statut-actions", "Application en cours…");
    const res = await S.appliquer(coches);
    $("journal").innerHTML = res.map(r => `<li class="${r.ok ? "" : "err"}">${r.ok ? "✓" : "✗"} ${esc(r.etape.titre)}${r.ok ? "" : ` — ${esc(r.erreur)}`}</li>`).join("");
    const ko = res.filter(r => !r.ok).length;
    await charger();
    statut("statut-actions", ko ? `${ko} action(s) en échec, voir le journal.` : "Actions appliquées.", ko ? "err" : "ok");
  });

  $("btn-general").addEventListener("click", async () => {
    const valeur = {
      ...((config && config.valeurs.general) || S.DEFAUTS_GENERAL),
      situation: $("g-situation").value.trim(),
      preset: $("g-preset").value,
      academies: $("g-academies").value.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean),
      retour_normale: $("g-retour").value.split(",").map(s => s.trim()).filter(Boolean),
      reponses: $("g-reponses").value,
      referentiel: $("g-referentiel").value,
    };
    try { await S.ecrireConfig("general", valeur); await charger(); statut("statut-general", "Réglages enregistrés.", "ok"); }
    catch (e) { statut("statut-general", `Échec : ${e.message || e}`, "err"); }
  });

  document.addEventListener("change", ev => {
    const s = ev.target;
    if (s.matches && s.matches("select[data-famille]")) { choixRoles[s.dataset.famille][s.dataset.role] = s.value; dessinerRoles(); }
  });

  $("btn-roles").addEventListener("click", async () => {
    const actuel = (config && config.valeurs.roles) || {};
    const valeur = { reponses: { ...(actuel.reponses || {}) }, referentiel: { ...(actuel.referentiel || {}) } };
    // On part des associations affichées (y compris reconnues), puis on applique les choix faits à l'écran
    for (const [famille, roles] of [["reponses", plan.rolesRep], ["referentiel", plan.rolesRef]])
      for (const [role, r] of Object.entries(roles)) if (r.col && r.col !== role) valeur[famille][role] = r.col;
    for (const famille of ["reponses", "referentiel"])
      for (const [role, col] of Object.entries(choixRoles[famille])) {
        if (col && col !== role) valeur[famille][role] = col; else delete valeur[famille][role];
      }
    try {
      await S.ecrireConfig("roles", valeur);
      choixRoles.reponses = {}; choixRoles.referentiel = {};
      await charger(); statut("statut-roles", "Associations enregistrées.", "ok");
    } catch (e) { statut("statut-roles", `Échec : ${e.message || e}`, "err"); }
  });

  grist.ready({ requiredAccess: "full" });
  charger();
})();
