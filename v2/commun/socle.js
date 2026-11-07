/* =====================================================================
   PRISME — socle commun des widgets : le contrat entre le document Grist et les widgets
   ---------------------------------------------------------------------
   Il fixe :
   - les noms des tables du socle (modifiables par la clé « general » de Config) ;
   - les colonnes attendues par les widgets (établissement, date, statut…) et leur association aux colonnes réelles
     du document ;
   - les champs suivis (EN, ESR), chacun avec sa table de réponses et son référentiel ;
   - la colonne Auteur des réponses et la clé des liens d'invités ;
   - la lecture et l'écriture de la table Config.
   Les règles métier (planning, validation, veille, campagnes…) sont dans commun/metier/ et admin/metier/ : elles
   ajoutent leurs fonctions au même objet window.Socle.
   Contrat de référence : document « Signalements Grist — remise à plat », section « Contrat du socle ».
   Chargé par chaque page, après commun/outils.js et commun/donnees.js, avant commun/metier/.

   Définit (window.Socle) : VERSION, TABLE_CONFIG, TABLE_ADMIN, TABLE_CELLULE, STYLE_LIEN, DEFAUTS_GENERAL, NATURES,
     normaliser, cibleRef, json, COLONNES_ATTENDUES, COLONNES_ETABLISSEMENT, formuleDerniereVersion, CHAMPS,
     AUTRE_CHAMP_DEFAUT, espaces, espaceDeTable, choix, INVITE, formuleAuteur, auteurAMettreAJour, listeChoix,
     lireMeta, lireConfig, general, actionConfig, ecrireConfig, associerColonnes, colonnesCompatibles.
   Utilise : Donnees (lecture et écriture du document).
   ===================================================================== */
