/* =====================================================================
   PRISME — plan d'installation d'un document
   ---------------------------------------------------------------------
   Ce qu'il faut créer pour qu'un document soit complet : tables techniques (Config, Administration, Cellule,
   Formulaires, Agents, planning, actions, veille), tables de chaque champ suivi (réponses, référentiel, colonnes
   attendues, formules), réglages de Config. planInstallation renvoie la liste des étapes à proposer, chacune
   { id, titre, detail, actions, coche, groupe } ; rien n'est appliqué. L'administrateur coche les étapes, appliquer
   les exécute. Dans un document existant, rien n'est renommé ni supprimé.
   Chargé par la page d'administration seulement, après commun/socle.js et commun/metier/.

   Définit (sur window.Socle) : MOUVEMENTS_TABLEAU, colonnesHistoriqueTableau, planInstallation, appliquer.
   Utilise (window.Socle) : actionConfig, associerColonnes, auteurAMettreAJour, cibleRef, COLONNES_ATTENDUES,
     COLONNES_ETABLISSEMENT, DEFAUTS_GENERAL, espaces, formuleAuteur, formuleDerniereVersion, general, json,
     lireConfig, TABLE_ADMIN, TABLE_CELLULE, TABLE_CONFIG, COLONNES_CRENEAUX, colonnesAffectations,
     colonnesEmargements, COLONNES_VIGILANCES, COLONNES_VIGILANCES_JOURNAL, colonnesAgents, colonnesActions.
   Utilise aussi : Donnees (lecture et écriture du document).
   ===================================================================== */
