/* PRISME — widget de saisie, module 06/31 : Liaison avec Grist (colonnes, réception des lignes) et lecture de la configuration.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* =========================================================
   Grist
   ========================================================= */
const COLONNES = [
  {
    name: "Clos",
    title: "Clos (signalement terminé)",
    type: "Bool",
    optional: true,
    description:
      "Case cochée sur la dernière étape quand la situation est terminée (« Autres actions › Clore le signalement »).",
  },
  { name: "Etablissement", title: "Établissement (référence)", type: "Ref", optional: true },
  { name: "Description", title: "Description du signalement", type: "Text", optional: true },
  { name: "Qualification", title: "Qualification", type: "Choice,ChoiceList,Text", optional: true },
  { name: "Date", title: "Date de la version", type: "DateTime,Date", optional: true },
  {
    name: "Date_faits",
    title: "Date des faits",
    type: "Date,DateTime",
    optional: true,
    description:
      "Jour des faits signalés (aujourd'hui par défaut). Sert au décompte des jours de mobilisation et au classement dans le point de situation.",
  },
  { name: "Dossier", title: "Dossier (référence vers cette même table)", type: "Ref", optional: true },
  { name: "Nature", title: "Nature (Nouveau signalement / Mise à jour)", type: "Choice,Text", optional: true },
  { name: "Commentaire", title: "Commentaire de suivi", type: "Text", optional: true },
  {
    name: "Site",
    title: "Site / bâtiment",
    type: "Text",
    optional: true,
    description:
      "Saisi à la main dans le bloc Établissement. Sert aussi au repérage des doublons : même établissement, même site, même date des faits.",
  },
  { name: "Auteur", title: "Auteur (formule user.Email)", optional: true },
  {
    name: "Questions",
    title: "Questions supplémentaires",
    optional: true,
    allowMultiple: true,
    description: "Questions posées dans le signalement initial et reprises dans chaque suivi.",
  },
  {
    name: "Questions_dep",
    title: "Visa départemental",
    optional: true,
    allowMultiple: true,
    description: "Colonnes renseignées par l'échelon départemental (invisibles pour l'établissement).",
  },
  {
    name: "Questions_aca",
    title: "Visa académique",
    optional: true,
    allowMultiple: true,
    description: "Colonnes renseignées par l'échelon académique (invisibles pour l'établissement).",
  },
];

// Pas de onEditOptions ni d'options de widget : dans le Custom Widget Builder, ce bouton ouvre
// l'éditeur de code et les options du widget contiennent le code lui-même. Les réglages sont
// donc stockés dans la table Parametres (voir PARAMETRES).

etatSaisie.file = Promise.resolve();
// une erreur pendant le chargement (référentiel pas encore prêt) est affichée ; ensuite, seulement dans la console
const enFile = (f) => {
  etatSaisie.file = etatSaisie.file.then(f).catch((e) => {
    console.warn(e);
    if (typeof etatSaisie.referentielLu !== "undefined" && !etatSaisie.referentielLu)
      signalerErreurChargement(e, "traitement");
  });
  return etatSaisie.file;
};

const OPTIONS = { keepEncoded: true, expandRefs: false, includeColumns: "normal" };

const idsCreesIci = new Set(); // lignes créées par ce widget-ci
/* Mesure de l'activité (⚙ › « Activité du widget ») : envois de Grist, temps de traitement, lectures.
   Sert à savoir si une lenteur vient du widget ou de Grist. */
const ACTIVITE = {
  debut: Date.now(),
  envois: [],
  regroupes: 0,
  curseur: 0,
  curseurIgnores: 0,
  longues: 0,
  dureeLongues: 0,
};
// lectures du document : comptées par Donnees (Donnees.compteurs())
(() => {
  try {
    new PerformanceObserver((liste) => {
      for (const e of liste.getEntries()) {
        ACTIVITE.longues++;
        ACTIVITE.dureeLongues += e.duration;
      }
    }).observe({ type: "longtask", buffered: true });
  } catch (_) {}
})();
async function traiterEnvoi(recs, m) {
  etatSaisie.mappings = m;
  etatSaisie.enregistrements = recs || [];
  const ids = new Set(etatSaisie.enregistrements.map((r) => r.id));
  etatSaisie.idsNouveaux = etatSaisie.idsPrecedents
    ? new Set([...ids].filter((i) => !etatSaisie.idsPrecedents.has(i)))
    : new Set();
  etatSaisie.idsPrecedents = ids;
  const sig = JSON.stringify(m);
  if (sig !== etatSaisie.signatureMappings) {
    etatSaisie.signatureMappings = sig;
    await chargerConfiguration();
  }
  await rafraichir();
}

