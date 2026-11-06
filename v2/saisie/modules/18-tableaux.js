/* PRISME — widget de saisie, module 18/31 : Questions « tableau » : plusieurs lignes dans une même question.
   Chargé par saisie/index.html dans l'ordre des numéros ; les modules partagent leurs variables et fonctions
   (script classique, sans import) : un module n'appelle au chargement que ce que les modules précédents définissent. */
/* =========================================================
   Questions « tableau » : plusieurs lignes dans une même question (ex. une ligne par blessé)
   ---------------------------------------------------------
   - Dans la table des signalements, une colonne texte porte le repère [tableau NomDeTable] : elle
     conserve, pour chaque version, la liste des lignes au format JSON (sans les champs confidentiels).
   - Les champs de chaque ligne sont les colonnes de la table NomDeTable (type, choix, libellé et
     repères de description : *, [si …], [liste], [boutons], [positif], [min], [max], [confidentiel]).
     Sont ignorées : les colonnes formules, Dossier (référence vers les signalements), Ligne_id, Ordre.
   - Table historisée (colonne Version, référence vers la table des signalements) : chaque version du signalement
     écrit sa propre copie des lignes (Dossier, Version, Ligne_id, Ordre, Mouvement + les champs). Mouvement compare
     à la version précédente du dossier : Ajout, Modification, Inchangée, ou Retrait (ligne retirée, recopiée avec ses
     dernières valeurs). Une correction de version réécrit les lignes de cette version. Stock = colonne formule
     Etat_actuel (lignes de la version la plus récente, hors retraits) ; flux = Mouvement par Date_version.
   - Table sans colonne Version (ancienne) : réécrite pour le dossier à partir de sa dernière version, une ligne Grist
     par ligne saisie (Dossier, Ligne_id, Ordre + les champs) ; aucun historique.
   - Les champs [confidentiel] ne sont enregistrés que dans NomDeTable (protégeables par une règle
     d'accès de colonne), jamais dans la colonne JSON, l'historique ni la description.
   ========================================================= */
const tableaux = {}; // identifiant du champ → contrôleur
const RESERVES_TABLEAU = ["id", "manualSort", "Ligne_id", "Ordre", "Version", "Mouvement"];
const nouvelIdLigne = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const videSous = (v) => v == null || v === "" || (Array.isArray(v) && !v.length);
function lireTableauJson(v) {
  if (!v || typeof v !== "string") return [];
  try {
    const l = JSON.parse(v);
    return Array.isArray(l) ? l.filter((x) => x && typeof x === "object") : [];
  } catch (_) {
    return [];
  }
}
// Colonnes d'une table, dans l'ordre de Grist
async function colonnesDeTable(tid) {
  const [tables, cols] = await lireMeta();
  const tRef = tables.id[tables.tableId.indexOf(tid)];
  if (tRef == null) return null;
  const res = [];
  for (let i = 0; i < cols.id.length; i++) {
    if (cols.parentId[i] !== tRef) continue;
    let opts = {};
    try {
      opts = JSON.parse(cols.widgetOptions[i] || "{}");
    } catch (_) {}
    const visible = cols.visibleCol ? cols.visibleCol[i] : 0;
    res.push({
      colId: cols.colId[i],
      libelle: cols.label[i],
      type: cols.type[i],
      opts,
      description: (cols.description && cols.description[i]) || "",
      formule: !!(cols.isFormula && cols.isFormula[i] && cols.formula[i]),
      colAffichee: visible ? cols.colId[cols.id.indexOf(visible)] : null,
      pos: cols.parentPos ? cols.parentPos[i] : i,
    });
  }
  return res.sort((a, b) => a.pos - b.pos);
}
function evaluerConditionLigne(cond, sousDefs, valeurs) {
  const n = normaliser(cond.ref);
  const d =
    sousDefs.find((x) => x.colId === cond.ref) ||
    sousDefs.find((x) => normaliser(x.colId) === n || normaliser(x.libelle) === n);
  if (!d) return true; // colonne inconnue : le champ reste affiché
  const v = valeurs[d.colId];
  return evaluerCondition(Array.isArray(v) ? ["L", ...v] : v, cond);
}
// Rangement d'un champ dans la ligne : en tête (champs courts), sur sa propre ligne (choix multiples), ou en bas (textes)
function zoneSousChamp(d) {
  const t = typeBase(d.type),
    ch = (d.opts && d.opts.choices) || [];
  if (t === "ChoiceList" || t === "RefList") return "large";
  // choix unique en pastilles (plus de 5 options) : sur sa propre ligne, comme les choix multiples
  if (
    t === "Choice" &&
    ch.length &&
    d.forcer !== "liste" &&
    !(d.forcer === "boutons" || ch.length <= 5) &&
    pastillesPossibles(d)
  )
    return "large";
  if (["Choice", "Bool", "Numeric", "Int", "Date", "DateTime", "Ref"].includes(t)) return "tete";
  return "texte";
}
const pastillesPossibles = (d) => {
  const ch = (d.opts && d.opts.choices) || [];
  if (d.forcer === "liste") return false;
  if (d.forcer === "boutons") return true;
  if (S().pastilles === "toujours") return true; // toujours des pastilles, quel que soit le nombre de choix ([liste] pour un menu déroulant)
  return ch.length <= 8 && ch.join("").length <= 70; // au-delà : menu déroulant
};
function texteSousValeur(d, v) {
  if (videSous(v)) return "";
  const t = typeBase(d.type);
  if (t === "Bool") return v ? "Oui" : "Non";
  if (t === "Ref") return ((d._options || []).find((o) => o.id === +v) || {}).libelle || `n° ${v}`;
  if (t === "RefList")
    return v.map((x) => ((d._options || []).find((o) => o.id === +x) || {}).libelle || `n° ${x}`).join(", ");
  if (Array.isArray(v)) return v.join(", ");
  if (t === "Date" || t === "DateTime") return dateFr(v, d);
  if (typeof v === "number") return v.toLocaleString("fr-FR");
  return String(v);
}
// Synthèse : nombre de lignes, et répartition selon les colonnes à choix (hors confidentielles)
function syntheseTableau(sousDefs, lignes, court) {
  const n = lignes.length;
  if (!n) return "";
  const parts = [];
  for (const d of sousDefs
    .filter((x) => !x.confidentiel && ["Choice", "ChoiceList", "Bool"].includes(typeBase(x.type)))
    .slice(0, 3)) {
    const compte = new Map();
    for (const l of lignes) {
      if (d.condition && !evaluerConditionLigne(d.condition, sousDefs, l.valeurs || l)) continue;
      const v = (l.valeurs || l)[d.colId];
      for (const x of Array.isArray(v) ? v : videSous(v) ? [] : [typeBase(d.type) === "Bool" ? (v ? "Oui" : "Non") : v])
        compte.set(x, (compte.get(x) || 0) + 1);
    }
    if (!compte.size) continue;
    const ordre = (d.opts && d.opts.choices) || [];
    const rang = (x) => {
      const i = ordre.indexOf(x);
      return i < 0 ? 1e9 : i;
    };
    parts.push(
      `${d.libelle || d.colId} : ${[...compte]
        .sort((a, b) => rang(a[0]) - rang(b[0]))
        .map(([x, c]) => `${x} ${c}`)
        .join(", ")}`,
    );
  }
  return court ? `${n}${parts.length ? ` (${parts.join(" ; ")})` : ""}` : [`Total : ${n}`, ...parts].join(" · ");
}

/* ---------- Description automatique d'une question « tableau » ----------
   Pour chaque colonne de la table (réglage ⚙ « Format question par question ») :
   dans la ligne de chaque élément : « Libellé : valeur », « Valeur seule », ou rien (« Par défaut » suit le
   format de la question) ; et, en option, un décompte en tête (somme pour un nombre).
   Les colonnes [confidentiel] ne sont jamais incluses. */
const TYPES_DECOMPTE = ["Choice", "ChoiceList", "Bool", "Ref", "RefList"];
const decomptable = (d) => TYPES_DECOMPTE.includes(typeBase(d.type)) || ["Numeric", "Int"].includes(typeBase(d.type));
// Réglage d'une colonne : dans la ligne de chaque élément (format), et décompte en tête (ou somme pour un nombre)
function modeSous(def, d, o = etatSaisie.optionsAuto) {
  const m = ((o.formatsTableau || {})[def.colId] || {})[d.colId];
  const anciens = {
    detail: { ligne: "defaut", decompte: false },
    decompte: { ligne: "exclure", decompte: true },
    les2: { ligne: "defaut", decompte: true },
    exclure: { ligne: "exclure", decompte: false },
  }; // réglages précédents
  const r = typeof m === "string" ? anciens[m] : m && typeof m === "object" ? m : null;
  const ligne = r && ["defaut", "libelle", "valeur", "exclure"].includes(r.ligne) ? r.ligne : "defaut";
  if (!r && estQualifSous(d)) return { ligne, decompte: true }; // qualification : décompte en tête sauf réglage contraire
  return { ligne, decompte: !!(r && r.decompte && decomptable(d)) };
}
// Champ « qualification » d'une ligne de tableau (ex. qualification de chaque site) : choix unique nommé Qualification…
const estQualifSous = (d) =>
  !!d && typeBase(d.type) === "Choice" && (/qualif/i.test(d.colId) || /qualif/i.test(d.libelle || ""));
// Valeurs d'une ligne de tableau mises en forme selon les réglages de la description automatique
function valeursLigneTableau(def, l, o = etatSaisie.optionsAuto) {
  const tous = def._sousDefs || [];
  const vis = (d) => !d.condition || evaluerConditionLigne(d.condition, tous, l);
  const formatGeneral = (d) => {
    const f = (o.formatsType || {})[famille(d)];
    return f && f !== "defaut" ? f : o.format;
  };
  const libelleDe = (d) => {
    const m = modeSous(def, d, o).ligne;
    return m === "libelle" || (m === "defaut" && formatGeneral(d) !== "valeur");
  };
  return tous
    .filter((d) => !d.confidentiel && !d.auto && modeSous(def, d, o).ligne !== "exclure" && vis(d))
    .map((d) => {
      const txt = texteSousValeur(d, l[d.colId]),
        avecLibelle = libelleDe(d);
      // oui / non sans libellé : le libellé seul quand c'est « Oui », rien sinon
      if (!avecLibelle && typeBase(d.type) === "Bool") return l[d.colId] ? d.libelle || d.colId : "";
      return txt ? (avecLibelle ? `${d.libelle || d.colId} : ${txt}` : txt) : "";
    })
    .filter(Boolean);
}
// Texte proposé pour un champ [auto] d'une ligne
const texteAutoLigne = (def, l, o = etatSaisie.optionsAuto) => valeursLigneTableau(def, l, o).join(" — ");
/* Évolution depuis la version précédente du dossier (même jour) : chaque décompte en tête reçoit l'écart entre
   parenthèses (« RAS 19 (−1) ») ; la qualification d'une ligne qui a changé est écrite « Blocage → ==RAS== »
   (== : surlignage dans Word, soulignement dans Tchap). Les lignes sont retrouvées d'une version à l'autre par leur
   identifiant, sinon par le premier champ texte (nom du site…). */
