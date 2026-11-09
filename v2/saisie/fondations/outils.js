/* PRISME — widget de saisie, fondations/outils.js
   Outils de base : accès aux colonnes et aux valeurs Grist, comparaison de textes, messages de statut.
   Chargé par saisie/index.html dans l'ordre : fondations, composants, domaines, demarrage.js. Les fichiers partagent
   leurs noms (scripts classiques, sans import) : au chargement, un fichier ne fait que définir. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : sansAccents, normColonne, statut, lisible, refId, idDe, valeurLocale, secondes, cacheFormateurs,
     formateur, formaterMoment, dateFr, colonneDe, valeurLigne, idDossierDe, sansGuillemets, celluleRemplie,
     listeQualif, typeBase, egal, texteComparable, jourCle, jourCourt, pluriel.
   Utilise :
     fondations/etat : etatSaisie. */
const { esc, $ } = Outils;
// Texte en minuscules, sans accents : base des comparaisons de textes
const sansAccents = (texte) =>
  String(texte ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
// Nom de colonne comparable : lettres et chiffres, séparés par « _ » (« Département (code) » → « departement_code »)
const normColonne = (valeur) =>
  sansAccents(valeur)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
function statut(id, texte, type) {
  const zoneStatut = $(id);
  zoneStatut.textContent = texte;
  zoneStatut.className = "statut " + (type || "");
}
const lisible = (valeur) => valeur !== undefined && !(Array.isArray(valeur) && valeur[0] === "C");
// cellule non censurée par les règles d'accès
// keepEncoded transforme une Référence simple en ['R', tableId, rowId] : on en extrait l'identifiant numérique.
const refId = (valeur) =>
  Array.isArray(valeur) && valeur[0] === "R" ? valeur[2] : typeof valeur === "number" ? valeur : null;
const idDe = (resultat) => resultat && (resultat.id ?? (Array.isArray(resultat) ? resultat[0]?.id : null));
/* ---------- Date des faits ---------- */
function valeurLocale(date, avecHeure) {
  // Date -> valeur d'un champ date / datetime-local, à l'heure de Paris
  return Outils.dates.valeurChamp(date, avecHeure);
}
function secondes(valeur) {
  if (valeur == null || valeur === "") return null;
  if (Array.isArray(valeur)) return typeof valeur[1] === "number" ? valeur[1] : null;
  if (valeur instanceof Date) return isNaN(valeur) ? null : valeur.getTime() / 1000;
  if (typeof valeur === "number") return valeur;
  const millisecondes = Date.parse(valeur);
  return isNaN(millisecondes) ? null : millisecondes / 1000;
}
// Créer un Intl.DateTimeFormat est coûteux : on garde ceux déjà créés, par fuseau et par usage.
const cacheFormateurs = new Map();
function formateur(cle, options) {
  if (!cacheFormateurs.has(cle)) {
    let formateurCree;
    try {
      formateurCree = new Intl.DateTimeFormat("fr-FR", options);
    } catch (_) {
      const { timeZone, ...sansFuseau } = options;
      formateurCree = new Intl.DateTimeFormat("fr-FR", sansFuseau);
    }
    cacheFormateurs.set(cle, formateurCree);
  }
  return cacheFormateurs.get(cle);
}
function formaterMoment(sec, fmt, fuseau) {
  const date = new Date(sec * 1000);
  const options = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "long",
    timeZone: fuseau,
  };
  const parts = formateur(`parts|${fuseau || ""}`, options).formatToParts(date);
  const composantes = Object.fromEntries(parts.map((partie) => [partie.type, partie.value]));
  const mois = (style) =>
    /MMM/.test(fmt) ? formateur(`mois-${style}|${fuseau || ""}`, { month: style, timeZone: fuseau }).format(date) : "";
  const heures24 = +composantes.hour % 24,
    h12 = heures24 % 12 || 12;
  const jetons = {
    YYYY: composantes.year,
    YY: composantes.year.slice(-2),
    MMMM: mois("long"),
    MMM: mois("short"),
    MM: composantes.month,
    M: String(+composantes.month),
    dddd: composantes.weekday,
    ddd: composantes.weekday.slice(0, 3) + ".",
    DD: composantes.day,
    Do: String(+composantes.day),
    D: String(+composantes.day),
    HH: String(heures24).padStart(2, "0"),
    H: String(heures24),
    hh: String(h12).padStart(2, "0"),
    h: String(h12),
    mm: composantes.minute,
    m: String(+composantes.minute),
    ss: composantes.second,
    s: String(+composantes.second),
    A: heures24 < 12 ? "AM" : "PM",
    a: heures24 < 12 ? "am" : "pm",
  };
  return fmt.replace(/\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|dddd|ddd|DD|Do|D|HH|H|hh|h|mm|m|ss|s|A|a/g, (j, litteral) =>
    litteral !== undefined ? litteral : jetons[j],
  );
}
function dateFr(valeur, meta) {
  const sec = secondes(valeur);
  if (sec == null) return "";
  const type = (meta && meta.type) || "DateTime";
  const optionsColonne = (meta && meta.opts) || {};
  const avecHeure = type !== "Date";
  const fuseau = type === "Date" ? "UTC" : Outils.dates.FUSEAU; // date seule : jour de Grist (minuit UTC) ; date-heure : heure de Paris
  let fmt = optionsColonne.dateFormat || "DD/MM/YYYY";
  if (avecHeure) fmt += " " + (optionsColonne.timeFormat || "HH:mm");
  return formaterMoment(sec, fmt, fuseau);
}
// Colonne associée dans le panneau de Grist ; à défaut, pour un formulaire de l'administration, la colonne de même nom
const colonneDe = (cle) =>
  etatSaisie.mappings && typeof etatSaisie.mappings[cle] === "string"
    ? etatSaisie.mappings[cle]
    : etatSaisie.colsParDefaut[cle] || null;