/* =========================================================
   Configuration : lue une fois, relue si les associations changent
   ========================================================= */
function lireMeta() {
  if (!etatSaisie.promesseMeta)
    etatSaisie.promesseMeta = Promise.all([Donnees.lire("_grist_Tables"), Donnees.lire("_grist_Tables_column")]).catch(
      async (e) => {
        const m = await metaDeSecours();
        if (!m) throw e;
        return m;
      },
    );
  return etatSaisie.promesseMeta;
}
async function metaDeSecours() {
  try {
    const t = await Donnees.lire("Config"),
      i = (t.Cle || []).indexOf("schema");
    const sch = i >= 0 && t.Valeur[i] ? JSON.parse(t.Valeur[i]) : null;
    if (!sch || !sch.tables) return null;
    const tables = { id: [], tableId: [] },
      cols = {
        id: [],
        parentId: [],
        colId: [],
        label: [],
        type: [],
        widgetOptions: [],
        isFormula: [],
        formula: [],
        description: [],
        visibleCol: [],
        parentPos: [],
      };
    let n = 0;
    Object.entries(sch.tables).forEach(([tid, liste], k) => {
      tables.id.push(k + 1);
      tables.tableId.push(tid);
      const base = n;
      liste.forEach((c, j) => {
        n++;
        cols.id.push(n);
        cols.parentId.push(k + 1);
        cols.colId.push(c.colId);
        cols.label.push(c.label || c.colId);
        cols.type.push(c.type || "Any");
        cols.widgetOptions.push(c.widgetOptions || "");
        cols.isFormula.push(!!c.isFormula);
        cols.formula.push(c.formula || "");
        cols.description.push(c.description || "");
        cols.parentPos.push(j + 1);
        cols.visibleCol.push(0);
      });
      liste.forEach((c, j) => {
        if (c.visibleCol) {
          const v = liste.findIndex((x) => x.colId === c.visibleCol);
          if (v >= 0) cols.visibleCol[base + j] = base + v + 1;
        }
      });
    });
    etatSaisie.metaCopie = true;
    return [tables, cols];
  } catch (_) {
    return null;
  }
}
// Pièces jointes et copie des colonnes (liens d'établissement) : si la copie date d'avant l'adaptation d'une question
// Pièces jointes, la colonne y figure encore comme simple colonne alors qu'elle est devenue une formule. Les colonnes
// réelles de la table disent si sa colonne d'envoi existe : le formulaire écrit alors dans celle-ci.
function idColonne(libelle) {
  // identifiant donné par l'administration à une colonne créée (voir admin/formulaires.js)
  let b = String(libelle || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  if (/^\d/.test(b)) b = "Q_" + b;
  return b ? b.charAt(0).toUpperCase() + b.slice(1) : "";
}
function colonneEnvoiPj(m, cols) {
  const bas = (x) => String(x).toLowerCase(),
    autres = cols.filter((c) => c !== m.colId);
  const pref = bas(`${m.colId}_envoi`);
  const parPrefixe = autres.find((c) => bas(c).startsWith(pref));
  if (parPrefixe) return parPrefixe;
  const base = idColonne(`${m.libelle} (envoi)`);
  if (!base) return null;
  const re = new RegExp(`^${base.replace(/[^A-Za-z0-9_]/g, "")}(_\\d+)?$`, "i");
  return autres.find((c) => re.test(c) && bas(c) !== bas(m.colId)) || null;
}
async function completerPjCopie(tid, meta) {
  const pj = Object.values(meta).filter((m) => typeBase(m.type) === "Attachments" && !m.formule);
  if (!pj.length) return;
  let cols;
  try {
    cols = Object.keys((await Donnees.lire(tid)) || {});
  } catch (_) {
    return;
  }
  for (const m of pj) {
    const envoi = colonneEnvoiPj(m, cols);
    if (!envoi) continue;
    m.formule = true;
    m.texteFormule = `for x in ($${envoi} or "").split():`;
    if (!meta[envoi])
      meta[envoi] = {
        colId: envoi,
        libelle: `${m.libelle} (envoi)`,
        type: "Text",
        opts: {},
        description: "",
        formule: false,
        texteFormule: "",
        colAffichee: null,
      };
  }
}
async function metaColonnes(tid) {
  const [tables, cols] = await lireMeta();
  const tRef = tables.id[tables.tableId.indexOf(tid)];
  if (tRef == null) return null;
  const res = {};
  for (let i = 0; i < cols.id.length; i++) {
    if (cols.parentId[i] !== tRef) continue;
    let opts = {};
    try {
      opts = JSON.parse(cols.widgetOptions[i] || "{}");
    } catch (_) {}
    const visible = cols.visibleCol ? cols.visibleCol[i] : 0;
    res[cols.colId[i]] = {
      colId: cols.colId[i],
      libelle: cols.label[i],
      type: cols.type[i],
      opts,
      description: (cols.description && cols.description[i]) || "",
      formule: !!(cols.isFormula && cols.isFormula[i] && cols.formula[i]),
      texteFormule: (cols.formula && cols.formula[i]) || "",
      colAffichee: visible ? cols.colId[cols.id.indexOf(visible)] : null,
    };
  }
  return res;
}

// La description de la colonne Grist porte les réglages de la question :
//   *                     la réponse est obligatoire
//   [si Autre_col = A, B] n'afficher que si Autre_col vaut A ou B
//   [si Autre_col != A]   n'afficher que si Autre_col ne vaut pas A
//   [si Autre_col]        n'afficher que si Autre_col est renseignée (ou [si Autre_col n'est pas vide]) ;
//                         [si Autre_col vide] (ou [si Autre_col est vide]) pour l'inverse
//   [liste] / [boutons]   forcer une liste déroulante ou des boutons pour un choix
//   [case]                oui / non : simple case à cocher au lieu des boutons Oui / Non
//   [positif]             nombre : pas de valeur négative ; [min 1] / [max 500] pour d'autres bornes
//   [tableau Table]       colonne texte : saisie en plusieurs lignes, champs = colonnes de la table Table
//   [ordre 1]             champ d'une table de tableau : position dans chaque ligne (1 = en haut)
//   [auto]                champ texte d'une table de tableau : rempli automatiquement à partir des autres champs
//                         de la ligne (mêmes réglages que la description automatique), modifiable
//   [masqué]              colonne d'une table de tableau absente du formulaire (valeur conservée dans la table)
//   [court]               texte sur une seule ligne (au lieu d'une zone de plusieurs lignes)
//   [confidentiel]        exclue de la description automatique (et, dans une table de tableau, de la colonne JSON)
//   [couleur]             le formulaire prend la couleur du choix sélectionné (couleurs des choix dans Grist) ;
//                         [couleur Blocage=rouge, Intrusion=#e4794a] pour imposer les couleurs ;
//                         [couleur >50=rouge, >10=orange] seuils ; [couleur renseigné=rouge] / [couleur vide=gris]
// Le reste du texte devient l'aide affichée sous la question.
// La colonne peut être désignée par son identifiant (Type_incident) ou par son libellé (Type d'incident).
// Opérateurs : = != ≠ > >= < <=, « vide », ou rien (= renseignée). Plusieurs valeurs séparées par des virgules.
// Guillemets droits, typographiques ou français autour d'une valeur : ignorés
const sansGuillemets = (v) =>
  String(v)
    .trim()
    .replace(/^["'«“‘\s]+|["'»”’\s]+$/g, "")
    .trim();
function lireCondition(texte) {
  const m = texte.match(/\[\s*si\s+([^\]]+)\]/i);
  if (!m) return null;
  const corps = m[1].trim();
  let e;
  // « : » est accepté à la place de « = » quand aucun autre opérateur n'est présent
  if ((e = corps.match(/^(.+?)\s*(!=|≠|>=|<=|=|>|<)\s*(.+)$/)) || (e = corps.match(/^([^:]+?)\s*(:)\s*(.+)$/)))
    return {
      ref: sansGuillemets(e[1]),
      op: e[2] === "≠" ? "!=" : e[2] === ":" ? "=" : e[2],
      brut: sansGuillemets(e[3]), // valeur entière, pour un choix qui contient lui-même une virgule
      valeurs: e[3]
        .split(/\s*,\s*/)
        .map(sansGuillemets)
        .filter(Boolean),
      texte: corps,
    };
  // « n'est pas vide », « non vide », « renseigné(e) » : la colonne doit être remplie
  if ((e = corps.match(/^(.+?)\s+(?:n['’]est\s+pas\s+vide|non\s+vide|est\s+renseign[ée]e?|renseign[ée]e?)$/i)))
    return { ref: sansGuillemets(e[1]), op: "rempli", texte: corps };
  if ((e = corps.match(/^(.+?)\s+(?:est\s+)?vide$/i))) return { ref: sansGuillemets(e[1]), op: "vide", texte: corps };
  return { ref: sansGuillemets(corps), op: "rempli", texte: corps };
}
// Bornes d'un nombre : [positif] (0 ou plus), [min 1], [max 500]
function lireBorne(txt, mot) {
  const m = txt.match(new RegExp(`\\[\\s*${mot}(?:imum)?\\s*(-?\\d+(?:[.,]\\d+)?)\\s*\\]`, "i"));
  return m ? parseFloat(m[1].replace(",", ".")) : null;
}
// [tableau Blesses] ou [tableau Blesses lignes=Nb de blessés] (colonne nombre qui fixe le nombre de lignes)
function lireRepereTableau(txt) {
  const m = txt.match(/\[\s*tableau\s+([^\]\s]+)(?:\s+lignes?\s*[=:]\s*([^\]]+?))?\s*\]/i);
  return m ? { table: m[1], lignes: m[2] ? sansGuillemets(m[2]) : null } : null;
}
const avecRegles = (q) => {
  const txt = (q.description || "").trim();
  const min = /\[\s*(positif|positive|non\s+n[ée]gatif)\s*\]/i.test(txt) ? 0 : lireBorne(txt, "min");
  const forcer = /\[liste\]/i.test(txt) ? "liste" : /\[boutons\]/i.test(txt) ? "boutons" : null;
  return {
    ...q,
    obligatoire: txt.startsWith("*"),
    condition: lireCondition(txt),
    forcer,
    caseACocher: /\[case\]/i.test(txt), // [case] : garder la simple case à cocher pour un booléen
    tableau: lireRepereTableau(txt),
    confidentiel: /\[\s*confidentiel(le)?\s*\]/i.test(txt),
    min,
    max: lireBorne(txt, "max"),
    auto: /\[\s*auto(matique)?\s*\]/i.test(txt),
    masque: /\[\s*(masqu[ée]e?|cach[ée]e?|invisible)\s*\]/i.test(txt),
    ordre: (txt.match(/\[\s*ordre\s*(\d+)\s*\]/i) || [])[1] != null ? +txt.match(/\[\s*ordre\s*(\d+)\s*\]/i)[1] : null,
    court: !!q.court || /\[\s*(court|une\s+ligne)\s*\]/i.test(txt),
    aide: txt
      .replace(/^\*\s*/, "")
      .replace(/\[\s*ordre\s*\d+\s*\]/gi, "")
      .replace(/\[\s*auto(matique)?\s*\]/gi, "")
      .replace(/\[\s*(masqu[ée]e?|cach[ée]e?|invisible)\s*\]/gi, "")
      .replace(/\[\s*(court|une\s+ligne)\s*\]/gi, "")
      .replace(/\[\s*si\s+[^\]]+\]/gi, "")
      .replace(/\[(liste|boutons|case)\]/gi, "")
      .replace(/\[\s*(positif|positive|non\s+n[ée]gatif|min(?:imum)?\s*-?[\d.,]+|max(?:imum)?\s*-?[\d.,]+)\s*\]/gi, "")
      .replace(/\[\s*couleurs?\b[^\]]*\]/gi, "")
      .replace(/\[\s*tableau\s+[^\]]*\]/gi, "")
      .replace(/\[\s*confidentiel(le)?\s*\]/gi, "")
      .trim(),
  };
};
const defsDe = (cle) =>
  etatSaisie.mappings
    ? (etatSaisie.mappings[cle] || [])
        .map((c) => etatSaisie.metaSig[c])
        .filter(Boolean)
        .map(avecRegles)
    : [];

/* Branchement sur Grist : appelé par le dernier module (31-parcours.js), une fois TOUS les modules chargés.
   Grist peut envoyer les lignes dès ce branchement ; le navigateur traiterait alors cet envoi entre deux fichiers
   si le branchement était fait ici, avant que les modules suivants (visas, parcours…) soient définis. */
function brancherGrist() {
  grist.ready({ requiredAccess: "full", columns: COLONNES });
  grist.onRecords((recs, m) => {
    const arrive = {
      t: Date.now(),
      lignes: (recs || []).length,
      colonnes: recs && recs[0] ? Object.keys(recs[0]).length : 0,
      ms: null,
    };
    ACTIVITE.envois.push(arrive);
    if (ACTIVITE.envois.length > 300) ACTIVITE.envois.shift();
    const dejaPrevu = !!etatSaisie.envoiEnAttente;
    etatSaisie.envoiEnAttente = { recs, m, arrive };
    if (dejaPrevu) {
      ACTIVITE.regroupes++;
      return;
    }
    return enFile(async () => {
      const { recs, m, arrive } = etatSaisie.envoiEnAttente;
      etatSaisie.envoiEnAttente = null;
      const t0 = performance.now();
      try {
        await traiterEnvoi(recs, m);
      } finally {
        arrive.ms = performance.now() - t0;
      }
    });
  }, OPTIONS);
  grist.onRecord(
    (rec) =>
      enFile(async () => {
        ACTIVITE.curseur++;
        if (!rec || (!etatSaisie.mappings && !Object.keys(etatSaisie.colsParDefaut).length)) return;
        const premiereSelection = !etatSaisie.curseurInitialVu;
        etatSaisie.curseurInitialVu = true;
        const r = etatSaisie.enregistrements.find((x) => x.id === rec.id) || rec;
        const d = refId(col("Dossier") && r[col("Dossier")]) || r.id;
        const renvoi = rec.id === etatSaisie.dernierCurseur;
        etatSaisie.dernierCurseur = rec.id;
        // même signalement : un simple renvoi (après une modification de la table) est déjà traité par onRecords,
        // qui rafraîchit le dossier ouvert ; seul un clic sur une autre ligne du même dossier le relit
        if (d === etatSaisie.dossierId) {
          if (renvoi) {
            ACTIVITE.curseurIgnores++;
            return;
          }
          await ouvrirDossier(d);
          return;
        }
        // Ligne tout juste créée par une autre vue : Grist a pu y décaler le curseur lors de l'insertion.
        const creeeAilleurs =
          (etatSaisie.idsNouveaux.has(rec.id) || !etatSaisie.enregistrements.some((x) => x.id === rec.id)) &&
          !idsCreesIci.has(rec.id);
        if (creeeAilleurs) return;
        if (renvoi) return; // curseur inchangé, mais le widget affiche autre chose (nouveau signalement, menu)
        // Vrai déplacement du curseur : on ne l'applique pas si une saisie est en cours, pour ne rien perdre
        if (etatSaisie.modifie) {
          statut(
            "statut-signalement",
            "Saisie en cours non enregistrée : enregistrez-la ou cliquez sur « " +
              $("btn-effacer").textContent +
              " » avant d'ouvrir un autre signalement.",
            "err",
          );
          return;
        }
        await ouvrirDossier(d);
        if (!premiereSelection && etatSaisie.dossierId === d) {
          cacherConfirmation();
          montrerVue("saisie");
        }
      }),
    OPTIONS,
  );
  grist.onNewRecord(() =>
    enFile(async () => {
      const renvoi = etatSaisie.dernierCurseur === "new";
      etatSaisie.dernierCurseur = "new";
      if (!etatSaisie.dossierId) return; // déjà sur un nouveau signalement : rien à réinitialiser
      if (renvoi || etatSaisie.modifie) return; // simple renvoi, ou saisie en cours à préserver
      await passerEnCreation();
    }),
  );
}
