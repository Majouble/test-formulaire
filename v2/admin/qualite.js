/* =====================================================================
   Administration v2 — onglet « À vérifier » : contrôle qualité des signalements
   ---------------------------------------------------------------------
   Analyse les tables des réponses (chaque champ suivi) et liste les anomalies, de la plus grave à la moins grave :
   - section d'établissement (SEGPA, SEP, SGT, SES) choisie au lieu de l'établissement : rattachement proposé
     à l'établissement voisin (même adresse ou presque, type attendu), en un clic ou pour toutes d'un coup ;
   - doublons probables : même établissement (une section comptant pour son établissement), même jour et même site,
     dans des dossiers différents ; ou à un jour d'écart avec une description proche ;
   - versions d'un dossier sur un autre établissement que le dossier ;
   - établissement absent, sans coordonnées (absent de la carte et de l'atlas), hors des académies couvertes ;
   - qualification manquante sur la dernière version ; description d'essai ou vide.
   Chaque anomalie peut être marquée « vérifiée » (elle ne revient pas tant que les dossiers en cause ne changent pas)
   ou corrigée par l'action proposée. Statuts dans la clé « qualite » de Config.
   Chaque dossier en cause : « Modifier ou supprimer… » (saisies modifiables sur place, suppression d'une saisie ou du
   dossier entier : commun/qualite-edition.js).
   ===================================================================== */
