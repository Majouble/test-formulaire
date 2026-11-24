/* =====================================================================
   Administration v2 — onglet « Établissements », carte « Import de la base des fermetures » (2.62.0-alpha.62)
   ---------------------------------------------------------------------
   Un fichier des établissements fermés (CSV, texte tabulé ou Excel ; colonnes date_fermeture, UAI, Etat, et pour
   information Nom, Type, Commune…) devient des dossiers du jour dans une table des réponses : une ligne du fichier
   = un établissement un jour donné = un dossier, avec l'état du fichier comme qualification (« Fermé »,
   « Partiellement ouvert »). Les dossiers importés comptent donc dans la frise des durées et les cartes du tableau
   de bord comme les autres.
   Règles (décisions du 24/11/2026, document « Import de la base des fermetures » du projet) :
   - même UAI et même jour plusieurs fois dans le fichier : une seule ligne, la qualification la plus grave
     (ordre des choix de la colonne Qualification dans Grist, du plus grave au moins grave) ;
   - dossier saisi par un agent pour cet établissement ce jour-là : il prime, l'import n'y écrit rien et liste l'écart ;
   - dossier déjà importé (réimport) : nouvelle version seulement si la qualification a changé ;
   - dossier importé dont l'UAI n'est plus dans le fichier pour ce jour : rien n'est retiré, il est signalé ;
   - UAI absent du référentiel : non importé, listé (nom, type et commune du fichier) pour être ajouté au référentiel ;
   - pas de ligne le lendemain = pas de dossier = fin de l'épisode ; aucun « RAS » automatique.
   Un dossier importé se reconnaît à son auteur (« Import : base des fermetures ») ou, sans colonne Auteur, à son
   commentaire ; un dossier dont une version a été saisie par un agent devient un dossier d'agent.
   Les états doivent figurer dans les choix de la colonne Qualification : leur rang de gravité s'y règle à la main.
   Trace des imports : clé « fermetures » de Config ({ table, imports: [...] }).
   ===================================================================== */
