/* =====================================================================
   Administration v2 — onglet « Équipe » : les agents de la cellule
   ---------------------------------------------------------------------
   Table Agents du socle : nom, adresse, téléphone, actif (la fonction se règle par créneau, Équipe › Planning).
   - Le périmètre n'est pas sur la fiche : il change d'un créneau à l'autre et se règle dans Équipe › Planning.
   - L'adresse servira aux règles d'accès.
   - Une liste peut être collée depuis un tableur ; les pages de saisie existantes peuvent être reprises.
   - Agent invité (sans compte Grist) : clé Cle_acces et lien personnel Lien_acces vers sa page de saisie
     (paramètre ?Invite_=<clé>) ; les règles d'accès (onglet Accès) lui donnent les droits d'un agent actif.
   ===================================================================== */
(function () {
  "use strict";
  const S = window.Socle, R = window.Repartition;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  let config = null, general = null, agents = null, pages = null, planning = null;
  let edition = null;       // agent en cours de modification : { id|null, nom, email, telephone, actif }
  let colonnesManquantes = [];   // colonnes du socle absentes de la table Agents (document d'une version antérieure)
  let racine = null;

  const table = () => general.agents || "Agents";
  const maintenant = () => Date.now() / 1000;

  async function charger() {
    config = await S.lireConfig();
    general = S.general(config);
    // l'équipe n'a pas besoin du référentiel : lectures en parallèle
    const [ag, pg, meta, pl] = await Promise.all([R.lireAgents(general), R.lirePages(), S.lireMeta(), S.lirePlanning(general), window.PagesAgents ? window.PagesAgents.charger() : null]);
    agents = ag; pages = pg; planning = pl;
    const t = meta[table()];
    colonnesManquantes = t ? S.colonnesAgents(config).filter(c => !c.isFormula).map(c => c.id).filter(c => !t.colonnes[c]) : [];
    if (t && !t.colonnes[S.INVITE.lien]) colonnesManquantes.push(S.INVITE.lien);
    if (t && !t.colonnes[S.INVITE.valide]) colonnesManquantes.push(S.INVITE.valide);
    // lien d'invité d'avant la 2.0.3 (sans « page seule ») : formule mise à jour d'office
    const cl = t && t.colonnes[S.INVITE.lien];
    if (cl && String(cl.formula || "").replace(/\s+/g, "") === S.ANCIENNE_FORMULE_LIEN_INVITE.replace(/\s+/g, ""))
      try { await grist.docApi.applyUserActions([["ModifyColumn", table(), S.INVITE.lien, { formula: S.formuleLienInvite() }]]); agents = await R.lireAgents(general); } catch (_) { /* droits insuffisants */ }
    await majPagesInvites();
  }
  // page de saisie de chaque invité (n° de page Grist) : le lien l'ouvre directement
  const pageDeAgent = a => { const p = (pages || []).find(x => { const ag = R.agentDePage(x, agents); return ag && ag.id === a.id; }); return p ? p.viewRef : null; };
  async function majPagesInvites() {
    if (!agents || !agents.some(a => a.cle)) return;
    const acts = agents.filter(a => a.cle && pageDeAgent(a) && pageDeAgent(a) !== a.pageSaisie).map(a => ["UpdateRecord", table(), a.id, { [S.INVITE.page]: pageDeAgent(a) }]);
    if (!acts.length) return;
    try { await grist.docApi.applyUserActions(acts); agents = await R.lireAgents(general); } catch (_) { /* droits insuffisants : lien vers la page d'accueil */ }
  }

  /* ---------- Rendu ---------- */
  function dessiner() {
    if (!config) { racine.innerHTML = `<div class="bandeau alerte">La table Config est absente : lancez d'abord l'installation.</div>`; return; }
    if (agents === null) {
      racine.innerHTML = `<div class="bandeau info">La table ${esc(table())} n'existe pas encore.</div>
        <section class="carte"><h2>Équipe de la cellule</h2>
        <p class="aide">Une ligne par agent : nom, adresse et téléphone. L'équipe sert au planning et à créer les pages de saisie ; elle servira aux règles d'accès et au suivi des actions.</p>
        <div class="boutons"><button class="primaire" id="eq-creer-table">Créer la table ${esc(table())}</button><span class="statut" id="eq-statut"></span></div></section>`;
      $("eq-creer-table").addEventListener("click", creerTable);
      return;
    }
    racine.innerHTML = `${colonnesManquantes.length ? `<div class="bandeau alerte">La table ${esc(table())} date d'une version antérieure : il lui manque ${esc(colonnesManquantes.join(", "))}.
      <button class="primaire" id="eq-completer" style="margin-left:8px">Compléter la table</button></div>` : ""}${carteEquipe()}${edition ? carteFiche() : ""}${carteImport()}`;
    if ($("eq-completer")) $("eq-completer").addEventListener("click", creerTable);
    lier();
  }

  function carteEquipe() {
    const actifs = agents.filter(a => a.actif);
    // pages de saisie : agent retrouvé, ou page orpheline à reprendre
    const pageDe = new Map(), orphelines = [];
    (pages || []).forEach(p => { const a = R.agentDePage(p, agents); if (a) { if (!pageDe.has(a.id)) pageDe.set(a.id, []); pageDe.get(a.id).push(p); } else if (p.libelle || /^Formulaire\s+\S/i.test(p.page)) orphelines.push(p); });
    const lignes = agents.map(a => {
      const pg = pageDe.get(a.id) || [];
      return `<tr data-id="${a.id}" class="eq-ligne${a.actif ? "" : " inactif"}" tabindex="0">
        <td><strong>${esc(a.nom) || "<em>sans nom</em>"}</strong>${a.actif ? "" : ` <span class="pastille">inactif</span>`} ${etatSaisie(a)}${a.cle ? ` <span class="pastille reco" title="Accès par lien personnel, sans compte Grist">invité</span> ${etatLien(a)}
          <button class="lien-btn" data-renouveler="${a.id}" title="Nouvelle clé : l'ancien lien cesse de fonctionner">Nouveau lien</button>` : ""}</td>
        <td>${a.email ? esc(a.email) : a.cle ? `<span class="vide">accès par lien</span>` : `<span class="pastille manque">adresse manquante</span>`}</td>
        <td>${a.telephone ? esc(a.telephone) : `<span class="vide">—</span>`}</td>
        <td>${pg.length ? pg.map(p => esc(p.page)).join("<br>") : `<span class="vide">—</span>`}</td></tr>`;
    }).join("");
    return `<section class="carte"><h2>Équipe de la cellule</h2>
      <p class="aide">Une ligne par agent. La fonction et le périmètre de chacun changent d'un créneau à l'autre : ils se règlent dans Équipe › Planning.</p>
      ${agents.length ? `<table class="eq-table"><thead><tr><th>Agent</th><th>Adresse</th><th>Téléphone</th><th>Page de saisie</th></tr></thead><tbody>${lignes}</tbody></table>
        <p class="aide" style="margin:6px 0 0">${actifs.length} agent${actifs.length > 1 ? "s" : ""} actif${actifs.length > 1 ? "s" : ""}. Cliquez sur une ligne pour la modifier.</p>`
        : `<p class="vide">Aucun agent pour l'instant.</p>`}
      ${orphelines.length ? `<div class="eq-reprise"><strong>Pages de saisie sans agent dans l'équipe</strong>
        <ul>${orphelines.map(p => `<li>${esc(p.page)}</li>`).join("")}</ul>
        <button class="secondaire" id="eq-reprendre">Ajouter ces agents à l'équipe (nom repris des pages)</button></div>` : ""}
      ${agents.some(a => a.cle) || avecExpiration() ? `<div class="eq-invites-reglage"><strong>Liens des invités</strong>
        ${avecExpiration() ? `<label>durée de validité <select id="eq-duree">${S.DUREES_INVITE.map(([v, l]) => `<option value="${v}"${v === dureeInvite() ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label>` : ""}
        ${agents.some(a => a.cle) ? `<button class="secondaire" id="eq-renouveler-tous" title="Chaque invité reçoit un nouveau lien ; les anciens cessent de fonctionner">Nouveau lien pour tous les invités (${agents.filter(a => a.cle).length})</button>` : ""}
        <span class="aide">Un lien expiré ou remplacé ne donne plus aucun accès (prise en compte par Grist dans l'heure pour l'expiration, aussitôt pour un remplacement).</span></div>
        <div id="eq-renouveles"></div>` : ""}
      <div class="boutons"><button class="primaire" id="eq-ajouter">+ Ajouter un agent</button><span class="statut" id="eq-statut"></span></div></section>`;
  }

  function carteFiche() {
    const a = edition;
    return `<section class="carte" id="eq-fiche"><h2>${a.id ? `Modifier « ${esc(a.nom)} »` : "Nouvel agent"}</h2>
      <div class="grille">
        <label class="champ"><span>Nom</span><small>Prénom ou prénom et nom : il donne son nom à la page de saisie.</small><input type="text" id="eq-nom" value="${esc(a.nom)}" autocomplete="off"></label>
        <label class="champ"><span>Adresse électronique</span><small>Celle du compte Grist de l'agent : elle servira aux règles d'accès.</small><input type="text" id="eq-email" value="${esc(a.email)}" autocomplete="off" spellcheck="false"></label>
        <label class="champ"><span>Téléphone</span><small>Facultatif.</small><input type="text" id="eq-tel" value="${esc(a.telephone)}" autocomplete="off"></label>
        <label class="champ"><span>Statut</span><small>Un agent inactif garde son historique mais n'est plus proposé sur le planning.</small>
          <span class="eq-case"><input type="checkbox" id="eq-actif"${a.actif ? " checked" : ""}> Actif</span></label>
      </div>
      ${a.id ? blocActivite(a) : ""}
      ${blocInvite(a)}
      <p class="aide" id="eq-resume">${resumeFiche()}</p>
      <div class="boutons"><button class="primaire" id="eq-enregistrer">${a.id ? "Enregistrer" : "Ajouter à l'équipe"}</button>
        <button class="secondaire" id="eq-annuler">Annuler</button>
        ${a.id ? `<button class="secondaire danger" id="eq-supprimer">Retirer de l'équipe…</button>` : ""}
        <span class="statut" id="eq-fiche-statut" role="status"></span></div></section>`;
  }
  // Activité de l'agent : droit de saisie du moment, prochains créneaux (Planning), pages de saisie (Pages de saisie)
  function blocActivite(a) {
    const ag = agents.find(x => x.id === a.id) || a, t = maintenant();
    const parId = new Map(((planning && planning.creneaux) || []).map(c => [c.id, c]));
    const aVenir = ((planning && planning.affectations) || []).filter(x => x.agent === a.id).map(x => ({ x, c: parId.get(x.creneau) }))
      .filter(o => o.c && o.c.fin > t).sort((p, q) => p.c.debut - q.c.debut).slice(0, 5);
    const heure = s => new Date(s * 1000).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }).replace(":", "h");
    const jour = s => new Date(s * 1000).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
    const pg = window.PagesAgents ? window.PagesAgents.pourAgent(a.id) : [];
    const aFaire = pg.filter(p => p.etat === "nouv" || p.etat === "modif").length;
    return `<div class="eq-activite"><div class="grille">
      <div><div class="groupe">Planning ${etatSaisie(ag)}</div>
        ${aVenir.length ? `<ul class="journal">${aVenir.map(({ x, c }) => `<li>${esc(jour(c.debut))} · ${esc(c.nom)} ${esc(heure(c.debut))}–${esc(heure(c.fin))} · ${esc(x.fonction || "fonction ?")}${S.champsDe(x).length ? ` · ${esc(S.champsDe(x).join(", "))}` : ""}${c.debut <= t ? ` <span class="pastille ok">en cours</span>` : ""}</li>`).join("")}</ul>`
          : `<p class="aide" style="margin:0">Aucun créneau à venir.</p>`}
        <button class="lien-btn" type="button" data-sous-aller="planning">Planning →</button></div>
      <div><div class="groupe">Pages de saisie</div>
        ${pg.length ? `<ul class="journal">${pg.map(p => `<li>« ${esc(p.page)} » ${p.pastille}</li>`).join("")}</ul>` : `<p class="aide" style="margin:0">Aucun formulaire établissement publié.</p>`}
        ${aFaire ? `<button class="secondaire" type="button" id="eq-pages-agent">Créer et mettre à jour ses pages (${aFaire})</button>` : ""}
        <button class="lien-btn" type="button" data-sous-aller="pages">Toutes les pages →</button></div>
    </div></div>`;
  }
  // Durée de validité des liens d'invités (clé « acces_invites » de Config) ; un lien expiré ne donne plus aucun accès
  const avecExpiration = () => !colonnesManquantes.includes(S.INVITE.expire);
  const dureeInvite = () => ((config && config.valeurs.acces_invites) || {}).duree || "24h";
  const libelleDuree = d => (S.DUREES_INVITE.find(x => x[0] === d) || S.DUREES_INVITE[0])[1];
  const finValidite = () => { const h = (S.DUREES_INVITE.find(x => x[0] === dureeInvite()) || S.DUREES_INVITE[0])[2]; return h ? maintenant() + h * 3600 : null; };
  const dateCourte = t => new Date(t * 1000).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const expire = a => !!(a.lienExpire && a.lienExpire <= maintenant());
  const etatLien = a => !a.cle ? "" : expire(a) ? `<span class="pastille manque" title="Le lien ne donne plus accès : créez un nouveau lien">lien expiré</span>`
    : a.lienExpire ? `<span class="pastille ok">lien valable jusqu'au ${esc(dateCourte(a.lienExpire))}</span>` : `<span class="pastille">lien sans limite</span>`;
  // Droit de saisie du moment : d'après le planning (Champs_acces, créneau à 7 jours) ; sans créneau, lecture seule
  const etatSaisie = a => !a.actif || a.champsAcces === null ? ""
    : a.champsAcces.length ? `<span class="pastille ok" title="Mobilisé au planning entre 7 jours avant et 7 jours après aujourd'hui">saisie ${esc(a.champsAcces.join(", "))}</span>`
    : `<span class="pastille manque" title="Pour saisir, l'agent doit avoir un créneau au planning entre 7 jours avant et 7 jours après aujourd'hui">lecture seule : aucun créneau</span>`;
  // Accès par lien personnel (agent invité, sans compte Grist)
  function blocInvite(a) {
    const possible = agents && (agents.invitesPossibles || (agents[0] && agents[0].invitesPossibles) || !colonnesManquantes.includes(S.INVITE.cle));
    if (!possible) return `<p class="aide">Accès par lien personnel (agent sans compte Grist) : complétez d'abord la table (bandeau en haut de l'onglet).</p>`;
    const lien = a.id ? (agents.find(x => x.id === a.id) || {}).lienAcces || "" : "";
    return `<div class="eq-invite">
      <label class="eq-case"><input type="checkbox" id="eq-invite"${a.invite ? " checked" : ""}> <strong>Invité : accès par lien personnel</strong>, sans compte Grist</label>
      <p class="aide">À réserver à un agent qui ne peut pas se connecter à Grist avec son adresse. Le lien ouvre sa page de saisie avec les droits d'un agent de l'équipe : lecture des signalements, émargement, et <strong>saisie seulement s'il a un créneau au planning</strong> (entre 7 jours avant et 7 jours après aujourd'hui), comme tout agent.
        <strong>Il vaut mot de passe</strong> : quiconque le détient agit en son nom.${avecExpiration() ? ` Chaque lien expire au bout de <strong>${esc(libelleDuree(dureeInvite()))}</strong> (réglage de l'équipe, ci-dessus) ; un lien transmis à d'autres cesse donc vite de fonctionner.` : ""}
        « Nouveau lien » remplace le lien : l'ancien ne fonctionne plus.</p>
      ${a.invite && a.cle ? `<div class="eq-lien">${lien && !expire(a) ? `<input type="text" id="eq-lien" readonly value="${esc(lien)}"><button class="secondaire" id="eq-copier-lien">Copier le lien</button>`
          : lien ? "" : `<span class="vide">Lien en cours de calcul par Grist : rechargez l'onglet dans un instant.</span>`}
        <button class="primaire" id="eq-nouvelle-cle" title="Nouvelle clé : l'ancien lien cesse de fonctionner">Nouveau lien</button>
        ${avecExpiration() && dureeInvite() !== "illimite" ? `<button class="secondaire" id="eq-prolonger" title="Garde le même lien">Prolonger (${esc(libelleDuree(dureeInvite()))})</button>` : ""}
        ${etatLien(agents.find(x => x.id === a.id) || a)}</div>` : ""}
      ${a.invite && !a.cle ? `<p class="aide">Le lien sera créé à l'enregistrement.</p>` : ""}
    </div>`;
  }
  const resumeFiche = () => `Page de saisie : « ${esc(R.nomPage(edition.nom || "…", {}))} ».`;

  function carteImport() {
    return `<section class="carte"><details id="eq-import"><summary><strong>Importer une liste d'agents</strong></summary>
      <p class="aide">Une ligne par agent : <code>Nom ; adresse ; téléphone</code>. Un copier-coller depuis un tableur (colonnes dans cet ordre) convient aussi. Un agent déjà présent (même adresse, sinon même nom) est mis à jour.</p>
      <textarea id="eq-liste" rows="6" placeholder="Alice Martin ; alice.martin@education.gouv.fr ; 01 23 45 67 89&#10;Bruno Petit ; bruno.petit@education.gouv.fr"></textarea>
      <div class="boutons"><button class="secondaire" id="eq-analyser">Vérifier</button><button class="primaire" id="eq-importer" disabled>Importer</button><span class="statut" id="eq-import-statut" role="status"></span></div>
      <div id="eq-import-bilan"></div></details></section>`;
  }

  /* ---------- Événements ---------- */
  function lier() {
    racine.querySelectorAll(".eq-ligne").forEach(tr => {
      const ouvrir = () => { const a = agents.find(x => x.id === +tr.dataset.id); if (a) { edition = JSON.parse(JSON.stringify(a)); edition.invite = !!a.cle; dessiner(); $("eq-fiche").scrollIntoView({ block: "nearest" }); $("eq-nom").focus(); } };
      tr.addEventListener("click", ouvrir);
      tr.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ouvrir(); } });
    });
    racine.querySelectorAll("[data-renouveler]").forEach(b => b.addEventListener("click", e => { e.stopPropagation(); renouveler([+b.dataset.renouveler]); }));
    if ($("eq-renouveler-tous")) $("eq-renouveler-tous").addEventListener("click", () => renouveler(agents.filter(a => a.cle).map(a => a.id)));
    if ($("eq-duree")) $("eq-duree").addEventListener("change", async e => {
      try { await S.ecrireConfig("acces_invites", { ...((config && config.valeurs.acces_invites) || {}), duree: e.target.value }); config = await S.lireConfig(); }
      catch (err) { dire("eq-statut", `Réglage refusé (${err.message || err}).`, true); return; }
      dire("eq-statut", `Durée des liens d'invités : ${libelleDuree(e.target.value)}. Elle s'applique aux prochains liens créés ou prolongés.`);
    });
    $("eq-ajouter").addEventListener("click", () => {
      edition = { id: null, nom: "", email: "", telephone: "", actif: true };
      dessiner(); $("eq-fiche").scrollIntoView({ block: "nearest" }); $("eq-nom").focus();
    });
    if ($("eq-reprendre")) $("eq-reprendre").addEventListener("click", reprendrePages);
    if (edition) lierFiche();
    $("eq-analyser").addEventListener("click", () => analyserListe(false));
    $("eq-importer").addEventListener("click", () => analyserListe(true));
    $("eq-liste").addEventListener("input", () => { $("eq-importer").disabled = true; $("eq-import-bilan").innerHTML = ""; });
  }
  function lierFiche() {
    const lireChamps = () => {
      edition.nom = $("eq-nom").value; edition.email = $("eq-email").value.trim(); edition.telephone = $("eq-tel").value.trim();
      edition.actif = $("eq-actif").checked;
      if ($("eq-invite")) edition.invite = $("eq-invite").checked;
    };
    if ($("eq-invite")) $("eq-invite").addEventListener("change", () => { lireChamps(); const y = window.scrollY; dessiner(); window.scrollTo(0, y); });
    if ($("eq-copier-lien")) $("eq-copier-lien").addEventListener("click", async () => {
      const o = $("eq-lien"); o.select();
      try { await navigator.clipboard.writeText(o.value); } catch (_) { try { document.execCommand("copy"); } catch (_) { /* sélection laissée */ } }
      $("eq-copier-lien").textContent = "Lien copié";
    });
    if ($("eq-nouvelle-cle")) $("eq-nouvelle-cle").addEventListener("click", () => { lireChamps(); edition.cle = nouvelleCle(); edition.renouveler = true; enregistrer("Nouveau lien créé : l'ancien ne fonctionne plus. Copiez le nouveau et transmettez-le à l'agent."); });
    if ($("eq-prolonger")) $("eq-prolonger").addEventListener("click", () => { lireChamps(); edition.renouveler = true; enregistrer(`Lien prolongé de ${libelleDuree(dureeInvite())} (même lien).`); });
    ["eq-nom", "eq-email", "eq-tel", "eq-actif"].forEach(id => $(id).addEventListener("input", () => { lireChamps(); $("eq-resume").innerHTML = resumeFiche(); }));
    $("eq-annuler").addEventListener("click", () => { edition = null; dessiner(); });
    racine.querySelectorAll("[data-sous-aller]").forEach(b => b.addEventListener("click", () => window.OngletEquipeGroupe.afficher(b.dataset.sousAller)));
    if ($("eq-pages-agent")) $("eq-pages-agent").addEventListener("click", async () => {
      $("eq-pages-agent").disabled = true;
      try {
        const r = await window.PagesAgents.creer({ agent: edition.id }); pages = await R.lirePages(); await majPagesInvites();
        const y = window.scrollY; dessiner(); window.scrollTo(0, y); window.OngletEquipeGroupe.resume();
        dire("eq-fiche-statut", `${r.crees ? `${r.crees} page(s) créée(s)` : ""}${r.crees && r.maj ? ", " : ""}${r.maj ? `${r.maj} mise(s) à jour` : ""}.`);
      } catch (e) { dire("eq-fiche-statut", `Opération refusée par Grist (${e.message || e}).`, true); }
    });
    $("eq-enregistrer").addEventListener("click", () => { lireChamps(); enregistrer(); });
    if ($("eq-supprimer")) $("eq-supprimer").addEventListener("click", supprimer);
    $("eq-fiche").addEventListener("keydown", e => { if (e.key === "Escape") { edition = null; dessiner(); } });
  }
  const dire = (id, t, err) => { const st = $(id); if (st) { st.textContent = t; st.className = `statut${err ? " err" : " ok"}`; } };

  /* ---------- Écritures ---------- */
  const nouvelleCle = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join("");
  const champs = a => {
    const c = { Nom: a.nom.trim(), Email: a.email.trim(), Telephone: a.telephone.trim(), Actif: !!a.actif, Modifie_le: maintenant() };
    if (!colonnesManquantes.includes(S.INVITE.cle) && a.invite !== undefined) {
      c[S.INVITE.cle] = a.invite ? (a.cle || nouvelleCle()) : "";
      if (avecExpiration() && (!a.invite || !a.cle || a.renouveler)) c[S.INVITE.expire] = a.invite ? finValidite() : null;
      if (a.invite && a.id) { const p = pageDeAgent(a); if (p) c[S.INVITE.page] = p; }
    }
    return c;
  };
  // Nouveau lien (nouvelle clé et nouvelle échéance) pour un ou plusieurs invités ; liens affichés pour être copiés
  async function renouveler(ids) {
    if (!ids.length) return;
    const fin = avecExpiration() ? finValidite() : undefined;
    try {
      await grist.docApi.applyUserActions(ids.map(id => ["UpdateRecord", table(), id, { [S.INVITE.cle]: nouvelleCle(), ...(fin !== undefined ? { [S.INVITE.expire]: fin } : {}) }]));
      await charger(); dessiner();
      const liste = agents.filter(a => ids.includes(a.id));
      $("eq-renouveles").innerHTML = `<div class="eq-reprise"><strong>Nouveaux liens</strong> (les anciens ne fonctionnent plus) :
        <ul>${liste.map(a => `<li>${esc(a.nom)} : ${a.lienAcces ? `<input type="text" readonly value="${esc(a.lienAcces)}" class="eq-lien-copie"> <button class="lien-btn" data-copier="${esc(a.lienAcces)}">Copier</button>` : `<span class="vide">en cours de calcul, rechargez l'onglet</span>`}</li>`).join("")}</ul></div>`;
      $("eq-renouveles").querySelectorAll("[data-copier]").forEach(b => b.addEventListener("click", async () => { try { await navigator.clipboard.writeText(b.dataset.copier); b.textContent = "Copié"; } catch (_) { b.previousElementSibling.select(); } }));
      dire("eq-statut", `${ids.length} nouveau${ids.length > 1 ? "x" : ""} lien${ids.length > 1 ? "s" : ""} créé${ids.length > 1 ? "s" : ""}${fin ? `, valable${ids.length > 1 ? "s" : ""} jusqu'au ${dateCourte(fin)}` : ""}.`);
    } catch (e) { dire("eq-statut", `Écriture refusée par Grist (${e.message || e}).`, true); }
  }
  // Auteur des signalements et des émargements : formule qui reconnaît aussi les invités (« Invité : <nom> »)
  async function auteurPourInvites() {
    try {
      const meta = await S.lireMeta(), cfg = await S.lireConfig(), g = S.general(cfg), acts = [];
      const cibles = S.espaces(g).filter(e => meta[e.reponses]).map(e => {
        const rr = S.resoudreRoles("reponses", meta[e.reponses], { reponses: e.reponses, referentiel: e.referentiel }, e.reponses === g.reponses ? (cfg.valeurs.roles || {}).reponses || {} : {}, {});
        return [e.reponses, rr.Auteur && rr.Auteur.col, rr.Etablissement && rr.Etablissement.col];
      });
      cibles.push([g.emargements, meta[g.emargements] && meta[g.emargements].colonnes.Auteur ? "Auteur" : null, null]);
      for (const [t, c, e] of cibles) if (t && c && meta[t] && S.auteurAMettreAJour(meta[t].colonnes[c])) acts.push(["ModifyColumn", t, c, { formula: S.formuleAuteur(g, e) }]);
      if (acts.length) await grist.docApi.applyUserActions(acts);
    } catch (_) { /* facultatif : l'auteur d'un invité resterait vide */ }
  }
  async function enregistrer(messageCle) {
    const a = edition, nom = a.nom.trim();
    if (!nom) { dire("eq-fiche-statut", "Indiquez le nom de l'agent.", true); $("eq-nom").focus(); return; }
    if (agents.some(x => x.id !== a.id && S.norm(x.nom) === S.norm(nom))) { dire("eq-fiche-statut", `Un agent s'appelle déjà « ${nom} » : ajoutez l'initiale du nom pour distinguer les pages.`, true); $("eq-nom").focus(); return; }
    if (a.email && !EMAIL.test(a.email)) { dire("eq-fiche-statut", "L'adresse électronique n'est pas valide.", true); $("eq-email").focus(); return; }
    if (a.email && agents.some(x => x.id !== a.id && x.email.toLowerCase() === a.email.toLowerCase())) { dire("eq-fiche-statut", "Cette adresse est déjà celle d'un autre agent.", true); $("eq-email").focus(); return; }
    try {
      const ancienInvite = a.id && !!(agents.find(x => x.id === a.id) || {}).cle;
      await grist.docApi.applyUserActions([a.id ? ["UpdateRecord", table(), a.id, champs(a)] : ["AddRecord", table(), null, champs(a)]]);
      if (a.invite) await auteurPourInvites();
      const ancien = a.id && agents.find(x => x.id === a.id);
      const aReporter = ancien && ancien.nom !== nom;
      const resteOuverte = a.invite && (!ancienInvite || messageCle);
      edition = null; await charger();
      if (resteOuverte) { const n = agents.find(x => S.norm(x.nom) === S.norm(nom)); if (n) { edition = JSON.parse(JSON.stringify(n)); edition.invite = true; } }
      dessiner();
      if (resteOuverte) { dire("eq-fiche-statut", messageCle || "Lien personnel créé : copiez-le et transmettez-le à l'agent. Les règles d'accès doivent inclure les invités : onglet Accès, « Appliquer les règles »."); return; }
      dire("eq-statut", `« ${nom} » ${a.id ? "enregistré" : "ajouté à l'équipe"}.${aReporter ? " Pour renommer sa page de saisie : Équipe › Pages de saisie, « Créer et mettre à jour les pages »." : ""}${a.email ? "" : " Pensez à son adresse électronique."}`);
    } catch (e) { dire("eq-fiche-statut", `Enregistrement refusé par Grist (${e.message || e}).`, true); }
  }
  async function supprimer() {
    const a = edition;
    if (!confirm(`Retirer « ${a.nom} » de l'équipe ? Sa page de saisie n'est pas supprimée (à faire dans Grist si besoin). Pour garder la trace de sa participation, préférez décocher « Actif ».`)) return;
    try { await grist.docApi.applyUserActions([["RemoveRecord", table(), a.id]]); edition = null; await charger(); dessiner(); dire("eq-statut", `« ${a.nom} » retiré de l'équipe.`); }
    catch (e) { dire("eq-fiche-statut", `Suppression refusée par Grist (${e.message || e}).`, true); }
  }
  async function creerTable() {
    const meta = await S.lireMeta(), plan = S.planInstallation(meta, config);
    const etape = plan.etapes.find(e => e.id === `table-${table()}` || e.id === `cols-${table()}`);
    // formule Champs_acces : seulement si la table des affectations existe (sinon Équipe › Planning l'ajoutera)
    const formule = meta[general.affectations || "Affectations"] ? plan.etapes.find(e => e.id === `formule-${table()}`) : null;
    if (!etape && formule) { await S.appliquer([formule]); await charger(); dessiner(); return; }
    if (!etape) { await charger(); dessiner(); return; }
    const [r] = await S.appliquer([etape]);
    if (r.ok && formule) await S.appliquer([formule]);
    if (!r.ok) { dire("eq-statut", `Création refusée par Grist (${r.erreur}).`, true); return; }
    await charger(); dessiner();
  }
  // Pages de saisie existantes (créées avant l'équipe) → agents, avec le nom et le périmètre de la page
  async function reprendrePages() {
    const vus = new Set(agents.map(a => S.norm(a.nom))), nouveaux = [];
    for (const p of pages) {
      if (R.agentDePage(p, agents)) continue;
      const nom = (p.libelle || p.page.replace(/^Formulaire\s+/i, "").replace(/\s*\(.*\)\s*$/, "")).trim();
      if (!nom || vus.has(S.norm(nom))) continue;
      vus.add(S.norm(nom));
      nouveaux.push({ nom, email: "", telephone: "", actif: true });
    }
    if (!nouveaux.length) return;
    try {
      await grist.docApi.applyUserActions(nouveaux.map(a => ["AddRecord", table(), null, champs(a)]));
      await charger(); dessiner();
      dire("eq-statut", `${nouveaux.length} agent(s) ajouté(s) : ${nouveaux.map(a => a.nom).join(", ")}. Complétez leur adresse électronique.`);
    } catch (e) { dire("eq-statut", `Ajout refusé par Grist (${e.message || e}).`, true); }
  }

  /* ---------- Import d'une liste ---------- */
  async function analyserListe(importer) {
    const lignes = $("eq-liste").value.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const lus = [], erreurs = [];
    lignes.forEach((l, i) => {
      const morceaux = (l.includes("\t") ? l.split("\t") : l.split(/\s*[;|]\s*/)).map(x => x.trim());
      // « nom ; adresse ; téléphone » ; ancienne forme à 4 colonnes « nom ; adresse ; fonction ; téléphone » : la fonction est ignorée
      let [nom, email = "", telephone = ""] = morceaux.length >= 4 ? [morceaux[0], morceaux[1], morceaux[3]] : morceaux;
      // tolère l'ordre « adresse ; nom »
      if (EMAIL.test(nom) && email && !EMAIL.test(email)) [nom, email] = [email, nom];
      if (/^nom$/i.test(nom)) return;   // ligne d'en-tête
      if (!nom) { erreurs.push(`ligne ${i + 1} : nom manquant`); return; }
      if (email && !EMAIL.test(email)) { erreurs.push(`ligne ${i + 1} : adresse « ${email} » invalide`); return; }
      lus.push({ nom, email, telephone });
    });
    const ajouts = [], majs = [];
    for (const x of lus) {
      const a = (x.email && agents.find(y => y.email.toLowerCase() === x.email.toLowerCase())) || agents.find(y => S.norm(y.nom) === S.norm(x.nom));
      if (a) majs.push({ a, x }); else ajouts.push(x);
    }
    const doublons = lus.map(x => S.norm(x.nom)).filter((n, i, t) => t.indexOf(n) !== i);
    if (doublons.length) erreurs.push(`noms en double dans la liste : ${[...new Set(doublons)].join(", ")}`);
    $("eq-import-bilan").innerHTML = `<ul class="journal">
      <li>${ajouts.length} agent(s) à ajouter${ajouts.length ? ` : ${ajouts.map(x => esc(x.nom)).join(", ")}` : ""}</li>
      <li>${majs.length} agent(s) déjà présent(s), mis à jour${majs.length ? ` : ${majs.map(m => esc(m.a.nom)).join(", ")}` : ""}</li>
      ${erreurs.map(e => `<li class="err">${esc(e)}</li>`).join("")}</ul>`;
    $("eq-importer").disabled = !!erreurs.length || !(ajouts.length + majs.length);
    if (!importer || erreurs.length) return;
    const acts = [
      ...ajouts.map(x => ["AddRecord", table(), null, champs({ ...x, actif: true })]),
      ...majs.map(({ a, x }) => ["UpdateRecord", table(), a.id, { Nom: x.nom, ...(x.email ? { Email: x.email } : {}), ...(x.telephone ? { Telephone: x.telephone } : {}), Modifie_le: maintenant() }]),
    ];
    try {
      await grist.docApi.applyUserActions(acts);
      await charger(); dessiner();
      dire("eq-statut", `${ajouts.length} agent(s) ajouté(s), ${majs.length} mis à jour. Affectez-les maintenant dans Équipe › Planning.`);
    } catch (e) { dire("eq-import-statut", `Import refusé par Grist (${e.message || e}).`, true); }
  }

  async function afficher() {
    racine = $("equipe");
    racine.innerHTML = `<div class="bandeau info">Lecture de l'équipe…</div>`;
    try { await charger(); } catch (e) { racine.innerHTML = `<div class="bandeau alerte">Lecture impossible : ${esc(e.message || e)}</div>`; return; }
    dessiner();
  }
  window.OngletEquipe = { afficher };
})();
