/* =====================================================================
   Administration v2 — onglet « Validation », carte « Accès des services » (2.62.0-alpha.35)
   ---------------------------------------------------------------------
   Un accès commun par DSDEN ou par rectorat, partagé par l'équipe du service, sans compte Grist :
   - « agent de service » : ligne de la table Agents avec Service coché, un échelon (Départemental, Académique) et un
     périmètre de visa d'un seul département ou d'une seule académie, un lien d'invité (clé Cle_acces) ;
   - création par lot depuis les départements et les académies du référentiel (« DSDEN <département> »,
     « Rectorat <académie> »), puis création de leurs pages de saisie (Équipe › Pages de saisie) ;
   - durée de validité propre aux liens de service, nouveau lien (l'ancien cesse de fonctionner), prolongation ;
   - liens téléchargeables en CSV, pour l'envoi aux services ;
   - préparation du document : colonne Service (Agents), colonne Personne_service des tables de réponses (nom de la
     personne qui saisit derrière le lien commun, demandé à l'ouverture de la page), colonnes formules Departement et
     Academie des tableaux (sous-tables) pour que les règles d'accès y limitent un service à son périmètre.
   Réglages : clé « acces_services » de Config ({ duree, saisie }). Les règles d'accès (onglet Accès) limitent un service
   aux lignes de son périmètre ; il saisit des signalements pour ses établissements si « saisie » est coché.
   Définit : window.OngletServices = { afficher }. Utilise : Socle, Repartition, PagesAgents (facultatif), OngletAcces (facultatif).
   ===================================================================== */
