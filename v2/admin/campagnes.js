/* =====================================================================
   Administration v2 — onglet « Établissements », carte « Campagnes » (2.41)
   ---------------------------------------------------------------------
   Une campagne sollicite une sélection d'établissements (la sélection du publipostage) et suit leurs réponses :
   - mode « une » : une réponse attendue depuis le lancement ; mode « quotidienne » : une réponse attendue chaque jour ;
   - une réponse = un signalement enregistré (y compris « Rien à signaler », proposé en un clic aux établissements
     par la page des établissements) dans l'une des tables de réponses du référentiel ;
   - suivi par académie et par département, liste des non-répondants, fichier CSV de relance au format du publipostage
     (UAI ; Nom ; Commune ; Mail ; Lien ; Objet ; Message) pour une fusion Word / Outlook ou un flux n8n.
   Clé « campagnes » de Config (voir le socle) ; les établissements la lisent pour afficher la campagne qui les concerne.
   ===================================================================== */
(function () {
  "use strict";
  const R = window.Repartition;
  const { esc, $ } = Outils;
  const nf = (n) => Number(n || 0).toLocaleString("fr-FR");
  const pc = (a, b) => (b ? `${Math.round((100 * a) / b)} %` : "—");
  const MAX_LISTE = 200;
  const RELANCE_DEFAUT = {
    objet: "Relance — {campagne} : {nom}",
    corps:
      "Bonjour,\n\nSauf erreur de notre part, nous n'avons pas encore reçu la réponse de {nom} ({uai}) à la sollicitation « {campagne} ».\n\nMerci de répondre dès que possible par votre espace de signalement, y compris s'il n'y a rien à signaler (bouton « Rien à signaler ») :\n\n{lien}\n\nCordialement,",
  };

  let config, general, meta, formulaires, groupes, racine;
  let projet = null; // campagne en préparation (sélection du publipostage)
  const jours = {}; // jour affiché par campagne quotidienne
  const parDep = {}; // détail par département (au lieu de l'académie)
  const cacheRef = new Map(); // référentiel lu : table -> { t, roles }
  let cacheRep = null; // réponses : table -> Map(etabId -> [saisies])

  /* ---------- Lecture ---------- */
  async function charger() {
    config = await Socle.lireConfig();
    general = Socle.general(config);
    meta = await Socle.lireMeta();
    formulaires = await R.lireFormulairesPublies(general);
    groupes = R.groupesLiens(meta, config, general, formulaires);
    cacheRef.clear();
    cacheRep = null;
  }
  async function referentiel(table) {
    if (cacheRef.has(table)) return cacheRef.get(table);
    const t = await Donnees.lire(table);
    const ref = await R.lireReferentiel({ ...general, referentiel: table }, config).catch(() => ({ roles: {} }));
    const roles = (ref && ref.roles) || {},
      c = (role, d) => roles[role] || (t[d] ? d : null);
    const x = {
      t,
      cols: {
        nom: c("Nom", "Nom"),
        uai: c("UAI", "UAI"),
        commune: c("Commune", "Commune"),
        mail: c("Mail", "Mail"),
        aca: c("Academie", "Academie"),
        dep: c("Departement", "Departement"),
      },
    };
    cacheRef.set(table, x);
    return x;
  }
  // Saisies (date de saisie, à défaut date des faits) de chaque établissement, toutes tables de réponses du référentiel
  async function reponses(table) {
    cacheRep = cacheRep || new Map();
    if (cacheRep.has(table)) return cacheRep.get(table);
    const m = new Map(),
      g = groupes.find((x) => x.table === table),
      lues = new Set();
    for (const f of g ? g.formulaires : []) {
      if (lues.has(f.table)) continue; // plusieurs formulaires sur une même table : lue une fois
      lues.add(f.table);
      let t;
      try {
        t = await Donnees.lire(f.table);
      } catch (_) {
        continue;
      }
      const assoc =
        f.table === general.reponses ? (config && config.valeurs.roles && config.valeurs.roles.reponses) || {} : {};
      const rr = Socle.associerColonnes(
        "reponses",
        meta[f.table],
        { reponses: f.table, referentiel: table },
        assoc,
        {},
      );
      const cree = rr.Cree_le && rr.Cree_le.col,
        faits = rr.Date_faits && rr.Date_faits.col,
        ce = f.colEtab;
      if (!ce || !t[ce]) continue;
      t.id.forEach((_, i) => {
        const e = t[ce][i],
          s = (cree && t[cree][i]) || (faits && t[faits][i]);
        if (!e || s == null || s === "") return;
        if (!m.has(e)) m.set(e, []);
        m.get(e).push(Number(s));
      });
    }
    cacheRep.set(table, m);
    return m;
  }
  const lisible = (v) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v[0] === "C");

  // Établissements visés et état de réponse : { vises: [{ i, id, repondu, derniere }], ref }
  async function etat(c, jour) {
    const ref = await referentiel(c.referentiel),
      rep = await reponses(c.referentiel),
      { t, cols } = ref;
    const besoin = [
      ...new Set([...Object.keys(c.crit || {}), cols.nom, cols.uai, cols.commune, cols.mail].filter(Boolean)),
    ];
    const vises = [];
    t.id.forEach((id, i) => {
      const ligne = {};
      besoin.forEach((k) => {
        ligne[k] = t[k] ? t[k][i] : null;
      });
      if (!Socle.campagneVise(c, ligne, cols)) return;
      const saisies = (rep.get(id) || []).filter((s) => Socle.reponseCompte(c, s, jour));
      vises.push({ i, id, repondu: saisies.length > 0, derniere: saisies.length ? Math.max(...saisies) : null });
    });
    return { vises, ref };
  }

  /* ---------- Rendu ---------- */
  const dateFr = (s) =>
    s
      ? Outils.dates.dateHeure(s, {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";
  const jourFr = (j) => (j ? j.split("-").reverse().join("/") : "");
  const critTexte = (c) => {
    const l = Object.entries(c.crit || {})
      .filter(([, v]) => v && v.length)
      .map(([k, v]) => `${(c.libelles && c.libelles[k]) || k} : ${v.join(", ")}`);
    if (c.recherche) l.push(`recherche « ${c.recherche} »`);
    if (c.avecMail) l.push("avec une adresse");
    return l.length ? l.join(" · ") : "tous les établissements du référentiel";
  };
  function joursCampagne(c) {
    const out = [],
      fin = c.close && c.fin ? c.fin : Date.now() / 1000;
    for (let s = c.debut || fin; s <= fin + 1; s += 86400) {
      const j = Socle.jourParis(s);
      if (!out.includes(j)) out.push(j);
    }
    const auj = Socle.jourParis(fin);
    if (!out.includes(auj)) out.push(auj);
    return out.reverse();
  }

  async function dessiner() {
    if (!racine) return;
    if (!config) {
      racine.innerHTML = "";
      return;
    }
    const liste = Socle.campagnes(config);
    const blocs = [];
    for (const c of liste) {
      try {
        blocs.push(await carteCampagne(c));
      } catch (e) {
        blocs.push(
          `<div class="cp-campagne"><h3>${esc(c.nom)}</h3><p class="avert">Suivi impossible : ${esc(e.message || e)}</p></div>`,
        );
      }
    }
    racine.innerHTML = `<section class="carte" id="cp-carte"><h2>Campagnes</h2>
      <p class="aide">Sollicitez une sélection d'établissements et suivez leurs réponses : choisissez les établissements dans le publipostage ci-dessus, puis « Lancer une campagne sur cette sélection ».
        Les établissements visés voient la campagne sur leur page, avec un bouton « Rien à signaler » qui vaut réponse.</p>
      ${projet ? formulaireProjet() : ""}
      ${blocs.length ? blocs.join("") : projet ? "" : `<p class="vide">Aucune campagne pour l'instant.</p>`}
      <span class="statut" id="cp-statut" role="status"></span></section>`;
    lier();
  }

  function formulaireProjet() {
    const p = projet;
    return `<div class="cp-campagne" id="cp-projet"><h3>Nouvelle campagne</h3>
      <p class="aide"><strong>${nf(p.n)}</strong> établissement(s) de ${esc(p.referentiel)} : ${esc(critTexte(p))}.</p>
      <div class="grille">
        <label class="champ"><span>Nom de la campagne</span><input type="text" id="cp-nom" value="${esc(p.nom)}"></label>
        <label class="champ"><span>Réponse attendue</span><select id="cp-mode">${Object.entries(Socle.MODES_CAMPAGNE)
          .map(([k, v]) => `<option value="${k}"${k === p.mode ? " selected" : ""}>${esc(v)}</option>`)
          .join("")}</select>
          <small>« Chaque jour » : le suivi repart de zéro chaque matin (un dossier par jour).</small></label>
        <label class="champ"><span>Fin (facultatif)</span><input type="date" id="cp-fin" value="${esc(p.fin || "")}"><small>Sans date : jusqu'à la clôture.</small></label>
      </div>
      <details><summary><strong>Message de relance</strong> <small>(repères : {nom}, {uai}, {commune}, {lien}, {campagne}, {situation})</small></summary>
        <label class="champ"><span>Objet</span><input type="text" id="cp-objet" value="${esc(p.message.objet)}"></label>
        <label class="champ"><span>Texte</span><textarea id="cp-corps" rows="8">${esc(p.message.corps)}</textarea></label></details>
      <div class="boutons"><button class="primaire" data-cp="lancer">Lancer la campagne</button><button class="secondaire" data-cp="annuler">Annuler</button></div></div>`;
  }

  async function carteCampagne(c) {
    const quot = c.mode === "quotidienne",
      js = quot ? joursCampagne(c) : [],
      jour = quot ? (jours[c.id] && js.includes(jours[c.id]) ? jours[c.id] : js[0]) : null;
    const { vises, ref } = await etat(c, jour),
      { t, cols } = ref;
    const n = vises.length,
      ok = vises.filter((v) => v.repondu).length,
      sans = vises.filter((v) => !v.repondu);
    const avecLien = sans.filter((v) => lisible((t[R.LIEN.lien] || [])[v.i])).length;
    const enCours = Socle.campagneEnCours(c);
    // ventilation par académie ou par département
    const dep = !!parDep[c.id] && cols.dep,
      cle = dep ? cols.dep : cols.aca,
      groupesV = new Map();
    vises.forEach((v) => {
      const k = (cle && t[cle][v.i]) || "(non renseigné)";
      const g = groupesV.get(k) || { n: 0, ok: 0 };
      g.n++;
      if (v.repondu) g.ok++;
      groupesV.set(k, g);
    });
    const ligneG = ([
      k,
      g,
    ]) => `<tr><td>${esc(k)}</td><td class="va-n">${nf(g.n)}</td><td class="va-n">${nf(g.ok)}</td><td class="va-n">${nf(g.n - g.ok)}</td>
      <td style="min-width:120px"><div class="cp-barre" title="${pc(g.ok, g.n)}"><span style="width:${g.n ? Math.round((100 * g.ok) / g.n) : 0}%"></span></div></td><td class="va-n">${pc(g.ok, g.n)}</td></tr>`;
    const val = (k, i) => (k && t[k] ? String(t[k][i] ?? "") : "");
    return `<div class="cp-campagne" data-id="${esc(c.id)}">
      <div class="cp-tete"><h3>${esc(c.nom)}</h3><span class="pastille ${enCours ? "ok" : ""}">${enCours ? "en cours" : c.close ? "close" : "terminée"}</span>
        <span class="pastille reco">${esc(Socle.MODES_CAMPAGNE[c.mode] || c.mode)}</span>
        <span class="aide">lancée le ${dateFr(c.debut)}${c.fin ? ` · fin le ${jourFr(Socle.jourParis(c.fin))}` : ""}</span></div>
      <p class="aide">${esc(c.referentiel)} : ${esc(critTexte(c))}.</p>
      ${quot ? `<label class="champ" style="max-width:260px"><span>Jour suivi</span><select data-jour="${esc(c.id)}">${js.map((j) => `<option value="${j}"${j === jour ? " selected" : ""}>${jourFr(j)}${j === Socle.jourParis(Date.now() / 1000) ? " (aujourd'hui)" : ""}</option>`).join("")}</select></label>` : ""}
      <p><strong>${nf(ok)}</strong> réponse(s) sur <strong>${nf(n)}</strong> établissement(s) visé(s) — ${pc(ok, n)}${quot ? ` le ${jourFr(jour)}` : ""}.</p>
      <div class="cp-barre" style="max-width:420px"><span style="width:${n ? Math.round((100 * ok) / n) : 0}%"></span></div>
      <table class="va-table"><thead><tr><th>${dep ? "Département" : "Académie"} <button type="button" class="lien-btn" data-dep="${esc(c.id)}">${dep ? "par académie" : cols.dep ? "par département" : ""}</button></th>
        <th class="va-n">Visés</th><th class="va-n">Répondu</th><th class="va-n">Sans réponse</th><th></th><th class="va-n">Taux</th></tr></thead>
        <tbody>${[...groupesV.entries()]
          .sort((a, b) => a[0].localeCompare(b[0], "fr"))
          .map(ligneG)
          .join("")}</tbody></table>
      <details${sans.length && sans.length <= 30 ? " open" : ""}><summary><strong>Sans réponse (${nf(sans.length)})</strong></summary>
        ${
          sans.length
            ? `<table class="va-table"><thead><tr><th>Établissement</th><th>UAI</th><th>Commune</th><th>Adresse</th></tr></thead><tbody>
          ${sans
            .slice(0, MAX_LISTE)
            .map(
              (v) =>
                `<tr><td>${esc(val(cols.nom, v.i))}</td><td>${esc(val(cols.uai, v.i))}</td><td>${esc(val(cols.commune, v.i))}</td><td>${val(cols.mail, v.i) ? esc(val(cols.mail, v.i)) : `<span class="pastille manque">sans adresse</span>`}</td></tr>`,
            )
            .join("")}</tbody></table>
          ${sans.length > MAX_LISTE ? `<p class="aide">${MAX_LISTE} premiers affichés ; le fichier de relance contient les ${nf(avecLien)} qui ont un lien.</p>` : ""}`
            : `<p class="vide">Tous les établissements visés ont répondu.</p>`
        }</details>
      <div class="boutons">
        <button class="primaire" data-cp="relance" data-id="${esc(c.id)}"${avecLien ? "" : " disabled"}>Fichier CSV de relance (${nf(avecLien)})</button>
        <button class="secondaire" data-cp="${c.close ? "rouvrir" : "clore"}" data-id="${esc(c.id)}">${c.close ? "Rouvrir" : "Clore la campagne"}</button>
        <button class="secondaire" data-cp="supprimer" data-id="${esc(c.id)}">Supprimer</button>
        ${sans.length - avecLien > 0 ? `<span class="aide">${nf(sans.length - avecLien)} sans lien (clé manquante) : ils ne sont pas dans le fichier.</span>` : ""}
      </div></div>`;
  }

  /* ---------- Écritures ---------- */
  const dire = (t, err) => {
    const st = $("cp-statut");
    if (st) {
      st.textContent = t;
      st.className = `statut${err ? " err" : " ok"}`;
    }
  };
  async function ecrire(liste) {
    await Socle.ecrireConfig("campagnes", { ...((config && config.valeurs.campagnes) || {}), liste });
    config = await Socle.lireConfig();
  }
  function preparer(sel) {
    const d = new Date();
    projet = {
      ...sel,
      nom: sel.nom || `Sollicitation du ${Outils.dates.date(d)}${general.situation ? ` — ${general.situation}` : ""}`,
      mode: sel.mode || "une",
      fin: sel.fin || "",
      message: { ...RELANCE_DEFAUT },
    };
    dessiner().then(() => {
      const p = $("cp-projet");
      if (p) p.scrollIntoView({ block: "start", behavior: "smooth" });
      const n = $("cp-nom");
      if (n) n.focus({ preventScroll: true });
    });
  }
  async function lancer() {
    const nom = $("cp-nom").value.trim();
    if (!nom) {
      dire("Donnez un nom à la campagne.", true);
      return;
    }
    const fin = $("cp-fin").value ? Date.parse(`${$("cp-fin").value}T23:59:59`) / 1000 : null;
    const c = {
      id: `c${Date.now().toString(36)}`,
      nom,
      referentiel: projet.referentiel,
      crit: projet.crit,
      libelles: projet.libelles,
      recherche: projet.recherche,
      avecMail: projet.avecMail,
      mode: $("cp-mode").value,
      debut: Math.floor(Date.now() / 1000),
      fin,
      close: false,
      message: { objet: $("cp-objet").value, corps: $("cp-corps").value },
    };
    try {
      await ecrire([c, ...Socle.campagnes(config)]);
      projet = null;
      await dessiner();
      dire(`Campagne « ${nom} » lancée. Envoyez le message aux établissements depuis le publipostage.`);
    } catch (e) {
      dire(`Échec : ${e.message || e}`, true);
    }
  }
  async function modifier(id, fn) {
    const liste = Socle.campagnes(config)
      .map((c) => (c.id === id ? fn({ ...c }) : c))
      .filter(Boolean);
    try {
      await ecrire(liste);
      await dessiner();
    } catch (e) {
      dire(`Échec : ${e.message || e}`, true);
    }
  }
  async function relance(id) {
    const c = Socle.campagnes(config).find((x) => x.id === id);
    if (!c) return;
    const quot = c.mode === "quotidienne",
      jour = quot ? jours[c.id] || joursCampagne(c)[0] : null;
    const { vises, ref } = await etat(c, jour),
      { t, cols } = ref;
    const val = (k, i) => (k && t[k] ? String(t[k][i] ?? "") : ""),
      lien = (i) => (lisible((t[R.LIEN.lien] || [])[i]) ? String(t[R.LIEN.lien][i]) : "");
    const remplir = (m, i) =>
      String(m || "").replace(/\{(nom|uai|commune|lien|situation|campagne)\}/g, (_, k) =>
        k === "lien"
          ? lien(i)
          : k === "situation"
            ? general.situation || ""
            : k === "campagne"
              ? c.nom
              : val(cols[k], i),
      );
    const q = (v) => {
      const s = String(v ?? "");
      return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const msg = c.message || RELANCE_DEFAUT,
      lignes = vises.filter((v) => !v.repondu && lien(v.i));
    const texte =
      "﻿" +
      [
        ["UAI", "Nom", "Commune", "Mail", "Lien", "Objet", "Message"].join(";"),
        ...lignes.map((v) =>
          [
            val(cols.uai, v.i),
            val(cols.nom, v.i),
            val(cols.commune, v.i),
            val(cols.mail, v.i),
            lien(v.i),
            remplir(msg.objet, v.i),
            remplir(msg.corps, v.i),
          ]
            .map(q)
            .join(";"),
        ),
      ].join("\r\n") +
      "\r\n";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([texte], { type: "text/csv;charset=utf-8" }));
    a.download = `relance-${Socle.normaliser(c.nom).slice(0, 40)}-${quot ? jour : Socle.jourParis(Date.now() / 1000)}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1500);
    dire(`${nf(lignes.length)} établissement(s) dans le fichier de relance.`);
  }

  function lier() {
    racine.querySelectorAll("[data-cp]").forEach((b) =>
      b.addEventListener("click", () => {
        const a = b.dataset.cp,
          id = b.dataset.id;
        if (a === "lancer") lancer();
        else if (a === "annuler") {
          projet = null;
          dessiner();
        } else if (a === "relance") relance(id).catch((e) => dire(`Échec : ${e.message || e}`, true));
        else if (a === "clore")
          modifier(id, (c) => ({
            ...c,
            close: true,
            fin: c.fin && c.fin < Date.now() / 1000 ? c.fin : Math.floor(Date.now() / 1000),
          }));
        else if (a === "rouvrir") modifier(id, (c) => ({ ...c, close: false, fin: null }));
        else if (a === "supprimer") {
          if (confirm("Supprimer cette campagne ? Les signalements reçus ne sont pas touchés."))
            modifier(id, () => null);
        }
      }),
    );
    racine.querySelectorAll("[data-jour]").forEach((s) =>
      s.addEventListener("change", () => {
        jours[s.dataset.jour] = s.value;
        dessiner();
      }),
    );
    racine.querySelectorAll("[data-dep]").forEach((b) =>
      b.addEventListener("click", () => {
        parDep[b.dataset.dep] = !parDep[b.dataset.dep];
        dessiner();
      }),
    );
  }

  async function afficher() {
    racine = $("campagnes");
    if (!racine) return;
    try {
      await charger();
      await dessiner();
    } catch (e) {
      racine.innerHTML = `<section class="carte"><h2>Campagnes</h2><p class="avert">Lecture impossible : ${esc(e.message || e)}</p></section>`;
    }
  }
  // Depuis un autre onglet (Veille) : ouvre l'onglet Établissements et prépare la campagne sur la sélection donnée
  async function preparerDepuis(sel) {
    const b = document.querySelector('nav button[data-onglet="liens"]');
    if (b) b.click();
    await afficher();
    preparer(sel);
  }
  window.OngletCampagnes = { afficher, preparer, preparerDepuis };
})();