function texteTableauDescription(def, lignesBrutes, o = etatSaisie.optionsAuto, avantBrutes = null) {
  const tous = def._sousDefs || [],
    sous = tous.filter((d) => !d.confidentiel);
  const vis = (l, d) => !d.condition || evaluerConditionLigne(d.condition, tous, l);
  const nonVide = (l) => tous.some((d) => vis(l, d) && !videSous(l[d.colId]));
  const lignes = lignesBrutes.map((l) => l.valeurs || l).filter(nonVide);
  if (!lignes.length) return "";
  const avant = Array.isArray(avantBrutes) ? avantBrutes.map((l) => l.valeurs || l).filter(nonVide) : null;
  const dQ = sous.find(estQualifSous);
  const ecart = (v, a) => {
    const e = v - a;
    return e ? ` (${e > 0 ? "+" : "−"}${Math.abs(e).toLocaleString("fr-FR")})` : "";
  };
  const parts = [];
  for (const d of sous.filter((d) => modeSous(def, d, o).decompte)) {
    const t = typeBase(d.type),
      lib = d.libelle || d.colId;
    if (t === "Numeric" || t === "Int") {
      const somme = (ls) => ls.filter((l) => vis(l, d) && typeof l[d.colId] === "number").map((l) => l[d.colId]);
      const vals = somme(lignes),
        va = avant ? somme(avant) : [];
      if (vals.length || va.length) {
        const s = vals.reduce((a, b) => a + b, 0),
          sa = va.reduce((a, b) => a + b, 0);
        parts.push(`${lib} : ${s.toLocaleString("fr-FR")}${avant ? ecart(s, sa) : ""}`);
      }
      continue;
    }
    const compter = (ls) => {
      const compte = new Map();
      for (const l of ls) {
        if (!vis(l, d) || videSous(l[d.colId])) continue;
        const v = l[d.colId];
        const items = Array.isArray(v)
          ? v.map((x) => (t === "RefList" ? texteSousValeur({ ...d, type: "Ref" }, x) : x))
          : [texteSousValeur(d, v)];
        for (const x of items) compte.set(x, (compte.get(x) || 0) + 1);
      }
      return compte;
    };
    const compte = compter(lignes),
      compteAvant = avant ? compter(avant) : new Map();
    if (!compte.size && !compteAvant.size) continue;
    const ordre = (d.opts && d.opts.choices) || [];
    const rang = (x) => {
      const i = ordre.indexOf(x);
      return i < 0 ? 1e9 : i;
    };
    const cles = [...new Set([...compte.keys(), ...compteAvant.keys()])].sort((a, b) => rang(a) - rang(b));
    parts.push(
      `${lib} : ${cles.map((x) => `${x} ${compte.get(x) || 0}${avant ? ecart(compte.get(x) || 0, compteAvant.get(x) || 0) : ""}`).join(", ")}`,
    );
  }
  // tableau avec une qualification : « 22 — Qualification : Blocage 1 (+1), RAS 19 (−1) » (pas de parenthèses imbriquées)
  const tete = dQ
    ? `${lignes.length}${parts.length ? ` — ${parts.join(" ; ")}` : ""}`
    : `${lignes.length}${parts.length ? ` (${parts.join(" ; ")})` : ""}`;
  const det = sous.filter((d) => !d.auto && modeSous(def, d, o).ligne !== "exclure");
  // Champ [auto] utilisé : la ligne reprend son texte (éventuellement retouché par l'agent)
  const autos = sous.filter((d) => d.auto && modeSous(def, d, o).ligne !== "exclure");
  if (!det.length && !autos.length) return tete;
  // qualification précédente d'une ligne, quand elle a changé
  const dNom = sous.find((d) => typeBase(d.type) === "Text" && !d.auto);
  const nomDe = (l) => (dNom ? normaliser(l[dNom.colId]) : "");
  const passage = (l) => {
    if (!avant || !dQ) return null;
    const a =
      avant.find((x) => l._id && x._id === l._id) || (nomDe(l) ? avant.find((x) => nomDe(x) === nomDe(l)) : null);
    if (!a || String(a[dQ.colId] ?? "") === String(l[dQ.colId] ?? "")) return null;
    return texteSousValeur(dQ, a[dQ.colId]) || "Sans qualification";
  };
  // La flèche prend la place de la qualification dans le texte de la ligne : la nouvelle (texte automatique à jour)
  // ou l'ancienne (texte retouché par l'agent, resté sur l'ancienne qualification) ; la plus longue est cherchée d'abord
  // (« Blocage partiel » avant « Blocage »). Introuvable : la flèche est ajoutée en fin de ligne.
  const avecFleche = (t, l) => {
    const a = passage(l);
    if (!a) return t;
    const q = texteSousValeur(dQ, l[dQ.colId]) || "Sans qualification",
      fleche = `${a} → ==${q}==`;
    for (const v of [a, q].sort((x, y) => y.length - x.length)) {
      const re = new RegExp(`(^|[\\s—:(,;])${v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "u");
      if (re.test(t)) return t.replace(re, (m, avant) => `${avant}${fleche}`);
    }
    return `${t} — ${fleche}`;
  };
  const lignesTxt = lignes
    .map((l, k) => {
      const repris = autos
        .filter((d) => vis(l, d))
        .map((d) => String(l[d.colId] ?? "").trim())
        .filter(Boolean)
        .join(" — ");
      const vals = repris ? [repris] : valeursLigneTableau(def, l, o);
      return vals.length ? `${k + 1}. ${avecFleche(vals.join(" — "), l)}` : "";
    })
    .filter(Boolean);
  return [tete, ...lignesTxt].join("\n");
}
// Version précédente du dossier, si elle est du même jour (un nouveau dossier chaque jour) : base de comparaison
function versionDuJour() {
  if (!etatSaisie.dossierId || !etatSaisie.derniere) return false;
  const s = secondes(val(etatSaisie.derniere, "Date"));
  if (s == null) return true;
  const jour = (d) => d.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });
  return jour(new Date(s * 1000)) === jour(new Date());
}
const lignesPrecedentes = (def) =>
  def.tableau && versionDuJour() ? lireTableauJson(etatSaisie.derniere[def.colId]) : null;
function lignesExemple(def) {
  // deux lignes fictives pour l'exemple des réglages
  return [0, 1].map((k) => {
    const l = {};
    for (const d of def._sousDefs || []) {
      const t = typeBase(d.type),
        ch = (d.opts && d.opts.choices) || [];
      if (t === "Choice") l[d.colId] = ch[k % Math.max(ch.length, 1)] || "Oui";
      else if (t === "ChoiceList") l[d.colId] = ch.length ? [ch[k % ch.length]] : null;
      else if (t === "Bool") l[d.colId] = k === 0;
      else if (t === "Numeric" || t === "Int") l[d.colId] = k + 1;
      else if (t === "Date" || t === "DateTime") l[d.colId] = Math.floor(Date.now() / 86400000) * 86400;
      else if (t === "Ref" || t === "RefList") l[d.colId] = null;
      else l[d.colId] = k === 0 ? "texte saisi" : "autre texte";
    }
    return l;
  });
}

class Tableau {
  constructor(def, prefix, conteneur, surChangement) {
    Object.assign(this, {
      def,
      prefix,
      el: conteneur,
      surChangement,
      id: `${prefix}-${def.colId}`,
      lignes: [],
      sousDefs: [],
      pret: false,
      erreur: "",
      confLisible: true,
      montrerErreurs: false,
    });
    this.ecouter();
    this.promesse = this.preparer();
  }
  async preparer() {
    const tid = this.def.tableau.table;
    let cols = null;
    try {
      cols = await colonnesDeTable(tid);
    } catch (_) {}
    if (!cols) {
      this.erreur = `Table « ${tid} » introuvable : vérifiez le repère [tableau ${tid}] dans la description de la colonne « ${this.def.libelle} ».`;
      this.dessiner();
      return;
    }
    this.table = tid;
    this.colDossier =
      (
        cols.find((c) => c.colId === "Dossier") ||
        cols.find((c) => c.type === `Ref:${etatSaisie.tableId}` && c.colId !== "Version") ||
        {}
      ).colId || null;
    this.colLigne = cols.some((c) => c.colId === "Ligne_id") ? "Ligne_id" : null;
    this.colOrdre = cols.some((c) => c.colId === "Ordre") ? "Ordre" : null;
    // historique : une copie des lignes par version (colonne Version vers la table des signalements)
    this.colVersion = cols.some((c) => c.colId === "Version" && c.type === `Ref:${etatSaisie.tableId}`)
      ? "Version"
      : null;
    this.colMouvement = this.colVersion && cols.some((c) => c.colId === "Mouvement") ? "Mouvement" : null;
    this.sousDefs = cols
      .filter(
        (c) =>
          !c.formule &&
          !RESERVES_TABLEAU.includes(c.colId) &&
          c.colId !== this.colDossier &&
          !c.colId.startsWith("gristHelper"),
      )
      .map(avecRegles)
      .filter((d) => !d.masque); // [masqué] : colonne absente du formulaire (sa valeur dans la table est conservée)
    // [ordre N] : les champs numérotés d'abord, dans cet ordre, puis les autres dans l'ordre des colonnes de Grist
    this.ordonne = this.sousDefs.some((d) => d.ordre != null);
    if (this.ordonne)
      this.sousDefs = this.sousDefs
        .map((d, i) => [d, i])
        .sort((a, b) => (a[0].ordre ?? 1e9) - (b[0].ordre ?? 1e9) || a[1] - b[1])
        .map(([d]) => d);
    for (const d of this.sousDefs)
      if (["Ref", "RefList"].includes(typeBase(d.type))) {
        try {
          d._options = await optionsReference({ ...d });
        } catch (_) {
          d._options = [];
        }
      }
    // tableau des sites : colonne du site (référence au référentiel des sites, ou identifiant texte), nom hors
    // référentiel, qualification du site ; historique d'autres questions (anciens formulaires) pour la reprise
    const st = this.def.tableau && this.def.tableau.sites,
      a = (c) => (c && cols.some((x) => x.colId === c) ? c : null);
    /* colonne renommée par Grist d'après son libellé (Site_libre → Site_hors_referentiel, Qualification →
 Qualification_du_site : tables créées par les versions 2.14.0 à 2.14.2) : retrouvée par son type et son nom */
    const parNom = (re, ty) =>
      (
        cols.find(
          (c) =>
            !RESERVES_TABLEAU.includes(c.colId) &&
            ty.test(c.type || "") &&
            re.test(normColonne(`${c.colId} ${c.libelle || ""}`)),
        ) || {}
      ).colId || null;
    const sSite = st && (a(st.site) || parNom(/(^|_)site/, /^Ref:/)),
      sLibre = st && st.libre ? a(st.libre) || parNom(/libre|hors_referentiel/, /^Text/) : null; // « — » dans l'administration : pas de nom libre
    const sQualif = st && (a(st.qualif) || parNom(/qualif/, /^Choice/));
    this.sites =
      st && (sSite || sLibre)
        ? {
            site: sSite,
            libre: sLibre,
            qualif: sQualif,
            avecRas: st.avecRas !== false, // reprise du dernier état des sites : "auto" (ancien réglage true), "bouton" (à la demande), "non" (par défaut)
            reprise: st.reprise === true || st.reprise === "auto" ? "auto" : st.reprise === "bouton" ? "bouton" : "non",
            historique: Array.isArray(st.historique) ? st.historique.filter((h) => h && h.colonne) : [],
            alias: st.alias || "Sites_correspondances",
          }
        : null;
    this.alias = new Map();
    this.aliasParSite = new Map();
    // colonnes qui désignent un site du référentiel (table des sites reliée aux établissements) : sites de l'établissement
    // du formulaire seulement, champ de recherche (nom, mots-clés, commune) au lieu d'un menu de tous les sites
    for (const d of this.sousDefs) if (typeBase(d.type) === "Ref") await preparerRefSite(d);
    if (this.sites && this.sites.site) {
      // tableau des sites : une autre colonne de site (créée en double) est écartée du formulaire
      const enDouble = this.sousDefs.filter((d) => d._siteEtab && d.colId !== this.sites.site);
      if (enDouble.length) {
        this.sousDefs = this.sousDefs.filter((d) => !enDouble.includes(d));
        this.doublons = enDouble.map((d) =>
          d.libelle && d.libelle !== d.colId ? `${d.libelle} (${d.colId})` : d.colId,
        );
      }
    }
    if (this.sites) {
      // correspondances validées : libellé saisi (par établissement) → site du référentiel
      try {
        const m = await metaColonnes(this.sites.alias);
        if (m && m.Libelle && m.Site) {
          const t = await Donnees.lire(this.sites.alias);
          t.id.forEach((id, i) => {
            if (/cart/i.test(String((t.Statut || [])[i] || ""))) return;
            const s = refId(t.Site[i]);
            if (!s) return;
            this.alias.set(`${refId((t.Etablissement || [])[i]) || 0}|${normaliser(t.Libelle[i])}`, s);
            if (!this.aliasParSite.has(s)) this.aliasParSite.set(s, []);
            this.aliasParSite.get(s).push(String(t.Libelle[i] ?? ""));
          });
        }
      } catch (_) {
        /* sans correspondances */
      }
    }
    const manque = [
      !this.colDossier && "Dossier (référence vers la table des signalements)",
      !this.colLigne && "Ligne_id (texte)",
    ].filter(Boolean);
    this.avertissement = manque.length
      ? `Table « ${tid} » : ajoutez la colonne ${manque.join(" et la colonne ")} pour qu'elle soit tenue à jour.`
      : "";
    if (this.doublons)
      this.avertissement = [
        this.avertissement,
        `Colonne${this.doublons.length > 1 ? "s" : ""} « ${this.doublons.join(" », « ")} » de la table « ${tid} » écartée${this.doublons.length > 1 ? "s" : ""} du formulaire : elle désigne aussi un site, en double avec « ${(this.sousDefs.find((d) => d.colId === this.sites.site) || {}).libelle || this.sites.site} » (voir l'administration des formulaires).`,
      ]
        .filter(Boolean)
        .join(" ");
    this.autos = this.sousDefs.filter((d) => d.auto && typeBase(d.type) === "Text");
    // site du référentiel et nom libre réunis en un seul champ (le nom libre seulement si le tableau des sites a sa colonne)
    this.combo = !!(
      this.sites &&
      this.sites.site &&
      this.sites.libre &&
      this.sousDefs.some((d) => d.colId === this.sites.site && d._siteEtab)
    );
    this.def._sousDefs = this.sousDefs;
    this.pret = true;
    this.dessiner();
    if (this.sites) setTimeout(reprendreSitesAuto, 0);
  }
  // ----- nombre de lignes piloté par une colonne nombre : lignes= du repère, sinon colonne de la condition [si …]
  colonneNombre() {
    const ref = (this.def.tableau && this.def.tableau.lignes) || (this.def.condition && this.def.condition.ref);
    if (!ref) return null;
    const defs =
      this.prefix === "q" ? etatSaisie.defsQuestions : this.prefix === "vd" ? etatSaisie.defsDep : etatSaisie.defsAca;
    const c = resoudreColonne(ref, defs);
    return c && ["Numeric", "Int"].includes(typeBase(c.def.type)) ? c : null;
  }
  nombreAttendu() {
    const c = this.colonneNombre();
    if (!c) return null;
    let v = null;
    if (c.genre === "question" && !c.def.formule) {
      const bloc = document.querySelector(`[data-champ="${this.prefix}-${c.def.colId}"]`);
      v = bloc && !bloc.hidden ? lireUnChamp(this.prefix, c.def) : null;
    } else {
      const r = etatSaisie.derniere || etatSaisie.initiale;
      v = r ? r[c.def.colId] : null;
    }
    return typeof v === "number" && v > 0 ? Math.min(200, Math.floor(v)) : 0;
  }
  // Ajoute des lignes vides jusqu'au nombre indiqué ; en cas de baisse, ne retire que des lignes vides
  ajuster() {
    if (!this.pret) return;
    const n = this.nombreAttendu();
    if (n == null || n === this.dernierN) return;
    this.dernierN = n;
    let change = false;
    while (this.lignes.length < n) {
      this.lignes.push({ _id: nouvelIdLigne(), valeurs: {} });
      change = true;
    }
    while (this.lignes.length > n && this.ligneVide(this.lignes[this.lignes.length - 1])) {
      this.lignes.pop();
      change = true;
    }
    if (change) this.dessiner();
    else this.majLignes();
  }
  // ----- état
  visible(l, d) {
    return !d.condition || evaluerConditionLigne(d.condition, this.sousDefs, l.valeurs);
  }
  ligneVide(l) {
    return this.sousDefs.every((d) => !this.visible(l, d) || videSous(l.valeurs[d.colId]));
  }
  lignesValides() {
    return this.lignes.filter((l) => !this.ligneVide(l));
  }
  valeur() {
    // JSON enregistré dans la colonne de la version (sans champs confidentiels ni champs masqués)
    const l = this.lignesValides().map((x) => {
      const o = { _id: x._id };
      for (const d of this.sousDefs)
        if (!d.confidentiel && this.visible(x, d) && !videSous(x.valeurs[d.colId])) o[d.colId] = x.valeurs[d.colId];
      return o;
    });
    return l.length ? JSON.stringify(l) : "";
  }
  async charger(json, dossier) {
    await this.promesse;
    const conf = await this.lireConfidentiels(dossier);
    this.lignes = lireTableauJson(json).map((o) => {
      const { _id, ...valeurs } = o;
      const id = _id || nouvelIdLigne();
      return {
        _id: id,
        valeurs: { ...valeurs, ...(conf.get(id) || {}) },
        ...(this.sites && dossier ? { _fixe: true } : {}),
      };
    });
    this.lignes.forEach((l) => this.initAuto(l));
    this.montrerErreurs = false;
    this.confModifie = false;
    this.dernierN = undefined;
    this.supprimes = [];
    this.dessiner();
  }
  async lireConfidentiels(dossier) {
    const res = new Map();
    const confs = this.sousDefs.filter((d) => d.confidentiel);
    this.confLisible = true;
    if (!dossier || !confs.length || !this.colDossier || !this.colLigne) return res;
    try {
      const t = await Donnees.lire(this.table);
      if (confs.some((d) => !(d.colId in t))) this.confLisible = false;
      // table historisée : les lignes de la version la plus récente qui en a (sinon les lignes sans version)
      const duDossier = t.id
        .map((_, i) => i)
        .filter((i) => refId(t[this.colDossier][i]) === dossier || t[this.colDossier][i] === dossier);
      const vDe = (i) => (this.colVersion && t[this.colVersion] ? refId(t[this.colVersion][i]) || 0 : 0);
      const vMax = Math.max(0, ...duDossier.map(vDe));
      t.id.forEach((id, i) => {
        if (refId(t[this.colDossier][i]) !== dossier && t[this.colDossier][i] !== dossier) return;
        if (vDe(i) !== vMax || (this.colMouvement && t[this.colMouvement] && t[this.colMouvement][i] === "Retrait"))
          return;
        const v = {};
        for (const d of confs) {
          const x = t[d.colId] ? t[d.colId][i] : undefined;
          if (x === undefined || (Array.isArray(x) && x[0] === "C")) {
            this.confLisible = false;
            continue;
          }
          v[d.colId] = this.depuisGrist(d, x);
        }
        res.set(t[this.colLigne][i], v);
      });
    } catch (_) {
      this.confLisible = false;
    }
    return res;
  }
  depuisGrist(d, x) {
    const t = typeBase(d.type);
    if (Array.isArray(x) && x[0] === "L") return x.slice(1);
    if (t === "Ref") return x || null;
    return x === "" ? null : x;
  }
  versGrist(d, v) {
    const t = typeBase(d.type);
    if (videSous(v)) return t === "Bool" ? false : t === "Ref" ? 0 : null;
    if (t === "ChoiceList" || t === "RefList") return ["L", ...v];
    if (t === "Ref") return +v || 0;
    return v;
  }
  // ----- contrôles
  verifier() {
    // messages des lignes incomplètes (sans rien marquer)
    const res = [];
    this.lignes.forEach((l, k) => {
      if (this.ligneVide(l)) return;
      const pb = this.sousDefs
        .filter((d) => this.visible(l, d) && this.erreurChamp(l, d))
        .map((d) => d.libelle || d.colId);
      if (pb.length) res.push(`ligne ${k + 1} : ${pb.join(", ")}`);
    });
    return res;
  }
  erreurChamp(l, d) {
    const v = l.valeurs[d.colId];
    // site obligatoire : un nom hors référentiel (colonne du nom libre) le renseigne aussi
    const libre = d._siteEtab && this.colLibre(d),
      parLibre = libre && !videSous(l.valeurs[libre]);
    if (d.obligatoire && videSous(v) && !parLibre && !(d.confidentiel && !this.confLisible)) return "À préciser";
    if (typeof v === "number" && horsBornes(d, v)) return `Valeur ${horsBornes(d, v)} attendue`;
    return "";
  }
  marquer() {
    this.montrerErreurs = true;
    this.majLignes();
    const el = this.el.querySelector(".ligne-rep.incomplete");
    if (el) {
      el.scrollIntoView({ block: "center" });
      const c = el.querySelector("[aria-invalid] input, [aria-invalid], input, select, textarea");
      if (c) c.focus();
    }
  }
  // ----- rendu
  champHtml(d, k, l) {
    const nom = `${this.id}-${k}-${d.colId}`,
      v = l.valeurs[d.colId],
      t = typeBase(d.type);
    const ch = (d.opts && d.opts.choices) || [],
      couleurs = (d.opts && d.opts.choiceOptions) || {};
    const coul = (x) => {
      const c = couleurs[x] || {};
      return c.fillColor ? `--c:${c.textColor || "#161616"};--c-bg:${c.fillColor}` : "--c:#fff;--c-bg:var(--bleu)";
    };
    const titre =
      `<span class="etiq" id="${nom}-etiq">${esc(d.libelle || d.colId)}${d.obligatoire ? ' <span class="req">*</span>' : ""}` +
      `${d.confidentiel ? ' <span class="confid" title="Donnée confidentielle : enregistrée uniquement dans la table ' + esc(this.table) + '">confidentiel</span>' : ""}` +
      `${d.auto && typeBase(d.type) === "Text" ? ' <span class="badge-auto" title="Rempli à partir des autres champs de la ligne ; vous pouvez le modifier">auto</span>' : ""}</span>`;
    let ctl;
    const masque =
      d.confidentiel && !this.confLisible
        ? ` placeholder="Valeur masquée par vos droits : laissez vide pour la conserver"`
        : "";
    if (
      (t === "Choice" && ch.length && d.forcer !== "liste" && (d.forcer === "boutons" || ch.length <= 5)) ||
      t === "Bool"
    ) {
      const opts =
        t === "Bool"
          ? [
              ["true", "Oui"],
              ["false", "Non"],
            ]
          : ch.map((x) => [x, x]);
      const actuel = t === "Bool" ? (v == null ? null : String(!!v)) : v;
      ctl = `<span class="seg" role="radiogroup" aria-labelledby="${nom}-etiq">${opts
        .map(
          ([val, lib]) =>
            `<label style="${t === "Bool" ? "--c:#fff;--c-bg:var(--bleu)" : coul(val)}"><input type="radio" name="${nom}" value="${esc(val)}"${val === actuel ? " checked" : ""}><span>${esc(lib)}</span></label>`,
        )
        .join("")}</span>`;
    } else if (t === "Choice" && ch.length && pastillesPossibles(d)) {
      // choix unique au-delà de 5 options : pastilles (un clic sur la pastille choisie la décoche) ; [liste] pour un menu déroulant
      ctl = `<div class="puces unique" role="radiogroup" aria-labelledby="${nom}-etiq">${ch.map((x) => `<label class="puce${x === v ? " on" : ""}" style="${coul(x)}"><input type="radio" name="${nom}" value="${esc(x)}"${x === v ? " checked" : ""}>${esc(x)}</label>`).join("")}</div>`;
    } else if (t === "Choice" && ch.length) {
      ctl = `<select aria-labelledby="${nom}-etiq"><option value="">Choisir…</option>${ch.map((x) => `<option${x === v ? " selected" : ""}>${esc(x)}</option>`).join("")}</select>`;
    } else if (t === "ChoiceList" && ch.length && pastillesPossibles(d)) {
      const sel = Array.isArray(v) ? v : [];
      ctl = `<div class="puces" role="group" aria-labelledby="${nom}-etiq">${ch.map((x) => `<label class="puce${sel.includes(x) ? " on" : ""}" style="${coul(x)}"><input type="checkbox" value="${esc(x)}"${sel.includes(x) ? " checked" : ""}>${esc(x)}</label>`).join("")}</div>`;
    } else if ((t === "ChoiceList" && ch.length) || t === "RefList") {
      const sel = Array.isArray(v) ? v.map(String) : [];
      const opts = t === "RefList" ? (d._options || []).map((o) => [String(o.id), o.libelle]) : ch.map((x) => [x, x]);
      const resume = opts
        .filter(([val]) => sel.includes(val))
        .map(([, lib]) => lib)
        .join(", ");
      ctl =
        `<details class="multi"><summary aria-labelledby="${nom}-etiq"><span class="resume">${esc(resume) || "Choisir…"}</span></summary>` +
        `<div class="multi-liste">${opts.map(([val, lib]) => `<label><input type="checkbox" value="${esc(val)}"${sel.includes(val) ? " checked" : ""}> ${esc(lib)}</label>`).join("")}</div></details>`;
    } else if (t === "Numeric" || t === "Int") {
      ctl = `<input type="number" class="nb" step="${t === "Int" ? 1 : "any"}"${d.min != null ? ` min="${d.min}"` : ""}${d.max != null ? ` max="${d.max}"` : ""} value="${v ?? ""}" aria-labelledby="${nom}-etiq">`;
    } else if (t === "Date" || t === "DateTime") {
      const s = secondes(v);
      const txt =
        s == null
          ? ""
          : t === "Date"
            ? new Date(s * 1000).toISOString().slice(0, 10)
            : valeurLocale(new Date(s * 1000), true);
      ctl = `<input type="${t === "Date" ? "date" : "datetime-local"}" value="${txt}" aria-labelledby="${nom}-etiq">`;
    } else if (t === "Ref" && d._siteEtab) {
      // ancien nom resté en texte dans une colonne référence (référence non résolue) : affiché, à rattacher
      const libre = this.colLibre(d),
        id = refId(v),
        ancien = !id && typeof v === "string" && v.trim() ? v.trim() : "";
      const lib = id ? this.libelleSite(d, id) : ancien || String((libre && l.valeurs[libre]) ?? "");
      // site du dossier relié au référentiel : il ne se remplace pas (sauf « Corriger le site ») ; un nom libre ou ancien se corrige
      const fige =
        l._fixe && id && !l._deverrouille
          ? ` disabled title="Site du dossier : il ne se remplace pas ; passez-le en RAS s'il est revenu à la normale, ou « Corriger le site » en cas d'erreur"`
          : "";
      ctl = `<div class="site-combo"><input type="text" class="site-txt" value="${esc(lib)}"${id ? ` data-id="${id}"` : ""} autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-labelledby="${nom}-etiq" placeholder="${libre ? "Nom du site ou mot-clé (un nom absent de la liste est accepté)" : "Nom du site, mot-clé ou commune"}"${fige}>
        <span class="site-etat">${!id && lib ? (ancien ? "ancien nom, absent du référentiel : choisissez le site dans la liste" : "hors référentiel") : ""}</span><ul class="suggestions site-sugg" role="listbox" hidden></ul></div>`;
    } else if (t === "Ref") {
      let opts = d._options || [];
      if (d._siteEtab) {
        const e = etablissementDuFormulaire();
        if (e) opts = sitesDeLEtablissement(d, e, opts, +v);
      }
      const libSite = (o) =>
        d._siteComp && d._siteComp.get(o.id) && nomEtabId(d._siteComp.get(o.id))
          ? `${o.libelle} — ${nomEtabId(d._siteComp.get(o.id))}`
          : o.libelle;
      ctl = `<select aria-labelledby="${nom}-etiq"><option value="">${d._siteEtab && !opts.length ? "Aucun site de cet établissement au référentiel" : "Choisir…"}</option>${opts.map((o) => `<option value="${o.id}"${+v === o.id ? " selected" : ""}>${esc(libSite(o))}</option>`).join("")}</select>`;
    } else if (d.court) {
      ctl = `<input type="text" value="${esc(v ?? "")}" aria-labelledby="${nom}-etiq"${masque}>`;
    } else {
      ctl = `<textarea rows="2" aria-labelledby="${nom}-etiq"${masque}>${esc(v ?? "")}</textarea>`;
    }
    // tableau des sites : le site d'une ligne du dossier (ou reprise) ne change pas ; seul son état change
    if (
      this.sites &&
      l._fixe &&
      !l._deverrouille &&
      [this.sites.site, this.sites.libre].includes(d.colId) &&
      !videSous(v) &&
      !(d._siteEtab && t === "Ref")
    )
      ctl = ctl.replace(
        /^<(select|input|textarea)/,
        '<$1 disabled title="Site du dossier : il ne se remplace pas ; passez-le en RAS s\'il est revenu à la normale"',
      );
    const regen =
      d.auto && typeBase(d.type) === "Text"
        ? `<button type="button" class="lien-texte regen" data-action="regenerer" data-sous="${esc(d.colId)}"${(l._touche || {})[d.colId] ? "" : " hidden"}>↻ Revenir au texte automatique</button>`
        : "";
    const aide = (d.aide ? `<span class="aide-sous">${esc(d.aide)}</span>` : "") + regen;
    return `<div class="sous-champ zone-${zoneSousChamp(d)}${d._siteEtab ? " zone-site" : ""}${d.condition ? " cond-ligne" : ""}" data-sous="${esc(d.colId)}">${titre}${ctl}${aide}<span class="msg-ligne" hidden></span></div>`;
  }
  // tableau des sites : un site du dossier (ou repris du dernier état connu) ne se retire pas, il passe en RAS
  actionsLigne(l, k) {
    const fixe = this.sites && l._fixe;
    const corriger =
      fixe && !l._deverrouille && this.sites.site && refId(l.valeurs[this.sites.site])
        ? `<button type="button" class="icone" data-action="corriger-site" title="Corriger le site de cette ligne (erreur de saisie)" aria-label="Corriger le site de la ligne ${k + 1}">✎</button>`
        : "";
    // site repris dans un nouveau signalement : peut être laissé de côté (pas d'information nouvelle), son dernier état reste connu
    const retirer =
      fixe && l._repris && !etatSaisie.dossierId
        ? `<button type="button" class="icone" data-action="retirer-repris" title="Ne pas faire figurer ce site dans ce signalement : il ne sera plus proposé ensuite (seuls les sites du dernier dossier sont repris)" aria-label="Retirer le site de la ligne ${k + 1} de ce signalement">✕</button>`
        : "";
    // site d'un dossier saisi à tort : supprimé de toutes les versions du dossier à l'enregistrement (2.50)
    const supprimer =
      fixe && etatSaisie.dossierId && !l._repris
        ? `<button type="button" class="icone" data-action="supprimer-site" title="Supprimer ce site du dossier (saisi à tort) : il disparaît de toutes les étapes du dossier" aria-label="Supprimer le site de la ligne ${k + 1} du dossier">🗑</button>`
        : "";
    return `<span class="actions-ligne"><button type="button" class="icone" data-action="dupliquer" title="Dupliquer cette ligne" aria-label="Dupliquer la ligne ${k + 1}">⧉</button>${corriger}${
      fixe
        ? `<button type="button" class="icone icone-texte" data-action="ras-site" title="Site revenu à la normale : il reste dans le dossier, en ${esc(this.valeurRas() || "RAS")}" aria-label="Passer le site de la ligne ${k + 1} en ${esc(this.valeurRas() || "RAS")}">${esc(this.valeurRas() || "RAS")}</button>${retirer}${supprimer}`
        : `<button type="button" class="icone" data-action="supprimer" title="Supprimer cette ligne" aria-label="Supprimer la ligne ${k + 1}">✕</button>`
    }</span>`;
  }
  valeurRas() {
    const d = this.sites && this.sites.qualif && this.sousDefs.find((x) => x.colId === this.sites.qualif);
    if (!d) return null;
    const ch = (d.opts && d.opts.choices) || [],
      r = retourNormale();
    return ch.find((x) => r.has(String(x).trim().toUpperCase())) || [...r][0] || "RAS";
  }
  ligneHtml(l, k) {
    const actions = `${this.actionsLigne(l, k)}`;
    // Ordre imposé par [ordre N] : les champs se suivent dans cet ordre (les champs courts côte à côte)
    if (this.ordonne)
      return `<div class="ligne-rep ordonnee${l._repris ? " reprise" : ""}" data-k="${k}">${l._repris ? `<div class="repris" aria-live="polite">${this.texteRepris(l)}</div>` : ""}<div class="tete-ligne"><span class="num" aria-label="Ligne ${k + 1}">${k + 1}</span>
      <div class="champs-ordonnes">${this.sousDefs.map((d) => this.champHtml(d, k, l)).join("")}</div>${actions}</div></div>`;
    const parZone = (z) =>
      this.sousDefs
        .filter((d) => zoneSousChamp(d) === z)
        .map((d) => this.champHtml(d, k, l))
        .join("");
    const textes = parZone("texte");
    return `<div class="ligne-rep${l._repris ? " reprise" : ""}" data-k="${k}">${l._repris ? `<div class="repris" aria-live="polite">${this.texteRepris(l)}</div>` : ""}
      <div class="tete-ligne"><span class="num" aria-label="Ligne ${k + 1}">${k + 1}</span>${parZone("tete")}
        ${this.actionsLigne(l, k)}</div>
      ${parZone("large")}${textes ? `<div class="textes-ligne">${textes}</div>` : ""}</div>`;
  }
  // site repris du dernier état connu : mention, et confirmation ou modification par l'agent
  texteRepris(l) {
    const r = l._repris,
      quand = r.quand
        ? Outils.dates
            .dateHeure(r.quand, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
            .replace(" ", " ")
        : "";
    const etat =
      r.etat === "confirme"
        ? `<span class="repris-ok">confirmé</span>`
        : r.etat === "modifie"
          ? `<span class="repris-ok">modifié</span>`
          : r.etat === "normal"
            ? `<span class="repris-ok">revenu à la normale</span>`
            : `<button type="button" class="lien-texte" data-action="confirmer-site">Confirmer cet état</button>`;
    return `Dernier état : <strong>${esc(r.qualif || "sans qualification")}</strong>${quand ? ` (${esc(quand)})` : ""} · ${etat}`;
  }
  dessiner() {
    if (this.erreur) {
      this.el.innerHTML = `<p class="bandeau">${esc(this.erreur)}</p>`;
      return;
    }
    if (!this.pret) {
      this.el.innerHTML = `<p class="note">Chargement…</p>`;
      return;
    }
    if (!this.sousDefs.length) {
      this.el.innerHTML = `<p class="bandeau">La table « ${esc(this.table)} » n'a aucune colonne à saisir (colonnes non formules autres que Dossier, Ligne_id et Ordre).</p>`;
      return;
    }
    this.el.innerHTML =
      (this.avertissement && !etatSaisie.modeEtab ? `<p class="bandeau">${esc(this.avertissement)}</p>` : "") +
      (this.noteAuto && this.lignes.some((l) => l._repris) ? `<p class="note">${esc(this.noteAuto)}</p>` : "") +
      (this.retires && this.retires.length
        ? `<p class="note retires">${this.retires.length} site${this.retires.length > 1 ? "s" : ""} laissé${this.retires.length > 1 ? "s" : ""} de côté pour ce signalement (${this.retires.map((x) => esc(this.nomLigne(x.l))).join(", ")})  : ${this.retires.length > 1 ? "ils ne seront plus proposés" : "il ne sera plus proposé"} ensuite. <button type="button" class="lien-texte" data-action="remettre-retires">Remettre</button></p>`
        : "") +
      (this.supprimes && this.supprimes.length
        ? `<p class="note retires supprimes">${this.supprimes.length > 1 ? `${this.supprimes.length} sites seront supprimés` : "1 site sera supprimé"} du dossier à l'enregistrement, dans toutes ses étapes (${this.supprimes.map((x) => esc(this.nomLigne(x.l))).join(", ")}). <button type="button" class="lien-texte" data-action="annuler-supprimes">Annuler la suppression</button></p>`
        : "") +
      (this.offreReprise &&
      etatSaisie.etabCourant &&
      this.offreReprise.etab === etatSaisie.etabCourant.id &&
      !this.lignes.some((l) => l._repris)
        ? `<p class="note offre-reprise">${this.offreReprise.n} site${this.offreReprise.n > 1 ? "s" : ""} dans le dernier signalement de cet établissement. <button type="button" class="secondaire petit" data-action="reprendre-sites">Reprendre leur dernier état</button></p>`
        : "") +
      `<div class="lignes-rep">${this.lignes.map((l, k) => this.ligneHtml(l, k)).join("") || `<p class="vide-tableau">Aucune ligne pour l'instant.</p>`}</div>
      <div class="pied-tableau"><span class="ajout-lignes"><button type="button" class="secondaire petit" data-action="ajouter">+ Ajouter</button>
        <input type="number" class="qte" min="1" max="50" value="1" aria-label="Nombre de lignes à ajouter"><span class="note-qte">ligne(s)</span></span>
        <span class="synthese" aria-live="polite"></span><span class="ecart" hidden></span></div>`;
    this.majLignes();
  }
  majLignes() {
    this.el.querySelectorAll(".ligne-rep").forEach((div) => {
      const l = this.lignes[+div.dataset.k];
      let incomplete = false;
      div.querySelectorAll(".sous-champ").forEach((sc) => {
        const d = this.sousDefs.find((x) => x.colId === sc.dataset.sous);
        sc.hidden = !this.visible(l, d) || (this.combo && d.colId === this.sites.libre); // nom libre : saisi dans le champ du site
        const msg = this.montrerErreurs && !sc.hidden && !this.ligneVide(l) ? this.erreurChamp(l, d) : "";
        const m = sc.querySelector(".msg-ligne");
        m.textContent = msg;
        m.hidden = !msg;
        sc.classList.toggle("en-erreur", !!msg);
        if (msg) incomplete = true;
      });
      div.classList.toggle("incomplete", incomplete);
      div.querySelectorAll(".regen").forEach((b) => {
        b.hidden = !(l._touche || {})[b.dataset.sous];
      });
      const rp = div.querySelector(".repris");
      if (rp && l._repris) rp.innerHTML = this.texteRepris(l);
    });
    const s = this.el.querySelector(".synthese");
    if (s) s.textContent = syntheseTableau(this.sousDefs, this.lignesValides(), false);
    const e = this.el.querySelector(".ecart"),
      n = this.nombreAttendu();
    if (e) {
      const k = this.lignesValides().length,
        nom = n != null ? this.colonneNombre().def.libelle || this.colonneNombre().def.colId : "";
      e.hidden = !n || k === n;
      e.textContent =
        k > n
          ? `${k} lignes remplies pour ${n} indiqué(s) dans « ${nom} » : vérifiez le nombre.`
          : `${k} ligne(s) remplie(s) sur ${n}`;
      e.classList.toggle("alerte", k > n);
    }
  }
  lireControle(sc, d) {
    const t = typeBase(d.type);
    if (t === "Bool") {
      const r = sc.querySelector("input:checked");
      return r ? r.value === "true" : null;
    }
    if (sc.querySelector(".seg, .puces.unique")) {
      const r = sc.querySelector("input:checked");
      return r ? r.value : null;
    }
    if (t === "ChoiceList" || t === "RefList") {
      const l = [...sc.querySelectorAll('input[type="checkbox"]:checked')].map((c) =>
        t === "RefList" ? +c.value : c.value,
      );
      return l.length ? l : null;
    }
    const c = sc.querySelector("select, input, textarea");
    if (!c || c.value === "") return null;
    if (t === "Numeric" || t === "Int") return t === "Int" ? parseInt(c.value, 10) : parseFloat(c.value);
    if (t === "Date") return Date.parse(c.value + "T00:00:00Z") / 1000;
    if (t === "DateTime") return Outils.dates.depuisChamp(c.value) / 1000;
    if (t === "Ref") return +c.value;
    return t === "Any" || t === "Text" ? c.value : c.value;
  }
  /* Champs [auto] : un texte enregistré différent du texte calculé a été retouché par l'agent et n'est plus remplacé
     (jusqu'au clic sur « Revenir au texte automatique », ou s'il est vidé). */
  initAuto(l) {
    l._touche = {};
    for (const a of this.autos || []) {
      const v = l.valeurs[a.colId];
      l._touche[a.colId] = !videSous(v) && String(v).trim() !== texteAutoLigne(this.def, l.valeurs).trim();
    }
  }
  majAutos(l, div, forcer) {
    for (const a of this.autos || []) {
      if (!l._touche) l._touche = {};
      if (forcer === a.colId) l._touche[a.colId] = false;
      if (l._touche[a.colId]) continue;
      const t = texteAutoLigne(this.def, l.valeurs);
      l.valeurs[a.colId] = t || null;
      const c =
        div &&
        div.querySelector(`[data-sous="${CSS.escape(a.colId)}"] textarea, [data-sous="${CSS.escape(a.colId)}"] input`);
      if (c && c !== document.activeElement) c.value = t;
      else if (c && forcer) c.value = t;
    }
  }
  changement(sc) {
    const div = sc.closest(".ligne-rep"),
      l = this.lignes[+div.dataset.k];
    const d = this.sousDefs.find((x) => x.colId === sc.dataset.sous);
    if (sc.querySelector(".site-combo")) this.lireSite(sc, l, d);
    else l.valeurs[d.colId] = this.lireControle(sc, d);
    if (l._repris && l._repris.etat !== "modifie") l._repris.etat = "modifie";
    if (d.auto) {
      if (!l._touche) l._touche = {};
      l._touche[d.colId] =
        !videSous(l.valeurs[d.colId]) &&
        String(l.valeurs[d.colId]).trim() !== texteAutoLigne(this.def, l.valeurs).trim();
    } else this.majAutos(l, div);
    if (d.confidentiel) this.confModifie = true;
    sc.querySelectorAll(".puce").forEach((p) => p.classList.toggle("on", p.querySelector("input").checked));
    const r = sc.querySelector(".multi .resume");
    if (r)
      r.textContent =
        [...sc.querySelectorAll(".multi-liste input:checked")].map((c) => c.parentNode.textContent.trim()).join(", ") ||
        "Choisir…";
    this.majLignes();
    this.signaler();
  }
  signaler() {
    if (this.surChangement) this.surChangement();
    if (this.prefix === "q") {
      appliquerConditions("q", etatSaisie.defsQuestions);
      majDescriptionAuto();
      majApercuAuto();
      if (this.sites) majQualifDeduite();
    }
  }
  // ----- champ du site : site du référentiel (nom, mots-clés, correspondances validées) ou nom libre
  colLibre(d) {
    return this.combo && this.sites && d.colId === this.sites.site ? this.sites.libre : null;
  }
  libelleSite(d, id) {
    const o = (d._options || []).find((x) => x.id === id);
    return o ? o.libelle : "";
  }
  // nom du site d'une ligne (site du référentiel, ancien nom ou nom libre)
  nomLigne(l) {
    const s = this.sites || {},
      v = s.site ? l.valeurs[s.site] : null,
      d = s.site && this.sousDefs.find((x) => x.colId === s.site),
      id = refId(v);
    return (
      (id && d ? this.libelleSite(d, id) : typeof v === "string" ? v.trim() : "") ||
      String((s.libre && l.valeurs[s.libre]) ?? "").trim() ||
      "site sans nom"
    );
  }
  sitesProposables(d) {
    const e = etablissementDuFormulaire();
    return d._siteEtab && e ? sitesDeLEtablissement(d, e, d._options || [], 0) : d._options || [];
  }
  // site désigné exactement par un texte : son nom, un de ses mots-clés, ou un libellé validé pour l'établissement
  siteExact(d, txt) {
    const n = normaliser(txt);
    if (!n) return 0;
    const opts = this.sitesProposables(d),
      e = etablissementDuFormulaire();
    const parNom = opts.find((o) => normaliser(o.libelle) === n);
    if (parNom) return parNom.id;
    const parMot = opts.find((o) =>
      String((d._motsSite && d._motsSite.get(o.id)) || "")
        .split(/\s*[|,;]\s*/)
        .some((x) => normaliser(x) === n),
    );
    if (parMot) return parMot.id;
    const a = this.alias.get(`${e || 0}|${n}`);
    return a && opts.some((o) => o.id === a) ? a : 0;
  }
  suggestionsSite(d, q) {
    const mots = normaliser(q).split(" ").filter(Boolean),
      res = [];
    for (const o of this.sitesProposables(d)) {
      const nomN = normaliser(o.libelle),
        cles = [
          ...String((d._motsSite && d._motsSite.get(o.id)) || "").split(/\s*[|,;]\s*/),
          ...(this.aliasParSite.get(o.id) || []),
        ].filter((x) => x && x.trim());
      const commune = (d._communeSite && d._communeSite.get(o.id)) || "";
      const tout = `${nomN} ${cles.map(normaliser).join(" ")} ${normaliser(commune)}`;
      if (!mots.every((m) => tout.includes(m))) continue;
      const parNom = mots.every((m) => nomN.includes(m));
      // mots-clés et autres appellations du site (sans doublon ni le nom lui-même), ceux qui répondent à la saisie d'abord
      const vus = new Set([nomN]),
        autres = [];
      cles
        .map((x) => x.trim())
        .forEach((x) => {
          const n = normaliser(x);
          if (n && !vus.has(n)) {
            vus.add(n);
            autres.push({ x, trouve: !parNom && mots.length > 0 && mots.some((m) => n.includes(m)) });
          }
        });
      autres.sort((a, b) => b.trouve - a.trouve);
      res.push({
        o,
        parNom,
        commune,
        comp: d._siteComp && d._siteComp.get(o.id) ? nomEtabId(d._siteComp.get(o.id)) : "",
        autres,
      });
    }
    return res.sort((a, b) => b.parNom - a.parNom).slice(0, 30);
  }
  montrerSites(inp) {
    const sc = inp.closest(".sous-champ"),
      d = this.sousDefs.find((x) => x.colId === sc.dataset.sous),
      ul = sc.querySelector(".site-sugg");
    const q = inp.value.trim(),
      res = this.suggestionsSite(d, q);
    const avecLibre = !!this.colLibre(d),
      libre = avecLibre && q && !res.some((r) => normaliser(r.o.libelle) === normaliser(q)) && !this.siteExact(d, q);
    // même présentation que la recherche d'établissement : nom, puis commune, composante, mot-clé retrouvé
    const MAX_AUTRES = 8;
    ul.innerHTML =
      res
        .map(
          (r) =>
            `<li role="option" data-id="${r.o.id}"><div class="nom">${esc(r.o.libelle)}</div>${r.commune || r.comp ? `<div class="meta">${esc([r.commune, r.comp].filter(Boolean).join(" · "))}</div>` : ""}${
              r.autres.length
                ? `<div class="meta autres-noms" title="${esc(r.autres.map((a) => a.x).join(", "))}">Aussi : ${r.autres
                    .slice(0, MAX_AUTRES)
                    .map((a) => (a.trouve ? `<strong>${esc(a.x)}</strong>` : esc(a.x)))
                    .join(", ")}${r.autres.length > MAX_AUTRES ? `, … (+${r.autres.length - MAX_AUTRES})` : ""}</div>`
                : ""
            }</li>`,
        )
        .join("") +
      (libre
        ? `<li role="option" data-libre="1"><div class="nom">« ${esc(q)} »</div><div class="meta">site hors référentiel</div></li>`
        : "") +
      (!res.length && !libre
        ? `<li class="etat" aria-disabled="true">${!etablissementDuFormulaire() ? "Choisissez d'abord l'établissement." : q ? "Aucun site de cet établissement ne correspond." : "Aucun site de cet établissement au référentiel."}${avecLibre ? "" : " Complétez le référentiel des sites."}</li>`
        : "");
    ul.hidden = !ul.children.length;
    inp.setAttribute("aria-expanded", String(!ul.hidden));
  }
  choisirSite(li) {
    const sc = li.closest(".sous-champ"),
      inp = sc.querySelector(".site-txt"),
      d = this.sousDefs.find((x) => x.colId === sc.dataset.sous);
    if (li.dataset.id) {
      inp.value = this.libelleSite(d, +li.dataset.id);
      inp.dataset.id = li.dataset.id;
    } else delete inp.dataset.id;
    sc.querySelector(".site-sugg").hidden = true;
    inp.setAttribute("aria-expanded", "false");
    this.changement(sc);
  }
  lireSite(sc, l, d) {
    const inp = sc.querySelector(".site-txt"),
      txt = inp.value.trim();
    let id = inp.dataset.id && this.libelleSite(d, +inp.dataset.id) === txt ? +inp.dataset.id : this.siteExact(d, txt);
    const libre = this.colLibre(d);
    l.valeurs[d.colId] = id || null;
    if (libre) l.valeurs[libre] = id ? null : txt || null;
    const et = sc.querySelector(".site-etat");
    if (et)
      et.textContent =
        txt && !id ? (libre ? "hors référentiel" : "absent du référentiel : choisissez un site dans la liste") : "";
  }
  // ligne d'une question d'un formulaire précédent (historique), vue avec les colonnes du tableau actuel
  vueHistorique(h, o) {
    const s = this.sites,
      v = {};
    for (const [k, x] of Object.entries(o)) if (k !== "_id" && this.sousDefs.some((d) => d.colId === k)) v[k] = x;
    if (h.libre && s.libre) v[s.libre] = o[h.libre];
    if (h.site && s.site) v[s.site] = o[h.site];
    if (h.qualif && s.qualif) v[s.qualif] = o[h.qualif];
    return v;
  }
  // clé d'un site : son identifiant au référentiel, sinon le libellé saisi (rattaché par les correspondances validées)
  cleSite(etab, v) {
    const s = this.sites,
      id = s.site ? refId(v[s.site]) || (typeof v[s.site] === "number" ? v[s.site] : 0) : 0;
    if (id) return `s${id}`;
    // nom libre, sinon ancien nom resté en texte dans la colonne référence du site
    const lib =
      (s.libre ? String(v[s.libre] ?? "").trim() : "") ||
      (s.site && typeof v[s.site] === "string" ? v[s.site].trim() : "");
    if (!lib) return null;
    const a = this.alias.get(`${etab || 0}|${normaliser(lib)}`) || this.alias.get(`0|${normaliser(lib)}`);
    return a ? `s${a}` : `t${normaliser(lib)}`;
  }
  ecouter() {
    const el = this.el;
    // un bouton déjà choisi se désélectionne d'un second clic (champ facultatif)
    el.addEventListener("pointerdown", (ev) => {
      const lab = ev.target.closest(".seg label, .puces.unique label");
      if (lab) lab.querySelector("input").dataset.etait = String(lab.querySelector("input").checked);
    });
    el.addEventListener("click", (ev) => {
      const inp = ev.target.closest('.seg input[type="radio"], .puces.unique input[type="radio"]');
      if (inp && inp.dataset.etait === "true") {
        inp.checked = false;
        inp.dataset.etait = "false";
        this.changement(inp.closest(".sous-champ"));
        return;
      }
      const b = ev.target.closest("button[data-action]");
      if (!b) return;
      const action = b.dataset.action;
      if (action === "reprendre-sites") {
        // reprise à la demande (reprise automatique désactivée) : les lignes déjà saisies sont gardées après les sites repris
        const deja = this.lignes.filter((l) => !this.ligneVide(l)),
          e = this.offreReprise.etab;
        const n = reprendreEtatSites(this, e),
          cles = new Set(this.lignes.map((l) => this.cleSite(e, l.valeurs)).filter(Boolean));
        this.lignes.push(
          ...deja.filter((l) => {
            const k = this.cleSite(e, l.valeurs);
            return !k || !cles.has(k);
          }),
        );
        this.offreReprise = null;
        this.noteAuto = n
          ? `${n} site${n > 1 ? "s" : ""} du dernier signalement de cet établissement, dans leur dernier état : confirmez ou modifiez ceux qui ne sont pas revenus à la normale, ajoutez les nouveaux.`
          : "";
        this.dessiner();
        this.signaler();
        etatSaisie.qualifTouchee = false;
        majQualifDeduite();
        etatSaisie.modifie = true;
        return;
      }
      if (action === "ajouter") {
        const n = Math.max(1, Math.min(50, parseInt(el.querySelector(".qte").value, 10) || 1));
        for (let i = 0; i < n; i++) this.lignes.push({ _id: nouvelIdLigne(), valeurs: {} });
        this.dessiner();
        this.signaler();
        const lignes = el.querySelectorAll(".ligne-rep");
        const premiere = lignes[lignes.length - n];
        if (premiere) {
          const c = premiere.querySelector("input, select, textarea, summary");
          if (c) c.focus();
        }
        return;
      }
      if (action === "annuler-supprimes") {
        for (const x of (this.supprimes || []).sort((a, b) => a.k - b.k))
          this.lignes.splice(Math.min(x.k, this.lignes.length), 0, x.l);
        this.supprimes = [];
        this.dessiner();
        this.signaler();
        return;
      }
      if (action === "remettre-retires") {
        // sites laissés de côté : remis à leur place d'origine
        for (const x of (this.retires || []).sort((a, b) => a.k - b.k))
          this.lignes.splice(Math.min(x.k, this.lignes.length), 0, x.l);
        this.retires = [];
        this.dessiner();
        this.signaler();
        return;
      }
      const k = +b.closest(".ligne-rep").dataset.k,
        l = this.lignes[k];
      if (action === "supprimer-site") {
        const nom = this.nomLigne(l);
        if (
          !confirm(
            `Supprimer « ${nom} » de ce dossier ?\n\nÀ réserver à un site saisi à tort : à l'enregistrement, ses réponses sont effacées de toutes les étapes du dossier et il ne sera plus proposé. Un site revenu à la normale se passe en RAS.`,
          )
        )
          return;
        const etab = etatSaisie.etabCourant ? etatSaisie.etabCourant.id : 0;
        (this.supprimes = this.supprimes || []).push({ k, l, _id: l._id, cle: this.cleSite(etab, l.valeurs) });
        this.lignes.splice(k, 1);
        this.dessiner();
        this.signaler();
        return;
      }
      if (action === "retirer-repris") {
        (this.retires = this.retires || []).push({ k, l });
        this.lignes.splice(k, 1);
        this.dessiner();
        this.signaler();
        return;
      }
      if (action === "corriger-site") {
        if (
          !confirm(
            "Corriger le site de cette ligne ?\n\nÀ réserver à une erreur de saisie : un site revenu à la normale reste dans le dossier, passez-le en RAS.",
          )
        )
          return;
        l._deverrouille = true;
        this.dessiner();
        const c = this.el.querySelectorAll(".ligne-rep")[k];
        const inp = c && c.querySelector(".site-txt");
        if (inp) inp.focus();
        return;
      }
      if (action === "confirmer-site") {
        if (l._repris) l._repris.etat = "confirme";
        this.majLignes();
        this.signaler();
        return;
      }
      if (action === "regenerer") {
        this.majAutos(l, b.closest(".ligne-rep"), b.dataset.sous);
        this.majLignes();
        this.signaler();
        const c = b.closest(".sous-champ").querySelector("textarea, input");
        if (c) c.focus();
        return;
      }
      if (action === "dupliquer") {
        const copie = {};
        for (const d of this.sousDefs)
          if (!d.confidentiel && !videSous(l.valeurs[d.colId]))
            copie[d.colId] = Array.isArray(l.valeurs[d.colId]) ? [...l.valeurs[d.colId]] : l.valeurs[d.colId];
        this.lignes.splice(k + 1, 0, { _id: nouvelIdLigne(), valeurs: copie, _touche: { ...(l._touche || {}) } });
      } else if (action === "ras-site" || (action === "supprimer" && this.sites && l._fixe)) {
        // un site ne se retire pas d'un dossier : il passe en RAS (retour à la normale)
        const d = this.sousDefs.find((x) => x.colId === this.sites.qualif),
          ras = this.valeurRas();
        if (d && ras) l.valeurs[d.colId] = typeBase(d.type) === "ChoiceList" ? [ras] : ras;
        if (l._repris) l._repris.etat = "modifie";
      } else if (action === "supprimer") {
        if (!this.ligneVide(l) && !confirm(`Supprimer la ligne ${k + 1} ?`)) return;
        this.lignes.splice(k, 1);
      }
      this.dessiner();
      this.signaler();
    });
    // champ du site : suggestions au fil de la frappe, choix à la souris ou au clavier
    el.addEventListener("focusin", (ev) => {
      if (ev.target.classList && ev.target.classList.contains("site-txt")) this.montrerSites(ev.target);
    });
    el.addEventListener("focusout", (ev) => {
      if (ev.target.classList && ev.target.classList.contains("site-txt"))
        setTimeout(() => {
          const ul = ev.target.closest(".site-combo") && ev.target.closest(".site-combo").querySelector(".site-sugg");
          if (ul) ul.hidden = true;
          ev.target.setAttribute("aria-expanded", "false");
        }, 150);
    });
    el.addEventListener("mousedown", (ev) => {
      const li = ev.target.closest(".site-sugg li[role=option]");
      if (li) {
        ev.preventDefault();
        this.choisirSite(li);
      }
    });
    el.addEventListener("keydown", (ev) => {
      if (!ev.target.classList || !ev.target.classList.contains("site-txt")) return;
      const ul = ev.target.closest(".site-combo").querySelector(".site-sugg"),
        lis = [...ul.querySelectorAll("li[role=option]")];
      const i = lis.findIndex((x) => x.getAttribute("aria-selected") === "true");
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
        ev.preventDefault();
        if (ul.hidden) this.montrerSites(ev.target);
        const j = Math.max(0, Math.min(lis.length - 1, i + (ev.key === "ArrowDown" ? 1 : -1)));
        lis.forEach((x, k) => x.setAttribute("aria-selected", String(k === j)));
        if (lis[j]) lis[j].scrollIntoView({ block: "nearest" });
      } else if (ev.key === "Enter" && !ul.hidden && i >= 0) {
        ev.preventDefault();
        this.choisirSite(lis[i]);
      } else if (ev.key === "Escape") {
        ul.hidden = true;
      }
    });
    const surSaisie = (ev) => {
      if (ev.target.classList.contains("qte")) return;
      if (ev.target.classList.contains("site-txt") && ev.type === "input") {
        delete ev.target.dataset.id;
        this.montrerSites(ev.target);
      }
      const sc = ev.target.closest(".sous-champ");
      if (sc) this.changement(sc);
    };
    el.addEventListener("input", surSaisie);
    el.addEventListener("change", surSaisie);
    el.addEventListener(
      "toggle",
      (ev) => {
        // un seul menu déroulant ouvert à la fois
        if (ev.target.matches && ev.target.matches(".multi[open]"))
          el.querySelectorAll(".multi[open]").forEach((x) => {
            if (x !== ev.target) x.open = false;
          });
      },
      true,
    );
  }
  // ----- table dédiée : réécriture des lignes d'un dossier
  async synchroniser(dossier, complet, t, lignesSource, avecConf = true, version = null) {
    if (!this.pret || !this.colDossier) return 0;
    t = t || (await Donnees.lire(this.table));
    if (this.colVersion && t[this.colVersion])
      return this.synchroniserVersions(dossier, complet, t, lignesSource, avecConf, version);
    const lignes = lignesSource || this.lignesValides();
    const existantes = t.id
      .map((id, i) => ({ id, d: t[this.colDossier][i], ligne: this.colLigne ? t[this.colLigne][i] : null }))
      .filter((x) => refId(x.d) === dossier || x.d === dossier);
    const parLigne = new Map(existantes.filter((x) => x.ligne).map((x) => [x.ligne, x]));
    const ops = grist.getTable(this.table);
    const champs = (l, k, seulementConf) => {
      const f = {};
      for (const d of this.sousDefs) {
        if (seulementConf && !d.confidentiel) continue;
        const vis = this.visible(l, d),
          v = vis ? l.valeurs[d.colId] : null;
        if (d.confidentiel && (!avecConf || (!this.confLisible && videSous(v)))) continue; // valeur non lue : conservée
        f[d.colId] = this.versGrist(d, v);
      }
      if (seulementConf) return f;
      f[this.colDossier] = dossier;
      if (this.colLigne) f[this.colLigne] = l._id;
      if (this.colOrdre) f[this.colOrdre] = k + 1;
      return f;
    };
    if (!complet) {
      // version qui ne devient pas la dernière : seules les données confidentielles des lignes existantes changent
      const maj = lignes
        .map((l) => parLigne.get(l._id) && { id: parLigne.get(l._id).id, fields: champs(l, 0, true) })
        .filter((x) => x && Object.keys(x.fields).length);
      if (maj.length && avecConf) await ops.update(maj);
      return maj.length;
    }
    const maj = [],
      ajout = [],
      gardees = new Set();
    lignes.forEach((l, k) => {
      const x = parLigne.get(l._id);
      if (x && !gardees.has(x.id)) {
        maj.push({ id: x.id, fields: champs(l, k) });
        gardees.add(x.id);
      } else ajout.push({ fields: champs(l, k) });
    });
    const suppr = existantes.filter((x) => !gardees.has(x.id)).map((x) => x.id);
    if (maj.length) await ops.update(maj);
    if (ajout.length) await ops.create(ajout);
    if (suppr.length) await ops.destroy(suppr);
    return maj.length + ajout.length + suppr.length;
  }
  /* ----- table historisée : copie des lignes pour une version du dossier
     version : la version écrite (création, mise à jour, correction, reconstruction) ; absente et complet = false :
     seules les données confidentielles des lignes de la version la plus récente changent (aucune nouvelle version). */
  async synchroniserVersions(dossier, complet, t, lignesSource, avecConf, version) {
    const ops = grist.getTable(this.table),
      cV = this.colVersion,
      cM = this.colMouvement && t[this.colMouvement] ? this.colMouvement : null;
    const lignes = lignesSource || this.lignesValides();
    const lignesT = t.id
      .map((id, i) => ({
        id,
        i,
        v: refId(t[cV][i]) || 0,
        ligne: this.colLigne ? t[this.colLigne][i] : null,
        m: cM ? t[cM][i] : null,
      }))
      .filter((x) => refId(t[this.colDossier][x.i]) === dossier || t[this.colDossier][x.i] === dossier);
    // versions connues du dossier (ordre de création)
    const cD = col("Dossier"),
      versionsDossier = etatSaisie.enregistrements
        .filter((l) => (refId(cD && l[cD]) || l.id) === dossier)
        .map((l) => l.id)
        .sort((a, b) => a - b);
    const plusRecente = Math.max(0, ...versionsDossier, ...lignesT.map((x) => x.v));
    let n = 0;
    // lignes d'avant l'historique (sans version) : rattachées à la version qui précède celle écrite (ou à la plus récente)
    const anciennes = lignesT.filter((x) => !x.v);
    if (anciennes.length) {
      const avant = version ? Math.max(0, ...versionsDossier.filter((v) => v < version)) : 0;
      const cible = avant || version || plusRecente || dossier;
      await ops.update(
        anciennes.map((x) => ({ id: x.id, fields: { [cV]: cible, ...(cM && !x.m ? { [cM]: "Ajout" } : {}) } })),
      );
      anciennes.forEach((x) => {
        x.v = cible;
        if (cM && !x.m) x.m = "Ajout";
      });
      n += anciennes.length;
    }
    const brut = (x, d) => (t[d.colId] ? t[d.colId][x.i] : undefined);
    const lisibleBrut = (v) => v !== undefined && !(Array.isArray(v) && v[0] === "C");
    // données confidentielles seules : lignes de la version la plus récente du dossier
    if (!version && !complet) {
      const vMax = Math.max(0, ...lignesT.map((x) => x.v)),
        parLigne = new Map(lignesT.filter((x) => x.v === vMax && x.m !== "Retrait").map((x) => [x.ligne, x]));
      const maj = lignes
        .map(
          (l) => parLigne.get(l._id) && { id: parLigne.get(l._id).id, fields: this.champsGrist(l, 0, true, avecConf) },
        )
        .filter((x) => x && Object.keys(x.fields).length);
      if (maj.length && avecConf) await ops.update(maj);
      return n + maj.length;
    }
    const v = version || plusRecente || dossier;
    const courantes = lignesT.filter((x) => x.v === v);
    const vPrec = Math.max(0, ...lignesT.filter((x) => x.v && x.v < v).map((x) => x.v));
    const prec = new Map(lignesT.filter((x) => x.v === vPrec && x.m !== "Retrait").map((x) => [x.ligne, x]));
    const norm = (x) =>
      x == null || x === "" || (Array.isArray(x) && x.length <= 1 && (x[0] === "L" || !x.length))
        ? null
        : JSON.stringify(x);
    const voulues = [];
    lignes.forEach((l, k) => {
      const f = this.champsGrist(l, k, false, avecConf),
        p = prec.get(l._id);
      // confidentiel non lu ou non écrit : repris de la version précédente
      if (p)
        for (const d of this.sousDefs)
          if (d.confidentiel && !(d.colId in f) && lisibleBrut(brut(p, d))) f[d.colId] = brut(p, d);
      const identique =
        p && this.sousDefs.filter((d) => !d.confidentiel).every((d) => norm(brut(p, d)) === norm(f[d.colId]));
      f[this.colDossier] = dossier;
      f[cV] = v;
      if (cM) f[cM] = !p ? "Ajout" : identique ? "Inchangée" : "Modification";
      voulues.push({ ligne: l._id, fields: f });
    });
    // lignes retirées depuis la version précédente : recopiées avec leurs dernières valeurs
    const gardes = new Set(lignes.map((l) => l._id));
    for (const [lid, p] of prec) {
      if (gardes.has(lid)) continue;
      const f = { [this.colDossier]: dossier, [cV]: v };
      if (this.colLigne) f[this.colLigne] = lid;
      if (this.colOrdre && t[this.colOrdre]) f[this.colOrdre] = t[this.colOrdre][p.i];
      for (const d of this.sousDefs) {
        const x = brut(p, d);
        if (lisibleBrut(x)) f[d.colId] = x;
      }
      if (cM) f[cM] = "Retrait";
      voulues.push({ ligne: lid, fields: f });
    }
    // lignes de cette version : mises à jour (correction), ajoutées, ou supprimées si elles n'ont plus lieu d'être
    const parLigne = new Map(courantes.filter((x) => x.ligne).map((x) => [x.ligne, x])),
      maj = [],
      ajout = [],
      gardees = new Set();
    for (const w of voulues) {
      const x = parLigne.get(w.ligne);
      if (x && !gardees.has(x.id)) {
        maj.push({ id: x.id, fields: w.fields });
        gardees.add(x.id);
      } else ajout.push({ fields: w.fields });
    }
    const suppr = courantes.filter((x) => !gardees.has(x.id)).map((x) => x.id);
    if (maj.length) await ops.update(maj);
    if (ajout.length) await ops.create(ajout);
    if (suppr.length) await ops.destroy(suppr);
    return n + maj.length + ajout.length + suppr.length;
  }
  // champs Grist d'une ligne saisie (seulementConf : les confidentiels seuls) ; un confidentiel non lu n'est pas écrit
  champsGrist(l, k, seulementConf, avecConf = true) {
    const f = {};
    for (const d of this.sousDefs) {
      if (seulementConf && !d.confidentiel) continue;
      const vis = this.visible(l, d),
        v = vis ? l.valeurs[d.colId] : null;
      if (d.confidentiel && (!avecConf || (!this.confLisible && videSous(v)))) continue;
      f[d.colId] = this.versGrist(d, v);
    }
    if (seulementConf) return f;
    if (this.colLigne) f[this.colLigne] = l._id;
    if (this.colOrdre) f[this.colOrdre] = k + 1;
    return f;
  }
  lignesDepuisJson(json) {
    return lireTableauJson(json)
      .map((o) => {
        const { _id, ...valeurs } = o;
        return { _id: _id || nouvelIdLigne(), valeurs };
      })
      .filter((l) => !this.ligneVide(l));
  }
}
const controleursTableau = (prefix) =>
  Object.values(tableaux).filter((c) => c.prefix === prefix && document.body.contains(c.el));
