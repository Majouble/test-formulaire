/* =====================================================================
   Administration v2 — onglet « Équipe » : les agents de la cellule
   ---------------------------------------------------------------------
   Table Agents du socle : nom, adresse, rôle (Coordination, Saisie, Lecture), téléphone, périmètre, actif.
   - Le périmètre d'un agent répartit le travail : sa page de saisie (onglet Formulaires) s'y limite.
   - Le rôle et l'adresse serviront aux règles d'accès ; ils ne restreignent encore rien.
   - Une liste peut être collée depuis un tableur ; les pages de saisie existantes peuvent être reprises.
   ===================================================================== */
(function () {
  "use strict";
  const S = window.Socle, R = window.Repartition;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  let config = null, general = null, ref = null, agents = null, pages = null;
  let edition = null;       // agent en cours de modification : { id|null, nom, email, role, telephone, perimetre, actif }
  let racine = null;

  const table = () => general.agents || "Agents";
  const maintenant = () => Date.now() / 1000;
  const roleDef = id => S.ROLES_AGENT.find(r => r.id === id);

  async function charger() {
    config = await S.lireConfig();
    general = S.general(config);
    ref = await R.lireReferentiel(general, config);
    agents = await R.lireAgents(general, ref);
    pages = await R.lirePages();
  }

  /* ---------- Rendu ---------- */
  function dessiner() {
    if (!config) { racine.innerHTML = `<div class="bandeau alerte">La table Config est absente : lancez d'abord l'installation.</div>`; return; }
    if (agents === null) {
      racine.innerHTML = `<div class="bandeau info">La table ${esc(table())} n'existe pas encore.</div>
        <section class="carte"><h2>Équipe de la cellule</h2>
        <p class="aide">Une ligne par agent : nom, adresse, rôle, téléphone et périmètre. L'équipe sert à créer les pages de saisie et servira aux règles d'accès, au suivi des actions et au planning.</p>
        <div class="boutons"><button class="primaire" id="eq-creer-table">Créer la table ${esc(table())}</button><span class="statut" id="eq-statut"></span></div></section>`;
      $("eq-creer-table").addEventListener("click", creerTable);
      return;
    }
    racine.innerHTML = `${carteEquipe()}${edition ? carteFiche() : ""}${carteImport()}`;
    lier();
  }

  function carteEquipe() {
    const crit = R.criteres(ref, config);
    const actifs = agents.filter(a => a.actif);
    // couverture sur le premier critère, pour les agents de saisie
    const c0 = crit[0], vals0 = c0 ? ref.valeurs[c0].map(x => x.v) : [];
    const saisie = actifs.filter(a => a.role === "Saisie" || a.role === "Coordination");
    const parVal = new Map(vals0.map(v => [v, saisie.filter(a => (a.perimetre[c0] || []).includes(v)).map(a => a.nom)]));
    const sansAgent = saisie.length && !saisie.some(a => !(a.perimetre[c0] || []).length) ? vals0.filter(v => !parVal.get(v).length) : [];
    const partagees = vals0.filter(v => parVal.get(v).length > 1);
    // pages de saisie : agent retrouvé, ou page orpheline à reprendre
    const pageDe = new Map(), orphelines = [];
    (pages || []).forEach(p => { const a = R.agentDePage(p, agents); if (a) { if (!pageDe.has(a.id)) pageDe.set(a.id, []); pageDe.get(a.id).push(p); } else if (p.libelle || /^Formulaire\s+\S/i.test(p.page)) orphelines.push(p); });
    const lignes = agents.map(a => {
      const pg = pageDe.get(a.id) || [];
      const ecart = pg.some(p => !R.memePerimetre(R.perimetreObjet(ref, p.perimetre), a.perimetre));
      const pageTxt = !pg.length ? `<span class="vide">—</span>` : `${pg.map(p => esc(p.page)).join("<br>")}${ecart ? `<br><span class="pastille manque">périmètre à reporter</span>` : ""}`;
      const role = roleDef(a.role);
      return `<tr data-id="${a.id}" class="eq-ligne${a.actif ? "" : " inactif"}" tabindex="0">
        <td><strong>${esc(a.nom) || "<em>sans nom</em>"}</strong>${a.actif ? "" : ` <span class="pastille">inactif</span>`}</td>
        <td>${role ? `<span class="pastille reco">${esc(role.libelle)}</span>` : `<span class="pastille manque">${esc(a.role || "rôle ?")}</span>`}</td>
        <td>${a.email ? esc(a.email) : `<span class="pastille manque">adresse manquante</span>`}${a.telephone ? `<br><small>${esc(a.telephone)}</small>` : ""}</td>
        <td>${esc(R.resumePerimetre(a.perimetre)) || `<span class="vide">tous les établissements</span>`}</td>
        <td>${pageTxt}</td></tr>`;
    }).join("");
    const parRole = S.ROLES_AGENT.map(r => `${actifs.filter(a => a.role === r.id).length} ${r.libelle.toLowerCase()}`).join(" · ");
    return `<section class="carte"><h2>Équipe de la cellule</h2>
      <p class="aide">Une ligne par agent. Le périmètre limite la page de saisie de l'agent (créée depuis l'onglet Formulaires) : la liste des dossiers et la recherche d'établissements s'y restreignent. L'adresse et le rôle serviront aux règles d'accès ; ils ne restreignent encore rien.</p>
      <div class="eq-criteres"><span class="eq-lib">Périmètres définis selon</span>
        ${crit.map(c => `<span class="crit">${esc(R.libelleCritere(ref, c))}<button type="button" data-crit-retirer="${esc(c)}" title="Retirer ce critère" aria-label="Retirer ${esc(R.libelleCritere(ref, c))}">×</button></span>`).join("") || `<span class="vide">aucun critère : chaque agent couvre tous les établissements</span>`}
        ${(() => { const aj = R.criteresAjoutables(ref, config); return aj.length ? `<select id="eq-crit-ajouter" aria-label="Ajouter un critère"><option value="">+ critère…</option>${aj.map(c => `<option value="${esc(c)}">${esc(R.libelleCritere(ref, c))} (${ref.valeurs[c].length})</option>`).join("")}</select>` : ""; })()}</div>
      ${ref.absent ? `<p class="avert">Le référentiel « ${esc(ref.table)} » est introuvable : terminez l'installation pour définir des périmètres.</p>` : ""}
      ${ref.erreur ? `<p class="avert">Référentiel illisible : ${esc(ref.erreur)}</p>` : ""}
      ${agents.length ? `<table class="eq-table"><thead><tr><th>Agent</th><th>Rôle</th><th>Contact</th><th>Périmètre</th><th>Page de saisie</th></tr></thead><tbody>${lignes}</tbody></table>
        <p class="aide" style="margin:6px 0 0">${actifs.length} agent${actifs.length > 1 ? "s" : ""} actif${actifs.length > 1 ? "s" : ""} : ${parRole}. Cliquez sur une ligne pour la modifier.</p>`
        : `<p class="vide">Aucun agent pour l'instant.</p>`}
      ${sansAgent.length ? `<p class="avert">${esc(R.libelleCritere(ref, c0))} sans agent de saisie : ${sansAgent.map(esc).join(", ")}.</p>` : ""}
      ${partagees.length ? `<p class="aide">Suivies par plusieurs agents : ${partagees.map(v => `${esc(v)} (${parVal.get(v).map(esc).join(", ")})`).join(" ; ")}.</p>` : ""}
      ${orphelines.length ? `<div class="eq-reprise"><strong>Pages de saisie sans agent dans l'équipe</strong>
        <ul>${orphelines.map(p => `<li>${esc(p.page)}</li>`).join("")}</ul>
        <button class="secondaire" id="eq-reprendre">Ajouter ces agents à l'équipe (nom et périmètre repris des pages)</button></div>` : ""}
      <div class="boutons"><button class="primaire" id="eq-ajouter">+ Ajouter un agent</button><span class="statut" id="eq-statut"></span></div></section>`;
  }

  function carteFiche() {
    const a = edition, crit = R.criteres(ref, config);
    const horsCriteres = Object.keys(R.nettoyer(a.perimetre)).filter(c => !crit.includes(c));
    return `<section class="carte" id="eq-fiche"><h2>${a.id ? `Modifier « ${esc(a.nom)} »` : "Nouvel agent"}</h2>
      <div class="grille">
        <label class="champ"><span>Nom</span><small>Prénom ou prénom et nom : il donne son nom à la page de saisie.</small><input type="text" id="eq-nom" value="${esc(a.nom)}" autocomplete="off"></label>
        <label class="champ"><span>Adresse électronique</span><small>Celle du compte Grist de l'agent : elle servira aux règles d'accès.</small><input type="text" id="eq-email" value="${esc(a.email)}" autocomplete="off" spellcheck="false"></label>
        <label class="champ"><span>Téléphone</span><small>Facultatif.</small><input type="text" id="eq-tel" value="${esc(a.telephone)}" autocomplete="off"></label>
        <label class="champ"><span>Statut</span><small>Un agent inactif garde son historique mais n'a plus de page à créer.</small>
          <span class="eq-case"><input type="checkbox" id="eq-actif"${a.actif ? " checked" : ""}> Actif</span></label>
      </div>
      <div class="champ"><span class="eq-lib">Rôle</span>
        ${S.ROLES_AGENT.map(r => `<label class="eq-role"><input type="radio" name="eq-role" value="${esc(r.id)}"${a.role === r.id ? " checked" : ""}> <strong>${esc(r.libelle)}</strong> — ${esc(r.detail)}</label>`).join("")}</div>
      <div class="champ"><span class="eq-lib">Périmètre</span>
        ${crit.length ? crit.map(c => `<div class="eq-crit-lib">${esc(R.libelleCritere(ref, c))}</div><div class="eq-puces">${ref.valeurs[c].map(x => {
          const on = (a.perimetre[c] || []).includes(x.v);
          return `<button type="button" class="eq-puce${on ? " on" : ""}" data-col="${esc(c)}" data-val="${esc(x.v)}" aria-pressed="${on}" title="${x.n} établissement(s)">${esc(x.v)}</button>`;
        }).join("")}</div>`).join("") : `<p class="vide">Aucun critère de répartition : ajoutez-en un dans la carte « Équipe de la cellule ».</p>`}
        ${horsCriteres.length ? `<p class="aide">Aussi limité par : ${horsCriteres.map(c => `${esc(R.libelleCritere(ref, c))} = ${esc(a.perimetre[c].join(", "))}`).join(" ; ")}</p>` : ""}
        <p class="aide" id="eq-resume">${resumeFiche()}</p></div>
      <div class="boutons"><button class="primaire" id="eq-enregistrer">${a.id ? "Enregistrer" : "Ajouter à l'équipe"}</button>
        <button class="secondaire" id="eq-annuler">Annuler</button>
        ${a.id ? `<button class="secondaire danger" id="eq-supprimer">Retirer de l'équipe…</button>` : ""}
        <span class="statut" id="eq-fiche-statut" role="status"></span></div></section>`;
  }
  const resumeFiche = () => {
    const r = R.resumePerimetre(edition.perimetre);
    return `${r ? `Périmètre : ${esc(r)}.` : "Aucune valeur cochée : tous les établissements."} Page de saisie : « ${esc(R.nomPage(edition.nom || "…", edition.perimetre))} ».`;
  };

  function carteImport() {
    return `<section class="carte"><details id="eq-import"><summary><strong>Importer une liste d'agents</strong></summary>
      <p class="aide">Une ligne par agent : <code>Nom ; adresse ; rôle ; téléphone</code>. Un copier-coller depuis un tableur (colonnes dans cet ordre) convient aussi. Un agent déjà présent (même adresse, sinon même nom) est mis à jour ; le rôle vaut « Saisie » s'il n'est pas reconnu. Le périmètre se règle ensuite agent par agent.</p>
      <textarea id="eq-liste" rows="6" placeholder="Alice Martin ; alice.martin@education.gouv.fr ; Saisie ; 01 23 45 67 89&#10;Bruno Petit ; bruno.petit@education.gouv.fr ; Coordination"></textarea>
      <div class="boutons"><button class="secondaire" id="eq-analyser">Vérifier</button><button class="primaire" id="eq-importer" disabled>Importer</button><span class="statut" id="eq-import-statut" role="status"></span></div>
      <div id="eq-import-bilan"></div></details></section>`;
  }

  /* ---------- Événements ---------- */
  function lier() {
    racine.querySelectorAll(".eq-ligne").forEach(tr => {
      const ouvrir = () => { const a = agents.find(x => x.id === +tr.dataset.id); if (a) { edition = JSON.parse(JSON.stringify(a)); dessiner(); $("eq-fiche").scrollIntoView({ block: "nearest" }); $("eq-nom").focus(); } };
      tr.addEventListener("click", ouvrir);
      tr.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ouvrir(); } });
    });
    $("eq-ajouter").addEventListener("click", () => {
      edition = { id: null, nom: "", email: "", role: "Saisie", telephone: "", perimetre: {}, actif: true };
      dessiner(); $("eq-fiche").scrollIntoView({ block: "nearest" }); $("eq-nom").focus();
    });
    const sel = $("eq-crit-ajouter");
    if (sel) sel.addEventListener("change", async () => { if (!sel.value) return; await changerCriteres([...R.criteres(ref, config), sel.value]); });
    racine.querySelectorAll("[data-crit-retirer]").forEach(b => b.addEventListener("click", async () => {
      const c = b.dataset.critRetirer, n = agents.filter(a => (a.perimetre[c] || []).length).length;
      if (n && !confirm(`${n} agent(s) ont un périmètre fondé sur « ${R.libelleCritere(ref, c)} ». Le critère ne sera plus proposé, mais leur périmètre reste inchangé tant que vous ne le modifiez pas. Continuer ?`)) return;
      await changerCriteres(R.criteres(ref, config).filter(k => k !== c));
    }));
    if ($("eq-reprendre")) $("eq-reprendre").addEventListener("click", reprendrePages);
    if (edition) lierFiche();
    $("eq-analyser").addEventListener("click", () => analyserListe(false));
    $("eq-importer").addEventListener("click", () => analyserListe(true));
    $("eq-liste").addEventListener("input", () => { $("eq-importer").disabled = true; $("eq-import-bilan").innerHTML = ""; });
  }
  async function changerCriteres(liste) {
    try { config = await R.enregistrerCriteres(config, liste); } catch (e) { dire("eq-statut", `Critères non enregistrés : ${e.message || e}`, true); return; }
    dessiner();
  }
  function lierFiche() {
    const lireChamps = () => {
      edition.nom = $("eq-nom").value; edition.email = $("eq-email").value.trim(); edition.telephone = $("eq-tel").value.trim();
      edition.actif = $("eq-actif").checked;
      const r = racine.querySelector('input[name="eq-role"]:checked'); edition.role = r ? r.value : edition.role;
    };
    ["eq-nom", "eq-email", "eq-tel", "eq-actif"].forEach(id => $(id).addEventListener("input", () => { lireChamps(); $("eq-resume").innerHTML = resumeFiche(); }));
    racine.querySelectorAll('input[name="eq-role"]').forEach(x => x.addEventListener("change", lireChamps));
    racine.querySelectorAll(".eq-puce").forEach(b => b.addEventListener("click", () => {
      const c = b.dataset.col, v = b.dataset.val, liste = edition.perimetre[c] || [];
      edition.perimetre[c] = liste.includes(v) ? liste.filter(x => x !== v) : [...liste, v];
      if (!edition.perimetre[c].length) delete edition.perimetre[c];
      const on = (edition.perimetre[c] || []).includes(v);
      b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on));
      $("eq-resume").innerHTML = resumeFiche();
    }));
    $("eq-annuler").addEventListener("click", () => { edition = null; dessiner(); });
    $("eq-enregistrer").addEventListener("click", () => { lireChamps(); enregistrer(); });
    if ($("eq-supprimer")) $("eq-supprimer").addEventListener("click", supprimer);
    $("eq-fiche").addEventListener("keydown", e => { if (e.key === "Escape") { edition = null; dessiner(); } });
  }
  const dire = (id, t, err) => { const st = $(id); if (st) { st.textContent = t; st.className = `statut${err ? " err" : " ok"}`; } };

  /* ---------- Écritures ---------- */
  const champs = a => ({ Nom: a.nom.trim(), Email: a.email.trim(), Role: a.role, Telephone: a.telephone.trim(),
    Perimetre: JSON.stringify(R.nettoyer(a.perimetre)), Actif: !!a.actif, Modifie_le: maintenant() });
  async function enregistrer() {
    const a = edition, nom = a.nom.trim();
    if (!nom) { dire("eq-fiche-statut", "Indiquez le nom de l'agent.", true); $("eq-nom").focus(); return; }
    if (agents.some(x => x.id !== a.id && S.norm(x.nom) === S.norm(nom))) { dire("eq-fiche-statut", `Un agent s'appelle déjà « ${nom} » : ajoutez l'initiale du nom pour distinguer les pages.`, true); $("eq-nom").focus(); return; }
    if (a.email && !EMAIL.test(a.email)) { dire("eq-fiche-statut", "L'adresse électronique n'est pas valide.", true); $("eq-email").focus(); return; }
    if (a.email && agents.some(x => x.id !== a.id && x.email.toLowerCase() === a.email.toLowerCase())) { dire("eq-fiche-statut", "Cette adresse est déjà celle d'un autre agent.", true); $("eq-email").focus(); return; }
    try {
      await grist.docApi.applyUserActions([a.id ? ["UpdateRecord", table(), a.id, champs(a)] : ["AddRecord", table(), null, champs(a)]]);
      const ancien = a.id && agents.find(x => x.id === a.id);
      const aReporter = ancien && (ancien.nom !== nom || !R.memePerimetre(ancien.perimetre, a.perimetre));
      edition = null; await charger(); dessiner();
      dire("eq-statut", `« ${nom} » ${a.id ? "enregistré" : "ajouté à l'équipe"}.${aReporter ? " Pour reporter le nom ou le périmètre sur sa page de saisie : onglet Formulaires, « Créer et mettre à jour les pages »." : ""}${a.email ? "" : " Pensez à son adresse électronique."}`);
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
    if (!etape) { await charger(); dessiner(); return; }
    const [r] = await S.appliquer([etape]);
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
      nouveaux.push({ nom, email: "", role: "Saisie", telephone: "", perimetre: R.perimetreObjet(ref, p.perimetre), actif: true });
    }
    if (!nouveaux.length) return;
    try {
      await grist.docApi.applyUserActions(nouveaux.map(a => ["AddRecord", table(), null, champs(a)]));
      await charger(); dessiner();
      dire("eq-statut", `${nouveaux.length} agent(s) ajouté(s) : ${nouveaux.map(a => a.nom).join(", ")}. Complétez leur adresse électronique.`);
    } catch (e) { dire("eq-statut", `Ajout refusé par Grist (${e.message || e}).`, true); }
  }

  /* ---------- Import d'une liste ---------- */
  function roleDepuis(t) {
    const n = S.norm(t);
    if (!n) return null;
    if (/^coord|^pilot|^chef|^respons/.test(n)) return "Coordination";
    if (/^lect|^consult|^obs/.test(n)) return "Lecture";
    if (/^sais|^oper|^agent|^redact/.test(n)) return "Saisie";
    return null;
  }
  async function analyserListe(importer) {
    const lignes = $("eq-liste").value.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const lus = [], erreurs = [];
    lignes.forEach((l, i) => {
      const morceaux = (l.includes("\t") ? l.split("\t") : l.split(/\s*[;|]\s*/)).map(x => x.trim());
      let [nom, email = "", role = "", telephone = ""] = morceaux;
      // tolère l'ordre « adresse ; nom »
      if (EMAIL.test(nom) && email && !EMAIL.test(email)) [nom, email] = [email, nom];
      if (/^nom$/i.test(nom)) return;   // ligne d'en-tête
      if (!nom) { erreurs.push(`ligne ${i + 1} : nom manquant`); return; }
      if (email && !EMAIL.test(email)) { erreurs.push(`ligne ${i + 1} : adresse « ${email} » invalide`); return; }
      lus.push({ nom, email, role: roleDepuis(role), roleTexte: role, telephone });
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
      ${lus.filter(x => x.roleTexte && !x.role).map(x => `<li>Rôle « ${esc(x.roleTexte)} » non reconnu pour ${esc(x.nom)} : Saisie retenu.</li>`).join("")}
      ${erreurs.map(e => `<li class="err">${esc(e)}</li>`).join("")}</ul>`;
    $("eq-importer").disabled = !!erreurs.length || !(ajouts.length + majs.length);
    if (!importer || erreurs.length) return;
    const acts = [
      ...ajouts.map(x => ["AddRecord", table(), null, champs({ ...x, role: x.role || "Saisie", perimetre: {}, actif: true })]),
      ...majs.map(({ a, x }) => ["UpdateRecord", table(), a.id, { Nom: x.nom, ...(x.email ? { Email: x.email } : {}), ...(x.role ? { Role: x.role } : {}), ...(x.telephone ? { Telephone: x.telephone } : {}), Modifie_le: maintenant() }]),
    ];
    try {
      await grist.docApi.applyUserActions(acts);
      await charger(); dessiner();
      dire("eq-statut", `${ajouts.length} agent(s) ajouté(s), ${majs.length} mis à jour. Réglez maintenant le périmètre de chacun.`);
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
