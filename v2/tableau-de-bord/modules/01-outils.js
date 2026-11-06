/* PRISME — tableau de bord, module 01/15 : Outils : textes riches, infobulles.
   Publie sur tableauDeBord : segs, svgRich, norm, nf, fmtNum, EMPTY, rich, plain, TIP_SEP, SERIES, MAX_SERIES.
   tableauDeBord et l'ordre des modules : voir tableau-de-bord/tableau.js. */

TableauDeBord.modules["outils"] = function (tableauDeBord) {
  const { esc } = Outils;
  // fonctions de ce module utilisées ailleurs : disponibles dès maintenant (déclarations remontées)
  Object.assign(tableauDeBord, { segs, svgRich });
  // =============================================================================
  // Outils
  // =============================================================================

  const norm = (s) =>
    String(s ?? "")
      .replace(/\*/g, "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim();
  const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
  const fmtNum = (v) => (v === null || v === undefined || isNaN(v) ? "–" : nf.format(v));
  const EMPTY = "(vide)";
  // Texte entre astérisques (**texte** ou *texte*) affiché en gras
  function dateTokens(s) {
    if (!/\{(aujourd'?hui|hier|heure)\}/i.test(s)) return s;
    // à l'heure de Paris
    const p = (n) => String(n).padStart(2, "0"),
      d = Outils.dates.parties(Date.now()),
      y = Outils.dates.parties(Date.now() - 864e5);
    return s
      .replace(/\{aujourd'?hui\}/gi, `${p(d.jour)}/${p(d.mois)}`)
      .replace(/\{hier\}/gi, `${p(y.jour)}/${p(y.mois)}`)
      .replace(/\{heure\}/gi, `${d.heures} h ${p(d.minutes)}`);
  }
  function segs(s) {
    s = dateTokens(String(s ?? ""));
    const out = [],
      re = /\*\*([^*]+?)\*\*|\*([^*\n]+?)\*/g;
    let last = 0,
      m;
    while ((m = re.exec(s))) {
      if (m.index > last) out.push({ t: s.slice(last, m.index), b: false });
      out.push({ t: m[1] !== undefined ? m[1] : m[2], b: true });
      last = re.lastIndex;
    }
    if (last < s.length) out.push({ t: s.slice(last), b: false });
    return out;
  }
  const rich = (s) =>
    segs(s)
      .map((x) => (x.b ? `<b>${esc(x.t)}</b>` : esc(x.t)))
      .join("");
  const plain = (s) =>
    segs(s)
      .map((x) => x.t)
      .join("");
  function svgRich(s, max) {
    // libellé SVG tronqué, gras conservé
    let n = 0,
      out = "",
      cut = false;
    for (const x of segs(s)) {
      if (n >= max) {
        cut = true;
        break;
      }
      let t = x.t;
      if (n + t.length > max) {
        t = t.slice(0, max - n);
        cut = true;
      }
      n += t.length;
      out += x.b ? `<tspan font-weight="700">${esc(t)}</tspan>` : esc(t);
    }
    return out + (cut ? "…" : "");
  }
  const TIP_SEP = "\u0001";
  const SERIES = ["--s1", "--s2", "--s3", "--s4", "--s5", "--s6", "--s7"];
  const MAX_SERIES = 7;
  // constantes de ce module utilisées ailleurs
  Object.assign(tableauDeBord, { norm, nf, fmtNum, EMPTY, rich, plain, TIP_SEP, SERIES, MAX_SERIES });
};
