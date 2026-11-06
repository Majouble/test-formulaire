/* =====================================================================
   Administration v2 — onglet « Validation » : circuit de visa des signalements (2.41)
   ---------------------------------------------------------------------
   - Par table de réponses : circuit actif ou non, échelons (département puis académie, ou académie seule),
     question d'avis de chaque échelon (question à choix des parties « Visa départemental » et « Visa académique »
     du formulaire), valeurs qui valident ; enregistré dans la clé « validation » de Config.
   - Colonne formule Statut_validation sur la table des réponses : À viser (département), À viser (académie),
     À revoir, Validé — calculée sur la dernière version de chaque dossier (une mise à jour repart dans la file).
   - Viseurs : agents de l'équipe (compte Grist ou lien d'invité) avec un échelon et un périmètre de visa
     (départements ou académies, colonnes Agents.Echelon_visa, Visa_departements, Visa_academies).
   - Suivi : dossiers par statut et par académie ; départements et académies sans viseur pour les dossiers en attente.
   Les règles d'accès (onglet Accès) réservent ensuite chaque avis à son échelon et à son périmètre.
   ===================================================================== */
(function () {
  "use strict";
  const S = window.Socle,
    R = window.Repartition;
  const $ = (id) => document.getElementById(id);
  const esc = (s) =>
    String(s == null ? "" : s).replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  const nf = (n) => Number(n || 0).toLocaleString("fr-FR");
  const PARTIES_DEFAUT = [
    { id: "q", role: "q" },
    { id: "vd", role: "vd" },
    { id: "va", role: "va" },
  ];

  let config, general, meta, formulaires, agentsT, ref, espaces, racine;
  const brouillons = {}; // réglage en cours de modification, par table

  /* ---------- Lecture ---------- */
  async function charger() {
    config = await S.lireConfig();
    general = S.general(config);
    meta = await S.lireMeta();
    formulaires = await R.lireFormulairesPublies(general);
    try {
      agentsT = await grist.docApi.fetchTable(general.agents);
    } catch (_) {
      agentsT = null;
    }
    ref = await R.lireReferentiel(general, config).catch(() => null);
    espaces = [];
    for (const e of S.espaces(general)) {
      if (!meta[e.reponses]) continue;
      const assoc =
        e.reponses === general.reponses ? (config && config.valeurs.roles && config.valeurs.roles.reponses) || {} : {};
      const roles = S.resoudreRoles(
        "reponses",
        meta[e.reponses],
        { reponses: e.reponses, referentiel: e.referentiel },
        assoc,
        {},
      );
      const cols = Object.fromEntries(
        Object.entries(roles)
          .filter(([, r]) => r.col)
          .map(([k, r]) => [k, r.col]),
      );
      let t = null;
      try {
        t = await grist.docApi.fetchTable(e.reponses);
      } catch (_) {
        t = null;
      }
      espaces.push({ ...e, cols, t, candidats: candidatsAvis(e.reponses) });
    }
  }
  // Questions à choix des parties de visa des formulaires publiés sur la table : { vd: [colId], va: [colId] }
  function candidatsAvis(table) {
    const out = { vd: new Set(), va: new Set() },
      cols = meta[table].colonnes;
    for (const f of formulaires.filter((x) => x.table === table)) {
      const parties = Array.isArray(f.conf.parties) && f.conf.parties.length ? f.conf.parties : PARTIES_DEFAUT;
      (f.conf.blocs || []).forEach((b) => {
        const p = parties.find((x) => x.id === (b.section || "q")),
          c = b.colonne && cols[b.colonne];
        if (
          p &&
          (p.role === "vd" || p.role === "va") &&
          c &&
          /^(Choice|ChoiceList)$/.test(String(c.type).split(":")[0]) &&
          !c.isFormula
        )
          out[p.role].add(b.colonne);
      });
    }
    return { vd: [...out.vd], va: [...out.va] };
  }
  const choixDe = (table, colId) => {
    const c = meta[table] && meta[table].colonnes[colId];
    let o = {};
    try {
      o = c && c.widgetOptions ? JSON.parse(c.widgetOptions) : {};
    } catch (_) {
      o = {};
    }
    return Array.isArray(o.choices) ? o.choices.map(String) : [];
  };
  const libelle = (table, colId) => {
    const c = meta[table] && meta[table].colonnes[colId];
    return (c && c.label) || colId;
  };

  // Réglage enregistré (ou proposé) d'une table
  function reglage(e) {
    if (brouillons[e.reponses]) return brouillons[e.reponses];
    const enr =
      (config &&
        config.valeurs.validation &&
        config.valeurs.validation.tables &&
        config.valeurs.validation.tables[e.reponses]) ||
      null;
    const r = {
      actif: false,
      echelons: e.candidats.vd.length ? "dep_aca" : "aca",
      verdict_dep: e.candidats.vd[0] || "",
      verdict_aca: e.candidats.va[0] || "",
      favorables: [],
      aca_vise_dep: true,
      colonne: S.COLONNE_STATUT,
      ...(enr || {}),
    };
    if (!enr)
      r.favorables = [
        ...new Set([...choixDe(e.reponses, r.verdict_dep), ...choixDe(e.reponses, r.verdict_aca)]),
      ].filter(S.estFavorable);
    return r;
  }
  // Viseurs : [{ id, nom, email, invite, actif, echelon, departements, academies }]
  function viseurs() {
    if (!agentsT) return [];
    const v = (k, i) => (agentsT[k] || [])[i];
    return agentsT.id
      .map((id, i) => ({
        id,
        nom: String(v("Nom", i) || "").trim() || `Agent n° ${id}`,
        email: String(v("Email", i) || "").trim(),
        invite: !!String(v(S.INVITE.cle, i) || "").trim(),
        actif: v("Actif", i) !== false,
        echelon: String(v("Echelon_visa", i) || ""),
        departements: S.listeChoix(v("Visa_departements", i)),
        academies: S.listeChoix(v("Visa_academies", i)),
      }))
      .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  }
  const colonnesViseursManquantes = () =>
    !meta[general.agents] ? [] : S.COLONNES_VISEURS.filter((c) => !meta[general.agents].colonnes[c.id]);
  const valeursRef = (role) => {
    const c = ref && ref.roles && ref.roles[role];
    return c && ref.valeurs && ref.valeurs[c] ? ref.valeurs[c].map((x) => x.v) : [];
  };

  // Dossiers (dernières versions) : [{ statut, dep, aca }] ; academie / departement lus sur la table (colonnes de l'établissement)
  function dossiers(e, r) {
    const t = e.t;
    if (!t) return [];
    const colStatut = r.colonne,
      dv = e.cols.Derniere_version;
    if (!t[colStatut]) return [];
    return t.id
      .map((_, i) => i)
      .filter((i) => !dv || t[dv][i] === true)
      .map((i) => ({
        statut: String(t[colStatut][i] || ""),
        dep: String((t.Departement || [])[i] || ""),
        aca: String((t.Academie || [])[i] || ""),
      }))
      .filter((x) => x.statut);
  }

  /* ---------- Rendu ---------- */
  function dessiner() {
    if (!config) {
      racine.innerHTML = `<div class="bandeau alerte">La table Config est absente : lancez d'abord l'installation.</div>`;
      return;
    }
    if (!espaces.length) {
      racine.innerHTML = `<div class="bandeau info">Aucune table de réponses : lancez d'abord l'installation.</div>`;
      return;
    }
    racine.innerHTML = `<div class="bandeau info">Chaque signalement suit le circuit : visa départemental, puis visa académique, puis remontée au niveau national. Le niveau national voit tous les dossiers, avec leur statut.</div>
      ${espaces.map(carteCircuit).join("")}${carteViseurs()}`;
    lier();
  }

  function carteCircuit(e, k) {
    const r = reglage(e),
      T = e.reponses,
      cand = e.candidats;
    const optionsAvis = (liste, choisi) =>
      (liste.length ? "" : `<option value="">— aucune question de visa —</option>`) +
      liste
        .map((c) => `<option value="${esc(c)}"${c === choisi ? " selected" : ""}>${esc(libelle(T, c))}</option>`)
        .join("");
    const valeurs = [
      ...new Set([...(r.echelons === "dep_aca" ? choixDe(T, r.verdict_dep) : []), ...choixDe(T, r.verdict_aca)]),
    ];
    const colOk = meta[T].colonnes[r.colonne],
      enr = config.valeurs.validation && config.valeurs.validation.tables && config.valeurs.validation.tables[T];
    const formuleAttendue = S.formuleStatutValidation(r, e.cols);
    const aJour = colOk && colOk.isFormula && String(colOk.formula).trim() === formuleAttendue.trim();
    const sansQuestion = !cand.va.length || (r.echelons === "dep_aca" && !cand.vd.length);
    const sansColEtab = !meta[T].colonnes.Departement || !meta[T].colonnes.Academie;
    const etat =
      !enr || !enr.actif
        ? `<span class="pastille">inactif</span>`
        : aJour
          ? `<span class="pastille ok">actif</span> colonne <code>${esc(r.colonne)}</code> à jour`
          : `<span class="pastille manque">à enregistrer</span> la colonne <code>${esc(r.colonne)}</code> ${colOk ? "ne suit pas le réglage" : "n'existe pas encore"}`;
    return `<section class="carte" data-table="${esc(T)}"><h2>Circuit de validation — ${esc(e.libelle)} <small>(table ${esc(T)})</small></h2>
      <p class="aide">${etat}</p>
      ${sansQuestion ? `<p class="avert">Il manque une question d'avis${!cand.va.length ? " dans la partie « Visa académique »" : ""}${r.echelons === "dep_aca" && !cand.vd.length ? `${!cand.va.length ? " et" : ""} dans la partie « Visa départemental »` : ""} du formulaire : ajoutez une question à choix (Favorable, À revoir…) dans l'onglet Formulaires, puis publiez.</p>` : ""}
      <label class="va-case"><input type="checkbox" data-v="actif"${r.actif ? " checked" : ""}> Activer le circuit de validation pour cette table</label>
      <div class="grille">
        <label class="champ"><span>Échelons</span><select data-v="echelons">
          <option value="dep_aca"${r.echelons === "dep_aca" ? " selected" : ""}>Département, puis académie</option>
          <option value="aca"${r.echelons === "aca" ? " selected" : ""}>Académie seulement</option></select></label>
        <label class="champ"${r.echelons === "aca" ? " hidden" : ""}><span>Avis départemental</span><select data-v="verdict_dep">${optionsAvis(cand.vd, r.verdict_dep)}</select>
          <small>Question à choix de la partie « Visa départemental ».</small></label>
        <label class="champ"><span>Avis académique</span><select data-v="verdict_aca">${optionsAvis(cand.va, r.verdict_aca)}</select>
          <small>Question à choix de la partie « Visa académique ».</small></label>
        <div class="champ"><span class="va-titre">Réponses qui valident</span>
          ${
            valeurs.length
              ? valeurs
                  .map(
                    (v) =>
                      `<label class="va-case"><input type="checkbox" data-fav="${esc(v)}"${r.favorables.includes(v) ? " checked" : ""}> ${esc(v)}</label>`,
                  )
                  .join("")
              : `<span class="vide">Choisissez d'abord les questions d'avis.</span>`
          }
          <small>Toute autre réponse renvoie le dossier en « À revoir ».</small></div>
      </div>
      ${r.echelons === "dep_aca" ? `<label class="va-case"><input type="checkbox" data-v="aca_vise_dep"${r.aca_vise_dep ? " checked" : ""}> Un viseur académique peut aussi poser l'avis départemental (département sans viseur, absence…)</label>` : ""}
      ${sansColEtab ? `<p class="avert">Colonnes Departement et Academie absentes de ${esc(T)} : le périmètre des viseurs ne pourra pas être contrôlé. Onglet Installation, « Ajouter à ${esc(T)} les colonnes de l'établissement ».</p>` : ""}
      <div class="boutons"><button class="primaire" data-act="enregistrer" data-k="${k}">${r.actif ? "Enregistrer et mettre à jour la colonne de statut" : "Enregistrer"}</button>
        <span class="statut" id="va-statut-${k}" role="status"></span></div>
      ${enr && enr.actif && colOk ? suivi(e, r) : ""}
    </section>`;
  }

  function suivi(e, r) {
    const ds = dossiers(e, r);
    if (!ds.length)
      return `<div class="groupe">Suivi</div><p class="vide">Aucun dossier pour l'instant${e.t && !e.t[r.colonne] ? " (statut pas encore calculé par Grist : rechargez dans un instant)" : ""}.</p>`;
    const statuts = S.STATUTS_VALIDATION.map((s) => s.nom),
      parAca = new Map();
    ds.forEach((d) => {
      const a = d.aca || "(sans académie)";
      if (!parAca.has(a)) parAca.set(a, {});
      const m = parAca.get(a);
      m[d.statut] = (m[d.statut] || 0) + 1;
    });
    const total = {};
    ds.forEach((d) => {
      total[d.statut] = (total[d.statut] || 0) + 1;
    });
    const cellule = (m, s) => {
      const n = m[s] || 0,
        st = S.STATUTS_VALIDATION.find((x) => x.nom === s);
      return `<td class="va-n">${n ? `<span class="va-pastille" style="background:${st.fond};color:${st.texte}">${nf(n)}</span>` : "·"}</td>`;
    };
    const lignes = [...parAca.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], "fr"))
      .map(([a, m]) => `<tr><td>${esc(a)}</td>${statuts.map((s) => cellule(m, s)).join("")}</tr>`)
      .join("");
    // couverture : départements et académies qui ont des dossiers en attente sans viseur
    const vs = viseurs().filter((v) => v.actif && v.echelon),
      trous = [];
    const attente = (s, cle) => {
      const m = new Map();
      ds.filter((d) => d.statut === s).forEach((d) => {
        const k = cle(d);
        m.set(k, { d, n: ((m.get(k) || {}).n || 0) + 1 });
      });
      return m;
    };
    if (r.echelons === "dep_aca")
      for (const [, x] of attente(S.STATUT.dep, (d) => d.dep + "|" + d.aca))
        if (!vs.some((v) => S.viseurCouvre(v, "dep", x.d.dep, x.d.aca, r)))
          trous.push(
            `${esc(x.d.dep || "(département inconnu)")} (${esc(x.d.aca || "?")}) : ${nf(x.n)} dossier(s) à viser, aucun viseur départemental`,
          );
    for (const [, x] of attente(S.STATUT.aca, (d) => d.aca))
      if (!vs.some((v) => S.viseurCouvre(v, "aca", x.d.dep, x.d.aca, r)))
        trous.push(`Académie ${esc(x.d.aca || "?")} : ${nf(x.n)} dossier(s) à viser, aucun viseur académique`);
    return `<div class="groupe">Suivi des dossiers (dernière version de chacun)</div>
      <table class="va-table"><thead><tr><th>Académie</th>${statuts.map((s) => `<th>${esc(s)}</th>`).join("")}</tr></thead>
        <tbody>${lignes}</tbody><tfoot><tr><th>Total</th>${statuts.map((s) => cellule(total, s)).join("")}</tr></tfoot></table>
      ${trous.length ? `<p class="avert"><strong>Sans viseur :</strong></p><ul class="journal">${trous.map((t) => `<li class="err">${t}</li>`).join("")}</ul>` : `<p class="aide">Chaque dossier en attente a au moins un viseur.</p>`}`;
  }

  function carteViseurs() {
    const manquantes = colonnesViseursManquantes();
    if (!meta[general.agents])
      return `<section class="carte"><h2>Viseurs</h2><p class="vide">Table ${esc(general.agents)} absente : lancez l'installation.</p></section>`;
    if (manquantes.length)
      return `<section class="carte"><h2>Viseurs</h2>
      <p class="aide">Les viseurs sont des agents de l'équipe (compte Grist, ou lien d'invité pour les services départementaux et académiques sans compte) avec un échelon et un périmètre de visa.</p>
      <div class="boutons"><button class="primaire" data-act="colonnes">Ajouter à ${esc(general.agents)} : ${manquantes.map((c) => c.id).join(", ")}</button><span class="statut" id="va-statut-col" role="status"></span></div></section>`;
    const vs = viseurs(),
      avec = vs.filter((v) => v.echelon),
      sans = vs.filter((v) => !v.echelon && v.actif);
    const deps = valeursRef("Departement"),
      acas = general.academies && general.academies.length ? general.academies : valeursRef("Academie");
    const perimetre = (v) => {
      const dep = v.echelon === "Départemental",
        liste = dep ? v.departements : v.academies,
        cle = dep ? "Visa_departements" : "Visa_academies";
      return `<div class="va-puces">${
        liste.length
          ? liste
              .map(
                (x) =>
                  `<span class="va-puce">${esc(x)} <button type="button" class="lien-btn" data-retirer="${v.id}" data-col="${cle}" data-val="${esc(x)}" aria-label="Retirer ${esc(x)}">×</button></span>`,
              )
              .join("")
          : `<span class="pastille reco">${dep ? "tous les départements" : "toutes les académies"}</span>`
      }
        <input type="text" list="va-dl-${dep ? "dep" : "aca"}" data-ajout="${v.id}" data-col="${cle}" placeholder="+ ${dep ? "département" : "académie"}"></div>`;
    };
    return `<section class="carte"><h2>Viseurs</h2>
      <p class="aide">Agents de l'équipe qui posent les visas : compte Grist, ou lien d'invité (onglet Équipe) pour les services départementaux et académiques sans compte.
        Un viseur ouvre sa page de saisie (Équipe › Pages de saisie) : il y trouve la file des dossiers à viser dans son périmètre. Périmètre vide = tout le document.</p>
      <datalist id="va-dl-dep">${deps.map((x) => `<option value="${esc(x)}">`).join("")}</datalist>
      <datalist id="va-dl-aca">${acas.map((x) => `<option value="${esc(x)}">`).join("")}</datalist>
      ${
        avec.length
          ? `<table class="va-table"><thead><tr><th>Agent</th><th>Accès</th><th>Échelon</th><th>Périmètre de visa</th></tr></thead><tbody>
        ${avec
          .map(
            (
              v,
            ) => `<tr${v.actif ? "" : ' class="va-inactif"'}><td><strong>${esc(v.nom)}</strong>${v.actif ? "" : ' <span class="pastille">inactif</span>'}</td>
          <td>${v.email ? esc(v.email) : v.invite ? `<span class="pastille reco">lien d'invité</span>` : `<span class="pastille manque">ni adresse ni lien</span>`}</td>
          <td><select data-echelon="${v.id}"><option value="">— retirer —</option>${S.ECHELONS_VISA.map((x) => `<option${x === v.echelon ? " selected" : ""}>${x}</option>`).join("")}</select></td>
          <td>${perimetre(v)}</td></tr>`,
          )
          .join("")}</tbody></table>`
          : `<p class="vide">Aucun viseur pour l'instant.</p>`
      }
      <div class="boutons">${
        sans.length
          ? `<select id="va-ajout-agent"><option value="">+ Ajouter un viseur…</option>${sans.map((v) => `<option value="${v.id}">${esc(v.nom)}</option>`).join("")}</select>
        <select id="va-ajout-echelon">${S.ECHELONS_VISA.map((x) => `<option>${x}</option>`).join("")}</select><button class="secondaire" data-act="ajouter">Ajouter</button>`
          : `<span class="aide">Tous les agents actifs sont viseurs, ou l'équipe est vide (onglet Équipe).</span>`
      }
        <span class="statut" id="va-statut-v" role="status"></span></div>
      <p class="aide">Après un changement de viseurs ou de circuit, réappliquez les règles d'accès (onglet Accès) : elles réservent chaque avis à son échelon et à son périmètre.</p>
    </section>`;
  }

  /* ---------- Écritures ---------- */
  const dire = (id, t, err) => {
    const st = $(id);
    if (st) {
      st.textContent = t;
      st.className = `statut${err ? " err" : " ok"}`;
    }
  };
  async function enregistrer(k) {
    const e = espaces[k],
      r = { ...reglage(e) };
    if (r.actif) {
      if (!r.verdict_aca) {
        dire(`va-statut-${k}`, "Choisissez la question d'avis académique.", true);
        return;
      }
      if (r.echelons === "dep_aca" && !r.verdict_dep) {
        dire(`va-statut-${k}`, "Choisissez la question d'avis départemental, ou « Académie seulement ».", true);
        return;
      }
      if (!r.favorables.length) {
        dire(`va-statut-${k}`, "Cochez au moins une réponse qui valide.", true);
        return;
      }
    }
    try {
      const v =
        config.valeurs.validation && typeof config.valeurs.validation === "object" ? config.valeurs.validation : {};
      await S.ecrireConfig("validation", { ...v, tables: { ...(v.tables || {}), [e.reponses]: r } });
      if (r.actif) {
        const formula = S.formuleStatutValidation(r, e.cols),
          wo = S.optionsStatutValidation();
        const c = meta[e.reponses].colonnes[r.colonne];
        await grist.docApi.applyUserActions([
          c
            ? ["ModifyColumn", e.reponses, r.colonne, { type: "Choice", isFormula: true, formula, widgetOptions: wo }]
            : [
                "AddColumn",
                e.reponses,
                r.colonne,
                {
                  type: "Choice",
                  isFormula: true,
                  formula,
                  widgetOptions: wo,
                  label: r.colonne,
                  untieColIdFromLabel: true,
                },
              ],
        ]);
      }
      delete brouillons[e.reponses];
      await recharger();
      dire(
        `va-statut-${k}`,
        r.actif
          ? `Circuit enregistré, colonne ${r.colonne} à jour. Réappliquez les règles d'accès (onglet Accès).`
          : "Circuit désactivé (la colonne de statut est gardée).",
      );
    } catch (err) {
      dire(`va-statut-${k}`, `Échec : ${err.message || err}`, true);
    }
  }
  async function majAgent(id, fields, statutId) {
    try {
      await grist.docApi.applyUserActions([["UpdateRecord", general.agents, id, fields]]);
      await recharger();
      dire(statutId || "va-statut-v", "Enregistré.");
    } catch (err) {
      dire(statutId || "va-statut-v", `Échec : ${err.message || err}`, true);
    }
  }
  const liste = (v, col) => S.listeChoix((agentsT[col] || [])[agentsT.id.indexOf(v)]);

  function lier() {
    racine.querySelectorAll("section[data-table]").forEach((sec, k) => {
      const e = espaces[k];
      const maj = (fn) => {
        const r = { ...reglage(e) };
        fn(r);
        brouillons[e.reponses] = r;
        dessiner();
      };
      sec.querySelectorAll("[data-v]").forEach((el) =>
        el.addEventListener("change", () =>
          maj((r) => {
            const cle = el.dataset.v;
            r[cle] = el.type === "checkbox" ? el.checked : el.value;
            if (cle === "verdict_dep" || cle === "verdict_aca" || cle === "echelons") {
              const valeurs = [
                ...new Set([
                  ...(r.echelons === "dep_aca" ? choixDe(e.reponses, r.verdict_dep) : []),
                  ...choixDe(e.reponses, r.verdict_aca),
                ]),
              ];
              r.favorables = r.favorables.filter((x) => valeurs.includes(x));
              if (!r.favorables.length) r.favorables = valeurs.filter(S.estFavorable);
            }
          }),
        ),
      );
      sec.querySelectorAll("[data-fav]").forEach((el) =>
        el.addEventListener("change", () =>
          maj((r) => {
            r.favorables = el.checked
              ? [...new Set([...r.favorables, el.dataset.fav])]
              : r.favorables.filter((x) => x !== el.dataset.fav);
          }),
        ),
      );
    });
    racine
      .querySelectorAll("[data-act=enregistrer]")
      .forEach((b) => b.addEventListener("click", () => enregistrer(+b.dataset.k)));
    const bc = racine.querySelector("[data-act=colonnes]");
    if (bc)
      bc.addEventListener("click", async () => {
        try {
          await grist.docApi.applyUserActions(
            colonnesViseursManquantes().map((c) => [
              "AddColumn",
              general.agents,
              c.id,
              { type: c.type, isFormula: false, ...(c.widgetOptions ? { widgetOptions: c.widgetOptions } : {}) },
            ]),
          );
          await recharger();
        } catch (err) {
          dire("va-statut-col", `Échec : ${err.message || err}`, true);
        }
      });
    racine.querySelectorAll("[data-echelon]").forEach((s) =>
      s.addEventListener("change", () => {
        const id = +s.dataset.echelon;
        majAgent(
          id,
          s.value ? { Echelon_visa: s.value } : { Echelon_visa: "", Visa_departements: null, Visa_academies: null },
        );
      }),
    );
    racine.querySelectorAll("[data-retirer]").forEach((b) =>
      b.addEventListener("click", () => {
        const id = +b.dataset.retirer,
          col = b.dataset.col,
          l = liste(id, col).filter((x) => x !== b.dataset.val);
        majAgent(id, { [col]: l.length ? ["L", ...l] : null });
      }),
    );
    racine.querySelectorAll("[data-ajout]").forEach((inp) => {
      const ajouter = () => {
        const id = +inp.dataset.ajout,
          col = inp.dataset.col,
          x = inp.value.trim();
        const options = [...(document.getElementById(inp.getAttribute("list")) || { options: [] }).options].map(
          (o) => o.value,
        );
        if (!x) return;
        if (options.length && !options.includes(x)) {
          dire("va-statut-v", `« ${x} » n'est pas dans le référentiel.`, true);
          return;
        }
        const l = liste(id, col);
        if (l.includes(x)) {
          inp.value = "";
          return;
        }
        majAgent(id, { [col]: ["L", ...l, x] });
      };
      inp.addEventListener("change", ajouter);
      inp.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          ajouter();
        }
      });
    });
    const ba = racine.querySelector("[data-act=ajouter]");
    if (ba)
      ba.addEventListener("click", () => {
        const id = +$("va-ajout-agent").value;
        if (!id) {
          dire("va-statut-v", "Choisissez un agent.", true);
          return;
        }
        majAgent(id, { Echelon_visa: $("va-ajout-echelon").value });
      });
  }

  async function recharger() {
    await charger();
    dessiner();
  }
  async function afficher() {
    racine = $("validation");
    racine.innerHTML = `<div class="bandeau info">Lecture du document…</div>`;
    try {
      await recharger();
    } catch (e) {
      racine.innerHTML = `<div class="bandeau alerte">Lecture impossible : ${esc(e.message || e)}</div>`;
    }
  }
  window.OngletValidation = { afficher };
})();
