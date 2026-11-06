/* PRISME — widget de saisie, module 23/34 : Couleur du formulaire selon une réponse.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* ---------- Couleur du formulaire selon une réponse ----------
   Repère [couleur] dans la description d'une colonne (qualification, question, ou toute autre colonne) :
   le formulaire prend la couleur du choix sélectionné, telle que définie dans Grist (couleur de fond du choix).
   [couleur Blocage=rouge, Intrusion=#e4794a] impose les couleurs (utile pour une case à cocher : [couleur Oui=rouge]).
   Plusieurs colonnes marquées : la qualification d'abord, puis les questions dans l'ordre du formulaire.
   Plusieurs valeurs cochées : la première dans l'ordre des choix de la colonne (placez les plus graves en tête). */
const COULEURS_NOMMEES = {
  rouge: "#ce0500",
  orange: "#e4794a",
  jaune: "#f5c400",
  vert: "#18753c",
  bleu: "#000091",
  violet: "#6a1b9a",
  rose: "#e18b9f",
  gris: "#777777",
  noir: "#161616",
  marron: "#8a4b00",
  brun: "#8a4b00",
  turquoise: "#009081",
};
function hexVersRvb(h) {
  const m = String(h || "")
    .trim()
    .match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const x = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16));
}
const versHex = (c) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
function teinteClaire(h, part) {
  // mélange avec du blanc : part = proportion de la couleur
  const c = hexVersRvb(h);
  return c ? versHex(c.map((v) => v * part + 255 * (1 - part))) : null;
}
function couleurNommee(t) {
  const s = sansGuillemets(t);
  if (COULEURS_NOMMEES[normaliser(s)]) return COULEURS_NOMMEES[normaliser(s)];
  const c = hexVersRvb(s);
  return c ? versHex(c) : null;
}
/* Règles d'un repère [couleur …], dans l'ordre où elles sont écrites (la première qui s'applique l'emporte) :
     Blocage=rouge          valeur exacte
     >50=rouge, >=10=orange comparaison (nombres ; pour une date : >0 = date renseignée, ou >2026-09-01, <01/10/2026)
     renseigné=rouge        n'importe quelle valeur (aussi : rempli, non vide, *)
     vide=gris              aucune valeur */
function nombreRegle(t) {
  const s = String(t).trim();
  let m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) return Date.UTC(+m[1], m[2] - 1, +m[3]) / 1000;
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) return Date.UTC(+m[3], m[2] - 1, +m[1]) / 1000;
  const n = parseFloat(s.replace(/\s/g, "").replace(",", "."));
  return isNaN(n) ? null : n;
}
function lireRegleCouleur(txt) {
  const m = String(txt || "").match(/\[\s*couleurs?\b([^\]]*)\]/i);
  if (!m) return null;
  const regles = [];
  // séparateur « , » ou « ; » — sauf la virgule décimale d'un seuil (« >2,5=rouge »)
  for (const p of m[1].split(/\s*;\s*|\s*,\s*(?!\d+\s*[=:])/)) {
    let k = p.lastIndexOf("=");
    if (k < 0) k = p.lastIndexOf(":");
    if (k <= 0) continue;
    const couleur = couleurNommee(p.slice(k + 1));
    if (!couleur) continue;
    const brut = sansGuillemets(p.slice(0, k)),
      cle = normaliser(brut);
    let c;
    if ((c = brut.match(/^(>=|<=|!=|≠|≥|≤|>|<)\s*(.+)$/)) && nombreRegle(c[2]) != null)
      regles.push({
        type: "cmp",
        op: { "≠": "!=", "≥": ">=", "≤": "<=" }[c[1]] || c[1],
        n: nombreRegle(c[2]),
        couleur,
      });
    else if (/^(renseigne|renseignee|rempli|remplie|non vide|n est pas vide|\*)$/.test(cle))
      regles.push({ type: "rempli", couleur });
    else if (/^(est )?vide$/.test(cle)) regles.push({ type: "vide", couleur });
    else regles.push({ type: "egal", valeur: cle, couleur });
  }
  return { regles };
}
function construireReglesCouleur(alertes) {
  etatSaisie.reglesCouleur = [];
  const vus = new Set();
  const ajouter = (def, genre) => {
    if (!def || vus.has(def.colId)) return;
    const r = lireRegleCouleur(def.description);
    if (!r) return;
    vus.add(def.colId);
    etatSaisie.reglesCouleur.push({ def, genre, regles: r.regles });
    const couleursGrist = Object.values((def.opts && def.opts.choiceOptions) || {}).some(
      (o) => o && hexVersRvb(o.fillColor),
    );
    if (!r.regles.length && !couleursGrist)
      alertes.push(
        `La colonne « ${def.libelle || def.colId} » porte le repère [couleur], mais ses choix n'ont pas de couleur dans Grist : ` +
          `donnez une couleur de fond à ses choix, ou indiquez-les dans le repère, par exemple [couleur Blocage=rouge, Tentative=orange].`,
      );
  };
  ajouter(etatSaisie.metaSig[col("Qualification")], "qualification");
  etatSaisie.defsQuestions.forEach((d) => ajouter(d, "question"));
  Object.values(etatSaisie.metaSig).forEach((d) => ajouter(d, "colonne"));
}
// Libellés des colonnes Référence (lus une fois, à la demande)
const cacheLibelles = new Map(),
  libellesDemandes = new Set();
