/* =====================================================================
   Administration v2 — onglet « Équipe » : sous-onglets Agents, Planning, Pages de saisie
   ---------------------------------------------------------------------
   - window.PagesAgents : pages de saisie des agents, une par agent et par formulaire publié (questionnaire établissement).
     Nom « Formulaire Alice » (« Formulaire EN Alice » quand plusieurs formulaires sont publiés) ; options du widget :
     formulaire, libelle, agent, perimetre vide (le périmètre vient du créneau en cours, Équipe › Planning).
   - window.OngletEquipeGroupe : bandeau de synthèse et sous-onglets.
   Dépend de ../commun/socle.js (window.Socle) et de repartition.js (window.Repartition).
   ===================================================================== */
(function () {
  "use strict";
  const S = window.Socle, R = window.Repartition;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ======================= Pages de saisie ======================= */
  let config = null, general = null, meta = null, agents = null, planning = null, pages = null, formulaires = [], ref = null;
  const inclure = new Map();   // « agent|formulaire » → case « créer sa page »

  async function charger() {
    config = await S.lireConfig(); general = S.general(config);
    const [m, ag, pl, pg, fs] = await Promise.all([S.lireMeta(), R.lireAgents(general), S.lirePlanning(general), R.lirePages(), R.lireFormulairesPublies(general)]);
    meta = m; agents = ag; planning = pl; pages = pg;
    formulaires = fs.filter(f => f.type === "etablissement" && meta[f.table]);
    try { ref = await R.lireReferentiel(general, config); } catch (_) { ref = null; }
  }
  const actifs = () => (agents || []).filter(a => a.actif);
  // champ (EN, ESR) d'un formulaire : réglé dans le formulaire, sinon celui de sa table, sinon deviné (colonne Site, référentiel)
  function champ(f) {
    const v = (f.conf.saisie && f.conf.saisie.version) || (S.espaceDeTable(general, f.table) || {}).version || (() => {
      const t = meta[f.table], rr = t ? S.resoudreRoles("reponses", t, { reponses: f.table, referentiel: general.referentiel }, {}, {}) : {};
      const cible = rr.Etablissement && rr.Etablissement.col ? S.cibleRef(t.colonnes[rr.Etablissement.col].type) : null;
      return (t && t.colonnes.Site) || (cible && cible !== "Etablissements") ? "esr" : "en";
    })();
    return (S.CHAMPS.find(c => c.version === v) || S.CHAMPS[0]).id;
  }
  // nom de la page : le champ distingue les formulaires quand il y en a plusieurs (le nom du formulaire si deux ont le même champ)
  function nomPage(a, f) {
    if (formulaires.length < 2) return R.nomPage(a.nom, {});
    const memeChamp = formulaires.filter(g => champ(g) === champ(f)).length > 1;
    return R.nomPage(`${memeChamp ? f.nom : champ(f)} ${a.nom}`, {});
  }
  const champsAgent = id => { const l = ((planning && planning.affectations) || []).filter(x => x.agent === id); return l.length ? [...new Set(l.flatMap(S.champsDe))] : null; };
  const fonctionDeSaisie = nom => !!(S.reglagesPlanning(config).fonctions.find(f => f.nom === nom) || {}).saisie;
  const aUneFonctionDeSaisie = id => { const l = ((planning && planning.affectations) || []).filter(x => x.agent === id); return !l.length || l.some(x => fonctionDeSaisie(x.fonction)); };
  // pages d'un formulaire : sur sa table, et qui affichent ce formulaire (ou aucun formulaire publié de cette table)
  const pagesDe = f => (pages || []).filter(p => p.table === f.table && (p.formulaire === f.nom || !formulaires.some(g => g.nom === p.formulaire && g.table === p.table)));
  const sansPerimetre = p => !Object.keys(R.nettoyer(R.perimetreObjet(ref, p.perimetre))).length;
  const aJour = (p, a, f) => p.page === nomPage(a, f) && p.libelle === a.nom && p.agent === a.id && p.formulaire === f.nom && sansPerimetre(p);
  function raison(pg, a, f) {
    const autres = pg.filter(p => p.page !== nomPage(a, f));
    if (autres.length) return `actuellement « ${autres.map(p => p.page).join(" », « ")} »`;
    if (pg.some(p => !sansPerimetre(p))) return "périmètre fixe à retirer : le planning le donne";
    if (pg.some(p => p.formulaire !== f.nom)) return "formulaire à changer";
    return "page à relier à la fiche de l'agent";
  }
  // état de chaque case agent × formulaire : ok, modif (à mettre à jour), nouv (à créer, cochée), sans (non cochée)
  function cases() {
    const out = [];
    for (const f of formulaires) {
      const ici = pagesDe(f);
      for (const a of actifs()) {
        const pg = ici.filter(p => { const x = R.agentDePage(p, agents || []); return x && x.id === a.id; });
        const k = `${a.id}|${f.id}`, ch = champsAgent(a.id);
        if (!inclure.has(k)) inclure.set(k, aUneFonctionDeSaisie(a.id) && (!ch || ch.includes(champ(f))));
        const etat = pg.length ? (pg.every(p => aJour(p, a, f)) ? "ok" : "modif") : (inclure.get(k) ? "nouv" : "sans");
        out.push({ a, f, pg, etat, k, ch });
      }
    }
    return out;
  }
  // pages des tables des formulaires sans agent actif
  function orphelines() {
    const out = [];
    for (const p of pages || []) {
      if (!formulaires.some(f => f.table === p.table)) continue;
      const a = R.agentDePage(p, agents || []);
      if (!a || !a.actif) out.push({ p, a });
    }
    return out;
  }
  const urlProposee = () => {
    const deja = (pages || []).map(x => x.url).find(u => R.URL_SAISIE_V2.test(u || ""));
    if (deja) return deja;
    try { const u = new URL("../saisie/", location.href).href; if (/^https?:/.test(u)) return u; } catch (_) { /* adresse par défaut */ }
    return "https://majouble.github.io/test-formulaire/prod/saisie/";
  };
  // Crée et met à jour les pages ; filtre : { agent } pour un seul agent
  async function creer(filtre = {}) {
    const url = ($("pa-url") && $("pa-url").value.trim()) || urlProposee();
    const aFaire = cases().filter(c => (c.etat === "nouv" || c.etat === "modif") && (!filtre.agent || c.a.id === filtre.agent));
    if (!aFaire.length) return { crees: 0, maj: 0 };
    const nouvelles = aFaire.filter(c => c.etat === "nouv"), modifiees = aFaire.filter(c => c.etat === "modif");
    if (nouvelles.length && !/^https?:\/\/\S+$/i.test(url)) throw new Error("indiquez l'adresse complète du widget de saisie (https://…)");
    const cibles = [];
    if (nouvelles.length) {
      const res = await grist.docApi.applyUserActions(nouvelles.map(c => ["CreateViewSection", meta[c.f.table].ref, 0, "custom", null, null]));
      const rvs = (res && res.retValues) || [];
      nouvelles.forEach((c, i) => { const rv = rvs[i] || {}; if (!rv.sectionRef) throw new Error("Grist n'a pas indiqué la vue créée"); cibles.push({ c, sec: rv.sectionRef, vue: rv.viewRef, url }); });
    }
    modifiees.forEach(c => c.pg.filter(p => !aJour(p, c.a, c.f)).forEach(p => cibles.push({ c, sec: p.sectionRef, vue: p.viewRef, url: p.url })));
    const sections = await grist.docApi.fetchTable("_grist_Views_section"), acts = [];
    for (const { c, sec, vue, url: u } of cibles) {
      const i = sections.id.indexOf(sec), nom = nomPage(c.a, c.f), { o, cv } = R.optionsVue(i >= 0 ? sections.options[i] : "");
      o.customView = JSON.stringify({ ...cv, mode: "url", url: cv.url || u || url, access: "full",
        widgetOptions: { ...(cv.widgetOptions || {}), formulaire: c.f.nom, libelle: c.a.nom, perimetre: {}, agent: c.a.id } });
      acts.push(["UpdateRecord", "_grist_Views_section", sec, { options: JSON.stringify(o), title: nom }]);
      const v = vue || (i >= 0 ? sections.parentId[i] : null);
      if (v) acts.push(["UpdateRecord", "_grist_Views", v, { name: nom }]);
    }
    if (acts.length) await grist.docApi.applyUserActions(acts);
    pages = await R.lirePages();
    return { crees: nouvelles.length, maj: modifiees.length };
  }
  const PASTILLES = { ok: `<span class="pastille ok">à jour</span>`, modif: `<span class="pastille reco">à mettre à jour</span>`, nouv: `<span class="pastille manque">à créer</span>`, sans: `<span class="pastille">pas de page</span>` };
  // Résumé pour la fiche d'un agent, le bandeau et l'onglet Formulaires
  function pourAgent(id) { return cases().filter(c => c.a.id === id).map(c => ({ formulaire: c.f.nom, champ: champ(c.f), etat: c.etat, page: nomPage(c.a, c.f), pastille: PASTILLES[c.etat] })); }
  function resume(nomFormulaire) {
    const l = cases().filter(c => !nomFormulaire || c.f.nom === nomFormulaire);
    return { aJour: l.filter(c => c.etat === "ok").length, aCreer: l.filter(c => c.etat === "nouv").length, aMaj: l.filter(c => c.etat === "modif").length, formulaires: formulaires.length };
  }

  let racine = null;
  function dessiner() {
    if (pages === null) { racine.innerHTML = `<div class="bandeau alerte">Les pages du document ne sont pas lisibles : le widget doit avoir l'accès complet.</div>`; return; }
    if (!formulaires.length) { racine.innerHTML = `<div class="bandeau info">Aucun formulaire établissement publié : publiez-en un (onglet Formulaires), puis revenez ici créer les pages des agents.</div>`; return; }
    if (!actifs().length) { racine.innerHTML = `<div class="bandeau info">L'équipe ne compte aucun agent actif : ajoutez-les dans le sous-onglet Agents.</div>`; return; }
    const l = cases(), aFaire = l.filter(c => c.etat === "nouv" || c.etat === "modif"), orph = orphelines();
    const cellule = c => {
      const ch = c.ch, champF = champ(c.f);
      const note = !ch ? "pas encore au planning" : ch.includes(champF) ? `mobilisé ${ch.join(" et ")}` : `jamais mobilisé ${champF}`;
      return `<td>${c.pg.length ? PASTILLES[c.etat] : `<label class="eq-case"><input type="checkbox" data-k="${esc(c.k)}"${inclure.get(c.k) ? " checked" : ""}> ${PASTILLES[c.etat]}</label>`}
        <small class="aide" style="display:block;margin:2px 0 0">« ${esc(nomPage(c.a, c.f))} »${c.etat === "modif" ? ` — ${esc(raison(c.pg, c.a, c.f))}` : ""} · ${esc(note)}</small></td>`;
    };
    racine.innerHTML = `<section class="carte"><h2>Pages de saisie</h2>
      <p class="aide">Une page Grist par agent et par formulaire publié. Cochées d'office : les agents d'une fonction qui saisit, mobilisés au planning sur le champ du formulaire, ou pas encore au planning. La page applique le périmètre du créneau en cours (sous-onglet Planning) ; hors créneau, elle montre tous les établissements.</p>
      <table class="eq-table"><thead><tr><th>Agent</th>${formulaires.map(f => `<th>${esc(f.nom)} <span class="pastille">${esc(champ(f))}</span></th>`).join("")}</tr></thead>
        <tbody>${actifs().map(a => `<tr><td><strong>${esc(a.nom)}</strong>${a.cle ? ` <span class="pastille reco">invité</span>` : ""}</td>${formulaires.map(f => cellule(l.find(c => c.a.id === a.id && c.f.id === f.id))).join("")}</tr>`).join("")}</tbody></table>
      ${orph.length ? `<p class="aide" style="margin:10px 0 0">Pages sans agent actif dans l'équipe : ${orph.map(({ p, a }) => `« ${esc(p.page)} »${a ? ` (${esc(a.nom)}, inactif)` : ""}`).join(", ")}. Elles restent telles quelles ; supprimez-les dans Grist si elles ne servent plus.</p>` : ""}
      <label class="champ" style="margin-top:12px"><span>Adresse du widget de saisie (nouvelles pages)</span><input type="text" id="pa-url" value="${esc(urlProposee())}" spellcheck="false"></label>
      <div class="boutons"><button class="secondaire" id="pa-relire" title="Relire les pages du document (après une suppression dans Grist, par exemple)">↻ Relire</button><button class="primaire" id="pa-creer"${aFaire.length ? "" : " disabled"}>${aFaire.length ? `Créer et mettre à jour les pages (${aFaire.length})` : "Pages à jour"}</button><span class="statut" id="pa-statut" role="status"></span></div></section>`;
    $("pa-relire").addEventListener("click", () => { S.oublierStructure(); afficher(); Groupe.resume(); });
    racine.querySelectorAll("[data-k]").forEach(c => c.addEventListener("change", () => { inclure.set(c.dataset.k, c.checked); dessiner(); }));
    $("pa-creer").addEventListener("click", async () => {
      $("pa-creer").disabled = true; const st = $("pa-statut"); st.textContent = "Création et mise à jour des pages…"; st.className = "statut";
      try {
        const r = await creer(); dessiner(); Groupe.resume();
        const s = $("pa-statut"); s.className = "statut ok";
        s.textContent = [r.crees ? `${r.crees} page${r.crees > 1 ? "s" : ""} créée${r.crees > 1 ? "s" : ""} (liste des pages de Grist, à gauche)` : "", r.maj ? `${r.maj} page${r.maj > 1 ? "s" : ""} mise${r.maj > 1 ? "s" : ""} à jour` : ""].filter(Boolean).join(" ; ") + ".";
      } catch (e) { pages = await R.lirePages(); dessiner(); const s = $("pa-statut"); s.className = "statut err"; s.textContent = `Opération refusée par Grist (${e.message || e}). Relancez pour terminer.`; }
    });
  }
  async function afficher() {
    racine = $("pages-agents");
    racine.innerHTML = `<div class="bandeau info">Lecture des pages…</div>`;
    try { await charger(); } catch (e) { racine.innerHTML = `<div class="bandeau alerte">Lecture impossible : ${esc(e.message || e)}</div>`; return; }
    dessiner();
  }
  window.PagesAgents = { afficher, charger, pourAgent, resume, creer, champ: f => champ(f) };

  /* ======================= Onglet Équipe : sous-onglets et synthèse ======================= */
  const SOUS = [["agents", "Agents", "equipe", () => window.OngletEquipe.afficher()], ["planning", "Planning", "planning", () => window.OngletPlanning.afficher()],
    ["pages", "Pages de saisie", "pages-agents", () => afficher()]];
  let sousCourant = "agents";
  const Groupe = {
    // « 12 agents · 5 mobilisés aujourd'hui · 3 pages à créer · règles à réappliquer »
    async resume() {
      const z = $("eq-synthese-zone"); if (!z) return;
      try {
        await charger();
        const t = Date.now() / 1000, debut = new Date(); debut.setHours(0, 0, 0, 0); const fin = debut.getTime() / 1000 + 86400;
        const parId = new Map(((planning && planning.creneaux) || []).map(c => [c.id, c]));
        const duJour = new Set(((planning && planning.affectations) || []).filter(x => { const c = parId.get(x.creneau); return c && c.debut < fin && c.fin > debut.getTime() / 1000; }).map(x => x.agent));
        const enCours = new Set(((planning && planning.affectations) || []).filter(x => { const c = parId.get(x.creneau); return c && c.debut <= t && c.fin > t; }).map(x => x.agent));
        const r = resume(), morceaux = [`${actifs().length} agent${actifs().length > 1 ? "s" : ""} actif${actifs().length > 1 ? "s" : ""}`,
          `${duJour.size} mobilisé${duJour.size > 1 ? "s" : ""} aujourd'hui${enCours.size ? ` (${enCours.size} en ce moment)` : ""}`];
        if (r.aCreer || r.aMaj) morceaux.push(`<a href="#" data-sous-lien="pages">${[r.aCreer ? `${r.aCreer} page${r.aCreer > 1 ? "s" : ""} à créer` : "", r.aMaj ? `${r.aMaj} à mettre à jour` : ""].filter(Boolean).join(", ")}</a>`);
        let regles = null;
        try { if (window.OngletAcces && window.OngletAcces.verifier) regles = await window.OngletAcces.verifier(); } catch (_) { regles = null; }
        if (regles && regles.enPlace && !regles.aJour) morceaux.push(`<a href="#" data-onglet-lien="acces">règles d'accès à réappliquer</a>`);
        z.innerHTML = `<div class="eq-synthese">${morceaux.join(" · ")}</div>`;
        z.querySelectorAll("[data-sous-lien]").forEach(x => x.addEventListener("click", ev => { ev.preventDefault(); Groupe.afficher(x.dataset.sousLien); }));
        z.querySelectorAll("[data-onglet-lien]").forEach(x => x.addEventListener("click", ev => { ev.preventDefault(); const b = document.querySelector(`nav button[data-onglet="${x.dataset.ongletLien}"]`); if (b) b.click(); }));
      } catch (_) { z.innerHTML = ""; }
    },
    afficher(sous) {
      S.oublierStructure();
      if (sous) sousCourant = sous;
      const nav = $("eq-sous");
      nav.innerHTML = SOUS.map(([id, lib]) => `<button type="button" role="tab" data-sous="${id}" aria-selected="${id === sousCourant}">${lib}</button>`).join("");
      nav.querySelectorAll("[data-sous]").forEach(b => b.addEventListener("click", () => Groupe.afficher(b.dataset.sous)));
      SOUS.forEach(([id, , div, aff]) => { $(div).hidden = id !== sousCourant; if (id === sousCourant) aff(); });
      Groupe.resume();
    },
  };
  window.OngletEquipeGroupe = Groupe;
})();