(function () {
  "use strict";
  const { esc, $ } = Outils;

  const Q = window.QualiteMoteur,
    TYPES = Q.TYPES,
    GRAVITES = Q.GRAVITES,
    dateFr = Q.dateFr,
    genreSection = Q.genreSection;

  let racine = null,
    config = null,
    etat = null,
    filtre = { type: "", statut: "a_traiter", espace: "" },
    enCours = false;
  filtre = { ...filtre, ...Outils.stockage.lireJSON("socle-v2-qualite", {}) };
  const memoriser = () => {
    Outils.stockage.ecrireJSON("socle-v2-qualite", filtre);
  };
  const statuts = () => ((config && config.valeurs.qualite) || {}).statuts || {};

  const analyser = async () => {
    const r = await Q.analyser();
    if (r.config) config = r.config;
    return r;
  };

  /* ---------- rendu ---------- */
  const statutDe = (a) => (statuts()[a.cle] || {}).s || "";
  function visibles() {
    return etat.espaces
      .filter((x) => !filtre.espace || x.espace.reponses === filtre.espace)
      .flatMap((x) => x.anomalies)
      .filter((a) => !filtre.type || a.type === filtre.type)
      .filter((a) => filtre.statut === "tous" || (filtre.statut === "traites" ? !!statutDe(a) : !statutDe(a)));
  }
  function compteATraiter() {
    return etat && etat.espaces ? etat.espaces.flatMap((x) => x.anomalies).filter((a) => !statutDe(a)).length : 0;
  }
  function majBadge() {
    const b = document.querySelector('nav button[data-onglet="qualite"]');
    if (!b) return;
    const n = compteATraiter();
    b.innerHTML = `À vérifier${n ? ` <span class="qa-badge">${n}</span>` : ""}`;
  }
  function dessiner() {
    if (!etat) {
      racine.innerHTML = `<div class="bandeau info">Analyse des signalements…</div>`;
      return;
    }
    if (etat.erreur) {
      racine.innerHTML = `<div class="bandeau alerte">${esc(etat.erreur)}</div>`;
      return;
    }
    majBadge();
    const toutes = etat.espaces.flatMap((x) => x.anomalies),
      liste = visibles();
    const parType = Object.keys(TYPES)
      .map((k) => ({ k, l: liste.filter((a) => a.type === k) }))
      .filter((x) => x.l.length);
    const nbType = (k) =>
      toutes.filter(
        (a) =>
          a.type === k && (filtre.statut === "tous" || (filtre.statut === "traites" ? !!statutDe(a) : !statutDe(a))),
      ).length;
    const sectionsCorrigibles = liste.filter((a) => a.type === "section" && a.action && !statutDe(a));
    racine.innerHTML = `<section class="carte">
      <h2>À vérifier</h2>
      <p class="aide">Contrôle des signalements enregistrés : sections ou composantes choisies au lieu de l'établissement, doublons, établissements mal identifiés, champs manquants.
        Corrigez avec l'action proposée, ou marquez « vérifié » ce qui est correct : l'anomalie ne revient pas tant que les dossiers en cause ne changent pas.
        Une saisie incorrecte se modifie ou se supprime ici : « Modifier ou supprimer une saisie… » sous chaque dossier (une mise à jour, ou le dossier entier avec ses lignes liées).
        Deux dossiers pour la même affaire (blocage le matin, occupation l'après-midi) : « Rattacher le dossier … au dossier … » en fait un seul.
        Pour placer un établissement, modifier sa fiche ou rattacher un dossier à un autre établissement : widget « Référentiel des sites », vue « À vérifier » (mêmes anomalies, mêmes statuts).</p>
      <div class="qa-outils">
        ${etat.espaces.length > 1 ? `<label>Champ <select id="qa-espace"><option value="">tous</option>${etat.espaces.map((x) => `<option value="${esc(x.espace.reponses)}"${filtre.espace === x.espace.reponses ? " selected" : ""}>${esc(x.espace.libelle || x.espace.champ)}</option>`).join("")}</select></label>` : ""}
        <label>Contrôle <select id="qa-type"><option value="">tous</option>${Object.entries(TYPES)
          .map(
            ([k, t]) =>
              `<option value="${k}"${filtre.type === k ? " selected" : ""}>${esc(t.titre)} (${nbType(k)})</option>`,
          )
          .join("")}</select></label>
        <label>Statut <select id="qa-statut">${[
          ["a_traiter", "à traiter"],
          ["traites", "vérifiés ou corrigés"],
          ["tous", "tous"],
        ]
          .map(([v, l]) => `<option value="${v}"${filtre.statut === v ? " selected" : ""}>${l}</option>`)
          .join("")}</select></label>
        <button type="button" class="secondaire" id="qa-relancer">Relancer l'analyse</button>
        <span class="aide">${etat.espaces.map((x) => `${x.nbDossiers} dossier(s)${etat.espaces.length > 1 ? ` (${esc(x.espace.libelle || x.espace.champ)})` : ""}`).join(", ")} analysés à ${new Date(etat.le).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}.</span>
      </div>
      ${
        sectionsCorrigibles.length > 1
          ? `<div class="qa-lot"><button type="button" class="primaire" id="qa-tout-rattacher">Rattacher les ${sectionsCorrigibles.length} sections et composantes à leur établissement</button>
        <span class="aide">Chaque dossier passe sur l'établissement proposé, toutes versions comprises. Vérifiez la liste avant.</span></div>`
          : ""
      }
      <span class="statut" id="qa-statut-msg" role="status"></span>
      ${
        parType.length
          ? parType
              .map(
                ({
                  k,
                  l,
                }) => `<div class="qa-groupe"><h3>${esc(TYPES[k].titre)} <span class="pastille">${l.length}</span></h3>
          <p class="aide">${esc(TYPES[k].aide)}</p>
          <ul class="qa-liste">${l
            .sort((a, b) => b.gravite - a.gravite)
            .map(carteAnomalie)
            .join("")}</ul></div>`,
              )
              .join("")
          : `<p class="vide">${filtre.statut === "a_traiter" ? "Rien à vérifier." : "Aucune anomalie."}</p>`
      }
    </section>`;
    lier();
  }
  const espaceDe = (a) => etat.espaces.find((x) => x.anomalies.includes(a));
  function carteAnomalie(a) {
    const st = statuts()[a.cle],
      g = GRAVITES[a.gravite],
      esp = espaceDe(a);
    const fiches = a.fiches
      .map((f) => {
        const d = f.derniere;
        return `<li>Dossier n° ${f.id} · ${esc(dateFr(f.jour))}${d.qualif ? ` · ${esc(d.qualif)}` : ""}${d.auteur ? ` · <span class="aide">${esc(d.auteur)}</span>` : ""}${d.desc ? `<br><span class="qa-extrait">${esc(d.desc.slice(0, 160))}${d.desc.length > 160 ? "…" : ""}</span>` : ""}
        ${window.QualiteEdition && esp ? `<details class="qe-details" data-dossier="${f.id}"><summary>Modifier ou supprimer une saisie…</summary>${window.QualiteEdition.html(esp, f)}</details>` : ""}</li>`;
      })
      .join("");
    return `<li class="qa-item${st ? " traite" : ""}" data-cle="${esc(a.cle)}">
      <div class="qa-tete"><span class="pastille qa-${g[0]}">${g[1]}</span> <strong>${esc(a.titre)}</strong></div>
      ${a.detail ? `<div class="qa-detail">${esc(a.detail)}</div>` : ""}
      <ul class="qa-fiches">${fiches}</ul>
      ${!st && a.fiches.length > 1 ? fusionHtml(a) : ""}
      <div class="qa-actions">
        ${
          st
            ? `<span class="pastille ok">${st.s === "corrige" ? "corrigé" : "vérifié"} le ${new Date(st.le * 1000).toLocaleDateString("fr-FR")}</span>${st.note ? ` <span class="aide">${esc(st.note)}</span>` : ""} <button type="button" class="lien-btn" data-rouvrir>Rouvrir</button>`
            : `${a.action ? `<button type="button" class="primaire petit" data-corriger>${esc(a.action.libelle)}</button>` : ""}
             <button type="button" class="secondaire petit" data-verifie>${a.type === "doublon" || a.type === "voisin" ? "Faits distincts : vérifié" : "Vérifié, c'est correct"}</button>`
        }
      </div></li>`;
  }
  // rattacher un dossier à un autre : par défaut, le plus ancien au plus récent (blocage le matin → occupation l'après-midi)
  const heureDe = (f) =>
    typeof f.initiale.cree === "number"
      ? new Date(f.initiale.cree * 1000).toLocaleString("fr-FR", {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";
  const libDossier = (f) =>
    `n° ${f.id}${f.derniere.qualif ? ` · ${f.derniere.qualif}` : ""}${heureDe(f) ? ` · ${heureDe(f)}` : ""}${f.lignes.length > 1 ? ` · ${f.lignes.length} saisies` : ""}`;
  const parDate = (a) =>
    a.fiches.slice().sort((x, y) => (x.initiale.cree || 0) - (y.initiale.cree || 0) || x.id - y.id);
  function fusionHtml(a) {
    const l = parDate(a),
      opts = (choisi) =>
        l
          .map((f) => `<option value="${f.id}"${f === choisi ? " selected" : ""}>${esc(libDossier(f))}</option>`)
          .join("");
    return `<div class="qa-fusion"><span>Même affaire ? Rattacher le dossier</span> <select data-fus-src aria-label="Dossier à rattacher">${opts(l[0])}</select>
      <span>au dossier</span> <select data-fus-cible aria-label="Dossier qui le reçoit">${opts(l[l.length - 1])}</select>
      <button type="button" class="secondaire petit" data-fusionner>Rattacher</button>
      <span class="aide">Ses saisies deviennent des versions de l'autre dossier, rangées par date.</span></div>`;
  }
  async function fusionner(a, li) {
    const esp = espaceDe(a),
      src = a.fiches.find((f) => f.id === +li.querySelector("[data-fus-src]").value),
      cib = a.fiches.find((f) => f.id === +li.querySelector("[data-fus-cible]").value);
    if (!esp || !src || !cib) return;
    if (src === cib) {
      dire("Choisissez deux dossiers différents.", true);
      return;
    }
    if (
      !confirm(
        `Rattacher le dossier ${libDossier(src)} au dossier ${libDossier(cib)} ?\n\nSes ${src.lignes.length} saisie(s) deviennent des versions du dossier n° ${cib.id}, rangées par date de saisie : la plus récente reste la dernière version, la plus ancienne devient le signalement initial (« Nouveau signalement »). Le dossier n° ${src.id} disparaît de la liste des signalements ; ses sites et lignes liées suivent.`,
      )
    )
      return;
    try {
      const r = await Q.fusionner(esp, src, cib);
      await Q.marquer([a], "corrige", `dossier n° ${src.id} rattaché au n° ${cib.id}`).catch(() => {});
      Donnees.viderCache();
      await relancer(
        `Dossier n° ${src.id} rattaché au dossier n° ${cib.id} (${r.versions} saisie(s)${r.liees.length ? `, ${r.liees.join(", ")}` : ""}).`,
      );
    } catch (e) {
      dire(`Rattachement refusé par Grist (${e.message || e}).`, true);
    }
  }
  function lier() {
    const sel = (id, k) => {
      if ($(id))
        $(id).addEventListener("change", (e) => {
          filtre[k] = e.target.value;
          memoriser();
          dessiner();
        });
    };
    sel("qa-espace", "espace");
    sel("qa-type", "type");
    sel("qa-statut", "statut");
    $("qa-relancer").addEventListener("click", () => {
      Donnees.viderCache();
      relancer();
    });
    if ($("qa-tout-rattacher"))
      $("qa-tout-rattacher").addEventListener("click", async () => {
        const l = visibles().filter((a) => a.type === "section" && a.action && !statutDe(a));
        if (!confirm(`Rattacher ${l.length} signalement(s) à l'établissement proposé ?`)) return;
        await corriger(l);
      });
    racine.querySelectorAll(".qa-item").forEach((li) => {
      const a = etat.espaces.flatMap((x) => x.anomalies).find((x) => x.cle === li.dataset.cle);
      if (!a) return;
      const b = (s, fn) => {
        const x = li.querySelector(s);
        if (x) x.addEventListener("click", fn);
      };
      b("[data-verifie]", () => marquer([a], "ok"));
      b("[data-rouvrir]", () => marquer([a], null));
      b("[data-corriger]", () => corriger([a]));
      b("[data-fusionner]", () => fusionner(a, li));
      // saisies du dossier : modifier sur place, supprimer une saisie ou le dossier
      const esp = espaceDe(a);
      if (window.QualiteEdition && esp)
        li.querySelectorAll(".qe-details").forEach((d) => {
          const f = a.fiches.find((x) => x.id === +d.dataset.dossier);
          if (!f) return;
          window.QualiteEdition.lier(d, esp, f, {
            dire,
            apres: (message) => {
              Donnees.viderCache();
              relancer(message);
            },
          });
        });
    });
  }
  const dire = (t, err) => {
    const s = $("qa-statut-msg");
    if (s) {
      s.textContent = t;
      s.className = `statut${err ? " err" : " ok"}`;
    }
  };

  /* ---------- écritures ---------- */
  async function marquer(liste, s, note) {
    try {
      config = await Q.marquer(liste, s, note);
      dessiner();
      dire(
        s
          ? `${liste.length} anomalie(s) ${s === "corrige" ? "corrigée(s)" : "marquée(s) vérifiée(s)"}.`
          : "Anomalie rouverte.",
      );
    } catch (e) {
      dire(`Écriture refusée par Grist (${e.message || e}).`, true);
    }
  }
  // rattachement d'une section : toutes les versions du dossier passent sur l'établissement proposé ; les colonnes
  // recopiées du référentiel (non formules) sont mises à jour avec lui
  async function corriger(liste) {
    try {
      const n = await Q.rattacher(etat, liste);
      if (!n) return;
      await marquer(liste, "corrige", "rattaché à l'établissement");
      await relancer(`${liste.length} signalement(s) rattaché(s) à leur établissement (${n} ligne(s) modifiée(s)).`);
    } catch (e) {
      dire(`Correction refusée par Grist (${e.message || e}).`, true);
    }
  }

  async function relancer(message) {
    if (enCours) return;
    enCours = true;
    try {
      etat = await analyser();
    } catch (e) {
      etat = { erreur: `Analyse impossible : ${e.message || e}` };
    }
    enCours = false;
    dessiner();
    if (message) dire(message);
  }
  async function afficher() {
    racine = $("qualite");
    etat = null;
    dessiner();
    Donnees.viderCache(); // corrections faites ailleurs (widget des sites, formulaires) : relues
    while (enCours) await new Promise((r) => setTimeout(r, 200)); // analyse d'arrière-plan en cours : on l'attend
    await relancer();
  }
  // compte affiché sur l'onglet dès l'ouverture de l'administration (analyse en arrière-plan, sans rendu)
  async function compter() {
    if (etat || enCours) return;
    try {
      enCours = true;
      const r = await analyser();
      if (!etat) etat = r;
    } catch (_) {
      /* compté à l'ouverture de l'onglet */
    } finally {
      enCours = false;
    }
    if (etat && !etat.erreur) majBadge();
  }
  window.OngletQualite = { afficher, compter, genreSection };
})();