(function () {
  "use strict";
  const S = window.Socle, R = window.Repartition;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const maintenant = () => Date.now() / 1000;
  const nouvelleCle = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join("");

  let config, general, meta, agents, ref, formulaires, racine, reglage;
  const choix = { dep: true, aca: true };   // création : un accès par département, par académie

  /* ---------- Lecture ---------- */
  async function charger() {
    config = await S.lireConfig();
    general = S.general(config);
    meta = await S.lireMeta();
    reglage = S.reglagesServices(config);
    agents = await R.lireAgents(general) || [];
    formulaires = await R.lireFormulairesPublies(general).catch(() => []);
    ref = await R.lireReferentiel(general, config).catch(() => null);
  }
  const tAgents = () => general.agents || "Agents";
  const colsAgents = () => (meta[tAgents()] || { colonnes: {} }).colonnes;
  const valeursRef = role => { const c = ref && ref.roles && ref.roles[role]; return c && ref.valeurs && ref.valeurs[c] ? ref.valeurs[c].map(x => x.v).filter(Boolean) : []; };
  const departements = () => valeursRef("Departement");
  const academies = () => (general.academies && general.academies.length) ? general.academies : valeursRef("Academie");
  // lecture brute de la table Agents (échelon et périmètre ne sont pas lus par Repartition.lireAgents)
  let brut = null;
  async function lireBrut() { try { brut = await grist.docApi.fetchTable(tAgents()); } catch (_) { brut = null; } }
  function services() {
    if (!brut || !brut.Service) return [];
    const v = (k, i) => (brut[k] || [])[i];
    return brut.id.map((id, i) => ({ i, id })).filter(({ i }) => v("Service", i) === true).map(({ i, id }) => {
      const a = agents.find(x => x.id === id) || {}, ech = String(v("Echelon_visa", i) || "");
      return { ...a, id, echelon: ech, lieux: S.listeChoix(v(ech === "Académique" ? "Visa_academies" : "Visa_departements", i)) };
    }).sort((a, b) => (a.echelon === b.echelon ? a.nom.localeCompare(b.nom, "fr") : a.echelon === "Académique" ? 1 : -1));
  }
  // départements et académies sans accès de service
  function aCreer() {
    const sv = services(), couvert = (ech, x) => sv.some(s => s.echelon === ech && s.lieux.includes(x));
    return [...(choix.dep ? departements().filter(x => !couvert("Départemental", x)).map(x => ({ echelon: "Départemental", lieu: x })) : []),
      ...(choix.aca ? academies().filter(x => !couvert("Académique", x)).map(x => ({ echelon: "Académique", lieu: x })) : [])];
  }

  /* ---------- Préparation du document ---------- */
  // tableaux (sous-tables) des formulaires : { table, parent } ; une colonne Ref vers la table des réponses
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
  function preparations() {
    const acts = [], quoi = [];
    if (meta[tAgents()] && !colsAgents()[S.SERVICES.colonne]) { acts.push(["AddColumn", tAgents(), S.SERVICES.colonne, { type: "Bool", isFormula: false, label: "Accès de service", untieColIdFromLabel: true }]); quoi.push(`${tAgents()}.${S.SERVICES.colonne}`); }
    for (const e of S.espaces(general)) {
      if (meta[e.reponses] && !meta[e.reponses].colonnes[S.SERVICES.personne] && !acts.some(a => a[1] === e.reponses)) {
        acts.push(["AddColumn", e.reponses, S.SERVICES.personne, { type: "Text", isFormula: false, label: "Personne (accès de service)", untieColIdFromLabel: true }]);
        quoi.push(`${e.reponses}.${S.SERVICES.personne}`);
      }
    }
    for (const st of sousTables()) {
      const cs = meta[st.table].colonnes, rc = meta[st.reponses].colonnes;
      for (const c of ["Departement", "Academie"]) if (!cs[c] && rc[c]) {
        acts.push(["AddColumn", st.table, c, { type: "Any", isFormula: true, formula: `$${st.parent}.${c}`, label: c, untieColIdFromLabel: true }]);
        quoi.push(`${st.table}.${c}`);
      }
    }
    return { acts, quoi };
  }

  /* ---------- Rendu ---------- */
  const dateCourte = t => new Date(t * 1000).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const libelleDuree = d => (S.DUREES_INVITE.find(x => x[0] === d) || S.DUREES_INVITE[0])[1];
  const finValidite = () => { const h = (S.DUREES_INVITE.find(x => x[0] === reglage.duree) || [])[2]; return h ? maintenant() + h * 3600 : null; };
  const etatLien = a => !a.cle ? `<span class="pastille manque">sans lien</span>`
    : a.lienExpire && a.lienExpire <= maintenant() ? `<span class="pastille manque">lien expiré</span>`
    : a.lienExpire ? `<span class="pastille ok">jusqu'au ${esc(dateCourte(a.lienExpire))}</span>` : `<span class="pastille">sans limite</span>`;
  function dessiner() {
    if (!config) { racine.innerHTML = `<h2>Accès des services</h2><p class="vide">La table Config est absente : lancez d'abord l'installation.</p>`; return; }
    if (!meta[tAgents()] || !colsAgents().Echelon_visa) { racine.innerHTML = `<h2>Accès des services</h2><p class="vide">Ajoutez d'abord les colonnes des viseurs à la table ${esc(tAgents())} (carte Viseurs, ci-dessus).</p>`; return; }
    if (!colsAgents()[S.INVITE.cle]) { racine.innerHTML = `<h2>Accès des services</h2><p class="vide">Les liens d'invités ne sont pas en place : complétez la table ${esc(tAgents())} (onglet Équipe).</p>`; return; }
    const prep = preparations(), sv = services(), nouv = aCreer(), sansPage = sv.filter(a => !a.pageSaisie);
    racine.innerHTML = `<h2>Accès des services</h2>
      <p class="aide">Un accès commun par DSDEN ou par rectorat, sans compte Grist : un lien partagé par l'équipe du service, qui ouvre sa page de saisie.
        Le service y voit les signalements des établissements de son périmètre (et seulement eux), renseigne ses compléments et pose ses visas${reglage.saisie ? ", et saisit des signalements pour ses établissements" : ""}.
        À l'ouverture, la page demande le nom de la personne : il accompagne chaque signalement qu'elle saisit. <strong>Le lien vaut mot de passe</strong> : en cas de doute, « Nouveau lien » le remplace aussitôt.</p>
      ${prep.acts.length ? `<div class="bandeau info">Préparation du document : ${prep.quoi.map(esc).join(", ")}.
        <div class="boutons"><button class="primaire" data-sv-act="preparer">Préparer le document</button></div></div>` : ""}
      <div class="grille sv-reglages">
        <label class="champ"><span>Durée de validité des liens de service</span><small>Les liens des agents invités gardent leur propre durée (onglet Équipe).</small>
          <select id="sv-duree">${S.DUREES_INVITE.map(([v, l]) => `<option value="${v}"${v === reglage.duree ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
        <label class="champ"><span>Saisie de signalements</span><small>Sans saisie, le service consulte, complète et vise seulement.</small>
          <span class="eq-case"><input type="checkbox" id="sv-saisie"${reglage.saisie ? " checked" : ""}> Les services saisissent des signalements pour les établissements de leur périmètre</span></label>
      </div>
      ${sv.length ? `<div class="sv-defile"><table class="va-table sv-table"><thead><tr><th>Service</th><th>Périmètre</th><th>Lien</th><th>Page</th><th></th></tr></thead><tbody>
        ${sv.map(a => `<tr${a.actif ? "" : ' class="va-inactif"'}><td><strong>${esc(a.nom)}</strong>${a.actif ? "" : ` <span class="pastille">inactif</span>`}</td>
          <td>${a.lieux.length ? esc(a.lieux.join(", ")) : `<span class="pastille manque">périmètre vide : aucun accès</span>`}</td>
          <td>${etatLien(a)}${a.lienAcces && a.cle ? ` <button class="lien-btn" data-sv-copier="${esc(a.lienAcces)}">Copier</button>` : ""}</td>
          <td>${a.pageSaisie ? `<span class="pastille ok">page n° ${esc(a.pageSaisie)}</span>` : `<span class="pastille reco">à créer</span>`}</td>
          <td><button class="lien-btn" data-sv-nouveau="${a.id}" title="Nouvelle clé : l'ancien lien cesse de fonctionner">Nouveau lien</button>
            ${reglage.duree !== "illimite" ? `<button class="lien-btn" data-sv-prolonger="${a.id}" title="Garde le même lien">Prolonger</button>` : ""}</td></tr>`).join("")}
        </tbody></table></div>` : `<p class="vide">Aucun accès de service pour l'instant.</p>`}
      <div class="sv-creation"><strong>Créer des accès</strong>
        <label class="eq-case"><input type="checkbox" id="sv-dep"${choix.dep ? " checked" : ""}> un par département (DSDEN)</label>
        <label class="eq-case"><input type="checkbox" id="sv-aca"${choix.aca ? " checked" : ""}> un par académie (rectorat)</label>
        <p class="aide">${nouv.length ? `${nouv.length} à créer : ${esc(nouv.slice(0, 12).map(x => S.nomService(x.echelon, x.lieu)).join(", "))}${nouv.length > 12 ? "…" : ""}.` : "Tous les départements et académies du référentiel ont leur accès."}
          Chaque accès reçoit un lien valable ${esc(libelleDuree(reglage.duree))} ; ses pages de saisie sont créées dans la foulée.</p></div>
      <div class="boutons">
        <button class="primaire" data-sv-act="creer"${nouv.length && !prep.acts.length ? "" : " disabled"}>Créer ${nouv.length ? `${nouv.length} accès` : "les accès"}</button>
        ${sansPage.length ? `<button class="secondaire" data-sv-act="pages">Créer les pages de saisie manquantes (${sansPage.length})</button>` : ""}
        ${sv.length ? `<button class="secondaire" data-sv-act="csv">Télécharger les liens (CSV)</button>` : ""}
        <span class="statut" id="sv-statut" role="status"></span></div>
      <p class="aide">Après une création, un nouveau lien ou un changement de réglage, les règles d'accès du socle sont réappliquées si elles sont en place (onglet Accès).</p>`;
    lier();
  }

  /* ---------- Écritures ---------- */
  const dire = (t, err) => { const st = $("sv-statut"); if (st) { st.textContent = t; st.className = `statut${err ? " err" : " ok"}`; } };
  async function reappliquer() {
    try { if (window.OngletAcces && window.OngletAcces.reappliquerSiBesoin) return (await window.OngletAcces.reappliquerSiBesoin()).texte || ""; } catch (_) { /* facultatif */ }
    return "";
  }
  // pages de saisie des services sans page (Équipe › Pages de saisie), puis n° de page sur leur ligne (le lien l'ouvre)
  async function creerPages(ids) {
    if (!window.PagesAgents || !ids.length) return 0;
    await window.PagesAgents.charger();
    let n = 0;
    for (const id of ids) { const r = await window.PagesAgents.creer({ agent: id }); n += r.crees || 0; }
    const pages = await R.lirePages(), tous = await R.lireAgents(general), acts = [];
    for (const id of ids) {
      const a = tous.find(x => x.id === id), p = a && (pages || []).find(x => { const ag = R.agentDePage(x, tous); return ag && ag.id === id; });
      if (p && p.viewRef !== a.pageSaisie) acts.push(["UpdateRecord", tAgents(), id, { [S.INVITE.page]: p.viewRef }]);
    }
    if (acts.length) await grist.docApi.applyUserActions(acts);
    return n;
  }
  async function creer() {
    const nouv = aCreer();
    if (!nouv.length) return;
    dire(`Création de ${nouv.length} accès…`);
    try {
      const fin = finValidite(), t = maintenant();
      const res = await grist.docApi.applyUserActions([["BulkAddRecord", tAgents(), nouv.map(() => null), {
        Nom: nouv.map(x => S.nomService(x.echelon, x.lieu)), Email: nouv.map(() => ""), Actif: nouv.map(() => true),
        [S.SERVICES.colonne]: nouv.map(() => true), Echelon_visa: nouv.map(x => x.echelon),
        Visa_departements: nouv.map(x => x.echelon === "Départemental" ? ["L", x.lieu] : null),
        Visa_academies: nouv.map(x => x.echelon === "Académique" ? ["L", x.lieu] : null),
        [S.INVITE.cle]: nouv.map(() => nouvelleCle()), ...(colsAgents()[S.INVITE.expire] ? { [S.INVITE.expire]: nouv.map(() => fin) } : {}),
        ...(colsAgents().Modifie_le ? { Modifie_le: nouv.map(() => t) } : {}),
      }]]);
      let ids = (res && res.retValues && Array.isArray(res.retValues[0]) ? res.retValues[0] : []).filter(x => typeof x === "number");
      if (ids.length !== nouv.length) {   // identifiants non rendus : relus d'après les noms créés
        const noms = new Set(nouv.map(x => S.nomService(x.echelon, x.lieu))), tous = await R.lireAgents(general) || [];
        ids = tous.filter(a => noms.has(a.nom) && a.cle).map(a => a.id);
      }
      let pages = 0, avert = "";
      try { pages = await creerPages(ids); } catch (e) { avert = ` Pages non créées (${e.message || e}) : Équipe › Pages de saisie.`; }
      const acces = await reappliquer();
      await recharger();
      dire(`${nouv.length} accès créé${nouv.length > 1 ? "s" : ""}${pages ? `, ${pages} page${pages > 1 ? "s" : ""} de saisie` : ""}.${avert}${acces ? ` ${acces}` : ""} Téléchargez les liens (CSV) pour les envoyer.`);
    } catch (e) { dire(`Échec : ${e.message || e}`, true); }
  }
  async function majLien(id, nouvelle) {
    const fin = finValidite(), f = { ...(nouvelle ? { [S.INVITE.cle]: nouvelleCle() } : {}), ...(colsAgents()[S.INVITE.expire] ? { [S.INVITE.expire]: fin } : {}) };
    try { await grist.docApi.applyUserActions([["UpdateRecord", tAgents(), id, f]]); await recharger();
      dire(nouvelle ? `Nouveau lien créé${fin ? `, valable jusqu'au ${dateCourte(fin)}` : ""} : l'ancien ne fonctionne plus.` : `Lien prolongé${fin ? ` jusqu'au ${dateCourte(fin)}` : ""}.`); }
    catch (e) { dire(`Échec : ${e.message || e}`, true); }
  }
  function csv() {
    const l = [["Service", "Échelon", "Périmètre", "Lien", "Valable jusqu'au"], ...services().filter(a => a.actif && a.cle).map(a => [a.nom, a.echelon, a.lieux.join(", "), a.lienAcces || "", a.lienExpire ? dateCourte(a.lienExpire) : "sans limite"])];
    const texte = "﻿" + l.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([texte], { type: "text/csv;charset=utf-8" }));
    a.download = "liens-services.csv"; document.body.appendChild(a); a.click(); a.remove();
    dire("Liens téléchargés : à transmettre à chaque service par un canal sûr.");
  }
  async function majReglage(k, v) {
    try { await S.ecrireConfig("acces_services", { ...reglage, [k]: v }); const acces = await reappliquer(); await recharger(); dire(`Réglage enregistré.${acces ? ` ${acces}` : ""}`); }
    catch (e) { dire(`Échec : ${e.message || e}`, true); }
  }
  function lier() {
    const bp = racine.querySelector("[data-sv-act=preparer]");
    if (bp) bp.addEventListener("click", async () => {
      try { await grist.docApi.applyUserActions(preparations().acts); S.oublierStructure && S.oublierStructure(); await recharger(); dire("Document préparé."); }
      catch (e) { dire(`Échec : ${e.message || e}`, true); }
    });
    $("sv-duree").addEventListener("change", e => majReglage("duree", e.target.value));
    $("sv-saisie").addEventListener("change", e => majReglage("saisie", e.target.checked));
    $("sv-dep").addEventListener("change", e => { choix.dep = e.target.checked; dessiner(); });
    $("sv-aca").addEventListener("change", e => { choix.aca = e.target.checked; dessiner(); });
    racine.querySelector("[data-sv-act=creer]").addEventListener("click", creer);
    const pg = racine.querySelector("[data-sv-act=pages]");
    if (pg) pg.addEventListener("click", async () => {
      try { const n = await creerPages(services().filter(a => !a.pageSaisie).map(a => a.id)); await recharger(); dire(`${n} page${n > 1 ? "s" : ""} de saisie créée${n > 1 ? "s" : ""}.`); }
      catch (e) { dire(`Pages non créées : ${e.message || e}`, true); }
    });
    const bc = racine.querySelector("[data-sv-act=csv]");
    if (bc) bc.addEventListener("click", csv);
    racine.querySelectorAll("[data-sv-nouveau]").forEach(b => b.addEventListener("click", () => majLien(+b.dataset.svNouveau, true)));
    racine.querySelectorAll("[data-sv-prolonger]").forEach(b => b.addEventListener("click", () => majLien(+b.dataset.svProlonger, false)));
    racine.querySelectorAll("[data-sv-copier]").forEach(b => b.addEventListener("click", async () => { try { await navigator.clipboard.writeText(b.dataset.svCopier); b.textContent = "Copié"; } catch (_) { dire(b.dataset.svCopier); } }));
  }

  async function recharger() { await charger(); await lireBrut(); dessiner(); }
  async function afficher() {
    racine = $("va-services");
    if (!racine) return;
    try { await recharger(); }
    catch (e) { racine.innerHTML = `<h2>Accès des services</h2><p class="avert">Lecture impossible : ${esc(e.message || e)}</p>`; }
  }
  window.OngletServices = { afficher };
})();