function libelleRef(def, id) {
  if (def._labels && def._labels.has(id)) return def._labels.get(id);
  const m = cacheLibelles.get(def.colId);
  if (m) return m.get(id) || `n° ${id}`;
  if (!libellesDemandes.has(def.colId) && /^Ref(List)?:/.test(def.type || "")) {
    libellesDemandes.add(def.colId);
    optionsReference({ ...def })
      .then((opts) => {
        cacheLibelles.set(def.colId, new Map(opts.map((o) => [o.id, o.libelle])));
        enFile(async () => {
          majListeDossiers();
          majCouleur();
        });
      })
      .catch(() => {});
  }
  return `n° ${id}`;
}
// Valeur Grist -> textes affichés (une liste, pour les choix multiples)
function textesValeur(def, v) {
  if (v == null || v === "" || !lisible(v)) return [];
  const t = typeBase(def.type);
  if (t === "Bool") return [v ? "Oui" : "Non"];
  if (t === "Date" || t === "DateTime") {
    const s = secondes(v);
    return s == null ? [] : [String(s)];
  }
  if (Array.isArray(v)) {
    if (v[0] === "L") return v.slice(1).map((x) => (t === "RefList" ? libelleRef(def, x) : String(x)));
    if (v[0] === "R") return v[2] ? [libelleRef(def, v[2])] : [];
    return [];
  }
  if (t === "Ref") return v ? [libelleRef(def, v)] : [];
  return [String(v)];
}
function valeursEnCours(r) {
  if (r.genre === "qualification") return listeQualif(lireQualificationInitiale()).filter(Boolean);
  if (r.def.colId === col("Date_faits") && !$("bloc-date-faits").hidden) {
    const s = lireDateFaits();
    return s == null ? [] : [String(s)];
  }
  const ref = etatSaisie.derniere || etatSaisie.initiale;
  if (r.genre === "question" && !r.def.formule) {
    const bloc = document.querySelector(`[data-champ="q-${r.def.colId}"]`);
    if (!bloc || bloc.hidden) return [];
    return textesValeur(r.def, lireUnChamp("q", r.def));
  }
  return textesValeur(r.def, ref ? ref[r.def.colId] : null);
}
function couleurDe(r, textes) {
  const ordre = (r.def.opts && r.def.opts.choices) || [];
  const rang = (v) => {
    const i = ordre.indexOf(v);
    return i < 0 ? 1e9 : i;
  };
  const tries = [...textes].sort((a, b) => rang(a) - rang(b));
  const res = (fond, v) => (hexVersRvb(fond) ? { fond: versHex(hexVersRvb(fond)), valeur: v, def: r.def } : null);
  if (r.regles.length) {
    if (!textes.length) {
      const g = r.regles.find((x) => x.type === "vide");
      return g ? res(g.couleur, null) : null;
    }
    for (const g of r.regles)
      for (const v of tries) {
        let ok = false;
        if (g.type === "egal") ok = normaliser(v) === g.valeur;
        else if (g.type === "rempli") ok = true;
        else if (g.type === "cmp") {
          const n = parseFloat(String(v).replace(",", "."));
          ok =
            !isNaN(n) &&
            (g.op === ">"
              ? n > g.n
              : g.op === ">="
                ? n >= g.n
                : g.op === "<"
                  ? n < g.n
                  : g.op === "<="
                    ? n <= g.n
                    : n !== g.n);
        }
        if (ok) return res(g.couleur, v);
      }
    return null;
  }
  for (const v of tries) {
    const c = res((((r.def.opts && r.def.opts.choiceOptions) || {})[v] || {}).fillColor, v);
    if (c) return c;
  }
  return null;
}
// Valeur montrée dans l'étiquette de couleur (date lisible, nombre à la française)
function valeurLisible(def, v) {
  if (v == null) return "(vide)";
  const t = typeBase(def.type);
  if (t === "Date" || t === "DateTime") return dateFr(Number(v), { ...def, type: def.type || "Date" });
  if ((t === "Numeric" || t === "Int") && !isNaN(parseFloat(v))) return parseFloat(v).toLocaleString("fr-FR");
  return v;
}
function couleurLigne(l) {
  if (!etatSaisie.reglesCouleur.length) return null;
  const der = derniereDe(l);
  for (const r of etatSaisie.reglesCouleur) {
    const c = couleurDe(r, textesValeur(r.def, der[r.def.colId]));
    if (c) return c;
  }
  return null;
}
const bandeCouleur = (l) => {
  const c = couleurLigne(l);
  return c ? ` style="box-shadow: inset 4px 0 0 ${c.fond}"` : "";
};
function majCouleur() {
  let c = null;
  for (const r of etatSaisie.reglesCouleur) {
    c = couleurDe(r, valeursEnCours(r));
    if (c) break;
  }
  const b = document.body,
    lg = $("legende-teinte");
  b.classList.toggle("teinte", !!c);
  if (c) {
    b.style.setProperty("--teinte", c.fond);
    b.style.setProperty("--fond", teinteClaire(c.fond, 0.09));
    b.style.setProperty("--teinte-moyenne", teinteClaire(c.fond, 0.22));
    lg.textContent = `${c.def.libelle || c.def.colId} : ${valeurLisible(c.def, c.valeur)}`;
  } else ["--teinte", "--fond", "--teinte-moyenne"].forEach((p) => b.style.removeProperty(p));
  lg.hidden = !c;
}