(function () {
  "use strict";

  const {
    actionConfig,
    associerColonnes,
    auteurAMettreAJour,
    cibleRef,
    COLONNES_ATTENDUES,
    COLONNES_ETABLISSEMENT,
    DEFAUTS_GENERAL,
    espaces,
    formuleAuteur,
    formuleDerniereVersion,
    general,
    json,
    lireConfig,
    TABLE_ADMIN,
    TABLE_CELLULE,
    TABLE_CONFIG,
    COLONNES_CRENEAUX,
    colonnesAffectations,
    colonnesEmargements,
    COLONNES_VIGILANCES,
    COLONNES_VIGILANCES_JOURNAL,
    colonnesAgents,
    colonnesActions,
  } = window.Socle;

  /* ---------- Schéma des tables techniques du socle ---------- */
  const COLONNES_CONFIG = [
    { id: "Cle", type: "Text" },
    { id: "Valeur", type: "Text" },
    { id: "Modifie_le", type: "DateTime:Europe/Paris" },
  ];
  const COLONNES_FORMULAIRES = [
    { id: "Nom", type: "Text" },
    { id: "Table", type: "Text" },
    { id: "Brouillon", type: "Text" },
    { id: "Publie", type: "Text" },
    { id: "Publie_le", type: "DateTime:Europe/Paris" },
    { id: "Modifie_le", type: "DateTime:Europe/Paris" },
    { id: "Type", type: "Text" },
    { id: "Widget", type: "Text" },
  ];

  // Nouvelle table avec page : colonnes créées avec AddTable, options d'affichage (listes de choix) posées ensuite.
  // Aucun libellé n'est fixé : dans Grist, modifier le libellé renomme la colonne, ce qui casserait les noms canoniques.
  function actionsNouvelleTable(nom, colonnes) {
    return [
      [
        "AddTable",
        nom,
        colonnes.map(({ id, type, isFormula, formula }) => ({
          id,
          type,
          isFormula: !!isFormula,
          formula: formula || "",
        })),
      ],
      ...colonnes
        .filter((colonne) => colonne.widgetOptions)
        .map((colonne) => ["ModifyColumn", nom, colonne.id, { widgetOptions: colonne.widgetOptions }]),
    ];
  }

  /* ---------- Plan d'installation ---------- */
  /* Sous-table d'une question « tableau », historisée : chaque version du signalement écrit sa propre copie des lignes.
     Version (référence vers la version), Mouvement (Ajout, Modification, Inchangée, Retrait — par rapport à la
     version précédente du dossier), Etat_actuel (ligne de la version la plus récente du dossier, hors retraits :
     le stock), Date_version (date des faits de la version, à défaut sa date de saisie). */
  const MOUVEMENTS_TABLEAU = { Ajout: "#B8FEC9", Modification: "#FEECC2", Inchangée: "#EEEEEE", Retrait: "#FFE9E6" };
  function colonnesHistoriqueTableau(table, reponses, colonneDossier, associationsReponses) {
    const colonneDe = (role) => associationsReponses && associationsReponses[role] && associationsReponses[role].col;
    const colonneDerniereVersion = colonneDe("Derniere_version"),
      faits = colonneDe("Date_faits"),
      cree = colonneDe("Cree_le");
    const colonnes = [
      { id: "Version", type: `Ref:${reponses}` },
      {
        id: "Mouvement",
        type: "Choice",
        widgetOptions: json({
          choices: Object.keys(MOUVEMENTS_TABLEAU),
          choiceOptions: Object.fromEntries(
            Object.entries(MOUVEMENTS_TABLEAU).map(([mouvement, couleur]) => [mouvement, { fillColor: couleur }]),
          ),
        }),
      },
      {
        id: "Etat_actuel",
        type: "Bool",
        isFormula: true,
        formula: [
          "# ligne de la version la plus récente du dossier (hors retraits) : le stock",
          "if not $Version:",
          "  return True",
          'if $Mouvement == "Retrait":',
          "  return False",
          `versions = [r.Version for r in ${table}.lookupRecords(${colonneDossier}=$${colonneDossier}) if r.Version]`,
          `derniere = max(versions, key=lambda v: (${colonneDerniereVersion ? `bool(v.${colonneDerniereVersion}), ` : ""}v.id))`,
          "return $Version.id == derniere.id",
        ].join("\n"),
      },
    ];
    if (faits || cree)
      colonnes.push({
        id: "Date_version",
        type: "Date",
        isFormula: true,
        formula: [
          "v = $Version",
          "if not v:",
          "  return None",
          ...(faits
            ? [`if v.${faits}:`, `  return v.${faits}.date() if hasattr(v.${faits}, "date") else v.${faits}`]
            : []),
          ...(cree ? [`return v.${cree}.date() if v.${cree} else None`] : ["return None"]),
        ].join("\n"),
      });
    return colonnes;
  }
  /* Le plan se construit en trois temps : tables techniques (1), tables de chaque champ suivi (2 à 4 ter), réglages
     de Config (5). Chaque fonction d'étape ajoute ses étapes à plan.etapes et ses remarques à plan.infos ;
     plan = { meta, config, choix, reglagesGeneraux, etapes, infos }. choix : cases cochées en plus par l'administrateur
     (« ref:<colonne> », « rep:<colonne> ») et référentiel choisi (choix.referentiel). */
  function planInstallation(meta, config, choix = {}) {
    const reglagesGeneraux = general(config);
    const associationsEnregistrees = (config && config.valeurs && config.valeurs.roles) || {};
    const plan = { meta, config, choix, reglagesGeneraux, etapes: [], infos: [] };
    etapesTablesTechniques(plan);
    const principal = etapesChamp(plan, {
      reponses: reglagesGeneraux.reponses,
      referentielParDefaut: reglagesGeneraux.referentiel,
      associationsConfigReponses: associationsEnregistrees.reponses || {},
      associationsConfigReferentiel: associationsEnregistrees.referentiel || {},
      suffixe: "",
      referentielChoisi: choix.referentiel,
      version: reglagesGeneraux.preset,
    });
    // Champs suivants (ex. MESRE à côté du MEN) : leurs propres tables de réponses et référentiel, mêmes colonnes
    // attendues, noms par défaut ; le suffixe distingue leurs étapes de celles du premier champ
    for (const espace of espaces(reglagesGeneraux).slice(1))
      etapesChamp(plan, {
        reponses: espace.reponses,
        referentielParDefaut: espace.referentiel,
        associationsConfigReponses: {},
        associationsConfigReferentiel: {},
        suffixe: `@${espace.reponses}`,
        referentielChoisi: null,
        version: espace.version,
      });
    const aEcrire = etapesConfig(plan, principal);
    return {
      etapes: plan.etapes,
      infos: plan.infos,
      referentiel: principal.referentiel,
      rolesRep: principal.associationsReponses,
      rolesRef: principal.associationsReferentiel,
      general: aEcrire.general ? { ...reglagesGeneraux, ...aEcrire.general } : reglagesGeneraux,
    };
  }

  // Colonne de données ; une formule sans isFormula est une formule d'initialisation (calculée à la création de la ligne)
  const descriptionColonne = (colonne) => ({
    type: colonne.type,
    isFormula: false,
    ...(colonne.widgetOptions ? { widgetOptions: colonne.widgetOptions } : {}),
    ...(colonne.formula ? { formula: colonne.formula } : {}),
  });

  // Table technique absente : la créer ; présente : lui ajouter les colonnes qui manquent
  function ajouterTableTechnique(plan, nom, colonnes, titre) {
    const tableExistante = plan.meta[nom];
    if (!tableExistante) {
      plan.etapes.push({
        id: `table-${nom}`,
        groupe: "Tables",
        coche: true,
        titre: `Créer la table ${nom}`,
        detail: titre,
        actions: [
          ["AddRawTable", nom],
          ...colonnes.map((colonne) => ["AddColumn", nom, colonne.id, descriptionColonne(colonne)]),
          ["RemoveColumn", nom, "A"],
          ["RemoveColumn", nom, "B"],
          ["RemoveColumn", nom, "C"],
        ],
      });
      return;
    }
    const manquantes = colonnes.filter((colonne) => !tableExistante.colonnes[colonne.id]);
    if (manquantes.length)
      plan.etapes.push({
        id: `cols-${nom}`,
        groupe: "Tables",
        coche: true,
        titre: `Compléter la table ${nom}`,
        detail: `Colonnes ajoutées : ${manquantes.map((colonne) => colonne.id).join(", ")}.`,
        actions: manquantes.map((colonne) => ["AddColumn", nom, colonne.id, descriptionColonne(colonne)]),
      });
  }

  // 1. Tables techniques
  function etapesTablesTechniques(plan) {
    const { meta, config, reglagesGeneraux } = plan;
    ajouterTableTechnique(
      plan,
      TABLE_CONFIG,
      COLONNES_CONFIG,
      "Réglages du document, une ligne par clé (valeur en JSON).",
    );
    ajouterTableTechnique(
      plan,
      TABLE_ADMIN,
      [{ id: "Note", type: "Text" }],
      "Table vide qui porte la page d'administration : les règles d'accès la réservent aux propriétaires, la page est ainsi invisible des agents, des invités et des établissements.",
    );
    ajouterTableTechnique(
      plan,
      TABLE_CELLULE,
      [{ id: "Note", type: "Text" }],
      "Table vide qui porte la page « Cellule » : les pages rangées dessous (réponses, référentiel, tableaux de bord…) sont invisibles des établissements et des invités (onglet Accès).",
    );
    ajouterTableTechnique(
      plan,
      reglagesGeneraux.formulaires,
      COLONNES_FORMULAIRES,
      "Formulaires en brouillon et publiés.",
    );
    const colonnesDesAgents = colonnesAgents(config);
    ajouterTableTechnique(
      plan,
      reglagesGeneraux.agents,
      colonnesDesAgents.filter((colonne) => !colonne.isFormula),
      "Équipe de la cellule : nom, adresse, téléphone, équipe et fonction habituelle (onglet Équipe).",
    );
    ajouterTableTechnique(
      plan,
      reglagesGeneraux.creneaux,
      COLONNES_CRENEAUX,
      "Planning : créneaux de chaque jour (Équipe › Planning).",
    );
    ajouterTableTechnique(
      plan,
      reglagesGeneraux.affectations,
      colonnesAffectations(reglagesGeneraux, config),
      "Planning : agents affectés à chaque créneau, avec leur fonction et leur périmètre.",
    );
    ajouterTableTechnique(
      plan,
      reglagesGeneraux.actions,
      colonnesActions(reglagesGeneraux, config),
      "Suivi des actions de la cellule : kanban des coordinateurs (onglet Actions).",
    );
    ajouterTableTechnique(
      plan,
      reglagesGeneraux.emargements,
      colonnesEmargements(reglagesGeneraux),
      "Émargement : prises et fins de service des agents (page de saisie, suivi dans Équipe › Planning).",
    );
    ajouterTableTechnique(
      plan,
      reglagesGeneraux.vigilances,
      COLONNES_VIGILANCES,
      "Veille : vigilances météo en cours, écrites par le relais n8n (onglet Veille).",
    );
    ajouterTableTechnique(
      plan,
      reglagesGeneraux.vigilances_journal,
      COLONNES_VIGILANCES_JOURNAL,
      "Veille : journal des changements de vigilance (alertes, retour d'expérience).",
    );
    // Formules de la table Agents : après Affectations, qu'elles lisent
    const tableAgents = meta[reglagesGeneraux.agents];
    const formules = colonnesDesAgents.filter(
      (colonne) => colonne.isFormula && !(tableAgents && tableAgents.colonnes[colonne.id]),
    );
    if (formules.length)
      plan.etapes.push({
        id: `formule-${reglagesGeneraux.agents}`,
        groupe: "Tables",
        coche: true,
        titre: `Ajouter ${formules.map((colonne) => `${reglagesGeneraux.agents}.${colonne.id}`).join(", ")}`,
        detail: "Champs (EN, ESR) de chaque agent d'après le planning, lus par les règles d'accès.",
        actions: formules.map((colonne) => [
          "AddColumn",
          reglagesGeneraux.agents,
          colonne.id,
          { type: colonne.type, isFormula: true, formula: colonne.formula, widgetOptions: colonne.widgetOptions || "" },
        ]),
      });
  }

  /* 2 à 4 ter. Tables d'un champ suivi (réponses et référentiel).
     champ = { reponses, referentielParDefaut, associationsConfigReponses, associationsConfigReferentiel, suffixe,
     referentielChoisi, version }. Renvoie { referentiel, associationsReponses, associationsReferentiel, tableReponses }. */
  function etapesChamp(plan, champ) {
    const tableReponses = plan.meta[champ.reponses];
    const referentiel = referentielDuChamp(plan, champ, tableReponses);
    const etat = { ...champ, tableReponses, referentiel, tableReferentiel: plan.meta[referentiel] };
    etat.associationsReferentiel = etapesReferentiel(plan, etat);
    etat.associationsReponses = etapesReponses(plan, etat);
    etapesColonnesEtablissement(plan, etat);
    etapesSousTablesTableau(plan, etat);
    return {
      referentiel,
      associationsReponses: etat.associationsReponses,
      associationsReferentiel: etat.associationsReferentiel,
      tableReponses,
    };
  }

  // Colonne attendue à créer d'office : obligatoire, proposée par défaut, ou Site pour l'enseignement supérieur
  const colonneVoulue = (definition, version) =>
    definition.obligatoire || definition.parDefaut || (definition.role === "Site" && version === "esr");

  // 2. Dans un document existant, la référence Établissement de la table des réponses indique la vraie table du
  // référentiel ; le référentiel choisi par l'administrateur l'emporte
  function referentielDuChamp(plan, champ, tableReponses) {
    const { reponses } = champ;
    let referentiel = champ.referentielParDefaut;
    if (tableReponses) {
      const associationsExistantes = associerColonnes(
        "reponses",
        tableReponses,
        { reponses, referentiel },
        champ.associationsConfigReponses,
        {},
      );
      const colonneEtablissement = associationsExistantes.Etablissement && associationsExistantes.Etablissement.col;
      const cible = colonneEtablissement ? cibleRef(tableReponses.colonnes[colonneEtablissement].type) : null;
      if (cible && cible !== referentiel && plan.meta[cible]) {
        plan.infos.push(
          `La colonne « ${colonneEtablissement} » renvoie vers la table « ${cible} » : elle est retenue comme référentiel.`,
        );
        referentiel = cible;
      }
    }
    if (champ.referentielChoisi) referentiel = champ.referentielChoisi;
    return referentiel;
  }

  // 3. Référentiel : créer la table, ou lui ajouter les colonnes attendues qui manquent. Renvoie ses associations.
  function etapesReferentiel(plan, etat) {
    const { reponses, referentiel, tableReferentiel, suffixe } = etat;
    const contexteReferentiel = { reponses, referentiel };
    if (!tableReferentiel) {
      const definitions = COLONNES_ATTENDUES.referentiel;
      plan.etapes.push({
        id: `table-referentiel${suffixe}`,
        groupe: "Tables",
        coche: true,
        titre: `Créer la table ${referentiel}`,
        detail: `Référentiel des établissements : ${definitions.map((definition) => definition.role).join(", ")}. À remplir ensuite par l'annuaire ou l'import OAD.`,
        actions: actionsNouvelleTable(
          referentiel,
          definitions.map((definition) => ({ id: definition.role, ...definition.creer(contexteReferentiel) })),
        ),
      });
      return {};
    }
    const associationsReferentiel = associerColonnes(
      "referentiel",
      tableReferentiel,
      contexteReferentiel,
      etat.associationsConfigReferentiel,
      {},
    );
    for (const definition of COLONNES_ATTENDUES.referentiel) {
      const association = associationsReferentiel[definition.role];
      if (association && association.col) continue;
      if (!definition.obligatoire && !definition.parDefaut && !plan.choix[`ref:${definition.role}`]) continue;
      if (tableReferentiel.colonnes[definition.role]) {
        plan.infos.push(
          `${referentiel}.${definition.role} existe mais son type ne convient pas au rôle « ${definition.libelle} ».`,
        );
        continue;
      }
      plan.etapes.push({
        id: `ref-${definition.role}${suffixe}`,
        groupe: "Colonnes",
        coche: definition.obligatoire || !!definition.parDefaut,
        titre: `Ajouter ${referentiel}.${definition.role}`,
        detail: `Aucune colonne ne joue le rôle « ${definition.libelle} ».`,
        actions: [["AddColumn", referentiel, definition.role, definition.creer(contexteReferentiel)]],
      });
    }
    return associationsReferentiel;
  }

  // 4. Réponses : créer la table, ou lui ajouter les colonnes attendues qui manquent et mettre à jour ses formules.
  // Renvoie ses associations.
  function etapesReponses(plan, etat) {
    const { reponses, referentiel, tableReponses, suffixe, version } = etat;
    const contexte = { reponses, referentiel, cols: {}, general: plan.reglagesGeneraux };
    if (!tableReponses) {
      // Colonnes simples avec la table, références et formules ensuite (la table doit exister pour s'y référer)
      const definitions = COLONNES_ATTENDUES.reponses.filter((definition) => colonneVoulue(definition, version));
      const apres = [
        "Etablissement",
        "Dossier",
        "Derniere_version",
        "Description_Word_",
        "Auteur",
        "Etat_plus_grave",
        "Nb_jours_mobilisation",
      ]; // références et formules : une fois la table créée
      const simples = definitions.filter((definition) => !apres.includes(definition.role));
      plan.etapes.push({
        id: `table-reponses${suffixe}`,
        groupe: "Tables",
        coche: true,
        titre: `Créer la table ${reponses}`,
        detail: `Une ligne par version de signalement : ${definitions.map((definition) => definition.role).join(", ")}.`,
        actions: [
          ...actionsNouvelleTable(
            reponses,
            simples.map((definition) => ({ id: definition.role, ...definition.creer(contexte) })),
          ),
          ...apres.map((role) => [
            "AddColumn",
            reponses,
            role,
            COLONNES_ATTENDUES.reponses.find((definition) => definition.role === role).creer(contexte),
          ]),
        ],
      });
      return {};
    }
    const associationsReponses = associerColonnes(
      "reponses",
      tableReponses,
      contexte,
      etat.associationsConfigReponses,
      {},
    );
    contexte.tRep = tableReponses;
    Object.entries(associationsReponses).forEach(([role, association]) => {
      if (association.col) contexte.cols[role] = association.col;
    });
    for (const definition of COLONNES_ATTENDUES.reponses) {
      const association = associationsReponses[definition.role];
      if (association && association.col) continue;
      if (!colonneVoulue(definition, version) && !plan.choix[`rep:${definition.role}`]) continue;
      if (tableReponses.colonnes[definition.role]) {
        plan.infos.push(
          `${reponses}.${definition.role} existe mais son type ne convient pas au rôle « ${definition.libelle} ».`,
        );
        continue;
      }
      plan.etapes.push({
        id: `rep-${definition.role}${suffixe}`,
        groupe: "Colonnes",
        coche: colonneVoulue(definition, version),
        titre: `Ajouter ${reponses}.${definition.role}`,
        detail: `Aucune colonne ne joue le rôle « ${definition.libelle} ».`,
        actions: [
          [
            "AddColumn",
            reponses,
            definition.role,
            definition.creer({ ...contexte, cols: { ...contexte.cols, [definition.role]: definition.role } }),
          ],
        ],
      });
    }
    etapeFormuleAuteur(plan, etat, associationsReponses);
    etapeFormuleDerniereVersion(plan, etat, associationsReponses, contexte);
    return associationsReponses;
  }

  // Auteur : formule d'initialisation à jour (compte Grist, invité, établissement)
  function etapeFormuleAuteur(plan, etat, associationsReponses) {
    const { reponses, tableReponses, suffixe } = etat;
    const associationAuteur = associationsReponses.Auteur;
    if (!associationAuteur || !associationAuteur.col) return;
    const colonneAuteur = tableReponses.colonnes[associationAuteur.col];
    if (!auteurAMettreAJour(colonneAuteur)) return;
    const vide = !String(colonneAuteur.formula || "").trim();
    const colonneEtablissement = (associationsReponses.Etablissement && associationsReponses.Etablissement.col) || null;
    plan.etapes.push({
      id: `rep-formule-auteur${suffixe}`,
      groupe: "Colonnes",
      coche: true,
      titre: `${vide ? "Remplir" : "Mettre à jour"} la formule de ${reponses}.${associationAuteur.col}`,
      detail:
        "Formule d'initialisation : adresse du compte Grist, « Invité : <nom> » pour le lien d'un agent, « Établissement : <UAI> <nom> » pour le lien d'un établissement. Les lignes existantes ne changent pas.",
      actions: [
        [
          "ModifyColumn",
          reponses,
          associationAuteur.col,
          { formula: formuleAuteur(plan.reglagesGeneraux, colonneEtablissement), isFormula: false },
        ],
      ],
    });
  }

  // Formule de la dernière version : signalée, jamais remplacée d'office (bascule à l'étape 6)
  function etapeFormuleDerniereVersion(plan, etat, associationsReponses, contexte) {
    const { reponses, tableReponses, suffixe } = etat;
    const colonneDe = (role) => associationsReponses[role] && associationsReponses[role].col;
    const colonneDerniereVersion = colonneDe("Derniere_version");
    if (!colonneDerniereVersion || !colonneDe("Dossier") || !colonneDe("Cree_le")) return;
    const attendue = formuleDerniereVersion(contexte),
      actuelle = tableReponses.colonnes[colonneDerniereVersion].formula;
    if (actuelle.replace(/\s+/g, " ").trim() === attendue.replace(/\s+/g, " ").trim()) return;
    plan.etapes.push({
      id: `rep-formule-dv${suffixe}`,
      groupe: "Règles métier",
      coche: false,
      titre: `Remplacer la formule de ${reponses}.${colonneDerniereVersion}`,
      detail:
        "La formule actuelle diffère de la règle décidée le 15/10/2026 (dernière saisie du dossier). À ne cocher qu'au moment de la bascule : les dossiers étalés sur plusieurs jours changeraient de dernière version.",
      actions: [["ModifyColumn", reponses, colonneDerniereVersion, { formula: attendue, isFormula: true }]],
    });
  }

  // 4 bis. Colonnes de l'établissement (formules) : lignes par UAI, cartes par département, académie ou point, exports CSV
  function etapesColonnesEtablissement(plan, etat) {
    const { reponses, tableReponses, tableReferentiel, associationsReponses, associationsReferentiel, suffixe } = etat;
    const prevue = (id) => plan.etapes.some((etape) => etape.id === id);
    const colonneEtablissement =
      (associationsReponses.Etablissement && associationsReponses.Etablissement.col) ||
      (!tableReponses || prevue(`rep-Etablissement${suffixe}`) ? "Etablissement" : null);
    if (!colonneEtablissement) return;
    // colonne du référentiel pour une colonne attendue : existante, ou créée par une étape du plan
    const colonneDuReferentiel = (role) =>
      !tableReferentiel
        ? role
        : (associationsReferentiel[role] && associationsReferentiel[role].col) ||
          (prevue(`ref-${role}${suffixe}`) ? role : null);
    const ajout = COLONNES_ETABLISSEMENT.filter(
      (colonne) => colonneDuReferentiel(colonne.role) && !(tableReponses && tableReponses.colonnes[colonne.id]),
    ).map((colonne) => ({ ...colonne, formula: `$${colonneEtablissement}.${colonneDuReferentiel(colonne.role)}` }));
    if (!ajout.length) return;
    plan.etapes.push({
      id: `rep-etablissement${suffixe}`,
      groupe: "Colonnes",
      coche: true,
      titre: `Ajouter à ${reponses} les colonnes de l'établissement : ${ajout.map((colonne) => colonne.id).join(", ")}`,
      detail: `Formules qui recopient le référentiel (${ajout.map((colonne) => colonne.formula).join(", ")}) : lignes par UAI, cartes par département, académie ou établissement, exports CSV.`,
      actions: ajout.map((colonne) => [
        "AddColumn",
        reponses,
        colonne.id,
        {
          type: colonne.type,
          isFormula: true,
          formula: colonne.formula,
          label: colonne.label,
          untieColIdFromLabel: true,
        },
      ]),
    });
  }

  // 4 ter. Questions « tableau » : sous-tables historisées (une ligne par version du signalement et par ligne saisie)
  function etapesSousTablesTableau(plan, etat) {
    const { reponses, tableReponses, associationsReponses } = etat;
    if (!tableReponses) return;
    for (const [nomTable, metaTable] of Object.entries(plan.meta)) {
      if (nomTable === reponses || nomTable.startsWith("_grist") || !metaTable.colonnes.Ligne_id) continue;
      const colonneDossier =
        metaTable.colonnes.Dossier && metaTable.colonnes.Dossier.type === `Ref:${reponses}`
          ? "Dossier"
          : (
              Object.values(metaTable.colonnes).find(
                (colonne) => colonne.type === `Ref:${reponses}` && colonne.colId !== "Version",
              ) || {}
            ).colId;
      if (!colonneDossier) continue;
      const ajout = colonnesHistoriqueTableau(nomTable, reponses, colonneDossier, associationsReponses).filter(
        (colonne) => !metaTable.colonnes[colonne.id],
      );
      if (ajout.length)
        plan.etapes.push({
          id: `tableau-historique-${nomTable}`,
          groupe: "Colonnes",
          coche: true,
          titre: `Historiser la sous-table ${nomTable} : ${ajout.map((colonne) => colonne.id).join(", ")}`,
          detail:
            "Une ligne par version du signalement et par ligne du tableau (Version), avec son mouvement (ajout, modification, inchangée, retrait) : stock (Etat_actuel), flux et évolution mesurables. Les lignes existantes sont rattachées à la dernière version à la prochaine saisie ; « Reconstruire les tables des questions tableau » (réglages du widget de saisie) refait tout l'historique.",
          actions: ajout.map((colonne) => [
            "AddColumn",
            nomTable,
            colonne.id,
            {
              type: colonne.type,
              isFormula: !!colonne.isFormula,
              formula: colonne.formula || "",
              ...(colonne.widgetOptions ? { widgetOptions: colonne.widgetOptions } : {}),
              label: colonne.id,
            },
          ]),
        });
    }
  }

  // 5. Config : réglages généraux et associations reconnues. Renvoie les clés à écrire ({ general, roles }).
  function etapesConfig(plan, principal) {
    const { config, reglagesGeneraux } = plan;
    const { referentiel, associationsReponses, associationsReferentiel, tableReponses } = principal;
    const aEcrire = {};
    // Préréglage deviné pour un document existant : colonne Site ou référentiel autre que « Etablissements » → ESR
    const presetDevine =
      (associationsReponses.Site && associationsReponses.Site.col) || referentiel !== DEFAUTS_GENERAL.referentiel
        ? "esr"
        : "en";
    if (!config || !config.valeurs.general)
      aEcrire.general = {
        ...reglagesGeneraux,
        preset: tableReponses ? presetDevine : reglagesGeneraux.preset,
        referentiel,
      };
    else if (referentiel !== reglagesGeneraux.referentiel) aEcrire.general = { ...config.valeurs.general, referentiel };
    // associations trouvées par reconnaissance du nom : rendues explicites dans la clé « roles »
    const nouvellesAssociations = { reponses: {}, referentiel: {} };
    for (const [famille, associations] of [
      ["reponses", associationsReponses],
      ["referentiel", associationsReferentiel],
    ])
      for (const [role, association] of Object.entries(associations))
        if (association.col && association.col !== role && association.origine === "reconnaissance")
          nouvellesAssociations[famille][role] = association.col;
    const nombre =
      Object.keys(nouvellesAssociations.reponses).length + Object.keys(nouvellesAssociations.referentiel).length;
    if (nombre)
      aEcrire.roles = {
        reponses: {
          ...((config && config.valeurs.roles && config.valeurs.roles.reponses) || {}),
          ...nouvellesAssociations.reponses,
        },
        referentiel: {
          ...((config && config.valeurs.roles && config.valeurs.roles.referentiel) || {}),
          ...nouvellesAssociations.referentiel,
        },
      };
    for (const [cle, valeur] of Object.entries(aEcrire)) {
      const detail =
        cle === "general"
          ? `Situation, préréglage, académies, noms des tables (référentiel : ${referentiel}).`
          : `Associations reconnues, rendues explicites : ${[...Object.entries(nouvellesAssociations.reponses), ...Object.entries(nouvellesAssociations.referentiel)].map(([role, colonne]) => `${role} → ${colonne}`).join(", ")}.`;
      plan.etapes.push({
        id: `config-${cle}`,
        groupe: "Réglages",
        coche: true,
        titre: `Enregistrer la clé « ${cle} » dans Config`,
        detail,
        // l'action est calculée au moment d'appliquer, une fois la table Config créée
        configCle: cle,
        configValeur: valeur,
        actions: [],
      });
    }
    return aEcrire;
  }

  // Applique les étapes cochées, une par une ; renvoie [{ etape, ok, erreur }]
  async function appliquer(etapes) {
    const resultats = [];
    for (const etape of etapes) {
      try {
        let actions = etape.actions;
        if (etape.configCle) actions = [actionConfig(await lireConfig(), etape.configCle, etape.configValeur)];
        if (actions.length) await Donnees.ecrire(actions);
        resultats.push({ etape: etape, ok: true });
      } catch (err) {
        resultats.push({ etape: etape, ok: false, erreur: (err && err.message) || String(err) });
      }
    }
    return resultats;
  }

  Object.assign(window.Socle, {
    MOUVEMENTS_TABLEAU,
    colonnesHistoriqueTableau,
    planInstallation,
    appliquer,
  });
})();