(function () {
  "use strict";

  const VERSION = "2.54.0 (06/11/2026)";

  /* ---------- Noms par défaut ---------- */
  const TABLE_CONFIG = "Config"; // seul nom fixe : c'est là qu'on lit les autres
  const TABLE_ADMIN = "Administration"; // table vide qui porte la page d'administration : réservée aux propriétaires par les règles d'accès
  const TABLE_CELLULE = "Cellule"; // table vide qui porte la page « Cellule » : lisible des propriétaires et des agents connectés seulement ;
  // Grist masque une page qui contient une table illisible, et toutes les pages rangées dessous
  // Liens personnels (établissements, invités) : page seule, sans la liste des pages ni les panneaux de Grist.
  // (« embed=true » passerait aussi le document en lecture seule : la saisie serait impossible)
  const STYLE_LIEN = ` + "&style=singlePage"`;
  const DEFAUTS_GENERAL = {
    situation: "", // nom de la situation suivie (« Mouvements octobre 2026 »…)
    preset: "en", // « en » (établissements scolaires) ou « esr »
    academies: [], // académies couvertes par le document
    reponses: "Reponses", // table des versions de signalements
    referentiel: "Etablissements", // table des établissements (et des sites)
    formulaires: "Formulaires", // table des formulaires
    agents: "Agents", // équipe de la cellule (une ligne par agent)
    creneaux: "Creneaux", // planning : créneaux de chaque jour
    affectations: "Affectations", // planning : agents affectés à chaque créneau
    emargements: "Emargements", // émargement : prises et fins de service
    actions: "Actions", // suivi des actions (kanban des coordinateurs)
    vigilances: "Vigilances", // veille : vigilances météo en cours (relais n8n, onglet Veille)
    vigilances_journal: "Vigilances_journal", // veille : changements de vigilance (alertes, retour d'expérience)
    retour_normale: ["RAS"], // qualifications qui valent retour à la normale
  };
  const NATURES = ["Nouveau signalement", "Mise à jour"];

  /* ---------- Outils ---------- */
  // « Établissement_ESR » → « etablissement_esr » : comparaison sans accents ni majuscules
  const normaliser = (texte) =>
    String(texte || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  const typeBase = (type) => String(type || "").split(":")[0];
  const cibleRef = (type) => (/^Ref:(.+)$/.exec(String(type || "")) || [])[1] || null;
  const json = (valeur) => JSON.stringify(valeur);
  const maintenant = () => Date.now() / 1000;
  // Options d'une colonne Choice ou ChoiceList : la liste des choix
  const choix = (liste) => json({ choices: liste });
  // Valeur d'une colonne ChoiceList (["L", "EN", …], texte « EN, ESR », ou vide) → liste
  const listeChoix = (valeur) =>
    Array.isArray(valeur)
      ? valeur.filter((element) => element !== "L").map(String)
      : typeof valeur === "string" && valeur.trim()
        ? valeur.split(/\s*,\s*/)
        : [];

  /* ---------- Colonnes attendues ----------
     Les colonnes dont les widgets ont besoin, pour la table des réponses (« reponses ») et pour le référentiel des
     établissements (« referentiel »). Chacune : nom canonique (propriété role), libellé, obligatoire, test de type
     (accepte), motifs de reconnaissance du nom, et la colonne à créer quand elle manque (creer).
     contexte = { reponses, referentiel, cols } : noms des tables et des colonnes déjà associées.
     (Le mot « rôle » reste dans les données enregistrées : clé « roles » de Config, propriété role.) */
  const COLONNES_ATTENDUES = {
    reponses: [
      {
        role: "Etablissement",
        libelle: "Établissement",
        obligatoire: true,
        accepte: (colonne, contexte) => /^Ref:/.test(colonne.type) && cibleRef(colonne.type) !== contexte.reponses,
        motifs: [/etablissement/, /(^|_)etab(_|$)/, /structure|universite|ecole|college|lycee/],
        creer: (contexte) => ({ type: `Ref:${contexte.referentiel}`, isFormula: false }),
      },
      {
        role: "Dossier",
        libelle: "Dossier (signalement initial)",
        obligatoire: true,
        accepte: (colonne, contexte) => colonne.type === `Ref:${contexte.reponses}`,
        motifs: [/(^|_)dossier(_|$)/, /signalement_?initial/],
        creer: (contexte) => ({ type: `Ref:${contexte.reponses}`, isFormula: false }),
      },
      {
        role: "Date_faits",
        libelle: "Date des faits",
        obligatoire: true,
        accepte: (colonne) => /^(Date|DateTime)$/.test(typeBase(colonne.type)) && !colonne.isFormula,
        motifs: [/faits?(_|$)/, /date_?(de_?l_?)?evenement/],
        creer: () => ({ type: "Date", isFormula: false }),
      },
      {
        role: "Cree_le",
        libelle: "Date de saisie",
        obligatoire: true,
        accepte: (colonne) => /^(Date|DateTime)$/.test(typeBase(colonne.type)),
        motifs: [/cree_?le|horodat|creation/, /^date_?(de_?)?(saisie|creation|version)/, /^date$/],
        // formule d'initialisation : l'heure du serveur Grist, posée à la création de la ligne
        creer: () => ({ type: "DateTime:Europe/Paris", isFormula: false, formula: "NOW()" }),
      },
      {
        role: "Nature",
        libelle: "Nature (nouveau signalement ou mise à jour)",
        obligatoire: true,
        accepte: (colonne) => /^(Choice|Text)$/.test(typeBase(colonne.type)) && !colonne.isFormula,
        motifs: [/^nature$/, /nature_?(du_?)?(signalement|version|saisie)/, /initial_?suivi/],
        creer: () => ({ type: "Choice", isFormula: false, widgetOptions: json({ choices: NATURES }) }),
      },
      {
        role: "Qualification",
        libelle: "Qualification",
        obligatoire: true,
        accepte: (colonne) => /^(Choice|ChoiceList|Text)$/.test(typeBase(colonne.type)) && !colonne.isFormula,
        motifs: [/qualif/, /categorie_?(du_?)?(signalement|evenement)/, /type_?(d_?)?evenement/],
        creer: () => ({ type: "Choice", isFormula: false, widgetOptions: json({ choices: ["RAS"] }) }),
      },
      {
        role: "Description",
        libelle: "Description",
        obligatoire: true,
        accepte: (colonne) => typeBase(colonne.type) === "Text" && !colonne.isFormula,
        motifs: [/^description$/, /^description/, /recit|resume_?des_?faits/],
        creer: () => ({ type: "Text", isFormula: false }),
      },
      {
        role: "Derniere_version",
        libelle: "Dernière version (formule)",
        obligatoire: true,
        accepte: (colonne) => colonne.isFormula && /^(Bool|Any)$/.test(typeBase(colonne.type)),
        motifs: [/derniere_?version/],
        creer: (contexte) => ({ type: "Bool", isFormula: true, formula: formuleDerniereVersion(contexte) }),
      },
      {
        role: "Description_Word_",
        libelle: "Description avec les ajouts marqués (Word, Tchap)",
        obligatoire: false,
        parDefaut: true,
        accepte: (colonne) => colonne.isFormula && /^(Text|Any)$/.test(typeBase(colonne.type)),
        motifs: [/description_?word/, /description_?(marquee|tchap)/],
        creer: (contexte) => ({ type: "Text", isFormula: true, formula: formuleDescriptionMarquee(contexte) }),
      },
      {
        role: "Commentaire",
        libelle: "Commentaire de mise à jour",
        obligatoire: false,
        accepte: (colonne) => typeBase(colonne.type) === "Text" && !colonne.isFormula,
        motifs: [/^commentaire/, /commentaire/],
        creer: () => ({ type: "Text", isFormula: false }),
      },
      {
        role: "Site",
        libelle: "Site / bâtiment",
        obligatoire: false,
        accepte: (colonne) => /^(Text|Choice)$/.test(typeBase(colonne.type)) && !colonne.isFormula,
        motifs: [/^site/, /batiment|campus/],
        creer: () => ({ type: "Text", isFormula: false }),
      },
      {
        role: "Clos",
        libelle: "Clos",
        obligatoire: false,
        accepte: (colonne) => colonne.type === "Bool" && !colonne.isFormula,
        motifs: [/^clos/, /cloture|termine/],
        creer: () => ({ type: "Bool", isFormula: false }),
      },
      {
        role: "Auteur",
        libelle: "Auteur (compte Grist, invité ou établissement)",
        obligatoire: false,
        parDefaut: true,
        accepte: () => true,
        motifs: [/^auteur/, /saisi_?par|redacteur|createur/],
        creer: (contexte) => ({
          type: "Text",
          isFormula: false,
          formula: formuleAuteur(
            contexte && contexte.general,
            (contexte && contexte.cols && contexte.cols.Etablissement) || "Etablissement",
          ),
        }),
      },
      {
        role: "Etat_plus_grave",
        libelle: "État le plus grave de l'établissement (formule)",
        obligatoire: false,
        parDefaut: true,
        accepte: (colonne) => colonne.isFormula,
        motifs: [/etat_?(le_?)?plus_?grave/, /etat_?max|gravite_?max|qualification_?max/],
        creer: (contexte) => {
          const qualification = choixQualification(contexte),
            choix = qualification.choix.filter((valeur) => !RAS.test(valeur)); // mêmes choix et couleurs que Qualification
          return {
            type: choix.length ? "Choice" : "Text",
            isFormula: true,
            formula: formuleEtatPlusGrave(contexte, qualification.choix),
            ...(choix.length ? { widgetOptions: json({ choices: choix, choiceOptions: qualification.options }) } : {}),
          };
        },
      },
      {
        role: "Nb_jours_mobilisation",
        libelle: "Nombre de jours de mobilisation (formule)",
        obligatoire: false,
        parDefaut: true,
        accepte: (colonne) => colonne.isFormula && /^(Int|Numeric|Any)$/.test(typeBase(colonne.type)),
        motifs: [/jours?_(de_)?mobilisation/, /^nb_?(de_)?jours/],
        creer: (contexte) => ({ type: "Int", isFormula: true, formula: formuleJoursMobilisation(contexte) }),
      },
    ],
    referentiel: [
      {
        role: "Nom",
        libelle: "Nom de l'établissement",
        obligatoire: true,
        accepte: (colonne) => typeBase(colonne.type) !== "Bool",
        motifs: [
          /^nom$/,
          /appellation/,
          /^(nom|libelle|denomination|intitule)_(de_l_|de_|d_)?etab/,
          /denomination|raison_sociale/,
          /^(nom|libelle|intitule)(_|$)/,
          /^etablissement$/,
          /etablissement/,
        ],
        sauf: /commune|ville|academi|departement|region|contact|responsable|chef|direct|president|type|sigle|uai|rne|tutelle|mail|code|^id/,
        creer: () => ({ type: "Text", isFormula: false }),
      },
      {
        role: "UAI",
        libelle: "UAI",
        obligatoire: true,
        accepte: (colonne) => typeBase(colonne.type) !== "Bool",
        motifs: [/^uai$/, /(^|_)(uai|rne)(_|$)/, /^code_etab/, /identifiant.*etab/],
        sauf: /tutelle|siege|rattach|parent/,
        creer: () => ({ type: "Text", isFormula: false }),
      },
      {
        role: "Type",
        libelle: "Type d'établissement",
        obligatoire: true,
        accepte: (colonne) => typeBase(colonne.type) !== "Bool",
        motifs: [/^type$/, /^type_(d_)?etab/, /^type/, /nature|categorie|typologie/],
        sauf: /code|^id|contrat/,
        creer: () => ({ type: "Text", isFormula: false }),
      },
      {
        role: "Commune",
        libelle: "Commune",
        obligatoire: false,
        accepte: (colonne) => typeBase(colonne.type) !== "Bool",
        motifs: [/^(nom_|libelle_)?(de_la_)?commune$/, /commune/, /ville|localite/],
        sauf: /code|insee|^id|postal/,
        creer: () => ({ type: "Text", isFormula: false }),
      },
      {
        role: "Academie",
        libelle: "Académie",
        obligatoire: true,
        accepte: (colonne) => typeBase(colonne.type) !== "Bool",
        motifs: [/^(nom_|libelle_)?(de_l_)?academie$/, /academie/],
        sauf: /code|^id|region/,
        creer: () => ({ type: "Text", isFormula: false }),
      },
      {
        role: "Departement",
        libelle: "Département",
        obligatoire: true,
        accepte: (colonne) => typeBase(colonne.type) !== "Bool",
        motifs: [/^(nom_|libelle_)?(du_)?departement$/, /departement/],
        sauf: /code|^id|numero/,
        creer: () => ({ type: "Text", isFormula: false }),
      },
      {
        role: "Region_academique",
        libelle: "Région académique",
        obligatoire: false,
        accepte: (colonne) => typeBase(colonne.type) !== "Bool",
        motifs: [/region_?academique/, /^region/],
        sauf: /code|^id/,
        creer: () => ({ type: "Text", isFormula: false }),
      },
      {
        role: "Mail",
        libelle: "Courriel",
        obligatoire: false,
        accepte: (colonne) => typeBase(colonne.type) !== "Bool",
        motifs: [/^(mail|courriel|e_?mail)$/, /mail|courriel/],
        sauf: /contact_2|secondaire/,
        creer: () => ({ type: "Text", isFormula: false }),
      },
      {
        role: "Statut_public_prive",
        libelle: "Public / privé",
        obligatoire: false,
        parDefaut: true,
        accepte: (colonne) => /^(Text|Choice)$/.test(typeBase(colonne.type)),
        motifs: [/statut_?public_?prive/, /public_?prive/, /^secteur/],
        sauf: /contrat|^id/,
        creer: () => ({ type: "Choice", isFormula: false, widgetOptions: json({ choices: ["Public", "Privé"] }) }),
      },
      {
        role: "Libelle_nature",
        libelle: "Nature (libellé)",
        obligatoire: false,
        parDefaut: true,
        accepte: (colonne) => /^(Text|Choice)$/.test(typeBase(colonne.type)),
        motifs: [/libelle_?nature/, /nature_?libelle/, /^nature$/],
        sauf: /code|^id/,
        creer: () => ({ type: "Text", isFormula: false }),
      },
      {
        role: "Nom_circonscription",
        libelle: "Circonscription",
        obligatoire: false,
        parDefaut: true,
        accepte: (colonne) => typeBase(colonne.type) !== "Bool",
        motifs: [/^nom_circonscription$/, /circonscription/],
        sauf: /code|^id|numero/,
        creer: () => ({ type: "Text", isFormula: false }),
      },
      {
        role: "Latitude",
        libelle: "Latitude",
        obligatoire: false,
        parDefaut: true,
        accepte: (colonne) => /^(Numeric|Any)$/.test(typeBase(colonne.type)),
        motifs: [/^latitude/, /^lat$/, /latitude/],
        sauf: /^id/,
        creer: () => ({ type: "Numeric", isFormula: false }),
      },
      {
        role: "Longitude",
        libelle: "Longitude",
        obligatoire: false,
        parDefaut: true,
        accepte: (colonne) => /^(Numeric|Any)$/.test(typeBase(colonne.type)),
        motifs: [/^longitude/, /^lon$|^lng$/, /longitude/],
        sauf: /^id/,
        creer: () => ({ type: "Numeric", isFormula: false }),
      },
      {
        role: "Origine",
        libelle: "Origine de la ligne",
        obligatoire: false,
        accepte: (colonne) => /^(Choice|Text)$/.test(typeBase(colonne.type)),
        motifs: [/^origine$/, /origine|source/],
        sauf: /^id/,
        creer: () => ({
          type: "Choice",
          isFormula: false,
          widgetOptions: json({ choices: ["Annuaire EN", "Annuaire ESR", "OAD", "Manuel"] }),
        }),
      },
    ],
  };

  // Colonnes formules de la table des réponses, recopiées de l'établissement (rôle du référentiel → colonne)
  const COLONNES_ETABLISSEMENT = [
    { id: "UAI", role: "UAI", type: "Text", label: "UAI" },
    { id: "Nom_etablissement", role: "Nom", type: "Text", label: "Nom de l'établissement" },
    { id: "Commune", role: "Commune", type: "Text", label: "Commune" },
    { id: "Departement", role: "Departement", type: "Text", label: "Département" },
    { id: "Academie", role: "Academie", type: "Text", label: "Académie" },
    { id: "Latitude", role: "Latitude", type: "Numeric", label: "Latitude" },
    { id: "Longitude", role: "Longitude", type: "Numeric", label: "Longitude" },
  ];

  /* Jour d'un signalement (date des faits, à défaut date de saisie), qualifications « RAS » ignorées : formules communes
     à l'état le plus grave et au nombre de jours de mobilisation (reprises des documents MEN et MESRE). */
  const RAS = /^\s*ras\s*$/i;
  function entetesMobilisation(contexte) {
    const colonnes = contexte.cols || {},
      faits = colonnes.Date_faits || "Date_faits",
      cree = colonnes.Cree_le || "Cree_le",
      colonneQualification = colonnes.Qualification || "Qualification";
    return [
      `import datetime`,
      `def jour(r):`,
      `  d = r.${faits} or r.${cree}`,
      `  return d.date() if isinstance(d, datetime.datetime) else d`,
      `def qualifs(r):`,
      `  q = r.${colonneQualification}`,
      `  liste = list(q) if isinstance(q, (list, tuple)) else ([q] if q else [])`,
      `  return [str(x).strip() for x in liste if str(x).strip() and str(x).strip().upper() != "RAS"]`,
    ];
  }
  // Choix de la colonne Qualification (ordre et couleurs), lus dans la table existante
  function choixQualification(contexte) {
    const colonneQualification =
      contexte.tRep &&
      contexte.cols &&
      contexte.cols.Qualification &&
      contexte.tRep.colonnes[contexte.cols.Qualification];
    let options = {};
    try {
      options =
        colonneQualification && colonneQualification.widgetOptions
          ? JSON.parse(colonneQualification.widgetOptions)
          : {};
    } catch (_) {
      options = {};
    }
    return { choix: Array.isArray(options.choices) ? options.choices : [], options: options.choiceOptions || {} };
  }
  // Jours distincts (hors RAS) où l'établissement a un signalement, jusqu'au jour de cette ligne
  function formuleJoursMobilisation(contexte) {
    const colonneEtablissement = (contexte.cols && contexte.cols.Etablissement) || "Etablissement";
    return [
      ...entetesMobilisation(contexte),
      `j = jour(rec)`,
      `if not $${colonneEtablissement} or not j or not qualifs(rec):`,
      `  return None`,
      `jours = {jour(r) for r in ${contexte.reponses}.lookupRecords(${colonneEtablissement}=$${colonneEtablissement}) if qualifs(r)}`,
      `return len([d for d in jours if d and d <= j])`,
    ].join("\n");
  }
  // Qualification la plus grave de l'établissement jusqu'au jour de cette ligne : la première dans ORDRE (ordre des choix
  // de la colonne Qualification à l'installation, du plus grave au moins grave) ; hors liste, la plus récente
  function formuleEtatPlusGrave(contexte, choix) {
    const colonneEtablissement = (contexte.cols && contexte.cols.Etablissement) || "Etablissement";
    const ordre = (choix || []).filter((valeur) => !RAS.test(valeur));
    return [
      ...entetesMobilisation(contexte),
      `# du plus grave au moins grave : à ajuster si l'ordre des choix change`,
      `ORDRE = ${JSON.stringify(ordre)}`,
      `j = jour(rec)`,
      `if not $${colonneEtablissement} or not j:`,
      `  return None`,
      `vus = {}`,
      `for r in ${contexte.reponses}.lookupRecords(${colonneEtablissement}=$${colonneEtablissement}):`,
      `  d = jour(r)`,
      `  if d and d <= j:`,
      `    for q in qualifs(r):`,
      `      vus[q] = max(vus.get(q, d), d)`,
      `if not vus:`,
      `  return None`,
      `def rang(item):`,
      `  q, d = item`,
      `  return (ORDRE.index(q) if q in ORDRE else len(ORDRE), -d.toordinal(), q)`,
      `return sorted(vus.items(), key=rang)[0][0]`,
    ].join("\n");
  }
  // Formule de la dernière version, décidée le 15/10/2026 : un dossier = un établissement un jour donné ;
  // la dernière version est la plus récente par date de saisie, puis par numéro de ligne.
  function formuleDerniereVersion(contexte) {
    const colonneDossier = (contexte.cols && contexte.cols.Dossier) || "Dossier",
      colonneCreeLe = (contexte.cols && contexte.cols.Cree_le) || "Cree_le";
    return [
      `initiale = $${colonneDossier} or rec`,
      `versions = list(${contexte.reponses}.lookupRecords(${colonneDossier}=initiale.id))`,
      `if initiale not in versions:`,
      `  versions.append(initiale)`,
      `def cle(r):`,
      `  return (r.${colonneCreeLe} is not None, r.${colonneCreeLe}, r.id)`,
      `return max(versions, key=cle).id == $id`,
    ].join("\n");
  }

  // Description d'une mise à jour avec les mots ajoutés depuis la version précédente entourés de == (repris par
  // n8n pour Tchap et par le point de situation pour Word). Formule des documents MEN et ESR, rendue paramétrable.
  function formuleDescriptionMarquee(contexte) {
    const colonneDossier = (contexte.cols && contexte.cols.Dossier) || "Dossier",
      colonneCreeLe = (contexte.cols && contexte.cols.Cree_le) || "Cree_le",
      desc = (contexte.cols && contexte.cols.Description) || "Description";
    return `import difflib, re

# 1. Retrouver la version précédente du même dossier
dossier = $${colonneDossier} or rec
versions = list(${contexte.reponses}.lookupRecords(${colonneDossier}=dossier))
for r in (dossier, rec):           # la ligne initiale et la ligne courante, même sans dossier renseigné
  if r not in versions:
    versions.append(r)
versions.sort(key=lambda r: (r.${colonneCreeLe} is not None, r.${colonneCreeLe}, r.id))
position = versions.index(rec)
if position == 0:
  return $${desc} or ""         # signalement initial : rien à comparer
precedente = versions[position - 1]

# 2. Comparer mot à mot avec sa description
jetons = lambda t: re.findall(r"\\*\\*|\\s+|\\w+|[^\\w\\s]", t)
BORD = " \\t\\n,.;:!?)(«»\\"'-–—"      # ponctuation et espaces laissés hors du marquage

def marquer(morceaux):
  # Entoure de == chaque suite de mots ajoutés ; ponctuation en bordure et ** restent dehors
  sortie, groupe = [], []
  def fermer():
    if groupe:
      texte = "".join(groupe)
      coeur = texte.strip(BORD)
      if coeur:
        i = texte.index(coeur)
        sortie.append(texte[:i] + "==" + coeur + "==" + texte[i + len(coeur):])
      else:
        sortie.append(texte)
      del groupe[:]
  for j in morceaux:
    if j == "**":
      fermer()
      sortie.append(j)
    else:
      groupe.append(j)
  fermer()
  return "".join(sortie)

a, b = jetons(precedente.${desc} or ""), jetons($${desc} or "")
resultat = []
for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
  if op == "equal":
    resultat.append("".join(b[j1:j2]))
  elif op in ("insert", "replace"):
    resultat.append(marquer(b[j1:j2]))
  # les suppressions ne sont pas reprises
return "".join(resultat)`;
  }

  /* ---------- Champs suivis (EN, ESR) ---------- */
  // Champs de mobilisation : rattachés à la version des formulaires (en / esr)
  const CHAMPS = [
    { id: "EN", version: "en", libelle: "Éducation nationale" },
    { id: "ESR", version: "esr", libelle: "Enseignement supérieur et recherche" },
  ];
  /* Champs suivis par le document (ex. MEN et MESRE) : chacun a sa table de réponses et son référentiel, pour que
     les données ne se mêlent pas. Le premier est celui du préréglage (general.reponses, general.referentiel) ;
     les suivants sont dans general.autres_champs : [{ champ: "ESR", reponses, referentiel }]. */
  const AUTRE_CHAMP_DEFAUT = {
    EN: { reponses: "Reponses_EN", referentiel: "Etablissements_EN" },
    ESR: { reponses: "Reponses_ESR", referentiel: "Etablissements_ESR" },
  };
  function espaces(reglagesGeneraux) {
    reglagesGeneraux = reglagesGeneraux || DEFAUTS_GENERAL;
    const premier = reglagesGeneraux.preset === "esr" ? "ESR" : "EN";
    const liste = [
      {
        champ: premier,
        reponses: reglagesGeneraux.reponses || DEFAUTS_GENERAL.reponses,
        referentiel: reglagesGeneraux.referentiel || DEFAUTS_GENERAL.referentiel,
      },
    ];
    (Array.isArray(reglagesGeneraux.autres_champs) ? reglagesGeneraux.autres_champs : []).forEach((autreChamp) => {
      if (
        autreChamp &&
        CHAMPS.some((champ) => champ.id === autreChamp.champ) &&
        autreChamp.reponses &&
        !liste.some((espace) => espace.champ === autreChamp.champ || espace.reponses === autreChamp.reponses)
      )
        liste.push({
          champ: autreChamp.champ,
          reponses: autreChamp.reponses,
          referentiel:
            autreChamp.referentiel || (AUTRE_CHAMP_DEFAUT[autreChamp.champ] || {}).referentiel || liste[0].referentiel,
        });
    });
    return liste.map((espace) => ({
      ...espace,
      version: (CHAMPS.find((champ) => champ.id === espace.champ) || CHAMPS[0]).version,
      libelle: (CHAMPS.find((champ) => champ.id === espace.champ) || {}).libelle || espace.champ,
    }));
  }
  const espaceDeTable = (reglagesGeneraux, table) =>
    espaces(reglagesGeneraux).find((espace) => espace.reponses === table) || null;

  /* ---------- Colonne Auteur et liens d'invités ----------
     Un agent invité accède par un lien personnel, sans compte Grist.
     Clé dans Agents.Cle_acces, page de saisie dans Agents.Page_saisie, lien dans Agents.Lien_acces (?Invite_=<clé>).
     Attribut utilisateur « Invite » (onglet Accès) : l'invité a les droits d'un agent actif de l'équipe. */
  const INVITE = {
    attribut: "Invite",
    cle: "Cle_acces",
    page: "Page_saisie",
    lien: "Lien_acces",
    expire: "Lien_expire_le",
    valide: "Lien_valide",
  };
  // Auteur d'une ligne (formule d'initialisation) : adresse du compte Grist, sinon « Invité : <nom> » pour le lien d'un agent,
  // sinon « Établissement : <UAI> <nom> » pour le lien d'un établissement (colonneEtablissement : colonne Réf. de l'établissement de la ligne).
  // La première ligne sert de marque de version : une formule qui ne la porte pas est proposée à la mise à jour.
  const MARQUE_AUTEUR = "# Auteur (socle v2.1)";
  function formuleAuteur(reglagesGeneraux, colonneEtablissement) {
    const tableAgents = (reglagesGeneraux && reglagesGeneraux.agents) || DEFAUTS_GENERAL.agents;
    const lignes = [
      MARQUE_AUTEUR,
      `email = user.Email`,
      `if email and email != "anon@getgrist.com":`,
      `  return email`,
      `lk = vars(user.LinkKey) if getattr(user, "LinkKey", None) is not None else {}`,
      `if lk.get("${INVITE.attribut}"):`,
      `  a = ${tableAgents}.lookupOne(${INVITE.cle}=lk["${INVITE.attribut}"])`,
      `  return ("Invité : " + a.Nom) if a else "Invité"`,
    ];
    if (colonneEtablissement)
      lignes.push(
        `if any(k.startswith("Etab") and v for k, v in lk.items()):`,
        `  e = $${colonneEtablissement}`,
        `  return ("Établissement : " + " ".join(str(x) for x in (getattr(e, "UAI", ""), getattr(e, "Nom", "")) if x)) if e else "Établissement"`,
      );
    lignes.push(`return "Lien anonyme" if email == "anon@getgrist.com" else (email or "")`);
    return lignes.join("\n");
  }
  // Formule d'auteur à remplacer : vide, ancienne (user.Email seul) ou d'une version antérieure du socle — jamais une formule écrite à la main
  function auteurAMettreAJour(colonne) {
    if (!colonne || colonne.isFormula) return false;
    const formule = String(colonne.formula || "").trim();
    return (
      formule === "" ||
      formule === "user.Email" ||
      (/^# Auteur \(socle/.test(formule) && !formule.startsWith(MARQUE_AUTEUR)) ||
      (/user\.LinkKey/.test(formule) && /Invité/.test(formule) && !formule.startsWith("#"))
    );
  }

  /* ---------- Lecture des métadonnées Grist ---------- */
  async function lireMeta() {
    const [tablesGrist, colonnesGrist] = await Promise.all([
      Donnees.lire("_grist_Tables"),
      Donnees.lire("_grist_Tables_column"),
    ]);
    const tableParId = {},
      tables = {};
    tablesGrist.id.forEach((idTable, i) => {
      const tableId = tablesGrist.tableId[i];
      if (!tableId || tableId.startsWith("GristHidden")) return;
      tableParId[idTable] = tableId;
      tables[tableId] = { ref: idTable, tableId, colonnes: {} };
    });
    colonnesGrist.id.forEach((idColonne, i) => {
      const tableId = tableParId[colonnesGrist.parentId[i]],
        colId = colonnesGrist.colId[i];
      if (!tableId || !colId || colId === "manualSort" || colId.startsWith("gristHelper")) return;
      tables[tableId].colonnes[colId] = {
        ref: idColonne,
        colId,
        type: colonnesGrist.type[i],
        label: colonnesGrist.label[i] || colId,
        isFormula: !!colonnesGrist.isFormula[i],
        formula: colonnesGrist.formula[i] || "",
        widgetOptions: colonnesGrist.widgetOptions[i] || "",
      };
    });
    return tables;
  }

  /* ---------- Config ---------- */
  // Renvoie null si la table Config n'existe pas ; sinon { valeurs: {clé: objet}, ids: {clé: id de ligne}, erreurs: [] }
  async function lireConfig(meta) {
    if (meta && !meta[TABLE_CONFIG]) return null;
    let table;
    table = await Donnees.lireSiPresente(TABLE_CONFIG);
    if (!table) return null;
    const config = { valeurs: {}, ids: {}, erreurs: [] };
    (table.id || []).forEach((id, i) => {
      const cle = String((table.Cle || [])[i] || "").trim();
      if (!cle) return;
      const brut = (table.Valeur || [])[i];
      config.ids[cle] = id;
      try {
        config.valeurs[cle] = brut ? JSON.parse(brut) : null;
      } catch (erreur) {
        config.erreurs.push(`La valeur de la clé « ${cle} » n'est pas un JSON valide : ${erreur.message}`);
      }
    });
    return config;
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
    await Donnees.ecrire([actionConfig(config, cle, valeur)]);
  }

  /* ---------- Association des colonnes ----------
     Pour chaque colonne attendue d'une famille (« reponses » ou « referentiel »), la colonne réelle de la table qui
     la tient. Ordre : association du panneau Grist (mappings), puis clé « roles » de Config, puis nom canonique,
     puis reconnaissance par le nom ou le libellé. Une colonne réelle ne sert qu'une fois.
     Renvoie { <nom canonique>: { col, origine, alerte? } } ; col null si aucune colonne ne convient. */
  function associerColonnes(famille, tableMeta, contexte, assocConfig = {}, mappings = {}) {
    const associations = {},
      dejaAssociees = new Set();
    if (!tableMeta) return associations;
    const colonnes = Object.values(tableMeta.colonnes);
    const prendre = (definition, colId, origine) => {
      associations[definition.role] = { col: colId, origine };
      dejaAssociees.add(colId);
    };
    const convient = (definition, colonne) =>
      colonne && !dejaAssociees.has(colonne.colId) && definition.accepte(colonne, contexte);
    const definitions = COLONNES_ATTENDUES[famille];
    // 1 et 2 : associations explicites (mêmes contrôles de type)
    for (const definition of definitions) {
      for (const [source, origine] of [
        [mappings, "panneau Grist"],
        [assocConfig, "Config"],
      ]) {
        const colId = source && source[definition.role];
        if (associations[definition.role] || !colId) continue;
        const colonne = tableMeta.colonnes[colId];
        if (convient(definition, colonne)) prendre(definition, colId, origine);
        else
          associations[definition.role] = {
            col: null,
            origine: null,
            alerte: `L'association « ${definition.role} → ${colId} » (${origine}) est ignorée : colonne absente ou de type incompatible.`,
          };
      }
    }
    // 3 : nom canonique
    for (const definition of definitions) {
      if (associations[definition.role] && associations[definition.role].col) continue;
      const colonne = tableMeta.colonnes[definition.role];
      if (convient(definition, colonne)) prendre(definition, definition.role, "nom canonique");
    }
    // 4 : reconnaissance
    for (const definition of definitions) {
      if (associations[definition.role] && associations[definition.role].col) continue;
      let trouve = null;
      for (const motif of definition.motifs) {
        trouve = colonnes.find(
          (colonne) =>
            convient(definition, colonne) &&
            [normaliser(colonne.colId), normaliser(colonne.label)].some(
              (nom) => nom && motif.test(nom) && !(definition.sauf && definition.sauf.test(nom)),
            ),
        );
        if (trouve) break;
      }
      if (trouve) prendre(definition, trouve.colId, "reconnaissance");
      else if (!associations[definition.role]) associations[definition.role] = { col: null, origine: null };
    }
    return associations;
  }
  // Colonnes d'une table compatibles avec une colonne attendue (pour les listes de choix de l'administration)
  function colonnesCompatibles(famille, role, tableMeta, contexte) {
    const definition = COLONNES_ATTENDUES[famille].find((candidate) => candidate.role === role);
    if (!definition || !tableMeta) return [];
    return Object.values(tableMeta.colonnes)
      .filter((colonne) => definition.accepte(colonne, contexte))
      .map((colonne) => colonne.colId);
  }

  window.Socle = {
    VERSION,
    TABLE_CONFIG,
    TABLE_ADMIN,
    TABLE_CELLULE,
    STYLE_LIEN,
    DEFAUTS_GENERAL,
    NATURES,
    normaliser,
    cibleRef,
    json,
    COLONNES_ATTENDUES,
    COLONNES_ETABLISSEMENT,
    formuleDerniereVersion,
    CHAMPS,
    AUTRE_CHAMP_DEFAUT,
    espaces,
    espaceDeTable,
    choix,
    INVITE,
    formuleAuteur,
    auteurAMettreAJour,
    listeChoix,
    lireMeta,
    lireConfig,
    general,
    actionConfig,
    ecrireConfig,
    associerColonnes,
    colonnesCompatibles,
  };
})();
