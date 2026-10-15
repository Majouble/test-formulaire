/* =====================================================================
   Socle commun des widgets v2 — Signalements Grist
   ---------------------------------------------------------------------
   Tous les widgets v2 chargent ce fichier. Il fixe :
   - les noms des tables du socle (modifiables par la clé « general » de Config) ;
   - les rôles des colonnes et la façon de les retrouver ;
   - la lecture et l'écriture de la table Config ;
   - le plan d'installation (ce qu'il faut créer pour qu'un document soit complet).
   Contrat de référence : document « Signalements Grist — remise à plat », section « Contrat du socle ».
   ===================================================================== */
(function () {
  "use strict";

  const VERSION = "2.0.0-alpha.2 (15/10/2026)";

  /* ---------- Noms par défaut ---------- */
  const TABLE_CONFIG = "Config";          // seul nom fixe : c'est là qu'on lit les autres
  const DEFAUTS_GENERAL = {
    situation: "",                         // nom de la situation suivie (« Mouvements octobre 2026 »…)
    preset: "en",                          // « en » (établissements scolaires) ou « esr »
    academies: [],                         // académies couvertes par le document
    reponses: "Reponses",                  // table des versions de signalements
    referentiel: "Etablissements",         // table des établissements (et des sites)
    formulaires: "Formulaires",            // table des formulaires
    retour_normale: ["RAS"],               // qualifications qui valent retour à la normale
  };
  const NATURES = ["Nouveau signalement", "Mise à jour"];

  /* ---------- Outils ---------- */
  // « Établissement_ESR » → « etablissement_esr » : comparaison sans accents ni majuscules
  const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const typeBase = t => String(t || "").split(":")[0];
  const cibleRef = t => (/^Ref:(.+)$/.exec(String(t || "")) || [])[1] || null;
  const json = v => JSON.stringify(v);
  const maintenant = () => Date.now() / 1000;


  /* ---------- Régions académiques ---------- */
  const REGIONS_ACADEMIQUES = {
    "Auvergne-Rhône-Alpes": ["Clermont-Ferrand", "Grenoble", "Lyon"], "Bourgogne-Franche-Comté": ["Besançon", "Dijon"], "Bretagne": ["Rennes"],
    "Centre-Val de Loire": ["Orléans-Tours"], "Corse": ["Corse"], "Grand Est": ["Nancy-Metz", "Reims", "Strasbourg"], "Hauts-de-France": ["Amiens", "Lille"],
    "Île-de-France": ["Créteil", "Paris", "Versailles"], "Normandie": ["Normandie", "Caen", "Rouen"], "Nouvelle-Aquitaine": ["Bordeaux", "Limoges", "Poitiers"],
    "Occitanie": ["Montpellier", "Toulouse"], "Pays de la Loire": ["Nantes"], "Provence-Alpes-Côte d'Azur": ["Aix-Marseille", "Nice"],
    "Guadeloupe": ["Guadeloupe"], "Martinique": ["Martinique"], "Guyane": ["Guyane"], "La Réunion": ["La Réunion", "Réunion"], "Mayotte": ["Mayotte"],
  };
  const REGION_PAR_ACADEMIE = new Map(Object.entries(REGIONS_ACADEMIQUES).flatMap(([r, l]) => l.map(a => [norm(a), r])));
  const regionDeAcademie = a => REGION_PAR_ACADEMIE.get(norm(a)) || "";

  /* ---------- Rôles ----------
     Chaque rôle : nom canonique, libellé, obligatoire, test de type (accepte), motifs de reconnaissance,
     et la colonne à créer quand il manque (creer). ctx = { reponses, referentiel, cols } (noms résolus). */
  const ROLES = {
    reponses: [
      { role: "Etablissement", libelle: "Établissement", obligatoire: true,
        accepte: (c, ctx) => /^Ref:/.test(c.type) && cibleRef(c.type) !== ctx.reponses,
        motifs: [/etablissement/, /(^|_)etab(_|$)/, /structure|universite|ecole|college|lycee/],
        creer: ctx => ({ type: `Ref:${ctx.referentiel}`, isFormula: false }) },
      { role: "Dossier", libelle: "Dossier (signalement initial)", obligatoire: true,
        accepte: (c, ctx) => c.type === `Ref:${ctx.reponses}`,
        motifs: [/(^|_)dossier(_|$)/, /signalement_?initial/],
        creer: ctx => ({ type: `Ref:${ctx.reponses}`, isFormula: false }) },
      { role: "Date_faits", libelle: "Date des faits", obligatoire: true,
        accepte: c => /^(Date|DateTime)$/.test(typeBase(c.type)) && !c.isFormula,
        motifs: [/faits?(_|$)/, /date_?(de_?l_?)?evenement/],
        creer: () => ({ type: "Date", isFormula: false }) },
      { role: "Cree_le", libelle: "Date de saisie", obligatoire: true,
        accepte: c => /^(Date|DateTime)$/.test(typeBase(c.type)),
        motifs: [/cree_?le|horodat|creation/, /^date_?(de_?)?(saisie|creation|version)/, /^date$/],
        // formule d'initialisation : l'heure du serveur Grist, posée à la création de la ligne
        creer: () => ({ type: "DateTime:Europe/Paris", isFormula: false, formula: "NOW()" }) },
      { role: "Nature", libelle: "Nature (nouveau signalement ou mise à jour)", obligatoire: true,
        accepte: c => /^(Choice|Text)$/.test(typeBase(c.type)) && !c.isFormula,
        motifs: [/^nature$/, /nature_?(du_?)?(signalement|version|saisie)/, /initial_?suivi/],
        creer: () => ({ type: "Choice", isFormula: false, widgetOptions: json({ choices: NATURES }) }) },
      { role: "Qualification", libelle: "Qualification", obligatoire: true,
        accepte: c => /^(Choice|ChoiceList|Text)$/.test(typeBase(c.type)) && !c.isFormula,
        motifs: [/qualif/, /categorie_?(du_?)?(signalement|evenement)/, /type_?(d_?)?evenement/],
        creer: () => ({ type: "Choice", isFormula: false, widgetOptions: json({ choices: ["RAS"] }) }) },
      { role: "Description", libelle: "Description", obligatoire: true,
        accepte: c => typeBase(c.type) === "Text" && !c.isFormula,
        motifs: [/^description$/, /^description/, /recit|resume_?des_?faits/],
        creer: () => ({ type: "Text", isFormula: false }) },
      { role: "Derniere_version", libelle: "Dernière version (formule)", obligatoire: true,
        accepte: c => c.isFormula && /^(Bool|Any)$/.test(typeBase(c.type)),
        motifs: [/derniere_?version/],
        creer: ctx => ({ type: "Bool", isFormula: true, formula: formuleDerniereVersion(ctx) }) },
      { role: "Commentaire", libelle: "Commentaire de mise à jour", obligatoire: false,
        accepte: c => typeBase(c.type) === "Text" && !c.isFormula,
        motifs: [/^commentaire/, /commentaire/],
        creer: () => ({ type: "Text", isFormula: false }) },
      { role: "Site", libelle: "Site / bâtiment", obligatoire: false,
        accepte: c => /^(Text|Choice)$/.test(typeBase(c.type)) && !c.isFormula,
        motifs: [/^site/, /batiment|campus/],
        creer: () => ({ type: "Text", isFormula: false }) },
      { role: "Clos", libelle: "Clos", obligatoire: false,
        accepte: c => c.type === "Bool" && !c.isFormula,
        motifs: [/^clos/, /cloture|termine/],
        creer: () => ({ type: "Bool", isFormula: false }) },
      { role: "Auteur", libelle: "Auteur", obligatoire: false,
        accepte: () => true,
        motifs: [/^auteur/, /saisi_?par|redacteur|createur/],
        creer: () => ({ type: "Text", isFormula: false, formula: "user.Email" }) },
    ],
    referentiel: [
      { role: "Nom", libelle: "Nom de l'établissement", obligatoire: true, accepte: c => typeBase(c.type) !== "Bool",
        motifs: [/^nom$/, /appellation/, /^(nom|libelle|denomination|intitule)_(de_l_|de_|d_)?etab/, /denomination|raison_sociale/,
                 /^(nom|libelle|intitule)(_|$)/, /^etablissement$/, /etablissement/],
        sauf: /commune|ville|academi|departement|region|contact|responsable|chef|direct|president|type|sigle|uai|rne|tutelle|mail|code|^id/,
        creer: () => ({ type: "Text", isFormula: false }) },
      { role: "UAI", libelle: "UAI", obligatoire: true, accepte: c => typeBase(c.type) !== "Bool",
        motifs: [/^uai$/, /(^|_)(uai|rne)(_|$)/, /^code_etab/, /identifiant.*etab/], sauf: /tutelle|siege|rattach|parent/,
        creer: () => ({ type: "Text", isFormula: false }) },
      { role: "Type", libelle: "Type d'établissement", obligatoire: true, accepte: c => typeBase(c.type) !== "Bool",
        motifs: [/^type$/, /^type_(d_)?etab/, /^type/, /nature|categorie|typologie/], sauf: /code|^id|contrat/,
        creer: () => ({ type: "Text", isFormula: false }) },
      { role: "Commune", libelle: "Commune", obligatoire: false, accepte: c => typeBase(c.type) !== "Bool",
        motifs: [/^(nom_|libelle_)?(de_la_)?commune$/, /commune/, /ville|localite/], sauf: /code|insee|^id|postal/,
        creer: () => ({ type: "Text", isFormula: false }) },
      { role: "Academie", libelle: "Académie", obligatoire: true, accepte: c => typeBase(c.type) !== "Bool",
        motifs: [/^(nom_|libelle_)?(de_l_)?academie$/, /academie/], sauf: /code|^id|region/,
        creer: () => ({ type: "Text", isFormula: false }) },
      { role: "Departement", libelle: "Département", obligatoire: true, accepte: c => typeBase(c.type) !== "Bool",
        motifs: [/^(nom_|libelle_)?(du_)?departement$/, /departement/], sauf: /code|^id|numero/,
        creer: () => ({ type: "Text", isFormula: false }) },
      { role: "Region_academique", libelle: "Région académique", obligatoire: false, accepte: c => typeBase(c.type) !== "Bool",
        motifs: [/region_?academique/, /^region/], sauf: /code|^id/,
        creer: () => ({ type: "Text", isFormula: false }) },
      { role: "Mail", libelle: "Courriel", obligatoire: false, accepte: c => typeBase(c.type) !== "Bool",
        motifs: [/^(mail|courriel|e_?mail)$/, /mail|courriel/], sauf: /contact_2|secondaire/,
        creer: () => ({ type: "Text", isFormula: false }) },
      { role: "Origine", libelle: "Origine de la ligne", obligatoire: false, accepte: c => /^(Choice|Text)$/.test(typeBase(c.type)),
        motifs: [/^origine$/, /origine|source/], sauf: /^id/,
        creer: () => ({ type: "Choice", isFormula: false,
          widgetOptions: json({ choices: ["Annuaire EN", "Annuaire ESR", "OAD", "Manuel"] }) }) },
    ],
  };

  // Formule de la dernière version, décidée le 15/10/2026 : un dossier = un établissement un jour donné ;
  // la dernière version est la plus récente par date de saisie, puis par numéro de ligne.
  function formuleDerniereVersion(ctx) {
    const d = (ctx.cols && ctx.cols.Dossier) || "Dossier", c = (ctx.cols && ctx.cols.Cree_le) || "Cree_le";
    return [
      `initiale = $${d} or rec`,
      `versions = list(${ctx.reponses}.lookupRecords(${d}=initiale.id))`,
      `if initiale not in versions:`,
      `  versions.append(initiale)`,
      `def cle(r):`,
      `  return (r.${c} is not None, r.${c}, r.id)`,
      `return max(versions, key=cle).id == $id`,
    ].join("\n");
  }

  /* ---------- Schéma des tables techniques du socle ---------- */
  const COLONNES_CONFIG = [
    { id: "Cle", type: "Text" },
    { id: "Valeur", type: "Text" },
    { id: "Modifie_le", type: "DateTime:Europe/Paris" },
  ];
  const COLONNES_FORMULAIRES = [
    { id: "Nom", type: "Text" }, { id: "Table", type: "Text" }, { id: "Brouillon", type: "Text" }, { id: "Publie", type: "Text" },
    { id: "Publie_le", type: "DateTime:Europe/Paris" }, { id: "Modifie_le", type: "DateTime:Europe/Paris" },
    { id: "Type", type: "Text" }, { id: "Widget", type: "Text" },
  ];

  /* ---------- Lecture des métadonnées Grist ---------- */
  async function lireMeta() {
    const [t, c] = await Promise.all([grist.docApi.fetchTable("_grist_Tables"), grist.docApi.fetchTable("_grist_Tables_column")]);
    const parRef = {}, tables = {};
    t.id.forEach((ref, i) => {
      const tableId = t.tableId[i];
      if (!tableId || tableId.startsWith("GristHidden")) return;
      parRef[ref] = tableId;
      tables[tableId] = { ref, tableId, colonnes: {} };
    });
    c.id.forEach((ref, i) => {
      const tableId = parRef[c.parentId[i]], colId = c.colId[i];
      if (!tableId || !colId || colId === "manualSort" || colId.startsWith("gristHelper")) return;
      tables[tableId].colonnes[colId] = {
        ref, colId, type: c.type[i], label: c.label[i] || colId,
        isFormula: !!c.isFormula[i], formula: c.formula[i] || "", widgetOptions: c.widgetOptions[i] || "",
      };
    });
    return tables;
  }

  /* ---------- Config ---------- */
  // Renvoie null si la table Config n'existe pas ; sinon { valeurs: {clé: objet}, ids: {clé: id de ligne}, erreurs: [] }
  async function lireConfig(meta) {
    if (meta && !meta[TABLE_CONFIG]) return null;
    let t;
    try { t = await grist.docApi.fetchTable(TABLE_CONFIG); } catch (_) { return null; }
    const res = { valeurs: {}, ids: {}, erreurs: [] };
    (t.id || []).forEach((id, i) => {
      const cle = String((t.Cle || [])[i] || "").trim();
      if (!cle) return;
      const brut = (t.Valeur || [])[i];
      res.ids[cle] = id;
      try { res.valeurs[cle] = brut ? JSON.parse(brut) : null; }
      catch (e) { res.erreurs.push(`La valeur de la clé « ${cle} » n'est pas un JSON valide : ${e.message}`); }
    });
    return res;
  }
  function general(config) {
    return { ...DEFAUTS_GENERAL, ...((config && config.valeurs && config.valeurs.general) || {}) };
  }
  // Action Grist qui écrit une clé (ajout ou mise à jour)
  function actionConfig(config, cle, valeur) {
    const fields = { Valeur: JSON.stringify(valeur, null, 2), Modifie_le: maintenant() };
    const id = config && config.ids[cle];
    return id ? ["UpdateRecord", TABLE_CONFIG, id, fields] : ["AddRecord", TABLE_CONFIG, null, { Cle: cle, ...fields }];
  }
  async function ecrireConfig(cle, valeur) {
    const config = await lireConfig();
    if (!config) throw new Error("La table Config n'existe pas : lancez d'abord l'installation.");
    await grist.docApi.applyUserActions([actionConfig(config, cle, valeur)]);
  }

  /* ---------- Résolution des rôles ----------
     Ordre : association du panneau Grist (mappings), puis clé « roles » de Config, puis nom canonique,
     puis reconnaissance par le nom ou le libellé. Une colonne ne sert qu'à un seul rôle. */
  function resoudreRoles(famille, tableMeta, ctx, assocConfig = {}, mappings = {}) {
    const res = {}, pris = new Set();
    if (!tableMeta) return res;
    const cols = Object.values(tableMeta.colonnes);
    const prendre = (def, colId, origine) => { res[def.role] = { col: colId, origine }; pris.add(colId); };
    const ok = (def, c) => c && !pris.has(c.colId) && def.accepte(c, ctx);
    const defs = ROLES[famille];
    // 1 et 2 : associations explicites (mêmes contrôles de type)
    for (const def of defs) {
      for (const [source, origine] of [[mappings, "panneau Grist"], [assocConfig, "Config"]]) {
        const colId = source && source[def.role];
        if (res[def.role] || !colId) continue;
        const c = tableMeta.colonnes[colId];
        if (ok(def, c)) prendre(def, colId, origine);
        else res[def.role] = { col: null, origine: null, alerte: `L'association « ${def.role} → ${colId} » (${origine}) est ignorée : colonne absente ou de type incompatible.` };
      }
    }
    // 3 : nom canonique
    for (const def of defs) {
      if (res[def.role] && res[def.role].col) continue;
      const c = tableMeta.colonnes[def.role];
      if (ok(def, c)) prendre(def, def.role, "nom canonique");
    }
    // 4 : reconnaissance
    for (const def of defs) {
      if (res[def.role] && res[def.role].col) continue;
      let trouve = null;
      for (const m of def.motifs) {
        trouve = cols.find(c => ok(def, c) && [norm(c.colId), norm(c.label)].some(n => n && m.test(n) && !(def.sauf && def.sauf.test(n))));
        if (trouve) break;
      }
      if (trouve) prendre(def, trouve.colId, "reconnaissance");
      else if (!res[def.role]) res[def.role] = { col: null, origine: null };
    }
    return res;
  }
  // Colonnes d'une table compatibles avec un rôle (pour les listes de choix de l'administration)
  function colonnesCompatibles(famille, role, tableMeta, ctx) {
    const def = ROLES[famille].find(d => d.role === role);
    if (!def || !tableMeta) return [];
    return Object.values(tableMeta.colonnes).filter(c => def.accepte(c, ctx)).map(c => c.colId);
  }

  // Nouvelle table avec page : colonnes créées avec AddTable, options d'affichage (listes de choix) posées ensuite.
  // Aucun libellé n'est fixé : dans Grist, modifier le libellé renomme la colonne, ce qui casserait les noms canoniques.
  function actionsNouvelleTable(nom, specs) {
    return [["AddTable", nom, specs.map(({ id, type, isFormula, formula }) => ({ id, type, isFormula: !!isFormula, formula: formula || "" }))],
            ...specs.filter(c => c.widgetOptions).map(c => ["ModifyColumn", nom, c.id, { widgetOptions: c.widgetOptions }])];
  }

  /* ---------- Plan d'installation ----------
     Renvoie la liste des étapes à proposer. Chaque étape : { id, titre, detail, actions, coche, groupe }.
     Rien n'est appliqué ici. Dans un document existant, rien n'est renommé ni supprimé. */
  function planInstallation(meta, config, choix = {}) {
    const g = general(config);
    const assoc = (config && config.valeurs && config.valeurs.roles) || {};
    const etapes = [], infos = [];
    const ajouterTableTechnique = (nom, colonnes, titre) => {
      const t = meta[nom];
      if (!t) {
        etapes.push({ id: `table-${nom}`, groupe: "Tables", coche: true, titre: `Créer la table ${nom}`, detail: titre,
          actions: [["AddRawTable", nom], ...colonnes.map(c => ["AddColumn", nom, c.id, { type: c.type, isFormula: false }]),
                    ["RemoveColumn", nom, "A"], ["RemoveColumn", nom, "B"], ["RemoveColumn", nom, "C"]] });
        return;
      }
      const manquantes = colonnes.filter(c => !t.colonnes[c.id]);
      if (manquantes.length) etapes.push({ id: `cols-${nom}`, groupe: "Tables", coche: true,
        titre: `Compléter la table ${nom}`, detail: `Colonnes ajoutées : ${manquantes.map(c => c.id).join(", ")}.`,
        actions: manquantes.map(c => ["AddColumn", nom, c.id, { type: c.type, isFormula: false }]) });
    };

    // 1. Tables techniques
    ajouterTableTechnique(TABLE_CONFIG, COLONNES_CONFIG, "Réglages du document, une ligne par clé (valeur en JSON).");
    ajouterTableTechnique(g.formulaires, COLONNES_FORMULAIRES, "Formulaires en brouillon et publiés.");

    // 2. Table des réponses : la référence Établissement indique, dans un document existant, la vraie table du référentiel
    const tRep = meta[g.reponses];
    let referentiel = g.referentiel;
    if (tRep) {
      const r0 = resoudreRoles("reponses", tRep, { reponses: g.reponses, referentiel }, assoc.reponses || {}, {});
      const cible = r0.Etablissement && r0.Etablissement.col ? cibleRef(tRep.colonnes[r0.Etablissement.col].type) : null;
      if (cible && cible !== referentiel && meta[cible]) {
        infos.push(`La colonne « ${r0.Etablissement.col} » renvoie vers la table « ${cible} » : elle est retenue comme référentiel.`);
        referentiel = cible;
      }
    }
    if (choix.referentiel) referentiel = choix.referentiel;

    // 3. Référentiel
    const tRef = meta[referentiel];
    const ctxRef = { reponses: g.reponses, referentiel };
    let rolesRef = {};
    if (!tRef) {
      const defs = ROLES.referentiel;
      etapes.push({ id: "table-referentiel", groupe: "Tables", coche: true, titre: `Créer la table ${referentiel}`,
        detail: `Référentiel des établissements : ${defs.map(d => d.role).join(", ")}. À remplir ensuite par l'annuaire ou l'import OAD.`,
        actions: actionsNouvelleTable(referentiel, defs.map(d => ({ id: d.role, ...d.creer(ctxRef) }))) });
    } else {
      rolesRef = resoudreRoles("referentiel", tRef, ctxRef, assoc.referentiel || {}, {});
      for (const def of ROLES.referentiel) {
        const r = rolesRef[def.role];
        if (r && r.col) continue;
        if (!def.obligatoire && !choix[`ref:${def.role}`]) continue;
        if (tRef.colonnes[def.role]) { infos.push(`${referentiel}.${def.role} existe mais son type ne convient pas au rôle « ${def.libelle} ».`); continue; }
        etapes.push({ id: `ref-${def.role}`, groupe: "Colonnes", coche: def.obligatoire,
          titre: `Ajouter ${referentiel}.${def.role}`, detail: `Aucune colonne ne joue le rôle « ${def.libelle} ».`,
          actions: [["AddColumn", referentiel, def.role, def.creer(ctxRef)]] });
      }
    }

    // 4. Réponses
    const ctx = { reponses: g.reponses, referentiel, cols: {} };
    let rolesRep = {};
    if (!tRep) {
      // Colonnes simples avec la table, références et formule ensuite (la table doit exister pour s'y référer)
      const defs = ROLES.reponses.filter(d => d.obligatoire);
      const simples = defs.filter(d => !["Etablissement", "Dossier", "Derniere_version"].includes(d.role));
      etapes.push({ id: "table-reponses", groupe: "Tables", coche: true, titre: `Créer la table ${g.reponses}`,
        detail: `Une ligne par version de signalement : ${defs.map(d => d.role).join(", ")}.`,
        actions: [...actionsNouvelleTable(g.reponses, simples.map(d => ({ id: d.role, ...d.creer(ctx) }))),
                  ...["Etablissement", "Dossier", "Derniere_version"].map(role =>
                    ["AddColumn", g.reponses, role, ROLES.reponses.find(d => d.role === role).creer(ctx)])] });
    } else {
      rolesRep = resoudreRoles("reponses", tRep, ctx, assoc.reponses || {}, {});
      Object.entries(rolesRep).forEach(([role, r]) => { if (r.col) ctx.cols[role] = r.col; });
      for (const def of ROLES.reponses) {
        const r = rolesRep[def.role];
        if (r && r.col) continue;
        if (!def.obligatoire && !choix[`rep:${def.role}`]) continue;
        if (tRep.colonnes[def.role]) { infos.push(`${g.reponses}.${def.role} existe mais son type ne convient pas au rôle « ${def.libelle} ».`); continue; }
        etapes.push({ id: `rep-${def.role}`, groupe: "Colonnes", coche: def.obligatoire,
          titre: `Ajouter ${g.reponses}.${def.role}`, detail: `Aucune colonne ne joue le rôle « ${def.libelle} ».`,
          actions: [["AddColumn", g.reponses, def.role, def.creer({ ...ctx, cols: { ...ctx.cols, [def.role]: def.role } })]] });
      }
      // Formule de la dernière version : signalée, jamais remplacée d'office (bascule à l'étape 6)
      const dv = rolesRep.Derniere_version;
      if (dv && dv.col && rolesRep.Dossier && rolesRep.Dossier.col && rolesRep.Cree_le && rolesRep.Cree_le.col) {
        const attendue = formuleDerniereVersion(ctx), actuelle = tRep.colonnes[dv.col].formula;
        if (actuelle.replace(/\s+/g, " ").trim() !== attendue.replace(/\s+/g, " ").trim())
          etapes.push({ id: "rep-formule-dv", groupe: "Règles métier", coche: false,
            titre: `Remplacer la formule de ${g.reponses}.${dv.col}`,
            detail: "La formule actuelle diffère de la règle décidée le 15/10/2026 (dernière saisie du dossier). À ne cocher qu'au moment de la bascule : les dossiers étalés sur plusieurs jours changeraient de dernière version.",
            actions: [["ModifyColumn", g.reponses, dv.col, { formula: attendue, isFormula: true }]] });
      }
    }

    // 5. Config : réglages généraux et associations reconnues
    const aEcrire = {};
    // Préréglage deviné pour un document existant : colonne Site ou référentiel autre que « Etablissements » → ESR
    const presetDevine = (rolesRep.Site && rolesRep.Site.col) || referentiel !== DEFAUTS_GENERAL.referentiel ? "esr" : "en";
    if (!config || !config.valeurs.general) aEcrire.general = { ...g, preset: tRep ? presetDevine : g.preset, referentiel };
    else if (referentiel !== g.referentiel) aEcrire.general = { ...config.valeurs.general, referentiel };
    const nouvellesAssoc = { reponses: {}, referentiel: {} };
    for (const [famille, roles] of [["reponses", rolesRep], ["referentiel", rolesRef]])
      for (const [role, r] of Object.entries(roles))
        if (r.col && r.col !== role && r.origine === "reconnaissance") nouvellesAssoc[famille][role] = r.col;
    const nbAssoc = Object.keys(nouvellesAssoc.reponses).length + Object.keys(nouvellesAssoc.referentiel).length;
    if (nbAssoc) aEcrire.roles = {
      reponses: { ...((config && config.valeurs.roles && config.valeurs.roles.reponses) || {}), ...nouvellesAssoc.reponses },
      referentiel: { ...((config && config.valeurs.roles && config.valeurs.roles.referentiel) || {}), ...nouvellesAssoc.referentiel },
    };
    for (const [cle, valeur] of Object.entries(aEcrire)) {
      const detail = cle === "general" ? `Situation, préréglage, académies, noms des tables (référentiel : ${referentiel}).`
        : `Associations reconnues, rendues explicites : ${[...Object.entries(nouvellesAssoc.reponses), ...Object.entries(nouvellesAssoc.referentiel)].map(([r, c]) => `${r} → ${c}`).join(", ")}.`;
      etapes.push({ id: `config-${cle}`, groupe: "Réglages", coche: true, titre: `Enregistrer la clé « ${cle} » dans Config`, detail,
        // l'action est calculée au moment d'appliquer, une fois la table Config créée
        configCle: cle, configValeur: valeur, actions: [] });
    }
    return { etapes, infos, referentiel, rolesRep, rolesRef, general: aEcrire.general ? { ...g, ...aEcrire.general } : g };
  }

  // Applique les étapes cochées, une par une ; renvoie [{ etape, ok, erreur }]
  async function appliquer(etapes) {
    const resultats = [];
    for (const e of etapes) {
      try {
        let actions = e.actions;
        if (e.configCle) actions = [actionConfig(await lireConfig(), e.configCle, e.configValeur)];
        if (actions.length) await grist.docApi.applyUserActions(actions);
        resultats.push({ etape: e, ok: true });
      } catch (err) {
        resultats.push({ etape: e, ok: false, erreur: (err && err.message) || String(err) });
      }
    }
    return resultats;
  }

  window.Socle = {
    VERSION, TABLE_CONFIG, DEFAUTS_GENERAL, NATURES, ROLES,
    norm, cibleRef, lireMeta, lireConfig, general, actionConfig, ecrireConfig,
    resoudreRoles, colonnesCompatibles, formuleDerniereVersion, planInstallation, appliquer,
    REGIONS_ACADEMIQUES, regionDeAcademie,
  };
})();