// Après enregistrement d'une version : réécrit les tables dédiées pour ce dossier
// version : ligne de la version écrite (tables historisées) ; sans elle et complet = false : confidentiels seuls
async function synchroniserTableaux(dossier, complet, version = null) {
  const erreurs = [];
  for (const c of controleursTableau("q")) {
    try {
      await c.synchroniser(dossier, complet, null, null, true, version);
    } catch (e) {
      erreurs.push(`table « ${c.table} » : ${e.message || e}`);
    }
  }
  return erreurs;
}
/* Sites supprimés du dossier (saisis à tort, 2.50) : après l'enregistrement, leurs lignes sont retirées de toutes les
   versions du dossier (colonne de la question et questions des formulaires précédents) et de la table dédiée (lignes
   de toutes les versions, retraits compris). Une ligne est visée par son identifiant (même corrigée entre-temps) ou par
   la clé de son site. */
async function purgerSitesSupprimes(dossier) {
  const erreurs = [];
  for (const c of controleursTableau("q")) {
    const sup = c.supprimes || [];
    if (!sup.length || !c.sites) continue;
    const etab =
      refId(val(etatSaisie.initiale, "Etablissement")) || (etatSaisie.etabCourant && etatSaisie.etabCourant.id) || 0;
    // un site encore présent dans le tableau (ressaisi sur une autre ligne) n'est visé que par l'identifiant de la ligne supprimée
    const gardees = new Set(
      c
        .lignesValides()
        .map((l) => c.cleSite(etab, l.valeurs))
        .filter(Boolean),
    );
    const ids = new Set(sup.map((x) => x._id).filter(Boolean)),
      cles = new Set(sup.map((x) => x.cle).filter((k) => k && !gardees.has(k)));
    const vise = (o, v) => (o._id && ids.has(o._id)) || cles.has(c.cleSite(etab, v || o));
    const cD = col("Dossier"),
      maj = [];
    for (const l of etatSaisie.enregistrements.filter((r) => (refId(cD && r[cD]) || r.id) === dossier)) {
      const f = {},
        filtrer = (colonne, vue) => {
          const a = lireTableauJson(l[colonne]),
            b = a.filter((o) => !vise(o, vue ? vue(o) : null));
          if (b.length !== a.length) f[colonne] = b.length ? JSON.stringify(b) : "";
        };
      filtrer(c.def.colId);
      for (const h of c.sites.historique || []) filtrer(h.colonne, (o) => c.vueHistorique(h, o));
      if (Object.keys(f).length) maj.push({ id: l.id, fields: f });
    }
    try {
      if (maj.length) await grist.getTable().update(maj);
    } catch (e) {
      erreurs.push(`suppression des sites dans les étapes du dossier : ${e.message || e}`);
    }
    if (c.pret && c.colDossier)
      try {
        const t = await Donnees.lire(c.table),
          suppr = [];
        t.id.forEach((id, i) => {
          if (refId(t[c.colDossier][i]) !== dossier && t[c.colDossier][i] !== dossier) return;
          const v = {};
          for (const d of c.sousDefs) if (t[d.colId]) v[d.colId] = t[d.colId][i];
          if ((c.colLigne && ids.has(t[c.colLigne][i])) || cles.has(c.cleSite(etab, v))) suppr.push(id);
        });
        if (suppr.length) await grist.getTable(c.table).destroy(suppr);
      } catch (e) {
        erreurs.push(`table « ${c.table} » (sites supprimés) : ${e.message || e}`);
      }
    c.supprimes = [];
    c.dessiner();
  }
  return erreurs;
}
// Réglages : reconstruit les tables dédiées à partir de la dernière version de chaque dossier ;
// table historisée : à partir de chaque version, dans l'ordre (tout l'historique, mouvements compris)
async function reconstruireTableaux() {
  const ctrl = controleursTableau("q").filter((c) => c.pret && c.colDossier);
  if (!ctrl.length) {
    statut("statut-tableaux", "Aucune question « tableau » associée au widget.", "err");
    return;
  }
  let n = 0;
  try {
    for (const c of ctrl) {
      const t = await Donnees.lire(c.table);
      if (c.colVersion && t[c.colVersion]) {
        const cD = col("Dossier");
        for (const l of etatSaisie.dossiersInit) {
          const vs = etatSaisie.enregistrements
            .filter((x) => (refId(cD && x[cD]) || x.id) === l.id)
            .sort((a, b) => a.id - b.id);
          for (const v of vs)
            n += await c.synchroniser(l.id, true, null, c.lignesDepuisJson(v[c.def.colId]), false, v.id);
        }
        continue;
      }
      for (const l of etatSaisie.dossiersInit) {
        const der = derniereDe(l);
        n += await c.synchroniser(l.id, true, t, c.lignesDepuisJson(der[c.def.colId]), false);
      }
    }
    statut(
      "statut-tableaux",
      `Tables reconstruites (${n} ligne(s) ajoutée(s), mise(s) à jour ou supprimée(s)). Les données confidentielles déjà saisies sont conservées.`,
      "ok",
    );
  } catch (e) {
    statut("statut-tableaux", `Échec : ${e.message || e}`, "err");
  }
}
document.addEventListener("click", (ev) => {
  // ferme les menus déroulants des tableaux au clic à l'extérieur
  document.querySelectorAll(".tableau-rep .multi[open]").forEach((x) => {
    if (!x.contains(ev.target)) x.open = false;
  });
});

const texteErreursTableaux = (e) => (e.length ? ` Attention, mise à jour incomplète de ${e.join(" ; ")}.` : "");
const confidentielsModifies = () => controleursTableau("q").some((c) => c.confModifie);
const finConfidentiels = () =>
  controleursTableau("q").forEach((c) => {
    c.confModifie = false;
  });
$("btn-reconstruire").addEventListener("click", () => enFile(reconstruireTableaux));
