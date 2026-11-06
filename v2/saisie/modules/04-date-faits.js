/* PRISME — widget de saisie, module 04/34 : Date des faits : champ, lecture, contrôle.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* Définit, Utilise : calculés d'après le code (outils de relecture), à refaire après une modification.
   Définit : valeurLocale, faitsAvecHeure, initialiserDateFaits, lireDateFaits, dateFaitsFuture, secondes,
     cacheFormateurs, formateur, formaterMoment, dateFr.
   Utilise :
     05 etat : etatSaisie.
   Modifie etatSaisie : dateFaitsTouchee. */
/* ---------- Date des faits ---------- */
function valeurLocale(date, avecHeure) {
  // Date -> valeur d'un champ date / datetime-local, à l'heure de Paris
  return Outils.dates.valeurChamp(date, avecHeure);
}
const faitsAvecHeure = () => $("date-faits").type === "datetime-local";
function initialiserDateFaits(valeur) {
  etatSaisie.dateFaitsTouchee = false;
  const secondesFaits = secondes(valeur);
  if (secondesFaits == null) {
    $("date-faits").value = valeurLocale(new Date(), faitsAvecHeure());
    return;
  }
  // colonne Date : minuit UTC ; colonne DateTime : instant exact
  $("date-faits").value = faitsAvecHeure()
    ? valeurLocale(new Date(secondesFaits * 1000), true)
    : new Date(secondesFaits * 1000).toISOString().slice(0, 10);
}
function lireDateFaits() {
  // secondes au format Grist, ou null
  const valeurChamp = $("date-faits").value;
  if (!valeurChamp) return null;
  return faitsAvecHeure()
    ? Outils.dates.depuisChamp(valeurChamp) / 1000
    : Date.parse(valeurChamp + "T00:00:00Z") / 1000;
}
function dateFaitsFuture() {
  const valeurChamp = $("date-faits").value;
  if (!valeurChamp) return false;
  return valeurChamp.slice(0, 10) > valeurLocale(new Date(), false);
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