const valeurLigne = (ligne, cle) => (ligne && colonneDe(cle) ? ligne[colonneDe(cle)] : null);
// Identifiant du dossier d'une ligne de signalement : la référence Dossier, sinon la ligne elle-même (première version)
const idDossierDe = (ligne) => refId(colonneDe("Dossier") && ligne[colonneDe("Dossier")]) || ligne.id;
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
const sansGuillemets = (valeur) =>
  String(valeur)
    .trim()
    .replace(/^["'«“‘\s]+|["'»”’\s]+$/g, "")
    .trim();
// Cellule renseignée (une référence vide arrive sous la forme ["R", table, 0])
const celluleRemplie = (valeur) =>
  valeur != null &&
  valeur !== "" &&
  valeur !== 0 &&
  valeur !== false &&
  !(
    Array.isArray(valeur) && (valeur[0] === "L" ? valeur.length <= 1 : valeur[0] === "R" ? !valeur[2] : !valeur.length)
  );
// Décode une valeur de qualification, qu'elle arrive encodée par Grist (["L", ...]), déjà sous
// forme de tableau, ou comme simple chaîne à choix unique.
function listeQualif(valeur) {
  if (Array.isArray(valeur)) return valeur[0] === "L" ? valeur.slice(1) : valeur;
  return valeur ? [valeur] : [];
}
const typeBase = (typeComplet) => (typeComplet || "Any").split(":")[0];
const egal = (valeurA, valeurB) => JSON.stringify(valeurA ?? null) === JSON.stringify(valeurB ?? null);
/* ---------- Questions conditionnelles ---------- */
// Valeur courante d'une colonne dont dépend une condition (questions, mais aussi description
// et qualification du formulaire principal).
// Texte comparable : sans accents ni majuscules, apostrophes et espaces multiples ramenés à une espace
const texteComparable = (texte) => sansAccents(texte).replace(/[’']/g, " ").replace(/\s+/g, " ").trim();
const jourCle = (jourEnSecondes) => new Date(jourEnSecondes * 1000).toISOString().slice(0, 10);
// colonne Date : minuit UTC
const jourCourt = (jourEnSecondes) =>
  new Date(jourEnSecondes * 1000).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  });
const pluriel = (nombre, singulier, formePlurielle) => `${nombre} ${nombre > 1 ? formePlurielle : singulier}`;
