/* PRISME — widget de saisie, module 04/34 : Date des faits : champ, lecture, contrôle.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* ---------- Date des faits ---------- */
function valeurLocale(d, avecHeure) {
  // Date -> valeur d'un champ date / datetime-local, à l'heure de Paris
  return Outils.dates.valeurChamp(d, avecHeure);
}
const faitsAvecHeure = () => $("date-faits").type === "datetime-local";
function initialiserDateFaits(v) {
  etatSaisie.dateFaitsTouchee = false;
  const s = secondes(v);
  if (s == null) {
    $("date-faits").value = valeurLocale(new Date(), faitsAvecHeure());
    return;
  }
  // colonne Date : minuit UTC ; colonne DateTime : instant exact
  $("date-faits").value = faitsAvecHeure()
    ? valeurLocale(new Date(s * 1000), true)
    : new Date(s * 1000).toISOString().slice(0, 10);
}
function lireDateFaits() {
  // secondes au format Grist, ou null
  const v = $("date-faits").value;
  if (!v) return null;
  return faitsAvecHeure() ? Outils.dates.depuisChamp(v) / 1000 : Date.parse(v + "T00:00:00Z") / 1000;
}
function dateFaitsFuture() {
  const v = $("date-faits").value;
  if (!v) return false;
  return v.slice(0, 10) > valeurLocale(new Date(), false);
}

function secondes(v) {
  if (v == null || v === "") return null;
  if (Array.isArray(v)) return typeof v[1] === "number" ? v[1] : null;
  if (v instanceof Date) return isNaN(v) ? null : v.getTime() / 1000;
  if (typeof v === "number") return v;
  const t = Date.parse(v);
  return isNaN(t) ? null : t / 1000;
}
// Créer un Intl.DateTimeFormat est coûteux : on garde ceux déjà créés, par fuseau et par usage.
const cacheFormateurs = new Map();
function formateur(cle, options) {
  if (!cacheFormateurs.has(cle)) {
    let f;
    try {
      f = new Intl.DateTimeFormat("fr-FR", options);
    } catch (_) {
      const { timeZone, ...sansFuseau } = options;
      f = new Intl.DateTimeFormat("fr-FR", sansFuseau);
    }
    cacheFormateurs.set(cle, f);
  }
  return cacheFormateurs.get(cle);
}
function formaterMoment(sec, fmt, tz) {
  const d = new Date(sec * 1000);
  const opts = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "long",
    timeZone: tz,
  };
  const parts = formateur(`parts|${tz || ""}`, opts).formatToParts(d);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  const mois = (style) =>
    /MMM/.test(fmt) ? formateur(`mois-${style}|${tz || ""}`, { month: style, timeZone: tz }).format(d) : "";
  const H = +p.hour % 24,
    h12 = H % 12 || 12;
  const jetons = {
    YYYY: p.year,
    YY: p.year.slice(-2),
    MMMM: mois("long"),
    MMM: mois("short"),
    MM: p.month,
    M: String(+p.month),
    dddd: p.weekday,
    ddd: p.weekday.slice(0, 3) + ".",
    DD: p.day,
    Do: String(+p.day),
    D: String(+p.day),
    HH: String(H).padStart(2, "0"),
    H: String(H),
    hh: String(h12).padStart(2, "0"),
    h: String(h12),
    mm: p.minute,
    m: String(+p.minute),
    ss: p.second,
    s: String(+p.second),
    A: H < 12 ? "AM" : "PM",
    a: H < 12 ? "am" : "pm",
  };
  return fmt.replace(/\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|dddd|ddd|DD|Do|D|HH|H|hh|h|mm|m|ss|s|A|a/g, (j, litteral) =>
    litteral !== undefined ? litteral : jetons[j],
  );
}
function dateFr(v, meta) {
  const sec = secondes(v);
  if (sec == null) return "";
  const type = (meta && meta.type) || "DateTime";
  const o = (meta && meta.opts) || {};
  const avecHeure = type !== "Date";
  const tz = type === "Date" ? "UTC" : Outils.dates.FUSEAU; // date seule : jour de Grist (minuit UTC) ; date-heure : heure de Paris
  let fmt = o.dateFormat || "DD/MM/YYYY";
  if (avecHeure) fmt += " " + (o.timeFormat || "HH:mm");
  return formaterMoment(sec, fmt, tz);
}
