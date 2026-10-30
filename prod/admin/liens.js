/* =====================================================================
   Administration v2 — onglet « Établissements » : accès des établissements par lien personnel (link key)
   ---------------------------------------------------------------------
   Principe (Grist) : chaque établissement du référentiel a une clé secrète (colonne UUID, formule
   d'initialisation UUID()) et un lien (colonne Lien : SELF_HYPERLINK(page=…, LinkKey_Etab=$UUID)).
   Le lien ouvre la page des établissements avec le paramètre ?Etab_=<clé> ; l'attribut utilisateur « Etab »
   (onglet Accès) retrouve la ligne du référentiel dont la clé est celle du lien, et les règles ne laissent voir
   que cet établissement et ses signalements (sans visas ni auteur). Le widget de saisie passe alors de lui-même
   en mode établissement (une seule ligne visible, clé illisible).
   Mise en place : clés et liens, page des établissements, règles (onglet Accès), partage public du document.
   Publipostage : sélection d'établissements, message, fichier CSV pour la fusion (Outlook / Word, n8n…).
   ===================================================================== */
(function () {
  "use strict";
  const S = window.Socle, R = window.Repartition;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const { cle: CLE, lien: LIEN } = R.LIEN;
  const MAX_LIGNES = 200;
  const MESSAGE_DEFAUT = {
    objet: "Signalement concernant {nom} : accès à votre formulaire",
    corps: "Bonjour,\n\nUn espace de suivi des signalements a été ouvert pour {nom} ({uai}). Il vous permet de signaler un événement, puis de consulter, compléter et suivre vos signalements :\n\n{lien}\n\nCe lien est propre à votre établissement : merci de ne pas le diffuser en dehors de l'équipe de direction.\n\nCordialement,",
  };

  let config, general, meta, formulaires, groupes, pages, attributs, racine;
  let choix = 0;                 // groupe (référentiel) affiché dans le publipostage
  let donnees = null;            // { table, t, ref, roles } du groupe choisi
  let filtre = { crit: {}, recherche: "", avecMail: true, sansCle: false };
  let message = null;

  /* ---------- Lecture ---------- */
  async function charger() {
    config = await S.lireConfig();
    general = S.general(config);
    meta = await S.lireMeta();
    formulaires = await R.lireFormulairesPublies(general);
    groupes = R.groupesLiens(meta, config, general, formulaires);
    pages = (await R.lirePagesEtab()) || [];
    // formule du lien d'avant la 2.0.3 (sans « page seule ») : mise à jour d'office
    const anciennes = groupes.filter(g => g.lien && memeFormule(g.formuleLien, R.ancienneFormuleLien(g.attribut, pageDe(g) ? pageDe(g).viewRef : null)));
    if (anciennes.length) try {
      await grist.docApi.applyUserActions(anciennes.map(g => ["ModifyColumn", g.table, LIEN, { formula: formuleAttendue(g) }]));
      meta = await S.lireMeta(); groupes = R.groupesLiens(meta, config, general, formulaires);
    } catch (_) { /* droits insuffisants : proposé dans l'étape « Formule du lien » */ }
    attributs = await lireAttributs();
    if (await R.majSchemaPublic(meta, config, general, formulaires)) config = await S.lireConfig();   // copie des colonnes pour les liens
    message = { ...MESSAGE_DEFAUT, ...((config && config.valeurs.liens && config.valeurs.liens.message) || {}) };
    if (choix >= groupes.length) choix = 0;
    await chargerDonnees();
  }
  // attributs utilisateur en place (null : règles illisibles)
  async function lireAttributs() {
    try {
      const r = await grist.docApi.fetchTable("_grist_ACLRules");
      return (r.id || []).map((_, i) => { try { return r.userAttributes[i] ? JSON.parse(r.userAttributes[i]) : null; } catch (_) { return null; } }).filter(Boolean);
    } catch (_) { return null; }
  }
  async function chargerDonnees() {
    const g = groupes[choix];
    if (!g) { donnees = null; return; }
    try {
      const t = await grist.docApi.fetchTable(g.table);
      const ref = await R.lireReferentiel({ ...general, referentiel: g.table }, config);
      const roles = ref.roles || {};
      const col = (role, defaut) => roles[role] || (t[defaut] ? defaut : null);
      donnees = { table: g.table, t, ref, cols: { nom: col("Nom", "Nom"), uai: col("UAI", "UAI"), commune: col("Commune", "Commune"), mail: col("Mail", "Mail") } };
      donnees.valeurs = valeursColonnes(g.table, t);
    } catch (e) { donnees = { table: g.table, erreur: e.message || String(e) }; }
  }
  // Valeurs de chaque colonne texte ou liste de choix du référentiel, sans plafond : { colId: [{ v, n }] }
  const valeursCellule = v => (Array.isArray(v) ? (v[0] === "L" ? v.slice(1) : v) : [v]).map(x => (x == null ? "" : String(x).trim())).filter(Boolean);
  function valeursColonnes(table, t) {
    const out = {}, cols = (meta[table] && meta[table].colonnes) || {};
    for (const c of Object.values(cols)) {
      if (!/^(Text|Choice|ChoiceList|Any)$/.test(String(c.type).split(":")[0]) || !t[c.colId] || /^(lat|lon|lng)/i.test(c.colId)) continue;
      const compte = new Map();
      t[c.colId].forEach(v => valeursCellule(v).forEach(x => compte.set(x, (compte.get(x) || 0) + 1)));
      if (c.type === "Any" && [...compte.keys()].some(x => x.length > 120)) continue;   // formules au texte long
      out[c.colId] = [...compte.entries()].map(([v, n]) => ({ v, n })).sort((a, b) => a.v.localeCompare(b.v, "fr", { numeric: true }));
    }
    return out;
  }
  const libelleColonne = c => { const r = Object.entries(donnees.ref.roles || {}).find(([, x]) => x === c); const m = meta[donnees.table] && meta[donnees.table].colonnes[c];
    return r ? R.libelleCritere(donnees.ref, c) : (m && m.label) || c; };
  const pageDe = g => pages.find(p => p.referentiel === g.table) || null;
  const formuleAttendue = g => R.formuleLien(g.attribut, pageDe(g) ? pageDe(g).viewRef : null);
  const memeFormule = (a, b) => String(a || "").replace(/\s+/g, "") === String(b || "").replace(/\s+/g, "");
  const attributEnPlace = g => (attributs || []).some(a => a.name === g.attribut && a.tableId === g.table && a.lookupColId === CLE && a.charId === `LinkKey.${g.attribut}`);
  const lisible = v => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v[0] === "C");   // ["C"] : valeur censurée

  /* ---------- Rendu ---------- */
  function dessiner() {
    if (!config) { racine.innerHTML = `<div class="bandeau alerte">La table Config est absente : lancez d'abord l'installation.</div>`; return; }
    if (!groupes.length) {
      racine.innerHTML = `<div class="bandeau info">Aucun formulaire d'établissement publié : publiez d'abord le formulaire (onglet Formulaires). Les liens ouvrent la page de ce formulaire, limitée à l'établissement.</div>`;
      return;
    }
    racine.innerHTML = `${groupes.map((g, k) => carteMiseEnPlace(g, k)).join("")}${cartePublipostage()}`;
    lier();
  }

  function carteMiseEnPlace(g, k) {
    const p = pageDe(g), t = donnees && donnees.table === g.table && donnees.t ? donnees.t : null;
    const sansCle = t && g.cle ? t.id.filter((_, i) => !lisible((t[CLE] || [])[i])).length : null;
    const formuleOk = g.lien && memeFormule(g.formuleLien, formuleAttendue(g));
    const etape = (ok, titre, detail, bouton) => `<li class="li-etape"><span class="pastille ${ok ? "ok" : "manque"}">${ok ? "fait" : "à faire"}</span>
      <div><strong>${titre}</strong>${detail ? `<div class="detail">${detail}</div>` : ""}${bouton && !ok ? `<div class="boutons" style="margin-top:6px">${bouton}</div>` : ""}</div></li>`;
    const forms = g.formulaires;
    const choixForm = forms.length > 1 ? `<select id="li-form-${k}">${forms.map(f => `<option value="${esc(f.nom)}">${esc(f.nom)}</option>`).join("")}</select>` : "";
    return `<section class="carte"><h2>Mise en place — ${esc(g.table)}${groupes.length > 1 ? ` (lien « ${esc(g.attribut)}_ »)` : ""}</h2>
      <p class="aide">Formulaire${forms.length > 1 ? "s" : ""} : ${forms.map(f => `<strong>${esc(f.nom)}</strong>`).join(", ")}. Chaque établissement de la table ${esc(g.table)} reçoit une clé secrète et un lien qui n'ouvre que ses propres signalements.</p>
      <ol class="li-etapes">
        ${etape(!!(g.cle && g.lien), "1. Clés et liens dans le référentiel",
          g.cle && g.lien ? `Colonnes ${esc(g.table)}.${CLE} (clé, créée pour chaque nouvel établissement) et ${esc(g.table)}.${LIEN} (adresse du lien).`
            : `Ajoute ${!g.cle ? `${esc(g.table)}.${CLE} (clé secrète tirée au hasard pour chaque établissement, puis pour chaque nouvel établissement)` : ""}${!g.cle && !g.lien ? " et " : ""}${!g.lien ? `${esc(g.table)}.${LIEN} (formule qui compose le lien)` : ""}.`,
          `<button class="primaire" data-act="colonnes" data-g="${k}">Ajouter ${[!g.cle && CLE, !g.lien && LIEN].filter(Boolean).join(" et ")}</button>`)}
        ${g.cle && sansCle ? etape(false, `${sansCle} établissement(s) sans clé`, "Établissements ajoutés avant la colonne ou importés avec une clé vide : sans clé, pas de lien.",
          `<button class="primaire" data-act="cles" data-g="${k}">Générer les clés manquantes</button>`) : ""}
        ${etape(!!p, "2. Page des établissements",
          p ? `Page « ${esc(p.page)} » (n° ${p.viewRef}), formulaire « ${esc(p.formulaire)} ». Elle ne montre rien aux personnes sans lien ; avec un lien, seul l'établissement concerné.`
            : "Page avec le widget de saisie, ouverte par les liens. Sans lien, elle ne montre rien ; les pages de l'équipe ne sont pas modifiées.",
          `${choixForm}<button class="primaire" data-act="page" data-g="${k}">Créer la page des établissements</button>`)}
        ${g.lien ? etape(formuleOk, "3. Lien vers cette page",
          formuleOk ? `Formule <code>${esc(g.formuleLien)}</code>.` : `Formule actuelle <code>${esc(g.formuleLien || "—")}</code> ; attendue <code>${esc(formuleAttendue(g))}</code>.`,
          `<button class="primaire" data-act="formule" data-g="${k}">Mettre à jour la formule</button>`) : ""}
        ${etape(attributs !== null && attributEnPlace(g), "4. Règles d'accès",
          attributs === null ? "Règles illisibles : seul un propriétaire du document peut les appliquer (onglet Accès)."
            : attributEnPlace(g) ? `Attribut utilisateur « ${esc(g.attribut)} » en place (clé du lien → ligne de ${esc(g.table)}). Après toute modification des formulaires, réappliquez les règles dans l'onglet Accès.`
            : "Onglet Accès, « Appliquer les règles » : elles ajoutent l'attribut « " + esc(g.attribut) + " » et limitent chaque lien à son établissement (signalements sans visas, référentiel réduit à sa ligne, clé illisible).",
          `<button class="secondaire" data-act="onglet-acces">Ouvrir l'onglet Accès</button>`)}
        <li class="li-etape"><span class="pastille reco">dans Grist</span><div><strong>5. Partage public du document</strong>
          <div class="detail">Une fois les règles appliquées et vérifiées : bouton « Partager » de Grist, « Accès public » en <strong>Éditeur</strong>. Les personnes sans lien ni place dans l'équipe ne voient alors aucune donnée ; avec un lien, seulement leur établissement.
          Avant d'ouvrir ce partage, testez un lien avec un compte qui n'est ni propriétaire ni dans l'équipe (un propriétaire voit tout, même avec un lien).</div></div></li>
      </ol>
      <span class="statut" id="li-statut-${k}" role="status"></span></section>`;
  }

  // Lignes du référentiel retenues par le filtre
  function lignesFiltrees() {
    if (!donnees || !donnees.t) return [];
    const { t, cols } = donnees, q = S.norm(filtre.recherche);
    const crit = Object.entries(filtre.crit).filter(([, v]) => v && v.size);
    return t.id.map((id, i) => i).filter(i => {
      if (filtre.avecMail && cols.mail && !String(t[cols.mail][i] || "").trim()) return false;
      if (filtre.sansCle && lisible((t[CLE] || [])[i])) return false;
      for (const [c, vals] of crit) if (!valeursCellule(t[c] ? t[c][i] : null).some(x => vals.has(x))) return false;
      if (q) { const txt = S.norm([cols.nom, cols.uai, cols.commune].filter(Boolean).map(c => t[c][i]).join(" ")); if (!q.split(/\s+/).every(m => txt.includes(m))) return false; }
      return true;
    });
  }
  // Filtres du publipostage : colonnes du référentiel aux valeurs peu nombreuses (au plus 200), hors références,
  // clé, lien et adresse. Par défaut : académie, département, circonscription, type, public / privé, nature ;
  // la liste choisie est gardée dans la clé « liens » de Config (filtres).
  const ROLES_FILTRES = ["Academie", "Departement", "Nom_circonscription", "Type", "Statut_public_prive", "Libelle_nature"];
  const MAX_PUCES = 30;
  function filtresDisponibles() {
    const { cols } = donnees, exclues = new Set([CLE, LIEN, cols.mail, cols.nom, cols.uai].filter(Boolean));
    return Object.keys(donnees.valeurs || {}).filter(c => !exclues.has(c));
  }
  function filtresAffiches() {
    const dispo = filtresDisponibles(), enr = config && config.valeurs.liens && config.valeurs.liens.filtres;
    if (Array.isArray(enr)) return enr.filter(c => dispo.includes(c));
    const roles = donnees.ref.roles || {};
    const parDefaut = [...ROLES_FILTRES.map(r => roles[r] || (dispo.includes(r) ? r : null)), ...R.criteres(donnees.ref, config)].filter(c => c && dispo.includes(c));
    return [...new Set(parDefaut)];
  }
  async function enregistrerFiltres(liste) {
    try { await S.ecrireConfig("liens", { ...((config && config.valeurs.liens) || {}), filtres: liste }); config = await S.lireConfig(); } catch (_) { /* droits insuffisants : réglage non gardé */ }
  }
  const valeur = (c, i) => (c && donnees.t[c] ? String(donnees.t[c][i] ?? "") : "");
  const lienDe = i => donnees.t[LIEN] && lisible(donnees.t[LIEN][i]) ? String(donnees.t[LIEN][i]) : "";
  const remplir = (modele, i) => String(modele || "").replace(/\{(nom|uai|commune|lien|situation)\}/g, (_, k) =>
    k === "lien" ? lienDe(i) : k === "situation" ? (general.situation || "") : valeur(donnees.cols[k], i));

  function cartePublipostage() {
    const sel = groupes.length > 1 ? `<label class="champ"><span>Référentiel</span><select id="li-groupe">${groupes.map((g, k) => `<option value="${k}"${k === choix ? " selected" : ""}>${esc(g.table)}</option>`).join("")}</select></label>` : "";
    if (!donnees || donnees.erreur) return `<section class="carte"><h2>Publipostage</h2>${sel}<p class="avert">${esc(donnees ? `Table ${donnees.table} illisible : ${donnees.erreur}` : "Référentiel illisible.")}</p></section>`;
    const g = groupes[choix];
    if (!g.cle || !g.lien) return `<section class="carte"><h2>Publipostage</h2>${sel}<p class="vide">Ajoutez d'abord les clés et les liens (étape 1 ci-dessus).</p></section>`;
    const { ref, cols } = donnees;
    const criteres = filtresAffiches(), ajoutables = filtresDisponibles().filter(c => !criteres.includes(c));
    const lignes = lignesFiltrees(), total = donnees.t.id.length;
    const sansLien = lignes.filter(i => !lienDe(i)).length;
    // un filtre par colonne : boutons si peu de valeurs, sinon liste déroulante et valeurs choisies
    const puces = c => {
      const vals = donnees.valeurs[c] || [], pris = filtre.crit[c] || new Set();
      const bouton = x => `<button type="button" class="puce-ps${pris.has(x.v) ? " on" : ""}" data-crit="${esc(c)}" data-val="${esc(x.v)}">${esc(x.v)} <small>${x.n}</small></button>`;
      // au-delà de 30 valeurs : saisie avec suggestions (on tape quelques lettres), valeurs choisies en boutons
      const corps = !vals.length ? `<span class="vide">colonne vide${c === "Nom_circonscription" ? " : relancez l'import de l'annuaire (onglet Référentiel) pour la remplir" : ""}</span>`
        : vals.length <= MAX_PUCES ? vals.map(bouton).join("")
        : `${vals.filter(x => pris.has(x.v)).map(bouton).join("")}<input type="text" list="li-dl-${esc(c)}" data-crit-saisie="${esc(c)}" placeholder="${pris.size ? "Ajouter une valeur…" : `Taper pour choisir parmi ${vals.length} valeurs…`}">
          <datalist id="li-dl-${esc(c)}">${vals.filter(x => !pris.has(x.v)).map(x => `<option value="${esc(x.v)}">${x.n} établissement(s)</option>`).join("")}</datalist>`;
      return `<div class="li-crit"><span class="li-crit-nom">${esc(libelleColonne(c))}</span><div class="puces-ps">${corps}</div>
        <button type="button" class="lien-btn li-retirer" data-retirer-filtre="${esc(c)}" title="Retirer ce filtre">×</button></div>`;
    };
    const apercu = lignes.slice(0, MAX_LIGNES).map(i => {
      const mail = valeur(cols.mail, i), lien = lienDe(i);
      const href = mail && lien ? `mailto:${encodeURIComponent(mail)}?subject=${encodeURIComponent(remplir(message.objet, i))}&body=${encodeURIComponent(remplir(message.corps, i))}` : "";
      return `<tr><td><strong>${esc(valeur(cols.nom, i))}</strong></td><td>${esc(valeur(cols.uai, i))}</td><td>${esc(valeur(cols.commune, i))}</td><td>${mail ? esc(mail) : `<span class="pastille manque">sans adresse</span>`}</td>
        <td>${lien ? `<span class="pastille ok">lien</span>` : `<span class="pastille manque">sans clé</span>`}</td>
        <td class="li-actions">${href ? `<a href="${esc(href)}" target="_blank" rel="noopener" title="Ouvrir le message dans la messagerie">✉</a>` : ""}
          ${lien ? `<button type="button" class="lien-btn" data-copier="${i}" title="Copier le lien">Copier</button>` : ""}
          <button type="button" class="lien-btn" data-revoquer="${donnees.t.id[i]}" title="Nouvelle clé : l'ancien lien ne fonctionne plus">Nouvelle clé</button></td></tr>`;
    }).join("");
    return `<section class="carte"><h2>Publipostage</h2>
      <p class="aide">Choisissez les établissements, ajustez le message, puis téléchargez le fichier CSV pour une fusion de courriels (Word et Outlook, ou un flux n8n) : une ligne par établissement, avec son adresse, son lien et le message déjà rempli. Pour quelques envois, ✉ ouvre le message dans votre messagerie.</p>
      ${sel}
      ${criteres.map(puces).join("")}
      ${g.table === general.referentiel && meta[g.table] && !meta[g.table].colonnes.Nom_circonscription && !(ref.roles || {}).Nom_circonscription
        ? `<div class="li-crit"><span class="li-crit-nom">Circonscription</span><span class="vide">colonne Nom_circonscription absente du référentiel : relancez l'import de l'annuaire (onglet Référentiel), qui la crée et la remplit.</span></div>` : ""}
      ${ajoutables.length ? `<div class="li-crit"><span class="li-crit-nom"></span><select id="li-ajout-filtre"><option value="">+ Ajouter un filtre…</option>${ajoutables.map(c => `<option value="${esc(c)}">${esc(libelleColonne(c))}</option>`).join("")}</select>
        ${(config.valeurs.liens || {}).filtres ? `<button type="button" class="lien-btn" id="li-filtres-defaut">Filtres par défaut</button>` : ""}</div>` : ""}
      <div class="li-filtres">
        <input type="text" id="li-recherche" placeholder="Nom, UAI ou commune" value="${esc(filtre.recherche)}">
        ${cols.mail ? `<label><input type="checkbox" id="li-avec-mail"${filtre.avecMail ? " checked" : ""}> Avec une adresse seulement</label>` : ""}
        <label><input type="checkbox" id="li-sans-cle"${filtre.sansCle ? " checked" : ""}> Sans clé seulement</label>
        ${Object.values(filtre.crit).some(v => v && v.size) || filtre.recherche ? `<button type="button" class="lien-btn" id="li-effacer">Effacer les filtres</button>` : ""}
      </div>
      <p><strong>${lignes.length}</strong> établissement(s) retenu(s) sur ${total}${sansLien ? ` — <span class="pastille manque">${sansLien} sans lien</span> (clé manquante, ou lien pas encore calculé par Grist)` : ""}.</p>
      <details class="li-message"${message.objet !== MESSAGE_DEFAUT.objet || message.corps !== MESSAGE_DEFAUT.corps ? " open" : ""}><summary><strong>Message</strong> <small>(repères : {nom}, {uai}, {commune}, {lien}, {situation})</small></summary>
        <label class="champ"><span>Objet</span><input type="text" id="li-objet" value="${esc(message.objet)}"></label>
        <label class="champ"><span>Texte</span><textarea id="li-corps" rows="9">${esc(message.corps)}</textarea></label>
        <div class="boutons"><button class="secondaire" id="li-msg-enregistrer">Enregistrer le message</button><button class="secondaire" id="li-msg-defaut">Message par défaut</button><span class="statut" id="li-msg-statut"></span></div>
      </details>
      <div class="boutons">
        <button class="primaire" id="li-csv"${lignes.length ? "" : " disabled"}>Télécharger le fichier CSV (${lignes.length})</button>
        <button class="secondaire" id="li-csv-voir"${lignes.length ? "" : " disabled"}>Afficher pour copier</button>
        <span class="statut" id="li-statut" role="status"></span>
      </div>
      <textarea id="li-sortie" rows="6" readonly hidden></textarea>
      <div id="li-confirmation" class="ac-confirmation" hidden></div>
      ${lignes.length ? `<table class="eq-table li-table"><thead><tr><th>Établissement</th><th>UAI</th><th>Commune</th><th>Adresse</th><th>Lien</th><th></th></tr></thead><tbody>${apercu}</tbody></table>
        ${lignes.length > MAX_LIGNES ? `<p class="aide">${MAX_LIGNES} premiers affichés ; le fichier CSV contient les ${lignes.length}.</p>` : ""}` : `<p class="vide">Aucun établissement ne correspond.</p>`}
    </section>`;
  }

  /* ---------- Fichier CSV ---------- */
  function csv() {
    const q = v => { const s = String(v ?? ""); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const { cols } = donnees;
    const lignes = lignesFiltrees().filter(i => lienDe(i));
    const tete = ["UAI", "Nom", "Commune", "Mail", "Lien", "Objet", "Message"];
    const corps = lignes.map(i => [valeur(cols.uai, i), valeur(cols.nom, i), valeur(cols.commune, i), valeur(cols.mail, i), lienDe(i), remplir(message.objet, i), remplir(message.corps, i)].map(q).join(";"));
    return { texte: "﻿" + [tete.join(";"), ...corps].join("\r\n") + "\r\n", n: lignes.length };
  }
  function telecharger() {
    const { texte, n } = csv();
    if (!n) { dire("li-statut", "Aucun établissement retenu n'a de lien.", true); return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([texte], { type: "text/csv;charset=utf-8" }));
    a.download = `liens-etablissements-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    dire("li-statut", `${n} établissement(s) dans le fichier. Si le téléchargement ne démarre pas, utilisez « Afficher pour copier ».`);
  }

  /* ---------- Écritures ---------- */
  const dire = (id, t, err) => { const st = $(id); if (st) { st.textContent = t; st.className = `statut${err ? " err" : " ok"}`; } };
  const uuid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r = crypto.getRandomValues(new Uint8Array(1))[0] % 16; return (c === "x" ? r : (r & 3) | 8).toString(16); });
  async function ajouterColonnes(k) {
    const g = groupes[k];
    try {
      if (!g.cle) {
        // formule UUID() calculée pour chaque ligne, puis convertie en données : elle reste formule d'initialisation (nouveaux établissements)
        await grist.docApi.applyUserActions([["AddColumn", g.table, CLE, { type: "Text", isFormula: true, formula: "UUID()", label: CLE }]]);
        await grist.docApi.applyUserActions([["ModifyColumn", g.table, CLE, { isFormula: false, formula: "UUID()" }]]);
      }
      if (!g.lien) await grist.docApi.applyUserActions([["AddColumn", g.table, LIEN, { type: "Text", isFormula: true, formula: formuleAttendue(g), label: LIEN }]]);
      await recharger(); dire(`li-statut-${k}`, "Colonnes ajoutées.");
    } catch (e) { dire(`li-statut-${k}`, `Ajout refusé par Grist (${e.message || e}).`, true); }
  }
  async function genererCles(k) {
    const g = groupes[k];
    try {
      const t = await grist.docApi.fetchTable(g.table), ids = t.id.filter((_, i) => !lisible((t[CLE] || [])[i]));
      for (let j = 0; j < ids.length; j += 500) {
        const lot = ids.slice(j, j + 500);
        await grist.docApi.applyUserActions([["BulkUpdateRecord", g.table, lot, { [CLE]: lot.map(uuid) }]]);
      }
      await recharger(); dire(`li-statut-${k}`, `${ids.length} clé(s) générée(s).`);
    } catch (e) { dire(`li-statut-${k}`, `Écriture refusée par Grist (${e.message || e}).`, true); }
  }
  async function creerPage(k) {
    const g = groupes[k], sel = $(`li-form-${k}`), f = g.formulaires.find(x => x.nom === (sel ? sel.value : g.formulaires[0].nom)) || g.formulaires[0];
    try {
      const T = await grist.docApi.fetchTable("_grist_Tables"), tref = T.id[T.tableId.indexOf(f.table)];
      const res = await grist.docApi.applyUserActions([["CreateViewSection", tref, 0, "custom", null, null]]);
      const rv = (res && res.retValues && res.retValues[0]) || {};
      if (!rv.sectionRef) throw new Error("Grist n'a pas indiqué la vue créée");
      const sections = await grist.docApi.fetchTable("_grist_Views_section"), i = sections.id.indexOf(rv.sectionRef);
      const { o, cv } = R.optionsVue(i >= 0 ? sections.options[i] : "");
      let url; try { url = new URL("../saisie/", location.href).href; } catch (_) { url = "https://majouble.github.io/test-formulaire/prod/saisie/"; }
      const nom = groupes.length > 1 || g.formulaires.length > 1 ? `Signalement — ${f.nom}` : "Signalement — établissements";
      o.customView = JSON.stringify({ ...cv, mode: "url", url, access: "full", widgetOptions: { ...(cv.widgetOptions || {}), formulaire: f.nom, etablissements: g.table } });
      const acts = [["UpdateRecord", "_grist_Views_section", rv.sectionRef, { options: JSON.stringify(o), title: nom }], ["UpdateRecord", "_grist_Views", rv.viewRef, { name: nom }]];
      // le lien vise cette page
      if (g.lien) acts.push(["ModifyColumn", g.table, LIEN, { formula: R.formuleLien(g.attribut, rv.viewRef) }]);
      await grist.docApi.applyUserActions(acts);
      await recharger(); dire(`li-statut-${k}`, `Page « ${nom} » créée${g.lien ? " ; les liens l'ouvrent désormais" : ""}.`);
    } catch (e) { dire(`li-statut-${k}`, `Création refusée par Grist (${e.message || e}).`, true); }
  }
  async function majFormule(k) {
    const g = groupes[k];
    try { await grist.docApi.applyUserActions([["ModifyColumn", g.table, LIEN, { formula: formuleAttendue(g) }]]); await recharger(); dire(`li-statut-${k}`, "Formule mise à jour."); }
    catch (e) { dire(`li-statut-${k}`, `Modification refusée par Grist (${e.message || e}).`, true); }
  }
  function revoquer(id) {
    const i = donnees.t.id.indexOf(id), nom = valeur(donnees.cols.nom, i) || `ligne ${id}`;
    const z = $("li-confirmation"); z.hidden = false;
    z.innerHTML = `<p>Donner une nouvelle clé à « ${esc(nom)} » ? Son lien actuel cessera de fonctionner : il faudra lui envoyer le nouveau.</p>
      <div class="boutons"><button class="primaire" id="li-oui">Oui, nouvelle clé</button><button class="secondaire" id="li-non">Annuler</button></div>`;
    z.scrollIntoView({ block: "nearest" });
    $("li-non").addEventListener("click", () => { z.hidden = true; });
    $("li-oui").addEventListener("click", async () => {
      try { await grist.docApi.applyUserActions([["UpdateRecord", donnees.table, id, { [CLE]: uuid() }]]); await recharger(); dire("li-statut", `Nouvelle clé pour « ${nom} ».`); }
      catch (e) { dire("li-statut", `Écriture refusée par Grist (${e.message || e}).`, true); }
    });
  }
  async function enregistrerMessage() {
    try { await S.ecrireConfig("liens", { ...((config && config.valeurs.liens) || {}), message }); config = await S.lireConfig(); dire("li-msg-statut", "Message enregistré (repris par le bouton ✉ des pages de saisie)."); }
    catch (e) { dire("li-msg-statut", `Enregistrement refusé (${e.message || e}).`, true); }
  }

  /* ---------- Événements ---------- */
  function lier() {
    racine.querySelectorAll("[data-act]").forEach(b => b.addEventListener("click", () => {
      const k = Number(b.dataset.g), act = b.dataset.act;
      b.disabled = true;
      const fin = () => { b.disabled = false; };
      if (act === "colonnes") ajouterColonnes(k).finally(fin);
      else if (act === "cles") genererCles(k).finally(fin);
      else if (act === "page") creerPage(k).finally(fin);
      else if (act === "formule") majFormule(k).finally(fin);
      else if (act === "onglet-acces") { fin(); const n = document.querySelector('nav button[data-onglet="acces"]'); if (n) n.click(); }
    }));
    if ($("li-groupe")) $("li-groupe").addEventListener("change", async e => { choix = Number(e.target.value); filtre.crit = {}; await chargerDonnees(); dessiner(); });
    racine.querySelectorAll("[data-crit]").forEach(b => b.addEventListener("click", () => {
      const c = b.dataset.crit, v = b.dataset.val, s = filtre.crit[c] || (filtre.crit[c] = new Set());
      if (s.has(v)) s.delete(v); else s.add(v);
      dessiner();
    }));
    racine.querySelectorAll("[data-crit-saisie]").forEach(inp => inp.addEventListener("change", () => {
      const c = inp.dataset.critSaisie, v = (donnees.valeurs[c] || []).find(x => S.norm(x.v) === S.norm(inp.value));
      if (!v) { inp.value = ""; inp.placeholder = "Valeur inconnue : choisissez dans la liste"; return; }
      (filtre.crit[c] || (filtre.crit[c] = new Set())).add(v.v); dessiner();
      const n = racine.querySelector(`[data-crit-saisie="${CSS.escape(c)}"]`); if (n) n.focus();
    }));
    racine.querySelectorAll("[data-retirer-filtre]").forEach(b => b.addEventListener("click", async () => {
      const c = b.dataset.retirerFiltre; delete filtre.crit[c];
      await enregistrerFiltres(filtresAffiches().filter(x => x !== c)); dessiner();
    }));
    if ($("li-ajout-filtre")) $("li-ajout-filtre").addEventListener("change", async e => { if (!e.target.value) return; await enregistrerFiltres([...filtresAffiches(), e.target.value]); dessiner(); });
    if ($("li-filtres-defaut")) $("li-filtres-defaut").addEventListener("click", async () => {
      const l = { ...((config && config.valeurs.liens) || {}) }; delete l.filtres;
      try { await S.ecrireConfig("liens", l); config = await S.lireConfig(); } catch (_) { /* droits insuffisants */ }
      dessiner();
    });
    const r = $("li-recherche");
    if (r) r.addEventListener("input", () => { filtre.recherche = r.value; clearTimeout(lier.t); lier.t = setTimeout(() => { const pos = r.selectionStart; dessiner(); const n = $("li-recherche"); n.focus(); n.setSelectionRange(pos, pos); }, 250); });
    if ($("li-avec-mail")) $("li-avec-mail").addEventListener("change", e => { filtre.avecMail = e.target.checked; dessiner(); });
    if ($("li-sans-cle")) $("li-sans-cle").addEventListener("change", e => { filtre.sansCle = e.target.checked; dessiner(); });
    if ($("li-effacer")) $("li-effacer").addEventListener("click", () => { filtre.crit = {}; filtre.recherche = ""; dessiner(); });
    if ($("li-objet")) $("li-objet").addEventListener("input", e => { message.objet = e.target.value; });
    if ($("li-corps")) $("li-corps").addEventListener("input", e => { message.corps = e.target.value; });
    if ($("li-msg-enregistrer")) $("li-msg-enregistrer").addEventListener("click", enregistrerMessage);
    if ($("li-msg-defaut")) $("li-msg-defaut").addEventListener("click", () => { message = { ...MESSAGE_DEFAUT }; $("li-objet").value = message.objet; $("li-corps").value = message.corps; });
    if ($("li-csv")) $("li-csv").addEventListener("click", telecharger);
    if ($("li-csv-voir")) $("li-csv-voir").addEventListener("click", () => { const o = $("li-sortie"), { texte, n } = csv(); o.value = texte.replace(/^﻿/, ""); o.hidden = false; o.select(); dire("li-statut", `${n} ligne(s) : copiez le texte dans un fichier .csv.`); });
    racine.querySelectorAll("[data-copier]").forEach(b => b.addEventListener("click", async () => {
      const l = lienDe(Number(b.dataset.copier));
      try { await navigator.clipboard.writeText(l); b.textContent = "Copié"; } catch (_) { const o = $("li-sortie"); o.hidden = false; o.value = l; o.select(); }
    }));
    racine.querySelectorAll("[data-revoquer]").forEach(b => b.addEventListener("click", () => revoquer(Number(b.dataset.revoquer))));
  }

  async function recharger() { await charger(); dessiner(); }
  async function afficher() {
    racine = $("liens");
    racine.innerHTML = `<div class="bandeau info">Lecture du référentiel…</div>`;
    try { await charger(); } catch (e) { racine.innerHTML = `<div class="bandeau alerte">Lecture impossible : ${esc(e.message || e)}</div>`; return; }
    dessiner();
  }
  window.OngletLiens = { afficher };
})();