(function () {
  "use strict";
  const S = window.Socle, T = window.Tableur;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nf = n => Number(n || 0).toLocaleString("fr-FR");
  const refId = v => typeof v === "number" ? v : (v && typeof v === "object" && "rowId" in v) ? v.rowId : (Array.isArray(v) && v[0] === "R") ? v[2] : null;
  const AUTEUR = "Import : base des fermetures";
  const ETATS = ["Fermé", "Partiellement ouvert"];
  const LOT = 400, MAX_LISTE = 200, MAX_HISTORIQUE = 50;
  // En-têtes du fichier reconnus (sans accents ni majuscules), dans l'ordre de préférence
  const ENTETES = {
    date: [/^date_?(de_?)?fermeture$/, /^date$/, /date/, /^jour$/],
    uai: [/^uai$/, /^(code_)?(uai|rne)$/, /uai|rne/],
    etat: [/^etat$/, /^etat_/, /ouverture/],
    nom: [/^nom$/, /^nom_/, /appellation|libelle/],
    type: [/^type$/, /^type_/],
    commune: [/^commune$/, /commune|ville/],
  };
  const LIBELLES_ENTETES = { date: "Date de fermeture", uai: "UAI", etat: "État", nom: "Nom", type: "Type", commune: "Commune" };

  let racine = null, ctx = null, tableChoisie = "", fichier = null, plan = null, enCours = false, message = null;

  /* ---------- Outils de dates ---------- */
  const jourFr = j => j ? `${j.slice(8, 10)}/${j.slice(5, 7)}/${j.slice(0, 4)}` : "";
  const isoUTC = s => { const d = new Date(Number(s) * 1000); return isNaN(d) ? "" : d.toISOString().slice(0, 10); };
  const secondesJour = (j, dateHeure) => { const [a, m, d] = j.split("-").map(Number); return Date.UTC(a, m - 1, d, dateHeure ? 11 : 0) / 1000; };
  const aujourdhui = () => S.jourParis(Date.now() / 1000);

  /* ---------- Contexte : table des réponses, rôles, qualifications ---------- */
  async function contexte() {
    const meta = await S.lireMeta(), config = await S.lireConfig(meta);
    if (!config) throw new Error("La table Config n'existe pas : terminez d'abord l'installation.");
    const general = S.general(config), reglage = config.valeurs.fermetures || {};
    const espaces = S.espaces(general).filter(e => meta[e.reponses] && meta[e.referentiel]);
    if (!espaces.length) throw new Error("Aucune table des réponses installée.");
    if (!espaces.some(e => e.reponses === tableChoisie))
      tableChoisie = (espaces.find(e => e.reponses === reglage.table) || espaces.find(e => e.champ === "EN") || espaces[0]).reponses;
    const espace = espaces.find(e => e.reponses === tableChoisie);
    const roles = config.valeurs.roles || {};
    const rRep = S.resoudreRoles("reponses", meta[espace.reponses], { reponses: espace.reponses, referentiel: espace.referentiel },
      espace.reponses === general.reponses ? roles.reponses || {} : {}, {});
    const rRef = S.resoudreRoles("referentiel", meta[espace.referentiel], { reponses: espace.reponses, referentiel: espace.referentiel },
      espace.referentiel === general.referentiel ? roles.referentiel || {} : {}, {});
    const c = r => (rRep[r] && rRep[r].col) || null, colsRep = meta[espace.reponses].colonnes;
    const ecrivable = id => id && colsRep[id] && !colsRep[id].isFormula;
    const cols = {
      etab: c("Etablissement"), dossier: c("Dossier"), faits: c("Date_faits"), cree: c("Cree_le"), nature: c("Nature"),
      qualif: c("Qualification"), desc: c("Description"), comm: c("Commentaire"), auteur: c("Auteur"), grave: c("Etat_plus_grave"),
      uai: rRef.UAI && rRef.UAI.col, nom: rRef.Nom && rRef.Nom.col, commune: rRef.Commune && rRef.Commune.col,
    };
    const manque = [];
    if (!cols.etab) manque.push("Établissement");
    if (!cols.dossier) manque.push("Dossier");
    if (!cols.faits) manque.push("Date des faits");
    if (!cols.qualif) manque.push("Qualification");
    if (!cols.uai) manque.push(`UAI (référentiel ${espace.referentiel})`);
    if (!ecrivable(cols.auteur) && !ecrivable(cols.comm)) manque.push("Auteur ou Commentaire (pour reconnaître les dossiers importés)");
    const mq = colsRep[cols.qualif] || {};
    let opts = {}; try { opts = mq.widgetOptions ? JSON.parse(mq.widgetOptions) : {}; } catch (_) { opts = {}; }
    const retour = new Set((general.retour_normale || ["RAS"]).map(S.norm));
    const choix = Array.isArray(opts.choices) ? opts.choices : [];
    return { meta, config, general, reglage, espaces, espace, cols, manque, ecrivable, retour,
      qualif: { type: String(mq.type || ""), liste: /^ChoiceList/.test(mq.type || ""), choix, opts, graves: choix.filter(q => !retour.has(S.norm(q))) } };
  }
  // Rang de gravité d'une qualification (0 = la plus grave) ; hors des choix : après tous les choix
  const rang = q => { const i = ctx.qualif.graves.indexOf(q); return i < 0 ? ctx.qualif.graves.length : i; };
  // Valeur du fichier → choix de la colonne Qualification (sans accents ni majuscules) ; colonne sans choix : états connus
  function qualificationDe(brut) {
    const n = S.norm(brut); if (!n) return null;
    const liste = ctx.qualif.choix.length ? ctx.qualif.graves : ETATS;
    return liste.find(q => S.norm(q) === n) || null;
  }

  /* ---------- Formule de l'état le plus grave : ordre de gravité figé à l'installation ---------- */
  function ordreFormule() {
    const c = ctx.cols.grave && ctx.meta[ctx.espace.reponses].colonnes[ctx.cols.grave];
    if (!c || !c.isFormula) return null;
    const m = /^ORDRE = (\[.*\])$/m.exec(c.formula || ""); if (!m) return null;
    try { return JSON.parse(m[1]); } catch (_) { return null; }
  }
  const formuleEnRetard = () => { const o = ordreFormule(); return !!o && ctx.qualif.choix.length > 0 && JSON.stringify(o) !== JSON.stringify(ctx.qualif.graves); };

  /* ---------- Lecture du fichier ---------- */
  function reconnaitre(entetes) {
    const res = {}, pris = new Set();
    for (const [cle, motifs] of Object.entries(ENTETES)) {
      for (const m of motifs) {
        const h = entetes.find(e => !pris.has(e) && m.test(S.norm(e)) && !(cle === "etat" && /statut/.test(S.norm(e))));
        if (h) { res[cle] = h; pris.add(h); break; }
      }
    }
    return res;
  }
  async function lireFichier(f) {
    const classeur = await T.lireFichier(f);
    // première feuille qui a une colonne UAI et une colonne de date
    for (const nom of classeur.noms) {
      const feuille = await classeur.lire(nom); if (!feuille) continue;
      const colonnes = reconnaitre(feuille.entetes);
      if (colonnes.uai && colonnes.date) return { nom: f.name, feuille: nom, ...feuille, colonnes };
    }
    throw new Error("Aucune feuille du fichier n'a de colonne « UAI » et de colonne de date (date_fermeture).");
  }

  /* ---------- Analyse ---------- */
  async function analyser() {
    const { cols, espace } = ctx;
    const [rep, ref] = await Promise.all([grist.docApi.fetchTable(espace.reponses), grist.docApi.fetchTable(espace.referentiel)]);
    // référentiel : UAI → établissement
    const parUai = new Map(), nomEtab = new Map();
    ref.id.forEach((id, i) => {
      const u = String(ref[cols.uai][i] ?? "").trim().toUpperCase();
      if (u && !parUai.has(u)) parUai.set(u, id);
      nomEtab.set(id, { nom: cols.nom ? ref[cols.nom][i] : "", commune: cols.commune ? ref[cols.commune][i] : "", uai: u });
    });
    // réponses : dossiers, jour de chaque version, versions importées
    const typeFaits = String((ctx.meta[espace.reponses].colonnes[cols.faits] || {}).type || "");
    const jourVersion = i => {
      const f = rep[cols.faits] ? rep[cols.faits][i] : null;
      if (f != null && f !== "") return /^DateTime/.test(typeFaits) ? S.jourParis(f) : isoUTC(f);
      const c = cols.cree && rep[cols.cree] ? rep[cols.cree][i] : null;
      return c != null && c !== "" ? S.jourParis(c) : "";
    };
    const importee = i => (cols.auteur && rep[cols.auteur] && rep[cols.auteur][i] === AUTEUR)
      || (!cols.auteur && cols.comm && rep[cols.comm] && String(rep[cols.comm][i] || "").startsWith(AUTEUR));
    const qualifsDe = i => { const v = rep[cols.qualif] ? rep[cols.qualif][i] : null; return Array.isArray(v) ? v.slice(1) : v ? [v] : []; };
    const dossiers = new Map();
    rep.id.forEach((id, i) => {
      const d = refId(rep[cols.dossier] && rep[cols.dossier][i]) || id;
      if (!dossiers.has(d)) dossiers.set(d, { id: d, versions: [] });
      dossiers.get(d).versions.push({ id, i, jour: jourVersion(i), cree: cols.cree && rep[cols.cree] ? rep[cols.cree][i] || 0 : 0, importee: importee(i), etab: refId(rep[cols.etab][i]) });
    });
    const parCle = new Map();   // établissement|jour → dossiers qui ont une version ce jour-là
    for (const d of dossiers.values()) {
      d.versions.sort((a, b) => (a.cree - b.cree) || (a.id - b.id));
      d.etab = (d.versions.find(v => v.id === d.id) || d.versions[0]).etab;
      d.importe = d.versions.every(v => v.importee);
      d.derniere = d.versions[d.versions.length - 1];
      for (const j of new Set(d.versions.map(v => v.jour))) {
        if (!j || !d.etab) continue;
        const k = `${d.etab}|${j}`;
        if (!parCle.has(k)) parCle.set(k, []);
        parCle.get(k).push(d);
      }
    }
    // fichier : une entrée par UAI et par jour, la plus grave
    const c = fichier.colonnes, rejetees = [], etatsInconnus = new Map(), entrees = new Map();
    let fusionnees = 0;
    fichier.lignes.forEach((l, k) => {
      const jour = T.jourDe(l[c.date]), uai = String(l[c.uai] ?? "").trim().toUpperCase(), brut = String(c.etat ? l[c.etat] ?? "" : "").trim();
      const ligne = k + 2, info = { uai, nom: c.nom ? l[c.nom] : "", type: c.type ? l[c.type] : "", commune: c.commune ? l[c.commune] : "" };
      if (!uai) return rejetees.push({ ligne, motif: "UAI vide", ...info });
      if (!jour) return rejetees.push({ ligne, motif: `date illisible (« ${l[c.date] ?? ""} »)`, ...info });
      const q = c.etat ? qualificationDe(brut) : null;
      if (!q) { etatsInconnus.set(brut || "(vide)", (etatsInconnus.get(brut || "(vide)") || 0) + 1); return rejetees.push({ ligne, motif: `état non reconnu (« ${brut} »)`, ...info }); }
      const cle = `${uai}|${jour}`, e = entrees.get(cle);
      if (!e) entrees.set(cle, { ...info, jour, qualif: q });
      else { fusionnees++; if (rang(q) < rang(e.qualif)) e.qualif = q; }
    });
    // classement
    const p = { creations: [], versions: [], inchanges: [], concordants: [], ecarts: [], inconnus: [], absents: [], rejetees, etatsInconnus, fusionnees,
      lignes: fichier.lignes.length, jours: new Set() };
    const vusEtabJour = new Set();
    for (const e of entrees.values()) {
      p.jours.add(e.jour);
      const etab = parUai.get(e.uai);
      if (!etab) { p.inconnus.push(e); continue; }
      const ref = nomEtab.get(etab) || {}, x = { ...e, etab, nomRef: ref.nom || e.nom, communeRef: ref.commune || e.commune };
      vusEtabJour.add(`${etab}|${e.jour}`);
      const ds = parCle.get(`${etab}|${e.jour}`) || [], agents = ds.filter(d => !d.importe), imp = ds.filter(d => d.importe);
      if (agents.length) {
        // qualification de la version la plus récente de ce jour (état actuel du dossier de l'agent)
        const vs = agents.flatMap(d => d.versions.filter(v => v.jour === e.jour)).sort((a, b) => (a.cree - b.cree) || (a.id - b.id));
        const qa = vs.length ? qualifsDe(vs[vs.length - 1].i).sort((a, b) => rang(a) - rang(b))[0] || "" : "";
        (qa === e.qualif ? p.concordants : p.ecarts).push({ ...x, qualifAgent: qa, dossier: agents[0].id });
      } else if (imp.length) {
        const d = imp[0], qd = qualifsDe(d.derniere.i)[0] || "";
        if (qd === e.qualif) p.inchanges.push({ ...x, dossier: d.id });
        else p.versions.push({ ...x, avant: qd, dossier: d.id });
      } else p.creations.push(x);
    }
    // dossiers importés absents du fichier, pour les jours que couvre le fichier
    for (const d of dossiers.values()) {
      if (!d.importe || !d.etab) continue;
      const j = (d.versions.find(v => v.id === d.id) || d.versions[0]).jour;
      if (!p.jours.has(j) || vusEtabJour.has(`${d.etab}|${j}`)) continue;
      const ref = nomEtab.get(d.etab) || {};
      p.absents.push({ uai: ref.uai, nomRef: ref.nom, communeRef: ref.commune, jour: j, qualif: qualifsDe(d.derniere.i)[0] || "", dossier: d.id });
    }
    const tri = (a, b) => (a.jour < b.jour ? -1 : a.jour > b.jour ? 1 : String(a.uai).localeCompare(String(b.uai)));
    for (const k of ["creations", "versions", "inchanges", "concordants", "ecarts", "inconnus", "absents"]) p[k].sort(tri);
    return p;
  }

  /* ---------- Écriture ---------- */
  function champs(x, nature, dossier) {
    const { cols, ecrivable } = ctx, f = {};
    const typeFaits = String((ctx.meta[ctx.espace.reponses].colonnes[cols.faits] || {}).type || "");
    f[cols.etab] = x.etab;
    f[cols.faits] = secondesJour(x.jour, /^DateTime/.test(typeFaits));
    f[cols.qualif] = ctx.qualif.liste ? ["L", x.qualif] : x.qualif;
    if (dossier) f[cols.dossier] = dossier;
    if (ecrivable(cols.nature)) f[cols.nature] = nature;
    if (ecrivable(cols.desc)) f[cols.desc] = `${x.qualif} selon la base des fermetures du ${jourFr(x.jour)}.`;
    if (ecrivable(cols.auteur)) f[cols.auteur] = AUTEUR;
    if (ecrivable(cols.comm)) f[cols.comm] = `${AUTEUR} — fichier « ${fichier.nom} », importé le ${jourFr(aujourdhui())}.`;
    // date de saisie : posée par Grist (formule d'initialisation), sinon l'heure de l'import
    const mc = cols.cree && ctx.meta[ctx.espace.reponses].colonnes[cols.cree];
    if (mc && !mc.isFormula && !mc.formula) f[cols.cree] = Date.now() / 1000;
    return f;
  }
  const enColonnes = liste => { const r = {}; liste.forEach((f, k) => { for (const [c, v] of Object.entries(f)) { (r[c] = r[c] || new Array(liste.length).fill(null))[k] = v; } }); return r; };
  async function ajouter(table, liste) {
    const ids = [];
    for (let k = 0; k < liste.length; k += LOT) {
      const lot = liste.slice(k, k + LOT);
      const r = await grist.docApi.applyUserActions([["BulkAddRecord", table, lot.map(() => null), enColonnes(lot)]]);
      const rv = r && r.retValues ? r.retValues[0] : null;
      if (!Array.isArray(rv) || rv.length !== lot.length) throw new Error("Grist n'a pas rendu les numéros des lignes créées.");
      ids.push(...rv);
      fait += lot.length;
      const b = $("fm-progression"); if (b) b.value = fait;
    }
    return ids;
  }
  let fait = 0, total = 0;   // lignes écrites / à écrire (barre de progression)
  async function importer() {
    if (enCours || !plan) return;
    enCours = true; message = null;
    try {
      // relecture juste avant l'écriture : un agent a pu saisir entre-temps
      S.viderCacheLecture();
      ctx = await contexte(); plan = await analyser();
      const table = ctx.espace.reponses;
      total = plan.creations.length + plan.versions.length; fait = 0;
      if (!total) { message = { texte: "Rien à écrire : le document est déjà à jour pour ce fichier.", ok: true }; return; }
      if (!confirm(`Créer ${plan.creations.length} dossier(s) et ajouter ${plan.versions.length} version(s) dans la table ${table} ?`)) return;
      dessiner();
      // 1. nouveaux dossiers, rattachés à eux-mêmes ; 2. nouvelles versions des dossiers importés
      const ids = await ajouter(table, plan.creations.map(x => champs(x, S.NATURES[0], null)));
      for (let k = 0; k < ids.length; k += LOT) {
        const lot = ids.slice(k, k + LOT);
        await grist.docApi.applyUserActions([["BulkUpdateRecord", table, lot, { [ctx.cols.dossier]: lot }]]);
      }
      await ajouter(table, plan.versions.map(x => champs(x, S.NATURES[1], x.dossier)));
      const trace = { le: new Date().toISOString(), table, fichier: fichier.nom, lignes: plan.lignes, crees: plan.creations.length, versions: plan.versions.length,
        inchanges: plan.inchanges.length, concordants: plan.concordants.length, ecarts: plan.ecarts.length, inconnus: plan.inconnus.length,
        absents: plan.absents.length, rejetees: plan.rejetees.length, jours: [...plan.jours].sort() };
      const cfg = await S.lireConfig(), r = (cfg && cfg.valeurs.fermetures) || {};
      await S.ecrireConfig("fermetures", { ...r, table, imports: [...(r.imports || []), trace].slice(-MAX_HISTORIQUE) });
      message = { texte: `Import terminé : ${nf(trace.crees)} dossier(s) créé(s), ${nf(trace.versions)} version(s) ajoutée(s).`, ok: true };
      S.viderCacheLecture();
      ctx = await contexte(); plan = await analyser();
    } catch (e) {
      message = { texte: `Échec de l'import : ${e.message || e}. Les lignes déjà écrites restent ; relancer l'import ne crée pas de doublon.`, ok: false };
    } finally { enCours = false; dessiner(); }
  }

  /* ---------- Réglages de la colonne Qualification ---------- */
  async function ajouterChoix(valeurs) {
    const { qualif, cols, espace, retour } = ctx, choix = qualif.choix.slice();
    const pos = choix.findIndex(q => retour.has(S.norm(q)));   // avant les qualifications de retour à la normale
    const nouveaux = valeurs.filter(v => !choix.some(q => S.norm(q) === S.norm(v)));
    choix.splice(pos < 0 ? choix.length : pos, 0, ...nouveaux);
    await grist.docApi.applyUserActions([["ModifyColumn", espace.reponses, cols.qualif, { widgetOptions: JSON.stringify({ ...qualif.opts, choices: choix }) }]]);
    if (window.Repartition && window.Repartition.majSchemaPublic) {   // copie des colonnes lue par les liens d'établissement
      try { const g = S.general(await S.lireConfig()); await window.Repartition.majSchemaPublic(await S.lireMeta(), await S.lireConfig(), g, await window.Repartition.lireFormulairesPublies(g)); } catch (_) { /* rafraîchie à l'ouverture de l'onglet */ }
    }
  }
  async function majFormuleGrave() {
    const { cols, espace, qualif } = ctx, c = ctx.meta[espace.reponses].colonnes[cols.grave];
    const formule = S.formuleEtatPlusGrave({ reponses: espace.reponses, cols: { Etablissement: cols.etab, Date_faits: cols.faits, Cree_le: cols.cree, Qualification: cols.qualif } }, qualif.choix);
    const modif = { formula: formule };
    if (/^Choice$/.test(c.type)) {
      const graves = qualif.choix.filter(q => !/^\s*ras\s*$/i.test(q)), o = {};
      graves.forEach(q => { if (qualif.opts.choiceOptions && qualif.opts.choiceOptions[q]) o[q] = qualif.opts.choiceOptions[q]; });
      modif.widgetOptions = JSON.stringify({ choices: graves, choiceOptions: o });
    }
    await grist.docApi.applyUserActions([["ModifyColumn", espace.reponses, cols.grave, modif]]);
  }

  /* ---------- Affichage ---------- */
  function csv(nom, entetes, lignes) {
    const cell = s => { s = String(s ?? ""); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const texte = [entetes, ...lignes].map(l => l.map(cell).join(";")).join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + texte], { type: "text/csv;charset=utf-8" }));
    a.download = `${nom}-${aujourdhui()}.csv`; a.click();
  }
  const LISTES = {
    creations: { titre: "Dossiers à créer", entetes: ["Jour", "UAI", "Établissement", "Commune", "Qualification"], ligne: x => [jourFr(x.jour), x.uai, x.nomRef, x.communeRef, x.qualif] },
    versions: { titre: "Dossiers importés dont la qualification change (nouvelle version)", entetes: ["Jour", "UAI", "Établissement", "Commune", "Avant", "Après", "Dossier"],
      ligne: x => [jourFr(x.jour), x.uai, x.nomRef, x.communeRef, x.avant, x.qualif, x.dossier] },
    inchanges: { titre: "Dossiers importés inchangés", entetes: ["Jour", "UAI", "Établissement", "Qualification", "Dossier"], ligne: x => [jourFr(x.jour), x.uai, x.nomRef, x.qualif, x.dossier] },
    concordants: { titre: "Déjà saisis par un agent, même qualification", entetes: ["Jour", "UAI", "Établissement", "Qualification", "Dossier"], ligne: x => [jourFr(x.jour), x.uai, x.nomRef, x.qualif, x.dossier] },
    ecarts: { titre: "Écarts avec un dossier saisi par un agent (le dossier de l'agent prime, rien n'est écrit)", entetes: ["Jour", "UAI", "Établissement", "Commune", "Base des fermetures", "Dossier de l'agent", "Dossier"],
      ligne: x => [jourFr(x.jour), x.uai, x.nomRef, x.communeRef, x.qualif, x.qualifAgent || "(sans qualification)", x.dossier] },
    inconnus: { titre: "UAI absents du référentiel (non importés)", entetes: ["Jour", "UAI", "Nom (fichier)", "Type (fichier)", "Commune (fichier)", "État"],
      ligne: x => [jourFr(x.jour), x.uai, x.nom, x.type, x.commune, x.qualif] },
    absents: { titre: "Dossiers importés absents du fichier pour leur jour (rien n'est retiré)", entetes: ["Jour", "UAI", "Établissement", "Qualification", "Dossier"],
      ligne: x => [jourFr(x.jour), x.uai, x.nomRef, x.qualif, x.dossier] },
    rejetees: { titre: "Lignes du fichier écartées", entetes: ["Ligne", "Motif", "UAI", "Nom (fichier)", "Commune (fichier)"], ligne: x => [x.ligne, x.motif, x.uai, x.nom, x.commune] },
  };
  function liste(cle, alerte) {
    const L = LISTES[cle], l = plan[cle];
    if (!l.length) return "";
    const lignes = l.slice(0, MAX_LISTE).map(x => `<tr>${L.ligne(x).map(v => `<td>${esc(v)}</td>`).join("")}</tr>`).join("");
    return `<details${alerte ? " open" : ""}><summary><b>${nf(l.length)}</b> — ${esc(L.titre)}</summary>
      <div class="fm-detail"><table><tr>${L.entetes.map(h => `<th>${esc(h)}</th>`).join("")}</tr>${lignes}</table></div>
      ${l.length > MAX_LISTE ? `<p class="note">${nf(MAX_LISTE)} premières lignes sur ${nf(l.length)} : la liste complète est dans le fichier.</p>` : ""}
      <p><button type="button" class="secondaire" data-fm="csv" data-liste="${cle}">Télécharger la liste (.csv)</button></p></details>`;
  }
  function blocQualifications() {
    const { qualif, cols, espace } = ctx;
    if (!qualif.choix.length) return `<p class="note">La colonne ${esc(cols.qualif)} n'a pas de liste de choix : les états « ${ETATS.join(" », « ")} » sont écrits tels quels.</p>`;
    const voulus = [...new Set([...ETATS, ...(plan ? [...plan.etatsInconnus.keys()].filter(v => v !== "(vide)") : [])])];
    const manquants = voulus.filter(v => !qualificationDe(v));
    const rangs = ETATS.filter(v => qualificationDe(v)).map(v => `« ${esc(qualificationDe(v))} » : rang ${rang(qualificationDe(v)) + 1} sur ${qualif.graves.length}`);
    let h = `<p>Ordre de gravité (choix de la colonne <code>${esc(cols.qualif)}</code> de ${esc(espace.reponses)}, du plus grave au moins grave) : ${qualif.graves.map(q => esc(q)).join(" › ") || "—"}.`
      + `${rangs.length ? ` ${rangs.join(" ; ")}.` : ""} Le rang se règle dans Grist, en déplaçant les choix de la colonne.</p>`;
    if (manquants.length) h += `<p class="avert">Absent des choix de qualification : ${manquants.map(v => `« ${esc(v)} »`).join(", ")}. L'import écarte les lignes qui portent cet état.
      <button type="button" class="secondaire" data-fm="choix" data-valeurs="${esc(JSON.stringify(manquants))}">Ajouter aux choix</button>
      <span class="note">(placés avant les qualifications de retour à la normale ; déplacez-les ensuite à leur rang dans Grist)</span></p>`;
    if (formuleEnRetard()) h += `<p class="avert">La formule <code>${esc(cols.grave)}</code> (état le plus grave) garde l'ordre de gravité de l'installation : ${esc(JSON.stringify(ordreFormule()))}.
      <button type="button" class="secondaire" data-fm="formule">Reprendre l'ordre actuel des choix</button></p>`;
    return h;
  }
  function blocPlan() {
    if (!fichier) return "";
    const c = fichier.colonnes;
    let h = `<p>Fichier « ${esc(fichier.nom)} »${fichier.feuille && fichier.feuille !== "Feuille 1" ? `, feuille « ${esc(fichier.feuille)} »` : ""} : ${nf(fichier.lignes.length)} ligne(s).
      Colonnes reconnues : ${Object.keys(LIBELLES_ENTETES).map(k => `${LIBELLES_ENTETES[k]} = ${c[k] ? `« ${esc(c[k])} »` : "<i>absente</i>"}`).join(" · ")}.</p>`;
    if (!c.etat) h += `<p class="avert">Aucune colonne « Etat » : impossible de connaître la qualification.</p>`;
    if (!plan) return h;
    const jours = [...plan.jours].sort();
    h += `<p>${nf(plan.creations.length + plan.versions.length + plan.inchanges.length + plan.concordants.length + plan.ecarts.length + plan.inconnus.length)} établissement(s) × jour,
      ${jours.length ? `du ${jourFr(jours[0])} au ${jourFr(jours[jours.length - 1])}` : "aucun jour lisible"}${plan.fusionnees ? ` (${nf(plan.fusionnees)} ligne(s) en double fusionnée(s), la qualification la plus grave est gardée)` : ""}.</p>
      <table class="fm-compte"><tr><th>À écrire</th><th class="n">Dossiers à créer</th><td class="n">${nf(plan.creations.length)}</td><th class="n">Nouvelles versions</th><td class="n">${nf(plan.versions.length)}</td></tr>
      <tr><th>Sans écriture</th><th class="n">Inchangés</th><td class="n">${nf(plan.inchanges.length)}</td><th class="n">Déjà saisis par un agent</th><td class="n">${nf(plan.concordants.length)}</td></tr>
      <tr><th>À examiner</th><th class="n">Écarts avec un agent</th><td class="n">${nf(plan.ecarts.length)}</td><th class="n">UAI inconnus</th><td class="n">${nf(plan.inconnus.length)}</td></tr>
      <tr><th></th><th class="n">Importés absents du fichier</th><td class="n">${nf(plan.absents.length)}</td><th class="n">Lignes écartées</th><td class="n">${nf(plan.rejetees.length)}</td></tr></table>`;
    h += ["ecarts", "inconnus", "rejetees", "absents"].map(k => liste(k, k !== "absents")).join("") + ["creations", "versions", "inchanges", "concordants"].map(k => liste(k)).join("");
    const n = plan.creations.length + plan.versions.length;
    h += `<p class="note">Chaque ligne créée est un signalement comme un autre : si un relais (n8n vers Tchap…) publie chaque nouvelle version, filtrez-y l'auteur « ${esc(AUTEUR)} » avant d'importer un gros fichier.</p>
      <p><button type="button" class="primaire" data-fm="importer"${n && !enCours && !ctx.manque.length ? "" : " disabled"}>${n ? `Importer : ${nf(plan.creations.length)} dossier(s), ${nf(plan.versions.length)} version(s)` : "Rien à importer"}</button>
      ${enCours ? ` <progress id="fm-progression" max="${total}" value="${fait}"></progress>` : ""}</p>`;
    return h;
  }
  function blocHistorique() {
    const l = (ctx.reglage.imports || []).slice().reverse();
    if (!l.length) return "";
    return `<details><summary>Imports précédents (${l.length})</summary><div class="fm-detail"><table><tr><th>Date</th><th>Fichier</th><th>Table</th><th class="n">Jours</th><th class="n">Dossiers créés</th><th class="n">Versions</th><th class="n">Écarts</th><th class="n">UAI inconnus</th></tr>
      ${l.map(x => `<tr><td>${esc(new Date(x.le).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" }))}</td><td>${esc(x.fichier)}</td><td>${esc(x.table)}</td>
        <td class="n">${(x.jours || []).length}</td><td class="n">${nf(x.crees)}</td><td class="n">${nf(x.versions)}</td><td class="n">${nf(x.ecarts)}</td><td class="n">${nf(x.inconnus)}</td></tr>`).join("")}</table></div></details>`;
  }
  function dessiner() {
    if (!racine) return;
    if (!ctx) { racine.innerHTML = ""; return; }
    const { espaces, espace, manque } = ctx;
    racine.innerHTML = `<section class="carte" id="fermetures-carte"><h2>Import de la base des fermetures</h2>
      <p class="note">Chaque ligne du fichier (date de fermeture, UAI, état) devient le dossier du jour de l'établissement, avec l'état comme qualification : les fermetures comptent dans la frise des durées et les cartes du tableau de bord.
      Un dossier saisi par un agent le même jour prime ; un réimport ne crée pas de doublon ; un UAI absent du référentiel n'est pas importé.</p>
      ${espaces.length > 1 ? `<p><label>Table des réponses <select id="fm-table">${espaces.map(e => `<option value="${esc(e.reponses)}"${e.reponses === espace.reponses ? " selected" : ""}>${esc(e.libelle)} — ${esc(e.reponses)}</option>`).join("")}</select></label></p>` : ""}
      ${manque.length ? `<p class="avert">Colonnes introuvables dans ${esc(espace.reponses)} : ${manque.map(esc).join(", ")}. Voir l'onglet Installation.</p>` : blocQualifications()}
      <p><label>Fichier (.csv, .txt ou .xlsx) <input type="file" id="fm-fichier" accept=".csv,.txt,.tsv,.xlsx,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"${enCours ? " disabled" : ""}></label></p>
      ${message ? `<p class="${message.ok ? "ok" : "avert"}" role="status">${esc(message.texte)}</p>` : ""}
      ${blocPlan()}${blocHistorique()}</section>`;
    lier();
  }
  async function surFichier(f) {
    message = null; plan = null; fichier = null;
    try {
      fichier = await lireFichier(f);
      if (fichier.colonnes.etat && !ctx.manque.length) plan = await analyser();
    } catch (e) { message = { texte: e.message || String(e), ok: false }; }
    dessiner();
  }
  async function rafraichir() {
    S.viderCacheLecture();
    ctx = await contexte();
    if (fichier && fichier.colonnes.etat && !ctx.manque.length) plan = await analyser();
    dessiner();
  }
  function lier() {
    const f = $("fm-fichier"); if (f) f.addEventListener("change", e => { if (e.target.files[0]) surFichier(e.target.files[0]); });
    const t = $("fm-table"); if (t) t.addEventListener("change", async () => { tableChoisie = t.value; plan = null; await rafraichir().catch(e => { message = { texte: e.message, ok: false }; dessiner(); }); });
    racine.querySelectorAll("[data-fm]").forEach(b => b.addEventListener("click", async () => {
      const a = b.dataset.fm;
      try {
        if (a === "importer") await importer();
        else if (a === "csv") { const L = LISTES[b.dataset.liste]; csv(`fermetures-${b.dataset.liste}`, L.entetes, plan[b.dataset.liste].map(L.ligne)); }
        else if (a === "choix") { await ajouterChoix(JSON.parse(b.dataset.valeurs)); message = { texte: "Choix ajoutés à la colonne de qualification : placez-les à leur rang de gravité dans Grist.", ok: true }; await rafraichir(); }
        else if (a === "formule") { await majFormuleGrave(); message = { texte: "Formule de l'état le plus grave mise à jour d'après l'ordre actuel des choix.", ok: true }; await rafraichir(); }
      } catch (e) { message = { texte: `Échec : ${e.message || e}`, ok: false }; dessiner(); }
    }));
  }

  async function afficher() {
    racine = $("fermetures");
    if (!racine || enCours) return;
    try { ctx = await contexte(); if (fichier && fichier.colonnes.etat && !ctx.manque.length) plan = await analyser(); dessiner(); }
    catch (e) { racine.innerHTML = `<section class="carte"><h2>Import de la base des fermetures</h2><p class="avert">Lecture impossible : ${esc(e.message || e)}</p></section>`; }
  }
  window.OngletFermetures = { afficher, AUTEUR };
})();
