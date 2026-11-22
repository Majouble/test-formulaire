/* =====================================================================
   Administration v2 — onglet « Établissements », carte « Demandes de compléments » (2.62.0-alpha.41)
   ---------------------------------------------------------------------
   Suivi des demandes faites aux partenaires (DSDEN, rectorats…) depuis les widgets Extractions et Fiche établissement
   (bouton « Demander des compléments… » : sélection d'établissements, données demandées, éléments réservés, consigne,
   échéance ; moteur commun : commun/demandes.js). Pour chaque demande :
   - établissements complets / visés, par académie ou par département ;
   - établissements à compléter et ce qui leur manque, fichier CSV ;
   - clore, rouvrir, supprimer (une demande close disparaît des pages des partenaires).
   Clé « demandes » de Config. Définit : window.OngletDemandes = { afficher }. Utilise : Socle, Repartition, Demandes.
   ===================================================================== */
(function () {
  "use strict";
  const S = window.Socle, R = window.Repartition, D = () => window.Demandes;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nf = n => Number(n || 0).toLocaleString("fr-FR");
  const pc = (a, b) => b ? `${Math.round(100 * a / b)} %` : "—";
  const MAX_LISTE = 200;

  let config, general, meta, racine;
  const parDep = {};               // ventilation par département plutôt que par académie
  const cacheRef = new Map();      // référentiel : table -> { t, cols, texte(col, i) }

  async function charger() {
    config = await S.lireConfig();
    general = S.general(config);
    meta = await S.lireMeta();
    cacheRef.clear();
  }
  // Référentiel lu, colonnes d'affichage (rôles), références (académie…) rendues par leur libellé
  async function referentiel(table) {
    if (cacheRef.has(table)) return cacheRef.get(table);
    const t = await grist.docApi.fetchTable(table);
    const ref = await R.lireReferentiel({ ...general, referentiel: table }, config).catch(() => ({ roles: {} }));
    const roles = (ref && ref.roles) || {}, c = (role, d) => roles[role] || (t[d] ? d : null);
    const cols = { nom: c("Nom", "Nom"), uai: c("UAI", "UAI"), commune: c("Commune", "Commune"), aca: c("Academie", "Academie"), dep: c("Departement", "Departement") };
    const libelles = {};
    for (const k of [cols.aca, cols.dep].filter(Boolean)) {
      const cible = S.cibleRef(((meta[table] || { colonnes: {} }).colonnes[k] || {}).type);
      if (!cible || t[`${k}_nom`]) continue;
      try { const tc = await grist.docApi.fetchTable(cible), cn = Object.keys(tc).find(x => x !== "id" && (tc[x] || []).some(v => typeof v === "string")); libelles[k] = new Map(tc.id.map((id, i) => [id, cn ? tc[cn][i] : id])); } catch (_) { /* référence illisible */ }
    }
    const texte = (k, i) => {
      if (!k || !t[k]) return "";
      if (t[`${k}_nom`] && S.cibleRef(((meta[table] || { colonnes: {} }).colonnes[k] || {}).type)) return String(t[`${k}_nom`][i] ?? "");
      const v = t[k][i];
      return libelles[k] && typeof v === "number" ? String(libelles[k].get(v) ?? "") : Array.isArray(v) ? v.slice(1).join(", ") : String(v ?? "");
    };
    const x = { t, cols, texte };
    cacheRef.set(table, x);
    return x;
  }
  async function etat(d) {
    const ref = await referentiel(d.referentiel);
    const reserves = d.reserves ? await D().reservesParEtab(await D().tablesReservees(d.referentiel, config, meta)) : null;
    return { ref, av: D().avancement(d, ref.t, reserves) };
  }

  /* ---------- Rendu ---------- */
  const jourFr = j => j ? j.split("-").reverse().join("/") : "";
  const dateFr = iso => iso ? new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  const libCol = (table, c) => (((meta[table] || { colonnes: {} }).colonnes[c] || {}).label) || c;
  const manqueTexte = (d, l) => [...l.manque.map(c => libCol(d.referentiel, c)), ...(l.reserveAFaire ? ["éléments réservés"] : [])].join(", ");

  async function dessiner() {
    if (!racine) return;
    if (!config || !D()) { racine.innerHTML = ""; return; }
    const liste = D().liste(config), blocs = [];
    for (const d of [...liste].reverse()) {
      try { blocs.push(await carte(d)); }
      catch (e) { blocs.push(`<div class="cp-campagne"><h3>${esc(d.nom)}</h3><p class="avert">Suivi impossible : ${esc(e.message || e)}</p></div>`); }
    }
    racine.innerHTML = `<section class="carte" id="dm-carte"><h2>Demandes de compléments</h2>
      <p class="aide">Demandez aux partenaires (DSDEN, rectorats…, carte « Partenaires » de l'onglet Accès) de compléter les fiches d'une liste d'établissements :
        données de l'établissement (onglet Référentiel, « Données demandées aux services ») et éléments réservés de leur dernier signalement.
        La liste se choisit avec les filtres des widgets <strong>Extractions</strong> ou <strong>Fiche établissement</strong>, bouton « Demander des compléments… ».
        Chaque partenaire voit les établissements de son périmètre sur sa page des compléments.</p>
      ${blocs.length ? blocs.join("") : `<p class="vide">Aucune demande pour l'instant.</p>`}
      <span class="statut" id="dm-statut" role="status"></span></section>`;
    lier();
  }

  async function carte(d) {
    const { ref, av } = await etat(d), { cols, texte } = ref;
    const n = av.total, ok = av.complets, reste = av.lignes.filter(l => !l.complet);
    const dep = !!parDep[d.id] && cols.dep, cle = dep ? cols.dep : cols.aca, groupes = new Map();
    av.lignes.forEach(l => { const k = texte(cle, l.i) || "(non renseigné)"; const g = groupes.get(k) || { n: 0, ok: 0 }; g.n++; if (l.complet) g.ok++; groupes.set(k, g); });
    const ligneG = ([k, g]) => `<tr><td>${esc(k)}</td><td class="va-n">${nf(g.n)}</td><td class="va-n">${nf(g.ok)}</td><td class="va-n">${nf(g.n - g.ok)}</td>
      <td style="min-width:120px"><div class="cp-barre" title="${pc(g.ok, g.n)}"><span style="width:${g.n ? Math.round(100 * g.ok / g.n) : 0}%"></span></div></td><td class="va-n">${pc(g.ok, g.n)}</td></tr>`;
    const retard = d.echeance && !d.close && d.echeance < S.jourParis(Date.now() / 1000);
    const attendu = [d.donnees && d.donnees.length ? `données : ${d.donnees.map(c => libCol(d.referentiel, c)).join(", ")}` : "", d.reserves ? "éléments réservés du dernier signalement" : ""].filter(Boolean).join(" ; ");
    return `<div class="cp-campagne" data-id="${esc(d.id)}">
      <div class="cp-tete"><h3>${esc(d.nom)}</h3><span class="pastille ${d.close ? "" : "ok"}">${d.close ? "close" : "en cours"}</span>
        ${retard ? `<span class="pastille manque">échéance dépassée</span>` : ""}
        <span class="aide">créée le ${dateFr(d.cree_le)}${d.echeance ? ` · échéance le ${jourFr(d.echeance)}` : ""}</span></div>
      <p class="aide">${esc(d.referentiel)} · ${esc(attendu)}${d.source ? `<br>Sélection : ${esc(d.source)}` : ""}${d.consigne ? `<br>Consigne : ${esc(d.consigne)}` : ""}</p>
      <p><strong>${nf(ok)}</strong> établissement(s) complet(s) sur <strong>${nf(n)}</strong> — ${pc(ok, n)}.${av.ailleurs ? ` <span class="aide">${nf(av.ailleurs)} absent(s) du référentiel.</span>` : ""}</p>
      <div class="cp-barre" style="max-width:420px"><span style="width:${n ? Math.round(100 * ok / n) : 0}%"></span></div>
      <table class="va-table"><thead><tr><th>${dep ? "Département" : "Académie"} <button type="button" class="lien-btn" data-dm-dep="${esc(d.id)}">${dep ? "par académie" : cols.dep ? "par département" : ""}</button></th>
        <th class="va-n">Visés</th><th class="va-n">Complets</th><th class="va-n">À compléter</th><th></th><th class="va-n">Taux</th></tr></thead>
        <tbody>${[...groupes.entries()].sort((a, b) => a[0].localeCompare(b[0], "fr")).map(ligneG).join("")}</tbody></table>
      <details${reste.length && reste.length <= 30 ? " open" : ""}><summary><strong>À compléter (${nf(reste.length)})</strong></summary>
        ${reste.length ? `<table class="va-table"><thead><tr><th>Établissement</th><th>UAI</th><th>Commune</th><th>${cols.dep ? "Département" : "Académie"}</th><th>Manque</th></tr></thead><tbody>
          ${reste.slice(0, MAX_LISTE).map(l => `<tr><td>${esc(texte(cols.nom, l.i))}</td><td>${esc(texte(cols.uai, l.i))}</td><td>${esc(texte(cols.commune, l.i))}</td><td>${esc(texte(cols.dep || cols.aca, l.i))}</td><td>${esc(manqueTexte(d, l))}</td></tr>`).join("")}</tbody></table>
          ${reste.length > MAX_LISTE ? `<p class="aide">${MAX_LISTE} premiers affichés ; le fichier les contient tous.</p>` : ""}` : `<p class="vide">Tous les établissements visés sont complets.</p>`}</details>
      <div class="boutons">
        <button class="primaire" data-dm="csv" data-id="${esc(d.id)}"${reste.length ? "" : " disabled"}>Fichier CSV des établissements à compléter (${nf(reste.length)})</button>
        <button class="secondaire" data-dm="${d.close ? "rouvrir" : "clore"}" data-id="${esc(d.id)}">${d.close ? "Rouvrir" : "Clore la demande"}</button>
        <button class="secondaire" data-dm="supprimer" data-id="${esc(d.id)}">Supprimer</button>
      </div></div>`;
  }

  /* ---------- Écritures ---------- */
  const dire = (t, err) => { const st = $("dm-statut"); if (st) { st.textContent = t; st.className = `statut${err ? " err" : " ok"}`; } };
  async function modifier(id, fn) {
    try { await D().enregistrer(l => l.map(d => d.id === id ? fn({ ...d }) : d).filter(Boolean)); config = await S.lireConfig(); await dessiner(); }
    catch (e) { dire(`Échec : ${e.message || e}`, true); }
  }
  async function csv(id) {
    const d = D().liste(config).find(x => x.id === id); if (!d) return;
    const { ref, av } = await etat(d), { cols, texte } = ref;
    const q = v => { const s = String(v ?? ""); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lignes = av.lignes.filter(l => !l.complet);
    const contenu = "﻿" + [["UAI", "Nom", "Commune", "Département", "Académie", "Manque"].join(";"),
      ...lignes.map(l => [texte(cols.uai, l.i), texte(cols.nom, l.i), texte(cols.commune, l.i), texte(cols.dep, l.i), texte(cols.aca, l.i), manqueTexte(d, l)].map(q).join(";"))].join("\r\n") + "\r\n";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([contenu], { type: "text/csv;charset=utf-8" }));
    a.download = `a-completer-${S.norm(d.nom).slice(0, 40)}-${S.jourParis(Date.now() / 1000)}.csv`;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    dire(`${nf(lignes.length)} établissement(s) dans le fichier.`);
  }
  function lier() {
    racine.querySelectorAll("[data-dm]").forEach(b => b.addEventListener("click", () => {
      const a = b.dataset.dm, id = b.dataset.id;
      if (a === "csv") csv(id).catch(e => dire(`Échec : ${e.message || e}`, true));
      else if (a === "clore") modifier(id, d => ({ ...d, close: true }));
      else if (a === "rouvrir") modifier(id, d => ({ ...d, close: false }));
      else if (a === "supprimer") { if (confirm("Supprimer cette demande ? Les données déjà complétées restent dans le référentiel et les signalements.")) modifier(id, () => null); }
    }));
    racine.querySelectorAll("[data-dm-dep]").forEach(b => b.addEventListener("click", () => { parDep[b.dataset.dmDep] = !parDep[b.dataset.dmDep]; dessiner(); }));
  }

  async function afficher() {
    racine = $("demandes");
    if (!racine || !D()) return;
    try { await charger(); await dessiner(); }
    catch (e) { racine.innerHTML = `<section class="carte"><h2>Demandes de compléments</h2><p class="avert">Lecture impossible : ${esc(e.message || e)}</p></section>`; }
  }
  window.OngletDemandes = { afficher };
})();
